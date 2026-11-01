// ═══════════════════════════════════════════════════════════════════════════
//  ONLINE KURSLAR — tashqi maktab o'qituvchilari uchun kurs, test, sertifikat
//
//  Rollar (JWT payload.role):
//    superadmin     → /api/kurs/super/...      kurs va kurs adminlarini yaratadi
//    kurs_admin     → /api/kurs/admin/...      o'z kursining sozlamalari, savollari, ishtirokchilari
//    kurs_ishtirokchi → /api/kurs/ish/...      o'z profili, test, sertifikat
//  Ochiq:
//    POST /api/kurs/taklif-qabul               Telegram'ni taklif kodi bilan biriktirish
//    GET  /api/sertifikat/tekshir/:kod         sertifikat haqiqiyligini tekshirish (routes/sertifikat_public.js)
//
//  Kirish: Telegram Mini App (initData imzosi tekshiriladi — routes/telegram.js /kirish).
// ═══════════════════════════════════════════════════════════════════════════
const { Router } = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth } = require('../middleware/jwt');
const { tekshirYoki } = require('../telegramVerify');
const { sertifikatPdf } = require('../sertifikatPdf');

const router = Router();

// ─── Yordamchilar ────────────────────────────────────────────────────────────
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(err => {
  console.error('kurslar xatolik:', err);
  res.status(500).json({ ok: false, error: 'Server xatoligi' });
});

const KOD_ALIFBO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';        // 0/O, 1/I/L aralashmasin
function tasodifiyKod(uzunlik) {
  const b = crypto.randomBytes(uzunlik);
  let s = '';
  for (let i = 0; i < uzunlik; i++) s += KOD_ALIFBO[b[i] % KOD_ALIFBO.length];
  return s;
}

// Oddiy xotiradagi tezlik cheklovi (bitta PM2 instance)
function limiter(max, oynaMs) {
  const m = new Map();
  setInterval(() => { const n = Date.now(); for (const [k, v] of m) if (v.t < n) m.delete(k); }, 60 * 1000).unref();
  return (key) => {
    const n = Date.now();
    let v = m.get(key);
    if (!v || v.t < n) { v = { c: 0, t: n + oynaMs }; m.set(key, v); }
    v.c++;
    return v.c <= max;
  };
}
const kodUrinishLimit = limiter(10, 15 * 60 * 1000);

function clientIp(req) {
  return String(req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.ip || '').trim();
}

// Ism-familiya: o' / g' → oʻ / gʻ, ortiqcha bo'sh joylar, kichik/KATTA harf tartibi
const SUFFIKS = new Set(['oʻgʻli', 'ogʻli', 'ogli', 'oglu', 'ugli', 'qizi', 'kizi']);
function normIsm(s, maks = 60) {
  let t = String(s == null ? '' : s).replace(/[‘’ʼ`´']/g, "'");
  t = t.replace(/([oOgG])'/g, '$1ʻ').replace(/'/g, 'ʼ');
  t = t.replace(/\s+/g, ' ').trim().slice(0, maks);
  return t.split(' ').map(w => {
    if (!w) return w;
    const low = w.toLowerCase();
    if (SUFFIKS.has(low)) return low;
    if (w === low || w === w.toUpperCase()) return low.charAt(0).toUpperCase() + low.slice(1);
    return w;
  }).join(' ');
}
function matn(s, maks) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, maks); }
function telefonToza(s) { return String(s == null ? '' : s).replace(/[^\d+]/g, '').slice(0, 20); }
function butun(v) { const n = Number(v); return Number.isInteger(n) ? n : NaN; }

async function noyobKod(jadval, uzunlik) {
  for (let i = 0; i < 8; i++) {
    const kod = tasodifiyKod(uzunlik);
    const r = await pool.query(`SELECT 1 FROM kurs_adminlar WHERE taklif_kodi=$1
                                UNION ALL SELECT 1 FROM kurs_ishtirokchilar WHERE taklif_kodi=$1`, [kod]);
    if (r.rowCount === 0) return kod;
  }
  throw new Error('Kod yaratib bo\'lmadi');
}

const ROLLAR = {
  kurs_admin:       { jadval: 'kurs_adminlar' },
  kurs_ishtirokchi: { jadval: 'kurs_ishtirokchilar' },
};
async function telegramAjrat(rol, entityId, client = pool) {
  await client.query('DELETE FROM telegram_users WHERE rol=$1 AND entity_id=$2 AND entity_table=$3',
    [rol, entityId, ROLLAR[rol].jadval]);
}

// ─── Middleware'lar ──────────────────────────────────────────────────────────
function faqatSuper(req, res, next) {
  if (!req.user || !req.user.isSuper) return res.status(403).json({ ok: false, error: 'Faqat superadmin uchun' });
  next();
}

// kurs_admin: kurs_id bazadan olinadi (token'dagi qiymatga ishonilmaydi).
// Superadmin ham ?kurs_id= bilan shu route'lardan foydalana oladi.
async function kursAdminMw(req, res, next) {
  try {
    if (req.user.isSuper) {
      const kid = butun(req.query.kurs_id ?? (req.body && req.body.kurs_id));
      if (!kid) return res.status(400).json({ ok: false, error: 'kurs_id kerak' });
      req.kursId = kid;
      return next();
    }
    const r = await pool.query('SELECT kurs_id FROM kurs_adminlar WHERE id=$1', [req.user.entityId]);
    if (r.rowCount === 0) return res.status(403).json({ ok: false, error: 'Kurs admini topilmadi' });
    req.kursId = r.rows[0].kurs_id;
    next();
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server xatoligi' }); }
}

async function ishtirokchiMw(req, res, next) {
  try {
    if (req.user.isSuper) return res.status(403).json({ ok: false, error: 'Ishtirokchi uchun' });
    const r = await pool.query(
      `SELECT i.*, k.nomi AS kurs_nomi, k.tavsif AS kurs_tavsif, k.holat AS kurs_holat, k.otish_foiz,
              k.urinish_limit, k.savol_soni, k.vaqt_daqiqa, k.direktor_fio
         FROM kurs_ishtirokchilar i JOIN online_kurslar k ON k.id = i.kurs_id
        WHERE i.id=$1`, [req.user.entityId]);
    if (r.rowCount === 0) return res.status(403).json({ ok: false, error: 'Ishtirokchi topilmadi (kursdan chiqarilgan bo\'lishi mumkin)' });
    req.ish = r.rows[0];
    next();
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server xatoligi' }); }
}

// ═══════════════════════════════════════════════════════════════════════════
//  TAKLIF KODI → TELEGRAM BIRIKTIRISH (ochiq, lekin initData imzosi shart)
// ═══════════════════════════════════════════════════════════════════════════
router.post('/taklif-qabul', wrap(async (req, res) => {
  const tg = tekshirYoki(req, res);
  if (!tg) return;
  if (!kodUrinishLimit('tg:' + tg.id) || !kodUrinishLimit('ip:' + clientIp(req))) {
    return res.status(429).json({ ok: false, error: 'Juda ko\'p urinish. 15 daqiqadan keyin qayta urinib ko\'ring.' });
  }
  const kod = String((req.body && req.body.kod) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (kod.length < 6) return res.status(400).json({ ok: false, error: 'Kod noto\'g\'ri' });

  let rol, jadval, entityId;
  let r = await pool.query('SELECT id FROM kurs_adminlar WHERE taklif_kodi=$1', [kod]);
  if (r.rowCount) { rol = 'kurs_admin'; jadval = 'kurs_adminlar'; entityId = r.rows[0].id; }
  else {
    r = await pool.query('SELECT id FROM kurs_ishtirokchilar WHERE taklif_kodi=$1', [kod]);
    if (r.rowCount) { rol = 'kurs_ishtirokchi'; jadval = 'kurs_ishtirokchilar'; entityId = r.rows[0].id; }
  }
  if (!rol) return res.status(404).json({ ok: false, error: 'Kod noto\'g\'ri. Kursingiz adminidan kodni qayta so\'rang.' });

  const band = await pool.query(
    'SELECT telegram_id FROM telegram_users WHERE rol=$1 AND entity_id=$2 AND entity_table=$3', [rol, entityId, jadval]);
  if (band.rowCount && Number(band.rows[0].telegram_id) !== tg.id) {
    return res.status(409).json({ ok: false, error: 'Bu kod boshqa Telegram hisobiga ulangan. Admindan yangi kod so\'rang.' });
  }
  await pool.query(
    `INSERT INTO telegram_users (telegram_id, telegram_ism, rol, entity_id, entity_table)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (telegram_id, rol, entity_id) DO NOTHING`,
    [tg.id, tg.ism || null, rol, entityId, jadval]);

  const { buildAuthResponse } = require('./telegram');
  const row = { rol, entity_id: entityId, entity_table: jadval };
  const out = await buildAuthResponse(row, tg.id);
  if (!out) return res.status(404).json({ ok: false, error: 'Ma\'lumot topilmadi' });
  res.json(out);
}));

// ═══════════════════════════════════════════════════════════════════════════
//  SUPERADMIN: kurslar va kurs adminlari
// ═══════════════════════════════════════════════════════════════════════════
const superMw = [requireAuth(['admin']), faqatSuper];

router.get('/super/kurslar', superMw, wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT k.id, k.nomi, k.tavsif, k.holat, k.otish_foiz, k.urinish_limit, k.savol_soni, k.vaqt_daqiqa, k.direktor_fio,
           to_char(k.yaratilgan AT TIME ZONE 'Asia/Tashkent','DD.MM.YYYY') AS yaratilgan,
           (SELECT COUNT(*) FROM kurs_adminlar a WHERE a.kurs_id=k.id)::int          AS adminlar_soni,
           (SELECT COUNT(*) FROM kurs_ishtirokchilar i WHERE i.kurs_id=k.id)::int    AS ishtirokchilar_soni,
           (SELECT COUNT(*) FROM kurs_savollar s WHERE s.kurs_id=k.id)::int          AS savollar_soni,
           (SELECT COUNT(*) FROM kurs_sertifikatlar c WHERE c.kurs_id=k.id AND c.holat='haqiqiy')::int AS sertifikatlar_soni
      FROM online_kurslar k ORDER BY k.id DESC`);
  res.json({ ok: true, kurslar: r.rows });
}));

