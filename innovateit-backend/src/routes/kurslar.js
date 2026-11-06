// ═══════════════════════════════════════════════════════════════════════════
//  ONLINE KURSLAR — tashqi maktab o'qituvchilari uchun kurs, test, sertifikat
//
//  Rollar (JWT payload.role):
//    superadmin     → /api/kurs/super/...      kurs va kurs adminlarini yaratadi
//    kurs_admin     → /api/kurs/admin/...      o'z kursining sozlamalari, savollari, ishtirokchilari
//    kurs_ishtirokchi → /api/kurs/ish/...      o'z profili, test, sertifikat
//  Ochiq:
//    POST /api/kurs/imtihon/kirish             kurs login/paroli bilan kirish (imtihonlar.html)
//    GET  /api/kurs/imtihon/holat              imtihon vaqti holati (kirish tokeni bilan)
//    POST /api/kurs/imtihon/royxat             ishtirokchi ma'lumotini kiritadi → ishtirokchi tokeni
//    GET  /api/sertifikat/tekshir/:kod         sertifikat haqiqiyligini tekshirish (routes/sertifikat_public.js)
//
//  Kirish: kurs admini — Telegram Mini App (superadmin Telegram ID biriktiradi, routes/telegram.js /kirish).
//          ishtirokchi — Telegram'siz: kursning umumiy login/paroli bilan innovateitschool.uz/imtihonlar.html;
//          imtihon faqat admin belgilagan vaqt oralig'ida; bir xil familiya+ism ikkinchi marta topshira olmaydi.
// ═══════════════════════════════════════════════════════════════════════════
const { Router } = require('express');
const crypto = require('crypto');
const pool = require('../db');
const bcrypt = require('bcryptjs');
const { requireAuth, generateToken } = require('../middleware/jwt');
const { sertifikatPdf } = require('../sertifikatPdf');

const router = Router();

