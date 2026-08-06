// ─── Buxgalter routes ────────────────────────────────────────────────────────
// GET    /api/buxgalter/students      — o'quvchilar (buxgalter uchun)
// GET    /api/buxgalter/tolovlar      — to'lovlar
// POST   /api/buxgalter/tolovlar      — to'lov saqlash
// POST   /api/buxgalter/init-oy       — oyni boshlash
// GET    /api/buxgalter               — ro'yxat + maktab biriktirmalari (superadmin)
// POST   /api/buxgalter               — yaratish (superadmin)
// PUT    /api/buxgalter/:id           — tahrirlash (superadmin)
// DELETE /api/buxgalter/:id           — o'chirish (superadmin)
// POST   /api/buxgalter/biriktiruv    — maktab biriktirish (superadmin)
// DELETE /api/buxgalter/biriktiruv    — maktab ajratish (superadmin)
//
// Buxgalter kirishi FAQAT Telegram orqali (bot → Mini App → /api/telegram/check
// → shu paneliga JWT bilan redirect). Email/parol tizimi yo'q.
const { Router }      = require('express');
const pool            = require('../db');
const { requireAuth } = require('../middleware/jwt');

const router = Router();
function todayUZ() { return new Date().toLocaleDateString('ru-RU'); }

// ─── kvitansiya fayl yordamchilari ───────────────────────────────────────────
function normalizeKvitFiles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
    if (typeof parsed === 'string' && parsed) return [parsed];
  } catch {}
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return [];
}
function serializeKvitFiles(files) {
  const arr = (Array.isArray(files) ? files : []).filter(Boolean);
  return arr.length === 0 ? '' : JSON.stringify(arr);
}

// ─── Buxgalterni maktab id lariga ko'ra olish ────────────────────────────────
async function getBuxMaktabIds(buxId) {
  const res = await pool.query(
    `SELECT maktab_id FROM buxgalter_maktablar WHERE buxgalter_id = $1`,
    [buxId]
  );
  return res.rows.map(r => r.maktab_id);
}

// ─── GET /api/buxgalter/students ─────────────────────────────────────────────
router.get('/students', requireAuth(['admin', 'buxgalter']), async (req, res) => {
  const { oy } = req.query;
  if (!oy) return res.status(400).json({ ok: false, error: 'oy parametri kerak' });

  try {
    let maktabFilter = '';
    let params       = [oy];

    if (req.user.role === 'buxgalter') {
      const maktabIds = await getBuxMaktabIds(req.user.entityId);
      if (maktabIds.length > 0) {
        maktabFilter = 'AND maktab_id = ANY($2)';
        params.push(maktabIds);
      }
    }

    const activeRes = await pool.query(
      `SELECT o.id, o.ism, o.familiya, o.maktab_id, m.nomi AS maktab_nomi,
              o.sinf, o.telefon, o.telefon2, o.boshlagan
       FROM oquvchilar o
       LEFT JOIN maktablar m ON m.id = o.maktab_id
       WHERE o.boshlagan IS NOT NULL AND o.boshlagan != ''
         AND LEFT(o.boshlagan,7) <= $1 ${maktabFilter}
       ORDER BY o.maktab_id, o.sinf, o.familiya, o.ism`,
      params
    );

    const nofaolRes = await pool.query(
      `SELECT n.id, n.ism, n.familiya, n.maktab_id, m.nomi AS maktab_nomi,
              n.sinf, n.telefon, n.telefon2, n.boshlagan, n.chiqgan
       FROM nofaol_oquvchilar n
       LEFT JOIN maktablar m ON m.id = n.maktab_id
       WHERE n.boshlagan IS NOT NULL AND n.boshlagan != ''
         AND n.chiqgan IS NOT NULL AND n.chiqgan != ''
         AND LEFT(n.boshlagan,7) <= $1
         AND CASE
               WHEN SUBSTRING(n.chiqgan,3,1)='.'
               THEN CONCAT(RIGHT(n.chiqgan,4),'-',SUBSTRING(n.chiqgan,4,2))
               ELSE LEFT(n.chiqgan,7)
             END >= $1
         ${maktabFilter}
       ORDER BY n.maktab_id, n.sinf, n.familiya, n.ism`,
      params
    );

    res.json({
      ok: true,
      students: [
        ...activeRes.rows.map(r => ({ ...r, maktab: r.maktab_nomi || String(r.maktab_id || ''), nofaol: false })),
        ...nofaolRes.rows.map(r => ({ ...r, maktab: r.maktab_nomi || String(r.maktab_id || ''), nofaol: true })),
      ]
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'DB xatoligi: ' + err.message });
  }
});

