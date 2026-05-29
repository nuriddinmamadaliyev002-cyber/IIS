// ═══════════════════════════════════════════════════
//  InnovateIT School — Frontend JS  (v3.0)
//  + Boshlagan sana
//  + Nofaol o'quvchilar tizimi
// ═══════════════════════════════════════════════════


let U      = null;
let S      = [];
let ADMINS = [];
let viewingAdmin = null;

// ─── Sort holati ───
let sortField = null;   // 'ism' | 'maktab' | 'sinf' | null
let sortDir   = 'asc';  // 'asc' | 'desc'

// ─────────────────────────────────────────────
//  YUKLANGANDA
// ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Bugungi sana — max qilib o'rnatish
  const today = todayStr();
  ['f-boshlagan', 'e-boshlagan', 'nofaol-chiqgan'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.max = today;
  });
  // Nofaol chiqgan sana default = bugun
  const nc = document.getElementById('nofaol-chiqgan');
  if (nc) nc.value = today;

  // Telefon mask — o'quvchilar forması
  setupTel('f-tel',  'f-tel-hint');
  setupTel('f-tel2', 'f-tel2-hint');
  setupTel('e-tel',  'e-tel-hint');
  setupTel('e-tel2', 'e-tel2-hint');

  try {
    const saved = localStorage.getItem('iit_u');
    if (saved) { U = JSON.parse(saved); await showApp(); }
  } catch (e) { localStorage.removeItem('iit_u'); }

  g('inp-parol').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  g('inp-username').addEventListener('keydown', e => {
    if (e.key === 'Enter') g('inp-parol').focus();
  });
});

// ─────────────────────────────────────────────
//  LOGIN / LOGOUT
// ─────────────────────────────────────────────
async function doLogin() {
  const username = g('inp-username').value.trim();
  const parol    = g('inp-parol').value;
  if (!username || !parol) return;

  const btn = g('login-btn');
  btn.disabled = true; btn.textContent = 'Tekshirilmoqda…';

  try {
    // 1. Avval superadmin sifatida tekshiramiz
    const r = await api.login({ username, parol });
    if (r.ok) {
      U = { username, parol, ism: r.ism, isSuper: r.isSuper };
      localStorage.setItem('iit_u', JSON.stringify(U));
      showApp();
    } else {
      // 2. Maktab admini sifatida tekshiramiz
      const ra = await api.loginAdmin({ username, parol });
      if (ra.ok) {
        U = { username, parol, ism: ra.ism, isSuper: false, maktabId: ra.maktabId, maktabNomi: ra.maktabNomi };
        localStorage.setItem('iit_u', JSON.stringify(U));
        showApp();
      } else {
        // 3. Buxgalter sifatida tekshiramiz
        const rb = await api.loginBuxgalter({ username, parol });
        if (rb.ok) {
          localStorage.setItem('iit_bux_u', JSON.stringify({ username, parol, ism: rb.ism }));
          window.location.href = 'buxgalter.html';
        } else {
          // 4. Viewer sifatida tekshiramiz
          const rv = await api.loginViewer({ username, parol });
          if (rv.ok) {
            // token alahida innovateit_viewer_token ga saqlanadi (api.loginViewer ichida)
            localStorage.setItem('iit_viewer_u', JSON.stringify({ username, ism: rv.ism }));
            window.location.href = 'portfolio-viewer.html';
          } else {
            showErr(g('login-err'), "Username yoki parol noto'g'ri");
          }
        }
      }
    }
  } catch (e) {
    showErr(g('login-err'), 'Ulanishda xatolik');
  }
  btn.disabled = false; btn.textContent = 'Kirish';
}

function showErr(el, msg) {
  el.textContent = '❌ ' + msg;
  el.style.display = 'block';
}

function doLogout() {
  U = null; S = []; ADMINS = []; viewingAdmin = null;
  localStorage.removeItem('iit_u');
  document.body.classList.remove('super-admin');
  g('app').style.display = 'none';
  g('login-screen').style.display = 'flex';
  g('inp-username').value = '';
  g('inp-parol').value    = '';
  g('login-err').style.display = 'none';
}

// ─────────────────────────────────────────────
//  APP KO'RINISHI
// ─────────────────────────────────────────────
async function showApp() {
  g('login-screen').style.display = 'none';
  g('app').style.display = 'block';

  const b = g('admin-badge');
  b.textContent = U.ism;

  // Body'ga super-admin class qo'shish/olib tashlash
  if (U.isSuper) {
    document.body.classList.add('super-admin');
    b.classList.add('super');
    b.textContent = '⭐ ' + U.ism;
    g('tabs-row').style.display     = 'flex';
    g('admin-col').style.display    = '';
    g('admin-selector-wrap').style.display = 'flex';
    const amalCol = g('amal-col'); if(amalCol) amalCol.style.display = 'none';
    g('btn-davomat').style.display   = 'none';
    g('btn-teachers').style.display  = 'none';  // Superadmin uchun tab ichida bor
    g('btn-nofaol').style.display    = '';
    g('add-student-form').style.display = 'none';
    await loadAdmins();
    buildAdminSelector();
  } else {
    document.body.classList.remove('super-admin');
    // Oddiy admin - selector va tabs yashiriladi
    g('tabs-row').style.display = 'none';
    g('admin-selector-wrap').style.display = 'none';
    g('btn-davomat').style.display  = '';
    g('btn-teachers').style.display = '';
    g('btn-nofaol').style.display   = '';
    g('add-student-form').style.display = 'block';
  }

  await loadStudents();

  // (portfolio tab olib tashlandi — index.html dan)
}

function switchTab(t) {
  const allTabs = ['s', 'a', 'b', 'm', 'sr', 'oq', 'pf'];
  allTabs.forEach(id => {
    const el = g('tab-' + id);
    if (el) el.style.display = (t === id) ? 'block' : 'none';
  });
  document.querySelectorAll('.tab-btn').forEach((b, i) =>
    b.classList.toggle('active', allTabs[i] === t)
  );
  if (t === 'b')  loadBuxgalterlar();
  if (t === 'm')  loadMaktablar();
  if (t === 'sr' && typeof loadSorovlar === 'function') loadSorovlar();
  if (t === 'oq') loadTeachersTab();
  if (t === 'pf') loadPortfolioTab();
}

// ─────────────────────────────────────────────
//  SUPER ADMIN: ADMIN SELECTOR
// ─────────────────────────────────────────────
function buildAdminSelector() {
  const sel = g('admin-selector');
  sel.innerHTML = '<option value="">👁 Barcha o\'quvchilar</option>' +
    ADMINS.map(a => `<option value="${esc(a.username)}">${a.ism} (@${a.username})</option>`).join('');
  sel.value = viewingAdmin ? viewingAdmin.username : '';
}

async function onAdminSelect() {
  const sel = g('admin-selector');
  const val = sel.value;

  if (!val) {
    viewingAdmin = null;
    g('btn-davomat').style.display   = 'none';
    g('btn-teachers').style.display  = 'none';  // Tab ichida bor
    g('add-student-form').style.display = 'none';
  } else {
    const found = ADMINS.find(a => a.username === val);
    viewingAdmin = found ? { username: found.username, ism: found.ism, parol: found.parol } : null;
    g('btn-davomat').style.display   = '';
    g('btn-teachers').style.display  = 'none';  // Tab ichida bor
    g('add-student-form').style.display = 'block';
  }

  await loadStudents();
}

// ─────────────────────────────────────────────
//  O'QUVCHILAR
// ─────────────────────────────────────────────
async function loadStudents() {
  g('loading-ov').style.display = 'flex';
  try {
    const d = await api.getStudents({ username: U.username, parol: U.parol });
    if (d.ok) {
      let students = d.students;
      if (U.isSuper && viewingAdmin) {
        students = students.filter(s => s.admin === viewingAdmin.username);
      }
      S = students;
      S.forEach((s, i) => s.ri = i);
      updMaktabF();
      applyFilters();
      g('total-count').textContent = S.length + " o'quvchi";
    }
  } catch (e) { toast("❌ Ma'lumotlar yuklanmadi", 'error'); }
  g('loading-ov').style.display = 'none';
}

async function addStudent() {
  const ism      = g('f-ism').value.trim();
  const fam      = g('f-familiya').value.trim();
  const maktab   = getM('f-maktab');
  const sinf     = g('f-sinf').value;
  const tel      = g('f-tel').value.trim();
  const tel2     = g('f-tel2').value.trim();
  const manzil   = g('f-manzil').value.trim();
  const kun      = String(g('f-kun').value || '').padStart(2, '0');
  const oy       = g('f-oy').value;
  const yil      = g('f-yil').value;
  const boshlagan = g('f-boshlagan').value;

  if (yil && (yil < 2009 || yil > 2019)) { toast("⚠️ Yil 2009–2019 bo'lishi kerak", 'error'); return; }

  // Tug'ilgan sana: agar bitta maydon to'ldirilgan bo'lsa — barchasi to'ldirilishi shart
  const tugFilledCount = [kun && kun !== '00', oy, yil].filter(Boolean).length;
  if (tugFilledCount > 0 && tugFilledCount < 3) {
    if (!kun || kun === '00') { toast("⚠️ Tug'ilgan kunni kiriting", 'error'); g('f-kun').classList.add('err'); return; }
    if (!oy)                  { toast("⚠️ Tug'ilgan oyni tanlang",   'error'); g('f-oy').classList.add('err');  return; }
    if (!yil)                 { toast("⚠️ Tug'ilgan yilni kiriting", 'error'); g('f-yil').classList.add('err'); return; }
  }

  if (yil && oy && kun) g('f-tug').value = yil + '-' + oy + '-' + kun;
  const tug = g('f-tug').value;

  if (!ism || !fam) { toast("⚠️ Ism va familiya kiriting", 'error'); return; }
  if (!maktab)      { toast("⚠️ Maktab raqami 1–99", 'error'); g('f-maktab').classList.add('err'); return; }
  if (!sinf)        { toast("⚠️ Sinf tanlang", 'error'); return; }
  if (!tel)         { toast("⚠️ Telefon kiriting", 'error'); return; }
  if (!isTelOk(tel))  { toast("⚠️ Telefon formati noto'g'ri (+998 XX XXX XX XX)", 'error'); return; }
  if (tel2 && !isTelOk(tel2)) { toast("⚠️ Qo'sh. telefon formati noto'g'ri", 'error'); return; }
  // Kelajak sanani tekshirish (agar kiritilgan bo'lsa)
  if (boshlagan && boshlagan > todayStr()) { toast("⚠️ Boshlagan sana bugundan kech bo'lmasligi kerak", 'error'); return; }

  bl('submit-btn', 'spinner', 'btn-txt', true, 'Saqlanmoqda…');
  const actingUser  = (U.isSuper && viewingAdmin) ? viewingAdmin.username : U.username;
  const actingParol = (U.isSuper && viewingAdmin) ? viewingAdmin.parol    : U.parol;
  try {
    const r = await api.addStudent({
      username: actingUser, parol: actingParol,
      ism, familiya: fam, maktab, sinf,
      telefon: tel, telefon2: tel2, manzil, tug, boshlagan,
      maktabInfo: maktab ? String(maktab) + '-maktab' : '',
      date: new Date().toLocaleDateString('uz-UZ')
    });
    if (r.ok) { clearF(); await loadStudents(); toast("✅ O'quvchi qo'shildi!", 'success'); }
    else toast('❌ ' + r.error, 'error');
  } catch (e) { toast('❌ Xatolik', 'error'); }
  bl('submit-btn', 'spinner', 'btn-txt', false, 'Saqlash');
}

