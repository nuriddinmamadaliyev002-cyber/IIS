// ─── Vazifalar routes (Dars mavzusi + Uyga vazifa) ────────────────────────────
//
//  O'QITUVCHI:
//    GET    /api/vazifalar/guruh/:guruhId            — bir guruhning bir kunlik
//                                                        mavzu/vazifasini olish
//    POST   /api/vazifalar/guruh/:guruhId             — mavzu/vazifa saqlash (upsert)
//    DELETE /api/vazifalar/guruh/:guruhId             — bir kunlik mavzu/vazifani o'chirish
//                                                        (o'quvchi javoblari va baholari ham o'chadi)
//    GET    /api/vazifalar/tekshirish                 — kelgan javoblar ro'yxati
//    POST   /api/vazifalar/javob/:javobId/baholash     — javobni baholash
//
//  O'QUVCHI:
//    GET    /api/vazifalar/mening-vazifalarim          — o'ziga tegishli vazifalar
//    POST   /api/vazifalar/:vazifaId/javob             — O'CHIRILGAN (403): o'quvchi faqat ko'radi
//
// ─────────────────────────────────────────────────────────────────────────────
const { Router }      = require('express');
const fs              = require('fs');
const path            = require('path');
const pool            = require('../db');
const { requireAuth } = require('../middleware/jwt');

const router = Router();

// Ism/familiyani dars_jadvali'dagi teacher_ism/teacher_familiya bilan
// solishtirish uchun — jadval.js'dagi bilan bir xil pattern
function ismFamiliya(ism) {
  const parts = (ism || '').trim().split(' ');
  return { familiya: parts[0] || '', ismOnly: parts.slice(1).join(' ') || '' };
}

// Yuklangan fayllar papkasi (index.js dagi UPLOAD_DIR bilan bir xil joy)
const UPLOAD_DIR = path.join(__dirname, '../../uploads');

// Serverning OS sozlamasidan qat'i nazar O'zbekiston vaqti: "DD.MM.YYYY HH:MM"
function hozirUZ() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const v = t => parts.find(p => p.type === t).value;
  return `${v('day')}.${v('month')}.${v('year')} ${v('hour')}:${v('minute')}`;
}

// Diskdagi faylni jim o'chiradi. Faqat oddiy fayl nomi qabul qilinadi
// (yo'l ajratgichlari yoki http havolalar e'tiborsiz qoldiriladi).
function faylniOchirish(nom) {
  try {
    const n = String(nom || '').trim();
    if (!n || n !== path.basename(n)) return;
    fs.unlink(path.join(UPLOAD_DIR, n), () => {});
  } catch (_) { /* fayl bo'lmasa ham muammo emas */ }
}

// Guruh haqiqatan ham shu o'qituvchiga tegishli ekanini tekshiradi
async function oqituvchiGuruhi(guruhId, ism) {
  const { familiya, ismOnly } = ismFamiliya(ism);
  const r = await pool.query(
    `SELECT id, maktab_id FROM dars_jadvali
     WHERE id=$1 AND LOWER(TRIM(teacher_familiya))=LOWER($2) AND LOWER(TRIM(teacher_ism))=LOWER($3)`,
    [guruhId, familiya, ismOnly]
  );
  return r.rows[0] || null;
}

const SANA_RE = /^\d{4}-\d{2}-\d{2}$/;

// Bir javobga biriktirilishi mumkin bo'lgan eng ko'p fayl soni
const MAX_JAVOB_FAYL = 5;

// Serverning OS sozlamasidan qat'i nazar, O'zbekiston vaqti bo'yicha
// bugungi sanani YYYY-MM-DD formatida qaytaradi (muddat bilan solishtirish uchun)
function bugungiSanaISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
}

