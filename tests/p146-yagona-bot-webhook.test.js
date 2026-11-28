// P146 — v25.9 (yagona bot, 2–3-bosqich): «telegram-bot» webhook + tg_inbox (HAQIQIY PostgreSQL — PGlite, to'liq schema.sql).
//  • Maxfiy kalit noto'g'ri / webhook sozlanmagan — 404, qutiga hech narsa yozilmaydi.
//  • /start cus… — mijoz DARHOL bog'lanadi (ism bilan tasdiq); takroriy update_id — ikkinchi javob yo'q.
//  • Xaridor xodim buyrug'ini yozsa — faqat «Bu buyruq mavjud emas» / «Такой команды нет» (ichki ma'lumot yo'q).
//  • Oddiy shaxsiy matn qutiga yozilmaydi (faqat «/start kod»); guruh holati — yoziladi, javob yo'q.
//  • O'quvchilar (mijoz sweep, parol tiklash, investor, guruhlarni topish): webhook bor — qutidan; yo'q — getUpdates; 409 — qutidan.
//  • Token hech qayerda yo'q: javoblarda ham, bazada ham.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions } = require('./helpers/mem-supabase');

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const TOKEN = '700001:' + 'TokenSecretPart'.repeat(2);
const SECRET = 'hook-secret-' + 'x'.repeat(20);
const BOT_ID = 700001;

