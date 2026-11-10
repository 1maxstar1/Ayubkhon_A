/// <reference path="../pb_data/types.d.ts" />
// UZEX weekly quotes — a second price source, kept apart from the reference packages (collections uzex_imports,
// uzex_quotes, uzex_settings; lib/uzex.js reads the exchange's page and writes them).
//
//   POST /api/uzex/sync[?force=1]  admin; fetches the weeks the site lists that are not stored yet (all, with force)
//   GET  /api/uzex/status          signed in; { auto, last_sync_at, last_sync_status, last_sync_message, last_new_weeks }
//   POST /api/uzex/auto {on}       admin; the «Avtomatik yangilash» switch
//   delete of a stored week        the records API (uzex_imports, admin only); its quotes go with it
//
// By itself, while the switch is on: about half a minute after the server starts (weeks published while the computer
// was off) and once a day at 09:00 Tashkent time (04:00 UTC — PocketBase's cron runs on UTC). A run only reads the
// list of weeks and fetches the ones not stored yet. UZEX_AUTO=0 keeps both quiet (the tests set it); UZEX_BASE
// points the sync at another address (a stand-in for the site, in tests).
//
// Handlers run in isolated VMs, so the work itself lives in a module.

routerAdd("POST", "/api/uzex/sync", (e) => {
  require(`${__hooks}/lib/admin.js`).requireAdmin(e);
  const force = e.request.url.query().get("force") === "1";
  return e.json(200, require(`${__hooks}/lib/uzex.js`).sync($app, { force: force }));
}, $apis.requireAuth());

routerAdd("GET", "/api/uzex/status", (e) => {
  return e.json(200, require(`${__hooks}/lib/uzex.js`).status($app));
}, $apis.requireAuth());

routerAdd("POST", "/api/uzex/auto", (e) => {
  require(`${__hooks}/lib/admin.js`).requireAdmin(e);
  const body = e.requestInfo().body || {};
  return e.json(200, require(`${__hooks}/lib/uzex.js`).setAuto($app, body.on !== false));
}, $apis.requireAuth());

onBootstrap((e) => {
  e.next();
  $app.store().set("uzex_boot_at", Date.now());
});

// every minute, but only the first one that comes half a minute after the start does anything
cronAdd("uzex-catchup", "* * * * *", () => {
  require(`${__hooks}/lib/uzex.js`).catchUp($app);
});

cronAdd("uzex-daily", "0 4 * * *", () => {
  require(`${__hooks}/lib/uzex.js`).auto($app, "daily");
});
