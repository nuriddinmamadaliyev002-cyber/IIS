// ═══════════════════════════════════════════════════════════════════════════
//  Telegram Mini App initData imzosini tekshirish
//  https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//
//  .env:  TELEGRAM_BOT_TOKEN=<bot tokeni>   (telegram-bot/.env dagi bilan bir xil)
//
//  Mini App `window.Telegram.WebApp.initData` ni yuboradi; unda foydalanuvchi
//  ma'lumoti bot tokeni bilan HMAC-SHA256 imzolangan. Shu tekshiruvsiz Telegram
//  ID'ni mijoz o'zi yozib yuborishi mumkin (boshqa odam nomidan kirish).
// ═══════════════════════════════════════════════════════════════════════════
const crypto = require('crypto');

const MAX_YOSH_SONIYA = 24 * 60 * 60;   // initData 24 soatdan eski bo'lmasin

class InitDataXato extends Error {
  constructor(msg, kod) { super(msg); this.kod = kod; }   // kod: 'sozlanmagan' | 'yaroqsiz'
}

function tekshir(initData) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new InitDataXato('TELEGRAM_BOT_TOKEN sozlanmagan', 'sozlanmagan');
  if (!initData || typeof initData !== 'string' || initData.length > 4096) {
    throw new InitDataXato('initData yo\'q', 'yaroqsiz');
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new InitDataXato('initData imzosi yo\'q', 'yaroqsiz');
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secret   = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const kutilgan = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const a = Buffer.from(kutilgan, 'hex');
  let b;
  try { b = Buffer.from(hash, 'hex'); } catch (_) { b = Buffer.alloc(0); }
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new InitDataXato('initData imzosi noto\'g\'ri', 'yaroqsiz');
  }

  const authDate = parseInt(params.get('auth_date'), 10);
  if (!authDate || Math.floor(Date.now() / 1000) - authDate > MAX_YOSH_SONIYA) {
    throw new InitDataXato('initData eskirgan, Mini App\'ni qayta oching', 'yaroqsiz');
  }

  let user;
  try { user = JSON.parse(params.get('user') || ''); } catch (_) { user = null; }
  if (!user || !Number.isSafeInteger(user.id)) throw new InitDataXato('Foydalanuvchi ma\'lumoti yo\'q', 'yaroqsiz');

  return { id: user.id, ism: [user.first_name, user.last_name].filter(Boolean).join(' '), user };
}

// Express handler ichida qulay ishlatish uchun: xato bo'lsa javob yuboradi va null qaytaradi
function tekshirYoki(req, res) {
  try {
    return tekshir(req.body && req.body.initData);
  } catch (e) {
    if (e instanceof InitDataXato) {
      const holat = e.kod === 'sozlanmagan' ? 501 : 401;
      res.status(holat).json({ ok: false, error: e.message, notConfigured: e.kod === 'sozlanmagan' });
      return null;
    }
    throw e;
  }
}

module.exports = { tekshir, tekshirYoki, InitDataXato };
