/// <reference path="../pb_data/types.d.ts" />
// The work of one laptop brought to another (the owner's decision, 2026-11-18: two computers, each with work of its
// own, brought together once). The admin page (src/ui/transfer-admin.js) carries the files; these routes give and take
// the records. Admin only. What crosses, and why field by field — lib/transfer.js.
//
//   GET  /api/admin/transfer/export            -> everything worked on here: applications with a workspace, their
//                                                 workspaces, corrections, exports, journal, finished prices, contragents,
//                                                 samples of smeta formats (files are fetched by the page, by name)
//   POST /api/admin/transfer/backup            -> the database copied aside before anything is taken in; its name
//   POST /api/admin/transfer/workspace         -> one application's work from the other computer (multipart: `data`, the
//                                                 workspace's files as `files`, the exports' as `exp`), in one transaction:
//                                                   no workspace here       -> added
//                                                   one changed later here  -> kept, the other one not taken
//                                                   one changed earlier     -> replaced (it stays in the backup)
//   POST /api/admin/transfer/formats           -> samples of smeta formats this computer does not have (by hash)

routerAdd("GET", "/api/admin/transfer/export", (e) => {
  const T = require(`${__hooks}/lib/transfer.js`);
  require(`${__hooks}/lib/admin.js`).requireAdmin(e);
  return e.json(200, T.exportAll($app, String(e.request.url.query().get("v") || "")));
}, $apis.requireAuth());

routerAdd("POST", "/api/admin/transfer/backup", (e) => {
  require(`${__hooks}/lib/admin.js`).requireAdmin(e);
  const d = new Date(), p = (n) => (n < 10 ? "0" : "") + n;
  const name = "before-transfer-" + d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + "-" +
    p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + ".zip";
  try { $app.createBackup(e.request.context(), name); }
  catch (err) { throw new BadRequestError("Резервная копия не создана — ничего не загружено: " + err); }
  return e.json(200, { name: name });
}, $apis.requireAuth());

