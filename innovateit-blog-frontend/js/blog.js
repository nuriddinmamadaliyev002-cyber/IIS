// ═══════════════════════════════════════════════════════════════════════════
//  Innovate IT School — Blog frontend
//  Backend: bir xil Node.js/Express API (CRM bilan bir xil server, /api/blog)
// ═══════════════════════════════════════════════════════════════════════════

// ─── Backend manzili ─────────────────────────────────────────────────────────
// LOCAL: 127.0.0.1:3001 da; PRODUCTION (innovateitschool.uz): nisbiy /api
const _host = window.location.hostname;
const BASE = (_host === 'localhost' || _host === '127.0.0.1' || _host === '')
  ? 'http://127.0.0.1:3001'
  : '';

function resolveUpload(filename) {
  if (!filename) return '';
  if (filename.startsWith('http')) return filename;
  return `${BASE}/uploads/${filename}`;
}

async function apiGet(path) {
  try {
    const res = await fetch(`${BASE}${path}`);
    return await res.json();
  } catch (e) {
    console.error('API xatolik:', e);
    return { ok: false, error: 'Server bilan aloqa yo\'q' };
  }
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Kategoriya nomidan qisqa "stamp" belgisi hosil qilish (masalan "IT darslar" -> "IT")
function stampCode(catName) {
  if (!catName) return 'IIS';
  const words = catName.replace(/'/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map(w => w[0]).join('').slice(0, 3).toUpperCase();
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
