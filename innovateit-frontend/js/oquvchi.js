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
  if (tab === 'vazifalar') loadVazifalarim();
}

// ═══════════════════════════════════════════
//  DAVOMATIM
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

// ═══════════════════════════════════════════
//  VAZIFALARIM (mavzu / uyga vazifa + javob yuborish)
// ═══════════════════════════════════════════
let vazifalarimList = [];

function resolveUploadUrl(filename) {
  if (!filename) return '';
  if (filename.startsWith('http')) return filename;
  const base = (typeof BASE !== 'undefined') ? BASE : '';
  return `${base}/uploads/${filename}`;
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
    if (!vazifalarimList.length) {
      wrap.innerHTML = '<div class="oq-empty">📭 Hozircha vazifa yo\'q</div>';
      return;
    }

    renderVazifalarim();
  } catch (e) {
    wrap.innerHTML = '<div class="oq-empty">⚠️ Xatolik yuz berdi</div>';
  }
}

function renderVazifalarim() {
  const wrap = g('ouq-vazifalar-content');

  wrap.innerHTML = vazifalarimList.map(v => {
    const teacherIsm = `${v.teacher_familiya || ''} ${v.teacher_ism || ''}`.trim();
    const hasHomework = (v.uy_vazifasi || '').trim().length > 0;

    let statusBlock;
    if (!v.javob_id) {
      // Hali javob yuborilmagan
      statusBlock = hasHomework ? `
        <div class="field-group" style="margin-top:10px;">
          <label class="field-label">Javobingiz</label>
          <textarea class="field-input" id="vzm-matn-${v.id}" rows="3" placeholder="Javobingizni shu yerga yozing"></textarea>
        </div>
        <div class="field-group">
          <label class="field-label">Fayl biriktirish (ixtiyoriy)</label>
          <input type="file" id="vzm-fayl-${v.id}" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx">
          <div id="vzm-fayl-status-${v.id}" style="font-size:12px;color:var(--muted);margin-top:4px;"></div>
        </div>
        <button class="btn-primary" style="padding:9px 16px;" onclick="yuborVazifa(${v.id})">📤 Yuborish</button>
      ` : '';
    } else if (v.holat === 'tekshirilgan') {
      // Baholangan — tahrirlab bo'lmaydi
      statusBlock = `
        <div style="margin-top:10px;font-size:13.5px;line-height:1.5;background:var(--bg-soft,#f8fafc);border-radius:8px;padding:10px;">
          <b>Sizning javobingiz:</b> ${esc(v.javob_matn || '—')}
          ${v.javob_fayl ? `<div style="margin-top:4px;"><a href="${esc(resolveUploadUrl(v.javob_fayl))}" target="_blank" rel="noopener">📎 Yuborilgan fayl</a></div>` : ''}
        </div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="ouq-stat-pill k">✅ Baho <b>${esc(v.baho ?? '—')}</b></span>
        </div>
        ${v.oqituvchi_izohi ? `<div style="margin-top:6px;font-size:12.5px;color:var(--muted);">💬 ${esc(v.oqituvchi_izohi)}</div>` : ''}
      `;
    } else {
      // Yuborilgan, hali tekshirilmagan — tahrirlash mumkin
      statusBlock = `
        <div style="margin-top:10px;font-size:13.5px;line-height:1.5;background:var(--bg-soft,#f8fafc);border-radius:8px;padding:10px;">
          <b>Sizning javobingiz:</b> ${esc(v.javob_matn || '—')}
          ${v.javob_fayl ? `<div style="margin-top:4px;"><a href="${esc(resolveUploadUrl(v.javob_fayl))}" target="_blank" rel="noopener">📎 Yuborilgan fayl</a></div>` : ''}
        </div>
        <div style="margin-top:8px;">
          <span class="ouq-stat-pill s">⏳ Tekshirilmoqda</span>
          <button class="oq-back-btn" style="padding:0;margin-left:10px;font-size:12.5px;" onclick="toggleVazifaTahrir(${v.id})">✏️ Javobni tahrirlash</button>
        </div>
        <div id="vzm-edit-${v.id}" style="display:none;margin-top:10px;">
          <div class="field-group">
            <label class="field-label">Javobingiz</label>
            <textarea class="field-input" id="vzm-matn-${v.id}" rows="3">${esc(v.javob_matn || '')}</textarea>
          </div>
          <div class="field-group">
            <label class="field-label">Fayl biriktirish (ixtiyoriy)</label>
            <input type="file" id="vzm-fayl-${v.id}" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx">
            <div id="vzm-fayl-status-${v.id}" style="font-size:12px;color:var(--muted);margin-top:4px;"></div>
          </div>
          <button class="btn-primary" style="padding:9px 16px;" onclick="yuborVazifa(${v.id})">💾 Yangilash</button>
        </div>
      `;
    }

    return `
      <div class="ouq-dav-row" style="display:block;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-weight:600;">${esc(v.fan || '—')}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">${esc(formatSana(v.sana))} • ${esc(teacherIsm)}</div>
          </div>
          ${v.muddat ? `<span style="font-size:11.5px;color:var(--muted);white-space:nowrap;">⏰ Muddat: ${esc(formatSana(v.muddat))}</span>` : ''}
        </div>
        ${v.mavzu ? `<div style="margin-top:8px;font-size:13.5px;"><b>Mavzu:</b> ${esc(v.mavzu)}</div>` : ''}
        ${hasHomework ? `<div style="margin-top:4px;font-size:13.5px;"><b>Uyga vazifa:</b> ${esc(v.uy_vazifasi)}</div>` : '<div style="margin-top:4px;font-size:12.5px;color:var(--muted);">Bu darsga uyga vazifa berilmagan</div>'}
        ${v.vazifa_fayl ? `<div style="margin-top:4px;font-size:12.5px;"><a href="${esc(resolveUploadUrl(v.vazifa_fayl))}" target="_blank" rel="noopener">📎 O'qituvchi biriktirgan fayl</a></div>` : ''}
        ${statusBlock}
      </div>`;
  }).join('');
}

function toggleVazifaTahrir(vazifaId) {
  const el = g('vzm-edit-' + vazifaId);
  if (el) el.style.display = (el.style.display === 'none') ? 'block' : 'none';
}

async function yuborVazifa(vazifaId) {
  const matnEl = g('vzm-matn-' + vazifaId);
  const faylEl = g('vzm-fayl-' + vazifaId);
  const statusEl = g('vzm-fayl-status-' + vazifaId);
  const javob_matn = (matnEl?.value || '').trim();

  const existing = vazifalarimList.find(v => v.id === vazifaId);
  let javob_fayl = existing?.javob_fayl || '';

  const file = faylEl?.files?.[0];
  if (file) {
    if (statusEl) statusEl.textContent = '⏳ Fayl yuklanmoqda...';
    const fd = new FormData();
    fd.append('file', file);
    const upRes = await api.uploadFile(fd);
    if (!upRes || !upRes.ok) {
      if (statusEl) statusEl.textContent = '❌ Fayl yuklanmadi';
      return;
    }
    javob_fayl = upRes.filename;
    if (statusEl) statusEl.textContent = '✅ Fayl yuklandi';
  }

  if (!javob_matn && !javob_fayl) {
    alert('Javob matni yoki fayl biriktiring');
    return;
  }

  try {
    const res = await api.yuborVazifaJavobi(vazifaId, { javob_matn, javob_fayl });
    if (res && res.ok) {
      await loadVazifalarim();
    } else {
      alert(res?.error || 'Yuborishda xatolik yuz berdi');
    }
  } catch (e) {
    alert('Yuborishda xatolik yuz berdi');
  }
}
