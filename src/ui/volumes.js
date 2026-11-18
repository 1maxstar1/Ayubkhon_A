/*
 * «Объёмы работ» — the volumes of the works and the quantities of the resources, as the expert checks them
 * (the owner, 2026-11-14; the rules are in src/lib/volumes.js).
 *
 *   - the works come from the local resource statement of form 5 (01_ЛРВ) of every file: number, name, unit and
 *     the estimate's volume; the expert marks a volume «Необходимо обосновать объем в проекте», writes his own remark,
 *     and — when he has it — the volume of the working project;
 *   - a new volume moves the quantities of that work's resources (per unit × the change); a resource's total can also
 *     be set by hand in «Проверка цен» (a click on «Общее кол-во»);
 *   - «Наш ответ (Excel)» brings both back from a reply (the «объем» sheet beside the prices);
 *   - the document gets «Таблица №1 (объёмы)» — only what was decided.
 *
 * State: app.vol (work key → { v, note }), app.qtys (resource key → { v: the expert's total, base: the estimate's total
 * it was set against }; a bare number from v2.15 is a total with no base). Saved with the workspace (sync.js), kept
 * across reloads; the prices and Table №2 are not touched by any of it.
 *
 * A work's new volume moves only the lines of its own estimate (its project), spread over them by quantity. A total set
 * by hand holds while the estimate's total is the one it was set against: untick an object, swap a file, and it waits
 * (not applied, not in the document) until that total comes back.
 */
