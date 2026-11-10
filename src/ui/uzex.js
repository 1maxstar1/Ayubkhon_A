/*
 * Price sources of «Цены» (server mode only): «Наш справочник» — the reference package, src/ui/refs.js, unchanged —
 * and «UZEX (биржа)» — the exchange's weekly quotes, a source of its own (collections uzex_imports / uzex_quotes,
 * filled by server/pb_hooks/uzex.pb.js; never mixed with the package).
 *
 *   cards    two checkable cards above the price list: one, the other, or both; at least one stays checked. The
 *            choice is kept in this browser (localStorage); out of the box only ours is on, and the page is what it
 *            was. Checking or unchecking only shows or hides suggestions — no price is ever set or cleared by it.
 *   week     with UZEX on: the stored week (the newest by default), the market (Ichki / Eksport), «только котировки
 *            этой недели» (a week's table also carries the last quote of goods that did not trade in it) and
 *            «форвард» (off: spot quotes only). Quotes in dollars, roubles or the export table's currency are never
 *            offered as a price in sums.
 *   tag      «UZEX 7 654 322 +2» next to «справ.» — violet, never green or red (those say how a price differs) and
 *            not the colour of our own tags. With both sources on a row carries both tags.
 *   VAT      the exchange quotes with VAT, the smeta is checked without it: every UZEX price shown or applied here
 *            is the quote less VAT (÷ 1,12; S.uzex.net), as the reference package's own exchange lines are. The
 *            quote as printed, with VAT, is in the title of the price and in the line under it.
 *   popover  the lines the program's own engine finds in that week (src/uzex-worker.js), with the texts of
 *            S.refs.view; the price is violet with the «UZEX» pill; its title gives the quote as the exchange printed
 *            it — name, price with VAT and without, unit («т (предп.)» when the name states none), its own period,
 *            the change, forward and import marks.
 *   units    a quote in another unit of the same measure (т → кг) is offered converted, with ⚠ and the arithmetic,
 *            and asks before it is applied; one that needs the item's own data (kg per metre …) is shown with ⚠ and
 *            cannot be applied.
 *   apply    «Применить» sets the price as a reference line does and marks where it came from
 *            (corrections.source = uzex:<week>:<row>). The «Рыночная цена» cell of such a price is violet with a «U»
 *            pill — also after a reload, from the stored correction — until somebody types over it.
 *            «Автоподбор» stays what it was: it never takes a price from UZEX.
 */
