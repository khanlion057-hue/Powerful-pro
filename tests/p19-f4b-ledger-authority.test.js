// P19 — v23.2 F4b: MIJOZ QARZI, TA'MINOTCHI QARZI, OMBOR QOLDIG'I — SERVER HAQIQIY MANBA (27-migratsiya).
// HAQIQIY server funksiyalari (sale-checkout-atomic, sale-ops, stock-debt-ops, cashbox-ops, app-data-*,
// batches-shadow-sync) + HAQIQIY PostgreSQL (PGlite). Har bir testda BAZADAGI natija tekshiriladi.
//
//  • Mijoz qarzi: oddiy to'lov, qarzdan ortiq, takror (bir xil kalit), ikki qurilma (turli kalit, eski
//    nusxa), xatoda rollback, qaytarish, brauzer yuborgan noto'g'ri qarz (2 000 000).
//  • Ta'minotchi qarzi: oddiy, ortiqcha, takror, ikki qurilma, rollback.
//  • Ombor: oddiy savdo, ortiqcha sotuv, ikki qurilma, qaytarish, takror, rollback.
//  • NEGATIV NAZORAT: eski (v23.1) brauzer kodi yuboradigan so'rovlar (shadow-sync, eski JSON, eski
//    checkout, eski to'lov) — eski xato qaytmaydi.
// Haqiqiy parallel (ko'p ulanishli) holatlar — tests/evidence/f4b-real-postgres.js (PostgreSQL 16).
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG27 = fs.readFileSync(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'), 'utf8');
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger',
  'sales', 'batches', 'customer_balances', 'supplier_balances', 'customer_debt_payments', 'supplier_payments', 'home_withdrawals',
  'idempotency_keys', 'ledger_ops', 'customer_debt_ledger', 'supplier_debt_ledger', 'stock_ledger'];
const CID = 1759300000000123, CID2 = 1759300000000124, SID = 1759300000000456, SCON = 1759300000000457;
const PERMS = ['savdo.create', 'mijozlar.debt_payment', 'mijozlar.edit', 'taminotchilar.edit', 'kassalar.transact', 'kirim.create', 'ombor.edit'];
const USERS = { 't-kas': { id: 'u-kas' }, 't-sel': { id: 'u-sel' } };
const BOXES = [{ id: 1, name: "Naqd So'm", cur: 'UZS', type: 'cash', bal: 0 }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 0 }];
const BRANCH = {
  cashboxes: BOXES, cashTxns: [], expenses: [],
  customers: [{ id: CID, name: 'Ali', debt: 600000 }, { id: CID2, name: 'Vali', debt: 0 }],
  suppliers: [{ id: SID, name: 'Xitoy MChJ', debt: 100, paid: 0 }, { id: SCON, name: 'Konsignator', debt: 0, isConsignment: true }],
  batches: [
    { id: 9001, pid: 101, bno: '01', qty: 3, sold: 0, costUsd: 5, date: '2026-09-01', status: 'active' },
    { id: 9002, pid: 102, bno: '01', qty: 10, sold: 0, costUsd: 2, date: '2026-09-01', status: 'active', suppId: SCON, consignment: true },
  ],
  sales: [],
};

