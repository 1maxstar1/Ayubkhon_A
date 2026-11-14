/*
 * Parsing worker. Unzipping and scanning a 3 MB workbook takes the better part
 * of a second; doing it here keeps the window responsive while several files
 * are being read.
 *
 *   { cmd: 'parse', id, name, buffer }     → { ok, id, name, objects, works, sheetCount, ms } | { ok: false, id, name, error }
 *   { cmd: 'hash', id, buffer }            → { id, hash, size }                       which file this is (SHA-256)
 *   { cmd: 'describe', id, name, buffer }  → { id, fmt }                              what the file looks like
 *                                            (docs/format-reja.md; S.ml.layout.describe — a file that cannot be opened
 *                                            is described by its hash and size alone)
 *
 * `hash` and `describe` are asked by the page that keeps a record of every file's format (src/ui/formats.js) and by the
 * admin page, each from a worker of its own: they never stand between a file and its reading.
 */
(function () {
  'use strict';

  function parse(msg) {
    try {
      var t0 = Date.now();
      var wb = S.readXlsx(new Uint8Array(msg.buffer));
      // The objects go back as the parser made them. They used to be copied field by field here, and a field
      // the parser gained later (`equipTitle`) was never added to the copy: the rule that rests on it worked
      // in every test and not in the page. test/worker-parity.cjs holds the two together.
      var objects = S.smeta.parseWorkbook(wb, msg.name);
      // the works and their volumes (local resource statement of form 5), for «Объёмы работ»: an add-on — a sheet it
      // cannot take costs the works, never the estimate's resources
      var works = [];
      try { works = S.volumes ? S.volumes.parseWorkbook(wb) : []; } catch (e) { works = []; }
      self.postMessage({
        ok: true, id: msg.id, name: msg.name, objects: objects, works: works,
        sheetCount: wb.sheets.length, ms: Date.now() - t0
      });
    } catch (err) {
      self.postMessage({ ok: false, id: msg.id, name: msg.name, error: String(err && err.message || err) });
    }
  }

  function describe(msg) {
    var bytes = new Uint8Array(msg.buffer), wb = null, objects = null, unread = '';
    try { wb = S.readXlsx(bytes); objects = S.smeta.parseWorkbook(wb, msg.name || 'smeta.xlsx'); }
    catch (e) { wb = null; objects = null; unread = String(e && e.message || e).slice(0, 200); }
    var fmt = null, why = '';
    try { fmt = S.ml.layout.describe(bytes, wb, objects); }
    catch (e) { why = String(e && e.message || e).slice(0, 200); }
    // `error`: why the file could not be opened (its description is then its hash and size), or why it was not described
    self.postMessage({ id: msg.id, fmt: fmt, error: unread || why });
  }

  self.onmessage = function (e) {
    var msg = e.data;
    if (msg.cmd === 'parse') parse(msg);
    else if (msg.cmd === 'describe') describe(msg);
    else if (msg.cmd === 'hash') {
      var bytes = new Uint8Array(msg.buffer), hash = '';
      try { hash = S.ml.layout.sha256(bytes); } catch (err) { hash = ''; }
      self.postMessage({ id: msg.id, hash: hash, size: bytes.length });
    }
  };
})();
