# To'rtinchi tekshiruv — butun dastur, v2.9.1

Bu safar savol kengroq edi: nafaqat «kodda xato bormi», balki **dastur
egasining ishini qanchalik ishonchli, tez va qulay bajaradi**. Dastur besh
yo'nalishda tekshirildi, har birini alohida tekshiruvchi olib bordi:

| | Yo'nalish | Qanday tekshirildi |
|---|---|---|
| 1 | Hujjat aniqligi: o'qish, yig'ish, hisobot, eksport, solishtirish | haqiqiy smetalar (faqat o'qildi) va sun'iy fayllar; eksport qayta o'qilib, formulalari hisoblandi |
| 2 | Server, xavfsizlik, ma'lumot butunligi | alohida PocketBase, to'rtta hisob, haqiqiy Chromium, soxta saytlar |
| 3 | Ishonchlilik va tezlik | haqiqiy brauzerda o'lchov; aloqa uzilishi, sekin tarmoq, ikki vkladka, server o'chirilishi |
| 4 | Qulaylik, avtomatlashtirish, yetishmayotgan imkoniyatlar | 112 ta ekran surati (1366 va 1920), har bir tugma bosib ko'rildi |
| 5 | Ishga tushirgichlar, yangilanish, testlar, kodni yuritish | skriptlar o'qildi, zaxiradan tiklash mashq qilindi, testlar birma-bir ishga tushirildi |

Qoidalar: **kodga hech narsa o'zgartirilmadi**; har bir topilma kamida bir
marta ishga tushirib ko'rilgan yoki «faqat o'qildi» deb belgilangan; eng
jiddiylari ikkinchi marta, mustaqil qayta tekshirildi. Haqiqiy narxlar va
hujjat nomlari bu faylda yo'q.

Holat belgilari: `[ ]` ochiq · `[?]` egasining qarori kerak · `[x]` bajarilgan
(hozircha hech biri) · `[~]` tekshirildi va rad etildi.

Jiddiylik: **yuqori** — noto'g'ri hujjat yoki ma'lumot yo'qolishi ·
**o'rta** — ish to'xtaydi yoki xato ehtimoli · **past** — noqulaylik.
Hajm: **S** — yarim kungacha · **M** — 1–2 kun · **L** — 3 kun va undan ko'p.

---

## Yakun

Yadro sog'lom: `CLAUDE.md` dagi to'qqizta qoidaning hammasi sun'iy va haqiqiy
fayllarda tekshirildi va **ushlanadi** (bitta resurs — bitta narx, qatorma-qator
yig'ish, raqamlar yo'qolmasligi, chegara, shartli formatlash, formulalar tirik).
Odatiy yo'l — hisobot turi «Только изменённые» va «Без повторов» — to'g'ri
hujjat beradi. Dastur tez: haqiqiy smeta 0,8 soniyada ochiladi, narx yozish
5–7 ms, eksport 0,3 soniya.

Lekin chetdagi yo'llarda jiddiy kamchiliklar bor. Eng muhimlari:

| № | Nima | Jiddiylik | Hajm |
|---|---|---|---|
| A1 | «Полная копия» hisoboti: narxi o'zgargan qatorlar saralangach, ИТОГО formulalari noto'g'ri yoki aylanma bo'ladi | yuqori | M |
| A2 | 4А shaklidagi smeta: ИТОГО qatorining bozor tomoni smeta summasida qolib ketadi | yuqori | S–M |
| A3 | «Uskunalar» qoidasi (v2.5.7) testda ishlaydi, sahifada ishlamaydi | o'rta | S |
| B1 | Mac'da kunlik zaxira faqat ishga tushganda olinadi va o'sha diskning o'zida turadi | yuqori | M |
| B2 | Oxirgi yozilgan narx vkladka yopilganda yo'qolishi mumkin (sekin tarmoqda) | yuqori (tarmoqda) | M |
| B3 | Bitta ariza ikki vkladkada ochiq bo'lsa, biri ikkinchisining narxlarini jimgina o'chiradi | yuqori | S–M |
| B4 | Serverga yuklanmagan smeta yashil «✓» ostida ishlanadi va qayta yuklashda yo'qoladi | yuqori | S–M |
| B5 | «Сбросить выбранные» so'rovsiz va qaytarishsiz ro'yxatdagi hamma narxni o'chiradi | yuqori | S |
| C1 | Windows yangilanishi nima yuklab olganini tekshirmaydi (xesh ham, imzo ham yo'q) | yuqori | L |
| H1 | Doim «qizil» turgan 3 ta test dasturdagi xatoni emas, testning o'z kamchiligini ko'rsatadi | — | M |

Jami: 74 ta band (topilma va taklif) — 10 tasi yuqori (ikkitasi faqat ko'p
foydalanuvchi rejimida), 30 ga yaqini o'rta, qolgani past yoki taklif. Oxirida — [tavsiya etilgan tartib](#tavsiya-etilgan-tartib) va
[egasi hal qiladigan savollar](#egasi-hal-qiladigan-savollar).

Uzoq yillik «3 ta ma'lum xato» (`hints`, `browser`, `e2e-hints`) ham
o'rganildi: uchalasi ham **testning o'zidagi** nuqson (H1). Ya'ni dastur
ularning orqasida xato yashirmayapti — lekin qizil turgan to'plam haqiqiy
xatoni ham ko'rsatmaydi, shuning uchun ularni tuzatish kerak.

---

## A. Hujjatdagi raqamlar

### [x] A1 «Полная копия»: saralashdan keyin ИТОГО formulalari buziladi

`src/lib/report.js:137-181` (`rowOf`, `mapRow`, `translateMap`),
`src/lib/formula.js:60-79` — **yuqori** · M

Hisobot turi «Полная копия» bo'lganda narxi o'zgargan qatorlar bandning
boshiga ko'tariladi. `SUM(a:b)` diapazonining ikki uchi o'sha qatorlar bilan
birga ko'chadi: diapazon torayadi, teskari bo'lib qoladi (`=SUM(H17:H13)`)
yoki o'z ИТОГО qatorini ichiga oladi (aylanma havola — Excel `0` ko'rsatadi
va ogohlantiradi).

O'lchov: haqiqiy ko'p varaqli smetada 27 ta resurs narxi o'zgartirilganda
36 ta band ИТОГО sidan 6 tasi aylanma; 102 ta o'zgartirilganda 63 ta aylanma
katak, 36 tadan 32 ta jami noto'g'ri. «Только изменённые» va «Без повторов»
turlarida xato **yo'q** — ularda formulalar qaytadan quriladi.

Reja: diapazon uchlarini qator bo'yicha emas, **o'rin bo'yicha** ko'chirish —
bandning birinchi va oxirgi o'rni saralashdan keyin ham band chegarasi bo'lib
qoladi. Yangi test: eksportni qayta o'qib, har bir formulani hisoblaydi va
ИТОГО = qatorlar yig'indisi ekanini uch turda ham tekshiradi (hozir bunday
test yo'q — shuning uchun xato ko'rinmagan). Eksport ko'rinishi o'zgarmaydi.

**Bajarildi — v2.9.2, commit `591457f`.** Havola endi qatorga emas, **o'ringa**
ergashadi (faqat qatorning o'ziga havolasi qator bilan ko'chadi) — Excelda
saralashdan keyin bo'lgani kabi. Yangi test `test/export-formulas.cjs`
(+ `test/calc.cjs` — kichik hisoblagich). Haqiqiy smetada: 6 784 formula,
xato 0, teskari diapazon 0, 36 ta band jamisidan 36 tasi o'z qatorlariga teng.
Eslatma: saralash qatorni boshqa band o'rniga olib o'tsa, o'sha band jamisi
smetadagidan farq qiladi — umumiy summa o'zgarmaydi.

### [x] A2 4А shakli: ИТОГО ning bozor tomoni smeta summasida qoladi

`src/lib/assemble.js:207` (`cells[C_MSUM] = { v: g.v }`) — **yuqori** · S–M

4А (АВС-4) shaklida ИТОГО formula emas, yozib qo'yilgan son. Dastur uni bozor
tomoniga ham **o'sha son** bilan ko'chiradi. Narxlar o'zgarsa, qatorlar
o'zgaradi, ИТОГО esa eski smeta jamisida qoladi — hujjatda «bozor jami»
qatorlar yig'indisiga teng emas.

O'lchov: haqiqiy 4А faylida hamma narx 10 % ga tushirilganda 75 ta band
jamisidan 69 tasi qatorlar yig'indisidan farq qiladi (eng kattasi 11,11 %).
Farq ustuni (`=+G-I`) ham shunga yarasha noto'g'ri.

Reja: yozilgan jami o'rniga shu band qatorlari bo'yicha `SUM(...)` yozish
(smeta tomonida ham, bozor tomonida ham — «formulalar tirik» qoidasiga mos).
Muqobil: bozor tomonini bo'sh qoldirish. → egasining qarori 8.

**Bajarildi — v2.9.2, commit `bc2875c`; egasi `SUM` ni tanladi.** Yozilgan
jami nimaning yig'indisi ekani topiladi (o'z bandining qatorlari yoki oldingi
jamilar — «ИТОГО ПРЯМЫЕ ЗАТРАТЫ») va **son tekshirilgandan keyingina** ikkala
tomonga formula yoziladi. Haqiqiy faylda 89 ta jami formulaga aylandi: narx
o'zgarmaganda 86 tasi bosilgan songa ±0,5 so'm aniqlikda teng (smeta jamini
butun so'mga yaxlitlaydi), 3 tasi (yaxlitlangan jamilar yig'indisi) ±2 so'm.
Qatorlari tushuntirmaydigan jami «yig'indi + qoldiq» bo'lib yoziladi
(`=SUM(G30:G31)+7`). Matn bo'lgan jami («-») va formula bo'lgan jami avvalgidek.
Oddiy smetalar eksporti baytma-bayt o'zgarmadi.

### [x] A3 «Uskunalar» qoidasi sahifada ishlamaydi

