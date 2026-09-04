/**
 * Sign-in codes sent by Gmail itself, over HTTPS.
 *
 * Bu faylni script.google.com dagi yangi loyihaga qo'ying (butun matnni
 * nusxalab, Code.gs ichidagisini almashtiring), pastdagi SECRET ni o'zgartiring,
 * keyin Deploy → New deployment → Web app:
 *     Execute as:      Me (o'zingizning pochtangiz)
 *     Who has access:  Anyone
 * Chiqqan `https://script.google.com/macros/s/.../exec` manzilini va SECRET ni
 * serverga yozing:
 *     sh server/deploy/gmail-relay.sh root@SERVER_IP 'URL' 'SECRET'
 *
 * Xat sizning Gmail hisobingizdan ketadi: Google DKIM bilan imzolaydi, shuning
 * uchun bir necha soniyada yetib boradi. Kunlik chegara — 100 ta oluvchi.
 */
const SECRET = 'BU-YERGA-UZUN-TASODIFIY-SATR';

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (!SECRET || req.secret !== SECRET) return out({ ok: false, error: 'bad secret' });
    if (!req.to) return out({ ok: false, error: 'no recipient' });
    MailApp.sendEmail({
      to: req.to,
      subject: req.subject || '',
      htmlBody: req.html || undefined,
      body: req.text || (req.html ? req.html.replace(/<[^>]+>/g, ' ') : ''),
      name: req.fromName || 'Таблица сопоставления №2',
    });
    return out({ ok: true, left: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

/** Opening the URL in a browser shows that the deployment is alive. */
function doGet() {
  return out({ ok: true, service: 'gmail-relay', left: MailApp.getRemainingDailyQuota() });
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