async function world({ hook = true, polling = null } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE); await pg.exec(SCHEMA);
  const main = { settings: { company: 'POWERFUL GROUP', tgBotToken: TOKEN, tgChatId: '-1001' } };
  await pg.query(`update app_data set data = data || $1::jsonb where id = 'main'`, [JSON.stringify(main)]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('baza', $1::jsonb)`, [JSON.stringify({ customers: [{ id: 5, name: 'Aziz aka' }] })]);
  await pg.query(`insert into app_data (id, data) values ('tg_customer_links', $1::jsonb)`, [JSON.stringify({ links: {}, codes: { cusAbCdEfGh2345: { filial: 'baza', custId: 5 } } })]);
  if (hook) await pg.query(`insert into app_data (id, data) values ('tg_main_bot', $1::jsonb)`, [JSON.stringify({ bot_id: String(BOT_ID), secret: SECRET, hook: true })]);
  const sent = [];
  global.fetch = async (url, o) => {
    const method = String(url).split('/').pop(), body = JSON.parse((o && o.body) || '{}');
    sent.push({ method, body, url: String(url) });
    if (method === 'getUpdates') return { json: async () => (polling ? polling() : { ok: false, error_code: 409, description: 'Conflict: can\'t use getUpdates method while webhook is active' }) };
    if (method === 'getMe') return { json: async () => ({ ok: true, result: { id: BOT_ID, username: 'powerful_bot', first_name: 'Powerful' } }) };
    return { json: async () => ({ ok: true, result: true }) };
  };
  const client = makePgSupabase(pg, { pgTables: ['app_data', 'app_data_branches', 'tg_inbox', 'staff_pw_reset'], memTables: { staff: [], staff_roles: [], role_permissions: [], staff_audit_log: [], security_events: [] } });
  return { pg, client, sent };
}
let UPD = 1000;
const hookEv = (update, secret = SECRET) => ({ httpMethod: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(update) });
const pm = (chat, text, extra = {}) => ({ update_id: UPD++, message: { message_id: 1, chat: { id: chat, type: 'private' }, from: { id: chat, first_name: 'Ali', language_code: extra.lang || 'uz' }, text } });
const rows = async (pg, sql) => (await pg.query(sql)).rows;

async function testWebhook() {
  const { pg, client, sent } = await world();
  try {
    const h = loadFunction('telegram-bot', client);
    // kalit noto'g'ri — 404, qutiga yozuv yo'q
    assert.equal((await h(hookEv(pm(50, '/start cusAbCdEf123456'), 'XATO'))).statusCode, 404);
    assert.equal((await h(hookEv(pm(50, '/start'), ''))).statusCode, 404, 'bo\'sh kalit');
    assert.equal((await rows(pg, 'select count(*)::int n from tg_inbox'))[0].n, 0);
    // mijoz: darhol bog'lanadi
    const u = pm(51, '/start cusAbCdEfGh2345');
    assert.equal((await h(hookEv(u))).statusCode, 200);
    const links = (await rows(pg, `select data from app_data where id='tg_customer_links'`))[0].data.links;
    assert.equal(String(links['baza:5'].chatId), '51', 'mijoz bog\'landi');
    assert.match(sent.at(-1).body.text, /Aziz aka, siz mijozlar/);
    // takror yetkazish — ikkinchi javob yo'q
    const n = sent.length; await h(hookEv(u)); assert.equal(sent.length, n, 'takroriy update_id — javob yo\'q');
    // xaridor xodim buyrug'ini yozsa — faqat «Bu buyruq mavjud emas»
    for (const c of ['/foyda', '/kassa oy', '/xarajat', '/qarz', '/ombor', '/mahsulot arra', '/admin']) {
      await h(hookEv(pm(52, c))); assert.equal(sent.at(-1).body.text, 'Bu buyruq mavjud emas', c);
    }
    await h(hookEv(pm(53, '/foyda', { lang: 'ru' }))); assert.equal(sent.at(-1).body.text, 'Такой команды нет');
    // /start, /help — salom/yordam; ichki so'zlar yo'q
    await h(hookEv(pm(52, '/start'))); assert.match(sent.at(-1).body.text, /POWERFUL GROUP/);
    await h(hookEv(pm(52, '/help'))); const help = sent.at(-1).body.text;
    await h(hookEv(pm(53, '/help', { lang: 'ru' }))); assert.match(sent.at(-1).body.text, /Бот/);
    for (const s of [help, sent.at(-1).body.text]) assert.doesNotMatch(s, /foyda|kassa|ruxsat|xodim buyru|ulash/i, 'xaridorga ichki ma\'lumot yo\'q');
    // noma'lum/eskirgan kod
    await h(hookEv(pm(54, '/start cusZZZZZZZZZZZZ'))); assert.match(sent.at(-1).body.text, /eskirgan/);
    // parol / investor kodlari — qabul qilindi (tekshiruv ilovada)
    await h(hookEv(pm(55, '/start pw' + 'a1'.repeat(12)))); assert.match(sent.at(-1).body.text, /Qabul qilindi/);
    await h(hookEv(pm(56, '/start invAbc12345'))); assert.match(sent.at(-1).body.text, /Qabul qilindi/);
    // oddiy matn — javob yo'q, matn saqlanmaydi
    const m = sent.length; await h(hookEv(pm(57, 'Salom, telefonim +998901234567'))); assert.equal(sent.length, m, 'oddiy matnga javob yo\'q');
    // guruh: bot qo'shildi — qutiga, javob yo'q
    await h(hookEv({ update_id: UPD++, my_chat_member: { chat: { id: -100777, type: 'supergroup', title: 'Filial 2' }, from: { id: 1 }, new_chat_member: { status: 'administrator' } } }));
    await h(hookEv({ update_id: UPD++, message: { chat: { id: -100777, type: 'supergroup', title: 'Filial 2' }, from: { id: 1 }, text: '/foyda maxfiy' } }));
    assert.equal(sent.length, m, 'guruhda javob yo\'q');
    const inbox = await rows(pg, 'select chat_id::text c, chat_type t, text, member_status s from tg_inbox order by update_id');
    assert.ok(inbox.every((r) => r.text === null || /^\/start [A-Za-z0-9_-]+$/.test(r.text)), 'faqat /start kodi saqlanadi');
    assert.ok(!inbox.some((r) => /998901234567|maxfiy|foyda/.test(String(r.text))), 'shaxsiy/guruh matni saqlanmagan');
    assert.ok(inbox.some((r) => r.c === '-100777' && r.s === 'administrator'), 'guruh holati saqlandi');
    // token hech qayerda yo'q
    const all = JSON.stringify(await rows(pg, `select * from tg_inbox`)) + JSON.stringify(await rows(pg, `select data from app_data where id <> 'main'`));
    assert.ok(!all.includes(TOKEN.split(':')[1]), 'bazada token yo\'q');
    // token boshqa botga almashtirilsa — eski webhook javobsiz
    await pg.query(`update app_data set data = jsonb_set(data, '{settings,tgBotToken}', '"800002:OtherBotTokenOtherBotToken12"') where id='main'`);
    const k = sent.length; const r = await h(hookEv(pm(52, '/start'))); assert.equal(r.statusCode, 200); assert.equal(sent.length, k, 'boshqa bot — javob yo\'q');
  } finally { unloadFunctions(); await pg.close(); }
}

async function testReaders() {
  // 1) webhook bor — o'quvchilar qutidan (getUpdates chaqirilmaydi)
  const { pg, client, sent } = await world();
  try {
    const h = loadFunction('telegram-bot', client);
    const IN = require('../netlify/functions/_lib/tgInbox');
    await h(hookEv(pm(61, '/start invAbc12345')));
    await h(hookEv({ update_id: UPD++, my_chat_member: { chat: { id: -100555, type: 'channel', title: 'Reklama kanali', username: 'pw_kanal' }, from: { id: 1 }, new_chat_member: { status: 'administrator' } } }));
    sent.length = 0;
    const up = await IN.updates(client, TOKEN, ['message']);
    assert.equal(up.via, 'inbox'); assert.ok(!sent.some((x) => x.method === 'getUpdates'), 'webhook bor — getUpdates yo\'q');
    const msg = up.result.map((u) => u.message).filter(Boolean).pop();
    assert.equal(msg.text, '/start invAbc12345'); assert.equal(msg.chat.type, 'private'); assert.equal(msg.from.first_name, 'Ali');
    const ch = up.result.find((u) => u.my_chat_member);
    assert.deepEqual([ch.my_chat_member.chat.title, ch.my_chat_member.chat.username, ch.my_chat_member.new_chat_member.status], ['Reklama kanali', 'pw_kanal', 'administrator']);
    // mijoz sweep — qutidan (soatlik/«Tekshirish»): webhook bog'lagani takror bog'lanmaydi
    const tc = require('../netlify/functions/_lib/tgCustomers');
    await pg.query(`update app_data set data = jsonb_set(data, '{codes,cusQQQQQQQQQQQQ}', '{"filial":"baza","custId":5}') where id='tg_customer_links'`);
    await pg.query(`insert into tg_inbox (bot_id, update_id, kind, chat_id, chat_type, text) values (${BOT_ID}, 1, 'message', 71, 'private', '/start cusQQQQQQQQQQQQ')`);
    assert.equal(await tc.sweep(client, TOKEN, 'POWERFUL', async () => 'Aziz aka'), 1, 'sweep qutidan bog\'ladi');
    assert.ok(!sent.some((x) => x.method === 'getUpdates'));
  } finally { unloadFunctions(); await pg.close(); }
  // 2) webhook yo'q — eskicha getUpdates (o'tish davri)
  const w2 = await world({ hook: false, polling: () => ({ ok: true, result: [{ update_id: 5, message: { chat: { id: 81, type: 'private' }, from: { id: 81, first_name: 'Vali' }, text: '/start invZZZ99999' } }] }) });
  try {
    const IN = require('../netlify/functions/_lib/tgInbox');
    const up = await IN.updates(w2.client, TOKEN, ['message']);
    assert.equal(up.via, 'poll'); assert.equal(up.result[0].message.text, '/start invZZZ99999');
  } finally { await w2.pg.close(); }
  // 3) webhook bor, lekin bizda yozuv yo'q (409) — baribir qutidan
  const w3 = await world({ hook: false });
  try {
    const IN = require('../netlify/functions/_lib/tgInbox');
    await w3.pg.query(`insert into tg_inbox (bot_id, update_id, kind, chat_id, chat_type, text) values (${BOT_ID}, 9, 'message', 91, 'private', '/start invYYY88888')`);
    const up = await IN.updates(w3.client, TOKEN, ['message']);
    assert.equal(up.via, 'inbox'); assert.equal(up.result[0].message.text, '/start invYYY88888');
  } finally { await w3.pg.close(); }
}

module.exports = {
  name: 'P146 — Yagona bot: webhook (telegram-bot) va xabarlar qutisi',
  cases: [
    { name: 'webhook: maxfiy kalit, mijoz darhol ulanadi, takror yo\'q, xaridorga «Bu buyruq mavjud emas», maxfiylik, token yo\'q', run: testWebhook },
    { name: 'o\'quvchilar: webhook — qutidan; webhook yo\'q — getUpdates; 409 — qutidan; mijoz sweep', run: testReaders },
  ],
};
