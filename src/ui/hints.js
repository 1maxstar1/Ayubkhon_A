/*
 * Price hints: what earlier projects in the same region paid for the same
 * resource (name + unit). Same-contragent entries come first; other regions
 * are never shown. Data comes from the `corrections` collection.
 */
(function (S) {
  'use strict';
  if (!S.pb) return;

  // PocketBase rejects filter expressions above ~3500 bytes (Cyrillic is two
  // bytes a letter), so chunks are cut by encoded size, not by key count.
  var CHUNK_BYTES = 2800;
  var enc = new TextEncoder();
  function bytes(s) { return enc.encode(s).length; }

  function $(id) { return document.getElementById(id); }
  function A() { return window.app; }
  function day(d) {
    var x = new Date(d);
    return isNaN(x) ? '' : x.toLocaleDateString('ru-RU');
  }

  var Hints = {
    map: {}, fetched: {}, busy: false,

    init: function () {
      var self = this;
      var P = S.App.prototype;
      var orig = P.rebuild;
      P.rebuild = function () {
        var r = orig.apply(this, arguments);
        self.loadSoon();
        return r;
      };
      document.addEventListener('ws:open', function () { self.reset(); });
      document.addEventListener('ws:close', function () { self.reset(); });

      this.pop = document.createElement('div');
      this.pop.id = 'hintPop';
      this.pop.hidden = true;
      document.body.appendChild(this.pop);
      document.addEventListener('click', function (e) {
        if (self.pop.hidden) return;
        if (self.pop.contains(e.target) || (e.target.classList && e.target.classList.contains('tagh'))) return;
        self.hide();
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') self.hide(); });
      ['priceScroll', 'sheetScroll'].forEach(function (id) {
        var sc = $(id);
        sc.addEventListener('click', function (e) {
          var b = e.target.closest && e.target.closest('.tagh');
          if (b) { e.preventDefault(); self.show(b, b.dataset.hk, b.dataset.key); }
        });
        sc.addEventListener('focusin', function (e) {
          var inp = e.target;
          if (!inp.classList || !inp.classList.contains('pin')) return;
          var rec = self.recOf(inp.dataset.key);
          if (rec && self.for(rec.nk).length) self.show(inp, rec.nk, rec.key);
        });
        sc.addEventListener('scroll', function () { self.hide(); }, { passive: true });
      });
    },

    reset: function () { this.map = {}; this.fetched = {}; this.hide(); },

    recOf: function (key) {
      var m = A().model;
      if (!m) return null;
      for (var i = 0; i < m.resources.length; i++) if (m.resources[i].key === key) return m.resources[i];
      return null;
    },

    /** Hints for a name+unit key, best first. */
    for: function (nk) { return this.map[nk] || []; },
    has: function (nk) { return !!(this.map[nk] && this.map[nk].length); },

    loadSoon: S.debounce(function () { this.load(); }, 400),

    load: function () {
      var self = this, app = A();
      var ws = S.Sync && S.Sync.ws;
      if (!ws || !app.model || S.Sync.loading) return;
      var keys = {};
      app.model.resources.forEach(function (r) {
        var nk = S.nameKey(r.name);
        if (nk && !self.fetched[nk]) keys[nk] = 1;
      });
      var list = Object.keys(keys);
      if (!list.length) return;
      list.forEach(function (k) { self.fetched[k] = 1; });
      var chunks = [], cur = [], size = 0;
      list.forEach(function (k) {
        var b = bytes(k) + 24;
        if (cur.length && size + b > CHUNK_BYTES) { chunks.push(cur); cur = []; size = 0; }
        cur.push(k); size += b;
      });
      if (cur.length) chunks.push(cur);
      var mine = S.Sync.app && S.Sync.app.contragent;
      var got = 0, fresh = {};
      Promise.all(chunks.map(function (ch) {
        var params = { w: ws.id, r: ws.region };
        var ors = ch.map(function (k, i) { params['k' + i] = k; return 'name_key = {:k' + i + '}'; }).join(' || ');
        return S.pb.collection('corrections').getFullList({
          filter: S.pb.filter('region = {:r} && workspace != {:w} && (' + ors + ')', params),
          sort: '-updated', expand: 'application,contragent,by', batch: 500
        }).then(function (items) {
          items.forEach(function (c) {
            var nk = S.nameUnitKey(c.name, c.unit || '');
            var a = c.expand && c.expand.application, ct = c.expand && c.expand.contragent, by = c.expand && c.expand.by;
            (fresh[nk] = fresh[nk] || []).push({
              price: c.market_price, smeta: c.smeta_price, note: c.note, at: c.updated,
              number: a ? a.number : '', contragent: ct ? ct.name : (a ? a.org_name : ''),
              region: c.region, by: by ? (by.name || by.email) : '',
              same: !!(mine && c.contragent === mine)
            });
            got++;
          });
        });
      })).then(function () {
        // rank first, publish after: a half-loaded map would show unsorted tags
        Object.keys(fresh).forEach(function (nk) { self.map[nk] = rank((self.map[nk] || []).concat(fresh[nk])); });
        if (got) {
          app.prices_ui.apply();
          app.sheetList.refresh();
          app.toast(Object.keys(self.map).length + ' ta resurs uchun oldingi loyihalardan narx eslatmalari bor');
        }
      }).catch(function (e) {
        console.error('hints', e);
        app.toast('Eslatmalar yuklanmadi: ' + S.pbErr(e), true);
      });
    },

    /* --------------------------------------------------------- popover */
    show: function (anchor, nk, key) {
      var self = this, app = A();
      var hs = this.for(nk);
      if (!hs.length) { this.hide(); return; }
      var rec = this.recOf(key);
      this.pop.innerHTML = '<div class="hp-head">Oldingi loyihalar · ' + S.esc(S.regionLabel(S.Sync.ws.region)) +
        '<button class="link" data-x>×</button></div>' +
        hs.slice(0, 12).map(function (h, i) {
          return '<div class="hp-row' + (h.same ? ' same' : '') + '">' +
            '<b>' + S.price(h.price) + '</b>' +
            '<span class="hp-meta">№ ' + S.esc(h.number) + ' · ' + S.esc(h.contragent) + ' · ' + day(h.at) +
            (h.same ? ' <em>shu kontragent</em>' : '') +
            (h.count > 1 ? ' · ×' + h.count : '') +
            (h.smeta != null && rec && !S.near(h.smeta, rec.price) ? '<small>smeta narxi u yerda: ' + S.price(h.smeta) + '</small>' : '') +
            '</span>' +
            '<button class="btn sm" data-i="' + i + '">Qo\'llash</button></div>';
        }).join('');
      this.pop.querySelector('[data-x]').addEventListener('click', function () { self.hide(); });
      this.pop.querySelectorAll('button[data-i]').forEach(function (b) {
        b.addEventListener('click', function () {
          var h = hs[+b.dataset.i];
          app.setPrice(key, h.price);
          app.prices_ui.apply();
          app.sheetList.refresh();
          app.toast(S.price(h.price) + ' qo\'llandi');
          self.hide();
        });
      });
      var r = anchor.getBoundingClientRect();
      this.pop.hidden = false;
      var w = this.pop.offsetWidth, hgt = this.pop.offsetHeight;
      var left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      var top = r.bottom + 4 + hgt > window.innerHeight ? r.top - hgt - 4 : r.bottom + 4;
      this.pop.style.left = left + 'px';
      this.pop.style.top = Math.max(4, top) + 'px';
    },
    hide: function () { this.pop.hidden = true; },

    /** Tag markup for a resource row, '' when there is nothing to show. */
    tag: function (r) {
      var hs = this.for(r.nk);
      if (!hs.length) return '';
      var best = hs[0];
      return '<button class="tagh' + (best.same ? ' same' : '') + '" data-hk="' + S.esc(r.nk) + '" data-key="' + S.esc(r.key) +
        '" title="Oldingi loyihalardan narx eslatmalari">' + S.price(best.price) + (hs.length > 1 ? ' +' + (hs.length - 1) : '') + '</button>';
    }
  };

  /** Same contragent first, newest first; identical prices from one source collapse. */
  function rank(list) {
    var seen = {}, out = [];
    list.sort(function (a, b) { return (b.same - a.same) || (new Date(b.at) - new Date(a.at)); });
    list.forEach(function (h) {
      var k = h.number + '|' + h.price;
      if (seen[k]) { seen[k].count++; return; }
      h.count = 1; seen[k] = h; out.push(h);
    });
    return out;
  }
  Hints.rank = rank;

  S.Hints = Hints;
  document.addEventListener('DOMContentLoaded', function () { Hints.init(); });
  if (document.readyState !== 'loading') Hints.init();
})(S);
