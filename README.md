# O'zgargan fayllar — Telegram ikonka (o'qituvchilar) + Kandidatlar ro'yxatini o'chirish

Bu arxivda faqat o'zgartirilgan fayllar bor. Har birini loyihangizdagi
xuddi shu yo'ldagi faylning o'rniga almashtiring:

- innovateit-backend/src/routes/telegram.js
- innovateit-frontend/index.html
- innovateit-frontend/css/style.css
- innovateit-frontend/js/app.js
- innovateit-frontend/js/api.js
- innovateit-frontend/js/sales-admin.js

## Nima o'zgardi

1. Superadmin panelidagi "O'qituvchilar" tabida (index.html) endi
   o'quvchilar ro'yxatidagidek Telegram bog'lanish belgisi ko'rinadi.

2. "Botga /start yozganlar ro'yxatidan tanlash" (barcha 5 joyda:
   o'quvchi, admin, buxgalter, o'qituvchi, sales tahrirlash oynalari)
   endi custom dropdown — har bir yozuv o'ng chetida qizil ✕ tugma bilan,
   bosilganda tasdiqlash so'rovi chiqadi va backend orqali o'chiriladi
   (yangi DELETE /api/telegram/kandidatlar/:telegramId endpoint).
