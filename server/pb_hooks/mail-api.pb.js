/// <reference path="../pb_data/types.d.ts" />
// Sends every e-mail (sign-in codes included) over HTTPS instead of SMTP,
// because the hosting provider blocks the outgoing SMTP ports while 443 is open.
//
// Two paths, in order of preference:
//   GMAIL_RELAY_URL  — a Google Apps Script web app running in the sender's own
//                      Gmail account (deploy/gmail-relay.gs). Gmail sends the
//                      message itself, so it is DKIM-signed by Google and
//                      arrives in seconds.
//   BREVO_API_KEY    — Brevo's HTTPS API. Free accounts send from a shared
//                      ...brevosend.com domain, which Gmail delivers slowly
//                      (15-20 minutes is normal), so this is the fallback.
// With neither variable the hook does nothing and PocketBase uses SMTP as usual.
onMailerSend((e) => {
  const m = e.message;
  const addrs = (m.to || []).map((a) => a.address);
  const relay = $os.getenv("GMAIL_RELAY_URL");
  const brevo = $os.getenv("BREVO_API_KEY");

  if (relay) {
    const res = $http.send({
      url: relay,
      method: "POST",
      headers: { "content-type": "application/json" },
      // Apps Script answers a POST with a 302 to its output URL; the script has
      // already run by then, and $http.send follows the redirect for the body.
      body: JSON.stringify({
        secret: $os.getenv("GMAIL_RELAY_SECRET") || "",
        to: addrs.join(","),
        subject: m.subject || "",
        html: m.html || "",
        text: m.text || "",
        fromName: (m.from && m.from.name) || "Таблица сопоставления №2",
      }),
      timeout: 30,
    });
    if (res.statusCode >= 300) {
      throw new Error("Gmail relay " + res.statusCode + ": " + res.raw);
    }
    if (!res.json || res.json.ok !== true) {
      throw new Error("Gmail relay: " + res.raw);
    }
    $app.logger().info("mail via Gmail relay", "to", addrs.join(","), "subject", m.subject,
      "quotaLeft", String(res.json.left == null ? "" : res.json.left));
    return;   // no e.next(): the message is sent, SMTP is skipped
  }

  if (!brevo) {
    e.next();
    return;
  }

  // Brevo rejects an empty "name"; send it only when the address carries one.
  const to = (m.to || []).map((a) => (a.name ? { email: a.address, name: a.name } : { email: a.address }));
  // Brevo wants htmlContent and/or a NON-empty textContent — never an empty string.
  const body = {
    sender: { email: m.from.address, name: m.from.name || "Таблица сопоставления №2" },
    to: to,
    subject: m.subject,
  };
  if (m.html) body.htmlContent = m.html;
  if (m.text) body.textContent = m.text;
  if (!body.htmlContent && !body.textContent) body.textContent = m.subject || "-";
  const res = $http.send({
    url: $os.getenv("BREVO_API_URL") || "https://api.brevo.com/v3/smtp/email",
    method: "POST",
    headers: { "api-key": brevo, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    timeout: 20,
  });
  if (res.statusCode >= 300) {
    throw new Error("Brevo " + res.statusCode + ": " + res.raw);
  }
  // Visible in journalctl / the dashboard log: proof the API accepted the message.
  $app.logger().info("mail via Brevo", "to", addrs.join(","), "subject", m.subject,
    "messageId", (res.json && res.json.messageId) || "");
  // delivered — e.next() is deliberately not called, so SMTP is skipped
});
