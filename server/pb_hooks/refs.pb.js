/// <reference path="../pb_data/types.d.ts" />
// Reference-price packages (collection ref_packages): one stored .json.gz file per snapshot of the price documents,
// uploaded by an administrator from admin.html and read by every expert's browser, which derives its own keys from
// it (src/lib/refs). The server never opens the file — parsing 45 MB of JSON here would take seconds and hundreds of
// megabytes in every hook VM —; it checks only the small manifest the page sends with it.
//
//   create  admin only; the manifest must describe a full smeta-refs v1 package with the same id, hash and counts as
//           the fields; the first package becomes the active one by itself
//   update  the content of a package never changes after the upload (a correction's source names a package and its
//           record numbers); only the note may be edited, and `active` only through the route below
//   delete  never the active package
//   POST /api/refs/{id}/activate   makes this package the only active one, in one transaction
//
// Handlers run in isolated VMs, so the work itself lives in a module.

onRecordCreateRequest((e) => {
  require(`${__hooks}/lib/refs.js`).onCreate(e);
}, "ref_packages");

onRecordUpdateRequest((e) => {
  require(`${__hooks}/lib/refs.js`).onUpdate(e);
}, "ref_packages");

onRecordDeleteRequest((e) => {
  require(`${__hooks}/lib/refs.js`).onDelete(e);
}, "ref_packages");

routerAdd("POST", "/api/refs/{id}/activate", (e) => {
  return require(`${__hooks}/lib/refs.js`).activate(e);
}, $apis.requireAuth());
