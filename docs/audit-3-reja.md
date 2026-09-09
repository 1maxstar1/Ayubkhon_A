# Uchinchi tekshiruv — o'lchov bilan

Ikkinchi reja (`docs/audit-2-reja.md`) tugagach, kod yana o'qib chiqildi:
oltita yo'nalish (kalitlar, o'xshashlik, bo'limlar, viloyatlar, integratsiya,
xavflar), har biriga ikkitadan **rad etuvchi** tekshiruvchi. 54 ta topilma
chiqdi; ularning har biri mustaqil ravishda qayta o'lchandi.

Bu roundning asosiy qoidasi bitta edi, `CLAUDE.md` dan: **NLP jadvallari va
o'xshashlik bahosi o'lchovsiz o'zgartirilmaydi**. Shuning uchun quyida
tuzatilganlar bilan bir qatorda **o'lchov rad etgan takliflar** ham yozilgan —
ular ham xuddi shunday qimmatli, chunki keyingi safar qayta taklif qilinmaydi.

Holat belgilari: `[x]` bajarilgan va testdan o'tgan · `[~]` o'lchov asosida
rad etilgan.

---

## Yakun

| | avval | hozir |
|---|---|---|
| Yuqoridagi taklif narxi resurs narxidan 25% dan uzoq | 37 | **12** |
| … uch barobardan uzoq | 13 | **3** |
| To'rttadan biri uch barobardan uzoq | 20 | **3** |
| Bo'lim: yashirin varaqda xato javob | 1 | **0** |
| Testlar | 24 | **25** |

Yangi o'lchov vositasi: `node test/hints.cjs a.xlsx b.xlsx` — «Похожие
ресурсы» tiyerini narx bilan o'lchaydi. Hech narsa yozilmaydi, smeta faqat
xotirada o'qiladi.

---

## Tuzatilganlar

### [x] 3.1 Boshqa mahsulot birinchi o'rinda turardi

`src/lib/match.js` — **high** · commit `e56b093`

Ikki nom bitta so'zdan tashqari hammasi bilan bir xil bo'lishi, va shunga
qaramay ikki xil narsa bo'lishi mumkin: «ПЕРЕХОД ПОЛИЭТИЛЕНОВЫЙ Д-63Х20ММ»
5 210, «АДАПТЕР ПОЛИЭТИЛЕНОВЫЙ Д-63Х20ММ» 82 087; «СТАНКИ СВЕРЛИЛЬНЫЕ» va
«СТАНКИ ФРЕЗЕРНЫЕ» — o'n sakkiz barobar farq. Beshta so'zdan to'rttasi bir xil
bo'lgani uchun kosinus baland, tahrir masofasi kichik — va noto'g'ri narx
ekspertga birinchi bo'lib taklif qilinardi.

Ularni «ЩЕБЕНЬ ФРАКЦИЯ» / «ЩЕБЕНЬ ФРАКЦИИ» dan ajratadigan narsa — nomlarning
bir-biridan qanchalik uzoqligi emas, **farq qiladigan so'zlar bitta so'zmi
yo'qmi**: bitta so'zning ikki imlosi umumiy o'zakka ega yoki bitta xatolik
masofasida turadi, ikki xil so'z esa ikkalasiga ham ega emas. Shuning uchun:
har ikkala tomon ham qarshi tomonda imlosi yo'q so'zni ko'tarib yursa, ular
umuman o'xshash emas. Bir tomonlama farq ataylab yetarli emas — «БЕТОН В15»
va «БЕТОН ТЯЖЕЛЫЙ КЛАССА В15» bitta beton, faqat to'liqroq yozilgan.

### [x] 3.2 To'ldirish butun tarixni yangilab yuborardi

`server/pb_hooks/lib/admin.js` — **high** · commit `2fed560`

