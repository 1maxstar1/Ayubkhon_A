# Versiyalar, orqaga qaytish va NLP qismini birga rivojlantirish

Bu hujjat ikki savolga javob beradi:

* **A.** Yangi versiyani qanday chiqaraman va agar u ishlamasa, eskisiga qanday
  qaytaman?
* **B.** Dasturning «aqlli» qismlarini (nom taqqoslash, bo'lim, viloyat) o'zim
  qanday yaxshilayman va yaxshilanganini qanday **isbotlayman**?

---

## A. Versiyalar

| Versiya | Nima | Commit |
|---|---|---|
| **v1.0** | NLP qatlamidan **oldingi** dastur. Reyestr, ish maydonlari, aniq nom bo'yicha narx eslatmalari, viloyat — regex bilan. | `7718eb41c9c3888019c6c18711cd96b8da64e3f7` |
| **v2.0** | Resursni ikki alifboda tanish, o'xshash nomlar bo'yicha narx taklifi, bo'limni nomdan aniqlash, viloyatni gazetteer bilan aniqlash. | `e0acf169821b61429afe314df6191e4527467272` |
| **v2.1** | Ikki to'liq tekshiruvning tuzatishlari: narxlarni bitta so'rovda yozish, o'chirilgan hisobning sessiyasini tugatish, fayl havolasini bosilganda imzolash, zaxira sog'ligi banti, eslatmalarni tezlashtirish. Yangi imkoniyat qo'shilmagan — o'zgarishlar tuzatish. | `85128579c2c6e3e7f7dc1c7e57336e1312d7cf35` |
| **v2.2** | Uchinchi tekshiruvning tuzatishlari (`docs/audit-3-reja.md`): boshqa mahsulot narxini taklif qilmaslik (37 → 12 uzoq taklif), mashina-soatni hal qiluvchi qilish, `updated` ni buzmaydigan migratsiya, «Сбросить» ni bo'laklab yuborish, to'la sahifani ikkiga bo'lish; `м²`, to'liq kenglikdagi raqamlar va rim raqamlarini tanish. Yangi o'lchov: `test/hints.cjs`. | `80f64f165c590935688d0006dd426c5ba1e638e7` |
| **v2.3** | Noutbuk rejimi: dastur bitta odamning kompyuterida (Mac/Linux — `server/laptop.sh`, Windows — `server/laptop.cmd`, Node/Git kerak emas), baza shu diskda, kuniga bir zaxira. Kirish oynasi, 4 soatlik qulf va «Выйти» noutbukda o'chirilgan (egasining qarori; `PB_AUTOLOGIN=0` qaytaradi). | `ce9b79aed23ba42b5742df8f112f355e902111f5` |
| **v2.4.1** | Windows noutbuk **o'zi yangilanadi**: faqat `server/releases.txt` dagi relizlar, har biri `%LOCALAPPDATA%\Taqqoslash\app\` da o'z papkasida, yangi versiya o'zini sinovdan o'tkazmaguncha (`serve trial`, `trial.ok`, `supervisor.beat`) `current.txt` o'zgarmaydi; ishlamay qolgan versiya o'zi qaytariladi; `laptop.cmd rollback`, `autoupdate on/off`. Zaxiralar Google Drive'ga ham (`laptop.cmd drive`). Ikki mustaqil tekshiruv (39 + 22 tasdiqlangan topilma) tuzatilgan. v2.4.0 hech qachon ro'yxatga kiritilmagan. | `a3ef5f8d539805c9634093d33ecf62d0b6993978` |
| **v2.5.0** | **Справочные цены**: «Цены» sahifasida eslatma yonida «справ.» — narx hujjatlaridan (ish haqi jadvali, mashina-soat ro'yxati va xulosalar, birja, katalog, zavod ro'yxatlari) topilgan narx: manba, sana, viloyat, QQSsiz asos; faqat «Применить» bilan qo'yiladi, ekspert yozgan narx ustun. Hujjatlar repoga tushmaydi — admin sahifasida yuklanadigan paket (`ref_packages`); `test/refs-parity.cjs` dasturni o'lchangan natijaga bog'laydi, `test/refs-privacy.cjs` har commitni tekshiradi. Bitta-fayl rejimida yo'q. | `b23dad2a3c173948b6d9d1f292428253682be596` |
| **v2.5.1** | **4А shakli (АВС-4)** «Локальный ресурсный сметный расчет» o'qiladi: «Количество единиц», «Сметная стоимость (на единицу / общая)», «Шифр ресурсов» ustuni; bitta varaqdagi har bir lokal smeta alohida obyekt, faqat raqamli qatorlar resurs. Boshqa varaqlar avvalgidek o'qiladi (namunalar eksporti bir xil). Yangi test: `test/smeta-form4a.cjs`. | `fd6703eda83d8e7e6767d38005f681c7e0cee3d8` |
| **v2.5.7** | «Автоподбор» faqat smetadan arzon yashil takliflarni qo'llaydi. «на … ОБОРУДОВАНИЕ» sarlavhali lokal smetaning (masalan «на ТЕХНОЛОГИЧЕСКОЕ ОБОРУДОВАНИЕ») narxi chegaradan yuqori har qanday qatori ham jihoz izohi bilan hisobotga kiradi. v2.5.6 ro'yxatga kiritilmagan. | `7ce36cf80d48653b8242de7947b280c47daae632` |
| **v2.5.5** | Hisobotda jihozlar: nomida «ОБОРУДОВАНИЕ» (yoki «Jihoz») bo'lgan bo'limning narxi chegaradan (sukut 20 mln) yuqori resursi har rejimda izoh bilan («Для полноценного изучения стоимости…»). «Автоподбор»: barcha yashil справочные цены bir tasdiq bilan. Smeta tuzuvchiga yuboriladigan varaq («Только изменённые цены»): faqat farqi chegaradan (sukut 5 mln) katta resurslar. v2.5.2–v2.5.4 ro'yxatga kiritilmagan. | `5cda32b2d00aca559a583f10a376793ab9984f01` |
| **v2.6.0** | **«Сравнение версий»**: smeta tuzuvchi qaytargan fayl birinchi versiya va biz yuborgan jadval bilan solishtiriladi (qaytgan fayl loyihaga qo'shilmaydi). Qatorlar varaq ichida nom + birlik bo'yicha tartibi bilan juftlanadi; so'ralgan narx — hisobotning o'z rejimi va chegarasi bilan. Har qator: исправлено / частично / не исправлено / so'rovga qarshi oshirilgan / so'ralmagan pasaytirish yoki oshirish / miqdor / yangi / o'chirilgan; yashil, sariq, qizil. Yakun kartochkalari, resurs yoki qator ko'rinishi, ikki varaqli `.xlsx`. Yangi testlar: `test/compare.cjs`, `test/e2e-compare.mjs`. | `eb89cfe5a9047fda36c3e1f236a68c77c853802c` |
| **v2.7.0** | «Сравнение версий» kengaytirildi: biz so'ramagan har bir o'zgarish alohida filtr va kartochkada (oldin → keyin, oshgan/kamaygan summa); nomi yoki birligi o'zgartirilgan qator bitta qator bo'lib juftlanadi; «Итоги листов» — ИТОГО, ЗСР, транспорт, ВСЕГО qatorlari oldin → keyin, matni/foizi o'zgargani va qaytgan versiyada yangi paydo bo'lgan «ИТОГО ≠ qatorlar yig'indisi» qizil. Eksport uch varaqli. | `f103d1c8fd67c0a1b57e479677db6c63aacbd4c7` |
| **v2.8.0** | **«Наш ответ (Excel)»**: biz yuborgan jadval fayl sifatida — dasturning o'z eksporti yoki eski PDF javobdan yasalgan Excel (`№ · Наименование · Ед. изм. · Цена по смете · Рыночная цена · Примечание`). Qatorlar smetaga nom + birlik + smeta narxi bo'yicha topiladi, narxlari «Было» loyihasiga qo'yiladi (avvalgi narx ustidan, faylda yo'q resursga tegilmaydi), solishtirishda zamechaniye — aynan fayldagi qatorlar; topilmaganlari ro'yxatda. «Книга цен» ham shu faylni o'qiydi. PDF o'qigich yo'q — PDF avval Excel'ga o'giriladi. | `fb467a4ff44a64bd87ed158549f0be83e218dbd5` |
| **v2.8.1** | Qayta yuklash (Cmd+R / F5) ochiq zayavkaga va yorliqqa qaytadi: ular sahifa manzilida (`#ws=…&tab=…`), kirishdan keyin zayavka o'zi ochiladi; «‹ Заявки» manzilni tozalaydi. Testlar shu xatti-harakatga moslangan (`53b6833`, dastur kodi o'zgarmagan). | `10079e441f1d8c80b9cb53bea6af8f1917b4b3e0` |
| **v2.8.2** | «Сравнение версий» yorlig'ida qayta yuklangandan keyin «Было» loyiha kelishi bilan unga o'tadi (avval bo'sh «Другой файл…» da qolib, qaytgan smeta solishtirilmas edi); loyihalar o'zgarganda ochiq yorliq qayta hisoblanadi. | `c01b2f02a70f0eb0f84c5bb109278eed3766e46b` |
| **v2.8.3** | «Сравнение версий» bo'limi aylanadi (kartochkalar, keyin jadval; sarlavha yopishib turadi) — avval pastki qatorlarga yetib bo'lmasdi. Resurs qatorlari tepasida «‹ Назад к ресурсам» (yoki Esc) — ro'yxatga, qidiruv va joyi bilan qaytadi. | `610cda8b201dfc6572a3b86568c01a82aa055aa5` |
| **v2.8.4** | «Сравнение версий» ga yuklangan fayllar (qaytgan smeta, «Наш ответ», fayldan olingan «Было») ish maydoni fayllari qatorida serverda saqlanadi (`state.compare`) va qayta yuklangandan keyin o'zi qaytadi; ko'rinish va filtr manzilda (`cv`, `cf`). Qaytarilgan «Наш ответ» narx qo'ymaydi — narxlar ish maydonidan keladi. Har bir zayavkaning taqqoslashi o'ziniki. Fayl «Было» qilib tanlansa, loyiha bo'lsa ham tanlangan holda qoladi (v2.8.2 dan beri loyihaga qaytib ketardi). Orqaga qaytishda: eski sahifa bunday ish maydonini avvalgidek ochadi, taqqoslash bo'sh bo'ladi. | `f06cb6326d6b313e88045f28fe64e8a82f01735c` |
| **v2.9.0** | **UZEX (биржа)** — ikkinchi, alohida narx manbai: uzex.uz haftalik kotirovkalari (ruscha sahifa) o'z kolleksiyalarida (`uzex_imports`, `uzex_quotes`, `uzex_settings`), paketlarga tegmaydi. Server ishga tushgach ~30 soniyada va har kuni 09:00 da (Toshkent) o'zi yangilanadi; `admin.html` da «UZEX haftalik narxlar» bo'limi. «Проверка цен» da ikki manba kartochkasi (dastlab faqat «Наш справочник» — hammasi avvalgidek); UZEX takliflari binafsha, qo'llangan narxda «U» belgisi; valyutadagi kotirovka taklif qilinmaydi; boshqa birlik ogohlantirish bilan. Mos kotirovkani «справ.» dvigateli topadi (o'zi o'zgarmagan). Orqaga qaytishda: yangi kolleksiyalar bazada qoladi, eski sahifa ularni ishlatmaydi; UZEX dan qo'llangan narxlar joyida. | `fd09d6599479582a44361608f0d2f8033f30fb2e` |
| **v2.9.1** | UZEX (биржа) takliflari **QQSsiz** ko'rsatiladi va qo'llanadi: birja narxni QQS bilan kotirovka qiladi, smeta QQSsiz tekshiriladi, «Наш справочник» dagi birja narxlari ham paket yig'ilganda 1,12 ga bo'lingan. Bazada kotirovka sayt bosganidek qoladi; narx izohida va taklif qatorida ikkala raqam ham bor. Stavka kotirovka sanasiga qarab: 2023-yildan 12 %, undan oldin 15 %, 2019-yil oktabrgacha 20 %. v2.9.0 da UZEX dan qo'llangan narxlar o'zgarmaydi (ular QQS bilan qo'llangan — qayta ko'rib chiqing). | `41e9e7ce278e03bc14d4c41108a117c4534eb6b1` |
| **v2.9.2** | **Hujjat jamilari** (to'rtinchi tekshiruvning 1-bosqichi, `docs/audit-4-reja.md` A1–A4, A8). «Полная копия»: narxi o'zgargan qatorlar saralangach `ИТОГО` formulasi o'z o'rnidagi qatorlarni yig'adi (avval diapazon torayar, teskari bo'lar yoki aylanma havola berardi). 4А shakli: yozib qo'yilgan `ИТОГО` ikkala tomonda ham yig'indi formulasiga aylanadi — bozor jamisi narxga ergashadi; qiymat bosilgan sondan yarim so'mgacha farq qilishi mumkin (smeta jamini yaxlitlaydi). «на … ОБОРУДОВАНИЕ» lokal smetasi uchun jihoz izohi sahifada ham ishlaydi. Sarlavhasi bor, lekin shakli bo'yicha o'qilmagan varaq (bandlari nom ustunida, bandsiz, ortiqcha ustunli) endi o'qiladi; hozir o'qilayotgan fayllar aynan avvalgidek o'qiladi. «Только изменённые» hisoboti bo'sh qolsa yoki qatorlar chegaradan past bo'lsa, sahifa buni aytadi. Eksport ko'rinishi o'zgarmadi. | `b4a5803d9e775ee2a29523af87b6be5ccc0550e4` |
| **v2.9.3** | **Hech narsa yo'qolmasin** (to'rtinchi tekshiruvning 2-bosqichi: B1, B3–B6, B8, E1, E2). Xabarlar ustma-ust turadi — xatoni oddiy xabar bosib ketmaydi. «Сбросить показанные» nechta narxni qaytarishini aytib so'raydi; «Сбросить», «Применить %» va «Автоподбор» dan keyin 10 soniya **«Отменить»** (narxlar va ularning manbasi qaytadi). Har bir arizaning sozlamalari o'ziniki. Yig'ilgan loyihalar ro'yxati tasma bo'lib qoladi va qaytadi. Loyihani olib tashlash va foydalanuvchini o'chirish so'raydi; o'z hisobini o'chirib bo'lmaydi. Serverga **yuklanmagan smeta «saqlangan» deyilmaydi**: «!», ro'yxat ustida qator va «Повторить», cheklovlar (30 fayl, 60 MB) oldindan aytiladi, chiqishda so'raladi. **Bitta ariza — bitta ishchi vkladka**: yangisi ishlaydi, eskisi saqlab to'xtaydi («Обновить и работать здесь»). **Mac:** zaxira har soatda tekshiriladi, ikkinchi nusxa Google Drive / iCloud Drive papkasiga (`Smeta zaxira (Mac)`; `laptop.sh drive <papka>` / `drive off`), saqlanadi 14 kunlik + 8 haftalik + 12 oylik, `laptop.sh restore <zip>` bazani tiklaydi (hozirgisi chetga suriladi). Windows ishga tushirgichi o'zgarmadi. Hujjat va eksport o'zgarmadi. | `dd28a625e283d34be93f061c7f57e97edc1a72cc` |
| **v2.9.4** | **Begona fayl va chetdagi holatlar** (to'rtinchi tekshiruvning 3-bosqichi: C2–C5, A5, A6, B2, B7). Maxsus tayyorlangan `.xlsx` o'quvchini osib qo'ymaydi va xotirani to'ldirmaydi: o'qish bir o'tishli, ochilgan hajmga cheklov, 90 soniya javob bermagan o'quvchi to'xtatiladi, fayl serverga **o'qilgandan keyin** yuklanadi. Smetaning formulasi faqat **oddiy funksiyalardan** iborat bo'lsa tirik ko'chadi (ro'yxat — `src/lib/formula.js`); boshqasida smeta ko'rsatgan qiymat yoziladi va sahifa nechta ekanini aytadi — haqiqiy smetalarda bunday formula yo'q, hujjat o'zgarmadi. UZEX sahifasini o'qish hajm, qator, hafta va vaqt bo'yicha cheklangan. **Sonlar qat'iy o'qiladi**: «1,234.50» va «1.234,50» — son, yonida so'z bor matn — yo'q; narx katagiga o'qilmaydigan narsa yozilsa katak qizil bo'ladi, narx **o'zgarmaydi** va sahifa aytadi (avval jimgina smeta narxi qaytardi). Summasi «miqdor × narx» ga teng bo'lmagan qatorlar yuklashda sanab aytiladi. **Oxirgi narx yopilgan vkladkada yo'qolmaydi**: narx shu brauzerda ushlab turiladi, chiqishda ikkala so'rov birga ketadi, serverga yetgan tuzatish jadvalga qaytadi. **Holat server cheklovidan oshmaydi**: faqat o'zgargan narxlar saqlanadi, narxlar kitobining smetaga to'g'ri kelmagan qatorlari alohida va sig'ganicha; rad etilgan holat qayta-qayta jo'natilmaydi. Orqaga qaytish xavfsiz: holat avvalgidek ikki kalitda, yangi `state.book` maydonini eski sahifa shunchaki o'qimaydi. | `1487d990badb8e80d4ba32dcc67e6ab0fbe59525` |
| **v2.10.0** | **Qulaylik va QQS** (to'rtinchi tekshiruvning 5-bosqichi: A7, E3–E20, F1–F6, D1–D3, B8 qoldig'i). **QQS ekranda**: QQS bilan yozilganga o'xshash narx («похоже на цену с НДС») va «Прежние проекты» / справочник oynalarida QQS holati; birja narxi taklifda QQSsiz; hujjat (eksport) o'zgarmadi — egasining qarori. **«Применить %» qo'lda yozilgan narxga tegmaydi.** Sarlavhalar o'z ustuni ustida, 1366 × 768 ekranda ixcham rejim; Esc / «Отменить», Ctrl+Enter bilan taklifni qabul qilish, fokus keyingi qatorga; resursga izoh («Eslatma» ustuniga, sozlama bilan); tekshirilgan resurs belgisi; xabarlar tushunarli ruscha (buzilgan fayl, server xatosi), interfeys bitta ruscha lug'atda. Qo'llangan narx katagida manbasi («U» birja, «С» справочник, «П» oldingi loyiha). **Server javob bermasa** — bitta turg'un panel, noutbukda qanday qayta ishga tushirish aytiladi, narxlar brauzerda saqlanadi va server qaytgach o'zi yoziladi. Ochiq sahifa server yangilanganini bilib, «Обновить страницу» deydi. UZEX haftasi ariza sanasi bo'yicha (qo'lda tanlash ariza bilan saqlanadi). **«Цены этого контрагента…»**: shu kontragentning oldingi narxlari bitta ro'yxatda, bitta «Применить выбранные» bilan (qo'lda yozilganga tegmaydi, «Отменить» bilan qaytadi). Viloyat kontragentning oldingi arizalaridan taklif qilinadi; admin viloyatni o'zgartira oladi (narx tuzatishlari birga ko'chadi); tugallangan ariza «Вернуть в работу» bilan qaytadi; ro'yxatda «Сравнить версию»; «Наш ответ» saqlangan eksportlardan. «Сравнение версий»: varaqlar va ko'chgan qatorlar to'g'ri juftlanadi, raqamlari zid qatorlar juftlanmaydi, «Итог не пересчитан по строкам». Hujjat nomida ariza raqami va kontragent. Orqaga qaytish xavfsiz: yangi holat maydonlarini (`notes`, `checked`, `uzex`) eski sahifa shunchaki o'qimaydi; viloyat o'zgarishi faqat admin yo'li bilan. | `5264eae7f7a9e8fa7b34c7e76f5f8babf1ee7554` |
| **v2.10.1** | **Ikki kichik tuzatish** (v2.10.0 dan keyin). Qidiruv maydoniga o'sha matn qayta yozilsa ro'yxat endi qayta chizilmaydi — avval qayta chizish qator belgisiga (UZEX, справочник) bosish ustiga tushsa, bosish yo'qolib, oyna ochilmay qolardi. Qo'llangan narxning manba belgisi (U / С / П) server sekin javob berganda ham chiqadi — avval tuzatishlar ro'yxat chizilgandan keyin kelsa, belgi keyingi aylantirishgacha ko'rinmasdi. Ma'lumot va holat formati o'zgarmadi — orqaga qaytish xavfsiz. | `01fc27e37c8f7f20e428aef19fae2cc024772bee` |
| **v2.10.2** | **5-bosqich kodini ko'rib chiqishdan keyingi tuzatishlar.** Server javob bermay turganda «‹ Заявки» endi arizani yopmaydi (avval yopib, faqat serverdagi holatni — «проверено» belgilari, izohlar, UZEX haftasi, loyihalar tartibi — yo'qotardi). «Отменить» faqat o'sha bosish qo'ygan narxlarni qaytaradi — undan keyin yozilgan narx qoladi. Ctrl+Enter справочник va UZEX oynasida «Похожие» qatorini (boshqa resurs narxini) hech qachon olmaydi. Esc va chiqish resursni «проверено» qilmaydi. «Наш ответ» uchun kech kelgan eksport boshqa arizaga o'qilmaydi. «Сравнение версий»: «so'radikmi» jadvaldagidek aniq (katta miqdorda so'mdan kichik farq ham so'rov), o'zgarmagan qator «исправлено» deb chiqmaydi. Viloyat ko'chirilishi bilan bir paytda saqlangan narx yangi viloyatga yoziladi. Ma'lumot va holat formati o'zgarmadi — orqaga qaytish xavfsiz. | `ae308c26a7b5cbc0836ef0c5d613c26988aecf5c` |
| **v2.10.3** | **Справочник: QQS bilan yozilgan hujjat aytiladi** (E12b, egasining javobi 2026-11-13). Narx hujjatining o'zida QQS bilan yozilgan bo'lsa (paketda `vat_default: true` — narx 1,12 ga bo'linib, QQSsiz qo'yilgan), справочник oynasidagi qator «в документе цена с НДС — здесь без НДС» deydi; bir necha hujjat medianasi — nechtasi QQS bilan ekanini. Narxlarning o'zi o'zgarmadi. Ma'lumot va holat formati o'zgarmadi — orqaga qaytish xavfsiz. | `696fd2b2157aff23072bd4daa4b99ffef68e5c79` |
| **v2.11.0** | **O'rganish uchun yozuvlar** (`docs/ai-reja.md`, 1-bosqich) — ekran, takliflar va narxlar **o'zgarmaydi**, dastur faqat yozib boradi. **Qarorlar jurnali**: narx hal qilinganda (taklif qo'llandi, qo'lda yozildi, smeta narxi qaytarildi, «Автоподбор», ommaviy o'zgarish) o'sha resursga ko'rsatilgan takliflar belgilari bilan (nomsiz, smeta narxisiz) va qaysi biri tanlangani yoziladi. **«✓ Завершить» avval so'raydi**: nechta narx o'zgargan, nechtasi smetadagidek qolgan, nechtasi «проверено»; «qolganlarini tekshirilgan deb hisoblash» va «не учитывать в обучении» (sinov arizasi) — keyin har bir resurs turi bilan xotiraga yoziladi; qayta yakunlash yozuvlarni almashtiradi. «Сравнение версий» dagi «Исправлено» narxni «pudratchi qabul qilgan» deb belgilaydi. Admin sahifasida **«Обучение»** — faqat sonlar. Jurnal yozilmay qolsa ish to'xtamaydi. Reliz skriptida `--unlisted` / `--list`: egasi sinamagan versiya `releases.txt` ga tushmaydi. Orqaga qaytish xavfsiz: ish maydoni holati o'zgarmagan, yangi jadvallar ishlatilmay qoladi. | `61bdddcfe2c47e480c16a02d3a3e94f3ae658905` |
| **v2.12.0** | **Xotira ekranda** (`docs/ai-reja.md`, 2-bosqich). Yakunlangan arizalaringiz endi shu viloyatdagi shu resurs uchun qaytadi. Nom yonida **«пам.»** — bu resursga yakunlangan arizada o'zingiz narx qo'ygansiz: oynada avval shu kontragentning arizalari, keyin boshqalar, pudratchi qabul qilgan narx («принята подрядчиком») oldinda, har biri ariza raqami va sanasi bilan; narx faqat «Применить» bilan qo'yiladi (manbasi `mem:` deb saqlanadi). Smeta narxi yonida **«✓»** — bu yoki undan baland narx kamida ikki mustaqil arizada (turli kontragentlar) o'zgarishsiz qoldirilgan («ранее принято»); **«▲»** va sariq katak — smeta narxi ilgari qabul qilinganidan baland. Tegilmagan narx bozor narxi emas, chegara; kontragentning o'z narxi o'zini tasdiqlamaydi; qabul 6 oygacha to'liq, 12 oyda tugaydi. «Применить %» va 0 narxlar taklif qilinmaydi; boshqa viloyat o'qilmaydi. Asboblar qatoridagi **«Память»** kaliti hammasini o'chiradi. Boshqa takliflar va ularning tartibi o'zgarmadi. Orqaga qaytish xavfsiz: holat formati o'zgarmagan. | `d8f3c0ed92375341d1962337f586130627859ef1` |

Versiya — bu shunchaki **commit**. Git har bir o'zgarishni saqlaydi, shuning
uchun «eski versiya» hech qayerga yo'qolmaydi: u tarixda turadi va istalgan
vaqtda qaytariladi.

### Qaysi versiya ishlayotganini bilish

Dastur sarlavhasida, nomdan keyin kichik yorliq bor: **`v2.1.0`**. Admin
sahifasida ham shunday.

Yorliq **v2.0 dan boshlab** qo'shilgan, shuning uchun:

* yorliq `v2.3.0` deb turibdi → noutbuk rejimi, kirish oynasisiz;
* yorliq `v2.2.0` deb turibdi → uchinchi tekshiruv tuzatishlari bilan;
* yorliq `v2.1.0` deb turibdi → birinchi ikki tekshiruv tuzatishlari bilan;
* yorliq `v2.0.0` deb turibdi → tuzatishlardan oldingi versiya;
* **yorliq umuman yo'q** → server v1.0 ga qaytarilgan.

Server qaytarilgandan keyin brauzerni **Ctrl+Shift+R** bilan yangilang — aks
holda eski sahifa keshda qolib ketadi va siz noto'g'ri holatni ko'rasiz.

### Teglarni o'z kompyuteringizda yaratish

Men teglarni serverga yubora olmadim (bu sessiyaning GitHub huquqi faqat
branch'ga yozishga yetadi, teglarga emas). Siz o'zingiz bir marta yarating —
shundan keyin `v1.0` deb yozish `rollback.sh` da ishlaydi:

```sh
git fetch origin
git tag -a v1.0 7718eb41c9c3888019c6c18711cd96b8da64e3f7 -m "NLP qatlamidan oldingi versiya"
git tag -a v2.0 e0acf169821b61429afe314df6191e4527467272 -m "Resurs, bo'lim va viloyatni tanish"
git tag -a v2.1 85128579c2c6e3e7f7dc1c7e57336e1312d7cf35 -m "Ikki tekshiruvning tuzatishlari"
git push origin v1.0 v2.0 v2.1
```

Tegsiz ham hammasi ishlaydi — `rollback.sh` ga commit raqamini bersangiz bo'ldi.

---

## Yangi versiyani chiqarish tartibi

Har safar **shu ketma-ketlikda** qiling. Uchinchi qadam eng muhimi: zaxira
bo'lmasa, orqaga qaytish ham bo'lmaydi.

Server manzili **bir marta** topiladi va eslab qolinadi (`server/deploy/.target`,
gitga tushmaydi); shundan keyin chiqarish buyruqlari argumentsiz ishlaydi.
Manzilni o'zingiz yozishingiz shart emas — `find-server.sh` uni shu
kompyuterning tarixidan (oldingi `push.sh`, `ssh`) va `~/.ssh` dan topadi:

```sh
sh server/deploy/find-server.sh        # topilganlarni raqamlab ko'rsatadi
sh server/deploy/find-server.sh 1      # birinchisini tekshiradi (ssh) va eslab qoladi
```

Hech narsa topilmasa, manzil brauzerda: dastur ochiladigan sahifaning manzil
qatorida `http://` dan keyin turgan raqamlar. Shu raqamlarni `root@` dan keyin
yozib bering: `sh server/deploy/find-server.sh root@` + raqamlar.

Chiqarishning o'zi — har safar shu to'rt qadam:

```sh
# 1. Barcha testlar (fayllarsiz ham bo'ladi — smetaga bog'liqlari SKIP bo'ladi)
sh test/all.sh
#    "… ok, 0 fail" chiqishi kerak. Smeta fayllari bilan to'liq tekshirish uchun
#    «sh test/all.sh » deb yozing va fayllarni Finder'dan terminalga sudrab tashlang.
#    Brauzer testlari uchun bir marta: npm i -D playwright, keyin npx playwright install chromium

# 2. Serverdagi hozirgi holatni yuklab oling — bu sizning "qaytish nuqtangiz"
sh server/deploy/pull-backup.sh

# 3. Yangi versiyani chiqaring
sh server/deploy/push.sh

# 4. Brauzerda tekshiring: Cmd+Shift+R (Windows: Ctrl+Shift+R), sarlavhadagi versiya raqami yangimi?
```

Skriptlarga manzilni qo'lda ham berish mumkin (`sh server/deploy/push.sh root@…`);
ko'rsatmadagi `root@SERVER_IP` yoki misoldagi raqam aynan shu holda berilsa,
skript buni aytadi va hech narsa qilmasdan to'xtaydi.

Keyin **bir necha kun haqiqiy ish bilan sinang**: bitta arizani oching,
narxlarni kiriting, hujjatni eksport qiling, natijani eski hujjat bilan
solishtiring.

## Orqaga qaytish

Agar yangi versiya biror joyda noto'g'ri ishlasa:

```sh
sh server/deploy/rollback.sh v2.1
```

(Manzil eslab qolingan bo'lsa — yuqoridagi `find-server.sh` — yozilmaydi;
aks holda `sh server/deploy/rollback.sh root@… v2.1`.) Skript uch ish qiladi:

1. **serverda yangi zaxira oladi** — ya'ni qaytishning o'zi ham qaytariladi;
2. eski versiyani **vaqtinchalik nusxada** yig'adi, sizning fayllaringizga
   tegmaydi;
3. sahifalar va hook'larni almashtirib, serverni qayta ishga tushiradi.

Ma'lumotlar bazasiga **tegilmaydi**. Yangi versiya qo'shgan ustunlarni eski
versiya shunchaki e'tiborsiz qoldiradi; ularni o'chirish esa — yagona
qaytarib bo'lmaydigan qadam bo'lardi.

Qayta oldinga yurish uchun oddiy `push.sh` yetarli:

```sh
sh server/deploy/push.sh
```

### Ma'lumot yo'qoladimi?

**Yo'q, ikkala yo'nalishda ham.** Sabab shunda:

* Narxlar resurs **nomidan yasalgan kalit** bo'yicha saqlanadi, v2 esa bu
  kalitni o'zgartirdi (klaviatura almashinuvi, tinish belgilari).
* Shuning uchun v2 ish maydonini saqlaganda narxlarni **ikki marta** yozadi:
  `prices` — eski versiya tushunadigan kalitda, `prices2` — yangisida.
* v1 `prices` ni o'qiydi, v2 `prices2` ni. Ikkalasi ham to'liq.
* Eski ish maydonini v2 ochganda, kalitlar avtomatik ko'chiriladi va ekranda
  «Цены перенесены…» yozuvi chiqadi.

Yagona istisno — agar siz v1 ga qaytib, **u yerda yangi narxlar kiritsangiz**,
keyin yana v2 ga o'tsangiz: v1 `prices2` ni yozmaydi, shuning uchun v2 eski
kalitlardan qayta ko'chiradi. Bu ham ishlaydi, lekin bir marta «ko'chirildi»
xabarini ko'rasiz. Shunga qaramay, ikkinchi qadamdagi zaxirani doim oling.

---

## B. NLP qismlarini birga rivojlantirish

Bu yerda **o'qitilgan model yo'q** — hech qanday `.h5`, `.pkl` yoki og'ir
kutubxona. Butun «bilim» oddiy JavaScript jadvallarida yotadi, ularni o'qish
ham, o'zgartirish ham mumkin. Bu ataylab shunday: siz smeta mutaxassisisiz,
qaysi so'z nimani anglatishini modeldan yaxshiroq bilasiz.

### Bilim qayerda turadi

| Fayl | Nimani hal qiladi | Nimani o'zgartirasiz |
|---|---|---|
| `src/lib/normalize.js` | «Bu ikki nom bitta resursmi?» (hujjat ichida) | `L2C` — bir xil ko'rinadigan harflar |
| `src/lib/match.js` | Alifbolar orasidagi moslik, o'xshashlik bali | `TR` transliteratsiya, `UNIT_SAME` o'lchov birliklari |
| `src/lib/sections.js` | Материалы / машины / труд | `LEX` — har bir bo'limning so'z o'zaklari |
| `src/lib/regions.js` | Viloyat | `NAME` va `PLACE` — viloyat, shahar, tuman nomlari |

### O'lchov qayerda turadi

| Fayl | Nima | Yorliqni kim qo'ygan |
|---|---|---|
| `test/fixtures/resource-names.json` | 903 ta haqiqiy resurs nomi | — (faqat birlashmalarni tekshirish uchun) |
| `test/fixtures/resource-sections.json` | 2085 ta resurs + bo'limi | **smetaning o'zi** (qaysi band ostida turgani) |
| `test/fixtures/application-regions.json` | 1247 ta ariza + viloyati | **reyestrning o'zi** («место» ustuni) |
| smeta faylining o'zi (`test/hints.cjs`) | har bir resursning narxi | **smetaning o'zi** (narx ustuni) |

Yorliqlarni men ham, siz ham yozmaganmiz — ular hujjatlardan olingan. Shuning
uchun raqamlarga ishonish mumkin.

### Ish sikli: o'zgartir → o'lcha → qoldir yoki qaytar

```sh
# 1. Hozirgi raqamni yozib oling
node test/sections.cjs | grep "held out"
#    held out: 895 rows — right 824, wrong 1, no answer 70 (99.9% …)

# 2. Jadvalga bitta so'z qo'shing (quyida misollar)

# 3. Qayta o'lchang
node test/sections.cjs | grep "held out"

# 4. Raqam yaxshilandimi — qoldiring. Yomonlashdimi — qaytaring:
git checkout src/lib/sections.js
```

To'rtta o'lchov buyrug'i:

```sh
node test/normalize.cjs   # nom kalitlari va o'xshashlik
node test/sections.cjs    # bo'lim
node test/regions.cjs     # viloyat
node test/hints.cjs a.xlsx b.xlsx   # «Похожие ресурсы» takliflari
```

Oxirgisi o'xshashlik balini narx bilan o'lchaydi: har bir resursga o'z kaliti
hovuzdan olib tashlangan holda taklif so'raladi (`hints.js` qanday ishlasa,
xuddi shunday), so'ng eng yuqoridagi taklifning narxi resursning o'z narxi
bilan solishtiriladi. Taklif haqiqatan ham o'sha resurs bo'lsa, narxlar
yaqin turadi. Hech narsa yozilmaydi — smeta faqat xotirada o'qiladi.

### Misol 1 — bo'limga yangi so'z qo'shish

Aytaylik, smetada `ГИДРОМОЛОТЫ` uchraydi va dastur uni tanimayapti.

```js
// src/lib/sections.js, machines ro'yxati ichida
['GIDROMOLOT', 3],   // гидромолот — mashina
```

O'zak **lotin harflarida va transliteratsiyadan keyingi ko'rinishda** yoziladi.
Qanday ko'rinishini bilish uchun:

```sh
node -e "
const fs=require('fs'),vm=require('vm');const c={console};vm.createContext(c);
for(const f of ['src/lib/normalize.js','src/lib/match.js'])
  vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
console.log(c.S.tokens('ГИДРОМОЛОТЫ ГИДРАВЛИЧЕСКИЕ'));
"
// -> [ 'GIDROMOLOTI', 'GIDRAVLICHESKIE' ]
```

O'zak — so'zning **boshi**: `GIDROMOLOT` `GIDROMOLOTI`, `GIDROMOLOTLAR` va
`ГИДРОМОЛОТА` ni ham qamrab oladi. Vazn: `3` — «bu so'z aynan shuni anglatadi»,
`2` — «kuchli, lekin boshqa bo'limda ham uchraydi», `1` — «kichik ishora».

### Misol 2 — viloyatga tuman qo'shish

```js
// src/lib/regions.js, PLACE ichida
namangan: '… CHUST CHORTOQ YANGI_TUMAN_NOMI',
```

**Ikki imlo kerak bo'lishi mumkin**, chunki ruscha va o'zbekcha bir xil
transliteratsiya qilinmaydi:

| Kirillcha | Lotincha | Natija |
|---|---|---|
| Андижон | Andijon | `ANDIZHON` va `ANDIJON` — ikkalasi kerak |
| Ёзёвон | Yozyovon | `EZEVON` va `YOZYOVON` — ikkalasi kerak |
| Самарқанд | Samarqand | `SAMARQ` bitta o'zak yetadi |

Tekshirish:

```sh
node -e "
const fs=require('fs'),vm=require('vm');const c={console};vm.createContext(c);
for(const f of ['src/lib/normalize.js','src/lib/match.js'])
  vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
for (const w of ['Ёзёвон','Yozyovon','Андижон','Andijon'])
  console.log(w.padEnd(12), c.S.matchKey(w));
"
```

**Ehtiyot bo'ling:** nom bir necha viloyatda uchrasa, uni **hech kimga
bermang**. `Улуғбек` — shaxs ismi (Samarqanddagi rasadxona, ko'chalar),
`Олмазор` — 11 ta viloyatdagi mahalla, `Зарафшон` — daryo. Bular ataylab
ro'yxatga kiritilmagan va `test/regions.cjs` buni qulflab qo'ygan.

### Misol 3 — o'lchov birligi sinonimi

```js
// src/lib/match.js, UNIT_SAME ichida
DONA: 'SHT',      // o'zbekcha "dona" = "шт"
```

Lekin `100ШТ` va `ШТ` **hech qachon** birlashmaydi — yuztalik narx bilan
donabay narx boshqa narsa.

### Buzilmasligi kerak bo'lgan qoidalar

1. **Raqamlar saqlanadi.** `АНКЕР М5` ≠ `АНКЕР М8`, `4.1.1` ≠ `4.11`,
   `СТАЛЬ А-I` ≠ `СТАЛЬ А-III`. Ikki raqam orasidagi ajratgichni hech qachon
   shunchaki o'chirmang — `1, 5` va `15` bitta bo'lib qoladi.
2. **Ayniylik kaliti (`nameKey`) moslik kalitidan (`matchKey`) ehtiyotkorroq.**
   `matchKey` birlashtirgan hamma narsani `nameKey` ham birlashtira olmasligi
   kerak, aksi emas. Testda shu tekshiriladi.
3. **Материалы ↔ оборудование chegarasi «xato» deb aytilmaydi** — smetalarning
   o'zi ko'cha chirog'ini goh u, goh bu bandga qo'yadi.
4. **Taklif — taklif, buyruq emas.** Hech qanday kod foydalanuvchi bosmasdan
   narxni yozmaydi.

### Yangi hujjatlar kelganda

Yangi smeta yoki yangi reyestr eksporti kelsa, o'lchov ma'lumotini yangilang:

```sh
node test/fixtures.cjs --smeta yangi1.xlsx yangi2.xlsx --registry yangi-reestr.xls
node test/normalize.cjs && node test/sections.cjs && node test/regions.cjs
node test/hints.cjs yangi1.xlsx yangi2.xlsx
```

Raqamlar tushib ketsa — yangi hujjatlarda dastur bilmaydigan so'zlar bor,
demak yuqoridagi jadvallarga qo'shish kerak. Bu — loyihaning «o'rganishi»:
model emas, siz.

### Menga qanday topshiriq berish qulay

Eng foydali shakl — **misol bilan**:

> «Bu ikki nom bitta resurs, lekin dastur ularni ajratyapti:
> `ТРУБА ПНД Д-110` va `ТРУБА ПОЛИЭТИЛЕНОВАЯ Д-110ММ`»

yoki

> «Косонсой Namanganda, lekin dastur Qashqadaryo deyapti»

Shunday misoldan men (a) uni takrorlaydigan test yozaman, (b) qoidani
tuzataman, (c) 1247 ta arizada raqam yomonlashmaganini ko'rsataman. Uchtasi
ham bo'lmasa — o'zgarish qilinmaydi.