`src/worker.js:16-20`, `src/lib/smeta.js:334`, `src/lib/assemble.js:177` — **o'rta** · S

v2.5.7 da qo'shilgan qoida («Оборудование» sarlavhali varaq alohida hisoblanadi)
`equipTitle` maydoniga tayanadi. O'qish sahifada alohida oqimda (worker)
bajariladi, va u bu maydonni sahifaga **yubormaydi**. Testlar o'quvchini
to'g'ridan-to'g'ri chaqiradi — ularda qoida ishlaydi, brauzerda esa yo'q.

Reja: maydonni yuborish (bir qator) va yangi test: worker qaytargan natija
`parseWorkbook` natijasi bilan maydonma-maydon bir xil. Bu test kelajakda
shunga o'xshash har qanday «unutilgan maydon»ni ushlaydi.

**Bajarildi — v2.9.2, commit `2cb546c`.** Worker endi o'quvchi qaytargan
obyektlarni o'zgarishsiz yuboradi (maydonlarni qo'lda tanlamaydi). Test
`test/worker-parity.cjs` worker'ni ikkala sahifaga qurilgan holida ishga
tushiradi.

### [x] A4 Standart sarlavha qatori hech qachon tanilmaydi

`src/lib/smeta.js:38,95,109,298` — **o'rta** · S

Sarlavha `S.nameKey()` dan o'tkazilgandan keyin `КОЛ-ВО` so'zi qidiriladi,
lekin `nameKey('КОЛ-ВО')` = `КОЛ ВО`. Shuning uchun «N п/п · НАИМЕНОВАНИЕ ·
ЕД. ИЗМ. · КОЛ-ВО · ЦЕНА · СУММА» sarlavhasi **hech qachon** topilmaydi va
barcha oddiy varaqlar zaxira usul — ustunlarni taxmin qilish — bilan o'qiladi
(haqiqiy smetada 14 varaqdan 14 tasi). Ikki tekshiruvchi buni mustaqil topdi.

Oqibati: haqiqiy fayllar baribir to'g'ri o'qiladi (qatorlar soni va summalar
tekshirildi), lekin (a) sarlavhasi to'g'ri, band nomi A ustunida bo'lmagan
varaq «листы ресурсов не найдены» deb rad etiladi — xabar esa aynan o'sha
sarlavhani qo'shishni maslahat beradi; (b) birinchi varaqda sarlavha va
raqamlash qatorlari hujjatga tushmaydi.

Reja: sarlavhani tozalangan matn bilan solishtirish. **Ehtiyot:** bu o'qish
yo'lini o'zgartiradi — tuzatishdan oldin va keyin ikkala haqiqiy smeta
eksporti baytma-bayt solishtiriladi; (b) bo'yicha ko'rinish `321.xlsx` bilan
taqqoslanadi.

**Bajarildi — v2.9.2, commit `2baf49e` — (a) qismi; (b) ataylab qilinmadi.**
Tarix ko'rsatdiki, sarlavha repo boshidan beri hech qachon tanilmagan: hozirgacha
chiqqan **har bir** hujjat «shakl bo'yicha» o'qishdan qurilgan va egasi ularni
namuna bilan solishtirib qabul qilgan. Shuning uchun shakl bo'yicha o'qish
birinchi va tegilmagan holda qoldi; sarlavha faqat u **o'qiy olmagan** varaqda
so'raladi (bandlari nom ustunida, bandsiz, ortiqcha ustunli) va varaq boshqa
oddiy varaqlar bilan bir xil ko'rinishda joylashadi. Qo'ldagi 51 ta kitob
(haqiqiy smetalar va dasturning o'z eksportlari) oldin va keyin bir xil
o'qiladi. Faqat smetaning o'z sarlavhasi qabul qilinadi (bitta miqdor, bitta
narx, bitta summa) — dasturning solishtirish jadvali va o'z hujjati smeta deb
olinmaydi. `[~]` (b) «sarlavha qatorini Лист1 ga qo'shish» rad etildi: u
qabul qilingan hujjat ko'rinishini va A ustunidagi raqamlashni o'zgartirardi.
Test: `test/smeta-header.cjs`.

### [x] A5 Sonlarni o'qish: vergul va nuqta

`src/lib/util.js:43-52` (`S.num`) — **o'rta** · S

«12,500» → 12,5; «1,234» → 1,234; «1.000» → 1. «1,234.56», «1.234,56», «+5»
va Unicode minus rad etiladi (`null`) — narx katagida esa `null` **jimgina
smeta narxini qaytaradi**: ekspert yozdi, katak eski narxni ko'rsatdi, xabar
yo'q. Haqiqiy fayllarda o'qilmagan katak 0 ta; xavf — qo'lda yozishda va
nusxalab qo'yishda.

Reja: ikkala ajratgich bor bo'lsa, oxirgisi kasr belgisi; bitta vergul va
undan keyin roppa-rosa uchta raqam bo'lsa — noaniq: narx katagida so'rash
(«minglikmi yoki kasrmi?»); o'qilmagan qiymatda katak qizil ramka va
«не число» xabari, eski narx jimgina qaytmaydi. `test/num.cjs` — yangi.

**Bajarildi — v2.9.4, commit `f2aac2d`.** Ikkala ajratgich bo'lsa — oxirgi
yozilgani kasr belgisi, ikkinchisi faqat uch raqamli guruhlarni ajratsa
qabul qilinadi («1,234.50», «1.234,50», «1 234 567,8»); «+5» va Unicode
minus o'qiladi; «4.1.1», sana, yonida so'z bor matn — son emas. Bitta vergul
avvalgidek kasr belgisi (haqiqiy fayllar shunday yozilgan — 51 ta kitob
katakma-katak bir xil o'qildi), lekin narx katagida «uch raqam oldidan bitta
vergul» yozilib, smeta narxi yuz baravar katta bo'lsa — sahifa «minglik
nazarda tutilgandir» deb aytadi. O'qilmagan qiymatda katak qizil, narx
**o'zgarmaydi** va katakdan chiqishda xabar chiqadi — eski narx jimgina
qaytmaydi. So'rov oynasi qo'yilmadi (har bir kasrli narxda chiqardi).
Test: `test/num.cjs`, `test/e2e-compare.mjs`.

### [x] A6 Summasi «miqdor × narx» ga teng bo'lmagan qator jimgina qayta hisoblanadi

`src/lib/assemble.js:180` — **o'rta** · S

Smetada bosilgan summa miqdor × narxdan farq qilsa, hujjatga formula natijasi
tushadi va bu haqda hech narsa aytilmaydi. Haqiqiy smetalarda bunday qator
kam (ikki mingdan bittasi), lekin o'sha bandning jamisi 0,42 % ga farq qildi.

Reja: bunday qatorlarni yuklashda sanash va «Проверка» ro'yxatida ko'rsatish
(«в N строках сумма сметы ≠ кол-во × цена»); hisoblash qoidasi o'zgarmaydi.

**Bajarildi — v2.9.4, commit `f2aac2d`.** Bunday qatorlar yuklashda sanaladi
(`model.oddSums`: soni va birinchi yigirmatasi) va fayllar to'plami uchun bir
marta aytiladi: nechta qator, birinchisining raqami, nomi, smetadagi summa va
miqdor × narx. Hisoblash qoidasi o'zgarmadi. Alohida «Проверка» ro'yxati
qilinmadi — 5-bosqichda (UX) ko'riladi.

### [?] A7 «Применить %»: yaxlitlash va yozilgan narxlar

`src/ui/prices.js:136-142` — **o'rta** · S

Ikki narsa: (1) `Math.round` — 0,56 dan kichik narx 0 ga aylanadi, tiyinli
narxlar butun so'mga yaxlitlanadi; (2) foiz ro'yxatdagi **hamma** resursga
qo'llanadi, ekspert qo'lda yozgan narxlar ham ustidan yoziladi — «ekspert
yozgan narx doim ustun» qoidasining ruhiga zid.

Reja: (1) ikki xonagacha yaxlitlash, natija 0 bo'lsa tegmaslik; (2) → egasining
qarori 2: qo'lda yozilganlarni o'tkazib yuborish va nechta o'tkazilganini
aytish.

### [x] A8 Hamma o'zgarish chegaradan past bo'lsa, hisobot varag'i jimgina bo'sh

`src/lib/report.js:225-228`, `src/ui/app.js:17` — **o'rta** · S

Chegara («разница от») 5 mln turganda mayda o'zgarishlar hisobotga tushmaydi —
bu to'g'ri. Lekin hammasi chegaradan past bo'lsa, varaq bo'sh chiqadi va
hech qanday izoh yo'q; ekspert «narxlarim saqlanmadi» deb o'ylaydi.

Reja: «изменено N, из них в отчёт попало 0 — все ниже порога X» qatori va
chegarani shu yerning o'zida o'zgartirish havolasi.

**Bajarildi — v2.9.2, commit `0207213`.** «Вид отчёта» ustida izoh: nechta
o'zgargan narx chegaradan past qolgani va chegara qiymati; varaq bo'sh bo'lsa —
pushti rangda, «Цены сохранены и стоят в „Сводной таблице“» degan so'z va
«Изменить порог» tugmasi bilan. «Скачать Excel» dan keyingi xabarda ham.
Hujjatga nima tushishi o'zgarmadi.

### [ ] A9 Mayda aniqlik kamchiliklari (past)

* «Полная копия»: manba faylidagi yordamchi ustun «Eslatma»ga bosiladi va
  izohlarni siqib chiqaradi — `src/lib/report.js:26-27,180-181`.
* To'g'ri, lekin kam uchraydigan `.xlsx` yozilishi bo'sh o'qiladi (`r=` siz
  kataklar, `x:` prefiksi, bittalik qo'shtirnoq); `.xls` berilsa «invalid zip
  data» chiqadi, «сохраните как .xlsx» o'rniga — `src/lib/xlsx-read.js:47-99`.
* `nameKey` «1/2» va «1,2» ni, «50*5» va «50.5» ni bir kalitga tushiradi;
  kirill va lotin harfidagi o'lchov birligi ikki resurs bo'ladi. Haqiqiy
  fayllarda 0 ta holat — **o'lchovsiz tegilmaydi**, faqat qayd etildi.
* Formulali kataklar keshlangan qiymatsiz yoziladi: Excel ochganda hisoblaydi,
  lekin telefon ko'rgichi va ba'zi dasturlar bo'sh ko'rsatadi —
  `src/lib/xlsx-write.js:148,277`.
* Reyestr importi: summa `parseFloat` bilan yumshoq o'qiladi; sana import
  qilayotgan kompyuterning vaqt mintaqasiga bog'liq —
  `src/lib/registry-parse.js:52-69`.
* `near()` bardoshligi ba'zi kattaliklarda ekrandagi narxni qayta yozishni
  «o'zgarish» deb sanaydi — `src/lib/util.js:37-41`.

---

## B. Hech narsa yo'qolmasin

### [x] B1 Mac: zaxira faqat ishga tushganda olinadi va o'sha diskda turadi

`server/laptop.sh:154-176,240,256` — **yuqori** · M

Uch kamchilik birga:

1. «Kunlik» zaxira faqat `start` / `serve` paytida olinadi; kutish sikllari
   faqat uxlaydi. Noutbuk haftalab o'chirilmasa (Mac'da odatiy hol) — zaxira
   ham haftalab olinmaydi. Windows ishga tushirgichi har aylanishda tekshiradi.
2. Ikkala nusxa ham (`pb_data/backups` va `~/Backups/smeta`) noutbukning o'z
   diskida. Disk buzilsa yoki noutbuk yo'qolsa — narx xotirasi va 14 ta zaxira
   birga ketadi. Windows'da tashqi nusxa faqat Google Drive o'rnatilgan bo'lsa.
3. Tiklash buyrug'i ham, ko'rsatmasi ham, testi ham yo'q. Tekshiruvda qo'lda
   tiklab ko'rildi — **ishlaydi** (ZIP bo'sh papkaga ochildi, yozuvlar soni va
   saqlangan fayl joyida) — lekin buni hech kim hech qachon qilmagan.

Yana: 14 kunlik chuqurlik (uchinchi haftada payqalgan xato qaytarilmaydi);
nusxalash muvaffaqiyatsiz bo'lsa ham «zaxira: …» deb yoziladi
(`laptop.sh:163-167`); zaxira ZIP ichiga `serve.pid` tushadi.

Reja: (1) sikllarda soatiga bir marta `backup_if_stale`; (2) ikkinchi manzil —
iCloud Drive yoki Google Drive papkasi, agar bor bo'lsa (→ egasining qarori 6);
(3) `laptop.sh restore <zip>` va `laptop.cmd restore`: to'xtatish, `pb_data`
ni chetga surish, ochish, ishga tushirish, yozuvlar sonini chiqarish — va shuni
bajaradigan test; (4) 14 kunlik + 8 haftalik + 12 oylik nusxa; (5) nusxalash
xatosi baland ovozda. Windows ishga tushirgichidagi **kelishuv o'zgarmaydi** —
`restore` yangi buyruq, eskilariga tegmaydi.

**Bajarildi — v2.9.3, commit `3787069` (Mac/Linux ishga tushirgichi).**
Ishlab turgan dastur har soatda zaxirani tekshiradi. Ikkinchi nusxa — Google
Drive yoki iCloud Drive papkasi o'zi topiladi (`Smeta zaxira (Mac)`; Windows'ning
`Smeta zaxira` papkasidan ataylab alohida — bitta hisobdagi ikki kompyuter
bir-birining nusxalarini o'chirib yubormasin), `drive <papka>` boshqasini
tayinlaydi, `drive off` o'chiradi; ikkinchi joy bo'lmasa har bir buyruq buni
ochiq aytadi. Saqlanadi: oxirgi 14 ta + 8 haftalik + 12 oylik
(`server/backup-prune.cjs`). `restore` ro'yxat beradi, `restore <zip>` faylni
tekshiradi, hozirgi bazani chetga suradi, tiklaydi va nechta yozuv qaytganini
aytadi. Testlar: `test/laptop-backup.sh` (ishga tushirgich vaqtinchalik nusxada
haqiqatan yuradi, 25 tekshiruv), `test/backup-prune.cjs` (ikki yil, kuniga bitta
nusxa). **Qolgani:** Windows'da `restore` buyrug'i yo'q (G3 bilan birga);
haqiqiy Mac'da sinalmagan narsa — macOS login paytida ishga tushgan dasturga
bulut papkasiga yozishga so'rovsiz ruxsat beradimi (`status` ikkinchi nusxalar
sonini ko'rsatadi — bir kundan keyin qarab qo'yish kerak).

