-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║         InnovateIT School — PostgreSQL FULL SETUP SCHEMA                   ║
-- ║                                                                            ║
-- ║  Bu fayl yangi serverda bazani noldan sozlaydi.                            ║
-- ║                                                                            ║
-- ║  ISHLATISH TARTIBI:                                                        ║
-- ║                                                                            ║
-- ║  1) PostgreSQL serverga super-user sifatida kiring:                        ║
-- ║       sudo -u postgres psql                                                ║
-- ║                                                                            ║
-- ║  2) Foydalanuvchi va bazani yarating (birinchi marta):                     ║
-- ║       CREATE USER iis_user WITH PASSWORD 'IIS_2026_Strong!';                    ║
-- ║       CREATE DATABASE iis_db OWNER iis_user;                    ║
-- ║       \q                                                                   ║
-- ║                                                                            ║
-- ║  3) Ushbu faylni ishga tushiring:                                          ║
-- ║       psql -U iis_user -d iis_db -f innovateit_schema_setup.sql ║
-- ║                                                                            ║
-- ║  Natija: barcha jadvallar, indekslar va ruxsatlar tayyor bo'ladi.          ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝


-- ════════════════════════════════════════════════════════════════════════════
--  XAVFSIZLIK: Agar jadvallar avval mavjud bo'lsa ham xatolik chiqmaydi
--  (IF NOT EXISTS ishlatilgan hamma joyda)
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. MAKTABLAR ────────────────────────────────────────────────────────────
--  O'quv markazlari / maktablar ro'yxati
CREATE TABLE IF NOT EXISTS maktablar (
    id         SERIAL PRIMARY KEY,
    nomi       TEXT NOT NULL UNIQUE,
    yaratilgan TEXT DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY')
);


-- ─── 2. ADMINLAR ─────────────────────────────────────────────────────────────
--  Har bir maktabning admin foydalanuvchilari
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
--  Moliya bo'limi xodimlari
CREATE TABLE IF NOT EXISTS buxgalterlar (
    id          SERIAL PRIMARY KEY,
    ism         TEXT   NOT NULL,
    familiya    TEXT   NOT NULL DEFAULT '',
    username    TEXT   UNIQUE,
    parol       TEXT,
    telegram_id BIGINT UNIQUE,
    yaratilgan  TEXT   DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY')
);


-- ─── 4. FAOL O'QUVCHILAR ─────────────────────────────────────────────────────
--  Hozirda o'qiyotgan o'quvchilar
CREATE TABLE IF NOT EXISTS oquvchilar (
    id          SERIAL PRIMARY KEY,
    ism         TEXT    NOT NULL,
    familiya    TEXT    NOT NULL,
    maktab_id   INTEGER REFERENCES maktablar(id) ON DELETE SET NULL,
    maktab_info TEXT    DEFAULT '',
    sinf        TEXT,
    telefon     TEXT,
    telefon2    TEXT,
    tug         TEXT,       -- tug'ilgan sana
    manzil      TEXT,
    qoshilgan   TEXT,       -- qo'shilgan sana
    boshlagan   TEXT,       -- o'qishni boshlagan sana
    telegram_id BIGINT UNIQUE
);


-- ─── 5. NOFAOL O'QUVCHILAR ───────────────────────────────────────────────────
--  Ketgan / to'xtatgan o'quvchilar arxivi
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
    chiqgan     TEXT,       -- o'qishni to'xtatgan sana
    izoh        TEXT DEFAULT ''
);


-- ─── 6. O'QUVCHILAR DAVOMATI ─────────────────────────────────────────────────
--  Kunlik o'quvchi davomat yozuvlari
CREATE TABLE IF NOT EXISTS davomat (
    id               SERIAL PRIMARY KEY,
    sana             TEXT    NOT NULL,
    maktab_id        INTEGER REFERENCES maktablar(id) ON DELETE SET NULL,
    sinf             TEXT,
    oquvchi_ism      TEXT,
    status           TEXT,   -- keldi / kelmadi / kech
    izoh             TEXT,
    vaqt_belgilangan TEXT
);


