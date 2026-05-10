require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN      = process.env.TELEGRAM_BOT_TOKEN;
const MINIAPP_URL    = process.env.MINIAPP_URL;
const SUPER_ADMIN_ID = Number(process.env.SUPER_ADMIN_TELEGRAM_ID);
const API_BASE       = process.env.API_BASE || 'http://localhost:3001/api';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ─── Bot qo'shilgan guruhlar ──────────────────────────────────────────────────
const activeGroups = new Set();

// Restart dan keyin .env dagi guruhlarni yuklash
if (process.env.SAVED_GROUPS) {
  process.env.SAVED_GROUPS.split(',')
    .map(id => parseInt(id.trim()))
    .filter(Boolean)
    .forEach(id => {
      activeGroups.add(id);
      console.log(`📌 Saqlangan guruh yuklandi: ${id}`);
    });
}

bot.on('my_chat_member', async (update) => {
  const chat    = update.chat;
  const addedBy = update.from;
  const status  = update.new_chat_member.status;

  if (!['group', 'supergroup'].includes(chat.type)) return;

  if (['member', 'administrator'].includes(status)) {
    if (addedBy.id !== SUPER_ADMIN_ID) {
      console.log(`⛔ Ruxsatsiz: ${addedBy.username || addedBy.id} → ${chat.title}`);
      await bot.leaveChat(chat.id);
      return;
    }
    activeGroups.add(chat.id);
    console.log(`✅ Guruhga qo'shildi: ${chat.title} (${chat.id})`);
    console.log(`💾 .env ga qo'shing: SAVED_GROUPS=${[...activeGroups].join(',')}`);

  } else if (['left', 'kicked'].includes(status)) {
    activeGroups.delete(chat.id);
    console.log(`❌ Guruhdan chiqdi: ${chat.title} (${chat.id})`);
  }
});

// Restart dan keyin guruhlarni tiklash
bot.on('message', (msg) => {
  if (['group', 'supergroup'].includes(msg.chat.type)) {
    activeGroups.add(msg.chat.id);
  }
});

// ─── Guruh a'zoligini tekshirish ─────────────────────────────────────────────
async function isGroupMember(userId) {
  if (activeGroups.size === 0) return false;
  for (const groupId of activeGroups) {
    try {
      const m = await bot.getChatMember(groupId, userId);
      if (['creator', 'administrator', 'member'].includes(m.status)) return true;
    } catch (_) {}
  }
  return false;
}

// ─── /start ──────────────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  // Faqat shaxsiy chat
  if (msg.chat.type !== 'private') return;

  const allowed = await isGroupMember(userId);
  if (!allowed) {
    return bot.sendMessage(chatId,
      '⛔ Kechirasiz, bu botdan faqat guruh a\'zolari foydalana oladi.'
    );
  }

  const ism = msg.from.first_name || 'Foydalanuvchi';
  bot.sendMessage(chatId,
    `Assalomu alaykum, *${ism}*! 👋\n\nInnovateIT School boshqaruv tizimiga kirish uchun quyidagi tugmani bosing:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '📱 Mini Appni ochish', web_app: { url: MINIAPP_URL } }
        ]]
      }
    }
  );
});

// ─── /miniapp ────────────────────────────────────────────────────────────────
bot.onText(/\/miniapp/, async (msg) => {
  if (msg.chat.type !== 'private') return;
  const allowed = await isGroupMember(msg.from.id);
  if (!allowed) return bot.sendMessage(msg.chat.id, '⛔ Ruxsat yo\'q.');

  bot.sendMessage(msg.chat.id, '🚀 Mini Appni ochish:', {
    reply_markup: {
      inline_keyboard: [[
        { text: '📱 InnovateIT Mini App', web_app: { url: MINIAPP_URL } }
      ]]
    }
  });
});

// ─── CALLBACK QUERY — Superadmin tugmalari ───────────────────────────────────
// Tugma formati: "approve:sorovId:telegramId" yoki "reject:sorovId:telegramId"
bot.on('callback_query', async (query) => {
  const from = query.from;
  const data = query.data || '';

  // Faqat superadmin bosishi mumkin
  if (from.id !== SUPER_ADMIN_ID) {
    return bot.answerCallbackQuery(query.id, { text: '⛔ Ruxsat yo\'q', show_alert: true });
  }

  const [action, sorovId, tgId] = data.split(':');
  if (!['approve', 'reject'].includes(action) || !sorovId) {
    return bot.answerCallbackQuery(query.id);
  }

  const holat = action === 'approve' ? 'tasdiqlandi' : 'rad etildi';

  try {
    // Backendga so'rov holatini yangilash
    const res = await fetch(`${API_BASE}/telegram/anketa/${sorovId}`, {
      method:  'PUT',
      headers: {
        'Content-Type':  'application/json',
        'X-Bot-Secret':  process.env.BOT_SECRET || 'bot-ichki-so\'rov',
      },
      body: JSON.stringify({ holat })
    });
    const result = await res.json();

    if (result.ok) {
      // Xabarni yangilash — tugmalar o'rniga natija ko'rinadi
      const label = holat === 'tasdiqlandi'
        ? '✅ *Tasdiqlandi*'
        : '❌ *Rad etildi*';

      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: query.message.chat.id, message_id: query.message.message_id }
      );
      await bot.editMessageText(
        query.message.text + `\n\n${label} — @${from.username || from.first_name}`,
        {
          chat_id:    query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
        }
      );

      await bot.answerCallbackQuery(query.id, {
        text: holat === 'tasdiqlandi' ? '✅ Tasdiqlandi!' : '❌ Rad etildi',
        show_alert: false
      });
    } else {
      await bot.answerCallbackQuery(query.id, {
        text: '❌ Xatolik: ' + (result.error || 'Noma\'lum'),
        show_alert: true
      });
    }
  } catch (e) {
    console.error('callback_query xatolik:', e.message);
    await bot.answerCallbackQuery(query.id, {
      text: '❌ Server bilan ulanib bo\'lmadi',
      show_alert: true
    });
  }
});

// ─── Superadminga anketa xabari yuborish (backend tomonidan chaqiriladi) ──────
// Bu funksiya to'g'ridan-to'g'ri ishlatilmaydi — backend /api/telegram/anketa
// endpointida fetch orqali Telegram API ga xabar yuboradi.
// Lekin bot.js orqali ham eksport qilish mumkin (agar bitta processda bo'lsa).

bot.on('polling_error', (err) => console.error('Polling xatolik:', err.message));

console.log('🤖 InnovateIT Bot ishga tushdi');

// ─── .env yangilash eslatmasi ─────────────────────────────────────────────────
// BOT_SECRET — backend va bot o'rtasidagi ichki so'rovlar uchun maxfiy kalit
// API_BASE   — backendning manzili (masalan http://localhost:3001/api)