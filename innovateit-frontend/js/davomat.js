// ═══════════════════════════════════════════════════
//  InnovateIT School — Davomat  (davomat.js)
// ═══════════════════════════════════════════════════


const OYLAR  = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
const KUNLAR = ['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'];

const STATUSES = [
  { key: 'keldi',   emoji: '✅', title: 'Keldi'     },
  { key: 'kelmadi', emoji: '❌', title: 'Kelmadi'   },
  { key: 'sababli', emoji: '📋', title: 'Sababli'   },
  { key: 'kech',    emoji: '⏰', title: 'Kech keldi' },
];

// Foydalanuvchi ma'lumotlari (app.js dan sessionStorage orqali keladi)
let U  = null; // { username, parol, ism, isSuper, viewingUsername, viewingIsm }
let WU = null; // Haqiqiy ishlayotgan username (agar super admin boshqani ko'rsa)

// O'quvchilar va davomat holati
let STUDENTS          = []; // Faol o'quvchilar
let INACTIVE_STUDENTS = []; // Nofaol o'quvchilar
let attendance = {}; // { "Ism Familiya": "keldi"|"kelmadi"|"sababli"|"kech" }
let izohlar    = {}; // { "Ism Familiya": "izoh matni" }

// ─── Sana yordamchi funksiyalari ───
// "DD.MM.YYYY" → Date
function parseDDMMYYYY(str) {
  if (!str || typeof str !== 'string' || !str.includes('.')) return null;
  const parts = str.split('.');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const date = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T00:00:00`);
  return isNaN(date) ? null : date;
}
// "YYYY-MM-DD" → Date
function parseYYYYMMDD(str) {
  if (!str || typeof str !== 'string' || !str.includes('-')) return null;
  const date = new Date(str + 'T00:00:00');
  return isNaN(date) ? null : date;
}
// O'quvchining boshlash sanasini olish (boshlagan yoki qoshilgan)
function getStudentStartDate(s) {
  const b = s.boshlagan ? String(s.boshlagan).trim() : '';
  const q = s.date      ? String(s.date).trim()      : '';
  // boshlagan: YYYY-MM-DD yoki DD.MM.YYYY
  if (b) {
    if (b.includes('-')) return parseYYYYMMDD(b);
    if (b.includes('.')) return parseDDMMYYYY(b);
  }
  // qoshilgan (date): DD.MM.YYYY
  if (q) {
    if (q.includes('.')) return parseDDMMYYYY(q);
    if (q.includes('-')) return parseYYYYMMDD(q);
  }
  return null;
}
// Nofaol o'quvchining tugash sanasini olish — har ikkala formatni qabul qiladi
function getStudentEndDate(s) {
  if (!s.chiqgan) return null;
  const str = String(s.chiqgan).trim();
  if (!str) return null;
  // DD.MM.YYYY
  if (str.includes('.')) return parseDDMMYYYY(str);
  // YYYY-MM-DD (input[type=date] dan kelganda)
  if (str.includes('-')) return parseYYYYMMDD(str);
  return null;
}

/**
 * Berilgan sanada ko'rinishi kerak bo'lgan o'quvchilar ro'yxatini qaytaradi.
 * Faol o'quvchilar: boshlagan <= date
 * Nofaol o'quvchilar: boshlagan <= date <= chiqgan
 */
function getStudentsForDate(date) {
  const d = new Date(date); d.setHours(0,0,0,0);
  const list = [];
  // Faol o'quvchilar — boshlagan sanasi o'tgan bo'lishi kerak
  STUDENTS.forEach(s => {
    const start = getStudentStartDate(s);
    if (!start || start <= d) list.push(s);
  });
  // Nofaol o'quvchilar — shu sana ularning faol davriga tushsa
  INACTIVE_STUDENTS.forEach(s => {
    const start = getStudentStartDate(s);
    const end   = getStudentEndDate(s);
    if (end && d <= end && (!start || start <= d)) {
      list.push({ ...s, _nofaol: true });
    }
  });
  return list;
}

// Joriy ko'rilayotgan sana
const TODAY = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
let currentDate = skipSunday(new Date(TODAY));

let pendingIzoh = null; // { key, btnEl }

// ─────────────────────────────────────────────
//  YUKLANGANDA
// ─────────────────────────────────────────────
// ─── Sticky bar balandliklarini dinamik hisoblash ───
function updateStickyHeights() {
  const topbar  = document.querySelector('.topbar');
  const datebar = document.querySelector('.date-bar');
  const statsbar = document.querySelector('.stats-bar');
  const root = document.documentElement;
  if (topbar)   root.style.setProperty('--topbar-h',   topbar.offsetHeight   + 'px');
  if (datebar)  root.style.setProperty('--datebar-h',  datebar.offsetHeight  + 'px');
  if (statsbar) root.style.setProperty('--statsbar-h', statsbar.offsetHeight + 'px');
}
window.addEventListener('resize', updateStickyHeights);

window.addEventListener('DOMContentLoaded', async () => {
  // Sahifa yuklangandan keyin haqiqiy balandliklarni o'lchash
  requestAnimationFrame(updateStickyHeights);
  // Session dan foydalanuvchini olish
  try {
    const saved = sessionStorage.getItem('iit_davomat_user');
    if (!saved) { window.location.href = 'index.html'; return; }
    U = JSON.parse(saved);
  } catch (e) { window.location.href = 'index.html'; return; }

  // Kimning davomati ko'rsatiladi?
  // Yangi tizimda: super admin maktab tanlagan bo'lsa, U.username = maktab admin username
  // isSuperProxy belgisi orqali aniqlaymiz
  WU = { username: U.username, ism: U.ism };

  // Badge
  const badge = g('dav-badge');
  if (U.isSuperProxy) {
    badge.textContent = '🏫 ' + U.ism;
    badge.classList.add('super');
  } else {
    badge.textContent = U.ism;
  }

  // Sana picker max = bugun
  g('date-picker').max = dateStr(TODAY);

  setDateUI(currentDate);
  updateNextBtn();

  // O'quvchilarni yuklash
  await loadStudents();
  // Shu sananing mavjud davomatini yuklash
  await loadDavomat(currentDate);
});

// ─────────────────────────────────────────────
//  NAVIGATSIYA
// ─────────────────────────────────────────────
function goBack() {
  window.location.href = 'index.html';
}

// ─────────────────────────────────────────────
//  SANA BOSHQARUVI
// ─────────────────────────────────────────────
function skipSunday(d) {
  const nd = new Date(d); nd.setHours(0,0,0,0);
  if (nd.getDay() === 0) nd.setDate(nd.getDate() - 1); // Oldinga emas, orqaga
  return nd;
}

function dateStr(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function formatDateDisplay(d) {
  return `${d.getDate()}-${OYLAR[d.getMonth()]}, ${d.getFullYear()}`;
}

function setDateUI(d) {
  g('date-display').textContent = formatDateDisplay(d);
  g('date-sub').textContent     = KUNLAR[d.getDay()];
  g('date-picker').value        = dateStr(d);
}

async function changeDate(dir) {
  const nd = new Date(currentDate);
  nd.setDate(nd.getDate() + dir);
  // Yakshanbani o'tkazib yuborish
  if (nd.getDay() === 0) nd.setDate(nd.getDate() + dir);
  if (nd > TODAY) return;

  currentDate = nd;
  attendance  = {};
  izohlar     = {};
  setDateUI(currentDate);
  updateNextBtn();
  render();
  await loadDavomat(currentDate);
}

async function onDatePick() {
  const val = g('date-picker').value;
  if (!val) return;
  const d = new Date(val + 'T00:00:00');
  if (d.getDay() === 0) {
    toast('⚠️ Yakshanba tanlash mumkin emas', 'error');
    g('date-picker').value = dateStr(currentDate); return;
  }
  if (d > TODAY) {
    toast('⚠️ Kelajak sana tanlash mumkin emas', 'error');
    g('date-picker').value = dateStr(currentDate); return;
  }
  currentDate = d;
  attendance  = {};
  izohlar     = {};
  setDateUI(currentDate);
  updateNextBtn();
  render();
  await loadDavomat(currentDate);
}

function updateNextBtn() {
  const nd = new Date(currentDate);
  nd.setDate(nd.getDate() + 1);
  if (nd.getDay() === 0) nd.setDate(nd.getDate() + 1);
  g('btn-next').disabled = nd > TODAY;
}

// ─────────────────────────────────────────────
//  MA'LUMOT YUKLASH
// ─────────────────────────────────────────────
async function loadStudents() {
  g('loading-ov').style.display = 'flex';
  try {
    // Faol va nofaol o'quvchilarni parallel yuklash
    const [active, inactive] = await Promise.all([
      api.getStudents({ username: U.username, parol: U.parol }),
      api.getInactiveStudents({ username: U.username, parol: U.parol })
    ]);
    if (active.ok) {
      STUDENTS = active.students;
    } else {
      toast('❌ ' + active.error, 'error');
    }
    if (inactive.ok) {
      INACTIVE_STUDENTS = inactive.students;
    }
    render();
  } catch (e) { toast("❌ Yuklashda xatolik", 'error'); }
  g('loading-ov').style.display = 'none';
}

async function loadDavomat(date) {
  try {
    const params = {
      username: U.username,
      parol:    U.parol,
      sana:     dateStr(date)
    };
    const d = await api.getDavomat(params);
    if (d.ok && d.records.length) {
      d.records.forEach(r => {
        attendance[r.ism] = r.status;
        if (r.izoh) izohlar[r.ism] = r.izoh;
      });
      render();
      // Toast faqat birinchi yuklanganda, sana o'zgartirish vaqtida emas
    }
  } catch (e) {}
}

// ─────────────────────────────────────────────
//  RENDER — admin uchun sinf kartalari endi
//  ko'rsatilmaydi, faqat statistika yangilanadi
// ─────────────────────────────────────────────
function render() {
  const visibleStudents = getStudentsForDate(currentDate);
  updateStats(visibleStudents);
}

function countStatuses(list) {
  const c = { keldi: 0, kelmadi: 0, sababli: 0, kech: 0 };
  list.forEach(s => {
    const key = s.familiya + ' ' + s.ism; // saqlanish tartibi: "Familiya Ism"
    const st  = attendance[key];
    if (st && c[st] !== undefined) c[st]++;
  });
  return c;
}

// ─────────────────────────────────────────────
//  STATUS BELGILASH — FAQAT KO'RISH REJIMI
//  (Endi davomatni o'qituvchilar o'z panelidan
//  belgilaydi. Maktab admin faqat ko'ra oladi,
//  tahrirlash/yozish imkoniyati yo'q.)
// ─────────────────────────────────────────────
function setStatus(key, status, btn) {
  toast('👁 Faqat ko\'rish rejimi — davomatni faqat o\'qituvchi o\'z panelida belgilaydi', 'error');
}

// ─────────────────────────────────────────────
//  STATISTIKA
// ─────────────────────────────────────────────
function updateStats(visibleList) {
  const list = visibleList || getStudentsForDate(currentDate);
  const c = { keldi: 0, kelmadi: 0, sababli: 0, kech: 0 };
  Object.values(attendance).forEach(s => { if (s && c[s] !== undefined) c[s]++; });
  g('st-keldi').textContent   = c.keldi;
  g('st-kelmadi').textContent = c.kelmadi;
  g('st-sababli').textContent = c.sababli;
  g('st-kech').textContent    = c.kech;
  g('st-total').textContent   = list.length;
}

// ─────────────────────────────────────────────
//  STATUS DETAIL MODAL
// ─────────────────────────────────────────────
const STATUS_META = {
  keldi:   { emoji: '✅', title: 'Keldi',      cls: 'k', color: '#15803d' },
  kelmadi: { emoji: '❌', title: 'Kelmadi',    cls: 'x', color: '#dc2626' },
  sababli: { emoji: '📋', title: 'Sababli',    cls: 's', color: '#d97706' },
  kech:    { emoji: '⏰', title: 'Kech keldi', cls: 'l', color: '#7c3aed' },
};

function showStatusDetail(status) {
  const meta = STATUS_META[status];
  if (!meta) return;

  // O'sha statusdagi o'quvchilarni yig'ish
  const list = getStudentsForDate(currentDate)
    .filter(s => attendance[s.familiya + ' ' + s.ism] === status)
    .map(s => ({ name: s.familiya + ' ' + s.ism, sinf: s.sinf, izoh: izohlar[s.familiya + ' ' + s.ism] || '' }));

  g('sd-emoji').textContent  = meta.emoji;
  g('sd-title').textContent  = meta.title;

  const badge = g('sd-badge');
  badge.textContent  = list.length + ' nafar';
  badge.className    = 'status-detail-badge ' + meta.cls;

  if (!list.length) {
    g('sd-body').innerHTML = `<div class="status-detail-empty">Hozircha hech kim ${meta.title.toLowerCase()} emas</div>`;
  } else {
    g('sd-body').innerHTML = list.map((item, i) => `
      <div class="status-detail-item">
        <span class="status-detail-num">${i + 1}</span>
        <div class="status-detail-info">
          <div class="status-detail-name">${item.name}</div>
          <div class="status-detail-sinf">${item.sinf.toLowerCase().includes('sinf') ? item.sinf : item.sinf + '-sinf'}</div>
          ${item.izoh ? `<div class="status-detail-izoh">💬 ${item.izoh}</div>` : ''}
        </div>
      </div>`).join('');
  }

  const modal = g('status-detail-modal');
  modal.classList.add('open');
  modal.style.display = 'flex';
}

function closeStatusDetail() {
  const modal = g('status-detail-modal');
  modal.style.display = 'none';
  modal.classList.remove('open');
}

// ─────────────────────────────────────────────
//  SAQLASH
// ─────────────────────────────────────────────
function confirmSave() {
  const visibleStudents = getStudentsForDate(currentDate);
  const total  = visibleStudents.length;
  const marked = Object.keys(attendance).filter(k => {
    return attendance[k] && visibleStudents.some(s => s.ism + ' ' + s.familiya === k);
  }).length;

  if (!marked) { toast('⚠️ Hech narsa belgilanmadi', 'error'); return; }
  if (marked < total) {
    toast(`⚠️ Hali ${total - marked} ta o'quvchi belgilanmadi`, 'error');
    return;
  }

  const c = { keldi: 0, kelmadi: 0, sababli: 0, kech: 0 };
  visibleStudents.forEach(s => {
    const st = attendance[s.ism + ' ' + s.familiya];
    if (st && c[st] !== undefined) c[st]++;
  });

  g('modal-desc').innerHTML = `
    <span style="font-weight:600">${formatDateDisplay(currentDate)}</span> — ${KUNLAR[currentDate.getDay()]}<br>
    <span style="color:var(--muted);font-size:12px">${marked} / ${total} o'quvchi belgilangan</span>`;

  g('modal-stats').innerHTML = `
    <span class="dav-modal-stat k">✅ Keldi: ${c.keldi}</span>
    <span class="dav-modal-stat x">❌ Kelmadi: ${c.kelmadi}</span>
    <span class="dav-modal-stat s">📋 Sababli: ${c.sababli}</span>
    <span class="dav-modal-stat l">⏰ Kech: ${c.kech}</span>`;

  g('confirm-modal').style.display = 'flex';
}

