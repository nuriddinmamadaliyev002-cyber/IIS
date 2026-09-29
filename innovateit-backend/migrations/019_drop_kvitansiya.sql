-- 019: to'lovlar jadvalidan kvitansiya_fayl ustunini olib tashlash.
--
-- TARTIB (muhim!):
--   1) Avval yangi kodni deploy qiling (deploy.sh) — u endi bu ustunga
--      murojaat qilmaydi.
--   2) Keyin shu faylni bir marta ishga tushiring:
--        sudo -u postgres psql -d <DB_NAME> -f migrations/019_drop_kvitansiya.sql
--   Teskari tartibda qilsangiz, eski kod INSERT paytida xato beradi.
--
-- ⚠️ Qaytarib bo'lmaydi: ustundagi barcha havolalar o'chadi. Xohlasangiz
--    oldin zaxira oling:
--      pg_dump -t tolovlar <DB_NAME> > tolovlar_backup.sql

ALTER TABLE tolovlar DROP COLUMN IF EXISTS kvitansiya_fayl;
