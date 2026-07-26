// ─── Auth routes ────────────────────────────────────────────────────────────
//
//  POST /api/auth/login         — FAQAT superadmin (username + parol)
//  POST /api/auth/login-admin   — Maktab admini (username + parol)
//  POST /api/auth/login-viewer  — Portfolio viewer (username + parol)
//  POST /api/auth/login-buxgalter — Buxgalter (username + parol)
//  POST /api/auth/login-sales   — Sales xodimi (username + parol)
//  POST /api/auth/refresh       — Tokenni yangilash
//
//  ⚠️  Buxgalter, o'qituvchi, o'quvchi uchun login YO'Q.
//      Ular faqat Telegram Mini App orqali kiradi:
//      GET /api/telegram/check/:telegramId  → JWT token
//
// ─────────────────────────────────────────────────────────────────────────────
const { Router }                          = require('express');
const { verifySuperAdmin, verifyViewer }  = require('../middleware/auth');
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

// ─── POST /api/auth/login-admin — maktab admini ──────────────────────────────
router.post('/login-admin', async (req, res) => {
  const { username, parol } = req.body;

  if (!username || !parol)
    return res.status(400).json({ ok: false, error: 'Username va parol kerak' });

  try {
    const result = await pool.query(
      `SELECT a.id, a.ism, a.familiya, a.parol, a.maktab_id, m.nomi AS maktab_nomi
       FROM adminlar a
       LEFT JOIN maktablar m ON m.id = a.maktab_id
       WHERE a.username = $1`,
      [username.trim().toLowerCase()]
    );

    if (result.rowCount === 0)
      return res.status(401).json({ ok: false, error: "Username yoki parol noto'g'ri" });

    const admin = result.rows[0];

    if (!admin.parol)
      return res.status(401).json({ ok: false, error: "Bu admin uchun parol belgilanmagan. Superadmin bilan bog'laning." });

    const ok = await bcrypt.compare(parol, admin.parol);
    if (!ok)
      return res.status(401).json({ ok: false, error: "Username yoki parol noto'g'ri" });

    const token = generateToken({
      id:         admin.id,
      username:   username.trim().toLowerCase(),
      ism:        `${admin.familiya} ${admin.ism}`.trim(),
      isSuper:    false,
      role:       'admin',
      maktabId:   admin.maktab_id,
      maktabNomi: admin.maktab_nomi || '',
    });

    res.json({
      ok:         true,
      token,
      id:         admin.id,
      ism:        `${admin.familiya} ${admin.ism}`.trim(),
      familiya:   admin.familiya || '',
      ismOnly:    admin.ism || '',
      maktabId:   admin.maktab_id,
      maktabNomi: admin.maktab_nomi || '',
    });
  } catch (err) {
    console.error('login-admin xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
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

// ─── POST /api/auth/login-buxgalter — buxgalter login ────────────────────────
router.post('/login-buxgalter', async (req, res) => {
  const { username, parol } = req.body;

  if (!username || !parol)
    return res.status(400).json({ ok: false, error: 'Username va parol kerak' });

  try {
    const result = await pool.query(
      `SELECT b.id, b.ism, b.familiya, b.parol,
              ARRAY_AGG(bm.maktab_id) FILTER (WHERE bm.maktab_id IS NOT NULL) AS maktab_ids
       FROM buxgalterlar b
       LEFT JOIN buxgalter_maktablar bm ON bm.buxgalter_id = b.id
       WHERE b.username = $1
       GROUP BY b.id`,
      [username.trim().toLowerCase()]
    );

    if (result.rowCount === 0)
      return res.status(401).json({ ok: false, error: "Username yoki parol noto'g'ri" });

    const bux = result.rows[0];

    if (!bux.parol)
      return res.status(401).json({ ok: false, error: "Bu buxgalter uchun parol belgilanmagan. Superadmin bilan bog'laning." });

    const ok = await bcrypt.compare(parol, bux.parol);
    if (!ok)
      return res.status(401).json({ ok: false, error: "Username yoki parol noto'g'ri" });

    const token = generateToken({
      id:        bux.id,
      username:  username.trim().toLowerCase(),
      ism:       `${bux.familiya} ${bux.ism}`.trim(),
      isSuper:   false,
      role:      'buxgalter',
      entityId:  bux.id,
      maktabIds: bux.maktab_ids || [],
    });

    res.json({
      ok:        true,
      token,
      id:        bux.id,
      ism:       `${bux.familiya} ${bux.ism}`.trim(),
      maktabIds: bux.maktab_ids || [],
    });
  } catch (err) {
    console.error('login-buxgalter xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/auth/login-sales — sales xodimi login ─────────────────────────
router.post('/login-sales', async (req, res) => {
  const { username, parol } = req.body;

  if (!username || !parol)
    return res.status(400).json({ ok: false, error: 'Username va parol kerak' });

  try {
    const result = await pool.query(
      `SELECT id, ism, familiya, parol FROM sales_xodimlar WHERE username = $1`,
      [username.trim().toLowerCase()]
    );

    if (result.rowCount === 0)
      return res.status(401).json({ ok: false, error: "Username yoki parol noto'g'ri" });

    const xodim = result.rows[0];

    if (!xodim.parol)
      return res.status(401).json({ ok: false, error: "Bu xodim uchun parol belgilanmagan. Superadmin bilan bog'laning." });

    const ok = await bcrypt.compare(parol, xodim.parol);
    if (!ok)
      return res.status(401).json({ ok: false, error: "Username yoki parol noto'g'ri" });

    const token = generateToken({
      id:       xodim.id,
      username: username.trim().toLowerCase(),
      ism:      `${xodim.familiya} ${xodim.ism}`.trim(),
      isSuper:  false,
      role:     'sales',
      entityId: xodim.id,
    });

    res.json({
      ok:    true,
      token,
      id:    xodim.id,
      ism:   `${xodim.familiya} ${xodim.ism}`.trim(),
    });
  } catch (err) {
    console.error('login-sales xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

module.exports = router;