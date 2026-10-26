/*
 * Reference-price worker (server mode only; src/ui/refs.js starts it when the server has an active package).
 *
 * The whole-country pool, its indexes and the suggester live here, off the main thread, for the life of the page.
 * build.mjs concatenates in front of this file: `self.REFS_KEYS = '…';` (a stamp of the key-deriving code), fflate,
 * normalize, match, sections, util and src/lib/refs/*.
 *
 * Messages
 *   page → worker   { cmd: 'open', pkgs: [{ id, package_id, sha256, url, records }] }      url: absolute (blob worker)
 *                   { cmd: 'suggest', batch, ctx: { region, asof }, items: [{ k, name, unit, section, mk }] }
 *                   { cmd: 'forget' }                                                     delete the cache (sign-out)
 *   worker → page   { type: 'progress', phase: 'cache'|'download'|'unpack'|'check'|'derive'|'store'|'index', done, total }
 *                   { type: 'ready', package_id, records, skipped, cached, ms, sources: { id: { doc_type, issuer,
 *                     doc_no, issue_date, as_of_date, region } } }
 *                   { type: 'results', batch, items: [{ k, lines }] }
 *                   { type: 'error', phase, message }                                     Russian, never a value
 *
 * The derived pool is cached in IndexedDB (`smeta-refs`, store `pool`, key `current`) under the stamp of the
 * deriving code, the package record and its sha256: a release that changes the parsers, or a new package, derives
 * again by itself. The sha256 the server lists is the uploading page's claim, so a downloaded file is hashed here and
 * refused unless it is exactly that package.
 * Without IndexedDB (a private window, blocked storage) it derives every time. Rows the validator refuses are
 * skipped and counted; a package whose head is wrong, or with too many bad rows, is not used at all.
 */
