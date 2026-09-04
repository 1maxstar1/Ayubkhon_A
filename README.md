# Smeta — Taqqoslash jadvali №2

Loyiha-smeta hujjatlaridagi resurs narxlarini tekshirish, tuzatish va rasmiy
**TAQQOSLASH JADVALI №2** hujjatini tayyorlash uchun mo'ljallangan dastur.

Dastur interfeysi **rus tilida**; eksport hujjat matnlari (shtamp, sarlavha,
ikki tilli sarlavha qatori) 321.xlsx namunasidagidek.

Butun dastur — bitta HTML fayl: **`dist/smeta-taqqoslash.html`**.
Uni yuklab olib, brauzerda ochish kifoya. O'rnatish, internet, server kerak emas;
fayllar kompyuterdan chiqmaydi.

---

## Ish tartibi

1. **Smeta fayllarini qo'shing.** Har bir `.xlsx` — bitta loyiha. Ichidagi
   ko'cha/obyekt varaqlari avtomatik topiladi; `свод`, `сводная` kabi yig'ma
   varaqlar chetlab o'tiladi. Bir vaqtning o'zida istagancha loyiha qo'shsa
   bo'ladi.

   Varaq **nomi ahamiyatga ega emas** va ustunlar qayerdan boshlanishi ham
   muhim emas — jadval sarlavhasi (`НАИМЕНОВАНИЕ · ЕД.ИЗМ. · КОЛ-ВО · ЦЕНА ·
   СУММА`) bo'yicha topiladi. Sarlavha qatori umuman bo'lmasa (masalan
   `ПЕРЕВОЗКА` varaqlari), tuzilma birinchi resurs qatoridan aniqlanadi — bu
   holda `ЗАТРАТЫ ТРУДА / МАШИНЫ / МАТЕРИАЛЫ / ОБОРУДОВАНИЕ` bo'limlaridan
   kamida bittasi bo'lishi shart (o'zbekcha nomlari ham tanib olinadi).
   Narxlari `ВПР`/`VLOOKUP` formulasi bilan qo'yilgan bo'lsa ham o'qiladi.

2. **Yig'ish.** Barcha obyekt varaqlari bitta uzluksiz `Лист1` ga ketma-ket
   qo'yiladi, ustunlar bir pozitsiyaga suriladi va `ЦЕНА ЗА ЕД.` / `СУММА`
   ustunlarining nusxasi — bozor narxi uchun — yoniga qo'shiladi:

   | A | B | C | D | E | F | G | H | I | J | K… |
   |---|---|---|---|---|---|---|---|---|---|----|
   | qator raqami | № | НАИМЕНОВАНИЕ | ЕД.ИЗМ. | КОЛ-ВО | ЦЕНА (smeta) | СУММА `=E*F` | ЦЕНА (bozor) | СУММА `=E*H` | Фарқ `=G-I` | manba varaqning qo'shimcha ustunlari |

   `ИТОГО`, `ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ`, `ТРАНСПОРТНЫЕ УСЛУГИ` qatorlarining
   formulalari ko'chirilganda ustun va qator havolalari to'g'rilanadi, bozor
   tomoni uchun esa `F→H`, `G→I` almashtirish bilan aynan shu formulaning
   ikkinchi nusxasi yasaladi.

3. **Qator raqamlari (A ustuni).** `Лист1` ning `A` ustuni butun varaq bo'ylab
   `1 … N` bo'lib boradi, va dastur qaysi raqamlar qaysi loyihaga tegishli
   ekanini o'zi ko'rsatadi — daftarga yozib qo'yish shart emas:

   * chap tomonda har bir loyiha va har bir ko'cha yonida oralig'i turadi
     (`Фарғона 1–3749`, `Марғилон 3750–6246`, `G-54 KO'CHASI 1814–2380`);
   * «Yig'ilgan jadval» varag'ida yuqorida — hozir ko'rinib turgan qator qaysi
     loyiha va qaysi ko'chaga tegishli;
   * «Blokka o'tish» ro'yxatida ham shu oraliqlar yozilgan;
   * Excel faylida **«Mundarija»** varag'i — har bir loyiha va ko'cha uchun
     `dan – gacha`, qatorlar soni, resurslar soni, smeta/bozor summasi va farq.

   Oraliqlar loyihalar tartibiga bog'liq. Tartibni chap tomondagi `▲ ▼`
   tugmalari bilan o'zgartirasiz — raqamlar darhol qayta hisoblanadi.

