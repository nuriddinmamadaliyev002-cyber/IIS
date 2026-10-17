// ─── Chat routes (o'quvchi ↔ unga biriktirilgan o'qituvchi) ───────────────────
//
//  GET    /api/chat/suhbatlar            — suhbatdoshlar ro'yxati + oxirgi xabar + o'qilmaganlar
//  GET    /api/chat/xabarlar?hamroh=ID   — suhbat xabarlari (?after=ID yangilari, ?before=ID eskilari,
//                                          ?ozgarish=ISO — shu vaqtdan keyin tahrir/o'chirilganlar)
//  POST   /api/chat/xabarlar             — xabar yuborish: JSON { hamroh, matn }
//                                          yoki multipart/form-data { hamroh, matn?, fayl }
//  PUT    /api/chat/xabarlar/:id         — O'Z xabarini tahrirlash { matn }
//  DELETE /api/chat/xabarlar/:id         — O'Z xabarini o'chirish (ikki tomondan ham yo'qoladi)
//  GET    /api/chat/fayl/:id             — xabarga biriktirilgan faylni olish (JWT bilan)
//  GET    /api/chat/oqilmagan            — jami o'qilmagan xabarlar soni (belgi/badge uchun)
//
//  Ruxsat: FAQAT role='oqituvchi' yoki role='oquvchi' (superadmin ham kirmaydi —
//  tokenida entityId yo'q) va FAQAT oqituvchi_oquvchilar jadvalida biriktirilgan
//  juftlar orasida. "hamroh" — suhbatdoshning id'si (o'qituvchi uchun o'quvchi id,
//  o'quvchi uchun o'qituvchi id). Har bir so'rovda juftlik qayta tekshiriladi.
//
//  O'chirish: qator o'chirilmaydi — "qabr toshi" (ochirilgan) bo'lib qoladi, matn va
//  fayl ma'lumotlari tozalanadi, fayl diskdan o'chiriladi. Ikkinchi tomon polling
//  (?ozgarish=) orqali buni bilib, xabarni ekrandan oladi.
//
//  Fayllar: innovateit-backend/chat_uploads/ (uploads/ dan TASHQARIDA — /uploads statik
//  yo'li va nginx alias orqali ochiq berilmaydi). Faqat shu router orqali, JWT va juftlik
//  tekshiruvi bilan beriladi.
//
//  Real-time o'rniga qisqa interval bilan so'rov (polling) ishlatiladi: bitta
//  PM2 instance va oddiy nginx proxy bilan ishlaydi, qo'shimcha infratuzilma kerak emas.
const { Router }      = require('express');
const path            = require('path');
const fs              = require('fs');
const crypto          = require('crypto');
const multer          = require('multer');
const pool            = require('../db');
const { requireAuth } = require('../middleware/jwt');

const router = Router();
router.use(requireAuth(['oqituvchi', 'oquvchi']));

const MAX_MATN  = 2000;
const PAGE_SIZE = 50;

// ─── Fayl yuklash sozlamalari ────────────────────────────────────────────────
const CHAT_DIR = path.join(__dirname, '../../chat_uploads');
if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });

const MAX_FAYL = 5 * 1024 * 1024; // 5MB (mavjud /upload bilan bir xil — nginx client_max_body_size ga mos)

// Ruxsat etilgan kengaytmalar → MIME (javobda server o'zi belgilaydi, mijozning
// yuborgan Content-Type'iga ishonilmaydi). SVG/HTML/JS ataylab YO'Q (XSS).
const FAYL_TURLARI = {
  '.jpg':  'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif':  'image/gif',  '.webp': 'image/webp',
  '.pdf':  'application/pdf',
  '.doc':  'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls':  'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt':  'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt':  'text/plain; charset=utf-8',
  '.csv':  'text/csv; charset=utf-8',
  '.zip':  'application/zip',
};
const RASM_KENG = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