// ─── GET /api/buxgalter/qabul-royxati ────────────────────────────────────────
//  "Qabul YYYY-YY" pseudo-oy uchun: sales moduldagi "royxatga_olindi" holatidagi
//  leadlar (hali oquvchilar jadvaliga ko'chirilmagan, yangi o'quv yiliga qabul
//  qilinganlar) ro'yxati. To'lov ma'lumotlari bo'lmaydi — faqat F.I.Sh/maktab/
//  sinf/telefon.
router.get('/qabul-royxati', requireAuth(['admin', 'buxgalter']), async (req, res) => {
  try {
    let maktabFilter = '';
    let params       = [];

    if (req.user.role === 'buxgalter') {
      const maktabIds = await getBuxMaktabIds(req.user.entityId);
      if (maktabIds.length > 0) {
        maktabFilter = 'AND l.maktab_id = ANY($1)';
        params.push(maktabIds);
      }
    }

    const result = await pool.query(
      `SELECT l.id,
              l.oquvchi_ismi     AS ism,
              l.oquvchi_familiya AS familiya,
              l.sinf,
              l.telefon,
              l.telefon2,
              l.maktab_id,
              COALESCE(m.nomi, l.hudud, '') AS maktab
       FROM leadlar l
       LEFT JOIN maktablar m ON m.id = l.maktab_id
       WHERE l.holat = 'royxatga_olindi' ${maktabFilter}
       ORDER BY maktab, l.sinf, l.oquvchi_familiya, l.oquvchi_ismi`,
      params
    );

    res.json({ ok: true, students: result.rows.map(r => ({ ...r, nofaol: false })) });
  } catch (err) {
    console.error("qabul ro'yxati olish xatolik:", err.message);
    res.status(500).json({ ok: false, error: 'DB xatoligi: ' + err.message });
  }
});

// ─── GET /api/buxgalter/tolovlar ─────────────────────────────────────────────
router.get('/tolovlar', requireAuth(['admin', 'buxgalter']), async (req, res) => {
  const { oy } = req.query;
  if (!oy) return res.status(400).json({ ok: false, error: 'oy parametri kerak' });

  try {
    let q      = 'SELECT * FROM tolovlar WHERE oy=$1';
    let params = [oy];

    if (req.user.role === 'buxgalter') {
      const maktabIds = await getBuxMaktabIds(req.user.entityId);
      if (maktabIds.length > 0) {
        q += ' AND maktab_id = ANY($2)';
        params.push(maktabIds);
      }
    }

    q += ' ORDER BY maktab_id, sinf, oquvchi_familiya';
    const result = await pool.query(q, params);
    res.json({ ok: true, tolovlar: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'DB xatoligi: ' + err.message });
  }
});

// ─── POST /api/buxgalter/tolovlar ────────────────────────────────────────────
router.post('/tolovlar', requireAuth(['admin', 'buxgalter']), async (req, res) => {
  const p        = req.body;
  const oy       = p.oy;
  const ism      = (p.oquvchi_ism      || '').trim();
  const familiya = (p.oquvchi_familiya || '').trim();
  const maktabId = p.maktab_id ? parseInt(p.maktab_id) : null;
  const oquvchiId = p.oquvchi_id ? parseInt(p.oquvchi_id) : null;

  if (!oy || !ism || !familiya)
    return res.status(400).json({ ok: false, error: 'Majburiy maydonlar yetishmaydi' });

  const kvFiles = serializeKvitFiles(normalizeKvitFiles(p.kvitansiya_fayl));

  try {
    await pool.query(
      `INSERT INTO tolovlar
         (oy, oquvchi_id, oquvchi_ism, oquvchi_familiya, maktab_id, sinf, telefon,
          tarif, qaydnoma, ehtimoliy_tolov_sanasi, gaplashilgan_vaqt, tolov_kerak, tolov_qildi,
          tolov_sanasi, kvitansiya_fayl, yangilangan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (oy, oquvchi_id) DO UPDATE SET
         tarif             = EXCLUDED.tarif,
         qaydnoma          = EXCLUDED.qaydnoma,
         ehtimoliy_tolov_sanasi = EXCLUDED.ehtimoliy_tolov_sanasi,
         gaplashilgan_vaqt = EXCLUDED.gaplashilgan_vaqt,
         tolov_kerak       = EXCLUDED.tolov_kerak,
         tolov_qildi       = EXCLUDED.tolov_qildi,
         tolov_sanasi      = EXCLUDED.tolov_sanasi,
         kvitansiya_fayl   = EXCLUDED.kvitansiya_fayl,
         yangilangan       = EXCLUDED.yangilangan`,
      [oy, oquvchiId, ism, familiya, maktabId,
       p.sinf||'', p.telefon||'',
       parseInt(p.tarif)||0, p.qaydnoma||'', p.ehtimoliy_tolov_sanasi||'', p.gaplashilgan_vaqt||'',
       parseInt(p.tolov_kerak)||0, parseInt(p.tolov_qildi)||0,
       p.tolov_sanasi||'', kvFiles, todayUZ()]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'DB xatoligi: ' + err.message });
  }
});

