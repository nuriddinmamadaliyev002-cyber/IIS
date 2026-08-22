// ═══════════════════════════════════════════════════
//  InnovateIT School — O'qituvchilar  (oqituvchilar.js)
//  Superadmin: qo'shish + portfolio + edit + delete
//  Oddiy admin: ko'rish + edit + delete (faqat asosiy)
// ═══════════════════════════════════════════════════

let U           = null;
let T           = [];
let eIdx        = null;          // oddiy admin edit index
let SE_ID       = null;          // superadmin edit teacher id
let SE_SERTS    = [];            // superadmin edit modal sertifikatlar
let ADMINS_MAP    = {};
let ADMINS_LIST   = [];
let MAKTABLAR_LIST = [];  // { id, nomi } — maktab biriktirish uchun

const BASE_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '')
  ? 'http://127.0.0.1:3001' : '';

// ─── Ortga qaytganda (bfcache) modallarni yopish ───
window.addEventListener('pageshow', () => {
  ['edit-modal', 'assign-modal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
  });
  // Super modallar faqat superadmin uchun dinamik qo'shiladi,
  // bfcache da bo'lsa ham yopamiz
  const sm = document.getElementById('super-edit-modal');
  if (sm) sm.style.display = 'none';
  const sa = document.getElementById('super-add-modal');
  if (sa) sa.style.display = 'none';
});

// ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const saved = sessionStorage.getItem('iit_teacher_user');
    if (!saved) { window.location.href = 'index.html'; return; }
    U = JSON.parse(saved);
  } catch { window.location.href = 'index.html'; return; }

  const badge = g('admin-badge');
  if (U.isSuper) {
    badge.classList.add('super');
    badge.textContent = '⭐ ' + U.ism;
  } else if (U.isSuperProxy) {
    badge.classList.add('super');
    badge.textContent = '🏫 ' + U.ism;
  } else {
    badge.textContent = U.ism;
  }

  if (U.isSuper) {
    setDisplay('add-form', 'none');
    setDisplay('btn-davomat-teacher', 'none');
    setDisplay('btn-jadval-teacher', 'none');
    setDisplay('super-add-bar', 'block');
    injectSuperModals();
  } else if (U.isSuperProxy) {
    setDisplay('add-form', 'none');
    setDisplay('btn-davomat-teacher', 'none');
    setDisplay('btn-jadval-teacher', 'none');
  } else {
    // Oddiy admin: faqat ro'yxat ko'rinadi
    setDisplay('add-form', 'none');
  }

  setupTel('f-tel',  'f-tel-hint');
  setupTel('f-tel2', 'f-tel2-hint');
  setupTel('e-tel',  'e-tel-hint');
  setupTel('e-tel2', 'e-tel2-hint');
  setupTel('sa-tel', 'sa-tel-hint');
  setupTel('sa-tel2','sa-tel2-hint');
  setupTel('se-tel', 'se-tel-hint');
  setupTel('se-tel2','se-tel2-hint');

  await loadTeachers();
  initPortfolioTab();

  // index.html dan ✏️ yoki ⇄ bosilganda — sessionStorage dan ID olish
  if (U.openEditId) {
    const t = T.find(x => x.id === U.openEditId);
    if (t && typeof openSuperEdit === 'function') openSuperEdit(t.ri ?? T.indexOf(t));
  }
  if (U.openMergeId) {
    const t = T.find(x => x.id === U.openMergeId);
    if (t && typeof openMergeModal === 'function') openMergeModal(t.ri ?? T.indexOf(t));
  }
});

// ─────────────────────────────────────────────
// ─── Qidiruv tozalash ───
function clearSearch() {
  const inp = g('f-search');
  if (inp) { inp.value = ''; inp.focus(); }
  toggleClearBtn();
  applyFilter();
}

function toggleClearBtn() {
  const inp = g('f-search');
  const btn = g('f-search-clear');
  if (!inp || !btn) return;
  btn.style.display = inp.value.length > 0 ? 'block' : 'none';
}

function goBack() { window.location.href = 'index.html'; }
function openDavomat() { sessionStorage.setItem('iit_teacher_dav_user', JSON.stringify(U)); window.location.href = 'oqituvchilar-davomat.html'; }
function openJadval()  { sessionStorage.setItem('iit_jadval_user', JSON.stringify({ ...U, maktabId: U.maktabId || null })); window.location.href = 'dars-jadvali.html'; }

// ─────────────────────────────────────────────
//  YUKLASH
// ─────────────────────────────────────────────
async function loadTeachers() {
  g('loading-ov').style.display = 'flex';

  if (U.isSuper && U.adminsMap) {
    try {
      const list = JSON.parse(U.adminsMap);
      ADMINS_LIST = list;
      list.forEach(a => { ADMINS_MAP[a.username] = a.maktab_nomi || a.ism; });
    } catch(e) {}
  }

  // Maktablar ro'yxatini yuklash (biriktirish uchun select)
  if (U.isSuper && !MAKTABLAR_LIST.length) {
    try {
      const md = await api.getMaktablar({ username: U.username, parol: U.parol });
      if (md.ok) MAKTABLAR_LIST = md.maktablar || [];
    } catch(e) {}
  }

  try {
    const d = await api.getTeachers({ username: U.username, parol: U.parol });
    if (d.ok) {
      T = d.teachers;
      T.forEach((t, i) => t.ri = i);
      applyFilter();
      g('total-count').textContent = T.length + " o'qituvchi";
    } else {
      toast('❌ ' + d.error, 'error');
    }
  } catch { toast("❌ Ma'lumotlar yuklanmadi", 'error'); }

  g('loading-ov').style.display = 'none';
}

// ─────────────────────────────────────────────
//  FILTER VA RENDER
// ─────────────────────────────────────────────
function applyFilter() {
  const q = (g('f-search').value || '').toLowerCase();
  const d = T.filter(t =>
    !q || (t.familiya + ' ' + t.ism + ' ' + (t.fan||'')).toLowerCase().includes(q)
  );
  renderTable(d);
  renderMobile(d);
}

