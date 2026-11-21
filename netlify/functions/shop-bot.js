// Netlify Function — ONLAYN-DO'KON Telegram boti (ulash / holat).
//
// Token — do'kon botining kaliti. U brauzerga HECH QACHON qaytarilmaydi:
//  • saqlash: brauzer tokenni bir marta app_data.settings.shopBotToken sifatida yuboradi,
//    server uni saqlaydi va yuklashda olib tashlaydi (faqat `shopBotTokenSet` belgisi);
//  • bu funksiya Telegram API'ga SERVERDAN murojaat qiladi va javobga tokenni qo'shmaydi.
//
// POST { action:'check', token }   — tokenni tekshiradi (getMe), hech narsa saqlamaydi
// POST { action:'setup' }          — saqlangan token bilan bot buyruqlari va tavsifini o'rnatadi
// POST { action:'status' }         — saqlangan token bo'yicha bot ma'lumoti (getMe)
// Ruxsat: administrator yoki `sozlamalar.edit`.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');

const TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{20,}$/;
const ACTIONS = ['check', 'setup', 'status'];

async function tg(token, method, payload) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify(payload || {}),
    });
    return await r.json().catch(() => ({ ok: false }));
  } finally { clearTimeout(t); }
}
const botInfo = (r) => (r && r.ok && r.result) ? { username: String(r.result.username || '').slice(0, 64), name: String(r.result.first_name || '').slice(0, 64) } : null;
const tgErr = (r) => String((r && r.description) || "Telegram javob bermadi").slice(0, 200);

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const body = parseBody(event);
  if (!body || typeof body !== 'object' || !ACTIONS.includes(body.action)) return json({ error: "Noto'g'ri so'rov" }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'shop-bot', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'sozlamalar.edit', fn: 'shop-bot' });
  if (!auth.ok) return auth.response;

  try {
    if (body.action === 'check') {
      const token = String(body.token || '').trim();
      if (!TOKEN_RE.test(token)) return json({ ok: false, error: "Token formati noto'g'ri — BotFather yuborgan satrni to'liq nusxalang" }, 400);
      const me = await tg(token, 'getMe');
      const info = botInfo(me);
      return info ? json({ ok: true, bot: info }, 200) : json({ ok: false, error: tgErr(me) }, 200);
    }

    const { data: row, error } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
    if (error) throw error;
    const st = (row && row.data && row.data.settings) || {};
    const token = st.shopBotToken || '';
    if (!token) return json({ ok: false, error: 'Bot tokeni saqlanmagan' }, 400);
    const me = await tg(token, 'getMe');
    const info = botInfo(me);
    if (!info) return json({ ok: false, error: tgErr(me) }, 200);
    if (body.action === 'status') return json({ ok: true, bot: info }, 200);

    // setup — faqat Telegram tomonidagi ochiq ma'lumot (buyruqlar ro'yxati va tavsif)
    const shopName = String(body.shopName || st.company || "Do'kon").replace(/[\u0000-\u001f]/g, ' ').slice(0, 60);
    const steps = [];
    const c = await tg(token, 'setMyCommands', { commands: [
      { command: 'start', description: 'Boshlash' },
      { command: 'shop', description: "Do'konni ochish" },
      { command: 'help', description: 'Yordam' },
    ] });
    steps.push({ step: 'commands', ok: !!(c && c.ok) });
    const d = await tg(token, 'setMyDescription', { description: `${shopName} — onlayn-do'kon. Mahsulotlarni ko'ring va buyurtma bering.`.slice(0, 512) });
    steps.push({ step: 'description', ok: !!(d && d.ok) });
    const s = await tg(token, 'setMyShortDescription', { short_description: `${shopName} — onlayn-do'kon`.slice(0, 120) });
    steps.push({ step: 'short_description', ok: !!(s && s.ok) });
    return json({ ok: steps.every(x => x.ok), bot: info, steps }, 200);
  } catch (e) {
    return serverError(e, 'shop-bot', "Telegramga ulanib bo'lmadi");
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('shop-bot', exports.handler);
