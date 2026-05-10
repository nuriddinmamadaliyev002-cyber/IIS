// ═══════════════════════════════════════════════════
//  InnovateIT School — O'qituvchilar Davomati
//  (oqituvchilar-davomat.js)
// ═══════════════════════════════════════════════════


const OYLAR  = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
const KUNLAR = ['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'];
const STATUSES = [
  { key:'keldi',   emoji:'✅', title:'Keldi'     },
  { key:'kelmadi', emoji:'❌', title:'Kelmadi'   },
  { key:'sababli', emoji:'📋', title:'Sababli'   },
  { key:'kech',    emoji:'⏰', title:'Kech keldi' },
];

let U          = null;
let TEACHERS   = [];      // Bugun dars o'tadigan o'qituvchilar
let attendance = {};      // { "Ism Familiya": "keldi"|... }
let izohlar    = {};      // { "Ism Familiya": "izoh" }
let pendingIzoh  = null;   // { key, btnEl, type }
let darsVaqtlar  = {};      // { key: { soat, daqiqa } }
let kechSabablar  = {};     // { key: sabab } — kech uchun
let kelmadiSabab  = {};     // { key: sabab } — kelmadi uchun
let sababliIzoh   = {};     // { key: sabab } — sababli uchun
let kechMinutlar  = {};     // { key: minut } — kech qolgan minut

const TODAY = (() => { const d=new Date(); d.setHours(0,0,0,0); return d; })();
let currentDate = skipWeekend(new Date(TODAY), -1);

// ─────────────────────────────────────────────
//  YUKLANGANDA
// ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const saved = sessionStorage.getItem('iit_teacher_dav_user');
    if (!saved) { window.location.href = 'oqituvchilar.html'; return; }
    U = JSON.parse(saved);
  } catch { window.location.href = 'oqituvchilar.html'; return; }

  // Badge
  g('dav-badge').textContent = U.ism;

  // Sana picker max = bugun
  g('date-picker').max = dateStr(TODAY);

  setDateUI(currentDate);
  updateNextBtn();

  await loadTeachersAndDavomat(currentDate);
});

// ─────────────────────────────────────────────
//  NAVIGATSIYA
// ─────────────────────────────────────────────
function goBack() { window.location.href = 'oqituvchilar.html'; }

// ─────────────────────────────────────────────
//  SANA BOSHQARUVI
// ─────────────────────────────────────────────
// Yakshanbani o'tkazib yuborish
// dir = -1 (orqaga) | +1 (oldinga)
function skipWeekend(d, dir) {
  const nd = new Date(d); nd.setHours(0,0,0,0);
  if (nd.getDay() === 0) nd.setDate(nd.getDate() + dir);
  return nd;
}

