# Tekshiruv va tuzatish rejasi

Butun repozitoriya sakkiz yo'nalish bo'yicha o'qib chiqildi (autentifikatsiya,
API, baza, frontend, xavfsizlik, unumdorlik, takrorlanish, ekspluatatsiya).
Har bir topilma **fayl:qator** bilan ko'rsatilgan va, imkoni bo'lganda,
takrorlab ko'rsatilgan — «shunday bo'lishi mumkin» emas, «mana shu qadamlar
shunday natija beradi».

Ustuvorlik tartibi bitta savol bilan aniqlangan: **eng ko'p zararni nima
keltiradi?** Ma'lumot yo'qolishi birinchi, maxfiylik ikkinchi, ishonchsiz
ishlash uchinchi, tozalash oxirida.

Holat belgilari: `[ ]` bajarilmagan · `[x]` bajarilgan va testdan o'tgan.

---

## 1-daraja — ma'lumot yo'qolishi va ruxsatsiz kirish

### [ ] 1.1 «Отменить загрузку» butun reyestrni o'chirib yuborishi mumkin

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

### [ ] 1.2 Ofis tarmog'i rejimida superuser paroli repozitoriyada ochiq

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

### [ ] 1.3 Har bir ekspert boshqasining ishini o'chira oladi

`server/pb_schema.json` — `corrections` va `workspaces`

`corrections` da `update` va `delete` qoidasi `@request.auth.id != ""`, ya'ni
tizimga kirgan **har qanday** foydalanuvchi. `workspaces` da ham `update`
shunday. Ya'ni bir ekspert boshqasining narx tuzatishlarini o'zgartirishi yoki
o'chirishi mumkin, va bu hech qayerda qayd etilmaydi.

**Tuzatish:** yozuvni faqat uni yaratgan ekspert yoki administrator
o'zgartira/o'chira olsin. `corrections` uchun `workspace.opened_by` orqali,
`workspaces` uchun `opened_by` orqali.

**Xavf:** ikki ekspert bitta arizani navbat bilan olib borishi mumkin edi —
qoidada administrator istisnosi qoldiriladi va `e2e-workspace` testi buni
tekshiradi.

### [ ] 1.4 Tizimdan chiqish ish maydonini yopmaydi

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

### [ ] 1.5 Yuklangan va eksport qilingan fayllar himoyasiz

`server/pb_schema.json` — `workspaces.files`, `exports.file`,
`registry_imports.file`

PocketBase fayl URL'lari default holatda ochiq: manzilni bilgan har kim
smetani, tayyor taqqoslash hujjatini yoki reyestr eksportini yuklab oladi.
Manzilda yozuv ID'si bor, lekin ular ro'yxatdan ko'rinadi.

**Tuzatish:** fayl maydonlarini himoyalangan qilish (`protected: true`), mijoz
esa faylni qisqa muddatli token bilan olsin (`pb.files.getURL(..., {token})`).

**Xavf:** `sync.js` va `registry.js` dagi yuklab olish yo'llari o'zgaradi —
`e2e-workspace` va `e2e-hints` testlari buni qamrab oladi.

---

## 2-daraja — ishonchsiz ishlash

### [ ] 2.1 Zararli yoki buzuq `.xlsx` brauzerni muzlatadi

`src/lib/xlsx-read.js:82`, `src/lib/smeta.js:120,131`

`<row r="900000000">` atributi hech qanday chegaradan o'tmaydi. `rows` massivi
shu indeksgacha «cho'ziladi», keyin `smeta.js` dagi ikki tsikl `rows.length`
gacha aylanadi va ilova javob bermay qoladi.

**Tuzatish:** qator va ustun indekslariga aql bovar qiladigan chegara
(masalan 1 048 576 — Excel'ning o'z chegarasi), undan yuqorisi e'tiborsiz
qoldiriladi.

**Xavf:** yo'q — haqiqiy hujjatlarda bunday indeks bo'lmaydi; `pipeline` va
`browser` testlari haqiqiy kitoblarda ishlaydi.

### [ ] 2.2 Ikkita arizani ketma-ket ochish holatlarni aralashtiradi

`src/ui/sync.js:56`

Birinchi ariza fayllari hali yuklanayotganda ikkinchisini ochish — birinchisining
javobi ikkinchisining ustiga tushadi.

**Tuzatish:** ochish ketma-ketligiga raqam berish; javob kelganda raqam
o'zgargan bo'lsa, javobni tashlab yuborish (`registry.js` dagi `seq` naqshi
allaqachon shu uchun ishlatilgan).

### [ ] 2.3 Har bir tugma bosilishi serverga yozuv yuboradi

`src/ui/sync.js:37`

Narx maydoniga `120000` yozish — beshta alohida server yozuvi, va oraliq
qiymatlar (`1`, `12`, `120`…) ham saqlanadi.

**Tuzatish:** `correct()` ni `debounce` bilan o'rash (600 ms), va maydondan
chiqishda darhol yozish.

### [ ] 2.4 Bir marta muvaffaqiyatsiz saqlash butunlay yo'qoladi

`src/ui/sync.js:260`

**Tuzatish:** saqlash muvaffaqiyatsiz bo'lsa `dirty` bayrog'i tiklansin,
keyingi urinishda qayta yuborilsin; ish maydonidan chiqishda saqlanmagan
o'zgarish borligi haqida ogohlantirish.

### [ ] 2.5 Bitta muvaffaqiyatsiz so'rov narx eslatmalarini o'chiradi

`src/ui/hints.js:120`

Kalitlar so'rovdan **oldin** «olingan» deb belgilanadi, shuning uchun tarmoq
xatosidan keyin o'sha resurslar uchun eslatmalar butun sessiya davomida
ko'rinmaydi.

**Tuzatish:** belgilashni javob kelgandan keyinga ko'chirish; xatoda belgini
olib tashlash.

---

## 3-daraja — unumdorlik

### [ ] 3.1 Ariza ro'yxati barcha ish maydonlari holatini tortadi

`src/ui/registry.js:130`

`getFullList` da `fields` ro'yxati bor, lekin `state` maydoni serverdan
baribir kelmaydi — bu tasdiqlanishi kerak. O'lchov: bitta ish maydoni holati
1161 resursda **150 KB**.

**Tuzatish:** ro'yxat uchun kerakli maydonlarnigina so'rash; ish maydonlari
sonini sahifalash.

### [ ] 3.2 `/api/admin/reset` hamma yozuvni xotiraga yuklaydi

`server/pb_hooks/admin.pb.js:210`

**Tuzatish:** fayl saqlaydigan jadvallarni bo'lak-bo'lak o'chirish.

### [ ] 3.3 Reyestr importi butun so'rovni bitta tranzaksiyada bajaradi

`server/pb_hooks/registry.pb.js:29`

**Tuzatish:** so'rovdagi qatorlar soniga yuqori chegara qo'yish (mijoz 500 tadan
yuboradi) va undan oshsa aniq xato qaytarish.

---

## 4-daraja — takrorlanish va tozalash

### [ ] 4.1 Superuser autentifikatsiyasi 21 ta skriptda takrorlangan

`server/*.sh`, `server/deploy/*.sh`, `test/*.sh`, `test/*.mjs`

**Tuzatish:** bitta `server/deploy/lib.sh` (yoki `test/lib.sh`) ga chiqarish.

### [ ] 4.2 `vm` yuklovchi 6 ta test harnessida takrorlangan

`test/*.cjs`

**Tuzatish:** `test/load.cjs` — bitta joyda, fayllar ro'yxati bilan.

### [ ] 4.3 `server/.env` `.gitignore` da yo'q

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
