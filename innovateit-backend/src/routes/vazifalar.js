// ─── Vazifalar routes (Dars mavzusi + Uyga vazifa) ────────────────────────────
//
//  O'QITUVCHI:
//    GET    /api/vazifalar/guruh/:guruhId            — bir guruhning bir kunlik
//                                                        mavzu/vazifasini olish
//    POST   /api/vazifalar/guruh/:guruhId             — mavzu/vazifa saqlash (upsert)
//    GET    /api/vazifalar/tekshirish                 — kelgan javoblar ro'yxati
//    POST   /api/vazifalar/javob/:javobId/baholash     — javobni baholash
//
//  O'QUVCHI:
//    GET    /api/vazifalar/mening-vazifalarim          — o'ziga tegishli vazifalar
//    POST   /api/vazifalar/:vazifaId/javob             — javob yuborish/tahrirlash
//
// ─────────────────────────────────────────────────────────────────────────────
const { Router }      = require('express');
const pool            = require('../db');
const { requireAuth } = require('../middleware/jwt');

const router = Router();

// Ism/familiyani dars_jadvali'dagi teacher_ism/teacher_familiya bilan
// solishtirish uchun — jadval.js'dagi bilan bir xil pattern
function ismFamiliya(ism) {
  const parts = (ism || '').trim().split(' ');
  return { familiya: parts[0] || '', ismOnly: parts.slice(1).join(' ') || '' };
}

