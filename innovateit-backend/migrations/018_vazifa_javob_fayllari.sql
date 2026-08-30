-- ═══════════════════════════════════════════════════════════════════
--  018: Vazifa javobiga cheksiz (ko'p) fayl biriktirish
--  Avval vazifa_javoblari.javob_fayl faqat 1 ta fayl nomini saqlar edi.
--  Endi har bir javobga bir nechta fayl biriktirilishi mumkin —
--  buning uchun alohida jadval (1-ko'p bog'lanish).
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. VAZIFA JAVOB FAYLLARI ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vazifa_javob_fayllari (
    id             SERIAL PRIMARY KEY,
    javob_id       INTEGER NOT NULL REFERENCES vazifa_javoblari(id) ON DELETE CASCADE,
    fayl_nomi      TEXT    NOT NULL,            -- serverdagi (multer) fayl nomi
    original_nomi  TEXT    DEFAULT '',          -- foydalanuvchi yuklagan asl fayl nomi
    tartib         INTEGER DEFAULT 0,           -- ko'rsatish tartibi
    yuklangan_vaqt TEXT    DEFAULT TO_CHAR(NOW(), 'DD.MM.YYYY HH24:MI')
);

CREATE INDEX IF NOT EXISTS idx_vazifa_javob_fayllari_javob ON vazifa_javob_fayllari (javob_id);

-- ─── 2. MAVJUD YAGONA FAYLLARNI YANGI JADVALGA KO'CHIRISH ────────────────────
--  Eski javob_fayl ustunida allaqachon fayl nomi bo'lgan yozuvlarni
--  yangi jadvalga bir martalik ko'chirib qo'yamiz (ma'lumot yo'qolmasin).
--  NOT EXISTS bilan tekshirilgani uchun bu skript qayta ishga tushirilsa
--  ham xavfsiz — dublikat yozuv qo'shilmaydi.
INSERT INTO vazifa_javob_fayllari (javob_id, fayl_nomi, tartib)
SELECT vj.id, vj.javob_fayl, 0
FROM vazifa_javoblari vj
WHERE COALESCE(vj.javob_fayl, '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM vazifa_javob_fayllari f
    WHERE f.javob_id = vj.id AND f.fayl_nomi = vj.javob_fayl
  );

-- ─── 3. ESKI USTUN ────────────────────────────────────────────────────────────
--  javob_fayl ustunini hozircha O'CHIRMAYMIZ (orqaga moslik, rollback
--  qulayligi uchun) — backend endi undan foydalanmaydi, lekin ustun
--  qolaveradi. Keyinchalik butunlay ko'chgach, alohida migratsiya bilan
--  DROP COLUMN qilinadi.
