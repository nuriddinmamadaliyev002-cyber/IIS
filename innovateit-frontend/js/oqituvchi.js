// ═══════════════════════════════════════════════════
//  InnovateIT — O'qituvchi Panel JS
//  Telegram orqali biriktirilgan o'qituvchilar shu web
//  panel orqali ishlaydi (avvalgi mini-app sahifalari o'rniga)
// ═══════════════════════════════════════════════════

let U             = null;   // { ism, entityId, viaTelegram: true }
let TEACHER_ID    = null;
let MAKTABLAR_RO  = [];     // [{id, nomi}]
let TANLANGAN_MID = null;   // tanlangan maktab id

const g = id => document.getElementById(id);

const KUN_NOMLARI_MAP = { '1':'Dushanba','2':'Seshanba','3':'Chorshanba','4':'Payshanba','5':'Juma','6':'Shanba','0':'Yakshanba' };
const KUN_TARTIB       = ['Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba','Yakshanba'];
const OY_NOMLARI       = ['','Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// "6-sinf", "11-sinf" kabi qiymatlarni sonlar bo'yicha o'sish tartibida saralaydi
function sortSinflar(arr) {
  return [...arr].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

// ─── Telefonning "orqaga" tugmasi ─────────────────
// Panel Telegramdan brauzer oynasida ochiladi: tizimning "orqaga" tugmasi
// odatda butun panelni yopib qo'yardi. Endi har bir ichki sahifa/oyna
// (davomat, mavzu tahrirlagichi, guruhni tahrirlash, modal oynalar,
// hamburger menyu) ochilganda brauzer tarixiga bitta yozuv qo'shiladi va
// "orqaga" bosilganda eng ustki qatlam yopiladi. Qatlam sahifa ichidagi
// tugma bilan yopilsa, tarix yozuvi ham avtomatik olib tashlanadi.
const NAV = { stack: [], pending: [], skip: 0, backN: 0, timer: 0, dog: 0 };

function navBusy() { return NAV.skip > 0 || NAV.timer; }

// key — qatlam nomi, close — "orqaga" bosilganda chaqiriladigan funksiya,
// tab — qatlam tegishli bo'lgan tab (boshqa tabga o'tilsa qatlam tashlab yuboriladi)
function navPush(key, close, tab) {
  if (NAV.stack.some(l => l.key === key) || NAV.pending.some(l => l.key === key)) return;
  if (navBusy()) { NAV.pending.push({ key, close, tab }); return; } // tarix o'zgarib bo'lguncha kutamiz
  NAV.stack.push({ key, close, tab });
  history.pushState({ oq: NAV.stack.length }, '');
}

// Qatlam sahifa ichida yopilganda chaqiriladi (orqaga tugmasisiz)
function navRelease(key) {
  const p = NAV.pending.findIndex(l => l.key === key);
  if (p >= 0) { NAV.pending.splice(p, 1); return; }
  const i = NAV.stack.findIndex(l => l.key === key);
  if (i < 0) return; // allaqachon yopilgan (masalan, orqaga tugmasi bilan)
  NAV.stack.splice(i, 1);
  NAV.backN++;
  if (!NAV.timer) NAV.timer = setTimeout(navGoBack, 0); // bir vaqtdagi yopilishlarni bitta qadamga jamlaymiz
}

function navGoBack() {
  const n = NAV.backN;
  NAV.backN = 0; NAV.timer = 0;
  if (!n) return;
  NAV.skip = 1; // bu popstate foydalanuvchidan emas, o'zimizdan
  NAV.dog = setTimeout(navSettled, 600); // zaxira: brauzer popstate yubormasa qulflanib qolmaslik uchun
  history.go(-n);
}

function navSettled() {
  clearTimeout(NAV.dog);
  NAV.skip = 0;
  NAV.pending.splice(0).forEach(l => navPush(l.key, l.close, l.tab));
}

// Boshqa tabga o'tilganda avvalgi tabning ichki sahifalari tarixdan olib tashlanadi
// (ular baribir tabga qaytilganda asl holatiga tushadi)
function navDropOtherTabs(tab) {
  NAV.stack.filter(l => l.tab && l.tab !== tab).forEach(l => navRelease(l.key));
}

window.addEventListener('popstate', () => {
  if (NAV.skip) { navSettled(); return; }
  const l = NAV.stack.pop();
  if (l) l.close();
});

// Hamburger menyu (mobile-nav.js) ochilganda ham "orqaga" uni yopsin
let _navDrawerWatch = false;
function initNavDrawerWatch() {
  if (_navDrawerWatch) return;
  const right = document.querySelector('.oq-topbar .topbar-right');
  if (!right) return;
  _navDrawerWatch = true;
  new MutationObserver(() => {
    if (right.classList.contains('mn-open')) {
      navPush('drawer', () => { const ov = document.querySelector('.topbar-overlay'); if (ov) ov.click(); });
    } else {
      navRelease('drawer');
    }
  }).observe(right, { attributes: true, attributeFilter: ['class'] });
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
      entityId:    payload?.entityId || null,
      maktablar:   payload?.maktablar   || [],
      maktabIdlar: payload?.maktabIdlar || [],
      avatar:      payload?.avatar || null,
    };
    localStorage.setItem('iit_oq_u', JSON.stringify(U));
    window.history.replaceState({}, '', window.location.pathname);
    showApp();
    return;
  }

  try {
    const saved = localStorage.getItem('iit_oq_u');
    if (saved && api.isLoggedIn()) {
      U = JSON.parse(saved);
      showApp();
    } else {
      localStorage.removeItem('iit_oq_u');
    }
  } catch (e) { localStorage.removeItem('iit_oq_u'); }
});

function doLogout() {
  U = null; TEACHER_ID = null;
  api.logout();
  localStorage.removeItem('iit_oq_u');

  // Bu panel faqat Telegram orqali kiriladi — "index.html" (admin login)ga
  // qaytarish noto'g'ri. Shu sababli saytdan butunlay chiqib ketamiz:
  // avval tabni yopishga harakat qilamiz, bo'lmasa botga qaytaramiz.
  window.close();
  setTimeout(() => {
    window.location.href = 'https://t.me/InnovateIT_School_bot';
  }, 150);
}

function showApp() {
  initNavDrawerWatch();
  g('login-screen').style.display = 'none';
  g('app').style.display = 'block';
  g('oq-badge').textContent = U.ism;
  const drawerBadge = g('oq-badge-drawer'); // mobil hamburger menyudagi profil qatori
  if (drawerBadge) drawerBadge.textContent = U.ism;
  TEACHER_ID = U.entityId;

  // Topbardagi avatar — o'qituvchi tanlagan avatarga qarab
  const topbarImg = g('oq-avatar-img');
  if (topbarImg) {
    topbarImg.src = U.avatar === 'ayol' ? 'img/oqituvchi-icon-ayol.png'
                   : U.avatar === 'erkak' ? 'img/oqituvchi-icon-erkak.png'
                   : 'img/oqituvchi-icon.png';
  }

  // Bir nechta maktabga biriktirilgan bo'lsa — tanlash
  const nomlar = U.maktablar || [];
  const idlar  = U.maktabIdlar || [];
  MAKTABLAR_RO = nomlar.map((nom, i) => ({ id: idlar[i] || null, nomi: nom })).filter(m => m.nomi);

  const sel = g('oq-maktab-selector');
  if (MAKTABLAR_RO.length > 1) {
    sel.innerHTML = MAKTABLAR_RO.map(m => `<option value="${m.id}">${esc(m.nomi)}</option>`).join('');
    TANLANGAN_MID = MAKTABLAR_RO[0].id;
    sel.value = TANLANGAN_MID;
    initMaktabPicker(); // native <select> o'rniga o'zbekcha tanlash oynasi (select yashirin qoladi)
  } else if (MAKTABLAR_RO.length === 1) {
    TANLANGAN_MID = MAKTABLAR_RO[0].id;
  }

  switchTab('guruhlar');
}

// ─── Maktab tanlagich ────────────────────────────
// Telefonning standart <select> oynasidagi "Prev. / Next / Done" yozuvlari
// brauzer/klaviatura tilida chiqadi va sahifadan o'zgartirib bo'lmaydi.
// Shu sababli o'zimizning o'zbekcha oynamizni ko'rsatamiz. Asl <select>
// yashirin holda qoladi (qiymat va onMaktabChange() u orqali ishlaydi).
function initMaktabPicker() {
  const sel = g('oq-maktab-selector');
  if (!sel) return;
  if (!g('oq-maktab-picker')) {
    const btn = document.createElement('div');
    btn.id = 'oq-maktab-picker';
    btn.className = 'oq-maktab-picker';
    // <button> emas: mobile-nav.js menyu ichidagi har bir <button> bosilganda drawer'ni yopadi
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.tabIndex = 0;
    sel.parentNode.insertBefore(btn, sel);
    btn.addEventListener('click', openMaktabSheet);
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMaktabSheet(); }
    });

    const ov = document.createElement('div');
    ov.id = 'oq-maktab-sheet-ov';
    ov.className = 'oq-sheet-overlay';
    ov.innerHTML =
      '<div class="oq-sheet" role="dialog" aria-modal="true" aria-label="Maktabni tanlang">' +
        '<div class="oq-sheet-title">Maktabni tanlang</div>' +
        '<div class="oq-sheet-list" id="oq-maktab-sheet-list"></div>' +
        '<button type="button" class="oq-sheet-close">Yopish</button>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) closeMaktabSheet(); });
    ov.querySelector('.oq-sheet-close').addEventListener('click', closeMaktabSheet);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMaktabSheet(); });
  }
  renderMaktabPicker();
}

function renderMaktabPicker() {
  const sel = g('oq-maktab-selector'), btn = g('oq-maktab-picker'), list = g('oq-maktab-sheet-list');
  if (!sel || !btn || !list) return;
  const cur = sel.options[sel.selectedIndex];
  btn.textContent = cur ? cur.textContent : '';
  list.innerHTML = '';
  Array.from(sel.options).forEach(o => {
    const on = o.value === sel.value;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'oq-sheet-item' + (on ? ' selected' : '');
    item.setAttribute('aria-pressed', String(on));
    const dot = document.createElement('span');
    dot.className = 'oq-sheet-radio';
    const lbl = document.createElement('span');
    lbl.textContent = o.textContent;
    item.append(dot, lbl);
    item.addEventListener('click', () => pickMaktab(o.value));
    list.appendChild(item);
  });
}

function openMaktabSheet() {
  renderMaktabPicker();
  g('oq-maktab-sheet-ov').classList.add('open');
  navPush('maktabSheet', closeMaktabSheet);
}

function closeMaktabSheet() {
  navRelease('maktabSheet');
  const ov = g('oq-maktab-sheet-ov');
  if (ov) ov.classList.remove('open');
}

function pickMaktab(val) {
  const sel = g('oq-maktab-selector');
  const changed = sel.value !== String(val);
  sel.value = val;
  closeMaktabSheet();
  renderMaktabPicker();
  if (changed) sel.dispatchEvent(new Event('change', { bubbles: true })); // → onMaktabChange()
  // Hamburger menyu ochiq bo'lsa, tanlangandan keyin yopamiz
  const ov = document.querySelector('.topbar-overlay.mn-open');
  if (ov) ov.click();
}

function onMaktabChange() {
  TANLANGAN_MID = g('oq-maktab-selector').value;
  closeGuruhDavomat();
  loadGuruhlarim();
  loadJadval();
  clearGuruhForm();
  if (g('tab-guruh').classList.contains('active')) initGuruhTab();
  if (g('tab-soat').classList.contains('active'))  { loadSoatStatistika(); initSoatMark(); }
}

