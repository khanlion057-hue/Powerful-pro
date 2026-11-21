// P33 — v24.4 (33-migratsiya): TA'MINOTCHIGA ZAKLAD — yuanda, $ kassadan; xizmat — xarajat; zakladdan qarzni yopish.
// HAQIQIY PostgreSQL (PGlite) + HAQIQIY `supplier-advance` server funksiyasi. Har holatda BAZADAGI natija tekshiriladi.
//  • Egasi misoli: 10 000 ¥ + 0,6%, kurs 6,65 → kassadan 1 512,78 $; zaklad 1 503,76 $; xarajat 9,02 $.
//  • Faqat $ kassa; mablag' yetmasa — hech narsa yozilmaydi; takror so'rov ikki marta yozilmaydi; huquqsiz — 403.
//  • Bosh kassa ($): firma_kassa.transact kerak; ikki yozuv (ta'minotchi to'lovi + xarajat).
//  • Zakladdan yopish: qarzdan ham, zakladdan ham ortiq emas; to'lov tarixiga yoziladi; jurnal o'zgarmas.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG33 = fs.readFileSync(path.join(ROOT, 'supabase-migration-33-taminotchi-zaklad.sql'), 'utf8');
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger',
  'supplier_balances', 'supplier_debt_ledger', 'supplier_payments', 'ledger_ops', 'supplier_advance_balances', 'supplier_advance_ledger'];
