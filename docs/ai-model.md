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
