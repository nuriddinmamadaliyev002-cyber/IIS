// ─── O'quvchilarni baholash routes (dars kuni bo'yicha 1–5 ball) ──────────────
//
//  O'QITUVCHI:
//    GET  /api/baholar/guruh/:guruhId?sana=YYYY-MM-DD
//         — guruhning o'quvchilari + shu kunga qo'yilgan baholar
//    POST /api/baholar/guruh/:guruhId
//         — { sana, baholar: [{ oquvchi_id, kategoriya, baho, izoh }] }
//           baho 1–5 bo'lsa yoziladi (upsert), null bo'lsa o'chiriladi
//
//  O'QUVCHI:
//    GET  /api/baholar/mening-baholarim
//         — o'zining barcha baholari, dars kuni va guruh bo'yicha jamlangan
//
//  Kategoriyalar: uy_vazifa (uyga vazifa), faollik (darsdagi faolligi),
//                 xulq (darsdagi xulqi)
//
//  Ma'lumot oquvchi_id orqali bog'lanadi (ism matni orqali emas).
// ─────────────────────────────────────────────────────────────────────────────
const { Router }      = require('express');
const pool            = require('../db');
const { requireAuth } = require('../middleware/jwt');

const router = Router();

const KATEGORIYALAR = ['uy_vazifa', 'faollik', 'xulq'];
const SANA_RE       = /^\d{4}-\d{2}-\d{2}$/;
const IZOH_MAX      = 300;
const MAX_YOZUV     = 600; // 200 o'quvchi × 3 kategoriya

// Ism/familiyani dars_jadvali'dagi teacher_ism/teacher_familiya bilan
// solishtirish uchun — vazifalar.js / jadval.js'dagi bilan bir xil pattern
function ismFamiliya(ism) {
  const parts = (ism || '').trim().split(' ');
  return { familiya: parts[0] || '', ismOnly: parts.slice(1).join(' ') || '' };
}

// Guruh haqiqatan ham shu o'qituvchiga tegishli ekanini tekshiradi
async function oqituvchiGuruhi(guruhId, ism) {
  const { familiya, ismOnly } = ismFamiliya(ism);
  const r = await pool.query(
    `SELECT id, maktab_id, sinflar, kunlar FROM dars_jadvali
     WHERE id=$1 AND LOWER(TRIM(teacher_familiya))=LOWER($2) AND LOWER(TRIM(teacher_ism))=LOWER($3)`,
    [guruhId, familiya, ismOnly]
  );
  return r.rows[0] || null;
}

// O'zbekiston vaqti bo'yicha bugungi sana (YYYY-MM-DD), server OS vaqtidan mustaqil
function bugungiSanaISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
}