-- ─── 7. O'QITUVCHILAR ────────────────────────────────────────────────────────
--  O'qituvchilar ma'lumotlari
CREATE TABLE IF NOT EXISTS oqituvchilar (
    id          SERIAL PRIMARY KEY,
    ism         TEXT NOT NULL,
    familiya    TEXT NOT NULL,
    fan         TEXT,
    telefon     TEXT,
    telefon2    TEXT,
    kunlar      TEXT,       -- dars kunlari (JSON yoki vergul bilan)
    sinflar     TEXT,       -- o'qitiladigan sinflar
    boshlanish  TEXT,       -- dars boshlanish vaqti
    tugash      TEXT,       -- dars tugash vaqti
    qoshilgan   TEXT,
    telegram_id BIGINT UNIQUE
);


-- ─── 8. O'QITUVCHI — MAKTAB (many-to-many) ───────────────────────────────────
--  Bir o'qituvchi bir nechta maktabda ishlashi mumkin
CREATE TABLE IF NOT EXISTS oqituvchi_maktablar (
    id             SERIAL PRIMARY KEY,
    oqituvchi_id   INTEGER NOT NULL REFERENCES oqituvchilar(id) ON DELETE CASCADE,
    maktab_id      INTEGER NOT NULL REFERENCES maktablar(id)    ON DELETE CASCADE,
    admin_username TEXT,   -- qaysi admin biriktirgan (nullable)
    biriktirilgan  TEXT    DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY'),
    UNIQUE(oqituvchi_id, maktab_id)
);


-- ─── 9. O'QITUVCHILAR DAVOMATI ───────────────────────────────────────────────
--  Kunlik o'qituvchi davomat yozuvlari
CREATE TABLE IF NOT EXISTS oqituvchilar_davomat (
    id               SERIAL PRIMARY KEY,
    sana             TEXT    NOT NULL,
    maktab_id        INTEGER REFERENCES maktablar(id) ON DELETE SET NULL,
    oqituvchi_ism    TEXT,
    fan              TEXT,
    status           TEXT,   -- keldi / kelmadi / kech
    izoh             TEXT,
    vaqt_belgilangan TEXT,
    dars_soat        INTEGER DEFAULT 0,
    dars_daqiqa      INTEGER DEFAULT 0,
    kech_minut       INTEGER DEFAULT 0
);


-- ─── 10. DARS JADVALI ────────────────────────────────────────────────────────
--  Haftalik dars jadvali
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
--  Bir buxgalter bir nechta maktabni boshqarishi mumkin
CREATE TABLE IF NOT EXISTS buxgalter_maktablar (
    id            SERIAL PRIMARY KEY,
    buxgalter_id  INTEGER NOT NULL REFERENCES buxgalterlar(id) ON DELETE CASCADE,
    maktab_id     INTEGER NOT NULL REFERENCES maktablar(id)    ON DELETE CASCADE,
    biriktirilgan TEXT DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY'),
    UNIQUE(buxgalter_id, maktab_id)
);


-- ─── 12. OYLIK TO'LOVLAR ─────────────────────────────────────────────────────
--  O'quvchilarning oylik to'lov tarixi
CREATE TABLE IF NOT EXISTS tolovlar (
    id                SERIAL PRIMARY KEY,
    oy                     TEXT    NOT NULL,               -- masalan: '2026-05'
    oquvchi_id             INTEGER,                        -- ⚠️ FK yo'q (tolovlar_oquvchi_id_fkey DROP qilingan) — nofaol/o'chirilgan o'quvchilar tarixini saqlab qolish uchun
    oquvchi_ism            TEXT    NOT NULL,
    oquvchi_familiya       TEXT    NOT NULL,
    maktab_id              INTEGER REFERENCES maktablar(id) ON DELETE SET NULL,
    sinf                   TEXT    DEFAULT '',
    telefon                TEXT    DEFAULT '',
    tarif                  INTEGER DEFAULT 0,              -- oylik to'lov summasi
    qaydnoma               TEXT    DEFAULT '',
    gaplashilgan_vaqt      TEXT    DEFAULT '',
    tolov_kerak            INTEGER DEFAULT 0,              -- to'lanishi kerak bo'lgan summa
    tolov_qildi            INTEGER DEFAULT 0,              -- haqiqatda to'langan summa
    tolov_sanasi           TEXT    DEFAULT '',
    ehtimoliy_tolov_sanasi TEXT    DEFAULT '',             -- kelgusida to'lov qilinishi kutilayotgan sana
    kvitansiya_fayl        TEXT    DEFAULT '',             -- yuklangan kvitansiya fayli
    yangilangan            TEXT    DEFAULT '',
    UNIQUE(oy, oquvchi_id)
);


