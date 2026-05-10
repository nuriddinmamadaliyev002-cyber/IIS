-- ═══════════════════════════════════════════════════════════════════════════
--  InnovateIT School — PostgreSQL Schema (FINAL, TO'LIQ TOZALANGAN)
--
--  Yangi server uchun: psql -d innovateit -f schema.sql
--  Mavjud server uchun: avval backup, keyin cleanup.sql
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. MAKTABLAR ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maktablar (
    id         SERIAL PRIMARY KEY,
    nomi       TEXT NOT NULL UNIQUE,
    yaratilgan TEXT DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY')
);


-- ─── 2. ADMINLAR ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS adminlar (
    id          SERIAL PRIMARY KEY,
    ism         TEXT    NOT NULL,
    familiya    TEXT    NOT NULL DEFAULT '',
    maktab_id   INTEGER REFERENCES maktablar(id) ON DELETE SET NULL,
    telegram_id BIGINT  UNIQUE,
    username    TEXT    UNIQUE,
    parol       TEXT,
    yaratilgan  TEXT    DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY')
);


-- ─── 3. BUXGALTERLAR ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS buxgalterlar (
    id          SERIAL PRIMARY KEY,
    ism         TEXT   NOT NULL,
    familiya    TEXT   NOT NULL DEFAULT '',
    telegram_id BIGINT UNIQUE,
    yaratilgan  TEXT   DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY')
);


-- ─── 4. FAOL O'QUVCHILAR ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oquvchilar (
    id          SERIAL PRIMARY KEY,
    ism         TEXT    NOT NULL,
    familiya    TEXT    NOT NULL,
    maktab_id   INTEGER REFERENCES maktablar(id) ON DELETE SET NULL,
    maktab_info TEXT    DEFAULT '',
    sinf        TEXT,
    telefon     TEXT,
    telefon2    TEXT,
    tug         TEXT,
    manzil      TEXT,
    qoshilgan   TEXT,
    boshlagan   TEXT,
    telegram_id BIGINT UNIQUE
);


-- ─── 5. NOFAOL O'QUVCHILAR ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nofaol_oquvchilar (
    id          SERIAL PRIMARY KEY,
    ism         TEXT NOT NULL,
    familiya    TEXT NOT NULL,
    maktab_id   INTEGER REFERENCES maktablar(id) ON DELETE SET NULL,
    sinf        TEXT,
    telefon     TEXT,
    telefon2    TEXT,
    tug         TEXT,
    manzil      TEXT,
    qoshilgan   TEXT,
    boshlagan   TEXT,
    chiqgan     TEXT,
    izoh        TEXT DEFAULT ''
);


-- ─── 6. O'QUVCHILAR DAVOMATI ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS davomat (
    id               SERIAL PRIMARY KEY,
    sana             TEXT    NOT NULL,
    maktab_id        INTEGER REFERENCES maktablar(id) ON DELETE SET NULL,
    sinf             TEXT,
    oquvchi_ism      TEXT,
    status           TEXT,
    izoh             TEXT,
    vaqt_belgilangan TEXT
);


-- ─── 7. O'QITUVCHILAR ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oqituvchilar (
    id          SERIAL PRIMARY KEY,
    ism         TEXT NOT NULL,
    familiya    TEXT NOT NULL,
    fan         TEXT,
    telefon     TEXT,
    telefon2    TEXT,
    kunlar      TEXT,
    sinflar     TEXT,
    boshlanish  TEXT,
    tugash      TEXT,
    qoshilgan   TEXT,
    telegram_id BIGINT UNIQUE
);


-- ─── 8. O'QITUVCHI — MAKTAB (many-to-many) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS oqituvchi_maktablar (
    id             SERIAL PRIMARY KEY,
    oqituvchi_id   INTEGER NOT NULL REFERENCES oqituvchilar(id) ON DELETE CASCADE,
    maktab_id      INTEGER NOT NULL REFERENCES maktablar(id)    ON DELETE CASCADE,
    biriktirilgan  TEXT DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY'),
    UNIQUE(oqituvchi_id, maktab_id)
);


-- ─── 9. O'QITUVCHILAR DAVOMATI ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oqituvchilar_davomat (
    id               SERIAL PRIMARY KEY,
    sana             TEXT    NOT NULL,
    maktab_id        INTEGER REFERENCES maktablar(id) ON DELETE SET NULL,
    oqituvchi_ism    TEXT,
    fan              TEXT,
    status           TEXT,
    izoh             TEXT,
    vaqt_belgilangan TEXT,
    dars_soat        INTEGER DEFAULT 0,
    dars_daqiqa      INTEGER DEFAULT 0,
    kech_minut       INTEGER DEFAULT 0
);