// Rasm / PDF uchun fayl boshidagi "sehrli baytlar" — kengaytma soxta bo'lmasin
function imzoTogri(ext, buf) {
  const h = (...b) => b.every((v, i) => buf[i] === v);
  if (ext === '.jpg' || ext === '.jpeg') return h(0xFF, 0xD8, 0xFF);
  if (ext === '.png')  return h(0x89, 0x50, 0x4E, 0x47);
  if (ext === '.gif')  return buf.slice(0, 3).toString('latin1') === 'GIF';
  if (ext === '.webp') return buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP';
  if (ext === '.pdf')  return buf.slice(0, 4).toString('latin1') === '%PDF';
  return true;
}

const chatUpload = multer({
  storage: multer.diskStorage({
    destination: CHAT_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: MAX_FAYL, files: 1, fields: 10 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, !!FAYL_TURLARI[ext]);
  },
});

function unlinkQuiet(filename) {
  if (!filename) return;
  fs.unlink(path.join(CHAT_DIR, path.basename(filename)), () => {});
}

// multipart bo'lsa faylni qabul qiladi; JSON bo'lsa o'tkazib yuboradi
function qabulFayl(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  chatUpload.single('fayl')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? `Fayl hajmi ${MAX_FAYL / 1024 / 1024}MB dan katta bo'lmasligi kerak`
        : (err.message || 'Fayl yuklashda xatolik');
      return res.status(400).json({ ok: false, error: msg });
    }
    next();
  });
}

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

// ─── "Guruhda" sharti ────────────────────────────────────────────────────────
// Chat faqat o'quvchi o'qituvchining GURUHIDA bo'lsa ochiladi. Guruh = o'qituvchining
// dars_jadvali yozuvi ("Guruh yaratish"): o'sha maktabda, sinflari ro'yxatida o'quvchining
// sinfi bor. O'quvchi o'qituvchiga biriktirilgan (oqituvchi_oquvchilar) bo'lishi ham shart.
// (davomat.js `guruhDavomatHolati` dagi guruh tarkibi bilan bir xil qoida.)
// Alias'lar: oo = oqituvchi_oquvchilar, o = oquvchilar, t = oqituvchilar.
const GURUHDA = `EXISTS (
  SELECT 1 FROM dars_jadvali dj
   WHERE dj.maktab_id = o.maktab_id
     AND LOWER(TRIM(dj.teacher_familiya)) = LOWER(TRIM(t.familiya))
     AND LOWER(TRIM(dj.teacher_ism))      = LOWER(TRIM(t.ism))
     AND EXISTS (
       SELECT 1 FROM unnest(string_to_array(COALESCE(dj.sinflar, ''), ',')) AS sn
        WHERE REGEXP_REPLACE(LOWER(TRIM(sn)),       '[\\s-]*sinf$', '')
            = REGEXP_REPLACE(LOWER(TRIM(o.sinf)),   '[\\s-]*sinf$', '')
          AND TRIM(sn) <> ''))`;

