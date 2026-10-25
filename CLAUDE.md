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
sh server/laptop.sh [autostart|status|backup|update|stop]   # noutbuk rejimi: bitta odam, baza shu diskda
server\laptop.cmd [autostart|status|backup|update|rollback|autoupdate|drive|stop|debug|doctor]   # xuddi shu, Windows'da (Node/Git kerak emas)
irm https://raw.githubusercontent.com/1maxstar1/Ayubkhon_A/HEAD/server/install-windows.ps1 | iex   # Windows: bitta qator bilan o'rnatish/yangilash
sh test/laptop-windows.sh                             # Windows ishga tushirgichi, pwsh ostida
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
Server rejimi uch joyda turishi mumkin: noutbukda (`server/laptop.sh` Mac/Linux,
`server/laptop.cmd` Windows; bitta odam — kirish kodi pochtaga ketmaydi,
`PB_LAPTOP=1` da shu kompyuterga qaytariladi), ofis tarmog'ida (`server/lan.sh`) yoki VPS da
(`server/deploy/push.sh`). Kod bitta — farqi faqat qayerda ishlashida.
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
* **Xavfsizlik bo'limi hozircha o'chirilgan (egasining qarori, 2026-10-24).**
  Dastur bitta odamning o'z kompyuterida ishlaydi, uni boshqa hech kim
  ishlatmaydi va ko'rmaydi — shuning uchun noutbuk rejimida kirish oynasi,
  4 soatlik qulf va «Выйти» yo'q: sahifa ochilishi bilan ichkaridasiz
  (`PB_AUTOLOGIN=1`, `server/pb_hooks/laptop.pb.js`, `src/ui/auth.js`
  `autoSignIn`). **Bu vaqtinchalik — egasi uni keyin qaytarmoqchi.** Hech narsa
  o'chirib tashlanmagan: hisob, qoidalar, «kim qaysi narxni yozgan» joyida.
  Qaytarish: noutbukda `PB_AUTOLOGIN=0` bilan ishga tushirish (kirish oynasi
  qaytadi, kod o'zi to'ldiriladi); ko'p foydalanuvchiga o'tishda (`lan.sh`,
  VPS) esa o'z-o'zidan qaytadi — u yerda `PB_AUTOLOGIN` yo'q, kod pochtaga
  ketadi. Bitta himoya o'chirilmaydi: avtomatik kirish faqat dasturning o'z
  sahifasiga beriladi, brauzerda ochiq boshqa saytga emas
  (`server/pb_hooks/lib/laptop.js`).
* Har bir versiya sahifa sarlavhasida ko'rinadi va orqaga qaytariladi
  (`server/deploy/rollback.sh`); ish maydoni narxlarni eski va yangi kalitda
  saqlaydi, shuning uchun qaytish ma'lumot yo'qotmaydi.
* **Windows noutbuk o'zi yangilanadi** — faqat `server/releases.txt` dagi
  relizga (o'rnatuvchi `install-windows.ps1` ham shu ro'yxatdan oladi). Reliz
  chiqarish: `package.json` versiyasini ko'tarish → `node build.mjs` →
  testlar (`test/laptop-windows.sh` ham) → commit + push; keyin **alohida
  commit** bilan `releases.txt` ga `vX.Y.Z <o'sha commit hash>` qatori va
  `docs/versiyalar.md` ga qator. Versiya raqami hech qachon qayta
  ishlatilmaydi — buzilgan relizni keyingi patch-versiya tuzatadi. Har bir
  versiya `%LOCALAPPDATA%\Taqqoslash\app\` da o'z papkasida turadi,
  `current.txt` qaysi biri ishlashini aytadi; yangi versiya o'zini sinovdan
  o'tkazmaguncha ko'rsatkich o'zgarmaydi. Versiyalar orasidagi kelishuv
  (to'liq ro'yxati `server/laptop.ps1` boshida: buyruq qatori, ko'rsatkichlar,
  `TAQ_LAUNCHER`, `serve`/`serve resumed`/`serve trial`, `selftest`, pid
  fayllari, `trial.ok`, `supervisor.beat`, `FAILED`/`ROOT_SEEN`, `serve` ning
  chiqish kodlari) keyingi versiyalarda **o'zgarmasligi shart** — `C:\Smeta`
  dagi eski ishga tushirgich shu orqali yangilarini ishga tushiradi. Eslatma: v2.3
  ning `laptop.cmd update` i (birinchi o'tish) shoxning oxirgi holatini oladi —
  shuning uchun o'sha paytda shoxda faqat relizning o'zi turishi kerak.