// Bir nechta javob_id uchun ularga tegishli fayllarni bitta so'rovda olib,
// { [javob_id]: [{id, fayl_nomi, original_nomi}, ...] } shaklida qaytaradi
async function fayllarniOlish(javobIdlar) {
  const ids = javobIdlar.filter(Boolean);
  if (!ids.length) return {};
  const result = await pool.query(
    `SELECT id, javob_id, fayl_nomi, original_nomi
       FROM vazifa_javob_fayllari
      WHERE javob_id = ANY($1::int[])
      ORDER BY tartib ASC, id ASC`,
    [ids]
  );
  const map = {};
  for (const row of result.rows) {
    (map[row.javob_id] ||= []).push({
      id: row.id,
      fayl_nomi: row.fayl_nomi,
      original_nomi: row.original_nomi
    });
  }
  return map;
}

// ═══════════════════════════════════════════════════════════════════════════
//  O'QITUVCHI — mavzu / uyga vazifa yozish
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /api/vazifalar/guruh/:guruhId?sana=YYYY-MM-DD ────────────────────────
// Javobda kartochka uchun kerakli qo'shimcha ma'lumotlar ham bor:
// yaratilgan/yangilangan vaqt va kelgan/baholangan javoblar soni.
router.get('/guruh/:guruhId', requireAuth(['oqituvchi']), async (req, res) => {
  const { ism, entityId } = req.user;
  const { sana } = req.query;
  const guruhId = parseInt(req.params.guruhId);

  if (!guruhId || !sana) return res.status(400).json({ ok: false, error: 'guruhId va sana kerak' });
  if (!entityId) return res.status(400).json({ ok: false, error: "O'qituvchi ID topilmadi" });

  try {
    const guruh = await oqituvchiGuruhi(guruhId, ism);
    if (!guruh) return res.status(404).json({ ok: false, error: 'Guruh topilmadi' });

    const result = await pool.query(
      `SELECT dm.id, dm.mavzu, dm.uy_vazifasi, dm.mavzu_fayl, dm.mavzu_fayl_nomi,
              dm.vazifa_fayl, dm.vazifa_fayl_nomi, dm.yaratilgan, dm.yangilangan,
              (SELECT COUNT(*) FROM vazifa_javoblari vj
                WHERE vj.vazifa_id = dm.id)::int AS javoblar_soni,
              (SELECT COUNT(*) FROM vazifa_javoblari vj
                WHERE vj.vazifa_id = dm.id AND vj.holat = 'tekshirilgan')::int AS baholangan_soni
       FROM dars_mavzulari dm
       WHERE dm.guruh_id=$1 AND dm.sana=$2`,
      [guruhId, sana]
    );
    res.json({ ok: true, vazifa: result.rows[0] || null });
  } catch (err) {
    console.error('vazifalar/guruh GET xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/vazifalar/guruh/:guruhId — mavzu/vazifa saqlash (upsert) ──────
router.post('/guruh/:guruhId', requireAuth(['oqituvchi']), async (req, res) => {
  const { ism, entityId } = req.user;
  const { sana, mavzu, uy_vazifasi, mavzu_fayl, vazifa_fayl, mavzu_fayl_nomi, vazifa_fayl_nomi } = req.body;
  const guruhId = parseInt(req.params.guruhId);

  if (!guruhId || !sana) return res.status(400).json({ ok: false, error: 'guruhId va sana kerak' });
  if (!SANA_RE.test(String(sana))) return res.status(400).json({ ok: false, error: "Sana formati noto'g'ri" });
  if (!entityId) return res.status(400).json({ ok: false, error: "O'qituvchi ID topilmadi" });
  if (!(mavzu || '').trim())       return res.status(400).json({ ok: false, error: 'Dars mavzusi majburiy' });
  if (!(uy_vazifasi || '').trim()) return res.status(400).json({ ok: false, error: 'Uyga vazifa majburiy' });

  try {
    const guruh = await oqituvchiGuruhi(guruhId, ism);
    if (!guruh) return res.status(404).json({ ok: false, error: 'Guruh topilmadi' });

    // Avvalgi fayllar: almashtirilgan yoki olib tashlangan bo'lsa diskdan tozalash uchun
    const oldRes = await pool.query(
      `SELECT mavzu_fayl, vazifa_fayl FROM dars_mavzulari WHERE guruh_id=$1 AND sana=$2`,
      [guruhId, sana]
    );
    const old = oldRes.rows[0] || null;

    const now = hozirUZ();
    const yangiMavzuFayl = String(mavzu_fayl || '').trim();
    const yangiVazifaFayl = String(vazifa_fayl || '').trim();
    // Asl nomlar faqat fayl bor bo'lsagina saqlanadi (fayl olib tashlansa — nom ham bo'sh)
    const yangiMavzuNomi  = yangiMavzuFayl  ? String(mavzu_fayl_nomi  || '').trim().slice(0, 255) : '';
    const yangiVazifaNomi = yangiVazifaFayl ? String(vazifa_fayl_nomi || '').trim().slice(0, 255) : '';

    // "muddat" endi ishlatilmaydi — yangi yozuvda bo'sh, mavjudida tegilmaydi
    await pool.query(
      `INSERT INTO dars_mavzulari (guruh_id, maktab_id, sana, mavzu, uy_vazifasi,
                                   mavzu_fayl, mavzu_fayl_nomi, vazifa_fayl, vazifa_fayl_nomi, yaratilgan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (guruh_id, sana) DO UPDATE
         SET mavzu=$4, uy_vazifasi=$5,
             mavzu_fayl=$6, mavzu_fayl_nomi=$7, vazifa_fayl=$8, vazifa_fayl_nomi=$9,
             yangilangan=$10`,
      [guruhId, guruh.maktab_id, sana, mavzu || '', uy_vazifasi || '',
       yangiMavzuFayl, yangiMavzuNomi, yangiVazifaFayl, yangiVazifaNomi, now]
    );

    // Almashtirilgan yoki olib tashlangan eski fayllarni diskdan tozalaymiz
    // (yangi ro'yxatda hali ishlatilayotgan fayl o'chib ketmasligi uchun tekshiramiz)
    if (old) {
      for (const f of [old.mavzu_fayl, old.vazifa_fayl]) {
        if (f && f !== yangiMavzuFayl && f !== yangiVazifaFayl) faylniOchirish(f);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('vazifalar/guruh POST xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── DELETE /api/vazifalar/guruh/:guruhId  (body yoki query: { sana }) ────────
// Bir kunlik mavzu/vazifani o'chiradi. DIQQAT: vazifa_javoblari jadvali
// dars_mavzulari ga ON DELETE CASCADE bilan bog'langan — o'quvchilarning javoblari,
// baholari va yuklagan fayllari ham o'chadi. Frontend buni tasdiqlash oynasida
// javoblar soni bilan ogohlantiradi.
router.delete('/guruh/:guruhId', requireAuth(['oqituvchi']), async (req, res) => {
  const { ism, entityId } = req.user;
  const sana = (req.body && req.body.sana) || req.query.sana;
  const guruhId = parseInt(req.params.guruhId);

  if (!guruhId || !sana) return res.status(400).json({ ok: false, error: 'guruhId va sana kerak' });
  if (!SANA_RE.test(String(sana))) return res.status(400).json({ ok: false, error: "Sana formati noto'g'ri" });
  if (!entityId) return res.status(400).json({ ok: false, error: "O'qituvchi ID topilmadi" });

  try {
    const guruh = await oqituvchiGuruhi(guruhId, ism);
    if (!guruh) return res.status(404).json({ ok: false, error: 'Guruh topilmadi' });

    const client = await pool.connect();
    let fayllar = [];
    let ochirilganJavoblar = 0;
    try {
      await client.query('BEGIN');

      const row = await client.query(
        `SELECT id, mavzu_fayl, vazifa_fayl FROM dars_mavzulari WHERE guruh_id=$1 AND sana=$2 FOR UPDATE`,
        [guruhId, sana]
      );
      if (row.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ ok: false, error: 'Vazifa topilmadi (allaqachon o\'chirilgan bo\'lishi mumkin)' });
      }
      const vazifaId = row.rows[0].id;

      // CASCADE bilan o'chadigan javob fayllarining nomlarini oldindan yig'ib olamiz
      const jf = await client.query(
        `SELECT f.fayl_nomi
           FROM vazifa_javob_fayllari f
           JOIN vazifa_javoblari vj ON vj.id = f.javob_id
          WHERE vj.vazifa_id = $1`,
        [vazifaId]
      );
      const cnt = await client.query(
        `SELECT COUNT(*)::int AS n FROM vazifa_javoblari WHERE vazifa_id=$1`, [vazifaId]
      );
      ochirilganJavoblar = cnt.rows[0].n;
      fayllar = [row.rows[0].mavzu_fayl, row.rows[0].vazifa_fayl, ...jf.rows.map(r => r.fayl_nomi)];

      await client.query(`DELETE FROM dars_mavzulari WHERE id=$1`, [vazifaId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    // Baza o'zgarishi muvaffaqiyatli tugagandan KEYIN fayllarni tozalaymiz
    fayllar.forEach(faylniOchirish);

    res.json({ ok: true, ochirilgan_javoblar: ochirilganJavoblar });
  } catch (err) {
    console.error('vazifalar/guruh DELETE xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  O'QITUVCHI — kelgan javoblarni tekshirish / baholash
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /api/vazifalar/tekshirish?holat=yuborilgan|tekshirilgan|hammasi ─────
router.get('/tekshirish', requireAuth(['oqituvchi']), async (req, res) => {
  const { ism, entityId } = req.user;
  const holat = req.query.holat || 'yuborilgan';

  if (!entityId) return res.status(400).json({ ok: false, error: "O'qituvchi ID topilmadi" });

  const { familiya, ismOnly } = ismFamiliya(ism);
  const holatFilter = (holat === 'hammasi') ? '' : 'AND vj.holat = $3';
  const params = [familiya, ismOnly];
  if (holatFilter) params.push(holat);

  try {
    const result = await pool.query(
      `SELECT vj.id, vj.javob_matn, vj.javob_fayl, vj.yuborilgan_vaqt, vj.holat,
              vj.baho, vj.oqituvchi_izohi, vj.baholangan_vaqt,
              dm.id AS vazifa_id, dm.sana, dm.mavzu, dm.uy_vazifasi, dm.vazifa_fayl,
              dj.fan, dj.sinflar,
              o.id AS oquvchi_id, o.ism AS oquvchi_ism, o.familiya AS oquvchi_familiya, o.sinf AS oquvchi_sinf
       FROM vazifa_javoblari vj
       JOIN dars_mavzulari dm ON dm.id = vj.vazifa_id
       JOIN dars_jadvali   dj ON dj.id = dm.guruh_id
       JOIN oquvchilar     o  ON o.id  = vj.oquvchi_id
       WHERE LOWER(TRIM(dj.teacher_familiya))=LOWER($1) AND LOWER(TRIM(dj.teacher_ism))=LOWER($2)
         ${holatFilter}
       ORDER BY vj.yuborilgan_vaqt DESC`,
      params
    );
    const fayllarMap = await fayllarniOlish(result.rows.map(r => r.id));
    const javoblar = result.rows.map(r => ({ ...r, javob_fayllar: fayllarMap[r.id] || [] }));
    res.json({ ok: true, javoblar });
  } catch (err) {
    console.error('vazifalar/tekshirish GET xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/vazifalar/javob/:javobId/baholash ──────────────────────────────
router.post('/javob/:javobId/baholash', requireAuth(['oqituvchi']), async (req, res) => {
  const { ism } = req.user;
  const { baho, izoh } = req.body;
  const javobId = parseInt(req.params.javobId);

  if (!javobId) return res.status(400).json({ ok: false, error: 'javobId kerak' });

  const { familiya, ismOnly } = ismFamiliya(ism);

  try {
    // Bu javob shu o'qituvchining guruhiga tegishli ekanini tekshiramiz
    const checkRes = await pool.query(
      `SELECT vj.id FROM vazifa_javoblari vj
       JOIN dars_mavzulari dm ON dm.id = vj.vazifa_id
       JOIN dars_jadvali   dj ON dj.id = dm.guruh_id
       WHERE vj.id=$1 AND LOWER(TRIM(dj.teacher_familiya))=LOWER($2) AND LOWER(TRIM(dj.teacher_ism))=LOWER($3)`,
      [javobId, familiya, ismOnly]
    );
    if (checkRes.rowCount === 0) return res.status(404).json({ ok: false, error: 'Javob topilmadi' });

    const now = new Date().toLocaleString('uz-UZ');
    await pool.query(
      `UPDATE vazifa_javoblari
         SET baho=$1, oqituvchi_izohi=$2, holat='tekshirilgan', baholangan_vaqt=$3
       WHERE id=$4`,
      [baho ?? null, izoh || '', now, javobId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('vazifalar/baholash POST xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  O'QUVCHI — o'ziga tegishli vazifalarni ko'rish va javob yuborish
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /api/vazifalar/mening-vazifalarim ────────────────────────────────────
router.get('/mening-vazifalarim', requireAuth(['oquvchi']), async (req, res) => {
  const { entityId, sinf } = req.user;
  if (!entityId) return res.status(400).json({ ok: false, error: "O'quvchi ID topilmadi" });

  try {
    // 1) O'quvchiga biriktirilgan o'qituvchilar (jadval.js'dagi bilan bir xil mantiq)
    const teachersRes = await pool.query(
      `SELECT o.ism, o.familiya
       FROM oqituvchi_oquvchilar oo
       JOIN oqituvchilar o ON o.id = oo.oqituvchi_id
       WHERE oo.oquvchi_id = $1`,
      [entityId]
    );
    if (teachersRes.rowCount === 0) return res.json({ ok: true, vazifalar: [] });

    const namePairs = teachersRes.rows.map(t =>
      `(LOWER(TRIM(dj.teacher_familiya)) = LOWER('${t.familiya.replace(/'/g, "''")}') AND LOWER(TRIM(dj.teacher_ism)) = LOWER('${t.ism.replace(/'/g, "''")}'))`
    ).join(' OR ');

    let sinfFilter = '';
    const sinfParams = [entityId];
    if (sinf) {
      const sinfClean = sinf.replace(/-sinf$/i, '').trim();
      sinfParams.push(`%${sinf}%`, `%${sinfClean}%`);
      sinfFilter = `AND (LOWER(dj.sinflar) LIKE LOWER($2) OR LOWER(dj.sinflar) LIKE LOWER($3))`;
    }

    const result = await pool.query(
      `SELECT dm.id, dm.sana, dm.mavzu, dm.uy_vazifasi, dm.mavzu_fayl, dm.vazifa_fayl,
              dj.fan, dj.teacher_ism, dj.teacher_familiya,
              vj.id AS javob_id, vj.javob_matn, vj.javob_fayl, vj.holat,
              vj.baho, vj.oqituvchi_izohi
       FROM dars_mavzulari dm
       JOIN dars_jadvali dj ON dj.id = dm.guruh_id
       LEFT JOIN vazifa_javoblari vj ON vj.vazifa_id = dm.id AND vj.oquvchi_id = $1
       WHERE (${namePairs}) ${sinfFilter}
         AND (dm.mavzu != '' OR dm.uy_vazifasi != '')
       ORDER BY dm.sana DESC`,
      sinfParams
    );
    const fayllarMap = await fayllarniOlish(result.rows.map(r => r.javob_id));
    const vazifalar = result.rows.map(r => ({ ...r, javob_fayllar: r.javob_id ? (fayllarMap[r.javob_id] || []) : [] }));
    res.json({ ok: true, vazifalar });
  } catch (err) {
    console.error('vazifalar/mening-vazifalarim GET xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/vazifalar/:vazifaId/javob — O'CHIRILGAN ──────────────────────
//  O'quvchilar endi mavzu va uyga vazifalarni FAQAT ko'ra oladi: matn yoki fayl
//  bilan javob yuborish/tahrirlash imkoniyati yo'q. Eski frontend yoki to'g'ridan-
//  to'g'ri API so'rovlari ham javob yubora olmasligi uchun endpoint rad etadi.
router.post('/:vazifaId/javob', requireAuth(['oquvchi']), (req, res) => {
  res.status(403).json({ ok: false, error: "O'quvchilar vazifaga javob yubora olmaydi — faqat ko'rishi mumkin" });
});

module.exports = router;
