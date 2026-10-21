-- ════════════════════════════════════════════════════════════════════════════
--  030 — O'quvchining nofaol bo'lgan oraliqlari (qayta faollashtirilganda)
--  ─────────────────────────────────────────────────────────────────────────
--  Nofaolga o'tgan o'quvchi qayta faollashtirilganda unga tegishli tarix
--  (id o'zgarmagani uchun) qayta ulanadi. Lekin chiqgan sana bilan qayta
--  faollashtirilgan sana ORASIDAGI kunlarda u o'qituvchi ro'yxatida
--  ko'rinmasligi kerak. Shu oraliq shu jadvalda saqlanadi.
--  Idempotent: deploy.sh har safar ishga tushirsa ham xavfsiz.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS oquvchi_nofaol_davrlar (
    id          SERIAL PRIMARY KEY,
    oquvchi_id  INTEGER NOT NULL,           -- FK yo'q (029 dagi kabi)
    tugagan     DATE    NOT NULL,           -- oxirgi faol kun (chiqgan sana)
    tiklangan   DATE    NOT NULL,           -- qayta faollashtirilgan sana
    yaratilgan  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nofaol_davr_oquvchi ON oquvchi_nofaol_davrlar(oquvchi_id);
GRANT ALL PRIVILEGES ON oquvchi_nofaol_davrlar TO iis_user;
GRANT ALL PRIVILEGES ON SEQUENCE oquvchi_nofaol_davrlar_id_seq TO iis_user;
