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
  // Stamped into the saved state. 2 = resource keys built by the name key that
  // repairs half-switched keyboard layouts; anything older is lifted onto it
  // once, on the next open. Bump this whenever S.nameKey changes again.
  var KEYS = 2;

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
    seq: 0,                 // which open() is the current one; see open()

    init: function () {
      var self = this;
      var P = S.App.prototype;
      wrap(P, 'rebuild', function () { self.touch(); });
      wrap(P, 'saveOpts', function () { self.touch(); });
      wrap(P, 'setPrice', function (key, value) { self.touch(); self.correctSoon(key, value); });
      wrap(P, 'setPrices', function (map) {
        self.touch();
        Object.keys(map).forEach(function (k) { self.correctSoon(k, map[k]); });
      });
      // Leaving the field is the moment the number is finished being typed.
      ['priceScroll', 'sheetScroll'].forEach(function (id) {
        var sc = $(id);
        if (sc) sc.addEventListener('focusout', function () { self.flush(); });
      });
      wrap(P, 'addFiles', function (files) { self.upload(files); });
      wrap(P, 'onParsed', function () { if (self.loading && this.pending <= 0) self.restore(); });
      var build = S.buildWorkbook;
      S.buildWorkbook = function (model, opts) {
        var bytes = build(model, opts);
        self.saveExport(bytes, opts);
        return bytes;
      };
      $('projects').addEventListener('input', function () { self.touch(); });
      $('reportMode').addEventListener('change', function () { self.touch(); });
      window.addEventListener('beforeunload', function () {
        self.flush();
        if (self.dirty) self.saveNow();
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
      this.files = (w.state && w.state.files) || {};
      this.corr = {};
      this.loading = true;
      var app = A();
      app.projects = []; app.prices = {}; app.looseBook = null; app.queue = [];
      app.rebuild(); app.renderSide();
      this.renderBox();
      document.dispatchEvent(new CustomEvent('ws:open', { detail: w }));

      var by = w.expand && w.expand.updated_by;
      if (by && by.id !== S.me().id && Date.now() - new Date(w.updated).getTime() < 10 * 60000) {
        app.toast((by.name || by.email) + ' только что работал(а) с этой заявкой — при одновременной работе побеждает последнее сохранение', true);
      }

      this.corrList = [];
      S.pb.collection('corrections').getFullList({ filter: S.pb.filter('workspace = {:w}', { w: w.id }), fields: 'id,res_key,market_price' })
        .then(function (list) {
          if (!current()) return;
          self.corrList = list;
          self.indexCorr();
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
      (this.corrList || []).forEach(function (c) { raw[c.res_key] = { id: c.id, market: c.market_price }; });
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
      if (st.opts) { Object.assign(app.opts, st.opts); app.fillSettings(); }
      if (st.mode) $('reportMode').value = st.mode;
      app.looseBook = st.looseBook || null;
      app.rebuild(); app.renderSide();
      // `prices2` is this version's keying; `prices` is the previous one's, kept
      // so a workspace saved here can still be opened by the older page.
      var saved = (st.keys === KEYS && st.prices2) ? st.prices2 : st.prices;
      if (saved && Object.keys(saved).length) {
        var r = (st.keys === KEYS && st.prices2) ? { map: saved, moved: 0 } : this.reindex(saved);
        app.setPrices(r.map);
        if (r.moved) { this.dirty = true; app.toast('Цены перенесены на обновлённые названия ресурсов: ' + r.moved); }
      }
      this.indexCorr();
      var remapped = this.dirty;
      this.loading = false; this.dirty = false;
      app.busy(false);
      this.renderBox();
      if (remapped) this.touch();          // write the workspace back under the new keys
      if (app.projects.length) app.toast('Рабочая область восстановлена: файлов ' + app.projects.length);
    },

    /* ------------------------------------------------------------- save */
    touch: function () {
      if (!this.ws || this.loading) return;
      this.dirty = true;
      this.mark('●');
      clearTimeout(this.t);
      var self = this;
      this.t = setTimeout(function () { self.saveNow(); }, SAVE_MS);
    },

    state: function () {
      var app = A(), self = this;
      return {
        projects: app.projects.map(function (p) {
          return {
            file: p.file, fileId: self.files[p.file] || null, name: p.name, title: p.title, intro: p.intro,
            enabled: p.enabled !== false, open: p.open !== false,
            objects: p.objects.map(function (o) { return { name: o.name, enabled: o.enabled !== false }; })
          };
        }),
        files: this.files,
        prices: this.downgrade(app.prices),   // readable by the previous version
        prices2: app.prices,
        looseBook: app.looseBook || null,
        opts: app.opts,
        mode: $('reportMode').value,
        keys: KEYS,
        savedAt: new Date().toISOString()
      };
    },

    saveNow: function () {
      var self = this, app = A();
      if (!this.ws || this.loading) return Promise.resolve();
      this.flush();
      clearTimeout(this.t);
      var st = this.state();
      var live = {};
      app.projects.forEach(function (p) { live[p.file] = 1; });
      var stale = Object.keys(this.files).filter(function (n) { return !live[n]; }).map(function (n) { return self.files[n]; });
      Object.keys(this.files).forEach(function (n) { if (!live[n]) delete self.files[n]; });
      st.files = this.files;
      var changed = app.model ? app.model.resources.filter(function (r) { return !S.near(r.price, r.market); }).length : 0;
      var body = { state: st, changed: changed, updated_by: S.me().id };
      if (stale.length) body['files-'] = stale;
      this.dirty = false;
      return this.enqueue(function () {
        return S.pb.collection('workspaces').update(self.ws.id, body).then(function (w) {
          self.ws.updated = w.updated; self.ws.files = w.files; self.ws.changed = w.changed;
          self.mark('✓');
        }).catch(function (e) {
          self.dirty = true;
          self.mark('!');
          app.toast('Не сохранено: ' + S.pbErr(e) + ' — повтор через 15 секунд', true);
          clearTimeout(self.t);
          self.t = setTimeout(function () { if (self.dirty) self.saveNow(); }, 15000);
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
      var attempt = this.q.then(fn, fn);
      this.q = attempt.catch(function () { /* the retry timer owns this */ });
      return attempt;
    },

    /* ----------------------------------------------------------- files */
    upload: function (files) {
      var self = this, app = A();
      if (!this.ws || this.loading) return;
      files = files.filter(function (f) { return XLSX_RE.test(f.name); });
      if (!files.length) return;
      var fd = new FormData();
      files.forEach(function (f) { fd.append('files+', f); });
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
        var had = {};
        (self.ws.files || []).forEach(function (n) { had[n] = 1; });
        return S.pb.collection('workspaces').update(self.ws.id, fd).then(function (w) {
          var added = (w.files || []).filter(function (n) { return !had[n]; });
          files.forEach(function (f, i) { if (added[i]) self.files[f.name] = added[i]; });
          self.ws.files = w.files;
          self.touch();
        }).catch(function (e) {
          app.toast('Файл не загружен на сервер: ' + S.pbErr(e), true);
        });
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
      if (!this.ws || this.loading) return;
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
      if (!this.ws || this.loading || !app.model) return;

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
        if (cur && S.near(cur.market, value)) return;          // already recorded
        set.push({
          res_key: k, name: rec.name, unit: rec.unit || '',
          smeta_price: rec.price, market_price: value, note: app.opts.noteText || ''
        });
        marks[k] = value;
      });
      if (!set.length && !del.length) return;

      // The server refuses more than 3000 in one request; a project big enough
      // to reach that is sent in pieces rather than refused.
      var ws = this.ws, parts = [], n = 0;
      for (n = 0; n < set.length; n += BULK) parts.push({ set: set.slice(n, n + BULK), del: [] });
      if (!parts.length) parts.push({ set: [], del: [] });
      parts[0].del = del;
      parts.forEach(function (part) { self.sendBulk(ws, part, marks, waiting); });
    },

    sendBulk: function (ws, part, marks, waiting) {
      var self = this, app = A();
      this.enqueue(function () {
        return S.pb.send('/api/corrections/bulk', {
          method: 'POST', body: { workspace: ws.id, set: part.set, del: part.del }
        }).then(function (r) {
          part.set.forEach(function (row) {
            var k = row.res_key;
            self.corr[k] = { id: (r.ids && r.ids[k]) || (self.corr[k] && self.corr[k].id), market: marks[k] };
          });
        });
      }).catch(function (e) {
        // Nothing is dropped: what did not go out waits for the next attempt,
        // and it is said once, with a count, rather than once per resource.
        part.set.forEach(function (row) { if (self.pend[row.res_key] === undefined) self.pend[row.res_key] = waiting[row.res_key]; });
        part.del.forEach(function (k) { if (self.pend[k] === undefined) self.pend[k] = waiting[k]; });
        clearTimeout(self.ct);
        self.ct = setTimeout(function () { self.flush(); }, RETRY_MS);
        app.toast('Правки не сохранены (' + (part.set.length + part.del.length) + '): ' +
          S.pbErr(e) + ' — повтор через ' + (RETRY_MS / 1000) + ' секунд', true);
      });
    },

    /* ---------------------------------------------------------- exports */
    saveExport: function (bytes, opts) {
      var self = this, app = A();
      if (!this.ws) return;
      var d = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
      var name = 'Zayavka_' + this.app.number + '_sopostavlenie_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
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
    mark: function (s) {
      var el = $('wsSave');
      if (el) { el.textContent = s; el.title = s === '●' ? 'Сохранение…' : s === '✓' ? 'Сохранено' : 'Ошибка сохранения'; }
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
      this.seq++;                             // anything still arriving is for a workspace nobody is in
      this.flush();
      var done = this.dirty ? this.saveNow() : this.q;
      return Promise.resolve(done).catch(function (e) {
        if (!force) {
          app.toast('Рабочая область не закрыта: последние изменения не сохранены (' + S.pbErr(e) + ')', true);
          throw e;
        }
      }).then(function () {
        self.ws = null; self.app = null; self.files = {}; self.corr = {};
        self.loading = true;
        app.projects = []; app.prices = {}; app.looseBook = null; app.queue = [];
        app.rebuild(); app.renderSide();
        self.loading = false;
        self.renderBox();
        document.dispatchEvent(new CustomEvent('ws:close'));
        S.Registry.show();
      });
    }
  };

  S.Sync = Sync;
  document.addEventListener('DOMContentLoaded', function () { Sync.init(); });
  if (document.readyState !== 'loading') Sync.init();
})(S);