// ─── Yordamchilar ────────────────────────────────────────────────────────────
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(err => {
  if (err && err.xabar) return res.status(409).json({ ok: false, error: err.xabar });
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

const ROLLAR = {
  kurs_admin:       { jadval: 'kurs_adminlar' },
  kurs_ishtirokchi: { jadval: 'kurs_ishtirokchilar' },
};
async function telegramAjrat(rol, entityId, client = pool) {
  await client.query('DELETE FROM telegram_users WHERE rol=$1 AND entity_id=$2 AND entity_table=$3',
    [rol, entityId, ROLLAR[rol].jadval]);
}

// ─── Imtihon: login/parol, vaqt oynasi, ism kaliti ───────────────────────────
const IMTIHON_URL = (process.env.CERT_VERIFY_BASE || 'https://innovateitschool.uz').replace(/\/+$/, '') + '/imtihonlar.html';
const LOGIN_RE = /^[a-z0-9._-]{4,30}$/;
const LOCAL_DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;       // <input type="datetime-local"> (Toshkent vaqti)
const DUMMY_HASH = bcrypt.hashSync('imtihon-dummy-parol', 10);  // login topilmasa ham bir xil vaqt sarflanadi

// Oddiy xotiradagi tezlik cheklovi (bitta PM2 instance). Faqat MUVAFFAQIYATSIZ urinishlar sanaladi —
// bitta maktab (bitta IP) dan ko'p odam to'g'ri parol bilan kirishi mumkin.
function xatoChegarasi(max, oynaMs) {
  const m = new Map();
  setInterval(() => { const n = Date.now(); for (const [k, v] of m) if (v.t < n) m.delete(k); }, 60 * 1000).unref();
  return {
    bloklangan(key) { const v = m.get(key); return !!v && v.t > Date.now() && v.c >= max; },
    xato(key) {
      const n = Date.now(); let v = m.get(key);
      if (!v || v.t < n) { v = { c: 0, t: n + oynaMs }; m.set(key, v); }
      v.c++;
    },
  };
}
const kirishXatolari = xatoChegarasi(20, 15 * 60 * 1000);
function clientIp(req) {
  return String(req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.ip || '').trim();
}

const HOLAT_XABAR = {
  yopiq: 'Kurs hozircha yopiq',
  sozlanmagan: 'Imtihon vaqti hali belgilanmagan',
  kutilmoqda: 'Imtihon hali boshlanmagan',
  yopilgan: 'Imtihon vaqti tugagan',
};
// holat: ochiq | kutilmoqda | yopilgan | sozlanmagan | yopiq  (server soati bo'yicha)
function imtihonHolat(k, now = Date.now()) {
  if (k.holat !== 'faol') return 'yopiq';
  if (!k.imtihon_boshlanish || !k.imtihon_tugash) return 'sozlanmagan';
  if (now < new Date(k.imtihon_boshlanish).getTime()) return 'kutilmoqda';
  if (now >= new Date(k.imtihon_tugash).getTime()) return 'yopilgan';
  return 'ochiq';
}
const ms = d => (d ? new Date(d).getTime() : null);

// Ism kaliti: kirill → lotin, apostrof/bo'shliq/belgilar olib tashlanadi, "ye"→"e", familiya/ism tartibi
// farqi hisobga olinmaydi. "Oʻrinov Ali" = "Orinov Ali" = "Али Ўринов" = "ali o'rinov".
const KIRILL = { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'yo', ж:'j', з:'z', и:'i', й:'y', к:'k', л:'l', м:'m', н:'n',
  о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'x', ц:'ts', ч:'ch', ш:'sh', щ:'sh', ъ:'', ы:'i', ь:'', э:'e',
  ю:'yu', я:'ya', ў:'o', қ:'q', ғ:'g', ҳ:'h' };
function kalitBolak(s) {
  let t = String(s == null ? '' : s).toLowerCase();
  t = t.replace(/[а-яёўқғҳ]/g, ch => (KIRILL[ch] !== undefined ? KIRILL[ch] : ch));
  t = t.replace(/[^a-z0-9]/g, '').replace(/ye/g, 'e');
  return t;
}
function ismKalit(familiya, ism) {
  return [kalitBolak(familiya), kalitBolak(ism)].sort().join('|');
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
              k.urinish_limit, k.savol_soni, k.vaqt_daqiqa, k.direktor_fio, k.imtihon_boshlanish, k.imtihon_tugash
         FROM kurs_ishtirokchilar i JOIN online_kurslar k ON k.id = i.kurs_id
        WHERE i.id=$1`, [req.user.entityId]);
    if (r.rowCount === 0) return res.status(403).json({ ok: false, error: 'Ishtirokchi topilmadi (kursdan chiqarilgan bo\'lishi mumkin)' });
    req.ish = r.rows[0];
    next();
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server xatoligi' }); }
}

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
           (SELECT COUNT(*) FROM kurs_sertifikatlar c WHERE c.kurs_id=k.id AND c.holat='haqiqiy')::int AS sertifikatlar_soni,
           k.imtihon_login, (k.imtihon_parol_hash IS NOT NULL) AS imtihon_parol_bor,
           k.imtihon_boshlanish, k.imtihon_tugash,
           to_char(k.imtihon_boshlanish AT TIME ZONE 'Asia/Tashkent','DD.MM.YYYY HH24:MI') AS imtihon_boshlanish_matn,
           to_char(k.imtihon_tugash AT TIME ZONE 'Asia/Tashkent','DD.MM.YYYY HH24:MI')     AS imtihon_tugash_matn
      FROM online_kurslar k ORDER BY k.id DESC`);
  res.json({ ok: true, kurslar: r.rows.map(k => ({ ...k, imtihon_holat: imtihonHolat(k) })) });
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
    SELECT a.id, a.familiya, a.ism, a.telefon, a.telegram_id,
           (a.telegram_id IS NOT NULL) AS ulangan
      FROM kurs_adminlar a WHERE a.kurs_id=$1 ORDER BY a.id`, [butun(req.params.id)]);
  res.json({ ok: true, adminlar: r.rows });
}));

router.post('/super/kurslar/:id/adminlar', superMw, wrap(async (req, res) => {
  const kid = butun(req.params.id);
  const ism = normIsm(req.body.ism), familiya = normIsm(req.body.familiya);
  if (!ism) return res.status(400).json({ ok: false, error: 'Ism kerak' });
  const k = await pool.query('SELECT 1 FROM online_kurslar WHERE id=$1', [kid]);
  if (!k.rowCount) return res.status(404).json({ ok: false, error: 'Kurs topilmadi' });
  const r = await pool.query(
    'INSERT INTO kurs_adminlar (kurs_id, familiya, ism, telefon) VALUES ($1,$2,$3,$4) RETURNING id',
    [kid, familiya, ism, telefonToza(req.body.telefon)]);
  res.json({ ok: true, id: r.rows[0].id });
}));

// Tahrirlash + Telegram ID biriktirish/almashtirish/ajratish (bitta so'rovda, tranzaksiyada).
//   telegram_id: raqam → biriktiradi (eskisi almashadi); '' yoki null → ajratadi; berilmasa → tegilmaydi.
router.put('/super/adminlar/:id', superMw, wrap(async (req, res) => {
  const id = butun(req.params.id);
  const ism = normIsm(req.body.ism);
  if (!id) return res.status(400).json({ ok: false, error: 'Admin ID kerak' });
  if (!ism) return res.status(400).json({ ok: false, error: 'Ism kerak' });

  let tgId;                                   // undefined = o'zgartirilmaydi
  if (req.body.telegram_id !== undefined) {
    const raw = String(req.body.telegram_id == null ? '' : req.body.telegram_id).trim();
    if (raw === '') tgId = null;
    else if (/^\d{4,15}$/.test(raw)) tgId = Number(raw);
    else return res.status(400).json({ ok: false, error: "Telegram ID faqat raqamlardan iborat bo'lishi kerak" });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT telegram_id FROM kurs_adminlar WHERE id=$1 FOR UPDATE', [id]);
    if (!cur.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ ok: false, error: 'Admin topilmadi' }); }

    await client.query('UPDATE kurs_adminlar SET familiya=$1, ism=$2, telefon=$3 WHERE id=$4',
      [normIsm(req.body.familiya), ism, telefonToza(req.body.telefon), id]);

    if (tgId !== undefined && String(tgId) !== String(cur.rows[0].telegram_id)) {
      await telegramAjrat('kurs_admin', id, client);             // eski birikma uziladi
      if (tgId !== null) {
        const ismTg = `${normIsm(req.body.familiya)} ${ism}`.trim();
        await client.query(
          `INSERT INTO telegram_users (telegram_id, telegram_ism, rol, entity_id, entity_table)
           VALUES ($1,$2,'kurs_admin',$3,'kurs_adminlar')
           ON CONFLICT (telegram_id, rol, entity_id) DO NOTHING`, [tgId, ismTg, id]);
      }
      await client.query('UPDATE kurs_adminlar SET telegram_id=$1 WHERE id=$2', [tgId, id]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
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
//  Ishtirokchilar admin tomonidan QO'SHILMAYDI: ular imtihonlar.html orqali o'zi ro'yxatdan o'tadi.
//  Admin ro'yxatni ko'radi, noto'g'ri yozilgan ma'lumotni tuzatadi, xato yozilgan yozuvni o'chiradi
//  (shunda odam qayta topshira oladi) va kerak bo'lsa qo'shimcha urinish beradi.
router.get('/admin/ishtirokchilar', adminMw, wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT i.id, i.familiya, i.ism, i.sharif, i.telefon, i.maktab_nomi, i.fan, i.qoshimcha_urinish,
           to_char(i.yaratilgan AT TIME ZONE 'Asia/Tashkent','DD.MM.YYYY HH24:MI') AS royxat_vaqti,
           (SELECT COUNT(*) FROM kurs_urinishlar u WHERE u.ishtirokchi_id=i.id AND u.holat='tugagan')::int AS urinishlar,
           (SELECT MAX(u.foiz) FROM kurs_urinishlar u WHERE u.ishtirokchi_id=i.id AND u.holat='tugagan') AS eng_yaxshi,
           EXISTS (SELECT 1 FROM kurs_urinishlar u WHERE u.ishtirokchi_id=i.id AND u.holat='jarayonda') AS jarayonda,
           c.id AS sertifikat_id, c.raqam AS sertifikat_raqam, c.holat AS sertifikat_holat, c.otdi AS sertifikat_otdi
      FROM kurs_ishtirokchilar i
      LEFT JOIN kurs_sertifikatlar c ON c.ishtirokchi_id = i.id
     WHERE i.kurs_id=$1 ORDER BY i.yaratilgan DESC, i.id DESC`, [req.kursId]);
  res.json({ ok: true, ishtirokchilar: r.rows });
}));

