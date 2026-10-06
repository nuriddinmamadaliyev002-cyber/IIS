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
