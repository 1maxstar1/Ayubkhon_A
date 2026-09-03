/// <reference path="../pb_data/types.d.ts" />
// POST /api/registry/import  {rows:[{number, inn, org_name, ...}]}
// Admin only. Matches rows by application number: new -> created, existing ->
// updated. Nothing is ever deleted. Contragents are keyed by INN (STIR).
routerAdd("POST", "/api/registry/import", (e) => {
  const auth = e.auth;
  if (!auth || !(auth.isSuperuser() || auth.get("role") === "admin")) {
    throw new ForbiddenError("Faqat administrator");
  }
  const body = e.requestInfo().body || {};
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const FIELDS = ["status", "registered_at", "paid_at", "org_name", "inn", "expert", "coexpert",
    "expertise_type", "buyer_type", "project_title", "object_id", "cost", "cost_vat", "currency",
    "place", "branch", "executor_name", "executor_email", "executor_phone", "raw"];
  let added = 0, updated = 0, contragents = 0;
  const now = new Date().toISOString();

  $app.runInTransaction((tx) => {
    const apps = tx.findCollectionByNameOrId("applications");
    const cons = tx.findCollectionByNameOrId("contragents");
    for (const row of rows) {
      const number = String(row.number || "").trim();
      if (!number) continue;

      let contragentId = "";
      const inn = String(row.inn || "").trim();
      if (inn) {
        let c = null;
        try { c = tx.findFirstRecordByData("contragents", "inn", inn); } catch (_) { c = null; }
        if (!c) {
          c = new Record(cons);
          c.set("inn", inn);
          c.set("name", row.org_name || "");
          tx.save(c);
          contragents++;
        } else if (row.org_name && c.get("name") !== row.org_name) {
          c.set("name", row.org_name);
          tx.save(c);
        }
        contragentId = c.id;
      }

      let a = null;
      try { a = tx.findFirstRecordByData("applications", "number", number); } catch (_) { a = null; }
      const isNew = !a;
      if (isNew) { a = new Record(apps); a.set("number", number); }
      for (const f of FIELDS) {
        if (row[f] === undefined) continue;
        a.set(f, row[f] === null ? "" : row[f]);
      }
      a.set("contragent", contragentId);
      a.set("imported_at", now);
      tx.save(a);
      if (isNew) added++; else updated++;
    }
  });

  return e.json(200, { added: added, updated: updated, contragents: contragents, rows: rows.length });
}, $apis.requireAuth());
