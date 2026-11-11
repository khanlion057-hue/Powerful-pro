// P21 — v23.4: FIRMA KASSASI — ASOSIY KASSA (28-migratsiya), HAQIQIY PostgreSQL (PGlite) + haqiqiy server funksiyasi.
//  • Kunlik yopish («uyga berish»): filial kassasi → Firma kassa (pul tizimdan chiqmaydi), ruxsat, takror, valyuta.
//  • Firma kassasidan xarajat: ruxsat (Firma kassa + xarajat), mablag' yetmasa — rad, umumiy bekor qilish rad,
//    faqat Xarajatlar orqali bekor qilish.
//  • Ta'minotchi qarzini Firma kassasidan to'lash: kassa + qarz bitta tranzaksiyada, qarzdan ortiq — rad, takror.
//  • 28-migratsiyasiz — aniq 409 (jimgina yozuv yo'q).
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger',
  'sales', 'batches', 'customer_balances', 'supplier_balances', 'customer_debt_payments', 'supplier_payments', 'home_withdrawals',
  'dealer_payments', 'dealers', 'cashbox_transactions', 'ledger_ops', 'customer_debt_ledger', 'supplier_debt_ledger', 'stock_ledger'];
const SID = 1759300000000456;
const PERMS = {
  'r-kas': ['kassalar.transact', 'xarajatlar.create'],                       // filial kassiri
  'r-fk':  ['firma_kassa.view', 'firma_kassa.transact'],                      // faqat Firma kassa
  'r-fkx': ['firma_kassa.view', 'firma_kassa.transact', 'xarajatlar.create', 'taminotchilar.edit'],
  'r-no':  ['mijozlar.view'],
};
const USERS = { 't-admin': { id: 'u-admin' }, 't-kas': { id: 'u-kas' }, 't-fk': { id: 'u-fk' }, 't-fkx': { id: 'u-fkx' }, 't-no': { id: 'u-no' } };
const BOXES = [
  { id: 1, name: "Naqd So'm", cur: 'UZS', type: 'cash', bal: 1200000 },
  { id: 3, name: 'Dollar ($)', cur: 'USD', type: 'usd', bal: 300 },
  { id: 6, name: 'Yuan', cur: 'CNY', type: 'cny', bal: 100 },
];

