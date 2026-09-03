# Joylashtirish (Ubuntu 22.04+, Toshkentdagi VPS)

Kerak: domen (masalan `smeta.firma.uz`, A yozuvi → server IP), 80/443 portlar
ochiq, SMTP hisobi (kod yuborish uchun).

```sh
# 1. Foydalanuvchi va papka
sudo useradd -r -s /usr/sbin/nologin pocketbase
sudo mkdir -p /opt/taqqoslash && sudo chown pocketbase:pocketbase /opt/taqqoslash

# 2. Kod (git clone yoki nusxa) — server/ va dist/ kerak
sudo -u pocketbase git clone <repo> /opt/taqqoslash
cd /opt/taqqoslash && npm ci --omit=dev 2>/dev/null; node build.mjs --serve

# 3. PocketBase + sxema + superuser
cd server
PB_ADMIN_EMAIL=admin@firma.uz PB_ADMIN_PASS='kuchli-parol-12' sudo -E -u pocketbase sh setup.sh

# 4. systemd (domenni pocketbase.service ichida almashtiring)
sudo cp deploy/pocketbase.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now pocketbase
sudo journalctl -u pocketbase -f
```

Keyin brauzerda `https://smeta.firma.uz/_/` → superuser bilan kiring:

1. **Settings → Mail** — SMTP (host, port, login, parol, «From» manzili).
   «Send test email» bilan tekshiring. SPF/DKIM yozuvlarini domen egasi qo'shsin,
   aks holda kodlar spamga tushadi.
2. **Settings → Application** — `Application URL` = `https://smeta.firma.uz`.
3. **Settings → Backups** — kunlik zaxira (`0 3 * * *`), 7 nusxa saqlash.
   Zaxira `pb_data/backups/` da; uni boshqa joyga ham ko'chiring
   (masalan `rsync` bilan ikkinchi serverga yoki cron bilan obyekt-omborga).
4. **Collections → users** — birinchi adminni yarating: email, `name`,
   `role = admin`, `active = true`, ixtiyoriy parol (ishlatilmaydi).
   Qolgan xodimlarni `https://smeta.firma.uz/admin.html` orqali qo'shasiz.
5. `https://smeta.firma.uz/admin.html` → reyestr faylini yuklang.

Yangilash: `git pull && node build.mjs --serve && sudo systemctl restart pocketbase`
(sxema o'zgargan bo'lsa avval `sh setup.sh` — u mavjud yozuvlarni saqlab, faqat
kolleksiyalarni yangilaydi).

`PB_DEV=0` bo'lganda OTP faqat emailga ketadi; `dev-otp.txt` yozilmaydi.
