# Taqqoslash 2.0 — kodlash rejasi

Bu hujjat kod yozadigan sessiya uchun **bajarish ko'rsatmasi**. Talablar
`docs/2-bosqich-reja.md` («Tasdiqlangan talablar» bo'limi) da; bu yerda —
ularni qanday, qaysi tartibda va qaysi fayllarda amalga oshirish.

Kod yozadigan model uchun qoida:

* Avval `CLAUDE.md`, keyin shu faylni o'qi. Katta fayllarni boshidan-oxirigacha
  o'qima — quyida har bosqich uchun kerakli funksiya va qatorlar ko'rsatilgan.
* Bosqichlarni tartib bilan bajar. Har bosqich oxirida: `node build.mjs`,
  bosqichda ko'rsatilgan tekshiruv, `git commit`. Bir sessiyada bitta bosqich
  yetarli.
* `src/lib/*.js` (xlsx o'qish/yozish, `assemble`, `report`, `export`)
  **o'zgartirilmaydi**. Faqat `src/ui/`, `src/index.html`, `src/app.css`,
  `build.mjs`, `server/`, `test/` ga tegiladi. Eski bitta-fayl dastur
  (`dist/smeta-taqqoslash.html`) ishlashda davom etishi shart.
* Foydalanuvchiga o'zbekcha (lotin) javob ber, kod va commitlar inglizcha.

## 0. Tekshirilgan faktlar (2026-09-03)

| Nima | Natija |
|---|---|
| PocketBase | v0.34.0 `linux_amd64` shu konteynerda ishlaydi: `server/get-pocketbase.sh` yuklab oladi, `superuser upsert` va `serve` ishladi, `/api/health` javob berdi. |
| OTP | `users` da sukut bo'yicha **o'chiq**: `request-otp` → `403 The collection is not configured to allow OTP authentication`. Kolleksiya sozlamasida yoqish kerak. |
| PocketBase JS SDK | `pocketbase@0.28.0` npm dan olindi → `src/vendor/pocketbase.umd.js` (global `PocketBase`). |
| `.xls` (BIFF8) o'qish | `xlsx@0.18.5` (SheetJS CE, Apache-2.0) npm dan → `src/vendor/xlsx.full.min.js` (global `XLSX`). `Report_1.xls` (28 338 qator) va fixture ikkalasi o'qildi; `cellDates:true` bilan sanalar `Date` bo'ladi. Yangi SheetJS versiyalari (`cdn.sheetjs.com`) bu muhitdan yuklanmaydi — 0.18.5 yetarli. |
| Fixture | `test/fixtures/registry-sample.xls` — real reyestrdan 400 qator (1–300 eng yangi, 14000–14099 o'rtadan), sarlavha qatori bilan. Testlar uchun 24 MB fayl kerak emas. |
| Tarmoq | `github.com` release yuklash, `registry.npmjs.org`, `pypi.org` ochiq. |

Reyestr sarlavhalari (0-qator, 41 ustun). Ustunlar **harf emas, sarlavha matni**
bo'yicha topiladi (trim + lower), chunki tizim ustun qo'shishi mumkin:

```
A №                              B номер                      C Статус заявки
D Дата регистрации заявки        E Дата оплаты                F Название организации
G ИНН                            H Эксперт                    I Соэксперт
J Тип экспертизы                 K Тип закупщика/проекта      L Стоимость
M Классификация проекта          N Название проекта           O ID номер объекта
P Получение подлинников экспертом
Q Стоимость проекта (без учета НДС)   R Стоимость проекта (с учетом НДС)
S..W  предельная / до / после экспертизы (4 ta)   X Денежная единица   Y Код валюты
Z Срок исполнения  AA Осталось дней  AB Просрочено дней  AC Дата выдачи заключения
AD Дата заключения с замечаниями  AE ФИО ответственного исполнителя
AF e-mail ответственного исполнителя  AG Контактный телефон ответственного исполнителя
AH Контактный телефон организации  AI Обязательность  AJ Тип закупки  AK окед
AL Место реализации проекта  AM Отрасли  AN..AO просроченные (2 ta)
```

`B номер` xlrd/SheetJS da **son** (67159.0) — `String(Math.round(v))` qilib
saqlanadi. `G ИНН` matn, ba'zan bo'sh. `Y Код валюты` da `\r\n` bo'lishi mumkin — trim.

## 1. Arxitektura

```
server/
  get-pocketbase.sh      # binary yuklash (bor)
  pocketbase             # gitignore
  pb_data/               # gitignore — SQLite + fayllar
  pb_public/             # gitignore — build.mjs shu yerga yozadi
  pb_schema.json         # kolleksiyalar (Admin UI → Settings → Import collections, yoki setup.sh)
  pb_hooks/
    registry.pb.js       # POST /api/registry/import — reyestr upsert
    dev-otp.pb.js        # PB_DEV=1 bo'lsa OTP kodini logga chiqaradi
  setup.sh               # superuser + schema import + sozlamalar (bir marta)
  run.sh                 # ./pocketbase serve --http 127.0.0.1:8090
src/
  vendor/pocketbase.umd.js, xlsx.full.min.js (bor)
  lib/pb.js              # S.pb — PocketBase klienti + yordamchi so'rovlar
  ui/auth.js             # kirish ekrani, OTP, 4 soat qulf
  ui/registry.js         # arizalar ro'yxati + tanlash + viloyat
  ui/sync.js             # ish maydonini saqlash/yuklash (fayllar, state, corrections)
  ui/hints.js            # narx eslatmalari
  ui/admin.js, admin.html # reyestr yuklash, foydalanuvchilar
  screens.html           # kirish/ro'yxat ekranlari (index.html ga qo'shiladi)
dist/
  smeta-taqqoslash.html  # eski bitta-fayl rejim (S.pb yo'q → hammasi avvalgidek)
  index.html, admin.html # server rejimi (server/pb_public ga ham ko'chiriladi)
```

Frontend PocketBase orqali tarqatiladi (`pb_public`), shuning uchun API bilan
bir domen — CORS muammosi yo'q. `S.pb` mavjud bo'lmasa (`smeta-taqqoslash.html`)
dastur hozirgi bitta-fayl rejimida ishlaydi — bu **mavjud testlar buzilmasligi**
kafolati.

### Kolleksiyalar (`server/pb_schema.json`)

`users` (auth, mavjud) — qo'shimcha maydonlar: `name` text, `role` select
`[admin, ekspert]`. Sozlamalar: **OTP yoqilgan** (duration 300 s, length 8),
**auth token duration = 14400** (4 soat), password auth o'chirilgan, OAuth yo'q.
Yangi foydalanuvchini faqat admin (superuser yoki `role=admin`) yaratadi —
OTP mavjud bo'lmagan emailga xat yubormaydi, shuning uchun «faqat admin qo'shgan
emaillar» talabi avtomatik bajariladi.

| Kolleksiya | Maydonlar | Indeks |
|---|---|---|
| `contragents` | `inn` text, `name` text | unique `inn` |
| `applications` | `number` text · `status` · `registered_at` date · `paid_at` date · `org_name` · `inn` · `contragent` rel→contragents · `expert` · `coexpert` · `expertise_type` · `buyer_type` · `project_title` · `object_id` · `cost` number · `cost_vat` number · `currency` · `place` (AL) · `branch` (AM) · `executor_name` · `executor_email` · `executor_phone` · `raw` json (qolgan ustunlar) · `imported_at` date | unique `number`; `inn`; `status` |
| `workspaces` | `application` rel (unique) · `region` select (15) · `files` file[] (max 30, 60 MB har biri, `.xlsx .xlsm`) · `state` json · `status` select `[in_progress, done]` · `opened_by` rel→users · `updated_by` rel→users · `changed` number (o'zgargan narxlar soni) | unique `application` |
| `corrections` | `workspace` rel · `application` rel · `contragent` rel · `region` select · `res_key` text (S.resKey) · `name` · `name_key` · `unit` · `unit_key` · `smeta_price` number · `market_price` number · `note` · `by` rel→users | unique (`workspace`,`res_key`); (`region`,`name_key`); (`contragent`,`name_key`) |
| `exports` | `workspace` rel · `application` rel · `file` file · `mode` · `by` rel | `application` |
| `registry_imports` | `file` file · `rows` · `added` · `updated` · `by` rel | — |

**Viloyat `workspaces` da**, `applications` da emas: ariza yozuvi faqat admin
importidan o'zgaradi, viloyatni xodim ish maydonini ochganda tanlaydi. Eslatma
filtri uchun `corrections` ga `region` va `contragent` nusxa qilib yoziladi.

Viloyat ro'yxati (`S.REGIONS`, qiymat → yorliq), 15 ta — expertcenter.uz
tanlovi bilan bir xil tartibda:

```js
S.REGIONS = [
  ['respublika',      'Umumrespublika'],
  ['andijon',         'Andijon viloyati'],
  ['buxoro',          'Buxoro viloyati'],
  ['fargona',         "Farg'ona viloyati"],
  ['jizzax',          'Jizzax viloyati'],
  ['xorazm',          'Xorazm viloyati'],
  ['namangan',        'Namangan viloyati'],
  ['navoiy',          'Navoiy viloyati'],
  ['qashqadaryo',     'Qashqadaryo viloyati'],
  ['samarqand',       'Samarqand viloyati'],
  ['sirdaryo',        'Sirdaryo viloyati'],
  ['surxondaryo',     'Surxondaryo viloyati'],
  ['toshkent_vil',    'Toshkent viloyati'],
  ['qoraqalpogiston', "Qoraqalpog'iston Respublikasi"],
  ['toshkent_sh',     'Toshkent shahri']
];
```

Viloyatni **taklif qilish** (majburiy emas, xodim tasdiqlaydi): `applications.place`
(RU nom, masalan «Кашкадарьинская область») to'ldirilgan bo'lsa — undan; bo'lmasa
`project_title` ichidan viloyat nomi (RU/UZ lotin/kirill: `Qashqadaryo`,
`Кашкадарь`, `Қашқадарё`, `Farg'ona`/`Фарғона`/`Ферган`, `Marg'ilon`→fargona
va h.k.) qidiriladi. Topilmasa — bo'sh, xodim tanlaydi.

### API qoidalari (rules)

```
users:            list/view: @request.auth.id != ""      create/update/delete: @request.auth.role = "admin"
contragents:      list/view: auth                         create/update: admin (hook ham yozadi — superuser sifatida)
applications:     list/view: auth                         create/update/delete: admin
workspaces:       list/view/create/update: auth           delete: admin
corrections:      list/view/create/update/delete: auth
exports:          list/view/create: auth                  delete: admin
registry_imports: list/view: auth  create: admin
```

`auth` = `@request.auth.id != ""`, `admin` = `@request.auth.role = "admin"`.
Hamma xodim barcha arizalar va ish maydonlarini ko'radi (tasdiqlangan talab).

## 2. Bosqichlar

Har bosqich: **Maqsad → Fayllar → Ishlar → Tekshiruv → Commit**.

### 1-bosqich. Server skeleti (≈ 1 sessiya)

Fayllar: `server/pb_schema.json`, `server/setup.sh`, `server/run.sh`,
`server/pb_hooks/dev-otp.pb.js`, `server/README.md`.

1. `server/setup.sh`: `./get-pocketbase.sh` → `./pocketbase superuser upsert
   "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASS"` → serverni vaqtincha ishga tushirib,
   `POST /api/collections/import` bilan `pb_schema.json` ni yuklaydi (superuser
   token: `POST /api/collections/_superusers/auth-with-password`) → to'xtatadi.
   Schema JSON ni yozishdan oldin Admin UI da bitta kolleksiya yaratib
   `GET /api/collections/<name>` javobini namuna qilib ol — 0.34 dagi maydon
   formatini taxmin qilma.
2. `users` kolleksiyasida: `otp.enabled=true, duration=300, length=8`,
   `authToken.duration=14400`, `passwordAuth.enabled=false`. Bu ham
   `pb_schema.json` ichida.
3. `dev-otp.pb.js`: `$os.getenv("PB_DEV")==="1"` bo'lsa, OTP xatini logga
   chiqaradi (kod + email). Aniq hook nomi va `e.meta` tarkibini
   https://pocketbase.io/docs/js-event-hooks (`onMailerRecordOTPSend`) dan
   tekshirib ol. Ishlab chiqishda SMTP kerak emas.
4. `run.sh`: `PB_DEV=1 ./pocketbase serve --http 127.0.0.1:8090 --dir pb_data`.

Tekshiruv (`test/pb-smoke.sh`): setup → serve → `/api/health` 200 →
superuser bilan `users` ga `test@example.com` (role `ekspert`) yaratish →
`POST /api/collections/users/request-otp` 200 va logda kod → `auth-with-otp`
200 → token bilan `GET /api/collections/applications/records` 200 → stop.
Commit: `Add the PocketBase server skeleton: schema, setup, dev OTP hook`.

### 2-bosqich. Kirish va qulf (≈ 1 sessiya)

Fayllar: `src/lib/pb.js`, `src/ui/auth.js`, `src/screens.html`, `src/app.css`,
`build.mjs`, `src/index.html`.

1. `build.mjs`: uchta chiqish. `dist/smeta-taqqoslash.html` — hozirgidek (vendor
   pocketbase/xlsx **qo'shilmaydi**). `dist/index.html` — `SCRIPTS` boshiga
   `src/vendor/pocketbase.umd.js`, `src/lib/pb.js`, oxiriga `src/ui/auth.js`,
   `src/ui/registry.js`, `src/ui/sync.js`, `src/ui/hints.js`; `index.html`
   dagi `<!--__SCREENS__-->` o'rniga `src/screens.html`. `dist/admin.html` —
   4-bosqichda. `--serve` bayrog'i: `dist/*.html` ni `server/pb_public/` ga
   ko'chiradi.
2. `src/lib/pb.js`: `S.pb = new PocketBase(location.origin)` (faqat global
   `PocketBase` bo'lsa), `S.me()`, `S.isAdmin()`, `S.pbErr(e)` (xatoni
   o'zbekcha matnga), `S.withBusy(promise)`.
3. `src/ui/auth.js` — `S.Auth`:
   * Ekranlar: `#screen-login` (email → «Kod yuborish» → 8 xonali kod → kirish),
     `#screen-lock` (qulf: «4 soat harakat bo'lmadi», qayta kod), dastur
     `#app-root` (hozirgi header/main). Oqim: `pb.collection('users').requestOTP(email)`
     → `authWithOTP(otpId, code)`. Xato matnlari o'zbekcha; email
     ro'yxatda bo'lmasa OTP baribir «yuborildi» deyiladi (PocketBase shunday),
     shuning uchun ekranda «Kod kelmasa — administratorga murojaat qiling».
   * Idle timer: `mousemove/keydown/click/scroll/touchstart` → `last=Date.now()`;
     har 60 s: `Date.now()-last > 4h` → `pb.authStore.clear()` + lock ekrani.
     Har 20 daqiqada faol bo'lsa `authRefresh()`. Sahifa ochilganda
     `pb.authStore.isValid` bo'lmasa — login ekrani.
   * Header'ga: foydalanuvchi nomi, «Chiqish», admin bo'lsa «Admin» havolasi.
4. `S.pb` bo'lmasa `S.Auth` hech narsa qilmaydi — bitta-fayl rejim.

Tekshiruv: `node build.mjs --serve`, `server/run.sh`, Playwright
(`test/e2e-auth.mjs`): login ekrani → OTP so'rash → kodni `server/pb_data/…log`
yoki hook stdout'idan olish → kirish → header'da ism. `node test/pipeline.cjs`
avvalgidek o'tadi. Commit: `Add email OTP sign-in and the four-hour idle lock`.

### 3-bosqich. Reyestr importi (admin) (≈ 1 sessiya)

Fayllar: `server/pb_hooks/registry.pb.js`, `src/admin.html`, `src/ui/admin.js`,
`src/lib/registry-parse.js`, `test/registry.cjs`.

1. `src/lib/registry-parse.js` — `S.parseRegistry(arrayBuffer)` → `{rows, headers}`:
   `XLSX.read(buf, {type:'array', cellDates:true})`, birinchi varaq,
   `sheet_to_json({header:1, raw:true})`, sarlavha qatorini «номер» va «инн»
   bor qator sifatida topadi (0–5 qatorlar orasida), ustunlarni sarlavha matni
   bo'yicha xaritalaydi (`HEAD` jadvali: normallashtirilgan RU sarlavha →
   maydon nomi). Qator → `applications` maydonlari + `raw` (xaritalanmagan
   ustunlar). `number` bo'sh qator tashlanadi. Sanalar ISO.
   `test/registry.cjs`: fixture → 400 qator, `number` 67159 birinchi, `inn`
   `204679222`, `cost_vat` 499335928, `registered_at` ISO. Node'da `XLSX` ni
   `require('../src/vendor/xlsx.full.min.js')` bilan yuklash mumkin.
2. `registry.pb.js`: `routerAdd("POST", "/api/registry/import", handler,
   $apis.requireAuth())` — `e.auth.get("role")==="admin"` tekshiradi, body
   `{rows:[...]}` (1000 talik bo'laklar), `$app.runInTransaction`: har qator
   uchun `inn` bo'lsa contragent `findFirstRecordByData("contragents","inn")`
   yo'q bo'lsa yaratadi (nomi — oxirgi ko'rilgan); `applications` ni `number`
   bo'yicha topadi → bor bo'lsa maydonlarni yangilaydi (`updated++`), yo'q
   bo'lsa yaratadi (`added++`). Javob `{added, updated}`. Hech narsa
   o'chirilmaydi.
3. `admin.html` + `admin.js`: superuser yoki `role=admin` kirishi (OTP orqali,
   `auth.js` qayta ishlatiladi); «Reyestr faylini yuklash» (`.xls/.xlsx`) →
   brauzerda parse → bo'laklab import → natija «qo'shildi N, yangilandi M» +
   `registry_imports` yozuvi (faylning o'zi ham saqlanadi). Foydalanuvchilar
   jadvali: email, ism, rol; qo'shish/o'chirish (`users` kolleksiyasi).

Tekshiruv: fixture ni ikki marta import → birinchi `{added:400, updated:0}`,
ikkinchi `{added:0, updated:400}`; `contragents` soni fixture'dagi noyob INN
soniga teng. To'liq `Report_1.xls` (foydalanuvchi bersa) — 28 337 qator
1–2 daqiqada. Commit: `Add the registry import: xls parsing, upsert hook, admin page`.

### 4-bosqich. Arizani tanlash va ish maydonini saqlash (≈ 2 sessiya)

Fayllar: `src/ui/registry.js`, `src/ui/sync.js`, `src/screens.html`,
`src/ui/app.js` (kichik ulanish nuqtalari), `src/index.html`.

1. `#screen-list` — arizalar ro'yxati: qidiruv (raqam / kontragent / loyiha
   nomi, `filter: number ~ q || org_name ~ q || project_title ~ q`), ustunlar:
   raqam, sana, kontragent, loyiha nomi, summa (НДС bilan), holat, **ish
   holati** (`workspaces` dan: boshlanmagan / ishlanmoqda (kim, qachon) /
   yakunlangan). Sahifalash 50 tadan, eng yangi birinchi. Tugma «Ochish».
2. Ochish → `workspaces` da yozuv bo'lmasa **viloyat tanlash** dialogi (taklif
   bilan) → `create` → `#app-root` ochiladi; bo'lsa — to'g'ridan-to'g'ri.
   Header'da: `№67159 · Kontragent · Viloyat · [Ro'yxatga qaytish]`.
3. `src/ui/sync.js` — `S.Sync`:
   * **Fayl yuklash**: `App.addFiles` hozirgidek parse qiladi; parallel
     `workspaces.update(id, {'files+': [File...]})`. `project.fileId` ga
     PocketBase fayl nomi yoziladi (javobdagi `files` massividan).
   * **State**: `{projects:[{fileId, name, title, intro, enabled, open,
     objects:[{name, enabled}]}], prices:{resKey: price}, looseBook, opts}`.
     Har o'zgarishdan keyin 1.5 s debounce bilan `workspaces.update(id,
     {state, changed, updated_by})`. Ulanish nuqtalari `app.js` da:
     `onParsed` oxiri (`rebuild` dan keyin), `setPrice`/`setPrices`,
     `renderSide` dagi enable/order/name o'zgarishlari, `saveOpts`.
     Eng oson yo'l: `App.prototype.rebuild` va `setPrice`/`setPrices`/`saveOpts`
     ichidan `S.Sync.touch()` chaqirish — `sync.js` ularni **o'rab** (wrap)
     qo'yadi, `app.js` ga bir qatordan ortiq tegilmaydi.
   * **Corrections**: narx o'zgarganda (`setPrice`) — `corrections` da
     (`workspace`,`res_key`) bo'yicha upsert (`market_price`, `note`); narx
     smeta narxiga qaytarilsa — o'chirish. `region`, `contragent`,
     `application` nusxalari yoziladi. Bir necha narx birdaniga (`setPrices`,
     narx kitobi) — 50 talik bo'laklar bilan.
   * **Qayta ochish**: `workspaces.getOne` → `files` ni `pb.files.getURL`
     bilan `fetch` → `File` obyektlari → `App.addFiles` (tartib `state.projects`
     bo'yicha) → parse tugagach `state` ni qo'llash: nomlar, enabled, order,
     keyin `setPrices(state.prices)`. Yakunlangan ariza ham shu yo'l bilan
     **davom etadi** (tasdiqlangan talab).
   * **Eksport**: `exportWorkbook` natijasi yuklab olinadi **va** `exports`
     ga (`file`, `mode`) yoziladi. Ro'yxat ekranida arizaning eksportlari
     ko'rinadi va yuklab olinadi.
   * «Yakunlash» tugmasi: `status=done`; keyin ham ochish va davom ettirish mumkin.
4. Bir vaqtda ikki xodim: `updated_by`/`updated` boshqa odam va 10 daqiqadan
   yangi bo'lsa — ochishda ogohlantirish («X 5 daqiqa oldin ishlagan»). Oxirgi
   yozgan g'olib; qulflash qilinmaydi (v1).

Tekshiruv (Playwright, `test/e2e-workspace.mjs`): kirish → 67159 ni ochish →
viloyat `fargona` → `test/` dagi ikkita smeta xlsx yuklash → bitta narxni
o'zgartirish → sahifani qayta yuklash → o'sha ariza ochilganda fayllar, narx
va farq qaytadi; `corrections` da 1 yozuv; eksport → `exports` da 1 yozuv.
`node test/pipeline.cjs` avvalgidek. Commit ikkiga bo'linadi:
`Add the application list and region choice`, `Persist workspaces: files, state, corrections, exports`.

### 5-bosqich. Narx eslatmalari (≈ 1 sessiya)

Fayllar: `src/ui/hints.js`, `src/ui/prices.js` (kichik), `src/app.css`.

1. `S.Hints.load(model, ws)`: model qurilgach, `model.resources` dagi noyob
   `name_key` lar 40 talik bo'laklarga → `corrections` ga so'rov
   `region = "{ws.region}" && workspace != "{ws.id}" && (name_key = "a" || …)`,
   `sort: -updated`, `expand: application,contragent,by`, `perPage: 500`.
   Natija `Map<nameUnitKey, hint[]>`; `hint = {price, note, contragent,
   number, region, at, by, sameContragent}`. Tartib: `sameContragent` (STIR
   ws kontragentiga teng) birinchi, keyin sana bo'yicha. **Boshqa viloyat
   umuman so'ralmaydi** (tasdiqlangan talab).
2. `prices.js` qatorida: eslatma bo'lsa narx katagi yonida belgi
   `<button class="hint">3 ta eslatma</button>`; bosilsa yoki katakka fokus
   kelsa kichik popover: har eslatma — narx, «№67101 · Kontragent · Farg'ona ·
   12.08.2026», `sameContragent` bo'lsa yashil yorliq «Shu kontragent»,
   «Qo'llash» tugmasi → `app.setPrice(key, price)`. Bitta katakka bir xil narx
   takrorlansa — bitta qatorda «×N».
3. Filtr `#filter` ga `hint` («Eslatmasi borlar») qiymati; ledger'ga
   «Eslatmali resurslar: N».
4. Yig'ilgan jadval (`bindSheetEditing`) inputlari uchun ham shu popover
   (ixtiyoriy; vaqt bo'lsa).

Tekshiruv: ikkita ish maydoni (bir viloyat, turli kontragent) → ikkinchisida
eslatma ko'rinadi, «Shu kontragent» belgisi to'g'ri; uchinchi ish maydoni
boshqa viloyatda → eslatma yo'q. Commit: `Show price hints from earlier projects in the same region`.

### 6-bosqich. Yakunlash (≈ 1 sessiya)

* Ro'yxat ekranida filtrlar: holat, viloyat, kontragent, yil; ariza
  kartochkasi (barcha reyestr maydonlari + eksportlar tarixi + kim qachon ishlagan).
* Admin: `registry_imports` tarixi; foydalanuvchini o'chirish o'rniga «faol
  emas» (`users.verified`/custom `active`).
* `README.md` ga «Server rejimi» bo'limi; `CLAUDE.md` ga yangi buyruqlar.
* Xatolarni ko'rsatish: tarmoq uzilsa toast + saqlanmagan o'zgarishlar
  belgisi (`●`), qayta urinish.

Commit: `Finish the server mode: filters, application card, docs`.

### 7-bosqich. Joylashtirish (foydalanuvchi ma'lumotlari kerak)

Kerak: VPS (Toshkent, Ubuntu 22.04+, 1 vCPU/1 GB yetarli), domen, SMTP hisobi
(masalan, Yandex 360 / Zoho / o'z pochta serveri; PocketBase Settings → Mail).

1. `server/deploy/pocketbase.service` (systemd, `--http 0.0.0.0:80 --https 0.0.0.0:443`
   bilan PocketBase o'zi Let's Encrypt oladi) yoki Caddy orqasida.
2. `setup.sh` serverda; `pb_schema.json` import; SMTP sozlash; `PB_DEV`
   o'chiq (OTP endi emailga).
3. Zaxira: PocketBase Settings → Backups (kunlik, S3 shart emas — lokal
   papka + `rsync` boshqa joyga).
4. Reyestrni to'liq import qilish, foydalanuvchilarni qo'shish, 2–3 xodim
   bilan bir hafta pilot.

## 3. Test strategiyasi (arzon → qimmat)

1. `node test/pipeline.cjs …` — mavjud, brauzersiz. Har bosqichda o'tishi shart.
2. `node test/registry.cjs` — fixture parse (3-bosqich).
3. `sh test/pb-smoke.sh` — server + API (1, 3-bosqichlar); PocketBase'ni
   `127.0.0.1:8090` da ishga tushirib, curl bilan tekshiradi, oxirida to'xtatadi.
4. Playwright e2e (`test/e2e-*.mjs`) — faqat bosqich oxirida, chromium
   `/opt/pw-browsers/chromium-*/chrome-linux/chrome`, `--no-sandbox`
   (namuna: `test/browser.mjs`).

## 4. Tokenni tejash

* Har bosqich — **yangi sessiya** (`/clear`). Birinchi xabar:
  «`docs/2-bosqich-kod-rejasi.md` dagi N-bosqichni bajar». Model butun
  suhbat tarixini emas, faqat shu faylni o'qiydi.
* Model katta fayllarni to'liq o'qimasin: `app.js` da kerakli funksiyalar
  nomi bilan berilgan (`grep -n "prototype.setPrice"`).
* `Report_1.xls` (24 MB) sessiyaga yuklanmasin — fixture yetarli. To'liq import
  faqat foydalanuvchining o'zi 3-bosqich oxirida sinaydi.
* Playwright faqat bosqich oxirida; oraliq tekshiruvlar curl/node bilan.
* `xlsx.full.min.js` (880 KB) va `pocketbase.umd.js` allaqachon vendor'da —
  qayta yuklab olish shart emas.
* PocketBase hujjatlarini butunlay o'qimaslik: kerakli sahifalar —
  `docs/api-records` (OTP: `request-otp`, `auth-with-otp`), `docs/js-routing`,
  `docs/js-database` (`findFirstRecordByData`, `runInTransaction`),
  `docs/js-event-hooks` (OTP mail hook), `docs/api-collections` (import).
