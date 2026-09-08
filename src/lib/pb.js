/*
 * PocketBase client. Present only in the server build; the offline single-file
 * build has no `PocketBase` global, so S.pb stays undefined and every server
 * feature quietly switches itself off.
 */
(function (S) {
  'use strict';
  if (typeof PocketBase === 'undefined') return;

  // Served from PocketBase itself the origin is the API; opened from disk
  // (developer convenience) fall back to the local dev server.
  var base = /^https?:/.test(location.origin) ? location.origin : 'http://127.0.0.1:8090';
  S.pb = new PocketBase(base);
  S.pb.autoCancellation(false);

  S.me = function () { return S.pb.authStore.record; };
  S.isAdmin = function () {
    var me = S.me();
    return !!(S.pb.authStore.isSuperuser || (me && me.role === 'admin'));
  };

  /*
   * Uploaded estimates and exported comparison documents are private: the
   * record ids they hang on are visible to every signed-in expert, and a file
   * URL that needs nothing else would hand them to anybody who saw one. The
   * file fields are therefore protected, and a short-lived token has to be
   * asked for.
   *
   * One token serves every file on screen. It is kept for a minute — well
   * inside PocketBase's own two — and asked for again after that, so a card
   * left open does not end up with links that quietly stopped working.
   */
  var tok = null, tokAt = 0;
  var TOKEN_MS = 60 * 1000;
  S.fileToken = function () {
    var now = Date.now();
    if (tok && now - tokAt < TOKEN_MS) return tok;
    tokAt = now;
    tok = S.pb.files.getToken().catch(function (e) {
      tok = null;                       // a failure must not be cached
      throw e;
    });
    return tok;
  };
  /** The URL to download `name` from `record`, once a token has been fetched. */
  S.fileURL = function (record, name) {
    return S.fileToken().then(function (t) { return S.pb.files.getURL(record, name, { token: t }); });
  };
  document.addEventListener('auth:signedout', function () { tok = null; tokAt = 0; });

  /** Human-readable (Uzbek) message for a failed request. */
  S.pbErr = function (e) {
    if (!e) return 'Неизвестная ошибка';
    if (e.status === 0) return 'Нет связи с сервером';
    if (e.status === 401 || e.status === 403) return 'Нет доступа';
    if (e.status === 404) return 'Не найдено';
    var d = e.response && e.response.data;
    if (d) {
      var keys = Object.keys(d);
      if (keys.length) return keys[0] + ': ' + (d[keys[0]].message || d[keys[0]].code || 'неверное значение');
    }
    return e.message || String(e);
  };
})(S);
