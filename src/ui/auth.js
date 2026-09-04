/*
 * Sign-in with email + one-time code, and the four-hour idle lock.
 * Nothing here runs without S.pb (offline build).
 */
(function (S) {
  'use strict';
  if (!S.pb) return;

  var IDLE_MS = 4 * 60 * 60 * 1000;     // lock after this much inactivity
  var REFRESH_MS = 20 * 60 * 1000;      // extend the token while the user is active
  var TICK_MS = 60 * 1000;

  var Auth = {
    otpId: null,
    last: Date.now(),
    lastRefresh: Date.now(),
    timer: null,

    init: function () {
      var self = this;
      this.form = document.getElementById('loginForm');
      this.screen = document.getElementById('screen-login');
      this.form.addEventListener('submit', function (e) { e.preventDefault(); self.submit(); });
      document.getElementById('resendBtn').addEventListener('click', function () { self.reset(true); self.submit(); });
      ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function (t) {
        document.addEventListener(t, function () { self.last = Date.now(); }, { passive: true });
      });
      S.pb.authStore.onChange(function () { self.render(); });
      if (S.pb.authStore.isValid) this.start(); else this.show('');
    },

    /* ---------------------------------------------------------- screens */
    show: function (msg) {
      this.reset(false);
      if (msg) document.getElementById('loginMsg').textContent = msg;
      this.screen.hidden = false;
      document.getElementById('loginEmail').focus();
    },
    hide: function () { this.screen.hidden = true; },
    reset: function (keepEmail) {
      this.otpId = null;
      document.getElementById('codeBox').hidden = true;
      document.getElementById('loginCode').value = '';
      document.getElementById('loginBtn').textContent = 'Kod yuborish';
      document.getElementById('loginErr').hidden = true;
      if (!keepEmail) document.getElementById('loginEmail').value = '';
    },
    error: function (text) {
      var el = document.getElementById('loginErr');
      el.textContent = text; el.hidden = !text;
    },

    submit: function () {
      var self = this;
      var email = document.getElementById('loginEmail').value.trim();
      var btn = document.getElementById('loginBtn');
      if (!email) return;
      btn.disabled = true;
      this.error('');
      if (!this.otpId) {
        S.pb.collection('users').requestOTP(email).then(function (r) {
          self.otpId = r.otpId;
          document.getElementById('codeBox').hidden = false;
          btn.textContent = 'Kirish';
          document.getElementById('loginCode').focus();
        }).catch(function (e) {
          self.error('Kod yuborilmadi: ' + S.pbErr(e));
        }).finally(function () { btn.disabled = false; });
        return;
      }
      var code = document.getElementById('loginCode').value.trim();
      if (code.length < 4) { btn.disabled = false; this.error('Kodni kiriting'); return; }
      S.pb.collection('users').authWithOTP(this.otpId, code).then(function () {
        self.hide();
        self.start();
      }).catch(function (e) {
        var s = e && e.status;
        self.error(s === 400 ? 'Kod noto\'g\'ri yoki muddati o\'tgan' : 'Kirib bo\'lmadi: ' + S.pbErr(e));
      }).finally(function () { btn.disabled = false; });
    },

    /* ---------------------------------------------------------- session */
    start: function () {
      var self = this;
      this.last = this.lastRefresh = Date.now();
      this.render();
      if (!this.timer) this.timer = setInterval(function () { self.tick(); }, TICK_MS);
      document.dispatchEvent(new CustomEvent('auth:signedin', { detail: S.me() }));
    },
    tick: function () {
      var now = Date.now();
      if (!S.pb.authStore.isValid) { this.lock('Sessiya muddati tugadi. Qayta kiring.'); return; }
      if (now - this.last > IDLE_MS) { this.lock('4 soat davomida faoliyat bo\'lmadi — dastur qulflandi. Qayta kiring.'); return; }
      if (now - this.lastRefresh > REFRESH_MS) {
        this.lastRefresh = now;
        S.pb.collection('users').authRefresh().catch(function () { /* next tick decides */ });
      }
    },
    lock: function (msg) {
      S.pb.authStore.clear();
      document.dispatchEvent(new CustomEvent('auth:signedout'));
      this.show(msg);
    },
    signOut: function () { this.lock('Tizimdan chiqdingiz.'); },

    render: function () {
      var box = document.getElementById('userBox');
      var me = S.me();
      if (!me) { box.hidden = true; box.innerHTML = ''; return; }
      box.hidden = false;
      var label = me.name || me.email;
      var initial = (label.trim().charAt(0) || '?').toUpperCase();
      box.innerHTML = '<span class="who"><span class="av">' + S.esc(initial) + '</span><span id="who">' + S.esc(label) + '</span></span>' +
        (S.isAdmin() && !/admin\.html$/.test(location.pathname) ? '<a class="btn sm" href="admin.html">Admin</a>' : '') +
        '<button class="btn sm" id="signOut" title="Tizimdan chiqish">Chiqish</button>';
      var self = this;
      document.getElementById('signOut').addEventListener('click', function () { self.signOut(); });
    }
  };

  S.Auth = Auth;
  document.addEventListener('DOMContentLoaded', function () { Auth.init(); });
  if (document.readyState !== 'loading') Auth.init();
})(S);
