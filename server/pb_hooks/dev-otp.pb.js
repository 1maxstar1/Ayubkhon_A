/// <reference path="../pb_data/types.d.ts" />
// Laptop and development mode (PB_DEV=1): the one-time sign-in code is not
// emailed. It goes to the log and to pb_data/dev-otp.txt, and the page running
// on this same computer can ask for it back through /api/laptop/otp.
//
// On a server PB_DEV is 0 (server/deploy/install.sh), the code is emailed as
// usual and the route below answers 404 to everybody.
onMailerRecordOTPSend((e) => {
  if ($os.getenv("PB_DEV") !== "1") {
    e.next();
    return;
  }
  const line = new Date().toISOString() + " OTP " + e.record.email() +
    " otpId=" + e.meta.otpId + " code=" + e.meta.password + "\n";
  console.log(line.trim());
  try {
    $os.writeFile($app.dataDir() + "/dev-otp.txt", line, 0o644);
  } catch (err) {
    console.log("dev-otp: could not write file: " + err);
  }
  // no e.next(): the email is deliberately not sent
}, "users");

/*
 * The code, handed back to the page that just asked for it.
 *
 * One person on their own laptop has no mail server and no reason to run one,
 * so without this the sign-in code can only be read out of a terminal window
 * — every morning, for a program whose database is a file on that same disk.
 *
 * Three things keep it to that case:
 *   · PB_LAPTOP=1 — set by server/laptop.sh and laptop.ps1 and by nothing
 *     else, so neither a server nor a developer's own PB_DEV run answers this;
 *   · the request must be the program's own page on this computer, not some
 *     other site open in the same browser (lib/laptop.js);
 *   · the otpId must be the one the last code was issued for, so the answer is
 *     only ever the code the asker has just caused to be made.
 *
 * It hands out nothing that is not already in pb_data/dev-otp.txt, which any
 * program running as this user can read directly. On a laptop with
 * PB_AUTOLOGIN the page does not even get this far (laptop.pb.js); this is
 * what remains when the login has been switched back on.
 */
routerAdd("GET", "/api/laptop/otp", (e) => {
  const gone = () => new NotFoundError("not here");
  if ($os.getenv("PB_LAPTOP") !== "1" || $os.getenv("PB_DEV") !== "1") throw gone();
  if (!require(`${__hooks}/lib/laptop.js`).ownPage(e)) throw gone();

  const want = (e.requestInfo().query || {}).id;
  if (!want) throw gone();

  let line = "";
  try {
    line = toString($os.readFile($app.dataDir() + "/dev-otp.txt")).trim().split("\n").pop();
  } catch (err) {
    throw gone();                       // no code has been asked for yet
  }
  const id = (line.match(/otpId=(\S+)/) || [])[1];
  const code = (line.match(/code=(\S+)/) || [])[1];
  if (!id || !code || id !== want) throw gone();

  return e.json(200, { code: code });
});
