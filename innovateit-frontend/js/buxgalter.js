// ═══════════════════════════════════════════════════
//  InnovateIT — Buxgalter To'lovlar JS
// ═══════════════════════════════════════════════════



let U         = null;   // { username, parol, ism }
let ALL_DATA  = [];     // { student, tolov } merged array
let FILTERED  = [];     // after filter
let COL_FILTERS = {};   // { colKey: Set<string> | null } — ColContextMenu qiymatlar filtri
let CURRENT_OY = '';   // '2025-03'
let STAT_FILTER = '';  // 'all' | 'toliq' | 'qarzdor' | 'nofaol' | 'empty'

// ─── Yordamchi ───────────────────────────────────
const g = id => document.getElementById(id);

// ─── "Qabul YYYY-YY" pseudo-oy — Avgust bilan Sentabr orasiga qistiriladi ──
//  Bu yerda haqiqiy oy emas, balki sales moduldan "ro'yxatga olindi" bo'lgan
//  (hali to'lov kuzatuvi boshlanmagan) o'quvchilar ro'yxati ko'rsatiladi.
const QABUL_OY = 'QABUL-2026-27';
function isQabulOy(oy) { return oy === QABUL_OY; }

function oyNomi(oyStr) {
  if (!oyStr) return '—';
  if (isQabulOy(oyStr)) return 'Qabul 2026-27';
  const [y, m] = oyStr.split('-');
  const oylar = ['','Yanvar','Fevral','Mart','Aprel','May','Iyun',
                 'Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
  return `${oylar[parseInt(m)]} ${y}`;
}

function prevOy(oy) {
  if (isQabulOy(oy)) return '2026-08';
  if (oy === '2026-09') return QABUL_OY;
  const [y, m] = oy.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function nextOy(oy) {
  if (isQabulOy(oy)) return '2026-09';
  if (oy === '2026-08') return QABUL_OY;
  const [y, m] = oy.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function currentOyStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function formatSum(n, type) {
  if (!n || n === 0) return '<span class="amount-0">—</span>';
  const formatted = n.toLocaleString('ru-RU');
  if (type === 'qildi') return `<span class="amount-qildi">${formatted} <span class="amount-currency">so'm</span></span>`;
  if (type === 'kerak') return `<span class="amount-kerak">${formatted} <span class="amount-currency">so'm</span></span>`;
  return `<span class="amount-default">${formatted} <span class="amount-currency">so'm</span></span>`;
}
function parseSum(s) {
  return parseInt((s || '0').replace(/\D/g, '')) || 0;
}

function tolovSanasi(dateStr) {
  if (!dateStr) return '—';
  // DD.MM.YYYY → "Mart 14"
  const oylar = ['','Yanvar','Fevral','Mart','Aprel','May','Iyun',
                 'Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
  const parts = dateStr.split('.');
  if (parts.length === 3) {
    return `${oylar[parseInt(parts[1])]} ${parseInt(parts[0])}`;
  }
  return dateStr;
}

function tolovHolati(kerak, qildi) {
  if (!kerak || kerak === 0) return '<span class="badge-empty">—</span>';
  if (qildi > kerak) {
    const ortiqcha = qildi - kerak;
    return `<span class="badge-toliq">✅ To'liq <span class="badge-ortiqcha">+${ortiqcha.toLocaleString('ru-RU')} so'm ortiqcha</span></span>`;
  }
  if (qildi === kerak) return '<span class="badge-toliq">✅ To\'liq</span>';
  if (qildi > 0)       return `<span class="badge-qisman">⚡ ${(kerak-qildi).toLocaleString('ru-RU')} so'm qoldi</span>`;
  return `<span class="badge-qarzdor">❌ ${kerak.toLocaleString('ru-RU')} so'm</span>`;
}

// ─── Kirish ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Oxirgi tanlangan oyni saqlash/tiklash
  const savedOy = localStorage.getItem('iit_bux_oy');
  CURRENT_OY = (savedOy && (savedOy === QABUL_OY || /^\d{4}-\d{2}$/.test(savedOy))) ? savedOy : currentOyStr();
  g('oy-label').textContent = oyNomi(CURRENT_OY);

  // Saved session
  try {
    const saved = localStorage.getItem('iit_bux_u');
    if (saved) {
      U = JSON.parse(saved);
      showApp();
    }
  } catch(e) { localStorage.removeItem('iit_bux_u'); }

  g('inp-parol').addEventListener('keydown', e => { if (e.key==='Enter') doLogin(); });
  g('inp-username').addEventListener('keydown', e => { if (e.key==='Enter') g('inp-parol').focus(); });
});

async function doLogin() {
  const username = g('inp-username').value.trim();
  const parol    = g('inp-parol').value;
  if (!username || !parol) return;

  const btn = g('login-btn');
  btn.disabled = true; btn.textContent = 'Tekshirilmoqda…';

  try {
    const r = await api.loginBuxgalter({ username, parol });
    if (r.ok) {
      U = { username, parol, ism: r.ism };
      localStorage.setItem('iit_bux_u', JSON.stringify(U));
      showApp();
    } else {
      const errEl = g('login-err');
      errEl.textContent = '❌ ' + (r.error || "Username yoki parol noto'g'ri");
      errEl.style.display = 'block';
    }
  } catch(e) {
    g('login-err').textContent = '❌ Ulanishda xatolik';
    g('login-err').style.display = 'block';
  }
  btn.disabled = false; btn.textContent = 'Kirish';
}

function doLogout() {
  U = null; ALL_DATA = []; FILTERED = []; COL_FILTERS = {};
  localStorage.removeItem('iit_bux_u');
  window.location.href = 'index.html';
}

function showApp() {
  g('login-screen').style.display = 'none';
  g('app').style.display = 'block';
  g('bux-badge').textContent = U.ism;
  initFixedHeader();
  applyColVisibility();
  ColContextMenu.init('bux-table-main', COL_LABELS, {
    onHide:    (col) => toggleCol(col),
    getRows:   ()    => FILTERED,
    setRows:   (sorted) => { FILTERED = sorted; renderTable(); },
    onFilter:  (col, set) => { COL_FILTERS[col] = set; applyFilters(); },
    getAllRows:()    => ALL_DATA,
    getFilter: (col) => COL_FILTERS[col] || null,
  });
  window.addEventListener('resize', fixMainMargin, { passive: true });
  setTimeout(fixMainMargin, 200);
  loadData();
}

function fixMainMargin() {
  const ctrlBar  = document.querySelector('.ctrl-bar');
  const statsBar = g('stats-bar');
  const main     = document.querySelector('.bux-main');
  const wrap     = g('bux-table-wrap');
  if (!statsBar || !main || !ctrlBar) return;

  const ctrlBottom  = ctrlBar.getBoundingClientRect().bottom;
  const statsHeight = statsBar.offsetHeight;

  statsBar.style.top   = ctrlBottom + 'px';
  main.style.marginTop = (ctrlBottom + statsHeight + 8) + 'px';

  // Mobilda jadval gorizontal scroll, desktop — hidden
  if (wrap) {
    if (window.innerWidth <= 600) {
      wrap.style.overflowX = 'auto';
    } else {
      wrap.style.overflowX = '';
    }
  }
}

// ─── Fixed header (scroll da muzlab turishi uchun) ────
let fixedHeaderEl = null;

function initFixedHeader() {
  // Oldingi clone bo'lsa o'chiramiz
  if (fixedHeaderEl) { fixedHeaderEl.remove(); fixedHeaderEl = null; }

  const wrap = document.createElement('div');
  wrap.className = 'fixed-thead-wrap';
  wrap.id = 'fixed-thead-wrap';

  const tbl = document.createElement('table');
  tbl.className = 'bux-table';
  tbl.style.minWidth = '0';
  tbl.style.margin   = '0';

  const cloneThead = document.createElement('thead');
  cloneThead.id = 'fixed-thead-clone';
  tbl.appendChild(cloneThead);
  wrap.appendChild(tbl);
  document.body.appendChild(wrap);
  fixedHeaderEl = wrap;

  window.addEventListener('scroll', syncFixedHeader, { passive: true });
  window.addEventListener('resize', syncFixedHeader, { passive: true });
}

function syncFixedHeader() {
  const origThead = g('bux-thead');
  const wrap      = g('bux-table-wrap');
  const fixedWrap = g('fixed-thead-wrap');
  const clone     = g('fixed-thead-clone');
  if (!origThead || !wrap || !fixedWrap || !clone) return;

  const theadRect = origThead.getBoundingClientRect();
  const statsBar  = g('stats-bar');
  const fixedTop  = statsBar ? statsBar.getBoundingClientRect().bottom : 154;

  if (theadRect.bottom < fixedTop + 2) {
    // Clone bir marta qurish
    if (!clone.querySelector('tr')) {
      clone.innerHTML = origThead.innerHTML;
    }

    // Ustun kengliklarini sinxronlashtirish
    const origCells  = origThead.querySelectorAll('th');
    const cloneCells = clone.querySelectorAll('th');
    origCells.forEach((th, i) => {
      if (cloneCells[i]) {
        const w = th.getBoundingClientRect().width;
        cloneCells[i].style.width    = w + 'px';
        cloneCells[i].style.minWidth = w + 'px';
        cloneCells[i].style.maxWidth = w + 'px';
        // Sticky ustunning pozitsiyasini ham ko'chirish
        if (th.style.position === 'sticky' || getComputedStyle(th).position === 'sticky') {
          cloneCells[i].style.position = 'sticky';
          cloneCells[i].style.right    = th.style.right || getComputedStyle(th).right;
          cloneCells[i].style.zIndex   = '4';
        }
      }
    });

    // Jadval eni va gorizontal scroll sinxronlashtirish
    const cloneTbl = fixedWrap.querySelector('table');
    if (cloneTbl) {
      cloneTbl.style.width     = wrap.scrollWidth + 'px';
      cloneTbl.style.minWidth  = '0';
      cloneTbl.style.transform = `translateX(-${wrap.scrollLeft}px)`;
    }

    // Viewport ga to'g'ri joylashish — wrap ning chap va o'ng chegarasini olish
    const wrapRect = wrap.getBoundingClientRect();
    fixedWrap.style.top      = fixedTop + 'px';
    fixedWrap.style.left     = wrapRect.left + 'px';
    fixedWrap.style.width    = wrapRect.width + 'px';
    fixedWrap.style.overflow = 'hidden';

    fixedWrap.classList.add('visible');
  } else {
    fixedWrap.classList.remove('visible');
  }
}

// Wrapper scroll qilganda (gorizontal) ham sinxronlashsin
function initScrollSync() {
  const wrap = g('bux-table-wrap');
  if (wrap) wrap.addEventListener('scroll', syncFixedHeader, { passive: true });
}

// ─── Ustun berkitish tizimi ──────────────────────
const COL_LABELS = {
  maktab: 'Maktab',
  sinf:   'Sinf',
  tel:    'Telefon',
  qayd:   'Qaydnoma',
  ehtimoliy: "Ehtimoliy to'lov sanasi",
  gap:    'Gaplashilgan',
  kerak:  "To'lov kerak",
  qildi:  "To'lov qildi",
  sana:   "To'lov sanasi",
  holat:  "To'lov holati",
  kvit:   'Kvitansiya',
};

let hiddenCols = new Set(
  JSON.parse(localStorage.getItem('bux_hidden_cols') || '[]')
);

function toggleCol(col) {
  if (hiddenCols.has(col)) {
    hiddenCols.delete(col);
  } else {
    hiddenCols.add(col);
  }
  localStorage.setItem('bux_hidden_cols', JSON.stringify([...hiddenCols]));
  applyColVisibility();
  fixMainMargin();
}

function applyColVisibility() {
  Object.keys(COL_LABELS).forEach(col => {
    const display = hiddenCols.has(col) ? 'none' : '';
    document.querySelectorAll(`th.col-${col}, td.col-${col}`).forEach(el => {
      el.style.display = display;
    });
  });
  renderHiddenChips();
  const clone = g('fixed-thead-clone');
  if (clone) clone.innerHTML = '';
  const cloneTbl = document.querySelector('#fixed-thead-wrap table');
  if (cloneTbl) cloneTbl.style.width = '';
  setTimeout(syncFixedHeader, 30);
}

function renderHiddenChips() {
  const bar = g('hidden-cols-bar');
  if (!bar) return;
  if (hiddenCols.size === 0) {
    bar.innerHTML = '';
    return;
  }
  bar.innerHTML = [...hiddenCols].map(col => `
    <button class="hidden-col-chip" onclick="toggleCol('${col}')" title="Ko'rsatish">
      ${COL_LABELS[col]} <span class="chip-plus">+</span>
    </button>
  `).join('');
}

// ─── Oy navigatsiyasi ────────────────────────────
function changeOy(dir) {
  CURRENT_OY = dir > 0 ? nextOy(CURRENT_OY) : prevOy(CURRENT_OY);
  g('oy-label').textContent = oyNomi(CURRENT_OY);
  // Tanlangan oyni saqlash (refresh da qaytsin)
  localStorage.setItem('iit_bux_oy', CURRENT_OY);
  // Oy o'zgarganda stat filterni reset qilish
  STAT_FILTER = '';
  ['all','toliq','qarzdor','nofaol','empty'].forEach(t => {
    const el = g('stat-btn-' + t);
    if (el) el.classList.remove('active');
  });
  loadData();
}

// ─── Ma'lumot yuklash ────────────────────────────
async function loadData() {
  if (isQabulOy(CURRENT_OY)) { await loadQabulData(); return; }

  g('bux-tbody').innerHTML = `<tr><td colspan="13" class="bux-loading">⏳ Yuklanmoqda…</td></tr>`;
  clearStats();
  setTimeout(fixMainMargin, 100);

  try {
    // Parallel: barcha o'quvchilar + bu oylik to'lovlar
    const [studRes, tolovRes] = await Promise.all([
      api.buxGetStudents({ username: U.username, parol: U.parol, oy: CURRENT_OY }),
      api.getTolovlar({ username: U.username, parol: U.parol, oy: CURRENT_OY })
    ]);

    if (!studRes.ok) { showToast('❌ ' + studRes.error, 'error'); return; }

    const students = studRes.students || [];
    const tolovMap = {};
    (tolovRes.tolovlar || []).forEach(t => {
      // Asosiy key: oquvchi_id (eng ishonchli)
      if (t.oquvchi_id) {
        tolovMap[`id:${t.oquvchi_id}`] = t;
      }
      // Zaxira key: ism|familiya|maktab_id (oquvchi_id null bo'lsa)
      const fallback = `${t.oquvchi_ism}|${t.oquvchi_familiya}|${t.maktab_id || ''}`;
      if (!tolovMap[fallback]) tolovMap[fallback] = t;
    });

    // Merge
    ALL_DATA = students.map(s => {
      // Avval ID bilan qidir, topilmasa ism+familiya+maktab bilan
      const byId       = s.id ? tolovMap[`id:${s.id}`] : null;
      const byFallback = tolovMap[`${s.ism}|${s.familiya}|${s.maktab_id || ''}`];
      return { student: s, tolov: byId || byFallback || null };
    });

    applyFilters();
  } catch(e) {
    g('bux-tbody').innerHTML = `<tr><td colspan="15" class="bux-loading">❌ Xatolik: ${e.message}</td></tr>`;
  }
}

// ─── "Qabul 2026-27" — sales moduldan ro'yxatga olindi bo'lgan o'quvchilar ──
//  Ular ham oddiy oy kabi to'liq funksional: qaydnoma, ehtimoliy sana, depozit
//  (to'lov kerak/qildi), kvitansiya — buxgalter bu yerdan oldindan depozit
//  yig'adi, shuning uchun barcha ustunlar va moliyaviy panel ko'rinishi kerak.
async function loadQabulData() {
  g('bux-tbody').innerHTML = `<tr><td colspan="13" class="bux-loading">⏳ Yuklanmoqda…</td></tr>`;
  clearStats();
  setTimeout(fixMainMargin, 100);

  try {
    const [studRes, tolovRes] = await Promise.all([
      api.qabulRoyxati({ username: U.username, parol: U.parol }),
      api.getTolovlar({ username: U.username, parol: U.parol, oy: CURRENT_OY })
    ]);
    if (!studRes.ok) { showToast('❌ ' + studRes.error, 'error'); return; }

    const students = studRes.students || [];
    const tolovMap = {};
    (tolovRes.tolovlar || []).forEach(t => {
      if (t.oquvchi_id) tolovMap[`id:${t.oquvchi_id}`] = t;
      const fallback = `${t.oquvchi_ism}|${t.oquvchi_familiya}|${t.maktab_id || ''}`;
      if (!tolovMap[fallback]) tolovMap[fallback] = t;
    });

    ALL_DATA = students.map(s => {
      const byId       = s.id ? tolovMap[`id:${s.id}`] : null;
      const byFallback = tolovMap[`${s.ism}|${s.familiya}|${s.maktab_id || ''}`];
      return { student: s, tolov: byId || byFallback || null };
    });

    applyFilters();
  } catch (e) {
    g('bux-tbody').innerHTML = `<tr><td colspan="13" class="bux-loading">❌ Xatolik: ${e.message}</td></tr>`;
  }
}

function clearSearch() {
  const inp = g('filter-search');
  if (inp) { inp.value = ''; inp.focus(); }
  updateSearchClear();
  applyFilters();
}
function updateSearchClear() {
  const inp = g('filter-search');
  const btn = g('search-clear');
  if (!inp || !btn) return;
  btn.classList.toggle('visible', inp.value.length > 0);
}

// ColContextMenu bilan bir xil qiymat xaritasi — filter mos kelishi uchun
function getColFilterValue(row, col) {
  const s = row.student || row;
  const t = row.tolov   || {};
  const map = {
    name:   `${s.familiya || ''} ${s.ism || ''}`.trim(),
    maktab: s.maktab  || '',
    sinf:   s.sinf    || '',
    tel:    s.telefon || '',
    qayd:   t.qaydnoma          || '',
    ehtimoliy: t.ehtimoliy_tolov_sanasi || '',
    gap:    t.gaplashilgan_vaqt || '',
    kerak:  parseInt(t.tolov_kerak  || 0),
    qildi:  parseInt(t.tolov_qildi  || 0),
    sana:   t.tolov_sanasi      || '',
    holat:  (parseInt(t.tolov_kerak||0) - parseInt(t.tolov_qildi||0)),
    kvit:   t.kvitansiya_fayl   || '',
    num:    s.id || 0,
  };
  const raw = map[col] !== undefined ? map[col] : '';
  return (raw === null || raw === undefined) ? '' : String(raw).trim();
}

function applyFilters() {
  const maktab     = g('filter-maktab').value;
  const sinf       = g('filter-sinf').value;
  const search     = g('filter-search').value.toLowerCase().trim();

  FILTERED = ALL_DATA.filter(({student: s, tolov: t}) => {
    if (maktab && s.maktab !== maktab) return false;
    if (sinf   && s.sinf   !== sinf)   return false;
    if (search) {
      const full = `${s.ism} ${s.familiya} ${s.telefon} ${s.telefon2 || ''}`.toLowerCase();
      if (!full.includes(search)) return false;
    }
    // Stat card filtri
    if (STAT_FILTER && STAT_FILTER !== 'all') {
      const kerak = t?.tolov_kerak || 0;
      const qildi = t?.tolov_qildi || 0;
      const isNofaol = s.nofaol === true || !!s.chiqgan;
      if (STAT_FILTER === 'toliq'   && !(qildi >= kerak && kerak > 0))             return false;
      if (STAT_FILTER === 'qarzdor' && !(kerak > 0 && qildi < kerak))              return false;
      if (STAT_FILTER === 'nofaol'  && !isNofaol)                                   return false;
      if (STAT_FILTER === 'empty'   && !(kerak <= 0 && !isNofaol))                  return false;
    }
    // Ustun bo'yicha qiymatlar filtri (ColContextMenu orqali o'rnatiladi)
    for (const col in COL_FILTERS) {
      const set = COL_FILTERS[col];
      if (!set) continue; // filter yo'q
      const val = getColFilterValue({ student: s, tolov: t }, col);
      if (!set.has(val)) return false;
    }
    return true;
  });

  buildFilterOptions();
  renderTable();
  updateStats();
}

// ─── Stat card filter ────────────────────────────
function setStatFilter(type) {
  // Toggle: qayta bossa — o'chiradi
  STAT_FILTER = (STAT_FILTER === type) ? '' : type;
  // Active class yangilanishi
  ['all','toliq','qarzdor','nofaol','empty'].forEach(t => {
    const el = g('stat-btn-' + t);
    if (el) el.classList.toggle('active', STAT_FILTER === t);
  });
  applyFilters();
}

function buildFilterOptions() {
  const maktabSel = g('filter-maktab');
  const sinfSel   = g('filter-sinf');
  const curM = maktabSel.value, curS = sinfSel.value;

  const maktablar = [...new Set(ALL_DATA.map(d => d.student.maktab).filter(Boolean))].sort();
  const sinflar   = [...new Set(ALL_DATA.map(d => d.student.sinf).filter(Boolean))].sort();

  maktabSel.innerHTML = '<option value="">🏫 Barcha maktablar</option>'
    + maktablar.map(m => `<option value="${m}"${m===curM?' selected':''}>${m}</option>`).join('');
  sinfSel.innerHTML   = '<option value="">📚 Barcha sinflar</option>'
    + sinflar.map(s => `<option value="${s}"${s===curS?' selected':''}>${s}</option>`).join('');
}

// ─── Jadvalni chizish ────────────────────────────
function renderTable() {
  const tbody = g('bux-tbody');
  if (FILTERED.length === 0) {
    const emptyMsg = isQabulOy(CURRENT_OY)
      ? "Hozircha \"ro'yxatga olindi\" holatidagi o'quvchi yo'q."
      : 'Hozircha ma\'lumot yo\'q. "Oyni boshlash" tugmasini bosing.';
    tbody.innerHTML = `<tr><td colspan="13" class="bux-empty">
      <span class="emoji">💼</span>
      ${emptyMsg}
    </td></tr>`;
    return;
  }

  tbody.innerHTML = FILTERED.map(({student: s, tolov: t}, i) => {
    const kerak  = t?.tolov_kerak || 0;
    const qildi  = t?.tolov_qildi || 0;
    const isNofaol = s.nofaol === true;

    // Qator fon classi — to'lov holatiga qarab
    let rowClass = '';
    if (isNofaol) {
      rowClass = 'row-nofaol';
    } else if (kerak > 0 && qildi >= kerak) {
      rowClass = 'row-toliq';       // to'liq — och yashil
    } else if (kerak > 0 && qildi < kerak) {
      rowClass = 'row-qarzdor';     // qarzdor — och sariq
    }

    // Nofaol belgisi
    const nofaolBadge = isNofaol
      ? `<span class="badge-nofaol-row" title="Chiqgan sana: ${s.chiqgan || '—'}">🚫 ${s.chiqgan || 'Nofaol'}</span> `
      : '';
    const kvFaylRaw = t?.kvitansiya_fayl || '';
    const kvFiles   = parseKvitFiles(kvFaylRaw);

    // Kvitansiya cell
    const kvitCell = kvFiles.length > 0
      ? buildKvitPreview(kvFiles, i)
      : buildDropZone(i);

    return `<tr id="row-${i}" data-idx="${i}" ${rowClass ? `class="${rowClass}"` : ""}>
      <td class="col-num">${i+1}</td>
      <td class="col-name">${nofaolBadge}<span class="name-familiya">${s.familiya}</span><span class="name-ism">${s.ism}</span></td>
      <td class="col-maktab">${s.maktab || '—'}</td>
      <td class="col-sinf">${s.sinf || '—'}</td>
      <td class="col-tel">${s.telefon || '—'}${s.telefon2 ? `<br><span class="tel2">${s.telefon2}</span>` : ''}</td>
      <td class="col-qayd editable" data-field="qaydnoma" onclick="cellClick(${i},'qaydnoma',event)" title="${t?.qaydnoma ? t.qaydnoma.replace(/"/g,'&quot;') : ''}">        <span id="disp-qaydnoma-${i}">${t?.qaydnoma ? t.qaydnoma.replace(/\n/g,'<br>') : '<span class="amount-0">—</span>'}</span>
      </td>
      <td class="col-ehtimoliy editable" data-field="ehtimoliy_tolov_sanasi" onclick="cellClick(${i},'ehtimoliy_tolov_sanasi',event)" style="cursor:pointer;">
        <span id="disp-ehtimoliy_tolov_sanasi-${i}">${t?.ehtimoliy_tolov_sanasi ? tolovSanasi(t.ehtimoliy_tolov_sanasi) : '<span class="amount-0">—</span>'}</span>
      </td>
      <td class="col-gap editable" data-field="gaplashilgan_vaqt" onclick="cellClick(${i},'gaplashilgan_vaqt',event)">
        <span id="disp-gaplashilgan_vaqt-${i}">${t?.gaplashilgan_vaqt ? tolovSanasi(t.gaplashilgan_vaqt) : '<span class="amount-0">—</span>'}</span>
      </td>
      <td class="col-kerak editable" data-field="tolov_kerak" onclick="cellClick(${i},'tolov_kerak',event)">
        <span id="disp-tolov_kerak-${i}">${formatSum(kerak,'kerak')}</span>
      </td>
      <td class="col-qildi editable" data-field="tolov_qildi" onclick="cellClick(${i},'tolov_qildi',event)">
        <span id="disp-tolov_qildi-${i}">${formatSum(qildi,'qildi')}</span>
      </td>
      <td class="col-sana editable" data-field="tolov_sanasi" onclick="cellClick(${i},'tolov_sanasi',event)" style="cursor:pointer;">
        <span id="disp-tolov_sanasi-${i}">${t?.tolov_sanasi ? tolovSanasi(t.tolov_sanasi) : '<span class="amount-0">—</span>'}</span>
      </td>
      <td class="col-holat" id="holat-${i}">${tolovHolati(kerak, qildi)}</td>
      <td class="col-kvit" id="kvit-cell-${i}">${kvitCell}</td>
    </tr>`;
  }).join('');

  // Fixed header clone ni yangilash
  const clone = g('fixed-thead-clone');
  if (clone) {
    const origThead = g('bux-thead');
    if (origThead) clone.innerHTML = origThead.innerHTML;
  }
  // Berkitilgan ustunlarni qo'llash
  applyColVisibility();
  initScrollSync();
  setTimeout(syncFixedHeader, 50);
  setTimeout(fixMainMargin,   50);
  setTimeout(() => {
    if (typeof ColContextMenu !== 'undefined') ColContextMenu.refresh();
  }, 80);
}

function encodeKey(s) {
  return btoa(encodeURIComponent(`${s.ism}|${s.familiya}|${s.admin}`));
}

// ─── Inline tahrirlash ───────────────────────────
let activeEdit   = null;
let selectedCell = null; // { idx, field } — hozir tanlangan yacheyka

// 1-click: yacheykani tanlaydi (Excel/Sheets kabi)
// 2-click: tahrirlash rejimiga kiradi
function cellClick(idx, field, ev) {
  if (activeEdit) {
    const wasEditing = activeEdit.idx === idx && activeEdit.field === field;
    commitEdit(activeEdit.idx, activeEdit.field);
    if (wasEditing) return;
  }

  const isSameCell = selectedCell && selectedCell.idx === idx && selectedCell.field === field;

  if (isSameCell) {
    // 2-chi bosish — tahrirlashga kirish
    selectedCell = null;
    editCell(idx, field, ev);
  } else {
    // 1-chi bosish — faqat tanlash
    if (selectedCell) {
      const prevTd = document.querySelector(`#row-${selectedCell.idx} [data-field="${selectedCell.field}"]`);
      if (prevTd) prevTd.classList.remove('cell-selected');
    }
    selectedCell = { idx, field };
    const td = document.querySelector(`#row-${idx} [data-field="${field}"]`);
    if (td) td.classList.add('cell-selected');
  }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.editable') && !e.target.closest('.cell-input')) {
    if (selectedCell) {
      const prevTd = document.querySelector(`#row-${selectedCell.idx} [data-field="${selectedCell.field}"]`);
      if (prevTd) prevTd.classList.remove('cell-selected');
      selectedCell = null;
    }
  }
}, true);

