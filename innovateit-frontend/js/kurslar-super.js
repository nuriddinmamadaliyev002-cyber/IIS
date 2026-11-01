// ═══════════════════════════════════════════════════════════════════════════
//  ONLINE KURSLAR (Superadmin tabi)
//  Superadmin kurs yaratadi va har bir kurs uchun admin tayinlaydi. Admin
//  Telegram Mini App'da taklif kodini kiritib o'z paneliga kiradi; savollar,
//  ishtirokchilar va sozlamalarni o'zi boshqaradi.
//  Yordamchilar (g, esc2, toast, api) app.js / api.js dan olinadi.
// ═══════════════════════════════════════════════════════════════════════════
let KR_DATA = [];

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

// ─── Kurs adminlari (Telegram ID orqali biriktiriladi — maktab adminlari kabi) ───
let KR_ADMINLAR = [];

async function krAdminlar(kursId) {
  const k = KR_DATA.find(x => x.id === kursId);
  const r = await api.get(`/api/kurs/super/kurslar/${kursId}/adminlar`);
  if (!r.ok) return toast(r.error, 'err');
  const A = KR_ADMINLAR = r.adminlar;
  krModal(`
    <h3>👤 Kurs adminlari</h3>
    <div style="font-size:13px;color:#6b7280;margin-bottom:10px;">${esc2(k.nomi)}</div>
    ${A.length ? A.map(a => `
      <div class="kr-adm">
        <div class="kr-row"><b>${esc2((a.familiya + ' ' + a.ism).trim())}</b>${a.telefon ? `<span class="kr-chip">${esc2(a.telefon)}</span>` : ''}<span class="kr-sp"></span>
          ${a.telegram_id
            ? `<span class="kr-chip" style="background:#ecfdf3;color:#16a34a;">📱 Telegram bog'langan (${esc2(a.telegram_id)})</span>`
            : '<span class="kr-chip" style="background:#fef2f2;color:#dc2626;">❌ Telegram bog\'lanmagan</span>'}</div>
        <div class="kr-row" style="margin-top:8px;"><span class="kr-sp"></span>
          <button class="kr-btn s" onclick="krAdminTahrir(${kursId},${a.id})">${a.telegram_id ? '📱' : '✏️'} Tahrirlash</button>
          <button class="kr-btn r" onclick="krAdminOchir(${kursId},${a.id})">🗑</button></div>
      </div>`).join('') : '<div style="color:#9ca3af;padding:8px 0;">Hali admin yo\'q</div>'}
    <div style="border-top:1.5px solid #e5e7eb;margin-top:12px;padding-top:6px;">
      <label>Yangi admin qo'shish</label>
      <div class="kr-row"><input id="ka-fam" placeholder="Familiya" style="flex:1;min-width:120px;"><input id="ka-ism" placeholder="Ism *" style="flex:1;min-width:120px;"></div>
      <input id="ka-tel" placeholder="Telefon (ixtiyoriy)" style="margin-top:8px;">
      <div style="font-size:12px;color:#9ca3af;margin-top:6px;">Qo'shgach, Telegram ID biriktirish oynasi ochiladi.</div>
      <div class="kr-err" id="ka-err"></div>
      <div class="kr-row" style="justify-content:flex-end;margin-top:8px;"><button class="kr-btn g" onclick="krClose()">Yopish</button><button class="kr-btn" id="ka-ok">➕ Admin qo'shish</button></div>
    </div>`);
  g('ka-ok').onclick = async () => {
    const rr = await api.post(`/api/kurs/super/kurslar/${kursId}/adminlar`, { familiya: g('ka-fam').value, ism: g('ka-ism').value, telefon: g('ka-tel').value });
    if (!rr.ok) { g('ka-err').textContent = rr.error; return; }
    toast("✅ Admin qo'shildi — endi Telegram ID biriktiring", 'ok'); loadKurslarTab();
    await krAdminlar(kursId);
    krAdminTahrir(kursId, rr.id);
  };
}

