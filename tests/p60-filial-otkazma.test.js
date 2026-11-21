// P60 — v24.6 (36-migratsiya): FILIALLAR O'TKAZMASI — so'rov → jo'natish → yo'lda → sanab qabul.
//  Egasi qarorlari: tovar qabul qiluvchi omboriga U SANAB QABUL QILGANDA tushadi; Baza → filial, filial → filial,
//  filial → Baza; so'rov qisman bajarilsa qolgani ochiq; Baza foydasi — filial sotganda (jo'natishda «ichki savdo» yo'q).
//  • Server (haqiqiy PostgreSQL — PGlite: schema.sql (0..36) + 36 qayta; haqiqiy `branch-transfer`):
//    huquqlar (403), boshqa filial jo'natmasini qabul qila olmaydi, so'ralganidan ko'p jo'natib bo'lmaydi, kam kelsa izoh
//    majburiy, farq: «omborga qaytdi» (jo'natuvchi qoldig'i tiklanadi) / «yo'qotish» (tannarxda), qolganini yopish,
//    takror kalit — ikki marta yozilmaydi; filial sotganda: filial qarzi (filial narxida) va Baza foydasi.
//  • Yuklash: server yaratgan «tr…» partiyalar filial ro'yxatiga qo'shiladi (jo'natuvchi boshqa filial JSON'iga yozmaydi).
//  • 36 bo'lmasa — 409 trPending (umumiy ombor jurnali o'chmaydi).
//  • Brauzer (haqiqiy js/main.js): hub, so'rov oynasi, sanab qabul (kam — ogohlantirish va izoh majburiy).
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, post } = require('./helpers/mem-supabase');
const { loadApp, ROOT } = require('./helpers/load-app');

const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG36 = fs.readFileSync(path.join(ROOT, 'supabase-migration-36-filial-otkazma.sql'), 'utf8');
const PG_TABLES = ['app_data', 'app_data_branches', 'batches', 'ledger_ops', 'stock_ledger', 'branch_transfers', 'branch_transfer_shipments', 'sales'];
const PERMS = { 'r-man': ['kirim.create'], 'r-sel': ['savdo.create'] };
const USERS = { 't-admin': { id: 'u-admin' }, 't-man': { id: 'u-man' }, 't-sel': { id: 'u-sel' }, 't-f7': { id: 'u-f7' }, 't-f8': { id: 'u-f8' } };
const B = (r) => JSON.parse(r.body);
let K = 0; const key = () => 'k-' + (++K) + '-' + Math.random().toString(36).slice(2, 8);

async function world({ no36 = false } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  const cut = SCHEMA.indexOf("\n-- 36-migratsiya (supabase-migration-36-filial-otkazma.sql)");
  assert.ok(cut > 0, "schema.sql: 36-migratsiya bo'limi bor");
  await pg.exec(no36 ? SCHEMA.slice(0, cut) : SCHEMA);
  if (!no36) await pg.exec(MIG36);                                    // qayta — idempotent
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12000 } })]);
  await pg.query(`select stock_debt_op('baza', 'seed-001', 'batches_create', $1::jsonb)`, [JSON.stringify({ reason: 'opening',
    batches: [{ localId: 'a1', pid: 101, qty: 10, costUsd: 20, meta: {} }, { localId: 'a2', pid: 102, qty: 5, costUsd: 3, meta: {} }] })]);
  const memTables = {
    staff: [
      { id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
      { id: 7, auth_user_id: 'u-man', role: 'sotuvchi', active: true, filial: 'baza', name: 'Omborchi', login: 'man' },
      { id: 9, auth_user_id: 'u-sel', role: 'sotuvchi', active: true, filial: 'f729', name: 'Sotuvchi', login: 'sel' },
      { id: 10, auth_user_id: 'u-f7', role: 'sotuvchi', active: true, filial: 'f729', name: 'Filial 729', login: 'f7' },
      { id: 11, auth_user_id: 'u-f8', role: 'sotuvchi', active: true, filial: 'f702', name: 'Filial 702', login: 'f8' },
    ],
    staff_roles: [{ staff_id: 7, role_id: 'r-man' }, { staff_id: 9, role_id: 'r-sel' }, { staff_id: 10, role_id: 'r-man' }, { staff_id: 11, role_id: 'r-man' }],
    role_permissions: Object.entries(PERMS).flatMap(([rid, keys]) => keys.map(k => ({ role_id: rid, permission_id: k, permissions: { key: k } }))),
    staff_audit_log: [], idempotency_keys: [], security_events: [],
  };
  require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
  return { pg, client: makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: USERS }) };
}
const v = async (pg, sql, p) => ((await pg.query(sql, p)).rows[0] || {}).v;
const stockOf = (pg, f, pid) => v(pg, `select coalesce(sum(qty - sold),0)::numeric v from batches where filial=$1 and pid=$2 and status='active'`, [f, pid]).then(Number);

