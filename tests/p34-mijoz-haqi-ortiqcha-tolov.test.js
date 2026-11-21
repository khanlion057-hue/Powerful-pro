// P34 — v24.5 (34-migratsiya): MIJOZ HAQI — ortiqcha to'lov va savdoda haqdan foydalanish.
// HAQIQIY PostgreSQL (PGlite) + HAQIQIY server funksiyalari (sale-checkout-atomic, sale-ops). Har holatda BAZADAGI natija.
//  • Ortiqcha to'lov: pul kassaga to'liq tushadi; avval mijoz qarzi uziladi, qolgani — haq. Mijozsiz — rad.
//  • Haqdan foydalanish: haqdan ortiq emas (yetmasa hech narsa yozilmaydi); o'chirishda haq qaytadi, kassadan faqat naqd qism.
//  • Xavfsizlik: «to'langan» summa kassaga tushum + haqdan oshsa — rad (qarz kam yozilmaydi).
//  • Haqdan to'langan savdoni tahrirlash — taqiq; takror so'rov ikki marta yozilmaydi; 34-siz — 409.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG34 = fs.readFileSync(path.join(ROOT, 'supabase-migration-34-mijoz-haqi.sql'), 'utf8');
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger',
  'sales', 'batches', 'customer_balances', 'supplier_balances', 'customer_debt_payments', 'supplier_payments', 'home_withdrawals',
  'idempotency_keys', 'ledger_ops', 'customer_debt_ledger', 'supplier_debt_ledger', 'stock_ledger',
  'fw_audit_events', 'fw_notifications', 'fw_dealer_revisions', 'dealers', 'dealer_stock', 'dealer_stock_moves', 'dealer_sales',
  'customer_credit_balances', 'customer_credit_ledger', 'sale_credit_uses'];
const BOXES = [{ id: 1, name: "Naqd So'm", cur: 'UZS', type: 'cash', bal: 0 }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 0 }];
const BRANCH = {
  cashboxes: BOXES, cashTxns: [], expenses: [], customers: [{ id: 501, name: 'Ali', debt: 0 }, { id: 502, name: 'Vali', debt: 0 }],
  suppliers: [], batches: [{ id: 9001, pid: 101, bno: '01', qty: 50, sold: 0, costUsd: 5, date: '2026-09-01', status: 'active' }], sales: [],
};
const USERS = { 't-admin': { id: 'u-admin' }, 't-s1': { id: 'u-s1' } };
const ROLE = (rid, keys) => keys.map(k => ({ role_id: rid, permission_id: k, permissions: { key: k } }));

