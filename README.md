# Muddat sanasi formati tuzatildi (DD/MM/YYYY)

Bu kichik patch faqat 2 faylni yangilaydi:

- `innovateit-frontend/oqituvchi.html`
- `innovateit-frontend/js/oqituvchi.js`

## Nima tuzatildi

"Topshirish muddati" maydoni native `<input type="date">` edi — brauzer
tiliga qarab u MM/DD/YYYY yoki boshqa formatda ko'rinishi mumkin edi
(sizning skrinshotdagi holat aynan shu). Davomat sana navigatsiyasida
avvaldan ishlatilgan **"yashirin native input + ustida DD/MM/YYYY matn"**
patternini shu maydonga ham qo'lladim:

- Ko'rinadigan matn har doim **DD/MM/YYYY** formatida
- Bosilganda baribir asl kalendar (native date picker) ochiladi
- Sana tanlangandan keyin **"✕ Muddatni tozalash"** havolasi chiqadi (muddat
  ixtiyoriy bo'lgani uchun)

Serverga yuboriladigan qiymat o'zgarmadi (baribir `YYYY-MM-DD`) — faqat
ko'rinish tuzatildi.
