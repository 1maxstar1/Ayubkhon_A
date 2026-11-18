/*
 * «Перенос данных между компьютерами» (admin page): the work of one laptop brought to another, once (the owner's
 * decision, 2026-11-18). Two computers, each with work of its own:
 *
 *   «Выгрузить для переноса»       — everything worked on here (server/pb_hooks/transfer.pb.js gives the records), with
 *                                     the files of the workspaces, the exports and the kept smeta files, in one .zip;
 *   «Загрузить с другого компьютера» — that .zip read here: what will happen to each application is shown first; then
 *                                     the database is copied aside (a backup) and the applications are taken in one by
 *                                     one — a new one added, one changed later on the other computer replacing the one
 *                                     here (it stays in the backup), one changed later here kept as it is.
 *
 * Nothing is deleted that the backup does not hold. The reference package and the UZEX quotes are not carried: the
 * first is loaded on each computer from its file, the second comes from the exchange by itself.
 */
(function (S) {
  'use strict';
  if (!S.pb) return;

  var FORMAT = 'smeta-transfer';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return S.esc(String(s == null ? '' : s)); }
  function u8(s) { return fflate.strToU8(s); }
  /** «smeta_ab12cd34ef.xlsx» → «smeta.xlsx»: the name a file had before PocketBase stored it (it adds its own again). */
  function bare(n) { return String(n).replace(/_[a-z0-9]{10}(\.[^./]+)$/i, '$1'); }
  function stamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }
  /** What the server said, when it said something. */
  function why(e) {
    var r = e && e.response, d = r && r.data && Object.keys(r.data).length ? ' ' + JSON.stringify(r.data).slice(0, 300) : '';
    return ((r && r.message) || S.pbErr(e)) + d;
  }
  function say(t, err) { var el = $('trState'); if (el) { el.textContent = t; el.className = 'count' + (err ? ' err' : ''); } }

  var T = {
    plan: null,

    init: function () {
      var self = this;
      if (this.inited || !$('trExport')) return;
      this.inited = true;
      $('trExport').addEventListener('click', function () { self.exportAll(); });
      $('trFile').addEventListener('change', function (e) {
        var f = e.target.files[0];
        e.target.value = '';
        if (f) self.read(f);
      });
    },

    /* ------------------------------------------------------------------ out */

    exportAll: function () {
      var self = this, btn = $('trExport');
      btn.disabled = true;
      say('Собираю данные…');
      var d, missing = [], files = {};
      S.pb.send('/api/admin/transfer/export?v=' + encodeURIComponent(S.appVersion ? S.appVersion() : ''), { method: 'GET' }).then(function (r) {
        d = r;
        var jobs = [];
        d.workspaces.forEach(function (w) { (w.files || []).forEach(function (n) { jobs.push({ rec: w, name: n, path: 'files/workspaces/' + w.id + '/' + n }); }); });
        d.exports.forEach(function (x) { if (x.file) jobs.push({ rec: x, name: x.file, path: 'files/exports/' + x.id + '/' + x.file }); });
        d.smeta_files.forEach(function (x) { if (x.file) jobs.push({ rec: x, name: x.file, path: 'files/smeta_files/' + x.id + '/' + x.file }); });
        var done = 0;
        // one file at a time: a laptop's server, and the memory of the page, are not hurried
        return jobs.reduce(function (p, j) {
          return p.then(function () {
            return S.fileURL(j.rec, j.name).then(function (url) { return fetch(url); }).then(function (res) {
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return res.arrayBuffer();
            }).then(function (b) { files[j.path] = [new Uint8Array(b), { level: 0 }]; })
              .catch(function () { missing.push(j.path); })
              .then(function () { done++; if (done % 5 === 0 || done === jobs.length) say('Файлы: ' + done + ' из ' + jobs.length + '…'); });
          });
        }, Promise.resolve());
      }).then(function () {
        d.missing = missing;
        files['transfer.json'] = [u8(JSON.stringify(d)), { level: 6 }];
        var zip = fflate.zipSync(files);
        var blob = new Blob([zip], { type: 'application/zip' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'perenos-' + stamp() + '.zip';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
        say('Готово: заявок ' + d.workspaces.length + ', файлов ' + (Object.keys(files).length - 1) + ', ' + Math.round(blob.size / 1048576) + ' МБ' +
          (missing.length ? ' · не получено файлов: ' + missing.length : '') + '. Перенесите файл на другой компьютер и загрузите его там.', missing.length > 0);
      }).catch(function (e) {
        say('Не выгружено: ' + S.pbErr(e), true);
      }).then(function () { btn.disabled = false; });
    },

    /* ------------------------------------------------------------------- in */

    read: function (file) {
      var self = this;
      say('Читаю ' + file.name + '…');
      $('trPlan').innerHTML = '';
      var reader = new FileReader();
      reader.onerror = function () { say('Файл не прочитан', true); };
      reader.onload = function () {
        var z, d;
        try {
          z = fflate.unzipSync(new Uint8Array(reader.result));
          d = JSON.parse(fflate.strFromU8(z['transfer.json']));
        } catch (e) { say('Это не файл переноса (нет transfer.json): ' + (e.message || e), true); return; }
        if (!d || d.format !== FORMAT) { say('Это не файл переноса этой программы', true); return; }
        // what is here already: each application's workspace and when it was last changed
        S.pb.collection('workspaces').getFullList({ batch: 500, fields: 'id,updated,expand.application.number', expand: 'application' }).then(function (ws) {
          var here = {};
          ws.forEach(function (w) { var a = w.expand && w.expand.application; if (a) here[a.number] = w.updated; });
          self.plan = self.planOf(d, z, here);
          self.show(file.name);
        }).catch(function (e) { say('Не удалось прочитать заявки этого компьютера: ' + S.pbErr(e), true); });
      };
      reader.readAsArrayBuffer(file);
    },

    /** Per application of the file: what it holds, and what will happen to it here. */
    planOf: function (d, z, here) {
      var apps = {}, cts = {};
      d.applications.forEach(function (a) { apps[a.id] = a; });
      d.contragents.forEach(function (c) { cts[c.id] = c; });
      var by = function (list) {
        var o = {};
        (list || []).forEach(function (r) { (o[r.workspace] = o[r.workspace] || []).push(r); });
        return o;
      };
      var corr = by(d.corrections), exps = by(d.exports), mem = by(d.price_memory), ev = by(d.suggest_events);
      var items = d.workspaces.map(function (w) {
        var a = apps[w.application] || {}, mine = here[a.number];
        var action = !mine ? 'add' : mine >= w.updated ? 'keep' : 'replace';
        var ctIds = {};
        if (a.contragent) ctIds[a.contragent] = 1;
        [corr[w.id], mem[w.id], ev[w.id]].forEach(function (l) { (l || []).forEach(function (r) { if (r.contragent) ctIds[r.contragent] = 1; }); });
        return {
          number: a.number, title: a.project_title || a.org_name || '', action: action, here: mine || '', there: w.updated,
          app: a, ws: w, corrections: corr[w.id] || [], exports: exps[w.id] || [], price_memory: mem[w.id] || [], suggest_events: ev[w.id] || [],
          contragents: Object.keys(ctIds).map(function (k) { return cts[k]; }).filter(Boolean)
        };
      }).filter(function (it) { return it.number; });
      return { d: d, z: z, items: items };
    },

    show: function (name) {
      var self = this, p = this.plan, n = { add: 0, replace: 0, keep: 0 };
      p.items.forEach(function (it) { n[it.action]++; });
      var what = { add: 'добавить', replace: 'заменить здешнюю (там изменена позже)', keep: 'оставить здешнюю (здесь изменена позже)' };
      var when = function (s) { var t = new Date(String(s).replace(' ', 'T')); return isNaN(t) ? '' : t.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }); };
      $('trPlan').innerHTML = '<p class="lead">Файл «' + esc(name) + '» от ' + esc(when(p.d.created)) + (p.d.app_version ? ' (версия ' + esc(p.d.app_version) + ')' : '') +
        ': заявок ' + p.items.length + ' — добавится ' + n.add + ', заменится ' + n.replace + ', останется как здесь ' + n.keep +
        (p.d.missing && p.d.missing.length ? '. На том компьютере не получено файлов: ' + p.d.missing.length : '') +
        '. Перед загрузкой база этого компьютера будет сохранена в резервную копию — заменённое останется в ней.</p>' +
        '<table class="tbl" id="trTable"><thead><tr><th>№</th><th>Проект</th><th>Здесь</th><th>В файле</th><th>Что будет</th></tr></thead><tbody>' +
        p.items.map(function (it) {
          return '<tr data-n="' + esc(it.number) + '" class="tr-' + it.action + '"><td>' + esc(it.number) + '</td><td>' + esc(it.title).slice(0, 90) + '</td><td>' +
            esc(when(it.here) || '—') + '</td><td>' + esc(when(it.there)) + '</td><td class="tr-what">' + esc(what[it.action]) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<p><button class="btn primary" type="button" id="trGo">Объединить</button> <button class="btn" type="button" id="trCancel">Отмена</button></p>';
      say('');
      $('trGo').addEventListener('click', function () { self.go(); });
      $('trCancel').addEventListener('click', function () { $('trPlan').innerHTML = ''; self.plan = null; say('Отменено'); });
    },

    go: function () {
      var self = this, p = this.plan;
      if (!p) return;
      $('trGo').disabled = true; $('trCancel').disabled = true; $('trFile').disabled = true;
      var res = { added: 0, replaced: 0, kept: 0, failed: [] }, backup = '';
      say('Резервная копия базы…');
      S.pb.send('/api/admin/transfer/backup', { method: 'POST' }).then(function (b) {
        backup = b.name;
        var todo = p.items, i = 0;
        return todo.reduce(function (chain, it) {
          return chain.then(function () {
            i++;
            say('Заявка ' + i + ' из ' + todo.length + ' (№ ' + it.number + ')…');
            if (it.action === 'keep') { res.kept++; self.mark(it.number, 'оставлена здешняя'); return null; }
            return S.pb.send('/api/admin/transfer/workspace', { method: 'POST', body: self.form(it, p.z) }).then(function (r) {
              var t = r.result === 'added' ? (res.added++, 'добавлена') : r.result === 'replaced' ? (res.replaced++, 'заменена (прежняя — в копии ' + backup + ')') :
                (res.kept++, 'оставлена здешняя');
              self.mark(it.number, t + (r.counts && r.counts.files != null ? ' · файлов ' + r.counts.files + ', правок ' + r.counts.corrections +
                ', в памяти ' + r.counts.price_memory : ''));
            }).catch(function (e) { res.failed.push(it.number); self.mark(it.number, 'не загружена: ' + why(e), true); });
          });
        }, Promise.resolve());
      }).then(function () {
        return self.formats(p);
      }).then(function (fm) {
        say('Готово: добавлено ' + res.added + ', заменено ' + res.replaced + ', оставлено как здесь ' + res.kept +
          (res.failed.length ? ', не загружено ' + res.failed.length + ' (№ ' + res.failed.join(', ') + ')' : '') +
          (fm ? ' · образцов форматов смет: ' + fm : '') + '. Резервная копия до переноса: ' + backup + '.', res.failed.length > 0);
      }).catch(function (e) {
        say((backup ? 'Остановлено: ' : 'Ничего не загружено: ') + S.pbErr(e), true);
      }).then(function () { $('trFile').disabled = false; });
    },

    mark: function (number, text, err) {
      var tr = document.querySelector('#trTable tr[data-n="' + CSS.escape(String(number)) + '"] .tr-what');
      if (tr) { tr.textContent = text; tr.classList.toggle('err', !!err); tr.classList.add('done'); }
    },

    /** One application's work as the route takes it: the records in `data`, the files beside them. */
    form: function (it, z) {
      var fd = new FormData(), names = [], w = it.ws;
      (w.files || []).forEach(function (n) {
        var b = z['files/workspaces/' + w.id + '/' + n];
        if (!b) return;                       // not fetched on the other computer: the estimate is «away» here
        names.push(n);
        fd.append('files', new Blob([b]), bare(n));
      });
      var exps = it.exports.map(function (x) {
        var b = x.file ? z['files/exports/' + x.id + '/' + x.file] : null;
        if (b) fd.append('exp', new Blob([b]), bare(x.file));
        return Object.assign({}, x, { file: b ? x.file : '' });
      });
      fd.append('data', JSON.stringify({
        application: it.app, contragents: it.contragents, workspace: Object.assign({}, w, { files: names }),
        corrections: it.corrections, exports: exps, price_memory: it.price_memory, suggest_events: it.suggest_events
      }));
      return fd;
    },

    /** The samples of smeta formats this computer does not have: in parts, with their kept files. */
    formats: function (p) {
      var rows = p.d.smeta_files || [], added = 0, parts = [];
      for (var i = 0; i < rows.length; i += 100) parts.push(rows.slice(i, i + 100));
      return parts.reduce(function (chain, part) {
        return chain.then(function () {
          var fd = new FormData();
          var data = part.map(function (r) {
            var b = r.file ? p.z['files/smeta_files/' + r.id + '/' + r.file] : null;
            if (b) fd.append('files', new Blob([b]), bare(r.file));
            return Object.assign({}, r, { withFile: !!b });
          });
          fd.append('data', JSON.stringify(data));
          return S.pb.send('/api/admin/transfer/formats', { method: 'POST', body: fd }).then(function (r) { added += r.added; });
        });
      }, Promise.resolve()).then(function () { return added; }).catch(function () { return added; });
    }
  };

  S.Transfer = T;
  document.addEventListener('auth:signedin', function () { T.init(); });
  if (document.readyState !== 'loading') T.init(); else document.addEventListener('DOMContentLoaded', function () { T.init(); });
})(S);