function renderTable(d) {
  const tb      = g('tbl-body');
  const isSuper = U && U.isSuper;
  const isAdmin = !isSuper && !(U && U.isSuperProxy);

  const thAmal   = g('th-amal');
  const thMaktab = g('th-maktab');
  if (isSuper) {
    if (thAmal)   thAmal.style.display   = '';
    if (thMaktab) thMaktab.style.display = '';
  } else {
    if (thAmal)   thAmal.style.display   = 'none';  // Admin faqat ko'radi
    if (thMaktab) thMaktab.style.display = 'none';
  }

  if (!d.length) {
    tb.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">👩‍🏫</div><p>O\'qituvchi topilmadi</p></div></td></tr>';
    return;
  }

  tb.innerHTML = d.map((t, i) => {
    if (isSuper) {
      // Biriktirilgan maktab badge'lari — endi {id, nomi} obyektlar
      const maktablar = (t.maktablar || []).filter(m => m && m.id);
      const maktabBadges = maktablar.map(m => {
        return '<span class="maktab-badge-item">' + esc2(m.nomi)
          + ' <button class="maktab-badge-x" onclick="removeMaktab(' + t.ri + ',' + m.id + ',\'' + esc(m.nomi) + '\')" title="Ajratish">✕</button></span>';
      }).join('');

      const takenIds = new Set(maktablar.map(m => m.id));
      const freeOpts = MAKTABLAR_LIST
        .filter(m => !takenIds.has(m.id))
        .map(m => '<option value="' + m.id + '">' + esc2(m.nomi) + '</option>')
        .join('');
      const hasFree = MAKTABLAR_LIST.some(m => !takenIds.has(m.id));

      const tgLine = t.telegram_id
        ? '<div style="font-size:10.5px;color:#059669;margin-top:2px;">📱 Web panel: bog\'langan</div>'
        : '<div style="font-size:10.5px;color:#9ca3af;margin-top:2px;">📱 Web panelga biriktirilmagan</div>';

      return '<tr>'
        + '<td class="mono">' + (i+1) + '</td>'
        + '<td><strong>' + esc2(t.familiya) + '</strong> ' + esc2(t.ism) + tgLine + '</td>'
        + '<td><span class="fan-badge">' + (t.fan||'—') + '</span></td>'
        + '<td class="td-maktablar">'
          + '<div class="maktab-tags-wrap">' + (maktabBadges || '<span class="maktab-none">Biriktirilmagan</span>') + '</div>'
          + (hasFree
            ? '<div class="maktab-add-wrap">'
                + '<select class="maktab-add-sel" id="maktab-sel-' + t.ri + '">'
                + '<option value="">+ Maktab biriktirish…</option>'
                + freeOpts
                + '</select>'
                + '<button class="btn-maktab-add" onclick="addMaktab(' + t.ri + ')">Biriktirish</button>'
              + '</div>'
            : '')
        + '</td>'
        + '<td class="mono">' + (t.telefon||'—') + '</td>'
        + '<td class="mono">' + (t.telefon2||'—') + '</td>'
        + '<td>'
          + '<div style="display:flex;gap:6px;">'
            + '<button class="btn-action" onclick="openSuperEdit(' + t.id + ')" title="Tahrirlash">✏️</button>'
            + '<button class="btn-action" onclick="openMergeModal(' + t.ri + ')" title="Birlashtirish" style="color:#8b5cf6;">🔀</button>'
            + '<button class="btn-action" onclick="confirmDelSuper(' + t.ri + ')" title="O\'chirish" style="color:#ef4444;">🗑️</button>'
          + '</div>'
        + '</td>'
        + '</tr>';
    }

    // Oddiy admin ko'rinishi: faqat asosiy ma'lumotlar
    return '<tr>'
      + '<td class="mono">' + (i+1) + '</td>'
      + '<td><strong>' + esc2(t.familiya) + '</strong> ' + esc2(t.ism) + '</td>'
      + '<td><span class="fan-badge">' + (t.fan||'—') + '</span></td>'
      + '<td class="mono">' + (t.telefon||'—') + '</td>'
      + '<td class="mono">' + (t.telefon2||'—') + '</td>'
      + ''  // Admin faqat ko'radi — qo'shish/o'chirish superadmin orqali
      + '</tr>';
  }).join('');
}

function renderMobile(d) {
  const el      = g('mob-cards');
  const isSuper = U && U.isSuper;
  const isAdmin = !isSuper && !(U && U.isSuperProxy);

  if (!d.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👩‍🏫</div><p>O\'qituvchi topilmadi</p></div>';
    return;
  }

  el.innerHTML = d.map((t, i) => {
    const maktabText = (t.maktablar||[]).map(m => m.nomi || m).join(', ') || '—';
    return '<div class="tc">'
      + '<div class="tc-head">'
        + '<div>'
          + '<div class="tc-name">' + esc2(t.familiya) + ' ' + esc2(t.ism) + '</div>'
          + '<div class="tc-sub">#' + (i+1) + ' · <span class="fan-badge">' + (t.fan||'—') + '</span></div>'
        + '</div>'
        + (isSuper
          ? '<div class="tc-btns">'
              + '<button class="btn-action" onclick="openSuperEdit(' + t.id + ')">✏️</button>'
              + '<button class="btn-action" onclick="confirmDelSuper(' + t.ri + ')" style="color:#ef4444;">🗑️</button>'
            + '</div>'
          : (isAdmin
            ? '<div class="tc-btns">'
                + '<button class="btn-action" onclick="openEdit(' + t.ri + ')">✏️</button>'
                + '<button class="btn-action" onclick="confirmDel(' + t.ri + ')">🗑️</button>'
              + '</div>'
            : ''))
      + '</div>'
      + '<div class="tc-body">'
        + '<div class="tc-row"><span class="tc-lbl">📞 Telefon</span><span class="tc-val mono">' + (t.telefon||'—') + '</span></div>'
        + (t.telefon2 ? '<div class="tc-row"><span class="tc-lbl">📞 Qo\'sh.</span><span class="tc-val mono">' + t.telefon2 + '</span></div>' : '')
        + (isSuper ? '<div class="tc-row"><span class="tc-lbl">🏫 Maktab(lar)</span><span class="tc-val" style="font-size:12px;">' + esc2(maktabText) + '</span></div>' : '')
      + '</div>'
      + '</div>';
  }).join('');
}

// ─────────────────────────────────────────────
//  SUPERADMIN: MAKTAB BIRIKTIRISH / AJRATISH
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
//  SUPERADMIN: MAKTAB BIRIKTIRISH / AJRATISH
// ─────────────────────────────────────────────
async function addMaktab(ri) {
  const t = T[ri]; if (!t) return;
  const sel = g('maktab-sel-' + ri); if (!sel) return;
  const maktabId = sel.value;
  if (!maktabId) { toast('⚠️ Maktab tanlang', 'error'); return; }
  const maktab = MAKTABLAR_LIST.find(m => m.id == maktabId);
  const maktabNomi = maktab ? maktab.nomi : ('Maktab #' + maktabId);
  try {
    const r = await api.biriktirTeacher({ username: U.username, parol: U.parol, teacherId: t.id, maktabId });
    if (r.ok) {
      toast('✅ ' + maktabNomi + " maktabiga biriktirildi!", 'success');
      await loadTeachers();
    } else toast('❌ ' + r.error, 'error');
  } catch { toast('❌ Xatolik', 'error'); }
}

async function removeMaktab(ri, maktabId, maktabNomi) {
  const t = T[ri]; if (!t) return;
  if (!confirm('"' + t.familiya + ' ' + t.ism + '" o\'qituvchini ' + maktabNomi + ' maktabidan ajratasizmi?')) return;
  try {
    const r = await api.ajratTeacher({ username: U.username, parol: U.parol, teacherId: t.id, maktabId });
    if (r.ok) { toast('✅ ' + maktabNomi + " maktabidan ajratildi", 'success'); await loadTeachers(); }
    else toast('❌ ' + r.error, 'error');
  } catch { toast('❌ Xatolik', 'error'); }
}

