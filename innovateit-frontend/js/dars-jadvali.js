// ═══════════════════════════════════════════════════
//  InnovateIT School — Dars jadvali (dars-jadvali.js)
// ═══════════════════════════════════════════════════


const KUN_NAMES  = ['', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const KUN_SHORT  = ['', 'Du', 'Se', 'Cho', 'Pay', 'Ju', 'Sha'];
const KUNLAR_IDX = [1, 2, 3, 4, 5, 6];

let U         = null;   // { username, parol, ism }
let TEACHERS  = [];     // Barcha o'qituvchilar
let JADVALLAR = [];     // [{ id, teacher_ism, teacher_familiya, fan, sinflar:[], kunlar:[], boshlanish, tugash }]

let editingJadvalId = null;  // Tahrirlash rejimida saqlangan jadval ID si

let currentTab   = 'jadval';
let jadvalView   = 'sinf';   // 'sinf' | 'teacher'
let expJadType   = 'sinf';
let expFormat    = 'excel';  // 'excel' | 'image'

// ─────────────────────────────────────────────
//  YUKLANGANDA
// ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const saved = sessionStorage.getItem('iit_jadval_user');
    if (!saved) { window.location.href = 'index.html'; return; }
    U = JSON.parse(saved);
  } catch { window.location.href = 'index.html'; return; }

  const badge = g('jad-badge');
  badge.textContent = U.ism;

  setupChips('b-sinf-chips', 'sinf-chip');
  setupChips('b-kun-chips',  'kun-chip');
  setupVaqtInp('b-bosh-s'); setupVaqtInp('b-bosh-m');
  setupVaqtInp('b-tug-s');  setupVaqtInp('b-tug-m');

  g('loading-ov').style.display = 'flex';
  await Promise.all([loadTeachers(), loadJadvallar()]);
  g('loading-ov').style.display = 'none';

  populateFilters();
  renderJadval();
  renderSavedJadvallar();
});

function goBack() {
  window.location.href = 'oqituvchilar.html';
}

// ─────────────────────────────────────────────
//  TAB SWITCH
// ─────────────────────────────────────────────
function switchTab(tab, btn) {
  currentTab = tab;
  document.querySelectorAll('.jad-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  g('view-jadval').style.display   = tab === 'jadval'   ? '' : 'none';
  g('view-biriktir').style.display = tab === 'biriktir' ? '' : 'none';
  if (tab === 'jadval') renderJadval();
  if (tab === 'biriktir') renderSavedJadvallar();
}

// ─────────────────────────────────────────────
//  MA'LUMOT YUKLASH
// ─────────────────────────────────────────────
async function loadTeachers() {
  try {
    const d = await api.getTeachers({ username: U.username, parol: U.parol });
    if (d.ok) {
      TEACHERS = d.teachers;
      // O'qituvchi select larini to'ldirish
      ['b-teacher','filter-teacher','exp-teacher-sel'].forEach(id => {
        const sel = g(id); if (!sel) return;
        const cur = sel.value;
        // Faqat birinchi option ni saqlab, qolganlarni almashtiramiz
        while (sel.options.length > 1) sel.remove(1);
        TEACHERS.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t.familiya + ' ' + t.ism;
          opt.textContent = `${t.familiya} ${t.ism} (${t.fan || '—'})`;
          sel.appendChild(opt);
        });
        if (cur) sel.value = cur;
      });
    }
  } catch {}
}

async function loadJadvallar() {
  try {
    const d = await api.getJadvallar({ username: U.username, parol: U.parol });
    if (d.ok) {
      JADVALLAR = d.jadvallar.map(j => ({
        ...j,
        sinflar: parseSinflar(j.sinflar),
        kunlar:  parseDays(j.kunlar)
      }));
    }
  } catch {}
}

// ─────────────────────────────────────────────
//  FILTER POPULATE
// ─────────────────────────────────────────────
function populateFilters() {
  const allSinflar = [...new Set(JADVALLAR.flatMap(j => j.sinflar))].sort((a,b) => parseInt(a)-parseInt(b));
  ['filter-sinf','exp-sinf-sel'].forEach(id => {
    const sel = g(id); if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);
    allSinflar.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      sel.appendChild(opt);
    });
  });
}

// ─────────────────────────────────────────────
//  VIEW TOGGLE
// ─────────────────────────────────────────────
function setView(view, btn) {
  jadvalView = view;
  document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  g('filter-sinf-wrap').style.display    = view === 'sinf'    ? '' : 'none';
  g('filter-teacher-wrap').style.display = view === 'teacher' ? '' : 'none';
  renderJadval();
}

// ─────────────────────────────────────────────
//  JADVAL RENDER
// ─────────────────────────────────────────────
function renderJadval() {
  const wrap    = g('jadval-wrap');
  const today   = new Date().getDay(); // 0=yakshanba
  const filterS = g('filter-sinf')    ? g('filter-sinf').value    : '';
  const filterT = g('filter-teacher') ? g('filter-teacher').value : '';

  if (!JADVALLAR.length) {
    wrap.innerHTML = `<div class="empty-state" style="padding:40px;">
      <div class="empty-state-icon">📅</div>
      <p>Hali jadval yaratilmagan. "O'qituvchi biriktirish" bo'limidan boshlang.</p>
    </div>`;
    return;
  }

  if (jadvalView === 'sinf') {
    renderBySinf(wrap, filterS, today);
  } else {
    renderByTeacher(wrap, filterT, today);
  }
}

