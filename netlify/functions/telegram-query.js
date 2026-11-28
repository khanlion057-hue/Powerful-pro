// Netlify Function — XODIMNING BOTDAN SO'ROVI (v25.9: YAGONA BOT). Buyruqlar (/foyda, /xarajat, /qarz, /kassa, /ombor, /mahsulot)
// endi ASOSIY (hisobot) botda — javobni «telegram-bot» webhook'i beradi (_lib/tgQuery). Alohida «So'rov boti» kerak emas.
// Ulanishlar — app_data 'tg_query_bot' (faqat server; chat raqami barcha botlarda bir xil — eski ulanishlar saqlanadi).
//   Ilovadan (Authorization bilan):
//     { action:'status' }     — administrator: asosiy bot nomi, ulangan xodimlar soni
//     { action:'link_code' }  — har qanday faol xodim: 15 daqiqalik kod va bir bosishli havola (t.me/<asosiy bot>?start=<kod>)
//     { action:'unlink' }     — o'z ulanishini o'chirish (shu chatdagi xodim menyusi ham o'chadi)
//     { action:'setup' }      — ESKI: endi rad etiladi («Botni sozlash» — Sozlamalar → Asosiy bot)
//   ESKI so'rov botining webhook'i (o'tish davri): har qanday xabarga — «endi asosiy botdan foydalaning» va havola. Buyruq bajarilmaydi.
const crypto = require('crypto');
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');
const { TOKEN_RE } = require('./_lib/dailyReportRun');
const TQ = require('./_lib/tgQuery');
const IN = require('./_lib/tgInbox');

const sameSecret = (a, b) => { a = Buffer.from(String(a || '')); b = Buffer.from(String(b || '')); return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b); };

async function mainToken(admin) {
  const { data } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
  const t = String((data && data.data && data.data.settings && data.data.settings.tgBotToken) || '');
  return TOKEN_RE.test(t) ? t : null;
}
async function mainBotName(token) {
  if (!token) return null;
  const me = await IN.tgApi(token, 'getMe');
  return me.ok && me.result && me.result.username ? String(me.result.username).replace(/[^A-Za-z0-9_]/g, '') : null;
}

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']); if (methodErr) return methodErr;
  let admin; try { admin = getAdminClient(); } catch (e) { return serverError(e, 'telegram-query', 'Server sozlanmagan'); }
  const hdr = (event.headers || {})['x-telegram-bot-api-secret-token'];
  // ── ESKI so'rov botining webhook'i: faqat yo'naltirish ──
  if (hdr !== undefined) {
    const cfg = await TQ.loadRow(admin);
    if (!cfg.token || !sameSecret(hdr, cfg.secret)) return json({ error: 'Not found' }, 404);
    try {
      const upd = parseBody(event) || {}, msg = upd.message;
      if (msg && msg.chat && msg.chat.type === 'private') {
        const bot = await mainBotName(await mainToken(admin));
        await IN.tgApi(cfg.token, 'sendMessage', { chat_id: msg.chat.id, disable_web_page_preview: true,
          text: bot ? `Bu bot endi ishlatilmaydi. Hisobot va soʻrovlar — asosiy botda: @${bot}\nIlovada Sozlamalar → «Botdan hisobot soʻrash» → «Telegramda ulash» tugmasini bosing.`
            : 'Bu bot endi ishlatilmaydi. Ilovada Sozlamalar → «Botdan hisobot soʻrash» boʻlimiga qarang.' });
      }
    } catch (e) { console.error('[telegram-query]', e && e.message); }
    return json({ ok: true }, 200);
  }
  // ── Ilovadan ──
  const body = parseBody(event);
  if (!body || !['status', 'setup', 'link_code', 'unlink'].includes(body.action)) return json({ error: "Noma'lum amal" }, 400);
  const auth = await requireStaffAuth(event, admin, { requireAdmin: body.action === 'setup' || body.action === 'status', fn: 'telegram-query' });
  if (!auth.ok) return auth.response;
  try {
    if (body.action === 'setup') return json({ error: "Soʻrov boti asosiy botga birlashtirildi — alohida bot kerak emas. Sozlamalar → Asosiy bot → «Botni sozlash»." }, 400);
    const cfg = await TQ.loadRow(admin);
    const token = await mainToken(admin);
    if (body.action === 'status') return json({ ok: true, set: !!token, merged: true, bot: await mainBotName(token), links: Object.keys(cfg.links || {}).length }, 200);
    if (!token) return json({ error: 'Asosiy bot hali sozlanmagan — administratorga ayting' }, 409);
    if (body.action === 'link_code') {
      const codes = {}; Object.entries(cfg.codes || {}).forEach(([k, v]) => { if (v.exp > Date.now()) codes[k] = v; });
      const code = String(crypto.randomInt(10000000, 100000000));   // 8 xonali
      codes[code] = { staffId: auth.staff.id, exp: Date.now() + TQ.CODE_TTL };
      await TQ.saveRow(admin, { ...cfg, codes });
      const bot = await mainBotName(token);
      const linked = Object.values(cfg.links || {}).some((v) => v && v.staffId === auth.staff.id);
      // Bir bosishda ulash: t.me/<bot>?start=<kod> — Telegram'da faqat «Start» bosiladi
      return json({ ok: true, code, bot, link: bot ? `https://t.me/${bot}?start=${code}` : null, linked, minutes: 15 }, 200);
    }
    // unlink — faqat o'z ulanishlari; shu chatlardagi xodim menyusi o'chiriladi
    const links = {}, dropped = [];
    Object.entries(cfg.links || {}).forEach(([k, v]) => { if (v.staffId !== auth.staff.id) links[k] = v; else dropped.push(k); });
    await TQ.saveRow(admin, { ...cfg, links });
    await Promise.all(dropped.map((c) => TQ.dropMenu(token, c)));
    return json({ ok: true }, 200);
  } catch (e) { return serverError(e, 'telegram-query', 'Server xatosi'); }
};
exports.handler = require('./_lib/monitor').wrap('telegram-query', exports.handler);