function closeModal() { g('confirm-modal').style.display = 'none'; }

async function doSave() {
  // Shu sanada ko'rinishi kerak bo'lgan o'quvchilar
  const visibleStudents = getStudentsForDate(currentDate);
  const records = visibleStudents.map(s => {
    const key    = s.ism + ' ' + s.familiya;
    const status = attendance[key] || '';
    return { sinf: s.sinf, ism: key, status, izoh: izohlar[key] || '' };
  }).filter(r => r.status); // Faqat belgilanganlari

  bl('btn-confirm', 'save-spinner', 'save-txt', true, 'Saqlanmoqda…');
  try {
    const r = await api.saveDavomat({
      username: U.username,
      parol:    U.parol,
      sana:     dateStr(currentDate),
      records:  JSON.stringify(records)
    });
    if (r.ok) {
      closeModal();
      toast(`✅ ${r.saved} ta yozuv saqlandi!`, 'success');
    } else toast('❌ ' + r.error, 'error');
  } catch (e) { toast('❌ Xatolik yuz berdi', 'error'); }
  bl('btn-confirm', 'save-spinner', 'save-txt', false, 'Ha, saqlash');
}

// ─────────────────────────────────────────────
//  EXCEL EXPORT
// ─────────────────────────────────────────────
let exportType = 'bugun';

