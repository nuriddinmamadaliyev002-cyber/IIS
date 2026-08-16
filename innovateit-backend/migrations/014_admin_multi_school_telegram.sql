-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 014: Bitta Telegram ID — bir nechta maktabga admin
--
--  Superadmin endi bitta odam uchun bir nechta admin yozuvi (har biri alohida
--  maktabga tegishli) yaratib, hammasini BITTA Telegram ID'ga biriktira oladi.
--  Mini App'da tanlov ro'yxatida "10-maktab admini", "13-maktab admini" kabi
--  ajralib turadi.
--
--  Buning uchun ikkita eski cheklov olib tashlanadi:
--   1) telegram_users: UNIQUE(telegram_id, rol) → UNIQUE(telegram_id, rol, entity_id)
--      (bitta odam bir xil rolda BIR NECHTA entity'ga bog'lansin)
--   2) adminlar.telegram_id ustunidagi UNIQUE cheklov olib tashlanadi
--      (bir xil telegram_id bir nechta adminlar qatorida takrorlansin)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- 1) telegram_users: (telegram_id, rol) → (telegram_id, rol, entity_id)
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'telegram_users_telegram_id_rol_key'
  ) THEN
    ALTER TABLE telegram_users DROP CONSTRAINT telegram_users_telegram_id_rol_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'telegram_users_tgid_rol_entity_key'
  ) THEN
    ALTER TABLE telegram_users
      ADD CONSTRAINT telegram_users_tgid_rol_entity_key UNIQUE (telegram_id, rol, entity_id);
  END IF;

  -- 2) adminlar.telegram_id — UNIQUE cheklovni olib tashlash, oddiy indexga almashtirish
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'adminlar'::regclass AND contype = 'u'
      AND conname LIKE '%telegram_id%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE adminlar DROP CONSTRAINT ' || conname
      FROM pg_constraint
      WHERE conrelid = 'adminlar'::regclass AND contype = 'u'
        AND conname LIKE '%telegram_id%'
      LIMIT 1
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'adminlar' AND indexname = 'idx_adminlar_telegram_id'
  ) THEN
    CREATE INDEX idx_adminlar_telegram_id ON adminlar (telegram_id);
  END IF;
END $$;

\echo '✅ Bitta Telegram ID endi bir nechta maktabga admin sifatida biriktirilishi mumkin'
