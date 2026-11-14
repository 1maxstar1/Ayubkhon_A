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
 * State: app.vol (work key → { v, note }), app.qtys (resource key → the expert's total). Saved with the workspace
 * (sync.js), kept across reloads; the prices and Table №2 are not touched by any of it.
 */
(function (S) {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var V = S.volumes;

  /** Every work of the enabled projects, keyed by its file. */
  function worksOf(app) {
    var out = [];
    (app.projects || []).forEach(function (p) {
      if (p.enabled === false || !p.works || !p.works.length) return;
      V.list(p.works, p.file).forEach(function (w) { w.project = p.name; out.push(w); });
    });
    return out;
  }

  /** After the model is built: each resource's quantity by the expert (r.qty2), from the volumes and by hand. */
  function applyQty(app) {
    var m = app.model;
    if (!m) return;
    var d = V.deltas(worksOf(app), app.vol || {}), tot = {};
    m.resources.forEach(function (r) { tot[r.nk] = (tot[r.nk] || 0) + (r.qty || 0); });
    m.resources.forEach(function (r) {
      var hand = app.qtys && app.qtys[r.key];
      if (hand != null) r.qty2 = hand;
      else if (d[r.nk] && tot[r.nk] > 0) r.qty2 = Math.max(0, r.qty + d[r.nk] * (r.qty / tot[r.nk]));
      else delete r.qty2;
    });
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
      if (field === 'v') {         // the quantities follow (and the workspace is saved); the table stays as typed in
        this.quiet = true;
        try { app.rebuild(); } finally { this.quiet = false; }
      } else {                     // a remark moves nothing: only saved
        this.status(this.works());
        try { document.dispatchEvent(new Event('volumes:change')); } catch (er) { /* old browser */ }
      }
    },

    /** «Общее кол-во» clicked in «Проверка цен»: the expert's total for that resource, or back to the estimate's. */
    editQty: function (key) {
      var app = A(), r = app.model && app.model.resources.filter(function (x) { return x.key === key; })[0];
      if (!r) return;
      var cur = r.qty2 != null ? r.qty2 : r.qty;
      var t = window.prompt('Количество по экспертизе для «' + r.name + '» (' + r.unit + ').\nПо смете: ' + fmtV(r.qty) +
        '. Пусто — как в смете.', fmtV(cur));
      if (t == null) return;
      var v = readV(t);
      if (v !== v) { app.toast('Количество — число', true); return; }
      app.qtys = app.qtys || {};
      if (v == null || Math.abs(v - r.qty) < 1e-9) delete app.qtys[key]; else app.qtys[key] = v;
      app.rebuild();
    },

    /** The resources whose total the expert set by hand, for Table №1. */
    resRows: function () {
      var app = A(), m = app.model;
      if (!m || !app.qtys) return [];
      return m.resources.filter(function (r) { return app.qtys[r.key] != null; })
        .map(function (r) { return { name: r.name, unit: r.unit, smeta: r.qty, expert: app.qtys[r.key], note: '' }; });
    },

    /** «Таблица №1 (объёмы)» for the document. */
    table: function () {
      var app = A();
      var p = (app.projects || [])[0];
      return V.table(this.works(), app.vol || {}, this.resRows(), { object: p ? p.title : '' });
    },

    /**
     * «Наш ответ (Excel)»: the «объем» sheet of a reply against the works of that project — read, not applied.
     * → { rows, found, missing: [entry], changed, set } or null (no such sheet).
     */
    readReply: function (wb, project) {
      var rp = V.parseReply(wb);
      if (!rp) return null;
      var m = V.match(rp.entries, project && project.works ? V.list(project.works, project.file) : []);
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