// ─────────────────────────────────────────────
//  SUPERADMIN: YANGI O'QITUVCHI QO'SHISH + PORTFOLIO
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
//  SUPERADMIN MODAL HTML INJECT (faqat superadmin uchun)
// ─────────────────────────────────────────────
function injectSuperModals() {
  if (document.getElementById('super-add-modal')) return; // allaqachon bor

  const fanOptions = `
    <option value="">— Tanlang —</option>
    <option value="Matematika">Matematika</option>
    <option value="Ingliz tili">Ingliz tili</option>
    <option value="IT">IT</option>`;

  const addHtml = `
<div class="modal-overlay" id="super-add-modal" style="display:none;" onclick="if(event.target===this)closeSuperAdd()">
  <div class="modal" style="max-width:660px;max-height:90vh;overflow-y:auto;">
    <div class="modal-drag"></div>
    <div class="modal-title">➕ Yangi o'qituvchi qo'shish</div>
    <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">📋 Asosiy ma'lumotlar</div>
    <div class="form-grid" style="margin-bottom:16px;">
      <div class="field-group"><label class="field-label">Familiya *</label><input class="field-input" id="sa-familiya" placeholder="Yusupova" autocomplete="off"></div>
      <div class="field-group"><label class="field-label">Ism *</label><input class="field-input" id="sa-ism" placeholder="Nodira" autocomplete="off"></div>
      <div class="field-group"><label class="field-label">Fan *</label><select class="field-input" id="sa-fan">${fanOptions}</select></div>
      <div class="field-group"><label class="field-label">Telefon *</label><div class="tel-wrap"><input class="field-input tel-input" id="sa-tel" placeholder="+998 __ ___ __ __" maxlength="17" inputmode="tel"><div class="tel-hint" id="sa-tel-hint"></div></div></div>
      <div class="field-group"><label class="field-label">Qo'sh. telefon <span style="font-weight:400;font-size:10px;">(ixtiyoriy)</span></label><div class="tel-wrap"><input class="field-input tel-input" id="sa-tel2" placeholder="+998 __ ___ __ __" maxlength="17" inputmode="tel"><div class="tel-hint" id="sa-tel2-hint"></div></div></div>
    </div>
    <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">📂 Portfolio ma'lumotlari <span style="font-weight:400;text-transform:none;font-size:10px;">(ixtiyoriy)</span></div>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;">
      <div class="field-group"><label class="field-label">F.I.SH. (To'liq ism)</label><input class="field-input" id="sa-fish" placeholder="Yusupova Nodira Karimovna"></div>
      <div class="field-group"><label class="field-label">O'qiyotgan yoki bitirgan universiteti(lari)</label><input class="field-input" id="sa-univ" placeholder="Toshkent Davlat Pedagogika Universiteti"></div>
      <div class="field-group"><label class="field-label">Olgan sertifikatlari (matn)</label><textarea class="field-input" id="sa-sert" rows="3" style="resize:vertical;font-family:inherit;" placeholder="IELTS 7.0, Cambridge B2..."></textarea></div>
      <div class="field-group"><label class="field-label">Ish joylari va Ish tajribasi</label><textarea class="field-input" id="sa-tajriba" rows="3" style="resize:vertical;font-family:inherit;" placeholder="2018-2020: 45-maktab&#10;2020-hozir: InnovateIT School"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn-cancel" onclick="closeSuperAdd()">Bekor</button>
      <button class="btn-submit" id="sa-save-btn" onclick="saveSuperAdd()"><span class="spinner" id="sa-spinner"></span><span id="sa-btn-txt">Saqlash</span></button>
    </div>
  </div>
</div>`;

  const editHtml = `
<div class="modal-overlay" id="super-edit-modal" style="display:none;" onclick="if(event.target===this)closeSuperEdit()">
  <div class="modal" style="max-width:660px;max-height:92vh;overflow-y:auto;">
    <div class="modal-drag"></div>
    <div class="modal-title">✏️ O'qituvchini tahrirlash</div>
    <input type="hidden" id="se-id">
    <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">📋 Asosiy ma'lumotlar</div>
    <div class="form-grid" style="margin-bottom:16px;">
      <div class="field-group"><label class="field-label">Familiya *</label><input class="field-input" id="se-familiya"></div>
      <div class="field-group"><label class="field-label">Ism *</label><input class="field-input" id="se-ism"></div>
      <div class="field-group"><label class="field-label">Fan *</label><select class="field-input" id="se-fan">${fanOptions}</select></div>
      <div class="field-group"><label class="field-label">Telefon *</label><div class="tel-wrap"><input class="field-input tel-input" id="se-tel" maxlength="17" inputmode="tel"><div class="tel-hint" id="se-tel-hint"></div></div></div>
      <div class="field-group"><label class="field-label">Qo'sh. telefon</label><div class="tel-wrap"><input class="field-input tel-input" id="se-tel2" maxlength="17" inputmode="tel"><div class="tel-hint" id="se-tel2-hint"></div></div></div>
    </div>
    <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">📂 Portfolio ma'lumotlari</div>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;">
      <div class="field-group"><label class="field-label">F.I.SH. (To'liq ism)</label><input class="field-input" id="se-fish" placeholder="Yusupova Nodira Karimovna"></div>
      <div class="field-group"><label class="field-label">O'qiyotgan yoki bitirgan universiteti(lari)</label><input class="field-input" id="se-univ" placeholder="Toshkent Davlat Pedagogika Universiteti"></div>
      <div class="field-group"><label class="field-label">Olgan sertifikatlari (matn)</label><textarea class="field-input" id="se-sert" rows="3" style="resize:vertical;font-family:inherit;"></textarea></div>
      <div class="field-group"><label class="field-label">Ish joylari va Ish tajribasi</label><textarea class="field-input" id="se-tajriba" rows="3" style="resize:vertical;font-family:inherit;"></textarea></div>
    </div>
    <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">
      📎 Sertifikat rasmlari <span id="se-sert-count" style="font-weight:400;color:#6b7280;text-transform:none;font-size:11px;margin-left:6px;">(0/10)</span>
    </div>
    <div id="se-sert-gallery" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-bottom:12px;"></div>
    <label id="se-upload-label" style="display:inline-flex;align-items:center;gap:8px;padding:9px 16px;background:#f3f4f6;border:2px dashed #d1d5db;border-radius:10px;cursor:pointer;font-size:13px;color:#374151;font-weight:500;margin-bottom:4px;">
      📎 Fayl qo'shish (PDF, JPG, PNG)
      <input type="file" id="se-sert-file" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf" style="display:none;" onchange="uploadSeSert()">
    </label>
    <div style="font-size:11px;color:#9ca3af;margin-bottom:16px;">Maksimal 10 ta fayl, har biri max 10 MB</div>
    <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">📱 Telegram / Web panel kirishi</div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
      <div id="se-tg-status" style="font-size:12.5px;line-height:1.6;"></div>
      <div class="field-group">
        <label class="field-label">Botga /start yozganlar ro'yxatidan tanlash</label>
        <select class="field-input" id="se-kandidatlar" onchange="if(this.value) setValue('se-tgid', this.value)">
          <option value="">— Yuklanmoqda… —</option>
        </select>
      </div>
      <div class="field-group">
        <label class="field-label">yoki Telegram ID'ni qo'lda kiriting</label>
        <input class="field-input" id="se-tgid" placeholder="masalan: 123456789" inputmode="numeric">
      </div>
      <div style="font-size:11px;color:#9ca3af;">
        O'qituvchi shu Telegram ID orqali botga /start yozib, "O'qituvchi paneli" tugmasidan web panelga avtomatik kiradi. Maydonni bo'sh qoldirib saqlasangiz — biriktirma ajratiladi.
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-cancel" onclick="closeSuperEdit()">Bekor</button>
      <button class="btn-submit" id="se-save-btn" onclick="saveSuperEdit()"><span class="spinner" id="se-spinner"></span><span id="se-btn-txt">Saqlash</span></button>
    </div>
  </div>
</div>`;

  document.body.insertAdjacentHTML('beforeend', addHtml);
  document.body.insertAdjacentHTML('beforeend', editHtml);
  const mergeHtml = `
<div class="modal-overlay" id="merge-modal" style="display:none;" onclick="if(event.target===this)closeMergeModal()">
  <div class="modal" style="max-width:640px;max-height:92vh;overflow-y:auto;">
    <div class="modal-drag"></div>
    <div class="modal-title">🔀 O’qituvchilarni birlashtirish</div>

    <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:#6b21a8;line-height:1.6;">
      ⚠️ Birlashtirilgandan so’ng <strong>o’chirilgan o’qituvchi qayta tiklanmaydi.</strong><br>
      Uning barcha davomatlari, dars jadvali, maktablari va portfoliosi <strong>saqlanadigan o’qituvchiga</strong> o’tkaziladi.
    </div>

    <!-- Ikki o'qituvchi -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div style="padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
        <div style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
          ✅ Saqlanadigan
        </div>
        <div id="mg-keep-name" style="font-size:15px;font-weight:600;color:#111827;"></div>
        <div id="mg-keep-fan"  style="font-size:12px;color:#6b7280;margin-top:2px;"></div>
        <div id="mg-keep-maktab" style="font-size:11px;color:#059669;margin-top:4px;"></div>
      </div>
      <div style="padding:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;">
        <div style="font-size:11px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
          🗑️ O’chiriladigan
        </div>
        <div id="mg-remove-name" style="font-size:15px;font-weight:600;color:#111827;"></div>
        <div id="mg-remove-fan"  style="font-size:12px;color:#6b7280;margin-top:2px;"></div>
        <div id="mg-remove-maktab" style="font-size:11px;color:#ea580c;margin-top:4px;"></div>
      </div>
    </div>

    <!-- Qaysi ma'lumotni saqlash -->
    <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">
      📋 Qaysi ma’lumotni saqlash kerak?
    </div>

    <div style="display:grid;gap:12px;margin-bottom:20px;">
      <!-- Ism -->
      <div>
        <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Ism va familiya</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;" id="mg-name-options"></div>
        <input class="field-input" id="mg-ism" placeholder="Ism" style="margin-top:8px;display:none;" autocomplete="off">
        <input class="field-input" id="mg-familiya" placeholder="Familiya" style="margin-top:6px;display:none;" autocomplete="off">
      </div>
      <!-- Telefon -->
      <div>
        <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;">Telefon raqam</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;" id="mg-tel-options"></div>
        <div class="tel-wrap" style="margin-top:8px;display:none;" id="mg-tel-custom-wrap">
          <input class="field-input tel-input" id="mg-tel" placeholder="+998 __ ___ __ __" maxlength="17" inputmode="tel">
          <div class="tel-hint" id="mg-tel-hint"></div>
        </div>
        <div class="tel-wrap" style="margin-top:6px;display:none;" id="mg-tel2-custom-wrap">
          <input class="field-input tel-input" id="mg-tel2" placeholder="Qo‘shimcha telefon (ixtiyoriy)" maxlength="17" inputmode="tel">
          <div class="tel-hint" id="mg-tel2-hint"></div>
        </div>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn-cancel" onclick="closeMergeModal()">Bekor</button>
      <button class="btn-submit" id="mg-save-btn" onclick="confirmMerge()" style="background:#8b5cf6;">
        <span class="spinner" id="mg-spinner"></span>
        <span id="mg-btn-txt">🔀 Birlashtirish</span>
      </button>
    </div>
  </div>
</div>`;

  document.body.insertAdjacentHTML('beforeend', mergeHtml);

  // Tel inputlarini sozlash
  setupTel('sa-tel', 'sa-tel-hint');
  setupTel('sa-tel2', 'sa-tel2-hint');
  setupTel('se-tel', 'se-tel-hint');
  setupTel('se-tel2', 'se-tel2-hint');
  setupTel('mg-tel',  'mg-tel-hint');
  setupTel('mg-tel2', 'mg-tel2-hint');
}

