/* ═══════════════════════════════════════════════════════════════════
   InnovateIT School — Hamburger menyu: umumiy navigatsiya yordamchisi.

   index.html'dan boshqa barcha "maktab admini" panel sahifalarida
   (nofaol.html, davomat.html, oqituvchilar.html, dars-jadvali.html,
   oqituvchilar-davomat.html) ishlatiladi.

   ✅ TUZATILDI (bug: submenu bosilganda login oynasi "milt etib"
   chiqib qolardi):
   Avvalgi versiyada bu funksiya HAR DOIM index.html'ga qaytarib,
   sessionStorage'dagi "iit_pending_nav" bayrog'i orqali kerakli
   amalni index.html'ning o'zida (handlePendingNav) bajartirardi.
   Bu index.html'ni to'liq qayta yuklashga majbur qilardi — natijada
   sahifaning standart holati (#login-screen ko'rinadigan, #app
   yashirin) bir zumga ko'rinib, keyin JS session'ni tiklab qayta
   yo'naltirguncha foydalanuvchi "login oynasi chiqib qoldi" deb
   o'ylardi. Bundan tashqari, agar shu oraliqda token muddati tugagan
   bo'lsa, foydalanuvchi haqiqatan ham chiqib ketish/kirish tsiklida
   qolib ketardi.

   Endi: "Nofaol", "Davomat", "O'qituvchilar" bo'limlariga tegishli
   barcha submenu bandlari uchun alohida sahifa mavjud bo'lgani sabab,
   ular index.html'ga umuman kirmasdan, joriy sahifada allaqachon
   mavjud bo'lgan sessiya ma'lumotidan (U) foydalanib TO'G'RIDAN-
   TO'G'RI maqsad sahifaga o'tkaziladi. Faqat "Faol" va "Yangi o'quvchi
   qo'shish" — bular index.html'ning ICHIDAGI bo'limlar (alohida
   sahifasi yo'q) — shu ikkitasi uchungina eski "index.html orqali
   qaytarish" yo'li ishlatiladi (bunda ham endi index.html tarafida
   yuklanish paytidagi milt etish alohida tuzatilgan — qarang: app.js).
═══════════════════════════════════════════════════════════════════ */

// ⚠️ MUHIM: nofaol.js / davomat.js / oqituvchilar.js / dars-jadvali.js /
// oqituvchilar-davomat.js har birida "let U = ..." orqali sahifaning o'z
// sessiya obyekti e'lon qilinadi. `let` (va `const`) bilan yozilgan
// o'zgaruvchilar `var`dan farqli o'laroq `window` obyektiga biriktirilmaydi
// — LEKIN bir xil HTML sahifasidagi barcha oddiy <script src="..."> fayllari
// bitta umumiy global leksik muhitni bo'lishadi, shu sabab bu yerda oddiy
// "U" identifikatori orqali o'sha qiymatga to'g'ridan-to'g'ri murojaat
// qilish mumkin (mnGoHome() chaqirilgan paytda, ya'ni barcha skriptlar
// allaqachon yuklanib bo'lgach). "window.U" ishlatilsa — doim `undefined`
// bo'lib chiqadi (bu birinchi versiyada aynan shunday xato bo'lgan edi).
function mnCurrentUser() {
  var u = (typeof U !== 'undefined' && U) ? U : {};
  var out = {
    ism:          u.ism,
    isSuper:      !!u.isSuper,
    isSuperProxy: !!u.isSuperProxy,
    maktabId:     (u.maktabId !== undefined && u.maktabId !== null) ? u.maktabId : null
  };
  if (u.superIsm  !== undefined) out.superIsm  = u.superIsm;
  if (u.username  !== undefined) out.username  = u.username;
  if (u.parol     !== undefined) out.parol     = u.parol;
  if (u.adminsMap !== undefined) out.adminsMap = u.adminsMap;
  return out;
}

// Joriy sessiyadan foydalanib, index.html'ga kirmasdan, to'g'ridan-to'g'ri
// maqsad sahifaga o'tadi.
function mnGoDirect(targetKey, targetPage) {
  sessionStorage.setItem(targetKey, JSON.stringify(mnCurrentUser()));
  window.location.href = targetPage;
}

