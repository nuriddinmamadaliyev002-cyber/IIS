// ═══════════════════════════════════════════════════
//  InnovateIT — O'quvchi Panel JS
//  Telegram orqali biriktirilgan o'quvchilar shu web
//  panel orqali dars jadvali, davomat hamda mavzu va uyga
//  vazifalarni FAQAT KO'RADI (javob yuborish yo'q)
//  (avvalgi mini-app native dashboard sahifasi o'rniga)
// ═══════════════════════════════════════════════════

let U = null; // { ism, entityId, maktabId, maktab, sinf, viaTelegram: true }

const g = id => document.getElementById(id);

const KUN_NOMLARI_MAP = { '1':'Dushanba','2':'Seshanba','3':'Chorshanba','4':'Payshanba','5':'Juma','6':'Shanba','0':'Yakshanba' };
const KUN_TARTIB       = ['Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba','Yakshanba'];
const OY_NOMLARI       = ['','Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

const DAV_STATUS_META = {
  keldi:   { emoji: '✅', label: 'Keldi',      cls: 'k' },
  kelmadi: { emoji: '❌', label: 'Kelmadi',    cls: 'x' },
  sababli: { emoji: '📋', label: 'Sababli',    cls: 's' },
  kech:    { emoji: '⏰', label: 'Kech keldi', cls: 'l' },
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ─── Kirish ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const params  = new URLSearchParams(window.location.search);
  const tgToken = params.get('tg_token');
  if (tgToken) {
    api.setToken(tgToken);
    const payload = api.getUser();
    const ism     = params.get('tg_ism') || payload?.ism || '';
    U = {
      ism,
      viaTelegram: true,
      entityId: payload?.entityId || null,
      maktabId: payload?.maktabId || null,
      maktab:   payload?.maktab   || '',
      sinf:     payload?.sinf     || '',
      avatar:   payload?.avatar   || null,
    };
    localStorage.setItem('iit_ouq_u', JSON.stringify(U));
    window.history.replaceState({}, '', window.location.pathname);
    clearSavedTab(); // botdan yangi kirish — oxirgi ko'rilgan tab emas, boshidan boshlanadi
    showApp();
    return;
  }

  try {
    const saved = localStorage.getItem('iit_ouq_u');
    if (saved && api.isLoggedIn()) {
      U = JSON.parse(saved);
      showApp();
    } else {
      localStorage.removeItem('iit_ouq_u');
    }
  } catch (e) { localStorage.removeItem('iit_ouq_u'); }
});

function doLogout() {
  U = null;
  api.logout();
  localStorage.removeItem('iit_ouq_u');
  clearSavedTab();

  // Bu panel faqat Telegram orqali kiriladi — admin login sahifasiga
  // qaytarish noto'g'ri. Shu sababli saytdan butunlay chiqib ketamiz:
  // avval tabni yopishga harakat qilamiz, bo'lmasa botga qaytaramiz.
  window.close();
  setTimeout(() => {
    window.location.href = 'https://t.me/InnovateIT_School_bot';
  }, 150);
}

function showApp() {
  g('login-screen').style.display = 'none';
  g('app').style.display = 'block';

  const sinfLbl  = U.sinf ? (U.sinf.toLowerCase().includes('sinf') ? U.sinf : U.sinf + '-sinf') : '';
  const roleLine = [U.maktab, sinfLbl ? (sinfLbl + " o'quvchisi") : ''].filter(Boolean).join(', ');
  g('ouq-role').textContent = roleLine;
  g('oq-badge').textContent = U.ism || '';
  const drawerBadge = g('oq-badge-drawer'); // mobil hamburger menyudagi profil qatori
  if (drawerBadge) drawerBadge.textContent = U.ism || '';

  // Jinsiga qarab avatar — admin panelda belgilangan bo'lsa shunga mos,
  // aks holda standart sifatida o'g'il bola rasmi ko'rsatiladi
  const avatarImg = g('ouq-avatar-img');
  if (avatarImg) {
    avatarImg.src = U.avatar === 'ayol' ? 'img/oquvchi-icon-ayol.png' : 'img/oquvchi-icon-erkak.png';
  }

  loadDavomatim();
  ouqJadvalPromise = loadJadvalim();
  restoreSavedTab(); // sahifa yangilanganda (refresh) oxirgi ochiq bo'lgan bo'limga qaytamiz
}

