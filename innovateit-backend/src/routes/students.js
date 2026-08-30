// ─── Students routes ─────────────────────────────────────────────────────────
// GET    /api/students           — ro'yxat (maktab_id bo'yicha)
// POST   /api/students           — qo'shish
// PUT    /api/students           — tahrirlash
// DELETE /api/students           — o'chirish
// POST   /api/students/inactive  — nofaolga o'tkazish
// GET    /api/students/inactive  — nofaollar ro'yxati
// POST   /api/students/activate  — faolga qaytarish
// PUT    /api/students/inactive  — nofaolni tahrirlash
// DELETE /api/students/inactive  — nofaolni o'chirish
//
// Filtr logikasi:
//   isSuper=true  → barcha o'quvchilar
//   isSuper=false → faqat o'z maktabidagi o'quvchilar (maktab_id)
// ─────────────────────────────────────────────────────────────────────────────
const { Router }      = require('express');
const pool            = require('../db');
const { requireAuth } = require('../middleware/jwt');

const router = Router();
router.use(requireAuth(['admin']));

function todayUZ() { return new Date().toLocaleDateString('ru-RU'); }

// ─── GET /api/students ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { isSuper, maktabId } = req.user;

  try {
    const querySuper = `
      SELECT o.*, m.nomi AS maktab_nomi,
             a.telegram_id AS admin_tg_id
      FROM oquvchilar o
      LEFT JOIN maktablar m ON m.id = o.maktab_id
      LEFT JOIN adminlar a ON a.maktab_id = o.maktab_id
      ORDER BY o.id
    `;
    const queryAdmin = `
      SELECT o.*, m.nomi AS maktab_nomi
      FROM oquvchilar o
      LEFT JOIN maktablar m ON m.id = o.maktab_id
      WHERE o.maktab_id=$1
      ORDER BY o.id
    `;

    const result = await pool.query(
      isSuper ? querySuper : queryAdmin,
      isSuper ? [] : [maktabId]
    );
    res.json({
      ok: true,
      students: result.rows.map(r => ({
        id:          r.id,
        ism:         r.ism,
        familiya:    r.familiya,
        maktabId:    r.maktab_id,
        maktab:      r.maktab_nomi || String(r.maktab_id || ''),
        maktabInfo:  r.maktab_info || '',
        sinf:        r.sinf,
        telefon:     r.telefon,
        telefon2:    r.telefon2,
        tug:         r.tug,
        manzil:      r.manzil,
        date:        r.qoshilgan,
        boshlagan:   r.boshlagan,
        telegram_id: r.telegram_id,
        avatar:      r.avatar || null,
      }))
    });
  } catch (err) {
    console.error('students GET xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/students ───────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const p = req.body;
  const { isSuper, maktabId } = req.user;

  // Superadmin body dan maktabId yuborishi mumkin, admin esa o'z maktabini ishlatadi
  const targetMaktabId = isSuper
    ? (p.maktabId ? parseInt(p.maktabId) : null)
    : (maktabId || null);

  try {
    await pool.query(
      `INSERT INTO oquvchilar
         (ism, familiya, sinf, telefon, telefon2, tug, manzil,
          qoshilgan, boshlagan, maktab_id, maktab_info, avatar)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        p.ism, p.familiya,
        p.sinf,
        p.telefon, p.telefon2 || '',
        p.tug, p.manzil || '',
        p.date || todayUZ(),
        p.boshlagan || '',
        targetMaktabId,
        p.maktabInfo || '',
        (p.avatar === 'erkak' || p.avatar === 'ayol') ? p.avatar : null,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('students POST xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── PUT /api/students ────────────────────────────────────────────────────────
// Body: { id, ism, familiya, sinf, telefon, telefon2, tug, manzil, boshlagan }
router.put('/', async (req, res) => {
  const p = req.body;
  const { isSuper, maktabId } = req.user;

  // id yoki ism+familiya bilan topish (eski frontend compatibility)
  const hasId = p.id && !isNaN(parseInt(p.id));

  if (!hasId && !(p.oldIsm && p.oldFamiliya) && !(p.ism && p.familiya)) {
    return res.status(400).json({ ok: false, error: 'id yoki ism/familiya majburiy' });
  }

  try {
    // Faqat 'erkak' yoki 'ayol' qiymatlari qabul qilinadi, aks holda NULL
    const avatarVal = (p.avatar === 'erkak' || p.avatar === 'ayol') ? p.avatar : null;

    // Agar id yo'q bo'lsa ism+familiya orqali topamiz
    let targetId = hasId ? parseInt(p.id) : null;
    if (!targetId) {
      const findQ = isSuper
        ? 'SELECT id FROM oquvchilar WHERE ism=$1 AND familiya=$2 LIMIT 1'
        : 'SELECT id FROM oquvchilar WHERE ism=$1 AND familiya=$2 AND maktab_id=$3 LIMIT 1';
      const findP = isSuper
        ? [p.oldIsm || p.ism, p.oldFamiliya || p.familiya]
        : [p.oldIsm || p.ism, p.oldFamiliya || p.familiya, maktabId];
      const found = await pool.query(findQ, findP);
      if (found.rows.length === 0)
        return res.status(404).json({ ok: false, error: "O'quvchi topilmadi" });
      targetId = found.rows[0].id;
    }

    let result;
    if (isSuper) {
      // Superadmin: maktab_id ni yangilashi mumkin
      // Ustuvorlik: p.maktabId (raqamli ID) > p.maktab (nom bo'yicha qidirish)
      let maktabIdNew = null;

      if (p.maktabId && !isNaN(parseInt(p.maktabId))) {
        // To'g'ridan ID bilan — eng to'g'ri va tezkor usul
        const mCheck = await pool.query(
          'SELECT id FROM maktablar WHERE id=$1',
          [parseInt(p.maktabId)]
        );
        if (mCheck.rows.length > 0) {
          maktabIdNew = mCheck.rows[0].id;
        }
      } else if (p.maktab) {
        // Orqaga muvofiqliq uchun nom bo'yicha qidirish (eski frontend)
        const maktabNomi = String(p.maktab).trim();
        const mCheck = await pool.query(
          `SELECT id FROM maktablar WHERE nomi=$1 OR nomi=$2 LIMIT 1`,
          [maktabNomi, maktabNomi + '-maktab']
        );
        if (mCheck.rows.length > 0) {
          maktabIdNew = mCheck.rows[0].id;
        }
      }

      if (maktabIdNew) {
        result = await pool.query(
          `UPDATE oquvchilar
             SET ism=$1, familiya=$2, sinf=$3,
                 telefon=$4, telefon2=$5, tug=$6, manzil=$7, boshlagan=$8,
                 maktab_id=$10, maktab_info=$11, avatar=$12
           WHERE id=$9`,
          [p.ism, p.familiya, p.sinf, p.telefon, p.telefon2 || '',
           p.tug || null, p.manzil || '', p.boshlagan || '', targetId, maktabIdNew,
           p.maktabInfo || '', avatarVal]
        );
      } else {
        result = await pool.query(
          `UPDATE oquvchilar
             SET ism=$1, familiya=$2, sinf=$3,
                 telefon=$4, telefon2=$5, tug=$6, manzil=$7, boshlagan=$8,
                 maktab_info=$10, avatar=$11
           WHERE id=$9`,
          [p.ism, p.familiya, p.sinf, p.telefon, p.telefon2 || '',
           p.tug || null, p.manzil || '', p.boshlagan || '', targetId,
           p.maktabInfo || '', avatarVal]
        );
      }
    } else {
      result = await pool.query(
        `UPDATE oquvchilar
           SET ism=$1, familiya=$2, sinf=$3,
               telefon=$4, telefon2=$5, tug=$6, manzil=$7, boshlagan=$8,
               maktab_info=$10, avatar=$12
         WHERE id=$9 AND maktab_id=$11`,
        [p.ism, p.familiya, p.sinf, p.telefon, p.telefon2 || '',
         p.tug || null, p.manzil || '', p.boshlagan || '', targetId,
         p.maktabInfo || '', maktabId, avatarVal]
      );
    }
    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: "O'quvchi topilmadi" });
    res.json({ ok: true });
  } catch (err) {
    console.error('students PUT xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi: ' + err.message });
  }
});

// ─── DELETE /api/students ─────────────────────────────────────────────────────
// Body: { id }
router.delete('/', async (req, res) => {
  const p = req.body;
  const { isSuper, maktabId } = req.user;

  if (!p.id) return res.status(400).json({ ok: false, error: 'id majburiy' });

  try {
    const result = await pool.query(
      `DELETE FROM oquvchilar
       WHERE id=$1
         ${!isSuper ? 'AND maktab_id=$2' : ''}`,
      isSuper ? [p.id] : [p.id, maktabId]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: "O'quvchi topilmadi" });
    res.json({ ok: true });
  } catch (err) {
    console.error('students DELETE xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/students/inactive — nofaolga o'tkazish ────────────────────────
// Body: { id, izoh, chiqgan? }
router.post('/inactive', async (req, res) => {
  const p = req.body;
  const { isSuper, maktabId } = req.user;

  const izoh = (p.izoh || '').trim();
  if (!izoh) return res.status(400).json({ ok: false, error: 'Chiqish sababi (izoh) majburiy' });
  if (izoh.length < 10) return res.status(400).json({ ok: false, error: "Chiqish sababi kamida 10 ta belgi bo'lishi kerak" });

  const hasId = p.id && !isNaN(parseInt(p.id));
  if (!hasId && !(p.delIsm && p.delFamiliya)) {
    return res.status(400).json({ ok: false, error: 'id yoki delIsm/delFamiliya majburiy' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let findResult;
    if (hasId) {
      findResult = await client.query(
        `SELECT * FROM oquvchilar
         WHERE id=$1
           ${!isSuper ? 'AND maktab_id=$2' : ''} LIMIT 1`,
        isSuper ? [parseInt(p.id)] : [parseInt(p.id), maktabId]
      );
    } else {
      findResult = await client.query(
        `SELECT * FROM oquvchilar
         WHERE ism=$1 AND familiya=$2
           ${!isSuper ? 'AND maktab_id=$3' : ''} LIMIT 1`,
        isSuper ? [p.delIsm, p.delFamiliya] : [p.delIsm, p.delFamiliya, maktabId]
      );
    }
    if (findResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: "O'quvchi topilmadi" });
    }

    const s = findResult.rows[0];
    await client.query(
      `INSERT INTO nofaol_oquvchilar
         (ism, familiya, sinf, telefon, telefon2, tug, manzil,
          qoshilgan, boshlagan, chiqgan, izoh, maktab_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [s.ism, s.familiya, s.sinf, s.telefon, s.telefon2,
       s.tug, s.manzil, s.qoshilgan, s.boshlagan,
       p.chiqgan || todayUZ(), izoh, s.maktab_id]
    );
    await client.query('DELETE FROM oquvchilar WHERE id=$1', [s.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('inactive POST xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  } finally {
    client.release();
  }
});

// ─── GET /api/students/inactive ───────────────────────────────────────────────
router.get('/inactive', async (req, res) => {
  const { isSuper, maktabId } = req.user;

  try {
    const query  = isSuper
      ? 'SELECT * FROM nofaol_oquvchilar ORDER BY id'
      : 'SELECT * FROM nofaol_oquvchilar WHERE maktab_id=$1 ORDER BY id';
    const params = isSuper ? [] : [maktabId];

    const result = await pool.query(query, params);
    res.json({
      ok: true,
      students: result.rows.map(r => ({
        id:        r.id,
        ism:       r.ism,
        familiya:  r.familiya,
        maktabId:  r.maktab_id,
        sinf:      r.sinf,
        telefon:   r.telefon,
        telefon2:  r.telefon2,
        tug:       r.tug,
        manzil:    r.manzil,
        date:      r.qoshilgan,
        boshlagan: r.boshlagan,
        chiqgan:   r.chiqgan,
        izoh:      r.izoh || '',
      }))
    });
  } catch (err) {
    console.error('inactive GET xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/students/activate — faolga qaytarish ──────────────────────────
// Body: { id }
router.post('/activate', async (req, res) => {
  const p = req.body;
  const { isSuper, maktabId } = req.user;

  if (!p.id) return res.status(400).json({ ok: false, error: 'id majburiy' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const findResult = await client.query(
      `SELECT * FROM nofaol_oquvchilar
       WHERE id=$1
         ${!isSuper ? 'AND maktab_id=$2' : ''} LIMIT 1`,
      isSuper ? [p.id] : [p.id, maktabId]
    );
    if (findResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: "O'quvchi topilmadi" });
    }

    const s = findResult.rows[0];
    await client.query(
      `INSERT INTO oquvchilar
         (ism, familiya, sinf, telefon, telefon2, tug, manzil,
          qoshilgan, boshlagan, maktab_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [s.ism, s.familiya, s.sinf, s.telefon, s.telefon2,
       s.tug, s.manzil, s.qoshilgan, s.boshlagan, s.maktab_id]
    );
    await client.query('DELETE FROM nofaol_oquvchilar WHERE id=$1', [s.id]);

    // Yangi ID ni olish
    const newStudent = await client.query(
      'SELECT id FROM oquvchilar WHERE ism=$1 AND familiya=$2 AND maktab_id=$3 ORDER BY id DESC LIMIT 1',
      [s.ism, s.familiya, s.maktab_id]
    );
    if (newStudent.rows.length > 0) {
      const newId = newStudent.rows[0].id;
      // telegram_users da entity_id ni yangilash
      await client.query(
        'UPDATE telegram_users SET entity_id=$1 WHERE entity_id=$2 AND entity_table=$3',
        [newId, s.id, 'oquvchilar']
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('activate POST xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  } finally {
    client.release();
  }
});

// ─── PUT /api/students/inactive — nofaolni tahrirlash ────────────────────────
// Body: { id, chiqgan, izoh }
router.put('/inactive', async (req, res) => {
  const p = req.body;
  const { isSuper, maktabId } = req.user;

  const chiqgan = (p.chiqgan || '').trim();
  const izoh    = (p.izoh    || '').trim();
  if (!p.id)   return res.status(400).json({ ok: false, error: 'id majburiy' });
  if (!chiqgan) return res.status(400).json({ ok: false, error: 'Chiqgan sana majburiy' });
  if (!izoh || izoh.length < 10)
    return res.status(400).json({ ok: false, error: "Chiqish sababi kamida 10 ta belgi bo'lishi kerak" });

  try {
    const result = await pool.query(
      `UPDATE nofaol_oquvchilar
         SET chiqgan=$1, izoh=$2
       WHERE id=$3
         ${!isSuper ? 'AND maktab_id=$4' : ''}`,
      isSuper
        ? [chiqgan, izoh, p.id]
        : [chiqgan, izoh, p.id, maktabId]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: "O'quvchi topilmadi" });
    res.json({ ok: true });
  } catch (err) {
    console.error('inactive PUT xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── DELETE /api/students/inactive ───────────────────────────────────────────
// Body: { id }
router.delete('/inactive', async (req, res) => {
  const p = req.body;
  const { isSuper, maktabId } = req.user;

  if (!p.id) return res.status(400).json({ ok: false, error: 'id majburiy' });

  try {
    const result = await pool.query(
      `DELETE FROM nofaol_oquvchilar
       WHERE id=$1
         ${!isSuper ? 'AND maktab_id=$2' : ''}`,
      isSuper ? [p.id] : [p.id, maktabId]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: "O'quvchi topilmadi" });
    res.json({ ok: true });
  } catch (err) {
    console.error('inactive DELETE xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

module.exports = router;