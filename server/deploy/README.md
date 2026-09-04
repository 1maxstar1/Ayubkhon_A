# Joylashtirish (Ubuntu 22.04 / 24.04 VPS, Toshkent)

Hammasi Mac'dan bitta buyruq bilan. Serverga faqat `ssh root@IP` kirishi kerak.

```sh
PB_ADMIN_EMAIL=siz@firma.uz sh server/deploy/push.sh root@SERVER_IP
```

`push.sh` frontendni yig'adi, `server/` papkasini VPS ga ko'chiradi va u yerda
`deploy/install.sh` ni ishga tushiradi. Installer: kerakli paketlar, `pocketbase`
foydalanuvchisi, PocketBase binary, `.env` (superuser paroli avtomatik
yaratiladi), sxema, sozlamalar (zaxira 03:00 da, rate limit, jurnal), dasturning
birinchi admin foydalanuvchisi, systemd xizmati, `ufw` (22/80/443). Oxirida
manzillarni chiqaradi. **Qayta ishga tushirish = yangilash** — `pb_data` va
`.env` saqlanadi.

## Keyingi qadamlar

1. **SMTP** — kirish kodlari shu orqali ketadi (Gmail: App password):
   ```sh
   sh server/deploy/smtp.sh root@SERVER_IP smtp.gmail.com 587 siz@gmail.com 'app-parol'
   ```
   Admin pochtasiga sinov xati keladi. Kelmasa, chiqqan xatoni o'qing.
   **Provayder chiquvchi SMTP portlarini (465/587) bloklagan bo'lsa** — `smtp.sh`
   buni o'zi aytadi. Unda xat HTTPS orqali Brevo API bilan yuboriladi (443
   ochiq bo'lsa yetarli, bepul 300 ta/kun):
   ```sh
   sh server/deploy/mail-api.sh root@SERVER_IP 'xkeysib-…' siz@gmail.com
   ```
   Brevo'da (`app.brevo.com`) jo'natuvchi manzil tasdiqlangan bo'lishi kerak
   (Senders & IP → Add a sender). Kalit `.env` dagi `BREVO_API_KEY` ga yoziladi;
   u bo'sh bo'lsa PocketBase odatdagidek SMTP ishlatadi (`pb_hooks/mail-api.pb.js`).
   Parallel ravishda provayderga «откройте исходящие порты 465 и 587» deb
   yozib qo'ying — ochilsa, kalitni o'chirib SMTP ga qaytish mumkin.
   Kirish kodi **xat mavzusida** turadi («Код для входа: 12345678 — Таблица
   сопоставления №2»), shuning uchun uni pochtani ochmasdan ham o'qish mumkin
   va Gmail xatlarni bitta suhbatga yig'ib qo'ymaydi. Kod **30 daqiqa** amal
   qiladi (Brevo → Gmail yo'li 15–20 daqiqa kechikishi mumkin), so'rov brauzerda
   saqlanadi — sahifani yopib, xat kelganda qaytib kirish mumkin.
   **Brevo sekin bo'lsa** (bepul hisob `…@NNNNNN.brevosend.com` umumiy
   domenidan yuboradi, Gmail bunday xatni 15–20 daqiqa navbatda ushlab turadi) —
   quyidagi «Gmail relay» ga o'ting yoki Brevo'da o'z domeningizni tasdiqlang
   (Senders, Domains & Dedicated IPs → Domains → Add a domain → DNS ga DKIM,
   DMARC va tasdiqlash yozuvlari), keyin `SENDER_ADDRESS` ni `noreply@domen.uz`
   qiling.

### Gmail relay — kod bir necha soniyada keladi (DNS kerak emas)

Xatni Gmail'ning o'zi yuboradi: Google DKIM bilan imzolaydi, shuning uchun
kechikish bo'lmaydi. Kunlik chegara — 100 ta oluvchi, bu 5–10 xodim uchun
yetarli. Faqat bir marta sozlanadi:

1. `script.google.com` → **New project**. Chapdagi `Code.gs` ichidagi hamma
   narsani o'chirib, `server/deploy/gmail-relay.gs` faylining matnini
   qo'ying.
2. Birinchi qatordagi `SECRET` ni uzun tasodifiy satrga almashtiring (masalan
   Terminalda: `openssl rand -hex 16`). Saqlang (⌘S).
