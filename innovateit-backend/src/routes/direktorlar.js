// ─── Direktorlar routes ──────────────────────────────────────────────────────
// GET    /api/direktorlar      — ro'yxat (faqat superadmin)
// POST   /api/direktorlar      — yaratish (faqat superadmin)
// PUT    /api/direktorlar/:id  — tahrirlash (faqat superadmin)
// DELETE /api/direktorlar/:id  — o'chirish (faqat superadmin)
// GET    /api/direktorlar/me   — direktorning o'z ma'lumoti (direktor paneli uchun)
//
// Direktor kirishi FAQAT Telegram orqali (bot → Mini App →
// /api/telegram/check → direktor.html ga JWT bilan redirect), xuddi
// buxgalter va sales xodimlari kabi. Telegram ID biriktirish
// /api/telegram/birikdir (rol='direktor') orqali amalga oshiriladi.
const { Router }      = require('express');
const pool            = require('../db');
const { requireAuth } = require('../middleware/jwt');

const router = Router();
function todayUZ() { return new Date().toLocaleDateString('ru-RU'); }

function superOnly(req, res, next) {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });
  next();
}

// ─── GET /api/direktorlar/me — direktor o'z ma'lumotini oladi ───────────────
router.get('/me', requireAuth(['direktor']), async (req, res) => {
  // Superadmin panelni "ko'rish" uchun ochsa — entity yo'q, token ismi qaytadi
  if (req.user.isSuper)
    return res.json({ ok: true, direktor: { ism: req.user.ism || 'Superadmin', isSuper: true } });

  try {
    const r = await pool.query(
      'SELECT id, ism, familiya FROM direktorlar WHERE id=$1',
      [req.user.entityId]
    );
    if (r.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Direktor topilmadi' });
    res.json({ ok: true, direktor: r.rows[0] });
  } catch (err) {
    console.error('GET /direktorlar/me xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/direktorlar ───────────────────────────────────────────────────
router.get('/', requireAuth(['admin']), superOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, ism, familiya, telegram_id, yaratilgan
       FROM direktorlar ORDER BY id`
    );
    res.json({ ok: true, direktorlar: r.rows });
  } catch (err) {
    console.error('GET /direktorlar xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/direktorlar ──────────────────────────────────────────────────
router.post('/', requireAuth(['admin']), superOnly, async (req, res) => {
  const ism      = (req.body.ism      || '').trim();
  const familiya = (req.body.familiya || '').trim();
  if (!ism) return res.status(400).json({ ok: false, error: 'Ism majburiy' });

  try {
    const r = await pool.query(
      `INSERT INTO direktorlar (ism, familiya, yaratilgan)
       VALUES ($1, $2, $3) RETURNING id`,
      [ism, familiya, todayUZ()]
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch (err) {
    console.error('POST /direktorlar xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── PUT /api/direktorlar/:id ───────────────────────────────────────────────
router.put('/:id', requireAuth(['admin']), superOnly, async (req, res) => {
  const id       = parseInt(req.params.id, 10);
  const ism      = (req.body.ism      || '').trim();
  const familiya = (req.body.familiya || '').trim();
  if (!id)  return res.status(400).json({ ok: false, error: 'Direktor ID kerak' });
  if (!ism) return res.status(400).json({ ok: false, error: 'Ism majburiy' });

  try {
    const r = await pool.query(
      'UPDATE direktorlar SET ism=$1, familiya=$2 WHERE id=$3',
      [ism, familiya, id]
    );
    if (r.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Direktor topilmadi' });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /direktorlar/:id xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── DELETE /api/direktorlar/:id ────────────────────────────────────────────
router.delete('/:id', requireAuth(['admin']), superOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: 'Direktor ID kerak' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Telegram birikmasini ham olib tashlaymiz — "yetim" yozuv qolmasligi uchun
    await client.query(
      'DELETE FROM telegram_users WHERE rol=$1 AND entity_id=$2',
      ['direktor', id]
    );
    const r = await client.query('DELETE FROM direktorlar WHERE id=$1', [id]);
    if (r.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Direktor topilmadi' });
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('DELETE /direktorlar/:id xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  } finally {
    client.release();
  }
});

module.exports = router;
