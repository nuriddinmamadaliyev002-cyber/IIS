-- ═══════════════════════════════════════════════════════════════════════════
--  026 — CHAT (o'quvchi ↔ unga biriktirilgan o'qituvchi)
--  Xabarlar (o'qituvchi, o'quvchi) juftligi bo'yicha saqlanadi. Muloqot faqat
--  oqituvchi_oquvchilar jadvalida biriktirilgan juftlar orasida ruxsat etiladi
--  (tekshiruv backendda — routes/chat.js). Biriktirish bekor qilinsa ham
--  yozishmalar saqlanib qoladi, lekin ularga kirish yopiladi.
--  Idempotent: deploy.sh orqali qayta ishga tushirilsa ham xato bermaydi.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS chat_xabarlar (
    id            BIGSERIAL PRIMARY KEY,
    oqituvchi_id  INTEGER NOT NULL REFERENCES oqituvchilar(id) ON DELETE CASCADE,
    oquvchi_id    INTEGER NOT NULL REFERENCES oquvchilar(id)   ON DELETE CASCADE,
    yuboruvchi    TEXT    NOT NULL CHECK (yuboruvchi IN ('oqituvchi', 'oquvchi')),
    matn          TEXT    NOT NULL CHECK (char_length(matn) BETWEEN 1 AND 2000),
    yaratilgan    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    oqilgan       TIMESTAMPTZ            -- qabul qiluvchi ochib o'qigan vaqt (NULL = o'qilmagan)
);

-- Suhbatni id bo'yicha tez o'qish (oxirgi N ta, "after" bilan yangilari)
CREATE INDEX IF NOT EXISTS idx_chat_juft
    ON chat_xabarlar (oqituvchi_id, oquvchi_id, id);

-- O'qilmaganlar sonini tez hisoblash
CREATE INDEX IF NOT EXISTS idx_chat_oqilmagan_oqituvchi
    ON chat_xabarlar (oqituvchi_id, oquvchi_id) WHERE oqilgan IS NULL AND yuboruvchi = 'oquvchi';
CREATE INDEX IF NOT EXISTS idx_chat_oqilmagan_oquvchi
    ON chat_xabarlar (oquvchi_id, oqituvchi_id) WHERE oqilgan IS NULL AND yuboruvchi = 'oqituvchi';

GRANT ALL PRIVILEGES ON chat_xabarlar TO iis_user;
GRANT ALL PRIVILEGES ON SEQUENCE chat_xabarlar_id_seq TO iis_user;

\echo '✅ chat_xabarlar jadvali tayyor'
