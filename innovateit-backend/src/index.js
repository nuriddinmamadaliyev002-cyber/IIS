// ═══════════════════════════════════════════════════
//  InnovateIT School — Express.js REST API Server
// ═══════════════════════════════════════════════════
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const pool    = require('./db');

const authRouter      = require('./routes/auth');
const studentsRouter  = require('./routes/students');
const adminsRouter    = require('./routes/admins');
const davomatRouter   = require('./routes/davomat');
const jadvalRouter    = require('./routes/jadval');
const teachersRouter  = require('./routes/teachers');
const buxgalterRouter = require('./routes/buxgalter');
const portfolioRouter = require('./routes/portfolio');
const maktablarRouter = require('./routes/maktablar');
const telegramRouter       = require('./routes/telegram');



const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Uploads papkasi ───
const UPLOAD_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname).toLowerCase();
    if (!ext) {
      const mimeToExt = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/bmp': '.png' };
      ext = mimeToExt[file.mimetype] || '.png';
    }
    cb(null, `kvit_${Date.now()}_${Math.random().toString(36).slice(2,7)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg','.jpeg','.png','.gif','.webp','.pdf'];
    const mimes   = ['image/jpeg','image/png','image/gif','image/webp','image/bmp','application/pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, (ext ? allowed.includes(ext) : false) || mimes.includes(file.mimetype));
  }
});

// ─── Middleware ───
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origin === 'null' || 
        origin.includes('localhost') || 
        origin.includes('127.0.0.1') || 
        origin.includes('ngrok') ||          // ← shu qator qo'shildi
        origin.includes('ngrok-free.app') || // ← shu qator qo'shildi
        origin === 'https://innovateitschool.uz' ||
        origin === 'http://new.innovateitschool.uz' ||
        origin === 'https://new.innovateitschool.uz' ||
        origin === 'https://web.telegram.org')
      return cb(null, true);
    cb(new Error('CORS: ruxsat yoq'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOAD_DIR));

// ─── Fayl yuklash (kvitansiyalar uchun) ───
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ ok: false, error: 'Fayl yuklanmadi' });
  res.json({ ok: true, filename: req.file.filename });
});
app.delete('/upload/:filename', (req, res) => {
  const fp = path.join(UPLOAD_DIR, req.params.filename);
  if (fs.existsSync(fp)) { fs.unlinkSync(fp); return res.json({ ok: true }); }
  res.json({ ok: false, error: 'Fayl topilmadi' });
});

// ─── Health ───
app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ─── REST Routerlar ───
app.use('/api/auth',      authRouter);
app.use('/api/students',  studentsRouter);
app.use('/api/admins',    adminsRouter);
app.use('/api/davomat',   davomatRouter);
app.use('/api/jadval',    jadvalRouter);
app.use('/api/teachers',  teachersRouter);
app.use('/api/buxgalter', buxgalterRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/maktablar', maktablarRouter);
app.use('/api/telegram',        telegramRouter);
app.use('/miniapp', express.static(path.join(__dirname, '../../telegram-bot/miniapp')));




// ─── Xatolik handlerlari ───
app.use((req, res) => res.status(404).json({ ok: false, error: `Topilmadi: ${req.method} ${req.path}` }));
app.use((err, req, res, next) => {
  console.error('Server xatoligi:', err.message);
  res.status(500).json({ ok: false, error: 'Server xatoligi: ' + err.message });
});

// ─── Start ───
app.listen(PORT, '127.0.0.1', async () => {
  console.log(`✅ InnovateIT REST API: http://127.0.0.1:${PORT}`);
  try { await pool.query('SELECT NOW()'); console.log('✅ PostgreSQL OK'); }
  catch (err) { console.error('❌ PostgreSQL xatolik:', err.message); }
});