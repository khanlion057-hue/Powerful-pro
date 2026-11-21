// P15 — v23 HARDENING: baza (25-migratsiya) va server funksiyalari — HAQIQIY PostgreSQL (PGlite).
//
//  • Firma kassa: yozuv manbasi (source_type/source_ref), bekor qilish (teskari yozuv),
//    jurnallar O'ZGARMAS (UPDATE/DELETE yo'q), filialning Bazadan PUL qarzi (berish/qaytarish).
//  • To'lov + kassa harakati BITTA tranzaksiyada (cash_payment_atomic): mijoz (katta uid ID —
//    production'dagi integer ustun xatosi), ta'minotchi, diller (qarzdan ortiq — hammasi bekor).
//  • cashbox-ops: to'lov yozuvi (record) majburiy, qarzdan ortiq to'lov serverda rad etiladi.
//  • Eski kassa API'lari 24-migratsiyadan keyin 410 (jimgina yozuv yo'q).
//  • firma-kassa: qarz/ bekor qilish/ boshlang'ich qoldiq ruxsatlari, filial hisoboti, Kirim solishtiruvi.
//  • Telegram tokeni hech qachon brauzerga ketmaydi; telegram-test — faqat admin.
//  • Hamkorlar: xodim faqat O'Z filiali hamkorlarini o'zgartiradi.
//  • Ruxsatlar: anon/authenticated'dan brauzer ishlatmaydigan jadval/funksiyalar olingan.
//
// Bu testlar v11 kodida FAIL bo'ladi (25-migratsiya, record yo'li, 410, telegram-test,
// branch_loan/reverse/reconcile yo'q; admin'ga token yuborilardi).
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG24 = path.join(ROOT, 'supabase-migration-24-v11-cash-authority.sql');
const MIG25 = path.join(ROOT, 'supabase-migration-25-v23-hardening.sql');
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger',
  'sales', 'batches', 'customer_balances', 'supplier_balances', 'customer_debt_payments', 'supplier_payments', 'home_withdrawals',
  'dealer_payments', 'dealers', 'cashbox_transactions', 'ledger_ops', 'customer_debt_ledger', 'supplier_debt_ledger', 'stock_ledger'];

const CID = 1759300000000123;     // ilovadagi haqiqiy mijoz ID shakli (uid() ≈ 1.7e15) — integer'ga sig'maydi
const SID = 1759300000000456;
const PERMS = {
  'r-kas': ['kassalar.transact', 'mijozlar.debt_payment', 'taminotchilar.edit', 'dillerlar.manage', 'xarajatlar.create'],
  'r-fk': ['firma_kassa.view', 'firma_kassa.transact', 'kassalar.transact'],
  'r-ham': ['hamkorlar.edit'],
};
const USERS = { 't-admin': { id: 'u-admin' }, 't-kas': { id: 'u-kas' }, 't-fk': { id: 'u-fk' }, 't-ham': { id: 'u-ham' } };
const BOXES = [
  { id: 1, name: "Naqd So'm", icon: '💵', cur: 'UZS', type: 'cash', bal: 1200000 },
  { id: 3, name: 'Dollar ($)', icon: '💲', cur: 'USD', type: 'usd', bal: 300 },
  { id: 6, name: 'Yuan', icon: '¥', cur: 'CNY', type: 'cny', bal: 100 },
];
const BRANCH = { cashboxes: BOXES, sales: [], cashTxns: [],
  customers: [{ id: CID, name: 'Ali', debt: 600000 }], suppliers: [{ id: SID, name: 'Xitoy MChJ', debt: 120 }],
  batches: [{ id: 1, pid: 5, bno: '01', qty: 1, sold: 0, fkRef: 'K-LINKED' }] };

async function newPg() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  return pg;
}

