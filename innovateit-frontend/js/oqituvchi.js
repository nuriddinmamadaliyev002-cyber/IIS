// ═══════════════════════════════════════════════════
//  InnovateIT — O'qituvchi Panel JS
//  Telegram orqali biriktirilgan o'qituvchilar shu web
//  panel orqali ishlaydi (avvalgi mini-app sahifalari o'rniga)
// ═══════════════════════════════════════════════════

let U             = null;   // { ism, entityId, viaTelegram: true }
let TEACHER_ID    = null;
let MAKTABLAR_RO  = [];     // [{id, nomi}]
let TANLANGAN_MID = null;   // tanlangan maktab id
let CURRENT_SINF_MAP = {};  // { sinfNomi: [oquvchilar] }

const g = id => document.getElementById(id);

const KUN_NOMLARI_MAP = { '1':'Dushanba','2':'Seshanba','3':'Chorshanba','4':'Payshanba','5':'Juma','6':'Shanba','0':'Yakshanba' };
const KUN_TARTIB       = ['Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba','Yakshanba'];
const OY_NOMLARI       = ['','Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

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
      entityId:    payload?.entityId || null,
      maktablar:   payload?.maktablar   || [],
      maktabIdlar: payload?.maktabIdlar || [],
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
  window.location.href = 'index.html';
}

function showApp() {
  g('login-screen').style.display = 'none';
  g('app').style.display = 'block';
  g('oq-badge').textContent = U.ism;
  TEACHER_ID = U.entityId;

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

  switchTab('sinflar');
}

function onMaktabChange() {
  TANLANGAN_MID = g('oq-maktab-selector').value;
  closeSinfOquvchilar();
  loadSinflar();
  loadJadval();
}

// ─── Tab almashtirish ─────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.oq-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.oq-tab-page').forEach(p => p.classList.remove('active'));
  g('tab-btn-' + tab).classList.add('active');
  g('tab-' + tab).classList.add('active');

  if (tab === 'sinflar') loadSinflar();
  if (tab === 'jadval')  loadJadval();
  if (tab === 'soat')    loadSoatStatistika();
}

// ═══════════════════════════════════════════
//  SINFLAR
// ═══════════════════════════════════════════
async function loadSinflar() {
  closeSinfOquvchilar();
  const wrap = g('sinflar-grid');
  wrap.innerHTML = '<div class="oq-loading"><div class="loading-spinner"></div></div>';

  if (!TEACHER_ID) {
    wrap.innerHTML = '<div class="oq-empty">⚠️ O\'qituvchi ID topilmadi</div>';
    return;
  }

  try {
    const data = await api.get(`/api/teachers/${TEACHER_ID}/oquvchilar`);
    if (!data || !data.ok) {
      wrap.innerHTML = '<div class="oq-empty">⚠️ Ma\'lumot yuklanmadi</div>';
      return;
    }

    let oquvchilar = data.oquvchilar || [];
    if (TANLANGAN_MID) {
      oquvchilar = oquvchilar.filter(o => String(o.maktab_id) === String(TANLANGAN_MID));
    }

    const sinfMap = {};
    oquvchilar.forEach(o => {
      const s = o.sinf || '—';
      if (!sinfMap[s]) sinfMap[s] = [];
      sinfMap[s].push(o);
    });
    CURRENT_SINF_MAP = sinfMap;

    const sinflar = Object.keys(sinfMap).sort((a, b) => {
      const na = parseInt(a) || 0, nb = parseInt(b) || 0;
      return na - nb || a.localeCompare(b);
    });

    if (!sinflar.length) {
      wrap.innerHTML = '<div class="oq-empty">📭 Biriktirilgan o\'quvchi yo\'q</div>';
      return;
    }

    wrap.innerHTML = sinflar.map(sinf => {
      const clean = sinf.replace(/-sinf$/i, '');
      const parts = clean.split('-');
      const raqam = parts[0] || sinf;
      const harf  = parts[1] ? parts[1].toUpperCase() : '';
      const sinfNomi = clean + '-sinf';
      return `
        <div class="sinf-card" onclick="openSinfOquvchilar('${esc(sinf).replace(/'/g, "\\'")}')">
          <div class="sinf-card-badge">${raqam}${harf}</div>
          <div class="sinf-card-name">${esc(sinfNomi)}</div>
          <div class="sinf-card-count">${sinfMap[sinf].length} o'quvchi</div>
        </div>`;
    }).join('');
  } catch (e) {
    wrap.innerHTML = '<div class="oq-empty">⚠️ Xatolik yuz berdi</div>';
  }
}