function dateStr(d) {
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function fmtDate(d) {
  return d.getDate()+'-'+OYLAR[d.getMonth()]+', '+d.getFullYear();
}

function setDateUI(d) {
  g('date-display').textContent = fmtDate(d);
  g('date-sub').textContent     = KUNLAR[d.getDay()];
  g('date-picker').value        = dateStr(d);
}

async function changeDate(dir) {
  const nd = new Date(currentDate);
  nd.setDate(nd.getDate() + dir);
  if (nd.getDay() === 0) nd.setDate(nd.getDate() + dir); // Yakshanbani o'tkazib yuborish
  if (nd > TODAY) return;
  currentDate = nd;
  attendance = {}; izohlar = {}; darsVaqtlar = {}; kechSabablar = {}; kelmadiSabab = {}; sababliIzoh = {}; kechMinutlar = {};
  setDateUI(currentDate);
  updateNextBtn();
  await loadTeachersAndDavomat(currentDate);
}

async function onDatePick() {
  const val = g('date-picker').value; if (!val) return;
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
  attendance = {}; izohlar = {}; darsVaqtlar = {}; kechSabablar = {}; kelmadiSabab = {}; sababliIzoh = {}; kechMinutlar = {};
  setDateUI(currentDate);
  updateNextBtn();
  await loadTeachersAndDavomat(currentDate);
}

function updateNextBtn() {
  const nd = new Date(currentDate);
  nd.setDate(nd.getDate() + 1);
  if (nd.getDay() === 0) nd.setDate(nd.getDate() + 1);
  g('btn-next').disabled = nd > TODAY;
}

// ─────────────────────────────────────────────
//  MA'LUMOTLARNI YUKLASH
// ─────────────────────────────────────────────
async function loadTeachersAndDavomat(date) {
  g('loading-ov').style.display = 'flex';
  try {
    // Dars jadvali orqali bugun dars o'tadigan o'qituvchilarni ol
    const jd = await api.getJadvallar({ username:U.username, parol:U.parol });
    if (!jd.ok) { toast('❌ '+jd.error,'error'); g('loading-ov').style.display='none'; return; }

    // Bugungi kun indeksi (0=Ya,1=Du...6=Sha)
    const dayOfWeek = date.getDay();

    // O'qituvchilarni jadvaldan yuklash
    // Bir xil o'qituvchi, bir xil vaqt → sinflarni birlashtirish
    // Har xil vaqt → alohida yozuv (Shoiraxon kabi)
    // Davomat kaliti: "Ism Familiya|boshlanish" (vaqt bilan unique)
    const vaqtMap = new Map(); // "key|vaqt" -> teacher obj
    TEACHERS = [];
    jd.jadvallar.forEach(j => {
      if (!parseDays(j.kunlar).includes(dayOfWeek)) return;
      const name  = j.teacher_familiya + ' ' + j.teacher_ism;
      const vaqt  = (j.boshlanish||'') + '-' + (j.tugash||'');
      const uniq  = name + '|' + vaqt;
      if (vaqtMap.has(uniq)) {
        // Bir xil vaqt — sinflarni birlashtir
        const ex = vaqtMap.get(uniq);
        parseSinflar(j.sinflar).forEach(s => {
          if (!parseSinflar(ex.sinflar).includes(s)) ex.sinflar += ','+s;
        });
      } else {
        const obj = {
          ism:        j.teacher_ism,
          familiya:   j.teacher_familiya,
          fan:        j.fan || '—',
          boshlanish: j.boshlanish || '',
          tugash:     j.tugash || '',
          sinflar:    j.sinflar || '',
          kunlar:     j.kunlar || ''
        };
        vaqtMap.set(uniq, obj);
        TEACHERS.push(obj);
      }
    });
    // Davomat kaliti ham vaqt bilan bo'lishi uchun key funksiyasi
    // Agar bitta o'qituvchi 2 vaqtda dars o'tsa — ular alohida satr bo'ladi
    // key = "Ism Familiya" (vaqtsiz) — chunki davomat oqituvchi bo'yicha saqlanadi

    // Mavjud davomatni yuklash
    const dd = await api.getTeacherDavomat({ username:U.username, parol:U.parol, sana:dateStr(date) });
    if (dd.ok && dd.records.length) {
      dd.records.forEach(r => {
        // Backend oqituvchi_ism field qaytaradi (r.ism emas!)
        const key = r.oqituvchi_ism || r.ism;
        if (!key) return;
        attendance[key] = r.status;
        if (r.izoh) {
          izohlar[key] = r.izoh;
          if (r.status === 'kelmadi') kelmadiSabab[key] = r.izoh;
          if (r.status === 'sababli') sababliIzoh[key]  = r.izoh;
          if (r.status === 'kech')    kechSabablar[key] = r.izoh;
        }
        if (r.dars_soat || r.dars_daqiqa) {
          darsVaqtlar[key] = { soat: r.dars_soat || 0, daqiqa: r.dars_daqiqa || 0 };
        }
        if (r.kech_minut) kechMinutlar[key] = r.kech_minut;
      });
    }

    render();

  } catch(e) { console.error(e); toast("❌ Yuklashda xatolik",'error'); }
  g('loading-ov').style.display = 'none';
}

// ─────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────
function render() {
  const el = g('teacher-list');

  if (!TEACHERS.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">📅</div>
      <p>${KUNLAR[currentDate.getDay()]} kuni hech kim dars o'tmaydi</p>
    </div>`;
    updateStats();
    return;
  }

  el.innerHTML = TEACHERS.map((t, i) => {
    // Agar bir xil o'qituvchi 2 xil vaqtda dars o'tsa — uni vaqt bilan farqlaymiz
    const sameNameCount = TEACHERS.filter(x=>x.ism===t.ism&&x.familiya===t.familiya).length;
    const key = sameNameCount > 1
      ? t.familiya + ' ' + t.ism + ' ' + (t.boshlanish||i)
      : t.familiya + ' ' + t.ism;
    const cur = attendance[key] || '';
    const sinflar = parseSinflar(t.sinflar);
    return `<div class="teacher-row${cur?' done':''}" id="row-${safeId(key)}" style="animation-delay:${i*0.04}s">
      <div class="teacher-num">${i+1}</div>
      <div class="teacher-info">
        <div class="teacher-name">${t.familiya} ${t.ism}</div>
        <div class="teacher-meta">
          <span class="fan-badge">${t.fan||'—'}</span>
          <span class="vaqt-badge">${fmtVaqt(t.boshlanish,t.tugash)}</span>
          ${sinflar.length ? `<span class="sinf-meta">${sinflar.join(', ')}</span>` : ''}
        </div>
      </div>
      <div class="status-btns">
        ${STATUSES.map(st => `
          <button class="s-btn${cur===st.key?' active-'+st.key:''}"
            title="${st.title}"
            onclick="setStatus('${esc(key)}','${st.key}',this)"
          >${st.emoji}</button>`).join('')}
      </div>
      ${(()=>{
        const dv  = darsVaqtlar[key];
        const st  = cur;
        let badge = '';
        if ((st==='keldi'||st==='kech') && dv) {
          const km = kechMinutlar[key];
          const extra = (st==='kech'&&km) ? ` · ${km} daq kech` : '';
          badge = `<span class="dv-badge dv-edit" id="dvinfo-${safeId(key)}" onclick="editDarsVaqt('${esc(key)}')" title="Tahrirlash">${fmtDv(dv.soat,dv.daqiqa)}${extra}</span>`;
        } else if (st==='kelmadi' && kelmadiSabab[key]) {
          badge = `<span class="dv-badge dv-kelmadi" id="dvinfo-${safeId(key)}" onclick="editSabab('${esc(key)}','kelmadi')" title="Tahrirlash">❌ ${kelmadiSabab[key]}</span>`;
        } else if (st==='sababli' && sababliIzoh[key]) {
          badge = `<span class="dv-badge dv-sababli" id="dvinfo-${safeId(key)}" onclick="editSabab('${esc(key)}','sababli')" title="Tahrirlash">📋 ${sababliIzoh[key]}</span>`;
        } else {
          badge = `<span class="dv-badge" id="dvinfo-${safeId(key)}" style="display:none"></span>`;
        }
        return badge;
      })()}
    </div>`;
  }).join('');

  updateStats();
}

// ─────────────────────────────────────────────
//  STATUS BELGILASH
// ─────────────────────────────────────────────
function setStatus(key, status, btn) {
  // Toggle: allaqachon tanlangan bo'lsa — o'chirish
  if (attendance[key] === status) { applyStatus(key, status, btn); return; }

  if (status === 'sababli' || status === 'kelmadi') {
    pendingIzoh = { key, btn, type: status };
    const cur = status === 'sababli' ? (sababliIzoh[key]||'') : (kelmadiSabab[key]||'');
    g('sabab-modal-title').textContent = status === 'sababli' ? "📋 Sababli — sabab kiriting" : "❌ Kelmadi — sabab kiriting";
    g('sabab-input').value = cur;
    g('sabab-err').style.display = 'none';
    g('sabab-modal').classList.add('show');
    setTimeout(() => g('sabab-input').focus(), 100);
    return;
  }
  if (status === 'keldi' || status === 'kech') {
    pendingIzoh = { key, btn, type: status };
    g('dv-soat').value   = darsVaqtlar[key] ? darsVaqtlar[key].soat   : '';
    g('dv-daqiqa').value = darsVaqtlar[key] ? darsVaqtlar[key].daqiqa : '';
    if (status === 'kech') {
      g('kech-sabab-wrap').style.display = 'block';
      g('kech-minut-wrap').style.display = 'block';
      g('kech-sabab-input').value  = kechSabablar[key]  || '';
      g('kech-minut-input').value  = kechMinutlar[key]  || '';
      g('dv-modal-title').textContent = "⏰ Kech keldi — ma'lumot kiriting";
    } else {
      g('kech-sabab-wrap').style.display = 'none';
      g('kech-minut-wrap').style.display = 'none';
      g('dv-modal-title').textContent = "✅ Keldi — dars soatini kiriting";
    }
    g('dv-err').style.display = 'none';
    g('dv-sabab-err').style.display = 'none';
    g('dv-modal').classList.add('show');
    setTimeout(() => g('dv-soat').focus(), 100);
    return;
  }
  applyStatus(key, status, btn);
}

function applyStatus(key, status, btn) {
  const row  = btn.closest('.teacher-row');
  const btns = row.querySelectorAll('.s-btn');

  if (attendance[key] === status) {
    // Toggle — o'chirish
    delete attendance[key];
    if (status === 'sababli') delete izohlar[key];
    if (status === 'keldi' || status === 'kech') { delete darsVaqtlar[key]; delete kechSabablar[key]; delete kechMinutlar[key]; }
    if (status === 'kelmadi') { delete kelmadiSabab[key]; delete izohlar[key]; }
    if (status === 'sababli') { delete sababliIzoh[key]; delete izohlar[key]; }
    btns.forEach(b => b.className='s-btn');
    row.classList.remove('done');
    const inf = g('dvinfo-'+safeId(key));
    if (inf) { inf.style.display='none'; inf.textContent=''; }
  } else {
    // keldi/kech → badge o'chir; kelmadi/sababli → darsVaqt o'chir
    if (status === 'kelmadi' || status === 'sababli') {
      delete darsVaqtlar[key]; delete kechSabablar[key]; delete kechMinutlar[key];
    }
    if (status === 'keldi' || status === 'kech') {
      delete kelmadiSabab[key]; delete sababliIzoh[key];
    }
    attendance[key] = status;
    btns.forEach(b => b.className='s-btn');
    btn.className = 's-btn active-' + status;
    row.classList.add('done');
  }
  updateStats();
}

// ─────────────────────────────────────────────
//  IZOH MODAL
// ─────────────────────────────────────────────
function confirmSabab() {
  if (!pendingIzoh) return;
  const {key, btn, type} = pendingIzoh;
  const sabab = g('sabab-input').value.trim();
  if (!sabab) { g('sabab-err').style.display='block'; return; }
  g('sabab-err').style.display='none';
  izohlar[key] = sabab;
  if (type === 'sababli') sababliIzoh[key]  = sabab;
  if (type === 'kelmadi') kelmadiSabab[key] = sabab;
  closeSababModal();
  applyStatus(key, type, btn);
  // badge yangilash
  const inf = g('dvinfo-'+safeId(key));
  if (inf) {
    inf.textContent = type==='sababli' ? '📋 '+sabab : '❌ '+sabab;
    inf.style.display = 'inline-flex';
    inf.onclick = ()=>editSabab(key,type);
    inf.title = 'Tahrirlash';
    inf.className = 'dv-badge ' + (type==='sababli'?'dv-sababli':'dv-kelmadi');
  }
}
function closeSababModal() { g('sabab-modal').classList.remove('show'); pendingIzoh=null; }

function editSabab(key, type) {
  if (attendance[key] !== type) return;
  const row = g('row-'+safeId(key));
  if (!row) return;
  const btn = row.querySelector('.s-btn.active-'+type);
  pendingIzoh = { key, btn: btn||row.querySelector('.s-btn'), type };
  g('sabab-modal-title').textContent = type==='sababli' ? "📋 Sababli — sabab tahrirlash" : "❌ Kelmadi — sabab tahrirlash";
  g('sabab-input').value = type==='sababli' ? (sababliIzoh[key]||'') : (kelmadiSabab[key]||'');
  g('sabab-err').style.display='none';
  g('sabab-modal').classList.add('show');
  setTimeout(()=>g('sabab-input').focus(),100);
}

function confirmDarsVaqt() {
  if (!pendingIzoh) return;
  const {key, btn, type} = pendingIzoh;
  const soat   = parseInt(g('dv-soat').value)   || 0;
  const daqiqa = parseInt(g('dv-daqiqa').value) || 0;
  if (soat === 0 && daqiqa === 0) { g('dv-err').textContent = '⚠️ Kamida 1 daqiqa kiriting'; g('dv-err').style.display='block'; return; }
  if (type === 'kech') {
    const sabab = g('kech-sabab-input').value.trim();
    const minut = parseInt(g('kech-minut-input').value)||0;
    if (!sabab) { g('dv-sabab-err').style.display='block'; return; }
    if (!minut) { g('dv-minut-err').style.display='block'; return; }
    g('dv-sabab-err').style.display='none';
    g('dv-minut-err').style.display='none';
    kechSabablar[key]  = sabab;
    kechMinutlar[key]  = minut;
    izohlar[key] = sabab;
  }
  g('dv-err').style.display = 'none';
  darsVaqtlar[key] = { soat, daqiqa };
  closeDvModal();
  // Agar status allaqachon o'rnatilgan bo'lsa (tahrirlash rejimi) — faqat badge yangilansin
  if (attendance[key] !== type) {
    applyStatus(key, type, btn);
  }
  const inf = g('dvinfo-'+safeId(key));
  if (inf) {
    const km = kechMinutlar[key];
    const extra = (type==='kech'&&km) ? ` · ${km} daq kech` : '';
    inf.textContent = fmtDv(soat,daqiqa)+extra;
    inf.style.display='inline-flex';
    inf.className='dv-badge dv-edit';
    inf.onclick=()=>editDarsVaqt(key);
    inf.title='Tahrirlash uchun bosing';
  }
}
function closeDvModal() { g('dv-modal').classList.remove('show'); pendingIzoh=null; }

function editDarsVaqt(key) {
  // Mavjud status keldi yoki kech bo'lsa tahrirlashga ruxsat
  const status = attendance[key];
  if (status !== 'keldi' && status !== 'kech') return;
  // status-btns dan btn topish
  const row = g('row-'+safeId(key));
  if (!row) return;
  const btn = row.querySelector('.s-btn.active-'+status);
  pendingIzoh = { key, btn: btn || row.querySelector('.s-btn'), type: status };
  g('dv-soat').value   = darsVaqtlar[key] ? darsVaqtlar[key].soat   : '';
  g('dv-daqiqa').value = darsVaqtlar[key] ? darsVaqtlar[key].daqiqa : '';
  if (status === 'kech') {
    g('kech-sabab-wrap').style.display = 'block';
    g('kech-sabab-input').value = kechSabablar[key] || '';
    g('kech-minut-input').value = kechMinutlar[key]  || '';
    g('kech-minut-wrap').style.display = 'block';
    g('dv-modal-title').textContent = "⏰ Kech keldi — ma'lumotni tahrirlash";
  } else {
    g('kech-sabab-wrap').style.display = 'none';
    g('kech-minut-wrap').style.display = 'none';
    g('dv-modal-title').textContent = "✅ Keldi — dars soatini tahrirlash";
  }
  g('dv-modal').classList.add('show');
  setTimeout(() => g('dv-soat').focus(), 100);
}

// ─────────────────────────────────────────────
//  STATISTIKA
// ─────────────────────────────────────────────
function updateStats() {
  const c = {keldi:0, kelmadi:0, sababli:0, kech:0};
  Object.values(attendance).forEach(s => { if(s && c[s]!==undefined) c[s]++; });
  g('st-keldi').textContent   = c.keldi;
  g('st-kelmadi').textContent = c.kelmadi;
  g('st-sababli').textContent = c.sababli;
  g('st-kech').textContent    = c.kech;
  g('st-total').textContent   = TEACHERS.length;
}

// ─────────────────────────────────────────────
//  SAQLASH
// ─────────────────────────────────────────────
function confirmSave() {
  if (!TEACHERS.length) { toast('⚠️ Bugun dars o\'tadigan o\'qituvchilar yo\'q','error'); return; }

  const total  = TEACHERS.length;
  const marked = Object.keys(attendance).filter(k=>attendance[k]).length;

  const c = {keldi:0,kelmadi:0,sababli:0,kech:0};
  Object.values(attendance).forEach(s => { if(s&&c[s]!==undefined) c[s]++; });

  g('c-keldi').textContent   = c.keldi;
  g('c-kelmadi').textContent = c.kelmadi;
  g('c-sababli').textContent = c.sababli;
  g('c-kech').textContent    = c.kech;

  g('confirm-desc').innerHTML =
    `<strong>${fmtDate(currentDate)}</strong> — ${KUNLAR[currentDate.getDay()]}<br>
     <span style="font-size:12px;">${marked} / ${total} ta o'qituvchi belgilangan</span>`;

  const warn = g('confirm-warn');
  if (marked < total) {
    warn.style.display = 'block';
    warn.textContent   = `⚠️ ${total-marked} ta o'qituvchi belgilanmadi!`;
  } else {
    warn.style.display = 'none';
  }

  g('confirm-modal').classList.add('show');
}

function closeConfirm() { g('confirm-modal').classList.remove('show'); }

async function doSave() {
  const records = TEACHERS.map((t, i) => {
    const sameNameCount = TEACHERS.filter(x=>x.ism===t.ism&&x.familiya===t.familiya).length;
    const key = sameNameCount > 1
      ? t.familiya + ' ' + t.ism + ' ' + (t.boshlanish||i)
      : t.familiya + ' ' + t.ism;
    const dv  = darsVaqtlar[key];
    return {
      ism:         key,
      fan:         t.fan,
      status:      attendance[key]||'',
      izoh:        izohlar[key]||'',
      dars_soat:   dv ? dv.soat   : 0,
      dars_daqiqa: dv ? dv.daqiqa : 0,
      kech_minut:  kechMinutlar[key] || 0
    };
  }).filter(r => r.status);

  if (!records.length) { toast('⚠️ Hech narsa belgilanmadi','error'); closeConfirm(); return; }

  bl('btn-confirm','save-spinner','save-txt',true,'Saqlanmoqda…');
  try {
    const r = await api.saveTeacherDavomat({
      username:  U.username,
      parol:     U.parol,
      sana:      dateStr(currentDate),
      records:   JSON.stringify(records)
    });
    if (r.ok) {
      closeConfirm();
      toast(`✅ ${r.saved} ta yozuv saqlandi!`,'success');
    } else toast('❌ '+r.error,'error');
  } catch { toast('❌ Xatolik yuz berdi','error'); }
  bl('btn-confirm','save-spinner','save-txt',false,'Ha, saqlash');
}

// ─────────────────────────────────────────────
//  YORDAMCHI FUNKSIYALAR
// ─────────────────────────────────────────────

function fmtDv(soat, daqiqa) {
  if (!soat && !daqiqa) return '';
  let parts = [];
  if (soat)   parts.push(soat   + ' soat');
  if (daqiqa) parts.push(daqiqa + ' daqiqa');
  return '🕐 ' + parts.join(' ');
}

function parseDays(str) {
  if (!str) return [];
  return String(str).split(',').map(Number).filter(n => n>=1 && n<=6);
}
function parseSinflar(str) {
  if (!str) return [];
  return String(str).split(',').map(s=>s.trim()).filter(Boolean);
}
function fmtVaqt(b, t) {
  if (!b && !t) return '—';
  return (b||'?') + '–' + (t||'?');
}
function safeId(s)  { return s.replace(/[^a-zA-Z0-9]/g,'_'); }
function bl(btnId, spId, txtId, loading, txt) {
  g(btnId).disabled          = loading;
  g(spId).style.display      = loading ? 'inline-block' : 'none';
  g(txtId).textContent       = txt;
}
function g(id)  { return document.getElementById(id); }
function esc(s) { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

let toastT;
function toast(msg, type='') {
  const t=g('toast'); t.textContent=msg; t.className='toast show '+(type||'');
  clearTimeout(toastT); toastT=setTimeout(()=>{ t.className='toast'; },3000);
}