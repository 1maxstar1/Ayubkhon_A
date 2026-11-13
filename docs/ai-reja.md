# O'zi o'rganadigan takliflar — ish rejasi (AI ranker)

Holati: **0–3-bosqichlar bajarildi; egasining qarori bilan (2026-11-13) yo'nalish o'zgardi — «Модель цен»
(narx modeli), 1-qadami v2.14.0 da.** Relizlar v2.11.0 – v2.14.0 ro'yxatsiz (egasi sinagach `--list`). Egasi hozir
eski ishlarini kiritmoqda (~50 ariza: smeta + «Наш ответ (Excel)» + «✓ Завершить»); tugatgach «done» deydi va admin
sahifasidagi sonlarni yuboradi. **Keyingi qadam (v2.15.0, 2-qadam):** modelni saqlash (`ml_models` kolleksiyasi),
ish sahifasida «вероятно завышено → предлагаемая цена X» va «Применить все предложения» — faqat egasi 1-qadam
sonlarini ko'rib rozi bo'lgach yoqiladi (darvoza 2).

**Keyingi sessiya uchun — qayerdan davom etiladi:** egasi §7 dagi sonlarni yuborgach, ularga qarab 4-bosqich
(`src/lib/ml/{logreg,mlp,calib}.js`, tajribalar jadvali) boshlanadi. Sonlar kelmaguncha model kodi yozilmaydi:
qaysi model kerakligi (yoki umuman kerak emasligi) savollar soniga va `p3` ning hozirgi aniqligiga bog'liq.

**v2.13.1 — eski arizalar bilan to'ldirish (egasining taklifi, 2026-11-13):** ilgari ishlangan ariza smetasi va
o'shanda yuborilgan javob fayli («Сравнение версий» → «Наш ответ (Excel)») yuklanib, «✓ Завершить» bosiladi — narxlar
xotiraga yoziladi. Shu uchun narxning sanasi endi **arizaning o'z sanasi** (`asof` — ro'yxatga olingan sana yoki
tanlangan sana; yakunlangan kundan keyin bo'lsa — yakunlangan kun; `S.memory.dateOf`): xotirada yosh shundan
hisoblanadi, datasetda arizalar shu sana bo'yicha tartiblanadi (test qismi — haqiqatan eng yangi arizalar). Avval
yakunlangan kun olinardi va bugun kiritilgan bir yillik narx «yangi» bo'lib ko'rinardi. Namuna juftlikda (541
resurs, javobda 103 qator) javobning barcha qatorlari smetada topildi, 102 narx qo'yildi.