-- ─── 13. PORTFOLIO KO'RUVCHILAR ──────────────────────────────────────────────
--  Faqat portfolio ko'rish huquqiga ega foydalanuvchilar
CREATE TABLE IF NOT EXISTS portfolio_viewers (
    id         SERIAL PRIMARY KEY,
    ism        TEXT NOT NULL,
    username   TEXT NOT NULL UNIQUE,
    parol      TEXT NOT NULL,
    yaratilgan TEXT DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY')
);


-- ─── 14. O'QITUVCHI PORTFOLIO (1:1) ──────────────────────────────────────────
--  Har bir o'qituvchining portfolio ma'lumotlari
CREATE TABLE IF NOT EXISTS oqituvchi_portfolio (
    id            SERIAL PRIMARY KEY,
    oqituvchi_id  INTEGER NOT NULL REFERENCES oqituvchilar(id) ON DELETE CASCADE,
    fish          TEXT DEFAULT '',                   -- to'liq ism-familiya-sharif
    universitet   TEXT DEFAULT '',
    sertifikatlar TEXT DEFAULT '',
    ish_tajribasi TEXT DEFAULT '',
    yangilangan   TEXT DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY'),
    display_order INTEGER,
    avatar        TEXT DEFAULT '',                   -- avatar fayl nomi
    UNIQUE(oqituvchi_id)
);


-- ─── 15. O'QITUVCHI SERTIFIKAT FAYLLARI ──────────────────────────────────────
--  O'qituvchi portfoliosiga biriktirilgan sertifikat fayllari
CREATE TABLE IF NOT EXISTS oqituvchi_sertifikat_fayllar (
    id           SERIAL PRIMARY KEY,
    oqituvchi_id INTEGER NOT NULL REFERENCES oqituvchilar(id) ON DELETE CASCADE,
    fayl_nomi    TEXT NOT NULL,                      -- serverda saqlangan nomi
    asl_nomi     TEXT DEFAULT '',                    -- original fayl nomi
    yuklangan    TEXT DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY')
);


-- ─── 16. VIEWER — O'QITUVCHI BIRIKTIRISH ─────────────────────────────────────
--  Qaysi viewer qaysi o'qituvchini ko'ra oladi
CREATE TABLE IF NOT EXISTS viewer_teachers (
    id              SERIAL PRIMARY KEY,
    viewer_username TEXT    NOT NULL,
    teacher_id      INTEGER NOT NULL REFERENCES oqituvchilar(id) ON DELETE CASCADE,
    biriktirilgan   TEXT    DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY'),
    UNIQUE(viewer_username, teacher_id)
);


-- ─── 17. TELEGRAM FOYDALANUVCHILAR ───────────────────────────────────────────
--  Telegram bot orqali kirgan foydalanuvchilar
CREATE TABLE IF NOT EXISTS telegram_users (
    id            SERIAL PRIMARY KEY,
    telegram_id   BIGINT  NOT NULL UNIQUE,
    telegram_ism  TEXT,
    rol           TEXT    NOT NULL,                  -- admin / oqituvchi / oquvchi / buxgalter
    entity_id     INTEGER NOT NULL,                  -- tegishli jadvalda ID
    entity_table  TEXT    NOT NULL,                  -- jadval nomi
    biriktirilgan TEXT    DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY')
);


