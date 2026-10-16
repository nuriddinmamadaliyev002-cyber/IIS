-- ═══════════════════════════════════════════════════════════════════════════
--  027 — CHAT: xabarni tahrirlash, o'chirish (ikki tomondan) va fayl biriktirish
--
--  • tahrirlangan — xabar matni oxirgi marta o'zgartirilgan vaqt (NULL = tahrirlanmagan)
--  • ochirilgan   — xabar o'chirilgan vaqt. Qator "qabr toshi" sifatida qoladi
--                   (matn va fayl ma'lumotlari tozalanadi) — shunda ikkinchi
--                   tomon polling orqali o'chirilganini bilib, xabarni ekrandan oladi.
--                   Ikki tomonga ham ko'rinmaydi (API o'chirilganlarni qaytarmaydi).
--  • yangilangan  — tahrir/o'chirishda NOW() qo'yiladi; polling shu bo'yicha
--                   o'zgarishlarni topadi.
--  • fayl_*       — biriktirilgan fayl (bitta xabarga bitta fayl). Fayl diskda
--                   innovateit-backend/chat_uploads/ da (statik/nginx orqali OCHIQ
--                   emas), faqat /api/chat/fayl/:id (JWT + juftlik tekshiruvi) orqali beriladi.
--
--  Matn endi bo'sh bo'lishi mumkin — faqat fayl yuborilganda.
--  Idempotent: deploy.sh orqali qayta ishga tushirilsa ham xato bermaydi.
-- ═══════════════════════════════════════════════════════════════════════════

-- Eski CHECK (matn 1..2000) fayl-only xabarga yo'l qo'ymaydi — almashtiramiz
ALTER TABLE chat_xabarlar DROP CONSTRAINT IF EXISTS chat_xabarlar_matn_check;

ALTER TABLE chat_xabarlar
    ADD COLUMN IF NOT EXISTS tahrirlangan TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ochirilgan   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS yangilangan  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS fayl_yol     TEXT,       -- diskdagi (tasodifiy) fayl nomi
    ADD COLUMN IF NOT EXISTS fayl_nomi    TEXT,       -- foydalanuvchi ko'radigan asl nom
    ADD COLUMN IF NOT EXISTS fayl_turi    TEXT,       -- MIME turi (kengaytma bo'yicha, server belgilaydi)
    ADD COLUMN IF NOT EXISTS fayl_hajm    INTEGER;    -- bayt

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_xabarlar_mazmun_check') THEN
        ALTER TABLE chat_xabarlar ADD CONSTRAINT chat_xabarlar_mazmun_check CHECK (
            char_length(matn) <= 2000
            AND (char_length(matn) >= 1 OR fayl_yol IS NOT NULL OR ochirilgan IS NOT NULL)
        );
    END IF;
END $$;

-- Tahrir/o'chirishlarni tez topish (polling)
CREATE INDEX IF NOT EXISTS idx_chat_yangilangan
    ON chat_xabarlar (oqituvchi_id, oquvchi_id, yangilangan) WHERE yangilangan IS NOT NULL;

GRANT ALL PRIVILEGES ON chat_xabarlar TO iis_user;

\echo '✅ chat_xabarlar: tahrirlash / o''chirish / fayl ustunlari tayyor'
