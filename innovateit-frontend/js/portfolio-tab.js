// ═══════════════════════════════════════════════════
//  Portfolio Tab + Modal — index.html uchun
// ═══════════════════════════════════════════════════

if (typeof BASE_URL === 'undefined') {
  var BASE_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '')
    ? 'http://127.0.0.1:3001' : '';
}

function esc2(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Portfolio modal HTML ni bir marta inject qilish
function injectPortfolioModal() {
  if (document.getElementById('oq-portfolio-modal')) return;
  const html = `
<div id="oq-portfolio-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;" onclick="oqClosePModal(event)">
  <div style="background:#fff;border-radius:18px;width:100%;max-width:780px;max-height:90vh;overflow-y:auto;padding:32px;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.25);" onclick="event.stopPropagation()">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:24px;">
      <div style="position:relative;flex-shrink:0;cursor:pointer;" onclick="document.getElementById('oq-pm-avatar-input').click()" title="Profil rasmi yuklash">
        <div id="oq-pm-avatar" style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#6c63ff,#4ecdc4);display:flex;align-items:center;justify-content:center;font-size:26px;color:#fff;font-weight:700;overflow:hidden;">T</div>
        <div style="position:absolute;bottom:0;right:0;width:22px;height:22px;background:#6c63ff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid #fff;">📷</div>
        <input type="file" id="oq-pm-avatar-input" accept=".jpg,.jpeg,.png,.gif,.webp" style="display:none;" onchange="oqUploadAvatar()">
      </div>
      <div>
        <div id="oq-pm-name" style="font-size:18px;font-weight:700;color:#111827;">O'qituvchi</div>
        <div id="oq-pm-fan" style="font-size:13px;color:#6b7280;margin-top:2px;">Fan</div>
      </div>
      <button onclick="oqClosePModal()" style="margin-left:auto;background:none;border:none;font-size:24px;cursor:pointer;color:#9ca3af;padding:4px;">✕</button>
    </div>
    <input type="hidden" id="oq-pm-teacher-id">
    <div style="display:grid;gap:16px;">
      <div>
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px;">F.I.SH. (To'liq ism)</label>
        <input id="oq-pm-fish" type="text" placeholder="Toshmatov Jasur Aliyevich" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;outline:none;" onfocus="this.style.borderColor='#6c63ff'" onblur="this.style.borderColor='#e5e7eb'">
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px;">O'qigan yoki bitirgan universiteti</label>
        <input id="oq-pm-univ" type="text" placeholder="Toshkent Davlat Pedagogika Universiteti" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;outline:none;" onfocus="this.style.borderColor='#6c63ff'" onblur="this.style.borderColor='#e5e7eb'">
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px;">Olgan sertifikatlari va yutuqlari</label>
        <textarea id="oq-pm-sert" rows="3" placeholder="IELTS 7.0, Cambridge B2..." style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;outline:none;resize:vertical;font-family:inherit;" onfocus="this.style.borderColor='#6c63ff'" onblur="this.style.borderColor='#e5e7eb'"></textarea>
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px;">Ish joylari va Ish tajribasi</label>
        <textarea id="oq-pm-tajriba" rows="3" placeholder="2018-2020: 45-maktab&#10;2020-hozir: InnovateIT School" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;outline:none;resize:vertical;font-family:inherit;" onfocus="this.style.borderColor='#6c63ff'" onblur="this.style.borderColor='#e5e7eb'"></textarea>
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px;">🔢 Ko'rsatish tartibi <span style="font-weight:400;color:#9ca3af;font-size:11px;">(Portfolio viewerda nechanchi bo'lib chiqishi)</span></label>
        <input id="oq-pm-order" type="number" min="1" max="99" placeholder="1" style="width:90px;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:15px;font-weight:700;color:#6c63ff;outline:none;text-align:center;" onfocus="this.style.borderColor='#6c63ff'" onblur="this.style.borderColor='#e5e7eb'">
      </div>
      <div>
        <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:10px;">Sertifikat rasmlari <span id="oq-pm-sert-count" style="font-weight:400;color:#6b7280;margin-left:6px;">(0/10)</span></div>
        <div id="oq-pm-sert-gallery" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:12px;"></div>
        <label id="oq-pm-upload-label" style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;background:#f3f4f6;border:2px dashed #d1d5db;border-radius:10px;cursor:pointer;font-size:13px;color:#374151;font-weight:500;">
          📎 Fayl qo'shish (PDF, JPG, PNG)
          <input type="file" id="oq-pm-sert-file" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf" style="display:none;" onchange="oqUploadSert()">
        </label>
        <div style="font-size:11px;color:#9ca3af;margin-top:6px;">Maksimal 10 ta fayl</div>
      </div>
    </div>
    <div style="display:flex;gap:12px;margin-top:24px;padding-top:20px;border-top:1px solid #f3f4f6;">
      <button onclick="oqSavePortfolio()" style="flex:1;padding:12px;background:linear-gradient(135deg,#6c63ff,#574fd6);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;">💾 Saqlash</button>
      <button onclick="oqClosePModal()" style="padding:12px 20px;background:#f3f4f6;color:#374151;border:none;border-radius:10px;font-size:15px;cursor:pointer;">Bekor</button>
    </div>
  </div>
</div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

let OQ_PT_DATA      = [];   // o'qituvchilar portfolio
let OQ_PM_SERTS     = [];   // hozirgi modal sertifikatlari
let OQ_VT_DATA      = [];   // viewer <-> teacher biriktirish
let OQ_VIEWERS_DATA = [];   // viewer ro'yxati
let OQ_VT2_VIEWER   = null; // hozirgi VT2 modal uchun viewer
let OQ_VT2_ASSIGNED = [];   // biriktirilgan teacher IDlar
let OQ_CURRENT_TAB  = 'teachers';

// ─── Tab sozlamalari (init da chaqiriladi) ───
function initPortfolioTab() {
  // Superadmin bo'lsa doim tab ko'rinadi
  if (!U.isSuper) {
    // Oddiy admin — tab yo'q, sticky bar topbar ostida
    const stickyBar = g('oq-pt-sticky-bar');
    if (stickyBar) stickyBar.style.top = '52px';
    // table-header ham faqat topbar balandligida sticky
    const tableHeader = document.querySelector('.table-header');
    if (tableHeader) tableHeader.style.top = '52px';
    return;
  }

  const tabRow = g('oq-tab-row');
  if (tabRow) tabRow.style.display = 'block';

  // table-header: topbar(52) + tab-row(~44) = 96px
  const tableHeader = document.querySelector('.table-header');
  if (tableHeader) tableHeader.style.top = '96px';

  // Sticky bar uchun top qiymat
  const stickyBar = g('oq-pt-sticky-bar');
  if (stickyBar) {
    const tabRowH = tabRow ? tabRow.offsetHeight || 44 : 0;
    stickyBar.style.top = (52 + tabRowH) + 'px';
  }

  // Viewer kartasidan kelgan bo'lsa — Portfolio tabiga o'tish
  if (U.fromPortfolio) {
    switchOqTab('portfolio');
  }
}

// ─── Tab almashtirish ───
function switchOqTab(tab) {
  OQ_CURRENT_TAB = tab;
  const isTeachers = tab === 'teachers';

  // Tugmalar holati
  const btnT = g('tab-btn-teachers');
  const btnP = g('tab-btn-portfolio');
  if (btnT) {
    btnT.style.color       = isTeachers ? '#6c63ff' : '#9ca3af';
    btnT.style.borderBottom = isTeachers ? '3px solid #6c63ff' : '3px solid transparent';
  }
  if (btnP) {
    btnP.style.color       = !isTeachers ? '#6c63ff' : '#9ca3af';
    btnP.style.borderBottom = !isTeachers ? '3px solid #6c63ff' : '3px solid transparent';
  }

  // Kontent ko'rsatish/yashirish
  const teacherContent = g('oq-teachers-table');
  const superAddBar    = g('super-add-bar');
  const addForm        = g('add-form');
  const portfolioContent = g('oq-tab-portfolio-content');

  if (teacherContent)   teacherContent.style.display   = isTeachers ? '' : 'none';
  if (superAddBar)      superAddBar.style.display      = isTeachers ? 'block' : 'none';
  if (addForm)          addForm.style.display          = isTeachers ? '' : 'none';
  if (portfolioContent) portfolioContent.style.display = isTeachers ? 'none' : 'block';

  if (!isTeachers) {
    // Sticky bar top qiymatini dinamik hisoblash
    const tabRow  = g('oq-tab-row');
    const stickyBar = g('oq-pt-sticky-bar');
    if (stickyBar) {
      const tabRowH = (tabRow && tabRow.offsetHeight) ? tabRow.offsetHeight : 0;
      stickyBar.style.top = (52 + tabRowH) + 'px';
    }
    loadOqPortfolio();
  }
}

// ─── Portfolio yuklanmasi ───
async function loadOqPortfolio() {
  const listEl = g('oq-pt-list');
  if (!listEl) return;
  listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;">⏳ Yuklanmoqda…</div>';

  try {
    const [tr, vr] = await Promise.all([
      api.getPortfolioTeachers({}),
      api.getPortfolioViewers({ username: U.username, parol: U.parol })
    ]);
    OQ_PT_DATA = tr.ok ? tr.teachers : [];
    OQ_VIEWERS_DATA = vr.ok ? vr.viewers : [];
    renderOqViewers();
    renderOqPortfolio();
  } catch {
    listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">❌ Yuklanmadi</div>';
  }
}

// ─── Portfolio render ───
function renderOqPortfolio() {
  const el = g('oq-pt-list');
  if (!el) return;
  if (OQ_PT_DATA.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:60px;color:#9ca3af;font-size:15px;">👨‍🏫 O\'qituvchilar yo\'q</div>';
    return;
  }

  const colors = ['#6c63ff','#4ecdc4','#f59e0b','#ef4444','#10b981','#3b82f6'];
  const BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '')
    ? 'http://localhost:3001' : 'https://innovateitschool.uz';
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;">
      ${OQ_PT_DATA.map(t => {
        const initials = ((t.ism||'')[0]||'T').toUpperCase();
        const hasProfil = !!(t.fish || t.universitet || t.sertifikatlar || t.ish_tajribasi);
        const sertSoni  = parseInt(t.sert_soni) || 0;
        const clr = colors[t.id % colors.length];
        const avatarHtml = t.avatar
          ? `<img src="${BASE}/uploads/${encodeURIComponent(t.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
          : initials;
        const avatarBg = t.avatar ? 'none' : clr;
        return `
        <div style="border:1.5px solid #e5e7eb;border-radius:14px;padding:16px;background:#fff;transition:box-shadow .2s;" onmouseover="this.style.boxShadow='0 4px 20px rgba(0,0,0,.08)'" onmouseout="this.style.boxShadow='none'">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
            <div style="width:44px;height:44px;border-radius:50%;background:${avatarBg};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;flex-shrink:0;overflow:hidden;">${avatarHtml}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:14px;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc2(t.familiya)} ${esc2(t.ism)}</div>
              <div style="font-size:12px;color:#6b7280;">${esc2(t.fan||'Fan ko\'rsatilmagan')}</div>
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
          <button onclick="oqOpenPortfolioModal(${t.id})"
                  style="width:100%;padding:9px;background:#6c63ff;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;transition:background .2s;"
                  onmouseover="this.style.background='#574fd6'" onmouseout="this.style.background='#6c63ff'">
            ✏️ Portfolio tahrirlash
          </button>
        </div>`;
      }).join('')}
    </div>`;
}

// ─── Portfolio Modal ochish ───
async function oqOpenPortfolioModal(teacherId) {
  injectPortfolioModal();
  const modal = g('oq-portfolio-modal');
  if (!modal) return;

  // Reset
  g('oq-pm-teacher-id').value = teacherId;
  g('oq-pm-fish').value    = '';
  g('oq-pm-univ').value    = '';
  g('oq-pm-sert').value    = '';
  g('oq-pm-tajriba').value = '';
  g('oq-pm-sert-gallery').innerHTML = '';
  OQ_PM_SERTS = [];
  oqUpdateSertCount(0);
  modal.style.display = 'flex';

  const r = await api.getPortfolioTeacher({ username: U.username, parol: U.parol }, teacherId);
  if (!r.ok) { toast('❌ ' + r.error, 'error'); return; }

  const t = r.teacher;
  const p = r.portfolio;
  const colors = ['#6c63ff','#4ecdc4','#f59e0b','#ef4444','#10b981','#3b82f6'];

  // Avatar — rasm bo'lsa ko'rsat, bo'lmasa harf
  const avatarEl = g('oq-pm-avatar');
  if (p?.avatar) {
    avatarEl.innerHTML = `<img src="${BASE}/uploads/${encodeURIComponent(p.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    avatarEl.style.background = 'none';
    avatarEl.title = 'Rasmni o\'zgartirish uchun bosing';
  } else {
    avatarEl.innerHTML = ((t.ism||'')[0]||'T').toUpperCase();
    avatarEl.style.background = `linear-gradient(135deg,${colors[t.id % colors.length]},#574fd6)`;
    avatarEl.title = 'Profil rasmi yuklash uchun bosing';
  }
  g('oq-pm-name').textContent = `${t.familiya} ${t.ism}`;
  g('oq-pm-fan').textContent  = t.fan || '';

  if (p) {
    g('oq-pm-fish').value    = p.fish          || '';
    g('oq-pm-univ').value    = p.universitet   || '';
    g('oq-pm-sert').value    = p.sertifikatlar || '';
    g('oq-pm-tajriba').value = p.ish_tajribasi || '';
    g('oq-pm-order').value   = p.display_order || '';
  }

  OQ_PM_SERTS = r.sertifikatlar || [];
  oqRenderSertGallery();
}

