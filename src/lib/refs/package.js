/*
 * Reference price packages: the format, its limits and its validator. No dependencies: the admin page loads this
 * file alone (with util.js) to check a package before it uploads it; the worker and the tests load it too.
 *
 *   S.refs.pkg.FORMAT, VERSION, FIELDS, LIMITS, FLAGS_READ, ATTRS_READ, SECTIONS, REGIONS, BASIS
 *   S.refs.pkg.sha256(bytes) → hex                       pure JS (crypto.subtle is absent on plain-HTTP pages)
 *   S.refs.pkg.sha256Stream() → { update(bytes), hex() } the same, in slices
 *   S.refs.pkg.checkDecoded(textLength, byteLength) → null | message
 *   S.refs.pkg.validate(obj, { bytes }) → { ok, errors: [{ row, field, msg }], rows, sources }
 *   S.refs.pkg.validateAsync(obj, { bytes, progress, slice }, done)   the same in slices (default 20k rows)
 *   S.refs.pkg.manifest(obj) → the package head without rows (stored next to the file on the server)
 *   S.refs.pkg.rowsOf(obj) → [{ rid, name, … }]          rows as objects (missing trailing fields = null)
 *
 * Format «smeta-refs» version 1 (docs/spravochnik.md): one JSON object, gzipped —
 *   { format, version, full: true, package_id, created, tool, rid_min, rid_max, counts: { records, sources },
 *     date_min, date_max, sources: [{ id, doc_type, issuer, customer, doc_no, issue_date, as_of_date, region,
 *     ships_nationally, vat_default, method }], fields: FIELDS, rows: [[…], …] }
 * Prices are UZS without VAT per `unit`. Trailing nulls of a row may be dropped. Error messages are Russian (they
 * are shown on the admin page) and never quote a value of the package: a row number, a field name and what is wrong.
 */
