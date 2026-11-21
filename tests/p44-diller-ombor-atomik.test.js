// P44 — v24.5 (v23.10.2 P29 dan; 35-migratsiya): DILLER OMBORI VA DILLER SAVDOSI — serverda, bitta tranzaksiyada.
//  • Server (haqiqiy PostgreSQL — PGlite: schema.sql 0..34 + 35 IKKI marta; haqiqiy `dealer-ops` va eski endpoint'lar):
//    jo'natish / buyurtma tasdig'i / qaytarish / savdo — huquqlar (403), boshqa filial, takror kalit (replay),
//    35 bo'lsa eski «mutlaq qiymat» yo'llari 409 (stock-debt-ops'dagi diller jo'natmasi/qaytishi ham),
//    35 bo'lmasa — dealer-ops 409 migrationPending va eski yo'llar ishlayveradi.
//  • v24.5 bilan moslik: ledger_ops amal turlari 27–34 dagilarning hammasini saqlaydi; diller portalidagi −10% chegarasi
//    (31) o'zgarmagan; reviziya (32) — jo'natmadan keyin eskirgan reviziya rad etiladi, yangisi ishlaydi; admin
//    savdosi dealer_sales.source = null; 35 ma'lumotli bazada qayta qo'llanadi, 33 esa qayta qo'llanmaydi (CHECK).
//  • Admin brauzeri (haqiqiy js/main.js): jo'natish, savdo, qaytarish — so'rovda yakuniy qoldiq/qarz YO'Q; natija server
//    javobidan; server rad etsa — mahalliy holat o'zgarmaydi; 35 yo'q (409) — avvalgi yo'l; keyin 35 paydo bo'lsa —
//    sahifani yangilamasdan keyingi amal yangi yo'ldan.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');
const { loadApp, ROOT } = require('./helpers/load-app');

const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG33 = fs.readFileSync(path.join(ROOT, 'supabase-migration-33-taminotchi-zaklad.sql'), 'utf8');
const MIG35 = fs.readFileSync(path.join(ROOT, 'supabase-migration-35-diller-ombor-atomik.sql'), 'utf8');
const PG_TABLES = ['app_data', 'app_data_branches', 'dealers', 'dealer_stock', 'dealer_stock_moves', 'dealer_sales', 'dealer_orders', 'batches', 'ledger_ops',
  'fw_audit_events', 'fw_notifications', 'fw_dealer_revisions'];
const PERMS = { 'r-man': ['dillerlar.manage'], 'r-ord': ['dillerlar.orders'], 'r-sel': ['savdo.create'] };
const USERS = { 't-admin': { id: 'u-admin' }, 't-man': { id: 'u-man' }, 't-ord': { id: 'u-ord' }, 't-sel': { id: 'u-sel' }, 't-f7': { id: 'u-f7' } };
const body = (r) => JSON.parse(r.body);
const json = (route, status, obj) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });

async function world({ no35 = false } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  const cut = SCHEMA.indexOf('\n-- ────────────────────────────────────────────────────────────────────\n-- 19. 35-migratsiya');
  assert.ok(cut > 0, "schema.sql: 35-migratsiya bo'limi bor");
  await pg.exec(SCHEMA.slice(0, cut));                                // 0..34
  if (!no35) { await pg.exec(MIG35); await pg.exec(MIG35); }          // ikki marta — idempotent
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { pointUsdValue: 2, pointRoundStep: 1 }, products: [{ id: 101, sku: 'A', name: 'Drel', pointPct: 5 }] })]);
  await pg.query(`select stock_debt_op('baza', 'seed-1', 'batches_create', $1::jsonb)`, [JSON.stringify({ reason: 'opening', batches: [{ localId: 'a1', pid: 101, qty: 10, costUsd: 10, meta: {} }] })]);
  await pg.exec(`insert into dealers (id, login, name, filial) overriding system value values (1, 'd1', 'Diller', 'baza'), (2, 'd2', 'Filial diller', 'f729')`);
  await pg.exec(`insert into dealer_orders (id, dealer_id, items, status) overriding system value values (50, 1, '[{"pid":101,"sku":"A","name":"Drel","qty":2}]', 'pending'), (51, 1, '[{"pid":101,"qty":1}]', 'pending')`);
  const memTables = {
    staff: [
      { id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
      { id: 7, auth_user_id: 'u-man', role: 'sotuvchi', active: true, filial: 'baza', name: 'Menejer', login: 'man' },
      { id: 8, auth_user_id: 'u-ord', role: 'sotuvchi', active: true, filial: 'baza', name: 'Buyurtmachi', login: 'ord' },
      { id: 9, auth_user_id: 'u-sel', role: 'sotuvchi', active: true, filial: 'baza', name: 'Sotuvchi', login: 'sel' },
      { id: 10, auth_user_id: 'u-f7', role: 'sotuvchi', active: true, filial: 'f729', name: 'Filial', login: 'f7' },
    ],
    staff_roles: [{ staff_id: 7, role_id: 'r-man' }, { staff_id: 8, role_id: 'r-ord' }, { staff_id: 9, role_id: 'r-sel' }, { staff_id: 10, role_id: 'r-man' }],
    role_permissions: Object.entries(PERMS).flatMap(([rid, keys]) => keys.map(k => ({ role_id: rid, permission_id: k, permissions: { key: k } }))),
    staff_audit_log: [], idempotency_keys: [], dealer_audit_log: [], security_events: [],
  };
  require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
  return { pg, client: makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: USERS }) };
}
const v = async (pg, sql, p) => ((await pg.query(sql, p)).rows[0] || {}).v;