function oqClosePModal(e) {
  if (!e || e.target === g('oq-portfolio-modal'))
    g('oq-portfolio-modal').style.display = 'none';
}

async function oqSavePortfolio() {
  const id = g('oq-pm-teacher-id').value;
  const orderVal = g('oq-pm-order').value.trim();
  const r  = await api.savePortfolioTeacher({
    username:      U.username,
    parol:         U.parol,
    fish:          g('oq-pm-fish').value.trim(),
    universitet:   g('oq-pm-univ').value.trim(),
    sertifikatlar: g('oq-pm-sert').value.trim(),
    ish_tajribasi: g('oq-pm-tajriba').value.trim(),
    display_order: orderVal ? parseInt(orderVal) : null
  }, id);
  if (!r.ok) return toast('❌ ' + r.error, 'error');
  toast('✅ Portfolio saqlandi', 'success');
  oqClosePModal();
  loadOqPortfolio();
}

// ─── FAN TARTIB MODAL ───
let FO_FAN      = '';   // joriy fan nomi
let FO_TEACHERS = [];   // shu fandagi o'qituvchilar

function openFanOrderModal() {
  const teacherId = parseInt(g('oq-pm-teacher-id').value);
  const teacher = OQ_PT_DATA.find(t => t.id === teacherId);
  if (!teacher) return;

  FO_FAN = teacher.fan || '';
  // Shu fandagi barcha o'qituvchilarni filterlash
  FO_TEACHERS = OQ_PT_DATA
    .filter(t => (t.fan || '').toLowerCase().trim() === FO_FAN.toLowerCase().trim())
    .map(t => ({
      id:            t.id,
      ism:           t.ism,
      familiya:      t.familiya,
      display_order: t.display_order || null
    }))
    .sort((a, b) => {
      const oa = a.display_order || 9999;
      const ob = b.display_order || 9999;
      if (oa !== ob) return oa - ob;
      return (a.familiya||'').localeCompare(b.familiya||'', 'uz');
    });

  const title = g('fo-title');
  if (title) title.textContent = `📋 "${FO_FAN}" o'qituvchilari tartibi`;

  renderFanOrderList();
  g('fan-order-modal').style.display = 'flex';
}

