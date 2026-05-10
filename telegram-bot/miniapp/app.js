// ═══════════════════════════════════════════
//  KONFIGURATSIYA
// ═══════════════════════════════════════════
// API_BASE — miniapp qayerdan ochilgan bo'lsa, o'sha serverga so'rov yuboradi
// Local (ngrok): https://xxxx.ngrok-free.app/api
// Production: https://innovateitschool.uz/api
const API_BASE = window.location.origin + '/api';

// ─── Frontend (Web panel) URL ─────────────────────────────────────────────────
// MUHIM: Bu API_BASE dan FARQLI — frontend alohida manzilda ishlaydi!
// Development: 'http://localhost' yoki 'http://localhost:5500' (VS Code Live Server)
// Production:  'https://innovateitschool.uz'
//  const WEB_PANEL_URL = 'http://localhost:5501';
 const WEB_PANEL_URL = 'https://new.innovateitschool.uz';

// ═══════════════════════════════════════════
//  TELEGRAM
// ═══════════════════════════════════════════
const tg     = window.Telegram?.WebApp;
const tgUser = tg?.initDataUnsafe?.user;

if (tg) {
  tg.ready();
  tg.expand();
}

// ═══════════════════════════════════════════
//  HOLAT
// ═══════════════════════════════════════════
let TOKEN        = null;
let ROL          = null;
let USER_ISM     = null;
let MAKTABLAR_RO = [];   // o'qituvchi maktablari (nomlar)
let MAKTAB_ID_MAP = {};  // { '10-maktab': 3 } nom->id
let TEACHER_ID   = null; // o'qituvchi entity_id
let TANLANGAN_M  = null; // tanlangan maktab nomi
let allItems     = [];
let currentList  = null;

// Anketa holati
let anketaPoz      = null;
let anketaMaktablar = []; // tanlangan maktablar
let STEP           = 1;

// ═══════════════════════════════════════════
//  SAHIFA
// ═══════════════════════════════════════════
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ═══════════════════════════════════════════
//  INIT — Sahifa ochilganda
// ═══════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  // TelegramID ni aniqlash
  const tgId = tgUser?.id;

  if (!tgId) {
    // Test rejimi (brauzerda ochilganda)
    showKutish(null, 'Bot orqali oching');
    return;
  }

  try {
    const res  = await fetch(`${API_BASE}/telegram/check/${tgId}`);
    const data = await res.json();

    if (!data.ok) throw new Error(data.error);

    if (data.found) {
      // Biriktirilgan — token bilan dashboardga
      TOKEN    = data.token;
      ROL      = data.rol;
      USER_ISM = data.ism;

      // ─── Admin → to'liq web panelga redirect ──────────────────────────────
      // Admin Telegram Mini App emas, to'liq brauzer panelida ishlashi kerak
      if (ROL === 'admin') {
        const redirectUrl = `${WEB_PANEL_URL}?tg_token=${encodeURIComponent(data.token)}`;
        // Telegram WebApp da tashqi sahifani ochish
        if (tg && tg.openLink) {
          // Foydalanuvchiga tushuntirish
          showAdminRedirect(redirectUrl);
        } else {
          window.location.href = redirectUrl;
        }
        return;
      }
      // ──────────────────────────────────────────────────────────────────────

      showDashboard(data);
    } else if (data.anketaHolat === 'kutilmoqda') {
      // So'rov yuborilgan, kutilmoqda
      showKutish(tgId, 'kutilmoqda');
    } else if (data.anketaHolat === 'rad etildi') {
      // Rad etilgan — kutish sahifasida xabar + qayta ariza berish tugmasi
      showKutish(tgId, 'rad etildi');
    } else {
      // Yangi foydalanuvchi — anketa
      await loadMaktablarAnketa();
      showPage('anketaPage');
      renderSteps();
    }
  } catch (e) {
    console.error(e);
    showPage('anketaPage');
    renderSteps();
  }
});

// ═══════════════════════════════════════════
//  ANKETA — QADAM BOSHQARUVI
// ═══════════════════════════════════════════
function renderSteps() {
  const ind = document.getElementById('stepIndicator');
  ind.innerHTML = [1,2,3].map(i =>
    `<div class="step-dot ${i === STEP ? 'active' : i < STEP ? 'done' : ''}"></div>`
  ).join('');
}

function goStep(n) {
  document.getElementById('step' + STEP).style.display = 'none';
  STEP = n;
  document.getElementById('step' + STEP).style.display = 'block';
  renderSteps();
}

