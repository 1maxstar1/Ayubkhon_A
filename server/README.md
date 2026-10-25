# Server (PocketBase)

```sh
PB_ADMIN_EMAIL=admin@example.com PB_ADMIN_PASS=change-me-1234 ./setup.sh   # once
./run.sh                                                                  # http://127.0.0.1:8090
```

* `setup.sh` — downloads the binary, creates/updates the superuser and imports
  `pb_schema.json` (collections, rules, OTP + 4-hour token on `users`).
  Safe to re-run; it merges, never deletes.
* `run.sh` — dev server with `PB_DEV=1`: one-time codes are written to the log
  and `pb_data/dev-otp.txt` instead of being emailed. Frontend is served from
  `pb_public/` (`node build.mjs --serve` copies the build there).
* `laptop.sh` — the whole program on one person's own machine: set-up, a
  launchd agent that starts it at login, a daily backup copied out to
  `~/Backups/smeta`, `PB_LAPTOP=1`, which lets the page ask for its own
  sign-in code (`/api/laptop/otp`, `pb_hooks/dev-otp.pb.js`), and
  `PB_AUTOLOGIN=1`, which skips the sign-in altogether
  (`/api/laptop/signin`, `pb_hooks/laptop.pb.js`). Both answer only the
  program's own page on this machine (`pb_hooks/lib/laptop.js`). Nothing in it is specific to one computer, so the
  same `pb_data` can later be served to the office by `lan.sh` or pushed to a
  VPS.
* `laptop.cmd` / `laptop.ps1` — the same on Windows, for Windows PowerShell 5.1
  and without Node or Git: the pages come from `dist/`, PocketBase is
  downloaded on first run, and the data lives in `%LOCALAPPDATA%\Taqqoslash`
  so a new version unpacked over the folder leaves it alone. Autostart is a
  shortcut in the Startup folder; what it starts (`laptop.ps1 serve`) keeps the
  server alive, takes the daily backup, copies it into Google Drive when Drive
  for desktop is there (`laptop.cmd drive`), and installs new releases by
  itself: it reads `releases.txt` every 6 hours, downloads the listed commit,
  refuses one whose launcher does not parse, backs up, keeps the old version
  in `%LOCALAPPDATA%\Taqqoslash\previous`, and keeps the new one only if it
  comes up and signs in — otherwise it puts the old one back and never tries
  that release again by itself (`laptop.cmd rollback` does the same by hand).
  Tested off Windows by `test/laptop-windows.sh` under PowerShell 7 with the
  Linux binary.
* `releases.txt` — what the Windows laptops install by themselves, one line
  per release: `v2.4.0 <commit>`. Add the line in a commit after the release
  commit (the one whose `package.json` carries that version and whose `dist/`
  was built from it); the laptops take it within 6 hours, at sign-in or out of
  working hours.
* `pb_hooks/` — server-side JS: `dev-otp.pb.js` (above), `registry.pb.js`
  (registry import, phase 3).
* Env: `PB_DATA_DIR` (default `pb_data`), `PB_HTTP` (default `127.0.0.1:8090`).

Users sign in with email + one-time code only; password auth is disabled.
Only users created by an admin (with `active = true`) can sign in.
