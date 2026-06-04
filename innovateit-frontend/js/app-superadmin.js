// ═══════════════════════════════════════════════════════
//  InnovateIT — Superadmin Yangi Bo'limlar
//  app-superadmin.js  (app.js dan keyin ulanadi)
// ═══════════════════════════════════════════════════════

// switchTab app.js da to'liq qayta yozilgan — bu yerda takrorlanmaydi

// ═══════════════════════════════════════════════════════
//  🏫 MAKTABLAR
// ═══════════════════════════════════════════════════════
let MAKTABLAR = [];

async function loadMaktablar() {
  try {
    const d = await api.getMaktablar();
    if (d.ok) { MAKTABLAR = d.maktablar; renderMaktablar(d.maktablar); }
    else toast('❌ ' + d.error, 'error');
  } catch(e) { toast('❌ Server xatoligi', 'error'); }
}

function renderMaktablar(list) {
  const tb = document.getElementById('maktablar-tbody');
  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;opacity:.5">Maktab yo\'q</td></tr>';
    return;
  }
  tb.innerHTML = list.map(m => `
    <tr>
      <td><strong>${esc(m.nomi)}</strong></td>
      <td>${m.adminlar_soni || 0}</td>
      <td>${m.oqituvchilar_soni || 0}</td>
      <td>${m.oquvchilar_soni || 0}</td>
      <td>${esc(m.yaratilgan || '')}</td>
      <td>
        <button class="btn-action" onclick="openMaktabEdit(${m.id},'${esc(m.nomi)}')">✏️</button>
        <button class="btn-small"  onclick="deleteMaktab(${m.id},'${esc(m.nomi)}')">O'chirish</button>
      </td>
    </tr>`).join('');
}

async function createMaktab() {
  const nomi = (document.getElementById('m-nomi').value || '').trim();
  if (!nomi) { showMErr("Maktab nomini kiriting"); return; }

  try {
    const r = await api.createMaktab({ nomi });
    if (r.ok) {
      document.getElementById('m-nomi').value = '';
      document.getElementById('m-err').style.display = 'none';
      toast('✅ Maktab qo\'shildi!', 'success');
      await loadMaktablar();
    } else showMErr(r.error);
  } catch(e) { showMErr('Xatolik'); }
}

function showMErr(msg) {
  const el = document.getElementById('m-err');
  el.textContent = '❌ ' + msg;
  el.style.display = 'block';
}

// Inline tahrirlash
function openMaktabEdit(id, nomi) {
  const row = [...document.querySelectorAll('#maktablar-tbody tr')]
    .find(tr => tr.querySelector('button[onclick*="openMaktabEdit(' + id + ',"]'));
  if (!row) return;

  row.cells[0].innerHTML = `
    <input class="field-input" id="m-edit-${id}" value="${esc(nomi)}" style="width:100%;max-width:200px;">`;
  row.cells[5].innerHTML = `
    <button class="btn-primary" onclick="saveMaktab(${id})">💾 Saqlash</button>
    <button class="btn-small"   onclick="loadMaktablar()">Bekor</button>`;
}

async function saveMaktab(id) {
  const inp = document.getElementById('m-edit-' + id);
  const nomi = (inp?.value || '').trim();
  if (!nomi) { toast('Nom bo\'sh bo\'lishi mumkin emas', 'error'); return; }

  try {
    const r = await api.editMaktab({ id, nomi });
    if (r.ok) { toast('✅ Yangilandi', 'success'); await loadMaktablar(); }
    else toast('❌ ' + r.error, 'error');
  } catch(e) { toast('❌ Xatolik', 'error'); }
}

async function deleteMaktab(id, nomi) {
  // confirm olib tashlandi
  try {
    const r = await api.deleteMaktab(id);
    if (r.ok) { toast('✅ Maktab o\'chirildi', 'success'); await loadMaktablar(); }
    else toast('❌ ' + r.error, 'error');
  } catch(e) { toast('❌ Xatolik', 'error'); }
}

// ═══════════════════════════════════════════════════════
//  📱 TELEGRAM ID LAR
// ═══════════════════════════════════════════════════════
let TG_ENTITIES = {}; // { admin: [], buxgalter: [], oqituvchi: [], oquvchi: [] }

