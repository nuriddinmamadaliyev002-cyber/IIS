// ═══════════════════════════════════════════════════════════════════════════
//  Blog Router
//
//  PUBLIC (innovateitschool.uz uchun, login shart emas):
//    GET  /api/blog/posts              — chop etilgan postlar ro'yxati (filter/paginate)
//    GET  /api/blog/posts/:slug        — bitta post (+ ko'rishlar sonini oshiradi)
//    GET  /api/blog/categories         — kategoriyalar ro'yxati
//
//  ADMIN (faqat superadmin, CRM paneli — new.innovateitschool.uz ichidan):
//    GET    /api/blog/admin/posts          — barcha postlar (qoralama + chop etilgan)
//    GET    /api/blog/admin/posts/:id      — bitta post (id bo'yicha, tahrirlash uchun)
//    POST   /api/blog/admin/posts          — yangi post yaratish
//    PUT    /api/blog/admin/posts/:id      — postni tahrirlash
//    DELETE /api/blog/admin/posts/:id      — postni o'chirish
//    POST   /api/blog/admin/categories     — yangi kategoriya
//    PUT    /api/blog/admin/categories/:id — kategoriyani tahrirlash
//    DELETE /api/blog/admin/categories/:id — kategoriyani o'chirish
// ═══════════════════════════════════════════════════════════════════════════
const { Router }      = require('express');
const pool             = require('../db');
const { requireAuth } = require('../middleware/jwt');

const router = Router();

// ─── Faqat superadmin kirishi mumkin ──────────────────────────────────────────
function requireSuperAdmin(req, res, next) {
  if (!req.user || !req.user.isSuper) {
    return res.status(403).json({ ok: false, error: "Faqat superadmin blogni boshqarishi mumkin" });
  }
  next();
}