async function testServer() {
  const { pg, client } = await world();
  try {
    const h = loadFunction('dealer-ops', client);
    const ship = (tok, extra) => h(post({ kind: 'ship', key: 'k-' + Math.random().toString(36).slice(2, 10), dealerId: 1, items: [{ pid: 101, qty: 2, sku: 'A', name: 'Drel' }], ...extra }, tok));
    let r = await ship('t-sel'); assert.equal(r.statusCode, 403, 'savdo.create — rad');
    r = await ship('t-ord'); assert.equal(r.statusCode, 403, "dillerlar.orders — buyurtmasiz jo'natish rad");
    r = await ship('t-ord', { orderId: 50 }); assert.equal(r.statusCode, 200, r.body);
    assert.equal(body(r).dealer.totalShipped, 20); assert.equal(body(r).items[0].dealerQty, 2);
    assert.equal(await v(pg, `select status v from dealer_orders where id=50`), 'approved');
    assert.equal(+(await v(pg, `select coalesce(sum(qty - sold),0) v from batches where filial='baza' and pid=101 and status='active'`)), 8, 'firma omboridan FIFO bilan chiqdi');
    r = await ship('t-man', { orderId: 50 }); assert.equal(r.statusCode, 400); assert.match(body(r).error, /allaqachon/);
    // takror kalit — replay
    const k = { kind: 'ship', key: 'k-fixed-001', dealerId: 1, items: [{ pid: 101, qty: 3 }] };
    r = await h(post(k, 't-man')); assert.equal(r.statusCode, 200); assert.equal(body(r).replay, false);
    r = await h(post(k, 't-man')); assert.equal(r.statusCode, 200); assert.equal(body(r).replay, true);
    assert.equal(await v(pg, `select qty::int v from dealer_stock where dealer_id=1 and pid=101`), 5);
    // firma omborida yetmasa — hech narsa o'zgarmaydi (diller ombori ham, total_shipped ham)
    r = await h(post({ kind: 'ship', key: 'k-big-0001', dealerId: 1, items: [{ pid: 101, qty: 999 }] }, 't-man')); assert.equal(r.statusCode, 400, r.body);
    assert.equal(await v(pg, `select qty::int v from dealer_stock where dealer_id=1 and pid=101`), 5);
    assert.equal(+(await v(pg, `select total_shipped_usd v from dealers where id=1`)), 50);
    // boshqa filial xodimi Baza dilleriga — rad (filial serverda aniqlanadi)
    r = await h(post({ kind: 'ship', key: 'k-f7-0001', dealerId: 1, items: [{ pid: 101, qty: 1 }] }, 't-f7')); assert.equal(r.statusCode, 400); assert.match(body(r).error, /diller topilmadi/);
    // yaroqsiz so'rovlar
    for (const bad of [{ kind: 'x' }, { kind: 'ship', key: 'k-x-0001', dealerId: 1, items: [] }, { kind: 'sale', key: 'k-x-0002', dealerId: 1, pct: 101, items: [{ pid: 101, qty: 1, priceUsd: 5 }] },
      { kind: 'return', key: 'k-x-0003', dealerId: 1, items: [{ pid: 101, qty: 1, condition: 'Yangi' }] }, { kind: 'ship', key: 'k-x-0004', dealerId: 1, items: [{ pid: 101, qty: 1 }, { pid: 101, qty: 1 }] }]) {
      r = await h(post(bad, 't-man')); assert.equal(r.statusCode, 400, JSON.stringify(bad));
    }
    // savdo va qaytarish
    r = await h(post({ kind: 'sale', key: 'k-sale-0001', dealerId: 1, pct: 10, items: [{ pid: 101, qty: 2, priceUsd: 20 }] }, 't-man'));
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).owedUsd, 36); assert.equal(body(r).dealer.debt, 36); assert.equal(body(r).points, 1);
    assert.equal(await v(pg, `select count(*)::int v from dealer_sales where dealer_id=1 and source is null`), 1, 'admin savdosi — oddiy savdo (source = null, 32)');
    r = await h(post({ kind: 'sale', key: 'k-sale-0002', dealerId: 1, pct: 0, items: [{ pid: 101, qty: 99, priceUsd: 20 }] }, 't-man'));
    assert.equal(r.statusCode, 400); assert.match(body(r).error, /yetarli qoldiq/);
    r = await h(post({ kind: 'return', key: 'k-ret-0001', dealerId: 1, items: [{ pid: 101, qty: 1, condition: 'Yangi', localId: 'rb-1', bno: '02' }] }, 't-man'));
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).items[0].dealerQty, 2);
    assert.ok(Array.isArray(body(r).authority.batches) && body(r).authority.batches.some(b => b.localId === 'rb-1' && +b.qty === 1), 'javobda yangi partiya (bazadan)');
    assert.deepEqual((await pg.query(`select kind from ledger_ops where op_key like 'd%' and kind like 'dealer_%' order by id`)).rows.map(x => x.kind),
      ['dealer_ship', 'dealer_ship', 'dealer_sale', 'dealer_return'], 'diller amallari ledger_ops da (yangi turlar)');
    // eski «mutlaq qiymat» yo'llari — 409 (35 bor)
    const legacy = [
      ['dealer-stock-upsert', { dealerId: 1, pid: 101, qty: 999, avgCostUsd: 1 }],
      ['dealer-stock-move-add', { dealerId: 1, type: 'send', pid: 101, qty: 1, costUsd: 1 }],
      ['dealer-sale-add', { dealerId: 1, saleDate: '2026-10-07', items: [{ pid: 101, qty: 1, sellUsd: 1 }] }],
      ['dealer-update', { id: 1, fields: { debt: 0 } }],
      ['dealer-order-status', { orderId: 51, status: 'approved' }],
      ['stock-debt-ops', { kind: 'stock_out', key: 'k-leg-0001', payload: { reason: 'dealer', dealerId: '1', items: [{ pid: 101, qty: 1 }] } }],
      ['stock-debt-ops', { kind: 'batches_create', key: 'k-leg-0002', payload: { reason: 'dealer_return', batches: [{ localId: 'x1', pid: 101, qty: 1, costUsd: 10 }] } }],
    ];
    for (const [fn, b] of legacy) {
      const r2 = await loadFunction(fn, client)(post(b, 't-admin'));
      assert.equal(r2.statusCode, 409, fn + ': ' + r2.body); assert.equal(body(r2).legacyDealer, true);
    }
    assert.equal(await v(pg, `select qty::int v from dealer_stock where dealer_id=1 and pid=101`), 2, "eski yo'l qoldiqni o'zgartirmadi");
    assert.equal(+(await v(pg, `select debt_usd v from dealers where id=1`)), 36, "eski yo'l qarzni o'zgartirmadi");
    assert.equal(+(await v(pg, `select coalesce(sum(qty - sold),0) v from batches where filial='baza' and pid=101 and status='active'`)), 6, "eski yo'l firma omborini o'zgartirmadi");
    // balansdan tashqari maydon, rad etish va oddiy kirim — ishlaydi
    assert.equal((await loadFunction('dealer-update', client)(post({ id: 1, fields: { phone: '+998 90' } }, 't-admin'))).statusCode, 200);
    assert.equal((await loadFunction('dealer-order-status', client)(post({ orderId: 51, status: 'rejected' }, 't-admin'))).statusCode, 200);
    r = await loadFunction('stock-debt-ops', client)(post({ kind: 'batches_create', key: 'k-kirim-001', payload: { reason: 'opening', batches: [{ localId: 'o1', pid: 101, qty: 1, costUsd: 10 }] } }, 't-admin'));
    assert.equal(r.statusCode, 200, "boshqa kirim turlari yopilmaydi: " + r.body);
    // 35 — ma'lumotli bazada qayta qo'llanadi (diller amallari CHECK'dan o'tadi)
    await pg.exec(MIG35);
    assert.equal(await v(pg, `select count(*)::int v from ledger_ops where kind like 'dealer_%'`), 4);
  } finally { unloadFunctions(); await pg.close(); }
}

