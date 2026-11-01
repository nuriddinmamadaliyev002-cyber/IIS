// ═══════════════════════════════════════════════════════════════════════════
//  ONLINE KURSLAR (Superadmin tabi)
//  Superadmin kurs yaratadi va har bir kurs uchun admin tayinlaydi. Admin
//  Telegram Mini App'da taklif kodini kiritib o'z paneliga kiradi; savollar,
//  ishtirokchilar va sozlamalarni o'zi boshqaradi.
//  Yordamchilar (g, esc2, toast, api) app.js / api.js dan olinadi.
// ═══════════════════════════════════════════════════════════════════════════
let KR_DATA = [];
const KR_BOT = 'https://t.me/InnovateITSchoolbot';

(function krStyle() {
  const s = document.createElement('style');
  s.textContent = `
  .kr-card{background:#fff;border:1.5px solid #e5e7eb;border-radius:16px;padding:16px 18px;margin-bottom:12px}
  .kr-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .kr-sp{flex:1}
  .kr-btn{border:none;border-radius:10px;padding:8px 14px;font-weight:600;cursor:pointer;font-family:inherit;font-size:13px;background:#2563eb;color:#fff}
  .kr-btn.g{background:#f3f4f6;color:#374151}.kr-btn.r{background:#dc2626}.kr-btn.s{background:#eef2ff;color:#3730a3}
  .kr-chip{display:inline-block;background:#f3f4f6;border-radius:99px;padding:3px 10px;font-size:12px;color:#4b5563;margin-right:6px}
  .kr-bg{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:14px}
  .kr-modal{background:#fff;border-radius:16px;width:100%;max-width:560px;max-height:92vh;overflow:auto;padding:20px}
  .kr-modal h3{margin:0 0 10px;font-size:18px}
  .kr-modal label{display:block;font-size:11.5px;font-weight:700;color:#6b7280;margin:10px 0 4px;text-transform:uppercase}
  .kr-modal input,.kr-modal textarea{width:100%;box-sizing:border-box;padding:9px 10px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;font-family:inherit}
  .kr-err{color:#dc2626;font-size:13px;min-height:16px;margin-top:8px}
  .kr-code{font-family:'DM Mono',monospace;font-size:18px;font-weight:700;letter-spacing:.1em;background:#f1f5f9;border-radius:8px;padding:4px 10px}
  .kr-adm{border:1.5px solid #e5e7eb;border-radius:12px;padding:10px 12px;margin-bottom:8px}`;
  document.head.appendChild(s);
})();

function krModal(html) {
  krClose();
  const bg = document.createElement('div');
  bg.className = 'kr-bg'; bg.id = 'kr-modal';
  bg.innerHTML = `<div class="kr-modal">${html}</div>`;
  bg.addEventListener('mousedown', e => { if (e.target === bg) krClose(); });
  document.body.appendChild(bg);
  return bg;
}
function krClose() { const m = document.getElementById('kr-modal'); if (m) m.remove(); }

