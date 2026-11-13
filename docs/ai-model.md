# Dastur nimadan o'rganadi — egasi va mijoz uchun oddiy tilda

Bu hujjat bosqichma-bosqich to'ldiriladi (reja — `docs/ai-reja.md`). Hozirgi holat: **2-bosqich — yozib borish va
xotirani ko'rsatish**. Bu hali «model» emas: dastur yakunlangan arizalaringizni eslab, shu viloyatdagi shu resurs
uchun ko'rsatadi. Boshqa takliflar (справочник, birja, oldingi loyihalar) va ularning tartibi avvalgidek; narxni
baribir siz qo'yasiz.

## Xotira ekranda nima ko'rsatadi

- **«пам.»** tegi — bu resursga yakunlangan arizada o'zingiz narx qo'ygansiz. Oynasida: avval shu kontragentning
  arizalari, keyin boshqalar; pudratchi qabul qilgan narx («принята подрядчиком») birinchi; har biri ariza raqami,
  kontragent va sana bilan. «Применить» bosilsagina narx qo'yiladi.
- Smeta narxi yonidagi **«✓»** — bu yoki undan baland smeta narxi kamida ikki **mustaqil** arizada (turli
  kontragentlar) o'zgarishsiz qoldirilgan: «ilgari qabul qilingan». **«▲»** va sariq katak — smeta narxi ilgari qabul
  qilinganidan baland: qarab chiqish kerak. Bu bozor narxi emas, chegara: bozordan arzon smeta narxiga dastur
  tegmaydi. Kontragentning o'z eski narxi o'zini tasdiqlamaydi; qabul 6 oygacha to'liq kuchda, 12 oyda tugaydi.
- Faqat shu viloyat. «Применить %» bilan qo'yilgan va 0 qilingan narxlar taklif qilinmaydi.
- **O'chirish:** ro'yxat ustidagi «Память» kaliti (shu brauzerda eslab qolinadi).

## Nima yozib boriladi