### [x] B2 Oxirgi narx vkladka yopilganda yo'qolishi mumkin

`src/ui/sync.js:65-68,368-372` — **yuqori** (LAN/VPS da), **o'rta** (noutbukda) · M

Saqlash navbati qat'iy ketma-ket: avval tuzatishlar (`corrections`), keyin ish
maydoni holati. Vkladka yopilayotganda ikkinchi so'rov birinchisi **javob
berguncha** jo'natilmaydi. Noutbukda javob 7 ms — ulguradi (8 urinishda bir
marta ham yo'qolmadi). 200 ms kechikishda (ofis tarmog'i → VPS, yoki band
server): narx yozilgach 0,3 soniyada vkladka yopilsa, tuzatish serverga
yetadi, holat esa yo'q. Qayta ochilganda narx jadvalda ham, hujjatda ham
yo'q — lekin boshqa loyihalarga «ekspert qo'ygan narx» sifatida taklif
qilinadi.

Reja: (1) har bir narx o'zgarishini darhol `localStorage` ga yozish, server
tasdiqlagach o'chirish, ochilishda yangirog'ini qayta qo'llash — vkladka
yopilishi, brauzer qulashi, tok o'chishidan himoya; (2) sahifa yashirilganda
ikkala so'rovni **parallel** va `keepalive` bilan jo'natish; (3) tiklashda
holatdagi narxlarni shu ish maydonining o'z tuzatishlari bilan birlashtirish
(ular baribir yuklanadi) — serverga yetgan narx jadvaldan tushib qolmaydi.

**Bajarildi — v2.9.4, commit `5f0451d` — uchala qism.** (1) Har bir narx
qo'yilgan zahoti shu brauzer xotirasiga yoziladi va uni o'z ichiga olgan
holat serverda tasdiqlangach o'chiriladi; ariza shu brauzerda qayta
ochilganda serverdagi holatdan **yangiroq** yozuvlar qaytariladi (eskisi
tashlanadi). (2) Sahifadan chiqishda ikkala so'rov navbat kutmasdan birga
jo'natiladi, kichik bo'lsa (30 KB gacha) `keepalive` bilan. (3) Arizaning
holati oxirgi marta saqlanganidan **keyin** yozilgan tuzatishi (ikkala vaqt
ham serverniki) ochilishda jadvalga qaytariladi — istalgan brauzerda. Uchala
holatda sahifa nechta narx tiklanganini aytadi. Sinov: sekin va uzilgan
tarmoq (`test/close-tab.mjs`, test serveri oldidagi kichik reley orqali) —
eski kodda 11 ta tekshiruv yiqiladi. Qolgan chegara: boshqa kompyuterning
soati bir necha daqiqa farq qilsa, (1) noto'g'ri tanlashi mumkin — ko'p
foydalanuvchi bosqichida (7) server versiya raqami bilan hal bo'ladi.

### [x] B3 Ikki vkladka bir-birining narxlarini jimgina o'chiradi

`src/ui/sync.js:96-99,310-359` — **yuqori** · S (vkladkalar) + M (server)

Har bir saqlash butun holatni yuboradi; «oxirgi saqlagan yutadi». Bitta odam
arizani ikki vkladkada ochgan bo'lsa (ishga tushirgich har safar yangi vkladka
ochadi; tiklangan sessiya; havola): A vkladka narx yozdi — «✓». Oldinroq
ochilgan B vkladka boshqa narx yozdi — uning saqlashi A ning narxini o'chiradi.
Ikkala vkladkada ham yashil «✓», hech qanday xabar yo'q; A qayta
yuklangandagina narxi yo'qligi ko'rinadi. Ikki tekshiruvchi mustaqil
tasdiqladi (bitta odam — ikki vkladka; ikki ekspert — bitta ariza).

Reja: (S) `BroadcastChannel`: ariza boshqa vkladkada ochilganini eshitgan
vkladka «заявка открыта в другой вкладке — обновить» degan to'siq ko'rsatadi
va saqlashni to'xtatadi. (M, ko'p foydalanuvchi uchun shart) sahifa o'zi
yuklagan `updated` ni yuboradi; server yozuv yangiroq bo'lsa 409 qaytaradi;
sahifa holatni qayta yuklab, o'zining kutilayotgan narxlarini ustiga qo'yadi.

**Bajarildi — v2.9.3, commit `ebcf313` — vkladkalar qismi.** Bir vaqtda bitta
vkladka ishlaydi — eng yangisi. Eskisi saqlamaganini saqlaydi, to'xtaydi va
«Эта заявка открыта в другой вкладке» oynasi bilan yopiladi; «Обновить и
работать здесь» uni yana ishchi qiladi. Yangi vkladka eskisida saqlanmagan narsa
bo'lganini bilsa, arizani qayta o'qiydi. Test: `test/two-tabs.mjs` (uch vkladka).
**Qolgani (7-bosqich):** ikki kishi ikki brauzerda — server eskirgan saqlashni
rad etishi (409).

### [x] B4 Yuklanmagan smeta yashil «✓» ostida qoladi

`src/ui/sync.js:375-402,113-115` — **yuqori** · S–M

