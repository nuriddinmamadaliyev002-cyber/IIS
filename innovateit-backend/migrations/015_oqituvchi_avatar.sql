-- ═══════════════════════════════════════════════════════════════════
--  015: O'qituvchi avatar (rasm) tanlash imkoniyati
--  Superadmin Telegram ID biriktirish/tahrirlash vaqtida o'qituvchi
--  uchun avatar tanlaydi: 'erkak' yoki 'ayol'. Shu avatar keyinchalik
--  o'qituvchining o'z web panelida va Telegram Mini App'dagi
--  "xush kelibsiz" ekranida ko'rsatiladi.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE oqituvchilar ADD COLUMN IF NOT EXISTS avatar TEXT;

-- Ruxsat etilgan qiymatlar: 'erkak', 'ayol' yoki NULL (tanlanmagan —
-- standart neytral belgi ko'rsatiladi)
ALTER TABLE oqituvchilar DROP CONSTRAINT IF EXISTS oqituvchilar_avatar_check;
ALTER TABLE oqituvchilar ADD CONSTRAINT oqituvchilar_avatar_check
  CHECK (avatar IS NULL OR avatar IN ('erkak', 'ayol'));
