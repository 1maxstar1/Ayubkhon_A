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
    autoNote: true, hideSums: true, hideQty: true,
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
    files.forEach(function (f) { self.readOne(f); });
  };

  App.prototype.readOne = function (file) {
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
          self.onParsed(file.name, e.data);
        };
        self.worker.addEventListener('message', onMsg);
        self.worker.postMessage({ cmd: 'parse', id: id, name: file.name, buffer: buf }, [buf]);
      } else {
        try {
          var wb = S.readXlsx(new Uint8Array(buf));
          self.onParsed(file.name, { ok: true, objects: S.smeta.parseWorkbook(wb, file.name), sheetCount: wb.sheets.length });
        } catch (err) {
          self.onParsed(file.name, { ok: false, error: String(err.message || err) });
        }
      }
    };
    reader.onerror = function () { self.onParsed(file.name, { ok: false, error: 'Faylni o\'qib bo\'lmadi' }); };
    reader.readAsArrayBuffer(file);
  };

  App.prototype.onParsed = function (name, res) {
    this.pending--;
    if (!res.ok) {
      this.toast(name + ': ' + res.error, true);
    } else if (!res.objects.length) {
      this.toast(name + ': resurs varaqlari topilmadi', true);
    } else {
      var base = name.replace(/\.[^.]+$/, '');
      this.projects.push({
        id: 'p' + (++this.seq),
        file: name,
        name: shortTab(base, this.projects),
        title: res.objects[0].title || base,
        intro: introFrom(res.objects[0].title || base),
        objects: res.objects,
        enabled: true,
        open: true
      });
      this.toast(name + ': ' + res.objects.length + ' ta obyekt varaqi topildi');
    }
    if (this.pending <= 0) {
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
    return '«' + String(title).replace(/^«|»\.?$/g, '') +
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

  /* ----------------------------------------------------------------- model */

  App.prototype.rebuild = function () {
    var t0 = performance.now();
    if (!this.projects.length) {
      this.model = null;
      document.getElementById('export').disabled = true;
    } else {
      this.model = S.assemble(this.projects, this.prices);
      document.getElementById('export').disabled = !this.model.rows.length;
    }
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

  App.prototype.ledgerSoon = S.debounce(function () { this.ledger(); this.prices_ui.status(); }, 160);

  App.prototype.ledger = function () {
    var el = document.getElementById('ledger');
    var m = this.model;
    if (!m || !m.resources.length) {
      el.innerHTML = '<span class="empty">Smeta fayllarini qo\'shing — .xlsx fayllarni oynaga tashlash ham mumkin.</span>';
      return;
    }
    var smeta = 0, market = 0, changed = 0;
    m.resources.forEach(function (r) {
      smeta += r.smetaSum;
      market += r.qty * r.market;
      if (!S.near(r.price, r.market)) changed++;
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
    (this.sheetRows || []).forEach(function (r, i) {
      if (r.kind === 'title' || r.kind === 'object') {
        var t = r.cells[2] && r.cells[2].v;
        if (t) opts.push('<option value="' + i + '">' + (r.kind === 'title' ? '▸ ' : '   ') + S.esc(String(t).slice(0, 60)) + '</option>');
      }
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
      document.getElementById('sheetHead').innerHTML = SHEET_COLS.map(function (c) {
        return '<div class="c' + (c.cls ? ' ' + c.cls : '') + '" style="' + w(c) + '">' + S.esc(c.h) + '</div>';
      }).join('');
      this._sheetHead = true;
    }
    var out = [], rows = this.sheetView || [];
    for (var i = from; i < to; i++) {
      var r = rows[i];
      if (!r) continue;
      out.push(rowHtml(r, r.cells, 2, 3, 4, 5, 6, 8));
    }
    return out.join('');
  };

  /** Shared row renderer for both previews; column indexes differ per sheet. */
  function rowHtml(r, cells, cNo, cName, cUnit, cQty, cPrice, cMarket) {
    var kind = r.kind || 'blank';
    if (kind !== 'item') {
      var label = '';
      for (var c = cNo; c <= cName + 1; c++) { if (cells[c] && cells[c].v != null) { label = String(cells[c].v); break; } }
      if (!label && cells[12] && cells[12].v != null) label = String(cells[12].v);
      return '<div class="vrow k-' + kind + '"><div class="c" style="flex:1 1 auto">' +
        S.esc(label.replace(/\n/g, ' ')) + '</div></div>';
    }
    var qty = r.qty || 0, sm = qty * r.price, mk = qty * r.market, d = sm - mk;
    var chg = !S.near(r.price, r.market);
    var no = cells[cNo] && cells[cNo].v;
    return '<div class="vrow k-item' + (chg ? ' chg' : '') + '">' +
      '<div class="c mid" style="' + w(SHEET_COLS[0]) + '">' + (no == null ? '' : S.esc(no)) + '</div>' +
      '<div class="c" style="' + w(SHEET_COLS[1]) + '" title="' + S.esc(r.nm) + '">' + S.esc(r.nm) + '</div>' +
      '<div class="c mid" style="' + w(SHEET_COLS[2]) + '">' + S.esc(r.unit) + '</div>' +
      '<div class="c num" style="' + w(SHEET_COLS[3]) + '">' + S.qty(qty) + '</div>' +
      '<div class="c num" style="' + w(SHEET_COLS[4]) + '">' + S.price(r.price) + '</div>' +
      '<div class="c num" style="' + w(SHEET_COLS[5]) + '">' + S.money(sm) + '</div>' +
      '<div class="c num" style="' + w(SHEET_COLS[6]) + '">' + S.price(r.market) + '</div>' +
      '<div class="c num" style="' + w(SHEET_COLS[7]) + '">' + S.money(mk) + '</div>' +
      '<div class="c num' + (chg ? ' diff' : '') + '" style="' + w(SHEET_COLS[8]) + '">' + S.money(d) + '</div>' +
      '</div>';
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
      cfLimit: this.opts.cfLimit, sheetName: this.opts.sheetName
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
      out.push(rowHtml(r, r.cells, 2, 4, 5, 6, 7, 9));
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
      var map = {}, n = 0;
      entries.forEach(function (e) {
        var p = S.num(e.price != null ? e.price : e.market);
        if (!e.name || p == null) return;
        map[S.resKey(e.name, e.unit || '')] = p;
        n++;
      });
      self.prices = Object.assign(self.prices, map);
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
