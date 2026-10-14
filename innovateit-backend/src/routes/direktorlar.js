// ─── Direktorlar routes ──────────────────────────────────────────────────────
// GET    /api/direktorlar      — ro'yxat (faqat superadmin)
// POST   /api/direktorlar      — yaratish (faqat superadmin)
// PUT    /api/direktorlar/:id  — tahrirlash (faqat superadmin)
// DELETE /api/direktorlar/:id  — o'chirish (faqat superadmin)
// GET    /api/direktorlar/me   — direktorning o'z ma'lumoti (direktor paneli uchun)
// GET    /api/direktorlar/oqituvchilar — barcha o'qituvchilar: maktab/sinf/jadval/davomat (faqat o'qish)
//
// Direktor kirishi FAQAT Telegram orqali (bot → Mini App →
// /api/telegram/check → direktor.html ga JWT bilan redirect), xuddi
// buxgalter va sales xodimlari kabi. Telegram ID biriktirish
// /api/telegram/birikdir (rol='direktor') orqali amalga oshiriladi.
const { Router }      = require('express');
const pool            = require('../db');
const { requireAuth } = require('../middleware/jwt');

const router = Router();
function todayUZ() { return new Date().toLocaleDateString('ru-RU'); }

function superOnly(req, res, next) {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });
  next();
}

