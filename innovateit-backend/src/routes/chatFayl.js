// ─── Chat: fayl va audio (1:1 va guruh chati uchun umumiy) ───────────────────────
//
//  • Bitta fayl limiti: CHAT_MAX_MB (standart 95MB). Cloudflare (bepul tarif) so'rov
//    hajmini 100MB bilan cheklaydi, multipart qo'shimchasi bilan 100MB'lik fayl
//    rad etilardi — shuning uchun 95MB. Nginx'da /api/chat/ uchun client_max_body_size 100M.
//  • Kunlik kvota: har bir foydalanuvchi uchun oxirgi 24 soatda yuborgan fayllar yig'indisi
//    CHAT_KVOTA_MB (standart 500MB) dan oshmasligi kerak.
//  • Fayllar chat_uploads/ da (statik/nginx orqali OCHIQ emas). Berish: imzolangan qisqa
//    muddatli havola (5 daqiqa) orqali — <audio src> va yuklab olish havolasi JWT header
//    yubora olmagani uchun. Havola olinganda ruxsat tekshiriladi, ochilganda yana tekshiriladi.
//  • Berish res.sendFile bilan: HTTP Range qo'llab-quvvatlanadi (iOS Safari audio uchun shart,
//    oldinga o'tkazish uchun ham kerak).
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const multer  = require('multer');
const pool    = require('../db');

const CHAT_DIR = path.join(__dirname, '../../chat_uploads');
if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });

const MB = 1024 * 1024;
const MAX_FAYL    = (Number(process.env.CHAT_MAX_MB)   || 95)  * MB;
const KVOTA_KUNLIK = (Number(process.env.CHAT_KVOTA_MB) || 500) * MB;
const HAVOLA_TTL  = 5 * 60 * 1000;

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
  // audio (mikrofon yozuvi: Chrome/Android — webm, Safari/iOS — m4a)
  '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg',
  '.m4a':  'audio/mp4',  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.aac': 'audio/aac',
};
const RASM_KENG  = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const AUDIO_KENG = new Set(['.webm', '.ogg', '.oga', '.opus', '.m4a', '.mp3', '.wav', '.aac']);
const FAYL_ROYXAT_MATNI = 'rasm, pdf, doc, docx, xls, xlsx, ppt, pptx, txt, csv, zip, audio (mp3, m4a, ogg, webm, wav, aac)';

// Fayl boshidagi "sehrli baytlar" — kengaytma soxta bo'lmasin (txt/csv tekshirilmaydi)
function imzoTogri(ext, buf) {
  const h  = (...b) => b.every((v, i) => buf[i] === v);
  const s  = (a, z) => buf.slice(a, z).toString('latin1');
  switch (ext) {
    case '.jpg': case '.jpeg': return h(0xFF, 0xD8, 0xFF);
    case '.png':  return h(0x89, 0x50, 0x4E, 0x47);
    case '.gif':  return s(0, 3) === 'GIF';
    case '.webp': return s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP';
    case '.pdf':  return s(0, 4) === '%PDF';
    case '.zip': case '.docx': case '.xlsx': case '.pptx':
      return s(0, 2) === 'PK' && (buf[2] === 0x03 || buf[2] === 0x05);
    case '.doc': case '.xls': case '.ppt': return h(0xD0, 0xCF, 0x11, 0xE0);
    case '.webm': return h(0x1A, 0x45, 0xDF, 0xA3);
    case '.ogg': case '.oga': case '.opus': return s(0, 4) === 'OggS';
    case '.m4a':  return s(4, 8) === 'ftyp';
    case '.wav':  return s(0, 4) === 'RIFF' && s(8, 12) === 'WAVE';
    case '.mp3':  return s(0, 3) === 'ID3' || (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0);
    case '.aac':  return s(0, 3) === 'ID3' || s(4, 8) === 'ftyp' || (buf[0] === 0xFF && (buf[1] & 0xF6) === 0xF0);
    default: return true;
  }
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
        ? `Fayl hajmi ${Math.floor(MAX_FAYL / MB)}MB dan katta bo'lmasligi kerak`
        : (err.message || 'Fayl yuklashda xatolik');
      return res.status(400).json({ ok: false, error: msg });
    }
    next();
  });
}