function renderFanOrderList() {
  const el = g('fo-list');
  if (!el) return;
  const colors = ['#6c63ff','#4ecdc4','#f59e0b','#ef4444','#10b981','#3b82f6'];

  el.innerHTML = FO_TEACHERS.map((t, i) => {
    const clr = colors[t.id % colors.length];
    const initials = ((t.ism||'')[0]||'T').toUpperCase();
    const isCurrentUser = parseInt(g('oq-pm-teacher-id').value) === t.id;
    return `
      <div data-teacher-id="${t.id}" draggable="true"
        ondragstart="foDragStart(event,${i})"
        ondragover="foDragOver(event)"
        ondrop="foDrop(event,${i})"
        ondragend="foDragEnd(event)"
        style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1.5px solid ${isCurrentUser?'#c4b5fd':'#e5e7eb'};border-radius:11px;background:${isCurrentUser?'#faf5ff':'#fff'};cursor:grab;transition:all .15s;user-select:none;">
        <div style="font-size:18px;color:#9ca3af;cursor:grab;flex-shrink:0;">⠿</div>
        <div style="width:36px;height:36px;border-radius:50%;background:${clr};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;flex-shrink:0;">${initials}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:13px;color:#111827;">${esc2(t.familiya)} ${esc2(t.ism)} ${isCurrentUser ? '<span style="font-size:10px;background:#ede9fe;color:#6c63ff;padding:2px 7px;border-radius:20px;font-weight:700;">Hozirgi</span>' : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <span style="font-size:11px;color:#9ca3af;">№</span>
          <input type="number" min="1" max="99" value="${t.display_order||''}" placeholder="—"
            data-tid="${t.id}"
            oninput="foUpdateOrder(${t.id},this.value)"
            style="width:52px;padding:6px 8px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;font-weight:700;color:#6c63ff;text-align:center;outline:none;"
            onfocus="this.style.borderColor='#6c63ff'" onblur="this.style.borderColor='#e5e7eb'">
        </div>
      </div>`;
  }).join('');

  addFoDragListeners();
}

