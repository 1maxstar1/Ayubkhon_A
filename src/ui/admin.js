/*
 * Admin page: registry upload (parsed in the browser, upserted by the
 * /api/registry/import hook) and user management.
 */
(function (S) {
  'use strict';
  if (!S.pb) return;

  var CHUNK = 500;

  function $(id) { return document.getElementById(id); }
  function toast(msg, err) {
    var t = $('toast');
    t.textContent = msg; t.className = 'toast on' + (err ? ' err' : '');
    clearTimeout(toast.h);
    toast.h = setTimeout(function () { t.className = 'toast'; }, err ? 6000 : 3000);
  }
  function when(d) {
    if (!d) return '';
    var x = new Date(d);
    return isNaN(x) ? String(d) : x.toLocaleDateString('ru-RU') + ' ' + x.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  var Admin = {
    init: function () {
      var self = this;
      document.addEventListener('auth:signedin', function () { self.open(); });
      document.addEventListener('auth:signedout', function () { $('adminMain').hidden = true; });
      $('regFile').addEventListener('change', function (e) {
        var f = e.target.files[0];
        if (f) self.importFile(f);
        e.target.value = '';
      });
      $('userForm').addEventListener('submit', function (e) { e.preventDefault(); self.addUser(); });
      if (S.pb.authStore.isValid) this.open();
    },

    open: function () {
      var ok = S.isAdmin();
      $('denied').hidden = ok;
      $('adminMain').hidden = !ok;
      if (!ok) return;
      this.loadHistory();
      this.loadUsers();
    },

    /* --------------------------------------------------------- registry */
    progress: function (done, total, text) {
      $('regProgress').hidden = false;
      $('regBar').style.width = (total ? Math.round(done / total * 100) : 0) + '%';
      $('regText').textContent = text;
    },

    importFile: function (file) {
      var self = this;
      $('regErr').hidden = true;
      $('regStat').textContent = '';
      this.progress(0, 1, 'Fayl o\'qilmoqda…');
      var reader = new FileReader();
      reader.onload = function () {
        var parsed;
        try { parsed = S.parseRegistry(reader.result); }
        catch (e) { self.fail('Faylni o\'qib bo\'lmadi: ' + (e.message || e)); return; }
        self.send(parsed.rows, file).catch(function (e) { self.fail('Import xatosi: ' + S.pbErr(e)); });
      };
      reader.onerror = function () { self.fail('Faylni o\'qib bo\'lmadi'); };
      reader.readAsArrayBuffer(file);
    },

    fail: function (msg) {
      $('regErr').textContent = msg; $('regErr').hidden = false;
      $('regProgress').hidden = true;
    },

    send: function (rows, file) {
      var self = this;
      var total = { added: 0, updated: 0, contragents: 0 };
      var i = 0;
      function step() {
        if (i >= rows.length) return Promise.resolve();
        var part = rows.slice(i, i + CHUNK);
        return S.pb.send('/api/registry/import', { method: 'POST', body: { rows: part } }).then(function (r) {
          total.added += r.added; total.updated += r.updated; total.contragents += r.contragents;
          i += part.length;
          self.progress(i, rows.length, i + ' / ' + rows.length + ' qator');
          return step();
        });
      }
      return step().then(function () {
        var fd = new FormData();
        fd.append('file', file);
        fd.append('rows', rows.length);
        fd.append('rows_added', total.added);
        fd.append('rows_updated', total.updated);
        fd.append('by', S.me().id);
        return S.pb.collection('registry_imports').create(fd);
      }).then(function () {
        $('regProgress').hidden = true;
        $('regStat').textContent = rows.length + ' qator o\'qildi · qo\'shildi ' + total.added +
          ' · yangilandi ' + total.updated + ' · yangi kontragentlar ' + total.contragents;
        toast('Reyestr yangilandi');
        self.loadHistory();
      });
    },

    loadHistory: function () {
      var tb = $('regHistory').querySelector('tbody');
      S.pb.collection('registry_imports').getList(1, 20, { sort: '-created', expand: 'by' }).then(function (r) {
        tb.innerHTML = r.items.map(function (x) {
          var by = x.expand && x.expand.by;
          var url = x.file ? S.pb.files.getURL(x, x.file) : '';
          return '<tr><td>' + when(x.created) + '</td><td>' + S.esc(by ? (by.name || by.email) : '') +
            '</td><td>' + (x.rows || 0) + '</td><td>' + (x.rows_added || 0) + '</td><td>' + (x.rows_updated || 0) +
            '</td><td>' + (url ? '<a href="' + url + '">' + S.esc(x.file) + '</a>' : '') + '</td></tr>';
        }).join('') || '<tr><td colspan="6" class="mute">Hali yuklanmagan</td></tr>';
      }).catch(function (e) { toast(S.pbErr(e), true); });
    },

    /* ------------------------------------------------------------ users */
    loadUsers: function () {
      var self = this;
      var tb = $('userTable').querySelector('tbody');
      S.pb.collection('users').getFullList({ sort: 'name' }).then(function (items) {
        tb.innerHTML = items.map(function (u) {
          return '<tr data-id="' + u.id + '"><td>' + S.esc(u.email) + '</td><td>' + S.esc(u.name || '') +
            '</td><td>' + S.esc(u.role || '') + '</td><td>' + (u.active ? 'faol' : '<span class="mute">o\'chirilgan</span>') +
            '</td><td><button class="link" data-act="toggle">' + (u.active ? 'O\'chirish' : 'Yoqish') + '</button></td></tr>';
        }).join('');
        tb.querySelectorAll('button[data-act=toggle]').forEach(function (b) {
          b.addEventListener('click', function () {
            var tr = b.closest('tr');
            var u = items.find(function (x) { return x.id === tr.dataset.id; });
            S.pb.collection('users').update(u.id, { active: !u.active }).then(function () { self.loadUsers(); })
              .catch(function (e) { toast(S.pbErr(e), true); });
          });
        });
      }).catch(function (e) { toast(S.pbErr(e), true); });
    },

    addUser: function () {
      var self = this;
      var email = $('uEmail').value.trim(), name = $('uName').value.trim(), role = $('uRole').value;
      if (!email || !name) return;
      // Password auth is disabled; the record still needs one, so it gets a random secret nobody knows.
      var pw = Array.from(crypto.getRandomValues(new Uint8Array(24)), function (b) { return (b % 36).toString(36); }).join('');
      $('userErr').hidden = true;
      S.pb.collection('users').create({
        email: email, name: name, role: role, active: true, emailVisibility: true,
        password: pw, passwordConfirm: pw
      }).then(function () {
        $('uEmail').value = ''; $('uName').value = '';
        toast(email + ' qo\'shildi');
        self.loadUsers();
      }).catch(function (e) {
        $('userErr').textContent = 'Qo\'shib bo\'lmadi: ' + S.pbErr(e); $('userErr').hidden = false;
      });
    }
  };

  S.Admin = Admin;
  document.addEventListener('DOMContentLoaded', function () { Admin.init(); });
  if (document.readyState !== 'loading') Admin.init();
})(S);
