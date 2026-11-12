/*
 * Admin page: «Недельные котировки UZEX» — the exchange's weekly quotes, a section of its own beside «Справочник цен
 * (документы)». Nothing here reads or writes the reference packages.
 *
 *   «Обновить с UZEX»          POST /api/uzex/sync — the server fetches the weeks the site lists that are not stored yet
 *   «Перечитать»               the same with force=1 — the listed weeks are read again and rewritten
 *   «Обновлять автоматически»  POST /api/uzex/auto — the switch of the server's own sync (after a start, and daily)
 *   the table                  the stored weeks; an administrator may delete one (its quotes go with it; prices
 *                              already applied from it stay)
 * The interface is Russian (CLAUDE.md); this section was Uzbek until v2.10.0 (audit 4, E9). The server's messages
 * about the site are Russian too (server/pb_hooks/lib/uzex.js) and are quoted as they come.
 */
(function (S) {
  'use strict';
  if (!S.pb) return;

  function $(id) { return document.getElementById(id); }
  function toast(msg, err) {
    var t = $('toast');
    t.textContent = msg; t.className = 'toast on' + (err ? ' err' : '');
    clearTimeout(toast.h);
    toast.h = setTimeout(function () { t.className = 'toast'; }, err ? 6000 : 3000);
  }
  function day(d) { return d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4) : ''; }
  function when(d) {
    if (!d) return '';
    var x = new Date(String(d).replace(' ', 'T'));
    return isNaN(x) ? String(d) : x.toLocaleDateString('ru-RU') + ' ' + x.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  var MARKET = S.RU.market;

  var Uz = {
    items: [], busy: false,

    init: function () {
      var self = this;
      if (this.inited || !$('uzexPanel')) return;
      this.inited = true;
      $('uzexSync').addEventListener('click', function () { self.sync(false); });
      $('uzexForce').addEventListener('click', function () {
        if (confirm('Недели, которые сейчас показывает сайт, будут прочитаны заново и записаны вместо сохранённых. Продолжить?')) self.sync(true);
      });
      $('uzexAuto').addEventListener('change', function () { self.setAuto(this.checked); });
      $('uzexTable').addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('button[data-del]');
        if (b) self.remove(b.dataset.del);
      });
      document.addEventListener('auth:signedin', function () { self.load(); });
      if (S.pb.authStore.isValid) this.load();
    },

    load: function () {
      var self = this;
      S.pb.send('/api/uzex/status', { method: 'GET' }).then(function (st) { self.status(st); }).catch(function () { /* an older server */ });
      S.pb.collection('uzex_imports').getFullList({ sort: '-period_from,-import_id' }).then(function (list) {
        self.items = list;
        self.render();
      }).catch(function (e) {
        if (e && e.status === 0) return;
        $('uzexStat').textContent = 'На этом сервере нет раздела UZEX — обновите программу.';
      });
    },

    status: function (st) {
      $('uzexAuto').checked = !!st.auto;
      var t = st.last_sync_at ? 'Последнее обновление: ' + when(st.last_sync_at) + ', новых недель: ' + (st.last_new_weeks || 0) : 'Ещё не обновлялось';
      $('uzexStat').textContent = t;
      var err = $('uzexErr');
      err.hidden = st.last_sync_status !== 'error';
      err.textContent = st.last_sync_status === 'error' ? 'Последнее обновление завершилось ошибкой: ' + (st.last_sync_message || '') +
        ' — сохранённые недели на месте.' : '';
    },

    sync: function (force) {
      var self = this;
      if (this.busy) return;
      this.busy = true;
      $('uzexSync').disabled = true; $('uzexForce').disabled = true;
      $('uzexProgress').hidden = false;
      S.pb.send('/api/uzex/sync' + (force ? '?force=1' : ''), { method: 'POST' }).then(function (r) {
        if (r.busy) { toast('Обновление уже идёт', true); return; }
        var rows = (r.added || []).reduce(function (n, w) { return n + w.rows; }, 0);
        toast(r.ok ? (r.added.length ? 'Новых недель: ' + r.added.length + ' (строк: ' + rows + ')' : 'Новых недель нет — всё уже сохранено')
          : 'UZEX: ' + (r.message || 'ошибка'), !r.ok);
      }).catch(function (e) {
        toast(S.pbErr(e), true);
      }).then(function () {
        self.busy = false;
        $('uzexSync').disabled = false; $('uzexForce').disabled = false;
        $('uzexProgress').hidden = true;
        self.load();
      });
    },

    setAuto: function (on) {
      var self = this;
      S.pb.send('/api/uzex/auto', { method: 'POST', body: { on: !!on } }).then(function (st) {
        self.status(st);
        toast(st.auto ? 'Автоматическое обновление включено' : 'Автоматическое обновление выключено');
      }).catch(function (e) {
        $('uzexAuto').checked = !on;
        toast(S.pbErr(e), true);
      });
    },

    render: function () {
      var tb = $('uzexTable').querySelector('tbody');
      if (!this.items.length) { tb.innerHTML = '<tr><td colspan="5" class="mute">Пока ничего не получено — нажмите «Обновить с UZEX».</td></tr>'; return; }
      tb.innerHTML = this.items.map(function (x) {
        return '<tr><td title="' + S.esc(x.label || '') + '">' + S.esc(day(x.period_from) + ' – ' + day(x.period_to)) + '</td><td>' +
          S.esc(MARKET[x.market] || x.market) + '</td><td>' + (x.row_count || 0) + '</td><td>' + S.esc(when(x.fetched_at)) + '</td>' +
          '<td><button class="link" data-del="' + S.esc(x.id) + '">Удалить</button></td></tr>';
      }).join('');
    },

    remove: function (id) {
      var self = this;
      var x = this.items.filter(function (i) { return i.id === id; })[0];
      if (!x || !confirm('Удалить неделю ' + day(x.period_from) + ' – ' + day(x.period_to) + ' (' + (MARKET[x.market] || x.market) + ')?\n\n' +
        'Цены, уже применённые из неё, останутся. Если сайт ещё показывает эту неделю, она будет получена снова при следующем обновлении.')) return;
      S.pb.collection('uzex_imports').delete(id).then(function () { toast('Неделя удалена'); self.load(); })
        .catch(function (e) { toast(S.pbErr(e), true); });
    }
  };

  S.UzexAdmin = Uz;
  document.addEventListener('DOMContentLoaded', function () { Uz.init(); });
  if (document.readyState !== 'loading') Uz.init();
})(S);
