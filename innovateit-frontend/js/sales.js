// ═══════════════════════════════════════════════════
//  InnovateIT — Sales Panel JS
// ═══════════════════════════════════════════════════

let U = null;       // { username, ism }
let LEADS = [];

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

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
         ' ' + d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

function togglePw() {
  const inp = g('inp-parol');
  const eye = g('pw-eye');
  if (inp.type === 'password') { inp.type = 'text'; eye.textContent = '🙈'; }
  else                          { inp.type = 'password'; eye.textContent = '👁'; }
}

// ─── Kirish ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  try {
    const saved = localStorage.getItem('iit_sales_u');
    if (saved && api.isLoggedIn()) {
      U = JSON.parse(saved);
      showApp();
    } else {
      localStorage.removeItem('iit_sales_u');
    }
  } catch (e) { localStorage.removeItem('iit_sales_u'); }

  g('inp-parol').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  g('inp-username').addEventListener('keydown', e => { if (e.key === 'Enter') g('inp-parol').focus(); });
});

async function doLogin() {
  const username = g('inp-username').value.trim();
  const parol    = g('inp-parol').value;
  if (!username || !parol) return;

  const btn = g('login-btn');
  btn.disabled = true; btn.textContent = 'Tekshirilmoqda…';
  g('login-err').style.display = 'none';

  try {
    const r = await api.loginSales({ username, parol });
    if (r.ok) {
      U = { username, ism: r.ism, id: r.id };
      localStorage.setItem('iit_sales_u', JSON.stringify(U));
      showApp();
    } else {
      g('login-err').textContent = '❌ ' + (r.error || "Username yoki parol noto'g'ri");
      g('login-err').style.display = 'block';
    }
  } catch (e) {
    g('login-err').textContent = '❌ Ulanishda xatolik';
    g('login-err').style.display = 'block';
  }
  btn.disabled = false; btn.textContent = 'Kirish';
}

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
      renderStats();
      renderLeads();
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

function renderStats() {
  const counts = { yangi: 0, boglanildi: 0, royxatga_olindi: 0, bekor_qilindi: 0 };
  LEADS.forEach(l => { if (counts[l.holat] !== undefined) counts[l.holat]++; });

  g('sl-stats').innerHTML = `
    <div class="sl-stat-card"><div class="num">${LEADS.length}</div><div class="lbl">Jami</div></div>
    <div class="sl-stat-card"><div class="num" style="color:#2563eb;">${counts.yangi}</div><div class="lbl">Yangi</div></div>
    <div class="sl-stat-card"><div class="num" style="color:#d97706;">${counts.boglanildi}</div><div class="lbl">Bog'lanildi</div></div>
    <div class="sl-stat-card"><div class="num" style="color:#16a34a;">${counts.royxatga_olindi}</div><div class="lbl">Ro'yxatga olindi</div></div>
  `;
}

function renderLeads() {
  const tbody   = g('sl-leads-tbody');
  const emptyEl = g('sl-leads-empty');

  if (!LEADS.length) {
    tbody.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  tbody.innerHTML = LEADS.map(l => {
    const holatInfo = HOLAT_LABELS[l.holat] || HOLAT_LABELS.yangi;
    const holatOptions = Object.entries(HOLAT_LABELS).map(([key, info]) =>
      `<option value="${key}" ${l.holat === key ? 'selected' : ''}>${info.text}</option>`
    ).join('');

    return `<tr>
      <td style="font-weight:600;">${esc(l.ism)}</td>
      <td><a href="tel:${esc(l.telefon)}" style="color:#2563eb;text-decoration:none;">${esc(l.telefon)}</a></td>
      <td>${esc(l.farzand_ismi || '—')}${l.sinf ? ` <span style="color:#9ca3af;">(${esc(l.sinf)})</span>` : ''}</td>
      <td>${esc(l.maktab_nomi || l.hudud || '—')}</td>
      <td style="max-width:220px;white-space:normal;color:#6b7280;">${esc(l.izoh || '—')}</td>
      <td>
        <select onchange="updateHolat(${l.id}, this.value)"
          style="padding:5px 8px;border-radius:8px;border:1.5px solid ${holatInfo.color}33;background:${holatInfo.bg};color:${holatInfo.color};font-size:12px;font-weight:600;">
          ${holatOptions}
        </select>
      </td>
      <td style="font-size:12px;color:#9ca3af;white-space:nowrap;">${formatDate(l.yaratilgan)}</td>
    </tr>`;
  }).join('');
}

async function updateHolat(id, holat) {
  try {
    const r = await api.updateLead({ id, holat, biriktirilgan: U && U.id ? U.id : undefined });
    if (r.ok) {
      const lead = LEADS.find(l => l.id === id);
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
