/*
 * Parse the registry fixture headlessly and check the column mapping.
 *   node test/registry.cjs [file.xls] [--json out.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { load, ROOT } = require('./load.cjs');
const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const file = args.find((a) => /\.xlsx?$/i.test(a)) || path.join(ROOT, 'test/fixtures/registry-sample.xls');

const S = load(load.REGISTRY);

const t0 = Date.now();
const res = S.parseRegistry(fs.readFileSync(file));
console.log(`${path.basename(file)}: ${res.rows.length} rows, ${res.skipped} skipped, ${res.headers.length} columns, ${Date.now() - t0} ms`);
if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify(res.rows)); console.log('wrote', jsonOut); }

if (file.endsWith('registry-sample.xls')) {
  const r = res.rows[0];
  const checks = [
    [res.rows.length === 400, 'row count 400'],
    [r.number === '67159', 'number is a plain string ' + r.number],
    [r.inn === '204679222', 'inn ' + r.inn],
    [r.status === 'Новая', 'status ' + r.status],
    [r.cost_vat === 499335928, 'cost_vat ' + r.cost_vat],
    [/^2026-08-29T/.test(r.registered_at), 'registered_at ISO ' + r.registered_at],
    [r.currency === 'Доллар США', 'currency ' + r.currency],
    [r.place === 'Общереспубликанский', 'place ' + r.place],
    [r.object_id === '2501992000312005', 'object_id ' + r.object_id],
    [typeof r.raw === 'object' && 'Код валюты' in r.raw, 'raw keeps unmapped columns'],
    [res.rows.every((x) => x.number && /^\d+$/.test(x.number)), 'every number numeric'],
    [new Set(res.rows.map((x) => x.number)).size === 400, 'numbers unique'],
  ];
  let fail = 0;
  for (const [ok, what] of checks) { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; }
  process.exit(fail ? 1 : 0);
}