router.post('/super/kurslar', superMw, wrap(async (req, res) => {
  const nomi = matn(req.body.nomi, 200);
  if (nomi.length < 3) return res.status(400).json({ ok: false, error: 'Kurs nomi kamida 3 belgi bo\'lsin' });
  const r = await pool.query('INSERT INTO online_kurslar (nomi, tavsif) VALUES ($1,$2) RETURNING id',
    [nomi, matn(req.body.tavsif, 1000)]);
  res.json({ ok: true, id: r.rows[0].id });
}));

router.put('/super/kurslar/:id', superMw, wrap(async (req, res) => {
  const id = butun(req.params.id);
  const nomi = matn(req.body.nomi, 200);
  const holat = req.body.holat === 'yopiq' ? 'yopiq' : 'faol';
  if (nomi.length < 3) return res.status(400).json({ ok: false, error: 'Kurs nomi kamida 3 belgi bo\'lsin' });
  const r = await pool.query('UPDATE online_kurslar SET nomi=$1, tavsif=$2, holat=$3 WHERE id=$4',
    [nomi, matn(req.body.tavsif, 1000), holat, id]);
  if (!r.rowCount) return res.status(404).json({ ok: false, error: 'Kurs topilmadi' });
  res.json({ ok: true });
}));

router.delete('/super/kurslar/:id', superMw, wrap(async (req, res) => {
  const id = butun(req.params.id);
  const c = await pool.query('SELECT COUNT(*)::int AS n FROM kurs_sertifikatlar WHERE kurs_id=$1', [id]);
  if (c.rows[0].n > 0) {
    return res.status(409).json({ ok: false, error: `Bu kursda ${c.rows[0].n} ta sertifikat berilgan — o'chirib bo'lmaydi. Uni "yopiq" holatga o'tkazing.` });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM telegram_users WHERE entity_table='kurs_adminlar' AND entity_id IN (SELECT id FROM kurs_adminlar WHERE kurs_id=$1)`, [id]);
    await client.query(`DELETE FROM telegram_users WHERE entity_table='kurs_ishtirokchilar' AND entity_id IN (SELECT id FROM kurs_ishtirokchilar WHERE kurs_id=$1)`, [id]);
    await client.query('DELETE FROM online_kurslar WHERE id=$1', [id]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  res.json({ ok: true });
}));

router.get('/super/kurslar/:id/adminlar', superMw, wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT a.id, a.familiya, a.ism, a.telefon, a.taklif_kodi,
           EXISTS (SELECT 1 FROM telegram_users t WHERE t.rol='kurs_admin' AND t.entity_id=a.id AND t.entity_table='kurs_adminlar') AS ulangan
      FROM kurs_adminlar a WHERE a.kurs_id=$1 ORDER BY a.id`, [butun(req.params.id)]);
  res.json({ ok: true, adminlar: r.rows });
}));