Fayl serverga yuklanmasa (31-fayl — cheklov 30; 60 MB dan katta; tarmoq
uzilishi), bitta qizil xabar chiqadi va o'sha soniyada keyingi xabar uni
**almashtiradi** (E2). Smeta ekranda qoladi, «✓» yonadi, narx yozish mumkin
va u «saqlanadi». Qayta yuklashda bu smeta yo'q: holat faqat fayli bor
loyihalarni tiklaydi. Yozilgan narxlar hech bir qatorga tegishli bo'lmagan
kalit ostida qoladi.

Reja: fayli serverda yo'q loyiha — «saqlanmagan»: «!» belgisi o'chmaydi, yon
panelda doimiy qator «файл не сохранён на сервере — повторить»; yuklash
`saveNow` kabi qayta uriniladi; cheklovlar (30 ta, 60 MB) yuklashdan **oldin**
ruscha aytiladi — ikkalasi ham brauzerda ma'lum.

**Bajarildi — v2.9.3, commit `35e201e`.** Yuklanmagan fayl sababi bilan ushlab
turiladi: belgi «!», loyihalar ro'yxati ustida qator va «Повторить»; aloqa yoki
server xatosi o'zi qayta uriniladi; 30 ta fayl va 60 MB cheklovi serverdan
so'ramasdan aytiladi; loyihani ro'yxatdan olish masalani yopadi; arizadan yoki
sahifadan chiqishda so'raladi. Test: `test/upload-fail.mjs` (16 tekshiruv).

### [x] B5 «Сбросить выбранные» — so'rovsiz, qaytarishsiz

`src/ui/prices.js:144-149` — **yuqori** · S

Tugma nomi «tanlanganlar» deydi, lekin belgilash yo'q: u **ekrandagi hamma**
resursni tashlaydi — filtr «Все» bo'lsa, butun arizaning narxlari va serverdagi
tuzatishlari o'chadi. Tasdiqlash yo'q, «Отменить» yo'q. Yonidagi «Применить %»
ham xuddi shunday (A7).

Reja: nomi «Сбросить показанные (N)»; N > 1 bo'lsa tasdiqlash; va — umumiy
yechim sifatida — narx o'zgarishlari uchun **bir bosqichli «Отменить»**:
ommaviy amaldan oldingi narxlar xotirada saqlanadi, xabar ichida 10 soniya
«Отменить» tugmasi turadi. Dasturda hozir hech qayerda qaytarish yo'q (B8).

**Bajarildi — v2.9.3, commit `636e26e`.** Tugma «Сбросить показанные»: faqat
smeta narxidan farq qiladigan narxlarga tegadi, nechtaligini aytib so'raydi.
«Сбросить», «Применить %» va «Автоподбор» dan keyingi xabarda 10 soniya
«Отменить» turadi — narxlar ham, qo'llangan narxning manbasi (taklif,
справочник, UZEX) ham qaytadi; faqat oxirgi ommaviy amal uchun. Brauzer testida
949 ta narx va ularning serverdagi yozuvlari to'liq qaytdi.

### [x] B6 Oldingi arizaning sozlamalari yangisiga o'tib ketadi

`src/ui/sync.js:224` (`Object.assign(app.opts, st.opts)`), yopishda `opts`
tozalanmaydi — **o'rta** · S

Bir arizada chegara, hisobot turi yoki eslatma matni o'zgartirilsa, undan
keyin ochilgan **yangi** ariza o'sha sozlamalar bilan boshlanadi (yangisida
saqlangan holat yo'q, standart qiymatlar esa qaytarilmagan). Chegara boshqa
bo'lsa — hisobotga tushadigan qatorlar ham boshqa.

Reja: ariza yopilganda `opts` ni standart qiymatga qaytarish; test: A da
chegara o'zgartiriladi, B ochiladi, B da standart turadi.

**Bajarildi — v2.9.3, commit `10bfc6a`.** Ariza o'zining saqlangan sozlamalari
bilan ochiladi (yo'q bo'lsa — standart), yopilganda standart qaytadi; hisobot
turi ham. Eslatma: oldin bir arizada o'zgartirilgan shtamp yoki eslatma matni
keyingisiga «o'tib» qolardi — endi har arizada alohida yoziladi.

### [x] B7 Holat 5 MB dan oshsa, ish maydoni boshqa saqlanmaydi

`src/ui/sync.js:321-322,351-357`, `src/ui/app.js:898-922`,
`src/ui/prices.js:144-148` — **o'rta** (kam uchraydi, lekin chiqish yo'q) · S–M

