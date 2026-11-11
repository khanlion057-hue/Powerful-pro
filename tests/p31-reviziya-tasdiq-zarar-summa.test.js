// P31 — v24.2 (32-migratsiya): DILLER REVIZIYASI ADMIN TASDIG'I BILAN (kamomad → sotuv, ortiqcha → qaytish),
// ZARAR SUMMASI SOTUVCHIGA, «XODIM» ROLIGA DIRECT SALE. HAQIQIY PostgreSQL (PGlite) + HAQIQIY `notifications`
// va `sale-checkout-atomic` server funksiyalari; har holatda BAZADAGI natija tekshiriladi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG27 = fs.readFileSync(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'), 'utf8');
const MIG32 = fs.readFileSync(path.join(ROOT, 'supabase-migration-32-reviziya-tasdiq-direct-sale.sql'), 'utf8');
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger',
  'sales', 'batches', 'customer_balances', 'supplier_balances', 'customer_debt_payments', 'supplier_payments', 'home_withdrawals',
  'idempotency_keys', 'ledger_ops', 'customer_debt_ledger', 'supplier_debt_ledger', 'stock_ledger',
  'fw_audit_events', 'fw_notifications', 'fw_dealer_revisions', 'dealers', 'dealer_stock', 'dealer_stock_moves', 'dealer_sales'];
const BOXES = [{ id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 0 }];
const BRANCH = { cashboxes: BOXES, cashTxns: [], expenses: [], customers: [], suppliers: [], sales: [],
  batches: [{ id: 9001, pid: 101, bno: '01', qty: 20, sold: 0, costUsd: 10, date: '2026-09-01', status: 'active' }] };
const D1 = '00000000-0000-4000-8000-0000000000d1';
const USERS = { 't-admin': { id: 'u-admin' }, 't-s1': { id: 'u-s1' }, 't-man': { id: 'u-man' }, 't-oth': { id: 'u-oth' }, 't-d1': { id: D1 } };
const ROLE = (rid, keys) => keys.map(k => ({ role_id: rid, permission_id: k, permissions: { key: k } }));

