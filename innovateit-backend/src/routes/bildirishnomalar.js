// ─── Bildirishnomalar routes (o'quvchi paneli) ───────────────────────────────
// GET  /api/bildirishnomalar        — oxirgi 30 kunlik ro'yxat + o'qilmaganlar soni
// POST /api/bildirishnomalar/oqildi — { id } bittasini yoki { hammasi: true } barchasini o'qilgan qiladi
// ─────────────────────────────────────────────────────────────────────────────
const { Router }      = require('express');
const pool            = require('../db');
const { requireAuth } = require('../middleware/jwt');

const router = Router();
router.use(requireAuth(['oquvchi']));

// Eski (30 kundan oshgan) yozuvlarni kuniga bir marta tozalaymiz
setInterval(() => {
  pool.query(`DELETE FROM bildirishnomalar WHERE yaratilgan < NOW() - INTERVAL '30 days'`)
    .catch(err => console.error('bildirishnoma tozalash xatolik:', err.message));
}, 24 * 60 * 60 * 1000).unref();

router.get('/', async (req, res) => {
  const { entityId } = req.user;
  // Superadmin paneli "ko'rish" uchun ochsa — entity yo'q, bo'sh ro'yxat
  if (!entityId) return res.json({ ok: true, items: [], oqilmagan: 0, ozgargan_idlar: [] });
  try {
    const r = await pool.query(
      `SELECT id, tur, sarlavha, matn, jadval_idlar, oqilgan, yaratilgan, yangilangan
         FROM bildirishnomalar
        WHERE oquvchi_id = $1 AND yaratilgan > NOW() - INTERVAL '30 days'
        ORDER BY yangilangan DESC, id DESC
        LIMIT 30`,
      [entityId]
    );
    const oqilmaganlar = r.rows.filter(x => !x.oqilgan);
    const ozgargan = new Set();
    oqilmaganlar.forEach(x => (x.jadval_idlar || []).forEach(i => ozgargan.add(i)));
    res.json({
      ok: true,
      items: r.rows,
      oqilmagan: oqilmaganlar.length,
      ozgargan_idlar: [...ozgargan],
    });
  } catch (err) {
    console.error('bildirishnomalar GET xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

router.post('/oqildi', async (req, res) => {
  const { entityId } = req.user;
  if (!entityId) return res.json({ ok: true });
  const { id, hammasi } = req.body || {};
  try {
    if (hammasi) {
      await pool.query(
        'UPDATE bildirishnomalar SET oqilgan = TRUE WHERE oquvchi_id = $1 AND oqilgan = FALSE',
        [entityId]
      );
    } else if (parseInt(id)) {
      await pool.query(
        'UPDATE bildirishnomalar SET oqilgan = TRUE WHERE id = $1 AND oquvchi_id = $2',
        [parseInt(id), entityId]
      );
    } else {
      return res.status(400).json({ ok: false, error: 'id yoki hammasi kerak' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('bildirishnomalar oqildi xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

module.exports = router;
