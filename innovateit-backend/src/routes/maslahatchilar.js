// ─── Maslahatchilar routes ───────────────────────────────────────────────────
// GET    /api/maslahatchilar        — ro'yxat (superadmin: hammasi, admin: o'z maktabi)
// POST   /api/maslahatchilar        — yangi maslahatchi yaratish
// PUT    /api/maslahatchilar/:id    — tahrirlash
// DELETE /api/maslahatchilar/:id    — o'chirish
// ─────────────────────────────────────────────────────────────────────────────
const { Router }           = require('express');
const pool                 = require('../db');
const { hashPassword }     = require('../middleware/auth');
const { requireAuth }      = require('../middleware/jwt');
const bcrypt               = require('bcryptjs');

const router = Router();
router.use(requireAuth(['admin']));

function todayUZ() { return new Date().toLocaleDateString('ru-RU'); }

// ─── GET /api/maslahatchilar ─────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { isSuper, maktabId } = req.user;

    let query, params;

    if (isSuper) {
      // Superadmin — barcha maslahatchilar
      query = `
        SELECT ms.id, ms.ism, ms.familiya, ms.telefon, ms.lavozim,
               ms.komiss_summa, ms.username, ms.aktiv, ms.yaratilgan,
               ms.maktab_id, m.nomi AS maktab_nomi,
               COUNT(l.id) AS lead_soni,
               COUNT(l.id) FILTER (WHERE l.holat = 'yozildi' OR l.holat = 'tolov') AS yozildi_soni
        FROM maslahatchilar ms
        LEFT JOIN maktablar m ON m.id = ms.maktab_id
        LEFT JOIN leadlar l ON l.maslahatchi_id = ms.id
        GROUP BY ms.id, m.nomi
        ORDER BY ms.id DESC
      `;
      params = [];
    } else {
      // Admin — faqat o'z maktabidagi maslahatchilar
      query = `
        SELECT ms.id, ms.ism, ms.familiya, ms.telefon, ms.lavozim,
               ms.komiss_summa, ms.username, ms.aktiv, ms.yaratilgan,
               ms.maktab_id, m.nomi AS maktab_nomi,
               COUNT(l.id) AS lead_soni,
               COUNT(l.id) FILTER (WHERE l.holat = 'yozildi' OR l.holat = 'tolov') AS yozildi_soni
        FROM maslahatchilar ms
        LEFT JOIN maktablar m ON m.id = ms.maktab_id
        LEFT JOIN leadlar l ON l.maslahatchi_id = ms.id
        WHERE ms.maktab_id = $1
        GROUP BY ms.id, m.nomi
        ORDER BY ms.id DESC
      `;
      params = [maktabId];
    }

    const result = await pool.query(query, params);
    res.json({ ok: true, maslahatchilar: result.rows });
  } catch (err) {
    console.error('GET /maslahatchilar xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/maslahatchilar — yangi maslahatchi yaratish ───────────────────
router.post('/', async (req, res) => {
  try {
    const { isSuper, maktabId: adminMaktabId } = req.user;
    const {
      ism, familiya, telefon, lavozim,
      maktab_id, komiss_summa,
      new_username, new_parol
    } = req.body;

    if (!ism?.trim())
      return res.status(400).json({ ok: false, error: 'Ism majburiy' });
    if (!new_username?.trim())
      return res.status(400).json({ ok: false, error: 'Username majburiy' });
    if (!new_parol?.trim() || new_parol.trim().length < 6)
      return res.status(400).json({ ok: false, error: "Parol kamida 6 ta belgi bo'lishi kerak" });

    // Admin faqat o'z maktabi uchun maslahatchi qo'sha oladi
    const targetMaktabId = isSuper
      ? (maktab_id ? parseInt(maktab_id, 10) : null)
      : adminMaktabId;

    const hashed = await hashPassword(new_parol.trim());

    await pool.query(
      `INSERT INTO maslahatchilar
        (ism, familiya, telefon, lavozim, maktab_id, komiss_summa, username, parol, aktiv, yaratilgan)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)`,
      [
        ism.trim(),
        (familiya || '').trim(),
        (telefon || '').trim(),
        (lavozim || '').trim(),
        targetMaktabId || null,
        parseInt(komiss_summa, 10) || 0,
        new_username.trim().toLowerCase(),
        hashed,
        todayUZ()
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ ok: false, error: 'Bu username allaqachon mavjud' });
    console.error('POST /maslahatchilar xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── PUT /api/maslahatchilar/:id — tahrirlash ────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { isSuper, maktabId: adminMaktabId } = req.user;
    const id = parseInt(req.params.id, 10);
    const {
      ism, familiya, telefon, lavozim,
      maktab_id, komiss_summa,
      new_username, new_parol, aktiv
    } = req.body;

    if (!ism?.trim())
      return res.status(400).json({ ok: false, error: 'Ism majburiy' });

    // Maslahatchi mavjudligini va ruxsatni tekshirish
    const check = await pool.query('SELECT * FROM maslahatchilar WHERE id=$1', [id]);
    if (check.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Maslahatchi topilmadi' });

    // Admin faqat o'z maktabidagi maslahatchilarni tahrirlaydi
    if (!isSuper && check.rows[0].maktab_id !== adminMaktabId)
      return res.status(403).json({ ok: false, error: "Ruxsat yo'q" });

    let paramsArr, queryStr;

    if (new_parol?.trim()) {
      if (new_parol.trim().length < 6)
        return res.status(400).json({ ok: false, error: "Parol kamida 6 ta belgi bo'lishi kerak" });
      const hashed = await hashPassword(new_parol.trim());
      queryStr = `
        UPDATE maslahatchilar
        SET ism=$1, familiya=$2, telefon=$3, lavozim=$4,
            maktab_id=$5, komiss_summa=$6, username=$7, parol=$8, aktiv=$9
        WHERE id=$10
      `;
      paramsArr = [
        ism.trim(), (familiya||'').trim(), (telefon||'').trim(), (lavozim||'').trim(),
        isSuper ? (maktab_id ? parseInt(maktab_id,10) : null) : adminMaktabId,
        parseInt(komiss_summa,10)||0,
        new_username?.trim().toLowerCase() || check.rows[0].username,
        hashed,
        aktiv !== undefined ? aktiv : check.rows[0].aktiv,
        id
      ];
    } else {
      queryStr = `
        UPDATE maslahatchilar
        SET ism=$1, familiya=$2, telefon=$3, lavozim=$4,
            maktab_id=$5, komiss_summa=$6, username=$7, aktiv=$8
        WHERE id=$9
      `;
      paramsArr = [
        ism.trim(), (familiya||'').trim(), (telefon||'').trim(), (lavozim||'').trim(),
        isSuper ? (maktab_id ? parseInt(maktab_id,10) : null) : adminMaktabId,
        parseInt(komiss_summa,10)||0,
        new_username?.trim().toLowerCase() || check.rows[0].username,
        aktiv !== undefined ? aktiv : check.rows[0].aktiv,
        id
      ];
    }

    await pool.query(queryStr, paramsArr);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ ok: false, error: 'Bu username allaqachon mavjud' });
    console.error('PUT /maslahatchilar xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── DELETE /api/maslahatchilar/:id — o'chirish ──────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { isSuper } = req.user;
    if (!isSuper)
      return res.status(403).json({ ok: false, error: 'Faqat superadmin o\'chira oladi' });

    const id = parseInt(req.params.id, 10);

    // Maslahatchida leadlar bormi tekshirish
    const leads = await pool.query(
      'SELECT COUNT(*) FROM leadlar WHERE maslahatchi_id=$1', [id]
    );
    if (parseInt(leads.rows[0].count, 10) > 0)
      return res.status(400).json({
        ok: false,
        error: `Bu maslahatchida ${leads.rows[0].count} ta lead mavjud. Avval leadlarni boshqa maslahatchi ga o'tkazing.`
      });

    const result = await pool.query('DELETE FROM maslahatchilar WHERE id=$1', [id]);
    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Maslahatchi topilmadi' });

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /maslahatchilar xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/maslahatchilar/:id/stat — statistika ───────────────────────────
router.get('/:id/stat', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await pool.query(`
      SELECT
        COUNT(*)                                                         AS jami_lead,
        COUNT(*) FILTER (WHERE holat='yozildi' OR holat='tolov')       AS yozildi,
        COUNT(*) FILTER (WHERE holat='rad')                             AS rad,
        COUNT(*) FILTER (WHERE holat='muloqotda' OR holat='taklif')    AS jarayonda,
        SUM(komissiya_summa) FILTER (WHERE komissiya_holati='tolandi') AS tolangan_komissiya,
        SUM(komissiya_summa) FILTER (WHERE komissiya_holati='hisoblandi') AS kutilayotgan_komissiya
      FROM leadlar
      WHERE maslahatchi_id = $1
    `, [id]);

    const row = result.rows[0];
    const jami = parseInt(row.jami_lead, 10) || 0;
    const yozildi = parseInt(row.yozildi, 10) || 0;
    const konversiya = jami > 0 ? ((yozildi / jami) * 100).toFixed(1) + '%' : '0%';

    res.json({
      ok: true,
      stat: {
        jami_lead:              jami,
        yozildi:                yozildi,
        rad:                    parseInt(row.rad, 10) || 0,
        jarayonda:              parseInt(row.jarayonda, 10) || 0,
        konversiya,
        tolangan_komissiya:     parseInt(row.tolangan_komissiya, 10) || 0,
        kutilayotgan_komissiya: parseInt(row.kutilayotgan_komissiya, 10) || 0,
      }
    });
  } catch (err) {
    console.error('GET /maslahatchilar/stat xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

module.exports = router;