function openExportModal() {
  exportType = 'bugun';
  const now = new Date();
  // Oylik picker
  g('exp-month-pick').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  g('exp-month-pick').max   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  // Davr: joriy oy 1-kuni — bugun (DD.MM.YYYY formatida)
  const y = now.getFullYear();
  const m = String(now.getMonth()+1).padStart(2,'0');
  const d = String(now.getDate()).padStart(2,'0');
  g('exp-from').value = `01.${m}.${y}`;
  g('exp-to').value   = `${d}.${m}.${y}`;
  updateDavrPreview();
  updateBugunPreview();
  g('export-modal').style.display = 'flex';
}

// DD.MM.YYYY text inputni avtomatik formatlash (raqam kiritganda nuqta qo'shish)
function onDavrInput(el) {
  let v = el.value.replace(/[^\d.]/g, '');
  // Nuqtalarni avtomatik qo'shish: 2 ta raqamdan keyin
  const digits = v.replace(/\./g, '');
  if (digits.length >= 3 && !v.includes('.')) {
    v = digits.slice(0,2) + '.' + digits.slice(2);
  }
  if (digits.length >= 5) {
    const parts = v.split('.');
    if (parts.length === 2) v = parts[0] + '.' + parts[1].slice(0,2) + '.' + digits.slice(4);
    if (parts.length >= 3) v = parts[0].slice(0,2) + '.' + parts[1].slice(0,2) + '.' + digits.slice(4,8);
  }
  el.value = v;
  updateDavrPreview();
}

