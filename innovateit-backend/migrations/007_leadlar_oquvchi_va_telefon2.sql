-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 007: Leadlar — o'quvchi F.I.Sh. va qo'shimcha telefon
--
--  O'zgarishlar:
--    1) farzand_ismi ustuni o'quvchi_ismi ga qayta nomlanadi (ma'no aniqroq)
--    2) oquvchi_familiya ustuni qo'shiladi (ism dan OLDIN kiritiladi)
--    3) telefon2 ustuni qo'shiladi — qo'shimcha (ixtiyoriy) telefon raqam
--
--  ISHLATISH:
--    sudo -u postgres psql -d iis_db -f migrations/007_leadlar_oquvchi_va_telefon2.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) farzand_ismi → oquvchi_ismi
ALTER TABLE leadlar RENAME COLUMN farzand_ismi TO oquvchi_ismi;

-- 2) o'quvchining familiyasi (ismidan oldin ko'rsatiladi)
ALTER TABLE leadlar ADD COLUMN IF NOT EXISTS oquvchi_familiya TEXT DEFAULT '';

-- 3) qo'shimcha telefon raqam (ixtiyoriy)
ALTER TABLE leadlar ADD COLUMN IF NOT EXISTS telefon2 TEXT DEFAULT '';

COMMIT;

\echo '✅ Migration 007 bajarildi: leadlar.oquvchi_ismi, leadlar.oquvchi_familiya, leadlar.telefon2'
