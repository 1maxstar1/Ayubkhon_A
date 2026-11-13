/*
 * «Память»: the prices of finished applications, shown for the resources of the open one (docs/ai-reja.md, phase 2).
 *
 * What a finished application left in price_memory (src/ui/journal.js) comes back here, for the same resource (name
 * and unit by the cross-project keys) in the same region — never another region, as «Прежние проекты»:
 *
 *   - the tag «пам.» on a resource the expert priced before, and its popover: his corrected prices, the same
 *     contragent's first, then the others'; one the contractor took («принята подрядчиком») before a newer one; each
 *     with its application, contragent and date. «Применить» sets the price as every suggestion does (and only it);
 *   - the mark in the «цена по смете» cell: «✓» when independent applications accepted this smeta price or a higher
 *     one before («ранее принято»), «▲» and an amber cell when the smeta price is above what was accepted. The popover
 *     names the applications. What makes a ceiling, and how it ages, is S.memory (src/lib/memory.js).
 *
 * The switch «Память» on the toolbar turns all of it off (kept in this browser). Nothing here sets a price by itself,
 * and nothing here reorders the other suggestions.
 *
 * Server only. A server from before the memory answers 404 and the page stays as it was.
 */
(function (S) {
  'use strict';
  if (!S.pb) return;

  var PER = 40;              // match keys in one request
  var PREF = 'smeta.memory.off';
  var SEP = '␟';
  var FIELDS = 'id,workspace,application,contragent,match_key,match_unit_key,kind,source,smeta_price,final_price,asof,finished,accepted,' +
    'expand.application.number,expand.application.org_name,expand.contragent.name';

  function $(id) { return document.getElementById(id); }
  function A() { return window.app; }
  function mkOf(r) { return r.mk || S.matchPair(r.name, r.unit || ''); }
  function fmt(v) { return S.price(v); }
  function day(d) { var t = new Date(String(d || '').replace(' ', 'T')); return isNaN(t) ? '' : t.toLocaleDateString('ru-RU'); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function off() { try { return localStorage.getItem(PREF) === '1'; } catch (e) { return false; } }
  function srcText(s) {
    return /^ref:/.test(s) ? 'из справочника' : /^uzex:/.test(s) ? 'с биржи UZEX' : /^(hint|mem):/.test(s) ? 'из прежней заявки' : 'введена вручную';
  }

  var M = {
    on: !off(),
    map: {},           // match pair → rows of price_memory
    asked: {},         // match key → 1
    cache: {},         // match pair → S.memory.rank(...)
    gen: 0, t: 0, key: null, pop: null,

    usable: function () { var Sy = S.Sync; return !!(this.on && Sy && Sy.ws && !Sy.loading && A() && A().model); },

    reset: function () { this.gen++; this.map = {}; this.asked = {}; this.cache = {}; this.hide(); clearTimeout(this.t); },

    loadSoon: function () {
      var self = this;
      clearTimeout(this.t);
      this.t = setTimeout(function () { self.load(); }, 400);
    },

    /** Ask for every resource not asked about yet. */
    load: function () {
      if (!this.usable()) return;
      var self = this, gen = this.gen, Sy = S.Sync, want = [];
      A().model.resources.forEach(function (r) {
        var k = S.matchKey(r.name);
        if (k && !self.asked[k]) { self.asked[k] = 1; want.push(k); }
      });
      if (!want.length) return;
      var chunks = [];
      for (var i = 0; i < want.length; i += PER) chunks.push(want.slice(i, i + PER));
      chunks.reduce(function (p, ch) {
        return p.then(function () {
          if (gen !== self.gen) return;
          var params = { r: Sy.ws.region, w: Sy.ws.id };
          var ors = ch.map(function (k, n) { params['k' + n] = k; return 'match_key = {:k' + n + '}'; }).join(' || ');
          return S.pb.collection('price_memory').getFullList({
            batch: 500, sort: '-finished', expand: 'application,contragent', fields: FIELDS,
            filter: S.pb.filter('region = {:r} && workspace != {:w} && (' + ors + ')', params)
          }).then(function (rows) {
            if (gen !== self.gen || !rows.length) return;
            rows.forEach(function (c) {
              var a = c.expand && c.expand.application, ct = c.expand && c.expand.contragent;
              var pair = c.match_key + SEP + c.match_unit_key;
              (self.map[pair] = self.map[pair] || []).push({ id: c.id, workspace: c.workspace, application: c.application, contragent: c.contragent,
                kind: c.kind, source: c.source || '', smeta_price: c.smeta_price, final_price: c.final_price, asof: c.asof, finished: c.finished, accepted: !!c.accepted,
                number: a ? a.number : '', who: ct ? ct.name : (a ? a.org_name : '') });
              delete self.cache[pair];
            });
            self.repaint();
          });
        });
      }, Promise.resolve()).catch(function () { /* an older server, or none: the page stays as it was */ });
    },

    repaint: function () {
      var app = A();
      if (!app || !app.prices_ui) return;
      app.prices_ui.list.refresh();
      app.prices_ui.status();
    },

    /** What the memory says about a resource: { prices, ceiling }. */
    of: function (r) {
      if (!this.on || !r) return { prices: [], ceiling: null };
      var mk = mkOf(r), c = this.cache[mk];
      if (!c) {
        var Sy = S.Sync;
        c = this.cache[mk] = S.memory.rank(this.map[mk] || [], { contragent: Sy && Sy.app ? Sy.app.contragent : '', today: today() });
      }
      return c;
    },
    hasRow: function (r) { return this.of(r).prices.length > 0; },

    /** The tag of the name cell: the expert priced this resource before. */
    tag: function (r) {
      var e = this.of(r);
      if (!e.prices.length) return '';
      var top = e.prices[0];
      return '<button class="tagp' + (top.cls === 1 ? ' own' : '') + '" data-mem="' + S.esc(r.key) + '" title="' +
        S.esc('Память: ваша цена из завершённой заявки — ' + fmt(top.price) + (top.cls === 1 ? ' (этот контрагент)' : '') +
          (e.prices.length > 1 ? ', всего ' + e.prices.length : '') + '. Нажмите — подробности') + '">пам.</button>';
    },

    /** The mark of the smeta-price cell: { cls, html }. */
    ceil: function (r) {
      var e = this.of(r), v = S.memory.verdict(r.price, e.ceiling);
      if (!v) return { cls: '', html: '' };
      var c = e.ceiling;
      var t = v === 'accepted'
        ? 'Ранее принято: такую или более высокую сметную цену оставили без изменений в ' + c.apps + ' независимых заявках (до ' + fmt(c.price) + ')'
        : 'Выше принятого ранее: без изменений оставляли до ' + fmt(c.price) + ' (' + c.apps + ' независимых заявок), здесь ' + fmt(r.price);
      return { cls: v === 'above' ? ' mover' : '', html: '<button class="mceil ' + (v === 'accepted' ? 'ok' : 'over') + '" data-memc="' + S.esc(r.key) +
        '" title="' + S.esc(t + '. Нажмите — подробности') + '">' + (v === 'accepted' ? '✓' : '▲') + '</button>' };
    },

    statusText: function () {
      if (!this.usable()) return '';
      var n = 0, over = 0, self = this;
      A().model.resources.forEach(function (r) {
        var e = self.of(r);
        if (e.prices.length) n++;
        if (S.memory.verdict(r.price, e.ceiling) === 'above') over++;
      });
      return (n ? ' · в памяти ' + n : '') + (over ? ' · выше принятого ' + over : '');
    },

    recOf: function (key) {
      var m = A().model;
      if (!m) return null;
      for (var i = 0; i < m.resources.length; i++) if (m.resources[i].key === key) return m.resources[i];
      return null;
    },

    show: function (anchor, key) {
      var self = this, rec = this.recOf(key), e = this.of(rec);
      if (!rec || (!e.prices.length && !e.ceiling)) { this.hide(); return; }
      this.key = key;
      var region = S.Sync && S.Sync.ws ? S.regionLabel(S.Sync.ws.region) : '';
      var html = '<div class="mp-head"><span>Память: завершённые заявки · ' + S.esc(region) + ' <small>цены без НДС</small></span>' +
        '<button class="link" data-x title="Закрыть">×</button></div>';
      if (!S.near(rec.market, rec.price)) html += '<div class="mp-mine">Ваша цена: <b>' + fmt(rec.market) + '</b></div>';
      var cls = 0;
      e.prices.slice(0, 8).forEach(function (p, i) {
        if (p.cls !== cls) { cls = p.cls; html += '<div class="mp-sub">' + (cls === 1 ? 'Этот контрагент' : 'Другие контрагенты') + '</div>'; }
        var r = p.row;
        html += '<div class="mp-row"><b class="mp-price">' + fmt(p.price) + '</b><div class="mp-what">' +
          (p.accepted ? '<em class="mp-acc" title="В возвращённой смете подрядчик поставил эту цену («Исправлено»)">принята подрядчиком</em> ' : '') +
          '<span>' + S.esc(srcText(r.source)) + '</span>' +
          '<small>№ ' + S.esc(r.number) + ' · ' + S.esc(r.who) + ' · ' + S.esc(day(S.memory.dateOf(r))) +
          (r.smeta_price > 0 ? ' · сметная цена там: ' + fmt(r.smeta_price) : '') + '</small></div>' +
          '<button class="btn sm" data-i="' + i + '">Применить</button></div>';
      });
      if (e.ceiling) {
        var c = e.ceiling, v = S.memory.verdict(rec.price, c);
        html += '<div class="mp-sub">Оставлено как в смете</div><div class="mp-ceil ' + (v === 'above' ? 'over' : 'ok') + '">' +
          (v === 'above' ? '▲ Сметная цена ' + fmt(rec.price) + ' выше принятого ранее: без изменений оставляли до <b>' + fmt(c.price) + '</b>'
            : '✓ Ранее принято: без изменений оставляли до <b>' + fmt(c.price) + '</b>') + ' — ' + c.apps + ' независимых заявок' +
          '<small>это не рыночная цена, а граница: цену ниже рынка программа не трогает</small></div>' +
          c.rows.slice(0, 6).map(function (r) {
            return '<div class="mp-ev">' + fmt(r.final_price) + ' · № ' + S.esc(r.number) + ' · ' + S.esc(r.who) + ' · ' + S.esc(day(S.memory.dateOf(r))) +
              ' · ' + (r.kind === 'checked' ? 'проверено' : 'оставлено') + '</div>';
          }).join('');
      }
      this.pop.innerHTML = html;
      this.pop.querySelector('[data-x]').addEventListener('click', function () { self.hide(); });
      this.pop.querySelectorAll('button[data-i]').forEach(function (b) {
        b.addEventListener('click', function () { self.apply(key, e.prices[+b.dataset.i]); });
      });
      this.place(anchor);
    },

    /** Below the row or above it, whichever has more room. */
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

    hide: function () { if (this.pop) this.pop.hidden = true; this.key = null; },

    /** «Применить»: that earlier price on the resource, and where it came from (mem:<row>). */
    apply: function (key, p) {
      var app = A(), rec = this.recOf(key);
      if (!rec || !p || !(p.price > 0)) return;
      if (!S.near(rec.market, rec.price) && !S.near(rec.market, p.price) &&
          !window.confirm('Заменить вашу цену ' + fmt(rec.market) + ' на ' + fmt(p.price) + '?')) return;
      if (S.markSource) S.markSource(key, p.price, 'mem:' + p.row.id);
      app.setPrice(key, p.price);
      this.hide();
      app.prices_ui.afterApply(key);
      app.sheetList.refresh();
      app.toast('Применено: ' + fmt(p.price) + ' (память, заявка № ' + p.row.number + ')');
    },

    /** The row a memory source names, when it is among those read (for the cell's badge). */
    byId: function (id) {
      var maps = this.map, out = null;
      Object.keys(maps).some(function (k) { return maps[k].some(function (r) { if (r.id === id) { out = r; return true; } return false; }); });
      return out;
    },

    toggle: function (on) {
      this.on = !!on;
      try { if (on) localStorage.removeItem(PREF); else localStorage.setItem(PREF, '1'); } catch (e) { /* not kept */ }
      this.hide();
      this.cache = {};
      if (on) this.load();
      this.repaint();
    },

    init: function () {
      var self = this;
      if (this.inited || !$('priceScroll')) return;
      this.inited = true;
      this.pop = document.createElement('div');
      this.pop.id = 'memPop';
      this.pop.className = 'mempop';
      this.pop.hidden = true;
      document.body.appendChild(this.pop);
      var sc = $('priceScroll');
      sc.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('.tagp,.mceil');
        if (b) { e.preventDefault(); self.show(b, b.dataset.mem || b.dataset.memc); }
      });
      sc.addEventListener('scroll', function () { if (!self.pop.hidden) self.hide(); }, { passive: true });
      document.addEventListener('click', function (e) {
        if (self.pop.hidden) return;
        if (!document.documentElement.contains(e.target)) return;
        if (self.pop.contains(e.target) || (e.target.closest && e.target.closest('.tagp,.mceil'))) return;
        self.hide();
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') self.hide(); });
      // the switch, beside the other tools of the list
      var reset = $('resetBtn');
      if (reset && !$('memOn')) {
        var lab = document.createElement('label');
        lab.className = 'memtog'; lab.hidden = true; lab.id = 'memTog';
        lab.title = 'Показывать цены завершённых заявок: ваши прежние цены («пам.») и отметку «ранее принято» у сметной цены';
        lab.innerHTML = '<input type="checkbox" id="memOn"' + (this.on ? ' checked' : '') + '> Память';
        reset.parentNode.insertBefore(lab, reset);
        $('memOn').addEventListener('change', function (e) { self.toggle(e.target.checked); });
      }
      document.addEventListener('ws:open', function () { self.reset(); if ($('memTog')) $('memTog').hidden = false; self.loadSoon(); });
      document.addEventListener('ws:close', function () { self.reset(); if ($('memTog')) $('memTog').hidden = true; });
      // the estimates of the application are read after it opens, and more may be added: asked again whenever the
      // suggestions of earlier projects are (sync.js calls S.Hints.loadSoon then), and after a rebuild
      var again = function (obj, name) {
        var orig = obj && obj[name];
        if (typeof orig !== 'function') return;
        obj[name] = function () {
          var out = orig.apply(this, arguments);
          try { if (S.Sync && S.Sync.ws) self.loadSoon(); } catch (e) { /* never in the way */ }
          return out;
        };
      };
      again(S.Hints, 'loadSoon');
      again(S.App.prototype, 'rebuild');
    }
  };

  S.Memory = M;
  document.addEventListener('DOMContentLoaded', function () { M.init(); });
  if (document.readyState !== 'loading') M.init();
})(S);