// ─── POST /api/buxgalter/init-oy ─────────────────────────────────────────────
router.post('/init-oy', requireAuth(['admin', 'buxgalter']), async (req, res) => {
  const p = req.body;
  if (!p.oy) return res.status(400).json({ ok: false, error: 'oy kerak' });

  try {
    let all = [];

    if (p.oy === 'QABUL-2026-27') {
      // ── "Qabul" pseudo-oyi: manba — sales moduldagi ro'yxatga olindi leadlar ──
      let maktabFilter = '';
      let leadParams   = [];
      if (req.user.role === 'buxgalter') {
        const maktabIds = await getBuxMaktabIds(req.user.entityId);
        if (maktabIds.length > 0) {
          maktabFilter = 'AND maktab_id = ANY($1)';
          leadParams.push(maktabIds);
        }
      }
      const leadsQ = await pool.query(
        `SELECT id, oquvchi_ismi AS ism, oquvchi_familiya AS familiya,
                maktab_id, sinf, telefon
         FROM leadlar
         WHERE holat = 'royxatga_olindi' ${maktabFilter}`,
        leadParams
      );
      all = leadsQ.rows;
    } else {
      const activeQ = await pool.query(
        `SELECT id, ism, familiya, maktab_id, sinf, telefon, boshlagan
         FROM oquvchilar
         WHERE boshlagan IS NOT NULL AND boshlagan != '' AND LEFT(boshlagan,7) <= $1`,
        [p.oy]
      );
      const nofaolQ = await pool.query(
        `SELECT id, ism, familiya, maktab_id, sinf, telefon, boshlagan
         FROM nofaol_oquvchilar
         WHERE boshlagan IS NOT NULL AND boshlagan != ''
           AND chiqgan IS NOT NULL AND chiqgan != ''
           AND LEFT(boshlagan,7) <= $1
           AND CASE
                 WHEN SUBSTRING(chiqgan,3,1)='.'
                 THEN CONCAT(RIGHT(chiqgan,4),'-',SUBSTRING(chiqgan,4,2))
                 ELSE LEFT(chiqgan,7)
               END >= $1`,
        [p.oy]
      );
      all = [...activeQ.rows, ...nofaolQ.rows];
    }

    let inserted = 0;

    for (const s of all) {
      let tarif = 0, tolov_kerak = 0;
      // "Qabul" uchun oldingi oydan tarif ko'chirilmaydi — depozit har doim 0 dan boshlanadi
      if (p.oldingi_oy && p.oy !== 'QABUL-2026-27') {
        const prev = await pool.query(
          `SELECT tarif, tolov_kerak FROM tolovlar
           WHERE oy=$1 AND oquvchi_id=$2 LIMIT 1`,
          [p.oldingi_oy, s.id]
        );
        if (prev.rows.length > 0) {
          tarif       = prev.rows[0].tarif       || 0;
          tolov_kerak = prev.rows[0].tolov_kerak || 0;
        }
      }
      await pool.query(
        `INSERT INTO tolovlar
           (oy, oquvchi_id, oquvchi_ism, oquvchi_familiya, maktab_id, sinf, telefon, tarif, tolov_kerak)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (oy, oquvchi_id) DO NOTHING`,
        [p.oy, s.id, s.ism, s.familiya, s.maktab_id, s.sinf||'', s.telefon||'', tarif, tolov_kerak]
      );
      inserted++;
    }

    res.json({ ok: true, count: inserted });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'DB xatoligi: ' + err.message });
  }
});

