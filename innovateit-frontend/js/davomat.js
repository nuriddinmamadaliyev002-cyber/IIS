// ═══════════════════════════════════════════════════
//  InnovateIT School — Davomat  (davomat.js)
// ═══════════════════════════════════════════════════

const OYLAR  = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
const KUNLAR = ['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'];

const STATUS_META = {
  keldi:   { label: 'Keldi',      badge: 'keldi'   },
  kelmadi: { label: 'Kelmadi',    badge: 'kelmadi' },
  sababli: { label: 'Sababli',    badge: 'sababli' },
  kech:    { label: 'Kech keldi', badge: 'kech'    },
};

// Foydalanuvchi ma'lumotlari (app.js dan sessionStorage orqali keladi)
let U  = null; // { username, parol, ism, isSuper, viewingUsername, viewingIsm }
let WU = null; // Haqiqiy ishlayotgan username (agar super admin boshqani ko'rsa)

// O'quvchilar va davomat holati
let STUDENTS          = []; // Faol o'quvchilar
let INACTIVE_STUDENTS = []; // Nofaol o'quvchilar
let attendance = {}; // { "Ism Familiya": "keldi"|"kelmadi"|"sababli"|"kech" }
let izohlar    = {}; // { "Ism Familiya": "izoh matni" }

// Dars jadvali — bitta yozuv = bitta o'qituvchi darsi/guruhi
// (bir nechta sinf birgalikda bitta guruhda o'qishi mumkin, masalan "6-sinf,8-sinf")
// [{ fan, sinflar:[...], kunlar:[1..6], boshlanish, tugash, teacher }]
let JADVALLAR = [];

function parseSinflarList(str) {
  if (!str) return [];
  return String(str).split(',').map(s => s.trim()).filter(Boolean);
}
function parseKunlarList(str) {
  if (!str) return [];
  return String(str).split(',').map(Number).filter(n => n >= 1 && n <= 6);
}
// "8-sinf" → "8" ko'rinishiga keltirib solishtirish uchun
function normalizeSinf(s) {
  return String(s || '').toLowerCase().replace(/-?sinf$/i, '').trim();
}

// Berilgan sanada (hafta kuniga qarab) o'tkaziladigan darslar (guruhlar) ro'yxati
function getSessionsForDate(date) {
  const weekday = date.getDay(); // 1=Dushanba ... 6=Shanba
  if (weekday < 1 || weekday > 6) return [];
  return JADVALLAR
    .filter(j => j.kunlar.includes(weekday))
    .sort((a, b) => (a.boshlanish || '').localeCompare(b.boshlanish || ''));
}

// Vaqt oralig'ini "08:00–08:45" ko'rinishida qaytaradi
function formatVaqt(j) {
  if (j.boshlanish && j.tugash) return `${j.boshlanish}–${j.tugash}`;
  if (j.boshlanish) return j.boshlanish;
  return '';
}

// Jadval filter/qidiruv holati
let activeFilter = null; // null | 'keldi' | 'kelmadi' | 'sababli' | 'kech'

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

// ─────────────────────────────────────────────
//  YUKLANGANDA
// ─────────────────────────────────────────────
// ─── Sticky bar balandliklarini dinamik hisoblash ───
function updateStickyHeights() {
  const topbar  = document.querySelector('.topbar');
  const datebar = document.querySelector('.date-bar');
  const root = document.documentElement;
  if (topbar)   root.style.setProperty('--topbar-h',   topbar.offsetHeight   + 'px');
  if (datebar)  root.style.setProperty('--datebar-h',  datebar.offsetHeight  + 'px');
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

  // O'quvchilarni va dars jadvalini parallel yuklash
  await Promise.all([loadStudents(), loadJadval()]);
  // Shu sananing mavjud davomatini yuklash
  await loadDavomat(currentDate);
});

// ─────────────────────────────────────────────
//  NAVIGATSIYA
// ─────────────────────────────────────────────
function goBack() {
  window.location.href = 'index.html';
}

// ✅ Hamburger menyu: "O'quvchilar" guruhi ichidan to'g'ridan-to'g'ri
// qisqa yo'llar (index.html'dagi bilan bir xil xatti-harakat)
function openNofaolFromDavomat() {
  const isProxy = U.isSuper && U.viewingUsername;
  sessionStorage.setItem('iit_nofaol_user', JSON.stringify({
    username:     isProxy ? U.viewingUsername : U.username,
    parol:        U.parol,
    ism:          isProxy ? U.viewingIsm : U.ism,
    isSuper:      U.isSuper && !isProxy,
    isSuperProxy: !!isProxy
  }));
  window.location.href = 'nofaol.html';
}

