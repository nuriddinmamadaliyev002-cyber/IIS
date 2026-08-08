// ═══════════════════════════════════════════════════════════════════════════
//  Ro'yxatdan o'tish sahifasi — forma logikasi
//  BASE, apiGet, esc — js/blog.js'dan keladi (avval ulangan bo'lishi kerak)
// ═══════════════════════════════════════════════════════════════════════════

const RX_STORAGE_KEY     = 'iis_royxat_arizalar'; // massiv — barcha arizalar, doimiy saqlanadi
const RX_STORAGE_KEY_OLD = 'iis_royxat_last';      // eski (bitta ariza, 24soat) — migratsiya uchun

window.addEventListener('DOMContentLoaded', () => {
  loadMaktablar();
  setupTel('rx-telefon', 'rx-tel-hint');
  setupTel('rx-telefon2', 'rx-tel2-hint');

  const form = document.getElementById('rx-form');
  if (form) form.addEventListener('submit', onSubmit);

  const newBtn = document.getElementById('rx-already-newbtn');
  if (newBtn) newBtn.addEventListener('click', () => {
    document.getElementById('rx-already').style.display = 'none';
    document.getElementById('rx-form-state').style.display = 'block';
    document.getElementById('rx-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  migrateOldStorage();
  renderAlreadySubmitted();
});

// ─── Eski (bitta ariza, 24 soatlik) formatdan yangi (massiv, doimiy) formatga o'tkazish ───
function migrateOldStorage() {
  try {
    const oldRaw = localStorage.getItem(RX_STORAGE_KEY_OLD);
    if (!oldRaw) return;
    const old = JSON.parse(oldRaw);
    if (old && old.time) {
      const list = getSubmissions();
      list.push({
        time: old.time,
        ism: old.ism || '',
        telefon: old.telefon || '',
        telefon2: old.telefon2 || '',
        oquvchiFamiliya: old.oquvchiFamiliya || '',
        oquvchiIsmi: old.oquvchiIsmi || '',
        sinf: old.sinf || '',
        maktabNomi: old.maktabNomi || '',
      });
      saveSubmissions(list);
    }
    localStorage.removeItem(RX_STORAGE_KEY_OLD);
  } catch (e) { /* jim o'tkazamiz */ }
}

function getSubmissions() {
  try {
    const raw = localStorage.getItem(RX_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function saveSubmissions(list) {
  try { localStorage.setItem(RX_STORAGE_KEY, JSON.stringify(list)); }
  catch (e) { /* localStorage yopiq bo'lsa — jim o'tkazamiz */ }
}

// ─── Shu qurilmadan avval yuborilgan barcha arizalarni ko'rsatish (doimiy) ───
// Sekin internet yoki bexosdan bir necha marta bosilishi kabi hollarda bir xil
// odam bilmasdan dublikat ariza yubormasligi, va oldingi arizalari haqida
// ma'lumot yo'qolmasligi uchun har bir ariza doimiy ro'yxatda saqlanadi.
function renderAlreadySubmitted() {
  const list = getSubmissions();
  if (!list.length) return;

  document.getElementById('rx-form-state').style.display = 'none';
  document.getElementById('rx-already-title').textContent =
    list.length > 1 ? 'Arizalaringiz allaqachon qabul qilingan' : 'Arizangiz allaqachon qabul qilingan';

  const listEl = document.getElementById('rx-already-list');
  listEl.innerHTML = list.slice().reverse().map(rxCardHtml).join('');
  document.getElementById('rx-already').style.display = 'block';
}

function rxCardHtml(item) {
  const rows = [
    ['Ota-ona', item.ism],
    ['Telefon', item.telefon],
    ['Qo\'shimcha tel.', item.telefon2],
    ['Sinf', item.sinf],
    ['Maktab', item.maktabNomi],
  ].filter(([, v]) => !!v);

  return `
    <div class="rx-already-card">
      <div class="rx-ac-top">
        <div class="rx-ac-name">${esc(`${item.oquvchiFamiliya || ''} ${item.oquvchiIsmi || ''}`.trim())}</div>
        <div class="rx-ac-time">${esc(formatRxTime(item.time))}</div>
      </div>
      <div class="rx-ac-grid">
        ${rows.map(([label, val]) => `<div class="rx-ac-row"><b>${esc(label)}:</b> ${esc(val)}</div>`).join('')}
      </div>
    </div>`;
}

function formatRxTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function rememberSubmission(data) {
  const list = getSubmissions();
  list.push({
    time: Date.now(),
    ism:             data.ism,
    telefon:         data.telefon,
    telefon2:        data.telefon2,
    oquvchiFamiliya: data.oquvchiFamiliya,
    oquvchiIsmi:     data.oquvchiIsmi,
    sinf:            data.sinf,
    maktabNomi:      data.maktabNomi,
  });
  saveSubmissions(list);
}

// ─── Hamkor maktablar ro'yxatini yuklash ─────────────────────────────────────
async function loadMaktablar() {
  const sel = document.getElementById('rx-maktab');
  if (!sel) return;

  try {
    const r = await apiGet('/api/maktablar');
    if (r.ok && Array.isArray(r.maktablar) && r.maktablar.length) {
      sel.innerHTML = '<option value="">Tanlang</option>' +
        r.maktablar.map(m => `<option value="${m.id}">${esc(m.nomi)}</option>`).join('');
    } else {
      sel.innerHTML = '<option value="">Ro\'yxat topilmadi — birozdan so\'ng qayta urinib ko\'ring</option>';
    }
  } catch (e) {
    sel.innerHTML = '<option value="">Ro\'yxatni yuklab bo\'lmadi — sahifani yangilang</option>';
  }
}

// ─── Telefon mask va validatsiya (CRM admin paneli — js/app.js bilan bir xil) ─
function fmtTel(val) {
  const digits = val.replace(/\D/g, '');
  if (!digits) return '';
  let d = digits.startsWith('998') ? digits
        : digits.startsWith('0')   ? '998' + digits.slice(1)
        : '998' + digits;
  d = d.slice(0, 12);
  // Faqat mamlakat kodi qolgan bo'lsa (998 dan ortiq raqam yo'q) — bo'sh qaytaramiz
  if (d === '998') return '';
  let out = '';
  if (d.length > 0)  out = '+' + d.slice(0, 3);
  if (d.length > 3)  out += ' ' + d.slice(3, 5);
  if (d.length > 5)  out += ' ' + d.slice(5, 8);
  if (d.length > 8)  out += ' ' + d.slice(8, 10);
  if (d.length > 10) out += ' ' + d.slice(10, 12);
  return out;
}
function isTelOk(val) {
  const d = val.replace(/\D/g, '');
  return d.length === 12 && d.startsWith('998');
}
// Eslatma: xato holati (qizil ramka/hint) endi faqat "Ro'yxatdan o'tish"
// bosilib, forma yuborilganda ko'rsatiladi (showTelErr orqali). Yozish
// paytida yoki fokusdan chiqishda darhol xato ko'rsatilmaydi — foydalanuvchi
// hali to'ldirib ulgurmagan bo'lishi mumkin.
function clearTelState(inp, hintEl) {
  if (!inp) return;
  inp.className = 'tel-input';
  if (hintEl) { hintEl.className = 'rx-tel-hint'; hintEl.textContent = ''; }
}
function showTelErr(inp, hintEl) {
  if (!inp) return;
  inp.className = 'tel-input tel-err';
  if (hintEl) {
    hintEl.className   = 'rx-tel-hint err';
    hintEl.textContent = "✗ +998 XX XXX XX XX formatida kiriting";
  }
}
function setupTel(inpId, hintId) {
  const inp  = document.getElementById(inpId);
  const hint = document.getElementById(hintId);
  if (!inp) return;
  inp.addEventListener('input', function () {
    const oldLen = this.value.length;
    const pos    = this.selectionStart;
    this.value   = fmtTel(this.value);
    const diff   = this.value.length - oldLen;
    try { this.setSelectionRange(pos + diff, pos + diff); } catch (e) {}
    // Yozayotganda avvalgi xato holati bo'lsa, tozalab boramiz —
    // qayta xato faqat keyingi submitda ko'rsatiladi.
    clearTelState(this, hint);
  });
}

// ─── Forma yuborish ───────────────────────────────────────────────────────
async function onSubmit(e) {
  e.preventDefault();

  const ism             = document.getElementById('rx-ism').value.trim();
  const telefon         = document.getElementById('rx-telefon').value.trim();
  const telefon2        = document.getElementById('rx-telefon2').value.trim();
  const oquvchiFamiliya = document.getElementById('rx-oquvchi-familiya').value.trim();
  const oquvchiIsmi     = document.getElementById('rx-oquvchi-ismi').value.trim();
  const sinf            = document.getElementById('rx-sinf').value;
  const maktabSel       = document.getElementById('rx-maktab');
  const maktabId        = maktabSel.value;
  const maktabNomi      = maktabSel.selectedIndex >= 0 ? maktabSel.options[maktabSel.selectedIndex].text : '';

  const errEl = document.getElementById('rx-err');
  errEl.style.display = 'none';

  const telInp   = document.getElementById('rx-telefon');
  const telHint  = document.getElementById('rx-tel-hint');
  const tel2Inp  = document.getElementById('rx-telefon2');
  const tel2Hint = document.getElementById('rx-tel2-hint');
  clearTelState(telInp, telHint);
  clearTelState(tel2Inp, tel2Hint);

  if (!ism) {
    showErr('Iltimos, ismingizni kiriting');
    document.getElementById('rx-ism').focus();
    return;
  }
  if (!telefon || !isTelOk(telefon)) {
    showTelErr(telInp, telHint);
    showErr("Iltimos, telefon raqamni +998 XX XXX XX XX formatida kiriting");
    telInp.focus();
    return;
  }
  if (telefon2 && !isTelOk(telefon2)) {
    showTelErr(tel2Inp, tel2Hint);
    showErr("Qo'shimcha telefon raqam formati noto'g'ri");
    tel2Inp.focus();
    return;
  }
  if (!oquvchiFamiliya) {
    showErr("Iltimos, o'quvchining familiyasini kiriting");
    document.getElementById('rx-oquvchi-familiya').focus();
    return;
  }
  if (!oquvchiIsmi) {
    showErr("Iltimos, o'quvchining ismini kiriting");
    document.getElementById('rx-oquvchi-ismi').focus();
    return;
  }
  if (!sinf) {
    showErr("Iltimos, sinfni tanlang");
    document.getElementById('rx-sinf').focus();
    return;
  }
  if (!maktabId) {
    showErr("Iltimos, maktabni tanlang");
    document.getElementById('rx-maktab').focus();
    return;
  }

  const btn = document.getElementById('rx-submit-btn');
  const btnTxt = document.getElementById('rx-submit-txt');
  btn.disabled = true;
  btnTxt.textContent = 'Yuborilmoqda…';

  try {
    const res = await fetch(`${BASE}/api/sales/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ism, telefon, telefon2, oquvchiFamiliya, oquvchiIsmi, sinf,
        maktabId: parseInt(maktabId, 10),
        manba: 'sayt',
      }),
    });
    const data = await res.json();

    if (data.ok) {
      rememberSubmission({ ism, telefon, telefon2, oquvchiFamiliya, oquvchiIsmi, sinf, maktabNomi });
      document.getElementById('rx-form-state').style.display = 'none';
      document.getElementById('rx-success').style.display = 'block';
      document.getElementById('rx-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      showErr(data.error || "Xatolik yuz berdi, qaytadan urinib ko'ring");
    }
  } catch (err) {
    showErr("Server bilan bog'lanib bo'lmadi. Internetni tekshirib, qaytadan urinib ko'ring.");
  }

  btn.disabled = false;
  btnTxt.textContent = "Ro'yxatdan o'tish";
}

function showErr(msg) {
  const errEl = document.getElementById('rx-err');
  errEl.textContent = '⚠️ ' + msg;
  errEl.style.display = 'block';
  errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