async function world() {
  const pg = await newPg();
  await pg.exec(SCHEMA);
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({
    settings: { usdUzs: 12000, tgBotToken: '123456:SECRET_TOKEN_VALUE_ABCDEFGHIJ', tgChatId: '-100123' },
    branchDebt: { f729: 500 }, partners: [{ id: 1, name: 'Baza investori', invested: 1000 }, { id: 2, name: 'F729 investori', invested: 300, filial: 'f729' }],
    branchStore: { f729: { cashboxes: BOXES }, baza: { cashboxes: [{ ...BOXES[1], bal: 1000 }] } } })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('f729', $1::jsonb), ('baza', $2::jsonb)`,
    [JSON.stringify(BRANCH), JSON.stringify({ cashboxes: [{ ...BOXES[1], bal: 1000 }] })]);
  await pg.exec(fs.readFileSync(MIG24, 'utf8'));   // joriy JSON qoldiqlarini jurnalga ko'chiradi (takroriy — xavfsiz)
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'), 'utf8'));   // v23.2: JSON qarz/ombor/savdo → baza (opening, takroriy — xavfsiz)
  await pg.exec(`insert into dealers (id, login, name, filial, debt_usd, total_paid_usd) overriding system value values (9, 'dd', 'Diller', 'f729', 40, 0)`);
  await pg.query(`select public._fk_cash_move('USD','in',5000,'deposit', p_idem_key => 'seed-usd')`);
  const memTables = {
    staff: [
      { id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
      { id: 7, auth_user_id: 'u-kas', role: 'sotuvchi', active: true, filial: 'f729', name: 'Kassir 729', login: 'kas' },
      { id: 8, auth_user_id: 'u-fk', role: 'sotuvchi', active: true, filial: 'baza', name: 'Moliyachi', login: 'fk' },
      { id: 9, auth_user_id: 'u-ham', role: 'sotuvchi', active: true, filial: 'f729', name: 'Hamkor muharriri', login: 'ham' },
    ],
    staff_roles: [{ staff_id: 7, role_id: 'r-kas' }, { staff_id: 8, role_id: 'r-fk' }, { staff_id: 9, role_id: 'r-ham' }],
    role_permissions: Object.entries(PERMS).flatMap(([rid, keys]) => keys.map(k => ({ role_id: rid, permission_id: k, permissions: { key: k } }))),
    staff_audit_log: [], idempotency_keys: [],
  };
  const client = makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: USERS });
  return { pg, client };
}
async function withWorld(fn) {
  const w = await world();
  try { await fn(w); } finally { unloadFunctions(); await w.pg.close(); }
}
const body = (r) => JSON.parse(r.body);
const one = async (pg, sql, params) => (await pg.query(sql, params)).rows[0] || {};
const num = async (pg, sql, params) => +((await one(pg, sql, params)).v ?? NaN);
const boxBal = (pg, f, b) => num(pg, `select balance v from cashbox_balances where filial=$1 and box_local_id=$2`, [f, b]);
const fkBal = (pg, c) => num(pg, `select balance v from firma_kassa_balance where currency=$1`, [c]);
const rejects = (p, re, msg) => assert.rejects(p, re, msg);

// ── 1. Firma kassa: manba, bekor qilish, o'zgarmas jurnal ──────────────
async function testFirmaReversalImmutability() {
  await withWorld(async ({ pg }) => {
    const src = await one(pg, `select source_type, source_ref from firma_kassa_ledger where idem_key='fk:seed-usd' or idem_key='seed-usd'`);
    assert.equal(src.source_type, 'deposit', "qo'lda kirim — manba 'deposit'");
    const w = await one(pg, `select (r).id id from (select public._fk_cash_move('USD','out',30,'withdraw', p_idem_key => 'w1') r) t`);
    assert.equal(await fkBal(pg, 'USD'), 4970);
    const rv = await one(pg, `select (r).id id, (r).op_type op, (r).reversal_of ro, (r).source_type st from (select public.firma_kassa_reverse($1, 'rv1', 'xato') r) t`, [w.id]);
    assert.deepEqual([rv.op, +rv.ro, rv.st], ['reversal_in', +w.id, 'reversal'], 'teskari yozuv: chiqim → kirim, asl yozuvga bog\'langan');
    assert.equal(await fkBal(pg, 'USD'), 5000, 'qoldiq tiklandi');
    assert.equal(+(await one(pg, `select reversed_by v from firma_kassa_ledger where id=$1`, [w.id])).v, +rv.id, 'asl yozuv "bekor qilingan" deb belgilandi');
    const dup = await one(pg, `select (public.firma_kassa_reverse($1, 'rv1')).id id`, [w.id]);
    assert.equal(+dup.id, +rv.id, 'bir xil kalit — o\'sha teskari yozuv (ikki marta qaytarilmaydi)');
    await rejects(pg.query(`select public.firma_kassa_reverse($1, 'rv2')`, [w.id]), /allaqachon|bekor/i, 'ikkinchi marta bekor qilib bo\'lmaydi');
    await rejects(pg.query(`select public.firma_kassa_reverse($1, 'rv3')`, [rv.id]), /bekor/i, 'teskari yozuvni bekor qilib bo\'lmaydi');
    // Avans: qisman qaytarilgan avansni bekor qilib bo'lmaydi
    const a = await one(pg, `select (public.firma_kassa_give_advance('USD', 100, 'staff', '17', 'Ali', p_idem_key => 'a1')).id id`);
    await pg.query(`select public.firma_kassa_repay_advance('USD', 40, 'staff', '17', 'Ali', p_idem_key => 'ar1')`);
    await rejects(pg.query(`select public.firma_kassa_reverse($1, 'rv4')`, [a.id]), /qaytarilgan|avans/i, 'qisman qaytarilgan avans bekor qilinmaydi');
    // O'zgarmas jurnallar
    await rejects(pg.query(`update firma_kassa_ledger set amount = 1 where id=$1`, [w.id]), /o'zgartirib|immutable|o‘zgar|o'zgarmas|o'chirib/i, 'firma jurnali: summa o\'zgarmaydi');
    await rejects(pg.query(`delete from firma_kassa_ledger where id=$1`, [w.id]), /o'chirib|immutable|o'zgarmas/i, 'firma jurnali: o\'chirilmaydi');
    await rejects(pg.query(`update firma_kassa_ledger set reversed_by = null where id=$1`, [w.id]), /./, 'bekor qilish belgisini olib tashlab bo\'lmaydi');
    await rejects(pg.query(`update cashbox_ledger set note = 'x' where id = (select min(id) from cashbox_ledger)`), /./, 'filial kassa jurnali o\'zgarmaydi');
    await rejects(pg.query(`delete from cashbox_ledger`), /./, 'filial kassa jurnali o\'chirilmaydi');
  });
}

// ── 2. Filial Bazadan PUL qarzi oladi / qaytaradi (atomik, ikki jurnal) ──
async function testBranchLoan() {
  await withWorld(async ({ pg }) => {
    const g = (await one(pg, `select public.branch_firma_loan('f729', 3, 'USD', 'give', 200, 'L1', 'Dollar', 'ijara') r`)).r;
    assert.equal(+g.outstanding, 200); assert.equal(+g.branchBalance, 500); assert.equal(+g.firmaBalance, 4800);
    const dup = (await one(pg, `select public.branch_firma_loan('f729', 3, 'USD', 'give', 200, 'L1') r`)).r;
    assert.equal(dup.replay, true, 'takroriy so\'rov — ikkinchi marta berilmaydi');
    assert.equal(await boxBal(pg, 'f729', 3), 500); assert.equal(await fkBal(pg, 'USD'), 4800);
    await rejects(pg.query(`select public.branch_firma_loan('f729', 3, 'USD', 'repay', 250, 'L2')`), /qarz|oshib/i, 'qarzdan ko\'p qaytarib bo\'lmaydi');
    await rejects(pg.query(`select public.branch_firma_loan('f729', 1, 'UZS', 'repay', 1000, 'L2u')`), /qarz|oshib/i, 'boshqa valyutada qarz yo\'q');
    const rp = (await one(pg, `select public.branch_firma_loan('f729', 3, 'USD', 'repay', 150, 'L3') r`)).r;
    assert.equal(+rp.outstanding, 50); assert.equal(await boxBal(pg, 'f729', 3), 350); assert.equal(await fkBal(pg, 'USD'), 4950);
    const kinds = (await pg.query(`select op_kind from cashbox_ledger where filial='f729' and op_kind like 'branch_loan%' order by id`)).rows.map(x => x.op_kind);
    assert.deepEqual(kinds, ['branch_loan_in', 'branch_loan_repay'], 'filial jurnalida ham ikkala harakat');
    const fk = (await pg.query(`select op_type, source_type, counterparty_type, counterparty_id from firma_kassa_ledger where counterparty_type='branch' order by id`)).rows;
    assert.deepEqual(fk.map(x => [x.op_type, x.source_type, x.counterparty_id]), [['advance_give', 'branch_loan', 'f729'], ['advance_repay', 'advance_repayment', 'f729']]);
    const loanRow = (await one(pg, `select id from firma_kassa_ledger where op_type='advance_give' and counterparty_type='branch'`)).id;
    await rejects(pg.query(`select public.firma_kassa_reverse($1, 'rvL')`, [loanRow]), /filial|bekor/i, 'filial kassasiga bog\'liq yozuv yolg\'iz bekor qilinmaydi (ikki jurnal ajralmasin)');
    const sum = (await one(pg, `select public.firma_kassa_branch_summary('f729') r`)).r;
    assert.deepEqual([sum[0].filial, +sum[0].goodsDebtUsd, +sum[0].loanUsd, +sum[0].cashUsd], ['f729', 500, 50, 350], 'hisobot: tovar qarzi va pul qarzi alohida');
    // Mablag' yetmasa — hech narsa o'zgarmaydi
    await rejects(pg.query(`select public.branch_firma_loan('f729', 3, 'USD', 'give', 999999, 'L4')`), /yetarli/i);
    assert.equal(await fkBal(pg, 'USD'), 4950); assert.equal(await boxBal(pg, 'f729', 3), 350);
  });
}

// ── 3. To'lov + kassa — bitta tranzaksiya (mijoz/ta'minotchi/diller) ──
async function testCashPaymentAtomic() {
  await withWorld(async ({ pg }) => {
    const cp = (key, kind, opsJson, type, rec) => pg.query(`select public.cash_payment_atomic('f729', $1, $2, $3::jsonb, $4, $5::jsonb) r`, [key, kind, JSON.stringify(opsJson), type, JSON.stringify(rec)]);
    await cp('p1', 'cust_debt_pay', [{ box: 1, currency: 'UZS', dir: 'in', amount: 50000 }], 'customer_debt_payment', { customer_local_id: CID, customer_name: 'Ali', amount_uzs: 50000, box_local_id: 1 });
    await cp('p1', 'cust_debt_pay', [{ box: 1, currency: 'UZS', dir: 'in', amount: 50000 }], 'customer_debt_payment', { customer_local_id: CID, customer_name: 'Ali', amount_uzs: 50000, box_local_id: 1 });
    const r = await one(pg, `select count(*)::int n, max(customer_local_id) id from customer_debt_payments`);
    assert.equal(r.n, 1, 'takror — bitta yozuv');
    assert.equal(String(r.id), String(CID), "katta (uid) mijoz ID'si saqlanadi (avval integer ustunda yiqilardi)");
    assert.equal(await boxBal(pg, 'f729', 1), 1250000);
    await cp('p2', 'supp_pay', [{ box: 3, currency: 'USD', dir: 'out', amount: 20 }], 'supplier_payment', { supplier_local_id: SID, supplier_name: 'X', amount_usd: 20, box_local_id: 3 });
    assert.equal(String((await one(pg, `select supplier_local_id v from supplier_payments`)).v), String(SID));
    // Diller: qarzdan ortiq — kassa harakati ham bekor (bitta tranzaksiya)
    await rejects(cp('d1', 'dealer_pay', [{ box: 3, currency: 'USD', dir: 'in', amount: 50 }], 'dealer_payment', { dealer_id: 9, amount_usd: 50 }), /oshib/i);
    assert.equal(await boxBal(pg, 'f729', 3), 280, 'rad etilgan diller to\'lovi kassaga tushmadi');
    assert.equal(await num(pg, `select count(*)::int v from dealer_payments`), 0);
    const ok = (await one(pg, `select public.cash_payment_atomic('f729','d2','dealer_pay','[{"box":3,"currency":"USD","dir":"in","amount":30}]'::jsonb,'dealer_payment','{"dealer_id":9,"amount_usd":30}'::jsonb) r`)).r;
    assert.equal(+ok.dealerDebtUsd, 10); assert.equal(+ok.dealerTotalPaidUsd, 30);
    const rep = (await one(pg, `select public.cash_payment_atomic('f729','d2','dealer_pay','[{"box":3,"currency":"USD","dir":"in","amount":30}]'::jsonb,'dealer_payment','{"dealer_id":9,"amount_usd":30}'::jsonb) r`)).r;
    assert.equal(rep.replay, true); assert.equal(+rep.dealerDebtUsd, 10, 'takror — qarz ikki marta kamaymaydi');
    assert.equal(await num(pg, `select count(*)::int v from dealer_payments`), 1);
    // Boshqa filial dilleri — rad
    await rejects(cp('d3', 'dealer_pay', [{ box: 3, currency: 'USD', dir: 'in', amount: 1 }], 'dealer_payment', { dealer_id: 9, amount_usd: 1 }).then(() => pg.query(`select public.cash_payment_atomic('baza','d4','dealer_pay','[{"box":3,"currency":"USD","dir":"in","amount":1}]'::jsonb,'dealer_payment','{"dealer_id":9,"amount_usd":1}'::jsonb)`)), /boshqa filial/i);
  });
}

// ── 4. Ruxsatlar: brauzer ishlatmaydigan narsalar yopiq; 25-migratsiya takroriy xavfsiz ──
async function testPrivilegesAndIdempotentMigration() {
  await withWorld(async ({ pg }) => {
    const before = await one(pg, `select (select count(*)::int from firma_kassa_ledger) a, (select count(*)::int from cashbox_ledger) b, (select sum(balance) from firma_kassa_balance) c`);
    await pg.exec(fs.readFileSync(MIG25, 'utf8'));
    const after = await one(pg, `select (select count(*)::int from firma_kassa_ledger) a, (select count(*)::int from cashbox_ledger) b, (select sum(balance) from firma_kassa_balance) c`);
    assert.deepEqual(after, before, '25-migratsiya qayta ishga tushirilsa ma\'lumot o\'zgarmaydi');
    const p = await one(pg, `select
      has_table_privilege('anon','public.partners','select') a1, has_table_privilege('authenticated','public.partner_ledger','select') a2,
      has_table_privilege('anon','public.dealers','select') a3, has_table_privilege('authenticated','public.dealers','update') a4,
      has_table_privilege('authenticated','public.dealer_payments','insert') a5, has_table_privilege('anon','public.bot_sessions','select') a6,
      has_table_privilege('authenticated','public.login_security','select') a7,
      has_function_privilege('anon','public.login_check_lock(text)','execute') f1,
      has_function_privilege('authenticated','public.cash_payment_atomic(text,text,text,jsonb,text,jsonb,bigint,text)','execute') f2,
      has_function_privilege('anon','public.branch_firma_loan(text,integer,text,text,numeric,text,text,text,bigint,text)','execute') f3,
      has_function_privilege('authenticated','public.firma_kassa_reverse(bigint,text,text,bigint,text)','execute') f4,
      has_function_privilege('service_role','public.cash_payment_atomic(text,text,text,jsonb,text,jsonb,bigint,text)','execute') s1,
      has_table_privilege('authenticated','public.dealer_orders','insert') k1, has_table_privilege('authenticated','public.dealers','select') k2`);
    for (const k of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'f1', 'f2', 'f3', 'f4']) assert.equal(p[k], false, `yopiq bo'lishi kerak: ${k}`);
    assert.equal(p.s1, true, 'server (service_role) ishlata oladi');
    assert.equal(p.k1, true, 'diller portali buyurtma yuboradi (RLS bilan) — saqlanadi');
    assert.equal(p.k2, true, 'diller portali o\'z qatorini o\'qiydi (RLS bilan) — saqlanadi');
    const big = await one(pg, `select data_type v from information_schema.columns where table_name='customer_debt_payments' and column_name='customer_local_id'`);
    assert.equal(big.v, 'bigint');
  });
}

