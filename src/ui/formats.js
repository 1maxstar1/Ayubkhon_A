/*
 * Server page: every smeta uploaded as a project leaves a record of its format (docs/format-reja.md).
 *
 * The rules read the files they know (src/lib/smeta.js). To learn to read the others, the program keeps, for each
 * file — read or refused — which file it is (a hash), how it was read (objects, lines, how well quantity × price =
 * sum holds) and a sample of its layout with no name and no price in it (src/lib/ml/layout.js). A file that was not
 * read, or whose sums do not agree, is kept whole: the admin page lists it to be downloaded and sent to whoever
 * maintains the program, and reads it again when the rules have been taught.
 *
 * None of this is in the way of the work:
 *   - the file is hashed and described in a worker of this module's own — never the one the page reads files with,
 *     so a file's reading never waits for the description of another; a description that takes longer than a reading
 *     may (READ_MS) is given up, and the worker replaced;
 *   - the records of one batch of files are written after the batch is read, one at a time, in the background; a
 *     failure is a line in the console and nothing else.
 *
 * Which files the server already knows is asked per batch — one request for the files of a workspace that is
 * opened — never remembered in the browser: a server that was emptied (the admin's «Стереть») or another database
 * behind the same address gets its records again. A record is made again only when this reading says more than the
 * old one (the file is read now, or the sample has a newer form).
 */
