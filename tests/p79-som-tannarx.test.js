// P79 — v25 (41-migratsiya): SO'MDA HISOB — tannarx kirim kursida so'mda qotadi, kurs o'zgarsa ham so'mda o'zgarmaydi.
//  • Belgilash: cost_uzs = cost_usd × kirim kursi (bir marta; qayta belgilash o'zgartirmaydi).
//  • Kurs o'zgardi: faqat so'mda hisoblanadigan, qoldig'i bor partiyalarda cost_usd = cost_uzs / bugungi kurs.
//  • $ dagi partiyalar, tugagan partiyalar va boshqa filial — tegilmaydi. Ruxsat: belgilash — kirim/ombor; kurs — savdo xodimi ham.
//  • 41 bo'lmasa — 409 MIGRATION41_PENDING.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG41 = fs.readFileSync(path.join(ROOT, 'supabase-migration-41-som-tannarx.sql'), 'utf8');
const PG_TABLES = ['app_data', 'app_data_branches', 'batches', 'ledger_ops', 'stock_ledger', 'sales'];
const B = (r) => JSON.parse(r.body);
let K = 0; const key = () => 'u-' + (++K) + '-' + Math.random().toString(36).slice(2, 8);

async function world({ with41 = true } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  const cut = SCHEMA.indexOf('-- 41-MIGRATSIYA');
  await pg.exec(with41 || cut < 0 ? SCHEMA : SCHEMA.slice(0, SCHEMA.lastIndexOf('\n', SCHEMA.lastIndexOf('-- ════', cut))));
  if (with41) { await pg.exec(MIG41); await pg.exec(MIG41); }
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12500 } })]);
  await pg.query(`select stock_debt_op('baza', 'seed-u1', 'batches_create', $1::jsonb)`, [JSON.stringify({ reason: 'opening', batches: [
    { localId: 'uz1', pid: 1, qty: 10, costUsd: 100, meta: { rateUsdUzs: 12500, cur: 'UZS' } },
    { localId: 'us1', pid: 2, qty: 10, costUsd: 50, meta: { rateUsdUzs: 12500 } },
    { localId: 'uz2', pid: 3, qty: 1, costUsd: 8, meta: { rateUsdUzs: 12500 } } ] })]);
  await pg.query(`select public._stock_fifo_out('baza', 3, 1, 'sale', 'sold-uz2')`);   // uz2 — tugagan
  const memTables = {
    staff: [{ id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
            { id: 9, auth_user_id: 'u-sel', role: 'sotuvchi', active: true, filial: 'baza', name: 'Sotuvchi', login: 'sel' }],
    staff_roles: [{ staff_id: 9, role_id: 'r-sel' }],
    role_permissions: [{ role_id: 'r-sel', permission_id: 'savdo.create', permissions: { key: 'savdo.create' } }],
    staff_audit_log: [], idempotency_keys: [], security_events: [],
  };
  require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
  return { pg, client: makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: { 't-admin': { id: 'u-admin' }, 't-sel': { id: 'u-sel' } } }) };
}
const row = async (pg, lid) => (await pg.query(`select cost_usd::float c, cost_uzs::float u from batches where local_id=$1`, [lid])).rows[0];

module.exports = {
  name: 'P79 — 41-migratsiya: so\'mda hisob — tannarx so\'mda qotadi (haqiqiy PostgreSQL)',
  cases: [
    { name: 'belgilash → kurs 13 000 → $ tannarx qayta, so\'mda o\'zgarmaydi; $ dagi va tugagan partiya — tegilmaydi; ruxsatlar', async run() {
      const { pg, client } = await world();
      try {
        const h = loadFunction('stock-debt-ops', client);
        const call = (tok, payload) => h(post({ kind: 'acc_uzs', payload, key: key() }, tok));
        let r = await call('t-sel', { mark: ['uz1'] }); assert.equal(r.statusCode, 403, 'sotuvchi belgilay olmaydi');
        r = await call('t-admin', { mark: ['uz1', 'uz2'] }); assert.equal(r.statusCode, 200, r.body); assert.equal(B(r).marked, 2);
        assert.deepEqual(await row(pg, 'uz1'), { c: 100, u: 1250000 });
        await pg.query(`update app_data set data = jsonb_set(data, '{settings,usdUzs}', '13000') where id='main'`);
        r = await call('t-admin', { mark: ['uz1'] }); assert.equal(B(r).marked, 0, 'qayta belgilash so\'mdagi tannarxni o\'zgartirmaydi');
        r = await call('t-sel', { reprice: true }); assert.equal(r.statusCode, 200, r.body); assert.equal(B(r).repriced, 1);
        const a = await row(pg, 'uz1');
        assert.equal(a.u, 1250000); assert.ok(Math.abs(a.c - 1250000 / 13000) < 1e-6, '$ tannarx = 1 250 000 / 13 000');
        assert.ok(Math.abs(a.c * 13000 - 1250000) < 0.01, 'so\'mda aynan o\'sha');
        assert.deepEqual(await row(pg, 'us1'), { c: 50, u: null }, '$ dagi partiya tegilmadi');
        assert.equal((await row(pg, 'uz2')).c, 8, 'tugagan partiya tegilmadi');
        assert.ok(B(r).authority && B(r).authority.batches.some(b => b.localId === 'uz1'), 'brauzerga yangi tannarx qaytdi');
        r = await call('t-sel', { reprice: true }); assert.equal(B(r).repriced, 0, 'takror — o\'zgarish yo\'q');
      } finally { unloadFunctions(); await pg.close(); }
    } },
    { name: '41 yo\'q — 409 aniq xabar', async run() {
      const { pg, client } = await world({ with41: false });
      try {
        const r = await loadFunction('stock-debt-ops', client)(post({ kind: 'acc_uzs', payload: { reprice: true }, key: key() }, 't-admin'));
        assert.equal(r.statusCode, 409); assert.equal(B(r).code, 'MIGRATION41_PENDING');
      } finally { unloadFunctions(); await pg.close(); }
    } },
  ],
};
