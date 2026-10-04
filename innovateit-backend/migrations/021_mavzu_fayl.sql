-- ═══════════════════════════════════════════════════════════════════
--  021: Dars mavzusi uchun alohida fayl
--  Endi o'qituvchi 2 ta fayl biriktira oladi:
--    mavzu_fayl  — "Bugungi dars mavzusi" uchun   (YANGI ustun)
--    vazifa_fayl — "Uyga vazifa" uchun            (avvalgi ustun, o'zgarmadi)
--  "muddat" ustuni bazada qoladi, lekin endi ishlatilmaydi.
--  Xavfsiz: har deployda qayta ishga tushsa ham bo'ladi.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE dars_mavzulari
  ADD COLUMN IF NOT EXISTS mavzu_fayl TEXT DEFAULT '';
