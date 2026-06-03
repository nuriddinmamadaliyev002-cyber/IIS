// ─── Jadval routes ───────────────────────────────────────────────────────────
// GET    /api/jadval                — dars jadvali (maktab_id bo'yicha)
// GET    /api/jadval/mening-jadvalim — o'quvchi uchun o'z o'qituvchilari jadvali
// POST   /api/jadval                — qo'shish yoki tahrirlash
// DELETE /api/jadval/:id            — o'chirish
// ─────────────────────────────────────────────────────────────────────────────
const { Router }      = require('express');
const pool            = require('../db');
const { requireAuth } = require('../middleware/jwt');

const router = Router();

// ─── GET /api/jadval/mening-jadvalim — O'quvchi uchun (o'z o'qituvchilari jadvali) ──
// ⚠️  Bu router.use(requireAuth(['admin'])) DAN OLDIN turishi SHART!
router.get('/mening-jadvalim', requireAuth(['oquvchi']), async (req, res) => {
  const { entityId, maktabId } = req.user;

  if (!entityId) {
    return res.status(400).json({ ok: false, error: "O'quvchi ID topilmadi" });
  }

  try {
    // 1) O'quvchiga biriktirilgan barcha o'qituvchilarni topamiz
    const teachersRes = await pool.query(
      `SELECT o.id, o.ism, o.familiya
       FROM oqituvchi_oquvchilar oo
       JOIN oqituvchilar o ON o.id = oo.oqituvchi_id
       WHERE oo.oquvchi_id = $1`,
      [entityId]
    );

    if (teachersRes.rowCount === 0) {
      return res.json({ ok: true, jadvallar: [], xabar: "Hali birorta o'qituvchi biriktirilmagan" });
    }

    const teacherIds = teachersRes.rows.map(t => t.id);

    // 2) O'sha o'qituvchilarning jadvallarini topamiz
    //    teacher_ism + teacher_familiya bo'yicha mos keladigan yozuvlarni olamiz
    //    (dars_jadvali jadvalida teacher_id yo'q, shuning uchun ism+familiya bo'yicha)
    const namePairs = teachersRes.rows.map(t =>
      `(LOWER(TRIM(teacher_familiya)) = LOWER('${t.familiya.replace(/'/g,"''")}') AND LOWER(TRIM(teacher_ism)) = LOWER('${t.ism.replace(/'/g,"''")}'))`
    ).join(' OR ');

    const jadvalRes = await pool.query(
      `SELECT id, teacher_ism, teacher_familiya, fan, sinflar, kunlar, boshlanish, tugash, maktab_id
       FROM dars_jadvali
       WHERE (${namePairs})
         AND (maktab_id = $1 OR $1 IS NULL)
       ORDER BY boshlanish`,
      [maktabId || null]
    );

    res.json({
      ok: true,
      jadvallar: jadvalRes.rows,
      oqituvchilar: teachersRes.rows
    });
  } catch (err) {
    console.error('jadval/mening-jadvalim xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

router.use(requireAuth(['admin']));

// ─── GET /api/jadval ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { targetMaktabId } = req.query;
  const { isSuper, maktabId } = req.user;
  const filterMaktabId = (isSuper && targetMaktabId) ? parseInt(targetMaktabId) : maktabId;

  try {
    let result;
    if (isSuper && !filterMaktabId) {
      result = await pool.query(
        `SELECT id, teacher_ism, teacher_familiya, fan, sinflar, kunlar, boshlanish, tugash, maktab_id
         FROM dars_jadvali ORDER BY teacher_ism, teacher_familiya, boshlanish`
      );
    } else {
      result = await pool.query(
        `SELECT id, teacher_ism, teacher_familiya, fan, sinflar, kunlar, boshlanish, tugash
         FROM dars_jadvali WHERE maktab_id=$1 ORDER BY teacher_ism, teacher_familiya, boshlanish`,
        [filterMaktabId]
      );
    }
    res.json({ ok: true, jadvallar: result.rows });
  } catch (err) {
    console.error('jadval GET xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/jadval — qo'shish yoki tahrirlash ─────────────────────────────
router.post('/', async (req, res) => {
  const p = req.body;
  const { isSuper, maktabId } = req.user;

  if (!p.teacher_ism || !p.teacher_familiya)
    return res.status(400).json({ ok: false, error: "O'qituvchi ismi kerak" });
  if (!p.sinflar) return res.status(400).json({ ok: false, error: 'Sinflar kerak' });
  if (!p.kunlar)  return res.status(400).json({ ok: false, error: 'Kunlar kerak' });

  try {
    if (p.id) {
      const result = await pool.query(
        `UPDATE dars_jadvali
           SET teacher_ism=$1, teacher_familiya=$2, fan=$3,
               sinflar=$4, kunlar=$5, boshlanish=$6, tugash=$7
         WHERE id=$8 ${!isSuper ? 'AND maktab_id=$9' : ''}`,
        isSuper
          ? [p.teacher_ism, p.teacher_familiya, p.fan || '', p.sinflar, p.kunlar, p.boshlanish || '', p.tugash || '', p.id]
          : [p.teacher_ism, p.teacher_familiya, p.fan || '', p.sinflar, p.kunlar, p.boshlanish || '', p.tugash || '', p.id, maktabId]
      );
      if (result.rowCount === 0)
        return res.status(404).json({ ok: false, error: 'Jadval topilmadi' });
    } else {
      await pool.query(
        `INSERT INTO dars_jadvali
           (maktab_id, teacher_ism, teacher_familiya, fan, sinflar, kunlar, boshlanish, tugash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [maktabId, p.teacher_ism, p.teacher_familiya, p.fan || '', p.sinflar, p.kunlar, p.boshlanish || '', p.tugash || '']
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('jadval POST xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── DELETE /api/jadval/:id ───────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { isSuper, maktabId } = req.user;

  try {
    const result = await pool.query(
      `DELETE FROM dars_jadvali WHERE id=$1 ${!isSuper ? 'AND maktab_id=$2' : ''}`,
      isSuper ? [req.params.id] : [req.params.id, maktabId]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Jadval topilmadi' });
    res.json({ ok: true });
  } catch (err) {
    console.error('jadval DELETE xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

module.exports = router;