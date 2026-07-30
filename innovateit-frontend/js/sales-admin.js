// ═══════════════════════════════════════════════════════════════════════════
//  Sales boshqaruv paneli — faqat superadmin uchun (tabs-row superadmin'da
//  ko'rinadi, shuning uchun bu bo'lim avtomatik ravishda superadmin bilan
//  cheklangan; backendda ham requireAuth(['admin']) + isSuper bilan qayta
//  tekshiriladi).
// ═══════════════════════════════════════════════════════════════════════════

let SL_XODIMLAR  = [];
let SL_MAKTABLAR = []; // barcha maktablar ro'yxati (biriktirish uchun)

function slEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ─── Tab yuklanganda: faqat sales xodimlari (leadlar endi faqat sales.html
//     panelida ko'rsatiladi — superadmin CRM'da ko'rinmaydi) ─────────────────
async function loadSalesTab() {
  await loadSalesXodimlar();
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
    SL_XODIMLAR  = r.xodimlar  || [];
    SL_MAKTABLAR = r.maktablar || [];
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

  listEl.innerHTML = SL_XODIMLAR.map(x => {
    // x.maktablar = [{id, nomi}, ...] — backenddan keladi
    const myMaktablar = Array.isArray(x.maktablar) ? x.maktablar : [];
    const myIds = new Set(myMaktablar.map(m => m.id));

    const maktabTags = myMaktablar.map(m =>
      `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 4px 2px 8px;border-radius:10px;background:#eff4ff;color:#2563eb;font-size:11px;font-weight:600;border:1px solid #bfdbfe;">
        ${slEsc(m.nomi)}
        <button onclick="ajratSalesMaktab(${x.id},${m.id})"
          title="Maktabni ajratish"
          style="width:16px;height:16px;border-radius:50%;border:none;background:#bfdbfe;
                 color:#1d4ed8;font-size:10px;cursor:pointer;padding:0;line-height:1;flex-shrink:0;">✕</button>
      </span>`
    ).join('');

    // Hali biriktirilmagan maktablar checkbox uchun
    const freeMaktablar = SL_MAKTABLAR.filter(m => !myIds.has(m.id));
    const checkboxItems = freeMaktablar.map(m =>
      `<label style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap;background:#f8fafc;border:1px solid #e2e8f0;transition:background .15s;"
        onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='#f8fafc'">
        <input type="checkbox" value="${m.id}" class="sl-maktab-chk-${x.id}"
          style="width:14px;height:14px;accent-color:#2563eb;cursor:pointer;">
        ${slEsc(m.nomi)}
      </label>`
    ).join('');

    return `<div style="padding:14px 16px;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
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

      <!-- Biriktirilgan maktablar -->
      <div style="margin-top:10px;display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
        <span style="font-size:11px;color:#7a7870;font-weight:600;margin-right:4px;">Maktablar:</span>
        ${myMaktablar.length ? maktabTags : '<span style="font-size:11px;color:#9ca3af;">Biriktirilmagan</span>'}
      </div>

      <!-- Maktab biriktirish -->
      <div style="margin-top:8px;">
        ${freeMaktablar.length ? `
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
          ${checkboxItems}
        </div>
        <button class="bux-biriktiruv-btn" onclick="biriktirSalesMaktabUI(${x.id})">
          Biriktirish
        </button>` : '<span style="font-size:11px;color:#9ca3af;">Barcha maktablar biriktirilgan</span>'}
      </div>
    </div>`;
  }).join('');
}

// ─── Sales maktab biriktirish / ajratish ──────────────────────────────────────
async function biriktirSalesMaktabUI(salesId) {
  const checkboxes = document.querySelectorAll(`.sl-maktab-chk-${salesId}:checked`);
  if (checkboxes.length === 0) { toast('⚠️ Kamida bitta maktab tanlang', 'error'); return; }

  const maktabIds = [...checkboxes].map(c => parseInt(c.value, 10));
  let xato = 0;

  for (const maktabId of maktabIds) {
    const r = await api.biriktirSalesMaktab({ salesId, maktabId });
    if (!r.ok) xato++;
  }

  if (xato === 0) toast(`✅ ${maktabIds.length} ta maktab biriktirildi`, 'success');
  else toast(`⚠️ ${xato} ta maktabda xatolik`, 'error');
  loadSalesXodimlar();
}

async function ajratSalesMaktab(salesId, maktabId) {
  if (!confirm('Bu maktabni sales xodimidan ajratasizmi?')) return;
  const r = await api.ajratSalesMaktab({ salesId, maktabId });
  if (r.ok) { toast('✅ Ajratildi'); loadSalesXodimlar(); }
  else       toast('❌ ' + r.error, 'error');
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

// Leadlar bo'yicha barcha UI/mantiq endi faqat js/sales.js ichida
// (dedicated sales.html paneli uchun) — superadmin CRM'da ko'rsatilmaydi.