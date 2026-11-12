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
   * One token serves every file on screen. PocketBase gives it three minutes
   * (measured); it is kept here for one, so whatever is handed out has at
   * least two minutes left in it.
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

  /**
   * Point a link at a file.
   *
   * The address is filled in as soon as a token arrives, so the link looks and
   * reads like a link. But a file token lives three minutes and an application
   * card stays open for as long as somebody is reading it, so pressing the
   * link asks for the address again rather than following the one baked in
   * when the card was drawn — otherwise a card open for five minutes hands out
   * a 404 with nothing to explain it. A link that cannot be signed at all says
   * so instead of leading nowhere.
   */
  S.fileLink = function (el, record, name) {
    function dead() {
      el.removeAttribute('href');
      el.title = 'Ссылка недоступна — обновите страницу';
    }
    S.fileURL(record, name).then(function (u) { el.href = u; }).catch(dead);
    el.addEventListener('click', function (e) {
      e.preventDefault();
      S.fileURL(record, name).then(function (u) { el.href = u; location.href = u; }).catch(dead);
    });
  };
  document.addEventListener('auth:signedout', function () { tok = null; tokAt = 0; });

  /*
   * Human-readable (Russian) message for a failed request.
   *
   * PocketBase answers in English — «email: Value must be unique.», «Failed to create record.» — and the interface
   * is Russian. A field error is told with the field's Russian name and what is wrong with it; a hook's own text,
   * which is Russian, is passed on; anything else in English becomes a plain sentence with the code, and the
   * English goes to the console for whoever looks into it. test/pb-err.cjs.
   */
  var FIELD = {
    email: 'Эл. почта', name: 'Имя', number: 'Номер заявки', inn: 'ИНН', region: 'Регион', role: 'Роль',
    org_name: 'Организация', project_title: 'Название объекта', status: 'Статус', file: 'Файл', note: 'Примечание'
  };
  var CODE = [
    [/not_unique/, 'такое значение уже есть'],
    [/required|nil_or_not_empty|empty/, 'не заполнено'],
    [/email/, 'неверный адрес почты'],
    [/too_short|min_text|min_length/, 'слишком короткое'],
    [/length|too_long|max_text/, 'слишком длинное'],
    [/file_size|size_limit/, 'файл слишком велик'],
    [/mime/, 'файл не того типа']
  ];
  var CYR = /[А-Яа-яЁё]/;
  function fieldText(name, item) {
    var code = String(item && (item.code || item.message) || ''), what = 'неверное значение';
    for (var i = 0; i < CODE.length; i++) if (CODE[i][0].test(code)) { what = CODE[i][1]; break; }
    if (item && item.message && CYR.test(item.message)) what = item.message;   // a hook named it already
    if (name === 'email' && /not_unique/.test(code)) {
      return 'Пользователь с такой почтой уже есть — найдите его в списке (если отключён, нажмите «Включить»)';
    }
    return FIELD[name] ? FIELD[name] + ': ' + what : what;
  }
  S.pbErr = function (e) {
    if (!e) return 'Неизвестная ошибка';
    if (e.status === 0) return 'Нет связи с сервером';
    var d = e.response && e.response.data;
    var keys = d && typeof d === 'object' ? Object.keys(d) : [];
    if (keys.length && e.status === 400) return fieldText(keys[0], d[keys[0]]);
    var msg = String(e.message || (e.response && e.response.message) || '');
    if (typeof e.status !== 'number') return msg || String(e);   // not a server answer: an error of our own
    if (CYR.test(msg)) return msg;                                // the hooks speak Russian
    if (msg && typeof console !== 'undefined') console.warn('server said', e.status, msg);
    if (e.status === 401 || e.status === 403) return 'Нет доступа';
    if (e.status === 404) return 'Не найдено';
    if (e.status === 429) return 'Слишком много запросов подряд — подождите несколько секунд';
    return 'Сервер отклонил запрос (код ' + e.status + ')';
  };
})(S);