// ── 5. cashbox-ops: to'lov yozuvi majburiy, qarzdan ortiq rad, bitta tranzaksiya; CNY kassa yo'q ──
async function testCashboxOpsRecord() {
  await withWorld(async ({ pg, client }) => {
    const h = loadFunction('cashbox-ops', client);
    const req = (key, kind, ops, record) => post({ filial: 'f729', key, kind, ops, record }, 't-kas');
    let r = await h(req('cp-norec', 'cust_debt_pay', [{ box: 1, dir: 'in', amount: 1000 }]));
    assert.equal(r.statusCode, 400, "record'siz to'lov qabul qilinmaydi");
    r = await h(req('cp-over', 'cust_debt_pay', [{ box: 1, dir: 'in', amount: 700000 }], { customerId: CID }));
    assert.equal(r.statusCode, 400, 'qarz (600 000) dan ortiq — rad'); assert.match(body(r).error, /oshib/);
    assert.equal(await boxBal(pg, 'f729', 1), 1200000, 'kassa o\'zgarmadi');
    r = await h(req('cp-ok-1', 'cust_debt_pay', [{ box: 1, dir: 'in', amount: 600000 }], { customerId: CID }));
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).balances['1'], 1800000);
    r = await h(req('cp-ok-1', 'cust_debt_pay', [{ box: 1, dir: 'in', amount: 600000 }], { customerId: CID }));
    assert.equal(body(r).replay, true);
    assert.equal(await num(pg, `select count(*)::int v from customer_debt_payments where idem_key='ops:cp-ok-1'`), 1, 'yozuv kassa harakati bilan birga, bir marta');
    r = await h(req('sp-over-1', 'supp_pay', [{ box: 3, dir: 'out', amount: 121 }], { supplierId: SID }));
    assert.equal(r.statusCode, 400, "ta'minotchi qarzidan (120$) ortiq — rad");
    r = await h(req('dp-ok-1', 'dealer_pay', [{ box: 3, dir: 'in', amount: 15 }], { dealerId: 9 }));
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).dealerDebtUsd, 25, 'diller qarzi serverdan');
    r = await h(req('hw-one-1', 'home_withdrawal', [{ box: 1, dir: 'out', amount: 100000 }], { note: 'uyga' }));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(await num(pg, `select count(*)::int v from home_withdrawals where idem_key='ops:hw-one-1'`), 1);
    r = await h(req('cny-one-1', 'manual_in', [{ box: 6, dir: 'in', amount: 10 }]));
    assert.equal(r.statusCode, 400, 'CNY — hisob valyutasi emas (faqat USD/UZS)'); assert.match(body(r).error, /valyuta/i);
  });
}