// Tartibni yangilash (raqam kiritilganda)
function foUpdateOrder(teacherId, val) {
  const t = FO_TEACHERS.find(x => x.id === teacherId);
  if (t) t.display_order = val ? parseInt(val) : null;
}

// Drag & Drop
let foDragIdx = null;

function addFoDragListeners() {
  // already set via inline attributes
}

function foDragStart(e, idx) {
  foDragIdx = idx;
  e.currentTarget.style.opacity = '0.5';
  e.dataTransfer.effectAllowed = 'move';
}

function foDragEnd(e) {
  e.currentTarget.style.opacity = '1';
  foDragIdx = null;
}

function foDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.style.background = '#f0eeff';
}

function foDrop(e, toIdx) {
  e.preventDefault();
  e.currentTarget.style.background = '';
  if (foDragIdx === null || foDragIdx === toIdx) return;

  // Massivda qayta tartiblaymiz
  const moved = FO_TEACHERS.splice(foDragIdx, 1)[0];
  FO_TEACHERS.splice(toIdx, 0, moved);

  // display_order ni yangi tartib asosida yangilaymiz
  FO_TEACHERS.forEach((t, i) => { t.display_order = i + 1; });

  renderFanOrderList();
}

async function saveFanOrder() {
  // Har bir o'qituvchining display_order ini saqlaymiz
  let errors = 0;
  for (const t of FO_TEACHERS) {
    // Avval o'sha o'qituvchining to'liq portfolio ma'lumotini olamiz
    const rGet = await api.getPortfolioTeacher({ username: U.username, parol: U.parol }, t.id);
    const p = rGet.ok ? (rGet.portfolio || {}) : {};

    const rSave = await api.savePortfolioTeacher({
      username:      U.username,
      parol:         U.parol,
      fish:          p.fish          || '',
      universitet:   p.universitet   || '',
      sertifikatlar: p.sertifikatlar || '',
      ish_tajribasi: p.ish_tajribasi || '',
      display_order: t.display_order || null
    }, t.id);
    if (!rSave.ok) errors++;
  }

  if (errors > 0) {
    toast(`❌ ${errors} ta saqlashda xato`, 'error');
  } else {
    toast('✅ Tartib saqlandi!', 'success');
    // Joriy modal dagi tartib maydonini ham yangilaymiz
    const curId = parseInt(g('oq-pm-teacher-id').value);
    const cur = FO_TEACHERS.find(t => t.id === curId);
    if (cur && g('oq-pm-order')) g('oq-pm-order').value = cur.display_order || '';
    await loadOqPortfolio();
    closeFanOrderModal();
  }
}

function closeFanOrderModal() {
  g('fan-order-modal').style.display = 'none';
}

