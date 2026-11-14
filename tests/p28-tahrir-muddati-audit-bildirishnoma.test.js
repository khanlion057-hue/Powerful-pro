// P28 — v24 (31-migratsiya): TAHRIRLASH MUDDATLARI, AUDIT TARIXI, BILDIRISHNOMALAR, ZARARLI SAVDO TASDIG'I,
// DILLER NARX CHEGARASI (−10%), DIRECT SALE RUXSATI, DILLER REVIZIYASI, TELEGRAM E'LONI (takrorsiz), SOZLAMALAR VALIDATSIYASI.
// HAQIQIY PostgreSQL (PGlite) + HAQIQIY server funksiyalari (sale-checkout-atomic, sale-ops, notifications,
// telegram-announce). Har bir holatda BAZADAGI natija tekshiriladi.
//  • Telegram API — bu testda SOXTA fetch (tarmoqqa chiqilmaydi): faqat takror/xato/qayta urinish mantig'i tekshiriladi.
//    Haqiqiy Telegram kanal/guruhga yuborish — NOT VERIFIED (tokenli haqiqiy bot kerak).
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG27 = fs.readFileSync(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'), 'utf8');
const MIG31 = fs.readFileSync(path.join(ROOT, 'supabase-migration-31-tahrir-muddati-audit-bildirishnoma.sql'), 'utf8');
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger',
  'sales', 'batches', 'customer_balances', 'supplier_balances', 'customer_debt_payments', 'supplier_payments', 'home_withdrawals',
  'idempotency_keys', 'ledger_ops', 'customer_debt_ledger', 'supplier_debt_ledger', 'stock_ledger',
  'fw_audit_events', 'fw_notifications', 'dealers', 'dealer_stock', 'dealer_stock_moves', 'dealer_sales'];
const SID = 1759300000000456;
const BOXES = [{ id: 1, name: "Naqd So'm", cur: 'UZS', type: 'cash', bal: 0 }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 0 }];
const BRANCH = {
  cashboxes: BOXES, cashTxns: [], expenses: [], customers: [{ id: 501, name: 'Ali', debt: 0 }],
  suppliers: [{ id: SID, name: 'Taʼminotchi', debt: 0, paid: 0, allowDirectSale: true }],
  batches: [{ id: 9001, pid: 101, bno: '01', qty: 20, sold: 0, costUsd: 10, date: '2026-09-01', status: 'active' }],
  sales: [],
};
const PRODUCTS = [
  { id: 101, sku: 'A-101', name: 'Drel', markupPct: 50, images: ['https://cdn.example.uz/p101.jpg'] },
  { id: 202, sku: 'DS-202', name: 'Generator', directSale: true, dsSuppId: SID, dsCostUsd: 70, markupPct: 20 },
];
const USERS = { 't-admin': { id: 'u-admin' }, 't-s1': { id: 'u-s1' }, 't-s2': { id: 'u-s2' }, 't-man': { id: 'u-man' }, 't-ds': { id: 'u-ds' },
  't-d1': { id: '00000000-0000-4000-8000-0000000000d1' } };
const ROLE = (rid, keys) => keys.map(k => ({ role_id: rid, permission_id: k, permissions: { key: k } }));

