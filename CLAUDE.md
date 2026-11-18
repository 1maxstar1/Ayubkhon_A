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
node test/export-names.cjs                            # varaq nomlari («&», 31 belgi, \ / * ? : [ ], katta-kichik harf) va bitta qo'shimcha ustun yashirin
node test/xls-read.cjs                                # eski Excel (.xls, 97–2003): worker'dagi SheetJS orqali, .xlsx bilan bir xil o'qiladi
node test/pdf-read.cjs                                # «Наш ответ» PDF da: jadval chiziqlari bo'yicha kataklarga, Excel bilan bir xil o'qiladi (PDF lar test/pdf-make.cjs da yasaladi)
node test/worker-parity.cjs                           # sahifadagi worker o'quvchi qaytargan narsani aynan qaytaradi
node test/compare.cjs; node test/e2e-compare.mjs      # «Сравнение версий» va «Наш ответ (Excel/PDF)»: qaytgan smetani birinchisi va jadvalimiz bilan solishtirish
node test/volumes.cjs; node test/e2e-volumes.mjs      # «Объёмы работ»: 5-shakl ishlari, yangi hajm → resurs miqdori, javobning «объем» varag'i, Таблица №1
node test/e2e-compare-keep.mjs                        # ... va ish maydonida: yuklangan fayllar qayta yuklashdan keyin qaytadi
node test/browser.mjs [a.xlsx b.xlsx]                 # haqiqiy brauzerda (bitta-fayl rejim); faylsiz — o'ylab topilgan smetada
node test/price-book.mjs                              # «Книга цен»: saqlash, qayta yuklash, jadval ko'rinishidagi narxlar ro'yxati
node test/price-typing.mjs                            # narxni raqamma-raqam yozish: ro'yxat qayta chizilsa ham katakda aynan yozilgani qoladi
sh test/all.sh [reyestr.xls smeta1.xlsx smeta2.xlsx]  # hamma test; faylsiz — sintetik smetalarda (test/synth.cjs). Yashil bo'lishi shart
sh server/release.sh X.Y.Z "izoh" --row matn.md [--dry]   # reliz bitta buyruq bilan: versiya, qurish, to'plam, ikki commit, push
node test/server-helper.mjs; sh test/release-script.sh    # test serveri yetim qolmaydi; reliz skripti vaqtinchalik nusxada
sh server/setup.sh && sh server/run.sh                # PocketBase (server rejimi), README «Server rejimi»
sh server/laptop.sh [autostart|status|backup|drive|restore|update|stop]   # noutbuk rejimi: bitta odam, baza shu diskda; zaxira ikki joyga
server\laptop.cmd [autostart|status|backup|restore|update|rollback|autoupdate|drive|stop|debug|doctor]   # xuddi shu, Windows'da (Node/Git kerak emas); restore — Mac zaxirasini ham tiklaydi
irm https://raw.githubusercontent.com/1maxstar1/Ayubkhon_A/HEAD/server/install-windows.ps1 | iex   # Windows: bitta qator bilan o'rnatish/yangilash
sh test/laptop-windows.sh                             # Windows ishga tushirgichi, pwsh ostida
sh test/laptop-backup.sh; node test/backup-prune.cjs  # Mac ishga tushirgichi: zaxira, ikkinchi joy, tiklash; qaysi nusxalar saqlanadi
sh test/laptop-faults.sh                              # Mac ishga tushirgichi nosozlikda: port band, oldingi jurnal, qulagan server qayta turadi
node test/update-channel.cjs                          # yangilanish kanali (pwsh siz): faqat 40 belgili xesh, ro'yxat uchun zaxira manzil, PocketBase sha256
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
  mumkin emas. Hujjatga kirmagan ustunni o'qiydigan formula (v2.16.7,
  `assemble.js` `inlineDead`): o'sha katakdagi son (yoki jadval ustunlaridan
  tuzilgan bir qadamli formula) formulaga yozib qo'yiladi va u tirik qoladi;
  bo'lmasa qiymat yoziladi va sahifa sanaydi — faqat hujjatda haqiqatan qotib
  qolgan (resurs qatorining miqdori/summasi emas, nol emas) qiymatlarni.
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
  tasdiqlamaydi; boshqa viloyat o'qilmaydi. **Tashish** (v2.16.16, egasining qarori 2026-11-18; `memory.js` `haul`/`haulRank`): «Перевозка …»
  qatori (birligi т·км, nomida masofa) nomi bo'yicha emas, **masofa oralig'i** bo'yicha topiladi — 1–10, 11–50, 51+ km
  (`HAUL_BANDS`); shu oraliqdagi har qanday «Перевозка» qatorining avvalgi tuzatilgan narxi taklif qilinadi: avval xuddi shu yuk
  («ГПС» = «Гравийно-песчаная смесь», «а-б» = «Асфальт…»), keyin boshqalari, har biri qaysi qator uchun qo'yilganini aytadi;
  boshqa oraliq taklif qilinmaydi; bu faqat «Перевозка» uchun (material, «Доставка», tonna birligi — avvalgidek nom bo'yicha).
  Dataset (`src/lib/ml/dataset.js`, v2.13.0): bitta savol — bitta
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
  tanlamaydi. Model egasi sonlarni ko'rib rozi bo'lmaguncha ish sahifasida ishlatilmaydi. «Принято» belgilari
  (`/api/memory/accepted`) faqat solishtirilgan resurslarga (`scope`) tegadi; tashqi «Было» fayli hech narsa yubormaydi.
  v2.16.1 dan oldingi ma'lumot (eski viloyatda qolgan jurnal/xotira, tasodifiy xotira raqamlari va ularga «mem:» havolalar)
  server ishga tushganda bir marta tuzatiladi (`learning.js` `repair`, admin: `POST /api/admin/learning/repair`).
* **Hajmlar va miqdorlar** (`src/lib/volumes.js`, `src/ui/volumes.js`, v2.15.0): ishlar 5-shakl vedomostidan
  (`01_ЛРВ`) o'qiladi; ekspertning qarori — `app.vol` (ish kaliti → loyiha hajmi, izoh) va `app.qtys` (resurs
  kaliti → jami miqdor va u qaysi smeta jamiga nisbatan yozilgani; obyekt chiqarilib jami o'zgarsa — yozilgan miqdor
  kutadi, kichikroq smetaga tushmaydi), ish maydonida saqlanadi. Yangi hajm resursni faqat bir birlikka × (yangi − eski) ga
  siljitadi. **Narxlar, tejash va Таблица №2 miqdorga tegmaydi** — miqdor faqat «Таблица №1 (объёмы)» varag'iga
  chiqadi, u esa faqat biror narsa belgilanganda qo'shiladi (aks holda hujjat avvalgidek). Holatda `qtys` — eski
  versiya o'qiydigan son, `qtyBase` — u qaysi smeta jamiga nisbatan yozilgani (v2.16.6; orqaga qaytish «[object Object]»
  bermaydi); kutayotgan miqdor jadvalda «⏸» bilan ko'rinadi; smeta miqdoriga teng va hech narsa siljitmagan miqdor
  Таблица №1 ga qator bo'lib tushmaydi.