function openSuperAdd() {
  if (!U || !U.isSuper) return;  // Faqat superadmin uchun
  ['sa-ism','sa-familiya','sa-tel','sa-tel2','sa-fish','sa-univ'].forEach(id => { const el=g(id); if(el) el.value=''; });
  ['sa-sert','sa-tajriba'].forEach(id => { const el=g(id); if(el) el.value=''; });
  g('sa-fan').value = '';
  ['sa-tel-hint','sa-tel2-hint'].forEach(id => { const el=g(id); if(el) { el.textContent=''; el.className='tel-hint'; } });
  const m = g('super-add-modal'); if(m) { m.style.display='flex'; }
}
function closeSuperAdd() {
  const m = g('super-add-modal'); if(m) { m.style.display='none'; }
}

async function saveSuperAdd() {
  const ism  = (g('sa-ism')?.value||'').trim();
  const fam  = (g('sa-familiya')?.value||'').trim();
  const fan  = g('sa-fan')?.value||'';
  const tel  = (g('sa-tel')?.value||'').trim();
  const tel2 = (g('sa-tel2')?.value||'').trim();

  if (!ism||!fam)    { toast('⚠️ Ism va familiya kiriting','error'); return; }
  if (!fan)          { toast('⚠️ Fan tanlang','error'); return; }
  if (!tel)          { toast('⚠️ Telefon kiriting','error'); return; }
  if (!isTelOk(tel)) { toast("⚠️ Telefon formati noto'g'ri (+998 XX XXX XX XX)",'error'); return; }
  if (tel2 && !isTelOk(tel2)) { toast("⚠️ Qo'sh. telefon formati noto'g'ri",'error'); return; }

  const fish     = (g('sa-fish')?.value||'').trim();
  const univ     = (g('sa-univ')?.value||'').trim();
  const sertMatn = (g('sa-sert')?.value||'').trim();
  const tajriba  = (g('sa-tajriba')?.value||'').trim();

  setBtnLoading('sa-save-btn','sa-spinner','sa-btn-txt',true,'Saqlanmoqda…');
  try {
    // 1. O'qituvchi qo'shish
    const r = await api.addTeacher({
      username: U.username, parol: U.parol,
      ism, familiya: fam, fan,
      telefon: tel, telefon2: tel2||'',
      kunlar:'', sinflar:'', boshlanish:'', tugash:'',
      date: new Date().toLocaleDateString('ru-RU')
    });
    if (!r.ok) { toast('❌ ' + r.error,'error'); return; }

    // 2. Agar portfolio ma'lumotlari bor bo'lsa, saqlaymiz
    if (fish||univ||sertMatn||tajriba) {
      // O'qituvchi id ni olish uchun qayta yuklash
      await loadTeachersQuiet();
      const added = T.find(t => t.ism===ism && t.familiya===fam);
      if (added) {
        await api.savePortfolioTeacher({
          username: U.username, parol: U.parol,
          fish, universitet: univ, sertifikatlar: sertMatn, ish_tajribasi: tajriba
        }, added.id);
      }
    }

    toast("✅ O'qituvchi qo'shildi!",'success');
    closeSuperAdd();
    await loadTeachers();
  } catch { toast('❌ Server bilan ulanishda xatolik','error'); }
  setBtnLoading('sa-save-btn','sa-spinner','sa-btn-txt',false,'Saqlash');
}

// Faqat T massivini yangilash (UI ni emas)
async function loadTeachersQuiet() {
  try {
    const d = await api.getTeachers({ username: U.username, parol: U.parol });
    if (d.ok) { T = d.teachers; T.forEach((t,i) => t.ri=i); }
  } catch {}
}

// ─────────────────────────────────────────────
//  SUPERADMIN: TAHRIRLASH (asosiy + portfolio + sertifikatlar)
// ─────────────────────────────────────────────
async function openSuperEdit(teacherId) {
  if (!U || !U.isSuper) return;  // Faqat superadmin uchun
  SE_ID    = teacherId;
  SE_SERTS = [];

  // Asosiy ma'lumotlarni topish
  const t = T.find(x => x.id === teacherId);
  if (t) {
    setValue('se-id',       t.id);
    setValue('se-ism',      t.ism||'');
    setValue('se-familiya', t.familiya||'');
    setValue('se-fan',      t.fan||'');
    setValue('se-tel',      t.telefon||'');
    setValue('se-tel2',     t.telefon2||'');
    ['se-tel','se-tel2'].forEach(id => {
      const inp=g(id), hint=g(id+'-hint');
      if (inp) inp.className='field-input tel-input';
      if (hint) { hint.textContent=''; hint.className='tel-hint'; }
      if (inp && inp.value) validateTel(inp,hint);
    });

    setValue('se-tgid', t.telegram_id || '');
    const sameTgOtherTeachers = t.telegram_id
      ? T.filter(x => x.id !== t.id && String(x.telegram_id) === String(t.telegram_id))
      : [];
    g('se-tg-status').innerHTML = t.telegram_id
      ? `<span style="color:#059669;">✅ Bog'langan (ID: ${t.telegram_id}) — o'qituvchi web panelga kira oladi</span>` +
        (sameTgOtherTeachers.length
          ? `<br><span style="color:#dc2626;">⚠️ Diqqat: shu Telegram ID yana ${sameTgOtherTeachers.length} ta o'qituvchiga ham biriktirilgan</span>`
          : '')
      : `<span style="color:#dc2626;">❌ Hali bog'lanmagan — o'qituvchi web panelga kira olmaydi</span>`;
    loadTeacherKandidatlar();
  }

  // Portfolio va sertifikatlarni tozalash
  setValue('se-fish',''); setValue('se-univ','');
  setValue('se-sert',''); setValue('se-tajriba','');
  g('se-sert-gallery').innerHTML = '';
  updateSeCount(0);

  const modal = g('super-edit-modal'); if(modal) { modal.style.display='flex'; }

  // Portfolio yuklash
  try {
    const r = await api.getPortfolioTeacher({ username: U.username, parol: U.parol }, teacherId);
    if (r.ok) {
      const p = r.portfolio;
      if (p) {
        // fish bo'sh bo'lsa — familiya ism tartibida avtomatik to'ldirish
        const fishVal = p.fish || '';
        setValue('se-fish',    fishVal || ((t ? t.familiya+' '+t.ism : '')).trim());
        setValue('se-univ',    p.universitet||'');
        setValue('se-sert',    p.sertifikatlar||'');
        setValue('se-tajriba', p.ish_tajribasi||'');
      } else {
        // Portfolio yo'q — familiya ism bilan to'ldirish
        if (t) setValue('se-fish', (t.familiya+' '+t.ism).trim());
      }
      SE_SERTS = r.sertifikatlar || [];
      renderSeGallery();
    }
  } catch {}
}