async function world({ no32 = false } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  const cut = SCHEMA.indexOf('\n-- ────────────────────────────────────────────────────────────────────\n-- 16. 32-migratsiya');
  assert.ok(cut > 0, "schema.sql: 32-migratsiya bo'limi bor");
  await pg.exec(SCHEMA.slice(0, cut));                              // 0..31
  if (!no32) { await pg.exec(MIG32); await pg.exec(MIG32); }        // ikki marta — idempotent
  // v24.8 (37): chegirma chegarasi ustun — zarar-tasdiq mexanizmini sinash uchun egasi chegarani 100% qilgan (p28 da standart 10% — rad)
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12000, maxDiscountPct: 100 },
    products: [{ id: 101, sku: 'A-101', name: 'Drel', markupPct: 50 }], branchStore: { f729: { cashboxes: BOXES } } })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('f729', $1::jsonb)`, [JSON.stringify(BRANCH)]);
  await pg.exec(MIG27);   // filial ma'lumotini (partiya — FIFO tannarx 10$) server jadvallariga ko'chiradi (P28 dagi kabi)
  await pg.query(`select cashbox_apply_ops('f729','seed-cash','manual_in','[{"box":3,"currency":"USD","dir":"in","amount":1000}]'::jsonb)`);
  await pg.exec(`insert into auth.users values ('${D1}')`);
  await pg.query(`insert into dealers (id, auth_user_id, login, name, debt_usd, total_sold_usd, filial) overriding system value values (31, '${D1}', 'd1', 'Diller Bir', 100, 100, 'f729')`);
  await pg.query(`insert into catalog_products (id, filial, sku, name, optim_price) values (101, 'f729', 'A-101', 'Drel', 20), (102, 'f729', 'B-102', 'Bolgarka', 30)`);
  await pg.query(`insert into dealer_stock (dealer_id, pid, sku, name, qty, avg_cost_usd) values (31, 101, 'A-101', 'Drel', 10, 10), (31, 102, 'B-102', 'Bolgarka', 4, 15)`);
  await pg.query(`insert into dealer_stock_moves (dealer_id, type, pid, sku, name, qty) values (31,'send',101,'A-101','Drel',13), (31,'send',102,'B-102','Bolgarka',4)`);
  // 101: 3 dona sotilgan (qarzga 60$ yozilgan) — qaytish faqat shu miqdorgacha
  await pg.query(`insert into dealer_sales (dealer_id, pid, sku, name, qty, sell_usd, total_usd) values (31, 101, 'A-101', 'Drel', 3, 20, 60)`);
  const memTables = {
    staff: [
      { id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
      { id: 7, auth_user_id: 'u-s1', role: 'sotuvchi', active: true, filial: 'f729', name: 'Sotuvchi Bir', login: 's1' },
      { id: 9, auth_user_id: 'u-man', role: 'sotuvchi', active: true, filial: 'f729', name: 'Menejer', login: 'man' },
      { id: 11, auth_user_id: 'u-oth', role: 'sotuvchi', active: true, filial: 'f800', name: 'Boshqa filial', login: 'oth' },
    ],
    staff_roles: [{ staff_id: 7, role_id: 'sel' }, { staff_id: 9, role_id: 'man' }, { staff_id: 11, role_id: 'man' }],
    role_permissions: [...ROLE('sel', ['savdo.create']), ...ROLE('man', ['savdo.create', 'dillerlar.view', 'dillerlar.manage'])],
    staff_audit_log: [],
  };
  require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
  require('../netlify/functions/_lib/cashAuthority')._resetCashAuthorityCache();
  return { pg, client: makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: USERS }) };
}
async function withWorld(opts, fn) { const w = await world(opts); try { await fn(w); } finally { unloadFunctions(); await w.pg.close(); } }
const body = (r) => JSON.parse(r.body);
const rows = async (pg, sql, p) => (await pg.query(sql, p)).rows;
const num = async (pg, sql, p) => +(((await pg.query(sql, p)).rows[0] || {}).v ?? NaN);
const stock = (pg, pid) => num(pg, `select qty v from dealer_stock where dealer_id=31 and pid=$1`, [pid]);
const debt = (pg) => num(pg, `select debt_usd v from dealers where id=31`);

async function testApprove() {
  await withWorld({}, async ({ pg, client }) => {
    const nf = loadFunction('notifications', client);
    // 101: tizimda 10, sanaldi 8 → kamomad 2 (sotuv 2×20$); 102: tizimda 4, sanaldi 6 → ortiqcha 2, lekin hech qachon sotilmagan → noma'lum ortiqcha
    let r = await nf(post({ action: 'rev_submit', lines: [{ pid: 101, counted: 8 }, { pid: 102, counted: 6 }], reason: 'Oylik sanoq', idemKey: 'rev-a-0001' }, 't-d1'));
    assert.equal(r.statusCode, 200, r.body);
    const rid = body(r).revisionId; assert.ok(rid > 0); assert.equal(body(r).approvable, true);
    assert.equal(await stock(pg, 101), 10, 'tasdiqgacha qoldiq oʻzgarmaydi'); assert.equal(await debt(pg), 100);
    assert.match((await rows(pg, `select body from fw_notifications where kind='dealer_revision'`))[0].body, /Tasdiqlansa: kamomad — sotuv/);
    // takror yuborish — ikkinchi reviziya yaratilmaydi
    r = await nf(post({ action: 'rev_submit', lines: [{ pid: 101, counted: 8 }, { pid: 102, counted: 6 }], reason: 'Oylik sanoq', idemKey: 'rev-a-0001' }, 't-d1'));
    assert.equal(body(r).replay, true); assert.equal(body(r).revisionId, rid);
    assert.equal(await num(pg, `select count(*)::int v from fw_dealer_revisions`), 1);
    // huquq: oddiy sotuvchi — 403; boshqa filial menejeri — ro'yxatda ko'rmaydi va tasdiqlay olmaydi
    r = await nf(post({ action: 'rev_list' }, 't-s1')); assert.equal(r.statusCode, 403);
    r = await nf(post({ action: 'rev_list' }, 't-oth')); assert.equal(r.statusCode, 200); assert.equal(body(r).items.length, 0);
    r = await nf(post({ action: 'rev_decide', id: rid, approve: true }, 't-oth')); assert.equal(r.statusCode, 409); assert.match(body(r).error, /boshqa filial/);
    assert.equal(await stock(pg, 101), 10);
    // menejer (dillerlar.manage, o'z filiali) ro'yxatda ko'radi
    r = await nf(post({ action: 'rev_list' }, 't-man'));
    assert.deepEqual(body(r).items.map(x => [x.id, x.status, x.shortageQty, x.surplusQty, x.dealerName]), [[rid, 'pending', 2, 2, 'Diller Bir']]);
    // rad etish — sababsiz bo'lmaydi
    r = await nf(post({ action: 'rev_decide', id: rid, approve: false }, 't-man')); assert.equal(r.statusCode, 400);
    // TASDIQ (admin)
    r = await nf(post({ action: 'rev_decide', id: rid, approve: true, note: 'Tekshirildi' }, 't-admin'));
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).status, 'approved');
    assert.equal(await stock(pg, 101), 8, 'kamomad — sotuv: qoldiqdan chiqdi');
    assert.equal(await stock(pg, 102), 6, 'ortiqcha — qoldiqqa qoʻshildi');
    assert.equal(await debt(pg), 140, 'qarz: 100 + 2×20 (sotuv); 102 — hech qachon sotilmagan, pulga taʼsir yoʻq');
    const ds = await rows(pg, `select pid, qty::float8 q, sell_usd::float8 p, total_usd::float8 t, source from dealer_sales where source is not null order by id`);
    assert.deepEqual(ds.map(x => ({ ...x, pid: Number(x.pid) })), [{ pid: 101, q: 2, p: 20, t: 40, source: 'revision_short' }]);
    const res = body(r).result; assert.equal(res.debtDeltaUsd, 40);
    assert.deepEqual(res.effects.map(e => [e.pid, e.kind, e.qty, e.unknownQty ?? 0]), [[101, 'sale', 2, 0], [102, 'return', 0, 2]]);
    assert.equal(await num(pg, `select count(*)::int v from fw_audit_events where action='revision_apply'`), 1);
    assert.equal(await num(pg, `select count(*)::int v from fw_notifications where kind='dealer_revision_result' and audience='dealer' and audience_id=31`), 1);
    // takror bosish — ikki marta yozilmaydi
    r = await nf(post({ action: 'rev_decide', id: rid, approve: true }, 't-admin'));
    assert.equal(r.statusCode, 200); assert.equal(body(r).replay, true);
    assert.equal(await stock(pg, 101), 8); assert.equal(await debt(pg), 140);
    // qaror qabul qilingan reviziyani o'zgartirib/o'chirib bo'lmaydi
    await assert.rejects(pg.query(`update fw_dealer_revisions set status='pending', decided_at=null where id=$1`, [rid]), /qaror allaqachon/);
    await assert.rejects(pg.query(`delete from fw_dealer_revisions where id=$1`, [rid]), /o'chirib bo'lmaydi/);
    // diller — o'z reviziyalari holati
    r = await nf(post({ action: 'rev_mine' }, 't-d1'));
    assert.deepEqual(body(r).items.map(x => [x.id, x.status]), [[rid, 'approved']]);
  });
}

async function testSurplusReturnAndStale() {
  await withWorld({}, async ({ pg, client }) => {
    const nf = loadFunction('notifications', client);
    // 101: tizimda 10, sanaldi 14 → ortiqcha 4; avval 3 dona sotilgan → 3 qaytish (−60$), 1 — noma'lum ortiqcha
    let r = await nf(post({ action: 'rev_submit', lines: [{ pid: 101, counted: 14 }], reason: '', idemKey: 'rev-b-0001' }, 't-d1'));
    const rid = body(r).revisionId;
    r = await nf(post({ action: 'rev_decide', id: rid, approve: true }, 't-man'));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(await stock(pg, 101), 14); assert.equal(await debt(pg), 40, 'qarz 100 − 3×20');
    assert.equal(await num(pg, `select coalesce(sum(qty),0)::float8 v from dealer_sales where pid=101`), 0, 'sof sotilgan 0');
    assert.deepEqual(body(r).result.effects.map(e => [e.kind, e.qty, e.unknownQty]), [['return', 3, 1]]);
    // Eskirgan reviziya: yuborilgandan keyin qoldiq o'zgarsa — tasdiq rad, hech narsa yozilmaydi
    r = await nf(post({ action: 'rev_submit', lines: [{ pid: 102, counted: 3 }], reason: 'kam', idemKey: 'rev-b-0002' }, 't-d1'));
    const rid2 = body(r).revisionId;
    await pg.query(`update dealer_stock set qty = 5 where dealer_id=31 and pid=102`);   // yangi jo'natma keldi
    const before = await num(pg, `select count(*)::int v from dealer_sales`);
    r = await nf(post({ action: 'rev_decide', id: rid2, approve: true }, 't-admin'));
    assert.equal(r.statusCode, 409); assert.equal(body(r).code, 'REV_STALE'); assert.match(body(r).error, /qayta reviziya/);
    assert.equal(await stock(pg, 102), 5); assert.equal(await num(pg, `select count(*)::int v from dealer_sales`), before);
    assert.equal((await rows(pg, `select status from fw_dealer_revisions where id=$1`, [rid2]))[0].status, 'pending', 'kutilmoqda boʻlib qoldi');
    // rad etish — hech narsa o'zgarmaydi, dillerga sabab bilan xabar
    r = await nf(post({ action: 'rev_decide', id: rid2, approve: false, note: 'Qayta sanang' }, 't-admin'));
    assert.equal(body(r).status, 'rejected'); assert.equal(await stock(pg, 102), 5); assert.equal(await debt(pg), 40);
    assert.match((await rows(pg, `select body from fw_notifications where kind='dealer_revision_result' order by id desc limit 1`))[0].body, /Qayta sanang/);
  });
}

async function testLossAmountAndRole() {
  await withWorld({}, async ({ pg, client }) => {
    const ck = loadFunction('sale-checkout-atomic', client);
    const items = [{ pid: 101, qty: 2, sellUsd: 8, costUsd: 0 }];
    const r = await ck(post({ filial: 'f729', items, paidUsd: 16, boxPayments: [{ box_id: 3, amount_native: 16 }], inv: 'I-L1', idemKey: 'loss-key-1',
      saleLocalId: 'sL1', payType: 'usd', custName: 'X' }, 't-s1'));
    assert.equal(r.statusCode, 409, r.body); assert.equal(body(r).code, 'LOSS_ACK_REQUIRED');
    assert.equal(body(r).lossUsd, 4, 'zarar summasi: 2×10 − 16 = 4$ (server FIFO)');
    assert.equal(await num(pg, `select count(*)::int v from sales`), 0, 'hech narsa yozilmadi');
    // «Xodim» roliga Direct Sale; diller roliga — yo'q
    const keys = (await rows(pg, `select r.key from role_permissions rp join roles r on r.id=rp.role_id join permissions p on p.id=rp.permission_id
      where p.key='savdo.direct_sale' order by 1`)).map(x => x.key);
    assert.ok(keys.includes('employee'), 'employee'); assert.ok(!keys.includes('dealer'), 'diller yoʻq');
    // brauzer rollariga yangi jadval/funksiya ochilmagan
    const g = (await rows(pg, `select has_table_privilege('authenticated','public.fw_dealer_revisions','select') a, has_table_privilege('anon','public.fw_dealer_revisions','insert') b,
      has_function_privilege('authenticated','public.dealer_revision_decide(bigint, boolean, bigint, text, text, text, text)','execute') c`))[0];
    assert.deepEqual([g.a, g.b, g.c], [false, false, false]);
  });
}

async function testWithout32() {
  await withWorld({ no32: true }, async ({ pg, client }) => {
    const nf = loadFunction('notifications', client);
    let r = await nf(post({ action: 'rev_submit', lines: [{ pid: 101, counted: 8 }], reason: 'x', idemKey: 'rev-c-0001' }, 't-d1'));
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).approvable, false, '32 yoʻq — faqat qayd (31 dagidek)');
    assert.equal(await stock(pg, 101), 10);
    r = await nf(post({ action: 'rev_list' }, 't-admin')); assert.equal(r.statusCode, 409); assert.equal(body(r).migration32Pending, true);
    r = await nf(post({ action: 'rev_mine' }, 't-d1')); assert.equal(r.statusCode, 200); assert.equal(body(r).migration32Pending, true);
    const ck = loadFunction('sale-checkout-atomic', client);
    r = await ck(post({ filial: 'f729', items: [{ pid: 101, qty: 2, sellUsd: 8, costUsd: 0 }], paidUsd: 16, boxPayments: [{ box_id: 3, amount_native: 16 }], inv: 'I-L2',
      idemKey: 'loss-key-2', saleLocalId: 'sL2', payType: 'usd', custName: 'X' }, 't-s1'));
    assert.equal(r.statusCode, 409); assert.equal(body(r).lossUsd, null, '31 da summa yoʻq — brauzer oʻz hisobidan koʻrsatadi');
  });
}

module.exports = {
  name: "P31 — v24.2 (32-migratsiya): reviziya — admin tasdig'i bilan sotuv/qaytish, zarar summasi, Xodim roliga Direct Sale",
  cases: [
    { name: "Reviziya tasdig'i: kamomad → sotuv (qarz optomda), noma'lum ortiqcha — faqat qoldiq; huquq/filial; takrorsiz; o'zgarmas", run: testApprove },
    { name: "Ortiqcha → qaytish (faqat sotilgangacha, qarz kamayadi); eskirgan reviziya — rad, hech narsa yozilmaydi; rad etish sabab bilan", run: testSurplusReturnAndStale },
    { name: "Zarar summasi server javobida; Xodim roliga Direct Sale (diller — yo'q); brauzer rollari huquqsiz", run: testLossAmountAndRole },
    { name: "32-migratsiyasiz: reviziya — faqat qayd, ro'yxat — 409; zarar summasi null", run: testWithout32 },
  ],
};
