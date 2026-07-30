-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 006: SALES XODIMLARIGA MAKTAB BIRIKTIRISH
--
--  buxgalter_maktablar jadvaliga o'xshab, sales_xodimlar uchun ham
--  maktab biriktirish imkoniyatini qo'shadi (superadmin CRM'da
--  "Buxgalterlar" tabidagi kabi checkbox + tag UI orqali boshqariladi).
--
--  ISHLATISH:
--    sudo -u postgres psql -d iis_db -f migrations/006_sales_maktablar.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS sales_maktablar (
    id            SERIAL PRIMARY KEY,
    sales_id      INTEGER NOT NULL REFERENCES sales_xodimlar(id) ON DELETE CASCADE,
    maktab_id     INTEGER NOT NULL REFERENCES maktablar(id)      ON DELETE CASCADE,
    biriktirilgan TEXT DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY'),
    UNIQUE(sales_id, maktab_id)
);

CREATE INDEX IF NOT EXISTS idx_salesmak_salesid  ON sales_maktablar(sales_id);
CREATE INDEX IF NOT EXISTS idx_salesmak_maktabid ON sales_maktablar(maktab_id);

COMMIT;

\echo '✅ sales_maktablar jadvali yaratildi'