-- ─── 10. DARS JADVALI ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dars_jadvali (
    id               SERIAL PRIMARY KEY,
    maktab_id        INTEGER REFERENCES maktablar(id) ON DELETE SET NULL,
    teacher_ism      TEXT NOT NULL,
    teacher_familiya TEXT NOT NULL,
    fan              TEXT,
    sinflar          TEXT,
    kunlar           TEXT,
    boshlanish       TEXT,
    tugash           TEXT
);


-- ─── 11. BUXGALTER — MAKTAB (many-to-many) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS buxgalter_maktablar (
    id            SERIAL PRIMARY KEY,
    buxgalter_id  INTEGER NOT NULL REFERENCES buxgalterlar(id) ON DELETE CASCADE,
    maktab_id     INTEGER NOT NULL REFERENCES maktablar(id)    ON DELETE CASCADE,
    biriktirilgan TEXT DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY'),
    UNIQUE(buxgalter_id, maktab_id)
);


-- ─── 12. OYLIK TO'LOVLAR ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tolovlar (
    id                SERIAL PRIMARY KEY,
    oy                TEXT    NOT NULL,
    oquvchi_id        INTEGER REFERENCES oquvchilar(id) ON DELETE SET NULL,
    oquvchi_ism       TEXT    NOT NULL,
    oquvchi_familiya  TEXT    NOT NULL,
    maktab_id         INTEGER REFERENCES maktablar(id) ON DELETE SET NULL,
    sinf              TEXT    DEFAULT '',
    telefon           TEXT    DEFAULT '',
    tarif             INTEGER DEFAULT 0,
    qaydnoma          TEXT    DEFAULT '',
    gaplashilgan_vaqt TEXT    DEFAULT '',
    tolov_kerak       INTEGER DEFAULT 0,
    tolov_qildi       INTEGER DEFAULT 0,
    tolov_sanasi      TEXT    DEFAULT '',
    kvitansiya_fayl   TEXT    DEFAULT '',
    yangilangan       TEXT    DEFAULT '',
    UNIQUE(oy, oquvchi_id)
);


-- ─── 13. PORTFOLIO KO'RUVCHILAR ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolio_viewers (
    id         SERIAL PRIMARY KEY,
    ism        TEXT NOT NULL,
    username   TEXT NOT NULL UNIQUE,
    parol      TEXT NOT NULL,
    yaratilgan TEXT DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY')
);


-- ─── 14. O'QITUVCHI PORTFOLIO (1:1) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oqituvchi_portfolio (
    id            SERIAL PRIMARY KEY,
    oqituvchi_id  INTEGER NOT NULL REFERENCES oqituvchilar(id) ON DELETE CASCADE,
    fish          TEXT DEFAULT '',
    universitet   TEXT DEFAULT '',
    sertifikatlar TEXT DEFAULT '',
    ish_tajribasi TEXT DEFAULT '',
    yangilangan   TEXT DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY'),
    display_order INTEGER,
    avatar        TEXT DEFAULT '',
    UNIQUE(oqituvchi_id)
);


-- ─── 15. O'QITUVCHI SERTIFIKAT FAYLLARI ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS oqituvchi_sertifikat_fayllar (
    id           SERIAL PRIMARY KEY,
    oqituvchi_id INTEGER NOT NULL REFERENCES oqituvchilar(id) ON DELETE CASCADE,
    fayl_nomi    TEXT NOT NULL,
    asl_nomi     TEXT DEFAULT '',
    yuklangan    TEXT DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY')
);


-- ─── 16. VIEWER — O'QITUVCHI BIRIKTIRISH ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS viewer_teachers (
    id              SERIAL PRIMARY KEY,
    viewer_username TEXT    NOT NULL,
    teacher_id      INTEGER NOT NULL REFERENCES oqituvchilar(id) ON DELETE CASCADE,
    biriktirilgan   TEXT    DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY'),
    UNIQUE(viewer_username, teacher_id)
);


-- ─── 17. TELEGRAM FOYDALANUVCHILAR ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_users (
    id            SERIAL PRIMARY KEY,
    telegram_id   BIGINT  NOT NULL UNIQUE,
    telegram_ism  TEXT,
    rol           TEXT    NOT NULL,
    entity_id     INTEGER NOT NULL,
    entity_table  TEXT    NOT NULL,
    biriktirilgan TEXT    DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY')
);


