// ═══════════════════════════════════════════════════
//  InnovateIT — Chat (guruh chati + o'qituvchi ↔ o'quvchi)
//  O'qituvchi va o'quvchi panellari uchun umumiy modul.
//  Backend: /api/chat/*  va  /api/chat/guruh/*  (js/api.js dagi `api` orqali, JWT bilan)
//
//  Ishlatish:
//    IITChat.init({ role: 'oqituvchi' | 'oquvchi', mount: element,
//                   navPush?, navRelease?, tab?, getMaktabId?, onAvailability? });
//    IITChat.setActive(true|false);   // chat tabi ochiq/yopiqligi
//    IITChat.reload();                // maktab almashganda
//
//  Ikki bo'lim (tab):
//    • Guruhlar        — dars_jadvali guruhi chati (o'qituvchi + guruhdagi o'quvchilar).
//                        O'quvchida guruhlar o'qituvchi bo'yicha ajratib ko'rsatiladi.
//    • O'quvchilar / O'qituvchilar — shaxsiy yozishma (faqat o'qituvchi ↔ o'quvchi).
//
//  Imkoniyatlar: matn, javob (reply, faqat guruhda), fayl/rasm (📎, Ctrl+V, sudrab tashlash),
//  mikrofon yozuvi (10 daqiqagacha) va audio pleyer, progress bar bilan yuklash (95MB gacha),
//  O'Z xabarini tahrirlash/o'chirish; o'qituvchi o'z guruhida istalgan xabarni o'chira oladi.
//
//  Real-time o'rniga qisqa interval bilan so'rov (polling):
//    • ochiq suhbat — har 4 soniyada (faqat tab ko'rinib turganda)
//    • suhbatlar ro'yxati — har 12 soniyada
//    • o'qilmaganlar belgisi — har 25 soniyada (boshqa tablarda ham)
//
//  Fayllar: rasm/audio/hujjat imzolangan 5 daqiqalik havola orqali beriladi
//  (/xabarlar/:id/fayl-url) — <audio src> Range bilan ishlaydi, katta fayl xotiraga yuklanmaydi.
// ═══════════════════════════════════════════════════
(function () {
  'use strict';

  const CONV_POLL_MS  = 4000;
  const LIST_POLL_MS  = 12000;
  const BADGE_POLL_MS = 25000;
  const MAX_LEN       = 2000;
  const PAGE_SIZE     = 50;
  const MB            = 1024 * 1024;
  const MAX_FILE      = 95 * MB;             // backend CHAT_MAX_MB standarti bilan bir xil
  const MAX_REC_SEC   = 10 * 60;             // mikrofon yozuvi chegarasi
  const MIN_REC_SEC   = 1;
  const SYNC_OVERLAP  = 5000;                // tahrir/o'chirish so'rovida server vaqtidan 5s orqaga (idempotent)
  const URL_TTL       = 4 * 60 * 1000;       // imzolangan havola 5 daqiqa — zaxira bilan 4 daqiqa saqlaymiz

  const IMG_EXT   = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  const AUDIO_EXT = ['mp3', 'm4a', 'ogg', 'oga', 'opus', 'webm', 'wav', 'aac'];
  const DOC_EXT   = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip'];
  const FILE_EXT  = IMG_EXT.concat(DOC_EXT, AUDIO_EXT);
  const ACCEPT    = FILE_EXT.map(e => '.' + e).join(',');
  const RATES     = [1, 1.5, 2];

  // Ikki xil suhbat turi: d — shaxsiy (o'qituvchi ↔ o'quvchi), g — guruh
  const K = {
    d: { list: '/api/chat/suhbatlar',      key: 'suhbatlar', id: 'hamroh_id', msgs: '/api/chat/xabarlar',       param: 'hamroh', unread: '/api/chat/oqilmagan' },
    g: { list: '/api/chat/guruh/guruhlar', key: 'guruhlar',  id: 'guruh_id',  msgs: '/api/chat/guruh/xabarlar', param: 'guruh',  unread: '/api/chat/guruh/oqilmagan' },
  };
  const MODE_KIND = { guruh: 'g', shaxsiy: 'd' };

  const S = {
    role: null, root: null, navPush: null, navRelease: null, tab: 'chat', getMaktabId: null, onAvailability: null,
    active: false, initialized: false,
    kind: 'g',                  // ro'yxatda ochiq bo'lim: 'g' (Guruhlar) | 'd' (shaxsiy)
    lists: { g: [], d: [] }, loaded: { g: false, d: false },
    cur: null,                  // ochiq suhbat { kind, id, item }
    msgs: [],                   // [{id|tmp, yuboruvchi, matn, yaratilgan, tmp?, failed?, ...}]
    lastId: 0, oqilganId: 0, olderMore: false,
    tmpSeq: 0, convSeq: 0,
    timers: { conv: 0, list: 0, badge: 0 },
    mobileNavOn: false,         // telefonda ochiq suhbat uchun "orqaga" qatlami qo'yilganmi
    ownHist: false, skipPop: 0, // panel NAV bermasa — o'z history yozuvimiz
    pending: null,              // yuborilishi kutilayotgan fayl { file, localUrl|null, davomiylik? }
    editing: null,              // tahrirlanayotgan xabar { id, matn, hasFile }
    replyTo: null,              // javob berilayotgan xabar { id, ism, snippet }
    draft: '',                  // tahrirlashdan oldin yozilgan matn
    menuFor: null,              // amallar tugmalari ochiq xabar id'si
    syncAt: null,               // tahrir/o'chirishlarni so'rash uchun boshlang'ich vaqt (ISO)
    blobs: new Map(),           // "kind:id" -> blob:/local URL (rasm; yuborilgan audio uchun lokal nusxa)
    dims: new Map(),            // "kind:id" -> { w, h } (rasm qayta chizilganda sakramasligi uchun)
    urls: new Map(),            // "kind:id" -> { url, exp } imzolangan havola
    orphans: new Map(),         // suhbat kaliti -> suhbatdan chiqib ketilganda yuborilmay qolgan xabarlar
    stickUntil: 0,              // shu vaqtgacha rasm yuklanganda pastga tushiriladi
    dragging: false, dirty: false,   // audio surgichini sudrash vaqtida qayta chizmaslik uchun
    rec: null,                  // mikrofon yozuvi holati
  };

  // ─── Yordamchilar ──────────────────────────────────
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const q  = (sel) => S.root.querySelector(sel);
  const ck = (kind, id) => kind + ':' + id;

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
  function reducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  function extOf(name) { const m = /\.([^.\\/]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < MB) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
    return (n / MB).toFixed(1) + ' MB';
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }
  function fileIcon(name) {
    const e = extOf(name);
    if (e === 'pdf') return '📕';
    if (e === 'doc' || e === 'docx') return '📘';
    if (e === 'xls' || e === 'xlsx' || e === 'csv') return '📗';
    if (e === 'ppt' || e === 'pptx') return '📙';
    if (e === 'zip') return '🗜️';
    if (e === 'txt') return '📄';
    if (AUDIO_EXT.includes(e)) return '🎵';
    return '📎';
  }

  // Inline SVG ikonlar (emoji turli qurilmada turlicha chiqadi — boshqaruv tugmalari uchun SVG)
  const SVG = (p, extra) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra || ''}>${p}</svg>`;
  const ICON = {
    mic:    SVG('<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
    send:   SVG('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/>'),
    play:   SVG('<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>'),
    pause:  SVG('<rect x="6" y="4.5" width="4.2" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1" fill="currentColor" stroke="none"/>'),
    trash:  SVG('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/>'),
    reply:  SVG('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>'),
    down:   SVG('<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>'),
  };

  // Rang paletasi: oq fonda yetarli kontrast (≥ 4.5:1)
  const NAME_COLORS = ['#0f5493', '#b45309', '#047857', '#9d174d', '#6d28d9', '#b91c1c', '#0e7490', '#4d7c0f'];
  const AVA_COLORS  = ['#0f5493', '#0e7490', '#047857', '#6d28d9', '#9d174d', '#b45309'];
  const nameColor = (rol, id) => NAME_COLORS[(((Number(id) || 0) * 7) + (rol === 'oqituvchi' ? 3 : 0)) % NAME_COLORS.length];

  function fullName(x) { return `${x.familiya || ''} ${x.ism || ''}`.trim() || '—'; }
  function shortName(full) {                // "Familiya Ism" → "Ism"
    const p = String(full || '').trim().split(/\s+/);
    return p.length > 1 ? p.slice(1).join(' ') : (p[0] || '');
  }

  function avatarImg(rol, av) {
    const p = rol === 'oqituvchi' ? 'oqituvchi' : 'oquvchi';
    return av === 'ayol' ? `img/${p}-icon-ayol.png` : av === 'erkak' ? `img/${p}-icon-erkak.png` : `img/${p}-icon.png`;
  }
  // Shaxsiy suhbatdosh avatari (o'qituvchiga — o'quvchi, o'quvchiga — o'qituvchi)
  function avatarSrc(x) { return avatarImg(S.role === 'oqituvchi' ? 'oquvchi' : 'oqituvchi', x.avatar); }

  function sinfLabel(x) { return x.sinf ? (/sinf/i.test(x.sinf) ? x.sinf : x.sinf + '-sinf') : ''; }
  function subLine(x) {
    if (S.role === 'oqituvchi') return [sinfLabel(x), x.maktab].filter(Boolean).join(' • ');
    return x.fan || "O'qituvchi";
  }

  // ─── Guruh ko'rsatkichlari ─────────────────────────
  const KUN_QISQA = { '1': 'Du', '2': 'Se', '3': 'Cho', '4': 'Pay', '5': 'Ju', '6': 'Sha', '0': 'Yak' };
  function sinflarLabel(s) {
    const arr = String(s || '').split(',').map(t => t.trim().replace(/[\s-]*sinf$/i, '')).filter(Boolean);
    arr.sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
    return arr.length ? arr.join(', ') + '-sinf' : '';
  }
  function kunlarLabel(s) {
    return String(s || '').split(',').map(t => KUN_QISQA[t.trim()] || t.trim()).filter(Boolean).join(' ');
  }
  function soatLabel(a) {
    a = String(a || '').trim();
    return /^\d{1,2}$/.test(a) ? a.padStart(2, '0') + ':00' : a;
  }
  function groupTitle(x) {
    const f = String(x.fan || '').trim() || 'Guruh', s = sinflarLabel(x.sinflar);
    return s ? `${f} (${s})` : f;
  }
  function groupMeta(x) {
    const t = [soatLabel(x.boshlanish), soatLabel(x.tugash)].filter(Boolean).join('–');
    return [kunlarLabel(x.kunlar), t].filter(Boolean).join(', ');
  }
  function teacherName(x) { return `${x.oqituvchi_familiya || ''} ${x.oqituvchi_ism || ''}`.trim(); }
  function groupAva(x, cls) {
    const ch = (String(x.fan || '').trim().match(/[\p{L}\p{N}]/u) || ['#'])[0].toUpperCase();
    return `<span class="${cls || 'iitc-gava'}" style="--gc:${AVA_COLORS[(Number(x.guruh_id) || 0) % AVA_COLORS.length]}" aria-hidden="true">${esc(ch)}</span>`;
  }

  // Fayl/ovozli xabar belgilari
  const isVoice = (f) => !!(f && f.audio && /^ovoz-/i.test(f.nomi || ''));
  function fileLabel(f) {
    if (!f) return '';
    if (f.audio) return isVoice(f) ? '🎤 Ovozli xabar' : '🎵 ' + (f.nomi || 'Audio');
    if (f.rasm)  return '🖼 ' + (f.nomi || 'Rasm');
    return '📎 ' + (f.nomi || 'Fayl');
  }

  // Ro'yxatdagi oxirgi xabar ko'rinishi (matn yoki fayl belgisi)
  function previewOf(x) {
    const text = x.oxirgi_matn ? String(x.oxirgi_matn).replace(/\s+/g, ' ') : '';
    if (x.oxirgi_fayl_nomi) {
      if (x.oxirgi_fayl_audio) {
        return /^ovoz-/i.test(x.oxirgi_fayl_nomi) ? '🎤 ' + (text || 'Ovozli xabar') : '🎵 ' + (text || x.oxirgi_fayl_nomi);
      }
      return (x.oxirgi_fayl_rasm ? '🖼 ' : '📎 ') + (text || (x.oxirgi_fayl_rasm ? 'Rasm' : x.oxirgi_fayl_nomi));
    }
    return text;
  }
  function setLast(m) {
    const it = S.cur && S.cur.item;
    if (!it) return;
    it.oxirgi_matn = m.matn || '';
    it.oxirgi_yuboruvchi = m.yuboruvchi;
    it.oxirgi_ism = m.ism || '';
    it.oxirgi_vaqt = m.yaratilgan;
    it.oxirgi_fayl_nomi = m.fayl ? m.fayl.nomi : null;
    it.oxirgi_fayl_rasm = m.fayl ? !!m.fayl.rasm : false;
    it.oxirgi_fayl_audio = m.fayl ? !!m.fayl.audio : false;
  }

  // ─── Belgi (o'qilmaganlar) ─────────────────────────
  const unreadOf = (kind) => S.lists[kind].reduce((n, x) => n + (x.oqilmagan || 0), 0);
  function setBadge(n) {
    n = Math.max(0, n | 0);
    document.querySelectorAll('.iitc-badge').forEach(el => {
      el.textContent = n > 99 ? '99+' : String(n);
      el.style.display = n ? 'inline-flex' : 'none';
    });
  }
  function paintBadges() {
    setBadge(unreadOf('g') + unreadOf('d'));
    if (!S.root) return;
    ['g', 'd'].forEach(k => {
      const el = S.root.querySelector(`.iitc-tabn[data-n="${k}"]`);
      if (!el) return;
      const n = unreadOf(k);
      el.textContent = n > 99 ? '99+' : String(n);
      el.style.display = n ? 'inline-flex' : 'none';
    });
  }

  // O'qituvchi panelida tanlangan maktab — ro'yxat va belgi faqat shu maktab bilan
  function maktabParams() {
    const mid = S.getMaktabId ? S.getMaktabId() : null;
    return mid ? { maktabId: mid } : {};
  }

  async function pollBadge() {
    if (document.hidden || S.active) return;     // chat ochiq bo'lsa, ro'yxat polling'i yangilaydi
    try {
      const [a, b] = await Promise.all([
        api.get(K.g.unread, maktabParams()), api.get(K.d.unread, maktabParams()),
      ]);
      const n = ((a && a.ok) ? a.soni : 0) + ((b && b.ok) ? b.soni : 0);
      setBadge(n);
    } catch (_) {}
  }

  // ─── Markup ────────────────────────────────────────
  function emptyTitle() {
    if (S.kind === 'g') return 'Guruhni tanlang';
    return S.role === 'oqituvchi' ? "O'quvchini tanlang" : "O'qituvchini tanlang";
  }

  function build() {
    const dLabel = S.role === 'oqituvchi' ? "O'quvchilar" : "O'qituvchilar";
    const recOk = recSupported();
    S.root.innerHTML = `
      <div class="iitc" data-view="list">
        <aside class="iitc-side" aria-label="Suhbatlar">
          <div class="iitc-tabs" role="tablist" aria-label="Chat turi">
            <button type="button" class="iitc-tab active" role="tab" data-kind="g" aria-selected="true">Guruhlar<span class="iitc-tabn" data-n="g" style="display:none;"></span></button>
            <button type="button" class="iitc-tab" role="tab" data-kind="d" aria-selected="false">${dLabel}<span class="iitc-tabn" data-n="d" style="display:none;"></span></button>
          </div>
          <div class="iitc-side-head">
            <input type="search" class="iitc-search" placeholder="Qidirish…" autocomplete="off" aria-label="Suhbatni qidirish">
          </div>
          <div class="iitc-list" role="list"></div>
        </aside>
        <section class="iitc-main">
          <div class="iitc-empty">
            <div class="iitc-empty-ico">💬</div>
            <div class="iitc-empty-t">${emptyTitle()}</div>
            <div class="iitc-empty-s">Suhbat shu yerda ochiladi</div>
          </div>
          <div class="iitc-conv" style="display:none;">
            <header class="iitc-conv-head">
              <button type="button" class="iitc-back" aria-label="Suhbatlar ro'yxatiga qaytish">‹</button>
              <img class="iitc-conv-ava" alt="" width="38" height="38">
              <span class="iitc-conv-gava" style="display:none;"></span>
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
              ${recOk ? `<button type="button" class="iitc-mic" aria-label="Ovozli xabar yozish" title="Ovozli xabar yozish">${ICON.mic}</button>` : ''}
              <button type="submit" class="iitc-send" aria-label="Yuborish" disabled style="${recOk ? 'display:none;' : ''}">${ICON.send}</button>
            </form>
            <div class="iitc-rec" style="display:none;">
              <button type="button" class="iitc-rec-x" aria-label="Yozuvni bekor qilish" title="Bekor qilish">${ICON.trash}</button>
              <span class="iitc-rec-dot" aria-hidden="true"></span>
              <span class="iitc-rec-time" role="timer">0:00</span>
              <span class="iitc-rec-hint">Yozilmoqda…</span>
              <button type="button" class="iitc-rec-send" aria-label="Ovozli xabarni yuborish" title="Yuborish">${ICON.send}</button>
            </div>
          </div>
        </section>
      </div>`;

    q('.iitc-search').addEventListener('input', renderList);
    q('.iitc-tabs').addEventListener('click', (e) => {
      const t = e.target.closest('.iitc-tab');
      if (t) setKind(t.dataset.kind);
    });
    q('.iitc-list').addEventListener('click', (e) => {
      const it = e.target.closest('.iitc-item');
      if (it) openConv(it.dataset.kind, parseInt(it.dataset.id, 10));
    });
    q('.iitc-back').addEventListener('click', backToList);

    const form = q('.iitc-form'), input = q('.iitc-input');
    form.addEventListener('submit', (e) => { e.preventDefault(); onSubmit(); });
    input.addEventListener('input', () => { autosize(); updateSend(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (S.editing) { e.preventDefault(); cancelEdit(); return; }
        if (S.replyTo) { e.preventDefault(); clearReply(); return; }
      }
      // Kompyuterda Enter — yuborish, Shift+Enter — yangi qator. Telefonda Enter — yangi qator.
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(pointer: fine)').matches) {
        e.preventDefault();
        onSubmit();
      }
    });

    // Mikrofon
    const mic = q('.iitc-mic');
    if (mic) mic.addEventListener('click', startRec);
    q('.iitc-rec-x').addEventListener('click', () => cancelRec());
    q('.iitc-rec-send').addEventListener('click', () => stopRec(true));

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
      if (S.cur && !S.editing && e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault();
    });
    main.addEventListener('drop', (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && S.cur && !S.editing) { e.preventDefault(); setPending(f); }
    });
    q('.iitc-ctx').addEventListener('click', (e) => {
      const x = e.target.closest('[data-ctx-x]');
      if (!x) return;
      const w = x.dataset.ctxX;
      if (w === 'reply') clearReply(); else if (w === 'edit') cancelEdit(); else clearPending();
    });

    const msgs = q('.iitc-msgs');
    msgs.addEventListener('click', (e) => {
      const t = e.target;
      let el;
      if ((el = t.closest('[data-retry]')))    { retryMessage(el.dataset.retry); return; }
      if ((el = t.closest('[data-discard]')))  { discardMessage(el.dataset.discard); return; }
      if ((el = t.closest('[data-cancelup]'))) { cancelUpload(el.dataset.cancelup); return; }
      if (t.closest('.iitc-older'))            { loadOlder(); return; }
      if ((el = t.closest('[data-act]')))      { toggleMenu(parseInt(el.dataset.act, 10)); return; }
      if ((el = t.closest('[data-reply]')))    { startReply(parseInt(el.dataset.reply, 10)); return; }
      if ((el = t.closest('[data-edit]')))     { startEdit(parseInt(el.dataset.edit, 10)); return; }
      if ((el = t.closest('[data-del]')))      { askDelete(parseInt(el.dataset.del, 10)); return; }
      if ((el = t.closest('[data-quote]')))    { jumpTo(parseInt(el.dataset.quote, 10)); return; }
      if ((el = t.closest('[data-img]')))      { openLightbox(parseInt(el.dataset.img, 10)); return; }   // diqqat: data-view — .iitc ildizida band
      if ((el = t.closest('[data-dl]')))       { downloadFile(parseInt(el.dataset.dl, 10), el); return; }
      if ((el = t.closest('[data-play]')))     { onPlayClick(el); return; }
      if ((el = t.closest('[data-rate]')))     { cycleRate(); return; }
    });
    // Audio surgichi
    msgs.addEventListener('pointerdown', (e) => { if (e.target.closest('.iitc-aud-seek')) S.dragging = true; });
    const endDrag = () => { if (S.dragging) { S.dragging = false; if (S.dirty) { S.dirty = false; renderMsgs(false); } } };
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
    msgs.addEventListener('input', (e) => { if (e.target.classList && e.target.classList.contains('iitc-aud-seek')) onSeekInput(e.target); });
    msgs.addEventListener('change', (e) => { if (e.target.classList && e.target.classList.contains('iitc-aud-seek')) endDrag(); });
    // Rasm yuklanganda: o'lchamini eslab qolish va pastga yopishib turgan bo'lsa — pastga tushirish
    msgs.addEventListener('load', (e) => {
      const im = e.target;
      if (!im || im.tagName !== 'IMG' || !im.dataset.fkey) return;
      if (im.naturalWidth) S.dims.set(im.dataset.fkey, { w: im.naturalWidth, h: im.naturalHeight });
      im.parentElement && im.parentElement.classList.remove('is-loading');
      if (Date.now() < S.stickUntil) msgs.scrollTop = msgs.scrollHeight;
    }, true);

    updateSend();
  }

  // Menyu/oyna yopish: tashqariga bosish va Escape
  document.addEventListener('click', (e) => {
    if (S.menuFor && S.root && !e.target.closest('.iitc-act, .iitc-actions')) { S.menuFor = null; renderMsgs(false); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !S.root) return;
    const lb = document.querySelector('.iitc-lb, .iitc-modal');
    if (lb) { lb.remove(); return; }
    if (S.rec) { cancelRec(); return; }
    if (S.menuFor) { S.menuFor = null; renderMsgs(false); }
  });

  function autosize() {
    const el = q('.iitc-input');
    el.style.height = 'auto';
    // Element yashirin paytda (masalan telefonda ro'yxat ko'rinishida) scrollHeight = 0 —
    // bunda balandlik qo'yilmaydi, aks holda maydon qisilib qoladi
    if (el.scrollHeight > 0) el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    else el.style.height = '';
  }

  // ─── Bo'limlar (Guruhlar / shaxsiy) ────────────────
  function setKind(kind) {
    if (kind !== 'g' && kind !== 'd') return;
    S.kind = kind;
    if (!S.root) return;
    S.root.querySelectorAll('.iitc-tab').forEach(t => {
      const on = t.dataset.kind === kind;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const t = q('.iitc-empty-t'); if (t) t.textContent = emptyTitle();
    renderList();
  }

  // ─── Suhbatlar ro'yxati ────────────────────────────
  // Ikkala ro'yxat birga olinadi (belgi va "chat bormi" tekshiruvi uchun).
  async function loadLists(silent) {
    const body = q('.iitc-list');
    const first = !S.loaded.g && !S.loaded.d;
    if (!silent && first) body.innerHTML = '<div class="iitc-note"><div class="loading-spinner"></div></div>';
    const params = maktabParams();
    const res = await Promise.all(['g', 'd'].map(async (k) => {
      try {
        const r = await api.get(K[k].list, params);
        if (!r || !r.ok) throw new Error(r && r.error);
        return r[K[k].key] || [];
      } catch (_) { return null; }
    }));
    ['g', 'd'].forEach((k, i) => { if (res[i]) { S.lists[k] = res[i]; S.loaded[k] = true; } });

    if (!S.loaded.g && !S.loaded.d) {                      // ikkalasi ham yuklanmadi
      body.innerHTML = '<div class="iitc-note">⚠️ Yuklab bo\'lmadi. <button type="button" class="iitc-link" id="iitc-reload">Qayta urinish</button></div>';
      const b = q('#iitc-reload'); if (b) b.onclick = () => loadLists();
      return;
    }
    // Birinchi yuklanishda: guruh yo'q-u, shaxsiy suhbat bor bo'lsa — shu bo'limni ochamiz
    if (first && !S.lists.g.length && S.lists.d.length) setKind('d');

    if (S.onAvailability) S.onAvailability(S.lists.g.length + S.lists.d.length > 0);

    // Ochiq suhbat endi mavjud bo'lmasa (guruhdan chiqarilgan / ajratilgan) — suhbat yopiladi
    if (S.cur) {
      const fresh = S.lists[S.cur.kind].find(x => x[K[S.cur.kind].id] === S.cur.id);
      if (fresh) S.cur.item = fresh; else closeConv();
    }
    paintBadges();
    renderList();
  }

  function itemHtml(kind, x) {
    const id = x[K[kind].id];
    const activeId = S.cur && S.cur.kind === kind && S.cur.id;
    const mine = x.oxirgi_yuboruvchi === S.role;
    const pv = previewOf(x);
    let prev;
    if (pv) {
      let who = '';
      if (kind === 'd') who = mine ? 'Siz: ' : '';
      else who = mine ? 'Siz: ' : (x.oxirgi_ism ? shortName(x.oxirgi_ism) + ': ' : '');
      prev = esc(who + pv);
    } else {
      prev = `<span class="iitc-muted">${esc(kind === 'g' ? (groupMeta(x) || 'Suhbatni boshlang') : (subLine(x) || 'Suhbatni boshlang'))}</span>`;
    }
    const ava = kind === 'g'
      ? groupAva(x, 'iitc-ava iitc-gava')
      : `<img class="iitc-ava" src="${avatarSrc(x)}" alt="" width="42" height="42">`;
    const name = kind === 'g' ? groupTitle(x) : fullName(x);
    return `
      <button type="button" role="listitem" class="iitc-item${id === activeId ? ' active' : ''}" data-kind="${kind}" data-id="${id}">
        ${ava}
        <span class="iitc-item-mid">
          <span class="iitc-item-name">${esc(name)}</span>
          <span class="iitc-item-prev">${prev}</span>
        </span>
        <span class="iitc-item-end">
          <span class="iitc-item-time">${esc(listTime(x.oxirgi_vaqt))}</span>
          ${x.oqilmagan ? `<span class="iitc-unread">${x.oqilmagan > 99 ? '99+' : x.oqilmagan}</span>` : ''}
        </span>
      </button>`;
  }

  function renderList() {
    const body = q('.iitc-list');
    const kind = S.kind;
    if (!S.loaded[kind]) return;
    const all = S.lists[kind];
    const term = q('.iitc-search').value.trim().toLowerCase();
    paintBadges();

    if (!all.length) {
      const msg = kind === 'g'
        ? (S.role === 'oqituvchi'
            ? 'Bu maktabda hali guruhingiz yo\'q.<br>«Guruh yaratish» bo\'limidan guruh yarating — guruh chati shu yerda paydo bo\'ladi.'
            : 'O\'qituvchingiz sizni guruhga qo\'shgach, guruh chati shu yerda paydo bo\'ladi.')
        : (S.role === 'oqituvchi'
            ? 'Guruhdagi o\'quvchilar shu yerda chiqadi — ular bilan shaxsiy yozishma mumkin.'
            : 'O\'qituvchingiz sizni guruhga qo\'shgach, u bilan yozishma shu yerda paydo bo\'ladi.');
      body.innerHTML = `<div class="iitc-note">${msg}</div>`;
      return;
    }
    const items = all.filter(x => {
      if (!term) return true;
      const hay = kind === 'g' ? (groupTitle(x) + ' ' + teacherName(x) + ' ' + (x.maktab || '')) : fullName(x);
      return hay.toLowerCase().includes(term);
    });
    if (!items.length) { body.innerHTML = '<div class="iitc-note">Hech narsa topilmadi</div>'; return; }

    // O'quvchi: guruhlar o'qituvchi bo'yicha ajratiladi (o'qituvchi → uning guruhlari)
    if (kind === 'g' && S.role === 'oquvchi') {
      const order = [], by = new Map();
      for (const x of items) {                     // server tartibi (oxirgi xabar bo'yicha) saqlanadi
        const k = x.oqituvchi_id;
        if (!by.has(k)) { by.set(k, []); order.push(k); }
        by.get(k).push(x);
      }
      body.innerHTML = order.map(k => {
        const gs = by.get(k), f = gs[0];
        return `<div class="iitc-sec" role="presentation">
            <img class="iitc-sec-ava" src="${avatarImg('oqituvchi', f.oqituvchi_avatar)}" alt="" width="22" height="22">
            <span class="iitc-sec-name">${esc(teacherName(f) || "O'qituvchi")}</span>
          </div>` + gs.map(x => itemHtml('g', x)).join('');
      }).join('');
      return;
    }
    body.innerHTML = items.map(x => itemHtml(kind, x)).join('');
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

  // Suhbatni ochishdan oldin eski holat tozalanadi
  function resetConvState() {
    cancelRec(true);
    stopAudio();
    S.msgs = []; S.lastId = 0; S.oqilganId = 0; S.olderMore = false;
    S.editing = null; S.replyTo = null; S.draft = ''; S.menuFor = null; S.syncAt = null;
    clearPending(true);
  }

  function paintHeader(kind, item) {
    const img = q('.iitc-conv-ava'), gav = q('.iitc-conv-gava');
    if (kind === 'g') {
      img.style.display = 'none';
      gav.style.display = '';
      gav.outerHTML = groupAva(item, 'iitc-conv-gava');
      q('.iitc-conv-name').textContent = groupTitle(item);
      const parts = [];
      if (S.role === 'oquvchi') parts.push(teacherName(item));
      if (item.azolar != null) parts.push(`${item.azolar} o'quvchi`);
      q('.iitc-conv-sub').textContent = parts.filter(Boolean).join(', ') || groupMeta(item);
    } else {
      gav.style.display = 'none';
      img.style.display = '';
      img.src = avatarSrc(item);
      q('.iitc-conv-name').textContent = fullName(item);
      q('.iitc-conv-sub').textContent = subLine(item);
    }
  }

  async function openConv(kind, id) {
    const item = S.lists[kind].find(x => x[K[kind].id] === id);
    if (!item) return;
    if (S.cur && S.cur.kind === kind && S.cur.id === id && !isMobile()) { q('.iitc-input').focus(); return; }

    resetConvState();
    S.cur = { kind, id, item };
    const my = ++S.convSeq;

    q('.iitc-empty').style.display = 'none';
    q('.iitc-conv').style.display = 'flex';
    paintHeader(kind, item);
    q('.iitc-input').value = '';
    renderCtx(); updateSend();
    showErr('');
    q('.iitc-msgs').innerHTML = '<div class="iitc-note"><div class="loading-spinner"></div></div>';
    showView('conv');
    autosize();                       // ko'rinish almashgandan keyin o'lchanadi
    renderList();

    if (isMobile()) pushLayer();

    try {
      const r = await api.get(K[kind].msgs, { [K[kind].param]: id });
      if (my !== S.convSeq) return;                       // boshqa suhbatga o'tib ketilgan
      if (!r || !r.ok) throw new Error(r && r.error);
      S.msgs = r.xabarlar || [];
      S.lastId = S.msgs.length ? S.msgs[S.msgs.length - 1].id : 0;
      S.oqilganId = r.oqilgan_id || 0;
      markSync(r);
      S.olderMore = S.msgs.length >= PAGE_SIZE;
      item.oqilmagan = 0;                                 // ochish o'qilgan deb belgilaydi
      // Suhbatdan chiqib ketilganda yuborilmay qolgan xabarlar qaytariladi
      const lost = S.orphans.get(ck(kind, id));
      if (lost && lost.length) { S.msgs.push(...lost); S.orphans.delete(ck(kind, id)); }
      renderMsgs(true);
      renderList();
      paintBadges();
      if (!isMobile()) q('.iitc-input').focus();
    } catch (e) {
      if (my !== S.convSeq) return;
      q('.iitc-msgs').innerHTML = `<div class="iitc-note">⚠️ ${esc((e && e.message) || 'Xabarlarni yuklab bo\'lmadi')}</div>`;
    }
  }

  function closeConv() {
    resetConvState();
    S.cur = null; S.convSeq++;
    if (!S.root) return;
    q('.iitc-conv').style.display = 'none';
    q('.iitc-empty').style.display = '';
    renderCtx();
    showView('list');
    renderList();
  }

  function backToList(fromNav) {
    if (fromNav !== true) releaseLayer();
    closeConv();
    loadLists(true);
  }

  function showErr(msg) {
    const el = q('.iitc-err');
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
  }

  // ─── Xabarlarni chizish ────────────────────────────
  const isMine = (m) => (S.cur && S.cur.kind === 'g') ? !!m.meniki : m.yuboruvchi === S.role;
  const canModerate = () => !!(S.cur && S.cur.kind === 'g' && S.role === 'oqituvchi');

  function progText(m) {
    const u = m.up;
    if (!u || !u.total) return 'Yuborilmoqda…';
    if (u.loaded >= u.total) return 'Server saqlayapti…';
    return `${Math.floor(u.loaded / u.total * 100)}% · ${fmtSize(u.loaded)} / ${fmtSize(u.total)}`;
  }
  function progPct(m) {
    const u = m.up;
    return u && u.total ? Math.min(100, Math.floor(u.loaded / u.total * 100)) : 0;
  }

  function quoteHtml(j) {
    if (!j) return '';
    if (j.ochirilgan) return '<div class="iitc-quote gone"><span class="iitc-quote-t">O\'chirilgan xabar</span></div>';
    const sn = j.matn ? esc(String(j.matn).replace(/\s+/g, ' ')) : esc(fileLabel(j.fayl));
    return `<button type="button" class="iitc-quote" data-quote="${j.id}" title="Xabarga o'tish">
        <span class="iitc-quote-n">${esc(j.ism || '')}</span><span class="iitc-quote-t">${sn}</span></button>`;
  }

  function audioHtml(m, key, real) {
    const f = m.fayl;
    const dur = Number(f.davomiylik) || 0;
    const name = isVoice(f) ? '' : `<div class="iitc-aud-name">${esc(f.nomi)}</div>`;
    const dl = real ? `<button type="button" class="iitc-aud-dl" data-dl="${m.id}" aria-label="Yuklab olish" title="Yuklab olish">${ICON.down}</button>` : '';
    return `${name}
      <div class="iitc-aud${real ? '' : ' disabled'}" data-aud="${key}" data-dur="${dur}">
        <button type="button" class="iitc-aud-btn" ${real ? `data-play="${m.id}"` : 'disabled'} aria-label="Ijro etish">
          <span class="i-play">${ICON.play}</span><span class="i-pause">${ICON.pause}</span><span class="i-spin" aria-hidden="true"></span>
        </button>
        <div class="iitc-aud-mid">
          <input type="range" class="iitc-aud-seek" min="0" max="1000" value="0" step="1" aria-label="Audio holati" ${real ? '' : 'disabled'}>
          <div class="iitc-aud-row">
            <span class="iitc-aud-time">${fmtDur(0)} / ${fmtDur(dur)}</span>
            ${real ? `<button type="button" class="iitc-aud-rate" data-rate aria-label="Ijro tezligi">${A.rate}x</button>` : ''}
          </div>
        </div>
        ${dl}
      </div>`;
  }

  function fileHtml(m) {
    const f = m.fayl;
    if (!f) return '';
    const real = typeof m.id === 'number';              // yuborilib bo'lgan (serverda id bor)
    const key = real && S.cur ? ck(S.cur.kind, m.id) : '';
    let out;
    if (f.audio) {
      out = audioHtml(m, key, real);
    } else if (f.rasm) {
      const url = real ? S.blobs.get(key) : m.localUrl;
      const d = real ? S.dims.get(key) : null;
      const style = d ? ` style="aspect-ratio:${d.w}/${d.h}"` : '';
      const tag = real
        ? `<img data-fkey="${key}" alt="${esc(f.nomi)}"${url ? ` src="${url}"` : ''}${style}>`
        : `<img alt="${esc(f.nomi)}"${url ? ` src="${url}"` : ''}>`;
      out = real
        ? `<button type="button" class="iitc-img${url && d ? '' : ' is-loading'}" data-img="${m.id}" aria-label="Rasmni ochish: ${esc(f.nomi)}">${tag}</button>`
        : `<div class="iitc-img">${tag}</div>`;
    } else {
      const inner = `
        <span class="iitc-file-ico" aria-hidden="true">${fileIcon(f.nomi)}</span>
        <span class="iitc-file-txt"><span class="iitc-file-name">${esc(f.nomi)}</span><span class="iitc-file-size">${esc(fmtSize(f.hajm))}${real ? ' · yuklab olish' : ''}</span></span>`;
      out = real
        ? `<button type="button" class="iitc-file" data-dl="${m.id}">${inner}</button>`
        : `<div class="iitc-file">${inner}</div>`;
    }
    // Yuklanayotgan fayl: progress bar + bekor qilish
    if (m.tmp && m.file) {
      out += `<div class="iitc-prog" data-prog="${esc(m.id)}">
          <div class="iitc-prog-bar"><i style="width:${progPct(m)}%"></i></div>
          <div class="iitc-prog-row"><span class="iitc-prog-t">${esc(progText(m))}</span>
            <button type="button" class="iitc-prog-x" data-cancelup="${esc(m.id)}" aria-label="Yuklashni bekor qilish">Bekor qilish</button></div>
        </div>`;
    }
    return out;
  }

  function renderMsgs(forceBottom) {
    if (S.dragging) { S.dirty = true; return; }         // surgichni sudrash vaqtida tegmaymiz
    const box = q('.iitc-msgs');
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
    const prevH = box.scrollHeight, prevTop = box.scrollTop;
    const g = S.cur && S.cur.kind === 'g';

    if (!S.msgs.length) {
      box.innerHTML = `<div class="iitc-note">Hali xabar yo'q.<br>Birinchi xabarni siz yozing 👋</div>`;
      return;
    }

    let html = S.olderMore ? '<button type="button" class="iitc-older">⬆ Oldingi xabarlar</button>' : '';
    let lastDay = '', lastWho = '';
    for (const m of S.msgs) {
      const d = new Date(m.yaratilgan), k = dayKey(d);
      if (k !== lastDay) { html += `<div class="iitc-day"><span>${esc(dayLabel(d))}</span></div>`; lastDay = k; lastWho = ''; }
      const mine = isMine(m);
      const real = typeof m.id === 'number';
      let meta = '';
      if (m.tahrirlangan) meta += 'tahrirlangan · ';
      meta += esc(fmtTime.format(d));
      if (mine) {
        if (m.failed)      meta = '⚠️ Yuborilmadi';
        else if (m.tmp)    meta += ' <span class="iitc-tick" aria-label="Yuborilmoqda">🕓</span>';
        else if (!g && m.id <= S.oqilganId) meta += ' <span class="iitc-tick read" aria-label="O\'qildi">✓✓</span>';
        else if (!g)       meta += ' <span class="iitc-tick" aria-label="Yuborildi">✓</span>';
      }
      // Amallar (⋮): javob (guruhda hammaning xabariga) · tahrirlash (o'zinikini) · o'chirish (o'zinikini; o'qituvchi guruhda istalganini)
      const canReply = g && real && !m.failed;
      const canEdit  = mine && real && !m.failed;
      const canDel   = real && !m.failed && (mine || canModerate());
      let act = '';
      if (canReply || canEdit || canDel) {
        const open = S.menuFor === m.id;
        act = `<button type="button" class="iitc-act${open ? ' open' : ''}" data-act="${m.id}" aria-label="Xabar amallari" aria-expanded="${open}">⋮</button>`
            + (open ? `<span class="iitc-actions" role="menu">
                 ${canReply ? `<button type="button" role="menuitem" data-reply="${m.id}" title="Javob berish" aria-label="Javob berish">${ICON.reply}</button>` : ''}
                 ${canEdit  ? `<button type="button" role="menuitem" data-edit="${m.id}" title="Tahrirlash" aria-label="Tahrirlash">✏️</button>` : ''}
                 ${canDel   ? `<button type="button" role="menuitem" data-del="${m.id}" title="O'chirish" aria-label="O'chirish">${ICON.trash}</button>` : ''}
               </span>` : '');
      }
      // Guruhda: boshqaning xabari tepasida uning ismi (ketma-ket xabarlarda bir marta)
      let who = '';
      if (g && !mine) {
        const wk = (m.yuboruvchi || '') + ':' + (m.yuboruvchi_id || '');
        if (wk !== lastWho) {
          who = `<div class="iitc-who" style="color:${nameColor(m.yuboruvchi, m.yuboruvchi_id)}">${esc(m.ism || (m.yuboruvchi === 'oqituvchi' ? "O'qituvchi" : "O'quvchi"))}${m.yuboruvchi === 'oqituvchi' ? '<span class="iitc-role">o\'qituvchi</span>' : ''}</div>`;
        }
        lastWho = wk;
      } else lastWho = '';
      const media = m.fayl && m.fayl.rasm && !m.matn && !m.javob && !who;
      const cls = 'iitc-bubble' + (m.failed ? ' failed' : '') + (media ? ' media' : '') + (m.fayl && m.fayl.audio ? ' has-audio' : '');
      html += `
        <div class="iitc-row ${mine ? 'mine' : 'theirs'}${S.editing && S.editing.id === m.id ? ' editing' : ''}" ${real ? `data-mid="${m.id}"` : ''}>
          ${act}
          <div class="${cls}">
            ${who}${quoteHtml(m.javob)}${fileHtml(m)}
            ${m.matn ? `<div class="iitc-text">${esc(m.matn)}</div>` : ''}
            <div class="iitc-meta">${meta}${m.failed ? ` · <button type="button" class="iitc-link" data-retry="${esc(m.id)}">Qayta yuborish</button> · <button type="button" class="iitc-link" data-discard="${esc(m.id)}">Olib tashlash</button>` : ''}</div>
          </div>
        </div>`;
    }
    box.innerHTML = html;

    const stick = forceBottom || nearBottom;
    if (stick) { box.scrollTop = box.scrollHeight; S.stickUntil = Date.now() + 3000; }
    else box.scrollTop = prevTop + (box.scrollHeight - prevH);   // yuqoriga o'qib turganda sakramasin
    hydrateImages();
    syncAudioUI();
  }

  // Yuklash jarayonida butun ro'yxatni qayta chizmasdan faqat progress yangilanadi
  const progRaf = new Set();
  function paintProgress(tmp) {
    if (progRaf.has(tmp.id)) return;
    progRaf.add(tmp.id);
    requestAnimationFrame(() => {
      progRaf.delete(tmp.id);
      if (!S.root) return;
      const el = q(`[data-prog="${tmp.id}"]`);
      if (!el) return;
      el.querySelector('i').style.width = progPct(tmp) + '%';
      el.querySelector('.iitc-prog-t').textContent = progText(tmp);
    });
  }

  // ─── Fayllar (imzolangan havola orqali) ────────────
  async function signedUrl(kind, id, useCache) {
    const key = ck(kind, id), c = S.urls.get(key);
    if (useCache && c && c.exp > Date.now()) return c.url;
    const r = await api.get(`${K[kind].msgs}/${id}/fayl-url`);
    if (!r || !r.ok || !r.url) throw new Error((r && r.error) || 'Faylni olib bo\'lmadi');
    const url = BASE + r.url;
    S.urls.set(key, { url, exp: Date.now() + URL_TTL });
    return url;
  }

  // Rasm: havola orqali olinib blob: URL sifatida eslab qolinadi (qayta chizishda miltillamasin)
  async function getBlobUrl(kind, id) {
    const key = ck(kind, id);
    if (S.blobs.has(key)) return S.blobs.get(key);
    const url = await signedUrl(kind, id, false);
    const res = await fetch(url);
    if (!res.ok) throw new Error('Faylni olib bo\'lmadi');
    const obj = URL.createObjectURL(await res.blob());
    S.blobs.set(key, obj);
    return obj;
  }

  const loadingImgs = new Set();
  function hydrateImages() {
    if (!S.root) return;
    q('.iitc-msgs').querySelectorAll('img[data-fkey]:not([src])').forEach((img) => {
      const key = img.dataset.fkey;
      if (loadingImgs.has(key)) return;
      loadingImgs.add(key);
      const [kind, id] = key.split(':');
      getBlobUrl(kind, parseInt(id, 10)).then((url) => {
        if (!S.root) return;
        q('.iitc-msgs').querySelectorAll(`img[data-fkey="${key}"]`).forEach(el => { el.src = url; });
      }).catch(() => {
        if (!S.root) return;
        q('.iitc-msgs').querySelectorAll(`img[data-fkey="${key}"]`).forEach(el => {
          el.removeAttribute('data-fkey');
          if (el.parentElement) { el.parentElement.classList.remove('is-loading'); el.parentElement.classList.add('broken'); el.parentElement.textContent = '🖼 Rasm yuklanmadi'; }
        });
      }).finally(() => loadingImgs.delete(key));
    });
  }

  // Yuklab olish: katta fayl xotiraga olinmaydi — imzolangan havola brauzerga beriladi
  // (server Content-Disposition: attachment qaytaradi).
  async function downloadFile(id, btn) {
    const m = S.msgs.find(x => x.id === id);
    if (!m || !m.fayl || !S.cur || (btn && btn.dataset.busy)) return;
    if (btn) btn.dataset.busy = '1';
    try {
      const url = await signedUrl(S.cur.kind, id, false);
      const a = document.createElement('a');
      a.href = url + (url.includes('?') ? '&' : '?') + 'yuklash=1';
      a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { showErr((e && e.message) || 'Faylni yuklab bo\'lmadi'); }
    finally { if (btn) delete btn.dataset.busy; }
  }

  async function openLightbox(id) {
    const m = S.msgs.find(x => x.id === id);
    if (!m || !m.fayl || !S.cur) return;
    let url;
    try { url = await getBlobUrl(S.cur.kind, id); } catch (e) { showErr((e && e.message) || 'Rasmni ochib bo\'lmadi'); return; }
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
    if (!S.cur || !S.olderMore) return;
    const first = S.msgs.find(m => typeof m.id === 'number');
    if (!first) return;
    const my = S.convSeq, box = q('.iitc-msgs'), prevH = box.scrollHeight;
    const kd = K[S.cur.kind];
    try {
      const r = await api.get(kd.msgs, { [kd.param]: S.cur.id, before: first.id });
      if (my !== S.convSeq || !r || !r.ok) return;
      const old = r.xabarlar || [];
      const have = new Set(S.msgs.map(m => m.id));
      S.msgs = old.filter(m => !have.has(m.id)).concat(S.msgs);
      S.olderMore = !!r.yana_bor;
      renderMsgs(false);
      box.scrollTop = box.scrollHeight - prevH;           // o'qiyotgan joyda qolish
    } catch (_) {}
  }

  // Javob (quote) bosilganda asl xabarga o'tish; kerak bo'lsa eski xabarlar yuklanadi
  async function jumpTo(id) {
    if (!S.cur) return;
    let tries = 0;
    while (!S.msgs.some(m => m.id === id) && S.olderMore && tries++ < 6) await loadOlder();
    const el = q(`.iitc-row[data-mid="${id}"]`);
    if (!el) { showErr('Bu xabar topilmadi (u eski yoki o\'chirilgan bo\'lishi mumkin)'); return; }
    el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1600);
  }

  // ─── Audio pleyer ──────────────────────────────────
  // Bir vaqtda bitta audio ijro etiladi. Audio elementi xabarlar ro'yxatidan TASHQARIDA
  // yashaydi (ro'yxat qayta chizilganda ijro to'xtab qolmasligi uchun); pleyer ko'rinishi
  // syncAudioUI() orqali qayta chizishdan keyin tiklanadi.
  const A = { el: null, key: null, loading: false, rate: 1, retried: false, pos: new Map() };

  function audioEl() {
    if (A.el) return A.el;
    const el = new Audio();
    el.preload = 'metadata';
    el.setAttribute('playsinline', '');
    ['play', 'pause', 'playing', 'waiting', 'durationchange', 'seeked'].forEach(ev => el.addEventListener(ev, syncAudioUI));
    el.addEventListener('timeupdate', () => { if (A.key && !A.loading) A.pos.set(A.key, el.currentTime); syncAudioUI(); });
    el.addEventListener('ended', () => { if (A.loading) return; if (A.key) A.pos.set(A.key, 0); syncAudioUI(); });
    el.addEventListener('error', onAudioErr);
    A.el = el;
    return el;
  }

  function audioTotal(key, p) {
    const el = A.el;
    if (A.key === key && el && isFinite(el.duration) && el.duration > 0) return el.duration;
    return Number(p && p.dataset.dur) || 0;
  }

  function syncAudioUI() {
    if (!S.root) return;
    const box = q('.iitc-msgs');
    if (!box) return;
    box.querySelectorAll('.iitc-aud').forEach(p => {
      const key = p.dataset.aud;
      if (!key) return;                                     // hali yuborilmagan (disabled) pleyer
      const active = A.key === key, el = A.el;
      const total = audioTotal(key, p);
      const cur = active && el && !A.loading ? el.currentTime : (A.pos.get(key) || 0);
      const playing = !!(active && el && !el.paused && !el.ended && !A.loading);
      p.classList.toggle('is-playing', playing);
      p.classList.toggle('is-loading', active && A.loading);
      const btn = p.querySelector('.iitc-aud-btn');
      if (btn) btn.setAttribute('aria-label', playing ? 'To\'xtatish' : 'Ijro etish');
      const seek = p.querySelector('.iitc-aud-seek');
      if (seek && !(S.dragging && document.activeElement === seek)) {
        const v = total ? Math.min(1000, Math.round(cur / total * 1000)) : 0;
        seek.value = v;
        seek.style.setProperty('--v', (v / 10) + '%');
      }
      const tm = p.querySelector('.iitc-aud-time');
      if (tm) tm.textContent = `${fmtDur(cur)} / ${fmtDur(total)}`;
      const rt = p.querySelector('.iitc-aud-rate');
      if (rt) rt.textContent = A.rate + 'x';
    });
  }

  function once(el, ev, ms) {
    return new Promise((resolve, reject) => {
      const ok = () => { cleanup(); resolve(); };
      const bad = () => { cleanup(); reject(new Error('audio')); };
      const t = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, ms || 15000);
      function cleanup() { clearTimeout(t); el.removeEventListener(ev, ok); el.removeEventListener('error', bad); }
      el.addEventListener(ev, ok); el.addEventListener('error', bad);
    });
  }

  // Manba o'rnatiladi va metadata kutiladi. MediaRecorder (Chrome) yozgan webm faylda davomiylik
  // ko'rsatilmaydi (duration = Infinity) — oxiriga sakrab, uni aniqlatamiz.
  async function loadAudio(url, pos) {
    const el = audioEl();
    el.src = url;
    el.load();
    await once(el, 'loadedmetadata');
    if (el.duration === Infinity) {
      try {
        const done = once(el, 'timeupdate', 4000);
        el.currentTime = 1e101;
        await done;
      } catch (_) {}
    }
    try { el.currentTime = pos || 0; } catch (_) {}
  }

  async function audioSource(kind, id) {
    const local = S.blobs.get(ck(kind, id));
    return local || signedUrl(kind, id, true);
  }

  async function playKey(kind, id, key, withRetry) {
    const el = audioEl();
    A.loading = true; syncAudioUI();
    try {
      const url = await audioSource(kind, id);
      if (A.key !== key) return;
      await loadAudio(url, A.pos.get(key) || 0);
      if (A.key !== key) return;
      A.loading = false;
      el.playbackRate = A.rate;
      await el.play();
    } catch (e) {
      if (A.key !== key) return;
      A.loading = false;
      if (withRetry && !A.retried) {                       // havola eskirgan bo'lishi mumkin — bir marta yangilab ko'ramiz
        A.retried = true;
        S.urls.delete(key);
        return playKey(kind, id, key, false);
      }
      A.key = null;
      showErr('Audioni ijro etib bo\'lmadi');
    }
    syncAudioUI();
  }

  function onPlayClick(btn) {
    const id = parseInt(btn.dataset.play, 10);
    if (!S.cur || !id) return;
    const kind = S.cur.kind, key = ck(kind, id), el = audioEl();
    if (A.key === key) {
      if (A.loading) return;
      if (el.paused || el.ended) { el.playbackRate = A.rate; el.play().catch(() => showErr('Audioni ijro etib bo\'lmadi')); }
      else el.pause();
      return;
    }
    if (A.key) { el.pause(); }
    A.key = key; A.retried = false;
    playKey(kind, id, key, true);
  }

  // Ijro vaqtida havola muddati tugab, oldinga o'tkazish/yuklash xato bersa — yangi havola bilan davom etiladi
  async function onAudioErr() {
    const el = A.el;
    if (!el || !A.key || A.loading || !el.src) return;
    if (A.retried) { A.key = null; syncAudioUI(); showErr('Audioni ijro etib bo\'lmadi'); return; }
    A.retried = true;
    const key = A.key, [kind, id] = key.split(':');
    const pos = el.currentTime || A.pos.get(key) || 0;
    A.pos.set(key, pos);
    S.urls.delete(key);
    playKey(kind, parseInt(id, 10), key, false);
  }

  function onSeekInput(range) {
    const p = range.closest('.iitc-aud');
    if (!p || !p.dataset.aud) return;
    const key = p.dataset.aud, total = audioTotal(key, p);
    if (!total) return;
    const t = Math.min(total, Math.max(0, range.value / 1000 * total));
    range.style.setProperty('--v', (range.value / 10) + '%');
    const tm = p.querySelector('.iitc-aud-time');
    if (tm) tm.textContent = `${fmtDur(t)} / ${fmtDur(total)}`;
    if (A.key === key && !A.loading && A.el) { try { A.el.currentTime = t; } catch (_) {} }
    else A.pos.set(key, t);
  }

  function cycleRate() {
    A.rate = RATES[(RATES.indexOf(A.rate) + 1) % RATES.length];
    if (A.el) A.el.playbackRate = A.rate;
    syncAudioUI();
  }

  function stopAudio() {
    if (A.el) { try { A.el.pause(); A.el.removeAttribute('src'); A.el.load(); } catch (_) {} }
    A.key = null; A.loading = false; A.retried = false;
  }

  // ─── Mikrofon yozuvi ───────────────────────────────
  function recSupported() {
    return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }
  // Brauzer qo'llaydigan format: Chrome/Android — webm, Safari/iOS — mp4 (m4a), Firefox — ogg
  function pickMime() {
    const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
    for (const t of list) { try { if (MediaRecorder.isTypeSupported(t)) return t; } catch (_) {} }
    return '';
  }
  function recExt(mime) {
    const m = String(mime || '').toLowerCase();
    if (m.includes('webm')) return 'webm';
    if (m.includes('ogg'))  return 'ogg';
    if (m.includes('mp4') || m.includes('aac') || m.includes('m4a')) return 'm4a';
    return '';
  }
  function micError(e) {
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'Mikrofonga ruxsat berilmagan. Brauzer (yoki Telegram) sozlamalaridan ruxsat bering';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Mikrofon topilmadi';
    if (n === 'NotReadableError') return 'Mikrofon boshqa ilova tomonidan band';
    return 'Mikrofonni yoqib bo\'lmadi';
  }

  async function startRec() {
    if (S.rec || !S.cur || S.editing || !recSupported()) return;
    showErr('');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { showErr(micError(e)); return; }
    if (!S.cur || S.rec) { stream.getTracks().forEach(t => t.stop()); return; }   // ruxsat so'ralgan paytda suhbat yopilgan bo'lishi mumkin
    let mr;
    const mime = pickMime();
    try { mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
    catch (_) { stream.getTracks().forEach(t => t.stop()); showErr('Bu qurilmada ovoz yozib bo\'lmaydi'); return; }

    const rec = { mr, stream, chunks: [], t0: Date.now(), timer: 0, cancelled: false, mime: mr.mimeType || mime, conv: S.convSeq };
    mr.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
    mr.onerror = () => { cancelRec(); showErr('Yozishda xatolik yuz berdi'); };
    mr.onstop = () => finishRec(rec);
    S.rec = rec;
    try { mr.start(1000); } catch (_) { S.rec = null; stream.getTracks().forEach(t => t.stop()); showErr('Yozishni boshlab bo\'lmadi'); return; }

    q('.iitc-form').style.display = 'none';
    q('.iitc-rec').style.display = 'flex';
    paintRec();
    rec.timer = setInterval(() => {
      paintRec();
      if ((Date.now() - rec.t0) / 1000 >= MAX_REC_SEC) stopRec(true);   // chegaraga yetganda yozilgan qism yuboriladi
    }, 250);
  }

  function paintRec() {
    if (!S.rec || !S.root) return;
    const sec = (Date.now() - S.rec.t0) / 1000;
    q('.iitc-rec-time').textContent = fmtDur(sec);
    const left = MAX_REC_SEC - sec;
    q('.iitc-rec-hint').textContent = left <= 60 ? `Yana ${Math.max(0, Math.ceil(left))} soniya` : 'Yozilmoqda…';
  }

  function stopRec(send) {
    const rec = S.rec;
    if (!rec) return;
    rec.cancelled = !send;
    clearInterval(rec.timer);
    rec.dur = (Date.now() - rec.t0) / 1000;
    try { if (rec.mr.state !== 'inactive') rec.mr.stop(); else finishRec(rec); } catch (_) { finishRec(rec); }
  }
  function cancelRec(silent) {
    if (!S.rec) return;
    stopRec(false);
    if (!silent) showErr('');
  }

  function finishRec(rec) {
    if (S.rec !== rec) return;
    S.rec = null;
    if (rec.dur == null) rec.dur = (Date.now() - rec.t0) / 1000;     // yozuv o'zi to'xtab qolgan bo'lsa ham yozilgan qismi yuboriladi
    clearInterval(rec.timer);
    rec.stream.getTracks().forEach(t => t.stop());
    if (S.root) {
      const f = q('.iitc-form'), r = q('.iitc-rec');
      if (f) f.style.display = '';
      if (r) r.style.display = 'none';
      updateSend();
    }
    if (rec.cancelled || !S.cur || rec.conv !== S.convSeq) return;
    if (!rec.chunks.length) { showErr('Ovoz yozilmadi. Mikrofonni tekshirib, qayta urinib ko\'ring'); return; }
    if (rec.dur < MIN_REC_SEC) { showErr('Yozuv juda qisqa — tugmani bosib, biroz gapiring'); return; }
    const ext = recExt(rec.mime);
    if (!ext) { showErr('Bu brauzerda yozilgan audio formati qo\'llab-quvvatlanmaydi. 📎 orqali audio fayl yuboring'); return; }
    const blob = new Blob(rec.chunks, { type: rec.mime || ('audio/' + ext) });
    if (blob.size > MAX_FILE) { showErr(`Yozuv ${MAX_FILE / MB}MB dan katta`); return; }
    const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
    const name = `ovoz-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.${ext}`;
    let file;
    try { file = new File([blob], name, { type: blob.type }); } catch (_) { file = blob; file.name = name; }
    sendFileNow(file, Math.round(rec.dur));
  }

  // ─── Yuborish ──────────────────────────────────────
  function updateSend() {
    if (!S.root) return;
    const has = !!q('.iitc-input').value.trim();
    const mic = q('.iitc-mic'), send = q('.iitc-send');
    // Matn ham, fayl ham yo'q bo'lsa — mikrofon tugmasi; aks holda — yuborish tugmasi
    const showMic = !!mic && !S.editing && !S.pending && !has;
    if (mic) mic.style.display = showMic ? '' : 'none';
    send.style.display = (mic && showMic) ? 'none' : '';
    send.disabled = S.editing ? !(has || S.editing.hasFile) : !(has || S.pending);
    q('.iitc-attach').disabled = !!S.editing;
  }

  function onSubmit() { if (S.editing) submitEdit(); else sendMessage(); }

  // Audio fayl davomiyligi (soniya) — faqat ko'rsatish uchun; aniqlab bo'lmasa null
  function probeDuration(file) {
    return new Promise((resolve) => {
      let url, done = false;
      const a = new Audio();
      const fin = (v) => { if (done) return; done = true; clearTimeout(t); try { URL.revokeObjectURL(url); } catch (_) {} resolve(v); };
      const t = setTimeout(() => fin(null), 4000);
      try { url = URL.createObjectURL(file); } catch (_) { return resolve(null); }
      a.preload = 'metadata';
      a.onloadedmetadata = () => fin(isFinite(a.duration) && a.duration > 0 ? Math.round(a.duration) : null);
      a.onerror = () => fin(null);
      a.src = url;
    });
  }

  // Biriktiriladigan fayl: tekshirish va oldindan ko'rsatish
  function setPending(file) {
    if (!S.cur || !file) return;
    const e = extOf(file.name) || (file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : '');
    if (!FILE_EXT.includes(e)) { showErr("Bu fayl turi qo'llab-quvvatlanmaydi. Rasm, PDF, Word, Excel, PowerPoint, TXT, CSV, ZIP yoki audio (mp3, m4a, ogg, webm, wav, aac) yuboring"); return; }
    if (file.size > MAX_FILE) { showErr(`Fayl hajmi ${MAX_FILE / MB}MB dan katta bo'lmasligi kerak (${fmtSize(file.size)})`); return; }
    if (!file.size) { showErr("Fayl bo'sh"); return; }
    // Vaqtinchalik nomsiz (Ctrl+V) rasmga nom beramiz
    if (!file.name || !extOf(file.name)) {
      try { file = new File([file], `rasm-${Date.now()}.${e}`, { type: file.type }); } catch (_) {}
    }
    clearPending(true);
    showErr('');
    const pend = { file, localUrl: IMG_EXT.includes(e) ? URL.createObjectURL(file) : null, davomiylik: null };
    S.pending = pend;
    if (AUDIO_EXT.includes(e)) probeDuration(file).then(d => { pend.davomiylik = d; });
    renderCtx(); updateSend();
    if (!isMobile()) q('.iitc-input').focus();
  }

  function clearPending(silent) {
    if (S.pending && S.pending.localUrl && !S.pending.keepUrl) URL.revokeObjectURL(S.pending.localUrl);
    S.pending = null;
    if (!silent) { renderCtx(); updateSend(); }
  }

  // ─── Javob (reply) ─────────────────────────────────
  function snippetOf(m) {
    if (m.matn) return String(m.matn).replace(/\s+/g, ' ').slice(0, 100);
    return m.fayl ? fileLabel(m.fayl) : '';
  }
  function startReply(id) {
    const m = S.msgs.find(x => x.id === id);
    if (!m || !S.cur || S.cur.kind !== 'g' || typeof m.id !== 'number') return;
    if (S.editing) cancelEdit();
    S.replyTo = { id, ism: isMine(m) ? 'Siz' : (m.ism || (m.yuboruvchi === 'oqituvchi' ? "O'qituvchi" : "O'quvchi")), snippet: snippetOf(m) };
    S.menuFor = null;
    showErr('');
    renderCtx(); renderMsgs(false);
    q('.iitc-input').focus();
  }
  function clearReply() {
    if (!S.replyTo) return;
    S.replyTo = null;
    renderCtx();
  }

  // Yozish maydoni ustidagi qatorlar: javob · tanlangan fayl yoki "tahrirlash" holati
  function renderCtx() {
    if (!S.root) return;
    const box = q('.iitc-ctx');
    let html = '';
    if (S.replyTo && !S.editing) {
      html += `<div class="iitc-ctxrow reply"><span class="iitc-ctx-ico" aria-hidden="true">${ICON.reply}</span>
        <span class="iitc-ctx-txt"><b>${esc(S.replyTo.ism)} ga javob</b><span>${esc(S.replyTo.snippet)}</span></span>
        <button type="button" class="iitc-ctx-x" data-ctx-x="reply" aria-label="Javobni bekor qilish">✕</button></div>`;
    }
    if (S.editing) {
      const m = S.msgs.find(x => x.id === S.editing.id);
      const txt = (m && m.matn) || (m && m.fayl && m.fayl.nomi) || '';
      html += `<div class="iitc-ctxrow edit"><span class="iitc-ctx-ico" aria-hidden="true">✏️</span>
        <span class="iitc-ctx-txt"><b>Tahrirlash</b><span>${esc(txt.replace(/\s+/g, ' '))}</span></span>
        <button type="button" class="iitc-ctx-x" data-ctx-x="edit" aria-label="Tahrirlashni bekor qilish">✕</button></div>`;
    } else if (S.pending) {
      const f = S.pending.file;
      html += `<div class="iitc-ctxrow file">${S.pending.localUrl
          ? `<img class="iitc-ctx-thumb" src="${S.pending.localUrl}" alt="">`
          : `<span class="iitc-ctx-ico" aria-hidden="true">${fileIcon(f.name)}</span>`}
        <span class="iitc-ctx-txt"><b>${esc(f.name)}</b><span>${esc(fmtSize(f.size))}</span></span>
        <button type="button" class="iitc-ctx-x" data-ctx-x="file" aria-label="Faylni olib tashlash">✕</button></div>`;
    }
    box.innerHTML = html;
    box.style.display = html ? 'flex' : 'none';
  }

  // Xabarni ro'yxatga qo'yib, yuborishni boshlaydi
  function queueTmp(tmp) {
    S.msgs.push(tmp);
    renderMsgs(true);
    return doSend(tmp);
  }

  function newTmp(matn) {
    const tmp = {
      id: 'tmp-' + (++S.tmpSeq), tmp: true, yuboruvchi: S.role, meniki: true,
      yuboruvchi_id: null, ism: '', matn: matn || '', yaratilgan: new Date().toISOString(),
    };
    if (S.cur && S.cur.kind === 'g' && S.replyTo) {
      tmp.javob = { id: S.replyTo.id, ism: S.replyTo.ism === 'Siz' ? '' : S.replyTo.ism, matn: S.replyTo.snippet };
    }
    return tmp;
  }

  async function sendMessage() {
    const input = q('.iitc-input');
    const matn = input.value.replace(/\r\n/g, '\n').trim();
    const pend = S.pending;
    if ((!matn && !pend) || !S.cur) return;
    if (matn.length > MAX_LEN) { showErr(`Xabar ${MAX_LEN} belgidan oshmasligi kerak`); return; }

    input.value = ''; autosize(); showErr('');
    const tmp = newTmp(matn);
    if (pend) {
      tmp.file = pend.file; tmp.localUrl = pend.localUrl; tmp.davomiylik = pend.davomiylik;
      const au = AUDIO_EXT.includes(extOf(pend.file.name));
      tmp.fayl = { nomi: pend.file.name, hajm: pend.file.size, rasm: !!pend.localUrl, audio: au, ...(au && pend.davomiylik != null ? { davomiylik: pend.davomiylik } : {}) };
      if (pend.localUrl) pend.keepUrl = true;           // vaqtinchalik ko'rinish uchun kerak — bekor qilinmasin
    }
    S.pending = null; S.replyTo = null;
    renderCtx(); updateSend();
    await queueTmp(tmp);
    if (!isMobile()) input.focus();
  }

  // Mikrofon yozuvi: matnsiz, to'g'ridan-to'g'ri yuboriladi
  function sendFileNow(file, dur) {
    if (!S.cur) return;
    const tmp = newTmp('');
    const localUrl = URL.createObjectURL(file);
    tmp.file = file; tmp.localUrl = localUrl; tmp.davomiylik = dur;
    tmp.fayl = { nomi: file.name, hajm: file.size, rasm: false, audio: true, davomiylik: dur };
    S.replyTo = null; renderCtx();
    return queueTmp(tmp);
  }

  // multipart yuborish: XMLHttpRequest — yuklash progressi uchun (fetch buni bermaydi)
  function uploadMessage(cur, tmp, onProg) {
    return new Promise((resolve) => {
      const kd = K[cur.kind];
      const fd = new FormData();
      fd.append(kd.param, String(cur.id));
      fd.append('matn', tmp.matn || '');
      if (cur.kind === 'g' && tmp.javob) fd.append('javob', String(tmp.javob.id));
      if (tmp.davomiylik != null) fd.append('davomiylik', String(Math.round(tmp.davomiylik)));
      fd.append('fayl', tmp.file, tmp.file.name);

      const xhr = new XMLHttpRequest();
      tmp.xhr = xhr;
      xhr.open('POST', BASE + kd.msgs);
      const t = tokenStore.get();
      if (t) xhr.setRequestHeader('Authorization', `Bearer ${t}`);
      let sentAll = false;
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) { onProg(e.loaded, e.total); if (e.loaded >= e.total) sentAll = true; } };
      xhr.upload.onload = () => { sentAll = true; };
      xhr.onload = () => {
        if (xhr.status === 401) { handleUnauthorized(); return resolve({ ok: false, error: 'Seans tugadi' }); }
        let j = null;
        try { j = JSON.parse(xhr.responseText); } catch (_) {}
        if (j) return resolve(j);
        // JSON emas — odatda nginx/Cloudflare javobi
        if (xhr.status === 413) return resolve({ ok: false, error: `Fayl serverga sig'madi. Hajmi ${MAX_FILE / MB}MB dan oshmasligi kerak` });
        if (xhr.status >= 500) return resolve({ ok: false, unsure: true, error: 'Server javob bermadi. Xabar yetib borgan bo\'lishi mumkin — suhbatni tekshirib, kerak bo\'lsa qayta yuboring' });
        resolve({ ok: false, error: `Server xatoligi (${xhr.status})` });
      };
      xhr.onerror = () => resolve(sentAll
        ? { ok: false, unsure: true, error: 'Server javobi kelmadi. Xabar yetib borgan bo\'lishi mumkin — suhbatni tekshirib, kerak bo\'lsa qayta yuboring' }
        : { ok: false, error: 'Aloqa uzildi. Internetni tekshirib, qayta yuboring' });
      xhr.onabort = () => resolve({ ok: false, aborted: true });
      xhr.send(fd);
    });
  }

  async function postMessage(cur, tmp) {
    if (tmp.file) {
      return uploadMessage(cur, tmp, (loaded, total) => { tmp.up = { loaded, total }; paintProgress(tmp); });
    }
    const kd = K[cur.kind];
    const body = { [kd.param]: cur.id, matn: tmp.matn };
    if (cur.kind === 'g' && tmp.javob) body.javob = tmp.javob.id;
    return api.post(kd.msgs, body);
  }

  async function doSend(tmp) {
    const cur = S.cur, my = S.convSeq;
    if (!cur) return;
    const same = () => my === S.convSeq;
    let r;
    try { r = await postMessage(cur, tmp); }
    catch (_) { r = { ok: false, error: "Server bilan aloqa yo'q" }; }
    tmp.xhr = null;

    if (r && r.aborted) {                                   // foydalanuvchi bekor qildi
      if (same()) { S.msgs = S.msgs.filter(m => m !== tmp); renderMsgs(false); }
      if (tmp.localUrl) URL.revokeObjectURL(tmp.localUrl);
      return;
    }

    if (r && r.ok && r.xabar) {
      if (tmp.localUrl) {
        // Rasm/audio: lokal nusxa qayta ishlatiladi — qayta yuklash/miltillash bo'lmasin
        const k = ck(cur.kind, r.xabar.id);
        if (r.xabar.fayl && (r.xabar.fayl.rasm || r.xabar.fayl.audio)) S.blobs.set(k, tmp.localUrl);
        else URL.revokeObjectURL(tmp.localUrl);
      }
      if (!same()) {                                        // boshqa suhbatga o'tib ketilgan — faqat ro'yxat yangilanadi
        const it = S.lists[cur.kind].find(x => x[K[cur.kind].id] === cur.id);
        if (it) { it.oxirgi_matn = r.xabar.matn || ''; it.oxirgi_yuboruvchi = S.role; it.oxirgi_ism = ''; it.oxirgi_vaqt = r.xabar.yaratilgan;
          it.oxirgi_fayl_nomi = r.xabar.fayl ? r.xabar.fayl.nomi : null; it.oxirgi_fayl_rasm = !!(r.xabar.fayl && r.xabar.fayl.rasm); it.oxirgi_fayl_audio = !!(r.xabar.fayl && r.xabar.fayl.audio);
          S.lists[cur.kind].sort(listCmp); if (S.root) renderList(); }
        return;
      }
      S.msgs = S.msgs.filter(m => m !== tmp);
      if (!S.msgs.some(m => m.id === r.xabar.id)) S.msgs.push(r.xabar);   // polling allaqachon qo'shgan bo'lishi mumkin
      S.msgs.sort(cmp);
      S.lastId = Math.max(S.lastId, r.xabar.id);
      setLast(r.xabar); S.lists[cur.kind].sort(listCmp);
      renderList();
      renderMsgs(true);
      return;
    }

    // Xatolik: xabar "yuborilmadi" holatida qoladi (qayta yuborish / olib tashlash mumkin)
    tmp.failed = true; tmp.tmp = false; tmp.up = null;
    const err = (r && r.error) || 'Xabar yuborilmadi';
    if (!same()) {                                          // foydalanuvchi boshqa suhbatda — qaytganda ko'rsatamiz
      const key = ck(cur.kind, cur.id);
      S.orphans.set(key, (S.orphans.get(key) || []).concat(tmp));
      return;
    }
    S.msgs = S.msgs.filter(m => m !== tmp); S.msgs.push(tmp);
    showErr(err);
    if (r && /yozishish mumkin emas|kirish huquqingiz yo'q/.test(r.error || '')) loadLists(true);
    if (r && /Javob berilayotgan xabar/.test(r.error || '')) { S.replyTo = null; renderCtx(); tmp.javob = null; }
    renderMsgs(true);
    if (r && r.unsure) pollConv();                          // xabar aslida saqlangan bo'lishi mumkin
  }

  function retryMessage(tmpId) {
    const m = S.msgs.find(x => x.id === tmpId && x.failed);
    if (!m) return;
    m.failed = false; m.tmp = true; m.up = null; showErr('');
    renderMsgs(true);
    doSend(m);
  }
  function discardMessage(tmpId) {
    const m = S.msgs.find(x => x.id === tmpId && x.failed);
    if (!m) return;
    if (m.localUrl) URL.revokeObjectURL(m.localUrl);
    S.msgs = S.msgs.filter(x => x !== m);
    showErr('');
    renderMsgs(false);
  }
  function cancelUpload(tmpId) {
    const m = S.msgs.find(x => x.id === tmpId && x.tmp);
    if (m && m.xhr) m.xhr.abort();
  }

  // ─── Tahrirlash ────────────────────────────────────
  function toggleMenu(id) {
    S.menuFor = S.menuFor === id ? null : id;
    renderMsgs(false);
  }

  function startEdit(id) {
    const m = S.msgs.find(x => x.id === id);
    if (!m || !isMine(m)) return;
    const input = q('.iitc-input');
    if (!S.editing) S.draft = input.value;
    clearPending(true);
    S.replyTo = null;
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
    if (!ed || !S.cur) return;
    const input = q('.iitc-input');
    const matn = input.value.replace(/\r\n/g, '\n').trim();
    if (!matn && !ed.hasFile) { showErr("Xabar bo'sh bo'lmasligi kerak. Butunlay olib tashlash uchun o'chiring"); return; }
    if (matn.length > MAX_LEN) { showErr(`Xabar ${MAX_LEN} belgidan oshmasligi kerak`); return; }
    if (matn === ed.matn) { cancelEdit(); return; }           // o'zgarish yo'q

    const my = S.convSeq, kd = K[S.cur.kind];
    q('.iitc-send').disabled = true; showErr('');
    try {
      const r = await api.put(`${kd.msgs}/${ed.id}`, { matn });
      if (my !== S.convSeq) return;
      if (r && r.ok && r.xabar) {
        const i = S.msgs.findIndex(x => x.id === ed.id);
        if (i >= 0) S.msgs[i] = r.xabar;
        syncQuotes(r.xabar);
        S.editing = null;
        input.value = S.draft || ''; S.draft = '';
        renderCtx(); autosize(); updateSend(); renderMsgs(false);
        loadLists(true);
      } else {
        showErr((r && r.error) || 'Xabarni tahrirlab bo\'lmadi');
        if (r && /topilmadi/.test(r.error || '')) { S.editing = null; renderCtx(); loadLists(true); pollConv(); }
        updateSend();
      }
    } catch (_) { if (my === S.convSeq) { showErr("Server bilan aloqa yo'q"); updateSend(); } }
  }

  // ─── O'chirish ─────────────────────────────────────
  function askDelete(id) {
    const m = S.msgs.find(x => x.id === id);
    if (!m || !S.cur) return;
    const mine = isMine(m);
    if (!mine && !canModerate()) return;
    S.menuFor = null; renderMsgs(false);

    const g = S.cur.kind === 'g';
    const sub = !mine ? `Bu xabar <b>guruhdan</b> o'chadi. Uni qaytarib bo'lmaydi.`
      : g ? `Xabar <b>guruhdan</b> o'chadi va uni qaytarib bo'lmaydi.`
          : `Xabar <b>ikkala tomondan ham</b> o'chadi va uni qaytarib bo'lmaydi.`;
    const box = document.createElement('div');
    box.className = 'iitc-modal';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', "Xabarni o'chirish");
    box.innerHTML = `
      <div class="iitc-modal-card">
        <div class="iitc-modal-t">Xabar o'chirilsinmi?</div>
        <div class="iitc-modal-s">${sub}</div>
        <div class="iitc-modal-btns">
          <button type="button" class="iitc-btn" data-no>Bekor qilish</button>
          <button type="button" class="iitc-btn danger" data-yes>O'chirish</button>
        </div>
      </div>`;
    const kd = K[S.cur.kind];
    box.addEventListener('click', async (e) => {
      if (e.target === box || e.target.closest('[data-no]')) { box.remove(); return; }
      const yes = e.target.closest('[data-yes]');
      if (!yes || yes.disabled) return;
      yes.disabled = true; yes.textContent = 'O\'chirilmoqda…';
      const my = S.convSeq;
      try {
        const r = await api.del(`${kd.msgs}/${id}`);
        box.remove();
        if (my !== S.convSeq) return;
        if (r && r.ok) { removeMessage(id); loadLists(true); }
        else {
          showErr((r && r.error) || 'Xabarni o\'chirib bo\'lmadi');
          if (r && /topilmadi/.test(r.error || '')) { removeMessage(id); loadLists(true); }
        }
      } catch (_) { box.remove(); showErr("Server bilan aloqa yo'q"); }
    });
    // Modal suhbat paneli ichida (o'sha element ustida) ochiladi
    q('.iitc').appendChild(box);
    const no = box.querySelector('[data-no]'); if (no) no.focus();
  }

  // Javob ko'rsatgan xabar o'zgarsa/o'chirilsa — undagi iqtibos ham yangilanadi
  function syncQuotes(c) {
    for (const m of S.msgs) {
      if (m.javob && m.javob.id === c.id) {
        m.javob = c.ochirilgan ? { id: c.id, ochirilgan: true } : { ...m.javob, matn: String(c.matn || '').slice(0, 140) };
      }
    }
    if (S.replyTo && S.replyTo.id === c.id) {
      if (c.ochirilgan) { S.replyTo = null; renderCtx(); } else S.replyTo.snippet = snippetOf(c);
    }
  }

  // Xabarni mahalliy ro'yxatdan olib tashlash (o'chirilgan)
  function removeMessage(id) {
    const i = S.msgs.findIndex(x => x.id === id);
    if (i < 0) return;
    const [gone] = S.msgs.splice(i, 1);
    if (S.cur) {
      const key = ck(S.cur.kind, id);
      const url = S.blobs.get(key);
      if (url) { URL.revokeObjectURL(url); S.blobs.delete(key); }
      S.dims.delete(key); S.urls.delete(key);
      if (A.key === key) stopAudio();
    }
    syncQuotes({ id, ochirilgan: true });
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
        syncQuotes(c);
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
    if (!S.active || document.hidden || !S.cur) return;
    const my = S.convSeq, cur = S.cur, kd = K[cur.kind];
    try {
      const params = { [kd.param]: cur.id, after: S.lastId };
      if (S.syncAt) params.ozgarish = S.syncAt;
      const r = await api.get(kd.msgs, params);
      if (my !== S.convSeq || !r) return;
      if (!r.ok) { if (/yozishish mumkin emas|kirish huquqingiz yo'q/.test(r.error || '')) loadLists(true); return; }
      let changed = false;
      const fresh = (r.xabarlar || []).filter(m => !S.msgs.some(x => x.id === m.id));
      if (fresh.length) {
        S.msgs.push(...fresh); S.msgs.sort(cmp);
        S.lastId = Math.max(S.lastId, ...fresh.map(m => m.id));
        setLast(fresh[fresh.length - 1]);
        cur.item.oqilmagan = 0;
        changed = true;
      }
      if (r.ozgargan && r.ozgargan.length) {
        const c = applyChanges(r.ozgargan);
        if (c.changed || c.deleted) { changed = true; loadLists(true); }   // oxirgi xabar ko'rinishi yangilansin
      }
      markSync(r);
      if (cur.kind === 'd' && (r.oqilgan_id || 0) !== S.oqilganId) { S.oqilganId = r.oqilgan_id || 0; changed = true; }
      if (changed) { renderMsgs(false); renderList(); paintBadges(); }
    } catch (_) {}
  }

  function startTimers() {
    stopTimers();
    S.timers.conv = setInterval(pollConv, CONV_POLL_MS);
    S.timers.list = setInterval(() => { if (S.active && !document.hidden) loadLists(true); }, LIST_POLL_MS);
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
    S.getMaktabId = opts.getMaktabId || null;
    S.onAvailability = opts.onAvailability || null;
    if (!S.root) return;
    build();
    S.initialized = true;

    // Chat bo'limi mavjudmi (suhbatdosh yoki guruh bormi)? — panel tabni ko'rsatadi/yashiradi
    if (S.onAvailability) {
      loadLists(true).then(() => { if (!S.loaded.g && !S.loaded.d) S.onAvailability(true); });
    }

    // O'qilmaganlar belgisi — chat tabi yopiq paytda ham yangilanib turadi
    pollBadge();
    clearInterval(S.timers.badge);
    S.timers.badge = setInterval(pollBadge, BADGE_POLL_MS);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (S.active) { loadLists(true); pollConv(); } else pollBadge();
    });
  }

  function setActive(on) {
    if (!S.initialized) return;
    on = !!on;
    if (on === S.active) { if (on) loadLists(true); return; }
    S.active = on;
    if (on) {
      loadLists(); startTimers();
      // Telefonda ochiq suhbat bilan qaytilsa — "orqaga" tugmasi uni yopishi uchun qatlam qayta qo'shiladi
      if (S.cur && isMobile()) pushLayer();
    } else {
      stopTimers(); pollBadge();
      if (S.rec) cancelRec(true);                          // boshqa bo'limga o'tilganda yozuv bekor qilinadi
      if (A.el && !A.el.paused) A.el.pause();              // ijro to'xtatiladi
      // Boshqa tabga o'tilganda: panelning NAV tizimi qatlamni o'zi olib tashlaydi;
      // o'z history yozuvimiz bo'lsa — uni shu yerda olib tashlaymiz
      if (S.navPush) S.mobileNavOn = false; else releaseLayer();
    }
  }

  // Maktab almashganda: ochiq suhbat yopiladi, ro'yxat va belgi yangidan olinadi
  function reload() {
    if (!S.initialized) return;
    if (S.cur) { releaseLayer(); closeConv(); }
    S.lists = { g: [], d: [] }; S.loaded = { g: false, d: false };
    const sr = q('.iitc-search'); if (sr) sr.value = '';
    const ls = q('.iitc-list'); if (ls) ls.innerHTML = '';
    paintBadges();
    if (S.active) loadLists(); else pollBadge();
  }

  window.IITChat = { init, setActive, reload };
})();
