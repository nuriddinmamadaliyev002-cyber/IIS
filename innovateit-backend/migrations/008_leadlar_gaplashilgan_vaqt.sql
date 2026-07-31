-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 008: leadlar jadvaliga "gaplashilgan_vaqt" ustuni qo'shish
--
--  Sales xodimi Qaydnoma yozayotganda mijoz bilan qachon gaplashilganini
--  (qo'ng'iroq/aloqa vaqtini) ham belgilab qo'yishi uchun.
--
--  ISHLATISH:
--    sudo -u postgres psql -d iis_db -f migrations/008_leadlar_gaplashilgan_vaqt.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE leadlar
  ADD COLUMN IF NOT EXISTS gaplashilgan_vaqt TIMESTAMP;

COMMIT;

\echo '✅ leadlar.gaplashilgan_vaqt ustuni qoshildi'
