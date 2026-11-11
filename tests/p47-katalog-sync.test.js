// P47 — v24.5 (v23.10.2 P31 dan): katalog sinxronlash (catalog-full-sync) — HAQIQIY PostgreSQL (PGlite) bilan.
//  • Ilovada yo'q (o'chirilgan) mahsulot katalogda «qoldiqli» qolmaydi — qoldig'i 0; qator O'CHIRILMAYDI.
//  • Allaqachon 0 bo'lgan eskirgan qator — tegilmaydi (updated_at o'zgarmaydi).
//  • Eski diller buyurtmasidagi havola buzilmaydi; tirik mahsulot qoldig'i — bazadagi partiyadan (27).
//  • 1000 dan ortiq qatorli filial (sahifalash) — hammasi tekshiriladi.
//  • v24.5: ruxsat — admin yoki qoldiqni o'zgartiruvchi ruxsat (mahsulotlar.*, kirim.create, savdo.*, qaytarish.create,
//    dillerlar.manage). Faqat «dashboard.view»li xodim / hisobchi — 403 (katalogga tegilmaydi, jurnalga yoziladi).
//    Kassir (savdo.create) — ruxsat: uning savdosi ham qoldiqni o'zgartiradi (save() → dlSyncCatalog).
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');
const { ROOT, loadApp } = require('./helpers/load-app');

async function freshPg() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE); await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8'));
  return pg;
}

const STAFF = [
  { id: 1, auth_user_id: 'u1', role: 'admin', active: true, filial: 'baza', name: 'A', login: 'a' },
  { id: 2, auth_user_id: 'u2', role: 'sotuvchi', active: true, filial: 'baza', name: 'Xodim', login: 'x' },     // faqat dashboard.view
  { id: 3, auth_user_id: 'u3', role: 'kassir', active: true, filial: 'baza', name: 'Kassir', login: 'k' },      // savdo.create
  { id: 4, auth_user_id: 'u4', role: 'menejer', active: true, filial: 'baza', name: 'Ombor', login: 'o' },      // kirim.create
  { id: 5, auth_user_id: 'u5', role: 'menejer', active: true, filial: 'baza', name: 'Hisobchi', login: 'h' },   // hisobot/kassa — qoldiqqa tegmaydi
];
const RP = (role, keys) => keys.map(k => ({ role_id: role, permission_id: k, permissions: { key: k } }));
function client(pg, auditLog) {
  return makePgSupabase(pg, { pgTables: ['app_data', 'app_data_branches', 'catalog_products', 'batches', 'customer_balances', 'supplier_balances', 'sales', 'stock_writeoffs'],
    memTables: { staff: STAFF.map(s => ({ ...s })),
      staff_roles: [{ staff_id: 2, role_id: 'r-emp' }, { staff_id: 3, role_id: 'r-cash' }, { staff_id: 4, role_id: 'r-wh' }, { staff_id: 5, role_id: 'r-acc' }],
      role_permissions: [...RP('r-emp', ['dashboard.view']), ...RP('r-cash', ['dashboard.view', 'savdo.view', 'savdo.create']),
        ...RP('r-wh', ['mahsulotlar.view', 'kirim.view', 'kirim.create']), ...RP('r-acc', ['hisobot.view', 'hisobot.export', 'kassalar.view', 'kassalar.transact', 'xarajatlar.create'])],
      staff_audit_log: auditLog },
    users: { 't-a': { id: 'u1' }, 't-x': { id: 'u2' }, 't-k': { id: 'u3' }, 't-o': { id: 'u4' }, 't-h': { id: 'u5' } } });
}

