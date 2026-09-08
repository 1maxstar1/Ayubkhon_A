# Ikkinchi tekshiruv — reja

Birinchi reja (`docs/audit-plan.md`) tugagach, butun repozitoriya **yana bir
bor** sakkiz yo'nalish bo'yicha o'qib chiqildi, va bu safar har bir topilma
alohida agentlar tomonidan **rad etishga urinib** tekshirildi. 65 ta tasdiqlangan
topilmadan bir qismi allaqachon tuzatilgan bandlar edi; qolganlari shu yerda.

Ikkitasi — **mening o'z tuzatishimdagi kamchilik**. Ular ham shu ro'yxatda,
boshqalar bilan bir xil qatorda: 2.7 va 2.8.

Holat belgilari: `[ ]` bajarilmagan · `[x]` bajarilgan va testdan o'tgan ·
`[~]` o'lchov asosida rad etilgan yoki ataylab qisman qilingan.

---

## 1-daraja — ma'lumot yo'qoladi

### [x] 2.1 Ikkinchi smeta birinchisining fayliga bog'lanadi

`src/ui/sync.js:317` — **critical**

`upload()` `var before = (this.ws.files || []).length;` ni **navbatga
qo'yishdan oldin** o'qiydi, lekin undan navbat ichida foydalanadi. Birinchi
yuklash tugamasdan ikkinchisi boshlansa, ikkalasi ham `before = 0` ni ushlaydi;
ikkinchisi javob kelganda `w.files.slice(0)` allaqachon birinchi faylni ham o'z
ichiga oladi, ya'ni **birinchi faylning id si ikkinchi faylning nomi ostiga
yoziladi**.

Tekshiruvchi o'lchagani: ish maydoni qayta ochilganda ikkala loyiha ham bitta
smetani ko'rsatadi (7472 qator, ikkalasida ham «G-27 KO`CHASI»), ikkinchi
smetaning mazmuni yo'qolgan, baytlari serverda yetim qolgan. Ekspert buni
sezmasa — bitta smeta ikki marta sanalgan TAQQOSLASH JADVALI eksport qilinadi.

**Bajarildi.** «Oldin» ro'yxati endi navbat **ichida**, so'rov haqiqatan
ishlayotgan paytda o'qiladi, va yangi fayllar sonini emas, **to'plamlar
farqini** oladi — orada saqlash eskirgan faylni o'chirsa ham to'g'ri qoladi.

Avval xatoni takrorlaydigan test yozildi: `test/upload-order.mjs` ikki
yuklashni bir taktda boshlaydi, keyin har bir nom ortidagi **baytlarni**
yuklab olib solishtiradi. Tuzatishdan oldin: «ikkala nom bitta faylga olib
boradi (one_phrbb8u5cn.xlsx / one_phrbb8u5cn.xlsx)». Keyin: har biri o'zinikiga.

### [ ] 2.2 «Загрузить книгу цен» ish maydonini «o'zgargan» deb belgilamaydi

`src/ui/app.js:845` — **high**

