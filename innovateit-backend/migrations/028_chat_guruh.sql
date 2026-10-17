-- ═══════════════════════════════════════════════════════════════════════════
--  028 — GURUH CHATI + AUDIO
--
--  • Guruh = dars_jadvali yozuvi. Har bir guruhning chati bor; a'zolar alohida
--    saqlanmaydi (routes/chatAccess.js: o'qituvchi egasi, o'quvchi esa biriktirilgan,
--    guruh maktabi va sinfiga mos bo'lsa a'zo hisoblanadi).
--  • chat_guruh_xabarlar.guruh_id ATAYIN FK emas: guruh o'chirilsa xabarlar
--    o'chmaydi (fayllar diskda yetim qolmasin, tarix saqlansin), faqat chatga
--    kirish yopiladi — a'zolik dars_jadvali yozuviga bog'liq.
--  • yuboruvchi + yuboruvchi_id — polimorf (oqituvchilar yoki oquvchilar), shuning
--    uchun FK yo'q.
--  • javob_id — reply (guruhdagi boshqa xabarga javob). Xabar o'chirilganda qator
--    "qabr toshi" bo'lib qoladi (1:1 chat bilan bir xil), shuning uchun javobda
--    "o'chirilgan xabar" ko'rsatiladi.
--  • chat_guruh_oqilgan — har bir a'zo uchun guruhda oxirgi o'qigan xabar id'si
--    (o'qilmaganlar soni shundan hisoblanadi).
--  • fayl_davomiylik — audio davomiyligi (soniya), faqat ko'rsatish uchun.
--  Idempotent: deploy.sh orqali qayta ishga tushirilsa ham xato bermaydi.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS chat_guruh_xabarlar (
    id              BIGSERIAL PRIMARY KEY,
    guruh_id        INTEGER NOT NULL,
    yuboruvchi      TEXT    NOT NULL CHECK (yuboruvchi IN ('oqituvchi', 'oquvchi')),
    yuboruvchi_id   INTEGER NOT NULL,
    matn            TEXT    NOT NULL DEFAULT '',
    javob_id        BIGINT  REFERENCES chat_guruh_xabarlar(id) ON DELETE SET NULL,
    yaratilgan      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tahrirlangan    TIMESTAMPTZ,
    ochirilgan      TIMESTAMPTZ,
    yangilangan     TIMESTAMPTZ,
    fayl_yol        TEXT,
    fayl_nomi       TEXT,
    fayl_turi       TEXT,
    fayl_hajm       INTEGER,
    fayl_davomiylik INTEGER,
    CONSTRAINT chat_guruh_xabarlar_mazmun_check CHECK (
        char_length(matn) <= 2000
        AND (char_length(matn) >= 1 OR fayl_yol IS NOT NULL OR ochirilgan IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS idx_chat_guruh_xabar
    ON chat_guruh_xabarlar (guruh_id, id);
CREATE INDEX IF NOT EXISTS idx_chat_guruh_yangilangan
    ON chat_guruh_xabarlar (guruh_id, yangilangan) WHERE yangilangan IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_guruh_yuboruvchi_kvota
    ON chat_guruh_xabarlar (yuboruvchi, yuboruvchi_id, yaratilgan) WHERE fayl_hajm IS NOT NULL;

CREATE TABLE IF NOT EXISTS chat_guruh_oqilgan (
    guruh_id   INTEGER NOT NULL,
    rol        TEXT    NOT NULL CHECK (rol IN ('oqituvchi', 'oquvchi')),
    user_id    INTEGER NOT NULL,
    oxirgi_id  BIGINT  NOT NULL DEFAULT 0,
    PRIMARY KEY (guruh_id, rol, user_id)
);

-- 1:1 chatga ham audio davomiyligi
ALTER TABLE chat_xabarlar
    ADD COLUMN IF NOT EXISTS fayl_davomiylik INTEGER;

-- Kunlik kvotani tez hisoblash (1:1 chat)
CREATE INDEX IF NOT EXISTS idx_chat_kvota_oqituvchi
    ON chat_xabarlar (oqituvchi_id, yaratilgan) WHERE fayl_hajm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_kvota_oquvchi
    ON chat_xabarlar (oquvchi_id, yaratilgan) WHERE fayl_hajm IS NOT NULL;

GRANT ALL PRIVILEGES ON chat_guruh_xabarlar, chat_guruh_oqilgan TO iis_user;
GRANT ALL PRIVILEGES ON SEQUENCE chat_guruh_xabarlar_id_seq TO iis_user;

\echo '✅ guruh chati va audio tayyor'
