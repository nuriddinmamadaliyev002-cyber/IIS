// ─── Davomat routes ──────────────────────────────────────────────────────────
//
// Filtr: admin_username o'rniga maktab_id ishlatiladi
//   isSuper=true  → barcha maktablar ko'rinadi
//   isSuper=false → faqat req.user.maktabId ga mos yozuvlar
//
// ─────────────────────────────────────────────────────────────────────────────
const { Router }      = require('express');
const pool            = require('../db');
const { requireAuth } = require('../middleware/jwt');

const router = Router();

// ─── GET /api/davomat/mening-davomatim — O'qituvchi o'z davomatini ko'radi ───
// ⚠️  router.use(requireAuth(['admin'])) DAN OLDIN — oqituvchi roli uchun!
router.get('/mening-davomatim', requireAuth(['oqituvchi']), async (req, res) => {
  const { ism, maktabId, entityId } = req.user;
  // ism = "Familiya Ism" (token da shunday saqlanadi)
  // maktabId = o'qituvchining asosiy maktabi

  if (!maktabId) {
    return res.status(400).json({ ok: false, error: 'Maktab biriktirilmagan' });
  }

  try {
    // O'qituvchining kunlar va fan ma'lumotlarini olish
    const teacherRes = await pool.query(
      'SELECT kunlar, fan FROM oqituvchilar WHERE id = $1',
      [entityId]
    );
    const kunlar = teacherRes.rows[0]?.kunlar || '';
    const fan    = teacherRes.rows[0]?.fan    || '';

    // Oxirgi 90 kun ichidagi davomat yozuvlari
    const result = await pool.query(
      `SELECT sana, status, izoh, fan,
              dars_soat, dars_daqiqa, kech_minut
       FROM oqituvchilar_davomat
       WHERE oqituvchi_ism = $1
         AND maktab_id     = $2
       ORDER BY
         -- DD.MM.YYYY formatni to'g'ri tartiblash
         SPLIT_PART(sana,'.',3)::int DESC,
         SPLIT_PART(sana,'.',2)::int DESC,
         SPLIT_PART(sana,'.',1)::int DESC
       LIMIT 90`,
      [ism, maktabId]
    );

    res.json({
      ok:      true,
      records: result.rows,
      kunlar,
      fan,
      ism,
    });
  } catch (err) {
    console.error('GET /mening-davomatim xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

router.use(requireAuth(['admin']));

// ─── POST /api/davomat — o'quvchilar davomati saqlash ────────────────────────
router.post('/', async (req, res) => {
  const p = req.body;
  const { isSuper, maktabId } = req.user;

  const records = JSON.parse(p.records || '[]');
  const now = new Date().toLocaleTimeString('uz-UZ');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Avvalgi yozuvlarni o'chirish
    if (isSuper) {
      // superadmin: agar maktabId berilsa shu maktab, aks holda barcha
      if (maktabId) {
        await client.query(
          'DELETE FROM davomat WHERE sana=$1 AND maktab_id=$2',
          [p.sana, maktabId]
        );
      } else {
        await client.query('DELETE FROM davomat WHERE sana=$1', [p.sana]);
      }
    } else {
      await client.query(
        'DELETE FROM davomat WHERE sana=$1 AND maktab_id=$2',
        [p.sana, maktabId]
      );
    }

    // Yangi yozuvlarni kiritish
    for (const rec of records) {
      await client.query(
        `INSERT INTO davomat
           (sana, maktab_id, sinf, oquvchi_ism, status, izoh, vaqt_belgilangan)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [p.sana, maktabId, rec.sinf, rec.ism, rec.status, rec.izoh || '', now]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, saved: records.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('davomat POST xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  } finally {
    client.release();
  }
});

// ─── GET /api/davomat — o'quvchilar davomati olish ───────────────────────────
router.get('/', async (req, res) => {
  const { sana, targetMaktabId } = req.query;
  const { isSuper, maktabId } = req.user;

  // superadmin boshqa maktabni ham ko'ra oladi (query da targetMaktabId bilan)
  const filterMaktabId = (isSuper && targetMaktabId)
    ? parseInt(targetMaktabId)
    : maktabId;

  try {
    let result;
    if (isSuper && !filterMaktabId) {
      // Superadmin barcha maktablarni ko'radi
      result = await pool.query(
        'SELECT sinf, oquvchi_ism, status, izoh, maktab_id FROM davomat WHERE sana=$1 ORDER BY sinf, oquvchi_ism',
        [sana]
      );
    } else {
      result = await pool.query(
        'SELECT sinf, oquvchi_ism, status, izoh FROM davomat WHERE sana=$1 AND maktab_id=$2 ORDER BY sinf, oquvchi_ism',
        [sana, filterMaktabId]
      );
    }

    res.json({
      ok: true,
      records: result.rows.map(r => ({
        sinf: r.sinf,
        ism:  r.oquvchi_ism,
        status: r.status,
        izoh: r.izoh,
      }))
    });
  } catch (err) {
    console.error('davomat GET xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/davomat/tarix — sanalar tarixi ─────────────────────────────────
router.get('/tarix', async (req, res) => {
  const { targetMaktabId } = req.query;
  const { isSuper, maktabId } = req.user;
  const filterMaktabId = (isSuper && targetMaktabId) ? parseInt(targetMaktabId) : maktabId;

  try {
    let result;
    if (isSuper && !filterMaktabId) {
      result = await pool.query(
        'SELECT DISTINCT sana FROM davomat ORDER BY sana DESC'
      );
    } else {
      result = await pool.query(
        'SELECT DISTINCT sana FROM davomat WHERE maktab_id=$1 ORDER BY sana DESC',
        [filterMaktabId]
      );
    }
    res.json({ ok: true, sanalar: result.rows.map(r => r.sana) });
  } catch (err) {
    console.error('davomat tarix xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/davomat/range — oraliq ─────────────────────────────────────────
router.get('/range', async (req, res) => {
  const { from, to, targetMaktabId } = req.query;
  const { isSuper, maktabId } = req.user;

  if (!from || !to)
    return res.status(400).json({ ok: false, error: 'from va to sanalar kerak' });

  const filterMaktabId = (isSuper && targetMaktabId) ? parseInt(targetMaktabId) : maktabId;

  try {
    let result;
    if (isSuper && !filterMaktabId) {
      result = await pool.query(
        'SELECT sana, sinf, oquvchi_ism, status, izoh, maktab_id FROM davomat ORDER BY sinf, oquvchi_ism, sana'
      );
    } else {
      result = await pool.query(
        'SELECT sana, sinf, oquvchi_ism, status, izoh FROM davomat WHERE maktab_id=$1 ORDER BY sinf, oquvchi_ism, sana',
        [filterMaktabId]
      );
    }
    res.json({ ok: true, records: result.rows });
  } catch (err) {
    console.error('davomat range xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/davomat/oqituvchi — o'qituvchilar davomati saqlash ─────────────
router.post('/oqituvchi', async (req, res) => {
  const p = req.body;
  const { isSuper, maktabId } = req.user;

  const records = JSON.parse(p.records || '[]');
  const now = new Date().toLocaleTimeString('uz-UZ');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (isSuper) {
      if (maktabId) {
        await client.query(
          'DELETE FROM oqituvchilar_davomat WHERE sana=$1 AND maktab_id=$2',
          [p.sana, maktabId]
        );
      } else {
        await client.query('DELETE FROM oqituvchilar_davomat WHERE sana=$1', [p.sana]);
      }
    } else {
      await client.query(
        'DELETE FROM oqituvchilar_davomat WHERE sana=$1 AND maktab_id=$2',
        [p.sana, maktabId]
      );
    }

    for (const rec of records) {
      await client.query(
        `INSERT INTO oqituvchilar_davomat
           (sana, maktab_id, oqituvchi_ism, fan, status, izoh,
            vaqt_belgilangan, dars_soat, dars_daqiqa, kech_minut)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [p.sana, maktabId, rec.ism, rec.fan, rec.status,
         rec.izoh || '', now, rec.dars_soat || 0, rec.dars_daqiqa || 0, rec.kech_minut || 0]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, saved: records.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('oqituvchi davomat POST xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  } finally {
    client.release();
  }
});

// ─── GET /api/davomat/oqituvchi — o'qituvchilar davomati olish ────────────────
router.get('/oqituvchi', async (req, res) => {
  const { sana, targetMaktabId } = req.query;
  const { isSuper, maktabId } = req.user;
  const filterMaktabId = (isSuper && targetMaktabId) ? parseInt(targetMaktabId) : maktabId;

  try {
    let result;
    if (isSuper && !filterMaktabId) {
      result = await pool.query(
        `SELECT oqituvchi_ism, fan, status, izoh,
                dars_soat, dars_daqiqa, kech_minut
         FROM oqituvchilar_davomat WHERE sana=$1`,
        [sana]
      );
    } else {
      result = await pool.query(
        `SELECT oqituvchi_ism, fan, status, izoh,
                dars_soat, dars_daqiqa, kech_minut
         FROM oqituvchilar_davomat WHERE sana=$1 AND maktab_id=$2`,
        [sana, filterMaktabId]
      );
    }
    res.json({ ok: true, records: result.rows });
  } catch (err) {
    console.error('oqituvchi davomat GET xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── /teacher alias — frontend api.js da /davomat/teacher ishlatadi ──────────
// POST /api/davomat/teacher  →  /api/davomat/oqituvchi bilan bir xil
router.post('/teacher', async (req, res) => {
  const p = req.body;
  const { isSuper, maktabId } = req.user;

  const records = JSON.parse(p.records || '[]');
  const now = new Date().toLocaleTimeString('uz-UZ');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (isSuper) {
      if (maktabId) {
        await client.query(
          'DELETE FROM oqituvchilar_davomat WHERE sana=$1 AND maktab_id=$2',
          [p.sana, maktabId]
        );
      } else {
        await client.query('DELETE FROM oqituvchilar_davomat WHERE sana=$1', [p.sana]);
      }
    } else {
      await client.query(
        'DELETE FROM oqituvchilar_davomat WHERE sana=$1 AND maktab_id=$2',
        [p.sana, maktabId]
      );
    }

    for (const rec of records) {
      await client.query(
        `INSERT INTO oqituvchilar_davomat
           (sana, maktab_id, oqituvchi_ism, fan, status, izoh,
            vaqt_belgilangan, dars_soat, dars_daqiqa, kech_minut)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [p.sana, maktabId, rec.ism, rec.fan, rec.status,
         rec.izoh || '', now, rec.dars_soat || 0, rec.dars_daqiqa || 0, rec.kech_minut || 0]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, saved: records.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('teacher davomat POST xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  } finally {
    client.release();
  }
});

// GET /api/davomat/teacher  →  /api/davomat/oqituvchi bilan bir xil
router.get('/teacher', async (req, res) => {
  const { sana, targetMaktabId } = req.query;
  const { isSuper, maktabId } = req.user;
  const filterMaktabId = (isSuper && targetMaktabId) ? parseInt(targetMaktabId) : maktabId;

  try {
    let result;
    if (isSuper && !filterMaktabId) {
      result = await pool.query(
        `SELECT oqituvchi_ism, oqituvchi_ism AS ism, fan, status, izoh,
                dars_soat, dars_daqiqa, kech_minut
         FROM oqituvchilar_davomat WHERE sana=$1`,
        [sana]
      );
    } else {
      result = await pool.query(
        `SELECT oqituvchi_ism, oqituvchi_ism AS ism, fan, status, izoh,
                dars_soat, dars_daqiqa, kech_minut
         FROM oqituvchilar_davomat WHERE sana=$1 AND maktab_id=$2`,
        [sana, filterMaktabId]
      );
    }
    res.json({ ok: true, records: result.rows });
  } catch (err) {
    console.error('teacher davomat GET xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

module.exports = router;