// ─── Bildirishnomalar yordamchisi ────────────────────────────────────────────
// Dars jadvali (dars_jadvali) o'zgarganda (qo'shish / tahrirlash / o'chirish)
// shu o'qituvchining o'quvchilariga bildirishnoma yozadi.
//
//  • Qabul qiluvchilar — o'quvchi "Dars jadvali" tabida ko'radigan qoida bilan
//    bir xil: o'qituvchiga biriktirilgan + maktab mos + sinf mos.
//  • 5 daqiqa ichidagi ketma-ket o'zgarishlar o'qilmagan bitta yozuvga
//    birlashtiriladi (matnga qator qo'shiladi).
//  • Hech qachon xato tashlamaydi — bildirishnoma ishlamasa ham jadvalni
//    saqlash muvaffaqiyatli tugayveradi.
// ─────────────────────────────────────────────────────────────────────────────
const pool = require('./db');

const BIRLASHTIRISH_DAQIQA = 5;
const KUN_QISQA = { '1': 'Du', '2': 'Se', '3': 'Chor', '4': 'Pay', '5': 'Ju', '6': 'Sha', '0': 'Yak' };

function kunlarMatn(s) {
  return String(s || '').split(',').map(k => k.trim()).filter(k => k !== '')
    .map(k => KUN_QISQA[k] || k).join(', ') || '—';
}
function vaqtMatn(r) {
  const b = (r.boshlanish || '').trim(), t = (r.tugash || '').trim();
  return b ? (t ? `${b}–${t}` : b) : '—';
}
const norm = v => String(v == null ? '' : v).trim();

function oqituvchiNomi(r) {
  const f = norm(r.teacher_familiya), i = norm(r.teacher_ism);
  return f ? `${f} ${i ? i[0] + '.' : ''}`.trim() : i;
}

// Bitta o'zgarishni bir qatorli matnga aylantiradi. Hech narsa o'zgarmasa null.
function qatorYasash(amal, eski, yangi) {
  if (amal === 'qoshildi') {
    return `➕ ${yangi.fan || 'Dars'} (${oqituvchiNomi(yangi)}): yangi dars — ${kunlarMatn(yangi.kunlar)}, ${vaqtMatn(yangi)}`;
  }
  if (amal === 'ochirildi') {
    return `➖ ${eski.fan || 'Dars'} (${oqituvchiNomi(eski)}): dars bekor qilindi — ${kunlarMatn(eski.kunlar)}, ${vaqtMatn(eski)}`;
  }
  const qismlar = [];
  if (norm(eski.fan) !== norm(yangi.fan))
    qismlar.push(`fan ${eski.fan || '—'} → ${yangi.fan || '—'}`);
  if (norm(eski.teacher_ism).toLowerCase() !== norm(yangi.teacher_ism).toLowerCase() ||
      norm(eski.teacher_familiya).toLowerCase() !== norm(yangi.teacher_familiya).toLowerCase())
    qismlar.push(`o'qituvchi ${oqituvchiNomi(eski)} → ${oqituvchiNomi(yangi)}`);
  const kunE = [...new Set(norm(eski.kunlar).split(',').map(x => x.trim()).filter(Boolean))].sort().join(',');
  const kunY = [...new Set(norm(yangi.kunlar).split(',').map(x => x.trim()).filter(Boolean))].sort().join(',');
  if (kunE !== kunY)
    qismlar.push(`kunlar ${kunlarMatn(eski.kunlar)} → ${kunlarMatn(yangi.kunlar)}`);
  if (norm(eski.boshlanish) !== norm(yangi.boshlanish) || norm(eski.tugash) !== norm(yangi.tugash))
    qismlar.push(`vaqt ${vaqtMatn(eski)} → ${vaqtMatn(yangi)}`);
  if (norm(eski.sinflar) !== norm(yangi.sinflar))
    qismlar.push(`sinflar ${eski.sinflar || '—'} → ${yangi.sinflar || '—'}`);
  if (!qismlar.length) return null;
  return `✏️ ${yangi.fan || 'Dars'} (${oqituvchiNomi(yangi)}): ${qismlar.join('; ')}`;
}

// O'quvchi jadvalidagi sinf filtri bilan bir xil: "8-sinf" yoki "8" qidiriladi.
function sinfMos(sinflar, sinf) {
  if (!sinf) return true;
  const s = String(sinflar || '').toLowerCase();
  const toza = String(sinf).replace(/-sinf$/i, '').trim().toLowerCase();
  return s.includes(String(sinf).toLowerCase()) || s.includes(toza);
}

async function oqituvchiOquvchilari(client, r) {
  if (!r) return [];
  const res = await client.query(
    `SELECT DISTINCT oq.id, oq.sinf
       FROM oqituvchilar t
       JOIN oqituvchi_oquvchilar oo ON oo.oqituvchi_id = t.id
       JOIN oquvchilar oq           ON oq.id = oo.oquvchi_id
      WHERE LOWER(TRIM(t.familiya)) = LOWER($1)
        AND LOWER(TRIM(t.ism))      = LOWER($2)
        AND ($3::int IS NULL OR oq.maktab_id IS NULL OR oq.maktab_id = $3)`,
    [norm(r.teacher_familiya), norm(r.teacher_ism), r.maktab_id || null]
  );
  return res.rows.filter(o => sinfMos(r.sinflar, o.sinf)).map(o => o.id);
}

/**
 * @param {'qoshildi'|'ozgardi'|'ochirildi'} amal
 * @param {object|null} eski  — o'zgarishdan oldingi dars_jadvali qatori
 * @param {object|null} yangi — o'zgarishdan keyingi qator (o'chirishda null)
 */
async function jadvalOzgardi(amal, eski, yangi) {
  try {
    const qator = qatorYasash(amal, eski, yangi);
    if (!qator) return; // hech narsa o'zgarmagan

    // Qabul qiluvchilar: eski va yangi (o'qituvchi/sinf almashgan bo'lishi mumkin) birlashmasi
    const ids = new Set();
    for (const r of [eski, yangi]) (await oqituvchiOquvchilari(pool, r)).forEach(i => ids.add(i));
    if (!ids.size) return;

    const jadvalId = (yangi && yangi.id) || (eski && eski.id);
    const idlar = jadvalId && amal !== 'ochirildi' ? [jadvalId] : [];

    for (const oquvchiId of ids) {
      const upd = await pool.query(
        `UPDATE bildirishnomalar
            SET matn         = matn || E'\\n' || $2,
                jadval_idlar = ARRAY(SELECT DISTINCT UNNEST(jadval_idlar || $3::int[])),
                sarlavha     = 'Dars jadvali o''zgardi',
                yangilangan  = NOW()
          WHERE id = (
                SELECT id FROM bildirishnomalar
                 WHERE oquvchi_id = $1 AND tur = 'jadval' AND oqilgan = FALSE
                   AND yangilangan > NOW() - ($4 || ' minutes')::interval
                 ORDER BY yangilangan DESC LIMIT 1)`,
        [oquvchiId, qator, idlar, String(BIRLASHTIRISH_DAQIQA)]
      );
      if (upd.rowCount === 0) {
        await pool.query(
          `INSERT INTO bildirishnomalar (oquvchi_id, tur, sarlavha, matn, jadval_idlar)
           VALUES ($1, 'jadval', 'Dars jadvali o''zgardi', $2, $3::int[])`,
          [oquvchiId, qator, idlar]
        );
      }
    }
  } catch (err) {
    console.error('bildirishnoma xatolik:', err.message);
  }
}

module.exports = { jadvalOzgardi, qatorYasash, sinfMos };