// ─── Tab almashtirish ─────────────────────────────
function switchTab(tab) {
  navDropOtherTabs(tab);
  document.querySelectorAll('.oq-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.oq-tab-page').forEach(p => p.classList.remove('active'));
  g('tab-btn-' + tab).classList.add('active');
  // Mobil hamburger menyudagi mos band ham "faol" bo'lib ko'rinsin
  document.querySelectorAll('.mn-tab-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  g('tab-' + tab).classList.add('active');

  if (tab === 'guruhlar') loadGuruhlarim();
  if (tab === 'jadval')   loadJadval();
  if (tab === 'soat')   { loadSoatStatistika(); initSoatMark(); }
  if (tab === 'guruh')    initGuruhTab();
  if (tab === 'mavzu')    loadMvGuruhlarim();
  if (tab === 'vazifalar') loadVazifalarniTekshirish();
}

// ═══════════════════════════════════════════
//  GURUH YARATISH (o'qituvchi o'zi sinflardan
//  o'quvchi tanlab, dars kunlari/vaqtini belgilaydi)
// ═══════════════════════════════════════════
let activeGuruhSinf = null;
let guruhOquvchilarMap = new Map(); // sinf -> Set(oquvchiId)
let guruhOquvchilarNames = new Map(); // sinf -> Map(oquvchiId -> "Familiya Ism") — tasdiqlash oynasi uchun
let editingGuruhId = null;
let pendingGuruhData = null; // tasdiqlash oynasi kutayotgan ma'lumotlar

const GURUH_KUN_NOMLARI = { 1: 'Dushanba', 2: 'Seshanba', 3: 'Chorshanba', 4: 'Payshanba', 5: 'Juma', 6: 'Shanba' };

// Boshlanish/tugash vaqti uchun ruxsat etilgan qiymatlar
const GURUH_SOAT_VARIANTLARI = ['06','07','08','09','10','11','12','13','14','15','16','17','18'];
const GURUH_DAQIQA_VARIANTLARI = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

function populateGuruhTimeSelect(id, options, placeholder, reset = false) {
  const el = g(id);
  if (!el) return;
  const prevVal = reset ? '' : el.value;
  el.innerHTML = `<option value="" disabled ${prevVal ? '' : 'selected'}>${placeholder}</option>` +
    options.map(v => `<option value="${v}">${v}</option>`).join('');
  if (prevVal && options.includes(prevVal)) el.value = prevVal;
}

// Boshlanish/tugash vaqti maydonlaridagi xatolik belgisini tozalaydi
// (foydalanuvchi qiymatni qayta o'zgartirganda chaqiriladi)
function clearGuruhTimeErr() {
  ['guruh-bosh-s', 'guruh-bosh-m', 'guruh-tug-s', 'guruh-tug-m'].forEach(id => g(id)?.classList.remove('err'));
  const msgEl = g('guruh-msg');
  if (msgEl && msgEl.dataset.type === 'vaqt-err') { msgEl.textContent = ''; delete msgEl.dataset.type; }
}

// Boshlanish vaqti tugash vaqtidan oldin ekanini tekshiradi
function isGuruhVaqtValid(boshS, boshM, tugS, tugM) {
  const bosh = parseInt(boshS, 10) * 60 + parseInt(boshM, 10);
  const tug  = parseInt(tugS, 10)  * 60 + parseInt(tugM, 10);
  return tug > bosh;
}

function initGuruhTimeSelects() {
  populateGuruhTimeSelect('guruh-bosh-s', GURUH_SOAT_VARIANTLARI, 'Soat');
  populateGuruhTimeSelect('guruh-bosh-m', GURUH_DAQIQA_VARIANTLARI, 'Daqiqa');
  populateGuruhTimeSelect('guruh-tug-s', GURUH_SOAT_VARIANTLARI, 'Soat');
  populateGuruhTimeSelect('guruh-tug-m', GURUH_DAQIQA_VARIANTLARI, 'Daqiqa');
}

function initGuruhTab() {
  const warn = g('guruh-maktab-warn'), form = g('guruh-form');
  if (!TANLANGAN_MID) {
    warn.style.display = 'block';
    form.style.display = 'none';
  } else {
    warn.style.display = 'none';
    form.style.display = 'block';
  }
  initGuruhTimeSelects();
}

function saveCurrentGuruhCheckboxState() {
  if (!activeGuruhSinf) return;
  const cbs = g('guruh-oquvchilar-list').querySelectorAll('.guruh-oq-cb');
  if (!cbs.length) return;
  const ids = new Set([...cbs].filter(cb => cb.checked).map(cb => parseInt(cb.dataset.id)));
  guruhOquvchilarMap.set(activeGuruhSinf, ids);
}

async function toggleSinfChip(chipEl) {
  const sinf = chipEl.dataset.s;
  const alreadySel = chipEl.classList.contains('sel');
  saveCurrentGuruhCheckboxState();

  // Faqat bitta sinf bir vaqtda EKRANDA ko'rsatiladi (vizual holat),
  // lekin boshqa sinflarda belgilangan o'quvchilar guruhOquvchilarMap'da
  // saqlanib qoladi — shuning uchun map'dan hech narsani o'chirmaymiz,
  // faqat vizual "sel" klassini tozalaymiz.
  document.querySelectorAll('#guruh-sinf-chips .sinf-chip.sel').forEach(c => {
    c.classList.remove('sel');
  });

  if (alreadySel) {
    // Xuddi shu sinf qayta bosilsa — faqat shu sinfning belgisi olib tashlanadi
    guruhOquvchilarMap.delete(sinf);
    activeGuruhSinf = null;
    g('guruh-oquvchilar-panel').style.display = 'none';
    g('guruh-oquvchilar-list').innerHTML = '';
    updateGuruhSelectedCount();
    return;
  }

  chipEl.classList.add('sel');
  activeGuruhSinf = sinf;
  await loadGuruhOquvchilar(sinf);
}

function toggleKunChip(chipEl) {
  chipEl.classList.toggle('sel');
}

async function loadGuruhOquvchilar(sinf) {
  if (!TANLANGAN_MID || !TEACHER_ID) return;
  g('guruh-sinf-label').textContent = sinf.replace(/-sinf$/i, '');
  g('guruh-oquvchilar-panel').style.display = 'block';
  const listEl = g('guruh-oquvchilar-list');
  listEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:14px;"><div class="loading-spinner" style="width:20px;height:20px;"></div></div>';

  try {
    const data = await api.get('/api/teachers/sinf-oquvchilar', {
      sinf, maktabId: TANLANGAN_MID, teacherId: TEACHER_ID,
    });
    if (!data || !data.ok) {
      listEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#ef4444;padding:12px;">Xatolik yuz berdi</div>';
      return;
    }
    if (!data.oquvchilar.length) {
      listEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:12px;">Bu sinfda o\'quvchi yo\'q</div>';
      updateGuruhSelectedCount();
      return;
    }

    // Ism-familiyalarni keshlab qo'yamiz — tasdiqlash oynasida ko'rsatish uchun kerak bo'ladi
    guruhOquvchilarNames.set(sinf, new Map(data.oquvchilar.map(o => [o.id, `${o.familiya} ${o.ism}`])));

    const savedIds = guruhOquvchilarMap.get(sinf);
    listEl.innerHTML = data.oquvchilar.map(o => {
      const isChecked = savedIds !== undefined ? savedIds.has(o.id) : o.biriktirilgan;
      return `
        <label class="guruh-oquv-item ${isChecked ? 'checked' : ''}">
          <input type="checkbox" class="guruh-oq-cb" data-id="${o.id}" ${isChecked ? 'checked' : ''} onchange="onGuruhCbChange(this)">
          <span>${esc(o.familiya)} ${esc(o.ism)}</span>
        </label>`;
    }).join('');

    if (!guruhOquvchilarMap.has(sinf)) {
      const initIds = new Set(data.oquvchilar.filter(o => o.biriktirilgan).map(o => o.id));
      guruhOquvchilarMap.set(sinf, initIds);
    }
    updateGuruhSelectedCount();
  } catch (e) {
    listEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#ef4444;padding:12px;">Server bilan aloqa yo\'q</div>';
  }
}

function onGuruhCbChange(cb) {
  if (!activeGuruhSinf) return;
  if (!guruhOquvchilarMap.has(activeGuruhSinf)) guruhOquvchilarMap.set(activeGuruhSinf, new Set());
  const id = parseInt(cb.dataset.id);
  if (cb.checked) guruhOquvchilarMap.get(activeGuruhSinf).add(id);
  else            guruhOquvchilarMap.get(activeGuruhSinf).delete(id);
  cb.closest('.guruh-oquv-item')?.classList.toggle('checked', cb.checked);
  updateGuruhSelectedCount();
}

function selectAllOquvchilar(val) {
  const cbs = g('guruh-oquvchilar-list').querySelectorAll('.guruh-oq-cb');
  cbs.forEach(cb => {
    cb.checked = val;
    cb.closest('.guruh-oquv-item')?.classList.toggle('checked', val);
  });
  if (activeGuruhSinf) {
    if (!guruhOquvchilarMap.has(activeGuruhSinf)) guruhOquvchilarMap.set(activeGuruhSinf, new Set());
    const set = guruhOquvchilarMap.get(activeGuruhSinf);
    if (val) cbs.forEach(cb => set.add(parseInt(cb.dataset.id)));
    else set.clear();
  }
  updateGuruhSelectedCount();
}

function updateGuruhSelectedCount() {
  const cbs = g('guruh-oquvchilar-list').querySelectorAll('.guruh-oq-cb');
  const checked = [...cbs].filter(cb => cb.checked).length;
  const allSelected = [...guruhOquvchilarMap.values()].reduce((acc, s) => acc + s.size, 0);
  const el = g('guruh-selected-count');
  if (el) el.textContent = cbs.length ? `(${checked}/${cbs.length}, jami ${allSelected} ta)` : '';
}

function clearGuruhForm() {
  document.querySelectorAll('#guruh-sinf-chips .sinf-chip').forEach(c => c.classList.remove('sel'));
  document.querySelectorAll('#guruh-kun-chips .kun-chip').forEach(c => c.classList.remove('sel'));
  g('guruh-oquvchilar-panel').style.display = 'none';
  g('guruh-oquvchilar-list').innerHTML = '';
  populateGuruhTimeSelect('guruh-bosh-s', GURUH_SOAT_VARIANTLARI, 'Soat', true);
  populateGuruhTimeSelect('guruh-bosh-m', GURUH_DAQIQA_VARIANTLARI, 'Daqiqa', true);
  populateGuruhTimeSelect('guruh-tug-s', GURUH_SOAT_VARIANTLARI, 'Soat', true);
  populateGuruhTimeSelect('guruh-tug-m', GURUH_DAQIQA_VARIANTLARI, 'Daqiqa', true);
  clearGuruhTimeErr();
  g('guruh-msg').textContent = '';
  g('guruh-form-title').textContent = "➕ Sinf o'quvchilaridan o'zingiz uchun guruh yarating";
  g('guruh-delete-wrap').style.display = 'none';
  g('guruh-back-btn').style.display = 'none';
  activeGuruhSinf = null;
  guruhOquvchilarMap.clear();
  guruhOquvchilarNames.clear();
  pendingGuruhData = null;
  editingGuruhId = null;
  navRelease('guruhEdit');
}

function saveGuruh() {
  const msgEl = g('guruh-msg');
  msgEl.textContent = '';
  msgEl.style.color = '';

  if (!TANLANGAN_MID) { msgEl.style.color = '#ef4444'; msgEl.textContent = '❌ Avval maktab tanlang'; return; }

  saveCurrentGuruhCheckboxState();

  const sinflar = [...document.querySelectorAll('#guruh-sinf-chips .sinf-chip.sel')].map(c => c.dataset.s);
  const kunlar  = [...document.querySelectorAll('#guruh-kun-chips .kun-chip.sel')].map(c => c.dataset.k);
  const hasSinf = sinflar.length > 0 || guruhOquvchilarMap.size > 0;

  if (!hasSinf)      { msgEl.style.color = '#ef4444'; msgEl.textContent = '⚠️ Kamida 1 sinf tanlang'; return; }
  if (!kunlar.length) { msgEl.style.color = '#ef4444'; msgEl.textContent = '⚠️ Kamida 1 kun tanlang'; return; }

  // Bir nechta sinfda o'quvchi belgilangan bo'lishi mumkin (guruhOquvchilarMap),
  // shuning uchun faqat hozir ekranda ko'ringan sinfni emas, balki
  // barcha belgilangan sinflarni birlashtirib, o'sish tartibida yuboramiz.
  const effectiveSinflar = sortSinflar([...new Set([...sinflar, ...guruhOquvchilarMap.keys()])]);

  const totalOquvchi = [...guruhOquvchilarMap.values()].reduce((acc, s) => acc + s.size, 0);
  if (totalOquvchi === 0) { msgEl.style.color = '#ef4444'; msgEl.textContent = '⚠️ Kamida 1 o\'quvchi tanlang'; return; }

  const boshS = g('guruh-bosh-s').value, boshM = g('guruh-bosh-m').value;
  const tugS  = g('guruh-tug-s').value,  tugM  = g('guruh-tug-m').value;
  if (!boshS || !boshM || !tugS || !tugM) {
    msgEl.style.color = '#ef4444'; msgEl.textContent = '⚠️ Boshlanish va tugash vaqtini to\'liq tanlang'; return;
  }

  if (!isGuruhVaqtValid(boshS, boshM, tugS, tugM)) {
    msgEl.style.color = '#ef4444';
    msgEl.textContent = '⚠️ Boshlanish vaqti tugash vaqtidan oldin bo\'lishi kerak';
    msgEl.dataset.type = 'vaqt-err';
    ['guruh-bosh-s', 'guruh-bosh-m', 'guruh-tug-s', 'guruh-tug-m'].forEach(id => g(id)?.classList.add('err'));
    return;
  }

  const boshlanish = boshS + ':' + boshM;
  const tugash     = tugS  + ':' + tugM;

  pendingGuruhData = { effectiveSinflar, kunlar, boshlanish, tugash };
  openGuruhConfirmModal();
}

function openGuruhConfirmModal() {
  if (!pendingGuruhData) return;
  const { effectiveSinflar, kunlar, boshlanish, tugash } = pendingGuruhData;

  const kunlarText = kunlar.map(k => GURUH_KUN_NOMLARI[k] || k).join(', ');

  const sinflarHtml = effectiveSinflar.map(sinf => {
    const ids = [...(guruhOquvchilarMap.get(sinf) || [])];
    const namesMap = guruhOquvchilarNames.get(sinf) || new Map();
    const sinfLabel = sinf.replace(/-sinf$/i, '') + '-sinf';
    if (!ids.length) return '';
    const chips = ids.map(id => `<span class="guruh-confirm-name-chip">${esc(namesMap.get(id) || ('#' + id))}</span>`).join('');
    return `
      <div class="guruh-confirm-sinf">
        <div class="guruh-confirm-sinf-title">📚 ${esc(sinfLabel)} <span class="guruh-confirm-count">(${ids.length} ta o'quvchi)</span></div>
        <div class="guruh-confirm-names">${chips}</div>
      </div>`;
  }).join('');

  g('guruh-confirm-body').innerHTML = `
    ${sinflarHtml}
    <div class="guruh-confirm-row">🗓️ <b>Dars kunlari:</b> ${esc(kunlarText)}</div>
    <div class="guruh-confirm-row">🕐 <b>Vaqti:</b> ${esc(boshlanish)} – ${esc(tugash)}</div>
  `;

  g('guruh-confirm-modal').style.display = 'flex';
  navPush('guruhConfirm', closeGuruhConfirmModal);
}

function closeGuruhConfirmModal() {
  navRelease('guruhConfirm');
  g('guruh-confirm-modal').style.display = 'none';
}

async function confirmSaveGuruh() {
  closeGuruhConfirmModal();
  if (!pendingGuruhData) return;
  const data = pendingGuruhData;
  pendingGuruhData = null;
  await actuallySaveGuruh(data);
}

async function actuallySaveGuruh({ effectiveSinflar, kunlar, boshlanish, tugash }) {
  const msgEl = g('guruh-msg');
  const btn = g('guruh-save-btn');
  btn.disabled = true;
  g('guruh-btn-txt').textContent = 'Saqlanmoqda…';

  try {
    const r = await api.post('/api/jadval/mening-jadvalim', {
      id: editingGuruhId || undefined,
      maktabId: TANLANGAN_MID,
      sinflar: effectiveSinflar.join(','),
      kunlar: kunlar.join(','),
      boshlanish, tugash,
    });
    if (!r.ok) { msgEl.style.color = '#ef4444'; msgEl.textContent = '❌ ' + r.error; return; }

    if (guruhOquvchilarMap.size > 0) {
      saveCurrentGuruhCheckboxState();
      const promises = [...guruhOquvchilarMap.entries()].map(([sinf, ids]) =>
        api.post('/api/teachers/oquvchi-birik', {
          teacherId: TEACHER_ID, oquvchiIds: [...ids], sinf, maktabId: TANLANGAN_MID,
        })
      );
      await Promise.all(promises);
    }

    msgEl.style.color = '#10b981';
    msgEl.textContent = '✅ Guruh muvaffaqiyatli saqlandi!';
    setTimeout(() => {
      clearGuruhForm();
      switchTab('guruhlar');
    }, 900);
  } catch (e) {
    msgEl.style.color = '#ef4444';
    msgEl.textContent = '❌ Server bilan ulanib bo\'lmadi';
  } finally {
    btn.disabled = false;
    g('guruh-btn-txt').textContent = '💾 Saqlash';
  }
}

// ═══════════════════════════════════════════
//  GURUHLARIM (o'qituvchi yaratgan guruhlar ro'yxati)
// ═══════════════════════════════════════════
let LAST_GURUHLAR = [];
const KUN_QISQA = { '1':'Du', '2':'Se', '3':'Cho', '4':'Pay', '5':'Ju', '6':'Sha' };

async function loadGuruhlarim() {
  closeGuruhDavomat();
  const wrap = g('guruhlar-list');
  wrap.innerHTML = '<div class="oq-loading"><div class="loading-spinner"></div></div>';

  if (!TANLANGAN_MID) {
    wrap.innerHTML = '<div class="oq-empty">⚠️ Avval maktabni tanlang</div>';
    return;
  }

  try {
    const data = await api.get('/api/jadval/mening-jadvalim-oqituvchi', { maktabId: TANLANGAN_MID });
    if (!data || !data.ok) {
      wrap.innerHTML = '<div class="oq-empty">⚠️ Ma\'lumot yuklanmadi</div>';
      return;
    }

    LAST_GURUHLAR = data.jadvallar || [];
    if (!LAST_GURUHLAR.length) {
      wrap.innerHTML = '<div class="oq-empty">📭 Hali guruh yaratmagansiz.<br>"➕ Guruh yaratish" bo\'limidan boshlang.</div>';
      return;
    }

    wrap.innerHTML = LAST_GURUHLAR.map(j => {
      const sinflar = sortSinflar((j.sinflar || '').split(',').filter(Boolean));
      const sinflarText = sinflar.map(s => s.replace(/-sinf$/i, '')).join(', ') +
        (sinflar.length ? ('-sinf' + (sinflar.length > 1 ? 'lar' : '')) : '');
      const kunlar = (j.kunlar || '').split(',').map(k => KUN_QISQA[k.trim()] || k.trim()).filter(Boolean).join(', ');

      return `
        <div class="guruh-card">
          <div class="guruh-card-top" onclick="editGuruh(${j.id})">
            <div class="guruh-card-sinf">📚 ${esc(sinflarText || '—')}</div>
            <div class="guruh-card-edit">✏️</div>
          </div>
          <div class="guruh-card-detail">🗓️ ${esc(kunlar) || '—'} &nbsp;·&nbsp; 🕐 ${esc(j.boshlanish) || '—'}–${esc(j.tugash) || '—'}</div>
          <button type="button" class="oq-back-btn" style="padding:0;margin-top:8px;font-size:12px;" onclick="openGuruhDavomat(${j.id}, event)">📋 Davomat belgilash</button>
        </div>`;
    }).join('');
  } catch (e) {
    wrap.innerHTML = '<div class="oq-empty">⚠️ Xatolik yuz berdi</div>';
  }
}

async function editGuruh(id) {
  const j = LAST_GURUHLAR.find(x => x.id === id);
  if (!j) return;

  switchTab('guruh');
  clearGuruhForm();
  editingGuruhId = id;
  g('guruh-form-title').textContent = "✏️ Guruhni tahrirlash";
  g('guruh-delete-wrap').style.display = 'block';
  g('guruh-back-btn').style.display = 'block';
  navPush('guruhEdit', backToGuruhlar, 'guruh');

  const [bs, bm] = (j.boshlanish || '08:00').split(':');
  const [ts, tm] = (j.tugash || '14:00').split(':');
  g('guruh-bosh-s').value = bs || '08'; g('guruh-bosh-m').value = bm || '00';
  g('guruh-tug-s').value  = ts || '14'; g('guruh-tug-m').value  = tm || '00';

  (j.kunlar || '').split(',').map(k => k.trim()).filter(Boolean).forEach(k => {
    document.querySelector(`#guruh-kun-chips [data-k="${k}"]`)?.classList.add('sel');
  });

  const sinflar = (j.sinflar || '').split(',').filter(Boolean);
  sinflar.forEach(s => {
    document.querySelector(`#guruh-sinf-chips [data-s="${s}"]`)?.classList.add('sel');
  });
  if (sinflar.length) {
    activeGuruhSinf = sinflar[sinflar.length - 1];
    await loadGuruhOquvchilar(activeGuruhSinf);
  }
}

// Tahrirlash sahifasidan "Guruhlarim" ro'yxatiga qaytish (saqlamasdan)
function backToGuruhlar() {
  clearGuruhForm();
  switchTab('guruhlar');
}

async function deleteGuruh() {
  if (!editingGuruhId) return;
  if (!confirm("Guruhni butunlay o'chirmoqchimisiz? Unga biriktirilgan o'quvchilar ham guruhdan chiqariladi.")) return;

  const j = LAST_GURUHLAR.find(x => x.id === editingGuruhId);
  const btn = g('guruh-save-btn');
  btn.disabled = true;

  try {
    const r = await api.del('/api/jadval/mening-jadvalim/' + editingGuruhId);
    if (!r.ok) {
      g('guruh-msg').style.color = '#ef4444';
      g('guruh-msg').textContent = '❌ ' + r.error;
      btn.disabled = false;
      return;
    }

    if (j) {
      const sinflar = (j.sinflar || '').split(',').filter(Boolean);
      await Promise.all(sinflar.map(sinf =>
        api.post('/api/teachers/oquvchi-birik', { teacherId: TEACHER_ID, oquvchiIds: [], sinf, maktabId: TANLANGAN_MID })
      ));
    }

    clearGuruhForm();
    switchTab('guruhlar');
  } catch (e) {
    g('guruh-msg').style.color = '#ef4444';
    g('guruh-msg').textContent = "❌ Server bilan ulanib bo'lmadi";
  } finally {
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════
//  GURUH DAVOMATI (guruhdagi barcha sinflar
//  bo'yicha o'quvchilar davomatini belgilash —
//  admin paneldagi davomat oynasi kabi: sinf
//  bo'yicha kartalar, statistika paneli, va
//  faqat guruhning dars kunlari bo'yicha sana
//  navigatsiyasi)
// ═══════════════════════════════════════════
const DAV_STATUS_LIST = [
  { key: 'keldi',   label: 'Keldi',   color: '#10b981', icon: '✅' },
  { key: 'kelmadi', label: 'Kelmadi', color: '#ef4444', icon: '❌' },
  { key: 'sababli', label: 'Sababli', color: '#f59e0b', icon: '📋' },
  { key: 'kech',    label: 'Kech',    color: '#8b5cf6', icon: '⏰' },
];

let activeDavomatGuruh    = null;
let davomatOquvchilarList = [];

function dateStrLocal(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// "1,3,5" -> Set{1,3,5}  (raqamlar JS Date.getDay() bilan mos: 0=Yakshanba...6=Shanba)
function parseKunlarSet(kunlarStr) {
  const set = new Set();
  (kunlarStr || '').split(',').map(k => k.trim()).filter(Boolean).forEach(k => {
    const n = parseInt(k, 10);
    if (!isNaN(n)) set.add(n);
  });
  return set;
}

// Guruhning dars kuni belgilanmagan bo'lsa — cheklov qo'yilmaydi
function isLessonDay(date) {
  if (!window._davomat_kunlar || !window._davomat_kunlar.size) return true;
  return window._davomat_kunlar.has(date.getDay());
}

// Berilgan sanadan boshlab dir yo'nalishida eng yaqin dars kunini topadi.
// Kelajakka (bugungi sanadan keyingiga) chiqib ketishga umuman yo'l qo'ymaydi.
function findLessonDate(fromDate, dir) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let d = new Date(fromDate); d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() + dir);
    if (dir > 0 && d > today) return null;
    if (isLessonDay(d)) return new Date(d);
  }
  return null;
}

async function openGuruhDavomat(guruhId, event) {
  if (event) event.stopPropagation();
  const j = LAST_GURUHLAR.find(x => x.id === guruhId);
  if (!j) return;
  activeDavomatGuruh = j;
  window._davomat_kunlar = parseKunlarSet(j.kunlar);

  g('guruhlar-list-wrap').style.display = 'none';
  g('guruh-davomat-wrap').style.display = 'block';
  navPush('davomat', closeGuruhDavomat, 'guruhlar');

  const sinflarSet  = new Set((j.sinflar || '').split(',').filter(Boolean));
  const sinflarText = sortSinflar([...sinflarSet]).map(s => s.replace(/-sinf$/i, '') + '-sinf').join(', ');
  g('guruh-dav-title').textContent = `📋 ${sinflarText} — davomat`;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  let startDate = isLessonDay(today) ? today : findLessonDate(today, -1);
  if (!startDate) startDate = today;
  window._davomat_curdate = startDate;

  g('dav-date-picker').max = dateStrLocal(today);
  setDavomatDateUI();
  updateDavomatNavBtns();

  await loadDavomatOquvchilarVaHolat(sinflarSet);
}

function setDavomatDateUI() {
  const d = window._davomat_curdate;
  g('dav-date-display').textContent = `${d.getDate()}-${OY_NOMLARI[d.getMonth() + 1]}, ${d.getFullYear()}`;
  g('dav-date-sub').textContent     = KUN_NOMLARI_MAP[String(d.getDay())] || '';
  g('dav-date-picker').value        = dateStrLocal(d);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  g('dav-date-picker-text').textContent = `${dd}/${mm}/${d.getFullYear()}`;
}

// Ko'rinadigan DD/MM/YYYY qatlamiga bosilganda, orqadagi yashirin
// <input type="date"> ning kalendarini dasturiy ravishda ochamiz —
// bu shunchaki bosishga tayanishdan ko'ra ishonchliroq ishlaydi.
function openDavomatDatePicker() {
  const inp = g('dav-date-picker');
  if (!inp) return;
  if (typeof inp.showPicker === 'function') {
    try { inp.showPicker(); return; } catch (e) { /* fallback pastda */ }
  }
  inp.focus();
  inp.click();
}

function updateDavomatNavBtns() {
  g('dav-prev-btn').disabled = !findLessonDate(window._davomat_curdate, -1);
  g('dav-next-btn').disabled = !findLessonDate(window._davomat_curdate, 1);
}

function currentGuruhSinflarSet() {
  return new Set(((activeDavomatGuruh && activeDavomatGuruh.sinflar) || '').split(',').filter(Boolean));
}

async function changeDavomatDate(dir) {
  const nd = findLessonDate(window._davomat_curdate, dir);
  if (!nd) return; // o'tmishda dars kuni qolmagan yoki kelajakka chiqib ketardi
  window._davomat_curdate = nd;
  setDavomatDateUI();
  updateDavomatNavBtns();
  await loadDavomatOquvchilarVaHolat(currentGuruhSinflarSet());
}

async function onDavomatDatePick() {
  const val = g('dav-date-picker').value;
  if (!val) return;
  const d = new Date(val + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);

  if (d > today) {
    alert('⚠️ Kelajak sanani tanlash mumkin emas');
    setDavomatDateUI();
    return;
  }
  if (!isLessonDay(d)) {
    alert("⚠️ Bu kun guruhingiz uchun dars kuni emas");
    setDavomatDateUI();
    return;
  }

  window._davomat_curdate = d;
  setDavomatDateUI();
  updateDavomatNavBtns();
  await loadDavomatOquvchilarVaHolat(currentGuruhSinflarSet());
}

// ═══════════════════════════════════════════
//  MAVZU / VAZIFA BERISH (mustaqil tab — guruh
//  tanlash + o'sha guruhning dars kuni bo'yicha
//  mavzu, uyga vazifa va ixtiyoriy fayl/rasm)
// ═══════════════════════════════════════════
let activeMvGuruh = null;
let _mv_fayl = '';
let _mv_saved = null;   // serverdagi saqlangan vazifa (tanlangan kunda yo'q bo'lsa null)
let _mv_noteTimer = null;

function resolveUploadUrl(filename) {
  if (!filename) return '';
  if (filename.startsWith('http')) return filename;
  const base = (typeof BASE !== 'undefined') ? BASE : '';
  return `${base}/uploads/${filename}`;
}

function mvIsLessonDay(date) {
  if (!window._mv_kunlar || !window._mv_kunlar.size) return true;
  return window._mv_kunlar.has(date.getDay());
}

function findMvLessonDate(fromDate, dir) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let d = new Date(fromDate); d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() + dir);
    if (dir > 0 && d > today) return null;
    if (mvIsLessonDay(d)) return new Date(d);
  }
  return null;
}

