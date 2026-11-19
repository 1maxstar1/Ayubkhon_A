# Xatolardan saboqlar

Bu hujjat — egasining haqiqiy arizalarida topilgan xatolarning **turlari**, har bir tur uchun dasturga qo'yilgan
**qo'riqchi** (test yoki o'zini tekshirish) va keyingi xato topilganda bajariladigan **tartib**. Maqsad: bitta xatoni
yamash emas — o'sha turdagi xato boshqa ko'rinishda qaytib kelmasligi.

## Xato topilganda tartib (har safar, tashlab ketilmaydi)

1. **Haqiqiy faylda takrorlash.** Xato egasining fayllarida (maxfiy, repoda emas) eski versiyada takrorlanadi —
   «tuzatildi» degan gap faqat shundan keyin, xuddi shu fayllarda yangi versiyada tekshirilgach aytiladi.
2. **Sintetik test.** O'ylab topilgan smetada (`test/synth.cjs`, `test/compare-books.cjs`) xatoni takrorlaydigan test
   yoziladi va u **eski kodda yiqilishi** tekshiriladi (yiqilmasa — test hech narsani qo'riqlamaydi).
3. **Oilasini qidirish.** Xato yolg'iz kelmaydi. Shu turdagi qo'shni holatlar darhol haqiqiy fayllarda sinab ko'riladi
   (masalan: «fayllar tartibi almashsa», «fayllarning bir qismi kelsa», «fayl boshqa joyga yuklansa», «bitta fayl
   ikki marta kelsa»). 64453 da shunday qilib yana ikkita xato egasi ko'rmasdan oldin topildi.
4. **Umumiy tekshiruv.** Imkon bo'lsa, dasturga shu turni ushlaydigan o'zini tekshirish qo'shiladi: natija mantiqsiz
   bo'lsa — dastur sonni jim ko'rsatmaydi, «проверьте» deydi (pastdagi ro'yxat).
5. **O'lchov.** Yangi qoida mavjud barcha haqiqiy fayllarda o'lchanadi: nechta holatni ushlaydi va **nechta to'g'ri
   faylni noto'g'ri ushlaydi** (nol bo'lishi shart). Raqamlar qoidaning izohida va `CLAUDE.md` da qoladi.
6. **Yozib qo'yish.** Tur va qo'riqchi shu hujjatga, qoida `CLAUDE.md` ga yoziladi.

## Xato turlari va qo'riqchilar

### 1. Fayllar adashib juftlanadi («Сравнение версий»)

| Nima bo'lgan | Qo'riqchi |
|---|---|
| Resurslari bir xil smetalarning tuzatilgan fayllari tanlash tartibi bo'yicha almashgan (15-smeta 8-smeta bilan; hajm «oshgan») | `S.compare.join`: avval fayl nomi, keyin qatorlar, miqdorlar, nom yaqinligi — tartib hal qilmaydi (`test/compare.cjs`) |
| Tuzatilgan fayllar smeta bo'lib yuklangan: har biri o'zi bilan solishtirilgan, asl smetalarning barcha qatori «удалено», summa ikki baravar | `S.versionsOf` + `app.offVersions`: bitta smeta ikki marta — o'chiriladi va aytiladi; saqlangan arizada ham |
| 9 smetadan 4 tasi qaytgan: qolgan 5 tasining 1375 qatori «удалено», ulardagi zamechaniyelar «Осталось исправить» dan yo'qolgan | `join(…, fill)`: fayli qaytmagan smeta o'zgarmagan deb turadi va ro'yxatda aytiladi |
| Bitta tuzatilgan fayl «Было» da tanlangan boshqa smeta bilan solishtiriladi | `S.compare.nearer` → qizil «Проверьте сравнение» |
| Bir xil nomli varaqlar («РЕСУРС») turli fayllar orasida almashadi | `group` — varaq faqat o'z fayllar jufti ichida juftlanadi |
| Javobning «объем» varag'i boshqa arizadan qolgan | sarlavhadagi obyekt + ishlarning yarmidan ko'pi yo'q → o'qilmaydi, sababi aytiladi |

**Umumiy tekshiruvlar** (`src/ui/compare.js` `doubt`, har bir solishtirishda): qatorlarning ≥ 30 % i «удалено/новая»;
«снижение по замечаниям» so'ralganidan 1,5 baravar ko'p; smetasi topilmagan fayl; boshqa smetaga yaqinroq fayl.
**Ko'rinib turadi:** «Сопоставление файлов» ro'yxati — qaysi fayl qaysi smeta bilan va qanday (nom / qatorlar)
juftlangan; «Объёмы работ (ведомость)» kartasi — ish hajmlari o'zgarganmi.

### 2. Resurs ikki marta sanaladi

| Nima bo'lgan | Qo'riqchi |
|---|---|
| «ОБЩИЙ ИТОГ» kitobi boshqa smetalarni qatorma-qator takrorlaydi | `S.copiesOf` — o'chiriladi, aytiladi |
| Kitob ichidagi «Ресурс» yig'ma varag'i obyekt varaqlarini qo'shib chiqadi | o'qilmaydi, aytiladi (`smeta-header` 33) |
| Tuzatilgan smeta yoki o'sha fayl boshqa nom bilan smeta bo'lib yuklangan | `S.versionsOf` |
| Bizning Таблица №2 (eksport yoki javob) smeta bo'lib yuklangan — «Лист1» 449 qatorli smeta bo'lib o'qilardi | `S.isTable2` — rad etiladi, qayerga yuklanishi aytiladi (95 haqiqiy fayl: 10 tasi bizniki, hammasi tanildi; 85 smetadan 0 tasi) |
| Tashish varag'i tashishni material narxiga qo'shadi | sarlavha so'zi va arifmetika bo'yicha o'qilmaydi (`smeta-header` 24, 29) |

**Fayl yuklanganda tekshiriladiganlar** (import): fayl turi birinchi baytlaridan (eski .xls, PDF); bizning jadvalmi;
yig'ma varaqmi; boshqa smetalarning nusxasimi; arizadagi smetaning boshqa versiyasimi; arifmetika (miqdor × narx = summa);
«ИТОГО» qatorlar yig'indisiga tengmi; tashish varag'i xatolari. Har bir yuklangan smetaning nom-narxsiz format namunasi
`smeta_files` ga yoziladi — formatlar modeli (`docs/format-reja.md`) shulardan o'rganadi.

### 3. Fayl noto'g'ri o'qiladi (formatlar)

Raqamlash qatori smeta qatori bo'lib tushgan; pul qatori resurs bo'lgan; birlik yozuvi («сўм», «тыс.сум»); ikki qavatli
sarlavha; ichida zip baytlari bor .xls rad etilgan; PDF da raqam ichiga bo'sh joy tushgan. **Qo'riqchi:** har bir qoida
`test/smeta-header.cjs` da raqamlangan holat; qoida o'zgarsa `test/smeta-corpus.cjs` (egasining kompyuterida, `SMETA_KIT`)
qolgan barcha fayllar **avvalgidek** o'qilishini isbotlaydi. Yangi arizaning fayllari to'plamga qo'shiladi va `--record`
qilinadi — shunda keyingi qoida ularni ham buzmaydi.

**68106 (v2.16.21).** «Форма N 6a» smetasida narxlar «в базисном уровне» ustunlarida, «в текущем» — hamma qatorda «--»;
o'quvchi doim joriy ustundan o'qigani uchun barcha narx bo'sh chiqdi. Qo'riqchi: `smeta-header` 36 (eski kodda yiqiladi) va
teskari holat — bitta qatorda joriy narx bo'lsa joriy ustun o'qiladi. O'lchov: boshqa 93 haqiqiy fayl aynan avvalgidek.
Shu arizada umumiy tekshiruvning o'zi ham xato qildi: yuboruvchi narxdan tashqari hajmni ham kamaytirgan, «tejash» so'ralganidan
196 % chiqib, «проверьте сопоставление» deb noto'g'ri ogohlantirdi. Endi tekshiruv faqat narx qismiga qaraydi
(`totals.gotPrice`, `test/compare.cjs`). Saboq: o'zini tekshirish qoidasi ham haqiqiy fayllarda **noto'g'ri ogohlantirish**
bo'yicha o'lchanadi, faqat ushlagani bo'yicha emas.

### 4. Ekran yozganni buzadi yoki xabarni yashiradi

Narx katagiga yozishda raqamlar o'rni almashgan («207187» → «207 871»); o'qilishi shart bo'lgan xabar keyingi oddiy
xabarlar ostida yo'qolgan. **Qo'riqchi:** `test/price-typing.mjs`; «×» li xabar (`opts.close`) siqib chiqarilmaydi.

### 5. Ma'lumot yo'qoladi

Yopilgan vkladkada oxirgi narx; yuklanmagan fayl «saqlangan» deb ko'ringan; ekranga chiqmagan smeta saqlashda
o'chirilgan; ikki vkladka. **Qo'riqchi:** `close-tab`, `upload-fail`, `away-files`, `two-tabs` testlari; ko'chirishdan
oldin zaxira (`transfer`).

### 6. Xotira taklif bermaydi

Tashish narxi nom bo'yicha qidirilgan (masofa bo'yicha kerak edi); bitta arizadagi qabul qilingan narx ishora bermagan.
**Qo'riqchi:** `test/memory.cjs`, `test/e2e-memory.mjs` (masofa oraliqlari, «▲ выше принятого»).
