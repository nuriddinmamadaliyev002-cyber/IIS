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
--  ⚠️ Bir telegram_id BIR NECHTA rolga bog'lanishi mumkin (masalan bir kishi
--     ham buxgalter, ham sales bo'lishi mumkin) — shuning uchun unikallik
--     (telegram_id, rol) juftligi bo'yicha, yolg'iz telegram_id bo'yicha emas.
CREATE TABLE IF NOT EXISTS telegram_users (
    id            SERIAL PRIMARY KEY,
    telegram_id   BIGINT  NOT NULL,
    telegram_ism  TEXT,
    rol           TEXT    NOT NULL,                  -- admin / oqituvchi / oquvchi / buxgalter / sales
    entity_id     INTEGER NOT NULL,                  -- tegishli jadvalda ID
    entity_table  TEXT    NOT NULL,                  -- jadval nomi
    biriktirilgan TEXT    DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY'),
    UNIQUE (telegram_id, rol)
);

-- Eski bazalarda telegram_id ustunidagi yagona UNIQUE cheklovni composite bilan almashtirish
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'telegram_users_telegram_id_key'
  ) THEN
    ALTER TABLE telegram_users DROP CONSTRAINT telegram_users_telegram_id_key;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'telegram_users_telegram_id_rol_key'
  ) THEN
    ALTER TABLE telegram_users ADD CONSTRAINT telegram_users_telegram_id_rol_key UNIQUE (telegram_id, rol);
  END IF;
END $$;


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
    qaydnoma       TEXT    DEFAULT '',              -- sales xodimining qo'ng'iroq eslatmasi
    gaplashilgan_vaqt TIMESTAMP,                     -- mijoz bilan gaplashilgan vaqt
    manba          TEXT    DEFAULT 'sayt',
    holat          TEXT    NOT NULL DEFAULT 'yangi'
                     CHECK (holat IN ('yangi', 'boglanildi', 'royxatga_olindi', 'bekor_qilindi')),
    biriktirilgan  INTEGER REFERENCES sales_xodimlar(id) ON DELETE SET NULL,
    shartnoma_korilgan       BOOLEAN NOT NULL DEFAULT FALSE, -- "shartnoma bilan tanishib chiqdim" checkboxi
    shartnoma_korilgan_vaqt  TIMESTAMP,                      -- checkbox belgilangan vaqt
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
ALTER TABLE leadlar ADD COLUMN IF NOT EXISTS qaydnoma         TEXT DEFAULT ''; -- sales xodimining qo'ng'iroq eslatmasi
ALTER TABLE leadlar ADD COLUMN IF NOT EXISTS gaplashilgan_vaqt TIMESTAMP; -- mijoz bilan gaplashilgan vaqt
ALTER TABLE leadlar ADD COLUMN IF NOT EXISTS shartnoma_korilgan      BOOLEAN NOT NULL DEFAULT FALSE; -- "shartnoma bilan tanishib chiqdim" checkboxi
ALTER TABLE leadlar ADD COLUMN IF NOT EXISTS shartnoma_korilgan_vaqt TIMESTAMP; -- checkbox belgilangan vaqt


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


-- ─── 23. BLOG KATEGORIYALARI ───────────────────────────────────────────────────
--  innovateitschool.uz (ochiq blog sayti) uchun jadvallar.
--  Boshqaruv: faqat superadmin (new.innovateitschool.uz CRM paneli ichidan).
CREATE TABLE IF NOT EXISTS blog_categories (
    id         SERIAL PRIMARY KEY,
    nomi       TEXT NOT NULL UNIQUE,          -- "Yangiliklar", "O'quvchilar yutuqlari"...
    slug       TEXT NOT NULL UNIQUE,          -- "yangiliklar" (URL uchun)
    tavsif     TEXT DEFAULT '',
    tartib     INTEGER DEFAULT 0,             -- ko'rsatish tartibi
    yaratilgan TIMESTAMP DEFAULT NOW()
);