async function loadMvGuruhlarim() {
  closeMvEditor();
  const wrap = g('mv-guruhlar-list');
  wrap.innerHTML = '<div class="oq-loading"><div class="loading-spinner"></div></div>';

  if (!TANLANGAN_MID) {
    wrap.innerHTML = '<div class="oq-empty">⚠️ Avval maktabni tanlang</div>';
    return;
  }

  try {
    const data = await api.get('/api/jadval/mening-jadvalim-oqituvchi', { maktabId: TANLANGAN_MID });
    if (!data || !data.ok) {
      wrap.innerHTML = '<div class="oq-empty">⚠️ Ma\'lumot yuklanmadi</div>';
      return;
    }

    LAST_GURUHLAR = data.jadvallar || [];
    if (!LAST_GURUHLAR.length) {
      wrap.innerHTML = '<div class="oq-empty">📭 Hali guruh yaratmagansiz.<br>"➕ Guruh yaratish" bo\'limidan boshlang.</div>';
      return;
    }

    wrap.innerHTML = LAST_GURUHLAR.map(j => {
      const sinflar = sortSinflar((j.sinflar || '').split(',').filter(Boolean));
      const sinflarText = sinflar.map(s => s.replace(/-sinf$/i, '')).join(', ') +
        (sinflar.length ? ('-sinf' + (sinflar.length > 1 ? 'lar' : '')) : '');
      const kunlar = (j.kunlar || '').split(',').map(k => KUN_QISQA[k.trim()] || k.trim()).filter(Boolean).join(', ');

      return `
        <div class="guruh-card" onclick="openMvGuruh(${j.id})">
          <div class="guruh-card-top">
            <div class="guruh-card-sinf">📚 ${esc(sinflarText || '—')}</div>
            <div class="guruh-card-edit">📘</div>
          </div>
          <div class="guruh-card-detail">🗓️ ${esc(kunlar) || '—'} &nbsp;·&nbsp; 🕐 ${esc(j.boshlanish) || '—'}–${esc(j.tugash) || '—'}</div>
        </div>`;
    }).join('');
  } catch (e) {
    wrap.innerHTML = '<div class="oq-empty">⚠️ Xatolik yuz berdi</div>';
  }
}

