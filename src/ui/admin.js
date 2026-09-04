/*
 * Admin page: registry upload (parsed in the browser, upserted by the
 * /api/registry/import hook), workspace clean-up, manual applications and
 * user management.
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
      $('wsQ').addEventListener('input', S.debounce(function () { self.renderWs(); }, 200));
      $('wsStatus').addEventListener('change', function () { self.renderWs(); });
      $('appAddBtn').addEventListener('click', function () {
        S.AppAdmin.openForm(function (number, msg) { $('appStat').textContent = msg; $('findQ').value = number; self.findApps(); });
      });
      $('findForm').addEventListener('submit', function (e) { e.preventDefault(); self.findApps(); });
      if (S.pb.authStore.isValid) this.open();
    },

    open: function () {
      var ok = S.isAdmin();
      $('denied').hidden = ok;
      $('adminMain').hidden = !ok;
      if (!ok) return;
      this.loadHistory();
      this.loadWs();
      this.loadUsers();
    },

    /* ------------------------------------------------------- workspaces */
    wsItems: [],
    loadWs: function () {
      var self = this;
      S.pb.collection('workspaces').getFullList({
        sort: '-updated', expand: 'application,application.contragent,updated_by',
        fields: 'id,status,region,files,changed,updated,expand.application.number,expand.application.org_name,expand.application.inn,' +
          'expand.application.project_title,expand.application.expand.contragent.name,expand.updated_by.name,expand.updated_by.email'
      }).then(function (items) {
        self.wsItems = items;
        self.renderWs();
      }).catch(function (e) { toast(S.pbErr(e), true); });
    },

    renderWs: function () {
      var self = this;
      var tb = $('wsTable').querySelector('tbody');
      var q = $('wsQ').value.trim().toLowerCase(), st = $('wsStatus').value;
      var shown = 0;
      tb.innerHTML = this.wsItems.map(function (w) {
        var a = (w.expand && w.expand.application) || {};
        var c = a.expand && a.expand.contragent;
        var org = c ? c.name : (a.org_name || '');
        if (st && w.status !== st) return '';
        if (q && ((a.number || '') + ' ' + org + ' ' + (a.project_title || '') + ' ' + (a.inn || '')).toLowerCase().indexOf(q) < 0) return '';
        shown++;
        var by = w.expand && w.expand.updated_by;
        return '<tr data-id="' + w.id + '">' +
          '<td class="mono"><b>' + S.esc(a.number || '?') + '</b></td>' +
          '<td>' + S.esc(org) + (a.inn ? '<br><span class="mute">ИНН ' + S.esc(a.inn) + '</span>' : '') + '</td>' +
          '<td>' + S.esc(S.regionLabel(w.region)) + '</td>' +
          '<td><span class="ws ' + S.esc(w.status) + '">' + (w.status === 'done' ? 'завершена' : 'в работе') + '</span></td>' +
          '<td>' + ((w.files || []).length) + '</td>' +
          '<td>' + (w.changed || 0) + '</td>' +
          '<td>' + when(w.updated) + (by ? '<br><span class="mute">' + S.esc(by.name || by.email) + '</span>' : '') + '</td>' +
          '<td class="act"><button class="btn sm" data-act="clear" title="Удалить файлы, правки и экспорты, начать заново">Очистить</button>' +
          '<button class="btn sm danger" data-act="delete" title="Удалить рабочую область полностью">✕ Удалить</button></td></tr>';
      }).join('') || '<tr><td colspan="8" class="mute">Никто ещё не открывал заявки</td></tr>';
      $('wsCount').textContent = shown + ' / ' + this.wsItems.length;
      tb.querySelectorAll('button[data-act]').forEach(function (b) {
        b.addEventListener('click', function () {
          var tr = b.closest('tr');
          var w = self.wsItems.find(function (x) { return x.id === tr.dataset.id; });
          if (b.dataset.act === 'clear') self.clearWs(w); else self.deleteWs(w);
        });
      });
    },

    appOf: function (w) { return (w.expand && w.expand.application) || {}; },
    clearWs: function (w) { var self = this; S.AppAdmin.clearWs(w, this.appOf(w), function () { self.loadWs(); }); },
    deleteWs: function (w) { var self = this; S.AppAdmin.deleteWs(w, this.appOf(w), function () { self.loadWs(); }); },

    /* ------------------------------------------------ manual application */
    findApps: function () {
      var self = this;
      var q = $('findQ').value.trim();
      var tb = $('findTable').querySelector('tbody');
      if (!q) { $('findTable').hidden = true; return; }
      $('findTable').hidden = false;
      tb.innerHTML = '<tr><td colspan="6" class="mute">поиск…</td></tr>';
      Promise.all([
        S.pb.collection('applications').getList(1, 20, {
          filter: S.pb.filter('number ~ {:q} || org_name ~ {:q} || inn ~ {:q}', { q: q }), sort: '-registered_at', expand: 'contragent'
        }),
        S.pb.collection('workspaces').getFullList({ fields: 'id,application,status' })
      ]).then(function (res) {
        var ws = {};
        res[1].forEach(function (w) { ws[w.application] = w; });
        tb.innerHTML = res[0].items.map(function (a) {
          var c = a.expand && a.expand.contragent, w = ws[a.id];
          return '<tr data-id="' + a.id + '">' +
            '<td class="mono"><b>' + S.esc(a.number) + '</b></td>' +
            '<td>' + (a.registered_at ? when(a.registered_at).split(' ')[0] : '') + '</td>' +
            '<td>' + S.esc(c ? c.name : a.org_name) + (a.inn ? '<br><span class="mute">ИНН ' + S.esc(a.inn) + '</span>' : '') + '</td>' +
            '<td>' + S.esc(a.project_title || '') + '</td>' +
            '<td>' + (w ? '<span class="ws ' + S.esc(w.status) + '">' + (w.status === 'done' ? 'завершена' : 'в работе') + '</span>' : '<span class="mute">—</span>') + '</td>' +
            '<td class="act"><button class="btn sm danger" data-act="delapp">✕ Удалить</button></td></tr>';
        }).join('') || '<tr><td colspan="6" class="mute">Не найдено</td></tr>';
        tb.querySelectorAll('button[data-act=delapp]').forEach(function (b) {
          b.addEventListener('click', function () {
            var id = b.closest('tr').dataset.id;
            var a = res[0].items.find(function (x) { return x.id === id; });
            self.deleteApp(a, !!ws[id]);
          });
        });
      }).catch(function (e) { tb.innerHTML = '<tr><td colspan="6" class="mute">' + S.esc(S.pbErr(e)) + '</td></tr>'; });
    },

    deleteApp: function (a, hasWs) {
      var self = this;
      S.AppAdmin.deleteApp(a, hasWs, function () { self.findApps(); self.loadWs(); });
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
      this.progress(0, 1, 'Чтение файла…');
      var reader = new FileReader();
      reader.onload = function () {
        var parsed;
        try { parsed = S.parseRegistry(reader.result); }
        catch (e) { self.fail('Не удалось прочитать файл: ' + (e.message || e)); return; }
        self.send(parsed.rows, file).catch(function (e) { self.fail('Ошибка импорта: ' + S.pbErr(e)); });
      };
      reader.onerror = function () { self.fail('Не удалось прочитать файл'); };
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
          self.progress(i, rows.length, i + ' / ' + rows.length + ' строк');
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
        $('regStat').textContent = 'Прочитано ' + rows.length + ' строк · добавлено ' + total.added +
          ' · обновлено ' + total.updated + ' · новых контрагентов ' + total.contragents;
        toast('Реестр обновлён');
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
        }).join('') || '<tr><td colspan="6" class="mute">Загрузок ещё не было</td></tr>';
      }).catch(function (e) { toast(S.pbErr(e), true); });
    },

    /* ------------------------------------------------------------ users */
    loadUsers: function () {
      var self = this;
      var tb = $('userTable').querySelector('tbody');
      S.pb.collection('users').getFullList({ sort: 'name' }).then(function (items) {
        tb.innerHTML = items.map(function (u) {
          return '<tr data-id="' + u.id + '"><td>' + S.esc(u.email) + '</td><td>' + S.esc(u.name || '') +
            '</td><td>' + S.esc(u.role || '') + '</td><td>' + (u.active ? 'активен' : '<span class="mute">отключён</span>') +
            '</td><td class="act"><button class="btn sm ' + (u.active ? 'danger' : 'ok') + '" data-act="toggle">' + (u.active ? 'Отключить' : 'Включить') + '</button></td></tr>';
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
        toast(email + ' добавлен');
        self.loadUsers();
      }).catch(function (e) {
        $('userErr').textContent = 'Не удалось добавить: ' + S.pbErr(e); $('userErr').hidden = false;
      });
    }
  };

  S.Admin = Admin;
  document.addEventListener('DOMContentLoaded', function () { Admin.init(); });
  if (document.readyState !== 'loading') Admin.init();
})(S);