// Davr inputlar validatsiyasi va preview
function updateDavrPreview() {
  const fromVal = (g('exp-from').value || '').trim();
  const toVal   = (g('exp-to').value   || '').trim();
  const prevEl  = g('exp-davr-preview');
  if (!prevEl) return;

  const ddmmyyyy = /^\d{2}\.\d{2}\.\d{4}$/;
  const fromOk = ddmmyyyy.test(fromVal);
  const toOk   = ddmmyyyy.test(toVal);

  if (!fromOk && !toOk) { prevEl.innerHTML = ''; return; }
  if (!fromOk || !toOk) {
    prevEl.innerHTML = `<span style="color:#9ca3af;">DD.MM.YYYY formatida kiriting</span>`;
    return;
  }
  // YYYY-MM-DD ga o'girib taqqoslash
  const fromISO = fromVal.split('.').reverse().join('-');
  const toISO   = toVal.split('.').reverse().join('-');
  if (fromISO > toISO) {
    prevEl.innerHTML = `<span style="color:#dc2626;">⚠️ Boshlanish sanasi tugash sanasidan katta</span>`;
  } else {
    prevEl.innerHTML = `<span style="color:#16a34a;font-size:13px;font-weight:500;">✅ ${fromVal} — ${toVal}</span>`;
  }
}

