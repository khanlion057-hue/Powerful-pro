// P77 — v25 (40-migratsiya): FILIALGA JO'NATMA — «SOTISH UCHUN» yoki «QARZGA». Haqiqiy PostgreSQL + haqiqiy `branch-transfer`.
//  • «Qarzga»: qarz QABUL QILINGANDA (kelgan son × narx); filial sotganda qarz qayta yozilmaydi.
//  • «Sotish uchun» (konsignatsiya, avvalgidek): qabulda qarz yo'q; sotilganda — jo'natmadagi narxda (optom − %).
//  • «Qarzga» tovarni filial Bazaga qaytarsa — Baza qabul qilgan son × narx qarzdan ayiriladi.
//  • Takror kalit — ikki marta yozilmaydi; «qarzga» faqat Bazadan; 40 bo'lmasa — konsignatsiya avvalgidek, «qarzga» 409.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG40 = fs.readFileSync(path.join(ROOT, 'supabase-migration-40-filial-qarzga-jonatma.sql'), 'utf8');
const PG_TABLES = ['app_data', 'app_data_branches', 'batches', 'ledger_ops', 'stock_ledger', 'branch_transfers', 'branch_transfer_shipments', 'sales'];
const USERS = { 't-admin': { id: 'u-admin' }, 't-man': { id: 'u-man' }, 't-f7': { id: 'u-f7' } };
const B = (r) => JSON.parse(r.body);
let K = 0; const key = () => 'q-' + (++K) + '-' + Math.random().toString(36).slice(2, 8);

async function world({ with40 = true } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  const cut = SCHEMA.indexOf('-- 40-MIGRATSIYA'); assert.ok(cut > 0, "schema.sql: 40-migratsiya bo'limi bor");
  await pg.exec(with40 ? SCHEMA : SCHEMA.slice(0, SCHEMA.lastIndexOf('\n', SCHEMA.lastIndexOf('-- ════', cut))));
  if (with40) { await pg.exec(MIG40); await pg.exec(MIG40); }   // takror — xavfsiz
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12000 } })]);
  await pg.query(`select stock_debt_op('baza', 'seed-q1', 'batches_create', $1::jsonb)`, [JSON.stringify({ reason: 'opening',
    batches: [{ localId: 'a1', pid: 101, qty: 20, costUsd: 20, meta: {} }] })]);
  const memTables = {
    staff: [
      { id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
      { id: 7, auth_user_id: 'u-man', role: 'sotuvchi', active: true, filial: 'baza', name: 'Omborchi', login: 'man' },
      { id: 10, auth_user_id: 'u-f7', role: 'sotuvchi', active: true, filial: 'f729', name: 'Filial 729', login: 'f7' },
    ],
    staff_roles: [{ staff_id: 7, role_id: 'r-man' }, { staff_id: 10, role_id: 'r-man' }],
    role_permissions: [{ role_id: 'r-man', permission_id: 'kirim.create', permissions: { key: 'kirim.create' } }],
    staff_audit_log: [], idempotency_keys: [], security_events: [],
  };
  require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
  return { pg, client: makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: USERS }) };
}
const v = async (pg, sql, p) => ((await pg.query(sql, p)).rows[0] || {}).v;
const debt = async (pg) => Number(await v(pg, `select coalesce((data->'branchDebt'->>'f729')::numeric, 0) v from app_data where id='main'`));
const sellBd = async (pg, qty) => Number((await v(pg, `select public._stock_fifo_out('f729', 101, $1, 'sale', $2) ->> 'bd' v`, [qty, key()])));

