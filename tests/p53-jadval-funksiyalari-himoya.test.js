// P53 — HARDENING (taklif): `backup-daily` va `telegram-daily-report` — jadvaldan tashqari chaqiruv va takror urinish.
//  • POST + `next_run` bo'lmagan har qanday so'rov (GET, bo'sh tana, boshqa amal) — 404; bazaga va Telegram'ga murojaat YO'Q.
//  • Telegram xato bergan holatda shu soatda 10 marta chaqirilsa ham — 1 ta tashqi so'rov (avval: har chaqiruvda to'liq
//    zaxira + Telegram so'rovi). Keyingi soatda — qayta urinadi va yuboradi; kuniga bir marta qoidasi saqlanadi.
//  • Javoblarda token/chat/PIN yo'q. Izolyatsiya: PGlite + soxta fetch (tarmoq yo'q).
const assert = require('node:assert/strict');
const path = require('path'); const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions } = require('./helpers/mem-supabase');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const TOKEN = '123456789:FAKE_test_token_not_real_xxxx', CHAT = '-1001234567890', BKCHAT = '987654321';
async function world() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE); await pg.exec(SCHEMA);
  await pg.query(`update app_data set data = $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12600, tgBotToken: TOKEN, tgChatId: CHAT, tgDaily: true, tgDailyHour: 21,
    tgBackupChat: BKCHAT, tgBackupDaily: true, tgBackupHour: 21, appPin: 'PIN-SECRET-4321' }, products: [] })]);
  return { pg, client: makePgSupabase(pg, { pgTables: ['app_data', 'app_data_branches', 'cashbox_balances', 'firma_kassa_balance', 'dealer_pay_notices', 'idempotency_keys', 'ledger_ops',
    'customer_balances', 'supplier_balances', 'batches', 'sales', 'supplier_advance_balances', 'customer_credit_balances', 'dealers', 'dealer_stock', 'stock_writeoffs', 'expense_categories'],
    memTables: { staff: [], staff_roles: [], role_permissions: [], staff_audit_log: [] }, users: {} }) };
}
const sched = () => ({ httpMethod: 'POST', headers: {}, body: '{"next_run":"2026-10-14T19:05:00.000Z"}' });
async function run(fn) {
  const RealDate = global.Date, realFetch = global.fetch; let fixed = new RealDate('2026-10-14T16:30:00Z').getTime(); let tgOk = false; const calls = [];
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
  global.fetch = async (url) => { calls.push(String(url)); return { json: async () => (tgOk ? { ok: true, result: {} } : { ok: false, description: 'blocked' }) }; };
  const w = await world();
  const call = async (ev) => { const h = loadFunction(fn, w.client); try { return await h(ev, {}); } finally { unloadFunctions(); } };
  try {
    for (const ev of [{ httpMethod: 'GET', headers: {} }, { httpMethod: 'POST', headers: {}, body: '' }, { httpMethod: 'POST', headers: { authorization: 'Bearer x' }, body: '{"action":"preview"}' }]) {
      const r = await call(ev); assert.equal(r.statusCode, 404, `${fn}: jadvaldan tashqari — 404`);
    }
    assert.equal(calls.length, 0, `${fn}: 404 da tashqi so'rov yo'q`);
    assert.equal((await w.pg.query(`select count(*)::int n from idempotency_keys`)).rows[0].n, 0, `${fn}: 404 da bazaga yozuv yo'q`);
    for (let i = 0; i < 10; i++) { const r = await call(sched()); assert.ok(!/FAKE_test_token|PIN-SECRET|1001234567890|987654321/.test(r.body), 'javobda sir yo\'q'); }
    assert.equal(calls.length, 1, `${fn}: Telegram xato — shu soatda 10 chaqiruvdan faqat 1 tashqi so'rov`);
    tgOk = true; fixed += 3600e3;
    let r = await call(sched()); assert.equal(JSON.parse(r.body).ok, true); assert.equal(calls.length, 2, 'keyingi soatda yuborildi');
    fixed += 3600e3; r = await call(sched()); assert.equal(JSON.parse(r.body).skipped, 'sent', 'kuniga bir marta'); assert.equal(calls.length, 2);
  } finally { global.Date = RealDate; global.fetch = realFetch; await w.pg.close(); }
}
module.exports = {
  name: "P53 — HARDENING: jadval funksiyalari (backup-daily, telegram-daily-report) — jadvaldan tashqari 404, soatiga bitta urinish",
  cases: [
    { name: 'backup-daily: 404, yon ta\'sirsiz; xato bo\'lsa soatiga 1 urinish; kuniga 1 marta', run: () => run('backup-daily') },
    { name: 'telegram-daily-report: 404, yon ta\'sirsiz; xato bo\'lsa soatiga 1 urinish; kuniga 1 marta', run: () => run('telegram-daily-report') },
  ],
};