// ─── Sertifikat gallery ───
function oqRenderSertGallery() {
  const el = g('oq-pm-sert-gallery');
  if (!el) return;
  oqUpdateSertCount(OQ_PM_SERTS.length);
  if (OQ_PM_SERTS.length === 0) { el.innerHTML = ''; return; }

  const BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '')
    ? 'http://127.0.0.1:3001' : '';

  el.innerHTML = OQ_PM_SERTS.map(s => {
    const url   = `${BASE}/uploads/${encodeURIComponent(s.fayl_nomi)}`;
    const isPdf = s.fayl_nomi.endsWith('.pdf');
    const thumb = isPdf
      ? `<div style="height:80px;display:flex;align-items:center;justify-content:center;font-size:32px;background:#fee2e2;border-radius:8px;">📄</div>`
      : `<img src="${url}" alt="${esc2(s.asl_nomi)}" style="width:100%;height:80px;object-fit:cover;border-radius:8px;" onerror="this.parentElement.innerHTML='<div style=\\'height:80px;display:flex;align-items:center;justify-content:center;font-size:28px;background:#f3f4f6;border-radius:8px;\\'>🖼️</div>'">`;
    return `
      <div style="position:relative;border:1.5px solid #e5e7eb;border-radius:10px;padding:8px;text-align:center;">
        ${thumb}
        <div style="font-size:10px;color:#6b7280;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc2(s.asl_nomi)}">${esc2(s.asl_nomi||s.fayl_nomi)}</div>
        <div style="font-size:10px;color:#9ca3af;">${esc2(s.yuklangan||'')}</div>
        <button onclick="oqDeleteSert('${esc(s.fayl_nomi)}')"
                style="position:absolute;top:4px;right:4px;background:#ef4444;color:#fff;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>`;
  }).join('');
}

function oqUpdateSertCount(n) {
  const el  = g('oq-pm-sert-count');
  const lbl = g('oq-pm-upload-label');
  const inp = g('oq-pm-sert-file');
  if (el)  { el.textContent = `(${n}/10)`; el.style.color = n >= 10 ? '#ef4444' : '#6b7280'; }
  if (lbl) lbl.style.opacity = n >= 10 ? '.4' : '1';
  if (inp) inp.disabled = n >= 10;
}

let OQ_UPLOADING = false;
async function oqUploadSert() {
  if (OQ_UPLOADING) return;
  if (OQ_PM_SERTS.length >= 10) return toast('❗ Maksimal 10 ta sertifikat', 'error');
  const fileInput = g('oq-pm-sert-file');
  const file = fileInput?.files?.[0];
  if (!file) return;
  OQ_UPLOADING = true;

  const id = g('oq-pm-teacher-id').value;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('username', U.username);
  fd.append('parol', U.parol);

  fileInput.value = '';
  toast('⏳ Yuklanmoqda...');

  const r = await api.uploadSertifikat(id, fd);
  if (!r.ok) { OQ_UPLOADING = false; return toast('❌ ' + r.error, 'error'); }

  OQ_PM_SERTS.push({ fayl_nomi: r.filename, asl_nomi: r.asl_nomi, yuklangan: new Date().toLocaleDateString('ru-RU') });
  oqRenderSertGallery();
  toast('✅ Sertifikat yuklandi', 'success');
  OQ_UPLOADING = false;
}

async function oqDeleteSert(filename) {
  if (!confirm('Bu sertifikatni o\'chirmoqchimisiz?')) return;
  const id = g('oq-pm-teacher-id').value;
  const r  = await api.deleteSertifikat({ username: U.username, parol: U.parol }, id, filename);
  if (!r.ok) return toast('❌ ' + r.error, 'error');
  OQ_PM_SERTS = OQ_PM_SERTS.filter(s => s.fayl_nomi !== filename);
  oqRenderSertGallery();
  toast('✅ Sertifikat o\'chirildi');
  // loadOqPortfolio() chaqirilmaydi — modal yopilmaydi
}

// ─── Avatar yuklash ───
async function oqUploadAvatar() {
  const fileInput = g('oq-pm-avatar-input');
  const file = fileInput?.files?.[0];
  if (!file) return;

  const id = g('oq-pm-teacher-id').value;
  const fd = new FormData();
  fd.append('avatar', file);
  fd.append('username', U.username);
  fd.append('parol', U.parol);

  fileInput.value = '';
  toast('⏳ Rasm yuklanmoqda...');

  const r = await api.uploadAvatar(id, fd);
  if (!r.ok) return toast('❌ ' + r.error, 'error');

  // Avatarni darhol ko'rsatish
  const BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '')
    ? 'http://localhost:3001' : 'https://innovateitschool.uz';

  const avatarEl = g('oq-pm-avatar');
  avatarEl.innerHTML = `<img src="${BASE}/uploads/${encodeURIComponent(r.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  avatarEl.style.background = 'none';
  avatarEl.title = 'Rasmni o\'zgartirish uchun bosing';

  toast('✅ Profil rasmi saqlandi', 'success');
  // loadOqPortfolio() chaqirilmaydi — modal yopilmaydi
}

// ─── VT Modal (Viewer uchun o'qituvchi biriktirish) ───
async function openVTModalFromOq() {
  if (!U.viewerUsername) return;
  const modal = g('oq-vt-modal');
  if (!modal) return;

  const titleEl = g('oq-vt-title');
  if (titleEl) titleEl.textContent = `👨‍🏫 "${U.viewerIsm || U.viewerUsername}" uchun o'qituvchilar`;

  const listEl = g('oq-vt-list');
  listEl.innerHTML = '<div style="text-align:center;padding:24px;color:#9ca3af;">⏳ Yuklanmoqda…</div>';
  modal.style.display = 'flex';

  try {
    const [tr, vtr] = await Promise.all([
      api.getTeachers({ username: U.username, parol: U.parol }),
      api.getViewerTeachers({ username: U.username, parol: U.parol }, U.viewerUsername)
    ]);

    const all     = tr.ok  ? tr.teachers  : [];
    const assigned = new Set((vtr.ok ? vtr.teachers : []).map(t => t.id));

    listEl.innerHTML = all.length === 0
      ? '<div style="text-align:center;padding:24px;color:#9ca3af;">O\'qituvchilar yo\'q</div>'
      : all.map(t => {
          const checked = assigned.has(t.id);
          const colors  = ['#6c63ff','#4ecdc4','#f59e0b','#ef4444','#10b981','#3b82f6'];
          const clr = colors[t.id % colors.length];
          return `
            <label style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1.5px solid ${checked?'#c4b5fd':'#e5e7eb'};border-radius:10px;cursor:pointer;background:${checked?'#faf5ff':'#fff'};transition:all .2s;">
              <input type="checkbox" ${checked?'checked':''} onchange="oqVtToggle(${t.id},this.checked)"
                     style="width:16px;height:16px;accent-color:#6c63ff;flex-shrink:0;">
              <div style="width:34px;height:34px;border-radius:50%;background:${clr};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;flex-shrink:0;">${((t.ism||'')[0]||'T').toUpperCase()}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:13px;color:#111827;">${esc2(t.familiya)} ${esc2(t.ism)}</div>
                <div style="font-size:12px;color:#6b7280;">${esc2(t.fan||'')}</div>
              </div>
            </label>`;
        }).join('');
  } catch {
    listEl.innerHTML = '<div style="text-align:center;color:#ef4444;padding:24px;">❌ Yuklanmadi</div>';
  }
}