// Sana haqiqiy kalendar sanasimi (masalan 2026-02-31 emas) va qaysi hafta kuni (0=Yakshanba)
function haftaKuni(sana) {
  const d = new Date(sana + 'T00:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== sana) return null;
  return d.getUTCDay();
}

// Guruhdagi o'quvchilar: shu o'qituvchiga biriktirilgan, guruh maktabida
// o'qiydigan va sinfi guruh sinflaridan biri bo'lganlar
async function guruhOquvchilari(guruh, oqituvchiId) {
  const sinflar = String(guruh.sinflar || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!sinflar.length) return [];
  const r = await pool.query(
    `SELECT o.id, o.ism, o.familiya, o.sinf
       FROM oqituvchi_oquvchilar oo
       JOIN oquvchilar o ON o.id = oo.oquvchi_id
      WHERE oo.oqituvchi_id = $1
        AND o.maktab_id IS NOT DISTINCT FROM $2
        AND o.sinf = ANY($3::text[])
      ORDER BY o.sinf, o.familiya, o.ism`,
    [oqituvchiId, guruh.maktab_id, sinflar]
  );
  return r.rows;
}

// ─── GET /api/baholar/guruh/:guruhId?sana=YYYY-MM-DD ──────────────────────────
router.get('/guruh/:guruhId', requireAuth(['oqituvchi']), async (req, res) => {
  const { ism, entityId } = req.user;
  const { sana } = req.query;
  const guruhId = parseInt(req.params.guruhId);

  if (!guruhId || !sana) return res.status(400).json({ ok: false, error: 'guruhId va sana kerak' });
  if (!SANA_RE.test(String(sana)) || haftaKuni(String(sana)) === null) {
    return res.status(400).json({ ok: false, error: "Sana formati noto'g'ri" });
  }
  if (!entityId) return res.status(400).json({ ok: false, error: "O'qituvchi ID topilmadi" });

  try {
    const guruh = await oqituvchiGuruhi(guruhId, ism);
    if (!guruh) return res.status(404).json({ ok: false, error: 'Guruh topilmadi' });

    const oquvchilar = await guruhOquvchilari(guruh, entityId);
    const ids = oquvchilar.map(o => o.id);

    let baholar = [];
    if (ids.length) {
      const r = await pool.query(
        `SELECT oquvchi_id, kategoriya, baho, izoh
           FROM oquvchi_baholar
          WHERE guruh_id = $1 AND sana = $2 AND oquvchi_id = ANY($3::int[])`,
        [guruhId, String(sana), ids]
      );
      baholar = r.rows;
    }
    res.json({ ok: true, oquvchilar, baholar });
  } catch (err) {
    console.error('baholar/guruh GET xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/baholar/guruh/:guruhId — baholarni saqlash ─────────────────────
router.post('/guruh/:guruhId', requireAuth(['oqituvchi']), async (req, res) => {
  const { ism, entityId } = req.user;
  const { sana, baholar } = req.body || {};
  const guruhId = parseInt(req.params.guruhId);

  if (!guruhId || !sana) return res.status(400).json({ ok: false, error: 'guruhId va sana kerak' });
  if (!SANA_RE.test(String(sana))) return res.status(400).json({ ok: false, error: "Sana formati noto'g'ri" });
  if (!Array.isArray(baholar) || !baholar.length) {
    return res.status(400).json({ ok: false, error: 'Baholar ro\'yxati bo\'sh' });
  }
  if (baholar.length > MAX_YOZUV) return res.status(400).json({ ok: false, error: 'Juda ko\'p yozuv' });
  if (!entityId) return res.status(400).json({ ok: false, error: "O'qituvchi ID topilmadi" });

  const kun = haftaKuni(String(sana));
  if (kun === null) return res.status(400).json({ ok: false, error: "Sana formati noto'g'ri" });
  if (String(sana) > bugungiSanaISO()) {
    return res.status(400).json({ ok: false, error: 'Kelajak sanaga baho qo\'yib bo\'lmaydi' });
  }

  // (oquvchi_id, kategoriya) bo'yicha dublikatlarni birlashtiramiz — oxirgisi yutadi
  const map = new Map();
  for (const b of baholar) {
    const oid = parseInt(b && b.oquvchi_id);
    const kat = String((b && b.kategoriya) || '');
    if (!oid || !KATEGORIYALAR.includes(kat)) {
      return res.status(400).json({ ok: false, error: "Kategoriya yoki o'quvchi noto'g'ri" });
    }
    let baho = null;
    if (b.baho !== null && b.baho !== undefined && b.baho !== '') {
      baho = Number(b.baho);
      if (!Number.isInteger(baho) || baho < 1 || baho > 5) {
        return res.status(400).json({ ok: false, error: 'Baho 1 dan 5 gacha bo\'lishi kerak' });
      }
    }
    const izoh = baho === null ? '' : String(b.izoh || '').trim().slice(0, IZOH_MAX);
    map.set(`${oid}:${kat}`, { oid, kat, baho, izoh });
  }
  const yozuvlar = [...map.values()];

  const client = await pool.connect();
  try {
    const guruh = await oqituvchiGuruhi(guruhId, ism);
    if (!guruh) { return res.status(404).json({ ok: false, error: 'Guruh topilmadi' }); }

    // Guruhning dars kuni belgilangan bo'lsa — faqat shu kunlarga baho qo'yiladi
    const kunlar = String(guruh.kunlar || '').split(',').map(k => k.trim()).filter(Boolean).map(Number);
    if (kunlar.length && !kunlar.includes(kun)) {
      return res.status(400).json({ ok: false, error: "Bu kun guruhingiz uchun dars kuni emas" });
    }

    // Faqat shu guruhning (shu o'qituvchiga biriktirilgan) o'quvchilariga baho qo'yish mumkin
    const ruxsat = new Set((await guruhOquvchilari(guruh, entityId)).map(o => o.id));
    if (yozuvlar.some(y => !ruxsat.has(y.oid))) {
      return res.status(403).json({ ok: false, error: "Ba'zi o'quvchilar bu guruhga tegishli emas" });
    }

    const qo = yozuvlar.filter(y => y.baho !== null);
    const och = yozuvlar.filter(y => y.baho === null);

    await client.query('BEGIN');
    if (qo.length) {
      await client.query(
        `INSERT INTO oquvchi_baholar
                (guruh_id, maktab_id, oquvchi_id, sana, kategoriya, baho, izoh, baholagan_id, yangilangan)
         SELECT $1, $2, x.oid, $3, x.kat, x.baho, x.izoh, $4, NOW()
           FROM unnest($5::int[], $6::text[], $7::int[], $8::text[]) AS x(oid, kat, baho, izoh)
         ON CONFLICT (guruh_id, oquvchi_id, sana, kategoriya)
         DO UPDATE SET baho = EXCLUDED.baho, izoh = EXCLUDED.izoh,
                       baholagan_id = EXCLUDED.baholagan_id, yangilangan = NOW()`,
        [guruhId, guruh.maktab_id, String(sana), entityId,
         qo.map(y => y.oid), qo.map(y => y.kat), qo.map(y => y.baho), qo.map(y => y.izoh)]
      );
    }
    if (och.length) {
      await client.query(
        `DELETE FROM oquvchi_baholar
          WHERE guruh_id = $1 AND sana = $2
            AND (oquvchi_id, kategoriya) IN (
              SELECT oid, kat FROM unnest($3::int[], $4::text[]) AS x(oid, kat))`,
        [guruhId, String(sana), och.map(y => y.oid), och.map(y => y.kat)]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, saqlandi: qo.length, ochirildi: och.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('baholar/guruh POST xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  O'QUVCHI — o'z baholarini ko'rish (faqat o'qish)
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /api/baholar/mening-baholarim ────────────────────────────────────────
// Faqat tokendagi o'quvchining (entityId) baholari qaytadi. Bog'lanish
// oquvchi_id orqali, shuning uchun ism/sinf bo'yicha taxmin qilinmaydi.
// Javob: { darslar: [{ sana, guruh_id, fan, teacher_ism, teacher_familiya,
//                      baholar: { uy_vazifa: {baho, izoh}, faollik: {...}, xulq: {...} } }] }
router.get('/mening-baholarim', requireAuth(['oquvchi']), async (req, res) => {
  const { entityId } = req.user;
  if (!entityId) return res.status(400).json({ ok: false, error: "O'quvchi ID topilmadi" });

  try {
    const r = await pool.query(
      `SELECT b.sana, b.guruh_id, b.kategoriya, b.baho, b.izoh,
              dj.fan, dj.teacher_ism, dj.teacher_familiya
         FROM oquvchi_baholar b
         JOIN dars_jadvali dj ON dj.id = b.guruh_id
        WHERE b.oquvchi_id = $1
        ORDER BY b.sana DESC, b.guruh_id ASC`,
      [entityId]
    );

    const map = new Map();
    for (const row of r.rows) {
      const key = `${row.sana}|${row.guruh_id}`;
      if (!map.has(key)) {
        map.set(key, {
          sana: row.sana, guruh_id: row.guruh_id, fan: row.fan || '',
          teacher_ism: row.teacher_ism, teacher_familiya: row.teacher_familiya, baholar: {},
        });
      }
      map.get(key).baholar[row.kategoriya] = { baho: row.baho, izoh: row.izoh || '' };
    }
    res.json({ ok: true, darslar: [...map.values()] });
  } catch (err) {
    console.error('baholar/mening-baholarim GET xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

module.exports = router;
