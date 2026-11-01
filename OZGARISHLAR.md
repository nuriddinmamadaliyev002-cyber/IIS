# Online kurslar (sertifikat moduli) — o'zgarishlar

Barcha fayllar loyiha ildizidagi yo'llar bilan joylangan: shu papkani repo ustiga ko'chiring (mavjud fayllar almashadi).

## Yangi fayllar
- innovateit-backend/migrations/032_online_kurslar.sql — yangi jadvallar (schema_setup.sql ichida ham bor)
- innovateit-backend/src/routes/kurslar.js — superadmin / kurs admin / ishtirokchi API
- innovateit-backend/src/routes/sertifikat_public.js — ochiq tekshiruv: GET /api/sertifikat/tekshir/:kod
- innovateit-backend/src/sertifikatPdf.js — PDF + QR generatsiya
- innovateit-backend/src/telegramVerify.js — Telegram initData imzosini tekshirish
- innovateit-backend/assets/ — sertifikat fon rasmi va shriftlar
- innovateit-frontend/kurs-admin.html, js/kurs-admin.js — kurs admini paneli
- innovateit-frontend/kurs.html, js/kurs.js — ishtirokchi (ma'lumot, test, sertifikat)
- innovateit-frontend/js/kurs-common.js, css/kurs.css — umumiy
- innovateit-frontend/js/kurslar-super.js — superadmin "Online kurslar" tabi
- innovateit-blog-frontend/sertifikat.html, js/sertifikat.js — QR olib keladigan tekshiruv sahifasi

## O'zgargan fayllar
- backend: src/index.js, src/routes/auth.js, src/routes/telegram.js, innovateit_schema_setup.sql, package.json (+pdfkit, qrcode), package-lock.json, .env.example, DEPLOY.md
- frontend: index.html (tab tugmasi + skript), js/app.js (switchTab)
- blog: barcha sahifalar menyusiga "Sertifikatlar" havolasi (post.html'dan tashqari)
- telegram-bot/miniapp/app.js — imzolangan kirish, kurs kodi ekrani, yangi rollar

## Serverda qilish kerak
1. `innovateit-backend/.env` ga qo'shing:
   - `TELEGRAM_BOT_TOKEN=` (bot tokeni — telegram-bot/.env dagi bilan bir xil). **Busiz kurs admini/ishtirokchisi kira olmaydi.**
   - `CERT_VERIFY_BASE=https://innovateitschool.uz`
2. `bash deploy.sh` (npm install, sxema, pm2 restart).
3. Superadmin panelida: "🎓 Online kurslar" → yangi kurs → admin qo'shish → taklif matnini adminga yuboring.

## Oqim
Superadmin kurs + admin yaratadi → admin Telegram Mini App'da kodni kiritadi → panelda sozlamalar (o'tish bali, urinishlar, savollar soni, vaqt, direktor F.I.Sh.), savollar, ishtirokchilar → ishtirokchi o'z kodi bilan kiradi, F.I.Sh./maktabni tasdiqlaydi, testni topshiradi → o'tsa sertifikat (IIS-YYYY-NNNNNN) avtomatik, PDF'da QR → QR innovateitschool.uz/sertifikat.html?k=KOD ga olib boradi.

## Eslatmalar
- Sertifikat PDF diskka saqlanmaydi, har safar bazadan yasaladi.
- Fon rasmi hozirgi 1537×1023; bosib chiqarish uchun yuqori sifatli (xuddi shu nisbatli) rasmni assets/sertifikat-fon.png nomi bilan qo'ying.
- Eski GET /api/telegram/check/:id yo'li boshqa rollar uchun o'zgarishsiz qoldi (imzosiz). Kurs rollari FAQAT imzolangan POST /api/telegram/kirish orqali. Mini App'ni yangilab, TELEGRAM_BOT_TOKEN sozlangach, eski yo'lni butunlay o'chirish tavsiya etiladi.