// ─── GET /api/buxgalter — ro'yxat + maktab biriktirmalari (superadmin) ────────
router.get('/', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });

  try {
    const maktablarRes = await pool.query('SELECT id, nomi FROM maktablar ORDER BY nomi');

    const buxRes = await pool.query(
      `SELECT
         b.id,
         b.ism,
         b.familiya,
         b.telegram_id,
         b.yaratilgan,
         COALESCE(
           JSON_AGG(
             JSON_BUILD_OBJECT('id', m.id, 'nomi', m.nomi)
           ) FILTER (WHERE m.id IS NOT NULL),
           '[]'
         ) AS maktablar
       FROM buxgalterlar b
       LEFT JOIN buxgalter_maktablar bm ON bm.buxgalter_id = b.id
       LEFT JOIN maktablar m            ON m.id = bm.maktab_id
       GROUP BY b.id
       ORDER BY b.yaratilgan DESC`
    );

    res.json({
      ok: true,
      buxgalterlar: buxRes.rows,
      maktablar:    maktablarRes.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/buxgalter — yangi buxgalter yaratish (superadmin) ──────────────
router.post('/', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });

  const ism       = req.body.ism?.trim();
  const familiya  = req.body.familiya?.trim() || '';
  const maktablar = req.body.maktablar || [];

  if (!ism)
    return res.status(400).json({ ok: false, error: 'Ism majburiy' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO buxgalterlar (ism, familiya, yaratilgan)
       VALUES ($1, $2, $3) RETURNING id`,
      [ism, familiya, todayUZ()]
    );
    const buxId = result.rows[0].id;

    for (const maktabId of maktablar) {
      await client.query(
        `INSERT INTO buxgalter_maktablar (buxgalter_id, maktab_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [buxId, maktabId]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, id: buxId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  } finally {
    client.release();
  }
});

// ─── PUT /api/buxgalter/:id — tahrirlash (superadmin) ────────────────────────
router.put('/:id', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });

  const id        = parseInt(req.params.id);
  const ism       = req.body.ism?.trim();
  const familiya  = req.body.familiya?.trim() || '';
  const maktablar = req.body.maktablar;

  if (!ism)
    return res.status(400).json({ ok: false, error: 'Ism majburiy' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE buxgalterlar SET ism=$1, familiya=$2 WHERE id=$3`,
      [ism, familiya, id]
    );
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Buxgalter topilmadi' });
    }

    if (Array.isArray(maktablar)) {
      await client.query('DELETE FROM buxgalter_maktablar WHERE buxgalter_id=$1', [id]);
      for (const maktabId of maktablar) {
        await client.query(
          `INSERT INTO buxgalter_maktablar (buxgalter_id, maktab_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, maktabId]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  } finally {
    client.release();
  }
});

// ─── DELETE /api/buxgalter/:id — o'chirish (superadmin) ──────────────────────
// ─── POST /api/buxgalter/biriktiruv — maktab biriktirish ─────────────────────
router.post('/biriktiruv', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: "Ruxsat yo'q" });

  const { buxId, maktabId } = req.body;
  if (!buxId || !maktabId)
    return res.status(400).json({ ok: false, error: 'buxId va maktabId kerak' });

  try {
    await pool.query(
      `INSERT INTO buxgalter_maktablar (buxgalter_id, maktab_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [buxId, maktabId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── DELETE /api/buxgalter/biriktiruv — maktab ajratish ──────────────────────
router.delete('/biriktiruv', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: "Ruxsat yo'q" });

  const { buxId, maktabId } = req.body;
  if (!buxId || !maktabId)
    return res.status(400).json({ ok: false, error: 'buxId va maktabId kerak' });

  try {
    await pool.query(
      'DELETE FROM buxgalter_maktablar WHERE buxgalter_id=$1 AND maktab_id=$2',
      [buxId, maktabId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── DELETE /api/buxgalter/:id — buxgalterni o'chirish ───────────────────────
router.delete('/:id', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });

  const id = parseInt(req.params.id);

  try {
    const buxRes = await pool.query(
      'SELECT telegram_id FROM buxgalterlar WHERE id=$1', [id]
    );
    if (buxRes.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Buxgalter topilmadi' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tgId = buxRes.rows[0].telegram_id;
      if (tgId) {
        await client.query('DELETE FROM telegram_users WHERE telegram_id=$1', [tgId]);
      }
      await client.query('DELETE FROM buxgalterlar WHERE id=$1', [id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

module.exports = router;