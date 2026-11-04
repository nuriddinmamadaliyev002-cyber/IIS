-- 035 — umumiy login/parol bilan imtihon, ism bo'yicha takroriy topshirishni cheklash

-- ─── 35. ONLINE KURS: umumiy login/parol bilan imtihon (migrations/035) ─────────
--  Imtihon topshiruvchilar Telegram orqali kirmaydi: kurs admini (yoki superadmin) kurs uchun
--  login va parol belgilaydi, imtihon vaqt oralig'ini sozlaydi. Parol bcrypt hash holida saqlanadi.
--  Ishtirokchi imtihon oldidan ma'lumotini o'zi kiritadi; bir xil familiya+ism ikkinchi marta
--  topshira olmaydi (ism_kalit — lotin/kirill, apostrof, harf tartibi farqi hisobga olinmaydi).
ALTER TABLE online_kurslar ADD COLUMN IF NOT EXISTS imtihon_login       TEXT;
ALTER TABLE online_kurslar ADD COLUMN IF NOT EXISTS imtihon_parol_hash  TEXT;
ALTER TABLE online_kurslar ADD COLUMN IF NOT EXISTS imtihon_boshlanish  TIMESTAMPTZ;
ALTER TABLE online_kurslar ADD COLUMN IF NOT EXISTS imtihon_tugash      TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_online_kurslar_imtihon_login
    ON online_kurslar (lower(imtihon_login)) WHERE imtihon_login IS NOT NULL;

ALTER TABLE kurs_ishtirokchilar ADD COLUMN IF NOT EXISTS ism_kalit TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_kurs_ishtirokchi_ism_kalit
    ON kurs_ishtirokchilar (kurs_id, ism_kalit) WHERE ism_kalit IS NOT NULL;

-- Ishtirokchilar endi Telegram orqali kirmaydi: eski birikmalar olib tashlanadi
DELETE FROM telegram_users WHERE rol = 'kurs_ishtirokchi';