function editCell(idx, field, ev) {
  if (activeEdit) commitEdit(activeEdit.idx, activeEdit.field);

  // Barcha qolgan cell-selected chegaralarini tozalaymiz (xavfsizlik uchun)
  document.querySelectorAll('.cell-selected').forEach(el => el.classList.remove('cell-selected'));
  selectedCell = null;

  const item    = FILTERED[idx];
  const tolov   = item.tolov || {};
  const dispEl  = g(`disp-${field}-${idx}`);
  const td      = dispEl?.parentElement;
  if (!td) return;

  const curVal = tolov[field] !== undefined ? String(tolov[field] || '') : '';
  const isNum  = ['tarif','tolov_kerak','tolov_qildi'].includes(field);
  const isDate = field === 'tolov_sanasi' || field === 'gaplashilgan_vaqt' || field === 'ehtimoliy_tolov_sanasi';

  // TD o'lchamlarini saqlash (input kengaytirmasin)
  td.style.position = 'relative';
  const tdRect = td.getBoundingClientRect();

  // Display elementini yashiramiz (td kengligi o'zgarmaydi)
  if (dispEl) dispEl.style.visibility = 'hidden';

  // Input ni td ustiga absolut joylashtiramiz
  let inputEl;
  if (isDate) {
    const isoVal = dateUZtoISO(curVal);
    inputEl = document.createElement('input');
    inputEl.type = 'date';
    inputEl.className = 'cell-input cell-input-overlay date-input';
    inputEl.id = `cedit-${field}-${idx}`;
    inputEl.value = isoVal;
    if (field === 'ehtimoliy_tolov_sanasi') {
      inputEl.min = todayISO();   // faqat bugun va kelajakdagi sanalar
    } else {
      inputEl.max = todayISO();   // faqat bugun va o'tmishdagi sanalar
    }
    inputEl.style.cssText = 'cursor:pointer;';
  } else if (!isNum) {
    // Matn maydonlari uchun textarea — uzun matn to'liq ko'rinadi
    inputEl = document.createElement('textarea');
    inputEl.className = 'cell-input cell-input-overlay cell-textarea';
    inputEl.id = `cedit-${field}-${idx}`;
    inputEl.value = curVal;
    inputEl.rows = 2;
    inputEl.inputMode = 'text';
    inputEl.style.cssText = 'resize:none;overflow-y:auto;white-space:pre-wrap;word-break:break-word;height:auto;min-height:100%;';
  } else {
    inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.inputMode = 'numeric';
    inputEl.className = 'cell-input cell-input-overlay';
    inputEl.id = `cedit-${field}-${idx}`;
    inputEl.value = parseInt(curVal) || 0;
    inputEl.autocomplete = 'off';
  }
  td.appendChild(inputEl);
  const inp = inputEl;

  // Boshqa joyga mousedown bo'lganda blur ishga tushadi.
  // inp o'zi bo'lmagan joyga mousedown kelsa — blur ni to'samiz,
  // lekin inp ni fokusda tutamiz va kursor pozitsiyasini o'rnatamiz.
  function onDocMouseDown(e) {
    if (inp.contains(e.target)) return; // inp ichiga bosish — to'smoymiz    e.preventDefault();           // blur bo'lmasin
    // Agar inp tashqarisiga bosilsa — commitEdit
    if (!td.contains(e.target)) {
      document.removeEventListener('mousedown', onDocMouseDown, true);
      commitEdit(idx, field);
    }
  }
  document.addEventListener('mousedown', onDocMouseDown, true);

  if (isDate) {
    inp.focus();
    // Kalendar avtomatik ochilsin
    try { inp.showPicker(); } catch(e) {}
    inp.addEventListener('change', () => commitEdit(idx, field));
    inp.addEventListener('blur',   () => setTimeout(() => commitEdit(idx, field), 200));
  } else {
    inp.focus();

    // Raqam maydonida faqat raqam va navigatsiya tugmalari ishlashi
    if (isNum) {
      inp.addEventListener('keydown', e => {
        const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
                         'Home','End','Tab','Enter','Escape'];
        if (allowed.includes(e.key)) return;
        if (e.ctrlKey || e.metaKey) return;
        if (!/^\d$/.test(e.key)) e.preventDefault();
      });
    }

    inp.addEventListener('blur', () => {
      document.removeEventListener('mousedown', onDocMouseDown, true);
      commitEdit(idx, field);
    });
    inp.addEventListener('keydown', e => {
      // textarea uchun: Enter yangi qator, Tab yoki Ctrl+Enter saqlaydi
      const isTextarea = inp.tagName === 'TEXTAREA';
      if (e.key === 'Tab' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !isTextarea))) {
        e.preventDefault();
        document.removeEventListener('mousedown', onDocMouseDown, true);
        commitEdit(idx, field);
      }
      if (e.key === 'Escape') {
        document.removeEventListener('mousedown', onDocMouseDown, true);
        cancelEdit(idx, field, dispEl.outerHTML);
      }
    });
  }

  activeEdit = { idx, field };
  document.getElementById(`row-${idx}`)?.classList.add('editing');
}

