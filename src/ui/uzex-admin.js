/*
 * Admin page: «UZEX haftalik narxlar» — the exchange's weekly quotes, a section of its own beside «Справочник цен
 * (документы)». Nothing here reads or writes the reference packages.
 *
 *   «UZEX dan yangilash»   POST /api/uzex/sync — the server fetches the weeks the site lists that are not stored yet
 *   «Qayta o'qish»         the same with force=1 — the listed weeks are read again and rewritten
 *   «Avtomatik yangilash»  POST /api/uzex/auto — the switch of the server's own sync (after a start, and daily)
 *   the table              the stored weeks; an administrator may delete one (its quotes go with it; prices already
 *                          applied from it stay)
 * The words of this section are Uzbek, as its owner asked; the server's messages about the site are quoted as they
 * come.
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
  var MARKET = { internal: 'Ichki', 'export': 'Eksport' };

  var Uz = {
    items: [], busy: false,

    init: function () {
      var self = this;
      if (this.inited || !$('uzexPanel')) return;
      this.inited = true;
      $('uzexSync').addEventListener('click', function () { self.sync(false); });
      $('uzexForce').addEventListener('click', function () {
        if (confirm("Saytda ko'rinib turgan haftalar qaytadan o'qiladi va saqlanganining o'rniga yoziladi. Davom etilsinmi?")) self.sync(true);
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
        $('uzexStat').textContent = "Bu serverda UZEX bo'limi yo'q — dasturni yangilang.";
      });
    },

    status: function (st) {
      $('uzexAuto').checked = !!st.auto;
      var t = st.last_sync_at ? 'Oxirgi yangilanish: ' + when(st.last_sync_at) + ', yangi haftalar: ' + (st.last_new_weeks || 0) : 'Hali yangilanmagan';
      $('uzexStat').textContent = t;
      var err = $('uzexErr');
      err.hidden = st.last_sync_status !== 'error';
      err.textContent = st.last_sync_status === 'error' ? 'Oxirgi yangilanish xato bilan tugadi: ' + (st.last_sync_message || '') +
        ' — saqlangan haftalar joyida.' : '';
    },

    sync: function (force) {
      var self = this;
      if (this.busy) return;
      this.busy = true;
      $('uzexSync').disabled = true; $('uzexForce').disabled = true;
      $('uzexProgress').hidden = false;
      S.pb.send('/api/uzex/sync' + (force ? '?force=1' : ''), { method: 'POST' }).then(function (r) {
        if (r.busy) { toast('Yangilanish allaqachon ketmoqda', true); return; }
        var rows = (r.added || []).reduce(function (n, w) { return n + w.rows; }, 0);
        toast(r.ok ? (r.added.length ? 'Yangi haftalar: ' + r.added.length + ' (qatorlar: ' + rows + ')' : "Yangi hafta yo'q — hammasi saqlangan")
          : 'UZEX: ' + (r.message || 'xato'), !r.ok);
      }).catch(function (e) {
        toast((e && e.response && e.response.message) || S.pbErr(e), true);
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
        toast(st.auto ? 'Avtomatik yangilash yoqildi' : "Avtomatik yangilash o'chirildi");
      }).catch(function (e) {
        $('uzexAuto').checked = !on;
        toast((e && e.response && e.response.message) || S.pbErr(e), true);
      });
    },

    render: function () {
      var tb = $('uzexTable').querySelector('tbody');
      if (!this.items.length) { tb.innerHTML = '<tr><td colspan="5" class="mute">Hali hech narsa olinmagan — «UZEX dan yangilash» ni bosing.</td></tr>'; return; }
      tb.innerHTML = this.items.map(function (x) {
        return '<tr><td title="' + S.esc(x.label || '') + '">' + S.esc(day(x.period_from) + ' – ' + day(x.period_to)) + '</td><td>' +
          S.esc(MARKET[x.market] || x.market) + '</td><td>' + (x.row_count || 0) + '</td><td>' + S.esc(when(x.fetched_at)) + '</td>' +
          '<td><button class="link" data-del="' + S.esc(x.id) + '">O\'chirish</button></td></tr>';
      }).join('');
    },

    remove: function (id) {
      var self = this;
      var x = this.items.filter(function (i) { return i.id === id; })[0];
      if (!x || !confirm(day(x.period_from) + ' – ' + day(x.period_to) + ' (' + (MARKET[x.market] || x.market) + ') haftasi o\'chirilsinmi?\n\n' +
        'Undan allaqachon qo\'llangan narxlar joyida qoladi. Sayt bu haftani hali ko\'rsatayotgan bo\'lsa, keyingi yangilanishda qayta olinadi.')) return;
      S.pb.collection('uzex_imports').delete(id).then(function () { toast("Hafta o'chirildi"); self.load(); })
        .catch(function (e) { toast((e && e.response && e.response.message) || S.pbErr(e), true); });
    }
  };

  S.UzexAdmin = Uz;
  document.addEventListener('DOMContentLoaded', function () { Uz.init(); });
  if (document.readyState !== 'loading') Uz.init();
})(S);