async function loadTgBirikmalar() {
  try {
    const [bir, adm, bux, tea, stu] = await Promise.all([
      api.getTgBirikmalar(),
      api.getAdmins(),
      api.getBiriktirmalar(),
      api.getTeachers(),
      api.getStudents({ limit: 9999 }),
    ]);

    TG_ENTITIES = {
      admin:     (adm.ok     ? adm.admins       : []),
      buxgalter: (bir.ok     ? (bux.buxgalterlar || []) : []),
      oqituvchi: (tea.ok     ? tea.teachers      : []),
      oquvchi:   (stu.ok     ? stu.students      : []),
    };

    if (bir.ok) renderTgBirikmalar(bir.birikmalar);
    else toast('❌ ' + bir.error, 'error');
  } catch(e) { toast('❌ Server xatoligi', 'error'); }
}

function renderTgBirikmalar(list) {
  const tb = document.getElementById('tg-tbody');
  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;opacity:.5">Birikma yo\'q</td></tr>';
    return;
  }
  const rolLabels = { admin:'👤 Admin', buxgalter:'💼 Buxgalter', oqituvchi:'👩‍🏫 O\'qituvchi', oquvchi:'🎓 O\'quvchi' };
  tb.innerHTML = list.map(b => `
    <tr>
      <td><code>${b.telegram_id}</code></td>
      <td>${esc(b.telegram_ism || '—')}</td>
      <td>${rolLabels[b.rol] || b.rol}</td>
      <td>${esc(b.fish || '—')}</td>
      <td>${esc(b.biriktirilgan || '')}</td>
      <td>
        <button class="btn-small" onclick="tgAjrat('${b.telegram_id}','${esc(b.fish || b.telegram_ism || '')}')">Ajratish</button>
      </td>
    </tr>`).join('');
}

function onTgRolChange() {
  const rol   = document.getElementById('tg-rol').value;
  const wrap  = document.getElementById('tg-entity-wrap');
  const label = document.getElementById('tg-entity-label');
  const sel   = document.getElementById('tg-entity-id');

  if (!rol) { wrap.style.display = 'none'; return; }

  const labels = { admin:"Admin tanlang", buxgalter:"Buxgalter tanlang", oqituvchi:"O'qituvchi tanlang", oquvchi:"O'quvchi tanlang" };
  label.textContent = labels[rol] || 'Foydalanuvchi';

  const list = TG_ENTITIES[rol] || [];
  sel.innerHTML = '<option value="">— Tanlang —</option>' + list.map(e => {
    const nomi = e.familiya ? `${e.familiya} ${e.ism}` : e.ism;
    return `<option value="${e.id}">${esc(nomi)}</option>`;
  }).join('');

  wrap.style.display = 'block';
}