// v24.5 bilan moslik: ledger_ops turlari (27–34), diller portali −10% (31), reviziya (32), 33 ni qayta qo'llash
async function testV245Compat() {
  const { pg, client } = await world();
  try {
    const def = await v(pg, `select pg_get_constraintdef(oid) v from pg_constraint where conname = 'ledger_ops_kind_chk'`);
    for (const kd of ['sale', 'sale_return', 'sale_void', 'sale_edit', 'cust_set', 'supp_set', 'batches_create', 'batch_edit', 'batch_delete', 'batch_arrive',
      'revision', 'stock_out', 'firma_supp_pay', 'writeoff', 'writeoff_cancel', 'b2b_ship', 'b2b_receive', 'b2b_ack', 'b2b_restock', 'supp_advance', 'supp_advance_apply',
      'dealer_ship', 'dealer_return', 'dealer_sale']) assert.ok(def.includes(`'${kd}'`), 'ledger_ops turi saqlangan: ' + kd);
    // Faqat server: brauzer rollari chaqira olmaydi
    const g = (await pg.query(`select has_function_privilege('authenticated','public.dealer_ship_atomic(text,text,bigint,jsonb,bigint,bigint,text)','execute') a,
      has_function_privilege('anon','public.dealer_sale_record_atomic(text,text,bigint,jsonb,numeric,bigint,text)','execute') b,
      has_function_privilege('authenticated','public.dealer_atomic_available()','execute') c,
      has_function_privilege('service_role','public.dealer_return_atomic(text,text,bigint,jsonb,bigint,text)','execute') s,
      (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')) np`)).rows[0];
    assert.deepEqual(g, { a: false, b: false, c: false, s: true, np: 0 }, "faqat service_role; barcha public funksiyalarda search_path");

    const h = loadFunction('dealer-ops', client);
    let r = await h(post({ kind: 'ship', key: 'k-c-ship-1', dealerId: 1, items: [{ pid: 101, qty: 4, sku: 'A', name: 'Drel' }] }, 't-man'));
    assert.equal(r.statusCode, 200, r.body);

    // 31: diller portalidagi savdo (record_dealer_sale) — optomdan ko'pi bilan 10% chegirma — o'zgarmagan
    const U = '44444444-4444-4444-4444-444444444444';
    await pg.exec(`insert into auth.users values ('${U}'); update dealers set auth_user_id = '${U}' where id = 1;
      insert into catalog_products (id, filial, name, qty, optim_price, point_pct) values (101, 'baza', 'Drel', 5, 20, 0);
      grant usage on schema public to authenticated;`);
    await pg.exec(`select set_config('request.jwt.claim.sub', '${U}', false); set role authenticated;`);
    await pg.query(`select public.record_dealer_sale(101, 1, 17.9, 'A', 'Drel', 0, null::numeric)`).then(() => assert.fail('rad etilmadi'), e => assert.match(e.message, /10%/, e.message));
    await pg.query(`select public.record_dealer_sale(101, 1, 18.5, 'A', 'Drel', 0, null::numeric)`);
    await pg.exec('reset role');
    assert.equal(+(await v(pg, `select debt_usd v from dealers where id=1`)), 20, 'diller savdosi qarzi optom narxda (31)');
    assert.equal(await v(pg, `select qty::int v from dealer_stock where dealer_id=1 and pid=101`), 3);

    // 32: reviziya — qoldiq 3 deb sanaldi, 2 topildi (kamomad 1). Keyin jo'natma bo'lsa — eskirgan, rad
    const rev = async (key, sys, diff) => (await pg.query(`insert into fw_dealer_revisions (filial, dealer_id, dealer_name, lines, op_key) values ('baza', 1, 'Diller', $1::jsonb, $2) returning id`,
      [JSON.stringify([{ pid: 101, sku: 'A', name: 'Drel', system: sys, diff }]), key])).rows[0].id;
    const rid1 = await rev('rv-1', 3, -1);
    r = await h(post({ kind: 'ship', key: 'k-c-ship-2', dealerId: 1, items: [{ pid: 101, qty: 1 }] }, 't-man')); assert.equal(r.statusCode, 200, r.body);
    await assert.rejects(pg.query(`select public.dealer_revision_decide($1, true, 1, 'Admin', 'admin', null, null)`, [rid1]), /REV_STALE/, "jo'natmadan keyin eski reviziya — rad");
    assert.equal(await v(pg, `select status v from fw_dealer_revisions where id=$1`, [rid1]), 'pending');
    const rid2 = await rev('rv-2', 4, -1);
    const res = (await pg.query(`select public.dealer_revision_decide($1, true, 1, 'Admin', 'admin', null, null) v`, [rid2])).rows[0].v;
    assert.equal(res.status, 'approved');
    assert.equal(await v(pg, `select qty::int v from dealer_stock where dealer_id=1 and pid=101`), 3);
    assert.equal(+(await v(pg, `select debt_usd v from dealers where id=1`)), 40, 'reviziya kamomadi — optom narxda sotuv (32)');
    // reviziyadan keyin admin savdosi va qaytarish ham diller qatori orqali ishlaydi
    r = await h(post({ kind: 'sale', key: 'k-c-sale-1', dealerId: 1, pct: 0, items: [{ pid: 101, qty: 1, priceUsd: 25 }] }, 't-man'));
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).dealer.debt, 65);
    assert.deepEqual((await pg.query(`select coalesce(source,'-') s, qty::int q from dealer_sales where dealer_id=1 order by id`)).rows.map(x => x.s + ':' + x.q),
      ['-:1', 'revision_short:1', '-:1'], 'dealer_sales.source: portal / reviziya / admin');
    r = await h(post({ kind: 'return', key: 'k-c-ret-1', dealerId: 1, items: [{ pid: 101, qty: 1, condition: 'Yaroqsiz', reason: 'singan' }] }, 't-man'));
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).items[0].sellable, false);
    assert.equal(await v(pg, `select condition v from dealer_stock_moves where dealer_id=1 and type='return' order by id desc limit 1`), 'Yaroqsiz');

    // 33 ni diller amallari bor bazada qayta qo'llash — CHECK xatosi bilan to'xtaydi, hech narsa o'zgarmaydi
    let err = null;
    try { await pg.exec('begin;\n' + MIG33 + '\ncommit;'); } catch (e) { err = e; try { await pg.exec('rollback'); } catch (_) {} }
    assert.ok(err && /ledger_ops_kind_chk/.test(err.message), "33 qayta qo'llanmadi: " + (err && err.message));
    assert.ok((await v(pg, `select pg_get_constraintdef(oid) v from pg_constraint where conname = 'ledger_ops_kind_chk'`)).includes("'dealer_ship'"), "turlar o'zgarmadi");
  } finally { unloadFunctions(); await pg.close(); }
}