4. **Narxlarni tekshiring.** Bozor narxini ikki joyda tahrirlash mumkin, ikkalasi
   ham bir xil ishlaydi — bitta tuzatish shu resursning butun loyihadagi barcha
   qatorlariga tushadi. Narxi to'g'ri bo'lganini tegmay qoldirasiz — farq `0`
   bo'lib qoladi.

   * **«Narxlarni tekshirish»** — har bir resurs **bir marta** ko'rinadi, nechta
     ko'chada uchrashidan qat'i nazar. Ro'yxat bo'ylab tez yurish uchun qulay.
   * **«Yig'ilgan jadval»** — `БОЗОР ЦЕНА` ustunining o'zida, smetaning aynan
     shu qatorida turib tuzatasiz. `A` ustunida umumiy qator raqami ko'rinib
     turadi.

   * Ikkalasida ham: `Enter` / `↓` `↑` — qatordan qatorga, `Esc` — smeta narxini
     qaytarish. Raqam yozayotganda oddiy, yozib bo'lgach ajratilgan ko'rinishda.

   **Qatorlar qanday birlashtiriladi.** Bitta qator = bitta **nom + o'lchov
   birligi + smeta narxi**:

   * nomi ham, narxi ham bir xil bo'lsa — **bitta** qator (`DUB` 14 marta
     uchraydi, ro'yxatda bitta qator, `SONI = 14`);
   * nomi bir xil, narxi har xil bo'lsa — **har biri alohida** qator
     (`АВТОГРЕЙДЕР "КАМАЦУ"`: `364 298` — 9 qator, `413 117` — 8 qator);
   * nomi har xil, narxi bir xil bo'lsa — ham **alohida** qatorlar.

   Nomi yonidagi `2 xil narx` belgisi shu nom boshqa narx bilan ham
   uchrashini bildiradi; ustiga bossangiz, o'sha nomning barcha narx
   variantlari bir joyda ko'rinadi. Bozor narxini yozsangiz, u faqat **o'sha
   narxdagi** qatorlarga tushadi — ikkinchi variant o'z holicha qoladi.
   * Filtrlar: faqat o'zgartirilganlar, narxi `0` bo'lganlar, bitta nom ostida
     bir nechta smeta narxi uchraydiganlar.
   * `% qo'llash` — ko'rinib turgan barcha resurslarga foizda tuzatish.
   * `Narx kitobi` — tuzatilgan narxlarni `.json` ga saqlash va keyingi
     loyihada qayta ishlatish (`.xlsx` ro'yxatini ham qabul qiladi).

5. **Excel yuklab oling.** Yuqorida, «Excel yuklab olish» tugmasi yonida
   **«Hisobot varaqlari»** ro'yxati turadi — u loyiha varaqlariga nima
   tushishini belgilaydi (pastdagi jadvalga qarang). Odatdagi holat —
   `Faqat o'zgargan narxlar`. Bitta fayl chiqadi:
   * `Лист1` — yig'ilgan to'liq jadval;
   * har bir loyiha uchun alohida varaq (nomini chap tomondan o'zgartirasiz) —
     `TAQQOSLASH JADVALI №2`;
   * `Mundarija` — qator raqamlari indeksi (sozlamalardan o'chirsa ham bo'ladi).

---

## Hisobot varaqining uch rejimi

Rejim yuqori satrdan, «Excel yuklab olish» tugmasi yonidan tanlanadi va
**«Hisobot ko'rinishi» varag'iga ham, yuklab olinadigan Excel faylga ham**
bir xilda tegishli.

| Rejim | Nima chiqadi |
|---|---|
| **Faqat o'zgargan narxlar (tozalangan)** | Faqat narxi tuzatilgan resurslar. Birlashtirish qoidasi narxlar varag'idagi bilan bir xil: nom + narx bir xil bo'lsa bitta qator (`КОЛ-ВО` barcha ko'chalar bo'yicha qo'shiladi), nomi bir xil narxi har xil bo'lsa — alohida qatorlar, nomi har xil narxi bir xil bo'lsa — ham alohida. Bo'limlar (`ЗАТРАТЫ ТРУДА`, `МАШИНЫ`, `МАТЕРИАЛЫ`, `ОБОРУДОВАНИЕ`), har biriga `ИТОГО` va oxirida `ЖАМИ / ВСЕГО`. |
| **Barcha resurslar (tozalangan)** | Yuqoridagi bilan bir xil, lekin narxi o'zgarmaganlar ham qoladi. |
| **To'liq nusxa** | Loyihaning har bir qatori, hech narsa tashlanmaydi. Narxi o'zgargan qatorlar o'z o'rnida alifbo tartibida saralanadi — ya'ni Excelda `фарқ ≠ 0` bo'yicha filtr qo'yib, nom bo'yicha saralaganda chiqadigan natijaning aynan o'zi. |

Hisobot varag'ining ustunlari va ko'rinishi namunaviy fayldan olingan:
`A`, `КОЛ-ВО` va summa ustunlari yashirin, chop etish gorizontal, `75%`,
`6:7` qatorlari har bir sahifada takrorlanadi.

---

## Format

Eksport qilingan fayl namunaviy hujjat bilan bir xil ko'rinadi:

* Times New Roman 10 (sarlavha bloklari 11, shtamp 8);
* `CCFFFF` — sarlavha, bo'lim va `ИТОГО` yo'llari; `D9E2F3` — o'zbekcha sarlavha bandi;
* ingichka chegaralar, `#,##0`, `#,##0.000`, `0.000` raqam formatlari;
* `10 000 000` dan katta summalar uchun pushti shartli formatlash (`FFC7CE` / `9C0006`);
* `B2:L2` va `A3:L4` birlashtirilgan kataklar, avtofiltr, ustun kengliklari,
  qator balandliklari.

Formulalar tirik holda saqlanadi — Excelda ochilganda qayta hisoblanadi, ya'ni
faylni qo'lda tahrirlashda davom etsa bo'ladi.

---

## Tezlik

Draft versiyaning sekinligi ikkita sababdan edi: butun jadval DOM ga
chizilar va har bir narx o'zgarganda hammasi qaytadan qurilardi. Bu yerda:

* `.xlsx` fayllar Web Worker'da o'qiladi — oyna qotib qolmaydi;
* jadvallar virtualizatsiya qilingan — ekranda ko'rinib turgan ~40 qator
  mavjud, qolgani yo'q;
* narx o'zgarganda faqat o'sha resursga tegishli qatorlar yangilanadi;
* SheetJS o'rniga faqat kerakli qismi yozilgan o'qish/yozish kodi ishlatiladi.

O'lchov (2 ta loyiha, 28 obyekt varag'i, 6 246 qator, 901 resurs):
o'qish + yig'ish ≈ **1,3 s**, narx tuzatish ≈ **0 ms**, eksport ≈ **0,5 s**,
tayyor fayl **≈ 0,5 MB**.