async function tgBirikdir() {
  const telegramId  = (document.getElementById('tg-id').value || '').trim();
  const telegramIsm = (document.getElementById('tg-ism').value || '').trim();
  const rol         = document.getElementById('tg-rol').value;
  const entityId    = document.getElementById('tg-entity-id').value;
  const errEl       = document.getElementById('tg-err');

  errEl.style.display = 'none';

  if (!telegramId || !rol || !entityId) {
    errEl.textContent = '❌ TelegramID, rol va foydalanuvchi majburiy';
    errEl.style.display = 'block';
    return;
  }

  try {
    const r = await api.tgBirikdir({ telegramId: parseInt(telegramId), telegramIsm, rol, entityId: parseInt(entityId) });
    if (r.ok) {
      ['tg-id','tg-ism'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('tg-rol').value = '';
      document.getElementById('tg-entity-wrap').style.display = 'none';
      toast('✅ TelegramID biriktirildi!', 'success');
      await loadTgBirikmalar();
    } else {
      errEl.textContent = '❌ ' + r.error;
      errEl.style.display = 'block';
    }
  } catch(e) { errEl.textContent = '❌ Xatolik'; errEl.style.display = 'block'; }
}

async function tgAjrat(telegramId, fish) {
  // confirm olib tashlandi
  try {
    const r = await api.tgAjrat(telegramId);
    if (r.ok) { toast('✅ Ajratildi', 'success'); await loadTgBirikmalar(); }
    else toast('❌ ' + r.error, 'error');
  } catch(e) { toast('❌ Xatolik', 'error'); }
}

// ═══════════════════════════════════════════════════════
//  📨 SO'ROVLAR
// ═══════════════════════════════════════════════════════

// Biriktirish holati: { sorovId: { rol, entityId } }
const SR_BIRIKMA = {};

// Barcha entitylar keshi
let SR_ENTITIES = { oqituvchi: [], oquvchi: [] };

async function loadSorovlar(holat) {
  ['k','t','r','a'].forEach(k => {
    const btn = document.getElementById('sr-btn-' + k);
    if (btn) btn.classList.remove('active');
  });
  const aktiv = holat === 'kutilmoqda' ? 'k' : holat === 'tasdiqlandi' ? 't' : holat === 'rad etildi' ? 'r' : 'a';
  const aktBtn = document.getElementById('sr-btn-' + aktiv);
  if (aktBtn) aktBtn.classList.add('active');

  try {
    // O'quvchi va o'qituvchilarni yuklash (biriktirish uchun)
    const [tea, stu] = await Promise.all([
      api.getTeachers(),
      api.getStudents({ limit: 9999 }),
    ]);
    if (tea.ok) SR_ENTITIES.oqituvchi = tea.teachers || [];
    if (stu.ok) SR_ENTITIES.oquvchi   = stu.students  || [];

    const params = holat ? { holat } : {};
    const d = await api.getSorovlar(params);
    if (d.ok) renderSorovlar(d.sorovlar);
    else toast('❌ ' + d.error, 'error');
  } catch(e) { toast('❌ Server xatoligi', 'error'); }
}

function renderSorovlar(list) {
  const tb = document.getElementById('sr-tbody');
  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;opacity:.5">So\'rov yo\'q</td></tr>';
    return;
  }

  const holatBadge = {
    'kutilmoqda':  '<span class="sr-holat kutilmoqda">⏳ Kutilmoqda</span>',
    'tasdiqlandi': '<span class="sr-holat tasdiqlandi">✅ Tasdiqlandi</span>',
    'rad etildi':  '<span class="sr-holat rad-etildi">❌ Rad etildi</span>',
  };

  const pozLabels = {
    oqituvchi: "👩‍🏫 O'qituvchi",
    oquvchi:   "🎓 O'quvchi",
    xodim:     "🏢 Xodim",
    boshqa:    "👤 Boshqa",
  };

  tb.innerHTML = list.map(s => {
    const poz = s.pozitsiya || '';
    const isOquvchi   = poz === 'oquvchi';
    const isOqituvchi = poz === 'oqituvchi';
    const needBirikma = s.holat === 'kutilmoqda' && (isOquvchi || isOqituvchi);

    // Entity options — bo'sh, onfocus da dinamik to'ldiriladi
    let entityOptions = '<option value="">— Tanlang —</option>';
    if (isOqituvchi) {
      SR_ENTITIES.oqituvchi.forEach(e => {
        entityOptions += `<option value="${e.id}">${esc(e.familiya + ' ' + e.ism)} (${esc((e.maktablar||[]).map(m=>m.nomi).join(', '))})</option>`;
      });
    }

    const birikmaSection = needBirikma ? `
      <div class="sr-birikma-wrap" id="sbw-${s.id}">
        <div class="sr-birikma-label">Mavjud ${isOquvchi ? "o'quvchi" : "o'qituvchi"}ga biriktirish:</div>
        <select class="sr-entity-sel" id="sr-ent-${s.id}"
          data-maktab="${esc(s.maktablar||'')}"
          data-sinf="${esc(s.sinf||'')}"
          data-poz="${poz}"
          onfocus="srFillDropdown(this)"
          onchange="srEntityChange(${s.id}, '${poz}', this.value)">
          ${isOquvchi ? '<option value="">— Tanlang —</option>' : entityOptions}
        </select>
        <div class="sr-birikma-hint" id="sr-hint-${s.id}"></div>
      </div>` : '';

    const amallar = s.holat === 'kutilmoqda' ? `
      <div class="sr-amal-wrap">
        ${birikmaSection}
        <div class="sr-btn-row">
          <button class="sr-approve-btn" id="sr-ok-${s.id}"
            onclick="sorovTasdiqlash(${s.id}, ${s.telegram_id}, '${esc(s.telegram_ism||'')}', '${poz}')"
            ${needBirikma ? 'disabled title="Avval biriktiring"' : ''}>
            ✅ Tasdiqlash
          </button>
          <button class="sr-reject-btn"
            onclick="sorovQaror(${s.id},'rad etildi')">
            ❌ Rad etish
          </button>
        </div>
      </div>`
    : s.holat === 'tasdiqlandi' ? `
      <div class="sr-btn-row">
        <button class="sr-detach-btn"
          onclick="sorovAjrat(${s.id}, ${s.telegram_id})">
          🔗 Ajratish
        </button>
      </div>`
    : '—';

    return `
    <tr>
      <td><code class="sr-tgid">${s.telegram_id}</code></td>
      <td>${esc(s.telegram_ism || '—')}</td>
      <td><span class="sr-poz">${pozLabels[poz] || esc(poz)}</span></td>
      <td><strong>${esc(s.fish || '—')}</strong></td>
      <td>${esc(s.maktablar || '—')}</td>
      <td>${esc(s.sinf || '—')}</td>
      <td>${esc(s.telefon || '—')}</td>
      <td>${holatBadge[s.holat] || esc(s.holat)}</td>
      <td class="sr-amal-td">${amallar}</td>
    </tr>`;
  }).join('');
}

