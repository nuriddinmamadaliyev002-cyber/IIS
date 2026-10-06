-- ═══════════════════════════════════════════════════════════════════════════
--  025 — DIREKTORLAR
--  Barcha maktablarni yuqoridan kuzatuvchi rahbar roli.
--  Kirish FAQAT Telegram orqali (superadmin Telegram ID biriktiradi),
--  shuning uchun username/parol yo'q. Maktabga bog'lanmaydi — direktor
--  barcha maktablarni ko'radi.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS direktorlar (
    id          SERIAL PRIMARY KEY,
    ism         TEXT   NOT NULL,
    familiya    TEXT   NOT NULL DEFAULT '',
    telegram_id BIGINT UNIQUE,
    yaratilgan  TEXT   DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY')
);

GRANT ALL PRIVILEGES ON direktorlar TO iis_user;
GRANT ALL PRIVILEGES ON SEQUENCE direktorlar_id_seq TO iis_user;

\echo '✅ direktorlar jadvali yaratildi'
