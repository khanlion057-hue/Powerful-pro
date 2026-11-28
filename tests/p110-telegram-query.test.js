// P110 — v25.6.9 → v25.9 (YAGONA BOT): xodim so'rov buyruqlari endi ASOSIY botda («telegram-bot» webhook'i, _lib/tgQuery).
//  • Maxfiy kalit, ulash kodi (bir martalik, taxmin qilishdan himoya), ruxsat, filial cheklovi, guruh e'tiborsiz, takror yetkazish.
//  • Ulanmagan chat (xaridor) — faqat «Bu buyruq mavjud emas» (ilgari «Avval ulang…» deb ichki yo'riqnoma aytilardi).
//  • Ulanganda shu chatga xodim menyusi (scope: chat) o'rnatiladi; uzilganda o'chiriladi.
//  • Ilova: link_code — asosiy bot havolasi; setup — endi rad (alohida bot kerak emas); eski so'rov boti — faqat yo'naltiradi.
const assert = require('node:assert/strict');
const SA = require('../netlify/functions/_lib/supabaseAdmin.js');
const DATA = { settings: { usdUzs: 12500 }, products: [], dealers: [], branchStore: {
  baza: { sales: [{ date: new Date().toISOString().slice(0, 10), totalUsd: 100, profitUsd: 40 }], expenses: [], customers: [], suppliers: [], cashboxes: [], batches: [] },
  f729: { sales: [{ date: new Date().toISOString().slice(0, 10), totalUsd: 7, profitUsd: 3 }], expenses: [], customers: [], suppliers: [], cashboxes: [], batches: [] } } };
const MAIN = '777000:MAINBOTTOKENxxxxxxxxxxxxxxxxxx', OLD = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abc';
const store = {
  main: { settings: { company: 'POWERFUL GROUP', tgBotToken: MAIN } },
  tg_main_bot: { bot_id: '777000', secret: 'S3CRET', hook: true },
  tg_query_bot: { token: OLD, secret: 'OLDSECRET', links: {}, codes: { '12345678': { staffId: 2, exp: Date.now() + 60000 } } },
};
const inbox = new Set();
const staff = { 1: { id: 1, name: 'Ega', role: 'admin', filial: 'baza', active: true }, 2: { id: 2, name: 'Kassir', role: 'staff', filial: 'f729', active: true }, 3: { id: 3, name: 'Yopiq', role: 'staff', filial: 'f729', active: true }, 4: { id: 4, name: 'Tannarxsiz', role: 'staff', filial: 'f729', active: true } };
const perms = { 2: ['hisobot.view', 'tannarx.view'], 3: [], 4: ['hisobot.view'] };
const fakeAdmin = { from: (t) => {
  const q = {
    select() { return q; }, order() { return q; }, limit() { return q; }, gte() { return q; },
    eq(c, v) { if (t === 'app_data' && c === 'id') q._id = v; q._v = v; return q; }, in(c, ids) { q._ids = ids; return q; },
    maybeSingle: async () => { if (t === 'app_data') return { data: store[q._id] ? { data: store[q._id] } : null }; if (t === 'staff') return { data: staff[q._v] || null }; return { data: null }; },
    then(res) { if (t === 'staff_roles') return res({ data: perms[q._v] ? [{ role_id: q._v }] : [] }); if (t === 'role_permissions') return res({ data: ((perms[(q._ids || [])[0]]) || []).map((k) => ({ permissions: { key: k } })) }); return res({ data: [] }); },
    upsert: async (row) => { store[row.id] = row.data; return { error: null }; },
    insert: async (row) => { if (t !== 'tg_inbox') return { error: null }; const k = row.bot_id + ':' + row.update_id; if (inbox.has(k)) return { error: { code: '23505', message: 'duplicate key' } }; inbox.add(k); return { error: null }; },
  };
  return q;
} };
SA.getAdminClient = () => fakeAdmin;
SA.requireStaffAuth = async () => ({ ok: true, staff: staff[2] });
const sent = []; global.fetch = async (url, o) => { const body = JSON.parse(o.body); sent.push({ m: url.split('/').pop(), bot: decodeURIComponent(url.split('/bot')[1]).split(':')[0], body }); return { json: async () => ({ ok: true, result: { username: url.includes('777000') ? 'powerful_bot' : 'old_query_bot' } }) }; };
const TQL = require('../netlify/functions/_lib/tgQuery.js');
TQL._load = async (a, filial) => ({ ...DATA, branchStore: Object.fromEntries(Object.entries(DATA.branchStore).filter(([k]) => !filial || k === filial)) });
const H = require('../netlify/functions/telegram-bot.js').handler;
const TQ = require('../netlify/functions/telegram-query.js').handler;
let UPD = 1;
const upd = (chat, text, secret = 'S3CRET', lang) => H({ httpMethod: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify({ update_id: UPD++, message: { chat: { id: chat, type: 'private' }, from: { id: chat, first_name: 'X', language_code: lang }, text } }) });
const last = () => sent.filter((x) => x.m === 'sendMessage').at(-1).body.text;
const Q = () => store.tg_query_bot;