async function commitEdit(idx, field) {
  if (!activeEdit || activeEdit.idx !== idx || activeEdit.field !== field) return;
  activeEdit = null;

  const inp = g(`cedit-${field}-${idx}`);
  if (!inp) return;

  let val = inp.value.trim();
  const isNum  = ['tarif','tolov_kerak','tolov_qildi'].includes(field);
  const isDate = field === 'tolov_sanasi' || field === 'gaplashilgan_vaqt' || field === 'ehtimoliy_tolov_sanasi';

  if (isNum)  val = parseInt(val) || 0;
  if (isDate) val = val ? dateISOtoUZ(val) : '';

  const item = FILTERED[idx];
  if (!item.tolov) item.tolov = {};
  item.tolov[field] = val;

  // Update display
  const td = inp.parentElement;
  inp.remove(); // overlay inputni olib tashlaymiz
  const dispVal = isNum
    ? (field === 'tolov_qildi' ? formatSum(val,'qildi')
       : field === 'tolov_kerak' ? formatSum(val,'kerak')
       : formatSum(val))
    : isDate ? (val ? tolovSanasi(val) : '<span class="amount-0">—</span>')
    : (val || '<span class="amount-0">—</span>');
  const dispEl2 = g(`disp-${field}-${idx}`);
  if (dispEl2) {
    dispEl2.innerHTML = dispVal;
    dispEl2.style.visibility = '';
  } else {
    td.innerHTML = `<span id="disp-${field}-${idx}">${dispVal}</span>`;
  }
  td.style.position = '';

  // To'lov holati ni yangilash
  if (['tolov_kerak','tolov_qildi'].includes(field)) {
    const kerak = item.tolov.tolov_kerak || 0;
    const qildi = item.tolov.tolov_qildi || 0;
    const holatEl = g(`holat-${idx}`);
    if (holatEl) holatEl.innerHTML = tolovHolati(kerak, qildi);
    // Qator fon rangini yangilash
    const row = document.getElementById(`row-${idx}`);
    if (row && !row.classList.contains('row-nofaol')) {
      row.classList.remove('row-toliq', 'row-qarzdor');
      if (kerak > 0 && qildi >= kerak)      row.classList.add('row-toliq');
      else if (kerak > 0 && qildi < kerak)  row.classList.add('row-qarzdor');
    }
  }

  document.getElementById(`row-${idx}`)?.classList.remove('editing');

  // cell-selected ni ham tozalaymiz
  if (selectedCell) {
    const prevTd = document.querySelector(`#row-${selectedCell.idx} [data-field="${selectedCell.field}"]`);
    if (prevTd) prevTd.classList.remove('cell-selected');
    selectedCell = null;
  }

  // Saqlash
  await saveRow(idx);
  updateStats();
}