function ishtirokchiMaydon(b) {
  return {
    familiya: normIsm(b.familiya), ism: normIsm(b.ism), sharif: normIsm(b.sharif),
    telefon: telefonToza(b.telefon), maktab_nomi: matn(b.maktab_nomi, 150), fan: matn(b.fan, 80),
  };
}
const ISM_RE = /^[\p{L}ʻʼ'\-. ]{2,60}$/u;
const TAKROR_XABAR = "Bu familiya va ism bilan imtihon allaqachon topshirilgan yoki boshlangan. Xatolik bo'lsa, kurs adminiga murojaat qiling.";

router.put('/admin/ishtirokchilar/:id', adminMw, wrap(async (req, res) => {
  const f = ishtirokchiMaydon(req.body);
  if (!f.familiya || !f.ism) return res.status(400).json({ ok: false, error: 'Familiya va ismni kiriting' });
  if (kalitBolak(f.familiya).length < 2 || kalitBolak(f.ism).length < 2) return res.status(400).json({ ok: false, error: 'Familiya va ism lotin yoki kirill harflarida bo\'lsin' });
  try {
    const r = await pool.query(
      `UPDATE kurs_ishtirokchilar SET familiya=$1, ism=$2, sharif=$3, telefon=$4, maktab_nomi=$5, fan=$6, ism_kalit=$7
        WHERE id=$8 AND kurs_id=$9`,
      [f.familiya, f.ism, f.sharif, f.telefon, f.maktab_nomi, f.fan, ismKalit(f.familiya, f.ism), butun(req.params.id), req.kursId]);
    if (!r.rowCount) return res.status(404).json({ ok: false, error: 'Ishtirokchi topilmadi' });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ ok: false, error: 'Bu familiya va ism bilan boshqa ishtirokchi allaqachon bor' });
    throw e;
  }
}));