**«Модель цен» — egasining javoblari (2026-11-13) va 1-qadam (v2.14.0).** Javoblar: (1) model yangi smetada
qimmat narxni belgilab, o'z taxminini ko'rsatsin, narx faqat «Применить» bilan; (2) javobda yo'q resurs — «ko'rib
chiqilgan, qimmat emas» (eski ishlarda hammasi ko'rilgan); (3) «Применить все предложения» kerak.

- `src/lib/ml/pricedata.js` — bitta resurs haqida **smeta narxiga qaramasdan** ma'lum bo'lgan dalillar (31 belgi,
  o'z sxema xeshi): shu viloyatdagi **oldingi** arizalarda ekspert qo'ygan narxlar (keyingi arizadan, arizaning
  o'zidan, boshqa viloyatdan, «Применить %» dan, 24 oydan eskisidan o'qilmaydi), ilgari qabul qilingan smeta narxlari
  (pastki chegara), spravochnikning birinchi qatori (darajasi, bayroqlari). **Tayanch** — birinchisi mavjud bo'lgani:
  o'z oldingi narxi → spravochnik qatori → qabul qilingan eng baland narx; qolgan sonlar tayanchga nisbatan log-nisbat.
  Dalil yo'q bo'lsa — taklif ham yo'q.
- `src/lib/ml/pricemodel.js` — chiziqli model: taklif = tayanch × o'rganilgan tuzatish. Yo'qotish: o'zgartirilgan
  narx — log-xatoning kvadrati; qoldirilgan narx — bir tomonlama (faqat taklif smeta narxidan **past** bo'lsa
  jarima: bozor narxi kamida shuncha), og'irligi 0,3; ridge — dalil bo'lmasa tayanch o'zgarmaydi. Oddiy gradient
  tushish, noldan, tasodifsiz (bir xil ma'lumot — bir xil model); to'xtash va chegara (`tau`: smeta narxi taklifdan
  necha foiz baland bo'lsa belgilanadi) o'quv qismining eng yangi beshdan birida tanlanadi (F0,5 — gapirganda to'g'ri
  bo'lish ikki barobar muhim). Test qismi hech narsani tanlamaydi.
- Tajribalar jadvali, bir xil test qismida uch usul: `ref` (spravochnikning birinchi qatori), `anchor` (tayanch),
  `model` (tayanch + tuzatish). Tanlash qoidasi: eng yaxshisidan bir punkt ichidagilarning eng soddasi. O'lchovlar:
  belgilanganlarning nechtasini ekspert haqiqatan pasaytirgan (precision), u pasaytirganlarning nechtasi belgilangan
  (recall), qabul qilingan narxlarning nechtasi behuda belgilangan, taklif narxining ekspert narxidan median farqi —
  ishonch oralig'i bilan; tayanch turi bo'yicha alohida.
- Worker `replay` ikkala datasetni bitta o'tishda quradi (har savol dvigateldan bir marta so'raladi). Admin →
  «Обучение» → «Собрать и измерить» modelni ham o'qitadi va o'lchaydi; kalitlari `price.*`. **Model hozircha
  hech qayerda ishlatilmaydi** — ish sahifasi o'zgarmagan.
- Testlar: `test/ml-price.cjs` (yo'qotish va gradient qo'lda va chekli ayirmalar bilan; qoldirilgan narx faqat
  yuqoriga itaradi; boshqa sxemadagi model qaror bermaydi; sintetik ekspert — `priceWorld`, yashirin qoida
  «spravochnik qatorining 0,9 i» topiladi), `test/e2e-dataset.mjs`.
- Egasining ikki fayli bilan tekshirildi (maxfiy, repodan tashqarida, faqat sonlar): smeta 541 resurs → javob 103
  qator, 102 narx → «Завершить» 514 xotira qatori (101 pasaytirilgan, 412 qabul, 1 o'chirilgan; 27 ta nol narxli
  resurs yozilmaydi). 50 arizali bazada (50 × 514 qator): yangi smeta ochilishi va ro'yxat sekinlashmadi (eng uzun
  qotish 0,15 s), admin o'lchovi ~95 s (fon oqimida).

**Ochiq savollar (model uchun):** boshqa viloyatdagi oldingi narx dalil bo'lsinmi (hozir yo'q; `price.skipped.
noevidence_price_other_region` nechta holatda yordam berishini sanaydi); faqat «qabul qilingan narx»ga tayangan
taklif ko'rsatilsinmi (`price.model.by_acc` alohida o'lchaydi).

**Egasining ekran yozuvi (2026-11-13) — xulosa va keyingi qadam.** Egasi ~50 va undan ko'p eski arizani (smeta +
o'shanda yuborilgan javob fayli, «✓ Завершить») kiritmoqchi va model **«Рыночная цена» ustunidagi har bir qiymatdan**
o'rganishini xohlaydi. Namuna juftlikda o'zgartirilgan narxlarning ko'pi spravochnik qatoridan 2 % dan uzoq yoki
qatori yo'q — demak faqat spravochnik qatorlarini qayta tartiblaydigan model bu ma'lumotdan kam o'rganadi. Taklif
qilingan yo'nalish (egasining javobi kutilmoqda, §6 oxiri): model har bir resurs uchun **bozor narxini taxmin
qiladi** (spravochnik, xotira, o'xshash nomlar, UZEX — belgi sifatida; smeta narxini ko'rmaydi), dastur esa smeta
narxini shu taxmin bilan solishtirib «qimmat — taklif: X» deb belgilaydi. Shunda smeta narxi tartiblash belgisi
bo'lmaydi (qoida saqlanadi), ma'lumot esa har bir resursdan foydalanadi: o'zgartirilgani — aniq narx, qoldirilgani —
«smeta narxi qimmat emas» (pastki chegara). Hisobotdagi «bitta qator yo'qoldi» tekshirildi: yo'qolmagan — javob
faylida bitta mashina ikki marta yozilgan (birida lotincha «K»), ikkalasi bitta resursga tushgan. v2.13.2: «Сравнение
версий» tuzatilgan smetasiz ham javob qo'llanganini, topilmagan qatorlarni va takrorlarni aytadi.

**3-bosqichda aslida nima qilindi:**

- `src/lib/ml/features.js` — bitta taklif qatorining 62 ta belgisi (sxema xeshi bilan): moslik darajasi va usuli,
  viloyat, narx yoshi, asos, bayroqlar, qator ortidagi yozuvlar, **shu savolning boshqa qatorlari orasidagi o'rni**
  (faqat ularning narxlari bo'yicha) va ekrandagi o'rni. Smeta narxi o'qilmaydi — savolning o'zida u yo'q; test
  buni ikki xil smeta narxida bir xil belgilar chiqishi bilan tekshiradi. Ekrandagi o'rin faqat o'qitish uchun:
  modeldan so'ralganda har bir qator «birinchi o'rinda» deb beriladi (`neutral`).
- `src/lib/ml/metrics.js` — Precision@1, Recall@3, MRR, «hech biri to'g'ri emas» savollarida sukut aniqligi,
  ishonch xatosi (ECE), narxning median nisbiy xatosi, bootstrap ishonch oralig'i (urug'li generator — har safar
  bir xil). O'lchanadigan narsa bo'lmasa — `null`, 0 emas.
- `src/lib/ml/dataset.js` — har bir yakunlangan narx o'z arizasi sanasida spravochnikdan qayta so'raladi
  (`gather(q)` — darvozadan o'tgan barcha nomzodlar; `choose` — bugungi tartib) va ekspert qaroriga qarab
  belgilanadi:
  | Tur | Qachon | Belgilar |
  |---|---|---|
  | `ref` | narx spravochnikdan «Применить» bilan olingan | o'sha qator 1, qolganlari 0; «медиана N строк» olingan bo'lsa — uning har bir qatori 0,5 |
  | `near` | narx qo'lda yozilgan (yoki boshqa manbadan) va biror qatordan 2 % ichida | o'sha qator 0,5, qolganlari 0; savol og'irligi 0,5 |
  | `none` | narx qo'lda yozilgan, hech bir qator yaqin emas | «hech biri to'g'ri emas» — model sukut qilishni o'rganadi |
  | `left` | smeta narxi qoldirilgan, lekin undan past qator bor edi | past qatorlar 0, qolganlari baholanmaydi (−1); og'irlik: «проверено» 1, shunchaki qoldirilgan 0,5 |
  | tashlab ketiladi | `above` (qoldirilgan, barcha qatorlar smeta narxidan yuqori yoki 2 % ichida), `pct` («Применить %»), `zeroed`, `empty` (spravochnikda qator yo'q), `lost` (qo'llangan yozuv bugungi paketda yo'q) | sanaladi, o'qitilmaydi |
- Bo'lish: arizalar bo'yicha va vaqt bo'yicha — eng yangi beshdan biri **test qismi**, unda hech narsa
  o'qitilmaydi (2–7 arizada bitta, 8–12 da ikkita; bitta arizada test qismi yo'q). Qo'lda belgilangan
  «проверочный список» alohida turadi. Nom «ko'rilgan» — o'quv qismidagi ariza ham shu nomni so'ragan bo'lsa.
- `p3` o'lchovi (tajribalar jadvalining 1-qatori): bugungi tartib o'sha savollarda. `p3` hech qachon sukut
  qilmaydi va o'z ishonchini aytmaydi — ishonchi sifatida «shu darajadagi birinchi qator o'quv qismida necha marta
  to'g'ri chiqqan» olinadi. Ekranda «медиана» qatori ichiga yig'ilgan hujjatlar undan keyingi o'rinlarda sanaladi.
- `evaluate(ds, score)` — istalgan boshqa tartib xuddi shu savollarda, xuddi shu metrikalar bilan (4-bosqich
  shundan foydalanadi). Daraja tartibi shu yerda ham saqlanadi: baho qanday bo'lmasin, «Похожий» / «Оценка» qatori
  «Документ» / «Ставка по таблице» dan yuqoriga chiqmaydi; baho faqat darvozadan o'tgan qatorlarni tartiblaydi.
- Worker: `src/refs-worker.js` ga `replay` va `dataset` buyruqlari (dvigatel faqat o'qiladi; `src/lib/refs/**`
  ga tegilmagan — o'lchov muhri o'zgarmadi). Admin: «Обучение» → «Набор для обучения» (`src/ui/dataset-admin.js`):
  «Собрать и измерить», «Скопировать числа», «Сохранить набор в файл», «Проверочный список…». Hisob shu brauzerda;
  serverga hech narsa yozilmaydi (test so'rovlarni sanaydi).
- Sintetik dunyo (`test/ml-synth.cjs`): o'ylab topilgan paket va **yashirin afzalligi bor soxta ekspert** (o'z
  viloyati, eng yangi narx, «declared» ga ishonmaydi; 5 % shovqin). `test/ml.cjs` tekshiradi: metrikalar qo'lda
  hisoblangan misollarga teng; belgilar chegarada; har bir tur to'g'ri belgilanadi; dataset qurilgach dvigatel
  javoblari **bayt-bayt** o'zgarmaydi; yashirin afzallik bo'yicha tartib `p3` dan ancha aniq, teskarisi — ancha
  yomon. `test/e2e-dataset.mjs` — xuddi shu sonlar haqiqiy brauzerda, admin sahifasida.

**3-bosqichda ishlatilgan qiymatlar (egasi o'zgartirishi mumkin):** yaqinlik chegarasi 2 % (brifdan); `left`
turi — brifda aniq yozilmagan holat (qoldirilgan, lekin pastroq qator bor edi): «hech biri olinmadi» deb, yarim
og'irlik bilan hisoblanadi; boshqa manbadan (xotira, UZEX, «Прежние проекты») olingan narx — qo'lda yozilgan
kabi; ekrandagi o'rin jurnaldan emas, qayta hisoblangan bugungi tartibdan olinadi (jurnal faqat v2.11.0 dan beri
bor, tartib esa aniq qayta tiklanadi).

**3-bosqichda qilinmagan / o'lchanmagan:** haqiqiy ma'lumotda hech narsa — sonlar egasidan kutiladi; jurnal
(`suggest_events`) bilan solishtirish (ekspert oynani ochganmi, aynan nima ko'rgan) — 4-bosqichda kerak bo'lsa;
katta bazada (minglab yakunlangan narx) hisob vaqti — sintetikada 450 savol 1 soniyadan kam.

**2-bosqichda aslida nima qilindi:**

- `src/lib/memory.js` (sof mantiq, `test/memory.cjs`): bitta resursning xotira qatorlaridan — taklif qilinadigan
  narxlar va chegara.
  - **Narx takliflari** — faqat tuzatilgan narxlar: 1) shu kontragent, 2) boshqa kontragent; har birida avval
    pudratchi qabul qilgani, keyin eng yangisi. Hech qachon taklif qilinmaydi: «Применить %» narxi, 0 narx, 24 oydan
    eski narx. Bitta arizadan bitta qator.
  - **Chegara** («shu narxgacha qabul qilingan») — faqat tegilmagan narxlardan, va faqat **mustaqil arizalar**
    (turli kontragentlar) kelishsa: har biri og'irlik bilan sanaladi — «проверено» 1, shunchaki qoldirilgan 0,5; yoshi
    6 oygacha to'liq, keyin 12 oyda nolga tushadi. Chegara — kamida ikki mustaqil ariza (kamida bittasi boshqa
    kontragent) shu yoki undan yuqori narxni qabul qilgan eng baland narx, og'irliklar yig'indisi ≥ 1,5 (ikkita
    «проверено»; bitta «проверено» + bitta qoldirilgan; uchta qoldirilgan). Kontragentning o'z narxi, necha marta
    takrorlansa ham, o'zini tasdiqlamaydi.