`loadPriceBook` narxlarni to'g'ridan-to'g'ri modelga yozadi, `setPrice` /
`setPrices` / `rebuild` orqali o'tmaydi — `sync.js` esa aynan shu uchtasini
o'raydi. Natijada `Sync.touch()` ishlamaydi (avtosaqlash yo'q, belgi «✓» bo'lib
turadi) va `Sync.correct()` ishlamaydi (`corrections` yozuvlari yo'q).

O'lchangani: kitobdan 25 ta narx yuklandi, belgi «✓», to'rt soniya kutildi,
«‹ Заявки» bosildi, ariza qayta ochildi — **1 ta o'zgargan narx**. Qolgan
24 tasi yo'q.

### [x] 2.3 «Применить %» tuzatishlarning 97 % ini 429 bilan yo'qotadi

`src/ui/sync.js:386`, `src/ui/prices.js:132` — **high**

Bitta «Применить %» har bir ko'rinadigan resurs uchun bitta HTTP `create`
chiqaradi. `server/deploy/configure.sh` esa ishlab chiqarishda `*:create` ni
5 soniyada 40 ta so'rov bilan cheklaydi.

Tekshiruvchi haqiqiy PocketBase da, aynan shu cheklovlar bilan o'lchagani:
1161 resurs → **40 tasi yozildi, 1121 tasi HTTP 429 bilan rad etildi**.
Ular qayta urinilmaydi; bitta `#toast` elementi ustma-ust yozilib, ekspert
faqat bir marta miltillagan xatoni ko'radi. Ish maydoni holati (`prices2`)
saqlanadi, ya'ni hujjat to'g'ri chiqadi — lekin loyihaning **narx xotirasi**
yo'qoladi.

Yonidagi ikkinchi muammo: holat saqlash (`saveNow`) shu navbatning oxirida
turadi, ya'ni 1161 ta yozuv tugamaguncha boshqa hech narsa saqlanmaydi.

**Bajarildi — yangi hook: `POST /api/corrections/bulk`.** Sahifa endi kutayotgan
narxlarning **hammasini bitta so'rovda** yuboradi. Bu marshrut `*:create`
qoidasiga emas, `/api/` qoidasiga (10 soniyada 400) tushadi, ya'ni cheklovga
tegmaydi — cheklovni pasaytirish ham, ko'tarish ham kerak emas. 1161 ta so'rov
o'rniga bitta bo'lgani uchun navbat ham bloklanmaydi.

Yon foyda: mintaqa, ariza, kontragent va **muallif** endi so'rovdan emas, ish
maydoni yozuvidan va tokendan olinadi; qidiruv kalitlari esa serverda,
sahifa quriladigan **o'sha `lib/nlp.js`** bilan hisoblanadi — ikki tomon
bir-biridan uzoqlashib keta olmaydi.

`test/corrections-bulk.mjs` (yangi) cheklovni **haqiqiy raqamlar bilan yoqadi**
(`server/deploy/configure.sh` dagidek) va ikkalasini o'lchaydi:

| Qanday | Natija |
|---|---|
| har bir resursga bitta `create` (avvalgidek) | **40 yozildi, 20 tasi 429** |
| hammasi bitta so'rovda (hozir) | **300 tasidan 300 tasi, 176 ms** |

`test/e2e-workspace.mjs` da brauzerda: «Применить %» → **1101 ta resursdan
1101 tasi yozildi, 2 ta so'rovda** (1000 talik bo'laklar), «Сбросить» →
hammasi bitta so'rovda o'chirildi.

Shu bilan `create-rate-limit-drops-bulk-prices` va `create-limit-shared-per-ip`
topilmalari ham yopiladi: cheklov o'z joyida qoladi, unga urilinmaydi.

---

## 2-daraja — unumdorlik

### [ ] 2.4 `Hints.load()` mintaqadagi barcha tuzatishlarni to'liq tortadi

`src/ui/hints.js:128` — **high**

`getFullList` da na `fields:`, na chegara bor; har bir qator o'zi bilan
kengaytirilgan `application`, `contragent` va `by` yozuvlarining to'liq nusxasini
olib keladi. O'lchangani: mintaqada 20 ta tugallangan loyiha (18 000 qator)
bo'lganda **44 ta so'rov, 30.2 MB** — ko'rsatiladigani esa har bir resurs uchun
ko'pi bilan 12 ta.

### [ ] 2.5 `rankSimilar` topilmagan resursni eslab qolmaydi

`src/ui/hints.js:200` — **high**

Hech narsa topilmagan resurs uchun funksiya `self.sim[mk]` ni yozmasdan
qaytadi, ya'ni **har safar qaytadan hisoblanadi**. Yon panelda bitta katakcha
belgisini o'zgartirish `rebuild()` ni chaqiradi, u esa ~1000 ta resursni butun
hovuzga qarshi qayta baholaydi.

O'lchangani (haqiqiy nomlar korpusida): 1-o'tish 8021 ms, 2-o'tish 7730 ms,
3-o'tish 7587 ms — har biri 0 ta yangi moslik topib. `tokens()` va `numbers()`
keshlanmagan; keshlansa birinchi o'tish ham 8213 → 4887 ms ga tushadi.

---

## 3-daraja — xavfsizlik

### [ ] 2.6 O'chirilgan foydalanuvchi sessiyasini saqlab qoladi (tugallanmagan)

`server/pb_hooks/` — **medium**, mening tuzatishimdagi kamchilik

Birinchi bosqichda men faqat `REFRESH_MS` ni 20 → 5 daqiqaga tushirgan edim,
ya'ni besh daqiqalik oyna qolgan. Tekshiruvchi ishlaydigan tuzatishni o'lchab
ko'rsatdi:

```js
onRecordUpdate((e) => {
  if (e.record.original().getBool("active") && !e.record.getBool("active")) e.record.refreshTokenKey();
  e.next();
}, "users");
```

va tuzoqni ham: `onRecordAfterUpdateSuccess` + `$app.save` shakli so'rovni
osib qo'yadi — o'lchangani «disable → 10 soniyada javob kelmadi», yozuv esa
saqlangan. Ishlaydigan shakl: «disable → 200, 0.0032 s», keyin o'sha token
bilan «0 ta ish maydoni», «tuzatish yozish → 400».

