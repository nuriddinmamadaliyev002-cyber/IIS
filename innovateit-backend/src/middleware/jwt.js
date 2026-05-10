// ═══════════════════════════════════════════════════
//  JWT Middleware — Haqiqiy imzoli token
// ═══════════════════════════════════════════════════
require('dotenv').config();
const jwt = require('jsonwebtoken');

const SECRET  = process.env.JWT_SECRET;
const EXPIRES = process.env.JWT_EXPIRES || '8h';

if (!SECRET || SECRET.length < 32) {
  console.error("❌ JWT_SECRET .env da yo'q yoki 32 belgidan qisqa!");
  process.exit(1);
}

// ─── Token yaratish ───────────────────────────────────────────────────────────
function generateToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
}

// ─── Token tekshirish middleware ──────────────────────────────────────────────
function requireAuth(allowedRoles = ['admin', 'buxgalter', 'viewer']) {
  return (req, res, next) => {
    const header = req.headers['authorization'] || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ ok: false, error: 'Token kerak', expired: true });
    }

    let payload;
    try {
      payload = jwt.verify(token, SECRET);
    } catch (err) {
      const expired = err.name === 'TokenExpiredError';
      return res.status(401).json({
        ok: false,
        error: expired ? 'Token muddati tugagan' : 'Token yaroqsiz',
        expired: true
      });
    }

    // Rol tekshirish — superadmin hamma narsaga kiradi
    if (!payload.isSuper && allowedRoles.length && !allowedRoles.includes(payload.role)) {
      return res.status(403).json({ ok: false, error: "Ruxsat yo'q" });
    }

    req.user = payload;
    next();
  };
}

// ─── Token tekshirish (middleware emas, to'g'ridan-to'g'ri) ──────────────────
function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { generateToken, requireAuth, verifyToken };