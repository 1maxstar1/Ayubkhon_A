/// <reference path="../pb_data/types.d.ts" />
// Development only: with PB_DEV=1 the one-time code is written to the log and
// to pb_data/dev-otp.txt instead of being emailed, so sign-in works without SMTP.
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