* **Smeta formatlari** (`docs/format-reja.md`, v2.16.0): fayllarni **qoidalar** o'qiydi (`src/lib/smeta.js`); qoida
  o'zgarsa `SMETA_KIT=<kit> node test/smeta-corpus.cjs` qolgan fayllar avvalgidek o'qilishini isbotlashi shart (keyin
  ko'rib chiqib `--record`). Loyiha sifatida yuklangan har bir smeta `smeta_files` ga yoziladi (`src/ui/formats.js`):
  xesh, qanday o'qilgani, va **nom-narxsiz** format namunasi (`src/lib/ml/layout.js`; sxema o'zgarsa `VERSION`
  ko'tariladi); fayl o'zi faqat o'qilmagan yoki summalari mos kelmagan bo'lsa saqlanadi. Yozish hech qachon ishni
  to'xtatmaydi. Sahifa o'qigan faylning tavsifi o'sha o'qishning o'zidan olinadi (worker `describe: true` bilan ikkinchi
  xabar yuboradi — fayl ikki marta o'qilmaydi, o'qish kutmaydi); ochilmagan yoki o'quvchi to'xtatgan fayl tavsifsiz, darhol
  saqlanadi (v2.16.7). Egasining smetalari, namunalar, `golden.json` va vaznlar repoga tushmaydi. Model (keyingi qadamlar)
  qoidalar o'qigan faylga **tegmaydi**: faqat hech narsa o'qilmaganda taklif qiladi, o'qigani arifmetika bilan
  tekshiriladi va «проверьте» deb ko'rsatiladi.
  Eski Excel (.xls) fayllar (v2.16.3) SheetJS bilan o'qiladi (`src/lib/xlsx-read.js` `readOld`; SheetJS faqat fayllarni
  o'qiydigan worker'da) — natija .xlsx bilan bir xil shaklda; himoya testi (`smeta-corpus`) .xls ni ham o'qiydi.
  Fayl turi birinchi baytlaridan aniqlanadi (v2.16.13): «D0 CF 11 E0» — eski kitob, ichida tasodifan zip oxiri baytlari
  («PK 05 06») bo'lsa ham arxiv deb olinmaydi (5 ta .xls «нет описания книги» deb rad etilardi); «%PDF» — smeta emas, sahifa
  PDF javob qayerga yuklanishini aytadi. Shakli bo'yicha o'qilgan varaq (v2.16.13, `smeta-header` 34–35): ustunlarni
  raqamlaydigan qator («1 2 3 4 5 6», kamida to'rtta ketma-ket butun son) — sarlavhaning raqamlash qatori, hujjatda 321.xlsx
  dagidek moviy, bozor ustunlari «5 6» bilan (avval smeta qatori bo'lib tushardi); pul birligidagi, miqdori bor, narxi yo'q
  qator («ТРАНСПОРТНЫЕ РАСХОДЫ | СУМ | 5 | | …») — pul qatori, resurs emas; «ВОЗВРАТ …» bandi ostidagi qatorlar (buyurtmachiga
  qaytariladigan material) — resurs emas. «Ресурс» yig'ma varag'i bir necha qatori faqat unda tuzatilgan bo'lsa ham (qatorlar
  va summaning 90 % i obyektlar yig'indisiga teng), 16 tadan ko'p obyektli kitobda ham aniqlanadi.
  **«Наш ответ» PDF da** (v2.16.13, `src/lib/pdf-read.js`, `S.readPdf`/`S.readTable`): jadval Excel'dan yoki «Microsoft: Print
  To PDF» bilan chop etilgan PDF dan o'qiladi — har bir harf sahifadagi o'rniga qo'yiladi, qatorlar va ustunlar jadvalning o'z
  chiziqlaridan (ingichka to'rtburchak yoki chiziq), birlashtirilgan katak matni yuqori-chap katakda, katak ichida defisdan
  keyin bo'lingan so'z («ПМ-» / «100А») qayta qo'shiladi; bo'sh joy belgilari matnga olinmaydi — so'z chegarasi harflar
  orasidagi masofadan (v2.16.14: Excel sonni o'ngga surgan bo'sh joylar raqam ichiga tushardi, «1 21 744,00»). Natija `S.readXlsx` bilan bir xil shaklda, shuning uchun
  `reply.parse` o'zgarmagan; «Сравнение версий» («Наш ответ (Excel/PDF)») va «Книга цен» ikkalasi o'qiydi; server ish
  maydoni PDF ni ham saqlaydi (`pb_schema.json` workspaces.files: `application/pdf`). Skan (rasm), parolli PDF va belgilar
  jadvali yo'q shrift — aniq xabar bilan rad etiladi; rasmdan matn taxmin qilinmaydi. Testlar faqat test o'zi yasagan PDF da. Tashish varag'i («перевозка», `transportSheet`) xatolari
  (`haulChecks`): tonnadagi material uchun solishtirma og'irlik 1 emas; «ВСЕГО» qatorlar yig'indisiga teng emas (qator
  tushib qolgan) — sahifa ogohlantiradi, smetaning o'zi o'zgartirilmaydi. Ikki qavatli «Сметная стоимость» sarlavhasi
  («в базисном» — «--», «в текущем» — «на ед. / общая» bir qator pastda) joriy narxdan o'qiladi; kod ustunidagi «ИТОГО …»
  jami hisoblanadi; nomi kod ustunida turgan qator («ПЕРЕВОЗКА … ТН/КМ») resurs bo'ladi (v2.16.4, `smeta-header` 19).
  «Наш ответ» bitta jadval butun ariza uchun — u arizaning barcha smetalari bilan solishtiriladi. Raqam ustunidagi
  «Перевозка материалов» bandi ostidagi qatorlar — «other» (mashinalar emas); miqdori bo'sh, summasi 0 bo'lgan т·км qatori
  ham o'qiladi (miqdor 0) — varaqdagi hech narsa ko'rinmay qolmaydi; «(наименование стройки)» izohi — ustidagi qator nomi
  (v2.16.5). «Стало» ga bir nechta tuzatilgan fayl birga beriladi (ariza smetalari): har biri o'z smetasiga umumiy qatorlari
  bo'yicha juftlanadi (`S.compare.join`), bir xil nomli varaqlar («РЕСУРС») hech qachon almashmaydi; ish maydonida
  `new`, `new1` … slotlarida saqlanadi (40 tagacha; arizada 80 tagacha fayl — `pb_schema.json` workspaces.files va
  `sync.js` `MAX_FILES` birga o'zgaradi). т·км ustuni yo'q tashish varag'i: т·км = tonna × km (ikki qatorli sarlavha),
  hujjatga qiymat bo'lib yoziladi. ИТОГО tekshiruvi: pul qatori («3% от стоимости материалов») ИТОГО ichida ham, tashqarisida ham
  bo'lishi mumkin — ikkalasi xato emas (egasining tuzatilgan faylida shunday qoldirilgan, 2026-11-16); faqat material qatori tushib
  qolsa yoki ИТОГО hech biriga teng bo'lmasa aytiladi. «ОБЩИЙ ИТОГ» o'chirilgani — xato emas, oddiy xabar (qizil emas).
  Kod ustuni bor varaqda raqamsiz qator ham resurs, agar resursdek narxlangan bo'lsa (birlik pul emas, kol-vo × narx = summa,
  yig'ma qator nomi emas — «В Т.Ч. …», «ЗАТРАТЫ ТРУДА …», «ИТОГО/ВСЕГО»): smeta tuzuvchi band oxiriga qo'lda qo'shgan qatorlar
  (2026-11-17, `smeta-header` 21).
  Bu qoidada pul birligi faqat «СУМ» emas: «сўм», «тыс.сум», «1000 сум», «so'm», «руб», «UZS» ham (`smeta.js` `MONEY`) —
  shunday birlikdagi raqamsiz qator («ТРАНСПОРТНЫЕ РАСХОДЫ | сўм | 0,03 | …») kol-vo × narx = summa bo'lsa ham resurs emas,
  pul qatori (v2.16.12, `smeta-header` 31); «у.е.» pul emas — u sanoq birligi ham bo'ladi; «Сметная потребность» vedomosti
  va kod ustunisiz varaqlar avvalgidek.
  «ЛОКАЛЬНО-РЕСУРСНАЯ ВЕДОМОСТЬ» (har ish ostida o'z resurslari):
  «Количество» ikki ustun («на единицу измерения» / «по проектным данным») — miqdor loyihaviy ustundan; birlikka miqdori yo'q
  ish qatori (shifr, «1000 М3») resurs emas — uning summasi ostidagi resurslar yig'indisi (`smeta-header` 22).
  Shu vedomostda birlikka miqdori yo'q (bo'sh, «-» yoki so'z) qator ham resurs, agar uchta shart birga bajarilsa: raqami
  ustidagi ishning raqami ostida («1» ishi ostida «1.4» — loyiha bo'yicha olingan, normasi yozilmagan material); resursdek
  narxlangan (birlik pul yoki «%» emas, «В Т.Ч. …» emas, kol-vo × narx = summa); ostida o'z raqamli qatorlari yo'q («1.1»
  dan keyin «1.1.1» kelsa, «1.1» o'zi ish). Raqam hech narsa demasa (raqamsiz qator, o'z raqamli qator, «1.1» ishidan
  keyingi «1.2») — avvalgidek birlikka miqdor hal qiladi: yo'q bo'lsa — ish (v2.16.12, 26). «Количество» ning ikki ustuni
  sarlavha qatorining o'zida «Цена» va «Сумма» yozilgan bo'lsa ham topiladi: ostidagi qator sarlavhaning ikkinchi qatori,
  «1 2 3 …» undan pastda, miqdor norma ustunidan o'qilmaydi (27).
  «N п/п» —
  raqam ustuni, kod ustuni oraliqda tursa ham: bandlar shu ustunda ko'rinadi (25). «Расчёт стоимости перевозки» varag'i:
  т·км = потребность × вес × км, narx «на тн/км», summa «Общая цена» (23); yonida «Стоимость мат-ов без перевозки» ustuni
  bor varaq o'qilmaydi — u tashishni material narxiga qo'shadi, resurs varag'i esa o'sha narxni allaqachon olgan (24).
  Bunday varaqni sarlavha so'zidan tashqari arifmetika ham ushlaydi: «потребность × вес × км» varag'ida summasi bor
  qatorlarning birortasida ham «Общая цена» т·км × «на тн/км» ga teng bo'lmasa (material narxi + tashish) — varaq
  o'qilmaydi; bitta qatordagi xato yoki bo'sh summa — smeta tuzuvchining xatosi, varaq avvalgidek o'qiladi va xato ko'rinib
  turadi (v2.16.12, 29). Tashish varag'ida summa ustuni — o'ngdagi «Всего», undan chapdagi «Сумма …» / «Итого» / «Всего»
  emas; faqat «Общая цена» yonidagi «Всего» (bir birlik narxi) summa emas (28). Masofa ustuni — «… км» yoki yolg'iz «Расст»
  / «расс-т» / «Расст-е»; «Расст-е на перев-у» (temir yo'l masofasi) qayerda tursa ham avtomobil km i emas (30).
  Narxi nomidagi foizga teng ulush qatori («Перевозка материалов - 5 % от стоимости» | 0,05) — birligi qanday yozilganidan
  qat'i nazar («тн/км», «тн-км») pul qatori, resurs emas (v2.16.12, `smeta-header` 32). Bir kitobda boshqa obyekt varaqlarini
  qo'shib chiqadigan ochiq yig'ma varaq («Ресурс»: har qatori bir xil obyektlar to'plamidagi miqdorlar yig'indisi) o'qilmaydi
  va sahifa aytadi — u bilan resurslar ikki marta sanalardi; o'z miqdorlari bor obyekt hech qachon shunday hisoblanmaydi (33).
  Javob jadvalida «МАШ-ЧАС»/«ЧЕЛ-ЧАС» = «маш.-ч»/«чел.-ч» (`reply.js` `unitOf`, `match.js` ga tegmaydi); «%» qatori resurs
  emas;
  boshqacha yozilgan nom faqat smeta narxi teng bo'lsa topiladi: jadvalning o'z narx ustuni bilan — o'xshashlik ≥ 0,9, faqat
  «Цены по ПСД» bilan — ≥ 0,8 (v2.16.12). Xuddi shunday yaqin boshqa nom bo'lsa (0,9 dan pastda — umuman boshqa nom bo'lsa)
  hech biriga qo'yilmaydi, «не найдено» bo'ladi; bitta nomning yaxlitlashda farq qiladigan ikki narxi — bitta resurs, narx
  ikkalasiga tushadi. «ПСД» li sarlavha faqat narx so'zi bilan («Цены по ПСД», «Стоимость по ПСД») yoki yolg'iz («ПСД», «По
  ПСД» — ikki qatorli sarlavhaning pastki qatori) bo'lsa «Цены по ПСД» ustuni: «Наименование … по ПСД» — nom, «Ед.изм. по
  ПСД» — birlik, «Кол-во по ПСД» — narx emas. Jadvaldagi tashish qatori varaqdagidek nomlangan bo'lsa («Асфальт - 11 км»),
  o'quvchi «Перевозка …» deb atagan qatorga bog'lanadi; shu nomli, boshqa birlikdagi material — material (v2.16.12).
  «Наш ответ» da narxsiz, faqat izohli qator («-», «обоснов» yoki bo'sh narx + izoh; izohsiz yolg'iz chiziqcha — «-», «—»
  yoki minus belgisi — ham, agar qatorda birlik bo'lsa) — so'ralgan, narxsiz qator (`market: null`): narx qo'ymaydi,
  «Сравнение версий» uni so'ralgan deb baholaydi; raqamli, lekin son emas
  narx («7 500 сум») avvalgidek «цена не прочитана».
  Boshqa smetalarni qatorma-qator takrorlaydigan fayl («ОБЩИЙ ИТОГ», `S.copiesOf`) yuklanganda o'chiriladi va aytiladi —
  ресурс ikki marta sanalmaydi; solishtirish va «Наш ответ» o'chirilgan loyihaga qaramaydi. «Наш ответ» ning «объем»
  varag'i boshqa obyektni nomlasa (sarlavhadagi «по объекту:» yoki «ТАБЛИЦА №2» ostidagi qator narx varag'inikidan farq
  qiladi) va qatorlarining yarmidan ko'pi smetada yo'q bo'lsa — u o'qilmaydi, faqat narxlar olinadi va sahifa aytadi
  (egasining qarori, 2026-11-15: ekspert eski javobni shablon qilib, «объем» varag'ini o'chirmay qoldiradi).
* Raqamlar hech qachon yo'qolmaydi: `АНКЕР М5` ≠ `АНКЕР М8`, `4.1.1` ≠ `4.11`;
  ikki raqam orasidagi ajratgich o'chirilmaydi.
* **Narx katagiga yozish** (v2.16.15, `src/ui/grid.js` `VList.paint`, `test/price-typing.mjs`): har raqam narxni qo'yadi va
  ro'yxat qayta chiziladi. Yozilayotgan katak (`data-set` — yozish qo'ygan narx yoki «bad») ro'yxat shu narxni ko'rsatar ekan,
  matni va kursori bilan aynan qoladi; uni eski katak olib tashlanishidan oldin o'qiladi (olib tashlash focusout chaqiradi).
  Avval katak guruhlangan raqamlar bilan qayta yozilib («2071» → «2 071»), kursor bir joyga siljib qolardi: «207187» → «207 871».
  Narxni yozishdan boshqa narsa qo'ysa (Esc, «Применить», kitob) `App.setPrice`/`setPrices` `data-set` ni o'chiradi va
  katak yangi narxni ko'rsatadi.
* **Ekranda yo'q smetalar** (v2.16.12, `src/ui/sync.js` `away`, `test/away-files.mjs`). Ariza ochilganda saqlangan holatdagi
  smetaning fayli serverda turgan, lekin ekranga chiqmagan bo'lishi mumkin: yuklab bo'lmagan (aloqa, 404) yoki o'qilmagan
  (vaqt chegarasi, qoida endi varaq topmaydi). Bunday smeta «away»: saqlash uning faylini serverdan o'chirmaydi, loyihasini
  esa holatda o'z joyida (tartibi bilan) qoldiradi. Har bir fayl alohida olinadi — bitta olinmagan fayl qolganlarini
  yashirmaydi. Loyihalar ro'yxati ustidagi qator har bir shunday smetani sababi bilan nomlaydi, belgi «✓» emas, «!» bo'ladi.
  «Скачать Excel» va «✓ Завершить» avval so'raydi. Faylni arizadan faqat odamning o'zi chiqaradi («Убрать из заявки»). Xuddi
  shu nomli fayl qayta qo'shilsa, eskisining o'rnini oladi; eski fayl yangisiga ishora qiluvchi holat bilan birga, keyingi
  saqlashda o'chiriladi (undan oldin emas). Sahifa fayllar yuklanayotganda ketishga so'ralsa (beforeunload), shu paytdagi
  xato hisobga olinmaydi; sahifa 2 soniyadan keyin ham o'rnida bo'lsa — shu paytda uzilgan fayllar qayta olinadi; faqat
  pagehide yakuniy.
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
