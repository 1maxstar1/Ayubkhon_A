/*
 * «Сравнение версий»: the smeta the sender returned, against the version we checked and the
 * comparison table we sent back. The first version is a loaded project (its market prices are
 * what we asked for) or any file; the second is a file that is read but never added to the
 * projects.
 *
 * In a workspace the files chosen here are kept with it (src/ui/sync.js hears `cmp:file` and
 * `cmp:base`, and hands them back through restore()), so a reload returns to the same comparison;
 * the view and the filter are in the address, next to the tab.
 */
(function (S) {
  'use strict';

  function Compare(app) {
    this.app = app;
    this.oldFile = null;     // { name, objects } when «Было» is a file, not a project
    this.newFile = null;     // { name, objects }
    this.reply = null;       // { base, name, entries, match } — «Наш ответ» read against the «Было» it names
    this.res = null;
    this.gen = 0;            // which workspace the files belong to; see reset()
    this.bind();
  }

  function $(id) { return document.getElementById(id); }
  /** A file was chosen (or dropped: null) by the person, not brought back — whoever keeps the workspace hears it. */
  function chose(slot, file) { document.dispatchEvent(new CustomEvent('cmp:file', { detail: { slot: slot, file: file || null } })); }
  function option(sel, v) { return !!v && Array.prototype.some.call(sel.options, function (o) { return o.value === v; }); }

  Compare.prototype.bind = function () {
    var self = this;
    if (!$('cmpOld')) return;
    $('cmpOld').addEventListener('change', function () {
      if (this.value === 'file') { $('cmpOldFile').click(); return; }
      if (self.oldFile) chose('old', null);
      if (self.reply) chose('reply', null);
      self.oldFile = null;
      self.reply = null;
      self.based();
      self.run();
    });
    $('cmpOldFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; e.target.value = '';
      if (!f) { self.fillOld(); return; }
      self.read(f, function (objs) {
        if (self.reply) chose('reply', null);
        self.oldFile = { name: f.name, objects: objs }; self.reply = null;
        chose('old', f);
        self.fillOld(); self.based(); self.run();
      }, function () { self.fillOld(); });
    });
    $('cmpNewBtn').addEventListener('click', function () { $('cmpNewFile').click(); });
    $('cmpReplyBtn').addEventListener('click', function () { $('cmpReplyFile').click(); });
    $('cmpReplyFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; e.target.value = '';
      if (f) self.loadReply(f);
    });
    $('cmpNewFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      self.read(f, function (objs) { self.newFile = { name: f.name, objects: objs }; chose('new', f); self.run(); });
    });
    // back on the view and the filter the page was reloaded with
    if (option($('cmpView'), S.hashGet('cv'))) $('cmpView').value = S.hashGet('cv');
    if (option($('cmpFilter'), S.hashGet('cf'))) $('cmpFilter').value = S.hashGet('cf');
    // another workspace, another comparison: nothing of this one is carried over
    ['ws:open', 'ws:close'].forEach(function (ev) { document.addEventListener(ev, function () { self.reset(); }); });
    $('cmpView').addEventListener('change', function () { self.only = null; self.render(); });
    $('cmpFilter').addEventListener('change', function () { self.only = null; self.render(); });
    $('cmpQ').addEventListener('input', S.debounce(function () { self.render(); }, 150));
    $('cmpExport').addEventListener('click', function () { self.exportXlsx(); });
    $('cmpSummary').addEventListener('click', function (e) {
      var c = e.target.closest && e.target.closest('[data-go]');
      if (!c) return;
      self.only = null;
      if (c.dataset.go === 'unasked') { $('cmpView').value = 'rows'; $('cmpFilter').value = 'unasked'; }
      else { $('cmpView').value = 'sheets'; $('cmpFilter').value = 'changed'; }
      self.render();
    });
    // the header is a separate table: it follows the body sideways
    $('cmpBody').addEventListener('scroll', function () { $('cmpHead').scrollLeft = this.scrollLeft; });
    $('cmpBody').addEventListener('click', function (e) {
      var tr = e.target.closest && e.target.closest('tr[data-k]');
      if (!tr) return;
      // one resource's lines; where the list was is kept for the way back
      self.back = { q: $('cmpQ').value, view: $('cmpView').value, top: $('pane-compare').scrollTop };
      $('cmpQ').value = '';
      $('cmpView').value = 'rows';
      self.only = tr.dataset.k;
      self.render();
      // straight to the lines, the back button on top (the cards stay above, a scroll away)
      var pane = $('pane-compare');
      pane.scrollTop += $('cmpHead').getBoundingClientRect().top - pane.getBoundingClientRect().top;
    });
    $('cmpHead').addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-back]')) self.goBack();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && self.only && $('pane-compare').classList.contains('on')) self.goBack();
    });
    document.querySelectorAll('.tab[data-pane="compare"]').forEach(function (t) {
      // prices may have been edited since: the table we sent is read again every time
      t.addEventListener('click', function () { self.fillOld(); self.run(); });
    });
  };

  /** From one resource's lines back to the list, where it was. */
  Compare.prototype.goBack = function () {
    var b = this.back || { q: '', view: 'res', top: 0 };
    this.only = null;
    $('cmpQ').value = b.q;
    $('cmpView').value = b.view === 'rows' ? 'rows' : 'res';
    this.render();
    $('pane-compare').scrollTop = b.top;
  };

  /** The projects changed (loaded, restored, removed): the «Было» list follows, and an open tab recomputes. */
  Compare.prototype.refresh = function () {
    this.fillOld();
    var pane = $('pane-compare');
    if (pane && pane.classList.contains('on') && this.newFile) this.run();
  };

  /** Parse a workbook off the main thread when the worker is there, the same way projects are read. */
  Compare.prototype.read = function (file, done, failed) {
    var app = this.app;
    failed = failed || function () {};
    if (!/\.xls[xm]?$/i.test(file.name)) { app.toast('Принимаются только файлы .xlsx / .xlsm', true); failed(); return; }
    app.busy(true, 'Чтение файла: ' + file.name + '…');
    var reader = new FileReader();
    reader.onerror = function () { app.busy(false); app.toast('Не удалось прочитать файл', true); failed(); };
    reader.onload = function () {
      var buf = reader.result;
      var finish = function (res) {
        app.busy(false);
        if (!res.ok) { app.toast(file.name + ': ' + res.error, true); failed(); return; }
        if (!res.objects.length) { app.toast(file.name + ': листы ресурсов не найдены', true); failed(); return; }
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

  /** Which first version is chosen, in words that outlive a reload: the project's file, or «a file of its own». */
  Compare.prototype.baseName = function () {
    var v = $('cmpOld') ? $('cmpOld').value : '';
    if (v === 'file') return this.oldFile ? 'file' : '';
    var p = this.app.projects[+String(v).slice(1)];
    return p ? p.file || p.name : '';
  };
  Compare.prototype.based = function () {
    document.dispatchEvent(new CustomEvent('cmp:base', { detail: { base: this.baseName() } }));
  };

  /** Empty again: a workspace was opened or left. Anything still being read is for the one before. */
  Compare.prototype.reset = function () {
    this.gen++;
    this.oldFile = null; this.newFile = null; this.reply = null; this.res = null; this.only = null; this.back = null;
    this.fillOld();
    this.render();
  };

  /**
   * The workspace brings back what was chosen here: files.old / files.new / files.reply (each a File,
   * or absent) and saved.base — the project that was «Было». Read one after another, in the order
   * they depend on each other; nothing is announced and no price is set: the prices came back with
   * the workspace, as they were left. A file the person has chosen meanwhile is not replaced by the
   * stored one.
   */
  Compare.prototype.restore = function (saved, files) {
    var self = this, app = this.app, gen = this.gen;
    var live = function () { return gen === self.gen; };
    var finish = function () {
      if (!live()) return;
      self.fillOld();
      self.run();
    };
    var reply = function () {
      if (!live()) return;
      self.fillOld();
      if (!self.oldFile && saved && saved.base) {
        for (var i = 0; i < app.projects.length; i++) {
          if ((app.projects[i].file || app.projects[i].name) === saved.base) { $('cmpOld').value = 'p' + i; break; }
        }
      }
      if (files.reply && !self.reply) self.loadReply(files.reply, finish); else finish();
    };
    var next = function () {
      if (!live()) return;
      if (!files.new || self.newFile) { reply(); return; }
      self.read(files.new, function (objs) {
        if (live() && !self.newFile) self.newFile = { name: files.new.name, objects: objs };
        reply();
      }, reply);
    };
    if (!files.old || this.oldFile) { next(); return; }
    this.read(files.old, function (objs) {
      if (live() && !self.oldFile) self.oldFile = { name: files.old.name, objects: objs };
      next();
    }, next);
  };

  Compare.prototype.fillOld = function () {
    var sel = $('cmpOld');
    if (!sel) return;
    var cur = this.oldFile ? 'file' : sel.value;
    // «Другой файл…» without a file chosen is no first version: the project, as soon as there is one
    // (after a reload the tab can open before the workspace has brought its projects back)
    if (cur === 'file' && !this.oldFile) cur = '';
    // (a file that was chosen stays chosen, whatever projects come and go)
    if (cur !== 'file' && (!/^p\d+$/.test(cur) || +cur.slice(1) >= this.app.projects.length)) cur = this.app.projects.length ? 'p0' : cur;
    var html = this.app.projects.map(function (p, i) {
      return '<option value="p' + i + '">Проект: ' + S.esc(p.name) + '</option>';
    }).join('');
    html += '<option value="file">' + (this.oldFile ? 'Файл: ' + S.esc(this.oldFile.name) : 'Другой файл…') + '</option>';
    sel.innerHTML = html;
    if (cur && sel.querySelector('option[value="' + cur + '"]')) sel.value = cur;
    else if (!this.app.projects.length && !this.oldFile) sel.value = 'file';
  };

  /**
   * «Наш ответ»: the table we sent, as a spreadsheet (our export, or an older PDF reply turned
   * into Excel). Its prices go onto the «Было» project — over whatever was typed or auto-applied:
   * the reply is what was actually sent — and its lines become what the comparison judges.
   */
  Compare.prototype.loadReply = function (file, back) {
    var self = this, app = this.app, gen = this.gen;
    back = back || null;      // brought back with the workspace: its prices are there already, as they were left
    var b = $('cmpOld').value;
    var objects = b === 'file' && this.oldFile ? this.oldFile.objects :
      (app.projects[+String(b).slice(1)] || {}).objects;
    var end = function () { if (back) back(); };
    if (!objects) { app.toast('Сначала выберите первую версию сметы («Было»)', true); end(); return; }
    var reader = new FileReader();
    reader.onerror = function () { app.toast('Не удалось прочитать файл', true); end(); };
    reader.onload = function () {
      if (gen !== self.gen) return;
      var parsed;
      try { parsed = S.reply.parse(S.readXlsx(new Uint8Array(reader.result))); }
      catch (e) { app.toast(file.name + ': ' + (e.message || e), true); end(); return; }
      if (!parsed.entries.length) {
        app.toast(file.name + ': не найдена таблица с колонками «Наименование» и «Рыночная цена» ' +
          '(или «Bozor ma\'lumotlariga ko\'ra»)', true);
        end();
        return;
      }
      var m = S.reply.match(parsed.entries, objects);
      self.reply = { base: b, name: file.name, entries: parsed.entries, unread: parsed.unread, match: m };
      if (back) { back(); return; }
      chose('reply', file);
      var n = Object.keys(m.prices).length;
      if (b !== 'file' && n) app.setPrices(m.prices);
      app.toast('Наш ответ: строк ' + parsed.entries.length + ', найдено в смете ' + m.found.length +
        (m.missing.length ? ', не найдено ' + m.missing.length : '') +
        (m.ambiguous.length ? ', не применено ' + m.ambiguous.length : '') +
        (parsed.unread.length ? ', цена не прочитана ' + parsed.unread.length : '') +
        (b !== 'file' ? ' · цен проекта обновлено: ' + n : ''));
      self.run();
    };
    reader.readAsArrayBuffer(file);
  };

  /** The first version and what we asked of it. */
  Compare.prototype.base = function () {
    var v = $('cmpOld').value;
    var reply = this.reply && this.reply.base === v ? this.reply : null;
    if (v === 'file' && this.oldFile) {
      return { label: this.oldFile.name, objects: this.oldFile.objects, requested: reply ? reply.match.requested : {}, known: {} };
    }
    var p = this.app.projects[+String(v).slice(1)];
    if (!p) return null;
    // the project on its own, every sheet in, priced as it is now — the table we sent; or, when our
    // reply was loaded as a file, exactly its lines
    var proj = Object.assign({}, p, { enabled: true });
    var model = S.assemble([proj], this.app.prices);
    var requested = reply ? reply.match.requested : S.compare.requested(model, this.app.reportOpts()), known = {};
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
    this.labels = { oldLabel: b.label, newLabel: this.newFile.name, asked: Object.keys(b.requested).length,
                    reply: this.reply && this.reply.base === $('cmpOld').value ? this.reply : null };
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

  /** x: a line or a resource. «Без нашего замечания» — a change on what our table did not mention. */
  function keep(x, filter) {
    var tone = ST(x.st).tone;
    if (filter === 'problems') return tone === 'bad' || tone === 'part';
    if (filter === 'changed') return x.st !== 'same';
    if (filter === 'unasked') return S.compare.unasked(x);
    return true;
  }
  function keepAmount(x, filter) {
    var tone = S.compare.AMOUNT[x.st].tone;
    if (filter === 'problems') return tone === 'bad' || tone === 'part';
    if (filter === 'changed' || filter === 'unasked') return x.st !== 'same';
    return true;
  }
  /**
   * What of «Наш ответ» did not land: lines the smeta does not have (by sheet — a sheet none of
   * whose lines is here is one line: another project), lines not applied for want of a unit,
   * prices that cannot be read, and a resource priced twice differently (the first price stays).
   */
  function replyNotes(rp) {
    var m = rp.match, unread = rp.unread || [], ambiguous = m.ambiguous || [], conflicts = m.conflicts || [];
    function line(e) {
      return (e.no ? e.no + '. ' : '') + e.name + ' · ' + e.unit + ' · ' + (e.price != null ? S.price(e.price) : '—') +
        ' → ' + S.price(e.market);
    }
    function li(t) { return '<li>' + S.esc(t) + '</li>'; }
    function details(title, items) {
      return items.length ? '<details class="cmp-miss"><summary>' + S.esc(title) + '</summary><ul>' + items.join('') + '</ul></details>' : '';
    }
    var hit = {}, order = [], by = {};
    m.found.concat(ambiguous).forEach(function (f) { hit[f.entry.sheet || ''] = true; });
    m.missing.forEach(function (e) {
      var s = e.sheet || '';
      if (!by[s]) { by[s] = []; order.push(s); }
      by[s].push(e);
    });
    var miss = [];
    order.forEach(function (s) {
      if (s && !hit[s]) miss.push(li('Лист «' + s + '»: ни одна строка не найдена в этой смете (' + by[s].length + ') — другой проект?'));
      else by[s].forEach(function (e) { miss.push(li(line(e) + (order.length > 1 && s ? ' · лист «' + s + '»' : ''))); });
    });
    return details('Не найдено в смете: ' + m.missing.length + ' строк ответа', miss) +
      details('Не применено: ' + ambiguous.length + ' (нет ед. изм., а ресурс в смете в нескольких единицах)',
        ambiguous.map(function (a) { return li(line(a.entry) + ' · в смете: ' + a.units.join(' / ')); })) +
      details('Цена не прочитана: ' + unread.length, unread.map(function (u) {
        return li((u.no ? u.no + '. ' : '') + u.name + ' · «' + u.text + '»' + (u.sheet ? ' · лист «' + u.sheet + '»' : ''));
      })) +
      details('Разные цены для одного ресурса: ' + conflicts.length + ' (оставлена первая)', conflicts.map(function (c) {
        return li(line(c.entry) + ' · оставлена ' + S.price(c.kept));
      }));
  }

  function nameCell(x) {
    if (!x.nm2) return S.esc(x.nm);
    return '<s class="mute">' + S.esc(x.nm) + '</s><br>' + S.esc(x.nm2);
  }
  function unitCell(x) {
    return x.unit2 && x.unit2 !== x.unit ? '<s class="mute">' + S.esc(x.unit) + '</s> ' + S.esc(x.unit2) : S.esc(x.unit);
  }

  Compare.prototype.render = function () {
    var sum = $('cmpSummary'), head = $('cmpHead'), body = $('cmpBody'), cnt = $('cmpCount');
    if (!sum) return;
    if (!this.only) {          // one resource's lines are a detour, not where the list stood
      S.hashSet('cv', $('cmpView').value === 'res' ? '' : $('cmpView').value);
      S.hashSet('cf', $('cmpFilter').value === 'changed' ? '' : $('cmpFilter').value);
    }
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
      card(T.unaskedUp > 0.5 ? 'bad' : '', 'Без нашего замечания', lines(T.unaskedRows) + ' · ' + delta(T.unaskedUp - T.unaskedDown),
        'снижено на ' + money(T.unaskedDown) + ' · повышено на ' + money(T.unaskedUp) + '<br>цена ↓ ' + (T.counts.lowered || 0) +
        ' · ↑ ' + (T.counts.raised || 0) + ' · объём ↑ ' + (T.counts.qtyup || 0) + ' ↓ ' + (T.counts.qtydown || 0) +
        ' · переименовано ' + (T.counts.renamed || 0) + ' · новых ' + (T.counts.added || 0) + ' · удалено ' + (T.counts.removed || 0) +
        ' · перенесено ' + (T.counts.moved || 0),
        'unasked') +
      card(T.amountFlags ? 'bad' : 'good', 'Итоги листов (ИТОГО, ЗСР, транспорт)',
        T.amountFlags ? lines(T.amountFlags) + ' требуют внимания' : 'расхождений нет',
        'изменилась сумма: ' + lines(T.amountRows) + ' · текст/процент и «итог ≠ сумма строк» — красным, ' +
        'итог не пересчитан — жёлтым', 'sheets') +
      '</div>' +
      '<div class="cmp-files">Было: <b>' + S.esc(L.oldLabel) + '</b> · Стало: <b>' + S.esc(L.newLabel) + '</b> · ' +
      (L.reply ? 'замечания из файла «' + S.esc(L.reply.name) + '»: ' + L.asked + ' (строк в файле ' + L.reply.entries.length + ')' :
        'замечаний в нашей таблице: ' + L.asked) + ' · ' + lines(T.rows) + ' · ' + this.ms + ' мс</div>' +
      (L.reply ? replyNotes(L.reply) : '');

    var view = $('cmpView').value, filter = $('cmpFilter').value;
    var q = S.nameKey($('cmpQ').value || '');
    var only = this.only;
    var html = [], n = 0;
    if (view === 'sheets' && !only) {
      head.innerHTML = '<table class="cmp"><colgroup>' + COLS_AMT + '</colgroup><tr><th>Лист</th><th>Строка</th>' +
        '<th>Сумма было</th><th>Сумма стало</th><th>Разница</th><th>Статус</th></tr></table>';
      this.res.objects.forEach(function (o) {
        var rows = o.amounts.filter(function (x) {
          return keepAmount(x, filter) && (!q || S.nameKey(x.label1 + ' ' + x.label2).indexOf(q) >= 0);
        });
        if (!rows.length && filter !== 'all') return;
        html.push('<tr class="t-head"><td>' + S.esc(S.compare.sheetLabel(o)) + '</td><td><b>Строки ресурсов (сумма)</b></td>' +
          '<td class="n">' + money(o.oldSum) + '</td><td class="n">' + money(o.newSum) + '</td>' +
          '<td class="n">' + delta(o.newSum - o.oldSum) + '</td><td></td></tr>');
        rows.forEach(function (x) {
          n++;
          var A = S.compare.AMOUNT[x.st];
          var lbl = x.label2 && x.label1 && x.label2 !== x.label1 ? '<s class="mute">' + S.esc(x.label1) + '</s><br>' + S.esc(x.label2) :
            S.esc(x.label1 || x.label2);
          html.push('<tr class="t-' + (A.tone || 'none') + '"><td></td><td>' + lbl + '</td>' +
            '<td class="n">' + money(x.s1) + '</td><td class="n">' + money(x.s2) + '</td>' +
            '<td class="n">' + (x.s1 != null && x.s2 != null ? delta(x.s2 - x.s1) : '') + '</td>' +
            '<td>' + S.esc(A.label) + (x.st === 'gap' ? ': ' + money(x.gap) : '') + '</td></tr>');
        });
      });
      body.innerHTML = '<table class="cmp"><colgroup>' + COLS_AMT + '</colgroup>' + html.join('') + '</table>';
      cnt.textContent = lines(n);
    } else if (view === 'res' && !only) {
      head.innerHTML = '<table class="cmp"><colgroup>' + COLS_RES + '</colgroup><tr><th>Наименование</th><th>Ед.</th>' +
        '<th>Цена было</th><th>Наша цена</th><th>Цена стало</th><th>Строк</th><th>Сумма было</th><th>Сумма стало</th>' +
        '<th>Разница</th><th>Статус</th></tr></table>';
      this.res.resources.forEach(function (g) {
        if (!keep(g, filter)) return;
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
      var g = only ? this.res.resources.filter(function (r) { return r.key === only; })[0] : null;
      head.innerHTML = (g ? '<div class="cmp-back"><button class="btn sm" data-back>‹ Назад к ресурсам</button>' +
          '<span>Строки ресурса: <b>' + S.esc(g.nm) + '</b> · ' + S.esc(g.unit) + ' · ' + S.esc(S.compare.statusText(g)) +
          '</span><span class="count">Esc — назад</span></div>' : '') +
        '<table class="cmp"><colgroup>' + COLS_ROW + '</colgroup><tr><th>Лист</th><th>№</th><th>Наименование</th>' +
        '<th>Ед.</th><th>Кол-во было → стало</th><th>Цена было</th><th>Наша цена</th><th>Цена стало</th>' +
        '<th>Сумма было</th><th>Сумма стало</th><th>Разница</th><th>Статус</th></tr></table>';
      this.res.objects.forEach(function (o) {
        o.rows.forEach(function (x) {
          if (only ? x.key !== only : !keep(x, filter)) return;
          if (q && S.nameKey(x.nm + ' ' + (x.nm2 || '')).indexOf(q) < 0) return;
          n++;
          var qty = x.q1 == null ? S.qty(x.q2) : x.q2 == null ? S.qty(x.q1) :
            (Math.abs(x.q1 - x.q2) > 1e-9 ? S.qty(x.q1) + ' → <b>' + S.qty(x.q2) + '</b>' : S.qty(x.q1));
          html.push('<tr class="t-' + (ST(x.st).tone || 'none') + '"><td>' + S.esc(x.from ? x.from + ' → ' + o.name : o.name) +
            '</td><td>' + S.esc(x.no) + '</td>' +
            '<td>' + nameCell(x) + '</td><td>' + unitCell(x) + '</td><td class="n">' + qty + '</td>' +
            '<td class="n">' + pr(x.p1) + '</td><td class="n">' + ours(x) + '</td>' +
            '<td class="n">' + pr(x.p2) + '</td><td class="n">' + money(x.s1) + '</td><td class="n">' + money(x.s2) + '</td>' +
            '<td class="n">' + delta(x.s2 - x.s1) + '</td><td>' + S.esc(S.compare.rowLabel(x)) + '</td></tr>');
        });
      });
      body.innerHTML = '<table class="cmp"><colgroup>' + COLS_ROW + '</colgroup>' + html.join('') + '</table>';
      cnt.textContent = lines(n) + (only ? ' одного ресурса' : '');
    }
    if (!n && view !== 'sheets') body.innerHTML = '<div class="cmp-empty">Нет строк для этого фильтра.</div>';
  };

  var COLS_RES = '<col style="min-width:260px"><col style="width:50px"><col style="width:92px"><col style="width:92px">' +
    '<col style="width:130px"><col style="width:48px"><col style="width:112px"><col style="width:112px"><col style="width:104px">' +
    '<col style="width:200px">';
  var COLS_ROW = '<col style="width:118px"><col style="width:40px"><col><col style="width:50px"><col style="width:104px">' +
    '<col style="width:86px"><col style="width:86px"><col style="width:86px"><col style="width:104px"><col style="width:104px">' +
    '<col style="width:96px"><col style="width:136px">';

  var COLS_AMT = '<col style="width:220px"><col><col style="width:130px"><col style="width:130px"><col style="width:120px">' +
    '<col style="width:260px">';

  /** go: 'unasked' opens the lines nobody asked about, 'sheets' the sheet totals. */
  function card(tone, title, big, small, go) {
    return '<div class="cmp-card ' + tone + (go ? ' go" data-go="' + go + '" title="Показать' : '') + '"><div class="t">' + title +
      '</div><div class="b">' + big + '</div><div class="s">' + small + '</div></div>';
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