function cancelEdit(idx, field, oldHtml) {
  activeEdit = null;
  const inp = g(`cedit-${field}-${idx}`);
  if (inp) {
    inp.remove();
    const dispEl = g(`disp-${field}-${idx}`);
    if (dispEl) dispEl.style.visibility = '';
    const td = document.querySelector(`#row-${idx} [data-field="${field}"]`);
    if (td) td.style.position = '';
  }
  document.getElementById(`row-${idx}`)?.classList.remove('editing');
  // cell-selected ni ham tozalaymiz
  if (selectedCell) {
    const prevTd = document.querySelector(`#row-${selectedCell.idx} [data-field="${selectedCell.field}"]`);
    if (prevTd) prevTd.classList.remove('cell-selected');
    selectedCell = null;
  }
}

async function saveRow(idx) {
  const item = FILTERED[idx];
  const s    = item.student;
  const t    = item.tolov || {};

  // Show saving indicator
  showToast('💾 Saqlanmoqda…');

  try {
    const r = await api.saveTolov({
      username:         U.username,
      parol:            U.parol,
      oy:               CURRENT_OY,
      oquvchi_id:       s.id        || null,
      oquvchi_ism:      s.ism,
      oquvchi_familiya: s.familiya,
      maktab_id:        s.maktab_id || null,
      maktab:           s.maktab || '',
      sinf:             s.sinf   || '',
      telefon:          s.telefon || '',
      admin_username:   s.admin  || '',
      tarif:            t.tarif             || 0,
      qaydnoma:         t.qaydnoma          || '',
      ehtimoliy_tolov_sanasi: t.ehtimoliy_tolov_sanasi || '',
      gaplashilgan_vaqt: t.gaplashilgan_vaqt || '',
      tolov_kerak:      t.tolov_kerak       || 0,
      tolov_qildi:      t.tolov_qildi       || 0,
      tolov_sanasi:     t.tolov_sanasi      || '',
      kvitansiya_fayl:  parseKvitFiles(t.kvitansiya_fayl)
    });
    if (r.ok) showToast('✅ Saqlandi', 'success');
    else      showToast('❌ ' + r.error, 'error');
  } catch(e) {
    showToast('❌ Xatolik: ' + e.message, 'error');
  }
}