async function world() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  await pg.exec(SCHEMA);
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12000 }, branchStore: { f729: { cashboxes: BOXES } } })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('f729', $1::jsonb)`, [JSON.stringify(BRANCH)]);
  await pg.exec(MIG27);   // JSON'dagi qarz va partiyalar bazaga (opening) — production'dagi kabi
  await pg.query(`select cashbox_apply_ops('f729','seed-cash','manual_in','[{"box":1,"currency":"UZS","dir":"in","amount":5000000},{"box":3,"currency":"USD","dir":"in","amount":1000}]'::jsonb)`);
  const memTables = {
    staff: [{ id: 7, auth_user_id: 'u-kas', role: 'sotuvchi', active: true, filial: 'f729', name: 'Kassir', login: 'kas' },
            { id: 8, auth_user_id: 'u-sel', role: 'sotuvchi', active: true, filial: 'f729', name: 'Sotuvchi', login: 'sel' }],
    staff_roles: [{ staff_id: 7, role_id: 'r' }, { staff_id: 8, role_id: 's' }],
    role_permissions: [...PERMS.map(k => ({ role_id: 'r', permission_id: k, permissions: { key: k } })),
      ...['savdo.create', 'mijozlar.debt_payment'].map(k => ({ role_id: 's', permission_id: k, permissions: { key: k } }))],
    staff_audit_log: [],
  };
  require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
  require('../netlify/functions/_lib/cashAuthority')._resetCashAuthorityCache();
  return { pg, client: makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: USERS }) };
}
async function withWorld(fn) {
  const w = await world();
  try { await fn(w); } finally { unloadFunctions(); await w.pg.close(); }
}
const body = (r) => JSON.parse(r.body);
const num = async (pg, sql, p) => +(((await pg.query(sql, p)).rows[0] || {}).v ?? NaN);
const cust = (pg, id = CID) => num(pg, `select debt v from customer_balances where filial='f729' and customer_local_id=$1`, [id]);
const supp = (pg, id = SID) => num(pg, `select debt v from supplier_balances where filial='f729' and supplier_local_id=$1`, [id]);
const box = (pg, b) => num(pg, `select balance v from cashbox_balances where filial='f729' and box_local_id=$1`, [b]);
const left = (pg, pid) => num(pg, `select coalesce(sum(qty-sold),0) v from batches where filial='f729' and pid=$1 and status='active'`, [pid]);
const consistent = async (pg) => {
  const q = async (sql) => (await pg.query(sql)).rows[0].ok;
  assert.equal(await q(`select coalesce(bool_and(b.debt = (select coalesce(sum(delta),0) from customer_debt_ledger l where l.filial=b.filial and l.customer_local_id=b.customer_local_id)), true) ok from customer_balances b`), true, "mijoz qarzi = jurnal yig'indisi");
  assert.equal(await q(`select coalesce(bool_and(b.debt = (select coalesce(sum(delta),0) from supplier_debt_ledger l where l.filial=b.filial and l.supplier_local_id=b.supplier_local_id)), true) ok from supplier_balances b`), true, "ta'minotchi qarzi = jurnal yig'indisi");
  assert.equal(await q(`select coalesce(bool_and(b.qty = (select coalesce(sum(d_qty),0) from stock_ledger l where l.batch_id=b.id) and b.sold = (select coalesce(sum(d_sold),0) from stock_ledger l where l.batch_id=b.id)), true) ok from batches b`), true, "partiya qty/sold = ombor jurnali");
};
const custPay = (h, key, amount, token = 't-kas', b = 1) => h(post({ filial: 'f729', key, kind: 'cust_debt_pay', ops: [{ box: b, dir: 'in', amount }], record: { customerId: CID } }, token));
const suppPay = (h, key, amount) => h(post({ filial: 'f729', key, kind: 'supp_pay', ops: [{ box: 3, dir: 'out', amount }], record: { supplierId: SID } }, 't-kas'));
const checkout = (h, key, items, extra = {}) => h(post({ filial: 'f729', items, paidUsd: extra.paidUsd ?? items.reduce((s, i) => s + i.qty * i.sellUsd, 0),
  boxPayments: extra.boxPayments ?? [{ box_id: 3, amount_native: items.reduce((s, i) => s + i.qty * i.sellUsd, 0) }], inv: 'I-' + key, idemKey: key,
  saleLocalId: extra.saleLocalId ?? ('s' + key), custId: extra.custId, payType: extra.payType || 'usd', custName: 'X', ...(extra.body || {}) }, extra.token || 't-kas'));

// ── 1. Mijoz qarzi ──────────────────────────────────────────────────────
async function testCustomerDebt() {
  await withWorld(async ({ pg, client }) => {
    const h = loadFunction('cashbox-ops', client);
    assert.equal(await cust(pg), 600000, "boshlang'ich qarz JSON'dan ko'chdi");
    // oddiy to'lov — kassa + qarz + yozuv birga; javobda bazadagi qarz
    let r = await custPay(h, 'cp-normal-1', 100000);
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).customerDebt, 500000);
    assert.equal(await cust(pg), 500000); assert.equal(await box(pg, 1), 5100000);
    // takror (bir xil kalit) — ikkinchi marta yechilmaydi
    r = await custPay(h, 'cp-normal-1', 100000);
    assert.equal(r.statusCode, 200); assert.equal(body(r).replay, true);
    assert.equal(await cust(pg), 500000); assert.equal(await box(pg, 1), 5100000);
    assert.equal(await num(pg, `select count(*)::int v from customer_debt_payments`), 1);
    // ikki qurilma (eski ekran: ikkalasida 500 000 ko'rinadi) — 2×400 000: ikkinchisi HAQIQIY qoldiq bo'yicha rad
    const a = await custPay(h, 'cp-devA-1', 400000), b = await custPay(h, 'cp-devB-1', 400000, 't-sel');
    assert.equal(a.statusCode, 200, a.body); assert.equal(b.statusCode, 400);
    assert.match(body(b).error, /oshib ketdi/);
    assert.equal(await cust(pg), 100000); assert.equal(await box(pg, 1), 5500000, 'rad etilgan to\'lovning kassa harakati ham yo\'q');
    // qarzdan ortiq — rad, hech narsa o'zgarmaydi
    r = await custPay(h, 'cp-over-1', 150000);
    assert.equal(r.statusCode, 400); assert.equal(await cust(pg), 100000); assert.equal(await box(pg, 1), 5500000);
    // rollback: to'lov yozuvi jadvali buzilgan bo'lsa — kassa ham, qarz ham o'zgarmaydi (bitta tranzaksiya)
    await pg.exec(`alter table customer_debt_payments add constraint t_fail check (amount_uzs < 0) not valid`);
    r = await custPay(h, 'cp-rollback-1', 50000);
    assert.notEqual(r.statusCode, 200);
    assert.equal(await cust(pg), 100000); assert.equal(await box(pg, 1), 5500000);
    assert.equal(await num(pg, `select count(*)::int v from cashbox_ledger where group_key='ops:cp-rollback-1'`), 0);
    await pg.exec(`alter table customer_debt_payments drop constraint t_fail`);
    await consistent(pg);
  });
}

// ── 2. Brauzer yuborgan noto'g'ri qarz / eski JSON (negativ nazorat) ────
async function testClientValuesNotTrusted() {
  await withWorld(async ({ pg, client }) => {
    const save = loadFunction('app-data-branch-save', client);
    const stale = { ...BRANCH, customers: [{ id: CID, name: 'Ali', debt: 2000000 }, { id: CID2, name: 'Vali', debt: 0 }],
      suppliers: [{ id: SID, name: 'X', debt: 0 }, { id: SCON, name: 'K', debt: 0 }],
      batches: BRANCH.batches.map(b => ({ ...b, qty: 999, sold: 0 })) };
    let r = await save(post({ branchKey: 'f729', data: stale }, 't-kas'));
    assert.equal(r.statusCode, 200, r.body);
    const res = body(r);
    assert.equal(res.ledgerAuthority.on, true);
    assert.equal(res.ledgerAuthority.customers[String(CID)], 600000, 'javobda bazadagi qarz');
    const j = (await pg.query(`select data from app_data_branches where branch_key='f729'`)).rows[0].data;
    assert.equal(j.customers[0].debt, 600000, "JSON'ga 2 000 000 emas — bazadagi qarz yozildi");
    assert.equal(j.suppliers[0].debt, 100); assert.equal(j.batches[0].qty, 3);
    assert.equal(await cust(pg), 600000); assert.equal(await supp(pg), 100); assert.equal(await left(pg, 101), 3);
    // shubhali o'zgartirish xavfsizlik jurnalida
    assert.ok(client.mem.calls.inserts.some(x => x.table === 'staff_audit_log' && /ledger_value_override_ignored/.test(JSON.stringify(x.row || x))), 'audit: brauzer qiymati e\'tiborga olinmadi');
    // brauzerdagi 2 000 000 asosida 1 000 000 to'lov — server bazadagi 600 000 dan tekshiradi
    r = await custPay(loadFunction('cashbox-ops', client), 'cp-big-1', 1000000);
    assert.equal(r.statusCode, 400); assert.equal(await cust(pg), 600000);
    // app-data-save (asosiy yo'l) ham xuddi shunday
    const save2 = loadFunction('app-data-save', client);
    r = await save2(post({ data: { branchStore: { f729: stale } } }, 't-kas'));
    assert.equal(r.statusCode, 200, r.body);
    const j2 = (await pg.query(`select data from app_data_branches where branch_key='f729'`)).rows[0].data;
    assert.equal(j2.customers[0].debt, 600000); assert.equal(j2.batches[0].qty, 3);
    // yuklashda ham bazadagi qiymat
    const load = loadFunction('app-data-load', client);
    const d = body(await load(post({}, 't-kas')));
    assert.equal(d.ledgerAuthority, true);
    assert.equal(d.data.branchStore.f729.customers[0].debt, 600000);
    // eski shadow-sync (brauzer partiya nusxasi) — bazaga yozmaydi
    const sync = loadFunction('batches-shadow-sync', client);
    r = await sync(post({ localId: '9001', filial: 'f729', pid: 101, qty: 999, sold: 0, costUsd: 0.01, status: 'active' }, 't-kas'));
    assert.equal(await num(pg, `select qty v from batches where local_id='9001'`), 3);
    assert.equal(await num(pg, `select cost_usd v from batches where local_id='9001'`), 5);
    await consistent(pg);
  });
}

// ── 3. Ta'minotchi qarzi ────────────────────────────────────────────────
async function testSupplierDebt() {
  await withWorld(async ({ pg, client }) => {
    const h = loadFunction('cashbox-ops', client);
    let r = await suppPay(h, 'sp-normal-1', 30);
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).supplierDebt, 70); assert.equal(body(r).supplierPaid, 30);
    assert.equal(await supp(pg), 70); assert.equal(await box(pg, 3), 970);
    r = await suppPay(h, 'sp-normal-1', 30);
    assert.equal(body(r).replay, true); assert.equal(await supp(pg), 70); assert.equal(await box(pg, 3), 970);
    // ikki qurilma 2×50$ (qarz 70$) — biri o'tadi
    const a = await suppPay(h, 'sp-devA-1', 50), b = await suppPay(h, 'sp-devB-1', 50);
    assert.deepEqual([a.statusCode, b.statusCode], [200, 400]);
    assert.equal(await supp(pg), 20); assert.equal(await box(pg, 3), 920);
    r = await suppPay(h, 'sp-over-1', 25);
    assert.equal(r.statusCode, 400); assert.equal(await supp(pg), 20); assert.equal(await box(pg, 3), 920);
    // rollback
    await pg.exec(`alter table supplier_payments add constraint t_fail check (amount_usd < 0) not valid`);
    r = await suppPay(h, 'sp-rollback-1', 10);
    assert.notEqual(r.statusCode, 200); assert.equal(await supp(pg), 20); assert.equal(await box(pg, 3), 920);
    await pg.exec(`alter table supplier_payments drop constraint t_fail`);
    // qo'lda o'zgartirish — faqat ruxsatli xodim (taminotchilar.edit), jurnalga yoziladi
    const op = loadFunction('stock-debt-ops', client);
    r = await op(post({ filial: 'f729', key: 'sset-seller-1', kind: 'supp_set', payload: { supplierId: SID, debt: 0 } }, 't-sel'));
    assert.equal(r.statusCode, 403); assert.equal(await supp(pg), 20);
    r = await op(post({ filial: 'f729', key: 'sset-kas-1', kind: 'supp_set', payload: { supplierId: SID, debt: 55 } }, 't-kas'));
    assert.equal(r.statusCode, 200, r.body); assert.equal(await supp(pg), 55);
    assert.equal(await num(pg, `select count(*)::int v from supplier_debt_ledger where op_kind='adjust'`), 1);
    await consistent(pg);
  });
}

// ── 4. Ombor ────────────────────────────────────────────────────────────
async function testWarehouse() {
  await withWorld(async ({ pg, client }) => {
    const sale = loadFunction('sale-checkout-atomic', client);
    // oddiy savdo — sold serverda, javobda haqiqiy partiya qoldig'i
    let r = await checkout(sale, 'ck-normal-1', [{ pid: 101, qty: 2, sellUsd: 10, costUsd: 5 }]);
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(body(r).authority.batches.find(b => b.localId === '9001').sold, 2);
    assert.equal(await left(pg, 101), 1);
    // takror — replay, sold o'zgarmaydi, kassa bir marta
    const b3 = await box(pg, 3);
    r = await checkout(sale, 'ck-normal-1', [{ pid: 101, qty: 2, sellUsd: 10, costUsd: 5 }]);
    assert.equal(r.statusCode, 200); assert.equal(await left(pg, 101), 1); assert.equal(await box(pg, 3), b3);
    // ortiqcha sotuv (qoldiq 1) — rad, kassa/savdo yo'q
    r = await checkout(sale, 'ck-over-1', [{ pid: 101, qty: 2, sellUsd: 10, costUsd: 5 }]);
    assert.equal(r.statusCode, 400); assert.match(body(r).error, /yetarli qoldiq/);
    assert.equal(await left(pg, 101), 1); assert.equal(await box(pg, 3), b3);
    assert.equal(await num(pg, `select count(*)::int v from sales where local_id='sck-over-1'`), 0);
    // ikki qurilma (ikkalasida qoldiq 1 ko'rinadi) — 1+1: biri o'tadi
    const a = await checkout(sale, 'ck-devA-1', [{ pid: 101, qty: 1, sellUsd: 10, costUsd: 5 }]);
    const b = await checkout(sale, 'ck-devB-1', [{ pid: 101, qty: 1, sellUsd: 10, costUsd: 5 }], { token: 't-sel' });
    assert.deepEqual([a.statusCode, b.statusCode], [200, 400]); assert.equal(await left(pg, 101), 0);
    // rollback: kassaga savdodan ortiq tushum — butun savdo bekor (ombor ham)
    r = await checkout(sale, 'ck-rollback-1', [{ pid: 102, qty: 1, sellUsd: 5, costUsd: 2 }], { boxPayments: [{ box_id: 3, amount_native: 500 }] });
    assert.equal(r.statusCode, 400); assert.equal(await left(pg, 102), 10); assert.equal(await supp(pg, SCON), 0);
    // konsignatsiya — sotilgan qism ta'minotchi qarziga serverda
    r = await checkout(sale, 'ck-kons-1', [{ pid: 102, qty: 4, sellUsd: 5, costUsd: 2 }]);
    assert.equal(r.statusCode, 200, r.body); assert.equal(await supp(pg, SCON), 8); assert.equal(await left(pg, 102), 6);
    // nasiya — qarz serverda (brauzer qarz qiymatini yubormaydi)
    r = await checkout(sale, 'ck-nas-1', [{ pid: 102, qty: 2, sellUsd: 25, costUsd: 2 }], { custId: CID2, paidUsd: 20, boxPayments: [{ box_id: 3, amount_native: 20 }], body: { debtUsd: 999999 } });
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).debtUsd, 30); assert.equal(await cust(pg, CID2), 360000);
    await consistent(pg);
  });
}

// ── 5. Qaytarish, o'chirish, tahrir — serverdagi savdo yozuvidan ───────
async function testReturnVoidEdit() {
  await withWorld(async ({ pg, client }) => {
    const sale = loadFunction('sale-checkout-atomic', client), ops = loadFunction('sale-ops', client);
    let r = await checkout(sale, 'ck-ret-1', [{ pid: 101, qty: 2, sellUsd: 50, costUsd: 5 }], { custId: CID2, paidUsd: 40, boxPayments: [{ box_id: 3, amount_native: 40 }] });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(await cust(pg, CID2), 60 * 12000);
    // qaytarish 1 dona: qaytariladigan 50$ — avval qarzdan (60$), naqd qism 0
    r = await ops(post({ filial: 'f729', action: 'return', key: 'ret-key-0001', saleLocalId: 'sck-ret-1', pid: 101, qty: 1, batchLocalId: 'rb-0001' }, 't-kas'));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(body(r).debtPart, 50); assert.equal(body(r).cashPart, 0);
    assert.equal(await cust(pg, CID2), 10 * 12000); assert.equal(await left(pg, 101), 2);
    // takror — replay
    r = await ops(post({ filial: 'f729', action: 'return', key: 'ret-key-0001', saleLocalId: 'sck-ret-1', pid: 101, qty: 1, batchLocalId: 'rb-0001' }, 't-kas'));
    assert.equal(body(r).replay, true); assert.equal(await left(pg, 101), 2);
    // savdoda qolganidan ortiq (brauzer "2 dona sotilgan" desa ham) — rad
    r = await ops(post({ filial: 'f729', action: 'return', key: 'ret-key-0002', saleLocalId: 'sck-ret-1', pid: 101, qty: 2, batchLocalId: 'rb-0002' }, 't-kas'));
    assert.equal(r.statusCode, 400); assert.equal(await left(pg, 101), 2);
    // ikkinchi qaytarish — 10$ qarz + 40$ naqd
    const b3 = await box(pg, 3);
    r = await ops(post({ filial: 'f729', action: 'return', key: 'ret-key-0003', saleLocalId: 'sck-ret-1', pid: 101, qty: 1, batchLocalId: 'rb-0003' }, 't-kas'));
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).debtPart, 10); assert.equal(body(r).cashPart, 40);
    assert.equal(await cust(pg, CID2), 0); assert.equal(await box(pg, 3), b3 - 40);
    // o'chirish (void) — ombor qaytadi, savdo yozuvi "voided", qayta o'chirib bo'lmaydi
    r = await checkout(sale, 'ck-void-1', [{ pid: 102, qty: 3, sellUsd: 5, costUsd: 2 }], { custId: CID, paidUsd: 0, boxPayments: [], payType: 'debt' });
    assert.equal(r.statusCode, 200, r.body);
    const c0 = await cust(pg);
    r = await ops(post({ filial: 'f729', action: 'void', key: 'void-key-0001', saleLocalId: 'sck-void-1', batchIds: ['vb-0001'] }, 't-kas'));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(await cust(pg), c0 - 15 * 12000); assert.equal(await left(pg, 102), 10);
    r = await ops(post({ filial: 'f729', action: 'void', key: 'void-key-0002', saleLocalId: 'sck-void-1', batchIds: ['vb-0002'] }, 't-kas'));
    assert.equal(r.statusCode, 400);
    // narx tahriri (sotuvchi) — farq kassaga, serverdagi yozuvdan
    r = await checkout(sale, 'ck-price-1', [{ pid: 102, qty: 2, sellUsd: 5, costUsd: 2 }]);
    const b3b = await box(pg, 3);
    r = await ops(post({ filial: 'f729', action: 'edit', key: 'edit-key-0001', saleLocalId: 'sck-price-1', mode: 'price', payload: { prices: [7] } }, 't-sel'));
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).sale.totalUsd, 14); assert.equal(await box(pg, 3), b3b + 4);
    // boshqa filial savdosi — topilmaydi (xodim o'z filialiga majburlanadi)
    r = await ops(post({ filial: 'baza', action: 'void', key: 'void-key-0003', saleLocalId: 'sck-price-1', batchIds: ['vb-0003'] }, 't-sel'));
    assert.equal(await num(pg, `select count(*)::int v from sales where local_id='sck-price-1' and status='voided'`), 1, 'xodim o\'z filialida (f729) ishlaydi');
    await consistent(pg);
  });
}

// ── 6. Kirim, reviziya, partiya tahriri — server hisoblaydi ─────────────
async function testStockOps() {
  await withWorld(async ({ pg, client }) => {
    const op = loadFunction('stock-debt-ops', client), cash = loadFunction('cashbox-ops', client);
    // kirim: 30$ to'langan (kassa jurnalida), "to'langan 90$" — rad
    let r = await cash(post({ filial: 'f729', key: 'kirim-pay-0001', kind: 'kirim_pay', refType: 'kirim', refId: 'K-1', ops: [{ box: 3, dir: 'out', amount: 30 }] }, 't-kas'));
    assert.equal(r.statusCode, 200, r.body);
    const kir = (key, given) => op(post({ filial: 'f729', key, kind: 'batches_create', payload: { reason: 'kirim', kirimRef: 'K-1',
      supplier: { id: SID, goodsUsd: 100, givenUsd: given }, batches: [{ localId: 'kb-' + key, pid: 104, qty: 10, costUsd: 10 }] } }, 't-kas'));
    r = await kir('kirim-key-0001', 90);
    assert.equal(r.statusCode, 400); assert.equal(await left(pg, 104), 0); assert.equal(await supp(pg), 100);
    r = await kir('kirim-key-0002', 30);
    assert.equal(r.statusCode, 200, r.body); assert.equal(await left(pg, 104), 10); assert.equal(await supp(pg), 170);
    // sotuvchi kirim qila olmaydi
    r = await op(post({ filial: 'f729', key: 'kirim-key-0003', kind: 'batches_create', payload: { reason: 'kirim', batches: [{ localId: 'x1', pid: 104, qty: 1, costUsd: 1 }] } }, 't-sel'));
    assert.equal(r.statusCode, 403);
    // partiya tahriri: sotilgandan kam bo'lmaydi; ta'minotchi qarzi farqi serverda
    await pg.query(`select sale_checkout_atomic_v3('f729','ck-st-1','{"localId":"st1","inv":"I-st1","items":[{"pid":104,"qty":4,"sellUsd":20,"costUsd":10}],"paidUsd":0}'::jsonb,'[]'::jsonb)`);
    r = await op(post({ filial: 'f729', key: 'bedit-key-0001', kind: 'batch_edit', payload: { edits: [{ localId: 'kb-kirim-key-0002', qty: 3, costUsd: 10 }] } }, 't-kas'));
    assert.equal(r.statusCode, 400, 'sotilgandan (4) kam');
    // reviziya: tizim qoldig'i SERVERDA (6), fakt 5 → −1
    r = await op(post({ filial: 'f729', key: 'rev-key-0001', kind: 'revision', payload: { apply: true, facts: [{ pid: 104, fact: 5 }] } }, 't-kas'));
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).rows[0].sysQty, 6); assert.equal(await left(pg, 104), 5);
    await consistent(pg);
  });
}

// ── 7. 27-migratsiyasiz: avvalgi yo'l (fail-close, ma'lumot buzilmaydi) ──
async function testWithoutMig27() {
  await withWorld(async ({ pg, client }) => {
    await pg.exec(`drop table public.ledger_ops`);
    require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
    const op = loadFunction('stock-debt-ops', client), so = loadFunction('sale-ops', client);
    let r = await op(post({ filial: 'f729', key: 'cset-key-0001', kind: 'cust_set', payload: { customerId: CID, debt: 1 } }, 't-kas'));
    assert.equal(r.statusCode, 409); assert.equal(body(r).migrationPending, true);
    r = await so(post({ filial: 'f729', action: 'void', key: 'void-key-0009', saleLocalId: 'x', batchIds: [] }, 't-kas'));
    assert.equal(r.statusCode, 409);
    assert.equal(await cust(pg), 600000);
  });
}

module.exports = {
  name: "P19 — v23.2 F4b: mijoz/ta'minotchi qarzi va ombor qoldig'i — server haqiqiy manba (27-migratsiya)",
  cases: [
    { name: "Mijoz qarzi: oddiy, takror, ikki qurilma (eski nusxa), qarzdan ortiq, rollback — bazadagi qiymat", run: testCustomerDebt },
    { name: "Brauzer qiymatiga ishonilmaydi: JSON'da qarz 2 000 000 / qty 999, eski shadow-sync — bazaga ta'sir yo'q (negativ nazorat)", run: testClientValuesNotTrusted },
    { name: "Ta'minotchi qarzi: oddiy, takror, ikki qurilma, ortiqcha, rollback, qo'lda tahrir ruxsati", run: testSupplierDebt },
    { name: "Ombor: oddiy savdo, takror, ortiqcha sotuv, ikki qurilma, rollback, konsignatsiya, nasiya", run: testWarehouse },
    { name: "Qaytarish / o'chirish / narx tahriri — serverdagi savdo yozuvidan; takror va ortiqcha rad", run: testReturnVoidEdit },
    { name: "Kirim (to'lov kassa jurnalidan oshmaydi), partiya tahriri, reviziya — server hisoblaydi; ruxsatlar", run: testStockOps },
    { name: "27-migratsiyasiz: 409 migrationPending, ma'lumot o'zgarmaydi", run: testWithoutMig27 },
  ],
};
