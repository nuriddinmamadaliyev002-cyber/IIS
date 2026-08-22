// ─── Telegram routes ─────────────────────────────────────────────────────────
// GET  /api/telegram/check/:telegramId       — ID biriktirilganmi? (miniapp)
// GET  /api/telegram/check/:telegramId/:rol  — bir necha rolga bog'langanda, tanlangan rol uchun token
// POST /api/telegram/anketa              — anketa yuborish (miniapp)
// GET  /api/telegram/anketa              — so'rovlar ro'yxati (superadmin)
// PUT  /api/telegram/anketa/:id          — tasdiqlash yoki rad etish (superadmin)
// GET  /api/telegram/birikmalar          — barcha birikmalar (superadmin)
// POST /api/telegram/birikdir            — telegramID biriktirish (superadmin)
// DELETE /api/telegram/birikdir/:tgId    — telegramID ajratish (superadmin)
const { Router }      = require('express');
const pool            = require('../db');
const { requireAuth } = require('../middleware/jwt');

const router = Router();

// ─── Yordamchi: bitta telegram_users qatori uchun entity + JWT tayyorlash ────
async function buildAuthResponse(tgUser, tgId) {
  const { rol, entity_id, entity_table } = tgUser;

  let entityRes;
  if (entity_table === 'adminlar') {
    entityRes = await pool.query(
      `SELECT a.ism, a.familiya, m.nomi AS maktab_nomi, m.id AS maktab_id
       FROM adminlar a
       LEFT JOIN maktablar m ON m.id = a.maktab_id
       WHERE a.id=$1`,
      [entity_id]
    );
  } else if (entity_table === 'buxgalterlar') {
    entityRes = await pool.query(
      `SELECT b.id, b.ism, b.familiya,
              COALESCE(ARRAY_AGG(m.nomi) FILTER (WHERE m.id IS NOT NULL), '{}') AS maktablar,
              COALESCE(ARRAY_AGG(m.id)   FILTER (WHERE m.id IS NOT NULL), '{}') AS maktab_idlar
       FROM buxgalterlar b
       LEFT JOIN buxgalter_maktablar bm ON bm.buxgalter_id = b.id
       LEFT JOIN maktablar m             ON m.id = bm.maktab_id
       WHERE b.id=$1
       GROUP BY b.id`,
      [entity_id]
    );
  } else if (entity_table === 'oqituvchilar') {
    entityRes = await pool.query(
      `SELECT o.id, o.ism, o.familiya, o.fan,
              COALESCE(ARRAY_AGG(m.nomi) FILTER (WHERE m.id IS NOT NULL), '{}') AS maktablar,
              COALESCE(ARRAY_AGG(m.id)   FILTER (WHERE m.id IS NOT NULL), '{}') AS maktab_idlar
       FROM oqituvchilar o
       LEFT JOIN oqituvchi_maktablar om ON om.oqituvchi_id = o.id
       LEFT JOIN maktablar m             ON m.id = om.maktab_id
       WHERE o.id=$1
       GROUP BY o.id`,
      [entity_id]
    );
  } else if (entity_table === 'oquvchilar') {
    entityRes = await pool.query(
      `SELECT o.id, o.ism, o.familiya, m.nomi AS maktab, o.sinf, o.maktab_id
       FROM oquvchilar o
       LEFT JOIN maktablar m ON m.id = o.maktab_id
       WHERE o.id=$1`,
      [entity_id]
    );
  } else if (entity_table === 'sales_xodimlar') {
    entityRes = await pool.query(
      `SELECT s.id, s.ism, s.familiya,
              COALESCE(ARRAY_AGG(m.nomi) FILTER (WHERE m.id IS NOT NULL), '{}') AS maktablar,
              COALESCE(ARRAY_AGG(m.id)   FILTER (WHERE m.id IS NOT NULL), '{}') AS maktab_idlar
       FROM sales_xodimlar s
       LEFT JOIN sales_maktablar sm ON sm.sales_id = s.id
       LEFT JOIN maktablar m        ON m.id = sm.maktab_id
       WHERE s.id=$1
       GROUP BY s.id`,
      [entity_id]
    );
  }

  if (!entityRes || entityRes.rowCount === 0) return null;

  const { generateToken } = require('../middleware/jwt');
  const entity = entityRes.rows[0];
  const ism    = `${entity.familiya || ''} ${entity.ism}`.trim();

  const tokenPayload = {
    telegramId:  tgId,
    ism,
    rol,
    entityId:    entity_id,
    entityTable: entity_table,
    isSuper:     false,
    role:        rol,
  };

  if (rol === 'admin') {
    tokenPayload.maktabId   = entity.maktab_id;
    tokenPayload.maktabNomi = entity.maktab_nomi;
  }
  if (['oqituvchi', 'buxgalter'].includes(rol)) {
    tokenPayload.maktablar   = (entity.maktablar   || []).filter(Boolean);
    tokenPayload.maktabIdlar = (entity.maktab_idlar || []).filter(Boolean);
    tokenPayload.maktabId    = tokenPayload.maktabIdlar[0] || null;
  }
  if (rol === 'oqituvchi') {
    tokenPayload.fan = entity.fan || '';
  }
  if (rol === 'sales') {
    tokenPayload.id          = entity_id; // sales.js routelari req.user.id ga tayanadi
    tokenPayload.maktablar   = (entity.maktablar   || []).filter(Boolean);
    tokenPayload.maktabIdlar = (entity.maktab_idlar || []).filter(Boolean);
  }
  if (rol === 'oquvchi') {
    tokenPayload.maktabId = entity.maktab_id || null;
    tokenPayload.maktab   = entity.maktab    || '';
    tokenPayload.sinf     = entity.sinf      || '';
  }

  const token = generateToken(tokenPayload);

  // Rol tanlash ekranida ko'rsatiladigan nom: bitta odam bir nechta maktabga
  // admin bo'lishi mumkin bo'lgani uchun, admin uchun "10-maktab admini" kabi
  // ajralib turadigan nom qaytariladi; boshqa rollar uchun shaxsning ismi yetarli.
  const roleLabel = (rol === 'admin')
    ? (entity.maktab_nomi ? `${entity.maktab_nomi} admini` : `Admin — ${ism}`)
    : ism;

  return {
    ok:    true,
    found: true,
    rol,
    ism,
    roleLabel,
    entityId: entity_id,
    token,
    ...(rol === 'admin'      && { maktabId: entity.maktab_id, maktabNomi: entity.maktab_nomi }),
    ...(rol === 'oqituvchi'  && { maktablar: tokenPayload.maktablar, maktabIdlar: tokenPayload.maktabIdlar }),
    ...(rol === 'buxgalter'  && { maktablar: tokenPayload.maktablar }),
    ...(rol === 'sales'      && { maktablar: tokenPayload.maktablar }),
    ...(rol === 'oquvchi'    && { maktab: entity.maktab, sinf: entity.sinf }),
  };
}