-- ─── 18. ANKETA SO'ROVLAR ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anketa_sorovlar (
    id           SERIAL PRIMARY KEY,
    telegram_id  BIGINT NOT NULL UNIQUE,
    telegram_ism TEXT,
    pozitsiya    TEXT,
    fish         TEXT,
    maktablar    TEXT,
    sinf         TEXT,
    telefon      TEXT,
    holat        TEXT DEFAULT 'kutilmoqda',
    yuborilgan   TEXT DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY HH24:MI')
);


-- ═══════════════════════════════════════════════════════════════════════════
--  RUXSATLAR
-- ═══════════════════════════════════════════════════════════════════════════
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO innovateit_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO innovateit_user;
GRANT USAGE ON SCHEMA public TO innovateit_user;


-- ═══════════════════════════════════════════════════════════════════════════
--  INDEKSLAR
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_adminlar_maktabid         ON adminlar(maktab_id);
CREATE INDEX IF NOT EXISTS idx_adminlar_tgid             ON adminlar(telegram_id);
CREATE INDEX IF NOT EXISTS idx_buxgalterlar_tgid         ON buxgalterlar(telegram_id);
CREATE INDEX IF NOT EXISTS idx_buxmak_buxid              ON buxgalter_maktablar(buxgalter_id);
CREATE INDEX IF NOT EXISTS idx_buxmak_maktabid           ON buxgalter_maktablar(maktab_id);
CREATE INDEX IF NOT EXISTS idx_oquvchilar_maktab_id      ON oquvchilar(maktab_id);
CREATE INDEX IF NOT EXISTS idx_oquvchilar_tgid           ON oquvchilar(telegram_id);
CREATE INDEX IF NOT EXISTS idx_nofaol_maktab_id          ON nofaol_oquvchilar(maktab_id);
CREATE INDEX IF NOT EXISTS idx_davomat_maktab_id         ON davomat(maktab_id);
CREATE INDEX IF NOT EXISTS idx_oqitdavomat_maktab_id     ON oqituvchilar_davomat(maktab_id);
CREATE INDEX IF NOT EXISTS idx_oqituvchilar_tgid         ON oqituvchilar(telegram_id);
CREATE INDEX IF NOT EXISTS idx_oqitmak_oqitid            ON oqituvchi_maktablar(oqituvchi_id);
CREATE INDEX IF NOT EXISTS idx_oqitmak_maktabid          ON oqituvchi_maktablar(maktab_id);
CREATE INDEX IF NOT EXISTS idx_dars_jadvali_maktab_id    ON dars_jadvali(maktab_id);
CREATE INDEX IF NOT EXISTS idx_tolovlar_maktab_id        ON tolovlar(maktab_id);
CREATE INDEX IF NOT EXISTS idx_tolovlar_oy               ON tolovlar(oy);
CREATE INDEX IF NOT EXISTS idx_tolovlar_oquvchi          ON tolovlar(oquvchi_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_teacher         ON oqituvchi_portfolio(oqituvchi_id);
CREATE INDEX IF NOT EXISTS idx_sert_teacher              ON oqituvchi_sertifikat_fayllar(oqituvchi_id);
CREATE INDEX IF NOT EXISTS idx_pviewer_username          ON portfolio_viewers(username);
CREATE INDEX IF NOT EXISTS idx_vt_viewer                 ON viewer_teachers(viewer_username);
CREATE INDEX IF NOT EXISTS idx_vt_teacher                ON viewer_teachers(teacher_id);
CREATE INDEX IF NOT EXISTS idx_tgusers_tgid              ON telegram_users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_tgusers_entity            ON telegram_users(entity_table, entity_id);
CREATE INDEX IF NOT EXISTS idx_anketa_tgid               ON anketa_sorovlar(telegram_id);
CREATE INDEX IF NOT EXISTS idx_anketa_holat              ON anketa_sorovlar(holat);
-- ─── O'qituvchi ↔ O'quvchi biriktirish (many-to-many) ─────────────────────────
CREATE TABLE IF NOT EXISTS oqituvchi_oquvchilar (
  id            SERIAL PRIMARY KEY,
  oqituvchi_id  INTEGER NOT NULL REFERENCES oqituvchilar(id) ON DELETE CASCADE,
  oquvchi_id    INTEGER NOT NULL REFERENCES oquvchilar(id)   ON DELETE CASCADE,
  biriktirilgan TEXT    DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY'),
  UNIQUE(oqituvchi_id, oquvchi_id)
);

CREATE INDEX IF NOT EXISTS idx_oqit_oquv_teacher ON oqituvchi_oquvchilar(oqituvchi_id);
CREATE INDEX IF NOT EXISTS idx_oqit_oquv_student ON oqituvchi_oquvchilar(oquvchi_id);