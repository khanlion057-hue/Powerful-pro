// P83 — v25 (44-migratsiya, egasi qarori 2026-11-10): TA'MINOTCHI QARZI $ yoki SO'MDA — har ta'minotchiga alohida.
// HAQIQIY server funksiyalari (stock-debt-ops, cashbox-ops, app-data-load) + HAQIQIY PostgreSQL (PGlite) + brauzer.
//  • So'mdagi ta'minotchi: kirim — o'sha kungi kursda so'mda; kurs o'zgarsa qarz (so'mda) o'zgarmaydi;
//    so'm kassadan to'lov so'mma-so'm, $ kassadan — bugungi kursda; ortiqcha to'lov so'mda tekshiriladi.
//  • Valyuta faqat qarz 0 bo'lganda o'zgaradi; $ dagi ta'minotchi — avvalgidek.
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
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger',
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
  await pg.exec(MIG44);   // zanjir tartibi: 27 → … → 44 (27 qayta qo'llansa 44 undan keyin)
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
const setRate = (pg, r) => pg.query(`update app_data set data = jsonb_set(data, '{settings,usdUzs}', to_jsonb($1::numeric)) where id='main'`, [r]);
const pay = (h, key, b, amount, sid = SUZ) => h(post({ filial: 'f729', key, kind: 'supp_pay', ops: [{ box: b, dir: 'out', amount }], record: { supplierId: sid } }, 't-kas'));

