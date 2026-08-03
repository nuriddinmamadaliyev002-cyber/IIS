-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 009: Blog post galereyasi (bir nechta rasm)
--
--  Muqova rasmi (muqova_rasm) ro'yxat/kartochkalarda yagona rasm sifatida
--  ko'rinadi. Bu ustun postga qo'shimcha rasmlar qo'shish imkonini beradi —
--  ular faqat postning to'liq sahifasida (post.html) galereya sifatida
--  ko'rsatiladi. JSONB massiv sifatida saqlanadi: ["rasm1.jpg","rasm2.jpg"]
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS galereya JSONB NOT NULL DEFAULT '[]'::jsonb;

\echo '✅ blog_posts.galereya ustuni qo''shildi'