async function oqVtToggle(teacherId, assign) {
  const r = assign
    ? await api.assignViewerTeacher({ username: U.username, parol: U.parol, viewerUsername: U.viewerUsername, teacherId })
    : await api.unassignViewerTeacher({ username: U.username, parol: U.parol, viewerUsername: U.viewerUsername, teacherId });
  if (!r.ok) toast('❌ ' + r.error, 'error');
}

function oqCloseVTModal(e) {
  if (!e || e.target === g('oq-vt-modal'))
    g('oq-vt-modal').style.display = 'none';
}

// ─── goBack override ─── Portfolio tabidan kelgan bo'lsa index.html#portfolio


// Global expose
window.clearSearch         = clearSearch;
window.toggleClearBtn      = toggleClearBtn;
window.switchOqTab         = switchOqTab;
window.oqOpenPortfolioModal = oqOpenPortfolioModal;
window.oqClosePModal       = oqClosePModal;
window.oqSavePortfolio     = oqSavePortfolio;
window.oqUploadSert        = oqUploadSert;
window.oqDeleteSert        = oqDeleteSert;
window.openVTModalFromOq   = openVTModalFromOq;
window.oqVtToggle          = oqVtToggle;
window.oqCloseVTModal      = oqCloseVTModal;
// ═══════════════════════════════════════════════════
//  VIEWER BOSHQARUV (Portfolio tabida)
// ═══════════════════════════════════════════════════

function oqToggleViewerForm() {
  const el = g('oq-viewer-form');
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
  if (el.style.display === 'block') g('oq-pv-ism')?.focus();
}

