// ═══════════════════════════════════════════════════════════════════════════
//  O'quvchi tarixi — nofaolga o'tgan / qayta faollashtirilgan o'quvchilar
//  ─────────────────────────────────────────────────────────────────────────
//  Qoida: o'quvchi sana S da o'qituvchi ro'yxatida ko'rinadi, agar
//    • o'qituvchiga biriktirilgan bo'lsa (oqituvchi_oquvchilar — nofaolga
//      o'tganda ham saqlanadi, chunki id o'zgarmaydi, migrations/029), VA
//    • S o'quvchining "nofaol oralig'i"ga tushmasa:
//        - hozir nofaol bo'lsa:  S <= chiqgan sana (chiqgan kuni ham ko'rinadi)
//        - qayta faollashtirilgan bo'lsa: chiqgan < S < tiklangan sana
//          oralig'ida ko'rinmaydi (oquvchi_nofaol_davrlar jadvali)
//  Natijada chiqishdan oldingi barcha kunlar tarixi o'qituvchiga ko'rinib
//  turadi, qayta faollashtirilgach esa avvalgi tarix yana birga ko'rinadi.
// ═══════════════════════════════════════════════════════════════════════════
const pool = require('./db');

const TZ = 'Asia/Tashkent';

// 'YYYY-MM-DD' — Toshkent vaqti bilan bugungi sana
function bugunISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

// 'DD.MM.YYYY' — nofaol_oquvchilar.chiqgan kabi matn formati (Toshkent vaqti)
function bugunUZ() {
  const [y, m, d] = bugunISO().split('-');
  return `${d}.${m}.${y}`;
}

// 'DD.MM.YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' → 'YYYY-MM-DD' (noto'g'ri bo'lsa null)
function sanaISO(v) {
  const s = String(v == null ? '' : v).trim();
  let y, m, d;
  let mt = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mt) { [, y, m, d] = mt; }
  else {
    mt = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (!mt) return null;
    [, d, m, y] = mt;
  }
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dt = new Date(iso + 'T00:00:00Z');
  if (isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

// ─── O'qituvchining sana S dagi o'quvchilari (faol + o'sha kuni hali nofaol bo'lmaganlar) ──
//  opts: { maktabId, sinflar }  — ixtiyoriy filtrlar
//  Qaytadi: [{ id, ism, familiya, sinf, maktab_id, maktab_nomi, nofaol, chiqgan }]
async function oqituvchiOquvchilariSanada(oqituvchiId, sana, opts = {}) {
  const links = await pool.query(
    'SELECT oquvchi_id FROM oqituvchi_oquvchilar WHERE oqituvchi_id = $1',
    [oqituvchiId]
  );
  const ids = links.rows.map(r => r.oquvchi_id);
  if (!ids.length) return [];

  const [act, nof, gaps] = await Promise.all([
    pool.query(
      `SELECT o.id, o.ism, o.familiya, o.sinf, o.maktab_id, m.nomi AS maktab_nomi
         FROM oquvchilar o
         LEFT JOIN maktablar m ON m.id = o.maktab_id
        WHERE o.id = ANY($1::int[])`, [ids]),
    pool.query(
      `SELECT n.id AS nofaol_id, n.asl_id AS id, n.ism, n.familiya, n.sinf, n.maktab_id,
              m.nomi AS maktab_nomi, n.chiqgan
         FROM nofaol_oquvchilar n
         LEFT JOIN maktablar m ON m.id = n.maktab_id
        WHERE n.asl_id = ANY($1::int[])
        ORDER BY n.id`, [ids]),
    pool.query(
      `SELECT oquvchi_id, tugagan::text AS tugagan, tiklangan::text AS tiklangan
         FROM oquvchi_nofaol_davrlar
        WHERE oquvchi_id = ANY($1::int[])`, [ids]),
  ]);

  // Qayta faollashtirilgan o'quvchining nofaol oralig'iga tushdimi?
  const oraliqda = (id) => gaps.rows.some(g =>
    g.oquvchi_id === id && g.tugagan < sana && g.tiklangan > sana);

  const byId = new Map();
  // Nofaollar (bir asl_id uchun oxirgi yozuv yutadi)
  for (const r of nof.rows) {
    const chiqgan = sanaISO(r.chiqgan);
    byId.set(r.id, { ...r, nofaol: true, chiqganISO: chiqgan });
  }
  // Faollar nofaollarni ustidan yozadi (id bir xil bo'lsa — faol holat to'g'ri)
  for (const r of act.rows) byId.set(r.id, { ...r, nofaol: false, chiqganISO: null });

  const sinflar = Array.isArray(opts.sinflar) && opts.sinflar.length ? new Set(opts.sinflar) : null;
  const out = [];
  for (const r of byId.values()) {
    // maktabId berilgan bo'lsa (null ham) — aniq moslik; null faqat maktabsiz o'quvchiga mos
    if ('maktabId' in opts && opts.maktabId !== undefined &&
        String(r.maktab_id ?? '') !== String(opts.maktabId ?? '')) continue;
    if (sinflar && !sinflar.has(r.sinf)) continue;
    if (r.nofaol && !(r.chiqganISO && sana <= r.chiqganISO)) continue; // chiqqandan keyingi kunlar
    if (oraliqda(r.id)) continue;                                      // nofaol bo'lgan oraliq
    out.push({
      id: r.id, ism: r.ism, familiya: r.familiya, sinf: r.sinf,
      maktab_id: r.maktab_id, maktab_nomi: r.maktab_nomi,
      nofaol: r.nofaol, chiqgan: r.chiqganISO,
    });
  }
  out.sort((a, b) =>
    String(a.sinf || '').localeCompare(String(b.sinf || ''), undefined, { numeric: true }) ||
    String(a.familiya || '').localeCompare(String(b.familiya || '')) ||
    String(a.ism || '').localeCompare(String(b.ism || '')));
  return out;
}

// ─── O'quvchi butunlay o'chirilganda unga bog'liq yozuvlarni tozalash ────────
//  migrations/029 dan keyin oquvchi_id dagi FK (ON DELETE CASCADE) yo'q,
//  shuning uchun doimiy o'chirishda bog'liq yozuvlar qo'lda tozalanadi.
async function oquvchiTarixiniTozala(client, oquvchiId) {
  if (!oquvchiId) return;
  await client.query('DELETE FROM oqituvchi_oquvchilar   WHERE oquvchi_id = $1', [oquvchiId]);
  await client.query('DELETE FROM vazifa_javoblari       WHERE oquvchi_id = $1', [oquvchiId]);
  await client.query('DELETE FROM oquvchi_baholar        WHERE oquvchi_id = $1', [oquvchiId]);
  await client.query('DELETE FROM chat_xabarlar          WHERE oquvchi_id = $1', [oquvchiId]);
  await client.query('DELETE FROM oquvchi_nofaol_davrlar WHERE oquvchi_id = $1', [oquvchiId]);
}

module.exports = { bugunISO, bugunUZ, sanaISO, oqituvchiOquvchilariSanada, oquvchiTarixiniTozala };
