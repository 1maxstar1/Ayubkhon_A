# Loyiha haqida

Smeta resurs narxlarini tekshirish va **TAQQOSLASH JADVALI №2** hujjatini
tayyorlash vositasi. To'liq tavsif — `README.md` da. Keyingi bosqich
(ko'p foydalanuvchi, PocketBase, narx xotirasi) talablari — `docs/2-bosqich-reja.md`,
bosqichma-bosqich kodlash ko'rsatmasi — `docs/2-bosqich-kod-rejasi.md`.
Versiyalar, orqaga qaytish va NLP jadvallarini o'lchov bilan o'zgartirish —
`docs/versiyalar.md`. Uchta to'liq tekshiruv va ularning natijalari — `docs/audit-plan.md`
(birinchi), `docs/audit-2-reja.md` (ikkinchi) va `docs/audit-3-reja.md`
(uchinchi, o'lchov bilan: rad etilgan takliflar ham yozilgan). To'rtinchisi —
`docs/ai-reja.md` — takliflarni ekspert ishidan o'rgatish rejasi (jurnal, xotira, tartiblovchi model; qaysi bosqich
bajarilgani boshida yozilgan), `docs/ai-model.md` — shuning oddiy tildagi tavsifi. `docs/audit-4-reja.md` — butun dastur bo'yicha **bosqichma-bosqich bajarilayotgan
reja**: topilmalar, ustuvorlik tartibi va egasi hal qiladigan savollar; 1–5-bosqichlar
bajarilgan (v2.9.2 – v2.10.0: yashil to'plam va CI, qulaylik va QQS), 6–7 navbatda — har bir band yonida holati yozilgan.
`docs/format-reja.md` — smeta formatlarini tanishni o'rganish rejasi (himoya testi, har bir yuklangan smetadan format
namunasi yig'ish, 100 fayldan keyin model, AI faqat qoidalar o'qiy olmagan faylda); qaysi qadam bajarilgani boshida yozilgan.

## Muloqot tili

**Foydalanuvchiga har doim o'zbek tilida (lotin alifbosida) javob berish.**
Kod, izohlar va commit xabarlari ingliz tilida qoladi; **dastur interfeysi
ruscha** (foydalanuvchi talabi, 2026-09-04); eksport hujjat matnlari (shtamp,
sarlavha, ikki tilli sarlavha qatori) 321.xlsx namunasidagidek rus/o'zbek.

## Ishlash tartibi

```sh
node build.mjs                                        # dist/smeta-taqqoslash.html + index.html + admin.html
node build.mjs --serve                                # ... va server/pb_public ga nusxa
node test/pipeline.cjs a.xlsx b.xlsx --out out.xlsx   # brauzersiz tekshiruv
node test/smeta-form4a.cjs                            # 4А shakli (АВС-4): bir varaqda ko'p lokal smeta
node test/smeta-header.cjs                            # oddiy varaq: shakli bo'yicha o'qilmasa — sarlavhasi bo'yicha
SMETA_KIT=<kit> node test/smeta-corpus.cjs [--record]  # o'quvchi egasi yuborgan barcha smetalarda: qoida o'zgarsa, qolganlari avvalgidek o'qilishi shart (maxfiy, repoda emas)
node test/export-formulas.cjs                         # eksport qayta o'qiladi, formulalari hisoblanadi: ИТОГО = qatorlar yig'indisi (uch turda)
node test/worker-parity.cjs                           # sahifadagi worker o'quvchi qaytargan narsani aynan qaytaradi
node test/compare.cjs; node test/e2e-compare.mjs      # «Сравнение версий» va «Наш ответ (Excel)»: qaytgan smetani birinchisi va jadvalimiz bilan solishtirish
node test/volumes.cjs; node test/e2e-volumes.mjs      # «Объёмы работ»: 5-shakl ishlari, yangi hajm → resurs miqdori, javobning «объем» varag'i, Таблица №1
node test/e2e-compare-keep.mjs                        # ... va ish maydonida: yuklangan fayllar qayta yuklashdan keyin qaytadi
node test/browser.mjs [a.xlsx b.xlsx]                 # haqiqiy brauzerda (bitta-fayl rejim); faylsiz — o'ylab topilgan smetada
node test/price-book.mjs                              # «Книга цен»: saqlash, qayta yuklash, jadval ko'rinishidagi narxlar ro'yxati
sh test/all.sh [reyestr.xls smeta1.xlsx smeta2.xlsx]  # hamma test; faylsiz — sintetik smetalarda (test/synth.cjs). Yashil bo'lishi shart
sh server/release.sh X.Y.Z "izoh" --row matn.md [--dry]   # reliz bitta buyruq bilan: versiya, qurish, to'plam, ikki commit, push
node test/server-helper.mjs; sh test/release-script.sh    # test serveri yetim qolmaydi; reliz skripti vaqtinchalik nusxada
sh server/setup.sh && sh server/run.sh                # PocketBase (server rejimi), README «Server rejimi»
sh server/laptop.sh [autostart|status|backup|drive|restore|update|stop]   # noutbuk rejimi: bitta odam, baza shu diskda; zaxira ikki joyga
server\laptop.cmd [autostart|status|backup|update|rollback|autoupdate|drive|stop|debug|doctor]   # xuddi shu, Windows'da (Node/Git kerak emas)
irm https://raw.githubusercontent.com/1maxstar1/Ayubkhon_A/HEAD/server/install-windows.ps1 | iex   # Windows: bitta qator bilan o'rnatish/yangilash
sh test/laptop-windows.sh                             # Windows ishga tushirgichi, pwsh ostida
sh test/laptop-backup.sh; node test/backup-prune.cjs  # Mac ishga tushirgichi: zaxira, ikkinchi joy, tiklash; qaysi nusxalar saqlanadi
node test/upload-fail.mjs; node test/two-tabs.mjs     # serverga yuklanmagan smeta «saqlangan» emas; bitta ariza ikki vkladkada
node test/close-tab.mjs; node test/state-size.mjs    # yopilgan vkladkada oxirgi narx yo'qolmaydi; holat server cheklovidan oshmaydi
sh test/pb-smoke.sh; node test/e2e-workspace.mjs      # server rejimi testlari
node test/contragent-prices.mjs                       # «Цены этого контрагента…»: oldingi narxlar bitta ro'yxatda, bitta tasdiq
node test/learning.mjs                                # o'rganish uchun yozuvlar: qarorlar jurnali, «Завершить» oynasi va narxlar xotirasi
node test/memory.cjs; node test/e2e-memory.mjs        # xotira ishlatilishi: «пам.» tartibi, «ранее принято» chegarasi (mustaqil arizalar, yosh), kalit
node test/ml.cjs; node test/e2e-dataset.mjs           # o'rganish: belgilar (smeta narxisiz), metrikalar, dataset va bugungi qoidalar o'lchovi; admin «Набор для обучения»
node test/ml-price.cjs                                # narx modeli: dalillar (oldingi arizalar, spravochnik), yo'qotish va gradient, qaror, sintetik ekspert
node test/ml-layout.cjs; node test/e2e-formats.mjs    # format namunasi (nom va narxsiz), imzo, arifmetika, xesh; `smeta_files` ga yozish va admin «Распознавание форматов смет»
sh server/release.sh X.Y.Z "izoh" --row matn.md --unlisted; sh server/release.sh --list X.Y.Z   # egasi avval sinaydigan reliz: ro'yxatsiz chiqarish, sinalgach ro'yxatga qo'shish
node test/num.cjs; node test/xlsx-guard.cjs           # son qat'iy o'qiladi («1,234.50» — ha, yonida so'z bo'lsa — yo'q); begona .xlsx o'quvchini osib qo'ymaydi
node test/normalize.cjs; node test/sections.cjs; node test/regions.cjs   # NLP o'lchovlari
node test/hints.cjs a.xlsx [b.xlsx]                    # o'xshash resurs takliflari: smeta ichida (85/5) va qayd etilgan bazaga nisbatan (aniqlik, to'liqlik, xavfsizlik) — baza bo'lsa (`REFS_KIT`/`HINTS_GOLDEN`), kompyuterdagi barcha qayd etilgan to'plamlarda
REFS_KIT=<kit> node test/hints.cjs a.xlsx b.xlsx --record [--accept "sabab"]   # bazani yozish (maxfiy, kit ichida) — faqat muhr nomlagan kod uchun; o'zgargan kod yoki yiqilgan o'lchov faqat --accept bilan, sababi muhrga yoziladi
node test/refs.cjs                                    # справочные цены: yadro, sintetik ma'lumotda
node test/uzex.cjs; node test/uzex-api.mjs; node test/e2e-uzex.mjs   # UZEX haftalik kotirovkalari: sahifani o'qish, sinxronlash, «Проверка цен» (soxta sayt: test/uzex-site.mjs)
REFS_KIT=<kit> node test/refs-parity.cjs               # dastur o'lchangan natijani aynan qaytaradimi (kit — maxfiy, repoda emas)
REFS_KIT=<kit> node test/refs-privacy.cjs              # repo va dist da haqiqiy narx/hujjat yo'qligi (commit oldidan)
node test/fixtures.cjs --smeta a.xlsx --registry r.xls  # o'lchov ma'lumotini yangilash
sh server/deploy/find-server.sh; sh server/deploy/find-server.sh 1   # server manzilini topib eslab qolish (bir marta)
sh server/deploy/pull-backup.sh && sh server/deploy/push.sh          # zaxira + chiqarish (manzil eslab qolingan)
sh server/deploy/rollback.sh v2.1                     # serverni eski versiyaga qaytarish
```

Ikki mahsulot: bitta-fayl `dist/smeta-taqqoslash.html` (serversiz, avvalgidek)
va server rejimi `dist/index.html` + `dist/admin.html` (PocketBase orqali).
Server rejimi uch joyda turishi mumkin: noutbukda (`server/laptop.sh` Mac/Linux,
`server/laptop.cmd` Windows; bitta odam — kirish kodi pochtaga ketmaydi,
`PB_LAPTOP=1` da shu kompyuterga qaytariladi), ofis tarmog'ida (`server/lan.sh`) yoki VPS da
(`server/deploy/push.sh`). Kod bitta — farqi faqat qayerda ishlashida.
`src/lib/` yadro ikkalasiga umumiy; server qismi `S.pb` bo'lmasa o'zini o'chiradi.

## Muhim qoidalar

* Eksport qilingan `.xlsx` namunaviy hujjat (`321.xlsx`) bilan **bir xil
  ko'rinishda** bo'lishi shart: Times New Roman 10, `CCFFFF` / `D9E2F3`
  bandlar, ingichka chegaralar, `#,##0` va `0.000` formatlari, `10 000 000`
  dan katta summalar uchun pushti shartli formatlash.
* Formulalar tirik saqlanadi — `=E*F`, `=E*H`, `=+G-I`, `SUM(...)`. Smetaning
  o'z formulasi **faqat oddiy funksiyalardan** iborat bo'lsa tirik ko'chadi
  (arifmetika, yaxlitlash, shartlar, sanash, varaq ichidagi qidiruv — ro'yxat
  `src/lib/formula.js` da, `S.formula.unsafe`). Tashqariga murojaat qiladigan
  (`WEBSERVICE`, `HYPERLINK` …) yoki ro'yxatda yo'q funksiyali formula o'rniga
  smetaning o'zi ko'rsatgan **qiymat** yoziladi, va sahifa nechta ekanini
  aytadi (v2.9.4, egasining qarori). Ro'yxat — ruxsat etilganlar ro'yxati:
  unga funksiya qo'shish mumkin, uni «taqiqlanganlar» ro'yxatiga aylantirish
  mumkin emas.
* Bitta resursning bozor narxi — nomi va o'lchov birligi bo'yicha bitta qiymat;
  u loyihadagi **barcha** qatorlarga tushadi.
* Bir resurs smetalarda bir nechta narx bilan uchrashi mumkin. Foydalanuvchi
  narx yozmaguncha **har bir qator o'z smeta narxida turadi** — farq `0`.
  Summalarni hisoblashda har doim qatorma-qator yig'ish kerak, «umumiy
  miqdor × bitta narx» emas.
* NLP jadvallari (`sections.js` `LEX`, `regions.js` `NAME`/`PLACE`,
  `match.js` `UNIT_SAME`) va o'xshashlik bahosi (`match.js` `similarity`)
  **o'lchovsiz o'zgartirilmaydi**: har bir o'zgarish `test/sections.cjs` /
  `test/regions.cjs` / `test/hints.cjs` raqamlari bilan asoslanadi.
  `match.js`, `normalize.js` va sahifaning `SIM_MIN`/`SIM_SHOW` i hamda `rankSimilar` i `test/hints.stamp`
  muhriga ega (refs-parity kabi): haqiqiy smetalar va maxfiy bazasiz (`REFS_KIT`)
  o'lchanmagan o'zgarish `test/all.sh` da «NOT MEASURED» — yiqiladi. Bazaga nisbatan
  aniqlik, to'liqlik yoki xavfsizlik bitta taklifdan ko'p yomonlashsa — yiqiladi;
  bilib qilingan murosa (masalan ko'proq taklif, lekin kamroq aniq) egasining
  qarori bilan `--record --accept "sabab"` qilinadi — sabab muhrda qoladi. Bazani
  boshqa kodga ko'chirish ham faqat `--accept` bilan (aks holda har biri «bittadan
  ko'p emas» yomonlashgan qadamlar yig'ilib ketardi); qayd etilgan resurslarning
  98 % i qayta topilishi shart (nom kaliti o'zgarsa — bu ham qaror). `rankSimilar`
  o'zgarsa, test uni takrorlay olmaydi: `test/hints.cjs` dagi `suggest()` va
  `RANK_SHA` u bilan birga o'zgartiriladi, keyin o'lchanadi.
  Bir necha viloyatda uchraydigan joy nomi hech kimga berilmaydi.
* **Справочные цены** (`src/lib/refs/`, v2.5.0): narx hujjatlaridan olingan
  ma'lumot (paket `.json.gz`, hujjat nomlari, narxlar) **hech qachon repoga
  tushmaydi** — u egasining kompyuterida, admin sahifasi orqali yuklanadi;
  testlar faqat sintetik ma'lumotda. `src/lib/refs` jadvallari va qoidalari
  faqat `test/refs-parity.cjs` o'lchovi bilan o'zgaradi (`REFS_KIT` siz
  `test/all.sh` «NOT MEASURED» deydi). Taklif faqat «Применить» bosilganda
  qo'yiladi; ekspert yozgan narx doim ustun.
* **UZEX (биржа)** (v2.9.0) — ikkinchi, **alohida** narx manbai: uzex.uz haftalik kotirovkalari (faqat ruscha
  sahifa), o'z kolleksiyalarida (`uzex_imports`, `uzex_quotes`, `uzex_settings`; `server/pb_hooks/uzex.pb.js`).
  `ref_packages` ga va `src/lib/refs` ga tegmaydi: hafta dvigatelga xotiradagi vaqtinchalik paket sifatida beriladi
  (`src/lib/uzex.js`, `src/uzex-worker.js`), IndexedDB ga yozilmaydi. Hafta to'liq yoziladi yoki umuman yozilmaydi;
  so'mda bo'lmagan kotirovka hech qachon narx sifatida taklif qilinmaydi; «Автоподбор» UZEX dan olmaydi.
  Birja narxi QQS bilan: bazada bosilganidek saqlanadi, taklif va qo'llanadigan narx esa QQSsiz (`S.uzex.net`, ÷ 1,12).
  Testlar faqat soxta saytda (`UZEX_BASE`), test serverlari saytga o'zi chiqmaydi (`UZEX_AUTO=0`).
* **To'plam yashil turadi** (4-tekshiruv, 4-bosqich): `sh test/all.sh` «0 fail»
  bilan tugashi shart, va har bir push'da GitHub Actions'da ishlaydi
  (`.github/workflows/tests.yml`, faqat sintetik ma'lumotda). Test yiqilsa —
  yo dastur, yo test tuzatiladi; «doim qizil» test qoldirilmaydi. Testga
  kerakli smeta `test/synth.cjs` da o'ylab topiladi — haqiqiy smeta, narx
  yoki hujjat nomi repoga test sifatida ham tushmaydi. `test/refs-parity.stamp` va
  `test/hints.stamp` o'lchovdan keyin yangilansa — **commit qilinadi** (qaytarib
  qo'yilmaydi). Ularni faqat o'tgan o'lchov yozadi (o'xshashlik uchun yana egasi
  qabul qilgan yozuv, `--accept`), va faqat o'lchangan kod yangi bo'lsa — sanasi
  uchun emas. `server/release.sh` ularni reliz commit'iga o'zi qo'shadi. `src` o'zgarsa, to'plamdan oldin `node build.mjs`:
  to'plam birinchi bo'lib `dist/` src dan qurilganini tekshiradi (CI da shu muhim).
* **O'rganish uchun ma'lumot** (`docs/ai-reja.md`, v2.11.0): qarorlar jurnali (`suggest_events`) va yakunlangan
  arizalar narxlari (`price_memory`) faqat server yo'llari orqali yoziladi (`server/pb_hooks/learning.pb.js`);
  jurnal xatosi hech qachon ishni to'xtatmaydi; smeta narxi jurnalga yozilmaydi va tartiblash belgisi bo'lmaydi;
  dataset va o'qitilgan model fayllari repoga tushmaydi (`test/refs-privacy.cjs` ushlaydi). Model kodi
  `src/lib/ml/` da yoziladi — `src/lib/refs/**` ga tegilmaydi (o'lchov xeshi), darvoza (raqam, birlik, bo'lim, sana)
  o'rganilmaydi, daraja tartibi buzilmaydi, narx faqat «Применить» bilan qo'yiladi. Egasi sinamagan versiya
  `--unlisted` bilan chiqariladi. Xotira qoidalari (`src/lib/memory.js`): tegilmagan narx — bozor narxi emas,
  chegara; u faqat mustaqil arizalar (turli kontragentlar) kelishsa kuchga kiradi; kontragentning o'z narxi o'zini
  tasdiqlamaydi; boshqa viloyat o'qilmaydi. Dataset (`src/lib/ml/dataset.js`, v2.13.0): bitta savol — bitta
  yakunlangan narx, o'z arizasi sanasida qayta so'ralgan; belgilash qoidalari (qo'llangan qator, 2 % ichida yozilgan
  narx, «hech biri», qoldirilgan-lekin-pastrog'i-bor; barcha qatorlar smeta narxidan yuqori bo'lsa — o'qitilmaydi)
  egasining qarori bilan o'zgaradi. Eng yangi arizalarning beshdan biri — test qismi: unda hech narsa o'qitilmaydi,
  hatto ko'z bilan tanlash ham. Belgilar sxemasi (`features.js` `NAMES`) o'zgarsa `VERSION` ko'tariladi — xesh
  o'zgaradi va eski model yuklanmaydi. Admin sahifasi faqat son ko'rsatadi; dataset fayli nom va narxsiz.
  **Narx modeli** (`src/lib/ml/pricedata.js`, `pricemodel.js`, v2.14.0; egasining qarori 2026-11-13): model ekspertning
  bozor narxini taxmin qiladi va dastur smeta narxini u bilan solishtiradi. Resursning **o'z smeta narxi hech qachon
  kirish emas** — u faqat qoldirilgan narxning belgisi («kamida shuncha») va qaror paytidagi solishtirish. Dalil faqat
  **oldingi** arizalardan (o'z sanasidan avvalgi, shu viloyat). Uch usul (spravochnik, tayanch, model) bir xil test
  qismida o'lchanadi; eng yaxshisidan bir punkt ichidagilarning eng soddasi tanlanadi; test qismi hech narsani
  tanlamaydi. Model egasi sonlarni ko'rib rozi bo'lmaguncha ish sahifasida ishlatilmaydi.
* **Hajmlar va miqdorlar** (`src/lib/volumes.js`, `src/ui/volumes.js`, v2.15.0): ishlar 5-shakl vedomostidan
  (`01_ЛРВ`) o'qiladi; ekspertning qarori — `app.vol` (ish kaliti → loyiha hajmi, izoh) va `app.qtys` (resurs
  kaliti → jami miqdor), ish maydonida saqlanadi. Yangi hajm resursni faqat bir birlikka × (yangi − eski) ga
  siljitadi. **Narxlar, tejash va Таблица №2 miqdorga tegmaydi** — miqdor faqat «Таблица №1 (объёмы)» varag'iga
  chiqadi, u esa faqat biror narsa belgilanganda qo'shiladi (aks holda hujjat avvalgidek).
* **Smeta formatlari** (`docs/format-reja.md`, v2.16.0): fayllarni **qoidalar** o'qiydi (`src/lib/smeta.js`); qoida
  o'zgarsa `SMETA_KIT=<kit> node test/smeta-corpus.cjs` qolgan fayllar avvalgidek o'qilishini isbotlashi shart (keyin
  ko'rib chiqib `--record`). Loyiha sifatida yuklangan har bir smeta `smeta_files` ga yoziladi (`src/ui/formats.js`):
  xesh, qanday o'qilgani, va **nom-narxsiz** format namunasi (`src/lib/ml/layout.js`; sxema o'zgarsa `VERSION`
  ko'tariladi); fayl o'zi faqat o'qilmagan yoki summalari mos kelmagan bo'lsa saqlanadi. Yozish hech qachon ishni
  to'xtatmaydi. Egasining smetalari, namunalar, `golden.json` va vaznlar repoga tushmaydi. Model (keyingi qadamlar)
  qoidalar o'qigan faylga **tegmaydi**: faqat hech narsa o'qilmaganda taklif qiladi, o'qigani arifmetika bilan
  tekshiriladi va «проверьте» deb ko'rsatiladi.
* Raqamlar hech qachon yo'qolmaydi: `АНКЕР М5` ≠ `АНКЕР М8`, `4.1.1` ≠ `4.11`;
  ikki raqam orasidagi ajratgich o'chirilmaydi.
* **Xavfsizlik bo'limi hozircha o'chirilgan (egasining qarori, 2026-10-24).**
  Dastur bitta odamning o'z kompyuterida ishlaydi, uni boshqa hech kim
  ishlatmaydi va ko'rmaydi — shuning uchun noutbuk rejimida kirish oynasi,
  4 soatlik qulf va «Выйти» yo'q: sahifa ochilishi bilan ichkaridasiz
  (`PB_AUTOLOGIN=1`, `server/pb_hooks/laptop.pb.js`, `src/ui/auth.js`
  `autoSignIn`). **Bu vaqtinchalik — egasi uni keyin qaytarmoqchi.** Hech narsa
  o'chirib tashlanmagan: hisob, qoidalar, «kim qaysi narxni yozgan» joyida.
  Qaytarish: noutbukda `PB_AUTOLOGIN=0` bilan ishga tushirish (kirish oynasi
  qaytadi, kod o'zi to'ldiriladi); ko'p foydalanuvchiga o'tishda (`lan.sh`,
  VPS) esa o'z-o'zidan qaytadi — u yerda `PB_AUTOLOGIN` yo'q, kod pochtaga
  ketadi. Bitta himoya o'chirilmaydi: avtomatik kirish faqat dasturning o'z
  sahifasiga beriladi, brauzerda ochiq boshqa saytga emas
  (`server/pb_hooks/lib/laptop.js`).
* Har bir versiya sahifa sarlavhasida ko'rinadi va orqaga qaytariladi
  (`server/deploy/rollback.sh`); ish maydoni narxlarni eski va yangi kalitda
  saqlaydi, shuning uchun qaytish ma'lumot yo'qotmaydi.
* **Windows noutbuk o'zi yangilanadi** — faqat `server/releases.txt` dagi
  relizga (o'rnatuvchi `install-windows.ps1` ham shu ro'yxatdan oladi). Reliz
  chiqarish — `sh server/release.sh X.Y.Z "izoh" --row matn.md`: u
  `package.json` versiyasini ko'taradi → `node build.mjs` → to'plam
  (`test/all.sh`, yashil bo'lishi shart; `laptop-windows` (PowerShell, `PWSH`) va
  brauzer testlari (playwright) **o'tkazib yuborilsa yoki umuman ishlamasa ham reliz
  rad etiladi**, chetlab o'tish yo'li yo'q — faqat egasining fayllari/to'plamiga
  bog'liqlari SKIP bo'lishi mumkin; `laptop-windows` faqat Linux'da ishlaydi, shuning
  uchun relizlar Linux'da, pwsh bilan qilinadi) → commit + push; keyin **alohida
  commit** bilan `releases.txt` ga `vX.Y.Z <o'sha commit hash>` qatori va
  `docs/versiyalar.md` ga qator. Qo'lda qilinsa ham tartib shu. Versiya raqami hech qachon qayta
  ishlatilmaydi — buzilgan relizni keyingi patch-versiya tuzatadi. Har bir
  versiya `%LOCALAPPDATA%\Taqqoslash\app\` da o'z papkasida turadi,
  `current.txt` qaysi biri ishlashini aytadi; yangi versiya o'zini sinovdan
  o'tkazmaguncha ko'rsatkich o'zgarmaydi. Versiyalar orasidagi kelishuv
  (to'liq ro'yxati `server/laptop.ps1` boshida: buyruq qatori, ko'rsatkichlar,
  `TAQ_LAUNCHER`, `serve`/`serve resumed`/`serve trial`, `selftest`, pid
  fayllari, `trial.ok`, `supervisor.beat`, `FAILED`/`ROOT_SEEN`, `serve` ning
  chiqish kodlari) keyingi versiyalarda **o'zgarmasligi shart** — `C:\Smeta`
  dagi eski ishga tushirgich shu orqali yangilarini ishga tushiradi. Eslatma: v2.3
  ning `laptop.cmd update` i (birinchi o'tish) shoxning oxirgi holatini oladi —
  shuning uchun o'sha paytda shoxda faqat relizning o'zi turishi kerak.
