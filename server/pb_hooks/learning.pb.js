/// <reference path="../pb_data/types.d.ts" />
// What the program keeps to learn from (docs/ai-reja.md): written only through these routes.
//   POST /api/journal/events    a batch of decisions on suggestions (suggest_events)
//   POST /api/memory/finish     the prices of a finished application (price_memory); a second finish replaces
//   POST /api/memory/accepted   which corrected prices the contractor took («Сравнение версий»)
//   GET  /api/learning/stats    counts only, for the admin page
//   GET  /api/formats/stats     counts only: the formats of the estimates gathered so far (docs/format-reja.md)
//
// Handlers run in isolated VMs, so the work itself lives in a module.
routerAdd("POST", "/api/journal/events", (e) => {
  return require(`${__hooks}/lib/learning.js`).events(e);
}, $apis.requireAuth());

routerAdd("POST", "/api/memory/finish", (e) => {
  return require(`${__hooks}/lib/learning.js`).finish(e);
}, $apis.requireAuth());

routerAdd("POST", "/api/memory/accepted", (e) => {
  return require(`${__hooks}/lib/learning.js`).accepted(e);
}, $apis.requireAuth());

routerAdd("GET", "/api/learning/stats", (e) => {
  return require(`${__hooks}/lib/learning.js`).stats(e);
}, $apis.requireAuth());

routerAdd("GET", "/api/formats/stats", (e) => {
  return require(`${__hooks}/lib/learning.js`).formats(e);
}, $apis.requireAuth());

// the same, on the administrator's word (and for the tests): what it put right
routerAdd("POST", "/api/admin/learning/repair", (e) => {
  require(`${__hooks}/lib/admin.js`).requireAdmin(e);
  return e.json(200, require(`${__hooks}/lib/learning.js`).repair($app));
}, $apis.requireAuth());

// data of the versions before v2.16.1, put right once (lib/learning.js repair): a second start finds nothing to do
onBootstrap((e) => {
  e.next();
  try {
    const r = require(`${__hooks}/lib/learning.js`).repair($app);
    if (r.regions || r.ids) $app.logger().info("learning data repaired at start-up", "regions", String(r.regions), "ids", String(r.ids));
  } catch (err) {
    $app.logger().warn("learning data repair skipped", "error", String(err));
  }
});
