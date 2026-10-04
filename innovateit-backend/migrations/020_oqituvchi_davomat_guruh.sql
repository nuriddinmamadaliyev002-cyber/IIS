-- ═══════════════════════════════════════════════════════════════════
--  020: O'qituvchi dars soati — HAR BIR GURUH uchun alohida yozuv
--  Avval: bir kun = bitta yozuv (guruhlar yig'indisi).
--  Endi:  bir kun + bir guruh (dars_jadvali) = bitta yozuv.
--
--  Eski yozuvlar o'chirilmaydi: ularda guruh_id = NULL ("guruhsiz",
--  kunlik umumiy yozuv) bo'lib qoladi va statistikaga avvalgidek
--  qo'shiladi. Xavfsiz: har deployda qayta ishga tushsa ham bo'ladi.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE oqituvchilar_davomat
  ADD COLUMN IF NOT EXISTS guruh_id INTEGER REFERENCES dars_jadvali(id) ON DELETE SET NULL;

-- Bir kun + bir guruh uchun bitta yozuv (eski guruhsiz yozuvlarga tegmaydi)
CREATE UNIQUE INDEX IF NOT EXISTS uq_oqitdavomat_guruh
  ON oqituvchilar_davomat (sana, maktab_id, oqituvchi_ism, guruh_id)
  WHERE guruh_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oqitdavomat_guruh ON oqituvchilar_davomat(guruh_id);
