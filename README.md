# Smeta — Taqqoslash jadvali №2

Loyiha-smeta hujjatlaridagi resurs narxlarini tekshirish, tuzatish va rasmiy
**TAQQOSLASH JADVALI №2** hujjatini tayyorlash uchun mo'ljallangan dastur.

Butun dastur — bitta HTML fayl: **`dist/smeta-taqqoslash.html`**.
Uni yuklab olib, brauzerda ochish kifoya. O'rnatish, internet, server kerak emas;
fayllar kompyuterdan chiqmaydi.

---

## Ish tartibi

1. **Smeta fayllarini qo'shing.** Har bir `.xlsx` — bitta loyiha. Ichidagi
   ko'cha/obyekt varaqlari (`1.G-27`, `2.G-27,1`, … `14.Перевозка`) avtomatik
   topiladi; `свод`, `сводная` kabi yig'ma varaqlar chetlab o'tiladi.
   Bir vaqtning o'zida istagancha loyiha qo'shsa bo'ladi.

2. **Yig'ish.** Barcha obyekt varaqlari bitta uzluksiz `Лист1` ga ketma-ket
   qo'yiladi, ustunlar bir pozitsiyaga suriladi va `ЦЕНА ЗА ЕД.` / `СУММА`
   ustunlarining nusxasi — bozor narxi uchun — yoniga qo'shiladi:

   | A | B | C | D | E | F | G | H | I | J | K… |
   |---|---|---|---|---|---|---|---|---|---|----|
   | qator raqami | № | НАИМЕНОВАНИЕ | ЕД.ИЗМ. | КОЛ-ВО | ЦЕНА (smeta) | СУММА `=E*F` | ЦЕНА (bozor) | СУММА `=E*H` | Фарқ `=G-I` | manba varaqning qo'shimcha ustunlari |

   `ИТОГО`, `ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ`, `ТРАНСПОРТНЫЕ УСЛУГИ` qatorlarining
   formulalari ko'chirilganda ustun va qator havolalari to'g'rilanadi, bozor
   tomoni uchun esa `F→H`, `G→I` almashtirish bilan aynan shu formulaning
   ikkinchi nusxasi yasaladi.

