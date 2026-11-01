// ═══════════════════════════════════════════════════════════════════════════
//  Sertifikat haqiqiyligini tekshirish sahifasi
//  QR kod → /sertifikat.html?k=KOD  →  GET /api/sertifikat/tekshir/KOD
//  (apiGet, esc — js/blog.js dan)
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  const $ = id => document.getElementById(id);
  const yil = $('year'); if (yil) yil.textContent = new Date().getFullYear();

  function tozala(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16); }

  function korsat(html) { $('cert-natija').innerHTML = html; }

  async function tekshir(kod) {
    kod = tozala(kod);
    if (kod.length < 6) { korsat(`<div class="cert-res none"><div class="cert-ico">🔎</div><div class="cert-title">Kodni to'liq kiriting</div></div>`); return; }
    $('cert-btn').disabled = true;
    korsat('<div class="cert-res none"><div class="cert-ico">⏳</div><div class="cert-title">Tekshirilmoqda…</div></div>');
    const r = await apiGet('/api/sertifikat/tekshir/' + encodeURIComponent(kod));
    $('cert-btn').disabled = false;

    if (!r.ok) {
      korsat(`<div class="cert-res none"><div class="cert-ico">⚠️</div><div class="cert-title">Tekshirib bo'lmadi</div><div class="cert-kurs">${esc(r.error || 'Birozdan keyin qayta urinib ko\'ring')}</div></div>`);
      return;
    }
    if (!r.topildi) {
      korsat(`<div class="cert-res bad"><div class="cert-ico">❌</div><div class="cert-title">Sertifikat topilmadi</div>
        <div class="cert-kurs">Bunday kodli sertifikat mavjud emas. Kodni tekshirib, qayta kiriting.</div></div>`);
      return;
    }
    const s = r.sertifikat;
    const ok = r.haqiqiy;
    korsat(`
      <div class="cert-res ${ok ? 'ok' : 'bad'}">
        <div class="cert-ico">${ok ? '✅' : '⛔'}</div>
        <div class="cert-title">${ok ? 'Sertifikat haqiqiy' : 'Sertifikat bekor qilingan'}</div>
        <div class="cert-fio">${esc(s.fio)}</div>
        <div class="cert-kurs">«${esc(s.kurs_nomi)}» kursida muvaffaqiyatli ishtirok etgan</div>
        <div class="cert-meta">
          <div>Sertifikat raqami<b>${esc(s.raqam)}</b></div>
          <div>Berilgan sana<b>${esc(s.berilgan_sana)}</b></div>
        </div>
        <div class="cert-kurs" style="margin-top:14px;font-size:13px;color:#6b7280;">Tashkilot: Innovate IT School</div>
      </div>`);
  }

  $('cert-form').addEventListener('submit', e => {
    e.preventDefault();
    const kod = tozala($('cert-kod').value);
    $('cert-kod').value = kod;
    try { history.replaceState({}, '', kod ? `?k=${kod}` : location.pathname); } catch (_) {}
    tekshir(kod);
  });

  const q = new URLSearchParams(location.search).get('k');
  if (q) { $('cert-kod').value = tozala(q); tekshir(q); }
})();
