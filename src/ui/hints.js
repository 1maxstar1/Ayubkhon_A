/*
 * Price hints: what earlier projects in the same region paid for the same
 * resource. Same-contragent entries come first; other regions are never shown.
 * Data comes from the `corrections` collection.
 *
 * Two tiers, because the same resource is rarely typed the same way twice:
 *
 *   exact    the match key agrees — one alphabet, no separators, digits
 *            intact. «КАШТАН», «Kashtan» and «KАШТАН» all land here together.
 *   similar  nothing matched exactly, so the closest names of the region are
 *            offered with a score: «ТРОЙНИК ПОЛИЭТИЛЕНОВЫЕ Д-110ММ» for
 *            «ТРОЙНИКИ ПОЛИЭТИЛЕНОВЫЙ Д-110ММ». Never automatic — the number
 *            guard in S.similarity keeps «АНКЕР М5» away from «АНКЕР М8», and
 *            the expert still has to press Применить.
 */
(function (S) {
  'use strict';
  if (!S.pb) return;

  // PocketBase rejects filter expressions above ~3500 bytes (Cyrillic is two
  // bytes a letter), so chunks are cut by encoded size, not by key count.
  var CHUNK_BYTES = 2800;
  // How much of the match key a similar name has to share before it is even
  // fetched. Three characters keep «ТРОЙНИК»/«ТРОЙНИКИ» together and still reach
  // «ОМIСRОN» from «OMICRON», whose fourth letter is where they diverge.
  var PREFIX = 3;
  var SIM_PER_CHUNK = 400;      // newest rows per prefix query
  var SIM_MIN = 0.62;           // below this two names are merely related
  var SIM_SHOW = 4;             // suggestions offered per resource

  var enc = new TextEncoder();
  function bytes(s) { return enc.encode(s).length; }

  function $(id) { return document.getElementById(id); }
  function A() { return window.app; }
  function day(d) {
    var x = new Date(d);
    return isNaN(x) ? '' : x.toLocaleDateString('ru-RU');
  }
  /** The lookup key of a resource row, computed if the model predates match.js. */
  function mkOf(r) { return r && (r.mk || S.matchPair(r.name, r.unit || '')); }

  var Hints = {
    map: {}, sim: {}, fetched: {}, prefixed: {}, pool: [], busy: false,

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
          if (rec && self.any(mkOf(rec))) self.show(inp, mkOf(rec), rec.key);
        });
        sc.addEventListener('scroll', function () { self.hide(); }, { passive: true });
      });
    },

    reset: function () {
      this.map = {}; this.sim = {}; this.fetched = {}; this.prefixed = {}; this.pool = [];
      this.hide();
    },

    recOf: function (key) {
      var m = A().model;
      if (!m) return null;
      for (var i = 0; i < m.resources.length; i++) if (m.resources[i].key === key) return m.resources[i];
      return null;
    },

    /** Hints whose match key is the resource's own, best first. */
    for: function (mk) { return this.map[mk] || []; },
    /** Close-but-not-equal names, best first. */
    similar: function (mk) { return this.sim[mk] || []; },
    has: function (mk) { return !!(this.map[mk] && this.map[mk].length); },
    any: function (mk) { return this.for(mk).length + this.similar(mk).length > 0; },
    /* The same two questions asked with a resource row in hand. */
    hasRow: function (r) { return this.has(mkOf(r)); },
    nearRow: function (r) { return !this.has(mkOf(r)) && this.similar(mkOf(r)).length > 0; },
    anyRow: function (r) { return this.any(mkOf(r)); },

    loadSoon: S.debounce(function () { this.load(); }, 400),

    load: function () {
      var self = this, app = A();
      var ws = S.Sync && S.Sync.ws;
      if (!ws || !app.model || S.Sync.loading) return;
      var want = {};
      app.model.resources.forEach(function (r) {
        var mk = S.matchKey(r.name);
        if (mk && !self.fetched[mk]) want[mk] = 1;
      });
      var list = Object.keys(want);
      if (!list.length) { this.loadSimilar(); return; }
      // Marked as fetched only once the answer is in. Marking them here meant a
      // single network hiccup left those resources without hints for the rest
      // of the session, with nothing on screen to say why.

      var got = 0, fresh = {};
      Promise.all(chunk(list).map(function (ch) {
        var params = { w: ws.id, r: ws.region };
        var ors = ch.map(function (k, i) { params['k' + i] = k; return 'match_key = {:k' + i + '}'; }).join(' || ');
        return S.pb.collection('corrections').getFullList({
          filter: S.pb.filter('region = {:r} && workspace != {:w} && (' + ors + ')', params),
          sort: '-updated', expand: 'application,contragent,by', batch: 500
        }).then(function (items) {
          items.forEach(function (c) {
            var h = hintOf(c);
            (fresh[S.matchPair(c.name, c.unit || '')] = fresh[S.matchPair(c.name, c.unit || '')] || []).push(h);
            got++;
          });
        });
      })).then(function () {
        list.forEach(function (k) { self.fetched[k] = 1; });
        // rank first, publish after: a half-loaded map would show unsorted tags
        Object.keys(fresh).forEach(function (mk) { self.map[mk] = rank((self.map[mk] || []).concat(fresh[mk])); });
        if (got) {
          app.prices_ui.apply();
          app.sheetList.refresh();
          app.toast('Подсказки цен из прежних проектов: ресурсов ' + Object.keys(self.map).length);
        }
        self.loadSimilar();
      }).catch(function (e) {
        if (e && e.status === 0) return;      // page left / request aborted — nothing to report
        console.error('hints', e);
        app.toast('Подсказки не загружены: ' + S.pbErr(e), true);
      });
    },

    /**
     * Second pass, for the resources nothing matched exactly. Only names that
     * open the same way are fetched — the index does that part — and the
     * ranking then happens here, where the whole name is available.
     */
    loadSimilar: function () {
      var self = this, app = A();
      var ws = S.Sync && S.Sync.ws;
      if (!ws || !app.model || S.Sync.loading) return;
      var open = app.model.resources.filter(function (r) { return !self.has(mkOf(r)); });
      if (!open.length) return;
      var want = {};
      open.forEach(function (r) {
        var p = S.matchKey(r.name).slice(0, PREFIX);
        if (p.length === PREFIX && !self.prefixed[p]) want[p] = 1;
      });
      var list = Object.keys(want);
      if (!list.length) { this.rankSimilar(open); return; }

      Promise.all(chunk(list).map(function (ch) {
        var params = { w: ws.id, r: ws.region };
        var ors = ch.map(function (p, i) { params['p' + i] = p + '%'; return 'match_key ~ {:p' + i + '}'; }).join(' || ');
        return S.pb.collection('corrections').getList(1, SIM_PER_CHUNK, {
          filter: S.pb.filter('region = {:r} && workspace != {:w} && (' + ors + ')', params),
          sort: '-updated', expand: 'application,contragent,by'
        }).then(function (res) { return res.items; });
      })).then(function (lists) {
        list.forEach(function (p) { self.prefixed[p] = 1; });
        var seen = {};
        self.pool.forEach(function (c) { seen[c.id] = 1; });
        lists.forEach(function (items) {
          items.forEach(function (c) {
            if (seen[c.id]) return;
            seen[c.id] = 1;
            self.pool.push(c);
          });
        });
        self.rankSimilar(open);
      }).catch(function (e) {
        if (e && e.status === 0) return;
        console.error('hints:similar', e);
      });
    },

    /** Score the fetched neighbourhood against every unmatched resource. */
    rankSimilar: function (open) {
      var self = this, app = A();
      if (!this.pool.length) return;
      var cands = this.pool.map(function (c) { return { name: c.name, unit: c.unit || '', rec: c }; });
      var idf = S.idfOf(cands.map(function (c) { return c.name; }));
      var found = 0;
      open.forEach(function (r) {
        var mk = mkOf(r);
        if (self.sim[mk]) return;
        var best = S.bestMatches(r.name, r.unit || '', cands, { idf: idf, min: SIM_MIN, limit: SIM_SHOW });
        if (!best.length) return;
        self.sim[mk] = best.map(function (b) {
          var h = hintOf(b.item.rec);
          h.score = b.score;
          h.name = b.item.name;
          return h;
        });
        found++;
      });
      if (found) {
        app.prices_ui.apply();
        app.sheetList.refresh();
        app.toast('Похожие ресурсы найдены: ' + found);
      }
    },

    /* --------------------------------------------------------- popover */
    show: function (anchor, mk, key) {
      var self = this, app = A();
      var hs = this.for(mk), ss = this.similar(mk);
      if (!hs.length && !ss.length) { this.hide(); return; }
      var rec = this.recOf(key);
      var shown = hs.slice(0, 12);
      var html = '<div class="hp-head">Прежние проекты · ' + S.esc(S.regionLabel(S.Sync.ws.region)) +
        '<button class="link" data-x>×</button></div>';
      html += shown.map(function (h, i) { return row(h, i, rec, false); }).join('');
      if (ss.length) {
        html += '<div class="hp-sub">Похожие ресурсы' +
          '<small>цена другого ресурса — проверьте название</small></div>' +
          ss.map(function (h, i) { return row(h, shown.length + i, rec, true); }).join('');
      }
      var all = shown.concat(ss);
      this.pop.innerHTML = html;
      this.pop.querySelector('[data-x]').addEventListener('click', function () { self.hide(); });
      this.pop.querySelectorAll('button[data-i]').forEach(function (b) {
        b.addEventListener('click', function () {
          var h = all[+b.dataset.i];
          app.setPrice(key, h.price);
          app.prices_ui.apply();
          app.sheetList.refresh();
          app.toast('Применено: ' + S.price(h.price));
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
      var mk = mkOf(r);
      var hs = this.for(mk);
      var ss = hs.length ? null : this.similar(mk);
      var best = hs.length ? hs[0] : (ss && ss.length ? ss[0] : null);
      if (!best) return '';
      var more = hs.length ? hs.length - 1 : ss.length - 1;
      var cls = hs.length ? (best.same ? ' same' : '') : ' near';
      var title = hs.length ? 'Подсказки цен из прежних проектов'
        : 'Похожий ресурс: ' + best.name + ' (' + Math.round(best.score * 100) + '%)';
      return '<button class="tagh' + cls + '" data-hk="' + S.esc(mk) + '" data-key="' + S.esc(r.key) +
        '" title="' + S.esc(title) + '">' + (hs.length ? '' : '≈') + S.price(best.price) +
        (more > 0 ? ' +' + more : '') + '</button>';
    }
  };

  /** One popover line. `near` rows also name the resource they came from. */
  function row(h, i, rec, near) {
    return '<div class="hp-row' + (h.same ? ' same' : '') + (near ? ' near' : '') + '">' +
      '<b>' + S.price(h.price) + '</b>' +
      '<span class="hp-meta">' +
      (near ? '<em class="hp-name">' + S.esc(h.name) + '</em> · ' + Math.round(h.score * 100) + '%<br>' : '') +
      '№ ' + S.esc(h.number) + ' · ' + S.esc(h.contragent) + ' · ' + day(h.at) +
      (h.same ? ' <em>тот же контрагент</em>' : '') +
      (h.count > 1 ? ' · ×' + h.count : '') +
      (h.smeta != null && rec && !S.near(h.smeta, rec.price) ? '<small>сметная цена там: ' + S.price(h.smeta) + '</small>' : '') +
      '</span>' +
      '<button class="btn sm" data-i="' + i + '">Применить</button></div>';
  }

  /** A correction record as the popover wants it. */
  function hintOf(c) {
    var a = c.expand && c.expand.application, ct = c.expand && c.expand.contragent, by = c.expand && c.expand.by;
    var mine = S.Sync.app && S.Sync.app.contragent;
    return {
      price: c.market_price, smeta: c.smeta_price, note: c.note, at: c.updated, name: c.name,
      number: a ? a.number : '', contragent: ct ? ct.name : (a ? a.org_name : ''),
      region: c.region, by: by ? (by.name || by.email) : '',
      same: !!(mine && c.contragent === mine)
    };
  }

  /** Split keys into filter-sized batches, measured in encoded bytes. */
  function chunk(list) {
    var chunks = [], cur = [], size = 0;
    list.forEach(function (k) {
      var b = bytes(k) + 24;
      if (cur.length && size + b > CHUNK_BYTES) { chunks.push(cur); cur = []; size = 0; }
      cur.push(k); size += b;
    });
    if (cur.length) chunks.push(cur);
    return chunks;
  }

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