(function (S) {
  'use strict';
  if (!S.pb || !S.ml || !S.ml.layout || typeof Worker === 'undefined') return;

  var KEEP_MAX = 30 * 1024 * 1024;     // the collection's file limit
  var READ_MS = 90 * 1000;             // as long as the page gives a reading (app.js READ_LIMIT_MS)
  var CHUNK = 40;                      // hashes asked about in one request
  var L = S.ml.layout;

  function readBytes(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise(function (ok, bad) {
      var r = new FileReader();
      r.onload = function () { ok(r.result); };
      r.onerror = function () { bad(new Error('the file could not be read')); };
      r.readAsArrayBuffer(file);
    });
  }
  function seq(list, fn) {
    return list.reduce(function (p, x) { return p.then(function () { return fn(x); }); }, Promise.resolve());
  }

  var F = {
    READ_MS: READ_MS,
    items: [],                    // taken, not yet sent
    q: Promise.resolve(),
    timer: null,
    worker: null,
    seq: 0,
    waiting: {},                  // id → { ok, bad, timer }

    /* ------------------------------------------------------------------ the worker */
    spawn: function () {
      var self = this;
      if (this.worker) return this.worker;
      if (!window.__WORKER_SRC__) return null;
      try { this.worker = new Worker(URL.createObjectURL(new Blob([window.__WORKER_SRC__], { type: 'text/javascript' }))); }
      catch (e) { return null; }
      this.worker.addEventListener('message', function (e) {
        var w = self.waiting[e.data && e.data.id];
        if (!w) return;
        delete self.waiting[e.data.id];
        clearTimeout(w.timer);
        w.ok(e.data);
      });
      this.worker.addEventListener('error', function () { self.kill(new Error('the worker failed')); });
      return this.worker;
    },
    kill: function (why) {
      var self = this;
      try { if (this.worker) this.worker.terminate(); } catch (e) { /* gone */ }
      this.worker = null;
      Object.keys(this.waiting).forEach(function (id) { var w = self.waiting[id]; delete self.waiting[id]; clearTimeout(w.timer); w.bad(why); });
    },
    /** One question to the worker about a file: 'hash' or 'describe'. Rejects on a timeout (the worker is replaced). */
    ask: function (cmd, file, name) {
      var self = this;
      return readBytes(file).then(function (buf) {
        var w = self.spawn();
        if (!w) throw new Error('no worker');
        var id = ++self.seq;
        return new Promise(function (ok, bad) {
          self.waiting[id] = { ok: ok, bad: bad, timer: setTimeout(function () {
            if (self.waiting[id]) self.kill(new Error('not described in ' + Math.round(self.READ_MS / 1000) + ' s'));
          }, self.READ_MS) };
          w.postMessage({ cmd: cmd, id: id, name: name, buffer: buf }, [buf]);
        });
      });
    },

    /* ------------------------------------------------------------------ taking files */
    /**
     * A file has been parsed by the page (read or not): queue its record. `res` is the page's reading; what the
     * workspace and the moment are is taken now — the record is written later, maybe after another application has
     * been opened.
     */
    take: function (file, name, res) {
      var self = this;
      if (!S.me || !S.me() || !file || !res) return;
      this.items.push({
        file: file, name: String(name || file.name || '').slice(0, 300),
        read: !!(res.ok && res.objects && res.objects.length),
        error: res.ok ? '' : String(res.error || '').slice(0, 200),
        ws: S.Sync && S.Sync.ws ? S.Sync.ws.id : '',
        restoring: !!(S.Sync && S.Sync.loading)
      });
      clearTimeout(this.timer);
      this.timer = setTimeout(function () { self.flush(); }, 300);
    },

    flush: function () {
      var self = this, batch = this.items.splice(0);
      clearTimeout(this.timer);
      if (!batch.length) return this.q;
      this.q = this.q.then(function () { return self.run(batch); })
        .catch(function (e) { if (window.console) console.warn('formats: ' + (e && e.message || e)); });
      return this.q;
    },

    /** For tests and for whoever waits: everything taken so far has been tried. */
    idle: function () { return this.flush(); },

    run: function (batch) {
      var self = this;
      return seq(batch, function (it) {
        return self.ask('hash', it.file).then(function (r) { it.hash = r.hash; it.size = r.size; }, function () { it.hash = ''; });
      }).then(function () {
        // one file twice in a batch: once, read if either reading read it
        var by = {}, list = [];
        batch.forEach(function (it) {
          if (!/^[0-9a-f]{64}$/.test(it.hash || '')) return;
          var was = by[it.hash];
          if (!was) { by[it.hash] = it; list.push(it); } else if (it.read && !was.read) { list[list.indexOf(was)] = it; by[it.hash] = it; }
        });
        return self.known(list.map(function (it) { return it.hash; })).then(function (known) {
          return seq(list, function (it) {
            return self.one(it, known[it.hash] || null).catch(function (e) {
              if (window.console) console.warn('formats: ' + it.name + ': ' + (e && e.message || e));
            });
          });
        });
      });
    },

    /** Which of these files the server has a record of: hash → { id, is_read, version, file }. */
    known: function (hashes) {
      var col = S.pb.collection('smeta_files'), out = {}, chunks = [];
      for (var i = 0; i < hashes.length; i += CHUNK) chunks.push(hashes.slice(i, i + CHUNK));
      return seq(chunks, function (hs) {
        return col.getList(1, hs.length, { filter: hs.map(function (h) { return 'hash = "' + h + '"'; }).join(' || '),
          fields: 'id,hash,is_read,version,file', requestKey: null }).then(function (res) {
          (res.items || []).forEach(function (r) { out[r.hash] = r; });
        });
      }).then(function () { return out; });
    },

    /** What a record of the file says: the page's reading decides «read»; the worker's description the rest. */
    fields: function (it, fmt) {
      var out = {
        hash: it.hash, name: it.name, size: it.size || 0, ws: it.ws,
        is_read: it.read, objects: fmt.objects || 0, items: fmt.items || 0, checked: fmt.checked || 0, doubt: !!fmt.doubt,
        reason: it.read ? '' : (it.error ? 'error: ' + it.error : 'no-sheets'),
        signature: fmt.signature || '', version: fmt.v || L.VERSION, app_version: S.appVersion ? S.appVersion() : ''
      };
      if (fmt.score != null) out.score = fmt.score;
      if (fmt.sample) out.sample = fmt.sample;
      return out;
    },

    one: function (it, rec) {
      var self = this, col = S.pb.collection('smeta_files');
      // a record that already says as much is left as it is
      if (rec && !(it.read && !rec.is_read) && (rec.version || 0) >= L.VERSION) return Promise.resolve(null);
      if (rec && rec.is_read && !it.read) return Promise.resolve(null);
      return this.ask('describe', it.file, it.name).then(function (r) { return r.fmt || null; }, function () { return null; }).then(function (fmt) {
        if (it.read && !(fmt && fmt.read && fmt.sample)) return null;     // a read file is recorded with its sample, or not at all
        fmt = fmt || { v: L.VERSION, objects: 0, items: 0, checked: 0, score: null, doubt: false, signature: '', sample: null };
        var body = self.fields(it, fmt);
        if (rec) { delete body.hash; return col.update(rec.id, body, { requestKey: null }); }
        body.by = S.me().id;
        var keep = (!it.read || body.doubt) && it.file.size <= KEEP_MAX && typeof FormData !== 'undefined';
        if (!keep) return col.create(body, { requestKey: null });
        var fd = new FormData();
        Object.keys(body).forEach(function (k) { fd.append(k, k === 'sample' ? JSON.stringify(body[k]) : String(body[k])); });
        fd.append('file', it.file, it.name || 'smeta.xlsx');
        return col.create(fd, { requestKey: null }).then(function (made) {
          if (!it.read && !it.restoring) self.said(it);
          return made;
        }, function (e) {
          var bad = e && e.response && e.response.data;
          if (bad && bad.hash) return null;                  // recorded meanwhile (another tab): nothing to add
          // the file itself refused (its type, its size): the record, without it — the format is not lost with the file
          if (e && e.status === 400 && bad && bad.file) return col.create(body, { requestKey: null });
          throw e;
        });
      });
    },

    /** After an unread file has really been kept: where to find it. */
    said: function (it) {
      var app = window.app;
      if (!app || !app.toast) return;
      app.toast('«' + it.name + '» не прочитан и сохранён для разработчика: ' + (S.isAdmin && S.isAdmin()
        ? 'страница администратора → «Обучение» → «Распознавание форматов смет» → «Скачать».'
        : 'администратор может скачать его на своей странице («Распознавание форматов смет»).'));
    }
  };

  S.Formats = F;
})(S);
