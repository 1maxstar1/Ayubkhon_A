# Smeta — Taqqoslash jadvali №2

Loyiha-smeta hujjatlaridagi resurs narxlarini tekshirish, tuzatish va rasmiy
**TAQQOSLASH JADVALI №2** hujjatini tayyorlash uchun mo'ljallangan dastur.

Dastur interfeysi **rus tilida**; eksport hujjat matnlari (shtamp, sarlavha,
ikki tilli sarlavha qatori) 321.xlsx namunasidagidek.

Butun dastur — bitta HTML fayl: **`dist/smeta-taqqoslash.html`**.
Uni yuklab olib, brauzerda ochish kifoya. O'rnatish, internet, server kerak emas;
fayllar kompyuterdan chiqmaydi.

---

## Ish tartibi

1. **Smeta fayllarini qo'shing.** Har bir `.xlsx` — bitta loyiha. Ichidagi
   ko'cha/obyekt varaqlari avtomatik topiladi; `свод`, `сводная` kabi yig'ma
   varaqlar chetlab o'tiladi. Bir vaqtning o'zida istagancha loyiha qo'shsa
   bo'ladi.

   Varaq **nomi ahamiyatga ega emas** va ustunlar qayerdan boshlanishi ham
   muhim emas — jadval sarlavhasi (`НАИМЕНОВАНИЕ · ЕД.ИЗМ. · КОЛ-ВО · ЦЕНА ·
   СУММА`) bo'yicha topiladi. Sarlavha qatori umuman bo'lmasa (masalan
   `ПЕРЕВОЗКА` varaqlari), tuzilma birinchi resurs qatoridan aniqlanadi — bu
   holda `ЗАТРАТЫ ТРУДА / МАШИНЫ / МАТЕРИАЛЫ / ОБОРУДОВАНИЕ` bo'limlaridan
   kamida bittasi bo'lishi shart (o'zbekcha nomlari ham tanib olinadi).
   Narxlari `ВПР`/`VLOOKUP` formulasi bilan qo'yilgan bo'lsa ham o'qiladi.

   **4А shakli (АВС-4, «Локальный ресурсный сметный расчет»)** ham o'qiladi
   (v2.5.1): sarlavhasi `№ п/п · Шифр ресурсов · Наименование · Единица
   измерения · Количество единиц · Сметная стоимость (на единицу / общая)`.
   Bitta varaqda ketma-ket turgan har bir lokal smeta alohida obyekt bo'ladi
   (`РА · 1`, `РА · 2` …, nomi — smeta raqami, «на …» va «Наименование
   объекта»), loyiha nomi — «Наименование стройки». Resurs — faqat raqamli
   qatorlar; `В Т.Ч. ЗАТРАТЫ ТРУДА МАШИНИСТОВ …` va yakuniy `ЗАТРАТЫ ТРУДА
   РАБОЧИХ` resurs emas. `Шифр` ustuni taqqoslash jadvaliga o'tmaydi.

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

   Smeta formulasi faqat oddiy funksiyalardan (yig'indi, yaxlitlash, shart,
   sanash, varaq ichidagi qidiruv) iborat bo'lsa tirik ko'chadi. Smeta
   tashqaridan keladi, hujjat esa imzolanib uzatiladi — shuning uchun tashqi
   manzilga murojaat qiladigan (`WEBSERVICE`, `HYPERLINK` …) yoki ro'yxatda
   yo'q funksiyali formula o'rniga smetaning o'zi ko'rsatgan qiymat yoziladi
   va sahifa bunday formulalar nechtaligini aytadi (v2.9.4).

   Smetada `ИТОГО` formula emas, **yozib qo'yilgan son** bo'lsa (4А shaklining
   har bir jamisi shunday), u nimaning yig'indisi ekani topiladi — o'z
   bandining qatorlarimi yoki oldingi jamilarmi («ИТОГО ПРЯМЫЕ ЗАТРАТЫ») — va
   ikkala tomonga ham shu yig'indi formula bo'lib yoziladi (v2.9.2): narx
   o'zgarsa, bozor jamisi ham o'zgaradi. Smeta jamini butun so'mga yaxlitlab
   bosadi, shuning uchun formula natijasi bosilgan sondan yarim so'mgacha farq
   qilishi mumkin. Qatorlari tushuntirmaydigan jami «qatorlar yig'indisi +
   qoldiq» ko'rinishida yoziladi (`=SUM(G30:G31)+7`): smeta tomoni o'sha sonni
   ko'rsatadi, bozor tomoni qatorlar qancha o'zgargan bo'lsa shuncha o'zgaradi.

3. **Qator raqamlari (A ustuni).** `Лист1` ning `A` ustuni butun varaq bo'ylab
   `1 … N` bo'lib boradi, va dastur qaysi raqamlar qaysi loyihaga tegishli
   ekanini o'zi ko'rsatadi — daftarga yozib qo'yish shart emas:

   * chap tomonda har bir loyiha va har bir ko'cha yonida oralig'i turadi
     (`Фарғона 1–3749`, `Марғилон 3750–6246`, `G-54 KO'CHASI 1814–2380`);
   * «Yig'ilgan jadval» varag'ida yuqorida — hozir ko'rinib turgan qator qaysi
     loyiha va qaysi ko'chaga tegishli;
   * «Blokka o'tish» ro'yxatida ham shu oraliqlar yozilgan;
   * Excel faylida **«Mundarija»** varag'i — har bir loyiha va ko'cha uchun
     `dan – gacha`, qatorlar soni, resurslar soni, smeta/bozor summasi va farq.

   Oraliqlar loyihalar tartibiga bog'liq. Tartibni chap tomondagi `▲ ▼`
   tugmalari bilan o'zgartirasiz — raqamlar darhol qayta hisoblanadi.