// ─── Oyni boshlash ───────────────────────────────
async function initOy() {
  const prevO = prevOy(CURRENT_OY);
  const r = await api.initOy({
    username:   U.username,
    parol:      U.parol,
    oy:         CURRENT_OY,
    oldingi_oy: prevO
  });
  if (r.ok) {
    showToast(`✅ ${r.count} ta o'quvchi uchun ${oyNomi(CURRENT_OY)} oyi boshlandi`, 'success');
    loadData();
  } else {
    showToast('❌ ' + r.error, 'error');
  }
}

// ─── Statistika ──────────────────────────────────
function updateStats() {
  let total=0, kerakSum=0, qildiSum=0;
  let toliqCount=0, qarzdorCount=0, nofaolCount=0, emptyCount=0;

  FILTERED.forEach(({student: s, tolov: t}) => {
    total++;
    const kerak = t?.tolov_kerak || 0;
    const qildi = t?.tolov_qildi || 0;
    kerakSum += kerak;
    qildiSum += qildi;

    // Nofaol (chiqib ketgan) o'quvchi — ham nofaol, ham to'lov holatiga sanash
    const isNofaol = s && (s.nofaol || s.chiqgan);
    if (isNofaol) nofaolCount++;

    if (kerak <= 0) {
      if (!isNofaol) emptyCount++;
    } else if (qildi >= kerak) {
      toliqCount++;
    } else {
      qarzdorCount++;
    }
  });

  const qarzSum = Math.max(0, kerakSum - qildiSum);

  g('stat-total').textContent         = total;
  g('stat-toliq-count').textContent   = toliqCount;
  g('stat-qarzdor-count').textContent = qarzdorCount;
  g('stat-nofaol-count').textContent  = nofaolCount;
  g('stat-empty-count').textContent   = emptyCount;
  g('stat-kerak').textContent = kerakSum ? kerakSum.toLocaleString('ru-RU') + " so'm" : '—';
  g('stat-qildi').textContent = qildiSum ? qildiSum.toLocaleString('ru-RU') + " so'm" : '—';
  g('stat-qarz').textContent  = qarzSum  ? qarzSum.toLocaleString('ru-RU')  + " so'm" : '✅ 0';
}
function clearStats() {
  ['stat-total','stat-toliq-count','stat-qarzdor-count','stat-nofaol-count',
   'stat-empty-count','stat-kerak','stat-qildi','stat-qarz'].forEach(id => {
    const el = g(id); if (el) el.textContent = '—';
  });
}

