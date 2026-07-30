// ═══════════════════════════════════════════════════════════════════════════
//  InnovateIT School — Blog frontend
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

// ─── Postlar ro'yxati sahifalari uchun umumiy mantiq ────────────────────────
// Bosh sahifa (index.html) va har bir kategoriya sahifasi (yangiliklar.html,
// yutuqlar.html, it-darslar.html) shu funksiyalardan foydalanadi. Har biri
// initBlogListing(fixedCategory)'ni chaqiradi — fixedCategory bo'sh bo'lsa
// "Barchasi" (bosh sahifa), aks holda o'sha kategoriya slugi bilan sahifa
// darhol o'sha kategoriyaga filtrlangan holda, sakramasdan, yuqoridan ochiladi.
let CURRENT_CATEGORY = '';
let CURRENT_PAGE = 1;
const PAGE_LIMIT = 9;

async function initBlogListing(fixedCategory = '') {
  CURRENT_CATEGORY = fixedCategory || '';
  await loadCategories(fixedCategory);
  await loadFeatured();
  await loadPosts();
}

async function loadCategories(fixedCategory) {
  const res = await apiGet('/api/blog/categories');
  if (!res.ok) return;
  const bar = document.getElementById('cat-bar');
  if (!bar) return;
  res.categories.forEach(c => {
    if (!c.postlar_soni) return; // bo'sh kategoriyani ko'rsatmaymiz
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.dataset.slug = c.slug;
    btn.textContent = `${c.nomi} (${c.postlar_soni})`;
    btn.onclick = () => selectCategory(c.slug, btn);
    bar.appendChild(btn);
  });
  const allBtn = bar.querySelector('.chip[data-slug=""]');
  if (allBtn) allBtn.onclick = () => selectCategory('', allBtn);

  if (fixedCategory) {
    const target = bar.querySelector(`.chip[data-slug="${fixedCategory}"]`);
    if (target) {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      target.classList.add('active');
    }
  }
}

function selectCategory(slug, btnEl) {
  CURRENT_CATEGORY = slug;
  CURRENT_PAGE = 1;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  btnEl.classList.add('active');
  loadPosts();
}

async function loadFeatured() {
  const slot = document.getElementById('featured-slot');
  if (!slot) return;
  const res = await apiGet('/api/blog/posts?limit=1');
  if (!res.ok || !res.posts.length) { slot.innerHTML = ''; return; }
  const p = res.posts[0];
  slot.innerHTML = `
    <a class="featured" href="post.html?slug=${encodeURIComponent(p.slug)}">
      <div class="featured-media">
        ${p.muqova_rasm ? `<img src="${resolveUpload(p.muqova_rasm)}" style="${coverPosStyle(p.muqova_pozitsiya, p.muqova_masshtab)}" alt="">` : ''}
      </div>
      <div class="featured-body">
        ${p.kategoriya_nomi ? `<span class="cat-tag">${esc(p.kategoriya_nomi)}</span>` : ''}
        <h2>${esc(p.sarlavha)}</h2>
        <p>${esc(p.qisqacha || '')}</p>
        <div class="featured-meta">${esc(p.muallif)} · ${fmtDate(p.chop_vaqti)}</div>
      </div>
    </a>`;
}

async function loadPosts() {
  const grid = document.getElementById('posts-grid');
  if (!grid) return;
  const qs = new URLSearchParams({ page: CURRENT_PAGE, limit: PAGE_LIMIT });
  if (CURRENT_CATEGORY) qs.set('kategoriya', CURRENT_CATEGORY);

  const res = await apiGet(`/api/blog/posts?${qs}`);
  if (!res.ok) { grid.innerHTML = '<div class="empty-state">Postlarni yuklab bo\'lmadi</div>'; return; }

  if (!res.posts.length) {
    grid.innerHTML = '<div class="empty-state">Bu bo\'limda hali postlar yo\'q</div>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  grid.innerHTML = res.posts.map(p => `
    <a class="card" href="post.html?slug=${encodeURIComponent(p.slug)}">
      <div class="card-media">
        ${p.muqova_rasm ? `<img src="${resolveUpload(p.muqova_rasm)}" style="${coverPosStyle(p.muqova_pozitsiya, p.muqova_masshtab)}" alt="">` : ''}
      </div>
      <div class="card-body">
        ${p.kategoriya_nomi ? `<span class="cat-tag">${esc(p.kategoriya_nomi)}</span>` : ''}
        <h3>${esc(p.sarlavha)}</h3>
        <p>${esc(p.qisqacha || '')}</p>
        <div class="card-meta"><span>${fmtDate(p.chop_vaqti)}</span><span>${p.korishlar || 0} ko'rishlar</span></div>
      </div>
    </a>`).join('');

  renderPagination(res.totalPages, res.page);
}

function renderPagination(totalPages, page) {
  const el = document.getElementById('pagination');
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  let html = `<button ${page===1?'disabled':''} onclick="gotoPage(${page-1})">‹</button>`;
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="${i===page?'active':''}" onclick="gotoPage(${i})">${i}</button>`;
  }
  html += `<button ${page===totalPages?'disabled':''} onclick="gotoPage(${page+1})">›</button>`;
  el.innerHTML = html;
}

function gotoPage(p) {
  CURRENT_PAGE = p;
  loadPosts();
  document.getElementById('posts-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Joriy sahifani nav'da belgilash (active-link) ──────────────────────────
(function markActiveNav() {
  const current      = new URL(window.location.href);
  const currentPath   = current.pathname.replace(/index\.html$/, '');
  const currentKateg  = current.searchParams.get('kategoriya');

  document.querySelectorAll('.header-nav a, .mobile-nav a').forEach(a => {
    const href = a.getAttribute('href');
    if (!href) return;
    const linkUrl  = new URL(href, window.location.href);
    const linkPath = linkUrl.pathname.replace(/index\.html$/, '');
    const linkKateg = linkUrl.searchParams.get('kategoriya');
    const isActive = linkPath === currentPath && linkKateg === currentKateg;
    a.classList.toggle('active', isActive);
  });
})();

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