/// <reference path="../pb_data/types.d.ts" />
// GET /api/admin/health — the things nobody watches.
//
// Handlers run in isolated VMs, so the work itself lives in a module.
routerAdd("GET", "/api/admin/health", (e) => {
  return require(`${__hooks}/lib/health.js`).report(e);
}, $apis.requireAuth());
