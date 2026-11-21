// H1 (hardening dalili, npm test'ga kirmaydi): `backup-daily` va `telegram-daily-report` — AVTORIZATSIYASIZ chaqiruv.
// IZOLYATSIYA: PGlite (to'liq schema.sql) + mem auth; global.fetch soxta (Telegram'ga HECH NARSA chiqmaydi, faqat qayd).
// O'lchanadi: HTTP status va javob tanasi, tashqi so'rovlar soni, bazadagi o'zgarishlar (idempotency_keys, app_data),
// javobda sir (token/PIN/chat) bor-yo'qligi; Telegram xato bergan holatda takroriy chaqiruvlarning narxi.
// Ishlatish: node tests/h1-jadval-funksiyalari-probe.js [loyiha ildizi]  → JSON (dalil)
const path = require('path'); const fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { PRELUDE } = require(path.join(ROOT, 'tests', 'p8-noldan-ornatish.test.js'))._helpers;
const { makePgSupabase } = require(path.join(ROOT, 'tests', 'helpers', 'pg-supabase'));
const { loadFunction, unloadFunctions } = require(path.join(ROOT, 'tests', 'helpers', 'mem-supabase'));
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const TOKEN = '123456789:FAKE_test_token_not_real_xxxx', CHAT = '-1001234567890', BKCHAT = '987654321', PIN = 'PIN-SECRET-4321';
const SECRET_RE = /FAKE_test_token|PIN-SECRET|-1001234567890|987654321|tgBotToken|appPin/;

async function world() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE); await pg.exec(SCHEMA);
  const data = { settings: { company: 'Sintetik', usdUzs: 12600, tgBotToken: TOKEN, tgChatId: CHAT, tgDaily: true, tgDailyHour: 21, tgBackupChat: BKCHAT, tgBackupDaily: true, tgBackupHour: 22, appPin: PIN },
    products: [{ id: 1, sku: 'A', name: 'Drel' }], branchStore: { baza: { sales: [], customers: [{ id: 1, name: 'Ali', debt: 1000 }], cashboxes: [] } } };
  await pg.query(`update app_data set data = $1::jsonb where id='main'`, [JSON.stringify(data)]);
  const client = makePgSupabase(pg, { pgTables: ['app_data', 'app_data_branches', 'cashbox_balances', 'firma_kassa_balance', 'dealer_pay_notices', 'idempotency_keys', 'ledger_ops',
    'customer_balances', 'supplier_balances', 'batches', 'sales', 'supplier_advance_balances', 'customer_credit_balances', 'dealers', 'dealer_stock', 'stock_writeoffs', 'expense_categories'],
    memTables: { staff: [], staff_roles: [], role_permissions: [], staff_audit_log: [] }, users: {} });
  return { pg, client };
}
const EVENTS = [
  ['GET, sarlavhasiz', { httpMethod: 'GET', headers: {}, body: null }],
  ['POST, bo\'sh', { httpMethod: 'POST', headers: {}, body: '' }],
  ['POST, soxta next_run', { httpMethod: 'POST', headers: {}, body: '{"next_run":"2026-10-14T00:05:00Z"}' }],
  ['POST, begona token', { httpMethod: 'POST', headers: { authorization: 'Bearer t-fake' }, body: '{"action":"preview"}' }],
];
async function scenario(fn, tgOk, repeats) {
  const realFetch = global.fetch; const calls = [];
  global.fetch = async (url, opts) => { calls.push(String(url).replace(/bot[^/]+/, 'bot<TOKEN>')); return { json: async () => (tgOk ? { ok: true, result: {} } : { ok: false, description: 'Forbidden: bot was blocked by the user' }) }; };
  const w = await world(); const before = (await w.pg.query(`select md5(data::text) m from app_data where id='main'`)).rows[0].m;
  const results = [];
  try {
    for (let i = 0; i < repeats; i++) for (const [label, ev] of EVENTS) {
      const h = loadFunction(fn, w.client); const t0 = Date.now();
      const r = await h(ev, {}); unloadFunctions();
      results.push({ label, status: r.statusCode, body: String(r.body), ms: Date.now() - t0, secret: SECRET_RE.test(String(r.body)) });
    }
    const after = (await w.pg.query(`select md5(data::text) m from app_data where id='main'`)).rows[0].m;
    const idem = (await w.pg.query(`select count(*)::int n from idempotency_keys`)).rows[0].n;
    return { fn, telegram: tgOk ? 'ok' : 'xato', chaqiruvlar: results.length, statuslar: [...new Set(results.map(r => r.status))],
      javoblar: [...new Set(results.map(r => r.body))], tashqi_sorovlar: calls.length, tashqi_manzillar: [...new Set(calls)],
      sir_javobda: results.some(r => r.secret), app_data_ozgardi: before !== after, idempotency_qatorlar: idem,
      ortacha_ms: Math.round(results.reduce((a, r) => a + r.ms, 0) / results.length) };
  } finally { global.fetch = realFetch; await w.pg.close(); }
}
(async () => {
  // Toshkent vaqti qat'iy 23:30 (har ikki funksiya uchun 'vaqti kelgan')
  const RealDate = global.Date, fixed = new RealDate('2026-10-14T18:30:00Z').getTime();
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
  const out = [];
  for (const fn of ['backup-daily', 'telegram-daily-report']) { out.push(await scenario(fn, true, 3)); out.push(await scenario(fn, false, 3)); }
  console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
