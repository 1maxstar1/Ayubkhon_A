/*
 * «Сравнение версий»: the smeta the sender returned, against the version we checked and the
 * comparison table we sent back. The first version is a loaded project (its market prices are
 * what we asked for) or any file; the second is a file that is read but never added to the
 * projects.
 */
(function (S) {
  'use strict';

  function Compare(app) {
    this.app = app;
    this.oldFile = null;     // { name, objects } when «Было» is a file, not a project
    this.newFile = null;     // { name, objects }
    this.res = null;
    this.bind();
  }

  function $(id) { return document.getElementById(id); }

  Compare.prototype.bind = function () {
    var self = this;
    if (!$('cmpOld')) return;
    $('cmpOld').addEventListener('change', function () {
      if (this.value === 'file') { $('cmpOldFile').click(); return; }
      self.oldFile = null;
      self.run();
    });
    $('cmpOldFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; e.target.value = '';
      if (!f) { self.fillOld(); return; }
      self.read(f, function (objs) { self.oldFile = { name: f.name, objects: objs }; self.fillOld(); self.run(); });
    });
    $('cmpNewBtn').addEventListener('click', function () { $('cmpNewFile').click(); });
    $('cmpNewFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      self.read(f, function (objs) { self.newFile = { name: f.name, objects: objs }; self.run(); });
    });
    $('cmpView').addEventListener('change', function () { self.only = null; self.render(); });
    $('cmpFilter').addEventListener('change', function () { self.only = null; self.render(); });
    $('cmpQ').addEventListener('input', S.debounce(function () { self.render(); }, 150));
    $('cmpExport').addEventListener('click', function () { self.exportXlsx(); });
    // the header is a separate table: it follows the body sideways
    $('cmpBody').addEventListener('scroll', function () { $('cmpHead').scrollLeft = this.scrollLeft; });
    $('cmpBody').addEventListener('click', function (e) {
      var tr = e.target.closest && e.target.closest('tr[data-k]');
      if (!tr) return;
      $('cmpQ').value = '';
      $('cmpView').value = 'rows';
      self.only = tr.dataset.k;
      self.render();
    });
    document.querySelectorAll('.tab[data-pane="compare"]').forEach(function (t) {
      // prices may have been edited since: the table we sent is read again every time
      t.addEventListener('click', function () { self.fillOld(); self.run(); });
    });
  };

  /** Parse a workbook off the main thread when the worker is there, the same way projects are read. */
  Compare.prototype.read = function (file, done) {
    var app = this.app;
    if (!/\.xls[xm]?$/i.test(file.name)) { app.toast('Принимаются только файлы .xlsx', true); return; }
    app.busy(true, 'Чтение файла: ' + file.name + '…');
    var reader = new FileReader();
    reader.onerror = function () { app.busy(false); app.toast('Не удалось прочитать файл', true); };
    reader.onload = function () {
      var buf = reader.result;
      var finish = function (res) {
        app.busy(false);
        if (!res.ok) { app.toast(file.name + ': ' + res.error, true); return; }
        if (!res.objects.length) { app.toast(file.name + ': листы ресурсов не найдены', true); return; }
        done(res.objects);
      };
      if (app.worker) {
        var id = ++app.seq;
        var onMsg = function (e) {
          if (e.data.id !== id) return;
          app.worker.removeEventListener('message', onMsg);
          finish(e.data);
        };
        app.worker.addEventListener('message', onMsg);
        app.worker.postMessage({ cmd: 'parse', id: id, name: file.name, buffer: buf }, [buf]);
      } else {
        try { finish({ ok: true, objects: S.smeta.parseWorkbook(S.readXlsx(new Uint8Array(buf)), file.name) }); }
        catch (err) { finish({ ok: false, error: String(err.message || err) }); }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  Compare.prototype.fillOld = function () {
    var sel = $('cmpOld');
    if (!sel) return;
    var cur = this.oldFile ? 'file' : sel.value;
    var html = this.app.projects.map(function (p, i) {
      return '<option value="p' + i + '">Проект: ' + S.esc(p.name) + '</option>';
    }).join('');
    html += '<option value="file">' + (this.oldFile ? 'Файл: ' + S.esc(this.oldFile.name) : 'Другой файл…') + '</option>';
    sel.innerHTML = html;
    if (cur && sel.querySelector('option[value="' + cur + '"]')) sel.value = cur;
    else if (!this.app.projects.length && !this.oldFile) sel.value = 'file';
  };

  /** The first version and what we asked of it. */
  Compare.prototype.base = function () {
    var v = $('cmpOld').value;
    if (v === 'file' && this.oldFile) return { label: this.oldFile.name, objects: this.oldFile.objects, requested: {}, known: {} };
    var p = this.app.projects[+String(v).slice(1)];
    if (!p) return null;
    // the project on its own, every sheet in, priced as it is now — the table we sent
    var proj = Object.assign({}, p, { enabled: true });
    var model = S.assemble([proj], this.app.prices);
    var requested = S.compare.requested(model, this.app.reportOpts()), known = {};
    model.resources.forEach(function (r) {
      if (!requested[r.key] && Math.abs((r.market || 0) - (r.price || 0)) >= 1) known[r.key] = r.market;
    });
    return { label: p.file || p.name, objects: p.objects, requested: requested, known: known };
  };

  Compare.prototype.run = function () {
    this.only = null;
    var b = this.base();
    if (!b || !this.newFile) { this.res = null; this.render(); return; }
    var t0 = performance.now();
    this.res = S.compare.versions(b.objects, this.newFile.objects, b.requested, b.known);
    this.labels = { oldLabel: b.label, newLabel: this.newFile.name, asked: Object.keys(b.requested).length };
    this.ms = Math.round(performance.now() - t0);
    this.render();
  };

  /* -------------------------------------------------------------- render */

  var ST = function (k) { return S.compare.STATUS[k]; };

  /** 1 ресурс, 2 ресурса, 5 ресурсов. */
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    var w = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
    return n + ' ' + w;
  }
  function res(n) { return plural(n, 'ресурс', 'ресурса', 'ресурсов'); }
  function lines(n) { return plural(n, 'строка', 'строки', 'строк'); }

  function money(v) { return v == null ? '' : S.money(v); }
  function pr(v) { return v == null ? '' : S.price(v); }
  function delta(v) {
    if (!v || Math.abs(v) < 0.5) return '<span class="mute">0</span>';
    return '<span class="' + (v < 0 ? 'down' : 'up') + '">' + (v > 0 ? '+' : '−') + S.money(Math.abs(v)) + '</span>';
  }

  /** Our price: asked in the table; set but below the table's threshold (grey); or only the note. */
  function ours(x) {
    if (x.market != null) return pr(x.market);
    if (x.note) return '<i>примечание</i>';
    if (x.ours != null) return '<span class="mute" title="Цена задана, но в таблицу не попала (ниже порога)">' + pr(x.ours) + '</span>';
    return '';
  }

  function keep(st, filter) {
    var tone = ST(st).tone;
    if (filter === 'problems') return tone === 'bad' || tone === 'part';
    if (filter === 'changed') return st !== 'same';
    return true;
  }

  Compare.prototype.render = function () {
    var sum = $('cmpSummary'), head = $('cmpHead'), body = $('cmpBody'), cnt = $('cmpCount');
    if (!sum) return;
    $('cmpNewName').textContent = this.newFile ? this.newFile.name : 'не выбран';
    $('cmpExport').disabled = !this.res;
    if (!this.res) {
      head.innerHTML = '';
      body.innerHTML = '';
      cnt.textContent = '';
      sum.innerHTML = '<div class="cmp-empty">' +
        (this.app.projects.length || this.oldFile ? '' : 'Сначала добавьте первую версию сметы как проект (с вашими рыночными ценами) или выберите её файлом.<br>') +
        'Выберите исправленную смету, которую прислал отправитель: «Загрузить исправленную смету».<br>' +
        'Строки будут сопоставлены по листам и наименованиям; цвет показывает, что сделано с каждым замечанием: ' +
        '<span class="cmp-chip good">исправлено</span> <span class="cmp-chip part">частично</span> ' +
        '<span class="cmp-chip bad">не исправлено / повышено</span></div>';
      return;
    }
    var T = this.res.totals, L = this.labels;
    var rc = T.resCounts;
    var left = (rc.partial || 0) + (rc.notfixed || 0) + (rc.worse || 0);
    var pct = T.askedSaving > 0 ? Math.round(T.gotSaving / T.askedSaving * 100) : null;
    sum.innerHTML =
      '<div class="cmp-cards">' +
      card('', 'Сумма по смете', money(T.oldSum) + ' → ' + money(T.newSum), delta(T.newSum - T.oldSum)) +
      card('good', 'Снижение по нашим замечаниям', money(T.gotSaving) + ' из ' + money(T.askedSaving),
        pct == null ? 'замечаний с ценой нет' : pct + ' % запрошенного') +
      card('good', 'Исправлено полностью', res(rc.fixed || 0), lines(T.counts.fixed || 0)) +
      card(left ? 'bad' : 'good', 'Осталось исправить', res(left),
        'частично ' + (rc.partial || 0) + ' · не исправлено ' + (rc.notfixed || 0) + ' · повышено ' + (rc.worse || 0) +
        ' · строк со старой ценой ' + T.leftRows) +
      card('', 'Без нашего замечания', 'снижено ' + (rc.lowered || 0) + ' · повышено ' + (rc.raised || 0),
        'объём ↑ ' + (T.counts.qtyup || 0) + ' · новых строк ' + (T.counts.added || 0) + ' · удалено ' + (T.counts.removed || 0)) +
      '</div>' +
      '<div class="cmp-files">Было: <b>' + S.esc(L.oldLabel) + '</b> · Стало: <b>' + S.esc(L.newLabel) + '</b> · ' +
      'замечаний в нашей таблице: ' + L.asked + ' · ' + lines(T.rows) + ' · ' + this.ms + ' мс</div>';

    var view = $('cmpView').value, filter = $('cmpFilter').value;
    var q = S.nameKey($('cmpQ').value || '');
    var only = this.only;
    var html = [], n = 0;
    if (view === 'res' && !only) {
      head.innerHTML = '<table class="cmp"><colgroup>' + COLS_RES + '</colgroup><tr><th>Наименование</th><th>Ед.</th>' +
        '<th>Цена было</th><th>Наша цена</th><th>Цена стало</th><th>Строк</th><th>Сумма было</th><th>Сумма стало</th>' +
        '<th>Разница</th><th>Статус</th></tr></table>';
      this.res.resources.forEach(function (g) {
        if (!keep(g.st, filter)) return;
        if (q && S.nameKey(g.nm).indexOf(q) < 0) return;
        n++;
        html.push('<tr class="t-' + (ST(g.st).tone || 'none') + '" data-k="' + S.esc(g.key) + '" title="Показать строки">' +
          '<td>' + S.esc(g.nm) + '</td><td>' + S.esc(g.unit) + '</td><td class="n">' + pr(g.p1) + '</td>' +
          '<td class="n">' + ours(g) + '</td>' +
          '<td class="n">' + g.p2.map(pr).join(' / ') + '</td><td class="n">' + g.rows + '</td>' +
          '<td class="n">' + money(g.s1) + '</td><td class="n">' + money(g.s2) + '</td><td class="n">' + delta(g.s2 - g.s1) + '</td>' +
          '<td>' + S.esc(S.compare.statusText(g)) + '</td></tr>');
      });
      body.innerHTML = '<table class="cmp"><colgroup>' + COLS_RES + '</colgroup>' + html.join('') + '</table>';
      cnt.textContent = res(n);
    } else {
      head.innerHTML = '<table class="cmp"><colgroup>' + COLS_ROW + '</colgroup><tr><th>Лист</th><th>№</th><th>Наименование</th>' +
        '<th>Ед.</th><th>Кол-во было → стало</th><th>Цена было</th><th>Наша цена</th><th>Цена стало</th>' +
        '<th>Сумма было</th><th>Сумма стало</th><th>Разница</th><th>Статус</th></tr></table>';
      this.res.objects.forEach(function (o) {
        o.rows.forEach(function (x) {
          if (only ? x.key !== only : !keep(x.st, filter)) return;
          if (q && S.nameKey(x.nm).indexOf(q) < 0) return;
          n++;
          var qty = x.q1 == null ? S.qty(x.q2) : x.q2 == null ? S.qty(x.q1) :
            (Math.abs(x.q1 - x.q2) > 1e-9 ? S.qty(x.q1) + ' → <b>' + S.qty(x.q2) + '</b>' : S.qty(x.q1));
          html.push('<tr class="t-' + (ST(x.st).tone || 'none') + '"><td>' + S.esc(o.name) + '</td><td>' + S.esc(x.no) + '</td>' +
            '<td>' + S.esc(x.nm) + '</td><td>' + S.esc(x.unit) + '</td><td class="n">' + qty + '</td>' +
            '<td class="n">' + pr(x.p1) + '</td><td class="n">' + ours(x) + '</td>' +
            '<td class="n">' + pr(x.p2) + '</td><td class="n">' + money(x.s1) + '</td><td class="n">' + money(x.s2) + '</td>' +
            '<td class="n">' + delta(x.s2 - x.s1) + '</td><td>' + S.esc(ST(x.st).label) + '</td></tr>');
        });
      });
      body.innerHTML = '<table class="cmp"><colgroup>' + COLS_ROW + '</colgroup>' + html.join('') + '</table>';
      cnt.textContent = lines(n) + (only ? ' одного ресурса · выберите вид, чтобы вернуться' : '');
    }
    if (!n) body.innerHTML = '<div class="cmp-empty">Нет строк для этого фильтра.</div>';
  };

  var COLS_RES = '<col style="min-width:260px"><col style="width:50px"><col style="width:92px"><col style="width:92px">' +
    '<col style="width:130px"><col style="width:48px"><col style="width:112px"><col style="width:112px"><col style="width:104px">' +
    '<col style="width:200px">';
  var COLS_ROW = '<col style="width:118px"><col style="width:40px"><col><col style="width:50px"><col style="width:104px">' +
    '<col style="width:86px"><col style="width:86px"><col style="width:86px"><col style="width:104px"><col style="width:104px">' +
    '<col style="width:96px"><col style="width:136px">';

  function card(tone, title, big, small) {
    return '<div class="cmp-card ' + tone + '"><div class="t">' + title + '</div><div class="b">' + big + '</div>' +
      '<div class="s">' + small + '</div></div>';
  }

  Compare.prototype.exportXlsx = function () {
    if (!this.res) return;
    var self = this;
    this.app.busy(true, 'Подготовка файла Excel…');
    setTimeout(function () {
      try {
        var bytes = S.compare.workbook(self.res, self.labels);
        var base = (self.newFile.name || 'smeta').replace(/\.[^.]+$/, '').replace(/[^\wЀ-ӿ\- ]+/g, '');
        S.download(bytes, base + '_sravnenie.xlsx');
        self.app.toast('Файл сравнения готов');
      } catch (e) {
        self.app.toast('Ошибка экспорта: ' + (e.message || e), true);
      } finally {
        self.app.busy(false);
      }
    }, 30);
  };

  S.Compare = Compare;
})(S);
