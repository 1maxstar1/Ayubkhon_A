# Tekshiruv va tuzatish rejasi

Butun repozitoriya sakkiz yo'nalish bo'yicha o'qib chiqildi (autentifikatsiya,
API, baza, frontend, xavfsizlik, unumdorlik, takrorlanish, ekspluatatsiya).
Har bir topilma **fayl:qator** bilan ko'rsatilgan va, imkoni bo'lganda,
takrorlab ko'rsatilgan — «shunday bo'lishi mumkin» emas, «mana shu qadamlar
shunday natija beradi».

Ustuvorlik tartibi bitta savol bilan aniqlangan: **eng ko'p zararni nima
keltiradi?** Ma'lumot yo'qolishi birinchi, maxfiylik ikkinchi, ishonchsiz
ishlash uchinchi, tozalash oxirida.

Holat belgilari: `[ ]` bajarilmagan · `[x]` bajarilgan va testdan o'tgan ·
`[~]` o'lchov asosida rad etilgan yoki ataylab qisman qilingan.

---

## Yakun

Reja tugadi. **12 ta band tuzatildi**, **3 tasi o'lchov asosida rad etildi yoki
qisman qoldirildi** — har birining sababi o'z bandida yozilgan.

Har bir xavfsizlik va ma'lumot tuzatishi uchun **avval xatoni takrorlaydigan
test** yozildi, keyin tuzatildi. Ikkita yangi test fayli
(`test/xlsx-guard.cjs`, `test/ownership.mjs`) va mavjudlariga 20 dan ortiq
yangi tekshiruv qo'shildi. Yakuniy holat: **20 ta testdan 20 tasi o'tdi**.

Eng qimmatli to'rt topilma — hech biri taxmin emas, hammasi takrorlab
ko'rsatilgan:

| Nima | Qanday isbotlandi |
|---|---|
| «Отменить загрузку» butun reyestrni o'chirardi | test 404 tadan **402** ta arizani o'chirishni ko'rsatdi |
| Ofis tarmog'ida superuser paroli repozitoriyada ochiq edi | `lan.sh:10` va `0.0.0.0` bog'lanishi |
| Chiqqandan keyin keyingi odam birinchisining ish maydoniga tushardi | brauzer testi bilan takrorlandi |
| 1479 baytlik `.xlsx` ilovani muzlatardi | `rows.length = 900 000 001` |

Auditning o'zi ham qattiq tekshiruvdan o'tdi: tekshiruvchi agentlar ikkita
topilmani rad etdi va to'rttasining jiddiyligini pasaytirdi. Men esa uchtasini
o'zgartirdim — biri (`3.1`) o'lchov bilan rad etildi, biri (`1.3`) dasturning
ataylab qilingan xususiyatini buzgani uchun boshqacha hal qilindi, biri (`4.1`)
sinab bo'lmaydigan joylashtiruv skriptlariga tegmaslik uchun qisman qoldirildi.

---

## 1-daraja — ma'lumot yo'qolishi va ruxsatsiz kirish

### [x] 1.1 «Отменить загрузку» butun reyestrni o'chirib yuborishi mumkin

`server/pb_hooks/admin.pb.js:154`

Mijoz har doim `created_numbers` maydonini yozadi — hatto hech narsa
qo'shilmagan bo'lsa ham, bo'sh massiv (`"[]"`) sifatida. Haftalik qayta
yuklashda aynan shunday bo'ladi: `added = 0`.

Server esa bo'sh massivni «bu eski yuklash, raqamlari yozilmagan» deb
tushunadi va zaxira yo'lga o'tadi — o'sha yuklashdan oldingi **bir soat**
ichida yaratilgan barcha arizalarni o'chiradi. Reyestr o'sha kuni birinchi
marta yuklangan bo'lsa, bu butun reyestr demakdir.

*Nega hozirgacha sezilmagan:* `test/dedupe.mjs` faqat `createdNumbers` da ikki
raqam bor holatni sinaydi, bo'sh holatni emas.

**Tuzatish:** maydon **bor-yo'qligini** tekshirish kerak, uning bo'sh-emasligini
emas. Yozuvda `created_numbers` bor va u haqiqiy massiv bo'lsa — o'sha
raqamlardan foydalanish (bo'sh bo'lsa: o'chiradigan narsa yo'q). Faqat maydon
umuman bo'lmaganda vaqt bo'yicha zaxira yo'lga tushish.

