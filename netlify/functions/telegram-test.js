// Netlify Function — Telegram botini SINASH (v23). Faqat administrator.
//
// Avval Sozlamalar oynasi bot tokeni bilan Telegram API'ga BRAUZERDAN murojaat qilardi —
// token admin brauzerida (va JSON'da) ochiq turardi. Endi token brauzerga umuman
// yuborilmaydi (app-data-load faqat "o'rnatilgan" belgisini beradi); sinov xabari shu
// server funksiyasidan yuboriladi.
//
// POST { token?, chatId? } — token berilmasa serverdagi saqlangan token ishlatiladi
// v25: POST { action:'me', token? } — bot nomi; { action:'find_chats', token? } — bot qo'shilgan guruh/kanallar
// (yangi tokenni saqlashdan oldin sinash uchun token yuborish mumkin).
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');

const TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{20,}$/;
const CHAT_RE = /^-?\d{3,20}$|^@[A-Za-z0-9_]{4,64}$/;

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const body = parseBody(event);
  if (!body || typeof body !== 'object') return json({ error: "Noto'g'ri so'rov formati" }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'telegram-test', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { requireAdmin: true, fn: 'telegram-test' });
  if (!auth.ok) return auth.response;

  try {
    const { data: row, error } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
    if (error) throw error;
    const st = (row && row.data && row.data.settings) || {};
    const token = body.token ? String(body.token).trim() : (st.tgBotToken || '');
    const chatId = body.chatId ? String(body.chatId).trim() : (st.tgChatId || '');
    // v25: oson ulash — 1) bot tokenini tekshirish (getMe), 2) bot qo'shilgan guruh/kanallarni topish (getUpdates).
    // Chat ID'ni qo'lda qidirish shart emas. Token javobga hech qachon qo'shilmaydi.
    if (body.action === 'me' || body.action === 'find_chats') {
      if (!token) return json({ ok: false, error: 'Bot tokeni kerak' }, 400);
      if (!TOKEN_RE.test(token)) return json({ ok: false, error: "Token formati noto'g'ri — @BotFather bergan to'liq tokenni qo'ying" }, 400);
      const call = async (method, payload) => {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
        try {
          const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify(payload || {}) });
          return await r.json().catch(() => ({}));
        } finally { clearTimeout(t); }
      };
      const me = await call('getMe');
      if (!me || !me.ok) return json({ ok: false, error: me && me.error_code === 401 ? "Token yaroqsiz — @BotFather'dan qayta nusxalang" : String((me && me.description) || 'Telegram javob bermadi').slice(0, 200) }, 200);
      const bot = { username: String(me.result.username || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 64), name: String(me.result.first_name || '').slice(0, 64) };
      if (body.action === 'me') return json({ ok: true, bot }, 200);
      const up = await call('getUpdates', { limit: 100, allowed_updates: ['my_chat_member', 'message', 'channel_post'] });
      if (!up || !up.ok) return json({ ok: false, bot, error: String((up && up.description) || 'Yangilanishlar olinmadi').slice(0, 200) }, 200);
      const chats = new Map();
      for (const u of up.result || []) {
        const m = u.my_chat_member, c = (m && m.chat) || (u.message && u.message.chat) || (u.channel_post && u.channel_post.chat);
        if (!c || c.type === 'private') continue;
        const status = m && m.new_chat_member ? m.new_chat_member.status : null;
        const left = status === 'left' || status === 'kicked';
        const prev = chats.get(String(c.id));
        if (left) { chats.delete(String(c.id)); continue; }
        chats.set(String(c.id), { id: String(c.id), title: String(c.title || c.username || c.id).slice(0, 80), type: c.type,
          username: c.username ? String(c.username).replace(/[^A-Za-z0-9_]/g, '').slice(0, 64) : null,
          admin: status ? status === 'administrator' : !!(prev && prev.admin) });
      }
      return json({ ok: true, bot, chats: [...chats.values()].slice(0, 20) }, 200);
    }
    if (!token || !chatId) return json({ ok: false, error: 'Token va Chat ID kerak' }, 400);
    if (!TOKEN_RE.test(token)) return json({ ok: false, error: "Token formati noto'g'ri" }, 400);
    if (!CHAT_RE.test(chatId)) return json({ ok: false, error: "Chat ID formati noto'g'ri" }, 400);

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    let tg;
    try {
      const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ chat_id: chatId, text: `✅ ${String(st.company || 'ERP').slice(0, 60)}: bot ulandi` }),
      });
      tg = await r.json().catch(() => ({}));
    } finally { clearTimeout(t); }
    // Telegram javobidan faqat holat va tavsif qaytadi — token hech qachon javobga qo'shilmaydi
    return json({ ok: !!(tg && tg.ok), description: tg && !tg.ok ? String(tg.description || 'xato').slice(0, 200) : undefined }, 200);
  } catch (e) {
    return serverError(e, 'telegram-test', "Telegramga ulanib bo'lmadi");
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('telegram-test', exports.handler);