let ouqJadvalPromise = null; // dars kunlari "Mavzu va uyga vazifalar" ochilishidan oldin tayyor bo'lishi uchun

// Oxirgi ochiq bo'lim brauzer tabi (sessionStorage) doirasida eslab qolinadi: sahifa
// yangilansa shu bo'limda qolamiz, tab yopilsa yoki chiqilsa — boshidan (Dars jadvali).
const OUQ_TABS    = ['jadval', 'davomat', 'vazifalar', 'baholar'];
const OUQ_TAB_KEY = 'iit_ouq_tab';

function saveTab(tab) {
  try { sessionStorage.setItem(OUQ_TAB_KEY, tab); } catch (_) { /* private rejim va h.k. — jim o'tamiz */ }
}
function clearSavedTab() {
  try { sessionStorage.removeItem(OUQ_TAB_KEY); } catch (_) {}
}
function restoreSavedTab() {
  let tab = null;
  try { tab = sessionStorage.getItem(OUQ_TAB_KEY); } catch (_) {}
  if (!tab || tab === 'jadval' || !OUQ_TABS.includes(tab)) return;
  if (!g('tab-' + tab) || !g('tab-btn-' + tab)) return;
  switchTab(tab);
}

function switchTab(tab) {
  document.querySelectorAll('.oq-tab-page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.oq-tab-btn').forEach(el => el.classList.remove('active'));
  g('tab-' + tab).classList.add('active');
  g('tab-btn-' + tab).classList.add('active');
  saveTab(tab);
  // Mobil hamburger menyudagi mos band ham "faol" bo'lib ko'rinsin
  document.querySelectorAll('.mn-tab-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'vazifalar') openVazifalarTab();
  if (tab === 'baholar')   openBaholarTab();
}

// ═══════════════════════════════════════════
//  DAVOMAT
// ═══════════════════════════════════════════
let davomatimSana    = new Date(); // joriy ko'rib turilgan oy/yil
let davomatimRecords = [];         // shu oy uchun yuklangan barcha yozuvlar
let davomatimFilter  = null;       // 'keldi' | 'kelmadi' | 'sababli' | 'kech' | null (hammasi)

function changeDavomatimOy(delta) {
  davomatimSana.setMonth(davomatimSana.getMonth() + delta);
  loadDavomatim();
}

async function loadDavomatim() {
  const wrap  = g('ouq-dav-list');
  const stats = g('ouq-dav-stats');
  wrap.innerHTML = '<div class="oq-loading"><div class="loading-spinner"></div></div>';
  stats.innerHTML = '';
  davomatimFilter = null; // oy almashganda filtr tozalanadi

  const oy  = davomatimSana.getMonth() + 1;
  const yil = davomatimSana.getFullYear();
  g('ouq-oy-label').textContent = `${OY_NOMLARI[oy]} ${yil}`;

  try {
    const data = await api.get('/api/davomat/mening-davomatim', { oy, yil });

    if (!data || !data.ok) {
      davomatimRecords = [];
      wrap.innerHTML = '<div class="oq-empty">⚠️ Ma\'lumot yuklanmadi</div>';
      return;
    }

    davomatimRecords = (data.records || []).filter(r => r.sana);
    renderDavomatimStats();
    renderDavomatimList();
  } catch (e) {
    davomatimRecords = [];
    wrap.innerHTML = '<div class="oq-empty">⚠️ Xatolik yuz berdi</div>';
  }
}

function renderDavomatimStats() {
  const stats = g('ouq-dav-stats');
  if (!davomatimRecords.length) { stats.innerHTML = ''; return; }

  const c = { keldi: 0, kelmadi: 0, sababli: 0, kech: 0 };
  davomatimRecords.forEach(r => { if (c[r.status] !== undefined) c[r.status]++; });

  const pill = (status, cls, emoji, label) => `
    <span class="ouq-stat-pill ${cls}${davomatimFilter === status ? ' active' : ''}"
          onclick="toggleDavomatimFilter('${status}')">${emoji} ${label} <b>${c[status]}</b></span>`;

  stats.innerHTML =
    pill('keldi',   'k', '✅', 'Keldi')   +
    pill('kelmadi', 'x', '❌', 'Kelmadi') +
    pill('sababli', 's', '📋', 'Sababli') +
    pill('kech',    'l', '⏰', 'Kech');
}

// Tugma bosilganda — shu status bo'yicha filtrlaydi; qayta bosilsa hammasi qaytadi ko'rsatiladi
function toggleDavomatimFilter(status) {
  davomatimFilter = (davomatimFilter === status) ? null : status;
  renderDavomatimStats();
  renderDavomatimList();
}

function renderDavomatimList() {
  const wrap = g('ouq-dav-list');

  if (!davomatimRecords.length) {
    wrap.innerHTML = '<div class="oq-empty">📭 Bu oyda davomat belgilanmagan</div>';
    return;
  }

  const filtered = davomatimFilter
    ? davomatimRecords.filter(r => r.status === davomatimFilter)
    : davomatimRecords;

  if (!filtered.length) {
    wrap.innerHTML = '<div class="oq-empty">📭 Bu holatda yozuv topilmadi</div>';
    return;
  }

  // Sana bo'yicha kamayish tartibida (server allaqachon shu tartibda beradi)
  wrap.innerHTML = filtered.map(r => {
    const meta = DAV_STATUS_META[r.status] || { emoji: '❔', label: r.status || '—', cls: '' };
    return `
      <div class="ouq-dav-row">
        <span class="ouq-dav-date">${esc(formatSana(r.sana))}</span>
        <span class="ouq-dav-badge ${meta.cls}">${meta.emoji} ${meta.label}</span>
        ${r.izoh ? `<div class="ouq-dav-izoh">💬 ${esc(r.izoh)}</div>` : ''}
      </div>`;
  }).join('');
}

// "YYYY-MM-DD" yoki "DD.MM.YYYY" -> "22-Avgust, 2026"
function formatSana(sana) {
  let y, m, d;
  if (/^\d{4}-\d{2}-\d{2}/.test(sana)) {
    [y, m, d] = sana.slice(0, 10).split('-');
  } else if (/^\d{2}\.\d{2}\.\d{4}/.test(sana)) {
    [d, m, y] = sana.slice(0, 10).split('.');
  } else {
    return sana;
  }
  const oy = OY_NOMLARI[parseInt(m, 10)] || m;
  return `${parseInt(d, 10)}-${oy}, ${y}`;
}

// ═══════════════════════════════════════════
//  DARS JADVALI
// ═══════════════════════════════════════════
// O'quvchining dars o'tiladigan hafta kunlari (Date.getDay() qiymatlari: 1=Du ... 6=Sha).
// Bo'sh bo'lsa — jadval topilmagan, shunda "Mavzu va uyga vazifalar" sana kartasida
// har qanday kunni tanlash mumkin (o'qituvchi paneli bilan bir xil mantiq).
let ouqDarsKunlari = new Set();

async function loadJadvalim() {
  const wrap = g('ouq-jadval-content');
  wrap.innerHTML = '<div class="oq-loading"><div class="loading-spinner"></div></div>';

  try {
    const data = await api.get('/api/jadval/mening-jadvalim');

    if (!data || !data.ok) {
      wrap.innerHTML = '<div class="oq-empty">⚠️ Ma\'lumot yuklanmadi</div>';
      return;
    }

    if (data.xabar && !(data.jadvallar || []).length) {
      wrap.innerHTML = `<div class="oq-empty">📭 ${esc(data.xabar)}</div>`;
      return;
    }

    const jadvallar = data.jadvallar || [];
    ouqDarsKunlari = new Set();
    jadvallar.forEach(j => {
      (j.kunlar || '').split(',').map(k => parseInt(k.trim(), 10))
        .filter(n => n >= 0 && n <= 6).forEach(n => ouqDarsKunlari.add(n));
    });
    if (!jadvallar.length) {
      wrap.innerHTML = '<div class="oq-empty">📅 Dars jadvali hali kiritilmagan</div>';
      return;
    }

    const byKun = {};
    KUN_TARTIB.forEach(k => { byKun[k] = []; });

    jadvallar.forEach(j => {
      const kunStr = (j.kunlar || '').trim();
      if (!kunStr) return;
      kunStr.split(',').map(k => k.trim()).filter(Boolean).forEach(k => {
        const kunNom = KUN_NOMLARI_MAP[k] || k;
        if (byKun[kunNom] !== undefined) {
          const exists = byKun[kunNom].find(x => x.fan === j.fan && x.teacher_ism === j.teacher_ism && x.teacher_familiya === j.teacher_familiya);
          if (!exists) byKun[kunNom].push(j);
        }
      });
    });

    const today = new Date();
    const todayNom = KUN_NOMLARI_MAP[String(today.getDay())] || '';

    let html = '';
    KUN_TARTIB.forEach(kun => {
      const darslar = byKun[kun];
      if (!darslar.length) return;
      const isToday = kun === todayNom;
      html += `
        <div class="jadval-kun-blok ${isToday ? 'jadval-bugun' : ''}">
          <div class="jadval-kun-sarlavha">
            ${isToday ? '🟢 ' : ''}${kun}${isToday ? '<span class="jadval-bugun-badge">bugun</span>' : ''}
          </div>
          ${darslar.map(d => `
            <div class="jadval-dars-karta">
              <div style="min-width:76px;">
                <div class="jadval-vaqt-text">${esc(d.boshlanish || '—')}</div>
                ${d.tugash ? `<div class="jadval-vaqt-end">${esc(d.tugash)}</div>` : ''}
              </div>
              <div>
                <div class="jadval-fan">${esc(d.fan || '—')}</div>
                <div class="jadval-sinf">${esc(`${d.teacher_familiya || ''} ${d.teacher_ism || ''}`.trim())}</div>
              </div>
            </div>`).join('')}
        </div>`;
    });

    wrap.innerHTML = html || '<div class="oq-empty">📅 Jadval ma\'lumotlari mavjud emas</div>';
  } catch (e) {
    wrap.innerHTML = '<div class="oq-empty">⚠️ Xatolik yuz berdi</div>';
  }
}

// ═══════════════════════════════════════════
//  MAVZU VA UYGA VAZIFALAR (faqat ko'rish)
//  Yuqorida sana kartasi: o'quvchining dars kuniga mos
//  kun uchun yuborilgan mavzu, uyga vazifa va (bo'lsa)
//  o'qituvchi biriktirgan fayl ko'rsatiladi.
// ═══════════════════════════════════════════
let vazifalarimList = [];   // serverdan kelgan barcha mavzu/vazifalar
let vzmCurDate      = null; // hozir tanlangan sana (Date, 00:00 mahalliy)
let vzmLoaded       = false;

function dateStrLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function resolveUploadUrl(filename) {
  if (!filename) return '';
  if (filename.startsWith('http')) return filename;
  const base = (typeof BASE !== 'undefined') ? BASE : '';
  return `${base}/uploads/${filename}`;
}

function vzmBugun() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }

