# O'zi o'rganadigan takliflar — ish rejasi (AI ranker)

Holati: **0-, 1- va 2-bosqich bajarildi (2026-11-13; v2.11.0 va v2.12.0 — ro'yxatsiz relizlar: egasi sinagach
`--list`).** 1-bosqich: qarorlar jurnali (`suggest_events`) va yakunlangan narxlar xotirasi (`price_memory`) — faqat
yozish. 2-bosqich: xotira ekranda («пам.» tegi, «ранее принято» / «выше принятого» belgisi, «Память» kaliti).
Keyingisi — 3-bosqich (qayta o'ynatish datasetı va `p3` baseline), undan keyin **darvoza 1**: egasining sonlari.

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
| 3 | Qayta o'ynatish datasetı, metrikalar, `p3` baseline | `src/lib/ml/{features,metrics,dataset}.js`, worker buyrug'i | **darvoza 1:** egasining sonlari |
| 4 | Modellar (logistik regressiya, juftlab; MLP; kalibrlash) | `src/lib/ml/{logreg,mlp,calib}.js` | tajribalar jadvali |
| 5 | Dasturda: soya rejimi → (egasi rozi bo'lsa) yoqish | `src/lib/ml/rank.js` | **darvoza 2** |
| 6 | O'zini yangilash (chempion/da'vogar, qaytarish, kuzatuv) | admin paneli | yomon da'vogar rad etiladi |

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

## 7. Egasi o'z kompyuterida qiladigan ish (1-bosqichdan keyin)

1. Mac'ni yangilash: `cd ~/Smeta && sh server/laptop.sh update`, brauzerda Cmd+Shift+R — sarlavhada v2.11.0.
2. 2–3 ta haqiqiy arizada odatdagidek ishlash va «✓ Завершить» bosish (oynani o'qib, tasdiqlash). Avval
   yakunlangan arizalarni «Вернуть в работу» → «✓ Завершить» qilib xotiraga yozish ham mumkin.
3. Admin sahifasi (`http://127.0.0.1:8090/admin.html`) → «Обучение» → «Скопировать числа» → matnni yuborish.
   Unda faqat sonlar bor.
4. Hammasi joyida bo'lsa aytish — shundan keyin `sh server/release.sh --list 2.11.0` (Windows o'zi o'rnatadi).