// ─── GET /api/direktorlar/me — direktor o'z ma'lumotini oladi ───────────────
router.get('/me', requireAuth(['direktor']), async (req, res) => {
  // Superadmin panelni "ko'rish" uchun ochsa — entity yo'q, token ismi qaytadi
  if (req.user.isSuper)
    return res.json({ ok: true, direktor: { ism: req.user.ism || 'Superadmin', isSuper: true } });

  try {
    const r = await pool.query(
      'SELECT id, ism, familiya FROM direktorlar WHERE id=$1',
      [req.user.entityId]
    );
    if (r.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Direktor topilmadi' });
    res.json({ ok: true, direktor: r.rows[0] });
  } catch (err) {
    console.error('GET /direktorlar/me xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── Yordamchilar ───────────────────────────────────────────────────────────
const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
const parseKunlar  = (v) => String(v || '').split(',').map(Number).filter(n => n >= 1 && n <= 6);
const parseSinflar = (v) => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
const sinfSort = (a, b) => (parseInt(a) || 0) - (parseInt(b) || 0) || String(a).localeCompare(String(b));

// ─── GET /api/direktorlar/oqituvchilar ──────────────────────────────────────
// Direktor uchun FAQAT O'QISH: barcha o'qituvchilar, ularning maktablari,
// qaysi sinflarga dars o'tishi, haftalik jadvali va oxirgi 30 kunlik davomati.
//
// ⚠️ dars_jadvali o'qituvchiga ID emas, ism-familiya matni bilan bog'langan
// (teacher_ism / teacher_familiya) — o'qituvchi paneli ham xuddi shunday
// moslaydi. Shu sabab bu yerda ham ism+familiya (kichik harfda, bo'shliqsiz)
// bo'yicha moslaymiz. Hech bir o'qituvchiga mos kelmagan jadval qatorlari
// `yetim_jadval` sifatida sanaladi (ma'lumot sifati signali).
router.get('/oqituvchilar', requireAuth(['direktor']), async (req, res) => {
  try {
    const [tRes, tmRes, jRes, ouRes, dRes, mRes] = await Promise.all([
      pool.query(
        `SELECT id, ism, familiya, fan, telefon, telefon2, telegram_id, avatar,
                kunlar, sinflar, boshlanish, tugash, qoshilgan
         FROM oqituvchilar ORDER BY familiya, ism`
      ),
      pool.query(
        `SELECT om.oqituvchi_id, m.id, m.nomi
         FROM oqituvchi_maktablar om
         JOIN maktablar m ON m.id = om.maktab_id
         ORDER BY m.nomi`
      ),
      pool.query(
        `SELECT j.id, j.maktab_id, m.nomi AS maktab_nomi, j.teacher_ism, j.teacher_familiya,
                j.fan, j.sinflar, j.kunlar, j.boshlanish, j.tugash
         FROM dars_jadvali j
         LEFT JOIN maktablar m ON m.id = j.maktab_id
         ORDER BY j.boshlanish`
      ),
      pool.query(
        `SELECT oqituvchi_id, COUNT(*)::int AS soni
         FROM oqituvchi_oquvchilar GROUP BY oqituvchi_id`
      ),
      // Sana TEXT va ikki xil formatda (DD.MM.YYYY / YYYY-MM-DD) bo'lishi
      // mumkin — xavfsiz DATE ga o'giramiz, noto'g'ri formatlar tashlab ketiladi.
      pool.query(
        `SELECT LOWER(TRIM(oqituvchi_ism)) AS ism_key, status,
                COUNT(*)::int AS soni,
                COALESCE(SUM(dars_soat),0)::int   AS soat,
                COALESCE(SUM(dars_daqiqa),0)::int AS daqiqa
         FROM (
           SELECT oqituvchi_ism, status, dars_soat, dars_daqiqa,
                  CASE
                    WHEN sana ~ '^[0-9]{2}\\.[0-9]{2}\\.[0-9]{4}$' THEN TO_DATE(sana,'DD.MM.YYYY')
                    WHEN sana ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'     THEN TO_DATE(sana,'YYYY-MM-DD')
                  END AS d
           FROM oqituvchilar_davomat
         ) x
         WHERE d >= ((NOW() AT TIME ZONE 'Asia/Tashkent')::date - 30)
         GROUP BY LOWER(TRIM(oqituvchi_ism)), status`
      ),
      pool.query('SELECT id, nomi FROM maktablar ORDER BY nomi'),
    ]);

    // Maktablar: o'qituvchi_id → [{id,nomi}]
    const maktabByT = new Map();
    for (const r of tmRes.rows) {
      if (!maktabByT.has(r.oqituvchi_id)) maktabByT.set(r.oqituvchi_id, []);
      maktabByT.get(r.oqituvchi_id).push({ id: r.id, nomi: r.nomi });
    }
    const oquvchiByT = new Map(ouRes.rows.map(r => [r.oqituvchi_id, r.soni]));

    // Jadval: "familiya|ism" → [qatorlar]
    const jadvalByKey = new Map();
    for (const r of jRes.rows) {
      const key = norm(r.teacher_familiya) + '|' + norm(r.teacher_ism);
      if (!jadvalByKey.has(key)) jadvalByKey.set(key, []);
      jadvalByKey.get(key).push({
        id: r.id, maktab_id: r.maktab_id, maktab_nomi: r.maktab_nomi || null,
        fan: r.fan || '', sinflar: parseSinflar(r.sinflar).sort(sinfSort),
        kunlar: parseKunlar(r.kunlar), boshlanish: r.boshlanish || '', tugash: r.tugash || '',
      });
    }

    // Davomat: "familiya ism" → {keldi,kech,kelmadi,soat,daqiqa}
    const davByKey = new Map();
    for (const r of dRes.rows) {
      if (!davByKey.has(r.ism_key)) davByKey.set(r.ism_key, { keldi: 0, kech: 0, kelmadi: 0, soat: 0, daqiqa: 0 });
      const d = davByKey.get(r.ism_key);
      if (r.status === 'keldi' || r.status === 'kech' || r.status === 'kelmadi') d[r.status] += r.soni;
      d.soat += r.soat; d.daqiqa += r.daqiqa;
    }

    const matched = new Set();
    const oqituvchilar = tRes.rows.map(t => {
      const jKey = norm(t.familiya) + '|' + norm(t.ism);
      const jadval = jadvalByKey.get(jKey) || [];
      if (jadvalByKey.has(jKey)) matched.add(jKey);

      // Maktab bo'yicha sinflar (jadvaldan)
      const sm = new Map();
      for (const j of jadval) {
        const k = j.maktab_id ?? 0;
        if (!sm.has(k)) sm.set(k, { maktab_id: j.maktab_id, maktab_nomi: j.maktab_nomi || '—', sinflar: new Set() });
        j.sinflar.forEach(x => sm.get(k).sinflar.add(x));
      }
      const sinflar_by_maktab = [...sm.values()].map(x => ({ ...x, sinflar: [...x.sinflar].sort(sinfSort) }));

      const dav = davByKey.get(norm(t.familiya) + ' ' + norm(t.ism)) || { keldi: 0, kech: 0, kelmadi: 0, soat: 0, daqiqa: 0 };
      const jamiMin = dav.soat * 60 + dav.daqiqa;

      return {
        id: t.id, ism: t.ism, familiya: t.familiya, fan: t.fan || '',
        telefon: t.telefon || '', telefon2: t.telefon2 || '',
        telegram: !!t.telegram_id, avatar: t.avatar || null, qoshilgan: t.qoshilgan || '',
        maktablar: maktabByT.get(t.id) || [],
        jadval, sinflar_by_maktab,
        haftalik_dars: jadval.reduce((n, j) => n + j.kunlar.length, 0),
        oquvchilar_soni: oquvchiByT.get(t.id) || 0,
        // Jadval kiritilmagan bo'lsa — o'qituvchi profilidagi umumiy ma'lumot
        profil: { sinflar: parseSinflar(t.sinflar).sort(sinfSort), kunlar: parseKunlar(t.kunlar),
                  boshlanish: t.boshlanish || '', tugash: t.tugash || '' },
        davomat30: { keldi: dav.keldi, kech: dav.kech, kelmadi: dav.kelmadi,
                     soat: Math.floor(jamiMin / 60), daqiqa: jamiMin % 60 },
      };
    });

    let yetim_jadval = 0;
    for (const [key, rows] of jadvalByKey) if (!matched.has(key)) yetim_jadval += rows.length;

    res.json({ ok: true, oqituvchilar, maktablar: mRes.rows, yetim_jadval });
  } catch (err) {
    console.error('GET /direktorlar/oqituvchilar xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  DIREKTOR UCHUN FAQAT-O'QISH ENDPOINTLARI
//  Direktor barcha maktablarni ko'radi (maktab bo'yicha cheklov YO'Q).
//  Maxfiy maydonlar (username, parol, xom telegram_id) hech qachon
//  qaytarilmaydi — faqat "Telegram bog'langanmi" (boolean).
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /api/direktorlar/oquvchilar — faol + nofaol o'quvchilar ────────────
router.get('/oquvchilar', requireAuth(['direktor']), async (req, res) => {
  try {
    const [aRes, nRes, ouRes, mRes] = await Promise.all([
      pool.query(
        `SELECT o.id, o.ism, o.familiya, o.maktab_id, m.nomi AS maktab_nomi, o.sinf,
                o.telefon, o.telefon2, o.tug, o.manzil, o.qoshilgan, o.boshlagan,
                (o.telegram_id IS NOT NULL) AS telegram, o.avatar
         FROM oquvchilar o
         LEFT JOIN maktablar m ON m.id = o.maktab_id
         ORDER BY m.nomi, o.sinf, o.familiya, o.ism`
      ),
      pool.query(
        `SELECT n.id, n.ism, n.familiya, n.maktab_id, m.nomi AS maktab_nomi, n.sinf,
                n.telefon, n.telefon2, n.tug, n.manzil, n.qoshilgan, n.boshlagan,
                n.chiqgan, n.izoh
         FROM nofaol_oquvchilar n
         LEFT JOIN maktablar m ON m.id = n.maktab_id
         ORDER BY m.nomi, n.sinf, n.familiya, n.ism`
      ),
      pool.query(
        `SELECT oquvchi_id, COUNT(*)::int AS soni
         FROM oqituvchi_oquvchilar GROUP BY oquvchi_id`
      ),
      pool.query('SELECT id, nomi FROM maktablar ORDER BY nomi'),
    ]);

    const tByO = new Map(ouRes.rows.map(r => [r.oquvchi_id, r.soni]));
    const map = (r, nofaol) => ({
      id: r.id, ism: r.ism, familiya: r.familiya || '',
      maktab_id: r.maktab_id, maktab_nomi: r.maktab_nomi || '',
      sinf: r.sinf || '', telefon: r.telefon || '', telefon2: r.telefon2 || '',
      tug: r.tug || '', manzil: r.manzil || '',
      qoshilgan: r.qoshilgan || '', boshlagan: r.boshlagan || '',
      nofaol,
      ...(nofaol
        ? { chiqgan: r.chiqgan || '', izoh: r.izoh || '' }
        : { telegram: !!r.telegram, avatar: r.avatar || null, oqituvchilar_soni: tByO.get(r.id) || 0 }),
    });

    res.json({
      ok: true,
      oquvchilar: [...aRes.rows.map(r => map(r, false)), ...nRes.rows.map(r => map(r, true))],
      maktablar: mRes.rows,
    });
  } catch (err) {
    console.error('GET /direktorlar/oquvchilar xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/direktorlar/adminlar — maktab adminlari ───────────────────────
router.get('/adminlar', requireAuth(['direktor']), async (req, res) => {
  try {
    const [aRes, mRes, oRes, tRes] = await Promise.all([
      pool.query(
        `SELECT a.id, a.ism, a.familiya, a.maktab_id, m.nomi AS maktab_nomi,
                (a.telegram_id IS NOT NULL) AS telegram, a.yaratilgan
         FROM adminlar a
         LEFT JOIN maktablar m ON m.id = a.maktab_id
         ORDER BY m.nomi, a.familiya, a.ism`
      ),
      pool.query('SELECT id, nomi FROM maktablar ORDER BY nomi'),
      pool.query(`SELECT maktab_id, COUNT(*)::int AS soni FROM oquvchilar
                  WHERE maktab_id IS NOT NULL GROUP BY maktab_id`),
      pool.query(`SELECT maktab_id, COUNT(*)::int AS soni FROM oqituvchi_maktablar
                  GROUP BY maktab_id`),
    ]);

    const oByM = new Map(oRes.rows.map(r => [r.maktab_id, r.soni]));
    const tByM = new Map(tRes.rows.map(r => [r.maktab_id, r.soni]));

    const adminlar = aRes.rows.map(a => ({
      id: a.id, ism: a.ism, familiya: a.familiya || '',
      maktab_id: a.maktab_id, maktab_nomi: a.maktab_nomi || null,
      telegram: !!a.telegram, yaratilgan: a.yaratilgan || '',
      oquvchilar_soni: a.maktab_id ? (oByM.get(a.maktab_id) || 0) : 0,
      oqituvchilar_soni: a.maktab_id ? (tByM.get(a.maktab_id) || 0) : 0,
    }));

    // Maktab kesimi: har bir maktab va unga biriktirilgan adminlar soni
    const adminSoniByM = new Map();
    for (const a of aRes.rows) if (a.maktab_id) adminSoniByM.set(a.maktab_id, (adminSoniByM.get(a.maktab_id) || 0) + 1);
    const maktablar = mRes.rows.map(m => ({
      id: m.id, nomi: m.nomi,
      adminlar_soni: adminSoniByM.get(m.id) || 0,
      oquvchilar_soni: oByM.get(m.id) || 0,
      oqituvchilar_soni: tByM.get(m.id) || 0,
    }));

    res.json({ ok: true, adminlar, maktablar });
  } catch (err) {
    console.error('GET /direktorlar/adminlar xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/direktorlar/buxgalterlar — buxgalterlar + maktablari ──────────
router.get('/buxgalterlar', requireAuth(['direktor']), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.id, b.ism, b.familiya, (b.telegram_id IS NOT NULL) AS telegram, b.yaratilgan,
              COALESCE(JSON_AGG(JSON_BUILD_OBJECT('id', m.id, 'nomi', m.nomi) ORDER BY m.nomi)
                       FILTER (WHERE m.id IS NOT NULL), '[]') AS maktablar
       FROM buxgalterlar b
       LEFT JOIN buxgalter_maktablar bm ON bm.buxgalter_id = b.id
       LEFT JOIN maktablar m            ON m.id = bm.maktab_id
       GROUP BY b.id
       ORDER BY b.familiya, b.ism`
    );
    res.json({
      ok: true,
      buxgalterlar: r.rows.map(b => ({
        id: b.id, ism: b.ism, familiya: b.familiya || '',
        telegram: !!b.telegram, yaratilgan: b.yaratilgan || '', maktablar: b.maktablar,
      })),
    });
  } catch (err) {
    console.error('GET /direktorlar/buxgalterlar xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/direktorlar/tolovlar?oy=YYYY-MM — oylik to'lovlar ─────────────
// Javob: oylar (mavjud oylar ro'yxati), tolovlar (qatorlar), maktablar (har
// maktab bo'yicha jami kerak / to'langan / qarz) va umumiy jami.
// oy berilmasa — bazadagi eng so'nggi oy olinadi.
router.get('/tolovlar', requireAuth(['direktor']), async (req, res) => {
  try {
    const oyRes = await pool.query('SELECT DISTINCT oy FROM tolovlar ORDER BY oy DESC');
    const oylar = oyRes.rows.map(r => r.oy);

    let oy = String(req.query.oy || '').trim();
    if (oy && !/^\d{4}-\d{2}$/.test(oy))
      return res.status(400).json({ ok: false, error: "oy formati YYYY-MM bo'lishi kerak" });
    if (!oy) oy = oylar[0] || '';
    if (!oy) return res.json({ ok: true, oy: '', oylar: [], tolovlar: [], maktablar: [], jami: { kerak: 0, tolandi: 0, qarz: 0, qarzdor: 0, soni: 0 } });

    const r = await pool.query(
      `SELECT t.id, t.oquvchi_id, t.oquvchi_ism, t.oquvchi_familiya, t.maktab_id,
              m.nomi AS maktab_nomi, t.sinf, t.telefon, t.tarif, t.qaydnoma,
              t.gaplashilgan_vaqt, t.tolov_kerak, t.tolov_qildi, t.tolov_sanasi,
              t.ehtimoliy_tolov_sanasi, t.yangilangan
       FROM tolovlar t
       LEFT JOIN maktablar m ON m.id = t.maktab_id
       WHERE t.oy = $1
       ORDER BY m.nomi, t.sinf, t.oquvchi_familiya, t.oquvchi_ism`,
      [oy]
    );

    const num = (v) => Number(v) || 0;
    const tolovlar = r.rows.map(t => {
      const kerak = num(t.tolov_kerak), tolandi = num(t.tolov_qildi);
      return { ...t, tolov_kerak: kerak, tolov_qildi: tolandi, tarif: num(t.tarif), qarz: Math.max(kerak - tolandi, 0) };
    });

    const byM = new Map();
    const jami = { kerak: 0, tolandi: 0, qarz: 0, qarzdor: 0, soni: tolovlar.length };
    for (const t of tolovlar) {
      const k = t.maktab_id ?? 0;
      if (!byM.has(k)) byM.set(k, { maktab_id: t.maktab_id, maktab_nomi: t.maktab_nomi || '—', soni: 0, kerak: 0, tolandi: 0, qarz: 0, qarzdor: 0 });
      const m = byM.get(k);
      m.soni++; m.kerak += t.tolov_kerak; m.tolandi += t.tolov_qildi; m.qarz += t.qarz;
      jami.kerak += t.tolov_kerak; jami.tolandi += t.tolov_qildi; jami.qarz += t.qarz;
      if (t.qarz > 0) { m.qarzdor++; jami.qarzdor++; }
    }

    res.json({ ok: true, oy, oylar, tolovlar, maktablar: [...byM.values()], jami });
  } catch (err) {
    console.error('GET /direktorlar/tolovlar xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/direktorlar ───────────────────────────────────────────────────
router.get('/', requireAuth(['admin']), superOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, ism, familiya, telegram_id, yaratilgan
       FROM direktorlar ORDER BY id`
    );
    res.json({ ok: true, direktorlar: r.rows });
  } catch (err) {
    console.error('GET /direktorlar xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/direktorlar ──────────────────────────────────────────────────
router.post('/', requireAuth(['admin']), superOnly, async (req, res) => {
  const ism      = (req.body.ism      || '').trim();
  const familiya = (req.body.familiya || '').trim();
  if (!ism) return res.status(400).json({ ok: false, error: 'Ism majburiy' });

  try {
    const r = await pool.query(
      `INSERT INTO direktorlar (ism, familiya, yaratilgan)
       VALUES ($1, $2, $3) RETURNING id`,
      [ism, familiya, todayUZ()]
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch (err) {
    console.error('POST /direktorlar xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── PUT /api/direktorlar/:id ───────────────────────────────────────────────
router.put('/:id', requireAuth(['admin']), superOnly, async (req, res) => {
  const id       = parseInt(req.params.id, 10);
  const ism      = (req.body.ism      || '').trim();
  const familiya = (req.body.familiya || '').trim();
  if (!id)  return res.status(400).json({ ok: false, error: 'Direktor ID kerak' });
  if (!ism) return res.status(400).json({ ok: false, error: 'Ism majburiy' });

  try {
    const r = await pool.query(
      'UPDATE direktorlar SET ism=$1, familiya=$2 WHERE id=$3',
      [ism, familiya, id]
    );
    if (r.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Direktor topilmadi' });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /direktorlar/:id xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── DELETE /api/direktorlar/:id ────────────────────────────────────────────
router.delete('/:id', requireAuth(['admin']), superOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: 'Direktor ID kerak' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Telegram birikmasini ham olib tashlaymiz — "yetim" yozuv qolmasligi uchun
    await client.query(
      'DELETE FROM telegram_users WHERE rol=$1 AND entity_id=$2',
      ['direktor', id]
    );
    const r = await client.query('DELETE FROM direktorlar WHERE id=$1', [id]);
    if (r.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Direktor topilmadi' });
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('DELETE /direktorlar/:id xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  } finally {
    client.release();
  }
});

module.exports = router;
