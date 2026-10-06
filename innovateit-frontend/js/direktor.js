// ═══════════════════════════════════════════════════════════════════════════
//  DIREKTOR PANELI
//  Kirish FAQAT Telegram Mini App orqali: bot → /api/telegram/check →
//  direktor.html?tg_token=... Token alohida kalitda saqlanadi
//  ('innovateit_direktor_token'), shuning uchun boshqa panellar bilan
//  bir vaqtda ochiq tursa ham bir-birini bosib yozmaydi.
//  Panel mazmuni (statistika, hisobotlar) keyingi bosqichda qo'shiladi.
// ═══════════════════════════════════════════════════════════════════════════
let U = null;
function g(id) { return document.getElementById(id); }

window.addEventListener('DOMContentLoaded', () => {
  const params  = new URLSearchParams(window.location.search);
  const tgToken = params.get('tg_token');

  if (tgToken) {
    api.setToken(tgToken);
    const payload = api.getUser();
    // Faqat direktor (yoki "ko'rish" uchun superadmin) tokeni qabul qilinadi
    if (!payload || (payload.role !== 'direktor' && !payload.isSuper)) {
      api.logout();
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    U = { ism: params.get('tg_ism') || payload.ism || '', id: payload.entityId };
    localStorage.setItem('iit_dir_u', JSON.stringify(U));
    window.history.replaceState({}, '', window.location.pathname);
    showApp();
    return;
  }

  try {
    const saved = localStorage.getItem('iit_dir_u');
    if (saved && api.isLoggedIn()) { U = JSON.parse(saved); showApp(); }
    else localStorage.removeItem('iit_dir_u');
  } catch (e) { localStorage.removeItem('iit_dir_u'); }
});

function doLogout() {
  U = null;
  iitClearAllSessions();
  // Direktor faqat Telegram orqali kiradi — login formasi foydasiz
  if (iitIsTelegramSession()) { iitMarkLoggedOut(); iitShowLoggedOut(); return; }
  window.location.replace('index.html');
}

async function showApp() {
  g('login-screen').style.display = 'none';
  g('app').style.display = 'block';
  g('dir-badge').textContent = U.ism;
  g('dir-welcome').textContent = U.ism ? `Xush kelibsiz, ${U.ism}` : 'Xush kelibsiz';

  // Token va rolni serverda tekshirib olamiz (direktor yozuvi o'chirilgan bo'lsa — chiqarib yuboradi)
  try {
    const r = await api.getDirektorMe();
    if (r && r.ok && r.direktor && !r.direktor.isSuper) {
      const fish = `${r.direktor.familiya || ''} ${r.direktor.ism}`.trim();
      U.ism = fish; g('dir-badge').textContent = fish;
      g('dir-welcome').textContent = `Xush kelibsiz, ${fish}`;
    } else if (r && r.ok === false && r.error === 'Direktor topilmadi') {
      doLogout();
    }
  } catch (_) { /* tarmoq xatosi — sahifa ochiq qoladi */ }
}