-- ─── 18. ANKETA SO'ROVLAR ────────────────────────────────────────────────────
--  Telegram bot orqali yuborilgan ariza / so'rovlar
CREATE TABLE IF NOT EXISTS anketa_sorovlar (
    id           SERIAL PRIMARY KEY,
    telegram_id  BIGINT NOT NULL UNIQUE,
    telegram_ism TEXT,
    pozitsiya    TEXT,                               -- o'qituvchi / o'quvchi
    fish         TEXT,
    maktablar    TEXT,
    sinf         TEXT,
    telefon      TEXT,
    holat        TEXT DEFAULT 'kutilmoqda',          -- kutilmoqda / qabul / rad
    yuborilgan   TEXT DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY HH24:MI')
);


-- ─── 19. O'QITUVCHI ↔ O'QUVCHI (many-to-many) ────────────────────────────────
--  Qaysi o'qituvchi qaysi o'quvchiga dars beradi
CREATE TABLE IF NOT EXISTS oqituvchi_oquvchilar (
    id            SERIAL PRIMARY KEY,
    oqituvchi_id  INTEGER NOT NULL REFERENCES oqituvchilar(id) ON DELETE CASCADE,
    oquvchi_id    INTEGER NOT NULL REFERENCES oquvchilar(id)   ON DELETE CASCADE,
    biriktirilgan TEXT    DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY'),
    UNIQUE(oqituvchi_id, oquvchi_id)
);


-- ─── 20. SALES XODIMLARI ──────────────────────────────────────────────────────
--  Sales bo'limi xodimlari — buxgalterlar bilan bir xil login patterni
CREATE TABLE IF NOT EXISTS sales_xodimlar (
    id          SERIAL PRIMARY KEY,
    ism         TEXT    NOT NULL,
    familiya    TEXT    NOT NULL DEFAULT '',
    username    TEXT    UNIQUE,
    parol       TEXT,
    telegram_id BIGINT  UNIQUE,
    yaratilgan  TEXT    DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY')
);


-- ─── 21. LEADLAR (ro'yxatdan o'tish murojaatlari) ─────────────────────────────
--  Ochiq "Ro'yxatdan o'tish" sahifasidan keladigan murojaatlar (public POST)
CREATE TABLE IF NOT EXISTS leadlar (
    id             SERIAL PRIMARY KEY,
    ism            TEXT    NOT NULL,
    telefon        TEXT    NOT NULL,
    telefon2       TEXT    DEFAULT '',
    oquvchi_familiya TEXT  DEFAULT '',
    oquvchi_ismi   TEXT    DEFAULT '',
    sinf           TEXT    DEFAULT '',
    maktab_id      INTEGER REFERENCES maktablar(id) ON DELETE SET NULL,
    hudud          TEXT    DEFAULT '',
    izoh           TEXT    DEFAULT '',
    manba          TEXT    DEFAULT 'sayt',
    holat          TEXT    NOT NULL DEFAULT 'yangi'
                     CHECK (holat IN ('yangi', 'boglanildi', 'royxatga_olindi', 'bekor_qilindi')),
    biriktirilgan  INTEGER REFERENCES sales_xodimlar(id) ON DELETE SET NULL,
    yaratilgan     TIMESTAMP DEFAULT NOW(),
    yangilangan    TIMESTAMP DEFAULT NOW()
);

