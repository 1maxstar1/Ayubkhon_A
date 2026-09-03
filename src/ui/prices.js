/*
 * The price workspace — the screen the work actually happens on.
 *
 * One line per resource (name + unit), no matter how many streets it appears in.
 * Typing a market price there rewrites every occurrence across every project at
 * once, which is what "adjust the price for the whole project" means.
 */
(function (S) {
  'use strict';

  var COLS = [
    { k: 'n', w: 46, cls: 'mid', h: '№' },
    { k: 'name', w: 0, h: 'Resurs nomi' },
    { k: 'unit', w: 70, cls: 'mid', h: "O'lch." },
    { k: 'count', w: 54, cls: 'num', h: 'Soni' },
    { k: 'qty', w: 100, cls: 'num', h: 'Jami kol-vo' },
    { k: 'price', w: 126, cls: 'num', h: 'Smeta narxi' },
    { k: 'market', w: 126, cls: 'num', h: 'Bozor narxi' },
    { k: 'delta', w: 88, cls: 'num', h: 'Farq, %' },
    { k: 'econ', w: 138, cls: 'num', h: 'Farq, so\'m' }
  ];

  /**
   * The saving, per row: sum(qty x smeta price) - sum(qty x market price).
   * It has to be summed row by row — a resource can carry several smeta prices,
   * and until the market price is actually set each row keeps its own, so the
   * difference is genuinely zero even though the two prices differ.
   */
  function econOf(r) { return r.smetaSum - r.marketSum; }
  function pctOf(r) { return r.smetaSum ? econOf(r) / r.smetaSum * 100 : 0; }
  function isChanged(r) { return !S.near(r.smetaSum, r.marketSum); }

  function Prices(app) {
    this.app = app;
    this.view = [];
    this.head = document.getElementById('priceHead');
    this.list = new S.VList(document.getElementById('priceScroll'), {
      render: this.renderRange.bind(this)
    });
    this.head.innerHTML = COLS.map(function (c) {
      return '<div class="c' + (c.cls ? ' ' + c.cls : '') + '" style="' + width(c) + '">' + S.esc(c.h) + '</div>';
    }).join('');
    this.bind();
  }

  function width(c) { return c.w ? 'flex:0 0 ' + c.w + 'px' : 'flex:1 1 auto;min-width:220px'; }

  Prices.prototype.bind = function () {
    var self = this;
    var scroll = document.getElementById('priceScroll');

    scroll.addEventListener('input', function (e) {
      var inp = e.target;
      if (!inp.classList || !inp.classList.contains('pin')) return;
      var rec = self.byKey(inp.dataset.key);
      if (!rec) return;
      var v = S.num(inp.value);
      self.app.setPrice(rec.key, v == null ? rec.price : v);
      inp.classList.toggle('edited', !S.near(rec.price, rec.market));
      self.updateRowEcho(inp, rec);
    });

    scroll.addEventListener('focusin', function (e) {
      var inp = e.target;
      if (!inp.classList || !inp.classList.contains('pin')) return;
      var rec = self.byKey(inp.dataset.key);
      if (rec) inp.value = fmtIn(rec.market);
      inp.select();
    });
    scroll.addEventListener('focusout', function (e) {
      var inp = e.target;
      if (!inp.classList || !inp.classList.contains('pin')) return;
      var rec = self.byKey(inp.dataset.key);
      if (rec) inp.value = S.price(rec.market);
    });

    scroll.addEventListener('keydown', function (e) {
      var inp = e.target;
      if (!inp.classList || !inp.classList.contains('pin')) return;
      if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
        var i = +inp.dataset.i;
        if (i + 1 < self.view.length) {
          e.preventDefault();
          self.focusRow(i + 1);
        }
      } else if (e.key === 'ArrowDown') { e.preventDefault(); self.focusRow(+inp.dataset.i + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); self.focusRow(+inp.dataset.i - 1); }
      else if (e.key === 'Escape') {
        var rec = self.byKey(inp.dataset.key);
        if (rec) { self.app.setPrice(rec.key, rec.price); self.list.refresh(); }
      }
    });

    scroll.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.tagm') : null;
      if (!b) return;
      document.getElementById('q').value = b.dataset.nm;
      document.getElementById('filter').value = 'all';
      self.apply();
    });

    document.getElementById('q').addEventListener('input', S.debounce(function () { self.apply(); }, 90));
    document.getElementById('filter').addEventListener('change', function () { self.apply(); });
    document.getElementById('sort').addEventListener('change', function () { self.apply(); });

    document.getElementById('pctBtn').addEventListener('click', function () {
      var raw = prompt('Ko\'rinib turgan ' + self.view.length +
        ' ta resursga foiz qo\'llansinmi?\nMasalan: -10  (smeta narxidan 10% past)', '-10');
      if (raw == null) return;
      var pct = S.num(raw);
      if (pct == null) { self.app.toast('Foiz noto\'g\'ri kiritildi', true); return; }
      var map = {};
      self.view.forEach(function (r) { map[r.key] = Math.round(r.price * (1 + pct / 100)); });
      self.app.setPrices(map);
      self.app.toast(self.view.length + ' ta resurs narxi ' + pct + '% ga o\'zgartirildi');
    });

    document.getElementById('resetBtn').addEventListener('click', function () {
      var map = {};
      self.view.forEach(function (r) { map[r.key] = r.price; });
      self.app.setPrices(map);
      self.app.toast(self.view.length + ' ta resurs smeta narxiga qaytarildi');
    });
  };

  Prices.prototype.byKey = function (k) {
    var m = this.app.model;
    if (!m) return null;
    if (!this._idx || this._idxFor !== m) {
      this._idx = new Map();
      this._idxFor = m;
      m.resources.forEach(function (r) { this._idx.set(r.key, r); }, this);
    }
    return this._idx.get(k);
  };

  /** Cheap in-place update of the numbers next to the field being typed in. */
  Prices.prototype.updateRowEcho = function (inp, rec) {
    var row = inp.closest('.vrow');
    if (!row) return;
    var cells = row.querySelectorAll('.c');
    var econ = econOf(rec), pct = pctOf(rec), chg = isChanged(rec);
    cells[7].textContent = rec.smetaSum ? pct.toFixed(1) + '%' : '';
    cells[8].textContent = S.money(econ);
    cells[7].classList.toggle('diff', chg);
    cells[8].classList.toggle('diff', chg);
    row.classList.toggle('chg', chg);
  };

  Prices.prototype.focusRow = function (i) {
    if (i < 0 || i >= this.view.length) return;
    this.list.scrollToRow(i);
    var el = document.querySelector('#priceScroll .pin[data-i="' + i + '"]');
    if (el) { el.focus(); el.select(); }
  };

  Prices.prototype.apply = function () {
    var m = this.app.model;
    if (!m) { this.view = []; this.list.setCount(0); this.status(); return; }
    var q = S.nameKey(document.getElementById('q').value);
    var f = document.getElementById('filter').value;
    var sort = document.getElementById('sort').value;

    var list = m.resources.filter(function (r) {
      if (q && S.nameKey(r.name).indexOf(q) < 0) return false;
      switch (f) {
        case 'changed': return isChanged(r);
        case 'same': return !isChanged(r);
        case 'zero': return !r.price;
        case 'multi': return r.variants > 1;
        case 'hint': return !!(S.Hints && S.Hints.has(r.nk));
        default: return true;
      }
    });

    if (sort === 'diff') list.sort(function (a, b) { return Math.abs(econOf(b)) - Math.abs(econOf(a)); });
    else if (sort === 'sum') list.sort(function (a, b) { return b.smetaSum - a.smetaSum; });
    else if (sort === 'count') list.sort(function (a, b) { return b.count - a.count; });
    else list.sort(function (a, b) {
      return a.name < b.name ? -1 : a.name > b.name ? 1 : a.price - b.price;
    });

    this.view = list;
    this.list.setCount(list.length);
    this.status();
  };

  Prices.prototype.status = function () {
    var m = this.app.model;
    var total = m ? m.resources.length : 0;
    var changed = m ? m.resources.filter(isChanged).length : 0;
    var hinted = m && S.Hints ? m.resources.filter(function (r) { return S.Hints.has(r.nk); }).length : 0;
    document.getElementById('priceCount').textContent =
      this.view.length + ' / ' + total + ' resurs · ' + changed + ' tasi o\'zgartirilgan' +
      (hinted ? ' · ' + hinted + ' tasiga eslatma bor' : '');
  };

  Prices.prototype.renderRange = function (from, to) {
    var out = [];
    for (var i = from; i < to; i++) {
      var r = this.view[i];
      if (!r) continue;
      var changed = isChanged(r);
      var pct = pctOf(r);
      var e = econOf(r);
      var many = r.variants > 1;
      var multi = many ? '<button class="tagm" data-nm="' + S.esc(r.name) + '" title="' +
        S.esc(multiHint(r)) + '">' + r.variants + ' xil narx</button>' : '';
      var hint = S.Hints ? S.Hints.tag(r) : '';
      out.push(
        '<div class="vrow' + (changed ? ' chg' : '') + (many ? ' many' : '') + '">' +
        cell(COLS[0], i + 1) +
        '<div class="c" style="' + width(COLS[1]) + '" title="' + S.esc(r.name) + '">' + S.esc(r.name) + multi + hint + '</div>' +
        cell(COLS[2], S.esc(r.unit)) +
        cell(COLS[3], r.count) +
        cell(COLS[4], S.qty(r.qty)) +
        '<div class="c num" style="' + width(COLS[5]) + '">' + S.price(r.price) + '</div>' +
        '<div class="c num" style="' + width(COLS[6]) + '">' +
        '<input class="pin' + (changed ? ' edited' : '') + '" data-key="' + S.esc(r.key) + '" data-i="' + i +
        '" inputmode="decimal" value="' + S.price(r.market) + '"></div>' +
        '<div class="c num' + (changed ? ' diff' : '') + '" style="' + width(COLS[7]) + '">' +
        (r.smetaSum ? pct.toFixed(1) + '%' : '') + '</div>' +
        '<div class="c num' + (changed ? ' diff' : '') + '" style="' + width(COLS[8]) + '">' +
        S.money(e) + '</div>' +
        '</div>');
    }
    return out.join('');
  };

  function multiHint(r) {
    return 'Bu nom smetalarda ' + r.variants + ' xil narx bilan uchraydi: ' +
      r.siblings.map(function (p) { return S.price(p); }).join('  ·  ') +
      '. Har biri alohida qator — bosing, hammasi bir joyda ko\'rinadi.';
  }

  function fmtIn(v) {
    if (v == null) return '';
    return Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : String(Math.round(v * 1000) / 1000);
  }

  function cell(c, html) {
    return '<div class="c' + (c.cls ? ' ' + c.cls : '') + '" style="' + width(c) + '">' + html + '</div>';
  }

  S.Prices = Prices;
})(S);