async function loadTeacherKandidatlar() {
  const sel = g('se-kandidatlar');
  if (!sel) return;
  sel.innerHTML = `<option value="">⏳ Yuklanmoqda…</option>`;
  try {
    const r = await api.getKandidatlar();
    if (!r.ok || !r.kandidatlar?.length) {
      sel.innerHTML = `<option value="">— hozircha hech kim botga /start yozmagan —</option>`;
      return;
    }
    sel.innerHTML = `<option value="">— botga /start yozganlar ro'yxatidan tanlang —</option>` +
      r.kandidatlar.map(k => {
        const label = `${esc(k.telegram_ism || 'Noma\'lum')}${k.telegram_username ? ' (@' + esc(k.telegram_username) + ')' : ''} — ${k.telegram_id}`;
        return `<option value="${k.telegram_id}">${label}</option>`;
      }).join('');
  } catch (e) {
    sel.innerHTML = `<option value="">❌ Yuklashda xatolik</option>`;
  }
}

function closeSuperEdit() {
  const m = g('super-edit-modal'); if(m) { m.style.display='none'; }
  SE_ID = null; SE_SERTS = [];
}

async function saveSuperEdit() {
  const ism  = (g('se-ism')?.value||'').trim();
  const fam  = (g('se-familiya')?.value||'').trim();
  const fan  = g('se-fan')?.value||'';
  const tel  = (g('se-tel')?.value||'').trim();
  const tel2 = (g('se-tel2')?.value||'').trim();

  if (!ism||!fam)    { toast('⚠️ Ism va familiya kiriting','error'); return; }
  if (!fan)          { toast('⚠️ Fan tanlang','error'); return; }
  if (!tel)          { toast('⚠️ Telefon kiriting','error'); return; }
  if (!isTelOk(tel)) { toast("⚠️ Telefon formati noto'g'ri",'error'); return; }
  if (tel2 && !isTelOk(tel2)) { toast("⚠️ Qo'sh. telefon noto'g'ri",'error'); return; }

  const old = T.find(x => x.id === SE_ID);
  const newTgId = (g('se-tgid')?.value || '').trim();
  if (newTgId && !/^\d+$/.test(newTgId)) {
    toast("⚠️ Telegram ID faqat raqamlardan iborat bo'lishi kerak",'error'); return;
  }
  const oldTgId = old?.telegram_id ? String(old.telegram_id) : '';

  setBtnLoading('se-save-btn','se-spinner','se-btn-txt',true,'Saqlanmoqda…');
  try {
    // 1. Asosiy ma'lumotlarni yangilash
    const r = await api.editTeacher({
      username: U.username, parol: U.parol,
      id: SE_ID,
      oldIsm: old?.ism||ism, oldFamiliya: old?.familiya||fam,
      ism, familiya: fam, fan,
      telefon: tel, telefon2: tel2||'',
      kunlar: old?.kunlar||'', sinflar: old?.sinflar||'',
      boshlanish: old?.boshlanish||'', tugash: old?.tugash||''
    });
    if (!r.ok) { toast('❌ ' + r.error,'error'); return; }

    // 2. Portfolio ma'lumotlarini saqlash
    await api.savePortfolioTeacher({
      username:      U.username,
      parol:         U.parol,
      fish:          (g('se-fish')?.value||'').trim(),
      universitet:   (g('se-univ')?.value||'').trim(),
      sertifikatlar: (g('se-sert')?.value||'').trim(),
      ish_tajribasi: (g('se-tajriba')?.value||'').trim()
    }, SE_ID);

    // 3. Telegram ID o'zgargan bo'lsa — biriktirish/ajratish
    if (newTgId && newTgId !== oldTgId) {
      if (oldTgId) await api.tgAjrat(oldTgId, 'oqituvchi', SE_ID);
      const tr = await api.tgBirikdir({
        telegramId: parseInt(newTgId),
        telegramIsm: `${fam} ${ism}`.trim(),
        rol: 'oqituvchi',
        entityId: SE_ID,
      });
      if (!tr.ok) { toast('❌ Telegram biriktirishda xatolik: ' + tr.error,'error'); }
    } else if (!newTgId && oldTgId) {
      await api.tgAjrat(oldTgId, 'oqituvchi', SE_ID);
    }

    toast("✅ O'qituvchi yangilandi!",'success');
    closeSuperEdit();
    await loadTeachers();
  } catch { toast('❌ Xatolik','error'); }
  setBtnLoading('se-save-btn','se-spinner','se-btn-txt',false,'Saqlash');
}

// Sertifikat gallery (edit modal uchun)
function renderSeGallery() {
  const el = g('se-sert-gallery'); if (!el) return;
  updateSeCount(SE_SERTS.length);
  if (!SE_SERTS.length) { el.innerHTML=''; return; }

  el.innerHTML = SE_SERTS.map(s => {
    const url   = BASE_URL + '/uploads/' + encodeURIComponent(s.fayl_nomi);
    const isPdf = s.fayl_nomi.endsWith('.pdf');
    const thumb = isPdf
      ? '<div style="height:75px;display:flex;align-items:center;justify-content:center;font-size:28px;background:#fee2e2;border-radius:8px;">📄</div>'
      : '<img src="' + url + '" style="width:100%;height:75px;object-fit:cover;border-radius:8px;" onerror="this.parentElement.innerHTML=\'<div style=\\\"height:75px;display:flex;align-items:center;justify-content:center;font-size:24px;background:#f3f4f6;border-radius:8px;\\\">🖼️</div>\'">';
    return '<div style="position:relative;border:1.5px solid #e5e7eb;border-radius:10px;padding:6px;">'
      + thumb
      + '<div style="font-size:10px;color:#6b7280;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc2(s.asl_nomi||s.fayl_nomi) + '">' + esc2(s.asl_nomi||s.fayl_nomi) + '</div>'
      + '<button onclick="deleteSeSeert(\'' + esc(s.fayl_nomi) + '\')" style="position:absolute;top:3px;right:3px;background:#ef4444;color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;padding:0;">✕</button>'
      + '</div>';
  }).join('');
}

function updateSeCount(n) {
  const el = g('se-sert-count'); if(el) { el.textContent='('+n+'/10)'; el.style.color=n>=10?'#ef4444':'#6b7280'; }
  const lbl = g('se-upload-label'); if(lbl) lbl.style.opacity = n>=10?'.4':'1';
  const inp = g('se-sert-file');    if(inp) inp.disabled = n>=10;
}

