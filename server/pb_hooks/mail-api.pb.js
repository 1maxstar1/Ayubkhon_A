/// <reference path="../pb_data/types.d.ts" />
// Sends every e-mail (sign-in codes included) through the Brevo HTTPS API
// instead of SMTP when BREVO_API_KEY is set. Needed where the hosting
// provider blocks outgoing SMTP ports but HTTPS (443) is open.
// Without the key the hook does nothing and PocketBase uses SMTP as usual.
onMailerSend((e) => {
  const key = $os.getenv("BREVO_API_KEY");
  if (!key) {
    e.next();
    return;
  }
  const m = e.message;
  const to = (m.to || []).map((a) => ({ email: a.address, name: a.name || "" }));
  const body = {
    sender: { email: m.from.address, name: m.from.name || "Taqqoslash jadvali" },
    to: to,
    subject: m.subject,
    htmlContent: m.html || "<pre>" + (m.text || "") + "</pre>",
    textContent: m.text || "",
  };
  const res = $http.send({
    url: $os.getenv("BREVO_API_URL") || "https://api.brevo.com/v3/smtp/email",
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    timeout: 20,
  });
  if (res.statusCode >= 300) {
    throw new Error("Brevo " + res.statusCode + ": " + res.raw);
  }
  // delivered — e.next() is deliberately not called, so SMTP is skipped
});
