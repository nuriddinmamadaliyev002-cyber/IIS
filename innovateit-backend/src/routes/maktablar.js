// ─── Maktablar routes ────────────────────────────────
// GET    /api/maktablar        — ro'yxat (barcha adminlar)
// POST   /api/maktablar        — yaratish (faqat superadmin)
// PUT    /api/maktablar/:id    — tahrirlash (faqat superadmin)
// DELETE /api/maktablar/:id    — o'chirish (faqat superadmin)
const { Router }      = require('express');
const pool            = require('../db');
const { requireAuth } = require('../middleware/jwt');

const router = Router();

// ─── GET /api/maktablar — token talab qilinmaydi (miniapp anketa uchun) ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         m.id,
         m.nomi,
         m.yaratilgan,
         COUNT(DISTINCT a.id)::int   AS adminlar_soni,
         COUNT(DISTINCT om.id)::int  AS oqituvchilar_soni,
         COUNT(DISTINCT aq.id)::int  AS oquvchilar_soni
       FROM maktablar m
       LEFT JOIN adminlar             a  ON a.maktab_id  = m.id
       LEFT JOIN oqituvchi_maktablar  om ON om.maktab_id = m.id
       LEFT JOIN oquvchilar           aq ON aq.maktab_id = m.id
       GROUP BY m.id
       ORDER BY m.yaratilgan DESC`
    );
    res.json({ ok: true, maktablar: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/maktablar — yangi maktab yaratish ─────────────────────────────
router.post('/', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });

  const nomi = req.body.nomi?.trim();
  if (!nomi)
    return res.status(400).json({ ok: false, error: "Maktab nomi kiritilmagan" });

  try {
    const result = await pool.query(
      `INSERT INTO maktablar (nomi) VALUES ($1) RETURNING id, nomi, yaratilgan`,
      [nomi]
    );
    res.json({ ok: true, maktab: result.rows[0] });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ ok: false, error: 'Bu nomli maktab allaqachon mavjud' });
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── PUT /api/maktablar/:id — maktab nomini tahrirlash ───────────────────────
router.put('/:id', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });

  const id   = parseInt(req.params.id);
  const nomi = req.body.nomi?.trim();

  if (!nomi)
    return res.status(400).json({ ok: false, error: "Maktab nomi kiritilmagan" });

  try {
    const old = await pool.query('SELECT nomi FROM maktablar WHERE id=$1', [id]);
    if (old.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Maktab topilmadi' });

    const oldNomi  = old.rows[0].nomi;
    const client   = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('UPDATE maktablar SET nomi=$1 WHERE id=$2', [nomi, id]);

      // maktab_id FK orqali bog'langan — qo'shimcha sinxronlash shart emas

      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ ok: false, error: 'Bu nomli maktab allaqachon mavjud' });
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── DELETE /api/maktablar/:id ────────────────────────────────────────────────
router.delete('/:id', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });

  const id = parseInt(req.params.id);

  try {
    // Bog'liq foydalanuvchilar borligini tekshirish
    const check = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM adminlar            WHERE maktab_id=$1)::int AS adminlar,
         (SELECT COUNT(*) FROM oqituvchi_maktablar WHERE maktab_id=$1)::int AS oqituvchilar,
         (SELECT COUNT(*) FROM buxgalter_maktablar WHERE maktab_id=$1)::int AS buxgalterlar`,
      [id]
    );
    const { adminlar, oqituvchilar, buxgalterlar } = check.rows[0];

    if (adminlar > 0 || oqituvchilar > 0 || buxgalterlar > 0) {
      return res.status(400).json({
        ok: false,
        error: `Bu maktabga ${adminlar} admin, ${oqituvchilar} o'qituvchi, ${buxgalterlar} buxgalter biriktirilgan. Avval ularni ajrating.`
      });
    }

    const result = await pool.query('DELETE FROM maktablar WHERE id=$1', [id]);
    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Maktab topilmadi' });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

module.exports = router;