module.exports = {
  name: 'P83 — 44-migratsiya: taʼminotchi qarzi $ yoki soʻmda (server + PostgreSQL + brauzer)',
  cases: [
    { name: 'soʻmdagi taʼminotchi: kirim kursda qotadi; soʻm / $ kassadan toʻlov; ortiqcha — soʻmda rad; valyuta faqat qarz 0 da', async run() {
      await withWorld(async ({ pg, client }) => {
        const op = loadFunction('stock-debt-ops', client), cash = loadFunction('cashbox-ops', client), ld = loadFunction('app-data-load', client);
        let r = await op(post({ filial: 'f729', key: 'scur-0001', kind: 'supp_cur', payload: { supplierId: SID, currency: 'UZS' } }, 't-kas'));
        assert.equal(r.statusCode, 400); assert.match(body(r).error, /qarz 0/);
        r = await op(post({ filial: 'f729', key: 'scur-0002', kind: 'supp_cur', payload: { supplierId: SUZ, currency: 'EUR' } }, 't-kas'));
        assert.equal(r.statusCode, 400);
        r = await op(post({ filial: 'f729', key: 'scur-0003', kind: 'supp_cur', payload: { supplierId: SUZ, currency: 'UZS' } }, 't-kas'));
        assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).currency, 'UZS');
        // kirim: 100 $ × 12 000 = 1 200 000 so'm
        r = await op(post({ filial: 'f729', key: 'kir-uzs-1', kind: 'batches_create', payload: { reason: 'kirim', kirimRef: 'K-U1',
          supplier: { id: SUZ, goodsUsd: 100, givenUsd: 0 }, batches: [{ localId: 'ku1', pid: 104, qty: 10, costUsd: 10 }] } }, 't-kas'));
        assert.equal(r.statusCode, 200, r.body);
        assert.equal(await sUzs(pg), 1200000);
        assert.deepEqual(body(r).authority.suppliers[String(SUZ)].debtCur, 'UZS');
        // kurs o'zgardi — so'mdagi qarz o'zgarmaydi; so'm kassadan 500 000 → 700 000
        await setRate(pg, 12500);
        r = await pay(cash, 'sp-uzs-1', 1, 500000);
        assert.equal(r.statusCode, 200, r.body);
        assert.equal(body(r).supplierDebtUzs, 700000); assert.equal(body(r).supplierDebtCur, 'UZS');
        assert.equal(await sUzs(pg), 700000); assert.equal(await supp(pg, SUZ), 56, '$ aksi — bugungi kursda');
        r = await pay(cash, 'sp-uzs-1', 1, 500000); assert.equal(r.statusCode, 200); assert.equal(await sUzs(pg), 700000, 'takror — bir marta');
        // $ kassadan 40 $ × 12 500 = 500 000
        r = await pay(cash, 'sp-uzs-2', 3, 40); assert.equal(r.statusCode, 200, r.body); assert.equal(await sUzs(pg), 200000);
        // ortiqcha — so'mda rad (kurs bo'yicha $ da emas)
        r = await pay(cash, 'sp-uzs-3', 1, 200100); assert.equal(r.statusCode, 400); assert.match(body(r).error, /oshib ketdi/);
        assert.equal(await sUzs(pg), 200000);
        // bo'linmaydigan kurs: 12 650 — so'm kassadan 123 457 so'm aniq ayiriladi
        await setRate(pg, 12650);
        r = await pay(cash, 'sp-uzs-5', 1, 123457); assert.equal(r.statusCode, 200, r.body); assert.equal(await sUzs(pg), 76543, 'soʻmma-soʻm, yaxlitlash xatosisiz');
        r = await pay(cash, 'sp-uzs-4', 1, 76543); assert.equal(r.statusCode, 200, r.body); assert.equal(await sUzs(pg), 0); assert.equal(await supp(pg, SUZ), 0);
        // jurnal: so'mdagi o'zgarishlar yig'indisi = qoldiq
        assert.equal(await num(pg, `select coalesce(sum(delta_uzs),0) v from supplier_debt_ledger where filial='f729' and supplier_local_id=$1`, [SUZ]), 0);
        // qo'lda tuzatish ($ ekvivalenti yuboriladi) — so'mda
        r = await op(post({ filial: 'f729', key: 'sset-uzs-1', kind: 'supp_set', payload: { supplierId: SUZ, debt: 80 } }, 't-kas'));
        assert.equal(r.statusCode, 200, r.body); assert.equal(await sUzs(pg), 1012000);
        // yuklash: brauzerga valyuta va so'mdagi qarz
        r = await ld(post({}, 't-kas')); assert.equal(r.statusCode, 200, r.body);
        const sp = body(r).data.branchStore.f729.suppliers.find(x => x.id === SUZ);
        assert.deepEqual([sp.debtCur, sp.debtUzs, sp.debt], ['UZS', 1012000, 80]);
        // $ dagi ta'minotchi — avvalgidek
        r = await pay(cash, 'sp-usd-1', 3, 30, SID); assert.equal(r.statusCode, 200, r.body); assert.equal(await supp(pg, SID), 70);
        assert.equal(body(r).supplierDebtCur, 'USD');
        await consistent(pg);
      });
    } },
    { name: 'brauzer: roʻyxatda soʻm, toʻlov oynasi soʻmda (ortiqcha — rad), tahrirda valyuta', async run() {
      const { openPage } = require('./p4-responsive.test.js')._helpers;
      const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        const r = await page.evaluate(async () => {
          closeModal(); CUR.usdUzs = 12500; save = async () => true;
          S.cashboxes = [{ id: 1, name: "Naqd So'm", cur: 'UZS', type: 'cash', bal: 5000000, icon: '💵' }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 900, icon: '💲' }];
          S.suppliers = [{ id: 11, name: 'Mahalliy', debt: 80, debtCur: 'UZS', debtUzs: 1000000 }, { id: 12, name: 'Xitoy', debt: 50 }];
          go('taminotchilar'); const out = {};
          out.rows = [...document.querySelectorAll('#tm-table .fw-pc-v b')].map(b => b.textContent);
          openPaySupplierDebt(11); await new Promise(r => setTimeout(r, 50));
          out.amt = document.getElementById('psd-a').value; out.kpi = document.querySelector('.modal-body').textContent.includes('1 000 000') || document.querySelector('.modal-body').textContent.includes('1,000,000');
          window.__t = []; const ot = toast; toast = (m) => window.__t.push(m);
          document.getElementById('psd-a').value = '1000002'; await paySupplierDebt(11); out.over = window.__t.join('|');
          toast = ot; closeModal();
          editSupplier(11); out.curDis = document.querySelectorAll('#es-cur button[disabled]').length; out.unit = document.getElementById('es-debt-u').textContent; closeModal();
          editSupplier(12); out.cur2 = document.getElementById('es-cur').dataset.v; closeModal();
          return out;
        });
        assert.match(r.rows[0], /1.000.000/); assert.equal(r.rows[1], '$50.00');
        assert.equal(r.amt, '1000000'); assert.equal(r.kpi, true);
        assert.match(r.over, /oshib ketdi/);
        assert.equal(r.curDis, 2, 'qarz bor — valyuta oʻzgarmaydi'); assert.equal(r.unit, "so'm");
        assert.equal(r.cur2, 'USD');
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
  ],
};
