-- 033 — kurs adminlari Telegram ID orqali kiradi

-- ─── 33. KURS ADMINI: Telegram ID bilan biriktirish (migrations/033) ───────────
--  Kurs admini endi maktab adminlari kabi superadmin kiritgan Telegram ID orqali
--  kiradi (taklif kodi faqat ishtirokchilar uchun qoladi).
ALTER TABLE kurs_adminlar ADD COLUMN IF NOT EXISTS telegram_id BIGINT;
ALTER TABLE kurs_adminlar ALTER COLUMN taklif_kodi DROP NOT NULL;
UPDATE kurs_adminlar a SET telegram_id = t.telegram_id
  FROM telegram_users t
 WHERE a.telegram_id IS NULL AND t.rol='kurs_admin' AND t.entity_table='kurs_adminlar' AND t.entity_id=a.id;
UPDATE kurs_adminlar SET taklif_kodi = NULL WHERE taklif_kodi IS NOT NULL;
