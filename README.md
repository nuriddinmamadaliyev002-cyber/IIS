# Vazifalar moduli — yangilanish: alohida tab + fayl/rasm yuklash

Bu arxiv avvalgi 3-bosqichni **almashtiradi** (o'rniga qo'yiladi). Fayllar:

- `innovateit-frontend/oqituvchi.html` — yangilangan
- `innovateit-frontend/js/oqituvchi.js` — yangilangan
- `innovateit-frontend/js/oquvchi.js` — yangilangan (fayl havolasi to'g'ri manzilga tuzatildi + o'qituvchi fayli ko'rsatiladi)
- `innovateit-backend/src/routes/vazifalar.js` — yangilangan (`/tekshirish`ga `vazifa_fayl` maydoni qo'shildi)

## Nima o'zgardi

### 1) Mavzu/vazifa endi alohida tab
Avval davomat ekrani ichida edi — endi tab navigatsiyasida mustaqil
**"📘 Mavzu / Vazifa berish"** tabi bor:
- Guruh tanlanadi (ro'yxatdan bosiladi)
- O'sha guruhning **dars kunlari** bo'yicha sana navigatsiyasi (davomatdagi
  bilan bir xil uslub, lekin mustaqil — davomat sanasidan bog'liq emas)
- Mavzu, uyga vazifa, ixtiyoriy muddat va **fayl/rasm** maydonlari

### 2) Fayl/rasm yuklash — ikkala tomonda ham
- **O'qituvchi** ("Mavzu/Vazifa berish"): mavzuga rasm yoki fayl (pdf/doc)
  biriktirishi mumkin — mavjud `/upload` endpointi orqali darhol yuklanadi,
  havola ko'rinadi, "❌ Olib tashlash" bilan bekor qilinadi
- **O'quvchi** ("Vazifalarim"): javobiga matn + fayl/rasm biriktiradi (bu
  qism 4-bosqichda allaqachon qo'shilgan edi)
- **O'qituvchi** ("Vazifalarni tekshirish"): endi o'quvchining javob fayli
  ustiga bosilganda **to'g'ri manzilga** ochiladi (avval nisbiy yo'l xato
  edi — tuzatildi), shuningdek o'zining biriktirgan fayli ham ko'rinadi
- **O'quvchi** ("Vazifalarim"da): o'qituvchi biriktirgan faylni ham ko'radi

## Deploy

Statik frontend fayllar + backend `vazifalar.js`ni serverga almashtiring,
so'ng `pm2 restart` (yoki `deploy.sh`). Bazaga tegishli o'zgarish yo'q —
1–2-bosqichdagi migratsiya bilan hech narsa o'zgarmaydi (`vazifa_fayl` va
`javob_fayl` ustunlari allaqachon bor edi).
