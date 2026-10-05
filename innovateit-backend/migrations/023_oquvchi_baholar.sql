-- ═══════════════════════════════════════════════════════════════════
--  023: O'quvchilarni baholash (dars kuni bo'yicha 1–5 ball)
--  O'qituvchi o'z guruhidagi har bir o'quvchiga har dars kunida
--  3 ta kategoriya bo'yicha ball qo'yadi: uyga vazifa, darsdagi
--  faolligi, darsdagi xulqi. Izoh ixtiyoriy.
--  Bog'lanish oquvchi_id orqali (ism matni orqali emas).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oquvchi_baholar (
    id            SERIAL PRIMARY KEY,
    guruh_id      INTEGER NOT NULL REFERENCES dars_jadvali(id) ON DELETE CASCADE,
    maktab_id     INTEGER REFERENCES maktablar(id)   ON DELETE SET NULL,
    oquvchi_id    INTEGER NOT NULL REFERENCES oquvchilar(id) ON DELETE CASCADE,
    sana          TEXT    NOT NULL,                       -- dars sanasi (YYYY-MM-DD)
    kategoriya    TEXT    NOT NULL
                  CHECK (kategoriya IN ('uy_vazifa', 'faollik', 'xulq')),
    baho          SMALLINT NOT NULL CHECK (baho BETWEEN 1 AND 5),
    izoh          TEXT    NOT NULL DEFAULT '',            -- ixtiyoriy izoh
    baholagan_id  INTEGER REFERENCES oqituvchilar(id) ON DELETE SET NULL,
    yaratilgan    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    yangilangan   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (guruh_id, oquvchi_id, sana, kategoriya)
);

CREATE INDEX IF NOT EXISTS idx_oquvchi_baholar_guruh_sana ON oquvchi_baholar (guruh_id, sana);
CREATE INDEX IF NOT EXISTS idx_oquvchi_baholar_oquvchi    ON oquvchi_baholar (oquvchi_id, sana);
