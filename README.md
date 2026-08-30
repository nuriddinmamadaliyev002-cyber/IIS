# Vazifalar moduli — 3-bosqich (O'qituvchi paneli frontend)

Bu arxivda faqat o'zgartirilgan fayllar bor:

- `innovateit-frontend/oqituvchi.html` — yangilangan
- `innovateit-frontend/js/oqituvchi.js` — yangilangan
- `innovateit-frontend/js/api.js` — yangilangan

## Nima qo'shildi

### 1) Mavzu va uyga vazifa yozish
`Guruhlarim → [guruh tanlash] → Davomat` ekraniga, davomat ro'yxati ostiga
**"📘 Mavzu va uyga vazifa"** bloki qo'shildi. Bu blok xuddi davomat kabi
tanlangan **guruh + sana** bo'yicha ishlaydi — sana o'zgarganda (‹ › tugmalar
yoki kalendar orqali) mavzu/vazifa maydonlari ham avtomatik shu kunga mos
qayta yuklanadi. "💾 Mavzu va vazifani saqlash" tugmasi bilan alohida
saqlanadi (davomatdan mustaqil).

### 2) Vazifalarni tekshirish (yangi tab)
Tab navigatsiyasiga **"📝 Vazifalarni tekshirish"** qo'shildi. Bu yerda:
- **⏳ Yangi** — hali baholanmagan javoblar (standart ko'rinish)
- **✅ Baholangan** — baholab bo'lingan javoblar
- **📋 Hammasi** — barchasi

Har bir yozuvda: o'quvchi ismi+sinfi, fan, sana, mavzu, uyga vazifa matni,
o'quvchining javobi (matn + fayl havolasi), va hali baholanmagan bo'lsa —
**baho (1–5) + izoh** kiritib "Baholash" tugmasi bosiladi.

## Deploy

Statik frontend fayllar — serverga oddiy nusxalash yetarli
(`deploy.sh` orqali yoki qo'lda `/var/www/IIS/innovateit-frontend/`ga).
Cache-busting kerak bo'lsa, `oqituvchi.css`dagi kabi HTML'dagi
`js/oqituvchi.js`/`js/api.js` skript manzillariga `?v=N` qo'shishni unutmang.

⚠️ **Eslatma:** bu bosqich ishlashi uchun avvalgi (1–2-bosqich) backend
patch serverga allaqachon deploy qilingan va migratsiya ishga tushirilgan
bo'lishi shart (`/api/vazifalar/...` endpointlari kerak).

## Keyingi bosqich

4-bosqich — **o'quvchi paneli**: yangi "Vazifalarim" tab — mavzu/vazifalarni
ko'rish va javob (matn/fayl) yuborish.
