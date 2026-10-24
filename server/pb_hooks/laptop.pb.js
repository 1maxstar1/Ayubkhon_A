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
routerAdd("POST", "/api/laptop/signin", (e) => {
  const gone = () => new NotFoundError("not here");
  if ($os.getenv("PB_LAPTOP") !== "1" || $os.getenv("PB_AUTOLOGIN") !== "1") throw gone();
  if (!require(`${__hooks}/lib/laptop.js`).ownPage(e)) throw gone();

  // The launcher names the person. Nobody named, nobody signed in.
  const email = $os.getenv("PB_AUTOLOGIN_EMAIL");
  if (!email) throw gone();
  let user = null;
  try {
    user = $app.findAuthRecordByEmail("users", email);
  } catch (err) {
    user = null;
  }
  if (!user || !user.getBool("active")) throw gone();
  return $apis.recordAuthResponse(e, user, "laptop", null);
});