// Dars kuni ekanmi? Jadval topilmasa — har kun dars kuni deb hisoblanadi
function vzmIsLessonDay(d) {
  return !ouqDarsKunlari.size || ouqDarsKunlari.has(d.getDay());
}

// fromDate dan dir (-1 oldin / +1 keyin) yo'nalishda eng yaqin dars kuni; bugundan keyingisi yo'q
function vzmFindLessonDate(fromDate, dir) {
  const today = vzmBugun();
  const d = new Date(fromDate); d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 400; i++) {            // ~1 yilgacha orqaga qaraydi
    d.setDate(d.getDate() + dir);
    if (dir > 0 && d > today) return null;
    if (vzmIsLessonDay(d)) return new Date(d);
  }
  return null;
}

async function openVazifalarTab() {
  if (ouqJadvalPromise) { try { await ouqJadvalPromise; } catch (_) {} } // dars kunlari tayyor bo'lsin

  if (!vzmCurDate) {
    const today = vzmBugun();
    vzmCurDate = vzmIsLessonDay(today) ? today : (vzmFindLessonDate(today, -1) || today);
  }
  g('vzm-date-picker').max = dateStrLocal(vzmBugun());
  setVzmDateUI();
  updateVzmNavBtns();
  await loadVazifalarim();
}

