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
node build.mjs                                        # dist/smeta-taqqoslash.html + index.html + admin.html
node build.mjs --serve                                # ... va server/pb_public ga nusxa
node test/pipeline.cjs a.xlsx b.xlsx --out out.xlsx   # brauzersiz tekshiruv
node test/browser.mjs a.xlsx b.xlsx                   # haqiqiy brauzerda (bitta-fayl rejim)
sh server/setup.sh && sh server/run.sh                # PocketBase (server rejimi), README «Server rejimi»
sh test/pb-smoke.sh; node test/e2e-workspace.mjs      # server rejimi testlari
```

Ikki mahsulot: bitta-fayl `dist/smeta-taqqoslash.html` (serversiz, avvalgidek)
va server rejimi `dist/index.html` + `dist/admin.html` (PocketBase orqali).
`src/lib/` yadro ikkalasiga umumiy; server qismi `S.pb` bo'lmasa o'zini o'chiradi.

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
