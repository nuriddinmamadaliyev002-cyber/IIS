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

// Admin panelda tanlangan "muqova pozitsiyasi" (0-100, default 50) va
// "masshtab/zoom" (100-250, default 100) asosida rasmga qo'llanadigan CSS
// hosil qiladi — rasmning muhim qismi kesilib qolmasligi va kerak bo'lsa
// yaqinlashtirib ko'rsatilishi uchun.
function coverPosStyle(pos, zoom) {
  const p = Math.max(0, Math.min(100, parseInt(pos, 10) || 50));
  const z = Math.max(100, Math.min(250, parseInt(zoom, 10) || 100));
  return `object-position:center ${p}%;transform:scale(${z / 100});transform-origin:center ${p}%;`;
}

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

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// ─── Mobil hamburger menyu ──────────────────────────────────────────────────
(function initMobileNav() {
  const toggle   = document.getElementById('menu-toggle');
  const nav      = document.getElementById('mobile-nav');
  const backdrop = document.getElementById('mobile-nav-backdrop');
  if (!toggle || !nav || !backdrop) return;

  function openNav() {
    nav.classList.add('open');
    backdrop.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('nav-open');
  }
  function closeNav() {
    nav.classList.remove('open');
    backdrop.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
  }

  toggle.addEventListener('click', () => {
    nav.classList.contains('open') ? closeNav() : openNav();
  });
  backdrop.addEventListener('click', closeNav);
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeNav));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNav(); });
})();
