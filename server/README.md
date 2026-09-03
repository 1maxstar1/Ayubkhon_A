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
* `pb_hooks/` — server-side JS: `dev-otp.pb.js` (above), `registry.pb.js`
  (registry import, phase 3).
* Env: `PB_DATA_DIR` (default `pb_data`), `PB_HTTP` (default `127.0.0.1:8090`).

Users sign in with email + one-time code only; password auth is disabled.
Only users created by an admin (with `active = true`) can sign in.
