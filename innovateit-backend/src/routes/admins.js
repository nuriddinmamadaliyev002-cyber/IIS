// ─── Admins routes ─────────────────────────────────
// GET    /api/admins     — ro'yxat (faqat superadmin)
// POST   /api/admins     — yaratish
// PUT    /api/admins     — tahrirlash
// DELETE /api/admins     — o'chirish
const { Router }              = require('express');
const pool                    = require('../db');
const { hashPassword }  = require('../middleware/auth');
const { requireAuth }   = require('../middleware/jwt');

const router = Router();
router.use(requireAuth(['admin']));
function todayUZ() { return new Date().toLocaleDateString('ru-RU'); }

// ─── GET /api/admins ───
router.get('/', async (req, res) => {
  if (!req.user.isSuper) return res.status(403).json({ ok: false, error: "Faqat superadmin" });

  // maktablar bilan JOIN qilib maktab nomini ham qaytaramiz
  const result = await pool.query(`
    SELECT a.id, a.ism, a.familiya, a.username, a.yaratilgan, a.maktab_id, m.nomi AS maktab_nomi
    FROM adminlar a
    LEFT JOIN maktablar m ON a.maktab_id = m.id
    ORDER BY a.id
  `);
  // Parolni HECH QACHON frontendga yubormang!
  res.json({ ok: true, admins: result.rows.map(r => ({
    id: r.id, ism: r.ism, familiya: r.familiya || '',
    username: r.username, date: r.yaratilgan,
    maktab_id: r.maktab_id, maktab_nomi: r.maktab_nomi || null
  })) });
});

// ─── POST /api/admins — yangi admin yaratish ───
router.post('/', async (req, res) => {
  const { newUsername, newParol, newIsm, newFamiliya, newMaktabId } = req.body;
  if (!req.user.isSuper) return res.status(403).json({ ok: false, error: "Faqat superadmin" });

  if (!newUsername?.trim() || !newParol?.trim() || !newIsm?.trim())
    return res.status(400).json({ ok: false, error: 'Barcha maydonlar majburiy' });

  if (newParol.trim().length < 6)
    return res.status(400).json({ ok: false, error: "Parol kamida 6 ta belgi bo'lishi kerak" });

  const maktabId = newMaktabId ? parseInt(newMaktabId, 10) : null;

  try {
    const hashed = await hashPassword(newParol.trim());
    await pool.query(
      'INSERT INTO adminlar (ism, familiya, username, parol, maktab_id, yaratilgan) VALUES ($1, $2, $3, $4, $5, $6)',
      [newIsm.trim(), (newFamiliya || '').trim(), newUsername.trim(), hashed, maktabId || null, todayUZ()]
    );
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Bu username allaqachon mavjud' });
    throw err;
  }
});

// ─── PUT /api/admins — tahrirlash ───
router.put('/', async (req, res) => {
  const { oldUsername, newIsm, newUsername: nu, newParol: np } = req.body;
  if (!req.user.isSuper) return res.status(403).json({ ok: false, error: "Faqat superadmin" });

  const oldU = oldUsername?.trim();
  const newU = nu?.trim();
  const newI = newIsm?.trim();
  if (!oldU || !newU || !newI) return res.status(400).json({ ok: false, error: 'Majburiy maydonlar yetishmaydi' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let q, params;
    if (np?.trim()) {
      if (np.trim().length < 6)
        return res.status(400).json({ ok: false, error: "Parol kamida 6 ta belgi bo'lishi kerak" });
      const hashed = await hashPassword(np.trim());
      q      = 'UPDATE adminlar SET ism=$1, username=$2, parol=$3 WHERE username=$4';
      params = [newI, newU, hashed, oldU];
    } else {
      q      = 'UPDATE adminlar SET ism=$1, username=$2 WHERE username=$3';
      params = [newI, newU, oldU];
    }

    const result = await client.query(q, params);
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Admin topilmadi' });
    }

    // Username o'zgargan bo'lsa — bog'liq jadvallarda ham yangilash
    if (oldU !== newU) {
      await client.query('UPDATE oquvchilar           SET admin=$1 WHERE admin=$2',                     [newU, oldU]);
      await client.query('UPDATE nofaol_oquvchilar    SET admin=$1 WHERE admin=$2',                     [newU, oldU]);
      await client.query('UPDATE davomat              SET admin_username=$1 WHERE admin_username=$2',   [newU, oldU]);
      await client.query('UPDATE oqituvchilar         SET admin=$1 WHERE admin=$2',                     [newU, oldU]);
      await client.query('UPDATE oqituvchilar_davomat SET admin_username=$1 WHERE admin_username=$2',   [newU, oldU]);
      await client.query('UPDATE dars_jadvali         SET admin_username=$1 WHERE admin_username=$2',   [newU, oldU]);
      await client.query('UPDATE tolovlar             SET admin_username=$1 WHERE admin_username=$2',   [newU, oldU]);
      await client.query('UPDATE buxgalter_adminlar   SET admin_username=$1 WHERE admin_username=$2',   [newU, oldU]);
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ─── DELETE /api/admins ───
router.delete('/', async (req, res) => {
  const { deleteUsername } = req.body;
  if (!req.user.isSuper) return res.status(403).json({ ok: false, error: "Faqat superadmin" });

  const result = await pool.query('DELETE FROM adminlar WHERE username=$1', [deleteUsername?.trim()]);
  if (result.rowCount === 0) return res.status(404).json({ ok: false, error: 'Admin topilmadi' });
  res.json({ ok: true });
});

module.exports = router;