// ── 6. Eski kassa API'lari 24-migratsiyadan keyin — 410, hech narsa yozilmaydi ──
async function testLegacyBlocked() {
  await withWorld(async ({ pg, client }) => {
    const cases = [
      ['cashbox-transact', { boxId: 1, type: 'out', amount: 10, currentBal: 1200000, idemKey: 'l1' }],
      ['customer-debt-payment-add', { customerLocalId: CID, amountUzs: 1000, boxId: 1, debtBeforePaymentUzs: 600000, idemKey: 'l2' }],
      ['supplier-payment-add', { supplierLocalId: SID, amountUsd: 1, boxId: 3, debtBeforePayment: 120, idemKey: 'l3' }],
      ['home-withdrawal-add', { entries: [{ boxId: 1, cur: 'UZS', amount: 10, currentBal: 1200000 }], idemKey: 'l4' }],
      ['dealer-payment-add', { dealerId: 9, amountUsd: 1, idemKey: 'l5' }],
    ];
    for (const [fn, b] of cases) {
      const r = await loadFunction(fn, client)(post({ filial: 'f729', ...b }, 't-admin'));
      assert.equal(r.statusCode, 410, `${fn}: eskirgan — 410`); assert.equal(body(r).deprecated, true);
    }
    const n = await one(pg, `select (select count(*) from customer_debt_payments)::int a, (select count(*) from supplier_payments)::int b, (select count(*) from home_withdrawals)::int c, (select count(*) from dealer_payments)::int d, (select count(*) from cashbox_transactions)::int e`);
    assert.deepEqual(n, { a: 0, b: 0, c: 0, d: 0, e: 0 }, 'hech qanday "yarim" yozuv yo\'q');
  });
}