-- ─── 24. BLOG POSTLARI ──────────────────────────────────────────────────────────
--  muqova_pozitsiya / muqova_masshtab — muqova rasmning fokus nuqtasi va zoomi
--  galereya — postning to'liq sahifasida ko'rsatiladigan qo'shimcha rasmlar (JSONB massiv)
CREATE TABLE IF NOT EXISTS blog_posts (
    id                SERIAL PRIMARY KEY,
    sarlavha          TEXT NOT NULL,                        -- title
    slug              TEXT NOT NULL UNIQUE,                 -- URL: /post/shu-slug
    qisqacha          TEXT DEFAULT '',                       -- excerpt / preview matni
    kontent           TEXT NOT NULL,                          -- HTML/Markdown asosiy matn
    muqova_rasm       TEXT DEFAULT '',                        -- cover image (uploads/... yoki URL)
    muqova_pozitsiya  INTEGER NOT NULL DEFAULT 50
                        CHECK (muqova_pozitsiya BETWEEN 0 AND 100),
    muqova_masshtab   INTEGER NOT NULL DEFAULT 100
                        CHECK (muqova_masshtab BETWEEN 100 AND 250),
    kategoriya_id     INTEGER REFERENCES blog_categories(id) ON DELETE SET NULL,
    muallif           TEXT DEFAULT 'Innovate IT School',
    holat             TEXT NOT NULL DEFAULT 'qoralama'        -- 'qoralama' | 'chop_etilgan'
                        CHECK (holat IN ('qoralama', 'chop_etilgan')),
    korishlar         INTEGER DEFAULT 0,                       -- views soni
    seo_tavsif        TEXT DEFAULT '',                         -- meta description
    chop_vaqti        TIMESTAMP,                                -- published_at (chop etilgan vaqt)
    galereya          JSONB NOT NULL DEFAULT '[]'::jsonb,      -- qo'shimcha rasmlar: ["rasm1.jpg","rasm2.jpg"]
    yaratilgan        TIMESTAMP DEFAULT NOW(),
    yangilangan       TIMESTAMP DEFAULT NOW()
);


-- ─── 25. BLOG TEGLARI (ixtiyoriy, kelajakda kengaytirish uchun) ──────────────────
CREATE TABLE IF NOT EXISTS blog_tags (
    id   SERIAL PRIMARY KEY,
    nomi TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS blog_post_tags (
    post_id INTEGER REFERENCES blog_posts(id) ON DELETE CASCADE,
    tag_id  INTEGER REFERENCES blog_tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
);

-- ─── 25.1 Eski (mavjud) bazalar uchun idempotent yangilanish ──────────────────
--  Agar blog_posts jadvali avvalroq (002 migratsiyasi bilan, 003/004/009'siz)
--  yaratilgan bo'lsa, quyidagi qatorlar yetishmayotgan ustunlarni xavfsiz
--  qo'shib qo'yadi — har bir deployda qayta ishga tushirsa ham xato bermaydi.
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS muqova_pozitsiya INTEGER NOT NULL DEFAULT 50
  CHECK (muqova_pozitsiya BETWEEN 0 AND 100);
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS muqova_masshtab INTEGER NOT NULL DEFAULT 100
  CHECK (muqova_masshtab BETWEEN 100 AND 250);
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS galereya JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ─── Boshlang'ich kategoriyalar (mavjud bo'lmasa qo'shiladi) ────────────────────
INSERT INTO blog_categories (nomi, slug, tavsif, tartib) VALUES
    ('Yangiliklar',            'yangiliklar',            'Maktab va tashkilot yangiliklari', 1),
    ('O''quvchilar yutuqlari', 'oquvchilar-yutuqlari',   'Olimpiada va boshqa yutuqlar',      2),
    ('IT darslar',             'it-darslar',             'Dasturlash va texnologiya darslari', 3),
    ('Ota-onalar uchun',       'ota-onalar-uchun',       'Maslahat va foydali maqolalar',     4)
ON CONFLICT (slug) DO NOTHING;


-- ─── 26. TELEGRAM KANDIDATLAR ──────────────────────────────────────────────────
--  Botga /start yozgan har bir foydalanuvchi shu yerga yoziladi (id, ism, username).
--  Superadmin buxgalter/admin biriktirishda ID'ni qo'lda kiritish o'rniga shu
--  ro'yxatdan tanlashi mumkin bo'ladi. Guruhga a'zolik endi TALAB QILINMAYDI.
CREATE TABLE IF NOT EXISTS telegram_kandidatlar (
    telegram_id       BIGINT PRIMARY KEY,
    telegram_ism      TEXT,
    telegram_username TEXT,
    oxirgi_faollik    TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

-- blog
CREATE INDEX IF NOT EXISTS idx_blog_posts_holat        ON blog_posts(holat);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug         ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_kategoriya   ON blog_posts(kategoriya_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_chopvaqti    ON blog_posts(chop_vaqti DESC);


-- ════════════════════════════════════════════════════════════════════════════
--  MUVAFFAQIYATLI TUGADI
--  Barcha 25 ta jadval yaratildi
-- ════════════════════════════════════════════════════════════════════════════
\echo '✅ IIS schema muvaffaqiyatli yaratildi!'
\echo '   Jadvallar: maktablar, adminlar, buxgalterlar, oquvchilar,'
\echo '              nofaol_oquvchilar, davomat, oqituvchilar,'
\echo '              oqituvchi_maktablar, oqituvchilar_davomat,'
\echo '              dars_jadvali, buxgalter_maktablar, tolovlar,'
\echo '              portfolio_viewers, oqituvchi_portfolio,'
\echo '              oqituvchi_sertifikat_fayllar, viewer_teachers,'
\echo '              telegram_users, anketa_sorovlar, oqituvchi_oquvchilar,'
\echo '              sales_xodimlar, leadlar, sales_maktablar,'
\echo '              blog_categories, blog_posts, blog_tags, blog_post_tags'