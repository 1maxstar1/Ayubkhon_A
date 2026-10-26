/*
 * Reference prices: what the price documents of the reference package say a resource costs (server mode only).
 *
 * The administrator uploads a package on admin.html; when one is active, opening a workspace starts a worker
 * (src/refs-worker.js) that downloads it once, derives the pool with the program's own code, keeps it in IndexedDB
 * and answers queries. This file only asks and shows:
 *
 *   tag      «справ. 123 457 +2» next to the hint tag (dashed «справ. ≈98 765» when the top line is «Похожий» or
 *            «Оценка» — the price of another resource, or one that needed the item's data to convert)
 *   popover  ≤ 6 lines, each with its price, the tier, flags, the matched record's own NAME, the evidence, the
 *            document, the conversion and the difference to the smeta price — all Russian texts of S.refs.view, never
 *            an internal key or a document id
 *   apply    «Применить» sets the price of that line's resource, exactly as a hint does, and marks where it came
 *            from (corrections.source = ref:<package>:<record>). Nothing else ever sets a price: loading, re-querying
 *            or changing the date never touch app.prices, and a price the expert typed is replaced only after a confirm.
 *   as-of    the date the prices are wanted for: the application's registration date unless the expert picks another
 *            (saved in the workspace state as refs.asof); records published after it are not offered.
 *
 * Results arrive in batches while the expert works: the list is repainted where it stands (never scrolled, the
 * focused field keeps its focus), and re-filtered only when one of the two reference filters is on.
 */
