/*
 * The worker of the UZEX source (server mode only; src/ui/uzex.js starts it when «UZEX (биржа)» is checked).
 *
 * It runs after the libraries of the reference worker — the page builds it from the same text, with this file at the
 * end, so this file's handler is the one that answers — and uses only the engine (S.refs), never the reference
 * worker's own state: no download, no IndexedDB, no package of the price documents. One week of quotes arrives as an
 * in-memory package (src/lib/uzex.js), is checked by the package validator, derived and indexed (about half a second
 * for a week), and asked the way the reference pool is asked.
 *
 * Messages
 *   page → worker   { cmd: 'load', gen, pkg }                                    the week now in use
 *                   { cmd: 'suggest', gen, batch, ctx: { region, asof }, items: [{ k, name, unit, section, mk }] }
 *   worker → page   { type: 'ready', gen, records, skipped, ms }
 *                   { type: 'results', gen, batch, items: [{ k, lines }] }
 *                   { type: 'error', gen, message }                               Russian, never a value
 * Everything is stamped with `gen`: a question for a week that has been replaced is not answered.
 */
(function () {
  'use strict';
  var R = S.refs;
  var st = { gen: -1, sug: null, cache: new Map() };

  function post(m) { self.postMessage(m); }

  function load(m) {
    var t0 = Date.now();
    st.gen = m.gen; st.sug = null; st.cache = new Map();
    try {
      var v = R.pkg.validate(m.pkg, { bytes: 1 });
      var skip = new Set(), head = 0;
      for (var i = 0; i < v.errors.length; i++) {
        if (v.errors[i].row) skip.add(v.errors[i].row - 1); else head++;
      }
      if (head || v.truncated) throw new Error('head');
      var recs = R.derive(m.pkg, { skip: skip.size ? skip : null });
      var sug = R.create({ policy: 'p3' });
      sug.init({ handle: R.open(recs), sources: m.pkg.sources });
      if (st.gen !== m.gen) return;
      st.sug = sug;
      post({ type: 'ready', gen: m.gen, records: recs.length, skipped: skip.size, ms: Date.now() - t0 });
    } catch (e) {
      post({ type: 'error', gen: m.gen, message: 'Котировки UZEX не подготовлены' });
    }
  }

  /** The engine's `why` holds internal keys: measurement only, never sent to the page. */
  function strip(lines) {
    for (var i = 0; i < lines.length; i++) {
      delete lines[i].why;
      var c = lines[i].components;
      if (c) for (var j = 0; j < c.length; j++) delete c[j].why;
    }
    return lines;
  }

  function suggest(m) {
    if (m.gen !== st.gen || !st.sug) return;
    var ctx = m.ctx || {}, out = [];
    for (var i = 0; i < m.items.length; i++) {
      var it = m.items[i], q = R.queryOf(it, ctx), lines;
      if (st.cache.has(q.id)) lines = st.cache.get(q.id);
      else {
        try { lines = strip(st.sug.suggest(q)); } catch (e) { lines = []; }
        st.cache.set(q.id, lines);
      }
      out.push({ k: it.k, lines: lines });
    }
    post({ type: 'results', gen: m.gen, batch: m.batch, items: out });
  }

  self.onmessage = function (e) {
    var m = e.data || {};
    if (m.cmd === 'load') load(m);
    else if (m.cmd === 'suggest') suggest(m);
  };
})();
