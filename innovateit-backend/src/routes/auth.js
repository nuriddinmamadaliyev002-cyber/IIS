// ─── Auth routes ────────────────────────────────────────────────────────────
//
//  POST /api/auth/login         — FAQAT superadmin (username + parol)
//  POST /api/auth/login-viewer  — Portfolio viewer (username + parol)
//  POST /api/auth/refresh       — Tokenni yangilash
//
//  ⚠️  Maktab admini, buxgalter, sales, o'qituvchi, o'quvchi uchun login
//      YO'Q. Ular faqat Telegram Mini App orqali kiradi:
//      GET /api/telegram/check/:telegramId  → JWT token
//
// ─────────────────────────────────────────────────────────────────────────────
const { Router }                          = require('express');
const { verifySuperAdmin, verifyViewer, hashPassword } = require('../middleware/auth');
const { generateToken, requireAuth }      = require('../middleware/jwt');
const pool                                = require('../db');
const bcrypt                              = require('bcryptjs');

const router = Router();

// ─── POST /api/auth/login — faqat superadmin ─────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, parol } = req.body;

  const admin = await verifySuperAdmin(username, parol);
  if (!admin) {
    return res.status(401).json({
      ok: false,
      error: "Username yoki parol noto'g'ri"
    });
  }

  const token = generateToken({
    username: username.trim(),
    ism:      admin.ism,
    isSuper:  true,
    role:     'admin',
    maktabId: null,  // superadmin barcha maktablarni ko'radi
  });

  res.json({ ok: true, token, ism: admin.ism, isSuper: true });
});

// ─── POST /api/auth/login-viewer — portfolio viewer ──────────────────────────
router.post('/login-viewer', async (req, res) => {
  const { username, parol } = req.body;
  const viewer = await verifyViewer(username, parol);
  if (!viewer) {
    return res.status(401).json({
      ok: false,
      error: "Username yoki parol noto'g'ri"
    });
  }

  const token = generateToken({
    username: username.trim(),
    ism:      viewer.ism,
    isSuper:  false,
    role:     'viewer',
    maktabId: null,
  });

  res.json({ ok: true, token, ism: viewer.ism, role: 'viewer' });
});

// ─── POST /api/auth/refresh — tokenni yangilash ──────────────────────────────
// O'qituvchi uchun maktablar ro'yxati (maktablar / maktabIdlar) bazadan QAYTA
// o'qiladi: o'qituvchi login qilgandan keyin yangi maktabga biriktirilgan (yoki
// ajratilgan) bo'lsa, eski token/sessiya bilan maktab tanlagichi yangilanmay
// qolardi. Javobda ham yangi ro'yxat qaytariladi — panel shu bilan tanlagichni
// qayta quradi.
router.post('/refresh', requireAuth(['admin', 'buxgalter', 'viewer', 'oqituvchi', 'oquvchi', 'sales', 'direktor']), async (req, res) => {
  let payload = req.user;
  let extra   = {};

  if (!payload.isSuper && payload.role === 'oqituvchi' && payload.entityId) {
    try {
      const r = await pool.query(
        `SELECT m.id, m.nomi
           FROM oqituvchi_maktablar om
           JOIN maktablar m ON m.id = om.maktab_id
          WHERE om.oqituvchi_id = $1
          ORDER BY om.id`,
        [payload.entityId]
      );
      const maktabIdlar = r.rows.map(x => x.id);
      const maktablar   = r.rows.map(x => x.nomi);
      const joriy       = Number(payload.maktabId);
      payload = {
        ...payload,
        maktablar,
        maktabIdlar,
        maktabId: maktabIdlar.includes(joriy) ? joriy : (maktabIdlar[0] || null),
      };
      extra = { maktablar, maktabIdlar };
    } catch (err) {
      // Baza xatosida eski ma'lumot bilan davom etamiz — refresh sinmasin
      console.error('auth/refresh maktablar xatolik:', err.message);
    }
  }

  const token = generateToken(payload);
  res.json({ ok: true, token, ...extra });
});

module.exports = router;