-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 011: Bitta Telegram ID bir nechta rolga bog'lanishi mumkin
--
--  Masalan bitta xodim ham buxgalter, ham sales bo'lishi mumkin. Shuning uchun
--  telegram_users jadvalidagi yolg'iz telegram_id UNIQUE cheklovi (telegram_id, rol)
--  juftligiga almashtiriladi.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'telegram_users_telegram_id_key'
  ) THEN
    ALTER TABLE telegram_users DROP CONSTRAINT telegram_users_telegram_id_key;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'telegram_users_telegram_id_rol_key'
  ) THEN
    ALTER TABLE telegram_users ADD CONSTRAINT telegram_users_telegram_id_rol_key UNIQUE (telegram_id, rol);
  END IF;
END $$;

\echo '✅ telegram_users endi (telegram_id, rol) bo''yicha unikal — bir kishi bir nechta rolga bog''lanishi mumkin'
