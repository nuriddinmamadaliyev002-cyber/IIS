-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║         InnovateIT School — BLOG MODULE Migration                            ║
-- ║                                                                                ║
-- ║  innovateitschool.uz (ochiq blog sayti) uchun jadvallar.                      ║
-- ║  Boshqaruv: faqat superadmin (new.innovateitschool.uz CRM paneli ichidan).     ║
-- ║                                                                                ║
-- ║  ISHLATISH:                                                                    ║
-- ║    psql -U iis_user -d iis_db -f migrations/002_blog_module.sql               ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ─── 1. BLOG KATEGORIYALARI ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blog_categories (
    id         SERIAL PRIMARY KEY,
    nomi       TEXT NOT NULL UNIQUE,          -- "Yangiliklar", "O'quvchilar yutuqlari"...
    slug       TEXT NOT NULL UNIQUE,          -- "yangiliklar" (URL uchun)
    tavsif     TEXT DEFAULT '',
    tartib     INTEGER DEFAULT 0,             -- ko'rsatish tartibi
    yaratilgan TIMESTAMP DEFAULT NOW()
);

-- ─── 2. BLOG POSTLARI ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blog_posts (
    id            SERIAL PRIMARY KEY,
    sarlavha      TEXT NOT NULL,                        -- title
    slug          TEXT NOT NULL UNIQUE,                 -- URL: /post/shu-slug
    qisqacha      TEXT DEFAULT '',                       -- excerpt / preview matni
    kontent       TEXT NOT NULL,                          -- HTML/Markdown asosiy matn
    muqova_rasm   TEXT DEFAULT '',                        -- cover image (uploads/... yoki URL)
    kategoriya_id INTEGER REFERENCES blog_categories(id) ON DELETE SET NULL,
    muallif       TEXT DEFAULT 'Innovate IT School',
    holat         TEXT NOT NULL DEFAULT 'qoralama'        -- 'qoralama' | 'chop_etilgan'
                    CHECK (holat IN ('qoralama', 'chop_etilgan')),
    korishlar     INTEGER DEFAULT 0,                       -- views soni
    seo_tavsif    TEXT DEFAULT '',                         -- meta description
    chop_vaqti    TIMESTAMP,                                -- published_at (chop etilgan vaqt)
    yaratilgan    TIMESTAMP DEFAULT NOW(),
    yangilangan   TIMESTAMP DEFAULT NOW()
);

-- ─── 3. BLOG TEGLARI (ixtiyoriy, kelajakda kengaytirish uchun) ──────────────────
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

-- ─── Indekslar ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_blog_posts_holat    ON blog_posts(holat);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug     ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_kategoriya ON blog_posts(kategoriya_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_chopvaqti ON blog_posts(chop_vaqti DESC);

-- ─── Boshlang'ich kategoriyalar (mavjud bo'lmasa qo'shiladi) ────────────────────
INSERT INTO blog_categories (nomi, slug, tavsif, tartib) VALUES
    ('Yangiliklar',            'yangiliklar',            'Maktab va tashkilot yangiliklari', 1),
    ('O''quvchilar yutuqlari', 'oquvchilar-yutuqlari',   'Olimpiada va boshqa yutuqlar',      2),
    ('IT darslar',             'it-darslar',             'Dasturlash va texnologiya darslari', 3),
    ('Ota-onalar uchun',       'ota-onalar-uchun',       'Maslahat va foydali maqolalar',     4)
ON CONFLICT (slug) DO NOTHING;

\echo '✅ Blog moduli jadvallari yaratildi: blog_categories, blog_posts, blog_tags, blog_post_tags'
