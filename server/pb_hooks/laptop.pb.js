/// <reference path="../pb_data/types.d.ts" />
/*
 * One person on their own computer: no sign-in at all.
 *
 * The program was built for an office — a login by e-mail code, a lock after
 * four hours without activity, «Выйти». On a laptop that only its owner uses,
 * all of that is a door with nobody behind it, opened every morning (owner's
 * decision, 2026-10). So the page asks here first, and on a laptop it is
 * handed the session of the one person the laptop belongs to.
 *
 * Nothing else changes: the person still has an account, every price they
 * write is still recorded as theirs, and the rules still apply — which is
 * what lets the login come back unchanged the day there is a second person.
 * It comes back by itself wherever PB_AUTOLOGIN is not set: server/lan.sh,
 * a VPS, a developer's run.sh. server/laptop.sh and laptop.ps1 set it.
 */
/*
 * Every refusal is a 404 — to anything outside, the route is simply not there
 * — but each says which reason it was. On the laptop the login screen shows
 * that reason, so a screenshot of an unexpected login says why: started some
 * other way than the launcher, the account missing, and so on.
 */
routerAdd("POST", "/api/laptop/signin", (e) => {
  const no = (why) => new NotFoundError(why);
  if ($os.getenv("PB_LAPTOP") !== "1") throw no("not-laptop");
  if ($os.getenv("PB_AUTOLOGIN") !== "1") throw no("autologin-off");
  if (!require(`${__hooks}/lib/laptop.js`).ownPage(e)) throw no("not-own-page");

  // The launcher names the person. Nobody named, nobody signed in.
  const email = $os.getenv("PB_AUTOLOGIN_EMAIL");
  if (!email) throw no("no-email");
  let user = null;
  try {
    user = $app.findAuthRecordByEmail("users", email);
  } catch (err) {
    user = null;
  }
  if (!user) throw no("no-user");
  if (!user.getBool("active")) throw no("inactive");
  return $apis.recordAuthResponse(e, user, "laptop", null);
});