function setVzmDateUI() {
  const d = vzmCurDate;
  g('vzm-date-display').textContent = `${d.getDate()}-${OY_NOMLARI[d.getMonth() + 1]}, ${d.getFullYear()}`;
  g('vzm-date-sub').textContent     = KUN_NOMLARI_MAP[String(d.getDay())] || '';
  g('vzm-date-picker').value        = dateStrLocal(d);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  g('vzm-date-picker-text').textContent = `${dd}/${mm}/${d.getFullYear()}`;
}

function updateVzmNavBtns() {
  g('vzm-prev-btn').disabled = !vzmFindLessonDate(vzmCurDate, -1);
  g('vzm-next-btn').disabled = !vzmFindLessonDate(vzmCurDate, 1);
}

function openVzmDatePicker() {
  const inp = g('vzm-date-picker');
  if (!inp) return;
  if (typeof inp.showPicker === 'function') {
    try { inp.showPicker(); return; } catch (e) { /* fallback pastda */ }
  }
  inp.focus();
  inp.click();
}

function changeVzmDate(dir) {
  const nd = vzmFindLessonDate(vzmCurDate, dir);
  if (!nd) return;
  vzmCurDate = nd;
  setVzmDateUI();
  updateVzmNavBtns();
  renderVazifalarim();
}

