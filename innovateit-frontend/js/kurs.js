// ═══════════════════════════════════════════════════════════════════════════
//  Kurs ishtirokchisi: ma'lumotlarni tasdiqlash → test → natija → sertifikat
//  To'g'ri javoblar mijozga HECH QACHON kelmaydi; ball serverda hisoblanadi.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  const { esc, toast, req } = K;
  const $ = id => document.getElementById(id);
  const view = html => { $('view').innerHTML = html; window.scrollTo(0, 0); };
  const TEKSHIRUV_BASE = 'https://innovateitschool.uz/sertifikat.html?k=';

  let ME = null;                 // /ish/men javobi
  let TEST = null;               // { id, savollar, javoblar, muddat, i }
  let timer = null, saqlashT = null, yuborilmoqda = false;

  window.addEventListener('DOMContentLoaded', async () => {
    const u = await K.authInit('iit_kurs_ish_token', 'kurs_ishtirokchi');
    if (!u) { $('kirish-yoq').style.display = 'flex'; return; }
    $('app').style.display = 'block';
    $('kimdir').textContent = u.ism || '';
    K.autoRefresh();
    await uy();
  });

  // Test paytida tasodifan sahifani yopishdan ogohlantirish
  window.addEventListener('beforeunload', e => { if (TEST && !yuborilmoqda) { e.preventDefault(); e.returnValue = ''; } });

  // ═══ BOSH SAHIFA ═══
  async function uy() {
    clearInterval(timer); TEST = null;
    view('<div class="k-spin">⏳ Yuklanmoqda…</div>');
    const r = await req('GET', '/api/kurs/ish/men');
    if (!r.ok) return view(`<div class="k-card k-empty">❌ ${esc(r.error)}<br><br><button class="k-btn" onclick="location.reload()">Qayta urinish</button></div>`);
    ME = r;
    $('kurs-nomi').textContent = r.kurs.nomi;
    const k = r.kurs, s = r.sertifikat;

    let amal = '';
    if (s && s.holat === 'haqiqiy') amal = '';
    else if (s) amal = '<div class="k-card"><span class="k-badge err">Sertifikat bekor qilingan</span><div class="k-muted" style="margin-top:6px;">Savollar uchun kurs adminiga murojaat qiling.</div></div>';
    else if (r.faol_urinish_id) amal = '<button class="k-btn ok lg" id="b-davom" style="width:100%;justify-content:center;">▶️ Testni davom ettirish</button>';
    else if (k.holat !== 'faol') amal = '<div class="k-card k-empty">Kurs hozircha yopiq.</div>';
    else if (r.qolgan_urinish <= 0) amal = '<div class="k-card"><b>Urinishlar tugagan.</b><div class="k-muted">Qo\'shimcha urinish uchun kurs adminiga murojaat qiling.</div></div>';
    else amal = `<button class="k-btn lg" id="b-boshla" style="width:100%;justify-content:center;">${r.ishtirokchi.profil_toldirilgan ? '📝 Testni boshlash' : '➡️ Davom etish'}</button>`;

    view(`
      <div class="k-card">
        <h2 style="font-size:20px;">${esc(k.nomi)}</h2>
        ${k.tavsif ? `<p class="k-muted" style="margin:6px 0 0;">${esc(k.tavsif)}</p>` : ''}
      </div>
      ${s && s.holat === 'haqiqiy' ? sertifikatKarta(s) : `
      <div class="k-card">
        <h3>Test qoidalari</h3>
        <div class="k-grid2" style="margin-top:10px;">
          <div class="k-stat"><div class="n">${k.savollar_soni}</div><div class="l">savol</div></div>
          <div class="k-stat"><div class="n">${k.vaqt_daqiqa ? k.vaqt_daqiqa + ' daq.' : 'Cheksiz'}</div><div class="l">vaqt</div></div>
          <div class="k-stat"><div class="n">${k.otish_foiz}%</div><div class="l">o'tish bali</div></div>
          <div class="k-stat"><div class="n">${r.qolgan_urinish}/${k.urinish_limit}</div><div class="l">qolgan urinish</div></div>
        </div>
        <p class="k-hint" style="margin-top:10px;">Test boshlangach vaqt to'xtamaydi. Javoblaringiz avtomatik saqlanadi — aloqa uzilsa, vaqt tugamagan bo'lsa davom ettirishingiz mumkin.</p>
      </div>
      ${amal}`}
      ${r.urinishlar.length ? `
      <div class="k-card" style="margin-top:14px;">
        <h3>Urinishlarim</h3>
        ${r.urinishlar.map(u => `<div class="k-row" style="padding:8px 0;border-bottom:1px solid #eef0f2;">
          <span class="k-muted">${esc(u.boshlangan)}</span><span class="k-sp"></span>
          <span>${u.togri_soni}/${u.jami}</span>
          <span class="k-badge ${u.otdi ? 'ok' : 'err'}">${Number(u.foiz)}%</span></div>`).join('')}
      </div>` : ''}`);

    if ($('b-boshla')) $('b-boshla').onclick = () => (r.ishtirokchi.profil_toldirilgan ? testBoshla() : profilForma());
    if ($('b-davom')) $('b-davom').onclick = testBoshla;
    bindSertifikat();
  }

  // ═══ SERTIFIKAT KARTASI ═══
  function sertifikatKarta(s) {
    return `
      <div class="k-cert" style="margin-bottom:14px;">
        <div style="font-size:42px;">🎓</div>
        <div style="font-weight:700;margin-top:2px;">Tabriklaymiz! Sertifikatingiz tayyor</div>
        <div class="num" style="margin:8px 0;">${esc(s.raqam)}</div>
        <div class="k-muted">Berilgan sana: ${esc(s.berilgan_sana)}</div>
        <div class="k-row" style="justify-content:center;margin-top:14px;">
          <button class="k-btn ok" id="b-pdf">📄 PDF yuklab olish</button>
          <button class="k-btn sec" id="b-nus">🔗 Tekshiruv havolasi</button>
        </div>
        <div class="k-hint" style="margin-top:10px;">Sertifikatdagi QR kodni skaner qilgan har kim uning haqiqiyligini tekshira oladi.</div>
      </div>`;
  }
  // Mini App (Telegram ichki oynasi) ichida fayl yuklab olish ishonchsiz: u yerda sahifa
  // tashqi brauzerda ochiladi (bir martalik kod bilan, qayta kirish shart emas), PDF'ni
  // shu yerda bosib yuklab olinadi. Oddiy brauzerda to'g'ridan-to'g'ri yuklanadi.
  async function pdfYukla(s) {
    const tgApp = window.Telegram && window.Telegram.WebApp;
    if (tgApp && tgApp.initData && tgApp.openLink) {
      const r = await req('POST', '/api/telegram/go-code', {});
      if (r.ok && r.code) {
        toast('Brauzer ochiladi — PDF\'ni u yerda yuklab oling');
        tgApp.openLink(location.origin + '/kurs.html?c=' + encodeURIComponent(r.code));
        return;
      }
    }
    K.blob('/api/kurs/ish/sertifikat/pdf', `sertifikat-${s.raqam}.pdf`);
  }
  function bindSertifikat() {
    const s = ME && ME.sertifikat;
    if (!s) return;
    if ($('b-pdf')) $('b-pdf').onclick = () => pdfYukla(s);
    if ($('b-nus')) $('b-nus').onclick = () => K.nusxala(TEKSHIRUV_BASE + s.tekshiruv_kodi);
  }

  // ═══ MA'LUMOTLARNI TASDIQLASH ═══
  function profilForma() {
    const p = ME.ishtirokchi;
    view(`
      <div class="k-card">
        <h3>Ma'lumotlaringizni tasdiqlang</h3>
        <p class="k-muted" style="margin:4px 0 0;">Sertifikatda familiya, ism va sharifingiz <b>aynan shunday</b> chiqadi. Iltimos, to'g'ri va to'liq yozing.</p>
        <label class="k-lbl">Familiya *</label><input class="k-in" id="p-fam" value="${esc(p.familiya)}" autocomplete="family-name">
        <label class="k-lbl">Ism *</label><input class="k-in" id="p-ism" value="${esc(p.ism)}" autocomplete="given-name">
        <label class="k-lbl">Sharif *</label><input class="k-in" id="p-shar" value="${esc(p.sharif)}" placeholder="Masalan: Abdulla oʻgʻli yoki Karim qizi">
        <label class="k-lbl">Ish joyi (maktab) *</label><input class="k-in" id="p-mak" value="${esc(p.maktab_nomi)}" placeholder="Masalan: 12-maktab, Baliqchi tumani">
        <div class="k-grid2">
          <div><label class="k-lbl">O'qitadigan fan</label><input class="k-in" id="p-fan" value="${esc(p.fan)}"></div>
          <div><label class="k-lbl">Telefon</label><input class="k-in" id="p-tel" value="${esc(p.telefon)}" inputmode="tel" placeholder="+998 90 123 45 67"></div>
        </div>
        <label style="display:flex;gap:10px;align-items:flex-start;margin-top:16px;cursor:pointer;">
          <input type="checkbox" id="p-ok" style="width:20px;height:20px;margin-top:2px;flex-shrink:0;">
          <span>Ma'lumotlarim to'g'ri ekanini tasdiqlayman. Sertifikatdagi ismni keyin o'zgartirib bo'lmasligini tushunaman.</span>
        </label>
        <div class="k-err" id="p-err"></div>
        <div class="k-row" style="margin-top:12px;"><button class="k-btn gray" id="p-back">← Orqaga</button><span class="k-sp"></span><button class="k-btn lg" id="p-save">Testni boshlash</button></div>
      </div>`);
    $('p-back').onclick = uy;
    $('p-save').onclick = async () => {
      $('p-err').textContent = '';
      if (!$('p-ok').checked) { $('p-err').textContent = 'Davom etish uchun tasdiqlash belgisini qo\'ying'; return; }
      $('p-save').disabled = true;
      const r = await req('PUT', '/api/kurs/ish/profil', {
        familiya: $('p-fam').value, ism: $('p-ism').value, sharif: $('p-shar').value,
        maktab_nomi: $('p-mak').value, fan: $('p-fan').value, telefon: $('p-tel').value });
      $('p-save').disabled = false;
      if (!r.ok) { $('p-err').textContent = r.error; return; }
      ME.ishtirokchi.profil_toldirilgan = true;
      testBoshla();
    };
  }

  // ═══ TEST ═══
  async function testBoshla() {
    view('<div class="k-spin">⏳ Test tayyorlanmoqda…</div>');
    const r = await req('POST', '/api/kurs/ish/test/boshlash', {});
    if (!r.ok) {
      if (r.profilKerak) return profilForma();
      toast(r.error || 'Testni boshlab bo\'lmadi', 'err');
      return uy();
    }
    TEST = { id: r.urinish_id, savollar: r.savollar, javoblar: r.javoblar || {}, muddat: r.muddat ? new Date(r.muddat).getTime() : null, i: 0 };
    savolChiz();
    if (TEST.muddat) { clearInterval(timer); timer = setInterval(tik, 1000); tik(); }
  }

  function qolganMs() { return TEST.muddat ? TEST.muddat - Date.now() : null; }
  function tik() {
    if (!TEST) return clearInterval(timer);
    const ms = qolganMs();
    const el = $('t-timer');
    if (ms <= 0) { clearInterval(timer); toast('Vaqt tugadi — javoblar yuborilmoqda', 'err'); return yubor(true); }
    if (el) {
      const s = Math.ceil(ms / 1000), m = Math.floor(s / 60), ss = s % 60;
      el.textContent = `⏱ ${m}:${String(ss).padStart(2, '0')}`;
      el.classList.toggle('low', s <= 60);
    }
  }

  function javobBelgilandi(q) { return TEST.javoblar[q.id] !== undefined; }

  function savolChiz() {
    const T = TEST, n = T.savollar.length, q = T.savollar[T.i];
    const tanlangan = T.javoblar[q.id];
    const done = T.savollar.filter(javobBelgilandi).length;
    view(`
      <div class="t-bar"><b>${T.i + 1} / ${n}</b><span class="k-sp"></span>${T.muddat ? '<span class="t-timer" id="t-timer">⏱ …</span>' : ''}</div>
      <div class="t-prog"><i style="width:${(done / n) * 100}%"></i></div>
      <div class="k-card">
        <div class="t-q">${esc(q.matn)}</div>
        ${q.variantlar.map(v => `<button class="t-opt ${tanlangan === v.i ? 'on' : ''}" data-i="${v.i}"><span class="dot"></span><span>${esc(v.t)}</span></button>`).join('')}
        <div class="t-nav">
          <button class="k-btn gray" id="t-prev" ${T.i === 0 ? 'disabled' : ''}>← Oldingi</button>
          ${T.i < n - 1 ? '<button class="k-btn" id="t-next">Keyingi →</button>' : '<button class="k-btn ok" id="t-fin">✔ Yakunlash</button>'}
        </div>
      </div>
      <div class="t-map">${T.savollar.map((s, j) => `<button data-j="${j}" class="${javobBelgilandi(s) ? 'done' : ''} ${j === T.i ? 'cur' : ''}">${j + 1}</button>`).join('')}</div>`);
    tik();
    document.querySelectorAll('.t-opt').forEach(b => b.onclick = () => { T.javoblar[q.id] = +b.dataset.i; saqlashKechiktir(); savolChiz(); });
    $('t-prev').onclick = () => { T.i--; savolChiz(); };
    if ($('t-next')) $('t-next').onclick = () => { T.i++; savolChiz(); };
    if ($('t-fin')) $('t-fin').onclick = tasdiq;
    document.querySelectorAll('.t-map button').forEach(b => b.onclick = () => { T.i = +b.dataset.j; savolChiz(); });
  }

  function saqlashKechiktir() {
    clearTimeout(saqlashT);
    saqlashT = setTimeout(() => { if (TEST) req('POST', `/api/kurs/ish/test/${TEST.id}/saqlash`, { javoblar: TEST.javoblar }); }, 600);
  }

  function tasdiq() {
    const javobsiz = TEST.savollar.filter(s => !javobBelgilandi(s)).length;
    view(`
      <div class="k-card" style="text-align:center;">
        <div style="font-size:44px;">${javobsiz ? '⚠️' : '✅'}</div>
        <h3 style="margin:6px 0;">Testni yakunlaysizmi?</h3>
        <p class="k-muted">${javobsiz ? `<b style="color:#d97706;">${javobsiz} ta savolga javob bermadingiz.</b> Yakunlagach o'zgartirib bo'lmaydi.` : 'Barcha savollarga javob berdingiz. Yakunlagach o\'zgartirib bo\'lmaydi.'}</p>
        <div class="k-row" style="justify-content:center;margin-top:14px;">
          <button class="k-btn gray" id="y-back">← Testga qaytish</button>
          <button class="k-btn ok lg" id="y-ok">Yakunlash</button>
        </div>
      </div>`);
    $('y-back').onclick = savolChiz;
    $('y-ok').onclick = () => yubor(false);
  }

  async function yubor(avto) {
    if (yuborilmoqda || !TEST) return;
    yuborilmoqda = true; clearInterval(timer); clearTimeout(saqlashT);
    view('<div class="k-spin">⏳ Natija hisoblanmoqda…</div>');
    const id = TEST.id;
    let r = await req('POST', `/api/kurs/ish/test/${id}/yuborish`, { javoblar: TEST.javoblar });
    if (!r.ok) {                      // aloqa uzilgan bo'lishi mumkin — bir marta qayta urinamiz
      await new Promise(res => setTimeout(res, 1500));
      r = await req('POST', `/api/kurs/ish/test/${id}/yuborish`, { javoblar: TEST.javoblar });
    }
    yuborilmoqda = false;
    if (!r.ok) {
      view(`<div class="k-card k-empty">❌ ${esc(r.error)}<br><br><button class="k-btn" id="y-qayta">Qayta yuborish</button></div>`);
      $('y-qayta').onclick = () => yubor(avto);
      return;
    }
    TEST = null;
    natijaKorsat(r);
  }

  function natijaKorsat(r) {
    const n = r.natija;
    view(`
      <div class="k-card k-result">
        <div class="big ${n.otdi ? 'ok' : 'err'}">${n.foiz}%</div>
        <div style="font-size:18px;font-weight:700;margin:4px 0;">${n.otdi ? '🎉 Testdan muvaffaqiyatli o\'tdingiz!' : 'Afsuski, o\'tish balidan o\'ta olmadingiz'}</div>
        <div class="k-muted">To'g'ri javoblar: ${n.togri} / ${n.jami}</div>
      </div>
      ${r.sertifikat ? sertifikatKarta(r.sertifikat) : ''}
      <button class="k-btn lg" id="r-uy" style="width:100%;justify-content:center;">${r.sertifikat ? 'Bosh sahifa' : 'Davom etish'}</button>`);
    ME = ME || {}; ME.sertifikat = r.sertifikat;
    $('r-uy').onclick = uy;
    bindSertifikat();
  }
})();