async function world({ no31 = false } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  const full = SCHEMA;
  const cut = full.indexOf('\n-- ────────────────────────────────────────────────────────────────────\n-- 15. 31-migratsiya');
  assert.ok(cut > 0, "schema.sql: 31-migratsiya bo'limi bor");
  await pg.exec(full.slice(0, cut));   // 0..30
  // v24.8 (37): chegirma chegarasi ustun (egasi qarori 2026-10-17) — zarar-tasdiq mexanizmini sinash uchun bu dunyoda
  // egasi chegarani 100% qilib qo'ygan; standart (10%) da zararli savdo rad etilishi — testLossSale boshida
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12000, maxDiscountPct: 100 }, products: PRODUCTS, branchStore: { f729: { cashboxes: BOXES } } })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('f729', $1::jsonb)`, [JSON.stringify(BRANCH)]);
  await pg.exec(MIG27);
  if (!no31) { await pg.exec(MIG31); await pg.exec(MIG31); }   // ikki marta — idempotent
  await pg.query(`select cashbox_apply_ops('f729','seed-cash','manual_in','[{"box":3,"currency":"USD","dir":"in","amount":1000}]'::jsonb)`);
  const memTables = {
    staff: [
      { id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
      { id: 7, auth_user_id: 'u-s1', role: 'sotuvchi', active: true, filial: 'f729', name: 'Sotuvchi Bir', login: 's1' },
      { id: 8, auth_user_id: 'u-s2', role: 'sotuvchi', active: true, filial: 'f729', name: 'Sotuvchi Ikki', login: 's2' },
      { id: 9, auth_user_id: 'u-man', role: 'sotuvchi', active: true, filial: 'f729', name: 'Menejer', login: 'man' },
      { id: 10, auth_user_id: 'u-ds', role: 'sotuvchi', active: true, filial: 'f729', name: 'DS sotuvchi', login: 'ds' },
    ],
    staff_roles: [{ staff_id: 7, role_id: 'sel' }, { staff_id: 8, role_id: 'sel' }, { staff_id: 9, role_id: 'man' }, { staff_id: 10, role_id: 'ds' }],
    role_permissions: [...ROLE('sel', ['savdo.create']), ...ROLE('man', ['savdo.create', 'savdo.edit']), ...ROLE('ds', ['savdo.create', 'savdo.direct_sale'])],
    staff_audit_log: [],
  };
  require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
  require('../netlify/functions/_lib/cashAuthority')._resetCashAuthorityCache();
  return { pg, client: makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: USERS }) };
}
async function withWorld(opts, fn) {
  const w = await world(opts);
  try { await fn(w); } finally { unloadFunctions(); await w.pg.close(); }
}
const body = (r) => JSON.parse(r.body);
const rows = async (pg, sql, p) => (await pg.query(sql, p)).rows;
const num = async (pg, sql, p) => +(((await pg.query(sql, p)).rows[0] || {}).v ?? NaN);
const left = (pg, pid) => num(pg, `select coalesce(sum(qty-sold),0) v from batches where filial='f729' and pid=$1 and status='active'`, [pid]);
const checkout = (h, key, items, token, extra = {}) => h(post({ filial: 'f729', items, paidUsd: extra.paidUsd ?? items.reduce((s, i) => s + i.qty * i.sellUsd, 0),
  boxPayments: extra.boxPayments ?? [{ box_id: 3, amount_native: items.reduce((s, i) => s + i.qty * i.sellUsd, 0) }], inv: 'I-' + key, idemKey: key,
  saleLocalId: 's' + key, payType: 'usd', custName: 'X', ...(extra.body || {}) }, token));

// ── 1. Zarar bilan savdo: sotuvchi tasdig'isiz — rad (hech narsa yozilmaydi); tasdiq bilan — audit + admin bildirishnomasi ──
async function testLossSale() {
  await withWorld({}, async ({ pg, client }) => {
    const ck = loadFunction('sale-checkout-atomic', client);
    // v24.8: standart chegara (10%) — sotuvchining zararli savdosi tasdiq bilan ham rad (hech narsa yozilmaydi)
    await pg.query(`update app_data set data = jsonb_set(data, '{settings,maxDiscountPct}', '10') where id='main'`);
    let r = await checkout(ck, 'loss-0', [{ pid: 101, qty: 2, sellUsd: 8, costUsd: 0 }], 't-s1', { body: { lossAck: true } });
    assert.equal(r.statusCode, 400, r.body); assert.equal(body(r).code, 'DISCOUNT_LIMIT');
    assert.equal(await num(pg, `select count(*)::int v from sales`), 0, 'savdo yozilmadi');
    await pg.query(`update app_data set data = jsonb_set(data, '{settings,maxDiscountPct}', '100') where id='main'`);
    // brauzer tannarxni 0 deb yuborsa ham server FIFO (10$) bo'yicha zararni aniqlaydi
    r = await checkout(ck, 'loss-1', [{ pid: 101, qty: 2, sellUsd: 8, costUsd: 0 }], 't-s1');
    assert.equal(r.statusCode, 409, r.body); assert.equal(body(r).code, 'LOSS_ACK_REQUIRED');
    assert.equal(await left(pg, 101), 20, 'ombor o\'zgarmadi');
    assert.equal(await num(pg, `select count(*)::int v from sales`), 0, 'savdo yozilmadi');
    assert.equal(await num(pg, `select count(*)::int v from fw_audit_events`), 0);
    // o'sha kalit + tasdiq — o'tadi
    r = await checkout(ck, 'loss-1', [{ pid: 101, qty: 2, sellUsd: 8, costUsd: 0 }], 't-s1', { body: { lossAck: true } });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(await left(pg, 101), 18);
    const loss = (await rows(pg, `select * from fw_audit_events where action='loss_sale'`))[0];
    assert.ok(loss, 'zarar auditda'); assert.equal(loss.actor_name, 'Sotuvchi Bir'); assert.equal(loss.actor_role, 'seller');
    assert.equal(+loss.after.lossUsd, 4); assert.equal(+loss.after.costUsd, 20); assert.equal(+loss.after.totalUsd, 16);
    assert.equal(await num(pg, `select count(*)::int v from fw_audit_events where action='create'`), 1, 'yaratish hodisasi');
    const n = (await rows(pg, `select * from fw_notifications where kind='loss_sale'`))[0];
    assert.ok(n && n.audience === 'admin', 'admin xabardor');
    // takror (tarmoq) — ikkinchi audit/bildirishnoma yo'q
    r = await checkout(ck, 'loss-1', [{ pid: 101, qty: 2, sellUsd: 8, costUsd: 0 }], 't-s1', { body: { lossAck: true } });
    assert.equal(r.statusCode, 200);
    assert.equal(await num(pg, `select count(*)::int v from fw_audit_events where action='loss_sale'`), 1);
    assert.equal(await num(pg, `select count(*)::int v from fw_notifications`), 1);
    assert.equal(await left(pg, 101), 18);
    // admin — tasdiqsiz ham (o'zi nazorat qiladi), lekin auditda qoladi; admin o'ziga bildirishnoma yubormaydi
    r = await checkout(ck, 'loss-adm', [{ pid: 101, qty: 1, sellUsd: 5, costUsd: 10 }], 't-admin', { body: { filial: 'f729' } });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(await num(pg, `select count(*)::int v from fw_audit_events where action='loss_sale'`), 2);
    assert.equal(await num(pg, `select count(*)::int v from fw_notifications`), 1);
  });
}

// ── 2. Tahrirlash muddati (server vaqti) va egalik; oldingi/yangi qiymat auditda; bildirishnomalar ──
async function testEditWindow() {
  await withWorld({}, async ({ pg, client }) => {
    const ck = loadFunction('sale-checkout-atomic', client), ops = loadFunction('sale-ops', client);
    let r = await checkout(ck, 'ew-1', [{ pid: 101, qty: 2, sellUsd: 20, costUsd: 10 }], 't-s1');
    assert.equal(r.statusCode, 200, r.body);
    const edit = (key, token, price) => ops(post({ filial: 'f729', action: 'edit', key, saleLocalId: 'sew-1', mode: 'price', payload: { prices: [price] } }, token));
    // boshqa sotuvchi (savdo.edit yo'q) — rad
    r = await edit('ed-s2-01', 't-s2', 21);
    assert.equal(r.statusCode, 400); assert.match(body(r).error, /o'zingiz bajargan/);
    // o'zi — 7 kun ichida — o'tadi; audit: oldingi 40$ → yangi 44$
    r = await edit('ed-s1-01', 't-s1', 22);
    assert.equal(r.statusCode, 200, r.body);
    const a = (await rows(pg, `select * from fw_audit_events where action='edit'`))[0];
    assert.equal(+a.before.totalUsd, 40); assert.equal(+a.after.totalUsd, 44); assert.equal(a.actor_role, 'seller');
    assert.ok((await rows(pg, `select 1 from fw_notifications where kind='sale_edit' and audience='admin'`)).length === 1, 'admin xabardor');
    // menejer (savdo.edit) — boshqaning savdosini ham
    r = await edit('ed-man-01', 't-man', 23);
    assert.equal(r.statusCode, 200, r.body);
    // 8 kun oldin yaratilgan — sotuvchi uchun muddat tugagan (7 kun), admin uchun hali ochiq (30 kun)
    await pg.exec(`update sales set created_at = now() - interval '8 days', sale_date = (now() - interval '8 days')::date where local_id = 'sew-1'`);
    r = await edit('ed-s1-02', 't-s1', 24);
    assert.equal(r.statusCode, 400); assert.match(body(r).error, /muddati tugagan \(7 kun/);
    assert.equal(+(await rows(pg, `select total_usd from sales where local_id='sew-1'`))[0].total_usd, 46, 'savdo o\'zgarmadi');
    r = await edit('ed-adm-01', 't-admin', 25);
    assert.equal(r.statusCode, 200, r.body);
    // admin sotuvchining savdosini tuzatdi — sotuvchiga bildirishnoma
    assert.equal(await num(pg, `select count(*)::int v from fw_notifications where audience='seller' and audience_id=7`), 1);
    // takror (o'sha kalit) — muddat tugagan bo'lsa ham replay (yangi yozuv yo'q)
    r = await edit('ed-s1-01', 't-s1', 22);
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).replay, true);
    // 31 kun — admin uchun ham tugagan
    await pg.exec(`update sales set created_at = now() - interval '31 days', sale_date = (now() - interval '31 days')::date where local_id = 'sew-1'`);
    r = await edit('ed-adm-02', 't-admin', 26);
    assert.equal(r.statusCode, 400); assert.match(body(r).error, /30 kun/);
    // savdo sanasi (sale_date) eski bo'lsa — created_at yangi bo'lsa ham qat'iy tomon olinadi
    r = await checkout(ck, 'ew-2', [{ pid: 101, qty: 1, sellUsd: 20, costUsd: 10 }], 't-s1');
    await pg.exec(`update sales set sale_date = (now() - interval '10 days')::date where local_id = 'sew-2'`);
    r = await ops(post({ filial: 'f729', action: 'edit', key: 'ed-s1-03', saleLocalId: 'sew-2', mode: 'price', payload: { prices: [21] } }, 't-s1'));
    assert.equal(r.statusCode, 400);
  });
}

// ── 3. O'chirish (void): muddat, iz qoladi, audit va bildirishnoma; audit o'zgarmas ──
async function testVoidAndAuditImmutable() {
  await withWorld({}, async ({ pg, client }) => {
    const ck = loadFunction('sale-checkout-atomic', client), ops = loadFunction('sale-ops', client);
    await checkout(ck, 'vd-1', [{ pid: 101, qty: 3, sellUsd: 20, costUsd: 10 }], 't-s1');
    let r = await ops(post({ filial: 'f729', action: 'void', key: 'void-s2-01', saleLocalId: 'svd-1', batchIds: ['vb-1001'] }, 't-s2'));
    assert.equal(r.statusCode, 400, 'boshqa sotuvchi o\'chira olmaydi');
    r = await ops(post({ filial: 'f729', action: 'void', key: 'void-s1-01', saleLocalId: 'svd-1', batchIds: ['vb-1002'] }, 't-s1'));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(await left(pg, 101), 20);
    const s = (await rows(pg, `select status, voided_at from sales where local_id='svd-1'`))[0];
    assert.equal(s.status, 'voided', 'savdo yozuvi bazada qoladi (iz)'); assert.ok(s.voided_at);
    const v = (await rows(pg, `select * from fw_audit_events where action='void'`))[0];
    assert.equal(v.before.status, 'done'); assert.equal(v.after.status, 'voided');
    assert.equal(await num(pg, `select count(*)::int v from fw_notifications where kind='sale_void'`), 1);
    // audit va bildirishnoma mazmunini o'zgartirib/o'chirib bo'lmaydi
    await assert.rejects(pg.exec(`update fw_audit_events set note='x'`), /AUDIT/);
    await assert.rejects(pg.exec(`delete from fw_audit_events`), /AUDIT/);
    await assert.rejects(pg.exec(`truncate fw_audit_events`), /AUDIT/);
    await assert.rejects(pg.exec(`update fw_notifications set title='x'`), /NOTIF/);
    await assert.rejects(pg.exec(`delete from fw_notifications`), /NOTIF/);
    await pg.exec(`update fw_notifications set read_at = now()`);   // faqat «o'qildi» — ruxsat
    // anon/authenticated — jadvallarga umuman huquq yo'q
    const g = await rows(pg, `select has_table_privilege('authenticated','public.fw_audit_events','select') a, has_table_privilege('anon','public.fw_notifications','select') b,
      has_function_privilege('authenticated','public.sale_edit_guarded(text, text, text, text, jsonb, bigint, text, text, boolean)','execute') c`);
    assert.deepEqual(g[0], { a: false, b: false, c: false });
  });
}

// ── 4. Bildirishnomalar funksiyasi: auditoriya, 7 kun / arxiv, o'qildi; savdo tarixi (sotuvchiga tannarxsiz) ──
async function testNotificationsFn() {
  await withWorld({}, async ({ pg, client }) => {
    const ck = loadFunction('sale-checkout-atomic', client), ops = loadFunction('sale-ops', client), nf = loadFunction('notifications', client);
    await checkout(ck, 'nf-1', [{ pid: 101, qty: 1, sellUsd: 8, costUsd: 10 }], 't-s1', { body: { lossAck: true } });
    await ops(post({ filial: 'f729', action: 'edit', key: 'nf-ed-01', saleLocalId: 'snf-1', mode: 'price', payload: { prices: [9] } }, 't-s1'));
    await pg.query(`insert into fw_notifications (filial, audience, kind, title, created_at) values ('f729','admin','system','Eski xabar', now() - interval '10 days')`);
    let r = await nf(post({ action: 'list', scope: 'active' }, 't-admin'));
    assert.equal(r.statusCode, 200, r.body);
    let d = body(r);
    assert.deepEqual(d.items.map(x => x.kind).sort(), ['loss_sale', 'sale_edit']); assert.equal(d.unread, 2);
    r = await nf(post({ action: 'list', scope: 'archive' }, 't-admin'));
    assert.deepEqual(body(r).items.map(x => x.title), ['Eski xabar'], '7 kundan eskisi — arxivda (o\'chirilmagan)');
    // sotuvchi admin xabarlarini ko'rmaydi
    r = await nf(post({ action: 'list', scope: 'active' }, 't-s2'));
    assert.equal(body(r).items.length, 0);
    // o'qildi — faqat o'ziga ko'rinadiganlar
    const ids = d.items.map(x => x.id);
    r = await nf(post({ action: 'read', ids }, 't-s2'));
    assert.equal(body(r).marked, 0, 'sotuvchi admin xabarini belgilay olmaydi');
    r = await nf(post({ action: 'read', ids }, 't-admin'));
    assert.equal(body(r).marked, 2);
    r = await nf(post({ action: 'list', scope: 'active' }, 't-admin'));
    assert.equal(body(r).unread, 0);
    // savdo tarixi: admin — hammasi (tannarx bilan); sotuvchi — faqat o'zi bajargan, tannarx/zararsiz
    r = await nf(post({ action: 'history', entity: 'sale' }, 't-admin'));
    const ha = body(r).items;
    assert.deepEqual(ha.map(x => x.action).sort(), ['create', 'edit', 'loss_sale']);
    assert.ok(ha.find(x => x.action === 'loss_sale').after.costUsd != null);
    r = await nf(post({ action: 'history', entity: 'sale' }, 't-s1'));
    const hs = body(r).items;
    assert.equal(hs.length, 3);
    assert.ok(!JSON.stringify(hs).match(/"(costUsd|cost_usd|profitUsd|lossUsd)"/), 'sotuvchiga tannarx/foyda/zarar yuborilmaydi');
    r = await nf(post({ action: 'history', entity: 'sale' }, 't-s2'));
    assert.equal(body(r).items.length, 0, 'boshqa sotuvchining tarixi ko\'rinmaydi');
    // noto'g'ri so'rov
    r = await nf(post({ action: 'read', ids: ['x'] }, 't-admin'));
    assert.equal(r.statusCode, 400);
  });
}

// ── 5. Direct Sale: ruxsat va ta'minotchi narxi SERVERDAN (brauzer qiymati e'tiborsiz) ──
async function testDirectSale() {
  await withWorld({}, async ({ pg, client }) => {
    const ck = loadFunction('sale-checkout-atomic', client);
    const item = { pid: 202, qty: 2, sellUsd: 84, costUsd: 1, directSupply: true, suppId: 999 };
    let r = await checkout(ck, 'ds-no', [item], 't-s1');
    assert.equal(r.statusCode, 403, r.body); assert.match(body(r).error, /Direct Sale/);
    r = await checkout(ck, 'ds-ok', [item], 't-ds');
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(await num(pg, `select debt v from supplier_balances where filial='f729' and supplier_local_id=$1`, [SID]), 140, "qarz — mahsulotdagi ta'minotchiga, server narxi (2×70$)");
    assert.equal(await num(pg, `select count(*)::int v from supplier_balances where supplier_local_id=999`), 0, "brauzer yuborgan ta'minotchi e'tiborsiz");
    assert.equal(await left(pg, 101), 20, 'oddiy ombor qoldig\'iga tegilmadi');
    const s = (await rows(pg, `select items, profit_usd, cost_usd from sales where local_id='sds-ok'`))[0];
    assert.equal(+s.cost_usd, 140); assert.equal(+s.profit_usd, 28);
  });
}

// ── 6. Diller: optom narxidan ko'pi bilan 10% chegirma (server), chegirma auditda; reviziya — qoldiq o'zgarmaydi ──
async function testDealer() {
  await withWorld({}, async ({ pg, client }) => {
    await pg.exec(`insert into auth.users values ('00000000-0000-4000-8000-0000000000d1')`);
    await pg.query(`insert into dealers (id, auth_user_id, login, name, debt_usd, filial) overriding system value values (31, '00000000-0000-4000-8000-0000000000d1', 'd1', 'Diller Bir', 0, 'f729')`);
    await pg.query(`insert into catalog_products (id, filial, sku, name, optim_price) values (101, 'f729', 'A-101', 'Drel', 20)`);
    await pg.query(`insert into dealer_stock (dealer_id, pid, sku, name, qty, avg_cost_usd) values (31, 101, 'A-101', 'Drel', 10, 10)`);
    await pg.query(`insert into dealer_stock_moves (dealer_id, type, pid, sku, name, qty) values (31,'send',101,'A-101','Drel',12), (31,'return',101,'A-101','Drel',2)`);
    await pg.query(`select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000d1', false)`);
    const sale = (price) => pg.query(`select record_dealer_sale(101, 1, $1::numeric, 'A-101', 'Drel', 0, null)`, [price]);
    await assert.rejects(sale(17.99), /10%/, '20$ optomdan 10% dan ortiq chegirma — rad');
    assert.equal(await num(pg, `select qty v from dealer_stock where dealer_id=31`), 10);
    await sale(18);   // aynan 10%
    await sale(25);   // yuqori narx — chegirma emas
    assert.equal(await num(pg, `select debt_usd v from dealers where id=31`), 40, 'qarz optom narxda (2×20$)');
    assert.equal(await num(pg, `select count(*)::int v from fw_audit_events where action='price_discount'`), 1);
    assert.equal(await num(pg, `select count(*)::int v from fw_notifications where kind='dealer_discount'`), 1);
    await pg.query(`select set_config('request.jwt.claim.sub','', false)`);
    // reviziya — server tizim qoldig'ini o'zi hisoblaydi (8), kamomad avtomatik sotuvga aylanmaydi
    const nf = loadFunction('notifications', client);
    let r = await nf(post({ action: 'rev_summary' }, 't-d1'));
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(body(r).items.map(x => [x.pid, x.received, x.sold, x.returned, x.system]), [[101, 12, 2, 2, 8]]);
    r = await nf(post({ action: 'rev_submit', lines: [{ pid: 101, counted: 7 }], reason: '1 dona shikastlangan', idemKey: 'rev-key-0001' }, 't-d1'));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(body(r).result.shortageQty, 1);
    assert.equal(await num(pg, `select qty v from dealer_stock where dealer_id=31`), 8, 'qoldiq avtomatik o\'zgarmadi');
    assert.equal(await num(pg, `select count(*)::int v from dealer_sales`), 2, 'kamomad savdoga aylanmadi');
    r = await nf(post({ action: 'rev_submit', lines: [{ pid: 101, counted: 7 }], reason: '1 dona shikastlangan', idemKey: 'rev-key-0001' }, 't-d1'));
    assert.equal(body(r).replay, true);
    assert.equal(await num(pg, `select count(*)::int v from fw_audit_events where action='revision'`), 1);
    assert.equal(await num(pg, `select count(*)::int v from fw_notifications where kind='dealer_revision'`), 1);
    // diller — o'z bildirishnomalari (admin xabarlari ko'rinmaydi)
    await pg.query(`insert into fw_notifications (filial, audience, audience_id, kind, title) values ('f729','dealer',31,'dealer_pay','Toʻlov qabul qilindi'), ('f729','dealer',32,'dealer_pay','Boshqa diller')`);
    r = await nf(post({ action: 'dealer_list', scope: 'active' }, 't-d1'));
    assert.deepEqual(body(r).items.map(x => x.title), ['Toʻlov qabul qilindi']);
    // xodim tokeni bilan diller amali — rad
    r = await nf(post({ action: 'rev_summary' }, 't-s1'));
    assert.equal(r.statusCode, 403);
  });
}

