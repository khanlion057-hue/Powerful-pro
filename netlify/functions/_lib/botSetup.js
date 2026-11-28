// v25.9 — YAGONA BOT: «Botni sozlash» va tekshiruv (Sozlamalar → Asosiy bot; Onlayn-do'kon → Telegram-bot ham shu).
//   setup — webhook (maxfiy kalit bilan) + menyu (uz va ru) + tavsif (uz va ru) + ulangan xodimlar menyusi; keyin TEKSHIRADI.
//   check — hech narsani o'zgartirmaydi: bot ishlayaptimi, webhook o'rnatilganmi, menyu va tavsif o'rnatilganmi.
// Natija (brauzerga) — faqat holat va qisqa sabab: { ok, bot:{ok,username,name,error}, webhook:{ok,error,pending}, menu:{ok,uz,ru}, description:{ok} }.
// Token, maxfiy kalit, webhook manzili ichidagi kalit — hech qachon javobga chiqmaydi.
'use strict';
const crypto = require('crypto');
const { TOKEN_RE } = require('./dailyReportRun');
const IN = require('./tgInbox');
const BT = require('./botTexts');

const NOT_FOUND = 'Bot topilmadi — BotFather’da tekshiring';
const ALLOWED = ['message', 'my_chat_member', 'channel_post'];
const hookUrl = (env) => { const b = String((env || process.env).URL || (env || process.env).DEPLOY_PRIME_URL || '').replace(/\/$/, ''); return /^https:\/\//.test(b) ? b + '/.netlify/functions/telegram-bot' : null; };
const clean = (s, n = 160) => String(s || '').replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***').slice(0, n);

// getMe: 401 (token yaroqsiz) / 404 (bot o'chirilgan) — «Bot topilmadi»; tarmoq — alohida xabar
async function botInfo(token, f) {
  if (!TOKEN_RE.test(String(token || ''))) return { ok: false, error: NOT_FOUND };
  const me = await IN.tgApi(token, 'getMe', {}, f);
  if (me && me.ok && me.result) return { ok: true, id: String(me.result.id || IN.botIdOf(token)), username: String(me.result.username || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 64), name: String(me.result.first_name || '').slice(0, 64) };
  if (me && (me.error_code === 401 || me.error_code === 404 || /unauthorized|not found/i.test(String(me.description || '')))) return { ok: false, error: NOT_FOUND };
  return { ok: false, error: 'Telegram javob bermadi — birozdan keyin qayta urinib koʻring' };
}

async function verify(admin, token, f, env) {
  const bot = await botInfo(token, f);
  if (!bot.ok) return { ok: false, bot, webhook: { ok: false }, menu: { ok: false }, description: { ok: false } };
  const want = hookUrl(env), hook = await IN.loadHook(admin);
  const [wi, cu, cr, du] = await Promise.all([
    IN.tgApi(token, 'getWebhookInfo', {}, f), IN.tgApi(token, 'getMyCommands', {}, f),
    IN.tgApi(token, 'getMyCommands', { language_code: 'ru' }, f), IN.tgApi(token, 'getMyDescription', {}, f)]);
  const info = (wi && wi.ok && wi.result) || {};
  let webhook;
  if (!want) webhook = { ok: false, error: 'Sayt manzili aniqlanmadi (URL)' };
  else if (!info.url) webhook = { ok: false, error: 'Hali oʻrnatilmagan — «Botni sozlash»ni bosing' };
  else if (info.url !== want) webhook = { ok: false, error: 'Webhook boshqa manzilga oʻrnatilgan — «Botni sozlash»ni bosing' };
  else if (!hook.secret || String(hook.bot_id) !== bot.id) webhook = { ok: false, error: 'Webhook kaliti mos emas — «Botni sozlash»ni bosing' };
  else webhook = { ok: true, pending: Number(info.pending_update_count) || 0,
    warning: info.last_error_message && Number(info.last_error_date) * 1000 > Date.now() - 3600e3 ? 'Oxirgi xato: ' + clean(info.last_error_message) : undefined };
  const has = (r) => !!(r && r.ok && Array.isArray(r.result) && r.result.some((c) => c.command === 'start'));
  const menu = { uz: has(cu), ru: has(cr) }; menu.ok = menu.uz && menu.ru;
  const description = { ok: !!(du && du.ok && du.result && String(du.result.description || '').length > 0) };
  return { ok: webhook.ok && menu.ok && description.ok, bot: { ok: true, username: bot.username, name: bot.name }, webhook, menu, description };
}

// Ulangan xodimlar chatiga xodim menyusi (eng ko'pi 30 ta — Netlify 10 s chegarasi)
async function staffMenus(admin, token, f) {
  try {
    const { data } = await admin.from('app_data').select('data').eq('id', 'tg_query_bot').maybeSingle();
    const chats = Object.keys((data && data.data && data.data.links) || {}).slice(0, 30);
    await Promise.all(chats.map((c) => IN.tgApi(token, 'setMyCommands', { commands: BT.cmds(BT.T.uz.cmdsStaff), scope: { type: 'chat', chat_id: Number(c) } }, f)));
    return chats.length;
  } catch (_) { return 0; }
}

async function setup(admin, token, brand, opts = {}) {
  const f = opts.fetchImpl, env = opts.env;
  const bot = await botInfo(token, f);
  if (!bot.ok) return { ok: false, bot, webhook: { ok: false }, menu: { ok: false }, description: { ok: false } };
  const url = hookUrl(env);
  const b = BT.brandClean(brand);
  // 1) Maxfiy kalit: shu bot uchun bor bo'lsa — o'sha (qayta bosish xavfsiz), yo'q bo'lsa — yangi. Avval saqlanadi, keyin webhook.
  const prev = await IN.loadHook(admin);
  const secret = prev.secret && String(prev.bot_id) === bot.id ? prev.secret : crypto.randomBytes(32).toString('hex');
  let whErr = null;
  if (!url) whErr = 'Sayt manzili aniqlanmadi (URL)';
  else {
    await IN.saveHook(admin, { bot_id: bot.id, username: bot.username, secret, hook: !!(prev.hook && String(prev.bot_id) === bot.id), at: new Date().toISOString() });
    const wh = await IN.tgApi(token, 'setWebhook', { url, secret_token: secret, allowed_updates: ALLOWED, drop_pending_updates: false, max_connections: 10 }, f);
    if (wh && wh.ok) await IN.saveHook(admin, { bot_id: bot.id, username: bot.username, secret, hook: true, at: new Date().toISOString() });
    else whErr = 'Webhook oʻrnatilmadi: ' + clean(wh && wh.description);
  }
  // 2) Menyu va tavsif — o'zbekcha (sukut) va ruscha
  const T = BT.T;
  await Promise.all([
    IN.tgApi(token, 'setMyCommands', { commands: BT.cmds(T.uz.cmdsCustomer) }, f),
    IN.tgApi(token, 'setMyCommands', { commands: BT.cmds(T.ru.cmdsCustomer), language_code: 'ru' }, f),
    IN.tgApi(token, 'setMyDescription', { description: T.uz.description(b).slice(0, 512) }, f),
    IN.tgApi(token, 'setMyDescription', { description: T.ru.description(b).slice(0, 512), language_code: 'ru' }, f),
    IN.tgApi(token, 'setMyShortDescription', { short_description: T.uz.short(b).slice(0, 120) }, f),
    IN.tgApi(token, 'setMyShortDescription', { short_description: T.ru.short(b).slice(0, 120), language_code: 'ru' }, f),
  ]);
  const staff = await staffMenus(admin, token, f);
  // 3) Haqiqiy holatni Telegram'dan qayta o'qib tekshirish
  const v = await verify(admin, token, f, env);
  if (whErr && v.webhook) v.webhook = { ok: false, error: whErr };
  v.ok = v.bot.ok && v.webhook.ok && v.menu.ok && v.description.ok;
  v.staffMenus = staff;
  return v;
}

module.exports = { NOT_FOUND, hookUrl, botInfo, verify, setup };
