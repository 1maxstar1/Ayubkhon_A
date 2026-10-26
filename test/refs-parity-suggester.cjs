/*
 * The program's reference-price engine as a suggester for the private evaluation harness of the kit
 * (REFS_KIT/tools/match/eval/run.cjs), used by test/refs-parity.cjs:
 *   REFS_PKG=<package.json.gz> node <kit>/tools/match/eval/run.cjs --suggester <repo>/test/refs-parity-suggester.cjs
 * Policy p3 unless REFS_POLICY says otherwise.
 */
'use strict';
const fs = require('node:fs');
const zlib = require('node:zlib');
const { load } = require('./load.cjs');

module.exports = () => {
  const S = load(load.CORE, load.REFS);
  const R = S.refs;
  const sug = R.create({ policy: process.env.REFS_POLICY || 'p3' });
  const init = sug.init;
  sug.init = () => {
    const pkg = JSON.parse(zlib.gunzipSync(fs.readFileSync(process.env.REFS_PKG)).toString('utf8'));
    init({ handle: R.open(R.derive(pkg)), sources: pkg.sources });
  };
  return sug;
};
