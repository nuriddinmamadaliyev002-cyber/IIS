// ═══════════════════════════════════════════════════════════════════════════
//  DIREKTOR PANELI
//  Kirish FAQAT Telegram Mini App orqali: bot → /api/telegram/check →
//  direktor.html?tg_token=... Token alohida kalitda saqlanadi
//  ('innovateit_direktor_token'), shuning uchun boshqa panellar bilan
//  bir vaqtda ochiq tursa ham bir-birini bosib yozmaydi.
//  Direktor FAQAT O'QIYDI: o'qituvchilar, ularning maktab/sinflari, dars jadvali
//  va davomati (GET /api/direktorlar/oqituvchilar).
// ═══════════════════════════════════════════════════════════════════════════
let U = null;
function g(id) { return document.getElementById(id); }

window.addEventListener('DOMContentLoaded', () => {
  const params  = new URLSearchParams(window.location.search);
  const tgToken = params.get('tg_token');

  if (tgToken) {
    api.setToken(tgToken);
    const payload = api.getUser();
    // Faqat direktor (yoki "ko'rish" uchun superadmin) tokeni qabul qilinadi
    if (!payload || (payload.role !== 'direktor' && !payload.isSuper)) {
      api.logout();
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    U = { ism: params.get('tg_ism') || payload.ism || '', id: payload.entityId };
    localStorage.setItem('iit_dir_u', JSON.stringify(U));
    window.history.replaceState({}, '', window.location.pathname);
    showApp();
    return;
  }

  try {
    const saved = localStorage.getItem('iit_dir_u');
    if (saved && api.isLoggedIn()) { U = JSON.parse(saved); showApp(); }
    else localStorage.removeItem('iit_dir_u');
  } catch (e) { localStorage.removeItem('iit_dir_u'); }
});

function doLogout() {
  U = null;
  iitClearAllSessions();
  // Direktor faqat Telegram orqali kiradi — login formasi foydasiz
  if (iitIsTelegramSession()) { iitMarkLoggedOut(); iitShowLoggedOut(); return; }
  window.location.replace('index.html');
}

async function showApp() {
  g('login-screen').style.display = 'none';
  g('app').style.display = 'block';
  g('dir-badge').textContent = U.ism;

  // Token va rolni serverda tekshirib olamiz (direktor yozuvi o'chirilgan bo'lsa — chiqarib yuboradi)
  try {
    const r = await api.getDirektorMe();
    if (r && r.ok && r.direktor && !r.direktor.isSuper) {
      const fish = `${r.direktor.familiya || ''} ${r.direktor.ism}`.trim();
      U.ism = fish; g('dir-badge').textContent = fish;
    } else if (r && r.ok === false && r.error === 'Direktor topilmadi') {
      doLogout(); return;
    }
  } catch (_) { /* tarmoq xatosi — sahifa ochiq qoladi */ }

  loadTeachers();
}

// ═══════════════════════════════════════════════════════════════════════════
//  O'QITUVCHILAR
// ═══════════════════════════════════════════════════════════════════════════
const KUN_SHORT = ['', 'Du', 'Se', 'Cho', 'Pay', 'Ju', 'Sha'];
const KUN_FULL  = ['', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
let TEACHERS = [], MAKTABLAR = [], YETIM = 0;

// HTML xavfsizligi: bazadagi barcha matnlar shu orqali chiqariladi
function h(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const fish = (t) => `${t.familiya || ''} ${t.ism || ''}`.trim();
const vaqt = (j) => (j.boshlanish || j.tugash) ? `${j.boshlanish || '?'}–${j.tugash || '?'}` : 'vaqt yo\'q';
const sinfNum = (a, b) => (parseInt(a) || 0) - (parseInt(b) || 0) || String(a).localeCompare(String(b));

// Toshkent vaqti bo'yicha bugungi hafta kuni (1=Du … 6=Sha, yakshanba=0)
function todayIdx() {
  const w = new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Tashkent' });
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 }[w] ?? 0;
}

async function loadTeachers() {
  g('t-loading').style.display = 'block';
  try {
    const r = await api.getDirektorOqituvchilar({});
    if (!r.ok) { g('t-loading').innerHTML = `<span style="color:#dc2626;">❌ ${h(r.error)}</span>`; return; }
    TEACHERS  = r.oqituvchilar || [];
    MAKTABLAR = r.maktablar || [];
    YETIM     = r.yetim_jadval || 0;
  } catch (e) {
    g('t-loading').innerHTML = `<span style="color:#dc2626;">❌ Xatolik: ${h(e.message)}</span>`;
    return;
  }
  g('t-loading').style.display = 'none';
  buildFilters();
  renderStats();
  renderTeachers();
  renderTimetable();
}

function buildFilters() {
  const mk = g('f-maktab');
  mk.innerHTML = '<option value="">🏫 Barcha maktablar</option>' +
    MAKTABLAR.map(m => `<option value="${Number(m.id)}">${h(m.nomi)}</option>`).join('');
  const fanlar = [...new Set(TEACHERS.map(t => (t.fan || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  g('f-fan').innerHTML = '<option value="">Barcha fanlar</option>' +
    fanlar.map(f => `<option value="${h(f)}">${h(f)}</option>`).join('');

  // Jadval filtrlari
  const withJ = new Set();
  TEACHERS.forEach(t => t.jadval.forEach(j => j.maktab_id && withJ.add(j.maktab_id)));
  const jm = MAKTABLAR.filter(m => withJ.has(m.id));
  g('j-maktab').innerHTML = jm.length
    ? jm.map(m => `<option value="${Number(m.id)}">${h(m.nomi)}</option>`).join('')
    : '<option value="">Jadval yo\'q</option>';
  g('j-teacher').innerHTML = '<option value="">Barcha o\'qituvchilar</option>' +
    TEACHERS.filter(t => t.jadval.length).map(t => `<option value="${Number(t.id)}">${h(fish(t))}</option>`).join('');
}

function renderStats() {
  const jadvalsiz = TEACHERS.filter(t => !t.jadval.length).length;
  const tgsiz     = TEACHERS.filter(t => !t.telegram).length;
  const haftalik  = TEACHERS.reduce((n, t) => n + t.haftalik_dars, 0);
  const maktabSoni = new Set(TEACHERS.flatMap(t => t.maktablar.map(m => m.id))).size;
  const card = (num, lbl, warn) =>
    `<div class="dir-stat${warn && num > 0 ? ' warn' : ''}"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
  g('dir-stats').innerHTML =
    card(TEACHERS.length, "Jami o'qituvchi") +
    card(maktabSoni, "O'qituvchi dars beradigan maktab") +
    card(haftalik, 'Haftalik darslar (jadval bo\'yicha)') +
    card(jadvalsiz, "Jadvali yo'q o'qituvchi", true) +
    card(tgsiz, "Telegram bog'lanmagan", true) +
    (YETIM ? card(YETIM, "Egasi topilmagan jadval qatori", true) : '');
}

function filteredTeachers() {
  const q = g('f-q').value.trim().toLowerCase();
  const mk = parseInt(g('f-maktab').value) || 0;
  const fan = g('f-fan').value;
  const holat = g('f-holat').value;
  return TEACHERS.filter(t => {
    if (q && !(`${fish(t)} ${t.fan} ${t.telefon} ${t.telefon2}`.toLowerCase().includes(q))) return false;
    if (mk && !t.maktablar.some(m => m.id === mk) && !t.jadval.some(j => j.maktab_id === mk)) return false;
    if (fan && (t.fan || '').trim() !== fan) return false;
    if (holat === 'jadvalsiz' && t.jadval.length) return false;
    if (holat === 'maktabsiz' && t.maktablar.length) return false;
    if (holat === 'tgsiz' && t.telegram) return false;
    return true;
  });
}

function davomatCell(d) {
  const jami = d.keldi + d.kech + d.kelmadi;
  if (!jami) return '<span class="chip n">ma\'lumot yo\'q</span>';
  return `<span class="chip g" title="Keldi">✓ ${d.keldi}</span>` +
         (d.kech    ? `<span class="chip y" title="Kech qoldi">⏰ ${d.kech}</span>` : '') +
         (d.kelmadi ? `<span class="chip r" title="Kelmadi">✗ ${d.kelmadi}</span>` : '') +
         `<div style="font-size:11px;color:#6b7280;margin-top:2px;">${d.soat} soat ${d.daqiqa} daq</div>`;
}

function renderTeachers() {
  const list = filteredTeachers();
  g('f-count').textContent = `${list.length} / ${TEACHERS.length}`;
  g('t-empty').style.display = list.length ? 'none' : 'block';
  g('t-body').innerHTML = list.map((t, i) => {
    const sm = t.sinflar_by_maktab.length
      ? t.sinflar_by_maktab.map(x =>
          `<div class="sm-line"><b>${h(x.maktab_nomi)}:</b> ${x.sinflar.length ? x.sinflar.map(s => `<span class="chip">${h(s)}</span>`).join('') : '<span class="chip n">sinf yo\'q</span>'}</div>`).join('')
      : (t.maktablar.length
          ? t.maktablar.map(m => `<span class="chip n">${h(m.nomi)}</span>`).join('') + '<div style="font-size:11px;color:#b45309;">⚠️ jadval kiritilmagan</div>'
          : '<span class="chip y">⚠️ maktab biriktirilmagan</span>');
    return `<tr onclick="openTeacher(${Number(t.id)})">
      <td>${i + 1}</td>
      <td><b>${h(fish(t))}</b>${t.telefon ? `<div style="font-size:11px;color:#6b7280;">${h(t.telefon)}</div>` : ''}</td>
      <td>${h(t.fan) || '—'}</td>
      <td>${sm}</td>
      <td>${t.haftalik_dars || '—'}</td>
      <td>${t.oquvchilar_soni || '—'}</td>
      <td>${davomatCell(t.davomat30)}</td>
      <td>${t.telegram ? '<span class="chip g">📱 bor</span>' : '<span class="chip n">yo\'q</span>'}</td>
    </tr>`;
  }).join('');
}

// ─── Haftalik setka (bitta o'qituvchi yoki maktab uchun) ────────────────────
function weekGrid(lessonsByDay, opts = {}) {
  const today = todayIdx();
  let head = '', body = '';
  for (let k = 1; k <= 6; k++) head += `<th class="${k === today ? 'today' : ''}">${KUN_FULL[k]}</th>`;
  for (let k = 1; k <= 6; k++) {
    const items = (lessonsByDay[k] || []).slice().sort((a, b) => String(a.boshlanish).localeCompare(String(b.boshlanish)));
    body += `<td>${items.map(opts.card).join('')}</td>`;
  }
  return `<thead><tr>${head}</tr></thead><tbody><tr>${body}</tr></tbody>`;
}

function groupByDay(rows) {
  const by = {};
  rows.forEach(j => j.kunlar.forEach(k => { (by[k] = by[k] || []).push(j); }));
  return by;
}

// ─── O'qituvchi batafsil ────────────────────────────────────────────────────
function openTeacher(id) {
  const t = TEACHERS.find(x => x.id === id);
  if (!t) return;
  const d = t.davomat30, jami = d.keldi + d.kech + d.kelmadi;

  const byDay = groupByDay(t.jadval);
  const grid = t.jadval.length
    ? `<div class="xscroll"><table class="wk">${weekGrid(byDay, { card: j =>
        `<div class="lesson"><div class="t">${h(vaqt(j))}</div>
         <div class="who">${h(j.maktab_nomi || '—')}</div>
         <div class="meta">${j.sinflar.map(h).join(', ') || 'sinf yo\'q'}${j.fan ? ' · ' + h(j.fan) : ''}</div></div>` })}</table></div>`
    : `<div class="empty" style="padding:16px;">Bu o'qituvchi uchun dars jadvali kiritilmagan.` +
      (t.profil.kunlar.length || t.profil.sinflar.length
        ? `<br><span style="color:#6b7280;">Profilda: ${t.profil.kunlar.map(k => KUN_SHORT[k]).join(', ') || '—'} · ${t.profil.sinflar.map(h).join(', ') || '—'} · ${h(vaqt(t.profil))}</span>` : '') +
      `</div>`;

  const maktablar = t.sinflar_by_maktab.length
    ? t.sinflar_by_maktab.map(x => `<div class="sm-line"><b>${h(x.maktab_nomi)}:</b> ${x.sinflar.map(s => `<span class="chip">${h(s)}</span>`).join('') || '—'}</div>`).join('')
    : (t.maktablar.map(m => `<span class="chip n">${h(m.nomi)}</span>`).join('') || '<span class="chip y">⚠️ maktab biriktirilmagan</span>');

  g('t-modal-box').innerHTML = `
    <div class="dmodal-head">
      <div>
        <div style="font-size:18px;font-weight:700;">${h(fish(t))}</div>
        <div style="font-size:13px;color:#6b7280;">${h(t.fan) || 'Fan ko\'rsatilmagan'}</div>
      </div>
      <button class="dmodal-close" onclick="closeTeacher()" aria-label="Yopish">✕</button>
    </div>
    <div class="kv">
      <span>📞 <b>${h(t.telefon) || '—'}</b>${t.telefon2 ? ' · ' + h(t.telefon2) : ''}</span>
      <span>📱 Telegram: <b>${t.telegram ? 'bog\'langan' : 'bog\'lanmagan'}</b></span>
      <span>🎓 O'quvchilar: <b>${t.oquvchilar_soni}</b></span>
      <span>📅 Haftada: <b>${t.haftalik_dars} dars</b></span>
      ${t.qoshilgan ? `<span>➕ Qo'shilgan: <b>${h(t.qoshilgan)}</b></span>` : ''}
    </div>
    <div class="dsec">🏫 Maktablar va sinflar</div>${maktablar}
    <div class="dsec">📅 Haftalik dars jadvali</div>${grid}
    <div class="dsec">✅ Davomat (so'nggi 30 kun)</div>
    ${jami ? `<div>${davomatCell(d)}</div>` : '<div style="color:#9ca3af;font-size:13px;">Davomat ma\'lumoti yo\'q</div>'}`;
  g('t-modal').style.display = 'flex';
}
function closeTeacher() { g('t-modal').style.display = 'none'; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTeacher(); });

// ═══════════════════════════════════════════════════════════════════════════
//  DARS JADVALI (maktab kesimida)
// ═══════════════════════════════════════════════════════════════════════════
function renderTimetable() {
  const mk = parseInt(g('j-maktab').value) || 0;
  const sinfF = g('j-sinf').value;
  const tF = parseInt(g('j-teacher').value) || 0;

  // Tanlangan maktabdagi barcha qatorlar (o'qituvchi nomi bilan)
  let rows = [];
  TEACHERS.forEach(t => {
    if (tF && t.id !== tF) return;
    t.jadval.forEach(j => { if (!mk || j.maktab_id === mk) rows.push({ ...j, _t: fish(t) }); });
  });

  // Sinf filtri variantlarini maktab bo'yicha yangilaymiz (tanlov saqlanadi)
  const sinflar = [...new Set(rows.flatMap(j => j.sinflar))].sort(sinfNum);
  const sel = g('j-sinf');
  if (sel.dataset.mk !== String(mk) + '|' + tF) {
    sel.dataset.mk = String(mk) + '|' + tF;
    sel.innerHTML = '<option value="">Barcha sinflar</option>' + sinflar.map(s => `<option value="${h(s)}">${h(s)}</option>`).join('');
    if (sinfF && sinflar.includes(sinfF)) sel.value = sinfF;
  }
  const sinfNow = sel.value;
  if (sinfNow) rows = rows.filter(j => j.sinflar.includes(sinfNow));

  g('j-count').textContent = `${rows.length} ta guruh`;
  g('j-grid').innerHTML = rows.length
    ? weekGrid(groupByDay(rows), { card: j =>
        `<div class="lesson"><div class="t">${h(vaqt(j))}</div>
         <div class="who">${h(j._t)}</div>
         <div class="meta">${j.sinflar.map(h).join(', ') || 'sinf yo\'q'}${j.fan ? ' · ' + h(j.fan) : ''}</div></div>` })
    : '<tbody><tr><td class="empty" style="height:auto;">Bu tanlov bo\'yicha dars jadvali yo\'q</td></tr></tbody>';
}

function showView(v) {
  g('view-oq').style.display = v === 'oq' ? 'block' : 'none';
  g('view-jd').style.display = v === 'jd' ? 'block' : 'none';
  g('tab-btn-oq').classList.toggle('active', v === 'oq');
  g('tab-btn-jd').classList.toggle('active', v === 'jd');
}