async function world() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  await pg.exec(SCHEMA);
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({
    settings: { usdUzs: 12000 }, branchStore: { f729: { cashboxes: BOXES } } })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('f729', $1::jsonb)`,
    [JSON.stringify({ cashboxes: BOXES, suppliers: [{ id: SID, name: 'Xitoy MChJ', debt: 120 }], customers: [], batches: [], sales: [] })]);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase-migration-24-v11-cash-authority.sql'), 'utf8'));   // JSON qoldiq → kassa jurnali
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'), 'utf8'));  // JSON qarz → qarz jurnali
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase-migration-28-firma-kassa-asosiy.sql'), 'utf8'));    // takroriy — xavfsiz
  await pg.query(`select public._fk_cash_move('USD','in',1000,'deposit', p_idem_key => 'seed-usd')`);
  const memTables = {
    staff: [
      { id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
      { id: 7, auth_user_id: 'u-kas', role: 'sotuvchi', active: true, filial: 'f729', name: 'Kassir 729', login: 'kas' },
      { id: 8, auth_user_id: 'u-fk', role: 'sotuvchi', active: true, filial: 'f729', name: 'Moliyachi', login: 'fk' },
      { id: 9, auth_user_id: 'u-fkx', role: 'sotuvchi', active: true, filial: 'f729', name: 'Bosh hisobchi', login: 'fkx' },
      { id: 10, auth_user_id: 'u-no', role: 'sotuvchi', active: true, filial: 'f729', name: 'Kuzatuvchi', login: 'no' },
    ],
    staff_roles: [{ staff_id: 7, role_id: 'r-kas' }, { staff_id: 8, role_id: 'r-fk' }, { staff_id: 9, role_id: 'r-fkx' }, { staff_id: 10, role_id: 'r-no' }],
    role_permissions: Object.entries(PERMS).flatMap(([rid, keys]) => keys.map(k => ({ role_id: rid, permission_id: k, permissions: { key: k } }))),
    staff_audit_log: [], idempotency_keys: [],
  };
  return { pg, client: makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: USERS }) };
}
async function withWorld(fn) {
  const w = await world();
  try { await fn(w); } finally { unloadFunctions(); await w.pg.close(); }
}
const body = (r) => JSON.parse(r.body);
const num = async (pg, sql, params) => +(((await pg.query(sql, params)).rows[0] || {}).v ?? NaN);
const boxBal = (pg, b) => num(pg, `select balance v from cashbox_balances where filial='f729' and box_local_id=$1`, [b]);
const fkBal = (pg, c) => num(pg, `select coalesce((select balance from firma_kassa_balance where currency=$1),0) v`, [c]);
const suppDebt = (pg) => num(pg, `select debt v from supplier_balances where filial='f729' and supplier_local_id=$1`, [SID]);

// ── 1. Kunlik yopish: filial kassasi → Firma kassa ──
async function testDailyCloseToFirma() {
  await withWorld(async ({ pg, client }) => {
    const h = loadFunction('firma-kassa', client);
    assert.equal(await boxBal(pg, 3), 300); assert.equal(await fkBal(pg, 'USD'), 1000);
    let r = await h(post({ action: 'daily_close', currency: 'USD', amount: 100, boxId: 3, note: 'kech', idemKey: 'dc1-3' }, 't-kas'));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(+body(r).transfer.branchBalance, 200);
    assert.equal(await boxBal(pg, 3), 200, 'filial kassasi kamaydi'); assert.equal(await fkBal(pg, 'USD'), 1100, 'Firma kassasi ko\'paydi — pul tizimda qoldi');
    const row = (await pg.query(`select op_type, filial, note from firma_kassa_ledger where op_type='branch_in' order by id desc limit 1`)).rows[0];
    assert.equal(row.filial, 'f729'); assert.match(row.note, /Kunlik yopish/);
    r = await h(post({ action: 'daily_close', currency: 'USD', amount: 100, boxId: 3, idemKey: 'dc1-3' }, 't-kas'));
    assert.equal(r.statusCode, 200); assert.equal(await boxBal(pg, 3), 200, 'takror — ikkinchi marta yechilmadi'); assert.equal(await fkBal(pg, 'USD'), 1100);
    // so'm kassasi — Firma kassaning so'm qismiga
    r = await h(post({ action: 'daily_close', currency: 'UZS', amount: 200000, boxId: 1, idemKey: 'dc1-1' }, 't-kas'));
    assert.equal(r.statusCode, 200); assert.equal(await boxBal(pg, 1), 1000000); assert.equal(await fkBal(pg, 'UZS'), 200000);
    // qoldiqdan ortiq, valyuta mos emas, CNY — rad, hech narsa o'zgarmaydi
    r = await h(post({ action: 'daily_close', currency: 'USD', amount: 500, boxId: 3, idemKey: 'dc2-3' }, 't-kas'));
    assert.equal(r.statusCode, 400); assert.equal(await boxBal(pg, 3), 200);
    r = await h(post({ action: 'daily_close', currency: 'USD', amount: 10, boxId: 1, idemKey: 'dc2-1' }, 't-kas'));
    assert.equal(r.statusCode, 400, 'kassa valyutasi mos emas');
    r = await h(post({ action: 'daily_close', currency: 'CNY', amount: 10, boxId: 6, idemKey: 'dc2-6' }, 't-kas'));
    assert.equal(r.statusCode, 400, 'CNY — Firma kassa valyutasi emas');
    // kassir boshqa filialni ko'rsatsa ham — faqat o'z filiali (f729) ishlatiladi
    r = await h(post({ action: 'daily_close', currency: 'USD', amount: 5, boxId: 3, filial: 'baza', idemKey: 'dc3-3' }, 't-kas'));
    assert.equal(r.statusCode, 200); assert.equal(await boxBal(pg, 3), 195);
    // huquqsiz xodim — rad
    r = await h(post({ action: 'daily_close', currency: 'USD', amount: 5, boxId: 3, idemKey: 'dc4-3' }, 't-no'));
    assert.equal(r.statusCode, 403); assert.equal(await boxBal(pg, 3), 195);
  });
}

// ── 2. Firma kassasidan xarajat ──
async function testExpenseFromFirma() {
  await withWorld(async ({ pg, client }) => {
    const h = loadFunction('firma-kassa', client);
    let r = await h(post({ action: 'expense', currency: 'USD', amount: 40, refId: 'e1', idemKey: 'ex1', note: 'Ijara' }, 't-fk'));
    assert.equal(r.statusCode, 403, 'faqat Firma kassa huquqi yetmaydi — xarajat huquqi ham kerak');
    r = await h(post({ action: 'expense', currency: 'USD', amount: 40, refId: 'e1', idemKey: 'ex1', note: 'Ijara' }, 't-kas'));
    assert.equal(r.statusCode, 403, 'xarajat huquqi bor, Firma kassa huquqi yo\'q — rad');
    r = await h(post({ action: 'expense', currency: 'USD', amount: 40, refId: 'e1', idemKey: 'ex1', note: 'Ijara' }, 't-fkx'));
    assert.equal(r.statusCode, 200, r.body);
    const id = body(r).entry.id;
    assert.equal(await fkBal(pg, 'USD'), 960);
    const row = (await pg.query(`select op_type, source_type, ref_type, ref_id from firma_kassa_ledger where id=$1`, [id])).rows[0];
    assert.deepEqual(row, { op_type: 'expense', source_type: 'expense', ref_type: 'expense', ref_id: 'e1' });
    r = await h(post({ action: 'expense', currency: 'USD', amount: 40, refId: 'e1', idemKey: 'ex1' }, 't-fkx'));
    assert.equal(await fkBal(pg, 'USD'), 960, 'takror — ikkinchi marta yechilmadi');
    r = await h(post({ action: 'expense', currency: 'USD', amount: 5000, refId: 'e2', idemKey: 'ex2' }, 't-fkx'));
    assert.equal(r.statusCode, 400, "mablag' yetmaydi"); assert.equal(await fkBal(pg, 'USD'), 960);
    // hamkor kirimi — Firma kassaga kirim (deposit, manba partner_deposit)
    r = await h(post({ action: 'expense', dir: 'in', currency: 'USD', amount: 25, refId: 'e3', idemKey: 'ex3', partnerId: '2', cpName: 'Nodir' }, 't-fkx'));
    assert.equal(r.statusCode, 200); assert.equal(await fkBal(pg, 'USD'), 985);
    assert.equal(((await pg.query(`select source_type s from firma_kassa_ledger where ref_id='e3'`)).rows[0]).s, 'partner_deposit');
    // umumiy «bekor qilish» (admin) — rad; Xarajatlar orqali — kassa qaytadi
    r = await h(post({ action: 'reverse', entryId: id, idemKey: 'rv1' }, 't-admin'));
    assert.equal(r.statusCode, 400); assert.match(body(r).error, /Xarajatlar/); assert.equal(await fkBal(pg, 'USD'), 985);
    r = await h(post({ action: 'expense_reverse', entryId: id, idemKey: 'xr1' }, 't-kas'));
    assert.equal(r.statusCode, 403);
    r = await h(post({ action: 'expense_reverse', entryId: id, idemKey: 'xr1' }, 't-fkx'));
    assert.equal(r.statusCode, 200, r.body); assert.equal(await fkBal(pg, 'USD'), 1025);
    r = await h(post({ action: 'expense_reverse', entryId: id, idemKey: 'xr2' }, 't-fkx'));
    assert.equal(r.statusCode, 400, 'ikkinchi marta bekor qilib bo\'lmaydi'); assert.equal(await fkBal(pg, 'USD'), 1025);
  });
}

// ── 3. Ta'minotchi qarzini Firma kassasidan to'lash ──
async function testSupplierPayFromFirma() {
  await withWorld(async ({ pg, client }) => {
    const h = loadFunction('firma-kassa', client);
    assert.equal(await suppDebt(pg), 120);
    let r = await h(post({ action: 'supplier_pay', suppId: SID, currency: 'USD', amount: 50, idemKey: 'sp1', cpName: 'Xitoy' }, 't-fk'));
    assert.equal(r.statusCode, 403, "ta'minotchi huquqisiz — rad"); assert.equal(await suppDebt(pg), 120);
    r = await h(post({ action: 'supplier_pay', suppId: SID, currency: 'USD', amount: 50, idemKey: 'sp1', cpName: 'Xitoy' }, 't-fkx'));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(+body(r).payment.supplierDebt, 70); assert.equal(await suppDebt(pg), 70); assert.equal(await fkBal(pg, 'USD'), 950);
    r = await h(post({ action: 'supplier_pay', suppId: SID, currency: 'USD', amount: 50, idemKey: 'sp1' }, 't-fkx'));
    assert.equal(body(r).payment.replay, true); assert.equal(await suppDebt(pg), 70); assert.equal(await fkBal(pg, 'USD'), 950);
    r = await h(post({ action: 'supplier_pay', suppId: SID, currency: 'USD', amount: 71, idemKey: 'sp2' }, 't-fkx'));
    assert.equal(r.statusCode, 400, 'qarzdan ortiq'); assert.match(body(r).error, /qarzidan/);
    assert.equal(await suppDebt(pg), 70); assert.equal(await fkBal(pg, 'USD'), 950);
    // so'mda: Firma kassaning so'm qismi yetmaydi — qarz ham o'zgarmaydi
    r = await h(post({ action: 'supplier_pay', suppId: SID, currency: 'UZS', amount: 120000, idemKey: 'sp3' }, 't-fkx'));
    assert.equal(r.statusCode, 400); assert.equal(await suppDebt(pg), 70);
    await pg.query(`select public._fk_cash_move('UZS','in',500000,'deposit', p_idem_key => 'seed-uzs')`);
    r = await h(post({ action: 'supplier_pay', suppId: SID, currency: 'UZS', amount: 120000, idemKey: 'sp3' }, 't-fkx'));
    assert.equal(r.statusCode, 200); assert.equal(await suppDebt(pg), 60, "120 000 so'm = 10$"); assert.equal(await fkBal(pg, 'UZS'), 380000);
    // umumiy «bekor qilish» bilan qaytarib bo'lmaydi (qarz jurnali bilan bog'langan)
    const id = +(await pg.query(`select id from firma_kassa_ledger where op_type='supplier_payment' order by id limit 1`)).rows[0].id;
    r = await h(post({ action: 'reverse', entryId: id, idemKey: 'rv-sp' }, 't-admin'));
    assert.equal(r.statusCode, 400); assert.equal(await suppDebt(pg), 60);
  });
}

// ── 4. 28-migratsiyasiz — aniq 409 ──
async function testWithout28() {
  await withWorld(async ({ pg, client }) => {
    await pg.exec(`drop function public.firma_supplier_pay(text, bigint, text, numeric, text, text, text, bigint, text);
      drop function public.firma_kassa_reverse_expense(bigint, text, text, bigint, text);`);
    await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase-migration-25-v23-hardening.sql'), 'utf8'));   // 28 dan oldingi cheklovlar
    const h = loadFunction('firma-kassa', client);
    let r = await h(post({ action: 'supplier_pay', suppId: SID, currency: 'USD', amount: 5, idemKey: 'n1' }, 't-fkx'));
    assert.equal(r.statusCode, 409); assert.match(body(r).error, /28-migratsiya/);
    r = await h(post({ action: 'expense', currency: 'USD', amount: 5, refId: 'n2', idemKey: 'n2' }, 't-fkx'));
    assert.equal(r.statusCode, 409); assert.match(body(r).error, /28-migratsiya/);
    r = await h(post({ action: 'expense_reverse', entryId: 1, idemKey: 'n3' }, 't-fkx'));
    assert.equal(r.statusCode, 409);
    assert.equal(await suppDebt(pg), 120); assert.equal(await fkBal(pg, 'USD'), 1000);
  });
}

module.exports = {
  name: "P21 — v23.4: Firma kassasi asosiy kassa (kunlik yopish, xarajat, ta'minotchi to'lovi) — haqiqiy PostgreSQL",
  cases: [
    { name: "Kunlik yopish: filial kassasi → Firma kassa; takror, valyuta, qoldiq, filial chegarasi, ruxsat", run: testDailyCloseToFirma },
    { name: "Firma kassasidan xarajat: ikki ruxsat, yetmasa rad, takror, faqat Xarajatlar orqali bekor qilish", run: testExpenseFromFirma },
    { name: "Ta'minotchi qarzi Firma kassasidan: kassa+qarz bitta tranzaksiya, qarzdan ortiq rad, so'm kursi, takror", run: testSupplierPayFromFirma },
    { name: "28-migratsiyasiz — aniq 409, hech narsa yozilmaydi", run: testWithout28 },
  ],
};
