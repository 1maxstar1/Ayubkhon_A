/// <reference path="../pb_data/types.d.ts" />
// Admin-only maintenance endpoints. Each runs in one transaction so a
// half-finished clean-up cannot be left behind.
//   POST   /api/admin/workspaces/{id}/clear  -> files, state, corrections and
//                                               exports removed; region kept
//   DELETE /api/admin/workspaces/{id}        -> workspace gone (corrections and
//                                               exports cascade); the
//                                               application stays in the registry
//   DELETE /api/admin/applications/{id}      -> application and its workspaces
//   GET    /api/registry/facets              -> distinct values for the list filters

// Handlers run in isolated VMs, so shared helpers come from a module.

routerAdd("POST", "/api/admin/workspaces/{id}/clear", (e) => {
  const { requireAdmin, deleteWhere } = require(`${__hooks}/lib/admin.js`);
  requireAdmin(e);
  const id = e.request.pathValue("id");
  let corrections = 0, exports = 0;
  $app.runInTransaction((tx) => {
    const w = tx.findRecordById("workspaces", id);
    corrections = deleteWhere(tx, "corrections", "workspace", id);
    exports = deleteWhere(tx, "exports", "workspace", id);
    w.set("files", []);
    w.set("state", {});
    w.set("changed", 0);
    w.set("status", "in_progress");
    if (e.auth && !e.auth.isSuperuser()) w.set("updated_by", e.auth.id);
    tx.save(w);
  });
  return e.json(200, { cleared: id, corrections: corrections, exports: exports });
}, $apis.requireAuth());

routerAdd("DELETE", "/api/admin/workspaces/{id}", (e) => {
  const { requireAdmin, deleteWhere } = require(`${__hooks}/lib/admin.js`);
  requireAdmin(e);
  const id = e.request.pathValue("id");
  $app.runInTransaction((tx) => {
    const w = tx.findRecordById("workspaces", id);
    deleteWhere(tx, "corrections", "workspace", id);
    deleteWhere(tx, "exports", "workspace", id);
    tx.delete(w);
  });
  return e.json(200, { deleted: id });
}, $apis.requireAuth());

routerAdd("DELETE", "/api/admin/applications/{id}", (e) => {
  const { requireAdmin, deleteWhere } = require(`${__hooks}/lib/admin.js`);
  requireAdmin(e);
  const id = e.request.pathValue("id");
  let workspaces = 0;
  $app.runInTransaction((tx) => {
    const a = tx.findRecordById("applications", id);
    const ws = tx.findRecordsByFilter("workspaces", "application = {:id}", "", 0, 0, { id: id });
    for (const w of ws) {
      deleteWhere(tx, "corrections", "workspace", w.id);
      deleteWhere(tx, "exports", "workspace", w.id);
      tx.delete(w);
      workspaces++;
    }
    // corrections / exports that point at the application without a workspace
    deleteWhere(tx, "corrections", "application", id);
    deleteWhere(tx, "exports", "application", id);
    tx.delete(a);
  });
  return e.json(200, { deleted: id, workspaces: workspaces });
}, $apis.requireAuth());

// Distinct values of the categorical registry columns, for the filter menus.
// A plain SELECT DISTINCT is far cheaper than paging 28 000 records to the browser.
routerAdd("GET", "/api/registry/facets", (e) => {
  if (!e.auth) throw new ForbiddenError("Kirish kerak");
  const out = {};
  for (const col of ["expertise_type", "buyer_type", "status", "currency"]) {
    const rows = arrayOf(new DynamicModel({ v: "", n: 0 }));
    $app.db().newQuery("SELECT " + col + " AS v, COUNT(*) AS n FROM applications WHERE " + col + " != '' GROUP BY " + col + " ORDER BY n DESC").all(rows);
    out[col] = rows.map((r) => ({ v: r.v, n: r.n }));
  }
  return e.json(200, out);
}, $apis.requireAuth());

