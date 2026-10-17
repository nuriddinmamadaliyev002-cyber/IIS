// ─── Chat faylini imzolangan havola orqali berish ─────────────────────────────────
//
//  GET /api/chat/f/:token[?yuklash=1]
//
//  Token: /api/chat/xabarlar/:id/fayl-url (1:1) yoki /api/chat/guruh/xabarlar/:id/fayl-url
//  (guruh) javobida beriladi, 5 daqiqa amal qiladi, HMAC bilan imzolangan. Bu route JWT
//  header TALAB QILMAYDI — <audio src>, <img src> va yuklab olish havolasi header yubora
//  olmaydi. Lekin token berilgandan keyin ham a'zolik har ochilishda QAYTA tekshiriladi
//  (o'quvchi guruhdan chiqarilsa, eski havola ham ishlamay qoladi).
//  Range so'rovlari qo'llab-quvvatlanadi (audio ijro/oldinga o'tkazish, iOS Safari).
const { Router } = require('express');
const pool = require('../db');
const { biriktirilganmi, guruhgaKirish } = require('./chatAccess');
const { imzoTekshir, faylYubor } = require('./chatFayl');

const router = Router();

router.get('/:token', async (req, res) => {
  const t = imzoTekshir(req.params.token);
  if (!t || !['d', 'g'].includes(t.t) || !['oqituvchi', 'oquvchi'].includes(t.r)
      || !Number.isInteger(t.i) || !Number.isInteger(t.u))
    return res.status(403).json({ ok: false, error: 'Havola yaroqsiz yoki muddati tugagan' });

  const me = { rol: t.r, id: t.u };
  try {
    let row;
    if (t.t === 'd') {
      const r = await pool.query(
        `SELECT oqituvchi_id, oquvchi_id, fayl_yol, fayl_nomi
           FROM chat_xabarlar WHERE id = $1 AND ochirilgan IS NULL AND fayl_yol IS NOT NULL`,
        [t.i]
      );
      row = r.rows[0];
      if (!row) return res.status(404).json({ ok: false, error: 'Fayl topilmadi' });
      const mening = me.rol === 'oqituvchi' ? row.oqituvchi_id : row.oquvchi_id;
      if (mening !== me.id || !(await biriktirilganmi(row.oqituvchi_id, row.oquvchi_id)))
        return res.status(403).json({ ok: false, error: 'Ruxsat yo\'q' });
    } else {
      const r = await pool.query(
        `SELECT guruh_id, fayl_yol, fayl_nomi
           FROM chat_guruh_xabarlar WHERE id = $1 AND ochirilgan IS NULL AND fayl_yol IS NOT NULL`,
        [t.i]
      );
      row = r.rows[0];
      if (!row) return res.status(404).json({ ok: false, error: 'Fayl topilmadi' });
      if (!(await guruhgaKirish(me, row.guruh_id)))
        return res.status(403).json({ ok: false, error: 'Ruxsat yo\'q' });
    }
    faylYubor(res, row, { yuklash: req.query.yuklash === '1', cache: 'private, max-age=300' });
  } catch (err) {
    console.error('chat/f xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

module.exports = router;
