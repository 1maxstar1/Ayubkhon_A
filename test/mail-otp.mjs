/*
 * The sign-in e-mail as it actually leaves the server: PocketBase renders the
 * OTP template, the Brevo hook posts it to the API. A local sink stands in for
 * Brevo, so the test can read the rendered subject and body.
 * Checks: the code is in the subject (so it is readable in the inbox list and
 * every message gets its own Gmail thread), the text is Russian, the sender is
 * the configured address.
 *
 *   sh test/pb-smoke.sh && node test/mail-otp.mjs
 */
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = 8107, BASE = `http://127.0.0.1:${PORT}`;
const SINK = 8108;

execSync('sh test/pb-smoke.sh', { cwd: root, stdio: 'ignore' });

// Stands in for both delivery paths: Brevo's API on /v3/smtp/email and the
// Apps Script relay on /exec — including the 302 to its output URL, which is
// how Apps Script really answers a POST.
const sent = [];
const relayed = [];
const sink = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.url.startsWith('/echo')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true,"left":97}');
      return;
    }
    if (req.url.startsWith('/exec')) {
      relayed.push({ headers: req.headers, body: JSON.parse(body) });
      res.writeHead(302, { location: `http://127.0.0.1:${SINK}/echo` });
      res.end();
      return;
    }
    sent.push({ headers: req.headers, body: JSON.parse(body) });
    res.writeHead(201, { 'content-type': 'application/json' });
    res.end('{"messageId":"<test@sink>"}');
  });
});
await new Promise((r) => sink.listen(SINK, '127.0.0.1', r));

// PB_DEV is off on purpose: the code must go through the mailer, as in production.
const server = spawn('sh', ['server/run.sh'], {
  cwd: root,
  env: {
    ...process.env, PB_DATA_DIR: 'pb_data_test', PB_HTTP: `127.0.0.1:${PORT}`, PB_DEV: '0',
    BREVO_API_KEY: 'test-key', BREVO_API_URL: `http://127.0.0.1:${SINK}/v3/smtp/email`
  },
  stdio: 'ignore'
});
process.on('exit', () => server.kill());
for (let i = 0; i < 20; i++) {
  try { if ((await fetch(BASE + '/api/health')).ok) break; } catch (e) { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500));
}

let fail = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail++; };

const su = (await (await fetch(BASE + '/api/collections/_superusers/auth-with-password', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ identity: 'admin@example.com', password: 'adminpass1234' })
})).json()).token;
await fetch(BASE + '/api/settings', {
  method: 'PATCH', headers: { 'content-type': 'application/json', Authorization: su },
  body: JSON.stringify({ meta: { appName: 'Таблица сопоставления №2', senderName: 'Таблица сопоставления №2', senderAddress: 'noreply@example.com' } })
});

// Signing in as superuser also mails a "new location" alert, so pick the
// messages addressed to the user rather than whatever arrives first.
const mine = () => sent.filter((s) => (s.body.to || []).some((a) => a.email === 'test@example.com'));
async function waitForMine(n) {
  for (let i = 0; i < 40 && mine().length < n; i++) await new Promise((r) => setTimeout(r, 250));
  return mine();
}

const otp = await (await fetch(BASE + '/api/collections/users/request-otp', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'test@example.com' })
})).json();
check(!!otp.otpId, 'request-otp answered with an otpId');
const first = await waitForMine(1);
check(first.length === 1, 'one message for the user reached the API sink');

const msg = first[0] && first[0].body;
if (!msg) { console.log('nothing captured'); server.kill(); sink.close(); process.exit(1); }
console.log('subject: ' + msg.subject);
const code = (msg.subject.match(/\b(\d{8})\b/) || [])[1];
check(!!code, 'the eight-digit code is in the subject: ' + msg.subject);
check(msg.subject.includes('Код для входа'), 'subject is Russian');
check(msg.subject.includes('Таблица сопоставления'), 'subject carries the application name');
check(!!code && msg.htmlContent.includes(code), 'the same code is in the body');
check(/Код действует 30 минут/.test(msg.htmlContent), 'body is Russian');
check(msg.sender && msg.sender.email === 'noreply@example.com', 'sender address comes from the settings');
check(first[0].headers['api-key'] === 'test-key', 'the hook sends the API key header');

// The code from the subject must actually sign the user in.
const auth = await (await fetch(BASE + '/api/collections/users/auth-with-otp', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ otpId: otp.otpId, password: code })
})).json();
check(!!auth.token, 'the code from the subject signs the user in');

// A second request must produce a different subject, so Gmail keeps the messages apart.
await fetch(BASE + '/api/collections/users/request-otp', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'test@example.com' })
});
const both = await waitForMine(2);
check(both.length === 2 && both[1].body.subject !== msg.subject, 'each code gets its own subject (no Gmail thread collapsing)');

server.kill();

/* --------------------------------------------- the Gmail relay path ------ */
// Same server, restarted with GMAIL_RELAY_URL: the relay must win over Brevo.
const relayServer = spawn('sh', ['server/run.sh'], {
  cwd: root,
  env: {
    ...process.env, PB_DATA_DIR: 'pb_data_test', PB_HTTP: `127.0.0.1:${PORT}`, PB_DEV: '0',
    BREVO_API_KEY: 'test-key', BREVO_API_URL: `http://127.0.0.1:${SINK}/v3/smtp/email`,
    GMAIL_RELAY_URL: `http://127.0.0.1:${SINK}/exec`, GMAIL_RELAY_SECRET: 'shh'
  },
  stdio: 'ignore'
});
process.on('exit', () => relayServer.kill());
for (let i = 0; i < 20; i++) {
  try { if ((await fetch(BASE + '/api/health')).ok) break; } catch (e) { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500));
}
const beforeBrevo = sent.length;
await fetch(BASE + '/api/collections/users/request-otp', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'test@example.com' })
});
for (let i = 0; i < 40 && !relayed.length; i++) await new Promise((r) => setTimeout(r, 250));
check(relayed.length === 1, 'the relay received the message (POST survived the 302)');
const r = relayed[0] && relayed[0].body;
if (r) {
  check(r.secret === 'shh', 'the relay call carries the shared secret');
  check(r.to === 'test@example.com', 'recipient passed as a plain address list');
  check(/^Код для входа: \d{8}/.test(r.subject), 'subject with the code reaches the relay: ' + r.subject);
  check(r.html.includes('Код действует 30 минут'), 'html body reaches the relay');
  check(r.fromName === 'Таблица сопоставления №2', 'sender name reaches the relay');
}
check(sent.length === beforeBrevo, 'Brevo is not used while the relay is configured');

relayServer.kill(); sink.close();
console.log(fail ? `FAILED (${fail})` : 'mail-otp OK');
process.exit(fail ? 1 : 0);
