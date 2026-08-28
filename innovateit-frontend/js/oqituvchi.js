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
  g('login-screen').style.display = 'none';
  g('app').style.display = 'block';
  g('oq-badge').textContent = U.ism;
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
    sel.style.display = 'inline-block';
  } else if (MAKTABLAR_RO.length === 1) {
    TANLANGAN_MID = MAKTABLAR_RO[0].id;
  }

  switchTab('guruhlar');
}

function onMaktabChange() {
  TANLANGAN_MID = g('oq-maktab-selector').value;
  closeGuruhDavomat();
  loadGuruhlarim();
  loadJadval();
  clearGuruhForm();
  if (g('tab-guruh').classList.contains('active')) initGuruhTab();
}

// ─── Tab almashtirish ─────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.oq-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.oq-tab-page').forEach(p => p.classList.remove('active'));
  g('tab-btn-' + tab).classList.add('active');
  g('tab-' + tab).classList.add('active');

  if (tab === 'guruhlar') loadGuruhlarim();
  if (tab === 'jadval')   loadJadval();
  if (tab === 'soat')     loadSoatStatistika();
  if (tab === 'guruh')    initGuruhTab();
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
  g('guruh-form-title').textContent = "➕ Sinf o'quvchilaridan o'zingiz uchun guruh yarating";
  g('guruh-delete-wrap').style.display = 'none';
  activeGuruhSinf = null;
  guruhOquvchilarMap.clear();
  guruhOquvchilarNames.clear();
  pendingGuruhData = null;
  editingGuruhId = null;
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
}

function closeGuruhConfirmModal() {
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

  const sinflarSet  = new Set((j.sinflar || '').split(',').filter(Boolean));
  const sinflarText = [...sinflarSet].map(s => s.replace(/-sinf$/i, '')).join(', ');
  g('guruh-dav-title').textContent = `📋 ${sinflarText}-sinf — davomat`;

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
            <span class="sinf-badge">${esc(sinf.replace(/-sinf$/i, ''))}</span>
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
                ${d.sinflar ? `<div class="jadval-sinf">📚 ${esc(d.sinflar)}</div>` : ''}
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
async function loadSoatStatistika() {
  const wrap = g('soat-content');
  wrap.innerHTML = '<div class="oq-loading"><div class="loading-spinner"></div></div>';

  try {
    const data = await api.get('/api/davomat/soat-statistika');
    if (!data || !data.ok) {
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

    html += `<button class="oq-mark-btn" onclick="openDarsModal()">✏️ Bugungi darsni belgilash</button>`;

    wrap.innerHTML = html;
  } catch (e) {
    wrap.innerHTML = '<div class="oq-empty">⚠️ Xatolik yuz berdi</div>';
  }
}

// ═══════════════════════════════════════════
//  DARSNI BELGILASH (modal)
// ═══════════════════════════════════════════
let _darsStatus = 'keldi';

function openDarsModal() {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2,'0');
  const mm = String(today.getMonth()+1).padStart(2,'0');
  g('dars-sana').value = `${dd}.${mm}.${today.getFullYear()}`;
  g('dars-soat').value = '';
  g('dars-daqiqa').value = '';
  g('dars-kech-minut').value = '';
  g('dars-izoh').value = '';
  g('dars-modal-msg').textContent = '';
  selectDarsStatus('keldi');
  g('dars-modal').style.display = 'flex';
}

function closeDarsModal() {
  g('dars-modal').style.display = 'none';
}

function selectDarsStatus(status) {
  _darsStatus = status;
  document.querySelectorAll('.dars-status-btn').forEach(b => b.classList.remove('active'));
  g('dars-st-' + status)?.classList.add('active');
  g('dars-kech-wrap').style.display = status === 'kech' ? 'block' : 'none';
}

async function saveDarsBelgilash() {
  const msgEl = g('dars-modal-msg');
  msgEl.textContent = '';

  const sana = g('dars-sana').value.trim();
  if (!sana) { msgEl.style.color = '#ef4444'; msgEl.textContent = '❌ Sanani kiriting'; return; }

  const body = {
    sana,
    status:       _darsStatus,
    dars_soat:    parseInt(g('dars-soat').value)    || 0,
    dars_daqiqa:  parseInt(g('dars-daqiqa').value)  || 0,
    kech_minut:   parseInt(g('dars-kech-minut').value) || 0,
    izoh:         g('dars-izoh').value.trim(),
  };

  const btn = g('dars-save-btn');
  btn.disabled = true;
  g('dars-btn-txt').textContent = 'Saqlanmoqda…';

  try {
    const data = await api.post('/api/davomat/mening-darsim', body);
    if (data.ok) {
      msgEl.style.color = '#10b981';
      msgEl.textContent = '✅ Muvaffaqiyatli saqlandi!';
      setTimeout(() => { closeDarsModal(); loadSoatStatistika(); }, 900);
    } else {
      msgEl.style.color = '#ef4444';
      msgEl.textContent = '❌ ' + (data.error || 'Xatolik');
    }
  } catch (e) {
    msgEl.style.color = '#ef4444';
    msgEl.textContent = '❌ Server bilan ulanib bo\'lmadi';
  } finally {
    btn.disabled = false;
    g('dars-btn-txt').textContent = '💾 Saqlash';
  }
}