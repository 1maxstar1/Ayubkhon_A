/// <reference path="../pb_data/types.d.ts" />
// Who did what, decided by the server.
//
// Every record of work carries the person it belongs to — a workspace its
// opener, a price correction and an export their author — and those fields
// arrived from the browser, which simply sent whatever it liked. Nothing
// checked them, so an expert could attribute a price change to a colleague,
// and the «кто последний работал» warning could name the wrong person. The
// records are the only account of who priced what, and an account anybody can
// write is not an account.
//
// This does not change who may do what: any expert may still open any
// application and work on it, and two of them may work on one, last save
// winning, exactly as before. It changes only whose name ends up on it.
//
// Superusers are left alone: the installer, the tests and the maintenance
// endpoints create records on somebody else's behalf, and they have no user
// record of their own to be stamped with.

// Handlers run in isolated VMs, so the stamping itself lives in a module.

onRecordCreateRequest((e) => {
  require(`${__hooks}/lib/ownership.js`).stamp(e, "create");
}, "workspaces", "corrections", "exports");

onRecordUpdateRequest((e) => {
  require(`${__hooks}/lib/ownership.js`).stamp(e, "update");
}, "workspaces", "corrections", "exports");
