// P84 — v25 (45-migratsiya, egasi qarori 2026-11-10): ZAKLAD YUAN, $ yoki SO'MDA.
// HAQIQIY server funksiyalari (supplier-advance, stock-debt-ops, cashbox-ops) + HAQIQIY PostgreSQL (PGlite) + brauzer.
//  • $ zaklad — $ kassadan, so'm zaklad — so'm kassadan; xizmat — o'sha valyutada xarajat.
//  • So'mdagi ta'minotchida zaklad so'mda yuritiladi va qarz zakladdan so'mma-so'm yopiladi.
//  • Summa birligi ta'minotchi valyutasiga mos bo'lmasa — rad; zaklad bo'lsa valyuta o'zgarmaydi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG27 = fs.readFileSync(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'), 'utf8');
const MIG44 = fs.readFileSync(path.join(ROOT, 'supabase-migration-44-taminotchi-valyuta.sql'), 'utf8');
const MIG45 = fs.readFileSync(path.join(ROOT, 'supabase-migration-45-zaklad-valyuta.sql'), 'utf8');
const PG_TABLES = ['supplier_advance_balances', 'supplier_advance_ledger', 'app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger',
  'sales', 'batches', 'customer_balances', 'supplier_balances', 'customer_debt_payments', 'supplier_payments', 'home_withdrawals',
  'idempotency_keys', 'ledger_ops', 'customer_debt_ledger', 'supplier_debt_ledger', 'stock_ledger'];