// ─── slug generatsiya (lotin harflari, bo'shliq → tire) ───────────────────────
function slugify(text) {
  const map = { 'ʼ':'', "'":'', '’':'', 'oʻ':'o', 'gʻ':'g', 'sh':'sh', 'ch':'ch' };
  return text
    .toLowerCase()
    .replace(/[ʼ'’]/g, '')
    .replace(/[^a-z0-9\u0400-\u04FF\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

async function uniqueSlug(base, excludeId = null) {
  let slug = slugify(base) || 'post';
  let i = 0;
  while (true) {
    const candidate = i === 0 ? slug : `${slug}-${i}`;
    const q = excludeId
      ? await pool.query('SELECT id FROM blog_posts WHERE slug = $1 AND id != $2', [candidate, excludeId])
      : await pool.query('SELECT id FROM blog_posts WHERE slug = $1', [candidate]);
    if (q.rowCount === 0) return candidate;
    i++;
  }
}

// ═══════════════════════════ PUBLIC ENDPOINTLAR ═══════════════════════════════

// GET /api/blog/posts?kategoriya=slug&page=1&limit=9&qidiruv=matn
router.get('/posts', async (req, res) => {
  try {
    const { kategoriya, qidiruv } = req.query;
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(30, parseInt(req.query.limit) || 9);
    const offset = (page - 1) * limit;

    const params = [];
    let where = `WHERE p.holat = 'chop_etilgan'`;

    if (kategoriya) {
      params.push(kategoriya);
      where += ` AND c.slug = $${params.length}`;
    }
    if (qidiruv) {
      params.push(`%${qidiruv}%`);
      where += ` AND (p.sarlavha ILIKE $${params.length} OR p.qisqacha ILIKE $${params.length})`;
    }

    const countQ = await pool.query(
      `SELECT COUNT(*) FROM blog_posts p LEFT JOIN blog_categories c ON c.id = p.kategoriya_id ${where}`,
      params
    );

    params.push(limit, offset);
    const postsQ = await pool.query(
      `SELECT p.id, p.sarlavha, p.slug, p.qisqacha, p.muqova_rasm, p.muqova_pozitsiya, p.muallif,
              p.korishlar, p.chop_vaqti,
              c.nomi AS kategoriya_nomi, c.slug AS kategoriya_slug
       FROM blog_posts p
       LEFT JOIN blog_categories c ON c.id = p.kategoriya_id
       ${where}
       ORDER BY p.chop_vaqti DESC NULLS LAST, p.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      ok: true,
      posts: postsQ.rows,
      total: parseInt(countQ.rows[0].count),
      page,
      totalPages: Math.ceil(parseInt(countQ.rows[0].count) / limit)
    });
  } catch (err) {
    console.error('blog GET /posts xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// GET /api/blog/posts/:slug
router.get('/posts/:slug', async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT p.*, c.nomi AS kategoriya_nomi, c.slug AS kategoriya_slug
       FROM blog_posts p
       LEFT JOIN blog_categories c ON c.id = p.kategoriya_id
       WHERE p.slug = $1 AND p.holat = 'chop_etilgan'`,
      [req.params.slug]
    );
    if (q.rowCount === 0) return res.status(404).json({ ok: false, error: 'Post topilmadi' });

    // Ko'rishlar sonini oshiramiz (fire-and-forget)
    pool.query('UPDATE blog_posts SET korishlar = korishlar + 1 WHERE id = $1', [q.rows[0].id]).catch(() => {});

    res.json({ ok: true, post: q.rows[0] });
  } catch (err) {
    console.error('blog GET /posts/:slug xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// GET /api/blog/categories
router.get('/categories', async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT c.id, c.nomi, c.slug, c.tavsif,
              COUNT(p.id) FILTER (WHERE p.holat = 'chop_etilgan') AS postlar_soni
       FROM blog_categories c
       LEFT JOIN blog_posts p ON p.kategoriya_id = c.id
       GROUP BY c.id
       ORDER BY c.tartib ASC, c.nomi ASC`
    );
    res.json({ ok: true, categories: q.rows });
  } catch (err) {
    console.error('blog GET /categories xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ═══════════════════════════ ADMIN ENDPOINTLAR (superadmin) ═══════════════════

router.use('/admin', requireAuth(['admin']), requireSuperAdmin);

// GET /api/blog/admin/posts — barchasi (qoralama ham)
router.get('/admin/posts', async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT p.id, p.sarlavha, p.slug, p.holat, p.korishlar, p.chop_vaqti,
              p.yaratilgan, c.nomi AS kategoriya_nomi
       FROM blog_posts p
       LEFT JOIN blog_categories c ON c.id = p.kategoriya_id
       ORDER BY p.yaratilgan DESC`
    );
    res.json({ ok: true, posts: q.rows });
  } catch (err) {
    console.error('blog admin GET /posts xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// GET /api/blog/admin/posts/:id
router.get('/admin/posts/:id', async (req, res) => {
  try {
    const q = await pool.query('SELECT * FROM blog_posts WHERE id = $1', [req.params.id]);
    if (q.rowCount === 0) return res.status(404).json({ ok: false, error: 'Post topilmadi' });
    res.json({ ok: true, post: q.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// POST /api/blog/admin/posts
router.post('/admin/posts', async (req, res) => {
  try {
    const { sarlavha, qisqacha = '', kontent, muqova_rasm = '', muqova_pozitsiya = 50, kategoriya_id = null,
            muallif = 'Innovate IT School', holat = 'qoralama', seo_tavsif = '' } = req.body;

    if (!sarlavha || !kontent)
      return res.status(400).json({ ok: false, error: "Sarlavha va kontent kerak" });

    const slug = await uniqueSlug(sarlavha);
    const chopVaqti = holat === 'chop_etilgan' ? new Date() : null;

    const q = await pool.query(
      `INSERT INTO blog_posts
         (sarlavha, slug, qisqacha, kontent, muqova_rasm, muqova_pozitsiya, kategoriya_id, muallif, holat, seo_tavsif, chop_vaqti)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [sarlavha, slug, qisqacha, kontent, muqova_rasm, muqova_pozitsiya, kategoriya_id, muallif, holat, seo_tavsif, chopVaqti]
    );
    res.json({ ok: true, post: q.rows[0] });
  } catch (err) {
    console.error('blog POST /posts xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// PUT /api/blog/admin/posts/:id
router.put('/admin/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM blog_posts WHERE id = $1', [id]);
    if (existing.rowCount === 0) return res.status(404).json({ ok: false, error: 'Post topilmadi' });
    const old = existing.rows[0];

    const {
      sarlavha = old.sarlavha, qisqacha = old.qisqacha, kontent = old.kontent,
      muqova_rasm = old.muqova_rasm, muqova_pozitsiya = old.muqova_pozitsiya, kategoriya_id = old.kategoriya_id,
      muallif = old.muallif, holat = old.holat, seo_tavsif = old.seo_tavsif
    } = req.body;

    let slug = old.slug;
    if (sarlavha !== old.sarlavha) slug = await uniqueSlug(sarlavha, id);

    // Birinchi marta chop etilayotgan bo'lsa chop_vaqti belgilanadi
    let chopVaqti = old.chop_vaqti;
    if (holat === 'chop_etilgan' && !old.chop_vaqti) chopVaqti = new Date();
    if (holat === 'qoralama') chopVaqti = null;

    const q = await pool.query(
      `UPDATE blog_posts SET
         sarlavha=$1, slug=$2, qisqacha=$3, kontent=$4, muqova_rasm=$5, muqova_pozitsiya=$6,
         kategoriya_id=$7, muallif=$8, holat=$9, seo_tavsif=$10,
         chop_vaqti=$11, yangilangan=NOW()
       WHERE id=$12 RETURNING *`,
      [sarlavha, slug, qisqacha, kontent, muqova_rasm, muqova_pozitsiya, kategoriya_id, muallif, holat, seo_tavsif, chopVaqti, id]
    );
    res.json({ ok: true, post: q.rows[0] });
  } catch (err) {
    console.error('blog PUT /posts/:id xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// DELETE /api/blog/admin/posts/:id
router.delete('/admin/posts/:id', async (req, res) => {
  try {
    const q = await pool.query('DELETE FROM blog_posts WHERE id = $1 RETURNING id', [req.params.id]);
    if (q.rowCount === 0) return res.status(404).json({ ok: false, error: 'Post topilmadi' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── Kategoriyalar (admin) ─────────────────────────────────────────────────────
router.post('/admin/categories', async (req, res) => {
  try {
    const { nomi, tavsif = '', tartib = 0 } = req.body;
    if (!nomi) return res.status(400).json({ ok: false, error: 'Nomi kerak' });
    const slug = slugify(nomi);
    const q = await pool.query(
      `INSERT INTO blog_categories (nomi, slug, tavsif, tartib) VALUES ($1,$2,$3,$4) RETURNING *`,
      [nomi, slug, tavsif, tartib]
    );
    res.json({ ok: true, category: q.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Bu nom band' });
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

router.put('/admin/categories/:id', async (req, res) => {
  try {
    const { nomi, tavsif = '', tartib = 0 } = req.body;
    const slug = slugify(nomi);
    const q = await pool.query(
      `UPDATE blog_categories SET nomi=$1, slug=$2, tavsif=$3, tartib=$4 WHERE id=$5 RETURNING *`,
      [nomi, slug, tavsif, tartib, req.params.id]
    );
    if (q.rowCount === 0) return res.status(404).json({ ok: false, error: 'Kategoriya topilmadi' });
    res.json({ ok: true, category: q.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

router.delete('/admin/categories/:id', async (req, res) => {
  try {
    const q = await pool.query('DELETE FROM blog_categories WHERE id = $1 RETURNING id', [req.params.id]);
    if (q.rowCount === 0) return res.status(404).json({ ok: false, error: 'Kategoriya topilmadi' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

module.exports = router;
