// P110 — v25.6.9: Telegram so'rov boti webhook (maxfiy kalit, ulash kodi, ruxsat, filial cheklovi)
const assert = require('node:assert/strict');
const SA = require('../netlify/functions/_lib/supabaseAdmin.js');
const DR = require('../netlify/functions/_lib/dailyReportRun.js');
const DATA = { settings: { usdUzs: 12500 }, products: [], dealers: [], branchStore: {
  baza: { sales: [{ date: new Date().toISOString().slice(0, 10), totalUsd: 100, profitUsd: 40 }], expenses: [], customers: [], suppliers: [], cashboxes: [], batches: [] },
  f729: { sales: [{ date: new Date().toISOString().slice(0, 10), totalUsd: 7, profitUsd: 3 }], expenses: [], customers: [], suppliers: [], cashboxes: [], batches: [] } } };
const store = { tg_query_bot: { token: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abc', secret: 'S3CRET', links: {}, codes: { '123456': { staffId: 2, exp: Date.now() + 60000 } } } };
const staff = { 1: { id: 1, name: 'Ega', role: 'admin', filial: 'baza', active: true }, 2: { id: 2, name: 'Kassir', role: 'staff', filial: 'f729', active: true }, 3: { id: 3, name: 'Yopiq', role: 'staff', filial: 'f729', active: true }, 4: { id: 4, name: 'Tannarxsiz', role: 'staff', filial: 'f729', active: true } };
const perms = { 2: ['hisobot.view', 'tannarx.view'], 3: [], 4: ['hisobot.view'] };
const fakeAdmin = { from: (t) => ({
  select() { return this; }, eq(c, v) { this._v = v; return this; }, in(c, ids) { this._ids = ids; return this; },
  maybeSingle: async function () { if (t === 'app_data') return { data: store[this._id] ? { data: store[this._id] } : null }; if (t === 'staff') return { data: staff[this._v] || null }; return { data: null }; },
  then(res) { if (t === 'staff_roles') return res({ data: perms[this._v] ? [{ role_id: this._v }] : [] }); if (t === 'role_permissions') return res({ data: ((perms[(this._ids || [])[0]]) || []).map((k) => ({ permissions: { key: k } })) }); return res({ data: [] }); },
  upsert: async (row) => { store[row.id] = row.data; return { error: null }; } }) };
// app_data uchun id ni eslab qolish
const origFrom = fakeAdmin.from; fakeAdmin.from = (t) => { const q = origFrom(t); const eq = q.eq; q.eq = function (c, v) { if (t === 'app_data' && c === 'id') this._id = v; return eq.call(this, c, v); }; return q; };
SA.getAdminClient = () => fakeAdmin;
SA.requireStaffAuth = async () => ({ ok: true, staff: staff[2] });
const sent = []; global.fetch = async (url, o) => { const body = JSON.parse(o.body); sent.push({ m: url.split('/').pop(), body }); return { json: async () => ({ ok: true, result: { username: 'testbot' } }) }; };
const TQ = require('../netlify/functions/telegram-query.js'); TQ._load = async (a, filial) => ({ ...DATA, branchStore: Object.fromEntries(Object.entries(DATA.branchStore).filter(([k]) => !filial || k === filial)) });
const H = TQ.handler; let UPD = 1;
const upd = (chat, text, secret = 'S3CRET') => H({ httpMethod: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify({ update_id: UPD++, message: { chat: { id: chat, type: 'private' }, text } }) });
async function run() {
  assert.equal((await upd(10, '/foyda', 'XATO')).statusCode, 404, 'noto\'g\'ri maxfiy kalit');
  await upd(10, '/foyda'); assert.match(sent.at(-1).body.text, /Avval ulang/);
  await upd(10, '/start 000000'); assert.match(sent.at(-1).body.text, /noto'g'ri/);
  await upd(10, '/start 123456'); assert.match(sent.at(-1).body.text, /Ulandi/);
  assert.equal(store.tg_query_bot.links['10'].staffId, 2); assert.equal(store.tg_query_bot.codes['123456'], undefined, 'kod bir martalik');
  await upd(10, '/foyda oy'); const t = sent.at(-1).body.text; assert.match(t, /729/); assert.doesNotMatch(t, /Baza/, 'filial xodimi boshqa filialni ko\'rmaydi');
  await upd(10, '/xarajat'); assert.match(sent.at(-1).body.text, /ruxsatingiz yo'q/);
  store.tg_query_bot.links['11'] = { staffId: 1 }; await upd(11, '/foyda oy'); assert.match(sent.at(-1).body.text, /Baza/, 'admin hammasini ko\'radi');
  store.tg_query_bot.links['12'] = { staffId: 3 }; await upd(12, '/foyda'); assert.match(sent.at(-1).body.text, /ruxsatingiz yo'q/);
  store.tg_query_bot.links['13'] = { staffId: 4 }; await upd(13, '/foyda'); assert.match(sent.at(-1).body.text, /tannarx/, 'foyda — tannarx ruxsatisiz yo\'q');
  // ulash kodini taxmin qilish: 5 noto'g'ri urinishdan keyin bloklanadi
  for (let i = 0; i < 5; i++) await upd(20, '/start 1111111' + i);
  store.tg_query_bot.codes['55555555'] = { staffId: 2, exp: Date.now() + 60000 };
  await upd(20, '/start 55555555'); assert.match(sent.at(-1).body.text, /Juda ko'p/);
  const n = sent.length; await H({ httpMethod: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'S3CRET' }, body: JSON.stringify({ message: { chat: { id: -100, type: 'group' }, text: '/foyda' } }) });
  assert.equal(sent.length, n, 'guruhda javob berilmaydi');
  // takroriy update_id — ikkinchi marta javob yo'q
  const dup = { httpMethod: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'S3CRET' }, body: JSON.stringify({ update_id: 9999, message: { chat: { id: 11, type: 'private' }, text: '/kassa' } }) };
  await H(dup); const m = sent.length; await H(dup); assert.equal(sent.length, m, 'takror yetkazilganda qayta javob yo\'q');
}
// v25.6.10: ilovadagi «Telegramda ulash» — kod haqiqatan saqlanadi, bir bosishli havola, keyin /start KOD ulaydi
async function oneTap() {
  const app = (b) => H({ httpMethod: 'POST', headers: { authorization: 'Bearer x' }, body: JSON.stringify(b) }).then((r) => JSON.parse(r.body));
  UPD = 20000;   // oldingi holatdagi takror-himoyadan (update_id 9999) keyin
  const r = await app({ action: 'link_code' });
  assert.equal(r.ok, true); assert.match(r.code, /^\d{8}$/);
  assert.equal(r.link, 'https://t.me/testbot?start=' + r.code, 'bir bosishli havola');
  assert.ok(store.tg_query_bot.codes[r.code], 'kod bazaga saqlandi');
  await upd(30, '/start ' + r.code); assert.match(sent.at(-1).body.text, /Ulandi/);
  assert.equal(store.tg_query_bot.links['30'].staffId, 2);
  assert.equal((await app({ action: 'link_code' })).linked, true, 'ulanganligi ko\'rinadi');
  await upd(31, '/start'); assert.match(sent.at(-1).body.text, /Telegramda ulash/, 'kodsiz /start — tushunarli yo\'riqnoma, urinish hisoblanmaydi');
  assert.equal((store.tg_query_bot.fails || {})['31'], undefined);
}
module.exports = { name: 'P110 — Telegram soʻrov boti', cases: [{ name: 'webhook: maxfiy kalit, /start kod, ruxsat, filial cheklovi, guruh e\'tiborsiz', run }, { name: 'bir bosishda ulash: kod saqlanadi, t.me havola', run: oneTap }] };
