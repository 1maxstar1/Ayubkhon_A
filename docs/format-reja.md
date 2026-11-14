# Smeta formatlarini tanishni o'rganish — ish rejasi

Holati: **1- va 2-qadam bajarildi (v2.16.0): himoya testi va ma'lumot yig'ish.** 3-qadam (o'qitish) va 4-qadam
(AI o'qishi) — navbatda. Egasining qarori (2026-11-14): hozir fayllarni **qoidalar** o'qiydi; o'qilmagan faylni egasi
dasturchiga yuboradi va qoida qo'shiladi; shu bilan birga dastur har bir fayldan format ma'lumotini yig'ib boradi;
fayllar soni 100 ga yetganda model o'qitila boshlaydi va qoidalar o'qiy olmagan fayllarni AI taniydi.

## Nega to'liq «AI o'qiydi» emas

Smetadagi bitta son jimgina noto'g'ri o'qilsa, rasmiy hujjatga noto'g'ri narx tushadi. Shuning uchun:

* **qoidalar doim birinchi** — ular sinalgan, va hozir o'qilayotgan fayl keyin ham aynan shunday o'qiladi;
* model faqat qoidalar **hech narsa o'qimagan** faylda ishlaydi;
* model o'qigani **arifmetika bilan tekshiriladi** (kol-vo × narx = summa) va ekranda «проверьте» deb ko'rsatiladi.

## To'rt qadam

| # | Nima | Holati |
|---|---|---|
| 1 | **Himoya testi** `test/smeta-corpus.cjs`: egasi yuborgan barcha smetalar (`$SMETA_KIT/files`, maxfiy) qayta o'qiladi va yozib qo'yilgan natija (`golden.json`) bilan solishtiriladi. Qoida o'zgarganda qolgan fayllar avvalgidek o'qilishini isbotlaydi. | bajarildi |
| 2 | **Yig'ish**: loyiha sifatida yuklangan har bir smeta `smeta_files` kolleksiyasiga yoziladi — o'qilgani ham, o'qilmagani ham. Admin → «Обучение» → «Распознавание форматов смет». | bajarildi (v2.16.0) |
| 3 | **O'qitish** (≥ 100 o'qilgan fayl): sarlavha qatori va ustun vazifalari modeli (`src/lib/ml/layout-model.js`, logistik regressiya), Web Worker'da; o'lchov — «formatni chetda qoldirib» (bir imzoli fayllar birga test qismiga tushadi); vaznlar serverda (`ml_models`), repoda emas; chetda qoldirilgan formatlarning ≥ 95 % i qoidalar bilan aynan bir xil o'qilsa — model o'zi yoqiladi; admin'da o'chirish mumkin. | navbatda |
| 4 | **AI o'qishi**: qoidalar hech narsa o'qimagan faylda model joylashuv taklif qiladi → o'sha `parseRange` o'qiydi → arifmetika (≥ 95 %) → «Прочитано распознаванием (AI) — проверьте», «Верно / Неверно». «Верно» — keyingi o'qitish uchun belgi. | navbatda |

Keyinroq (hozir emas): «Разметка листа» — hech kim o'qiy olmagan faylda ustunlarni qo'lda ko'rsatish oynasi.

## 2-qadam: nima yoziladi

Bitta yozuv (`smeta_files`) — bitta fayl:

* `hash` — fayl baytlarining SHA-256 i (yagona; takror yuklangan fayl ikki marta yozilmaydi). Worker'da hisoblanadi —
  `crypto.subtle` oddiy http manzilda yo'q, shuning uchun o'z kodimiz (`S.ml.layout.sha256`).
* `name`, `size`, `ws` (qaysi ish maydonida), `by` (kim yuklagan — server o'zi qo'yadi), `app_version`.
* `is_read`, `reason` (`no-sheets` yoki `error: …`), `objects`, `items`.
* `checked`, `score` — uchala soni bor qatorlar va ulardan kol-vo × narx = summa bo'lganlari ulushi.
* `signature` — format imzosi: sarlavha qatorlari (belgilar bilan) va ustunlar o'rni. Bir formatdagi fayllar bir xil
  imzo oladi (nechta ko'cha yoki varaq bo'lishidan qat'i nazar).
* `sample`, `version` — **format namunasi** (pastda). Sxema o'zgarsa `VERSION` ko'tariladi va fayl qayta kelganda
  yozuv yangilanadi.
* `file` — **faylning o'zi, faqat o'qilmagan yoki summalari mos kelmagan (< 90 %) bo'lsa**: egasi uni admin sahifasidan
  yuklab olib dasturchiga yuboradi; qoida qo'shilgach «Проверить снова».

### Namuna — nom va narxsiz

Har bir ko'rinadigan varaqning (ko'pi bilan 12 ta, avval qoidalar o'qiganlari) yuqori 600 × 30 katagi; har bir katak —
**bitta belgi**: bo'sh, butun son yoki kasr (xonalar soni bo'yicha — qiymati emas), formula natijasi, qisqa/uzun matn,
harfsiz matn, o'lchov birligi, yoki sarlavha so'zi (№, наименование, ед. изм., кол-во, цена, сумма, шифр, итого,
раздел, bo'lim so'zlari, примечание, сум). To'liq jadval — `src/lib/ml/layout.js` boshida.

Yana: har bir varaqda qaysi ustunlar uchligi a × b = c ni beradi (necha qatorda) — kol-vo × narx = summa izini
ustun nomlaridan qat'i nazar ko'rsatadi; va **belgilar** (qoidalar o'qigan varaqda): bloklar, har birining
joylashuvi (`no, name, unit, qty, price, sum, code, headerRow, subRow, numRow`) va har bir qatorning turi
(resurs, bo'lim, jami, sarlavha, raqamlash, boshqa).

Varaq nomi, fayl nomi (namunaning ichida), resurs nomlari, narxlar va summalar namunada **yo'q** —
`test/ml-layout.cjs` va `test/e2e-formats.mjs` buni tekshiradi.

### Ishga xalaqit bermaydi

Yozuv fayl o'qilgandan keyin, fonda, bittadan yuboriladi; xato — faqat konsolga bir qator. Brauzer yuborgan
xeshlarini eslab qoladi (`localStorage`), shuning uchun ish maydoni qayta ochilganda serverga so'rov ketmaydi.
Server tozalangan bo'lsa (admin «Стереть») brauzer buni sezadi va qayta yuboradi. Bitta-fayl sahifada
(`smeta-taqqoslash.html`) hech narsa yig'ilmaydi — unda server yo'q.

## Maxfiylik

* Egasining smetalari, ularning nomlari, namunalar, `golden.json`, o'qitilgan vaznlar — **repoda emas**
  (`test/refs-privacy.cjs` `smeta_files…`, `layout-sample…`, `golden…` nomli fayllarni ham ushlaydi).
* Testlar faqat o'ylab topilgan varaqlarda (`test/compare-books.cjs`, `test/synth.cjs`).
* Admin sahifasi faqat sonlarni ko'rsatadi; «Скопировать числа» — nom va narxsiz.
* Smeta mazmuni tashqi xizmatga yuborilmaydi.

## Dasturchi uchun: o'qilmagan fayl kelganda

1. Faylni `$SMETA_KIT/files/` ga qo'ying (maxfiy papka), `SMETA_KIT=<kit> node test/smeta-corpus.cjs` — ro'yxatda
   `NONE` bo'lib chiqadi.
2. `src/lib/smeta.js` ga qoida qo'shing; o'ylab topilgan varaq bilan `test/smeta-header.cjs` ga test yozing.
3. `SMETA_KIT=<kit> node test/smeta-corpus.cjs` — qolgan fayllar `CHANGED` bo'lmasligi shart; yangi fayl endi o'qiladi.
   Ko'rib chiqib, `--record`.
4. Reliz; egasi yangilagach admin sahifasida «Проверить все снова» ni bosadi — saqlangan fayllar yangi qoidalar bilan
   qayta o'qiladi, o'qilgani namuna va belgilarini oladi.

## Egasi uchun

* Odatdagidek ishlang — hech narsa bosish kerak emas, ma'lumot o'zi yig'iladi.
* Dastur o'qimagan fayl: admin → «Обучение» → «Распознавание форматов смет» → «Скачать» → dasturchiga yuboring.
* O'sha yerda: nechta fayl yig'ilgani va «До обучения модели: N из 100 файлов».