async function testCatalogSync() {
  const pg = await freshPg();
  try {
    await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ products: [{ id: 7, sku: 'A', name: 'Drel' }, { id: 8, sku: 'B', name: 'Disk' }] })]);
    await pg.query(`insert into app_data_branches (branch_key, data) values ('baza', '{"batches":[{"id":"a1","pid":7,"qty":5,"sold":0,"costUsd":10,"status":"active"}]}')`);
    await pg.query(`select stock_debt_op('baza', 'seed-1', 'batches_create', $1::jsonb)`, [JSON.stringify({ reason: 'opening', batches: [{ localId: 'a1', pid: 7, qty: 5, costUsd: 10, meta: {} }] })]);
    // Eskirgan qatorlar: 99 (qoldiq 4), 98 (qoldiq 0, eski vaqt), + 1200 ta eskirgan qoldiqli qator (sahifalash)
    await pg.exec(`insert into catalog_products (id, sku, name, qty, filial, updated_at) values (7, 'A', 'Drel', 1, 'baza', now()), (99, 'Z', 'Ochirilgan', 4, 'baza', now()),
      (98, 'Y', 'Nol', 0, 'baza', '2020-01-01'), (99, 'Z', 'Boshqa filial', 6, 'f729', now());
      insert into catalog_products (id, sku, name, qty, filial) select 100000 + g, 'S' || g, 'Eski ' || g, 3, 'baza' from generate_series(1, 1200) g;
      insert into dealers (id, login, name, filial) overriding system value values (1, 'd1', 'D', 'baza');
      insert into dealer_orders (dealer_id, items, status) values (1, '[{"pid":99,"qty":2}]', 'approved');`);
    const before = +(await pg.query(`select count(*)::int n from catalog_products`)).rows[0].n;
    const cl = client(pg, []);
    const r = await loadFunction('catalog-full-sync', cl)(post({}, 't-a'));
    assert.equal(r.statusCode, 200, r.body);
    const b = JSON.parse(r.body);
    const q = async (sql) => (await pg.query(sql)).rows;
    assert.equal(b.eskirganNol, 1202, "baza: 99 + 1200 ta, f729 (ilovaning filiallar ro'yxatida yo'q): 99 — 0 ga tushdi");
    assert.deepEqual(await q(`select count(*)::int n from catalog_products where filial='baza' and id not in (7,8) and qty > 0`), [{ n: 0 }], "ilovada yo'q mahsulot — qoldiqsiz");
    assert.equal(+(await q(`select count(*)::int n from catalog_products`))[0].n, before + 1, "hech bir qator o'chirilmadi (+1: Bazada 8-mahsulotning yangi qatori)");
    assert.deepEqual((await q(`select qty::int q from catalog_products where id=7 and filial='baza'`)), [{ q: 5 }], "tirik mahsulot qoldig'i — bazadagi partiyadan");
    assert.deepEqual((await q(`select updated_at < '2021-01-01' old from catalog_products where id=98`)), [{ old: true }], "allaqachon 0 bo'lgan qator — tegilmadi");
    assert.deepEqual((await q(`select qty::int q from catalog_products where id=99 and filial='f729'`)), [{ q: 0 }], "boshqa filialda ham ilovada yo'q mahsulot — 0");
    assert.deepEqual((await q(`select items->0->>'pid' p, status from dealer_orders`)), [{ p: '99', status: 'approved' }], "eski buyurtma havolasi buzilmadi");
    // Ikkinchi marta — o'zgarish yo'q (idempotent)
    const r2 = JSON.parse((await loadFunction('catalog-full-sync', cl)(post({}, 't-a'))).body);
    assert.equal(r2.eskirganNol, 0);
  } finally { unloadFunctions(); await pg.close(); }
}

