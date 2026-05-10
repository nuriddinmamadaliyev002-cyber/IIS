-- Barcha jadvallar
\dt
 
-- oqituvchilar jadvalining ustunlari
\d oqituvchilar
 
-- oqituvchi_maktablar jadvalining ustunlari  
\d oqituvchi_maktablar
 
-- Mavjud ma'lumotlar
SELECT COUNT(*) FROM oqituvchilar;
SELECT COUNT(*) FROM oqituvchi_maktablar;
SELECT * FROM oqituvchi_maktablar LIMIT 5;