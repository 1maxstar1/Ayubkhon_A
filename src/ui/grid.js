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
      var again = this.body.querySelector('[data-focus="' + esc + '"]') ||
                  this.body.querySelector('[data-key="' + esc + '"]');
      if (again && again.focus) {
        again.focus();
        try { again.setSelectionRange(selStart, selEnd); } catch (e) { /* not a text input */ }
      }
    }
  };

  function cssEscape(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  S.VList = VList;
  S.ROW_H = ROW;
})(S);
