// ═══════════════════════════════════════════════════════════════════════════
//  Kurs admini paneli — sozlamalar, savollar, ishtirokchilar, natijalar, sertifikatlar
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  const { esc, toast, req, modal, closeModal } = K;
  const $ = id => document.getElementById(id);
  let KURS = null, TAB = 'sozlama';

  // ─── Boshlash ───
  window.addEventListener('DOMContentLoaded', async () => {
    const u = await K.authInit('iit_kurs_admin_token', 'kurs_admin');
    if (!u) { $('kirish-yoq').style.display = 'flex'; return; }
    $('app').style.display = 'block';
    $('kimdir').textContent = u.ism || '';
    K.autoRefresh();
    document.querySelectorAll('.k-tab').forEach(b => b.onclick = () => openTab(b.dataset.t));
    await loadKurs();
    openTab('sozlama');
  });

  async function loadKurs() {
    const r = await req('GET', '/api/kurs/admin/kurs');
    if (r.ok) { KURS = r.kurs; $('kurs-nomi').textContent = KURS.nomi; document.title = KURS.nomi + ' — Kurs admini'; }
  }

  function openTab(t) {
    TAB = t;
    document.querySelectorAll('.k-tab').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    ({ sozlama: tabSozlama, savollar: tabSavollar, ishtirokchilar: tabIshtirokchilar, natijalar: tabNatijalar, sertifikatlar: tabSertifikatlar })[t]();
  }
  const view = html => { $('view').innerHTML = html; };
  const yuklanmoqda = () => view('<div class="k-spin">⏳ Yuklanmoqda…</div>');

  function imtihonBadge(h) {
    const m = { ochiq: ['ok', '🟢 Imtihon hozir ochiq'], kutilmoqda: ['blue', '⏳ Boshlanishi kutilmoqda'], yopilgan: ['gray', '🔒 Vaqti tugagan'],
                sozlanmagan: ['warn', '⚠️ Vaqt belgilanmagan'], yopiq: ['err', '⛔ Kurs yopiq'] }[h] || ['gray', h];
    return `<span class="k-badge ${m[0]}">${m[1]}</span>`;
  }

  // ═══ 1. SOZLAMALAR ═══
  async function tabSozlama() {
    yuklanmoqda();
    await loadKurs();
    const k = KURS;
    if (!k) return view('<div class="k-empty">Kurs ma\'lumotini olib bo\'lmadi</div>');
    const im = await req('GET', '/api/kurs/admin/imtihon');
    const I = im.ok ? im.imtihon : null;
    view(`
      <div class="k-stats">
        <div class="k-stat"><div class="n">${k.ishtirokchilar_soni}</div><div class="l">Ishtirokchilar</div></div>
        <div class="k-stat"><div class="n">${k.savollar_soni_jami}</div><div class="l">Savollar bazasida</div></div>
        <div class="k-stat"><div class="n">${k.urinishlar_soni}</div><div class="l">Topshirilgan testlar</div></div>
        <div class="k-stat"><div class="n">${k.sertifikatlar_soni}</div><div class="l">Berilgan sertifikatlar</div></div>
      </div>
      ${I ? `<div class="k-card">
        <h3>Imtihon: kirish va vaqt</h3>
        <div class="k-muted">Ishtirokchilar <b>${esc(I.url)}</b> sahifasida shu login va parol bilan kiradi va imtihonni faqat quyidagi vaqt oralig'ida boshlay oladi. Vaqt — Toshkent vaqti.</div>
        <div class="k-row" style="margin:8px 0;">${imtihonBadge(I.holat)}</div>
        <div class="k-grid2">
          <div><label class="k-lbl">Login</label><input class="k-in" id="m-login" maxlength="30" autocomplete="off" value="${esc(I.login)}" placeholder="masalan: raqamli2026"></div>
          <div><label class="k-lbl">Parol</label><div class="k-row"><input class="k-in" id="m-parol" autocomplete="off" placeholder="${I.parol_bor ? '•••••• (o\'zgartirish uchun yangisini yozing)' : 'parol belgilanmagan'}"><button class="k-btn sec sm" id="m-gen" type="button">🎲</button></div></div>
          <div><label class="k-lbl">Boshlanish</label><input class="k-in" id="m-bosh" type="datetime-local" value="${esc(I.boshlanish)}"></div>
          <div><label class="k-lbl">Tugash</label><input class="k-in" id="m-tug" type="datetime-local" value="${esc(I.tugash)}"></div>
        </div>
        <div class="k-hint">Imtihon shu oraliqda boshlanadi; boshlangan test o'z vaqti (${k.vaqt_daqiqa ? k.vaqt_daqiqa + ' daqiqa' : 'cheklanmagan'}) davomida tugatiladi. Parol saqlangandan keyin ko'rsatilmaydi — ishtirokchilarga yetkazing.</div>
        <div class="k-err" id="m-err"></div>
        <div class="k-row" style="margin-top:12px;"><button class="k-btn" id="m-save">💾 Saqlash</button><button class="k-btn gray" id="m-copy">📋 Havola va login nusxalash</button></div>
      </div>` : ''}
      <div class="k-card">
        <h3>Test sozlamalari</h3>
        <div class="k-muted">Bu qiymatlarni faqat siz belgilaysiz. O'zgartirish keyingi testlarga ta'sir qiladi.</div>
        <div class="k-grid2">
          <div><label class="k-lbl">O'tish bali (%)</label><input class="k-in" id="s-otish" type="number" min="1" max="100" value="${k.otish_foiz}"></div>
          <div><label class="k-lbl">Urinishlar soni</label><input class="k-in" id="s-limit" type="number" min="1" max="50" value="${k.urinish_limit}"></div>
          <div><label class="k-lbl">Testdagi savollar soni</label><input class="k-in" id="s-soni" type="number" min="1" max="500" value="${k.savol_soni ?? ''}" placeholder="Bo'sh = barcha savollar">
            <div class="k-hint">Bazada ${k.savollar_soni_jami} ta savol bor. Savollar har urinishda aralashtiriladi.</div></div>
          <div><label class="k-lbl">Vaqt (daqiqa)</label><input class="k-in" id="s-vaqt" type="number" min="0" max="600" value="${k.vaqt_daqiqa}">
            <div class="k-hint">0 = vaqt cheklanmagan</div></div>
        </div>
        <label class="k-lbl">Sertifikatdagi direktor F.I.Sh.</label>
        <input class="k-in" id="s-direktor" maxlength="100" value="${esc(k.direktor_fio)}" placeholder="Masalan: Mamadaliyev Nuriddin Rustam oʻgʻli">
        <div class="k-hint">Sertifikatda «Direktor / Innovate IT School» yozuvi ostida chiqadi. Bo'sh qoldirsangiz, ism chiqmaydi.</div>
        <div class="k-err" id="s-err"></div>
        <div class="k-row" style="margin-top:12px;"><button class="k-btn" id="s-save">💾 Saqlash</button></div>
      </div>`);
    if (I) {
      $('m-gen').onclick = () => { const h = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const a = new Uint32Array(8); crypto.getRandomValues(a); $('m-parol').value = Array.from(a, x => h[x % h.length]).join(''); };
      $('m-copy').onclick = () => K.nusxala(`${I.url}\nLogin: ${$('m-login').value.trim()}${$('m-parol').value ? '\nParol: ' + $('m-parol').value : ''}`);
      $('m-save').onclick = async () => {
        $('m-err').textContent = '';
        const r = await req('PUT', '/api/kurs/admin/imtihon', { login: $('m-login').value, boshlanish: $('m-bosh').value, tugash: $('m-tug').value });
        if (!r.ok) { $('m-err').textContent = r.error || 'Xatolik'; return; }
        const parol = $('m-parol').value.trim();
        if (parol) {
          const p = await req('POST', '/api/kurs/admin/imtihon/parol', { parol });
          if (!p.ok) { $('m-err').textContent = p.error || 'Parolni saqlab bo\'lmadi'; return; }
        }
        toast('Saqlandi ✓'); tabSozlama();
      };
    }
    $('s-save').onclick = async () => {
      $('s-err').textContent = '';
      const body = {
        otish_foiz: $('s-otish').value, urinish_limit: $('s-limit').value,
        savol_soni: $('s-soni').value === '' ? null : $('s-soni').value,
        vaqt_daqiqa: $('s-vaqt').value, direktor_fio: $('s-direktor').value,
      };
      const r = await req('PUT', '/api/kurs/admin/sozlamalar', body);
      if (r.ok) { toast('Saqlandi ✓'); tabSozlama(); } else $('s-err').textContent = r.error || 'Xatolik';
    };
  }

  // ═══ 2. SAVOLLAR ═══
  let SAVOLLAR = [];
  async function tabSavollar() {
    yuklanmoqda();
    const r = await req('GET', '/api/kurs/admin/savollar');
    if (!r.ok) return view(`<div class="k-empty">❌ ${esc(r.error)}</div>`);
    SAVOLLAR = r.savollar;
    view(`
      <div class="k-row" style="margin-bottom:12px;">
        <h3 style="font-size:18px;">Savollar (${SAVOLLAR.length})</h3><span class="k-sp"></span>
        <button class="k-btn sec" id="q-bulk">📥 Matndan kiritish</button>
        <button class="k-btn" id="q-add">➕ Savol qo'shish</button>
      </div>
      ${SAVOLLAR.length ? SAVOLLAR.map((s, i) => `
        <div class="k-q">
          <div class="k-row"><div class="qt k-sp">${i + 1}. ${esc(s.matn)}</div>
            <button class="k-btn gray sm" data-e="${s.id}">✏️</button>
            <button class="k-btn red sm" data-d="${s.id}">🗑</button></div>
          ${s.variantlar.map((v, j) => `<div class="opt ${j === s.togri ? 't' : ''}">${'ABCDEF'[j]}) ${esc(v)}${j === s.togri ? ' ✓' : ''}</div>`).join('')}
        </div>`).join('') : '<div class="k-card k-empty">Hali savol yo\'q. «Savol qo\'shish» yoki «Matndan kiritish» tugmasini bosing.</div>'}`);
    $('q-add').onclick = () => savolModal(null);
    $('q-bulk').onclick = ommaviySavol;
    document.querySelectorAll('[data-e]').forEach(b => b.onclick = () => savolModal(SAVOLLAR.find(x => x.id == b.dataset.e)));
    document.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => {
      if (!confirm('Bu savolni o\'chirasizmi?')) return;
      const r = await req('DELETE', '/api/kurs/admin/savollar/' + b.dataset.d);
      if (r.ok) { toast('O\'chirildi'); tabSavollar(); } else toast(r.error, 'err');
    });
  }

  function savolModal(s) {
    const tahrir = s;                                   // null = yangi savol
    const D = {                                         // joriy holat (variant qo'shilganda/olib tashlanganda saqlanadi)
      matn: s ? s.matn : '',
      v: s ? s.variantlar.slice() : ['', '', '', ''],
      t: s ? s.togri : 0,
    };
    function oqi() {
      D.matn = $('m-matn').value;
      D.v = D.v.map((_, i) => document.querySelector(`[data-v="${i}"]`).value);
      const c = document.querySelector('input[name=tg]:checked');
      D.t = c ? +c.value : 0;
    }
    function chiz() {
      modal(`
        <h3>${tahrir ? 'Savolni tahrirlash' : 'Yangi savol'}</h3>
        <label class="k-lbl">Savol matni</label>
        <textarea class="k-in" id="m-matn" maxlength="1000">${esc(D.matn)}</textarea>
        <label class="k-lbl">Variantlar (to'g'ri javobni belgilang)</label>
        <div id="m-vars">${D.v.map((x, i) => `
          <div class="k-var"><input type="radio" name="tg" value="${i}" ${i === D.t ? 'checked' : ''}>
            <input class="k-in" data-v="${i}" maxlength="300" value="${esc(x)}" placeholder="${'ABCDEF'[i]} variant">
            ${D.v.length > 2 ? `<button class="k-btn gray sm" data-x="${i}">✕</button>` : ''}</div>`).join('')}</div>
        ${D.v.length < 6 ? '<button class="k-btn gray sm" id="m-addv">➕ Variant qo\'shish</button>' : ''}
        <div class="k-err" id="m-err"></div>
        <div class="btns"><button class="k-btn gray" id="m-cancel">Bekor</button><button class="k-btn" id="m-ok">Saqlash</button></div>`, { keng: true });
      $('m-cancel').onclick = closeModal;
      if ($('m-addv')) $('m-addv').onclick = () => { oqi(); D.v.push(''); chiz(); };
      document.querySelectorAll('[data-x]').forEach(b => b.onclick = () => {
        oqi();
        const i = +b.dataset.x;
        D.v.splice(i, 1);
        if (D.t === i) D.t = 0; else if (D.t > i) D.t--;
        chiz();
      });
      $('m-ok').onclick = async () => {
        oqi();
        const body = { matn: D.matn, variantlar: D.v, togri: D.t };
        const r = tahrir ? await req('PUT', '/api/kurs/admin/savollar/' + tahrir.id, body) : await req('POST', '/api/kurs/admin/savollar', body);
        if (r.ok) { closeModal(); toast('Saqlandi ✓'); tabSavollar(); } else $('m-err').textContent = r.error;
      };
    }
    chiz();
  }

  function ommaviySavol() {
    modal(`
      <h3>Savollarni matndan kiritish</h3>
      <div class="k-muted">Savollar bo'sh qator bilan ajratiladi. Birinchi qator — savol, keyingilari — variantlar. <b>To'g'ri javob oxiriga * qo'yiladi.</b></div>
      <textarea class="k-in" id="b-matn" style="min-height:240px;font-family:ui-monospace,monospace;font-size:13.5px;" placeholder="Kompyuterning miyasi qaysi?
A) Protsessor *
B) Monitor
C) Sichqoncha

Word qaysi turdagi dastur?
A) Matn muharriri *
B) Brauzer"></textarea>
      <div class="k-err" id="b-err"></div>
      <div class="btns"><button class="k-btn gray" id="b-cancel">Bekor</button><button class="k-btn" id="b-ok">Qo'shish</button></div>`, { keng: true });
    $('b-cancel').onclick = closeModal;
    $('b-ok').onclick = async () => {
      $('b-ok').disabled = true;
      const r = await req('POST', '/api/kurs/admin/savollar/ommaviy', { matn: $('b-matn').value });
      $('b-ok').disabled = false;
      if (r.ok) { closeModal(); toast(r.qoshildi + ' ta savol qo\'shildi ✓'); tabSavollar(); } else $('b-err').textContent = r.error;
    };
  }

  // ═══ 3. ISHTIROKCHILAR ═══
  let ISH = [];
  function holatBadge(i) {
    if (i.sertifikat_id) return i.sertifikat_holat === 'haqiqiy' ? `<span class="k-badge ${i.sertifikat_otdi === false ? 'warn' : 'ok'}" title="${i.sertifikat_otdi === false ? 'Faol ishtirok sertifikati (o\'tmagan)' : 'Muvaffaqiyatli tugatgan'}">🎓 ${esc(i.sertifikat_raqam)}</span>` : '<span class="k-badge err">Sertifikat bekor</span>';
    if (i.jarayonda) return '<span class="k-badge blue">Test ishlayapti</span>';
    if (i.urinishlar > 0) return '<span class="k-badge warn">O\'tmadi</span>';
    return '<span class="k-badge gray">Test boshlamagan</span>';
  }
  // Holat filtri: kalit → [yorliq, mos kelish sharti]
  const ISH_FILTRLAR = {
    all:        ['Barchasi',               () => true],
    boshlamagan:['Test boshlamagan',       i => !i.sertifikat_id && !i.jarayonda && !(i.urinishlar > 0)],
    jarayonda:  ['Test ishlayapti',        i => !i.sertifikat_id && !!i.jarayonda],
    otmadi:     ['O\'tmadi',               i => !i.sertifikat_id && !i.jarayonda && i.urinishlar > 0],
    tugatgan:   ['Tugatgan (sertifikat)',  i => i.sertifikat_id && i.sertifikat_holat === 'haqiqiy' && i.sertifikat_otdi !== false],
    faol:       ['Faol ishtirok',          i => i.sertifikat_id && i.sertifikat_holat === 'haqiqiy' && i.sertifikat_otdi === false],
    bekor:      ['Sertifikat bekor',       i => i.sertifikat_id && i.sertifikat_holat !== 'haqiqiy'],
  };
  let ISH_FILTR = 'all';   // tanlangan filtr o'chirish/tahrirlashdan keyin ham saqlanadi

  async function tabIshtirokchilar() {
    yuklanmoqda();
    const r = await req('GET', '/api/kurs/admin/ishtirokchilar');
    if (!r.ok) return view(`<div class="k-empty">❌ ${esc(r.error)}</div>`);
    ISH = r.ishtirokchilar;
    if (!ISH_FILTRLAR[ISH_FILTR]) ISH_FILTR = 'all';
    view(`
      <div class="k-row" style="margin-bottom:12px;">
        <h3 style="font-size:18px;" id="ish-sarlavha"></h3><span class="k-sp"></span>
      </div>
      <div class="k-muted" style="margin-bottom:10px;">Ishtirokchilar imtihonlar sahifasida o'zi ro'yxatdan o'tadi. Xato yozilgan yozuvni tuzating; 🗑 bilan o'chirsangiz, ishtirokchining barcha ma'lumoti (sertifikati bilan) butunlay o'chadi.</div>
      <div id="ish-filtr" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;"></div>
      <div class="k-card" style="padding:0;"><div class="k-tablewrap" id="ish-jadval"></div></div>`);
    ishFiltrChiz();
    ishJadval();
  }

  // Filtr tugmalari (har birida soni ko'rsatiladi). Bo'sh filtr — o'chirilgan holda emas, 0 bilan ko'rinadi.
  function ishFiltrChiz() {
    $('ish-filtr').innerHTML = Object.entries(ISH_FILTRLAR).map(([k, [nom, f]]) => {
      const n = ISH.filter(f).length;
      return `<button class="k-btn sm ${k === ISH_FILTR ? '' : 'gray'}" data-filtr="${k}">${esc(nom)} <b>${n}</b></button>`;
    }).join('');
    document.querySelectorAll('[data-filtr]').forEach(b => b.onclick = () => {
      ISH_FILTR = b.dataset.filtr; ishFiltrChiz(); ishJadval();
    });
  }

  function ishJadval() {
    const f = ISH_FILTRLAR[ISH_FILTR][1];
    const royxat = ISH.filter(f);
    $('ish-sarlavha').textContent = ISH_FILTR === 'all' ? `Ishtirokchilar (${ISH.length})` : `Ishtirokchilar (${royxat.length} / ${ISH.length})`;
    $('ish-jadval').innerHTML = royxat.length ? `<table class="k-table"><thead><tr><th>F.I.Sh.</th><th>Maktab</th><th>Holat</th><th>Urinish</th><th>Eng yaxshi</th><th></th></tr></thead><tbody>
        ${royxat.map(i => `<tr>
          <td><b>${esc([i.familiya, i.ism, i.sharif].filter(Boolean).join(' '))}</b><div class="k-muted">${esc(i.telefon)}</div><div class="k-muted">${esc(i.royxat_vaqti)}</div></td>
          <td>${esc(i.maktab_nomi) || '—'}</td>
          <td>${holatBadge(i)}</td>
          <td>${i.urinishlar}${i.qoshimcha_urinish ? ` <span class="k-muted">(+${i.qoshimcha_urinish})</span>` : ''}</td>
          <td>${i.eng_yaxshi != null ? Number(i.eng_yaxshi) + '%' : '—'}</td>
          <td><div class="k-acts">
            <button class="k-btn gray sm" data-plus="${i.id}" title="Qo'shimcha urinish">＋1</button>
            <button class="k-btn gray sm" data-edit="${i.id}">✏️</button>
            <button class="k-btn red sm" data-del="${i.id}">🗑</button></div></td></tr>`).join('')}
        </tbody></table>` : `<div class="k-empty">${ISH.length ? 'Bu holatda ishtirokchi yo\'q.' : 'Hali hech kim ro\'yxatdan o\'tmagan.'}</div>`;
    const topish = id => ISH.find(x => x.id == id);
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => ishModal(topish(b.dataset.edit)));
    document.querySelectorAll('[data-plus]').forEach(b => b.onclick = async () => {
      if (!confirm('Bu ishtirokchiga 1 ta qo\'shimcha urinish berasizmi?')) return;
      const r = await req('POST', `/api/kurs/admin/ishtirokchilar/${b.dataset.plus}/urinish-qoshish`, {});
      if (r.ok) { toast('Qo\'shimcha urinish berildi ✓'); tabIshtirokchilar(); } else toast(r.error, 'err');
    });
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const i = topish(b.dataset.del);
      const sert = i.sertifikat_id ? `\n\nSertifikati (${i.sertifikat_raqam}) ham o'chiriladi — uning tekshiruv kodi va QR kodi endi ishlamaydi.` : '';
      if (!confirm(`${i.familiya} ${i.ism} va uning barcha ma'lumotlari (test natijalari${i.sertifikat_id ? ', sertifikati' : ''}) butunlay o'chiriladi.${sert}\n\nBu amalni qaytarib bo'lmaydi. O'chirasizmi?`)) return;
      const r = await req('DELETE', '/api/kurs/admin/ishtirokchilar/' + i.id);
      if (r.ok) { toast('O\'chirildi'); tabIshtirokchilar(); } else toast(r.error, 'err');
    });
  }

  function ishModal(i) {
    modal(`
      <h3>Ishtirokchi ma'lumotini tuzatish</h3>
      <div class="k-grid2">
        <div><label class="k-lbl">Familiya</label><input class="k-in" id="f-fam" value="${esc(i.familiya)}"></div>
        <div><label class="k-lbl">Ism</label><input class="k-in" id="f-ism" value="${esc(i.ism)}"></div>
      </div>
      <label class="k-lbl">Sharif</label><input class="k-in" id="f-shar" value="${esc(i.sharif)}" placeholder="Masalan: Abdulla oʻgʻli">
      <div class="k-grid2">
        <div><label class="k-lbl">Telefon</label><input class="k-in" id="f-tel" value="${esc(i.telefon)}" inputmode="tel"></div>
        <div><label class="k-lbl">Maktab</label><input class="k-in" id="f-mak" value="${esc(i.maktab_nomi)}"></div>
      </div>
      <div class="k-hint">Sertifikat berilgan bo'lsa, undagi ism avtomatik o'zgarmaydi — «Sertifikatlar» bo'limida alohida tuzatiladi.</div>
      <div class="k-err" id="f-err"></div>
      <div class="btns"><button class="k-btn gray" id="f-cancel">Bekor</button><button class="k-btn" id="f-ok">Saqlash</button></div>`);
    $('f-cancel').onclick = closeModal;
    $('f-ok').onclick = async () => {
      const body = { familiya: $('f-fam').value, ism: $('f-ism').value, sharif: $('f-shar').value, telefon: $('f-tel').value, maktab_nomi: $('f-mak').value, fan: i.fan || '' };
      const r = await req('PUT', '/api/kurs/admin/ishtirokchilar/' + i.id, body);
      if (!r.ok) { $('f-err').textContent = r.error; return; }
      closeModal(); toast('Saqlandi ✓'); await tabIshtirokchilar();
    };
  }

  // ═══ 4. NATIJALAR ═══
  async function tabNatijalar() {
    yuklanmoqda();
    const r = await req('GET', '/api/kurs/admin/natijalar');
    if (!r.ok) return view(`<div class="k-empty">❌ ${esc(r.error)}</div>`);
    const N = r.natijalar;
    view(`
      <div class="k-row" style="margin-bottom:12px;"><h3 style="font-size:18px;">Test natijalari (${N.length})</h3><span class="k-sp"></span>
        ${N.length ? '<button class="k-btn sec" id="n-csv">⬇️ CSV</button>' : ''}</div>
      <div class="k-card" style="padding:0;"><div class="k-tablewrap">
      ${N.length ? `<table class="k-table"><thead><tr><th>F.I.Sh.</th><th>Maktab</th><th>To'g'ri</th><th>Natija</th><th>Vaqt</th></tr></thead><tbody>
        ${N.map(n => `<tr><td><b>${esc([n.familiya, n.ism, n.sharif].filter(Boolean).join(' '))}</b></td><td>${esc(n.maktab_nomi) || '—'}</td>
          <td>${n.togri_soni}/${n.jami}</td>
          <td><span class="k-badge ${n.otdi ? 'ok' : 'err'}">${Number(n.foiz)}% ${n.otdi ? '— o\'tdi' : '— o\'tmadi'}</span></td><td>${esc(n.tugagan)}</td></tr>`).join('')}
        </tbody></table>` : '<div class="k-empty">Hali test topshirilmagan.</div>'}
      </div></div>`);
    if ($('n-csv')) $('n-csv').onclick = () => {
      const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
      const csv = '﻿' + ['Familiya;Ism;Sharif;Maktab;Togri;Jami;Foiz;Natija;Vaqt'].concat(N.map(n =>
        [n.familiya, n.ism, n.sharif, n.maktab_nomi, n.togri_soni, n.jami, n.foiz, n.otdi ? 'otdi' : 'otmadi', n.tugagan].map(q).join(';'))).join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = 'natijalar.csv'; document.body.appendChild(a); a.click(); a.remove();
    };
  }

  // ═══ 5. SERTIFIKATLAR ═══
  async function tabSertifikatlar() {
    yuklanmoqda();
    const r = await req('GET', '/api/kurs/admin/sertifikatlar');
    if (!r.ok) return view(`<div class="k-empty">❌ ${esc(r.error)}</div>`);
    const S = r.sertifikatlar;
    view(`
      <h3 style="font-size:18px;margin-bottom:12px;">Berilgan sertifikatlar (${S.length})</h3>
      <div class="k-card" style="padding:0;"><div class="k-tablewrap">
      ${S.length ? `<table class="k-table"><thead><tr><th>Raqam</th><th>F.I.Sh.</th><th>Sana</th><th>Ball</th><th>Turi</th><th>Holat</th><th></th></tr></thead><tbody>
        ${S.map(s => `<tr><td><b>${esc(s.raqam)}</b></td><td>${esc([s.familiya, s.ism, s.sharif].filter(Boolean).join(' '))}</td><td>${esc(s.berilgan_sana)}</td><td>${Number(s.foiz)}%</td>
          <td>${s.otdi === false ? '<span class="k-badge warn">Faol ishtirok</span>' : '<span class="k-badge ok">Tugatgan</span>'}</td>
          <td>${s.holat === 'haqiqiy' ? '<span class="k-badge ok">Haqiqiy</span>' : `<span class="k-badge err" title="${esc(s.bekor_sababi)}">Bekor</span>`}</td>
          <td><div class="k-acts">
            ${s.holat === 'haqiqiy' ? `<button class="k-btn sec sm" data-pdf="${s.id}" data-r="${esc(s.raqam)}">📄 PDF</button>` : ''}
            <button class="k-btn gray sm" data-sed="${s.id}">✏️</button>
            ${s.holat === 'haqiqiy' ? `<button class="k-btn red sm" data-bek="${s.id}">⛔ Bekor</button>` : `<button class="k-btn ok sm" data-tik="${s.id}">♻️ Tiklash</button>`}
          </div></td></tr>`).join('')}</tbody></table>` : '<div class="k-empty">Hali sertifikat berilmagan.</div>'}
      </div></div>`);
    const topish = id => S.find(x => x.id == id);
    document.querySelectorAll('[data-pdf]').forEach(b => b.onclick = () => K.blob(`/api/kurs/admin/sertifikatlar/${b.dataset.pdf}/pdf`, `sertifikat-${b.dataset.r}.pdf`));
    document.querySelectorAll('[data-bek]').forEach(b => b.onclick = async () => {
      const sabab = prompt('Bekor qilish sababi (majburiy):');
      if (!sabab) return;
      const r = await req('POST', `/api/kurs/admin/sertifikatlar/${b.dataset.bek}/bekor`, { sabab });
      if (r.ok) { toast('Sertifikat bekor qilindi'); tabSertifikatlar(); } else toast(r.error, 'err');
    });
    document.querySelectorAll('[data-tik]').forEach(b => b.onclick = async () => {
      const r = await req('POST', `/api/kurs/admin/sertifikatlar/${b.dataset.tik}/tiklash`, {});
      if (r.ok) { toast('Tiklandi ✓'); tabSertifikatlar(); } else toast(r.error, 'err');
    });
    document.querySelectorAll('[data-sed]').forEach(b => b.onclick = () => {
      const s = topish(b.dataset.sed);
      modal(`
        <h3>F.I.Sh.ni tuzatish</h3><div class="k-muted">Sertifikat ${esc(s.raqam)}. PDF yangi ism bilan chiqadi.</div>
        <label class="k-lbl">Familiya</label><input class="k-in" id="e-fam" value="${esc(s.familiya)}">
        <label class="k-lbl">Ism</label><input class="k-in" id="e-ism" value="${esc(s.ism)}">
        <label class="k-lbl">Sharif</label><input class="k-in" id="e-shar" value="${esc(s.sharif)}">
        <div class="k-err" id="e-err"></div>
        <div class="btns"><button class="k-btn gray" id="e-c">Bekor</button><button class="k-btn" id="e-ok">Saqlash</button></div>`);
      $('e-c').onclick = closeModal;
      $('e-ok').onclick = async () => {
        const r = await req('PUT', '/api/kurs/admin/sertifikatlar/' + s.id, { familiya: $('e-fam').value, ism: $('e-ism').value, sharif: $('e-shar').value });
        if (r.ok) { closeModal(); toast('Saqlandi ✓'); tabSertifikatlar(); } else $('e-err').textContent = r.error;
      };
    });
  }
})();
