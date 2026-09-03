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
| `contragents` | inn (STIR, unique), name |
| `projects` | number (ariza `B`, unique), title, contragent→, expertise_type, buyer_type, object_id, cost, cost_vat, status, expert, coexpert, region (qo'lda), source_files (xlsx[]) |
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

Amaldagi kodlash rejasi — `docs/2-bosqich-kod-rejasi.md`; quyidagi ro'yxat
dastlabki baho.

0. Tayyorgarlik — maydonlar ro'yxati, rollar, domen, VPS, SMTP (3–5 kun)
1. Backend skeleti — PocketBase, HTTPS, 6 jadval, huquqlar, OTP test (1 hafta)
2. Kirish + qulf hozirgi dasturda; dastur PocketBase dan ochiladi (1 hafta)
3. Loyiha kartochkasi, fayl yuklash, tuzatishlarni saqlash (1–2 hafta)
4. Loyihalar ro'yxati + filtrlar (1 hafta)
5. Narx xotirasi + eslatma + qo'llash (1–2 hafta)
6. Eksport tarixi, audit jurnali, rollar (1 hafta)
7. Zaxira/tiklash sinovi, SPF/DKIM, 2–3 xodim bilan pilot (3–5 kun + 1 hafta)

## Tasdiqlangan talablar (2026-09-02)

Foydalanuvchi bilan kelishilgan filtr/reyestr tizimi. Bu bo'lim yuqoridagi
umumiy rejadan ustun.

### Arizalar reyestri (`Report_1.xls`)

* Manba — `control.expertcenter.uz` dan yuklanadigan BIFF8 `.xls` hisobot,
  varaq `Лист`, 41 ustun. Admin uni har kuni (ba'zan 1–2 hafta oldindan)
  tizimga yuklaydi. Birinchi yuklash — butun tarix (~28 000 qator), keyingilari
  ~10 qator/kun, yiliga ~400 ariza.
* Yuklashda qatorlar **ariza raqami (`B` ustuni) bo'yicha** solishtiriladi:
  yangi raqam — qo'shiladi, mavjud — maydonlari yangilanadi. Hech narsa
  o'chirilmaydi; bir faylni ikki marta yuklash zararsiz.
* Filtr uchun kerakli (sariq) ustunlar: `B` номер, `F` название организации,
  `G` ИНН (STIR), `J` тип экспертизы, `K` тип закупщика/проекта, `N` название
  проекта, `O` ID объекта, `Q` стоимость без НДС, `R` с НДС. Qo'shimcha:
  `C` статус, `H` эксперт, `I` соэксперт. `AL` место реализации deyarli bo'sh,
  shuning uchun viloyat qo'lda tanlanadi.
* **Kontragent identifikatsiyasi — STIR (`G`) bo'yicha.** Nom faqat ko'rsatish
  uchun; bir STIR = bitta kontragent, nomi turlicha yozilgan bo'lsa ham.

### Xodim ish oqimi

1. Tizimga kiradi (email + kod). Hamma xodim **barcha arizalarni** ko'radi,
   «mening arizalarim» filtri kerak emas.
2. Reyestrdan arizani tanlaydi (raqam, kontragent, loyiha nomi bo'yicha qidiruv).
3. Smeta fayllarini yuklashdan **oldin** viloyatni tanlaydi — 15 talik ro'yxat
   (expertcenter.uz dagi kabi). Viloyat arizaga bir marta biriktiriladi.
   Farg'ona viloyati bitta hudud: Marg'ilon, Qo'qon va boshqalar shu viloyatga
   kiradi; shahar/tuman filtrga ta'sir qilmaydi (ixtiyoriy maydon sifatida
   keyin qo'shilishi mumkin).
4. Bitta arizaga **bir nechta xlsx** yuklanadi (hozirgi dasturdagi kabi).
5. Ishlaydi; har tuzatish avtomatik saqlanadi. Yakunlangan arizani qayta
   ochsa — **o'sha ish davom etadi**, yangi versiya ochilmaydi.
6. Eksport — hozirgi `321.xlsx` formatida, ariza raqami va kontragent ostida
   saqlanadi; rahbar istalgan vaqt yuklab oladi.

### Narx eslatmalari (price memory)

Bozor narxi katagida `name_key + unit` bo'yicha oldingi loyihalar narxlari
ko'rsatiladi, tartib:

1. **Viloyat ham, kontragent (STIR) ham** mos kelganlar.
2. **Shu viloyat**, boshqa kontragent.
3. Boshqa viloyat — **umuman ko'rsatilmaydi**, kontragent bir xil bo'lsa ham.

Har eslatma yonida manba: ariza raqami, kontragent, viloyat, sana. Xodim
bosib qo'llaydi yoki o'zi yozadi.

## Boshlashdan oldin kerak

Foydalanuvchilar ro'yxati (email, rol) · domen · VPS · SMTP hisobi.

## Qonun

Fuqarolar shaxsiy ma'lumotlari (xodim emaili) O'zbekiston hududidagi serverda
saqlanishi va baza vakolatli organda ro'yxatdan o'tishi kerak — yurist bilan
aniqlashtirish.
