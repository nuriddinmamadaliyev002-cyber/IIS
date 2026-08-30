// ═══════════════════════════════════════════════════
//  InnovateIT — O'quvchi Panel JS
//  Telegram orqali biriktirilgan o'quvchilar shu web
//  panel orqali o'z davomati va dars jadvalini ko'radi
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

  // Jinsiga qarab avatar — admin panelda belgilangan bo'lsa shunga mos,
  // aks holda standart sifatida o'g'il bola rasmi ko'rsatiladi
  const avatarImg = g('ouq-avatar-img');
  if (avatarImg) {
    avatarImg.src = U.avatar === 'ayol' ? 'img/oquvchi-icon-ayol.png' : 'img/oquvchi-icon-erkak.png';
  }

  loadDavomatim();
  loadJadvalim();
}

function switchTab(tab) {
  document.querySelectorAll('.oq-tab-page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.oq-tab-btn').forEach(el => el.classList.remove('active'));
  g('tab-' + tab).classList.add('active');
  g('tab-btn-' + tab).classList.add('active');
}

// ═══════════════════════════════════════════
//  DAVOMATIM
// ═══════════════════════════════════════════
let davomatimSana = new Date(); // joriy ko'rib turilgan oy/yil

function changeDavomatimOy(delta) {
  davomatimSana.setMonth(davomatimSana.getMonth() + delta);
  loadDavomatim();
}

async function loadDavomatim() {
  const wrap  = g('ouq-dav-list');
  const stats = g('ouq-dav-stats');
  wrap.innerHTML = '<div class="oq-loading"><div class="loading-spinner"></div></div>';
  stats.innerHTML = '';

  const oy  = davomatimSana.getMonth() + 1;
  const yil = davomatimSana.getFullYear();
  g('ouq-oy-label').textContent = `${OY_NOMLARI[oy]} ${yil}`;

  try {
    const data = await api.get('/api/davomat/mening-davomatim', { oy, yil });

    if (!data || !data.ok) {
      wrap.innerHTML = '<div class="oq-empty">⚠️ Ma\'lumot yuklanmadi</div>';
      return;
    }

    const records = (data.records || []).filter(r => r.sana);
    if (!records.length) {
      wrap.innerHTML = '<div class="oq-empty">📭 Bu oyda davomat belgilanmagan</div>';
      return;
    }

    // Statistika — faqat shu oy bo'yicha
    const c = { keldi: 0, kelmadi: 0, sababli: 0, kech: 0 };
    records.forEach(r => { if (c[r.status] !== undefined) c[r.status]++; });
    stats.innerHTML = `
      <span class="ouq-stat-pill k">✅ Keldi <b>${c.keldi}</b></span>
      <span class="ouq-stat-pill x">❌ Kelmadi <b>${c.kelmadi}</b></span>
      <span class="ouq-stat-pill s">📋 Sababli <b>${c.sababli}</b></span>
      <span class="ouq-stat-pill l">⏰ Kech <b>${c.kech}</b></span>
    `;

    // Sana bo'yicha kamayish tartibida (server allaqachon shu tartibda beradi)
    wrap.innerHTML = records.map(r => {
      const meta = DAV_STATUS_META[r.status] || { emoji: '❔', label: r.status || '—', cls: '' };
      return `
        <div class="ouq-dav-row">
          <span class="ouq-dav-date">${esc(formatSana(r.sana))}</span>
          <span class="ouq-dav-badge ${meta.cls}">${meta.emoji} ${meta.label}</span>
          ${r.izoh ? `<div class="ouq-dav-izoh">💬 ${esc(r.izoh)}</div>` : ''}
        </div>`;
    }).join('');
  } catch (e) {
    wrap.innerHTML = '<div class="oq-empty">⚠️ Xatolik yuz berdi</div>';
  }
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
//  DARS JADVALIM
// ═══════════════════════════════════════════
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
