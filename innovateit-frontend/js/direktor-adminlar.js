// ═══════════════════════════════════════════════════════════════════════════
//  DIREKTOR — ADMINLAR (faqat o'qish)
//  GET /api/direktorlar/adminlar → maktab adminlari + maktablar ro'yxati.
//  Xom Telegram ID ko'rsatilmaydi — faqat "bog'langan / bog'lanmagan".
//  Tepada doimiy turuvchi ko'rsatkich chiplari: bosilsa — to'liq ma'lumot oynada.
// ═══════════════════════════════════════════════════════════════════════════
let ADMINLAR = [], A_MAKTABLAR = [];

const A_HOLAT_NOMI = { '': 'Barchasi', tgsiz: "Telegram bog'lanmagan" };

async function loadAdminlar() {
  g('a-loading').style.display = 'block';
  try {
    const r = await api.getDirektorAdminlar({});
    if (!r.ok) { g('a-loading').innerHTML = `<span style="color:#dc2626;">❌ ${h(r.error)}</span>`; LOADED.adm = false; return; }
    ADMINLAR    = r.adminlar || [];
    A_MAKTABLAR = sortMaktablarList(r.maktablar || []);
  } catch (e) {
    g('a-loading').innerHTML = `<span style="color:#dc2626;">❌ Xatolik: ${h(e.message)}</span>`;
    LOADED.adm = false;
    return;
  }
  g('a-loading').style.display = 'none';
  const prevMk = g('a-maktab').value;
  g('a-maktab').innerHTML = '<option value="">🏫 Barcha maktablar</option>' +
    A_MAKTABLAR.map(m => `<option value="${Number(m.id)}">${h(m.nomi)}</option>`).join('');
  if (prevMk && A_MAKTABLAR.some(m => String(m.id) === prevMk)) g('a-maktab').value = prevMk;
  renderAdminStats();
  renderAdminlar();
}