async function openMvGuruh(guruhId) {
  const j = LAST_GURUHLAR.find(x => x.id === guruhId);
  if (!j) return;
  activeMvGuruh = j;
  window._mv_kunlar = parseKunlarSet(j.kunlar);

  g('mv-guruhlar-wrap').style.display = 'none';
  g('mv-editor-wrap').style.display = 'block';
  navPush('mvEditor', closeMvEditor, 'mavzu');

  const sinflarSet  = new Set((j.sinflar || '').split(',').filter(Boolean));
  const sinflarText = sortSinflar([...sinflarSet]).map(s => s.replace(/-sinf$/i, '') + '-sinf').join(', ');
  g('mv-editor-title').textContent = `📘 ${sinflarText} — mavzu va vazifa`;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  let startDate = mvIsLessonDay(today) ? today : findMvLessonDate(today, -1);
  if (!startDate) startDate = today;
  window._mv_curdate = startDate;

  g('mv-date-picker').max = dateStrLocal(today);
  setMvDateUI();
  updateMvNavBtns();
  await loadMavzuVazifa();
}

function closeMvEditor() {
  navRelease('mvEditor');
  g('mv-editor-wrap').style.display = 'none';
  g('mv-guruhlar-wrap').style.display = 'block';
  closeMvDeleteModal();
  activeMvGuruh = null;
  _mv_saved = null;
}

function setMvDateUI() {
  const d = window._mv_curdate;
  g('mv-date-display').textContent = `${d.getDate()}-${OY_NOMLARI[d.getMonth() + 1]}, ${d.getFullYear()}`;
  g('mv-date-sub').textContent     = KUN_NOMLARI_MAP[String(d.getDay())] || '';
  g('mv-date-picker').value        = dateStrLocal(d);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  g('mv-date-picker-text').textContent = `${dd}/${mm}/${d.getFullYear()}`;
}

function openMvDatePicker() {
  const inp = g('mv-date-picker');
  if (!inp) return;
  if (typeof inp.showPicker === 'function') {
    try { inp.showPicker(); return; } catch (e) { /* fallback pastda */ }
  }
  inp.focus();
  inp.click();
}

function updateMvNavBtns() {
  g('mv-prev-btn').disabled = !findMvLessonDate(window._mv_curdate, -1);
  g('mv-next-btn').disabled = !findMvLessonDate(window._mv_curdate, 1);
}

// ─── Muddat maydoni: native <input type="date"> MM/DD/YYYY ko'rsatishi mumkin,
//     shu sababli o'zimiz DD/MM/YYYY formatida matn ko'rsatamiz ───────────────
function setMvMuddatText() {
  const v = g('mv-muddat').value;
  const textEl = g('mv-muddat-text');
  const clearWrap = g('mv-muddat-clear-wrap');
  const warnEl = g('mv-muddat-warn');
  if (!v) {
    textEl.textContent = 'Tanlanmagan';
    clearWrap.style.display = 'none';
    warnEl.style.display = 'none';
    return;
  }
  const [y, m, d] = v.split('-');
  textEl.textContent = `${d}/${m}/${y}`;
  clearWrap.style.display = 'block';
  warnEl.style.display = (v < dateStrLocal(new Date())) ? 'block' : 'none';
}

function openMvMuddatPicker() {
  const inp = g('mv-muddat');
  if (!inp) return;
  if (typeof inp.showPicker === 'function') {
    try { inp.showPicker(); return; } catch (e) { /* fallback pastda */ }
  }
  inp.focus();
  inp.click();
}