Holatda narxlar ikki marta saqlanadi (eski va yangi kalit — qoida bo'yicha),
har bir narxlangan resurs ≈ 196 bayt; cheklovga 27 mingga yaqin kalitda yetiladi.
Bitta smeta yetmaydi (haqiqiysi — cheklovning 2 %), lekin **narxlar kitobi**
yetadi: «Загрузить книгу цен» kitobning hamma qatorini, loyihada bor-yo'qligidan
qat'i nazar, holatga qo'shadi. 30 ming qatorli kitob bilan sinab ko'rildi:
server 400 qaytaradi, sahifa o'sha 5,9 MB so'rovni har 15 soniyada abadiy
takrorlaydi, keyin yozilgan hamma narx qayta yuklashda yo'qoladi, arizadan
chiqish rad etiladi. «Сбросить» kalitlarni o'chirmaydi — holat kichraymaydi.

Reja: faqat smeta narxidan farq qiladigan kalitlarni saqlash; tashlashda
kalitni o'chirish; kitobning loyihaga to'g'ri kelmagan qatorlarini alohida,
soni cheklangan joyda tutish; eski kalit nusxasida faqat yangi kalitdan
**farq qiladigan** yozuvlarni qoldirish (qaytish qoidasi saqlanadi); 400/413
ni takrorlamaslik va ruscha tushuntirish.

**Bajarildi — v2.9.4, commit `5f0451d`.** Holatga faqat smeta narxidan farq
qiladigan narx yoziladi (va vaqtincha o'chirilgan varaqning narxi; va narxlar
kitobida qatori bor resursga ekspert qaytargan smeta narxi — kitob uni qayta
bosib ketmasligi uchun). «Сбросить» dan keyin holatda narx qolmaydi.
Kitobning hech bir smetaga to'g'ri kelmagan qatorlari narxlar orasida emas,
alohida (`state.book`, `looseBook`) saqlanadi — 4 MB ga sig'ganicha; sig'magani
nechta ekanini sahifa aytadi, shu o'tirishda esa butun kitob ishlayveradi
(keyin qo'shilgan smeta undan narx oladi). Server rad etgan holat (400/413)
qayta-qayta jo'natilmaydi: sababi ruscha aytiladi, keyingi o'zgarish — keyingi
urinish, arizadan chiqish mumkin (so'rab). 30 ming qatorli kitob bilan sinov:
holat 3,9 MB, saqlandi (`test/state-size.mjs`). **Ataylab qilinmadi:** eski
kalit nusxasini qisqartirish — «qaytish ma'lumot yo'qotmaydi» qoidasi to'liq
saqlanishi uchun ikkala nusxa ham bir xil narxlarni olib yuradi (haqiqiy smeta
cheklovning 2 % idan kam).

### [x] B8 Qaytarib bo'lmaydigan amallar so'rovsiz

**o'rta** · S (har biri)

* Admin sahifasida «Отключить» o'z hisobingizga ham, yagona hisobga ham
  so'rovsiz qo'llanadi → bo'sh reyestr (`src/ui/admin.js:345-351`).
* Loyiha yonidagi «×» — so'rovsiz.
* «✓ Завершить» ni sahifadan qaytarib bo'lmaydi.
* Arizaning viloyatini keyin o'zgartirib bo'lmaydi.

Reja: birinchi ikkitasiga tasdiqlash (o'z hisobini o'chirishni taqiqlash);
«Завершить» uchun admin sahifasida «вернуть в работу».

**Bajarildi — v2.9.3, commit `10bfc6a` — birinchi ikkitasi.** «Отключить»
so'raydi va o'z hisobingizda rad etadi; loyihaning «×» i so'raydi (fayl
serverdan ham o'chishini aytib). **Qolgani (5-bosqich):** «Завершить» ni
qaytarish va viloyatni o'zgartirish.

### [ ] B9 Ofis tarmog'i rejimi (`lan.sh`) umuman zaxira olmaydi

`server/lan.sh`, `server/deploy/configure.sh:38-42` — **yuqori** (o'sha rejimga
o'tilganda) · S

Kunlik zaxira, so'rov cheklovlari va jurnal muddati faqat VPS o'rnatuvchisida
sozlanadi; noutbukning o'z zaxirasi `laptop.sh` da. `lan.sh` ikkalasini ham
chaqirmaydi: zaxira jadvali bo'sh, cheklovlar o'chiq. Admin sahifasi qizil
ogohlantirish ko'rsatadi, lekin zaxirani hech narsa olmaydi. Hozir bu rejim
ishlatilmayapti — ko'p foydalanuvchiga o'tishdan **oldin** tuzatiladi.

---

## C. Xavfsizlik va begona ma'lumot

Repozitoriya ochiq bo'lgani uchun bu bo'limda faqat **nima** va **qanday
tuzatiladi** yozilgan; takrorlash usullari va sinov fayllari repoga
qo'yilmadi — ular egasiga alohida berildi. → egasining qarori 5.

Uch toifa: **[bugun]** — bir kishilik noutbukda ham ahamiyatli ·
**[ko'pchilik]** — ikkinchi odam yoki tarmoq paydo bo'lganda ·
**[mustahkamlash]**.

### [ ] C1 Windows yangilanishi yuklab olganini tekshirmaydi — [bugun]

`server/laptop.ps1:94-95,805-818,848-889`, `server/install-windows.ps1:48-71`,
`server/get-pocketbase.sh:11-17` — **yuqori** · L (qisqa choralar — S)

Har 6 soatda noutbuk `releases.txt` ni o'qiydi, yangi versiya ZIP ini yuklab
oladi va ichidagi skriptni ishga tushiradi. Tekshiruv — faqat «ichidagi
versiya raqami to'g'rimi va skript javob beradimi»; ZIP xeshi ham, imzo ham
yo'q. Ya'ni shu shoxga yoza oladigan har kim (hisob, token, avtomatika) bir
necha soat ichida barcha noutbuklarda kod ishga tushira oladi. PocketBase
ikkilik fayli ham nazorat yig'indisisiz olinadi. Ro'yxat manzili **shox
nomiga** bog'langan (`laptop.ps1:95`) — shox qayta nomlansa yoki o'chirilsa,
hamma o'rnatma yangilanishdan jimgina to'xtaydi.

Bu — «repozitoriyani yopiq qilsak nima bo'ladi» savolining ham javobi: hozirgi
kanalda yopiq repo bir qatorli o'rnatishni va **barcha** Windows
noutbuklarining yangilanishini jimgina to'xtatadi (ishlab turgan versiya
ishlayveradi); Mac `update` parol so'raydi.

Reja (L): «manba qayerda» va «relizlar qayerda e'lon qilinadi» ni ajratish.
Tayyor ZIP va ro'yxat (`vX.Y.Z <zip ning sha256 i> <manzil>`) alohida ochiq
joyda turadi; ro'yxat GitHub'da hech qachon turmaydigan kalit bilan
imzolanadi, ochiq kalit `laptop.ps1` ichida. Tartib: imzo → yuklash → xesh →
shundan keyingina ochish va `selftest`. O'tish: hozirgi kanal orqali oxirgi
bitta reliz, uning ishga tushirgichi yangi ro'yxatni o'qiydi; eski
`releases.txt` shu relizda muzlaydi. Hamma noutbuk o'tgach, manba repo yopiq
bo'lishi mumkin. Buyruq qatori kelishuvi o'zgarmaydi; `test/laptop-windows.sh`
ikkala kanalni qamraydi.

Qisqa choralar (S, hoziroq): shox va standart shoxda himoya (force-push
taqiqi), hisobda ikki bosqichli kirish; ro'yxatda faqat to'liq 40 belgili
xesh qabul qilish; PocketBase ZIP ining sha256 ini qotirish; ro'yxat manzili
uchun zaxira yo'l (shox nomi → `HEAD`).

Bajarildi (2026-11-11, egasi, kodsiz): hisobda ikki bosqichli kirish; asosiy
shox `claude/excel-price-validation-5ehbvb` ga ruleset — o'chirish va
force-push taqiqlangan (GitHub API: `deletion`, `non_fast_forward`). Pull
request va status-check talabi ataylab yoqilmagan: relizlar shu shoxga
to'g'ridan-to'g'ri yoziladi. Qolgani (40 belgili xesh, PocketBase sha256,
zaxira manzil) — kod, 6-bosqich bilan.

### [x] C2–C5 Begona fayl va begona sahifa — [bugun]

| № | Nima | Jiddiylik | Tuzatish | Hajm |
|---|---|---|---|---|
| C2 | Maxsus tayyorlangan kichik `.xlsx` o'qishni soatlab band qiladi yoki xotirani to'ldiradi; ish maydonida u avval saqlanadi va keyingi har bir ochishni buzadi — `src/lib/xlsx-read.js:42,83-84,154`, `src/ui/sync.js:53,117` | o'rta | ZIP ichidagi fayl hajmiga cheklov; uchta qidiruvni chiziqli qilish; javob bermagan worker'ni N soniyada to'xtatish; faylni **o'qilgandan keyin** yuklash. Test: `test/xlsx-guard.cjs` | M |
| C3 | Smetadagi formula eksport hujjatiga **qanday funksiya chaqirishidan qat'i nazar** tirik ko'chadi (tashqi manzilga murojaat qiladiganlari ham) — `src/lib/assemble.js:87,206-214`, `src/lib/report.js:171-173` | o'rta | Faqat qisqa ro'yxatdagi funksiyali formulani ko'chirish (SUM, ROUND, IF, MIN, MAX…), qolganida keshlangan qiymat. O'lchov: ikkala haqiqiy smetadagi 1 376 formulada faqat `SUM` va boshqa varaqqa `VLOOKUP` (u allaqachon qiymat bilan almashtiriladi) — ya'ni haqiqiy hujjatlarda **hech narsa o'zgarmaydi**. → egasining qarori 4 | S |
| C4 | UZEX sahifasini o'quvchi buzuq sahifada kvadratik vaqt sarflaydi; hafta, qator va sahifa hajmiga cheklov yo'q; har ishga tushishda o'zi boshlanadi va to'xtatib bo'lmaydi — `server/pb_hooks/lib/uzex.js:33,95-138,165-179,251-317` | o'rta | Sahifa va katak hajmiga cheklov; teglarni chiziqli tozalash; bir sinxronlashda haftalar va qatorlar soni hamda umumiy vaqt chegarasi; yo'naltirishlarga ergashmaslik | S–M |
| C5 | Kod nuqtasi chegaradan katta belgi havolasi butun kitobni o'qilmas qiladi — `src/lib/xlsx-read.js:23` | past | Chegara tekshiruvi (bir qator) | S |

Yaxshi xabar (C4 sinovida tasdiqlandi): hafta to'liq yoziladi yoki umuman
yozilmaydi; begona matn sahifalarda xavfsiz ko'rsatiladi.

**Bajarildi — v2.9.4.**

* **C2, C5 — commit `a80f70f`.** Uchta qidiruv bir o'tishli bo'ldi; ZIP ichidagi
  har bir qism 120 MB, hammasi 360 MB dan oshsa — fayl ochilmaydi va sababi
  aytiladi; 90 soniya javob bermagan o'quvchi to'xtatiladi, navbatdagi fayl
  o'qiladi; fayl serverga **o'qilgandan keyin** yuklanadi (smeta bo'lmagan
  kitob umuman yuklanmaydi); kod nuqtasi chegarasi tekshiriladi. 51 ta haqiqiy
  kitob katakma-katak avvalgidek o'qildi. Test: `test/xlsx-guard.cjs`.
* **C3 — commit `5146715` (egasining qarori 4: «ha»).** Smetaning formulasi
  faqat ruxsat etilgan oddiy funksiyalardan iborat bo'lsa tirik ko'chadi
  (`src/lib/formula.js`, `S.formula.unsafe`); aks holda smeta ko'rsatgan qiymat
  yoziladi va sahifa nechta ekanini aytadi. Haqiqiy smetalarda bunday formula
  0 ta — eksport bayt-bayt bir xil.
* **C4 — commit `6e7b3e9`.** Sahifa 8 MB, ro'yxat 60 hafta, hafta 5000 qator,
  katak 4000 belgi, bir sinxronlashda 12 ta yangi hafta va 4 daqiqa; teglar bir
  o'tishda tozalanadi; yopilmagan element — xato, osilish emas. Haqiqiy ikki
  sahifa avvalgidek o'qildi. **Qilinmadi:** yo'naltirishlarga ergashmaslik —
  PocketBase ning `$http.send` ida bunday sozlama yo'q; manzil baribir
  `UZEX_BASE` bilan qat'iy belgilangan.

### [ ] C6–C9 Ikkinchi odam paydo bo'lganda — [ko'pchilik]

Hozir dasturni bir kishi ishlatadi, shuning uchun bular bugun xavf emas —
lekin `lan.sh` yoki VPS ga o'tishdan **oldin** yopilishi shart.

| № | Nima | Jiddiylik | Tuzatish | Hajm |
|---|---|---|---|---|
| C6 | Yozuvlar API si orqali yozilgan tuzatish istalgan viloyat, ariza, ish maydoni va qidiruv kalitini ko'tara oladi (ommaviy yo'l bularni serverda hisoblaydi, yakka yo'l — yo'q) — `server/pb_schema.json` (corrections), `server/pb_hooks/lib/corrections.js:54` | yuqori | `corrections` ga to'g'ridan-to'g'ri yozishni yopish (sahifa faqat ommaviy yo'ldan yozadi) yoki maydonlarni `checkRecord` da qayta hisoblash | S |
| C7 | Har qanday ekspert ish maydonini «kim ochgan» va «qaysi arizaga tegishli» ni qayta yoza oladi — `server/pb_hooks/lib/ownership.js:6` | o'rta | Yangilashda `opened_by` va `application` ni asl qiymatiga qaytarish | S |
| C8 | Har qanday ekspert istalgan tuzatishni o'chira oladi, iz qolmaydi | o'rta | O'chirish faqat ommaviy yo'l orqali + jurnal (kim, qaysi ish maydoni) | S |
| C9 | Kirish kodini qayta-qayta so'rab, hamkasbni kiritmaslik yoki kunlik pochta limitini tugatish mumkin | o'rta | Bir manzilga 10 daqiqada bir necha so'rov; eski kodlarni tashlash | S–M |

B3 (ikki kishi — bitta ariza, 409) va B9 (`lan.sh` zaxirasi) ham shu ro'yxatga
kiradi.

### [?] C10 Noutbukdagi avtomatik kirish — egasining qarori, chegarasi bilan

`server/pb_hooks/laptop.pb.js:23-41`, `server/pb_hooks/lib/laptop.js:19-27`

`CLAUDE.md` da yozilgan qaror tekshirildi. **Veb-sahifalarga qarshi himoya
ushlaydi**: boshqa port, boshqa nom, ramka, yo'naltirish, DNS almashtirish —
haqiqiy brauzerda hech biri token ololmadi. Chegarasi: bu himoya **dasturlarga**
qarshi emas — shu kompyuterdagi har qanday dastur yoki boshqa foydalanuvchi
hisobi administrator tokenini oladi. Kirish oynasi qaytarilguncha taklif yo'q;
`lib/laptop.js:24-25` dagi `Origin` taqqoslashi **bo'shashtirilmasligi** kerak —
butun himoya shu.

### [ ] C11 Mustahkamlash (past)

* Sahifalarda Content-Security-Policy yo'q; sessiya tokeni `localStorage` da.
  In'eksiya topilmadi — bu faqat ikkinchi qavat.
* Ekspert omborni to'ldira oladi: cheksiz `exports` (har biri 100 MB gacha).
* `POST /api/admin/reset` bitta tranzaksiya emas (sarlavhasida shunday deyilgan
  bo'lsa ham) — `server/pb_hooks/admin.pb.js:208-239`.
* O'rnatishda superuser paroli buyruq qatorida ko'rinadi (`server/setup.sh:10`).
* `server/deploy/gmail-relay.gs:16` da ochiq «namuna» kalit; skript uni rad
  etmaydi.
* So'rovlar jurnali 5 kun saqlanadi (VPS da 14) — C6–C8 ning yagona izi shu.
* Zaxira ZIP i butun bazani ochiq holda saqlaydi (parol xeshlari, sozlamalar)
  va Google Drive ga shu holda ketadi.

---

## D. «Сравнение версий» va «Наш ответ»

Haqiqiy v1 → v2 juftligida natija to'g'ri. Quyidagilar sun'iy fayllarda topildi.

### [ ] D1 Varaqlar va qatorlarni juftlash

`src/lib/compare.js:102-150,227-238,293` — **o'rta** · M

(a) Varaqlar nom bo'yicha topilmasa **o'rin bo'yicha** juftlanadi — o'rtaga
yangi varaq qo'shilsa, keyingilari bir-birining juftini «o'g'irlaydi».
(b) Nomi o'zgargan qatorlarni juftlashda raqamlar ziddiyati hisobga olinmaydi
(«М5» qatori «М8» bilan juftlanishi mumkin — «raqamlar yo'qolmaydi» qoidasiga
zid). (c) Boshqa bandga ko'chirilgan qator «o'chirildi + qo'shildi» bo'lib
chiqadi va o'chirilgani «erishilgan tejam» ga qo'shiladi.

Reja: (a) o'rin bo'yicha juftlashni faqat varaqlar soni teng bo'lganda
qoldirish, aks holda «лист без пары» deb ko'rsatish; (b) raqamlari zid
juftlikni rad etish — `match.js` dagi mavjud tekshiruvdan foydalanib,
bahoga tegmasdan; (c) ko'chgan qatorni butun kitob bo'yicha qidirish.

### [ ] D2 «Наш ответ (Excel)» ni o'qish

`src/lib/reply.js:70,102-112` — **o'rta** · S–M

O'lchov birligi yo'q qatorda narx shu nomli **bir necha** birlikka tushadi;
eng yaqin nom bo'yicha zaxira qidiruv raqamlarni e'tiborsiz qoldiradi; faqat
jadvali bor birinchi varaq o'qiladi; matn ko'rinishidagi sonlar o'qilmaydi.

Reja: birliksiz qatorni faqat nom bitta birlikda uchrasa qo'llash, aks holda
«не применено: N» ro'yxatiga; zaxira qidiruvga raqam tekshiruvi; hamma
varaqlar; `S.num` (A5 dan keyin).

### [ ] D3 «Итоги листов»

`src/lib/compare.js:54-57,200-221` — **past–o'rta** · S

Ustidan yozilgan umumiy jami faqat «info» darajasida; `samePrice` bardoshligi
(1 so'm) juda katta miqdorda sezilarli summani yashiradi.

Reja: bardoshlikni narxga emas, **summaga** nisbatan olish; ustidan yozilgan
jamini «внимание» darajasiga ko'tarish.

---

## E. Qulaylik

112 ta ekran surati va har bir tugmani bosib ko'rish asosida.

### Xatolar

| № | Nima | Jiddiylik | Tuzatish | Hajm |
|---|---|---|---|---|
| E1 ✓ v2.9.3 | Yon paneldagi «–» tugmasi sahifani 0 kenglikka yig'adi, qaytarish yo'li yo'q (faqat qayta yuklash) — `src/app.css:89-90`, `src/ui/app.js:101-102` | o'rta | Yig'ilganda ingichka tasma va «+» qoladi | S |
| E2 ✓ v2.9.3 | Bitta `#toast`: xabarlar 10–400 ms ichida bir-birini almashtiradi, xato xabari ma'lumot xabari ostida yo'qoladi (B4 ning sababi) — `src/ui/app.js:272-279` | o'rta | Navbat; xato xabari yopilmaguncha turadi | S |
| E3 | Taklif oynasi uni ochgan bosishning o'zida yopiladi; `Esc` yozilayotgan narxni o'chiradi — `src/ui/hints.js:73-90`, `src/ui/prices.js:114-117` | past | Bosishni bir kadrga kechiktirish; `Esc` avval oynani yopadi | S |
| E4 | Taklifni qo'llash ro'yxatni boshiga aylantiradi — `src/ui/hints.js:299` | past | Joyni saqlash (`apply(true)`) | S |
| E5 | 1366 kenglikda «Сводная таблица» kesiladi, sarlavha gorizontal aylantirishga ergashmaydi; «Цены» da 15 qator ko'rinadi (UZEX bilan 13), nom ustuni 320 px — nomlarning 42 % i kesilgan | o'rta | Ixcham rejim: kichikroq qator, kengayadigan nom ustuni, yopishqoq sarlavha | M |
| E6 | Tejam qatorlarda qizil, jamida yashil | past | Bitta qoida hamma joyda | S |
| E7 | Tushunarsiz xatolar: buzuq `.xlsx` baribir yuklanadi; UZEX ulanish xatosi xom holda; «email: Value must be unique» | past | Ruscha, nima qilish kerakligi bilan | S |
| E8 | Bitta-fayl sahifasi o'zida yo'q manbalar filtrini ko'rsatadi | past | Server yo'q bo'lsa yashirish | S |
| E9 | Til aralash: «Ichki/Eksport», xom rol nomlari, `changed` | past | Interfeys ruscha — bitta lug'at | S |

### QQS (НДС) hech qayerda aytilmaydi

Faqat UZEX oynasi narx QQSsiz ekanini aytadi. «Цена по смете», «Рыночная
цена», takliflar, справочник oynasi, hisobot va eksport — jim. v2.9.1 dan
keyin bu muhim: mijoz narxlar **QQSsiz** bo'lishini talab qilgan.

| № | Taklif | Hajm |
|---|---|---|
| E10 | Ustun sarlavhalari: «Цена по смете, без НДС», «Рыночная цена, без НДС» (faqat ekran) | S |
| E11 | Qo'lda yozilgan narx smeta narxidan roppa-rosa ×1,12 bo'lsa — yumshoq ogohlantirish «похоже на цену с НДС» va «÷ 1,12» tugmasi | S |
| E12 | «Прежние проекты» va справочник oynasida QQS holati (справочник uchun `src/lib/refs` ko'rinishiga tegadi — parity o'lchovi bilan) | M |
| E13 | Eksport hujjatida QQS haqida satr — `321.xlsx` ko'rinishiga bog'liq → egasining qarori 1 | S |

### Yaxshilashlar

| № | Taklif | Nega | Hajm |
|---|---|---|---|
| E14 | «Проверено» belgisi va jarayon ko'rsatkichi («проверено 212 из 541») | Ekspert qayerda to'xtaganini eslab yurmaydi | M |
| E15 | Bo'lim bo'yicha filtr (materiallar, mashinalar, uskunalar…) | Bo'limlar allaqachon aniqlanadi, lekin filtrda yo'q | S |
| E16 | Narx manbasi belgisi справочник va «Прежние проекты» uchun ham — UZEX dagi «U» kabi | Narx qayerdan kelgani bir qarashda ko'rinadi | S |
| E17 | Resursga izoh → «Eslatma» ustuniga (sozlama, standart holatda o'chiq) | Nega shu narx qo'yilgani hujjatda qoladi | M |
| E18 | Klaviatura oqimi: qo'llagandan keyin fokus keyingi qatorga; taklifni bitta tugma bilan qabul qilish | Hozir har bir taklifga 2 bosish va fokus yo'qoladi | S–M |
| E19 | Yuklab olinadigan fayl nomida ariza raqami va kontragent | Talabda bor (F8) | S |
| E20 | Server o'chganda tushunarli holat (hozir faqat «!») | Noutbuk rejimida «server ishlamayapti — ishga tushiring» | S |

---

## F. Avtomatlashtirish va yetishmayotgan imkoniyatlar

### Qo'l mehnatini kamaytirish

| № | Taklif | Izoh | Hajm |
|---|---|---|---|
| F1 | Aynan shu kontragentning aynan shu resursi uchun oldingi narxni **bir tugma bilan hammasiga** taklif qilish | «Taklif faqat „Применить“ bosilganda qo'yiladi» qoidasi saqlanadi: bitta ro'yxat, bitta tasdiqlash → egasining qarori 3 | M |
| F2 | Viloyatni kontragent bo'yicha oldindan tanlash | Oldingi arizalardan | S |
| F3 | «Наш ответ» uchun saqlangan eksportni taklif qilish | Hozir fayl diskdan so'raladi, holbuki eksportlar serverda turadi | S |
| F4 | Tugallangan ariza qatorida «Сравнить версию» | Qaytgan smetani bir bosishda solishtirish | S |
| F5 | UZEX haftasini arizaning ro'yxatga olingan sanasi bo'yicha tanlash | Hozir qo'lda → egasining qarori 7 | S |
| F6 | Ochiq sahifa server versiyasi o'zgarganini bilib, «обновите страницу» deyishi | Hozir yangilanishdan keyin eski sahifa yangi server bilan ishlayveradi | S |
| F7 | Reliz skripti: versiya, qurish, testlar, `releases.txt`, `versiyalar.md` — bitta buyruq va tekshiruvlar | Hozir 6 qadam qo'lda; `releases.txt` 14/14 to'g'ri, lekin faqat ehtiyotkorlik hisobiga | M |

### [ ] F8 `docs/2-bosqich-reja.md` dagi bajarilmagan talablar

* `kuzatuvchi` (faqat o'qish) roli.
* Amallar jurnali (kim, qachon, nimani o'zgartirdi) — C8 bilan birga.
* Zaxiradan tiklash sahifada / buyruqda va uning sinovi — B1.
* «Narxlar xotiraga loyiha yakunlanganda tushadi» — hozir har bir yozishda
  tushadi; tugallanmagan arizaning narxi ham boshqalarga taklif qilinadi.
* Ro'yxatda QQSsiz summa ustuni.
* Eksport nomida ariza raqami / kontragent — E19.

Bularning har biri ko'p foydalanuvchiga o'tishda kerak bo'ladi; bir kishilik
rejimda faqat B1 va E19 shoshilinch.

---

## G. Ishga tushirgichlar va yangilanish

### [ ] G1 Mac o'zi yangilanmaydi

`server/laptop.sh` (`update`) — **o'rta** · M–L

`laptop.sh update` — bu `git pull`. Nusxalab o'rnatilgan papkada (hozirgi Mac
aynan shunday) u ishlamaydi, shuning uchun har bir reliz qo'lda, olti qatorli
buyruq bilan o'rnatiladi. Ustidan nusxalash o'chirilgan fayllarni qoldiradi
(hozircha o'chirilgan hook yo'q — lekin birinchi o'chirilgani eski holda
ishlab qolaveradi).

Reja: Mac'ga ham Windows'dagi tartib — `releases.txt` dan o'qish, ZIP ni
yuklash, tekshirish, har versiya o'z papkasida, ko'rsatkich sinovdan keyin
o'zgaradi, `rollback`. C1 dagi yangi kanal bilan **birga** qilinadi (bir xil
tekshiruv, ikki ishga tushirgich).

### [ ] G2 Mac: nosozlik holatlari

`server/laptop.sh` — **past–o'rta** · S (har biri)

* `start` ostida server qulasa, qayta ishga tushmaydi.
* `serve.log` har ishga tushishda boshidan yoziladi — oldingi qulash sababi
  yo'qoladi.
* `serve` ostida port band bo'lsa, xabar «parol mos kelmayapti» deydi.

### [ ] G3 Windows yangilanish mexanizmi — o'qib topilgan xavflar

`server/laptop.ps1` — **o'rta** · M · *faqat o'qildi, Windows'da ishga
tushirilmadi*

* Umumiy ma'lumot (`pb_data`) versiya bilan birga orqaga qaytmaydi — yangi
  versiya sxemani o'zgartirib, keyin `rollback` qilinsa, eski kod yangi baza
  bilan qoladi.
* «Port band» siklida har urinish yangi zaxira oladi va eskilarini siqib
  chiqaradi.
* Xeshi noto'g'ri reliz abadiy qayta uriniladi.
* Qulf fayl yoshi bo'yicha — soat o'zgarsa adashadi.
* `C:\Smeta` dagi eski ishga tushirgich hech qachon almashtirilmaydi
  (kelishuv aynan shuning uchun bor — lekin undagi xato ham abadiy qoladi).
* `doctor` chiqishida `supervisor.log` va `update.env` yo'q.

Reja: har birini `test/laptop-windows.sh` da stsenariy sifatida takrorlash,
keyin tuzatish. Versiyalar orasidagi kelishuv o'zgarmaydi.

### [ ] G4 Kichikroqlari

* VPS `rollback.sh` yangi versiyaning hook'larini qoldiradi (masalan UZEX
  cron'lari eski sahifa bilan ishlayveradi) — S.
* Har bir «Скачать» bosilishi faylni serverda ham saqlaydi; muddat yoki son
  cheklovi yo'q — ombor va har bir zaxira ZIP i to'xtovsiz o'sadi. Reja:
  ish maydoniga oxirgi N ta eksport — S.
* Ochiq sahifa server yangilanganini bilmaydi — F6.

---

## H. Testlar va kodni yuritish

### [ ] H1 Uchta «doim qizil» test — testning o'z nuqsoni

**o'rta** · M

| Test | Nega qizil | Dasturda xato bormi |
|---|---|---|
| `hints` | Har bir smeta alohida 92 % va 90 % beradi (chegara o'tadi); **ikkalasi birga** berilganda 83 %. v2.5.1 dan beri ikkinchi fayl (4А) ham o'qiladi, va o'lchov bir smetaning narxini ikkinchisiniki bilan solishtiradi — bu boshqa savol. Yana: taklif umuman bo'lmasa ham «o'tadi» (`ok NaN %`) | yo'q |
| `browser` | Bitta aniq resurs nomiga bog'langan (`test/browser.mjs:45-56`); o'sha nom faylda bo'lmasa yiqiladi. Natijani tekshirmaydi — faqat chop etadi | yo'q |
| `e2e-hints` | «Imlo xatosi» sinovi tinish belgisini tashlaydi (bu xato emas — boshqa nom); «bir marta baholandi» sinovi resurslar sonini juftliklar soni bilan solishtiradi; standart kirish fayli yo'li yo'qolgan | yo'q |

Reja: `hints` — har fayl uchun alohida chegara va «taklif yo'q = yiqilish»;
`browser` — birinchi mavjud resurs bilan va haqiqiy tekshiruvlar bilan;
`e2e-hints` — harf almashtiradigan xato, to'g'ri hisob. **NLP jadvallari va
o'xshashlik bahosiga tegilmaydi** — o'zgaradigani faqat testlar.

### [ ] H2 Test serverlari testdan keyin tirik qoladi

`test/server.mjs` — **o'rta** · S–M

Server `SIGTERM` bilan to'xtatiladi, lekin chiqishi kutilmaydi; test o'ldirilsa
server yetim qoladi. Keyingi test `pb_data_test` ni o'chirayotganda eski
server hali yozib turadi — vaqti-vaqti bilan yiqiladigan testlarning (masalan
`upload-order`) sababi shu.

Reja: band portni rad etish, bola jarayon tirikligini tekshirish, chiqishini
kutish, har port uchun o'z ma'lumot papkasi.

### [ ] H3 To'plam natijasi hech narsani anglatmaydi → CI

**o'rta** · S–M

Uchta test doim qizil bo'lgani uchun `test/all.sh` ning chiqish kodi doim
«xato» — to'rtinchi, haqiqiy xato ko'rinmay qoladi. H1 va H2 dan keyin:
to'plam yashil bo'lishi shart, va har bir push'da GitHub Actions'da ishlaydi
(maxfiy to'plamsiz 30 ta test ≈ 3,5 daqiqa; ochiq repo uchun bepul). Reliz
commit'i qizil to'plam bilan o'tmaydi (F7).

### [ ] H4 Qamrovdagi bo'shliqlar

Bu tekshiruvdagi har bir yuqori darajali topilma — test yo'q joyda:

* eksportni qayta o'qib **formulalarini hisoblaydigan** test (A1, A2);
* worker natijasi = `parseWorkbook` natijasi (A3);
* ikki vkladka, yuklash xatosi, sekin tarmoqda yopish (B2–B4);
* «Книга цен» (`savePriceBook`, `bookFromXlsx`) — umuman testsiz;
* admin sahifasining o'chiruvchi tugmalari — sahifa orqali;
* `laptop.sh` buyruqlari va zaxiradan tiklash (B1);
* `uzex-catchup` cron'i; xato yo'llari (server 400/413/500 qaytarganda sahifa).

### [ ] H5 Takrorlangan kod

`src/ui/uzex.js` ↔ `src/ui/refs.js` — **past** · M

71 ta bir xil qator, 19 ta bir xil nomli funksiya (oyna, teg, filtr, holat
matni). Bitta umumiy «manba ko'rinishi» moduliga chiqarish mumkin. Xavf:
справочник interfeysiga tegadi — `e2e-refs` va `e2e-uzex` bilan. Shoshilinch
emas; uchinchi narx manbai qo'shilishidan **oldin** qilinadi.

### [ ] H6 README eskirgan

Tuzilma va buyruqlar bo'limi bir necha versiya orqada — S.

### [~] H7 `dist/` ni git'dan olib tashlash — rad etildi

Tekshirildi: siqilgan klon 4,3 MiB, `dist` har relizda aynan qayta quriladi
(14 ta relizdan 14 tasi `releases.txt` bilan mos), va Windows o'rnatmasi
Node'siz aynan shu fayllarni oladi. Joyida qoladi.

---

## I. Tezlik

Haqiqiy brauzerda o'lchandi (4 yadro; median 3–5 urinish). **Tez — tegilmaydi:**

| Amal | Haqiqiy smeta (541 resurs, 2,5 mingga yaqin qator) | Sun'iy: 5 ming resurs, 50 ming qator |
|---|---|---|
| Sahifa ochilishi | 0,17 s (kirgan holda 0,32 s) | — |
| Smetani o'qish (worker'da) | 0,76 s; asosiy oqim 54 ms band | 1,3 s; bir marta 0,6 s qotadi |
| Narx yozish: tugma → ekran | 5–7 ms | 7–10 ms |
| Filtr / saralash / qidiruv | 1–8 ms | 7–15 ms |
| «Применить %» hammasiga | — | 34 ms; serverga 4,6 s da yoziladi |
| Eksport | 0,17–0,24 s | 3,6–7,3 s (faqat sun'iy hajmda) |
| UZEX haftasi (1 300 kotirovka) | 1,1 s | — |
| Справочник, issiq ishga tushish | 2,6 s | — |

Sinxronlash sinovlari: aloqa uzilishi va server o'ldirilishidan keyin qayta
urinish **hech narsa yo'qotmaydi**, SQLite butun qaytadi.

### [ ] I1 «Похожие» takliflari: arxiv o'sgan sari har ochishda yuzlab so'rov

`src/ui/hints.js:95-98,191-239` — **past** (bugun), **o'rta** (arxiv o'sganda) · S–M

Viloyatda 50 ming ta tuzatish bo'lganda (sun'iy to'ldirildi) haqiqiy smetani
har ochishda 205 ta so'rov ketadi: 25 MB JSON, tarmoq 12,6 soniya band. Shu
payt saqlash ham navbatda kutadi (5 000 resursli faylda «✓» 20 soniyadan
keyin yondi). Hech bir taklif noto'g'ri emas — faqat kech keladi. Sabab:
hovuz har `ws:open` / `ws:close` da tashlanadi va har safar boshidan
yig'iladi; to'lib ketgan bo'lakning yuklangan sahifasi tashlab yuboriladi.

Reja: hovuzni sessiya davomida viloyat bo'yicha saqlash; keyingi ochishda
faqat yangi yozuvlarni so'rash; to'lgan bo'lak sahifasini tashlamaslik;
faqat kerakli maydonlarni so'rash. Baho va tartibga **tegilmaydi** —
nomzodlar o'sha-o'sha; `test/hints.cjs` aynan oldingi raqamlarni berishi shart.

`[~]` «`LIKE` o'rniga diapazon so'rovi» taklifi o'lchandi va rad etildi:
109 ms → 104 ms, farq yo'q.

### [ ] I2 Справочник worker'i xotirasi kod izohidagidan ancha ko'p

`src/ui/refs.js:29-34`, `src/refs-worker.js:186-208` — **past** · S / L

Hozirgi paket bilan sovuq ishga tushish 19 soniya va cho'qqida 1,1 GB; ish
maydoni ochiq turganda +0,3–0,5 GB. Koddagi izoh «+600 MB, keyin +170 MB»
deydi — u kichikroq paketda o'lchangan. 8 GB li noutbukda bu eng katta
iste'molchi; 4 GB da sovuq tayyorlash vkladkani o'ldirishi mumkin. Asosiy
oqimga ta'sir yo'q (yozish odatdagidek).

Reja: (S) izohni yangilash va birinchi ishga tushishni ochiq aytish («первый
запуск: ~20 с»); (L) tayyorlashni admin sahifasida, paket yuklanayotganda
bir marta bajarib, tayyor hovuzni paket yonida saqlash — hech bir ekspert
brauzeri 14 soniya / 1 GB to'lamaydi. `src/lib/refs` qoidalari o'zgarmaydi;
`test/refs-parity.cjs` aynan oldingi natijani berishi shart.

### [ ] I3 Mayda

* Sahifa siqilmasdan beriladi: 1,35 MB (gzip bilan 0,41 MB). Noutbukda
  ahamiyatsiz; VPS da — teskari proksida gzip yoqish (S).
* Kirishdan keyin ikki so'rov ikki marta ketadi — `src/ui/registry.js:78-80` (S).

---

## Tekshirildi — joyida

Quyidagilar sinab ko'rildi va **ushlaydi**; qayta taklif qilinmasin.

**Hujjat.** `CLAUDE.md` dagi to'qqizta qoida; «Только изменённые» va «Без
повторов» turlarida eksport → qayta o'qish → hisoblash; haqiqiy fayllarda
tashlab ketilgan yoki ikki marta o'qilgan qator yo'q; chegara qiymatining
o'zida xulq to'g'ri; g'alati tuzilgan kitoblar dasturni yiqitmaydi; `=`, `+`, `-`, `@` bilan boshlangan
nom va eslatmalar eksportda **matn** bo'lib yoziladi, formula emas.

**Server.** Kirmagan odam hech narsa o'qiy olmaydi va yoza olmaydi; ekspert
admin ishlarini qila olmaydi (rol, foydalanuvchilar, reyestr, paketlar, UZEX);
`by` / `updated_by` ni server qo'yadi; maxfiy maydonlar bo'yicha filtr rad
etiladi; kirish kodini topish — 4 urinishdan keyin to'siq; «Отключить» dan
keyin eski token ishlamaydi (2-tekshiruv tuzatishi joyida); HTML/SVG fayllar
rad etiladi, yo'l bo'ylab chiqish (`../`) ishlamaydi; noma'lum narx manbasi
«typed» bo'lib saqlanadi; bir vaqtdagi ikki ommaviy yozuvdan biri butunlay
rad etiladi — yarim yozilgan narsa yo'q.

**Sahifalar.** In'eksiya sinovi: resurs nomi, birlik, varaq nomi, fayl nomi,
reyestr maydonlari, foydalanuvchi ismi, saqlangan holat, UZEX matnlari —
hech qayerda bajarilmadi. Avtomatik kirish veb-sahifalarga token bermaydi
(C10).

**Maxfiylik.** Repoda va tarixida `.env`, baza, paket, kalit yo'q; test
rejimi (`dev-otp`) tasodifan yoqilib qolmaydi; справочник paketi yuklanayotganda
sha256 va hajm tekshiriladi.

**Relizlar.** `releases.txt` 14/14 mos; `dist` aynan qayta quriladi; zaxira
ZIP i bo'sh papkaga ochilganda ishlaydigan server beradi.

## Tekshirilmadi — va nega

* `321.xlsx` namunasi bu sessiyada yo'q edi — eksport ko'rinishi faqat mavjud
  testlar orqali tekshirildi, namunaga ko'z bilan solishtirilmadi.
* Excel'ning o'zi (C3 dagi formulani ochganda nima qilishi; aylanma havola
  ogohlantirishi) — bu yerda Excel yo'q; formulalar mustaqil hisoblagich bilan
  tekshirildi.
* Firefox va Safari — faqat Chromium.
* Windows ishga tushirgichi o'qildi, lekin haqiqiy Windows'da yurgizilmadi;
  yangilanish kanaliga hujum **sinab ko'rilmadi**. VPS skriptlari va `lan.sh`
  ishga tushirilmadi.
* Ishonchlilik yo'nalishi oxirigacha yetmadi (hisob limiti): 20 marta
  «yopish-ochish» dan keyin sahifadagi elementlar 1 133 → 1 984 ga, jarayon
  xotirasi 595 → 833 MB ga o'sgani ko'rindi — **sababi aniqlanmadi**; uzoq
  (ko'p soatlik) sessiya o'lchanmadi.
* `server/pb_hooks/lib/corrections.js:110-113` da gumon qilingan poyga
  (tranzaksiyadan tashqari o'qish) takrorlanmadi.
* Bosma ko'rinish (qog'ozga chiqarish) tekshirilmadi.

---

## Tavsiya etilgan tartib

Har bir bosqich — alohida reliz, har bir band — alohida commit, har biridan
keyin `test/all.sh`. Avval **test yoziladi va xatoni ko'rsatadi**, keyin
tuzatiladi (2-tekshiruvdagi tartib).

| Bosqich | Maqsad | Bandlar | Taxminan |
|---|---|---|---|
| 1 · v2.9.2 ✓ | Hujjat to'g'ri chiqsin | A1, A2, A3, A4, A8 + hisoblaydigan eksport testi | 3 kun |
| 2 · v2.9.3 ✓ | Hech narsa yo'qolmasin | B1, B5 (+«Отменить»), B3 (vkladkalar), B4, B6, B8, E1, E2 | 4 kun |
| 3 · v2.9.4 ✓ | Begona fayl va chetdagi holatlar | C2, C3, C4, C5, A5, A6, B2, B7 | 3–4 kun |
| 4 | Testlar yashil va avtomatik | H1, H2, H3, H4 (qolganlari), F7 | 3 kun |
| 5 · v2.10.0 | Qulaylik va QQS | E10–E12, E3–E9, E14–E20, F1–F6, A7, D1–D3 | 5–6 kun, bo'lib-bo'lib |
| 6 · v2.11.0 | Xavfsiz yangilanish, Mac o'zi yangilanadi | C1, G1, G2, G3 — shundan keyin repo yopiq bo'lishi mumkin | 5 kun |
| 7 | Ikkinchi odam qo'shilishidan oldin | C6–C9, B3 (server), B9, F8, G4, I1 | 5 kun |

Nega shu tartib: 1 — hujjat mijozga ketadi, undagi noto'g'ri jami eng qimmat
xato; 2 — ma'lumot yo'qolishi qaytarilmaydi; 3 — begona fayl har kuni
ochiladi; 4 — qolgan hamma ish yashil to'plamga tayanadi; 5–7 — qiymati
katta, lekin kechiktirish hech narsani buzmaydi. C1 ning **qisqa choralari**
(shox himoyasi, ikki bosqichli kirish) bosqich kutmaydi — egasi bugun qila
oladi.

## Egasi hal qiladigan savollar

1. **Eksportda QQS.** Hujjatga «narxlar QQSsiz» satri qo'shilsinmi? `321.xlsx`
   ko'rinishini o'zgartiradi (E13).
2. **«Применить %»** qo'lda yozilgan narxlarni o'tkazib yuborsinmi? (A7)
3. **Ommaviy taklif**: aynan shu kontragentning oldingi narxlarini bitta
   ro'yxat va bitta tasdiqlash bilan qo'yishga ruxsatmi? (F1)
4. **Formulalar ro'yxati**: smetadan faqat xavfsiz funksiyali formulalar tirik
   ko'chsin, qolgani son bo'lib — rozimisiz? Haqiqiy fayllarda hech narsa
   o'zgarmaydi (C3). — **Hal bo'ldi (v2.9.4):** «3-bosqichni boshla» javobi
   rozilik deb olindi; qaytarish — `src/lib/formula.js` dagi ro'yxat orqali.
5. **Xavfsizlik tafsilotlari** repoda tursinmi yoki faqat sizda? Repo qachon
   yopiladi — 6-bosqichdan keyin (C).
6. **Mac'dagi ikkinchi zaxira joyi**: iCloud Drive, Google Drive yoki tashqi
   disk? (B1)
7. **UZEX haftasi** arizaning sanasi bo'yicha o'zi tanlansinmi? (F5)
8. **4А ИТОГО**: qatorlar bo'yicha `SUM` yozilsinmi yoki bozor tomoni bo'sh
   qolsinmi? (A2)

Oldingi ishdan ochiq qolgan ikki savol: TNQurilish ro'yxatlaridagi narxlar
QQS bilanmi (tasdiq kutilmoqda); v2.9.0 da UZEX dan qo'llangan narxlar («U»
belgili kataklar) QQS bilan qolgan — ko'zdan kechirish kerak.