// ── 7. 31-migratsiyasiz: eski yo'l ishlaydi (savdo, tahrir), bildirishnoma — 409 ──
async function testWithout31() {
  await withWorld({ no31: true }, async ({ pg, client }) => {
    const ck = loadFunction('sale-checkout-atomic', client), ops = loadFunction('sale-ops', client), nf = loadFunction('notifications', client);
    let r = await checkout(ck, 'old-1', [{ pid: 101, qty: 1, sellUsd: 5, costUsd: 10 }], 't-s1');
    assert.equal(r.statusCode, 200, r.body);
    r = await ops(post({ filial: 'f729', action: 'edit', key: 'old-ed-01', saleLocalId: 'sold-1', mode: 'price', payload: { prices: [6] } }, 't-s2'));
    assert.equal(r.statusCode, 200, r.body);
    r = await nf(post({ action: 'list' }, 't-admin'));
    assert.equal(r.statusCode, 409); assert.equal(body(r).migration31Pending, true);
  });
}

// ── 8. Telegram e'loni: server ma'lumoti, takrorsiz, xatoda qayta urinish (SOXTA Telegram — tarmoqsiz) ──
async function testAnnounce() {
  await withWorld({}, async ({ pg, client }) => {
    const realFetch = global.fetch;
    const sent = []; let failChat = '@kanal2';
    global.fetch = async (url, opts) => {
      const m = /\/bot[^/]+\/(\w+)$/.exec(String(url)); const b = JSON.parse(opts.body || '{}');
      if (m[1] === 'sendPhoto' || m[1] === 'sendMessage') {
        if (b.chat_id === failChat) return { json: async () => ({ ok: false, description: 'Forbidden: bot is not a member' }) };
        sent.push({ method: m[1], chat: b.chat_id, caption: b.caption || b.text, kb: b.reply_markup });
        return { json: async () => ({ ok: true, result: { message_id: sent.length } }) };
      }
      return { json: async () => ({ ok: false }) };
    };
    try {
      const h = loadFunction('telegram-announce', client);
      let r = await h(post({ action: 'announce', pid: 101, filial: 'f729' }, 't-admin'));
      assert.equal(body(r).code, 'no_bot', 'token yo\'q — yuborilmaydi');
      await pg.query(`update app_data set data = jsonb_set(data, '{settings}', (data->'settings') || $1::jsonb) where id='main'`,
        [JSON.stringify({ tgBotToken: '123456789:FAKE_test_token_not_real_xxxx', tgAnnounceChats: ['@kanal1', '@kanal2', 'yomon chat'], socialInstagram: 'https://instagram.com/powerful', tgAnnounceLink: 'https://powerful.uz/p/{id}' })]);
      r = await h(post({ action: 'announce', pid: 101, filial: 'f729', name: 'SOXTA NOM', price: 1 }, 't-admin'));
      assert.equal(r.statusCode, 200, r.body);
      let d = body(r);
      assert.equal(d.sent, 1); assert.equal(d.ok, false);
      assert.deepEqual(sent.map(x => [x.method, x.chat]), [['sendPhoto', '@kanal1']], "noto'g'ri formatdagi chat tashlab yuborildi");
      assert.match(sent[0].caption, /Drel/); assert.doesNotMatch(sent[0].caption, /SOXTA/, "nom serverdan");
      assert.match(sent[0].caption, /180 000 so‘m/, "narx serverda: FIFO 10$ × 1.5 = 15$ × 12 000");
      assert.match(sent[0].caption, /powerful\.uz\/p\/101/);
      assert.ok(JSON.stringify(sent[0].kb).includes('instagram.com/powerful'));
      assert.doesNotMatch(r.body, /FAKE_test_token/, 'token javobda yo\'q');
      assert.equal(await num(pg, `select count(*)::int v from fw_notifications where kind='announce_error'`), 1, 'xato — adminga');
      // qayta urinish: muvaffaqiyatli chatga TAKROR yuborilmaydi, xatolisi qayta urinadi
      failChat = null;
      r = await h(post({ action: 'announce', pid: 101, filial: 'f729' }, 't-admin'));
      d = body(r);
      assert.equal(d.ok, true); assert.equal(d.sent, 1);
      assert.deepEqual(sent.map(x => x.chat), ['@kanal1', '@kanal2']);
      assert.equal(d.results.find(x => x.chat === '@kanal1').skipped, 'already_sent');
      r = await h(post({ action: 'announce', pid: 101, filial: 'f729' }, 't-admin'));
      assert.equal(body(r).sent, 0); assert.equal(sent.length, 2, 'uchinchi marta — hech narsa yuborilmadi');
      // huquqsiz xodim
      r = await h(post({ action: 'announce', pid: 101 }, 't-s1'));
      assert.equal(r.statusCode, 403);
    } finally { global.fetch = realFetch; }
  });
}

