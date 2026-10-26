# Справочник цен — paket formati `smeta-refs` (1-versiya)

Ma'lumotnoma narxlari («Справочные цены») — narx hujjatlaridan (ekspertiza xulosalari, birja kotirovkalari,
prays-listlar, zavod kalkulyatsiyalari, ish haqi jadvallari) olingan narxlar paketi. Administrator uni
`admin.html` dagi «Справочник цен (документы)» bo'limida yuklaydi; ekspert «Цены» oynasida har bir resurs yonida
«справ.» tegini ko'radi. Qanday ishlatilishi — README, «Справочные цены» bo'limi. Bu hujjat — faylning o'zi haqida.

**Paketda egasining ma'lumoti bor: u hech qachon repozitoriyga qo'shilmaydi.** Paket repozitoriydan tashqarida
yasaladi (yopiq to'plam — `KIT`, egasining kompyuterida), serverda `pb_data/storage` ichida turadi.
Quyidagi misol — test uchun to'qilgan paket (`test/refs-fixture.cjs`): nomlar, narxlar va hujjatlar soxta.

## Fayl

Bitta JSON obyekt, UTF-8, gzip bilan siqilgan (`.json.gz`). Misol `node test/refs-fixture.cjs --doc-example`
buyrug'i bilan yasaladi (qo'lda yozilmaydi; `test/refs.cjs` ikkalasi bir xilligini tekshiradi):

<!-- doc-example:start -->
```json
{
  "format": "smeta-refs",
  "version": 1,
  "full": true,
  "package_id": "fake-20260101-1",
  "created": "2026-01-01T00:00:00Z",
  "tool": "test/refs-fixture.cjs",
  "rid_min": 1,
  "rid_max": 16,
  "counts": {
    "records": 16,
    "sources": 6
  },
  "date_min": "2025-03-14",
  "date_max": "2026-02-27",
  "sources": [
    { "id": "fake-src-0001", "doc_type": "supplier-offer", "issuer": "ООО «Тест-Поставщик-1»", "customer": null, "doc_no": "ТЕСТ-1", "issue_date": "2025-03-14", "as_of_date": null, "region": "xorazm", "ships_nationally": false, "vat_default": false, "method": "fixture"
    }
  ],
  "fields": [
    "rid",
    "name",
    "name_raw",
    "unit",
    "unit_raw",
    "section",
    "price",
    "price_date",
    "avail",
    "avail_src",
    "region",
    "src",
    "group",
    "basis",
    "delivery",
    "plant",
    "code",
    "flags",
    "attrs"
  ],
  "rows": [
    [ 1, "Кабель ВВГ 3х2,5", null, "км", "км", "materials", 123456780, "2025-03-14", null, null, "xorazm", "fake-src-0001", "cables", "offer" ]
  ]
}
```
<!-- doc-example:end -->

## Bosh qism

