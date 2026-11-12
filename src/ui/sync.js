/*
 * Keeps an open workspace on the server: uploaded smeta files, the assembled
 * state (project order, sheet toggles, names, prices, document options), one
 * `corrections` row per changed price, and every exported workbook.
 * Wraps a handful of App methods instead of editing app.js.
 */
(function (S) {
  'use strict';
  if (!S.pb) return;

  var SAVE_MS = 1500;
  var CORRECT_MS = 700;                 // quiet time before a typed price is written
  var BULK = 1000;                      // corrections per request; the server caps it at 3000
  var RETRY_MS = 10000;                 // before trying a refused batch again
  var XLSX_RE = /\.xlsx?$|\.xlsm$/i;
  // what the server allows a workspace to hold (server/pb_schema.json, workspaces.files): known here so that it is
  // said in words before the server is asked, not read out of its refusal
  var MAX_FILES = 30, MAX_MB = 60;
  var UPLOAD_RETRY_MS = 15 * 1000;
  // Stamped into the saved state. 2 = resource keys built by the name key that
  // repairs half-switched keyboard layouts; anything older is lifted onto it
  // once, on the next open. Bump this whenever S.nameKey changes again.
  var KEYS = 2;
  // A price is kept in this browser from the moment it is set until the server has it inside the saved state.
  var WAL = 'smeta.wal.';               // + workspace id
  var WAL_DAYS = 30;                    // what was kept for an application nobody came back to is dropped after this
  var KEEP_MAX = 30 * 1024;             // a request that must outlive the page may be this large (the browser allows 64 KB for all of them together)
  var SAVE_RETRY_MS = 15 * 1000;
  // The server takes a state of 5 MB and no more (server/pb_schema.json, workspaces.state). What is saved is
  // kept under this, with room for the request around it.
  var STATE_MAX = 4 * 1024 * 1024;

  function $(id) { return document.getElementById(id); }
  function A() { return window.app; }
  function wrap(proto, name, after) {
    var orig = proto[name];
    proto[name] = function () {
      var r = orig.apply(this, arguments);
      try { after.apply(this, arguments); } catch (e) { console.error('sync:' + name, e); }
      return r;
    };
  }

  var Sync = {
    ws: null, app: null, files: {}, corr: {}, q: Promise.resolve(), loading: false, dirty: false,
    pend: {}, ct: 0,        // prices typed but not yet written; see correctSoon()
    cmp: {},                // «Сравнение версий»: the files chosen there (slot → { name, id }) and its «Было»
    seq: 0,                 // which open() is the current one; see open()
    unsaved: {},            // file name -> { file, why, retry }: estimates on screen whose file is not on the server
    frozen: false,          // this application was opened in another tab after this one: nothing is saved from here
    read: [],               // files of the batch being read that have given a project and are to be stored
    wal: {}, walN: 0,       // prices not yet inside a saved state: key -> { v, t, n, s }; see «kept in the browser»
    mine: {},               // keys whose price was set in this sitting
    busy: 0,                // requests of the queue that have not been answered
    saveRetry: SAVE_RETRY_MS,

    init: function () {
      document.addEventListener('notes:change', function () { Sync.touch(); });
      document.addEventListener('checked:change', function () { if (!Sync.loading) Sync.touch(); });
      // the document of an application is named after it: its number and its contractor (E19)
      var baseOf = S.App.prototype.exportBase;
      S.App.prototype.exportBase = function () {
        var a = Sync.ws && Sync.app;
        if (!a) return baseOf.apply(this, arguments);
        var c = a.expand && a.expand.contragent;
        return 'Zayavka_' + a.number + ((c && c.name) || a.org_name ? '_' + ((c && c.name) || a.org_name) : '');
      };
      var self = this;
      var P = S.App.prototype;
      wrap(P, 'rebuild', function () { self.touch(); });
      wrap(P, 'saveOpts', function () { self.touch(); });
      wrap(P, 'setPrice', function (key, value) {
        var one = {};
        one[key] = value;
        self.touch(); self.priceSet(key); self.keep(one); self.correctSoon(key, value);
      });
      wrap(P, 'setPrices', function (map) {
        self.touch();
        Object.keys(map).forEach(function (k) { self.priceSet(k); });
        self.keep(map);
        Object.keys(map).forEach(function (k) { self.correctSoon(k, map[k]); });
      });
      // Leaving the field is the moment the number is finished being typed.
      ['priceScroll', 'sheetScroll'].forEach(function (id) {
        var sc = $(id);
        if (sc) sc.addEventListener('focusout', function () { self.flush(); });
      });
      // A file is stored once it has been read and has given a project, and the files of one batch go up
      // together. Stored at the moment it was picked, as it used to be, a file that could not be read or was no
      // estimate went to the server first and was taken off it again a moment later.
      wrap(P, 'fileRead', function (file) { self.read.push(file); });
      wrap(P, 'onParsed', function () {
        if (this.pending > 0) return;
        var files = self.read;
        self.read = [];
        if (self.loading) self.restore(); else if (files.length) self.upload(files);
      });
      var build = S.buildWorkbook;
      S.buildWorkbook = function (model, opts) {
        var bytes = build(model, opts);
        self.saveExport(bytes, opts);
        return bytes;
      };
      document.addEventListener('cmp:file', function (e) { self.compareFile(e.detail.slot, e.detail.file); });
      document.addEventListener('cmp:base', function (e) { if (self.ws && !self.loading) { self.cmp.base = e.detail.base || ''; self.touch(); } });
      $('projects').addEventListener('input', function () { self.touch(); });
      $('reportMode').addEventListener('change', function () { self.touch(); });
      this.listen();
      this.walSweep();
      window.addEventListener('beforeunload', function (e) {
        self.leave();
        // an estimate whose file is not on the server would not be there after the reload: the browser asks
        if (self.ws && !self.frozen && self.hasUnsaved()) { e.preventDefault(); e.returnValue = ''; }
      });
      window.addEventListener('pagehide', function () { self.leave(); });
      // put out of sight — another tab, another window: saved now rather than when the timers get to it
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'hidden' || !self.ws || self.loading || self.frozen) return;
        self.flush();
        if (self.dirty) self.saveNow().catch(function () { /* said by saveNow, and retried */ });
      });
    },

    /* ------------------------------------------------------------- open */
    /**
     * Opening a workspace fetches its corrections and its uploaded files, and
     * a person browsing the registry can start a second one before the first
     * has arrived. Each open takes a number; an answer that belongs to an
     * earlier one is thrown away rather than dropped on top of the workspace
     * now on screen.
     */
    open: function (w, a) {
      var self = this;
      var mine = ++this.seq;
      var current = function () { return self.seq === mine; };
      this.ws = w; this.app = a;
      S.hashSet('ws', w.id);
      this.files = (w.state && w.state.files) || {};
      var sc = (w.state && w.state.compare) || {};
      this.cmp = { old: sc.old || null, new: sc.new || null, reply: sc.reply || null, base: sc.base || '' };
      this.corr = {};
      this.unsaved = {};
      clearTimeout(this.ut);
      this.loading = true;
      this.wal = this.walRead(w.id);
      this.walN = Object.keys(this.wal).reduce(function (m, k) { return Math.max(m, +self.wal[k].n || 0); }, 0);
      this.mine = {};
      this.restoredOnly = false;
      this.savedOnOpen = w.updated || '';      // the server's own clock: corrections are compared with it
      this.corrReady = false; this.merged = false;
      var app = A();
      app.projects = []; app.prices = {}; app.pct = {}; app.notes = {}; app.checked = {}; app.looseBook = null; app.spareBook = null; app.queue = [];
      this.refused = ''; this.cutSaid = 0;
      app.rebuild(); app.renderSide();
      this.renderBox();
      this.announce(w);
      document.dispatchEvent(new CustomEvent('ws:open', { detail: w }));

      var by = w.expand && w.expand.updated_by;
      if (by && by.id !== S.me().id && Date.now() - new Date(w.updated).getTime() < 10 * 60000) {
        app.toast((by.name || by.email) + ' только что работал(а) с этой заявкой — при одновременной работе побеждает последнее сохранение', true);
      }

      this.corrList = [];
      this.marks = {};
      S.pb.collection('corrections').getFullList({ filter: S.pb.filter('workspace = {:w}', { w: w.id }), fields: 'id,res_key,market_price,source,updated' })
        .then(function (list) {
          if (!current()) return;
          self.corrList = list;
          self.indexCorr();
          self.corrReady = true;
          self.mergeCorr();
        }).catch(function (e) {
          if (current()) app.toast('Правки не загружены: ' + S.pbErr(e), true);
        });

      var st = w.state || {};
      var wanted = (st.projects || []).map(function (p) { return { name: p.file, id: p.fileId }; })
        .filter(function (f) { return f.id && (w.files || []).indexOf(f.id) >= 0; });
      if (!wanted.length) { this.restore(); return; }
      app.busy(true, 'Получение файлов с сервера…');
      Promise.all(wanted.map(function (f) {
        return S.fileURL(w, f.id).then(function (u) { return fetch(u); }).then(function (r) {
          if (!r.ok) throw new Error(f.name + ': ' + r.status);
          return r.blob();
        }).then(function (b) { return new File([b], f.name, { type: b.type }); });
      })).then(function (files) {
        if (!current()) return;               // another application was opened meanwhile
        app.addFiles(files);                  // upload is skipped while loading
      }).catch(function (e) {
        if (!current()) return;
        app.busy(false);
        app.toast('Не удалось получить файлы: ' + (e.message || e), true);
        self.restore();
      });
    },

    /**
     * Prices are stored under a key built from the resource name, and the name
     * key learned to repair half-switched keyboard layouts. A workspace saved
     * by the older page therefore carries keys the live rows no longer answer
     * to. This maps the old key of every live row onto its new one, so an
     * upgrade never drops a price somebody already typed in.
     *
     * Only keys that no live row already owns are moved, so running it on
     * an already-current workspace changes nothing.
     */
    keyMap: function () {
      var app = A();
      if (!app.model || !S.resKeyV1) return null;
      var live = {}, map = null;
      app.model.resources.forEach(function (r) { live[r.key] = 1; });
      app.model.resources.forEach(function (r) {
        var old = S.resKeyV1(r.name, r.unit || '', r.price == null ? 0 : r.price);
        if (old === r.key || live[old]) return;
        (map = map || {})[old] = r.key;
      });
      return map;
    },

    /** `map` keyed by resource key, rebuilt onto the keys the live rows use. */
    reindex: function (map) {
      var m = this.keyMap();
      if (!m) return { map: map, moved: 0 };
      var out = {}, moved = 0;
      Object.keys(map).forEach(function (k) {
        var to = m[k];
        if (to && out[to] === undefined) { out[to] = map[k]; moved++; }
        else out[k] = map[k];
      });
      return { map: out, moved: moved };
    },

    /**
     * The same prices written the way the previous version of the page keyed
     * them. It is saved alongside the current map so that going back to that
     * version — if this one turns out to be wrong somewhere — loses nothing:
     * the old page reads `prices`, this one reads `prices2`.
     *
     * Lossless in this direction, because the new key never splits what the
     * old one joined: two live rows can never share one old key.
     */
    downgrade: function (map) {
      var app = A();
      if (!app.model || !S.resKeyV1) return map;
      var back = {};
      app.model.resources.forEach(function (r) {
        back[r.key] = S.resKeyV1(r.name, r.unit || '', r.price == null ? 0 : r.price);
      });
      var out = {};
      Object.keys(map).forEach(function (k) { out[back[k] || k] = map[k]; });
      return out;
    },

    /** Server corrections, keyed the way the live rows are keyed. */
    indexCorr: function () {
      var raw = {};
      (this.corrList || []).forEach(function (c) { raw[c.res_key] = { id: c.id, market: c.market_price, source: c.source || '', updated: c.updated || '' }; });
      this.corr = this.reindex(raw).map;
    },

    /** Apply the saved state to the freshly parsed projects, then go live. */
    restore: function () {
      var app = A();
      var st = (this.ws && this.ws.state) || {};
      var byFile = {};
      app.projects.forEach(function (p) { byFile[p.file] = p; });
      var ordered = [];
      (st.projects || []).forEach(function (sp) {
        var p = byFile[sp.file];
        if (!p) return;
        p.name = sp.name || p.name; p.intro = sp.intro != null ? sp.intro : p.intro;
        p.enabled = sp.enabled !== false; p.open = sp.open !== false;
        var byName = {};
        p.objects.forEach(function (o) { byName[o.name] = o; });
        var objs = [];
        (sp.objects || []).forEach(function (so) {
          var o = byName[so.name];
          if (!o) return;
          o.enabled = so.enabled !== false;
          objs.push(o); delete byName[so.name];
        });
        Object.keys(byName).forEach(function (k) { objs.push(byName[k]); });
        p.objects = objs;
        ordered.push(p); delete byFile[p.file];
      });
      Object.keys(byFile).forEach(function (k) { ordered.push(byFile[k]); });
      app.projects = ordered;
      // this application's settings, or the defaults — never the ones of the application opened before it
      app.resetOpts(st.opts);
      $('reportMode').value = st.mode || 'changed';
      app.looseBook = st.looseBook || null;
      app.spareBook = st.book || null;
      app.rebuild(); app.renderSide();
      // `prices2` is this version's keying; `prices` is the previous one's, kept
      // so a workspace saved here can still be opened by the older page.
      var saved = (st.keys === KEYS && st.prices2) ? st.prices2 : st.prices;
      if (saved && Object.keys(saved).length) {
        var r = (st.keys === KEYS && st.prices2) ? { map: saved, moved: 0 } : this.reindex(saved);
        app.setPrices(r.map);
        // the prices «Применить %» set stay free for the next percentage; any other price is the expert's
        if (st.keys === KEYS && st.prices2 && Array.isArray(st.pct)) st.pct.forEach(function (k) { if (r.map[k] != null) app.pct[k] = 1; });
        if (r.moved) { this.dirty = true; app.toast('Цены перенесены на обновлённые названия ресурсов: ' + r.moved); }
      }
      // the expert's own notes on resources (E17), under this version's keys
      if (st.notes && typeof st.notes === 'object') app.notes = st.keys === KEYS ? Object.assign({}, st.notes) : this.reindex(st.notes).map;
      if (st.checked && typeof st.checked === 'object') { app.checked = st.keys === KEYS ? Object.assign({}, st.checked) : this.reindex(st.checked).map; app.prices_ui.status(); app.prices_ui.list.refresh(); }
      this.indexCorr();
      var remapped = this.dirty;
      this.loading = false; this.dirty = false;
      app.busy(false);
      this.renderBox();
      if (remapped) this.touch();          // write the workspace back under the new keys
      if (app.projects.length) app.toast('Рабочая область восстановлена: файлов ' + app.projects.length);
      this.replay();
      this.mergeCorr();
      this.restoreCompare();
    },

    /* ----------------------------------------------- kept in the browser */
    /*
     * A price goes to the server twice — as a correction, and inside the saved state the table and the document
     * are built from — and the second request used to wait for the answer to the first. A tab closed a third of
     * a second after a price was typed, over a link slower than this machine's own, sent the correction and never
     * the state: the price was gone from the table, and still offered to other projects as an expert's price.
     *
     * Three things hold it now, each enough by itself.
     *
     *   keep()      every price set is written to this browser's own storage at once, and let go when a saved
     *               state that contains it has been acknowledged. Opening the application here again puts back
     *               what is newer than the state the server holds: a closed tab, a crashed browser, the power.
     *   leave()     on the way out both requests are made at once, beside whatever is still on its way, and
     *               marked to outlive the page when they are small enough for the browser to allow that.
     *   mergeCorr() a correction of this application written after its state was last saved is a price the
     *               state has missed: it is put back, in any browser.
     */
    walRead: function (id) {
      try {
        var o = JSON.parse(localStorage.getItem(WAL + id) || '{}');
        return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
      } catch (e) { return {}; }
    },
    walWrite: function () {
      if (!this.ws) return;
      try {
        if (Object.keys(this.wal).length) localStorage.setItem(WAL + this.ws.id, JSON.stringify(this.wal));
        else localStorage.removeItem(WAL + this.ws.id);
      } catch (e) { /* storage full or switched off: the two requests are made all the same */ }
    },
    /** Prices just set (`map`: key -> value), kept until a saved state carries them. */
    keep: function (map) {
      if (!this.ws || this.loading || this.frozen) return;
      var self = this, now = Date.now();
      Object.keys(map).forEach(function (k) {
        var from = self.priceSource(k, map[k]);
        self.wal[k] = { v: map[k], t: now, n: ++self.walN };
        if (from) self.wal[k].s = from.source;
        self.mine[k] = 1;
      });
      this.walWrite();
    },
    /** A state built when the counter stood at `upto` is on the server: what it carries is let go. */
    walAck: function (id, upto) {
      if (!this.ws || this.ws.id !== id) return;
      var self = this, n = 0;
      Object.keys(this.wal).forEach(function (k) { if (!(self.wal[k].n > upto)) { delete self.wal[k]; n++; } });
      if (n) this.walWrite();
    },
    /** What was kept for applications nobody came back to. */
    walSweep: function () {
      try {
        var old = Date.now() - WAL_DAYS * 24 * 3600 * 1000, drop = [];
        for (var i = 0; i < localStorage.length; i++) {
          var name = localStorage.key(i);
          if (name.indexOf(WAL) !== 0) continue;
          var o = this.walRead(name.slice(WAL.length));
          var newest = Object.keys(o).reduce(function (m, k) { return Math.max(m, +o[k].t || 0); }, 0);
          if (newest < old) drop.push(name);
        }
        drop.forEach(function (name) { localStorage.removeItem(name); });
      } catch (e) { /* no storage */ }
    },
    /** The price a key stands at now: the one set for it, else the estimate's own. */
    standing: function (key) {
      var app = A(), v = app.prices[key];
      if (v != null) return v;
      var rs = (app.model && app.model.resources) || [];
      for (var i = 0; i < rs.length; i++) if (rs[i].key === key) return rs[i].price;
      return null;
    },
    /** Opening: what this browser kept and the server's state does not have. */
    replay: function () {
      var self = this, app = A(), st = (this.ws && this.ws.state) || {};
      var at = st.savedAt ? Date.parse(st.savedAt) || 0 : 0, map = {}, n = 0, dropped = 0;
      Object.keys(this.wal).forEach(function (k) {
        var e = self.wal[k], cur = e && typeof e.v === 'number' && e.t > at ? self.standing(k) : null;
        // older than the saved state (the state has it, or something newer), or the same as what is shown
        if (!e || typeof e.v !== 'number' || !(e.t > at) || (cur != null && S.near(cur, e.v))) { delete self.wal[k]; dropped++; return; }
        map[k] = e.v; n++;
        if (e.s) self.markSource(k, e.v, e.s);
      });
      if (dropped) this.walWrite();
      if (n) this.putBack(map, 'Восстановлены цены, которые не успели сохраниться на сервере: ' + n);
    },
    /**
     * Opening: corrections of this application that are newer than its saved state. Both times are the server's.
     * A price set in this sitting is left alone — the correction may be the one it has just replaced.
     */
    mergeCorr: function () {
      if (this.merged || this.loading || !this.corrReady || !this.ws) return;
      this.merged = true;
      var self = this, app = A(), since = this.savedOnOpen, map = {}, n = 0;
      if (!since || !app.model) return;
      app.model.resources.forEach(function (r) {
        var c = self.corr[r.key];
        if (!c || !(c.updated > since) || self.mine[r.key] || c.market == null || S.near(r.market, c.market)) return;
        map[r.key] = c.market; n++;
        if (c.source && c.source !== 'typed') self.markSource(r.key, c.market, c.source);
      });
      if (n) this.putBack(map, 'Восстановлены цены из правок этой заявки, которых не было в сохранённом состоянии: ' + n);
    },
    putBack: function (map, text) {
      var clean = !this.dirty;
      this.restoring = true;
      try { A().setPrices(map); } finally { this.restoring = false; }
      // nothing here is the person's own doing: see the «released» message of another tab
      if (clean) this.restoredOnly = true;
      A().toast(text);
    },
    /**
     * The page is going. Everything waiting is sent at once — not behind the request in front of it, whose answer
     * the page will not live to see.
     */
    leave: function () {
      var self = this, ws = this.ws;
      if (!ws || this.loading || this.frozen) return;
      if (!this.dirty && !Object.keys(this.pend).length) return;
      var behind = this.busy > 0;
      this.leaving = true;
      try {
        this.flush();
        if (this.dirty) this.saveNow().catch(function () { /* said by saveNow, and retried if the page stays */ });
      } finally { this.leaving = false; }
      // the page stayed after all, and a state sent before this one was still on its way: whichever arrived last
      // is the one kept, so the state is sent once more in its turn
      if (behind) this.q.then(function () { if (self.ws === ws && !self.frozen) self.touch(); });
    },
    small: function (body) {
      try { return new Blob([JSON.stringify(body)]).size <= KEEP_MAX; } catch (e) { return false; }
    },

    /* ---------------------------------------------------------- compare */
    /*
     * The returned smeta, our reply and a first version given as a file are read on the
     * «Сравнение версий» tab without becoming projects — so nothing above keeps them. They are
     * stored among the workspace's files all the same, and `state.compare` says which stored file
     * is which. The previous version of the page reads neither: it opens such a workspace as
     * before, with the comparison empty.
     */
    compareFile: function (slot, file) {
      var self = this, app = A(), ws = this.ws;
      if (!ws || this.loading || this.frozen) return;
      this.enqueue(function () {
        if (self.ws !== ws) return;
        var was = self.cmp[slot], had = {};
        (ws.files || []).forEach(function (n) { had[n] = 1; });
        var drop = was && had[was.id] ? was.id : null;
        if (!file && !drop) { self.cmp[slot] = null; return; }
        var fd = new FormData();
        if (file) fd.append('files+', file);
        if (drop) fd.append('files-', drop);
        return S.pb.collection('workspaces').update(ws.id, fd).then(function (w) {
          // which stored file is the new one: read inside the queue, like upload() does
          var added = (w.files || []).filter(function (n) { return !had[n]; });
          ws.files = w.files;
          self.cmp[slot] = file && added[0] ? { name: file.name, id: added[0] } : null;
        }).catch(function (e) {
          app.toast('Файл сравнения не сохранён на сервере: ' + S.pbErr(e), true);
        });
      }).then(function () {
        if (self.ws === ws) return self.saveNow();      // said at once: a reload may be a second away
      }).catch(function () { /* saveNow has said why, and retries */ });
    },

    /** After the projects are back: fetch what the comparison had and hand it over. */
    restoreCompare: function () {
      var self = this, app = A(), ws = this.ws, c = this.cmp, mine = this.seq;
      if (!ws || !app.compare_ui) return;
      var slots = ['old', 'new', 'reply'].filter(function (k) { return c[k] && c[k].id && (ws.files || []).indexOf(c[k].id) >= 0; });
      if (!slots.length) { if (c.base) app.compare_ui.restore({ base: c.base }, {}); return; }
      Promise.all(slots.map(function (k) {
        return S.fileURL(ws, c[k].id).then(function (u) { return fetch(u); }).then(function (r) {
          if (!r.ok) throw new Error(c[k].name + ': ' + r.status);
          return r.blob();
        }).then(function (b) { return new File([b], c[k].name, { type: b.type }); });
      })).then(function (got) {
        if (self.seq !== mine) return;                  // another application was opened meanwhile
        var files = {};
        slots.forEach(function (k, i) { files[k] = got[i]; });
        app.compare_ui.restore({ base: c.base }, files);
      }).catch(function (e) {
        if (self.seq === mine) app.toast('Файлы сравнения не получены: ' + (e.message || e), true);
      });
    },

    /* ------------------------------------------------------- two tabs */
    /*
     * One application in two tabs of one browser. Every save writes the whole state, so the tab that saved last
     * won: a price set in one tab was wiped by the next save of the other, both showed a green «✓», and nothing
     * said so until a reload. It happens without anybody meaning it — the launcher opens a new tab at every start.
     *
     * The tabs now talk (BroadcastChannel; a browser without it works as before). A tab that opens an
     * application says so. A tab that already has it open saves what it has not saved yet, answers, and stops:
     * it is covered by a notice with one way on — «Обновить и работать здесь», which reloads it and makes it the
     * one that works. The newer tab, told that the older one had something unsaved, reads the application again.
     * So there is one working tab at a time, the newest, and nothing typed in the other is lost on the way.
     *
     * Two people in two browsers are not helped by this: that needs the server to refuse a stale save.
     */
    listen: function () {
      var self = this;
      if (typeof BroadcastChannel === 'undefined') return;
      this.tab = Math.random().toString(36).slice(2);
      this.bc = new BroadcastChannel('smeta-workspace');
      this.bc.onmessage = function (e) {
        var m = e.data || {}, ws = self.ws;
        if (!ws || m.tab === self.tab || m.ws !== ws.id || self.frozen) return;
        if (m.type === 'open') {
          // only a tab that opened it after this one supersedes it: two tabs restored together must not stop each other
          if (!(m.at > self.openedAt || (m.at === self.openedAt && m.tab > self.tab))) return;
          var had = self.dirty || Object.keys(self.pend).length > 0;
          self.flush();
          var done = self.dirty ? self.saveNow() : self.q;
          self.freeze();
          Promise.resolve(done).catch(function () { /* said by saveNow */ }).then(function () {
            self.bc.postMessage({ type: 'released', ws: ws.id, tab: self.tab, changed: had });
          });
        } else if (m.type === 'released' && m.changed) {
          // the older tab has just written something this tab opened without
          if ((self.dirty && !self.restoredOnly) || self.hasUnsaved()) {
            A().toast('В другой вкладке были несохранённые правки этой заявки. Обновите страницу, чтобы увидеть их.', true);
          } else location.reload();
        }
      };
    },
    announce: function (w) {
      this.thaw();
      this.openedAt = Date.now();
      if (this.bc) this.bc.postMessage({ type: 'open', ws: w.id, tab: this.tab, at: this.openedAt });
    },
    freeze: function () {
      var self = this, box = $('wsFrozen');
      this.frozen = true;
      clearTimeout(this.t); clearTimeout(this.ct); clearTimeout(this.ut);
      if (!box) return;
      box.hidden = false;
      $('wsFrozenHere').onclick = function () { location.reload(); };
      $('wsFrozenList').onclick = function () { self.close(true); };
    },
    thaw: function () {
      this.frozen = false;
      var box = $('wsFrozen');
      if (box) box.hidden = true;
    },

    /* ------------------------------------------------------------- save */
    touch: function () {
      if (!this.ws || this.loading || this.frozen) return;
      if (!this.restoring) this.restoredOnly = false;
      this.dirty = true;
      this.mark('●');
      clearTimeout(this.t);
      var self = this;
      this.t = setTimeout(function () { self.saveNow(); }, SAVE_MS);
    },

    /**
     * The prices that go into the saved state.
     *
     * Every key ever touched used to be saved, twice (see downgrade()): a price put back to the estimate's own
     * stayed, «Сбросить» made nothing smaller, and a price book left every one of its lines there whether or not
     * the estimates had such a resource. Past 5 MB the server refuses the state, and it was the same request
     * again every fifteen seconds from then on, with nothing typed afterwards saved.
     *
     * Saved now: a price that differs from the estimate's own, and the price of a resource that is not on
     * screen at the moment (a sheet unticked for a while keeps its prices). A price equal to the estimate's
     * own says nothing the estimate does not — except where a price book has a line for that resource: there
     * it is the expert's «no, the estimate's price», and it is kept so that the book does not come back over it.
     */
    savedPrices: function () {
      var app = A(), out = {}, live = {}, loose = app.looseBook, spare = app.spareBook;
      if (!app.model) return app.prices;
      app.model.resources.forEach(function (r) { live[r.key] = r; });
      Object.keys(app.prices).forEach(function (k) {
        var v = app.prices[k], r = live[k];
        if (v == null) return;
        if (r && S.near(r.price, v) && !((loose && loose[r.nk] != null) || (spare && spare[k] != null))) return;
        out[k] = v;
      });
      return out;
    },

    /**
     * A state the server will take. The one part that can outgrow it is a price book's lines that answer to no
     * resource of the estimates loaded — kept so that an estimate added later is priced from the book. When they
     * do not fit, the first of them are saved and it is said once; in this sitting the whole book goes on working.
     */
    fit: function (st) {
      var size = function (o) { return new Blob([JSON.stringify(o)]).size; };
      var over = size(st) - STATE_MAX, cut = 0;
      ['book', 'looseBook'].forEach(function (name) {
        var b = st[name];
        if (over <= 0 || !b) return;
        var keys = Object.keys(b), had = size(b);
        var keepN = had - over < 64 ? 0 : Math.floor(keys.length * (had - over) / had * 0.97);
        var kept = {};
        keys.slice(0, keepN).forEach(function (k) { kept[k] = b[k]; });
        st[name] = keepN ? kept : null;
        cut += keys.length - keepN;
        over -= had - (keepN ? size(kept) : 4);
      });
      if (cut && cut !== this.cutSaid) {
        A().toast('Книга цен велика для заявки: ' + cut + ' её строк, которым нет соответствия в загруженных сметах, ' +
          'не сохранены на сервере. Цены, поставленные в сметы, сохранены. Добавив новые сметы, загрузите книгу ещё раз.', true);
      }
      this.cutSaid = cut;
      return st;
    },

    state: function () {
      var app = A(), self = this, prices = this.savedPrices();
      return {
        projects: app.projects.map(function (p) {
          return {
            file: p.file, fileId: self.files[p.file] || null, name: p.name, title: p.title, intro: p.intro,
            enabled: p.enabled !== false, open: p.open !== false,
            objects: p.objects.map(function (o) { return { name: o.name, enabled: o.enabled !== false }; })
          };
        }),
        files: this.files,
        prices: this.downgrade(prices),       // readable by the previous version
        prices2: prices,
        pct: Object.keys(prices).filter(function (k) { return app.pct && app.pct[k]; }),
        notes: app.notes && Object.keys(app.notes).length ? app.notes : undefined,
        checked: app.checked && Object.keys(app.checked).length ? app.checked : undefined,
        looseBook: app.looseBook || null,
        book: app.spareBook || null,
        compare: { old: this.cmp.old || null, new: this.cmp.new || null, reply: this.cmp.reply || null, base: this.cmp.base || '' },
        opts: app.opts,
        mode: $('reportMode').value,
        keys: KEYS,
        savedAt: new Date().toISOString()
      };
    },

    saveNow: function () {
      var self = this, app = A();
      if (!this.ws || this.loading || this.frozen) return Promise.resolve();
      this.flush();
      clearTimeout(this.t);
      var upto = this.walN, id = this.ws.id;
      var st = this.fit(this.state());
      var live = {};
      app.projects.forEach(function (p) { live[p.file] = 1; });
      this.renderUnsaved();     // a held file whose project was taken off the list is no longer waited for
      var stale = Object.keys(this.files).filter(function (n) { return !live[n]; }).map(function (n) { return self.files[n]; });
      Object.keys(this.files).forEach(function (n) { if (!live[n]) delete self.files[n]; });
      st.files = this.files;
      var changed = app.model ? app.model.resources.filter(function (r) { return !S.near(r.price, r.market); }).length : 0;
      var body = { state: st, changed: changed, updated_by: S.me().id };
      if (stale.length) body['files-'] = stale;
      this.dirty = false;
      return this.enqueue(function () {
        var ws = self.ws;
        if (!ws || ws.id !== id) return;            // closed while this waited its turn
        var how = self.leaving && self.small(body) ? { keepalive: true } : undefined;
        return S.pb.collection('workspaces').update(id, body, how).then(function (w) {
          if (self.ws !== ws) return;
          ws.updated = w.updated; ws.files = w.files; ws.changed = w.changed;
          self.refused = '';
          self.walAck(id, upto);
          self.mark('✓');
        }).catch(function (e) {
          if (self.ws !== ws) throw e;
          self.dirty = true;
          self.mark('!');
          clearTimeout(self.t);
          // no server at all: said once, in a bar that stays; the probe saves when it is back (E20)
          if (self.isNet(e)) { self.down(); return; }
          if (e && (e.status === 400 || e.status === 413)) {
            // The server has read the state and will not take it; the same state would be refused the same way.
            // It used to be sent again every fifteen seconds for as long as the page stayed open. Nothing is
            // repeated now: the next change is the next attempt.
            var why = e.response && e.response.data && e.response.data.state ? 'объём данных заявки больше допустимого'
              : S.pbErr(e);
            self.refused = why;
            app.toast('Заявка не сохранена: сервер не принимает её данные (' + why + '). Повторять нет смысла — ' +
              'следующая попытка будет после следующего изменения. Цены при этом записаны как правки и хранятся в этом браузере.', true);
          } else {
            app.toast('Не сохранено: ' + S.pbErr(e) + ' — повтор через ' + Math.round(self.saveRetry / 1000) + ' секунд', true);
            self.t = setTimeout(function () { if (self.dirty) self.saveNow().catch(function () { /* said above */ }); }, self.saveRetry);
          }
          throw e;      // whoever is leaving the workspace needs to know it failed
        });
      });
    },

    /**
     * Saves run one after another. The queue itself must never break — a failed
     * save is retried on a timer, not by stopping everything behind it — so the
     * chain swallows the rejection, and the caller is handed the attempt's own
     * promise, which does not.
     */
    enqueue: function (fn) {
      var self = this, attempt, before = this.q;
      var done = function () { self.busy--; };
      this.busy++;
      if (this.leaving) {
        // see leave(): made now, beside what is on its way
        try { attempt = Promise.resolve(fn()); } catch (e) { attempt = Promise.reject(e); }
        this.q = Promise.all([before, attempt.catch(function () { /* the retry timer owns this */ })]);
      } else {
        attempt = before.then(fn, fn);
        this.q = attempt.catch(function () { /* the retry timer owns this */ });
      }
      attempt.then(done, done);
      return attempt;
    },

    /* ----------------------------------------------------------- files */
    /*
     * An estimate is on screen the moment it is read; it is in the workspace only when its file is on the server.
     * Between the two the upload can fail — the thirty-first file, a file too large, the link dropping for a
     * second — and that used to be one message, gone under the next one, after which the estimate sat in the list
     * under a green «✓», took prices, and was not there after a reload.
     *
     * A file that has not been stored is now kept in `unsaved` with the reason: the mark stays «!», a line over
     * the list of projects names the file and offers to try again, a failure of the link is retried by itself,
     * and leaving the application asks first.
     */
    upload: function (files) {
      var self = this, app = A();
      if (!this.ws || this.loading || this.frozen) return;
      files = files.filter(function (f) { return XLSX_RE.test(f.name); });
      if (!files.length) return;
      var ws = this.ws;
      /*
       * Which stored file belongs to which estimate is worked out by comparing
       * the workspace's file list before and after — and «before» has to be
       * read here, inside the queue, at the moment the request actually runs.
       * Read at the moment the files were dropped in instead, two uploads
       * started in the same breath both measured the same «before», and the
       * second one claimed the first one's file: the workspace reopened with
       * one estimate twice and the other one's content gone.
       */
      this.enqueue(function () {
        if (self.ws !== ws) return;
        var had = {}, room = MAX_FILES - (ws.files || []).length, send = [];
        (ws.files || []).forEach(function (n) { had[n] = 1; });
        files.forEach(function (f) {
          if (f.size > MAX_MB * 1024 * 1024) self.hold(f, 'файл больше ' + MAX_MB + ' МБ — столько заявка не хранит', false);
          else if (send.length >= room) self.hold(f, 'в заявке уже ' + MAX_FILES + ' файлов — это предел; уберите ненужный и повторите', true);
          else send.push(f);
        });
        if (!send.length) { self.unsavedChanged(true); return; }
        var fd = new FormData();
        send.forEach(function (f) { fd.append('files+', f); });
        return S.pb.collection('workspaces').update(ws.id, fd).then(function (w) {
          var added = (w.files || []).filter(function (n) { return !had[n]; });
          send.forEach(function (f, i) { if (added[i]) { self.files[f.name] = added[i]; delete self.unsaved[f.name]; } });
          ws.files = w.files;
          self.unsavedChanged(false);
          self.touch();
        }).catch(function (e) {
          // the link, or the server itself: worth trying again without being asked
          var again = !e || !e.status || e.status >= 500;
          send.forEach(function (f) { self.hold(f, S.pbErr(e), true); });
          self.unsavedChanged(true);
          if (again) {
            clearTimeout(self.ut);
            self.ut = setTimeout(function () { self.retryUploads(); }, UPLOAD_RETRY_MS);
          }
        });
      });
    },

    /** Keep a file that is not on the server, with why. `retry`: trying again can help. */
    hold: function (file, why, retry) {
      this.unsaved[file.name] = { file: file, why: why, retry: retry };
    },
    hasUnsaved: function () { return Object.keys(this.unsaved || {}).length > 0; },

    /** Send again what is being held (one file by name, or all that can be retried). */
    retryUploads: function (name) {
      var self = this;
      this.renderUnsaved();                                           // drops what is no longer on the list
      var files = Object.keys(this.unsaved).filter(function (n) {
        return (name ? n === name : true) && self.unsaved[n].retry;
      }).map(function (n) { return self.unsaved[n].file; });
      if (files.length) this.upload(files);
    },

    /** The list of held files changed: the line, the mark, and — when something was just refused — the message. */
    unsavedChanged: function (say) {
      var names = Object.keys(this.unsaved);
      this.renderUnsaved();
      this.mark(this.dirty ? '●' : '✓');
      if (say && names.length) {
        A().toast('Не сохранено на сервере: ' + names.map(function (n) { return n + ' — ' + this.unsaved[n].why; }, this).join('; '), true);
      }
    },

    renderUnsaved: function () {
      var self = this, box = $('wsUnsaved');
      if (!box) return;
      // A held file whose project was taken off the list is no longer waited for. Not while files are still
      // being read, though: the upload starts with the reading, and can fail before its project is on the list.
      if (!(A().pending > 0)) {
        var live = {};
        A().projects.forEach(function (p) { live[p.file] = 1; });
        Object.keys(this.unsaved).forEach(function (n) { if (!live[n]) delete self.unsaved[n]; });
      }
      var names = Object.keys(this.unsaved);
      box.hidden = !names.length;
      box.innerHTML = names.map(function (n, i) {
        var u = self.unsaved[n];
        return '<div class="row"><span><b>' + S.esc(n) + '</b> — не сохранён на сервере: ' + S.esc(u.why) + '</span>' +
          (u.retry ? '<button type="button" class="btn sm" data-i="' + i + '">Повторить</button>' : '') + '</div>';
      }).join('') + (names.length ? '<div class="hint">Пока файл не сохранён, после перезагрузки страницы этой сметы в заявке не будет.</div>' : '');
      box.querySelectorAll('button[data-i]').forEach(function (b) {
        b.addEventListener('click', function () { self.retryUploads(names[+b.dataset.i]); });
      });
    },

    /* ------------------------------------------------------ corrections */

    /**
     * A price field fires on every keystroke, so «120000» used to be five
     * separate writes to the server, four of them recording a number nobody
     * meant — 1, 12, 120, 1200. The last value for each resource is kept here
     * and written once the typing stops, or the moment the field is left.
     *
     * Nothing may leave without going through here first: flush() is called
     * before every save and before the workspace is closed.
     */
    correctSoon: function (key, value) {
      var self = this;
      if (!this.ws || this.loading || this.frozen) return;
      this.pend[key] = value;
      clearTimeout(this.ct);
      this.ct = setTimeout(function () { self.flush(); }, CORRECT_MS);
    },

    /**
     * Everything waiting is written in one request.
     *
     * «Применить процент» changes every resource of an estimate at once — a
     * thousand of them is ordinary. One record at a time that was a thousand
     * HTTP creates, and the deployed server allows forty per five seconds from
     * one address, which a whole office shares: forty were written and the rest
     * came back 429 and were thrown away, announced by one toast overwritten a
     * thousand times. The estimate was still priced correctly on screen and in
     * the exported document — the workspace state carries the prices — but the
     * price memory the next project's hints are built from kept almost none of
     * it.
     *
     * What goes in the request is only what actually changes: a price equal to
     * the estimate's own removes its correction, a price already recorded is
     * left alone. Everything about who and where is filled in by the server.
     */
    flush: function () {
      var self = this, app = A(), waiting = this.pend;
      clearTimeout(this.ct);
      this.ct = 0;
      this.pend = {};
      var keys = Object.keys(waiting);
      if (!keys.length) return;
      if (!this.ws || this.loading || this.frozen || !app.model) return;

      var by = {}, rs = app.model.resources;
      for (var i = 0; i < rs.length; i++) by[rs[i].key] = rs[i];
      var set = [], del = [], marks = {};
      keys.forEach(function (k) {
        var rec = by[k], value = waiting[k], cur = self.corr[k];
        if (!rec) return;
        if (value == null || S.near(rec.price, value)) {      // back to the estimate's own price
          if (cur) { delete self.corr[k]; del.push(k); }
          return;
        }
        var from = self.priceSource(k, value);
        var source = from ? from.source : 'typed';
        if (cur && S.near(cur.market, value) && cur.source === source) return;   // already recorded
        set.push({
          res_key: k, name: rec.name, unit: rec.unit || '',
          smeta_price: rec.price, market_price: value, note: app.opts.noteText || '',
          source: source, source_price: from ? from.price : null
        });
        marks[k] = value;
      });
      if (!set.length && !del.length) return;

      var ws = this.ws;
      this.parts(set, del).forEach(function (part) { self.sendBulk(ws, part, marks, waiting); });
    },

    /**
     * The requests one flush becomes. The server refuses more than 3000 rows
     * at once and counts deletions among them, so a project big enough to
     * reach that is sent in pieces rather than refused.
     *
     * The deletions are cut into pieces too, and that is not tidiness. «Вернуть
     * сметные цены» hands back every price of the project in one gesture, so
     * the list of keys to delete gets exactly as long as the list of keys to
     * write ever gets. It used to ride along whole on the first request —
     * which then carried a thousand writes and every deletion besides, was
     * refused by the server, retried thirty seconds later and refused again,
     * with the expert's whole reset stuck in the queue behind it.
     */
    parts: function (set, del) {
      var parts = [], n;
      for (n = 0; n < set.length; n += BULK) parts.push({ set: set.slice(n, n + BULK), del: [] });
      for (n = 0; n < del.length; n += BULK) parts.push({ set: [], del: del.slice(n, n + BULK) });
      return parts;
    },

    sendBulk: function (ws, part, marks, waiting) {
      var self = this, app = A();
      this.enqueue(function () {
        var body = { workspace: ws.id, set: part.set, del: part.del };
        return S.pb.send('/api/corrections/bulk', {
          method: 'POST', body: body, keepalive: !!self.leaving && self.small(body)
        }).then(function (r) {
          part.set.forEach(function (row) {
            var k = row.res_key;
            self.corr[k] = { id: (r.ids && r.ids[k]) || (self.corr[k] && self.corr[k].id), market: marks[k], source: row.source };
          });
        });
      }).catch(function (e) {
        // Nothing is dropped: what did not go out waits for the next attempt,
        // and it is said once, with a count, rather than once per resource.
        part.set.forEach(function (row) { if (self.pend[row.res_key] === undefined) self.pend[row.res_key] = waiting[row.res_key]; });
        part.del.forEach(function (k) { if (self.pend[k] === undefined) self.pend[k] = waiting[k]; });
        clearTimeout(self.ct);
        self.ct = setTimeout(function () { self.flush(); }, RETRY_MS);
        if (self.isNet(e)) { self.down(); return; }
        app.toast('Правки не сохранены (' + (part.set.length + part.del.length) + '): ' +
          S.pbErr(e) + ' — повтор через ' + (RETRY_MS / 1000) + ' секунд', true);
      });
    },

    /**
     * Where a price came from, for the correction it becomes. «Применить» on a reference line or a hint marks the
     * resource with the price it set and its source (`ref:<package>:<record>`, `hint:<correction>`) right before it
     * sets the price; anything else — typed, pasted, Escape, «Сбросить», a percentage, the price book — is `typed`.
     * The mark belongs to that one setPrice: the next change of the same price, by any other way, ends it, so a number
     * typed again after Escape goes out as `typed` even when it equals the reference price.
     */
    markSource: function (key, price, source) {
      this.marks = this.marks || {};
      this.marks[key] = { price: price, source: String(source || '').slice(0, 200), fresh: true };
    },
    /** A price was set: the mark made for this very change stays (once), any older one ends. */
    priceSet: function (key) {
      var m = this.marks && this.marks[key];
      if (!m) return;
      if (m.fresh) m.fresh = false; else delete this.marks[key];
    },
    priceSource: function (key, value) {
      var m = this.marks && this.marks[key];
      return m && S.near(m.price, value) ? m : null;
    },

    /* ---------------------------------------------------------- exports */
    saveExport: function (bytes, opts) {
      var self = this, app = A();
      if (!this.ws || this.frozen) return;
      var d = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
      var name = S.safeName(app.exportBase()) + '_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
        '_' + pad(d.getHours()) + pad(d.getMinutes()) + '.xlsx';
      var fd = new FormData();
      fd.append('workspace', this.ws.id);
      fd.append('application', this.app.id);
      fd.append('mode', opts.mode || '');
      fd.append('by', S.me().id);
      fd.append('file', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
      this.enqueue(function () {
        return S.pb.collection('exports').create(fd).then(function () {
          app.toast('Экспорт сохранён на сервере: ' + name);
        }).catch(function (e) { app.toast('Экспорт не записан на сервер: ' + S.pbErr(e), true); });
      });
    },

    /* ----------------------------------------------------------- header */
    /* -------------------------------------------------------- no server (E20) */
    /** A request that did not reach the server at all (not one it answered, not one the page called off). */
    isNet: function (e) { return !!e && e.status === 0 && !e.isAbort && !this.leaving; },
    /**
     * The server does not answer: said once, in a bar that stays (not a toast for every failed save), with what to
     * do — on the laptop, how to start it again. Asked every five seconds; when it answers, everything waiting goes.
     */
    down: function () {
      var self = this;
      if (!this.offline) {
        this.offline = true;
        var local = (S.Auth && S.Auth.laptop) || /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(location.hostname);
        var bar = $('srvDown');
        if (!bar) { bar = document.createElement('div'); bar.id = 'srvDown'; bar.className = 'srvdown'; document.body.appendChild(bar); }
        bar.innerHTML = local
          ? '<b>Сервер программы на этом компьютере не отвечает.</b> Запустите его снова: Windows — <code>C:\\Smeta\\server\\laptop.cmd</code> ' +
            '(если включён автозапуск — перезагрузите компьютер), Mac — <code>sh server/laptop.sh</code>. Введённые цены сохраняются в этом ' +
            'браузере и уйдут на сервер, как только он заработает. Не закрывайте и не обновляйте страницу: без сервера она не откроется.'
          : '<b>Нет связи с сервером</b> — проверьте сеть. Введённые цены сохраняются в этом браузере и уйдут на сервер, как только связь вернётся.';
        bar.hidden = false;
        this.mark('⚠');
      }
      if (this.probe) return;
      this.probe = setInterval(function () {
        S.pb.health.check({ requestKey: null }).then(function () { self.up(); }, function () { /* still down */ });
      }, 5000);
    },
    up: function () {
      if (!this.offline) return;
      clearInterval(this.probe); this.probe = null;
      this.offline = false;
      var bar = $('srvDown');
      if (bar) bar.hidden = true;
      if (!this.ws) return;
      var self = this;
      this.flush();
      if (this.dirty) this.saveNow().catch(function () { /* said by saveNow */ });
      else this.mark('✓');
      if (this.retryUploads) this.retryUploads();
      A().toast('Связь с сервером восстановлена — изменения сохраняются');
      if (S.Hints && S.Hints.loadSoon) S.Hints.loadSoon();
      void self;
    },

    mark: function (s) {
      var el = $('wsSave');
      if (this.offline && s === '✓') s = '⚠';
      // «saved» is not said while an estimate on screen has no file on the server
      var held = s === '✓' && this.hasUnsaved();
      if (held) s = '!';
      if (el) {
        el.textContent = s;
        el.title = held ? 'Есть сметы, не сохранённые на сервере' : s === '●' ? 'Сохранение…' : s === '✓' ? 'Сохранено' :
          s === '⚠' ? 'Нет связи с сервером' : 'Ошибка сохранения';
      }
    },
    renderBox: function () {
      var box = $('wsBox'), self = this;
      document.body.classList.toggle('ws', !!this.ws);
      if (!this.ws) { box.hidden = true; box.innerHTML = ''; return; }
      var a = this.app, w = this.ws;
      var c = a.expand && a.expand.contragent;
      box.hidden = false;
      box.innerHTML = '<button class="btn sm" id="wsList" title="Вернуться к списку заявок">‹ Заявки</button>' +
        '<span class="no">№ ' + S.esc(a.number) + '</span>' +
        '<span class="nm" title="' + S.esc(a.project_title || '') + '">' + S.esc(c ? c.name : a.org_name) + '</span>' +
        '<span class="rg">' + S.esc(S.regionLabel(w.region)) + '</span>' +
        '<span class="sv" id="wsSave" title="Сохранено">✓</span>' +
        (w.status === 'done'
          ? '<span class="done">завершена</span>'
          : '<button class="btn sm ok" id="wsDone" title="Отметить работу как завершённую">✓ Завершить</button>');
      $('wsList').addEventListener('click', function () {
        self.close().catch(function () { /* the toast already said why */ });
      });
      var d = $('wsDone');
      if (d) d.addEventListener('click', function () { self.finish(); });
    },

    finish: function () {
      var self = this;
      this.saveNow().then(function () {
        return S.pb.collection('workspaces').update(self.ws.id, { status: 'done', updated_by: S.me().id });
      }).then(function (w) {
        self.ws.status = w.status;
        self.renderBox();
        A().toast('Заявка отмечена как завершённая. Её можно открыть и продолжить позже.');
      }).catch(function (e) { A().toast(S.pbErr(e), true); });
    },

    /**
     * Leave the workspace, saving first. Returns when it is really closed.
     *
     * If that last save fails there is nowhere left to retry from — the
     * workspace is about to be forgotten — so by default the program stays
     * where it is and says so, rather than dropping what was typed. Signing
     * out passes `force`, because a locked screen that still holds somebody's
     * work open is worse than a lost minute of typing.
     */
    close: function (force) {
      var self = this, app = A();
      this.renderUnsaved();
      var held = Object.keys(this.unsaved);
      if (!force && held.length && !window.confirm('Не сохранены на сервере: ' + held.join(', ') +
        '.\n\nЕсли закрыть заявку сейчас, этих смет в ней не будет. Закрыть?')) return Promise.reject(new Error('unsaved'));
      this.seq++;                             // anything still arriving is for a workspace nobody is in
      this.flush();
      // a tab that was superseded leaves without a word to the server: what it holds is older than what is there
      var done = this.frozen ? null : this.dirty ? this.saveNow() : this.q;
      return Promise.resolve(done).catch(function (e) {
        if (force) return;
        // a state the server will not take would keep the person in this application for good
        if (self.refused && window.confirm('Заявка не сохраняется: сервер не принимает её данные (' + self.refused +
          ').\n\nЦены записаны как правки и хранятся в этом браузере. Закрыть заявку?')) return;
        app.toast('Рабочая область не закрыта: последние изменения не сохранены (' + S.pbErr(e) + ')', true);
        throw e;
      }).then(function () {
        self.wal = {}; self.walN = 0; self.mine = {}; self.refused = ''; self.cutSaid = 0;
        self.ws = null; self.app = null; self.files = {}; self.corr = {}; self.marks = {}; self.cmp = {};
        self.unsaved = {}; clearTimeout(self.ut); self.renderUnsaved();
        self.thaw();
        S.hashSet('ws', '');
        self.loading = true;
        app.projects = []; app.prices = {}; app.pct = {}; app.notes = {}; app.checked = {}; app.looseBook = null; app.spareBook = null; app.queue = [];
        app.resetOpts();
        $('reportMode').value = 'changed';
        app.rebuild(); app.renderSide();
        self.loading = false;
        self.renderBox();
        document.dispatchEvent(new CustomEvent('ws:close'));
        S.Registry.show();
      });
    }
  };

  S.Sync = Sync;
  S.markSource = function (key, price, source) { Sync.markSource(key, price, source); };
  /**
   * Where the price a resource has now was applied from — `ref:…`, `hint:…`, `uzex:…` — or '' when it was typed
   * or nothing is known: the mark of this session first, then what the server holds for that very price. Asked
   * before a bulk change replaces the price, so that «Отменить» can put the source back with it.
   */
  S.sourceOfPrice = function (key, value) {
    if (!Sync.ws) return '';
    var m = Sync.priceSource(key, value);
    if (m) return m.source === 'typed' ? '' : (m.source || '');
    var c = Sync.corr && Sync.corr[key];
    return c && c.source && c.source !== 'typed' && S.near(c.market, value) ? c.source : '';
  };
  S.priceSource = function (key, value) { return Sync.priceSource(key, value); };
  /**
   * Where the price on screen of resource `r` was applied from — 'ref:…', 'hint:…', 'uzex:…' — or '' when it was
   * typed, or is the estimate's own. The mark of this session first; while a newer change is on its way to the server,
   * nothing; else the correction stored. (E16: the badge of the «Рыночная цена» cell.)
   */
  S.appliedSource = function (r) {
    if (!Sync.ws || !r || S.near(r.market, r.price)) return '';
    var m = Sync.priceSource(r.key, r.market);
    if (m) return m.source === 'typed' ? '' : (m.source || '');
    if (Sync.pend && Sync.pend[r.key] !== undefined) return '';
    return S.sourceOfPrice(r.key, r.market);
  };
  document.addEventListener('DOMContentLoaded', function () { Sync.init(); });
  if (document.readyState !== 'loading') Sync.init();
})(S);