const BOXES = [{ id: 1, name: "Naqd so'm", cur: 'UZS', type: 'cash' }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd' }];
const BRANCH = { cashboxes: BOXES, suppliers: [{ id: 501, name: 'Guangzhou Tools Ltd', country: 'Xitoy', debt: 0 }], customers: [], sales: [], batches: [], expenses: [] };
const USERS = { 't-admin': { id: 'u-admin' }, 't-kir': { id: 'u-kir' }, 't-fk': { id: 'u-fk' }, 't-s1': { id: 'u-s1' }, 't-ed': { id: 'u-ed' } };
const ROLE = (rid, keys) => keys.map(k => ({ role_id: rid, permission_id: k, permissions: { key: k } }));

async function world({ no33 = false } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  const cut = SCHEMA.indexOf('\n-- ────────────────────────────────────────────────────────────────────\n-- 17. 33-migratsiya');
  assert.ok(cut > 0, "schema.sql: 33-migratsiya bo'limi bor");
  await pg.exec(SCHEMA.slice(0, cut));                              // 0..32
  if (!no33) { await pg.exec(MIG33); await pg.exec(MIG33); }        // ikki marta — idempotent
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12500, usdCny: 7.1 }, branchStore: { f729: { cashboxes: BOXES } } })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('f729', $1::jsonb)`, [JSON.stringify(BRANCH)]);
  await pg.query(`select cashbox_apply_ops('f729','seed-usd','manual_in','[{"box":3,"currency":"USD","dir":"in","amount":2000}]'::jsonb)`);
  await pg.query(`select cashbox_apply_ops('f729','seed-uzs','manual_in','[{"box":1,"currency":"UZS","dir":"in","amount":50000000}]'::jsonb)`);
  await pg.query(`select public._fk_cash_move('USD','in',5000,'deposit', p_idem_key => 'fk-seed')`);
  const memTables = {
    staff: [
      { id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
      { id: 7, auth_user_id: 'u-kir', role: 'sotuvchi', active: true, filial: 'f729', name: 'Kirimchi', login: 'kir' },
      { id: 8, auth_user_id: 'u-fk', role: 'sotuvchi', active: true, filial: 'f729', name: 'Kassir', login: 'fk' },
      { id: 9, auth_user_id: 'u-s1', role: 'sotuvchi', active: true, filial: 'f729', name: 'Sotuvchi', login: 's1' },
      { id: 10, auth_user_id: 'u-ed', role: 'sotuvchi', active: true, filial: 'f729', name: 'Taminot', login: 'ed' },
    ],
    staff_roles: [{ staff_id: 7, role_id: 'kir' }, { staff_id: 8, role_id: 'fk' }, { staff_id: 9, role_id: 'sel' }, { staff_id: 10, role_id: 'ed' }],
    role_permissions: [...ROLE('kir', ['kirim.create']), ...ROLE('fk', ['kirim.create', 'firma_kassa.transact']), ...ROLE('sel', ['savdo.create']), ...ROLE('ed', ['taminotchilar.edit', 'taminotchilar.view'])],
    staff_audit_log: [], security_events: [],
  };
  return { pg, client: makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: USERS }) };
}
async function withWorld(opts, fn) { const w = await world(opts); try { await fn(w); } finally { unloadFunctions(); await w.pg.close(); } }
const body = (r) => JSON.parse(r.body);
const num = async (pg, sql, p) => +(((await pg.query(sql, p)).rows[0] || {}).v ?? NaN);
const box = (pg, id) => num(pg, `select balance v from cashbox_balances where filial='f729' and box_local_id=$1`, [id]);
const adv = (pg) => num(pg, `select coalesce((select balance_usd from supplier_advance_balances where filial='f729' and supplier_local_id=501),0) v`);

async function testPayFromBox() {
  await withWorld({}, async ({ pg, client }) => {
    const fn = loadFunction('supplier-advance', client);
    const pay = (tok, extra = {}) => fn(post({ action: 'pay', filial: 'f729', suppId: 501, source: 'box', boxId: 3, cny: 10000, feePct: 0.6, rate: 6.65, idemKey: 'adv-key-001', ...extra }, tok));
    let r = await pay('t-kir');
    assert.equal(r.statusCode, 200, r.body);
    const p = body(r).payment;
    assert.deepEqual([p.usd, p.feeUsd, p.totalUsd, +p.advanceUsd], [1503.76, 9.02, 1512.78, 1503.76], 'egasi misoli: 1 503,76 + 9,02 = 1 512,78');
    assert.equal(await box(pg, 3), 487.22, '$ kassadan jami chiqdi (2000 − 1512,78)');
    assert.equal(await adv(pg), 1503.76, "ta'minotchiga faqat yuan summasi");
    const cl = (await pg.query(`select amount::float8 a, op_kind, ref_type from cashbox_ledger where filial='f729' and op_kind='supp_advance' order by id`)).rows;
    assert.deepEqual(cl.map(x => [x.a, x.ref_type]), [[1503.76, 'supplier_advance'], [9.02, 'expense']], 'kassa jurnali: zaklad + xizmat (xarajat)');
    assert.equal(await num(pg, `select debt v from supplier_balances where filial='f729' and supplier_local_id=501`) || 0, 0, "qarzga tegilmadi");
    // takror — ikki marta yozilmaydi
    r = await pay('t-kir'); assert.equal(body(r).payment.replay, true); assert.equal(await box(pg, 3), 487.22);
    // so'm kassasi — rad; mablag' yetmasa — hech narsa yozilmaydi; huquqsiz — 403; kurs juda farq — rad
    r = await pay('t-kir', { boxId: 1, idemKey: 'adv-key-002' }); assert.equal(r.statusCode, 400); assert.match(body(r).error, /\$ kassa/);
    r = await pay('t-kir', { cny: 100000, idemKey: 'adv-key-003' }); assert.equal(r.statusCode, 400); assert.match(body(r).error, /yetarli emas/);
    assert.equal(await adv(pg), 1503.76, 'yetmagan zaklad — yozilmadi');
    r = await pay('t-s1', { idemKey: 'adv-key-004' }); assert.equal(r.statusCode, 403);
    r = await pay('t-kir', { rate: 3, idemKey: 'adv-key-005' }); assert.equal(r.statusCode, 400); assert.match(body(r).error, /farq/);
    // ro'yxat
    r = await fn(post({ action: 'list', filial: 'f729' }, 't-ed'));
    assert.equal(body(r).balances['501'], 1503.76); assert.equal(body(r).items[0].cny, 10000);
    // jurnal o'zgarmas
    await assert.rejects(pg.query(`update supplier_advance_ledger set usd_amount = 1`), /ZAKLAD/);
    await assert.rejects(pg.query(`update supplier_advance_balances set balance_usd = 99999`), /ZAKLAD/);
  });
}

async function testFirmaAndApply() {
  await withWorld({}, async ({ pg, client }) => {
    const fn = loadFunction('supplier-advance', client);
    let r = await fn(post({ action: 'pay', filial: 'f729', suppId: 501, source: 'firma', cny: 10000, feePct: 0.6, rate: 6.65, idemKey: 'adv-firma-01' }, 't-kir'));
    assert.equal(r.statusCode, 403, 'Bosh kassa uchun firma_kassa.transact kerak');
    r = await fn(post({ action: 'pay', filial: 'f729', suppId: 501, source: 'firma', cny: 10000, feePct: 0.6, rate: 6.65, idemKey: 'adv-firma-02' }, 't-fk'));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(await num(pg, `select balance v from firma_kassa_balance where currency='USD'`), 3487.22, 'Bosh kassa: 5000 − 1512,78');
    const fk = (await pg.query(`select op_type, amount::float8 a from firma_kassa_ledger where direction='out' order by id`)).rows;
    assert.deepEqual(fk.map(x => [x.op_type, x.a]), [['supplier_payment', 1503.76], ['expense', 9.02]]);
    // tovar keldi — qarz 1000 $; zakladdan 800 yopiladi
    await pg.query(`select public._supp_debt_move('f729', 501, 1000, 0, 'set', 'adjust', 'test-debt-1')`);
    r = await fn(post({ action: 'apply', filial: 'f729', suppId: 501, amountUsd: 800, idemKey: 'adv-apply-01' }, 't-ed'));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(+body(r).apply.supplierDebt, 200); assert.equal(+body(r).apply.advanceUsd, 703.76);
    assert.equal(await adv(pg), 703.76);
    assert.equal(await num(pg, `select count(*)::int v from supplier_payments where idem_key='sadp:sadp:adv-apply-01'`), 1, "to'lov tarixiga yozildi");
    r = await fn(post({ action: 'apply', filial: 'f729', suppId: 501, amountUsd: 800, idemKey: 'adv-apply-01' }, 't-ed'));
    assert.equal(body(r).apply.replay, true); assert.equal(await adv(pg), 703.76, 'takror — yozilmadi');
    r = await fn(post({ action: 'apply', filial: 'f729', suppId: 501, amountUsd: 300, idemKey: 'adv-apply-02' }, 't-ed'));
    assert.equal(r.statusCode, 400, 'qarzdan (200) ortiq — rad'); assert.equal(await adv(pg), 703.76);
    r = await fn(post({ action: 'apply', filial: 'f729', suppId: 501, amountUsd: 150, idemKey: 'adv-apply-03' }, 't-kir'));
    assert.equal(r.statusCode, 403, "yopish — taminotchilar.edit");
  });
}

async function testWithout33() {
  await withWorld({ no33: true }, async ({ client }) => {
    const fn = loadFunction('supplier-advance', client);
    let r = await fn(post({ action: 'pay', filial: 'f729', suppId: 501, source: 'box', boxId: 3, cny: 100, feePct: 0.6, rate: 6.65, idemKey: 'adv-no33-01' }, 't-admin'));
    assert.equal(r.statusCode, 409); assert.equal(body(r).migration33Pending, true);
    r = await fn(post({ action: 'list', filial: 'f729' }, 't-admin')); assert.equal(r.statusCode, 200); assert.equal(body(r).migration33Pending, true);
  });
}

module.exports = {
  name: "P33 — v24.4 (33-migratsiya): ta'minotchiga zaklad — yuanda, $ kassadan, xizmat — xarajat, zakladdan qarzni yopish",
  cases: [
    { name: "$ kassadan zaklad: 10 000 ¥ + 0,6% / 6,65 = 1 512,78 $ (zaklad 1 503,76, xarajat 9,02); takrorsiz; so'm kassa, yetmagan mablag', huquq, kurs — rad", run: testPayFromBox },
    { name: "Bosh kassadan zaklad (ikki yozuv); zakladdan qarzni yopish — qarzdan/zakladdan ortiq emas, to'lov tarixida, takrorsiz", run: testFirmaAndApply },
    { name: "33-migratsiyasiz — 409", run: testWithout33 },
  ],
};
