# Versiyalar, orqaga qaytish va NLP qismini birga rivojlantirish

Bu hujjat ikki savolga javob beradi:

* **A.** Yangi versiyani qanday chiqaraman va agar u ishlamasa, eskisiga qanday
  qaytaman?
* **B.** Dasturning «aqlli» qismlarini (nom taqqoslash, bo'lim, viloyat) o'zim
  qanday yaxshilayman va yaxshilanganini qanday **isbotlayman**?

---

## A. Ikki versiya

| Versiya | Nima | Commit |
|---|---|---|
| **v1.0** | NLP qatlamidan **oldingi** dastur. Reyestr, ish maydonlari, aniq nom bo'yicha narx eslatmalari, viloyat — regex bilan. | `7718eb41c9c3888019c6c18711cd96b8da64e3f7` |
| **v2.0** | Resursni ikki alifboda tanish, o'xshash nomlar bo'yicha narx taklifi, bo'limni nomdan aniqlash, viloyatni gazetteer bilan aniqlash. | `e0acf169821b61429afe314df6191e4527467272` |

Versiya — bu shunchaki **commit**. Git har bir o'zgarishni saqlaydi, shuning
uchun «eski versiya» hech qayerga yo'qolmaydi: u tarixda turadi va istalgan
vaqtda qaytariladi.

### Qaysi versiya ishlayotganini bilish

Dastur sarlavhasida, nomdan keyin kichik yorliq bor: **`v2.0.0`**. Admin
sahifasida ham shunday.

Yorliq **v2.0 dan boshlab** qo'shilgan, shuning uchun:

* yorliq bor va `v2.0.0` deb turibdi → yangi versiya ishlayapti;
* **yorliq umuman yo'q** → server v1.0 ga qaytarilgan.

Server qaytarilgandan keyin brauzerni **Ctrl+Shift+R** bilan yangilang — aks
holda eski sahifa keshda qolib ketadi va siz noto'g'ri holatni ko'rasiz.

### Teglarni o'z kompyuteringizda yaratish

Men teglarni serverga yubora olmadim (bu sessiyaning GitHub huquqi faqat
branch'ga yozishga yetadi, teglarga emas). Siz o'zingiz bir marta yarating —
shundan keyin `v1.0` deb yozish `rollback.sh` da ishlaydi:

```sh
git fetch origin
git tag -a v1.0 7718eb41c9c3888019c6c18711cd96b8da64e3f7 -m "NLP qatlamidan oldingi versiya"
git tag -a v2.0 e0acf169821b61429afe314df6191e4527467272 -m "Resurs, bo'lim va viloyatni tanish"
git push origin v1.0 v2.0
```

Tegsiz ham hammasi ishlaydi — `rollback.sh` ga commit raqamini bersangiz bo'ldi.

---

## Yangi versiyani chiqarish tartibi

Har safar **shu ketma-ketlikda** qiling. Uchinchi qadam eng muhimi: zaxira
bo'lmasa, orqaga qaytish ham bo'lmaydi.

```sh
# 1. Barcha testlar o'tishini tekshiring (o'z kompyuteringizda)
sh test/all.sh reestr.xls smeta1.xlsx smeta2.xlsx
#    "18 ok, 0 fail" chiqishi kerak

# 2. Serverdagi hozirgi holatni yuklab oling
sh server/deploy/pull-backup.sh root@SERVER_IP
#    ~/Backups/smeta/ ga .zip tushadi — bu sizning "qaytish nuqtangiz"

# 3. Yangi versiyani chiqaring
sh server/deploy/push.sh root@SERVER_IP

# 4. Brauzerda tekshiring: Ctrl+Shift+R, sarlavhadagi versiya raqami yangimi?
```

Keyin **bir necha kun haqiqiy ish bilan sinang**: bitta arizani oching,
narxlarni kiriting, hujjatni eksport qiling, natijani eski hujjat bilan
solishtiring.

## Orqaga qaytish

Agar yangi versiya biror joyda noto'g'ri ishlasa:

```sh
sh server/deploy/rollback.sh root@SERVER_IP v1.0
```

Skript uch ish qiladi:

1. **serverda yangi zaxira oladi** — ya'ni qaytishning o'zi ham qaytariladi;
2. eski versiyani **vaqtinchalik nusxada** yig'adi, sizning fayllaringizga
   tegmaydi;
3. sahifalar va hook'larni almashtirib, serverni qayta ishga tushiradi.

Ma'lumotlar bazasiga **tegilmaydi**. Yangi versiya qo'shgan ustunlarni eski
versiya shunchaki e'tiborsiz qoldiradi; ularni o'chirish esa — yagona
qaytarib bo'lmaydigan qadam bo'lardi.

Qayta oldinga yurish uchun oddiy `push.sh` yetarli:

```sh
sh server/deploy/push.sh root@SERVER_IP
```

### Ma'lumot yo'qoladimi?

**Yo'q, ikkala yo'nalishda ham.** Sabab shunda:

* Narxlar resurs **nomidan yasalgan kalit** bo'yicha saqlanadi, v2 esa bu
  kalitni o'zgartirdi (klaviatura almashinuvi, tinish belgilari).
* Shuning uchun v2 ish maydonini saqlaganda narxlarni **ikki marta** yozadi:
  `prices` — eski versiya tushunadigan kalitda, `prices2` — yangisida.
* v1 `prices` ni o'qiydi, v2 `prices2` ni. Ikkalasi ham to'liq.
* Eski ish maydonini v2 ochganda, kalitlar avtomatik ko'chiriladi va ekranda
  «Цены перенесены…» yozuvi chiqadi.

Yagona istisno — agar siz v1 ga qaytib, **u yerda yangi narxlar kiritsangiz**,
keyin yana v2 ga o'tsangiz: v1 `prices2` ni yozmaydi, shuning uchun v2 eski
kalitlardan qayta ko'chiradi. Bu ham ishlaydi, lekin bir marta «ko'chirildi»
xabarini ko'rasiz. Shunga qaramay, ikkinchi qadamdagi zaxirani doim oling.

---

## B. NLP qismlarini birga rivojlantirish

Bu yerda **o'qitilgan model yo'q** — hech qanday `.h5`, `.pkl` yoki og'ir
kutubxona. Butun «bilim» oddiy JavaScript jadvallarida yotadi, ularni o'qish
ham, o'zgartirish ham mumkin. Bu ataylab shunday: siz smeta mutaxassisisiz,
qaysi so'z nimani anglatishini modeldan yaxshiroq bilasiz.

### Bilim qayerda turadi

| Fayl | Nimani hal qiladi | Nimani o'zgartirasiz |
|---|---|---|
| `src/lib/normalize.js` | «Bu ikki nom bitta resursmi?» (hujjat ichida) | `L2C` — bir xil ko'rinadigan harflar |
| `src/lib/match.js` | Alifbolar orasidagi moslik, o'xshashlik bali | `TR` transliteratsiya, `UNIT_SAME` o'lchov birliklari |
| `src/lib/sections.js` | Материалы / машины / труд | `LEX` — har bir bo'limning so'z o'zaklari |
| `src/lib/regions.js` | Viloyat | `NAME` va `PLACE` — viloyat, shahar, tuman nomlari |

### O'lchov qayerda turadi

| Fayl | Nima | Yorliqni kim qo'ygan |
|---|---|---|
| `test/fixtures/resource-names.json` | 903 ta haqiqiy resurs nomi | — (faqat birlashmalarni tekshirish uchun) |
| `test/fixtures/resource-sections.json` | 2085 ta resurs + bo'limi | **smetaning o'zi** (qaysi band ostida turgani) |
| `test/fixtures/application-regions.json` | 1247 ta ariza + viloyati | **reyestrning o'zi** («место» ustuni) |

Yorliqlarni men ham, siz ham yozmaganmiz — ular hujjatlardan olingan. Shuning
uchun raqamlarga ishonish mumkin.

### Ish sikli: o'zgartir → o'lcha → qoldir yoki qaytar

```sh
# 1. Hozirgi raqamni yozib oling
node test/sections.cjs | grep "held out"
#    held out: 895 rows — right 824, wrong 1, no answer 70 (99.9% …)

# 2. Jadvalga bitta so'z qo'shing (quyida misollar)

# 3. Qayta o'lchang
node test/sections.cjs | grep "held out"

# 4. Raqam yaxshilandimi — qoldiring. Yomonlashdimi — qaytaring:
git checkout src/lib/sections.js
```

Uchta o'lchov buyrug'i:

```sh
node test/normalize.cjs   # nom kalitlari va o'xshashlik
node test/sections.cjs    # bo'lim
node test/regions.cjs     # viloyat
```

### Misol 1 — bo'limga yangi so'z qo'shish

Aytaylik, smetada `ГИДРОМОЛОТЫ` uchraydi va dastur uni tanimayapti.

```js
// src/lib/sections.js, machines ro'yxati ichida
['GIDROMOLOT', 3],   // гидромолот — mashina
```

O'zak **lotin harflarida va transliteratsiyadan keyingi ko'rinishda** yoziladi.
Qanday ko'rinishini bilish uchun:

```sh
node -e "
const fs=require('fs'),vm=require('vm');const c={console};vm.createContext(c);
for(const f of ['src/lib/normalize.js','src/lib/match.js'])
  vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
console.log(c.S.tokens('ГИДРОМОЛОТЫ ГИДРАВЛИЧЕСКИЕ'));
"
// -> [ 'GIDROMOLOTI', 'GIDRAVLICHESKIE' ]
```

O'zak — so'zning **boshi**: `GIDROMOLOT` `GIDROMOLOTI`, `GIDROMOLOTLAR` va
`ГИДРОМОЛОТА` ni ham qamrab oladi. Vazn: `3` — «bu so'z aynan shuni anglatadi»,
`2` — «kuchli, lekin boshqa bo'limda ham uchraydi», `1` — «kichik ishora».

### Misol 2 — viloyatga tuman qo'shish

```js
// src/lib/regions.js, PLACE ichida
namangan: '… CHUST CHORTOQ YANGI_TUMAN_NOMI',
```

**Ikki imlo kerak bo'lishi mumkin**, chunki ruscha va o'zbekcha bir xil
transliteratsiya qilinmaydi:

| Kirillcha | Lotincha | Natija |
|---|---|---|
| Андижон | Andijon | `ANDIZHON` va `ANDIJON` — ikkalasi kerak |
| Ёзёвон | Yozyovon | `EZEVON` va `YOZYOVON` — ikkalasi kerak |
| Самарқанд | Samarqand | `SAMARQ` bitta o'zak yetadi |

Tekshirish:

```sh
node -e "
const fs=require('fs'),vm=require('vm');const c={console};vm.createContext(c);
for(const f of ['src/lib/normalize.js','src/lib/match.js'])
  vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
for (const w of ['Ёзёвон','Yozyovon','Андижон','Andijon'])
  console.log(w.padEnd(12), c.S.matchKey(w));
"
```

**Ehtiyot bo'ling:** nom bir necha viloyatda uchrasa, uni **hech kimga
bermang**. `Улуғбек` — shaxs ismi (Samarqanddagi rasadxona, ko'chalar),
`Олмазор` — 11 ta viloyatdagi mahalla, `Зарафшон` — daryo. Bular ataylab
ro'yxatga kiritilmagan va `test/regions.cjs` buni qulflab qo'ygan.

### Misol 3 — o'lchov birligi sinonimi

```js
// src/lib/match.js, UNIT_SAME ichida
DONA: 'SHT',      // o'zbekcha "dona" = "шт"
```

Lekin `100ШТ` va `ШТ` **hech qachon** birlashmaydi — yuztalik narx bilan
donabay narx boshqa narsa.

### Buzilmasligi kerak bo'lgan qoidalar

1. **Raqamlar saqlanadi.** `АНКЕР М5` ≠ `АНКЕР М8`, `4.1.1` ≠ `4.11`,
   `СТАЛЬ А-I` ≠ `СТАЛЬ А-III`. Ikki raqam orasidagi ajratgichni hech qachon
   shunchaki o'chirmang — `1, 5` va `15` bitta bo'lib qoladi.
2. **Ayniylik kaliti (`nameKey`) moslik kalitidan (`matchKey`) ehtiyotkorroq.**
   `matchKey` birlashtirgan hamma narsani `nameKey` ham birlashtira olmasligi
   kerak, aksi emas. Testda shu tekshiriladi.
3. **Материалы ↔ оборудование chegarasi «xato» deb aytilmaydi** — smetalarning
   o'zi ko'cha chirog'ini goh u, goh bu bandga qo'yadi.
4. **Taklif — taklif, buyruq emas.** Hech qanday kod foydalanuvchi bosmasdan
   narxni yozmaydi.

### Yangi hujjatlar kelganda

Yangi smeta yoki yangi reyestr eksporti kelsa, o'lchov ma'lumotini yangilang:

```sh
node test/fixtures.cjs --smeta yangi1.xlsx yangi2.xlsx --registry yangi-reestr.xls
node test/normalize.cjs && node test/sections.cjs && node test/regions.cjs
```

Raqamlar tushib ketsa — yangi hujjatlarda dastur bilmaydigan so'zlar bor,
demak yuqoridagi jadvallarga qo'shish kerak. Bu — loyihaning «o'rganishi»:
model emas, siz.

### Menga qanday topshiriq berish qulay

Eng foydali shakl — **misol bilan**:

> «Bu ikki nom bitta resurs, lekin dastur ularni ajratyapti:
> `ТРУБА ПНД Д-110` va `ТРУБА ПОЛИЭТИЛЕНОВАЯ Д-110ММ`»

yoki

> «Косонсой Namanganda, lekin dastur Qashqadaryo deyapti»

Shunday misoldan men (a) uni takrorlaydigan test yozaman, (b) qoidani
tuzataman, (c) 1247 ta arizada raqam yomonlashmaganini ko'rsataman. Uchtasi
ham bo'lmasa — o'zgarish qilinmaydi.
