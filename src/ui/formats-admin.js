/*
 * Admin page: «Распознавание форматов смет» (docs/format-reja.md) — what has been gathered about the formats of the
 * estimates, as counts; how far the first training is; and the files to look at: those the program did not read, or
 * read with sums that do not agree. Such a file is kept whole: «Скачать» hands it over to be sent to whoever
 * maintains the program, «Проверить снова» reads it again with the rules of this version, «Убрать» takes it off the
 * list (an unread file — with its record; a read one — only the file, its sample stays to learn from).
 */
(function (S) {
  'use strict';
  if (!S.pb) return;
  function $(id) { return document.getElementById(id); }

  var DOUBT = 0.9, LIST_MAX = 200;
  function when(d) { var x = new Date(String(d || '').replace(' ', 'T')); return isNaN(x) ? '' : x.toLocaleDateString('ru-RU'); }
  function version() { var v = document.querySelector('.ver'); return v ? String(v.textContent || '').trim().slice(0, 20) : ''; }
  function doubt(r) { return r.is_read && r.checked > 0 && r.score < DOUBT; }

  var A = {
    data: null, list: [], busy: false,

    rows: function (d) {
      return [
        ['Смет, формат которых записан', d.files, 'files'],
        ['— прочитаны правилами программы', d.read, 'read'],
        ['— — из них: суммы сходятся не во всех строках (кол-во × цена ≠ сумма)', d.doubt, 'doubt'],
        ['— не прочитаны', d.unread, 'unread'],
        ['Разных форматов среди прочитанных', d.formats, 'formats'],
        ['Разных форматов среди непрочитанных', d.formats_unread, 'formats_unread'],
        ['Строк ресурсов в прочитанных сметах', d.lines, 'lines'],
        ['Файлов хранится целиком (чтобы отправить разработчику)', d.kept, 'kept']
      ];
    },

    /** What is wrong with a kept file, in words. */
    state: function (r) {
      if (!r.is_read) {
        var why = r.reason === 'no-sheets' || !r.reason ? 'листы ресурсов не найдены' : String(r.reason).replace(/^error:\s*/, '');
        return '<b>Не прочитан</b>: ' + S.esc(why);
      }
      if (doubt(r)) return 'Прочитан, но кол-во × цена = сумма только в ' + Math.round(r.score * 100) + ' % строк (' + r.checked + ' проверено)';
      return 'Теперь читается (строк ресурсов: ' + (r.items || 0) + '). Загрузите его в заявку ещё раз.';
    },

    /** The table of counts and how far the first training is. */
    counts: function (d) {
      this.data = d;
      $('fmtTable').hidden = false;
      $('fmtTable').querySelector('tbody').innerHTML = this.rows(d).map(function (r) {
        return '<tr data-k="' + r[2] + '"><td>' + S.esc(r[0]) + '</td><td class="num">' + (r[1] || 0) + '</td></tr>';
      }).join('');
      var goal = $('fmtGoal'), n = d.read || 0, t = d.target || 100;
      goal.hidden = false;
      goal.querySelector('.bar-fill').style.width = Math.min(100, Math.round(n / t * 100)) + '%';
      goal.querySelector('span').textContent = n < t
        ? 'До обучения модели: ' + n + ' из ' + t + ' файлов'
        : 'Файлов для обучения достаточно: ' + n + ' из ' + t + '. Обучение модели появится с обновлением программы.';
    },

    /** The counts and the list, from the server. `said`: what to leave in the status line afterwards. */
    load: function (said) {
      var self = this;
      if (!$('fmtTable') || !S.isAdmin()) return Promise.resolve();
      return S.pb.send('/api/formats/stats', { method: 'GET', requestKey: null }).then(function (d) {
        $('fmtStat').textContent = d.missing ? 'Сервер ещё не обновлён полностью — раздел заработает после обновления.' : '';
        self.counts(d);
        return self.loadList();
      }).then(function () {
        if (said) $('fmtStat').textContent = said;
      }).catch(function (e) {
        // a server from before this section: said, not an error to act on
        $('fmtStat').textContent = e && e.status === 404 ? 'Сервер ещё не обновлён — раздел появится после обновления.' : S.pbErr(e);
      });
    },

    loadList: function () {
      var self = this;
      return S.pb.collection('smeta_files').getList(1, LIST_MAX, {
        filter: 'is_read = false || file != ""', sort: '-created', requestKey: null,
        fields: 'id,collectionId,collectionName,hash,name,size,created,is_read,reason,score,checked,items,file'
      }).then(function (res) {
        self.list = res.items || [];
        self.renderList(res.totalItems || 0);
      }).catch(function () { self.list = []; self.renderList(0); });
    },

    renderList: function (total) {
      var list = this.list, has = list.length > 0;
      $('fmtListHead').hidden = !has;
      $('fmtList').hidden = !has;
      $('fmtRecheckAll').hidden = !list.some(function (r) { return r.file; });
      $('fmtListHead').textContent = 'Файлы, которые нужно посмотреть' + (total > list.length ? ' (первые ' + list.length + ' из ' + total + ')' : '');
      $('fmtList').querySelector('tbody').innerHTML = list.map(function (r) {
        return '<tr data-id="' + S.esc(r.id) + '"><td>' + S.esc(r.name || '(без имени)') + '</td><td>' + when(r.created) + '</td>' +
          '<td class="st">' + A.state(r) + '</td><td class="act">' +
          (r.file ? '<button class="btn sm" data-act="get" title="Скачать файл, чтобы отправить его разработчику">Скачать</button>' +
            '<button class="btn sm" data-act="again" title="Прочитать файл ещё раз — правилами этой версии программы">Проверить снова</button>' : '') +
          '<button class="btn sm" data-act="drop" title="' + (r.is_read ? 'Убрать сохранённый файл; образец формата остаётся' : 'Убрать файл и запись о нём') + '">Убрать</button>' +
          '</td></tr>';
      }).join('');
    },

    rec: function (id) { return this.list.filter(function (r) { return r.id === id; })[0] || null; },

    bytes: function (r) {
      return S.fileURL(r, r.file).then(function (url) { return fetch(url); }).then(function (res) {
        if (!res.ok) throw new Error('файл не получен с сервера (' + res.status + ')');
        return res.arrayBuffer();
      }).then(function (buf) { return new Uint8Array(buf); });
    },

    /** The file under the name it was uploaded with (the server keeps it under a name of its own). */
    download: function (r) {
      return this.bytes(r).then(function (bytes) {
        var url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        var a = document.createElement('a');
        a.href = url;
        a.download = r.name || r.file;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60 * 1000);
      });
    },

    /** Read a kept file with the rules of this version; a file that reads now gets its sample and its counts. → text */
    again: function (r) {
      var self = this;
      if (!S.smeta || !S.readXlsx || !S.ml || !S.ml.layout) return Promise.reject(new Error('эта страница не умеет читать сметы — обновите программу'));
      return this.bytes(r).then(function (bytes) {
        var wb = null, objects = [], err = '';
        try { wb = S.readXlsx(bytes); objects = S.smeta.parseWorkbook(wb, r.name || 'smeta.xlsx'); }
        catch (e) { err = String(e && e.message || e).slice(0, 200); }
        var fmt = S.ml.layout.describe(bytes, err ? null : wb, objects);
        var read = objects.length > 0;
        if (!read && !r.is_read) return 'по-прежнему не читается' + (err ? ': ' + err : '');
        var body = { is_read: read, reason: read ? '' : (err ? 'error: ' + err : 'no-sheets'), objects: fmt.objects, items: fmt.items, checked: fmt.checked,
          score: fmt.score == null ? 0 : fmt.score, signature: fmt.signature, version: fmt.v, app_version: version() };
        if (fmt.sample) body.sample = fmt.sample;
        return S.pb.collection('smeta_files').update(r.id, body, { requestKey: null }).then(function (saved) {
          Object.assign(r, { is_read: saved.is_read, reason: saved.reason, score: saved.score, checked: saved.checked, items: saved.items });
          return read ? (doubt(r) ? 'прочитан, суммы сходятся не везде' : 'теперь читается') : 'по-прежнему не читается';
        });
      });
    },

    drop: function (r) {
      var col = S.pb.collection('smeta_files');
      return r.is_read ? col.update(r.id, { file: null }, { requestKey: null }) : col.delete(r.id, { requestKey: null });
    },

    againAll: function () {
      var self = this, todo = this.list.filter(function (r) { return r.file; }), i = 0, now = 0;
      if (this.busy || !todo.length) return;
      this.busy = true;
      var step = function () {
        if (i >= todo.length) {
          self.busy = false;
          self.load('Проверено файлов: ' + todo.length + ' · теперь читаются: ' + now + '.');
          return;
        }
        var r = todo[i++], was = r.is_read;
        $('fmtStat').textContent = 'Проверка ' + i + ' из ' + todo.length + ': ' + (r.name || '') + '…';
        self.again(r).then(function () { if (!was && r.is_read) now++; }, function () { /* said per file when asked one by one */ })
          .then(function () { setTimeout(step, 30); });      // the page stays alive between files
      };
      step();
    },

    text: function () {
      if (!this.data) return '';
      return this.rows(this.data).map(function (r) { return 'formats.' + r[2] + ' = ' + (r[1] || 0); }).join('\n');
    },

    init: function () {
      var self = this;
      if (this.inited || !$('fmtTable')) return;
      this.inited = true;
      $('fmtRefresh').addEventListener('click', function () { self.load(); });
      $('fmtRecheckAll').addEventListener('click', function () { self.againAll(); });
      $('fmtCopy').addEventListener('click', function () {
        var t = self.text();
        var done = function () { $('fmtStat').textContent = 'Скопировано: ' + t.split('\n').length + ' строк чисел.'; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { window.prompt('Скопируйте:', t); });
        else window.prompt('Скопируйте:', t);
      });
      $('fmtList').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button[data-act]') : null;
        var tr = b && b.closest('tr[data-id]'), r = tr && self.rec(tr.dataset.id);
        if (!r || self.busy) return;
        var cell = tr.querySelector('.st'), act = b.dataset.act;
        var fail = function (er) { $('fmtStat').textContent = (r.name || '') + ': ' + (er && er.status ? S.pbErr(er) : (er && er.message || er)); };
        if (act === 'get') { self.download(r).catch(fail); return; }
        if (act === 'again') {
          b.disabled = true;
          var was = r.is_read;
          self.again(r).then(function (said) {
            var line = (r.name || '') + ': ' + said + '.';
            $('fmtStat').textContent = line;
            cell.innerHTML = self.state(r);
            // the counts follow a file that reads now; the row stays where it is, with what to do next
            if (r.is_read !== was) return S.pb.send('/api/formats/stats', { method: 'GET', requestKey: null }).then(function (d) { self.counts(d); });
          }).catch(fail).then(function () { b.disabled = false; });
          return;
        }
        if (act === 'drop') {
          if (!window.confirm(r.is_read ? 'Убрать сохранённый файл «' + (r.name || '') + '»? Образец формата останется.'
            : 'Убрать файл «' + (r.name || '') + '» и запись о нём?')) return;
          self.drop(r).then(function () { self.load(); }, fail);
        }
      });
      document.addEventListener('auth:signedin', function () { self.load(); });
      if (S.pb.authStore.isValid) this.load();
    }
  };

  S.FormatsAdmin = A;
  document.addEventListener('DOMContentLoaded', function () { A.init(); });
  if (document.readyState !== 'loading') A.init();
})(S);
