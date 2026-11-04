-- 036 — sertifikat turi: o'tish balidan o'tgan (muvaffaqiyatli tugatgan) yoki o'tmagan (faol ishtirok etgan)
-- Eski sertifikatlar faqat o'tganlarga berilgan, shuning uchun ular TRUE bo'lib qoladi.
-- Qiymat sertifikat berilgan paytda saqlanadi: keyin kurs o'tish bali o'zgarsa ham berilgan sertifikat o'zgarmaydi.
ALTER TABLE kurs_sertifikatlar ADD COLUMN IF NOT EXISTS otdi BOOLEAN NOT NULL DEFAULT TRUE;
