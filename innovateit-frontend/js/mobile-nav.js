/* ═══════════════════════════════════════════════════════════════════
   InnovateIT School — Admin panel: mobil hamburger menyu (JS)
   Har bir .topbar ichiga hamburger tugma qo'shadi va .topbar-right ni
   telefon o'lchamida (≤768px) pastga tushadigan menyuga aylantiradi.
   Bu fayl barcha admin panel sahifalarida bir xil ishlaydi — sahifaga
   xos hech qanday moslama talab qilinmaydi.
═══════════════════════════════════════════════════════════════════ */
(function () {
  var MOBILE_BREAKPOINT = 768;

  // Berilgan elementdan yuqoriga qarab `cls` klassiga ega ajdodni topadi
  // (root ga yetguncha). Topilmasa null qaytaradi.
  function findAncestor(el, cls, root) {
    while (el && el !== root) {
      if (el.classList && el.classList.contains(cls)) return el;
      el = el.parentNode;
    }
    return null;
  }

  // Barcha accordion submenularni yopiq holatga qaytaradi (menyu yopilganda
  // yoki qayta ochilganda toza holatdan boshlanishi uchun)
  function resetAccordions(right) {
    var accs = right.querySelectorAll('.mn-acc.mn-acc-open');
    for (var i = 0; i < accs.length; i++) {
      accs[i].classList.remove('mn-acc-open');
      var toggle = accs[i].querySelector('.mn-acc-toggle');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }
  }

  function makeOverlay(topbar) {
    var overlay = document.createElement('div');
    overlay.className = 'topbar-overlay';
    topbar.parentNode.insertBefore(overlay, topbar.nextSibling);
    return overlay;
  }

  function initTopbar(topbar) {
    if (topbar.dataset.mobileNavReady) return;

    var right = topbar.querySelector('.topbar-right');
    if (!right) return;

    topbar.dataset.mobileNavReady = '1';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'topbar-hamburger';
    btn.setAttribute('aria-label', 'Menyuni ochish');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span></span>';
    // Hamburger tugma topbar'ning CHAP tomonida (brend nomidan oldin)
    // joylashadi — shunda u drawer ochiladigan tomon (chap) bilan bir
    // xil tarafda turadi.
    topbar.insertBefore(btn, topbar.firstChild);

    // Drawer ichida, blog saytidagi "mobile-nav-head" patterniga o'xshab,
    // yuqorida ADMIN ISMI (agar shu sahifada #admin-badge/.admin-badge
    // mavjud bo'lsa) bilan BIR QATORDA ✕ yopish tugmasi chiqadi.
    // Desktopda bu o'ram divlar "display:contents" bo'lgani uchun
    // admin-badge xuddi avvalgidek topbar qatorida chiqaveradi — faqat
    // mobil drawer'da alohida "profil qatori" hosil bo'ladi.
    var drawerHead = document.createElement('div');
    drawerHead.className = 'mn-drawer-head';

    var badge = right.querySelector('.admin-badge');
    var avatar = null;
    if (badge) {
      var profile = document.createElement('div');
      profile.className = 'mn-drawer-profile';

      avatar = document.createElement('div');
      avatar.className = 'mn-drawer-avatar';
      profile.appendChild(avatar);

      var nameWrap = document.createElement('div');
      nameWrap.className = 'mn-drawer-name-wrap';
      nameWrap.appendChild(badge); // mavjud elementni shu yerga ko'chiramiz
      profile.appendChild(nameWrap);

      drawerHead.appendChild(profile);
    }

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'mn-drawer-close';
    closeBtn.setAttribute('aria-label', 'Menyuni yopish');
    closeBtn.innerHTML = '&times;';
    drawerHead.appendChild(closeBtn);

    right.insertBefore(drawerHead, right.firstChild);

    // Avatar doirachasidagi harf — admin ismining birinchi harfi (masalan
    // "Muhammadaliyev Nuriddin" → "M"). Ism keyinroq (login/showApp ichida)
    // to'ldirilishi mumkin bo'lgani uchun menyu HAR OCHILGANIDA yangilanadi.
    function updateAvatar() {
      if (!avatar || !badge) return;
      var txt = (badge.textContent || '').replace(/[^\p{L}\p{N}]/gu, '');
      avatar.textContent = txt ? txt.charAt(0).toUpperCase() : '';
    }
    updateAvatar();

    var overlay = makeOverlay(topbar);

    function isMobile() {
      return window.innerWidth <= MOBILE_BREAKPOINT;
    }

    function openMenu() {
      resetAccordions(right);
      updateAvatar();
      right.classList.add('mn-open');
      overlay.classList.add('mn-open');
      btn.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }

    function closeMenu() {
      right.classList.remove('mn-open');
      overlay.classList.remove('mn-open');
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      resetAccordions(right);
    }

    function toggleMenu() {
      if (right.classList.contains('mn-open')) closeMenu();
      else openMenu();
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleMenu();
    });

    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeMenu();
    });

    overlay.addEventListener('click', closeMenu);

    // Accordion sarlavhasi (masalan "O'quvchilar"/"O'qituvchilar") bosilsa —
    // faqat shu submenuni ochamiz/yopamiz, butun menyu yopilmaydi.
    // Boshqa (haqiqiy navigatsiya) tugma/link bosilsa — butun menyu yopiladi.
    right.addEventListener('click', function (e) {
      var toggleBtn = findAncestor(e.target, 'mn-acc-toggle', right);
      if (toggleBtn) {
        var acc = findAncestor(toggleBtn, 'mn-acc', right);
        if (acc) {
          var willOpen = !acc.classList.contains('mn-acc-open');
          acc.classList.toggle('mn-acc-open', willOpen);
          toggleBtn.setAttribute('aria-expanded', String(willOpen));
        }
        return;
      }

      var el = e.target;
      while (el && el !== right) {
        if (el.tagName === 'BUTTON' || el.tagName === 'A') {
          closeMenu();
          break;
        }
        el = el.parentNode;
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') closeMenu();
    });

    window.addEventListener('resize', function () {
      if (!isMobile()) closeMenu();
    });
  }

  function init() {
    var topbars = document.querySelectorAll('.topbar');
    for (var i = 0; i < topbars.length; i++) initTopbar(topbars[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
