// ═══════════════════════════════════════════════════════════════════════════
//  DIREKTOR — ADMINLAR (faqat o'qish)
//  GET /api/direktorlar/adminlar → maktab adminlari + maktablar kesimi.
//  Xom Telegram ID ko'rsatilmaydi — faqat "bog'langan / bog'lanmagan".
// ═══════════════════════════════════════════════════════════════════════════
let ADMINLAR = [], A_MAKTABLAR = [];

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
  g('a-maktab').innerHTML = '<option value="">🏫 Barcha maktablar</option>' +
    A_MAKTABLAR.map(m => `<option value="${Number(m.id)}">${h(m.nomi)}</option>`).join('');
  renderAdminStats();
  renderAdminlar();
  renderAdminMaktablar();
}

function renderAdminStats() {
  const adminsiz = A_MAKTABLAR.filter(m => !m.adminlar_soni).length;
  const tgsiz = ADMINLAR.filter(a => !a.telegram).length;
  const card = (num, lbl, warn) => `<div class="dir-stat${warn && num > 0 ? ' warn' : ''}"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
  g('a-stats').innerHTML =
    card(ADMINLAR.length, 'Jami admin') +
    card(A_MAKTABLAR.length, 'Jami maktab') +
    card(adminsiz, 'Admini yo\'q maktab', true) +
    card(tgsiz, "Telegram bog'lanmagan admin", true);
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

  g('a-count').textContent = `${list.length} / ${ADMINLAR.length}`;
  g('a-empty').style.display = list.length ? 'none' : 'block';
  g('a-body').innerHTML = list.map((a, i) => `<tr class="noclick">
      <td>${i + 1}</td>
      <td><b>${h(fish(a))}</b></td>
      <td>${a.maktab_nomi ? h(a.maktab_nomi) : '<span class="chip y">⚠️ maktabsiz</span>'}</td>
      <td>${a.oquvchilar_soni || '—'}</td>
      <td>${a.oqituvchilar_soni || '—'}</td>
      <td>${a.telegram ? '<span class="chip g">📱 bog\'langan</span>' : '<span class="chip r">❌ yo\'q</span>'}</td>
      <td>${h(a.yaratilgan) || '—'}</td>
    </tr>`).join('');
}

function renderAdminMaktablar() {
  g('am-tbl').innerHTML =
    '<thead><tr><th>Maktab</th><th class="num">Adminlar</th><th class="num">O\'quvchilar</th><th class="num">O\'qituvchilar</th></tr></thead><tbody>' +
    A_MAKTABLAR.map(m => `<tr class="noclick">
      <td><b>${h(m.nomi)}</b></td>
      <td class="num">${m.adminlar_soni ? m.adminlar_soni : '<span class="chip y">⚠️ admin yo\'q</span>'}</td>
      <td class="num">${m.oquvchilar_soni}</td>
      <td class="num">${m.oqituvchilar_soni}</td>
    </tr>`).join('') + '</tbody>';
}
