// ─── Chat routes (o'quvchi ↔ unga biriktirilgan o'qituvchi) ───────────────────
//
//  GET  /api/chat/suhbatlar            — suhbatdoshlar ro'yxati + oxirgi xabar + o'qilmaganlar
//  GET  /api/chat/xabarlar?hamroh=ID   — suhbat xabarlari (?after=ID yangilari, ?before=ID eskilari)
//  POST /api/chat/xabarlar             — xabar yuborish { hamroh, matn }
//  GET  /api/chat/oqilmagan            — jami o'qilmagan xabarlar soni (belgi/badge uchun)
//
//  Ruxsat: FAQAT role='oqituvchi' yoki role='oquvchi' (superadmin ham kirmaydi —
//  tokenida entityId yo'q) va FAQAT oqituvchi_oquvchilar jadvalida biriktirilgan
//  juftlar orasida. "hamroh" — suhbatdoshning id'si (o'qituvchi uchun o'quvchi id,
//  o'quvchi uchun o'qituvchi id). Har bir so'rovda juftlik qayta tekshiriladi.
//
//  Real-time o'rniga qisqa interval bilan so'rov (polling) ishlatiladi: bitta
//  PM2 instance va oddiy nginx proxy bilan ishlaydi, qo'shimcha infratuzilma kerak emas.
const { Router }      = require('express');
const pool            = require('../db');
const { requireAuth } = require('../middleware/jwt');

const router = Router();
router.use(requireAuth(['oqituvchi', 'oquvchi']));

const MAX_MATN  = 2000;
const PAGE_SIZE = 50;