- `src/ui/memory.js`: nom katagida **«пам.»** tegi (shu kontragentniki to'qroq), oynasi — narx, qayerdan, ariza №,
  kontragent, sana, «принята подрядчиком», «Применить»; smeta narxi katagida **«✓»** (ilgari qabul qilingan) yoki
  **«▲»** va sariq katak (ilgari qabul qilinganidan yuqori), oynasi mustaqil arizalarni sanaydi; holat qatorida
  «в памяти N · выше принятого M»; asboblar qatorida **«Память»** kaliti (shu brauzerda eslab qolinadi).
- Xotiradan qo'llangan narx manbasi — `mem:<qator>` (server tekshiradi; katakda «П» belgisi; jurnalda `mem` turi,
  jurnal sxemasi 2). Ctrl+Enter xotira oynasida ham birinchi qatorni oladi.
- Boshqa takliflarning tartibi va matni o'zgarmadi; hech narsa o'zi qo'yilmaydi; boshqa viloyat o'qilmaydi.
- Test: `test/memory.cjs` (sof), `test/e2e-memory.mjs` (brauzer), `test/learning.mjs`.

**Bilib qoldirilgan:** «Прежние проекты» (hali yakunlanmagan arizalar tuzatishlarini ham ko'rsatadi) va «пам.»
(faqat yakunlanganlar) bir xil narxni ikki joyda ko'rsatishi mumkin — ikkalasini birlashtirish egasining qarori
(savol 8). Chegara belgisi faqat «Проверка цен» ro'yxatida, «Сводная таблица» da emas.

**1-bosqichda aslida nima qilindi (rejadan farqlari bilan):**

- Jurnal: `src/ui/journal.js` (yangi, faqat server rejimi). Narx o'zgargandan 2,5 soniya keyin (yozish tugagach) yoki
  arizadan chiqishda qaror yoziladi: `applied` / `typed` / `reset` / `autopick` / `bulk` (reja ro'yxatiga `bulk`
  qo'shildi — «Применить %», «Цены этого контрагента…», «Отменить»). Takliflari yo'q resurs bo'yicha qaror ham
  yoziladi (qatorlarsiz) — «qo'lda yozilgan ulush» kuzatuvi uchun. Bir xil qaror ikki marta yozilmaydi.
- Qator belgilari: `k` (ref/uzex/hint/sim), `p` (o'z oynasidagi o'rni), daraja, `how`, `sim`, `drop`, `stage`,
  bayroqlar, narx, sana, viloyat, asos, yozuv raqamlari, birlik holati (same/conv/derived). Nom va smeta narxi yo'q.
- Xotira: «✓ Завершить» oynasi (`#finishBox`) — sonlar, «qolganlarini tekshirilgan deb hisoblash» (oldindan
  belgilangan), «не учитывать в обучении». Xotira yozilmay qolsa ariza baribir yakunlanadi va bu aytiladi.
- `source` tegilmaganlar uchun ham: `mark` (o'zi belgilagan) / `finish` (oynada hisoblangan); tuzatilganlarda `pct`
  alohida — «Применить %» narxi ekspertning aniq bozor narxi emas (2-bosqichda taklif sifatida ko'rsatilmaydi).
- Server: `server/pb_hooks/learning.pb.js`, `lib/learning.js` — to'rt yo'l; kolleksiyalarga yozish faqat shular
  orqali; cheklovlar: 200 qaror / so'rov, 12 qator / qaror, 20 KB / qator, uch ming narx / so'rov.
- Admin: «Обучение» paneli (`src/ui/learning-admin.js`) — faqat sonlar, «Скопировать числа».
- Maxfiylik: `test/refs-privacy.cjs` endi dataset/model fayllarini ham ushlaydi (nomi yoki ichidagisi bo'yicha).
- Reliz: `server/release.sh --unlisted` va `--list X.Y.Z` (test — `test/release-script.sh`).
- Test: `test/learning.mjs` (yangi), `test/e2e-compare-keep.mjs` («Исправлено» → `accepted`), `e2e-workspace`.

**O'lchanmagan / tekshirilmagan:** haqiqiy ma'lumotda hech narsa (men uni ko'rmayman); 3000 dan ortiq resursli
smetada yakunlash tezligi; Windows'da qo'lda sinov (to'plamdagi `laptop-windows` o'tadi).

Manba: egasining ikki hujjati («Smeta Taqqoslash: o'zi o'rganadigan AI tizimi rejasi» va Claude Code uchun brif,
2026-11-13). Bu fayl ularning kodga moslangan ko'rinishi; kod va `CLAUDE.md` bilan zid joyi bo'lsa — kod va
`CLAUDE.md` ustun, farqi pastda yozilgan.

## 1. Brif §2 dagi da'volar — tekshiruv natijasi (v2.10.3, `018f0fe`)

| Da'vo | Holati | Izoh |
|---|---|---|
| `retrieve.js` — qat'iy darvoza (sana, bo'lim, birlik, raqam ziddiyati) | to'g'ri | O'zgarmaydi |
| `suggest.js` `gather(q)` har bir nomzodni belgilari bilan qaytaradi | to'g'ri, **bitta farq** | `gather` ichki ob'ektlarni qaytaradi (`l.rec`, `l.how`, `l.sim`, `l.drop`, `l.stage`, `l.tierRank`, `l.flags`, `l.price`, `l.recs`) — `toLine` dan oldingi ko'rinish. Model uchun alohida, barqaror «belgilar» funksiyasi kerak (`src/lib/ml/features.js`), u `gather` natijasini o'qiydi, o'zgartirmaydi |
| `choose()` — `p3` siyosati, `src/refs-worker.js` da tanlangan | to'g'ri | `POLICY = 'p3'`, `maxLines: 6` |
| `query.js` — so'rovda smeta narxi yo'q | to'g'ri | Shunday qoladi |
| `corrections` — faqat o'zgargan narx; smeta narxiga qaytsa yozuv o'chadi | to'g'ri | `Sync.flush` (`src/ui/sync.js`) |
| «✓ Завершить» faqat `status = done` | to'g'ri | `Sync.finish`; «Вернуть в работу» — `Sync.reopen` (v2.10.0) |
| `app.checked` ish maydoni holatida saqlanadi | to'g'ri | `state.checked` |
| `hints.js` — faqat shu viloyat, shu kontragent birinchi | to'g'ri | |
| `contragent-prices.js`, `compare.js` statuslari (`fixed` …) | to'g'ri | `compare` qatori eski smetaning `S.resKey` i bilan bog'langan |

**Brifda yo'q, lekin muhim topilmalar:**

1. **Reliz tartibi brif bilan zid.** Brif (§3.10, §6 darvoza 3): «egasi sinamaguncha `releases.txt` ga
   qo'shilmaydi». `server/release.sh` esa ikkinchi commit'da **har doim** `releases.txt` ga yozadi, Windows noutbuk
   uni o'zi o'rnatadi. Taklif: `release.sh` ga `--unlisted` (reliz commit'i, ro'yxatsiz) va keyinroq
   `--list X.Y.Z` (sinalgan relizni ro'yxatga qo'shish) qo'shish, `test/release-script.sh` bilan. Mac esa
   `laptop.sh update` da shoxning oxirgi holatini oladi — ya'ni ro'yxatdan qat'i nazar har bir push'ni oladi.
   Shuning uchun AI bosqichlari shoxga faqat to'liq reliz bo'lib tushadi (oraliq commit'lar push qilinmaydi
   emas — lekin har push yashil to'plam bilan).
2. **O'lchov muhri `test/load.cjs` ga ham qaraydi.** `test/refs-parity.cjs` `src/lib/refs/**`, `match.js`,
   `normalize.js` bilan birga `test/load.cjs` ning «refs» so'zi bor qatorlarini ham xeshlaydi. Yangi `ml`
   modullarini `load.cjs` ga qo'shganda bu qatorlarda «refs» so'zi bo'lmasligi kerak, aks holda to'plam
   «NOT MEASURED» deydi.
3. **Worker hozir faqat `suggest()` natijasini beradi** (eng ko'pi 6 qator, `toLine` dan keyin). Soya rejimi va
   qayta o'ynatish uchun workerga `gather` + belgilar qaytaradigan yangi buyruq kerak (`src/refs-worker.js` —
   o'lchov xeshi ichida emas, lekin `REFS_KEYS_FILES` ga ham kirmaydi: kesh buzilmaydi).
4. **`corrections` da bo'lim (`section`) yo'q.** Qayta o'ynatish so'rovi uchun bo'lim kerak. Eski yozuvlar uchun u
   birlikdan va `S.sections.classify` dan taxmin qilinadi (`query.js` qoidasi) — taxminiy belgi deb belgilanadi.
   `price_memory` (1-bosqich) bo'limni o'zi saqlaydi.
5. **UZEX alohida worker'da** (`src/uzex-worker.js`, vaqtinchalik paket) va «Прежние проекты» (`hints.js`) —
   `gather` dan tashqarida. Ranker avval faqat справочник paketi uchun; UZEX va «Прежние проекты» xotira
   (2-bosqich) orqali kiradi.
6. **Haqiqiy ma'lumot kam bo'lishi ehtimoli katta.** Egasining kuzatuvi: bitta arizada resurslarning taxminan
   chorak qismi o'zgartirilgan, «проверено» belgisi esa ishlatilmagan. Model o'qitishga yetadimi — 3-bosqichdagi
   sonlar aytadi. Yetmasa, halol aytiladi va `p3` qoladi (brif §7).
7. **Ochiq PR #3** (to'rtinchi tekshiruvning 6-bosqichi boshlanishi: yangilanish kanali va Mac ishga tushirgichi)
   shu shoxga qaratilgan, tekshirilgan (to'plam yashil), lekin birlashtirilmagan — bu egasining qarori. AI ishi
   unga bog'liq emas; `test/all.sh` va `CLAUDE.md` da kichik to'qnashuv bo'lishi mumkin.

## 2. Kolleksiyalar (1-bosqichda qo'shiladi)

Hammasi server rejimida; bitta-fayl qurilishi o'zgarmaydi. Eski versiyaga qaytilsa kolleksiyalar bazada
ishlatilmay qoladi (zarar yo'q).

**`suggest_events`** — bitta resurs bo'yicha bitta qaror:
`workspace`, `application`, `contragent`, `region`, `asof`, `match_key`, `match_unit_key`, `section`,
`lines` (JSON, ≤ 12 qator: o'rni, manba turi `ref|uzex|hint`, yozuv kodlari, daraja, `how`, `sim`, `drop`,
`stage`, bayroqlar, narx, narx sanasi, viloyat, asos), `opened` (oyna ochilganmi), `action`
(`applied|typed|reset|autopick|bulk`), `chosen` (tanlangan o'rin yoki −1), `final_price`, `schema` (belgilar
sxemasi versiyasi), `app_version`, `by`. Bitta yozuv ≤ 20 KB. Smeta narxi **yozilmaydi**.

**`price_memory`** — «Завершить» da, har bir resurs uchun bitta qator:
`workspace`, `application`, `contragent`, `region`, `res_key`, `match_key`, `match_unit_key`, `name`, `unit`,
`section`, `smeta_price`, `final_price`, `kind` (`corrected|checked|untouched|zeroed`), `source`
(tuzatilgan uchun: `typed`, `ref:…`, `hint:…`, `uzex:…`, `pct` — «Применить %»; tegilmagan uchun: `mark` — o'zi
belgilagan, `finish` — yakunlash oynasida hisoblangan), `asof` (takliflar qaysi sanaga so'ralgan), `finished`
(sana), `accepted` (pudratchi «Сравнение версий» da qabul qilgani), `by`. Qayta «Завершить» shu ish maydonining
qatorlarini almashtiradi; «Вернуть в работу» keyingi yakunlashgacha ularga tegmaydi.

**`ml_models`** (4–5-bosqich) — `ref_packages` kabi: model JSON hujjati, `active`, karta (sana, misollar soni,
metrikalar, sxema xeshi). Sxema xeshi kodga mos kelmasa — yuklanmaydi, `p3` ishlaydi.

Huquqlar: kirgan foydalanuvchi o'qiydi; **yozish faqat server yo'llari orqali** (`POST /api/journal/events`,
`POST /api/memory/finish`, `POST /api/memory/accepted`) — viloyat, ariza, kontragent va `by` ni server o'zi
qo'yadi (`corrections/bulk` kabi), bitta so'rov — bitta tranzaksiya. «Не учитывать в обучении» bilan yakunlash shu
ish maydonining xotira qatorlarini o'chiradi (ariza dalil emas). Ish maydoni yoki ariza o'chirilsa, uning jurnal va
xotira qatorlari ham ketadi.

## 3. Belgilar (features) — smeta narxisiz

Moslik: `how` (aniq / oila / bo'shashtirilgan / o'xshash), `sim`, `drop`, oila darajasi, `stage`, `tierRank`.
Birlik: koeffitsient 1 mi, hosila birlik (`derived-unit`). Manba: asos (`basis`), manba turi, bayroqlar
(`stale`, `forward`, `other-region`, `wide-spread` …). Vaqt va joy: narx yoshi (kun), viloyat so'rov viloyati
bilan bir xilmi. Kelishuv: nomzod narxining boshqa nomzodlar medianasiga nisbati, nechta mustaqil manba.
O'rin: ekrandagi o'rni (o'qitishda belgi, bashoratda o'zgarmas qiymat — o'rin tarafkashligiga qarshi).
**Hech qachon:** smeta narxi va undan hosil bo'lgan narsa.

## 4. Bosqichlar (kodga moslangan)

| # | Bosqich | Asosiy fayllar | Tugash belgisi |
|---|---|---|---|
| 0 | O'qish, tekshirish, reja | `docs/ai-reja.md` | ✓ shu hujjat |
| 1 ✓ v2.11.0 | Jurnal + xotira (faqat yozish), «Завершить» oynasi, «Обучение» paneli (faqat sonlar), `release.sh --unlisted` | yangi `src/ui/journal.js`, `src/ui/learning-admin.js`, `server/pb_schema.json`, `server/pb_hooks/learning.pb.js`, `src/ui/sync.js` (`finish`) | `test/learning.mjs`: qo'llash/yozish/qaytarish/yakunlash to'g'ri qatorlar qoldiradi |
| 2 ✓ v2.12.0 | Xotira ekranda (ustuvorlik, «ранее принято», eskirish, o'zini tasdiqlashga qarshi himoya, o'chirish kaliti) | yangi `src/lib/memory.js`, `src/ui/memory.js` | `test/memory.cjs`, `test/e2e-memory.mjs` |
| 3 ✓ v2.13.0 | Qayta o'ynatish dataseti, metrikalar, `p3` o'lchovi, admin «Набор для обучения» | yangi `src/lib/ml/{features,metrics,dataset}.js`, `src/ui/dataset-admin.js`; `src/refs-worker.js` (`replay`) | `test/ml.cjs`, `test/e2e-dataset.mjs`; **darvoza 1:** egasining sonlari (§7) |
| 4a ✓ v2.14.0 | **Модель цен, 1-qadam:** dalillar, narx dataseti, chiziqli model, uch usul tajribasi — faqat o'lchov | yangi `src/lib/ml/{pricedata,pricemodel}.js`; `src/refs-worker.js`, `src/ui/dataset-admin.js` | `test/ml-price.cjs`; egasining sonlari |
| 4b | **Модель цен, 2-qadam:** modelni saqlash (`ml_models`), ish sahifasida «вероятно завышено → X», «Применить все предложения» | `server/pb_schema.json`, yangi `src/ui/ml.js` | **darvoza 2:** egasi 1-qadam sonlarini ko'rib rozi bo'lgach |
| 5 | O'zini yangilash (har yakunlangan arizadan keyin qayta o'qitish, chempion/da'vogar, qaytarish) | admin paneli | yomon da'vogar rad etiladi |
| — | Spravochnik qatorlarini qayta tartiblovchi model (dastlabki reja) | `src/lib/ml/{features,dataset}.js` tayyor | to'xtatilgan: egasining ma'lumotida o'zgartirilgan narxlarning ko'pi qatorlarga to'g'ri kelmaydi; «Применить» bilan ishlangan arizalar yig'ilsa qaytiladi |

Har bosqich — reliz; `releases.txt` ga faqat egasi sinagach (**darvoza 3**).

## 5. Xavflar

- **Maxfiylik:** dataset va model fayli faqat bazada yoki egasining kompyuteridagi faylda; `test/refs-privacy.cjs`
  ularni ham ushlaydi (1-bosqichda kengaytiriladi). Men haqiqiy ma'lumotni ko'rmayman — faqat sonlar.
- **O'lchangan kod:** `src/lib/refs/**`, `match.js`, `normalize.js`, `rankSimilar`/`SIM_MIN`/`SIM_SHOW` ga
  tegilmaydi; model yo'q bo'lsa natija bayt-bayt bugungidek (test).
- **Darvoza o'rganilmaydi:** model faqat o'tgan nomzodlarni tartiblaydi; «М5 ≠ М8» testi model yoqilgan holda ham.
- **Daraja tartibi:** «Похожий»/«Оценка» hech qachon «Документ» dan yuqoriga chiqmaydi.
- **O'z takliflaridan o'rganish:** o'rin yoziladi, oltin to'plam mustaqil.
- **Ma'lumot kam:** sodda model, ishonch oralig'i, natija bo'lmasa — `p3`.
- **Jurnal xatosi ishni to'xtatmaydi:** yozilmasa yutiladi, narx baribir saqlanadi.

## 6. Egasiga savollar va javob kelguncha ishlatiladigan qiymatlar

| Savol | Hozircha |
|---|---|
| O'zingiz yozgan narxlar qayerdan: paketda yo'q hujjat, hisob-kitob, tajriba? | Noma'lum — alohida dalil |
| Belgisiz, tegilmagan narxlar yakunlashda «проверено» hisoblanadimi? | Oynada taklif qilinadi, oldindan belgilangan |
| Tegilmagan narx qancha vaqtdan keyin chegara bo'lmay qoladi? | 12 oy |
| Tuzatilgan narx boshqa kontragentga ko'rsatilsinmi (shu viloyatda)? | Ha |
| Mijozning ekspertlari bitta o'rnatmadami? Qarorlar umumiymi? | O'rnatma bo'yicha umumiy, har qatorda `by` |
| Mijoz sizning modelingiz va xotirangizni oladimi yoki bo'sh boshlaydimi? | Bo'sh boshlaydi |
| `release.sh --unlisted` (ro'yxatsiz reliz) qo'shilsinmi? | Ha (1-bosqichda) |
| «Прежние проекты» va «пам.» bitta oynaga birlashtirilsinmi? | Yo'q — ikkalasi alohida turadi |
| «Применить %» bilan qo'yilgan narx xotirada taklif bo'lsinmi? | Yo'q — u aniq bozor narxi emas |
| «✓ ранее принято» belgisi ko'p qatorda chiqsa xalaqit beradimi? | Ko'rsatiladi; «Память» kaliti bilan o'chiriladi |
| Smeta narxi qoldirilgan, lekin spravochnikda undan past qator bor edi — bu «taklif rad etildi» deganimi? | Ha, yarim og'irlik bilan (`left`); «проверено» belgisi bo'lsa — to'liq |
| Qo'lda yozgan narxingiz spravochnik qatoridan necha foiz ichida bo'lsa «o'sha qator» hisoblansin? | 2 % |
| Qo'lda belgilangan «проверочный список» tuzasizmi (50–100 ta resurs: nom, birlik, viloyat, sana, to'g'ri narx)? | Majburiy emas; bo'lsa — eng ishonchli o'lchov |
| Model yangi smetada nima qilsin: qimmat narxni belgilab, o'z taxminini taklif qilsinmi (narx faqat «Применить» bilan)? | Ha — shu yo'nalishda loyihalanadi (javob kutilmoqda) |
| Javobda yo'q (o'zgartirilmagan) resurs — «smeta narxi qimmat emas» deganimi? | Ha, eski ishda hamma resurs ko'rib chiqilgan deb |
| 0 qo'yilgan resurs (o'chirilgan) | Narx sifatida o'rganilmaydi |

## 7. Egasi o'z kompyuterida qiladigan ish (darvoza 1)

1. Mac'ni yangilash: `cd ~/Smeta && sh server/laptop.sh update`, brauzerda Cmd+Shift+R — sarlavhada **v2.13.0**.
2. Haqiqiy arizalarda odatdagidek ishlash va har birida «✓ Завершить» bosish (oynani o'qib, tasdiqlash). Avval
   yakunlangan arizalarni «Вернуть в работу» → «✓ Завершить» qilib xotiraga yozish ham mumkin. Qancha ko'p ariza
   bo'lsa, sonlar shuncha ishonchli: test qismi paydo bo'lishi uchun kamida 2 ta, ma'noli o'lchov uchun 5+ ta.
3. Admin sahifasi (`http://127.0.0.1:8090/admin.html`) → «Обучение»:
   - yuqoridagi «Скопировать числа» (nechta qaror va narx to'plangani);
   - pastdagi «Набор для обучения» → **«Собрать и измерить»** → tugagach **«Скопировать числа»**.
   Ikkala matnni yuborish. Ularda faqat kalit va sonlar bor — nom, narx, hujjat yo'q (`schema = …`, `rows = …`,
   `queries.ref = …`, `p3.test.p1 = …`, `lift.same_region = …` kabi qatorlar).
4. Hammasi joyida bo'lsa aytish — shundan keyin `sh server/release.sh --list 2.11.0`, `--list 2.12.0`,
   `--list 2.13.0` (Windows o'zi o'rnatadi).

Sonlarga qarab hal qilinadi: `queries.ref` + `queries.near` yuzlab bo'lsa — logistik regressiya va kichik MLP
sinaladi; o'nlab bo'lsa — faqat eng sodda model yoki hech qanday (xotira va `p3` qoladi), ma'lumot yig'ilguncha.
