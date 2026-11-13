/*
 * What the program keeps to learn from (docs/ai-reja.md, phase 1). Recording only: nothing here changes what is
 * shown, in which order, or any price.
 *
 * 1. The journal of decisions (suggest_events). When the price of a resource is decided — a suggestion applied, a
 *    price typed, the estimate's price put back, «Автоподбор», a bulk change — the suggestion lines the resource had
 *    at that moment are written down with the decision: their place, kind, level, how the name matched, flags, price,
 *    date, region, basis and record numbers (no names), which of them was taken, and the price it ended with. The
 *    estimate's own price is not written: it is never a ranking feature (src/lib/refs/query.js).
 * 2. The prices of a finished application (price_memory). «✓ Завершить» first says what it found — prices changed,
 *    prices left as the estimate has them, how many are marked «проверено» — and then every resource is written with
 *    its kind: corrected (the expert's market price), zeroed (struck out), checked (left, looked at), untouched
 *    (left). A second finish replaces the rows; «не учитывать в обучении» removes them.
 * 3. Which corrected prices the contractor took: «Исправлено» of «Сравнение версий» marks the row as accepted.
 *
 * None of it may get in the expert's way: every failure here is swallowed (the price is saved by sync.js regardless),
 * and a server from before these routes simply answers 404.
 *
 * Server only. Reads what refs.js, uzex.js and hints.js already hold; changes none of the measured code.
 */