Podskazkalar ro'yxati `updated` bo'yicha tartiblanadi. Eski sahifa yozgan
tuzatishlarga `match_key` ni to'ldiradigan migratsiya har bir yozuvni
**saqlash** orqali qilardi — saqlash esa `updated` ni yangilaydi. Yangilangan
serverning birinchi ishga tushishi butun viloyat tarixini bir daqiqaga
muhrlab, qaysi loyiha qachon nima to'laganini aralashtirib yuborardi. Endi ikki
ustun `UPDATE` bilan yoziladi.

### [x] 3.3 Mashina-soat o'lchovi ovoz berishda yutqazardi

`src/lib/sections.js` — **medium** · commit `676d072`

Smetada mashina mashina-soat bilan, ishchi kishi-soat bilan olinadi, va
kitobda boshqa hech narsa bu o'lchovlarda turmaydi — lekin o'lchov olti ball
edi va nom uni yenga olardi. «МАШИНЫ ДЛЯ ОЧИСТКИ И ГРУНТОВКИ ТРУБ», МАШ-Ч da,
shu tariqa **material** bo'lib chiqardi: ГРУНТОВКА kilogramm bilan sotiladigan
grunt. O'lchov bo'yicha hal qilish МАШ-Ч uchun 402 dan 402 marta, ЧЕЛ-Ч uchun
5 dan 5 marta to'g'ri; yashirin varaqda 824 to'g'ri va 1 xato → **825 va 0**.

### [x] 3.4 «Сбросить» butun bo'lib bitta so'rovga tushardi

`src/ui/sync.js` — **medium** · commit `2aa19d2`

Server bitta so'rovda uch mingdan ortiq qatorni rad etadi va o'chirishlarni
ham shu hisobga qo'shadi. Yozishlar mingtalab bo'lakka bo'linardi, o'chirishlar
esa **butun bo'lib birinchi so'rovga** qo'shilardi. Uch ming resursi qayta
narxlangan loyihada «Вернуть сметные цены» rad etilar, o'ttiz soniyadan keyin
qayta yuborilar va yana rad etilardi — ekspertning butun harakati navbatda
qolib ketardi.

### [x] 3.5 Bitta ommabop resurs butun bo'lakni jimlantirardi

`src/ui/hints.js` — **medium** · commit `25eec7a`, `5bd5e45`

Bitta so'rov filterga sig'gan barcha kalitlarni so'raydi (haqiqiy loyihada 53
ta) va javobning eng yangi ming qatorini oladi. Bu ikki raqamning bir-biriga
aloqasi yo'q. Har bir loyiha sotib oladigan bitta resurs shu sahifani o'zi
to'ldiradi, qolgan 52 kalit bo'sh qaytadi, «olingan» deb belgilanadi va sessiya
oxirigacha podskazkasiz qoladi — ekranda buning sababi ko'rinmaydi. Endi to'la
sahifa javob emas: bo'lak ikkiga bo'linib qayta so'raladi, bitta kalitgacha.

---

## O'lchov rad etgan takliflar

### [~] 3.6 Noma'lum so'zga eng katta og'irlik berish

