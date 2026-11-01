// ═══════════════════════════════════════════════════════════════════════════
//  Sertifikat haqiqiyligini tekshirish — OCHIQ (login shart emas)
//
//  GET /api/sertifikat/tekshir/:kod
//
//  Sertifikatdagi QR kod innovateitschool.uz/sertifikat.html?k=KOD ga olib boradi,
//  sahifa shu endpointni chaqiradi. Faqat sertifikatning o'zida ko'rinadigan
//  ma'lumot qaytariladi (F.I.Sh., kurs, raqam, sana, holat) — telefon, maktab,
//  ball va boshqalar QAYTARILMAYDI. Qidiruv faqat tasodifiy tekshiruv kodi
//  bo'yicha (ketma-ket raqam bo'yicha emas) — shunda ro'yxatni terib chiqib bo'lmaydi.
// ═══════════════════════════════════════════════════════════════════════════
const { Router } = require('express');
const pool = require('../db');

const router = Router();

const oyna = new Map();                  // ip → { c, t }
setInterval(() => { const n = Date.now(); for (const [k, v] of oyna) if (v.t < n) oyna.delete(k); }, 60 * 1000).unref();
function ruxsat(ip, max = 60, ms = 60 * 1000) {
  const n = Date.now();
  let v = oyna.get(ip);
  if (!v || v.t < n) { v = { c: 0, t: n + ms }; oyna.set(ip, v); }
  return ++v.c <= max;
}

router.get('/tekshir/:kod', async (req, res) => {
  const ip = String(req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.ip || '').trim();
  if (!ruxsat(ip)) return res.status(429).json({ ok: false, error: 'Juda ko\'p so\'rov. Birozdan keyin urinib ko\'ring.' });

  const kod = String(req.params.kod || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (kod.length < 6 || kod.length > 16) return res.json({ ok: true, topildi: false });

  try {
    const r = await pool.query(
      `SELECT raqam, familiya, ism, sharif, kurs_nomi, holat,
              to_char(berilgan_sana,'DD.MM.YYYY') AS berilgan_sana
         FROM kurs_sertifikatlar WHERE tekshiruv_kodi=$1`, [kod]);
    res.set('Cache-Control', 'no-store');
    if (!r.rowCount) return res.json({ ok: true, topildi: false });
    const s = r.rows[0];
    res.json({
      ok: true, topildi: true,
      haqiqiy: s.holat === 'haqiqiy',
      sertifikat: {
        raqam: s.raqam,
        fio: [s.familiya, s.ism, s.sharif].filter(Boolean).join(' '),
        kurs_nomi: s.kurs_nomi,
        berilgan_sana: s.berilgan_sana,
        holat: s.holat,
      },
    });
  } catch (e) {
    console.error('sertifikat tekshir xatolik:', e.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

module.exports = router;