// Safety net for databases created before applications carried a unique index
// on `number`: collapse any application that exists more than once, keeping the
// record work already points at, and moving workspaces, corrections and exports
// of the extra copies onto it.
routerAdd("POST", "/api/admin/dedupe", (e) => {
  const { requireAdmin } = require(`${__hooks}/lib/admin.js`);
  requireAdmin(e);
  const dupes = arrayOf(new DynamicModel({ number: "", n: 0 }));
  $app.db().newQuery("SELECT number, COUNT(*) AS n FROM applications GROUP BY number HAVING n > 1").all(dupes);
  let groups = 0, removed = 0, skipped = 0;
  for (const d of dupes) {
    const list = $app.findRecordsByFilter("applications", "number = {:n}", "-imported_at", 0, 0, { n: d.number });
    if (list.length < 2) continue;
    groups++;
    let keep = list[0];
    for (const a of list) {
      if ($app.findRecordsByFilter("workspaces", "application = {:id}", "", 1, 0, { id: a.id }).length) { keep = a; break; }
    }
    for (const a of list) {
      if (a.id === keep.id) continue;
      try {
        $app.runInTransaction((tx) => {
          for (const coll of ["workspaces", "corrections", "exports"]) {
            for (const r of tx.findRecordsByFilter(coll, "application = {:id}", "", 0, 0, { id: a.id })) {
              r.set("application", keep.id);
              tx.save(r);
            }
          }
          tx.delete(a);
        });
        removed++;
      } catch (err) {
        // e.g. the kept application already has a workspace: never orphan work
        skipped++;
        $app.logger().warn("dedupe: kept a copy", "number", d.number, "id", a.id, "error", String(err));
      }
    }
  }
  return e.json(200, { groups: groups, removed: removed, skipped: skipped });
}, $apis.requireAuth());

// Undo a registry upload: removes the applications that upload created, keeps
// any an expert has already worked on, then drops the history line itself.
// {preview: true} only counts, so the admin sees the number before confirming.
// Uploads made before the app recorded its numbers fall back to the records
// created while that upload was running.
routerAdd("POST", "/api/admin/imports/{id}/revert", (e) => {
  const { requireAdmin } = require(`${__hooks}/lib/admin.js`);
  requireAdmin(e);
  const id = e.request.pathValue("id");
  const preview = !!(e.requestInfo().body || {}).preview;
  const imp = $app.findRecordById("registry_imports", id);

  // A json field comes back as raw JSON bytes, which look like an array of
  // byte values to JS — toString() turns them into the text to parse.
  let numbers = [];
  let source = "recorded";
  const stored = imp.get("created_numbers");
  if (stored != null) {
    let text = "";
    try { text = toString(stored); } catch (_) { text = ""; }
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) numbers = parsed.map((n) => String(n));
      } catch (_) { numbers = []; }
    }
  }
  // Plain SQL, not a record filter: an upload can carry tens of thousands of
  // numbers, far past the length a filter expression may have.
  const ids = [];
  if (numbers.length) {
    for (let i = 0; i < numbers.length; i += 200) {
      const chunk = numbers.slice(i, i + 200);
      const params = {};
      const marks = chunk.map((v, k) => { params["n" + k] = String(v); return "{:n" + k + "}"; });
      const found = arrayOf(new DynamicModel({ id: "" }));
      $app.db().newQuery("SELECT id FROM applications WHERE number IN (" + marks.join(",") + ")").bind(params).all(found);
      for (const r of found) ids.push(r.id);
    }
  } else {
    // Legacy upload: the applications born while it ran, one hour back at most.
    source = "by time";
    const rows = arrayOf(new DynamicModel({ id: "" }));
    $app.db().newQuery(
      "SELECT id FROM applications WHERE created <= {:end} AND created >= datetime({:end}, '-60 minutes')"
    ).bind({ end: imp.get("created") }).all(rows);
    for (const r of rows) ids.push(r.id);
  }

  // One query for every application an expert has opened, instead of one per row.
  const busy = {};
  const opened = arrayOf(new DynamicModel({ application: "" }));
  $app.db().newQuery("SELECT DISTINCT application FROM workspaces").all(opened);
  for (const w of opened) busy[w.application] = true;
  const worked = [], plain = [];
  for (const appId of ids) (busy[appId] ? worked : plain).push(appId);
  if (preview) {
    return e.json(200, { source: source, deletable: plain.length, kept: worked.length, total: ids.length });
  }

  $app.runInTransaction((tx) => {
    for (let i = 0; i < plain.length; i += 200) {
      const chunk = plain.slice(i, i + 200);
      const params = {};
      const marks = chunk.map((v, k) => { params["p" + k] = v; return "{:p" + k + "}"; });
      tx.db().newQuery("DELETE FROM applications WHERE id IN (" + marks.join(",") + ")").bind(params).execute();
    }
    tx.delete(imp);
  });
  $app.logger().info("registry upload reverted", "import", id, "deleted", String(plain.length), "kept", String(worked.length));
  return e.json(200, { source: source, deleted: plain.length, kept: worked.length });
}, $apis.requireAuth());
