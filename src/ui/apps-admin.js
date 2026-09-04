/*
 * Admin actions on applications and workspaces, shared by the application
 * list (index.html) and the admin page: the manual "add application" form,
 * clear / delete a workspace, delete an application. All go through the
 * admin endpoints in server/pb_hooks/admin.pb.js.
 */
(function (S) {
  'use strict';
  if (!S.pb) return;

  function $(id) { return document.getElementById(id); }
  function toast(msg, err) {
    if (window.app && window.app.toast) { window.app.toast(msg, err); return; }
    var t = $('toast');
    if (!t) return;
    t.textContent = msg; t.className = 'toast on' + (err ? ' err' : '');
    clearTimeout(toast.h);
    toast.h = setTimeout(function () { t.className = 'toast'; }, err ? 6000 : 3000);
  }

  var FIELDS = ['aNumber', 'aDate', 'aStatus', 'aCost', 'aOrg', 'aInn', 'aObject', 'aTitle', 'aType', 'aBuyer', 'aPlace', 'aExec'];

  var AppAdmin = {
    onDone: null,

    init: function () {
      var self = this;
      var f = $('appForm');
      if (!f) return;
      f.addEventListener('submit', function (e) { e.preventDefault(); self.save(); });
      $('appFormClose').addEventListener('click', function () { self.closeForm(); });
      $('appFormCancel').addEventListener('click', function () { self.closeForm(); });
      $('screen-appform').addEventListener('click', function (e) { if (e.target === this) self.closeForm(); });
    },

    /** Label used in confirmations: «№ 67155 — Org». */
    label: function (a) { return '№ ' + (a.number || '?') + (a.org_name ? ' — ' + a.org_name : ''); },

    /* ---------------------------------------------------------- form */
    openForm: function (onDone) {
      this.onDone = onDone || null;
      FIELDS.forEach(function (id) { $(id).value = ''; });
      $('appErr').hidden = true;
      $('screen-appform').hidden = false;
      $('aNumber').focus();
      S.pb.send('/api/registry/facets', { method: 'GET' }).then(function (f) {
        $('typeList').innerHTML = (f.expertise_type || []).map(function (x) { return '<option value="' + S.esc(x.v) + '">'; }).join('');
        $('buyerList').innerHTML = (f.buyer_type || []).map(function (x) { return '<option value="' + S.esc(x.v) + '">'; }).join('');
      }).catch(function () { /* datalists stay empty */ });
    },
    closeForm: function () { $('screen-appform').hidden = true; },

    save: function () {
      var self = this;
      var v = function (id) { return $(id).value.trim(); };
      var number = v('aNumber').replace(/\s+/g, '');
      $('appErr').hidden = true;
      if (!number) { $('appErr').textContent = 'Ariza raqami kerak'; $('appErr').hidden = false; return; }
      // Only filled fields go up: the import hook leaves absent fields alone, so
      // re-adding an existing number updates what was typed and keeps the rest.
      var row = { number: number, raw: { 'Qo\'lda qo\'shdi': (S.me().name || S.me().email) + ', ' + new Date().toLocaleDateString('ru-RU') } };
      var put = function (f, id, fn) { var x = v(id); if (x) row[f] = fn ? fn(x) : x; };
      put('status', 'aStatus'); put('org_name', 'aOrg'); put('inn', 'aInn', function (x) { return x.replace(/\s+/g, ''); });
      put('project_title', 'aTitle'); put('object_id', 'aObject'); put('expertise_type', 'aType'); put('buyer_type', 'aBuyer');
      put('place', 'aPlace'); put('executor_name', 'aExec');
      put('registered_at', 'aDate', function (x) { return new Date(x + 'T00:00:00Z').toISOString(); });
      if (v('aCost')) { row.cost_vat = +v('aCost'); row.cost = Math.round(+v('aCost') / 1.12); row.currency = 'Узбекский сум'; }
      if (!row.status) row.status = 'Qo\'lda qo\'shilgan';
      if (!row.registered_at) row.registered_at = new Date().toISOString();
      // Same path as the registry upload: contragent by INN, update if the number exists.
      S.pb.send('/api/registry/import', { method: 'POST', body: { rows: [row] } }).then(function (r) {
        var msg = r.updated ? 'Ariza № ' + number + ' mavjud edi — ma\'lumotlari yangilandi' : 'Ariza № ' + number + ' qo\'shildi';
        toast(msg);
        self.closeForm();
        if (self.onDone) self.onDone(number, msg);
      }).catch(function (e) { $('appErr').textContent = 'Saqlab bo\'lmadi: ' + S.pbErr(e); $('appErr').hidden = false; });
    },

    /* ------------------------------------------------------- actions */
    /** @param w workspace record; a — its application (for the label) */
    clearWs: function (w, a, onDone) {
      if (!confirm('Ariza ' + this.label(a) + '\n\nBarcha smeta fayllari, narx tuzatishlari va eksportlar o\'chiriladi. Ish boshidan boshlanadi (viloyat qoladi). Davom etilsinmi?')) return;
      var self = this;
      S.pb.send('/api/admin/workspaces/' + w.id + '/clear', { method: 'POST' }).then(function (r) {
        toast('Tozalandi: ' + self.label(a) + ' · tuzatishlar ' + r.corrections + ', eksportlar ' + r.exports);
        if (onDone) onDone();
      }).catch(function (e) { toast('Tozalab bo\'lmadi: ' + S.pbErr(e), true); });
    },

    deleteWs: function (w, a, onDone) {
      if (!confirm('Ariza ' + this.label(a) + '\n\nIsh maydoni butunlay o\'chiriladi (fayllar, tuzatishlar, eksportlar). Ariza reyestrda qoladi va qayta ochilishi mumkin. Davom etilsinmi?')) return;
      var self = this;
      S.pb.send('/api/admin/workspaces/' + w.id, { method: 'DELETE' }).then(function () {
        toast('Ish maydoni o\'chirildi: ' + self.label(a));
        if (onDone) onDone();
      }).catch(function (e) { toast('O\'chirib bo\'lmadi: ' + S.pbErr(e), true); });
    },

    deleteApp: function (a, hasWs, onDone) {
      var msg = 'Ariza ' + this.label(a) + '\n\nReyestrdan o\'chiriladi' +
        (hasWs ? ', ish maydoni, fayllar, tuzatishlar va eksportlar bilan birga' : '') +
        '. Keyingi reyestr yuklashda (hisobotda bo\'lsa) qayta paydo bo\'ladi. Davom etilsinmi?';
      if (!confirm(msg)) return;
      S.pb.send('/api/admin/applications/' + a.id, { method: 'DELETE' }).then(function () {
        toast('Ariza № ' + a.number + ' o\'chirildi');
        if (onDone) onDone();
      }).catch(function (e) { toast('O\'chirib bo\'lmadi: ' + S.pbErr(e), true); });
    }
  };

  S.AppAdmin = AppAdmin;
  document.addEventListener('DOMContentLoaded', function () { AppAdmin.init(); });
  if (document.readyState !== 'loading') AppAdmin.init();
})(S);
