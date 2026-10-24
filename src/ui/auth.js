/*
 * Sign-in with email + one-time code, and the four-hour idle lock.
 * Nothing here runs without S.pb (offline build).
 */
(function (S) {
  'use strict';
  if (!S.pb) return;

  var IDLE_MS = 4 * 60 * 60 * 1000;     // lock after this much inactivity
  // How often the token is renewed while somebody is working. It is also how
  // long a session outlives the account behind it: «Отключить» is enforced by
  // the collection's own rule (active = true), which is only consulted when a
  // token is issued or renewed. Five minutes is short enough that switching an
  // expert off takes effect while the administrator is still looking at the
  // screen, and one request per person per five minutes costs nothing.
  var REFRESH_MS = 5 * 60 * 1000;
  var LOCK_SAVE_MS = 5000;              // how long a sign-out waits for the last save
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
    refused: {},        // "otpId|code" pairs the server has already turned down
    laptop: false,      // one person on their own computer: no login, no lock

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
      ['focus', 'visibilitychange'].forEach(function (t) {
        (t === 'focus' ? window : document).addEventListener(t, function () {
          if (self.laptop && !S.pb.authStore.isValid) self.autoSignIn();
        });
      });
      this.autoSignIn().then(function (r) {
        if (r === true) return;
        if (S.pb.authStore.isValid) { self.start(); return; }
        self.show('');
        self.explain(r);
      });
    },

    /**
     * Why the login screen is up on a laptop at all. On this computer's own
     * address and for any reason but the login having been switched back on,
     * the screen says what went wrong — so that a screenshot of it is a
     * diagnosis, not just a question. Anywhere else it says nothing.
     */
    explain: function (why) {
      if (!/^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname)) return;
      if (!why || why === 'autologin-off') return;
      var RU = {
        'not-laptop': 'сервер на этом компьютере запущен не через laptop.cmd',
        'no-email': 'не указана учётная запись',
        'no-user': 'учётная запись не найдена',
        'inactive': 'учётная запись отключена',
        'not-own-page': 'запрос пришёл не со страницы программы'
      };
      this.error('Автовход не сработал: ' + (RU[why] || why) +
        '. Запустите laptop.cmd doctor и пришлите результат.');
    },

    /**
     * On one person's own computer there is no sign-in: the local server hands
     * the page that person's session (/api/laptop/signin, which only
     * server/laptop.sh and laptop.ps1 switch on, and which only answers this
     * program's own page). The account, the rules and the record of who
     * priced what are all still there, so the login comes back unchanged
     * wherever the switch is off — an office network, a VPS.
     *
     * Anywhere else the route is not there, the request fails, and the page
     * goes on as it always has. Also asked again whenever the session runs
     * out on a laptop — after a night asleep the token has expired, and the
     * answer to that on a laptop is a new one, not a login screen.
     */
    autoSignIn: function () {
      var self = this;
      return fetch(S.pb.baseUrl + '/api/laptop/signin', { method: 'POST' })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (r.ok && j && j.token) return j;
            // the server's reason ("Not-laptop."), or the status when there is none
            var why = String((j && j.message) || '').toLowerCase().replace(/[^a-z-]/g, '');
            return why || ('http-' + r.status);
          });
        })
        .then(function (j) {
          if (typeof j === 'string') return j;
          self.laptop = true;
          self.last = self.lastRefresh = Date.now();
          S.pb.authStore.save(j.token, j.record);
          self.hide();
          if (!self.timer) self.start(); else self.render();
          return true;
        })
        .catch(function (e) { return 'network: ' + (e && e.message || e); });
    },

    /* ---------------------------------------------------------- screens */
    show: function (msg) {
      this.reset(false);
      if (msg) document.getElementById('loginMsg').textContent = msg;
      this.screen.hidden = false;
      // A code asked for earlier is still good: the letter may only be arriving now.
      var pend = this.pending();
      if (pend) {
        document.getElementById('loginEmail').value = pend.email;
        this.askCode(pend.email);
        this.autoFill(pend.list[pend.list.length - 1].id);
      } else document.getElementById('loginEmail').focus();
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

    /**
     * The code, when the program is running on this same computer.
     *
     * One person on their own laptop has no mail server and no reason to run
     * one, so the code is not emailed at all — it is written beside the
     * database, and the local server hands it back here (/api/laptop/otp,
     * which server/laptop.sh turns on and which only answers this machine).
     * Without it the code would have to be read out of a terminal window
     * every morning.
     *
     * A real server never answers that route, so the request fails and
     * nothing happens: the code is in the mail, where the hint already says
     * it is. Asked twice because the file is written while the request that
     * creates the code is still being answered.
     */
    autoFill: function (otpId) {
      var self = this, tries = 0;
      function ask() {
        fetch(S.pb.baseUrl + '/api/laptop/otp?id=' + encodeURIComponent(otpId))
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            if (j && j.code) {
              document.getElementById('loginCode').value = j.code;
              document.getElementById('codeHint').textContent =
                'Код подставлен автоматически: программа работает на этом компьютере.';
              self.verify();
            } else if (++tries < 2) setTimeout(ask, 400);
          })
          .catch(function () { /* a server: the code went by mail */ });
      }
      ask();
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
    forget: function () {
      this.refused = {};
      try { localStorage.removeItem(PEND); } catch (e) { /* private mode */ }
    },
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
        self.autoFill(r.otpId);
      }).catch(function (e) {
        self.error('Код не отправлен: ' + S.pbErr(e));
      }).finally(function () { btn.disabled = false; });
    },

    /**
     * A delayed letter means several codes can be in flight, and the one the
     * user types may belong to an earlier request — so try the newest few,
     * newest first.
     *
     * Each of those is a sign-in attempt as far as the server is concerned,
     * and it allows four every three seconds. Three ids tried for one typed
     * code therefore left room for barely one more attempt, so a single
     * mistyped digit could lock somebody out of their own program. Two things
     * keep that from happening: a pair already refused is never sent again, so
     * pressing the button twice with the same code costs nothing, and a
     * refusal for being too quick stops the loop instead of spending what is
     * left of the allowance.
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
        var id = ids[i++].id, pair = id + '|' + code;
        if (self.refused[pair]) { next(); return; }        // already answered, do not ask again
        S.pb.collection('users').authWithOTP(id, code).then(function () {
          self.refused = {};
          self.forget();
          btn.disabled = false;
          self.hide();
          self.start();
        }).catch(function (e) {
          if (e && e.status === 429) {
            btn.disabled = false;
            self.error('Слишком много попыток подряд — подождите несколько секунд');
            return;
          }
          if (e && e.status === 400) { self.refused[pair] = 1; next(); return; }   // maybe an earlier request matches
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
      var self = this, now = Date.now();
      if (!this.timer) return;              // the session is over; there is nothing to watch
      if (!S.pb.authStore.isValid) {
        if (this.laptop) { this.autoSignIn(); return; }
        this.lock('Сессия истекла. Войдите снова.');
        return;
      }
      // No idle lock on a laptop: the computer's own screen lock is the lock.
      if (!this.laptop && now - this.last > IDLE_MS) { this.lock('4 часа без активности — программа заблокирована. Войдите снова.'); return; }
      if (now - this.lastRefresh > REFRESH_MS) {
        this.lastRefresh = now;
        S.pb.collection('users').authRefresh().catch(function (e) {
          // Refusal is the only signal the page gets that the account has been
          // turned off: the server ends the sessions the moment «Отключить» is
          // pressed, but the token in the browser is still unexpired, so
          // nothing else here would notice. Anything other than a refusal is a
          // network hiccup — the next tick decides.
          if (e && (e.status === 401 || e.status === 403)) {
            if (self.laptop) self.autoSignIn();
            else self.lock('Доступ к программе закрыт. Обратитесь к администратору.');
          }
        });
      }
    },
    /**
     * End the session — by the sign-out button, by the idle timer, or because
     * the token expired.
     *
     * The workspace has to be left as part of this, and in this order. An open
     * workspace belongs to whoever opened it, and the registry screen only
     * appears when none is open; leaving one behind meant the next person to
     * sign in on a shared computer landed inside the previous expert's work.
     * The login screen goes up first so nothing is readable while the save
     * finishes, and the token is only cleared afterwards, because saving needs
     * it. If the save cannot finish quickly the session is cleared anyway —
     * locking late is worse than losing the last few seconds of typing.
     */
    lock: function (msg) {
      var self = this;
      // The idle watch stops with the session. Left running, it fired every
      // minute over the login screen — the store is no longer valid, so it
      // locked again, and lock() clears the code field: an expert typing in
      // the code from an e-mail that «иногда идёт 10-20 минут» had it wiped
      // under their fingers, once a minute, for as long as they kept trying.
      clearInterval(this.timer);
      this.timer = null;
      this.show(msg);
      var leaving = (S.Sync && S.Sync.ws) ? S.Sync.close(true) : null;
      var settled = Promise.resolve(leaving).catch(function (e) {
        console.error('sync: could not close the workspace on sign-out', e);
      });
      Promise.race([settled, new Promise(function (r) { setTimeout(r, LOCK_SAVE_MS); })])
        .then(function () {
          self.forget();
          S.pb.authStore.clear();
          document.dispatchEvent(new CustomEvent('auth:signedout'));
        });
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
        // Signing out of a laptop that signs you straight back in means nothing.
        (this.laptop ? '' : '<button class="btn sm" id="signOut" title="Выйти из системы">Выйти</button>');
      var self = this;
      var out = document.getElementById('signOut');
      if (out) out.addEventListener('click', function () { self.signOut(); });
    }
  };

  S.Auth = Auth;
  document.addEventListener('DOMContentLoaded', function () { Auth.init(); });
  if (document.readyState !== 'loading') Auth.init();
})(S);
