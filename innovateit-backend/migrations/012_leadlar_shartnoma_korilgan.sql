-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 012: Ro'yxatdan o'tish sahifasida "shartnoma bilan tanishib
--  chiqdim" checkboxi belgilanganini saqlab qolish.
--
--  Eslatma: bu HAQIQIY shartnoma imzolash emas — faqat lead (ariza) yuborish
--  bosqichida foydalanuvchiga shartnoma matni bilan tanishish imkoniyati
--  berilgani va u buni tasdiqlagani haqidagi belgi. Rasmiy shartnoma keyinroq,
--  o'quvchi qabul qilinganda, alohida (haqiqiy imzo bilan) tuziladi.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE leadlar
  ADD COLUMN IF NOT EXISTS shartnoma_korilgan BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS shartnoma_korilgan_vaqt TIMESTAMP;

\echo '✅ leadlar jadvaliga shartnoma_korilgan va shartnoma_korilgan_vaqt ustunlari qo''shildi'