---

## Loyiha tuzilishi

```
src/
  index.html          dastur oynasi
  app.css
  worker.js           .xlsx ni fon oqimida o'qish
  vendor/fflate.umd.js
  lib/
    util.js           umumiy yordamchilar, nom kaliti, raqam formatlari
    formula.js        formulalarni ustun/qator xaritasi bo'yicha ko'chirish
    xlsx-read.js      .xlsx o'qish (skaner, DOM emas)
    xlsx-write.js     to'liq formatli .xlsx yozish
    smeta.js          obyekt varaqlarini tanish va qatorlarga ajratish
    assemble.js       Лист1 ni yig'ish + resurslar ro'yxati
    report.js         TAQQOSLASH JADVALI №2 (uch rejim) + Mundarija
    export.js         uslublar va tayyor kitob
  ui/
    grid.js           virtual jadval
    prices.js         narx ustaxonasi
    app.js            ulanish
test/
  pipeline.cjs        brauzersiz to'liq o'tkazish (node)
  browser.mjs         haqiqiy brauzerda uchidan-uchiga test
build.mjs             hammasini bitta HTML ga yig'adi
dist/smeta-taqqoslash.html
```

### Yig'ish

```sh
node build.mjs                       # dist/smeta-taqqoslash.html
node build.mjs --watch               # ishlab chiqish paytida

node test/pipeline.cjs a.xlsx b.xlsx --out out.xlsx   # yadro testi
npm i -D playwright && node test/browser.mjs a.xlsx b.xlsx
```

