// P81 — v25 (42-migratsiya): DILLERGA JO'NATMA — «SOTISH UCHUN» yoki «QARZGA». Haqiqiy PostgreSQL + haqiqiy `dealer-ops`.
//  • «Qarzga»: qarz JO'NATILGANDA (son × narx); diller shu tovarni sotganda qarz qayta yozilmaydi.
//  • «Sotish uchun» (avvalgidek): diller sotganda qarz = sotuv × (1 − %).
//  • Aralash ombor: sotuvda avval qarzga olingan qism; qaytarishda avval «sotish uchun» qismi, qarzga olingani qaytsa — qarzdan ayiriladi.
//  • Takror kalit — ikki marta yozilmaydi; 42 bo'lmasa — «sotish uchun» avvalgidek, «qarzga» 409.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG42 = fs.readFileSync(path.join(ROOT, 'supabase-migration-42-diller-qarzga-jonatma.sql'), 'utf8');
const PG_TABLES = ['app_data', 'app_data_branches', 'dealers', 'dealer_stock', 'dealer_stock_moves', 'dealer_sales', 'dealer_orders', 'batches', 'ledger_ops',
  'fw_audit_events', 'fw_notifications', 'fw_dealer_revisions'];
const USERS = { 't-man': { id: 'u-man' } };
const B = (r) => JSON.parse(r.body);
let K = 0; const key = () => 'dq-' + (++K) + '-' + Math.random().toString(36).slice(2, 8);

async function world({ with42 = true } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  const cut = SCHEMA.indexOf('-- 42-MIGRATSIYA'); assert.ok(cut > 0, "schema.sql: 42-migratsiya bo'limi bor");
  await pg.exec(with42 ? SCHEMA : SCHEMA.slice(0, SCHEMA.lastIndexOf('\n', SCHEMA.lastIndexOf('-- ════', cut))));
  if (with42) await pg.exec(MIG42);   // takror — xavfsiz
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ products: [{ id: 101, sku: 'A', name: 'Drel' }] })]);
  await pg.query(`select stock_debt_op('baza', 'seed-d1', 'batches_create', $1::jsonb)`, [JSON.stringify({ reason: 'opening',
    batches: [{ localId: 'a1', pid: 101, qty: 30, costUsd: 10, meta: {} }] })]);
  await pg.exec(`insert into dealers (id, login, name, filial) overriding system value values (1, 'd1', 'Diller', 'baza')`);
  const memTables = {
    staff: [{ id: 7, auth_user_id: 'u-man', role: 'sotuvchi', active: true, filial: 'baza', name: 'Menejer', login: 'man' }],
    staff_roles: [{ staff_id: 7, role_id: 'r-man' }],
    role_permissions: [{ role_id: 'r-man', permission_id: 'dillerlar.manage', permissions: { key: 'dillerlar.manage' } }],
    staff_audit_log: [], idempotency_keys: [], dealer_audit_log: [], security_events: [],
  };
  require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
  return { pg, client: makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: USERS }) };
}
const v = async (pg, sql, p) => ((await pg.query(sql, p)).rows[0] || {}).v;
const debt = async (pg) => Number(await v(pg, `select debt_usd v from dealers where id=1`));
const owned = async (pg) => (await pg.query(`select qty::float q, owned_qty::float oq, owned_usd::float ou from dealer_stock where dealer_id=1 and pid=101`)).rows[0];

