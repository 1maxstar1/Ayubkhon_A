// The work of one laptop carried to another (server/pb_hooks/transfer.pb.js): what is written, what is read back.
//
// One person works on one computer; two computers each with work of its own are brought together once (the owner's
// decision, 2026-11-18): the applications that have a workspace, with everything that hangs on it — its estimate
// files and state, its price corrections, exports, the journal of decisions and the finished prices — and the samples
// of smeta formats. An application worked on both computers keeps the version changed last; the other one is never
// lost — the database is copied aside (a backup) before anything is taken in.
//
// Fields are named here one by one rather than read from the collections: what crosses from one database to another
// is exactly what is listed, and a field added to the schema later is carried only once it is added here.
const F = {
  contragents: { text: ["inn", "name"] },
  applications: {
    text: ["number", "status", "org_name", "inn", "expert", "coexpert", "expertise_type", "buyer_type", "project_title", "object_id",
      "currency", "place", "branch", "executor_name", "executor_email", "executor_phone", "registered_at", "paid_at", "imported_at"],
    number: ["cost", "cost_vat"], json: ["raw"]
  },
  workspaces: { text: ["region", "status"], number: ["changed"], json: ["state"], files: "files" },
  corrections: {
    text: ["region", "res_key", "name", "name_key", "unit", "unit_key", "match_key", "match_unit_key", "note", "source"],
    number: ["smeta_price", "market_price", "source_price"]
  },
  exports: { text: ["mode"], file: "file" },
  price_memory: {
    text: ["region", "res_key", "name", "unit", "match_key", "match_unit_key", "section", "kind", "source", "asof", "finished"],
    number: ["smeta_price", "final_price"], bool: ["accepted"]
  },
  suggest_events: {
    text: ["region", "asof", "res_key", "match_key", "match_unit_key", "section", "action", "source", "app_version"],
    number: ["chosen", "final_price", "schema"], bool: ["opened"], json: ["lines"]
  },
  smeta_files: {
    text: ["hash", "name", "ws", "reason", "signature", "app_version"],
    number: ["size", "objects", "items", "checked", "score", "version"], bool: ["is_read", "doubt"], json: ["sample"], file: "file"
  }
};
const FORMAT = "smeta-transfer";
const VERSION = 1;

function parseJson(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch (_) { return null; }
}

/** A record as plain data: its id, its dates, the listed fields; a relation as the id it points at. */
function plain(rec, coll, rels) {
  const f = F[coll], o = { id: rec.id, created: rec.getString("created"), updated: rec.getString("updated") };
  (f.text || []).forEach((n) => { o[n] = rec.getString(n); });
  (f.number || []).forEach((n) => { o[n] = rec.getFloat(n); });
  (f.bool || []).forEach((n) => { o[n] = rec.getBool(n); });
  (f.json || []).forEach((n) => { o[n] = parseJson(rec.getString(n)); });
  if (f.files) o[f.files] = rec.getStringSlice(f.files);
  if (f.file) o[f.file] = rec.getString(f.file);
  (rels || []).forEach((n) => { o[n] = rec.getString(n); });
  if (f.files || f.file) o.collectionName = coll;
  return o;
}

/** The listed fields of `data` onto a record (relations and files are the caller's). */
function fill(rec, coll, data) {
  const f = F[coll];
  (f.text || []).forEach((n) => { if (data[n] != null) rec.set(n, String(data[n])); });
  (f.number || []).forEach((n) => { if (data[n] != null && isFinite(+data[n])) rec.set(n, +data[n]); });
  (f.bool || []).forEach((n) => { if (data[n] != null) rec.set(n, !!data[n]); });
  (f.json || []).forEach((n) => { if (data[n] !== undefined) rec.set(n, data[n]); });
}

function all(app, coll) {
  try { return app.findRecordsByFilter(coll, "id != ''", "", 0, 0); } catch (_) { return []; }
}

/** Everything one computer has worked on: GET /api/admin/transfer/export. */
function exportAll(app, version) {
  const wss = all(app, "workspaces");
  const wsIds = {}, appIds = {}, ctIds = {};
  wss.forEach((w) => { wsIds[w.id] = 1; appIds[w.getString("application")] = 1; });
  const apps = all(app, "applications").filter((a) => appIds[a.id]);
  apps.forEach((a) => { if (a.getString("contragent")) ctIds[a.getString("contragent")] = 1; });
  const mine = (coll, rels) => all(app, coll).filter((r) => wsIds[r.getString("workspace")]).map((r) => {
    if (r.getString("contragent")) ctIds[r.getString("contragent")] = 1;
    return plain(r, coll, rels);
  });
  const out = {
    format: FORMAT, version: VERSION, app_version: version || "", created: new Date().toISOString(),
    applications: apps.map((a) => plain(a, "applications", ["contragent"])),
    workspaces: wss.map((w) => plain(w, "workspaces", ["application"])),
    corrections: mine("corrections", ["workspace", "application", "contragent"]),
    exports: mine("exports", ["workspace", "application"]),
    price_memory: mine("price_memory", ["workspace", "application", "contragent"]),
    suggest_events: mine("suggest_events", ["workspace", "application", "contragent"]),
    smeta_files: all(app, "smeta_files").map((r) => plain(r, "smeta_files"))
  };
  out.contragents = all(app, "contragents").filter((c) => ctIds[c.id]).map((c) => plain(c, "contragents"));
  return out;
}

/** Every string in `v` that is a key of `map`, replaced by its value (the stored names of the files in a state). */
function rename(v, map) {
  if (typeof v === "string") return Object.prototype.hasOwnProperty.call(map, v) ? map[v] : v;
  if (Array.isArray(v)) return v.map((x) => rename(x, map));
  if (v && typeof v === "object") {
    const o = {};
    Object.keys(v).forEach((k) => { o[k] = rename(v[k], map); });
    return o;
  }
  return v;
}

/** The dates a record had on the other computer: saved after the record, with SQL (a save stamps its own). */
function keepDates(tx, coll, id, data) {
  if (!data || !data.created || !data.updated) return;
  tx.db().newQuery("UPDATE " + coll + " SET created = {:c}, updated = {:u} WHERE id = {:id}")
    .bind({ c: String(data.created), u: String(data.updated), id: id }).execute();
}

function freeId(tx, coll, id) {
  if (!id || !/^[a-z0-9]{15}$/.test(String(id))) return false;
  try { tx.findRecordById(coll, id); return false; } catch (_) { return true; }
}

/** The contragent of this computer for an INN of the other one: found, or made. Returns its id or "". */
function contragentOf(tx, inn, name) {
  inn = String(inn || "").replace(/\s+/g, "");
  if (!inn) return "";
  try { return tx.findFirstRecordByFilter("contragents", "inn = {:i}", { i: inn }).id; } catch (_) { /* not here yet */ }
  const rec = new Record(tx.findCollectionByNameOrId("contragents"));
  rec.set("inn", inn);
  rec.set("name", String(name || ""));
  tx.save(rec);
  return rec.id;
}

/** The files sent under `key` — none at all is no error (PocketBase throws «no such file» for a key not sent). */
function uploaded(e, key) {
  try { return e.findUploadedFiles(key) || []; } catch (_) { return []; }
}

module.exports = { F, FORMAT, VERSION, plain, fill, exportAll, rename, keepDates, freeId, contragentOf, parseJson, uploaded };
