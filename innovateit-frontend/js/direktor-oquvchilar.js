// ═══════════════════════════════════════════════════════════════════════════
//  DIREKTOR — O'QUVCHILAR (faqat o'qish)
//  GET /api/direktorlar/oquvchilar → faol + nofaol o'quvchilar, barcha maktablar.
//  Yordamchilar (g, h, fish, sinfNum, maktabCmp, sortMaktablarList) direktor.js dan.
// ═══════════════════════════════════════════════════════════════════════════
let STUDENTS = [], S_MAKTABLAR = [], S_VIEW = [];

async function loadStudents() {
  g('s-loading').style.display = 'block';
  try {
    const r = await api.getDirektorOquvchilar({});
    if (!r.ok) { g('s-loading').innerHTML = `<span style="color:#dc2626;">❌ ${h(r.error)}</span>`; LOADED.oquv = false; return; }
    STUDENTS    = r.oquvchilar || [];
    S_MAKTABLAR = sortMaktablarList(r.maktablar || []);
  } catch (e) {
    g('s-loading').innerHTML = `<span style="color:#dc2626;">❌ Xatolik: ${h(e.message)}</span>`;
    LOADED.oquv = false;
    return;
  }
  g('s-loading').style.display = 'none';
  g('s-maktab').innerHTML = '<option value="">🏫 Barcha maktablar</option>' +
    S_MAKTABLAR.map(m => `<option value="${Number(m.id)}">${h(m.nomi)}</option>`).join('');
  buildSinfOptions();
  renderStudentStats();
  renderStudents();
}

// Sinf filtri variantlari tanlangan maktabga qarab yangilanadi (tanlov saqlanadi)
function buildSinfOptions() {
  const mk = parseInt(g('s-maktab').value) || 0;
  const sel = g('s-sinf'), prev = sel.value;
  const sinflar = [...new Set(STUDENTS.filter(s => !mk || s.maktab_id === mk).map(s => s.sinf).filter(Boolean))].sort(sinfNum);
  sel.innerHTML = '<option value="">Barcha sinflar</option>' + sinflar.map(x => `<option value="${h(x)}">${h(x)}</option>`).join('');
  if (prev && sinflar.includes(prev)) sel.value = prev;
}