// Pozitsiya tanlash
function selectPoz(val) {
  anketaPoz = val;
  document.querySelectorAll('.poz-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('poz-' + val)?.classList.add('selected');
}

// Qadam 1 → 2
function step1Next() {
  const fish = document.getElementById('a-fish').value.trim();
  const err  = document.getElementById('err1');
  err.classList.remove('show');

  if (!anketaPoz) { err.textContent = '❌ Pozitsiyani tanlang'; err.classList.add('show'); return; }
  if (!fish)       { err.textContent = '❌ Familiya va ismni kiriting'; err.classList.add('show'); return; }

  // Sinf maydonini pozitsiyaga qarab ko'rsatish
  document.getElementById('sinf-wrap').style.display =
    anketaPoz === 'oquvchi' ? 'block' : 'none';

  goStep(2);
}

// Maktab tanlash
function toggleMaktab(nomi) {
  const idx = anketaMaktablar.indexOf(nomi);
  if (idx === -1) anketaMaktablar.push(nomi);
  else anketaMaktablar.splice(idx, 1);

  document.querySelectorAll('.maktab-item').forEach(el => {
    const n = el.dataset.nomi;
    el.classList.toggle('selected', anketaMaktablar.includes(n));
    const chk = el.querySelector('.maktab-check');
    if (chk) chk.textContent = anketaMaktablar.includes(n) ? '✓' : '';
  });
}

// Qadam 2 → 3
function step2Next() {
  const boshqaEl = document.getElementById('a-maktab-boshqa');
  const boshqa   = boshqaEl.value.trim();
  const err      = document.getElementById('err2');
  err.classList.remove('show');

  // Maktablar to'plami
  let maktabStr = anketaMaktablar.join(', ');
  if (boshqa) maktabStr = maktabStr ? maktabStr + ', ' + boshqa : boshqa;

  if (!maktabStr) { err.textContent = '❌ Kamida bitta maktab tanlang yoki kiriting'; err.classList.add('show'); return; }

  const sinf = document.getElementById('a-sinf').value.trim();
  const pozLabels = { oqituvchi:"O'qituvchi", oquvchi:"O'quvchi", xodim:"Xodim", boshqa:"Boshqa" };

  // Yakuniy ko'rib chiqish
  document.getElementById('s-poz').textContent   = pozLabels[anketaPoz] || anketaPoz;
  document.getElementById('s-fish').textContent  = document.getElementById('a-fish').value.trim();
  document.getElementById('s-maktab').textContent = maktabStr;
  if (sinf) {
    document.getElementById('s-sinf').textContent = sinf;
    document.getElementById('s-sinf-row').style.display = 'block';
  }

  goStep(3);
}

// So'rov yuborish
async function submitAnketa() {
  const btn   = document.getElementById('submitBtn');
  const err   = document.getElementById('err3');
  err.classList.remove('show');

  const telefon = document.getElementById('a-telefon').value.trim();
  if (!telefon) { err.textContent = '❌ Telefon raqamini kiriting'; err.classList.add('show'); return; }

  const boshqa  = document.getElementById('a-maktab-boshqa').value.trim();
  let maktabStr = anketaMaktablar.join(', ');
  if (boshqa) maktabStr = maktabStr ? maktabStr + ', ' + boshqa : boshqa;

  btn.disabled = true;
  btn.textContent = 'Yuborilmoqda...';

  try {
    const res = await fetch(`${API_BASE}/telegram/anketa`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramId:  tgUser?.id,
        telegramIsm: tgUser ? `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim() : '',
        pozitsiya:   anketaPoz,
        fish:        document.getElementById('a-fish').value.trim(),
        maktablar:   maktabStr,
        sinf:        document.getElementById('a-sinf').value.trim() || '-',
        telefon
      })
    });
    const data = await res.json();

    if (data.ok) {
      showKutish(tgUser?.id, 'kutilmoqda');
    } else {
      err.textContent = '❌ ' + (data.error || 'Xatolik yuz berdi');
      err.classList.add('show');
    }
  } catch(e) {
    err.textContent = '❌ Server bilan ulanib bo\'lmadi';
    err.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = '📨 So\'rov yuborish';
  }
}

// Maktablarni anketa uchun yuklash
async function loadMaktablarAnketa() {
  const container = document.getElementById('maktablar-list');
  try {
    const res  = await fetch(`${API_BASE}/maktablar`);
    if (!res.ok) throw new Error('Server xatoligi: ' + res.status);
    const data = await res.json();
    const list = data.maktablar || [];

    if (!list.length) {
      container.innerHTML = '<div style="color:var(--hint);font-size:14px">Maktablar mavjud emas. Quyida yozing.</div>';
      document.getElementById('a-maktab-boshqa').style.display = 'block';
      return;
    }
    container.innerHTML = list.map(m => `
      <div class="maktab-item" data-nomi="${m.nomi}" onclick="toggleMaktab('${m.nomi}')">
        <div class="maktab-check"></div>
        <div class="maktab-name">${m.nomi}</div>
      </div>`).join('') +
      '<div class="maktab-item" data-nomi="__boshqa__" onclick="toggleBoshqa()" id="boshqa-item"><div class="maktab-check" id="boshqa-chk"></div><div class="maktab-name">Boshqa...</div></div>';
  } catch(e) {
    console.error('loadMaktablarAnketa xatolik:', e);
    container.innerHTML = '<div style="color:#f87171;font-size:14px">⚠️ Maktablar yuklanmadi. Quyida qo\'lda kiriting.</div>';
    document.getElementById('a-maktab-boshqa').style.display = 'block';
  }
}

function toggleBoshqa() {
  const el = document.getElementById('a-maktab-boshqa');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
  document.getElementById('boshqa-item').classList.toggle('selected');
}

// ═══════════════════════════════════════════
//  KUTISH SAHIFASI
// ═══════════════════════════════════════════
function showKutish(tgId, holat) {
  showPage('kutishPage');

  document.getElementById('kutishId').textContent = tgId || '—';

  const holatEl  = document.getElementById('kutishHolat');
  const iconEl   = document.getElementById('kutishIcon');
  const titleEl  = document.getElementById('kutishTitle');
  const subEl    = document.getElementById('kutishSub');
  const btnEl    = document.getElementById('kutishBtn');

  if (holat === 'kutilmoqda') {
    holatEl.textContent  = '⏳ Kutilmoqda';
    holatEl.className    = 'status-badge status-pending';
    iconEl.textContent   = '⏳';
    titleEl.textContent  = 'So\'rovingiz yuborildi!';
    subEl.textContent    = 'Superadmin ko\'rib chiqadi va tez orada tasdiqlaydi. Tasdiqlangandan so\'ng bildirishnoma keladi.';
    btnEl.textContent    = 'Tushundim';
    btnEl.style.display  = 'block';
    btnEl.onclick        = () => { if (tg) tg.close(); };
  } else if (holat === 'rad etildi') {
    holatEl.textContent  = '❌ Rad etildi';
    holatEl.className    = 'status-badge status-no';
    iconEl.textContent   = '❌';
    titleEl.textContent  = 'So\'rovingiz rad etildi';
    subEl.innerHTML      = 'Qo\'shimcha ma\'lumot uchun <a href="https://t.me/InnovateIT_School_Manager" style="color:var(--accent2)">@InnovateIT_School_Manager</a> ga murojaat qiling.';
    btnEl.textContent    = 'Qaytadan ariza berish';
    btnEl.style.display  = 'block';
    btnEl.onclick        = async () => {
      anketaPoz = null; anketaMaktablar = []; STEP = 1;
      // Maktablar ro'yxatini spinner holatiga qaytarish
      const container = document.getElementById('maktablar-list');
      if (container) container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
      document.getElementById('a-maktab-boshqa').style.display = 'none';
      document.getElementById('a-maktab-boshqa').value = '';
      showPage('anketaPage');
      renderSteps();
      goStep(1);
      await loadMaktablarAnketa();
    };
  } else {
    holatEl.textContent  = holat || '—';
    btnEl.style.display  = 'none';
  }
}

// Kutish sahifasini yopish
function kutishClose() {
  if (tg) tg.close();
}

// ═══════════════════════════════════════════
//  ADMIN — WEB PANELGA YO'NALTIRISH
// ═══════════════════════════════════════════
function showAdminRedirect(url) {
  showPage('loadingPage');
  // Loading sahifasini admin redirect sahifasi sifatida ishlatamiz
  const loadPage = document.getElementById('loadingPage');
  loadPage.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:24px;padding:40px 24px;text-align:center;">
      <div style="width:88px;height:88px;background:linear-gradient(135deg,#6c63ff,#a78bfa);border-radius:24px;display:flex;align-items:center;justify-content:center;font-size:42px;">🖥️</div>
      <div>
        <div style="font-size:20px;font-weight:700;margin-bottom:8px;">Siz Admin sifatida kirdingiз</div>
        <div style="font-size:14px;color:var(--hint);line-height:1.5;">
          Admin paneli to'liq brauzerda ochiladi.<br>
          O'quvchilar va davomatni u yerda boshqaring.
        </div>
      </div>
      <button onclick="openAdminPanel()" style="
        background:linear-gradient(135deg,#6c63ff,#a78bfa);
        color:#fff;border:none;border-radius:16px;
        padding:16px 32px;font-size:16px;font-weight:600;
        cursor:pointer;width:100%;max-width:280px;
        box-shadow:0 4px 20px rgba(108,99,255,0.4);
      ">🌐 Admin panelni ochish</button>
      <div style="font-size:12px;color:var(--hint);">
        Brauzerda avtomatik kirasiz
      </div>
    </div>`;
  // URL ni global ga saqlaymiz
  window._adminPanelUrl = url;
}

function openAdminPanel() {
  if (tg && tg.openLink) {
    tg.openLink(window._adminPanelUrl);
  } else {
    window.location.href = window._adminPanelUrl;
  }
}

// ═══════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════
function showDashboard(data) {
  showPage('dashPage');
  document.getElementById('bottomNav').style.display = 'flex';
  if (tg) tg.BackButton.hide();

  const rolLabels = {
    admin:     '👤 Admin',
    buxgalter: '💼 Buxgalter',
    oqituvchi: "👩‍🏫 O'qituvchi",
    oquvchi:   '🎓 O\'quvchi',
  };
  document.getElementById('topbarName').textContent = USER_ISM || '—';
  document.getElementById('topbarRol').textContent  = rolLabels[ROL] || ROL;

  // O'qituvchi — maktab tanlash va ID larini saqlash
  if (ROL === 'oqituvchi') {
    // Entity ID ni saqlash (sinf-oquvchilar so'rovi uchun kerak)
    TEACHER_ID = data.entityId || null;
    // Maktab nomi → ID xaritasini tuzish
    const nomlar  = data.maktablar   || [];
    const idlar   = data.maktabIdlar || [];
    MAKTAB_ID_MAP = {};
    nomlar.forEach((nom, i) => { if (nom) MAKTAB_ID_MAP[nom] = idlar[i] || null; });

    if (nomlar.length > 1) {
      MAKTABLAR_RO = nomlar;
      const sel = document.getElementById('maktabSelector');
      sel.innerHTML = nomlar.map(m => `<option value="${m}">${m}</option>`).join('');
      TANLANGAN_M = nomlar[0];
      sel.value = TANLANGAN_M;
      document.getElementById('maktabSelectorWrap').style.display = 'flex';
    } else if (nomlar.length === 1) {
      TANLANGAN_M = nomlar[0];
    }
  }

  buildNavBar();
  buildCards();
}

function onMaktabChange() {
  TANLANGAN_M = document.getElementById('maktabSelector').value;
  buildCards();
  // Agar sinflar sahifasida bo'lsa — yangilash
  if (document.getElementById('sinflarPage')?.classList.contains('active')) {
    openSinflar();
  }
}

function buildNavBar() {
  const navMap = {
    admin:     ['students','teachers','davomat'],
    buxgalter: ['tolov'],
    oqituvchi: ['students','davomat'],
    oquvchi:   ['davomat'],
  };
  const show = navMap[ROL] || [];
  ['students','teachers','davomat','tolov'].forEach(id => {
    const el = document.getElementById('nav-' + id);
    if (el) el.style.display = show.includes(id) ? 'flex' : 'none';
  });
}

function buildCards() {
  const grid = document.getElementById('cardsGrid');
  const cardDefs = {
    admin: [
      { icon:'🎓', label:"O'quvchilar", sub:'jami', color:'#6c63ff', action:"openList('students')" },
      { icon:'👩‍🏫', label:"O'qituvchilar", sub:'jami', color:'#8b5cf6', action:"openList('teachers')" },
      { icon:'📋', label:'Davomat', sub:'bugun', color:'#10b981', action:"openList('davomat')" },
      { icon:'💰', label:"To'lovlar", sub:'bu oy', color:'#f59e0b', action:"openList('tolov')" },
    ],
    buxgalter: [
      { icon:'💰', label:"To'lovlar", sub:'bu oy', color:'#f59e0b', action:"openList('tolov')" },
      { icon:'🎓', label:"O'quvchilar", sub:'jami', color:'#6c63ff', action:"openList('students')" },
    ],
    oqituvchi: [
      { icon:'🎓', label:'Sinflar', sub:"o'quvchilar", color:'#6c63ff', action:"openSinflar()" },
      { icon:'📋', label:'Davomatim', sub:'dars kunlari', color:'#10b981', action:"openMyDavomat()" },
    ],
    oquvchi: [
      { icon:'📋', label:'Davomatim', sub:'tarix', color:'#10b981', action:'openOqituvchiDavomat()' },
    ],
  };
  const defs = cardDefs[ROL] || [];
  grid.innerHTML = defs.map(c => `
    <div class="stat-card" style="--card-color:${c.color}" onclick="${c.action}">
      <div class="stat-icon">${c.icon}</div>
      <div class="stat-num" id="stat-${c.action.replace(/[^a-z]/g,'')}">—</div>
      <div class="stat-label">${c.label}</div>
      <div class="stat-sub">${c.sub}</div>
    </div>`).join('');
}

function showDash() {
  showPage('dashPage');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('nav-home')?.classList.add('active');
  if (tg) tg.BackButton.hide();
}

function goBack() {
  // Agar sinf ichidagi o'quvchilar ko'rinayotgan bo'lsa → sinflar sahifasiga
  if (document.getElementById('sinf-oquv-page')?.classList.contains('active')) {
    showPage('sinflarPage');
    if (tg) tg.BackButton.show();
    return;
  }
  // Agar sinflar sahifasida bo'lsa → dashga
  if (document.getElementById('sinflarPage')?.classList.contains('active')) {
    showDash();
    return;
  }
  showDash();
}

// ═══════════════════════════════════════════
//  API SO'ROV
// ═══════════════════════════════════════════
async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  if (res.status === 401) { showPage('loadingPage'); return null; }
  return res.json();
}

// ═══════════════════════════════════════════
//  O'QITUVCHI SINFLAR
// ═══════════════════════════════════════════
async function openSinflar() {
  showPage('sinflarPage');
  if (tg) tg.BackButton.show();

  const wrap = document.getElementById('sinflarContent');
  wrap.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Yuklanmoqda...</div></div>';

  if (!TEACHER_ID) {
    wrap.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>O&#39;qituvchi ID topilmadi</div>';
    return;
  }

  // Tanlangan maktab ID si
  const maktabId = MAKTAB_ID_MAP[TANLANGAN_M] || null;

  try {
    // O'qituvchiga biriktirilgan barcha o'quvchilar (sinf bo'yicha guruhlab)
    const data = await apiGet('/teachers/' + TEACHER_ID + '/oquvchilar');

    if (!data || !data.ok) {
      wrap.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>Ma&#39;lumot yuklanmadi</div>';
      return;
    }

    // Tanlangan maktab bo'yicha filtrlash (maktabId bo'lsa)
    let oquvchilar = data.oquvchilar || [];
    if (maktabId) {
      oquvchilar = oquvchilar.filter(o => o.maktab_id === maktabId || String(o.maktab_id) === String(maktabId));
    }

    // Sinf bo'yicha guruhlash
    const sinfMap = {};
    oquvchilar.forEach(o => {
      const s = o.sinf || '—';
      if (!sinfMap[s]) sinfMap[s] = [];
      sinfMap[s].push(o);
    });

    const sinflar = Object.keys(sinfMap).sort((a, b) => {
      const na = parseInt(a) || 0, nb = parseInt(b) || 0;
      return na - nb || a.localeCompare(b);
    });

    if (!sinflar.length) {
      wrap.innerHTML = '<div class="empty"><div class="empty-icon">📭</div>Biriktirilgan o&#39;quvchi yo&#39;q</div>';
      return;
    }

    window._currentSinfMap = sinfMap;

    wrap.innerHTML = sinflar.map(sinf => {
      // "4-sinf" yoki "4" → "4-sinf", "9-B" → "9-B-sinf" emas, "9-B-sinf" → "9-B-sinf"
      const clean   = sinf.replace(/-sinf$/i, '');
      const parts   = clean.split('-');
      const raqam   = parts[0] || sinf;
      const harf    = parts[1] ? parts[1].toUpperCase() : '';
      const sinfNomi = clean + '-sinf';
      const badge   = harf
        ? `<div class="sinf-num-badge">${raqam}<span class="sinf-harf">${harf}</span></div>`
        : `<div class="sinf-num-badge">${raqam}</div>`;
      return `
      <div class="sinf-card" onclick="showSinfOquvchilar(decodeURIComponent('${encodeURIComponent(sinf)}'))">
        ${badge}
        <div class="sinf-card-info">
          <div class="sinf-card-name">${sinfNomi}</div>
          <div class="sinf-card-count">${sinfMap[sinf].length} ta o\u2019quvchi</div>
        </div>
        <div class="sinf-card-arrow">›</div>
      </div>`;
    }).join('');
  } catch(e) {
    wrap.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>Xatolik yuz berdi</div>';
  }
}

// ═══════════════════════════════════════════
//  O'QITUVCHI DAVOMATI (o'z davomatini ko'radi)
// ═══════════════════════════════════════════

const KUN_NOMLARI = ['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'];
const STATUS_INFO = {
  keldi:   { emoji: '✅', label: 'Keldi',      color: '#10b981' },
  kelmadi: { emoji: '❌', label: 'Kelmadi',    color: '#ef4444' },
  sababli: { emoji: '📋', label: 'Sababli',    color: '#f59e0b' },
  kech:    { emoji: '⏰', label: 'Kech keldi', color: '#8b5cf6' },
};

async function openOqituvchiDavomat() {
  showPage('sinflarPage');
  if (tg) tg.BackButton.show();

  const titleEl = document.querySelector('#sinflarPage .list-title');
  if (titleEl) titleEl.textContent = '📋 Davomatim';

  const wrap = document.getElementById('sinflarContent');
  wrap.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Yuklanmoqda...</div></div>';

  try {
    const data = await apiGet('/davomat/mening-davomatim');

    if (!data || !data.ok) {
      wrap.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>Ma\'lumot yuklanmadi</div>';
      return;
    }

    const records = data.records || [];
    const kunlar  = data.kunlar  || '';
    const fan     = data.fan     || '—';

    const kunRaqamlari = kunlar.split(',').map(k => parseInt(k.trim())).filter(n => n >= 1 && n <= 6);
    const kunNomlar    = kunRaqamlari.map(k => KUN_NOMLARI[k]).join(', ') || '—';

    if (!records.length) {
      wrap.innerHTML =
        '<div class="davomat-info-card">' +
          '<div class="davomat-info-row"><span>📚 Fan</span><strong>' + fan + '</strong></div>' +
          '<div class="davomat-info-row"><span>📅 Dars kunlari</span><strong>' + kunNomlar + '</strong></div>' +
        '</div>' +
        '<div class="empty" style="margin-top:20px">' +
          '<div class="empty-icon">📭</div>Hozircha davomat yozuvi yo\'q' +
        '</div>';
      return;
    }

    const stats = { keldi: 0, kelmadi: 0, sababli: 0, kech: 0 };
    records.forEach(function(r) { if (stats[r.status] !== undefined) stats[r.status]++; });
    const jami = records.length;
    const foiz = jami > 0 ? Math.round((stats.keldi + stats.kech) / jami * 100) : 0;

    let html =
      '<div class="davomat-info-card">' +
        '<div class="davomat-info-row"><span>📚 Fan</span><strong>' + fan + '</strong></div>' +
        '<div class="davomat-info-row"><span>📅 Dars kunlari</span><strong>' + kunNomlar + '</strong></div>' +
        '<div class="davomat-divider"></div>' +
        '<div class="davomat-stats-row">' +
          '<div class="dav-stat"><span class="dav-num" style="color:#10b981">' + stats.keldi + '</span><span class="dav-lbl">Keldi</span></div>' +
          '<div class="dav-stat"><span class="dav-num" style="color:#ef4444">' + stats.kelmadi + '</span><span class="dav-lbl">Kelmadi</span></div>' +
          '<div class="dav-stat"><span class="dav-num" style="color:#f59e0b">' + stats.sababli + '</span><span class="dav-lbl">Sababli</span></div>' +
          '<div class="dav-stat"><span class="dav-num" style="color:#8b5cf6">' + stats.kech + '</span><span class="dav-lbl">Kech</span></div>' +
        '</div>' +
        '<div class="davomat-progress-wrap">' +
          '<div class="davomat-progress-bar" style="width:' + foiz + '%"></div>' +
        '</div>' +
        '<div class="davomat-progress-label">' + foiz + '% davomat · ' + jami + ' kun</div>' +
      '</div>' +
      '<div class="davomat-list-title">Tarix</div>';

    records.forEach(function(r) {
      var si     = STATUS_INFO[r.status] || { emoji: '❓', label: r.status || '—', color: '#888' };
      var dars   = (r.dars_soat > 0 || r.dars_daqiqa > 0) ? (r.dars_soat + 'h ' + r.dars_daqiqa + 'min dars') : '';
      var kech   = r.kech_minut > 0 ? (r.kech_minut + ' min kech') : '';
      var note   = r.izoh ? ('· ' + r.izoh) : '';
      var detail = [dars, kech, note].filter(Boolean).join(' ');

      html +=
        '<div class="davomat-item">' +
          '<div class="dav-status-dot" style="background:' + si.color + '">' + si.emoji + '</div>' +
          '<div class="dav-item-body">' +
            '<div class="dav-item-date">' + (r.sana || '—') + '</div>' +
            '<div class="dav-item-status" style="color:' + si.color + '">' + si.label + '</div>' +
            (detail ? '<div class="dav-item-detail">' + detail + '</div>' : '') +
          '</div>' +
        '</div>';
    });

    wrap.innerHTML = html;
  } catch(e) {
    console.error('openOqituvchiDavomat:', e);
    wrap.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>Xatolik yuz berdi</div>';
  }
}

// ═════════════════════════════
//  O‘QITUVCHI O‘Z DAVOMATI (dars kunlari bo‘yicha)
// ═════════════════════════════
// State for carousel navigation
let MY_DAV_RECORDS = [];
let MY_DAV_KUN_KEYS = [];  // dars kunlari nomlari (tartibli)
let MY_DAV_FAN = '';
let MY_DAV_ISM = '';
let MY_DAV_GROUPED = {};   // { kunNom: [records sorted by date desc] }
let MY_DAV_ALL_DATES = []; // barcha sana (YYYY-MM-DD yoki DD.MM.YYYY) sorted desc
let MY_DAV_CUR_IDX = 0;   // carousel: joriy sana indeksi

async function openMyDavomat() {
  showPage('myDavomatPage');
  if (tg) tg.BackButton.show();

  const wrap = document.getElementById('myDavomatContent');
  wrap.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Yuklanmoqda...</div></div>';

  try {
    const data = await apiGet('/davomat/mening-davomatim');

    if (!data || !data.ok) {
      wrap.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>Ma\'lumot yuklanmadi</div>';
      return;
    }

    MY_DAV_RECORDS = data.records || [];
    const kunlar   = data.kunlar  || '';
    MY_DAV_FAN     = data.fan     || '—';
    MY_DAV_ISM     = data.ism     || USER_ISM || '—';

    const KUN_NOMLARI_MAP = {'1':'Dushanba','2':'Seshanba','3':'Chorshanba','4':'Payshanba','5':'Juma','6':'Shanba','0':'Yakshanba'};
    const kunRaqamlari    = kunlar.split(',').map(k => k.trim()).filter(Boolean);
    MY_DAV_KUN_KEYS       = kunRaqamlari.map(k => KUN_NOMLARI_MAP[k] || k);

    // Barcha unique sanalarni yig'ib sort qilish (yangi → eski)
    const dateSet = new Set(MY_DAV_RECORDS.map(r => r.sana).filter(Boolean));
    MY_DAV_ALL_DATES = Array.from(dateSet).sort((a, b) => {
      // DD.MM.YYYY formatini parse qilish
      const parse = s => {
        const p = s.split('.');
        if (p.length === 3) return new Date(p[2], p[1]-1, p[0]).getTime();
        return new Date(s).getTime();
      };
      return parse(b) - parse(a); // yangi birinchi
    });

    // Dars kunlari bo'yicha guruhlash
    MY_DAV_GROUPED = {};
    MY_DAV_KUN_KEYS.forEach(kn => { MY_DAV_GROUPED[kn] = []; });

    MY_DAV_RECORDS.forEach(r => {
      if (!r.sana) return;
      const p = r.sana.split('.');
      const date = p.length === 3 ? new Date(p[2], p[1]-1, p[0]) : new Date(r.sana);
      const jsDay = date.getDay();
      const myKey = KUN_NOMLARI_MAP[String(jsDay === 0 ? 0 : jsDay)] || '—';
      if (MY_DAV_GROUPED[myKey] !== undefined) {
        MY_DAV_GROUPED[myKey].push(r);
      }
    });

    // Har kun uchun sanani yangi → eskiga sort
    const parseDate = s => {
      const p = s.split ? s.split('.') : [];
      return p.length === 3 ? new Date(p[2], p[1]-1, p[0]).getTime() : new Date(s).getTime();
    };
    Object.keys(MY_DAV_GROUPED).forEach(k => {
      MY_DAV_GROUPED[k].sort((a, b) => parseDate(b.sana) - parseDate(a.sana));
    });

    // Oxirgi sana (index 0 = eng yangi)
    MY_DAV_CUR_IDX = 0;

    renderMyDavomat();
  } catch(e) {
    console.error('openMyDavomat:', e);
    wrap.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>Xatolik yuz berdi</div>';
  }
}

function renderMyDavomat() {
  const wrap = document.getElementById('myDavomatContent');
  const stats = { keldi: 0, kelmadi: 0, sababli: 0, kech: 0 };
  MY_DAV_RECORDS.forEach(r => { if (stats[r.status] !== undefined) stats[r.status]++; });
  const jami = MY_DAV_RECORDS.length;
  const foiz = jami > 0 ? Math.round((stats.keldi + stats.kech) / jami * 100) : 0;

  // ── Info kartasi ──
  let html = '<div class="my-dav-header-card">';
  html += '<div class="my-dav-teacher-name">👩‍🏫 ' + MY_DAV_ISM + '</div>';
  html += '<div class="my-dav-meta-row"><span>📚 Fan</span><strong>' + MY_DAV_FAN + '</strong></div>';
  const kunNomlar = MY_DAV_KUN_KEYS.join(', ') || '—';
  html += '<div class="my-dav-meta-row"><span>📅 Dars kunlari</span><strong>' + kunNomlar + '</strong></div>';
  html += '<div class="my-dav-meta-row"><span>🗓️ Jami yozuv</span><strong>' + jami + ' kun</strong></div>';

  if (jami > 0) {
    html += '<div class="davomat-divider"></div>';
    html += '<div class="davomat-stats-row">';
    html += '<div class="dav-stat"><span class="dav-num" style="color:#10b981">' + stats.keldi + '</span><span class="dav-lbl">Keldi</span></div>';
    html += '<div class="dav-stat"><span class="dav-num" style="color:#ef4444">' + stats.kelmadi + '</span><span class="dav-lbl">Kelmadi</span></div>';
    html += '<div class="dav-stat"><span class="dav-num" style="color:#f59e0b">' + stats.sababli + '</span><span class="dav-lbl">Sababli</span></div>';
    html += '<div class="dav-stat"><span class="dav-num" style="color:#8b5cf6">' + stats.kech + '</span><span class="dav-lbl">Kech</span></div>';
    html += '</div>';
    html += '<div class="davomat-progress-wrap"><div class="davomat-progress-bar" style="width:' + foiz + '%"></div></div>';
    html += '<div class="davomat-progress-label">' + foiz + '% davomat · ' + jami + ' yozuv</div>';
  }
  html += '</div>';

  // ── Bo'sh holat ──
  if (!MY_DAV_RECORDS.length) {
    html += '<div class="empty" style="margin-top:16px"><div class="empty-icon">📭</div>Hozircha davomat yozuvi yo\'q</div>';
    wrap.innerHTML = html;
    return;
  }

  // ── Carousel — sana navigatsiya ──
  const totalDates = MY_DAV_ALL_DATES.length;
  const curSana    = MY_DAV_ALL_DATES[MY_DAV_CUR_IDX] || '';
  const hasPrev    = MY_DAV_CUR_IDX < totalDates - 1;  // eskiga = indeks oshadi
  const hasNext    = MY_DAV_CUR_IDX > 0;               // yangi = indeks kamayadi

  // Sana formatlash
  const fmtSana = s => {
    if (!s) return '—';
    const p = s.split('.');
    if (p.length === 3) {
      const OYLAR_SHORT = ['','Yan','Fev','Mar','Apr','May','Iyun','Iyul','Avg','Sen','Okt','Noy','Dek'];
      const KUN_NOMLARI_LOCAL = ['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'];
      const d = new Date(p[2], p[1]-1, p[0]);
      return p[0] + '-' + OYLAR_SHORT[parseInt(p[1])] + ', ' + p[2] + ' — ' + KUN_NOMLARI_LOCAL[d.getDay()];
    }
    return s;
  };

  html += '<div class="my-dav-carousel">';
  html += '<button class="my-dav-nav-btn" onclick="myDavNav(-1)" ' + (!hasPrev ? 'disabled' : '') + '>‹</button>';
  html += '<div class="my-dav-carousel-center">';
  html += '<div class="my-dav-carousel-date">' + fmtSana(curSana) + '</div>';
  html += '<div class="my-dav-carousel-pos">' + (totalDates - MY_DAV_CUR_IDX) + ' / ' + totalDates + '</div>';
  html += '</div>';
  html += '<button class="my-dav-nav-btn" onclick="myDavNav(1)" ' + (!hasNext ? 'disabled' : '') + '>›</button>';
  html += '</div>';

  // ── Joriy sanadagi davomatlar (barcha dars kunlari uchun) ──
  // Joriy sanaga tegishli recordlar
  const curRecords = MY_DAV_RECORDS.filter(r => r.sana === curSana);

  if (!curRecords.length) {
    html += '<div class="empty" style="margin-top:8px"><div class="empty-icon">📭</div>Bu kun uchun yozuv yo\'q</div>';
  } else {
    html += '<div class="davomat-list-title">Dars kunlari bo\'yicha</div>';

    // Dars kunlari bo'yicha guruhlash (joriy sana ichida)
    const kunGroups = {};
    MY_DAV_KUN_KEYS.forEach(kn => { kunGroups[kn] = []; });

    curRecords.forEach(r => {
      const p = (r.sana || '').split('.');
      const d = p.length === 3 ? new Date(p[2], p[1]-1, p[0]) : new Date(r.sana);
      const KUN_NOMLARI_MAP2 = {'0':'Yakshanba','1':'Dushanba','2':'Seshanba','3':'Chorshanba','4':'Payshanba','5':'Juma','6':'Shanba'};
      const kn = KUN_NOMLARI_MAP2[String(d.getDay())] || '—';
      if (kunGroups[kn] !== undefined) kunGroups[kn].push(r);
      else { if (!kunGroups['—']) kunGroups['—'] = []; kunGroups['—'].push(r); }
    });

    // Bir sana odatda bitta yozuv, lekin barcha record larni ko'rsat
    curRecords.forEach(r => {
      var si = STATUS_INFO[r.status] || { emoji: '❓', label: r.status || '—', color: '#888' };
      var dars = (r.dars_soat > 0 || r.dars_daqiqa > 0) ? (r.dars_soat + 'h ' + r.dars_daqiqa + 'min dars') : '';
      var kech = r.kech_minut > 0 ? (r.kech_minut + ' min kech') : '';
      var note = r.izoh ? ('· ' + r.izoh) : '';
      var detail = [dars, kech, note].filter(Boolean).join(' ');

      html += '<div class="davomat-item">';
      html += '<div class="dav-status-dot" style="background:' + si.color + '">' + si.emoji + '</div>';
      html += '<div class="dav-item-body">';
      html += '<div class="dav-item-date">' + (r.fan || MY_DAV_FAN) + '</div>';
      html += '<div class="dav-item-status" style="color:' + si.color + '">' + si.label + '</div>';
      if (detail) html += '<div class="dav-item-detail">' + detail + '</div>';
      html += '</div></div>';
    });
  }

  // ── Barcha dars kunlari bo'yicha umumiy ko'rinish ──
  html += '<div class="davomat-list-title" style="margin-top:20px">Dars kunlari statistikasi</div>';
  MY_DAV_KUN_KEYS.forEach(kunNom => {
    const recs = MY_DAV_GROUPED[kunNom] || [];
    const ks = { keldi:0, kelmadi:0, sababli:0, kech:0 };
    recs.forEach(r => { if(ks[r.status]!==undefined) ks[r.status]++; });
    const kFoiz = recs.length > 0 ? Math.round((ks.keldi + ks.kech) / recs.length * 100) : 0;

    html += '<div class="my-dav-kun-section">';
    html += '<div class="my-dav-kun-header">';
    html += '<span class="my-dav-kun-name">📌 ' + kunNom + '</span>';
    html += '<span class="my-dav-kun-count">' + recs.length + ' yozuv</span>';
    html += '</div>';
    if (!recs.length) {
      html += '<div class="my-dav-empty-kun">Yozuv yo\'q</div>';
    } else {
      html += '<div style="display:flex;gap:12px;font-size:12px;margin-bottom:6px;">';
      html += '<span style="color:#10b981">✅ ' + ks.keldi + '</span>';
      html += '<span style="color:#ef4444">❌ ' + ks.kelmadi + '</span>';
      html += '<span style="color:#f59e0b">📋 ' + ks.sababli + '</span>';
      html += '<span style="color:#8b5cf6">⏰ ' + ks.kech + '</span>';
      html += '</div>';
      html += '<div class="my-dav-kun-progress-wrap"><div class="davomat-progress-bar" style="width:' + kFoiz + '%"></div></div>';
      html += '<div class="my-dav-kun-foiz">' + kFoiz + '% davomat</div>';
    }
    html += '</div>';
  });

  wrap.innerHTML = html;
}

// Carousel navigatsiya: dir = -1 (eskiga), +1 (yangiga)
function myDavNav(dir) {
  const newIdx = MY_DAV_CUR_IDX - dir; // dir=+1 → yangi (indeks kamayadi)
  if (newIdx < 0 || newIdx >= MY_DAV_ALL_DATES.length) return;
  MY_DAV_CUR_IDX = newIdx;
  renderMyDavomat();
}


function showSinfOquvchilar(sinf) {
  // O'quvchilar ro'yxatini global map dan olamiz (onclick da JSON muammosini hal qilish uchun)
  const oquvchilar = (window._currentSinfMap && window._currentSinfMap[sinf]) || [];

  showPage('sinf-oquv-page');
  if (tg) tg.BackButton.show();

  const _cleanTitle = sinf.replace(/-sinf$/i, '');
  document.getElementById('sinfOquvTitle').textContent = _cleanTitle + "-sinf o'quvchilari";
  const wrap = document.getElementById('sinfOquvContent');

  if (!oquvchilar || !oquvchilar.length) {
    wrap.innerHTML = '<div class="empty"><div class="empty-icon">📭</div>O&#39;quvchi topilmadi</div>';
    return;
  }

  wrap.innerHTML = oquvchilar.map((o, idx) => {
    const init = ((o.familiya || o.ism || '?')[0]).toUpperCase();
    return `<div class="list-item">
      <div class="avatar" style="background:linear-gradient(135deg,#6c63ff,#9b8fff)">${init}</div>
      <div class="item-info">
        <div class="item-name">${o.familiya || ''} ${o.ism || '—'}</div>
        <div class="item-detail">📚 ${o.sinf || '—'}</div>
      </div>
      <span class="sinf-oquv-num-badge">${idx + 1}</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════
//  RO'YXATLAR
// ═══════════════════════════════════════════
// Nav Davomat — rol ga qarab toʻgʻri funksiyani chaqiradi
function navDavomat() {
  if (ROL === 'oqituvchi') {
    openMyDavomat();
  } else {
    openList('davomat');
  }
}

async function openList(type) {
  currentList = type;
  allItems    = [];
  document.getElementById('searchInput').value = '';
  showPage('listPage');
  if (tg) tg.BackButton.show();

  const titles = {
    students: "🎓 O'quvchilar",
    teachers: "👩‍🏫 O'qituvchilar",
    davomat:  '📋 Davomat',
    tolov:    "💰 To'lovlar",
  };
  document.getElementById('listTitle').textContent = titles[type] || type;
  document.getElementById('listContent').innerHTML =
    '<div class="loading"><div class="spinner"></div><div class="loading-text">Yuklanmoqda...</div></div>';

  let data = null;
  const maktab = TANLANGAN_M ? `&maktab=${encodeURIComponent(TANLANGAN_M)}` : '';

  try {
    if (type === 'students')  data = await apiGet('/students?limit=500' + maktab);
    if (type === 'teachers')  data = await apiGet('/teachers' + (maktab ? '?' + maktab.slice(1) : ''));
    if (type === 'davomat') {
      const today = new Date().toLocaleDateString('ru-RU');
      data = await apiGet(`/davomat?sana=${today}` + maktab);
    }
    if (type === 'tolov') {
      const now   = new Date();
      const oy    = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      data = await apiGet(`/buxgalter/tolovlar?oy=${oy}`);
    }
  } catch(e) { /* tarmoq xatoligi */ }

  if (!data) {
    document.getElementById('listContent').innerHTML =
      '<div class="empty"><div class="empty-icon">⚠️</div>Ma\'lumot yuklanmadi</div>';
    return;
  }

  allItems = data.students || data.teachers || data.tolovlar || data.davomatlar || data.rows || [];
  renderList(allItems, type);
}

function renderList(items, type) {
  if (!items?.length) {
    document.getElementById('listContent').innerHTML =
      '<div class="empty"><div class="empty-icon">📭</div>Ma\'lumot topilmadi</div>';
    return;
  }

  let html = '';
  if (type === 'students') {
    items.forEach(s => {
      const init = ((s.familiya||s.ism||'?')[0]).toUpperCase();
      html += `<div class="list-item">
        <div class="avatar">${init}</div>
        <div class="item-info">
          <div class="item-name">${s.familiya||''} ${s.ism||'—'}</div>
          <div class="item-detail">📚 ${s.sinf||'—'} · 📞 ${s.telefon||'—'}</div>
        </div>
      </div>`;
    });
  } else if (type === 'teachers') {
    items.forEach(t => {
      const init = ((t.familiya||t.ism||'?')[0]).toUpperCase();
      html += `<div class="list-item">
        <div class="avatar" style="background:linear-gradient(135deg,#8b5cf6,#a78bfa)">${init}</div>
        <div class="item-info">
          <div class="item-name">${t.familiya||''} ${t.ism||'—'}</div>
          <div class="item-detail">📚 ${t.fan||'—'} · 📞 ${t.telefon||'—'}</div>
        </div>
        <span class="badge badge-blue">O'qituvchi</span>
      </div>`;
    });
  } else if (type === 'davomat') {
    items.forEach(d => {
      const keldi = d.status === 'keldi';
      html += `<div class="list-item">
        <div class="avatar" style="background:${keldi?'#10b981':'#ef4444'}">${d.oquvchi_ism?d.oquvchi_ism[0].toUpperCase():'?'}</div>
        <div class="item-info">
          <div class="item-name">${d.oquvchi_ism||'—'}</div>
          <div class="item-detail">📚 ${d.sinf||'—'} · ${d.sana||''}</div>
        </div>
        <span class="badge ${keldi?'badge-green':'badge-red'}">${keldi?'✅ Keldi':'❌ Kelmadi'}</span>
      </div>`;
    });
  } else if (type === 'tolov') {
    items.forEach(p => {
      const sum = p.tolov_qildi ? Number(p.tolov_qildi).toLocaleString('uz-UZ') : '0';
      const to  = p.tolov_kerak ? Number(p.tolov_kerak).toLocaleString('uz-UZ') : '0';
      const ok  = p.tolov_qildi >= p.tolov_kerak;
      html += `<div class="list-item">
        <div class="avatar" style="background:${ok?'#10b981':'#f59e0b'}">${(p.oquvchi_familiya||p.oquvchi_ism||'?')[0].toUpperCase()}</div>
        <div class="item-info">
          <div class="item-name">${p.oquvchi_familiya||''} ${p.oquvchi_ism||'—'}</div>
          <div class="item-detail">💸 ${sum} / ${to} so'm · ${p.sinf||'—'}</div>
        </div>
        <span class="badge ${ok?'badge-green':'badge-orange'}">${ok?'✅':'⏳'}</span>
      </div>`;
    });
  }

  document.getElementById('listContent').innerHTML = html;
}

function filterList() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  if (!q) { renderList(allItems, currentList); return; }
  const filtered = allItems.filter(item => JSON.stringify(item).toLowerCase().includes(q));
  renderList(filtered, currentList);
}

// ─── Telegram back button ───
if (tg) {
  tg.BackButton.onClick(() => {
    if (document.getElementById('listPage').classList.contains('active')) goBack();
  });
}