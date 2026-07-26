// ═══════════════════════════════════════════════════════════════════════════
//  Sales boshqaruv paneli — faqat superadmin uchun (tabs-row superadmin'da
//  ko'rinadi, shuning uchun bu bo'lim avtomatik ravishda superadmin bilan
//  cheklangan; backendda ham requireAuth(['admin']) + isSuper bilan qayta
//  tekshiriladi).
// ═══════════════════════════════════════════════════════════════════════════

let SL_XODIMLAR = [];
let SL_LEADS = [];

function slEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function slFormatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
         ' ' + d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

const SL_HOLAT_LABELS = {
  yangi:            { text: '🆕 Yangi',             color: '#2563eb', bg: '#eff6ff' },
  boglanildi:       { text: "📞 Bog'lanildi",        color: '#d97706', bg: '#fffbeb' },
  royxatga_olindi:  { text: "✅ Ro'yxatga olindi",   color: '#16a34a', bg: '#f0fdf4' },
  bekor_qilindi:    { text: '❌ Bekor qilindi',      color: '#dc2626', bg: '#fef2f2' },
};

// ─── Tab yuklanganda: xodimlar + leadlar ─────────────────────────────────────
async function loadSalesTab() {
  await Promise.all([loadSalesXodimlar(), loadLeads()]);
}

// ═══════════════════════════════════════════════════════════════════════════
//  SALES XODIMLARI
// ═══════════════════════════════════════════════════════════════════════════

async function loadSalesXodimlar() {
  const listEl = g('sl-xodim-list');
  listEl.innerHTML = '<div style="padding:16px;color:#7a7870;font-size:13px;">⏳ Yuklanmoqda…</div>';

  try {
    const r = await api.getSalesXodimlar();
    if (!r.ok) { listEl.innerHTML = `<div style="color:#dc2626;padding:12px;font-size:13px;">❌ ${r.error}</div>`; return; }
    SL_XODIMLAR = r.xodimlar || [];
    renderSalesXodimlar();
  } catch (e) {
    listEl.innerHTML = `<div style="color:#dc2626;padding:12px;font-size:13px;">❌ Xatolik: ${e.message}</div>`;
  }
}

function renderSalesXodimlar() {
  const listEl = g('sl-xodim-list');

  if (SL_XODIMLAR.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎯</div><p>Sales xodimlari yo\'q</p></div>';
    return;
  }

  listEl.innerHTML = SL_XODIMLAR.map(x => `
    <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:200px;">
        <div style="width:36px;height:36px;border-radius:50%;background:#fdf0e0;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">🎯</div>
        <div>
          <div style="font-weight:600;font-size:14px;">${slEsc(x.familiya)} ${slEsc(x.ism)}</div>
          <div style="font-size:12px;color:#7a7870;font-family:'DM Mono',monospace;">@${slEsc(x.username)}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <button class="bux-edit-btn" onclick="openEditSales(${x.id})">✏️ Tahrirlash</button>
        <button class="bux-del-btn" onclick="deleteSalesXodim(${x.id},'${slEsc(x.username)}','${slEsc(x.ism)}')">O'chirish</button>
      </div>
    </div>
  `).join('');
}

async function createSalesXodim() {
  const ism      = (g('sl-ism')?.value      || '').trim();
  const familiya = (g('sl-familiya')?.value || '').trim();
  const username = (g('sl-username')?.value || '').trim();
  const parol    = (g('sl-parol')?.value    || '');
  const errEl    = g('sl-err');
  const btnTxt   = g('sl-btn-txt');
  const spinner  = g('sl-spinner');

  errEl.style.display = 'none';

  if (!ism)      { errEl.textContent = '❌ Ism kiritilmagan'; errEl.style.display = 'block'; return; }
  if (!username) { errEl.textContent = '❌ Username kiritilmagan'; errEl.style.display = 'block'; return; }
  if (!parol)    { errEl.textContent = '❌ Parol kiritilmagan'; errEl.style.display = 'block'; return; }
  if (parol.length < 6) { errEl.textContent = "❌ Parol kamida 6 ta belgi bo'lishi kerak"; errEl.style.display = 'block'; return; }

  btnTxt.textContent = 'Saqlanmoqda…';
  if (spinner) spinner.style.display = 'inline-block';

  try {
    const r = await api.createSales({ ism, familiya, username, parol });

    if (r.ok) {
      toast('✅ Sales xodimi yaratildi', 'success');
      g('sl-ism').value = '';
      g('sl-familiya').value = '';
      g('sl-username').value = '';
      g('sl-parol').value = '';
      loadSalesXodimlar();
    } else {
      errEl.textContent = '❌ ' + r.error;
      errEl.style.display = 'block';
    }
  } catch (e) {
    errEl.textContent = '❌ Xatolik: ' + e.message;
    errEl.style.display = 'block';
  }

  btnTxt.textContent = 'Yaratish';
  if (spinner) spinner.style.display = 'none';
}

