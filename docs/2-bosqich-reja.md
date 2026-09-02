# Taqqoslash 2.0 — 2-bosqich rejasi

Hozirgi bitta-fayl dasturni ko'p foydalanuvchili, ma'lumotlar bazali tizimga
aylantirish. To'liq, tushuntirilgan variant — chop etilgan sahifada; bu fayl
keyingi sessiyalar uchun qisqa xulosa.

## Qaror

* **Hozirgi kod saqlanadi.** `src/lib/` (xlsx o'qish/yozish, `assemble`,
  `report`, `export`) o'zgarmaydi; faqat «qobiq» — fayllar va narxlar qayerda
  saqlanishi — almashadi.
* **Backend: PocketBase**, Toshkentdagi VPS da. Sabab: bitta fayl, o'rnatilgan
  email-OTP kirish (v0.23+), fayl saqlash, admin panel, SQLite, zaxira.
  Supabase chet elda — O'zbekiston lokalizatsiya qonuniga (2021-04-16) to'g'ri
  kelmaydi.
* **Frontend** PocketBase orqali tarqatiladi (`pb_public`), alohida veb-server
  kerak emas. HTTPS — Let's Encrypt avtomatik.

## Jadvallar (collections)

| Jadval | Maydonlar |
|---|---|
| `users` (auth) | email, name, role (admin / ekspert / kuzatuvchi), region |
| `contragents` | name, inn, region |
| `projects` | title, region, district, contragent→, year, object_type, status, owner→, source_files (xlsx) |
| `corrections` | project→, name_key, name, unit, smeta_price, market_price, note, by→, at |
| `price_memory` | name_key, unit, region, contragent→, market_price, seen_at, project→ |
| `exports` | project→, file, mode, by→, at |

`name_key` = hozirgi `S.nameKey` (katta harf, bo'shliqlar tozalangan).

## Mexanizmlar

* **Kirish:** email → PocketBase OTP (8 xonali, 5 daqiqa) → token. Faqat admin
  qo'shgan emaillar.
* **4 soat qulf:** token muddati 4 soat (auth collection sozlamasi), har
  harakatda `authRefresh`; brauzerda idle-timer → qulf ekrani.
* **Loyiha kartochkasi:** fayl tashlashdan oldin shakl (viloyat, tuman,
  kontragent, yil, obyekt turi). Har tuzatish darhol `corrections` ga yoziladi.
* **Narx xotirasi:** bozor narxi katagiga fokus → `price_memory` dan
  `name_key + unit` bo'yicha, ustuvorlik: viloyat+kontragent → viloyat → hammasi.
  «Qo'llash» tugmasi. Loyiha yakunlanganda narxlar xotiraga yoziladi.

## Bosqichlar

0. Tayyorgarlik — maydonlar ro'yxati, rollar, domen, VPS, SMTP (3–5 kun)
1. Backend skeleti — PocketBase, HTTPS, 6 jadval, huquqlar, OTP test (1 hafta)
2. Kirish + qulf hozirgi dasturda; dastur PocketBase dan ochiladi (1 hafta)
3. Loyiha kartochkasi, fayl yuklash, tuzatishlarni saqlash (1–2 hafta)
4. Loyihalar ro'yxati + filtrlar (1 hafta)
5. Narx xotirasi + eslatma + qo'llash (1–2 hafta)
6. Eksport tarixi, audit jurnali, rollar (1 hafta)
7. Zaxira/tiklash sinovi, SPF/DKIM, 2–3 xodim bilan pilot (3–5 kun + 1 hafta)

## Boshlashdan oldin kerak

Kartochka maydonlari · foydalanuvchilar va rollar · domen · VPS · SMTP hisobi ·
narx xotirasi qoidasi (faqat shu viloyat+kontragentmi) · «yakunlangan» qachon.

## Qonun

Fuqarolar shaxsiy ma'lumotlari (xodim emaili) O'zbekiston hududidagi serverda
saqlanishi va baza vakolatli organda ro'yxatdan o'tishi kerak — yurist bilan
aniqlashtirish.