const CID = 1759300000000123, CID2 = 1759300000000124, SID = 1759300000000456, SCON = 1759300000000457, SUZ = 1759300000000458;
const PERMS = ['savdo.create', 'mijozlar.debt_payment', 'mijozlar.edit', 'taminotchilar.edit', 'kassalar.transact', 'kirim.create', 'ombor.edit'];
const USERS = { 't-kas': { id: 'u-kas' }, 't-sel': { id: 'u-sel' } };
const BOXES = [{ id: 1, name: "Naqd So'm", cur: 'UZS', type: 'cash', bal: 0 }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 0 }];
const BRANCH = {
  cashboxes: BOXES, cashTxns: [], expenses: [],
  customers: [{ id: CID, name: 'Ali', debt: 600000 }, { id: CID2, name: 'Vali', debt: 0 }],
  suppliers: [{ id: SID, name: 'Xitoy MChJ', debt: 100, paid: 0 }, { id: SCON, name: 'Konsignator', debt: 0, isConsignment: true }, { id: SUZ, name: 'Mahalliy MChJ', debt: 0 }],
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
  await pg.exec(MIG44); await pg.exec(MIG45);   // zanjir tartibi: 27 → … → 44 → 45
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


const sUzs = (pg, id = SUZ) => num(pg, `select debt_uzs v from supplier_balances where filial='f729' and supplier_local_id=$1`, [id]);
const adv = (pg, col, id) => num(pg, `select ${col} v from supplier_advance_balances where filial='f729' and supplier_local_id=$1`, [id]);

module.exports = {
  name: 'P84 — 45-migratsiya: zaklad yuan, $ yoki soʻmda (server + PostgreSQL + brauzer)',
  cases: [
    { name: 'soʻm zaklad soʻm kassadan, $ zaklad $ kassadan; soʻmdagi taʼminotchida zakladdan soʻmma-soʻm yopish; himoyalar', async run() {
      await withWorld(async ({ pg, client }) => {
        const op = loadFunction('stock-debt-ops', client), sa = loadFunction('supplier-advance', client);
        const call = (b) => sa(post({ filial: 'f729', ...b }, 't-kas'));
        let r = await op(post({ filial: 'f729', key: 'scur-0001', kind: 'supp_cur', payload: { supplierId: SUZ, currency: 'UZS' } }, 't-kas'));
        assert.equal(r.statusCode, 200, r.body);
        // so'm zaklad: 1 000 000 + 1% xizmat — so'm kassadan 1 010 000
        r = await call({ action: 'pay', suppId: SUZ, source: 'box', boxId: 3, currency: 'UZS', amount: 1000000, feePct: 1, idemKey: 'zak-uzs-0001' });
        assert.equal(r.statusCode, 400, "so'm zaklad $ kassadan — rad"); assert.match(JSON.parse(r.body).error, /soʻm kassadan|so'm kassadan/);
        r = await call({ action: 'pay', suppId: SUZ, source: 'box', boxId: 1, currency: 'UZS', amount: 1000000, feePct: 1, idemKey: 'zak-uzs-0001' });
        assert.equal(r.statusCode, 200, r.body);
        assert.equal(await box(pg, 1), 5000000 - 1010000);
        assert.equal(await adv(pg, 'balance_uzs', SUZ), 1000000);
        r = await call({ action: 'pay', suppId: SUZ, source: 'box', boxId: 1, currency: 'UZS', amount: 1000000, feePct: 1, idemKey: 'zak-uzs-0001' });
        assert.equal(r.statusCode, 200); assert.equal(await box(pg, 1), 3990000, 'takror — bir marta');
        // yuan zaklad so'mdagi ta'minotchiga: 700 ¥ / 7 = 100 $ × 12 000 = 1 200 000 so'm
        r = await call({ action: 'pay', suppId: SUZ, source: 'box', boxId: 3, cny: 700, rate: 7, feePct: 0, idemKey: 'zak-cny-0001' });
        assert.equal(r.statusCode, 200, r.body); assert.equal(await adv(pg, 'balance_uzs', SUZ), 2200000);
        // kirim → qarz 1 500 000 so'm (125 $ × 12 000); kurs o'zgaradi; zakladdan 1 234 567 so'm yopiladi — aniq
        r = await op(post({ filial: 'f729', key: 'kir-uzs-0001', kind: 'batches_create', payload: { reason: 'kirim', kirimRef: 'K-Z1',
          supplier: { id: SUZ, goodsUsd: 125, givenUsd: 0 }, batches: [{ localId: 'kz1', pid: 104, qty: 5, costUsd: 25 }] } }, 't-kas'));
        assert.equal(r.statusCode, 200, r.body); assert.equal(await sUzs(pg), 1500000);
        await pg.query(`update app_data set data = jsonb_set(data, '{settings,usdUzs}', '12650'::jsonb) where id='main'`);
        r = await call({ action: 'apply', suppId: SUZ, amountUsd: 10, idemKey: 'zap-uzs-0000' });
        assert.equal(r.statusCode, 400, "so'mdagi ta'minotchiga $ summa — rad");
        r = await call({ action: 'apply', suppId: SUZ, amountUzs: 1234567, idemKey: 'zap-uzs-0001' });
        assert.equal(r.statusCode, 200, r.body);
        assert.equal(await sUzs(pg), 265433, 'qarz soʻmma-soʻm kamaydi');
        assert.equal(await adv(pg, 'balance_uzs', SUZ), 965433);
        assert.equal(JSON.parse(r.body).apply.supplierDebtUzs, 265433);
        r = await call({ action: 'apply', suppId: SUZ, amountUzs: 300000, idemKey: 'zap-uzs-0002' });
        assert.equal(r.statusCode, 400, 'qarzdan koʻp — rad'); assert.equal(await sUzs(pg), 265433);
        // zaklad bor — valyuta o'zgarmaydi (qarz 0 bo'lsa ham)
        r = await call({ action: 'apply', suppId: SUZ, amountUzs: 265433, idemKey: 'zap-uzs-0003' }); assert.equal(r.statusCode, 200, r.body);
        r = await op(post({ filial: 'f729', key: 'scur-0002', kind: 'supp_cur', payload: { supplierId: SUZ, currency: 'USD' } }, 't-kas'));
        assert.equal(r.statusCode, 400); assert.match(JSON.parse(r.body).error, /zaklad/);
        // $ dagi ta'minotchi: $ zaklad $ kassadan, yopish $ da (avvalgidek); so'm summa — rad
        r = await call({ action: 'pay', suppId: SID, source: 'box', boxId: 3, currency: 'USD', amount: 50, feePct: 0.5, idemKey: 'zak-usd-0001' });
        assert.equal(r.statusCode, 200, r.body); assert.equal(await adv(pg, 'balance_usd', SID), 50); assert.equal(await box(pg, 3), 1000 - 100 - 50.25, 'yuan zaklad (100 $) va $ zaklad (50,25 $) — $ kassadan');
        r = await call({ action: 'apply', suppId: SID, amountUzs: 100000, idemKey: 'zap-usd-0000' }); assert.equal(r.statusCode, 400);
        r = await call({ action: 'apply', suppId: SID, amountUsd: 30, idemKey: 'zap-usd-0001' }); assert.equal(r.statusCode, 200, r.body);
        assert.equal(await supp(pg, SID), 70); assert.equal(await adv(pg, 'balance_usd', SID), 20);
        // ro'yxat: so'mdagi qoldiq alohida
        r = await call({ action: 'list' }); assert.equal(r.statusCode, 200, r.body);
        assert.deepEqual(JSON.parse(r.body).balancesUzs, { [String(SUZ)]: 965433 - 265433 });
        await consistent(pg);
      });
    } },
    { name: 'brauzer: zaklad oynasida ¥ / $ / soʻm; soʻm — soʻm kassalar; soʻmdagi taʼminotchida yopish soʻmda', async run() {
      const { openPage } = require('./p4-responsive.test.js')._helpers;
      const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        const r = await page.evaluate(async () => {
          closeModal(); CUR.usdUzs = 12000; save = async () => true; _cloudEnabled = true;
          S.cashboxes = [{ id: 1, name: "Naqd So'm", cur: 'UZS', type: 'cash', bal: 5000000, icon: '💵' }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 900, icon: '💲' }];
          S.suppliers = [{ id: 11, name: 'Mahalliy', debt: 50, debtCur: 'UZS', debtUzs: 600000 }];
          SADV.loaded = true; SADV.bal = { 11: 40 }; SADV.balUzs = { 11: 480000 };
          const out = {}; let sent = [];
          authFetch = async (u, o) => { const b = JSON.parse(o.body); sent.push(b); return { ok: true, status: 200, json: async () => (b.action === 'pay'
            ? { ok: true, payment: { currency: 'UZS', amount: 200000, fee: 0, feeUsd: 0, usd: 16.67, advanceUsd: 56.67, advanceUzs: 680000, balances: { 1: 4800000 } } }
            : { ok: true, apply: { appliedUzs: 480000, advanceUsd: 0, advanceUzs: 0, supplierDebt: 10, supplierPaid: 40, supplierDebtCur: 'UZS', supplierDebtUzs: 120000 } }) }; };
          out.tag = sadvRowTag(S.suppliers[0]);
          openSuppAdvance(11, 'UZS'); await new Promise(r => setTimeout(r, 30));
          out.tabs = [...document.querySelectorAll('.modal-body .bs-seg button')].map(b => b.textContent);
          out.boxes = [...document.querySelectorAll('#sadv-b option, [data-v]')].map(x => x.value || x.dataset.v).filter(Boolean);
          document.getElementById('sadv-cny').value = '200000'; sadvPreview(); out.prev = document.getElementById('sadv-res').textContent.replace(/\s+/g, ' ');
          window.confirm = () => true; await sadvPay(11);
          out.pay = sent.find(b => b.action === 'pay'); out.balUzs = SADV.balUzs['11'];
          openSuppAdvanceApply(11); out.applyDef = document.getElementById('sadp-a').value; await sadvApply(11);
          out.apply = sent.find(b => b.action === 'apply'); out.debtUzs = S.suppliers[0].debtUzs;
          return out;
        });
        assert.match(r.tag, /Zaklad 480.000/);
        assert.deepEqual(r.tabs, ['Yuan (¥)', 'Dollar ($)', 'Soʻm (soʻm)']);
        assert.match(r.prev, /200.000/);
        assert.deepEqual({ cur: r.pay.currency, amount: r.pay.amount, box: r.pay.boxId, cny: r.pay.cny }, { cur: 'UZS', amount: 200000, box: 1, cny: undefined });
        assert.equal(r.balUzs, 680000);
        assert.equal(r.applyDef, '600000');
        assert.deepEqual({ uzs: r.apply.amountUzs, usd: r.apply.amountUsd }, { uzs: 600000, usd: undefined });
        assert.equal(r.debtUzs, 120000);
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
  ],
};