function renderStudentStats() {
  const faol = STUDENTS.filter(s => !s.nofaol), nofaol = STUDENTS.filter(s => s.nofaol);
  const tgsiz = faol.filter(s => !s.telegram).length;
  const oqsiz = faol.filter(s => !s.oqituvchilar_soni).length;
  const maktabSoni = new Set(faol.map(s => s.maktab_id).filter(Boolean)).size;
  const card = (num, lbl, warn) => `<div class="dir-stat${warn && num > 0 ? ' warn' : ''}"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
  g('s-stats').innerHTML =
    card(faol.length, "Faol o'quvchi") +
    card(nofaol.length, "Nofaol o'quvchi") +
    card(maktabSoni, "O'quvchisi bor maktab") +
    card(oqsiz, "O'qituvchisiz o'quvchi", true) +
    card(tgsiz, "Telegram bog'lanmagan", true);
}

function filteredStudents() {
  const q = g('s-q').value.trim().toLowerCase();
  const mk = parseInt(g('s-maktab').value) || 0;
  const sinf = g('s-sinf').value;
  const holat = g('s-holat').value;
  return STUDENTS.filter(s => {
    if (holat === 'faol' && s.nofaol) return false;
    if (holat === 'nofaol' && !s.nofaol) return false;
    if (holat === 'tgsiz' && (s.nofaol || s.telegram)) return false;
    if (mk && s.maktab_id !== mk) return false;
    if (sinf && s.sinf !== sinf) return false;
    if (q && !(`${fish(s)} ${s.ism} ${s.familiya} ${s.sinf} ${s.telefon} ${s.telefon2} ${s.maktab_nomi}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

const S_HOLAT_NOMI = { '': 'Faol + nofaol', faol: 'Faqat faol', nofaol: 'Faqat nofaol', tgsiz: "Telegram bog'lanmagan" };

function renderStudents() {
  buildSinfOptions();
  const list = filteredStudents();
  // Maktab (raqam bo'yicha) → sinf → familiya
  list.sort((a, b) => maktabCmp(a.maktab_nomi, b.maktab_nomi) || sinfNum(a.sinf, b.sinf) ||
    String(a.familiya).localeCompare(String(b.familiya), 'uz') || String(a.ism).localeCompare(String(b.ism), 'uz'));
  S_VIEW = list;
  g('s-count').textContent = `${list.length} / ${STUDENTS.length}`;
  // Doimiy sarlavha: faol filter (filter yopiq bo'lsa ham ko'rinadi) va badge.
  // Standart holat — "Faqat faol", shuning uchun badge/ko'k rang undan farq qilganda chiqadi.
  const mkSel = g('s-maktab'), mk = parseInt(mkSel.value) || 0;
  const sinfV = g('s-sinf').value, holV = g('s-holat').value;
  const mkNomi = mk ? (mkSel.options[mkSel.selectedIndex]?.textContent || '') : 'Barcha maktablar';
  g('s-flt').textContent = [mkNomi, sinfV || 'Barcha sinflar', S_HOLAT_NOMI[holV] || 'Faol + nofaol'].join(' · ');
  const nf = (mk ? 1 : 0) + (sinfV ? 1 : 0) + (holV !== 'faol' ? 1 : 0);
  g('s-flt').classList.toggle('on', nf > 0);
  const badge = g('s-filter-badge');
  badge.textContent = nf; badge.style.display = nf ? 'inline-block' : 'none';
  g('s-empty').style.display = list.length ? 'none' : 'block';
  g('s-body').innerHTML = list.map((s, i) => `<tr onclick="openStudent(${i})">
      <td>${i + 1}</td>
      <td><b>${h(fish(s))}</b></td>
      <td>${h(s.maktab_nomi) || '—'}</td>
      <td>${h(s.sinf) || '—'}</td>
      <td>${h(s.telefon) || '—'}${s.telefon2 ? `<div style="font-size:11px;color:#6b7280;">${h(s.telefon2)}</div>` : ''}</td>
      <td>${h(s.boshlagan) || '—'}</td>
      <td>${s.nofaol ? '—' : (s.oqituvchilar_soni || '<span class="chip y">yo\'q</span>')}</td>
      <td>${s.nofaol
        ? `<span class="chip n">💤 nofaol${s.chiqgan ? ' · ' + h(s.chiqgan) : ''}</span>`
        : (s.telegram ? '<span class="chip g">📱 bog\'langan</span>' : '<span class="chip n">📱 yo\'q</span>')}</td>
    </tr>`).join('');
}

function openStudent(i) {
  const s = S_VIEW[i];
  if (!s) return;
  const row = (k, v) => v ? `<span>${k}: <b>${h(v)}</b></span>` : '';
  g('s-modal-box').innerHTML = `
    <div class="dmodal-head">
      <div>
        <div style="font-size:18px;font-weight:700;">${h(fish(s))}</div>
        <div style="font-size:13px;color:#6b7280;">${h(s.maktab_nomi) || 'Maktab ko\'rsatilmagan'}${s.sinf ? ' · ' + h(s.sinf) : ''}</div>
      </div>
      <button class="dmodal-close" onclick="closeStudent()" aria-label="Yopish">✕</button>
    </div>
    <div class="kv">
      <span>📞 <b>${h(s.telefon) || '—'}</b>${s.telefon2 ? ' · ' + h(s.telefon2) : ''}</span>
      ${row('🎂 Tug\'ilgan', s.tug)}
      ${row('📍 Manzil', s.manzil)}
    </div>
    <div class="kv">
      ${row('➕ Qo\'shilgan', s.qoshilgan)}
      ${row('▶️ O\'qishni boshlagan', s.boshlagan)}
      ${s.nofaol ? row('⏹ To\'xtatgan', s.chiqgan) : `<span>📱 Telegram: <b>${s.telegram ? 'bog\'langan' : 'bog\'lanmagan'}</b></span><span>O'qituvchilar: <b>${s.oqituvchilar_soni || 0}</b></span>`}
    </div>
    ${s.nofaol ? `<div class="dsec">💤 Nofaol</div><div style="font-size:13px;color:#374151;">${h(s.izoh) || 'Izoh yo\'q'}</div>` : ''}`;
  g('s-modal').style.display = 'flex';
}
function closeStudent() { g('s-modal').style.display = 'none'; }

// ═══════════════════════════════════════════════════════════════════════════
//  O'quvchilar: filter paneli va qidiruv (Adminlar / O'qituvchilardagi bilan bir xil)
// ═══════════════════════════════════════════════════════════════════════════
function toggleSFilter(ev) {
  if (ev) ev.stopPropagation();
  const p = g('s-panel'), open = p.style.display === 'none';
  p.style.display = open ? 'flex' : 'none';
  g('s-filter-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
}
function closeSFilter() {
  g('s-panel').style.display = 'none';
  g('s-filter-btn').setAttribute('aria-expanded', 'false');
}
function resetStudentFilter() {
  g('s-maktab').value = '';
  g('s-sinf').value = '';
  g('s-holat').value = 'faol';   // sahifaning standart ko'rinishi
  renderStudents();
}
function onStudentSearch() {
  g('s-q-clear').style.display = g('s-q').value ? 'block' : 'none';
  renderStudents();
}
function clearStudentSearch() {
  g('s-q').value = '';
  g('s-q-clear').style.display = 'none';
  g('s-q').focus();
  renderStudents();
}
// Panel tashqarisiga bosilsa yoki Esc bosilsa — yopiladi
document.addEventListener('click', (e) => {
  const p = g('s-panel');
  if (p && p.style.display !== 'none' && !e.target.closest('.tol-bar')) closeSFilter();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSFilter(); });