async function run() {
  assert.equal((await upd(10, '/foyda', 'XATO')).statusCode, 404, 'noto\'g\'ri maxfiy kalit');
  await upd(10, '/foyda'); assert.equal(last(), 'Bu buyruq mavjud emas', 'ulanmagan chat — ichki yo\'riqnoma yo\'q');
  await upd(10, '/start 00000000'); assert.match(last(), /eskirgan/);
  await upd(10, '/start 12345678'); assert.match(last(), /Ulandi/);
  assert.equal(Q().links['10'].staffId, 2); assert.equal(Q().codes['12345678'], undefined, 'kod bir martalik');
  const menu = sent.filter((x) => x.m === 'setMyCommands').at(-1);
  assert.deepEqual(menu.body.scope, { type: 'chat', chat_id: 10 }, 'xodim menyusi — faqat shu chatda');
  assert.ok(menu.body.commands.some((c) => c.command === 'foyda') && menu.bot === '777000', 'asosiy botda');
  await upd(10, '/foyda oy'); const t = last(); assert.match(t, /729/); assert.doesNotMatch(t, /Baza/, 'filial xodimi boshqa filialni ko\'rmaydi');
  await upd(10, '/xarajat'); assert.match(last(), /ruxsatingiz yo'q/);
  await upd(10, '/start'); assert.match(last(), /xodim sifatida ulangansiz/);
  Q().links['11'] = { staffId: 1 }; await upd(11, '/foyda oy'); assert.match(last(), /Baza/, 'admin hammasini ko\'radi');
  Q().links['12'] = { staffId: 3 }; await upd(12, '/foyda'); assert.match(last(), /ruxsatingiz yo'q/);
  Q().links['13'] = { staffId: 4 }; await upd(13, '/foyda'); assert.match(last(), /tannarx/, 'foyda — tannarx ruxsatisiz yo\'q');
  // ulash kodini taxmin qilish: 5 noto'g'ri urinishdan keyin bloklanadi
  for (let i = 0; i < 5; i++) await upd(20, '/start 1111111' + i);
  Q().codes['55555555'] = { staffId: 2, exp: Date.now() + 60000 };
  await upd(20, '/start 55555555'); assert.match(last(), /Juda ko'p/);
  const n = sent.length; await H({ httpMethod: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'S3CRET' }, body: JSON.stringify({ update_id: UPD++, message: { chat: { id: -100, type: 'group' }, text: '/foyda' } }) });
  assert.equal(sent.length, n, 'guruhda javob berilmaydi');
  // takroriy update_id — ikkinchi marta javob yo'q
  const dup = { httpMethod: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'S3CRET' }, body: JSON.stringify({ update_id: 9999, message: { chat: { id: 11, type: 'private' }, text: '/kassa' } }) };
  await H(dup); const m = sent.length; await H(dup); assert.equal(sent.length, m, 'takror yetkazilganda qayta javob yo\'q');
  // ruscha xaridor
  await upd(30, '/qarz', 'S3CRET', 'ru'); assert.equal(last(), 'Такой команды нет');
}
// Ilova: «Telegramda ulash» — asosiy bot havolasi; uzish — menyu o'chadi; setup — rad; eski bot — yo'naltirish
async function app() {
  const call = (b) => TQ({ httpMethod: 'POST', headers: { authorization: 'Bearer x' }, body: JSON.stringify(b) }).then((r) => ({ code: r.statusCode, ...JSON.parse(r.body) }));
  UPD = 20000;
  const r = await call({ action: 'link_code' });
  assert.equal(r.ok, true); assert.match(r.code, /^\d{8}$/);
  assert.equal(r.link, 'https://t.me/powerful_bot?start=' + r.code, 'bir bosishli havola — ASOSIY bot');
  assert.ok(Q().codes[r.code], 'kod bazaga saqlandi');
  await upd(31, '/start ' + r.code); assert.match(last(), /Ulandi/);
  assert.equal(Q().links['31'].staffId, 2);
  assert.equal((await call({ action: 'link_code' })).linked, true, 'ulanganligi ko\'rinadi');
  const before = sent.length;
  assert.equal((await call({ action: 'unlink' })).ok, true);
  assert.ok(!Object.values(Q().links).some((v) => v.staffId === 2), 'xodimning hamma ulanishi o\'chdi');
  const drops = sent.slice(before).filter((x) => x.m === 'deleteMyCommands').map((x) => x.body.scope.chat_id).sort();
  assert.deepEqual(drops, [10, 31], 'shu chatlardagi xodim menyusi o\'chirildi');
  await upd(31, '/foyda'); assert.equal(last(), 'Bu buyruq mavjud emas', 'uzilgandan keyin — xaridor kabi');
  const s = await call({ action: 'setup', token: OLD });
  assert.equal(s.code, 400); assert.match(s.error, /birlashtirildi/);
  assert.ok(!sent.some((x) => x.m === 'setWebhook'), 'eski usulda webhook o\'rnatilmaydi');
  // eski so'rov botiga yozilsa — faqat yo'naltirish (buyruq bajarilmaydi)
  const k = sent.length;
  await TQ({ httpMethod: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'OLDSECRET' }, body: JSON.stringify({ update_id: 5, message: { chat: { id: 11, type: 'private' }, text: '/foyda' } }) });
  const red = sent.slice(k).filter((x) => x.m === 'sendMessage');
  assert.equal(red.length, 1); assert.equal(red[0].bot, '123456'); assert.match(red[0].body.text, /endi ishlatilmaydi.*@powerful_bot/s);
  assert.equal((await TQ({ httpMethod: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'XATO' }, body: '{}' })).statusCode, 404);
  // javoblarda token yo'q
  const st = await call({ action: 'status' });
  assert.equal(st.merged, true); assert.equal(st.bot, 'powerful_bot');
  for (const x of [r, s, st]) assert.ok(!JSON.stringify(x).includes('MAINBOTTOKEN') && !JSON.stringify(x).includes('ABCDEFGHIJ'), 'javobda token yo\'q');
}
module.exports = { name: 'P110 — Xodim soʻrov buyruqlari (yagona bot)', cases: [
  { name: 'webhook: maxfiy kalit, /start kod, xodim menyusi, ruxsat, filial cheklovi, guruh e\'tiborsiz, xaridorga «Bu buyruq mavjud emas»', run },
  { name: 'ilova: asosiy bot havolasi, uzish — menyu o\'chadi, eski setup rad, eski bot yo\'naltiradi, token yo\'q', run: app },
] };