**Xavf:** yo'q — hozirgi xatti-harakat noto'g'ri, uni saqlashning ma'nosi yo'q.

*Bajarildi.* `test/dedupe.mjs` avval xatoni takrorladi (404 tadan **402** ta
ariza o'chirilishi taklif qilindi), tuzatishdan keyin `0`. Server endi maydon
**yozilgan-yozilmaganini** tekshiradi, bo'sh-emasligini emas; raqamlari umuman
yozilmagan eski yozuvlar avvalgidek vaqt bo'yicha ishlaydi va bu ham test bilan
qulflangan.

### [x] 1.2 Ofis tarmog'i rejimida superuser paroli repozitoriyada ochiq

`server/lan.sh:10`

`PB_ADMIN_PASS` ning standart qiymati `adminpass1234` — u GitHub'da ochiq va
test skriptlarida ham shu. `lan.sh` serverni `0.0.0.0:8090` ga bog'laydi, ya'ni
tarmoqdagi har kim `http://<ip>:8090/_/` orqali baza paneliga to'liq huquq
bilan kirishi mumkin.

*Aniqlik:* foydalanuvchi hisoblari xavf ostida emas — sxemada
`passwordAuth.enabled = false`, kirish faqat bir martalik kod bilan. Xavf
`_superusers` hisobida, lekin u hamma narsani ko'radi va o'zgartiradi.

**Tuzatish:** standart parolni olib tashlash. `PB_ADMIN_PASS` berilmagan bo'lsa
— birinchi ishga tushirishda tasodifiy parol yaratib, ekranga bir marta chiqarish
va `server/.env` ga yozish. Baza panelini (`/_/`) tashqi manzildan yopish.

**Xavf:** allaqachon `lan.sh` bilan o'rnatgan bo'lsa, eski parol ishlashda
davom etadi — hujjatda uni almashtirish aytiladi.

*Bajarildi.* `lan.sh` endi birinchi ishga tushirishda tasodifiy parol yaratadi,
uni ekranda bir marta ko'rsatadi va `server/.env` ga `chmod 600` bilan yozadi;
keyingi ishga tushirishlarda o'shani o'qiydi. `server/.env` `.gitignore` ga
qo'shildi (4.3 ham shu bilan bajarildi). VPS yo'li (`install.sh`) allaqachon
tasodifiy parol yaratar ekan — tekshirildi. `dev.sh` faqat `127.0.0.1` ga
ulanadi, shuning uchun undagi qulay parol qoldirildi va README'da shu izohlandi.

### [x] 1.3 Kim nima qilgani — mijozdan kelardi

*Boshlang'ich topilma qayta baholandi.* Audit «har bir ekspert boshqasining
ishini o'chira oladi» degan edi va yechim sifatida egalik qoidasini taklif
qilgan edi. Kodni o'qib chiqib **bu yechim rad etildi**: dastur ikki
ekspertning bitta arizada ishlashini ataylab qo'llab-quvvatlaydi va bu haqda
foydalanuvchiga o'zi aytadi — «при одновременной работе побеждает последнее
сохранение» (`src/ui/sync.js:70`). Egalik qoidasi shu ishlab turgan tartibni
buzardi.

Haqiqiy muammo boshqa joyda edi: **kim nima qilgani** (`opened_by`,
`updated_by`, `by`) brauzerdan kelardi va hech kim tekshirmasdi. Ya'ni ekspert
o'z o'zgartirgan narxini hamkasbi nomiga yozib qo'yishi mumkin edi, va «kim
oxirgi ishlagan» ogohlantirishi noto'g'ri odamni ko'rsatishi mumkin edi. Bu
yozuvlar — kim nimani narxlagani haqidagi yagona hisobot; har kim yoza
oladigan hisobot esa hisobot emas.

`server/pb_hooks/ownership.pb.js` (yangi), `server/pb_hooks/lib/ownership.js`

**Bajarildi.** Server endi bu maydonlarni o'zi qo'yadi — so'rovda nima
kelganidan qat'i nazar. Kim nima qila olishi **o'zgarmadi**: har bir ekspert
har qanday arizani ochadi, ikkitasi bitta ustida ishlashi mumkin, oxirgi
saqlash yutadi. Faqat yozuvga kimning nomi tushishi o'zgardi.

Superuser'lar tegilmaydi: o'rnatgich, testlar va texnik xizmat endpoint'lari
boshqa odam nomidan yozuv yaratadi va ularning o'z foydalanuvchi yozuvi yo'q.

`test/ownership.mjs` (yangi) ikkalasini ham tekshiradi: Alisa Bobning ID'sini
yuborsa ham yozuv Alisaga yoziladi, va shu bilan birga Bob o'sha ish maydonini
saqlay oladi, unga tuzatish qo'sha oladi, ochuvchi esa Alisa bo'lib qoladi.

*Eslatma:* `users.listRule` har bir ekspertga barcha e-mail manzillarini
ko'rsatadi. Bu ataylab qoldirildi — `sync.js` va `hints.js` «kim ishlagan»
degan joyda ism bo'lmasa e-mail ko'rsatadi. Ismlar to'ldirilsa, keyinchalik
yopish mumkin.

### [x] 1.4 Tizimdan chiqish ish maydonini yopmaydi

`src/ui/auth.js:161`

`auth:signedout` hodisasini `sync.js` ham, `app.js` ham eshitmaydi. Natijada
ekspert chiqqach (yoki 4 soatlik qulf ishlagach) ish maydoni xotirada qoladi va
`S.Sync.ws` to'ldirilgan holatda turadi. Keyin **boshqa** ekspert kirsa,
`registry.js:59` dagi `if (!S.Sync.ws) self.show()` sharti ishlamaydi va u
to'g'ridan-to'g'ri birinchisining ish maydoniga tushadi.

Umumiy kompyuterda — maxfiylik buzilishi.

**Tuzatish:** `auth:signedout` da ish maydonini yopish (`ws:close` yo'li bilan),
modelni va narxlarni tozalash.

**Xavf:** saqlanmagan o'zgarish yo'qolishi — chiqishdan oldin `saveNow()`
chaqiriladi.

*Bajarildi.* Tartib muhim: avval kirish ekrani ko'tariladi (ma'lumot
ko'rinmasin), keyin ish maydoni saqlanib yopiladi (token hali amal qiladi),
oxirida token tozalanadi. Saqlash 5 soniyada ulgurmasa ham sessiya baribir
yopiladi — kech qulflashdan ko'ra oxirgi bir necha soniyani yo'qotgan afzal.
`test/e2e-workspace.mjs` buni tekshiradi: chiqish → ish maydoni yopiladi,
fayllar va narxlar tozalanadi, ish maydoni serverda qoladi, keyingi kirgan
odam reyestrga tushadi.

### [x] 1.5 Yuklangan va eksport qilingan fayllar himoyasiz

`server/pb_schema.json` — `workspaces.files`, `exports.file`,
`registry_imports.file`

PocketBase fayl URL'lari default holatda ochiq: manzilni bilgan har kim
smetani, tayyor taqqoslash hujjatini yoki reyestr eksportini yuklab oladi.
Manzilda yozuv ID'si bor, lekin ular ro'yxatdan ko'rinadi.

**Tuzatish:** fayl maydonlarini himoyalangan qilish (`protected: true`), mijoz
esa faylni qisqa muddatli token bilan olsin (`pb.files.getURL(..., {token})`).

**Xavf:** `sync.js` va `registry.js` dagi yuklab olish yo'llari o'zgaradi —
`e2e-workspace` va `e2e-hints` testlari buni qamrab oladi.

*Bajarildi.* Uchala fayl maydoni `protected: true`. Mijoz uchun
`S.fileToken()` / `S.fileURL()` qo'shildi (`src/lib/pb.js`): bitta token
ekrandagi barcha fayllarga yetadi, bir daqiqa saqlanadi (PocketBase'ning o'z
ikki daqiqasi ichida), chiqishda tozalanadi. Ariza kartochkasi va admin
sahifasidagi havolalar avval nomsiz chiziladi, manzil token kelgach
to'ldiriladi; token olinmasa havola «недоступна» bo'lib qoladi, bo'sh joyga
olib bormaydi.

*Bu xatoni tasodifan isbotlab ham qo'ydim:* sxemani mijozdan oldin
o'zgartirganimda `e2e-workspace` aynan fayl yuklab olishda 120 soniya kutib
yiqildi — ya'ni himoya haqiqatan ishlaydi va ikkalasi birga o'zgarishi shart.
Test endi buni qulflaydi: tokensiz manzil `404`, token bilan `200`.

### [x] 1.6 O'chirilgan hisob sessiyasi darhol tugamaydi

`server/pb_schema.json` — `users.authRule = "active = true"`

Administrator ekspertni «Отключить» qilganda uning **hozirgi** tokeni amal
qilishda davom etadi. `authRule` faqat kirishda va token yangilanganda
tekshiriladi, `auth.js` esa tokenni **20 daqiqada** bir yangilaydi.

**Bajarildi.** Yangilash oralig'i 20 → **5 daqiqa**. Ya'ni ekspertni
o'chirgan administrator ekrandan ketmasidan uning sessiyasi tugaydi. Bir odam
uchun besh daqiqada bitta so'rov — hech qanday yuk emas.

### [x] 1.7 Uchta kod «uchib yurganda» bitta xato raqam kirishni bloklaydi

`src/ui/auth.js` — `TRIES`

Kod kechikib kelgani uchun dastur oxirgi bir nechta so'rovni ketma-ket sinaydi.
Har bir noto'g'ri urinish PocketBase'ning urinishlar hisobiga tushadi, ya'ni
bitta xato terilgan raqam bir necha «xato urinish» bo'lib yoziladi va hisob
vaqtincha bloklanadi.

*O'lchandi:* `server/deploy/configure.sh` da `*:auth` chegarasi — **3
soniyada 4 so'rov**. Bitta terilgan kod uchun 3 ta `authWithOTP` yuboriladi,
ya'ni ikkinchi urinishga o'rin qolmaydi.

**Bajarildi**, lekin taklif qilinganidan boshqacha: kechikkan xat uchun bir
nechta kodni sinash — bu foydalanuvchining o'z shikoyatidan kelib chiqqan
xususiyat, uni olib tashlamadim. Buning o'rniga ikki narsa qilindi. Server
allaqachon rad etgan (kod, otpId) juftligi **qayta yuborilmaydi**, shuning
uchun bir xil kod bilan tugmani ikkinchi marta bosish hech narsa sarflamaydi.
Va `429` (juda tez) kelganda sikl to'xtaydi va foydalanuvchiga bir necha
soniya kutish aytiladi — qolgan urinishlarni behuda sarflamaydi.

---

## 2-daraja — ishonchsiz ishlash

### [x] 2.1 Zararli yoki buzuq `.xlsx` brauzerni muzlatadi

`src/lib/xlsx-read.js:82`, `src/lib/smeta.js:120,131`

`<row r="900000000">` atributi hech qanday chegaradan o'tmaydi. `rows` massivi
shu indeksgacha «cho'ziladi», keyin `smeta.js` dagi ikki tsikl `rows.length`
gacha aylanadi va ilova javob bermay qoladi.

**Tuzatish:** qator va ustun indekslariga aql bovar qiladigan chegara
(masalan 1 048 576 — Excel'ning o'z chegarasi), undan yuqorisi e'tiborsiz
qoldiriladi.

**Xavf:** yo'q — haqiqiy hujjatlarda bunday indeks bo'lmaydi; `pipeline` va
`browser` testlari haqiqiy kitoblarda ishlaydi.

*Bajarildi.* Yangi `test/xlsx-guard.cjs` xotirada zararli kitoblar yasaydi.
Tuzatishdan oldin: `rows.length = 900 000 001`, `maxCol = 8 353 082 582`.
Keyin: ikkalasi ham Excel chegarasida, haqiqiy kitoblar esa avvalgidek
(6220 qator, 1161 resurs, 55 ms).

### [x] 2.2 Ikkita arizani ketma-ket ochish holatlarni aralashtiradi

`src/ui/sync.js:56`

Birinchi ariza fayllari hali yuklanayotganda ikkinchisini ochish — birinchisining
javobi ikkinchisining ustiga tushadi.

**Bajarildi.** Har bir `open()` o'z raqamini oladi; kechikkan javob — na
tuzatishlar ro'yxati, na fayllar — raqam o'zgargan bo'lsa hech narsaga
tegmaydi. Ish maydonini yopish ham raqamni oshiradi, ya'ni yo'lda qolgan
javob bo'sh ekranga tushmaydi.

Test mexanizmni to'g'ridan-to'g'ri tekshiradi (haqiqiy tarmoq poygasini
qo'zg'atmasdan): ketma-ket ikki ochish 4 → 5 → 6, yopish esa yana bittaga
oshiradi.

### [x] 2.3 Har bir tugma bosilishi serverga yozuv yuboradi

`src/ui/sync.js:37`

Narx maydoniga `120000` yozish — beshta alohida server yozuvi, va oraliq
qiymatlar (`1`, `12`, `120`…) ham saqlanadi.

**Bajarildi.** Terilgan qiymat 700 ms jim turgandan keyin yoziladi, maydondan
chiqilganda esa darhol. Hech narsa yo'lda qolmaydi: `flush()` har bir
saqlashdan oldin, ish maydonini yopishdan oldin va sahifa yopilishida
chaqiriladi.

`test/e2e-workspace.mjs` buni **o'lchaydi**: raqamlar terilayotganda serverga
`0` ta yozuv, terish tugagach `1` ta. Ilgari har bir raqam alohida yozuv edi va
ularning to'rttasi hech kim nazarda tutmagan sonni saqlardi (1, 12, 120, 1200).

### [x] 2.4 Ish maydonidan chiqishda muvaffaqiyatsiz saqlash jimgina yo'qolardi

`src/ui/sync.js:260`

*Topilma qisman noto'g'ri edi.* Oddiy saqlash allaqachon qayta urinadi:
`catch` da `dirty` tiklanadi va 15 soniyadan keyin yana yuboriladi. Haqiqiy
kamchilik **chiqish yo'lida** edi — `close()` oxirgi saqlash natijasini
kutardi-yu, muvaffaqiyatsizligini e'tiborsiz qoldirardi. Ish maydoni
tozalangach 15 soniyalik qayta urinish `if (!this.ws) return` ga tushardi,
ya'ni «повтор через 15 секунд» degan xabar yolg'on chiqardi.

**Bajarildi.** Endi navbat (`enqueue`) buzilmaydi, lekin chaqiruvchiga
urinishning o'z va'dasi qaytariladi. «Ro'yxatga qaytish» tugmasi saqlash
muvaffaqiyatsiz bo'lsa ish maydonini **yopmaydi** va sababini aytadi. Tizimdan
chiqish esa `close(true)` bilan baribir yopadi — birovning ishi ochiq qolgan
qulflangan ekran bir daqiqalik yozuvdan ko'ra yomonroq.

### [x] 2.5 Bitta muvaffaqiyatsiz so'rov narx eslatmalarini o'chiradi

`src/ui/hints.js:120`

Kalitlar so'rovdan **oldin** «olingan» deb belgilanadi, shuning uchun tarmoq
xatosidan keyin o'sha resurslar uchun eslatmalar butun sessiya davomida
ko'rinmaydi.

**Bajarildi.** Kalitlar endi javob kelgandan keyin belgilanadi — ikkala
bosqichda ham (aniq moslik va o'xshash nomlar). Tarmoq xatosidan keyin
keyingi qayta qurishda yana urinib ko'riladi. `test/e2e-hints.mjs` o'tdi.

---

## 3-daraja — unumdorlik

### [~] 3.1 Ariza ro'yxati barcha ish maydonlari holatini tortadi — **rad etildi**

`src/ui/registry.js:154`

**O'lchandi, da'vo tasdiqlanmadi.** Har biri 73 KB holatga ega 50 ta ish
maydoni yaratib, sahifa yuboradigan so'rovni aynan takrorladim:

| So'rov | Hajm | `state` bormi |
|---|---|---|
| Sahifa qanday so'rasa (`fields=…`) | **14 916 bayt** | yo'q |
| `fields=` bo'lmasa | 3 703 366 bayt | ha |

`fields` ro'yxati o'z ishini qilyapti — 248 barobar farq. Holat bloklari
tortilmaydi.

*Qolgan haqiqiy kamchilik ancha tor:* `getFullList` ish maydonlarini
sahifalamaydi. Bugungi hajmda (o'nlab-yuzlab ish maydoni) bu 15 KB, ya'ni
muammo emas. Minglab ish maydoniga yetganda ekrandagi arizalarga tegishli
ish maydonlarinigina so'rash kerak bo'ladi — lekin bu ro'yxat mantig'ini
o'zgartiradi va bugun asoslanmagan xavf. Yozib qo'yildi, qilinmadi.

### [x] 3.2 `/api/admin/reset` hamma yozuvni xotiraga yuklaydi

`server/pb_hooks/admin.pb.js:210`

**Bajarildi.** Fayl saqlaydigan to'rt jadval endi 500 tadan o'chiriladi —
band yilning barcha tuzatishlarini birinchisini o'chirishdan oldin xotirada
ushlab turish shart emas. `test/dedupe.mjs` o'tdi (u to'liq tozalashni
tekshiradi).

### [x] 3.3 Reyestr importi butun so'rovni bitta tranzaksiyada bajaradi

`server/pb_hooks/registry.pb.js:29`

**Bajarildi.** Bitta so'rovda 2000 tadan ko'p qator bo'lsa aniq `400`
qaytariladi. Mijoz 500 tadan yuboradi, ya'ni normal ish yo'liga tegmaydi.
`test/registry-import.sh` 2500 qator yuboradi va `400` kutadi.

---

## 4-daraja — takrorlanish va tozalash

### [~] 4.1 Superuser autentifikatsiyasi 21 ta skriptda takrorlangan — qisman

`server/*.sh`, `server/deploy/*.sh`, `test/*.sh`, `test/*.mjs`

**Bajarilgan qismi:** `test/server.mjs` yaratildi — serverni ko'tarish, sog'lomlik
kutish, `api()`, superuser kirishi, kod bilan kirish, qayta ishga tushirish.
Uchta test (`dedupe`, `match-keys`, `ownership`) unga o'tkazildi va o'tdi.
Nusxalar bir-biridan farq qilib qolgan edi — biri `204` javobni JSON deb
o'qishga urinardi — ya'ni test o'zi tekshirayotgan narsaga aloqasi yo'q sababga
ko'ra yiqilishi mumkin edi.

**Ataylab qilinmagan qismi:** `server/deploy/*.sh` dagi takror. Bu skriptlar
faqat haqiqiy serverda ishlaydi va men ularni bu yerda sinay olmayman. Tartib
uchun sinab bo'lmaydigan joylashtiruv skriptlarini o'zgartirish — yomon
almashuv. Yozib qo'yildi.

### [x] 4.2 `vm` yuklovchi 6 ta test harnessida takrorlangan

`test/*.cjs`

**Bajarildi.** `test/load.cjs` — qisqa nomlar bilan (`load('normalize','match')`)
va tayyor to'plamlar (`load.CORE`, `load.PIPELINE`, `load.REGISTRY`). Oltala
harness unga o'tkazildi. Fayl tartibi endi bitta joyda va `build.mjs` bilan bir
xil — ilgari har bir nusxada boshqacha edi, ya'ni test kerakli faylni
yuklamagani uchun «o'tib ketishi» mumkin edi.

Tekshirildi: `test/fixtures.cjs` o'lchov ma'lumotini **bayt-bayt bir xil**
qayta yaratdi.

### [x] 4.3 `server/.env` `.gitignore` da yo'q

Hozircha faqat `push.sh` dagi `--exclude` himoya qiladi.

**Tuzatish:** `.gitignore` ga qo'shish.

---

## Ishlash tartibi

Har bir band alohida commit. Har bir banddan keyin:

```sh
sh test/all.sh reestr.xls smeta1.xlsx smeta2.xlsx     # 18 ok, 0 fail
```

Xavfsizlik yoki ma'lumotga tegadigan har bir tuzatish uchun avval uni
takrorlaydigan **test yoziladi**, keyin tuzatiladi — shunda xato qaytib
kelmasligi qulflanadi.
