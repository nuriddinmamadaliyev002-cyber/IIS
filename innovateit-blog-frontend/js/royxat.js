// ═══════════════════════════════════════════════════════════════════════════
//  Ro'yxatdan o'tish sahifasi — forma logikasi
//  BASE, apiGet, esc — js/blog.js'dan keladi (avval ulangan bo'lishi kerak)
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', () => {
  loadMaktablar();
  setupTel('rx-telefon', 'rx-tel-hint');
  setupTel('rx-telefon2', 'rx-tel2-hint');

  const form = document.getElementById('rx-form');
  if (form) form.addEventListener('submit', onSubmit);
});

// ─── Hamkor maktablar ro'yxatini yuklash ─────────────────────────────────────
async function loadMaktablar() {
  const sel = document.getElementById('rx-maktab');
  if (!sel) return;

  try {
    const r = await apiGet('/api/maktablar');
    if (r.ok && Array.isArray(r.maktablar) && r.maktablar.length) {
      sel.innerHTML = '<option value="">Tanlang (yoki hududni yozing)</option>' +
        r.maktablar.map(m => `<option value="${m.id}">${esc(m.nomi)}</option>`).join('');
    } else {
      sel.innerHTML = '<option value="">Ro\'yxatda topilmadi — hududni yozing</option>';
    }
  } catch (e) {
    sel.innerHTML = '<option value="">Ro\'yxatni yuklab bo\'lmadi — hududni yozing</option>';
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
function validateTel(inp, hintEl) {
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) {
    inp.className = 'tel-input';
    if (hintEl) { hintEl.className = 'rx-tel-hint'; hintEl.textContent = ''; }
    return;
  }
  const ok = isTelOk(val);
  inp.className = 'tel-input ' + (ok ? 'tel-ok' : 'tel-err');
  if (hintEl) {
    hintEl.className   = 'rx-tel-hint ' + (ok ? 'ok' : 'err');
    hintEl.textContent = ok ? "✓ To'g'ri format" : "✗ +998 XX XXX XX XX formatida kiriting";
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
    validateTel(this, hint);
  });
  inp.addEventListener('blur', () => validateTel(inp, hint));
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
  const maktabId        = document.getElementById('rx-maktab').value || null;
  const hudud           = document.getElementById('rx-hudud').value.trim();
  const izoh            = document.getElementById('rx-izoh').value.trim();

  const errEl = document.getElementById('rx-err');
  errEl.style.display = 'none';

  if (!ism) {
    showErr('Iltimos, ismingizni kiriting');
    document.getElementById('rx-ism').focus();
    return;
  }
  if (!telefon || !isTelOk(telefon)) {
    showErr("Iltimos, telefon raqamni +998 XX XXX XX XX formatida kiriting");
    document.getElementById('rx-telefon').focus();
    return;
  }
  if (telefon2 && !isTelOk(telefon2)) {
    showErr("Qo'shimcha telefon raqam formati noto'g'ri");
    document.getElementById('rx-telefon2').focus();
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
        maktabId: maktabId ? parseInt(maktabId, 10) : null,
        hudud, izoh, manba: 'sayt',
      }),
    });
    const data = await res.json();

    if (data.ok) {
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