async function uploadSeSert() {
  if (SE_SERTS.length >= 10) { toast('❗ Maksimal 10 ta sertifikat','error'); return; }
  const fileInput = g('se-sert-file');
  const file = fileInput?.files?.[0]; if(!file) return;

  const fd = new FormData();
  fd.append('file', file);
  fd.append('username', U.username);
  fd.append('parol', U.parol);
  fileInput.value = '';
  toast('⏳ Yuklanmoqda...');

  const r = await api.uploadSertifikat(SE_ID, fd);
  if (!r.ok) { toast('❌ ' + r.error,'error'); return; }

  SE_SERTS.push({ fayl_nomi: r.filename, asl_nomi: r.asl_nomi, yuklangan: new Date().toLocaleDateString('ru-RU') });
  renderSeGallery();
  toast('✅ Sertifikat yuklandi','success');
}

async function deleteSeSeert(filename) {
  if (!confirm("Bu sertifikatni o'chirmoqchimisiz?")) return;
  const r = await api.deleteSertifikat({ username: U.username, parol: U.parol }, SE_ID, filename);
  if (!r.ok) { toast('❌ ' + r.error,'error'); return; }
  SE_SERTS = SE_SERTS.filter(s => s.fayl_nomi !== filename);
  renderSeGallery();
  toast("✅ Sertifikat o'chirildi");
}

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//  SUPERADMIN: BIRLASHTIRISH
// ─────────────────────────────────────────────────────────────────────────────

// Merge uchun state
let MG_KEEP_RI   = null;  // saqlanadigan o'qituvchi index (T massivida)
let MG_REMOVE_RI = null;  // o'chiriladigan o'qituvchi index

function openMergeModal(ri) {
  if (!U || !U.isSuper) return;
  const keep = T[ri];
  if (!keep) return;

  // Bir xil ism-familiya bo'lgan boshqa o'qituvchilarni topish
  const sameNameCandidates = T.filter(t =>
    t.ri !== ri &&
    t.ism.trim().toLowerCase() === keep.ism.trim().toLowerCase() &&
    t.familiya.trim().toLowerCase() === keep.familiya.trim().toLowerCase()
  );

  // Agar bir xil ism-familiya bo'lmasa — barcha boshqa o'qituvchilar
  const candidates = sameNameCandidates.length > 0 ? sameNameCandidates : T.filter(t => t.ri !== ri);

  if (candidates.length === 0) {
    toast('⚠️ Birlashtirish uchun boshqa o\'qituvchi yo\'q', 'error');
    return;
  }

  // Agar bitta aniq kandidat bo'lsa — uni avtomatik tanlaymiz
  let removeRi;
  if (sameNameCandidates.length === 1) {
    removeRi = sameNameCandidates[0].ri;
  } else {
    // Ro'yxatdan tanlash
    const lines = candidates.map((c, i) =>
      `${i+1}. ${c.familiya} ${c.ism} — ${c.fan||"Fan yo'q"} — Maktablar: ${(c.maktablar||[]).map(m => m.nomi||m).join(', ')||'Biriktirilmagan'}`
    );
    const choice = prompt(
      '🔀 Qaysi o\'qituvchini o\'chirish (birlashtirish) kerak?\n\nSaqlanadigan: ' + keep.familiya + ' ' + keep.ism +
      '\n\nO\'chirish uchun raqam kiriting:\n' + lines.join('\n')
    );
    if (!choice) return;
    const pickIdx = parseInt(choice.trim()) - 1;
    if (isNaN(pickIdx) || pickIdx < 0 || pickIdx >= candidates.length) {
      toast('❌ Noto\'g\'ri raqam', 'error'); return;
    }
    removeRi = candidates[pickIdx].ri;
  }

  MG_KEEP_RI   = ri;
  MG_REMOVE_RI = removeRi;
  renderMergeModal();
}

function renderMergeModal() {
  const keep   = T[MG_KEEP_RI];
  const remove = T[MG_REMOVE_RI];
  if (!keep || !remove) return;

  // Info panellarini to'ldirish
  g('mg-keep-name').textContent   = keep.familiya + ' ' + keep.ism;
  g('mg-keep-fan').textContent    = keep.fan || "Fan ko'rsatilmagan";
  g('mg-keep-maktab').textContent = (keep.maktablar||[]).map(m => m.nomi||m).join(', ') || 'Maktab biriktirilmagan';

  g('mg-remove-name').textContent   = remove.familiya + ' ' + remove.ism;
  g('mg-remove-fan').textContent    = remove.fan || "Fan ko'rsatilmagan";
  g('mg-remove-maktab').textContent = (remove.maktablar||[]).map(m => m.nomi||m).join(', ') || 'Maktab biriktirilmagan';

  // Ism/familiya tanlov tugmalari
  const keepName   = keep.ism   + ' ' + keep.familiya;
  const removeName = remove.familiya + ' ' + remove.ism;
  const sameNames  = keepName.toLowerCase() === removeName.toLowerCase();

  const nameOpts = g('mg-name-options');
  nameOpts.innerHTML = '';
  if (!sameNames) {
    nameOpts.innerHTML =
      mkChoiceBtn('mg-name', 'keep',   keep.ism   + ' ' + keep.familiya,   true)  +
      mkChoiceBtn('mg-name', 'remove', remove.familiya + ' ' + remove.ism, false) +
      mkChoiceBtn('mg-name', 'custom', '✳ Boshqa kiriting…',               false);
  } else {
    nameOpts.innerHTML = '<span style="font-size:13px;color:#374151;padding:6px 0;">' + esc2(keepName) + ' <span style="color:#6b7280;">(ikkalasida bir xil)</span></span>';
  }
  g('mg-ism').value      = keep.ism;
  g('mg-familiya').value = keep.familiya;
  toggleMgNameInputs();

  // Telefon tanlov tugmalari
  const telOpts   = g('mg-tel-options');
  telOpts.innerHTML = '';
  const keepTel   = (keep.telefon  ||'').trim();
  const removeTel = (remove.telefon||'').trim();
  const sameTels  = keepTel.toLowerCase() === removeTel.toLowerCase();

  if (!sameTels && (keepTel || removeTel)) {
    if (keepTel)   telOpts.innerHTML += mkChoiceBtn('mg-tel', 'keep',   keepTel,               true);
    if (removeTel) telOpts.innerHTML += mkChoiceBtn('mg-tel', 'remove', removeTel,             false);
                   telOpts.innerHTML += mkChoiceBtn('mg-tel', 'custom', '✳ Boshqa kiriting…',  false);
  } else {
    const showTel = keepTel || removeTel || '—';
    telOpts.innerHTML = '<span style="font-size:13px;color:#374151;padding:6px 0;">' + esc2(showTel) + ' <span style="color:#6b7280;">(bir xil)</span></span>';
  }
  g('mg-tel').value  = keepTel;
  g('mg-tel2').value = (keep.telefon2||'').trim() || (remove.telefon2||'').trim();
  toggleMgTelInputs();

  // Tugmalarga onclick qo'shamiz
  document.querySelectorAll('[data-mg-group]').forEach(btn => {
    btn.onclick = function() { mgChoicePick(this); };
  });

  const modal = g('merge-modal');
  if (modal) modal.style.display = 'flex';
}

function mkChoiceBtn(group, value, label, active) {
  const border = active ? '#8b5cf6' : '#e5e7eb';
  const bg     = active ? '#ede9fe' : '#f9fafb';
  const color  = active ? '#5b21b6' : '#374151';
  return `<button type="button" data-mg-group="${group}" data-mg-val="${value}" `
    + `style="padding:7px 12px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s;`
    + `border:2px solid ${border};background:${bg};color:${color};">`
    + esc2(label)
    + `</button>`;
}