// Select o'zgarganda — biriktirish holatini saqlash va Tasdiqlash ni aktiv qilish
function srFillDropdown(sel) {
  // Allaqachon to'ldirilgan bo'lsa qayta to'ldirmaslik
  if (sel.dataset.filled === '1') return;
  sel.dataset.filled = '1';

  const poz           = (sel.dataset.poz || '').toLowerCase().trim();
  const anketaMaktab  = (sel.dataset.maktab || '').toLowerCase().trim();
  const anketaSinfRaw = (sel.dataset.sinf || '').toLowerCase().trim();
  const anketaSinfNum = parseInt(anketaSinfRaw) || 0;

  // ── O'QITUVCHI ──
  if (poz === 'oqituvchi') {
    const filtered = SR_ENTITIES.oqituvchi.filter(e => {
      if (!anketaMaktab) return true;
      const eMaktablar = ((e.maktablar || []).map(m => (m.nomi||'').toLowerCase())).join(', ');
      const anketaM1   = anketaMaktab.split(',')[0].trim();
      return eMaktablar.includes(anketaM1) || anketaMaktab.includes(eMaktablar.split(',')[0]?.trim() || '');
    });
    const source = filtered.length ? filtered : SR_ENTITIES.oqituvchi;
    sel.innerHTML = '<option value="">— Tanlang —</option>';
    if (filtered.length === 0 && anketaMaktab) {
      const warn = document.createElement('option');
      warn.disabled = true;
      warn.textContent = `⚠️ ${sel.dataset.maktab} – da mos o'qituvchi topilmadi`;
      sel.appendChild(warn);
    }
    source.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = `${e.familiya} ${e.ism} (${(e.maktablar||[]).map(m=>m.nomi).join(', ')})`;
      sel.appendChild(opt);
    });
    return;
  }

  // ── O'QUVCHI ──
  const filtered = SR_ENTITIES.oquvchi.filter(e => {
    const eMaktab  = (e.maktab || '').toLowerCase().trim();
    const eSinfRaw = (e.sinf   || '').toLowerCase().trim();
    const eSinfNum = parseInt(eSinfRaw) || 0;
    const maktabMatch = anketaMaktab ? eMaktab.includes(anketaMaktab) || anketaMaktab.includes(eMaktab) : true;
    const sinfMatch   = anketaSinfNum ? eSinfNum === anketaSinfNum : (anketaSinfRaw ? eSinfRaw === anketaSinfRaw : true);
    return maktabMatch && sinfMatch;
  });

  const source = filtered.length ? filtered : SR_ENTITIES.oquvchi;
  sel.innerHTML = '<option value="">— Tanlang —</option>';
  if (filtered.length === 0 && anketaMaktab) {
    const warn = document.createElement('option');
    warn.disabled = true;
    warn.textContent = `⚠️ ${sel.dataset.maktab} - ${sel.dataset.sinf} da mos o'quvchi topilmadi`;
    sel.appendChild(warn);
  }
  source.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = `${e.familiya} ${e.ism} (${e.maktab || ''} ${e.sinf || ''})`;
    sel.appendChild(opt);
  });
}