| maydon | qoida |
|---|---|
| `format`, `version` | `"smeta-refs"`, `1`. Boshqa versiya — «обновите программу» xatosi |
| `full` | `true` (qisman paket yo'q: har bir paket — to'liq nusxa) |
| `package_id` | `^[a-z0-9][a-z0-9._-]{2,63}$`, masalan `refs-YYYYMMDD-1`; serverda takrorlanmaydi |
| `created`, `tool` | yaratilgan vaqt va dastur (ma'lumot uchun) |
| `rid_min`, `rid_max` | barcha `rid` shu oraliqda |
| `counts` | `records` = qatorlar soni, `sources` = hujjatlar soni |
| `date_min`, `date_max` | narx sanalari oralig'i, `YYYY-MM-DD` |
| `sources` | hujjatlar ro'yxati (pastda) |
| `fields` | aynan shu 19 ta nom, shu tartibda |
| `rows` | qatorlar: har biri `fields` tartibidagi massiv; oxiridagi `null` lar tushirib qoldirilishi mumkin |

## Hujjat (`sources[]`)

| maydon | qoida |
|---|---|
| `id` | hujjat kodi: 4–40 belgi `a-z 0-9 _ -`, birinchisi harf yoki raqam, `__` yo'q; paket ichida takrorlanmaydi |
| `doc_type` | hujjat turi (`expert-conclusion`, `exchange-quotes`, `supplier-offer`, `wage-table` …); ekranda ruscha nomi |
| `issuer`, `customer`, `doc_no` | kim chiqargan, kimga, raqami — matn ≤ 300 belgi. Ekranda qavs ichidagi izohlar va kichik lotin harfli inglizcha izohlar («not stated …») ko'rsatilmaydi; yaxshisi ularni paketga yozmaslik |
| `issue_date`, `as_of_date` | `YYYY-MM-DD` yoki `null` |
| `region` | dasturning 15 viloyat kalitidan biri, `national` (butun respublika) yoki `null` |
| `ships_nationally`, `vat_default`, `method` | ma'lumot uchun |

## Qator (`rows[]`)

| maydon | qoida |
|---|---|
| `rid` | butun son ≥ 0, qat'iy o'sib boradi, `[rid_min, rid_max]` ichida. Tuzatish yozuvida (`corrections.source`) shu raqam turadi |
| `name`, `name_raw` | yozuv nomi (≤ 1 000 belgi); `name_raw` — farq qilsa, asl yozilishi |
| `unit`, `unit_raw` | o'lchov birligi: normallashtirilgan va hujjatdagi asl ko'rinishi |
| `section` | `labor` `machines` `materials` `equipment` `transport` |
| `price` | 0 < narx < 10¹³, so'm, **QQS siz**, `unit` uchun |
| `price_date` | narx sanasi `YYYY-MM-DD` |
| `avail`, `avail_src` | narx qachondan ma'lum bo'lgani (masalan, birja byulleteni chiqqan hafta oxiri) va qaysi hujjatdan; `avail` ≥ `price_date`; `avail_src` — `sources` dagi kod |
| `region` | viloyat kaliti, `national` yoki `null` |
| `src` | `sources` dagi hujjat kodi (bo'lmagan kod — xato) |
| `group`, `basis` | guruh (≤ 40 belgi) va narx asosi: `catalogue` `exchange-spot` `exchange-forward` `list` `recommended` `wage-12%` `offer` `declared` `designer-memory` `plant-calc` `protocol` `invoice` |
| `delivery`, `plant`, `code` | matn ≤ 300 belgi yoki `null` |
| `flags` | `null` yoki dastur o'qiydigan bayroqlar: `forward` `vat_inferred` `non_construction` `merge:excludes_pipe_cost` `merge:checker_dup_of_forward_trade` |
| `attrs` | `null` yoki faqat dastur o'qiydigan kalitlar (`S.refs.pkg.ATTRS_READ`: massa, uzunlik, zichlik, qadoq …), qiymati son / ha-yo'q / ≤ 40 belgili matn |

## Chegaralar va tekshiruv

* Siqilgan fayl ≤ 50 MB, ochilgani ≤ 500 MB, qatorlar ≤ 2 mln, hujjatlar ≤ 10 ming (`S.refs.pkg.LIMITS`).
* Tekshiruv (`src/lib/refs/package.js`) uch joyda bir xil ishlaydi: administrator sahifasida (yuklashdan oldin,
  brauzerning o'zida), har bir ekspertning brauzerida (ishlatishdan oldin) va testlarda. Xato xabari qator
  raqami va maydon nomini aytadi, paketdagi qiymatni hech qachon ko'rsatmaydi.
* Bosh qismida xato bo'lgan paket umuman ishlatilmaydi; ayrim qatori noto'g'ri bo'lsa, o'sha qatorlar tashlab
  ketiladi.
* Server faylni ochmaydi: u faqat bosh qismini (manifest) va sha256 ni tekshiradi, bir xil paketni ikkinchi marta
  qabul qilmaydi, yuklangan paketni o'zgartirishga ruxsat bermaydi. sha256 ni administrator sahifasi hisoblaydi;
  ekspertning brauzeri yuklab olgan faylning sha256 ini o'zi qayta hisoblaydi va mos kelmasa paketni rad etadi.
* Ekspert brauzeri paketdan hosil qilgan pulni (pool) IndexedDB da (`smeta-refs`) saqlaydi: kalit — dastur
  kodining shtampi, paket yozuvi va sha256. Yangi paket yoki kalitlarni hisoblaydigan kodi o'zgargan reliz uni
  o'zi qayta hosil qiladi. «Выйти» bosilganda o'chiriladi.

## Narx qayerdan kelgani (`corrections.source`)

«Применить» bosilganda tuzatish yozuvi narx qayerdan kelganini saqlaydi; server faqat shu shakllarni qabul qiladi,
qolganini `typed` deb yozadi:

| qiymat | ma'nosi |
|---|---|
| `typed` | ekspert o'zi yozgan (yoki foiz, narxlar kitobi, Escape dan keyin qayta yozilgan) |
| `hint:<id>` | boshqa loyihadagi eslatmadan qo'llangan; `<id>` — mavjud tuzatish yozuvi |
| `ref:<package_id>:<rid>` | paketning bitta qatoridan; paket serverda bo'lishi shart |
| `ref:<package_id>:median:<rid>,<rid>…` | bir necha hujjat medianasidan (200 belgidan uzun ro'yxat `…` bilan kesiladi) |

`source_price` — o'sha paytda qo'llangan narx; boshqa ekspertlarning eslatmasida «из справочника» belgisi faqat
`market_price` hali shu narxga teng bo'lsa chiqadi. Bu belgi — sahifaning bitta bosish haqidagi da'vosi, isbot emas.

## Yangi versiya

Formatni o'zgartirish — yangi `version` raqami va dastur yangilanishi: eski dastur yangi paketni «Версия пакета N
не поддерживается этой версией программы — обновите программу» deb rad etadi. Dvigatel (`src/lib/refs`)
jadvallari faqat o'lchov bilan o'zgaradi (`REFS_KIT=… node test/refs-parity.cjs`); o'lchovsiz o'zgarishni
`test/all.sh` «NOT MEASURED» deb ko'rsatadi.
