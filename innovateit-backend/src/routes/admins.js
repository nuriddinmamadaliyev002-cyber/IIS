// ─── Admins (maktab adminlari) routes ──────────────────────────────────────
// GET    /api/admins      — ro'yxat (faqat superadmin)
// POST   /api/admins      — yaratish (faqat superadmin)
// PUT    /api/admins/:id  — tahrirlash (faqat superadmin)
// DELETE /api/admins/:id  — o'chirish (faqat superadmin)
//
// Maktab admini kirishi FAQAT Telegram orqali (bot → Mini App →
// /api/telegram/check → CRM paneliga JWT bilan redirect, xuddi buxgalter
// va sales xodimlari kabi). Username/parol tizimi YO'Q — Telegram ID
// biriktirish /api/telegram/birikdir orqali amalga oshiriladi.
const { Router }       = require('express');
const pool             = require('../db');
const { requireAuth }  = require('../middleware/jwt');

const router = Router();
router.use(requireAuth(['admin']));
function todayUZ() { return new Date().toLocaleDateString('ru-RU'); }

// ─── GET /api/admins ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  if (!req.user.isSuper) return res.status(403).json({ ok: false, error: "Faqat superadmin" });

  try {
    const result = await pool.query(`
      SELECT a.id, a.ism, a.familiya, a.telegram_id, a.yaratilgan,
             a.maktab_id, m.nomi AS maktab_nomi
      FROM adminlar a
      LEFT JOIN maktablar m ON a.maktab_id = m.id
      ORDER BY a.id
    `);
    res.json({
      ok: true,
      admins: result.rows.map(r => ({
        id:          r.id,
        ism:         r.ism,
        familiya:    r.familiya || '',
        date:        r.yaratilgan,
        maktab_id:   r.maktab_id,
        maktabId:    r.maktab_id,
        maktab_nomi: r.maktab_nomi || null,
        telegram_id: r.telegram_id,
      }))
    });
  } catch (err) {
    console.error('GET /admins xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/admins — yangi maktab admini yaratish ───────────────────────
router.post('/', async (req, res) => {
  if (!req.user.isSuper) return res.status(403).json({ ok: false, error: "Faqat superadmin" });

  const ism      = (req.body.newIsm      || req.body.ism      || '').trim();
  const familiya = (req.body.newFamiliya || req.body.familiya || '').trim();
  const maktabIdRaw = req.body.newMaktabId ?? req.body.maktabId ?? null;
  const maktabId = maktabIdRaw ? parseInt(maktabIdRaw, 10) : null;

  if (!ism)
    return res.status(400).json({ ok: false, error: 'Ism majburiy' });

  try {
    const result = await pool.query(
      `INSERT INTO adminlar (ism, familiya, maktab_id, yaratilgan)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [ism, familiya, maktabId, todayUZ()]
    );
    res.json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    console.error('POST /admins xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── PUT /api/admins/:id — tahrirlash ───────────────────────────────────────
router.put('/:id', async (req, res) => {
  if (!req.user.isSuper) return res.status(403).json({ ok: false, error: "Faqat superadmin" });

  const id       = parseInt(req.params.id, 10);
  const ism      = (req.body.newIsm      || req.body.ism      || '').trim();
  const familiya = (req.body.newFamiliya || req.body.familiya || '').trim();
  const maktabIdRaw = req.body.newMaktabId ?? req.body.maktabId;
  const maktabId = (maktabIdRaw === undefined) ? undefined
                 : (maktabIdRaw ? parseInt(maktabIdRaw, 10) : null);

  if (!id)   return res.status(400).json({ ok: false, error: 'Admin ID kerak' });
  if (!ism)  return res.status(400).json({ ok: false, error: 'Ism majburiy' });

  try {
    const result = maktabId === undefined
      ? await pool.query(
          `UPDATE adminlar SET ism=$1, familiya=$2 WHERE id=$3`,
          [ism, familiya, id]
        )
      : await pool.query(
          `UPDATE adminlar SET ism=$1, familiya=$2, maktab_id=$3 WHERE id=$4`,
          [ism, familiya, maktabId, id]
        );

    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Admin topilmadi' });

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /admins/:id xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── DELETE /api/admins/:id ─────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  if (!req.user.isSuper) return res.status(403).json({ ok: false, error: "Faqat superadmin" });

  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: 'Admin ID kerak' });

  try {
    const adminRes = await pool.query('SELECT telegram_id FROM adminlar WHERE id=$1', [id]);
    if (adminRes.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Admin topilmadi' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tgId = adminRes.rows[0].telegram_id;
      if (tgId) {
        // Faqat SHU admin yozuviga (entity_id) tegishli birikmani o'chiramiz —
        // agar shu telegram_id boshqa maktab(lar)ga ham admin bo'lgan bo'lsa,
        // ular tegilmaydi.
        await client.query(
          'DELETE FROM telegram_users WHERE telegram_id=$1 AND rol=$2 AND entity_id=$3',
          [tgId, 'admin', id]
        );
      }
      await client.query('DELETE FROM adminlar WHERE id=$1', [id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /admins/:id xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

module.exports = router;
