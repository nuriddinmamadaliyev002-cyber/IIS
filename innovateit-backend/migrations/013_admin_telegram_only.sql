-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 013: Maktab adminlari — username/parol o'rniga Telegram ID
--
--  Endi maktab admini (adminlar jadvali) buxgalter va sales xodimlari kabi
--  FAQAT Telegram Mini App orqali kiradi. username/parol ustunlari allaqachon
--  NULL bo'lishi mumkin edi (innovateit_schema_setup.sql da NOT NULL cheklovi
--  yo'q), lekin bu migratsiya production bazada ehtimoliy eski cheklovlarni
--  ham xavfsiz olib tashlaydi — idempotent, xatosiz qayta ishga tushadi.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'adminlar' AND column_name = 'username' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE adminlar ALTER COLUMN username DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'adminlar' AND column_name = 'parol' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE adminlar ALTER COLUMN parol DROP NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'adminlar' AND column_name = 'telegram_id'
  ) THEN
    ALTER TABLE adminlar ADD COLUMN telegram_id BIGINT;
    CREATE INDEX IF NOT EXISTS idx_adminlar_telegram_id ON adminlar (telegram_id);
  END IF;
END $$;

\echo '✅ adminlar: username/parol ixtiyoriy, telegram_id tayyor — endi Telegram-only kirish'
