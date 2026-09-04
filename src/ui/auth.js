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
  // Mail can take 15-20 minutes to arrive, so the request outlives the page:
  // the pending otpId is kept here and matches users.otp.duration on the server.
  var OTP_MS = 30 * 60 * 1000;
  var PEND = 'smeta-taqqoslash/otp';
  var TRIES = 3;                        // newest requests to try a typed code against

  var Auth = {
    last: Date.now(),
    lastRefresh: Date.now(),
    timer: null,

    init: function () {
      var self = this;
      this.form = document.getElementById('loginForm');
      this.screen = document.getElementById('screen-login');
      this.form.addEventListener('submit', function (e) { e.preventDefault(); self.submit(); });
      document.getElementById('resendBtn').addEventListener('click', function () { self.request(); });
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
      // A code asked for earlier is still good: the letter may only be arriving now.
      var pend = this.pending();
      if (pend) { document.getElementById('loginEmail').value = pend.email; this.askCode(pend.email); }
      else document.getElementById('loginEmail').focus();
    },
    hide: function () { this.screen.hidden = true; },
    reset: function (keepEmail) {
      document.getElementById('codeBox').hidden = true;
      document.getElementById('loginCode').value = '';
      document.getElementById('loginBtn').textContent = 'Отправить код';
      document.getElementById('loginErr').hidden = true;
      if (!keepEmail) document.getElementById('loginEmail').value = '';
    },
    askCode: function (email) {
      document.getElementById('codeBox').hidden = false;
      document.getElementById('loginBtn').textContent = 'Войти';
      document.getElementById('codeHint').textContent =
        'Код отправлен на ' + email + '. Он в теме письма и действует 30 минут; ' +
        'письмо иногда идёт 10\u201320 минут — страницу можно закрыть и вернуться.';
      document.getElementById('loginCode').focus();
    },

    /* ------------------------------------------------- pending requests */
    /** Requests made in the last 30 minutes: {email, list:[{id, at}]} or null. */
    pending: function () {
      var p;
      try { p = JSON.parse(localStorage.getItem(PEND) || 'null'); } catch (e) { return null; }
      if (!p || !p.list || !p.list.length) return null;
      var fresh = p.list.filter(function (x) { return Date.now() - x.at < OTP_MS; });
      if (!fresh.length) { this.forget(); return null; }
      p.list = fresh;
      return p;
    },
    remember: function (email, id) {
      var p = this.pending();
      if (!p || p.email !== email) p = { email: email, list: [] };
      p.list.push({ id: id, at: Date.now() });
      try { localStorage.setItem(PEND, JSON.stringify(p)); } catch (e) { /* private mode */ }
    },
    forget: function () { try { localStorage.removeItem(PEND); } catch (e) { /* private mode */ } },
    error: function (text) {
      var el = document.getElementById('loginErr');
      el.textContent = text; el.hidden = !text;
    },

    submit: function () {
      var email = document.getElementById('loginEmail').value.trim();
      if (!email) return;
      var pend = this.pending();
      if (pend && pend.email === email && !document.getElementById('codeBox').hidden) this.verify();
      else this.request();
    },

    /** Ask the server for a (another) code. */
    request: function () {
      var self = this;
      var email = document.getElementById('loginEmail').value.trim();
      var btn = document.getElementById('loginBtn');
      if (!email) return;
      btn.disabled = true;
      this.error('');
      S.pb.collection('users').requestOTP(email).then(function (r) {
        self.remember(email, r.otpId);
        self.askCode(email);
      }).catch(function (e) {
        self.error('Код не отправлен: ' + S.pbErr(e));
      }).finally(function () { btn.disabled = false; });
    },

    /**
     * A delayed letter means several codes can be in flight, and the one the
     * user types may belong to an earlier request — so try the newest few.
     */
    verify: function () {
      var self = this;
      var btn = document.getElementById('loginBtn');
      var code = document.getElementById('loginCode').value.trim();
      if (code.length < 4) { this.error('Введите код'); return; }
      var pend = this.pending();
      if (!pend) { this.reset(true); this.error('Срок действия кода истёк — запросите новый'); return; }
      var ids = pend.list.slice(-TRIES).reverse();
      var i = 0;
      btn.disabled = true;
      this.error('');
      (function next() {
        if (i >= ids.length) {
          btn.disabled = false;
          self.error('Неверный код или срок его действия истёк');
          return;
        }
        S.pb.collection('users').authWithOTP(ids[i++].id, code).then(function () {
          self.forget();
          btn.disabled = false;
          self.hide();
          self.start();
        }).catch(function (e) {
          if (e && e.status === 400) { next(); return; }   // maybe an earlier request matches
          btn.disabled = false;
          self.error('Не удалось войти: ' + S.pbErr(e));
        });
      })();
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
      if (!S.pb.authStore.isValid) { this.lock('Сессия истекла. Войдите снова.'); return; }
      if (now - this.last > IDLE_MS) { this.lock('4 часа без активности — программа заблокирована. Войдите снова.'); return; }
      if (now - this.lastRefresh > REFRESH_MS) {
        this.lastRefresh = now;
        S.pb.collection('users').authRefresh().catch(function () { /* next tick decides */ });
      }
    },
    lock: function (msg) {
      this.forget();
      S.pb.authStore.clear();
      document.dispatchEvent(new CustomEvent('auth:signedout'));
      this.show(msg);
    },
    signOut: function () { this.lock('Вы вышли из системы.'); },

    render: function () {
      var box = document.getElementById('userBox');
      var me = S.me();
      if (!me) { box.hidden = true; box.innerHTML = ''; return; }
      box.hidden = false;
      var label = me.name || me.email;
      var initial = (label.trim().charAt(0) || '?').toUpperCase();
      box.innerHTML = '<span class="who"><span class="av">' + S.esc(initial) + '</span><span id="who">' + S.esc(label) + '</span></span>' +
        (S.isAdmin() && !/admin\.html$/.test(location.pathname) ? '<a class="btn sm" href="admin.html">Админ</a>' : '') +
        '<button class="btn sm" id="signOut" title="Выйти из системы">Выйти</button>';
      var self = this;
      document.getElementById('signOut').addEventListener('click', function () { self.signOut(); });
    }
  };

  S.Auth = Auth;
  document.addEventListener('DOMContentLoaded', function () { Auth.init(); });
  if (document.readyState !== 'loading') Auth.init();
})(S);