function onVzmDatePick() {
  const val = g('vzm-date-picker').value;
  if (!val) return;
  const d = new Date(val + 'T00:00:00');

  if (d > vzmBugun()) {
    alert('⚠️ Kelajak sanani tanlash mumkin emas');
    setVzmDateUI();
    return;
  }
  if (!vzmIsLessonDay(d)) {
    alert("⚠️ Bu kun sizning dars kuningiz emas");
    setVzmDateUI();
    return;
  }
  vzmCurDate = d;
  setVzmDateUI();
  updateVzmNavBtns();
  renderVazifalarim();
}

async function loadVazifalarim() {
  const wrap = g('ouq-vazifalar-content');
  wrap.innerHTML = '<div class="oq-loading"><div class="loading-spinner"></div></div>';

  try {
    const data = await api.getMeningVazifalarim();
    if (!data || !data.ok) {
      wrap.innerHTML = '<div class="oq-empty">⚠️ Ma\'lumot yuklanmadi</div>';
      return;
    }
    vazifalarimList = data.vazifalar || [];
    vzmLoaded = true;
    renderVazifalarim();
  } catch (e) {
    wrap.innerHTML = '<div class="oq-empty">⚠️ Xatolik yuz berdi</div>';
  }
}

// Tanlangan sana uchun mavzu/vazifa kartalari — faqat ko'rsatish
function renderVazifalarim() {
  const wrap = g('ouq-vazifalar-content');
  if (!vzmLoaded || !vzmCurDate) return;

  const tanlangan = dateStrLocal(vzmCurDate);
  const kunVazifalari = vazifalarimList.filter(v => (v.sana || '').slice(0, 10) === tanlangan);

  if (!kunVazifalari.length) {
    wrap.innerHTML = '<div class="oq-empty">📭 Bu kun uchun mavzu va uyga vazifa yuborilmagan</div>';
    return;
  }

  wrap.innerHTML = kunVazifalari.map(v => {
    const teacherIsm = `${v.teacher_familiya || ''} ${v.teacher_ism || ''}`.trim();
    const hasHomework = (v.uy_vazifasi || '').trim().length > 0;
    return `
      <div class="ouq-dav-row" style="display:block;">
        <div style="font-weight:600;">${esc(v.fan || '—')}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;">${esc(formatSana(v.sana))}${teacherIsm ? ' • ' + esc(teacherIsm) : ''}</div>
        ${v.mavzu ? `<div style="margin-top:8px;font-size:13.5px;"><b>Mavzu:</b> ${esc(v.mavzu)}</div>` : ''}
        ${v.mavzu_fayl ? `<div style="margin-top:4px;font-size:12.5px;"><a href="${esc(resolveUploadUrl(v.mavzu_fayl))}" target="_blank" rel="noopener">📎 Mavzu fayli</a></div>` : ''}
        ${hasHomework
          ? `<div style="margin-top:4px;font-size:13.5px;"><b>Uyga vazifa:</b> ${esc(v.uy_vazifasi)}</div>`
          : '<div style="margin-top:4px;font-size:12.5px;color:var(--muted);">Bu darsga uyga vazifa berilmagan</div>'}
        ${v.vazifa_fayl ? `<div style="margin-top:6px;font-size:12.5px;"><a href="${esc(resolveUploadUrl(v.vazifa_fayl))}" target="_blank" rel="noopener">📎 Uyga vazifa fayli</a></div>` : ''}
      </div>`;
  }).join('');
}