// ── 7. firma-kassa: qarz, bekor qilish, boshlang'ich qoldiq — ruxsatlar; hisobot; solishtirish ──
async function testFirmaKassaEndpoint() {
  await withWorld(async ({ pg, client }) => {
    const h = loadFunction('firma-kassa', client);
    const call = (b, tok) => h(post(b, tok));
    let r = await call({ action: 'branch_loan_give', currency: 'USD', amount: 100, boxId: 3, filial: 'f729', idemKey: 'g1', note: 'ijara' }, 't-kas');
    assert.equal(r.statusCode, 403, 'filial kassiri o\'ziga qarz BERA olmaydi (firma_kassa.transact kerak)');
    r = await call({ action: 'branch_loan_give', currency: 'USD', amount: 100, boxId: 3, filial: 'f729', idemKey: 'g1', note: 'ijara' }, 't-fk');
    assert.equal(r.statusCode, 400, "Baza xodimi boshqa filialga qarz bera olmaydi — faqat admin (ehtiyotkor qoida)");
    r = await call({ action: 'branch_loan_give', currency: 'USD', amount: 100, boxId: 3, filial: 'f729', idemKey: 'g1', note: 'ijara' }, 't-admin');
    assert.equal(r.statusCode, 200, r.body); assert.equal(+body(r).loan.branchBalance, 400);
    r = await call({ action: 'branch_loan_repay', currency: 'USD', amount: 40, boxId: 3, filial: 'f729', idemKey: 'p1' }, 't-kas');
    assert.equal(r.statusCode, 200, 'kassir qarzni QAYTARA oladi: ' + r.body); assert.equal(+body(r).loan.outstanding, 60);
    r = await call({ action: 'branch_summary' }, 't-kas');
    assert.equal(r.statusCode, 200); assert.deepEqual(body(r).branches.map(x => x.filial), ['f729'], 'filial xodimi faqat o\'z filialini ko\'radi');
    r = await call({ action: 'move', op: 'opening', currency: 'UZS', amount: 1000, idemKey: 'o1' }, 't-fk');
    assert.equal(r.statusCode, 403, 'boshlang\'ich qoldiq — faqat admin');
    r = await call({ action: 'move', op: 'opening', currency: 'UZS', amount: 1000, idemKey: 'o1' }, 't-admin');
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).entry.sourceType, 'opening_balance');
    const eid = body(r).entry.id;
    r = await call({ action: 'reverse', entryId: eid, idemKey: 'x1', note: 'xato' }, 't-fk');
    assert.equal(r.statusCode, 403, 'bekor qilish — faqat admin');
    r = await call({ action: 'reverse', entryId: eid, idemKey: 'x1', note: 'xato' }, 't-admin');
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).entry.reversalOf, eid);
    // Kirim solishtiruvi: K-LINKED partiyaga bog'langan; K-ORPHAN — yetim
    for (const [ref, key] of [['K-LINKED', 'k1'], ['K-ORPHAN', 'k2']]) {
      r = await call({ action: 'kirim_pay', currency: 'USD', amount: 10, refId: ref, cpName: 'X', idemKey: key }, 't-admin');
      assert.equal(r.statusCode, 200, r.body);
    }
    r = await call({ action: 'reconcile' }, 't-fk');
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(body(r).orphans.map(o => o.ref), ['K-ORPHAN'], 'faqat partiyaga bog\'lanmagan to\'lov ko\'rsatiladi');
    assert.equal((await one(pg, `select source_type v from firma_kassa_ledger where ref_id='K-ORPHAN'`)).v, 'kirim_payment');
  });
}