function toggleClearBtn() {
  const input = g('f-search');
  const btn   = g('f-search-clear');
  if (!input || !btn) return;
  btn.style.display = input.value.length > 0 ? 'block' : 'none';
}

function clearSearch() {
  const input = g('f-search');
  const btn   = g('f-search-clear');
  if (!input) return;
  input.value = '';
  if (btn) btn.style.display = 'none';
  applyFilters();
}

function applyFilters() {
  const q  = (g('f-search').value || '').toLowerCase();
  const fm = g('f-maktab-f').value;
  const fs = g('f-sinf-f').value;
  let d = S.filter(s =>
    (!q  || (s.ism + ' ' + s.familiya + ' ' + s.telefon).toLowerCase().includes(q)) &&
    (!fm || String(s.maktab) === String(fm)) &&
    (!fs || s.sinf === fs)
  );

  // ── Saralash (sort) ──
  if (sortField) {
    d = [...d].sort((a, b) => {
      let va, vb;
      if (sortField === 'ism') {
        va = (a.familiya + ' ' + a.ism).toLowerCase();
        vb = (b.familiya + ' ' + b.ism).toLowerCase();
        return sortDir === 'asc' ? va.localeCompare(vb, 'uz') : vb.localeCompare(va, 'uz');
      }
      if (sortField === 'maktab') {
        va = Number(a.maktab) || 0;
        vb = Number(b.maktab) || 0;
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      if (sortField === 'sinf') {
        // "5-sinf" → 5 soniga aylantirish
        va = parseInt(a.sinf) || 0;
        vb = parseInt(b.sinf) || 0;
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      return 0;
    });
  }

  renderTbl(d);
  renderMob(d);
}

// ─── Sort toggle ───────────────────────────────────
function toggleSort(field) {
  if (sortField === field) {
    // Bir xil ustun: yo'nalishni o'zgartir yoki bekor qil
    if (sortDir === 'asc')  { sortDir = 'desc'; }
    else                    { sortField = null; sortDir = 'asc'; }
  } else {
    sortField = field;
    sortDir   = 'asc';
  }
  updateSortHeaders();
  applyFilters();
}

function updateSortHeaders() {
  ['ism', 'maktab', 'sinf'].forEach(f => {
    const th = g('sort-' + f);
    if (!th) return;
    th.classList.remove('sort-asc', 'sort-desc');
    const icon = th.querySelector('.sort-icon');
    if (sortField === f) {
      th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      if (icon) icon.textContent = sortDir === 'asc' ? '↑' : '↓';
    } else {
      if (icon) icon.textContent = '⇅';
    }
  });
}

function renderTbl(d) {
  const tb  = g('tbl-body');
  const sup = U && U.isSuper;
  if (!d.length) {
    tb.innerHTML = `<tr><td colspan="12">
      <div class="empty-state"><div class="empty-state-icon">📋</div><p>O'quvchi topilmadi</p></div>
    </td></tr>`;
    return;
  }
  tb.innerHTML = d.map((s, i) => {
    const maktabKo = (U && U.isSuper)
      ? (s.maktab || '—')
      : (s.maktabInfo || s.maktab || '—');
    return `<tr>
    <td class="mono">${i + 1}</td>
    <td><strong>${s.familiya}</strong> ${s.ism}</td>
    <td><span class="maktab-badge">${maktabKo}</span></td>
    <td><span class="sinf-badge">${s.sinf || '—'}</span></td>
    <td class="mono">${s.telefon || '—'}</td>
    <td class="mono">${s.telefon2 || '—'}</td>
    <td class="mono">${fTug(s.tug)}</td>
    <td>${s.manzil || '—'}</td>
    ${(U && U.isSuper) ? `<td class="mono" style="font-size:11px;">${s.admin || '—'}</td>` : ''}
    <td class="mono">${fDate(s.boshlagan)}</td>
    <td class="mono">${fDate(s.date)}</td>
    ${!(U && U.isSuper) ? `<td><div style="display:flex;gap:6px;">
      <button class="btn-action" onclick="openES(${s.ri})">✏️</button>
      <button class="btn-action btn-action-del" onclick="openNofaolModal(${s.ri})">🗑️</button>
    </div></td>` : ''}
  </tr>`;
  }).join('');
  // Sticky header yangilash
  if (typeof window._initStickyHeader === 'function') setTimeout(window._initStickyHeader, 50);
}

function renderMob(d) {
  const el  = g('mob-cards');
  const sup = U && U.isSuper;
  if (!d.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><p>O\'quvchi topilmadi</p></div>';
    return;
  }
  el.innerHTML = d.map((s, i) => `
    <div class="sc">
      <div class="sc-header">
        <div>
          <div class="sc-name">${s.familiya} ${s.ism}</div>
          <div class="sc-num">#${i + 1}</div>
          <div class="sc-tags">
            <span class="maktab-badge">${(sup ? (s.maktab || '—') : (s.maktabInfo || s.maktab || '—'))}</span>
            <span class="sinf-badge">${s.sinf || '—'}</span>
          </div>
        </div>
        ${!sup ? `<div class="sc-btns">
          <button class="btn-action" onclick="openES(${s.ri})">✏️</button>
          <button class="btn-action btn-action-del" onclick="openNofaolModal(${s.ri})">🗑️</button>
        </div>` : ''}
      </div>
      <div class="sc-body">
        <div class="sc-row"><span class="sc-lbl">📞 Telefon</span><span class="sc-val m">${s.telefon || '—'}</span></div>
        <div class="sc-row"><span class="sc-lbl">📞 Qo'sh.</span><span class="sc-val m">${s.telefon2 || '—'}</span></div>
        <div class="sc-row"><span class="sc-lbl">🎂 Tug'ilgan</span><span class="sc-val m">${fTug(s.tug)}</span></div>
        <div class="sc-row"><span class="sc-lbl">📅 Boshlagan</span><span class="sc-val m">${fDate(s.boshlagan)}</span></div>
        <div class="sc-row"><span class="sc-lbl">📍 Manzil</span><span class="sc-val">${s.manzil || '—'}</span></div>
        ${sup ? `<div class="sc-row sc-full"><span class="sc-lbl">👤 Admin</span><span class="sc-val m" style="font-size:11px;">${s.admin || '—'}</span></div>` : ''}
        <div class="sc-row"><span class="sc-lbl">🗓 Qo'shilgan</span><span class="sc-val m">${fDate(s.date)}</span></div>
      </div>
    </div>`).join('');
}

function updMaktabF() {
  const sel  = g('f-maktab-f'), cur = sel.value;
  const list = [...new Set(S.map(s => s.maktab).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  sel.innerHTML = '<option value="">Barcha maktab</option>' +
    list.map(m => `<option${String(m) === String(cur) ? ' selected' : ''}>${m}</option>`).join('');
}

// ── O'quvchi tahrirlash ──
let eIdx = null;

function openES(idx) {
  const s = S[idx]; if (!s) return; eIdx = idx;
  g('e-ism').value      = s.ism      || '';
  g('e-familiya').value = s.familiya || '';
  // Maktab raqamini maktabInfo dan ham olish mumkin (masalan "15-maktab" → 15)
  const maktabRaqam = s.maktab || (s.maktabInfo ? parseInt(s.maktabInfo) || '' : '');
  g('e-maktab').value   = maktabRaqam;
  g('e-sinf').value     = s.sinf     || '';
  g('e-tel').value      = s.telefon  ? fmtTel(s.telefon)  : '';
  g('e-tel2').value     = s.telefon2 ? fmtTel(s.telefon2) : '';
  validateTel(g('e-tel'),  g('e-tel-hint'));
  validateTel(g('e-tel2'), g('e-tel2-hint'));
  g('e-manzil').value   = s.manzil   || '';
  g('e-boshlagan').value = s.boshlagan ? String(s.boshlagan).substring(0, 10) : '';

  if (s.tug) {
    const d = new Date(s.tug);
    if (!isNaN(d)) {
      g('e-kun').value = d.getDate();
      g('e-oy').value  = String(d.getMonth() + 1).padStart(2, '0');
      g('e-yil').value = d.getFullYear();
      g('e-tug').value = d.toISOString().split('T')[0];
    }
  } else {
    ['e-kun', 'e-oy', 'e-yil', 'e-tug'].forEach(id => g(id).value = '');
  }
  g('es-modal').style.display = 'flex';
}

function closeES() {
  g('es-modal').style.display = 'none'; eIdx = null;
  ['e-tel','e-tel2'].forEach(id => { const el = g(id); if (el) el.className = 'field-input tel-input'; });
  ['e-tel-hint','e-tel2-hint'].forEach(id => { const el = g(id); if (el) { el.textContent = ''; el.className = 'tel-hint'; } });
}

async function saveES() {
  const ism      = g('e-ism').value.trim();
  const fam      = g('e-familiya').value.trim();
  const maktab   = getM('e-maktab');
  const sinf     = g('e-sinf').value;
  const tel      = g('e-tel').value.trim();
  const tel2     = g('e-tel2').value.trim();
  const manzil   = g('e-manzil').value.trim();
  const boshlagan = g('e-boshlagan').value;
  const kun      = String(g('e-kun').value || '').padStart(2, '0');
  const oy       = g('e-oy').value;
  const yil      = g('e-yil').value;

  if (yil && (yil < 2009 || yil > 2019)) { toast("⚠️ Yil 2009–2019 bo'lishi kerak", 'error'); return; }

  // Tug'ilgan sana: agar bitta maydon to'ldirilgan bo'lsa — barchasi to'ldirilishi shart
  const tugFilledCount = [kun && kun !== '00', oy, yil].filter(Boolean).length;
  if (tugFilledCount > 0 && tugFilledCount < 3) {
    if (!kun || kun === '00') { toast("⚠️ Tug'ilgan kunni kiriting", 'error'); g('e-kun').classList.add('err'); return; }
    if (!oy)                  { toast("⚠️ Tug'ilgan oyni tanlang",   'error'); g('e-oy').classList.add('err');  return; }
    if (!yil)                 { toast("⚠️ Tug'ilgan yilni kiriting", 'error'); g('e-yil').classList.add('err'); return; }
  }

  if (yil && oy && kun) g('e-tug').value = yil + '-' + oy + '-' + kun;
  const tug = g('e-tug').value;

  if (!ism || !fam) { toast("⚠️ Ism va familiya kiriting", 'error'); return; }
  if (!maktab)      { toast("⚠️ Maktab raqami 1–99", 'error'); return; }
  if (!sinf)        { toast("⚠️ Sinf tanlang", 'error'); return; }
  if (!tel)         { toast("⚠️ Telefon kiriting", 'error'); return; }
  if (!isTelOk(tel))  { toast("⚠️ Telefon formati noto'g'ri (+998 XX XXX XX XX)", 'error'); return; }
  if (tel2 && !isTelOk(tel2)) { toast("⚠️ Qo'sh. telefon formati noto'g'ri", 'error'); return; }
  if (boshlagan && boshlagan > todayStr()) { toast("⚠️ Boshlagan sana bugundan kech bo'lmasligi kerak", 'error'); return; }

  const s = S[eIdx];
  bl('es-save', 'es-spinner', 'es-btn-txt', true, 'Saqlanmoqda…');
  try {
    const r = await api.editStudent({
      username: U.username, parol: U.parol,
      oldIsm: s.ism, oldFamiliya: s.familiya,
      ism, familiya: fam, maktab, sinf,
      telefon: tel, telefon2: tel2, manzil, tug, boshlagan,
      maktabInfo: maktab ? String(maktab) + '-maktab' : ''
    });
    if (r.ok) { closeES(); await loadStudents(); toast("✅ O'quvchi yangilandi!", 'success'); }
    else toast('❌ ' + r.error, 'error');
  } catch (e) { toast('❌ Xatolik', 'error'); }
  bl('es-save', 'es-spinner', 'es-btn-txt', false, 'Saqlash');
}

// ─────────────────────────────────────────────
//  ✅ YANGI: NOFAOL MODAL
// ─────────────────────────────────────────────
let nofaolIdx = null;

function openNofaolModal(idx) {
  const s = S[idx]; if (!s) return;
  nofaolIdx = idx;
  g('nofaol-name-display').textContent = s.ism + ' ' + s.familiya;
  // Chiqgan sana default = bugun
  g('nofaol-chiqgan').value = todayStr();
  g('nofaol-chiqgan').max   = todayStr();
  g('nofaol-modal').style.display = 'flex';
}

const IZOH_MIN = 10;

function onNofaolIzohInput(el) {
  const len = el.value.trim().length;
  const counter = g('nofaol-izoh-counter');
  const hint    = g('nofaol-izoh-hint');
  const ok      = g('nofaol-izoh-ok');

  counter.textContent = len + ' / ' + IZOH_MIN + ' ta belgi minimum';

  if (len === 0) {
    el.classList.remove('field-error');
    counter.style.color = '#9ca3af';
    hint.style.display = 'none';
    ok.style.display   = 'none';
  } else if (len < IZOH_MIN) {
    el.classList.add('field-error');
    counter.style.color = '#dc2626';
    hint.style.display = 'block';
    ok.style.display   = 'none';
  } else {
    el.classList.remove('field-error');
    counter.style.color = '#16a34a';
    hint.style.display = 'none';
    ok.style.display   = 'block';
  }
}

function closeNofaolModal() {
  g('nofaol-modal').style.display = 'none';
  g('nofaol-izoh').value = '';
  g('nofaol-izoh').classList.remove('field-error');
  g('nofaol-izoh-hint').style.display = 'none';
  g('nofaol-izoh-ok').style.display   = 'none';
  g('nofaol-izoh-counter').textContent = '0 / ' + IZOH_MIN + ' ta belgi minimum';
  g('nofaol-izoh-counter').style.color = '#9ca3af';
  nofaolIdx = null;
}

async function confirmNofaol() {
  const s = S[nofaolIdx]; if (!s) return;
  const chiqganRaw = g('nofaol-chiqgan').value;
  const izoh    = (g('nofaol-izoh').value || '').trim();

  if (!chiqganRaw) { toast("⚠️ Safdan chiqgan sanani kiriting", 'error'); return; }
  if (chiqganRaw > todayStr()) { toast("⚠️ Sana bugundan kech bo'lmasligi kerak", 'error'); return; }
  // YYYY-MM-DD → DD.MM.YYYY formatiga o'tkazish (DB da bir xil format bo'lishi uchun)
  const chiqgan = chiqganRaw.includes('-')
    ? chiqganRaw.split('-').reverse().join('.')
    : chiqganRaw;
  if (!izoh) {
    g('nofaol-izoh').focus();
    g('nofaol-izoh').classList.add('field-error');
    g('nofaol-izoh-hint').style.display = 'block';
    g('nofaol-izoh-ok').style.display   = 'none';
    toast("⚠️ Chiqish sababini kiriting — majburiy maydon", 'error');
    return;
  }
  if (izoh.length < IZOH_MIN) {
    g('nofaol-izoh').focus();
    g('nofaol-izoh').classList.add('field-error');
    g('nofaol-izoh-hint').style.display = 'block';
    g('nofaol-izoh-ok').style.display   = 'none';
    toast("⚠️ Sabab kamida " + IZOH_MIN + " ta belgi bo'lishi kerak", 'error');
    return;
  }
  g('nofaol-izoh').classList.remove('field-error');
  g('nofaol-izoh-hint').style.display = 'none';

  g('nofaol-confirm-btn').disabled = true;
  g('nofaol-spinner').style.display = 'inline-block';
  g('nofaol-btn-txt').textContent = 'Saqlanmoqda…';

  try {
    const r = await api.moveToInactive({
      username: U.username, parol: U.parol,
      delIsm: s.ism, delFamiliya: s.familiya,
      chiqgan, izoh
    });
    if (r.ok) {
      closeNofaolModal();
      await loadStudents();
      toast("✅ O'quvchi nofaol ro'yxatga o'tkazildi", 'success');
    } else toast('❌ ' + r.error, 'error');
  } catch (e) { toast('❌ Xatolik', 'error'); }

  g('nofaol-confirm-btn').disabled = false;
  g('nofaol-spinner').style.display = 'none';
  g('nofaol-btn-txt').textContent = "Nofaolga o'tkazish";
}

// ─────────────────────────────────────────────
//  NOFAOL SAHIFAGA O'TISH ✅ YANGI
// ─────────────────────────────────────────────
function openNofaol() {
  // Super admin boshqa admin tanlagan bo'lsa, shu admin nomidan
  const isProxy = U.isSuper && viewingAdmin;
  const nofaolUser = {
    username:     isProxy ? viewingAdmin.username : U.username,
    parol:        isProxy ? viewingAdmin.parol    : U.parol,
    ism:          isProxy ? viewingAdmin.ism      : U.ism,
    isSuper:      U.isSuper && !viewingAdmin,
    isSuperProxy: !!isProxy
  };
  sessionStorage.setItem('iit_nofaol_user', JSON.stringify(nofaolUser));
  window.location.href = 'nofaol.html';
}

// ─────────────────────────────────────────────
//  ADMINLAR
// ─────────────────────────────────────────────
async function loadAdmins() {
  try {
    const [d, dm] = await Promise.all([
      api.getAdmins({ username: U.username, parol: U.parol }),
      api.getMaktablar()
    ]);
    if (d.ok) { ADMINS = d.admins; renderAdmins(d.admins); }
    // a-maktab-id selectni to'ldirish
    const sel = g('a-maktab-id');
    if (sel && dm.ok) {
      sel.innerHTML = '<option value="">— Tanlang —</option>' +
        (dm.maktablar || []).map(m =>
          `<option value="${m.id}">${esc(m.nomi)}</option>`
        ).join('');
    }
  } catch (e) {}
}

function renderAdmins(admins) {
  const el = g('admin-list');
  if (!admins.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👤</div><p>Admin yo\'q</p></div>';
    return;
  }
  el.innerHTML = admins.map(a => `
    <div class="admin-item">
      <div class="admin-info">
        <span class="admin-name">${a.familiya ? esc(a.familiya) + ' ' : ''}${esc(a.ism)}</span>
        <span class="admin-email">${esc(a.username)}</span>
        <span class="admin-ptag">🔑 ${a.parol || '—'}</span>
      </div>
      <div class="admin-acts">
        <button class="btn-action" onclick="openAE('${esc(a.username)}','${esc(a.ism)}','${esc(a.parol || '')}')">✏️</button>
        <button class="btn-small"  onclick="delA('${esc(a.username)}','${esc(a.familiya ? a.familiya + ' ' + a.ism : a.ism)}')">O'chirish</button>
      </div>
    </div>`).join('');
}

async function createAdmin() {
  const familiya = (g('a-familiya')?.value || '').trim();
  const ism      = g('a-ism').value.trim();
  const username = g('a-username').value.trim();
  const parol    = g('a-parol').value.trim();
  const maktabId = g('a-maktab-id')?.value || '';
  if (!ism || !username || !parol) { toast("⚠️ Barcha maydonlarni to'ldiring", 'error'); return; }

  bl(null, 'a-spinner', 'a-btn-txt', true, 'Yaratilmoqda…');
  try {
    const r = await api.createAdmin({
      username: U.username, parol: U.parol,
      newIsm: ism, newFamiliya: familiya, newUsername: username, newParol: parol,
      newMaktabId: maktabId || null
    });
    if (r.ok) {
      ['a-ism', 'a-username', 'a-parol'].forEach(id => g(id).value = '');
      if (g('a-familiya')) g('a-familiya').value = '';
      if (g('a-maktab-id')) g('a-maktab-id').value = '';
      toast('✅ Admin yaratildi!', 'success');
      await loadAdmins();
      buildAdminSelector();
    } else toast('❌ ' + r.error, 'error');
  } catch (e) { toast('❌ Xatolik', 'error'); }
  bl(null, 'a-spinner', 'a-btn-txt', false, 'Yaratish');
}

async function delA(username, ism) {
  if (!confirm(`"${ism}" o'chirilsinmi?`)) return;
  try {
    const r = await api.deleteAdmin({ username: U.username, parol: U.parol, deleteUsername: username });
    if (r.ok) {
      toast("✅ Admin o'chirildi", 'success');
      await loadAdmins();
      buildAdminSelector();
    } else toast('❌ ' + r.error, 'error');
  } catch (e) {}
}

let aeOld = null;

function openAE(username, ism, parol) {
  aeOld = username;
  g('ae-ism').value      = ism;
  g('ae-username').value = username;
  g('ae-parol').value    = '';
  g('ae-modal').style.display = 'flex';
}
function closeAE() { g('ae-modal').style.display = 'none'; aeOld = null; }

async function saveAE() {
  const ism      = g('ae-ism').value.trim();
  const username = g('ae-username').value.trim();
  const parol    = g('ae-parol').value.trim();
  if (!ism || !username) { toast("⚠️ Ism va username majburiy", 'error'); return; }

  bl('ae-save', 'ae-spinner', 'ae-btn-txt', true, 'Saqlanmoqda…');
  try {
    const r = await api.editAdmin({
      username: U.username, parol: U.parol,
      oldUsername: aeOld, newIsm: ism, newUsername: username, newParol: parol
    });
    if (r.ok) {
      closeAE();
      await loadAdmins();
      buildAdminSelector();
      toast('✅ Admin yangilandi!', 'success');
    } else toast('❌ ' + r.error, 'error');
  } catch (e) { toast('❌ Xatolik', 'error'); }
  bl('ae-save', 'ae-spinner', 'ae-btn-txt', false, 'Saqlash');
}

// ─────────────────────────────────────────────
//  O'QITUVCHILAR / DAVOMAT
// ─────────────────────────────────────────────
function openTeachers() {
  let teacherUser;
  if (!U.isSuper) {
    // Oddiy admin — o'zining maktabId si
    const adminMaktabId = U.maktabId || (ADMINS.find(a => a.username === U.username)?.maktab_id) || null;
    teacherUser = { username: U.username, parol: U.parol, ism: U.ism, isSuper: false, isSuperProxy: false, maktabId: adminMaktabId };
  } else if (viewingAdmin) {
    const adminMaktabId = viewingAdmin.maktab_id || null;
    teacherUser = { username: viewingAdmin.username, parol: viewingAdmin.parol, ism: viewingAdmin.ism, isSuper: false, isSuperProxy: true, superUsername: U.username, superParol: U.parol, superIsm: U.ism, maktabId: adminMaktabId };
  } else {
    teacherUser = { username: U.username, parol: U.parol, ism: U.ism, isSuper: true, adminsMap: JSON.stringify(ADMINS.map(a => ({ username: a.username, ism: a.ism, maktab_nomi: a.maktab_nomi || null }))) };
  }
  sessionStorage.setItem('iit_teacher_user', JSON.stringify(teacherUser));
  window.location.href = 'oqituvchilar.html';
}


// Portfolio tabidan viewer uchun oqituvchilar sahifasiga o'tish
function openTeachersFromViewer(viewerUsername, viewerIsm) {
  const teacherUser = {
    username:      U.username,
    parol:         U.parol,
    ism:           U.ism,
    isSuper:       true,
    fromPortfolio: true,
    viewerUsername,
    viewerIsm,
    adminsMap: JSON.stringify(ADMINS.map(a => ({ username: a.username, ism: a.ism, maktab_nomi: a.maktab_nomi || null })))
  };
  sessionStorage.setItem('iit_teacher_user', JSON.stringify(teacherUser));
  window.location.href = 'oqituvchilar.html';
}
window.openTeachersFromViewer = openTeachersFromViewer;
function openDavomat() {
  if (U.isSuper && !viewingAdmin) { toast('⚠️ Avval maktab tanlang!', 'error'); return; }
  const isProxy = U.isSuper && viewingAdmin;
  const davomatUser = {
    username:      isProxy ? viewingAdmin.username : U.username,
    parol:         isProxy ? viewingAdmin.parol    : U.parol,
    ism:           isProxy ? viewingAdmin.ism      : U.ism,
    isSuper:       false,
    isSuperProxy:  isProxy,
    superUsername: U.username,
    superParol:    U.parol,
    superIsm:      U.ism
  };
  sessionStorage.setItem('iit_davomat_user', JSON.stringify(davomatUser));
  window.location.href = 'davomat.html';
}

// ─────────────────────────────────────────────
//  YORDAMCHI FUNKSIYALAR
// ─────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function clearF() {
  ['f-ism','f-familiya','f-maktab','f-tel','f-tel2','f-manzil','f-tug','f-kun','f-yil','f-boshlagan'].forEach(id => {
    const e = g(id); e.value = ''; e.classList && e.classList.remove('err', 'tel-ok', 'tel-err');
  });
  g('f-oy').value = ''; g('f-sinf').value = '';
  ['f-tel-hint','f-tel2-hint'].forEach(id => {
    const el = g(id); if (el) { el.textContent = ''; el.className = 'tel-hint'; }
  });
}

function bl(btnId, spId, txtId, loading, txt) {
  if (btnId) g(btnId).disabled = loading;
  g(spId).style.display = loading ? 'inline-block' : 'none';
  g(txtId).textContent  = txt;
}

function togglePw(id) {
  const i = document.getElementById(id);
  const ic = document.getElementById('eye-' + id);
  const h  = i.type === 'password'; i.type = h ? 'text' : 'password';
  ic.innerHTML = h
    ? `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`
    : `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
       <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
       <line x1="1" y1="1" x2="23" y2="23"/>`;
}

function valM(inp) {
  let v = inp.value.replace(/\D/g, '');
  if (v.length > 2) v = v.slice(0, 2);
  inp.value = v;
  const n = parseInt(v);
  inp.classList.toggle('err', !!(v && (isNaN(n) || n < 1 || n > 99)));
}

function getM(id) {
  const v = document.getElementById(id).value.trim();
  const n = parseInt(v);
  return (!v || isNaN(n) || n < 1 || n > 99) ? null : String(n);
}

function g(id)  { return document.getElementById(id); }
function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

// ─── Telefon mask va validatsiya ───
function fmtTel(val) {
  const digits = val.replace(/\D/g, '');
  if (!digits) return '';
  let d = digits.startsWith('998') ? digits
        : digits.startsWith('0')   ? '998' + digits.slice(1)
        : '998' + digits;
  d = d.slice(0, 12);
  // Faqat mamlakat kodi qolgan bo'lsa (998 dan ortiq raqam yo'q) — bo'sh qaytaramiz
  if (d === '998') return '';
  let out = '';
  if (d.length > 0)  out = '+' + d.slice(0, 3);
  if (d.length > 3)  out += ' ' + d.slice(3, 5);
  if (d.length > 5)  out += ' ' + d.slice(5, 8);
  if (d.length > 8)  out += ' ' + d.slice(8, 10);
  if (d.length > 10) out += ' ' + d.slice(10, 12);
  return out;
}
function isTelOk(val) {
  const d = val.replace(/\D/g, '');
  return d.length === 12 && d.startsWith('998');
}
function validateTel(inp, hintEl) {
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) {
    inp.className = 'field-input tel-input';
    if (hintEl) { hintEl.className = 'tel-hint'; hintEl.textContent = ''; }
    return;
  }
  const ok = isTelOk(val);
  inp.className = 'field-input tel-input ' + (ok ? 'tel-ok' : 'tel-err');
  if (hintEl) {
    hintEl.className   = 'tel-hint ' + (ok ? 'ok' : 'err');
    hintEl.textContent = ok ? "✓ To'g'ri format" : "✗ +998 XX XXX XX XX formatida kiriting";
  }
}
function setupTel(inpId, hintId) {
  const inp  = g(inpId);
  const hint = g(hintId);
  if (!inp) return;
  inp.addEventListener('input', function() {
    const oldLen = this.value.length;
    const pos    = this.selectionStart;
    this.value   = fmtTel(this.value);
    const diff   = this.value.length - oldLen;
    try { this.setSelectionRange(pos + diff, pos + diff); } catch(e) {}
    validateTel(this, hint);
  });
  inp.addEventListener('blur', () => validateTel(inp, hint));
}

function fDate(v) {
  if (!v) return '—';
  const s = String(v).trim();
  if (!s || s === 'undefined' || s === 'null') return '—';
  const d = new Date(s);
  if (!isNaN(d)) return d.toLocaleDateString('uz-UZ');
  return s;
}

function fTug(v) {
  if (!v) return '—';
  const s = String(v);
  if (s.match(/^\d{4}-\d{2}-\d{2}/) || s.includes('T')) {
    const d = new Date(s); if (!isNaN(d)) return d.toLocaleDateString('uz-UZ');
  }
  return s.length >= 4 ? s.substring(0, 4) : s;
}

let toastT;
function toast(msg, type = '') {
  const t = g('toast');
  t.textContent = msg; t.className = 'toast show ' + type;
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ═══════════════════════════════════════════════════
//  BUXGALTERLAR (Superadmin tomonidan boshqarish)
// ═══════════════════════════════════════════════════

// Barcha buxgalterlar + biriktirilgan adminlar ma'lumoti
let BUX_DATA = { buxgalterlar: [], maktablar: [] };

async function loadBuxgalterlar() {
  const listEl = g('bux-list');
  listEl.innerHTML = '<div style="padding:16px;color:#7a7870;font-size:13px;">⏳ Yuklanmoqda…</div>';

  try {
    const r = await api.getBiriktirmalar({ username: U.username, parol: U.parol });
    if (!r.ok) { listEl.innerHTML = `<div style="color:#dc2626;padding:12px;font-size:13px;">❌ ${r.error}</div>`; return; }

    BUX_DATA = { buxgalterlar: r.buxgalterlar || [], maktablar: r.maktablar || [] };
    renderBuxgalterList();
  } catch(e) {
    listEl.innerHTML = `<div style="color:#dc2626;padding:12px;font-size:13px;">❌ Xatolik: ${e.message}</div>`;
  }
}

function renderBuxgalterList() {
  const listEl = g('bux-list');
  const { buxgalterlar, maktablar } = BUX_DATA;

  if (buxgalterlar.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💼</div><p>Buxgalterlar yo\'q</p></div>';
    return;
  }

  listEl.innerHTML = buxgalterlar.map(b => {
    // b.maktablar = [{id, nomi}, ...] — backend dan keladi
    const myMaktablar = Array.isArray(b.maktablar) ? b.maktablar : [];
    const myIds = new Set(myMaktablar.map(m => m.id));

    const maktabTags = myMaktablar.map(m =>
      `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 4px 2px 8px;border-radius:10px;background:#eff4ff;color:#2563eb;font-size:11px;font-weight:600;border:1px solid #bfdbfe;">
        ${esc(m.nomi)}
        <button onclick="ajratBuxMaktab(${b.id},${m.id})"
          title="Maktabni ajratish"
          style="width:16px;height:16px;border-radius:50%;border:none;background:#bfdbfe;
                 color:#1d4ed8;font-size:10px;cursor:pointer;padding:0;line-height:1;flex-shrink:0;">✕</button>
      </span>`
    ).join('');

    // Hali biriktirilmagan maktablar dropdown uchun
    const freeMaktablar = maktablar.filter(m => !myIds.has(m.id));
    const dropdownOpts = freeMaktablar.map(m =>
      `<option value="${m.id}">${esc(m.nomi)}</option>`
    ).join('');

    return `<div style="padding:14px 16px;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:200px;">
          <div style="width:36px;height:36px;border-radius:50%;background:#e0faf6;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">💼</div>
          <div>
            <div style="font-weight:600;font-size:14px;">${esc(b.ism)}</div>
            <div style="font-size:12px;color:#7a7870;font-family:'DM Mono',monospace;">@${esc(b.username)}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px;">
              🔑 <span style="font-family:'DM Mono',monospace;letter-spacing:.05em;">${esc(b.parol || '—')}</span>
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <button class="bux-edit-btn" onclick="openEditBux('${esc(b.username)}','${esc(b.ism)}')">
            ✏️ Tahrirlash
          </button>
          <button class="bux-del-btn" onclick="deleteBuxgalter('${esc(b.username)}','${esc(b.ism)}')">
            O'chirish
          </button>
        </div>
      </div>

      <!-- Biriktirilgan maktablar -->
      <div style="margin-top:10px;display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
        <span style="font-size:11px;color:#7a7870;font-weight:600;margin-right:4px;">Maktablar:</span>
        ${myMaktablar.length ? maktabTags : '<span style="font-size:11px;color:#9ca3af;">Biriktirilmagan</span>'}
      </div>

      <!-- Maktab biriktirish -->
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <select id="add-maktab-sel-${b.id}"
          style="padding:5px 8px;border-radius:7px;border:1.5px solid var(--border);
                 font-family:inherit;font-size:12px;background:var(--bg);flex:1;min-width:180px;">
          <option value="">+ Maktab biriktirish…</option>
          ${dropdownOpts}
        </select>
        <button class="bux-biriktiruv-btn" onclick="biriktirBuxMaktab(${b.id})">
          Biriktirish
        </button>
      </div>
    </div>`;
  }).join('');
}

async function createBuxgalter() {
  const ism      = (g('bux-ism')?.value      || '').trim();
  const username = (g('bux-username')?.value || '').trim();
  const parol    = (g('bux-parol')?.value    || '');
  const errEl    = g('bux-err');
  const btnTxt   = g('bux-btn-txt');
  const spinner  = g('bux-spinner');

  errEl.style.display = 'none';

  if (!ism)      { errEl.textContent = '❌ Ism kiritilmagan'; errEl.style.display = 'block'; return; }
  if (!username) { errEl.textContent = '❌ Username kiritilmagan'; errEl.style.display = 'block'; return; }
  if (!parol)    { errEl.textContent = '❌ Parol kiritilmagan'; errEl.style.display = 'block'; return; }
  if (parol.length < 6) { errEl.textContent = '❌ Parol kamida 6 ta belgi bo\'lishi kerak'; errEl.style.display = 'block'; return; }

  btnTxt.textContent = 'Saqlanmoqda…';
  if (spinner) spinner.style.display = 'inline-block';

  try {
    const r = await api.createBuxgalter({
      username: U.username, parol: U.parol,
      newIsm: ism, newUsername: username, newParol: parol
    });

    if (r.ok) {
      toast('✅ Buxgalter yaratildi', 'success');
      g('bux-ism').value      = '';
      g('bux-username').value = '';
      g('bux-parol').value    = '';
      loadBuxgalterlar();
    } else {
      errEl.textContent = '❌ ' + r.error;
      errEl.style.display = 'block';
    }
  } catch(e) {
    errEl.textContent = '❌ Xatolik: ' + e.message;
    errEl.style.display = 'block';
  }

  btnTxt.textContent = 'Yaratish';
  if (spinner) spinner.style.display = 'none';
}

async function deleteBuxgalter(username, ism) {
  if (!confirm(`"${ism}" buxgalterni o'chirmoqchimisiz?\n\nU buxgalter paneliga kira olmaydi.`)) return;

  try {
    const r = await api.deleteBuxgalter({
      username: U.username, parol: U.parol,
      deleteUsername: username
    });
    if (r.ok) {
      toast('✅ Buxgalter o\'chirildi');
      loadBuxgalterlar();
    } else {
      toast('❌ ' + r.error, 'error');
    }
  } catch(e) {
    toast('❌ Xatolik: ' + e.message, 'error');
  }
}

// ─── Buxgalter paneliga superadmin sifatida o'tish ───
function openBuxgalterPanel() {
  // Superadmin ma'lumotlarini buxgalter session sifatida yozamiz
  localStorage.setItem('iit_bux_u', JSON.stringify({
    username:    U.username,
    parol:       U.parol,
    ism:         U.ism,
    isSuperAdmin: true  // buxgalter.js bu flagni tekshiradi
  }));
  window.open('buxgalter.html', '_blank');
}

// ─── Buxgalter maktab biriktirish / ajratish ───────
async function biriktirBuxMaktab(buxId) {
  const sel = g(`add-maktab-sel-${buxId}`);
  const maktabId = sel?.value;
  if (!maktabId) { toast('⚠️ Maktab tanlang', 'error'); return; }

  const r = await api.biriktirAdmin({
    username: U.username, parol: U.parol,
    buxId, maktabId: parseInt(maktabId, 10)
  });
  if (r.ok) { toast('✅ Maktab biriktirildi', 'success'); loadBuxgalterlar(); }
  else       toast('❌ ' + r.error, 'error');
}

async function ajratBuxMaktab(buxId, maktabId) {
  if (!confirm(`Bu maktabni buxgalterdan ajratasizmi?`)) return;
  const r = await api.ajratAdmin({
    username: U.username, parol: U.parol,
    buxId, maktabId
  });
  if (r.ok) { toast('✅ Ajratildi'); loadBuxgalterlar(); }
  else       toast('❌ ' + r.error, 'error');
}

// ─── Eski nom aliaslar (backward compat) ───────────
async function biriktirAdmin(buxUsername) { toast('⚠️ Eski API. Sahifani yangilang.', 'error'); }
async function ajratAdmin(adminUsername, buxUsername) { toast('⚠️ Eski API. Sahifani yangilang.', 'error'); }

// ─── Buxgalter tahrirlash modal ───────────────────
let _editBuxOldUsername = '';

function openEditBux(username, ism) {
  _editBuxOldUsername = username;
  g('edit-bux-ism').value      = ism;
  g('edit-bux-username').value = username;
  g('edit-bux-parol').value    = '';
  g('edit-bux-err').style.display = 'none';
  g('edit-bux-modal').style.display = 'flex';
}
function closeEditBux() {
  g('edit-bux-modal').style.display = 'none';
}

async function saveEditBux() {
  const newIsm      = g('edit-bux-ism').value.trim();
  const newUsername = g('edit-bux-username').value.trim();
  const newParol    = g('edit-bux-parol').value.trim();
  const errEl       = g('edit-bux-err');
  errEl.style.display = 'none';

  if (!newIsm)      { errEl.textContent = '❌ Ism kerak'; errEl.style.display='block'; return; }
  if (!newUsername) { errEl.textContent = '❌ Username kerak'; errEl.style.display='block'; return; }
  if (newParol && newParol.length < 6) { errEl.textContent = '❌ Parol kamida 6 ta belgi'; errEl.style.display='block'; return; }

  const r = await api.editBuxgalter({
    username: U.username, parol: U.parol,
    oldUsername: _editBuxOldUsername,
    newIsm, newUsername, newParol
  });
  if (r.ok) {
    closeEditBux();
    toast('✅ Buxgalter yangilandi', 'success');
    loadBuxgalterlar();
  } else {
    errEl.textContent = '❌ ' + r.error;
    errEl.style.display = 'block';
  }
}

// ─── Global exports (HTML onclick lari uchun) ───
window.biriktirAdmin    = biriktirAdmin;
window.ajratAdmin       = ajratAdmin;
window.biriktirBuxMaktab = biriktirBuxMaktab;
window.ajratBuxMaktab    = ajratBuxMaktab;
window.openEditBux      = openEditBux;
window.closeEditBux     = closeEditBux;
window.saveEditBux      = saveEditBux;
window.openBuxgalterPanel = openBuxgalterPanel;





// ═══════════════════════════════════════════════════
//  PORTFOLIO MODULI  (app.js oxiriga qo'shing)
// ═══════════════════════════════════════════════════

// ─── switchTab ichida, case 'b' dan keyin qo'shing: ───
// case 'p': loadPortfolio(); break;

// ─── Holat ───
let PORTFOLIO_DATA = { viewers: [], teachers: [] };
let PM_SERTIFIKATLAR = [];  // modal ichidagi sertifikatlar

// ─── Load ───
async function loadPortfolio() {
  const [vr, tr] = await Promise.all([
    api.getPortfolioViewers({ username: U.username, parol: U.parol }),
    api.getPortfolioTeachers({ username: U.username, parol: U.parol })
  ]);
  PORTFOLIO_DATA.viewers  = vr.ok ? vr.viewers  : [];
  PORTFOLIO_DATA.teachers = tr.ok ? tr.teachers : [];
  renderPortfolioViewers();
  renderPortfolioTeachers();
}

// ════════════════════════════
//  PORTFOLIO VIEWERS
// ════════════════════════════

function renderPortfolioViewers() {
  const el = document.getElementById('pv-list');
  if (!el) return;
  const list = PORTFOLIO_DATA.viewers;

  if (list.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👁️</div><p>Viewer yo\'q</p></div>';
    return;
  }

  el.innerHTML = list.map(v => `
    <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:12px;border:1.5px solid #e5e7eb;margin-bottom:10px;">
      <div style="width:42px;height:42px;background:linear-gradient(135deg,#f59e0b,#ef4444);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;flex-shrink:0;">
        ${esc(v.ism).charAt(0).toUpperCase()}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:14px;color:#111827;">${esc(v.ism)}</div>
        <div style="font-size:12px;color:#9ca3af;">@${esc(v.username)}</div>
        <div style="font-size:12px;color:#9ca3af;">🔑 ${esc(v.parol)}</div>
      </div>
      <div style="font-size:12px;color:#9ca3af;flex-shrink:0;">${esc(v.yaratilgan||'')}</div>
      <button onclick="openTeachersFromViewer('${esc(v.username)}','${esc(v.ism)}')"
              style="padding:7px 14px;background:#ede9fe;border:1.5px solid #c4b5fd;border-radius:8px;font-size:13px;cursor:pointer;color:#5b21b6;font-weight:600;white-space:nowrap;">
        👨‍🏫 O'qituvchilar
      </button>
      <button onclick="openPVEdit('${esc(v.username)}','${esc(v.ism)}','${esc(v.parol)}')"
              style="padding:7px 14px;background:#f3f4f6;border:none;border-radius:8px;font-size:13px;cursor:pointer;color:#374151;font-weight:500;">
        ✏️ Tahrirlash
      </button>
      <button onclick="deletePortfolioViewer('${esc(v.username)}','${esc(v.ism)}')"
              style="padding:7px 14px;background:#fff0f0;border:1.5px solid #fca5a5;border-radius:8px;font-size:13px;cursor:pointer;color:#ef4444;font-weight:500;">
        O'chirish
      </button>
    </div>
  `).join('');
}

async function createPortfolioViewer() {
  const ism      = document.getElementById('pv-ism')?.value?.trim();
  const username = document.getElementById('pv-username')?.value?.trim();
  const parol    = document.getElementById('pv-parol')?.value?.trim();

  if (!ism || !username || !parol) return toast('❗ Barcha maydonlarni to\'ldiring', 'error');

  const r = await api.createPortfolioViewer({
    username: U.username, parol: U.parol,
    newIsm: ism, newUsername: username, newParol: parol
  });
  if (!r.ok) return toast('❌ ' + r.error, 'error');

  toast('✅ Viewer yaratildi', 'success');
  document.getElementById('pv-ism').value = '';
  document.getElementById('pv-username').value = '';
  document.getElementById('pv-parol').value = '';
  loadPortfolio();
}

async function deletePortfolioViewer(username, ism) {
  if (!confirm(`"${ism}" viewerni o'chirmoqchimisiz?`)) return;
  const r = await api.deletePortfolioViewer({ username: U.username, parol: U.parol, deleteUsername: username });
  if (!r.ok) return toast('❌ ' + r.error, 'error');
  toast('✅ Viewer o\'chirildi');
  loadPortfolio();
}

function openPVEdit(username, ism, parol) {
  document.getElementById('pve-old-username').value = username;
  document.getElementById('pve-ism').value      = ism;
  document.getElementById('pve-username').value  = username;
  document.getElementById('pve-parol').value     = '';
  const modal = document.getElementById('pv-edit-modal');
  modal.style.display = 'flex';
}
function closePVModal(e) {
  if (!e || e.target === document.getElementById('pv-edit-modal'))
    document.getElementById('pv-edit-modal').style.display = 'none';
}
async function savePortfolioViewer() {
  const oldU = document.getElementById('pve-old-username').value;
  const newI = document.getElementById('pve-ism').value.trim();
  const newU = document.getElementById('pve-username').value.trim();
  const newP = document.getElementById('pve-parol').value.trim();
  if (!newI || !newU) return toast('❗ Ism va username majburiy', 'error');
  const r = await api.editPortfolioViewer({
    username: U.username, parol: U.parol,
    oldUsername: oldU, newIsm: newI, newUsername: newU, newParol: newP
  });
  if (!r.ok) return toast('❌ ' + r.error, 'error');
  toast('✅ Viewer yangilandi', 'success');
  closePVModal();
  loadPortfolio();
}

// ════════════════════════════
//  VIEWER ↔ O'QITUVCHI MODAL
// ════════════════════════════

let VT_VIEWER_USERNAME = '';   // hozir ochiq modal qaysi viewer uchun
let VT_ASSIGNED_IDS   = [];   // biriktirilgan teacher_id lar

async function openViewerTeachersModal(viewerUsername, viewerIsm) {
  VT_VIEWER_USERNAME = viewerUsername;
  document.getElementById('vt-modal-title').textContent = `👨‍🏫 "${viewerIsm}" uchun o'qituvchilar`;
  document.getElementById('vt-modal').style.display = 'flex';
  document.getElementById('vt-list').innerHTML = '<div style="text-align:center;padding:30px;color:#9ca3af;">Yuklanmoqda...</div>';

  const [assignedR] = await Promise.all([
    api.getViewerTeachers({ username: U.username, parol: U.parol }, viewerUsername)
  ]);
  VT_ASSIGNED_IDS = assignedR.ok ? assignedR.teacher_ids : [];
  renderVTList();
}

function renderVTList() {
  const el    = document.getElementById('vt-list');
  const query = (document.getElementById('vt-search')?.value || '').toLowerCase();
  const all   = PORTFOLIO_DATA.teachers;

  const filtered = query
    ? all.filter(t =>
        (t.ism||'').toLowerCase().includes(query) ||
        (t.familiya||'').toLowerCase().includes(query) ||
        (t.fan||'').toLowerCase().includes(query))
    : all;

  if (filtered.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:30px;color:#9ca3af;">O\'qituvchi topilmadi</div>';
    return;
  }

  el.innerHTML = filtered.map(t => {
    const assigned  = VT_ASSIGNED_IDS.includes(t.id);
    const colors    = ['#6c63ff','#4ecdc4','#f59e0b','#ef4444','#10b981','#3b82f6'];
    const clr       = colors[t.id % colors.length];
    const initials  = ((t.ism||'')[0]||'T').toUpperCase();
    const hasProfil = !!(t.fish || t.universitet || t.sertifikatlar || t.ish_tajribasi);
    const sertSoni  = parseInt(t.sert_soni) || 0;
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;border:1.5px solid ${assigned?'#a5b4fc':'#e5e7eb'};background:${assigned?'#f5f3ff':'#fff'};margin-bottom:8px;transition:all .2s;">
        <div style="width:38px;height:38px;border-radius:50%;background:${clr};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px;flex-shrink:0;">${initials}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:13px;color:#111827;">${esc(t.ism)} ${esc(t.familiya)}</div>
          <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">${esc(t.fan||'Fan ko\'rsatilmagan')}</div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:20px;background:${hasProfil?'#d1fae5':'#f3f4f6'};color:${hasProfil?'#065f46':'#9ca3af'};">
              ${hasProfil ? '✅ Profil bor' : '❌ Profil yo\'q'}
            </span>
            <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:20px;background:${sertSoni>0?'#ede9fe':'#f3f4f6'};color:${sertSoni>0?'#5b21b6':'#9ca3af'};">
              📎 ${sertSoni}/10 sertifikat
            </span>
          </div>
        </div>
        ${assigned
          ? `<span style="font-size:11px;color:#5b21b6;background:#ede9fe;padding:3px 9px;border-radius:20px;font-weight:600;">✅ Biriktirilgan</span>
             <button onclick="vtToggle(${t.id},false)" style="padding:7px 14px;background:#fff0f0;border:1.5px solid #fca5a5;border-radius:8px;font-size:12px;cursor:pointer;color:#ef4444;font-weight:600;white-space:nowrap;">
               Ajratish
             </button>`
          : `<button onclick="vtToggle(${t.id},true)" style="padding:7px 14px;background:#ede9fe;border:1.5px solid #c4b5fd;border-radius:8px;font-size:12px;cursor:pointer;color:#5b21b6;font-weight:600;white-space:nowrap;">
               + Biriktirish
             </button>`
        }
      </div>`;
  }).join('');
}

async function vtToggle(teacherId, assign) {
  const r = assign
    ? await api.assignViewerTeacher({ username: U.username, parol: U.parol, viewerUsername: VT_VIEWER_USERNAME, teacherId })
    : await api.unassignViewerTeacher({ username: U.username, parol: U.parol, viewerUsername: VT_VIEWER_USERNAME, teacherId });

  if (!r.ok) return toast('❌ ' + r.error, 'error');

  if (assign) {
    VT_ASSIGNED_IDS = [...VT_ASSIGNED_IDS, teacherId];
    toast('✅ O\'qituvchi biriktirildi', 'success');
  } else {
    VT_ASSIGNED_IDS = VT_ASSIGNED_IDS.filter(id => id !== teacherId);
    toast('✅ O\'qituvchi ajratildi');
  }
  renderVTList();
}

function closeVTModal(e) {
  if (!e || e.target === document.getElementById('vt-modal'))
    document.getElementById('vt-modal').style.display = 'none';
}


function renderPortfolioTeachers() {
  const el = document.getElementById('pt-list');
  if (!el) return;
  const list = PORTFOLIO_DATA.teachers;

  if (list.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👨‍🏫</div><p>O\'qituvchilar yo\'q</p></div>';
    return;
  }

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;">
      ${list.map(t => {
        const initials = ((t.ism||'')[0]||(t.fish||'')[0]||'T').toUpperCase();
        const hasProfil = !!(t.fish || t.universitet || t.sertifikatlar || t.ish_tajribasi);
        const sertSoni  = parseInt(t.sert_soni) || 0;
        const colors = ['#6c63ff','#4ecdc4','#f59e0b','#ef4444','#10b981','#3b82f6'];
        const clr = colors[t.id % colors.length];
        return `
        <div style="border:1.5px solid #e5e7eb;border-radius:14px;padding:16px;transition:box-shadow .2s;" onmouseover="this.style.boxShadow='0 4px 20px rgba(0,0,0,.08)'" onmouseout="this.style.boxShadow='none'">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
            <div style="width:44px;height:44px;border-radius:50%;background:${clr};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;flex-shrink:0;">${initials}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:14px;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(t.ism)} ${esc(t.familiya)}</div>
              <div style="font-size:12px;color:#6b7280;">${esc(t.fan||'Fan ko\'rsatilmagan')}</div>
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
            <span style="background:${hasProfil?'#d1fae5':'#f3f4f6'};color:${hasProfil?'#065f46':'#6b7280'};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:500;">
              ${hasProfil ? '✅ Profil bor' : '❌ Profil yo\'q'}
            </span>
            <span style="background:#ede9fe;color:#5b21b6;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:500;">
              📎 ${sertSoni}/10 sertifikat
            </span>
          </div>
          <button onclick="openPortfolioModal(${t.id})"
                  style="width:100%;padding:9px;background:#6c63ff;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;">
            ✏️ Portfolio tahrirlash
          </button>
        </div>`;
      }).join('')}
    </div>
  `;
}

// ─── Portfolio Modal ───

async function openPortfolioModal(teacherId) {
  document.getElementById('pm-teacher-id').value = teacherId;
  document.getElementById('pm-fish').value       = '';
  document.getElementById('pm-univ').value       = '';
  document.getElementById('pm-sert').value       = '';
  document.getElementById('pm-tajriba').value    = '';
  document.getElementById('pm-sert-gallery').innerHTML = '';
  PM_SERTIFIKATLAR = [];
  updateSertCount(0);

  // Modal ochish
  const modal = document.getElementById('portfolio-modal');
  modal.style.display = 'flex';

  // Ma'lumotlarni yuklash
  const r = await api.getPortfolioTeacher({ username: U.username, parol: U.parol }, teacherId);
  if (!r.ok) { toast('❌ ' + r.error, 'error'); return; }

  const t = r.teacher;
  const p = r.portfolio;
  const initials = ((t.ism||'')[0]||'T').toUpperCase();
  const colors = ['#6c63ff','#4ecdc4','#f59e0b','#ef4444','#10b981','#3b82f6'];
  document.getElementById('pm-avatar').textContent = initials;
  document.getElementById('pm-avatar').style.background = `linear-gradient(135deg,${colors[t.id%colors.length]},#574fd6)`;
  document.getElementById('pm-name').textContent = `${t.ism} ${t.familiya}`;
  document.getElementById('pm-fan').textContent  = t.fan || '';

  if (p) {
    document.getElementById('pm-fish').value    = p.fish    || '';
    document.getElementById('pm-univ').value    = p.universitet || '';
    document.getElementById('pm-sert').value    = p.sertifikatlar || '';
    document.getElementById('pm-tajriba').value = p.ish_tajribasi || '';
  }

  PM_SERTIFIKATLAR = r.sertifikatlar || [];
  renderSertGallery();
}

function closePModal(e) {
  if (!e || e.target === document.getElementById('portfolio-modal'))
    document.getElementById('portfolio-modal').style.display = 'none';
}

async function savePortfolioTeacher() {
  const id = document.getElementById('pm-teacher-id').value;
  const r  = await api.savePortfolioTeacher({
    username:      U.username,
    parol:         U.parol,
    fish:          document.getElementById('pm-fish').value.trim(),
    universitet:   document.getElementById('pm-univ').value.trim(),
    sertifikatlar: document.getElementById('pm-sert').value.trim(),
    ish_tajribasi: document.getElementById('pm-tajriba').value.trim()
  }, id);

  if (!r.ok) return toast('❌ ' + r.error, 'error');
  toast('✅ Portfolio saqlandi', 'success');
  loadPortfolio();
}

// ─── Sertifikat Gallery ───

function renderSertGallery() {
  const el = document.getElementById('pm-sert-gallery');
  if (!el) return;
  updateSertCount(PM_SERTIFIKATLAR.length);

  if (PM_SERTIFIKATLAR.length === 0) {
    el.innerHTML = '';
    return;
  }

  const BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '')
    ? 'http://127.0.0.1:3001' : '';

  el.innerHTML = PM_SERTIFIKATLAR.map(s => {
    const url   = `${BASE_URL}/uploads/${encodeURIComponent(s.fayl_nomi)}`;
    const isPdf = s.fayl_nomi.endsWith('.pdf');
    const thumb = isPdf
      ? `<div style="height:80px;display:flex;align-items:center;justify-content:center;font-size:32px;background:#fee2e2;border-radius:8px;">📄</div>`
      : `<img src="${url}" alt="${esc(s.asl_nomi)}" style="width:100%;height:80px;object-fit:cover;border-radius:8px;" onerror="this.parentElement.innerHTML='<div style=\'height:80px;display:flex;align-items:center;justify-content:center;font-size:28px;background:#f3f4f6;border-radius:8px;\'>🖼️</div>'">`;
    return `
      <div style="position:relative;border:1.5px solid #e5e7eb;border-radius:10px;padding:8px;text-align:center;">
        ${thumb}
        <div style="font-size:10px;color:#6b7280;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(s.asl_nomi)}">${esc(s.asl_nomi||s.fayl_nomi)}</div>
        <div style="font-size:10px;color:#9ca3af;">${esc(s.yuklangan||'')}</div>
        <button onclick="deleteSertifikat('${esc(s.fayl_nomi)}')"
                style="position:absolute;top:4px;right:4px;background:#ef4444;color:#fff;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>`;
  }).join('');
}

function updateSertCount(n) {
  const el = document.getElementById('pm-sert-count');
  if (el) {
    el.textContent = `(${n}/10)`;
    el.style.color = n >= 10 ? '#ef4444' : '#6b7280';
  }
  // Upload label disable/enable
  const lbl = document.getElementById('pm-upload-label');
  if (lbl) lbl.style.opacity = n >= 10 ? '.4' : '1';
  const inp = document.getElementById('pm-sert-file');
  if (inp) inp.disabled = n >= 10;
}

async function uploadPortfolioSert() {
  if (PM_SERTIFIKATLAR.length >= 10) return toast('❗ Maksimal 10 ta sertifikat', 'error');
  const fileInput = document.getElementById('pm-sert-file');
  const file = fileInput?.files?.[0];
  if (!file) return;

  const id = document.getElementById('pm-teacher-id').value;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('username', U.username);
  fd.append('parol', U.parol);

  fileInput.value = '';
  toast('⏳ Yuklanmoqda...');

  const r = await api.uploadSertifikat(id, fd);
  if (!r.ok) return toast('❌ ' + r.error, 'error');

  PM_SERTIFIKATLAR.push({
    fayl_nomi: r.filename,
    asl_nomi:  r.asl_nomi,
    yuklangan: new Date().toLocaleDateString('ru-RU')
  });
  renderSertGallery();
  toast('✅ Sertifikat yuklandi', 'success');
  loadPortfolio(); // kartalar yangilansin
}

async function deleteSertifikat(filename) {
  if (!confirm('Bu sertifikatni o\'chirmoqchimisiz?')) return;
  const id = document.getElementById('pm-teacher-id').value;
  const r  = await api.deleteSertifikat(
    { username: U.username, parol: U.parol }, id, filename
  );
  if (!r.ok) return toast('❌ ' + r.error, 'error');
  PM_SERTIFIKATLAR = PM_SERTIFIKATLAR.filter(s => s.fayl_nomi !== filename);
  renderSertGallery();
  toast('✅ Sertifikat o\'chirildi');
  loadPortfolio();
}

// ─── Global expose ───
window.createPortfolioViewer  = createPortfolioViewer;
window.deletePortfolioViewer  = deletePortfolioViewer;
window.openPVEdit             = openPVEdit;
window.closePVModal           = closePVModal;
window.savePortfolioViewer    = savePortfolioViewer;
window.openPortfolioModal     = openPortfolioModal;
window.closePModal            = closePModal;
window.savePortfolioTeacher   = savePortfolioTeacher;
window.uploadPortfolioSert    = uploadPortfolioSert;
window.deleteSertifikat       = deleteSertifikat;
window.openViewerTeachersModal = openViewerTeachersModal;
window.closeVTModal           = closeVTModal;
window.vtToggle               = vtToggle;
window.renderVTList           = renderVTList;

// ═══════════════════════════════════════════════════════
//  👩‍🏫 O'QITUVCHILAR TAB (index.html ichida)
// ═══════════════════════════════════════════════════════
let TEACHERS_TAB = [];
let TEACHERS_TAB_LOADED = false;

async function loadTeachersTab() {
  if (!U) return;
  try {
    g('loading-oq') && (g('loading-oq').style.display = 'block');
    const token = localStorage.getItem('innovateit_token');
    const [res, maktabRes] = await Promise.all([
      fetch((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '')
        ? 'http://127.0.0.1:3001/api/teachers'
        : '/api/teachers', {
        headers: { 'Authorization': 'Bearer ' + token }
      }),
      U.isSuper ? api.getMaktablar() : Promise.resolve({ ok: false })
    ]);
    const d = await res.json();
    if (maktabRes.ok) MAKTABLAR = maktabRes.maktablar || [];
    if (d.ok) {
      TEACHERS_TAB = d.teachers || [];
      renderTeachersTab(TEACHERS_TAB);
      TEACHERS_TAB_LOADED = true;
    } else {
      toast('❌ ' + (d.error || 'Xatolik'), 'error');
    }

    // Superadmin: "Yangi o'qituvchi qo'shish" tugmasini ko'rsatish + modal inject
    if (U.isSuper) {
      const bar = g('super-add-bar');
      if (bar) bar.style.display = 'block';
      if (typeof injectSuperModals === 'function') injectSuperModals();
    }
  } catch(e) {
    toast('❌ Server bilan aloqa yo\'q', 'error');
  }
  g('loading-oq') && (g('loading-oq').style.display = 'none');
}

function renderTeachersTab(list) {
  const tbody = g('tbl-body-oq');
  if (!tbody) return;
  if (!list || !list.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;opacity:.5;">O\'qituvchi yo\'q</td></tr>';
    return;
  }
  const filtered = (() => {
    const q = (g('f-search-oq')?.value || '').toLowerCase().trim();
    if (!q) return list;
    return list.filter(t =>
      (t.ism || '').toLowerCase().includes(q) ||
      (t.familiya || '').toLowerCase().includes(q) ||
      (t.fan || '').toLowerCase().includes(q)
    );
  })();

  const isSup = U && U.isSuper;

  tbody.innerHTML = filtered.map((t, i) => {
    const maktablarRaw = t.maktablar || [];

    // Superadmin: maktab biriktirish UI
    if (isSup) {
      const maktabBadges = maktablarRaw.length
        ? maktablarRaw.map(m => `
            <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:6px;font-size:11px;font-weight:600;background:#eff4ff;color:#2563eb;border:1px solid #bfdbfe;">
              ${esc(m.nomi || m)}
              <span onclick="teacherAjratMaktab(${t.id}, ${m.id}, '${esc(m.nomi || '')}')"
                style="cursor:pointer;font-size:14px;line-height:1;color:#93c5fd;margin-left:2px;" title="Ajratish">×</span>
            </span>`).join('')
        : `<i style="color:#9ca3af;font-size:12px;">Biriktirilmagan</i>`;

      const maktabOptions = (MAKTABLAR || []).map(m =>
        `<option value="${m.id}">${esc(m.nomi)}</option>`
      ).join('');

      return `<tr>
        <td>${i + 1}</td>
        <td><strong>${esc(t.familiya || '')}</strong> ${esc(t.ism || '')}</td>
        <td><span class="sinf-badge">${esc(t.fan || '—')}</span></td>
        <td style="min-width:260px;">
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">${maktabBadges}</div>
          <div style="display:flex;gap:6px;align-items:center;">
            <select id="maktab-sel-${t.id}" style="flex:1;padding:5px 8px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;background:#fff;">
              <option value="">+ Maktab biriktirish...</option>
              ${maktabOptions}
            </select>
            <button onclick="teacherBiriktirMaktab(${t.id})"
              style="padding:5px 12px;background:#eff4ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;cursor:pointer;white-space:nowrap;font-weight:600;">
              Biriktirish
            </button>
          </div>
        </td>
        <td>${esc(t.telefon || '—')}</td>
        <td>${esc(t.telefon2 || '—')}</td>
        <td style="display:flex;gap:4px;">
          <button class="btn-action" onclick="openTeacherEditFromTab(${t.id})" title="Tahrirlash">✏️</button>
          <button class="btn-action" onclick="openTeacherMergeFromTab(${t.id})" title="Birlashtirish" style="font-size:14px;">⇄</button>
          <button class="btn-action btn-action-del" onclick="deleteTeacherSuper(${t.id}, '${esc(t.familiya)} ${esc(t.ism)}')" title="O'chirish">🗑️</button>
        </td>
      </tr>`;
    }

    // Oddiy admin: faqat ko'rish
    const maktabText = maktablarRaw.map(m => m.nomi || m).join(', ') || '<i style="color:#9ca3af">Biriktirilmagan</i>';
    return `<tr>
      <td>${i + 1}</td>
      <td><strong>${esc(t.familiya || '')}</strong> ${esc(t.ism || '')}</td>
      <td><span class="sinf-badge">${esc(t.fan || '—')}</span></td>
      <td style="font-size:12px;color:#6b7280;">${maktabText}</td>
      <td>${esc(t.telefon || '—')}</td>
      <td>${esc(t.telefon2 || '—')}</td>
      <td>
        <button class="btn-action" onclick="openTeacherEditFromTab(${t.id})" title="Tahrirlash">✏️</button>
      </td>
    </tr>`;
  }).join('');
}

// ─── Superadmin: o'qituvchiga maktab biriktirish ─────────────────────────────
// loadTeachers — oqituvchilar.js ichidagi saveSuperAdd/saveSuperEdit chaqiradi,
// index.html da esa loadTeachersTab bilan bir xil vazifa bajaradi
async function loadTeachers() {
  if (typeof loadTeachersTab === 'function') await loadTeachersTab();
}
async function teacherBiriktirMaktab(teacherId) {
  const sel = g('maktab-sel-' + teacherId);
  if (!sel || !sel.value) { toast('⚠️ Maktab tanlang', 'error'); return; }
  const maktabId = parseInt(sel.value);
  try {
    const r = await api.biriktirTeacher({ teacherId, maktabId });
    if (r.ok) { toast('✅ Maktab biriktirildi!', 'success'); await loadTeachersTab(); }
    else toast('❌ ' + (r.error || 'Xatolik'), 'error');
  } catch(e) { toast('❌ Xatolik', 'error'); }
}

// ─── Superadmin: o'qituvchidan maktab ajratish ───────────────────────────────
async function teacherAjratMaktab(teacherId, maktabId, maktabNomi) {
  if (!confirm(`"${maktabNomi}" maktabdan ajratilsinmi?`)) return;
  try {
    const r = await api.ajratTeacher({ teacherId, maktabId });
    if (r.ok) { toast('✅ Ajratildi!', 'success'); await loadTeachersTab(); }
    else toast('❌ ' + (r.error || 'Xatolik'), 'error');
  } catch(e) { toast('❌ Xatolik', 'error'); }
}

// ─── Superadmin: o'qituvchini o'chirish ──────────────────────────────────────
async function deleteTeacherSuper(delId, fullIsm) {
  if (!confirm(`"${fullIsm}" o'qituvchini o'chirishni tasdiqlaysizmi?`)) return;
  try {
    const r = await api.deleteTeacher({ delId });
    if (r.ok) { toast('✅ O\'qituvchi o\'chirildi!', 'success'); await loadTeachersTab(); }
    else toast('❌ ' + (r.error || 'Xatolik'), 'error');
  } catch(e) { toast('❌ Xatolik', 'error'); }
}

function applyTeacherFilter() {
  renderTeachersTab(TEACHERS_TAB);
}

// O'qituvchilar tabidagi ✏️ tugmasi — oqituvchilar.html ga o'tib tahrirlash modalini ochish
function openTeacherEditFromTab(teacherId) {
  const teacherUser = {
    username: U.username, parol: U.parol, ism: U.ism,
    isSuper: U.isSuper,
    adminsMap: JSON.stringify((ADMINS || []).map(a => ({ username: a.username, ism: a.ism, maktab_nomi: a.maktab_nomi || null }))),
    openEditId: teacherId,   // ← oqituvchilar.html bu ID ni ko'rib modalni ochadi
    fromPortfolioTab: false
  };
  sessionStorage.setItem('iit_teacher_user', JSON.stringify(teacherUser));
  window.location.href = 'oqituvchilar.html';
}

// ⇄ Birlashtirish tugmasi
function openTeacherMergeFromTab(teacherId) {
  const teacherUser = {
    username: U.username, parol: U.parol, ism: U.ism,
    isSuper: U.isSuper,
    adminsMap: JSON.stringify((ADMINS || []).map(a => ({ username: a.username, ism: a.ism, maktab_nomi: a.maktab_nomi || null }))),
    openMergeId: teacherId,  // ← oqituvchilar.html bu ID ni ko'rib merge modalini ochadi
    fromPortfolioTab: false
  };
  sessionStorage.setItem('iit_teacher_user', JSON.stringify(teacherUser));
  window.location.href = 'oqituvchilar.html';
}

// ═══════════════════════════════════════════════════════
//  📂 PORTFOLIO TAB (index.html ichida)
// ═══════════════════════════════════════════════════════
function loadPortfolioTab() {
  // portfolio-tab.js dagi loadOqPortfolio funksiyasini chaqiramiz
  if (typeof loadOqPortfolio === 'function') {
    loadOqPortfolio();
  } else {
    // portfolio-tab.js yuklanmagan — sahifaga o'tkazamiz
    const teacherUser = {
      username: U.username, parol: U.parol, ism: U.ism, isSuper: U.isSuper,
      adminsMap: JSON.stringify((ADMINS || []).map(a => ({ username: a.username, ism: a.ism, maktab_nomi: a.maktab_nomi || null }))),
      fromPortfolioTab: true
    };
    sessionStorage.setItem('iit_teacher_user', JSON.stringify(teacherUser));
    window.location.href = 'oqituvchilar.html';
  }
}
// ═══════════════════════════════════════════════════════
//  SUPERADMIN: YANGI O'QITUVCHI QO'SHISH MODALI
//  (oqituvchilar.js funksiyalari index.html uchun ko'chirilgan)
// ═══════════════════════════════════════════════════════

// setBtnLoading — oqituvchilar.js bilan mos
function setBtnLoading(btnId, spId, txtId, loading, txt) {
  const btn = g(btnId), sp = g(spId), tx = g(txtId);
  if (!btn) return;
  btn.disabled = loading;
  if (sp) sp.style.display = loading ? 'inline-block' : 'none';
  if (tx) tx.textContent = txt;
}

// T massivi — loadTeachersQuiet uchun (index.html da TEACHERS_TAB ishlatiladi)
if (typeof T === 'undefined') var T = [];

function injectSuperModals() {
  if (document.getElementById('super-add-modal')) return;

  const fanOptions = `
    <option value="">— Tanlang —</option>
    <option value="Matematika">Matematika</option>
    <option value="Ingliz tili">Ingliz tili</option>
    <option value="IT">IT</option>`;

  const addHtml = `
<div class="modal-overlay" id="super-add-modal" style="display:none;" onclick="if(event.target===this)closeSuperAdd()">
  <div class="modal" style="max-width:660px;max-height:90vh;overflow-y:auto;">
    <div class="modal-drag"></div>
    <div class="modal-title">➕ Yangi o'qituvchi qo'shish</div>
    <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">📋 Asosiy ma'lumotlar</div>
    <div class="form-grid" style="margin-bottom:16px;">
      <div class="field-group"><label class="field-label">Familiya *</label><input class="field-input" id="sa-familiya" placeholder="Yusupova" autocomplete="off"></div>
      <div class="field-group"><label class="field-label">Ism *</label><input class="field-input" id="sa-ism" placeholder="Nodira" autocomplete="off"></div>
      <div class="field-group"><label class="field-label">Fan *</label><select class="field-input" id="sa-fan">${fanOptions}</select></div>
      <div class="field-group"><label class="field-label">Telefon *</label><div class="tel-wrap"><input class="field-input tel-input" id="sa-tel" placeholder="+998 __ ___ __ __" maxlength="17" inputmode="tel"><div class="tel-hint" id="sa-tel-hint"></div></div></div>
      <div class="field-group"><label class="field-label">Qo'sh. telefon <span style="font-weight:400;font-size:10px;">(ixtiyoriy)</span></label><div class="tel-wrap"><input class="field-input tel-input" id="sa-tel2" placeholder="+998 __ ___ __ __" maxlength="17" inputmode="tel"><div class="tel-hint" id="sa-tel2-hint"></div></div></div>
    </div>
    <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">📂 Portfolio ma'lumotlari <span style="font-weight:400;text-transform:none;font-size:10px;">(ixtiyoriy)</span></div>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;">
      <div class="field-group"><label class="field-label">F.I.SH. (To'liq ism)</label><input class="field-input" id="sa-fish" placeholder="Yusupova Nodira Karimovna"></div>
      <div class="field-group"><label class="field-label">O'qiyotgan yoki bitirgan universiteti(lari)</label><input class="field-input" id="sa-univ" placeholder="Toshkent Davlat Pedagogika Universiteti"></div>
      <div class="field-group"><label class="field-label">Olgan sertifikatlari (matn)</label><textarea class="field-input" id="sa-sert" rows="3" style="resize:vertical;font-family:inherit;" placeholder="IELTS 7.0, Cambridge B2..."></textarea></div>
      <div class="field-group"><label class="field-label">Ish joylari va Ish tajribasi</label><textarea class="field-input" id="sa-tajriba" rows="3" style="resize:vertical;font-family:inherit;" placeholder="2018-2020: 45-maktab&#10;2020-hozir: InnovateIT School"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn-cancel" onclick="closeSuperAdd()">Bekor</button>
      <button class="btn-submit" id="sa-save-btn" onclick="saveSuperAdd()"><span class="spinner" id="sa-spinner"></span><span id="sa-btn-txt">Saqlash</span></button>
    </div>
  </div>
</div>`;

  document.body.insertAdjacentHTML('beforeend', addHtml);
  if (typeof setupTel === 'function') {
    setupTel('sa-tel',  'sa-tel-hint');
    setupTel('sa-tel2', 'sa-tel2-hint');
  }
}

function openSuperAdd() {
  if (!U || !U.isSuper) return;
  injectSuperModals();
  ['sa-ism','sa-familiya','sa-tel','sa-tel2','sa-fish','sa-univ'].forEach(id => { const el=g(id); if(el) el.value=''; });
  ['sa-sert','sa-tajriba'].forEach(id => { const el=g(id); if(el) el.value=''; });
  const fan = g('sa-fan'); if(fan) fan.value='';
  ['sa-tel-hint','sa-tel2-hint'].forEach(id => { const el=g(id); if(el) { el.textContent=''; el.className='tel-hint'; } });
  const m = g('super-add-modal'); if(m) m.style.display='flex';
}

function closeSuperAdd() {
  const m = g('super-add-modal'); if(m) m.style.display='none';
}

async function saveSuperAdd() {
  const ism  = (g('sa-ism')?.value||'').trim();
  const fam  = (g('sa-familiya')?.value||'').trim();
  const fan  = g('sa-fan')?.value||'';
  const tel  = (g('sa-tel')?.value||'').trim();
  const tel2 = (g('sa-tel2')?.value||'').trim();

  if (!ism||!fam)    { toast('⚠️ Ism va familiya kiriting','error'); return; }
  if (!fan)          { toast('⚠️ Fan tanlang','error'); return; }
  if (!tel)          { toast('⚠️ Telefon kiriting','error'); return; }
  if (typeof isTelOk==='function' && !isTelOk(tel)) { toast("⚠️ Telefon formati noto'g'ri (+998 XX XXX XX XX)",'error'); return; }
  if (tel2 && typeof isTelOk==='function' && !isTelOk(tel2)) { toast("⚠️ Qo'sh. telefon formati noto'g'ri",'error'); return; }

  const fish     = (g('sa-fish')?.value||'').trim();
  const univ     = (g('sa-univ')?.value||'').trim();
  const sertMatn = (g('sa-sert')?.value||'').trim();
  const tajriba  = (g('sa-tajriba')?.value||'').trim();

  setBtnLoading('sa-save-btn','sa-spinner','sa-btn-txt',true,'Saqlanmoqda…');
  try {
    const r = await api.addTeacher({
      username: U.username, parol: U.parol,
      ism, familiya: fam, fan,
      telefon: tel, telefon2: tel2||'',
      kunlar:'', sinflar:'', boshlanish:'', tugash:'',
      date: new Date().toLocaleDateString('ru-RU')
    });
    if (!r.ok) { toast('❌ ' + r.error,'error'); return; }

    // Portfolio ma'lumotlari bor bo'lsa saqlash
    if (fish||univ||sertMatn||tajriba) {
      await loadTeachersTab();
      const added = (TEACHERS_TAB||[]).find(t => t.ism===ism && t.familiya===fam);
      if (added) {
        await api.savePortfolioTeacher({
          username: U.username, parol: U.parol,
          fish, universitet: univ, sertifikatlar: sertMatn, ish_tajribasi: tajriba
        }, added.id);
      }
    }

    toast("✅ O'qituvchi qo'shildi!",'success');
    closeSuperAdd();
    await loadTeachersTab();
  } catch(e) { toast('❌ Server bilan ulanishda xatolik','error'); }
  setBtnLoading('sa-save-btn','sa-spinner','sa-btn-txt',false,'Saqlash');
}