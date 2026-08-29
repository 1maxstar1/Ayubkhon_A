/*
 * Application wiring: files in, model in memory, workbook out.
 */
(function (S) {
  'use strict';

  var LS = 'smeta-taqqoslash/v1';

  var DEFAULTS = {
    stamp: '2026 y.  "____"_______________ dagi   \n\n  №________________________ xulosaga \n2-qo\'yilma',
    docTitle: 'TAQQOSLASH JADVALI  №2',
    noteText: 'Пересмотреть стоимость по всему проекту',
    autoNote: true, hideSums: true, hideQty: true, contents: true,
    cfLimit: 10000000, sheetName: 'Лист1'
  };

  function App() {
    this.projects = [];
    this.model = null;
    this.prices = {};        // resource key -> market unit price
    this.opts = Object.assign({}, DEFAULTS, loadOpts());
    this.seq = 0;
    this.pending = 0;
    this.worker = makeWorker();
    this.bind();
    this.prices_ui = new S.Prices(this);
    this.sheetList = new S.VList(document.getElementById('sheetScroll'), {
      render: this.renderSheet.bind(this)
    });
    this.reportList = new S.VList(document.getElementById('reportScroll'), {
      render: this.renderReport.bind(this)
    });
    this.fillSettings();
    this.renderSide();
    this.ledger();
  }

  function makeWorker() {
    try {
      var blob = new Blob([window.__WORKER_SRC__], { type: 'text/javascript' });
      return new Worker(URL.createObjectURL(blob));
    } catch (e) {
      return null; // falls back to parsing on the main thread
    }
  }

  function loadOpts() {
    try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; }
  }
  App.prototype.saveOpts = function () {
    try { localStorage.setItem(LS, JSON.stringify(this.opts)); } catch (e) { /* private mode */ }
  };

  /* ------------------------------------------------------------- plumbing */

  App.prototype.bind = function () {
    var self = this;

    document.getElementById('pick').addEventListener('change', function (e) {
      self.addFiles(Array.prototype.slice.call(e.target.files));
      e.target.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (t) {
      document.addEventListener(t, function (e) { e.preventDefault(); document.body.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      document.addEventListener(t, function (e) {
        if (t === 'dragleave' && e.relatedTarget) return;
        document.body.classList.remove('drag');
      });
    });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) self.addFiles(Array.prototype.slice.call(files));
    });

    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('on'); });
        document.querySelectorAll('.pane').forEach(function (x) { x.classList.remove('on'); });
        t.classList.add('on');
        document.getElementById('pane-' + t.dataset.pane).classList.add('on');
        if (t.dataset.pane === 'sheet') self.sheetList.refresh();
        if (t.dataset.pane === 'report') self.buildReportPreview();
      });
    });

    document.getElementById('collapseAll').addEventListener('click', function () {
      document.getElementById('main').classList.toggle('narrow');
    });

    document.getElementById('export').addEventListener('click', function () { self.exportWorkbook(); });
    document.getElementById('saveBook').addEventListener('click', function () { self.savePriceBook(); });
    document.getElementById('loadBook').addEventListener('click', function () {
      document.getElementById('bookInput').click();
    });
    document.getElementById('bookInput').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (f) self.loadPriceBook(f);
      e.target.value = '';
    });

    this.bindSheetEditing();

    document.getElementById('q2').addEventListener('input', S.debounce(function () { self.applySheetFilter(); }, 120));
    document.getElementById('jump').addEventListener('change', function () {
      var i = +this.value;
      if (i >= 0) self.sheetList.scrollToRow(i);
    });
    document.getElementById('reportProject').addEventListener('change', function () { self.buildReportPreview(); });
    document.getElementById('reportMode').addEventListener('change', function () {
      self.opts.mode = this.value; self.saveOpts(); self.buildReportPreview();
    });

    bindOpt(this, 'optStamp', 'stamp');
    bindOpt(this, 'optTitle', 'docTitle');
    bindOpt(this, 'optNote', 'noteText');
    bindOpt(this, 'optSheetName', 'sheetName');
    bindOpt(this, 'optCf', 'cfLimit', true);
    bindChk(this, 'optAutoNote', 'autoNote');
    bindChk(this, 'optHideSums', 'hideSums');
    bindChk(this, 'optHideQty', 'hideQty');
    bindChk(this, 'optContents', 'contents');
  };

  /**
   * The market price is editable straight from the assembled sheet, not only on
   * the prices tab. One edit still means one resource: it lands on every row
   * with the same name and unit, which is what "review the price across the
   * whole project" means.
   */
  App.prototype.bindSheetEditing = function () {
    var self = this;
    var scroll = document.getElementById('sheetScroll');

    scroll.addEventListener('input', function (e) {
      var inp = e.target;
      if (!inp.classList || !inp.classList.contains('pin')) return;
      var key = inp.dataset.key;
      var row = self.rowByKeyFirst(key);
      if (!row) return;
      var v = S.num(inp.value);
      self.setPrice(key, v == null ? row.price : v);
      self.echoSheetRows(key);
    });

    // Grouped digits while reading, plain digits while typing.
    scroll.addEventListener('focusin', function (e) {
      var inp = e.target;
      if (!inp.classList || !inp.classList.contains('pin')) return;
      var row = self.rowByKeyFirst(inp.dataset.key);
      if (row) inp.value = inVal(row.market);
      inp.select();
    });
    scroll.addEventListener('focusout', function (e) {
      var inp = e.target;
      if (!inp.classList || !inp.classList.contains('pin')) return;
      var row = self.rowByKeyFirst(inp.dataset.key);
      if (row) inp.value = S.price(row.market);
    });

    scroll.addEventListener('keydown', function (e) {
      var inp = e.target;
      if (!inp.classList || !inp.classList.contains('pin')) return;
      if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); self.stepSheet(+inp.dataset.i, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); self.stepSheet(+inp.dataset.i, -1); }
      else if (e.key === 'Escape') {
        var row = self.rowByKeyFirst(inp.dataset.key);
        if (row) { self.setPrice(inp.dataset.key, row.price); self.sheetList.refresh(); }
      }
    });
  };

  /** Move the caret to the next/previous priced row, skipping the banners. */
  App.prototype.stepSheet = function (i, dir) {
    var rows = this.sheetView || [];
    for (var j = i + dir; j >= 0 && j < rows.length; j += dir) {
      if (rows[j] && rows[j].kind === 'item' && rows[j].key) {
        this.sheetList.scrollToRow(j);
        var el = document.querySelector('#sheetScroll .pin[data-i="' + j + '"]');
        if (el) { el.focus(); el.select(); }
        return;
      }
    }
  };

  App.prototype.rowByKeyFirst = function (key) {
    var rows = this._rowsByKey && this._rowsByKeyFor === this.model ? this._rowsByKey.get(key) : null;
    if (rows && rows.length) return rows[0];
    var all = this.model ? this.model.rows : [];
    for (var i = 0; i < all.length; i++) if (all[i].key === key) return all[i];
    return null;
  };

  /** Repaint the derived cells of every visible row of one resource. */
  App.prototype.echoSheetRows = function (key) {
    var rows = document.querySelectorAll('#sheetScroll .vrow[data-key="' + key.replace(/["\\]/g, '\\$&') + '"]');
    var view = this.sheetView || [];
    var byRow = new Map();
    view.forEach(function (r) { if (r.key === key) byRow.set('r' + r.r, r); });
    for (var i = 0; i < rows.length; i++) {
      var el = rows[i];
      var inp = el.querySelector('.pin');
      var r = inp ? byRow.get(inp.dataset.focus) : null;
      if (!r) continue;
      var qty = r.qty || 0, sm = qty * r.price, mk = qty * r.market, d = sm - mk;
      var chg = !S.near(r.price, r.market);
      var cells = el.querySelectorAll('.c');
      cells[8].textContent = S.money(mk);
      cells[9].textContent = S.money(d);
      cells[9].classList.toggle('diff', chg);
      el.classList.toggle('chg', chg);
      inp.classList.toggle('edited', chg);
      if (document.activeElement !== inp) inp.value = S.price(r.market);
    }
  };

  function bindOpt(app, id, key, numeric) {
    var el = document.getElementById(id);
    el.addEventListener('input', S.debounce(function () {
      app.opts[key] = numeric ? (S.num(el.value) || 0) : el.value;
      app.saveOpts();
    }, 250));
  }
  function bindChk(app, id, key) {
    var el = document.getElementById(id);
    el.addEventListener('change', function () { app.opts[key] = el.checked; app.saveOpts(); });
  }

  App.prototype.fillSettings = function () {
    document.getElementById('optStamp').value = this.opts.stamp;
    document.getElementById('optTitle').value = this.opts.docTitle;
    document.getElementById('optNote').value = this.opts.noteText;
    document.getElementById('optSheetName').value = this.opts.sheetName;
    document.getElementById('optCf').value = this.opts.cfLimit;
    document.getElementById('optAutoNote').checked = !!this.opts.autoNote;
    document.getElementById('optHideSums').checked = !!this.opts.hideSums;
    document.getElementById('optHideQty').checked = !!this.opts.hideQty;
    document.getElementById('optContents').checked = this.opts.contents !== false;
    if (this.opts.mode) document.getElementById('reportMode').value = this.opts.mode;
  };

  App.prototype.busy = function (on, text) {
    document.getElementById('busy').classList.toggle('on', !!on);
    if (text) document.getElementById('busyText').textContent = text;
  };

  App.prototype.toast = function (msg, err) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.toggle('err', !!err);
    t.classList.add('on');
    clearTimeout(this._tt);
    this._tt = setTimeout(function () { t.classList.remove('on'); }, err ? 5000 : 2600);
  };

  /* ---------------------------------------------------------------- files */

  App.prototype.addFiles = function (files) {
    var self = this;
    files = files.filter(function (f) { return /\.xlsx?$|\.xlsm$/i.test(f.name); });
    if (!files.length) { this.toast('Faqat .xlsx fayllar qabul qilinadi', true); return; }
    this.busy(true, files.length + ' ta fayl o\'qilmoqda…');
    // Files finish parsing in whatever order the worker gets to them, so each
    // one keeps the slot it was picked in; the projects are appended in that
    // order once the whole batch is in. Order matters — it decides the column A
    // ranges and the sheet order.
    if (!this.queue) this.queue = [];
    var base = this.queue.length;
    files.forEach(function (f, i) {
      self.queue.push({ slot: base + i, project: null });
      self.readOne(f, base + i);
    });
  };

  App.prototype.readOne = function (file, slot) {
    var self = this;
    this.pending++;
    var reader = new FileReader();
    reader.onload = function () {
      var buf = reader.result;
      if (self.worker) {
        var id = ++self.seq;
        var onMsg = function (e) {
          if (e.data.id !== id) return;
          self.worker.removeEventListener('message', onMsg);
          self.onParsed(file.name, e.data, slot);
        };
        self.worker.addEventListener('message', onMsg);
        self.worker.postMessage({ cmd: 'parse', id: id, name: file.name, buffer: buf }, [buf]);
      } else {
        try {
          var wb = S.readXlsx(new Uint8Array(buf));
          self.onParsed(file.name, { ok: true, objects: S.smeta.parseWorkbook(wb, file.name), sheetCount: wb.sheets.length }, slot);
        } catch (err) {
          self.onParsed(file.name, { ok: false, error: String(err.message || err) }, slot);
        }
      }
    };
    reader.onerror = function () { self.onParsed(file.name, { ok: false, error: 'Faylni o\'qib bo\'lmadi' }, slot); };
    reader.readAsArrayBuffer(file);
  };

  App.prototype.onParsed = function (name, res, slot) {
    this.pending--;
    var entry = this.queue && this.queue[slot];
    if (!res.ok) {
      this.toast(name + ': ' + res.error, true);
    } else if (!res.objects.length) {
      this.toast(name + ': resurs varaqlari topilmadi. Varaqda «НАИМЕНОВАНИЕ · КОЛ-ВО · ' +
        'ЦЕНА · СУММА» sarlavhali qator, yoki «ЗАТРАТЫ ТРУДА / МАШИНЫ / МАТЕРИАЛЫ / ' +
        'ОБОРУДОВАНИЕ» bo\'limlaridan bittasi bo\'lishi kerak.', true);
    } else {
      var title = res.objects[0].title || name.replace(/\.[^.]+$/, '');
      if (entry) {
        entry.project = {
          id: 'p' + (++this.seq),
          file: name,
          title: title,
          intro: introFrom(title),
          objects: res.objects,
          enabled: true,
          open: true
        };
      }
      this.toast(name + ': ' + res.objects.length + ' ta obyekt varaqi topildi');
    }
    if (this.pending <= 0) {
      var self = this;
      (this.queue || []).forEach(function (q) {
        if (!q.project) return;
        q.project.name = shortTab(q.project.file.replace(/\.[^.]+$/, ''), self.projects);
        self.projects.push(q.project);
      });
      this.queue = [];
      this.busy(false);
      this.rebuild();
      this.renderSide();
    }
  };

  /** A sheet tab name has to be short and unique; keep it human. */
  function shortTab(base, existing) {
    var words = base.replace(/[_\d]+/g, ' ').split(/\s+/).filter(function (w) { return w.length > 2; });
    var n = (words[0] || base).slice(0, 20) || 'Loyiha';
    var i = 2, out = n;
    while (existing.some(function (p) { return p.name === out; })) out = n + ' ' + (i++);
    return out;
  }

  function introFrom(title) {
    return '«' + String(title).replace(/^«+/, '').replace(/[».\s]+$/, '') +
      '» obyekti bo\'yicha loyiha-smeta hujjatlarida ko\'rsatilgan resurslarning ' +
      'narx parametrlarini o\'rganish natijalariga ko\'ra';
  }

  /* -------------------------------------------------------------- sidebar */

  App.prototype.renderSide = function () {
    var host = document.getElementById('projects');
    var self = this;
    document.getElementById('dropHint').style.display = this.projects.length ? 'none' : '';
    host.innerHTML = this.projects.map(function (p, pi) {
      var on = p.objects.filter(function (o) { return o.enabled !== false; }).length;
      return '<div class="proj" data-p="' + pi + '">' +
        '<header>' +
        '<input type="checkbox" ' + (p.enabled ? 'checked' : '') + ' data-act="proj-on" title="Loyihani qo\'shish">' +
        '<input class="tab-name" data-act="tab" value="' + S.esc(p.name) + '" title="Excel varaq nomi">' +
        range(p, 'Лист1 A ustuni') +
        '<button class="link" data-act="pup" title="Yuqoriga — A ustuni raqamlari o\'zgaradi">▲</button>' +
        '<button class="link" data-act="pdown" title="Pastga">▼</button>' +
        '<button class="link" data-act="del" title="Olib tashlash">×</button>' +
        '</header>' +
        '<div class="meta">' + S.esc(p.file) + ' · ' + on + '/' + p.objects.length + ' varaq' +
        '<textarea data-act="intro" rows="3" title="Hisobot sarlavhasi ostidagi matn">' + S.esc(p.intro) + '</textarea>' +
        '</div>' +
        '<ul class="objs">' + p.objects.map(function (o, oi) {
          return '<li class="' + (o.enabled === false ? 'off' : '') + '" data-o="' + oi + '">' +
            '<input type="checkbox" ' + (o.enabled === false ? '' : 'checked') + ' data-act="obj-on">' +
            '<span class="nm" title="' + S.esc(o.subtitle) + '">' + S.esc(o.subtitle) + '</span>' +
            '<small>' + o.items + '</small>' +
            range(o, 'Лист1 A ustuni') +
            '<button class="mv" data-act="up" title="Yuqoriga">▲</button>' +
            '<button class="mv" data-act="down" title="Pastga">▼</button>' +
            '</li>';
        }).join('') + '</ul></div>';
    }).join('');

    host.querySelectorAll('[data-act]').forEach(function (el) {
      var proj = self.projects[+el.closest('.proj').dataset.p];
      var li = el.closest('li');
      var obj = li ? proj.objects[+li.dataset.o] : null;
      var act = el.dataset.act;
      if (act === 'tab') {
        el.addEventListener('input', S.debounce(function () { proj.name = el.value.trim() || proj.name; }, 200));
      } else if (act === 'intro') {
        el.addEventListener('input', S.debounce(function () { proj.intro = el.value; }, 200));
      } else if (act === 'proj-on') {
        el.addEventListener('change', function () { proj.enabled = el.checked; self.rebuild(); self.renderSide(); });
      } else if (act === 'obj-on') {
        el.addEventListener('change', function () { obj.enabled = el.checked; self.rebuild(); self.renderSide(); });
      } else if (act === 'del') {
        el.addEventListener('click', function () {
          self.projects.splice(self.projects.indexOf(proj), 1);
          self.rebuild(); self.renderSide();
        });
      } else if (act === 'pup' || act === 'pdown') {
        el.addEventListener('click', function () {
          var i = self.projects.indexOf(proj), j = act === 'pup' ? i - 1 : i + 1;
          if (j < 0 || j >= self.projects.length) return;
          self.projects.splice(i, 1);
          self.projects.splice(j, 0, proj);
          self.rebuild(); self.renderSide();
        });
      } else if (act === 'up' || act === 'down') {
        el.addEventListener('click', function () {
          var i = proj.objects.indexOf(obj), j = act === 'up' ? i - 1 : i + 1;
          if (j < 0 || j >= proj.objects.length) return;
          proj.objects.splice(i, 1);
          proj.objects.splice(j, 0, obj);
          self.rebuild(); self.renderSide();
        });
      }
    });
  };

  function range(x, title) {
    if (!x._from) return '';
    return '<span class="rng" title="' + title + '">' + x._from + '–' + x._to + '</span>';
  }

  /* ----------------------------------------------------------------- model */

  App.prototype.rebuild = function () {
    var t0 = performance.now();
    if (!this.projects.length) {
      this.model = null;
      document.getElementById('export').disabled = true;
    } else {
      this.model = S.assemble(this.projects, this.prices);
      if (this.looseBook) {
        this.spreadLooseBook();
        S.applyPrices(this.model, this.prices);
      }
      document.getElementById('export').disabled = !this.model.rows.length;
    }
    this.indexRanges();
    this.sheetRows = this.model ? this.model.rows : [];
    this.sheetView = this.sheetRows;
    this.sheetList.setCount(this.sheetView.length);
    this.prices_ui.apply();
    this.fillJump();
    this.fillReportProjects();
    this.ledger();
    this._buildMs = Math.round(performance.now() - t0);
    document.getElementById('sheetCount').textContent =
      this.sheetView.length + ' qator · ' + this._buildMs + ' ms';
  };

  /**
   * Hang the column A ranges off the projects and build a row -> block lookup.
   * These are the numbers that used to be written down by hand to tell the
   * projects apart inside one long sheet.
   */
  App.prototype.indexRanges = function () {
    this.projects.forEach(function (p) {
      p._from = p._to = 0;
      p.objects.forEach(function (o) { o._from = o._to = o._items = 0; });
    });
    this.rowOwner = [];
    if (!this.model) return;
    var owner = this.rowOwner;
    this.model.spans.forEach(function (sp) {
      var proj = sp.project;
      proj._from = sp.from; proj._to = sp.to; proj._items = sp.items;
      var live = proj.objects.filter(function (o) { return o.enabled !== false; });
      sp.objects.forEach(function (r, i) {
        var o = live[i];
        if (o) { o._from = r.from; o._to = r.to; o._items = r.items; }
        for (var k = r.from; k <= r.to; k++) owner[k] = { p: proj, name: r.name, from: r.from, to: r.to };
      });
    });
  };

  /** Resolve name-only price-book entries against the resources now loaded. */
  App.prototype.spreadLooseBook = function () {
    var loose = this.looseBook;
    if (!loose || !this.model) return;
    var self = this;
    this.model.resources.forEach(function (r) {
      var p = loose[r.nk];
      if (p != null && self.prices[r.key] == null) self.prices[r.key] = p;
    });
  };

  App.prototype.setPrice = function (key, value) {
    this.prices[key] = value;
    this.applyOne(key, value);
  };

  App.prototype.setPrices = function (map) {
    var self = this;
    Object.keys(map).forEach(function (k) { self.prices[k] = map[k]; });
    if (this.model) S.applyPrices(this.model, this.prices);
    this.prices_ui.apply();
    this.ledger();
    this.sheetList.refresh();
  };

  /** One key changed: touch only the rows that use it. */
  App.prototype.applyOne = function (key, value) {
    var m = this.model;
    if (!m) return;
    if (!this._rowsByKey || this._rowsByKeyFor !== m) {
      this._rowsByKey = new Map();
      this._rowsByKeyFor = m;
      m.rows.forEach(function (row) {
        if (row.kind !== 'item') return;
        var a = this._rowsByKey.get(row.key);
        if (a) a.push(row); else this._rowsByKey.set(row.key, [row]);
      }, this);
    }
    var rows = this._rowsByKey.get(key) || [];
    var rec = null;
    for (var i = 0; i < rows.length; i++) {
      rows[i].market = value;
      rows[i].cells[m.cols.MPRICE] = { v: value };
    }
    for (var j = 0; j < m.resources.length; j++) {
      if (m.resources[j].key === key) { rec = m.resources[j]; break; }
    }
    if (rec) { rec.market = value; rec.marketSum = rec.qty * value; }
    this.ledgerSoon();
  };

  App.prototype.ledgerSoon = S.debounce(function () {
    this.ledger();
    this.prices_ui.status();
    this.prices_ui.list.refresh();
  }, 200);

  App.prototype.ledger = function () {
    var el = document.getElementById('ledger');
    var m = this.model;
    if (!m || !m.resources.length) {
      el.innerHTML = '<span class="empty">Smeta fayllarini qo\'shing — .xlsx fayllarni oynaga tashlash ham mumkin.</span>';
      return;
    }
    // Both sides are summed row by row: a resource can carry several smeta
    // prices, and an untouched row keeps its own, so it must not be valued at
    // one representative price.
    var smeta = 0, market = 0, changed = 0;
    m.resources.forEach(function (r) {
      smeta += r.smetaSum;
      market += r.marketSum;
      if (!S.near(r.smetaSum, r.marketSum)) changed++;
    });
    var diff = smeta - market;
    var pct = smeta ? diff / smeta * 100 : 0;
    el.innerHTML =
      block('Loyihalar', m.spans.length) +
      block('Qatorlar', S.money(m.rows.length)) +
      block('Resurslar', S.money(m.resources.length) + ' · ' + changed + ' o\'zgargan') +
      block('Smeta bo\'yicha', S.money(smeta) + ' so\'m') +
      block('Bozor bo\'yicha', S.money(market) + ' so\'m') +
      block('Farq', S.money(diff) + ' so\'m  (' + pct.toFixed(2) + '%)', diff > 0 ? 'good' : diff < 0 ? 'bad' : '');
  };

  function block(k, v, cls) {
    return '<div><span class="k">' + k + '</span><span class="v ' + (cls || '') + '">' + v + '</span></div>';
  }

  /* ------------------------------------------------------- sheet preview */

  // The continuous 1..N number that lives in column A of the assembled sheet —
  // the one that says which rows belong to which project.
  var IDX_COL = { w: 62, cls: 'num idx', h: 'A' };

  var SHEET_COLS = [
    { w: 58, cls: 'mid', h: '№' },
    { w: 0, h: 'НАИМЕНОВАНИЕ' },
    { w: 74, cls: 'mid', h: 'ЕД.ИЗМ.' },
    { w: 96, cls: 'num', h: 'КОЛ-ВО' },
    { w: 106, cls: 'num', h: 'Смета цена' },
    { w: 128, cls: 'num', h: 'Смета сумма' },
    { w: 106, cls: 'num', h: 'Бозор цена' },
    { w: 128, cls: 'num', h: 'Бозор сумма' },
    { w: 118, cls: 'num', h: 'Фарқ' }
  ];

  function w(c) { return c.w ? 'flex:0 0 ' + c.w + 'px' : 'flex:1 1 auto;min-width:240px'; }

  App.prototype.fillJump = function () {
    var sel = document.getElementById('jump');
    var opts = ['<option value="-1">Blokka o\'tish…</option>'];
    var owner = this.rowOwner || [];
    (this.sheetRows || []).forEach(function (r, i) {
      if (r.kind !== 'title' && r.kind !== 'object') return;
      var t = r.cells[2] && r.cells[2].v;
      if (!t) return;
      var o = owner[r.r] || owner[r.r + 1];
      // A project line shows the project's whole range, a street line its own.
      var lo = r.kind === 'title' ? (o && o.p._from) : (o && o.from);
      var hi = r.kind === 'title' ? (o && o.p._to) : (o && o.to);
      var tail = lo ? '   [' + lo + '–' + hi + ']' : '';
      opts.push('<option value="' + i + '">' + (r.kind === 'title' ? '▸ ' : '\u00a0\u00a0\u00a0') +
        S.esc(String(t).slice(0, 58)) + tail + '</option>');
    });
    sel.innerHTML = opts.join('');
  };

  App.prototype.applySheetFilter = function () {
    var q = S.nameKey(document.getElementById('q2').value);
    if (!q) this.sheetView = this.sheetRows;
    else this.sheetView = this.sheetRows.filter(function (r) {
      return r.nm && S.nameKey(r.nm).indexOf(q) >= 0;
    });
    this.sheetList.setCount(this.sheetView.length);
    document.getElementById('sheetCount').textContent = this.sheetView.length + ' qator';
  };

  App.prototype.renderSheet = function (from, to) {
    if (!this._sheetHead) {
      document.getElementById('sheetHead').innerHTML = [IDX_COL].concat(SHEET_COLS).map(function (c) {
        return '<div class="c' + (c.cls ? ' ' + c.cls : '') + '" style="' + w(c) +
          '"' + (c === IDX_COL ? ' title="Лист1 A ustuni — umumiy qator raqami"' : '') + '>' +
          S.esc(c.h) + '</div>';
      }).join('');
      this._sheetHead = true;
    }
    var out = [], rows = this.sheetView || [];
    for (var i = from; i < to; i++) {
      var r = rows[i];
      if (!r) continue;
      out.push(rowHtml(r, r.cells, 2, 3, 4, 5, 6, 8, i, true, true));
    }
    this.showWhere(rows[from]);
    return out.join('');
  };

  /** Which project and street the top visible row belongs to. */
  App.prototype.showWhere = function (row) {
    var el = document.getElementById('sheetWhere');
    var o = row && this.rowOwner ? this.rowOwner[row.r] : null;
    el.innerHTML = o
      ? 'A' + row.r + ' · <b>' + S.esc(o.p.name) + '</b> ' + o.p._from + '–' + o.p._to +
        ' · ' + S.esc(o.name) + ' ' + o.from + '–' + o.to
      : '';
  };

  /**
   * Shared row renderer for both previews; column indexes differ per sheet.
   * `editable` puts a live input in the БОЗОР ЦЕНА cell — the same edit as on
   * the prices tab, so it lands on every row of that resource at once.
   */
  function rowHtml(r, cells, cNo, cName, cUnit, cQty, cPrice, cMarket, i, editable, showIndex) {
    var kind = r.kind || 'blank';
    var idx = showIndex
      ? '<div class="c num idx" style="' + w(IDX_COL) + '">' + (r.r || '') + '</div>' : '';
    if (kind !== 'item') {
      var label = '';
      for (var c = cNo; c <= cName + 1; c++) { if (cells[c] && cells[c].v != null) { label = String(cells[c].v); break; } }
      if (!label && cells[12] && cells[12].v != null) label = String(cells[12].v);
      return '<div class="vrow k-' + kind + '">' + idx + '<div class="c" style="flex:1 1 auto">' +
        S.esc(label.replace(/\n/g, ' ')) + '</div></div>';
    }
    var qty = r.qty || 0, sm = qty * r.price, mk = qty * r.market, d = sm - mk;
    var chg = !S.near(r.price, r.market);
    var no = cells[cNo] && cells[cNo].v;
    var market = editable && r.key
      ? '<div class="c num" style="' + w(SHEET_COLS[6]) + '">' +
        '<input class="pin' + (chg ? ' edited' : '') + '" data-key="' + S.esc(r.key) +
        '" data-focus="r' + r.r + '" data-i="' + i + '" inputmode="decimal" value="' +
        S.price(r.market) + '"></div>'
      : '<div class="c num" style="' + w(SHEET_COLS[6]) + '">' + S.price(r.market) + '</div>';
    return '<div class="vrow k-item' + (chg ? ' chg' : '') + '"' +
      (r.key ? ' data-key="' + S.esc(r.key) + '"' : '') + '>' + idx +
      '<div class="c mid" style="' + w(SHEET_COLS[0]) + '">' + (no == null ? '' : S.esc(no)) + '</div>' +
      '<div class="c" style="' + w(SHEET_COLS[1]) + '" title="' + S.esc(r.nm) + '">' + S.esc(r.nm) + '</div>' +
      '<div class="c mid" style="' + w(SHEET_COLS[2]) + '">' + S.esc(r.unit) + '</div>' +
      '<div class="c num" style="' + w(SHEET_COLS[3]) + '">' + S.qty(qty) + '</div>' +
      '<div class="c num" style="' + w(SHEET_COLS[4]) + '">' + S.price(r.price) + '</div>' +
      '<div class="c num" style="' + w(SHEET_COLS[5]) + '">' + S.money(sm) + '</div>' +
      market +
      '<div class="c num" style="' + w(SHEET_COLS[7]) + '">' + S.money(mk) + '</div>' +
      '<div class="c num' + (chg ? ' diff' : '') + '" style="' + w(SHEET_COLS[8]) + '">' + S.money(d) + '</div>' +
      '</div>';
  }

  function inVal(v) {
    if (v == null) return '';
    return Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : String(Math.round(v * 1000) / 1000);
  }

  /* ------------------------------------------------------ report preview */

  App.prototype.fillReportProjects = function () {
    var sel = document.getElementById('reportProject');
    var cur = sel.value;
    sel.innerHTML = (this.model ? this.model.spans : []).map(function (s, i) {
      return '<option value="' + i + '">' + S.esc(s.project.name) + '</option>';
    }).join('');
    if (cur && sel.querySelector('option[value="' + cur + '"]')) sel.value = cur;
  };

  App.prototype.reportOpts = function () {
    return {
      mode: document.getElementById('reportMode').value,
      stamp: this.opts.stamp, docTitle: this.opts.docTitle, noteText: this.opts.noteText,
      autoNote: this.opts.autoNote, hideSums: this.opts.hideSums, hideQty: this.opts.hideQty,
      cfLimit: this.opts.cfLimit, sheetName: this.opts.sheetName,
      contents: this.opts.contents !== false
    };
  };

  App.prototype.buildReportPreview = function () {
    var i = +document.getElementById('reportProject').value;
    if (!this.model || !this.model.spans[i]) {
      this.reportRows = [];
      this.reportList.setCount(0);
      document.getElementById('reportCount').textContent = '';
      return;
    }
    var t0 = performance.now();
    var rep = S.report.build(this.model, this.model.spans[i], this.reportOpts());
    this.reportRows = rep.rows;
    this.reportList.setCount(rep.rows.length);
    var items = rep.rows.filter(function (r) { return r.kind === 'item'; }).length;
    document.getElementById('reportCount').textContent =
      rep.rows.length + ' qator · ' + items + ' resurs · ' + Math.round(performance.now() - t0) + ' ms';
  };

  App.prototype.renderReport = function (from, to) {
    if (!this._repHead) {
      document.getElementById('reportHead').innerHTML = SHEET_COLS.map(function (c) {
        return '<div class="c' + (c.cls ? ' ' + c.cls : '') + '" style="' + w(c) + '">' + S.esc(c.h) + '</div>';
      }).join('');
      this._repHead = true;
    }
    var out = [], rows = this.reportRows || [];
    for (var i = from; i < to; i++) {
      var r = rows[i];
      if (!r) continue;
      out.push(rowHtml(r, r.cells, 2, 4, 5, 6, 7, 9, i, false, false));
    }
    return out.join('');
  };

  /* ------------------------------------------------------------- exports */

  App.prototype.exportWorkbook = function () {
    if (!this.model) return;
    var self = this;
    this.busy(true, 'Excel fayl tayyorlanmoqda…');
    setTimeout(function () {
      try {
        var t0 = performance.now();
        var bytes = S.buildWorkbook(self.model, self.reportOpts());
        download(bytes, fileName(self));
        self.toast('Fayl tayyor · ' + (bytes.length / 1024 / 1024).toFixed(1) + ' MB · ' +
          Math.round(performance.now() - t0) + ' ms');
      } catch (e) {
        self.toast('Eksport xatosi: ' + (e.message || e), true);
      } finally {
        self.busy(false);
      }
    }, 30);
  };

  function fileName(app) {
    var d = new Date();
    var p = String(d.getFullYear()) + pad(d.getMonth() + 1) + pad(d.getDate());
    var base = app.projects.length === 1 ? app.projects[0].name : 'Taqqoslash';
    return base.replace(/[^\wЀ-ӿ\- ]+/g, '') + '_taqqoslash_' + p + '.xlsx';
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function download(bytes, name) {
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  App.prototype.savePriceBook = function () {
    if (!this.model) { this.toast('Avval smeta fayllarini qo\'shing', true); return; }
    var self = this;
    var book = this.model.resources
      .filter(function (r) { return !S.near(r.price, r.market); })
      .map(function (r) {
        // `smeta` identifies which priced line this belongs to when reloaded.
        return { name: r.name, unit: r.unit, price: r.market, smeta: r.price, note: self.opts.noteText };
      });
    if (!book.length) { this.toast('Hali birorta narx o\'zgartirilmagan', true); return; }
    var blob = new Blob([JSON.stringify(book, null, 1)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'narx_kitobi.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    this.toast(book.length + ' ta narx saqlandi');
  };

  App.prototype.loadPriceBook = function (file) {
    var self = this;
    var reader = new FileReader();
    var isJson = /\.json$/i.test(file.name);
    reader.onload = function () {
      var entries;
      try {
        entries = isJson ? JSON.parse(reader.result) : bookFromXlsx(new Uint8Array(reader.result));
      } catch (e) {
        self.toast('Narx kitobini o\'qib bo\'lmadi: ' + (e.message || e), true);
        return;
      }
      if (!Array.isArray(entries)) { self.toast('Narx kitobi ro\'yxat ko\'rinishida bo\'lishi kerak', true); return; }
      // An entry that records the smeta price it was taken from lands on exactly
      // that line; an older book without one is applied to every priced variant
      // of the name.
      var exact = {}, loose = {}, n = 0;
      entries.forEach(function (e) {
        var p = S.num(e.price != null ? e.price : e.market);
        if (!e.name || p == null) return;
        var sm = S.num(e.smeta);
        if (sm != null) exact[S.resKey(e.name, e.unit || '', sm)] = p;
        else loose[S.nameUnitKey(e.name, e.unit || '')] = p;
        n++;
      });
      self.prices = Object.assign(self.prices, exact);
      self.looseBook = Object.assign(self.looseBook || {}, loose);
      self.spreadLooseBook();
      if (self.model) S.applyPrices(self.model, self.prices);
      self.prices_ui.apply();
      self.ledger();
      self.sheetList.refresh();
      self.toast(n + ' ta narx yuklandi');
    };
    if (isJson) reader.readAsText(file); else reader.readAsArrayBuffer(file);
  };

  /** Accept a plain price list as a spreadsheet too: name / unit / price columns. */
  function bookFromXlsx(bytes) {
    var wb = S.readXlsx(bytes);
    for (var s = 0; s < wb.sheets.length; s++) {
      var rows = wb.sheets[s].rows;
      var hdr = -1, cName = 0, cUnit = 0, cPrice = 0;
      for (var r = 1; r < Math.min(rows.length, 30) && hdr < 0; r++) {
        var cells = rows[r] || [];
        for (var c = 1; c < cells.length; c++) {
          var t = S.nameKey(cells[c] && cells[c].v);
          if (!t) continue;
          if (/NAME|НАИМЕН|NOM/.test(t)) cName = c;
          else if (/UNIT|ЕД|BIRLIK/.test(t)) cUnit = c;
          else if (/PRICE|ЦЕНА|NARX/.test(t)) cPrice = c;
        }
        if (cName && cPrice) hdr = r;
      }
      if (hdr < 0) continue;
      var out = [];
      for (var i = hdr + 1; i < rows.length; i++) {
        var row = rows[i];
        if (!row) continue;
        var nm = row[cName] && row[cName].v;
        var pr = S.num(row[cPrice] && row[cPrice].v);
        if (!nm || pr == null) continue;
        out.push({ name: String(nm), unit: cUnit && row[cUnit] ? String(row[cUnit].v || '') : '', price: pr });
      }
      if (out.length) return out;
    }
    throw new Error('narx ustunlari topilmadi');
  }

  document.addEventListener('DOMContentLoaded', function () { window.app = new App(); });
  if (document.readyState !== 'loading' && !window.app) window.app = new App();

  S.App = App;
})(S);
