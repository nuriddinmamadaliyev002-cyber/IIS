// ═══════════════════════════════════════════════════════════════════════════
//  Telegram Mini App oynasini moslash + jadvallarni mobil kartalarga aylantirish
//  1) Telegram ichida ochilganda: ready() + expand(); kompyuter (Telegram
//     Desktop/Web) da — kichik oyna o'rniga to'liq ekran (requestFullscreen).
//  2) .dtbl jadvallariga data-label qo'yadi (mobilda "karta" ko'rinishi uchun).
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  // ─── 1) Telegram oynasi ───────────────────────────────────────────────────
  try {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      var desktop = ['tdesktop', 'macos', 'weba', 'webk', 'web'].indexOf(tg.platform) !== -1;
      if (desktop && tg.requestFullscreen && tg.isVersionAtLeast && tg.isVersionAtLeast('8.0') && !tg.isFullscreen) {
        tg.requestFullscreen();
      }
      // To'liq ekranda Telegram'ning o'z tugmalari tepada turadi — topbar ularning tagida qolmasin
      var st = document.createElement('style');
      st.textContent =
        ':root{--tg-top:calc(var(--tg-safe-area-inset-top,0px) + var(--tg-content-safe-area-inset-top,0px));}' +
        '.topbar{top:var(--tg-top)!important;}' +
        'body:has(> .topbar),#app{padding-top:calc(var(--topbar-h) + var(--tg-top));}';
      document.head.appendChild(st);
    }
  } catch (_) {}

  // ─── 2) Jadval ustunlari nomini har bir katakka yozish ────────────────────
  function label(tbl) {
    var heads = [].map.call(tbl.querySelectorAll('thead th'), function (th) { return th.textContent.trim(); });
    if (!heads.length) return;
    [].forEach.call(tbl.querySelectorAll('tbody tr'), function (tr) {
      [].forEach.call(tr.children, function (td, i) {
        if (heads[i] && td.getAttribute('data-label') !== heads[i]) td.setAttribute('data-label', heads[i]);
      });
    });
  }
  function run() { [].forEach.call(document.querySelectorAll('table.dtbl'), label); }

  function start() {
    run();
    var pending = false;
    new MutationObserver(function () {
      if (pending) return; pending = true;
      requestAnimationFrame(function () { pending = false; run(); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
