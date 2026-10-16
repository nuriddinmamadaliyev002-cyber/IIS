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
//  Real-time o'rniga qisqa interval bilan so'rov (polling):
//    • ochiq suhbat — har 4 soniyada (faqat tab ko'rinib turganda)
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
            <form class="iitc-form" autocomplete="off">
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

    const form = q('.iitc-form'), input = q('.iitc-input'), send = q('.iitc-send');
    form.addEventListener('submit', (e) => { e.preventDefault(); sendMessage(); });
    input.addEventListener('input', () => { autosize(); send.disabled = !input.value.trim(); });
    input.addEventListener('keydown', (e) => {
      // Kompyuterda Enter — yuborish, Shift+Enter — yangi qator. Telefonda Enter — yangi qator.
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(pointer: fine)').matches) {
        e.preventDefault();
        sendMessage();
      }
    });
    q('.iitc-msgs').addEventListener('click', (e) => {
      const retry = e.target.closest('[data-retry]');
      if (retry) retryMessage(retry.dataset.retry);
      if (e.target.closest('.iitc-older')) loadOlder();
    });
  }

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
      const prev = x.oxirgi_matn
        ? `${mine ? 'Siz: ' : ''}${esc(x.oxirgi_matn.replace(/\s+/g, ' '))}`
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
    const my = ++S.convSeq;

    q('.iitc-empty').style.display = 'none';
    q('.iitc-conv').style.display = 'flex';
    q('.iitc-conv-ava').src = avatarSrc(h);
    q('.iitc-conv-name').textContent = fullName(h);
    q('.iitc-conv-sub').textContent = subLine(h);
    q('.iitc-input').value = ''; q('.iitc-send').disabled = true;
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
    if (!S.root) return;
    q('.iitc-conv').style.display = 'none';
    q('.iitc-empty').style.display = '';
    showView('list');
    renderList();
  }

  function backToList(fromNav) {
    if (fromNav !== true) releaseLayer();
    S.hamroh = null; S.convSeq++;
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
      let meta = esc(fmtTime.format(d));
      if (mine) {
        if (m.failed)      meta = '⚠️ Yuborilmadi';
        else if (m.tmp)    meta += ' <span class="iitc-tick" aria-label="Yuborilmoqda">🕓</span>';
        else if (m.id <= S.oqilganId) meta += ' <span class="iitc-tick read" aria-label="O\'qildi">✓✓</span>';
        else               meta += ' <span class="iitc-tick" aria-label="Yuborildi">✓</span>';
      }
      html += `
        <div class="iitc-row ${mine ? 'mine' : 'theirs'}">
          <div class="iitc-bubble${m.failed ? ' failed' : ''}">
            <div class="iitc-text">${esc(m.matn)}</div>
            <div class="iitc-meta">${meta}${m.failed ? ` · <button type="button" class="iitc-link" data-retry="${esc(m.id)}">Qayta yuborish</button>` : ''}</div>
          </div>
        </div>`;
    }
    box.innerHTML = html;

    if (forceBottom || nearBottom) box.scrollTop = box.scrollHeight;
    else box.scrollTop = prevTop + (box.scrollHeight - prevH);   // yuqoriga o'qib turganda sakramasin
  }

  async function loadOlder() {
    if (!S.hamroh || !S.olderMore) return;
    const first = S.msgs.find(m => !m.tmp);
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
  async function sendMessage() {
    const input = q('.iitc-input');
    const matn = input.value.replace(/\r\n/g, '\n').trim();
    if (!matn || !S.hamroh) return;
    if (matn.length > MAX_LEN) { showErr(`Xabar ${MAX_LEN} belgidan oshmasligi kerak`); return; }

    input.value = ''; autosize(); q('.iitc-send').disabled = true; showErr('');
    const tmp = { id: 'tmp-' + (++S.tmpSeq), tmp: true, yuboruvchi: S.role, matn, yaratilgan: new Date().toISOString() };
    S.msgs.push(tmp);
    renderMsgs(true);
    await doSend(tmp);
    if (!isMobile()) input.focus();
  }

  async function doSend(tmp) {
    const hamrohId = S.hamroh && S.hamroh.hamroh_id, my = S.convSeq;
    try {
      const r = await api.post('/api/chat/xabarlar', { hamroh: hamrohId, matn: tmp.matn });
      if (my !== S.convSeq) return;
      S.msgs = S.msgs.filter(m => m !== tmp);
      if (r && r.ok && r.xabar) {
        if (!S.msgs.some(m => m.id === r.xabar.id)) S.msgs.push(r.xabar);   // polling allaqachon qo'shgan bo'lishi mumkin
        S.msgs.sort(cmp);
        S.lastId = Math.max(S.lastId, r.xabar.id);
        if (S.hamroh) { S.hamroh.oxirgi_matn = r.xabar.matn; S.hamroh.oxirgi_yuboruvchi = S.role; S.hamroh.oxirgi_vaqt = r.xabar.yaratilgan; S.list.sort(listCmp); }
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
      const r = await api.get('/api/chat/xabarlar', { hamroh: id, after: S.lastId });
      if (my !== S.convSeq || !r) return;
      if (!r.ok) { if (/yozishish mumkin emas/.test(r.error || '')) loadList(true); return; }
      let changed = false;
      const fresh = (r.xabarlar || []).filter(m => !S.msgs.some(x => x.id === m.id));
      if (fresh.length) {
        S.msgs.push(...fresh); S.msgs.sort(cmp);
        S.lastId = Math.max(S.lastId, ...fresh.map(m => m.id));
        const last = fresh[fresh.length - 1];
        S.hamroh.oxirgi_matn = last.matn; S.hamroh.oxirgi_yuboruvchi = last.yuboruvchi; S.hamroh.oxirgi_vaqt = last.yaratilgan;
        S.hamroh.oqilmagan = 0;
        changed = true;
      }
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