(function (S) {
  'use strict';
  if (!S.pb || !S.refs || !S.refs.view) return;

  var BATCH = 50;
  var PHASE = { cache: [0, 5], download: [0, 8], unpack: [8, 10], check: [10, 12], derive: [12, 80], store: [80, 88], index: [88, 100] };
  var NEAR = { similar: true, estimate: true };

  function $(id) { return document.getElementById(id); }
  function A() { return window.app; }
  function mkOf(r) { return r && (r.mk || S.matchPair(r.name, r.unit || '')); }
  /** One question per name + unit + smeta band: every variant line of a resource shows the same lines. */
  function keyOf(r) { return mkOf(r) + '|' + (r.section || ''); }
  function round2(v) { return Math.round(v * 100) / 100; }
  function ruDate(d) { return S.refs.viewParts.ruDate(d); }
  function fmt(v) { return S.refs.viewParts.money(v); }

  var Refs = {
    rec: null,            // the active ref_packages record { id, package_id, sha256, records }
    worker: null, workerSha: null,
    state: 'off',         // off | loading | ready | error
    pct: 0, message: '', cached: false, ms: 0,
    sources: {},
    map: {},              // keyOf(resource) -> lines
    asked: {},            // keyOf -> true while a question is out
    gen: 0,               // bumped on every workspace open / close and as-of change: older answers are dropped
    batch: 0, batches: {}, // batch number -> gen
    asof: null, asofSet: false,
    open: null,           // { key, k } of the popover on screen

    init: function () {
      var self = this;
      var P = S.App.prototype;
      var orig = P.rebuild;
      P.rebuild = function () {
        var r = orig.apply(this, arguments);
        self.querySoon();
        return r;
      };
      document.addEventListener('ws:open', function (e) { self.start(e.detail); });
      document.addEventListener('ws:close', function () { self.stop(); });
      document.addEventListener('auth:signedout', function () { self.forget(); });

      // the workspace remembers a date the expert picked; without one the registration date is used every time
      if (S.Sync && S.Sync.state) {
        var state = S.Sync.state;
        S.Sync.state = function () {
          var st = state.apply(this, arguments);
          if (self.asofSet && self.asof) st.refs = { asof: self.asof };
          return st;
        };
      }

      var f = $('filter');
      if (f) {
        var near = f.querySelector('option[value="near"]');
        var a = document.createElement('option'); a.value = 'ref'; a.textContent = 'Со справочными ценами'; a.hidden = true;
        var b = document.createElement('option'); b.value = 'nearref'; b.textContent = 'Только похожие справочные'; b.hidden = true;
        f.insertBefore(a, near ? near.nextSibling : null);
        f.insertBefore(b, a.nextSibling);
      }

      this.pop = document.createElement('div');
      this.pop.id = 'refPop';
      this.pop.hidden = true;
      document.body.appendChild(this.pop);
      document.addEventListener('click', function (e) {
        if (self.pop.hidden) return;
        if (self.pop.contains(e.target) || (e.target.closest && e.target.closest('.tagr'))) return;
        self.hide();
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') self.hide(); });
      var sc = $('priceScroll');
      sc.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('.tagr');
        if (b) { e.preventDefault(); self.show(b, b.dataset.res); }
      });
      sc.addEventListener('scroll', function () { self.hide(); }, { passive: true });
    },

    /* ------------------------------------------------------------------ workspace */
    start: function (w) {
      var self = this;
      var gen = ++this.gen;
      this.map = {}; this.asked = {}; this.first = null; this.hide();
      var st = (w && w.state && w.state.refs) || {};
      this.asofSet = !!(st.asof && /^\d{4}-\d{2}-\d{2}$/.test(st.asof));
      this.asof = this.asofSet ? st.asof : null;
      S.pb.collection('ref_packages').getList(1, 1, {
        filter: 'active = true', fields: 'id,collectionId,collectionName,package_id,sha256,file,records'
      }).then(function (res) {
        if (gen !== self.gen) return;
        var rec = res.items[0] || null;
        self.rec = rec;
        self.filters(!!rec);
        if (!rec) { self.state = 'off'; self.repaint(); return; }
        if (self.worker && self.workerSha === rec.sha256 && self.state === 'ready') { self.query(); return; }
        self.boot(rec, gen);
      }).catch(function (e) {
        if (gen !== self.gen || (e && e.status === 0)) return;
        console.error('refs', e);
        self.state = 'off';
        self.filters(false);
      });
    },

    stop: function () {
      this.gen++;
      this.map = {}; this.asked = {};
      this.asof = null; this.asofSet = false;
      this.hide();
    },

    forget: function () {
      this.stop();
      if (this.worker) { try { this.worker.postMessage({ cmd: 'forget' }); } catch (e) { /* gone */ } this.kill(); }
      this.state = 'off';
    },

    kill: function () {
      var w = this.worker;
      this.worker = null; this.workerSha = null;
      // let a «forget» reach the worker before it is gone
      if (w) setTimeout(function () { w.terminate(); }, 50);
    },

    /** Start the worker on the active package (a new one when the administrator switched packages). */
    boot: function (rec, gen) {
      var self = this;
      if (this.worker) this.kill();
      if (!window.__REFS_WORKER_SRC__ || typeof Worker === 'undefined') { this.state = 'off'; this.filters(false); return; }
      this.state = 'loading'; this.pct = 0; this.message = '';
      this.repaint();
      var w;
      try {
        w = new Worker(URL.createObjectURL(new Blob([window.__REFS_WORKER_SRC__], { type: 'text/javascript' })));
      } catch (e) { this.fail('Справочник недоступен в этом браузере'); return; }
      this.worker = w; this.workerSha = rec.sha256;
      w.onmessage = function (e) { if (w === self.worker) self.onMessage(e.data); };
      w.onerror = function (e) { if (w === self.worker) { e.preventDefault(); self.fail('Ошибка справочника'); } };
      // a blob worker resolves nothing against the page: the file URL has to be absolute (S.fileURL gives one)
      S.fileURL(rec, rec.file).then(function (url) {
        if (w !== self.worker) return;
        w.postMessage({ cmd: 'open', pkgs: [{ id: rec.id, package_id: rec.package_id, sha256: rec.sha256, url: url, records: rec.records }] });
      }).catch(function (e) {
        if (w === self.worker) self.fail('Справочник не получен с сервера: ' + S.pbErr(e));
      });
    },

    fail: function (msg) {
      this.state = 'error'; this.message = msg;
      this.repaint();
      A().toast(msg, true);
    },

    onMessage: function (m) {
      if (m.type === 'progress') {
        var r = PHASE[m.phase] || [0, 100];
        var pct = Math.floor(r[0] + (r[1] - r[0]) * (m.total ? Math.min(1, m.done / m.total) : 0));
        if (pct !== this.pct) { this.pct = pct; this.statusSoon(); }
      } else if (m.type === 'ready') {
        this.state = 'ready'; this.pct = 100;
        this.sources = m.sources || {};
        this.cached = !!m.cached; this.ms = m.ms;
        this.repaint();
        this.query();
      } else if (m.type === 'results') {
        if (this.batches[m.batch] !== this.gen) { delete this.batches[m.batch]; return; }
        delete this.batches[m.batch];
        for (var i = 0; i < m.items.length; i++) {
          var it = m.items[i];
          this.map[it.k] = it.lines;
          delete this.asked[it.k];
        }
        this.refreshSoon();
        if (!Object.keys(this.batches).length) this.passDone();
      } else if (m.type === 'error') {
        this.fail(m.message || 'Справочник не подготовлен');
      }
    },

    /* ------------------------------------------------------------------ questions */
    querySoon: S.debounce(function () { this.query(); }, 400),

    /** The as-of date in force: the one picked, else the application's registration date, else today. */
    asofNow: function () {
      if (this.asofSet && this.asof) return this.asof;
      var a = S.Sync && S.Sync.app;
      return S.refs.queryAsof({ registered_at: a && a.registered_at });
    },

    /** Ask for every resource without an answer, the rows on screen first, in batches. */
    query: function () {
      var app = A(), self = this;
      if (this.state !== 'ready' || !this.worker || !app.model || !S.Sync || !S.Sync.ws || S.Sync.loading) return;
      var ctx = { region: S.Sync.ws.region || null, asof: this.asofNow() };
      var seen = {}, items = [];
      function add(r) {
        var k = keyOf(r);
        if (seen[k] || self.map[k] || self.asked[k]) return;
        seen[k] = true;
        items.push({ k: k, name: r.name, unit: r.unit || '', section: r.section || '', mk: mkOf(r) });
      }
      (app.prices_ui.view || []).forEach(add);
      app.model.resources.forEach(add);
      if (!items.length) return;
      if (this.first == null) this.first = true;
      for (var i = 0; i < items.length; i += BATCH) {
        var part = items.slice(i, i + BATCH);
        var b = ++this.batch;
        this.batches[b] = this.gen;
        part.forEach(function (it) { self.asked[it.k] = true; });
        this.worker.postMessage({ cmd: 'suggest', batch: b, ctx: ctx, items: part });
      }
    },

    /** The first full answer for a workspace says how many resources have reference prices. */
    passDone: function () {
      if (!this.first) return;
      this.first = false;
      var n = this.count().all;
      if (n) A().toast('Справочные цены: ресурсов ' + n + (this.cached ? '' : ' (справочник подготовлен за ' + Math.round(this.ms / 1000) + ' с)'));
    },

    /* ------------------------------------------------------------------ painting */
    /** New answers: the list is repainted where it stands; re-filtered only when a reference filter is on. */
    refreshSoon: S.debounce(function () { this.repaint(); }, 200),
    statusSoon: S.debounce(function () { var app = A(); if (app && app.prices_ui) app.prices_ui.status(); }, 150),

    repaint: function () {
      var app = A();
      if (!app || !app.prices_ui) return;
      var f = $('filter').value;
      if (f === 'ref' || f === 'nearref') app.prices_ui.apply(true);
      else { app.prices_ui.status(); app.prices_ui.list.refresh(); }
    },

    filters: function (on) {
      var f = $('filter');
      if (!f) return;
      ['ref', 'nearref'].forEach(function (v) {
        var o = f.querySelector('option[value="' + v + '"]');
        if (o) o.hidden = !on;
      });
      if (!on && (f.value === 'ref' || f.value === 'nearref')) { f.value = 'all'; A().prices_ui.apply(true); }
    },

    lines: function (r) { return this.map[keyOf(r)] || []; },
    /** The resource has reference lines at all; its top line is «Похожий»/«Оценка». */
    hasRow: function (r) { return this.lines(r).length > 0; },
    nearRow: function (r) { var l = this.lines(r); return l.length > 0 && !!NEAR[l[0].tier]; },

    count: function () {
      var m = A().model, all = 0, near = 0, self = this;
      if (m) m.resources.forEach(function (r) { var l = self.lines(r); if (l.length) { all++; if (NEAR[l[0].tier]) near++; } });
      return { all: all, near: near };
    },

    /** The part of the status line that is ours. */
    statusText: function () {
      if (this.state === 'loading') return ' · справочник: подготовка ' + this.pct + ' %';
      if (this.state === 'error') return ' · справочник: ошибка';
      if (this.state !== 'ready') return '';
      var c = this.count();
      return (c.all ? ' · справочных ' + c.all : '') + (c.near ? ' · похожих справ. ' + c.near : '');
    },

    /** Tag markup for a resource row, '' when there is nothing to show. */
    tag: function (r) {
      var l = this.lines(r);
      if (!l.length) return '';
      var top = l[0], near = !!NEAR[top.tier];
      var title = 'Справочные цены: ' + (S.refs.RU.TIER[top.tier] || '') + (near ? ' — ' + top.name : '');
      return '<button class="tagr' + (near ? ' near' : '') + '" data-res="' + S.esc(r.key) + '" title="' + S.esc(title) + '">' +
        'справ. ' + (near ? '≈' : '') + (top.price >= 100 ? S.money(top.price) : fmt(top.price)) + (l.length > 1 ? ' +' + (l.length - 1) : '') + '</button>';
    },

    /* ------------------------------------------------------------------ popover */
    recOf: function (key) {
      var m = A().model;
      if (!m) return null;
      for (var i = 0; i < m.resources.length; i++) if (m.resources[i].key === key) return m.resources[i];
      return null;
    },

    show: function (anchor, key) {
      var self = this, rec = this.recOf(key);
      var lines = rec ? this.lines(rec) : [];
      if (!lines.length) { this.hide(); return; }
      this.open = { key: key, anchor: anchor };
      var ctx = { sources: this.sources, asof: this.asofNow(), smetaPrice: rec.price, unit: rec.unit, regionLabel: S.regionLabel };
      var html = '<div class="rp-head"><span>Справочные цены · ' + S.esc(S.regionLabel(S.Sync.ws.region) || '') +
        ' · на <b class="rp-date" title="' + (this.asofSet ? 'Дата выбрана вручную' : 'Дата регистрации заявки') + '">' +
        ruDate(ctx.asof) + '</b> <button class="link" data-asof>изменить</button></span>' +
        '<button class="link" data-x title="Закрыть">×</button></div>';
      html += '<div class="rp-asof" hidden><input type="date" value="' + S.esc(ctx.asof) + '">' +
        (this.asofSet ? ' <button class="link" data-asof-reset>дата регистрации заявки</button>' : '') +
        '<small>Цены, опубликованные после этой даты, не предлагаются</small></div>';
      if (!S.near(rec.market, rec.price)) html += '<div class="rp-mine">Ваша цена: <b>' + fmt(rec.market) + '</b></div>';
      var sub = false;
      lines.forEach(function (l, i) {
        if (l.tier === 'similar' && !sub) {
          sub = true;
          html += '<div class="hp-sub">Похожие ресурсы<small>цена другого ресурса — проверьте название</small></div>';
        }
        html += self.lineHtml(l, i, ctx);
      });
      this.pop.innerHTML = html;
      this.pop.querySelector('[data-x]').addEventListener('click', function () { self.hide(); });
      this.pop.querySelector('[data-asof]').addEventListener('click', function () {
        var box = self.pop.querySelector('.rp-asof');
        box.hidden = !box.hidden;
        if (!box.hidden) box.querySelector('input').focus();
      });
      this.pop.querySelector('.rp-asof input').addEventListener('change', function (e) { self.setAsof(e.target.value || null); });
      var reset = this.pop.querySelector('[data-asof-reset]');
      if (reset) reset.addEventListener('click', function () { self.setAsof(null); });
      this.pop.querySelectorAll('button[data-fold]').forEach(function (b) {
        b.addEventListener('click', function () {
          var box = self.pop.querySelector('.rp-comps[data-of="' + b.dataset.fold + '"]');
          box.hidden = !box.hidden;
          b.textContent = (box.hidden ? '▸' : '▾') + b.textContent.slice(1);
        });
      });
      this.pop.querySelectorAll('button[data-i]').forEach(function (b) {
        b.addEventListener('click', function () { self.apply(key, lines[+b.dataset.i]); });
      });
      var r = anchor.getBoundingClientRect();
      this.pop.hidden = false;
      var w = this.pop.offsetWidth, h = this.pop.offsetHeight;
      var left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      var top = r.bottom + 4 + h > window.innerHeight ? r.top - h - 4 : r.bottom + 4;
      this.pop.style.left = left + 'px';
      this.pop.style.top = Math.max(4, top) + 'px';
    },

    /** One line of the popover (S.refs.view gives every text; nothing here reads an internal field). */
    lineHtml: function (l, i, ctx) {
      var v = S.refs.view(l, ctx);
      var near = !!NEAR[l.tier];
      var h = '<div class="rp-line' + (near ? ' near' : '') + (i === 0 ? ' top' : '') + '">' +
        '<div class="rp-top"><b class="rp-price">' + S.esc(v.price) + '</b>' +
        '<span class="rp-badge t-' + S.esc(l.tier) + '">' + S.esc(v.badge) + '</span>' +
        (v.summary ? '<span class="rp-sum">' + S.esc(v.summary) + '</span>' : '') +
        (v.flags.length ? '<span class="rp-flags">' + S.esc(v.flags.join(', ')) + '</span>' : '') +
        '<button class="btn sm" data-i="' + i + '">Применить</button></div>' +
        '<div class="rp-name">' + S.esc(v.name) + '</div>';
      if (v.evidence.length) h += '<div class="rp-ev">' + S.esc(v.evidence.join(' · ')) + '</div>';
      h += '<div class="rp-src">' + S.esc(v.source) + (v.age ? ' · ' + S.esc(v.age) : '') + '</div>';
      // a median line names its documents below, and «биржа» is already the source: the basis would say nothing more
      var basis = l.summary || v.source.indexOf(v.basis) === 0 ? '' : v.basis;
      var conv = [v.conv, basis].filter(function (x) { return x; }).join(' · ');
      if (conv) h += '<div class="rp-conv">' + S.esc(conv) + '</div>';
      if (v.vsSmeta) h += '<div class="rp-vs">' + S.esc(v.vsSmeta) + '</div>';
      if (v.components.length) {
        h += '<button class="link rp-fold" data-fold="' + i + '">▸ документы (' + v.components.length + ')</button>' +
          '<div class="rp-comps" data-of="' + i + '" hidden>' + v.components.map(function (c) {
            return '<div class="rp-comp"><b>' + S.esc(c.price) + '</b><div><div class="rp-name">' + S.esc(c.name) + '</div>' +
              (c.evidence.length ? '<div class="rp-ev">' + S.esc(c.evidence.join(' · ')) + '</div>' : '') +
              '<div class="rp-src">' + S.esc(c.source) + '</div></div></div>';
          }).join('') + '</div>';
      }
      return h + '</div>';
    },

    hide: function () { if (this.pop) this.pop.hidden = true; this.open = null; },

    /** «Применить»: that line's price on the clicked resource line, and where it came from. */
    apply: function (key, line) {
      var app = A(), rec = this.recOf(key);
      if (!rec || !line || !(line.price > 0)) return;
      var price = round2(line.price);
      if (!S.near(rec.market, rec.price) && !S.near(rec.market, price) &&
          !window.confirm('Заменить вашу цену ' + fmt(rec.market) + ' на ' + fmt(price) + '?')) return;
      if (S.markSource) S.markSource(key, price, this.sourceOf(line));
      app.setPrice(key, price);
      app.prices_ui.apply(true);
      app.sheetList.refresh();
      app.toast('Применено: ' + fmt(price) + ' (справочник)');
      this.hide();
    },

    /** ref:<package>:<record>, or ref:<package>:median:<record>,<record>… (≤ 200 characters). */
    sourceOf: function (line) {
      var id = this.rec ? this.rec.package_id : '?';
      if (line.rid != null) return 'ref:' + id + ':' + line.rid;
      var head = 'ref:' + id + ':median:', rids = (line.rids || []).slice(), out = head + rids.join(',');
      while (out.length > 190 && rids.length > 1) { rids.pop(); out = head + rids.join(',') + '…'; }
      return out;
    },

    setAsof: function (d) {
      var ok = d && /^\d{4}-\d{2}-\d{2}$/.test(d);
      this.asofSet = !!ok;
      this.asof = ok ? d : null;
      this.gen++;
      this.map = {}; this.asked = {}; this.first = null;
      if (S.Sync && S.Sync.touch) S.Sync.touch();
      var open = this.open;
      this.hide();
      this.repaint();
      this.query();
      // the popover comes back with the new date once its resource has an answer and its tag is painted again
      var self = this, gen = this.gen;
      if (open) {
        var wait = function (n) {
          if (gen !== self.gen || !self.pop.hidden) return;
          var b = document.querySelector('#priceScroll .tagr[data-res="' + cssq(open.key) + '"]');
          if (b) self.show(b, open.key);
          else if (n > 0) setTimeout(function () { wait(n - 1); }, 100);
        };
        setTimeout(function () { wait(100); }, 100);
      }
    }
  };

  function cssq(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  S.Refs = Refs;
  document.addEventListener('DOMContentLoaded', function () { Refs.init(); });
  if (document.readyState !== 'loading') Refs.init();
})(S);
