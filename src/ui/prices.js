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
    { k: 'n', w: 62, wc: 52, cls: 'mid', h: '№' },
    { k: 'name', w: 0, h: 'Наименование ресурса' },
    { k: 'unit', w: 70, wc: 58, cls: 'mid', h: 'Ед. изм.' },
    { k: 'count', w: 54, wc: 48, cls: 'num', h: 'Повт.', t: 'Повторов' },
    { k: 'qty', w: 100, wc: 84, cls: 'num', h: 'Общее кол-во', hc: 'Кол-во' },
    { k: 'price', w: 126, wc: 104, cls: 'num', h: 'Цена по смете', hc: 'Цена сметы', sub: 'без НДС' },
    { k: 'market', w: 132, wc: 122, cls: 'num', h: 'Рыночная цена', hc: 'Рын. цена', sub: 'без НДС' },
    { k: 'delta', w: 88, wc: 62, cls: 'num', h: 'Разница, %', hc: 'Δ, %' },
    { k: 'econ', w: 138, wc: 112, cls: 'num', h: 'Разница, сум', hc: 'Δ, сум' }
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
  /** The band of the estimate the resource stands under (E15): as the estimate has it, nothing guessed. */
  function secOf(r) { return r.section && r.section !== 'other' && SEC_LABEL[r.section] ? r.section : 'other'; }
  var SEC_LABEL = { labor: 'Затраты труда', machines: 'Машины и механизмы', materials: 'Материалы', equipment: 'Оборудование', other: 'Прочие / без раздела' };

  var SEC_RU = {
    labor: 'затраты труда',
    machines: 'машины и механизмы',
    materials: 'материалы и конструкции',
    equipment: 'оборудование'
  };
  /**
   * The row sits under one band of the estimate but its name reads like
   * another. Only a confident disagreement is worth showing, and never the
   * материалы/оборудование one — the workbooks themselves do not agree where
   * that line runs.
   */
  function secWarn(r) {
    if (!S.sections || !r.section || r.section === 'other') return null;
    var g = S.sections.classify(r.name, r.unit);
    if (!g.section || g.confidence < 0.75) return null;
    if (S.sections.band(g.section) === S.sections.band(r.section)) return null;
    return g;
  }
  function secTag(r) {
    var g = secWarn(r);
    if (!g) return '';
    return '<button class="tags" title="' + S.esc('В смете это «' + (SEC_RU[r.section] || r.section) +
      '», но по названию похоже на «' + (SEC_RU[g.section] || g.section) + '»') + '">⚠ раздел</button>';
  }

  function Prices(app) {
    this.app = app;
    this.view = [];
    this.head = document.getElementById('priceHead');
    this.list = new S.VList(document.getElementById('priceScroll'), {
      render: this.renderRange.bind(this),
      head: this.head,
      minWidth: function () { return COLS.reduce(function (n, c) { return n + (S.colW(c) || 220); }, 0); }
    });
    this.paintHead();
    var self = this;
    document.addEventListener('layout:compact', function () { self.paintHead(); });
    this.bind();
  }

  function width(c) { var w = S.colW(c); return w ? 'flex:0 0 ' + w + 'px' : 'flex:1 1 auto;min-width:220px'; }

  /**
   * «Проверено» (E14): the expert's own mark that a resource has been looked at, priced or not. Its data-focus lets
   * the list give the focus back to it after a repaint; it carries no data-key (the tags of the name cell do).
   */
  function ckBtn(app, r) {
    var on = !!app.checked[r.key];
    return '<button class="ck' + (on ? ' on' : '') + '" data-ck="' + S.esc(r.key) + '" data-focus="ck:' + S.esc(r.key) + '" aria-pressed="' + on +
      '" title="' + (on ? 'Проверено — нажмите, чтобы снять' : 'Отметить как проверенный (Shift+Enter в поле цены)') + '">' + (on ? '✓' : '○') + '</button>';
  }

  /**
   * Where an applied price came from, in its cell (E16): «U» the exchange, «С» the reference prices, «П» an earlier
   * project. Typing over it takes the badge away (the price is the expert's own again).
   */
  function srcMark(r) {
    var s = S.appliedSource ? S.appliedSource(r) : '';
    if (!s) return '';
    if (/^uzex:/.test(s)) return S.Uzex ? S.Uzex.cellMark(r) : '';
    if (/^ref:/.test(s)) return '<span class="upill r" title="Справочная цена (применена из справочника). Введите цену вручную, чтобы снять отметку">С</span>';
    if (/^hint:/.test(s)) {
      var h = S.Hints && S.Hints.byId ? S.Hints.byId(s.slice(5)) : null;
      var t = h ? 'Цена из прежнего проекта № ' + h.number + ' · ' + h.contragent : 'Цена из прежнего проекта';
      return '<span class="upill h" title="' + S.esc(t + '. Введите цену вручную, чтобы снять отметку') + '">П</span>';
    }
    return '';
  }

  /** «✎»: the expert's own note on the resource, for the document's «Eslatma» column — only with the setting on (E17). */
  function noteBtn(app, r) {
    if (!app.opts.resNotes) return '';
    var n = app.notes[r.key];
    return '<button class="nt' + (n ? ' on' : '') + '" data-nt="' + S.esc(r.key) + '" title="' +
      S.esc(n ? 'Примечание: ' + n : 'Примечание к ресурсу — в столбец «Eslatma» документа') + '">✎</button>';
  }

  Prices.prototype.paintHead = function () {
    this.head.innerHTML = COLS.map(function (c) {
      return '<div class="c' + (c.cls ? ' ' + c.cls : '') + '" style="' + width(c) + '">' + S.headText(c) + '</div>';
    }).join('');
  };

  Prices.prototype.bind = function () {
    var self = this;
    var scroll = document.getElementById('priceScroll');

    scroll.addEventListener('input', function (e) {
      var inp = e.target;
      if (!inp.classList || !inp.classList.contains('pin')) return;
      // a price typed over an applied one is the expert's own again: its badge goes
      if (inp.classList.contains('uz') || inp.classList.contains('src')) {
        inp.classList.remove('uz', 'src');
        var pill = inp.parentNode && inp.parentNode.querySelector('.upill');
        if (pill) pill.remove();
      }
      var rec = self.byKey(inp.dataset.key);
      if (!rec) return;
      var t = self.app.typedPrice(inp);
      if (t.kind === 'bad') return;                 // not a number: nothing changes, the box says so (App.typedPrice)
      self.app.setPrice(rec.key, t.kind === 'empty' ? rec.price : t.v);
      inp.classList.toggle('edited', !S.near(rec.price, rec.market));
      self.updateRowEcho(inp, rec);
    });

    scroll.addEventListener('focusin', function (e) {
      var inp = e.target;
      if (!inp.classList || !inp.classList.contains('pin')) return;
      var rec = self.byKey(inp.dataset.key);
      if (rec && !S.VList.restoring) { inp.value = fmtIn(rec.market); inp.dataset.was = String(rec.market); }
      inp.select();
    });
    scroll.addEventListener('focusout', function (e) {
      var inp = e.target;
      if (!inp.classList || !inp.classList.contains('pin')) return;
      var rec = self.byKey(inp.dataset.key);
      if (rec) {
        self.app.leftPrice(inp, rec.price);
        // a price typed here is a resource looked at: it is checked (Esc put the old one back: nothing typed)
        if (inp.dataset.was != null && !S.near(rec.market, +inp.dataset.was) && !self.app.checked[rec.key]) self.app.setChecked([rec.key], true, true);
        inp.value = S.price(rec.market);
      }
    });

    scroll.addEventListener('keydown', function (e) {
      var inp = e.target;
      if (!inp.classList || !inp.classList.contains('pin')) return;
      if (e.key === 'Enter' && e.shiftKey) {
        // Shift+Enter: this one is checked, on to the next
        e.preventDefault();
        self.app.setChecked([inp.dataset.key], true);
        self.focusRow(+inp.dataset.i + 1);
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        // Ctrl+Enter: the first suggestion of the popover open for this resource, as if its «Применить» were pressed
        e.preventDefault(); S.acceptFirst(inp.dataset.key);
      } else if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
        var i = +inp.dataset.i;
        if (i + 1 < self.view.length) {
          e.preventDefault();
          self.focusRow(i + 1);
        }
      } else if (e.key === 'ArrowDown') { e.preventDefault(); self.focusRow(+inp.dataset.i + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); self.focusRow(+inp.dataset.i - 1); }
      else if (e.key === 'Escape') {
        var rec = self.byKey(inp.dataset.key);
        if (rec) self.app.escPrice(rec.key, rec.price);
      }
    });

    scroll.addEventListener('click', function (e) {
      var ck = e.target.closest ? e.target.closest('.ck') : null;
      if (ck) { self.app.setChecked([ck.dataset.ck], !self.app.checked[ck.dataset.ck]); return; }
      var nb = e.target.closest ? e.target.closest('.nt') : null;
      if (nb) {
        var key = nb.dataset.nt, was = self.app.notes[key] || '';
        var t = window.prompt('Примечание к ресурсу (столбец «Eslatma» документа). Пусто — убрать примечание.', was);
        if (t == null) return;
        t = String(t).trim().slice(0, 500);
        if (t) self.app.notes[key] = t; else delete self.app.notes[key];
        if (t !== was) { try { document.dispatchEvent(new Event('notes:change')); } catch (er) { /* old browser */ } }
        self.list.refresh();
        return;
      }
      var b = e.target.closest ? e.target.closest('.tagm') : null;
      if (!b) return;
      document.getElementById('q').value = b.dataset.nm;
      document.getElementById('filter').value = 'all';
      self.apply();
    });

    // Only a query that changed redraws the list. An input event that leaves the text as it was (the same text typed over
    // a selection) used to redraw every row 90 ms later — and a redraw that falls between the press and the release of
    // the mouse on a row's tag takes the tag away under it: the click is lost and the popover never opens.
    document.getElementById('q').addEventListener('input', S.debounce(function () {
      if (self.qShown != null && document.getElementById('q').value === self.qShown) return;
      self.apply();
    }, 90));
    document.getElementById('filter').addEventListener('change', function () { self.apply(); });
    document.getElementById('secFilter').addEventListener('change', function () { self.apply(); });
    document.getElementById('sort').addEventListener('change', function () { self.apply(); });

    // A percentage of the estimate's price, on every resource shown — but never over a price the expert has set
    // (typed, pasted, applied from a suggestion, a book, «Наш ответ»): the expert's price stands (App.ownPrice).
    // Rounded to the tiyin, and a price that would become 0 is left as it is.
    document.getElementById('pctBtn').addEventListener('click', function () {
      var own = self.view.filter(function (r) { return self.app.ownPrice(r); }).length;
      var secSel = document.getElementById('secFilter');
      var raw = prompt('Применить процент к ' + self.view.length + ' видимым ресурсам' +
        (secSel.value !== 'all' ? ' (раздел «' + SEC_LABEL[secSel.value] + '»)' : '') + '?\nНапример: -10  (на 10% ниже сметной цены)' +
        (own ? '\n\nЦены, изменённые вручную или применённые из подсказок, не изменятся: ' + own + '.' : ''), '-10');
      if (raw == null) return;
      var pct = S.num(String(raw).replace(/%\s*$/, ''));
      if (pct == null) { self.app.toast('Процент введён неверно', true); return; }
      var map = {}, n = 0, zero = 0;
      self.view.forEach(function (r) {
        if (!(r.price > 0) || self.app.ownPrice(r)) return;
        // the product in hundredths first: 31 × 90 / 100 is 27,9 exactly, without a binary tail
        var v = Math.round(r.price * (100 + pct)) / 100;
        if (!(v > 0)) { zero++; return; }
        n++;
        if (!S.near(v, r.market)) map[r.key] = v;
      });
      var why = (own ? ' · пропущено изменённых вручную: ' + own : '') + (zero ? ' · цена стала бы 0 — не изменено: ' + zero : '');
      if (!Object.keys(map).length) { self.app.toast('Нечего менять' + why); return; }
      self.app.bulkPrices(map, 'Цены ' + n + ' ресурсов изменены на ' + pct + '%' + why);
      Object.keys(map).forEach(function (k) { self.app.pct[k] = 1; });
    });

    // The button says «показанные» and means it: every resource on the list as it is filtered now. With the
    // filter at «Все» that is the whole application, so it counts what it is about to undo and asks first;
    // only the prices that differ from the estimate's are touched, and the press can be taken back.
    document.getElementById('resetBtn').addEventListener('click', function () {
      var map = {}, n = 0;
      self.view.forEach(function (r) { if (!S.near(r.market, r.price)) { map[r.key] = r.price; n++; } });
      if (!n) { self.app.toast('Среди показанных нет изменённых цен'); return; }
      if (n > 1 && !window.confirm('Вернуть к сметной цене ' + n + ' изменённых цен' +
        (self.view.length === self.app.model.resources.length ? ' — это все изменённые цены заявки' : ' (показано ресурсов: ' + self.view.length + ')') +
        '?\n\nСразу после этого действие можно отменить кнопкой «Отменить».')) return;
      self.app.bulkPrices(map, 'Возвращено к сметной цене: ' + n);
    });
  };

  /**
   * The first «Применить» of the popover open for `key` — suggestions of earlier projects, reference prices or the
   * exchange — pressed as by hand, with its own confirmations. A line of «Похожие ресурсы» is never taken this way.
   */
  S.acceptFirst = function (key) {
    var H = S.Hints, R = S.Refs, U = S.Uzex, b = null;
    if (H && H.pop && !H.pop.hidden && H.key === key) b = H.pop.querySelector('.hp-row:not(.near) button[data-i]');
    else if (R && R.pop && !R.pop.hidden && R.open && R.open.key === key) b = R.pop.querySelector('.rp-line:not(.near) button[data-i]');
    else if (U && U.pop && !U.pop.hidden && U.open && U.open.key === key) b = U.pop.querySelector('.up-line:not(.near) button[data-i]');
    if (b && !b.disabled) b.click();
    return !!b;
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
    S.diffMark(cells[7], chg, econ);
    S.diffMark(cells[8], chg, econ);
    row.classList.toggle('chg', chg);
  };

  Prices.prototype.focusRow = function (i) {
    if (i < 0 || i >= this.view.length) return;
    // scrolled only when the row is not fully on screen: a scroll closes the popover the row's focus is about to open
    var el0 = this.list.el, h = this.list.rowHeight, top = i * h;
    if (top < el0.scrollTop || top + h > el0.scrollTop + el0.clientHeight) this.list.scrollToRow(i);
    var el = document.querySelector('#priceScroll .pin[data-i="' + i + '"]');
    if (el) { el.focus(); el.select(); }
  };

  /**
   * A suggestion applied to `key` (E18): the list stays where it was and the caret moves to the next resource, so
   * the next one is priced without the mouse.
   */
  Prices.prototype.afterApply = function (key) {
    var was = -1;
    for (var i = 0; i < this.view.length; i++) if (this.view[i].key === key) { was = i; break; }
    this.apply(true);
    var now = -1;
    for (var j = 0; j < this.view.length; j++) if (this.view[j].key === key) { now = j; break; }
    var next = (now >= 0 ? now : was) + (now >= 0 ? 1 : 0);
    if (was >= 0 && next < this.view.length) this.focusRow(next);
  };

  /**
   * Filter and sort the list. `keepScroll` leaves the list where it stands: answers that arrive while the expert is
   * scrolling or typing (reference prices) must not throw the list back to the top.
   */
  Prices.prototype.apply = function (keepScroll) {
    var m = this.app.model;
    if (!m) { this.view = []; this.list.setCount(0); this.status(); return; }
    this.qShown = document.getElementById('q').value;
    var q = S.nameKey(this.qShown);
    var f = document.getElementById('filter').value;
    var sort = document.getElementById('sort').value;
    var sec = document.getElementById('secFilter').value;

    var app = this.app;
    var list = m.resources.filter(function (r) {
      if (q && S.nameKey(r.name).indexOf(q) < 0) return false;
      if (sec !== 'all' && secOf(r) !== sec) return false;
      switch (f) {
        case 'changed': return isChanged(r);
        case 'same': return !isChanged(r);
        case 'zero': return !r.price;
        case 'multi': return r.variants > 1;
        case 'hint': return !!(S.Hints && S.Hints.hasRow(r));
        case 'near': return !!(S.Hints && S.Hints.nearRow(r));
        case 'ref': return !!(S.Refs && S.Refs.hasRow(r));
        case 'nearref': return !!(S.Refs && S.Refs.nearRow(r));
        case 'uzex': return !!(S.Uzex && S.Uzex.hasRow(r));
        case 'wrongsec': return !!secWarn(r);
        case 'unchecked': return !app.checked[r.key];
        case 'checked': return !!app.checked[r.key];
        default: return true;
      }
    });

    if (sort === 'diff') list.sort(function (a, b) { return Math.abs(econOf(b)) - Math.abs(econOf(a)); });
    else if (sort === 'sum') list.sort(function (a, b) { return b.smetaSum - a.smetaSum; });
    else if (sort === 'count') list.sort(function (a, b) { return b.count - a.count; });
    else list.sort(function (a, b) {
      return a.name < b.name ? -1 : a.name > b.name ? 1 : a.price - b.price;
    });

    // the same search, filter and sort over the same estimates is a refresh — a price applied, an answer arrived — and
    // keeps its place; a change of any of them, or new estimates, starts from the top (E4)
    var sig = q + '\0' + f + '\0' + sort + '\0' + sec;
    if (keepScroll === undefined && sig === this._sig && m === this._sigModel) keepScroll = true;
    this._sig = sig; this._sigModel = m;
    this.view = list;
    this.list.setCount(list.length, keepScroll === true);
    this.status();
  };

  Prices.prototype.status = function () {
    var m = this.app.model;
    var total = m ? m.resources.length : 0;
    var changed = m ? m.resources.filter(isChanged).length : 0;
    var hinted = m && S.Hints ? m.resources.filter(function (r) { return S.Hints.hasRow(r); }).length : 0;
    var near = m && S.Hints ? m.resources.filter(function (r) { return S.Hints.nearRow(r); }).length : 0;
    var mis = m ? m.resources.filter(secWarn).length : 0;
    // the bands of the estimate, each with how many resources it has; offered only when there are two or more
    var per = {}, bands = 0, sf = document.getElementById('secFilter');
    if (m) m.resources.forEach(function (r) { var k = secOf(r); if (!per[k]) bands++; per[k] = (per[k] || 0) + 1; });
    [].forEach.call(sf.options, function (o) {
      if (o.value === 'all') return;
      o.textContent = SEC_LABEL[o.value] + (per[o.value] ? ' (' + per[o.value] + ')' : '');
      o.hidden = !per[o.value] && sf.value !== o.value;
    });
    sf.hidden = bands < 2 && sf.value === 'all';
    document.getElementById('priceCount').textContent =
      this.view.length + ' / ' + total + ' ресурсов · изменено ' + changed +
      ' · проверено ' + (m ? m.resources.filter(function (r) { return this.app.checked[r.key]; }, this).length : 0) + ' из ' + total +
      (hinted ? ' · с подсказками ' + hinted : '') +
      (near ? ' · похожих ' + near : '') +
      (mis ? ' · не тот раздел ' + mis : '') +
      (S.Refs ? S.Refs.statusText() : '') +
      (S.Uzex ? S.Uzex.statusText() : '');
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
        S.esc(multiHint(r)) + '">' + r.variants + ' цены</button>' : '';
      var hint = (S.Hints ? S.Hints.tag(r) : '') + (S.Refs ? S.Refs.tag(r) : '') + (S.Uzex ? S.Uzex.tag(r) : '');
      // a price applied from an exchange quote keeps its mark in the cell until it is typed over (src/ui/uzex.js)
      var uz = srcMark(r), uzOnly = uz && /upill u\b/.test(uz);
      var sec = secTag(r);
      out.push(
        '<div class="vrow' + (changed ? ' chg' : '') + (many ? ' many' : '') + '">' +
        cell(COLS[0], ckBtn(this.app, r) + (i + 1)) +
        '<div class="c" style="' + width(COLS[1]) + '" title="' + S.esc(r.name) + '"><span class="nmt">' + S.esc(r.name) + '</span>' +
        multi + hint + sec + noteBtn(this.app, r) + '</div>' +
        cell(COLS[2], S.esc(r.unit)) +
        cell(COLS[3], r.count) +
        cell(COLS[4], S.qty(r.qty)) +
        '<div class="c num" style="' + width(COLS[5]) + '">' + S.price(r.price) + '</div>' +
        '<div class="c num' + (uz ? ' uzc' : '') + '" style="' + width(COLS[6]) + '">' + uz +
        '<input class="pin' + (changed ? ' edited' : '') + (uzOnly ? ' uz' : uz ? ' src' : '') + '" data-key="' + S.esc(r.key) + '" data-i="' + i +
        '" inputmode="decimal" value="' + S.price(r.market) + '"></div>' +
        '<div class="c num' + S.diffCls(changed, e) + '" style="' + width(COLS[7]) + '">' +
        (r.smetaSum ? pct.toFixed(1) + '%' : '') + '</div>' +
        '<div class="c num' + S.diffCls(changed, e) + '" style="' + width(COLS[8]) + '">' +
        S.money(e) + '</div>' +
        '</div>');
    }
    return out.join('');
  };

  function multiHint(r) {
    return 'Это название встречается в сметах с ' + r.variants + ' разными ценами: ' +
      r.siblings.map(function (p) { return S.price(p); }).join('  ·  ') +
      '. Каждая — отдельная строка; нажмите, чтобы увидеть все вместе.';
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
