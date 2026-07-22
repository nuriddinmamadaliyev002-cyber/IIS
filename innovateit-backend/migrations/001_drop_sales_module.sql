-- ═══════════════════════════════════════════════════════════════════════════
--  Migration: SALES MODULE (eski) ni butunlay o'chirish
--  Jadvallar: lead_tarix, leadlar, maslahatchilar
--
--  TARTIB MUHIM: avval FOREIGN KEY bilan bog'liq "bola" jadvallar,
--  keyin "ota" jadval o'chiriladi. Aks holda xatolik chiqadi.
--
--  ISHLATISH:
--    psql -U iis_user -d iis_db -f migrations/001_drop_sales_module.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) lead_tarix — leadlar(id) ga FK bilan bog'langan, shuning uchun birinchi
DROP TABLE IF EXISTS lead_tarix CASCADE;

-- 2) leadlar — maslahatchilar(id), adminlar(id), oquvchilar(id), maktablar(id) ga FK bor
DROP TABLE IF EXISTS leadlar CASCADE;

-- 3) maslahatchilar — endi hech kim unga bog'lanmagan, xavfsiz o'chadi
DROP TABLE IF EXISTS maslahatchilar CASCADE;

COMMIT;

\echo '✅ Sales moduli (maslahatchilar, leadlar, lead_tarix) bazadan ochirildi'