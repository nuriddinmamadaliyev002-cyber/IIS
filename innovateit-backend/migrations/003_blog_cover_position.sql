-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 003: Blog muqova rasm pozitsiyasi
--
--  Muammo: object-fit: cover har doim rasmning MARKAZINI ko'rsatadi.
--  Agar rasmning muhim qismi (masalan matn) yuqorida yoki pastda bo'lsa,
--  u kesilib qoladi. Bu ustun admin panelda slayder orqali qaysi qismi
--  ko'rinishini (0 = yuqori, 50 = markaz, 100 = past) sozlash imkonini beradi.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS muqova_pozitsiya INTEGER NOT NULL DEFAULT 50
    CHECK (muqova_pozitsiya BETWEEN 0 AND 100);