// Ko'rsatkich chiplari — doim umumiy (filtrga bog'liq emas), bosilsa to'liq ma'lumot ochiladi
function renderAdminStats() {
  const adminsiz = A_MAKTABLAR.filter(m => !m.adminlar_soni).length;
  const tgsiz = ADMINLAR.filter(a => !a.telegram).length;
  const card = (kind, num, lbl, warn) =>
    `<div class="dir-stat click${warn && num > 0 ? ' warn' : ''}" role="button" tabindex="0"` +
    ` onclick="openAdminStat('${kind}')"` +
    ` onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openAdminStat('${kind}')}">` +
    `<div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
  g('a-stats').innerHTML =
    card('admin',    ADMINLAR.length,    'Jami admin') +
    card('maktab',   A_MAKTABLAR.length, 'Jami maktab') +
    card('adminsiz', adminsiz,           "Admini yo'q maktab", true) +
    card('tgsiz',    tgsiz,              "Telegram bog'lanmagan admin", true);
}

function renderAdminlar() {
  const q = g('a-q').value.trim().toLowerCase();
  const mk = parseInt(g('a-maktab').value) || 0;
  const holat = g('a-holat').value;
  const list = ADMINLAR.filter(a => {
    if (mk && a.maktab_id !== mk) return false;
    if (holat === 'tgsiz' && a.telegram) return false;
    if (q && !(`${fish(a)} ${a.maktab_nomi || ''}`.toLowerCase().includes(q))) return false;
    return true;
  }).sort((a, b) => maktabCmp(a.maktab_nomi || '~', b.maktab_nomi || '~') || fish(a).localeCompare(fish(b), 'uz'));

  // Sarlavha: ko'rsatilayotgan / jami + faol filter (filter yopiq bo'lsa ham ko'rinadi)
  g('a-count').textContent = `${list.length} / ${ADMINLAR.length}`;
  const mkSel = g('a-maktab');
  const mkNomi = mk ? (mkSel.options[mkSel.selectedIndex]?.textContent || '') : 'Barcha maktablar';
  const fltEl = g('a-flt');
  fltEl.textContent = `${mkNomi} · ${A_HOLAT_NOMI[holat] || 'Barchasi'}`;
  fltEl.classList.toggle('on', !!(mk || holat));
  const nf = (mk ? 1 : 0) + (holat ? 1 : 0);
  const badge = g('a-filter-badge');
  badge.textContent = nf; badge.style.display = nf ? 'inline-block' : 'none';

  g('a-empty').style.display = list.length ? 'none' : 'block';
  g('a-body').innerHTML = adminRows(list);
}

const adminRows = (list) => list.map((a, i) => `<tr class="noclick">
      <td>${i + 1}</td>
      <td><b>${h(fish(a))}</b></td>
      <td>${a.maktab_nomi ? h(a.maktab_nomi) : '<span class="chip y">⚠️ maktabsiz</span>'}</td>
      <td>${a.oquvchilar_soni || '—'}</td>
      <td>${a.oqituvchilar_soni || '—'}</td>
      <td>${a.telegram ? '<span class="chip g">📱 bog\'langan</span>' : '<span class="chip r">❌ yo\'q</span>'}</td>
      <td>${h(a.yaratilgan) || '—'}</td>
    </tr>`).join('');

// ═══════════════════════════════════════════════════════════════════════════
//  Chip bosilganda — to'liq ma'lumot oynasi
// ═══════════════════════════════════════════════════════════════════════════
function adminSortedAll(list) {
  return [...list].sort((a, b) => maktabCmp(a.maktab_nomi || '~', b.maktab_nomi || '~') || fish(a).localeCompare(fish(b), 'uz'));
}
function adminTable(list) {
  return `<div class="xscroll"><table class="dtbl">
    <thead><tr><th>#</th><th>F.I.</th><th>Maktab</th><th>O'quvchilar</th><th>O'qituvchilar</th><th>Telegram</th><th>Qo'shilgan</th></tr></thead>
    <tbody>${adminRows(list)}</tbody></table></div>`;
}
function maktabTable(list) {
  const adminsOf = (id) => ADMINLAR.filter(a => a.maktab_id === id).sort((x, y) => fish(x).localeCompare(fish(y), 'uz'));
  return `<div class="xscroll"><table class="dtbl">
    <thead><tr><th>#</th><th>Maktab</th><th>Adminlar</th><th class="num">O'quvchilar</th><th class="num">O'qituvchilar</th></tr></thead>
    <tbody>${list.map((m, i) => {
      const ad = adminsOf(m.id);
      return `<tr class="noclick">
        <td>${i + 1}</td>
        <td><b>${h(m.nomi)}</b></td>
        <td>${ad.length ? ad.map(a => `<span class="chip${a.telegram ? '' : ' r'}">${h(fish(a))}</span>`).join(' ') : '<span class="chip y">⚠️ admin yo\'q</span>'}</td>
        <td class="num">${m.oquvchilar_soni || 0}</td>
        <td class="num">${m.oqituvchilar_soni || 0}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function openAdminStat(kind) {
  let title, sub, body, n;
  if (kind === 'admin') {
    const l = adminSortedAll(ADMINLAR); n = l.length;
    title = '🛡 Jami adminlar'; sub = 'Barcha maktab adminlari';
    body = n ? adminTable(l) : '';
  } else if (kind === 'tgsiz') {
    const l = adminSortedAll(ADMINLAR.filter(a => !a.telegram)); n = l.length;
    title = "📱 Telegram bog'lanmagan adminlar"; sub = "Telegram hisobi hali biriktirilmagan adminlar";
    body = n ? adminTable(l) : '';
  } else if (kind === 'maktab') {
    n = A_MAKTABLAR.length;
    title = '🏫 Jami maktablar'; sub = "Barcha maktablar va ularning adminlari";
    body = n ? maktabTable(A_MAKTABLAR) : '';
  } else if (kind === 'adminsiz') {
    const l = A_MAKTABLAR.filter(m => !m.adminlar_soni); n = l.length;
    title = "⚠️ Admini yo'q maktablar"; sub = "Hali birorta admin biriktirilmagan maktablar";
    body = n ? maktabTable(l) : '';
  } else return;

  g('a-modal-box').innerHTML = `
    <div class="dmodal-head">
      <div>
        <div style="font-size:17px;font-weight:700;color:#111827;">${title}</div>
        <div style="font-size:12.5px;color:#6b7280;margin-top:2px;">${sub} · <b>${n}</b> ta</div>
      </div>
      <button type="button" class="dmodal-close" onclick="closeAdminModal()" aria-label="Yopish">✕</button>
    </div>
    ${body || '<div class="empty">Ma\'lumot yo\'q — hammasi joyida ✅</div>'}`;
  g('a-modal').style.display = 'flex';
  g('a-modal').scrollTop = 0;
}
function closeAdminModal() { g('a-modal').style.display = 'none'; }

// ═══════════════════════════════════════════════════════════════════════════
//  Adminlar: filter paneli va qidiruv (To'lovlardagi bilan bir xil)
// ═══════════════════════════════════════════════════════════════════════════
function toggleAdminFilter(ev) {
  if (ev) ev.stopPropagation();
  const p = g('a-panel'), open = p.style.display === 'none';
  p.style.display = open ? 'flex' : 'none';
  g('a-filter-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
}
function closeAdminFilter() {
  g('a-panel').style.display = 'none';
  g('a-filter-btn').setAttribute('aria-expanded', 'false');
}
function resetAdminFilter() {
  g('a-maktab').value = '';
  g('a-holat').value = '';
  renderAdminlar();
}
function onAdminSearch() {
  g('a-q-clear').style.display = g('a-q').value ? 'block' : 'none';
  renderAdminlar();
}
function clearAdminSearch() {
  g('a-q').value = '';
  g('a-q-clear').style.display = 'none';
  g('a-q').focus();
  renderAdminlar();
}
// Panel tashqarisiga bosilsa yoki Esc bosilsa — yopiladi
document.addEventListener('click', (e) => {
  const p = g('a-panel');
  if (p && p.style.display !== 'none' && !e.target.closest('.tol-bar')) closeAdminFilter();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeAdminFilter(); closeAdminModal(); }
});