// ── 9. Sozlamalar: ijtimoiy tarmoq / e'lon havolasi faqat https, chatlar formati (server) ──
async function testSettingsGuard() {
  delete require.cache[require.resolve('../netlify/functions/_lib/appDataGuard')];
  const g = require('../netlify/functions/_lib/appDataGuard');
  const fn = g.normalizeIncomingSettings || (g._test && g._test.normalizeIncomingSettings);
  assert.equal(typeof fn, 'function', 'normalizeIncomingSettings eksport qilingan');
  const out = fn({ socialYoutube: 'https://youtube.com/@old' }, { socialInstagram: 'javascript:alert(1)', socialYoutube: 'http://x.uz', socialFacebook: 'https://facebook.com/f',
    tgAnnounceChats: ['@ok_kanal', 'bad chat', '-1001234567890', '@ok_kanal'], tgAnnounceLink: 'https://s.uz/{id}', tgAnnounceOn: 1 });
  assert.equal(out.socialInstagram, undefined); assert.equal(out.socialYoutube, 'https://youtube.com/@old'); assert.equal(out.socialFacebook, 'https://facebook.com/f');
  assert.deepEqual(out.tgAnnounceChats, ['@ok_kanal', '-1001234567890']); assert.equal(out.tgAnnounceOn, true);
}