1. **Qarorlar jurnali.** Resurs narxi hal qilinganda (taklif «Применить» bilan qo'yildi, narx qo'lda yozildi, smeta
   narxi qaytarildi, «Автоподбор», ommaviy o'zgarish) dastur o'sha paytda shu resursga ko'rsatilgan takliflarni
   yozib qo'yadi: o'rni, turi, darajasi, nom qanday mos kelgani, narxi, sanasi, viloyati — va qaysi biri
   tanlanganini. Taklif **nomi yozilmaydi**, **smeta narxi ham yozilmaydi** (u hech qachon tartiblash uchun
   ishlatilmaydi — aks holda dastur «smetaga yaqin narx»ni tanlashni o'rganib olardi).
2. **Yakunlangan arizalar narxlari.** «✓ Завершить» bosilganda oyna chiqadi: nechta narx o'zgartirilgan, nechtasi
   smetadagidek qolgan, nechtasi «проверено» deb belgilangan. Tasdiqlansa, har bir resurs turi bilan yoziladi:
   - **o'zgartirilgan** — sizning bozor narxingiz (qayerdan olingani bilan: qo'lda, справочник, oldingi loyiha,
     birja, «Применить %»);
   - **nolga tushirilgan** — resurs chiqarib tashlangan; narx sifatida o'rganilmaydi;
   - **qoldirilgan va tekshirilgan** — «shu narxgacha qabul qilingan» (o'zingiz belgilagan yoki yakunlash oynasida
     «qolganlarini tekshirilgan deb hisoblash» bilan);
   - **qoldirilgan** — yakunlangan arizada shunday qolgan.
   Qayta «Завершить» eski yozuvlarni almashtiradi, ustiga qo'shmaydi.
3. **Pudratchi qabul qilgani.** «Сравнение версий» da «Исправлено» chiqqan narx «ikki tomon rozi» deb belgilanadi.

## Nima hech qachon bo'lmaydi

- Narx o'zi qo'yilmaydi: faqat «Применить» yoki mavjud ommaviy amallar (tasdig'i bilan).
- Ma'lumot kompyuterdan chiqmaydi: hammasi shu o'rnatmaning bazasida. Repoga, boshqa mijozga, internetga
  ketmaydi. Har bir o'rnatma bo'sh boshlanadi va faqat o'z ishidan o'rganadi.
- Jurnal ishni to'xtatmaydi: yozilmay qolsa, hech narsa demaydi, narx baribir saqlanadi.

## Qanday o'chiriladi

- **Bitta ariza uchun:** «✓ Завершить» oynasida «Не учитывать эту заявку в обучении (тестовая)» — ariza yakunlanadi,
  undan hech narsa eslab qolinmaydi (oldin yozilgani ham o'chadi).
- **Ish maydoni tozalansa yoki o'chirilsa** (admin) — uning jurnali va xotirasi ham o'chadi.
- Eski versiyaga qaytilsa — yangi jadvallar bazada ishlatilmay qoladi, hech narsaga xalaqit bermaydi.

## Qancha to'plangani

Admin sahifasi → «Обучение»: faqat sonlar (nom va narx yo'q). «Скопировать числа» shu sonlarni matn qilib beradi —
uni dasturchiga yuborish xavfsiz.

## Hozirgi takliflar qanchalik to'g'ri — «Набор для обучения»

Admin sahifasi → «Обучение» → **«Собрать и измерить»**. Dastur yakunlangan arizalaringizdagi har bir narxni
spravochnikdan qaytadan so'raydi — o'sha arizaning sanasida — va bugun nima taklif qilishini siz o'shanda nima
qilganingiz bilan solishtiradi. Hisob shu brauzerda bajariladi; hech narsa tashqariga ketmaydi va bazaga
yozilmaydi.

Har bir narx to'rt turdan biriga tushadi:

| Siz nima qilgansiz | Dastur buni qanday tushunadi |
|---|---|
| Spravochnik qatorini «Применить» bilan olgansiz | o'sha qator — to'g'ri javob |
| Narxni qo'lda yozgansiz va u biror qatordan 2 % ichida | o'sha qator — «deyarli to'g'ri» javob |
| Narxni qo'lda yozgansiz, hech bir qator yaqin emas | «hech biri to'g'ri emas» — bunday paytda jim turish kerak |
| Smeta narxini qoldirgansiz, garchi pastroq qator bor edi | hech biri olinmagan (kuchsizroq dalil) |

Hisobga kirmaydi: smeta narxi qoldirilgan va barcha qatorlar undan yuqori bo'lgan resurslar (taklif rad etilmagan —
shunchaki kerak bo'lmagan), «Применить %» narxlari, nolga tushirilgan resurslar, spravochnikda umuman topilmagan
resurslar.

Sonlar nimani anglatadi:

- **«первая строка — та, что выбрал эксперт»** — dastur birinchi qilib ko'rsatgan qator siz tanlagan qator bo'lgan
  savollar ulushi. Kvadrat qavsdagi ikki son — ishonch oralig'i: savollar kam bo'lsa u keng bo'ladi.
- **«правильная строка среди первых трёх»** — to'g'ri qator birinchi uchtalikda bo'lgan ulush.
- **«программа промолчала…»** — hech bir qator to'g'ri kelmaganda dastur jim turgan ulush. Bugungi qoidalar hech
  qachon jim turmaydi, shuning uchun hozir bu 0 — model aynan shuni o'rganishi kerak.
- **«медианное расхождение…»** — birinchi qator narxi siz qo'ygan narxdan o'rtacha necha foiz farq qilgani.
- **«проверочная часть»** — eng yangi arizalarning beshdan biri. Ularda hech narsa o'qitilmaydi: model keyin
  aynan shularda sinaladi, shunda u «yodlab olgan»ini emas, haqiqatan o'rganganini ko'ramiz.

**«Скопировать числа»** — shu sonlar matn ko'rinishida (kalit = son). Nom, narx, hujjat yo'q; dasturchiga
yuborish xavfsiz. **«Сохранить набор в файл»** — datasetning o'zi (`….dataset.json`): har bir qator uchun 62 ta son
(belgilar) va belgi; nom, birlik, narx va hujjat unda ham yo'q. Faylni o'zingizda saqlang — dastur papkasiga
qo'ymang.

**«Проверочный список…»** — majburiy emas. O'zingiz qo'lda tuzgan ro'yxat: Excel jadvali (ustunlar:
`Наименование`, `Ед. изм.`, `Регион`, `Дата`, `Цена`) yoki JSON. U shu brauzerda saqlanadi, alohida o'lchanadi va
unda hech qachon hech narsa o'qitilmaydi — eng halol imtihon.

### Dataset fayli (format `smeta-ml-dataset`, 1-versiya)

```
{ "format": "smeta-ml-dataset", "version": 1,
  "schema": { "hash": "f1-…", "names": ["t_exact", …] },    // belgilar sxemasi; boshqa sxemadagi model yuklanmaydi
  "package_id": "…", "built": "…", "near": 0.02, "rows": N,
  "apps": [{ "id": "…", "finished": "YYYY-MM-DD", "region": "…", "split": "train|test|gold", "n": N }],
  "queries": [{ "a": ariza raqami, "kind": "ref|near|none|left", "w": og'irlik, "acc": pudratchi qabul qilganmi,
                "sec": bo'lim, "k": nom kalitining xeshi, "seen": 0|1,
                "x": [[62 son] …],  "y": [1 | 0.5 | 0 | -1 …],  "tiers": [daraja …],
                "base": { "y": [bugungi tartibdagi belgilar], "tier": birinchi qator darajasi, "rel": narx xatosi } }],
  "skipped": { "above": N, "pct": N, "zeroed": N, "empty": N, "empty_corrected": N, "lost": N } }
```
