// ─── Sales routes ────────────────────────────────────────────────────────────
// POST   /api/sales/leads        — YANGI LEAD (PUBLIC — ro'yxatdan o'tish sahifasi)
// GET    /api/sales/leads        — leadlar ro'yxati (sales, admin)
// PUT    /api/sales/leads/:id    — lead holatini/biriktirilganini yangilash (sales, admin)
// DELETE /api/sales/leads/:id    — lead o'chirish (admin)
//
// GET    /api/sales              — sales xodimlari ro'yxati + maktab biriktirmalari (superadmin)
// POST   /api/sales              — yangi sales xodimi yaratish (superadmin)
// PUT    /api/sales/:id          — sales xodimini tahrirlash (superadmin)
// DELETE /api/sales/:id          — sales xodimini o'chirish (superadmin)
// POST   /api/sales/biriktiruv   — maktab biriktirish (superadmin)
// DELETE /api/sales/biriktiruv   — maktab ajratish (superadmin)
const { Router }       = require('express');
const pool              = require('../db');
const { requireAuth }   = require('../middleware/jwt');
const { hashPassword }  = require('../middleware/auth');

const router = Router();
function todayUZ() { return new Date().toLocaleDateString('ru-RU'); }

// ─── Sales xodimini maktab id lariga ko'ra olish ──────────────────────────────
async function getSalesMaktabIds(salesId) {
  const res = await pool.query(
    `SELECT maktab_id FROM sales_maktablar WHERE sales_id = $1`,
    [salesId]
  );
  return res.rows.map(r => r.maktab_id);
}

// ═══════════════════════════════════════════════════════════════════════════
//  LEADLAR
// ═══════════════════════════════════════════════════════════════════════════