function renderBySinf(wrap, filterS, today) {
  // Barcha sinflar
  let sinflar = [...new Set(JADVALLAR.flatMap(j => j.sinflar))]
    .sort((a,b) => parseInt(a) - parseInt(b));
  if (filterS) sinflar = sinflar.filter(s => s === filterS);

  if (!sinflar.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:40px;"><p>Mos jadval topilmadi</p></div>';
    return;
  }

  let html = `<table class="jadval-table"><thead><tr>
    <th class="th-name">Sinf</th>
    ${KUNLAR_IDX.map(k => `<th class="${k===today?'today-col':''}">${KUN_NAMES[k]}</th>`).join('')}
  </tr></thead><tbody>`;

  sinflar.forEach(sinf => {
    html += `<tr><td class="td-name"><span class="sinf-badge">${sinf}</span></td>`;
    KUNLAR_IDX.forEach(kun => {
      const lessons = JADVALLAR.filter(j => j.sinflar.includes(sinf) && j.kunlar.includes(kun));
      if (lessons.length) {
        html += `<td class="${kun===today?'today-col':''}"><div class="jadval-cell">`;
        lessons.forEach(j => {
          html += `<div class="jcell teacher">
            <div class="jcell-name">${j.fan || '—'}</div>
            <div class="jcell-sub">${j.teacher_familiya} ${j.teacher_ism}</div>
            ${j.boshlanish ? `<div class="jcell-sub">⏰ ${j.boshlanish}–${j.tugash}</div>` : ''}
          </div>`;
        });
        html += `</div></td>`;
      } else {
        html += `<td class="${kun===today?'today-col':''}"><span class="jcell-empty">—</span></td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function renderByTeacher(wrap, filterT, today) {
  let jadvallar = JADVALLAR;
  if (filterT) jadvallar = jadvallar.filter(j => (j.teacher_familiya+' '+j.teacher_ism) === filterT);

  // Unique o'qituvchilar
  const teachers = [...new Map(jadvallar.map(j => [j.teacher_familiya+' '+j.teacher_ism, j])).values()];

  if (!teachers.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:40px;"><p>Mos jadval topilmadi</p></div>';
    return;
  }

  let html = `<table class="jadval-table"><thead><tr>
    <th class="th-name">O'qituvchi</th>
    ${KUNLAR_IDX.map(k => `<th class="${k===today?'today-col':''}">${KUN_NAMES[k]}</th>`).join('')}
  </tr></thead><tbody>`;

  teachers.forEach(tRef => {
    const tName = tRef.teacher_familiya + ' ' + tRef.teacher_ism;
    const tJad  = jadvallar.filter(j => j.teacher_familiya+' '+j.teacher_ism === tName);

    html += `<tr><td class="td-name">
      <div style="font-weight:600;">${tName}</div>
      <div style="font-size:11px;color:var(--muted);">${tRef.fan||'—'}</div>
    </td>`;

    KUNLAR_IDX.forEach(kun => {
      const lessons = tJad.filter(j => j.kunlar.includes(kun));
      if (lessons.length) {
        html += `<td class="${kun===today?'today-col':''}"><div class="jadval-cell">`;
        // Bir xil vaqtdagi darslarni guruhlash
        const grouped = [];
        lessons.forEach(j => {
          const vaqt = (j.boshlanish||'') + '-' + (j.tugash||'');
          const found = grouped.find(g => g.vaqt === vaqt);
          if (found) { found.sinflar = [...new Set([...found.sinflar, ...j.sinflar])]; }
          else { grouped.push({ vaqt, sinflar: [...j.sinflar], boshlanish: j.boshlanish, tugash: j.tugash }); }
        });
        grouped.forEach(g => {
          html += `<div class="jcell sinf">
            <div class="jcell-name">${g.sinflar.join(', ')}</div>
            ${g.boshlanish ? `<div class="jcell-sub">⏰ ${g.boshlanish}–${g.tugash}</div>` : ''}
          </div>`;
        });
        html += `</div></td>`;
      } else {
        html += `<td class="${kun===today?'today-col':''}"><span class="jcell-empty">—</span></td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  wrap.innerHTML = html;
}

// ─────────────────────────────────────────────
//  BIRIKTIRISH
// ─────────────────────────────────────────────
function onTeacherSelect() {
  const val = g('b-teacher').value;
  g('b-sinf-panel').style.display = val ? '' : 'none';

  if (!val) {
    g('b-sinflar-current').innerHTML = '<span class="cs-empty">O\'qituvchi tanlanmagan</span>';
    return;
  }

  // Mavjud biriktiruvlarni ko'rsatish
  const existing = JADVALLAR.filter(j => j.teacher_familiya + ' ' + j.teacher_ism === val);
  const allSinflar = [...new Set(existing.flatMap(j => j.sinflar))];

  if (allSinflar.length) {
    g('b-sinflar-current').innerHTML = allSinflar
      .map(s => `<span class="cs-sinf">${s}</span>`).join('');
  } else {
    g('b-sinflar-current').innerHTML = '<span class="cs-empty">Hali biriktirilmagan</span>';
  }

  // Mavjud sinflarni chiplarda belgilash
  clearBirikChips();
  allSinflar.forEach(s => {
    const chip = g('b-sinf-chips').querySelector(`[data-s="${s}"]`);
    if (chip) chip.classList.add('sel');
  });
  if (existing.length) {
    const lastJ = existing[existing.length - 1];
    lastJ.kunlar.forEach(k => {
      const chip = g('b-kun-chips').querySelector(`[data-k="${k}"]`);
      if (chip) chip.classList.add('sel');
    });
    if (lastJ.boshlanish) {
      const [bs, bm] = (lastJ.boshlanish||'08:00').split(':');
      const [ts, tm] = (lastJ.tugash||'14:00').split(':');
      g('b-bosh-s').value=bs||'08'; g('b-bosh-m').value=bm||'00';
      g('b-tug-s').value=ts||'14';  g('b-tug-m').value=tm||'00';
    }
  }
}

function applyGroup(sinflar, btn) {
  // Toggle group
  const allSel = sinflar.every(s => {
    const chip = g('b-sinf-chips').querySelector(`[data-s="${s}"]`);
    return chip && chip.classList.contains('sel');
  });
  // Barcha group chiplarini deselect
  document.querySelectorAll('.group-chip').forEach(c => c.classList.remove('sel'));

  sinflar.forEach(s => {
    const chip = g('b-sinf-chips').querySelector(`[data-s="${s}"]`);
    if (chip) chip.classList.toggle('sel', !allSel);
  });
  if (!allSel) btn.classList.add('sel');

  // O'quvchilar paneli: oxirgi tanlangan sinfni ko'rsat
  const selChips = [...g('b-sinf-chips').querySelectorAll('.sinf-chip.sel')];
  if (selChips.length) {
    activeSinfChip = selChips[selChips.length - 1].dataset.s;
    loadOquvchilarForSinf(activeSinfChip);
  } else {
    g('b-oquvchilar-panel').style.display = 'none';
    activeSinfChip = null;
  }
}

function clearBirikChips() {
  g('b-sinf-chips').querySelectorAll('.sinf-chip').forEach(c => c.classList.remove('sel'));
  g('b-kun-chips').querySelectorAll('.kun-chip').forEach(c => c.classList.remove('sel'));
  document.querySelectorAll('.group-chip').forEach(c => c.classList.remove('sel'));
}

function clearBirik() {
  g('b-teacher').value = '';
  g('b-sinf-panel').style.display = 'none';
  g('b-sinflar-current').innerHTML = '<span class="cs-empty">O\'qituvchi tanlanmagan</span>';
  clearBirikChips();
  g('b-bosh-s').value='08'; g('b-bosh-m').value='00';
  g('b-tug-s').value='14';  g('b-tug-m').value='00';
  // O'quvchilar panelini tozalash
  g('b-oquvchilar-panel').style.display = 'none';
  g('b-oquvchilar-list').innerHTML = '';
  activeSinfChip = null;
  selectedOquvchilarMap.clear();
  editingJadvalId = null;
}

async function saveBiriktir() {
  const teacherVal = g('b-teacher').value;
  if (!teacherVal) { toast('⚠️ O\'qituvchi tanlang', 'error'); return; }

  // Joriy ko'rsatilgan sinfni Map ga saqlash (Saqlash bosilgan payt)
  saveCurrentCheckboxState();

  const sinflar = [...g('b-sinf-chips').querySelectorAll('.sinf-chip.sel')].map(c => c.dataset.s);
  const kunlar  = [...g('b-kun-chips').querySelectorAll('.kun-chip.sel')].map(c => parseInt(c.dataset.k));

  // Sinf tekshiruvi: chip belgilangan YOKI Map da o'quvchilar bor
  const hasSinf = sinflar.length > 0 || selectedOquvchilarMap.size > 0;
  if (!hasSinf) { toast('⚠️ Kamida 1 sinf tanlang', 'error'); return; }
  if (!kunlar.length)  { toast('⚠️ Kamida 1 kun tanlang', 'error'); return; }

  // Agar chip belgilanmagan lekin Map da bor bo'lsa, Map kalit laridan sinflar sifatida foydalanamiz
  const effectiveSinflar = sinflar.length > 0 ? sinflar : [...selectedOquvchilarMap.keys()];

  const teacher = TEACHERS.find(t => t.familiya + ' ' + t.ism === teacherVal);
  const boshlanish = padZ(g('b-bosh-s').value) + ':' + padZ(g('b-bosh-m').value);
  const tugash     = padZ(g('b-tug-s').value)  + ':' + padZ(g('b-tug-m').value);

  bl('b-save-btn','b-spinner','b-btn-txt',true,'Saqlanmoqda…');
  try {
    // 1. Jadval saqlash
    const r = await api.saveJadval({
      username: U.username, parol: U.parol,
      id: editingJadvalId || undefined,
      teacher_ism: teacher ? teacher.ism : teacherVal.split(' ').slice(1).join(' '),
      teacher_familiya: teacher ? teacher.familiya : teacherVal.split(' ')[0],
      fan: teacher ? teacher.fan : '',
      sinflar: effectiveSinflar.join(','),
      kunlar: kunlar.join(','),
      boshlanish, tugash
    });

    if (!r.ok) { toast('❌ ' + r.error, 'error'); return; }

    // 2. O'quvchilarni biriktirish — selectedOquvchilarMap dagi barcha sinflar uchun
    if (teacher && selectedOquvchilarMap.size > 0) {
      const maktabId = (teacher.maktablar && teacher.maktablar.length > 0)
        ? teacher.maktablar[0].id
        : (U && U.maktabId ? U.maktabId : null);

      if (maktabId) {
        // Avval joriy ko'rsatilgan sinfni ham Map ga saqlash
        saveCurrentCheckboxState();

        const BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
          ? 'http://127.0.0.1:3001' : '';
        const token = localStorage.getItem('innovateit_token');

        // Faqat tanlangan sinflar uchun saqlash (parallel)
        const savePromises = [...selectedOquvchilarMap.entries()].map(([sinf, ids]) =>
          fetch(`${BASE}/api/teachers/oquvchi-birik`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ teacherId: teacher.id, oquvchiIds: [...ids], sinf, maktabId })
          })
        );
        await Promise.all(savePromises);
      }
    }

    await loadJadvallar();
    populateFilters();
    renderJadval();
    renderSavedJadvallar();
    clearBirik();
    toast('✅ Jadval va o\'quvchilar saqlandi!', 'success');
  } catch { toast('❌ Xatolik', 'error'); }
  bl('b-save-btn','b-spinner','b-btn-txt',false,'💾 Saqlash');
}

// ─────────────────────────────────────────────
//  SAQLANGAN JADVALLAR RENDER
// ─────────────────────────────────────────────
function renderSavedJadvallar() {
  const wrap = g('saved-jadvallar');
  if (!JADVALLAR.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📅</div><p>Hali jadval yaratilmagan</p></div>';
    return;
  }

  wrap.innerHTML = JADVALLAR.map((j, i) => {
    // O'qituvchini TEACHERS dan topib ID sini olamiz
    const teacherObj = TEACHERS.find(t =>
      t.ism === j.teacher_ism && t.familiya === j.teacher_familiya
    );
    const teacherId  = teacherObj ? teacherObj.id : null;
    const maktabId   = teacherObj && teacherObj.maktablar && teacherObj.maktablar.length > 0
      ? teacherObj.maktablar[0].id
      : (U && U.maktabId ? U.maktabId : null);

    const sinfBadges = j.sinflar.map(s => {
      if (teacherId && maktabId) {
        return `<span class="sji-sinf sji-sinf-link"
          title="${s}-sinf o'quvchilarini ko'rish"
          onclick="showSinfOquvchilar('${esc(j.teacher_familiya+' '+j.teacher_ism)}',${teacherId},'${esc(s)}',${maktabId})"
        >${s}</span>`;
      }
      return `<span class="sji-sinf">${s}</span>`;
    }).join('');

    return `
    <div class="saved-jad-item">
      <div class="sji-info">
        <div class="sji-name">${j.teacher_familiya} ${j.teacher_ism}
          <span style="font-size:11px;color:var(--muted);margin-left:6px;">${j.fan||'—'}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:4px;flex-wrap:wrap;">
          <div class="sji-sinflar">${sinfBadges}</div>
          <div class="sji-kunlar">${j.kunlar.map(k=>`<span class="sji-kun">${KUN_SHORT[k]||k}</span>`).join('')}</div>
          ${j.boshlanish ? `<span style="font-size:11px;color:var(--muted);">⏰ ${j.boshlanish}–${j.tugash}</span>` : ''}
        </div>
      </div>
      <div class="sji-btns">
        <button class="btn-action" title="Tahrirlash" onclick="editJadval(${i})">✏️</button>
        <button class="btn-action" title="O'chirish"  onclick="deleteJadval(${j.id},'${esc(j.teacher_familiya+' '+j.teacher_ism)}')">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────────
//  SINF O'QUVCHILARI MODALI
// ─────────────────────────────────────────────
async function showSinfOquvchilar(teacherFish, teacherId, sinf, maktabId) {
  const modal   = g('sinf-oquv-modal');
  const title   = g('sinf-oquv-title');
  const body    = g('sinf-oquv-body');

  const sinfLabel = sinf.replace(/-?sinf$/i, '').trim();
  title.textContent = `${teacherFish} — ${sinfLabel}-sinf o'quvchilari`;
  body.innerHTML    = `<div class="sinf-oquv-loading"><span class="spinner" style="display:inline-block;width:20px;height:20px;border:3px solid #e2e8f0;border-top-color:var(--primary);border-radius:50%;animation:spin .7s linear infinite;"></span> Yuklanmoqda...</div>`;
  modal.style.display = 'flex';

  try {
    const BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://127.0.0.1:3001' : '';
    const res  = await fetch(
      `${BASE}/api/teachers/sinf-oquvchilar?sinf=${encodeURIComponent(sinf)}&maktabId=${maktabId}&teacherId=${teacherId}`,
      { headers: { Authorization: `Bearer ${getToken()}` } }
    );
    const data = await res.json();

    if (!data.ok) {
      body.innerHTML = `<div class="sinf-oquv-empty">❌ ${data.error || 'Xatolik yuz berdi'}</div>`;
      return;
    }

    // Faqat biriktirilgan o'quvchilarni ko'rsatamiz
    const biriktirilganlar = data.oquvchilar.filter(o => o.biriktirilgan);

    if (!biriktirilganlar.length) {
      body.innerHTML = `<div class="sinf-oquv-empty">Bu sinfdan o'quvchi biriktirilmagan</div>`;
      return;
    }

    body.innerHTML = `
      <div class="sinf-oquv-count">${biriktirilganlar.length} ta o'quvchi biriktirilgan</div>
      <ul class="sinf-oquv-list">
        ${biriktirilganlar.map((o, idx) => `
          <li class="sinf-oquv-item">
            <span class="sinf-oquv-num">${idx + 1}</span>
            <span class="sinf-oquv-name">${o.familiya} ${o.ism}</span>
          </li>
        `).join('')}
      </ul>`;
  } catch (err) {
    body.innerHTML = `<div class="sinf-oquv-empty">❌ Server bilan aloqa yo'q</div>`;
  }
}

function closeSinfOquvModal() {
  g('sinf-oquv-modal').style.display = 'none';
}

// Token olish yordamchi funksiyasi
function getToken() {
  return localStorage.getItem('innovateit_token') || '';
}

function editJadval(idx) {
  const j = JADVALLAR[idx]; if (!j) return;

  // Tahrirlash rejimi — bu jadvalning ID sini eslab qolamiz
  editingJadvalId = j.id;

  switchTab('biriktir', g('tab-biriktir'));

  // O'qituvchini tanlash
  g('b-teacher').value = j.teacher_familiya + ' ' + j.teacher_ism;

  // Avval barcha chiplarni tozalaymiz
  clearBirikChips();
  g('b-sinf-panel').style.display = '';

  // Mavjud sinflar ko'rsatiladi
  const allSinflar = j.sinflar;
  if (allSinflar.length) {
    g('b-sinflar-current').innerHTML = allSinflar
      .map(s => '<span class="cs-sinf">' + s + '</span>').join('');
  } else {
    g('b-sinflar-current').innerHTML = '<span class="cs-empty">Hali biriktirilmagan</span>';
  }

  // Sinflar chiplarini belgilash
  allSinflar.forEach(s => {
    const chip = g('b-sinf-chips').querySelector('[data-s="' + s + '"]');
    if (chip) chip.classList.add('sel');
  });

  // Kunlar chiplarini belgilash
  j.kunlar.forEach(k => {
    const chip = g('b-kun-chips').querySelector('[data-k="' + k + '"]');
    if (chip) chip.classList.add('sel');
  });

  // Vaqtni to'ldirish
  if (j.boshlanish) {
    const [bs, bm] = (j.boshlanish || '08:00').split(':');
    const [ts, tm] = (j.tugash     || '14:00').split(':');
    g('b-bosh-s').value = bs || '08'; g('b-bosh-m').value = bm || '00';
    g('b-tug-s').value  = ts || '14'; g('b-tug-m').value  = tm || '00';
  }
}

async function deleteJadval(id, name) {
  if (!confirm(`"${name}" uchun jadval o'chirilsinmi?`)) return;
  try {
    const r = await api.deleteJadval({ username: U.username, parol: U.parol }, id);
    if (r.ok) {
      await loadJadvallar();
      populateFilters();
      renderJadval();
      renderSavedJadvallar();
      toast('✅ Jadval o\'chirildi', 'success');
    } else toast('❌ ' + r.error, 'error');
  } catch {}
}

// ─────────────────────────────────────────────
//  EXPORT (Excel + Rasm)
// ─────────────────────────────────────────────
function openExportModal() {
  populateFilters();
  // Rasm filter select ni to'ldirish
  populateImgFilter(g('exp-img-view') ? g('exp-img-view').value : 'sinf');
  g('export-jad-modal').style.display = 'flex';
}
function closeExportModal() { g('export-jad-modal').style.display = 'none'; }

function selectExpFormat(fmt, btn) {
  expFormat = fmt;
  document.querySelectorAll('.exp-fmt-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  g('exp-excel-opts').style.display = fmt === 'excel' ? '' : 'none';
  g('exp-image-opts').style.display = fmt === 'image' ? '' : 'none';
  g('exp-jad-btn').textContent = fmt === 'excel' ? '⬇ Excel yuklab olish' : '🖼️ Rasm yuklab olish';
}

function populateImgFilter(view) {
  const sel = g('exp-img-filter'); if (!sel) return;
  sel.innerHTML = '<option value="">— Barchasi —</option>';
  if (view === 'sinf') {
    const sinflar = [...new Set(JADVALLAR.flatMap(j => j.sinflar))].sort((a,b)=>parseInt(a)-parseInt(b));
    sinflar.forEach(s => sel.innerHTML += `<option value="${esc(s)}">${s}</option>`);
  } else {
    const teachers = [...new Set(JADVALLAR.map(j => j.teacher_familiya+' '+j.teacher_ism))];
    teachers.forEach(t => sel.innerHTML += `<option value="${esc(t)}">${t}</option>`);
  }
}

// Rasm view o'zgarganda filter ni yangilash
function onImgViewChange() {
  populateImgFilter(g('exp-img-view').value);
}

// Umumiy yuklab olish tugmasi
function doExport() {
  if (expFormat === 'excel') doExportJadval();
  else doExportImage();
}

// ── Rasm eksport ──────────────────────────────
async function doExportImage() {
  const view   = g('exp-img-view').value;    // 'sinf' | 'teacher'
  const filter = g('exp-img-filter').value;  // '' | aniq qiymat

  const stage = g('img-export-stage');
  stage.innerHTML = '';

  stage.innerHTML = `<div id="img-tbl-wrap"></div>`;

  const tblWrap = stage.querySelector('#img-tbl-wrap');

  if (view === 'sinf') {
    buildImgBySinf(tblWrap, filter);
  } else {
    buildImgByTeacher(tblWrap, filter);
  }

  // Yuklanayotgan holatini ko'rsatish
  const btn = g('exp-jad-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Rasm tayyorlanmoqda…';

  try {
    stage.style.left = '-9999px';
    document.body.appendChild(stage); // DOM da bo'lishi shart

    const canvas = await html2canvas(stage, {
      scale: 2.5,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: stage.scrollWidth,
      height: stage.scrollHeight,
      windowWidth: stage.scrollWidth + 64,
    });

    const link = document.createElement('a');
    const fname = filter
      ? `Jadval_${filter.replace(/\s+/g,'_')}.png`
      : (view === 'sinf' ? 'Jadval_Sinflar.png' : 'Jadval_Oqituvchilar.png');
    link.download = fname;
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();

    closeExportModal();
    toast('✅ Rasm yuklab olindi!', 'success');
  } catch (err) {
    toast('❌ Rasm yaratishda xatolik', 'error');
    console.error(err);
  }

  btn.disabled = false;
  btn.textContent = '🖼️ Rasm yuklab olish';
  stage.innerHTML = '';
}

function buildImgBySinf(wrap, filterS) {
  let sinflar = [...new Set(JADVALLAR.flatMap(j => j.sinflar))]
    .sort((a,b) => parseInt(a)-parseInt(b));
  if (filterS) sinflar = sinflar.filter(s => s === filterS);

  const COLORS = [
    ['#eff6ff','#bfdbfe','#1d4ed8'],
    ['#f0fdf4','#bbf7d0','#15803d'],
    ['#fdf4ff','#e9d5ff','#7e22ce'],
    ['#fff7ed','#fed7aa','#c2410c'],
    ['#f0fdfa','#99f6e4','#0f766e'],
    ['#fefce8','#fde68a','#b45309'],
  ];

  // Har bir fan o'z doimiy rangiga ega bo'lishi uchun fan→indeks xaritasi
  // trim() — DB da 'Matematika ' (bo'sh joy bilan) kabi nomlarni bir xil ko'rish uchun
  const allFans = [...new Set(JADVALLAR.map(j => (j.fan||'').trim()).filter(Boolean))].sort();
  const fanColorIdx = {};
  allFans.forEach((fan, i) => { fanColorIdx[fan] = i % COLORS.length; });

  const TH = `background:#1e1b4b;color:#ffffff;font-size:11px;font-weight:800;
    letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;
    padding:13px 16px;text-align:left;`;

  let html = `<table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr>
      <th style="${TH}min-width:110px;">Sinf</th>
      ${KUNLAR_IDX.map(k=>`<th style="${TH}">${KUN_NAMES[k]}</th>`).join('')}
    </tr></thead><tbody>`;

  sinflar.forEach((sinf, si) => {
    const bg = si % 2 === 0 ? '#fafafa' : '#ffffff';
    html += `<tr style="background:${bg};border-bottom:1px solid #e5e7eb;">
      <td style="padding:10px 14px;vertical-align:middle;">
        <span style="background:#ede9fe;color:#5b21b6;padding:3px 10px;border-radius:20px;
            font-size:11px;font-weight:700;white-space:nowrap;">${sinf}</span>
      </td>`;

    KUNLAR_IDX.forEach((kun) => {
      const lessons = JADVALLAR.filter(j => j.sinflar.includes(sinf) && j.kunlar.includes(kun));
      if (lessons.length) {
        html += `<td style="padding:8px 10px;vertical-align:top;">`;
        lessons.forEach(j => {
          // Rang fan nomiga qarab aniqlanadi, kun indeksiga emas
          const colorI = fanColorIdx[(j.fan||'').trim()] ?? 0;
          const [cbg, cbdr, ctxt] = COLORS[colorI];
          html += `<div style="background:${cbg};border:1px solid ${cbdr};border-radius:8px;
              padding:6px 9px;margin-bottom:4px;">
            <div style="font-weight:700;color:${ctxt};font-size:12px;">${j.fan||'—'}</div>
            <div style="color:#6b7280;font-size:10px;margin-top:2px;">${j.teacher_familiya} ${j.teacher_ism}</div>
            ${j.boshlanish ? `<div style="color:#6b7280;font-size:10px;">⏰ ${j.boshlanish}–${j.tugash}</div>` : ''}
          </div>`;
        });
        html += `</td>`;
      } else {
        html += `<td style="padding:8px 10px;color:#d1d5db;text-align:center;font-size:18px;">·</td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function buildImgByTeacher(wrap, filterT) {
  let jadvallar = JADVALLAR;
  if (filterT) jadvallar = jadvallar.filter(j => (j.teacher_familiya+' '+j.teacher_ism) === filterT);

  const teachers = [...new Map(jadvallar.map(j => [j.teacher_familiya+' '+j.teacher_ism, j])).values()];

  const COLORS = [
    ['#f0f9ff','#bae6fd','#0369a1'],
    ['#f0fdf4','#bbf7d0','#15803d'],
    ['#fdf4ff','#e9d5ff','#7e22ce'],
    ['#fff7ed','#fed7aa','#c2410c'],
    ['#fefce8','#fde68a','#b45309'],
    ['#f0fdfa','#99f6e4','#0f766e'],
  ];

  // O'qituvchi bo'yicha ko'rinishda: har bir o'qituvchi bitta fanga ega,
  // shuning uchun rang o'qituvchi faniga qarab beriladi (barqaror)
  // trim() — DB da 'Matematika ' (bo'sh joy bilan) kabi nomlarni bir xil ko'rish uchun
  const allFans = [...new Set(JADVALLAR.map(j => (j.fan||'').trim()).filter(Boolean))].sort();
  const fanColorIdx = {};
  allFans.forEach((fan, i) => { fanColorIdx[fan] = i % COLORS.length; });

  const TH = `background:#1e1b4b;color:#ffffff;font-size:11px;font-weight:800;
    letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;
    padding:13px 16px;text-align:left;`;

  let html = `<table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr>
      <th style="${TH}min-width:170px;">O'qituvchi</th>
      ${KUNLAR_IDX.map(k=>`<th style="${TH}">${KUN_NAMES[k]}</th>`).join('')}
    </tr></thead><tbody>`;

  teachers.forEach((tRef, ti) => {
    const tName = tRef.teacher_familiya + ' ' + tRef.teacher_ism;
    const tJad  = jadvallar.filter(j => j.teacher_familiya+' '+j.teacher_ism === tName);
    const bg    = ti % 2 === 0 ? '#fafafa' : '#ffffff';
    // O'qituvchi rangi uning faniga qarab (barcha kunlarda bir xil)
    const tColorI = fanColorIdx[(tRef.fan||'').trim()] ?? 0;
    const [cbg, cbdr, ctxt] = COLORS[tColorI];

    html += `<tr style="background:${bg};border-bottom:1px solid #e5e7eb;">
      <td style="padding:10px 14px;vertical-align:middle;">
        <div style="font-weight:700;color:#1e1b4b;font-size:13px;">${tName}</div>
        <div style="font-size:10px;color:#6b7280;margin-top:2px;">${tRef.fan||'—'}</div>
      </td>`;

    KUNLAR_IDX.forEach((kun) => {
      const lessons = tJad.filter(j => j.kunlar.includes(kun));
      if (lessons.length) {
        // Bir xil vaqtdagi sinflarni birlashtirish
        const grouped = [];
        lessons.forEach(j => {
          const key = (j.boshlanish||'')+'|'+(j.tugash||'');
          const found = grouped.find(g => g.key === key);
          if (found) found.sinflar = [...new Set([...found.sinflar, ...j.sinflar])];
          else grouped.push({ key, sinflar:[...j.sinflar], boshlanish:j.boshlanish, tugash:j.tugash });
        });
        html += `<td style="padding:8px 10px;vertical-align:top;">`;
        grouped.forEach(g => {
          html += `<div style="background:${cbg};border:1px solid ${cbdr};border-radius:8px;
              padding:6px 9px;margin-bottom:4px;">
            <div style="font-weight:700;color:${ctxt};font-size:12px;">${g.sinflar.join(', ')}</div>
            ${g.boshlanish ? `<div style="color:#6b7280;font-size:10px;">⏰ ${g.boshlanish}–${g.tugash}</div>` : ''}
          </div>`;
        });
        html += `</td>`;
      } else {
        html += `<td style="padding:8px 10px;color:#d1d5db;text-align:center;font-size:18px;">·</td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function selectExpJad(type, btn) {
  expJadType = type;
  document.querySelectorAll('#exp-jad-tabs .export-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  g('exp-jad-sinf').style.display    = type === 'sinf'    ? '' : 'none';
  g('exp-jad-teacher').style.display = type === 'teacher' ? '' : 'none';
  g('exp-jad-all').style.display     = type === 'all'     ? '' : 'none';
}

function doExportJadval() {
  const wb = XLSX.utils.book_new();

  if (expJadType === 'sinf') {
    const filterS = g('exp-sinf-sel').value;
    const sinflar = filterS
      ? [filterS]
      : [...new Set(JADVALLAR.flatMap(j => j.sinflar))].sort((a,b)=>parseInt(a)-parseInt(b));

    sinflar.forEach(sinf => {
      buildSinfSheet(wb, sinf);
    });
    if (!wb.SheetNames.length) { toast('⚠️ Ma\'lumot topilmadi', 'error'); return; }
    XLSX.writeFile(wb, `Jadval_Sinf${filterS||'_Barchasi'}.xlsx`);

  } else if (expJadType === 'teacher') {
    const filterT = g('exp-teacher-sel').value;
    const teachers = filterT
      ? [filterT]
      : [...new Set(JADVALLAR.map(j => j.teacher_familiya+' '+j.teacher_ism))];

    teachers.forEach(tName => {
      buildTeacherSheet(wb, tName);
    });
    if (!wb.SheetNames.length) { toast('⚠️ Ma\'lumot topilmadi', 'error'); return; }
    XLSX.writeFile(wb, `Jadval_Oqituvchi${filterT ? '_'+filterT.replace(/ /g,'_') : '_Barchasi'}.xlsx`);

  } else {
    // Umumiy — sinf bo'yicha + o'qituvchi bo'yicha
    const sinflar = [...new Set(JADVALLAR.flatMap(j => j.sinflar))].sort((a,b)=>parseInt(a)-parseInt(b));
    sinflar.forEach(s => buildSinfSheet(wb, s));
    const teachers = [...new Set(JADVALLAR.map(j => j.teacher_familiya+' '+j.teacher_ism))];
    teachers.forEach(t => buildTeacherSheet(wb, t));
    if (!wb.SheetNames.length) { toast('⚠️ Ma\'lumot topilmadi', 'error'); return; }
    XLSX.writeFile(wb, 'Haftalik_Dars_Jadvali.xlsx');
  }

  closeExportModal();
  toast('✅ Excel yuklab olindi!', 'success');
}

function buildSinfSheet(wb, sinf) {
  const rows = [['', ...KUN_NAMES.slice(1)]]; // Header
  const sinfJad = JADVALLAR.filter(j => j.sinflar.includes(sinf));
  if (!sinfJad.length) return;

  // Unique vaqtlar bo'yicha guruhlash
  const vaqtlar = [...new Set(sinfJad.map(j => j.boshlanish||''))].sort();

  vaqtlar.forEach(vaqt => {
    const row = [vaqt || 'Belgilanmagan'];
    KUNLAR_IDX.forEach(kun => {
      const lesson = sinfJad.find(j => j.kunlar.includes(kun) && (j.boshlanish||'') === vaqt);
      row.push(lesson ? `${lesson.fan||'—'}\n${lesson.teacher_familiya} ${lesson.teacher_ism}` : '—');
    });
    rows.push(row);
  });

  // Agar vaqtsiz jadvallar bo'lsa
  const noVaqt = sinfJad.filter(j => !j.boshlanish);
  if (noVaqt.length && !vaqtlar.includes('')) {
    KUNLAR_IDX.forEach((kun, ci) => {
      const lesson = noVaqt.find(j => j.kunlar.includes(kun));
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:14}, ...KUN_NAMES.slice(1).map(()=>({wch:22}))];
  const sheetName = (sinf.length > 31 ? sinf.slice(0,31) : sinf);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

function buildTeacherSheet(wb, tName) {
  const tJad = JADVALLAR.filter(j => j.teacher_familiya+' '+j.teacher_ism === tName);
  if (!tJad.length) return;

  const rows = [['Sinf(lar)', ...KUN_NAMES.slice(1)]];

  // Har bir jadval qatori
  tJad.forEach(j => {
    const row = [j.sinflar.join(', ')];
    KUNLAR_IDX.forEach(kun => {
      if (j.kunlar.includes(kun)) {
        row.push(j.boshlanish ? `${j.boshlanish}–${j.tugash}` : '✓');
      } else {
        row.push('—');
      }
    });
    rows.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:16}, ...KUN_NAMES.slice(1).map(()=>({wch:14}))];
  const sheetName = (tName.length > 31 ? tName.slice(0,31) : tName);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

// ─────────────────────────────────────────────
//  YORDAMCHI
// ─────────────────────────────────────────────

function setupChips(containerId, cls) {
  const cont = g(containerId); if (!cont) return;
  cont.querySelectorAll('.' + cls).forEach(c => {
    // sinf-chip larni o'tkazib yuboramiz — ular toggleSinfChip orqali boshqariladi
    if (cls === 'sinf-chip') return;
    c.addEventListener('click', () => c.classList.toggle('sel'));
  });
}

function setupVaqtInp(id) {
  const inp = g(id); if (!inp) return;
  inp.addEventListener('input', function() {
    const max = parseInt(this.max), v = parseInt(this.value);
    if (!isNaN(v)) { if(v>max) this.value=max; if(v<0) this.value=0; }
  });
  inp.addEventListener('blur', function() {
    if (this.value !== '') this.value = String(parseInt(this.value)||0).padStart(2,'0');
  });
}

function parseDays(str) {
  if (!str) return [];
  return String(str).split(',').map(Number).filter(n => n >= 1 && n <= 6);
}
function parseSinflar(str) {
  if (!str) return [];
  return String(str).split(',').map(s => s.trim()).filter(Boolean);
}

// ─── O'QUVCHILAR BIRIKTIRISH LOGIKASI ────────────────────────────────────────

// Joriy tanlangan sinf chip
let activeSinfChip = null;
// Har bir sinf uchun tanlangan o'quvchi IDlarini saqlaydigan Map
// { '5-sinf': Set([1, 2, 3]), '6-sinf': Set([4, 5]) }
const selectedOquvchilarMap = new Map();

// Joriy ko'rsatilgan sinfning checkbox holatini Map ga saqlash
function saveCurrentCheckboxState() {
  const cbs = g('b-oquvchilar-list').querySelectorAll('.oquvchi-cb');
  if (!cbs.length || !activeSinfChip) return;
  const ids = new Set([...cbs].filter(cb => cb.checked).map(cb => parseInt(cb.dataset.id)));
  selectedOquvchilarMap.set(activeSinfChip, ids);
}

// Sinf chip bosilganda — toggle + o'quvchilarni yuklash
async function toggleSinfChip(chipEl) {
  const sinf = chipEl.dataset.s;
  const isNowSel = !chipEl.classList.contains('sel');

  // Avval joriy sinfning checkbox holatini saqlash
  saveCurrentCheckboxState();

  // Chipsni toggle qilish
  chipEl.classList.toggle('sel', isNowSel);

  if (isNowSel) {
    activeSinfChip = sinf;
    await loadOquvchilarForSinf(sinf);
  } else {
    // Bu sinf deselect bo'ldi — uning saqlangan ma'lumotlarini o'chirish
    selectedOquvchilarMap.delete(sinf);

    // Hali tanlangan boshqa chip bormi?
    const stillSel = [...g('b-sinf-chips').querySelectorAll('.sinf-chip.sel')];
    if (stillSel.length) {
      activeSinfChip = stillSel[stillSel.length - 1].dataset.s;
      await loadOquvchilarForSinf(activeSinfChip);
    } else {
      activeSinfChip = null;
      g('b-oquvchilar-panel').style.display = 'none';
      g('b-oquvchilar-list').innerHTML = '';
    }
  }
}

// Berilgan sinf uchun o'quvchilarni yuklash va checkbox bilan ko'rsatish
async function loadOquvchilarForSinf(sinf) {
  const teacherVal = g('b-teacher').value;
  if (!teacherVal) return;

  const teacher = TEACHERS.find(t => t.familiya + ' ' + t.ism === teacherVal);
  if (!teacher) return;

  // O'qituvchining maktabini olamiz — teacher.maktablar dan, yoki login qilgan admin maktabidan
  const maktabId = (teacher.maktablar && teacher.maktablar.length > 0)
    ? teacher.maktablar[0].id
    : (U && U.maktabId ? U.maktabId : null);

  if (!maktabId) {
    g('b-oquvchilar-list').innerHTML = '<div style="color:var(--muted);font-size:13px;grid-column:1/-1;text-align:center;padding:12px;">Maktab topilmadi</div>';
    g('b-oquvchilar-panel').style.display = '';
    return;
  }

  g('b-sinf-label').textContent = sinf;
  g('b-oquvchilar-panel').style.display = '';
  g('b-oquvchilar-list').innerHTML = '<div style="color:var(--muted);font-size:13px;grid-column:1/-1;text-align:center;padding:12px;"><span class="spinner" style="display:inline-block;width:18px;height:18px;"></span> Yuklanmoqda...</div>';

  try {
    const BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://127.0.0.1:3001' : '';
    const token = localStorage.getItem('innovateit_token');
    const r = await fetch(
      `${BASE}/api/teachers/sinf-oquvchilar?sinf=${encodeURIComponent(sinf)}&maktabId=${maktabId}&teacherId=${teacher.id}`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    const d = await r.json();

    if (!d.ok) {
      g('b-oquvchilar-list').innerHTML = `<div style="color:#f87171;font-size:13px;grid-column:1/-1;text-align:center;padding:12px;">❌ ${d.error || 'Xatolik'}</div>`;
      return;
    }

    if (!d.oquvchilar.length) {
      g('b-oquvchilar-list').innerHTML = `<div style="color:var(--muted);font-size:13px;grid-column:1/-1;text-align:center;padding:12px;">Bu sinfda o'quvchi yo'q</div>`;
      updateSelectedCount();
      return;
    }

    // Map da saqlangan holatni olamiz (agar mavjud bo'lsa)
    const savedIds = selectedOquvchilarMap.get(sinf);

    g('b-oquvchilar-list').innerHTML = d.oquvchilar.map(o => {
      // Saqlangan holatni ustunlik berish — aks holda DB dan kelgan holat
      const isChecked = savedIds !== undefined
        ? savedIds.has(o.id)
        : o.biriktirilgan;
      return `
      <label class="oquvchi-check-item" style="
        display:flex;align-items:center;gap:8px;padding:7px 10px;
        border-radius:8px;cursor:pointer;transition:background .15s;
        background:${isChecked ? 'var(--accent-bg,rgba(99,102,241,0.08))' : 'transparent'};
      " onmouseenter="this.style.background='var(--hover-bg,rgba(0,0,0,0.04))'"
         onmouseleave="this.style.background='${isChecked ? 'var(--accent-bg,rgba(99,102,241,0.08))' : 'transparent'}'">
        <input type="checkbox" class="oquvchi-cb" data-id="${o.id}" data-sinf="${sinf}"
          ${isChecked ? 'checked' : ''}
          onchange="onOquvchiCbChange(this)"
          style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent,#6366f1);">
        <span style="font-size:13px;">${esc(o.familiya)} ${esc(o.ism)}</span>
      </label>`;
    }).join('');

    // Agar bu sinf uchun Map da yozuv yo'q bo'lsa (birinchi marta yuklanayapti),
    // DB dan kelgan holatni Map ga yozamiz
    if (!selectedOquvchilarMap.has(sinf)) {
      const initIds = new Set(d.oquvchilar.filter(o => o.biriktirilgan).map(o => o.id));
      selectedOquvchilarMap.set(sinf, initIds);
    }

    updateSelectedCount();
  } catch(e) {
    g('b-oquvchilar-list').innerHTML = `<div style="color:#f87171;font-size:13px;grid-column:1/-1;text-align:center;padding:12px;">❌ Server bilan aloqa yo'q</div>`;
  }
}

// Checkbox o'zgarganda Map ni yangilash va fon rangini o'zgartirish
function onOquvchiCbChange(cb) {
  const sinf = cb.dataset.sinf;
  const id   = parseInt(cb.dataset.id);
  if (!selectedOquvchilarMap.has(sinf)) selectedOquvchilarMap.set(sinf, new Set());
  if (cb.checked) selectedOquvchilarMap.get(sinf).add(id);
  else            selectedOquvchilarMap.get(sinf).delete(id);
  // Label fon rangini yangilash
  const label = cb.closest('label');
  if (label) label.style.background = cb.checked ? 'var(--accent-bg,rgba(99,102,241,0.08))' : 'transparent';
  updateSelectedCount();
}

function updateSelectedCount() {
  // Barcha tanlanganlar soni — barcha sinflar bo'yicha
  let total = 0, checked = 0;
  g('b-oquvchilar-list').querySelectorAll('.oquvchi-cb').forEach(cb => {
    total++;
    if (cb.checked) checked++;
  });
  const el = g('b-selected-count');
  // Barcha sinflardagi jami tanlangan soni ham ko'rsatish
  const allSelected = [...selectedOquvchilarMap.values()].reduce((acc, s) => acc + s.size, 0);
  if (el) el.textContent = total
    ? `${checked} / ${total} (jami ${allSelected} ta)`
    : '';
}

function selectAllOquvchilar(val) {
  const cbs = g('b-oquvchilar-list').querySelectorAll('.oquvchi-cb');
  cbs.forEach(cb => {
    cb.checked = val;
    const label = cb.closest('label');
    if (label) label.style.background = val ? 'var(--accent-bg,rgba(99,102,241,0.08))' : 'transparent';
  });
  // Map ni yangilash
  if (activeSinfChip) {
    if (!selectedOquvchilarMap.has(activeSinfChip)) selectedOquvchilarMap.set(activeSinfChip, new Set());
    if (val) cbs.forEach(cb => selectedOquvchilarMap.get(activeSinfChip).add(parseInt(cb.dataset.id)));
    else     selectedOquvchilarMap.get(activeSinfChip).clear();
  }
  updateSelectedCount();
}

function bl(btnId, spId, txtId, loading, txt) {
  if (btnId) g(btnId).disabled = loading;
  g(spId).style.display = loading ? 'inline-block' : 'none';
  g(txtId).textContent  = txt;
}
function padZ(v) { return String(parseInt(v)||0).padStart(2,'0'); }
function g(id)   { return document.getElementById(id); }
function esc(s)  { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

let toastT;
function toast(msg, type='') {
  const t=g('toast'); t.textContent=msg; t.className='toast show '+(type||'');
  clearTimeout(toastT); toastT=setTimeout(()=>{ t.className='toast'; },3000);
}