// ─── Imtihon sozlamalari: umumiy login/parol va vaqt oynasi ───
//  Kurs admini o'z kursi uchun, superadmin istalgan kurs uchun belgilaydi. Vaqt Toshkent vaqti bilan.
const PAROL_HARF = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function tasodifiyParol(n = 8) {
  let s = '';
  for (let i = 0; i < n; i++) s += PAROL_HARF[crypto.randomInt(PAROL_HARF.length)];
  return s;
}
async function imtihonOl(kid) {
  const r = await pool.query(`
    SELECT holat, imtihon_login, (imtihon_parol_hash IS NOT NULL) AS parol_bor, imtihon_boshlanish, imtihon_tugash,
           to_char(imtihon_boshlanish AT TIME ZONE 'Asia/Tashkent','YYYY-MM-DD"T"HH24:MI') AS boshlanish_local,
           to_char(imtihon_tugash AT TIME ZONE 'Asia/Tashkent','YYYY-MM-DD"T"HH24:MI')     AS tugash_local,
           to_char(imtihon_boshlanish AT TIME ZONE 'Asia/Tashkent','DD.MM.YYYY HH24:MI')   AS boshlanish_matn,
           to_char(imtihon_tugash AT TIME ZONE 'Asia/Tashkent','DD.MM.YYYY HH24:MI')       AS tugash_matn
      FROM online_kurslar WHERE id=$1`, [kid]);
  if (!r.rowCount) return null;
  const k = r.rows[0];
  return {
    login: k.imtihon_login || '', parol_bor: k.parol_bor,
    boshlanish: k.boshlanish_local || '', tugash: k.tugash_local || '',
    boshlanish_matn: k.boshlanish_matn || '', tugash_matn: k.tugash_matn || '',
    holat: imtihonHolat(k), url: IMTIHON_URL,
  };
}
async function imtihonSaqla(kid, b, res) {
  const login = String(b.login == null ? '' : b.login).trim().toLowerCase();
  const bosh = String(b.boshlanish || '').trim(), tug = String(b.tugash || '').trim();
  if (login && !LOGIN_RE.test(login)) return res.status(400).json({ ok: false, error: 'Login 4–30 belgi: lotin harflari, raqam, nuqta, chiziqcha yoki pastki chiziq' });
  if ((bosh && !LOCAL_DT_RE.test(bosh)) || (tug && !LOCAL_DT_RE.test(tug))) return res.status(400).json({ ok: false, error: 'Sana va vaqt formati noto\'g\'ri' });
  if (!!bosh !== !!tug) return res.status(400).json({ ok: false, error: 'Boshlanish va tugash vaqtini birga kiriting (yoki ikkalasini ham bo\'sh qoldiring)' });
  if (bosh && tug && !(bosh < tug)) return res.status(400).json({ ok: false, error: 'Tugash vaqti boshlanishdan keyin bo\'lishi kerak' });
  try {
    await pool.query(
      `UPDATE online_kurslar SET imtihon_login=$1,
              imtihon_boshlanish = CASE WHEN $2::text = '' THEN NULL ELSE ($2::timestamp AT TIME ZONE 'Asia/Tashkent') END,
              imtihon_tugash     = CASE WHEN $3::text = '' THEN NULL ELSE ($3::timestamp AT TIME ZONE 'Asia/Tashkent') END
        WHERE id=$4`, [login || null, bosh, tug, kid]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ ok: false, error: 'Bu login boshqa kursda band. Boshqasini tanlang' });
    throw e;
  }
  res.json({ ok: true, imtihon: await imtihonOl(kid) });
}
// Yangi parol yaratadi va FAQAT shu javobda ochiq ko'rsatadi (bazada hash). Eski kirish tokenlari bekor bo'ladi.
async function imtihonParol(kid, b, res) {
  let parol = String(b.parol == null ? '' : b.parol).trim();
  if (parol && parol.length < 6) return res.status(400).json({ ok: false, error: 'Parol kamida 6 belgi bo\'lsin' });
  if (parol.length > 60) return res.status(400).json({ ok: false, error: 'Parol juda uzun' });
  if (!parol) parol = tasodifiyParol(8);
  const r = await pool.query('UPDATE online_kurslar SET imtihon_parol_hash=$1 WHERE id=$2', [bcrypt.hashSync(parol, 10), kid]);
  if (!r.rowCount) return res.status(404).json({ ok: false, error: 'Kurs topilmadi' });
  res.json({ ok: true, parol, imtihon: await imtihonOl(kid) });
}

