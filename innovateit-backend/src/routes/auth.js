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
router.post('/refresh', requireAuth(['admin', 'buxgalter', 'viewer', 'oqituvchi', 'oquvchi', 'sales']), (req, res) => {
  // Barcha JWT maydonlarini saqlab yangi token berish
  const token = generateToken(req.user);
  res.json({ ok: true, token });
});

module.exports = router;