module.exports = {
  name: "P28 — v24 (31-migratsiya): tahrirlash muddati, audit tarixi, bildirishnomalar, zarar tasdig'i, diller −10%, Direct Sale, reviziya, e'lon",
  cases: [
    { name: "Zararli savdo: sotuvchi tasdig'isiz rad (hech narsa yozilmaydi); tasdiq bilan — audit + admin; takrorsiz", run: testLossSale },
    { name: 'Tahrirlash muddati (7/30 kun, server vaqti), egalik, oldingi→yangi qiymat auditda, bildirishnomalar, replay', run: testEditWindow },
    { name: "O'chirish: iz qoladi (voided), audit + bildirishnoma; audit/bildirishnoma o'zgarmas; anon/authenticated huquqsiz", run: testVoidAndAuditImmutable },
    { name: "Bildirishnomalar: auditoriya, 7 kun/arxiv, o'qildi; savdo tarixi — sotuvchiga tannarxsiz", run: testNotificationsFn },
    { name: "Direct Sale: ruxsat kerak; ta'minotchi va narx serverdagi mahsulotdan; oddiy omborga tegilmaydi", run: testDirectSale },
    { name: "Diller: optomdan ko'pi bilan 10% chegirma (server), audit; reviziya — qoldiq/savdo o'zgarmaydi, takrorsiz", run: testDealer },
    { name: "31-migratsiyasiz: eski yo'l ishlaydi, bildirishnoma — 409", run: testWithout31 },
    { name: "Telegram e'loni: serverdagi nom/narx/rasm, takrorsiz, xatoda qayta urinish, token javobda yo'q (soxta Telegram)", run: testAnnounce },
    { name: "Sozlamalar: ijtimoiy tarmoq/e'lon havolasi faqat https, chatlar formati (server)", run: testSettingsGuard },
  ],
};
