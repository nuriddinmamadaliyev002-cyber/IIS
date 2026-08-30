# Vazifalar moduli — 1–2-bosqich (Baza + Backend)

Bu arxivda faqat o'zgartirilgan/qo'shilgan fayllar bor. Loyihangizdagi
xuddi shu yo'ldagi faylning o'rniga almashtiring:

- `innovateit-backend/migrations/017_dars_mavzu_vazifa.sql`  ← YANGI fayl
- `innovateit-backend/innovateit_schema_setup.sql`             ← yangilangan (yangi jadvallar shu faylga ham idempotent qo'shildi)
- `innovateit-backend/src/routes/vazifalar.js`                 ← YANGI fayl
- `innovateit-backend/src/index.js`                            ← yangilangan (yangi router ulandi)

## Nima qo'shildi

**2 ta yangi jadval:**
- `dars_mavzulari` — guruh (`dars_jadvali`) + sana bo'yicha mavzu va uyga vazifa
- `vazifa_javoblari` — o'quvchining javobi (matn/fayl) + o'qituvchi bahosi/izohi

**Yangi API endpointlar (`/api/vazifalar`):**

O'qituvchi uchun:
- `GET  /guruh/:guruhId?sana=` — shu kunlik mavzu/vazifani olish
- `POST /guruh/:guruhId` — mavzu/vazifa saqlash (`{ sana, mavzu, uy_vazifasi, muddat, vazifa_fayl }`)
- `GET  /tekshirish?holat=yuborilgan|tekshirilgan|hammasi` — kelgan javoblar ro'yxati
- `POST /javob/:javobId/baholash` — javobni baholash (`{ baho, izoh }`)

O'quvchi uchun:
- `GET  /mening-vazifalarim` — o'z o'qituvchilari/sinfiga tegishli barcha vazifalar + o'z javob holati
- `POST /:vazifaId/javob` — javob yuborish/tahrirlash (`{ javob_matn, javob_fayl }`)

Fayl biriktirish uchun mavjud `POST /upload` endpoint ishlatiladi (frontendda
qaytgan `filename`ni `javob_fayl`/`vazifa_fayl` sifatida yuboriladi).

## Deploy tartibi (serverda)

```bash
# 1) Yangi migratsiyani ishga tushirish
psql -U iis_user -d iis_db -f innovateit-backend/migrations/017_dars_mavzu_vazifa.sql

# 2) deploy.sh orqali odatdagidek deploy qilish
./deploy.sh
```

`innovateit_schema_setup.sql` faqat noldan server o'rnatilganda kerak —
mavjud bazani yangilash uchun yuqoridagi migratsiya yetarli.

## Keyingi bosqichlar (frontend)

3–4-bosqich hali qolyapti:
- O'qituvchi paneli: `openGuruhDavomat` ekraniga mavzu/uy vazifasi bloki +
  yangi "Vazifalarni tekshirish" tab
- O'quvchi paneli: yangi "Vazifalarim" tab (ko'rish + javob yuborish)

Roziligingiz bilan shu qismlarni ham navbatma-navbat yozib boraman.