// Yuklangan faylni tekshiradi (sehrli baytlar) va saqlash uchun ma'lumot yig'adi.
// Qaytadi: { yol, nomi, turi, hajm, davomiylik } yoki { error }
function faylMalumoti(file, davomiylikRaw) {
  const ext = path.extname(file.filename).toLowerCase();
  try {
    const fd = fs.openSync(path.join(CHAT_DIR, file.filename), 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    if (!imzoTogri(ext, buf)) return { error: 'Fayl mazmuni kengaytmasiga mos kelmaydi' };
  } catch (_) { return { error: "Faylni o'qib bo'lmadi" }; }

  // multer originalname'ni latin1 deb o'qiydi — UTF-8 nomni tiklaymiz va tozalaymiz
  let nomi = Buffer.from(file.originalname, 'latin1').toString('utf8');
  nomi = path.basename(nomi.replace(/\\/g, '/')).replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim().slice(0, 120) || ('fayl' + ext);

  // Davomiylik (soniya) — faqat audio uchun; mijozdan keladi, shuning uchun faqat ko'rsatish uchun
  // (hech qanday ruxsat/limit unga bog'liq emas), shunga qaramay oraliqqa keltiriladi.
  let davomiylik = null;
  if (AUDIO_KENG.has(ext)) {
    const d = Math.round(Number(davomiylikRaw));
    if (Number.isFinite(d) && d >= 0) davomiylik = Math.min(d, 86400);
  }
  return { yol: file.filename, nomi, turi: FAYL_TURLARI[ext], hajm: file.size, davomiylik };
}

// Oxirgi 24 soatda yuborilgan fayllar + yangi fayl kvotadan oshmasligini tekshiradi
async function kvotaOshmaydimi(me, yangiHajm) {
  const col = me.rol === 'oqituvchi' ? 'oqituvchi_id' : 'oquvchi_id';
  const r = await pool.query(
    `SELECT (
        COALESCE((SELECT SUM(fayl_hajm) FROM chat_xabarlar
                   WHERE ${col} = $1 AND yuboruvchi = $2
                     AND yaratilgan > NOW() - INTERVAL '24 hours'), 0)
      + COALESCE((SELECT SUM(fayl_hajm) FROM chat_guruh_xabarlar
                   WHERE yuboruvchi_id = $1 AND yuboruvchi = $2
                     AND yaratilgan > NOW() - INTERVAL '24 hours'), 0)
     )::bigint AS ishlatilgan`,
    [me.id, me.rol]
  );
  return Number(r.rows[0].ishlatilgan) + yangiHajm <= KVOTA_KUNLIK;
}
const KVOTA_XABARI = `Kunlik yuklash limiti (${Math.floor(KVOTA_KUNLIK / MB)}MB) tugadi. Ertaga qayta urinib ko'ring`;

// ─── Imzolangan qisqa muddatli havola ────────────────────────────────────────
function kalit() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET yo\'q — fayl havolasini imzolab bo\'lmaydi');
  return crypto.createHash('sha256').update('chat-fayl:' + s).digest();
}
function imzola(obj) {
  const p = Buffer.from(JSON.stringify({ ...obj, e: Date.now() + HAVOLA_TTL })).toString('base64url');
  const s = crypto.createHmac('sha256', kalit()).update(p).digest('base64url');
  return `${p}.${s}`;
}
function imzoTekshir(token) {
  const [p, s] = String(token || '').split('.');
  if (!p || !s) return null;
  const kutilgan = crypto.createHmac('sha256', kalit()).update(p).digest('base64url');
  const a = Buffer.from(s), b = Buffer.from(kutilgan);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let o;
  try { o = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); } catch (_) { return null; }
  if (!o || typeof o.e !== 'number' || o.e < Date.now()) return null;
  return o;
}

// ─── Faylni berish (Range bilan) ─────────────────────────────────────────────
// rasm va audio inline (brauzerda ko'rsatiladi/ijro etiladi), qolganlari attachment;
// yuklash=true bo'lsa — hammasi attachment. nosniff — brauzer turini taxmin qilmasin.
function faylYubor(res, row, { yuklash = false, cache = 'private, max-age=3600' } = {}) {
  const yol = path.join(CHAT_DIR, path.basename(row.fayl_yol));
  if (!fs.existsSync(yol)) return res.status(404).json({ ok: false, error: 'Fayl topilmadi' });

  const ext = path.extname(row.fayl_yol).toLowerCase();
  const inline = !yuklash && (RASM_KENG.has(ext) || AUDIO_KENG.has(ext));
  res.setHeader('Content-Type', FAYL_TURLARI[ext] || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', cache);
  res.setHeader('Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.fayl_nomi || 'fayl' + ext)}`);
  res.sendFile(yol, { acceptRanges: true, dotfiles: 'allow' }, (err) => {
    if (err && !res.headersSent) res.status(err.status || 404).json({ ok: false, error: 'Fayl topilmadi' });
  });
}

module.exports = {
  CHAT_DIR, MAX_FAYL, KVOTA_KUNLIK, FAYL_TURLARI, RASM_KENG, AUDIO_KENG, FAYL_ROYXAT_MATNI,
  imzoTogri, qabulFayl, unlinkQuiet, faylMalumoti,
  kvotaOshmaydimi, KVOTA_XABARI,
  imzola, imzoTekshir, faylYubor,
};