// navKey -> qaysi sessionStorage kaliti va qaysi sahifaga to'g'ridan-to'g'ri
// o'tish mumkinligi (bularning har biri alohida sahifaga ega).
var MN_DIRECT_TARGETS = {
  'nofaol':            { key: 'iit_nofaol_user',      page: 'nofaol.html' },
  'davomat':           { key: 'iit_davomat_user',     page: 'davomat.html' },
  'teachers':          { key: 'iit_teacher_user',     page: 'oqituvchilar.html' },
  'teachers-jadval':   { key: 'iit_jadval_user',      page: 'dars-jadvali.html' },
  'teachers-davomat':  { key: 'iit_teacher_dav_user', page: 'oqituvchilar-davomat.html' }
};

function mnGoHome(navKey) {
  var target = MN_DIRECT_TARGETS[navKey];

  // Joriy sahifada sessiya ma'lumoti (U) mavjud va bu bo'lim uchun
  // alohida sahifa bo'lsa — to'g'ridan-to'g'ri o'sha sahifaga o'tamiz.
  if (target && typeof U !== 'undefined' && U) {
    mnGoDirect(target.key, target.page);
    return;
  }

  // Qolgan holatlar — "Faol" / "Yangi o'quvchi qo'shish" (index.html
  // ICHIDAGI bo'limlar, alohida sahifasi yo'q), yoki U hali
  // yuklanmagan bo'lsa (ehtiyot chorasi) — eski yo'l bilan davom etamiz.
  sessionStorage.setItem('iit_pending_nav', navKey);
  window.location.href = 'index.html';
}

/* Chiqish (logout).
   ✅ TUZATILDI (bug: "Chiqish" bosilganda tizimdan TO'LIQ chiqilmayotgan
   edi): avvalgi versiya faqat "iit_u" (kim tizimga kirgani haqidagi
   belgi) va joriy sahifaning session-kalitini tozalab, index.html'ga
   qaytarardi. Lekin haqiqiy JWT token ("innovateit_token", api.js
   tokenStore orqali boshqariladi) hech qachon tozalanmasdi — ya'ni
   foydalanuvchi ko'rinishda "chiqib ketgandek" bo'lsa-da, token hali
   ham localStorage'da amal qilib turaverardi.
   Bundan tashqari, maktab admini (Telegram orqali kiradi — login/parol
   yo'q) uchun index.html'dagi login formasi umuman foydasiz edi: u
   yerda qayta kira olmaydi. Endi index.html'dagi doLogout() bilan BIR
   XIL mantiq qo'llaniladi: haqiqiy login/parol bilan kirgan (superadmin)
   bo'lsa — index.html'dagi login formaga qaytariladi; aks holda
   (Telegram/maktab admini yoki proxy) — token to'liq tozalanib,
   to'g'ridan-to'g'ri shu sahifaning o'zida "Siz tizimdan chiqdingiz"
   yakuniy ekrani ko'rsatiladi (oyna yopilishga harakat qilinadi). */
function mnLogout(sessionKey) {
  if (sessionKey) sessionStorage.removeItem(sessionKey);
  localStorage.removeItem('iit_u');

  // ✅ Asosiy JWT tokenni ham tozalash — aks holda haqiqiy "chiqish"
  // bo'lmaydi (token hali ham amal qilib qolaveradi).
  if (typeof api !== 'undefined' && api && typeof api.logout === 'function') {
    api.logout();
  } else {
    localStorage.removeItem('innovateit_token');
  }

  var u = (typeof U !== 'undefined' && U) ? U : {};

  // Haqiqiy login/parol bilan kirgan (superadmin) — index.html'dagi
  // login formaga qaytarib, u yerda qayta kirishi mumkin.
  if (u.username) {
    window.location.href = 'index.html';
    return;
  }

  // Maktab admini (Telegram orqali) yoki proxy sessiya — login formasi
  // ularga foydasiz, shu sabab to'g'ridan-to'g'ri "chiqdingiz" ekrani.
  try { window.close(); } catch (e) {}
  document.documentElement.innerHTML =
    '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:14px;font-family:system-ui,sans-serif;' +
    'background:#0f172a;color:#e5e7eb;text-align:center;padding:24px;box-sizing:border-box;">' +
    '<div style="font-size:44px;">✅</div>' +
    '<div style="font-size:18px;font-weight:600;">Siz tizimdan chiqdingiz</div>' +
    '<div style="font-size:14px;color:#9ca3af;max-width:280px;">Ushbu oynani yopishingiz mumkin.</div>' +
    '</div>';
}