router.post('/super/kurslar/:id/adminlar', superMw, wrap(async (req, res) => {
  const kid = butun(req.params.id);
  const ism = normIsm(req.body.ism), familiya = normIsm(req.body.familiya);
  if (!ism) return res.status(400).json({ ok: false, error: 'Ism kerak' });
  const k = await pool.query('SELECT 1 FROM online_kurslar WHERE id=$1', [kid]);
  if (!k.rowCount) return res.status(404).json({ ok: false, error: 'Kurs topilmadi' });
  const kod = await noyobKod('kurs_adminlar', 8);
  const r = await pool.query(
    'INSERT INTO kurs_adminlar (kurs_id, familiya, ism, telefon, taklif_kodi) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [kid, familiya, ism, telefonToza(req.body.telefon), kod]);
  res.json({ ok: true, id: r.rows[0].id, taklif_kodi: kod });
}));

router.put('/super/adminlar/:id', superMw, wrap(async (req, res) => {
  const ism = normIsm(req.body.ism);
  if (!ism) return res.status(400).json({ ok: false, error: 'Ism kerak' });
  const r = await pool.query('UPDATE kurs_adminlar SET familiya=$1, ism=$2, telefon=$3 WHERE id=$4',
    [normIsm(req.body.familiya), ism, telefonToza(req.body.telefon), butun(req.params.id)]);
  if (!r.rowCount) return res.status(404).json({ ok: false, error: 'Admin topilmadi' });
  res.json({ ok: true });
}));

router.post('/super/adminlar/:id/kod-yangilash', superMw, wrap(async (req, res) => {
  const id = butun(req.params.id);
  const kod = await noyobKod('kurs_adminlar', 8);
  const r = await pool.query('UPDATE kurs_adminlar SET taklif_kodi=$1 WHERE id=$2', [kod, id]);
  if (!r.rowCount) return res.status(404).json({ ok: false, error: 'Admin topilmadi' });
  await telegramAjrat('kurs_admin', id);          // eski Telegram biriktirish bekor
  res.json({ ok: true, taklif_kodi: kod });
}));

router.delete('/super/adminlar/:id', superMw, wrap(async (req, res) => {
  const id = butun(req.params.id);
  await telegramAjrat('kurs_admin', id);
  await pool.query('DELETE FROM kurs_adminlar WHERE id=$1', [id]);
  res.json({ ok: true });
}));

// ═══════════════════════════════════════════════════════════════════════════
//  KURS ADMIN
// ═══════════════════════════════════════════════════════════════════════════
const adminMw = [requireAuth(['kurs_admin']), kursAdminMw];

router.get('/admin/kurs', adminMw, wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT k.id, k.nomi, k.tavsif, k.holat, k.otish_foiz, k.urinish_limit, k.savol_soni, k.vaqt_daqiqa, k.direktor_fio,
           (SELECT COUNT(*) FROM kurs_savollar s WHERE s.kurs_id=k.id)::int AS savollar_soni_jami,
           (SELECT COUNT(*) FROM kurs_ishtirokchilar i WHERE i.kurs_id=k.id)::int AS ishtirokchilar_soni,
           (SELECT COUNT(*) FROM kurs_sertifikatlar c WHERE c.kurs_id=k.id AND c.holat='haqiqiy')::int AS sertifikatlar_soni,
           (SELECT COUNT(*) FROM kurs_urinishlar u WHERE u.kurs_id=k.id AND u.holat='tugagan')::int AS urinishlar_soni
      FROM online_kurslar k WHERE k.id=$1`, [req.kursId]);
  if (!r.rowCount) return res.status(404).json({ ok: false, error: 'Kurs topilmadi' });
  res.json({ ok: true, kurs: r.rows[0] });
}));

router.put('/admin/sozlamalar', adminMw, wrap(async (req, res) => {
  const b = req.body;
  const otish = butun(b.otish_foiz), limit = butun(b.urinish_limit), vaqt = butun(b.vaqt_daqiqa);
  let soni = null;
  if (b.savol_soni !== null && b.savol_soni !== '' && b.savol_soni !== undefined) {
    soni = butun(b.savol_soni);
    if (!(soni >= 1 && soni <= 500)) return res.status(400).json({ ok: false, error: 'Savollar soni 1 dan 500 gacha bo\'lsin (yoki bo\'sh qoldiring = barcha savollar)' });
  }
  if (!(otish >= 1 && otish <= 100)) return res.status(400).json({ ok: false, error: 'O\'tish bali 1–100% oralig\'ida bo\'lsin' });
  if (!(limit >= 1 && limit <= 50))  return res.status(400).json({ ok: false, error: 'Urinishlar soni 1–50 oralig\'ida bo\'lsin' });
  if (!(vaqt >= 0 && vaqt <= 600))   return res.status(400).json({ ok: false, error: 'Vaqt 0–600 daqiqa oralig\'ida bo\'lsin (0 = cheklanmagan)' });
  const direktor = normIsm(b.direktor_fio, 100);
  await pool.query(
    `UPDATE online_kurslar SET otish_foiz=$1, urinish_limit=$2, savol_soni=$3, vaqt_daqiqa=$4, direktor_fio=$5 WHERE id=$6`,
    [otish, limit, soni, vaqt, direktor, req.kursId]);
  res.json({ ok: true });
}));

// ─── Savollar ───
function savolTekshir(b) {
  const m = matn(b.matn, 1000);
  if (m.length < 3) return { xato: 'Savol matni kamida 3 belgi bo\'lsin' };
  if (!Array.isArray(b.variantlar)) return { xato: 'Variantlar ro\'yxati kerak' };
  const v = b.variantlar.map(x => matn(x, 300));
  if (v.length < 2 || v.length > 6) return { xato: 'Variantlar soni 2 dan 6 gacha bo\'lsin' };
  if (v.some(x => !x)) return { xato: 'Bo\'sh variant bo\'lmasin' };
  if (new Set(v.map(x => x.toLowerCase())).size !== v.length) return { xato: 'Variantlar bir-biriga o\'xshash bo\'lmasin' };
  const t = butun(b.togri);
  if (!(t >= 0 && t < v.length)) return { xato: 'To\'g\'ri javobni belgilang' };
  return { m, v, t };
}

router.get('/admin/savollar', adminMw, wrap(async (req, res) => {
  const r = await pool.query('SELECT id, matn, variantlar, togri, tartib FROM kurs_savollar WHERE kurs_id=$1 ORDER BY tartib, id', [req.kursId]);
  res.json({ ok: true, savollar: r.rows });
}));

router.post('/admin/savollar', adminMw, wrap(async (req, res) => {
  const t = savolTekshir(req.body);
  if (t.xato) return res.status(400).json({ ok: false, error: t.xato });
  const r = await pool.query(
    `INSERT INTO kurs_savollar (kurs_id, matn, variantlar, togri, tartib)
     VALUES ($1,$2,$3::jsonb,$4,(SELECT COALESCE(MAX(tartib),0)+1 FROM kurs_savollar WHERE kurs_id=$1)) RETURNING id`,
    [req.kursId, t.m, JSON.stringify(t.v), t.t]);
  res.json({ ok: true, id: r.rows[0].id });
}));

router.put('/admin/savollar/:id', adminMw, wrap(async (req, res) => {
  const t = savolTekshir(req.body);
  if (t.xato) return res.status(400).json({ ok: false, error: t.xato });
  const r = await pool.query(
    'UPDATE kurs_savollar SET matn=$1, variantlar=$2::jsonb, togri=$3 WHERE id=$4 AND kurs_id=$5',
    [t.m, JSON.stringify(t.v), t.t, butun(req.params.id), req.kursId]);
  if (!r.rowCount) return res.status(404).json({ ok: false, error: 'Savol topilmadi' });
  res.json({ ok: true });
}));

router.delete('/admin/savollar/:id', adminMw, wrap(async (req, res) => {
  await pool.query('DELETE FROM kurs_savollar WHERE id=$1 AND kurs_id=$2', [butun(req.params.id), req.kursId]);
  res.json({ ok: true });
}));

// Matndan ommaviy kiritish:
//   Savollar bo'sh qator bilan ajratiladi. Birinchi qator — savol, keyingilari — variantlar.
//   To'g'ri javob oxiriga yoki boshiga * qo'yiladi. "A)", "B.", "1)", "-" kabi belgilar olib tashlanadi.
function savollarParse(matnStr) {
  const bloklar = String(matnStr || '').replace(/\r/g, '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  const savollar = [], xatolar = [];
  bloklar.forEach((blok, bi) => {
    const qatorlar = blok.split('\n').map(x => x.trim()).filter(Boolean);
    const savolMatn = qatorlar[0].replace(/^\d+\s*[.)]\s*/, '');
    const variantlar = []; let togri = -1, ko = 0;
    for (const q of qatorlar.slice(1)) {
      let t = q, belgi = false;
      if (/^\*/.test(t)) { belgi = true; t = t.replace(/^\*+\s*/, ''); }
      if (/\*\s*$/.test(t)) { belgi = true; t = t.replace(/\s*\*+\s*$/, ''); }
      t = t.replace(/^([A-Fa-f]|\d)\s*[.)]\s*/, '').replace(/^[-–•]\s*/, '').trim();
      if (belgi) { togri = variantlar.length; ko++; }
      variantlar.push(t);
    }
    const tek = savolTekshir({ matn: savolMatn, variantlar, togri });
    if (ko !== 1) xatolar.push(`${bi + 1}-savol: to'g'ri javob bitta bo'lishi kerak (* bilan belgilang)`);
    else if (tek.xato) xatolar.push(`${bi + 1}-savol: ${tek.xato}`);
    else savollar.push(tek);
  });
  return { savollar, xatolar };
}