// DD.MM.YYYY → YYYY-MM-DD (API uchun)
function ddmmToISO(v) {
  if (!v || !v.includes('.')) return v;
  return v.split('.').reverse().join('-');
}

function closeExportModal() {
  g('export-modal').style.display = 'none';
}

function selectExportType(type, btn) {
  exportType = type;
  document.querySelectorAll('.export-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  g('exp-bugun').style.display = type === 'bugun'  ? '' : 'none';
  g('exp-oylik').style.display = type === 'oylik'  ? '' : 'none';
  g('exp-davr').style.display  = type === 'davr'   ? '' : 'none';
  if (type === 'bugun') updateBugunPreview();
}

function updateBugunPreview() {
  const c = { keldi: 0, kelmadi: 0, sababli: 0, kech: 0 };
  Object.values(attendance).forEach(s => { if (c[s] !== undefined) c[s]++; });
  const total = Object.values(attendance).filter(Boolean).length;
  g('exp-bugun-preview').innerHTML = total
    ? `📅 <span>${formatDateDisplay(currentDate)}</span> &nbsp;·&nbsp; `
      + `<span class="exp-stat">${total}</span> o'quvchi &nbsp;`
      + `✅<span class="exp-stat">${c.keldi}</span> `
      + `❌<span class="exp-stat">${c.kelmadi}</span> `
      + `📋<span class="exp-stat">${c.sababli}</span> `
      + `⏰<span class="exp-stat">${c.kech}</span>`
    : `<span style="color:var(--muted)">Bugun uchun davomat belgilanmagan</span>`;
}

async function doExport() {
  let from, to, filename;
  const now = new Date();

  if (exportType === 'bugun') {
    from = dateStr(currentDate);
    to   = dateStr(currentDate);
    filename = `Davomat_${from}`;
  } else if (exportType === 'oylik') {
    const mp = g('exp-month-pick').value;
    if (!mp) { toast('⚠️ Oy tanlang', 'error'); return; }
    const [y, m] = mp.split('-');
    from = `${y}-${m}-01`;
    const lastDay = new Date(+y, +m, 0).getDate();
    to   = `${y}-${m}-${String(lastDay).padStart(2,'0')}`;
    filename = `Davomat_${OYLAR[+m-1]}_${y}`;
  } else {
    from = g('exp-from').value.trim();
    to   = g('exp-to').value.trim();
    const ddmmyyyy = /^\d{2}\.\d{2}\.\d{4}$/;
    if (!from || !to)           { toast('⚠️ Sanalarni kiriting', 'error'); return; }
    if (!ddmmyyyy.test(from))   { toast('⚠️ Boshlanish: DD.MM.YYYY formatida kiriting', 'error'); return; }
    if (!ddmmyyyy.test(to))     { toast('⚠️ Tugash: DD.MM.YYYY formatida kiriting', 'error'); return; }
    const fromISO = ddmmToISO(from);
    const toISO   = ddmmToISO(to);
    if (fromISO > toISO)        { toast('⚠️ Boshlanish sanasi katta bo\'lishi mumkin emas', 'error'); return; }
    filename = `Davomat_${from}_${to}`;
    from = fromISO;
    to   = toISO;
  }

  // Agar bugungi — API chaqirmaylik, memory dan olamiz
  let records;
  if (exportType === 'bugun' && Object.keys(attendance).length) {
    records = getStudentsForDate(currentDate)
      .filter(s => attendance[s.ism + ' ' + s.familiya])
      .map(s => {
        const key = s.ism + ' ' + s.familiya;
        return { sana: dateStr(currentDate).split('-').reverse().join('.'), sinf: s.sinf, ism: key, status: attendance[key], izoh: izohlar[key]||'' };
      });
  } else {
    // API dan olish
    bl('btn-do-export','exp-spinner','exp-txt',true,'Yuklanmoqda…');
    try {
      const d = await api.getDavomatRange({ username:U.username, parol:U.parol, from, to });
      if (!d.ok) { toast('❌ ' + d.error, 'error'); bl('btn-do-export','exp-spinner','exp-txt',false,'⬇ Yuklab olish'); return; }
      records = d.records;
    } catch(e) { toast('❌ Xatolik', 'error'); bl('btn-do-export','exp-spinner','exp-txt',false,'⬇ Yuklab olish'); return; }
    bl('btn-do-export','exp-spinner','exp-txt',false,'⬇ Yuklab olish');
  }

  if (!records.length) { toast('⚠️ Bu davr uchun ma\'lumot topilmadi', 'error'); return; }

  buildExcel(records, filename, from, to);
  closeExportModal();
  toast('✅ Excel fayl yuklab olindi!', 'success');
}

function buildExcel(records, filename, from, to) {
  const wb = XLSX.utils.book_new();
  const STATUS_LABEL = { keldi:'Keldi', kelmadi:'Kelmadi', sababli:'Sababli', kech:'Kech keldi' };

  if (exportType === 'bugun') {
    // ─── 1 SHEET: Bugungi jadval ───
    const rows = [['#', 'Sinf', 'Ism Familiya', 'Status', 'Izoh']];
    records.forEach((r, i) => rows.push([i+1, r.sinf, r.ism, STATUS_LABEL[r.status]||r.status, r.izoh]));

    // Xulosa qatori
    const c = { keldi:0, kelmadi:0, sababli:0, kech:0 };
    records.forEach(r => { if(c[r.status]!==undefined) c[r.status]++; });
    rows.push([]);
    rows.push(['', '', 'JAMI:', records.length, '']);
    rows.push(['', '', 'Keldi:', c.keldi, '']);
    rows.push(['', '', 'Kelmadi:', c.kelmadi, '']);
    rows.push(['', '', 'Sababli:', c.sababli, '']);
    rows.push(['', '', 'Kech keldi:', c.kech, '']);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:4},{wch:10},{wch:24},{wch:12},{wch:30}];
    XLSX.utils.book_append_sheet(wb, ws, 'Davomat');

  } else {
    // ─── Ko'p kunli: har sinf uchun alohida sheet ───
    // 1. Umumiy sheet — barcha yozuvlar
    const allRows = [['Sana', 'Sinf', 'Ism Familiya', 'Status', 'Izoh']];
    records.forEach(r => allRows.push([r.sana, r.sinf, r.ism, STATUS_LABEL[r.status]||r.status, r.izoh]));
    const wsAll = XLSX.utils.aoa_to_sheet(allRows);
    wsAll['!cols'] = [{wch:12},{wch:10},{wch:24},{wch:12},{wch:30}];
    XLSX.utils.book_append_sheet(wb, wsAll, 'Barchasi');

    // 2. Har sinf uchun kross-jadval (o'quvchi × sana)
    const sinflar = [...new Set(records.map(r => r.sinf))].sort((a,b)=>parseInt(a)-parseInt(b));

    sinflar.forEach(sinf => {
      const sinfRecs = records.filter(r => r.sinf === sinf);
      const sanalar  = [...new Set(sinfRecs.map(r => r.sana))].sort((a,b) => {
        const pa = a.split('.').reverse().join('-');
        const pb = b.split('.').reverse().join('-');
        return pa > pb ? 1 : -1;
      });
      const students = [...new Set(sinfRecs.map(r => r.ism))].sort();

      // Header: Ism | Sana1 | Sana2 | ... | Keldi_% | Kelmadi_%
      const header = ['Ism Familiya', ...sanalar, 'Keldi', 'Kelmadi', 'Sababli', 'Kech', 'Davomat %'];
      const rows = [header];

      students.forEach(ism => {
        const row = [ism];
        const cnt = { keldi:0, kelmadi:0, sababli:0, kech:0 };
        sanalar.forEach(sana => {
          const rec = sinfRecs.find(r => r.ism === ism && r.sana === sana);
          const st  = rec ? (STATUS_LABEL[rec.status] || rec.status) : '—';
          row.push(st);
          if (rec && cnt[rec.status] !== undefined) cnt[rec.status]++;
        });
        const total = sanalar.length;
        const pct   = total ? Math.round((cnt.keldi + cnt.kech) / total * 100) : 0;
        row.push(cnt.keldi, cnt.kelmadi, cnt.sababli, cnt.kech, pct + '%');
        rows.push(row);
      });

      // Kunlik xulosa qatori
      const sumRow = ['JAMI'];
      sanalar.forEach(sana => {
        const daySt = sinfRecs.filter(r => r.sana === sana);
        const k = daySt.filter(r => r.status==='keldi').length;
        sumRow.push(`${k}/${daySt.length}`);
      });
      sumRow.push('','','','','');
      rows.push(sumRow);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const colW = [{wch:24}, ...sanalar.map(()=>({wch:10})), {wch:7},{wch:8},{wch:7},{wch:5},{wch:10}];
      ws['!cols'] = colW;

      const sheetName = sinf.length > 31 ? sinf.slice(0,31) : sinf;
      XLSX.utils.book_append_sheet(wb, ws, sheetName + '-sinf');
    });

    // 3. Umumiy statistika sheet
    const statRows = [['Sinf', 'Jami dars', 'Umumiy davomat', 'Keldi', 'Kelmadi', 'Sababli', 'Kech', 'Davomat %']];
    sinflar.forEach(sinf => {
      const sr = records.filter(r => r.sinf === sinf);
      const c  = {keldi:0,kelmadi:0,sababli:0,kech:0};
      sr.forEach(r => { if(c[r.status]!==undefined) c[r.status]++; });
      const total = sr.length;
      const pct   = total ? Math.round((c.keldi+c.kech)/total*100) : 0;
      statRows.push([sinf, total, c.keldi+c.kech, c.keldi, c.kelmadi, c.sababli, c.kech, pct+'%']);
    });
    const wsStat = XLSX.utils.aoa_to_sheet(statRows);
    wsStat['!cols'] = [{wch:12},{wch:10},{wch:14},{wch:7},{wch:8},{wch:7},{wch:5},{wch:10}];
    XLSX.utils.book_append_sheet(wb, wsStat, 'Statistika');
  }

  XLSX.writeFile(wb, filename + '.xlsx');
}

// ─────────────────────────────────────────────
//  YORDAMCHI FUNKSIYALAR
// ─────────────────────────────────────────────

function bl(btnId, spId, txtId, loading, txt) {
  g(btnId).disabled           = loading;
  g(spId).style.display       = loading ? 'inline-block' : 'none';
  g(txtId).textContent        = txt;
}

function g(id)      { return document.getElementById(id); }
function esc(s)     { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function safeId(s)  { return s.replace(/[^a-zA-Z0-9]/g, '_'); }

let toastT;
function toast(msg, type = '') {
  const t = g('toast');
  t.textContent = msg; t.className = 'toast show ' + type;
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 3000);
}