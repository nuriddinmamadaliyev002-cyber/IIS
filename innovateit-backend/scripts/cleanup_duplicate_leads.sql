-- ═══════════════════════════════════════════════════════════════════════════
--  Bir martalik tozalash: mavjud dublikat leadlarni o'chirish
--
--  Bir xil telefon + o'quvchi F.I. + maktab bilan bir nechta qator bo'lsa,
--  faqat ENG BIRINCHI (eng eski, ya'ni asl) qatorni qoldirib, qolganlarini
--  o'chiradi. "holat" ustuniga qaramaydi — masalan bittasi "Ro'yxatga olindi",
--  ikkinchisi "Bekor qilindi" bo'lsa ham, ikkinchisi (keyingi) o'chiriladi.
--
--  ISHLATISH: avval SELECT bilan tekshirib ko'ring (pastda), keyin DELETE'ni
--  izohdan chiqarib ishga tushiring.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Qaysi qatorlar dublikat ekanini ko'rish (hech narsa o'chirmaydi):
SELECT id, ism, telefon, oquvchi_familiya, oquvchi_ismi, maktab_id, holat, yaratilgan
FROM leadlar l
WHERE EXISTS (
  SELECT 1 FROM leadlar l2
  WHERE l2.telefon = l.telefon
    AND l2.oquvchi_familiya = l.oquvchi_familiya
    AND l2.oquvchi_ismi = l.oquvchi_ismi
    AND l2.maktab_id IS NOT DISTINCT FROM l.maktab_id
    AND l2.id <> l.id
)
ORDER BY telefon, oquvchi_familiya, oquvchi_ismi, yaratilgan;

-- 2) Tekshirib bo'lgach, dublikatlarni o'chirish uchun quyidagini ishga tushiring:
--
-- DELETE FROM leadlar l
-- WHERE id NOT IN (
--   SELECT MIN(id) FROM leadlar
--   GROUP BY telefon, oquvchi_familiya, oquvchi_ismi, maktab_id
-- )
-- AND EXISTS (
--   SELECT 1 FROM leadlar l2
--   WHERE l2.telefon = l.telefon
--     AND l2.oquvchi_familiya = l.oquvchi_familiya
--     AND l2.oquvchi_ismi = l.oquvchi_ismi
--     AND l2.maktab_id IS NOT DISTINCT FROM l.maktab_id
--     AND l2.id <> l.id
-- );