function openSinfOquvchilar(sinf) {
  const list = CURRENT_SINF_MAP[sinf] || [];
  g('sinflar-grid').style.display = 'none';
  g('sinf-oquvchilar-wrap').style.display = 'block';
  g('sinf-oquv-title').textContent = `${sinf.replace(/-sinf$/i,'')}-sinf — davomat`;

  window._davomat_sinf  = sinf;
  window._davomat_mid   = TANLANGAN_MID;
  window._davomat_state = {};

  const today = new Date();
  const sana = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  window._davomat_sana = sana;
  g('dav-sana-wrap').innerHTML = `<span class="dav-sana-lbl">📅 ${sana}</span>`;

  if (!list.length) {
    g('sinf-oquv-list').innerHTML = '<div class="oq-empty">📭 O\'quvchi topilmadi</div>';
    return;
  }

  g('sinf-oquv-list').innerHTML = '<div class="oq-loading"><div class="loading-spinner"></div></div>';

  const url = `/api/davomat/sinf-davomat?maktabId=${TANLANGAN_MID}&sinf=${encodeURIComponent(sinf)}&sana=${sana}`;
  api.get(url).then(data => {
    if (data && data.ok) {
      (data.records || []).forEach(r => { window._davomat_state[r.oquvchi_ism] = r.status; });
    }
    renderSinfDavomat(list);
  }).catch(() => renderSinfDavomat(list));
}

const DAV_STATUS_LIST = [
  { key: 'keldi',   label: 'Keldi',   color: '#10b981', icon: '✅' },
  { key: 'kelmadi', label: 'Kelmadi', color: '#ef4444', icon: '❌' },
  { key: 'kech',    label: 'Kech',    color: '#8b5cf6', icon: '⏰' },
  { key: 'sababli', label: 'Sababli', color: '#f59e0b', icon: '📋' },
];

function renderSinfDavomat(list) {
  const wrap = g('sinf-oquv-list');
  wrap.innerHTML = list.map((o, idx) => {
    const fullIsm = `${o.familiya||''} ${o.ism||''}`.trim();
    const init  = (fullIsm[0] || '?').toUpperCase();
    const curSt = window._davomat_state[fullIsm] || '';

    const btns = DAV_STATUS_LIST.map(s => {
      const active = curSt === s.key;
      const style = active ? `background:${s.color}22;border-color:${s.color};color:${s.color};` : '';
      return `<button type="button" class="dars-status-btn" style="${style}" onclick="setDavStatus('${esc(fullIsm).replace(/'/g,"\\'")}','${s.key}')">${s.icon} ${s.label}</button>`;
    }).join('');

    return `
      <div class="oq-stu-row" style="flex-direction:column;align-items:stretch;gap:10px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="oq-stu-avatar">${init}</div>
          <div>
            <div class="oq-stu-name">${esc(fullIsm)}</div>
            <div class="oq-stu-detail">📚 ${esc(o.sinf||'—')}</div>
          </div>
        </div>
        <div class="dars-status-row">${btns}</div>
      </div>`;
  }).join('');
}

function setDavStatus(ism, status) {
  window._davomat_state[ism] = status;
  const list = CURRENT_SINF_MAP[window._davomat_sinf] || [];
  renderSinfDavomat(list);
}

async function saveSinfDavomat() {
  const sinf  = window._davomat_sinf;
  const sana  = window._davomat_sana;
  const mid   = window._davomat_mid;
  const state = window._davomat_state || {};

  const records = Object.entries(state).filter(([, st]) => st).map(([ism, st]) => ({ ism, status: st }));
  if (!records.length) { alert("Hech qanday status belgilanmadi!"); return; }

  try {
    const res = await api.post('/api/davomat/sinf-davomat', { maktabId: mid, sinf, sana, records });
    if (res && res.ok) {
      alert(`✅ ${res.saved} ta o'quvchi davomati saqlandi!`);
    } else {
      alert('❌ Xatolik: ' + (res && res.error || "Noma'lum"));
    }
  } catch (e) {
    alert('❌ Server xatoligi');
  }
}

function closeSinfOquvchilar() {
  g('sinflar-grid').style.display = 'grid';
  g('sinf-oquvchilar-wrap').style.display = 'none';
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
