// ═══════════════════════════════════════════════════
//  InnovateIT — Chat (o'quvchi ↔ unga biriktirilgan o'qituvchi)
//  O'qituvchi va o'quvchi panellari uchun umumiy modul.
//  Backend: /api/chat/*  (js/api.js dagi `api` orqali, JWT bilan)
//
//  Ishlatish:
//    IITChat.init({ role: 'oqituvchi' | 'oquvchi', mount: element,
//                   navPush?, navRelease?, tab? });
//    IITChat.setActive(true|false);   // chat tabi ochiq/yopiqligi
//
//  Imkoniyatlar: matn, fayl/rasm biriktirish (📎, Ctrl+V, sudrab tashlash),
//  O'Z xabarini tahrirlash va o'chirish (o'chirilsa ikki tomondan ham yo'qoladi).
//
//  Real-time o'rniga qisqa interval bilan so'rov (polling):
//    • ochiq suhbat — har 4 soniyada (faqat tab ko'rinib turganda);
//      shu so'rov ikkinchi tomonning tahrir/o'chirishlarini ham olib keladi
//    • suhbatlar ro'yxati — har 12 soniyada
//    • o'qilmaganlar belgisi — har 25 soniyada (boshqa tablarda ham)
// ═══════════════════════════════════════════════════
(function () {
  'use strict';

  const CONV_POLL_MS  = 4000;
  const LIST_POLL_MS  = 12000;
  const BADGE_POLL_MS = 25000;
  const MAX_LEN       = 2000;
  const PAGE_SIZE     = 50;
  const MAX_FILE      = 5 * 1024 * 1024;     // backend bilan bir xil (5MB)
  const FILE_EXT      = ['jpg','jpeg','png','gif','webp','pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','zip'];
  const IMG_EXT       = ['jpg','jpeg','png','gif','webp'];
  const ACCEPT        = FILE_EXT.map(e => '.' + e).join(',');
  const SYNC_OVERLAP  = 5000;                // tahrir/o'chirish so'rovida server vaqtidan 5s orqaga (idempotent)

  const S = {
    role: null, root: null, navPush: null, navRelease: null, tab: 'chat',
    active: false,            // chat tabi hozir ko'rinib turibdimi
    list: [], listLoaded: false,
    hamroh: null,             // ochiq suhbatdosh (list elementi)
    msgs: [],                 // [{id|tmp, yuboruvchi, matn, yaratilgan, tmp?, failed?}]
    lastId: 0, oqilganId: 0, olderMore: false,
    tmpSeq: 0, convSeq: 0, sending: 0,
    timers: { conv: 0, list: 0, badge: 0 },
    mobileNavOn: false,       // telefonda ochiq suhbat uchun "orqaga" qatlami qo'yilganmi
    ownHist: false, skipPop: 0, // panel NAV bermasa — o'z history yozuvimiz
    initialized: false,
    pending: null,            // yuborilishi kutilayotgan fayl { file, localUrl|null }
    editing: null,            // tahrirlanayotgan xabar { id, matn, hasFile }
    draft: '',                // tahrirlashdan oldingi yozilgan matn
    menuFor: null,            // amallar tugmalari ochiq xabar id'si
    syncAt: null,             // tahrir/o'chirishlarni so'rash uchun boshlang'ich vaqt (ISO)
    blobs: new Map(),         // fayl xabar id -> blob: URL (JWT bilan olingan)
    dims: new Map(),          // rasm xabar id -> { w, h } (qayta chizishda sakramasligi uchun)
    stickUntil: 0,            // shu vaqtgacha rasm yuklanganda pastga tushiriladi
  };

  // ─── Yordamchilar ──────────────────────────────────
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const q  = (sel) => S.root.querySelector(sel);

  const TZ = 'Asia/Tashkent';
  const fmtTime = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtDay  = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }); // YYYY-MM-DD

  function dayKey(d)  { return fmtDay.format(d); }
  function dayLabel(d) {
    const k = dayKey(d), now = new Date();
    if (k === dayKey(now)) return 'Bugun';
    if (k === dayKey(new Date(now.getTime() - 86400000))) return 'Kecha';
    const [y, m, dd] = k.split('-');
    return `${dd}.${m}.${y}`;
  }
  function listTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (dayKey(d) === dayKey(new Date())) return fmtTime.format(d);
    const [, m, dd] = dayKey(d).split('-');
    return `${dd}.${m}`;
  }

  function isMobile() { return window.matchMedia('(max-width: 767px)').matches; }

  function extOf(name) { const m = /\.([^.\\/]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }
  function fileIcon(name) {
    const e = extOf(name);
    if (e === 'pdf') return '📕';
    if (e === 'doc' || e === 'docx') return '📘';
    if (e === 'xls' || e === 'xlsx' || e === 'csv') return '📗';
    if (e === 'ppt' || e === 'pptx') return '📙';
    if (e === 'zip') return '🗜️';
    if (e === 'txt') return '📄';
    return '📎';
  }

  // Ro'yxatdagi oxirgi xabar ko'rinishi (matn yoki fayl belgisi)
  function previewOf(x) {
    const text = x.oxirgi_matn ? String(x.oxirgi_matn).replace(/\s+/g, ' ') : '';
    if (x.oxirgi_fayl_nomi) {
      const label = x.oxirgi_fayl_rasm ? '🖼 ' : '📎 ';
      return label + (text || (x.oxirgi_fayl_rasm ? 'Rasm' : x.oxirgi_fayl_nomi));
    }
    return text;
  }
  function setLast(m) {
    if (!S.hamroh) return;
    S.hamroh.oxirgi_matn = m.matn || '';
    S.hamroh.oxirgi_yuboruvchi = m.yuboruvchi;
    S.hamroh.oxirgi_vaqt = m.yaratilgan;
    S.hamroh.oxirgi_fayl_nomi = m.fayl ? m.fayl.nomi : null;
    S.hamroh.oxirgi_fayl_rasm = m.fayl ? !!m.fayl.rasm : false;
  }

  function fullName(x) { return `${x.familiya || ''} ${x.ism || ''}`.trim() || '—'; }

  function avatarSrc(x) {
    if (S.role === 'oqituvchi') {            // suhbatdosh — o'quvchi
      return x.avatar === 'ayol' ? 'img/oquvchi-icon-ayol.png'
           : x.avatar === 'erkak' ? 'img/oquvchi-icon-erkak.png' : 'img/oquvchi-icon.png';
    }
    return x.avatar === 'ayol' ? 'img/oqituvchi-icon-ayol.png'   // suhbatdosh — o'qituvchi
         : x.avatar === 'erkak' ? 'img/oqituvchi-icon-erkak.png' : 'img/oqituvchi-icon.png';
  }

  function subLine(x) {
    if (S.role === 'oqituvchi') {
      const sinf = x.sinf ? (/sinf/i.test(x.sinf) ? x.sinf : x.sinf + '-sinf') : '';
      return [sinf, x.maktab].filter(Boolean).join(' • ');
    }
    return x.fan || "O'qituvchi";
  }

  // ─── Belgi (o'qilmaganlar) ─────────────────────────
  function setBadge(n) {
    n = Math.max(0, n | 0);
    document.querySelectorAll('.iitc-badge').forEach(el => {
      el.textContent = n > 99 ? '99+' : String(n);
      el.style.display = n ? 'inline-flex' : 'none';
    });
  }

  async function pollBadge() {
    if (document.hidden || S.active) return;     // chat ochiq bo'lsa, ro'yxat polling'i yangilaydi
    try {
      const r = await api.get('/api/chat/oqilmagan');
      if (r && r.ok) setBadge(r.soni);
    } catch (_) {}
  }

  // ─── Markup ────────────────────────────────────────
  function build() {
    const emptyConv = S.role === 'oqituvchi' ? "O'quvchini tanlang" : "O'qituvchini tanlang";
    S.root.innerHTML = `
      <div class="iitc" data-view="list">
        <aside class="iitc-side" aria-label="Suhbatlar">
          <div class="iitc-side-head">
            <input type="search" class="iitc-search" placeholder="Qidirish…" autocomplete="off" aria-label="Suhbatdoshni qidirish">
          </div>
          <div class="iitc-list" role="list"></div>
        </aside>
        <section class="iitc-main">
          <div class="iitc-empty">
            <div class="iitc-empty-ico">💬</div>
            <div class="iitc-empty-t">${emptyConv}</div>
            <div class="iitc-empty-s">Suhbat shu yerda ochiladi</div>
          </div>
          <div class="iitc-conv" style="display:none;">
            <header class="iitc-conv-head">
              <button type="button" class="iitc-back" aria-label="Suhbatlar ro'yxatiga qaytish">‹</button>
              <img class="iitc-conv-ava" alt="" width="38" height="38">
              <div class="iitc-conv-who">
                <div class="iitc-conv-name"></div>
                <div class="iitc-conv-sub"></div>
              </div>
            </header>
            <div class="iitc-msgs" role="log" aria-live="polite" aria-label="Xabarlar"></div>
            <div class="iitc-err" role="alert" style="display:none;"></div>
            <div class="iitc-ctx" style="display:none;"></div>
            <form class="iitc-form" autocomplete="off">
              <button type="button" class="iitc-attach" aria-label="Fayl yoki rasm biriktirish" title="Fayl yoki rasm biriktirish">📎</button>
              <input type="file" class="iitc-file-in" accept="${ACCEPT}" hidden>
              <textarea class="iitc-input" rows="1" maxlength="${MAX_LEN}" placeholder="Xabar yozing…" aria-label="Xabar matni"></textarea>
              <button type="submit" class="iitc-send" aria-label="Yuborish" disabled>➤</button>
            </form>
          </div>
        </section>
      </div>`;

    q('.iitc-search').addEventListener('input', renderList);
    q('.iitc-list').addEventListener('click', (e) => {
      const it = e.target.closest('.iitc-item');
      if (it) openConv(parseInt(it.dataset.id, 10));
    });
    q('.iitc-back').addEventListener('click', backToList);

    const form = q('.iitc-form'), input = q('.iitc-input');
    form.addEventListener('submit', (e) => { e.preventDefault(); onSubmit(); });
    input.addEventListener('input', () => { autosize(); updateSend(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && S.editing) { e.preventDefault(); cancelEdit(); return; }
      // Kompyuterda Enter — yuborish, Shift+Enter — yangi qator. Telefonda Enter — yangi qator.
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(pointer: fine)').matches) {
        e.preventDefault();
        onSubmit();
      }
    });

    // Fayl biriktirish: 📎 tugmasi, Ctrl+V (rasm), sudrab tashlash
    const fileIn = q('.iitc-file-in');
    q('.iitc-attach').addEventListener('click', () => { if (!S.editing) fileIn.click(); });
    fileIn.addEventListener('change', () => { if (fileIn.files[0]) setPending(fileIn.files[0]); fileIn.value = ''; });
    input.addEventListener('paste', (e) => {
      const f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0];
      if (f && !S.editing) { e.preventDefault(); setPending(f); }
    });
    const main = q('.iitc-main');
    main.addEventListener('dragover', (e) => {
      if (S.hamroh && !S.editing && e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault();
    });
    main.addEventListener('drop', (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && S.hamroh && !S.editing) { e.preventDefault(); setPending(f); }
    });
    q('.iitc-ctx').addEventListener('click', (e) => {
      if (e.target.closest('[data-ctx-x]')) { if (S.editing) cancelEdit(); else clearPending(); }
    });

    const msgs = q('.iitc-msgs');
    msgs.addEventListener('click', (e) => {
      const retry = e.target.closest('[data-retry]');
      if (retry) { retryMessage(retry.dataset.retry); return; }
      if (e.target.closest('.iitc-older')) { loadOlder(); return; }
      const act = e.target.closest('[data-act]');
      if (act) { toggleMenu(parseInt(act.dataset.act, 10)); return; }
      const ed = e.target.closest('[data-edit]');
      if (ed) { startEdit(parseInt(ed.dataset.edit, 10)); return; }
      const del = e.target.closest('[data-del]');
      if (del) { askDelete(parseInt(del.dataset.del, 10)); return; }
      const img = e.target.closest('[data-img]');   // diqqat: data-view — .iitc ildizida band
      if (img) { openLightbox(parseInt(img.dataset.img, 10)); return; }
      const dl = e.target.closest('[data-dl]');
      if (dl) { downloadFile(parseInt(dl.dataset.dl, 10), dl); return; }
    });
    // Rasm yuklanganda: o'lchamini eslab qolish va pastga yopishib turgan bo'lsa — pastga tushirish
    msgs.addEventListener('load', (e) => {
      const im = e.target;
      if (!im || im.tagName !== 'IMG' || !im.dataset.fid) return;
      const id = parseInt(im.dataset.fid, 10);
      if (im.naturalWidth) S.dims.set(id, { w: im.naturalWidth, h: im.naturalHeight });
      im.parentElement && im.parentElement.classList.remove('is-loading');
      if (Date.now() < S.stickUntil) msgs.scrollTop = msgs.scrollHeight;
    }, true);
  }

  // Menyu/oyna yopish: tashqariga bosish va Escape
  document.addEventListener('click', (e) => {
    if (S.menuFor && S.root && !e.target.closest('.iitc-act, .iitc-actions')) { S.menuFor = null; renderMsgs(false); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const lb = document.querySelector('.iitc-lb, .iitc-modal');
    if (lb) { lb.remove(); return; }
    if (S.menuFor && S.root) { S.menuFor = null; renderMsgs(false); }
  });

  function autosize() {
    const el = q('.iitc-input');
    el.style.height = 'auto';
    // Element yashirin paytda (masalan telefonda ro'yxat ko'rinishida) scrollHeight = 0 —
    // bunda balandlik qo'yilmaydi, aks holda maydon qisilib qoladi
    if (el.scrollHeight > 0) el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    else el.style.height = '';
  }

  // ─── Suhbatlar ro'yxati ────────────────────────────
  async function loadList(silent) {
    const body = q('.iitc-list');
    if (!silent && !S.listLoaded) body.innerHTML = '<div class="iitc-note"><div class="loading-spinner"></div></div>';
    try {
      const r = await api.get('/api/chat/suhbatlar');
      if (!r || !r.ok) throw new Error(r && r.error);
      S.list = r.suhbatlar || [];
      S.listLoaded = true;
      setBadge(S.list.reduce((n, x) => n + (x.oqilmagan || 0), 0));
      // Ochiq suhbatdosh endi biriktirilmagan bo'lsa — suhbat yopiladi
      if (S.hamroh && !S.list.some(x => x.hamroh_id === S.hamroh.hamroh_id)) closeConv();
      renderList();
    } catch (e) {
      if (!S.listLoaded) body.innerHTML = '<div class="iitc-note">⚠️ Yuklab bo\'lmadi. <button type="button" class="iitc-link" id="iitc-reload">Qayta urinish</button></div>';
      const b = q('#iitc-reload'); if (b) b.onclick = () => loadList();
    }
  }

  function renderList() {
    const body = q('.iitc-list');
    if (!S.listLoaded) return;
    const term = q('.iitc-search').value.trim().toLowerCase();
    const items = S.list.filter(x => !term || fullName(x).toLowerCase().includes(term));

    if (!S.list.length) {
      body.innerHTML = S.role === 'oqituvchi'
        ? '<div class="iitc-note">Sizga hali o\'quvchi biriktirilmagan.<br>«Guruh yaratish» bo\'limidan o\'quvchilarni biriktiring.</div>'
        : '<div class="iitc-note">Sizga hali o\'qituvchi biriktirilmagan.<br>Maktab adminingizga murojaat qiling.</div>';
      return;
    }
    if (!items.length) { body.innerHTML = '<div class="iitc-note">Hech narsa topilmadi</div>'; return; }

    const activeId = S.hamroh && S.hamroh.hamroh_id;
    body.innerHTML = items.map(x => {
      const mine = x.oxirgi_yuboruvchi === S.role;
      const pv = previewOf(x);
      const prev = pv
        ? `${mine ? 'Siz: ' : ''}${esc(pv)}`
        : `<span class="iitc-muted">${esc(subLine(x)) || 'Suhbatni boshlang'}</span>`;
      return `
        <button type="button" role="listitem" class="iitc-item${x.hamroh_id === activeId ? ' active' : ''}" data-id="${x.hamroh_id}">
          <img class="iitc-ava" src="${avatarSrc(x)}" alt="" width="42" height="42">
          <span class="iitc-item-mid">
            <span class="iitc-item-name">${esc(fullName(x))}</span>
            <span class="iitc-item-prev">${prev}</span>
          </span>
          <span class="iitc-item-end">
            <span class="iitc-item-time">${esc(listTime(x.oxirgi_vaqt))}</span>
            ${x.oqilmagan ? `<span class="iitc-unread">${x.oqilmagan > 99 ? '99+' : x.oqilmagan}</span>` : ''}
          </span>
        </button>`;
    }).join('');
  }

  // ─── Telefonning "orqaga" tugmasi ──────────────────
  // Telefonda suhbat ro'yxatning ustiga to'liq ekran ochiladi. "Orqaga" ro'yxatga
  // qaytarishi kerak (panelni yopmasligi). O'qituvchi paneli o'zining navPush/navRelease
  // tizimini beradi; o'quvchi panelida bunday tizim yo'q — shuning uchun modul
  // o'zining history yozuvini qo'shadi.
  function pushLayer() {
    if (S.mobileNavOn) return;
    S.mobileNavOn = true;
    if (S.navPush) {
      S.navPush('chatConv', () => { S.mobileNavOn = false; backToList(true); }, S.tab);
    } else {
      try { history.pushState({ iitc: 1 }, ''); S.ownHist = true; } catch (_) { S.ownHist = false; }
    }
  }
  function releaseLayer() {           // sahifa ichidagi "‹" tugmasi bilan yopilganda
    if (!S.mobileNavOn) return;
    S.mobileNavOn = false;
    if (S.navRelease) { S.navRelease('chatConv'); return; }
    if (S.ownHist) {
      S.ownHist = false; S.skipPop++;
      setTimeout(() => { S.skipPop = 0; }, 700);   // brauzer popstate yubormasa ham qulflanib qolmasin
      try { history.back(); } catch (_) { S.skipPop = 0; }
    }
  }
  window.addEventListener('popstate', () => {
    if (S.skipPop > 0) { S.skipPop--; return; }
    if (S.ownHist && S.root) { S.ownHist = false; S.mobileNavOn = false; backToList(true); }
  });

  // ─── Suhbat ────────────────────────────────────────
  function showView(v) { q('.iitc').dataset.view = v; }

  async function openConv(id) {
    const h = S.list.find(x => x.hamroh_id === id);
    if (!h) return;
    if (S.hamroh && S.hamroh.hamroh_id === id && !isMobile()) { q('.iitc-input').focus(); return; }

    S.hamroh = h;
    S.msgs = []; S.lastId = 0; S.oqilganId = 0; S.olderMore = false;
    S.editing = null; S.draft = ''; S.menuFor = null; S.syncAt = null;
    clearPending(true);
    const my = ++S.convSeq;

    q('.iitc-empty').style.display = 'none';
    q('.iitc-conv').style.display = 'flex';
    q('.iitc-conv-ava').src = avatarSrc(h);
    q('.iitc-conv-name').textContent = fullName(h);
    q('.iitc-conv-sub').textContent = subLine(h);
    q('.iitc-input').value = '';
    renderCtx(); updateSend();
    showErr('');
    q('.iitc-msgs').innerHTML = '<div class="iitc-note"><div class="loading-spinner"></div></div>';
    showView('conv');
    autosize();                       // ko'rinish almashgandan keyin o'lchanadi
    renderList();

    if (isMobile()) pushLayer();

    try {
      const r = await api.get('/api/chat/xabarlar', { hamroh: id });
      if (my !== S.convSeq) return;                       // boshqa suhbatga o'tib ketilgan
      if (!r || !r.ok) throw new Error(r && r.error);
      S.msgs = r.xabarlar || [];
      S.lastId = S.msgs.length ? S.msgs[S.msgs.length - 1].id : 0;
      S.oqilganId = r.oqilgan_id || 0;
      markSync(r);
      S.olderMore = S.msgs.length >= PAGE_SIZE;
      h.oqilmagan = 0;                                    // ochish o'qilgan deb belgilaydi
      renderMsgs(true);
      renderList();
      pollTotalBadge();
      if (!isMobile()) q('.iitc-input').focus();
    } catch (e) {
      if (my !== S.convSeq) return;
      q('.iitc-msgs').innerHTML = `<div class="iitc-note">⚠️ ${esc((e && e.message) || 'Xabarlarni yuklab bo\'lmadi')}</div>`;
    }
  }

  function pollTotalBadge() {
    setBadge(S.list.reduce((n, x) => n + (x.oqilmagan || 0), 0));
  }

  function closeConv() {
    S.hamroh = null; S.msgs = []; S.convSeq++;
    S.editing = null; S.menuFor = null; clearPending(true);
    if (!S.root) return;
    q('.iitc-conv').style.display = 'none';
    q('.iitc-empty').style.display = '';
    showView('list');
    renderList();
  }

  function backToList(fromNav) {
    if (fromNav !== true) releaseLayer();
    S.hamroh = null; S.convSeq++;
    S.editing = null; S.menuFor = null; clearPending(true);
    q('.iitc-conv').style.display = 'none';
    q('.iitc-empty').style.display = '';
    showView('list');
    renderList();
    loadList(true);
  }

  function showErr(msg) {
    const el = q('.iitc-err');
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
  }

  // ─── Xabarlarni chizish ────────────────────────────
  function fileHtml(m) {
    const f = m.fayl;
    if (!f) return '';
    const real = typeof m.id === 'number';              // yuborilib bo'lgan (serverda id bor)
    if (f.rasm) {
      const url = real ? S.blobs.get(m.id) : m.localUrl;
      const d = S.dims.get(m.id);
      const style = d ? ` style="aspect-ratio:${d.w}/${d.h}"` : '';
      const tag = real
        ? `<img data-fid="${m.id}" alt="${esc(f.nomi)}"${url ? ` src="${url}"` : ''}${style}>`
        : `<img alt="${esc(f.nomi)}"${url ? ` src="${url}"` : ''}>`;
      return real
        ? `<button type="button" class="iitc-img${url && d ? '' : ' is-loading'}" data-img="${m.id}" aria-label="Rasmni ochish: ${esc(f.nomi)}">${tag}</button>`
        : `<div class="iitc-img">${tag}</div>`;
    }
    const inner = `
      <span class="iitc-file-ico" aria-hidden="true">${fileIcon(f.nomi)}</span>
      <span class="iitc-file-txt"><span class="iitc-file-name">${esc(f.nomi)}</span><span class="iitc-file-size">${esc(fmtSize(f.hajm))}${real ? ' · yuklab olish' : ''}</span></span>`;
    return real
      ? `<button type="button" class="iitc-file" data-dl="${m.id}">${inner}</button>`
      : `<div class="iitc-file">${inner}</div>`;
  }

  function renderMsgs(forceBottom) {
    const box = q('.iitc-msgs');
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
    const prevH = box.scrollHeight, prevTop = box.scrollTop;

    if (!S.msgs.length) {
      box.innerHTML = `<div class="iitc-note">Hali xabar yo'q.<br>Birinchi xabarni siz yozing 👋</div>`;
      return;
    }

    let html = S.olderMore ? '<button type="button" class="iitc-older">⬆ Oldingi xabarlar</button>' : '';
    let lastDay = '';
    for (const m of S.msgs) {
      const d = new Date(m.yaratilgan), k = dayKey(d);
      if (k !== lastDay) { html += `<div class="iitc-day"><span>${esc(dayLabel(d))}</span></div>`; lastDay = k; }
      const mine = m.yuboruvchi === S.role;
      const real = typeof m.id === 'number';
      let meta = '';
      if (m.tahrirlangan) meta += 'tahrirlangan · ';
      meta += esc(fmtTime.format(d));
      if (mine) {
        if (m.failed)      meta = '⚠️ Yuborilmadi';
        else if (m.tmp)    meta += ' <span class="iitc-tick" aria-label="Yuborilmoqda">🕓</span>';
        else if (m.id <= S.oqilganId) meta += ' <span class="iitc-tick read" aria-label="O\'qildi">✓✓</span>';
        else               meta += ' <span class="iitc-tick" aria-label="Yuborildi">✓</span>';
      }
      // Faqat O'Z yuborilgan xabarlar uchun: ⋮ → ✏️ tahrirlash / 🗑 o'chirish
      let act = '';
      if (mine && real && !m.failed) {
        const open = S.menuFor === m.id;
        act = `<button type="button" class="iitc-act${open ? ' open' : ''}" data-act="${m.id}" aria-label="Xabar amallari" aria-expanded="${open}">⋮</button>`
            + (open ? `<span class="iitc-actions" role="menu">
                 <button type="button" role="menuitem" data-edit="${m.id}" title="Tahrirlash" aria-label="Tahrirlash">✏️</button>
                 <button type="button" role="menuitem" data-del="${m.id}" title="O'chirish" aria-label="O'chirish">🗑️</button>
               </span>` : '');
      }
      const cls = 'iitc-bubble' + (m.failed ? ' failed' : '') + (m.fayl && m.fayl.rasm && !m.matn ? ' media' : '');
      html += `
        <div class="iitc-row ${mine ? 'mine' : 'theirs'}${S.editing && S.editing.id === m.id ? ' editing' : ''}">
          ${act}
          <div class="${cls}">
            ${fileHtml(m)}
            ${m.matn ? `<div class="iitc-text">${esc(m.matn)}</div>` : ''}
            <div class="iitc-meta">${meta}${m.failed ? ` · <button type="button" class="iitc-link" data-retry="${esc(m.id)}">Qayta yuborish</button>` : ''}</div>
          </div>
        </div>`;
    }
    box.innerHTML = html;

    const stick = forceBottom || nearBottom;
    if (stick) { box.scrollTop = box.scrollHeight; S.stickUntil = Date.now() + 3000; }
    else box.scrollTop = prevTop + (box.scrollHeight - prevH);   // yuqoriga o'qib turganda sakramasin
    hydrateImages();
  }

  // ─── Fayllar (JWT bilan olinadi → blob: URL) ───────
  async function getBlobUrl(id) {
    if (S.blobs.has(id)) return S.blobs.get(id);
    const t = tokenStore.get();
    const res = await fetch(`${BASE}/api/chat/fayl/${id}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
    if (res.status === 401) { handleUnauthorized(); throw new Error('Seans tugadi'); }
    if (!res.ok) throw new Error('Faylni olib bo\'lmadi');
    const url = URL.createObjectURL(await res.blob());
    S.blobs.set(id, url);
    return url;
  }

  const loadingImgs = new Set();
  function hydrateImages() {
    if (!S.root) return;
    q('.iitc-msgs').querySelectorAll('img[data-fid]:not([src])').forEach((img) => {
      const id = parseInt(img.dataset.fid, 10);
      if (loadingImgs.has(id)) return;
      loadingImgs.add(id);
      getBlobUrl(id).then((url) => {
        if (!S.root) return;
        q('.iitc-msgs').querySelectorAll(`img[data-fid="${id}"]`).forEach(el => { el.src = url; });
      }).catch(() => {
        if (!S.root) return;
        q('.iitc-msgs').querySelectorAll(`img[data-fid="${id}"]`).forEach(el => {
          el.removeAttribute('data-fid');
          if (el.parentElement) { el.parentElement.classList.remove('is-loading'); el.parentElement.classList.add('broken'); el.parentElement.textContent = '🖼 Rasm yuklanmadi'; }
        });
      }).finally(() => loadingImgs.delete(id));
    });
  }

  async function downloadFile(id, btn) {
    const m = S.msgs.find(x => x.id === id);
    if (!m || !m.fayl || (btn && btn.dataset.busy)) return;
    if (btn) btn.dataset.busy = '1';
    try {
      const url = await getBlobUrl(id);
      const a = document.createElement('a');
      a.href = url; a.download = m.fayl.nomi || 'fayl';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { showErr((e && e.message) || 'Faylni yuklab bo\'lmadi'); }
    finally { if (btn) delete btn.dataset.busy; }
  }

  async function openLightbox(id) {
    const m = S.msgs.find(x => x.id === id);
    if (!m || !m.fayl) return;
    let url;
    try { url = await getBlobUrl(id); } catch (e) { showErr((e && e.message) || 'Rasmni ochib bo\'lmadi'); return; }
    const lb = document.createElement('div');
    lb.className = 'iitc-lb';
    lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-label', 'Rasm');
    lb.innerHTML = `
      <div class="iitc-lb-bar">
        <span class="iitc-lb-name">${esc(m.fayl.nomi)}</span>
        <a class="iitc-lb-btn" href="${url}" download="${esc(m.fayl.nomi)}">⬇ Yuklab olish</a>
        <button type="button" class="iitc-lb-btn" data-close aria-label="Yopish">✕</button>
      </div>
      <img src="${url}" alt="${esc(m.fayl.nomi)}">`;
    lb.addEventListener('click', (e) => { if (e.target === lb || e.target.closest('[data-close]') || e.target.tagName === 'IMG') lb.remove(); });
    document.body.appendChild(lb);
  }

  async function loadOlder() {
    if (!S.hamroh || !S.olderMore) return;
    const first = S.msgs.find(m => typeof m.id === 'number');
    if (!first) return;
    const my = S.convSeq, box = q('.iitc-msgs'), prevH = box.scrollHeight;
    try {
      const r = await api.get('/api/chat/xabarlar', { hamroh: S.hamroh.hamroh_id, before: first.id });
      if (my !== S.convSeq || !r || !r.ok) return;
      const old = r.xabarlar || [];
      const have = new Set(S.msgs.map(m => m.id));
      S.msgs = old.filter(m => !have.has(m.id)).concat(S.msgs);
      S.olderMore = !!r.yana_bor;
      renderMsgs(false);
      box.scrollTop = box.scrollHeight - prevH;           // o'qiyotgan joyda qolish
    } catch (_) {}
  }

  // ─── Yuborish ──────────────────────────────────────
  function updateSend() {
    if (!S.root) return;
    const has = !!q('.iitc-input').value.trim();
    q('.iitc-send').disabled = S.editing ? !(has || S.editing.hasFile) : !(has || S.pending);
    q('.iitc-attach').disabled = !!S.editing;
  }

  function onSubmit() { if (S.editing) submitEdit(); else sendMessage(); }

  // Biriktiriladigan fayl: tekshirish va oldindan ko'rsatish
  function setPending(file) {
    if (!S.hamroh || !file) return;
    const e = extOf(file.name) || (file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : '');
    if (!FILE_EXT.includes(e)) { showErr("Bu fayl turi qo'llab-quvvatlanmaydi. Rasm, PDF, Word, Excel, PowerPoint, TXT, CSV yoki ZIP yuboring"); return; }
    if (file.size > MAX_FILE) { showErr(`Fayl hajmi ${MAX_FILE / 1024 / 1024}MB dan katta bo'lmasligi kerak (${fmtSize(file.size)})`); return; }
    if (!file.size) { showErr("Fayl bo'sh"); return; }
    // Vaqtinchalik nomsiz (Ctrl+V) rasmga nom beramiz
    if (!file.name || !extOf(file.name)) {
      try { file = new File([file], `rasm-${Date.now()}.${e}`, { type: file.type }); } catch (_) {}
    }
    clearPending(true);
    showErr('');
    S.pending = { file, localUrl: IMG_EXT.includes(e) ? URL.createObjectURL(file) : null };
    renderCtx(); updateSend();
    if (!isMobile()) q('.iitc-input').focus();
  }

  function clearPending(silent) {
    if (S.pending && S.pending.localUrl && !S.pending.keepUrl) URL.revokeObjectURL(S.pending.localUrl);
    S.pending = null;
    if (!silent) { renderCtx(); updateSend(); }
  }

  // Yozish maydoni ustidagi qator: tanlangan fayl yoki "tahrirlash" holati
  function renderCtx() {
    if (!S.root) return;
    const box = q('.iitc-ctx');
    if (S.editing) {
      const m = S.msgs.find(x => x.id === S.editing.id);
      const txt = (m && m.matn) || (m && m.fayl && m.fayl.nomi) || '';
      box.innerHTML = `<span class="iitc-ctx-ico" aria-hidden="true">✏️</span>
        <span class="iitc-ctx-txt"><b>Tahrirlash</b><span>${esc(txt.replace(/\s+/g, ' '))}</span></span>
        <button type="button" class="iitc-ctx-x" data-ctx-x aria-label="Tahrirlashni bekor qilish">✕</button>`;
      box.style.display = 'flex';
    } else if (S.pending) {
      const f = S.pending.file;
      box.innerHTML = `${S.pending.localUrl
          ? `<img class="iitc-ctx-thumb" src="${S.pending.localUrl}" alt="">`
          : `<span class="iitc-ctx-ico" aria-hidden="true">${fileIcon(f.name)}</span>`}
        <span class="iitc-ctx-txt"><b>${esc(f.name)}</b><span>${esc(fmtSize(f.size))}</span></span>
        <button type="button" class="iitc-ctx-x" data-ctx-x aria-label="Faylni olib tashlash">✕</button>`;
      box.style.display = 'flex';
    } else {
      box.innerHTML = '';
      box.style.display = 'none';
    }
  }

  async function sendMessage() {
    const input = q('.iitc-input');
    const matn = input.value.replace(/\r\n/g, '\n').trim();
    const pend = S.pending;
    if ((!matn && !pend) || !S.hamroh) return;
    if (matn.length > MAX_LEN) { showErr(`Xabar ${MAX_LEN} belgidan oshmasligi kerak`); return; }

    input.value = ''; autosize(); showErr('');
    const tmp = { id: 'tmp-' + (++S.tmpSeq), tmp: true, yuboruvchi: S.role, matn, yaratilgan: new Date().toISOString() };
    if (pend) {
      tmp.file = pend.file; tmp.localUrl = pend.localUrl;
      tmp.fayl = { nomi: pend.file.name, hajm: pend.file.size, rasm: !!pend.localUrl };
      if (pend.localUrl) pend.keepUrl = true;           // vaqtinchalik ko'rinish uchun kerak — bekor qilinmasin
    }
    S.pending = null;
    renderCtx(); updateSend();
    S.msgs.push(tmp);
    renderMsgs(true);
    await doSend(tmp);
    if (!isMobile()) input.focus();
  }

  // JSON (faqat matn) yoki multipart (fayl bilan) yuborish
  async function postMessage(hamrohId, matn, file) {
    if (!file) return api.post('/api/chat/xabarlar', { hamroh: hamrohId, matn });
    const fd = new FormData();
    fd.append('hamroh', String(hamrohId));
    fd.append('matn', matn || '');
    fd.append('fayl', file, file.name);
    const t = tokenStore.get();
    const res = await fetch(`${BASE}/api/chat/xabarlar`, { method: 'POST', headers: t ? { Authorization: `Bearer ${t}` } : {}, body: fd });
    if (res.status === 401) { handleUnauthorized(); return { ok: false, error: 'Seans tugadi' }; }
    if (res.status === 413) return { ok: false, error: 'Fayl juda katta' };
    return res.json().catch(() => ({ ok: false, error: 'Server javobi noto\'g\'ri' }));
  }

  async function doSend(tmp) {
    const hamrohId = S.hamroh && S.hamroh.hamroh_id, my = S.convSeq;
    try {
      const r = await postMessage(hamrohId, tmp.matn, tmp.file);
      if (my !== S.convSeq) return;
      S.msgs = S.msgs.filter(m => m !== tmp);
      if (r && r.ok && r.xabar) {
        // Yuklangan rasm uchun lokal ko'rinishni qayta ishlatamiz — qayta yuklash/miltillash bo'lmasin
        if (tmp.localUrl && r.xabar.fayl && r.xabar.fayl.rasm) S.blobs.set(r.xabar.id, tmp.localUrl);
        else if (tmp.localUrl) URL.revokeObjectURL(tmp.localUrl);
        if (!S.msgs.some(m => m.id === r.xabar.id)) S.msgs.push(r.xabar);   // polling allaqachon qo'shgan bo'lishi mumkin
        S.msgs.sort(cmp);
        S.lastId = Math.max(S.lastId, r.xabar.id);
        setLast(r.xabar); S.list.sort(listCmp);
        renderList();
      } else {
        tmp.failed = true; tmp.tmp = false; S.msgs.push(tmp);
        showErr((r && r.error) || 'Xabar yuborilmadi');
        if (r && /yozishish mumkin emas/.test(r.error || '')) loadList(true);
      }
      renderMsgs(true);
    } catch (e) {
      if (my !== S.convSeq) return;
      S.msgs = S.msgs.filter(m => m !== tmp);
      tmp.failed = true; tmp.tmp = false; S.msgs.push(tmp);
      showErr("Server bilan aloqa yo'q");
      renderMsgs(true);
    }
  }

  function retryMessage(tmpId) {
    const m = S.msgs.find(x => x.id === tmpId && x.failed);
    if (!m) return;
    m.failed = false; m.tmp = true; showErr('');
    renderMsgs(true);
    doSend(m);
  }

  // ─── Tahrirlash ────────────────────────────────────
  function toggleMenu(id) {
    S.menuFor = S.menuFor === id ? null : id;
    renderMsgs(false);
  }

  function startEdit(id) {
    const m = S.msgs.find(x => x.id === id);
    if (!m || m.yuboruvchi !== S.role) return;
    const input = q('.iitc-input');
    if (!S.editing) S.draft = input.value;
    clearPending(true);
    S.editing = { id, matn: m.matn || '', hasFile: !!m.fayl };
    S.menuFor = null;
    showErr('');
    input.value = m.matn || '';
    renderCtx(); autosize(); updateSend(); renderMsgs(false);
    input.focus();
    try { input.setSelectionRange(input.value.length, input.value.length); } catch (_) {}
  }

  function cancelEdit() {
    if (!S.editing) return;
    S.editing = null;
    const input = q('.iitc-input');
    input.value = S.draft || ''; S.draft = '';
    showErr('');
    renderCtx(); autosize(); updateSend(); renderMsgs(false);
  }

  async function submitEdit() {
    const ed = S.editing;
    if (!ed || !S.hamroh) return;
    const input = q('.iitc-input');
    const matn = input.value.replace(/\r\n/g, '\n').trim();
    if (!matn && !ed.hasFile) { showErr("Xabar bo'sh bo'lmasligi kerak. Butunlay olib tashlash uchun o'chiring"); return; }
    if (matn.length > MAX_LEN) { showErr(`Xabar ${MAX_LEN} belgidan oshmasligi kerak`); return; }
    if (matn === ed.matn) { cancelEdit(); return; }           // o'zgarish yo'q

    const my = S.convSeq;
    q('.iitc-send').disabled = true; showErr('');
    try {
      const r = await api.put(`/api/chat/xabarlar/${ed.id}`, { matn });
      if (my !== S.convSeq) return;
      if (r && r.ok && r.xabar) {
        const i = S.msgs.findIndex(x => x.id === ed.id);
        if (i >= 0) S.msgs[i] = r.xabar;
        S.editing = null;
        input.value = S.draft || ''; S.draft = '';
        renderCtx(); autosize(); updateSend(); renderMsgs(false);
        loadList(true);
      } else {
        showErr((r && r.error) || 'Xabarni tahrirlab bo\'lmadi');
        if (r && /topilmadi/.test(r.error || '')) { S.editing = null; renderCtx(); loadList(true); pollConv(); }
        updateSend();
      }
    } catch (_) { if (my === S.convSeq) { showErr("Server bilan aloqa yo'q"); updateSend(); } }
  }

  // ─── O'chirish (ikkala tomondan) ───────────────────
  function askDelete(id) {
    const m = S.msgs.find(x => x.id === id);
    if (!m || m.yuboruvchi !== S.role) return;
    S.menuFor = null; renderMsgs(false);

    const box = document.createElement('div');
    box.className = 'iitc-modal';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', "Xabarni o'chirish");
    box.innerHTML = `
      <div class="iitc-modal-card">
        <div class="iitc-modal-t">Xabar o'chirilsinmi?</div>
        <div class="iitc-modal-s">Xabar <b>ikkala tomondan ham</b> o'chadi va uni qaytarib bo'lmaydi.</div>
        <div class="iitc-modal-btns">
          <button type="button" class="iitc-btn" data-no>Bekor qilish</button>
          <button type="button" class="iitc-btn danger" data-yes>O'chirish</button>
        </div>
      </div>`;
    box.addEventListener('click', async (e) => {
      if (e.target === box || e.target.closest('[data-no]')) { box.remove(); return; }
      const yes = e.target.closest('[data-yes]');
      if (!yes || yes.disabled) return;
      yes.disabled = true; yes.textContent = 'O\'chirilmoqda…';
      const my = S.convSeq;
      try {
        const r = await api.del(`/api/chat/xabarlar/${id}`);
        box.remove();
        if (my !== S.convSeq) return;
        if (r && r.ok) { removeMessage(id); loadList(true); }
        else {
          showErr((r && r.error) || 'Xabarni o\'chirib bo\'lmadi');
          if (r && /topilmadi/.test(r.error || '')) { removeMessage(id); loadList(true); }
        }
      } catch (_) { box.remove(); showErr("Server bilan aloqa yo'q"); }
    });
    // Modal suhbat paneli ichida (o'sha element ustida) ochiladi
    q('.iitc').appendChild(box);
    const no = box.querySelector('[data-no]'); if (no) no.focus();
  }

  // Xabarni mahalliy ro'yxatdan olib tashlash (o'chirilgan)
  function removeMessage(id) {
    const i = S.msgs.findIndex(x => x.id === id);
    if (i < 0) return;
    const [gone] = S.msgs.splice(i, 1);
    const url = S.blobs.get(id);
    if (url) { URL.revokeObjectURL(url); S.blobs.delete(id); }
    S.dims.delete(id);
    if (S.editing && S.editing.id === id) { S.editing = null; const inp = q('.iitc-input'); inp.value = S.draft || ''; S.draft = ''; renderCtx(); autosize(); updateSend(); }
    if (S.menuFor === id) S.menuFor = null;
    renderMsgs(false);
    return gone;
  }

  // ─── Ikkinchi tomon (yoki boshqa qurilma) o'zgarishlari ───
  function markSync(r) {
    const t = r && r.server_vaqt ? new Date(r.server_vaqt).getTime() : NaN;
    if (!isNaN(t)) S.syncAt = new Date(t - SYNC_OVERLAP).toISOString();
  }

  function applyChanges(list) {
    let changed = false, deleted = false;
    for (const c of list) {
      const i = S.msgs.findIndex(m => m.id === c.id);
      if (i < 0) continue;                               // yuklanmagan (eski) xabar — kerak emas
      if (c.ochirilgan) { removeMessage(c.id); deleted = true; }
      else if (S.msgs[i].matn !== c.matn || S.msgs[i].tahrirlangan !== c.tahrirlangan) {
        S.msgs[i] = c; changed = true;
        if (S.editing && S.editing.id === c.id) S.editing.matn = c.matn || '';
      }
    }
    return { changed, deleted };
  }

  // Tartib: haqiqiy xabarlar id bo'yicha, vaqtinchalik (yuborilayotgan/xato) — oxirida
  function cmp(a, b) {
    const at = a.tmp || a.failed, bt = b.tmp || b.failed;
    if (at !== bt) return at ? 1 : -1;
    if (at) return 0;
    return a.id - b.id;
  }
  function listCmp(a, b) {
    if (!a.oxirgi_vaqt && !b.oxirgi_vaqt) return 0;
    if (!a.oxirgi_vaqt) return 1;
    if (!b.oxirgi_vaqt) return -1;
    return new Date(b.oxirgi_vaqt) - new Date(a.oxirgi_vaqt);
  }

  // ─── Polling ───────────────────────────────────────
  async function pollConv() {
    if (!S.active || document.hidden || !S.hamroh) return;
    const my = S.convSeq, id = S.hamroh.hamroh_id;
    try {
      const params = { hamroh: id, after: S.lastId };
      if (S.syncAt) params.ozgarish = S.syncAt;
      const r = await api.get('/api/chat/xabarlar', params);
      if (my !== S.convSeq || !r) return;
      if (!r.ok) { if (/yozishish mumkin emas/.test(r.error || '')) loadList(true); return; }
      let changed = false;
      const fresh = (r.xabarlar || []).filter(m => !S.msgs.some(x => x.id === m.id));
      if (fresh.length) {
        S.msgs.push(...fresh); S.msgs.sort(cmp);
        S.lastId = Math.max(S.lastId, ...fresh.map(m => m.id));
        setLast(fresh[fresh.length - 1]);
        S.hamroh.oqilmagan = 0;
        changed = true;
      }
      if (r.ozgargan && r.ozgargan.length) {
        const c = applyChanges(r.ozgargan);
        if (c.changed || c.deleted) changed = true;
        if (c.deleted) loadList(true);                    // oxirgi xabar ko'rinishi yangilansin
        else if (c.changed) loadList(true);
      }
      markSync(r);
      if ((r.oqilgan_id || 0) !== S.oqilganId) { S.oqilganId = r.oqilgan_id || 0; changed = true; }
      if (changed) { renderMsgs(false); renderList(); pollTotalBadge(); }
    } catch (_) {}
  }

  function startTimers() {
    stopTimers();
    S.timers.conv = setInterval(pollConv, CONV_POLL_MS);
    S.timers.list = setInterval(() => { if (S.active && !document.hidden) loadList(true); }, LIST_POLL_MS);
  }
  function stopTimers() {
    clearInterval(S.timers.conv); clearInterval(S.timers.list);
    S.timers.conv = S.timers.list = 0;
  }

  // ─── Ochiq API ─────────────────────────────────────
  function init(opts) {
    S.role = opts.role;
    S.root = opts.mount;
    S.navPush = opts.navPush || null;
    S.navRelease = opts.navRelease || null;
    S.tab = opts.tab || 'chat';
    if (!S.root) return;
    build();
    S.initialized = true;

    // O'qilmaganlar belgisi — chat tabi yopiq paytda ham yangilanib turadi
    pollBadge();
    clearInterval(S.timers.badge);
    S.timers.badge = setInterval(pollBadge, BADGE_POLL_MS);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (S.active) { loadList(true); pollConv(); } else pollBadge();
    });
  }

  function setActive(on) {
    if (!S.initialized) return;
    on = !!on;
    if (on === S.active) { if (on) loadList(true); return; }
    S.active = on;
    if (on) {
      loadList(); startTimers();
      // Telefonda ochiq suhbat bilan qaytilsa — "orqaga" tugmasi uni yopishi uchun qatlam qayta qo'shiladi
      if (S.hamroh && isMobile()) pushLayer();
    } else {
      stopTimers(); pollBadge();
      // Boshqa tabga o'tilganda: panelning NAV tizimi qatlamni o'zi olib tashlaydi;
      // o'z history yozuvimiz bo'lsa — uni shu yerda olib tashlaymiz
      if (S.navPush) S.mobileNavOn = false; else releaseLayer();
    }
  }

  window.IITChat = { init, setActive };
})();
