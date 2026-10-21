-- ════════════════════════════════════════════════════════════════════════════
--  029 — Nofaol o'quvchi tarixini saqlash (ID o'zgarmaydi)
--  ─────────────────────────────────────────────────────────────────────────
--  Muammo: o'quvchi nofaolga o'tganda oquvchilar jadvalidan o'chiriladi, va
--  oquvchi_id ga ON DELETE CASCADE bilan bog'langan jadvallar (o'qituvchiga
--  biriktirish, baholar, vazifa javoblari, chat) ham birga o'chib ketardi.
--  Qayta faollashtirilganda esa YANGI id berilardi — eski bog'lanish tiklanmasdi.
--
--  Yechim:
--   1) nofaol_oquvchilar.asl_id — o'quvchining oquvchilar jadvalidagi eski id si
--   2) oquvchi_id dagi FK lar olib tashlanadi (tolovlar kabi) — yozuvlar o'chmaydi
--   3) qayta faollashtirishda o'quvchi SHU id bilan qaytariladi, shunda barcha
--      tarix (o'qituvchi, baho, vazifa, chat, to'lov) avtomatik qayta ulanadi
--  Idempotent: deploy.sh har safar ishga tushirsa ham xavfsiz.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE nofaol_oquvchilar ADD COLUMN IF NOT EXISTS asl_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_nofaol_asl_id ON nofaol_oquvchilar(asl_id);

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.confrelid = 'oquvchilar'::regclass
       AND c.conrelid::regclass::text IN
           ('oqituvchi_oquvchilar', 'vazifa_javoblari', 'oquvchi_baholar', 'chat_xabarlar')
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    RAISE NOTICE 'FK olib tashlandi: %.%', r.tbl, r.conname;
  END LOOP;
END $$;