3. O'ng yuqorida **Deploy → New deployment** → ⚙️ **Web app**:
   * **Execute as:** Me (o'z pochtangiz)
   * **Who has access:** Anyone
   → **Deploy**. Google ruxsat so'raydi: **Authorize access** → hisobingizni
   tanlang → «Google hasn't verified this app» chiqsa **Advanced** → **Go to …
   (unsafe)** → **Allow**. (Bu sizning o'z skriptingiz, shuning uchun xavfsiz.)
4. Chiqqan **Web app URL** ni (`https://script.google.com/macros/s/…/exec`)
   nusxalang va serverga yozing:
   ```sh
   sh server/deploy/gmail-relay.sh root@SERVER_IP 'https://script.google.com/macros/s/…/exec' 'SECRET'
   ```
   Skript `.env` ni yangilaydi, xizmatni qayta ishga tushiradi va sinov xatini
   yuboradi — u bir necha soniyada kelishi kerak.

Brevo'ga qaytish: `sh server/deploy/gmail-relay.sh root@SERVER_IP off`.
   **Kod kelmay qolsa:** `sh server/deploy/mail-check.sh root@SERVER_IP` —
   kalit bormi, xizmat ishlayaptimi, jurnaldagi Brevo xatolari va bitta sinov
   xatining natijasi chiqadi. Brevo'da (app.brevo.com → Transactional → Logs)
   xat ketgan-ketmaganini ham ko'ring; yangi bepul akkauntlar tekshiruv
   («account under validation») paytida xat yubormaydi, kunlik chegara 300 ta.
2. **Reyestr** — `http://SERVER_IP/admin.html` → `Report_1.xls` yuklash.
3. **Xodimlar** — o'sha sahifada qo'shiladi.
4. **Domen va HTTPS** (ixtiyoriy, keyin ham bo'ladi): domenning A yozuvini
   serverga qarating, keyin
   ```sh
   sh server/deploy/push.sh root@SERVER_IP smeta.firma.uz
   ```
   Sertifikat Let's Encrypt'dan avtomatik olinadi (80 va 443 ochiq bo'lishi kerak).

## Zaxira

PocketBase har kuni 03:00 da `pb_data/backups/` ga zaxira oladi (7 nusxa
saqlanadi). Uni serverdan tashqariga ham olib turing:

```sh
sh server/deploy/pull-backup.sh root@SERVER_IP          # ~/Backups/smeta/ ga
```

Tiklash: baza paneli (`/_/` → Settings → Backups → Restore) yoki
`pb_data` ni zaxiradan qaytarib `systemctl restart pocketbase`.

## Serverda foydali buyruqlar

```sh
systemctl status pocketbase          # holat
journalctl -u pocketbase -n 100 -f   # jurnal
cat /opt/taqqoslash/server/.env      # superuser paroli va sozlamalar
sh /opt/taqqoslash/server/deploy/configure.sh   # .env ni qayta qo'llash
```

## Fayllar

| Fayl | Qayerda ishlaydi | Vazifa |
|---|---|---|
| `push.sh` | Mac | yig'ish, yuklash, `install.sh` ni chaqirish |
| `install.sh` | server (root) | paketlar, binary, `.env`, sxema, xizmat, firewall |
| `configure.sh` | server | `.env` → PocketBase sozlamalari (SMTP, zaxira, rate limit) |
| `serve.sh` | server (systemd) | IP bo'lsa http:80, domen bo'lsa http+https |
| `pocketbase.service` | server | systemd birligi |
| `smtp.sh` | Mac | portni tekshirish, SMTP ni `.env` ga yozish, sinov xati |
| `gmail-relay.gs` | Google Apps Script | xatni Gmail o'zi yuboradi (tez yo'l) |
| `gmail-relay.sh` | Mac | relay manzili va sirini `.env` ga yozadi, sinov xati |
| `mail-api.sh` | Mac | zaxira yo'l: Brevo API kaliti, sinov xati |
| `mail-check.sh` | Mac | kod kelmasa: holat, jurnal, sinov xati bir buyruqda |
| `users.sh` | Mac | xodim hisoblarini qo'shish |
| `pull-backup.sh` | Mac | yangi zaxira olib, yuklab olish |
| `env.example` | — | `.env` shabloni |

Xavfsizlik: superuser paroli faqat serverdagi `.env` da (chmod 600). Baza
paneli `/_/` internetdan ochiq — parol kuchli, rate limit yoqiq. Domen
ulangach hamma trafik HTTPS bo'ladi.
