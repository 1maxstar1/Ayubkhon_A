# Repo'ni yopiq (private) qilish rejasi

**Holati:** saqlab qo'yilgan, bajarilmagan (egasining so'rovi, 2026-11-20 — «save this for later»).

## Nega oldindan tayyorlash kerak

Windows ishga tushirgichi (`server/laptop.ps1`) yangilanishni **parolsiz** oladi: relizlar ro'yxati
`raw.githubusercontent.com/…/server/releases.txt` dan, versiya arxivi `github.com/…/archive/<hash>.zip` dan
(`$Repo`, `$ReleaseList`, `$ReleaseListAlt`, `Invoke-WebRequest`). O'rnatuvchi `install-windows.ps1` ham shunday.
Repo yopilsa, ikkalasi ham 404 qaytaradi: noutbuk buzilmaydi, hozirgi versiyada qoladi, lekin yangisini ololmaydi.
Mac `laptop.sh update` — `git pull`, unga GitHub'ga kirish (`gh auth login` yoki kalit) kerak bo'ladi.

## Tartib

1. **(Claude, repo hali ochiq paytda)** Windows yangilagichiga GitHub kaliti (token) qo'llab-quvvatlashi:
   kalit `%LOCALAPPDATA%\Taqqoslash` da (repoda emas), bor bo'lsa ro'yxat va arxiv GitHub API orqali
   (`api.github.com/repos/…/contents/server/releases.txt` raw, `…/zipball/<hash>`) `Authorization` sarlavhasi bilan;
   bo'lmasa — avvalgidek parolsiz. Yangi buyruq `laptop.cmd token` (kalitni so'raydi va saqlaydi); `status` kalit
   bor-yo'qligini va muddati tugashiga qolgan kunni aytadi. Versiyalar orasidagi kelishuv (`laptop.ps1` boshidagi
   ro'yxat) o'zgarmaydi. Test: `test/laptop-windows.sh` (soxta sayt bilan, kalit bilan va kalitsiz). Reliz → darhol
   Windows ro'yxati → **noutbuk uni repo hali ochiq paytda o'rnatib olishi shart**.
2. **(Egasi)** GitHub → Settings → Developer settings → Fine-grained tokens: faqat `Ayubkhon_A`, Contents: Read-only,
   muddati masalan 1 yil. Kalit hech qachon chatga yoki repoga yozilmaydi.
3. **(Egasi, Windows)** `C:\Smeta\server\laptop.cmd token` → kalitni kiritish; `laptop.cmd update`, `status` tekshiradi.
4. **(Egasi)** Repo → Settings → General → Danger Zone → Change visibility → Private.
5. **(Egasi, Mac)** `gh auth login` (yoki git'ga shunday kalit); `sh server/laptop.sh update` ishlaydi.

## Bilib qo'yish kerak

* Claude sessiyalari GitHub ilovasi orqali ishlashda davom etadi.
* Yopiq repo'da GitHub Actions bepul daqiqasi oyiga 2000; to'plam ~25 daqiqa. Yetmasa — CI faqat reliz commit'larida.
* Yangi kompyuterga o'rnatish: kalit + o'rnatuvchi (ikki qator) — 1-qadam bilan birga tayyorlanadi.
* Kalit muddati tugasa yangilanish to'xtaydi (dastur ishlayveradi) — `status` oldindan ogohlantiradi.
* Ma'lumotlar xavfsizligi o'zgarmaydi: haqiqiy smeta, narx va baza repoda hozir ham yo'q (`test/refs-privacy.cjs`).
* Reliz fayllari uchun alohida ochiq repo — tavsiya qilinmaydi: dasturning o'zini baribir ochib qo'yadi.
