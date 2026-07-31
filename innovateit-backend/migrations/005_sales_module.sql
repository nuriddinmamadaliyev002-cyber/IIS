-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 005: SALES MODULE (yangi)
--
--  001_drop_sales_module.sql da eski sales moduli (leadlar, maslahatchilar,
--  lead_tarix) butunlay o'chirilgan edi. Bu migratsiya yangi, soddaroq sales
--  modulini qo'shadi:
--
--    sales_xodimlar — sales bo'limi xodimlari (buxgalterlar bilan bir xil
--                     login patterni: username + bcrypt parol)
--    leadlar        — ochiq "Ro'yxatdan o'tish" sahifasidan keladigan
--                     murojaatlar (public POST, auth talab qilinmaydi)
--
--  ISHLATISH:
--    sudo -u postgres psql -d iis_db -f migrations/005_sales_module.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. SALES XODIMLARI ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_xodimlar (
    id          SERIAL PRIMARY KEY,
    ism         TEXT    NOT NULL,
    familiya    TEXT    NOT NULL DEFAULT '',
    username    TEXT    UNIQUE,
    parol       TEXT,
    telegram_id BIGINT  UNIQUE,
    yaratilgan  TEXT    DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY')
);

-- ─── 2. LEADLAR (ro'yxatdan o'tish murojaatlari) ───────────────────────────
CREATE TABLE IF NOT EXISTS leadlar (
    id             SERIAL PRIMARY KEY,
    ism            TEXT    NOT NULL,
    telefon        TEXT    NOT NULL,
    telefon2       TEXT    DEFAULT '',              -- qo'shimcha (ixtiyoriy) telefon
    oquvchi_familiya TEXT  DEFAULT '',               -- o'quvchining familiyasi
    oquvchi_ismi   TEXT    DEFAULT '',               -- o'quvchining ismi
    sinf           TEXT    DEFAULT '',              -- o'quvchining sinfi/yoshi
    maktab_id      INTEGER REFERENCES maktablar(id) ON DELETE SET NULL,
    hudud          TEXT    DEFAULT '',               -- agar maktab ro'yxatda bo'lmasa, erkin matn
    izoh           TEXT    DEFAULT '',
    qaydnoma       TEXT    DEFAULT '',                -- sales xodimining qo'ng'iroq eslatmasi
    manba          TEXT    DEFAULT 'sayt',            -- 'sayt' | 'telegram' | 'qolda' va h.k.
    holat          TEXT    NOT NULL DEFAULT 'yangi'
                     CHECK (holat IN ('yangi', 'boglanildi', 'royxatga_olindi', 'bekor_qilindi')),
    biriktirilgan  INTEGER REFERENCES sales_xodimlar(id) ON DELETE SET NULL,
    yaratilgan     TIMESTAMP DEFAULT NOW(),
    yangilangan    TIMESTAMP DEFAULT NOW()
);

-- ─── Indekslar ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leadlar_holat        ON leadlar(holat);
CREATE INDEX IF NOT EXISTS idx_leadlar_yaratilgan    ON leadlar(yaratilgan DESC);
CREATE INDEX IF NOT EXISTS idx_leadlar_biriktirilgan ON leadlar(biriktirilgan);
CREATE INDEX IF NOT EXISTS idx_sales_username        ON sales_xodimlar(username);

COMMIT;

\echo '✅ Sales moduli jadvallari yaratildi: sales_xodimlar, leadlar'