function onMvMuddatPick() {
  setMvMuddatText();
}

function clearMvMuddat() {
  g('mv-muddat').value = '';
  setMvMuddatText();
}

async function changeMvDate(dir) {
  const nd = findMvLessonDate(window._mv_curdate, dir);
  if (!nd) return;
  window._mv_curdate = nd;
  setMvDateUI();
  updateMvNavBtns();
  await loadMavzuVazifa();
}

async function onMvDatePick() {
  const val = g('mv-date-picker').value;
  if (!val) return;
  const d = new Date(val + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);

  if (d > today) {
    alert('⚠️ Kelajak sanani tanlash mumkin emas');
    setMvDateUI();
    return;
  }
  if (!mvIsLessonDay(d)) {
    alert("⚠️ Bu kun guruhingiz uchun dars kuni emas");
    setMvDateUI();
    return;
  }

  window._mv_curdate = d;
  setMvDateUI();
  updateMvNavBtns();
  await loadMavzuVazifa();
}

function renderMvFaylCurrent() {
  const wrap = g('mv-fayl-current');
  if (_mv_fayl) {
    wrap.style.display = 'block';
    wrap.innerHTML = `📎 <a href="${resolveUploadUrl(_mv_fayl)}" target="_blank" rel="noopener">Biriktirilgan faylni ko'rish</a>
      &nbsp;·&nbsp; <button type="button" class="oq-back-btn" style="padding:0;font-size:12.5px;display:inline;" onclick="removeMvFayl()">❌ Olib tashlash</button>`;
  } else {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
  }
}

function removeMvFayl() {
  _mv_fayl = '';
  renderMvFaylCurrent();
}

async function uploadMvFayl() {
  const inp = g('mv-fayl-input');
  const statusEl = g('mv-fayl-status');
  const file = inp.files?.[0];
  if (!file) return;

  statusEl.textContent = '⏳ Fayl yuklanmoqda...';
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await api.uploadFile(fd);
    if (res && res.ok) {
      _mv_fayl = res.filename;
      statusEl.textContent = '✅ Fayl yuklandi';
      renderMvFaylCurrent();
    } else {
      statusEl.textContent = '❌ ' + (res?.error || 'Fayl yuklanmadi');
    }
  } catch (e) {
    statusEl.textContent = '❌ Fayl yuklanmadi';
  } finally {
    inp.value = '';
  }
}

// ─── Mavzu / Uyga vazifa (joriy guruh + joriy sana bo'yicha) ─────────────────
//
//  Sahifa to'rt holatdan birida bo'ladi:
//    'loading' — serverdan olinmoqda
//    'empty'   — bu kunga vazifa yozilmagan → bo'sh forma
//    'view'    — vazifa saqlangan → kartochka (Tahrirlash / O'chirish tugmalari bilan)
//    'edit'    — kartochkadan "Tahrirlash" bosilgan → oldindan to'ldirilgan forma
function setMvMode(mode) {
  g('mv-loading').style.display    = mode === 'loading' ? 'block' : 'none';
  g('mv-card-wrap').style.display  = mode === 'view' ? 'block' : 'none';
  g('mv-form-wrap').style.display  = (mode === 'empty' || mode === 'edit') ? 'block' : 'none';
  g('mv-cancel-btn').style.display = mode === 'edit' ? 'block' : 'none';
  g('mv-save-btn').textContent     = mode === 'edit' ? '💾 Yangilash' : '💾 Mavzu va vazifani saqlash';

  // Javoblar allaqachon kelgan bo'lsa — tahrirlashdan oldin ogohlantiramiz
  const warn = g('mv-edit-warn');
  const jn = _mv_saved ? (_mv_saved.javoblar_soni || 0) : 0;
  if (mode === 'edit' && jn > 0) {
    warn.textContent = `ℹ️ ${jn} ta o'quvchi allaqachon javob yuborgan. Vazifa matnini o'zgartirsangiz, ular eski topshiriqqa javob bergan bo'ladi.`;
    warn.style.display = 'block';
  } else {
    warn.style.display = 'none';
  }
}

// Formani berilgan vazifa bilan to'ldiradi (null bo'lsa — tozalaydi)
function fillMvForm(v) {
  g('mv-mavzu').value  = v ? (v.mavzu || '') : '';
  g('mv-vazifa').value = v ? (v.uy_vazifasi || '') : '';
  g('mv-muddat').value = v ? (v.muddat || '') : '';
  setMvMuddatText();
  _mv_fayl = v ? (v.vazifa_fayl || '') : '';
  g('mv-fayl-status').textContent = '';
  renderMvFaylCurrent();
  updateMvSaveState();
}

function showMvNote(text, isError) {
  const el = g('mv-saved-note');
  el.textContent = text;
  el.classList.toggle('mv-note-err', !!isError);
  el.style.display = 'block';
  clearTimeout(_mv_noteTimer);
  _mv_noteTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

async function loadMavzuVazifa() {
  clearTimeout(_mv_noteTimer);
  g('mv-saved-note').style.display = 'none';
  _mv_saved = null;
  fillMvForm(null);
  if (!activeMvGuruh) { setMvMode('empty'); return; }

  setMvMode('loading');
  const guruhId = activeMvGuruh.id;
  const sana    = dateStrLocal(window._mv_curdate);

  let res = null;
  try { res = await api.getGuruhVazifa(guruhId, sana); } catch (e) { res = null; }

  // Kutish paytida boshqa sanaga o'tib ketilgan yoki editor yopilgan bo'lsa — eski javobni tashlaymiz
  if (!activeMvGuruh || activeMvGuruh.id !== guruhId || dateStrLocal(window._mv_curdate) !== sana) return;

  if (res && res.ok && res.vazifa) {
    _mv_saved = res.vazifa;
    fillMvForm(_mv_saved);
    renderMvCard(_mv_saved);
    setMvMode('view');
  } else {
    setMvMode('empty');
    if (!res || !res.ok) showMvNote("⚠️ Saqlangan vazifani yuklab bo'lmadi. Internetni tekshiring", true);
  }
}

// ─── Kartochka ────────────────────────────────────────────────────────────────
function mvFmtMuddat(iso) {
  const [y, m, d] = String(iso).split('-');
  return (y && m && d) ? `${d}/${m}/${y}` : iso;
}

function mvFaylHtml(nom) {
  if (!nom) return '';
  const url = esc(resolveUploadUrl(nom));
  const ext = (String(nom).split('?')[0].split('.').pop() || '').toLowerCase();

  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    return `<a class="mv-file-img" href="${url}" target="_blank" rel="noopener" aria-label="Rasmni to'liq ochish">
      <img src="${url}" alt="Biriktirilgan rasm" loading="lazy" onerror="mvImgFail(this)">
    </a>`;
  }
  const isPdf = ext === 'pdf';
  const label = isPdf ? 'PDF fayl' : (ext === 'doc' || ext === 'docx') ? 'Word fayl' : 'Biriktirilgan fayl';
  return `<a class="mv-file-row" href="${url}" target="_blank" rel="noopener">
    <span class="mv-file-ico">${isPdf ? '📄' : '📝'}</span>
    <span class="mv-file-name">${label}</span>
    <span class="mv-file-open">Ochish</span>
  </a>`;
}

// Rasm yuklanmasa — oddiy "Ochish" qatoriga o'tamiz
function mvImgFail(img) {
  const a = img.closest('a');
  if (!a) return;
  a.className = 'mv-file-row';
  a.innerHTML = '<span class="mv-file-ico">🖼</span><span class="mv-file-name">Biriktirilgan rasm</span><span class="mv-file-open">Ochish</span>';
}

function renderMvCard(v) {
  const wrap = g('mv-card-wrap');
  const bugun = dateStrLocal(new Date());

  // Vaqt belgisi
  const vaqt = v.yangilangan ? `Tahrirlangan: ${v.yangilangan}` : (v.yaratilgan ? `Yozilgan: ${v.yaratilgan}` : '');

  // Muddat
  let muddatHtml, muddatHint = '';
  if (v.muddat) {
    const otgan = v.muddat < bugun;
    muddatHtml = otgan
      ? `<span class="mv-chip mv-chip-danger">⏰ Muddat tugagan: ${esc(mvFmtMuddat(v.muddat))}</span>`
      : `<span class="mv-chip mv-chip-warn">📅 Muddat: ${esc(mvFmtMuddat(v.muddat))}</span>`;
    if (otgan) muddatHint = `<div class="mv-hint-danger">O'quvchilar endi javob yubora olmaydi. Davom ettirish uchun "Tahrirlash" orqali muddatni yangilang.</div>`;
  } else {
    muddatHtml = `<span class="mv-chip">Muddat belgilanmagan</span>`;
  }

  // Javoblar
  const jn = v.javoblar_soni || 0, bn = v.baholangan_soni || 0;
  const statHtml = jn === 0
    ? `<div class="mv-stat mv-stat-empty">Hali javob kelmagan</div>`
    : `<div class="mv-stat"><span>👥 ${jn} ta javob keldi${bn ? `, ${bn} tasi baholangan` : ''}</span>
         <button type="button" class="mv-link" onclick="openMvJavoblar()">Javoblarni ko'rish</button></div>`;

  wrap.innerHTML = `
    <div class="mv-card-top">
      <span class="mv-badge-ok">✅ Saqlangan</span>
      <span class="mv-card-time">${esc(vaqt)}</span>
    </div>

    <div class="mv-card-label">Dars mavzusi</div>
    <div class="mv-card-title">${esc(v.mavzu || '—')}</div>

    <div class="mv-card-label">Uyga vazifa</div>
    <div class="mv-card-text">${esc(v.uy_vazifasi || '—')}</div>

    ${mvFaylHtml(v.vazifa_fayl)}

    <div class="mv-chips">${muddatHtml}</div>
    ${muddatHint}
    ${statHtml}

    <div class="mv-actions">
      <button type="button" class="mv-btn" onclick="editMvVazifa()">✏️ Tahrirlash</button>
      <button type="button" class="mv-btn mv-btn-danger" onclick="openMvDeleteModal()">🗑 O'chirish</button>
    </div>`;
}

function openMvJavoblar() { switchTab('vazifalar'); }