Taklif: `weightOf` da noma'lum tokenga 1 emas, korpusdagi eng katta idf ni
berish (nazariy jihatdan to'g'ri: hech kimda yo'q so'z eng ma'lumotli). O'lchov:
**4 ta to'g'ri taklif yo'qoladi, 2 tasi yutiladi**. Sababi — u to'liqroq
yozilgan nomni jazolaydi: «АНКЕР М8 10Х120» ← «АНКЕР М8», «ТРОЙНИК
РАВНОПРОХОДНЫЕ …» ← «ТРОЙНИК …», ikkalasi ham bir xil narxda.

### [~] 3.7 Ko'plik / o'ram shaklini pasaytirish

Taklif: ikki bosh so'z faqat ЫЙ/ЫЕ/АЯ oxiri bilan farq qilsa, bahoni `SIM_MIN`
dan pastga tushirish. Bu `test/normalize.cjs` dagi hujjatlashtirilgan
«ТРОЙНИК ПОЛИЭТИЛЕНОВЫЕ» / «ТРОЙНИКИ ПОЛИЭТИЛЕНОВЫЙ» holatiga zid — ya'ni
tiyer aynan shuning uchun qurilgan edi. Rad etildi.

### [~] 3.8 Bir tomonlama qo'shimcha so'zni pasaytirish

Taklif: bir tomonda qarshi tomonda yo'q so'z bo'lsa, bahoni 0.7 ga ko'paytirish
(«ХОМУТ НА ОПОРЕ» ← «ХОМУТ», 5.7 barobar). O'lchov: **25 ta haqiqiy podskazka
yo'qoladi, 3 tasi yutiladi** — «БЕТОН В15» ← «БЕТОН ТЯЖЕЛЫЙ КЛАССА В15»,
«ТРУБА СТАЛЬНАЯ Д-102Х4ММ» ← «… (КОЖУХ)», «БОЛТ ГАЙКА М=16» ← «БОЛЬТЫ,ГАЙКИ
М=16» kabi. Rad etildi.

### [~] 3.9 Ko'cha / mahalla so'zlarini o'zak bo'yicha tanish

`SKIP_BEFORE` aniq ro'yxat, o'zbek tili esa bu so'zlarni cheksiz turlaydi.
Reyestrning 1247 arizasida ro'yxatda yo'q **42 ta imlo, 150 marta** uchraydi —
ya'ni kamchilik haqiqiy ko'rinadi. Lekin ulardan **to'qqiztasigina**
gazetadagi nom bilan yonma-yon turadi va **birortasi ham javobni
o'zgartirmaydi**: o'sha qatorlarning hammasi o'z tumanini ham aytadi
(«Чилонзор тумани Арнасой кўчасидаги»), tuman esa ko'chadan kuchliroq. Rad
etildi — o'lchov hech narsa bermaydi, ustiga КЎЧАТ (ko'chat) ni o'rgatish
kerak bo'lardi.

### [~] 3.10 «G'allaorol MGQB» ni idora nomi deb o'tkazib yuborish

Bu — benchmarkdagi eng katta yagona dalil sinfi: `<joy> MGQB` 76 qatorda
uchraydi, va idoraning manzili ish joyi emas. O'lchov: **38 ta to'g'ri javob
yo'qoladi, 12 tasi buziladi, 2 tasi tuzatiladi**. Gaz boshqarmasi asosan o'z
viloyatida ishlaydi; ishlamagan joyda esa sarlavhada buni aytadigan hech narsa
yo'q. Rad etildi.

### [~] 3.11 «Янги Тошкент» ni viloyatga berish

Benchmarkdagi eng katta xato sinfi (39 tadan 24 tasi). Qayta o'lchandi:
reyestrning o'zi buni **shahar deb 28 marta, viloyat deb 27 marta** yozadi.
Kod buni allaqachon biladi va ataylab hal qilmaydi — ishonch 0.52, ekran
ikkinchisini ham taklif qiladi. Tuzatiladigan narsa yo'q.

---

## Qolgan xatolar — nima uchun qolgan

Yo'l nomi ikki uchi bilan ataladi: «Ғузор-Бухоро-Нукус-Бейнеу автомобиль
йўлининг 698-765 км». Ish qayerdaligini kilometr belgisi aytadi, sarlavha
emas. Buning uchun yo'l geografiyasi jadvali kerak — reyestrda u yo'q.

---

## Ishlash tartibi

Har bir band alohida commit, har biridan keyin:

```sh
sh test/all.sh reestr.xls smeta1.xlsx smeta2.xlsx     # 25 ok, 0 fail
```

O'lchovga tegadigan har bir o'zgarish uchun avval raqam yozib olinadi, keyin
o'zgartiriladi, keyin qayta o'lchanadi — va raqam yaxshilanmasa, qaytariladi.
