// ═══════════════════════════════════════════════════════════════════════════
//  Ro'yxatdan o'tish sahifasi — forma logikasi
//  BASE, apiGet, esc — js/blog.js'dan keladi (avval ulangan bo'lishi kerak)
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', () => {
  loadMaktablar();

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

// ─── Telefon raqamni tekshirish (O'zbekiston formati, moslashuvchan) ────────
function isValidPhone(v) {
  const digits = v.replace(/\D/g, '');
  return digits.length >= 9;
}

// ─── Forma yuborish ───────────────────────────────────────────────────────
async function onSubmit(e) {
  e.preventDefault();

  const ism         = document.getElementById('rx-ism').value.trim();
  const telefon     = document.getElementById('rx-telefon').value.trim();
  const farzandIsmi = document.getElementById('rx-farzand').value.trim();
  const sinf        = document.getElementById('rx-sinf').value;
  const maktabId    = document.getElementById('rx-maktab').value || null;
  const hudud       = document.getElementById('rx-hudud').value.trim();
  const izoh        = document.getElementById('rx-izoh').value.trim();

  const errEl = document.getElementById('rx-err');
  errEl.style.display = 'none';

  if (!ism) {
    showErr('Iltimos, ismingizni kiriting');
    document.getElementById('rx-ism').focus();
    return;
  }
  if (!telefon || !isValidPhone(telefon)) {
    showErr("Iltimos, to'g'ri telefon raqam kiriting");
    document.getElementById('rx-telefon').focus();
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
        ism, telefon, farzandIsmi, sinf,
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
