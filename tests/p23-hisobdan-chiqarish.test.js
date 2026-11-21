// P23 — v23.6 (29-migratsiya): HISOBDAN CHIQARISH (v25: B2B olib tashlandi — faqat hisobdan chiqarish qoldi) — HAQIQIY server funksiyalari + IKKITA alohida
// PostgreSQL (PGlite): «A» (ta'minotchi) va «B» (xaridor) — har biri o'z bazasi, o'z manzili. Tarmoq — test
// ichida A ↔ B funksiyalariga yo'naltiriladi (haqiqiy internet yo'q).
// Tekshiriladi: taklif → ulanish → ikki tomon tasdig'i; katalog (qoldiq, opt narx, «buyurtma bo'yicha»);
// buyurtma → tasdiq; jo'natma (A omboridan FIFO) → B sonini tekshirib qabul qiladi (4 / 5) → B omboriga kirim +
// ta'minotchi qarzi; A tomonida mijoz qarzi FAQAT qabul qilingan son bo'yicha; kelmagan 1 dona A omboriga qaytadi.
// Xavfsizlik: noto'g'ri kalit, qayta ishlatilgan taklif, xodim (egasi emas), uzilgan ulanish, takroriy xabar.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG = (n) => fs.readFileSync(path.join(ROOT, n), 'utf8');
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger', 'sales', 'batches',
  'customer_balances', 'supplier_balances', 'customer_debt_payments', 'supplier_payments', 'home_withdrawals', 'dealer_payments', 'dealers', 'cashbox_transactions',
  'ledger_ops', 'customer_debt_ledger', 'supplier_debt_ledger', 'stock_ledger', 'stock_writeoffs', 'b2b_links', 'b2b_orders', 'b2b_shipments', 'b2b_product_map', 'b2b_inbound_log'];
const BOXES = [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 0 }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 0 }];

async function instance({ name, url, products, batches, customers = [], suppliers = [] }) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE); await pg.exec(SCHEMA);
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ products, settings: { usdUzs: 12000, company: name }, branchStore: { baza: { cashboxes: BOXES } } })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('baza', $1::jsonb)`, [JSON.stringify({ cashboxes: BOXES, batches, customers, suppliers, sales: [] })]);
  for (const m of ['supabase-migration-24-v11-cash-authority.sql', 'supabase-migration-27-f4b-ledger-authority.sql', 'supabase-migration-28-firma-kassa-asosiy.sql', 'supabase-migration-29-hisobdan-chiqarish-b2b.sql']) await pg.exec(MIG(m));
  const memTables = {
    staff: [{ id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: name + ' egasi', login: 'admin' },
            { id: 5, auth_user_id: 'u-sk', role: 'sotuvchi', active: true, filial: 'baza', name: 'Omborchi', login: 'sk' },
            { id: 6, auth_user_id: 'u-no', role: 'sotuvchi', active: true, filial: 'baza', name: 'Sotuvchi', login: 'no' }],
    staff_roles: [{ staff_id: 5, role_id: 'r-sk' }, { staff_id: 6, role_id: 'r-no' }],
    role_permissions: [...['b2b.view', 'b2b.order', 'b2b.ship', 'ombor.writeoff'].map(k => ({ role_id: 'r-sk', permission_id: k, permissions: { key: k } })),
      { role_id: 'r-no', permission_id: 'savdo.create', permissions: { key: 'savdo.create' } }],
    staff_audit_log: [], idempotency_keys: [],
  };
  const client = makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: { 't-admin': { id: 'u-admin' }, 't-sk': { id: 'u-sk' }, 't-no': { id: 'u-no' } } });
  const fn = { wo: loadFunction('stock-writeoff', client) };   // v25: B2B funksiyalari olib tashlandi
  return { pg, client, fn, url };
}

const A_PRODUCTS = [{ id: 101, sku: 'PG-1', name: 'Drel', unit: 'dona', optMarkupPct: 20, markupPct: 30 }, { id: 102, sku: 'PG-2', name: 'Buyurtma mahsulot', unit: 'dona', directSale: true },
  { id: 103, sku: 'PG-3', name: 'Arxivdagi', archived: true }, { id: 104, sku: 'PG-4', name: 'Arra', unit: 'dona' }];
const A_BATCHES = [{ id: 9001, pid: 101, qty: 10, sold: 0, costUsd: 40, date: '2026-09-01', status: 'active', origin: 'Kirim' },
  { id: 9002, pid: 104, qty: 5, sold: 0, costUsd: 20, date: '2026-09-01', status: 'active', origin: 'Kirim' }];

async function oneWorld() {
  return { A: await instance({ name: 'Alfa Savdo', url: 'https://alfa-savdo.example.com', products: A_PRODUCTS, batches: A_BATCHES }) };
}
const q1 = async (w, sql, p = []) => (await w.pg.query(sql, p)).rows;
const stockA = async (A) => +(await q1(A, `select coalesce(sum(qty - sold),0) s from batches where filial='baza' and pid=101`))[0].s;

async function testWriteoffServer() {
  const { A } = await oneWorld();
  try {
    const wo = async (body, tok = 't-admin') => { const r = await A.fn.wo(post(body, tok)); return { status: r.statusCode, ...JSON.parse(r.body) }; };
    assert.equal((await wo({ action: 'create', key: 'wo-k1', doc: { localId: 'wo1', docNo: 'HC-1', reason: 'damaged', items: [{ pid: 101, qty: 3 }] } }, 't-no')).status, 403);
    const r = await wo({ action: 'create', key: 'wo-k1', doc: { localId: 'wo1', docNo: 'HC-1', reason: 'damaged', items: [{ pid: 101, qty: 3, costUsd: 0.01 }] } }, 't-sk');
    assert.equal(r.status, 200, JSON.stringify(r)); assert.equal(r.totalCostUsd, 120, 'zarar serverda: 3 × 40$'); assert.equal(await stockA(A), 7);
    await wo({ action: 'create', key: 'wo-k1', doc: { localId: 'wo1', docNo: 'HC-1', reason: 'damaged', items: [{ pid: 101, qty: 3 }] } }, 't-sk');
    assert.equal(await stockA(A), 7, 'takroriy so\'rov ikki marta chiqarmaydi');
    assert.equal((await wo({ action: 'create', key: 'wo-k9', doc: { localId: 'wo9', reason: 'lost', items: [{ pid: 101, qty: 50 }] } })).status, 400, "qoldiqdan ko'p — rad");
    assert.equal(await stockA(A), 7);
    const c = await wo({ action: 'cancel', key: 'woc-k1', localId: 'wo1' }, 't-sk'); assert.equal(c.status, 200, JSON.stringify(c));
    assert.equal(await stockA(A), 10, 'bekor qilish — omborga qaytdi');
    assert.notEqual((await wo({ action: 'cancel', key: 'woc-k2', localId: 'wo1' })).status, 200, 'ikki marta bekor qilib boʻlmaydi');
    const ls = await wo({ action: 'list' }); assert.equal(ls.docs.length, 1); assert.equal(ls.docs[0].status, 'cancelled');
  } finally { unloadFunctions(); }
}

module.exports = {
  name: "P23 — v23.6: hisobdan chiqarish — haqiqiy server + PostgreSQL (v25: B2B olib tashlandi)",
  cases: [
    { name: 'Hisobdan chiqarish: ruxsat, zarar serverda, takror, qoldiqdan ko\'p — rad, bekor qilish', run: testWriteoffServer },
  ],
};
