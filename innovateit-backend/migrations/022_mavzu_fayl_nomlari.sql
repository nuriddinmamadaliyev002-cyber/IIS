-- ═══════════════════════════════════════════════════════════════════
--  022: Biriktirilgan fayllarning ASL nomlari
--  Diskda fayl tasodifiy nom bilan saqlanadi (kvit_..._abc.png). O'qituvchi
--  formasida faylning haqiqiy nomi ko'rinib turishi uchun asl nom ham saqlanadi.
--  Eski yozuvlarda bo'sh qoladi — shunda frontend diskdagi nomni ko'rsatadi.
--  Xavfsiz: har deployda qayta ishga tushsa ham bo'ladi.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE dars_mavzulari ADD COLUMN IF NOT EXISTS mavzu_fayl_nomi  TEXT DEFAULT '';
ALTER TABLE dars_mavzulari ADD COLUMN IF NOT EXISTS vazifa_fayl_nomi TEXT DEFAULT '';
