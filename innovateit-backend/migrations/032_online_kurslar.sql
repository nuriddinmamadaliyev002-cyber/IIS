-- ═══════════════════════════════════════════════════════════════════════════
--  032 — ONLINE KURSLAR (tashqi maktab o'qituvchilari uchun kurs + test + sertifikat)
--
--  • online_kurslar         — kurs va uning sozlamalari (o'tish bali, urinishlar,
--                             savollar soni, vaqt, sertifikatdagi direktor F.I.Sh.)
--  • kurs_adminlar          — kurs admini (superadmin yaratadi). Kirish: Telegram,
--                             taklif kodi orqali biriktiriladi.
--  • kurs_ishtirokchilar    — kursga biriktirilgan ishtirokchi (kurs admini qo'shadi).
--  • kurs_savollar          — test savollari (variantlar JSONB, to'g'ri javob indeksi)
--  • kurs_urinishlar        — test urinishlari (savol/variant tartibi va to'g'ri
--                             javoblar SERVERDA saqlanadi, brauzerga yuborilmaydi)
--  • kurs_sertifikatlar     — berilgan sertifikatlar (FIO va kurs nomi nusxasi)
--  • kurs_sertifikat_hisoblagich — yil bo'yicha ketma-ket raqam (atomik)
--
--  telegram_users: rol = 'kurs_admin' / 'kurs_ishtirokchi',
--                  entity_table = 'kurs_adminlar' / 'kurs_ishtirokchilar'
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS online_kurslar (
    id               SERIAL PRIMARY KEY,
    nomi             TEXT        NOT NULL,
    tavsif           TEXT        NOT NULL DEFAULT '',
    holat            TEXT        NOT NULL DEFAULT 'faol',      -- faol / yopiq
    -- ↓ kurs admini sozlaydi
    otish_foiz       INTEGER     NOT NULL DEFAULT 70  CHECK (otish_foiz BETWEEN 1 AND 100),
    urinish_limit    INTEGER     NOT NULL DEFAULT 3   CHECK (urinish_limit >= 1),
    savol_soni       INTEGER              DEFAULT NULL CHECK (savol_soni IS NULL OR savol_soni >= 1), -- NULL = barcha savollar
    vaqt_daqiqa      INTEGER     NOT NULL DEFAULT 30  CHECK (vaqt_daqiqa >= 0),                       -- 0 = cheklanmagan
    direktor_fio     TEXT        NOT NULL DEFAULT '',
    yaratilgan       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kurs_adminlar (
    id           SERIAL PRIMARY KEY,
    kurs_id      INTEGER NOT NULL REFERENCES online_kurslar(id) ON DELETE CASCADE,
    familiya     TEXT    NOT NULL DEFAULT '',
    ism          TEXT    NOT NULL,
    telefon      TEXT    NOT NULL DEFAULT '',
    taklif_kodi  TEXT    NOT NULL UNIQUE,
    yaratilgan   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kurs_adminlar_kurs ON kurs_adminlar(kurs_id);

CREATE TABLE IF NOT EXISTS kurs_ishtirokchilar (
    id              SERIAL PRIMARY KEY,
    kurs_id         INTEGER NOT NULL REFERENCES online_kurslar(id) ON DELETE CASCADE,
    familiya        TEXT    NOT NULL DEFAULT '',
    ism             TEXT    NOT NULL DEFAULT '',
    sharif          TEXT    NOT NULL DEFAULT '',
    telefon         TEXT    NOT NULL DEFAULT '',
    maktab_nomi     TEXT    NOT NULL DEFAULT '',
    fan             TEXT    NOT NULL DEFAULT '',
    taklif_kodi     TEXT    NOT NULL UNIQUE,
    profil_vaqti    TIMESTAMPTZ,                 -- ishtirokchi ma'lumotini tasdiqlagan vaqt
    qoshimcha_urinish INTEGER NOT NULL DEFAULT 0,        -- admin bergan qo'shimcha urinishlar
    yaratilgan      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE kurs_ishtirokchilar ADD COLUMN IF NOT EXISTS qoshimcha_urinish INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_kurs_ishtirokchilar_kurs ON kurs_ishtirokchilar(kurs_id);

CREATE TABLE IF NOT EXISTS kurs_savollar (
    id          SERIAL PRIMARY KEY,
    kurs_id     INTEGER NOT NULL REFERENCES online_kurslar(id) ON DELETE CASCADE,
    matn        TEXT    NOT NULL,
    variantlar  JSONB   NOT NULL,                -- ["A variant", "B variant", ...]
    togri       INTEGER NOT NULL,                -- variantlar ichidagi indeks (0 dan)
    tartib      INTEGER NOT NULL DEFAULT 0,
    yaratilgan  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kurs_savollar_kurs ON kurs_savollar(kurs_id, tartib);

CREATE TABLE IF NOT EXISTS kurs_urinishlar (
    id              SERIAL PRIMARY KEY,
    kurs_id         INTEGER NOT NULL REFERENCES online_kurslar(id) ON DELETE CASCADE,
    ishtirokchi_id  INTEGER NOT NULL REFERENCES kurs_ishtirokchilar(id) ON DELETE CASCADE,
    boshlangan      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    muddat          TIMESTAMPTZ,                 -- NULL = vaqt cheklanmagan
    tugagan         TIMESTAMPTZ,
    holat           TEXT    NOT NULL DEFAULT 'jarayonda',   -- jarayonda / tugagan
    tartib          JSONB   NOT NULL,            -- [{q:<savol id>, o:[variant indekslari tartibi], k:<to'g'ri indeks>}]
    javoblar        JSONB   NOT NULL DEFAULT '{}'::jsonb,   -- {"<savol id>": <tanlangan indeks>}
    togri_soni      INTEGER,
    jami            INTEGER,
    foiz            NUMERIC(5,2),
    otdi            BOOLEAN
);
CREATE INDEX IF NOT EXISTS idx_kurs_urinishlar_ish ON kurs_urinishlar(ishtirokchi_id);
CREATE INDEX IF NOT EXISTS idx_kurs_urinishlar_kurs ON kurs_urinishlar(kurs_id);

CREATE TABLE IF NOT EXISTS kurs_sertifikatlar (
    id              SERIAL PRIMARY KEY,
    kurs_id         INTEGER NOT NULL REFERENCES online_kurslar(id),            -- o'chirilmaydi: sertifikat bor kurs o'chirilmaydi
    ishtirokchi_id  INTEGER NOT NULL REFERENCES kurs_ishtirokchilar(id),
    urinish_id      INTEGER REFERENCES kurs_urinishlar(id) ON DELETE SET NULL,
    raqam           TEXT    NOT NULL UNIQUE,     -- IIS-2026-000123
    tekshiruv_kodi  TEXT    NOT NULL UNIQUE,     -- QR va sertifikat ustidagi qisqa kod
    familiya        TEXT    NOT NULL,
    ism             TEXT    NOT NULL,
    sharif          TEXT    NOT NULL DEFAULT '',
    kurs_nomi       TEXT    NOT NULL,            -- nusxa: keyin kurs nomi o'zgarsa ham sertifikat o'zgarmaydi
    direktor_fio    TEXT    NOT NULL DEFAULT '', -- nusxa
    foiz            NUMERIC(5,2),
    berilgan_sana   DATE    NOT NULL DEFAULT CURRENT_DATE,
    holat           TEXT    NOT NULL DEFAULT 'haqiqiy',     -- haqiqiy / bekor
    bekor_sababi    TEXT,
    bekor_vaqti     TIMESTAMPTZ,
    yaratilgan      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ishtirokchi_id)                      -- bitta ishtirokchi — bitta sertifikat
);
CREATE INDEX IF NOT EXISTS idx_kurs_sertifikatlar_kurs ON kurs_sertifikatlar(kurs_id);

CREATE TABLE IF NOT EXISTS kurs_sertifikat_hisoblagich (
    yil    INTEGER PRIMARY KEY,
    oxirgi INTEGER NOT NULL DEFAULT 0
);

GRANT ALL PRIVILEGES ON online_kurslar, kurs_adminlar, kurs_ishtirokchilar, kurs_savollar,
      kurs_urinishlar, kurs_sertifikatlar, kurs_sertifikat_hisoblagich TO iis_user;
GRANT ALL PRIVILEGES ON SEQUENCE online_kurslar_id_seq, kurs_adminlar_id_seq, kurs_ishtirokchilar_id_seq,
      kurs_savollar_id_seq, kurs_urinishlar_id_seq, kurs_sertifikatlar_id_seq TO iis_user;

\echo '✅ online kurslar jadvallari yaratildi'
