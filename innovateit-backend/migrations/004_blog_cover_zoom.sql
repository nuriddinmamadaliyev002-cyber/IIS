-- ═══════════════════════════════════════════════════════════════════════════
--  Migration 004: Blog muqova rasm masshtabi (zoom)
--
--  muqova_pozitsiya (003) qaysi nuqta ko'rinishini boshqaradi (fokus nuqtasi).
--  muqova_masshtab esa o'sha nuqtadan qanchalik "yaqinlashtirilgan" ko'rinishini
--  boshqaradi. 100 = zoom yo'q (asl cover), 250 = 2.5x kattalashtirilgan.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS muqova_masshtab INTEGER NOT NULL DEFAULT 100
    CHECK (muqova_masshtab BETWEEN 100 AND 250);