router.get('/admin/imtihon', adminMw, wrap(async (req, res) => {
  const im = await imtihonOl(req.kursId);
  if (!im) return res.status(404).json({ ok: false, error: 'Kurs topilmadi' });
  res.json({ ok: true, imtihon: im });
}));
router.put('/admin/imtihon', adminMw, wrap((req, res) => imtihonSaqla(req.kursId, req.body || {}, res)));
router.post('/admin/imtihon/parol', adminMw, wrap((req, res) => imtihonParol(req.kursId, req.body || {}, res)));

router.get('/super/kurslar/:id/imtihon', superMw, wrap(async (req, res) => {
  const im = await imtihonOl(butun(req.params.id));
  if (!im) return res.status(404).json({ ok: false, error: 'Kurs topilmadi' });
  res.json({ ok: true, imtihon: im });
}));
router.put('/super/kurslar/:id/imtihon', superMw, wrap((req, res) => imtihonSaqla(butun(req.params.id), req.body || {}, res)));
router.post('/super/kurslar/:id/imtihon/parol', superMw, wrap((req, res) => imtihonParol(butun(req.params.id), req.body || {}, res)));

// ═══════════════════════════════════════════════════════════════════════════
//  OCHIQ: imtihonlar.html — login/parol bilan kirish, ro'yxatdan o'tish
// ═══════════════════════════════════════════════════════════════════════════
const pvOl = hash => crypto.createHash('sha256').update(String(hash || '')).digest('hex').slice(0, 12);

router.post('/imtihon/kirish', wrap(async (req, res) => {
  const ip = clientIp(req);
  if (kirishXatolari.bloklangan(ip)) return res.status(429).json({ ok: false, error: 'Juda ko\'p xato urinish. 15 daqiqadan keyin qayta urinib ko\'ring.' });
  const login = String((req.body && req.body.login) || '').trim().toLowerCase().slice(0, 60);
  const parol = String((req.body && req.body.parol) || '').slice(0, 100);
  const r = login ? await pool.query('SELECT id, nomi, holat, imtihon_parol_hash FROM online_kurslar WHERE lower(imtihon_login)=$1', [login]) : { rowCount: 0, rows: [] };
  const k = r.rows[0];
  const togri = bcrypt.compareSync(parol, (k && k.imtihon_parol_hash) || DUMMY_HASH) && !!k && !!k.imtihon_parol_hash;
  if (!togri) { kirishXatolari.xato(ip); return res.status(401).json({ ok: false, error: 'Login yoki parol noto\'g\'ri' }); }
  const token = generateToken({ role: 'imtihon_kirish', kursId: k.id, pv: pvOl(k.imtihon_parol_hash), isSuper: false }, '3h');
  res.json({ ok: true, token, kurs: { nomi: k.nomi } });
}));