(function () {
  'use strict';
  var R = S.refs;
  var DB = 'smeta-refs', STORE = 'pool', KEY = 'current';
  var POLICY = 'p3';

  var st = { ready: false, failed: false, sug: null, cache: new Map(), queue: [] };

  function post(m) { self.postMessage(m); }
  var lastPct = {};
  function progress(phase, done, total) {
    var pct = total ? Math.floor(done / total * 100) : 0;
    if (lastPct[phase] === pct && done !== total) return;
    lastPct[phase] = pct;
    post({ type: 'progress', phase: phase, done: done, total: total });
  }
  function fail(phase, message) {
    st.failed = true;
    st.queue = [];
    post({ type: 'error', phase: phase, message: message });
  }

  /* ------------------------------------------------------------------ IndexedDB */
  function idb() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return; }
      var rq;
      try { rq = indexedDB.open(DB, 1); } catch (e) { reject(e); return; }
      rq.onupgradeneeded = function () { rq.result.createObjectStore(STORE); };
      rq.onsuccess = function () {
        var db = rq.result;
        db.onversionchange = function () { db.close(); };   // a sign-out on another page deletes it
        resolve(db);
      };
      rq.onerror = function () { reject(rq.error || new Error('IndexedDB')); };
      rq.onblocked = function () { reject(new Error('IndexedDB blocked')); };
    });
  }
  function idbGet(db) {
    return new Promise(function (resolve, reject) {
      var rq = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      rq.onsuccess = function () { resolve(rq.result || null); };
      rq.onerror = function () { reject(rq.error); };
    });
  }
  function idbPut(db, value) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error); };
    });
  }
  function forget() {
    try { if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase(DB); } catch (e) { /* nothing to delete */ }
  }

  /* ------------------------------------------------------------------ download and unpack */
  var NOT_THIS = 'Файл справочника не совпадает с загруженным пакетом (контрольная сумма) — загрузите пакет заново на странице администратора';
  /** The gzip bytes, hashed as they arrive (about 0.6 s for 50 MB) and refused unless their sha256 is `sha`. */
  function download(url, sha) {
    var h = R.pkg.sha256Stream();
    function checked(all) { if (h.hex() !== sha) throw new Error(NOT_THIS); return all; }
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('Справочник не получен с сервера (' + r.status + ')');
      var total = +(r.headers.get('content-length') || 0);
      if (!r.body || !r.body.getReader) {
        return r.arrayBuffer().then(function (b) {
          var all = new Uint8Array(b);
          if (all.length > R.pkg.LIMITS.gzip) throw new Error('Файл справочника больше 50 МБ');
          h.update(all);
          return checked(all);
        });
      }
      var reader = r.body.getReader(), parts = [], got = 0;
      function pump() {
        return reader.read().then(function (x) {
          if (x.done) return checked(join(parts, got));
          got += x.value.length;
          if (got > R.pkg.LIMITS.gzip) { reader.cancel(); throw new Error('Файл справочника больше 50 МБ'); }
          h.update(x.value);
          parts.push(x.value);
          progress('download', got, total || got);
          return pump();
        });
      }
      return pump();
    });
  }
  function join(parts, total) {
    var all = new Uint8Array(total), o = 0;
    for (var i = 0; i < parts.length; i++) { all.set(parts[i], o); o += parts[i].length; }
    return all;
  }
  var BIG = 'Пакет слишком велик (больше 500 МБ после распаковки)';
  function gunzip(bytes) {
    var cap = R.pkg.LIMITS.bytes;
    if (typeof DecompressionStream === 'undefined') {
      var out = self.fflate.gunzipSync(bytes);
      if (out.length > cap) throw new Error(BIG);
      return Promise.resolve(out);
    }
    var reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    var parts = [], total = 0;
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) return join(parts, total);
        total += r.value.length;
        if (total > cap) { reader.cancel(); throw new Error(BIG); }
        parts.push(r.value);
        return pump();
      });
    }
    return pump().catch(function (e) {
      if (e && e.message === BIG) throw e;
      throw new Error('Файл справочника повреждён');
    });
  }

  /** The package object and the rows to skip, or an Error. */
  function parse(raw) {
    var text = new TextDecoder().decode(raw);
    var bad = R.pkg.checkDecoded(text.length, raw.length);
    if (bad) throw new Error(bad);
    var pkg;
    try { pkg = JSON.parse(text); } catch (e) { throw new Error('Файл справочника повреждён'); }
    text = null;
    var v = R.pkg.validate(pkg, { bytes: raw.length });
    var skip = new Set(), head = 0;
    for (var i = 0; i < v.errors.length; i++) {
      if (v.errors[i].row) skip.add(v.errors[i].row - 1); else head++;
    }
    if (head || v.truncated) throw new Error('Пакет справочника не прошёл проверку — загрузите его заново на странице администратора');
    return { pkg: pkg, skip: skip };
  }

  function sourcesFor(list) {
    var out = {};
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      out[s.id] = { doc_type: s.doc_type || null, issuer: s.issuer || null, doc_no: s.doc_no || null,
        issue_date: s.issue_date || null, as_of_date: s.as_of_date || null, region: s.region || null };
    }
    return out;
  }

  /* ------------------------------------------------------------------ open */
  function open(msg) {
    var t0 = Date.now();
    var p = (msg.pkgs || [])[0];
    if (!p) { fail('open', 'Нет активного пакета справочника'); return; }
    var shas = (msg.pkgs || []).map(function (x) { return x.sha256; });
    // the record too: a package uploaded again under a recycled hash is another record, and is downloaded and checked
    var ids = (msg.pkgs || []).map(function (x) { return x.id; }).join(',');
    var db = null, cached = null, phase = 'cache';
    progress('cache', 0, 1);
    idb().then(function (d) { db = d; return idbGet(d); }).catch(function () { return null; }).then(function (c) {
      if (c && c.keys === R.KEYS && c.shas && c.shas.join(',') === shas.join(',') && c.ids === ids && c.enc && c.sources) cached = c;
      if (cached) return { recs: R.decodeCache(cached.enc), sources: cached.sources, skipped: cached.skipped || 0 };
      phase = 'download';
      return download(p.url, p.sha256).then(function (gz) {
        phase = 'unpack';
        progress('unpack', 0, 1);
        return gunzip(gz);
      }).then(function (raw) {
        phase = 'check';
        progress('check', 0, 1);
        var x = parse(raw);
        raw = null;
        phase = 'derive';
        var recs = R.derive(x.pkg, { skip: x.skip.size ? x.skip : null, progress: function (d, n) { progress('derive', d, n); } });
        var sources = x.pkg.sources, skipped = x.skip.size;
        x = null;
        phase = 'store';
        progress('store', 0, 1);
        var enc = R.encodeCache(recs);
        recs = null;
        var value = { keys: R.KEYS, shas: shas, ids: ids, created: new Date().toISOString(), package_id: p.package_id, enc: enc,
          sources: sources, skipped: skipped };
        var stored = db ? idbPut(db, value).catch(function () { /* storage full or blocked: derive next time */ }) : Promise.resolve();
        // the cold path decodes the in-memory form: the records then share their repeated values, as from the cache
        return stored.then(function () { return { recs: R.decodeCache(enc), sources: sources, skipped: value.skipped }; });
      });
    }).then(function (got) {
      // the cache is written (or read): no connection is kept, so a sign-out can delete the database at once
      if (db) { try { db.close(); } catch (e) { /* already closed */ } db = null; }
      phase = 'index';
      progress('index', 0, 1);
      var h = R.open(got.recs);
      var sug = R.create({ policy: POLICY });
      sug.init({ handle: h, sources: got.sources });
      st.sug = sug;
      st.ready = true;
      progress('index', 1, 1);
      post({ type: 'ready', package_id: p.package_id, records: got.recs.length, skipped: got.skipped, cached: !!cached,
        ms: Date.now() - t0, sources: sourcesFor(got.sources) });
      var q = st.queue;
      st.queue = [];
      for (var i = 0; i < q.length; i++) suggest(q[i]);
    }).catch(function (e) {
      if (db) { try { db.close(); } catch (x) { /* already closed */ } db = null; }
      fail(phase, (e && /[А-Яа-я]/.test(e.message || '')) ? e.message : 'Справочник не подготовлен (' + phase + ')');
    });
  }

  /* ------------------------------------------------------------------ queries */
  /** The engine's `why` holds internal keys and ids: measurement only, never sent to the page. */
  function strip(lines) {
    for (var i = 0; i < lines.length; i++) {
      delete lines[i].why;
      var c = lines[i].components;
      if (c) for (var j = 0; j < c.length; j++) delete c[j].why;
    }
    return lines;
  }

  function suggest(msg) {
    if (st.failed) return;
    if (!st.ready) { st.queue.push(msg); return; }
    var ctx = msg.ctx || {}, out = [];
    for (var i = 0; i < msg.items.length; i++) {
      var it = msg.items[i], lines;
      var q = R.queryOf(it, ctx);
      if (st.cache.has(q.id)) lines = st.cache.get(q.id);
      else {
        try { lines = strip(st.sug.suggest(q)); } catch (e) { lines = []; }
        st.cache.set(q.id, lines);
      }
      out.push({ k: it.k, lines: lines });
    }
    post({ type: 'results', batch: msg.batch, items: out });
  }

  self.onmessage = function (e) {
    var m = e.data || {};
    if (m.cmd === 'open') open(m);
    else if (m.cmd === 'suggest') suggest(m);
    else if (m.cmd === 'forget') { forget(); st.cache = new Map(); }
  };
})();