var S = (typeof S !== 'undefined' && S) || {};
(function (S) {
  'use strict';
  var R = S.refs = S.refs || {};

  var FIELDS = ['rid', 'name', 'name_raw', 'unit', 'unit_raw', 'section', 'price', 'price_date', 'avail', 'avail_src',
    'region', 'src', 'group', 'basis', 'delivery', 'plant', 'code', 'flags', 'attrs'];
  var MB = 1024 * 1024;
  var LIMITS = { gzip: 50 * MB, bytes: 500 * MB, rows: 2 * 1000 * 1000, sources: 10 * 1000, name: 1000, text: 300, short: 40,
    manifest: MB };
  /* the record flags and item-data attributes the engine reads; a package carries no others */
  var FLAGS_READ = ['forward', 'vat_inferred', 'non_construction', 'merge:excludes_pipe_cost', 'merge:checker_dup_of_forward_trade'];
  var ATTRS_READ = ['km', 'with_fuel', 'kg_per_m', 'mass_kg_m', 'mass_theoretical_kg_m', 'm_per_t', 't_per_m3',
    'density_t_per_unit', 'm3_per_piece', 'vol_m3', 'm_per_piece', 'length_m', 'kg_per_piece', 'mass_kg', 'pack_kg',
    'pack_qty', 'pack_unit', 'pack_l', 'pack_pcs', 'bundle_pcs', 'roll_length_m'];
  var SECTIONS = ['labor', 'machines', 'materials', 'equipment', 'transport'];
  /* the program's 15 region keys (regions.js S.REGIONS) and `national` (valid in the whole country) */
  var REGIONS = ['respublika', 'andijon', 'buxoro', 'fargona', 'jizzax', 'xorazm', 'namangan', 'navoiy', 'qashqadaryo',
    'samarqand', 'sirdaryo', 'surxondaryo', 'toshkent_vil', 'qoraqalpogiston', 'toshkent_sh', 'national'];
  var BASIS = ['catalogue', 'exchange-spot', 'exchange-forward', 'list', 'recommended', 'wage-12%', 'offer', 'declared',
    'designer-memory', 'plant-calc', 'protocol', 'invoice'];
  var ID_RE = /^[a-z0-9][a-z0-9._-]{2,63}$/;
  var SRC_RE = /^[0-9a-z_-]{4,40}$/;
  var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  /* ------------------------------------------------------------------ SHA-256 (FIPS 180-4), pure JS */
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  var KI = new Int32Array(K);

  function block(H, W, b, o) {
    var i, t1, t2, a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (i = 0; i < 16; i++) W[i] = (b[o + 4 * i] << 24) | (b[o + 4 * i + 1] << 16) | (b[o + 4 * i + 2] << 8) | b[o + 4 * i + 3];
    for (i = 16; i < 64; i++) {
      var x = W[i - 15], y = W[i - 2];
      W[i] = (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) + W[i - 16] +
             (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)) + W[i - 7] | 0;
    }
    for (i = 0; i < 64; i++) {
      t1 = h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + KI[i] + W[i] | 0;
      t2 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & bb) ^ (a & c) ^ (bb & c)) | 0;
      h = g; g = f; f = e; e = d + t1 | 0; d = c; c = bb; bb = a; a = t1 + t2 | 0;
    }
    H[0] = H[0] + a | 0; H[1] = H[1] + bb | 0; H[2] = H[2] + c | 0; H[3] = H[3] + d | 0;
    H[4] = H[4] + e | 0; H[5] = H[5] + f | 0; H[6] = H[6] + g | 0; H[7] = H[7] + h | 0;
  }

  function sha256Stream() {
    var H = new Int32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    var W = new Int32Array(64), buf = new Uint8Array(64), fill = 0, total = 0, done = null;
    function update(bytes) {
      if (done) throw new Error('sha256: update after hex()');
      var n = bytes.length, o = 0;
      total += n;
      if (fill) {
        while (fill < 64 && o < n) buf[fill++] = bytes[o++];
        if (fill < 64) return api;
        block(H, W, buf, 0); fill = 0;
      }
      for (; o + 64 <= n; o += 64) block(H, W, bytes, o);
      while (o < n) buf[fill++] = bytes[o++];
      return api;
    }
    function hex() {
      if (done) return done;
      var tail = new Uint8Array(fill < 56 ? 64 : 128), i;
      for (i = 0; i < fill; i++) tail[i] = buf[i];
      tail[fill] = 0x80;
      var L = tail.length, bits = total * 8, hi = Math.floor(total / 0x20000000);
      tail[L - 1] = bits & 0xff; tail[L - 2] = (bits >>> 8) & 0xff; tail[L - 3] = (bits >>> 16) & 0xff; tail[L - 4] = (bits >>> 24) & 0xff;
      tail[L - 5] = hi & 0xff; tail[L - 6] = (hi >>> 8) & 0xff; tail[L - 7] = (hi >>> 16) & 0xff; tail[L - 8] = (hi >>> 24) & 0xff;
      for (var o = 0; o < L; o += 64) block(H, W, tail, o);
      var s = '';
      for (i = 0; i < 8; i++) s += ('00000000' + (H[i] >>> 0).toString(16)).slice(-8);
      done = s;
      return s;
    }
    var api = { update: update, hex: hex };
    return api;
  }
  function sha256(bytes) { return sha256Stream().update(bytes).hex(); }

  /* ------------------------------------------------------------------ checks */
  function isDate(s) {
    if (typeof s !== 'string') return false;
    var m = DATE_RE.exec(s);
    if (!m) return false;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1) return false;
    var dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d <= dim[mo - 1];
  }
  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  function str(v, max) { return typeof v === 'string' && v.length <= max; }
  function strOrNull(v, max) { return v === null || str(v, max); }
  function oneOf(list) { var o = {}; for (var i = 0; i < list.length; i++) o[list[i]] = true; return o; }
  var IS_SECTION = oneOf(SECTIONS), IS_REGION = oneOf(REGIONS), IS_BASIS = oneOf(BASIS), IS_FLAG = oneOf(FLAGS_READ),
    IS_ATTR = oneOf(ATTRS_READ);
  var F = {};
  for (var fi = 0; fi < FIELDS.length; fi++) F[FIELDS[fi]] = fi;
  var MAX_ERRORS = 200;

  /** A decoded text that is empty or shorter than bytes/3 UTF-16 units cannot be the whole package. */
  function checkDecoded(len, bytes) {
    if (bytes > LIMITS.bytes) return 'Пакет слишком велик (больше 500 МБ после распаковки)';
    if (!len || len < bytes / 3) return 'Пакет повреждён или слишком велик';
    return null;
  }

  function Checker(obj, opts) {
    this.obj = obj;
    this.o = opts || {};
    this.errors = [];
    this.next = 0;
    this.prevRid = -1;
    this.srcIds = {};
    this.fatal = false;
  }
  Checker.prototype.err = function (row, field, msg) {
    if (this.errors.length < MAX_ERRORS) this.errors.push({ row: row, field: field, msg: msg });
    else this.errors.truncated = true;
  };
  Checker.prototype.head = function () {
    var p = this.obj, self = this;
    function e(field, msg) { self.err(null, field, msg); }
    if (!p || typeof p !== 'object' || Object.prototype.toString.call(p) === '[object Array]') { e('format', 'не объект пакета'); this.fatal = true; return; }
    if (p.format !== 'smeta-refs') { e('format', 'это не пакет справочника цен'); this.fatal = true; return; }
    if (p.version !== 1) {
      e('version', 'Версия пакета ' + (isInt(p.version) ? p.version : '?') + ' не поддерживается этой версией программы — обновите программу');
      this.fatal = true; return;
    }
    if (p.full !== true) { e('full', 'частичные пакеты не поддерживаются: нужен полный'); this.fatal = true; }
    if (!(typeof p.package_id === 'string' && ID_RE.test(p.package_id))) e('package_id', 'нужны латинские строчные буквы, цифры, . _ -, от 3 до 64 знаков');
    if (!str(p.created, 40)) e('created', 'нет даты создания');
    if (p.tool != null && !str(p.tool, 300)) e('tool', 'не строка');
    if (!isInt(p.rid_min) || p.rid_min < 0) e('rid_min', 'не целое ≥ 0');
    if (!isInt(p.rid_max) || p.rid_max < 0 || (isInt(p.rid_min) && p.rid_max < p.rid_min)) e('rid_max', 'не целое ≥ rid_min');
    if (!isDate(p.date_min)) e('date_min', 'не дата ГГГГ-ММ-ДД');
    if (!isDate(p.date_max) || (isDate(p.date_min) && p.date_max < p.date_min)) e('date_max', 'не дата ГГГГ-ММ-ДД не раньше date_min');
    var fields = p.fields;
    var okFields = Object.prototype.toString.call(fields) === '[object Array]' && fields.length === FIELDS.length;
    for (var i = 0; okFields && i < FIELDS.length; i++) if (fields[i] !== FIELDS[i]) okFields = false;
    if (!okFields) { e('fields', 'список полей не тот, что у версии 1'); this.fatal = true; }
    if (Object.prototype.toString.call(p.rows) !== '[object Array]') { e('rows', 'нет строк'); this.fatal = true; }
    else if (p.rows.length > LIMITS.rows) { e('rows', 'больше ' + LIMITS.rows + ' строк'); this.fatal = true; }
    if (this.o.bytes != null && this.o.bytes > LIMITS.bytes) { e('size', 'Пакет слишком велик (больше 500 МБ после распаковки)'); this.fatal = true; }
    var srcs = p.sources;
    if (Object.prototype.toString.call(srcs) !== '[object Array]') { e('sources', 'нет списка документов'); this.fatal = true; srcs = []; }
    else if (srcs.length > LIMITS.sources) { e('sources', 'больше ' + LIMITS.sources + ' документов'); this.fatal = true; srcs = []; }
    for (var s = 0; s < srcs.length; s++) {
      var d = srcs[s], where = 'sources[' + (s + 1) + '].';
      if (!d || typeof d !== 'object') { e('sources[' + (s + 1) + ']', 'не объект'); continue; }
      if (!(typeof d.id === 'string' && SRC_RE.test(d.id))) { e(where + 'id', 'нужен код документа: 4–40 знаков a-z 0-9 _ -'); continue; }
      if (this.srcIds[d.id]) e(where + 'id', 'код документа повторяется');
      this.srcIds[d.id] = true;
      if (d.vat_default != null && typeof d.vat_default !== 'boolean' && !str(d.vat_default, LIMITS.short)) e(where + 'vat_default', 'не да/нет');
      var longs = ['doc_type', 'method', 'issuer', 'customer', 'doc_no'];
      for (var u = 0; u < longs.length; u++) if (d[longs[u]] != null && !str(d[longs[u]], LIMITS.text)) e(where + longs[u], 'не строка до ' + LIMITS.text + ' знаков');
      if (d.issue_date != null && !isDate(d.issue_date)) e(where + 'issue_date', 'не дата ГГГГ-ММ-ДД');
      if (d.as_of_date != null && !isDate(d.as_of_date)) e(where + 'as_of_date', 'не дата ГГГГ-ММ-ДД');
      if (d.region != null && !IS_REGION[d.region]) e(where + 'region', 'неизвестный регион');
      if (d.ships_nationally != null && typeof d.ships_nationally !== 'boolean') e(where + 'ships_nationally', 'не да/нет');
    }
    var c = p.counts;
    if (!c || !isInt(c.records) || !isInt(c.sources)) e('counts', 'нет числа записей и документов');
    else {
      if (p.rows && c.records !== p.rows.length) e('counts.records', 'не равно числу строк');
      if (p.sources && c.sources !== p.sources.length) e('counts.sources', 'не равно числу документов');
    }
  };
  Checker.prototype.rows = function (from, to) {
    var rows = this.obj.rows, p = this.obj;
    for (var j = from; j < to; j++) {
      var row = rows[j], n = j + 1;
      if (Object.prototype.toString.call(row) !== '[object Array]' || row.length > FIELDS.length || row.length < F.basis + 1) {
        this.err(n, 'row', 'не строка из ' + FIELDS.length + ' полей'); continue;
      }
      var get = function (f) { var v = row[F[f]]; return v === undefined ? null : v; };
      var rid = get('rid');
      if (!isInt(rid) || rid < 0) this.err(n, 'rid', 'не целое ≥ 0');
      else {
        if (rid <= this.prevRid) this.err(n, 'rid', 'номера записей должны строго возрастать');
        if (rid < p.rid_min || rid > p.rid_max) this.err(n, 'rid', 'вне rid_min…rid_max');
        this.prevRid = rid;
      }
      var name = get('name');
      if (!(typeof name === 'string' && name.replace(/\s+/g, '') && name.length <= LIMITS.name)) this.err(n, 'name', 'пустое или длиннее ' + LIMITS.name + ' знаков');
      if (!strOrNull(get('name_raw'), LIMITS.name)) this.err(n, 'name_raw', 'не строка до ' + LIMITS.name + ' знаков');
      if (!strOrNull(get('unit'), LIMITS.short)) this.err(n, 'unit', 'не строка до ' + LIMITS.short + ' знаков');
      if (!strOrNull(get('unit_raw'), LIMITS.text)) this.err(n, 'unit_raw', 'не строка до ' + LIMITS.text + ' знаков');
      if (!IS_SECTION[get('section')]) this.err(n, 'section', 'неизвестный раздел');
      var price = get('price');
      if (typeof price !== 'number' || !isFinite(price)) this.err(n, 'price', 'не число');
      else if (!(price > 0 && price < 1e13)) this.err(n, 'price', 'вне 0 … 10¹³');
      var pd = get('price_date');
      if (!isDate(pd)) this.err(n, 'price_date', 'не дата ГГГГ-ММ-ДД');
      var av = get('avail');
      if (av !== null && (!isDate(av) || (isDate(pd) && av < pd))) this.err(n, 'avail', 'не дата или раньше price_date');
      var as = get('avail_src');
      if (as !== null && !this.srcIds[as]) this.err(n, 'avail_src', 'нет такого документа в пакете');
      var reg = get('region');
      if (reg !== null && !IS_REGION[reg]) this.err(n, 'region', 'неизвестный регион');
      if (!this.srcIds[get('src')]) this.err(n, 'src', 'нет такого документа в пакете');
      if (!str(get('group'), LIMITS.short)) this.err(n, 'group', 'не строка до ' + LIMITS.short + ' знаков');
      if (!IS_BASIS[get('basis')]) this.err(n, 'basis', 'неизвестное основание цены');
      var texts = ['delivery', 'plant', 'code'];
      for (var t = 0; t < texts.length; t++) if (!strOrNull(get(texts[t]), LIMITS.text)) this.err(n, texts[t], 'не строка до ' + LIMITS.text + ' знаков');
      var fl = get('flags');
      if (fl !== null) {
        if (Object.prototype.toString.call(fl) !== '[object Array]') this.err(n, 'flags', 'не список');
        else for (var k = 0; k < fl.length; k++) if (!(typeof fl[k] === 'string' && IS_FLAG[fl[k]])) { this.err(n, 'flags', 'флаг, который программа не читает'); break; }
      }
      var at = get('attrs');
      if (at !== null) {
        if (typeof at !== 'object' || Object.prototype.toString.call(at) === '[object Array]') this.err(n, 'attrs', 'не объект');
        else {
          for (var key in at) {
            if (!Object.prototype.hasOwnProperty.call(at, key)) continue;
            var v = at[key];
            if (!IS_ATTR[key]) { this.err(n, 'attrs', 'свойство, которое программа не читает'); break; }
            if (!((typeof v === 'number' && isFinite(v)) || typeof v === 'boolean' || str(v, LIMITS.short))) { this.err(n, 'attrs.' + key, 'не число, да/нет или короткая строка'); break; }
          }
        }
      }
    }
  };
  Checker.prototype.result = function () {
    var rows = this.obj && this.obj.rows ? this.obj.rows.length : 0;
    return { ok: !this.errors.length, errors: this.errors, truncated: !!this.errors.truncated, rows: rows,
      sources: this.obj && this.obj.sources ? this.obj.sources.length : 0 };
  };

  function validate(obj, opts) {
    var c = new Checker(obj, opts);
    c.head();
    if (!c.fatal) c.rows(0, obj.rows.length);
    return c.result();
  }

  /** The same in slices (default 20k rows) with a setTimeout between them; progress(done, total). */
  function validateAsync(obj, opts, done) {
    var o = opts || {};
    var c = new Checker(obj, o);
    c.head();
    if (c.fatal) { setTimeout(function () { done(c.result()); }, 0); return; }
    var n = obj.rows.length, slice = o.slice || 20 * 1000, at = 0;
    function step() {
      var to = Math.min(n, at + slice);
      c.rows(at, to);
      at = to;
      if (o.progress) o.progress(at, n);
      if (at < n) setTimeout(step, 0); else done(c.result());
    }
    setTimeout(step, 0);
  }

  /** The package head without rows: what the server stores next to the file. */
  function manifest(obj) {
    var m = {};
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k) && k !== 'rows') m[k] = obj[k];
    return m;
  }

  function rowsOf(obj) {
    var out = new Array(obj.rows.length);
    for (var j = 0; j < obj.rows.length; j++) {
      var row = obj.rows[j], o = {};
      for (var i = 0; i < FIELDS.length; i++) o[FIELDS[i]] = row[i] === undefined ? null : row[i];
      out[j] = o;
    }
    return out;
  }

  R.pkg = {
    FORMAT: 'smeta-refs', VERSION: 1, FIELDS: FIELDS, LIMITS: LIMITS, FLAGS_READ: FLAGS_READ, ATTRS_READ: ATTRS_READ,
    SECTIONS: SECTIONS, REGIONS: REGIONS, BASIS: BASIS,
    sha256: sha256, sha256Stream: sha256Stream, isDate: isDate, checkDecoded: checkDecoded,
    validate: validate, validateAsync: validateAsync, manifest: manifest, rowsOf: rowsOf
  };
})(S);