4. **Narxlarni tekshiring.** Bozor narxini ikki joyda tahrirlash mumkin, ikkalasi
   ham bir xil ishlaydi — bitta tuzatish shu resursning butun loyihadagi barcha
   qatorlariga tushadi. Narxi to'g'ri bo'lganini tegmay qoldirasiz — farq `0`
   bo'lib qoladi.

   * **«Narxlarni tekshirish»** — har bir resurs **bir marta** ko'rinadi, nechta
     ko'chada uchrashidan qat'i nazar. Ro'yxat bo'ylab tez yurish uchun qulay.
   * **«Yig'ilgan jadval»** — `БОЗОР ЦЕНА` ustunining o'zida, smetaning aynan
     shu qatorida turib tuzatasiz. `A` ustunida umumiy qator raqami ko'rinib
     turadi.

   * Ikkalasida ham: `Enter` / `↓` `↑` — qatordan qatorga, `Esc` — smeta narxini
     qaytarish. Raqam yozayotganda oddiy, yozib bo'lgach ajratilgan ko'rinishda.

   **Qatorlar qanday birlashtiriladi.** Bitta qator = bitta **nom + o'lchov
   birligi + smeta narxi**:

   * nomi ham, narxi ham bir xil bo'lsa — **bitta** qator (`DUB` 14 marta
     uchraydi, ro'yxatda bitta qator, `SONI = 14`);
   * nomi bir xil, narxi har xil bo'lsa — **har biri alohida** qator
     (`АВТОГРЕЙДЕР "КАМАЦУ"`: `364 298` — 9 qator, `413 117` — 8 qator);
   * nomi har xil, narxi bir xil bo'lsa — ham **alohida** qatorlar.

   Nomi yonidagi `2 xil narx` belgisi shu nom boshqa narx bilan ham
   uchrashini bildiradi; ustiga bossangiz, o'sha nomning barcha narx
   variantlari bir joyda ko'rinadi. Bozor narxini yozsangiz, u faqat **o'sha
   narxdagi** qatorlarga tushadi — ikkinchi variant o'z holicha qoladi.
   * Filtrlar: faqat o'zgartirilganlar, narxi `0` bo'lganlar, bitta nom ostida
     bir nechta smeta narxi uchraydiganlar.
   * `% qo'llash` — ko'rinib turgan barcha resurslarga foizda tuzatish.
   * `Narx kitobi` — tuzatilgan narxlarni `.json` ga saqlash va keyingi
     loyihada qayta ishlatish (`.xlsx` ro'yxatini ham qabul qiladi).

5. **Excel yuklab oling.** Yuqorida, «Excel yuklab olish» tugmasi yonida
   **«Hisobot varaqlari»** ro'yxati turadi — u loyiha varaqlariga nima
   tushishini belgilaydi (pastdagi jadvalga qarang). Odatdagi holat —
   `Faqat o'zgargan narxlar`. Bitta fayl chiqadi:
   * `Лист1` — yig'ilgan to'liq jadval;
   * har bir loyiha uchun alohida varaq (nomini chap tomondan o'zgartirasiz) —
     `TAQQOSLASH JADVALI №2`;
   * `Mundarija` — qator raqamlari indeksi (sozlamalardan o'chirsa ham bo'ladi).

6. **Tuzatilgan smetani solishtiring («Сравнение версий», v2.6.0).** Smeta
   tuzuvchi bizning jadvalimiz bo'yicha tuzatib, faylni qayta yuborganda:
   «Сравнение версий» yorlig'ida **«Было»** — birinchi versiya (bozor narxlari
   yozilgan loyiha; boshqa faylni ham tanlasa bo'ladi), **«Загрузить
   исправленную смету»** — qaytgan fayl. Qaytgan fayl loyihalarga qo'shilmaydi,
   faqat solishtiriladi.

   * Qatorlar har bir varaq ichida nom + o'lchov birligi bo'yicha, tartibi bilan
     juftlanadi (eng uzun umumiy ketma-ketlik): qo'shilgan yoki o'chirilgan qator
     keyingi qatorlarni surib yubormaydi. Varaqlar nomi bo'yicha, bo'lmasa
     tartibi bo'yicha juftlanadi.
   * **«So'ralgan narx»** — jadvalimizda yuborilgan narx: hisobot o'zining
     rejimi va chegarasi bilan qayta o'qiladi (Excel'dagidek). Chegaradan past
     qolib, jadvalga tushmagan narxlarimiz kulrang, faqat ma'lumot uchun
     ko'rsatiladi — ular so'ralmagan hisoblanadi.
   * Ranglar: 🟩 **исправлено** (narx biznikiga yetdi yoki undan past) va
     so'ralmagan pasaytirish; 🟨 **частично** (pasaygan, lekin biznikiga
     yetmagan; yoki bitta resurs bir qatorlarda tuzatilgan, boshqalarida yo'q),
     o'chirilgan qator; 🟥 **не исправлено**, so'rovga qarshi oshirilgan,
     so'ralmagan oshirish, miqdor oshgan, yangi qator. Narx 0,1 % gacha (ko'pi
     bilan 1 so'm) farq qilsa — yaxlitlash, o'zgarmagan hisoblanadi.
   * Yuqorida: smeta summasi bo'lgan → bo'ldi, so'ralgan pasayishdan qanchasi
     olindi, to'liq tuzatilgan va **qolgan** resurslar (eski narxda qolgan
     qatorlar soni bilan).
   * Ko'rinish: «По ресурсам» (resurs ustiga bosilsa — uning barcha qatorlari)
     yoki «По строкам»; filtr «Требуют внимания» / «Все изменения» / «Все
     строки».
   * **Biz so'ramagan o'zgarishlar** (v2.7.0) — filtr «Без нашего замечания»
     (yoki shu kartochkani bosing): jadvalimizda bo'lmagan har bir o'zgargan
     qator — narx, miqdor, nom/birlik, yangi yoki o'chirilgan qator — oldin →
     keyin va farqi so'mda; kartochkada jami qancha oshgan va qancha
     kamaygani.
   * **Nomi yoki birligi o'zgartirilgan qator** «o'chirildi + qo'shildi» emas,
     bitta qator: «Изменено наименование / ед. изм.», eski nom chizilgan, yangisi
     ostida (birligi bir xil va nomi yaqin, yoki narxi va miqdori bir xil bo'lsa).
   * **«Итоги листов»** — resurs bo'lmagan, lekin summasi bor qatorlar (ИТОГО,
     ЗАГОТОВИТЕЛЬНО-СКЛАДСКИЕ РАСХОДЫ, ТРАНСПОРТНЫЕ УСЛУГИ=5%, ВСЕГО …) har bir
     varaq bo'yicha oldin → keyin. Qizil: matni yoki foizi o'zgargan qator
     (5% → 7%); bo'limning «ИТОГО» si o'z qatorlari yig'indisiga teng emas,
     va bu farq faqat qaytgan versiyada paydo bo'lgan (raqam qo'lda yozilgan).
     Ikkala versiyada bir xil turgan eski farq belgilanmaydi.
   * **«Наш ответ (Excel)»** (v2.8.0) — biz yuborgan jadval fayl sifatida: dasturning
     o'z eksporti (321.xlsx dagi «TAQQOSLASH JADVALI №2» varag'i) yoki eski PDF javobdan
     yasalgan Excel (ustunlari `№ · Наименование · Ед. изм. · Цена по смете · Рыночная
     цена · Примечание`; o'zbekcha sarlavhalar ham tanib olinadi). Har bir qator smetadagi
     resursga nom + birlik + smeta narxi bo'yicha (narx so'mgacha yaxlitlangan bo'lsa ham)
     topiladi; nomi boshqacha bo'lingan bo'lsa — bo'sh joy va tinish belgilarisiz, bo'lmasa
     shu birlik va narxdagi eng yaqin nom (≥ 0,9). Topilgan narxlar «Было» loyihasiga
     qo'yiladi — avval yozilgan yoki avtomatik qo'yilgan narx ustidan, chunki yuborilgan
     narx aynan shu; faylda yo'q resursga tegilmaydi. Solishtirishda zamechaniye — aynan
     shu fayldagi qatorlar; smetada topilmaganlari ro'yxat bo'lib ko'rsatiladi. Xuddi shu
     fayl «Книга цен» orqali yuklansa ham narxlar shu tartibda qo'yiladi.
     Javob faylida narxlar yonida **«объем» varag'i** bo'lsa (v2.15.0; `Наименование работ и
     затрат · Ед.изм. · Объемы работ (по локальной ресурсной смете · по рабочему проекту) ·
     Примечание`), uning qatorlari o'sha loyihaning ishlariga ham qo'yiladi — pastdagi
     «Объёмы работ» bo'limiga qarang. Faqat «объем» varag'idan iborat fayl ham qabul qilinadi.
   * **«Скачать сравнение»** — uch varaqli `.xlsx` («По ресурсам», «По
     строкам» — «По нашему замечанию: да/нет» ustuni bilan, «Итоги листов»),
     xuddi shu ranglar bilan.

---

## Объёмы работ — ishlar hajmi va resurslar miqdori (v2.15.0)

Ekspert narxdan tashqari **hajmlarni** ham tekshiradi (egasining talabi, 2026-11-14).

* **Ishlar** smetaning 5-shakl lokal resurs vedomostidan olinadi (`01_ЛРВ` kabi varaq:
  `N п.п. · Шифр · Наименование работ и затрат · Единица измерения · Количество (на ед.
  измерения · по проектным данным)`). Har bir ish — raqami, nomi, birligi, smeta hajmi va
  bo'limi bilan; ostidagi `1.1`, `1.2` … qatorlar — shu ishning resurslari (bir birlikka va
  jami). Vedomost yo'q smetada vkladka buni aytadi — resurs miqdorini baribir qo'lda
  o'zgartirish mumkin (pastda).
* **«Объёмы работ»** vkladkasi: har bir ish yonida «Объём по проекту» (yangi son — ishchi
  loyihadagi hajm), «обосновать» belgisi (= «Необходимо обосновать объем в проекте») va
  o'z izohi. Yangi hajm o'sha ish resurslarining miqdorini **bir birlikka × (yangi − eski)**
  ga o'zgartiradi; boshqa ishlarga tegmaydi.
* **«Проверка цен»** da «Общее кол-во» ustiga bosilsa — resursning ekspertiza bo'yicha jami
  miqdori yoziladi (bo'sh — smetadagidek). O'zgargan miqdor `<s>smetadagi</s> yangi` bo'lib
  ko'rinadi; «Изменено количество» filtri ularni yig'adi.
* **Narxlar va Таблица №2 o'zgarmaydi** — tejash narx bo'yicha hisoblanadi, Таблица №2
  smeta miqdorlari bilan qoladi.
* **Hujjat:** biror narsa belgilangan bo'lsa, eksportga **«Таблица №1 (объёмы)»** varag'i
  qo'shiladi — «СОПОСТАВИТЕЛЬНАЯ ТАБЛИЦА №1»: faqat izoh yoki loyiha hajmi bor ishlar,
  bo'limlar bo'yicha (`№ · Наименование работ и затрат · Ед.изм. · по локальной ресурсной
  смете · по рабочему проекту · Примечание`), keyin «Количество ресурсов» ostida qo'lda
  o'zgartirilgan resurslar. Hech narsa belgilanmagan bo'lsa — hujjat avvalgidek.
* Server rejimida hajmlar va miqdorlar ish maydoni bilan saqlanadi (sahifa qayta
  yuklansa ham qaytadi). Ishning kaliti — fayl, nomi, birligi, shifri va hajmi: o'sha fayl
  qayta o'qilsa, qarorlar o'z joyiga qaytadi.

---

## Hisobot varaqining uch rejimi

Rejim yuqori satrdan, «Excel yuklab olish» tugmasi yonidan tanlanadi va
**«Hisobot ko'rinishi» varag'iga ham, yuklab olinadigan Excel faylga ham**
bir xilda tegishli.

| Rejim | Nima chiqadi |
|---|---|
| **Faqat o'zgargan narxlar (tozalangan)** | Faqat narxi tuzatilgan resurslar. Birlashtirish qoidasi narxlar varag'idagi bilan bir xil: nom + narx bir xil bo'lsa bitta qator (`КОЛ-ВО` barcha ko'chalar bo'yicha qo'shiladi), nomi bir xil narxi har xil bo'lsa — alohida qatorlar, nomi har xil narxi bir xil bo'lsa — ham alohida. Bo'limlar (`ЗАТРАТЫ ТРУДА`, `МАШИНЫ`, `МАТЕРИАЛЫ`, `ОБОРУДОВАНИЕ`), har biriga `ИТОГО` va oxirida `ЖАМИ / ВСЕГО`. |
| **Barcha resurslar (tozalangan)** | Yuqoridagi bilan bir xil, lekin narxi o'zgarmaganlar ham qoladi. |
| **To'liq nusxa** | Loyihaning har bir qatori, hech narsa tashlanmaydi. Narxi o'zgargan qatorlar o'z o'rnida alifbo tartibida saralanadi — ya'ni Excelda `фарқ ≠ 0` bo'yicha filtr qo'yib, nom bo'yicha saralaganda chiqadigan natijaning aynan o'zi. Har bir `ИТОГО` o'z o'rnidagi qatorlarni yig'adi (Excelda saralashdan keyin bo'lgani kabi): saralash qatorni boshqa bo'lim o'rniga olib o'tsa, o'sha ikki bo'lim jamisi smetadagidan farq qiladi, umumiy summa esa o'zgarmaydi (v2.9.2 gacha bunday jamilar noto'g'ri yoki aylanma havola bo'lib chiqardi). |