3. **Narxlarni tekshiring.** «Narxlarni tekshirish» varag'ida har bir resurs
   **bir marta** ko'rinadi — nechta ko'chada uchrashidan qat'i nazar. Bozor
   narxini bir joyda yozasiz, u butun loyiha bo'ylab barcha qatorlarga qo'llanadi.
   Narxi to'g'ri bo'lganini tegmay qoldirasiz — farq `0` bo'lib qoladi.

   * `Enter` / `↓` — keyingi qatorga o'tish, `Esc` — smeta narxini qaytarish.
   * Filtrlar: faqat o'zgartirilganlar, narxi `0` bo'lganlar, bitta nom ostida
     bir nechta smeta narxi uchraydiganlar.
   * `% qo'llash` — ko'rinib turgan barcha resurslarga foizda tuzatish.
   * `Narx kitobi` — tuzatilgan narxlarni `.json` ga saqlash va keyingi
     loyihada qayta ishlatish (`.xlsx` ro'yxatini ham qabul qiladi).

4. **Excel yuklab oling.** Bitta fayl chiqadi:
   * `Лист1` — yig'ilgan to'liq jadval;
   * har bir loyiha uchun alohida varaq (nomini chap tomondan o'zgartirasiz) —
     `TAQQOSLASH JADVALI №2`.

---

## Hisobot varaqining uch rejimi

| Rejim | Nima chiqadi |
|---|---|
| **Faqat o'zgargan narxlar (tozalangan)** | Faqat narxi tuzatilgan resurslar. Bir xil **nom + narx** — bitta qator, `КОЛ-ВО` barcha ko'chalar bo'yicha qo'shiladi. Nomi bir xil, narxi boshqa bo'lsa — alohida qatorlar. Nomi boshqa, narxi bir xil bo'lsa — ham alohida. Bo'limlar (`ЗАТРАТЫ ТРУДА`, `МАШИНЫ`, `МАТЕРИАЛЫ`, `ОБОРУДОВАНИЕ`), har biriga `ИТОГО` va oxirida `ЖАМИ / ВСЕГО`. |
| **Barcha resurslar (tozalangan)** | Yuqoridagi bilan bir xil, lekin narxi o'zgarmaganlar ham qoladi. |
| **To'liq nusxa** | Loyihaning har bir qatori, hech narsa tashlanmaydi. Narxi o'zgargan qatorlar o'z o'rnida alifbo tartibida saralanadi — ya'ni Excelda `фарқ ≠ 0` bo'yicha filtr qo'yib, nom bo'yicha saralaganda chiqadigan natijaning aynan o'zi. |

Hisobot varag'ining ustunlari va ko'rinishi namunaviy fayldan olingan:
`A`, `КОЛ-ВО` va summa ustunlari yashirin, chop etish gorizontal, `75%`,
`6:7` qatorlari har bir sahifada takrorlanadi.

---

## Format

Eksport qilingan fayl namunaviy hujjat bilan bir xil ko'rinadi:

* Times New Roman 10 (sarlavha bloklari 11, shtamp 8);
* `CCFFFF` — sarlavha, bo'lim va `ИТОГО` yo'llari; `D9E2F3` — o'zbekcha sarlavha bandi;
* ingichka chegaralar, `#,##0`, `#,##0.000`, `0.000` raqam formatlari;
* `10 000 000` dan katta summalar uchun pushti shartli formatlash (`FFC7CE` / `9C0006`);
* `B2:L2` va `A3:L4` birlashtirilgan kataklar, avtofiltr, ustun kengliklari,
  qator balandliklari.

Formulalar tirik holda saqlanadi — Excelda ochilganda qayta hisoblanadi, ya'ni
faylni qo'lda tahrirlashda davom etsa bo'ladi.

---

## Tezlik

Draft versiyaning sekinligi ikkita sababdan edi: butun jadval DOM ga
chizilar va har bir narx o'zgarganda hammasi qaytadan qurilardi. Bu yerda:

* `.xlsx` fayllar Web Worker'da o'qiladi — oyna qotib qolmaydi;
* jadvallar virtualizatsiya qilingan — ekranda ko'rinib turgan ~40 qator
  mavjud, qolgani yo'q;
* narx o'zgarganda faqat o'sha resursga tegishli qatorlar yangilanadi;
* SheetJS o'rniga faqat kerakli qismi yozilgan o'qish/yozish kodi ishlatiladi.

O'lchov (2 ta loyiha, 28 obyekt varag'i, 6 246 qator, 901 resurs):
o'qish + yig'ish ≈ **1,3 s**, narx tuzatish ≈ **0 ms**, eksport ≈ **0,5 s**,
tayyor fayl **≈ 0,5 MB**.

---

## Loyiha tuzilishi

```
src/
  index.html          dastur oynasi
  app.css
  worker.js           .xlsx ni fon oqimida o'qish
  vendor/fflate.umd.js
  lib/
    util.js           umumiy yordamchilar, nom kaliti, raqam formatlari
    formula.js        formulalarni ustun/qator xaritasi bo'yicha ko'chirish
    xlsx-read.js      .xlsx o'qish (skaner, DOM emas)
    xlsx-write.js     to'liq formatli .xlsx yozish
    smeta.js          obyekt varaqlarini tanish va qatorlarga ajratish
    assemble.js       Лист1 ni yig'ish + resurslar ro'yxati
    report.js         TAQQOSLASH JADVALI №2 (uch rejim)
    export.js         uslublar va tayyor kitob
  ui/
    grid.js           virtual jadval
    prices.js         narx ustaxonasi
    app.js            ulanish
test/
  pipeline.cjs        brauzersiz to'liq o'tkazish (node)
  browser.mjs         haqiqiy brauzerda uchidan-uchiga test
build.mjs             hammasini bitta HTML ga yig'adi
dist/smeta-taqqoslash.html
```

### Yig'ish

```sh
node build.mjs                       # dist/smeta-taqqoslash.html
node build.mjs --watch               # ishlab chiqish paytida

node test/pipeline.cjs a.xlsx b.xlsx --out out.xlsx   # yadro testi
npm i -D playwright && node test/browser.mjs a.xlsx b.xlsx
```