async function kirishMw(req, res, next) {
  try {
    const r = await pool.query('SELECT * FROM online_kurslar WHERE id=$1', [req.user.kursId]);
    const k = r.rows[0];
    if (!k || !k.imtihon_parol_hash || pvOl(k.imtihon_parol_hash) !== req.user.pv) {
      return res.status(401).json({ ok: false, error: 'Kirish eskirgan. Qaytadan kiring.', expired: true });
    }
    req.kurs = k;
    next();
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'Server xatoligi' }); }
}
const kirishAuth = [requireAuth(['imtihon_kirish']), kirishMw];

function holatJavob(k) {
  const holat = imtihonHolat(k);
  return { holat, xabar: holat === 'ochiq' ? '' : HOLAT_XABAR[holat], server_vaqti: Date.now(),
           boshlanish: ms(k.imtihon_boshlanish), tugash: ms(k.imtihon_tugash) };
}
router.get('/imtihon/holat', kirishAuth, wrap(async (req, res) => {
  const t = await pool.query(
    `SELECT to_char($1::timestamptz AT TIME ZONE 'Asia/Tashkent','DD.MM.YYYY HH24:MI') AS b,
            to_char($2::timestamptz AT TIME ZONE 'Asia/Tashkent','DD.MM.YYYY HH24:MI') AS t`, [req.kurs.imtihon_boshlanish, req.kurs.imtihon_tugash]);
  res.json({ ok: true, kurs: { nomi: req.kurs.nomi, tavsif: req.kurs.tavsif, savol_soni: req.kurs.savol_soni, vaqt_daqiqa: req.kurs.vaqt_daqiqa, otish_foiz: req.kurs.otish_foiz },
             ...holatJavob(req.kurs), boshlanish_matn: t.rows[0].b || '', tugash_matn: t.rows[0].t || '' });
}));

router.post('/imtihon/royxat', kirishAuth, wrap(async (req, res) => {
  const k = req.kurs;
  const holat = imtihonHolat(k);
  if (holat !== 'ochiq') return res.status(403).json({ ok: false, error: HOLAT_XABAR[holat], holat });
  const f = ishtirokchiMaydon(req.body || {});
  if (!ISM_RE.test(f.familiya) || kalitBolak(f.familiya).length < 2) return res.status(400).json({ ok: false, error: 'Familiyani to\'g\'ri kiriting' });
  if (!ISM_RE.test(f.ism) || kalitBolak(f.ism).length < 2) return res.status(400).json({ ok: false, error: 'Ismni to\'g\'ri kiriting' });
  if (!ISM_RE.test(f.sharif) || kalitBolak(f.sharif).length < 2) return res.status(400).json({ ok: false, error: 'Sharifni to\'g\'ri kiriting (masalan: Abdulla oʻgʻli)' });
  if (f.maktab_nomi.length < 2) return res.status(400).json({ ok: false, error: 'Maktabingiz nomini kiriting' });
  if (f.telefon.replace(/\D/g, '').length < 9) return res.status(400).json({ ok: false, error: 'Telefon raqamini to\'g\'ri kiriting' });
  const kalit = ismKalit(f.familiya, f.ism);

  // Eski (kalitsiz) yozuvlar bilan ham solishtiramiz
  const eski = await pool.query('SELECT familiya, ism FROM kurs_ishtirokchilar WHERE kurs_id=$1 AND ism_kalit IS NULL', [k.id]);
  if (eski.rows.some(x => ismKalit(x.familiya, x.ism) === kalit)) return res.status(409).json({ ok: false, error: TAKROR_XABAR, takror: true });
  let id;
  try {
    const r = await pool.query(
      `INSERT INTO kurs_ishtirokchilar (kurs_id, familiya, ism, sharif, telefon, maktab_nomi, fan, ism_kalit, profil_vaqti)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING id`,
      [k.id, f.familiya, f.ism, f.sharif, f.telefon, f.maktab_nomi, f.fan, kalit]);
    id = r.rows[0].id;
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ ok: false, error: TAKROR_XABAR, takror: true });
    throw e;
  }
  const token = generateToken({
    ism: `${f.familiya} ${f.ism}`.trim(), rol: 'kurs_ishtirokchi', role: 'kurs_ishtirokchi', entityId: id,
    entityTable: 'kurs_ishtirokchilar', isSuper: false, kursId: k.id, kursNomi: k.nomi,
  }, '8h');
  res.json({ ok: true, token });
}));

