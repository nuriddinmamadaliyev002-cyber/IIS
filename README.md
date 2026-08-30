# Vazifalar moduli — 4-bosqich (O'quvchi paneli frontend)

Bu arxivda:

- `innovateit-frontend/oquvchi.html` — yangilangan
- `innovateit-frontend/js/oquvchi.js` — yangilangan
- `innovateit-frontend/js/api.js` — 3-bosqichdagi bilan bir xil (agar 3-bosqichni
  allaqachon qo'llagan bo'lsangiz, bu faylni qayta almashtirish shart emas)

## Nima qo'shildi

Tab navigatsiyasiga **"📝 Vazifalarim"** qo'shildi. Bu yerda o'quvchi:

- O'ziga biriktirilgan barcha o'qituvchilarning e'lon qilgan **mavzu va uyga
  vazifalarini** sana bo'yicha kamayish tartibida ko'radi (fan, o'qituvchi,
  mavzu, vazifa matni, ixtiyoriy muddat)
- Har bir vazifaga **matn + ixtiyoriy fayl** (rasm/hujjat) bilan javob yuboradi
  (mavjud `/upload` endpoint orqali)
- Holat ko'rsatiladi:
  - Hali yubormagan → forma ochiq
  - **⏳ Tekshirilmoqda** → yuborilgan, "✏️ Javobni tahrirlash" bilan
    o'zgartirish mumkin (fayl qayta tanlanmasa, avvalgi fayl saqlanib qoladi)
  - **✅ Baholangan** → baho + o'qituvchi izohi ko'rinadi, tahrirlash yopiladi

Agar darsga uyga vazifa berilmagan bo'lsa (faqat mavzu yozilgan bo'lsa),
javob yuborish formasi ko'rsatilmaydi — shunchaki "vazifa berilmagan" degan
matn chiqadi.

## Deploy

Statik fayllar — `deploy.sh` orqali yoki qo'lda serverga nusxalanadi.
Bu bosqich ishlashi uchun 1–2-bosqich (backend) va 3-bosqichdagi `api.js`
o'zgarishlari serverda allaqachon bo'lishi kerak.

---

**Barcha 4 bosqich ham tugadi.** To'liq oqim: o'qituvchi guruh+sana bo'yicha
mavzu/vazifa yozadi → o'quvchi "Vazifalarim"da ko'rib javob yuboradi →
o'qituvchi "Vazifalarni tekshirish"da baholaydi → o'quvchi bahoni ko'radi.

Keyingi (ixtiyoriy) qadamlar taklif etaman:
1. Serverga deploy qilib, real ma'lumot bilan uchtalik oqimni sinovdan o'tkazish
2. Telegram bot orqali bildirishnoma (yangi vazifa e'lon qilinganda o'quvchiga,
   yangi javob kelganda o'qituvchiga)