async function loadKurslarTab() {
  const root = g('tab-kr');
  if (!root) return;
  if (!root.dataset.init) {
    root.dataset.init = '1';
    root.innerHTML = `
      <div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:16px;padding:20px;margin-bottom:16px;">
        <div class="kr-row">
          <div><div style="font-size:16px;font-weight:700;color:#111827;">🎓 Online kurslar</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:2px;">Tashqi maktab o'qituvchilari uchun kurs, test va sertifikat. Har bir kursga alohida admin tayinlanadi.</div></div>
          <span class="kr-sp"></span>
          <button class="kr-btn" onclick="krKursModal(null)">➕ Yangi kurs</button>
        </div>
      </div>
      <div id="kr-list"></div>`;
  }
  const list = g('kr-list');
  list.innerHTML = '<div style="padding:16px;color:#7a7870;font-size:13px;">⏳ Yuklanmoqda…</div>';
  const r = await api.get('/api/kurs/super/kurslar');
  if (!r.ok) { list.innerHTML = `<div style="color:#dc2626;padding:12px;">❌ ${esc2(r.error)}</div>`; return; }
  KR_DATA = r.kurslar;
  if (!KR_DATA.length) { list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎓</div><p>Hali kurs yaratilmagan</p></div>'; return; }
  list.innerHTML = KR_DATA.map(k => `
    <div class="kr-card">
      <div class="kr-row">
        <div style="min-width:220px;flex:1;">
          <div style="font-weight:700;font-size:15px;">${esc2(k.nomi)} ${k.holat === 'yopiq' ? '<span class="kr-chip" style="background:#fef2f2;color:#dc2626;">yopiq</span>' : ''}</div>
          ${k.tavsif ? `<div style="font-size:12.5px;color:#6b7280;margin-top:2px;">${esc2(k.tavsif)}</div>` : ''}
          <div style="margin-top:8px;">
            <span class="kr-chip">👤 ${k.adminlar_soni} admin</span><span class="kr-chip">👥 ${k.ishtirokchilar_soni} ishtirokchi</span>
            <span class="kr-chip">❓ ${k.savollar_soni} savol</span><span class="kr-chip">🎓 ${k.sertifikatlar_soni} sertifikat</span>
            <span class="kr-chip">o'tish ${k.otish_foiz}% · ${k.urinish_limit} urinish</span>
          </div>
        </div>
        <button class="kr-btn s" onclick="krAdminlar(${k.id})">👤 Adminlar</button>
        <button class="kr-btn g" onclick="krKursModal(${k.id})">✏️</button>
        <button class="kr-btn r" onclick="krKursOchir(${k.id})">🗑</button>
      </div>
    </div>`).join('');
}

function krKursModal(id) {
  const k = id ? KR_DATA.find(x => x.id === id) : null;
  krModal(`
    <h3>${k ? 'Kursni tahrirlash' : 'Yangi kurs'}</h3>
    <label>Kurs nomi (sertifikatda chiqadi)</label><input id="kr-nomi" value="${esc2(k ? k.nomi : '')}" maxlength="200" placeholder="Raqamli savodxonlik va sun'iy intellekt texnologiyalari">
    <label>Tavsif (ixtiyoriy)</label><textarea id="kr-tavsif" rows="3" maxlength="1000">${esc2(k ? k.tavsif : '')}</textarea>
    ${k ? `<label>Holat</label><select id="kr-holat" style="width:100%;padding:9px 10px;border:1.5px solid #e5e7eb;border-radius:10px;font-family:inherit;">
      <option value="faol" ${k.holat === 'faol' ? 'selected' : ''}>Faol</option><option value="yopiq" ${k.holat === 'yopiq' ? 'selected' : ''}>Yopiq (yangi test boshlab bo'lmaydi)</option></select>` : ''}
    <div class="kr-err" id="kr-err"></div>
    <div class="kr-row" style="justify-content:flex-end;margin-top:12px;"><button class="kr-btn g" onclick="krClose()">Bekor</button><button class="kr-btn" id="kr-ok">Saqlash</button></div>`);
  g('kr-ok').onclick = async () => {
    const body = { nomi: g('kr-nomi').value, tavsif: g('kr-tavsif').value };
    if (k) body.holat = g('kr-holat').value;
    const r = k ? await api.put('/api/kurs/super/kurslar/' + k.id, body) : await api.post('/api/kurs/super/kurslar', body);
    if (!r.ok) { g('kr-err').textContent = r.error; return; }
    krClose(); toast('Saqlandi ✓', 'ok'); loadKurslarTab();
    if (!k && r.id) setTimeout(() => krAdminlar(r.id), 400);   // yangi kurs → darrov admin tayinlash
  };
}

async function krKursOchir(id) {
  const k = KR_DATA.find(x => x.id === id);
  if (!confirm(`"${k.nomi}" kursini o'chirasizmi? Savollar, ishtirokchilar va natijalar ham o'chadi.`)) return;
  const r = await api.del('/api/kurs/super/kurslar/' + id);
  if (r.ok) { toast("O'chirildi", 'ok'); loadKurslarTab(); } else toast(r.error, 'err');
}

// ─── Kurs adminlari ───
function krTaklifMatn(kursNomi, kod) {
  return `Assalomu alaykum! Siz "${kursNomi}" kursining admini etib tayinlandingiz.\n\n` +
    `1) Telegramda botni oching: ${KR_BOT}\n2) /start bosing va "Mini App" tugmasini bosing\n` +
    `3) So'ralganda quyidagi kodni kiriting:\n\n🔑 ${kod}\n\nKod faqat bitta Telegram hisobiga bog'lanadi.`;
}

async function krAdminlar(kursId) {
  const k = KR_DATA.find(x => x.id === kursId);
  const r = await api.get(`/api/kurs/super/kurslar/${kursId}/adminlar`);
  if (!r.ok) return toast(r.error, 'err');
  const A = r.adminlar;
  krModal(`
    <h3>👤 Kurs adminlari</h3>
    <div style="font-size:13px;color:#6b7280;margin-bottom:10px;">${esc2(k.nomi)}</div>
    ${A.length ? A.map(a => `
      <div class="kr-adm">
        <div class="kr-row"><b>${esc2((a.familiya + ' ' + a.ism).trim())}</b>${a.telefon ? `<span class="kr-chip">${esc2(a.telefon)}</span>` : ''}<span class="kr-sp"></span>
          ${a.ulangan ? '<span class="kr-chip" style="background:#ecfdf3;color:#16a34a;">✅ Telegram ulangan</span>' : '<span class="kr-chip" style="background:#fffbeb;color:#d97706;">⏳ kod kutilmoqda</span>'}</div>
        <div class="kr-row" style="margin-top:8px;"><span class="kr-code">${esc2(a.taklif_kodi)}</span><span class="kr-sp"></span>
          <button class="kr-btn s" onclick="krNusxa(${kursId},'${esc2(a.taklif_kodi)}')">📋 Taklif matni</button>
          <button class="kr-btn g" onclick="krKodYangila(${kursId},${a.id})" title="Eski kod va Telegram biriktirish bekor bo'ladi">♻️</button>
          <button class="kr-btn r" onclick="krAdminOchir(${kursId},${a.id})">🗑</button></div>
      </div>`).join('') : '<div style="color:#9ca3af;padding:8px 0;">Hali admin yo\'q</div>'}
    <div style="border-top:1.5px solid #e5e7eb;margin-top:12px;padding-top:6px;">
      <label>Yangi admin qo'shish</label>
      <div class="kr-row"><input id="ka-fam" placeholder="Familiya" style="flex:1;min-width:120px;"><input id="ka-ism" placeholder="Ism *" style="flex:1;min-width:120px;"></div>
      <input id="ka-tel" placeholder="Telefon (ixtiyoriy)" style="margin-top:8px;">
      <div class="kr-err" id="ka-err"></div>
      <div class="kr-row" style="justify-content:flex-end;margin-top:8px;"><button class="kr-btn g" onclick="krClose()">Yopish</button><button class="kr-btn" id="ka-ok">➕ Admin qo'shish</button></div>
    </div>`);
  g('ka-ok').onclick = async () => {
    const rr = await api.post(`/api/kurs/super/kurslar/${kursId}/adminlar`, { familiya: g('ka-fam').value, ism: g('ka-ism').value, telefon: g('ka-tel').value });
    if (!rr.ok) { g('ka-err').textContent = rr.error; return; }
    toast('Admin qo\'shildi ✓', 'ok'); loadKurslarTab(); krAdminlar(kursId);
  };
}

async function krNusxa(kursId, kod) {
  const k = KR_DATA.find(x => x.id === kursId);
  const matn = krTaklifMatn(k.nomi, kod);
  try { await navigator.clipboard.writeText(matn); toast('Taklif matni nusxalandi ✓', 'ok'); }
  catch (_) { prompt('Nusxalang:', matn); }
}
async function krKodYangila(kursId, adminId) {
  if (!confirm('Yangi kod berilsa, eski kod ishlamaydi va ulangan Telegram hisobi uziladi. Davom etasizmi?')) return;
  const r = await api.post(`/api/kurs/super/adminlar/${adminId}/kod-yangilash`, {});
  if (r.ok) { toast('Yangi kod yaratildi', 'ok'); krAdminlar(kursId); } else toast(r.error, 'err');
}
async function krAdminOchir(kursId, adminId) {
  if (!confirm('Adminni o\'chirasizmi?')) return;
  const r = await api.del('/api/kurs/super/adminlar/' + adminId);
  if (r.ok) { toast("O'chirildi", 'ok'); loadKurslarTab(); krAdminlar(kursId); } else toast(r.error, 'err');
}