**Smeta tuzuvchiga yuboriladigan varaq (v2.5.5).** «Faqat o'zgargan narxlar»
rejimida resurs hisobotga faqat uning farqi (loyiha bo'yicha miqdor × (smeta
narxi − bozor narxi), ishorasidan qat'i nazar) **5 mln so'mdan katta**
bo'lsa yoziladi; kichik farqlar narxlar varag'ida qoladi, hisobotga
tushmaydi. Chegara «Настройки документа» da (`0` — avvalgidek, barcha
o'zgargan resurslar). Qolgan ikki rejimga ta'sir qilmaydi.

**Jihozlar (v2.5.4).** Nomida **`ОБОРУДОВАНИЕ`** so'zi bor har qanday bo'lim
(`ОБОРУДОВАНИЕ, МЕБЕЛЬ И ИНВЕНТАРЬ`, `ТЕХНОЛОГИЧЕСКОЕ ОБОРУДОВАНИЕ`, …) yoki
`Jihoz…` / `Жиҳоз…` / `Жихоз…` bo'limidagi resurs — shuningdek 4А shaklidagi
**«на … ОБОРУДОВАНИЕ»** sarlavhali lokal smetaning (masalan «на ТЕХНОЛОГИЧЕСКОЕ
ОБОРУДОВАНИЕ») **har qanday** qatori (v2.5.7) — agar uning smeta **narxi**
(bir birlik narxi) **20 mln so'mdan yuqori** bo'lsa, hisobotga **har uch
rejimda ham kiradi** — narxi o'zgarmagan bo'lsa ham — va `Eslatma` ustuniga
izoh yoziladi: «Для полноценного изучения стоимости данного оборудования
необходимо представить дополнительные технические параметры, а также
обосновать цену оборудования не менее чем двумя коммерческими предложениями.»
Undan arzon jihoz avvalgidek: faqat narxi o'zgarsa, umumiy izoh bilan. Matn,
chegara va yoqish/o'chirish — «Настройки документа» («Примечание для
оборудования», «Порог»).

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

## Bir resursni tanish

Smetalar qo'lda, yarim ruscha-yarim o'zbekcha klaviaturada yoziladi, shuning
uchun bitta resurs `СТАЛЬ` va `CТАЛЬ` (lotincha C), `КАШТАН` va `KASHTAN`,
`ДИАМ. 16 ММ` va `ДИАМ.16 ММ` bo'lib keladi. Ikkita haqiqiy kitobdagi 896
nomdan 139 tasi ikkala alifboni aralashtiradi, 55 tasida esa bitta so'z
ichida aralashadi.

Shu sababli **ikkita kalit** bor:

* `S.nameKey` — **hujjat ichidagi ayniylik**. Ehtiyotkor: faqat ko'zga
  ko'rinmaydigan xatoni tuzatadi (klaviatura almashinuvi, qo'shtirnoq va nuqta,
  Ё → Е, Ъ → Ь). Eksport qilingan `.xlsx` da qaysi qatorlar bitta narxni
  bo'lishishini shu kalit hal qiladi.
* `S.matchKey` — **loyihalar orasidagi qidiruv**, faqat narx eslatmalari uchun.
  Bitta alifboga transliteratsiya qiladi va ajratgichlarni olib tashlaydi;
  eslatma — taklif bo'lgani uchun u dadilroq bo'lishi mumkin.

Ikkalasi ham buzmaydigan yagona qoida — **raqamlar saqlanadi**: `АНКЕР М5` ≠
`АНКЕР М8`, `4.1.1` ≠ `4.11`, `СТАЛЬ А-I` ≠ `СТАЛЬ А-III` (rim raqamlari ham
raqam). Ikki raqam orasidagi ajratgich hech qachon shunchaki o'chirilmaydi —
aks holda `ПРОВОД 1, 5 ММ2` va `ПРОВОД 15 ММ2` bitta bo'lib qolardi.

