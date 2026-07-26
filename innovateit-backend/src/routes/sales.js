// ─── Sales routes ────────────────────────────────────────────────────────────
// POST   /api/sales/leads        — YANGI LEAD (PUBLIC — ro'yxatdan o'tish sahifasi)
// GET    /api/sales/leads        — leadlar ro'yxati (sales, admin)
// PUT    /api/sales/leads/:id    — lead holatini/biriktirilganini yangilash (sales, admin)
// DELETE /api/sales/leads/:id    — lead o'chirish (admin)
//
// GET    /api/sales              — sales xodimlari ro'yxati (superadmin)
// POST   /api/sales              — yangi sales xodimi yaratish (superadmin)
// PUT    /api/sales/:id          — sales xodimini tahrirlash (superadmin)
// DELETE /api/sales/:id          — sales xodimini o'chirish (superadmin)
const { Router }       = require('express');
const pool              = require('../db');
const { requireAuth }   = require('../middleware/jwt');
const { hashPassword }  = require('../middleware/auth');

const router = Router();
function todayUZ() { return new Date().toLocaleDateString('ru-RU'); }

// ═══════════════════════════════════════════════════════════════════════════
//  LEADLAR
// ═══════════════════════════════════════════════════════════════════════════

// ─── POST /api/sales/leads — PUBLIC: ro'yxatdan o'tish sahifasidan ───────────
router.post('/leads', async (req, res) => {
  const ism          = req.body.ism?.trim();
  const telefon      = req.body.telefon?.trim();
  const farzandIsmi  = req.body.farzandIsmi?.trim() || '';
  const sinf         = req.body.sinf?.trim() || '';
  const maktabId     = req.body.maktabId || null;
  const hudud        = req.body.hudud?.trim() || '';
  const izoh         = req.body.izoh?.trim() || '';
  const manba        = req.body.manba?.trim() || 'sayt';

  if (!ism)
    return res.status(400).json({ ok: false, error: 'Ism majburiy' });
  if (!telefon)
    return res.status(400).json({ ok: false, error: 'Telefon raqam majburiy' });

  try {
    const result = await pool.query(
      `INSERT INTO leadlar (ism, telefon, farzand_ismi, sinf, maktab_id, hudud, izoh, manba)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [ism, telefon, farzandIsmi, sinf, maktabId, hudud, izoh, manba]
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
    let where  = '';
    const params = [];
    if (holat) {
      params.push(holat);
      where = `WHERE l.holat = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT l.*, m.nomi AS maktab_nomi,
              s.ism AS sales_ism, s.familiya AS sales_familiya
       FROM leadlar l
       LEFT JOIN maktablar m       ON m.id = l.maktab_id
       LEFT JOIN sales_xodimlar s  ON s.id = l.biriktirilgan
       ${where}
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
  const { holat, biriktirilgan, izoh } = req.body;

  const ruxsatEtilganHolatlar = ['yangi', 'boglanildi', 'royxatga_olindi', 'bekor_qilindi'];
  if (holat && !ruxsatEtilganHolatlar.includes(holat))
    return res.status(400).json({ ok: false, error: "Noto'g'ri holat qiymati" });

  try {
    const fields = [];
    const params = [];
    let i = 1;

    if (holat !== undefined)          { fields.push(`holat = $${i++}`); params.push(holat); }
    if (biriktirilgan !== undefined)  { fields.push(`biriktirilgan = $${i++}`); params.push(biriktirilgan); }
    if (izoh !== undefined)           { fields.push(`izoh = $${i++}`); params.push(izoh); }
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

// ─── GET /api/sales — xodimlar ro'yxati ───────────────────────────────────────
router.get('/', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });

  try {
    const result = await pool.query(
      `SELECT id, ism, familiya, username, telegram_id, yaratilgan
       FROM sales_xodimlar ORDER BY yaratilgan DESC`
    );
    res.json({ ok: true, xodimlar: result.rows });
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

  if (!ism)
    return res.status(400).json({ ok: false, error: 'Ism majburiy' });
  if (!username || !parol)
    return res.status(400).json({ ok: false, error: 'Username va parol majburiy' });
  if (parol.length < 6)
    return res.status(400).json({ ok: false, error: "Parol kamida 6 belgi bo'lishi kerak" });

  try {
    const uCheck = await pool.query('SELECT id FROM sales_xodimlar WHERE username=$1', [username]);
    if (uCheck.rowCount > 0)
      return res.status(400).json({ ok: false, error: 'Bu username allaqachon band' });

    const parolHash = await hashPassword(parol);
    const result = await pool.query(
      `INSERT INTO sales_xodimlar (ism, familiya, username, parol, yaratilgan)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [ism, familiya, username, parolHash, todayUZ()]
    );
    res.json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
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

  try {
    if (parol && parol.length < 6)
      return res.status(400).json({ ok: false, error: "Parol kamida 6 belgi bo'lishi kerak" });

    let q, params;
    if (parol) {
      const parolHash = await hashPassword(parol);
      q = 'UPDATE sales_xodimlar SET ism=$1, familiya=$2, username=$3, parol=$4 WHERE id=$5';
      params = [ism, familiya, username, parolHash, id];
    } else {
      q = 'UPDATE sales_xodimlar SET ism=$1, familiya=$2, username=$3 WHERE id=$4';
      params = [ism, familiya, username, id];
    }

    const result = await pool.query(q, params);
    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Xodim topilmadi' });

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