routerAdd("POST", "/api/admin/transfer/workspace", (e) => {
  const T = require(`${__hooks}/lib/transfer.js`);
  const { requireAdmin, deleteWhere, forget } = require(`${__hooks}/lib/admin.js`);
  requireAdmin(e);
  const d = T.parseJson(String((e.requestInfo().body || {}).data || ""));
  if (!d || !d.application || !d.workspace) throw new BadRequestError("Нет данных заявки");
  const number = String(d.application.number || "").trim();
  if (!number) throw new BadRequestError("Нет номера заявки");
  const files = T.uploaded(e, "files"), exp = T.uploaded(e, "exp");
  const names = d.workspace.files || [];
  if (files.length !== names.length) throw new BadRequestError("№ " + number + ": получено файлов " + files.length + " из " + names.length);
  const withFile = (d.exports || []).filter((x) => x.file);
  if (exp.length !== withFile.length) throw new BadRequestError("№ " + number + ": получено экспортов " + exp.length + " из " + withFile.length);
  const me = e.auth && !e.auth.isSuperuser() ? e.auth.id : "";
  let result = "", local = "";
  const counts = { files: files.length, corrections: 0, exports: 0, price_memory: 0, suggest_events: 0 };

  try { $app.runInTransaction((tx) => {
    const coll = {};
    const C = (n) => coll[n] || (coll[n] = tx.findCollectionByNameOrId(n));
    // the contragents by INN: the same company has another id on each computer
    const ctOf = {};
    (d.contragents || []).forEach((c) => { ctOf[c.id] = T.contragentOf(tx, c.inn, c.name); });
    // the application by its number: the registry of each computer was loaded on its own
    let appRec = null;
    try { appRec = tx.findFirstRecordByFilter("applications", "number = {:n}", { n: number }); } catch (_) { /* not in this registry */ }
    if (!appRec) {
      appRec = new Record(C("applications"));
      T.fill(appRec, "applications", d.application);
      appRec.set("number", number);
      if (d.application.contragent && ctOf[d.application.contragent]) appRec.set("contragent", ctOf[d.application.contragent]);
      tx.save(appRec);
      T.keepDates(tx, "applications", appRec.id, d.application);
    }
    let old = null;
    try { old = tx.findFirstRecordByFilter("workspaces", "application = {:a}", { a: appRec.id }); } catch (_) { /* no work here */ }
    if (old) {
      local = old.getString("updated");
      // the version changed last stays (dates as PocketBase writes them: «YYYY-MM-DD HH:MM:SS.sssZ», compared as text)
      if (local >= String(d.workspace.updated || "")) { result = "kept"; return; }
      deleteWhere(tx, "corrections", "workspace", old.id);
      deleteWhere(tx, "exports", "workspace", old.id);
      forget(tx, old.id);
      tx.delete(old);
      result = "replaced";
    } else result = "added";

    const w = new Record(C("workspaces"));
    // the same id where it is free: the finished prices are named after it (lib/learning.js), and «mem:» sources too
    if (T.freeId(tx, "workspaces", d.workspace.id)) w.set("id", d.workspace.id);
    w.set("application", appRec.id);
    T.fill(w, "workspaces", d.workspace);
    w.set("state", {});
    if (files.length) w.set("files", files);
    if (me) { w.set("opened_by", me); w.set("updated_by", me); }
    tx.save(w);
    // stored again here, the files have new names: the state points at them by name
    const now = w.getStringSlice("files"), map = {};
    names.forEach((n, i) => { if (now[i]) map[n] = now[i]; });
    w.set("state", T.rename(d.workspace.state || {}, map));
    tx.save(w);

    const put = (name, rows, rel) => {
      let n = 0;
      (rows || []).forEach((r) => {
        const rec = new Record(C(name));
        if (T.freeId(tx, name, r.id)) rec.set("id", r.id);
        T.fill(rec, name, r);
        rec.set("workspace", w.id);
        rec.set("application", appRec.id);
        if (rel) rel(rec, r);
        if (me) rec.set("by", me);
        tx.save(rec);
        T.keepDates(tx, name, rec.id, r);
        n++;
      });
      return n;
    };
    const ct = (rec, r) => { if (r.contragent && ctOf[r.contragent]) rec.set("contragent", ctOf[r.contragent]); };
    counts.corrections = put("corrections", d.corrections, ct);
    counts.price_memory = put("price_memory", d.price_memory, ct);
    counts.suggest_events = put("suggest_events", d.suggest_events, ct);
    let k = 0;
    counts.exports = put("exports", withFile, (rec) => { rec.set("file", exp[k++]); });
    T.keepDates(tx, "workspaces", w.id, d.workspace);
  }); } catch (err) {
    // nothing of this application was taken in (one transaction): said with the reason, for the page to show
    throw new BadRequestError("№ " + number + ": " + String(err && err.message || err).slice(0, 300));
  }
  return e.json(200, { result: result, number: number, local: local, incoming: String(d.workspace.updated || ""), counts: result === "kept" ? {} : counts });
}, $apis.requireAuth(), $apis.bodyLimit(0));

routerAdd("POST", "/api/admin/transfer/formats", (e) => {
  const T = require(`${__hooks}/lib/transfer.js`);
  require(`${__hooks}/lib/admin.js`).requireAdmin(e);
  const rows = T.parseJson(String((e.requestInfo().body || {}).data || "")) || [];
  const files = T.uploaded(e, "files");
  const me = e.auth && !e.auth.isSuperuser() ? e.auth.id : "";
  let added = 0, k = 0;
  $app.runInTransaction((tx) => {
    const coll = tx.findCollectionByNameOrId("smeta_files");
    rows.forEach((r) => {
      const file = r.withFile ? files[k++] : null;
      if (!r.hash) return;
      try { tx.findFirstRecordByFilter("smeta_files", "hash = {:h}", { h: String(r.hash) }); return; } catch (_) { /* not here: taken */ }
      const rec = new Record(coll);
      if (T.freeId(tx, "smeta_files", r.id)) rec.set("id", r.id);
      T.fill(rec, "smeta_files", r);
      if (file) rec.set("file", file);
      if (me) rec.set("by", me);
      tx.save(rec);
      T.keepDates(tx, "smeta_files", rec.id, r);
      added++;
    });
  });
  return e.json(200, { added: added, of: rows.length });
}, $apis.requireAuth(), $apis.bodyLimit(0));
