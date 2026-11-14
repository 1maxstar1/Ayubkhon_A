// What the program keeps to learn from: the journal of decisions (suggest_events) and the prices of finished
// applications (price_memory). Shared by the handlers in learning.pb.js (loaded with require(), because each
// handler runs in its own VM and cannot see the hook file's top-level scope).
//
// Both collections are written only here. As with corrections/bulk, everything that says who did the work and
// where — the region, the application, the contragent, the author — is taken from the workspace and from the
// token, never from the request, and the lookup keys are computed by the same lib/nlp.js the page is built from.
// One request is one transaction.
//
// Nothing here is needed for the program to work: the page swallows every failure of these routes, and an older
// page simply never calls them (the collections then stay as they are, unused).

const MAX_EVENTS = 200;       // decisions in one request
const MAX_ROWS = 3000;        // one estimate's resources, as corrections/bulk
const MAX_LINES = 12;         // suggestion lines kept with one decision
const MAX_LINES_JSON = 20 * 1024; // … and their size, as stored (the field's own limit)
const MAX_TEXT = 500;

const ACTIONS = ["applied", "typed", "reset", "autopick", "bulk"];
const KINDS = ["corrected", "checked", "untouched", "zeroed"];
const SECTIONS = ["labor", "machines", "materials", "equipment", "transport", "other"];
const LINE_KINDS = ["ref", "uzex", "hint", "sim", "mem"];

function text(v, max) { return String(v == null ? "" : v).slice(0, max || MAX_TEXT); }
function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function int(v, lo, hi) { const n = Math.round(num(v)); return n < lo ? lo : n > hi ? hi : n; }
function oneOf(v, list, other) { return list.indexOf(v) >= 0 ? v : other; }
function day(v) { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v || "")); return m ? m[1] : ""; }

/** One shown line, reduced to what the journal keeps: features and record numbers, no names. */
function line(l) {
  if (!l || typeof l !== "object") return null;
  const out = { k: oneOf(l.k, LINE_KINDS, "ref"), p: int(l.p, 0, 99) };
  if (l.tier != null) out.tier = text(l.tier, 12);
  if (l.how != null) out.how = text(l.how, 20);
  if (l.sim != null) out.sim = Math.round(num(l.sim) * 1e4) / 1e4;
  if (l.drop != null) out.drop = int(l.drop, 0, 99);
  if (l.stage != null) out.stage = int(l.stage, 0, 99);
  if (Array.isArray(l.flags)) out.flags = l.flags.slice(0, 12).map((f) => text(f, 30));
  if (l.price != null) out.price = num(l.price);
  if (l.date != null) out.date = day(l.date);
  if (l.region != null) out.region = text(l.region, 20);
  if (l.basis != null) out.basis = text(l.basis, 30);
  if (l.rid != null) out.rid = int(l.rid, 0, 1e12);
  if (Array.isArray(l.rids)) out.rids = l.rids.slice(0, 20).map((x) => int(x, 0, 1e12));
  if (l.n != null) out.n = int(l.n, 0, 99);
  if (l.id != null) out.id = text(l.id, 15);
  if (l.same != null) out.same = !!l.same;
  if (l.accepted != null) out.accepted = !!l.accepted;
  if (l.src != null) out.src = oneOf(l.src, ["ref", "uzex", "typed"], "typed");
  if (l.unit != null) out.unit = oneOf(l.unit, ["same", "conv", "derived"], "same");
  return out;
}

/** At most MAX_LINES lines whose JSON fits the field; the chosen one is never the line dropped. */
function lines(list, chosen) {
  let out = (Array.isArray(list) ? list : []).slice(0, MAX_LINES).map(line).filter(Boolean);
  while (out.length && JSON.stringify(out).length > MAX_LINES_JSON) {
    const last = out.length - 1;
    out.splice(last === chosen && last > 0 ? last - 1 : last, 1);
    if (last === chosen && last > 0) chosen = last - 1;
  }
  return { lines: out, chosen: chosen >= out.length ? -1 : chosen };
}

