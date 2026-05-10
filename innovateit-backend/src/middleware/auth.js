// ═══════════════════════════════════════════════════════════════════════════
//  Auth Middleware
//  Faqat superadmin username+parol bilan kiradi.
//  Qolgan barcha foydalanuvchilar (admin, buxgalter, o'qituvchi, o'quvchi)
//  Telegram Mini App orqali kiradi → /api/telegram/check/:telegramId
// ═══════════════════════════════════════════════════════════════════════════
const bcrypt = require('bcryptjs');
require('dotenv').config();

const SUPER_ADMIN_USERNAME = process.env.SUPER_ADMIN_USERNAME || 'superadmin';
const SUPER_ADMIN_PAROL    = process.env.SUPER_ADMIN_PAROL    || '25145771';
const SUPER_ADMIN_ISM      = process.env.SUPER_ADMIN_ISM      || 'InnovateIT School Manager';

// Hash yoki ochiq matn — ikkalasini ham tekshiradi
async function checkPassword(input, stored) {
  if (!input || !stored) return false;
  const isHashed = stored.startsWith('$2b$') || stored.startsWith('$2a$');
  if (isHashed) return bcrypt.compare(input, stored);
  return input === stored;
}

// ─── Faqat superadmin uchun ──────────────────────────────────────────────────
async function verifySuperAdmin(username, parol) {
  if (!username || !parol) return null;
  if (username !== SUPER_ADMIN_USERNAME) return null;
  const ok = await checkPassword(parol, SUPER_ADMIN_PAROL);
  if (!ok) return null;
  return { ism: SUPER_ADMIN_ISM, isSuper: true };
}

// ─── Portfolio viewer uchun (hali ham username/parol ishlatadi) ──────────────
const pool = require('../db');
async function verifyViewer(username, parol) {
  if (!username || !parol) return null;
  try {
    const result = await pool.query(
      'SELECT ism, parol FROM portfolio_viewers WHERE username = $1',
      [username.trim()]
    );
    if (result.rows.length === 0) return null;
    const { ism, parol: stored } = result.rows[0];
    const ok = await checkPassword(parol, stored);
    return ok ? { ism, username: username.trim() } : null;
  } catch (err) {
    console.error('verifyViewer xatolik:', err.message);
    return null;
  }
}

const SALT_ROUNDS = 10;
async function hashPassword(plainText) {
  return bcrypt.hash(plainText, SALT_ROUNDS);
}

module.exports = {
  verifySuperAdmin,
  verifyViewer,
  hashPassword,
  SUPER_ADMIN_USERNAME,
  SUPER_ADMIN_PAROL,
  SUPER_ADMIN_ISM,
};
