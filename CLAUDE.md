# Loyiha haqida

Smeta resurs narxlarini tekshirish va **TAQQOSLASH JADVALI №2** hujjatini
tayyorlash vositasi. To'liq tavsif — `README.md` da. Keyingi bosqich
(ko'p foydalanuvchi, PocketBase, narx xotirasi) talablari — `docs/2-bosqich-reja.md`,
bosqichma-bosqich kodlash ko'rsatmasi — `docs/2-bosqich-kod-rejasi.md`.
Versiyalar, orqaga qaytish va NLP jadvallarini o'lchov bilan o'zgartirish —
`docs/versiyalar.md`. Uchta to'liq tekshiruv va ularning natijalari — `docs/audit-plan.md`
(birinchi), `docs/audit-2-reja.md` (ikkinchi) va `docs/audit-3-reja.md`
(uchinchi, o'lchov bilan: rad etilgan takliflar ham yozilgan).

## Muloqot tili

**Foydalanuvchiga har doim o'zbek tilida (lotin alifbosida) javob berish.**
Kod, izohlar va commit xabarlari ingliz tilida qoladi; **dastur interfeysi
ruscha** (foydalanuvchi talabi, 2026-09-04); eksport hujjat matnlari (shtamp,
sarlavha, ikki tilli sarlavha qatori) 321.xlsx namunasidagidek rus/o'zbek.

## Ishlash tartibi

```sh
node build.mjs                                        # dist/smeta-taqqoslash.html + index.html + admin.html
node build.mjs --serve                                # ... va server/pb_public ga nusxa
node test/pipeline.cjs a.xlsx b.xlsx --out out.xlsx   # brauzersiz tekshiruv
node test/browser.mjs a.xlsx b.xlsx                   # haqiqiy brauzerda (bitta-fayl rejim)
sh server/setup.sh && sh server/run.sh                # PocketBase (server rejimi), README «Server rejimi»
sh test/pb-smoke.sh; node test/e2e-workspace.mjs      # server rejimi testlari
node test/normalize.cjs; node test/sections.cjs; node test/regions.cjs   # NLP o'lchovlari
node test/hints.cjs a.xlsx b.xlsx                      # o'xshash resurs takliflari o'lchovi
node test/fixtures.cjs --smeta a.xlsx --registry r.xls  # o'lchov ma'lumotini yangilash
sh server/deploy/find-server.sh; sh server/deploy/find-server.sh 1   # server manzilini topib eslab qolish (bir marta)
sh server/deploy/pull-backup.sh && sh server/deploy/push.sh          # zaxira + chiqarish (manzil eslab qolingan)
sh server/deploy/rollback.sh v2.1                     # serverni eski versiyaga qaytarish
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
* NLP jadvallari (`sections.js` `LEX`, `regions.js` `NAME`/`PLACE`,
  `match.js` `UNIT_SAME`) va o'xshashlik bahosi (`match.js` `similarity`)
  **o'lchovsiz o'zgartirilmaydi**: har bir o'zgarish `test/sections.cjs` /
  `test/regions.cjs` / `test/hints.cjs` raqamlari bilan asoslanadi.
  Bir necha viloyatda uchraydigan joy nomi hech kimga berilmaydi.
* Raqamlar hech qachon yo'qolmaydi: `АНКЕР М5` ≠ `АНКЕР М8`, `4.1.1` ≠ `4.11`;
  ikki raqam orasidagi ajratgich o'chirilmaydi.
* Har bir versiya sahifa sarlavhasida ko'rinadi va orqaga qaytariladi
  (`server/deploy/rollback.sh`); ish maydoni narxlarni eski va yangi kalitda
  saqlaydi, shuning uchun qaytish ma'lumot yo'qotmaydi.
