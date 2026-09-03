/*
 * Registry report (Report_1.xls from control.expertcenter.uz) -> application
 * rows. Columns are found by header text, not by letter, so an extra column in
 * the export does not break the import. Needs the SheetJS global (XLSX).
 */
(function (S) {
  'use strict';

  // normalised header -> applications field
  var HEAD = {
    'номер': 'number',
    'статус заявки': 'status',
    'дата регистрации заявки': 'registered_at',
    'дата оплаты': 'paid_at',
    'название организации': 'org_name',
    'инн': 'inn',
    'эксперт': 'expert',
    'соэксперт': 'coexpert',
    'тип экспертизы': 'expertise_type',
    'тип закупщика/проекта': 'buyer_type',
    'название проекта': 'project_title',
    'id номер объекта': 'object_id',
    'стоимость проекта (без учета ндс)': 'cost',
    'стоимость проекта (с учетом ндс)': 'cost_vat',
    'денежная единица': 'currency',
    'место реализации проекта': 'place',
    'отрасли': 'branch',
    'фио ответственного исполнителя': 'executor_name',
    'e-mail ответственного исполнителя': 'executor_email',
    'контактный телефон ответственного исполнителя': 'executor_phone'
  };
  var DATES = { registered_at: 1, paid_at: 1 };
  var NUMS = { cost: 1, cost_vat: 1 };
  var CODES = { number: 1, inn: 1, object_id: 1 };

  function norm(h) {
    return String(h == null ? '' : h).toLowerCase().replace(/\s+/g, ' ').replace(/ё/g, 'е').trim();
  }

  function text(v) {
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString();
    return String(v).replace(/[\r\n]+/g, ' ').trim();
  }

  function code(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') return String(Math.round(v));
    return String(v).replace(/\.0+$/, '').replace(/\s+/g, '').trim();
  }

  function date(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) return isNaN(v) ? '' : v.toISOString();
    if (typeof v === 'number') {                       // Excel serial, 1900 system
      var d = new Date(Math.round((v - 25569) * 86400 * 1000));
      return isNaN(d) ? '' : d.toISOString();
    }
    var p = String(v).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (p) return new Date(Date.UTC(+p[3], +p[2] - 1, +p[1], +(p[4] || 0), +(p[5] || 0))).toISOString();
    var d2 = new Date(v);
    return isNaN(d2) ? '' : d2.toISOString();
  }

  function money(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    var n = parseFloat(String(v).replace(/\s+/g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  /**
   * @param {ArrayBuffer|Uint8Array} buf  .xls or .xlsx bytes
   * @returns {{rows: object[], headers: string[], skipped: number}}
   */
  S.parseRegistry = function (buf) {
    var wb = XLSX.read(buf, { type: buf instanceof ArrayBuffer ? 'array' : 'buffer', cellDates: true });
    var ws = wb.Sheets[wb.SheetNames[0]];
    var grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    var hr = -1;
    for (var r = 0; r < Math.min(grid.length, 10); r++) {
      var keys = (grid[r] || []).map(norm);
      if (keys.indexOf('номер') >= 0 && keys.indexOf('инн') >= 0) { hr = r; break; }
    }
    if (hr < 0) throw new Error('Sarlavha qatori topilmadi («номер», «ИНН» ustunlari kerak)');
    var headers = (grid[hr] || []).map(function (h) { return text(h); });
    var map = headers.map(function (h) { return HEAD[norm(h)] || null; });
    var rows = [], skipped = 0;
    for (var i = hr + 1; i < grid.length; i++) {
      var line = grid[i];
      if (!line) continue;
      var row = { raw: {} };
      for (var c = 0; c < headers.length; c++) {
        var v = line[c];
        var f = map[c];
        if (!f) {
          if (headers[c] && headers[c] !== '№' && v != null && v !== '') row.raw[headers[c]] = text(v);
          continue;
        }
        row[f] = CODES[f] ? code(v) : DATES[f] ? date(v) : NUMS[f] ? money(v) : text(v);
      }
      if (!row.number) { skipped++; continue; }
      rows.push(row);
    }
    return { rows: rows, headers: headers, skipped: skipped };
  };
})(S);