async function testServerWithout35() {
  const { pg, client } = await world({ no35: true });
  try {
    assert.equal(await v(pg, `select count(*)::int v from pg_proc where proname = 'dealer_atomic_available'`), 0);
    let r = await loadFunction('dealer-ops', client)(post({ kind: 'ship', key: 'k-n35-0001', dealerId: 1, items: [{ pid: 101, qty: 1 }] }, 't-man'));
    assert.equal(r.statusCode, 409); assert.equal(body(r).migrationPending, true);
    r = await loadFunction('stock-debt-ops', client)(post({ kind: 'stock_out', key: 'k-n35-0002', payload: { reason: 'dealer', dealerId: '1', items: [{ pid: 101, qty: 1 }] } }, 't-man'));
    assert.equal(r.statusCode, 200, "35 yo'q — eski yo'l (firma omboridan chiqarish) ishlaydi: " + r.body);
    r = await loadFunction('dealer-stock-upsert', client)(post({ dealerId: 1, pid: 101, qty: 3, avgCostUsd: 10 }, 't-man'));
    assert.equal(r.statusCode, 200, "35 yo'q — eski yo'l ishlaydi: " + r.body);
    r = await loadFunction('dealer-update', client)(post({ id: 1, fields: { totalShipped: 30 } }, 't-man'));
    assert.equal(r.statusCode, 200, r.body);
    r = await loadFunction('dealer-order-status', client)(post({ orderId: 51, status: 'approved' }, 't-admin'));
    assert.equal(r.statusCode, 200, r.body);
  } finally { unloadFunctions(); await pg.close(); }
}

