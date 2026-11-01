// ═══════════════════════════════════════════════════════════════════════════
//  Online kurslar — umumiy yordamchilar (kurs-admin.html va kurs.html uchun)
//  Mustaqil: api.js ga bog'liq emas. Token: ?tg_token=... yoki ?c=... (qisqa kod)
//  orqali Telegram Mini App'dan keladi va localStorage'da saqlanadi.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  const host = location.hostname;
  const BASE = (location.protocol === 'file:' || host === 'localhost' || host === '127.0.0.1' || host === '')
    ? 'http://127.0.0.1:3001' : '';
  let TOKEN_KEY = 'iit_kurs_token';

  const store = {
    get()  { try { return localStorage.getItem(TOKEN_KEY); } catch (_) { return null; } },
    set(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (_) {} },
    clear(){ try { localStorage.removeItem(TOKEN_KEY); } catch (_) {} },
  };

  function payload(t) {
    try {
      const b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(b))));
    } catch (_) { return null; }
  }
  function expired(t) { const p = payload(t); return !p || !p.exp || p.exp * 1000 < Date.now(); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ─── Xabar (toast) ───
  function toast(msg, tur) {
    let box = document.getElementById('k-toasts');
    if (!box) { box = document.createElement('div'); box.id = 'k-toasts'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'k-toast ' + (tur || '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, tur === 'err' ? 5000 : 2600);
  }

  // ─── Seans tugagan ekran ───
  function showExpired(xabar) {
    document.body.innerHTML = `
      <div class="k-center">
        <div class="k-card" style="max-width:380px;text-align:center;">
          <div style="font-size:44px;">🔒</div>
          <h2 style="margin:8px 0;">Seans tugadi</h2>
          <p class="k-muted">${esc(xabar || 'Qayta kirish uchun Telegram botdagi Mini App\'ni oching.')}</p>
        </div>
      </div>`;
  }

  // ─── So'rov ───
  async function req(method, path, body) {
    const t = store.get();
    if (t && expired(t)) { showExpired(); return { ok: false, error: 'Seans tugadi' }; }
    const headers = { 'Content-Type': 'application/json' };
    if (t) headers.Authorization = 'Bearer ' + t;
    let r;
    try {
      r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (_) { return { ok: false, error: 'Tarmoqqa ulanib bo\'lmadi. Internetni tekshiring.' }; }
    if (r.status === 401) { store.clear(); showExpired(); return { ok: false, error: 'Seans tugadi' }; }
    try { return await r.json(); } catch (_) { return { ok: false, error: 'Server javobi noto\'g\'ri (' + r.status + ')' }; }
  }

  // PDF kabi fayllar uchun (Authorization sarlavhasi bilan)
  async function blob(path, fayl) {
    const t = store.get();
    let r;
    try { r = await fetch(BASE + path, { headers: t ? { Authorization: 'Bearer ' + t } : {} }); }
    catch (_) { toast('Tarmoqqa ulanib bo\'lmadi', 'err'); return; }
    if (!r.ok) {
      let m = 'Faylni olib bo\'lmadi';
      try { m = (await r.json()).error || m; } catch (_) {}
      toast(m, 'err'); return;
    }
    const b = await r.blob();
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url; a.download = fayl || 'sertifikat.pdf'; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // ─── Kirish: URL'dagi token/kodni olish va rolni tekshirish ───
  async function authInit(tokenKey, rol) {
    TOKEN_KEY = tokenKey;
    const q = new URLSearchParams(location.search);
    let tok = q.get('tg_token');
    const kod = q.get('c');
    if (!tok && kod) {
      try {
        const r = await fetch(BASE + '/api/telegram/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: kod }) });
        const d = await r.json();
        if (d.ok && d.token) tok = d.token;
      } catch (_) {}
    }
    if (tok) {
      store.set(tok);
      history.replaceState({}, '', location.pathname);
    }
    const t = store.get();
    if (!t || expired(t)) return null;
    const p = payload(t);
    if (!p || (p.role !== rol && !p.isSuper)) return null;
    // Muddatining oxirgi 25% qolsa — yangilaymiz
    try {
      if ((p.exp - Math.floor(Date.now() / 1000)) < (p.exp - p.iat) * 0.25) {
        const r = await fetch(BASE + '/api/auth/refresh', { method: 'POST', headers: { Authorization: 'Bearer ' + t } });
        const d = await r.json();
        if (d.ok && d.token) store.set(d.token);
      }
    } catch (_) {}
    return payload(store.get());
  }

  // Sahifa ochiq turganda tokenni vaqti-vaqti bilan yangilash
  function autoRefresh() {
    setInterval(async () => {
      const t = store.get(); const p = t && payload(t);
      if (!p || expired(t)) return;
      if ((p.exp - Math.floor(Date.now() / 1000)) < (p.exp - p.iat) * 0.25) {
        try {
          const r = await fetch(BASE + '/api/auth/refresh', { method: 'POST', headers: { Authorization: 'Bearer ' + t } });
          const d = await r.json();
          if (d.ok && d.token) store.set(d.token);
        } catch (_) {}
      }
    }, 5 * 60 * 1000);
  }

  // ─── Modal ───
  function modal(html, { keng } = {}) {
    closeModal();
    const bg = document.createElement('div');
    bg.className = 'k-modal-bg'; bg.id = 'k-modal';
    bg.innerHTML = `<div class="k-modal ${keng ? 'keng' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    bg.addEventListener('mousedown', e => { if (e.target === bg) closeModal(); });
    document.body.appendChild(bg);
    const f = bg.querySelector('input,textarea,select');
    if (f) f.focus();
    return bg;
  }
  function closeModal() { const m = document.getElementById('k-modal'); if (m) m.remove(); }

  async function nusxala(matn) {
    try { await navigator.clipboard.writeText(matn); toast('Nusxalandi ✓'); return true; }
    catch (_) {
      const ta = document.createElement('textarea'); ta.value = matn; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove(); toast(ok ? 'Nusxalandi ✓' : 'Nusxalab bo\'lmadi', ok ? '' : 'err'); return ok;
    }
  }

  window.K = { BASE, store, payload, esc, toast, req, blob, authInit, autoRefresh, modal, closeModal, nusxala, showExpired };
})();