function mgChoicePick(btn) {
  const group = btn.dataset.mgGroup;
  document.querySelectorAll(`[data-mg-group="${group}"]`).forEach(b => {
    b.style.borderColor = '#e5e7eb';
    b.style.background  = '#f9fafb';
    b.style.color       = '#374151';
  });
  btn.style.borderColor = '#8b5cf6';
  btn.style.background  = '#ede9fe';
  btn.style.color       = '#5b21b6';

  if (group === 'mg-name') toggleMgNameInputs();
  if (group === 'mg-tel')  toggleMgTelInputs();
}

function getMgChoice(group) {
  const active = [...document.querySelectorAll(`[data-mg-group="${group}"]`)]
    .find(b => b.style.borderColor === 'rgb(139, 92, 246)' || b.style.borderColor === '#8b5cf6');
  return active ? active.dataset.mgVal : null;
}

function toggleMgNameInputs() {
  const choice = getMgChoice('mg-name');
  const show = choice === 'custom';
  g('mg-ism').style.display      = show ? '' : 'none';
  g('mg-familiya').style.display = show ? '' : 'none';
  if (choice === 'keep') {
    const k = T[MG_KEEP_RI]; if(k){ g('mg-ism').value=k.ism; g('mg-familiya').value=k.familiya; }
  } else if (choice === 'remove') {
    const r = T[MG_REMOVE_RI]; if(r){ g('mg-ism').value=r.ism; g('mg-familiya').value=r.familiya; }
  }
}

function toggleMgTelInputs() {
  const choice = getMgChoice('mg-tel');
  const show = choice === 'custom';
  const w1 = g('mg-tel-custom-wrap'),  w2 = g('mg-tel2-custom-wrap');
  if(w1) w1.style.display = show ? '' : 'none';
  if(w2) w2.style.display = show ? '' : 'none';
  if (choice === 'keep') {
    const k = T[MG_KEEP_RI]; if(k){ g('mg-tel').value=k.telefon||''; g('mg-tel2').value=k.telefon2||''; }
  } else if (choice === 'remove') {
    const r = T[MG_REMOVE_RI]; if(r){ g('mg-tel').value=r.telefon||''; g('mg-tel2').value=r.telefon2||''; }
  }
}

function closeMergeModal() {
  const m = g('merge-modal'); if(m) m.style.display='none';
  MG_KEEP_RI = null; MG_REMOVE_RI = null;
}

async function confirmMerge() {
  if (MG_KEEP_RI === null || MG_REMOVE_RI === null) return;
  const keep   = T[MG_KEEP_RI];
  const remove = T[MG_REMOVE_RI];
  if (!keep || !remove) return;

  // Ism/familiya aniqlash
  let ism, familiya;
  const nameChoice = getMgChoice('mg-name');
  if (!nameChoice || nameChoice === 'keep') {
    ism = keep.ism; familiya = keep.familiya;
  } else if (nameChoice === 'remove') {
    ism = remove.ism; familiya = remove.familiya;
  } else {
    ism      = (g('mg-ism').value||'').trim();
    familiya = (g('mg-familiya').value||'').trim();
    if (!ism || !familiya) { toast('❌ Ism va familiya kiritilmagan', 'error'); return; }
  }

  // Telefon aniqlash
  let telefon, telefon2;
  const telChoice = getMgChoice('mg-tel');
  if (!telChoice || telChoice === 'keep') {
    telefon  = keep.telefon  || '';
    telefon2 = keep.telefon2 || '';
  } else if (telChoice === 'remove') {
    telefon  = remove.telefon  || '';
    telefon2 = remove.telefon2 || '';
  } else {
    telefon  = (g('mg-tel').value||'').trim();
    telefon2 = (g('mg-tel2').value||'').trim();
  }

  if (!confirm(
    `🔀 Birlashtirish tasdiqlandi?\n\n` +
    `✅ Saqlanadigan: ${keep.ism} ${keep.familiya}\n` +
    `🗑️ O'chiriladigan: ${remove.ism} ${remove.familiya}\n\n` +
    `Natijadagi ism: ${ism} ${familiya}\n` +
    `Telefon: ${telefon||'—'}\n\n` +
    `Barcha maktablar, davomat va portfolio birlashtiriladi.`
  )) return;

  const btn = g('mg-save-btn');
  const sp  = g('mg-spinner');
  const tx  = g('mg-btn-txt');
  btn.disabled = true; sp.style.display='inline-block'; tx.textContent='Birlashtirilyapti...';

  try {
    const d = await api.mergeTeachers({
      username: U.username,
      parol:    U.parol,
      keepId:   keep.id,
      removeId: remove.id,
      ism, familiya, telefon, telefon2
    });
    if (d.ok) {
      closeMergeModal();
      toast('🔀 Muvaffaqiyatli birlashtirildi!', 'success');
      await loadTeachers();
    } else {
      toast('❌ ' + (d.error||'Xatolik'), 'error');
    }
  } catch(e) {
    toast('❌ Server xatoligi', 'error');
  } finally {
    btn.disabled = false; sp.style.display='none'; tx.textContent='🔀 Birlashtirish';
  }
}


//  SUPERADMIN: O'CHIRISH
// ─────────────────────────────────────────────
function confirmDelSuper(ri) {
  const t = T[ri]; if (!t) return;
  if (!confirm('"' + t.familiya + ' ' + t.ism + "\" o'qituvchini to'liq o'chirishni tasdiqlaysizmi?\n\nBarcha davomat va portfolio ma'lumotlari ham o'chiriladi!")) return;
  delTeacherSuper(t);
}

async function delTeacherSuper(t) {
  try {
    const r = await api.deleteTeacher({ username: U.username, parol: U.parol, delId: t.id, delIsm: t.ism, delFamiliya: t.familiya });
    if (r.ok) { await loadTeachers(); toast("✅ O'qituvchi o'chirildi",'success'); }
    else toast('❌ ' + r.error,'error');
  } catch { toast('❌ Xatolik','error'); }
}

// ─────────────────────────────────────────────
//  ODDIY ADMIN: O'QITUVCHI QO'SHISH
// ─────────────────────────────────────────────
async function addTeacher() {
  const ism  = g('f-ism').value.trim();
  const fam  = g('f-familiya').value.trim();
  const fan  = g('f-fan').value;
  const tel  = g('f-tel').value.trim();
  const tel2 = g('f-tel2').value.trim();

  if (!ism||!fam)  { toast('⚠️ Ism va familiya kiriting','error'); return; }
  if (!fan)        { toast('⚠️ Fan tanlang','error'); return; }
  if (!tel)        { toast('⚠️ Telefon kiriting','error'); return; }
  if (!isTelOk(tel)) { toast("⚠️ Telefon formati noto'g'ri (+998 XX XXX XX XX)",'error'); return; }
  if (tel2 && !isTelOk(tel2)) { toast("⚠️ Qo'sh. telefon formati noto'g'ri",'error'); return; }

  setBtnLoading('submit-btn','spinner','btn-txt',true,'Saqlanmoqda…');
  try {
    const r = await api.addTeacher({
      username: U.username, parol: U.parol,
      ism, familiya: fam, fan,
      telefon: tel, telefon2: tel2||'',
      kunlar:'', sinflar:'', boshlanish:'', tugash:'',
      date: new Date().toLocaleDateString('ru-RU')
    });
    if (r.ok) { clearForm(); await loadTeachers(); toast("✅ O'qituvchi qo'shildi!",'success'); }
    else toast('❌ ' + r.error,'error');
  } catch { toast('❌ Server bilan ulanishda xatolik','error'); }
  setBtnLoading('submit-btn','spinner','btn-txt',false,'Saqlash');
}

function clearForm() {
  ['f-ism','f-familiya','f-tel','f-tel2'].forEach(id => g(id).value = '');
  g('f-fan').value = '';
  ['f-tel-hint','f-tel2-hint'].forEach(id => {
    const el = g(id); if (el) { el.textContent=''; el.className='tel-hint'; }
  });
}