(function (S) {
  'use strict';

  /** An object's name, short enough for a line of text. */
  function cut(t) { t = String(t || '').replace(/\s+/g, ' ').trim(); return '«' + (t.length > 60 ? t.slice(0, 60) + '…' : t).replace(/^«|»$/g, '') + '»'; }
  function $(id) { return document.getElementById(id); }
  var V = S.volumes;

  /** Every work of the enabled projects, keyed by its file. */
  function worksOf(app) {
    var out = [];
    (app.projects || []).forEach(function (p) {
      if (p.enabled === false || !p.works || !p.works.length) return;
      V.list(p.works, p.file).forEach(function (w) { w.project = p.name; w.projectTitle = p.title || p.name; out.push(w); });
    });
    return out;
  }

  /** The expert's total for a resource, while it was set against the estimate's total there is now; else null. */
  function handOf(app, r) {
    var e = app.qtys && app.qtys[r.key];
    if (e == null) return null;
    if (typeof e === 'number') return e;                       // v2.15: a bare total
    if (e.base != null && Math.abs(e.base - (r.qty || 0)) > 1e-9) return null;
    return e.v;
  }

  /**
   * After the model is built: each resource's quantity by the expert (r.qty2) — set by hand, or moved by the volumes of
   * the works of its own estimate — and what the volumes alone give (r.qtyAuto, null when they move nothing).
   */
  function applyQty(app) {
    var m = app.model;
    if (!m) return;
    var add = {};
    (app.projects || []).forEach(function (p, pi) {
      if (p.enabled === false || !p.works || !p.works.length) return;
      var d = V.deltas(V.list(p.works, p.file), app.vol || {});
      if (!Object.keys(d).length) return;
      var lines = {}, tot = {};
      m.rows.forEach(function (row) {
        if (row.kind !== 'item' || row.pi !== pi || !row.qty) return;
        var nk = S.nameUnitKey(row.nm, row.unit);
        if (!d[nk]) return;
        tot[nk] = (tot[nk] || 0) + row.qty;
        (lines[nk] = lines[nk] || []).push(row);
      });
      Object.keys(lines).forEach(function (nk) {
        lines[nk].forEach(function (row) { add[row.key] = (add[row.key] || 0) + d[nk] * (row.qty / tot[nk]); });
      });
    });
    m.resources.forEach(function (r) {
      r.qtyAuto = add[r.key] ? Math.max(0, (r.qty || 0) + add[r.key]) : null;
      var hand = handOf(app, r);
      if (hand != null) r.qty2 = hand;
      else if (r.qtyAuto != null) r.qty2 = r.qtyAuto;
      else delete r.qty2;
      // a total set by hand against another total of the estimate (an object left out, the file replaced): it waits — not
      // in the document, and said beside the quantity (prices.js) so that it is not lost unseen
      var e = app.qtys && app.qtys[r.key];
      if (hand == null && e && typeof e === 'object' && e.v != null) r.qtyWait = { v: e.v, base: e.base }; else delete r.qtyWait;
    });
  }

  /** The quantities changed without a new model: the price list keeps its place; the workspace is saved. */
  function quantitiesChanged(app) {
    applyQty(app);
    if (app.prices_ui) { app.prices_ui.apply(true); app.prices_ui.status(); }
    try { document.dispatchEvent(new Event('volumes:change')); } catch (er) { /* old browser */ }
  }

  function fmtV(v) {
    if (v == null || !isFinite(v)) return '';
    var a = Math.abs(v), d = a >= 1000 ? 2 : a >= 1 ? 4 : 6;
    return String(+v.toFixed(d)).replace('.', ',');
  }
  function readV(s) {
    var t = String(s == null ? '' : s).trim();
    if (!t) return null;
    var v = S.num(t);
    return v != null && v >= 0 ? v : NaN;
  }

  var Vol = {
    filter: 'all', q: '',

    works: function () { return worksOf(A()); },

    count: function () {
      var app = A(), n = 0;
      Object.keys(app.vol || {}).forEach(function (k) { var d = app.vol[k]; if (d && (d.v != null || d.note)) n++; });
      return n + Object.keys(app.qtys || {}).length;
    },

    render: function () {
      var app = A(), host = $('volBody');
      if (!host) return;
      var works = this.works(), q = S.nameKey(this.q || ''), filter = this.filter, n = 0, rows = [], section = null;
      if (!works.length) {
        host.innerHTML = '<div class="cmp-empty">В загруженных файлах нет локальной ресурсной ведомости (форма 5, лист вроде «01_ЛРВ») — ' +
          'объёмы работ взять неоткуда. Количество ресурса можно изменить в «Проверка цен»: нажмите на «Общее кол-во».</div>';
        this.status(works);
        return;
      }
      works.forEach(function (w) {
        var d = (app.vol || {})[w.key] || null;
        var marked = !!(d && (d.v != null || d.note));
        if (filter === 'marked' && !marked) return;
        if (q && S.nameKey(w.name).indexOf(q) < 0) return;
        if (w.section !== section) {
          section = w.section;
          rows.push('<tr class="vsec"><td></td><td colspan="5">' + S.esc(section || 'Без раздела') + '</td></tr>');
        }
        n++;
        var just = !!(d && d.note === V.NOTE);
        rows.push('<tr data-k="' + S.esc(w.key) + '"' + (marked ? ' class="on"' : '') + '>' +
          '<td class="mid">' + S.esc(w.no) + '</td>' +
          '<td title="' + S.esc(w.code + ' · ' + w.project + ' · ' + w.sheet) + '">' + S.esc(w.name) + '</td>' +
          '<td class="mid">' + S.esc(w.unit) + '</td>' +
          '<td class="num">' + fmtV(w.volume) + '</td>' +
          '<td class="num"><input class="vin" data-f="v" inputmode="decimal" value="' + (d && d.v != null ? fmtV(d.v) : '') + '" placeholder="—"></td>' +
          '<td><label class="vjust"><input type="checkbox" data-f="just"' + (just ? ' checked' : '') + '> обосновать</label>' +
          '<input class="vnote" data-f="note" value="' + S.esc(d && d.note && !just ? d.note : '') + '" placeholder="примечание"></td></tr>');
      });
      host.innerHTML = '<table class="vtbl"><thead><tr><th>№</th><th>Наименование работ и затрат</th><th>Ед. изм.</th>' +
        '<th>Объём по смете</th><th>Объём по проекту</th><th>Примечание</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>';
      this.status(works, n);
    },

    status: function (works, shown) {
      var el = $('volCount');
      if (!el) return;
      var app = A(), marked = 0, changed = 0;
      (works || []).forEach(function (w) { var d = (app.vol || {})[w.key]; if (d && (d.v != null || d.note)) marked++; if (d && d.v != null) changed++; });
      el.textContent = works && works.length ? (shown != null ? shown + ' / ' : '') + works.length + ' работ · с замечанием ' + marked +
        (changed ? ' · объём изменён ' + changed : '') + (Object.keys(app.qtys || {}).length ? ' · кол-во ресурсов изменено ' + Object.keys(app.qtys).length : '') : '';
      var tab = document.querySelector('.tab[data-pane="volumes"]');
      if (tab) tab.textContent = 'Объёмы работ' + (this.count() ? ' · ' + this.count() : '');
    },

    /** One field of one work changed. */
    edit: function (key, field, el) {
      var app = A(), d = Object.assign({ v: null, note: '' }, (app.vol || {})[key] || {});
      if (field === 'v') {
        var v = readV(el.value);
        if (v !== v) { el.classList.add('bad'); app.toast('Объём — число, например 0,25', true); return; }
        el.classList.remove('bad');
        var w = this.works().filter(function (x) { return x.key === key; })[0];
        d.v = v != null && w && Math.abs(v - w.volume) < 1e-9 ? null : v;
      } else if (field === 'just') d.note = el.checked ? V.NOTE : '';
      else if (field === 'note') d.note = el.value.trim();
      app.vol = app.vol || {};
      if (d.v == null && !d.note) delete app.vol[key]; else app.vol[key] = d;
      var tr = el.closest('tr');
      if (tr) {
        tr.classList.toggle('on', !!app.vol[key]);
        if (field === 'just') { var n = tr.querySelector('.vnote'); if (n) n.value = ''; }
        if (field === 'note') { var j = tr.querySelector('[data-f="just"]'); if (j) j.checked = d.note === V.NOTE; }
      }
      if (field === 'v') quantitiesChanged(app);      // the quantities follow; the table stays as typed in
      else { try { document.dispatchEvent(new Event('volumes:change')); } catch (er) { /* old browser */ } }   // a remark: only saved
      this.status(this.works());
    },

    /**
     * «Общее кол-во» clicked in «Проверка цен»: the expert's total for that resource. Empty — back to the automatic one
     * (the estimate's, or what the volumes of the works give); the number shown, untouched — nothing changes.
     */
    editQty: function (key) {
      var app = A(), r = app.model && app.model.resources.filter(function (x) { return x.key === key; })[0];
      if (!r) return;
      var cur = r.qty2 != null ? r.qty2 : r.qty, auto = r.qtyAuto != null ? r.qtyAuto : r.qty;
      var shown = fmtV(cur);
      var t = window.prompt('Количество по экспертизе для «' + r.name + '» (' + r.unit + ').\nПо смете: ' + fmtV(r.qty) +
        (r.qtyAuto != null ? '; по объёмам работ: ' + fmtV(r.qtyAuto) : '') + '. Пусто — автоматически.' +
        (r.qtyWait ? '\nРанее указано ' + fmtV(r.qtyWait.v) + ' при количестве по смете ' + fmtV(r.qtyWait.base) +
          ' — смета с тех пор изменилась, поэтому оно не применяется. OK — применить его к нынешней смете.' : ''), r.qtyWait ? fmtV(r.qtyWait.v) : shown);
      if (t == null) return;
      // looked at, not changed — unless a waiting total was shown: OK sets it against the estimate as it is now
      if (!r.qtyWait && String(t).trim() === shown) return;
      var v = readV(t);
      if (v !== v) { app.toast('Количество — число', true); return; }
      app.qtys = app.qtys || {};
      // the automatic quantity typed back (as it is shown) is no decision of its own
      if (v == null || fmtV(v) === fmtV(auto)) delete app.qtys[key];
      else app.qtys[key] = { v: v, base: r.qty || 0 };
      quantitiesChanged(app);
      this.status(this.works());
    },

    /** The resources whose total the expert set by hand (and that holds for the estimate as it is), for Table №1. */
    resRows: function () {
      var app = A(), m = app.model;
      if (!m || !app.qtys) return [];
      // a total equal to the estimate's, with no volume moving it (the volume cleared afterwards), is no change: no «10 → 10» row
      return m.resources.map(function (r) { return { r: r, v: handOf(app, r) }; })
        .filter(function (x) { return x.v != null && !(x.r.qtyAuto == null && Math.abs(x.v - (x.r.qty || 0)) <= 1e-9); })
        .map(function (x) { return { name: x.r.name, unit: x.r.unit, smeta: x.r.qty, expert: x.v, note: '' }; });
    },

    /** «Таблица №1 (объёмы)» for the document: the objects are the enabled projects that have a decided work. */
    table: function () {
      var app = A(), works = this.works(), vol = app.vol || {}, titles = [];
      works.forEach(function (w) {
        var d = vol[w.key];
        if (d && (d.v != null || d.note) && titles.indexOf(w.projectTitle) < 0) titles.push(w.projectTitle);
      });
      if (!titles.length) {
        var first = (app.projects || []).filter(function (p) { return p.enabled !== false; })[0];
        if (first) titles.push(first.title || first.name);
      }
      return V.table(works, vol, this.resRows(), { objects: titles });
    },

    /**
     * «Наш ответ (Excel)»: the «объем» sheet of a reply against the works of every project in — read, not applied.
     * Table №1 is written from the works of all of them (table()), so a reply of two files finds the works of both.
     * → { rows, found, missing: [entry], changed, set } or null (no such sheet).
     */
    readReply: function (wb, first) {
      var rp = V.parseReply(wb);
      if (!rp) return null;
      // a work two estimates have alike (name, unit, volume): the reply's line is the chosen estimate's («Было») first
      var works = this.works();
      if (first) works = works.filter(function (w) { return w.project === first; }).concat(works.filter(function (w) { return w.project !== first; }));
      var m = V.match(rp.entries, works);
      // the «объем» sheet of another object, left in a reply made from an earlier one: its title names another object
      // than the prices', and most of its lines are not in the estimate — only the prices are read (the owner, 2026-11-15)
      if (rp.other && m.found.length * 2 < rp.entries.length) {
        return { rows: 0, found: 0, missing: [], set: {}, changed: 0, foreign: { object: rp.object, priced: rp.priced, rows: rp.entries.length } };
      }
      return { rows: rp.entries.length, found: m.found.length, missing: m.missing, set: m.set,
        changed: Object.keys(m.set).filter(function (k) { return m.set[k].v != null; }).length };
    },
    /** What readReply found goes onto the works (over what was there: the reply is what was sent). */
    applyReply: function (got) {
      var app = A();
      if (!got || !got.found) return;
      app.vol = app.vol || {};
      Object.keys(got.set).forEach(function (k) { app.vol[k] = got.set[k]; });
      app.rebuild();
    },
    /** The reply's volumes in words, for the toast and «Наш ответ применён». */
    replyText: function (got) {
      if (!got) return '';
      if (got.foreign) return 'лист «объем» относится к другому объекту (' + cut(got.foreign.object) + '), а цены — к ' + cut(got.foreign.priced) +
        ': объёмы из него не взяты, прочитаны только цены. Похоже, лист остался от ответа по другой заявке — объёмы этой ' +
        'заявки отмечаются на вкладке «Объёмы работ», и в документ попадёт её собственная Таблица №1';
      return 'объёмов работ: строк ' + got.rows + ', найдено ' + got.found + (got.changed ? ', с объёмом по проекту ' + got.changed : '') +
        (got.missing.length ? ', не найдено ' + got.missing.length : '');
    },

    /** After a rebuild: the table when it is open, the count on its tab always. */
    refresh: function () {
      var pane = $('pane-volumes');
      if (pane && pane.classList.contains('on') && !this.quiet) this.render(); else this.status(this.works());
    },

    init: function () {
      var self = this;
      if (this.inited || !$('volBody')) return;
      this.inited = true;
      $('volBody').addEventListener('change', function (e) {
        var el = e.target, tr = el.closest && el.closest('tr[data-k]');
        if (!tr || !el.dataset.f) return;
        self.edit(tr.dataset.k, el.dataset.f, el);
      });
      $('volQ').addEventListener('input', S.debounce(function () { self.q = $('volQ').value; self.render(); }, 200));
      $('volFilter').addEventListener('change', function () { self.filter = this.value; self.render(); });
    }
  };
  function A() { return window.app; }

  S.Volumes = Vol;
  S.Volumes.applyQty = applyQty;
  document.addEventListener('DOMContentLoaded', function () { Vol.init(); });
  if (document.readyState !== 'loading') Vol.init();
})(S);
