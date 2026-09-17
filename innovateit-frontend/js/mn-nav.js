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

/* Chiqish (logout) — joriy sahifaning o'z session-kalitini va asosiy
   login tokenini (iit_u) tozalab, index.html'ga qaytaradi (u yerda
   token topilmagani uchun login ekrani ko'rsatiladi). */
function mnLogout(sessionKey) {
  if (sessionKey) sessionStorage.removeItem(sessionKey);
  localStorage.removeItem('iit_u');
  window.location.href = 'index.html';
}
