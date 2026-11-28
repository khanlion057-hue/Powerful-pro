// Netlify Function — v25.9: YAGONA TELEGRAM BOT (asosiy, hisobot boti — settings.tgBotToken). Botning YAGONA kirish nuqtasi.
//   Telegram (webhook, x-telegram-bot-api-secret-token): xabar → tg_inbox (59) → yo'naltirish:
//     /start cus…   — mijozni bog'lash (darhol; tasdiq xabari)          [_lib/tgCustomers]
//     /start pw…    — xodim parolini tiklash uchun ulash (ilovadagi «Tekshirish» qutidan o'qiydi)
//     /start inv…   — investorni ulash (ilovadagi «Tekshirish» qutidan o'qiydi)
//     /start 12345678 — xodimni so'rov buyruqlariga ulash (ilovadagi «Telegramda ulash»)      [_lib/tgQuery]
//     /foyda … /yordam — FAQAT ulangan xodim chatida (ruxsat va filial cheklovi bilan)
//     /start        — salom (xaridor) yoki «xodim sifatida ulangansiz»
//     /help         — xaridor yordami
//     boshqa buyruq — faqat «Bu buyruq mavjud emas» (xaridorga ichki ma'lumot aytilmaydi)
//   Guruh/kanal yangilanishlari — faqat qutiga (guruhlarni topish uchun), javob yo'q.
// Doim 200 (Telegram qayta yubormasin); takroriy yetkazish — (bot_id, update_id) noyob, ikkinchi marta ishlanmaydi.
//   Ilovadan (administrator): { action:'setup' } — webhook + menyu/tavsif (uz, ru) + tekshiruv; { action:'status' } — faqat tekshiruv (_lib/botSetup).
// Token hech qachon javobga, logga yoki bazaga (tokenning o'zi) yozilmaydi; webhook kaliti — app_data 'tg_main_bot' (faqat server).
'use strict';
const crypto = require('crypto');
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');
const { TOKEN_RE } = require('./_lib/dailyReportRun');
const { brandOf } = require('./_lib/tgEvents');
const IN = require('./_lib/tgInbox');
const BT = require('./_lib/botTexts');
const SETUP = require('./_lib/botSetup');
const tc = require('./_lib/tgCustomers');
const TQ = require('./_lib/tgQuery');   // 4-bosqich: xodim so'rov buyruqlari (avvalgi «So'rov boti»)

const sameSecret = (a, b) => { a = Buffer.from(String(a || '')); b = Buffer.from(String(b || '')); return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b); };

async function loadMain(admin) {
  const { data } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
  return (data && data.data) || {};
}
// Mijoz nomi (tasdiq xabari uchun) — faqat kerakli filial qatori
async function customerName(admin, main, filial, custId) {
  let b = null;
  try { const r = await admin.from('app_data_branches').select('data').eq('branch_key', filial).maybeSingle(); b = r.data && r.data.data; } catch (_) {}
  b = b || (main.branchStore && main.branchStore[filial]) || {};
  const c = (b.customers || []).find((x) => x && Number(x.id) === Number(custId));
  return c ? c.name : null;
}

async function route(admin, ctx, msg) {
  const { token, main } = ctx;
  const lang = BT.langOf(msg.from), t = BT.T[lang], brand = BT.escHtml(BT.brandClean(brandOf(main.settings || {})));
  const chatId = msg.chat.id;
  const send = (text) => IN.tgApi(token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
  const text = String(msg.text || '').trim().slice(0, 300);
  const m = /^\/([A-Za-z0-9_]+)(?:@\w+)?(?:\s+(.*))?$/.exec(text);
  if (!m) return null;   // oddiy matn — javob yo'q (saqlanmaydi ham)
  const cmd = m[1].toLowerCase(), arg = String(m[2] || '').trim();
  if (cmd === 'start' && arg) {
    if (/^cus[A-Za-z0-9]{12}$/.test(arg)) {
      const r = await tc.linkMessages(admin, token, BT.brandClean(brandOf(main.settings || {})), (f, id) => customerName(admin, main, f, id), [msg]);
      if (!r.matched) return send(t.linkBad);
      return r.added ? 'linked' : send(t.welcome(brand));
    }
    if (/^(pw[0-9a-f]{24}|inv[A-Za-z0-9]{8,24})$/.test(arg)) return send(t.accepted);
    if (/^\d{8}$/.test(arg)) return TQ.start(admin, ctx, msg, arg, send);   // xodim: «Telegramda ulash» kodi
    return send(t.linkBad);
  }
  { const r = await TQ.command(admin, ctx, msg, cmd, arg, send); if (r !== null) return r; }   // ulangan xodim chati
  if (cmd === 'start') return send(t.welcome(brand));
  if (cmd === 'help' || cmd === 'yordam') return send(t.help(brand));
  return send(t.noCmd);
}

async function onWebhook(event, admin) {
  const hdr = (event.headers || {})['x-telegram-bot-api-secret-token'];
  const hook = await IN.loadHook(admin);
  if (!hook.secret || !sameSecret(hdr, hook.secret)) return json({ error: 'Not found' }, 404);
  try {
    const main = await loadMain(admin);
    const token = String((main.settings || {}).tgBotToken || '');
    // Token almashtirilgan (boshqa bot) — eski botning webhook'i javobsiz qoladi
    if (!TOKEN_RE.test(token) || IN.botIdOf(token) !== String(hook.bot_id)) return json({ ok: true, skipped: 'bot' }, 200);
    const upd = parseBody(event) || {};
    const rec = await IN.record(admin, hook.bot_id, upd);
    if (rec.dup) return json({ ok: true, dup: true }, 200);
    const msg = upd.message;
    if (msg && msg.chat && msg.chat.type === 'private' && typeof msg.text === 'string') await route(admin, { token, main, hook }, msg);
  } catch (e) { console.error('[telegram-bot]', e && e.message); }
  return json({ ok: true }, 200);   // Telegram qayta yubormasligi uchun doim 200
}

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']); if (methodErr) return methodErr;
  let admin; try { admin = getAdminClient(); } catch (e) { return serverError(e, 'telegram-bot', 'Server sozlanmagan'); }
  if ((event.headers || {})['x-telegram-bot-api-secret-token'] !== undefined) return onWebhook(event, admin);
  // ── Ilovadan (administrator): «Botni sozlash» / tekshiruv ──
  const body = parseBody(event);
  if (!body || !['setup', 'status'].includes(body.action)) return json({ error: "Noma'lum amal" }, 400);
  const auth = await requireStaffAuth(event, admin, { requireAdmin: true, fn: 'telegram-bot' });
  if (!auth.ok) return auth.response;
  try {
    const main = await loadMain(admin), st = main.settings || {};
    const r = body.action === 'setup' ? await SETUP.setup(admin, st.tgBotToken, brandOf(st)) : await SETUP.verify(admin, st.tgBotToken);
    return json(r, 200);
  } catch (e) { return serverError(e, 'telegram-bot', 'Botni tekshirib boʻlmadi'); }
};
exports.handler = require('./_lib/monitor').wrap('telegram-bot', exports.handler);
exports._route = route;
