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
  itself. An install never writes into the program folder: each release is
  unpacked into `%LOCALAPPDATA%\Taqqoslash\app\<version>-<commit>`, and
  `current.txt` names the one that runs — the program folder's launcher hands
  every command except `stop` and `rollback` to that version's launcher. The
  supervisor reads `releases.txt` every 6 hours; a newer release goes in at
  sign-in or after 20 minutes without keyboard or mouse input (less when the
  power plan sleeps sooner; while a release waits, idle is checked every
  minute). It is refused if the version inside differs, its launcher does not
  parse or does not answer `selftest`; otherwise the database is backed up (no
  backup, no update) and the new version's own launcher is started
  (`serve trial`). It runs the supervisor's round once without installing,
  then judges its own health (its own `Is-Current`) and says so in `trial.ok`;
  when it has been healthy `$Settle` rounds in a row `current.txt` moves to it,
  it takes over `autostart.pid` and must finish one full round
  (`supervisor.beat`) before the old supervisor leaves - otherwise the
  pointers go back. A trial whose installer has gone (a closed window) gives
  way by itself. A release that fails is remembered by version and commit and
  never tried again by itself. Started through the program folder (as at
  sign-in), the program folder's launcher stays as a watchdog of the version's
  supervisor (`watchdog.pid`): it restarts one that dies and, after three
  deaths within a week of the switch, goes back to the previous version; a
  version that cannot start its server three times running does the same, or
  takes a fixed release if there is nothing to go back to. `laptop.cmd
  rollback` swaps the two pointers by hand. The full contract between versions
  is at the top of `laptop.ps1`. Tested off Windows by `test/laptop-windows.sh` under
  PowerShell 7 with the Linux binary; `PSA=…/PSScriptAnalyzer.psd1` adds a
  Windows PowerShell 5.1 compatibility check.
* `releases.txt` — what the Windows laptops install by themselves (and what
  `install-windows.ps1` installs), one line per release: `v2.4.0 <commit>`.
  Add the line in a commit after the release commit (the one whose
  `package.json` carries that version and whose `dist/` was built from it).
  Never reuse a version number: to fix a bad release, release the next patch
  version. A release that changes `$PbVersion` gets its own PocketBase binary
  (`pocketbase-<version>.exe`); mind that a newer PocketBase may migrate the
  database in a way an older one cannot read.
* `pb_hooks/` — server-side JS: `dev-otp.pb.js` (above), `registry.pb.js`
  (registry import, phase 3).
* Env: `PB_DATA_DIR` (default `pb_data`), `PB_HTTP` (default `127.0.0.1:8090`).

Users sign in with email + one-time code only; password auth is disabled.
Only users created by an admin (with `active = true`) can sign in.