function buildTeacherUserFromDavomat() {
  const isProxy = U.isSuper && U.viewingUsername;
  if (!U.isSuper) return { ism: U.ism, isSuper: false, isSuperProxy: false, maktabId: null };
  if (isProxy)     return { ism: U.viewingIsm, isSuper: false, isSuperProxy: true, superIsm: U.ism, maktabId: null };
  return { username: U.username, parol: U.parol, ism: U.ism, isSuper: true };
}
function openTeachersFromDavomat() {
  sessionStorage.setItem('iit_teacher_user', JSON.stringify(buildTeacherUserFromDavomat()));
  window.location.href = 'oqituvchilar.html';
}
function openTeachersJadvalFromDavomat() {
  const tu = buildTeacherUserFromDavomat();
  sessionStorage.setItem('iit_jadval_user', JSON.stringify({ ...tu, maktabId: tu.maktabId || null }));
  window.location.href = 'dars-jadvali.html';
}
function openTeachersDavomatFromDavomat() {
  sessionStorage.setItem('iit_teacher_dav_user', JSON.stringify(buildTeacherUserFromDavomat()));
  window.location.href = 'oqituvchilar-davomat.html';
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

async function loadJadval() {
  try {
    const d = await api.getJadvallar({ username: U.username, parol: U.parol });
    if (d.ok) {
      JADVALLAR = d.jadvallar.map(j => ({
        fan:        j.fan,
        sinflar:    parseSinflarList(j.sinflar),
        kunlar:     parseKunlarList(j.kunlar),
        boshlanish: j.boshlanish || '',
        tugash:     j.tugash || '',
        teacher:    [j.teacher_familiya, j.teacher_ism].filter(Boolean).join(' '),
      }));
      render();
    }
  } catch (e) {}
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
    }
  } catch (e) {}
}

// ─────────────────────────────────────────────
//  RENDER — statistika kartalari + davomat jadvali
//  (Faqat ko'rish rejimi: davomatni o'qituvchi
//  o'z panelidan belgilaydi, admin bu yerda o'zgartira olmaydi.)
// ─────────────────────────────────────────────
function render() {
  updateStats();
  renderTable();
}

function updateStats() {
  const list = getStudentsForDate(currentDate);
  const c = { keldi: 0, kelmadi: 0, sababli: 0, kech: 0 };
  Object.values(attendance).forEach(s => { if (s && c[s] !== undefined) c[s]++; });
  g('st-keldi').textContent   = c.keldi;
  g('st-kelmadi').textContent = c.kelmadi;
  g('st-sababli').textContent = c.sababli;
  g('st-kech').textContent    = c.kech;
  g('st-total').textContent   = list.length;
}

// Stat kartani bosish — jadvalni shu statusga filtrlaydi (qayta bossa — bekor qiladi)
function toggleFilter(status) {
  activeFilter = activeFilter === status ? null : status;
  ['keldi','kelmadi','sababli','kech'].forEach(s => {
    g('card-' + s).classList.toggle('active', activeFilter === s);
  });
  renderTable();
}