// ─── Export Excel ────────────────────────────────
function exportExcel() {
  const rows = [
    ['№','Familiya Ismi','Maktab','Sinf','Telefon',
     'Qaydnoma',"Ehtimoliy to'lov sanasi",'Gaplashilgan vaqt',"To'lov kerak","To'lov qildi",
     "To'lov sanasi","To'lov holati",'Kvitansiya']
  ];
  FILTERED.forEach(({student: s, tolov: t}, i) => {
    const kerak = t?.tolov_kerak || 0;
    const qildi = t?.tolov_qildi || 0;
    let holat = '—';
    if (kerak > 0) {
      if (qildi > kerak)       holat = `To'liq (+${qildi-kerak} so'm ortiqcha)`;
      else if (qildi === kerak) holat = "To'liq";
      else if (qildi > 0)      holat = `${kerak-qildi} so'm qoldi`;
      else                     holat = `${kerak} so'm qarzdor`;
    }
    rows.push([
      i+1,
      `${s.familiya} ${s.ism}`,
      s.maktab  || '',
      s.sinf    || '',
      s.telefon || '',
      t?.qaydnoma          || '',
      t?.ehtimoliy_tolov_sanasi || '',
      t?.gaplashilgan_vaqt || '',
      kerak,
      qildi,
      t?.tolov_sanasi    || '',
      holat,
      t?.kvitansiya_fayl || ''
    ]);
  });

  // CSV format (Excel tomonidan to'g'ri ochiladi)
  const csvContent = rows.map(r =>
    r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `tolovlar-${CURRENT_OY}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📊 CSV yuklab olindi', 'success');
}

// ─── Yordamchi: sana konversiya ──────────────────
function dateUZtoISO(uz) {
  if (!uz) return '';
  const p = uz.split('.');
  if (p.length === 3) return `${p[2]}-${p[1]}-${p[0]}`;
  return '';
}
function dateISOtoUZ(iso) {
  if (!iso) return '';
  const p = iso.split('-');
  if (p.length === 3) return `${p[2]}.${p[1]}.${p[0]}`;
  return '';
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ─── Toast xabar ────────────────────────────────
let toastTimer = null;
function showToast(msg, type = '') {
  const el = g('bux-toast');
  el.textContent  = msg;
  el.className    = `bux-toast ${type} show`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); }, 2500);
}

// ─── Kvitansiya: ko'p fayl (multi-file) ────────────────────────────────────

// DB da saqlangan qiymatni array ga parse qilish.
// Eski format: "kvit.jpg"  → ["kvit.jpg"]
// Yangi format: '["a.jpg","b.png"]' → ["a.jpg","b.png"]
function parseKvitFiles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {}
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return [];
}

// Drop zona (fayl yo'q bo'lganda ko'rinadigan zona)
function buildDropZone(idx) {
  return `<div class="kvit-drop-zone" id="kvit-dz-${idx}"
    ondragover="kvitDragOver(event,${idx})"
    ondragleave="kvitDragLeave(event,${idx})"
    ondrop="kvitDrop(event,${idx})"
    onclick="kvitDzClick(event,${idx})">
    <input type="file" accept="image/*,.pdf" multiple
      id="kvit-file-inp-${idx}"
      onchange="kvitFileSelected(event,${idx})">
    <span class="kvit-dz-icon">📎</span>
    <span class="kvit-dz-label">Yuklash, tashlang<br>yoki Ctrl+V</span>
  </div>`;
}

// Yuklangan fayllar preview (bir yoki ko'p)
function buildKvitPreview(files, idx) {
  const arr = Array.isArray(files) ? files : parseKvitFiles(files);
  if (arr.length === 0) return buildDropZone(idx);

  const items = arr.map((filename, fi) => {
    const url   = `${BASE}/uploads/${filename}`;
    const isImg = /\.(jpe?g|png|gif|webp|bmp)$/i.test(filename);
    const isPdf = /\.pdf$/i.test(filename);
    const thumb = isImg
      ? `<img src="${url}" class="kvit-thumb"
            onclick="openKvit('${filename}',event)"
            oncontextmenu="kvitContextMenu(event,${idx},${fi})"
            ontouchstart="kvitTouchStart(event,${idx},${fi})"
            ontouchend="kvitTouchEnd(event)"
            ontouchmove="kvitTouchEnd(event)"
            title="Ko'rish | O'ng klik — amallar">`
      : `<span class="kvit-file-icon"
            onclick="openKvit('${filename}',event)"
            oncontextmenu="kvitContextMenu(event,${idx},${fi})"
            ontouchstart="kvitTouchStart(event,${idx},${fi})"
            ontouchend="kvitTouchEnd(event)"
            ontouchmove="kvitTouchEnd(event)"
            title="Ko'rish | O'ng klik — amallar">${isPdf ? '📄' : '📎'}</span>`; 
    return `<div class="kvit-item">${thumb}</div>`;
  }).join('');

  return `<div class="kvit-multi" id="kvit-multi-${idx}">
    ${items}
    <input type="file" accept="image/*,.pdf" multiple
      id="kvit-add-inp-${idx}" style="display:none"
      onchange="kvitAddFileSelected(event,${idx})">
  </div>`;
}

// "+" tugmasi bosilganda yoki clipboard tekshirish
async function kvitAddClick(e, idx) {
  if (e.target.tagName === 'INPUT') return;
  e.preventDefault(); e.stopPropagation();
  if (_pasteActive) return;

  if (navigator.clipboard && navigator.clipboard.read) {
    try {
      const clipItems = await navigator.clipboard.read();
      for (const ci of clipItems) {
        const imgType = ci.types.find(t => t === 'image/png') || ci.types.find(t => t.startsWith('image/'));
        if (imgType) {
          const rawBlob = await ci.getType(imgType);
          const file = await blobToCleanPng(rawBlob);
          if (file) { await doUploadFile(file, idx); return; }
        }
      }
    } catch {}
  }
  const inp = document.getElementById(`kvit-add-inp-${idx}`);
  if (inp) inp.click();
}

function kvitAddFileSelected(e, idx) {
  const files = Array.from(e.target?.files || []);
  if (files.length) doUploadFiles(files, idx);
}

// Drop zona bosilganda: clipboard tekshir, bo'lmasa file dialog
async function kvitDzClick(e, idx) {
  if (e.target.tagName === 'INPUT') return;
  e.preventDefault(); e.stopPropagation();
  if (_pasteActive) return;

  if (navigator.clipboard && navigator.clipboard.read) {
    try {
      const clipItems = await navigator.clipboard.read();
      for (const ci of clipItems) {
        const imgType = ci.types.find(t => t === 'image/png') || ci.types.find(t => t.startsWith('image/'));
        if (imgType) {
          const rawBlob = await ci.getType(imgType);
          const file = await blobToCleanPng(rawBlob);
          if (file) { await doUploadFile(file, idx); return; }
        }
      }
    } catch {}
  }
  const inp = document.getElementById(`kvit-file-inp-${idx}`);
  if (inp) inp.click();
}

function kvitDragOver(e, idx) {
  e.preventDefault(); e.stopPropagation();
  const dz = g(`kvit-dz-${idx}`);
  if (dz) dz.classList.add('drag-over');
}

function kvitDragLeave(e, idx) {
  const dz = g(`kvit-dz-${idx}`);
  if (dz) dz.classList.remove('drag-over');
}

async function kvitDrop(e, idx) {
  e.preventDefault(); e.stopPropagation();
  const dz = g(`kvit-dz-${idx}`);
  if (dz) dz.classList.remove('drag-over');

  const dt = e.dataTransfer;

  // 1-usul: files array
  if (dt?.files?.length > 0) {
    doUploadFiles(Array.from(dt.files), idx);
    return;
  }

  // 2-usul: items dan getAsFile()
  if (dt?.items) {
    const fileItems = Array.from(dt.items).filter(it => it.kind === 'file');
    const files = fileItems.map(it => it.getAsFile()).filter(f => f && f.size > 0);
    if (files.length) { doUploadFiles(files, idx); return; }
  }

  // 3-usul: text/html ichidan <img src>
  const html = dt?.getData('text/html') || '';
  if (html) {
    const imgMatch = html.match(/src=["']([^"']+)["']/i);
    if (imgMatch) {
      const src = imgMatch[1];
      if (src.startsWith('data:image')) {
        try {
          const [meta, b64] = src.split(',');
          const mime  = meta.split(':')[1].split(';')[0];
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const blob  = new Blob([bytes], { type: mime });
          doUploadFiles([new File([blob], 'kvit.png', { type: mime })], idx);
          return;
        } catch {}
      }
      if (src.startsWith('http')) {
        try {
          showToast('⏳ Rasm yuklanmoqda…');
          const blob = await (await fetch(src)).blob();
          doUploadFiles([new File([blob], 'kvit.png', { type: blob.type || 'image/png' })], idx);
          return;
        } catch {}
      }
    }
  }

  // 4-usul: uri-list
  const uri = dt?.getData('text/uri-list') || '';
  if (uri && uri.startsWith('http')) {
    try {
      showToast('⏳ Rasm yuklanmoqda…');
      const blob = await (await fetch(uri)).blob();
      if (blob.type.startsWith('image/')) {
        doUploadFiles([new File([blob], 'kvit.png', { type: blob.type })], idx);
        return;
      }
    } catch {}
  }

  showToast('❌ Faylni topa olmadi — iltimos Ctrl+V yoki "Yuklash" tugmasini ishlating', 'error');
}

function kvitFileSelected(e, idx) {
  const files = Array.from(e.target?.files || []);
  if (files.length) doUploadFiles(files, idx);
}

// Bitta fayl yuklash (paste, clipboard uchun)
async function doUploadFile(file, idx) {
  return doUploadFiles([file], idx);
}

// Ko'p fayl yuklash — asosiy funksiya
async function doUploadFiles(newFiles, idx) {
  if (!newFiles || newFiles.length === 0) return;

  const tooBig = newFiles.find(f => f.size > 5 * 1024 * 1024);
  if (tooBig) { showToast(`❌ "${tooBig.name}" — 5MB dan katta`, 'error'); return; }

  const cell = g(`kvit-cell-${idx}`);
  if (cell) cell.innerHTML = `<span class="kvit-uploading">⏳ Yuklanmoqda…</span>`;
  showToast('⏳ Yuklanmoqda…');

  const uploaded = [];
  for (const file of newFiles) {
    if (!file || file.size === 0) continue;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(`${BASE}/upload`, { method: 'POST', body: fd });
      const d = await r.json();
      if (d.ok) uploaded.push(d.filename);
      else showToast('❌ ' + d.error, 'error');
    } catch { showToast('❌ Yuklashda xatolik', 'error'); }
  }

  if (uploaded.length === 0) {
    if (cell) cell.innerHTML = buildDropZone(idx);
    return;
  }

  if (!FILTERED[idx].tolov) FILTERED[idx].tolov = {};
  const existing = parseKvitFiles(FILTERED[idx].tolov.kvitansiya_fayl);
  FILTERED[idx].tolov.kvitansiya_fayl = [...existing, ...uploaded];
  await saveRow(idx);
  if (cell) cell.innerHTML = buildKvitPreview(FILTERED[idx].tolov.kvitansiya_fayl, idx);
  showToast(`✅ ${uploaded.length} ta fayl yuklandi`, 'success');
}

// Bitta faylni o'chirish (index bo'yicha)
// ─── Mobil uchun long-press → context menu ───────
let _touchTimer = null;
function kvitTouchStart(e, idx, fi) {
  _touchTimer = setTimeout(() => {
    _touchTimer = null;
    // Soxta event yasaymiz — clientX/Y touch dan
    const t = e.touches[0];
    const fakeEvt = { clientX: t.clientX, clientY: t.clientY,
                      preventDefault: () => {}, stopPropagation: () => {} };
    kvitContextMenu(fakeEvt, idx, fi);
  }, 500);
}
function kvitTouchEnd(e) {
  if (_touchTimer) { clearTimeout(_touchTimer); _touchTimer = null; }
}

// ─── Context Menu (o'ng klik) ────────────────
let _ctxIdx     = -1;
let _ctxFileIdx = -1;

function kvitContextMenu(e, idx, fileIdx) {
  e.preventDefault();
  e.stopPropagation();
  _ctxIdx     = idx;
  _ctxFileIdx = fileIdx;

  const menu = g('kvit-ctx-menu');
  if (!menu) return;

  const isMobile = window.innerWidth <= 600;
  if (isMobile) {
    // Mobilda bottom sheet — pozitsiya kerak emas, CSS boshqaradi
    menu.style.left = '';
    menu.style.top  = '';
  } else {
    const mw = 210, mh = 115;
    let x = e.clientX, y = e.clientY;
    if (x + mw > window.innerWidth)  x = window.innerWidth  - mw - 8;
    if (y + mh > window.innerHeight) y = window.innerHeight - mh - 8;
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
  }

  menu.style.display = 'block';

  // Backdrop (mobilda ekraning qolgan qismiga bosilsa yopiladi)
  let bd = g('kvit-ctx-backdrop');
  if (!bd) {
    bd = document.createElement('div');
    bd.id = 'kvit-ctx-backdrop';
    bd.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.35);';
    bd.addEventListener('click', closeKvitCtxMenu);
    document.body.appendChild(bd);
  }
  bd.style.display = isMobile ? 'block' : 'none';

  setTimeout(() => document.addEventListener('click', closeKvitCtxMenu, { once: true }), 0);
}

function closeKvitCtxMenu() {
  const menu = g('kvit-ctx-menu');
  if (menu) menu.style.display = 'none';
  const bd = g('kvit-ctx-backdrop');
  if (bd) bd.style.display = 'none';
}

// Context menu: "O'chirish"
function ctxDeleteKvit() {
  closeKvitCtxMenu();
  if (_ctxIdx < 0) return;
  deleteOneKvit(_ctxIdx, _ctxFileIdx, { stopPropagation: () => {} });
}

// Context menu: "Almashtirish"
function ctxReplaceKvit() {
  closeKvitCtxMenu();
  if (_ctxIdx < 0) return;
  let inp = g('kvit-replace-inp');
  if (!inp) {
    inp = document.createElement('input');
    inp.type   = 'file';
    inp.accept = 'image/*,.pdf';
    inp.id     = 'kvit-replace-inp';
    inp.style.display = 'none';
    document.body.appendChild(inp);
  }
  inp.onchange = null;
  inp.value    = '';
  const capturedIdx     = _ctxIdx;
  const capturedFileIdx = _ctxFileIdx;
  inp.onchange = (e) => replaceOneKvit(capturedIdx, capturedFileIdx, e);
  inp.click();
}

// Context menu: "Yangi qo'shish"
function ctxAddKvit() {
  closeKvitCtxMenu();
  if (_ctxIdx < 0) return;
  const inp = g(`kvit-add-inp-${_ctxIdx}`);
  if (inp) inp.click();
}

// Mavjud faylni yangisiga almashtirish
async function replaceOneKvit(idx, fileIdx, e) {
  const file = e.target?.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast('❌ Fayl 5MB dan katta bo\'lmasin', 'error');
    return;
  }

  const tolov   = FILTERED[idx]?.tolov;
  const files   = parseKvitFiles(tolov?.kvitansiya_fayl);
  const oldFayl = files[fileIdx];

  showToast('⏳ Yuklanmoqda…');
  const fd = new FormData();
  fd.append('file', file);
  try {
    const r = await fetch(`${BASE}/upload`, { method: 'POST', body: fd });
    const d = await r.json();
    if (!d.ok) { showToast('❌ ' + d.error, 'error'); return; }

    if (oldFayl) try { await fetch(`${BASE}/upload/${oldFayl}`, { method: 'DELETE' }); } catch {}

    files[fileIdx] = d.filename;
    FILTERED[idx].tolov.kvitansiya_fayl = files;
    await saveRow(idx);
    const cell = g(`kvit-cell-${idx}`);
    if (cell) cell.innerHTML = buildKvitPreview(files, idx);
    showToast('✅ Almashtirildi', 'success');
  } catch { showToast('❌ Xatolik', 'error'); }
}

async function deleteOneKvit(idx, fileIdx, e) {
  e.stopPropagation();
  if (!confirm("Bu kvitansiya rasmini o'chirasizmi?")) return;

  const tolov = FILTERED[idx]?.tolov;
  const files = parseKvitFiles(tolov?.kvitansiya_fayl);
  const fayl  = files[fileIdx];
  if (!fayl) return;

  try { await fetch(`${BASE}/upload/${fayl}`, { method: 'DELETE' }); } catch {}

  files.splice(fileIdx, 1);
  FILTERED[idx].tolov.kvitansiya_fayl = files;
  await saveRow(idx);

  const cell = g(`kvit-cell-${idx}`);
  if (cell) cell.innerHTML = files.length > 0 ? buildKvitPreview(files, idx) : buildDropZone(idx);
  showToast('🗑️ O\'chirildi');
}

// Barcha fayllarni o'chirish (eski deleteKvit — backward compat)
async function deleteKvit(idx, e) {
  e.stopPropagation();
  if (!confirm("Barcha kvitansiya fayllarini o'chirasizmi?")) return;

  const tolov = FILTERED[idx]?.tolov;
  const files = parseKvitFiles(tolov?.kvitansiya_fayl);
  for (const fayl of files) {
    try { await fetch(`${BASE}/upload/${fayl}`, { method: 'DELETE' }); } catch {}
  }
  FILTERED[idx].tolov.kvitansiya_fayl = [];
  await saveRow(idx);

  const cell = g(`kvit-cell-${idx}`);
  if (cell) cell.innerHTML = buildDropZone(idx);
  showToast('🗑️ O\'chirildi');
}

// Lightbox — ko'p fayllarda navigatsiya
let _lbFiles = [];
let _lbIdx   = 0;

function openKvit(filename, e) {
  e.stopPropagation();
  // Qaysi qatordagi fayllar ichida?
  const row = e.target.closest('tr');
  const rowIdx = parseInt(row?.dataset?.idx ?? '-1');
  const allFiles = rowIdx >= 0
    ? parseKvitFiles(FILTERED[rowIdx]?.tolov?.kvitansiya_fayl)
    : [filename];

  _lbFiles = allFiles.length > 0 ? allFiles : [filename];
  _lbIdx   = _lbFiles.indexOf(filename);
  if (_lbIdx < 0) _lbIdx = 0;
  renderLightbox();
}

function renderLightbox() {
  const lb    = g('kvit-lightbox');
  const inner = g('kvit-lb-inner');
  const name  = g('kvit-lb-name');
  if (!lb || !inner) return;

  const filename = _lbFiles[_lbIdx];
  const url   = `${BASE}/uploads/${filename}`;
  const isImg = /\.(jpe?g|png|gif|webp|bmp)$/i.test(filename);
  const isPdf = /\.pdf$/i.test(filename);

  inner.querySelectorAll('img,iframe').forEach(el => el.remove());
  name.textContent = `${filename}  (${_lbIdx + 1} / ${_lbFiles.length})`;

  if (isImg) {
    const img = document.createElement('img');
    img.src = url; img.alt = filename;
    inner.insertBefore(img, name);
  } else if (isPdf) {
    const fr = document.createElement('iframe');
    fr.src = url + '#toolbar=1';
    inner.insertBefore(fr, name);
  }

  // Navigatsiya tugmalari
  let nav = g('kvit-lb-nav');
  if (!nav) {
    nav = document.createElement('div');
    nav.id = 'kvit-lb-nav';
    nav.className = 'kvit-lb-nav';
    inner.appendChild(nav);
  }
  if (_lbFiles.length > 1) {
    nav.innerHTML = `
      <button class="kvit-lb-arrow" onclick="lbPrev()" title="Oldingi">&#8592;</button>
      <button class="kvit-lb-arrow" onclick="lbNext()" title="Keyingi">&#8594;</button>`;
    nav.style.display = 'flex';
  } else {
    nav.style.display = 'none';
  }

  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function lbPrev() {
  if (_lbFiles.length < 2) return;
  _lbIdx = (_lbIdx - 1 + _lbFiles.length) % _lbFiles.length;
  renderLightbox();
}

function lbNext() {
  if (_lbFiles.length < 2) return;
  _lbIdx = (_lbIdx + 1) % _lbFiles.length;
  renderLightbox();
}

function uploadKvit(idx) {
  const cell = g(`kvit-cell-${idx}`);
  if (!cell) return;
  cell.innerHTML = buildDropZone(idx);
}
function kvitLbClose(e) {
  if (e && e.target && e.target.id !== 'kvit-lightbox' && !e.target.closest('#kvit-lb-close')) return;
  const lb = g('kvit-lightbox');
  if (lb) lb.classList.remove('open');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') kvitLbClose({ target: { id: 'kvit-lightbox' } });
  if (e.key === 'ArrowLeft')  lbPrev();
  if (e.key === 'ArrowRight') lbNext();

  // Delete / Backspace — tanlangan yacheykani tozalash
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCell && !activeEdit) {
    // Input, textarea yoki contenteditable ichida bo'lsa — tegmaymiz
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

    e.preventDefault();

    const { idx, field } = selectedCell;
    const item = FILTERED[idx];
    if (!item) return;

    // Qiymatni tozalash
    if (!item.tolov) item.tolov = {};
    const isNum = ['tarif','tolov_kerak','tolov_qildi'].includes(field);
    item.tolov[field] = isNum ? 0 : '';

    // Display ni yangilash
    const dispEl = g(`disp-${field}-${idx}`);
    if (dispEl) {
      if (isNum) {
        dispEl.innerHTML = field === 'tolov_qildi' ? formatSum(0,'qildi')
                         : field === 'tolov_kerak' ? formatSum(0,'kerak')
                         : formatSum(0);
      } else {
        dispEl.innerHTML = '<span class="amount-0">—</span>';
      }
    }

    // To'lov holati va qator rangini yangilash
    if (isNum) {
      const kerak = item.tolov.tolov_kerak || 0;
      const qildi = item.tolov.tolov_qildi || 0;
      const holatEl = g(`holat-${idx}`);
      if (holatEl) holatEl.innerHTML = tolovHolati(kerak, qildi);
      const row = document.getElementById(`row-${idx}`);
      if (row && !row.classList.contains('row-nofaol')) {
        row.classList.remove('row-toliq', 'row-qarzdor');
        if (kerak > 0 && qildi >= kerak)     row.classList.add('row-toliq');
        else if (kerak > 0 && qildi < kerak) row.classList.add('row-qarzdor');
      }
    }

    saveRow(idx);
    updateStats();
  }
});