function workspaceOf(body) {
  let ws = null;
  try { ws = $app.findRecordById("workspaces", String((body && body.workspace) || "")); } catch (_) { ws = null; }
  if (!ws) throw new NotFoundError("Рабочая область не найдена");
  const application = ws.getString("application");
  let contragent = "";
  if (application) {
    try { contragent = $app.findRecordById("applications", application).getString("contragent"); } catch (_) { contragent = ""; }
  }
  return { ws: ws, application: application, contragent: contragent };
}

module.exports = {
  limits: { MAX_EVENTS: MAX_EVENTS, MAX_ROWS: MAX_ROWS, MAX_LINES: MAX_LINES, MAX_LINES_JSON: MAX_LINES_JSON },

  /** POST /api/journal/events {workspace, events: [{res_key, name, unit, section, asof, lines, opened, action, chosen, source, source_price, final_price, schema, app_version}]} */
  events(e) {
    const auth = e.auth;
    if (!auth) throw new ForbiddenError("Нужно войти");
    const body = e.requestInfo().body || {};
    const list = Array.isArray(body.events) ? body.events : [];
    if (list.length > MAX_EVENTS) throw new BadRequestError("Слишком много записей за один запрос: " + list.length + " (не больше " + MAX_EVENTS + ")");
    const w = workspaceOf(body);
    const by = auth.isSuperuser() ? "" : auth.id;
    const N = require(`${__hooks}/lib/nlp.js`);
    const checkSource = require(`${__hooks}/lib/corrections.js`).sourceChecker($app);
    const coll = $app.findCollectionByNameOrId("suggest_events");
    let saved = 0;
    $app.runInTransaction((tx) => {
      // the region as it is inside the write (an admin may be moving the application: admin.pb.js)
      const region = tx.findRecordById("workspaces", w.ws.id).getString("region");
      for (const ev of list) {
        if (!ev || typeof ev !== "object") continue;
        const key = text(ev.res_key);
        if (!key) continue;
        const action = oneOf(ev.action, ACTIONS, "");
        if (!action) continue;
        // the line taken, by its place among the lines kept; one beyond them is «none»
        const at = Math.round(num(ev.chosen));
        const ln = lines(ev.lines, ev.chosen == null || at < 0 || at >= MAX_LINES ? -1 : at);
        const rec = new Record(coll);
        rec.set("workspace", w.ws.id);
        rec.set("application", w.application);
        rec.set("contragent", w.contragent);
        rec.set("region", region);
        rec.set("asof", day(ev.asof));
        rec.set("res_key", key);
        rec.set("match_key", N.matchKey(text(ev.name)) || "-");
        rec.set("match_unit_key", N.matchUnitKey(text(ev.unit)));
        rec.set("section", oneOf(ev.section, SECTIONS, "other"));
        rec.set("lines", ln.lines);
        rec.set("opened", !!ev.opened);
        rec.set("action", action);
        rec.set("chosen", ln.chosen);
        rec.set("source", checkSource(ev.source || "typed", ev.source_price).source);
        rec.set("final_price", num(ev.final_price));
        rec.set("schema", int(ev.schema, 0, 1e6));
        rec.set("app_version", text(ev.app_version, 20));
        rec.set("by", by);
        tx.save(rec);
        saved++;
      }
    });
    return e.json(200, { saved: saved });
  },

  /**
   * POST /api/memory/finish {workspace, part, record, rows: [{res_key, name, unit, section, smeta_price, final_price,
   * kind, source, source_price, accepted, asof}]}
   *
   * The prices of a finished application, one row per resource. The first part (part 0) removes what an earlier
   * finish of this workspace left: a second finish replaces, it never adds on top. `record: false` only removes —
   * an application finished «не учитывать в обучении» is not evidence.
   */
  finish(e) {
    const auth = e.auth;
    if (!auth) throw new ForbiddenError("Нужно войти");
    const body = e.requestInfo().body || {};
    const rows = body.record === false ? [] : (Array.isArray(body.rows) ? body.rows : []);
    if (rows.length > MAX_ROWS) throw new BadRequestError("Слишком много строк за один запрос: " + rows.length + " (не больше " + MAX_ROWS + ")");
    const part = int(body.part, 0, 1000);
    const w = workspaceOf(body);
    const by = auth.isSuperuser() ? "" : auth.id;
    const N = require(`${__hooks}/lib/nlp.js`);
    const checkSource = require(`${__hooks}/lib/corrections.js`).sourceChecker($app);
    const coll = $app.findCollectionByNameOrId("price_memory");
    const finished = new Date().toISOString();
    let saved = 0, deleted = 0;
    $app.runInTransaction((tx) => {
      const region = tx.findRecordById("workspaces", w.ws.id).getString("region");
      if (part === 0) {
        deleted = tx.db().newQuery("DELETE FROM price_memory WHERE workspace = {:w}").bind({ w: w.ws.id }).execute().rowsAffected();
      }
      const seen = {};
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const key = text(row.res_key);
        const kind = oneOf(row.kind, KINDS, "");
        if (!key || !kind || seen[key]) continue;
        seen[key] = 1;
        const name = text(row.name), unit = text(row.unit);
        let source = "";
        if (kind === "corrected" || kind === "zeroed") {
          source = row.source === "pct" ? "pct" : checkSource(row.source || "typed", row.source_price).source;
        } else if (kind === "checked") source = oneOf(row.source, ["mark", "finish"], "mark");
        const rec = new Record(coll);
        rec.set("workspace", w.ws.id);
        rec.set("application", w.application);
        rec.set("contragent", w.contragent);
        rec.set("region", region);
        rec.set("res_key", key);
        rec.set("name", name);
        rec.set("unit", unit);
        rec.set("match_key", N.matchKey(name) || "-");
        rec.set("match_unit_key", N.matchUnitKey(unit));
        rec.set("section", oneOf(row.section, SECTIONS, "other"));
        rec.set("smeta_price", num(row.smeta_price));
        rec.set("final_price", num(row.final_price));
        rec.set("kind", kind);
        rec.set("source", source);
        rec.set("asof", day(row.asof));
        rec.set("finished", finished);
        rec.set("accepted", !!row.accepted);
        rec.set("by", by);
        tx.save(rec);
        saved++;
      }
    });
    return e.json(200, { saved: saved, deleted: deleted, finished: finished });
  },

  /**
   * POST /api/memory/accepted {workspace, keys: [res_key]} — the resources whose corrected price the contractor took
   * in the returned estimate («Исправлено» of «Сравнение версий»). Exactly these are marked; the others are not.
   */
  accepted(e) {
    const auth = e.auth;
    if (!auth) throw new ForbiddenError("Нужно войти");
    const body = e.requestInfo().body || {};
    const keys = (Array.isArray(body.keys) ? body.keys : []).map((k) => text(k)).filter(Boolean);
    if (keys.length > MAX_ROWS) throw new BadRequestError("Слишком много строк за один запрос: " + keys.length);
    const w = workspaceOf(body);
    let marked = 0;
    $app.runInTransaction((tx) => {
      tx.db().newQuery("UPDATE price_memory SET accepted = FALSE WHERE workspace = {:w} AND accepted = TRUE").bind({ w: w.ws.id }).execute();
      for (let i = 0; i < keys.length; i += 200) {
        const params = { w: w.ws.id }, marks = [];
        keys.slice(i, i + 200).forEach((k, j) => { params["k" + j] = k; marks.push("{:k" + j + "}"); });
        marked += tx.db().newQuery("UPDATE price_memory SET accepted = TRUE WHERE workspace = {:w} AND kind = 'corrected' AND res_key IN (" + marks.join(",") + ")")
          .bind(params).execute().rowsAffected();
      }
    });
    return e.json(200, { marked: marked });
  },

  /** GET /api/learning/stats — counts only (admin): what has been gathered to learn from. Never a name or a price. */
  stats(e) {
    require(`${__hooks}/lib/admin.js`).requireAdmin(e);
    function groups(sql) {
      const rows = arrayOf(new DynamicModel({ v: "", n: 0 }));
      $app.db().newQuery(sql).all(rows);
      const out = {};
      for (const r of rows) out[r.v || "-"] = r.n;
      return out;
    }
    function one(sql) {
      const rows = arrayOf(new DynamicModel({ n: 0 }));
      $app.db().newQuery(sql).all(rows);
      return rows.length ? rows[0].n : 0;
    }
    return e.json(200, {
      events: groups("SELECT action AS v, COUNT(*) AS n FROM suggest_events GROUP BY action"),
      events_with_lines: one("SELECT COUNT(*) AS n FROM suggest_events WHERE lines != '[]' AND lines != '' AND lines IS NOT NULL"),
      events_opened: one("SELECT COUNT(*) AS n FROM suggest_events WHERE opened = TRUE"),
      memory: groups("SELECT kind AS v, COUNT(*) AS n FROM price_memory GROUP BY kind"),
      memory_sources: groups("SELECT CASE WHEN source LIKE 'ref:%' THEN 'ref' WHEN source LIKE 'hint:%' THEN 'hint' WHEN source LIKE 'uzex:%' THEN 'uzex' " +
        "WHEN source = '' THEN '-' ELSE source END AS v, COUNT(*) AS n FROM price_memory GROUP BY 1"),
      memory_accepted: one("SELECT COUNT(*) AS n FROM price_memory WHERE accepted = TRUE"),
      memory_applications: one("SELECT COUNT(DISTINCT workspace) AS n FROM price_memory"),
      finished: one("SELECT COUNT(*) AS n FROM workspaces WHERE status = 'done'"),
      workspaces: one("SELECT COUNT(*) AS n FROM workspaces"),
      corrections: one("SELECT COUNT(*) AS n FROM corrections"),
    });
  },

  /**
   * GET /api/formats/stats — counts only (admin): the estimates whose format has been recorded (smeta_files,
   * docs/format-reja.md). `doubt`: read, but under nine tenths of the lines have quantity × price = sum. `target`:
   * how many read files the first training waits for.
   */
  formats(e) {
    require(`${__hooks}/lib/admin.js`).requireAdmin(e);
    function one(sql) {
      const rows = arrayOf(new DynamicModel({ n: 0 }));
      $app.db().newQuery(sql).all(rows);
      return rows.length ? rows[0].n : 0;
    }
    const T = "SELECT COUNT(*) AS n FROM smeta_files";
    try {
      return e.json(200, {
        files: one(T),
        read: one(T + " WHERE is_read = TRUE"),
        unread: one(T + " WHERE is_read = FALSE"),
        doubt: one(T + " WHERE is_read = TRUE AND checked > 0 AND score < 0.9"),
        kept: one(T + " WHERE file != ''"),
        formats: one("SELECT COUNT(DISTINCT signature) AS n FROM smeta_files WHERE is_read = TRUE AND signature != ''"),
        formats_unread: one("SELECT COUNT(DISTINCT signature) AS n FROM smeta_files WHERE is_read = FALSE AND signature != ''"),
        lines: one("SELECT COALESCE(SUM(items), 0) AS n FROM smeta_files WHERE is_read = TRUE"),
        target: 100,
      });
    } catch (_) {
      // a database from before this collection: nothing gathered yet
      return e.json(200, { files: 0, read: 0, unread: 0, doubt: 0, kept: 0, formats: 0, formats_unread: 0, lines: 0, target: 100, missing: true });
    }
  },
};
