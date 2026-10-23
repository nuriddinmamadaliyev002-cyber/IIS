-- ════════════════════════════════════════════════════════════════════════════
--  031 — Maktabda yakshanba kuni dars o'tiladimi (superadmin belgilaydi)
--  ─────────────────────────────────────────────────────────────────────────
--  TRUE bo'lsa, shu maktabdagi o'qituvchilar guruh yaratishda "Yak"
--  (yakshanba) kunini tanlay oladi. Standart — FALSE (Dushanba–Shanba).
--  Idempotent: deploy.sh har safar ishga tushirsa ham xavfsiz.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE maktablar ADD COLUMN IF NOT EXISTS yakshanba_dars BOOLEAN NOT NULL DEFAULT FALSE;