// ═══════════════════════════════════════════
//  BAHOLARIM (faqat ko'rish)
//  Sana kartasi orqali dars kunlari bo'yicha o'qituvchi
//  qo'ygan ballar: uyga vazifa, darsdagi faolligi,
//  darsdagi xulqi (1 dan 5 gacha) va ixtiyoriy izoh.
//  Dars kunlari va sana tanlash mantiqi "Mavzu va uyga
//  vazifalar" bilan bir xil.
// ═══════════════════════════════════════════
const BHM_KATEGORIYALAR = [
  { key: 'uy_vazifa', label: 'Uyga vazifa',       icon: '📚' },
  { key: 'faollik',   label: 'Darsdagi faolligi', icon: '🙋' },
  { key: 'xulq',      label: 'Darsdagi xulqi',    icon: '🤝' },
];

let baholarimList = [];   // serverdan kelgan barcha dars kunlari (guruh bo'yicha)
let bhmCurDate    = null; // hozir tanlangan sana (Date, 00:00 mahalliy)
let bhmLoaded     = false;
let bhmSeq        = 0;    // eskirgan javob yangisini bosib ketmasligi uchun

async function openBaholarTab() {
  if (ouqJadvalPromise) { try { await ouqJadvalPromise; } catch (_) {} } // dars kunlari tayyor bo'lsin

  if (!bhmCurDate) {
    const today = vzmBugun();
    bhmCurDate = vzmIsLessonDay(today) ? today : (vzmFindLessonDate(today, -1) || today);
  }
  g('bhm-date-picker').max = dateStrLocal(vzmBugun());
  setBhmDateUI();
  updateBhmNavBtns();
  await loadBaholarim();
}

function setBhmDateUI() {
  const d = bhmCurDate;
  g('bhm-date-display').textContent = `${d.getDate()}-${OY_NOMLARI[d.getMonth() + 1]}, ${d.getFullYear()}`;
  g('bhm-date-sub').textContent     = KUN_NOMLARI_MAP[String(d.getDay())] || '';
  g('bhm-date-picker').value        = dateStrLocal(d);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  g('bhm-date-picker-text').textContent = `${dd}/${mm}/${d.getFullYear()}`;
}

function updateBhmNavBtns() {
  g('bhm-prev-btn').disabled = !vzmFindLessonDate(bhmCurDate, -1);
  g('bhm-next-btn').disabled = !vzmFindLessonDate(bhmCurDate, 1);
}

