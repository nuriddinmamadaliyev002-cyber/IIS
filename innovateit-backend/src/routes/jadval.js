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
  const { entityId, maktabId, sinf } = req.user;

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

    // 2) O'sha o'qituvchilarning jadvallarini topamiz
    //    teacher_ism + teacher_familiya bo'yicha mos keladigan yozuvlarni olamiz
    const namePairs = teachersRes.rows.map(t =>
      `(LOWER(TRIM(teacher_familiya)) = LOWER('${t.familiya.replace(/'/g,"''")}') AND LOWER(TRIM(teacher_ism)) = LOWER('${t.ism.replace(/'/g,"''")}'))`
    ).join(' OR ');

    // 3) O'quvchining sinfi bo'yicha filtrlash
    //    sinflar maydoni: "4-sinf" yoki "4-sinf, 8-sinf" ko'rinishida bo'lishi mumkin
    let sinfFilter = '';
    const sinfParams = [maktabId || null];

    if (sinf) {
      // "8-sinf" → "8-sinf" yoki "8" ikkalasini ham qidirish
      const sinfClean = sinf.replace(/-sinf$/i, '').trim();
      sinfParams.push(`%${sinf}%`);
      sinfParams.push(`%${sinfClean}%`);
      sinfFilter = `AND (LOWER(sinflar) LIKE LOWER($2) OR LOWER(sinflar) LIKE LOWER($3))`;
    }

    const jadvalRes = await pool.query(
      `SELECT id, teacher_ism, teacher_familiya, fan, sinflar, kunlar, boshlanish, tugash, maktab_id
       FROM dars_jadvali
       WHERE (${namePairs})
         AND (maktab_id = $1 OR $1 IS NULL)
         ${sinfFilter}
       ORDER BY boshlanish`,
      sinfParams
    );

    res.json({
      ok: true,
      jadvallar: jadvalRes.rows,
      oqituvchilar: teachersRes.rows,
      sinf: sinf || null
    });
  } catch (err) {
    console.error('jadval/mening-jadvalim xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/jadval/mening-jadvalim-oqituvchi — O'qituvchi uchun o'z jadvali ──
router.get('/mening-jadvalim-oqituvchi', requireAuth(['oqituvchi']), async (req, res) => {
  const { ism, entityId, maktabIdlar } = req.user;

  if (!entityId) {
    return res.status(400).json({ ok: false, error: "O'qituvchi ID topilmadi" });
  }

  try {
    // O'qituvchining ismi bo'yicha dars_jadvali dan qidirish
    // ism = "Familiya Ism" formatida
    const ismParts = (ism || '').trim().split(' ');
    const familiya = ismParts[0] || '';
    const ismOnly  = ismParts.slice(1).join(' ') || '';

    // Maktablar bo'yicha filtrlash
    const maktabIds = maktabIdlar || [];

    let jadvalRes;
    if (maktabIds.length > 0) {
      jadvalRes = await pool.query(
        `SELECT id, teacher_ism, teacher_familiya, fan, sinflar, kunlar, boshlanish, tugash, maktab_id
         FROM dars_jadvali
         WHERE LOWER(TRIM(teacher_familiya)) = LOWER($1)
           AND LOWER(TRIM(teacher_ism))      = LOWER($2)
           AND maktab_id = ANY($3)
         ORDER BY boshlanish`,
        [familiya, ismOnly, maktabIds]
      );
    } else {
      jadvalRes = await pool.query(
        `SELECT id, teacher_ism, teacher_familiya, fan, sinflar, kunlar, boshlanish, tugash, maktab_id
         FROM dars_jadvali
         WHERE LOWER(TRIM(teacher_familiya)) = LOWER($1)
           AND LOWER(TRIM(teacher_ism))      = LOWER($2)
         ORDER BY boshlanish`,
        [familiya, ismOnly]
      );
    }

    // O'qituvchi ma'lumotlari (rejalangan soatlar uchun)
    const teacherRes = await pool.query(
      `SELECT kunlar, fan, boshlanish, tugash, sinflar
       FROM oqituvchilar WHERE id = $1`,
      [entityId]
    );
    const teacherInfo = teacherRes.rows[0] || {};

    res.json({
      ok: true,
      jadvallar: jadvalRes.rows,
      teacherInfo
    });
  } catch (err) {
    console.error('jadval/mening-jadvalim-oqituvchi xatolik:', err.message);
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