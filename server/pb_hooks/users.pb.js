/// <reference path="../pb_data/types.d.ts" />
// Turning an account off ends its sessions.
//
// users.authRule is "active = true", but a rule like that is read when a token
// is issued, not when one is used. An expert who left the firm therefore kept
// working for the rest of their token's four hours: reading the whole registry,
// opening any application, writing prices, marking work finished. The admin
// had pressed «Отключить», seen the row turn to «отключён», and believed
// access was gone.
//
// Rotating the record's token key invalidates every token already issued for
// it. It has to happen on the record that is already being saved, before
// e.next(): rotating it afterwards in a second save deadlocks the request —
// the account is disabled but the PATCH never returns, so «Отключить» spins
// forever.
onRecordUpdate((e) => {
  if (e.record.original().getBool("active") && !e.record.getBool("active")) {
    e.record.refreshTokenKey();
  }
  e.next();
}, "users");