(function (S) {
  'use strict';
  if (!S.pb) return;

  var SCHEMA = 2;            // the shape of a journal line (server/pb_hooks/lib/learning.js `line`); 2: the kind «mem»
  var COMMIT_MS = 2500;      // after the last change of a price: the typing is over and sync.js has sent it
  var MAX_LINES = 12, CAP = { mem: 2, ref: 5, uzex: 2, hint: 2, sim: 1 };
  var BATCH = 100;           // events per request (the server takes 200)
  var KEEP = 500;            // events waiting for a server that does not answer; older ones are let go
  var ROWS = 1000;           // finished prices per request (the server takes 3000)

  function $(id) { return document.getElementById(id); }
  function A() { return window.app; }
  function has(a, x) { return !!a && a.indexOf(x) >= 0; }
  function version() { var v = document.querySelector('.ver'); return v ? String(v.textContent || '').trim().slice(0, 20) : ''; }
  function mkOf(r) { return r.mk || (S.matchPair ? S.matchPair(r.name, r.unit || '') : ''); }
  function unitKind(l) {
    if (l.tier === 'estimate' || has(l.flags, 'derived-unit')) return 'derived';
    var f = l.raw && l.raw.factor;
    return f != null && Math.abs(f - 1) > 1e-9 ? 'conv' : 'same';
  }
  function wrap(obj, name, before, after) {
    var orig = obj && obj[name];
    if (typeof orig !== 'function') return;
    obj[name] = function () {
      var tok;
      try { tok = before ? before.apply(this, arguments) : undefined; } catch (e) { /* never in the way */ }
      try { return orig.apply(this, arguments); }
      finally { try { if (after) after.call(this, tok, arguments); } catch (e) { /* never in the way */ } }
    };
  }

  var J = {
    SCHEMA: SCHEMA,
    pend: {},          // res_key → { kind } : prices changed, not yet written down
    last: {},          // res_key → the decision last written for it in this application (the same one is not repeated)
    seen: {},          // res_key → 1 : a suggestion popover was opened for it
    kind: '',          // the bulk action running now: 'autopick' | 'bulk'
    q: [],             // { ws, ev } waiting to be sent
    t: 0, busy: false, sent: 0, failed: 0,

    ready: function () { var Sy = S.Sync; return !!(Sy && Sy.ws && !Sy.loading && !Sy.restoring && !Sy.frozen); },

    /** A price was set. */
    note: function (key, kind) {
      if (!this.ready() || !key) return;
      this.pend[key] = { kind: kind || '' };
      var self = this;
      clearTimeout(this.t);
      this.t = setTimeout(function () { self.commit(); }, COMMIT_MS);
    },

    /** The section and date the suggestions of a resource are asked with. */
    asked: function (rec) {
      var out = { section: 'other', asof: '' };
      try {
        out.asof = S.Refs && S.Refs.asofNow ? S.Refs.asofNow() : '';
        if (S.refs && S.refs.queryOf) out.section = S.refs.queryOf(rec, { region: S.Sync.ws.region, asof: out.asof }).section || 'other';
      } catch (e) { /* as it is */ }
      return out;
    },

    /** The suggestion lines the resource has now, reduced to their features; `source` finds the one taken. */
    lines: function (rec, source) {
      var all = [], chosen = -1;
      function add(k, p, o, isChosen) { o.k = k; o.p = p; if (isChosen && chosen < 0) chosen = all.length; all.push(o); }
      function engine(l) {
        var o = { tier: l.tier, how: l.how, sim: l.sim, drop: l.drop, stage: l.stage, flags: (l.flags || []).slice(0, 12), price: l.price,
          date: l.price_date, region: l.region, basis: l.basis, unit: unitKind(l) };
        if (l.rid != null) o.rid = l.rid; else if (l.rids) o.rids = l.rids.slice(0, 20);
        if (l.components) o.n = l.components.length;
        return o;
      }
      try {
        // the expert's own earlier prices (src/ui/memory.js), in the order they are offered
        var Mm = S.Memory;
        if (Mm && Mm.of) Mm.of(rec).prices.slice(0, 8).forEach(function (p, i) {
          add('mem', i, { id: p.row.id, price: p.price, date: S.memory.dateOf(p.row), same: p.cls === 1, accepted: !!p.accepted,
            src: /^ref:/.test(p.row.source) ? 'ref' : /^uzex:/.test(p.row.source) ? 'uzex' : 'typed' }, !!source && source === 'mem:' + p.row.id);
        });
      } catch (e) { /* none */ }
      try {
        var R = S.Refs;
        if (R && R.lines) R.lines(rec).forEach(function (l, i) { add('ref', i, engine(l), !!source && R.sourceOf(l) === source); });
      } catch (e) { /* none */ }
      try {
        var U = S.Uzex;
        if (U && U.lines && U.imp) U.lines(rec).forEach(function (l, i) { add('uzex', i, engine(l), !!source && S.uzex.sourceOf(U.imp.import_id, l) === source); });
      } catch (e) { /* none */ }
      try {
        var H = S.Hints, mk = mkOf(rec);
        var hint = function (k) {
          return function (h, i) {
            var o = { id: h.id, price: h.price, date: String(h.at || '').slice(0, 10), region: h.region, same: !!h.same, src: h.ref ? 'ref' : h.uzex ? 'uzex' : 'typed' };
            if (h.score != null) o.sim = h.score;
            add(k, i, o, !!source && source === 'hint:' + h.id);
          };
        };
        if (H && H.for) { H.for(mk).forEach(hint('hint')); H.similar(mk).forEach(hint('sim')); }
      } catch (e) { /* none */ }
      if (all.length <= MAX_LINES) return { lines: all, chosen: chosen };
      // too many: the first of each kind, and the one taken in any case
      var n = {}, out = [], pick = -1;
      all.forEach(function (o, i) {
        n[o.k] = (n[o.k] || 0) + 1;
        if (n[o.k] <= CAP[o.k]) { if (i === chosen) pick = out.length; out.push(o); }
        else if (i === chosen) { for (var j = out.length - 1; j >= 0; j--) if (out[j].k === o.k) { out[j] = o; pick = j; break; } }
      });
      return { lines: out, chosen: pick };
    },

    /** Everything decided since the last commit becomes events. */
    commit: function () {
      clearTimeout(this.t);
      var pend = this.pend, keys = Object.keys(pend), self = this, app = A(), Sy = S.Sync;
      this.pend = {};
      if (!keys.length) return;
      try {
        if (!this.ready() || !app || !app.model) return;
        var by = {};
        app.model.resources.forEach(function (r) { by[r.key] = r; });
        var ver = version(), ws = Sy.ws.id;
        keys.forEach(function (k) {
          var rec = by[k];
          if (!rec) return;
          var value = rec.market, kind = pend[k].kind;
          var mark = Sy.priceSource ? Sy.priceSource(k, value) : null;
          var source = mark && mark.source ? mark.source : 'typed';
          var applied = /^(ref|uzex|hint|mem):/.test(source);
          var action = S.near(value, rec.price) ? 'reset' : kind === 'autopick' && applied ? 'autopick' : kind ? 'bulk' : applied ? 'applied' : 'typed';
          if (action === 'reset') { source = 'typed'; mark = null; }
          var sig = action + '|' + value + '|' + source;
          // the estimate's price put back on a resource nothing was decided about: not a decision
          if (self.last[k] === sig || (action === 'reset' && self.last[k] === undefined && !self.seen[k])) return;
          self.last[k] = sig;
          var ln = self.lines(rec, applied ? source : ''), q = self.asked(rec);
          self.q.push({ ws: ws, ev: { res_key: k, name: rec.name, unit: rec.unit || '', section: q.section, asof: q.asof, lines: ln.lines,
            opened: !!self.seen[k], action: action, chosen: ln.chosen, source: source, source_price: mark ? mark.price : null,
            final_price: value, schema: SCHEMA, app_version: ver } });
        });
      } catch (e) { /* never in the way */ }
      if (this.q.length > KEEP) this.q.splice(0, this.q.length - KEEP);
      this.send();
    },

    /** One request per application, one after another; what does not go out waits for the next commit. */
    send: function (how) {
      var self = this;
      if (this.busy || !this.q.length) return Promise.resolve();
      var ws = this.q[0].ws, part = [], rest = [];
      this.q.forEach(function (x) { if (x.ws === ws && part.length < BATCH) part.push(x); else rest.push(x); });
      this.q = rest;
      this.busy = true;
      return S.pb.send('/api/journal/events', Object.assign({ method: 'POST', body: { workspace: ws, events: part.map(function (x) { return x.ev; }) } }, how || {}))
        .then(function (r) { self.sent += (r && r.saved) || 0; self.busy = false; if (self.q.length) return self.send(how); })
        .catch(function (e) {
          self.busy = false; self.failed++;
          // a server that does not answer now may answer later; one that refuses (an older server, a deleted
          // workspace) will refuse again
          if (e && e.status === 0 && !e.isAbort) { self.q = part.concat(self.q); if (self.q.length > KEEP) self.q.splice(0, self.q.length - KEEP); }
        });
    },

    /** Another application (or none): what was remembered about the one before does not carry over. */
    fresh: function () { this.last = {}; this.seen = {}; this.acceptedSig = ''; this.pend = {}; clearTimeout(this.t); },

    /* --------------------------------------------------------------- the finished application */
    /** Resources whose corrected price the returned estimate took («Исправлено»), by key. */
    fixedKeys: function () {
      var out = {};
      try {
        var res = A().compare_ui && A().compare_ui.res;
        ((res && res.objects) || []).forEach(function (o) {
          (o.rows || []).forEach(function (x) { if (x.st === 'fixed' && x.key) out[x.key] = 1; });
        });
      } catch (e) { /* none */ }
      return out;
    },

    /** What a finish would write: the counts for the dialog, and (with `opts`) the rows. */
    survey: function (opts) {
      var app = A(), self = this, m = app && app.model;
      var out = { corrected: 0, zeroed: 0, untouched: 0, checked: 0, rows: [] };
      if (!m) return out;
      var fixed = opts ? this.fixedKeys() : {};
      m.resources.forEach(function (r) {
        var smeta = r.price, fin = r.market;
        if (!(smeta > 0) && !(fin > 0)) return;
        var row = null;
        if (!S.near(fin, smeta)) {
          var kind = fin > 0 ? 'corrected' : 'zeroed';
          out[kind]++;
          if (opts) row = { kind: kind, source: app.pct && app.pct[r.key] ? 'pct' : ((S.sourceOfPrice && S.sourceOfPrice(r.key, fin)) || 'typed'), accepted: kind === 'corrected' && !!fixed[r.key] };
        } else {
          out.untouched++;
          var marked = !!(app.checked && app.checked[r.key]);
          if (marked) out.checked++;
          if (opts) row = marked ? { kind: 'checked', source: 'mark' } : opts.assume ? { kind: 'checked', source: 'finish' } : { kind: 'untouched', source: '' };
        }
        if (!row) return;
        var q = self.asked(r);
        row.res_key = r.key; row.name = r.name; row.unit = r.unit || ''; row.section = q.section; row.asof = q.asof;
        row.smeta_price = smeta; row.final_price = fin;
        out.rows.push(row);
      });
      return out;
    },

    /**
     * «✓ Завершить» asks first. Resolves to { record, assume } — or null for «Отмена».
     * record: write the prices of this application to the memory; assume: count the unmarked untouched as checked.
     */
    finishDialog: function () {
      var self = this, Sy = S.Sync;
      return new Promise(function (resolve) {
        var c = self.survey(null), left = c.untouched - c.checked, changed = c.corrected + c.zeroed;
        var box = $('finishBox');
        if (!box) { box = document.createElement('div'); box.id = 'finishBox'; box.className = 'cpbox finbox'; document.body.appendChild(box); }
        box.innerHTML = '<div class="cp-in"><div class="cp-h"><b>Завершить заявку № ' + S.esc(Sy.app ? Sy.app.number : '') + '</b>' +
          '<button class="link" data-x title="Закрыть">×</button></div>' +
          '<div class="fin-body"><p class="fin-counts">Цен изменено: <b id="finChanged">' + changed + '</b>' +
          (c.zeroed ? ' (из них обнулено: ' + c.zeroed + ')' : '') + ' · оставлено как в смете: <b id="finLeft">' + c.untouched + '</b>' +
          ' · из них отмечено «проверено»: <b id="finChecked">' + c.checked + '</b></p>' +
          '<p class="fin-note">Цены этой заявки запоминаются: изменённые — как ваши рыночные цены, оставленные — как принятые по смете. ' +
          'На экран и на подсказки это пока не влияет.</p>' +
          (left > 0 ? '<label class="fin-opt"><input type="checkbox" id="finAssume" checked> Считать остальные ' + left +
            ' проверенными: сметная цена принята</label>' : '') +
          '<label class="fin-opt"><input type="checkbox" id="finSkip"> Не учитывать эту заявку в обучении (тестовая) — прежние записи о ней удаляются</label></div>' +
          '<div class="cp-f"><span class="count"></span><button class="btn sm" id="finCancel">Отмена</button>' +
          '<button class="btn sm ok" id="finOk">✓ Завершить</button></div></div>';
        box.hidden = false;
        var done = function (v) { box.hidden = true; box.innerHTML = ''; resolve(v); };
        box.querySelector('[data-x]').addEventListener('click', function () { done(null); });
        $('finCancel').addEventListener('click', function () { done(null); });
        $('finOk').addEventListener('click', function () {
          done({ record: !$('finSkip').checked, assume: !!($('finAssume') && $('finAssume').checked) });
        });
        $('finOk').focus();
      });
    },

    /** The prices of the application, written (or, with record: false, removed). Rejects when the server refuses. */
    remember: function (opts) {
      var Sy = S.Sync;
      if (!Sy || !Sy.ws) return Promise.resolve({ saved: 0 });
      var ws = Sy.ws.id;
      this.commit();
      if (!opts.record) return S.pb.send('/api/memory/finish', { method: 'POST', body: { workspace: ws, part: 0, record: false } });
      var rows = this.survey(opts).rows, parts = [], saved = 0;
      for (var i = 0; i < rows.length; i += ROWS) parts.push(rows.slice(i, i + ROWS));
      if (!parts.length) parts.push([]);
      return parts.reduce(function (p, part, n) {
        return p.then(function () {
          return S.pb.send('/api/memory/finish', { method: 'POST', body: { workspace: ws, part: n, record: true, rows: part } })
            .then(function (r) { saved += (r && r.saved) || 0; });
        });
      }, Promise.resolve()).then(function () { return { saved: saved }; });
    },

    /** «Сравнение версий» has a result on a finished application: which corrected prices were taken. */
    accepted: function () {
      var Sy = S.Sync;
      if (!this.ready() || Sy.ws.status !== 'done') return;
      var keys = Object.keys(this.fixedKeys()).sort(), sig = Sy.ws.id + '|' + keys.join('\u0001');
      if (sig === this.acceptedSig) return;
      this.acceptedSig = sig;
      S.pb.send('/api/memory/accepted', { method: 'POST', body: { workspace: Sy.ws.id, keys: keys } }).catch(function () { /* next time */ });
    },

    init: function () {
      var self = this;
      if (this.inited || !S.App || !S.Sync) return;
      this.inited = true;
      var P = S.App.prototype;
      wrap(P, 'setPrice', null, function (tok, args) { self.note(args[0], self.kind); });
      wrap(P, 'setPrices', null, function (tok, args) { Object.keys(args[0] || {}).forEach(function (k) { self.note(k, self.kind || 'bulk'); }); });
      var bulk = function () { var was = self.kind; if (!was) self.kind = 'bulk'; return was; };
      var back = function (was) { self.kind = was || ''; };
      wrap(P, 'bulkPrices', bulk, back);
      wrap(P, 'undoPrices', bulk, back);
      wrap(S.Refs, 'autoApply', function () { var was = self.kind; self.kind = 'autopick'; return was; }, back);
      // a popover opened for a resource: the suggestions were looked at
      wrap(S.Refs, 'show', function (anchor, key) { if (key) self.seen[key] = 1; });
      wrap(S.Uzex, 'show', function (anchor, key) { if (key) self.seen[key] = 1; });
      wrap(S.Hints, 'show', function (anchor, mk, key) { if (key) self.seen[key] = 1; });
      wrap(S.Memory, 'show', function (anchor, key) { if (key) self.seen[key] = 1; });
      // leaving the application, by the list or by the tab: what was decided is written down first
      wrap(S.Sync, 'close', function () { self.commit(); });
      window.addEventListener('pagehide', function () { try { self.commit(); } catch (e) { /* gone */ } });
      document.addEventListener('ws:open', function () { self.fresh(); });
      document.addEventListener('ws:close', function () { self.fresh(); });
      if (S.Compare) wrap(S.Compare.prototype, 'run', null, function () { self.accepted(); });
    }
  };

  S.Journal = J;
  document.addEventListener('DOMContentLoaded', function () { J.init(); });
  if (document.readyState !== 'loading') J.init();
})(S);