(function (S) {
  'use strict';
  if (!S.pb || !S.uzex || !S.refs || !S.refs.view) return;

  var LS = 'smeta.sources.v1';
  var BATCH = 50;
  var NEAR = { similar: true, estimate: true };
  var QF = 'row_no,name,item,unit,unit_assumed,packing,is_forward,is_import,currency,price,change,change_pct,date_from,date_to';
  var MARKET = { internal: 'Ichki', 'export': 'Eksport' };

  function $(id) { return document.getElementById(id); }
  function A() { return window.app; }
  function mkOf(r) { return r && (r.mk || S.matchPair(r.name, r.unit || '')); }
  function keyOf(r) { return mkOf(r) + '|' + (r.section || ''); }
  function round2(v) { return Math.round(v * 100) / 100; }
  function fmt(v) { return S.refs.viewParts.money(v); }
  function ruDate(d) { return S.refs.viewParts.ruDate(d); }
  function has(a, x) { return !!a && a.indexOf(x) >= 0; }
  function cssq(s) { return String(s).replace(/["\\]/g, '\\$&'); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  function loadPrefs() {
    var p = { refs: true, uzex: false, market: 'internal', forward: false, onlyWeek: false }, s = null;
    try { s = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { s = null; }
    if (s && typeof s === 'object') {
      ['refs', 'uzex', 'forward', 'onlyWeek'].forEach(function (k) { if (typeof s[k] === 'boolean') p[k] = s[k]; });
      if (MARKET[s.market]) p.market = s.market;
    }
    if (!p.refs && !p.uzex) p.refs = true;
    return p;
  }

  /** How a line's price stands to the resource's unit: the same, converted within a measure, or by the item's data. */
  function unitKind(l) {
    if (l.tier === 'estimate' || has(l.flags, 'derived-unit')) return 'derived';
    var f = l.raw && l.raw.factor;
    return f != null && Math.abs(f - 1) > 1e-9 ? 'conv' : 'same';
  }

  var U = {
    src: loadPrefs(),
    imports: [], known: false,   // the stored weeks, newest first; known: the server has the collections
    weekId: null,                // a week picked by hand, for this visit; null — the newest of the market
    quotes: {},                  // week record + fetch time → its rows
    imp: null, byRow: {},        // the week in use and its rows by number
    info: null,                  // { used, total, left } of the package built from it
    state: 'off',                // off | loading | ready | empty | error
    worker: null,
    gen: 0, map: {}, asked: {}, batch: 0, batches: {},
    open: null,

    init: function () {
      if (this.inited) return;
      this.inited = true;
      var self = this, P = S.App.prototype, orig = P.rebuild;
      P.rebuild = function () {
        var r = orig.apply(this, arguments);
        self.querySoon();
        return r;
      };
      this.gateRefs();
      this.buildBar();
      var f = $('filter');
      if (f) {
        var o = document.createElement('option');
        o.value = 'uzex'; o.textContent = 'С ценами UZEX'; o.hidden = true;
        f.appendChild(o);
      }
      this.pop = document.createElement('div');
      this.pop.id = 'uzexPop';
      this.pop.hidden = true;
      document.body.appendChild(this.pop);
      document.addEventListener('click', function (e) {
        if (self.pop.hidden) return;
        if (self.pop.contains(e.target) || (e.target.closest && e.target.closest('.tagu'))) return;
        self.hide();
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') self.hide(); });
      var sc = $('priceScroll');
      sc.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('.tagu');
        if (b) { e.preventDefault(); self.show(b, b.dataset.res); }
      });
      sc.addEventListener('scroll', function () { self.hide(); }, { passive: true });
      // a price typed over an applied one is the expert's own again
      sc.addEventListener('input', function (e) {
        var inp = e.target;
        if (!inp.classList || !inp.classList.contains('uz')) return;
        inp.classList.remove('uz');
        var p = inp.parentNode && inp.parentNode.querySelector('.upill');
        if (p) p.remove();
      });
      document.addEventListener('ws:open', function () { self.start(); });
      document.addEventListener('ws:close', function () { self.stop(); });
      document.addEventListener('auth:signedout', function () { self.kill(); self.quotes = {}; });
      this.applySources(true);
    },

    /* ------------------------------------------------------------------ the two sources */
    /**
     * «Наш справочник» unchecked: its tags, filters, counts and toolbar are not shown. The reference flow itself is
     * not touched — its worker, its answers and its date go on as they are, and come back with the checkmark.
     */
    gateRefs: function () {
      var R = S.Refs, self = this;
      if (!R) return;
      var tag = R.tag, hasRow = R.hasRow, nearRow = R.nearRow, statusText = R.statusText, filters = R.filters;
      R.tag = function () { return self.src.refs ? tag.apply(this, arguments) : ''; };
      R.hasRow = function () { return self.src.refs ? hasRow.apply(this, arguments) : false; };
      R.nearRow = function () { return self.src.refs ? nearRow.apply(this, arguments) : false; };
      R.statusText = function () {
        var t = statusText.apply(this, arguments);
        self.paint();              // the card of ours follows its package: loading, ready, none
        return self.src.refs ? t : '';
      };
      R.filters = function (on) { return filters.call(this, !!on && self.src.refs); };
    },

    buildBar: function () {
      var self = this, pane = $('pane-prices');
      if (!pane) return;
      var bar = document.createElement('div');
      bar.id = 'srcBar';
      bar.className = 'srcbar';
      bar.hidden = true;
      function card(k, title) {
        return '<button type="button" class="srccard' + (k === 'uzex' ? ' uz' : '') + '" data-src="' + k + '" role="checkbox">' +
          '<span class="sc-ck">✓</span><span class="sc-tx"><b>' + title + '</b><small></small></span></button>';
      }
      bar.innerHTML = '<span class="count">Источники цен</span>' + card('refs', 'Наш справочник') + card('uzex', 'UZEX (биржа)') +
        '<span class="srclegend"><span class="tagr">справ.</span> = наш справочник <span class="upill">UZEX</span> = биржа</span>' +
        '<span class="srchint" id="srcHint" hidden>Должен остаться хотя бы один источник</span>' +
        '<span class="srcopts" hidden>' +
        '<select id="uzWeek" title="Неделя котировок UZEX"></select>' +
        '<select id="uzMarket" title="Рынок: внутренние или экспортные котировки">' +
        '<option value="internal">Ichki</option><option value="export">Eksport</option></select>' +
        '<label title="Таблица недели содержит и последнюю цену товаров, по которым на этой неделе сделок не было. С галочкой — только сделки самой недели">' +
        '<input type="checkbox" id="uzOnlyWeek"> только котировки этой недели</label>' +
        '<label title="Форвардные и фьючерсные контракты — цена будущей поставки, не текущая. Без галочки не предлагаются">' +
        '<input type="checkbox" id="uzForward"> форвард</label>' +
        '<span class="count" id="uzInfo"></span></span>';
      pane.insertBefore(bar, pane.firstChild);
      this.bar = bar;
      bar.querySelectorAll('.srccard').forEach(function (b) {
        b.addEventListener('click', function () { self.toggle(b.dataset.src); });
      });
      $('uzWeek').addEventListener('change', function () { self.weekId = +this.value || null; self.prepare(); });
      $('uzMarket').addEventListener('change', function () { self.src.market = MARKET[this.value] ? this.value : 'internal'; self.weekId = null; self.save(); self.prepare(); });
      $('uzOnlyWeek').addEventListener('change', function () { self.src.onlyWeek = this.checked; self.save(); self.prepare(); });
      $('uzForward').addEventListener('change', function () { self.src.forward = this.checked; self.save(); self.prepare(); });
    },

    save: function () {
      try { localStorage.setItem(LS, JSON.stringify(this.src)); } catch (e) { /* private mode: the choice lasts the visit */ }
    },

    toggle: function (k) {
      var other = k === 'refs' ? 'uzex' : 'refs';
      if (this.src[k] && !this.src[other]) {
        var h = $('srcHint');
        h.hidden = false;
        clearTimeout(this.hintT);
        this.hintT = setTimeout(function () { h.hidden = true; }, 2500);
        return;
      }
      this.src[k] = !this.src[k];
      this.save();
      this.applySources();
    },

    /** The checkmarks as they are now: what is shown follows; no price is touched. */
    applySources: function (first) {
      document.body.classList.toggle('src-norefs', !this.src.refs);
      var f = $('filter');
      if (f) {
        var o = f.querySelector('option[value="uzex"]');
        if (o) o.hidden = !this.src.uzex;
        if (!this.src.uzex && f.value === 'uzex') { f.value = 'all'; if (A() && A().prices_ui) A().prices_ui.apply(true); }
      }
      if (S.Refs && !first) S.Refs.filters(!!S.Refs.rec);
      if (!this.src.uzex) this.hide();
      this.paint();
      if (first) return;
      if (this.src.uzex) this.prepare(); else this.repaint();
    },

    /* ------------------------------------------------------------------ workspace */
    start: function () {
      var self = this, gen = ++this.gen;
      this.map = {}; this.asked = {}; this.batches = {}; this.hide();
      this.paint();
      S.pb.collection('uzex_imports').getFullList({
        sort: '-period_from,-import_id', fields: 'id,import_id,period_from,period_to,market,label,row_count,fetched_at'
      }).then(function (list) {
        if (gen !== self.gen) return;
        self.imports = list; self.known = true;
        self.paint();
        if (self.src.uzex) self.prepare();
      }).catch(function (e) {
        if (gen !== self.gen || (e && e.status === 0)) return;
        self.imports = []; self.known = false;      // a server from before this source: the card says so
        self.state = 'off';
        self.paint();
      });
    },

    stop: function () {
      this.gen++;
      this.map = {}; this.asked = {}; this.batches = {};
      this.hide();
      this.paint();
    },

    kill: function () {
      if (this.worker) { this.worker.terminate(); this.worker = null; }
      this.gen++;
      this.state = 'off';
      this.map = {}; this.asked = {}; this.batches = {};
    },

    /** The week in use: the one picked, if it is of the chosen market and still stored; else the newest. */
    chosen: function () {
      var m = this.src.market, id = this.weekId;
      var list = this.imports.filter(function (x) { return x.market === m; });
      return list.filter(function (x) { return x.import_id === id; })[0] || list[0] || null;
    },

    rowsOfWeek: function (imp) {
      var self = this, k = imp.id + '|' + imp.fetched_at;
      if (this.quotes[k]) return Promise.resolve(this.quotes[k]);
      return S.pb.collection('uzex_quotes').getFullList({
        filter: S.pb.filter('import = {:i}', { i: imp.id }), sort: 'row_no', fields: QF, batch: 1000
      }).then(function (rows) { self.quotes = {}; self.quotes[k] = rows; return rows; });
    },

    /** The chosen week, as the engine's package, to the worker. Everything asked before is for the week before. */
    prepare: function () {
      var self = this, gen = ++this.gen;
      this.map = {}; this.asked = {}; this.batches = {}; this.hide();
      this.info = null; this.byRow = {};
      var imp = this.imp = this.chosen();
      if (!this.src.uzex || !S.Sync || !S.Sync.ws) { this.state = 'off'; this.paint(); this.repaint(); return; }
      if (!imp) { this.state = 'empty'; this.paint(); this.repaint(); return; }
      this.state = 'loading';
      this.paint(); this.repaint();
      this.rowsOfWeek(imp).then(function (rows) {
        if (gen !== self.gen) return;
        rows.forEach(function (q) { self.byRow[q.row_no] = q; });
        var p = S.uzex.packageOf(imp, rows, { forward: self.src.forward, onlyWeek: self.src.onlyWeek });
        self.info = { used: p.used, total: rows.length, left: p.left };
        if (!p.pkg) { self.state = 'empty'; self.paint(); self.repaint(); return; }
        var w = self.ensureWorker();
        if (!w) { self.fail('Котировки UZEX недоступны в этом браузере'); return; }
        w.postMessage({ cmd: 'load', gen: gen, pkg: p.pkg });
      }).catch(function (e) {
        if (gen !== self.gen || (e && e.status === 0)) return;
        self.fail('Котировки UZEX не получены с сервера: ' + S.pbErr(e));
      });
    },

    ensureWorker: function () {
      var self = this;
      if (this.worker) return this.worker;
      if (!window.__REFS_WORKER_SRC__ || !window.__UZEX_WORKER_SRC__ || typeof Worker === 'undefined') return null;
      var w;
      try {
        // the engine's libraries are the reference worker's; this source's own handler comes last and answers
        w = new Worker(URL.createObjectURL(new Blob([window.__REFS_WORKER_SRC__, '\n;\n', window.__UZEX_WORKER_SRC__], { type: 'text/javascript' })));
      } catch (e) { return null; }
      w.onmessage = function (e) { if (w === self.worker) self.onMessage(e.data); };
      w.onerror = function (e) { if (w === self.worker) { e.preventDefault(); self.fail('Ошибка котировок UZEX'); } };
      this.worker = w;
      return w;
    },

    fail: function (msg) {
      this.state = 'error';
      this.paint(); this.repaint();
      A().toast(msg, true);
    },

    onMessage: function (m) {
      if (m.gen !== this.gen) return;
      if (m.type === 'ready') {
        this.state = 'ready';
        this.paint(); this.repaint();
        this.query();
      } else if (m.type === 'results') {
        delete this.batches[m.batch];
        for (var i = 0; i < m.items.length; i++) {
          this.map[m.items[i].k] = m.items[i].lines;
          delete this.asked[m.items[i].k];
        }
        this.refreshSoon();
      } else if (m.type === 'error') {
        this.fail(m.message || 'Котировки UZEX не подготовлены');
      }
    },

    /* ------------------------------------------------------------------ questions */
    querySoon: S.debounce(function () { this.query(); }, 400),

    /** The chosen week is the date asked for: nothing of it is «published later», whenever the application was registered. */
    asofNow: function () {
      var t = today(), p = this.imp && this.imp.period_to;
      return p && p > t ? p : t;
    },

    query: function () {
      var app = A(), self = this;
      if (!this.src.uzex || this.state !== 'ready' || !this.worker || !app.model || !S.Sync || !S.Sync.ws || S.Sync.loading) return;
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
      for (var i = 0; i < items.length; i += BATCH) {
        var part = items.slice(i, i + BATCH), b = ++this.batch;
        this.batches[b] = this.gen;
        part.forEach(function (it) { self.asked[it.k] = true; });
        this.worker.postMessage({ cmd: 'suggest', gen: this.gen, batch: b, ctx: ctx, items: part });
      }
    },

    /* ------------------------------------------------------------------ painting */
    refreshSoon: S.debounce(function () { this.repaint(); }, 200),

    repaint: function () {
      var app = A();
      if (!app || !app.prices_ui) return;
      if ($('filter').value === 'uzex') app.prices_ui.apply(true);
      else { app.prices_ui.status(); app.prices_ui.list.refresh(); }
    },

    /** The cards, their subtitles and the week controls, as things stand. */
    paint: function () {
      var bar = this.bar;
      if (!bar) return;
      var on = !!(S.Sync && S.Sync.ws);
      bar.hidden = !on;
      if (!on) return;
      var src = this.src, R = S.Refs, imp = this.chosen();
      var refsText = !R ? 'недоступен' : R.state === 'loading' ? 'подготовка ' + R.pct + ' %' :
        R.rec ? 'пакет ' + R.rec.package_id : 'пакет не загружен';
      var uzText = !this.known ? 'сервер без раздела UZEX' : !imp ? 'нет загруженных недель' :
        S.uzex.period(imp.period_from, imp.period_to) + (this.src.market === 'export' ? ' · экспорт' : '');
      [['refs', refsText], ['uzex', uzText]].forEach(function (x) {
        var b = bar.querySelector('.srccard[data-src="' + x[0] + '"]');
        b.classList.toggle('on', !!src[x[0]]);
        b.setAttribute('aria-checked', src[x[0]] ? 'true' : 'false');
        var sm = b.querySelector('small');
        if (sm.textContent !== x[1]) sm.textContent = x[1];
      });
      var opts = bar.querySelector('.srcopts');
      opts.hidden = !src.uzex;
      if (!src.uzex) return;
      var weeks = this.imports.filter(function (x) { return x.market === src.market; });
      var sel = $('uzWeek');
      var html = weeks.map(function (x) {
        return '<option value="' + x.import_id + '">' + S.esc(S.uzex.period(x.period_from, x.period_to)) + '</option>';
      }).join('') || '<option value="">нет недель</option>';
      if (sel.dataset.html !== html) { sel.innerHTML = html; sel.dataset.html = html; }
      sel.value = imp ? String(imp.import_id) : '';
      $('uzMarket').value = src.market;
      $('uzOnlyWeek').checked = !!src.onlyWeek;
      $('uzForward').checked = !!src.forward;
      var i = this.info, t = '';
      if (this.state === 'loading') t = 'подготовка…';
      else if (this.state === 'error') t = 'ошибка';
      else if (i) {
        t = 'котировок: ' + i.used + ' из ' + i.total;
        if (i.left.currency) t += ' · в валюте ' + i.left.currency + ' (не предлагаются)';
        if (!i.used && src.market === 'export') t = 'экспортные котировки — в валюте, как цена в сумах не предлагаются';
      }
      t += (t ? ' · ' : '') + 'цены биржи с НДС — показаны без НДС (÷ 1,12)';
      if ($('uzInfo').textContent !== t) $('uzInfo').textContent = t;
    },

    lines: function (r) { return this.src.uzex && this.state === 'ready' ? (this.map[keyOf(r)] || []) : []; },
    hasRow: function (r) { return this.lines(r).length > 0; },

    statusText: function () {
      if (!this.src.uzex || !(S.Sync && S.Sync.ws)) return '';
      if (this.state === 'loading') return ' · UZEX: подготовка';
      if (this.state !== 'ready') return '';
      var m = A().model, n = 0, self = this;
      if (m) m.resources.forEach(function (r) { if (self.lines(r).length) n++; });
      return n ? ' · UZEX ' + n : '';
    },

    /** Tag markup for a resource row, '' when there is nothing to show. */
    tag: function (r) {
      var l = this.lines(r);
      if (!l.length) return '';
      var top = l[0], near = !!NEAR[top.tier] || unitKind(top) !== 'same';
      var title = 'UZEX (биржа), неделя ' + this.weekText() + ': ' + (S.refs.RU.TIER[top.tier] || '') + (near ? ' — ' + top.name : '');
      return '<button class="tagu' + (near ? ' near' : '') + '" data-res="' + S.esc(r.key) + '" title="' + S.esc(title) + '">' +
        'UZEX ' + (near ? '≈' : '') + (top.price >= 100 ? S.money(top.price) : fmt(top.price)) + (l.length > 1 ? ' +' + (l.length - 1) : '') + '</button>';
    },

    weekText: function (importId) {
      var imp = importId == null ? this.imp : this.imports.filter(function (x) { return x.import_id === importId; })[0];
      return imp ? S.uzex.period(imp.period_from, imp.period_to) : (importId != null ? '№ ' + importId : '');
    },

    /* ------------------------------------------------------------------ a price that came from the exchange */
    /** The source of the resource's market price when it was applied from a quote and is still that price; else ''. */
    applied: function (r) {
      if (!r || !S.Sync || !S.Sync.ws || S.near(r.market, r.price)) return '';
      var m = S.priceSource ? S.priceSource(r.key, r.market) : null;
      if (m) return /^uzex:/.test(m.source || '') ? m.source : '';
      var c = S.Sync.corr && S.Sync.corr[r.key];
      // not while a newer change of this price is still on its way to the server: that one decides
      if (S.Sync.pend && S.Sync.pend[r.key] !== undefined) return '';
      return c && /^uzex:/.test(c.source || '') && S.near(c.market, r.market) ? c.source : '';
    },

    /** The «U» pill of the «Рыночная цена» cell, '' when the price is not from the exchange. */
    cellMark: function (r) {
      var s = this.applied(r);
      if (!s) return '';
      var p = S.uzex.parseSource(s);
      return '<span class="upill u" title="' + S.esc('Цена с биржи UZEX' + (p ? ', неделя ' + this.weekText(p.import_id) : '') +
        '. Введите цену вручную, чтобы снять отметку') + '">U</span>';
    },

    /* ------------------------------------------------------------------ popover */
    recOf: function (key) {
      var m = A().model;
      if (!m) return null;
      for (var i = 0; i < m.resources.length; i++) if (m.resources[i].key === key) return m.resources[i];
      return null;
    },

    quotesOf: function (l) {
      var self = this;
      return S.uzex.rowsOf(l).map(function (n) { return self.byRow[n]; }).filter(function (q) { return !!q; });
    },

    /** The quote as the exchange printed it — the title of a price. */
    tip: function (qs) {
      return qs.map(function (q) {
        var t = [q.name, 'Цена биржи (с НДС): ' + fmt(q.price) + ' сум за ' + q.unit + (q.unit_assumed ? ' (предп.)' : ''),
          'Без НДС: ' + fmt(S.uzex.net(q.price, q.date_to)),
          'Период котировки: ' + S.uzex.period(q.date_from, q.date_to),
          'Изменение: ' + (q.change_pct > 0 ? '+' : q.change_pct < 0 ? '−' : '') + String(Math.abs(q.change_pct)).replace('.', ',') + ' %'];
        var marks = [q.is_forward ? 'форвард' : '', q.is_import ? 'импорт' : '', q.packing || ''].filter(function (x) { return x; });
        if (marks.length) t.push(marks.join(', '));
        return t.join('\n');
      }).join('\n\n');
    },

    show: function (anchor, key) {
      var self = this, rec = this.recOf(key);
      var lines = rec ? this.lines(rec) : [];
      if (!lines.length || !this.imp) { this.hide(); return; }
      this.open = { key: key };
      var sources = {};
      sources[S.uzex.srcId(this.imp)] = { doc_type: 'exchange-quotes', issuer: 'UZEX', doc_no: String(this.imp.import_id),
        issue_date: this.imp.period_to, as_of_date: null, region: 'national' };
      var ctx = { sources: sources, asof: this.asofNow(), smetaPrice: rec.price, unit: rec.unit, regionLabel: S.regionLabel, queryName: rec.name };
      var html = '<div class="rp-head"><span><span class="upill">UZEX</span> биржа · неделя <b>' + S.esc(this.weekText()) + '</b> · ' +
        S.esc(MARKET[this.src.market]) + '</span><button class="link" data-x title="Закрыть">×</button></div>' +
        '<div class="up-note">Биржа котирует цену с НДС — здесь она показана без НДС (÷ 1,12). Если в названии нет единицы — принята тонна («предп.»).</div>';
      if (!S.near(rec.market, rec.price)) html += '<div class="rp-mine">Ваша цена: <b>' + fmt(rec.market) + '</b></div>';
      var sub = false;
      lines.forEach(function (l, i) {
        if (l.tier === 'similar' && !sub) {
          sub = true;
          html += '<div class="hp-sub">Похожие товары биржи<small>цена другого товара — проверьте название</small></div>';
        }
        html += self.lineHtml(l, i, ctx);
      });
      this.pop.innerHTML = html;
      this.pop.querySelector('[data-x]').addEventListener('click', function () { self.hide(); });
      this.pop.querySelectorAll('button[data-fold]').forEach(function (b) {
        b.addEventListener('click', function () {
          var box = self.pop.querySelector('.rp-comps[data-of="' + b.dataset.fold + '"]');
          box.hidden = !box.hidden;
          b.textContent = (box.hidden ? '▸' : '▾') + b.textContent.slice(1);
        });
      });
      this.pop.querySelectorAll('button[data-i]').forEach(function (b) {
        b.addEventListener('click', function () { self.apply(key, lines[+b.dataset.i], ctx); });
      });
      this.place(anchor);
    },

    /** Below the row or above it, whichever has more room, and no taller than that room. */
    place: function (anchor) {
      var row = (anchor.closest && anchor.closest('.vrow')) || anchor;
      var r = row.getBoundingClientRect(), a = anchor.getBoundingClientRect();
      var vh = window.innerHeight, gap = 4, edge = 6;
      this.pop.style.maxHeight = '';
      this.pop.style.top = '0px';
      this.pop.hidden = false;
      var w = this.pop.offsetWidth, h = this.pop.offsetHeight;
      var below = vh - r.bottom - gap - edge, above = r.top - gap - edge;
      var down = h <= below || below >= above;
      var room = Math.max(120, down ? below : above);
      this.pop.style.maxHeight = room + 'px';
      this.pop.style.left = Math.max(8, Math.min(a.left, window.innerWidth - w - 8)) + 'px';
      this.pop.style.top = Math.max(edge, down ? r.bottom + gap : r.top - gap - Math.min(h, room)) + 'px';
    },

    /** Why a line's unit is not the resource's, in words; '' when it is. */
    unitWarn: function (l, v, qs) {
      var kind = unitKind(l), assumed = qs.some(function (q) { return q.unit_assumed; });
      if (kind === 'same') return '';
      var t = kind === 'conv' ? 'Единица другая, цена пересчитана' + (v.conv ? ': ' + v.conv : '') :
        'Единица другая: пересчёт возможен только по данным изделия (масса, длина, фасовка) — проверьте и введите цену вручную';
      return t + (assumed ? '. Единица на бирже не указана — принята тонна' : '');
    },

    lineHtml: function (l, i, ctx) {
      var v = S.refs.view(l, ctx), qs = this.quotesOf(l), kind = unitKind(l);
      var near = !!NEAR[l.tier], warn = this.unitWarn(l, v, qs);
      var one = qs.length === 1 ? qs[0] : null;
      var h = '<div class="up-line' + (near ? ' near' : '') + (i === 0 ? ' top' : '') + '">' +
        '<div class="rp-top"><b class="up-price" title="' + S.esc(this.tip(qs)) + '">' + (kind === 'derived' ? '≈ ' : '') + S.esc(v.price) + '</b>' +
        '<span class="upill">UZEX</span>' +
        '<span class="rp-badge t-' + S.esc(l.tier) + '">' + S.esc(v.badge) + '</span>' +
        (v.summary ? '<span class="rp-sum">' + S.esc(v.summary) + '</span>' : '') +
        (v.flags.length ? '<span class="rp-flags">' + S.esc(v.flags.join(', ')) + '</span>' : '') +
        (warn ? '<span class="up-warn" title="' + S.esc(warn) + '">⚠</span>' : '') +
        (kind === 'derived' ? '' : '<button class="btn sm" data-i="' + i + '">Применить</button>') + '</div>' +
        '<div class="rp-name">' + S.esc(one ? one.name : v.name) + '</div>';
      if (v.evidence.length) h += '<div class="rp-ev">' + S.esc(v.evidence.join(' · ')) + '</div>';
      var meta = one ? ['котировка ' + S.uzex.period(one.date_from, one.date_to),
        'изменение ' + (one.change_pct > 0 ? '+' : one.change_pct < 0 ? '−' : '') + String(Math.abs(one.change_pct)).replace('.', ',') + ' %',
        'на бирже ' + fmt(one.price) + ' с НДС за ' + one.unit + (one.unit_assumed ? ' (предп.)' : ''), one.packing, one.is_import ? 'импорт' : '']
        : ['медиана котировок: ' + qs.length];
      h += '<div class="rp-src">' + S.esc(meta.filter(function (x) { return x; }).join(' · ')) + (v.age ? ' · ' + S.esc(v.age) : '') + '</div>';
      if (warn) h += '<div class="up-warnt">⚠ ' + S.esc(warn) + '</div>';
      if (v.vsSmeta) h += '<div class="rp-vs">' + S.esc(v.vsSmeta) + '</div>';
      if (qs.length > 1) {
        h += '<button class="link rp-fold" data-fold="' + i + '">▸ котировки (' + qs.length + ')</button>' +
          '<div class="rp-comps" data-of="' + i + '" hidden>' + qs.map(function (q) {
            return '<div class="rp-comp"><b>' + S.esc(fmt(S.uzex.net(q.price, q.date_to))) + '</b><div><div class="rp-name">' + S.esc(q.name) + '</div>' +
              '<div class="rp-src">' + S.esc('за ' + q.unit + (q.unit_assumed ? ' (предп.)' : '') + ' · на бирже ' + fmt(q.price) + ' с НДС · котировка ' + S.uzex.period(q.date_from, q.date_to)) +
              '</div></div></div>';
          }).join('') + '</div>';
      }
      return h + '</div>';
    },

    hide: function () { if (this.pop) this.pop.hidden = true; this.open = null; },

    /** «Применить»: that line's price on the clicked resource line, and where it came from. */
    apply: function (key, line, ctx) {
      var app = A(), rec = this.recOf(key);
      if (!rec || !line || !this.imp || !(line.price > 0) || unitKind(line) === 'derived') return;
      var price = round2(line.price);
      if (unitKind(line) === 'conv') {
        var warn = this.unitWarn(line, S.refs.view(line, ctx), this.quotesOf(line));
        if (!window.confirm(warn + '.\n\nПрименить ' + fmt(price) + ' за ' + (rec.unit || 'единицу') + '?')) return;
      }
      if (!S.near(rec.market, rec.price) && !S.near(rec.market, price) &&
          !window.confirm('Заменить вашу цену ' + fmt(rec.market) + ' на ' + fmt(price) + '?')) return;
      if (S.markSource) S.markSource(key, price, S.uzex.sourceOf(this.imp.import_id, line));
      app.setPrice(key, price);
      app.prices_ui.apply(true);
      app.sheetList.refresh();
      app.toast('Применено: ' + fmt(price) + ' (UZEX, неделя ' + this.weekText() + ')');
      this.hide();
    }
  };

  S.Uzex = U;
  document.addEventListener('DOMContentLoaded', function () { U.init(); });
  if (document.readyState !== 'loading') U.init();
})(S);