async function world({ no34 = false } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  const cut = SCHEMA.indexOf('\n-- ────────────────────────────────────────────────────────────────────\n-- 18. 34-migratsiya');
  assert.ok(cut > 0, "schema.sql: 34-migratsiya bo'limi bor");
  await pg.exec(SCHEMA.slice(0, cut));                                // 0..33
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12500 }, products: [{ id: 101, sku: 'A-101', name: 'Drel', markupPct: 60 }], branchStore: { f729: { cashboxes: BOXES } } })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('f729', $1::jsonb)`, [JSON.stringify(BRANCH)]);
  await pg.query(`select set_config('fw.stock_move','1',false)`);
  await pg.query(`insert into batches (filial, local_id, pid, qty, sold, cost_usd, status) values ('f729','9001',101,50,0,5,'active')`);
  await pg.query(`select set_config('fw.stock_move','',false)`);
  if (!no34) { await pg.exec(MIG34); await pg.exec(MIG34); }          // ikki marta — idempotent
  await pg.query(`select cashbox_apply_ops('f729','seed-uzs','manual_in','[{"box":1,"currency":"UZS","dir":"in","amount":1000000}]'::jsonb)`);
  await pg.query(`select cashbox_apply_ops('f729','seed-usd','manual_in','[{"box":3,"currency":"USD","dir":"in","amount":100}]'::jsonb)`);
  // Ali'ning eski qarzi: 30 000 so'm
  await pg.query(`select public._cust_debt_move('f729', 501, 30000, 'strict', 'adjust', 'seed-debt')`);
  const memTables = {
    staff: [
      { id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
      { id: 7, auth_user_id: 'u-s1', role: 'sotuvchi', active: true, filial: 'f729', name: 'Sotuvchi', login: 's1' },
    ],
    staff_roles: [{ staff_id: 7, role_id: 'sel' }],
    role_permissions: [...ROLE('sel', ['savdo.create'])],
    staff_audit_log: [], security_events: [],
  };
  require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
  require('../netlify/functions/_lib/cashAuthority')._resetCashAuthorityCache();
  require('../netlify/functions/_lib/auditAuthority')._resetV34Cache();
  return { pg, client: makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: USERS }) };
}
async function withWorld(opts, fn) { const w = await world(opts); try { await fn(w); } finally { unloadFunctions(); await w.pg.close(); } }
const body = (r) => JSON.parse(r.body);
const num = async (pg, sql, p) => +(((await pg.query(sql, p)).rows[0] || {}).v ?? NaN);
const box = (pg, id) => num(pg, `select balance v from cashbox_balances where filial='f729' and box_local_id=$1`, [id]);
const debt = (pg, c) => num(pg, `select coalesce((select debt from customer_balances where filial='f729' and customer_local_id=$1),0) v`, [c]);
const credit = (pg, c) => num(pg, `select coalesce((select credit_uzs from customer_credit_balances where filial='f729' and customer_local_id=$1),0) v`, [c]);
const left = (pg) => num(pg, `select coalesce(sum(qty-sold),0) v from batches where filial='f729' and pid=101 and status='active'`);
// 2 dona × 8$ = 16$ = 200 000 so'm (kurs 12 500)
const sale = (h, key, o = {}) => h(post({ filial: 'f729', items: [{ pid: 101, qty: 2, sellUsd: 8, costUsd: 5 }], paidUsd: o.paidUsd ?? 16, custId: o.custId ?? null,
  boxPayments: o.boxPayments ?? [{ box_id: 1, amount_native: 200000 }], inv: 'INV-' + key, idemKey: key, saleLocalId: 's' + key, payType: o.payType || 'cash_uzs',
  custName: 'X', overpay: o.overpay, creditUseUzs: o.creditUseUzs }, o.token || 't-s1'));

async function testOverpay() {
  await withWorld({}, async ({ pg, client }) => {
    const ck = loadFunction('sale-checkout-atomic', client);
    // 250 000 berdi (chek 200 000): 50 000 ortiqcha → 30 000 qarz uziladi, 20 000 haq
    let r = await sale(ck, 'ov-1', { custId: 501, overpay: { box_id: 1, amount_native: 50000 } });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(await box(pg, 1), 1250000, "kassaga to'liq 250 000 tushdi");
    assert.equal(await debt(pg, 501), 0, 'eski qarz uzildi'); assert.equal(await credit(pg, 501), 20000, 'qolgani — haq');
    assert.equal(+body(r).custDebtUzs, 0); assert.equal(+body(r).custCreditUzs, 20000);
    assert.equal(+body(r).balances['1'], 1250000, 'javobda kassa qoldig\'i');
    const cl = (await pg.query(`select op_kind, amount::float8 a from cashbox_ledger where filial='f729' and op_kind in ('sale','cust_credit') order by id`)).rows;
    assert.deepEqual(cl.map(x => [x.op_kind, x.a]), [['sale', 200000], ['cust_credit', 50000]]);
    // takror — ikki marta yozilmaydi
    r = await sale(ck, 'ov-1', { custId: 501, overpay: { box_id: 1, amount_native: 50000 } });
    assert.equal(r.statusCode, 200); assert.equal(await box(pg, 1), 1250000); assert.equal(await credit(pg, 501), 20000);
    // mijozsiz — rad (hech narsa yozilmaydi)
    r = await sale(ck, 'ov-2', { overpay: { box_id: 1, amount_native: 50000 } });
    assert.equal(r.statusCode, 400); assert.match(body(r).error, /mijoz/);
    assert.equal(await box(pg, 1), 1250000); assert.equal(await left(pg), 48);
    // $ kassaga ortiqcha: 1$ = 12 500 so'm haq
    r = await sale(ck, 'ov-3', { custId: 502, payType: 'usd', boxPayments: [{ box_id: 3, amount_native: 16 }], overpay: { box_id: 3, amount_native: 1 } });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(await box(pg, 3), 117); assert.equal(await credit(pg, 502), 12500);
  });
}

async function testCreditUseAndVoid() {
  await withWorld({}, async ({ pg, client }) => {
    const ck = loadFunction('sale-checkout-atomic', client), ops = loadFunction('sale-ops', client);
    await sale(ck, 'ov-1', { custId: 501, overpay: { box_id: 1, amount_native: 150000 } });   // 30 000 qarz + 120 000 haq
    assert.equal(await credit(pg, 501), 120000);
    // Keyingi savdo 200 000: 120 000 haqdan + 80 000 naqd
    let r = await sale(ck, 'cu-1', { custId: 501, paidUsd: 16, boxPayments: [{ box_id: 1, amount_native: 80000 }], creditUseUzs: 120000 });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(await credit(pg, 501), 0); assert.equal(await debt(pg, 501), 0, 'qarz yozilmadi — toʻliq toʻlangan');
    const kassa1 = await box(pg, 1);
    const s = (await pg.query(`select pay_type, box_id, mixed_rows from sales where local_id='scu-1'`)).rows[0];
    assert.equal(s.pay_type, 'mixed'); assert.equal(s.box_id, null); assert.equal(+s.mixed_rows[0].amount, 80000, 'kassa qatori — faqat naqd');
    // haqdan ortiq — rad, hech narsa yozilmaydi
    r = await sale(ck, 'cu-2', { custId: 501, paidUsd: 16, boxPayments: [{ box_id: 1, amount_native: 100000 }], creditUseUzs: 100000 });
    assert.equal(r.statusCode, 400); assert.match(body(r).error, /haqi yetarli emas/);
    assert.equal(await box(pg, 1), kassa1); assert.equal(await num(pg, `select count(*)::int v from sales where local_id='scu-2'`), 0);
    // tahrir — taqiq
    r = await ops(post({ filial: 'f729', action: 'edit', key: 'ed-cu-1', saleLocalId: 'scu-1', mode: 'price', payload: { prices: [9] } }, 't-admin'));
    assert.equal(r.statusCode, 409); assert.match(body(r).error, /haqidan/);
    // o'chirish — kassadan faqat 80 000 chiqadi, haq 120 000 qaytadi
    r = await ops(post({ filial: 'f729', action: 'void', key: 'vd-cu-1', saleLocalId: 'scu-1', batchIds: ['vb-1'] }, 't-admin'));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(await box(pg, 1), kassa1 - 80000); assert.equal(await credit(pg, 501), 120000, 'haq qaytdi');
    assert.equal(+body(r).custCreditUzs, 120000);
    // jurnal o'zgarmas, haq qoldig'i faqat funksiya orqali
    await assert.rejects(pg.query(`update customer_credit_ledger set delta_uzs = 1`), /HAQ/);
    await assert.rejects(pg.query(`update customer_credit_balances set credit_uzs = 999999`), /HAQ/);
  });
}

async function testPaidGuard() {
  await withWorld({}, async ({ pg, client }) => {
    const ck = loadFunction('sale-checkout-atomic', client);
    // brauzer «16$ to'landi» deydi, kassaga esa 50 000 so'm (4$) — rad
    let r = await sale(ck, 'pg-1', { custId: 502, paidUsd: 16, boxPayments: [{ box_id: 1, amount_native: 50000 }] });
    assert.equal(r.statusCode, 400); assert.match(body(r).error, /kassaga tushumdan .*oshib/);
    assert.equal(await left(pg), 50, 'ombor oʻzgarmadi');
    // to'g'ri: 4$ to'landi, 12$ (150 000 so'm) qarz
    r = await sale(ck, 'pg-2', { custId: 502, paidUsd: 4, boxPayments: [{ box_id: 1, amount_native: 50000 }] });
    assert.equal(r.statusCode, 200, r.body); assert.equal(await debt(pg, 502), 150000);
  });
}

async function testWithout34() {
  await withWorld({ no34: true }, async ({ pg, client }) => {
    const ck = loadFunction('sale-checkout-atomic', client);
    let r = await sale(ck, 'n34-1', { custId: 501, overpay: { box_id: 1, amount_native: 50000 } });
    assert.equal(r.statusCode, 409); assert.equal(body(r).code, 'MIGRATION34_PENDING');
    r = await sale(ck, 'n34-2', { custId: 501 });
    assert.equal(r.statusCode, 200, "oddiy savdo 34-siz ham ishlaydi: " + r.body);
    assert.equal(await box(pg, 1), 1200000);
  });
}

// v24.5 audit (P1): haq savdoning to'lanmagan qismidan ko'p ishlatilsa — rad (avval ortig'i yo'qolardi)
async function testCreditCap() {
  await withWorld({}, async ({ pg, client }) => {
    const ck = loadFunction('sale-checkout-atomic', client);
    await sale(ck, 'ov-1', { custId: 501, overpay: { box_id: 1, amount_native: 530000 } });   // 30 000 qarz + 500 000 haq
    assert.equal(await credit(pg, 501), 500000);
    const kassa1 = await box(pg, 1);
    // 200 000 lik savdo: 500 000 haq yuborildi (paidUsd 16 — chek summasi) → rad, hech narsa yozilmaydi
    let r = await sale(ck, 'cc-1', { custId: 501, paidUsd: 16, boxPayments: [], creditUseUzs: 500000 });
    assert.equal(r.statusCode, 400, r.body); assert.match(body(r).error, /haq/i);
    assert.equal(await credit(pg, 501), 500000, "haq o'zgarmadi"); assert.equal(await box(pg, 1), kassa1);
    assert.equal(await num(pg, `select count(*)::int v from sales where local_id='scc-1'`), 0); assert.equal(await left(pg), 48);
    // naqd 150 000 + haq 100 000 (chek 200 000) — haq 50 000 ortiq → rad
    r = await sale(ck, 'cc-2', { custId: 501, paidUsd: 16, boxPayments: [{ box_id: 1, amount_native: 150000 }], creditUseUzs: 100000 });
    assert.equal(r.statusCode, 400, r.body); assert.equal(await credit(pg, 501), 500000);
    // aniq summa: 200 000 haqdan — o'tadi
    r = await sale(ck, 'cc-3', { custId: 501, paidUsd: 16, boxPayments: [], creditUseUzs: 200000 });
    assert.equal(r.statusCode, 200, r.body); assert.equal(await credit(pg, 501), 300000); assert.equal(await debt(pg, 501), 0);
  });
}

module.exports = {
  name: "P34 — v24.5 (34-migratsiya): mijoz haqi — ortiqcha to'lov, haqdan foydalanish, to'lov tekshiruvi",
  cases: [
    { name: "Ortiqcha to'lov: kassaga to'liq; avval qarz uziladi, qolgani haq; mijozsiz — rad; $ kassa; takrorsiz", run: testOverpay },
    { name: "Haqdan foydalanish: haqdan ortiq emas; o'chirishda haq qaytadi, kassadan faqat naqd; tahrir taqiq; jurnal o'zgarmas", run: testCreditUseAndVoid },
    { name: "Haq chegarasi (audit P1): savdoning to'lanmagan qismidan ko'p haq — rad, haq va kassa o'zgarmaydi", run: testCreditCap },
    { name: "Xavfsizlik: «to'langan» kassaga tushumdan oshsa — rad (qarz kam yozilmaydi)", run: testPaidGuard },
    { name: "34-migratsiyasiz: ortiqcha to'lov — 409, oddiy savdo ishlaydi", run: testWithout34 },
  ],
};