function openBhmDatePicker() {
  const inp = g('bhm-date-picker');
  if (!inp) return;
  if (typeof inp.showPicker === 'function') {
    try { inp.showPicker(); return; } catch (e) { /* fallback pastda */ }
  }
  inp.focus();
  inp.click();
}

function changeBhmDate(dir) {
  const nd = vzmFindLessonDate(bhmCurDate, dir);
  if (!nd) return;
  bhmCurDate = nd;
  setBhmDateUI();
  updateBhmNavBtns();
  renderBaholarim();
}

function onBhmDatePick() {
  const val = g('bhm-date-picker').value;
  if (!val) return;
  const d = new Date(val + 'T00:00:00');

  if (d > vzmBugun()) {
    alert('⚠️ Kelajak sanani tanlash mumkin emas');
    setBhmDateUI();
    return;
  }
  if (!vzmIsLessonDay(d)) {
    alert("⚠️ Bu kun sizning dars kuningiz emas");
    setBhmDateUI();
    return;
  }
  bhmCurDate = d;
  setBhmDateUI();
  updateBhmNavBtns();
  renderBaholarim();
}

async function loadBaholarim() {
  const wrap = g('ouq-baholar-content');
  const seq  = ++bhmSeq;
  wrap.innerHTML = '<div class="oq-loading"><div class="loading-spinner"></div></div>';

  try {
    const data = await api.getMeningBaholarim();
    if (seq !== bhmSeq) return;
    if (!data || !data.ok) {
      wrap.innerHTML = '<div class="oq-empty">⚠️ Ma\'lumot yuklanmadi</div>';
      return;
    }
    baholarimList = data.darslar || [];
    bhmLoaded = true;
    renderBaholarim();
  } catch (e) {
    if (seq === bhmSeq) wrap.innerHTML = '<div class="oq-empty">⚠️ Xatolik yuz berdi</div>';
  }
}

// ★★★★☆ — faqat ko'rsatish uchun (baho 1..5 oralig'ida ekani serverda kafolatlangan)
function bhmStars(n) {
  const v = Math.max(0, Math.min(5, parseInt(n, 10) || 0));
  return '★'.repeat(v) + '☆'.repeat(5 - v);
}

// Tanlangan sana uchun kartalar (bir kunda bir nechta guruh bo'lishi mumkin)
function renderBaholarim() {
  const wrap = g('ouq-baholar-content');
  if (!bhmLoaded || !bhmCurDate) return;

  const tanlangan = dateStrLocal(bhmCurDate);
  const kun = baholarimList.filter(d => (d.sana || '').slice(0, 10) === tanlangan);

  if (!kun.length) {
    wrap.innerHTML = '<div class="oq-empty">📭 Bu kun uchun baho qo\'yilmagan</div>';
    return;
  }

  wrap.innerHTML = kun.map(d => {
    const teacherIsm = `${d.teacher_familiya || ''} ${d.teacher_ism || ''}`.trim();
    const rows = BHM_KATEGORIYALAR.map(c => {
      const b = (d.baholar || {})[c.key];
      const score = b
        ? `<span class="bhm-score bhm-${parseInt(b.baho, 10)}"><span class="bhm-stars">${bhmStars(b.baho)}</span> <b>${parseInt(b.baho, 10)}</b>/5</span>`
        : '<span class="bhm-none">Baho qo\'yilmagan</span>';
      const izoh = b && b.izoh ? `<div class="bhm-izoh">💬 ${esc(b.izoh)}</div>` : '';
      return `
        <div class="bhm-item">
          <div class="bhm-item-top">
            <span class="bhm-label">${c.icon} ${esc(c.label)}</span>
            ${score}
          </div>
          ${izoh}
        </div>`;
    }).join('');

    return `
      <div class="ouq-dav-row" style="display:block;">
        <div style="font-weight:600;">${esc(d.fan || '—')}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;">${esc(formatSana(d.sana))}${teacherIsm ? ' • ' + esc(teacherIsm) : ''}</div>
        <div class="bhm-list">${rows}</div>
      </div>`;
  }).join('');
}
