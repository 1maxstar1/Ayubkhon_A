# Loyiha haqida

Smeta resurs narxlarini tekshirish va **TAQQOSLASH JADVALI №2** hujjatini
tayyorlash vositasi. To'liq tavsif — `README.md` da. Keyingi bosqich
(ko'p foydalanuvchi, PocketBase, narx xotirasi) talablari — `docs/2-bosqich-reja.md`,
bosqichma-bosqich kodlash ko'rsatmasi — `docs/2-bosqich-kod-rejasi.md`.

## Muloqot tili

**Foydalanuvchiga har doim o'zbek tilida (lotin alifbosida) javob berish.**
Kod, izohlar va commit xabarlari ingliz tilida qoladi; dastur interfeysi
o'zbekcha, hujjat matnlari rus/o'zbek tilida — manba fayllarda qanday bo'lsa,
shunday.

## Ishlash tartibi

```sh
node build.mjs                                        # dist/smeta-taqqoslash.html
node test/pipeline.cjs a.xlsx b.xlsx --out out.xlsx   # brauzersiz tekshiruv
node test/browser.mjs a.xlsx b.xlsx                   # haqiqiy brauzerda
```

Yakuniy mahsulot — bitta fayl: `dist/smeta-taqqoslash.html`. O'zgartirishdan
keyin uni qayta yig'ish va foydalanuvchiga yuborish kerak.

## Muhim qoidalar

* Eksport qilingan `.xlsx` namunaviy hujjat (`321.xlsx`) bilan **bir xil
  ko'rinishda** bo'lishi shart: Times New Roman 10, `CCFFFF` / `D9E2F3`
  bandlar, ingichka chegaralar, `#,##0` va `0.000` formatlari, `10 000 000`
  dan katta summalar uchun pushti shartli formatlash.
* Formulalar tirik saqlanadi — `=E*F`, `=E*H`, `=+G-I`, `SUM(...)`.
* Bitta resursning bozor narxi — nomi va o'lchov birligi bo'yicha bitta qiymat;
  u loyihadagi **barcha** qatorlarga tushadi.
* Bir resurs smetalarda bir nechta narx bilan uchrashi mumkin. Foydalanuvchi
  narx yozmaguncha **har bir qator o'z smeta narxida turadi** — farq `0`.
  Summalarni hisoblashda har doim qatorma-qator yig'ish kerak, «umumiy
  miqdor × bitta narx» emas.