// ─── Filter events ───────────────────────────────
window.changeOy       = changeOy;
window.doLogin        = doLogin;
window.doLogout       = doLogout;
window.applyFilters   = applyFilters;
window.exportExcel    = exportExcel;
window.initOy         = initOy;
window.editCell       = editCell;
window.cellClick      = cellClick;
window.uploadKvit     = uploadKvit;
window.deleteKvit     = deleteKvit;
window.openKvit       = openKvit;
window.toggleCol      = toggleCol;
window.kvitDragOver   = kvitDragOver;
window.kvitDragLeave  = kvitDragLeave;
window.kvitDrop       = kvitDrop;
window.kvitFileSelected  = kvitFileSelected;
window.kvitAddFileSelected = kvitAddFileSelected;
window.kvitDzClick     = kvitDzClick;
window.kvitAddClick    = kvitAddClick;
window.kvitLbClose     = kvitLbClose;
window.deleteOneKvit   = deleteOneKvit;
window.replaceOneKvit  = replaceOneKvit;
window.kvitContextMenu = kvitContextMenu;
window.ctxDeleteKvit   = ctxDeleteKvit;
window.ctxReplaceKvit  = ctxReplaceKvit;
window.ctxAddKvit      = ctxAddKvit;
window.closeKvitCtxMenu = closeKvitCtxMenu;
window.kvitTouchStart   = kvitTouchStart;
window.kvitTouchEnd     = kvitTouchEnd;
window.lbPrev          = lbPrev;
window.lbNext          = lbNext;
window.parseKvitFiles  = parseKvitFiles;
// ─── Ctrl+V paste → kvitansiya yuklash ──────────
// Telegram Windows'da CF_DIB (raw BMP data) clipboard'ga qo'yadi.
// e.clipboardData.getAsFile() raw bytes qaytaradi — server saqlaydi lekin brauzer ocholmaydi.
// Yechim: clipboard.read() → image/png blob olish → canvas orqali haqiqiy PNG ga konvert.
document.addEventListener('paste', async (e) => {
  const app = g('app');
  if (!app || app.style.display === 'none') return;

  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  e.preventDefault();

  let fileToUpload = null;

  // 1-usul: navigator.clipboard.read() — brauzer DIB/BMP ni PNG ga o'zi decode qiladi
  if (navigator.clipboard && navigator.clipboard.read) {
    try {
      const clipItems = await navigator.clipboard.read();
      for (const clipItem of clipItems) {
        const imgType = clipItem.types.find(t => t === 'image/png')
                     || clipItem.types.find(t => t.startsWith('image/'));
        if (imgType) {
          const rawBlob = await clipItem.getType(imgType);
          // Canvas orqali haqiqiy PNG yasaymiz (brauzer DIB → PNG decode qiladi)
          fileToUpload = await blobToCleanPng(rawBlob);
          break;
        }
      }
    } catch(err) {
      // Ruxsat rad etildi yoki API yo'q — fallback
    }
  }

  // 2-usul: e.clipboardData — oddiy screenshot/PNG uchun (Telegram uchun ishlamaydi)
  if (!fileToUpload) {
    const items = Array.from(e.clipboardData?.items || []);
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f && f.size > 0) {
          fileToUpload = await blobToCleanPng(f);
          break;
        }
      }
    }
  }

  if (!fileToUpload) return;
  await handlePasteFile(fileToUpload);
});