async function testPermissionGate() {
  const pg = await freshPg();
  try {
    await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ products: [{ id: 7, sku: 'A', name: 'Drel' }] })]);
    await pg.query(`insert into app_data_branches (branch_key, data) values ('baza', '{"batches":[]}')`);
    await pg.exec(`insert into catalog_products (id, sku, name, qty, filial, updated_at) values (99, 'Z', 'Ochirilgan', 4, 'baza', '2020-01-01')`);
    const audit = [];
    const cl = client(pg, audit);
    const call = async (tok) => loadFunction('catalog-full-sync', cl)(post({}, tok));
    const snap = async () => JSON.stringify((await pg.query(`select id, filial, qty, updated_at from catalog_products order by id, filial`)).rows);
    const s0 = await snap();
    for (const tok of ['t-x', 't-h']) {
      const r = await call(tok);
      assert.equal(r.statusCode, 403, `${tok}: qoldiqqa tegmaydigan xodim — 403 (${r.body})`);
      assert.match(JSON.parse(r.body).error, /ruxsatingiz yo'q/);
    }
    assert.equal(await snap(), s0, 'rad etilganda katalogga tegilmadi');
    const { data: auditRows } = await cl.from('staff_audit_log').select('*');
    assert.equal((auditRows || []).filter(a => a.action === 'permission_denied' && a.details && a.details.fn === 'catalog-full-sync').length, 2, 'rad etish xavfsizlik jurnaliga yozildi');
    const noTok = await loadFunction('catalog-full-sync', cl)({ httpMethod: 'POST', headers: {}, body: '{}' });
    assert.equal(noTok.statusCode, 401);
    for (const tok of ['t-k', 't-o', 't-a']) {
      const r = await call(tok);
      assert.equal(r.statusCode, 200, `${tok}: ruxsatli (kassir savdo.create / ombor kirim.create / admin) — ${r.body}`);
    }
    assert.deepEqual((await pg.query(`select qty::int q from catalog_products where id=99`)).rows, [{ q: 0 }], 'ruxsatli chaqiruv — eskirgan qoldiq 0');
    // Mijoz va server ro'yxati bir xil
    const srv = require('../netlify/functions/catalog-full-sync.js')._SYNC_PERMS;
    const src = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
    const m = src.match(/const FW_CATALOG_SYNC_PERMS = (\[[^\]]*\])/);
    assert.ok(m, 'mijozda FW_CATALOG_SYNC_PERMS bor');
    assert.deepEqual(JSON.parse(m[1].replace(/'/g, '"')), srv, "mijoz va server ruxsatlar ro'yxati — bir xil");
    for (const k of ['mahsulotlar.edit', 'mahsulotlar.create', 'kirim.create', 'savdo.create']) assert.ok(srv.includes(k), k);
  } finally { unloadFunctions(); await pg.close(); }
}

// Mijoz: ruxsatsiz xodimning save()'i katalog funksiyasini umuman chaqirmaydi (403 shovqini yo'q); kassir — chaqiradi
async function testClientGate() {
  const calls = [];
  const { browser, page, consoleErrors } = await loadApp({ mockRoutes: [{ url: '**/.netlify/functions/catalog-full-sync', handler: (route) => {
    calls.push(1); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, count: 1, filiallar: 1 }) }); } }] });
  try {
    const r = await page.evaluate(async () => {
      _cloudEnabled = true; if (!_db) _db = {};
      const out = {};
      CURRENT_USER = { kind: 'staff', staffId: 2, name: 'X', roles: [], perms: new Set(['dashboard.view']) };
      out.emp = await dlSyncCatalog(false);
      CURRENT_USER = { kind: 'staff', staffId: 3, name: 'K', roles: [], perms: new Set(['savdo.create']) };
      out.cash = await dlSyncCatalog(false);
      CURRENT_USER = { kind: 'owner', staffId: null, name: 'E', roles: [], perms: new Set() };
      out.owner = await dlSyncCatalog(false);
      return out;
    });
    assert.deepEqual(r, { emp: false, cash: true, owner: true });
    assert.equal(calls.length, 2, "faqat ruxsatli foydalanuvchi serverni chaqirdi");
    assert.deepEqual(consoleErrors, []);
  } finally { await browser.close(); }
}

module.exports = {
  name: "P47 — v24.5 (v23.10.2 P31 dan): katalog sinxronlash (haqiqiy PostgreSQL): eskirgan qoldiq 0, o'chirilmaydi, havolalar butun, sahifalash; ruxsat tekshiruvi",
  cases: [
    { name: "Ilovada yo'q mahsulot — qoldiq 0 (1202 qator, 2 filial), qatorlar va buyurtma havolasi saqlandi, tirik qoldiq — bazadan, takror — o'zgarishsiz", run: testCatalogSync },
    { name: "Ruxsat: faqat dashboard.view / hisobchi — 403 (katalog o'zgarmaydi, jurnal), tokensiz — 401; kassir, ombor, admin — 200", run: testPermissionGate },
    { name: "Mijoz: ruxsatsiz xodim save()'da katalog funksiyasini chaqirmaydi; kassir va egasi — chaqiradi", run: testClientGate },
  ],
};
