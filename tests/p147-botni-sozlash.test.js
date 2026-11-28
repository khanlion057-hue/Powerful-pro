// P147 — v25.9 (yagona bot, 5-bosqich): «Botni sozlash» va tekshiruv (telegram-bot: setup / status; _lib/botSetup).
// Soxta Telegram HOLATNI eslab qoladi (webhook manzili, kalit, menyu tillar bo'yicha, tavsif) — tekshiruv haqiqiy holatni qayta o'qiydi.
//  • Natija aniq: bot ishlayaptimi, webhook o'rnatildimi, menyu (uz + ru) va tavsif o'rnatildimi.
//  • Token yaroqsiz (401) yoki bot o'chirilgan (404) — aynan «Bot topilmadi — BotFather’da tekshiring».
//  • Menyu va tavsif — o'zbekcha (sukut) va ruscha; ulangan xodimlarga — xodim menyusi (faqat o'z chatida).
//  • Qayta bosish xavfsiz (kalit o'sha); token almashtirilsa — tekshiruv «kalit mos emas» deydi.
//  • Faqat administrator; javobda token ham, webhook kaliti ham yo'q.
const assert = require('node:assert/strict');
const { makeMemSupabase, loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const TOKEN = '700009:' + 'RealBotSecret'.repeat(3);
const URL0 = 'https://powerful-pro.netlify.app';

function fakeTelegram(mode = { me: 'ok' }) {
  const S = { webhook: null, secret: null, allowed: null, cmds: {}, desc: {}, short: {}, calls: [] };
  const scopeKey = (b) => (b.scope && b.scope.type === 'chat' ? 'chat:' + b.scope.chat_id : 'default') + '|' + (b.language_code || '');
  global.fetch = async (url, o) => {
    const method = String(url).split('/').pop(), b = JSON.parse((o && o.body) || '{}');
    S.calls.push({ method, b, url: String(url) });
    const ok = (result) => ({ json: async () => ({ ok: true, result }) });
    if (method === 'getMe') {
      if (mode.me === '401') return { json: async () => ({ ok: false, error_code: 401, description: 'Unauthorized' }) };
      if (mode.me === '404') return { json: async () => ({ ok: false, error_code: 404, description: 'Not Found' }) };
      if (mode.me === 'net') throw new Error('ECONNRESET');
      return ok({ id: 700009, username: 'powerful_bot', first_name: 'Powerful' });
    }
    if (method === 'setWebhook') { if (mode.wh === 'fail') return { json: async () => ({ ok: false, error_code: 400, description: 'Bad Request: bad webhook: HTTPS url must be provided for webhook' }) }; S.webhook = b.url; S.secret = b.secret_token; S.allowed = b.allowed_updates; return ok(true); }
    if (method === 'getWebhookInfo') return ok({ url: S.webhook || '', pending_update_count: 0 });
    if (method === 'setMyCommands') { S.cmds[scopeKey(b)] = b.commands; return ok(true); }
    if (method === 'getMyCommands') return ok(S.cmds[scopeKey(b)] || []);
    if (method === 'setMyDescription') { S.desc[b.language_code || ''] = b.description; return ok(true); }
    if (method === 'getMyDescription') return ok({ description: S.desc[b.language_code || ''] || '' });
    if (method === 'setMyShortDescription') { S.short[b.language_code || ''] = b.short_description; return ok(true); }
    return ok(true);
  };
  return S;
}
function world(settings = { company: 'POWERFUL GROUP', tgBotToken: TOKEN }) {
  return makeMemSupabase({ tables: {
    app_data: [{ id: 'main', data: { settings } }, { id: 'tg_query_bot', data: { links: { 5551: { staffId: 2 }, 5552: { staffId: 3 } }, codes: {} } }],
    staff: [{ id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
      { id: 2, auth_user_id: 'u-set', role: 'sotuvchi', active: true, filial: 'baza', name: 'Sozlovchi', login: 'set' }],
    staff_roles: [{ staff_id: 2, role_id: 'r1' }], role_permissions: [{ role_id: 'r1', permission_id: 'sozlamalar.edit', permissions: { key: 'sozlamalar.edit' } }],
    staff_audit_log: [], security_events: [] }, users: { 't-admin': { id: 'u-admin' }, 't-set': { id: 'u-set' } } });
}
const B = (r) => JSON.parse(r.body);
const hookRow = (c) => (c.tables ? c.tables.app_data : c._tables.app_data).find((x) => x.id === 'tg_main_bot');

async function testSetup() {
  process.env.URL = URL0;
  const tg = fakeTelegram(); const c = world();
  try {
    const h = loadFunction('telegram-bot', c);
    assert.equal((await h(post({ action: 'setup' }, 't-set'))).statusCode, 403, 'faqat administrator');
    // sozlashdan oldin — tekshiruv aniq aytadi
    let s = B(await h(post({ action: 'status' })));
    assert.equal(s.bot.ok, true); assert.equal(s.webhook.ok, false); assert.match(s.webhook.error, /Webhook oʻrnatilmagan/);
    assert.equal(s.menu.ok, false); assert.equal(s.description.ok, false); assert.equal(s.ok, false);
    // sozlash
    const r = await h(post({ action: 'setup' }));
    const v = B(r);
    assert.deepEqual({ ok: v.ok, bot: v.bot, webhook: v.webhook.ok, menu: v.menu, description: v.description },
      { ok: true, bot: { ok: true, username: 'powerful_bot', name: 'Powerful' }, webhook: true, menu: { uz: true, ru: true, ok: true }, description: { ok: true } });
    assert.equal(tg.webhook, URL0 + '/.netlify/functions/telegram-bot');
    assert.deepEqual(tg.allowed, ['message', 'my_chat_member', 'channel_post']);
    assert.match(tg.secret, /^[0-9a-f]{64}$/);
    // menyu: xaridor — faqat /start va yordam (uz, ru); xodim buyruqlari faqat ulangan chatlarda
    assert.deepEqual(tg.cmds['default|'].map((x) => x.command), ['start', 'help']);
    assert.deepEqual(tg.cmds['default|'].map((x) => x.description), ['Boshlash', 'Yordam']);
    assert.deepEqual(tg.cmds['default|ru'].map((x) => x.description), ['Начать', 'Помощь']);
    assert.ok(!JSON.stringify(tg.cmds['default|'] || []).includes('foyda'), 'xaridor menyusida xodim buyrug\'i yo\'q');
    for (const ch of ['chat:5551|', 'chat:5552|']) assert.ok(tg.cmds[ch].some((x) => x.command === 'foyda'), 'ulangan xodim chatida xodim menyusi');
    assert.equal(v.staffMenus, 2);
    assert.match(tg.desc[''], /POWERFUL GROUP rasmiy boti/); assert.match(tg.desc.ru, /Официальный бот POWERFUL GROUP/);
    assert.match(tg.short[''], /xaridorlar va xodimlar/); assert.match(tg.short.ru, /покупателей/);
    // javobda token yoki webhook kaliti yo'q
    assert.ok(!r.body.includes(TOKEN.split(':')[1]) && !r.body.includes(tg.secret), 'javobda token/kalit yo\'q');
    // qayta bosish — kalit o'sha
    const sec = tg.secret; assert.equal(B(await h(post({ action: 'setup' }))).ok, true); assert.equal(tg.secret, sec, 'qayta sozlash — kalit o\'zgarmaydi');
    s = B(await h(post({ action: 'status' })));
    assert.equal(s.ok, true, JSON.stringify(s)); assert.equal(s.webhook.ok, true);
    // webhook boshqa joyga o'zgartirilgan bo'lsa — tekshiruv aytadi
    tg.webhook = 'https://boshqa.example/hook';
    assert.match(B(await h(post({ action: 'status' }))).webhook.error, /boshqa manzilga/);
  } finally { unloadFunctions(); }
}

async function testNotFound() {
  process.env.URL = URL0;
  for (const mode of ['401', '404']) {
    fakeTelegram({ me: mode }); const c = world();
    try {
      const h = loadFunction('telegram-bot', c);
      for (const a of ['setup', 'status']) {
        const v = B(await h(post({ action: a })));
        assert.equal(v.ok, false); assert.equal(v.bot.ok, false);
        assert.equal(v.bot.error, 'Bot topilmadi — BotFather’da tekshiring', mode + ' ' + a);
      }
    } finally { unloadFunctions(); }
  }
  // token umuman yo'q / formati buzuq — ham aniq
  fakeTelegram(); let h = loadFunction('telegram-bot', world({ company: 'X' }));
  try { assert.equal(B(await h(post({ action: 'status' }))).bot.error, 'Bot topilmadi — BotFather’da tekshiring'); } finally { unloadFunctions(); }
  // tarmoq xatosi — boshqa (to'g'ri) xabar
  fakeTelegram({ me: 'net' }); h = loadFunction('telegram-bot', world());
  try { assert.match(B(await h(post({ action: 'status' }))).bot.error, /javob bermadi/); } finally { unloadFunctions(); }
  // webhook o'rnatilmadi — sabab aniq, tokensiz
  const tg = fakeTelegram({ wh: 'fail' }); h = loadFunction('telegram-bot', world());
  try {
    const r = await h(post({ action: 'setup' })); const v = B(r);
    assert.equal(v.bot.ok, true); assert.equal(v.webhook.ok, false); assert.match(v.webhook.error, /Webhook oʻrnatilmadi: Bad Request/);
    assert.equal(v.menu.ok, true, 'menyu baribir o\'rnatildi'); assert.equal(v.ok, false);
    assert.ok(!r.body.includes(TOKEN.split(':')[1])); void tg;
  } finally { unloadFunctions(); }
  // token boshqa botga almashtirildi — eski kalit mos emas
  const tg2 = fakeTelegram(); const c2 = world(); h = loadFunction('telegram-bot', c2);
  try {
    await h(post({ action: 'setup' }));
    const app = (await c2.from('app_data').select('data').eq('id', 'tg_main_bot').maybeSingle()).data.data;
    assert.equal(app.hook, true); assert.equal(app.bot_id, '700009'); assert.ok(app.secret && !('token' in app), 'bazada token yo\'q — faqat bot ID');
    await c2.from('app_data').upsert({ id: 'tg_main_bot', data: { ...app, bot_id: '111111' } }, { onConflict: 'id' });
    assert.match(B(await h(post({ action: 'status' }))).webhook.error, /kaliti mos emas/); void tg2;
  } finally { unloadFunctions(); }
}

module.exports = {
  name: 'P147 — «Botni sozlash»: webhook, menyu va tavsif (uz/ru), aniq tekshiruv natijasi',
  cases: [
    { name: 'sozlash: webhook + menyu uz/ru + tavsif uz/ru + xodim menyusi; tekshiruv haqiqiy holatdan; qayta bosish xavfsiz; faqat admin', run: testSetup },
    { name: 'bot o\'chirilgan / token yaroqsiz — «Bot topilmadi — BotFather’da tekshiring»; tarmoq, webhook xatosi, kalit mos emas — aniq', run: testNotFound },
  ],
};