router.post('/admin/savollar/ommaviy', adminMw, wrap(async (req, res) => {
  const { savollar, xatolar } = savollarParse(req.body.matn);
  if (xatolar.length) return res.status(400).json({ ok: false, error: xatolar.slice(0, 8).join('\n'), xatolar });
  if (!savollar.length) return res.status(400).json({ ok: false, error: 'Savollar topilmadi' });
  if (savollar.length > 300) return res.status(400).json({ ok: false, error: 'Bir martada 300 tadan ko\'p savol kiritib bo\'lmaydi' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const m = await client.query('SELECT COALESCE(MAX(tartib),0) AS m FROM kurs_savollar WHERE kurs_id=$1', [req.kursId]);
    let tartib = Number(m.rows[0].m);
    for (const s of savollar) {
      await client.query(
        'INSERT INTO kurs_savollar (kurs_id, matn, variantlar, togri, tartib) VALUES ($1,$2,$3::jsonb,$4,$5)',
        [req.kursId, s.m, JSON.stringify(s.v), s.t, ++tartib]);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  res.json({ ok: true, qoshildi: savollar.length });
}));

// ─── Ishtirokchilar ───
router.get('/admin/ishtirokchilar', adminMw, wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT i.id, i.familiya, i.ism, i.sharif, i.telefon, i.maktab_nomi, i.fan, i.taklif_kodi, i.qoshimcha_urinish,
           (i.profil_vaqti IS NOT NULL) AS profil_toldirilgan,
           EXISTS (SELECT 1 FROM telegram_users t WHERE t.rol='kurs_ishtirokchi' AND t.entity_id=i.id AND t.entity_table='kurs_ishtirokchilar') AS ulangan,
           (SELECT COUNT(*) FROM kurs_urinishlar u WHERE u.ishtirokchi_id=i.id AND u.holat='tugagan')::int AS urinishlar,
           (SELECT MAX(u.foiz) FROM kurs_urinishlar u WHERE u.ishtirokchi_id=i.id AND u.holat='tugagan') AS eng_yaxshi,
           EXISTS (SELECT 1 FROM kurs_urinishlar u WHERE u.ishtirokchi_id=i.id AND u.holat='jarayonda') AS jarayonda,
           c.id AS sertifikat_id, c.raqam AS sertifikat_raqam, c.holat AS sertifikat_holat
      FROM kurs_ishtirokchilar i
      LEFT JOIN kurs_sertifikatlar c ON c.ishtirokchi_id = i.id
     WHERE i.kurs_id=$1 ORDER BY i.familiya, i.ism, i.id`, [req.kursId]);
  res.json({ ok: true, ishtirokchilar: r.rows });
}));

function ishtirokchiMaydon(b) {
  return {
    familiya: normIsm(b.familiya), ism: normIsm(b.ism), sharif: normIsm(b.sharif),
    telefon: telefonToza(b.telefon), maktab_nomi: matn(b.maktab_nomi, 150), fan: matn(b.fan, 80),
  };
}

router.post('/admin/ishtirokchilar', adminMw, wrap(async (req, res) => {
  const f = ishtirokchiMaydon(req.body);
  if (!f.familiya && !f.ism) return res.status(400).json({ ok: false, error: 'Familiya yoki ism kiriting' });
  const kod = await noyobKod('kurs_ishtirokchilar', 8);
  const r = await pool.query(
    `INSERT INTO kurs_ishtirokchilar (kurs_id, familiya, ism, sharif, telefon, maktab_nomi, fan, taklif_kodi)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [req.kursId, f.familiya, f.ism, f.sharif, f.telefon, f.maktab_nomi, f.fan, kod]);
  res.json({ ok: true, id: r.rows[0].id, taklif_kodi: kod });
}));