// ─────────────────────────────────────────────
//  ODDIY ADMIN: TAHRIRLASH
// ─────────────────────────────────────────────
function openEdit(idx) {
  const t = T[idx]; if (!t) return;
  eIdx = idx;
  setValue('e-ism',      t.ism||'');
  setValue('e-familiya', t.familiya||'');
  setValue('e-fan',      t.fan||'');
  setValue('e-tel',      t.telefon||'');
  setValue('e-tel2',     t.telefon2||'');
  ['e-tel','e-tel2'].forEach(id => {
    const inp=g(id), hint=g(id+'-hint');
    if (inp) inp.className='field-input tel-input';
    if (hint) { hint.textContent=''; hint.className='tel-hint'; }
    if (inp && inp.value) validateTel(inp,hint);
  });
  const modal = g('edit-modal'); if (modal) modal.classList.add('show');
}

function closeEdit() {
  const modal = g('edit-modal'); if (modal) modal.classList.remove('show');
  eIdx = null;
}

async function saveEdit() {
  const ism  = g('e-ism').value.trim();
  const fam  = g('e-familiya').value.trim();
  const fan  = g('e-fan').value;
  const tel  = g('e-tel').value.trim();
  const tel2 = g('e-tel2').value.trim();

  if (!ism||!fam) { toast('⚠️ Ism va familiya kiriting','error'); return; }
  if (!fan)       { toast('⚠️ Fan tanlang','error'); return; }
  if (!tel)       { toast('⚠️ Telefon kiriting','error'); return; }
  if (!isTelOk(tel)) { toast("⚠️ Telefon formati noto'g'ri",'error'); return; }
  if (tel2 && !isTelOk(tel2)) { toast("⚠️ Qo'sh. telefon noto'g'ri",'error'); return; }

  const old = T[eIdx];
  setBtnLoading('e-save-btn','e-spinner','e-btn-txt',true,'Saqlanmoqda…');
  try {
    const r = await api.editTeacher({
      username: U.username, parol: U.parol,
      id: old.id,
      oldIsm: old.ism, oldFamiliya: old.familiya,
      ism, familiya: fam, fan,
      telefon: tel, telefon2: tel2||'',
      kunlar: old.kunlar||'', sinflar: old.sinflar||'',
      boshlanish: old.boshlanish||'', tugash: old.tugash||''
    });
    if (r.ok) { closeEdit(); await loadTeachers(); toast("✅ O'qituvchi yangilandi!",'success'); }
    else toast('❌ ' + r.error,'error');
  } catch { toast('❌ Xatolik','error'); }
  setBtnLoading('e-save-btn','e-spinner','e-btn-txt',false,'Saqlash');
}

// ─────────────────────────────────────────────
//  ODDIY ADMIN: O'CHIRISH
// ─────────────────────────────────────────────
function confirmDel(idx) {
  const t = T[idx]; if (!t) return;
  if (!confirm('"' + t.familiya + ' ' + t.ism + "\" o'qituvchini o'z ro'yxatingizdan chiqarishni tasdiqlaysizmi?")) return;
  delTeacher(idx);
}

async function delTeacher(idx) {
  const t = T[idx];
  try {
    const r = await api.deleteTeacher({ username: U.username, parol: U.parol, delId: t.id, delIsm: t.ism, delFamiliya: t.familiya });
    if (r.ok) { await loadTeachers(); toast("✅ O'qituvchi ro'yxatdan chiqarildi",'success'); }
    else toast('❌ ' + r.error,'error');
  } catch { toast('❌ Xatolik','error'); }
}

// ─────────────────────────────────────────────
//  YORDAMCHI: Telefon
// ─────────────────────────────────────────────
function fmtTel(val) {
  const d = val.replace(/\D/g,'');
  let s = d.startsWith('998') ? d : d.startsWith('0') ? '998'+d.slice(1) : '998'+d;
  s = s.slice(0,12);
  let o='';
  if(s.length>0) o='+'+s.slice(0,3);
  if(s.length>3) o+=' '+s.slice(3,5);
  if(s.length>5) o+=' '+s.slice(5,8);
  if(s.length>8) o+=' '+s.slice(8,10);
  if(s.length>10) o+=' '+s.slice(10,12);
  return o;
}
function isTelOk(val) { const d=val.replace(/\D/g,''); return d.length===12&&d.startsWith('998'); }
function validateTel(inp,hintEl) {
  if(!inp) return;
  const val=inp.value.trim();
  if(!val) { inp.className='field-input tel-input'; if(hintEl){hintEl.className='tel-hint';hintEl.textContent='';} return; }
  const ok=isTelOk(val);
  inp.className='field-input tel-input '+(ok?'tel-ok':'tel-err');
  if(hintEl){hintEl.className='tel-hint '+(ok?'ok':'err');hintEl.textContent=ok?"✓ To'g'ri format":"✗ +998 XX XXX XX XX formatida kiriting";}
}
function setupTel(inpId,hintId) {
  const inp=g(inpId),hint=g(hintId); if(!inp) return;
  inp.addEventListener('input',function(){
    const ol=this.value.length,pos=this.selectionStart;
    this.value=fmtTel(this.value);
    const diff=this.value.length-ol;
    try{this.setSelectionRange(pos+diff,pos+diff);}catch(e){}
    validateTel(this,hint);
  });
  inp.addEventListener('blur',()=>validateTel(inp,hint));
}

// ─────────────────────────────────────────────
//  YORDAMCHI: Umumiy
// ─────────────────────────────────────────────
function setBtnLoading(btnId,spId,txtId,loading,txt) {
  const b=g(btnId),s=g(spId),t=g(txtId);
  if(b) b.disabled=loading;
  if(s) s.style.display=loading?'inline-block':'none';
  if(t) t.textContent=txt;
}
function setDisplay(id,val) { const el=g(id); if(el) el.style.display=val; }
function setValue(id,val)   { const el=g(id); if(el) el.value=val; }
function g(id)   { return document.getElementById(id); }
function esc(s)  { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
function esc2(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

let toastT;
function toast(msg,type='') {
  const t=g('toast'); if(!t) return;
  t.textContent=msg; t.className='toast show '+(type||'');
  clearTimeout(toastT);
  toastT=setTimeout(()=>{t.className='toast';},type==='error'?8000:3000);
}
// ═══════════════════════════════════════════════════
//  PORTFOLIO TAB — oqituvchilar.html uchun
// ═══════════════════════════════════════════════════

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

async function oqUploadSert() {
  if (OQ_PM_SERTS.length >= 10) return toast('❗ Maksimal 10 ta sertifikat', 'error');
  const fileInput = g('oq-pm-sert-file');
  const file = fileInput?.files?.[0];
  if (!file) return;

  const id = g('oq-pm-teacher-id').value;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('username', U.username);
  fd.append('parol', U.parol);

  fileInput.value = '';
  toast('⏳ Yuklanmoqda...');

  const r = await api.uploadSertifikat(id, fd);
  if (!r.ok) return toast('❌ ' + r.error, 'error');

  OQ_PM_SERTS.push({ fayl_nomi: r.filename, asl_nomi: r.asl_nomi, yuklangan: new Date().toLocaleDateString('ru-RU') });
  oqRenderSertGallery();
  toast('✅ Sertifikat yuklandi', 'success');
  loadOqPortfolio();
}

async function oqDeleteSert(filename) {
  if (!confirm('Bu sertifikatni o\'chirmoqchimisiz?')) return;
  const id = g('oq-pm-teacher-id').value;
  const r  = await api.deleteSertifikat({ username: U.username, parol: U.parol }, id, filename);
  if (!r.ok) return toast('❌ ' + r.error, 'error');
  OQ_PM_SERTS = OQ_PM_SERTS.filter(s => s.fayl_nomi !== filename);
  oqRenderSertGallery();
  toast('✅ Sertifikat o\'chirildi');
  loadOqPortfolio();
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
  loadOqPortfolio();
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
window.oqClearPtSearch   = oqClearPtSearch;