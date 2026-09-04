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