-- ─── 21.1 Eski (mavjud) bazalar uchun idempotent yangilanish ──────────────────
--  CREATE TABLE IF NOT EXISTS jadval allaqachon bor bo'lsa, YUQORIDAGI ustunlar
--  ta'rifiga tegmaydi — shuning uchun mavjud productionlarni ham deploy.sh
--  orqali avtomatik yangilab turish uchun quyidagi qatorlar qo'shildi.
--  (Bir marta ishga tushirilgan migrations/007 bilan bir xil ma'noni bajaradi,
--   lekin bu yerda har bir deployda xavfsiz qayta ishga tushirsa bo'ladi.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'leadlar' AND column_name = 'farzand_ismi')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'leadlar' AND column_name = 'oquvchi_ismi') THEN
    ALTER TABLE leadlar RENAME COLUMN farzand_ismi TO oquvchi_ismi;
  END IF;
END $$;

ALTER TABLE leadlar ADD COLUMN IF NOT EXISTS oquvchi_familiya TEXT DEFAULT '';
ALTER TABLE leadlar ADD COLUMN IF NOT EXISTS telefon2         TEXT DEFAULT '';


-- ─── 22. SALES XODIMLARIGA MAKTAB BIRIKTIRISH ─────────────────────────────────
--  buxgalter_maktablar bilan bir xil patternda — sales xodimi qaysi
--  maktab(lar)ga biriktirilganini saqlaydi
CREATE TABLE IF NOT EXISTS sales_maktablar (
    id            SERIAL PRIMARY KEY,
    sales_id      INTEGER NOT NULL REFERENCES sales_xodimlar(id) ON DELETE CASCADE,
    maktab_id     INTEGER NOT NULL REFERENCES maktablar(id)      ON DELETE CASCADE,
    biriktirilgan TEXT DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY'),
    UNIQUE(sales_id, maktab_id)
);


-- ════════════════════════════════════════════════════════════════════════════
--  RUXSATLAR (GRANTS)
--  iis_user barcha jadvallarga to'liq kirish huquqiga ega bo'ladi
-- ════════════════════════════════════════════════════════════════════════════
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO iis_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO iis_user;
GRANT USAGE ON SCHEMA public TO iis_user;

-- Kelajakda qo'shiladigan jadval va sequence-lar uchun ham
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON TABLES    TO iis_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON SEQUENCES TO iis_user;


-- ════════════════════════════════════════════════════════════════════════════
--  INDEKSLAR (tez qidirish uchun)
-- ════════════════════════════════════════════════════════════════════════════

-- adminlar
CREATE INDEX IF NOT EXISTS idx_adminlar_maktabid       ON adminlar(maktab_id);
CREATE INDEX IF NOT EXISTS idx_adminlar_tgid           ON adminlar(telegram_id);
CREATE INDEX IF NOT EXISTS idx_adminlar_username       ON adminlar(username);

-- buxgalterlar
CREATE INDEX IF NOT EXISTS idx_buxgalterlar_tgid       ON buxgalterlar(telegram_id);

-- buxgalter_maktablar
CREATE INDEX IF NOT EXISTS idx_buxmak_buxid            ON buxgalter_maktablar(buxgalter_id);
CREATE INDEX IF NOT EXISTS idx_buxmak_maktabid         ON buxgalter_maktablar(maktab_id);

-- oquvchilar
CREATE INDEX IF NOT EXISTS idx_oquvchilar_maktab_id    ON oquvchilar(maktab_id);
CREATE INDEX IF NOT EXISTS idx_oquvchilar_tgid         ON oquvchilar(telegram_id);

-- nofaol_oquvchilar
CREATE INDEX IF NOT EXISTS idx_nofaol_maktab_id        ON nofaol_oquvchilar(maktab_id);

-- davomat
CREATE INDEX IF NOT EXISTS idx_davomat_maktab_id       ON davomat(maktab_id);
CREATE INDEX IF NOT EXISTS idx_davomat_sana            ON davomat(sana);

-- oqituvchilar
CREATE INDEX IF NOT EXISTS idx_oqituvchilar_tgid       ON oqituvchilar(telegram_id);

-- oqituvchi_maktablar
CREATE INDEX IF NOT EXISTS idx_oqitmak_oqitid          ON oqituvchi_maktablar(oqituvchi_id);
CREATE INDEX IF NOT EXISTS idx_oqitmak_maktabid        ON oqituvchi_maktablar(maktab_id);

-- oqituvchilar_davomat
CREATE INDEX IF NOT EXISTS idx_oqitdavomat_maktab_id   ON oqituvchilar_davomat(maktab_id);
CREATE INDEX IF NOT EXISTS idx_oqitdavomat_sana        ON oqituvchilar_davomat(sana);

-- dars_jadvali
CREATE INDEX IF NOT EXISTS idx_dars_jadvali_maktab_id  ON dars_jadvali(maktab_id);

-- tolovlar
CREATE INDEX IF NOT EXISTS idx_tolovlar_maktab_id      ON tolovlar(maktab_id);
CREATE INDEX IF NOT EXISTS idx_tolovlar_oy             ON tolovlar(oy);
CREATE INDEX IF NOT EXISTS idx_tolovlar_oquvchi        ON tolovlar(oquvchi_id);

-- portfolio
CREATE INDEX IF NOT EXISTS idx_portfolio_teacher       ON oqituvchi_portfolio(oqituvchi_id);
CREATE INDEX IF NOT EXISTS idx_sert_teacher            ON oqituvchi_sertifikat_fayllar(oqituvchi_id);

-- portfolio_viewers
CREATE INDEX IF NOT EXISTS idx_pviewer_username        ON portfolio_viewers(username);

-- viewer_teachers
CREATE INDEX IF NOT EXISTS idx_vt_viewer               ON viewer_teachers(viewer_username);
CREATE INDEX IF NOT EXISTS idx_vt_teacher              ON viewer_teachers(teacher_id);

-- telegram_users
CREATE INDEX IF NOT EXISTS idx_tgusers_tgid            ON telegram_users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_tgusers_entity          ON telegram_users(entity_table, entity_id);

-- anketa_sorovlar
CREATE INDEX IF NOT EXISTS idx_anketa_tgid             ON anketa_sorovlar(telegram_id);
CREATE INDEX IF NOT EXISTS idx_anketa_holat            ON anketa_sorovlar(holat);

-- oqituvchi_oquvchilar
CREATE INDEX IF NOT EXISTS idx_oqit_oquv_teacher       ON oqituvchi_oquvchilar(oqituvchi_id);
CREATE INDEX IF NOT EXISTS idx_oqit_oquv_student       ON oqituvchi_oquvchilar(oquvchi_id);

-- sales_xodimlar
CREATE INDEX IF NOT EXISTS idx_sales_username          ON sales_xodimlar(username);

-- leadlar
CREATE INDEX IF NOT EXISTS idx_leadlar_holat           ON leadlar(holat);
CREATE INDEX IF NOT EXISTS idx_leadlar_yaratilgan      ON leadlar(yaratilgan DESC);
CREATE INDEX IF NOT EXISTS idx_leadlar_biriktirilgan   ON leadlar(biriktirilgan);

-- sales_maktablar
CREATE INDEX IF NOT EXISTS idx_salesmak_salesid        ON sales_maktablar(sales_id);
CREATE INDEX IF NOT EXISTS idx_salesmak_maktabid       ON sales_maktablar(maktab_id);


-- ════════════════════════════════════════════════════════════════════════════
--  MUVAFFAQIYATLI TUGADI
--  Barcha 19 ta jadval yaratildi
-- ════════════════════════════════════════════════════════════════════════════
\echo '✅ IIS schema muvaffaqiyatli yaratildi!'
\echo '   Jadvallar: maktablar, adminlar, buxgalterlar, oquvchilar,'
\echo '              nofaol_oquvchilar, davomat, oqituvchilar,'
\echo '              oqituvchi_maktablar, oqituvchilar_davomat,'
\echo '              dars_jadvali, buxgalter_maktablar, tolovlar,'
\echo '              portfolio_viewers, oqituvchi_portfolio,'
\echo '              oqituvchi_sertifikat_fayllar, viewer_teachers,'
\echo '              telegram_users, anketa_sorovlar, oqituvchi_oquvchilar'