// ─── Guruh chati routes (o'qituvchi + uning guruhidagi o'quvchilar) ──────────────
//
//  GET    /api/chat/guruh/guruhlar                — mening guruhlarim + oxirgi xabar + o'qilmaganlar
//  GET    /api/chat/guruh/xabarlar?guruh=ID       — guruh xabarlari (?after=ID yangilari, ?before=ID eskilari,
//                                                    ?ozgarish=ISO — shu vaqtdan keyin tahrir/o'chirilganlar)
//  POST   /api/chat/guruh/xabarlar                — yuborish: JSON { guruh, matn, javob? }
//                                                    yoki multipart { guruh, matn?, javob?, davomiylik?, fayl }
//  PUT    /api/chat/guruh/xabarlar/:id            — O'Z xabarini tahrirlash { matn }
//  DELETE /api/chat/guruh/xabarlar/:id            — o'zinikini o'chirish (o'qituvchi o'z guruhida istalganini)
//  GET    /api/chat/guruh/xabarlar/:id/fayl-url   — faylga qisqa muddatli imzolangan havola
//  GET    /api/chat/guruh/oqilmagan               — jami o'qilmagan xabarlar (belgi/badge uchun)
//
//  Qoidalar:
//   • Guruhga faqat a'zo (o'qituvchi egasi yoki guruhdagi o'quvchi) kiradi — har so'rovda tekshiriladi
//     (routes/chatAccess.js guruhgaKirish). A'zolik o'zgarsa, kirish ham darrov o'zgaradi.
//   • O'quvchi guruhda oddiy xabar ham, reply ham, audio/fayl ham yubora oladi.
//   • Shaxsiy yozishma faqat o'qituvchi ↔ o'quvchi (routes/chat.js). O'quvchi ↔ o'quvchi
//     shaxsiy chat YO'Q: bu router faqat guruhga yozadi.
const { Router }      = require('express');
const pool            = require('../db');
const { requireAuth } = require('../middleware/jwt');
const {
  kim, guruhlarSql, guruhgaKirish, rateOk, tanlanganMaktab, SINF_MOS,
} = require('./chatAccess');
const {
  qabulFayl, unlinkQuiet, faylMalumoti, kvotaOshmaydimi, KVOTA_XABARI,
  imzola, FAYL_ROYXAT_MATNI,
} = require('./chatFayl');

const router = Router();
router.use(requireAuth(['oqituvchi', 'oquvchi']));

const MAX_MATN  = 2000;
const PAGE_SIZE = 50;
const FAQAT = "Faqat o'quvchi va o'qituvchi uchun";
const KIRISH_YOQ = "Bu guruh chatiga kirish huquqingiz yo'q";

// Xabar ustunlari (har doim shu ro'yxat bilan o'qiladi; fayl_yol HECH QACHON mijozga ketmaydi).
// g = chat_guruh_xabarlar, r = javob berilgan xabar.
const ISM = (alias) => `CASE WHEN ${alias}.yuboruvchi = 'oqituvchi'
    THEN (SELECT TRIM(COALESCE(t.familiya,'') || ' ' || COALESCE(t.ism,'')) FROM oqituvchilar t WHERE t.id = ${alias}.yuboruvchi_id)
    ELSE (SELECT TRIM(COALESCE(o.familiya,'') || ' ' || COALESCE(o.ism,'')) FROM oquvchilar  o WHERE o.id = ${alias}.yuboruvchi_id)
  END`;
const COLS = `g.id, g.guruh_id, g.yuboruvchi, g.yuboruvchi_id, g.matn, g.yaratilgan, g.tahrirlangan,
  g.ochirilgan, g.javob_id, g.fayl_nomi, g.fayl_turi, g.fayl_hajm, g.fayl_davomiylik,
  (g.fayl_yol IS NOT NULL) AS fayl_bor,
  ${ISM('g')} AS ism,
  r.id AS r_id, r.ochirilgan AS r_ochirilgan, LEFT(r.matn, 140) AS r_matn,
  r.fayl_nomi AS r_fayl_nomi, r.fayl_turi AS r_fayl_turi,
  CASE WHEN r.id IS NULL THEN NULL ELSE ${ISM('r')} END AS r_ism`;
const FROM_MSG = `FROM chat_guruh_xabarlar g LEFT JOIN chat_guruh_xabarlar r ON r.id = g.javob_id`;