// Ko'p ishtirokchini bir martada: har qatorda  "Familiya Ism Sharif ; telefon ; maktab ; fan"
router.post('/admin/ishtirokchilar/ommaviy', adminMw, wrap(async (req, res) => {
  const qatorlar = String(req.body.matn || '').replace(/\r/g, '').split('\n').map(x => x.trim()).filter(Boolean);
  if (!qatorlar.length) return res.status(400).json({ ok: false, error: 'Ro\'yxat bo\'sh' });
  if (qatorlar.length > 500) return res.status(400).json({ ok: false, error: 'Bir martada 500 tadan ko\'p ishtirokchi kiritib bo\'lmaydi' });
  const royxat = [], xatolar = [];
  qatorlar.forEach((q, i) => {
    const qismlar = q.split(/[;\t|]/).map(x => x.trim());
    const so = qismlar[0].split(/\s+/).filter(Boolean);
    if (so.length < 2) { xatolar.push(`${i + 1}-qator: familiya va ismni kiriting`); return; }
    royxat.push({
      familiya: normIsm(so[0]), ism: normIsm(so[1]), sharif: normIsm(so.slice(2).join(' ')),
      telefon: telefonToza(qismlar[1]), maktab_nomi: matn(qismlar[2], 150), fan: matn(qismlar[3], 80),
    });
  });
  if (xatolar.length) return res.status(400).json({ ok: false, error: xatolar.slice(0, 8).join('\n'), xatolar });
  const client = await pool.connect();
  const yaratilgan = [];
  try {
    await client.query('BEGIN');
    for (const f of royxat) {
      const kod = await noyobKod('kurs_ishtirokchilar', 8);
      const r = await client.query(
        `INSERT INTO kurs_ishtirokchilar (kurs_id, familiya, ism, sharif, telefon, maktab_nomi, fan, taklif_kodi)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [req.kursId, f.familiya, f.ism, f.sharif, f.telefon, f.maktab_nomi, f.fan, kod]);
      yaratilgan.push(r.rows[0].id);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  res.json({ ok: true, qoshildi: yaratilgan.length });
}));

router.put('/admin/ishtirokchilar/:id', adminMw, wrap(async (req, res) => {
  const f = ishtirokchiMaydon(req.body);
  if (!f.familiya && !f.ism) return res.status(400).json({ ok: false, error: 'Familiya yoki ism kiriting' });
  const r = await pool.query(
    `UPDATE kurs_ishtirokchilar SET familiya=$1, ism=$2, sharif=$3, telefon=$4, maktab_nomi=$5, fan=$6
      WHERE id=$7 AND kurs_id=$8`,
    [f.familiya, f.ism, f.sharif, f.telefon, f.maktab_nomi, f.fan, butun(req.params.id), req.kursId]);
  if (!r.rowCount) return res.status(404).json({ ok: false, error: 'Ishtirokchi topilmadi' });
  res.json({ ok: true });
}));

router.delete('/admin/ishtirokchilar/:id', adminMw, wrap(async (req, res) => {
  const id = butun(req.params.id);
  const c = await pool.query('SELECT 1 FROM kurs_sertifikatlar WHERE ishtirokchi_id=$1', [id]);
  if (c.rowCount) return res.status(409).json({ ok: false, error: 'Sertifikat berilgan ishtirokchini o\'chirib bo\'lmaydi. Avval sertifikatni bekor qiling.' });
  await telegramAjrat('kurs_ishtirokchi', id);
  await pool.query('DELETE FROM kurs_ishtirokchilar WHERE id=$1 AND kurs_id=$2', [id, req.kursId]);
  res.json({ ok: true });
}));

router.post('/admin/ishtirokchilar/:id/kod-yangilash', adminMw, wrap(async (req, res) => {
  const id = butun(req.params.id);
  const kod = await noyobKod('kurs_ishtirokchilar', 8);
  const r = await pool.query('UPDATE kurs_ishtirokchilar SET taklif_kodi=$1 WHERE id=$2 AND kurs_id=$3', [kod, id, req.kursId]);
  if (!r.rowCount) return res.status(404).json({ ok: false, error: 'Ishtirokchi topilmadi' });
  await telegramAjrat('kurs_ishtirokchi', id);
  res.json({ ok: true, taklif_kodi: kod });
}));

router.post('/admin/ishtirokchilar/:id/urinish-qoshish', adminMw, wrap(async (req, res) => {
  const r = await pool.query(
    'UPDATE kurs_ishtirokchilar SET qoshimcha_urinish = qoshimcha_urinish + 1 WHERE id=$1 AND kurs_id=$2 RETURNING qoshimcha_urinish',
    [butun(req.params.id), req.kursId]);
  if (!r.rowCount) return res.status(404).json({ ok: false, error: 'Ishtirokchi topilmadi' });
  res.json({ ok: true, qoshimcha_urinish: r.rows[0].qoshimcha_urinish });
}));

// ─── Natijalar va sertifikatlar ───
router.get('/admin/natijalar', adminMw, wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT u.id, i.familiya, i.ism, i.sharif, i.maktab_nomi, u.togri_soni, u.jami, u.foiz, u.otdi,
           to_char(u.tugagan AT TIME ZONE 'Asia/Tashkent','DD.MM.YYYY HH24:MI') AS tugagan
      FROM kurs_urinishlar u JOIN kurs_ishtirokchilar i ON i.id = u.ishtirokchi_id
     WHERE u.kurs_id=$1 AND u.holat='tugagan' ORDER BY u.tugagan DESC LIMIT 1000`, [req.kursId]);
  res.json({ ok: true, natijalar: r.rows });
}));

router.get('/admin/sertifikatlar', adminMw, wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT c.id, c.raqam, c.tekshiruv_kodi, c.familiya, c.ism, c.sharif, c.foiz, c.holat, c.bekor_sababi,
           to_char(c.berilgan_sana,'DD.MM.YYYY') AS berilgan_sana, i.maktab_nomi
      FROM kurs_sertifikatlar c JOIN kurs_ishtirokchilar i ON i.id = c.ishtirokchi_id
     WHERE c.kurs_id=$1 ORDER BY c.id DESC`, [req.kursId]);
  res.json({ ok: true, sertifikatlar: r.rows });
}));

router.put('/admin/sertifikatlar/:id', adminMw, wrap(async (req, res) => {
  const familiya = normIsm(req.body.familiya), ism = normIsm(req.body.ism), sharif = normIsm(req.body.sharif);
  if (!familiya || !ism) return res.status(400).json({ ok: false, error: 'Familiya va ism kerak' });
  const r = await pool.query('UPDATE kurs_sertifikatlar SET familiya=$1, ism=$2, sharif=$3 WHERE id=$4 AND kurs_id=$5',
    [familiya, ism, sharif, butun(req.params.id), req.kursId]);
  if (!r.rowCount) return res.status(404).json({ ok: false, error: 'Sertifikat topilmadi' });
  res.json({ ok: true });
}));

router.post('/admin/sertifikatlar/:id/bekor', adminMw, wrap(async (req, res) => {
  const sabab = matn(req.body.sabab, 300);
  if (sabab.length < 3) return res.status(400).json({ ok: false, error: 'Bekor qilish sababini yozing' });
  const r = await pool.query(
    `UPDATE kurs_sertifikatlar SET holat='bekor', bekor_sababi=$1, bekor_vaqti=NOW() WHERE id=$2 AND kurs_id=$3`,
    [sabab, butun(req.params.id), req.kursId]);
  if (!r.rowCount) return res.status(404).json({ ok: false, error: 'Sertifikat topilmadi' });
  res.json({ ok: true });
}));

router.post('/admin/sertifikatlar/:id/tiklash', adminMw, wrap(async (req, res) => {
  const r = await pool.query(
    `UPDATE kurs_sertifikatlar SET holat='haqiqiy', bekor_sababi=NULL, bekor_vaqti=NULL WHERE id=$1 AND kurs_id=$2`,
    [butun(req.params.id), req.kursId]);
  if (!r.rowCount) return res.status(404).json({ ok: false, error: 'Sertifikat topilmadi' });
  res.json({ ok: true });
}));

async function pdfYubor(res, sertifikatId, shartSql, shartParam) {
  const r = await pool.query(
    `SELECT c.*, to_char(c.berilgan_sana,'DD.MM.YYYY') AS sana_matn FROM kurs_sertifikatlar c WHERE c.id=$1 ${shartSql}`,
    [sertifikatId, ...shartParam]);
  if (!r.rowCount) return res.status(404).json({ ok: false, error: 'Sertifikat topilmadi' });
  const s = r.rows[0];
  if (s.holat !== 'haqiqiy') return res.status(403).json({ ok: false, error: 'Bu sertifikat bekor qilingan' });
  const buf = await sertifikatPdf(s);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="sertifikat-${s.raqam}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buf);
}

router.get('/admin/sertifikatlar/:id/pdf', adminMw, wrap(async (req, res) => {
  await pdfYubor(res, butun(req.params.id), 'AND c.kurs_id=$2', [req.kursId]);
}));

// ═══════════════════════════════════════════════════════════════════════════
//  ISHTIROKCHI
// ═══════════════════════════════════════════════════════════════════════════
const ishMw = [requireAuth(['kurs_ishtirokchi']), ishtirokchiMw];
const GRACE_MS = 60 * 1000;             // tarmoq kechikishi uchun qo'shimcha vaqt

function fisher(arr) {                    // Fisher–Yates (crypto asosida)
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function mijozgaSavollar(tartib) {        // to'g'ri javob (k) YUBORILMAYDI
  return tartib.map(t => ({ id: t.q, matn: t.m, variantlar: t.v }));
}

// Vaqti o'tgan faol urinishlarni saqlangan javoblar bilan yakunlaydi
async function muddatiOtganlarniYakunla(ishId) {
  const r = await pool.query(
    `SELECT id FROM kurs_urinishlar WHERE ishtirokchi_id=$1 AND holat='jarayonda' AND muddat IS NOT NULL AND muddat + interval '60 seconds' < NOW()`,
    [ishId]);
  for (const row of r.rows) await yakunla(row.id, null);
}

// Urinishni yakunlash: ball hisoblanadi, o'tgan bo'lsa sertifikat beriladi.
// yuborilgan = mijoz yuborgan javoblar (null bo'lsa saqlanganlari ishlatiladi)
async function yakunla(urinishId, yuborilgan) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ur = await client.query(
      `SELECT u.*, k.otish_foiz, k.nomi AS kurs_nomi, k.direktor_fio
         FROM kurs_urinishlar u JOIN online_kurslar k ON k.id = u.kurs_id WHERE u.id=$1 FOR UPDATE OF u`, [urinishId]);
    if (!ur.rowCount) { await client.query('ROLLBACK'); return null; }
    const u = ur.rows[0];
    if (u.holat === 'tugagan') { await client.query('COMMIT'); return { u, yangi: false }; }

    let javoblar = u.javoblar || {};
    const kech = u.muddat && Date.now() > new Date(u.muddat).getTime() + GRACE_MS;
    if (yuborilgan && !kech && typeof yuborilgan === 'object') javoblar = yuborilgan;

    const tartib = u.tartib;
    let togri = 0;
    for (const t of tartib) {
      const tanlangan = javoblar[String(t.q)];
      if (tanlangan !== undefined && tanlangan !== null && Number(tanlangan) === t.k) togri++;
    }
    const jami = tartib.length;
    const foiz = jami ? Math.round((togri / jami) * 10000) / 100 : 0;
    const otdi = foiz >= Number(u.otish_foiz);

    await client.query(
      `UPDATE kurs_urinishlar SET holat='tugagan', tugagan=NOW(), javoblar=$1::jsonb, togri_soni=$2, jami=$3, foiz=$4, otdi=$5 WHERE id=$6`,
      [JSON.stringify(javoblar), togri, jami, foiz, otdi, urinishId]);

    if (otdi) {
      const mavjud = await client.query('SELECT 1 FROM kurs_sertifikatlar WHERE ishtirokchi_id=$1', [u.ishtirokchi_id]);
      if (!mavjud.rowCount) {
        const ish = (await client.query('SELECT familiya, ism, sharif FROM kurs_ishtirokchilar WHERE id=$1', [u.ishtirokchi_id])).rows[0];
        const yil = parseInt((await client.query(`SELECT to_char(NOW() AT TIME ZONE 'Asia/Tashkent','YYYY') AS y`)).rows[0].y, 10);
        // Atomik hisoblagich: bir vaqtda ikki sertifikat bir xil raqam olmaydi
        const h = await client.query(
          `INSERT INTO kurs_sertifikat_hisoblagich (yil, oxirgi) VALUES ($1, 1)
           ON CONFLICT (yil) DO UPDATE SET oxirgi = kurs_sertifikat_hisoblagich.oxirgi + 1 RETURNING oxirgi`, [yil]);
        const raqam = `IIS-${yil}-${String(h.rows[0].oxirgi).padStart(6, '0')}`;
        let kod = null;
        for (let i = 0; i < 8 && !kod; i++) {
          const k = tasodifiyKod(10);
          const bor = await client.query('SELECT 1 FROM kurs_sertifikatlar WHERE tekshiruv_kodi=$1', [k]);
          if (!bor.rowCount) kod = k;
        }
        if (!kod) throw new Error('Tekshiruv kodi yaratib bo\'lmadi');
        await client.query(
          `INSERT INTO kurs_sertifikatlar
             (kurs_id, ishtirokchi_id, urinish_id, raqam, tekshiruv_kodi, familiya, ism, sharif, kurs_nomi, direktor_fio, foiz, berilgan_sana)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,(NOW() AT TIME ZONE 'Asia/Tashkent')::date)`,
          [u.kurs_id, u.ishtirokchi_id, urinishId, raqam, kod, ish.familiya, ish.ism, ish.sharif, u.kurs_nomi, u.direktor_fio, foiz]);
      }
    }
    await client.query('COMMIT');
    return { u: { ...u, togri_soni: togri, jami, foiz, otdi, holat: 'tugagan' }, yangi: true };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally { client.release(); }
}

async function natijaJavob(ishId, u) {
  const s = await pool.query(
    `SELECT raqam, tekshiruv_kodi, holat, to_char(berilgan_sana,'DD.MM.YYYY') AS berilgan_sana FROM kurs_sertifikatlar WHERE ishtirokchi_id=$1`, [ishId]);
  return {
    ok: true,
    natija: { togri: u.togri_soni, jami: u.jami, foiz: Number(u.foiz), otdi: u.otdi },
    sertifikat: s.rows[0] || null,
  };
}

router.get('/ish/men', ishMw, wrap(async (req, res) => {
  const ish = req.ish;
  await muddatiOtganlarniYakunla(ish.id);
  const [ur, ser, soni] = await Promise.all([
    pool.query(`SELECT id, holat, muddat, togri_soni, jami, foiz, otdi,
                       to_char(boshlangan AT TIME ZONE 'Asia/Tashkent','DD.MM.YYYY HH24:MI') AS boshlangan
                  FROM kurs_urinishlar WHERE ishtirokchi_id=$1 ORDER BY id DESC`, [ish.id]),
    pool.query(`SELECT raqam, tekshiruv_kodi, holat, to_char(berilgan_sana,'DD.MM.YYYY') AS berilgan_sana
                  FROM kurs_sertifikatlar WHERE ishtirokchi_id=$1`, [ish.id]),
    pool.query('SELECT COUNT(*)::int AS n FROM kurs_savollar WHERE kurs_id=$1', [ish.kurs_id]),
  ]);
  const tugagan = ur.rows.filter(x => x.holat === 'tugagan').length;
  const limit = ish.urinish_limit + ish.qoshimcha_urinish;
  const faol = ur.rows.find(x => x.holat === 'jarayonda') || null;
  res.json({
    ok: true,
    ishtirokchi: { familiya: ish.familiya, ism: ish.ism, sharif: ish.sharif, telefon: ish.telefon,
                   maktab_nomi: ish.maktab_nomi, fan: ish.fan, profil_toldirilgan: !!ish.profil_vaqti },
    kurs: { nomi: ish.kurs_nomi, tavsif: ish.kurs_tavsif, holat: ish.kurs_holat, otish_foiz: ish.otish_foiz,
            urinish_limit: limit, vaqt_daqiqa: ish.vaqt_daqiqa,
            savollar_soni: ish.savol_soni ? Math.min(ish.savol_soni, soni.rows[0].n) : soni.rows[0].n },
    urinishlar: ur.rows.filter(x => x.holat === 'tugagan'),
    qolgan_urinish: Math.max(0, limit - tugagan - (faol ? 1 : 0)),
    faol_urinish_id: faol ? faol.id : null,
    sertifikat: ser.rows[0] || null,
  });
}));

router.put('/ish/profil', ishMw, wrap(async (req, res) => {
  const b = req.body;
  const f = {
    familiya: normIsm(b.familiya), ism: normIsm(b.ism), sharif: normIsm(b.sharif),
    maktab_nomi: matn(b.maktab_nomi, 150), fan: matn(b.fan, 80), telefon: telefonToza(b.telefon),
  };
  const ISM_RE = /^[\p{L}ʻʼ'\-. ]{2,60}$/u;
  if (!ISM_RE.test(f.familiya)) return res.status(400).json({ ok: false, error: 'Familiyani to\'g\'ri kiriting' });
  if (!ISM_RE.test(f.ism))      return res.status(400).json({ ok: false, error: 'Ismni to\'g\'ri kiriting' });
  if (!ISM_RE.test(f.sharif))   return res.status(400).json({ ok: false, error: 'Sharifni to\'g\'ri kiriting (masalan: Abdulla oʻgʻli)' });
  if (f.maktab_nomi.length < 2) return res.status(400).json({ ok: false, error: 'Ish joyingiz (maktab)ni kiriting' });
  if (f.telefon && f.telefon.replace(/\D/g, '').length < 9) return res.status(400).json({ ok: false, error: 'Telefon raqamini to\'g\'ri kiriting' });
  const s = await pool.query('SELECT 1 FROM kurs_sertifikatlar WHERE ishtirokchi_id=$1', [req.ish.id]);
  if (s.rowCount) return res.status(409).json({ ok: false, error: 'Sertifikat berilgandan keyin ma\'lumotni o\'zgartirib bo\'lmaydi. Xato bo\'lsa kurs adminiga murojaat qiling.' });
  await pool.query(
    `UPDATE kurs_ishtirokchilar SET familiya=$1, ism=$2, sharif=$3, maktab_nomi=$4, fan=$5, telefon=$6, profil_vaqti=NOW() WHERE id=$7`,
    [f.familiya, f.ism, f.sharif, f.maktab_nomi, f.fan, f.telefon, req.ish.id]);
  res.json({ ok: true });
}));

router.post('/ish/test/boshlash', ishMw, wrap(async (req, res) => {
  const ish = req.ish;
  await muddatiOtganlarniYakunla(ish.id);

  // Faol urinish bo'lsa — o'sha davom ettiriladi
  const faol = await pool.query(`SELECT * FROM kurs_urinishlar WHERE ishtirokchi_id=$1 AND holat='jarayonda' ORDER BY id DESC LIMIT 1`, [ish.id]);
  if (faol.rowCount) {
    const u = faol.rows[0];
    return res.json({ ok: true, urinish_id: u.id, muddat: u.muddat, javoblar: u.javoblar || {}, savollar: mijozgaSavollar(u.tartib), davom: true });
  }

  if (ish.kurs_holat !== 'faol') return res.status(403).json({ ok: false, error: 'Kurs hozircha yopiq' });
  if (!ish.profil_vaqti) return res.status(400).json({ ok: false, error: 'Avval ma\'lumotlaringizni tasdiqlang', profilKerak: true });
  const s = await pool.query('SELECT 1 FROM kurs_sertifikatlar WHERE ishtirokchi_id=$1', [ish.id]);
  if (s.rowCount) return res.status(409).json({ ok: false, error: 'Siz allaqachon sertifikat olgansiz' });

  const tugagan = (await pool.query(`SELECT COUNT(*)::int AS n FROM kurs_urinishlar WHERE ishtirokchi_id=$1 AND holat='tugagan'`, [ish.id])).rows[0].n;
  if (tugagan >= ish.urinish_limit + ish.qoshimcha_urinish) {
    return res.status(403).json({ ok: false, error: 'Urinishlar tugagan. Qo\'shimcha urinish uchun kurs adminiga murojaat qiling.' });
  }

  const sv = await pool.query('SELECT id, matn, variantlar, togri FROM kurs_savollar WHERE kurs_id=$1', [ish.kurs_id]);
  if (!sv.rowCount) return res.status(400).json({ ok: false, error: 'Test hali tayyor emas (savollar kiritilmagan)' });

  let tanlangan = fisher(sv.rows);
  if (ish.savol_soni && ish.savol_soni < tanlangan.length) tanlangan = tanlangan.slice(0, ish.savol_soni);
  const tartib = tanlangan.map(q => {
    const idx = fisher(q.variantlar.map((_, i) => i));
    return { q: q.id, m: q.matn, v: idx.map(i => ({ i, t: q.variantlar[i] })), k: q.togri };
  });
  const muddat = ish.vaqt_daqiqa > 0 ? new Date(Date.now() + ish.vaqt_daqiqa * 60 * 1000) : null;

  // Bir vaqtda ikki "boshlash" kelsa bitta faol urinish bo'lishi uchun qulf
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM kurs_ishtirokchilar WHERE id=$1 FOR UPDATE', [ish.id]);
    const yana = await client.query(`SELECT id FROM kurs_urinishlar WHERE ishtirokchi_id=$1 AND holat='jarayonda'`, [ish.id]);
    if (yana.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ ok: false, error: 'Test allaqachon boshlangan, sahifani yangilang' }); }
    const r = await client.query(
      `INSERT INTO kurs_urinishlar (kurs_id, ishtirokchi_id, muddat, tartib) VALUES ($1,$2,$3,$4::jsonb) RETURNING id`,
      [ish.kurs_id, ish.id, muddat, JSON.stringify(tartib)]);
    await client.query('COMMIT');
    res.json({ ok: true, urinish_id: r.rows[0].id, muddat, javoblar: {}, savollar: mijozgaSavollar(tartib) });
  } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} throw e; } finally { client.release(); }
}));

async function oziniki(req, id) {
  const r = await pool.query('SELECT id, holat, muddat FROM kurs_urinishlar WHERE id=$1 AND ishtirokchi_id=$2', [id, req.ish.id]);
  return r.rows[0] || null;
}

router.post('/ish/test/:id/saqlash', ishMw, wrap(async (req, res) => {
  const u = await oziniki(req, butun(req.params.id));
  if (!u) return res.status(404).json({ ok: false, error: 'Urinish topilmadi' });
  if (u.holat !== 'jarayonda') return res.json({ ok: true, tugagan: true });
  if (u.muddat && Date.now() > new Date(u.muddat).getTime() + GRACE_MS) return res.json({ ok: true, muddatTugagan: true });
  const j = req.body && req.body.javoblar;
  if (!j || typeof j !== 'object' || Array.isArray(j)) return res.status(400).json({ ok: false, error: 'javoblar kerak' });
  await pool.query(`UPDATE kurs_urinishlar SET javoblar=$1::jsonb WHERE id=$2 AND holat='jarayonda'`, [JSON.stringify(j), u.id]);
  res.json({ ok: true });
}));

router.post('/ish/test/:id/yuborish', ishMw, wrap(async (req, res) => {
  const u = await oziniki(req, butun(req.params.id));
  if (!u) return res.status(404).json({ ok: false, error: 'Urinish topilmadi' });
  const j = req.body && req.body.javoblar;
  const natija = await yakunla(u.id, (j && typeof j === 'object' && !Array.isArray(j)) ? j : null);
  if (!natija) return res.status(404).json({ ok: false, error: 'Urinish topilmadi' });
  res.json(await natijaJavob(req.ish.id, natija.u));
}));

// Tugagan urinish natijasi (sahifa yangilanganda)
router.get('/ish/test/:id/natija', ishMw, wrap(async (req, res) => {
  const u = await oziniki(req, butun(req.params.id));
  if (!u) return res.status(404).json({ ok: false, error: 'Urinish topilmadi' });
  const r = await pool.query('SELECT * FROM kurs_urinishlar WHERE id=$1', [u.id]);
  if (r.rows[0].holat !== 'tugagan') return res.status(409).json({ ok: false, error: 'Test hali tugamagan' });
  res.json(await natijaJavob(req.ish.id, r.rows[0]));
}));

router.get('/ish/sertifikat/pdf', ishMw, wrap(async (req, res) => {
  const c = await pool.query('SELECT id FROM kurs_sertifikatlar WHERE ishtirokchi_id=$1', [req.ish.id]);
  if (!c.rowCount) return res.status(404).json({ ok: false, error: 'Sertifikat hali berilmagan' });
  await pdfYubor(res, c.rows[0].id, 'AND c.ishtirokchi_id=$2', [req.ish.id]);
}));

module.exports = router;
module.exports._test = { savollarParse, normIsm };
