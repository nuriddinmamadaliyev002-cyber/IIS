// ═══════════════════════════════════════════════════════════════════════════
//  DIREKTOR — BUXGALTERLAR va TO'LOVLAR (faqat o'qish)
//  GET /api/direktorlar/tolovlar?oy=YYYY-MM  → oylik to'lovlar + maktab kesimi
//  GET /api/direktorlar/buxgalterlar         → buxgalterlar va ularning maktablari
// ═══════════════════════════════════════════════════════════════════════════
let TOL = { oy: '', oylar: [], tolovlar: [], maktablar: [], jami: { kerak: 0, tolandi: 0, qarz: 0, qarzdor: 0, soni: 0 } };
let BUXLAR = [], B_VIEW = [];

const OY_NOMI = ['', 'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
function oyLabel(oy) {
  const q = /^QABUL-(\d{4})-(\d{2})$/.exec(oy || '');
  if (q) return `Qabul ${q[1]}-${q[2]}`;
  const m = /^(\d{4})-(\d{2})$/.exec(oy || '');
  return m ? `${OY_NOMI[parseInt(m[2], 10)] || m[2]} ${m[1]}` : (oy || '—');
}
const pct = (a, b) => b > 0 ? Math.round(a / b * 100) : 0;

// «To'lovlar» bo'limi
async function loadTolovlarView() {
  g('b-loading').style.display = 'block';
  try { await loadTolovlar(''); }
  catch (e) {
    g('b-loading').innerHTML = `<span style="color:#dc2626;">❌ Xatolik: ${h(e.message)}</span>`;
    LOADED.tol = false;
  }
}

// «Buxgalterlar» bo'limi — faqat buxgalterlar haqida umumiy ma'lumot
async function loadBuxgalterlar() {
  g('bx-loading').style.display = 'block';
  try {
    const bx = await api.getDirektorBuxgalterlar({});
    if (!bx.ok) throw new Error(bx.error || 'Xatolik');
    BUXLAR = bx.buxgalterlar || [];
  } catch (e) {
    g('bx-loading').innerHTML = `<span style="color:#dc2626;">❌ Xatolik: ${h(e.message)}</span>`;
    LOADED.bux = false;
    return;
  }
  g('bx-loading').style.display = 'none';
  renderBuxgalterlar();
}

// oy bo'sh bo'lsa — server eng so'nggi oyni qaytaradi
async function loadTolovlar(oy) {
  g('b-loading').style.display = 'block';
  g('b-loading').textContent = '⏳ Yuklanmoqda…';
  try {
    const r = await api.getDirektorTolovlar(oy ? { oy } : {});
    if (!r.ok) { g('b-loading').innerHTML = `<span style="color:#dc2626;">❌ ${h(r.error)}</span>`; return; }
    TOL = r;
  } catch (e) {
    g('b-loading').innerHTML = `<span style="color:#dc2626;">❌ Xatolik: ${h(e.message)}</span>`;
    return;
  }
  g('b-loading').style.display = 'none';

  g('b-oy').innerHTML = TOL.oylar.length
    ? TOL.oylar.map(o => `<option value="${h(o)}"${o === TOL.oy ? ' selected' : ''}>${h(oyLabel(o))}</option>`).join('')
    : '<option value="">To\'lov ma\'lumoti yo\'q</option>';

  const prevMk = g('b-maktab').value;
  const mks = TOL.maktablar.filter(m => m.maktab_id).sort((a, b) => maktabCmp(a.maktab_nomi, b.maktab_nomi));
  g('b-maktab').innerHTML = '<option value="">🏫 Barcha maktablar</option>' +
    mks.map(m => `<option value="${Number(m.maktab_id)}">${h(m.maktab_nomi)}</option>`).join('');
  if (prevMk && mks.some(m => String(m.maktab_id) === prevMk)) g('b-maktab').value = prevMk;

  renderBuxMaktablar();
  renderTolovlar();
}

// Ko'rsatkichlar: filtr yo'q bo'lsa — butun oy bo'yicha, bor bo'lsa — filtrga mos o'quvchilar bo'yicha
function renderBuxStats(list, filtered) {
  let j = TOL.jami;
  if (filtered) {
    j = {
      kerak:   list.reduce((n, t) => n + t.tolov_kerak, 0),
      tolandi: list.reduce((n, t) => n + t.tolov_qildi, 0),
      qarz:    list.reduce((n, t) => n + t.qarz, 0),
      qarzdor: list.filter(t => t.qarz > 0).length,
      soni:    list.length,
    };
  }
  const f = pct(j.tolandi, j.kerak);
  const card = (val, lbl, cls) => `<div class="dir-stat ${cls || ''}"><div class="num">${val}</div><div class="lbl">${lbl}</div></div>`;
  g('b-stats').innerHTML =
    card(sum(j.kerak), "Kerak (so'm)") +
    card(sum(j.tolandi), `To'landi · ${f}%`, 'good') +
    card(sum(j.qarz), "Qarz (so'm)", j.qarz > 0 ? 'warn' : '') +
    card(j.qarzdor, `Qarzdor (${j.soni} tadan)`, j.qarzdor > 0 ? 'warn' : '');
}

function renderBuxMaktablar() {
  const rows = [...TOL.maktablar].sort((a, b) => maktabCmp(a.maktab_nomi, b.maktab_nomi));
  const j = TOL.jami;
  g('b-maktab-tbl').innerHTML =
    '<thead><tr><th>Maktab</th><th class="num">O\'quvchi</th><th class="num">Kerak</th><th class="num">To\'landi</th><th class="num">Qarz</th><th class="num">Qarzdor</th><th>To\'lov</th></tr></thead><tbody>' +
    (rows.map(m => `<tr onclick="pickBuxMaktab(${Number(m.maktab_id) || 0})">
      <td><b>${h(m.maktab_nomi)}</b></td>
      <td class="num">${m.soni}</td><td class="num">${sum(m.kerak)}</td><td class="num">${sum(m.tolandi)}</td>
      <td class="num" style="${m.qarz > 0 ? 'color:#b91c1c;font-weight:600;' : ''}">${sum(m.qarz)}</td>
      <td class="num">${m.qarzdor || '—'}</td>
      <td><div class="bar"><i style="width:${pct(m.tolandi, m.kerak)}%"></i></div><div style="font-size:11px;color:#6b7280;">${pct(m.tolandi, m.kerak)}%</div></td>
    </tr>`).join('') || '<tr class="noclick"><td colspan="7" class="empty">Ma\'lumot yo\'q</td></tr>') +
    (rows.length ? `<tr class="tot noclick"><td>Jami</td><td class="num">${j.soni}</td><td class="num">${sum(j.kerak)}</td><td class="num">${sum(j.tolandi)}</td><td class="num">${sum(j.qarz)}</td><td class="num">${j.qarzdor}</td><td>${pct(j.tolandi, j.kerak)}%</td></tr>` : '') +
    '</tbody>';
}

// Maktab qatoriga bosilsa — pastdagi to'lovlar ro'yxati shu maktabga filtrlanadi
function pickBuxMaktab(id) {
  if (!id) return;
  g('b-maktab').value = String(id);
  renderTolovlar();
  g('b-body').closest('.dir-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderTolovlar() {
  const q = g('b-q').value.trim().toLowerCase();
  const mk = parseInt(g('b-maktab').value) || 0;
  const holat = g('b-holat').value;
  const list = TOL.tolovlar.filter(t => {
    if (mk && t.maktab_id !== mk) return false;
    if (holat === 'qarz' && !(t.qarz > 0)) return false;
    if (holat === 'tolagan' && !(t.tolov_kerak > 0 && t.qarz === 0)) return false;
    if (q && !(`${t.oquvchi_familiya} ${t.oquvchi_ism} ${t.sinf} ${t.telefon}`.toLowerCase().includes(q))) return false;
    return true;
  });
  B_VIEW = list;
  g('b-count').textContent = `${oyLabel(TOL.oy)} · ${list.length} / ${TOL.tolovlar.length}`;
  // Filter yopiq bo'lsa ham ko'rinib turadi: tanlangan maktab va to'lov holati
  const HOLAT_NOMI = { '': 'Barchasi', qarz: 'Qarzdorlar', tolagan: "To'liq to'laganlar" };
  const mkSel = g('b-maktab');
  const mkNomi = mk ? (mkSel.options[mkSel.selectedIndex]?.textContent || '') : 'Barcha maktablar';
  const fltEl = g('b-flt');
  fltEl.textContent = `${mkNomi} · ${HOLAT_NOMI[holat] || 'Barchasi'}`;
  fltEl.classList.toggle('on', !!(mk || holat));
  const filtered = !!(q || mk || holat);
  renderBuxStats(list, filtered);
  const nf = (mk ? 1 : 0) + (holat ? 1 : 0);
  const badge = g('b-filter-badge');
  badge.textContent = nf; badge.style.display = nf ? 'inline-block' : 'none';
  g('b-empty').style.display = list.length ? 'none' : 'block';
  const kerak = list.reduce((n, t) => n + t.tolov_kerak, 0);
  const tolandi = list.reduce((n, t) => n + t.tolov_qildi, 0);
  const qarz = list.reduce((n, t) => n + t.qarz, 0);
  g('b-body').innerHTML = list.map((t, i) => `<tr class="noclick">
      <td>${i + 1}</td>
      <td><b>${h((t.oquvchi_familiya + ' ' + t.oquvchi_ism).trim())}</b>${t.telefon ? `<div style="font-size:11px;color:#6b7280;">${h(t.telefon)}</div>` : ''}</td>
      <td>${h(t.maktab_nomi) || '—'}</td>
      <td>${h(t.sinf) || '—'}</td>
      <td class="num">${sum(t.tolov_kerak)}</td>
      <td class="num">${sum(t.tolov_qildi)}</td>
      <td class="num" style="${t.qarz > 0 ? 'color:#b91c1c;font-weight:600;' : ''}">${t.qarz > 0 ? sum(t.qarz) : '—'}</td>
      <td>${h(t.tolov_sanasi) || '—'}</td>
      <td>${h(t.ehtimoliy_tolov_sanasi) || '—'}</td>
      <td style="max-width:220px;">${h(t.qaydnoma) || ''}</td>
    </tr>`).join('') +
    (list.length ? `<tr class="tot noclick"><td></td><td>Jami (${list.length})</td><td></td><td></td><td class="num">${sum(kerak)}</td><td class="num">${sum(tolandi)}</td><td class="num">${sum(qarz)}</td><td colspan="3"></td></tr>` : '');
}

function renderBuxgalterlar() {
  const tg = BUXLAR.filter(b => b.telegram).length;
  const card = (val, lbl, cls) => `<div class="dir-stat ${cls || ''}"><div class="num">${val}</div><div class="lbl">${lbl}</div></div>`;
  g('bx-stats').innerHTML =
    card(BUXLAR.length, 'Jami buxgalter') +
    card(tg, "Telegram bog'langan", 'good') +
    card(BUXLAR.length - tg, "Telegram bog'lanmagan", BUXLAR.length - tg > 0 ? 'warn' : '');
  g('bx-tbl').innerHTML = BUXLAR.length
    ? '<thead><tr><th>#</th><th>F.I.</th><th>Biriktirilgan maktablar</th><th>Telegram</th><th>Qo\'shilgan</th></tr></thead><tbody>' +
      BUXLAR.map((b, i) => `<tr class="noclick">
        <td>${i + 1}</td>
        <td><b>${h(fish(b))}</b></td>
        <td>${(b.maktablar || []).slice().sort((x, y) => maktabCmp(x.nomi, y.nomi)).map(m => `<span class="chip">${h(m.nomi)}</span>`).join(' ') || '<span class="chip n">barcha maktablar</span>'}</td>
        <td>${b.telegram ? '<span class="chip g">📱 bog\'langan</span>' : '<span class="chip r">❌ yo\'q</span>'}</td>
        <td>${h(b.yaratilgan) || '—'}</td>
      </tr>`).join('') + '</tbody>'
    : '<tbody><tr class="noclick"><td class="empty">Buxgalter yo\'q</td></tr></tbody>';
}


// ═══════════════════════════════════════════════════════════════════════════
//  To'lovlar: filter paneli va qidiruv
// ═══════════════════════════════════════════════════════════════════════════
function toggleTolFilter(ev) {
  if (ev) ev.stopPropagation();
  const p = g('b-panel'), open = p.style.display === 'none';
  p.style.display = open ? 'flex' : 'none';
  g('b-filter-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
}
function closeTolFilter() {
  g('b-panel').style.display = 'none';
  g('b-filter-btn').setAttribute('aria-expanded', 'false');
}
function resetTolFilter() {
  g('b-maktab').value = '';
  g('b-holat').value = '';
  renderTolovlar();
}
function onTolSearch() {
  g('b-q-clear').style.display = g('b-q').value ? 'block' : 'none';
  renderTolovlar();
}
function clearTolSearch() {
  g('b-q').value = '';
  g('b-q-clear').style.display = 'none';
  g('b-q').focus();
  renderTolovlar();
}
// Panel tashqarisiga bosilsa yoki Esc bosilsa — yopiladi
document.addEventListener('click', (e) => {
  const p = g('b-panel');
  if (p && p.style.display !== 'none' && !e.target.closest('.tol-bar')) closeTolFilter();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTolFilter(); });


// ═══════════════════════════════════════════════════════════════════════════
//  To'lovlar: hozirgi filtrga mos ro'yxatni Excel (.xlsx) ga yuklab olish
//  (B_VIEW — ekranda ko'rinib turgan, filtrlangan yozuvlar)
//  (loadXlsxLib / xlSlug yordamchilari direktor.js da — barcha bo'limlar uchun umumiy)
// ═══════════════════════════════════════════════════════════════════════════
async function exportTolovlarExcel() {
  if (!B_VIEW.length) { alert("Yuklab olish uchun to'lov yozuvi yo'q (filtrga mos o'quvchi topilmadi)"); return; }

  const btn = g('b-xl-btn');
  const oldHtml = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  const num = (v) => Number(v) || 0;
  const header = ['№', 'Familiya', 'Ism', 'Telefon', 'Maktab', 'Sinf',
                  "To'lov kerak", "To'landi", 'Qarz', "To'lov sanasi", 'Kutilayotgan sana', 'Izoh', 'Holati'];
  const rows = B_VIEW.map((t, i) => {
    const kerak = num(t.tolov_kerak), qildi = num(t.tolov_qildi), qarz = num(t.qarz);
    const holat = kerak <= 0 ? '—' : (qarz > 0 ? (qildi > 0 ? 'Qisman to\'langan' : 'Qarzdor') : "To'liq to'langan");
    return [i + 1, t.oquvchi_familiya || '', t.oquvchi_ism || '', t.telefon || '', t.maktab_nomi || '', t.sinf || '',
            kerak, qildi, qarz, t.tolov_sanasi || '', t.ehtimoliy_tolov_sanasi || '', t.qaydnoma || '', holat];
  });
  const sK = B_VIEW.reduce((n, t) => n + num(t.tolov_kerak), 0);
  const sT = B_VIEW.reduce((n, t) => n + num(t.tolov_qildi), 0);
  const sQ = B_VIEW.reduce((n, t) => n + num(t.qarz), 0);
  rows.push(['', `JAMI (${B_VIEW.length})`, '', '', '', '', sK, sT, sQ, '', '', '', '']);

  // Maktablar kesimi (faqat hozirgi filtrga mos yozuvlar bo'yicha)
  const byMk = new Map();
  B_VIEW.forEach(t => {
    const k = t.maktab_nomi || '—';
    const m = byMk.get(k) || { soni: 0, kerak: 0, tolandi: 0, qarz: 0, qarzdor: 0 };
    m.soni++; m.kerak += num(t.tolov_kerak); m.tolandi += num(t.tolov_qildi); m.qarz += num(t.qarz);
    if (num(t.qarz) > 0) m.qarzdor++;
    byMk.set(k, m);
  });
  const mkHeader = ['Maktab', "O'quvchi", "To'lov kerak", "To'landi", 'Qarz', 'Qarzdor soni', "To'lov %"];
  const mkRows = [...byMk.entries()].sort((a, b) => maktabCmp(a[0], b[0]))
    .map(([k, m]) => [k, m.soni, m.kerak, m.tolandi, m.qarz, m.qarzdor, pct(m.tolandi, m.kerak) / 100]);
  mkRows.push(['JAMI', B_VIEW.length, sK, sT, sQ, B_VIEW.filter(t => num(t.qarz) > 0).length, pct(sT, sK) / 100]);

  const mk = parseInt(g('b-maktab').value) || 0;
  const mkSel = g('b-maktab');
  const mkNomi = mk ? (mkSel.options[mkSel.selectedIndex]?.textContent || '') : '';
  const holatSel = g('b-holat').value;
  const name = ['tolovlar', TOL.oy, xlSlug(mkNomi), holatSel].filter(Boolean).join('_');

  try {
    const X  = await loadXlsxLib();
    const ws = X.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [{ wch: 5 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 8 },
                   { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 36 }, { wch: 18 }];
    const ws2 = X.utils.aoa_to_sheet([mkHeader, ...mkRows]);
    ws2['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }];
    // "To'lov %" ustuni foiz ko'rinishida
    for (let r = 1; r <= mkRows.length; r++) {
      const c = ws2[X.utils.encode_cell({ r, c: 6 })];
      if (c) c.z = '0%';
    }
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, "To'lovlar");
    X.utils.book_append_sheet(wb, ws2, 'Maktablar kesimi');
    X.writeFile(wb, name + '.xlsx');
  } catch (e) {
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = oldHtml; }
  }
}