### [ ] 2.7 Fayl havolasi chizilganda imzolanadi, bosilganda emas (tugallanmagan)

`src/ui/registry.js:23`, `src/ui/admin.js` — **medium**, mening tuzatishimdagi kamchilik

Fayllarni `protected: true` qilib, token bilan berish to'g'ri edi — lekin men
tokenni `href` ichiga **chizish paytida** yozib qo'ydim. Tekshiruvchi token
umrini o'lchadi: **180 soniya**. Ya'ni ariza kartochkasi besh daqiqa ochiq
tursa, havola tushuntirishsiz `404` beradi.

---

## 4-daraja — ekspluatatsiya va aniqlik

### [ ] 2.8 `reset-data.sh` o'z zaxirasi olinmasa ham bazani o'chiradi

`server/deploy/reset-data.sh:22` — **high**

Ikki qadam `;` bilan ulangan, HTTP kodi chop etiladi, lekin tekshirilmaydi.
`set -e` faqat mahalliy skriptda; masofaviy qism bitta `sh -c` satri.
Zaxira `400` qaytarsa ham tozalash davom etadi.

### [ ] 2.9 Muvaffaqiyatsiz `install.sh` xizmatni o'chirilgan holda qoldiradi

`server/deploy/install.sh:52` — **high**

19-qatorda `systemctl stop pocketbase`, qayta ishga tushirish esa faqat
muvaffaqiyat tarmog'ida (63-qatordagi `else` ichida). Oddiy relizning
o'rtasida yiqilish butun ofisni ishsiz qoldiradi va buni hech narsa aytmaydi.

### [ ] 2.10 Unikal indeks poygasidan keyin tuzatish boshqa yozilmaydi

`src/ui/sync.js:333` — **medium**

`corrections` da `(workspace, res_key)` unikal. Ikki ekspert bitta arizani ochsa,
ikkinchisining `create` so'rovi `400` bilan yiqiladi va **tiklash tarmog'i yo'q**
— `self.corr[key]` hech qachon to'ldirilmaydi, ya'ni shu sessiyada bu resurs
uchun narx boshqa yozilmaydi.

### [ ] 2.11 «Вид отчёта» modeli o'zgarganda yangilanmaydi

`src/ui/app.js:439` — **medium**

`rebuild()` `buildReportPreview()` ni chaqirmaydi. O'lchangani: ko'chani
o'chirgandan keyin ham «660 строк · 637 ресурсов», haqiqati «657 · 634».

### [ ] 2.12 «Сводная таблица» qidiruvi har bir `rebuild()` da jimgina tashlanadi

`src/ui/app.js:453` — **medium**

Qidiruv maydonida matn turadi, lekin `sheetView` hammasiga qaytariladi.
O'lchangani: «БЕТОН» → 260 qator; ko'chani o'chirdik → maydonda hamon «БЕТОН»,
jadvalda esa 5831 qator.

### [ ] 2.13 «Работа: в работе» faqat yuklangan sahifada ishlaydi

`src/ui/registry.js:164` — **medium**

Ikkala mijoz tomonidagi filtr `render()` ichida, `this.items` ustida ishlaydi —
u esa faqat olingan sahifalarni saqlaydi. O'lchangani: 70 ta ariza, 4 tasi ishda
(ikkinchi sahifada) → **0 qator**, hisoblagichda «0 / 70».

### [ ] 2.14 Qulf taymeri kiritilayotgan kirish kodini o'chiradi

`src/ui/auth.js:153` — **medium**

`setInterval` kirishda yaratiladi va hech qachon to'xtatilmaydi. Qulflangandan
keyin `tick()` har daqiqada `lock()` ni qayta chaqiradi, u esa `show()` →
`reset(false)` orqali `loginCode.value` ni tozalaydi. Xat 10-20 daqiqada
kelishi mumkinligi ilovaning o'z izohida yozilgan.

---

## Ishlash tartibi

Har bir band alohida commit. Har bir banddan keyin:

```sh
sh test/all.sh reestr.xls smeta1.xlsx smeta2.xlsx     # 20 ok, 0 fail
```

Ma'lumotga tegadigan har bir tuzatish uchun avval uni takrorlaydigan **test
yoziladi**, keyin tuzatiladi.

Tartib sababi: 2.3 (429 bo'roni) 2.2 dan **oldin** qilinadi — aks holda narx
kitobini `setPrices` ga o'tkazish 400 ta yangi so'rovni o'sha bo'ronga qo'shadi.
