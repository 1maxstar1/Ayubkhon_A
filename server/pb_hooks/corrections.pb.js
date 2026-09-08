/// <reference path="../pb_data/types.d.ts" />
// POST /api/corrections/bulk  {workspace, set:[{res_key,name,unit,smeta_price,market_price,note}], del:[res_key]}
//
// Every price the page has to write, in one request. See lib/corrections.js
// for why: a bulk price change used to be one HTTP create per resource, and
// the deployed rate limit threw almost all of them away.
//
// Handlers run in isolated VMs, so the work itself lives in a module.
routerAdd("POST", "/api/corrections/bulk", (e) => {
  return require(`${__hooks}/lib/corrections.js`).bulk(e);
}, $apis.requireAuth());