## Server rejimi (2-bosqich)

Bir necha xodim bitta bazada ishlaydi: kirish — email + bir martalik kod,
4 soat harakat bo'lmasa qulf, arizalar reyestri, ish maydonlari serverda,
oldingi loyihalardan narx eslatmalari. Backend — [PocketBase](https://pocketbase.io)
(bitta binary, SQLite, fayl saqlash, admin panel).

```sh
PB_ADMIN_EMAIL=admin@firma.uz PB_ADMIN_PASS='kuchli-parol' sh server/setup.sh   # bir marta
node build.mjs --serve                                                        # dist/ -> server/pb_public
sh server/run.sh                                                              # http://127.0.0.1:8090
```

* `http://127.0.0.1:8090/` — dastur (kirish → arizalar → ish maydoni).
* `http://127.0.0.1:8090/admin.html` — administrator: reyestr (`Report_1.xls`)
  yuklash, ish maydonlarini tozalash/o'chirish, arizani qo'lda qo'shish yoki
  o'chirish, foydalanuvchilar. Faqat `role = admin` yoki superuser.
* `http://127.0.0.1:8090/_/` — PocketBase boshqaruv paneli (superuser).
* Ishlab chiqishda (`PB_DEV=1`, `run.sh` sukut bo'yicha) kod emailga
  yuborilmaydi — `server/pb_data/dev-otp.txt` ga yoziladi. Serverda SMTP
  PocketBase panelida (Settings → Mail) sozlanadi.

**Oqim.** Admin har kuni reyestrni yuklaydi (ariza raqami bo'yicha
qo'shiladi/yangilanadi, hech narsa o'chirilmaydi). Arizalar ro'yxati
hisobotning sariq ustunlari bo'yicha filtrlanadi: raqam / tashkilot / STIR /
loyiha nomi / obyekt ID (qidiruv), ekspertiza turi, buyurtmachi turi, holat,
summa oralig'i (`/api/registry/facets` — ustunlarning takrorlanmas qiymatlari).
Xodim arizani ochadi,
birinchi marta viloyatni tanlaydi (ariza matnidan taklif qilinadi), smeta
fayllarini yuklaydi — fayllar, sozlamalar va har tuzatish avtomatik
saqlanadi; qayta ochganda hammasi tiklanadi. Bozor narxi katagida shu
viloyatdagi oldingi loyihalar narxlari ko'rinadi: avval shu kontragent
(STIR bo'yicha), keyin boshqalar; boshqa viloyat ko'rsatilmaydi. Har
eksport `exports` da saqlanadi, ariza kartochkasidan yuklab olinadi.
Admin ish maydonini **tozalashi** (fayllar, tuzatishlar, eksportlar o'chadi,
viloyat qoladi) yoki **o'chirishi**, arizani **qo'lda qo'shishi** (import
hook orqali — raqam mavjud bo'lsa yangilanadi) yoki **o'chirishi** mumkin —
tugmalar arizalar ro'yxatining o'zida (faqat adminga ko'rinadi) va admin
sahifasida; umumiy kod `src/ui/apps-admin.js`, server tomoni
`server/pb_hooks/admin.pb.js`.

Fayllar: `server/` (sxema, hooklar, skriptlar), `src/lib/pb.js`,
`src/lib/registry-parse.js`, `src/ui/{auth,registry,sync,hints,admin}.js`,
`src/screens.html`, `src/admin.html`. Bitta-fayl `dist/smeta-taqqoslash.html`
avvalgidek, serversiz ishlaydi.

Testlar:

```sh
sh test/pb-smoke.sh            # server: sxema, OTP kirish, token muddati, huquqlar
node test/registry.cjs         # reyestr parser (fixture, 400 qator)
sh test/registry-import.sh     # import hook: ikki marta yuklash, huquqlar
sh test/admin-api.sh           # admin hooklari: facets, tozalash, o'chirish, huquqlar
node test/mail-otp.mjs         # kirish xati: kod mavzuda, ruscha matn, Brevo so'rovi
node test/e2e-auth.mjs         # brauzer: kirish, noto'g'ri kod, qulf
node test/e2e-admin.mjs        # brauzer: reyestr, ish maydonlari, qo'lda ariza, foydalanuvchilar
node test/e2e-workspace.mjs    # brauzer: ariza → viloyat → fayllar → narx → qayta ochish → eksport
node test/e2e-hints.mjs        # brauzer: eslatmalar (viloyat, kontragent)
```

### Lokal sinov (bir buyruq)

```sh
sh server/dev.sh        # binary + sxema + admin@example.com + namuna reyestr (400 ariza) + server
```

Bitta oyna yetadi: skript serverni ko'taradi, brauzerni ochadi va **kirish
kodlarini shu oynada ko'rsatadi** (dev rejimida email yuborilmaydi). Kirish
pochtasi `admin@example.com`. Admin sahifa `…/admin.html`, PocketBase paneli
`…/_/` (parol `adminpass1234`, `PB_ADMIN_PASS` bilan o'zgartiriladi).
To'xtatish — **Ctrl+C**. Ma'lumotlar `server/pb_data/` da, noldan boshlash uchun
shu papkani o'chiring. Alohida kerak bo'lsa `sh server/otp.sh` oxirgi kodni
chiqaradi.

Talab: `node` (18+) va `curl`. **macOS** — Terminal, `brew install node`; PocketBase
binary (`darwin_arm64` yoki `darwin_amd64`) avtomatik yuklanadi. **Windows** —
skriptlarni **Git Bash** dan ishga tushiring, binary `pocketbase.exe` bo'ladi.
Brauzer testlari uchun: `npm i -D playwright && npx playwright install chromium`.

To'liq reyestr bilan yuklama sinovi: `node test/e2e-fullregistry.mjs Report_1.xls`
(28 000 qator ≈ 35 s, qidiruv va filtrlar millisekundlarda).

### Ofis kompyuterini server qilish (VPSsiz)

```sh
sh server/lan.sh              # butun ofis uchun: http://<shu kompyuter IP>:8090
PB_DEV=1 sh server/lan.sh     # yolg'iz sinash: kodlar shu oynada chiqadi
```

`dev.sh` dan farqi: server `0.0.0.0` ga ulanadi, ya'ni bir tarmoqdagi boshqa
kompyuterlar ham kira oladi, va skript xodimlar ochadigan manzilni ko'rsatadi.
Kerak bo'ladi: kompyuter ish vaqtida yoqiq tursin (uyqu o'chirilgan), lokal IP
o'zgarmasin (routerda DHCP rezervatsiya), tarmoqlararo ekranda `8090` port
ochiq bo'lsin, va kirish kodlari uchun SMTP sozlangan bo'lsin (baza paneli →
Settings → Mail). Zaxira: Settings → Backups, keyin `pb_data/backups/` ni
boshqa diskka nusxalab turing.

Joylashtirish (VPS, HTTPS, SMTP, zaxira) — `server/deploy/README.md`.
