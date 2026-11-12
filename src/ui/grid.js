/*
 * Fixed-height row virtualiser.
 *
 * The whole reason the drafts crawled: six thousand rows were rendered as six
 * thousand DOM nodes, and every price edit rebuilt all of them. Here only the
 * ~40 rows on screen exist, rendering is coalesced into one animation frame,
 * and focus inside the visible window survives a repaint so typing in a price
 * field is never interrupted.
 */
(function (S) {
  'use strict';

  var ROW = 26;
  /*
   * The row height is a measurement the virtualiser makes and the stylesheet
   * has to obey: the scroll position is computed from it, so a `.vrow` of any
   * other height leaves the rows drifting away from where the list thinks they
   * are. It was written down twice — here and as `--row:26px` in app.css — and
   * agreed only by luck. The stylesheet follows this number now.
   */
  document.documentElement.style.setProperty('--row', ROW + 'px');

  function VList(scroller, opts) {
    this.el = scroller;
    this.space = scroller.querySelector('.vspace');
    this.body = scroller.querySelector('.vbody');
    this.rowHeight = opts.rowHeight || ROW;
    this.render = opts.render;             // (from, to) -> html
    this.overscan = opts.overscan || 8;
    this.count = 0;
    this._from = -1; this._to = -1;
    this._raf = 0;
    var self = this;
    this._onScroll = function () {
      if (self._raf) return;
      self._raf = requestAnimationFrame(function () { self._raf = 0; self.paint(); });
    };
    scroller.addEventListener('scroll', this._onScroll, { passive: true });
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(function () { self.paint(true); });
      this._ro.observe(scroller);
    }
  }

  VList.prototype.setCount = function (n, keepScroll) {
    this.count = n;
    this.space.style.height = (n * this.rowHeight) + 'px';
    if (!keepScroll) this.el.scrollTop = 0;
    this.paint(true);
  };

  VList.prototype.refresh = function () { this.paint(true); };

  VList.prototype.scrollToRow = function (i) {
    this.el.scrollTop = Math.max(0, i * this.rowHeight - this.el.clientHeight / 3);
    this.paint(true);
  };

  VList.prototype.paint = function (force) {
    var h = this.el.clientHeight || 400;
    var first = Math.max(0, Math.floor(this.el.scrollTop / this.rowHeight) - this.overscan);
    var last = Math.min(this.count, Math.ceil((this.el.scrollTop + h) / this.rowHeight) + this.overscan);
    if (!force && first === this._from && last === this._to) return;
    this._from = first; this._to = last;

    // Preserve the caret when a repaint happens while the user is typing.
    var act = document.activeElement;
    // data-focus when a key can repeat across rows (the same resource appears on
    // many streets); data-key otherwise.
    var keep = act && this.body.contains(act) && act.dataset
      ? (act.dataset.focus || act.dataset.key) : null;
    var selStart = keep ? act.selectionStart : 0, selEnd = keep ? act.selectionEnd : 0;

    this.body.style.transform = 'translateY(' + (first * this.rowHeight) + 'px)';
    this.body.innerHTML = this.render(first, last);

    if (keep) {
      var esc = cssEscape(keep);
      // the same kind of element: a hint tag in the name cell carries the row's data-key too, and comes first —
      // a price field being typed in lost its focus to that button on every repaint
      var tag = act.tagName ? act.tagName.toLowerCase() : '';
      var again = this.body.querySelector(tag + '[data-focus="' + esc + '"]') ||
                  this.body.querySelector(tag + '[data-key="' + esc + '"]');
      if (again && again.focus) {
        // what the box knew when the caret entered it goes with the caret; and the focus given back here is not the
        // expert entering the box — the handlers of focusin tell the two apart by VList.restoring (a popover closed
        // with Esc stays closed through a repaint, E3)
        if (act.dataset.was != null) again.dataset.was = act.dataset.was;
        VList.restoring = true;
        try { again.focus(); } finally { VList.restoring = false; }
        try { again.setSelectionRange(selStart, selEnd); } catch (e) { /* not a text input */ }
      }
    }
  };

  function cssEscape(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  S.VList = VList;
  /**
   * A column heading, with a second, smaller line when the column has one («без НДС» under the price headings: the
   * prices on screen are without VAT, and the screen says so). Both lines in one span, so the cell lays out as before.
   */
  /**
   * One rule for the colour of a difference, everywhere on screen: a saving (estimate − market > 0) green, an overspend
   * red, an unchanged line plain. It used to be red in the lines and green in the total (E6). The exported document
   * keeps its own rule (321.xlsx). `chg` is the line's own «changed», so colour and «changed» never disagree.
   */
  S.diffCls = function (chg, d) { return !chg ? '' : d > 0 ? ' diff save' : d < 0 ? ' diff over' : ' diff'; };
  S.diffMark = function (el, chg, d) {
    el.classList.toggle('diff', chg);
    el.classList.toggle('save', chg && d > 0);
    el.classList.toggle('over', chg && d < 0);
  };
  S.headText = function (c) {
    return c.sub ? '<span class="th2">' + S.esc(c.h) + '<small>' + S.esc(c.sub) + '</small></span>' : S.esc(c.h);
  };
})(S);