// ─── Kim so'rov yuboryapti: { rol, id } yoki null ────────────────────────────
// requireAuth superadminni ham o'tkazadi (isSuper) — chat uchun u yaroqsiz.
function kim(req) {
  const u = req.user || {};
  if (u.isSuper) return null;
  const id = parseInt(u.entityId, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (u.role === 'oqituvchi' || u.role === 'oquvchi') return { rol: u.role, id };
  return null;
}

// Juftlik: { tId, sId } (o'qituvchi id, o'quvchi id)
function juft(me, hamrohId) {
  return me.rol === 'oqituvchi'
    ? { tId: me.id,   sId: hamrohId }
    : { tId: hamrohId, sId: me.id };
}

// Juftlik biriktirilganmi?
async function biriktirilganmi(tId, sId) {
  const r = await pool.query(
    'SELECT 1 FROM oqituvchi_oquvchilar WHERE oqituvchi_id=$1 AND oquvchi_id=$2',
    [tId, sId]
  );
  return r.rowCount > 0;
}

// Oddiy xotiradagi tezlik cheklovi: bir foydalanuvchi daqiqasiga ko'pi bilan 20 ta xabar
const RATE = new Map();            // "rol:id" -> [vaqtlar]
const RATE_LIMIT = 20, RATE_WINDOW = 60 * 1000;
setInterval(() => {
  const t = Date.now() - RATE_WINDOW;
  for (const [k, arr] of RATE) { const a = arr.filter(x => x > t); a.length ? RATE.set(k, a) : RATE.delete(k); }
}, RATE_WINDOW).unref();
function rateOk(me) {
  const k = me.rol + ':' + me.id, now = Date.now();
  const arr = (RATE.get(k) || []).filter(x => x > now - RATE_WINDOW);
  if (arr.length >= RATE_LIMIT) { RATE.set(k, arr); return false; }
  arr.push(now); RATE.set(k, arr);
  return true;
}

const xabarJson = (r) => ({
  id: Number(r.id), yuboruvchi: r.yuboruvchi, matn: r.matn, yaratilgan: r.yaratilgan,
});

// ─── GET /api/chat/suhbatlar ─────────────────────────────────────────────────
router.get('/suhbatlar', async (req, res) => {
  const me = kim(req);
  if (!me) return res.status(403).json({ ok: false, error: "Faqat o'quvchi va o'qituvchi uchun" });

  try {
    let r;
    if (me.rol === 'oqituvchi') {
      r = await pool.query(
        `SELECT o.id AS hamroh_id, o.ism, o.familiya, o.sinf, o.avatar, m.nomi AS maktab,
                lm.matn AS oxirgi_matn, lm.yuboruvchi AS oxirgi_yuboruvchi, lm.yaratilgan AS oxirgi_vaqt,
                COALESCE(u.soni, 0)::int AS oqilmagan
           FROM oqituvchi_oquvchilar oo
           JOIN oquvchilar o ON o.id = oo.oquvchi_id
           LEFT JOIN maktablar m ON m.id = o.maktab_id
           LEFT JOIN LATERAL (
             SELECT matn, yuboruvchi, yaratilgan FROM chat_xabarlar
              WHERE oqituvchi_id = oo.oqituvchi_id AND oquvchi_id = oo.oquvchi_id
              ORDER BY id DESC LIMIT 1) lm ON TRUE
           LEFT JOIN LATERAL (
             SELECT COUNT(*) AS soni FROM chat_xabarlar
              WHERE oqituvchi_id = oo.oqituvchi_id AND oquvchi_id = oo.oquvchi_id
                AND yuboruvchi = 'oquvchi' AND oqilgan IS NULL) u ON TRUE
          WHERE oo.oqituvchi_id = $1
          ORDER BY lm.yaratilgan DESC NULLS LAST, o.sinf, o.familiya, o.ism`,
        [me.id]
      );
    } else {
      r = await pool.query(
        `SELECT t.id AS hamroh_id, t.ism, t.familiya, t.fan, t.avatar,
                lm.matn AS oxirgi_matn, lm.yuboruvchi AS oxirgi_yuboruvchi, lm.yaratilgan AS oxirgi_vaqt,
                COALESCE(u.soni, 0)::int AS oqilmagan
           FROM oqituvchi_oquvchilar oo
           JOIN oqituvchilar t ON t.id = oo.oqituvchi_id
           LEFT JOIN LATERAL (
             SELECT matn, yuboruvchi, yaratilgan FROM chat_xabarlar
              WHERE oqituvchi_id = oo.oqituvchi_id AND oquvchi_id = oo.oquvchi_id
              ORDER BY id DESC LIMIT 1) lm ON TRUE
           LEFT JOIN LATERAL (
             SELECT COUNT(*) AS soni FROM chat_xabarlar
              WHERE oqituvchi_id = oo.oqituvchi_id AND oquvchi_id = oo.oquvchi_id
                AND yuboruvchi = 'oqituvchi' AND oqilgan IS NULL) u ON TRUE
          WHERE oo.oquvchi_id = $1
          ORDER BY lm.yaratilgan DESC NULLS LAST, t.familiya, t.ism`,
        [me.id]
      );
    }
    res.json({ ok: true, suhbatlar: r.rows });
  } catch (err) {
    console.error('chat/suhbatlar xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/chat/oqilmagan ─────────────────────────────────────────────────
// Faqat hozir ham biriktirilgan juftlar hisoblanadi (ajratilgan suhbatlar belgi qoldirmasin).
router.get('/oqilmagan', async (req, res) => {
  const me = kim(req);
  if (!me) return res.status(403).json({ ok: false, error: "Faqat o'quvchi va o'qituvchi uchun" });
  try {
    const sender = me.rol === 'oqituvchi' ? 'oquvchi' : 'oqituvchi';
    const r = await pool.query(
      `SELECT COUNT(*)::int AS soni
         FROM chat_xabarlar c
         JOIN oqituvchi_oquvchilar oo
           ON oo.oqituvchi_id = c.oqituvchi_id AND oo.oquvchi_id = c.oquvchi_id
        WHERE c.${me.rol === 'oqituvchi' ? 'oqituvchi_id' : 'oquvchi_id'} = $1
          AND c.yuboruvchi = $2 AND c.oqilgan IS NULL`,
      [me.id, sender]
    );
    res.json({ ok: true, soni: r.rows[0].soni });
  } catch (err) {
    console.error('chat/oqilmagan xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/chat/xabarlar?hamroh=ID[&after=ID | &before=ID] ────────────────
// Parametrsiz — oxirgi 50 ta xabar. after — shu id'dan KEYINGI (yangi) xabarlar.
// before — shu id'dan OLDINGI (eski) xabarlar, 50 tadan. Javobda har doim
// xabarlar eskidan yangiga tartiblangan. Suhbatdoshning yuborgan xabarlari
// o'qilgan deb belgilanadi. `oqilgan_id` — MENING yuborgan xabarlarimdan
// suhbatdosh o'qiganlarining eng kattasi (✓✓ belgisi uchun).
router.get('/xabarlar', async (req, res) => {
  const me = kim(req);
  if (!me) return res.status(403).json({ ok: false, error: "Faqat o'quvchi va o'qituvchi uchun" });

  const hamrohId = parseInt(req.query.hamroh, 10);
  if (!Number.isInteger(hamrohId) || hamrohId <= 0)
    return res.status(400).json({ ok: false, error: 'Suhbatdosh tanlanmagan' });

  const after  = parseInt(req.query.after, 10);
  const before = parseInt(req.query.before, 10);
  const { tId, sId } = juft(me, hamrohId);
  const hamrohRol = me.rol === 'oqituvchi' ? 'oquvchi' : 'oqituvchi';

  try {
    if (!(await biriktirilganmi(tId, sId)))
      return res.status(403).json({ ok: false, error: "Bu foydalanuvchi bilan yozishish mumkin emas" });

    let rows;
    if (Number.isInteger(after) && after > 0) {
      rows = (await pool.query(
        `SELECT id, yuboruvchi, matn, yaratilgan FROM chat_xabarlar
          WHERE oqituvchi_id=$1 AND oquvchi_id=$2 AND id > $3
          ORDER BY id ASC LIMIT 200`,
        [tId, sId, after]
      )).rows;
    } else if (Number.isInteger(before) && before > 0) {
      rows = (await pool.query(
        `SELECT id, yuboruvchi, matn, yaratilgan FROM chat_xabarlar
          WHERE oqituvchi_id=$1 AND oquvchi_id=$2 AND id < $3
          ORDER BY id DESC LIMIT $4`,
        [tId, sId, before, PAGE_SIZE]
      )).rows.reverse();
    } else {
      rows = (await pool.query(
        `SELECT id, yuboruvchi, matn, yaratilgan FROM chat_xabarlar
          WHERE oqituvchi_id=$1 AND oquvchi_id=$2
          ORDER BY id DESC LIMIT $3`,
        [tId, sId, PAGE_SIZE]
      )).rows.reverse();
    }

    // Suhbatdoshning xabarlarini o'qilgan deb belgilash
    await pool.query(
      `UPDATE chat_xabarlar SET oqilgan = NOW()
        WHERE oqituvchi_id=$1 AND oquvchi_id=$2 AND yuboruvchi=$3 AND oqilgan IS NULL`,
      [tId, sId, hamrohRol]
    );

    const o = await pool.query(
      `SELECT COALESCE(MAX(id), 0) AS m FROM chat_xabarlar
        WHERE oqituvchi_id=$1 AND oquvchi_id=$2 AND yuboruvchi=$3 AND oqilgan IS NOT NULL`,
      [tId, sId, me.rol]
    );

    res.json({
      ok: true,
      xabarlar: rows.map(xabarJson),
      oqilgan_id: Number(o.rows[0].m),
      // before so'rovida to'liq sahifa qaytsa — yana eskilari bo'lishi mumkin
      yana_bor: Number.isInteger(before) && before > 0 ? rows.length === PAGE_SIZE : undefined,
    });
  } catch (err) {
    console.error('chat/xabarlar GET xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/chat/xabarlar ─────────────────────────────────────────────────
router.post('/xabarlar', async (req, res) => {
  const me = kim(req);
  if (!me) return res.status(403).json({ ok: false, error: "Faqat o'quvchi va o'qituvchi uchun" });

  const hamrohId = parseInt(req.body && req.body.hamroh, 10);
  if (!Number.isInteger(hamrohId) || hamrohId <= 0)
    return res.status(400).json({ ok: false, error: 'Suhbatdosh tanlanmagan' });

  // Qator o'tishlari saqlanadi; chetidagi bo'shliqlar olib tashlanadi
  const matn = String((req.body && req.body.matn) ?? '').replace(/\r\n/g, '\n').trim();
  if (!matn)
    return res.status(400).json({ ok: false, error: "Xabar bo'sh bo'lmasligi kerak" });
  if (matn.length > MAX_MATN)
    return res.status(400).json({ ok: false, error: `Xabar ${MAX_MATN} belgidan oshmasligi kerak` });

  if (!rateOk(me))
    return res.status(429).json({ ok: false, error: "Juda tez yozyapsiz. Biroz kutib qayta urinib ko'ring" });

  const { tId, sId } = juft(me, hamrohId);
  try {
    if (!(await biriktirilganmi(tId, sId)))
      return res.status(403).json({ ok: false, error: "Bu foydalanuvchi bilan yozishish mumkin emas" });

    const r = await pool.query(
      `INSERT INTO chat_xabarlar (oqituvchi_id, oquvchi_id, yuboruvchi, matn)
       VALUES ($1, $2, $3, $4)
       RETURNING id, yuboruvchi, matn, yaratilgan`,
      [tId, sId, me.rol, matn]
    );
    res.json({ ok: true, xabar: xabarJson(r.rows[0]) });
  } catch (err) {
    console.error('chat/xabarlar POST xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

module.exports = router;