// ═══════════════════════════════════════════════════════════════════════════
//  O'QITUVCHI — mavzu / uyga vazifa yozish
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /api/vazifalar/guruh/:guruhId?sana=YYYY-MM-DD ────────────────────────
router.get('/guruh/:guruhId', requireAuth(['oqituvchi']), async (req, res) => {
  const { ism, entityId } = req.user;
  const { sana } = req.query;
  const guruhId = parseInt(req.params.guruhId);

  if (!guruhId || !sana) return res.status(400).json({ ok: false, error: 'guruhId va sana kerak' });
  if (!entityId) return res.status(400).json({ ok: false, error: "O'qituvchi ID topilmadi" });

  const { familiya, ismOnly } = ismFamiliya(ism);

  try {
    // Guruh haqiqatan ham shu o'qituvchiga tegishli ekanini tekshiramiz
    const guruhRes = await pool.query(
      `SELECT id FROM dars_jadvali
       WHERE id=$1 AND LOWER(TRIM(teacher_familiya))=LOWER($2) AND LOWER(TRIM(teacher_ism))=LOWER($3)`,
      [guruhId, familiya, ismOnly]
    );
    if (guruhRes.rowCount === 0) return res.status(404).json({ ok: false, error: 'Guruh topilmadi' });

    const result = await pool.query(
      `SELECT id, mavzu, uy_vazifasi, vazifa_fayl, muddat FROM dars_mavzulari WHERE guruh_id=$1 AND sana=$2`,
      [guruhId, sana]
    );
    res.json({ ok: true, vazifa: result.rows[0] || null });
  } catch (err) {
    console.error('vazifalar/guruh GET xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/vazifalar/guruh/:guruhId — mavzu/vazifa saqlash (upsert) ──────
router.post('/guruh/:guruhId', requireAuth(['oqituvchi']), async (req, res) => {
  const { ism, entityId, maktabIdlar } = req.user;
  const { sana, mavzu, uy_vazifasi, muddat, vazifa_fayl } = req.body;
  const guruhId = parseInt(req.params.guruhId);

  if (!guruhId || !sana) return res.status(400).json({ ok: false, error: 'guruhId va sana kerak' });
  if (!entityId) return res.status(400).json({ ok: false, error: "O'qituvchi ID topilmadi" });

  const { familiya, ismOnly } = ismFamiliya(ism);

  try {
    const guruhRes = await pool.query(
      `SELECT id, maktab_id FROM dars_jadvali
       WHERE id=$1 AND LOWER(TRIM(teacher_familiya))=LOWER($2) AND LOWER(TRIM(teacher_ism))=LOWER($3)`,
      [guruhId, familiya, ismOnly]
    );
    if (guruhRes.rowCount === 0) return res.status(404).json({ ok: false, error: 'Guruh topilmadi' });

    const maktabId = guruhRes.rows[0].maktab_id;
    const now = new Date().toLocaleString('uz-UZ');

    await pool.query(
      `INSERT INTO dars_mavzulari (guruh_id, maktab_id, sana, mavzu, uy_vazifasi, vazifa_fayl, muddat, yangilangan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (guruh_id, sana) DO UPDATE
         SET mavzu=$4, uy_vazifasi=$5, vazifa_fayl=$6, muddat=$7, yangilangan=$8`,
      [guruhId, maktabId, sana, mavzu || '', uy_vazifasi || '', vazifa_fayl || '', muddat || '', now]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('vazifalar/guruh POST xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  O'QITUVCHI — kelgan javoblarni tekshirish / baholash
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /api/vazifalar/tekshirish?holat=yuborilgan|tekshirilgan|hammasi ─────
router.get('/tekshirish', requireAuth(['oqituvchi']), async (req, res) => {
  const { ism, entityId } = req.user;
  const holat = req.query.holat || 'yuborilgan';

  if (!entityId) return res.status(400).json({ ok: false, error: "O'qituvchi ID topilmadi" });

  const { familiya, ismOnly } = ismFamiliya(ism);
  const holatFilter = (holat === 'hammasi') ? '' : 'AND vj.holat = $3';
  const params = [familiya, ismOnly];
  if (holatFilter) params.push(holat);

  try {
    const result = await pool.query(
      `SELECT vj.id, vj.javob_matn, vj.javob_fayl, vj.yuborilgan_vaqt, vj.holat,
              vj.baho, vj.oqituvchi_izohi, vj.baholangan_vaqt,
              dm.id AS vazifa_id, dm.sana, dm.mavzu, dm.uy_vazifasi,
              dj.fan, dj.sinflar,
              o.id AS oquvchi_id, o.ism AS oquvchi_ism, o.familiya AS oquvchi_familiya, o.sinf AS oquvchi_sinf
       FROM vazifa_javoblari vj
       JOIN dars_mavzulari dm ON dm.id = vj.vazifa_id
       JOIN dars_jadvali   dj ON dj.id = dm.guruh_id
       JOIN oquvchilar     o  ON o.id  = vj.oquvchi_id
       WHERE LOWER(TRIM(dj.teacher_familiya))=LOWER($1) AND LOWER(TRIM(dj.teacher_ism))=LOWER($2)
         ${holatFilter}
       ORDER BY vj.yuborilgan_vaqt DESC`,
      params
    );
    res.json({ ok: true, javoblar: result.rows });
  } catch (err) {
    console.error('vazifalar/tekshirish GET xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/vazifalar/javob/:javobId/baholash ──────────────────────────────
router.post('/javob/:javobId/baholash', requireAuth(['oqituvchi']), async (req, res) => {
  const { ism } = req.user;
  const { baho, izoh } = req.body;
  const javobId = parseInt(req.params.javobId);

  if (!javobId) return res.status(400).json({ ok: false, error: 'javobId kerak' });

  const { familiya, ismOnly } = ismFamiliya(ism);

  try {
    // Bu javob shu o'qituvchining guruhiga tegishli ekanini tekshiramiz
    const checkRes = await pool.query(
      `SELECT vj.id FROM vazifa_javoblari vj
       JOIN dars_mavzulari dm ON dm.id = vj.vazifa_id
       JOIN dars_jadvali   dj ON dj.id = dm.guruh_id
       WHERE vj.id=$1 AND LOWER(TRIM(dj.teacher_familiya))=LOWER($2) AND LOWER(TRIM(dj.teacher_ism))=LOWER($3)`,
      [javobId, familiya, ismOnly]
    );
    if (checkRes.rowCount === 0) return res.status(404).json({ ok: false, error: 'Javob topilmadi' });

    const now = new Date().toLocaleString('uz-UZ');
    await pool.query(
      `UPDATE vazifa_javoblari
         SET baho=$1, oqituvchi_izohi=$2, holat='tekshirilgan', baholangan_vaqt=$3
       WHERE id=$4`,
      [baho ?? null, izoh || '', now, javobId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('vazifalar/baholash POST xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  O'QUVCHI — o'ziga tegishli vazifalarni ko'rish va javob yuborish
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /api/vazifalar/mening-vazifalarim ────────────────────────────────────
router.get('/mening-vazifalarim', requireAuth(['oquvchi']), async (req, res) => {
  const { entityId, sinf } = req.user;
  if (!entityId) return res.status(400).json({ ok: false, error: "O'quvchi ID topilmadi" });

  try {
    // 1) O'quvchiga biriktirilgan o'qituvchilar (jadval.js'dagi bilan bir xil mantiq)
    const teachersRes = await pool.query(
      `SELECT o.ism, o.familiya
       FROM oqituvchi_oquvchilar oo
       JOIN oqituvchilar o ON o.id = oo.oqituvchi_id
       WHERE oo.oquvchi_id = $1`,
      [entityId]
    );
    if (teachersRes.rowCount === 0) return res.json({ ok: true, vazifalar: [] });

    const namePairs = teachersRes.rows.map(t =>
      `(LOWER(TRIM(dj.teacher_familiya)) = LOWER('${t.familiya.replace(/'/g, "''")}') AND LOWER(TRIM(dj.teacher_ism)) = LOWER('${t.ism.replace(/'/g, "''")}'))`
    ).join(' OR ');

    let sinfFilter = '';
    const sinfParams = [entityId];
    if (sinf) {
      const sinfClean = sinf.replace(/-sinf$/i, '').trim();
      sinfParams.push(`%${sinf}%`, `%${sinfClean}%`);
      sinfFilter = `AND (LOWER(dj.sinflar) LIKE LOWER($2) OR LOWER(dj.sinflar) LIKE LOWER($3))`;
    }

    const result = await pool.query(
      `SELECT dm.id, dm.sana, dm.mavzu, dm.uy_vazifasi, dm.vazifa_fayl, dm.muddat,
              dj.fan, dj.teacher_ism, dj.teacher_familiya,
              vj.id AS javob_id, vj.javob_matn, vj.javob_fayl, vj.holat,
              vj.baho, vj.oqituvchi_izohi
       FROM dars_mavzulari dm
       JOIN dars_jadvali dj ON dj.id = dm.guruh_id
       LEFT JOIN vazifa_javoblari vj ON vj.vazifa_id = dm.id AND vj.oquvchi_id = $1
       WHERE (${namePairs}) ${sinfFilter}
         AND (dm.mavzu != '' OR dm.uy_vazifasi != '')
       ORDER BY dm.sana DESC`,
      sinfParams
    );
    res.json({ ok: true, vazifalar: result.rows });
  } catch (err) {
    console.error('vazifalar/mening-vazifalarim GET xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/vazifalar/:vazifaId/javob — javob yuborish/tahrirlash ─────────
router.post('/:vazifaId/javob', requireAuth(['oquvchi']), async (req, res) => {
  const { entityId, sinf } = req.user;
  const { javob_matn, javob_fayl } = req.body;
  const vazifaId = parseInt(req.params.vazifaId);

  if (!vazifaId) return res.status(400).json({ ok: false, error: 'vazifaId kerak' });
  if (!entityId) return res.status(400).json({ ok: false, error: "O'quvchi ID topilmadi" });
  if (!(javob_matn || '').trim() && !(javob_fayl || '').trim())
    return res.status(400).json({ ok: false, error: 'Javob matni yoki fayl kerak' });

  try {
    // Vazifa shu o'quvchiga tegishli ekanini tekshiramiz — o'z o'qituvchisining
    // guruhi va o'z sinfiga mos bo'lishi shart
    const checkRes = await pool.query(
      `SELECT dm.id FROM dars_mavzulari dm
       JOIN dars_jadvali dj ON dj.id = dm.guruh_id
       JOIN oqituvchilar o ON LOWER(TRIM(o.familiya))=LOWER(TRIM(dj.teacher_familiya)) AND LOWER(TRIM(o.ism))=LOWER(TRIM(dj.teacher_ism))
       JOIN oqituvchi_oquvchilar oo ON oo.oqituvchi_id = o.id AND oo.oquvchi_id = $2
       WHERE dm.id = $1`,
      [vazifaId, entityId]
    );
    if (checkRes.rowCount === 0) return res.status(404).json({ ok: false, error: 'Vazifa topilmadi' });

    // Allaqachon baholangan javobni o'zgartirib bo'lmaydi
    const existing = await pool.query(
      `SELECT id, holat FROM vazifa_javoblari WHERE vazifa_id=$1 AND oquvchi_id=$2`,
      [vazifaId, entityId]
    );
    if (existing.rowCount > 0 && existing.rows[0].holat === 'tekshirilgan') {
      return res.status(400).json({ ok: false, error: 'Bu vazifa allaqachon baholangan, javobni o\'zgartirib bo\'lmaydi' });
    }

    const now = new Date().toLocaleString('uz-UZ');
    await pool.query(
      `INSERT INTO vazifa_javoblari (vazifa_id, oquvchi_id, javob_matn, javob_fayl, yuborilgan_vaqt, holat)
       VALUES ($1,$2,$3,$4,$5,'yuborilgan')
       ON CONFLICT (vazifa_id, oquvchi_id) DO UPDATE
         SET javob_matn=$3, javob_fayl=$4, yuborilgan_vaqt=$5, holat='yuborilgan'`,
      [vazifaId, entityId, javob_matn || '', javob_fayl || '', now]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('vazifalar/javob POST xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

module.exports = router;