function openEditSales(id) {
  const x = SL_XODIMLAR.find(s => s.id === id);
  if (!x) return;

  const yangiIsm      = prompt('Ism:', x.ism);
  if (yangiIsm === null) return;
  const yangiFamiliya = prompt('Familiya:', x.familiya || '');
  if (yangiFamiliya === null) return;
  const yangiUsername = prompt('Username:', x.username);
  if (yangiUsername === null) return;
  const yangiParol     = prompt("Yangi parol (bo'sh qoldirsangiz o'zgarmaydi):", '');
  if (yangiParol === null) return;

  editSalesXodim(id, yangiIsm.trim(), yangiFamiliya.trim(), yangiUsername.trim(), yangiParol.trim());
}

async function editSalesXodim(id, ism, familiya, username, parol) {
  try {
    const payload = { id, ism, familiya, username };
    if (parol) payload.parol = parol;

    const r = await api.editSales(payload);
    if (r.ok) {
      toast('✅ Yangilandi', 'success');
      loadSalesXodimlar();
    } else {
      toast('❌ ' + r.error, 'error');
    }
  } catch (e) {
    toast('❌ Xatolik: ' + e.message, 'error');
  }
}

async function deleteSalesXodim(id, username, ism) {
  if (!confirm(`"${ism}" sales xodimini o'chirmoqchimisiz?\n\nU sales paneliga kira olmaydi.`)) return;

  try {
    const r = await api.deleteSales({ id });
    if (r.ok) {
      toast("✅ Sales xodimi o'chirildi");
      loadSalesXodimlar();
    } else {
      toast('❌ ' + r.error, 'error');
    }
  } catch (e) {
    toast('❌ Xatolik: ' + e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  LEADLAR
// ═══════════════════════════════════════════════════════════════════════════

async function loadLeads() {
  const loadingEl = g('sl-leads-loading');
  const emptyEl   = g('sl-leads-empty');
  const tbody     = g('sl-leads-tbody');
  if (!tbody) return; // tab hali render bo'lmagan bo'lishi mumkin (public sahifada)

  loadingEl.style.display = 'block';
  emptyEl.style.display = 'none';

  try {
    const holat = g('sl-holat-filter')?.value || '';
    const r = await api.getLeads(holat ? { holat } : {});
    if (r.ok) SL_LEADS = r.leadlar || [];
    renderLeads();
  } catch (e) {
    toast("❌ Leadlarni yuklab bo'lmadi", 'error');
  }
  loadingEl.style.display = 'none';
}

function renderLeads() {
  const tbody   = g('sl-leads-tbody');
  const emptyEl = g('sl-leads-empty');

  if (!SL_LEADS.length) {
    tbody.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  tbody.innerHTML = SL_LEADS.map(l => {
    const holatInfo = SL_HOLAT_LABELS[l.holat] || SL_HOLAT_LABELS.yangi;
    const biriktirilganNomi = l.sales_ism
      ? `${slEsc(l.sales_familiya || '')} ${slEsc(l.sales_ism)}`.trim()
      : '<span style="color:#9ca3af;">—</span>';

    const holatOptions = Object.entries(SL_HOLAT_LABELS).map(([key, info]) =>
      `<option value="${key}" ${l.holat === key ? 'selected' : ''}>${info.text}</option>`
    ).join('');

    return `<tr>
      <td>${slEsc(l.ism)}</td>
      <td><a href="tel:${slEsc(l.telefon)}" style="color:#2563eb;text-decoration:none;">${slEsc(l.telefon)}</a></td>
      <td>${slEsc(l.farzand_ismi || '—')}${l.sinf ? ` <span style="color:#9ca3af;">(${slEsc(l.sinf)})</span>` : ''}</td>
      <td>${slEsc(l.maktab_nomi || l.hudud || '—')}</td>
      <td>
        <select onchange="updateLeadHolat(${l.id}, this.value)"
          style="padding:5px 8px;border-radius:8px;border:1.5px solid ${holatInfo.color}33;background:${holatInfo.bg};color:${holatInfo.color};font-size:12px;font-weight:600;">
          ${holatOptions}
        </select>
      </td>
      <td>${biriktirilganNomi}</td>
      <td style="font-size:12px;color:#7a7870;">${slFormatDate(l.yaratilgan)}</td>
      <td>
        <button onclick="deleteLeadRow(${l.id},'${slEsc(l.ism)}')"
          style="padding:6px 10px;background:#fef2f2;color:#dc2626;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">O'chirish</button>
      </td>
    </tr>`;
  }).join('');
}

async function updateLeadHolat(id, holat) {
  try {
    const r = await api.updateLead({ id, holat });
    if (r.ok) {
      toast('✅ Holat yangilandi', 'success');
      const lead = SL_LEADS.find(l => l.id === id);
      if (lead) lead.holat = holat;
    } else {
      toast('❌ ' + r.error, 'error');
      loadLeads();
    }
  } catch (e) {
    toast('❌ Xatolik: ' + e.message, 'error');
  }
}

async function deleteLeadRow(id, ism) {
  if (!confirm(`"${ism}" leadini o'chirmoqchimisiz?`)) return;

  try {
    const r = await api.deleteLead({ id });
    if (r.ok) {
      toast('✅ Lead o\'chirildi');
      loadLeads();
    } else {
      toast('❌ ' + r.error, 'error');
    }
  } catch (e) {
    toast('❌ Xatolik: ' + e.message, 'error');
  }
}
