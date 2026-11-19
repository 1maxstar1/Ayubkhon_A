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
    this.newFile = null;     // { name, objects, parts: [{ label, objects }] } — one corrected file, or several (one per estimate)
    this.reply = null;       // { base, name, entries, match } — «Наш ответ» read against the «Было» it names
    this.res = null;
    this.gen = 0;            // which workspace the files belong to; see reset()
    this.bind();
  }

  function $(id) { return document.getElementById(id); }
  /** A file was chosen (or dropped: null) by the person, not brought back — whoever keeps the workspace hears it. */
  function chose(slot, file) { document.dispatchEvent(new CustomEvent('cmp:file', { detail: { slot: slot, file: file || null } })); }
  function option(sel, v) { return !!v && Array.prototype.some.call(sel.options, function (o) { return o.value === v; }); }

  /** «Наш ответ (Excel/PDF)»: the file chooser — the page without a server has nothing else to offer. */
  Compare.prototype.pickReply = function () { $('cmpReplyFile').click(); };

  /** The workspace slot of the i-th corrected file: «new», «new1», «new2» … (the version before knew only «new»). */
  var NEW_MAX = 40;                  // an application of fifteen estimates comes back as fifteen files
  function newSlot(i) { return i ? 'new' + i : 'new'; }
  S.Compare_newSlots = function () { var a = []; for (var i = 0; i < NEW_MAX; i++) a.push(newSlot(i)); return a; };

  /** The corrected files as one «Стало»: an application of several estimates comes back as several files. */
  /**
   * The volumes of the works (the statement of form 5) of each estimate against its corrected file: did they change?
   * The resources' quantities say it line by line; this says it of the works a reviewer asked to justify. Null when no
   * pair has works on both sides (an estimate without that statement).
   */
  function workDiff(sets, parts, to) {
    if (!S.volumes || !S.volumes.changes) return null;
    var has = function (st) { return (st || []).some(function (s) { return s.works && s.works.length; }); };
    var out = { works: 0, same: 0, up: [], down: [], gone: [], added: [], pairs: 0, noNew: 0 };
    parts.forEach(function (p, i) {
      var o = to[i] >= 0 && to.length > 1 ? sets[to[i]] : sets.length === 1 ? sets[0] : null;
      if (!o || !has(o.works)) return;
      if (!has(p.works)) { out.noNew++; return; }
      var c = S.volumes.changes(o.works, p.works), where = sets.length > 1 ? o.label : '';
      var tag = function (x) { return Object.assign({ where: where }, x); };
      out.pairs++; out.works += c.works; out.same += c.same;
      out.up = out.up.concat(c.up.map(tag)); out.down = out.down.concat(c.down.map(tag));
      out.gone = out.gone.concat(c.gone.map(function (w) { return { where: where, work: w }; }));
      out.added = out.added.concat(c.added.map(function (w) { return { where: where, work: w }; }));
    });
    return out.pairs || out.noNew ? out : null;
  }

  function joinNew(parts) {
    return { name: parts.map(function (p) { return p.label; }).join(' + '),
             objects: parts.reduce(function (all, p) { return all.concat(p.objects); }, []), parts: parts };
  }

  /**
   * The returned estimate(s), from files (F4: also handed over by «Сравнить версию» of the list of applications).
   * Several files at once are the corrected estimates of one application: each is compared with its own estimate
   * (see base and S.compare.join). A file that cannot be read is said and left out; the rest are compared.
   */
  Compare.prototype.takeNew = function (files, back) {
    var self = this, gen = this.gen, keep = !back;
    files = [].concat(files).filter(Boolean).slice(0, NEW_MAX);
    if (!files.length) { if (back) back(); return; }
    var parts = [], k = 0;
    var step = function () {
      if (gen !== undefined && gen !== self.gen) return;
      if (k < files.length) {
        var f = files[k++];
        self.read(f, function (objs, works) { parts.push({ label: f.name, objects: objs, works: works || [], file: f }); step(); }, step);
        return;
      }
      if (!parts.length) { if (back) back(); return; }
      var had = self.newFile && self.newFile.parts ? self.newFile.parts.length : self.newFile ? 1 : 0;
      self.newFile = joinNew(parts);
      if (keep) {
        parts.forEach(function (p, i) { chose(newSlot(i), p.file); });
        for (var j = parts.length; j < had; j++) chose(newSlot(j), null);
      }
      if (back) back(); else self.run();
    };
    step();
  };

  /**
   * Files dropped on this tab: «Наш ответ» when dropped on its button or a PDF, the corrected estimate(s) otherwise —
   * as the two buttons take them. Never one more estimate of the application (app.js, the page's drop).
   */
  Compare.prototype.dropped = function (files, target) {
    var onReply = target && target.closest && target.closest('#cmpReplyBtn');
    var isPdf = function (f) { return /\.pdf$/i.test(f.name || ''); };
    var reply = onReply ? files[0] : files.filter(isPdf)[0];
    var rest = files.filter(function (f) { return f !== reply && !isPdf(f); });
    if (reply) this.loadReply(reply);
    if (rest.length) this.takeNew(rest);
    if (!reply && !rest.length) this.app.toast('Перетащите исправленную смету (.xlsx, .xls) или наш ответ (Excel/PDF)', true);
  };

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
      self.read(f, function (objs, works) {
        if (self.reply) chose('reply', null);
        self.oldFile = { name: f.name, objects: objs, works: works || [] }; self.reply = null;
        chose('old', f);
        self.fillOld(); self.based(); self.run();
      }, function () { self.fillOld(); });
    });
    $('cmpNewBtn').addEventListener('click', function () { $('cmpNewFile').click(); });
    // looked up at the click: the server page offers the exports it keeps before the disk (F3, sync.js)
    $('cmpReplyBtn').addEventListener('click', function (e) { self.pickReply(e.currentTarget); });
    $('cmpReplyFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; e.target.value = '';
      if (f) self.loadReply(f);
    });
    $('cmpNewFile').addEventListener('change', function (e) {
      var fs = Array.prototype.slice.call(e.target.files || []); e.target.value = '';
      if (fs.length) self.takeNew(fs);
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
    if (!/\.xls[xm]?$/i.test(file.name)) { app.toast('Принимаются только файлы Excel: .xlsx, .xlsm, .xls', true); failed(); return; }
    app.busy(true, 'Чтение файла: ' + file.name + '…');
    var reader = new FileReader();
    reader.onerror = function () { app.busy(false); app.toast('Не удалось прочитать файл', true); failed(); };
    reader.onload = function () {
      var buf = reader.result;
      var finish = function (res) {
        app.busy(false);
        if (!res.ok) { app.toast(file.name + ': ' + res.error, true); failed(); return; }
        if (!res.objects.length) { app.toast(file.name + ': листы ресурсов не найдены', true); failed(); return; }
        // the works of form 5 beside the resources: «Сравнение версий» says whether their volumes changed
        done(res.objects, res.works || []);
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
        try {
          var wb = S.readXlsx(new Uint8Array(buf)), works = [];
          try { works = S.volumes ? S.volumes.parseWorkbook(wb) : []; } catch (e) { works = []; }
          finish({ ok: true, objects: S.smeta.parseWorkbook(wb, file.name), works: works });
        }
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
      var news = S.Compare_newSlots().map(function (k) { return files[k]; }).filter(Boolean);
      if (!news.length || self.newFile) { reply(); return; }
      self.takeNew(news, reply);
    };
    if (!files.old || this.oldFile) { next(); return; }
    this.read(files.old, function (objs, works) {
      if (live() && !self.oldFile) self.oldFile = { name: files.old.name, objects: objs, works: works || [] };
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
   * «Наш ответ»: the table we sent — our export as a spreadsheet, or the same table printed to PDF
   * (S.readPdf reads it into the shape of a book). Its prices go onto the «Было» project — over
   * whatever was typed or auto-applied: the reply is what was actually sent — and its lines become
   * what the comparison judges.
   */
  Compare.prototype.loadReply = function (file, back) {
    var self = this, app = this.app, gen = this.gen;
    back = back || null;      // brought back with the workspace: its prices are there already, as they were left
    var b = $('cmpOld').value;
    // our reply is one table for the whole application: an application of several estimates (a road, its lighting, its
    // irrigation …) has its lines spread over all of them, so they are looked for in every estimate of it, «Было» or
    // not — a market price is one per name and unit across the application anyway. An outside first version is the
    // reply's only estimate.
    var proj = app.projects[+String(b).slice(1)];
    // (a project switched off — a summary file that copies the others — is not looked in: its lines are theirs)
    var objects = b === 'file' && this.oldFile ? this.oldFile.objects :
      (proj ? app.projects.reduce(function (all, p) { return p.enabled === false && p !== proj ? all : all.concat(p.objects || []); }, []) : null);
    var end = function () { if (back) back(); };
    if (!objects) { app.toast('Сначала выберите первую версию сметы («Было»)', true); end(); return; }
    var reader = new FileReader();
    reader.onerror = function () { app.toast('Не удалось прочитать файл', true); end(); };
    reader.onload = function () {
      if (gen !== self.gen) return;
      var parsed, wb;
      try { wb = S.readTable(new Uint8Array(reader.result)); parsed = S.reply.parse(wb); }
      catch (e) { app.toast(file.name + ': ' + (e.message || e), true); end(); return; }
      // the «объем» sheet beside the prices: the volumes go onto the works of the projects in (src/ui/volumes.js) —
      // not when the first version is an outside file: the reply is then about that file
      var vol = b !== 'file' && S.Volumes ? S.Volumes.readReply(wb, proj && proj.name) : null;
      if (!parsed.entries.length && vol && vol.rows) {
        if (!back) { S.Volumes.applyReply(vol); app.toast('Наш ответ: ' + S.Volumes.replyText(vol), !vol.found); }
        end();
        return;
      }
      if (!parsed.entries.length) {
        app.toast(file.name + ': не найдена таблица с колонками «Наименование» и «Рыночная цена» ' +
          '(или «Bozor ma\'lumotlariga ko\'ra»)', true);
        end();
        return;
      }
      var m = S.reply.match(parsed.entries, objects);
      self.reply = { base: b, name: file.name, entries: parsed.entries, unread: parsed.unread, match: m, vol: vol };
      var n = Object.keys(m.prices).length;
      self.reply.applied = b !== 'file' ? n : 0;
      if (back) { back(); return; }
      chose('reply', file);
      if (b !== 'file' && n) app.setPrices(m.prices);
      if (vol) S.Volumes.applyReply(vol);
      app.toast('Наш ответ: строк ' + parsed.entries.length + ', найдено в смете ' + m.found.length +
        (m.missing.length ? ', не найдено ' + m.missing.length : '') +
        (m.ambiguous.length ? ', не применено ' + m.ambiguous.length : '') +
        (parsed.unread.length ? ', цена не прочитана ' + parsed.unread.length : '') +
        (b !== 'file' ? ' · цен проекта обновлено: ' + n : '') + (vol ? ' · ' + S.Volumes.replyText(vol) : ''));
      self.run();
    };
    reader.readAsArrayBuffer(file);
  };

  /** The first version and what we asked of it. */
  Compare.prototype.base = function () {
    var v = $('cmpOld').value;
    var reply = this.reply && this.reply.base === v ? this.reply : null;
    if (v === 'file' && this.oldFile) {
      return { label: this.oldFile.name, objects: this.oldFile.objects, requested: reply ? reply.match.requested : {}, known: {},
               sets: [{ label: this.oldFile.name, objects: this.oldFile.objects, works: this.oldFile.works || [] }] };
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
    return { label: p.file || p.name, objects: p.objects, requested: requested, known: known,
             sets: [{ label: p.file || p.name, objects: p.objects, works: p.works || [] }] };
  };

  /**
   * Several corrected files are the estimates of one application: the first version is then every estimate of it
   * (each its own set, paired with its corrected file by S.compare.join), priced as the table we sent — one market
   * price per name and unit over the application. One corrected file keeps the first version chosen.
   */
  Compare.prototype.wholeBase = function (b) {
    var app = this.app, v = $('cmpOld').value;
    // the estimates that are on: a summary file switched off (it copies the others) would stand without a pair
    var on = app.projects.filter(function (p) { return p.enabled !== false; });
    if (!b || v === 'file' || on.length < 2) return b;
    var reply = this.reply && this.reply.base === v ? this.reply : null;
    var projs = on.map(function (p) { return Object.assign({}, p, { enabled: true }); });
    var model = S.assemble(projs, app.prices);
    var requested = reply ? reply.match.requested : S.compare.requested(model, app.reportOpts()), known = {};
    model.resources.forEach(function (r) {
      if (!requested[r.key] && Math.abs((r.market || 0) - (r.price || 0)) >= 1) known[r.key] = r.market;
    });
    var sets = on.map(function (p) { return { label: p.file || p.name, objects: p.objects || [], works: p.works || [] }; });
    return { label: 'все сметы заявки (' + sets.length + '): ' + sets.map(function (x) { return x.label; }).join(' + '),
             objects: sets.reduce(function (all, x) { return all.concat(x.objects); }, []), requested: requested, known: known, sets: sets };
  };

  Compare.prototype.run = function () {
    this.only = null;
    var b = this.base();
    if (!b || !this.newFile) { this.res = null; this.render(); return; }
    var parts = this.newFile.parts || [{ label: this.newFile.name, objects: this.newFile.objects }];
    if (parts.length > 1) b = this.wholeBase(b);
    var t0 = performance.now();
    var sets = b.sets || [{ label: b.label, objects: b.objects }];
    var j = S.compare.join(sets, parts, true);
    this.res = S.compare.versions(j.olds, j.news, b.requested, b.known);
    this.works = workDiff(sets, parts, j.to);
    // a corrected file that is none of the estimates: said, its sheets are shown without a pair
    var lost = parts.filter(function (p, i) { return j.to[i] < 0; }).map(function (p) { return p.label; });
    // which file was compared with which estimate — shown, so that a wrong pair is seen and not guessed from the sums
    this.pairs = { on: sets.length > 1 || parts.length > 1,
      pairs: parts.map(function (p, i) { return j.to[i] >= 0 ? { n: p.label, o: sets[j.to[i]].label, how: j.how[i] } : null; }).filter(Boolean),
      alone: j.alone.map(function (i) { return sets[i].label; }), lost: lost };
    this.doubts = this.doubt(b, parts, lost);
    this.labels = { oldLabel: b.label, newLabel: this.newFile.name, asked: Object.keys(b.requested).length,
                    reply: this.reply && this.reply.base === $('cmpOld').value ? this.reply : null };
    this.ms = Math.round(performance.now() - t0);
    this.render();
  };

  /**
   * Does the result look like a comparison of the right files? What every wrong pairing seen so far had in common is
   * checked on each result and said over the cards, in red — a file compared with another estimate's, a corrected file
   * loaded as an estimate, files of another application: a third of the lines «deleted» or «new», or far more saved
   * «by our remarks» than was asked. The sums are shown all the same; the person is told not to take them as they are.
   */
  Compare.prototype.doubt = function (b, parts, lost) {
    var out = [], T = this.res.totals, c = T.counts, app = this.app;
    var gone = (c.removed || 0) + (c.added || 0);
    if (T.rows >= 20 && gone >= 0.3 * T.rows) out.push('Строк «удалено» или «новых»: ' + gone + ' из ' + T.rows +
      ' — так бывает, когда исправленный файл сравнивается не со своей сметой. Проверьте «Было» и список сопоставления файлов ниже.');
    // by the prices alone: a volume cut beside them saves too, and is shown on its own card
    if (T.askedSaving > 0 && T.gotPrice > 1.5 * T.askedSaving) out.push('Снижение цен по замечаниям (' + money(T.gotPrice) +
      ') больше запрошенного (' + money(T.askedSaving) + ') в полтора раза и более — проверьте, что файлы сопоставлены со своими сметами.');
    // a line we asked to lower, deleted — and new lines on the same sheet: the resource may have been replaced by a
    // dearer one, and the deletion counted as our saving (67168: 322 lamps asked cheaper, deleted, LED lamps added)
    (T.goneAsked || []).forEach(function (g) {
      if (g.as) {
        out.push('Строка с нашим замечанием переименована: «' + g.nm + '» → «' + g.as.nm + '» (' + g.unit + '): цена ' +
          S.price(g.p1) + ' → ' + S.price(g.as.p2) + (samePriceUi(g.as.p2, g.market) ? ' (наша цена)' : ' (наша ' + S.price(g.market) + ')') +
          ', объём ' + S.qty(g.q1) + ' → ' + S.qty(g.as.q2) + '. Проверьте, что это та же позиция, и обоснование нового объёма.');
        return;
      }
      var added = 0, cands = [], w0 = S.nameKey(g.nm).split(' ');
      // the new lines of that sheet, those sharing the deleted name's first words first (a replacement is named like it)
      var common = function (n) { var w = S.nameKey(n).split(' '), i = 0; while (i < w.length && i < w0.length && w[i] === w0[i]) i++; return i; };
      this.res.objects.forEach(function (o) {
        if (o.name !== g.object) return;
        o.rows.forEach(function (r) { if (r.st === 'added' && !r.asOf) { added += r.s2 || 0; cands.push(r.nm); } });
      });
      var names = cands.map(function (n, i) { return { n: n, c: common(n), i: i }; })
        .sort(function (a, b) { return b.c - a.c || a.i - b.i; }).slice(0, 3).map(function (x) { return x.n; });
      out.push('Строка с нашим замечанием удалена: «' + g.nm + '» (' + g.unit + ', было ' + money(g.s1) + ', по нашей цене ' + money(g.asked) + ')' +
        (added >= 1 ? ' — а в том же листе новые строки на ' + money(added) + ': ' + names.map(function (n) { return '«' + n + '»'; }).join(', ') +
          '. Похоже, ресурс заменён другим — проверьте его цену.' : '.'));
    }, this);
    if (lost.length) out.push('Не сопоставлен ни с одной сметой заявки: ' + lost.join(', ') + ' — его листы показаны без пары.');
    // one corrected file against the estimate chosen as «Было», while another estimate of the application is nearer
    var v = $('cmpOld').value;
    if (parts.length === 1 && v !== 'file') {
      var on = app.projects.filter(function (p) { return p.enabled !== false; });
      var chosen = on.indexOf(app.projects[+String(v).slice(1)]);
      if (on.length > 1) {
        var k = S.compare.nearer(on.map(function (p) { return { objects: p.objects || [] }; }), parts[0], chosen);
        if (k >= 0) out.push('Файл «' + parts[0].label + '» больше похож на смету «' + (on[k].file || on[k].name) +
          '», а сравнивается с «' + b.label + '». Выберите нужную смету в списке «Было» — или загрузите исправленные файлы всех смет сразу.');
      }
    }
    return out;
  };

  function samePriceUi(a, b) { return a != null && b != null && Math.abs(a - b) < Math.max(1, Math.abs(b) * 1e-3); }

  /** The doubts over the cards. */
  function doubtBox(list) {
    if (!list || !list.length) return '';
    return '<div class="cmp-doubt" role="alert"><b>Проверьте сравнение.</b><ul>' +
      list.map(function (t) { return '<li>' + S.esc(t) + '</li>'; }).join('') + '</ul></div>';
  }
  /** Which corrected file stands against which estimate, and the estimates that came back without a file. */
  function pairBox(P) {
    if (!P || !P.on) return '';
    var li = P.pairs.map(function (x) {
      return '<li>«' + S.esc(x.n) + '» ↔ «' + S.esc(x.o) + '»' + (x.how === 'name' ? ' <small>(по имени файла)</small>' : x.how === 'lines' ? ' <small>(по строкам)</small>' : '') + '</li>';
    }).concat(P.alone.map(function (n) { return '<li class="alone">«' + S.esc(n) + '» — исправленного файла нет: считается неизменённой</li>'; }))
      .concat(P.lost.map(function (n) { return '<li class="lost">«' + S.esc(n) + '» — не сопоставлен ни с одной сметой</li>'; }));
    return '<details class="cmp-miss cmp-pairs"' + (P.alone.length || P.lost.length ? ' open' : '') + '><summary>Сопоставление файлов: пар ' + P.pairs.length +
      (P.alone.length ? ' · без исправленного файла ' + P.alone.length : '') + (P.lost.length ? ' · без сметы ' + P.lost.length : '') +
      '</summary><ul>' + li.join('') + '</ul></details>';
  }

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
        ' → ' + (e.market != null ? S.price(e.market) : 'примечание');
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
      // «Наш ответ» loaded and no corrected smeta: say that the reply did land — the corrected smeta is optional
      // (old work fed for learning usually has none), and what of the reply did not
      var rp = this.reply && this.reply.base === $('cmpOld').value ? this.reply : null, done = '';
      if (rp) {
        var m = rp.match, seen = {}, twice = 0;
        m.found.forEach(function (f) { var dup = f.keys.every(function (k) { return seen[k]; }); f.keys.forEach(function (k) { seen[k] = 1; }); if (dup) twice++; });
        done = '<div class="cmp-done" id="cmpReplyDone"><b>Наш ответ применён</b> — файл «' + S.esc(rp.name) + '»: строк ' + rp.entries.length +
          ', найдено в смете ' + m.found.length + (rp.applied ? ', цен проекта обновлено: ' + rp.applied : '') +
          (twice ? ', повторов (та же позиция сметы ещё раз): ' + twice : '') +
          (m.missing.length ? ', <b>не найдено ' + m.missing.length + '</b> — список ниже' : '') + '.<br>' +
          (rp.vol && rp.vol.foreign && S.Volumes ? 'Объёмы: ' + S.esc(S.Volumes.replyText(rp.vol)) + '.<br>' : '') +
          (rp.vol && !rp.vol.foreign && S.Volumes ? 'Лист «объем»: ' + S.esc(S.Volumes.replyText(rp.vol)) + ' — вкладка «Объёмы работ».' +
            (rp.vol.missing.length ? ' Нет в смете: ' + rp.vol.missing.slice(0, 10).map(function (e) { return '«' + S.esc(e.name) + '»'; }).join(', ') +
              (rp.vol.missing.length > 10 ? ' …' : '') + '.' : '') + '<br>' : '') +
          'Исправленная смета не обязательна. Если её нет — проверьте цены на вкладке «Проверка цен» и нажмите «✓ Завершить»: ' +
          'цены этой заявки будут запомнены.' + replyNotes(rp) + '</div>';
      }
      sum.innerHTML = done + '<div class="cmp-empty">' +
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
    // the remarks' work is what the prices lost; a smaller volume and a deleted line are told beside it, never as it
    var pct = T.askedSaving > 0 ? Math.round(T.gotPrice / T.askedSaving * 100) : null;
    var beside = (Math.abs(T.gotQty) >= 1 ? '<br>за счёт объёмов этих строк: ' + money(T.gotQty) : '') +
      (T.gotGone >= 1 ? '<br>строки с замечанием удалены: ' + money(T.gotGone) : '');
    sum.innerHTML = doubtBox(this.doubts) +
      '<div class="cmp-cards">' +
      card('', 'Сумма по смете', money(T.oldSum) + ' → ' + money(T.newSum), delta(T.newSum - T.oldSum)) +
      card(T.gotGone >= 1 ? 'part' : 'good', 'Снижение цен по нашим замечаниям', money(T.gotPrice) + ' из ' + money(T.askedSaving),
        (pct == null ? 'замечаний с ценой нет' : pct + ' % запрошенного') + beside) +
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
      worksCard(this.works) +
      '</div>' +
      '<div class="cmp-files">Было: <b>' + S.esc(L.oldLabel) + '</b> · Стало: <b>' + S.esc(L.newLabel) + '</b> · ' +
      (L.reply ? 'замечания из файла «' + S.esc(L.reply.name) + '»: ' + L.asked + ' (строк в файле ' + L.reply.entries.length + ')' :
        'замечаний в нашей таблице: ' + L.asked) + ' · ' + lines(T.rows) + ' · ' + this.ms + ' мс</div>' +
      pairBox(this.pairs) + (L.reply ? replyNotes(L.reply) : '') + worksList(this.works);

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
  /** «Объёмы работ»: did the volumes of the works change in the corrected file — up, down, works new or gone. */
  function worksCard(W) {
    if (!W) return '';
    if (!W.pairs) return card('', 'Объёмы работ (ведомость)', 'не сравнивались', 'в исправленной смете нет ведомости объёмов работ');
    var moved = W.up.length + W.down.length + W.gone.length + W.added.length;
    return card(W.up.length || W.added.length ? 'bad' : moved ? 'part' : 'good', 'Объёмы работ (ведомость)',
      moved ? 'увеличено ' + W.up.length + ' · уменьшено ' + W.down.length : 'без изменений',
      W.works + ' работ · без изменений ' + W.same + ' · новых ' + W.added.length + ' · удалено ' + W.gone.length +
      (W.noNew ? ' · без ведомости в исправленной: ' + W.noNew : ''));
  }
  /** The works whose volume changed, under the cards: what the reviewer checks against the drawings. */
  function worksList(W) {
    if (!W || !W.pairs) return '';
    var rows = [];
    var line = function (st, x, from, to) {
      rows.push('<tr class="' + st + '"><td>' + S.esc(x.work.name) + (x.where ? '<small> · ' + S.esc(x.where) + '</small>' : '') + '</td><td>' +
        S.esc(x.work.unit || '') + '</td><td class="n">' + (from == null ? '—' : S.qty(from)) + '</td><td class="n">' + (to == null ? '—' : S.qty(to)) + '</td></tr>');
    };
    W.up.forEach(function (x) { line('t-bad', x, x.from, x.to); });
    W.added.forEach(function (x) { line('t-bad', x, null, x.work.volume); });
    W.down.forEach(function (x) { line('t-part', x, x.from, x.to); });
    W.gone.forEach(function (x) { line('t-part', x, x.work.volume, null); });
    if (!rows.length) return '';
    return '<details class="cmp-miss cmp-works"' + (rows.length <= 12 ? ' open' : '') + '><summary>Изменились объёмы работ (ведомость): ' + rows.length +
      '</summary><div><table class="cmp"><tr><th>Работа</th><th>Ед. изм.</th><th>Объём было</th><th>Объём стало</th></tr>' + rows.join('') +
      '</table></div></details>';
  }

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