Aniq moslik topilmasa, narx oynasi eng yaqin nomlarni ball bilan taklif
qiladi (TF-IDF kosinusi va tahrir masofasi, o'lchov birligi — qattiq filtr).
Raqamlari qarama-qarshi bo'lgan nomlar hech qachon taklif qilinmaydi.

Server ham xuddi shu kalitlarni hisoblaydi: `build.mjs` `pb_hooks/lib/nlp.js`
ni sahifa ishlatadigan fayllardan generatsiya qiladi.

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
  index.html, screens.html   dastur oynasi (bitta-fayl va server rejimi)
  admin.html                 admin sahifasi
  app.css
  worker.js                  .xlsx ni fon oqimida o'qish
  refs-worker.js, uzex-worker.js   справочник va UZEX takliflari — fon oqimida
  vendor/                    fflate, PocketBase mijozi
  lib/                       yadro — ikkala mahsulotga umumiy, brauzersiz ham ishlaydi
    normalize.js      nom kaliti: klaviatura almashinuvi, Ё/Ъ, tinish belgilari
    match.js          transliteratsiya, moslik kaliti, TF-IDF + Levenshtein o'xshashlik
    sections.js       nomdan bo'lim (материалы / машины / труд / оборудование)
    regions.js        ariza matnidan viloyat (gazetteer + ball)
    util.js           umumiy yordamchilar: sonni o'qish (`S.num`), raqam formatlari
    formula.js        formulalarni ko'chirish; tirik ko'chadigan funksiyalar ro'yxati
    xlsx-read.js      .xlsx o'qish (bir o'tishli skaner, hajm cheklovlari)
    xlsx-write.js     to'liq formatli .xlsx yozish
    smeta.js          obyekt varaqlarini tanish (shakli, 4А, sarlavhasi bo'yicha)
    assemble.js       Лист1 ni yig'ish + resurslar ro'yxati + jamilar formulalari
    report.js         TAQQOSLASH JADVALI №2 (uch rejim) + Mundarija
    export.js         uslublar va tayyor kitob
    compare.js, reply.js   «Сравнение версий», «Наш ответ (Excel)»
    volumes.js        5-shakl vedomost ishlari, javobning «объем» varag'i, Сопоставительная таблица №1
    ml/layout.js      smeta fayli «qanday ko'rinadi» — nom va narxsiz format namunasi, imzo, arifmetika, xesh
    registry-parse.js      arizalar reyestrini o'qish
    refs/             справочные цены: paket, qidiruv, taklif (faqat o'lchov bilan o'zgaradi)
    uzex.js           UZEX kotirovkalari: moslash, birlik, QQSsiz narx
    pb.js             PocketBase mijozi (server rejimi)
  ui/
    grid.js           virtual jadval
    prices.js         «Проверка цен»
    volumes.js        «Объёмы работ»: hajmlar, izohlar, resurs miqdori (ekspertiza bo'yicha)
    formats.js, formats-admin.js  har bir yuklangan smetadan format yozuvi; admin «Распознавание форматов смет»
    app.js            ulanish, xabarlar, narxlar kitobi
    sync.js           ish maydoni: saqlash, tuzatishlar, ikki vkladka, yopilgan vkladka
    hints.js, refs.js, uzex.js   takliflar: oldingi loyihalar, справочник, birja
    contragent-prices.js  shu kontragentning oldingi narxlari bitta ro'yxatda (F1)
    journal.js, learning-admin.js  o'rganish uchun yozuvlar: qarorlar jurnali, «Завершить» oynasi, admin sonlari
    memory.js         xotira ekranda: «пам.» tegi, «ранее принято» belgisi (qoidalari — lib/memory.js)
    dataset-admin.js  admin: «Набор для обучения» — yakunlangan narxlar qayta so'raladi, bugungi takliflar o'lchanadi
    compare.js, registry.js, auth.js, admin.js, *-admin.js
server/
  pb_schema.json, pb_hooks/  PocketBase sxemasi va server qoidalari
  laptop.sh, laptop.cmd, laptop.ps1, install-windows.ps1   noutbuk rejimi
  lan.sh, deploy/            ofis tarmog'i va VPS
  releases.txt, release.sh   relizlar ro'yxati va reliz buyrug'i
test/
  all.sh              hamma test, tartib bilan; natija — bitta jadval va chiqish kodi
  synth.cjs           o'ylab topilgan smetalar: haqiqiy faylsiz ham hamma test ishlaydi
  server.mjs, pb-smoke.sh    test serveri (har test o'z portida, yetim server qolmaydi)
  *.cjs               yadro testlari (node): o'qish, yig'ish, eksport formulalari, NLP o'lchovlari
  *.mjs               brauzer testlari (playwright): sahifa, ish maydoni, takliflar, admin
  laptop-*.sh, release-script.sh   ishga tushirgichlar va reliz skripti
  fixtures/           haqiqiy hujjatlardan olingan tekshiruv ma'lumotlari (nom va belgilar, narxsiz)
build.mjs             hammasini yig'adi: dist/smeta-taqqoslash.html, index.html, admin.html
.github/workflows/tests.yml   har bir push'da to'plam GitHub'da ishlaydi
```

### Yig'ish

```sh
node build.mjs                       # dist/ dagi uchala sahifa
node build.mjs --watch               # ishlab chiqish paytida
```

### Testlar

```sh
npm i && npx playwright install chromium     # bir marta
node build.mjs                               # src o'zgargan bo'lsa — avval qurish (to'plam birinchi bo'lib dist/ ni tekshiradi)
sh test/all.sh                               # hamma test, o'ylab topilgan smetalarda (≈ 12 daqiqa)
sh test/all.sh reyestr.xls smeta1.xlsx smeta2.xlsx    # ... va haqiqiy fayllaringizda
```

To'plam **yashil bo'lishi shart**: oxirgi qatori «N ok, 0 fail», chiqish kodi 0.
Fayl berilmasa, butun dastur testlari (`pipeline`, `browser`, `e2e-workspace`,
`e2e-hints`) `test/synth.cjs` yasagan ikki o'ylab topilgan smetada ishlaydi —
shuning uchun to'plam istalgan kompyuterda va GitHub'da to'liq yuradi. Faqat
egasining kompyuterida qoladiganlari jadvalda SKIP deb, sababi bilan ko'rinadi:
`hints` (o'xshash nomlarni narx bo'yicha o'lchaydi — haqiqiy smeta kerak),
`refs-parity`/`refs-measure` (maxfiy to'plam, `REFS_KIT`), `e2e-fullregistry`
(to'liq reyestr), `smeta-corpus` (egasi yuborgan barcha smetalar, `SMETA_KIT` —
o'quvchi qoidasi o'zgarganda qolgan fayllar avvalgidek o'qilishini isbotlaydi).

Har bir push'da shu to'plam GitHub Actions'da o'zi ishlaydi (repo → «Actions»
vkladkasi → «tests»). Qizil belgi — biror test yiqilgan; qaysi biri ekanini
o'sha yerdagi «What failed» qadami ko'rsatadi.

### Reliz

```sh
sh server/release.sh 2.9.5 "bir qatorli izoh (ASCII)" --row matn.md      # matn.md — docs/versiyalar.md qatori uchun
sh server/release.sh 2.9.5 "..." --row matn.md --dry                    # hammasini tekshiradi, hech narsa commit qilmaydi
```

Bitta buyruq: versiyani ko'taradi, yig'adi, to'plamni ishga tushiradi, reliz
commit'ini qiladi va push qiladi, keyin **alohida commit** bilan
`server/releases.txt` ga o'sha commit'ning to'liq hash'ini va
`docs/versiyalar.md` ga qatorni qo'shadi. Rad etadi (hech narsani
o'zgartirmasdan): versiya yangi bo'lmasa, ishchi papkada o'zgarish bo'lsa,
to'plam yashil bo'lmasa, to'plam Windows ishga tushirgichi yoki brauzer
testlaridan birortasini o'tkazib yuborgan yoki ishlatmagan bo'lsa (playwright va
PowerShell kerak; Windows ishga tushirgichi testi faqat Linux'da ishlaydi — relizlar
shu yerda qilinadi; boshqa tizimda, PowerShell yoki playwright yo'q bo'lsa skript
to'plamdan oldin, darhol rad etadi), shox `claude/excel-price-validation-5ehbvb`
bo'lmasa (Windows noutbuk `releases.txt` ni faqat shu shoxdan o'qiydi), kod o'z
o'lchovidan farq qilsa (справочник, o'xshashlik). Reliz paytida origin oldinga
ketsa, reliz commit'i rebase qilinmaydi — skript uni tashlab, shoxni yangilab,
relizni qaytadan qilishni aytadi (`releases.txt` aynan origin'dagi commit'ni
nomlashi kerak). Yarim yo'lda to'xtatilsa (Ctrl-C, commit rad
etilsa) `package.json` va `dist/` qaytariladi; commit'dan keyin to'xtasa — nima
qolganini aytadi. To'plam qilgan yangi o'lchov (`test/refs-parity.stamp`,
`test/hints.stamp`) reliz commit'iga kiradi.
`RELEASE_SMETA1`, `RELEASE_SMETA2`, `RELEASE_REGISTRY`, `REFS_KIT` — haqiqiy
fayllar va maxfiy to'plam bilan to'liqroq tekshiruv uchun.

## Versiyalar va orqaga qaytish

Sahifa sarlavhasida versiya raqami turadi (`v2.0.0`). Yangi versiyani
chiqarishdan oldin zaxira oling, chiqargandan keyin bir necha kun haqiqiy ish
bilan sinang; biror narsa noto'g'ri bo'lsa — bitta buyruq bilan qayting:

```sh
sh server/deploy/find-server.sh 1            # bir marta: server manzilini topib eslab qolish
sh test/all.sh                               # avval testlar (smeta fayllari bilan — to'liqroq)
sh server/deploy/pull-backup.sh              # zaxira
sh server/deploy/push.sh                     # chiqarish
sh server/deploy/rollback.sh v2.1            # kerak bo'lsa — qaytish
```

Ma'lumot ikkala yo'nalishda ham saqlanadi: ish maydoni narxlarni ikkala
kalitda yozadi. Batafsil, shuningdek NLP jadvallarini o'zingiz o'zgartirish
tartibi — `docs/versiyalar.md`.

## Noutbuk rejimi — bitta odam, o'z kompyuterida

Server ham, oylik to'lov ham, internet ham kerak emas: dastur noutbukning
o'zida ishlaydi, baza shu diskdagi fayl, ma'lumot hech qayerga ketmaydi.

```sh
sh server/laptop.sh              # birinchi marta: o'rnatadi, ishga tushiradi, brauzerni ochadi
sh server/laptop.sh autostart    # ... va bundan keyin kompyuter yonganda o'zi
```

Birinchi ishga tushirishda ishchi pochtangiz so'raladi — hisobingiz shu
nomda yaratiladi. **Kirish oynasi yo'q**: kompyuterni faqat siz
ishlatasiz, shuning uchun sahifa ochilishi bilan ichkaridasiz — na kod,
na 4 soatlik qulf, na «Выйти». Hisob `admin` huquqi bilan yaratiladi,
shuning uchun reyestrni (`Report_1.xls`) o'zingiz yuklaysiz:
`http://127.0.0.1:8090/admin.html`.

Kirish oynasi o'chirib tashlanmagan, faqat noutbukda o'chirilgan: hisob va
«kim qaysi narxni yozgan» yozuvi joyida. `PB_AUTOLOGIN=0 sh server/laptop.sh`
(Windows'da `set PB_AUTOLOGIN=0` dan keyin `laptop.cmd`) uni qaytaradi;
ofis tarmog'i yoki VPS da esa u o'z-o'zidan bor. Avtomatik kirish faqat
dasturning o'z sahifasiga beriladi — brauzerda ochiq boshqa sayt
`127.0.0.1` ga so'rov yuborsa ham hech narsa olmaydi.

| Buyruq | Nima qiladi |
|---|---|
| `sh server/laptop.sh` | ishga tushiradi (Ctrl+C — to'xtatish) |
| `sh server/laptop.sh autostart` | kompyuter yonganda o'zi ishga tushsin |
| `sh server/laptop.sh status` | ishlayaptimi, baza hajmi, oxirgi zaxira |
| `sh server/laptop.sh backup` | hoziroq zaxira olish |
| `sh server/laptop.sh drive` / `drive <papka>` / `drive off` | ikkinchi nusxa qayerga yozilishini ko'rsatish / boshqa papkani tayinlash / o'chirish |
| `sh server/laptop.sh restore` / `restore <fayl.zip>` | zaxiralar ro'yxati / bazani o'sha nusxadan tiklash |
| `sh server/laptop.sh update` | yangi versiyani olib, qayta ishga tushirish |
| `sh server/laptop.sh stop` | to'xtatish |
| `sh server/laptop.sh uninstall` | o'zi ishga tushishini bekor qilish (ma'lumot qoladi) |

**Ma'lumot** `server/pb_data/` ichida — `git pull` unga tegmaydi.

**Zaxira** kuniga bir marta olinadi: dastur ishga tushganda, va ishlab turgan
dastur har soatda zaxira eskirmaganini tekshiradi (v2.9.3 — Mac haftalab
o'chirilmasa ham zaxira har kuni olinadi). Nusxa ikki joyga yoziladi:

1. `~/Backups/smeta` — shu diskda, lekin `pb_data` dan tashqarida;
2. **ikkinchi joy — shu diskdan tashqarida** (v2.9.3). Kompyuterda Google Drive
   yoki iCloud Drive papkasi bo'lsa, dastur uni o'zi topadi va nusxani
   `Smeta zaxira (Mac)` papkasiga qo'yadi — bulut uni o'zi yuklaydi. Boshqa
   papka (masalan tashqi disk): `sh server/laptop.sh drive /Volumes/Disk/zaxira`;
   o'chirish: `drive off`. Ikkinchi joy bo'lmasa, har bir buyruq «ikkinchi
   nusxa: YO'Q» deb ochiq aytadi — disk buzilsa yoki noutbuk yo'qolsa, baza va
   barcha zaxiralar birga ketadi.

Har ikki joyda: oxirgi 14 nusxa, undan keyin 8 hafta davomida haftasiga bitta,
undan keyin 12 oy davomida oyiga bitta (`server/backup-prune.cjs`) — uchinchi
haftada payqalgan xatoni ham qaytarish mumkin.

**Tiklash:** `sh server/laptop.sh restore` nusxalar ro'yxatini beradi,
`sh server/laptop.sh restore <fayl.zip>` bazani o'sha nusxadan tiklaydi.
Hozirgi baza **o'chirilmaydi** — `server/pb_data.before-restore-…` ga suriladi;
tiklangach nechta ariza, ish maydoni va narx tuzatishi qaytgani chiqadi.
Zaxira bo'lmagan fayl hech narsaga tegmasdan rad etiladi. Zaxira ZIP i butun
bazani ochiq holda saqlaydi (hisoblar, sozlamalar, yuklangan smetalar va narx
paketi) — uni kimga bersangiz, hammasi unda.

### Windows'da

Windows uchun alohida ishga tushirgich bor — unga **Node ham, Git ham kerak
emas**: sahifalar `dist\` da tayyor turibdi, PocketBase birinchi ishga
tushishda o'zi yuklanadi.

**PowerShell** oching (Start menyusida `PowerShell` deb yozing) va shu qatorni
nusxalab qo'ying:

```
irm https://raw.githubusercontent.com/1maxstar1/Ayubkhon_A/HEAD/server/install-windows.ps1 | iex
```

U dasturni `C:\Smeta` ga yuklab qo'yadi, birinchi marta pochtangizni so'raydi
va brauzerni ochadi — kirish oynasisiz, to'g'ridan-to'g'ri arizalar ro'yxati.
Oynani yopsangiz ham server ishlayveradi. Shu qatorni keyin yana qo'ysangiz —
bu yangilash: o'rnatilgan dasturning o'z `update` i ishlaydi (pastga qarang);
narx xotirasi `C:\Smeta` da emas, unga tegilmaydi.

Qo'lda o'rnatish ham mumkin: GitHub'da **Code → Download ZIP**, ZIP ga o'ng
tugma → **Properties** → **Unblock**, ichidagi papka **mazmunini** `C:\Smeta`
ga ko'chiring va `C:\Smeta\server\laptop.cmd` ni ikki marta bosing.

Kompyuter yonganda o'zi ishga tushishi uchun bir marta, o'sha PowerShell
oynasida: `C:\Smeta\server\laptop.cmd autostart`. Boshqa buyruqlar ham xuddi shunday:

| Buyruq | Nima qiladi |
|---|---|
| `laptop.cmd status` | ishlayaptimi, versiya, oxirgi yangilanish, zaxiralar, Drive |
| `laptop.cmd backup` | hoziroq zaxira olish |
| `laptop.cmd update` | eng yangi relizni hoziroq o'rnatish |
| `laptop.cmd rollback` | oxirgi yangilanishdan oldingi versiyaga qaytish |
| `laptop.cmd rollback v2.4.0` | ro'yxatdagi istalgan relizga qaytish |
| `laptop.cmd autoupdate off` / `on` | o'zi yangilanishini o'chirish / yoqish |
| `laptop.cmd drive` / `drive off` | zaxiralarni Google Drive'ga ham qo'yish / to'xtatish |
| `laptop.cmd stop` · `uninstall` · `debug` · `doctor` | to'xtatish · o'zi ishga tushmasin · xatoni ko'rish · tashxis |

**O'zi yangilanadi.** `autostart` qilingan kompyuterda fondagi kuzatuvchi har
6 soatda GitHub'dagi `server/releases.txt` ga qaraydi. Yangi reliz bo'lsa, uni
Windows'ga kirganda yoki kompyuterga bir muddat hech kim tegmaganda o'rnatadi
(20 daqiqa; kompyuter undan oldin uxlab qolsa — uxlashidan 3 daqiqa oldin):

1. relizni o'z papkasiga ochadi — `%LOCALAPPDATA%\Taqqoslash\app\<versiya>`;
   `C:\Smeta` ga hech qachon yozilmaydi;
2. zaxira oladi (olinmasa — yangilanmaydi);
3. yangi versiyaning **o'z ishga tushirgichi** serverni ko'taradi va o'zini
   o'zi tekshiradi (o'z versiyasini ko'rsatyaptimi, sahifa kerakli tarzda
   ochilyaptimi), eski versiya esa kuzatib turadi;
4. yangi versiya bir necha marta ketma-ket sog'lom chiqsa — `current.txt` bitta
   fayli unga o'tkaziladi, u kuzatuvchi bo'lib to'liq bir aylanishni (zaxira,
   Drive, yangilanish tekshiruvi) bajaradi, shundan keyingina eskisi ketadi.

Bo'lmasa — eski versiya ishlashda davom etadi va o'sha reliz qayta
urinilmaydi. O'rnatish o'rtasida tok o'chsa yoki `update` oynasini yopsangiz
ham `current.txt` eski versiyani ko'rsatib turadi va u qaytadi. `C:\Smeta`
dagi ishga tushirgich faol versiyaning kuzatuvchisini kuzatib turadi: u
yiqilsa qayta ishga tushiradi, bir hafta ichida uch marta ketma-ket yiqilsa —
oldingi versiyani qaytaradi. Nima bo'lgani `laptop.cmd status` da ko'rinadi.
Yangi versiya yoqmasa: `laptop.cmd rollback` — u yangi versiyaning o'zi buzilgan
bo'lsa ham ishlaydi, va uni yana `rollback` bilan qaytarsa bo'ladi.

**Zaxira Google Drive'da ham.** Kompyuterda «Google Drive для компьютера»
o'rnatilgan bo'lsa (https://www.google.com/drive/download/), dastur uning
papkasini (`G:\Мой диск`, `G:\My Drive` …) o'zi topadi va har bir zaxiraning
nusxasini `Smeta zaxira` papkasiga qo'yadi — Drive uni o'zi yuklaydi, boshqa
kompyuterdan ham ochsa bo'ladi. Keyin o'rnatilgan bo'lsa: `laptop.cmd drive`.

**Uzoqdan kuzatish.** Kompyuterdan uzoqda bo'lsangiz, uning ekranini Chrome
Remote Desktop (remotedesktop.google.com/access) bilan oching: `laptop.cmd
status` ni ishga tushirish, dasturni ko'rish, kerak bo'lsa `rollback`. Buning
uchun kompyuter uxlamasligi kerak (Параметры → Система → Питание → «Спящий
режим: Никогда»). 8090-portni internetga **ochmang**: noutbukda kirish oynasi
yo'q, port ochilsa dastur qulfsiz internetda turadi.

Windows'da ma'lumot dastur papkasida emas, **`%LOCALAPPDATA%\Taqqoslash`**
ichida turadi; zaxiralar `%USERPROFILE%\Backups\smeta` da. Shuning uchun
yangi versiyani ZIP qilib ochsangiz ham — yoki u o'zi yangilansa —
narx xotirasi joyida qoladi. Ishga tushmasa: `laptop.cmd debug` serverni
shu oynada ochadi va nima deyotganini ko'rsatadi.

Keyinchalik xodimlar ko'paysa — hech narsa qayta yozilmaydi: o'sha baza bilan
`sh server/lan.sh` (butun ofis shu kompyuterga ulanadi) yoki serverga chiqarish
(`server/deploy/push.sh`) ishlaydi. Faqat kirish kodi o'sha paytda pochtaga
yuborila boshlaydi.

## Server rejimi (2-bosqich)

> **Qayta yuklash (v2.8.1).** Ochiq zayavka va yorliq sahifa manzilida turadi
> (`…/#ws=<id>&tab=compare`), shuning uchun Cmd+R / F5 dan keyin dastur o'sha
> zayavkani, o'sha yorliqni o'zi qayta ochadi (narxlar serverdan). «‹ Заявки» bilan
> ro'yxatga qaytilganda manzil tozalanadi; zayavka o'chirilgan yoki ochib bo'lmasa —
> ro'yxat. **v2.8.4 dan** «Сравнение версий» ga yuklangan fayllar ham (qaytgan smeta, «Наш ответ»,
> fayldan olingan «Было») ish maydoni bilan serverda saqlanadi va qayta yuklangandan keyin o'zi
> qaytadi — ko'rinish va filtr bilan birga; har bir zayavkaning taqqoslashi o'ziniki.

Bir necha xodim bitta bazada ishlaydi: kirish — email + bir martalik kod,
4 soat harakat bo'lmasa qulf, arizalar reyestri, ish maydonlari serverda,
oldingi loyihalardan narx eslatmalari. Backend — [PocketBase](https://pocketbase.io)
(bitta binary, SQLite, fayl saqlash, admin panel).

```sh
PB_ADMIN_EMAIL=admin@firma.uz PB_ADMIN_PASS='kuchli-parol' sh server/setup.sh   # bir marta
node build.mjs --serve                                                        # dist/ -> server/pb_public
sh server/run.sh                                                              # http://127.0.0.1:8090
```

* `http://127.0.0.1:8090/` — dastur (kirish → arizalar → ish maydoni).
* `http://127.0.0.1:8090/admin.html` — administrator: reyestr (`Report_1.xls`)
  yuklash, ish maydonlarini tozalash/o'chirish, arizani qo'lda qo'shish yoki
  o'chirish, foydalanuvchilar. Faqat `role = admin` yoki superuser.
* `http://127.0.0.1:8090/_/` — PocketBase boshqaruv paneli (superuser).
* Ishlab chiqishda (`PB_DEV=1`, `run.sh` sukut bo'yicha) kod emailga
  yuborilmaydi — `server/pb_data/dev-otp.txt` ga yoziladi. Serverda SMTP
  PocketBase panelida (Settings → Mail) sozlanadi.
* Kirish kodi **xat mavzusida** keladi va **30 daqiqa** amal qiladi; so'rov
  brauzerda saqlanadi, shuning uchun xat kechiksa ham sahifani yopib qaytish
  mumkin (`src/ui/auth.js`, `users.otp` sxemada).

**Oqim.** Admin har hafta reyestrni yuklaydi. **Bitta ariza raqami — bitta
yozuv**: fayl ichida raqam takrorlansa oxirgi qatori olinadi, bazada allaqachon
bor ariza esa qayta qo'shilmaydi, faqat yangilanadi (`applications.number` da
UNIQUE indeks). Natijada «новых заявок N · уже были в базе, обновлено M» deb
ko'rsatiladi. Eski bazada nusxa qolgan bo'lsa, admin sahifasidagi «Проверить
дубликаты» tugmasi ularni birlashtiradi (ish, tuzatish va eksportlar saqlanib
qoladigan yozuvga ko'chiriladi) — `POST /api/admin/dedupe`.
Admin sahifasining tepasida **sog'liq bandi** turadi: har kecha soat 3 da
olinadigan zaxira ikki kechadan ortiq eskirsa yoki umuman bo'lmasa, qizil
ogohlantirish chiqadi (`GET /api/admin/health`). Aks holda tarix ostida jimgina
«Резервных копий: N, последняя …» deb yoziladi. Sababi oddiy: zaxira olinmay
qolgan server tashqaridan mutlaqo sog'lom ko'rinadi, va buni odatda zaxira
kerak bo'lgan kuni — reyestrni tozalash kuni — bilib qolinadi.
Yuklashlar tarixidagi har bir qatorda ikki amal bor: **«✕ строку»** — faqat
jurnal yozuvi o'chadi, arizalar qoladi; **«Отменить загрузку»** — o'sha yuklash
qo'shgan arizalar ham o'chadi (xodim ish boshlagan arizalar tegilmaydi), avval
nechta o'chishi ko'rsatiladi — `POST /api/admin/imports/{id}/revert`. Har bir
yuklash o'zi yaratgan ariza raqamlarini `registry_imports.created_numbers` da
saqlaydi; bu maydon paydo bo'lishidan oldingi yuklashlar uchun yuklash vaqtida
yaratilgan arizalar olinadi. Arizalar ro'yxati
hisobotning sariq ustunlari bo'yicha filtrlanadi: raqam / tashkilot / STIR /
loyiha nomi / obyekt ID (qidiruv), ekspertiza turi, buyurtmachi turi, holat,
summa oralig'i (`/api/registry/facets` — ustunlarning takrorlanmas qiymatlari).
Xodim arizani ochadi,
birinchi marta viloyatni tanlaydi (ariza matnidan, matn aniq aytmasa — kontragentning
oldingi arizalaridan taklif qilinadi), smeta
fayllarini yuklaydi — fayllar, sozlamalar va har tuzatish avtomatik
saqlanadi; qayta ochganda hammasi tiklanadi. Bozor narxi katagida shu
viloyatdagi oldingi loyihalar narxlari ko'rinadi: avval shu kontragent
(STIR bo'yicha), keyin boshqalar; boshqa viloyat ko'rsatilmaydi.
«Цены этого контрагента…» shu kontragentning oldingi narxlarini bitta ro'yxatda
beradi — belgilanganlari bitta «Применить выбранные» bilan qo'yiladi (qo'lda
yozilgan narxga tegmaydi, «Отменить» bilan qaytadi). Har
eksport `exports` da saqlanadi, ariza kartochkasidan yuklab olinadi va
«Наш ответ (Excel)» da birinchi bo'lib taklif qilinadi. Tugallangan arizani
«Вернуть в работу» qaytaradi; ro'yxatdagi «Сравнить версию» qaytgan smetani
to'g'ri solishtirishga olib boradi. Arizaning viloyatini admin sahifasida
o'zgartirish mumkin — narx tuzatishlari ham birga ko'chadi.
Admin ish maydonini **tozalashi** (fayllar, tuzatishlar, eksportlar o'chadi,
viloyat qoladi) yoki **o'chirishi**, arizani **qo'lda qo'shishi** (import
hook orqali — raqam mavjud bo'lsa yangilanadi) yoki **o'chirishi** mumkin —
tugmalar arizalar ro'yxatining o'zida (faqat adminga ko'rinadi) va admin
sahifasida; umumiy kod `src/ui/apps-admin.js`, server tomoni
`server/pb_hooks/admin.pb.js`.

Fayllar: `server/` (sxema, hooklar, skriptlar), `src/lib/pb.js`,
`src/lib/registry-parse.js`, `src/ui/{auth,registry,sync,hints,admin}.js`,
`src/screens.html`, `src/admin.html`. Bitta-fayl `dist/smeta-taqqoslash.html`
avvalgidek, serversiz ishlaydi.

Testlar:

```sh
sh test/pb-smoke.sh            # server: sxema, OTP kirish, token muddati, huquqlar
node test/install.mjs          # joylashtiruv skripti: toza o'rnatish va yiqilgandan keyin tozalash
node test/registry.cjs         # reyestr parser (fixture, 400 qator)
sh test/registry-import.sh     # import hook: ikki marta yuklash, huquqlar
sh test/admin-api.sh           # admin hooklari: facets, tozalash, o'chirish, huquqlar
node test/corrections-bulk.mjs # narxlarni bitta so'rovda yozish: huquq, kalitlar, cheklov
node test/dedupe.mjs           # bitta raqam — bitta yozuv: qayta yuklash, takror, tuzatish, bekor qilish, tozalash
node test/mail-otp.mjs         # kirish xati: kod mavzuda, ruscha matn, Gmail relay va Brevo yo'llari
node test/disable-user.mjs     # «Отключить» sessiyani ham tugatadi
node test/e2e-auth.mjs         # brauzer: kirish, noto'g'ri kod, qulf
node test/e2e-admin.mjs        # brauzer: reyestr, ish maydonlari, qo'lda ariza, foydalanuvchilar
node test/e2e-workspace.mjs    # brauzer: ariza → viloyat → fayllar → narx → qayta ochish → eksport
node test/upload-order.mjs     # brauzer: ketma-ket ikki fayl — har biri o'z manziliga tushadi
node test/e2e-hints.mjs        # brauzer: eslatmalar (viloyat, kontragent)
```

### Dastur o'rganishi uchun yozuvlar (v2.11.0)

Dastur ekspertning ishidan o'rganishi uchun (reja — `docs/ai-reja.md`, oddiy tilda — `docs/ai-model.md`) ikki narsa
yozib boriladi; ekran, takliflar va narxlar bundan **o'zgarmaydi**:

* **Qarorlar jurnali** (`suggest_events`): narx hal qilinganda o'sha resursga ko'rsatilgan takliflar (belgilari bilan,
  nomsiz) va qaysi biri tanlangani. Smeta narxi yozilmaydi.
* **Yakunlangan arizalar narxlari** (`price_memory`): «✓ Завершить» avval so'raydi (nechta narx o'zgargan, nechtasi
  qolgan, nechtasi «проверено»), keyin har bir resursni turi bilan yozadi. «Не учитывать в обучении» — sinov
  arizalari uchun. Qayta yakunlash yozuvlarni almashtiradi.
* Admin sahifasi → **«Обучение»**: faqat sonlar; «Скопировать числа».
* **Xotira ekranda (v2.12.0):** nom yonida «пам.» — yakunlangan arizada o'zingiz qo'ygan narx (shu kontragentniki
  birinchi, pudratchi qabul qilgani oldinda), «Применить» bilan qo'yiladi; smeta narxi yonida «✓» — kamida ikki
  mustaqil arizada shu narxgacha qabul qilingan, «▲» — undan baland. «Память» kaliti hammasini o'chiradi. Qoidalar —
  `src/lib/memory.js`; testlar — `node test/memory.cjs`, `node test/e2e-memory.mjs`.

* **«Набор для обучения» (v2.13.0):** admin sahifasi → «Обучение» → «Собрать и измерить». Har bir yakunlangan narx
  o'z arizasi sanasida spravochnikdan qayta so'raladi va bugungi taklif ekspert qarori bilan solishtiriladi
  (`src/lib/ml/`: `features.js` — qator belgilari, smeta narxisiz; `metrics.js` — o'lchovlar; `dataset.js` —
  belgilash, bo'lish, bugungi qoidalar o'lchovi). Hisob brauzerda, spravochnik worker'ida; ekranda va «Скопировать
  числа» da faqat sonlar. «Сохранить набор в файл» — dataset (belgilar va belgilar, nom va narxsiz); u repoga
  tushmaydi. Takliflarning o'zi bundan o'zgarmaydi. Testlar — `node test/ml.cjs`, `node test/e2e-dataset.mjs`.

* **Narx modeli — o'lchov (v2.14.0):** «Собрать и измерить» narx modelini ham o'qitadi va sinaydi
  (`src/lib/ml/pricedata.js` — resurs haqidagi dalillar: oldingi arizalardagi narxlaringiz va spravochnik, smeta
  narxisiz; `pricemodel.js` — chiziqli model va qaror «smeta narxi qimmat → taklif»). Uch usul eng yangi arizalarda
  solishtiriladi. Model hozircha ish sahifasida ishlatilmaydi. Test — `node test/ml-price.cjs`.

Yozish faqat server yo'llari orqali (`server/pb_hooks/learning.pb.js`); jurnal yozilmay qolsa ish to'xtamaydi.
Test: `node test/learning.mjs`.

### Smeta formatlarini tanishni o'rganish (v2.16.0)

Smetalar turli dasturlardan, turli ko'rinishda keladi. Hozir ularni **qoidalar** o'qiydi; o'qilmagan fayl
dasturchiga yuboriladi va yangi qoida qo'shiladi. Shu bilan birga dastur o'zi o'rganishi uchun ma'lumot yig'adi
(to'liq reja — `docs/format-reja.md`):

* Arizaga loyiha sifatida yuklangan **har bir smeta** — o'qilgani ham, o'qilmagani ham — `smeta_files` ga yoziladi:
  qaysi fayl (xesh), qanday o'qilgani (nechta varaq, nechta qator, kol-vo × narx = summa nechtasida to'g'ri) va
  **format namunasi**: varaqdagi har bir katak bitta belgi bilan (son, matn, birlik, sarlavha so'zi) hamda qoidalar
  o'qigan joylashuv. Namunada **nom ham, narx ham yo'q**.
* O'qilmagan (yoki summalari mos kelmagan) fayl serverda to'liq saqlanadi.
* Admin → «Обучение» → **«Распознавание форматов смет»**: sonlar, «До обучения модели: N из 100 файлов», va ko'rib
  chiqiladigan fayllar ro'yxati — **«Скачать»** (dasturchiga yuborish uchun), **«Проверить снова»** (dastur
  yangilangach yangi qoidalar bilan qayta o'qish), **«Убрать»**.
* Bu ishga xalaqit bermaydi: yozuv fonda yuboriladi, xato bo'lsa ish davom etadi.
* 100 ta o'qilgan fayl yig'ilgach model o'qitiladi va qoidalar o'qiy olmagan faylni tanishga urinadi — bu keyingi
  versiyalarda; model qoidalar o'qigan faylga tegmaydi, o'qigani esa arifmetika bilan tekshiriladi.

### Lokal sinov (bir buyruq)

```sh
sh server/dev.sh        # binary + sxema + admin@example.com + namuna reyestr (400 ariza) + server
```

Bitta oyna yetadi: skript serverni ko'taradi, brauzerni ochadi va **kirish
kodlarini shu oynada ko'rsatadi** (dev rejimida email yuborilmaydi). Kirish
pochtasi `admin@example.com`. Admin sahifa `…/admin.html`, PocketBase paneli
`…/_/` (parol `adminpass1234` — `dev.sh` faqat `127.0.0.1` ga ulanadi, shuning
uchun bu parol shu kompyuterdan tashqariga chiqmaydi; `PB_ADMIN_PASS` bilan
o'zgartiriladi).
To'xtatish — **Ctrl+C**. Ma'lumotlar `server/pb_data/` da, noldan boshlash uchun
shu papkani o'chiring. Alohida kerak bo'lsa `sh server/otp.sh` oxirgi kodni
chiqaradi.

Talab: `node` (18+) va `curl`. **macOS** — Terminal, `brew install node`; PocketBase
binary (`darwin_arm64` yoki `darwin_amd64`) avtomatik yuklanadi. **Windows** —
skriptlarni **Git Bash** dan ishga tushiring, binary `pocketbase.exe` bo'ladi.
Brauzer testlari uchun: `npm i -D playwright && npx playwright install chromium`.

To'liq reyestr bilan yuklama sinovi: `node test/e2e-fullregistry.mjs Report_1.xls`
(28 000 qator ≈ 35 s, qidiruv va filtrlar millisekundlarda).

### Ofis kompyuterini server qilish (VPSsiz)

```sh
sh server/lan.sh              # butun ofis uchun: http://<shu kompyuter IP>:8090
PB_DEV=1 sh server/lan.sh     # yolg'iz sinash: kodlar shu oynada chiqadi
```

`dev.sh` dan farqi: server `0.0.0.0` ga ulanadi, ya'ni bir tarmoqdagi boshqa
kompyuterlar ham kira oladi, va skript xodimlar ochadigan manzilni ko'rsatadi.

Baza paneli (`…/_/`) ham shu manzilda ochiladi, shuning uchun uning paroli
**birinchi ishga tushirishda tasodifiy yaratiladi**, ekranda bir marta
ko'rsatiladi va `server/.env` ga yoziladi (`chmod 600`). Keyingi ishga
tushirishlarda o'sha parol ishlatiladi. Ilgari bu yerda repozitoriyada ochiq
turgan `adminpass1234` ishlatilgan edi — agar `lan.sh` ni o'shanda ishlatgan
bo'lsangiz, `server/.env` ni o'chirib skriptni qayta ishga tushiring, u yangi
parol yaratadi.
Kerak bo'ladi: kompyuter ish vaqtida yoqiq tursin (uyqu o'chirilgan), lokal IP
o'zgarmasin (routerda DHCP rezervatsiya), tarmoqlararo ekranda `8090` port
ochiq bo'lsin, va kirish kodlari uchun SMTP sozlangan bo'lsin (baza paneli →
Settings → Mail). Zaxira: Settings → Backups, keyin `pb_data/backups/` ni
boshqa diskka nusxalab turing.

Joylashtirish (VPS, HTTPS, SMTP, zaxira) — `server/deploy/README.md`.

## Справочные цены — hujjatlardagi narxlar

Faqat server rejimida (noutbuk, ofis, VPS); bitta-fayl sahifada yo'q. Narx
hujjatlaridan — ekspertiza xulosalari, birja kotirovkalari, prays-listlar,
zavod kalkulyatsiyalari, ish haqi jadvallari — olingan narxlar paketi har bir
resurs yonida «справ.» tegi bilan ko'rinadi: hujjat bu resurs (yoki unga
o'xshash resurs) uchun qancha narx aytgan, qaysi hujjat, qaysi sanaga.

**«Автоподбор» (v2.5.5).** «Цены» sahifasidagi «справочник на …» yonidagi
tugma: eng yuqori taklifi yashil («Документ» / «Ставка по таблице» — aynan shu
resurs hujjatda), **smeta narxidan arzon** (v2.5.6: smeta qimmat bo'lsa — muammo,
arzon bo'lsa — joyida qoladi) va narxini hech kim yozmagan har bir resursga o'sha narxni
bitta tasdiq bilan qo'yadi; siz yozgan narxga va «Похожий» takliflarga tegmaydi.
Qaysilari smeta tuzuvchiga yuboriladigan varaqqa tushishini yuqoridagi farq
chegarasi hal qiladi.

**Hech narsa o'zi qo'yilmaydi.** Narx faqat «Применить» bosilganda tushadi;
ekspert o'zi yozgan narx ustiga esa faqat so'rab («Заменить вашу цену …?»).
Paket yuklanishi, sana o'zgarishi, qayta hisoblash narxlarga tegmaydi.

### Qanday ishlatiladi

1. **Paket.** Administrator `admin.html` → «Справочник цен (документы)» →
   «Выбрать файл .json.gz». Fayl shu brauzerning o'zida tekshiriladi (xato
   bo'lsa — qator raqami va maydon), keyin «Загрузить». Birinchi paket o'zi
   faol bo'ladi; keyingisi jadvaldagi «Сделать активным» bilan. «Документы» —
   paketdagi hujjatlar ro'yxati. Format — `docs/spravochnik.md`.
2. **Ekspert.** Ish maydonini ochganda brauzer faol paketni bir marta yuklab
   oladi va tayyorlaydi (birinchi marta yarim daqiqacha — holat qatorida
   «справочник: подготовка N %»; keyingi safar IndexedDB dan bir necha soniyada).
   «Цены» oynasida:
   * **«справ. 123 457 +2»** — eng yaxshi qator va yana nechta; uzuq chiziqli
     teg («справ. ≈…») — eng yaxshi qator boshqa resursning narxi, tekshiring;
   * tegni bosing — 6 tagacha qator: narx, daraja (**Ставка по таблице**,
     **Документ**, **Похожий** — boshqa resurs, **Оценка**), topilgan yozuvning
     o'z nomi, nimasi farq qiladi, hujjat va sanalar, birlik qayta hisoblangan
     bo'lsa — qanday, sizning smeta narxingizdan farqi; har qatorda «Применить»;
   * filtrlar: «Со справочными ценами», «Только похожие справочные».
3. **Sana.** Narxlar arizaning ro'yxatga olingan sanasiga beriladi: undan
   keyin chiqqan hujjat taklif qilinmaydi. Amaldagi sana panelda turadi —
   «справочник на ДД.ММ.ГГГГ»; uni bosib boshqa sana tanlash mumkin (2019 dan
   bir yil oldinga qadar, «Применить дату» yoki Enter bilan). Qo'lda tanlangan
   sana ish maydonida saqlanadi va sariq rangda «выбрана вручную · сбросить»
   bo'lib turadi; ish maydoni qayta ochilganda bu haqda xabar chiqadi.
4. **Iz.** «Применить» bilan qo'yilgan narx tuzatish yozuvida qayerdan
   kelganini saqlaydi (`ref:<paket>:<yozuv>`); boshqa loyihadagi eslatmada u
   «из справочника» deb ko'rinadi. Keyin qo'lda yozilgan (Escape dan keyin
   o'sha son bo'lsa ham) narx — `typed`.

### Ma'lumot qayerda turadi (muhim)

* **Paket egasining ma'lumoti — repozitoriyga hech qachon qo'shilmaydi.** U
  repozitoriydan tashqarida, yopiq to'plamda (`KIT`) yasaladi; `.gitignore`
  `*.json.gz`, `*.jsonl`, `refs*.json`, `private/` ni ushlaydi;
  `node test/refs-privacy.cjs` har commitdan oldin (va butun shox tarixini)
  tekshiradi.
* **Serverda paket `pb_data/storage` ichida turadi, shuning uchun u har bir
  zaxiraga tushadi:** noutbukdagi kunlik zaxiralarga (`~/Backups/smeta`,
  Windows'da `%USERPROFILE%\Backups\smeta`), bulut papkasidagi ikkinchi nusxaga
  ham (Windows'da `laptop.cmd drive` — `Smeta zaxira`, Mac'da `Smeta zaxira (Mac)`),
  VPS da — `server/deploy/pull-backup.sh` olib keladigan zaxiraga ham. Zaxirani
  kimga bersangiz, paket ham unda. Har bir paket — bir necha MB; eski nofaol
  paketlarni «Пакеты» jadvalida «✕ Удалить» bilan o'chirib turing (eski
  zaxiralardan ular navbatdagi 14 kunda chiqib ketadi).
* **Ekspertning brauzeri** paketdan hosil qilgan pulni IndexedDB da saqlaydi
  va «Выйти» bosilganda o'chiradi. Noutbuk rejimida «Выйти» yo'q (kirish
  vaqtincha o'chirilgan) — u yerda pul brauzer profilida qoladi.
* Fon oqimi (worker) ish maydoni yopiq turganda 3 daqiqadan, varaq yashirin
  turganda 15 daqiqadan keyin to'xtaydi va xotirani bo'shatadi; kerak bo'lganda
  keshdan bir necha soniyada qaytadi.

### Testlar

```sh
node test/refs.cjs             # parserlar, dvigatel, matnlar (soxta paket bilan)
node test/refs-api.mjs         # server: yuklash, faol paket, huquqlar
node test/e2e-refs.mjs         # brauzer: admin yuklashi, teglar, «Применить», sana, iz
REFS_KIT=<KIT> node test/refs-parity.cjs    # o'lchov: dastur kodi = o'lchangan dvigatel (1 571 so'rov)
REFS_KIT=<KIT> node test/refs-privacy.cjs   # haqiqiy paketga qarshi maxfiylik tekshiruvi
```

`src/lib/refs` dagi jadvallar faqat o'lchov bilan o'zgaradi: `KIT` siz
`test/all.sh` oxirgi o'lchov shtampini tekshiradi va o'lchanmagan o'zgarishni
«NOT MEASURED» deb xato qiladi.

## UZEX (биржа) — ikkinchi narx manbai (v2.9.0)

«Наш справочник» (yuqoridagi paketlar) yonida ikkinchi, **to'liq alohida** manba: O'zbekiston respublika
tovar-xomashyo birjasining haftalik kotirovkalari ([uzex.uz/WeeklyQuotes](https://uzex.uz/WeeklyQuotes), faqat
ruscha sahifa). Ikkalasi bir-biriga tegmaydi: UZEX o'z kolleksiyalarida turadi (`uzex_imports`, `uzex_quotes`,
`uzex_settings`), paket yuklash UZEX haftalariga, UZEX yangilanishi esa paketlarga hech narsa qilmaydi.

### Yangilash

* **O'zi** (yoqilgan holda keladi): server ishga tushgandan ~30 soniya keyin (kompyuter o'chiq turgan paytda chiqqan
  haftalarni olib oladi) va har kuni 09:00 da (Toshkent vaqti). Faqat haftalar ro'yxatini o'qiydi va bazada yo'q
  haftalarni oladi. Sayt oxirgi 4 haftani ko'rsatadi, shuning uchun olingan har bir hafta bazada qoladi.
* **Qo'lda**: `admin.html` → «UZEX haftalik narxlar» → «UZEX dan yangilash». O'sha yerda: oxirgi yangilanish vaqti va
  holati, «Avtomatik yangilash» kaliti, saqlangan haftalar jadvali (haftani o'chirish mumkin), «Qayta o'qish».
* Hafta **to'liq yoziladi yoki umuman yozilmaydi**: sahifa ruscha bo'lmasa (7 ta ustun sarlavhasi), so'ralgan hafta
  o'rniga boshqasi kelsa yoki bironta qator o'qilmasa — xato ko'rsatiladi, bazadagi ma'lumot joyida qoladi.
  Sayt ishlamasa ham shunday.
* Nom oxiridagi qavs faqat ma'lum so'z bo'lsa ajratiladi: birlik (`литр`, `декалитр`, `штука`, `метр`,
  `погонный метр`, `кв.м`, `куб.метр`, `куб.м`, `грамм`, `кг`, `тонна`), qadoq (`в мешках`, `навал`), `Форвард` /
  `Фьючерс`, `импорт`, valyuta (`доллар США`, `рубль`). Birlik yozilmagan bo'lsa — tonna deb olinadi va shunday
  belgilanadi («предп.»). Boshqa qavs (masalan, po'lat markasi) — nomning bir qismi.

### «Проверка цен» da

* Jadval tepasida ikkita belgilanadigan kartochka: **«Наш справочник»** va **«UZEX (биржа)»** — bittasi, ikkinchisi
  yoki ikkalasi. Kamida bittasi belgilangan turadi. Dastlab faqat «Наш справочник» — hammasi avvalgidek. Tanlov shu
  brauzerda eslab qolinadi. Belgini qo'yish yoki olish **hech qachon narxni o'zgartirmaydi** — faqat takliflar
  ko'rinadi yoki yashiriladi.
* UZEX belgilansa: hafta (dastlab eng yangisi), bozor (`Ichki` / `Eksport`), «только котировки этой недели» (hafta
  jadvalida shu haftada savdo bo'lmagan tovarlarning oldingi narxi ham turadi) va «форвард» (dastlab o'chiq).
* UZEX taklifi **binafsha** rangda (`--uzex`), «UZEX» belgisi bilan — yashil/qizil emas (ular narx farqini
  bildiradi) va «справ.» rangi ham emas. Ikkala manba belgilangan bo'lsa, qatorda ikkala teg turadi.
* Mos kotirovkani dasturning o'z dvigateli topadi (`src/lib/refs` — o'zgartirilmagan): armatura diametri, quvur
  o'lchami, birlik o'girish. Haqiqiy smetada o'lchangan: oddiy nom o'xshashligi 541 resursdan 6 tasiga, dvigatel
  48 tasiga kotirovka topadi.
* **Birlik boshqa bo'lsa** jim qo'llanmaydi: bir o'lchovdagi birlik (т → кг) qayta hisoblanadi, ⚠ va hisob
  ko'rsatiladi, «Применить» oldin so'raydi; buyum ma'lumoti kerak bo'lgan o'girish (т → м) faqat ⚠ bilan
  ko'rsatiladi, «Применить» yo'q.
* So'mda bo'lmagan kotirovka (dollar, rubl, eksport jadvali) hech qachon so'mdagi narx sifatida taklif qilinmaydi.
* **QQS (v2.9.1).** Birja narxni QQS bilan kotirovka qiladi, smeta esa QQSsiz tekshiriladi. Shuning uchun UZEX taklifi
  QQSsiz ko'rsatiladi va qo'llanadi (÷ 1,12; 2023-yilgacha 1,15, 2019-yil oktabrgacha 1,20) — «Наш справочник» dagi birja
  narxlari ham shunday. Bazada kotirovka sayt bosganidek (QQS bilan) saqlanadi; u narx ustidagi izohda va taklif
  qatorida ko'rinadi.
* «Применить» bosilgan narx katagi binafsha va «U» belgisi bilan qoladi (sahifa yangilangandan keyin ham; manba
  `uzex:<hafta>:<qator>` deb saqlanadi). Narx qo'lda yozilsa — belgi yo'qoladi. «Автоподбор» UZEX dan narx olmaydi.

### Testlar

```sh
node test/uzex.cjs             # sahifani o'qish, nomdagi qavslar, haftani dvigatelga berish
node test/uzex-api.mjs         # server: sinxronlash, xatolar, huquqlar, avtomatik yangilash
node test/e2e-uzex.mjs         # brauzer: admin bo'limi, kartochkalar, teglar, birlik, «U» belgisi
```

Testlar haqiqiy saytga chiqmaydi: `test/uzex-site.mjs` uning o'rnini bosadi (`UZEX_BASE`), test serverlarida
avtomatik yangilanish o'chiq (`UZEX_AUTO=0`).