function renderTable() {
  const q = (g('dav-search').value || '').trim().toLowerCase();
  const list = getStudentsForDate(currentDate)
    .map(s => {
      const key = s.familiya + ' ' + s.ism;
      const sinfLabel = s.sinf && s.sinf.toLowerCase().includes('sinf') ? s.sinf : (s.sinf ? s.sinf + '-sinf' : '—');
      return { sinf: sinfLabel, name: key, status: attendance[key] || '', izoh: izohlar[key] || '' };
    })
    .filter(r => (!activeFilter || r.status === activeFilter))
    .filter(r => !q || r.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  const tbody   = g('dav-tbody');
  const mobWrap = g('dav-mobile-list');

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="3"><div class="dav-empty">
      <div class="dav-empty-icon">📋</div>
      <p>Mos yozuv topilmadi</p>
    </div></td></tr>`;
    mobWrap.innerHTML = `<div class="dav-empty">
      <div class="dav-empty-icon">📋</div>
      <p>Mos yozuv topilmadi</p>
    </div>`;
    return;
  }

  // ─── Guruhlash: haqiqiy dars guruhlariga (dars_jadvali yozuvlariga) qarab ───
  // Bir guruh bir nechta sinfni birlashtirishi mumkin (masalan "6-sinf,8-sinf" — bitta
  // o'qituvchi ikkala sinfni birga o'qitadi). Shu kunga to'g'ri keladigan har bir dars
  // — alohida guruh sifatida ko'rsatiladi, sinf esa faqat shu darsda ishtirok etadi.
  const sessions = getSessionsForDate(currentDate);
  const usedIdx  = new Set(); // list ichidagi qaysi indekslar allaqachon biror guruhga tushdi

  const sessionGroups = sessions.map(session => {
    const sinfNormSet = new Set(session.sinflar.map(normalizeSinf));
    const rows = [];
    list.forEach((r, i) => {
      if (sinfNormSet.has(normalizeSinf(r.sinf))) { rows.push(r); usedIdx.add(i); }
    });
    const label = [...new Set(session.sinflar.map(s => normalizeSinf(s)))]
      .sort((a, b) => (parseInt(a) - parseInt(b)) || a.localeCompare(b))
      .join(', ') + '-sinf';
    return { label, fan: session.fan, vaqt: formatVaqt(session), teacher: session.teacher, rows };
  }).filter(g => g.rows.length); // hech kim yo'q guruhlarni ko'rsatmaymiz

  // Hech qanday darsga tushmagan o'quvchilar — o'z sinfi bo'yicha alohida (eski xulq)
  const leftover = new Map(); // sinf -> rows
  list.forEach((r, i) => {
    if (usedIdx.has(i)) return;
    if (!leftover.has(r.sinf)) leftover.set(r.sinf, []);
    leftover.get(r.sinf).push(r);
  });
  const leftoverOrder = [...leftover.keys()].sort((a, b) => {
    const na = parseInt(a), nb = parseInt(b);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return a.localeCompare(b);
  });
  const leftoverGroups = leftoverOrder.map(sinf => ({
    label: sinf, fan: '', vaqt: '', teacher: '', rows: leftover.get(sinf)
  }));

  // Dars vaqti borlar avval (vaqt bo'yicha allaqachon saralangan), keyin fansiz qolganlar
  const allGroups = [...sessionGroups, ...leftoverGroups];

  const badgeHtml = (status) => {
    const meta = STATUS_META[status];
    return meta
      ? `<span class="dav-badge ${meta.badge}">${meta.label}</span>`
      : `<span style="color:var(--muted);font-size:12px;">Belgilanmagan</span>`;
  };

  const headChips = (grp) => {
    const fanHtml = grp.fan
      ? `<span class="dav-group-fan">${esc(grp.fan)}</span>`
      : `<span class="dav-group-fan dav-group-fan-empty">Fan belgilanmagan</span>`;
    const vaqtHtml = grp.vaqt ? `<span class="dav-group-vaqt">🕒 ${esc(grp.vaqt)}</span>` : '';
    const teacherHtml = grp.teacher ? `<span class="dav-group-teacher">${esc(grp.teacher)}</span>` : '';
    return fanHtml + vaqtHtml + teacherHtml;
  };

  // ─── Desktop jadval ───
  tbody.innerHTML = allGroups.map(grp => {
    const head = `<tr class="dav-group-row"><td colspan="3">
        <span class="dav-group-sinf">${esc(grp.label)}</span>
        ${headChips(grp)}
        <span class="dav-group-count">${grp.rows.length} ta o'quvchi</span>
      </td></tr>`;
    const body = grp.rows.map(r => `<tr>
        <td class="dav-td-name">${esc(r.name)}</td>
        <td>${badgeHtml(r.status)}</td>
        <td class="dav-td-izoh">${r.izoh ? esc(r.izoh) : '—'}</td>
      </tr>`).join('');
    return head + body;
  }).join('');

  // ─── Mobil kartalar ───
  mobWrap.innerHTML = allGroups.map(grp => {
    const cards = grp.rows.map(r => `<div class="dav-mcard">
        <div class="dav-mcard-name">${esc(r.name)}</div>
        <div class="dav-mcard-row">${badgeHtml(r.status)}</div>
        ${r.izoh ? `<div class="dav-mcard-izoh">${esc(r.izoh)}</div>` : ''}
      </div>`).join('');
    return `<div class="dav-mgroup">
        <div class="dav-mgroup-head">
          <span class="dav-group-sinf">${esc(grp.label)}</span>
          ${headChips(grp)}
          <span class="dav-group-count">${grp.rows.length} ta o'quvchi</span>
        </div>
        <div class="dav-mgroup-body">${cards}</div>
      </div>`;
  }).join('');
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

  buildExcel(records, filename);
  closeExportModal();
  toast('✅ Excel fayl yuklab olindi!', 'success');
}

function buildExcel(records, filename) {
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
function esc(s)     { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

let toastT;
function toast(msg, type = '') {
  const t = g('toast');
  t.textContent = msg; t.className = 'toast show ' + type;
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 3000);
}