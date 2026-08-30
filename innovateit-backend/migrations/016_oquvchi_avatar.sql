-- ═══════════════════════════════════════════════════════════════════
--  016: O'quvchi jinsi (avatar) — o'quvchi qo'shish/tahrirlashda
--  maktab admini o'quvchining jinsini belgilaydi: 'erkak' yoki 'ayol'.
--  Shu qiymatga qarab o'quvchining o'z web panelida va Telegram
--  Mini App'dagi "xush kelibsiz" ekranida mos avatar (o'g'il/qiz bola)
--  ko'rsatiladi — xuddi o'qituvchilar uchun ishlagani kabi (015-migratsiya).
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE oquvchilar ADD COLUMN IF NOT EXISTS avatar TEXT;

-- Ruxsat etilgan qiymatlar: 'erkak', 'ayol' yoki NULL (tanlanmagan —
-- standart sifatida o'g'il bola avatar ko'rsatiladi)
ALTER TABLE oquvchilar DROP CONSTRAINT IF EXISTS oquvchilar_avatar_check;
ALTER TABLE oquvchilar ADD CONSTRAINT oquvchilar_avatar_check
  CHECK (avatar IS NULL OR avatar IN ('erkak', 'ayol'));
