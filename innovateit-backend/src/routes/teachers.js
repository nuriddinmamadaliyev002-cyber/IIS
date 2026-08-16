// ─── Teachers routes ───────────────────────────────
// GET    /api/teachers              — ro'yxat
// POST   /api/teachers              — qo'shish
// PUT    /api/teachers              — tahrirlash
// DELETE /api/teachers              — o'chirish
// POST   /api/teachers/maktab       — superadmin: maktab biriktirish
// DELETE /api/teachers/maktab       — superadmin: maktabdan ajratish
const { Router } = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/jwt');

const router = Router();

// ─── GET /api/teachers/:teacherId/oquvchilar ──────────────────────────────────
// ⚠️  Bu route router.use(requireAuth(['admin'])) DAN OLDIN turishi SHART!
//     Chunki oqituvchi roli ham kirishi kerak.
router.get('/:teacherId/oquvchilar', requireAuth(['admin', 'oqituvchi']), async (req, res) => {
  const teacherId = parseInt(req.params.teacherId);
  if (isNaN(teacherId)) return res.status(400).json({ ok: false, error: 'teacherId noto\'g\'ri' });

  try {
    const result = await pool.query(`
      SELECT o.id, o.ism, o.familiya, o.sinf, o.maktab_id,
             m.nomi AS maktab_nomi
      FROM oqituvchi_oquvchilar oo
      JOIN oquvchilar o ON o.id = oo.oquvchi_id
      LEFT JOIN maktablar m ON m.id = o.maktab_id
      WHERE oo.oqituvchi_id = $1
      ORDER BY o.sinf, o.familiya, o.ism
    `, [teacherId]);

    res.json({ ok: true, oquvchilar: result.rows });
  } catch (err) {
    console.error('GET /:teacherId/oquvchilar xatolik:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.use(requireAuth(['admin']));
function todayUZ() { return new Date().toLocaleDateString('ru-RU'); }

// ─── GET /api/teachers ───
router.get('/', async (req, res) => {
  try {
    const { maktabId, isSuper } = req.user;

    let rows;
    if (isSuper) {
      // Superadmin: barcha o'qituvchilar + biriktirilgan maktablar (id va nomi)
      const result = await pool.query(`
        SELECT
          o.id, o.ism, o.familiya, o.fan, o.telefon, o.telefon2,
          o.kunlar, o.sinflar, o.boshlanish, o.tugash, o.qoshilgan,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT('id', m.id, 'nomi', m.nomi)
              ORDER BY m.nomi
            ) FILTER (WHERE m.id IS NOT NULL),
            '[]'
          ) AS maktablar
        FROM oqituvchilar o
        LEFT JOIN oqituvchi_maktablar om ON o.id = om.oqituvchi_id
        LEFT JOIN maktablar m ON m.id = om.maktab_id
        GROUP BY o.id
        ORDER BY o.id
      `);
      rows = result.rows;
    } else {
      // Oddiy admin: faqat o'z maktabiga biriktirilgan o'qituvchilar
      const result = await pool.query(`
        SELECT
          o.id, o.ism, o.familiya, o.fan, o.telefon, o.telefon2,
          o.kunlar, o.sinflar, o.boshlanish, o.tugash, o.qoshilgan,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT('id', m.id, 'nomi', m.nomi)
              ORDER BY m.nomi
            ) FILTER (WHERE m.id IS NOT NULL),
            '[]'
          ) AS maktablar
        FROM oqituvchilar o
        INNER JOIN oqituvchi_maktablar om ON o.id = om.oqituvchi_id
        LEFT JOIN maktablar m ON m.id = om.maktab_id
        WHERE om.maktab_id = $1
        GROUP BY o.id
        ORDER BY o.id
      `, [maktabId]);
      rows = result.rows;
    }

    res.json({
      ok: true,
      teachers: rows.map(r => ({
        id:         r.id,
        ism:        r.ism,
        familiya:   r.familiya,
        fan:        r.fan,
        telefon:    r.telefon,
        telefon2:   r.telefon2,
        kunlar:     r.kunlar,
        sinflar:    r.sinflar,
        boshlanish: r.boshlanish,
        tugash:     r.tugash,
        date:       r.qoshilgan,
        maktablar:  Array.isArray(r.maktablar) ? r.maktablar : []
      }))
    });
  } catch (err) {
    console.error('GET /teachers xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi: ' + err.message });
  }
});

// ─── POST /api/teachers — qo'shish (faqat superadmin) ───
router.post('/', async (req, res) => {
  const p = req.body;
  const { username, isSuper } = req.user;
  if (!isSuper) return res.status(403).json({ ok: false, error: "Faqat superadmin o'qituvchi qo'sha oladi" });
  if (!(p.ism||'').trim())      return res.status(400).json({ ok: false, error: 'Ism kiritilmagan' });
  if (!(p.familiya||'').trim()) return res.status(400).json({ ok: false, error: 'Familiya kiritilmagan' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ins = await client.query(
      `INSERT INTO oqituvchilar (ism,familiya,fan,telefon,telefon2,kunlar,sinflar,boshlanish,tugash,qoshilgan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [p.ism.trim(), p.familiya.trim(), p.fan||'', p.telefon||'', p.telefon2||'',
       p.kunlar||'', p.sinflar||'', p.boshlanish||'', p.tugash||'', p.date||todayUZ()]
    );
    const teacherId = ins.rows[0].id;

    // Superadmin o'qituvchi qo'shganda avtomatik biriktirmaymiz
    // (superadmin maktabga ega emas, biriktirish keyinroq qilinadi)

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /teachers xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi: ' + err.message });
  } finally { client.release(); }
});

// ─── PUT /api/teachers — tahrirlash (faqat superadmin) ───
router.put('/', async (req, res) => {
  const p = req.body;
  const { username, isSuper } = req.user;
  if (!isSuper) return res.status(403).json({ ok: false, error: "Faqat superadmin o'qituvchini tahrirlay oladi" });

  let whereClause, params;
  if (p.id) {
    whereClause = 'WHERE id=$10';
    params = [p.ism, p.familiya, p.fan, p.telefon, p.telefon2||'',
              p.kunlar||'', p.sinflar||'', p.boshlanish||'', p.tugash||'', p.id];
  } else {
    whereClause = 'WHERE ism=$10 AND familiya=$11';
    params = [p.ism, p.familiya, p.fan, p.telefon, p.telefon2||'',
              p.kunlar||'', p.sinflar||'', p.boshlanish||'', p.tugash||'', p.oldIsm, p.oldFamiliya];
  }

  try {
    const result = await pool.query(
      `UPDATE oqituvchilar SET ism=$1,familiya=$2,fan=$3,telefon=$4,telefon2=$5,kunlar=$6,sinflar=$7,boshlanish=$8,tugash=$9 ${whereClause}`,
      params
    );
    if (result.rowCount === 0) return res.status(404).json({ ok: false, error: "O'qituvchi topilmadi" });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /teachers xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi: ' + err.message });
  }
});

// ─── DELETE /api/teachers — o'chirish (faqat superadmin) ───
router.delete('/', async (req, res) => {
  const { delIsm, delFamiliya, delId } = req.body;
  const { isSuper } = req.user;
  if (!isSuper) return res.status(403).json({ ok: false, error: "Faqat superadmin o'qituvchini o'chira oladi" });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let teacherId = delId;
    if (!teacherId) {
      const found = await client.query(
        'SELECT id FROM oqituvchilar WHERE ism=$1 AND familiya=$2 LIMIT 1',
        [delIsm, delFamiliya]
      );
      if (found.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ ok: false, error: "O'qituvchi topilmadi" });
      }
      teacherId = found.rows[0].id;
    }

    await client.query('DELETE FROM oqituvchilar WHERE id=$1', [teacherId]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('DELETE /teachers xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi: ' + err.message });
  } finally { client.release(); }
});

// ─── POST /api/teachers/biriktiruv — maktabId orqali biriktirish ─────────────
router.post('/biriktiruv', async (req, res) => {
  if (!req.user.isSuper) return res.status(403).json({ ok: false, error: "Faqat superadmin uchun" });

  const { teacherId, maktabId } = req.body;
  if (!teacherId || !maktabId)
    return res.status(400).json({ ok: false, error: 'teacherId va maktabId kerak' });

  const tid = parseInt(teacherId, 10);
  const mid = parseInt(maktabId, 10);
  if (isNaN(tid) || isNaN(mid))
    return res.status(400).json({ ok: false, error: "teacherId va maktabId son bo'lishi kerak" });

  try {
    const teacherFound = await pool.query('SELECT id FROM oqituvchilar WHERE id=$1', [tid]);
    if (teacherFound.rows.length === 0)
      return res.status(404).json({ ok: false, error: "O'qituvchi topilmadi" });

    const maktabFound = await pool.query('SELECT id FROM maktablar WHERE id=$1', [mid]);
    if (maktabFound.rows.length === 0)
      return res.status(404).json({ ok: false, error: "Maktab topilmadi" });

    // Allaqachon biriktirilganmi tekshirish
    const exists = await pool.query(
      'SELECT 1 FROM oqituvchi_maktablar WHERE oqituvchi_id=$1 AND maktab_id=$2',
      [tid, mid]
    );
    if (exists.rows.length > 0)
      return res.json({ ok: true }); // idempotent — xato emas

    await pool.query(
      'INSERT INTO oqituvchi_maktablar (oqituvchi_id, maktab_id) VALUES ($1, $2)',
      [tid, mid]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /teachers/biriktiruv xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi: ' + err.message });
  }
});

// ─── DELETE /api/teachers/biriktiruv — maktabId orqali ajratish ──────────────
router.delete('/biriktiruv', async (req, res) => {
  if (!req.user.isSuper) return res.status(403).json({ ok: false, error: "Faqat superadmin uchun" });

  const { teacherId, maktabId } = req.body;
  if (!teacherId || !maktabId)
    return res.status(400).json({ ok: false, error: 'teacherId va maktabId kerak' });

  const tid = parseInt(teacherId, 10);
  const mid = parseInt(maktabId, 10);
  if (isNaN(tid) || isNaN(mid))
    return res.status(400).json({ ok: false, error: "teacherId va maktabId son bo'lishi kerak" });

  try {
    const result = await pool.query(
      'DELETE FROM oqituvchi_maktablar WHERE oqituvchi_id=$1 AND maktab_id=$2',
      [tid, mid]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: "Bog'lanish topilmadi" });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /teachers/biriktiruv xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi: ' + err.message });
  }
});

// ─── POST /api/teachers/maktab — adminUsername orqali biriktirish (eski) ─────
router.post('/maktab', async (req, res) => {
  try {
    const { teacherId, adminUsername } = req.body;

    if (!req.user.isSuper) return res.status(403).json({ ok: false, error: "Faqat superadmin uchun" });
    if (!teacherId || !adminUsername) return res.status(400).json({ ok: false, error: 'teacherId va adminUsername kerak' });

    const tid = parseInt(teacherId, 10);
    if (isNaN(tid)) return res.status(400).json({ ok: false, error: "teacherId son bo'lishi kerak" });

    // O'qituvchi mavjudligini tekshirish
    const teacherFound = await pool.query('SELECT id FROM oqituvchilar WHERE id=$1', [tid]);
    if (teacherFound.rows.length === 0) return res.status(404).json({ ok: false, error: "O'qituvchi topilmadi" });

    // Admin topish va uning maktab_id sini olish
    const adminFound = await pool.query(
      'SELECT username, maktab_id FROM adminlar WHERE username=$1',
      [adminUsername]
    );
    if (adminFound.rows.length === 0) return res.status(404).json({ ok: false, error: `"${adminUsername}" admin topilmadi` });

    const adminRow  = adminFound.rows[0];
    const maktabId  = adminRow.maktab_id || null;

    // Allaqachon biriktirilganmi tekshirish (ON CONFLICT ishlatilmaydi — constraint yo'q bo'lishi mumkin)
    const exists = await pool.query(
      'SELECT 1 FROM oqituvchi_maktablar WHERE oqituvchi_id=$1 AND maktab_id=$2',
      [tid, maktabId]
    );
    if (exists.rows.length === 0) {
      await pool.query(
        'INSERT INTO oqituvchi_maktablar (oqituvchi_id, maktab_id) VALUES ($1, $2)',
        [tid, maktabId]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /maktab xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi: ' + err.message });
  }
});

// ─── DELETE /api/teachers/maktab — superadmin: maktabdan ajratish ───
// body: { teacherId, adminUsername }
router.delete('/maktab', async (req, res) => {
  try {
    const { teacherId, adminUsername } = req.body;

    if (!req.user.isSuper) return res.status(403).json({ ok: false, error: "Faqat superadmin uchun" });
    if (!teacherId || !adminUsername) return res.status(400).json({ ok: false, error: 'teacherId va adminUsername kerak' });

    const tid = parseInt(teacherId, 10);
    if (isNaN(tid)) return res.status(400).json({ ok: false, error: "teacherId son bo'lishi kerak" });

    // adminUsername orqali maktab_id ni topish
    const adminFound = await pool.query(
      'SELECT maktab_id FROM adminlar WHERE username=$1',
      [adminUsername]
    );
    if (adminFound.rows.length === 0) return res.status(404).json({ ok: false, error: `"${adminUsername}" admin topilmadi` });
    const maktabId = adminFound.rows[0].maktab_id;
    if (!maktabId) return res.status(400).json({ ok: false, error: "Bu adminga maktab biriktirilmagan" });

    const result = await pool.query(
      'DELETE FROM oqituvchi_maktablar WHERE oqituvchi_id=$1 AND maktab_id=$2',
      [tid, maktabId]
    );
    if (result.rowCount === 0) return res.status(404).json({ ok: false, error: "Bog'lanish topilmadi" });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /maktab xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi: ' + err.message });
  }
});

// ─── POST /api/teachers/merge — superadmin: ikki o'qituvchini birlashtirish ───
router.post('/merge', async (req, res) => {
  const { keepId, removeId, ism, familiya, telefon, telefon2 } = req.body;

  if (!req.user.isSuper) return res.status(403).json({ ok: false, error: 'Faqat superadmin uchun' });
  if (!keepId || !removeId) return res.status(400).json({ ok: false, error: 'keepId va removeId kerak' });
  if (keepId === removeId) return res.status(400).json({ ok: false, error: "Bir xil o'qituvchi tanlangan" });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const both = await client.query(
      'SELECT id, ism, familiya FROM oqituvchilar WHERE id = ANY($1)',
      [[keepId, removeId]]
    );
    if (both.rows.length < 2) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: "O'qituvchilardan biri topilmadi" });
    }

    await client.query(
      `UPDATE oqituvchilar SET ism=$1, familiya=$2, telefon=$3, telefon2=$4 WHERE id=$5`,
      [(ism||'').trim(), (familiya||'').trim(), (telefon||'').trim(), (telefon2||'').trim(), keepId]
    );

    // oqituvchi_maktablar: removeId maktablarini keepId ga ko'chirish
    await client.query(`
      INSERT INTO oqituvchi_maktablar (oqituvchi_id, maktab_id)
      SELECT $1, maktab_id FROM oqituvchi_maktablar WHERE oqituvchi_id = $2
      ON CONFLICT (oqituvchi_id, maktab_id) DO NOTHING
    `, [keepId, removeId]);

    const newFullIsm = (familiya||'').trim() + ' ' + (ism||'').trim();
    const removeRow  = both.rows.find(r => r.id == removeId);
    const removeFullIsm = removeRow.familiya + ' ' + removeRow.ism;

    await client.query(`
      UPDATE oqituvchilar_davomat
      SET oqituvchi_ism = $1
      WHERE oqituvchi_ism = $2 OR oqituvchi_ism = $3 OR oqituvchi_ism = $4
    `, [newFullIsm, removeFullIsm, removeRow.ism, removeRow.familiya]);

    await client.query(`
      UPDATE dars_jadvali
      SET teacher_ism = $1, teacher_familiya = $2
      WHERE teacher_ism = $3 AND teacher_familiya = $4
    `, [(ism||'').trim(), (familiya||'').trim(), removeRow.ism, removeRow.familiya]);

    const keepPortfolio = await client.query(
      'SELECT id FROM oqituvchi_portfolio WHERE oqituvchi_id = $1', [keepId]
    );
    if (keepPortfolio.rows.length === 0) {
      await client.query(
        'UPDATE oqituvchi_portfolio SET oqituvchi_id = $1 WHERE oqituvchi_id = $2',
        [keepId, removeId]
      );
    }

    await client.query(
      'UPDATE oqituvchi_sertifikat_fayllar SET oqituvchi_id = $1 WHERE oqituvchi_id = $2',
      [keepId, removeId]
    );

    await client.query(`
      INSERT INTO viewer_teachers (viewer_username, teacher_id)
      SELECT viewer_username, $1 FROM viewer_teachers WHERE teacher_id = $2
      ON CONFLICT (viewer_username, teacher_id) DO NOTHING
    `, [keepId, removeId]);

    await client.query('DELETE FROM oqituvchilar WHERE id = $1', [removeId]);

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('merge xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi: ' + err.message });
  } finally {
    client.release();
  }
});

// ─── GET /api/teachers/sinf-oquvchilar?sinf=5&maktabId=2 ─────────────────────
// Berilgan sinf va maktabdagi barcha o'quvchilar + ular biriktirilganmi
router.get('/sinf-oquvchilar', async (req, res) => {
  const { sinf, maktabId, teacherId } = req.query;
  if (!sinf || !maktabId) return res.status(400).json({ ok: false, error: 'sinf va maktabId kerak' });

  try {
    const result = await pool.query(`
      SELECT
        o.id, o.ism, o.familiya, o.sinf,
        CASE WHEN oo.oquvchi_id IS NOT NULL THEN true ELSE false END AS biriktirilgan
      FROM oquvchilar o
      LEFT JOIN oqituvchi_oquvchilar oo
        ON oo.oquvchi_id = o.id AND oo.oqituvchi_id = $3
      WHERE o.maktab_id = $1 AND o.sinf = $2
      ORDER BY o.familiya, o.ism
    `, [parseInt(maktabId), sinf, parseInt(teacherId) || 0]);

    res.json({ ok: true, oquvchilar: result.rows });
  } catch (err) {
    console.error('GET /sinf-oquvchilar xatolik:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/teachers/oquvchi-birik — o'quvchilarni biriktirish ─────────────
// body: { teacherId, oquvchiIds: [1, 2, 3, ...], sinf, maktabId }
// Avvalgi birikmalari o'chirilib, yangi ro'yxat saqlanadi (upsert)
router.post('/oquvchi-birik', async (req, res) => {
  const { teacherId, oquvchiIds, sinf, maktabId } = req.body;
  if (!teacherId || !sinf || !maktabId)
    return res.status(400).json({ ok: false, error: 'teacherId, sinf, maktabId kerak' });

  const tid  = parseInt(teacherId);
  const mid  = parseInt(maktabId);
  const ids  = Array.isArray(oquvchiIds) ? oquvchiIds.map(Number).filter(n => !isNaN(n)) : [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Shu sinf + maktab uchun avvalgi birikmalarni o'chirish
    await client.query(`
      DELETE FROM oqituvchi_oquvchilar
      WHERE oqituvchi_id = $1
        AND oquvchi_id IN (
          SELECT id FROM oquvchilar WHERE sinf = $2 AND maktab_id = $3
        )
    `, [tid, sinf, mid]);

    // Yangi birikmalarni qo'shish
    if (ids.length > 0) {
      const values = ids.map((_, i) => `($1, $${i + 2})`).join(', ');
      await client.query(
        `INSERT INTO oqituvchi_oquvchilar (oqituvchi_id, oquvchi_id) VALUES ${values}
         ON CONFLICT (oqituvchi_id, oquvchi_id) DO NOTHING`,
        [tid, ...ids]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, biriktirildi: ids.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /oquvchi-birik xatolik:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;