const fayJson = (nomi, turi, hajm, davomiylik) => ({
  nomi, turi: (turi || '').split(';')[0], hajm,
  rasm:  /^image\//.test(turi || ''),
  audio: /^audio\//.test(turi || ''),
  ...(davomiylik != null ? { davomiylik } : {}),
});

function xabarJson(r, me) {
  if (r.ochirilgan) return { id: Number(r.id), ochirilgan: true };
  const j = {
    id: Number(r.id), yuboruvchi: r.yuboruvchi, yuboruvchi_id: r.yuboruvchi_id,
    meniki: r.yuboruvchi === me.rol && r.yuboruvchi_id === me.id,
    ism: r.ism || '', matn: r.matn, yaratilgan: r.yaratilgan,
    tahrirlangan: r.tahrirlangan || null,
  };
  if (r.javob_id) {
    j.javob = (r.r_id && !r.r_ochirilgan)
      ? {
          id: Number(r.r_id), ism: r.r_ism || '', matn: r.r_matn || '',
          ...(r.r_fayl_nomi ? { fayl: { nomi: r.r_fayl_nomi, audio: /^audio\//.test(r.r_fayl_turi || ''), rasm: /^image\//.test(r.r_fayl_turi || '') } } : {}),
        }
      : { id: Number(r.javob_id), ochirilgan: true };
  }
  if (r.fayl_bor) j.fayl = fayJson(r.fayl_nomi, r.fayl_turi, r.fayl_hajm, r.fayl_davomiylik);
  return j;
}

// Guruh chatini "o'qilgan" deb belgilash: oxirgi_id = guruhdagi eng katta xabar id'si
async function oqilganBelgila(me, guruhId) {
  await pool.query(
    `INSERT INTO chat_guruh_oqilgan (guruh_id, rol, user_id, oxirgi_id)
     VALUES ($1, $2, $3, COALESCE((SELECT MAX(id) FROM chat_guruh_xabarlar WHERE guruh_id = $1), 0))
     ON CONFLICT (guruh_id, rol, user_id)
     DO UPDATE SET oxirgi_id = GREATEST(chat_guruh_oqilgan.oxirgi_id, EXCLUDED.oxirgi_id)`,
    [guruhId, me.rol, me.id]
  );
}

// ─── GET /api/chat/guruh/guruhlar ────────────────────────────────────────────
router.get('/guruhlar', async (req, res) => {
  const me = kim(req);
  if (!me) return res.status(403).json({ ok: false, error: FAQAT });
  const sel = tanlanganMaktab(req, me);
  if (sel.error) return res.status(403).json({ ok: false, error: sel.error });

  try {
    const { from, where } = guruhlarSql(me);
    const r = await pool.query(
      `SELECT dj.id AS guruh_id, dj.fan, dj.sinflar, dj.kunlar, dj.boshlanish, dj.tugash,
              dj.maktab_id, m.nomi AS maktab,
              t.id AS oqituvchi_id, t.ism AS oqituvchi_ism, t.familiya AS oqituvchi_familiya,
              t.avatar AS oqituvchi_avatar,
              (SELECT COUNT(*)::int
                 FROM oqituvchi_oquvchilar oo2
                 JOIN oquvchilar o ON o.id = oo2.oquvchi_id
                WHERE oo2.oqituvchi_id = t.id AND o.maktab_id = dj.maktab_id AND ${SINF_MOS}) AS azolar,
              lm.matn AS oxirgi_matn, lm.yuboruvchi AS oxirgi_yuboruvchi, lm.ism AS oxirgi_ism,
              lm.yaratilgan AS oxirgi_vaqt, lm.fayl_nomi AS oxirgi_fayl_nomi,
              (lm.fayl_turi LIKE 'image/%') AS oxirgi_fayl_rasm,
              (lm.fayl_turi LIKE 'audio/%') AS oxirgi_fayl_audio,
              COALESCE(u.soni, 0)::int AS oqilmagan
         ${from}
         LEFT JOIN maktablar m ON m.id = dj.maktab_id
         LEFT JOIN LATERAL (
           SELECT x.matn, x.yuboruvchi, x.yaratilgan, x.fayl_nomi, x.fayl_turi,
                  ${ISM('x')} AS ism
             FROM chat_guruh_xabarlar x
            WHERE x.guruh_id = dj.id AND x.ochirilgan IS NULL
            ORDER BY x.id DESC LIMIT 1) lm ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS soni FROM chat_guruh_xabarlar x
            WHERE x.guruh_id = dj.id AND x.ochirilgan IS NULL
              AND x.id > COALESCE((SELECT oxirgi_id FROM chat_guruh_oqilgan
                                    WHERE guruh_id = dj.id AND rol = $3 AND user_id = $1), 0)
              AND NOT (x.yuboruvchi = $3 AND x.yuboruvchi_id = $1)) u ON TRUE
        ${where} AND ($2::int IS NULL OR dj.maktab_id = $2::int)
        ORDER BY lm.yaratilgan DESC NULLS LAST, dj.id`,
      [me.id, sel.mid, me.rol]
    );
    res.json({ ok: true, guruhlar: r.rows });
  } catch (err) {
    console.error('chat/guruh/guruhlar xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/chat/guruh/oqilmagan ───────────────────────────────────────────
router.get('/oqilmagan', async (req, res) => {
  const me = kim(req);
  if (!me) return res.status(403).json({ ok: false, error: FAQAT });
  const sel = tanlanganMaktab(req, me);
  if (sel.error) return res.status(403).json({ ok: false, error: sel.error });
  try {
    const { from, where } = guruhlarSql(me);
    const r = await pool.query(
      `SELECT COALESCE(SUM(s.soni), 0)::int AS soni FROM (
         SELECT (SELECT COUNT(*) FROM chat_guruh_xabarlar x
                  WHERE x.guruh_id = dj.id AND x.ochirilgan IS NULL
                    AND x.id > COALESCE((SELECT oxirgi_id FROM chat_guruh_oqilgan
                                          WHERE guruh_id = dj.id AND rol = $3 AND user_id = $1), 0)
                    AND NOT (x.yuboruvchi = $3 AND x.yuboruvchi_id = $1)) AS soni
           ${from}
          ${where} AND ($2::int IS NULL OR dj.maktab_id = $2::int)
       ) s`,
      [me.id, sel.mid, me.rol]
    );
    res.json({ ok: true, soni: r.rows[0].soni });
  } catch (err) {
    console.error('chat/guruh/oqilmagan xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/chat/guruh/xabarlar?guruh=ID[&after=ID | &before=ID][&ozgarish=ISO] ─
router.get('/xabarlar', async (req, res) => {
  const me = kim(req);
  if (!me) return res.status(403).json({ ok: false, error: FAQAT });

  const guruhId = parseInt(req.query.guruh, 10);
  if (!Number.isInteger(guruhId) || guruhId <= 0)
    return res.status(400).json({ ok: false, error: 'Guruh tanlanmagan' });

  const after  = parseInt(req.query.after, 10);
  const before = parseInt(req.query.before, 10);
  const ozg    = req.query.ozgarish ? new Date(req.query.ozgarish) : null;

  try {
    const guruh = await guruhgaKirish(me, guruhId);
    if (!guruh) return res.status(403).json({ ok: false, error: KIRISH_YOQ });

    const serverVaqt = (await pool.query('SELECT NOW() AS t')).rows[0].t;

    let rows, ozgargan;
    if (Number.isInteger(after) && after > 0) {
      rows = (await pool.query(
        `SELECT ${COLS} ${FROM_MSG}
          WHERE g.guruh_id = $1 AND g.id > $2 AND g.ochirilgan IS NULL
          ORDER BY g.id ASC LIMIT 200`,
        [guruhId, after]
      )).rows;
      if (ozg && !isNaN(ozg.getTime())) {
        ozgargan = (await pool.query(
          `SELECT ${COLS} ${FROM_MSG}
            WHERE g.guruh_id = $1 AND g.id <= $2 AND g.yangilangan > $3
            ORDER BY g.id ASC LIMIT 200`,
          [guruhId, after, ozg]
        )).rows;
      }
    } else if (Number.isInteger(before) && before > 0) {
      rows = (await pool.query(
        `SELECT ${COLS} ${FROM_MSG}
          WHERE g.guruh_id = $1 AND g.id < $2 AND g.ochirilgan IS NULL
          ORDER BY g.id DESC LIMIT $3`,
        [guruhId, before, PAGE_SIZE]
      )).rows.reverse();
    } else {
      rows = (await pool.query(
        `SELECT ${COLS} ${FROM_MSG}
          WHERE g.guruh_id = $1 AND g.ochirilgan IS NULL
          ORDER BY g.id DESC LIMIT $2`,
        [guruhId, PAGE_SIZE]
      )).rows.reverse();
    }

    // Eski xabarlarni ochish (before) guruhni "o'qilgan" qilmaydi
    if (!(Number.isInteger(before) && before > 0)) await oqilganBelgila(me, guruhId);

    res.json({
      ok: true,
      xabarlar: rows.map(r => xabarJson(r, me)),
      ...(ozgargan ? { ozgargan: ozgargan.map(r => xabarJson(r, me)) } : {}),
      server_vaqt: serverVaqt,
      yana_bor: Number.isInteger(before) && before > 0 ? rows.length === PAGE_SIZE : undefined,
    });
  } catch (err) {
    console.error('chat/guruh/xabarlar GET xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/chat/guruh/xabarlar ───────────────────────────────────────────
router.post('/xabarlar', qabulFayl, async (req, res) => {
  const file = req.file || null;
  const fail = (code, error) => { if (file) unlinkQuiet(file.filename); return res.status(code).json({ ok: false, error }); };

  const me = kim(req);
  if (!me) return fail(403, FAQAT);

  const guruhId = parseInt(req.body && req.body.guruh, 10);
  if (!Number.isInteger(guruhId) || guruhId <= 0) return fail(400, 'Guruh tanlanmagan');

  const matn = String((req.body && req.body.matn) ?? '').replace(/\r\n/g, '\n').trim();

  if (!file && req.is('multipart/form-data') && !matn)
    return fail(400, `Fayl turi qo'llab-quvvatlanmaydi (${FAYL_ROYXAT_MATNI})`);
  if (!matn && !file) return fail(400, "Xabar bo'sh bo'lmasligi kerak");
  if (matn.length > MAX_MATN) return fail(400, `Xabar ${MAX_MATN} belgidan oshmasligi kerak`);

  const javobRaw = req.body && req.body.javob;
  const javobId  = (javobRaw === undefined || javobRaw === null || javobRaw === '') ? null : parseInt(javobRaw, 10);
  if (javobId !== null && (!Number.isInteger(javobId) || javobId <= 0)) return fail(400, 'Javob berilayotgan xabar topilmadi');

  let fayl = null;
  if (file) {
    fayl = faylMalumoti(file, req.body && req.body.davomiylik);
    if (fayl.error) return fail(400, fayl.error);
  }

  if (!rateOk(me)) return fail(429, "Juda tez yozyapsiz. Biroz kutib qayta urinib ko'ring");

  try {
    const guruh = await guruhgaKirish(me, guruhId);
    if (!guruh) return fail(403, KIRISH_YOQ);

    if (javobId !== null) {
      const j = await pool.query(
        `SELECT 1 FROM chat_guruh_xabarlar WHERE id = $1 AND guruh_id = $2 AND ochirilgan IS NULL`,
        [javobId, guruhId]
      );
      if (!j.rowCount) return fail(400, 'Javob berilayotgan xabar topilmadi yoki o\'chirilgan');
    }

    if (fayl && !(await kvotaOshmaydimi(me, fayl.hajm))) return fail(413, KVOTA_XABARI);

    const ins = await pool.query(
      `INSERT INTO chat_guruh_xabarlar
         (guruh_id, yuboruvchi, yuboruvchi_id, matn, javob_id, fayl_yol, fayl_nomi, fayl_turi, fayl_hajm, fayl_davomiylik)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [guruhId, me.rol, me.id, matn, javobId,
       fayl && fayl.yol, fayl && fayl.nomi, fayl && fayl.turi, fayl && fayl.hajm, fayl && fayl.davomiylik]
    );
    const r = await pool.query(`SELECT ${COLS} ${FROM_MSG} WHERE g.id = $1`, [ins.rows[0].id]);
    // O'z xabarimni yuborganimdan keyin guruh men uchun o'qilgan hisoblanadi
    await oqilganBelgila(me, guruhId);
    res.json({ ok: true, xabar: xabarJson(r.rows[0], me) });
  } catch (err) {
    console.error('chat/guruh/xabarlar POST xatolik:', err.message);
    fail(500, 'Server xatoligi');
  }
});

// ─── Xabarni topish + huquqni tekshirish (tahrirlash/o'chirish/fayl uchun) ───
// ega=true — faqat yuboruvchining o'zi. moderator=true — o'qituvchi o'z guruhida
// boshqalarning xabarini ham o'chira oladi.
async function xabarOl(me, idRaw, { ega = true, moderator = false } = {}) {
  const id = parseInt(idRaw, 10);
  if (!Number.isInteger(id) || id <= 0) return { code: 400, error: 'Xabar topilmadi' };
  const r = await pool.query(
    `SELECT id, guruh_id, yuboruvchi, yuboruvchi_id, matn, fayl_yol
       FROM chat_guruh_xabarlar WHERE id = $1 AND ochirilgan IS NULL`,
    [id]
  );
  if (!r.rowCount) return { code: 404, error: 'Xabar topilmadi' };
  const row = r.rows[0];
  const guruh = await guruhgaKirish(me, row.guruh_id);
  if (!guruh) return { code: 403, error: KIRISH_YOQ };
  const meniki = row.yuboruvchi === me.rol && row.yuboruvchi_id === me.id;
  if (ega && !meniki && !(moderator && me.rol === 'oqituvchi'))
    return { code: 404, error: 'Xabar topilmadi yoki u sizniki emas' };
  return { row };
}

// ─── PUT /api/chat/guruh/xabarlar/:id — tahrirlash ───────────────────────────
router.put('/xabarlar/:id', async (req, res) => {
  const me = kim(req);
  if (!me) return res.status(403).json({ ok: false, error: FAQAT });

  const matn = String((req.body && req.body.matn) ?? '').replace(/\r\n/g, '\n').trim();
  if (matn.length > MAX_MATN)
    return res.status(400).json({ ok: false, error: `Xabar ${MAX_MATN} belgidan oshmasligi kerak` });

  try {
    const f = await xabarOl(me, req.params.id);
    if (f.error) return res.status(f.code).json({ ok: false, error: f.error });

    if (!matn && !f.row.fayl_yol)
      return res.status(400).json({ ok: false, error: "Xabar bo'sh bo'lmasligi kerak. Butunlay olib tashlash uchun o'chiring" });

    if (matn !== f.row.matn) {
      await pool.query(
        `UPDATE chat_guruh_xabarlar SET matn = $2, tahrirlangan = NOW(), yangilangan = NOW()
          WHERE id = $1 AND ochirilgan IS NULL`,
        [f.row.id, matn]
      );
    }
    const r = await pool.query(`SELECT ${COLS} ${FROM_MSG} WHERE g.id = $1`, [f.row.id]);
    res.json({ ok: true, xabar: xabarJson(r.rows[0], me) });
  } catch (err) {
    console.error('chat/guruh/xabarlar PUT xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── DELETE /api/chat/guruh/xabarlar/:id — o'chirish ─────────────────────────
router.delete('/xabarlar/:id', async (req, res) => {
  const me = kim(req);
  if (!me) return res.status(403).json({ ok: false, error: FAQAT });

  try {
    const f = await xabarOl(me, req.params.id, { moderator: true });
    if (f.error) return res.status(f.code).json({ ok: false, error: f.error });

    const r = await pool.query(
      `UPDATE chat_guruh_xabarlar
          SET ochirilgan = NOW(), yangilangan = NOW(), matn = '',
              fayl_yol = NULL, fayl_nomi = NULL, fayl_turi = NULL, fayl_hajm = NULL, fayl_davomiylik = NULL
        WHERE id = $1 AND ochirilgan IS NULL`,
      [f.row.id]
    );
    if (r.rowCount) unlinkQuiet(f.row.fayl_yol);
    res.json({ ok: true, id: Number(f.row.id) });
  } catch (err) {
    console.error('chat/guruh/xabarlar DELETE xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/chat/guruh/xabarlar/:id/fayl-url — imzolangan havola ───────────
router.get('/xabarlar/:id/fayl-url', async (req, res) => {
  const me = kim(req);
  if (!me) return res.status(403).json({ ok: false, error: FAQAT });
  try {
    const f = await xabarOl(me, req.params.id, { ega: false });
    if (f.error) return res.status(f.code).json({ ok: false, error: f.error });
    if (!f.row.fayl_yol) return res.status(404).json({ ok: false, error: 'Fayl topilmadi' });
    const token = imzola({ t: 'g', i: Number(f.row.id), r: me.rol, u: me.id });
    res.json({ ok: true, url: `/api/chat/f/${token}` });
  } catch (err) {
    console.error('chat/guruh/fayl-url xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

module.exports = router;