// ─── GET /api/telegram/check/:telegramId ─────────────────────────────────────
// Miniapp har ochilganda shu endpointni chaqiradi
// Javob: { ok, found, rol, ism, maktablar?, sinf? }  YOKI
//        bir necha rolga bog'langan bo'lsa: { ok, found, multiple:true, roles:[{rol,ism}] }
router.get('/check/:telegramId', async (req, res) => {
  const tgId = parseInt(req.params.telegramId);
  if (!tgId) return res.status(400).json({ ok: false, error: "TelegramID noto'g'ri" });

  try {
    // telegram_users jadvalidan tekshirish — bitta odam bir nechta rolga
    // (masalan ham buxgalter, ham sales) VA bitta rol ichida bir nechta
    // entity'ga (masalan bir nechta maktabga admin) bog'langan bo'lishi mumkin
    const tgRes = await pool.query(
      'SELECT * FROM telegram_users WHERE telegram_id=$1',
      [tgId]
    );

    if (tgRes.rowCount === 0) {
      // Anketa yuborilganmi?
      const anketaRes = await pool.query(
        'SELECT holat FROM anketa_sorovlar WHERE telegram_id=$1',
        [tgId]
      );
      if (anketaRes.rowCount > 0) {
        return res.json({ ok: true, found: false, anketaHolat: anketaRes.rows[0].holat });
      }
      return res.json({ ok: true, found: false, anketaHolat: null });
    }

    // Faqat bitta birikma bo'lsa — to'g'ridan-to'g'ri token bilan javob
    if (tgRes.rowCount === 1) {
      const result = await buildAuthResponse(tgRes.rows[0], tgId);
      if (!result) return res.status(404).json({ ok: false, error: "Foydalanuvchi ma'lumoti topilmadi" });
      return res.json(result);
    }

    // Bir nechta birikma (rol va/yoki entity bo'yicha) — tanlov ro'yxatini
    // qaytaramiz, token YO'Q (token faqat aniq birikma tanlangandan keyin
    // /check/:telegramId/:rol/:entityId orqali beriladi)
    const roles = [];
    for (const row of tgRes.rows) {
      const info = await buildAuthResponse(row, tgId);
      if (info) roles.push({ rol: info.rol, ism: info.ism, roleLabel: info.roleLabel, entityId: info.entityId });
    }
    if (roles.length === 0)
      return res.status(404).json({ ok: false, error: "Foydalanuvchi ma'lumoti topilmadi" });
    if (roles.length === 1) {
      // Boshqa birikmalar entity topilmadi bilan tugagan bo'lishi mumkin — yagona qolganini beramiz
      const row = tgRes.rows.find(r => r.rol === roles[0].rol && r.entity_id === roles[0].entityId);
      const result = await buildAuthResponse(row, tgId);
      return res.json(result);
    }

    res.json({ ok: true, found: true, multiple: true, roles });

  } catch (err) {
    console.error('telegram/check xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/telegram/check/:telegramId/:rol/:entityId ──────────────────────
// Bir nechta birikmaga ega foydalanuvchi Mini App'da aniq birikmani
// (masalan aynan qaysi maktab admini) tanlagandan keyin shu birikma uchun
// JWT token olish uchun chaqiriladi.
router.get('/check/:telegramId/:rol/:entityId', async (req, res) => {
  const tgId    = parseInt(req.params.telegramId);
  const rol     = req.params.rol;
  const entityId = parseInt(req.params.entityId);
  if (!tgId) return res.status(400).json({ ok: false, error: "TelegramID noto'g'ri" });

  try {
    const tgRes = await pool.query(
      'SELECT * FROM telegram_users WHERE telegram_id=$1 AND rol=$2 AND entity_id=$3',
      [tgId, rol, entityId]
    );
    if (tgRes.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Bu birikma topilmadi' });

    const result = await buildAuthResponse(tgRes.rows[0], tgId);
    if (!result) return res.status(404).json({ ok: false, error: "Foydalanuvchi ma'lumoti topilmadi" });
    res.json(result);
  } catch (err) {
    console.error('telegram/check/:rol/:entityId xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/telegram/check/:telegramId/:rol ─────────────────────────────────
// Eskiroq mini-app versiyalari bilan orqaga moslik uchun: entityId
// berilmasa, shu rol bo'yicha BIRINCHI topilgan birikmani qaytaradi.
router.get('/check/:telegramId/:rol', async (req, res) => {
  const tgId = parseInt(req.params.telegramId);
  const rol  = req.params.rol;
  if (!tgId) return res.status(400).json({ ok: false, error: "TelegramID noto'g'ri" });

  try {
    const tgRes = await pool.query(
      'SELECT * FROM telegram_users WHERE telegram_id=$1 AND rol=$2 ORDER BY id LIMIT 1',
      [tgId, rol]
    );
    if (tgRes.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Bu rol uchun birikma topilmadi' });

    const result = await buildAuthResponse(tgRes.rows[0], tgId);
    if (!result) return res.status(404).json({ ok: false, error: "Foydalanuvchi ma'lumoti topilmadi" });
    res.json(result);
  } catch (err) {
    console.error('telegram/check/:rol xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/telegram/anketa ───────────────────────────────────────────────
// Miniapp dan kelgan anketa ma'lumotlari saqlanadi
router.post('/anketa', async (req, res) => {
  const { telegramId, telegramIsm, pozitsiya, fan, fish, maktablar, sinf, telefon } = req.body;

  if (!telegramId || !fish?.trim() || !telefon?.trim() || !pozitsiya?.trim()) {
    return res.status(400).json({ ok: false, error: "Barcha majburiy maydonlar to'ldirilmagan" });
  }

  try {
    // Allaqachon biriktirilgan bo'lsa
    const tgCheck = await pool.query(
      'SELECT id FROM telegram_users WHERE telegram_id=$1', [telegramId]
    );
    if (tgCheck.rowCount > 0) {
      return res.status(409).json({ ok: false, error: "Bu Telegram ID allaqachon tizimda ro'yxatdan o'tgan" });
    }

    // fan ustuni yo'q bo'lsa ham xatolik chiqmasligi uchun ALTER TABLE (birinchi marta)
    await pool.query(`
      ALTER TABLE anketa_sorovlar ADD COLUMN IF NOT EXISTS fan TEXT DEFAULT ''
    `).catch(() => {});

    // Anketa saqlash (mavjud bo'lsa yangilash) — id ni qaytarish
    const sorovRes = await pool.query(
      `INSERT INTO anketa_sorovlar (telegram_id, telegram_ism, pozitsiya, fan, fish, maktablar, sinf, telefon, holat)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'kutilmoqda')
       ON CONFLICT (telegram_id) DO UPDATE SET
         telegram_ism = EXCLUDED.telegram_ism,
         pozitsiya    = EXCLUDED.pozitsiya,
         fan          = EXCLUDED.fan,
         fish         = EXCLUDED.fish,
         maktablar    = EXCLUDED.maktablar,
         sinf         = EXCLUDED.sinf,
         telefon      = EXCLUDED.telefon,
         holat        = 'kutilmoqda',
         yuborilgan   = TO_CHAR(NOW(), 'DD.MM.YYYY HH24:MI')
       RETURNING id`,
      [telegramId, telegramIsm || '', pozitsiya.trim(), fan || '',
       fish.trim(), maktablar || '', sinf || '-', telefon.trim()]
    );
    const sorovId = sorovRes.rows[0].id;

    // Bot orqali superadminga xabar yuborish (inline tugmalar bilan)
    await notifySuperAdmin({ sorovId, telegramId, telegramIsm, pozitsiya, fan, fish, maktablar, sinf, telefon });

    res.json({ ok: true });
  } catch (err) {
    console.error('anketa saqlash xatolik:', err.message);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/telegram/anketa — so'rovlar ro'yxati (superadmin) ──────────────
router.get('/anketa', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });

  try {
    const { holat } = req.query; // ?holat=kutilmoqda | tasdiqlandi | rad etildi
    const params = [];
    let where = '';
    if (holat) { where = 'WHERE holat=$1'; params.push(holat); }

    const result = await pool.query(
      `SELECT * FROM anketa_sorovlar ${where} ORDER BY yuborilgan DESC`,
      params
    );
    res.json({ ok: true, sorovlar: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── PUT /api/telegram/anketa/:id — tasdiqlash yoki rad etish ────────────────
// JWT token (superadmin panel) YOKI BOT_SECRET header (bot callback) bilan ishlaydi
router.put('/anketa/:id', async (req, res) => {
  // Bot so'rovi — X-Bot-Secret header bilan
  const botSecret = req.headers['x-bot-secret'];
  const isBotReq  = botSecret && botSecret === (process.env.BOT_SECRET || 'bot-ichki-so\'rov');

  // JWT so'rovi — superadmin paneldan
  if (!isBotReq) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ ok: false, error: 'Token kerak' });
    try {
      const { verifyToken } = require('../middleware/jwt');
      const user = verifyToken(authHeader.replace('Bearer ', ''));
      if (!user.isSuper) return res.status(403).json({ ok: false, error: 'Faqat superadmin' });
    } catch (e) {
      return res.status(401).json({ ok: false, error: 'Token noto\'g\'ri' });
    }
  }

  const id    = parseInt(req.params.id);
  const holat = req.body.holat; // 'tasdiqlandi' yoki 'rad etildi'

  if (!['tasdiqlandi', 'rad etildi'].includes(holat))
    return res.status(400).json({ ok: false, error: "holat: 'tasdiqlandi' yoki 'rad etildi' bo'lishi kerak" });

  try {
    const result = await pool.query(
      `UPDATE anketa_sorovlar SET holat=$1 WHERE id=$2 RETURNING telegram_id, telegram_ism`,
      [holat, id]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: "So'rov topilmadi" });

    const { telegram_id, telegram_ism } = result.rows[0];

    // Foydalanuvchiga bot orqali xabar yuborish
    await notifyUser(telegram_id, holat);

    res.json({ ok: true, telegram_id, holat });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/telegram/kandidat-log — bot guruh a'zosini qayd qiladi ─────────
// BOT_SECRET header orqali himoyalangan (bot.js dagi X-Bot-Secret bilan bir xil kalit)
router.post('/kandidat-log', async (req, res) => {
  const botSecret = req.headers['x-bot-secret'];
  const expected   = process.env.BOT_SECRET || 'bot-ichki-so\'rov';
  if (botSecret !== expected) {
    return res.status(403).json({ ok: false, error: 'Ruxsat yo\'q' });
  }

  const { telegramId, telegramIsm, telegramUsername } = req.body;
  if (!telegramId) return res.status(400).json({ ok: false, error: 'telegramId majburiy' });

  try {
    await pool.query(
      `INSERT INTO telegram_kandidatlar (telegram_id, telegram_ism, telegram_username, oxirgi_faollik)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (telegram_id) DO UPDATE
       SET telegram_ism = EXCLUDED.telegram_ism,
           telegram_username = EXCLUDED.telegram_username,
           oxirgi_faollik = NOW()`,
      [telegramId, telegramIsm || null, telegramUsername || null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/telegram/kandidatlar — hali biriktirilmagan guruh a'zolari ──────
router.get('/kandidatlar', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });

  try {
    const result = await pool.query(
      `SELECT k.telegram_id, k.telegram_ism, k.telegram_username, k.oxirgi_faollik
       FROM telegram_kandidatlar k
       LEFT JOIN telegram_users tu ON tu.telegram_id = k.telegram_id
       WHERE tu.id IS NULL
       ORDER BY k.oxirgi_faollik DESC
       LIMIT 200`
    );
    res.json({ ok: true, kandidatlar: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── GET /api/telegram/birikmalar — barcha birikmalar (superadmin) ────────────
router.get('/birikmalar', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });

  try {
    const result = await pool.query(
      `SELECT
         tu.id,
         tu.telegram_id,
         tu.telegram_ism,
         tu.rol,
         tu.entity_id,
         tu.entity_table,
         tu.biriktirilgan,
         CASE
           WHEN tu.entity_table = 'adminlar'      THEN (SELECT ism||' '||familiya FROM adminlar      WHERE id=tu.entity_id)
           WHEN tu.entity_table = 'buxgalterlar'  THEN (SELECT ism||' '||familiya FROM buxgalterlar  WHERE id=tu.entity_id)
           WHEN tu.entity_table = 'oqituvchilar'  THEN (SELECT ism||' '||familiya FROM oqituvchilar  WHERE id=tu.entity_id)
           WHEN tu.entity_table = 'oquvchilar'    THEN (SELECT ism||' '||familiya FROM oquvchilar    WHERE id=tu.entity_id)
           WHEN tu.entity_table = 'sales_xodimlar' THEN (SELECT ism||' '||familiya FROM sales_xodimlar WHERE id=tu.entity_id)
         END AS fish
       FROM telegram_users tu
       ORDER BY tu.biriktirilgan DESC`
    );
    res.json({ ok: true, birikmalar: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── POST /api/telegram/birikdir — telegramID biriktirish (superadmin) ────────
router.post('/birikdir', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });

  const { telegramId, telegramIsm, rol, entityId } = req.body;

  if (!telegramId || !rol || !entityId)
    return res.status(400).json({ ok: false, error: "telegramId, rol, entityId majburiy" });

  const tableMappings = {
    admin:      'adminlar',
    buxgalter:  'buxgalterlar',
    oqituvchi:  'oqituvchilar',
    oquvchi:    'oquvchilar',
    sales:      'sales_xodimlar',
  };
  const entityTable = tableMappings[rol];
  if (!entityTable)
    return res.status(400).json({ ok: false, error: "Noto'g'ri rol" });

  try {
    // Entity mavjudligini tekshirish
    const entityCheck = await pool.query(
      `SELECT id FROM ${entityTable} WHERE id=$1`, [entityId]
    );
    if (entityCheck.rowCount === 0)
      return res.status(404).json({ ok: false, error: "Foydalanuvchi topilmadi" });

    // Biriktirish — (telegram_id, rol, entity_id) uchligi bo'yicha upsert,
    // shunda bitta odam bir nechta rolga (masalan ham buxgalter, ham sales)
    // VA bitta rol ichida bir nechta entity'ga (masalan bir nechta maktabga
    // admin) bog'lana oladi
    await pool.query(
      `INSERT INTO telegram_users (telegram_id, telegram_ism, rol, entity_id, entity_table)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (telegram_id, rol, entity_id) DO UPDATE SET
         telegram_ism  = EXCLUDED.telegram_ism,
         entity_table  = EXCLUDED.entity_table,
         biriktirilgan = TO_CHAR(NOW(), 'DD.MM.YYYY')`,
      [telegramId, telegramIsm || '', rol, entityId, entityTable]
    );

    // Tegishli jadvalda ham telegram_id ni yangilash
    await pool.query(
      `UPDATE ${entityTable} SET telegram_id=$1 WHERE id=$2`,
      [telegramId, entityId]
    );

    // Anketa bo'lsa tasdiqlandi deb belgilash
    await pool.query(
      `UPDATE anketa_sorovlar SET holat='tasdiqlandi' WHERE telegram_id=$1`,
      [telegramId]
    );

    // Foydalanuvchiga xabar yuborish
    await notifyUser(telegramId, 'tasdiqlandi');

    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ ok: false, error: "Bu TelegramID allaqachon biriktirilgan" });
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── DELETE /api/telegram/birikdir/:tgId — ajratish (superadmin) ─────────────
//  ?rol=admin&entityId=5 kabi query bo'lsa — FAQAT o'sha aniq birikmani
//  ajratadi (bitta odam bir nechta rolga, va bitta rol ichida bir nechta
//  entity'ga bog'langan bo'lishi mumkinligi uchun). Faqat ?rol= berilsa —
//  o'sha rolga tegishli BARCHA birikmalarni ajratadi. Hech narsa berilmasa —
//  shu telegram_id ga tegishli BARCHA rollarni ajratadi.
router.delete('/birikdir/:tgId', requireAuth(['admin']), async (req, res) => {
  if (!req.user.isSuper)
    return res.status(403).json({ ok: false, error: 'Faqat superadmin' });

  const tgId     = parseInt(req.params.tgId);
  const rol      = req.query.rol || null;
  const entityId = req.query.entityId ? parseInt(req.query.entityId) : null;

  try {
    let whereSql = 'telegram_id=$1';
    const params = [tgId];
    if (rol)      { params.push(rol);      whereSql += ` AND rol=$${params.length}`; }
    if (entityId) { params.push(entityId); whereSql += ` AND entity_id=$${params.length}`; }

    const tgRes = await pool.query(
      `SELECT entity_id, entity_table FROM telegram_users WHERE ${whereSql}`,
      params
    );
    if (tgRes.rowCount === 0)
      return res.status(404).json({ ok: false, error: 'Birikma topilmadi' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const { entity_id, entity_table } of tgRes.rows) {
        // Boshqa maktablarga ham admin bo'lgan bo'lsa (adminlar jadvalida
        // shu telegram_id BOSHQA qatorda ham bo'lishi mumkin), faqat aynan
        // shu entity qatorining telegram_id ustunini tozalaymiz.
        await client.query(`UPDATE ${entity_table} SET telegram_id=NULL WHERE id=$1`, [entity_id]);
      }

      await client.query(`DELETE FROM telegram_users WHERE ${whereSql}`, params);

      // Anketa holatini "rad etildi" ga o'zgartirish
      await client.query(
        `UPDATE anketa_sorovlar SET holat='rad etildi' WHERE telegram_id=$1`,
        [tgId]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

// ─── Yordamchi: superadminga bot xabari (inline tugmalar bilan) ──────────────
async function notifySuperAdmin({ sorovId, telegramId, telegramIsm, pozitsiya, fish, maktablar, sinf, telefon }) {
  // Superadmin faqat web panel orqali so'rovlarni ko'radi.
  // Telegram xabari yuborilmaydi.
}

// ─── Yordamchi: foydalanuvchiga bot xabari ───────────────────────────────────
async function notifyUser(telegramId, holat) {
  try {
    const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
    const MINIAPP_URL = process.env.MINIAPP_URL;
    if (!BOT_TOKEN) return;

    const matn = holat === 'tasdiqlandi'
      ? `✅ *So'rovingiz tasdiqlandi!*\n\nInnovateIT School tizimiga kirishingiz mumkin.\nQuyidagi tugmani bosing:`
      : `❌ *So'rovingiz rad etildi.*\n\nQo'shimcha ma'lumot uchun administratorga murojaat qiling.`;

    const body = {
      chat_id:    telegramId,
      text:       matn,
      parse_mode: 'Markdown',
    };

    // Tasdiqlanganda Mini App tugmasi ham yuboriladi
    if (holat === 'tasdiqlandi' && MINIAPP_URL) {
      body.reply_markup = {
        inline_keyboard: [[
          { text: '📱 Mini Appni ochish', web_app: { url: MINIAPP_URL } }
        ]]
      };
    }

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e) {
    console.error('notifyUser xatolik:', e.message);
  }
}

module.exports = router;