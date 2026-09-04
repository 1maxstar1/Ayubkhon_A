/*
 * Application list (from the registry the admin uploads) and the region
 * choice made when a workspace is opened for the first time.
 * Region names and the text clues live in lib/regions.js.
 */
(function (S) {
  'use strict';

  if (!S.pb) return;

  var PAGE = 50;

  function $(id) { return document.getElementById(id); }
  function day(d) {
    if (!d) return '';
    var x = new Date(d);
    return isNaN(x) ? '' : x.toLocaleDateString('ru-RU');
  }
  function ago(d) {
    var ms = Date.now() - new Date(d).getTime();
    var m = Math.round(ms / 60000);
    if (m < 60) return m + ' daqiqa oldin';
    if (m < 48 * 60) return Math.round(m / 60) + ' soat oldin';
    return day(d);
  }

  var Registry = {
    page: 1, items: [], ws: {}, q: '', work: '', region: '', year: '', type: '', buyer: '', status: '', min: '', max: '',
    facets: null,

    init: function () {
      var self = this;
      $('appQ').addEventListener('input', S.debounce(function () { self.q = $('appQ').value.trim(); self.reload(); }, 250));
      $('appWork').addEventListener('change', function () { self.work = this.value; self.render(); });
      $('appRegion').addEventListener('change', function () { self.region = this.value; self.render(); });
      $('appYear').addEventListener('change', function () { self.year = this.value; self.reload(); });
      // filters on the registry's highlighted columns — all server-side
      $('appType').addEventListener('change', function () { self.type = this.value; self.reload(); });
      $('appBuyer').addEventListener('change', function () { self.buyer = this.value; self.reload(); });
      $('appStatus').addEventListener('change', function () { self.status = this.value; self.reload(); });
      var money = S.debounce(function () { self.min = $('appMin').value; self.max = $('appMax').value; self.reload(); }, 350);
      $('appMin').addEventListener('input', money);
      $('appMax').addEventListener('input', money);
      $('appClear').addEventListener('click', function () { self.clearFilters(); });
      $('appRegion').innerHTML += S.REGIONS.map(function (r) { return '<option value="' + r[0] + '">' + S.esc(r[1]) + '</option>'; }).join('');
      var y = new Date().getFullYear();
      for (var i = y; i >= y - 6; i--) $('appYear').innerHTML += '<option value="' + i + '">' + i + '</option>';
      $('cardClose').addEventListener('click', function () { $('screen-card').hidden = true; });
      $('screen-card').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });
      $('appMore').addEventListener('click', function () { self.page++; self.load(); });
      $('regionForm').addEventListener('submit', function (e) { e.preventDefault(); self.createWorkspace(); });
      $('regionBack').addEventListener('click', function () { $('screen-region').hidden = true; self.show(); });
      $('regionSel').innerHTML = '<option value="">— tanlang —</option>' + S.REGIONS.map(function (r) {
        return '<option value="' + r[0] + '">' + S.esc(r[1]) + '</option>';
      }).join('');
      document.addEventListener('auth:signedin', function () { if (!S.Sync || !S.Sync.ws) self.show(); });
      // Auth may already have fired the event before this module registered.
      if (S.pb.authStore.isValid) this.show();
    },

    show: function () {
      // The list sits under the top bar so the user box (name, sign-out) stays reachable;
      // the file / export controls only make sense inside a workspace.
      document.body.classList.add('nows');   // before measuring: hides the file buttons, so the bar is one row
      this.fit();
      $('screen-list').hidden = false;
      if (!this.fitBound) { this.fitBound = true; window.addEventListener('resize', this.fit); }
      this.loadFacets();
      this.reload();
    },
    fit: function () { $('screen-list').style.top = document.querySelector('header.bar').offsetHeight + 'px'; },

    clearFilters: function () {
      ['appQ', 'appWork', 'appRegion', 'appYear', 'appType', 'appBuyer', 'appStatus', 'appMin', 'appMax'].forEach(function (id) { $(id).value = ''; });
      this.q = this.work = this.region = this.year = this.type = this.buyer = this.status = this.min = this.max = '';
      this.reload();
    },

    /** Distinct values of the categorical columns (one cheap server query). */
    loadFacets: function () {
      var self = this;
      S.pb.send('/api/registry/facets', { method: 'GET' }).then(function (f) {
        self.facets = f;
        fill('appType', f.expertise_type, self.type);
        fill('appBuyer', f.buyer_type, self.buyer);
        fill('appStatus', f.status, self.status);
      }).catch(function () { /* menus stay empty; the search box still works */ });
      function fill(id, list, cur) {
        var sel = $(id), first = sel.options[0].outerHTML;
        sel.innerHTML = first + (list || []).map(function (x) {
          var label = x.v.length > 70 ? x.v.slice(0, 68) + '…' : x.v;
          return '<option value="' + S.esc(x.v) + '" title="' + S.esc(x.v) + '">' + S.esc(label) + ' (' + x.n + ')</option>';
        }).join('');
        sel.value = cur;
      }
    },
    hide: function () { $('screen-list').hidden = true; document.body.classList.remove('nows'); },

    reload: function () {
      this.page = 1; this.items = [];
      this.load();
    },

    load: function () {
      var self = this;
      var opts = { sort: '-registered_at,-number', expand: 'contragent' };
      var parts = [], params = {};
      if (this.q) { parts.push('(number ~ {:q} || org_name ~ {:q} || project_title ~ {:q} || inn ~ {:q} || object_id ~ {:q})'); params.q = this.q; }
      if (this.year) {
        parts.push('registered_at >= {:y0} && registered_at < {:y1}');
        params.y0 = this.year + '-01-01 00:00:00'; params.y1 = (+this.year + 1) + '-01-01 00:00:00';
      }
      if (this.type) { parts.push('expertise_type = {:t}'); params.t = this.type; }
      if (this.buyer) { parts.push('buyer_type = {:b}'); params.b = this.buyer; }
      if (this.status) { parts.push('status = {:s}'); params.s = this.status; }
      if (this.min !== '' && !isNaN(+this.min)) { parts.push('cost_vat >= {:lo}'); params.lo = +this.min; }
      if (this.max !== '' && !isNaN(+this.max)) { parts.push('cost_vat <= {:hi}'); params.hi = +this.max; }
      if (parts.length) opts.filter = S.pb.filter(parts.join(' && '), params);
      $('appCount').textContent = 'yuklanmoqda…';
      Promise.all([
        S.pb.collection('applications').getList(this.page, PAGE, opts),
        this.page === 1 ? S.pb.collection('workspaces').getFullList({ expand: 'updated_by', fields: 'id,application,status,region,updated,changed,files,collectionId,collectionName,expand.updated_by.name,expand.updated_by.email' }) : null
      ]).then(function (res) {
        var list = res[0];
        if (res[1]) {
          self.ws = {};
          res[1].forEach(function (w) { self.ws[w.application] = w; });
        }
        self.items = self.items.concat(list.items);
        self.total = list.totalItems;
        $('appMore').hidden = self.items.length >= list.totalItems;
        self.render();
      }).catch(function (e) {
        $('appCount').textContent = S.pbErr(e);
      });
    },

    render: function () {
      var self = this;
      var tb = $('appTable').querySelector('tbody');
      var shown = 0;
      tb.innerHTML = this.items.map(function (a, i) {
        var w = self.ws[a.id];
        var st = w ? w.status : 'none';
        if (self.work && st !== self.work) return '';
        if (self.region && (!w || w.region !== self.region)) return '';
        shown++;
        var who = w && w.expand && w.expand.updated_by ? (w.expand.updated_by.name || w.expand.updated_by.email) : '';
        var work = !w ? '<span class="mute">—</span>' :
          '<span class="ws ' + st + '">' + (st === 'done' ? 'yakunlangan' : 'ishlanmoqda') + '</span>' +
          '<small>' + S.esc(who) + (w.updated ? ' · ' + ago(w.updated) : '') +
          (w.region ? ' · ' + S.esc(S.regionLabel(w.region)) : '') + '</small>';
        return '<tr data-i="' + i + '">' +
          '<td class="mono"><button class="link num" data-act="card" title="Ariza kartochkasi">' + S.esc(a.number) + '</button></td>' +
          '<td>' + day(a.registered_at) + '</td>' +
          '<td class="wrap">' + S.esc(a.org_name) + (a.inn ? '<small>STIR ' + S.esc(a.inn) + '</small>' : '') + '</td>' +
          '<td class="wrap">' + S.esc(a.project_title) + (a.object_id ? '<small>ID ' + S.esc(a.object_id) + '</small>' : '') + '</td>' +
          '<td class="dim">' + S.esc(a.expertise_type || '') + (a.buyer_type ? '<small>' + S.esc(a.buyer_type) + '</small>' : '') + '</td>' +
          '<td class="num">' + (a.cost_vat ? S.money(a.cost_vat) : '') + (a.currency && !/сум/i.test(a.currency) ? ' ' + S.esc(a.currency) : '') + '</td>' +
          '<td>' + S.esc(a.status) + '</td>' +
          '<td>' + work + '</td>' +
          '<td><button class="btn sm ' + (w ? 'ok' : 'cyan') + '" data-act="open">' + (w ? 'Davom etish' : 'Ochish') + '</button></td></tr>';
      }).join('');
      $('appCount').textContent = shown + ' / ' + (this.total || 0) + ' ariza';
      tb.querySelectorAll('button[data-act=open]').forEach(function (b) {
        b.addEventListener('click', function () { self.open(self.items[+b.closest('tr').dataset.i]); });
      });
      tb.querySelectorAll('button[data-act=card]').forEach(function (b) {
        b.addEventListener('click', function () { self.card(self.items[+b.closest('tr').dataset.i]); });
      });
    },

    /* ------------------------------------------------------------- card */
    card: function (a) {
      var self = this;
      var w = this.ws[a.id];
      var c = a.expand && a.expand.contragent;
      $('cardTitle').textContent = 'Ariza № ' + a.number;
      var rows = [
        ['Holat', a.status], ['Ro\'yxatga olingan', day(a.registered_at)], ['To\'langan', day(a.paid_at)],
        ['Kontragent', (c ? c.name : a.org_name) + (a.inn ? ' · STIR ' + a.inn : '')],
        ['Loyiha', a.project_title], ['Obyekt ID', a.object_id],
        ['Ekspertiza turi', a.expertise_type], ['Buyurtmachi turi', a.buyer_type],
        ['Summa (НДСsiz)', a.cost ? S.money(a.cost) : ''], ['Summa (НДС bilan)', a.cost_vat ? S.money(a.cost_vat) : ''],
        ['Valyuta', a.currency], ['Ekspert', a.expert], ['Soekspert', a.coexpert],
        ['Joy (reyestr)', a.place], ['Soha', a.branch],
        ['Mas\'ul ijrochi', [a.executor_name, a.executor_email, a.executor_phone].filter(Boolean).join(' · ')]
      ];
      Object.keys(a.raw || {}).forEach(function (k) { if (a.raw[k]) rows.push([k, a.raw[k]]); });
      $('cardFields').innerHTML = rows.filter(function (r) { return r[1]; }).map(function (r) {
        return '<dt>' + S.esc(r[0]) + '</dt><dd>' + S.esc(String(r[1])) + '</dd>';
      }).join('');
      var who = w && w.expand && w.expand.updated_by ? (w.expand.updated_by.name || w.expand.updated_by.email) : '';
      $('cardWork').textContent = !w ? 'Hali boshlanmagan.' :
        (w.status === 'done' ? 'Yakunlangan' : 'Ishlanmoqda') + ' · ' + S.regionLabel(w.region) +
        (who ? ' · oxirgi: ' + who + ', ' + ago(w.updated) : '') + (w.changed ? ' · ' + w.changed + ' ta narx o\'zgartirilgan' : '');
      $('cardExports').innerHTML = '<li class="mute">yuklanmoqda…</li>';
      $('cardFiles').innerHTML = w && w.files && w.files.length
        ? w.files.map(function (f) { return '<li><a href="' + S.pb.files.getURL(w, f) + '">' + S.esc(f.replace(/_[a-z0-9]{10}(\.[a-z]+)$/i, '$1')) + '</a></li>'; }).join('')
        : '<li class="mute">yo\'q</li>';
      $('cardOpen').onclick = function () { $('screen-card').hidden = true; self.open(a); };
      $('cardOpen').textContent = w ? 'Davom etish' : 'Ochish';
      $('screen-card').hidden = false;
      S.pb.collection('exports').getFullList({ filter: S.pb.filter('application = {:a}', { a: a.id }), sort: '-created', expand: 'by' })
        .then(function (list) {
          $('cardExports').innerHTML = list.length ? list.map(function (x) {
            var by = x.expand && x.expand.by;
            return '<li><a href="' + S.pb.files.getURL(x, x.file) + '">' + S.esc(x.file.replace(/_[a-z0-9]{10}(\.[a-z]+)$/i, '$1')) + '</a>' +
              '<small>' + day(x.created) + (by ? ' · ' + S.esc(by.name || by.email) : '') + (x.mode ? ' · ' + S.esc(x.mode) : '') + '</small></li>';
          }).join('') : '<li class="mute">hali eksport qilinmagan</li>';
        }).catch(function (e) { $('cardExports').innerHTML = '<li class="mute">' + S.esc(S.pbErr(e)) + '</li>'; });
    },

    /* ------------------------------------------------------------- open */
    open: function (a) {
      var self = this;
      var w = this.ws[a.id];
      if (w) {
        S.pb.collection('workspaces').getOne(w.id, { expand: 'updated_by' }).then(function (full) {
          self.hide();
          S.Sync.open(full, a);
        }).catch(function (e) { window.app.toast(S.pbErr(e), true); });
        return;
      }
      this.pendingApp = a;
      var c = a.expand && a.expand.contragent;
      $('regionTitle').textContent = 'Ariza № ' + a.number;
      $('regionLead').textContent = (c ? c.name : a.org_name) + (a.inn ? ' · STIR ' + a.inn : '') +
        (a.project_title ? '\n' + a.project_title : '');
      var sug = S.suggestRegion(a);
      $('regionSel').value = sug;
      $('regionHint').textContent = sug ? 'Taklif: ' + S.regionLabel(sug) + ' — ariza matnidan aniqlandi, tekshiring.' :
        'Ariza matnida viloyat topilmadi — o\'zingiz tanlang.';
      $('regionErr').hidden = true;
      this.hide();
      $('screen-region').hidden = false;
    },

    createWorkspace: function () {
      var self = this;
      var a = this.pendingApp;
      var region = $('regionSel').value;
      if (!region) { $('regionErr').textContent = 'Viloyatni tanlang'; $('regionErr').hidden = false; return; }
      S.pb.collection('workspaces').create({
        application: a.id, region: region, status: 'in_progress', changed: 0,
        opened_by: S.me().id, updated_by: S.me().id, state: {}
      }, { expand: 'updated_by' }).then(function (w) {
        $('screen-region').hidden = true;
        S.Sync.open(w, a);
      }).catch(function (e) {
        if (e && e.status === 400) {           // someone opened it a moment ago: reuse theirs
          return S.pb.collection('workspaces').getFirstListItem('application="' + a.id + '"', { expand: 'updated_by' })
            .then(function (w) { $('screen-region').hidden = true; S.Sync.open(w, a); });
        }
        $('regionErr').textContent = S.pbErr(e); $('regionErr').hidden = false;
      });
    }
  };

  S.Registry = Registry;
  document.addEventListener('DOMContentLoaded', function () { Registry.init(); });
  if (document.readyState !== 'loading') Registry.init();
})(S);
