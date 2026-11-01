-- 034 — kurs ishtirokchilari Telegram ID orqali kiradi

-- ─── 34. KURS ISHTIROKCHISI: Telegram ID bilan biriktirish (migrations/034) ─────
--  Ishtirokchining Telegram ID'sini kurs admini o'zi biriktiradi; Mini App kod so'ramaydi.
ALTER TABLE kurs_ishtirokchilar ADD COLUMN IF NOT EXISTS telegram_id BIGINT;
ALTER TABLE kurs_ishtirokchilar ALTER COLUMN taklif_kodi DROP NOT NULL;
UPDATE kurs_ishtirokchilar i SET telegram_id = t.telegram_id
  FROM telegram_users t
 WHERE i.telegram_id IS NULL AND t.rol='kurs_ishtirokchi' AND t.entity_table='kurs_ishtirokchilar' AND t.entity_id=i.id;
UPDATE kurs_ishtirokchilar SET taklif_kodi = NULL WHERE taklif_kodi IS NOT NULL;
