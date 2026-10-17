// ─── Chat: umumiy ruxsat qoidalari (1:1 chat.js, guruh chat_guruh.js, chat_fayl_public.js) ─────
//
//  Bu yerda: kim so'rov yuboryapti, "guruhda" sharti, juftlik tekshiruvi, tezlik cheklovi,
//  tanlangan maktab va GURUH CHATI uchun a'zolik qoidasi.
//
//  Guruh = dars_jadvali yozuvi ("Guruh yaratish"). Guruh chatining a'zolari alohida
//  jadvalda SAQLANMAYDI — har so'rovda shu qoida bilan hisoblanadi:
//    • o'qituvchi: dars_jadvali'dagi teacher_ism/teacher_familiya o'zining ismi bilan mos kelsa;
//    • o'quvchi:   o'qituvchiga biriktirilgan (oqituvchi_oquvchilar), guruh maktabida o'qiydi
//                  va sinfi guruh sinflaridan biri.
//  Shuning uchun o'quvchi guruhga qo'shilsa/chiqarilsa yoki nofaolga o'tsa, chatga kirishi
//  avtomatik o'zgaradi — sinxronlash kodi kerak emas.
const pool = require('../db');

// Kim so'rov yuboryapti: { rol, id } yoki null.
// requireAuth superadminni ham o'tkazadi (isSuper) — chat uchun u yaroqsiz.
function kim(req) {
  const u = req.user || {};
  if (u.isSuper) return null;
  const id = parseInt(u.entityId, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (u.role === 'oqituvchi' || u.role === 'oquvchi') return { rol: u.role, id };
  return null;
}

// ─── "Guruhda" sharti (1:1 chat uchun) ───────────────────────────────────────
// Alias'lar: oo = oqituvchi_oquvchilar, o = oquvchilar, t = oqituvchilar.
const GURUHDA = `EXISTS (
  SELECT 1 FROM dars_jadvali dj
   WHERE dj.maktab_id = o.maktab_id
     AND LOWER(TRIM(dj.teacher_familiya)) = LOWER(TRIM(t.familiya))
     AND LOWER(TRIM(dj.teacher_ism))      = LOWER(TRIM(t.ism))
     AND EXISTS (
       SELECT 1 FROM unnest(string_to_array(COALESCE(dj.sinflar, ''), ',')) AS sn
        WHERE REGEXP_REPLACE(LOWER(TRIM(sn)),       '[\\s-]*sinf$', '')
            = REGEXP_REPLACE(LOWER(TRIM(o.sinf)),   '[\\s-]*sinf$', '')
          AND TRIM(sn) <> ''))`;

// Juftlik: biriktirilgan VA o'quvchi o'qituvchining guruhida
async function biriktirilganmi(tId, sId) {
  const r = await pool.query(
    `SELECT 1
       FROM oqituvchi_oquvchilar oo
       JOIN oquvchilar  o ON o.id = oo.oquvchi_id
       JOIN oqituvchilar t ON t.id = oo.oqituvchi_id
      WHERE oo.oqituvchi_id = $1 AND oo.oquvchi_id = $2 AND ${GURUHDA}`,
    [tId, sId]
  );
  return r.rowCount > 0;
}

// ─── Guruh chati: o'qituvchi/o'quvchi qaysi guruhlarga kira oladi ────────────
// dj = dars_jadvali, t = oqituvchilar (guruh egasi). O'quvchi uchun o = oquvchilar.
const NOM_MOS = `LOWER(TRIM(dj.teacher_familiya)) = LOWER(TRIM(t.familiya))
                 AND LOWER(TRIM(dj.teacher_ism)) = LOWER(TRIM(t.ism))`;
const SINF_MOS = `EXISTS (
  SELECT 1 FROM unnest(string_to_array(COALESCE(dj.sinflar, ''), ',')) AS sn
   WHERE REGEXP_REPLACE(LOWER(TRIM(sn)),     '[\\s-]*sinf$', '')
       = REGEXP_REPLACE(LOWER(TRIM(o.sinf)), '[\\s-]*sinf$', '')
     AND TRIM(sn) <> '')`;

// Foydalanuvchi kira oladigan guruhlar uchun FROM/WHERE bo'laklari.
// Parametr $1 = foydalanuvchi id. Chaqiruvchi o'zining JOIN/shartlarini
// `from` bilan `where` ORASIGA / `where` oxiriga qo'shadi.
function guruhlarSql(me) {
  if (me.rol === 'oqituvchi') {
    return {
      from:  `FROM dars_jadvali dj
              JOIN oqituvchilar t ON t.id = $1 AND ${NOM_MOS}`,
      where: `WHERE TRUE`,
    };
  }
  return {
    from:  `FROM oquvchilar o
            JOIN oqituvchi_oquvchilar oo ON oo.oquvchi_id = o.id
            JOIN oqituvchilar t ON t.id = oo.oqituvchi_id
            JOIN dars_jadvali dj ON dj.maktab_id = o.maktab_id AND ${NOM_MOS} AND ${SINF_MOS}`,
    where: `WHERE o.id = $1`,
  };
}

// Guruhga kirish huquqi: { id, maktab_id, ... } yoki null
async function guruhgaKirish(me, guruhId) {
  const { from, where } = guruhlarSql(me);
  const r = await pool.query(
    `SELECT dj.id, dj.maktab_id, dj.fan, dj.sinflar, dj.kunlar, dj.boshlanish, dj.tugash
       ${from} ${where} AND dj.id = $2 LIMIT 1`,
    [me.id, guruhId]
  );
  return r.rows[0] || null;
}

// ─── Oddiy xotiradagi tezlik cheklovi: daqiqasiga ko'pi bilan 20 ta xabar ────
const RATE = new Map();            // "rol:id" -> [vaqtlar]
const RATE_LIMIT = 20, RATE_WINDOW = 60 * 1000;
setInterval(() => {
  const t = Date.now() - RATE_WINDOW;
  for (const [k, arr] of RATE) { const a = arr.filter(x => x > t); a.length ? RATE.set(k, a) : RATE.delete(k); }
}, RATE_WINDOW).unref();
function rateOk(me) {
  const k = me.rol + ':' + me.id, now = Date.now();
  const arr = (RATE.get(k) || []).filter(x => x > now - RATE_WINDOW);
  if (arr.length >= RATE_LIMIT) { RATE.set(k, arr); return false; }
  arr.push(now); RATE.set(k, arr);
  return true;
}

// O'qituvchi tanlagan maktab (?maktabId=): faqat o'ziga biriktirilgan maktab bo'lishi shart.
// Berilmasa — filtr yo'q (mid: null).
function tanlanganMaktab(req, me) {
  if (me.rol !== 'oqituvchi') return { mid: null };
  const raw = req.query && req.query.maktabId;
  if (raw === undefined || raw === null || raw === '') return { mid: null };
  const mid = parseInt(raw, 10);
  const u = req.user || {};
  const allowed = (u.maktabIdlar || []).map(Number).filter(Number.isInteger);
  const main = Number(u.maktabId);
  if (Number.isInteger(main) && main > 0 && !allowed.includes(main)) allowed.push(main);
  if (!Number.isInteger(mid) || !allowed.includes(mid)) return { error: "Bu maktab sizga biriktirilmagan" };
  return { mid };
}

module.exports = {
  kim, GURUHDA, biriktirilganmi,
  NOM_MOS, SINF_MOS, guruhlarSql, guruhgaKirish,
  rateOk, tanlanganMaktab,
};
