// F4b testlari uchun "dunyo": HAQIQIY PostgreSQL (PGlite) + haqiqiy server funksiyalari.
// Tartib productiondagi kabi: 23-26 qo'llangan baza → ilova ma'lumoti (JSON) → 24 (kassa ochilishi)
// → 27-migratsiya (qarz va ombor JSON'dan BIR MARTA ko'chiriladi). Shundan keyin qarz/qoldiq faqat
// server amallari orqali o'zgaradi.
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('../p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./pg-supabase');

const ROOT = path.join(__dirname, '..', '..');
const MARK = '\n-- ────────────────────────────────────────────────────────────────────\n-- 11. 27-migratsiya';

const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger',
  'sales', 'batches', 'customer_balances', 'supplier_balances', 'customer_debt_payments', 'supplier_payments', 'idempotency_keys',
  'home_withdrawals', 'ledger_ops', 'stock_ledger', 'customer_debt_ledger', 'supplier_debt_ledger', 'dealers', 'dealer_payments'];

const BOXES = [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 5000000 }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 1000 }];

function schemaParts() {
  const full = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
  const i = full.indexOf(MARK);
  if (i < 0) throw new Error('schema.sql: 27-migratsiya bo\'limi topilmadi');
  return { pre27: full.slice(0, i), mig27: fs.readFileSync(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'), 'utf8') };
}

// branches: { f729: {customers, suppliers, batches, sales, cashboxes} } ; opts.apply27 (standart true)
async function makeWorld(branches, opts = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  const { pre27, mig27 } = schemaParts();
  await pg.exec(pre27);
  const store = {};
  for (const [k, v] of Object.entries(branches)) store[k] = { cashboxes: BOXES, customers: [], suppliers: [], batches: [], sales: [], expenses: [], ...v };
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`,
    [JSON.stringify({ settings: { usdUzs: opts.rate || 12000 }, branchDebt: opts.branchDebt || {}, branchStore: store })]);
  for (const [k, v] of Object.entries(store)) await pg.query(`insert into app_data_branches (branch_key, data) values ($1, $2::jsonb)`, [k, JSON.stringify(v)]);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase-migration-24-v11-cash-authority.sql'), 'utf8'));   // kassa ochilishi (JSON'dan)
  if (opts.apply27 !== false) await pg.exec(mig27);
  return pg;
}

const STAFF = [
  { id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
  { id: 7, auth_user_id: 'u-kas', role: 'sotuvchi', active: true, filial: 'f729', name: 'Kassir', login: 'kas' },
  { id: 8, auth_user_id: 'u-kas2', role: 'sotuvchi', active: true, filial: 'f729', name: 'Kassir 2', login: 'kas2' },
  { id: 9, auth_user_id: 'u-man', role: 'sotuvchi', active: true, filial: 'f729', name: 'Menejer', login: 'man' },
  { id: 10, auth_user_id: 'u-other', role: 'sotuvchi', active: true, filial: 'f702', name: 'Boshqa filial', login: 'oth' },
];
const ROLE_PERMS = {
  r_kas: ['savdo.create', 'mijozlar.debt_payment', 'kassalar.transact'],
  r_man: ['savdo.create', 'savdo.edit', 'qaytarish.create', 'mijozlar.debt_payment', 'mijozlar.edit', 'taminotchilar.edit', 'kassalar.transact', 'kirim.create', 'ombor.edit', 'dillerlar.manage'],
};
const STAFF_ROLES = [{ staff_id: 7, role_id: 'r_kas' }, { staff_id: 8, role_id: 'r_kas' }, { staff_id: 9, role_id: 'r_man' }, { staff_id: 10, role_id: 'r_man' }];

function makeClient(pg) {
  return makePgSupabase(pg, {
    pgTables: PG_TABLES,
    users: { 't-admin': { id: 'u-admin' }, 't-kas': { id: 'u-kas' }, 't-kas2': { id: 'u-kas2' }, 't-man': { id: 'u-man' }, 't-other': { id: 'u-other' } },
    memTables: {
      staff: STAFF.map(s => ({ ...s })), staff_roles: STAFF_ROLES.map(s => ({ ...s })), staff_audit_log: [],
      role_permissions: Object.entries(ROLE_PERMS).flatMap(([r, ks]) => ks.map(k => ({ role_id: r, permission_id: k, permissions: { key: k } }))),
    },
  });
}

module.exports = { makeWorld, makeClient, PG_TABLES, BOXES, schemaParts };