// ── 8. Telegram tokeni + Hamkorlar filial chegarasi ──
async function testTelegramAndPartnerScope() {
  await withWorld(async ({ pg, client }) => {
    let r = await loadFunction('app-data-load', client)(post({}, 't-admin'));
    assert.equal(r.statusCode, 200);
    assert.ok(!r.body.includes('SECRET_TOKEN_VALUE'), 'admin javobida ham token yo\'q');
    assert.equal(body(r).data.settings.tgBotTokenSet, true);
    const tt = loadFunction('telegram-test', client);
    r = await tt(post({ chatId: '-100123' }, 't-fk'));
    assert.equal(r.statusCode, 403, 'telegram-test — faqat admin');
    const realFetch = global.fetch; let sentUrl = null;
    global.fetch = async (u) => { sentUrl = String(u); return { json: async () => ({ ok: false, description: 'chat not found' }) }; };
    try {
      r = await tt(post({}, 't-admin'));
    } finally { global.fetch = realFetch; }
    assert.equal(r.statusCode, 200, r.body);
    assert.match(sentUrl, /api\.telegram\.org\/bot123456/, 'server saqlangan token bilan yubordi');
    assert.ok(!r.body.includes('SECRET_TOKEN_VALUE'), 'javobda token yo\'q');
    assert.equal(body(r).ok, false); assert.equal(body(r).description, 'chat not found');
    // v25: oson ulash — bot nomi (getMe) va bot qo'shilgan guruh/kanallar (getUpdates); chiqib ketilgani ko'rsatilmaydi; token javobda yo'q
    global.fetch = async (u) => { const m = String(u).split('/').pop();
      if (m === 'getMe') return { json: async () => ({ ok: true, result: { username: 'Powerful_hisobchi_bot', first_name: 'Hisobchi' } }) };
      return { json: async () => ({ ok: true, result: [
        { my_chat_member: { chat: { id: -1001, title: 'Hisobot <b>guruhi</b>', type: 'supergroup' }, new_chat_member: { status: 'member' } } },
        { my_chat_member: { chat: { id: -1002, title: 'Kanal', type: 'channel', username: 'powerful_kanal' }, new_chat_member: { status: 'administrator' } } },
        { my_chat_member: { chat: { id: -1003, title: 'Eski', type: 'group' }, new_chat_member: { status: 'member' } } },
        { my_chat_member: { chat: { id: -1003, title: 'Eski', type: 'group' }, new_chat_member: { status: 'left' } } },
        { message: { chat: { id: 77, type: 'private' } } } ] }) }; };
    try {
      const me = body(await tt(post({ action: 'me' }, 't-admin')));
      const fc = await tt(post({ action: 'find_chats' }, 't-admin'));
      const bad = body(await tt(post({ action: 'me', token: 'xato' }, 't-admin')));
      assert.deepEqual(me, { ok: true, bot: { username: 'Powerful_hisobchi_bot', name: 'Hisobchi' } });
      assert.deepEqual(body(fc).chats.map(c => [c.id, c.type, c.admin]), [['-1001', 'supergroup', false], ['-1002', 'channel', true]], 'chiqib ketilgan guruh va shaxsiy chat yo\'q');
      assert.ok(!fc.body.includes('123456'), 'javobda token yo\'q');
      assert.match(bad.error, /Token formati/);
    } finally { global.fetch = realFetch; }
    // Hamkorlar: f729 xodimi Baza hamkorini o'zgartira olmaydi, o'zinikini — oladi
    const { filterTopLevelChanges } = require('../netlify/functions/_lib/appDataGuard');
    const existing = { partners: [{ id: 1, name: 'Baza investori', invested: 1000 }, { id: 2, name: 'F729', invested: 300, filial: 'f729' }] };
    const incoming = { partners: [{ id: 1, name: 'Baza investori', invested: 1 }, { id: 2, name: 'F729', invested: 350, filial: 'f729' }, { id: 3, name: 'Yangi', invested: 5, filial: 'f729' }, { id: 4, name: 'Soxta', invested: 9, filial: 'baza' }] };
    const res = filterTopLevelChanges({ existing, incoming, permKeys: new Set(['hamkorlar.edit']), isAdmin: false, filial: 'f729' });
    const out = res.allowed.partners;
    assert.equal(out.find(x => x.id === 1).invested, 1000, 'Baza hamkori o\'zgarmadi');
    assert.equal(out.find(x => x.id === 2).invested, 350, 'o\'z filiali hamkori yangilandi');
    assert.ok(out.some(x => x.id === 3), 'o\'z filialiga yangi hamkor qo\'shildi');
    assert.ok(!out.some(x => x.id === 4), 'boshqa filialga hamkor qo\'shib bo\'lmaydi');
    const del = filterTopLevelChanges({ existing, incoming: { partners: [existing.partners[1]] }, permKeys: new Set(['hamkorlar.edit']), isAdmin: false, filial: 'f729' });
    assert.ok(del.allowed.partners.some(x => x.id === 1), 'Baza hamkorini o\'chirib bo\'lmaydi');
  });
}

