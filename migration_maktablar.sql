-- ═══════════════════════════════════════════════════
--  Migration: oqituvchi_maktablar jadvalini yaratish
--  Agar jadval allaqachon mavjud bo'lsa — xatolik chiqmaydi
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oqituvchi_maktablar (
    id               SERIAL PRIMARY KEY,
    oqituvchi_id     INTEGER NOT NULL REFERENCES oqituvchilar(id) ON DELETE CASCADE,
    admin_username   TEXT NOT NULL,
    biriktirilgan    TEXT DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY'),
    UNIQUE(oqituvchi_id, admin_username)
);

-- Ruxsatlar
GRANT ALL PRIVILEGES ON TABLE oqituvchi_maktablar TO innovateit_user;
GRANT ALL PRIVILEGES ON SEQUENCE oqituvchi_maktablar_id_seq TO innovateit_user;

-- Indekslar
CREATE INDEX IF NOT EXISTS idx_oqitmak_oqitid ON oqituvchi_maktablar(oqituvchi_id);
CREATE INDEX IF NOT EXISTS idx_oqitmak_admin  ON oqituvchi_maktablar(admin_username);

-- Eski oqituvchilar.admin ustunidan ma'lumotlarni ko'chirish (agar bo'lsa)
-- Har bir o'qituvchining "admin" ustunidagi qiymatni oqituvchi_maktablar ga o'tkazish
INSERT INTO oqituvchi_maktablar (oqituvchi_id, admin_username)
SELECT id, admin
FROM oqituvchilar
WHERE admin IS NOT NULL AND admin != ''
ON CONFLICT (oqituvchi_id, admin_username) DO NOTHING;