// Ishtirokchi o'chirilganda uning BARCHA ma'lumoti o'chadi: urinishlar (CASCADE) va sertifikati ham.
// Sertifikat o'chgach uning tekshiruv kodi/QR va PDF yuklash ham ishlamaydi. Qaytarib bo'lmaydi.
router.delete('/admin/ishtirokchilar/:id', adminMw, wrap(async (req, res) => {
  const id = butun(req.params.id);
  const own = await pool.query('SELECT 1 FROM kurs_ishtirokchilar WHERE id=$1 AND kurs_id=$2', [id, req.kursId]);
  if (!own.rowCount) return res.status(404).json({ ok: false, error: 'Ishtirokchi topilmadi' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await telegramAjrat('kurs_ishtirokchi', id, client);
    await client.query('DELETE FROM kurs_sertifikatlar WHERE ishtirokchi_id=$1 AND kurs_id=$2', [id, req.kursId]);
    await client.query('DELETE FROM kurs_ishtirokchilar WHERE id=$1 AND kurs_id=$2', [id, req.kursId]);   // urinishlar CASCADE
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  res.json({ ok: true });
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
    SELECT c.id, c.raqam, c.tekshiruv_kodi, c.familiya, c.ism, c.sharif, c.foiz, c.otdi, c.holat, c.bekor_sababi,
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

// Urinishni yakunlash: ball hisoblanadi; o'tgan bo'lsa (yoki urinishlar tugagan bo'lsa) sertifikat beriladi.
// yuborilgan = mijoz yuborgan javoblar (null bo'lsa saqlanganlari ishlatiladi)
async function yakunla(urinishId, yuborilgan) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ur = await client.query(
      `SELECT u.*, k.otish_foiz, k.urinish_limit, k.nomi AS kurs_nomi, k.direktor_fio
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

    // Sertifikat: o'tgan bo'lsa darhol («muvaffaqiyatli tugatgan»); o'tmagan bo'lsa — urinishlar
    // tugagandan keyin («faol ishtirok etgan», eng yuqori natija bilan). Urinish qolgan bo'lsa
    // qayta topshirib o'tishi mumkin, shuning uchun hozircha sertifikat berilmaydi.
    const qosh = (await client.query('SELECT qoshimcha_urinish FROM kurs_ishtirokchilar WHERE id=$1', [u.ishtirokchi_id])).rows[0];
    const tugaganSoni = (await client.query(
      `SELECT COUNT(*)::int AS n FROM kurs_urinishlar WHERE ishtirokchi_id=$1 AND holat='tugagan'`, [u.ishtirokchi_id])).rows[0].n;
    const limit = Number(u.urinish_limit) + Number(qosh ? qosh.qoshimcha_urinish : 0);
    if (otdi || tugaganSoni >= limit) {
      const eng = (await client.query(
        `SELECT COALESCE(MAX(foiz),0) AS f FROM kurs_urinishlar WHERE ishtirokchi_id=$1 AND holat='tugagan'`, [u.ishtirokchi_id])).rows[0].f;
      const sertFoiz = otdi ? foiz : Number(eng);
      const mavjud = await client.query('SELECT id, otdi FROM kurs_sertifikatlar WHERE ishtirokchi_id=$1 FOR UPDATE', [u.ishtirokchi_id]);
      if (!mavjud.rowCount) {
        const ish = (await client.query('SELECT familiya, ism, sharif FROM kurs_ishtirokchilar WHERE id=$1', [u.ishtirokchi_id])).rows[0];
        // Raqam va tekshiruv kodi: har biri 10 ta tasodifiy harf/raqam, o'zaro va boshqalar bilan takrorlanmaydi
        const noyob = async (ustun, boshqa) => {
          for (let i = 0; i < 12; i++) {
            const k = tasodifiyKod(10);
            if (k === boshqa) continue;
            const bor = await client.query(`SELECT 1 FROM kurs_sertifikatlar WHERE ${ustun}=$1`, [k]);
            if (!bor.rowCount) return k;
          }
          throw new Error(ustun + ' yaratib bo\'lmadi');
        };
        const raqam = await noyob('raqam', null);
        const kod = await noyob('tekshiruv_kodi', raqam);
        await client.query(
          `INSERT INTO kurs_sertifikatlar
             (kurs_id, ishtirokchi_id, urinish_id, raqam, tekshiruv_kodi, familiya, ism, sharif, kurs_nomi, direktor_fio, foiz, otdi, berilgan_sana)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,(NOW() AT TIME ZONE 'Asia/Tashkent')::date)`,
          [u.kurs_id, u.ishtirokchi_id, urinishId, raqam, kod, ish.familiya, ish.ism, ish.sharif, u.kurs_nomi, u.direktor_fio, sertFoiz, otdi]);
      } else if (!mavjud.rows[0].otdi) {
        // Oldin «faol ishtirok» sertifikati berilgan (admin qo'shimcha urinish bergan) — endi o'tgan bo'lsa yangilanadi
        if (otdi) {
          await client.query(
            `UPDATE kurs_sertifikatlar SET otdi=TRUE, foiz=$1, urinish_id=$2, direktor_fio=$3,
                    berilgan_sana=(NOW() AT TIME ZONE 'Asia/Tashkent')::date WHERE id=$4`,
            [foiz, urinishId, u.direktor_fio, mavjud.rows[0].id]);
        } else {
          await client.query('UPDATE kurs_sertifikatlar SET foiz=GREATEST(foiz,$1) WHERE id=$2', [sertFoiz, mavjud.rows[0].id]);
        }
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
    `SELECT raqam, tekshiruv_kodi, holat, otdi, to_char(berilgan_sana,'DD.MM.YYYY') AS berilgan_sana FROM kurs_sertifikatlar WHERE ishtirokchi_id=$1`, [ishId]);
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
    pool.query(`SELECT raqam, tekshiruv_kodi, holat, otdi, to_char(berilgan_sana,'DD.MM.YYYY') AS berilgan_sana
                  FROM kurs_sertifikatlar WHERE ishtirokchi_id=$1`, [ish.id]),
    pool.query('SELECT COUNT(*)::int AS n FROM kurs_savollar WHERE kurs_id=$1', [ish.kurs_id]),
  ]);
  const tugagan = ur.rows.filter(x => x.holat === 'tugagan').length;
  const limit = ish.urinish_limit + ish.qoshimcha_urinish;
  const faol = ur.rows.find(x => x.holat === 'jarayonda') || null;
  res.json({
    ok: true,
    ishtirokchi: { familiya: ish.familiya, ism: ish.ism, sharif: ish.sharif, telefon: ish.telefon,
                   maktab_nomi: ish.maktab_nomi, fan: ish.fan },
    kurs: { nomi: ish.kurs_nomi, tavsif: ish.kurs_tavsif, holat: ish.kurs_holat, otish_foiz: ish.otish_foiz,
            urinish_limit: limit, vaqt_daqiqa: ish.vaqt_daqiqa,
            savollar_soni: ish.savol_soni ? Math.min(ish.savol_soni, soni.rows[0].n) : soni.rows[0].n },
    urinishlar: ur.rows.filter(x => x.holat === 'tugagan'),
    qolgan_urinish: Math.max(0, limit - tugagan - (faol ? 1 : 0)),
    faol_urinish_id: faol ? faol.id : null,
    sertifikat: ser.rows[0] || null,
    imtihon: holatJavob({ holat: ish.kurs_holat, imtihon_boshlanish: ish.imtihon_boshlanish, imtihon_tugash: ish.imtihon_tugash }),
  });
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
  const oyna = imtihonHolat({ holat: ish.kurs_holat, imtihon_boshlanish: ish.imtihon_boshlanish, imtihon_tugash: ish.imtihon_tugash });
  if (oyna !== 'ochiq') return res.status(403).json({ ok: false, error: HOLAT_XABAR[oyna] + '. Yangi test faqat belgilangan vaqt oralig\'ida boshlanadi.' });
  // Faqat o'tgan (otdi=TRUE) sertifikat qayta topshirishni to'sadi; «faol ishtirok» sertifikati bo'lsa, qo'shimcha urinish berilgan taqdirda topshirish mumkin
  const s = await pool.query('SELECT 1 FROM kurs_sertifikatlar WHERE ishtirokchi_id=$1 AND otdi', [ish.id]);
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
module.exports._test = { savollarParse, normIsm, ismKalit, imtihonHolat };