// ── 9. 25-migratsiyasiz eski sxema: katta ID — aniq 409 (jim yiqilish emas); diller to'lovi fail-close ──
async function testLegacySchemaBigIdAndDealerWithoutMig25() {
  const { bigIdColumn, _resetCashAuthorityCache } = require('../netlify/functions/_lib/cashAuthority');
  _resetCashAuthorityCache();
  const pg = await newPg();
  try {
    await pg.exec(`create table public.customer_debt_payments (id bigint generated always as identity primary key, customer_local_id integer not null)`);
    const c = makePgSupabase(pg, { pgTables: ['customer_debt_payments'] });
    assert.equal(await bigIdColumn(c, 'customer_debt_payments', 'customer_local_id'), false, 'integer ustun aniqlandi (22003)');
    await pg.exec(`alter table public.customer_debt_payments alter column customer_local_id type bigint`);
    _resetCashAuthorityCache();
    assert.equal(await bigIdColumn(c, 'customer_debt_payments', 'customer_local_id'), true, 'bigint — yoziladi');
  } finally { _resetCashAuthorityCache(); await pg.close(); }
  // 24 bor, 25 yo'q: diller to'lovi qabul qilinmaydi (qarz SQL'da — ajralib ketmasin)
  await withWorld(async ({ pg, client }) => {
    // 25 (va undan keyingi 27) yo'q holat: to'lov funksiyalari va 27-migratsiya jadvali olib tashlanadi
    await pg.exec(`drop function public.cash_payment_atomic(text,text,text,jsonb,text,jsonb,bigint,text); drop function public.cash_payment_atomic_v2(text,text,text,jsonb,text,jsonb,bigint,text); drop table public.ledger_ops`);
    require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
    const h = loadFunction('cashbox-ops', client);
    const r = await h(post({ filial: 'f729', key: 'dp-nomig', kind: 'dealer_pay', ops: [{ box: 3, dir: 'in', amount: 5 }], record: { dealerId: 9 } }, 't-kas'));
    assert.equal(r.statusCode, 409); assert.equal(body(r).migrationPending, true);
    assert.equal(await boxBal(pg, 'f729', 3), 300, 'kassa o\'zgarmadi');
  });
}