// Juftlik: biriktirilgan VA o'quvchi o'qituvchining guruhida
async function biriktirilganmi(tId, sId) {
  const r = await pool.query(
    `SELECT 1
       FROM oqituvchi_oquvchilar oo
       JOIN oquvchilar  o ON o.id = oo.oquvchi_id
       JOIN oqituvchilar t ON t.id = oo.oqituvchi_id
      WHERE oo.oqituvchi_id = $1 AND oo.oquvchi_id = $2 AND ${GURUHDA}`,
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

// Xabar ustunlari (har doim shu ro'yxat bilan o'qiladi)
const COLS = `id, yuboruvchi, matn, yaratilgan, tahrirlangan, ochirilgan,
              fayl_nomi, fayl_turi, fayl_hajm, (fayl_yol IS NOT NULL) AS fayl_bor`;

const xabarJson = (r) => {
  if (r.ochirilgan) return { id: Number(r.id), ochirilgan: true };
  const j = {
    id: Number(r.id), yuboruvchi: r.yuboruvchi, matn: r.matn, yaratilgan: r.yaratilgan,
    tahrirlangan: r.tahrirlangan || null,
  };
  if (r.fayl_bor) {
    j.fayl = {
      nomi: r.fayl_nomi, turi: (r.fayl_turi || '').split(';')[0], hajm: r.fayl_hajm,
      rasm: /^image\//.test(r.fayl_turi || ''),
    };
  }
  return j;
};

// O'qituvchi tanlagan maktab (?maktabId=): faqat o'ziga biriktirilgan maktab bo'lishi shart.
// Berilmasa — filtr yo'q (mid: null).
function tanlanganMaktab(req, me) {
  if (me.rol !== 'oqituvchi') return { mid: null };
  const raw = req.query && req.query.maktabId;
  if (raw === undefined || raw === null || raw === '') return { mid: null };
  const mid = parseInt(raw, 10);
  const u = req.user || {};
  const allowed = (u.maktabIdlar || []).map(Number).filter(Number.isInteger);
  const main = Number(u.maktabId);
  if (Number.isInteger(main) && main > 0 && !allowed.includes(main)) allowed.push(main);
  if (!Number.isInteger(mid) || !allowed.includes(mid)) return { error: "Bu maktab sizga biriktirilmagan" };
  return { mid };
}

// ─── GET /api/chat/suhbatlar ─────────────────────────────────────────────────
router.get('/suhbatlar', async (req, res) => {
  const me = kim(req);
  if (!me) return res.status(403).json({ ok: false, error: "Faqat o'quvchi va o'qituvchi uchun" });

  const sel = tanlanganMaktab(req, me);
  if (sel.error) return res.status(403).json({ ok: false, error: sel.error });

  try {
    let r;
    if (me.rol === 'oqituvchi') {
      r = await pool.query(
        `SELECT o.id AS hamroh_id, o.ism, o.familiya, o.sinf, o.avatar, m.nomi AS maktab,
                lm.matn AS oxirgi_matn, lm.yuboruvchi AS oxirgi_yuboruvchi, lm.yaratilgan AS oxirgi_vaqt,
                lm.fayl_nomi AS oxirgi_fayl_nomi, (lm.fayl_turi LIKE 'image/%') AS oxirgi_fayl_rasm,
                COALESCE(u.soni, 0)::int AS oqilmagan
           FROM oqituvchi_oquvchilar oo
           JOIN oquvchilar o ON o.id = oo.oquvchi_id
           JOIN oqituvchilar t ON t.id = oo.oqituvchi_id
           LEFT JOIN maktablar m ON m.id = o.maktab_id
           LEFT JOIN LATERAL (
             SELECT matn, yuboruvchi, yaratilgan, fayl_nomi, fayl_turi FROM chat_xabarlar
              WHERE oqituvchi_id = oo.oqituvchi_id AND oquvchi_id = oo.oquvchi_id AND ochirilgan IS NULL
              ORDER BY id DESC LIMIT 1) lm ON TRUE
           LEFT JOIN LATERAL (
             SELECT COUNT(*) AS soni FROM chat_xabarlar
              WHERE oqituvchi_id = oo.oqituvchi_id AND oquvchi_id = oo.oquvchi_id
                AND yuboruvchi = 'oquvchi' AND oqilgan IS NULL AND ochirilgan IS NULL) u ON TRUE
          WHERE oo.oqituvchi_id = $1
            AND ($2::int IS NULL OR o.maktab_id = $2::int)
            AND ${GURUHDA}
          ORDER BY lm.yaratilgan DESC NULLS LAST, o.sinf, o.familiya, o.ism`,
        [me.id, sel.mid]
      );
    } else {
      r = await pool.query(
        `SELECT t.id AS hamroh_id, t.ism, t.familiya, t.fan, t.avatar,
                lm.matn AS oxirgi_matn, lm.yuboruvchi AS oxirgi_yuboruvchi, lm.yaratilgan AS oxirgi_vaqt,
                lm.fayl_nomi AS oxirgi_fayl_nomi, (lm.fayl_turi LIKE 'image/%') AS oxirgi_fayl_rasm,
                COALESCE(u.soni, 0)::int AS oqilmagan
           FROM oqituvchi_oquvchilar oo
           JOIN oqituvchilar t ON t.id = oo.oqituvchi_id
           JOIN oquvchilar o ON o.id = oo.oquvchi_id
           LEFT JOIN LATERAL (
             SELECT matn, yuboruvchi, yaratilgan, fayl_nomi, fayl_turi FROM chat_xabarlar
              WHERE oqituvchi_id = oo.oqituvchi_id AND oquvchi_id = oo.oquvchi_id AND ochirilgan IS NULL
              ORDER BY id DESC LIMIT 1) lm ON TRUE
           LEFT JOIN LATERAL (
             SELECT COUNT(*) AS soni FROM chat_xabarlar
              WHERE oqituvchi_id = oo.oqituvchi_id AND oquvchi_id = oo.oquvchi_id
                AND yuboruvchi = 'oqituvchi' AND oqilgan IS NULL AND ochirilgan IS NULL) u ON TRUE
          WHERE oo.oquvchi_id = $1
            AND ${GURUHDA}
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
  const sel = tanlanganMaktab(req, me);
  if (sel.error) return res.status(403).json({ ok: false, error: sel.error });
  try {
    const sender = me.rol === 'oqituvchi' ? 'oquvchi' : 'oqituvchi';
    const r = await pool.query(
      `SELECT COUNT(*)::int AS soni
         FROM chat_xabarlar c
         JOIN oqituvchi_oquvchilar oo
           ON oo.oqituvchi_id = c.oqituvchi_id AND oo.oquvchi_id = c.oquvchi_id
         JOIN oquvchilar o ON o.id = c.oquvchi_id
         JOIN oqituvchilar t ON t.id = c.oqituvchi_id
        WHERE c.${me.rol === 'oqituvchi' ? 'oqituvchi_id' : 'oquvchi_id'} = $1
          AND c.yuboruvchi = $2 AND c.oqilgan IS NULL AND c.ochirilgan IS NULL
          AND ($3::int IS NULL OR o.maktab_id = $3::int)
          AND ${GURUHDA}`,
      [me.id, sender, sel.mid]
    );
    res.json({ ok: true, soni: r.rows[0].soni });
  } catch (err) {
    console.error('chat/oqilmagan xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/chat/xabarlar?hamroh=ID[&after=ID | &before=ID][&ozgarish=ISO] ─
// Parametrsiz — oxirgi 50 ta xabar. after — shu id'dan KEYINGI (yangi) xabarlar.
// before — shu id'dan OLDINGI (eski) xabarlar, 50 tadan. Javobda har doim
// xabarlar eskidan yangiga tartiblangan. O'chirilgan xabarlar qaytarilmaydi.
// ozgarish (faqat after bilan) — shu vaqtdan keyin TAHRIRLANGAN yoki O'CHIRILGAN,
// lekin mijozda allaqachon bor (id <= after) xabarlar `ozgargan` ro'yxatida keladi
// (o'chirilgani { id, ochirilgan: true }). `server_vaqt` — keyingi so'rovga
// `ozgarish` sifatida berish uchun (soat farqidan qochish uchun server vaqti).
// Suhbatdoshning yuborgan xabarlari o'qilgan deb belgilanadi. `oqilgan_id` — MENING
// yuborgan xabarlarimdan suhbatdosh o'qiganlarining eng kattasi (✓✓ belgisi uchun).
router.get('/xabarlar', async (req, res) => {
  const me = kim(req);
  if (!me) return res.status(403).json({ ok: false, error: "Faqat o'quvchi va o'qituvchi uchun" });

  const hamrohId = parseInt(req.query.hamroh, 10);
  if (!Number.isInteger(hamrohId) || hamrohId <= 0)
    return res.status(400).json({ ok: false, error: 'Suhbatdosh tanlanmagan' });

  const after  = parseInt(req.query.after, 10);
  const before = parseInt(req.query.before, 10);
  const ozg    = req.query.ozgarish ? new Date(req.query.ozgarish) : null;
  const { tId, sId } = juft(me, hamrohId);
  const hamrohRol = me.rol === 'oqituvchi' ? 'oquvchi' : 'oqituvchi';

  try {
    if (!(await biriktirilganmi(tId, sId)))
      return res.status(403).json({ ok: false, error: "Bu foydalanuvchi bilan yozishish mumkin emas" });

    const serverVaqt = (await pool.query('SELECT NOW() AS t')).rows[0].t;

    let rows, ozgargan;
    if (Number.isInteger(after) && after > 0) {
      rows = (await pool.query(
        `SELECT ${COLS} FROM chat_xabarlar
          WHERE oqituvchi_id=$1 AND oquvchi_id=$2 AND id > $3 AND ochirilgan IS NULL
          ORDER BY id ASC LIMIT 200`,
        [tId, sId, after]
      )).rows;
      if (ozg && !isNaN(ozg.getTime())) {
        ozgargan = (await pool.query(
          `SELECT ${COLS} FROM chat_xabarlar
            WHERE oqituvchi_id=$1 AND oquvchi_id=$2 AND id <= $3 AND yangilangan > $4
            ORDER BY id ASC LIMIT 200`,
          [tId, sId, after, ozg]
        )).rows;
      }
    } else if (Number.isInteger(before) && before > 0) {
      rows = (await pool.query(
        `SELECT ${COLS} FROM chat_xabarlar
          WHERE oqituvchi_id=$1 AND oquvchi_id=$2 AND id < $3 AND ochirilgan IS NULL
          ORDER BY id DESC LIMIT $4`,
        [tId, sId, before, PAGE_SIZE]
      )).rows.reverse();
    } else {
      rows = (await pool.query(
        `SELECT ${COLS} FROM chat_xabarlar
          WHERE oqituvchi_id=$1 AND oquvchi_id=$2 AND ochirilgan IS NULL
          ORDER BY id DESC LIMIT $3`,
        [tId, sId, PAGE_SIZE]
      )).rows.reverse();
    }

    // Suhbatdoshning xabarlarini o'qilgan deb belgilash
    await pool.query(
      `UPDATE chat_xabarlar SET oqilgan = NOW()
        WHERE oqituvchi_id=$1 AND oquvchi_id=$2 AND yuboruvchi=$3 AND oqilgan IS NULL AND ochirilgan IS NULL`,
      [tId, sId, hamrohRol]
    );

    const o = await pool.query(
      `SELECT COALESCE(MAX(id), 0) AS m FROM chat_xabarlar
        WHERE oqituvchi_id=$1 AND oquvchi_id=$2 AND yuboruvchi=$3 AND oqilgan IS NOT NULL AND ochirilgan IS NULL`,
      [tId, sId, me.rol]
    );

    res.json({
      ok: true,
      xabarlar: rows.map(xabarJson),
      ...(ozgargan ? { ozgargan: ozgargan.map(xabarJson) } : {}),
      server_vaqt: serverVaqt,
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
// JSON: { hamroh, matn }  |  multipart: hamroh, matn (ixtiyoriy), fayl
router.post('/xabarlar', qabulFayl, async (req, res) => {
  const file = req.file || null;
  const fail = (code, error) => { if (file) unlinkQuiet(file.filename); return res.status(code).json({ ok: false, error }); };

  const me = kim(req);
  if (!me) return fail(403, "Faqat o'quvchi va o'qituvchi uchun");

  const hamrohId = parseInt(req.body && req.body.hamroh, 10);
  if (!Number.isInteger(hamrohId) || hamrohId <= 0) return fail(400, 'Suhbatdosh tanlanmagan');

  // Qator o'tishlari saqlanadi; chetidagi bo'shliqlar olib tashlanadi
  const matn = String((req.body && req.body.matn) ?? '').replace(/\r\n/g, '\n').trim();

  // multipart yuborilgan-u, fayl filtrdan o'tmagan bo'lsa
  if (!file && req.is('multipart/form-data') && !matn)
    return fail(400, "Fayl turi qo'llab-quvvatlanmaydi (rasm, pdf, doc, docx, xls, xlsx, ppt, pptx, txt, csv, zip)");

  if (!matn && !file) return fail(400, "Xabar bo'sh bo'lmasligi kerak");
  if (matn.length > MAX_MATN) return fail(400, `Xabar ${MAX_MATN} belgidan oshmasligi kerak`);

  let fayl = null;
  if (file) {
    const ext = path.extname(file.filename).toLowerCase();
    try {
      const fd = fs.openSync(path.join(CHAT_DIR, file.filename), 'r');
      const buf = Buffer.alloc(16);
      fs.readSync(fd, buf, 0, 16, 0);
      fs.closeSync(fd);
      if (!imzoTogri(ext, buf)) return fail(400, 'Fayl mazmuni kengaytmasiga mos kelmaydi');
    } catch (_) { return fail(400, "Faylni o'qib bo'lmadi"); }

    // multer originalname'ni latin1 deb o'qiydi — UTF-8 nomni tiklaymiz va tozalaymiz
    let nomi = Buffer.from(file.originalname, 'latin1').toString('utf8');
    nomi = path.basename(nomi.replace(/\\/g, '/')).replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim().slice(0, 120) || ('fayl' + ext);
    fayl = { yol: file.filename, nomi, turi: FAYL_TURLARI[ext], hajm: file.size };
  }

  if (!rateOk(me)) return fail(429, "Juda tez yozyapsiz. Biroz kutib qayta urinib ko'ring");

  const { tId, sId } = juft(me, hamrohId);
  try {
    if (!(await biriktirilganmi(tId, sId))) return fail(403, "Bu foydalanuvchi bilan yozishish mumkin emas");

    const r = await pool.query(
      `INSERT INTO chat_xabarlar (oqituvchi_id, oquvchi_id, yuboruvchi, matn, fayl_yol, fayl_nomi, fayl_turi, fayl_hajm)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${COLS}`,
      [tId, sId, me.rol, matn, fayl && fayl.yol, fayl && fayl.nomi, fayl && fayl.turi, fayl && fayl.hajm]
    );
    res.json({ ok: true, xabar: xabarJson(r.rows[0]) });
  } catch (err) {
    console.error('chat/xabarlar POST xatolik:', err.message);
    fail(500, 'Server xatoligi');
  }
});

// ─── O'Z xabarini topish (tahrirlash/o'chirish uchun) ────────────────────────
// Faqat yuboruvchining o'zi va faqat hozir ham biriktirilgan juftlikda.
async function oziniki(me, idRaw) {
  const id = parseInt(idRaw, 10);
  if (!Number.isInteger(id) || id <= 0) return { code: 400, error: 'Xabar topilmadi' };
  const col = me.rol === 'oqituvchi' ? 'oqituvchi_id' : 'oquvchi_id';
  const r = await pool.query(
    `SELECT id, oqituvchi_id, oquvchi_id, matn, fayl_yol FROM chat_xabarlar
      WHERE id=$1 AND ${col}=$2 AND yuboruvchi=$3 AND ochirilgan IS NULL`,
    [id, me.id, me.rol]
  );
  if (!r.rowCount) return { code: 404, error: 'Xabar topilmadi yoki u sizniki emas' };
  const row = r.rows[0];
  if (!(await biriktirilganmi(row.oqituvchi_id, row.oquvchi_id)))
    return { code: 403, error: "Bu foydalanuvchi bilan yozishish mumkin emas" };
  return { row };
}

// ─── PUT /api/chat/xabarlar/:id — tahrirlash ─────────────────────────────────
router.put('/xabarlar/:id', async (req, res) => {
  const me = kim(req);
  if (!me) return res.status(403).json({ ok: false, error: "Faqat o'quvchi va o'qituvchi uchun" });

  const matn = String((req.body && req.body.matn) ?? '').replace(/\r\n/g, '\n').trim();
  if (matn.length > MAX_MATN)
    return res.status(400).json({ ok: false, error: `Xabar ${MAX_MATN} belgidan oshmasligi kerak` });

  try {
    const f = await oziniki(me, req.params.id);
    if (f.error) return res.status(f.code).json({ ok: false, error: f.error });

    // Faylsiz xabar matnsiz qolmasin (matnni olib tashlash uchun "o'chirish" bor)
    if (!matn && !f.row.fayl_yol)
      return res.status(400).json({ ok: false, error: "Xabar bo'sh bo'lmasligi kerak. Butunlay olib tashlash uchun o'chiring" });

    // O'zgarish bo'lmasa — "tahrirlandi" belgisi qo'yilmaydi
    if (matn === f.row.matn) {
      const same = await pool.query(`SELECT ${COLS} FROM chat_xabarlar WHERE id=$1`, [f.row.id]);
      return res.json({ ok: true, xabar: xabarJson(same.rows[0]) });
    }

    const r = await pool.query(
      `UPDATE chat_xabarlar SET matn=$2, tahrirlangan=NOW(), yangilangan=NOW()
        WHERE id=$1 AND ochirilgan IS NULL
        RETURNING ${COLS}`,
      [f.row.id, matn]
    );
    if (!r.rowCount) return res.status(404).json({ ok: false, error: 'Xabar topilmadi' });
    res.json({ ok: true, xabar: xabarJson(r.rows[0]) });
  } catch (err) {
    console.error('chat/xabarlar PUT xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── DELETE /api/chat/xabarlar/:id — ikki tomondan o'chirish ─────────────────
router.delete('/xabarlar/:id', async (req, res) => {
  const me = kim(req);
  if (!me) return res.status(403).json({ ok: false, error: "Faqat o'quvchi va o'qituvchi uchun" });

  try {
    const f = await oziniki(me, req.params.id);
    if (f.error) return res.status(f.code).json({ ok: false, error: f.error });

    const r = await pool.query(
      `UPDATE chat_xabarlar
          SET ochirilgan=NOW(), yangilangan=NOW(), matn='',
              fayl_yol=NULL, fayl_nomi=NULL, fayl_turi=NULL, fayl_hajm=NULL
        WHERE id=$1 AND ochirilgan IS NULL`,
      [f.row.id]
    );
    if (r.rowCount) unlinkQuiet(f.row.fayl_yol);
    res.json({ ok: true, id: Number(f.row.id) });
  } catch (err) {
    console.error('chat/xabarlar DELETE xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/chat/fayl/:id — biriktirilgan faylni berish ────────────────────
// JWT (Authorization header) + juftlik tekshiruvi. Rasmlar inline, qolganlari
// yuklab olish (attachment) sifatida; nosniff — brauzer turini taxmin qilmasin.
router.get('/fayl/:id', async (req, res) => {
  const me = kim(req);
  if (!me) return res.status(403).json({ ok: false, error: "Faqat o'quvchi va o'qituvchi uchun" });

  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'Fayl topilmadi' });

  try {
    const col = me.rol === 'oqituvchi' ? 'oqituvchi_id' : 'oquvchi_id';
    const r = await pool.query(
      `SELECT oqituvchi_id, oquvchi_id, fayl_yol, fayl_nomi, fayl_turi FROM chat_xabarlar
        WHERE id=$1 AND ${col}=$2 AND ochirilgan IS NULL AND fayl_yol IS NOT NULL`,
      [id, me.id]
    );
    if (!r.rowCount) return res.status(404).json({ ok: false, error: 'Fayl topilmadi' });
    const row = r.rows[0];
    if (!(await biriktirilganmi(row.oqituvchi_id, row.oquvchi_id)))
      return res.status(403).json({ ok: false, error: "Bu foydalanuvchi bilan yozishish mumkin emas" });

    const fp = path.join(CHAT_DIR, path.basename(row.fayl_yol));
    if (!fs.existsSync(fp)) return res.status(404).json({ ok: false, error: 'Fayl topilmadi' });

    const ext = path.extname(row.fayl_yol).toLowerCase();
    const inline = RASM_KENG.has(ext);
    res.setHeader('Content-Type', FAYL_TURLARI[ext] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.fayl_nomi || 'fayl' + ext)}`);
    fs.createReadStream(fp).on('error', () => res.destroy()).pipe(res);
  } catch (err) {
    console.error('chat/fayl xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

module.exports = router;
