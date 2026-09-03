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

  /** Human-readable (Uzbek) message for a failed request. */
  S.pbErr = function (e) {
    if (!e) return 'Noma\'lum xato';
    if (e.status === 0) return 'Server bilan aloqa yo\'q';
    if (e.status === 401 || e.status === 403) return 'Ruxsat yo\'q';
    if (e.status === 404) return 'Topilmadi';
    var d = e.response && e.response.data;
    if (d) {
      var keys = Object.keys(d);
      if (keys.length) return keys[0] + ': ' + (d[keys[0]].message || d[keys[0]].code || 'noto\'g\'ri qiymat');
    }
    return e.message || String(e);
  };
})(S);