// Adminni tahrirlash + Telegram ID biriktirish (maktab adminini tahrirlash oynasi kabi)
function krAdminTahrir(kursId, adminId) {
  const a = KR_ADMINLAR.find(x => x.id === adminId);
  if (!a) return;
  const bir = a.telegram_id
    ? `<span style="color:#059669;">✅ Bog'langan (ID: ${esc2(a.telegram_id)})</span>`
    : `<span style="color:#dc2626;">❌ Hali bog'lanmagan — admin panelga kira olmaydi</span>`;
  krModal(`
    <h3>✏️ Adminni tahrirlash</h3>
    <div class="kr-row"><div style="flex:1;min-width:140px;"><label>Familiya</label><input id="kae-fam" value="${esc2(a.familiya)}" autocomplete="off"></div>
      <div style="flex:1;min-width:140px;"><label>Ism</label><input id="kae-ism" value="${esc2(a.ism)}" autocomplete="off"></div></div>
    <label>Telefon (ixtiyoriy)</label><input id="kae-tel" value="${esc2(a.telefon)}" autocomplete="off">
    <label>📱 Telegram ID <span style="color:#9ca3af;font-weight:400;text-transform:none;">(asosiy kirish usuli)</span></label>
    <input id="kae-tgid" type="text" inputmode="numeric" placeholder="masalan: 816464166" value="${esc2(a.telegram_id || '')}" autocomplete="off">
    <div class="kandidat-picker" id="kae-kandidatlar" style="margin-top:8px;">
      <button type="button" class="kandidat-picker-trigger field-input" onclick="toggleKandidatPicker('kae-kandidatlar')">
        <span class="kandidat-picker-label">— yoki botga /start yozganlar ro'yxatidan tanlang —</span>
        <span class="kandidat-picker-arrow">▾</span>
      </button>
      <div class="kandidat-picker-panel"></div>
    </div>
    <div style="font-size:12px;color:#9ca3af;margin:2px 0 4px;">Admin botga <b>/start</b> yozsa, shu ro'yxatda avtomatik paydo bo'ladi. Telegram ID'ni o'chirsangiz — admin ajratiladi.</div>
    <div style="font-size:12px;margin:2px 0 4px;">${bir}</div>
    <div class="kr-err" id="kae-err"></div>
    <div class="kr-row" style="justify-content:flex-end;margin-top:12px;">
      <button class="kr-btn g" onclick="krAdminlar(${kursId})">Bekor qilish</button><button class="kr-btn" id="kae-ok">Saqlash</button></div>`);
  loadKandidatPicker('kae-kandidatlar', 'kae-tgid');
  g('kae-ok').onclick = async () => {
    const tg = g('kae-tgid').value.trim();
    if (tg && !/^\d{4,15}$/.test(tg)) { g('kae-err').textContent = "❌ Telegram ID faqat raqamlardan iborat bo'lishi kerak"; return; }
    if (!g('kae-ism').value.trim()) { g('kae-err').textContent = '❌ Ism majburiy'; return; }
    const btn = g('kae-ok'); btn.disabled = true;
    const r = await api.put('/api/kurs/super/adminlar/' + adminId, {
      familiya: g('kae-fam').value, ism: g('kae-ism').value, telefon: g('kae-tel').value, telegram_id: tg });
    btn.disabled = false;
    if (!r.ok) { g('kae-err').textContent = '❌ ' + r.error; return; }
    toast('✅ Admin yangilandi!', 'ok'); loadKurslarTab(); krAdminlar(kursId);
  };
}

async function krAdminOchir(kursId, adminId) {
  if (!confirm("Adminni o'chirasizmi?\n\nU kurs paneliga kira olmaydi.")) return;
  const r = await api.del('/api/kurs/super/adminlar/' + adminId);
  if (r.ok) { toast("O'chirildi", 'ok'); loadKurslarTab(); krAdminlar(kursId); } else toast(r.error, 'err');
}
