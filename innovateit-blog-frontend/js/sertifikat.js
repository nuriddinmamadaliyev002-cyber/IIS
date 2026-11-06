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
        <div class="cert-kurs">«${esc(s.kurs_nomi)}» ${s.otdi === false ? 'kursida faol ishtirok etgan' : 'kursini muvaffaqiyatli tugatgan'}</div>
        <div class="cert-meta">
          <div>Sertifikat raqami<b>${esc(s.raqam)}</b></div>
          <div>Tekshirish kodi<b>${esc(s.kod)}</b></div>
          <div>Berilgan sana<b>${esc(s.berilgan_sana)}</b></div>
        </div>
        ${ok ? `<div class="cert-dl">
          <button type="button" id="cert-dl-btn" class="cert-dl-btn">⬇ Sertifikatni yuklab olish (PDF)</button>
          <div class="cert-dl-err" id="cert-dl-err" role="alert"></div>
        </div>` : ''}
        <div class="cert-kurs" style="margin-top:14px;font-size:13px;color:#6b7280;">Tashkilot: Innovate IT School</div>
      </div>`);
    const dl = $('cert-dl-btn');
    if (dl) dl.onclick = () => yuklab(s.kod, s.raqam, dl);
  }

  // PDF ni fetch bilan olamiz (xatolikni sahifada ko'rsatish uchun) va brauzerga fayl sifatida saqlatamiz
  async function yuklab(kod, raqam, btn) {
    const err = $('cert-dl-err'); err.textContent = '';
    const eski = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳ Tayyorlanmoqda…';
    try {
      const res = await fetch(`${BASE}/api/sertifikat/pdf/${encodeURIComponent(kod)}`);
      if (!res.ok) {
        let m = 'Yuklab bo\'lmadi. Birozdan keyin qayta urinib ko\'ring.';
        try { const j = await res.json(); if (j && j.error) m = j.error; } catch (_) {}
        throw new Error(m);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'sertifikat-' + String(raqam || kod).replace(/[^A-Za-z0-9_-]/g, '') + '.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      err.textContent = e.message || 'Yuklab bo\'lmadi';
    } finally {
      btn.disabled = false; btn.textContent = eski;
    }
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