function editMvVazifa() {
  if (!_mv_saved) return;
  fillMvForm(_mv_saved);
  setMvMode('edit');
  const f = g('mv-form-wrap');
  if (f && f.scrollIntoView) f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cancelMvEdit() {
  if (!_mv_saved) { setMvMode('empty'); return; }
  fillMvForm(_mv_saved);       // kiritilgan o'zgarishlarni bekor qilamiz
  renderMvCard(_mv_saved);
  setMvMode('view');
}

// ─── O'chirish (tasdiqlash oynasi bilan) ──────────────────────────────────────
function openMvDeleteModal() {
  if (!_mv_saved) return;
  const jn = _mv_saved.javoblar_soni || 0, bn = _mv_saved.baholangan_soni || 0;
  const mavzu = `<div style="color:var(--muted);margin-bottom:8px;">Mavzu: <b style="color:var(--text);">${esc(_mv_saved.mavzu || '—')}</b></div>`;
  g('mv-delete-body').innerHTML = mavzu + (jn === 0
    ? "Bu kundagi mavzu va uyga vazifa o'chiriladi. O'quvchilar uni endi ko'rmaydi."
    : `<b>Diqqat:</b> o'quvchilarning ${jn} ta javobi${bn ? ` va ${bn} ta bahosi` : ''} ham o'chib ketadi. Buni qaytarib bo'lmaydi.`);
  g('mv-delete-msg').textContent = '';
  g('mv-delete-confirm').disabled = false;
  g('mv-delete-cancel').disabled = false;
  g('mv-delete-modal').style.display = 'flex';
}

function closeMvDeleteModal() {
  const m = g('mv-delete-modal');
  if (m) m.style.display = 'none';
}

async function confirmMvDelete() {
  if (!activeMvGuruh) return;
  const btn = g('mv-delete-confirm'), cancel = g('mv-delete-cancel'), msg = g('mv-delete-msg');
  msg.textContent = '';
  btn.disabled = true; cancel.disabled = true;
  try {
    const res = await api.deleteGuruhVazifa(activeMvGuruh.id, dateStrLocal(window._mv_curdate));
    if (res && res.ok) {
      closeMvDeleteModal();
      await loadMavzuVazifa();
      showMvNote("🗑 Vazifa o'chirildi");
    } else {
      msg.textContent = (res && res.error) || "O'chirishda xatolik yuz berdi";
    }
  } catch (e) {
    msg.textContent = "O'chirishda xatolik yuz berdi";
  } finally {
    btn.disabled = false; cancel.disabled = false;
  }
}

// Mavzu va uyga vazifa ikkalasi ham to'ldirilmaguncha "Saqlash" tugmasi faol bo'lmaydi.
// (Muddat va fayl ixtiyoriy — ularga bog'liq emas.)
function mvMissingFields() {
  const missing = [];
  if (!g('mv-mavzu').value.trim())  missing.push('dars mavzusi');
  if (!g('mv-vazifa').value.trim()) missing.push('uyga vazifa');
  return missing;
}

function updateMvSaveState() {
  const btn  = g('mv-save-btn');
  const hint = g('mv-save-hint');
  if (!btn) return;
  const missing = mvMissingFields();
  btn.disabled = missing.length > 0;
  if (hint) {
    hint.style.display = missing.length ? 'block' : 'none';
    hint.textContent   = missing.length ? `Saqlash uchun to'ldiring: ${missing.join(' va ')}` : '';
  }
}

async function saveMavzuVazifa() {
  if (!activeMvGuruh) return;
  const missing = mvMissingFields();
  if (missing.length) {
    updateMvSaveState();
    alert(`⚠️ Saqlash uchun to'ldiring: ${missing.join(' va ')}`);
    return;
  }
  const muddat    = g('mv-muddat').value || '';
  const eskiMuddat = _mv_saved ? (_mv_saved.muddat || '') : '';
  // O'tmishdagi muddat faqat YANGI tanlansa rad etiladi — mavjud (o'tib ketgan)
  // muddatni o'zgartirmasdan matnni tuzatish mumkin bo'lishi kerak
  if (muddat && muddat < dateStrLocal(new Date()) && muddat !== eskiMuddat) {
    alert("⚠️ Topshirish muddati sifatida o'tmishdagi sana tanlangan. Iltimos, muddatni bugungi yoki kelajakdagi sanaga o'zgartiring.");
    return;
  }
  const wasEdit = !!_mv_saved;
  const sana = dateStrLocal(window._mv_curdate);
  const btn = g('mv-save-btn');
  btn.disabled = true;
  try {
    const res = await api.saveGuruhVazifa(activeMvGuruh.id, {
      sana,
      mavzu:       g('mv-mavzu').value.trim(),
      uy_vazifasi: g('mv-vazifa').value.trim(),
      muddat,
      vazifa_fayl: _mv_fayl
    });
    if (res && res.ok) {
      await loadMavzuVazifa();          // serverdagi holat + kartochka
      showMvNote(wasEdit ? '✅ Yangilandi' : '✅ Saqlandi');
    } else {
      alert(res?.error || 'Saqlashda xatolik yuz berdi');
    }
  } catch (e) {
    alert('Saqlashda xatolik yuz berdi');
  } finally {
    updateMvSaveState();
  }
}

async function loadDavomatOquvchilarVaHolat(sinflarSet) {
  const listEl = g('guruh-dav-list');
  listEl.className = 'dav-sinf-grid';
  listEl.innerHTML = '<div class="oq-loading"><div class="loading-spinner"></div></div>';
  const sana = dateStrLocal(window._davomat_curdate);

  try {
    const data = await api.get(`/api/teachers/${TEACHER_ID}/oquvchilar`);
    let oquvchilar = (data && data.ok) ? (data.oquvchilar || []) : [];
    if (TANLANGAN_MID) oquvchilar = oquvchilar.filter(o => String(o.maktab_id) === String(TANLANGAN_MID));
    oquvchilar = oquvchilar.filter(o => sinflarSet.has(o.sinf));
    davomatOquvchilarList = oquvchilar;

    if (!oquvchilar.length) {
      listEl.innerHTML = '<div class="oq-empty">📭 Guruhga o\'quvchi biriktirilmagan</div>';
      updateDavomatStatsBar();
      return;
    }

    window._davomat_state = {};
    window._davomat_izoh  = {};
    const results = await Promise.all([...sinflarSet].map(s =>
      api.get('/api/davomat/sinf-davomat', { maktabId: TANLANGAN_MID, sinf: s, sana }).catch(() => null)
    ));
    results.forEach(r => {
      if (r && r.ok) (r.records || []).forEach(rec => {
        window._davomat_state[rec.oquvchi_ism] = rec.status;
        if (rec.izoh) window._davomat_izoh[rec.oquvchi_ism] = rec.izoh;
      });
    });

    renderGuruhDavomat();
  } catch (e) {
    listEl.innerHTML = '<div class="oq-empty">⚠️ Xatolik yuz berdi</div>';
  }
}

function countDavomatStatuses(list) {
  const c = { keldi: 0, kelmadi: 0, sababli: 0, kech: 0 };
  list.forEach(o => {
    const fullIsm = `${o.familiya || ''} ${o.ism || ''}`.trim();
    const st = window._davomat_state[fullIsm];
    if (st && c[st] !== undefined) c[st]++;
  });
  return c;
}

function renderGuruhDavomat() {
  const wrap = g('guruh-dav-list');
  const groups = {};
  davomatOquvchilarList.forEach(o => {
    if (!groups[o.sinf]) groups[o.sinf] = [];
    groups[o.sinf].push(o);
  });
  const sinflar = Object.keys(groups).sort((a, b) => parseInt(a) - parseInt(b));

  wrap.className = 'dav-sinf-grid';
  wrap.innerHTML = sinflar.map(sinf => {
    const list = groups[sinf];
    const c    = countDavomatStatuses(list);
    return `
      <div class="dav-sinf-card">
        <div class="dav-sinf-header">
          <div class="dav-sinf-title">
            <span class="sinf-badge">${esc(sinf.replace(/-sinf$/i, '') + '-sinf')}</span>
            <span style="font-size:11px;color:var(--muted);font-weight:400;">${list.length} o'quvchi</span>
          </div>
          <div class="dav-sinf-mini-stats">
            <span class="dav-mini-s k">✅ ${c.keldi}</span>
            <span class="dav-mini-s x">❌ ${c.kelmadi}</span>
            <span class="dav-mini-s s">📋 ${c.sababli}</span>
            <span class="dav-mini-s l">⏰ ${c.kech}</span>
          </div>
        </div>
        <div class="dav-student-list">
          ${list.map((o, i) => {
            const fullIsm = `${o.familiya || ''} ${o.ism || ''}`.trim();
            const cur     = window._davomat_state[fullIsm] || '';
            return `
              <div class="dav-student-row">
                <span class="dav-student-num">${i + 1}</span>
                <span class="dav-student-name" title="${esc(fullIsm)}">${esc(fullIsm)}</span>
                <div class="dav-status-btns">
                  ${DAV_STATUS_LIST.map(s => {
                    const active   = cur === s.key;
                    const izohText = s.key === 'sababli' ? (window._davomat_izoh && window._davomat_izoh[fullIsm]) : '';
                    const title    = izohText ? `${s.label}: ${izohText}` : s.label;
                    return `<button type="button" class="dav-s-btn${active ? ' active-' + s.key : ''}" title="${esc(title)}" data-ism="${esc(fullIsm)}" data-status="${s.key}">${s.icon}</button>`;
                  }).join('')}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');

  updateDavomatStatsBar();
}

function updateDavomatStatsBar() {
  const c = { keldi: 0, kelmadi: 0, sababli: 0, kech: 0 };
  Object.values(window._davomat_state || {}).forEach(s => { if (c[s] !== undefined) c[s]++; });
  g('dav-st-keldi').textContent   = c.keldi;
  g('dav-st-kelmadi').textContent = c.kelmadi;
  g('dav-st-sababli').textContent = c.sababli;
  g('dav-st-kech').textContent    = c.kech;
  g('dav-st-total').textContent   = davomatOquvchilarList.length;
}

let pendingDavIzoh = null; // { ism }

// Davomat status tugmalari uchun event delegation — ism ichida apostrof (')
// yoki boshqa maxsus belgilar bo'lsa ham (masalan "No'monova Madina") xavfsiz
// ishlaydi, chunki inline onclick ichiga ism satri endi umuman qo'shilmaydi.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.dav-s-btn');
  if (!btn) return;
  const ism    = btn.dataset.ism;
  const status = btn.dataset.status;
  if (ism && status) setGuruhDavStatus(ism, status);
});

function setGuruhDavStatus(ism, status) {
  if (status === 'sababli') {
    // "Sababli" — izoh yozish majburiy, shuning uchun oyna ochamiz
    pendingDavIzoh = { ism };
    g('dav-izoh-input').value = (window._davomat_izoh && window._davomat_izoh[ism]) || '';
    g('dav-izoh-err').textContent = '';
    g('dav-izoh-modal').style.display = 'flex';
    navPush('davIzoh', closeDavIzoh);
    setTimeout(() => g('dav-izoh-input').focus(), 100);
    return;
  }
  applyDavStatus(ism, status);
}

function applyDavStatus(ism, status) {
  // Xuddi shu statusga qayta bosilsa — belgini olib tashlaydi (admin panelidagi kabi)
  if (window._davomat_state[ism] === status) {
    delete window._davomat_state[ism];
    if (window._davomat_izoh) delete window._davomat_izoh[ism];
  } else {
    window._davomat_state[ism] = status;
    if (status !== 'sababli' && window._davomat_izoh) delete window._davomat_izoh[ism];
  }
  renderGuruhDavomat();
}

function confirmDavIzoh() {
  if (!pendingDavIzoh) return;
  const izoh = g('dav-izoh-input').value.trim();
  if (!izoh) {
    g('dav-izoh-err').textContent = "⚠️ Sabab kiritish majburiy";
    return;
  }
  const { ism } = pendingDavIzoh;
  if (!window._davomat_izoh) window._davomat_izoh = {};
  window._davomat_izoh[ism] = izoh;
  window._davomat_state[ism] = 'sababli';
  closeDavIzoh();
  renderGuruhDavomat();
}

function closeDavIzoh() {
  navRelease('davIzoh');
  g('dav-izoh-modal').style.display = 'none';
  pendingDavIzoh = null;
}

async function saveGuruhDavomat() {
  if (!activeDavomatGuruh) return;
  const state = window._davomat_state || {};
  const sana  = dateStrLocal(window._davomat_curdate);

  // Admin paneldagi kabi: sana ko'rinayotgan BARCHA o'quvchilar belgilanmaguncha saqlashga yo'l qo'yilmaydi
  const total  = davomatOquvchilarList.length;
  const marked = davomatOquvchilarList.filter(o => {
    const fullIsm = `${o.familiya || ''} ${o.ism || ''}`.trim();
    return !!state[fullIsm];
  }).length;

  if (!marked) { alert('⚠️ Hech narsa belgilanmadi'); return; }
  if (marked < total) { alert(`⚠️ Hali ${total - marked} ta o'quvchi belgilanmadi`); return; }

  const bySinf = {};
  davomatOquvchilarList.forEach(o => {
    const fullIsm = `${o.familiya || ''} ${o.ism || ''}`.trim();
    if (state[fullIsm]) {
      if (!bySinf[o.sinf]) bySinf[o.sinf] = [];
      bySinf[o.sinf].push({
        ism:    fullIsm,
        status: state[fullIsm],
        izoh:   (window._davomat_izoh && window._davomat_izoh[fullIsm]) || '',
      });
    }
  });

  try {
    const results = await Promise.all(Object.entries(bySinf).map(([sinf, records]) =>
      api.post('/api/davomat/sinf-davomat', { maktabId: TANLANGAN_MID, sinf, sana, records })
    ));
    const totalSaved = results.reduce((acc, r) => acc + (r && r.saved ? r.saved : 0), 0);
    alert(`✅ ${totalSaved} ta o'quvchi davomati saqlandi!`);
  } catch (e) {
    alert('❌ Server xatoligi');
  }
}

function closeGuruhDavomat() {
  navRelease('davomat');
  const listWrap = g('guruhlar-list-wrap'), davWrap = g('guruh-davomat-wrap');
  if (listWrap) listWrap.style.display = 'block';
  if (davWrap)  davWrap.style.display  = 'none';
  activeDavomatGuruh = null;
}


// ═══════════════════════════════════════════
//  DARS JADVALI
// ═══════════════════════════════════════════
async function loadJadval() {
  const wrap = g('jadval-content');
  wrap.innerHTML = '<div class="oq-loading"><div class="loading-spinner"></div></div>';

  try {
    const params = TANLANGAN_MID ? { maktabId: TANLANGAN_MID } : {};
    const data = await api.get('/api/jadval/mening-jadvalim-oqituvchi', params);

    if (!data || !data.ok) {
      wrap.innerHTML = '<div class="oq-empty">⚠️ Ma\'lumot yuklanmadi</div>';
      return;
    }

    const jadvallar = data.jadvallar || [];
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
          const exists = byKun[kunNom].find(x => x.fan === j.fan && x.sinflar === j.sinflar);
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
                ${d.sinflar ? `<div class="jadval-sinf">📚 ${esc(sortSinflar(d.sinflar.split(',').filter(Boolean)).join(', '))}</div>` : ''}
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
//  DARS SOATLARI STATISTIKASI
// ═══════════════════════════════════════════
let _soatReqSeq = 0;   // maktab tez almashtirilganda eski javob yangisini bosib ketmasin
async function loadSoatStatistika() {
  const wrap = g('soat-content');
  wrap.innerHTML = '<div class="oq-loading"><div class="loading-spinner"></div></div>';
  const mySeq = ++_soatReqSeq;

  try {
    const params = TANLANGAN_MID ? { maktabId: TANLANGAN_MID } : {};
    const data = await api.get('/api/davomat/soat-statistika', params);
    if (mySeq !== _soatReqSeq) return;   // bu so'rov eskirgan
    if (!data || !data.ok) {
      if (data && data.error) {
        wrap.innerHTML = '<div class="oq-empty">' + esc(data.error) + '</div>';
        return;
      }
      wrap.innerHTML = '<div class="oq-empty">⚠️ Ma\'lumot yuklanmadi</div>';
      return;
    }

    const t  = data.teacher    || {};
    const st = data.statistika || {};
    const oy = data.oylik      || [];

    const kunNomlar = (t.kunlar || '').split(',').map(k => KUN_NOMLARI_MAP[k.trim()] || k.trim()).filter(Boolean).join(', ') || '—';
    const rejaStr = (t.rejaSoat || t.rejaDaqiqa) ? `${t.rejaSoat}h ${t.rejaDaqiqa}min` : '—';
    const foiz = st.jamiDars > 0 ? Math.round((st.keldi + st.kech) / st.jamiDars * 100) : 0;

    let html = `
      <div class="soat-info-karta">
        <div class="soat-info-row"><span>📚 Fan</span><strong>${esc(t.fan||'—')}</strong></div>
        <div class="soat-info-row"><span>📅 Dars kunlari</span><strong>${esc(kunNomlar)}</strong></div>
        <div class="soat-info-row"><span>🕐 Dars vaqti</span><strong>${esc(t.boshlanish||'—')} – ${esc(t.tugash||'—')}</strong></div>
        <div class="soat-info-row"><span>📚 Sinflar</span><strong>${esc(t.sinflar||'—')}</strong></div>
        <div class="soat-info-row"><span>⏱️ Kunlik reja</span><strong>${rejaStr}</strong></div>
        <div class="soat-info-row"><span>📆 Dars kunlari soni</span><strong>${t.kunSoni||0} kun/hafta</strong></div>
      </div>

      <div class="oq-section-title">📊 Umumiy statistika (davomat: ${foiz}%)</div>
      <div class="soat-stats-grid">
        <div class="soat-stat-karta"><div class="soat-stat-num" style="color:#10b981">${st.haqSoat||0}h</div><div class="soat-stat-lbl">O'tilgan soat</div></div>
        <div class="soat-stat-karta"><div class="soat-stat-num" style="color:#8b5cf6">${st.jamiDars||0}</div><div class="soat-stat-lbl">Jami dars</div></div>
        <div class="soat-stat-karta"><div class="soat-stat-num" style="color:#10b981">${st.keldi||0}</div><div class="soat-stat-lbl">Keldi</div></div>
        <div class="soat-stat-karta"><div class="soat-stat-num" style="color:#ef4444">${st.kelmadi||0}</div><div class="soat-stat-lbl">Kelmadi</div></div>
      </div>`;

    if (oy.length) {
      html += `<div class="oq-section-title">📆 Oylik ko'rsatkich</div>`;
      oy.forEach(o => {
        const oyNom = OY_NOMLARI[parseInt(o.oy)] || o.oy;
        const soatJami = parseInt(o.soat||0) + Math.floor(parseInt(o.daqiqa||0)/60);
        const daqJami  = parseInt(o.daqiqa||0) % 60;
        html += `
          <div class="soat-oylik-karta">
            <div class="soat-oylik-oy">${esc(oyNom)} ${o.yil||''}</div>
            <div>
              <div class="soat-oylik-soat">${soatJami}h ${daqJami}min</div>
              <div class="soat-oylik-dars">${o.dars_soni||0} dars</div>
            </div>
          </div>`;
      });
    }

    wrap.innerHTML = html;
  } catch (e) {
    wrap.innerHTML = '<div class="oq-empty">⚠️ Xatolik yuz berdi</div>';
  }
}

// ═══════════════════════════════════════════
//  DARS SOATINI BELGILASH
//  Faqat o'qituvchining dars o'tadigan kunlari uchun:
//  ‹ › bilan dars kunlari bo'ylab yuriladi, kelajakka
//  chiqib bo'lmaydi. Saqlangan kun kartochka ko'rinishida.
// ═══════════════════════════════════════════
const _sm = {
  kunlar: new Set(),   // dars kunlari (0=Yakshanba ... 6=Shanba)
  jadvallar: [],       // tanlangan maktabdagi guruhlar
  cur: null,           // tanlangan sana (Date)
  saved: null,         // serverdagi yozuv (yo'q bo'lsa null)
  status: 'keldi',
  initSeq: 0,
  recSeq: 0,
  noteTimer: null,
};

const SM_STATUS = {
  keldi:   { icon: '✅', label: 'Keldi' },
  kelmadi: { icon: '❌', label: 'Kelmadi' },
  kech:    { icon: '⏰', label: 'Kech keldi' },
};

function smFmtSana(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function smIsLessonDay(d) { return _sm.kunlar.has(d.getDay()); }

// Berilgan sanadan dir yo'nalishida eng yaqin dars kuni; kelajakka chiqmaydi
function smFindLessonDate(from, dir) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(from); d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() + dir);
    if (dir > 0 && d > today) return null;
    if (smIsLessonDay(d)) return new Date(d);
  }
  return null;
}

// "HH:MM" -> daqiqa
function smToMin(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}

// Tanlangan kun uchun jadval bo'yicha rejalangan daqiqalar (guruhlar yig'indisi)
function smPlanMin(d) {
  let total = 0;
  _sm.jadvallar.forEach(j => {
    const days = parseKunlarSet(j.kunlar);
    if (!days.has(d.getDay())) return;
    const b = smToMin(j.boshlanish), t = smToMin(j.tugash);
    if (b !== null && t !== null && t > b) total += (t - b);
  });
  return total;
}

function smFmtDur(h, m) {
  const parts = [];
  if (h) parts.push(`${h} soat`);
  if (m) parts.push(`${m} daqiqa`);
  return parts.join(' ') || '0 daqiqa';
}

function smShowNote(text, isError) {
  const el = g('sm-note');
  clearTimeout(_sm.noteTimer);
  el.textContent = text;
  el.classList.toggle('mv-note-err', !!isError);
  el.style.display = 'block';
  if (!isError) _sm.noteTimer = setTimeout(() => { el.style.display = 'none'; }, 3500);
}

function smSetMode(mode) {   // 'loading' | 'card' | 'form' | 'none'
  g('sm-loading').style.display = mode === 'loading' ? 'block' : 'none';
  g('sm-card').style.display    = mode === 'card'    ? 'block' : 'none';
  g('sm-form').style.display    = mode === 'form'    ? 'block' : 'none';
}

// Bo'limni ishga tushirish: guruhlardan dars kunlarini aniqlaydi
async function initSoatMark() {
  const seq = ++_sm.initSeq;
  const empty = g('sm-empty'), body = g('sm-body');
  body.style.display = 'none';
  empty.style.display = 'none';

  if (!TANLANGAN_MID) {
    empty.textContent = '⚠️ Avval maktabni tanlang';
    empty.style.display = 'block';
    return;
  }

  let data = null;
  try { data = await api.get('/api/jadval/mening-jadvalim-oqituvchi', { maktabId: TANLANGAN_MID }); }
  catch (e) { data = null; }
  if (seq !== _sm.initSeq) return;   // maktab almashtirilgan — eski javobni tashlaymiz

  if (!data || !data.ok) {
    empty.textContent = "⚠️ Ma'lumot yuklanmadi";
    empty.style.display = 'block';
    return;
  }

  _sm.jadvallar = data.jadvallar || [];
  _sm.kunlar = new Set();
  _sm.jadvallar.forEach(j => parseKunlarSet(j.kunlar).forEach(n => _sm.kunlar.add(n)));

  if (!_sm.kunlar.size) {
    empty.innerHTML = '📭 Dars soatini belgilash uchun avval guruh yarating.<br>"➕ Guruh yaratish" bo\'limidan boshlang.';
    empty.style.display = 'block';
    return;
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  _sm.cur = smIsLessonDay(today) ? today : (smFindLessonDate(today, -1) || today);

  g('sm-date-picker').max = dateStrLocal(today);
  body.style.display = 'block';
  g('sm-note').style.display = 'none';
  smSetDateUI();
  smUpdateNav();
  await smLoadRecord();
}

function smSetDateUI() {
  const d = _sm.cur;
  g('sm-date-display').textContent = `${d.getDate()}-${OY_NOMLARI[d.getMonth() + 1]}, ${d.getFullYear()}`;
  g('sm-date-sub').textContent     = KUN_NOMLARI_MAP[String(d.getDay())] || '';
  g('sm-date-picker').value        = dateStrLocal(d);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  g('sm-date-picker-text').textContent = `${dd}/${mm}/${d.getFullYear()}`;
}

function smUpdateNav() {
  g('sm-prev-btn').disabled = !smFindLessonDate(_sm.cur, -1);
  g('sm-next-btn').disabled = !smFindLessonDate(_sm.cur, 1);
}

function smOpenDatePicker() {
  const inp = g('sm-date-picker');
  if (!inp) return;
  if (typeof inp.showPicker === 'function') {
    try { inp.showPicker(); return; } catch (e) { /* fallback pastda */ }
  }
  inp.focus();
  inp.click();
}

async function smChangeDate(dir) {
  const nd = smFindLessonDate(_sm.cur, dir);
  if (!nd) return;
  _sm.cur = nd;
  smSetDateUI();
  smUpdateNav();
  await smLoadRecord();
}

async function smOnDatePick() {
  const val = g('sm-date-picker').value;
  if (!val) return;
  const d = new Date(val + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (d > today) { alert('⚠️ Kelajak sanani tanlash mumkin emas'); smSetDateUI(); return; }
  if (!smIsLessonDay(d)) { alert("⚠️ Bu kun sizning dars kuningiz emas"); smSetDateUI(); return; }
  _sm.cur = d;
  smSetDateUI();
  smUpdateNav();
  await smLoadRecord();
}

// Tanlangan kun uchun serverdagi yozuvni yuklash
async function smLoadRecord() {
  const my = ++_sm.recSeq;
  const sana = smFmtSana(_sm.cur);
  g('sm-note').style.display = 'none';
  _sm.saved = null;
  smSetMode('loading');

  let res = null;
  try { res = await api.get('/api/davomat/mening-darsim', { sana, maktabId: TANLANGAN_MID }); }
  catch (e) { res = null; }
  if (my !== _sm.recSeq) return;   // boshqa sanaga o'tib ketilgan

  if (!res || !res.ok) {
    smSetMode('none');
    smShowNote("⚠️ Yuklab bo'lmadi. Internetni tekshirib, sanani qayta tanlang", true);
    return;
  }

  _sm.saved = res.yozuv || null;
  if (_sm.saved) {
    smRenderCard(_sm.saved);
    smSetMode('card');
  } else {
    smFillForm(null);
    g('sm-cancel-btn').style.display = 'none';
    smSetMode('form');
  }
}

function smFillForm(rec) {
  if (rec) {
    smSelectStatus(rec.status || 'keldi');
    g('sm-soat').value   = rec.dars_soat   || '';
    g('sm-daqiqa').value = rec.dars_daqiqa || '';
    g('sm-kech').value   = rec.kech_minut  || '';
    g('sm-izoh').value   = rec.izoh || '';
  } else {
    // Yangi kun: davomiylik jadvaldan avtomatik to'ldiriladi
    const plan = smPlanMin(_sm.cur);
    smSelectStatus('keldi');
    g('sm-soat').value   = plan ? Math.floor(plan / 60) : '';
    g('sm-daqiqa').value = plan ? (plan % 60) : '';
    g('sm-kech').value   = '';
    g('sm-izoh').value   = '';
  }
  const plan = smPlanMin(_sm.cur);
  g('sm-plan').textContent = plan ? `Jadval bo'yicha: ${smFmtDur(Math.floor(plan / 60), plan % 60)}` : '';
}

function smSelectStatus(status) {
  _sm.status = status;
  ['keldi', 'kelmadi', 'kech'].forEach(k => g('sm-st-' + k).classList.toggle('active', k === status));
  g('sm-time-wrap').style.display = status === 'kelmadi' ? 'none' : 'block';
  g('sm-kech-wrap').style.display = status === 'kech'    ? 'block' : 'none';
}

function smRenderCard(r) {
  const st = SM_STATUS[r.status] || { icon: '•', label: r.status || '—' };
  const h = r.dars_soat || 0, m = r.dars_daqiqa || 0;
  g('sm-card').innerHTML = `
    <div class="mv-card-top">
      <span class="mv-badge-ok">✅ Saqlangan</span>
      <span class="mv-card-time">${r.vaqt_belgilangan ? 'Belgilangan: ' + esc(r.vaqt_belgilangan) : ''}</span>
    </div>

    <div class="mv-card-label">Holat</div>
    <div class="mv-card-title">${st.icon} ${esc(st.label)}</div>

    ${r.status !== 'kelmadi' ? `
      <div class="mv-card-label">Dars davomiyligi</div>
      <div class="mv-card-title">${esc(smFmtDur(h, m))}</div>` : ''}

    ${r.status === 'kech' && r.kech_minut ? `<div class="mv-chips"><span class="mv-chip mv-chip-warn">⏰ ${r.kech_minut} daqiqa kech</span></div>` : ''}

    ${r.izoh ? `<div class="mv-card-label">Izoh</div><div class="mv-card-text">${esc(r.izoh)}</div>` : ''}

    <div class="mv-actions">
      <button type="button" class="mv-btn" onclick="smEdit()">✏️ Tahrirlash</button>
      <button type="button" class="mv-btn mv-btn-danger" onclick="smDelete()">🗑 O'chirish</button>
    </div>`;
}

function smEdit() {
  if (!_sm.saved) return;
  smFillForm(_sm.saved);
  g('sm-cancel-btn').style.display = 'block';
  smSetMode('form');
}

function smCancelEdit() {
  if (_sm.saved) { smRenderCard(_sm.saved); smSetMode('card'); }
}

async function smSave() {
  const status = _sm.status;
  const soat   = parseInt(g('sm-soat').value, 10)   || 0;
  const daqiqa = parseInt(g('sm-daqiqa').value, 10) || 0;

  if (status !== 'kelmadi') {
    if (soat < 0 || soat > 12 || daqiqa < 0 || daqiqa > 59) {
      smShowNote("❌ Soat 0–12, daqiqa 0–59 oralig'ida bo'lishi kerak", true); return;
    }
    if (soat === 0 && daqiqa === 0) {
      smShowNote('❌ Dars davomiyligini kiriting', true); return;
    }
  }

  const body = {
    sana:        smFmtSana(_sm.cur),
    maktabId:    TANLANGAN_MID || undefined,
    status,
    dars_soat:   status === 'kelmadi' ? 0 : soat,
    dars_daqiqa: status === 'kelmadi' ? 0 : daqiqa,
    kech_minut:  status === 'kech' ? (parseInt(g('sm-kech').value, 10) || 0) : 0,
    izoh:        g('sm-izoh').value.trim(),
  };

  const btn = g('sm-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saqlanmoqda…';
  try {
    const data = await api.post('/api/davomat/mening-darsim', body);
    if (data && data.ok) {
      await smLoadRecord();
      smShowNote('✅ Saqlandi');
      loadSoatStatistika();
    } else {
      smShowNote('❌ ' + ((data && data.error) || 'Xatolik'), true);
    }
  } catch (e) {
    smShowNote("❌ Server bilan ulanib bo'lmadi", true);
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Saqlash';
  }
}

async function smDelete() {
  if (!confirm("Bu kundagi dars belgisi o'chirilsinmi?")) return;
  try {
    const data = await api.del('/api/davomat/mening-darsim', { sana: smFmtSana(_sm.cur), maktabId: TANLANGAN_MID || undefined });
    if (data && data.ok) {
      await smLoadRecord();
      smShowNote("🗑 O'chirildi");
      loadSoatStatistika();
    } else {
      smShowNote('❌ ' + ((data && data.error) || 'Xatolik'), true);
    }
  } catch (e) {
    smShowNote("❌ Server bilan ulanib bo'lmadi", true);
  }
}

// ═══════════════════════════════════════════
//  VAZIFALARNI TEKSHIRISH (o'quvchilar yuborgan
//  uy vazifasi javoblarini ko'rish va baholash)
// ═══════════════════════════════════════════
let _vazifaHolat = 'yuborilgan';

function switchVazifaHolat(chipEl, holat) {
  _vazifaHolat = holat;
  document.querySelectorAll('#tab-vazifalar .sinf-chip').forEach(c => c.classList.remove('active'));
  chipEl.classList.add('active');
  loadVazifalarniTekshirish();
}

async function loadVazifalarniTekshirish() {
  const wrap = g('vazifalar-tekshirish-content');
  wrap.innerHTML = '<div class="oq-loading"><div class="loading-spinner"></div></div>';

  try {
    const res = await api.getVazifalarTekshirish(_vazifaHolat);
    const javoblar = (res && res.ok) ? (res.javoblar || []) : [];

    if (!javoblar.length) {
      wrap.innerHTML = '<div class="oq-empty">📭 Bu bo\'limda hozircha yozuv yo\'q</div>';
      return;
    }

    let html = '';
    javoblar.forEach(j => {
      const sinfText = (j.sinflar || '').split(',').filter(Boolean)
        .map(s => s.replace(/-sinf$/i, '')).join(', ');
      const bahoBadge = j.holat === 'tekshirilgan'
        ? `<span class="dav-stat-pill k">✅ Baho: ${esc(j.baho ?? '—')}</span>`
        : `<span class="dav-stat-pill s">⏳ Tekshirilmagan</span>`;

      html += `
        <div class="guruh-card" style="cursor:default;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
            <div>
              <div style="font-weight:600;">${esc(j.oquvchi_familiya)} ${esc(j.oquvchi_ism)} <span style="color:var(--muted);font-weight:400;">(${esc(sinfText)}-sinf)</span></div>
              <div style="font-size:12.5px;color:var(--muted);margin-top:2px;">${esc(j.fan || '')} • ${esc(j.sana)} — ${esc(j.mavzu || 'mavzu kiritilmagan')}</div>
            </div>
            ${bahoBadge}
          </div>
          <div style="margin-top:10px;font-size:13.5px;line-height:1.5;">
            <b>Uyga vazifa:</b> ${esc(j.uy_vazifasi || '—')}
            ${j.vazifa_fayl ? `<div style="margin-top:4px;"><a href="${esc(resolveUploadUrl(j.vazifa_fayl))}" target="_blank" rel="noopener">📎 Sizning biriktirgan faylingiz</a></div>` : ''}
          </div>
          <div style="margin-top:8px;font-size:13.5px;line-height:1.5;background:var(--bg-soft,#f8fafc);border-radius:8px;padding:10px;">
            <b>O'quvchi javobi:</b> ${esc(j.javob_matn || '—')}
            ${(j.javob_fayllar || []).length ? `<div style="margin-top:4px;display:flex;flex-direction:column;gap:2px;">` +
              j.javob_fayllar.map(f => `<a href="${esc(resolveUploadUrl(f.fayl_nomi))}" target="_blank" rel="noopener">📎 ${esc(f.original_nomi || f.fayl_nomi)}</a>`).join('') +
              `</div>` : ''}
          </div>
          ${j.holat === 'tekshirilgan' ? `
            <div style="margin-top:8px;font-size:12.5px;color:var(--muted);">💬 Izoh: ${esc(j.oqituvchi_izohi || '—')}</div>
          ` : `
            <div class="field-group" style="margin-top:10px;display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
              <div style="flex:0 0 90px;">
                <label class="field-label">Baho</label>
                <input class="field-input" type="number" min="1" max="5" id="vz-baho-${j.id}" placeholder="1-5">
              </div>
              <div style="flex:1 1 200px;">
                <label class="field-label">Izoh (ixtiyoriy)</label>
                <input class="field-input" type="text" id="vz-izoh-${j.id}" placeholder="Yaxshi bajarilgan, davom eting">
              </div>
              <button class="btn-primary" style="padding:9px 16px;" onclick="baholaVazifa(${j.id})">Baholash</button>
            </div>
          `}
        </div>`;
    });

    wrap.innerHTML = html;
  } catch (e) {
    wrap.innerHTML = '<div class="oq-empty">⚠️ Xatolik yuz berdi</div>';
  }
}

async function baholaVazifa(javobId) {
  const bahoEl = g('vz-baho-' + javobId);
  const izohEl = g('vz-izoh-' + javobId);
  const baho = bahoEl.value ? parseInt(bahoEl.value) : null;
  if (!baho) { alert('Baho kiriting'); return; }

  try {
    const res = await api.baholaVazifaJavobi(javobId, { baho, izoh: izohEl.value.trim() });
    if (res && res.ok) {
      loadVazifalarniTekshirish();
    } else {
      alert(res?.error || 'Baholashda xatolik yuz berdi');
    }
  } catch (e) {
    alert('Baholashda xatolik yuz berdi');
  }
}