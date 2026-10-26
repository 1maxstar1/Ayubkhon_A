/*
 * Admin page: importing a reference-price package (format smeta-refs v1, src/lib/refs/package.js).
 *
 * The whole check runs here, in the browser, before anything is sent: the file is hashed (pure JS — crypto.subtle
 * does not exist on the plain-HTTP pages of an office network or of a server reached by its IP), unpacked with a
 * 500 MB cap, decoded, parsed and validated row by row in slices, with progress. Only a valid package is uploaded,
 * as is, with its head (manifest) beside it; the server checks the head and stores the file. The first package
 * becomes the active one; later ones wait for «Сделать активным». Errors name a row and a field, never a value.
 */
(function (S) {
  'use strict';
  if (!S.pb || !S.refs || !S.refs.pkg) return;
  var P = S.refs.pkg;
  var SLICE = 4 * 1024 * 1024;

  function $(id) { return document.getElementById(id); }
  function toast(msg, err) {
    var t = $('toast');
    t.textContent = msg; t.className = 'toast on' + (err ? ' err' : '');
    clearTimeout(toast.h);
    toast.h = setTimeout(function () { t.className = 'toast'; }, err ? 6000 : 3000);
  }
  var NF = new Intl.NumberFormat('ru-RU');
  function n(v) { return NF.format(v); }
  function day(d) { return d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4) : ''; }
  function when(d) {
    if (!d) return '';
    var x = new Date(d);
    return isNaN(x) ? String(d) : x.toLocaleDateString('ru-RU') + ' ' + x.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  function later(f) { return new Promise(function (res) { setTimeout(function () { res(f ? f() : undefined); }, 0); }); }

  /** sha256 of the file in slices of 4 MB, yielding between them (50 MB ≈ 0.6 s). */
  function hash(bytes, progress) {
    var s = P.sha256Stream(), at = 0;
    function step() {
      if (at >= bytes.length) return Promise.resolve(s.hex());
      var to = Math.min(bytes.length, at + SLICE);
      s.update(bytes.subarray(at, to));
      at = to;
      progress(at, bytes.length);
      return later().then(step);
    }
    return step();
  }

  /** gunzip with a cap on the unpacked size, counted while streaming. */
  function gunzip(bytes) {
    var cap = P.LIMITS.bytes;
    if (typeof DecompressionStream === 'undefined') {
      var out = (S.__fflate || window.fflate).gunzipSync(bytes);
      if (out.length > cap) throw new Error('Пакет слишком велик (больше 500 МБ после распаковки)');
      return Promise.resolve(out);
    }
    var reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    var parts = [], total = 0;
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) {
          var all = new Uint8Array(total), o = 0;
          for (var i = 0; i < parts.length; i++) { all.set(parts[i], o); o += parts[i].length; }
          return all;
        }
        total += r.value.length;
        if (total > cap) {
          reader.cancel();
          throw new Error('Пакет слишком велик (больше 500 МБ после распаковки)');
        }
        parts.push(r.value);
        return pump();
      });
    }
    return pump().catch(function (e) {
      if (/500 МБ/.test(e.message)) throw e;
      throw new Error('Это не файл .json.gz или он повреждён');
    });
  }

  function errorLines(res) {
    var list = res.errors.slice(0, 20).map(function (e) {
      return (e.row ? 'строка ' + n(e.row) + ', ' : '') + 'поле ' + e.field + ': ' + e.msg;
    });
    var cnt = res.errors.length + (res.truncated ? '+' : '');
    var word = res.errors.length === 1 ? 'ошибка' : (res.errors.length < 5 ? 'ошибки' : 'ошибок');
    return 'Пакет не принят: ' + cnt + ' ' + word + '\n' + list.join('\n');
  }

  var Refs = {
    pending: null,          // { file, bytes, sha, pkg, manifest }
    items: [],

    init: function () {
      var self = this;
      if (!$('refsPanel')) return;
      document.addEventListener('auth:signedin', function () { self.open(); });
      $('refsFile').addEventListener('change', function (e) {
        var f = e.target.files[0];
        e.target.value = '';
        if (f) self.check(f);
      });
      $('refsUpload').addEventListener('click', function () { self.upload(); });
      $('refsCancel').addEventListener('click', function () { self.reset(); });
      $('refsActivateDup').addEventListener('click', function () {
        if (self.dup) self.activate(self.dup);
      });
      if (S.pb.authStore.isValid) this.open();
    },

    open: function () {
      if (!S.isAdmin()) return;
      this.load();
    },

    progress: function (done, total, text) {
      $('refsProgress').hidden = false;
      $('refsBar').style.width = (total ? Math.round(done / total * 100) : 0) + '%';
      $('refsText').textContent = text;
    },
    fail: function (msg) {
      $('refsProgress').hidden = true;
      $('refsErr').textContent = msg;
      $('refsErr').hidden = false;
      $('refsStat').textContent = '';
      $('refsReady').hidden = true;
      this.pending = null;
    },
    reset: function () {
      this.pending = null; this.dup = null;
      $('refsProgress').hidden = true; $('refsErr').hidden = true;
      $('refsStat').textContent = ''; $('refsReady').hidden = true;
    },

    /** Everything up to «Загрузить»: hash, unpack, decode, parse, validate, look for the same package. */
    check: function (file) {
      var self = this;
      this.reset();
      if (file.size > P.LIMITS.gzip) { this.fail('Файл больше 50 МБ — это не пакет справочника'); return; }
      var st = { file: file };
      this.progress(0, 1, 'Чтение файла…');
      var read = file.arrayBuffer ? file.arrayBuffer() : new Promise(function (res, rej) {
        var fr = new FileReader();
        fr.onload = function () { res(fr.result); };
        fr.onerror = function () { rej(fr.error); };
        fr.readAsArrayBuffer(file);
      });
      read.then(function (buf) {
        st.bytes = new Uint8Array(buf);
        return hash(st.bytes, function (d, t) { self.progress(d, t, 'Контрольная сумма ' + Math.round(d / t * 100) + ' %'); });
      }).then(function (sha) {
        st.sha = sha;
        self.progress(0, 1, 'Распаковка…');
        return later(function () { return gunzip(st.bytes); });
      }).then(function (raw) {
        self.progress(0, 1, 'Чтение пакета…');
        return later(function () {
          var text = new TextDecoder('utf-8').decode(raw);
          var bad = P.checkDecoded(text.length, raw.length);
          if (bad) throw new Error(bad);
          var obj;
          try { obj = JSON.parse(text); } catch (e) { throw new Error('Пакет повреждён: это не JSON'); }
          st.unpacked = raw.length;
          return obj;
        });
      }).then(function (obj) {
        st.pkg = obj;
        return new Promise(function (res) {
          P.validateAsync(obj, {
            bytes: st.unpacked,
            progress: function (d, t) { self.progress(d, t, 'Проверка ' + Math.round(d / t * 100) + ' %'); }
          }, res);
        });
      }).then(function (res) {
        if (!res.ok) { self.fail(errorLines(res)); return; }
        st.manifest = P.manifest(st.pkg);
        st.pkg = null;              // the rows are not needed any more; the file goes as it is
        self.pending = st;
        $('refsProgress').hidden = true;
        var m = st.manifest;
        $('refsStat').textContent = 'Пакет ' + m.package_id + ' · записей ' + n(m.counts.records) + ' · документов ' +
          n(m.counts.sources) + ' · цены ' + day(m.date_min) + ' … ' + day(m.date_max);
        return self.findSame(m.package_id, st.sha);
      }).catch(function (e) {
        self.fail(e && e.message ? e.message : 'Не удалось прочитать файл');
      });
    },

    /** The same file uploaded before (by hash), or another file under the same number. */
    findSame: function (pid, sha) {
      var self = this;
      return S.pb.collection('ref_packages').getList(1, 2, {
        filter: S.pb.filter('sha256 = {:s} || package_id = {:p}', { s: sha, p: pid }), fields: 'id,package_id,sha256,active,created'
      }).then(function (r) {
        $('refsReady').hidden = false;
        $('refsUpload').hidden = false;
        $('refsActivateDup').hidden = true;
        self.dup = null;
        for (var i = 0; i < r.items.length; i++) {
          var x = r.items[i];
          if (x.sha256 === sha) {
            $('refsStat').textContent += ' — этот пакет уже загружен ' + when(x.created) + (x.active ? ' и активен' : '');
            $('refsUpload').hidden = true;
            if (!x.active) { self.dup = x.id; $('refsActivateDup').hidden = false; }
            return;
          }
          $('refsErr').textContent = 'Пакет с таким номером уже есть, но содержимое другое — проверьте файл';
          $('refsErr').hidden = false;
          $('refsUpload').hidden = true;
          return;
        }
      });
    },

    upload: function () {
      var self = this, st = this.pending;
      if (!st) return;
      var m = st.manifest;
      var fd = new FormData();
      fd.append('package_id', m.package_id);
      fd.append('sha256', st.sha);
      fd.append('manifest', JSON.stringify(m));
      fd.append('records', String(m.counts.records));
      fd.append('sources', String(m.counts.sources));
      fd.append('date_min', m.date_min);
      fd.append('date_max', m.date_max);
      fd.append('file', st.file, m.package_id + '.json.gz');
      $('refsUpload').disabled = true;
      this.progress(1, 1, 'Отправка…');
      S.pb.collection('ref_packages').create(fd).then(function (rec) {
        self.reset();
        toast('Пакет ' + rec.package_id + ' загружен' + (rec.active ? ' и сделан активным' : ''));
        self.load();
      }).catch(function (e) {
        var d = e && e.response && e.response.data;
        if (d && ((d.sha256 && d.sha256.code === 'validation_not_unique') || (d.package_id && d.package_id.code === 'validation_not_unique'))) {
          self.fail(d.sha256 ? 'Этот пакет уже загружен' : 'Пакет с таким номером уже есть, но содержимое другое — проверьте файл');
        } else self.fail('Не удалось загрузить: ' + ((e && e.response && e.response.message) || S.pbErr(e)));
      }).then(function () { $('refsUpload').disabled = false; });
    },

    load: function () {
      var self = this;
      S.pb.collection('ref_packages').getFullList({
        sort: '-created', expand: 'by',
        fields: 'id,package_id,records,sources,date_min,date_max,active,note,created,manifest,expand.by.name,expand.by.email'
      }).then(function (items) { self.items = items; self.render(); })
        .catch(function (e) { toast(S.pbErr(e), true); });
    },

    render: function () {
      var self = this;
      var tb = $('refsTable').querySelector('tbody');
      tb.innerHTML = this.items.map(function (x) {
        var by = x.expand && x.expand.by;
        var m = x.manifest || {};
        return '<tr data-id="' + x.id + '">' +
          '<td class="mono"><b>' + S.esc(x.package_id) + '</b>' + (x.note ? '<br><span class="mute">' + S.esc(x.note) + '</span>' : '') + '</td>' +
          '<td>' + S.esc(day(m.created)) + '</td>' +
          '<td>' + when(x.created) + (by ? '<br><span class="mute">' + S.esc(by.name || by.email) + '</span>' : '') + '</td>' +
          '<td>' + n(x.records || 0) + '</td>' +
          '<td>' + n(x.sources || 0) + '</td>' +
          '<td>' + S.esc(day(x.date_min)) + ' … ' + S.esc(day(x.date_max)) + '</td>' +
          '<td>' + (x.active ? '<b>✓ активен</b>' : '') + '</td>' +
          '<td class="act"><button class="btn sm" data-act="docs">Документы</button>' +
          (x.active ? '' : '<button class="btn sm" data-act="activate">Сделать активным</button>' +
            '<button class="btn sm danger" data-act="delete">✕ Удалить</button>') + '</td></tr>';
      }).join('') || '<tr><td colspan="8" class="mute">Пакетов ещё нет</td></tr>';
      tb.querySelectorAll('button[data-act]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.closest('tr').dataset.id;
          if (b.dataset.act === 'activate') self.activate(id);
          else if (b.dataset.act === 'delete') self.remove(id);
          else self.docs(id);
        });
      });
    },

    activate: function (id) {
      var self = this;
      S.pb.send('/api/refs/' + id + '/activate', { method: 'POST' }).then(function () {
        toast('Активный пакет сменён');
        self.reset();
        self.load();
      }).catch(function (e) { toast(S.pbErr(e), true); });
    },

    remove: function (id) {
      var self = this;
      var x = this.items.filter(function (i) { return i.id === id; })[0];
      if (!x || !confirm('Удалить пакет ' + x.package_id + '?\n\nЦены, уже применённые экспертами, останутся.')) return;
      S.pb.collection('ref_packages').delete(id).then(function () { toast('Пакет удалён'); self.load(); })
        .catch(function (e) { toast((e && e.response && e.response.message) || S.pbErr(e), true); });
    },

    /** The documents of a package, from its manifest: type, issuer, number, date, region. */
    docs: function (id) {
      var box = $('refsDocs');
      var x = this.items.filter(function (i) { return i.id === id; })[0];
      if (!x || (box.dataset.id === id && !box.hidden)) { box.hidden = true; return; }
      var DOC = (S.refs.RU && S.refs.RU.DOC) || {};
      var src = (x.manifest && x.manifest.sources) || [];
      box.dataset.id = id;
      box.innerHTML = '<h3>Документы пакета ' + S.esc(x.package_id) + '</h3><table class="tbl"><thead><tr><th>Вид</th><th>Кто выдал</th>' +
        '<th>№</th><th>Дата</th><th>Регион</th></tr></thead><tbody>' + src.map(function (d) {
          return '<tr><td>' + S.esc(DOC[d.doc_type] || 'документ') + '</td><td>' + S.esc(d.issuer || '') + '</td><td>' + S.esc(d.doc_no || '') +
            '</td><td>' + S.esc(day(d.issue_date || d.as_of_date)) + '</td><td>' +
            S.esc(d.region === 'national' ? 'вся республика' : (d.region && S.regionLabel ? S.regionLabel(d.region) : '')) + '</td></tr>';
        }).join('') + '</tbody></table>';
      box.hidden = false;
    }
  };

  S.RefsAdmin = Refs;
  document.addEventListener('DOMContentLoaded', function () { Refs.init(); });
  if (document.readyState !== 'loading') Refs.init();
})(S);