async function testAdminBrowser() {
  const seen = []; let mode = 'ok';
  const { browser, page, consoleErrors } = await loadApp({ mockRoutes: [
    { url: '**/.netlify/functions/dealer-ops', handler: async (route) => {
      const b = JSON.parse(route.request().postData()); seen.push(b);
      if (mode === 'pending') return json(route, 409, { error: "35 kerak", migrationPending: true });
      if (mode === 'fail') return json(route, 400, { error: "LEDGER: dillerda yetarli qoldiq yo'q" });
      if (b.kind === 'ship') return json(route, 200, { ok: true, replay: false, totalCostUsd: 30, items: [{ pid: 101, qty: 3, dealerQty: 7, dealerAvgCostUsd: 9.5 }], dealer: { debt: 0, totalShipped: 130, totalSold: 0, totalPaid: 0, points: 0 } });
      if (b.kind === 'sale') return json(route, 200, { ok: true, saleTotalUsd: 40, owedUsd: 36, profitUsd: 17, points: 1, items: [{ pid: 101, qty: 2, priceUsd: 20, costUsd: 9.5, dealerQty: 5 }], dealer: { debt: 36, totalShipped: 130, totalSold: 36, totalPaid: 0, points: 1 } });
      if (b.kind === 'return') return json(route, 200, { ok: true, totalCostUsd: 9.5, items: [{ pid: 101, qty: 1, costUsd: 9.5, sellable: true, dealerQty: 4, dealerAvgCostUsd: 9.5 }], dealer: { debt: 36, totalShipped: 130, totalSold: 36, totalPaid: 0, points: 1 },
        authority: { filial: 'baza', customers: {}, suppliers: {}, batches: [{ filial: 'baza', localId: String(b.items[0].localId), qty: 1, sold: 0, status: 'active', costUsd: 9.5 }] } });
    } },
    { url: '**/.netlify/functions/dealer-stock-upsert', handler: (route) => { seen.push({ legacy: 'upsert' }); json(route, 200, { ok: true }); } },
    { url: '**/.netlify/functions/dealer-stock-move-add', handler: (route) => json(route, 200, { ok: true }) },
    { url: '**/.netlify/functions/dealer-update', handler: (route) => { seen.push({ legacy: 'update' }); json(route, 200, { dealer: {} }); } },
    { url: '**/.netlify/functions/dealer-sale-add', handler: (route) => { seen.push({ legacy: 'sale-add' }); json(route, 200, { ok: true }); } },
    { url: '**/.netlify/functions/dealer-order-status', handler: (route) => { seen.push({ legacy: 'order-status' }); json(route, 200, { order: {} }); } },
  ] });
  try {
    await page.exposeFunction('__mode', (m) => { mode = m; });
    const r = await page.evaluate(async () => {
      document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div><div id="bs-ov" hidden></div>');
      save = () => {}; pgDillerlar = () => {}; dillerRenderTab = () => {}; closeModal = () => {}; fwLedgerRemote = () => false;
      window.confirm = () => true; _cloudEnabled = true;
      const reset = () => Object.assign(S, { branch: 'baza', sales: [], dealerTxns: [],
        products: [{ id: 101, sku: 'A', name: 'Drel', pointPct: 5 }],
        batches: [{ id: 'a1', pid: 101, qty: 10, sold: 0, costUsd: 10, status: 'active', date: '2026-09-01' }],
        dealers: [{ id: 1, name: 'Diller', debt: 0, totalShipped: 100, totalSold: 0, totalPaid: 0, points: 0, commissionPct: 10 }],
        dealerStock: [{ id: 1, dealerId: 1, pid: 101, qty: 4, avgCostUsd: 9 }],
        dealerOrders: [{ id: 50, dealer_id: 1, status: 'pending', items: [{ pid: 101, sku: 'A', name: 'Drel', qty: 3 }] }] });
      const out = {};
      // 1) Jo'natish — natija serverdan
      reset(); S.dillerSendId = 1; S.dillerCart = [{ id: 1, pid: 101, qty: 2 }, { id: 2, pid: 101, qty: 1 }];
      await sendToDealer();
      out.ship = { qty: S.dealerStock[0].qty, avg: S.dealerStock[0].avgCostUsd, shipped: S.dealers[0].totalShipped, txn: S.dealerTxns[0]?.totalUsd, cart: S.dillerCart.length, batchSold: S.batches[0].sold };
      // 2) Server rad etdi — mahalliy holat o'zgarmaydi
      await window.__mode('fail'); reset(); S.dillerSendId = 1; S.dillerCart = [{ id: 1, pid: 101, qty: 2 }];
      await sendToDealer();
      out.fail = { qty: S.dealerStock[0].qty, shipped: S.dealers[0].totalShipped, txns: S.dealerTxns.length, cart: S.dillerCart.length };
      // 3) Savdo — qarz, ball serverdan
      await window.__mode('ok'); reset(); S.dillerSaleId = 1; S.dillerSalePct = 10; S.dillerSaleCart = [{ id: 1, pid: 101, qty: 2, price: 20 }];
      await dlsSubmit();
      out.sale = { qty: S.dealerStock[0].qty, debt: S.dealers[0].debt, sold: S.dealers[0].totalSold, pts: S.dealers[0].points, dlr: S.sales[0] && [S.sales[0].totalUsd, S.sales[0].profitUsd], inv: S.sales[0]?.inv };
      // 4) Qaytarish — partiya va diller qoldig'i serverdan
      reset(); S.dillerReturnCart = [{ id: 1, pid: 101, qty: 1, condition: 'Yangi', reason: 'ortiqcha' }];
      await doDealerReturn(1);
      out.ret = { qty: S.dealerStock[0].qty, batches: S.batches.length, newBatchQty: S.batches[1]?.qty, txn: S.dealerTxns[0]?.totalUsd };
      // 5) Buyurtma tasdig'i — bitta so'rov (orderId bilan), eski dealer-order-status chaqirilmaydi
      reset();
      await approveDealerOrder(50);
      out.order = { status: S.dealerOrders[0].status, qty: S.dealerStock[0].qty, shipped: S.dealers[0].totalShipped };
      // 6) 35 yo'q — avvalgi yo'l (dealer-stock-upsert chaqiriladi)
      await window.__mode('pending'); reset(); S.dillerSendId = 1; S.dillerCart = [{ id: 1, pid: 101, qty: 1 }];
      await sendToDealer();
      await new Promise(r => setTimeout(r, 100));
      out.legacy = { qty: S.dealerStock[0].qty, fdl: FDL.on };
      // 7) 35 sahifa ochiq turganda qo'llandi — keyingi amal yangilamasdan yangi yo'ldan
      await window.__mode('ok'); reset(); S.dillerSendId = 1; S.dillerCart = [{ id: 1, pid: 101, qty: 3 }];
      await sendToDealer();
      out.after = { qty: S.dealerStock[0].qty, fdl: FDL.on };
      return out;
    }).catch(e => ({ err: String(e) }));
    assert.equal(r.err, undefined, r.err);
    assert.deepEqual(r.ship, { qty: 7, avg: 9.5, shipped: 130, txn: 30, cart: 0, batchSold: 0 }, "jo'natish: qoldiq, o'rtacha tannarx va total_shipped — server javobidan (mahalliy FIFO ayirilmadi)");
    const s1 = seen.find(b => b.kind === 'ship');
    assert.deepEqual(s1.items.map(i => [i.pid, i.qty]), [[101, 3]], "savatdagi bir xil mahsulot bitta qatorga");
    assert.ok(!('qty' in s1) && !('avgCostUsd' in s1.items[0]) && !('totalShipped' in s1), "so'rovda yakuniy qoldiq/tannarx/jami yo'q");
    assert.match(s1.key, /^l/); assert.equal(s1.filial, 'baza');
    assert.deepEqual(r.fail, { qty: 4, shipped: 100, txns: 0, cart: 1 }, "server rad etdi — mahalliy holat o'zgarmadi");
    assert.deepEqual({ ...r.sale, inv: undefined }, { qty: 5, debt: 36, sold: 36, pts: 1, dlr: [36, 17], inv: undefined }, 'savdo: qarz, ball, foyda — server javobidan');
    assert.match(r.sale.inv, /^DLR-/, 'hujjat raqami (fwNextDocNo)');
    const sb = seen.find(b => b.kind === 'sale'); assert.equal(sb.pct, 10); assert.ok(!('debt' in sb) && !('owed' in sb));
    assert.deepEqual(r.ret, { qty: 4, batches: 2, newBatchQty: 1, txn: 9.5 });
    const rb = seen.find(b => b.kind === 'return'); assert.equal(rb.items[0].condition, 'Yangi'); assert.ok(rb.items[0].localId, "qaytgan partiya ID'si yuborildi");
    const ob = seen.find(b => b.kind === 'ship' && b.orderId === 50); assert.ok(ob, "buyurtma tasdig'i — dealer-ops ship + orderId");
    assert.deepEqual(r.order, { status: 'approved', qty: 7, shipped: 130 });
    assert.equal(r.legacy.fdl, false, "409 migrationPending — FDL.on = false"); assert.equal(r.legacy.qty, 5, "35 yo'q — avvalgi yo'l (mahalliy hisob)");
    assert.ok(seen.some(b => b.legacy === 'upsert'), "avvalgi yo'l — dealer-stock-upsert chaqirildi");
    const legacyBefore = seen.findIndex(b => b.legacy === 'upsert');
    assert.ok(!seen.slice(0, legacyBefore).some(b => b.legacy), "35 bor paytda eski endpoint'lar (sale-add, update, order-status) chaqirilmadi");
    assert.deepEqual(r.after, { qty: 7, fdl: true }, "35 paydo bo'lgach keyingi amal — dealer-ops (sahifani yangilamasdan)");
    assert.deepEqual(consoleErrors, []);
  } finally { await browser.close(); }
}

module.exports = {
  name: "P44 — v24.5 (v23.10.2 P29 dan): diller ombori va diller savdosi — serverda, bitta tranzaksiyada (35-migratsiya)",
  cases: [
    { name: "Server (haqiqiy PostgreSQL, 35 ikki marta): jo'natish/tasdiq/savdo/qaytarish, huquqlar, filial, replay; eski mutlaq yo'llar — 409", run: testServer },
    { name: "v24.5 moslik: ledger_ops turlari 27–34, diller −10% (31), reviziya (32), dealer_sales.source, 33 qayta qo'llanmaydi", run: testV245Compat },
    { name: "Server: 35 yo'q — dealer-ops 409 migrationPending, eski yo'llar ishlayveradi", run: testServerWithout35 },
    { name: "Admin brauzeri: so'rovda yakuniy qiymat yo'q; natija serverdan; rad — o'zgarishsiz; 35 yo'q — avvalgi yo'l; keyin — yangi yo'l", run: testAdminBrowser },
  ],
};