// ─── POST /api/sales/leads — PUBLIC: ro'yxatdan o'tish sahifasidan ───────────
router.post('/leads', async (req, res) => {
  const ism             = req.body.ism?.trim();
  const telefon         = req.body.telefon?.trim();
  const telefon2        = req.body.telefon2?.trim() || '';
  const oquvchiFamiliya = req.body.oquvchiFamiliya?.trim() || '';
  const oquvchiIsmi     = req.body.oquvchiIsmi?.trim() || '';
  const sinf            = req.body.sinf?.trim() || '';
  const maktabId        = req.body.maktabId || null;
  const hudud           = req.body.hudud?.trim() || '';
  const izoh            = req.body.izoh?.trim() || '';
  const manba           = req.body.manba?.trim() || 'sayt';

  if (!ism)
    return res.status(400).json({ ok: false, error: 'Ism majburiy' });
  if (!telefon)
    return res.status(400).json({ ok: false, error: 'Telefon raqam majburiy' });
  if (!oquvchiFamiliya)
    return res.status(400).json({ ok: false, error: "O'quvchining familiyasi majburiy" });
  if (!oquvchiIsmi)
    return res.status(400).json({ ok: false, error: "O'quvchining ismi majburiy" });
  if (!sinf)
    return res.status(400).json({ ok: false, error: 'Sinf majburiy' });
  if (!maktabId)
    return res.status(400).json({ ok: false, error: 'Maktab majburiy' });

  try {
    const result = await pool.query(
      `INSERT INTO leadlar (ism, telefon, telefon2, oquvchi_familiya, oquvchi_ismi, sinf, maktab_id, hudud, izoh, manba)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [ism, telefon, telefon2, oquvchiFamiliya, oquvchiIsmi, sinf, maktabId, hudud, izoh, manba]
    );
    res.json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    console.error('lead yaratish xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/sales/leads — leadlar ro'yxati (sales, admin) ──────────────────
router.get('/leads', requireAuth(['admin', 'sales']), async (req, res) => {
  const { holat } = req.query;

  try {
    const where  = [];
    const params = [];

    if (holat) {
      params.push(holat);
      where.push(`l.holat = $${params.length}`);
    }

    // Sales xodimi faqat o'ziga biriktirilgan maktablar leadlarini ko'rishi kerak.
    // Superadmin/admin barcha leadlarni ko'radi.
    if (req.user.role === 'sales' && !req.user.isSuper) {
      const maktabIds = await getSalesMaktabIds(req.user.id);
      if (maktabIds.length === 0) {
        return res.json({ ok: true, leadlar: [] });
      }
      params.push(maktabIds);
      where.push(`l.maktab_id = ANY($${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT l.*, m.nomi AS maktab_nomi,
              s.ism AS sales_ism, s.familiya AS sales_familiya
       FROM leadlar l
       LEFT JOIN maktablar m       ON m.id = l.maktab_id
       LEFT JOIN sales_xodimlar s  ON s.id = l.biriktirilgan
       ${whereSql}
       ORDER BY l.yaratilgan DESC`,
      params
    );

    res.json({ ok: true, leadlar: result.rows });
  } catch (err) {
    console.error('leadlar olish xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── PUT /api/sales/leads/:id — holat/biriktirilganini yangilash ─────────────
router.put('/leads/:id', requireAuth(['admin', 'sales']), async (req, res) => {
  const { id }   = req.params;
  const { holat, biriktirilgan, izoh, qaydnoma, gaplashilgan_vaqt } = req.body;

  const ruxsatEtilganHolatlar = ['yangi', 'boglanildi', 'royxatga_olindi', 'bekor_qilindi'];
  if (holat && !ruxsatEtilganHolatlar.includes(holat))
    return res.status(400).json({ ok: false, error: "Noto'g'ri holat qiymati" });

  try {
    const fields = [];
    const params = [];
    let i = 1;

    if (holat !== undefined)             { fields.push(`holat = $${i++}`); params.push(holat); }
    if (biriktirilgan !== undefined)     { fields.push(`biriktirilgan = $${i++}`); params.push(biriktirilgan); }
    if (izoh !== undefined)              { fields.push(`izoh = $${i++}`); params.push(izoh); }
    if (qaydnoma !== undefined)          { fields.push(`qaydnoma = $${i++}`); params.push(qaydnoma); }
    if (gaplashilgan_vaqt !== undefined) { fields.push(`gaplashilgan_vaqt = $${i++}`); params.push(gaplashilgan_vaqt || null); }
    fields.push(`yangilangan = NOW()`);

    if (fields.length === 1)
      return res.status(400).json({ ok: false, error: "Yangilanadigan maydon yo'q" });

    params.push(id);
    const result = await pool.query(
      `UPDATE leadlar SET ${fields.join(', ')} WHERE id = $${i} RETURNING id`,
      params
    );

    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Lead topilmadi' });

    res.json({ ok: true });
  } catch (err) {
    console.error('lead yangilash xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── DELETE /api/sales/leads/:id — faqat admin ────────────────────────────────
router.delete('/leads/:id', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });

  try {
    const result = await pool.query('DELETE FROM leadlar WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Lead topilmadi' });
    res.json({ ok: true });
  } catch (err) {
    console.error('lead ochirish xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  SALES XODIMLARI (faqat superadmin boshqaradi)
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /api/sales — xodimlar ro'yxati + maktab biriktirmalari ──────────────
router.get('/', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });

  try {
    const maktablarRes = await pool.query('SELECT id, nomi FROM maktablar ORDER BY nomi');

    const result = await pool.query(
      `SELECT
         s.id, s.ism, s.familiya, s.username, s.telegram_id, s.yaratilgan,
         COALESCE(
           JSON_AGG(
             JSON_BUILD_OBJECT('id', m.id, 'nomi', m.nomi)
           ) FILTER (WHERE m.id IS NOT NULL),
           '[]'
         ) AS maktablar
       FROM sales_xodimlar s
       LEFT JOIN sales_maktablar sm ON sm.sales_id = s.id
       LEFT JOIN maktablar m        ON m.id = sm.maktab_id
       GROUP BY s.id
       ORDER BY s.yaratilgan DESC`
    );

    res.json({ ok: true, xodimlar: result.rows, maktablar: maktablarRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/sales — yangi sales xodimi yaratish ────────────────────────────
router.post('/', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });

  const ism      = req.body.ism?.trim();
  const familiya = req.body.familiya?.trim() || '';
  const username = req.body.username?.trim().toLowerCase();
  const parol    = req.body.parol;
  const maktablar = req.body.maktablar || [];

  if (!ism)
    return res.status(400).json({ ok: false, error: 'Ism majburiy' });
  if (!username || !parol)
    return res.status(400).json({ ok: false, error: 'Username va parol majburiy' });
  if (parol.length < 6)
    return res.status(400).json({ ok: false, error: "Parol kamida 6 belgi bo'lishi kerak" });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const uCheck = await client.query('SELECT id FROM sales_xodimlar WHERE username=$1', [username]);
    if (uCheck.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Bu username allaqachon band' });
    }

    const parolHash = await hashPassword(parol);
    const result = await client.query(
      `INSERT INTO sales_xodimlar (ism, familiya, username, parol, yaratilgan)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [ism, familiya, username, parolHash, todayUZ()]
    );
    const salesId = result.rows[0].id;

    for (const maktabId of maktablar) {
      await client.query(
        `INSERT INTO sales_maktablar (sales_id, maktab_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [salesId, maktabId]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, id: salesId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  } finally {
    client.release();
  }
});

// ─── PUT /api/sales/:id — tahrirlash ──────────────────────────────────────────
router.put('/:id', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });

  const { id } = req.params;
  const ism      = req.body.ism?.trim();
  const familiya = req.body.familiya?.trim();
  const username = req.body.username?.trim().toLowerCase();
  const parol    = req.body.parol;
  const maktablar = req.body.maktablar;

  const client = await pool.connect();
  try {
    if (parol && parol.length < 6) {
      client.release();
      return res.status(400).json({ ok: false, error: "Parol kamida 6 belgi bo'lishi kerak" });
    }

    await client.query('BEGIN');

    let q, params;
    if (parol) {
      const parolHash = await hashPassword(parol);
      q = 'UPDATE sales_xodimlar SET ism=$1, familiya=$2, username=$3, parol=$4 WHERE id=$5';
      params = [ism, familiya, username, parolHash, id];
    } else {
      q = 'UPDATE sales_xodimlar SET ism=$1, familiya=$2, username=$3 WHERE id=$4';
      params = [ism, familiya, username, id];
    }

    const result = await client.query(q, params);
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Xodim topilmadi' });
    }

    if (Array.isArray(maktablar)) {
      await client.query('DELETE FROM sales_maktablar WHERE sales_id=$1', [id]);
      for (const maktabId of maktablar) {
        await client.query(
          `INSERT INTO sales_maktablar (sales_id, maktab_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, maktabId]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  } finally {
    client.release();
  }
});

// ─── POST /api/sales/biriktiruv — maktab biriktirish ──────────────────────────
router.post('/biriktiruv', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: "Ruxsat yo'q" });

  const { salesId, maktabId } = req.body;
  if (!salesId || !maktabId)
    return res.status(400).json({ ok: false, error: 'salesId va maktabId kerak' });

  try {
    await pool.query(
      `INSERT INTO sales_maktablar (sales_id, maktab_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [salesId, maktabId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── DELETE /api/sales/biriktiruv — maktab ajratish ───────────────────────────
router.delete('/biriktiruv', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: "Ruxsat yo'q" });

  const { salesId, maktabId } = req.body;
  if (!salesId || !maktabId)
    return res.status(400).json({ ok: false, error: 'salesId va maktabId kerak' });

  try {
    await pool.query(
      'DELETE FROM sales_maktablar WHERE sales_id=$1 AND maktab_id=$2',
      [salesId, maktabId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── DELETE /api/sales/:id — o'chirish ───────────────────────────────────────
router.delete('/:id', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });

  try {
    const result = await pool.query('DELETE FROM sales_xodimlar WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Xodim topilmadi' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

module.exports = router;