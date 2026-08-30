-- ═══════════════════════════════════════════════════════════════════
--  017: Dars mavzusi va uyga vazifa moduli
--  O'qituvchi o'z guruhi (dars_jadvali) uchun har bir dars kunida
--  mavzu va uyga vazifa yozadi; o'quvchi buni o'z panelida ko'rib,
--  javob (matn/fayl) yuboradi; o'qituvchi javobni tekshirib baholaydi.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. DARS MAVZULARI VA UYGA VAZIFALAR ─────────────────────────────────────
--  Bitta guruhning (dars_jadvali) bitta dars kunidagi mavzu/vazifa yozuvi.
--  Davomat bilan bir xil mantiq: guruh_id + sana bo'yicha bitta yozuv.
CREATE TABLE IF NOT EXISTS dars_mavzulari (
    id           SERIAL PRIMARY KEY,
    guruh_id     INTEGER NOT NULL REFERENCES dars_jadvali(id) ON DELETE CASCADE,
    maktab_id    INTEGER REFERENCES maktablar(id) ON DELETE SET NULL,
    sana         TEXT    NOT NULL,             -- dars sanasi (YYYY-MM-DD)
    mavzu        TEXT    DEFAULT '',            -- bugungi dars mavzusi
    uy_vazifasi  TEXT    DEFAULT '',            -- uyga vazifa matni
    vazifa_fayl  TEXT    DEFAULT '',            -- o'qituvchi biriktirgan fayl (ixtiyoriy)
    muddat       TEXT    DEFAULT '',            -- topshirish muddati (ixtiyoriy, YYYY-MM-DD)
    yaratilgan   TEXT    DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY HH24:MI'),
    yangilangan  TEXT    DEFAULT '',
    UNIQUE(guruh_id, sana)
);

CREATE INDEX IF NOT EXISTS idx_dars_mavzulari_guruh   ON dars_mavzulari (guruh_id);
CREATE INDEX IF NOT EXISTS idx_dars_mavzulari_maktab   ON dars_mavzulari (maktab_id);


-- ─── 2. VAZIFA JAVOBLARI ──────────────────────────────────────────────────────
--  O'quvchining bitta uyga vazifaga yuborgan javobi (matn va/yoki fayl)
--  hamda o'qituvchining baho/izohi.
CREATE TABLE IF NOT EXISTS vazifa_javoblari (
    id                SERIAL PRIMARY KEY,
    vazifa_id         INTEGER NOT NULL REFERENCES dars_mavzulari(id) ON DELETE CASCADE,
    oquvchi_id        INTEGER NOT NULL REFERENCES oquvchilar(id)     ON DELETE CASCADE,
    javob_matn        TEXT    DEFAULT '',
    javob_fayl        TEXT    DEFAULT '',
    yuborilgan_vaqt   TEXT    DEFAULT '',
    holat             TEXT    NOT NULL DEFAULT 'yuborilgan',  -- yuborilgan / tekshirilgan
    baho              INTEGER,                                -- masalan 1–5
    oqituvchi_izohi   TEXT    DEFAULT '',
    baholangan_vaqt   TEXT    DEFAULT '',
    UNIQUE(vazifa_id, oquvchi_id)
);

CREATE INDEX IF NOT EXISTS idx_vazifa_javoblari_vazifa  ON vazifa_javoblari (vazifa_id);
CREATE INDEX IF NOT EXISTS idx_vazifa_javoblari_oquvchi ON vazifa_javoblari (oquvchi_id);
CREATE INDEX IF NOT EXISTS idx_vazifa_javoblari_holat   ON vazifa_javoblari (holat);
