// ═══════════════════════════════════════════════════════════════════════════
//  imtihonlar.html — Telegram'siz imtihon topshirish
//  1) kurs login/paroli bilan kirish  (POST /api/kurs/imtihon/kirish)
//  2) imtihon vaqti ochiq bo'lsa — F.I.Sh., maktab, telefon kiritish (POST /imtihon/royxat)
//     Bir xil familiya+ism ikkinchi marta qabul qilinmaydi (server tomonida).
//  3) test → natija → sertifikat (ishtirokchi tokeni bilan /api/kurs/ish/...)
//  To'g'ri javoblar mijozga HECH QACHON kelmaydi; ball serverda hisoblanadi.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  const _h = location.hostname;
  const BASE = (location.protocol === 'file:' || _h === 'localhost' || _h === '127.0.0.1' || _h === '') ? 'http://127.0.0.1:3001' : '';
  const KEY_KIRISH = 'iit_imtihon_kirish', KEY_ISH = 'iit_imtihon_ish';
  const $ = id => document.getElementById(id);
  const TEKSHIRUV_BASE = location.origin + '/sertifikat.html?k=';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} },
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const view = html => { $('im-app').innerHTML = html; window.scrollTo(0, 0); };

  function toast(msg, tur) {
    let box = $('k-toasts');
    if (!box) { box = document.createElement('div'); box.id = 'k-toasts'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'k-toast ' + (tur || ''); el.textContent = msg; box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, tur === 'err' ? 5000 : 2600);
  }
  async function nusxala(t) {
    try { await navigator.clipboard.writeText(t); toast('Nusxalandi ✓'); } catch (_) { toast('Nusxalab bo\'lmadi', 'err'); }
  }

  // kalit: KEY_KIRISH (ro'yxatdan oldin) yoki KEY_ISH (ro'yxatdan keyin)
  async function http(method, path, body, kalit) {
    const headers = { 'Content-Type': 'application/json' };
    const t = kalit && store.get(kalit);
    if (t) headers.Authorization = 'Bearer ' + t;
    let r;
    try { r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch (_) { return { ok: false, error: 'Tarmoqqa ulanib bo\'lmadi. Internetni tekshiring.' }; }
    let d;
    try { d = await r.json(); } catch (_) { d = { ok: false, error: 'Server javobi noto\'g\'ri (' + r.status + ')' }; }
    d.status = r.status;
    return d;
  }
  // Ishtirokchi so'rovlari: 401 bo'lsa seans tugagan
  async function req(method, path, body) {
    const d = await http(method, path, body, KEY_ISH);
    if (d.status === 401 || (d.status === 403 && /topilmadi/.test(d.error || ''))) {
      store.del(KEY_ISH); TEST = null; clearInterval(timer);
      kirishEkrani('Seans tugadi yoki ma\'lumotingiz o\'chirilgan. Kerak bo\'lsa qaytadan kiring.');
      return { ok: false, error: 'Seans tugadi', tugadi: true };
    }
    return d;
  }
  async function pdfYukla(s) {
    const t = store.get(KEY_ISH);
    let r;
    try { r = await fetch(BASE + '/api/kurs/ish/sertifikat/pdf', { headers: t ? { Authorization: 'Bearer ' + t } : {} }); }
    catch (_) { return toast('Tarmoqqa ulanib bo\'lmadi', 'err'); }
    if (!r.ok) { let m = 'Faylni olib bo\'lmadi'; try { m = (await r.json()).error || m; } catch (_) {} return toast(m, 'err'); }
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = url; a.download = `sertifikat-${s.raqam}.pdf`; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  let ME = null, TEST = null, timer = null, saqlashT = null, yuborilmoqda = false, holatT = null;

  window.addEventListener('DOMContentLoaded', () => {
    if (store.get(KEY_ISH)) uy();
    else if (store.get(KEY_KIRISH)) holatEkrani();
    else kirishEkrani();
  });
  window.addEventListener('beforeunload', e => { if (TEST && !yuborilmoqda) { e.preventDefault(); e.returnValue = ''; } });

  function chiqish() {
    store.del(KEY_ISH); store.del(KEY_KIRISH); TEST = null; ME = null; clearInterval(timer); clearInterval(holatT);
    kirishEkrani();
  }

  // ═══ 1. KIRISH (login / parol) ═══
  function kirishEkrani(xabar) {
    clearInterval(holatT);
    view(`
      <div class="k-card">
        <h2 style="font-size:20px;">Kirish</h2>
        <p class="k-muted" style="margin:6px 0 0;">Imtihonga kirish uchun kurs admini bergan <b>login</b> va <b>parol</b>ni kiriting.</p>
        ${xabar ? `<div class="im-note">${esc(xabar)}</div>` : ''}
        <form id="k-form" autocomplete="off">
          <label class="k-lbl" for="k-login">Login</label><input class="k-in" id="k-login" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="off">
          <label class="k-lbl" for="k-parol">Parol</label><input class="k-in" id="k-parol" type="password" autocomplete="off">
          <div class="k-err" id="k-err"></div>
          <button class="k-btn lg" id="k-ok" type="submit" style="width:100%;justify-content:center;margin-top:10px;">Kirish</button>
        </form>
      </div>`);
    $('k-form').onsubmit = async e => {
      e.preventDefault();
      $('k-err').textContent = '';
      const login = $('k-login').value.trim(), parol = $('k-parol').value;
      if (!login || !parol) { $('k-err').textContent = 'Login va parolni kiriting'; return; }
      $('k-ok').disabled = true;
      const r = await http('POST', '/api/kurs/imtihon/kirish', { login, parol });
      $('k-ok').disabled = false;
      if (!r.ok) { $('k-err').textContent = r.error || 'Xatolik'; return; }
      store.set(KEY_KIRISH, r.token);
      holatEkrani();
    };
  }

  // ═══ 2. IMTIHON VAQTI + RO'YXATDAN O'TISH ═══
  function qolganMatn(ms) {
    let s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    return (d ? d + ' kun ' : '') + (d || h ? h + ' soat ' : '') + m + ' daq ' + (d ? '' : s + ' soniya');
  }
  async function holatEkrani() {
    clearInterval(holatT);
    view('<div class="k-spin">⏳ Yuklanmoqda…</div>');
    const r = await http('GET', '/api/kurs/imtihon/holat', undefined, KEY_KIRISH);
    if (r.status === 401) { store.del(KEY_KIRISH); return kirishEkrani('Kirish eskirgan. Qaytadan kiring.'); }
    if (!r.ok) return view(`<div class="k-card k-empty">❌ ${esc(r.error)}<br><br><button class="k-btn" id="h-q">Qayta urinish</button></div>`), ($('h-q').onclick = holatEkrani);
    if (r.holat === 'ochiq') return royxatForma(r);

    const offset = r.server_vaqti - Date.now();
    const ikon = { kutilmoqda: '⏳', yopilgan: '🔒', sozlanmagan: '🗓', yopiq: '⛔' }[r.holat] || 'ℹ️';
    view(`
      <div class="k-card" style="text-align:center;">
        <div class="im-kurs">${esc(r.kurs.nomi)}</div>
        <div style="font-size:44px;">${ikon}</div>
        <h3 style="margin:6px 0;">${esc(r.xabar)}</h3>
        ${r.boshlanish_matn ? `<p class="k-muted">Imtihon vaqti: <b>${esc(r.boshlanish_matn)} — ${esc(r.tugash_matn)}</b> (Toshkent vaqti)</p>` : ''}
        ${r.holat === 'kutilmoqda' ? '<p style="font-size:17px;font-weight:700;color:#0B1F5C;" id="h-qolgan"></p>' : ''}
        <div class="k-row" style="justify-content:center;margin-top:12px;"><button class="k-btn sec" id="h-yangila">🔄 Yangilash</button><button class="k-btn gray" id="h-chiq">Chiqish</button></div>
      </div>`);
    $('h-yangila').onclick = holatEkrani; $('h-chiq').onclick = chiqish;
    if (r.holat === 'kutilmoqda') {
      const tik = () => {
        const q = r.boshlanish - (Date.now() + offset);
        if (q <= 0) { clearInterval(holatT); return holatEkrani(); }
        const el = $('h-qolgan'); if (el) el.textContent = 'Boshlanishiga: ' + qolganMatn(q); else clearInterval(holatT);
      };
      holatT = setInterval(tik, 1000); tik();
    }
  }

  function royxatForma(h) {
    view(`
      <div class="k-card">
        <div class="im-kurs">${esc(h.kurs.nomi)}</div>
        <h2 style="font-size:20px;">Ma'lumotlaringizni kiriting</h2>
        <p class="k-muted" style="margin:6px 0 0;">Sertifikatda familiya, ism va sharifingiz <b>aynan shunday</b> chiqadi. Iltimos, to'g'ri va to'liq yozing.</p>
        <form id="r-form" autocomplete="off">
          <div class="k-grid2">
            <div><label class="k-lbl" for="r-fam">Familiya *</label><input class="k-in" id="r-fam" autocomplete="family-name"></div>
            <div><label class="k-lbl" for="r-ism">Ism *</label><input class="k-in" id="r-ism" autocomplete="given-name"></div>
          </div>
          <label class="k-lbl" for="r-shar">Sharif *</label><input class="k-in" id="r-shar" placeholder="Masalan: Abdulla oʻgʻli yoki Karim qizi">
          <label class="k-lbl" for="r-mak">Maktab *</label><input class="k-in" id="r-mak" placeholder="Masalan: 12-maktab, Baliqchi tumani">
          <label class="k-lbl" for="r-tel">Telefon raqami *</label><input class="k-in" id="r-tel" inputmode="tel" autocomplete="tel" placeholder="+998 90 123 45 67">
          <div class="im-note">Imtihon <b>bir marta</b> topshiriladi: bir xil familiya va ism bilan ikkinchi marta kirib bo'lmaydi. Test: <b>${h.kurs.savol_soni ? h.kurs.savol_soni + ' ta savol' : 'barcha savollar'}</b>${h.kurs.vaqt_daqiqa ? ', <b>' + h.kurs.vaqt_daqiqa + ' daqiqa</b>' : ''}, o'tish bali <b>${h.kurs.otish_foiz}%</b>. Imtihon <b>${esc(h.tugash_matn)}</b> gacha boshlanishi kerak.</div>
          <label style="display:flex;gap:10px;align-items:flex-start;margin-top:16px;cursor:pointer;">
            <input type="checkbox" id="r-ok" style="width:20px;height:20px;margin-top:2px;flex-shrink:0;">
            <span>Ma'lumotlarim to'g'ri ekanini tasdiqlayman. Sertifikatdagi ismni keyin o'zgartirib bo'lmasligini tushunaman.</span>
          </label>
          <div class="k-err" id="r-err"></div>
          <div class="k-row" style="margin-top:12px;"><button class="k-btn gray" type="button" id="r-chiq">Chiqish</button><span class="k-sp"></span><button class="k-btn lg" id="r-save" type="submit">Davom etish</button></div>
        </form>
      </div>`);
    $('r-chiq').onclick = chiqish;
    $('r-form').onsubmit = async e => {
      e.preventDefault();
      $('r-err').textContent = '';
      if (!$('r-ok').checked) { $('r-err').textContent = 'Davom etish uchun tasdiqlash belgisini qo\'ying'; return; }
      $('r-save').disabled = true;
      const r = await http('POST', '/api/kurs/imtihon/royxat', {
        familiya: $('r-fam').value, ism: $('r-ism').value, sharif: $('r-shar').value,
        maktab_nomi: $('r-mak').value, telefon: $('r-tel').value }, KEY_KIRISH);
      $('r-save').disabled = false;
      if (r.status === 401) { store.del(KEY_KIRISH); return kirishEkrani('Kirish eskirgan. Qaytadan kiring.'); }
      if (!r.ok) {
        if (r.holat) return holatEkrani();
        $('r-err').textContent = r.error || 'Xatolik'; return;
      }
      store.set(KEY_ISH, r.token); store.del(KEY_KIRISH);
      uy();
    };
  }

  // ═══ 3. BOSH SAHIFA (ro'yxatdan o'tgan ishtirokchi) ═══
  async function uy() {
    clearInterval(timer); clearInterval(holatT); TEST = null;
    view('<div class="k-spin">⏳ Yuklanmoqda…</div>');
    const r = await req('GET', '/api/kurs/ish/men');
    if (r.tugadi) return;
    if (!r.ok) return view(`<div class="k-card k-empty">❌ ${esc(r.error)}<br><br><button class="k-btn" id="u-q">Qayta urinish</button></div>`), ($('u-q').onclick = uy);
    ME = r;
    const k = r.kurs, s = r.sertifikat, oyna = r.imtihon || { holat: 'ochiq' };

    let amal = '';
    if (s && s.holat === 'haqiqiy') amal = '';
    else if (s) amal = '<div class="k-card"><span class="k-badge err">Sertifikat bekor qilingan</span><div class="k-muted" style="margin-top:6px;">Savollar uchun kurs adminiga murojaat qiling.</div></div>';
    else if (r.faol_urinish_id) amal = '<button class="k-btn ok lg" id="b-davom" style="width:100%;justify-content:center;">▶️ Testni davom ettirish</button>';
    else if (k.holat !== 'faol') amal = '<div class="k-card k-empty">Kurs hozircha yopiq.</div>';
    else if (r.qolgan_urinish <= 0) amal = '<div class="k-card"><b>Urinishlar tugagan.</b><div class="k-muted">Qo\'shimcha urinish uchun kurs adminiga murojaat qiling.</div></div>';
    else if (oyna.holat !== 'ochiq') amal = `<div class="k-card k-empty"><b>${esc(oyna.xabar || 'Imtihon hozir yopiq')}</b></div>`;
    else amal = '<button class="k-btn lg" id="b-boshla" style="width:100%;justify-content:center;">📝 Testni boshlash</button>';

    view(`
      <div class="k-card">
        <div class="k-row"><div style="flex:1;min-width:0;"><h2 style="font-size:20px;">${esc(k.nomi)}</h2>
          <div class="k-muted" style="margin-top:4px;">${esc([r.ishtirokchi.familiya, r.ishtirokchi.ism, r.ishtirokchi.sharif].filter(Boolean).join(' '))}</div></div>
          <button class="k-btn gray sm" id="b-chiq">Chiqish</button></div>
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
        <p class="k-hint" style="margin-top:10px;">Test boshlangach vaqt to'xtamaydi. Javoblaringiz avtomatik saqlanadi — aloqa uzilsa, vaqt tugamagan bo'lsa shu qurilmada davom ettirishingiz mumkin.</p>
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

    $('b-chiq').onclick = () => { if (confirm('Chiqasizmi? Sertifikatni keyin yuklab olish uchun ma\'lumotingiz ushbu qurilmada saqlanmaydi.')) chiqish(); };
    if ($('b-boshla')) $('b-boshla').onclick = testBoshla;
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
        <div class="k-hint" style="margin-top:10px;">PDF'ni hoziroq yuklab oling. Sertifikatdagi QR kodni skaner qilgan har kim uning haqiqiyligini tekshira oladi.</div>
      </div>`;
  }
  function bindSertifikat() {
    const s = ME && ME.sertifikat;
    if (!s) return;
    if ($('b-pdf')) $('b-pdf').onclick = () => pdfYukla(s);
    if ($('b-nus')) $('b-nus').onclick = () => nusxala(TEKSHIRUV_BASE + s.tekshiruv_kodi);
  }

  // ═══ TEST ═══
  async function testBoshla() {
    view('<div class="k-spin">⏳ Test tayyorlanmoqda…</div>');
    const r = await req('POST', '/api/kurs/ish/test/boshlash', {});
    if (!r.ok) {
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
