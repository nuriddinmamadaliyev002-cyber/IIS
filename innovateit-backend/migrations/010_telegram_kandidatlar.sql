-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 010: Telegram guruh a'zolarini avtomatik qayd qilish
--
--  Bot xodimlar guruhida (SAVED_GROUPS) faollik ko'rgan har bir foydalanuvchini
--  shu jadvalga yozadi (id, ism, username). Superadmin buxgalter/admin biriktirishda
--  ID'ni qo'lda kiritish o'rniga shu ro'yxatdan tanlashi mumkin bo'ladi.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS telegram_kandidatlar (
    telegram_id      BIGINT PRIMARY KEY,
    telegram_ism     TEXT,
    telegram_username TEXT,
    oxirgi_faollik   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

\echo '✅ telegram_kandidatlar jadvali yaratildi'