module.exports = {
  name: 'P15 — v23: 25-migratsiya va server (haqiqiy PostgreSQL) — bekor qilish, filial qarzi, to\'lov atomikligi, eski API, Telegram, hamkorlar',
  cases: [
    { name: 'Firma kassa: manba, teskari yozuv bilan bekor qilish, jurnallar o\'zgarmas', run: testFirmaReversalImmutability },
    { name: 'Filial Bazadan pul qarzi: berish/qaytarish atomik, ortiqcha yo\'q, hisobot', run: testBranchLoan },
    { name: 'To\'lov + kassa bitta tranzaksiyada: katta mijoz ID, takror yo\'q, diller ortiqcha — hammasi bekor', run: testCashPaymentAtomic },
    { name: 'Ruxsatlar yopiq (anon/authenticated); 25-migratsiya takroriy xavfsiz', run: testPrivilegesAndIdempotentMigration },
    { name: 'cashbox-ops: record majburiy, qarzdan ortiq rad, CNY kassa yo\'q', run: testCashboxOpsRecord },
    { name: 'Eski kassa API\'lari 410 — "yarim" yozuv yo\'q', run: testLegacyBlocked },
    { name: 'firma-kassa: qarz/bekor qilish/boshlang\'ich qoldiq ruxsatlari, hisobot, Kirim solishtiruvi', run: testFirmaKassaEndpoint },
    { name: 'Telegram tokeni brauzerga ketmaydi; hamkorlar — faqat o\'z filiali', run: testTelegramAndPartnerScope },
    { name: '25-migratsiyasiz: katta ID aniqlanadi; diller to\'lovi fail-close (409)', run: testLegacySchemaBigIdAndDealerWithoutMig25 },
  ],
};
