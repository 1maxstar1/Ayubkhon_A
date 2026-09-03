/*
 * Application list (from the registry the admin uploads) and the region
 * choice made when a workspace is opened for the first time.
 */
(function (S) {
  'use strict';

  S.REGIONS = [
    ['respublika', 'Umumrespublika'],
    ['andijon', 'Andijon viloyati'],
    ['buxoro', 'Buxoro viloyati'],
    ['fargona', 'Farg\'ona viloyati'],
    ['jizzax', 'Jizzax viloyati'],
    ['xorazm', 'Xorazm viloyati'],
    ['namangan', 'Namangan viloyati'],
    ['navoiy', 'Navoiy viloyati'],
    ['qashqadaryo', 'Qashqadaryo viloyati'],
    ['samarqand', 'Samarqand viloyati'],
    ['sirdaryo', 'Sirdaryo viloyati'],
    ['surxondaryo', 'Surxondaryo viloyati'],
    ['toshkent_vil', 'Toshkent viloyati'],
    ['qoraqalpogiston', 'Qoraqalpog\'iston Respublikasi'],
    ['toshkent_sh', 'Toshkent shahri']
  ];
  S.regionLabel = function (v) {
    for (var i = 0; i < S.REGIONS.length; i++) if (S.REGIONS[i][0] === v) return S.REGIONS[i][1];
    return v || '';
  };

  // Words that pin a text to a region: RU, UZ Latin and UZ Cyrillic spellings,
  // plus the big cities. Order matters — Tashkent city before Tashkent region.
  var CLUES = [
    ['toshkent_sh', /г\.?\s*ташкент|город ташкент|toshkent sh|тошкент ш|toshkent shahri|тошкент шаҳри/i],
    ['toshkent_vil', /ташкентск|toshkent vil|тошкент вил|toshkent tuman|тошкент тумани/i],
    ['andijon', /андижан|andijon|андижон|asaka|асака|xonobod|хонобод/i],
    ['buxoro', /бухар|buxoro|бухоро|kogon|когон|g'ijduvon|гиждуван/i],
    ['fargona', /ферган|farg.?ona|фарғона|marg.?ilon|маргилан|марғилон|qo.?qon|коканд|қўқон|rishton|риштан|quva\b|кува/i],
    ['jizzax', /джизак|jizzax|жиззах|zomin|заамин|gallaorol|галляарал/i],
    ['xorazm', /хорезм|xorazm|хоразм|urganch|ургенч|урганч|xiva|хива/i],
    ['namangan', /наманган|namangan|наманган|chust|чуст|pop\b|поп\b/i],
    ['navoiy', /навои|navoiy|навоий|zarafshon|зарафшан/i],
    ['qashqadaryo', /кашкадар|qashqadaryo|қашқадарё|qarshi|карши|қарши|shahrisabz|шахрисабз|koson|косон/i],
    ['samarqand', /самарканд|samarqand|самарқанд|kattaqo.?rg|каттакурган|urgut|ургут/i],
    ['sirdaryo', /сырдар|sirdaryo|сирдарё|guliston|гулистан|yangiyer|янгиер/i],
    ['surxondaryo', /сурхандар|surxondaryo|сурхондарё|termiz|термез|denov|денау/i],
    ['qoraqalpogiston', /каракалпак|qoraqalpog|қорақалпоғ|nukus|нукус|нукус/i],
    ['respublika', /общереспубликанск|umumrespublika|республиканск/i]
  ];
  S.suggestRegion = function (app) {
    var texts = [app.place || '', app.project_title || '', app.org_name || ''];
    for (var t = 0; t < texts.length; t++) {
      if (!texts[t]) continue;
      for (var i = 0; i < CLUES.length; i++) if (CLUES[i][1].test(texts[t])) return CLUES[i][0];
    }
    return '';
  };

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
    page: 1, items: [], ws: {}, q: '', work: '',

    init: function () {
      var self = this;
      $('appQ').addEventListener('input', S.debounce(function () { self.q = $('appQ').value.trim(); self.reload(); }, 250));
      $('appWork').addEventListener('change', function () { self.work = this.value; self.render(); });
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
      $('screen-list').style.top = document.querySelector('header.bar').offsetHeight + 'px';
      $('screen-list').hidden = false;
      document.body.classList.add('nows');
      this.reload();
    },
    hide: function () { $('screen-list').hidden = true; document.body.classList.remove('nows'); },

    reload: function () {
      this.page = 1; this.items = [];
      this.load();
    },

    load: function () {
      var self = this;
      var opts = { sort: '-registered_at,-number', expand: 'contragent' };
      if (this.q) {
        opts.filter = S.pb.filter('number ~ {:q} || org_name ~ {:q} || project_title ~ {:q} || inn ~ {:q}', { q: this.q });
      }
      $('appCount').textContent = 'yuklanmoqda…';
      Promise.all([
        S.pb.collection('applications').getList(this.page, PAGE, opts),
        this.page === 1 ? S.pb.collection('workspaces').getFullList({ expand: 'updated_by', fields: 'id,application,status,region,updated,changed,expand.updated_by.name,expand.updated_by.email' }) : null
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
        shown++;
        var who = w && w.expand && w.expand.updated_by ? (w.expand.updated_by.name || w.expand.updated_by.email) : '';
        var work = !w ? '<span class="mute">—</span>' :
          '<span class="ws ' + st + '">' + (st === 'done' ? 'yakunlangan' : 'ishlanmoqda') + '</span>' +
          '<small>' + S.esc(who) + (w.updated ? ' · ' + ago(w.updated) : '') +
          (w.region ? ' · ' + S.esc(S.regionLabel(w.region)) : '') + '</small>';
        return '<tr data-i="' + i + '">' +
          '<td class="mono">' + S.esc(a.number) + '</td>' +
          '<td>' + day(a.registered_at) + '</td>' +
          '<td class="wrap" title="STIR ' + S.esc(a.inn) + '">' + S.esc(a.org_name) + '</td>' +
          '<td class="wrap">' + S.esc(a.project_title) + '</td>' +
          '<td class="num">' + (a.cost_vat ? S.money(a.cost_vat) : '') + (a.currency && !/сум/i.test(a.currency) ? ' ' + S.esc(a.currency) : '') + '</td>' +
          '<td>' + S.esc(a.status) + '</td>' +
          '<td>' + work + '</td>' +
          '<td><button class="btn sm" data-act="open">' + (w ? 'Davom etish' : 'Ochish') + '</button></td></tr>';
      }).join('');
      $('appCount').textContent = shown + ' / ' + (this.total || 0) + ' ariza';
      tb.querySelectorAll('button[data-act=open]').forEach(function (b) {
        b.addEventListener('click', function () { self.open(self.items[+b.closest('tr').dataset.i]); });
      });
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
