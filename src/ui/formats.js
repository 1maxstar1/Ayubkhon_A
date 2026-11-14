/*
 * Server page: every smeta uploaded as a project leaves a record of its format (docs/format-reja.md).
 *
 * The rules read the files they know (src/lib/smeta.js). To learn to read the others, the program keeps, for each
 * file — read or refused — which file it is (a hash), how it was read (objects, lines, how well quantity × price =
 * sum holds) and a sample of its layout with no name and no price in it (src/lib/ml/layout.js). A file that was
 * not read, or whose sums do not agree, is kept whole: the admin page lists it to be downloaded and sent to whoever
 * maintains the program, and reads it again when the rules have been taught.
 *
 * None of this is in the way of the work: a record is written after the file has been read, one at a time, in the
 * background; a failure is a line in the console and nothing else. A file is recorded once — the browser remembers
 * the hashes it has sent — and its record is made again only when it says more than the old one (the file is read
 * now, or the sample has a newer form).
 */
(function (S) {
  'use strict';
  if (!S.pb || !S.ml || !S.ml.layout) return;

  var KEY = 'taq-formats-sent';
  var KEEP_MAX = 30 * 1024 * 1024;     // the collection's file limit
  var HASH_MAX = 20 * 1024 * 1024;     // a file the worker gave no answer for is hashed here, when small enough
  var DOUBT = 0.9;                     // below this share of agreeing sums the file is kept, to be looked at
  var CAP = 5000;

  function loadSent() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function version() { var v = document.querySelector('.ver'); return v ? String(v.textContent || '').trim().slice(0, 20) : ''; }

  var F = {
    DOUBT: DOUBT,
    sent: loadSent(),            // hash → «version:read» as last recorded from this browser
    q: Promise.resolve(),
    checked: false,              // the server still has what this browser believes it sent (asked once per page)
    pending: 0,

    save: function () {
      try {
        var ks = Object.keys(this.sent);
        if (ks.length > CAP) ks.slice(0, ks.length - CAP).forEach(function (k) { delete F.sent[k]; });
        localStorage.setItem(KEY, JSON.stringify(this.sent));
      } catch (e) { /* private mode, a full store: the server is asked again next time */ }
    },

    col: function () { return S.pb.collection('smeta_files'); },

    /** Whether the file itself is kept: not read, or read with sums that do not agree. */
    keeps: function (fmt, read) { return !read || (fmt.score != null && fmt.score < DOUBT); },

    /**
     * A file has been parsed (read or not): queue its record. `res` is the worker's answer; `res.fmt` what the file
     * looks like. Without it (the worker gave no answer for the file) a small file is described here.
     */
    take: function (file, name, res) {
      var self = this;
      if (!S.me || !S.me() || !res) return;
      if (res.fmt && res.fmt.hash) { this.queue(file, name, res, res.fmt); return; }
      if (!file || !file.size || file.size > HASH_MAX || typeof FileReader === 'undefined') return;
      var reader = new FileReader();
      reader.onload = function () {
        var fmt;
        try { fmt = S.ml.layout.describe(new Uint8Array(reader.result), null, null); } catch (e) { return; }
        self.queue(file, name, res, fmt);
      };
      reader.readAsArrayBuffer(file);
    },

    queue: function (file, name, res, fmt) {
      var self = this, read = !!(res.ok && res.objects && res.objects.length);
      var state = (fmt.v || S.ml.layout.VERSION) + ':' + (read ? 1 : 0);
      if (this.sent[fmt.hash] === state) return;
      this.pending++;
      this.q = this.q.then(function () { return self.verify(); })
        .then(function () { return self.sent[fmt.hash] === state ? null : self.send(file, name, res, fmt, read, state); })
        .catch(function (e) { if (window.console) console.warn('formats: ' + (e && e.message || e)); })
        .then(function () { self.pending--; });
    },

    /**
     * Once per page: do the records this browser remembers sending still exist? An emptied server (the admin's
     * «Стереть», another database behind the same address) must get them again.
     */
    verify: function () {
      var self = this;
      if (this.checked) return Promise.resolve();
      this.checked = true;
      var mine = Object.keys(this.sent).length;
      if (!mine) return Promise.resolve();
      return this.col().getList(1, 1, { fields: 'id', requestKey: null }).then(function (res) {
        if ((res.totalItems || 0) < mine) { self.sent = {}; self.save(); }
      }).catch(function () { /* asked again on the next page */ self.checked = false; });
    },

    fields: function (name, res, fmt, read) {
      var out = {
        hash: fmt.hash, name: String(name || '').slice(0, 300), size: fmt.size || 0,
        ws: S.Sync && S.Sync.ws ? S.Sync.ws.id : '',
        is_read: read, objects: fmt.objects || 0, items: fmt.items || 0, checked: fmt.checked || 0,
        reason: read ? '' : (res.ok ? 'no-sheets' : 'error: ' + String(res.error || '').slice(0, 200)),
        signature: fmt.signature || '', version: fmt.v || S.ml.layout.VERSION, app_version: version()
      };
      if (fmt.score != null) out.score = fmt.score;
      if (fmt.sample) out.sample = fmt.sample;
      return out;
    },

    send: function (file, name, res, fmt, read, state) {
      var self = this, col = this.col(), body = this.fields(name, res, fmt, read);
      return col.getList(1, 1, { filter: 'hash = "' + fmt.hash + '"', fields: 'id,is_read,version', requestKey: null }).then(function (found) {
        var rec = found.items && found.items[0];
        if (rec) {
          // an existing record is made again only when this reading says more: read now, or a newer sample
          var better = (read && !rec.is_read) || (rec.version || 0) < body.version;
          if (!better || (!read && rec.is_read)) return null;
          delete body.hash;
          return col.update(rec.id, body, { requestKey: null });
        }
        body.by = S.me().id;
        if (self.keeps(fmt, read) && file && file.size <= KEEP_MAX && typeof FormData !== 'undefined') {
          var fd = new FormData();
          Object.keys(body).forEach(function (k) {
            fd.append(k, k === 'sample' ? JSON.stringify(body[k]) : String(body[k]));
          });
          fd.append('file', file, name || file.name || 'smeta.xlsx');
          return col.create(fd, { requestKey: null });
        }
        return col.create(body, { requestKey: null });
      }).then(function () {
        self.sent[fmt.hash] = state;
        self.save();
      });
    },

    /** For tests and for whoever waits: everything queued so far has been tried. */
    idle: function () { return this.q; }
  };

  S.Formats = F;
})(S);