function srEntityChange(sorovId, pozitsiya, entityId) {
  const okBtn  = document.getElementById('sr-ok-'   + sorovId);
  const hintEl = document.getElementById('sr-hint-' + sorovId);

  if (!entityId) {
    SR_BIRIKMA[sorovId] = null;
    if (okBtn) { okBtn.disabled = true; okBtn.title = 'Avval biriktiring'; }
    if (hintEl) hintEl.textContent = '';
    return;
  }

  const rol  = pozitsiya === 'oquvchi' ? 'oquvchi' : 'oqituvchi';
  const list = SR_ENTITIES[rol] || [];
  const ent  = list.find(e => String(e.id) === String(entityId));

  SR_BIRIKMA[sorovId] = { rol, entityId: parseInt(entityId), entity: ent };

  if (hintEl && ent) {
    hintEl.textContent = `✔ ${ent.familiya} ${ent.ism} ga biriktiriladi`;
    hintEl.style.color = '#059669';
  }
  if (okBtn) { okBtn.disabled = false; okBtn.title = ''; }
}

// Tasdiqlash — biriktirib keyin tasdiqlash
async function sorovTasdiqlash(sorovId, telegramId, telegramIsm, pozitsiya) {
  const birikma = SR_BIRIKMA[sorovId];
  const needBirikma = pozitsiya === 'oquvchi' || pozitsiya === 'oqituvchi';

  if (needBirikma && !birikma) {
    toast("⚠️ Avval mavjud foydalanuvchiga biriktiring", 'error');
    return;
  }

  try {
    // 1. Biriktirish (agar kerak bo'lsa)
    if (needBirikma && birikma) {
      const rb = await api.tgBirikdir({
        telegramId: parseInt(telegramId),
        telegramIsm,
        rol:      birikma.rol,
        entityId: birikma.entityId,
      });
      if (!rb.ok) {
        toast('❌ Biriktirish xatoligi: ' + rb.error, 'error');
        return;
      }
      // birikdir endpoint o'zi tasdiqlaydi va xabar yuboradi
      toast('✅ Biriktirildi va tasdiqlandi! Foydalanuvchiga xabar ketdi.', 'success');
    } else {
      // Biriktirishsiz tasdiqlash (xodim, boshqa)
      const r = await api.sorovTasdiqlash(sorovId, { holat: 'tasdiqlandi' });
      if (!r.ok) { toast('❌ ' + r.error, 'error'); return; }
      toast('✅ Tasdiqlandi! Foydalanuvchiga xabar ketdi.', 'success');
    }

    delete SR_BIRIKMA[sorovId];
    await loadSorovlar('kutilmoqda');
  } catch(e) { toast('❌ Xatolik', 'error'); }
}

async function sorovAjrat(sorovId, telegramId) {
  try {
    const r = await api.tgAjrat(telegramId);
    if (r.ok) {
      toast('🔗 Ajratildi — rad etilganlar royxatiga otdi', 'success');
      // Joriy filterni saqlab qayta yuklash
      const aktBtn = document.querySelector('.sr-filter-btn.active');
      const holat = aktBtn?.id === 'sr-btn-t' ? 'tasdiqlandi'
                  : aktBtn?.id === 'sr-btn-r' ? 'rad etildi'
                  : aktBtn?.id === 'sr-btn-k' ? 'kutilmoqda' : null;
      await loadSorovlar(holat);
    } else toast('❌ ' + r.error, 'error');
  } catch(e) { toast('❌ Xatolik', 'error'); }
}

async function sorovQaror(id, holat) {
  try {
    const r = await api.sorovTasdiqlash(id, { holat });
    if (r.ok) {
      toast(holat === 'tasdiqlandi' ? '✅ Tasdiqlandi' : '❌ Rad etildi', 'success');
      await loadSorovlar('kutilmoqda');
    } else toast('❌ ' + r.error, 'error');
  } catch(e) { toast('❌ Xatolik', 'error'); }
}

// ─── esc yordamchi (agar app.js da yo'q bo'lsa) ──────────────────────────────
if (typeof esc === 'undefined') {
  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
}