module.exports = {
  name: 'P77 — 40-migratsiya: filialga «qarzga» / «sotish uchun» jo\'natma (haqiqiy PostgreSQL)',
  cases: [
    { name: 'qarzga: qabulda qarz (kelgan son × narx), sotilganda qayta yo\'q; qaytarish — qarzdan ayiriladi; takror — bir marta', async run() {
      const { pg, client } = await world();
      try {
        const h = loadFunction('branch-transfer', client);
        const call = (tok, kind, payload, k) => h(post({ kind, payload, key: k || key() }, tok));
        let r = await call('t-f7', 'tr_ship', { to: 'baza', mode: 'debt', items: [{ pid: 101, qty: 1 }] });
        assert.equal(r.statusCode, 400, r.body); assert.match(B(r).error, /faqat Bazadan|qoldiq/);
        r = await call('t-man', 'tr_ship', { to: 'f729', mode: 'debt', items: [{ pid: 101, qty: 5, priceUsd: 25 }] });
        assert.equal(r.statusCode, 200, r.body); const sid = B(r).shipmentId;
        assert.equal(await debt(pg), 0, "yo'lda — hali qarz yo'q");
        const rk = key();
        r = await call('t-f7', 'tr_receive', { shipmentId: sid, items: [{ pid: 101, qty: 4 }], note: 'bittasi singan' }, rk);
        assert.equal(r.statusCode, 200, r.body); assert.equal(B(r).debtUsd, 100);
        await call('t-f7', 'tr_receive', { shipmentId: sid, items: [{ pid: 101, qty: 4 }], note: 'bittasi singan' }, rk);
        assert.equal(await debt(pg), 100, 'kelgan 4 × 25 — bir marta');
        assert.equal(await sellBd(pg, 2), 0, '«qarzga» tovar sotilganda qarz qayta yozilmaydi');
        // filial 1 donani Bazaga qaytaradi → Baza qabul qiladi → qarz −25
        r = await call('t-f7', 'tr_ship', { to: 'baza', items: [{ pid: 101, qty: 1 }] }); assert.equal(r.statusCode, 200, r.body);
        r = await call('t-man', 'tr_receive', { shipmentId: B(r).shipmentId, items: [{ pid: 101, qty: 1 }] }); assert.equal(r.statusCode, 200, r.body);
        assert.equal(await debt(pg), 75, 'qaytgan 1 × 25 qarzdan ayirildi');
      } finally { unloadFunctions(); await pg.close(); }
    } },
    { name: 'sotish uchun (standart): qabulda qarz yo\'q, sotilganda — jo\'natma narxida (optom − %)', async run() {
      const { pg, client } = await world();
      try {
        const h = loadFunction('branch-transfer', client);
        const call = (tok, kind, payload) => h(post({ kind, payload, key: key() }, tok));
        let r = await call('t-man', 'tr_ship', { to: 'f729', items: [{ pid: 101, qty: 3, priceUsd: 22.5 }] });   // optom 25 − 10%
        assert.equal(r.statusCode, 200, r.body);
        r = await call('t-f7', 'tr_receive', { shipmentId: B(r).shipmentId, items: [{ pid: 101, qty: 3 }] }); assert.equal(r.statusCode, 200, r.body);
        assert.equal(await debt(pg), 0, 'konsignatsiya — qabulda qarz yo\'q');
        assert.equal(await sellBd(pg, 2), 45, '2 × 22.5 — sotilganda');
        assert.equal(+(await v(pg, `select count(*)::int v from branch_transfer_shipments where mode='consign'`)), 1);
      } finally { unloadFunctions(); await pg.close(); }
    } },
    { name: '40 yo\'q: konsignatsiya avvalgidek ishlaydi, «qarzga» — 409 aniq xabar', async run() {
      const { pg, client } = await world({ with40: false });
      try {
        const h = loadFunction('branch-transfer', client);
        const call = (tok, kind, payload) => h(post({ kind, payload, key: key() }, tok));
        let r = await call('t-man', 'tr_ship', { to: 'f729', mode: 'debt', items: [{ pid: 101, qty: 1, priceUsd: 25 }] });
        assert.equal(r.statusCode, 409); assert.equal(B(r).code, 'MIGRATION40_PENDING');
        r = await call('t-man', 'tr_ship', { to: 'f729', items: [{ pid: 101, qty: 1, priceUsd: 25 }] });
        assert.equal(r.statusCode, 200, r.body);
      } finally { unloadFunctions(); await pg.close(); }
    } },
  ],
};
