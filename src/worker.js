/*
 * Parsing worker. Unzipping and scanning a 3 MB workbook takes the better part
 * of a second; doing it here keeps the window responsive while several files
 * are being read.
 */
(function () {
  'use strict';

  self.onmessage = function (e) {
    var msg = e.data;
    if (msg.cmd !== 'parse') return;
    try {
      var t0 = Date.now();
      var wb = S.readXlsx(new Uint8Array(msg.buffer));
      // The objects go back as the parser made them. They used to be copied field by field here, and a field
      // the parser gained later (`equipTitle`) was never added to the copy: the rule that rests on it worked
      // in every test and not in the page. test/worker-parity.cjs holds the two together.
      var objects = S.smeta.parseWorkbook(wb, msg.name);
      // the works and their volumes (local resource statement of form 5), for «Объёмы работ»
      var works = S.volumes ? S.volumes.parseWorkbook(wb) : [];
      self.postMessage({
        ok: true, id: msg.id, name: msg.name, objects: objects, works: works,
        sheetCount: wb.sheets.length, ms: Date.now() - t0
      });
    } catch (err) {
      self.postMessage({ ok: false, id: msg.id, name: msg.name, error: String(err && err.message || err) });
    }
  };
})();
