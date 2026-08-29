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
      var objects = S.smeta.parseWorkbook(wb, msg.name);
      var slim = objects.map(function (o) {
        return {
          name: o.name, title: o.title, subtitle: o.subtitle, index: o.index,
          layout: o.layout, rows: o.rows, items: o.items, maxCol: o.maxCol, file: o.file
        };
      });
      self.postMessage({
        ok: true, id: msg.id, name: msg.name, objects: slim,
        sheetCount: wb.sheets.length, ms: Date.now() - t0
      });
    } catch (err) {
      self.postMessage({ ok: false, id: msg.id, name: msg.name, error: String(err && err.message || err) });
    }
  };
})();
