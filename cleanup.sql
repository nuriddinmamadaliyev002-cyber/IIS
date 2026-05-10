-- ═══════════════════════════════════════════════════════════════════════════
--  InnovateIT School — Cleanup Migration (TO'LIQ)
--
--  Barcha legacy ustunlar va keraksiz jadvallarni o'chiradi.
--  buxgalter.js yangi versiyasi (maktab_id) bilan birga ishlatiladi.
--
--  Bajarish tartibi:
--    1. pg_dump innovateit > backup_$(date +%F).sql
--    2. cp buxgalter.js routes/buxgalter.js       (yangi versiya)
--    3. psql -d innovateit -f cleanup.sql
--    4. pm2 restart innovateit-backend
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
--  1. buxgalter_adminlar — KERAKSIZ JADVAL
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS buxgalter_adminlar CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
--  2. adminlar — username, parol
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE adminlar DROP COLUMN IF EXISTS username;
ALTER TABLE adminlar DROP COLUMN IF EXISTS parol;


-- ─────────────────────────────────────────────────────────────────────────────
--  3. buxgalterlar — username, parol
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE buxgalterlar DROP COLUMN IF EXISTS username;
ALTER TABLE buxgalterlar DROP COLUMN IF EXISTS parol;


-- ─────────────────────────────────────────────────────────────────────────────
--  4. oqituvchilar — admin
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE oqituvchilar DROP COLUMN IF EXISTS admin;


-- ─────────────────────────────────────────────────────────────────────────────
--  5. davomat — admin_username
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX  IF EXISTS idx_davomat_sana_admin;
ALTER TABLE davomat DROP COLUMN IF EXISTS admin_username;


-- ─────────────────────────────────────────────────────────────────────────────
--  6. oqituvchilar_davomat — admin_username
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX  IF EXISTS idx_tdavomat_sana_admin;
ALTER TABLE oqituvchilar_davomat DROP COLUMN IF EXISTS admin_username;


-- ─────────────────────────────────────────────────────────────────────────────
--  7. dars_jadvali — admin_username
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE dars_jadvali DROP COLUMN IF EXISTS admin_username;


-- ─────────────────────────────────────────────────────────────────────────────
--  8. tolovlar — oquvchi_id qo'shamiz, ism+familiya dan to'ldiramiz,
--     keyin eski maktab TEXT va admin_username ustunlarini o'chiramiz
-- ─────────────────────────────────────────────────────────────────────────────

-- 8a. oquvchi_id ustunini qo'shamiz
ALTER TABLE tolovlar
  ADD COLUMN IF NOT EXISTS oquvchi_id INTEGER;

-- 8b. Faol o'quvchilardan to'ldiramiz
UPDATE tolovlar t
SET oquvchi_id = (
  SELECT id FROM oquvchilar o
  WHERE o.ism = t.oquvchi_ism AND o.familiya = t.oquvchi_familiya
  LIMIT 1
)
WHERE t.oquvchi_id IS NULL;

-- 8c. Nofaol o'quvchilardan qolganlarni to'ldiramiz
UPDATE tolovlar t
SET oquvchi_id = (
  SELECT id FROM nofaol_oquvchilar n
  WHERE n.ism = t.oquvchi_ism AND n.familiya = t.oquvchi_familiya
  LIMIT 1
)
WHERE t.oquvchi_id IS NULL;

-- 8d. Eski UNIQUE constraint ni o'chiramiz (oy, oquvchi_ism, oquvchi_familiya, admin_username)
DO $$
DECLARE con_name TEXT;
BEGIN
  SELECT constraint_name INTO con_name
  FROM information_schema.table_constraints
  WHERE table_name = 'tolovlar'
    AND constraint_type = 'UNIQUE'
    AND constraint_name LIKE '%admin_username%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE tolovlar DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

-- 8e. Yangi UNIQUE constraint: (oy, oquvchi_id)
ALTER TABLE tolovlar
  DROP CONSTRAINT IF EXISTS tolovlar_oy_oquvchi_id_key;
ALTER TABLE tolovlar
  ADD CONSTRAINT tolovlar_oy_oquvchi_id_key UNIQUE (oy, oquvchi_id);

-- 8f. Eski ustunlarni o'chiramiz
DROP INDEX  IF EXISTS idx_tolovlar_admin;
ALTER TABLE tolovlar DROP COLUMN IF EXISTS maktab;
ALTER TABLE tolovlar DROP COLUMN IF EXISTS admin_username;


-- ─────────────────────────────────────────────────────────────────────────────
--  9. oquvchilar — maktab TEXT, admin TEXT
--     students.js va buxgalter.js maktab_id ishlatadi
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX  IF EXISTS idx_oquvchilar_admin;
ALTER TABLE oquvchilar DROP COLUMN IF EXISTS maktab;
ALTER TABLE oquvchilar DROP COLUMN IF EXISTS admin;


-- ─────────────────────────────────────────────────────────────────────────────
--  10. nofaol_oquvchilar — maktab TEXT, admin TEXT
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE nofaol_oquvchilar DROP COLUMN IF EXISTS maktab;
ALTER TABLE nofaol_oquvchilar DROP COLUMN IF EXISTS admin;


-- ─────────────────────────────────────────────────────────────────────────────
--  11. adminlar — username va parol ustunlari qo'shish
--      (yangi: admin browser orqali username+parol bilan kiradi)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE adminlar ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE adminlar ADD COLUMN IF NOT EXISTS parol    TEXT;

-- Buxgalterlar: username va parol ustunlari qo'shish
ALTER TABLE buxgalterlar ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE buxgalterlar ADD COLUMN IF NOT EXISTS parol    TEXT;

COMMIT;
