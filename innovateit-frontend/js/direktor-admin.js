// ═══════════════════════════════════════════════════════════════════════════
//  DIREKTORLAR (Superadmin tomonidan boshqarish)
//  Direktor — barcha maktablarni yuqoridan kuzatuvchi rahbar. Maktabga
//  bog'lanmaydi; kirishi FAQAT Telegram Mini App orqali (superadmin
//  Telegram ID biriktirgandan keyin). Yordamchilar (g, esc2, toast,
//  loadKandidatPicker) app.js dan olinadi.
// ═══════════════════════════════════════════════════════════════════════════
let DIR_DATA = [];
let _editDirId = null;

async function loadDirektorlar() {
  const listEl = g('dir-list');
  if (!listEl) return;
  listEl.innerHTML = '<div style="padding:16px;color:#7a7870;font-size:13px;">⏳ Yuklanmoqda…</div>';
  try {
    const r = await api.getDirektorlar({});
    if (!r.ok) {
      listEl.innerHTML = `<div style="color:#dc2626;padding:12px;font-size:13px;">❌ ${esc2(r.error)}</div>`;
      return;
    }
    DIR_DATA = r.direktorlar || [];
    renderDirektorList();
  } catch (e) {
    listEl.innerHTML = `<div style="color:#dc2626;padding:12px;font-size:13px;">❌ Xatolik: ${esc2(e.message)}</div>`;
  }
}

function renderDirektorList() {
  const listEl = g('dir-list');
  if (!DIR_DATA.length) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏛</div><p>Direktorlar yo\'q</p></div>';
    return;
  }
  listEl.innerHTML = DIR_DATA.map(d => {
    const fish = `${d.familiya || ''} ${d.ism}`.trim();
    return `<div style="padding:14px 16px;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:200px;">
          <div style="width:36px;height:36px;border-radius:50%;background:#ede9fe;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">🏛</div>
          <div>
            <div style="font-weight:600;font-size:14px;">${esc2(fish)}</div>
            <div style="font-size:11px;margin-top:2px;">
              ${d.telegram_id
                ? `<span style="color:#059669;">📱 Telegram bog'langan <span style="color:#9ca3af;font-family:'DM Mono',monospace;">(${esc2(d.telegram_id)})</span></span>`
                : '<span style="color:#dc2626;">❌ Telegram bog\'lanmagan — direktor panelga kira olmaydi</span>'}
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;">
          <button class="bux-edit-btn" onclick="openEditDir(${Number(d.id)})" style="${!d.telegram_id ? 'background:#fef3c7;border-color:#fde68a;color:#92400e;' : ''}">
            📱 ${d.telegram_id ? 'Telegram tahrirlash' : "Telegram bog'lash"}
          </button>
          <button class="bux-del-btn" onclick="deleteDirektor(${Number(d.id)})">O'chirish</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function createDirektor() {
  const ism      = (g('dir-ism')?.value      || '').trim();
  const familiya = (g('dir-familiya')?.value || '').trim();
  const errEl    = g('dir-err');
  const btnTxt   = g('dir-btn-txt');
  const spinner  = g('dir-spinner');

  errEl.style.display = 'none';
  if (!ism) { errEl.textContent = '❌ Ism kiritilmagan'; errEl.style.display = 'block'; return; }

  btnTxt.textContent = 'Yaratilmoqda…';
  if (spinner) spinner.style.display = 'inline-block';
  try {
    const r = await api.createDirektor({ ism, familiya });
    if (r.ok) {
      g('dir-ism').value = '';
      g('dir-familiya').value = '';
      toast('✅ Direktor yaratildi — endi Telegram ID biriktiring', 'success');
      loadDirektorlar();
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

async function deleteDirektor(id) {
  const d = DIR_DATA.find(x => x.id === id);
  const fish = d ? `${d.familiya || ''} ${d.ism}`.trim() : '';
  if (!confirm(`"${fish}" direktorni o'chirmoqchimisiz?\n\nU direktor paneliga kira olmaydi.`)) return;
  try {
    const r = await api.deleteDirektor({ id });
    if (r.ok) { toast("✅ Direktor o'chirildi"); loadDirektorlar(); }
    else toast('❌ ' + r.error, 'error');
  } catch (e) {
    toast('❌ Xatolik: ' + e.message, 'error');
  }
}

// ─── Tahrirlash + Telegram biriktirish modali ───────────────────────────────
function openEditDir(id) {
  const d = DIR_DATA.find(x => x.id === id);
  _editDirId = d ? d.id : id;
  g('edit-dir-familiya').value = d?.familiya || '';
  g('edit-dir-ism').value      = d?.ism || '';
  g('edit-dir-tgid').value     = d?.telegram_id || '';
  g('edit-dir-tg-status').innerHTML = d?.telegram_id
    ? `<span style="color:#059669;">✅ Bog'langan (ID: ${esc2(d.telegram_id)})</span>`
    : `<span style="color:#dc2626;">❌ Hali bog'lanmagan — direktor panelga kira olmaydi</span>`;
  g('edit-dir-err').style.display = 'none';
  g('edit-dir-modal').style.display = 'flex';
  loadKandidatPicker('edit-dir-kandidatlar', 'edit-dir-tgid');
}

function closeEditDir() {
  g('edit-dir-modal').style.display = 'none';
}

async function saveEditDir() {
  const newFamiliya = g('edit-dir-familiya').value.trim();
  const newIsm      = g('edit-dir-ism').value.trim();
  const newTgId     = g('edit-dir-tgid').value.trim();
  const errEl       = g('edit-dir-err');
  errEl.style.display = 'none';
  const fail = (m) => { errEl.textContent = '❌ ' + m; errEl.style.display = 'block'; };

  if (!newIsm) return fail('Ism kerak');
  if (newTgId && !/^\d+$/.test(newTgId)) return fail("Telegram ID faqat raqamlardan iborat bo'lishi kerak");
  if (!_editDirId) return fail('Direktor ID topilmadi');

  const d = DIR_DATA.find(x => x.id === _editDirId);
  const oldTgId = d?.telegram_id ? String(d.telegram_id) : '';

  // 1) Asosiy ma'lumotlar
  const r = await api.editDirektor({ id: _editDirId, ism: newIsm, familiya: newFamiliya });
  if (!r.ok) return fail(r.error);

  // 2) Telegram ID o'zgargan bo'lsa — biriktirish / ajratish
  try {
    if (newTgId && newTgId !== oldTgId) {
      // Eski ID almashtirilayotgan bo'lsa — avval eskisini ajratamiz
      // (telegram_users da "yetim" yozuv qolmasligi uchun)
      if (oldTgId) await api.tgAjrat(oldTgId, 'direktor', _editDirId);
      const tr = await api.tgBirikdir({
        telegramId:  parseInt(newTgId),
        telegramIsm: `${newFamiliya} ${newIsm}`.trim(),
        rol:         'direktor',
        entityId:    _editDirId,
      });
      if (!tr.ok) return fail('Telegram biriktirishda xatolik: ' + tr.error);
    } else if (!newTgId && oldTgId) {
      await api.tgAjrat(oldTgId, 'direktor', _editDirId);
    }
  } catch (e) {
    return fail('Telegram biriktirishda xatolik: ' + e.message);
  }

  closeEditDir();
  toast('✅ Direktor yangilandi', 'success');
  loadDirektorlar();
}

window.loadDirektorlar = loadDirektorlar;
window.createDirektor  = createDirektor;
window.deleteDirektor  = deleteDirektor;
window.openEditDir     = openEditDir;
window.closeEditDir    = closeEditDir;
window.saveEditDir     = saveEditDir;