async function testServerFlow() {
  const { pg, client } = await world();
  const h = loadFunction('branch-transfer', client);
  const call = (tok, kind, payload, k) => h(post({ kind, payload, key: k || key() }, tok));
  // so'rov: 729 Bazadan 6 drel + 1 kalit
  let r = await call('t-sel', 'tr_request', { from: 'baza', items: [{ pid: 101, qty: 6 }] }); assert.equal(r.statusCode, 403, 'savdo.create — rad');
  r = await call('t-f7', 'tr_request', { from: 'baza', items: [{ pid: 101, qty: 6, name: 'Drel' }, { pid: 102, qty: 1 }], priority: 'urgent' });
  assert.equal(r.statusCode, 200, r.body); const T = B(r).transfer; assert.equal(T.no, 'OT-0001'); assert.equal(T.from, 'baza'); assert.equal(T.to, 'f729');
  // jo'natish: Baza 5 tasini (qisman), filial narxi 25$; so'ralganidan ko'p — rad
  r = await call('t-man', 'tr_ship', { transferId: T.id, items: [{ pid: 101, qty: 7, priceUsd: 25 }] }); assert.equal(r.statusCode, 400); assert.match(B(r).error, /ko'p/);
  r = await call('t-f7', 'tr_ship', { transferId: T.id, items: [{ pid: 101, qty: 5, priceUsd: 25 }] }); assert.equal(r.statusCode, 400, "so'rov 729 ga yuborilmagan");
  const shipKey = key();
  r = await call('t-man', 'tr_ship', { transferId: T.id, items: [{ pid: 101, qty: 5, priceUsd: 25 }] }, shipKey); assert.equal(r.statusCode, 200, r.body);
  const sid = B(r).shipmentId; assert.equal(B(r).transfer.status, 'open', 'qolgani ochiq');
  r = await call('t-man', 'tr_ship', { transferId: T.id, items: [{ pid: 101, qty: 5, priceUsd: 25 }] }, shipKey); assert.equal(B(r).replay, true, 'takror kalit');
  assert.equal(await stockOf(pg, 'baza', 101), 5, 'Bazadan chiqdi (bir marta)');
  assert.equal(await stockOf(pg, 'f729', 101), 0, "filialga hali TUSHMADI — yo'lda");
  assert.equal(+(await v(pg, `select coalesce(sum(qty),0) v from batches where filial='f729' and status='transit'`)), 5);
  assert.equal(+(await v(pg, `select count(*)::int v from sales where is_transfer`)), 0, "jo'natishda «ichki savdo» yo'q");
  // boshqa filial qabul qila olmaydi; kam kelsa — izohsiz rad
  r = await call('t-f8', 'tr_receive', { shipmentId: sid, items: [{ pid: 101, qty: 5 }] }); assert.equal(r.statusCode, 400); assert.match(B(r).error, /sizga emas/);
  r = await call('t-f7', 'tr_receive', { shipmentId: sid, items: [{ pid: 101, qty: 4 }] }); assert.equal(r.statusCode, 400); assert.match(B(r).error, /izoh/);
  r = await call('t-f7', 'tr_receive', { shipmentId: sid, items: [{ pid: 101, qty: 4 }], note: 'bittasi singan' }); assert.equal(r.statusCode, 200, r.body);
  assert.equal(B(r).shortUnits, 1); assert.equal(await stockOf(pg, 'f729', 101), 4, 'omborga aynan 4 tushdi');
  const tb = B(r).authority.batches.find(b => b.filial === 'f729'); assert.equal(tb.pid, 101); assert.equal(+tb.costUsd, 25);
  r = await call('t-f7', 'tr_resolve', { shipmentId: sid, resolution: 'loss' }); assert.equal(r.statusCode, 400, 'farqni faqat jo\'natuvchi hal qiladi');
  r = await call('t-man', 'tr_resolve', { shipmentId: sid, resolution: 'returned' }); assert.equal(r.statusCode, 200, r.body);
  assert.equal(await stockOf(pg, 'baza', 101), 6, 'kam kelgan 1 dona Baza omboriga qaytdi');
  // yuklash: «tr» partiya 729 ning JSON'ida yo'q bo'lsa ham ro'yxatga qo'shiladi
  const LA = require('../netlify/functions/_lib/ledgerAuthority');
  const ov = LA.overlayBranchLedger({ batches: [] }, await LA.loadLedger(client, 'f729')).branch;
  assert.ok(ov.batches.some(b => /^tr\d+-\d+$/.test(b.id) && b.pid === 101 && b.qty === 4 && b.status === 'active' && b.fromBranch === 'baza'));
  // filial sotdi (2 dona): qarz 2×25 = 50; Baza foydasi 2×(25−20) = 10
  await pg.query(`select sale_checkout_v34('f729','sale-0001',$1::jsonb,'[]'::jsonb,null,'K','admin',true)`,
    [JSON.stringify({ localId: 's1', inv: 'C1', items: [{ pid: 101, qty: 2, sellUsd: 40, sku: 'D', name: 'Drel' }], paidUsd: 0, payType: 'debt', saleDate: '2026-10-15' })]);
  assert.equal(+(await v(pg, `select data->'branchDebt'->>'f729' v from app_data where id='main'`)), 50);
  r = await h(post({ kind: 'income', payload: { from: '2000-01-01', to: '2999-12-31' } }, 't-man')); assert.equal(r.statusCode, 403, 'foyda — faqat admin');
  r = await h(post({ kind: 'income', payload: { from: '2000-01-01', to: '2999-12-31' } }, 't-admin'));
  assert.deepEqual(B(r).income.f729, { units: 2, revenueUsd: 50, profitUsd: 10 });
  // filial → filial (Bazadan kelgan tovar — qarz baribir Bazaga), keyin farq — yo'qotish
  r = await call('t-f7', 'tr_ship', { to: 'f702', items: [{ pid: 101, qty: 2 }] }); assert.equal(r.statusCode, 200, r.body);
  assert.equal(B(r).transfer.kind, 'send'); const s2 = B(r).shipmentId;
  r = await call('t-f8', 'tr_receive', { shipmentId: s2, items: [{ pid: 101, qty: 1 }], note: "yo'lda yo'qoldi" }); assert.equal(r.statusCode, 200, r.body);
  r = await call('t-f7', 'tr_resolve', { shipmentId: s2, resolution: 'loss' }); assert.equal(B(r).lossUsd, 25, "yo'qotish tannarxda");
  assert.equal(await v(pg, `select from_branch v from batches where filial='f702' and status='active' limit 1`), 'baza');
  // filial → Baza qaytarish: Baza tannarxida qaytadi
  r = await call('t-f8', 'tr_ship', { to: 'baza', items: [{ pid: 101, qty: 1 }] }); assert.equal(r.statusCode, 200, r.body); assert.equal(B(r).transfer.kind, 'return');
  r = await call('t-man', 'tr_receive', { shipmentId: B(r).shipmentId, items: [{ pid: 101, qty: 1 }] }); assert.equal(r.statusCode, 200, r.body);
  assert.equal(+(await v(pg, `select cost_usd v from batches where filial='baza' and local_id like 'tr%' and status='active' limit 1`)), 20);
  // qolganini yopish; ro'yxat
  r = await call('t-f7', 'tr_close', { transferId: T.id, note: 'kerak emas' }); assert.equal(B(r).transfer.status, 'closed');
  r = await call('t-f7', 'tr_ship', { transferId: T.id, items: [{ pid: 102, qty: 1 }] }); assert.equal(r.statusCode, 400);
  r = await h(post({ kind: 'list' }, 't-f7')); assert.equal(B(r).transfers.length, 2);
  r = await h(post({ kind: 'list' }, 't-f8')); assert.equal(B(r).transfers.length, 2, "faqat o'zi ishtirok etganlari");
  r = await h(post({ kind: 'list', payload: { all: true } }, 't-admin')); assert.equal(B(r).transfers.length, 3);
}

async function testNo36() {
  const { client } = await world({ no36: true });
  const h = loadFunction('branch-transfer', client);
  const r = await h(post({ kind: 'list' }, 't-f7'));
  assert.equal(r.statusCode, 409); assert.equal(B(r).trPending, true); assert.equal(B(r).migrationPending, undefined, "umumiy ombor jurnali o'chmaydi");
}

async function testUi() {
  const SHIP = { id: 9, seq: 1, status: 'transit', lines: [{ pid: 101, qty: 6, localId: 'tr9-1', batchId: 1, srcCost: 20, cost: 25 }], shippedAt: '2026-10-15T09:00:00Z', shippedBy: 'Egasi' };
  const TR = { id: 1, no: 'OT-0001', kind: 'request', from: 'baza', to: 'f729', status: 'open', items: [{ pid: 101, qty: 6, shipped: 6 }, { pid: 102, qty: 1, shipped: 0 }],
    createdAt: '2026-10-15T08:00:00Z', createdBy: 'Egasi', shipments: [SHIP] };
  const calls = [];
  const { browser, page, consoleErrors } = await loadApp({ mockRoutes: [{ url: '**/.netlify/functions/branch-transfer', handler: async (route) => {
    const b = JSON.parse(route.request().postData()); calls.push(b);
    const out = b.kind === 'list' ? { transfers: [TR] } : b.kind === 'tr_receive' ? { transfer: { ...TR, shipments: [{ ...SHIP, status: 'diff', recvNote: b.payload.note }] }, authority: { filial: 'f729', batches: [] } }
      : { transfer: { ...TR, id: 2, no: 'OT-0002', items: b.payload.items.map(i => ({ ...i, shipped: 0 })), shipments: [] }, authority: { filial: 'f729', batches: [] } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }); } }] });
  try {
    const r = await page.evaluate(async () => {
      document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div>');
      save = () => {}; _cloudEnabled = true; FWL.on = true; window.__t = []; toast = (m, t) => __t.push([t || 'ok', m]);
      Object.assign(S, { branch: 'f729', page: 'dashboard', batches: [], sales: [], _store: {},
        products: [{ id: 101, sku: 'D1', name: 'Bosch drel', unit: 'dona' }, { id: 102, sku: 'K2', name: 'Kalit toʻplami', unit: 'dona' }] });
      await openTransfers('in');
      const hub = document.querySelector('#bs-ov').innerText;
      frDetail(1); const det = document.querySelector('#bs-ov').innerText;
      frReceiveForm(1, 9); const inp = document.querySelector('.fr-rq'); inp.value = '5'; frRecvCheck();
      const warn = document.getElementById('fr-rdiff').innerText;
      await frReceiveSubmit(1, 9); const noNote = __t.slice(-1)[0];
      document.getElementById('fr-rnote').value = 'bittasi singan'; await frReceiveSubmit(1, 9);
      frRequestForm(); FR.form.items.push({ pid: 102, qty: 1 }); frFormRender(); frQty(0, 1);
      const req = document.querySelector('#bs-ov').innerText;
      await frSubmit();
      return { hub, det, warn, noNote, req };
    });
    assert.match(r.hub, /Filiallar oʻtkazmasi/); assert.match(r.hub, /OT-0001/); assert.match(r.hub, /Tovar soʻrash/);
    assert.match(r.det, /Sanab qabul qilish/); assert.match(r.det, /Qolganini yopish/); assert.match(r.det, /Nakladnoy/);
    assert.match(r.warn, /1 dona kam/); assert.equal(r.noNote[0], 'error', 'izohsiz — rad');
    assert.match(r.req, /Qayerdan soʻraladi/); assert.match(r.req, /Muhimlik/);
    const rc = calls.find(c => c.kind === 'tr_receive'); assert.deepEqual(rc.payload, { shipmentId: 9, items: [{ pid: 101, qty: 5 }], note: 'bittasi singan' });
    assert.ok(rc.key && rc.filial === 'f729', 'kalit va filial bilan');
    const rq = calls.find(c => c.kind === 'tr_request'); assert.equal(rq.payload.from, 'baza'); assert.equal(rq.payload.items[0].qty, 2);
    assert.equal(calls.filter(c => c.kind === 'tr_receive').length, 1, 'izohsiz urinish serverga bormadi');
    assert.deepEqual(consoleErrors, [], "sahifada JS xatosi yo'q");
  } finally { await browser.close(); }
}

module.exports = {
  name: "P60 — filiallar o'tkazmasi (36)",
  cases: [
    { name: "server: so'rov → qisman jo'natish (yo'lda) → sanab qabul (kam — izoh) → farq yechimi; filial→filial, filial→Baza; qarz va Baza foydasi sotilganda", run: testServerFlow },
    { name: "36 yo'q — 409 trPending (umumiy ombor jurnali o'chmaydi)", run: testNo36 },
    { name: 'brauzer: hub, hujjat, sanab qabul (kam — ogohlantirish, izoh majburiy), tovar so\'rash', run: testUi },
  ],
};