function oqTogglePw(id) {
  const inp = g(id);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ─── Viewer yaratish ───
async function oqCreateViewer() {
  const ism      = g('oq-pv-ism')?.value?.trim();
  const username = g('oq-pv-username')?.value?.trim();
  const parol    = g('oq-pv-parol')?.value?.trim();
  const errEl    = g('oq-pv-err');

  if (!ism || !username || !parol) {
    if (errEl) { errEl.textContent = '❌ Barcha maydonlar majburiy'; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';

  const r = await api.createPortfolioViewer({ username: U.username, parol: U.parol, newIsm: ism, newUsername: username, newParol: parol });
  if (!r.ok) {
    if (errEl) { errEl.textContent = '❌ ' + r.error; errEl.style.display = 'block'; }
    return;
  }
  toast('✅ Viewer yaratildi', 'success');
  g('oq-pv-ism').value = '';
  g('oq-pv-username').value = '';
  g('oq-pv-parol').value = '';
  g('oq-viewer-form').style.display = 'none';
  await loadOqPortfolio();
}

// ─── Viewer ro'yxatini render qilish ───
function renderOqViewers() {
  const el = g('oq-viewers-list');
  if (!el) return;

  if (OQ_VIEWERS_DATA.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:#9ca3af;font-size:13px;">👁️ Viewer yo\'q. Yuqoridagi "Yangi viewer" tugmasini bosing.</div>';
    return;
  }

  const colors = ['#6c63ff','#4ecdc4','#f59e0b','#ef4444','#10b981','#3b82f6'];
  el.innerHTML = OQ_VIEWERS_DATA.map((v, i) => {
    const initials = (v.ism||'V')[0].toUpperCase();
    const clr = colors[i % colors.length];
    return `
    <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border:1.5px solid #e5e7eb;border-radius:12px;background:#fff;margin-bottom:10px;">
      <div style="width:40px;height:40px;border-radius:50%;background:${clr};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;flex-shrink:0;">${initials}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:14px;color:#111827;">${esc2(v.ism)}</div>
        <div style="font-size:12px;color:#9ca3af;">@${esc2(v.username)} · ${esc2(v.yaratilgan||'')}</div>
      </div>
      <button onclick="oqOpenVT2Modal('${esc(v.username)}','${esc(v.ism)}')"
        style="padding:7px 14px;background:#ede9fe;border:1.5px solid #c4b5fd;border-radius:8px;font-size:12px;cursor:pointer;color:#5b21b6;font-weight:600;white-space:nowrap;">
        👨‍🏫 O\'qituvchilar
      </button>
      <button onclick="oqOpenPVEdit('${esc(v.username)}','${esc(v.ism)}')"
        style="padding:7px 14px;background:#f3f4f6;border:none;border-radius:8px;font-size:12px;cursor:pointer;color:#374151;font-weight:500;">
        ✏️ Tahrirlash
      </button>
      <button onclick="oqDeleteViewer('${esc(v.username)}','${esc(v.ism)}')"
        style="padding:7px 14px;background:#fff0f0;border:1.5px solid #fca5a5;border-radius:8px;font-size:12px;cursor:pointer;color:#ef4444;font-weight:500;">
        O\'chirish
      </button>
    </div>`;
  }).join('');
}

// ─── Viewer o'chirish ───
async function oqDeleteViewer(username, ism) {
  if (!confirm(`"${ism}" viewerni o'chirmoqchimisiz?`)) return;
  const r = await api.deletePortfolioViewer({ username: U.username, parol: U.parol, deleteUsername: username });
  if (!r.ok) return toast('❌ ' + r.error, 'error');
  toast('✅ Viewer o\'chirildi');
  await loadOqPortfolio();
}

// ─── Viewer tahrirlash ───
function oqOpenPVEdit(username, ism) {
  const modal = g('oq-pv-edit-modal');
  if (!modal) {
    toast('❌ Edit modal topilmadi. oqituvchilar.html ni yangilang!', 'error');
    return;
  }
  const oldU = g('oq-pve-old-username');
  const ismEl = g('oq-pve-ism');
  const unEl  = g('oq-pve-username');
  const parEl = g('oq-pve-parol');
  if (oldU)  oldU.value  = username;
  if (ismEl) ismEl.value = ism;
  if (unEl)  unEl.value  = username;
  if (parEl) parEl.value = '';
  modal.style.display = 'flex';
  if (ismEl) setTimeout(() => ismEl.focus(), 100);
}

function oqClosePVEditModal(e) {
  if (!e || e.target === g('oq-pv-edit-modal'))
    g('oq-pv-edit-modal').style.display = 'none';
}

async function oqSaveViewerEdit() {
  const oldUsername = g('oq-pve-old-username').value;
  const newIsm      = g('oq-pve-ism').value.trim();
  const newUsername = g('oq-pve-username').value.trim();
  const newParol    = g('oq-pve-parol').value.trim();

  if (!newIsm || !newUsername) return toast('❌ Ism va username majburiy', 'error');

  const r = await api.editPortfolioViewer({
    username: U.username, parol: U.parol,
    oldUsername, newIsm, newUsername, newParol: newParol || undefined
  });
  if (!r.ok) return toast('❌ ' + r.error, 'error');
  toast('✅ Saqlandi', 'success');
  g('oq-pv-edit-modal').style.display = 'none';
  await loadOqPortfolio();
}

// ─── VT2 Modal: viewer uchun o'qituvchi biriktirish ───
async function oqOpenVT2Modal(viewerUsername, viewerIsm) {
  OQ_VT2_VIEWER   = { username: viewerUsername, ism: viewerIsm };
  OQ_VT2_ASSIGNED = [];

  const modal = g('oq-vt2-modal2');
  if (!modal) return;

  const titleEl  = g('oq-vt2-title');
  const searchEl = g('oq-vt2-search');
  const listEl   = g('oq-vt2-list');

  if (titleEl)  titleEl.textContent = `👨‍🏫 "${viewerIsm}" uchun o'qituvchilar`;
  if (searchEl) searchEl.value = '';
  if (listEl)   listEl.innerHTML = '<div style="text-align:center;padding:24px;color:#9ca3af;font-size:13px;">⏳ Yuklanmoqda…</div>';

  modal.style.display = 'flex';

  try {
    // Har doim yangi yuklaymiz
    const [tr, vtr] = await Promise.all([
      api.getPortfolioTeachers({}),
      api.getViewerTeachers({}, viewerUsername)
    ]);

    if (!tr.ok) {
      if (listEl) listEl.innerHTML = `<div style="text-align:center;color:#ef4444;padding:24px;font-size:13px;">❌ ${tr.error || 'O\'qituvchilar yuklanmadi'}</div>`;
      return;
    }

    // OQ_PT_DATA ni yangilaymiz (render uchun)
    OQ_PT_DATA      = tr.teachers || [];
    OQ_VT2_ASSIGNED = (vtr.ok && vtr.teacher_ids) ? vtr.teacher_ids.map(Number) : [];
    oqRenderVT2List();

  } catch (err) {
    if (listEl) listEl.innerHTML = '<div style="text-align:center;color:#ef4444;padding:24px;font-size:13px;">❌ Server bilan aloqa yo\'q</div>';
  }
}

function oqRenderVT2List() {
  const el = g('oq-vt2-list');
  if (!el) return;
  const q = (g('oq-vt2-search')?.value || '').toLowerCase();
  const all = OQ_PT_DATA;

  const filtered = q
    ? all.filter(t => (t.ism+' '+t.familiya+' '+(t.fan||'')).toLowerCase().includes(q))
    : all;

  if (filtered.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:#9ca3af;">O\'qituvchi topilmadi</div>';
    return;
  }

  const colors = ['#6c63ff','#4ecdc4','#f59e0b','#ef4444','#10b981','#3b82f6'];
  el.innerHTML = filtered.map(t => {
    const assigned  = OQ_VT2_ASSIGNED.includes(Number(t.id));
    const clr       = colors[t.id % colors.length];
    const initials  = ((t.ism||'')[0]||'T').toUpperCase();
    const hasProfil = !!(t.fish || t.universitet || t.sertifikatlar || t.ish_tajribasi);
    const sertSoni  = parseInt(t.sert_soni) || 0;
    return `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1.5px solid ${assigned?'#a5b4fc':'#e5e7eb'};border-radius:10px;background:${assigned?'#f5f3ff':'#fff'};margin-bottom:8px;transition:all .2s;">
      <div style="width:38px;height:38px;border-radius:50%;background:${clr};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px;flex-shrink:0;">${initials}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:13px;color:#111827;">${esc2(t.familiya)} ${esc2(t.ism)}</div>
        <div style="font-size:11px;color:#6b7280;margin-bottom:3px;">${esc2(t.fan||'Fan ko\'rsatilmagan')}</div>
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
        ? `<span style="font-size:11px;color:#5b21b6;background:#ede9fe;padding:3px 9px;border-radius:20px;font-weight:600;white-space:nowrap;">✅ Biriktirilgan</span>
           <button onclick="oqVt2Toggle(${t.id},false)"
             style="padding:7px 13px;background:#fff0f0;border:1.5px solid #fca5a5;border-radius:8px;font-size:12px;cursor:pointer;color:#ef4444;font-weight:600;white-space:nowrap;">
             Ajratish
           </button>`
        : `<button onclick="oqVt2Toggle(${t.id},true)"
             style="padding:7px 13px;background:#ede9fe;border:1.5px solid #c4b5fd;border-radius:8px;font-size:12px;cursor:pointer;color:#5b21b6;font-weight:600;white-space:nowrap;">
             + Biriktirish
           </button>`
      }
    </div>`;
  }).join('');
}

async function oqVt2Toggle(teacherId, assign) {
  if (!OQ_VT2_VIEWER) return;
  const id = Number(teacherId);
  const r = assign
    ? await api.assignViewerTeacher({ viewerUsername: OQ_VT2_VIEWER.username, teacherId: id })
    : await api.unassignViewerTeacher({ viewerUsername: OQ_VT2_VIEWER.username, teacherId: id });

  if (!r.ok) return toast('❌ ' + r.error, 'error');
  if (assign) OQ_VT2_ASSIGNED = [...OQ_VT2_ASSIGNED, id];
  else        OQ_VT2_ASSIGNED = OQ_VT2_ASSIGNED.filter(x => x !== id);
  oqRenderVT2List();
  // Portfolio kartalarini yangilash
  loadOqPortfolio();
}

function oqCloseVTModal2(e) {
  if (!e || e.target === g('oq-vt2-modal2'))
    g('oq-vt2-modal2').style.display = 'none';
}

// Global expose — yangi funksiyalar
window.oqToggleViewerForm  = oqToggleViewerForm;
window.oqTogglePw          = oqTogglePw;
window.oqCreateViewer      = oqCreateViewer;
window.oqDeleteViewer      = oqDeleteViewer;
window.oqOpenPVEdit        = oqOpenPVEdit;
window.oqClosePVEditModal  = oqClosePVEditModal;
window.oqSaveViewerEdit    = oqSaveViewerEdit;
window.oqOpenVT2Modal      = oqOpenVT2Modal;
window.oqRenderVT2List     = oqRenderVT2List;
window.oqVt2Toggle         = oqVt2Toggle;
window.oqCloseVTModal2     = oqCloseVTModal2;
// ─── Portfolio qidiruv ───
function oqFilterPortfolio(q) {
  const clearBtn = document.getElementById('oq-pt-search-clear');
  if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';

  const query = q.toLowerCase().trim();
  const el    = document.getElementById('oq-pt-list');
  if (!el) return;

  const filtered = query
    ? OQ_PT_DATA.filter(t =>
        (t.familiya||'').toLowerCase().includes(query) ||
        (t.ism||'').toLowerCase().includes(query) ||
        (t.fan||'').toLowerCase().includes(query) ||
        (t.fish||'').toLowerCase().includes(query)
      )
    : OQ_PT_DATA;

  if (filtered.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:60px;color:#9ca3af;font-size:15px;">🔍 "${q}" bo'yicha hech narsa topilmadi</div>`;
    return;
  }

  // renderOqPortfolio ni filtered data bilan chaqiramiz
  const backup = OQ_PT_DATA;
  OQ_PT_DATA = filtered;
  renderOqPortfolio();
  OQ_PT_DATA = backup;
}

function oqClearPtSearch() {
  const inp = document.getElementById('oq-pt-search');
  if (inp) { inp.value = ''; inp.focus(); }
  oqFilterPortfolio('');
}

window.oqFilterPortfolio = oqFilterPortfolio;