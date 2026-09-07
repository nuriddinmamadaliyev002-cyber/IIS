/* ═══════════════════════════════════════════════════════════════════
   InnovateIT School — Hamburger menyu: umumiy navigatsiya yordamchisi.

   index.html'dan boshqa barcha "maktab admini" panel sahifalarida
   (nofaol.html, davomat.html, oqituvchilar.html, dars-jadvali.html,
   oqituvchilar-davomat.html) ishlatiladi. Bu sahifalarning hamburger
   menyusidagi "O'quvchilar" / "O'qituvchilar" accordion bandlari
   bosilganda, index.html'ning o'zidagi tekshirilgan, to'liq
   navigatsiya funksiyalaridan (openNofaol/openDavomat/openTeachers/
   openTeachersJadval/openTeachersDavomatDirect/scrollToStudentsList/
   scrollToAddStudent) foydalanish uchun avval index.html'ga qaytariladi
   va u yerda "iit_pending_nav" bayrog'i orqali kerakli amal avtomatik
   bajariladi (qarang: app.js — handlePendingNav()).
═══════════════════════════════════════════════════════════════════ */
function mnGoHome(navKey) {
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