module.exports = {
  name: 'P81 — 42-migratsiya: dillerga «qarzga» / «sotish uchun» jo\'natma (haqiqiy PostgreSQL)',
  cases: [
    { name: 'qarzga: qarz jo\'natilganda; sotilganda qayta yo\'q; aralash ombor; qaytarish qarzdan ayiradi; takror — bir marta', async run() {
      const { pg, client } = await world();
      try {
        const h = loadFunction('dealer-ops', client);
        const call = (b, k) => h(post({ ...b, key: k || key(), dealerId: 1 }, 't-man'));
        let r = await call({ kind: 'ship', mode: 'debt', items: [{ pid: 101, qty: 2 }] });
        assert.equal(r.statusCode, 400, "qarzga — narxsiz rad"); assert.match(B(r).error, /narxi kerak/);
        r = await call({ kind: 'ship', mode: 'boshqa', items: [{ pid: 101, qty: 2, priceUsd: 25 }] }); assert.equal(r.statusCode, 400);
        const k1 = key();
        r = await call({ kind: 'ship', mode: 'debt', items: [{ pid: 101, qty: 4, priceUsd: 25 }] }, k1);
        assert.equal(r.statusCode, 200, r.body); assert.equal(B(r).debtUsd, 100);
        await call({ kind: 'ship', mode: 'debt', items: [{ pid: 101, qty: 4, priceUsd: 25 }] }, k1);
        assert.equal(await debt(pg), 100, 'takror kalit — qarz bir marta (4 × 25)');
        assert.deepEqual(await owned(pg), { q: 4, oq: 4, ou: 100 });
        // «sotish uchun» yana 3 dona — qarz o'zgarmaydi
        r = await call({ kind: 'ship', items: [{ pid: 101, qty: 3 }] }); assert.equal(r.statusCode, 200, r.body);
        assert.equal(await debt(pg), 100, "sotish uchun — jo'natishda qarz yo'q");
        // diller 5 dona sotdi (30$, 10%): 4 tasi qarzga olingan — qarz yozilmaydi, 1 tasi konsignatsiya — 27
        r = await call({ kind: 'sale', pct: 10, items: [{ pid: 101, qty: 5, priceUsd: 30 }] }); assert.equal(r.statusCode, 200, r.body);
        assert.equal(await debt(pg), 127, 'faqat konsignatsiya qismi: 1 × 30 × 0.9');
        assert.deepEqual(await owned(pg), { q: 2, oq: 0, ou: 0 });
        // yana qarzga 2 dona (20$) → ombor 4 (2 konsign + 2 qarzga); 3 dona qaytadi: 2 konsign + 1 qarzga → −20
        r = await call({ kind: 'ship', mode: 'debt', items: [{ pid: 101, qty: 2, priceUsd: 20 }] }); assert.equal(r.statusCode, 200, r.body);
        assert.equal(await debt(pg), 167);
        r = await call({ kind: 'return', items: [{ pid: 101, qty: 3, condition: 'Yangi', localId: 'ret1' }] }); assert.equal(r.statusCode, 200, r.body);
        assert.equal(B(r).ownedReturnUsd, 20);
        assert.equal(await debt(pg), 147, 'qaytgan 1 qarzga dona × 20 qarzdan ayirildi');
        assert.deepEqual(await owned(pg), { q: 1, oq: 1, ou: 20 });
      } finally { unloadFunctions(); await pg.close(); }
    } },
    { name: 'reviziya kamomadi va diller portali sotuvi: qarzga olingan qism uchun qarz qayta yozilmaydi; takror tasdiq — bir marta', async run() {
      const { pg, client } = await world();
      try {
        const h = loadFunction('dealer-ops', client);
        await pg.exec(`insert into catalog_products (id, filial, name, qty, optim_price, point_pct) values (101, 'baza', 'Drel', 5, 20, 0)`);
        let r = await h(post({ kind: 'ship', mode: 'debt', key: key(), dealerId: 1, items: [{ pid: 101, qty: 3, priceUsd: 20 }] }, 't-man'));
        assert.equal(r.statusCode, 200, r.body);
        r = await h(post({ kind: 'ship', key: key(), dealerId: 1, items: [{ pid: 101, qty: 2 }] }, 't-man')); assert.equal(r.statusCode, 200, r.body);
        assert.equal(await debt(pg), 60);
        // reviziya: tizimda 5, kamomad 2 — ikkalasi qarzga olingan qismdan → qarz o'zgarmaydi
        const rid = (await pg.query(`insert into fw_dealer_revisions (filial, dealer_id, dealer_name, lines, op_key) values ('baza', 1, 'Diller', $1::jsonb, 'rv-q1') returning id`,
          [JSON.stringify([{ pid: 101, sku: 'A', name: 'Drel', system: 5, diff: -2 }])])).rows[0].id;
        const res = (await pg.query(`select public.dealer_revision_decide_v42($1, true, 1, 'Admin', 'admin', null, null) v`, [rid])).rows[0].v;
        assert.equal(res.status, 'approved'); assert.equal(res.result.debtDeltaUsd, 0);
        assert.equal((await pg.query(`select public.dealer_revision_decide_v42($1, true, 1, 'Admin', 'admin', null, null) v`, [rid])).rows[0].v.replay, true);
        assert.equal(await debt(pg), 60, 'kamomad qarzga olingan tovardan — qarz qayta yozilmadi (takror ham)');
        assert.deepEqual(await owned(pg), { q: 3, oq: 1, ou: 20 });
        // diller portali: 2 dona sotadi (1 qarzga + 1 konsignatsiya) → qarz faqat 1 × 20
        const U = '00000000-0000-0000-0000-0000000000d1';
        await pg.exec(`insert into auth.users values ('${U}'); update dealers set auth_user_id = '${U}' where id = 1; grant usage on schema public to authenticated;`);
        await pg.exec(`select set_config('request.jwt.claim.sub', '${U}', false); set role authenticated;`);
        await pg.query(`select public.record_dealer_sale_v42(101, 2, 20, 'A', 'Drel', 0, null::numeric)`);
        await pg.exec('reset role');
        assert.equal(await debt(pg), 80, 'portal: faqat konsignatsiya qismi qarzga');
        assert.deepEqual(await owned(pg), { q: 1, oq: 0, ou: 0 });
      } finally { unloadFunctions(); await pg.close(); }
    } },
    { name: '42 yo\'q: «sotish uchun» avvalgidek ishlaydi, «qarzga» — 409 aniq xabar', async run() {
      const { pg, client } = await world({ with42: false });
      try {
        const h = loadFunction('dealer-ops', client);
        let r = await h(post({ kind: 'ship', mode: 'debt', key: key(), dealerId: 1, items: [{ pid: 101, qty: 1, priceUsd: 25 }] }, 't-man'));
        assert.equal(r.statusCode, 409, r.body); assert.equal(B(r).code, 'MIGRATION42_PENDING');
        r = await h(post({ kind: 'ship', key: key(), dealerId: 1, items: [{ pid: 101, qty: 1 }] }, 't-man')); assert.equal(r.statusCode, 200, r.body);
        r = await h(post({ kind: 'sale', pct: 0, key: key(), dealerId: 1, items: [{ pid: 101, qty: 1, priceUsd: 30 }] }, 't-man')); assert.equal(r.statusCode, 200, r.body);
        assert.equal(await debt(pg), 30);
      } finally { unloadFunctions(); await pg.close(); }
    } },
  ],
};