// Blob/File ni canvas orqali haqiqiy PNG ga o'tkazish
// createImageBitmap brauzer ichida decode qiladi — DIB, BMP, PNG, JPEG hammasi ishlaydi
async function blobToCleanPng(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width  = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close();
    return await new Promise(resolve => {
      canvas.toBlob(b => {
        resolve(b ? new File([b], 'kvit.png', { type: 'image/png' }) : null);
      }, 'image/png');
    });
  } catch(e) {
    // createImageBitmap ishlamadi — original qaytaramiz
    return blob instanceof File ? blob : new File([blob], 'kvit.png', { type: blob.type || 'image/png' });
  }
}

async function handlePasteFile(file) {
  if (!file) return;
  const dropZones  = document.querySelectorAll('.kvit-drop-zone');
  const allTargets = [...dropZones];
  if (allTargets.length === 0) {
    showToast('\u274c Yuklash uchun kvitansiya katakchasi kerak', 'error');
    return;
  }
  if (allTargets.length === 1) {
    const row = allTargets[0].closest('tr');
    const idx = parseInt(row?.dataset?.idx ?? '-1');
    if (idx < 0) return;
    showToast('\ud83d\udccb Rasm yuklanmoqda...');
    await doUploadFiles([file], idx);
  } else {
    showPasteHint(file);
  }
}

let _pasteFile   = null;
let _pasteActive = false;

function showPasteHint(file) {
  if (_pasteActive) return;
  _pasteActive = true;
  _pasteFile   = file;

  showToast('Rasm tayyor — qaysi qatorga yuklashni bosing');

  // Drop zonalar va '+' tugmalarini paste-ready qilish
  document.querySelectorAll('.kvit-drop-zone').forEach(dz => {
    dz.classList.add('paste-ready');
    dz.addEventListener('click', pasteClickHandler, { once: true });
  });

  document.addEventListener('keydown', cancelPasteHint, { once: true });
}

async function pasteClickHandler(e) {
  const dz  = e.currentTarget;
  const row = dz.closest('tr');
  const idx = parseInt(row?.dataset?.idx ?? '-1');
  const fileToUpload = _pasteFile;   // cancelPasteHint dan OLDIN saqlab olamiz
  cancelPasteHint();
  if (idx >= 0 && fileToUpload) await doUploadFiles([fileToUpload], idx);
}

function cancelPasteHint(e) {
  if (e && e.key !== 'Escape') return;
  _pasteActive = false;
  _pasteFile   = null;
  document.querySelectorAll('.kvit-drop-zone.paste-ready').forEach(dz => {
    dz.classList.remove('paste-ready');
    dz.removeEventListener('click', pasteClickHandler);
  });
}

window.showPasteHint  = showPasteHint;
window.cancelPasteHint = cancelPasteHint;