// ═══════════════════════════════════════════════════
//  InnovateIT — Sales Panel JS
// ═══════════════════════════════════════════════════

let U = null;       // { ism, id, viaTelegram: true } — JWT orqali (Telegram Mini App)
let LEADS = [];
let FILTERED_LEADS = [];   // maktab filtridan o'tgan ro'yxat (jadval shu asosida chiziladi)

const g = id => document.getElementById(id);

const HOLAT_LABELS = {
  yangi:            { text: '🆕 Yangi',             color: '#2563eb', bg: '#eff6ff' },
  boglanildi:       { text: "📞 Bog'lanildi",        color: '#d97706', bg: '#fffbeb' },
  royxatga_olindi:  { text: "✅ Ro'yxatga olindi",   color: '#16a34a', bg: '#f0fdf4' },
  bekor_qilindi:    { text: '❌ Bekor qilindi',      color: '#dc2626', bg: '#fef2f2' },
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

const OY_NOMLARI = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const pad = n => String(n).padStart(2, '0');
  return `${OY_NOMLARI[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function togglePw() {
  const inp = g('inp-parol');
  const eye = g('pw-eye');
  if (inp.type === 'password') { inp.type = 'text'; eye.textContent = '🙈'; }
  else                          { inp.type = 'password'; eye.textContent = '👁'; }
}

// ─── Kirish ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // ─── Telegram Mini App orqali kirish ────────────────────────────────────
  const params  = new URLSearchParams(window.location.search);
  const tgToken = params.get('tg_token');
  if (tgToken) {
    api.setToken(tgToken);
    const payload = api.getUser();
    const ism     = params.get('tg_ism') || payload?.ism || '';
    U = { ism, viaTelegram: true, id: payload?.id };
    localStorage.setItem('iit_sales_u', JSON.stringify(U));
    window.history.replaceState({}, '', window.location.pathname);
    showApp();
    return;
  }

  try {
    const saved = localStorage.getItem('iit_sales_u');
    if (saved && api.isLoggedIn()) {
      U = JSON.parse(saved);
      showApp();
    } else {
      localStorage.removeItem('iit_sales_u');
    }
  } catch (e) { localStorage.removeItem('iit_sales_u'); }
});

function doLogout() {
  U = null; LEADS = [];
  api.logout();
  localStorage.removeItem('iit_sales_u');
  window.location.href = 'index.html';
}

function showApp() {
  g('login-screen').style.display = 'none';
  g('app').style.display = 'block';
  g('sales-badge').textContent = U.ism;
  loadLeads();
  window.addEventListener('resize', updateFrozenOffset);
  updateFrozenOffset();
}

// ─── Freeze: topbar + stat-kartalar + filtrlar balandligini hisoblab,
//     jadval thead'ini shu balandlikdan pastda "yopishtirib" qo'yadi ───
function updateFrozenOffset() {
  const topbar = document.querySelector('.topbar');
  const frozen = g('sl-frozen-header');
  if (!topbar || !frozen) return;
  const offset = topbar.offsetHeight + frozen.offsetHeight;
  document.documentElement.style.setProperty('--sl-thead-top', offset + 'px');
}

// ─── Leadlar ──────────────────────────────────────
async function loadLeads() {
  const loadingEl = g('sl-leads-loading');
  const emptyEl   = g('sl-leads-empty');

  loadingEl.style.display = 'block';
  emptyEl.style.display = 'none';

  try {
    const holat = g('sl-holat-filter').value;
    const r = await api.getLeads(holat ? { holat } : {});
    if (r.ok) {
      LEADS = r.leadlar || [];
      buildMaktabFilterOptions();
      applyFilters();
    } else {
      loadingEl.innerHTML = `<div style="color:#dc2626;">❌ ${r.error}</div>`;
      return;
    }
  } catch (e) {
    loadingEl.innerHTML = `<div style="color:#dc2626;">❌ Xatolik: ${e.message}</div>`;
    return;
  }
  loadingEl.style.display = 'none';
}

// ─── Maktab filtri ──────────────────────────────────────
function buildMaktabFilterOptions() {
  const sel = g('sl-maktab-filter');
  const cur = sel.value;

  const maktablar = [...new Set(LEADS.map(l => l.maktab_nomi || l.hudud).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  sel.innerHTML = '<option value="">🏫 Barcha maktablar</option>'
    + maktablar.map(m => `<option value="${esc(m)}"${m === cur ? ' selected' : ''}>${esc(m)}</option>`).join('');
}

function applyFilters() {
  const maktab = g('sl-maktab-filter').value;
  const search = g('sl-search').value.toLowerCase().trim();

  FILTERED_LEADS = LEADS.filter(l => {
    if (maktab && (l.maktab_nomi || l.hudud || '') !== maktab) return false;
    if (search) {
      const fish = [l.oquvchi_familiya, l.oquvchi_ismi].filter(Boolean).join(' ');
      const full = `${fish} ${l.telefon || ''} ${l.telefon2 || ''}`.toLowerCase();
      if (!full.includes(search)) return false;
    }
    return true;
  });

  renderStats();
  renderLeads();
}

function clearSearch() {
  const inp = g('sl-search');
  if (inp) { inp.value = ''; inp.focus(); }
  updateSearchClear();
  applyFilters();
}

function updateSearchClear() {
  const inp = g('sl-search');
  const btn = g('sl-search-clear');
  if (!inp || !btn) return;
  btn.style.display = inp.value.length > 0 ? 'block' : 'none';
}

function renderStats() {
  const counts = { yangi: 0, boglanildi: 0, royxatga_olindi: 0, bekor_qilindi: 0 };
  FILTERED_LEADS.forEach(l => { if (counts[l.holat] !== undefined) counts[l.holat]++; });

  g('sl-stats').innerHTML = `
    <div class="sl-stat-card"><div class="num">${FILTERED_LEADS.length}</div><div class="lbl">Jami</div></div>
    <div class="sl-stat-card"><div class="num" style="color:#2563eb;">${counts.yangi}</div><div class="lbl">Yangi</div></div>
    <div class="sl-stat-card"><div class="num" style="color:#d97706;">${counts.boglanildi}</div><div class="lbl">Bog'lanildi</div></div>
    <div class="sl-stat-card"><div class="num" style="color:#16a34a;">${counts.royxatga_olindi}</div><div class="lbl">Ro'yxatga olindi</div></div>
    <div class="sl-stat-card"><div class="num" style="color:#dc2626;">${counts.bekor_qilindi}</div><div class="lbl">Bekor qilindi</div></div>
  `;
  updateFrozenOffset();
}

function renderLeads() {
  const tbody   = g('sl-leads-tbody');
  const emptyEl = g('sl-leads-empty');

  if (!FILTERED_LEADS.length) {
    tbody.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  tbody.innerHTML = FILTERED_LEADS.map(l => {
    const holatInfo = HOLAT_LABELS[l.holat] || HOLAT_LABELS.yangi;
    const holatOptions = Object.entries(HOLAT_LABELS).map(([key, info]) =>
      `<option value="${key}" ${l.holat === key ? 'selected' : ''}>${info.text}</option>`
    ).join('');

    return `<tr>
      <td style="font-weight:600;">${esc(l.ism)}</td>
      <td>
        <a href="tel:${esc(l.telefon)}" style="color:#2563eb;text-decoration:none;font-weight:600;">${esc(l.telefon)}</a>
        ${l.telefon2 ? `<br><a href="tel:${esc(l.telefon2)}" style="color:#6b7280;text-decoration:none;font-size:12px;">${esc(l.telefon2)}</a>` : ''}
      </td>
      <td>${esc([l.oquvchi_familiya, l.oquvchi_ismi].filter(Boolean).join(' ') || '—')}</td>
      <td>${esc(l.maktab_nomi || l.hudud || '—')}</td>
      <td>${esc(l.sinf || '—')}</td>
      <td style="font-size:12px;color:#9ca3af;white-space:nowrap;">${formatDate(l.yaratilgan)}</td>
      <td>
        <select onchange="updateHolat(${l.id}, this)"
          style="padding:5px 6px;border-radius:8px;border:1.5px solid ${holatInfo.color}33;background:${holatInfo.bg};color:${holatInfo.color};font-size:12px;font-weight:600;">
          ${holatOptions}
        </select>
      </td>
      <td>
        <textarea class="sl-qaydnoma-input" rows="1" spellcheck="false"
          placeholder="Eslatma…" onblur="updateQaydnoma(${l.id}, this.value, this)"
          oninput="autosizeQaydnoma(this)"
          style="width:300px;padding:5px 6px;border:none;border-radius:8px;font-size:12px;font-family:inherit;background:#fff;color:#1a1917;color-scheme:light;resize:none;overflow:hidden;white-space:pre-wrap;word-break:break-word;line-height:1.35;display:block;outline:none;box-shadow:none;">${esc(l.qaydnoma || '')}</textarea>
      </td>
      <td>
        <span class="sl-vaqt-display" id="sl-vaqt-disp-${l.id}"
          onclick="editVaqt(${l.id}, '${toDateOnly(l.gaplashilgan_vaqt)}')"
          style="cursor:pointer;font-size:12px;color:${l.gaplashilgan_vaqt ? '#1a1917' : '#9ca3af'};white-space:nowrap;border-bottom:1px dashed var(--border);padding-bottom:1px;">${l.gaplashilgan_vaqt ? formatDateOnly(l.gaplashilgan_vaqt) : 'Belgilash…'}</span>
      </td>
    </tr>`;
  }).join('');

  // Mavjud (uzun) qaydnoma matnlari uchun balandlikni darhol moslashtiramiz
  tbody.querySelectorAll('.sl-qaydnoma-input').forEach(autosizeQaydnoma);
}

// ─── Qaydnoma matn maydonini avtomatik kengaytirish (Word'dagidek qatorga tushadi) ───
function autosizeQaydnoma(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// ─── Gaplashilgan sana (mijoz bilan aloqa qilingan sana) ─────────────────────
// Faqat SANA saqlanadi, vaqt kerak emas. Postgres timestamp'ni <input type="date">
// kutgan "YYYY-MM-DD" formatiga o'giradi.
function toDateOnly(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateOnly(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${OY_NOMLARI[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// Ustunga bosilganda formatlangan matn o'rniga tahrirlash uchun sana inputi chiqadi.
function editVaqt(id, currentValue) {
  const disp = g(`sl-vaqt-disp-${id}`);
  if (!disp || disp.tagName === 'INPUT') return;

  const inp = document.createElement('input');
  inp.type  = 'date';
  inp.id    = `sl-vaqt-disp-${id}`;
  inp.className = 'sl-vaqt-input';
  inp.value = currentValue;
  inp.style.cssText = 'padding:5px 6px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit;background:#fff;color:#1a1917;color-scheme:light;';
  inp.onblur = () => updateGaplashilganVaqt(id, inp.value);

  disp.replaceWith(inp);
  inp.focus();
  if (inp.showPicker) { try { inp.showPicker(); } catch (e) {} }
}

async function updateGaplashilganVaqt(id, value) {
  const inp = g(`sl-vaqt-disp-${id}`);
  try {
    const r = await api.updateLead({ id, gaplashilgan_vaqt: value || null });
    if (r.ok) {
      const lead = LEADS.find(l => l.id === id);
      if (lead) lead.gaplashilgan_vaqt = value || null;
    } else {
      alert('❌ ' + r.error);
    }
  } catch (e) {
    alert('❌ Server bilan bogʻlanib boʻlmadi');
  }
  // Har qanday holatda ham inputni yana formatlangan matnga (SANA ustuni kabi) qaytaramiz
  if (inp && inp.tagName === 'INPUT') {
    const lead = LEADS.find(l => l.id === id);
    const span = document.createElement('span');
    span.className = 'sl-vaqt-display';
    span.id = `sl-vaqt-disp-${id}`;
    span.onclick = () => editVaqt(id, toDateOnly(lead ? lead.gaplashilgan_vaqt : null));
    span.style.cssText = `cursor:pointer;font-size:12px;color:${lead && lead.gaplashilgan_vaqt ? '#1a1917' : '#9ca3af'};white-space:nowrap;border-bottom:1px dashed var(--border);padding-bottom:1px;`;
    span.textContent = lead && lead.gaplashilgan_vaqt ? formatDateOnly(lead.gaplashilgan_vaqt) : 'Belgilash…';
    inp.replaceWith(span);
  }
}

async function updateQaydnoma(id, qaydnoma, inputEl) {
  try {
    const r = await api.updateLead({ id, qaydnoma });
    if (r.ok) {
      const lead = LEADS.find(l => l.id === id);
      if (lead) lead.qaydnoma = qaydnoma;
      if (inputEl) {
        inputEl.style.borderColor = '#16a34a';
        setTimeout(() => { inputEl.style.borderColor = ''; }, 800);
      }
    } else {
      alert('❌ ' + r.error);
    }
  } catch (e) {
    alert('❌ Xatolik: ' + e.message);
  }
}

async function updateHolat(id, selectEl) {
  const lead     = LEADS.find(l => l.id === id);
  const newHolat = selectEl.value;
  const oldHolat = lead ? lead.holat : null;

  if (lead && oldHolat !== newHolat) {
    const maktab = lead.maktab_nomi || lead.hudud || '—';
    const sinf   = lead.sinf || '—';
    const fish   = [lead.oquvchi_familiya, lead.oquvchi_ismi].filter(Boolean).join(' ') || '—';
    const msg = `${maktab} ${sinf} o'quvchisi ${fish} ning ariza holatining o'zgarishini tasdiqlaysizmi ?`;
    if (!confirm(msg)) {
      selectEl.value = oldHolat; // eski holatga qaytarish
      return;
    }
  }

  const holat = newHolat;
  try {
    const r = await api.updateLead({ id, holat, biriktirilgan: U && U.id ? U.id : undefined });
    if (r.ok) {
      if (lead) lead.holat = holat;
      renderStats();
    } else {
      alert('❌ ' + r.error);
      loadLeads();
    }
  } catch (e) {
    alert('❌ Xatolik: ' + e.message);
  }
}