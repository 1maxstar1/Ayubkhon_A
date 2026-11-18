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
| **v2.13.0** | **Dataset va bugungi takliflar o'lchovi** (`docs/ai-reja.md`, 3-bosqich). Admin sahifasi → «Обучение» → **«Набор для обучения»**: «Собрать и измерить» har bir yakunlangan narxni o'z arizasi sanasida spravochnikdan qayta so'raydi va dastur bugun nima taklif qilishini ekspert o'shanda nima qilgani bilan solishtiradi (qo'llangan qator; qo'lda yozilgan narx qatordan 2 % ichida; hech bir qator to'g'ri kelmagan; smeta narxi qoldirilgan, garchi pastroq qator bor edi). Ko'rsatiladi: savollar soni turlari bo'yicha va bugungi qoidalarning aniqligi — birinchi qator to'g'rimi, to'g'ri qator birinchi uchtalikdami, narx farqi — ishonch oralig'i bilan; eng yangi arizalarning beshdan biri test qismi, unda hech narsa o'qitilmaydi. Hisob shu brauzerda, bazaga hech narsa yozilmaydi; ekranda va «Скопировать числа» da faqat sonlar (nom, narx, hujjat yo'q). «Сохранить набор в файл» — datasetning o'zi (belgilar va belgilar, nomsiz va narxsiz); «Проверочный список…» — qo'lda tuzilgan ro'yxat, alohida o'lchanadi. **Takliflarning o'zi, ularning tartibi va ekran o'zgarmadi** — bu faqat o'lchov. Orqaga qaytish xavfsiz: baza va holat formati o'zgarmagan. | `f166e23cf60f384ac09d4d4a013ae3d22cdca489` |
| **v2.13.1** | **Eski arizalar bilan to'ldirish.** Ilgari ishlangan arizani xotiraga qo'shish mumkin: smetani yuklab, «Сравнение версий» da «Наш ответ (Excel)» orqali o'shanda yuborilgan javob faylini berib, «✓ Завершить» bosiladi. Narxning sanasi endi **arizaning o'z sanasi** (ro'yxatga olingan yoki tanlangan sana), bugungi kun emas: bir yillik narx xotirada bir yillik hisoblanadi (24 oydan eski narx taklif qilinmaydi, 12 oydan eski qabul «ранее принято» bermaydi), «Набор для обучения» da esa arizalar shu sana bo'yicha tartiblanadi — test qismi haqiqatan eng yangi arizalar. Takliflar va ekran o'zgarmadi; orqaga qaytish xavfsiz. | `24f6baa2e01f76e09a0f10d7c6852f254f622b9a` |
| **v2.13.2** | **«Сравнение версий» без исправленной сметы.** Eski arizani o'rganish uchun kiritganda (smeta + «Наш ответ (Excel)» + «✓ Завершить») tuzatilgan smeta odatda yo'q — sahifa endi buni aytadi: javob qo'llangan («строк N, найдено M, цен проекта обновлено K»), bir resursga ikki marta yozilgan qatorlar, smetada topilmagan qatorlar ro'yxati, va «Исправленная смета не обязательна — проверьте цены и нажмите «✓ Завершить»». Avval sahifa bo'sh turar va «ishlamayapti» bo'lib ko'rinardi. Narxlar va takliflar o'zgarmadi; orqaga qaytish xavfsiz. | `fc765584b8b5aafe92569cfcfe4972e2b076d8bb` |
| **v2.14.0** | **Narx modeli — o'lchov** (`docs/ai-reja.md`, «Модель цен», 1-qadam). Admin → «Обучение» → «Собрать и измерить» endi narx modelini ham o'qitadi va sinaydi: har bir resurs uchun smeta narxiga qaramasdan ekspertning bozor narxi taxmin qilinadi (shu viloyatdagi oldingi arizalarda o'zi qo'ygan narx → spravochnik qatori → ilgari qabul qilingan narx, ustiga o'rganilgan tuzatish), keyin smeta narxi shu taxmindan baland bo'lsa «qimmat» deb belgilanadi. Jadvalda uch usul («по строке справочника», «по прежней цене, иначе по справочнику», «с обученной поправкой») eng yangi arizalarda yonma-yon: belgilanganlarning nechtasini ekspert haqiqatan pasaytirgan, u pasaytirganlarning nechtasi topilgan, nechta qabul qilingan narx behuda belgilangan, taklif narxi qancha farq qiladi. **Model hozircha ish sahifasida ishlatilmaydi** — takliflar va ekran o'zgarmadi; egasi sonlarni ko'rgach keyingi versiyada yoqiladi. Orqaga qaytish xavfsiz: baza va holat formati o'zgarmagan. | `ef626b21e1d3520af2e22dee536ae3e804d0c66b` |
| **v2.14.1** | **«Ведомость потребных ресурсов» o'qiladi.** «ВЕДОМОСТЬ ПОТРЕБНЫХ РЕСУРСОВ» shaklidagi smeta (miqdor — «Сметная потребность», narx — «Сметная стоимость → единицы, всего», bo'limlar birinchi ustunda, qatorlar «1.», «2.» …) avval «листы ресурсов не найдены» deb rad etilardi. Endi har bir obyekt varag'i alohida loyiha qismi bo'lib o'qiladi; tashish qatorlari (raqamli yoki raqamsiz) resurs sifatida olinadi, «5 % от стоимости материалов» kabi so'mdagi qator resurs emas. Boshqa barcha smetalar avvalgidek o'qiladi (tekshirildi). Orqaga qaytish xavfsiz. | `71d9bc7e55a414b26cff59f3b49e6bd51d91e00e` |
| **v2.14.2** | **«ТРАНСПОРТ» varag'i o'qiladi.** Smetada tashish alohida varaqda bo'lsa (material, birlik, miqdor, solishtirma og'irlik, tonna, km, т·км, bir т·км narxi, jami), har bir material endi alohida resurs: «Транспортировка <материал> <N> км», birligi т/км, miqdori — т·км. Javob faylidagi tashish qatorlari (masalan «Транспортировка … 63 км») endi smetaga tushadi. «3 % от стоимости материалов» kabi so'mdagi qator resurs emas. Boshqa barcha smetalar avvalgidek o'qiladi. Orqaga qaytish xavfsiz. | `0b71b8dc854982ef1a730f75c988a0fc7f0d4656` |
| **v2.14.3** | **«ПЕРЕВОЗКА» qatori — alohida resurs.** Smetada bir material ikki marta kelsa — «ПЕРЕВОЗКА» bo'limida (uni tashish narxi) va «Строительные материалы» da (materialning o'zi) — dastur ularni bitta resurs deb hisoblab, materialga yozilgan bozor narxini tashish qatoriga ham qo'yardi. Endi tashish bo'limidagi qator «ПЕРЕВОЗКА <материал>» nomli alohida resurs: narxi alohida qo'yiladi. Boshqa smetalar o'qilishi o'zgarmagan. Eslatma: shu tuzatishdan oldin tashish qatoriga qo'yilgan narx (material narxi bilan birga tushgan bo'lsa) endi smeta narxiga qaytadi — tekshirib chiqing. | `881b5182ee30605de1fd196db2a41366cb1a5097` |
| **v2.15.0** | **Ishlar hajmi va resurslar miqdori.** Yangi «Объёмы работ» vkladkasi: smetaning 5-shakl vedomostidagi (01_ЛРВ) ishlar ro'yxati — har biriga loyiha hajmi, «обосновать» belgisi va izoh yoziladi; yangi hajm o'sha ish resurslari miqdorini o'zgartiradi. «Проверка цен» da «Общее кол-во» ustiga bosib resurs miqdorini yozish mumkin. «Наш ответ (Excel)» javobning «объем» varag'ini ham o'qiydi — narxlar va hajmlar birga qo'yiladi. Biror narsa belgilansa, hujjatga «Таблица №1 (объёмы)» varag'i qo'shiladi; narxlar va Таблица №2 o'zgarmaydi. | `ed8d2c2dd4bff235273416e63a50e2ac2c5506da` |
| **v2.16.0** | **Smeta formatlarini tanishni o'rganish, 1-qadam: ma'lumot yig'ish.** Arizaga yuklangan har bir smeta endi format yozuvini qoldiradi (o'qilgani ham, o'qilmagani ham): qanday o'qilgani va nom-narxsiz «format namunasi». Dastur o'qimagan yoki summalari mos kelmagan fayl serverda saqlanadi. Admin sahifasi → «Обучение» → «Распознавание форматов смет»: sonlar, «До обучения модели: N из 100 файлов», fayllar ro'yxati — «Скачать» (dasturchiga yuborish uchun), «Проверить снова» (dastur yangilangach), «Убрать». Fayllarni avvalgidek qoidalar o'qiydi, o'qish o'zgarmagan; 100 ta fayl yig'ilgach model o'qitiladi (keyingi versiyalarda). Reja — docs/format-reja.md. | `0b5162e8aff82604f396c46b9c2f23b9e691ba57` |
| **v2.16.1** | **Kod va arxitektura tekshiruvidan keyingi tuzatishlar (40 ta).** Format yozuvlari: «summalar mos emas» belgisi saqlanadi va v2.16.0 yozuvlarida ham sanaladi; fayl tavsifi o'z worker'ida, 90 soniya chegarasi bilan; «Проверить снова» fayllarni bittadan tekshiradi; saqlangan faylni faqat admin olib tashlaydi; «Стереть» format yozuvlarini ham tozalaydi. Smeta o'qish: № ustuni bo'sh bo'lsa raqam shifr ustunidan; «ПЕРЕВОЗКА» bo'lim sarlavhasi deb olinmaydi; 4А shaklida ma'lumotsiz sarlavha yangi smeta emas; o'chirilgan ustunga formula murojaat qilmaydi (barcha egasining smetalari avvalgidek o'qiladi). «Объёмы работ»: ishlar obyektlar bo'yicha guruhlanadi; qo'lda yozilgan miqdor obyekt chiqarilganda kichikroq smetaga tushmaydi, obyekt qaytsa o'zi qaytadi. Eksport: varaq nomida «&», 31 belgidan uzun nom, \ / * ? : [ ] belgilari, «Смета»/«СМЕТА» — Excel endi xato bermaydi; $ bilan yozilgan qatorlar to'g'ri ko'chadi; bitta qo'shimcha ustun yashirin. O'rganish: ariza boshqa viloyatga ko'chirilsa jurnal va narxlar xotirasi ham ko'chadi; qayta yakunlashda xotira yozuvlari o'z raqamini saqlaydi; «пам.» manbai admin sanog'ida; solishtirma yo'q paytda «принято» belgilari o'chmaydi; vkladka yopilganda oxirgi qarorlar ham yuboriladi. | `51b246b83bd2ea301ba114cfa440d437706e812b` |
| **v2.16.2** | **Smeta o'qishdagi uchta tuzatish (yangi fayllar yuklashdan oldin).** v2.16.1 qoidalari ba'zi varaqlarni v2.16.0 dan yomonroq o'qir edi: o'ngda «№ сертификата» kabi ustuni bor varaqda o'sha ustun № deb olinib, bo'lim va ИТОГО qatorlari yo'qolardi; 4А shaklida nomi bitta katakda yozilgan ikki smeta bittaga qo'shilib ketardi; nomi «ТРАНСПОРТНАЯ …» bilan boshlanadigan sarlavhasiz varaqda birinchi qatorlar «ПЕРЕВОЗКА» deb nomlanardi. Uchalasi tuzatildi; sahifa bo'linishida takrorlangan sarlavha avvalgidek smetani bo'lmaydi; egasining barcha smetalari avvalgidek o'qiladi. | `3eddf7712fd3560b4df16ec6e57e6380b1f8e116` |
| **v2.16.3** | **Eski Excel fayllari (.xls) va tashish varag'i xatolari.** Dastur endi .xls (Excel 97–2003) smeta va tuzatilgan fayllarni ham o'qiydi — oldin «.xlsx qilib saqlang» deyilardi. «МАТЕРЯЛЫ», «ЕД ИЗ», «ТОН/КМ» sarlavhali «перевозка» varag'i ham o'qiladi: har bir material «Транспортировка … км», т/км. Shu varaqdagi ikki xil xatoni sahifa o'zi ko'rsatadi (smeta o'zgartirilmaydi): tonnada o'lchanadigan material uchun solishtirma og'irlik 1 emas (masalan 2 — tonna, т·км va summa ikki baravar); «ВСЕГО» qatorlar yig'indisiga teng emas (masalan ГПС qatori formulaga kirmagan). | `d29197467fe1112ede8f40e2e4286b9979f2bb94` |
| **v2.16.4** | **Uchta yangi arizaning barcha smetalari to'liq o'qiladi.** «Транспортны.» tashish varag'i («Стоимость грузоперевозок», «Объем- ный вес», «Дальность возки км») o'qiladi, og'irlik tekshiruvi unga ham qo'llanadi. «_ЛРС» varag'i ham o'qiladi: ikki qavatli «Сметная стоимость» sarlavhasi (bazis «--», joriy narx bir qator pastda), kod ustunidagi «ИТОГО …» jamilari va nomi kod ustunida turgan «ПЕРЕВОЗКА … ТН/КМ» qatorlari — oldin bu varaqdan hech narsa o'qilmasdi. «Наш ответ» endi arizaning barcha smetalari bilan solishtiriladi (yo'l + yoritish + sug'orish kabi ariza uchun javob bitta jadval). Himoya to'plami 23 faylga yetdi, hammasi to'liq o'qiladi; qolgan hamma narsa avvalgidek. | `41271232cbca7e4d240c81df8e4e36b3460943e9` |
| **v2.16.5** | **Ko'p smetali arizalar va ularning tuzatilgan fayllari.** «Загрузить исправленную смету» endi bir nechta faylni birga oladi (40 tagacha): har bir tuzatilgan fayl o'z smetasiga umumiy qatorlari bo'yicha juftlanadi, tanlash tartibi ahamiyatsiz, bir xil nomli varaqlar («РЕСУРС») almashib ketmaydi; fayllar ish maydonida saqlanadi va qayta yuklashdan keyin qaytadi. Bitta arizaga 80 tagacha fayl sig'adi (avval 30). «ОБЩИЙ ИТОГ» kabi barcha smetalarni qatorma-qator takrorlaydigan fayl o'chiriladi va aytiladi — resurslar ikki marta sanalmaydi. O'qish: т·км ustunisiz «Транспорт» varag'i (т·км = tonna × km) o'qiladi; tashish ИТОГО tekshiruvi «3% от стоимости материалов» qatorini hisobga oladi (noto'g'ri ogohlantirish yo'q); «Перевозка материалов» ostidagi qatorlar mashinalar emas; miqdori bo'sh tashish qatorlari ham ko'rinadi; obyekt nomi «,» bo'lib qolmaydi. Himoya to'plami 49 fayl (7 ta arizaning barcha boshlang'ich smetalari), hammasi to'liq o'qiladi. «Наш ответ» ning «объем» varag'i boshqa obyektga tegishli bo'lsa (ekspert eski javobni shablon qilib qoldirgan), u o'qilmaydi — faqat narxlar olinadi va sahifa buni aytadi. | `25b235f95342d1510244fde068033809eba5e22f` |
| **v2.16.6** | **v2.16.1 bahosida ochiq qolgan xatolar tuzatildi.** Orqaga qaytish: qo'lda yozilgan miqdorlar eski versiya ham o'qiydigan ko'rinishda saqlanadi («[object Object]» chiqmaydi). Smeta jami o'zgargani uchun qo'llanmay turgan miqdor endi jadvalda «⏸» bilan ko'rinadi va oynada qayta taklif qilinadi; o'zgarishsiz «10 → 10» qatori Таблица №1 ga tushmaydi. Vkladka yopilganda barcha kutib turgan qarorlar yuboriladi (avval 2–16 tasi). Hujjatga kirmagan ustunga bog'liq formula sanaladi va aytiladi. «ТРАНСПОРТНЫЕ СРЕДСТВА / МАШИНЫ» bo'limlari tashish deb olinmaydi, «ТРАНСПОРТИРОВКА (ОБОРУДОВАНИЕ)» va nom ustunidagi «ПЕРЕВОЗКА» esa tashish. Eski ma'lumot server ishga tushganda bir marta tuzatiladi: eski viloyatda qolgan jurnal va xotira, eski xotira raqamlari va ularga havolalar; yangilangan «shubhali» format yozuviga fayli qo'shiladi. «Принято» belgilari tashqi «Было» fayli yoki ko'p smetali arizaning bitta smetasini solishtirganda boshqalarniki o'chmaydi. Himoya to'plamidagi 49 fayl avvalgidek o'qiladi. | `78f60ddec1026918ba646017365f8f5cd96a097a` |
| **v2.16.7** | **v2.16.1 bahosidan qolgan yettita mayda kamchilik.** Hujjatga kirmagan ustunni o'qiydigan formula endi tirik qoladi, agar o'sha katakda oddiy son yoki jadval ustunlaridan tuzilgan bir qadamli formula bo'lsa (masalan =G40*B45 → =G40*0.05, bozor summasidan qayta hisoblanadi); v2.16.6 dagi «формул, которые ссылаются на столбец…» ogohlantirishi tashish varag'i bor har bir faylda noto'g'ri chiqardi — endi faqat hujjatda haqiqatan qotib qolgan qiymatlar sanaladi (egasining 49 faylida — 0). Таблица №1: bir xil nomli ikki smeta ishlari har biri o'z sarlavhasi ostida. Javobdagi «объем»: ikki smetada bir xil ish bo'lsa, «Было» deb tanlangan smetaga tushadi. Formatlar: fayl tavsif uchun ikkinchi marta o'qilmaydi; ochilmagan yoki o'quvchi to'xtatgan fayl darhol saqlanadi; o'qilmagan fayl qayta yuklansa «уже сохранён» deyiladi; «файл сохранён» xabari xato ko'rinishida emas; admin sahifasida tekshiruv ketayotganda «Скачать» ishlaydi, qolgan tugmalar kutishini aytadi. | `4ba0ac0bc285d14ceef79c573ad0c6c569ec0058` |
| **v2.16.8** | **Yangilanish kanali yuklab olganini tekshiradi; Mac ishga tushirgichi nosozlikda (4-tekshiruv: C1 ning qisqa choralari, G2).** Windows ishga tushirgichi va o'rnatuvchi ro'yxatdan faqat to'liq 40 belgili commit xeshini reliz deb oladi (qisqasi — reliz emas); ro'yxat shoxdan o'qilmasa `HEAD` dan o'qiladi — shox qayta nomlansa, yangilanish jimgina to'xtab qolmaydi. PocketBase arxivi ochilishidan oldin sha256 bilan tekshiriladi (`laptop.ps1`: Windows ikki arxivi; `get-pocketbase.sh`: Mac, Linux, Windows): summalar PocketBase e'lon qilgan `checksums.txt` dan, beshtasi yuklab olingan arxivning o'zi bilan solishtirildi; mos kelmagan arxiv o'chiriladi va hech narsa ochilmaydi, summasi noma'lum versiya rad etiladi. Mac (`laptop.sh`): `start` ostida qulagan server o'zi qayta ko'tariladi (10 daqiqada 3 martadan ko'p qulasa — to'xtab, jurnal oxirini ko'rsatadi); oldingi ishga tushishning jurnali `serve.log.1` da qoladi; port boshqa dastur qo'lida bo'lsa «port band» deydi — «parol mos kelmayapti» emas; to'xtatish server haqiqatan to'xtaguncha kutadi. Dastur sahifasi, o'quvchi va hujjat o'zgarmagan. Yangi testlar: `test/update-channel.cjs` (pwsh bor joyda `laptop.ps1` dagi funksiyaning o'zi PowerShell ostida ishlatiladi), `test/laptop-faults.sh`. To'liq reja (imzolangan ro'yxat, ZIP xeshi) egasining kalitini kutadi. | `0cc72e20946c8d7d0f729df0373bee6b8949fbaf` |
| **v2.16.9** | **Ikkita ortiqcha qizil xabar.** Tashish varag'idagi «На остальные материалы 3% от стоимости материалов» qatori smetaning «ИТОГО» si ichida ham, tashqarisida ham bo'lishi mumkin — ikkalasi ham smetaning o'z usuli (egasining tuzatilgan faylida u tashqarida qoldirilgan), dastur o'qigan materiallar ikkala holda ham smeta hisoblagani bilan bir xil; endi bu «Ошибки в расчёте перевозки» deb aytilmaydi. Haqiqiy xatolar avvalgidek aytiladi: tonnadagi material uchun solishtirma og'irlik 1 emas, «ВСЕГО» ga material qatori kirmay qolgan (3 % qatori ichida bo'lsa ham, tashqarida bo'lsa ham), yoki «ИТОГО» hech qaysi yig'indiga teng emas. Egasining fayllarida bitta noto'g'ri ogohlantirish yo'qoldi (bir varaq, ikki faylda), ikkita haqiqiysi qoldi. «… повторяет строки смет … сводный файл выключен» endi qizil xato emas, «×» li oddiy xabar: hech narsa buzilmagan, dastur resurslar ikki marta sanalishining oldini olgan. | `300e4d703961df4f804a8afb4423b96f2cb311ff` |
| **v2.16.10** | **Mac'dagi bazani Windows'ga ko'chirish: `laptop.cmd restore`.** Shu paytgacha bazani zaxiradan faqat Mac tiklay olardi; endi Windows ishga tushirgichida ham xuddi shu buyruq bor. `laptop.cmd restore` ko'rinadigan zaxiralarni ko'rsatadi (shu kompyuterniki, Google Drive'dagi o'zinikiga va Mac'ning «Smeta zaxira (Mac)» papkasi, «Загрузки»); `laptop.cmd restore <fayl.zip>` faylni avval tekshiradi (ichida dastur bazasi bo'lishi, papkadan tashqariga yo'l yo'qligi), tasdiq so'raydi, so'ng serverni to'xtatib, hozirgi bazani o'chirmay chetga oladi, nusxani ochadi va dasturni odatdagidek ishga tushiradi — hisob va parol Windows'niki bo'lib qoladi, nusxa qaysi kompyuterdan kelgan bo'lsa ham; nima qaytgani (arizalar, narx xotirasi, narx tuzatishlari) son bilan aytiladi. Nusxa bilan dastur ishga tushmasa — avvalgi baza joyiga qaytariladi. Versiyalar orasidagi kelishuv o'zgarmagan (bitta buyruq, bitta argument). Dastur sahifasi va o'quvchi o'zgarmagan. | `6e9c2ddda0c25db42882b12c75594119ac8271ab` |
| **v2.16.11** | **Yangi smeta turlari, yangi javob jadvallari va ish maydoni bo'shab qolishi.** O'quvchi: kod ustuni bor varaqda raqamsiz, lekin resursdek narxlangan qator (birlik pul emas, kol-vo × narx = summa, yig'ma qator nomi emas) — resurs: smeta tuzuvchi band oxiriga qo'lda qo'shgan qatorlar bandning «ИТОГО» siga kiradi, lekin o'qilmay qolardi. «ЛОКАЛЬНО-РЕСУРСНАЯ ВЕДОМОСТЬ» (har ish ostida o'z resurslari, «Количество» ikki ustun: «на единицу измерения» va «по проектным данным»): miqdor endi loyihaviy ustundan olinadi — avval birlikka miqdor olinardi va resurslar summasi smeta jamidan ancha kichik chiqardi; ish qatorlari (shifr, «1000 М3») resurs emas. «N п/п» — raqam ustuni, oraliqda kod ustuni bo'lsa ham: bandlar (mehnat, mashina, material) shu ustunda ko'rinadi, avval barcha qatorlar bandsiz qolardi. «Расчёт стоимости перевозки» varag'i (потребность × вес × км, narx «на тн/км», summa «Общая цена») tashish xarajati sifatida o'qiladi; yonida «Стоимость мат-ов без перевозки» ustuni bor varaq esa o'qilmaydi — u tashishni material narxiga qo'shadi, resurs varag'i o'sha narxni allaqachon olgan, o'qilsa tashish ikki marta sanalardi. «Наш ответ»: narxsiz, faqat izohli qator («-», «обоснов», bo'sh narx va izoh) so'ralgan, narxsiz qator bo'ladi; «МАШ-ЧАС»/«ЧЕЛ-ЧАС» = «маш.-ч»/«чел.-ч»; «%» qatori resurs emas; boshqacha yozilgan nom «Цены по ПСД» smeta narxiga teng bo'lsagina topiladi. Ish maydoni: fayllar ochilishda olinmasa (tarmoq bir zum uzilsa yoki sahifa fayllar kelayotganda qayta yuklansa — bitta ariza ikkinchi vkladkada ochilganda shunday bo'lardi), keyingi saqlash fayllarni va loyihalarni serverdan o'chirib yuborardi; endi ular arizada qoladi, sahifa «обновите страницу» deydi. Egasining to'rtta yangi arizasida va bitta alohida smetada har bir varaq smetaning o'z jamiga teng; avvalgi fayllar avvalgidek o'qiladi. | `81f0e4634c65a88dd04a8b786864b9b93ff0beb9` |
| **v2.16.12** | **v2.16.11 tekshiruvidagi 15 topilma tuzatildi, yangi smeta turlari o'qiladi.** Ish maydoni: ariza ochilganda ekranga chiqmagan smeta (fayli yuklanmagan yoki yuklangan-u o'qilmagan) endi arizada qoladi — saqlash uning faylini serverdan o'chirmaydi va loyihasini o'z joyida qoldiradi (avval yuklangan, lekin o'qilmagan smeta keyingi saqlashda serverdan o'chirilardi). Har bir fayl alohida olinadi — bitta olinmagan fayl qolgan smetalarni yashirmaydi. Loyihalar ro'yxati ustidagi qator har bir shunday smetani sababi bilan ko'rsatadi, belgi «!» bo'ladi, «Скачать Excel» va «✓ Завершить» avval so'raydi, smetani arizadan chiqarish («Убрать из заявки») — faqat odamning qarori. Sahifadan ketish to'xtatilsa, ochilish osilib qolmaydi; shu nomli fayl qayta qo'shilsa, eski saqlangan fayl yetim qolmaydi; loyihalar tartibi o'zgarmaydi. O'quvchi: lokal-resurs vedomostida normasi yozilmagan (bo'sh, «-», so'z) material ish ostida raqamlangan va resursdek narxlangan bo'lsa — resurs; «Количество» ning ikki ustuni sarlavha qatorida «Цена» va «Сумма» yozilgan bo'lsa ham topiladi. Tashish varag'i: o'ngdagi «Всего» yana summa (faqat «Общая цена» yonida emas); material narxiga tashishni qo'shadigan hisob varag'i sarlavhasi qanday yozilganidan qat'i nazar arifmetikasi bo'yicha taniladi va o'qilmaydi; «Расст-е на перев-у» (temir yo'l) avtomobil masofasi emas. Qo'lda qo'shilgan «сўм», «тыс.сум», «so'm», «руб» birligidagi qator — pul qatori, resurs emas. Javob jadvali: «ПСД» so'zi bor har qanday sarlavha endi narx ustuni deb olinmaydi («Наименование … по ПСД» — nom); izohsiz yolg'iz «-» — so'ralgan, narxsiz qator; boshqacha yozilgan nom jadvalning o'z narxi bilan kamida 0,9 o'xshashlikda, «Цены по ПСД» bilan kamida 0,8 da topiladi va bir xil yaqin ikki nomdan biriga qo'yilmaydi. Yangi fayllar: kitobda ochiq turgan yig'ma «Ресурс» varag'i (har qatori obyekt varaqlaridagi miqdorlar yig'indisi) endi o'qilmaydi va sahifa buni aytadi — avval u alohida obyekt bo'lib o'qilar, resurslar ikki marta sanalar, «Сравнение версий» esa uning har qatorini yangi qator deb ko'rsatardi; «Перевозка материалов - 5 % от стоимости» qatori (narxi 0,05) birligi «тн/км» deb yozilgan bo'lsa ham pul qatori, resurs emas; javob jadvalidagi «Асфальт - 11 км» kabi tashish qatorlari smetadagi «Перевозка …» qatorlariga bog'lanadi (avval «не найдено» edi). | `9f124dffaad8da3346b428044b118a860b23abbd` |
| **v2.16.13** | **«Наш ответ» PDF dan ham o'qiladi; 64453 smetalari to'liq o'qiladi.** Biz yuborgan TAQQOSLASH JADVALI №2 endi PDF ko'rinishida ham beriladi (tugma «Наш ответ (Excel/PDF)», «Книга цен» ham qabul qiladi): Excel'dan yoki «Microsoft: Print To PDF» bilan chop etilgan PDF da har bir harf sahifadagi o'rniga qo'yiladi, qatorlar va ustunlar jadvalning o'z chiziqlaridan olinadi — natija Excel javob bilan bir xil (nom, birlik, smeta narxi, bozor narxi, izoh), narxlar loyihaga qo'yiladi va tuzatilgan smeta shu javob bilan solishtiriladi. Birlashtirilgan kataklar, bir necha qatorga bo'lingan nomlar va defisdan keyin bo'lingan so'zlar («ПМ-100А») to'g'ri o'qiladi. Server ish maydoni PDF javobni saqlaydi va qayta ochilganda qaytaradi. Skan (rasm) va parolli PDF aniq xabar bilan rad etiladi; smeta o'rniga PDF tashlansa sahifa uni qayerga yuklashni aytadi. O'quvchi: 5 ta eski .xls (ichida tasodifan zip arxivi baytlari bor) «нет описания книги» deb rad etilardi — fayl turi endi birinchi baytlaridan aniqlanadi; shakli bo'yicha o'qilgan varaqda «1 2 3 4 5 6» qatori hujjatda 321.xlsx dagidek moviy raqamlash qatori (avval smeta qatori bo'lib tushardi); narxsiz pul qatorlari («ТРАНСПОРТНЫЕ РАСХОДЫ … СУМ») va «ВОЗВРАТ МАТЕРИАЛОВ» bandi ostidagi qatorlar resurs emas; «Ресурс» yig'ma varag'i bir necha qatori tuzatilgan bo'lsa ham va 16 tadan ko'p obyektli kitobda ham aniqlanadi. Boshqa smetalar o'qilishi o'zgarmadi; narxlar va takliflar o'zgarmadi. Orqaga qaytish xavfsiz: eski versiya PDF javobni o'qiy olmasligini aytadi, qolgani avvalgidek. | `f7bfca95dc6f55f61978d2d00190983d938e305d` |
| **v2.16.14** | **PDF javobdagi narx matni; 63920 arizasi.** Windows «Microsoft: Print To PDF» bilan chop etilgan javobda Excel sonni katakning o'ng chetiga surish uchun qo'ygan bo'sh joylarning oxirgisi raqam ichiga tushib qolardi («121 744,00» o'rniga «1 21 744,00»); endi so'zlar orasidagi bo'sh joy harflar orasidagi masofadan aniqlanadi. Narxlar avval ham to'g'ri son bo'lib o'qilgan — endi matn ham PDF dagidek. 63920 arizasi (2 ta .xls smeta va PDF javob) to'liq o'qiladi: 19 qatorning 19 tasi smetada topiladi. Qolgani v2.16.13 dagidek; orqaga qaytish xavfsiz. | `fd12ccbef2ffe615e0e922cf97bdfe235d047dc5` |
| **v2.16.15** | **Narx katagiga yozish tuzatildi.** «Рыночная цена» katagiga narx raqamma-raqam yozilganda dastur har raqamdan keyin ro'yxatni qayta chizar va katakni bo'sh joyli formatda («2 071») qayta yozar edi — kursor bir joyga siljib, keyingi raqamlar noto'g'ri joyga tushardi: «207 187» o'rniga «207 871» yoki «201 781» bo'lib qolardi, tozalangan katak esa o'zi smeta narxi bilan to'lib qolardi. Endi yozilayotgan katakda aynan yozilgani va kursor joyi qoladi («Проверка цен» va «Сводная таблица»); katakdan chiqilganda narx avvalgidek guruhlangan raqamlar bilan ko'rinadi. Esc, «Применить», xotira va birja narxlari avvalgidek ishlaydi. Boshqa hech narsa o'zgarmadi; orqaga qaytish xavfsiz. | `ddebb0ed67f16def15bd4e9abec1b937a63ee43c` |
| **v2.16.16** | **Tashish narxlari xotirada masofa oralig'i bo'yicha.** «Перевозка …» qatorlari (birligi т·км) endi nomi bo'yicha emas, masofa oralig'i bo'yicha topiladi: 1–10 km, 11–50 km, 51 km va undan yuqori (egasining qarori). Avval «Перевозка ГПС км 20», «Перевозка Гравийно-песчаная смесь - 20 км» va «Перевозка Щебень - 5 км» har xil yozilgani uchun bir arizada qo'yilgan tashish narxi keyingisida taklif qilinmas edi. Endi «пам.» shu oraliqdagi avvalgi tashish narxlarini ko'rsatadi: avval xuddi shu yuk (ГПС = гравийно-песчаная смесь, а-б = асфальт), keyin boshqalari, har birining yonida qaysi qator uchun qo'yilgani. Narx faqat «Применить» bilan qo'yiladi. Materiallar, «Доставка» va tonna birligidagi qatorlar avvalgidek nom bo'yicha. Narx katagiga yozishdagi tuzatish (v2.16.15) ham shu versiyada. Orqaga qaytish xavfsiz. | `7bc7f1b391bbe73bf07b5d381ba08d49b76abfd7` |

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
