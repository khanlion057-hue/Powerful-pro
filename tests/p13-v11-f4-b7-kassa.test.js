// P13 — v11 FINAL P1 GATE: F4 (filial kassa qoldig'i — SERVER haqiqiy manba) va
// B7 (filial kassasi → Firma kassa + filial qarzi — ATOMIK).
//
// Uch qatlam, hammasi HAQIQIY kod bilan:
//  1) SERVER + BAZA: netlify/functions/*.js o'zgarishsiz, pul jadvallari va RPC'lar —
//     HAQIQIY PostgreSQL (PGlite) da (tests/helpers/pg-supabase.js): qulflash, CHECK,
//     trigger, tranzaksiya, idempotency — haqiqiy. Avtorizatsiya jadvallari — in-memory.
//  2) BRAUZER: js/shared.js + js/main.js haqiqiy Chromium'da (server javobi — route).
//  3) Haqiqiy ko'p-ulanishli PostgreSQL 16 bilan parallel sinov — alohida dalil skripti
//     (tests/evidence/f4-b7-real-postgres.js), chunki u lokal PostgreSQL talab qiladi.
//
// Bu testlar v9 kodida FAIL bo'ladi (brauzer yuborgan qoldiq saqlanadi, cashbox-ops /
// firma-kassa branch_pay yo'q, "Bazaga to'lov" brauzerda hisoblanadi).
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
// Supabase muhitining minimal nusxasi (rollar, auth/storage sxemalari) — P8 bilan bir xil
const PRELUDE = `
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema extensions; create schema auth; create schema storage;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text);
alter table storage.objects enable row level security;`;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');
const { loadApp } = require('./helpers/load-app');

const ROOT = path.join(__dirname, '..');
const MIG24_PATH = path.join(ROOT, 'supabase-migration-24-v11-cash-authority.sql');
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger',
  'sales', 'batches', 'customer_balances', 'supplier_balances', 'ledger_ops', 'customer_debt_ledger', 'supplier_debt_ledger', 'stock_ledger'];

const PERMS = {
  'r-kas': ['kassalar.transact', 'xarajatlar.create', 'mijozlar.debt_payment', 'savdo.create'],
  'r-sel': ['savdo.create'],
};
const USERS = { 't-admin': { id: 'u-admin' }, 't-kas': { id: 'u-kas' }, 't-sel': { id: 'u-sel' } };
const BOXES = [
  { id: 1, name: "Naqd So'm", icon: '💵', cur: 'UZS', type: 'cash', bal: 1200000 },
  { id: 2, name: 'Karta', icon: '💳', cur: 'UZS', type: 'card', bal: 0 },
  { id: 3, name: 'Dollar ($)', icon: '💲', cur: 'USD', type: 'usd', bal: 300 },
  { id: 4, name: 'Diller kassasi', icon: '🚚', cur: 'USD', type: 'dealer', bal: 0 },
];

async function world() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8'));
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12000 }, branchDebt: { f729: 500 },
    branchStore: { f729: { cashboxes: BOXES }, baza: { cashboxes: [{ ...BOXES[2], bal: 1000 }] } } })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('f729', $1::jsonb), ('baza', $2::jsonb)`,
    [JSON.stringify({ cashboxes: BOXES, sales: [], cashTxns: [] }), JSON.stringify({ cashboxes: [{ ...BOXES[2], bal: 1000 }] })]);
  // Hozirgi JSON qoldiqlari bazaga ko'chiriladi (24-migratsiya "opening" bosqichi; takroriy — xavfsiz)
  if (fs.existsSync(MIG24_PATH)) await pg.exec(fs.readFileSync(MIG24_PATH, 'utf8'));
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'), 'utf8'));   // v23.2: JSON → baza (opening)
  const memTables = {
    staff: [
      { id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
      { id: 7, auth_user_id: 'u-kas', role: 'sotuvchi', active: true, filial: 'f729', name: 'Kassir 729', login: 'kas' },
      { id: 8, auth_user_id: 'u-sel', role: 'sotuvchi', active: true, filial: 'f729', name: 'Sotuvchi 729', login: 'sel' },
    ],
    staff_roles: [{ staff_id: 7, role_id: 'r-kas' }, { staff_id: 8, role_id: 'r-sel' }],
    role_permissions: Object.entries(PERMS).flatMap(([rid, keys]) => keys.map(k => ({ role_id: rid, permission_id: k, permissions: { key: k } }))),
    staff_audit_log: [], idempotency_keys: [],
  };
  const client = makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: USERS });
  return { pg, client };
}
const body = (r) => JSON.parse(r.body);
const num = async (pg, sql, params) => +(((await pg.query(sql, params)).rows[0] || {}).v ?? NaN);
const boxBal = (pg, f, b) => num(pg, `select balance v from cashbox_balances where filial=$1 and box_local_id=$2`, [f, b]);
const ledgerCount = (pg, f) => num(pg, `select count(*)::int v from cashbox_ledger where filial=$1`, [f]);
const debtOf = (pg, f) => num(pg, `select (data->'branchDebt'->>$1)::numeric v from app_data where id='main'`, [f]);
const fkBal = (pg, c) => num(pg, `select balance v from firma_kassa_balance where currency=$1`, [c]);
const ops = (key, kind, list, extra = {}) => ({ filial: 'f729', key, kind, ops: list, ...extra });

async function withWorld(fn) {
  const w = await world();
  try { await fn(w); } finally { unloadFunctions(); await w.pg.close(); }
}

// ── F4-1: normal amal — server bajaradi, javobda bazadagi qoldiq ──────────
async function testF4NormalOperation() {
  await withWorld(async ({ pg, client }) => {
    const h = loadFunction('cashbox-ops', client);
    const r = await h(post(ops('f4-normal-1', 'manual_out', [{ box: 1, dir: 'out', amount: 200000, note: 'Ijara' }]), 't-kas'));
    assert.equal(r.statusCode, 200, JSON.stringify(body(r)));
    const b = body(r);
    assert.equal(b.authority, true, 'server haqiqiy manba (24-migratsiya qo\'llangan)');
    assert.equal(b.balances['1'], 1000000, "javobda bazadagi haqiqiy qoldiq: 1 200 000 − 200 000");
    assert.equal(await boxBal(pg, 'f729', 1), 1000000, 'bazada ham shu qoldiq');
    const row = (await pg.query(`select direction, amount::numeric a, balance_after::numeric b, op_kind, staff_name, note from cashbox_ledger where filial='f729' and op_kind='manual_out'`)).rows;
    assert.deepEqual(row.map(x => [x.direction, +x.a, +x.b, x.staff_name, x.note]), [['out', 200000, 1000000, 'Kassir 729', 'Ijara']], 'jurnalda kim, qancha, qoldiq');
  });
}

// ── F4-2: brauzer boshqa qoldiq yuborsa — rad etiladi (bazadagi qiymat qoladi) ──
async function testF4BrowserBalanceIgnored() {
  await withWorld(async ({ pg, client }) => {
    let h = loadFunction('app-data-branch-save', client);
    const tampered = BOXES.map(b => ({ ...b, bal: b.id === 1 ? 999999999 : b.bal + 5000 }));
    let r = await h(post({ branchKey: 'f729', data: { cashboxes: tampered, sales: [] } }, 't-kas'));
    assert.equal(r.statusCode, 200);
    const stored = (await pg.query(`select data->'cashboxes' c from app_data_branches where branch_key='f729'`)).rows[0].c;
    assert.deepEqual(stored.map(b => [b.id, +b.bal]), [[1, 1200000], [2, 0], [3, 300], [4, 0]], "JSON'ga bazadagi qoldiq yozildi, brauzerniki emas");
    assert.deepEqual(body(r).cashAuthority.cashboxes.map(b => +b.bal), [1200000, 0, 300, 0], 'javobda haqiqiy qoldiq (brauzer o\'zini tuzatadi)');
    assert.equal(await boxBal(pg, 'f729', 1), 1200000, 'bazadagi qoldiq o\'zgarmadi');
    assert.ok(client.mem.db.staff_audit_log.some(l => l.action === 'cash_balance_override_ignored'), 'urinish xavfsizlik jurnaliga yozildi');
    // Admin ham (app-data-save, branchStore orqali) qoldiqni yozib qo'ya olmaydi
    h = loadFunction('app-data-save', client);
    r = await h(post({ data: { branchStore: { f729: { cashboxes: BOXES.map(b => ({ ...b, bal: 777777 })) } } } }, 't-admin'));
    assert.equal(r.statusCode, 200);
    const s2 = (await pg.query(`select data->'cashboxes' c from app_data_branches where branch_key='f729'`)).rows[0].c;
    assert.deepEqual(s2.map(b => +b.bal), [1200000, 0, 300, 0], 'admin yuborgan qoldiq ham e\'tiborsiz');
    // Qoldig'i bor kassani ro'yxatdan o'chirib "yashirish" mumkin emas
    h = loadFunction('app-data-branch-save', client);
    await h(post({ branchKey: 'f729', data: { cashboxes: BOXES.filter(b => b.id !== 1) } }, 't-admin'));
    const s3 = (await pg.query(`select data->'cashboxes' c from app_data_branches where branch_key='f729'`)).rows[0].c;
    assert.ok(s3.some(b => b.id === 1 && +b.bal === 1200000), "qoldig'i bor kassa o'chirilmadi");
  });
}

// ── F4-3: juda katta qoldiq / qiymat yaratish — rad etiladi ──────────────
async function testF4HugeBalanceDenied() {
  await withWorld(async ({ pg, client }) => {
    const h = loadFunction('cashbox-ops', client);
    const before = await ledgerCount(pg, 'f729');
    let r = await h(post(ops('f4-huge-1', 'manual_in', [{ box: 3, dir: 'in', amount: 1e13 }]), 't-kas'));
    assert.equal(r.statusCode, 400, 'limitdan katta summa rad etiladi');
    r = await h(post(ops('f4-huge-2', 'move', [{ box: 1, dir: 'out', amount: 1000 }, { box: 3, dir: 'in', amount: 1000 }]), 't-kas'));
    assert.equal(r.statusCode, 400, "1000 so'm → 1000 $ (qiymat yaratish) rad etiladi");
    assert.match(body(r).error, /teng emas/);
    r = await h(post(ops('f4-huge-3', 'exchange', [{ box: 1, dir: 'out', amount: 12000 }, { box: 3, dir: 'in', amount: 12000 }], { rate: 1 }), 't-kas'));
    assert.equal(r.statusCode, 400, 'soxta kurs (1) rad etiladi');
    const app = loadFunction('app-data-branch-save', client);
    await app(post({ branchKey: 'f729', data: { cashboxes: BOXES.map(b => ({ ...b, bal: 1e15 })) } }, 't-admin'));
    assert.equal(await boxBal(pg, 'f729', 3), 300);
    assert.equal(await ledgerCount(pg, 'f729'), before, 'hech qanday jurnal yozuvi qo\'shilmadi');
    // To'g'ri ko'chirish (kurs bo'yicha teng) — o'tadi
    r = await h(post(ops('f4-move-ok', 'move', [{ box: 1, dir: 'out', amount: 120000 }, { box: 3, dir: 'in', amount: 10 }], { rate: 12000 }), 't-kas'));
    assert.equal(r.statusCode, 200, JSON.stringify(body(r)));
    assert.deepEqual(body(r).balances, { 1: 1080000, 3: 310 });
  });
}

// ── F4-4: manfiy / manipulyatsiya qilingan qiymat — rad etiladi ──────────
async function testF4NegativeManipulated() {
  await withWorld(async ({ pg, client }) => {
    const h = loadFunction('cashbox-ops', client);
    const before = await ledgerCount(pg, 'f729');
    const cases = [
      [ops('f4-neg-1', 'manual_out', [{ box: 3, dir: 'out', amount: -50 }]), 't-kas', 400, 'manfiy summa'],
      [ops('f4-neg-2', 'manual_out', [{ box: 3, dir: 'out', amount: 'NaN' }]), 't-kas', 400, 'son emas'],
      [ops('f4-neg-3', 'manual_out', [{ box: 3, dir: 'out', amount: 301 }]), 't-kas', 400, 'qoldiqdan ortiq chiqim'],
      [ops('f4-neg-4', 'manual_in', [{ box: 3, dir: 'out', amount: 5 }]), 't-kas', 400, "'kirim' amalida chiqim harakati"],
      [ops('f4-neg-5', 'manual_in', [{ box: 99, dir: 'in', amount: 5 }]), 't-kas', 400, "yo'q kassa"],
      [ops('f4-neg-6', 'manual_in', [{ box: 3, dir: 'in', amount: 5 }]), 't-sel', 403, 'kassa huquqisiz xodim'],
      [ops('f4-neg-7', 'reset_zero', [{ box: 3, dir: 'out', amount: 300 }]), 't-kas', 403, 'tizimni 0 qilish — faqat admin'],
      [ops('x', 'manual_in', [{ box: 3, dir: 'in', amount: 5 }]), 't-kas', 400, 'yaroqsiz kalit'],
    ];
    for (const [b, tok, code, what] of cases) {
      const r = await h(post(b, tok));
      assert.equal(r.statusCode, code, `${what}: ${r.body}`);
    }
    assert.equal(await boxBal(pg, 'f729', 3), 300, 'qoldiq o\'zgarmadi');
    assert.equal(await ledgerCount(pg, 'f729'), before, 'jurnalga hech narsa yozilmadi');
    // Xodim boshqa filial (baza) nomini yuborsa ham — faqat o'z filiali (f729)
    const r = await h(post({ ...ops('f4-own-1', 'manual_in', [{ box: 3, dir: 'in', amount: 5 }]), filial: 'baza' }, 't-kas'));
    assert.equal(r.statusCode, 200); assert.equal(body(r).filial, 'f729');
    assert.equal(await boxBal(pg, 'baza', 3), 1000, "Baza kassasiga tegilmadi");
    // To'g'ridan-to'g'ri SQL (masalan eski funksiya yoki xato kod) — trigger to'sadi
    await assert.rejects(pg.query(`update cashbox_balances set balance = 1e9 where filial='f729' and box_local_id=3`), /faqat kassa jurnali/);
    await assert.rejects(pg.query(`insert into cashbox_balances (filial, box_local_id, balance) values ('f729', 50, 100)`), /faqat kassa jurnali/);
    const g = (await pg.query(`select has_table_privilege('anon','public.cashbox_ledger','select') a, has_table_privilege('authenticated','public.cashbox_balances','update') b,
      has_function_privilege('authenticated','public.cashbox_apply_ops(text,text,text,jsonb,bigint,text)','execute') c,
      has_function_privilege('anon','public.branch_firma_transfer(text,integer,text,text,numeric,text,boolean,text,text,bigint,text)','execute') d,
      (select relrowsecurity from pg_class where oid='public.cashbox_ledger'::regclass) rls`)).rows[0];
    assert.deepEqual(g, { a: false, b: false, c: false, d: false, rls: true }, 'brauzer (anon/authenticated) jadval va funksiyalarga kira olmaydi');
  });
}

// ── F4-5: ikki parallel amal — faqat to'g'ri natija ──────────────────────
async function testF4Parallel() {
  await withWorld(async ({ pg, client }) => {
    const h = loadFunction('cashbox-ops', client);
    const [a, b] = await Promise.all([
      h(post(ops('f4-par-a', 'manual_out', [{ box: 3, dir: 'out', amount: 200 }]), 't-kas')),
      h(post(ops('f4-par-b', 'manual_out', [{ box: 3, dir: 'out', amount: 200 }]), 't-kas')),
    ]);
    assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 400], "300$ dan ikki marta 200$ — faqat bittasi o'tadi");
    assert.equal(await boxBal(pg, 'f729', 3), 100, 'qoldiq 100 (manfiy emas)');
    const many = await Promise.all(Array.from({ length: 10 }, (_, i) => h(post(ops('f4-par-in-' + i, 'manual_in', [{ box: 3, dir: 'in', amount: 10 }]), 't-kas'))));
    assert.ok(many.every(r => r.statusCode === 200));
    assert.equal(await boxBal(pg, 'f729', 3), 200, "10 ta parallel kirim — hech biri yo'qolmadi");
  });
}

// ── F4-6: bir xil amal ikki marta — dublikat yo'q ────────────────────────
async function testF4Idempotent() {
  await withWorld(async ({ pg, client }) => {
    const h = loadFunction('cashbox-ops', client);
    const req = ops('f4-dup-key-1', 'exchange', [{ box: 1, dir: 'out', amount: 240000 }, { box: 3, dir: 'in', amount: 20 }], { rate: 12000 });
    const [r1, r2] = await Promise.all([h(post(req, 't-kas')), h(post(req, 't-kas'))]);
    const r3 = await h(post(req, 't-kas'));
    assert.deepEqual([r1, r2, r3].map(r => r.statusCode), [200, 200, 200]);
    assert.equal([r1, r2, r3].filter(r => body(r).replay).length, 2, 'ikkinchi va uchinchi — takror (replay)');
    assert.equal(await boxBal(pg, 'f729', 1), 960000); assert.equal(await boxBal(pg, 'f729', 3), 320);
    assert.equal(await num(pg, `select count(*)::int v from cashbox_ledger where group_key='ops:f4-dup-key-1'`), 2, 'jurnalda faqat 2 yozuv (chiqim + kirim)');
    const r4 = await h(post({ ...req, ops: [{ box: 1, dir: 'out', amount: 1 }, { box: 2, dir: 'in', amount: 1 }] }, 't-kas'));
    assert.equal(r4.statusCode, 400, 'kalitni boshqa amal uchun qayta ishlatish rad etiladi');
  });
}

// ── F4-7: yakuniy qoldiq = bazadagi haqiqiy qoldiq = jurnal yig'indisi ───
async function testF4FinalEqualsDb() {
  await withWorld(async ({ pg, client }) => {
    const h = loadFunction('cashbox-ops', client);
    const seq = [
      ['s1', 'manual_in', [{ box: 3, dir: 'in', amount: 55.5 }]],
      ['s2', 'manual_out', [{ box: 1, dir: 'out', amount: 70000 }]],
      ['s3', 'move', [{ box: 1, dir: 'out', amount: 36000 }, { box: 3, dir: 'in', amount: 3 }], { rate: 12000 }],
      ['s4', 'manual_out', [{ box: 3, dir: 'out', amount: 999 }]],              // rad etiladi
      // v23: "uyga berish" — to'lov yozuvi (record) majburiy; kassa + home_withdrawals bitta tranzaksiyada
      ['s5', 'home_withdrawal', [{ box: 1, dir: 'out', amount: 100000 }, { box: 3, dir: 'out', amount: 8.5 }], { record: { note: 'kunlik' } }],
    ];
    for (const [k, kind, l, x] of seq) await h(post(ops('f4-fin-' + k, kind, l, x || {}), 't-kas'));
    assert.equal(await num(pg, `select count(*)::int v from home_withdrawals where idem_key='ops:f4-fin-s5'`), 1, "uyga berish yozuvi kassa amali bilan birga yozildi");
    // Savdo (sale-checkout-atomic) ham kassaga jurnal orqali yozadi; savdodan ortiq tushum rad etiladi
    await pg.exec(`select set_config('fw.stock_move','1',false); insert into batches (local_id, filial, pid, qty, sold, cost_usd, batch_date, status) values ('b1','f729',101,10,0,5,'2026-09-01','active'); select set_config('fw.stock_move','',false)`);
    const sale = loadFunction('sale-checkout-atomic', client);
    let r = await sale(post({ filial: 'f729', items: [{ pid: 101, qty: 2, sellUsd: 10, costUsd: 5 }], paidUsd: 20, boxPayments: [{ box_id: 3, amount_native: 20 }], inv: 'INV-77', idemKey: 'ck-f4-1' }, 't-kas'));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(+body(r).balances['3'], 370, "savdo javobida bazadagi qoldiq (350 + 20)");
    r = await sale(post({ filial: 'f729', items: [{ pid: 101, qty: 1, sellUsd: 10, costUsd: 5 }], paidUsd: 10, boxPayments: [{ box_id: 3, amount_native: 5000 }], inv: 'INV-78', idemKey: 'ck-f4-2' }, 't-kas'));
    assert.equal(r.statusCode, 400, "10$ savdoga 5000$ tushum — rad etildi");
    assert.equal(await num(pg, `select count(*)::int v from sales where inv='INV-78'`), 0, 'savdo ham yozilmadi (atomik)');
    // Har bir kassa: qoldiq = oxirgi balance_after = Σkirim − Σchiqim
    for (const box of [1, 3]) {
      const led = (await pg.query(`select direction d, amount::numeric a, balance_after::numeric b from cashbox_ledger where filial='f729' and box_local_id=$1 order by id`, [box])).rows;
      let run = 0;
      for (const x of led) { run = Math.round((run + (x.d === 'in' ? +x.a : -x.a)) * 100) / 100; assert.equal(+x.b, run, 'balance_after ketma-ket to\'g\'ri'); }
      assert.equal(await boxBal(pg, 'f729', box), run, `kassa ${box}: qoldiq = jurnal yig'indisi`);
    }
    assert.equal(await boxBal(pg, 'f729', 1), 1200000 - 70000 - 36000 - 100000);
    assert.equal(await boxBal(pg, 'f729', 3), 300 + 55.5 + 3 - 8.5 + 20);
    // Ilova yuklaganda (app-data-load) ham aynan bazadagi qoldiq ko'rinadi
    const load = loadFunction('app-data-load', client);
    const d = body(await load(post({}, 't-kas')));
    assert.equal(d.cashAuthority, true);
    assert.deepEqual(d.data.branchStore.f729.cashboxes.map(b => +b.bal), [994000, 0, 370, 0]);
  });
}

// ── B7: filial kassasi → Firma kassa + filial qarzi — atomik ─────────────
const pay = (key, boxId, currency, amount, extra = {}) => ({ action: 'branch_pay', idemKey: key, boxId, currency, amount, filial: 'f729', ...extra });

async function testB7UsdUzsRateAudit() {
  await withWorld(async ({ pg, client }) => {
    const h = loadFunction('firma-kassa', client);
    let r = await h(post(pay('b7-usd-1', 3, 'USD', 100, { note: 'Sentabr' }), 't-kas'));
    assert.equal(r.statusCode, 200, r.body);
    let t = body(r).transfer;
    assert.deepEqual([+t.debtBefore, +t.debtAfter, +t.branchBalance, +t.firmaBalance], [500, 400, 200, 100]);
    assert.equal(await debtOf(pg, 'f729'), 400, 'qarz bazada kamaydi');
    assert.equal(await boxBal(pg, 'f729', 3), 200); assert.equal(await fkBal(pg, 'USD'), 100);
    // UZS kassadan — serverdagi kurs (12 000) bo'yicha: 600 000 so'm = 50 $
    r = await h(post(pay('b7-uzs-1', 1, 'UZS', 600000), 't-kas'));
    assert.equal(r.statusCode, 200, r.body);
    t = body(r).transfer;
    assert.deepEqual([+t.amountUsd, +t.rate, +t.debtAfter], [50, 12000, 350], 'UZS → USD serverdagi kurs bo\'yicha');
    assert.equal(await fkBal(pg, 'UZS'), 600000, "Firma kassaga so'm o'z valyutasida tushdi");
    assert.equal(await boxBal(pg, 'f729', 1), 600000);
    // Audit: ikkala jurnalda bir xil kalit, kim, qarz oldin/keyin
    const cb = (await pg.query(`select op_kind, op_key, ref_type, staff_name, note from cashbox_ledger where op_kind='branch_to_firma' order by id`)).rows;
    const fk = (await pg.query(`select op_type, idem_key, counterparty_type, counterparty_id, staff_name, note from firma_kassa_ledger order by id`)).rows;
    assert.equal(cb.length, 2); assert.equal(fk.length, 2);
    cb.forEach((x, i) => {
      assert.equal(x.op_key, fk[i].idem_key, 'ikki tomon bitta kalit bilan bog\'langan');
      assert.equal(x.ref_type, 'branch_debt'); assert.equal(x.staff_name, 'Kassir 729'); assert.equal(fk[i].staff_name, 'Kassir 729');
      assert.equal(fk[i].op_type, 'branch_in'); assert.equal(fk[i].counterparty_id, 'f729');
    });
    assert.match(cb[0].note, /Sentabr.*500.*→.*400/); assert.match(cb[1].note, /400.*→.*350.*kurs 12000/);
    assert.equal(body(r).transfer.fee ?? null, null, "komissiya yo'q (biznesda belgilanmagan)");
  });
}

async function testB7DuplicateInsufficientOverpayRollback() {
  await withWorld(async ({ pg, client }) => {
    const h = loadFunction('firma-kassa', client);
    const snap = async () => [await debtOf(pg, 'f729'), await boxBal(pg, 'f729', 3), await boxBal(pg, 'f729', 1), await fkBal(pg, 'USD'), await fkBal(pg, 'UZS'),
      await ledgerCount(pg, 'f729'), await num(pg, `select count(*)::int v from firma_kassa_ledger`)];
    // Takroriy yuborish (ikki marta bosish / tarmoq qayta urinishi) — bitta to'lov
    const [a, b] = await Promise.all([h(post(pay('b7-dup', 3, 'USD', 120), 't-kas')), h(post(pay('b7-dup', 3, 'USD', 120), 't-kas'))]);
    const c = await h(post(pay('b7-dup', 3, 'USD', 120), 't-kas'));
    assert.deepEqual([a, b, c].map(r => r.statusCode), [200, 200, 200]);
    assert.equal([a, b, c].filter(r => body(r).duplicate).length, 2);
    assert.deepEqual(await snap(), [380, 180, 1200000, 120, 0, 5, 1], 'qarz bir marta kamaydi, pul bir marta o\'tdi');
    const s0 = await snap();
    // Mablag' yetarli emas — hech narsa o'zgarmaydi
    let r = await h(post(pay('b7-insuf', 3, 'USD', 181), 't-kas'));
    assert.equal(r.statusCode, 400); assert.match(body(r).error, /yetarli emas/);
    // Qarzdan ortiq to'lov — rad
    r = await h(post(pay('b7-over', 1, 'UZS', 4800000), 't-kas'));
    assert.equal(r.statusCode, 400);
    // Kassa valyutasi so'rovga mos emas (USD kassani UZS deb yuborish) — rad
    r = await h(post(pay('b7-cur', 3, 'UZS', 100), 't-kas'));
    assert.equal(r.statusCode, 400);
    // Firma kassasida mablag' yetmasa (Firma → filial) — filial kassasiga ham tegilmaydi (rollback)
    r = await h(post({ action: 'branch_out', idemKey: 'b7-fk-out', boxId: 3, currency: 'USD', amount: 5000, filial: 'f729' }, 't-admin'));
    assert.equal(r.statusCode, 400);
    assert.deepEqual(await snap(), s0, "rad etilgan amallar hech qayerda iz qoldirmadi (to'liq rollback)");
    // Huquqsiz xodim va Baza uchun — rad
    r = await h(post(pay('b7-perm', 3, 'USD', 1), 't-sel')); assert.equal(r.statusCode, 403);
    r = await h(post(pay('b7-baza', 3, 'USD', 1, { filial: 'baza' }), 't-admin')); assert.equal(r.statusCode, 400);
    // Parallel ikki xil to'lov: qarz 380, ikkalasi 300 dan — faqat bittasi o'tadi, qarz manfiy bo'lmaydi
    await pg.query(`select public._cb_move('f729', 3, 'USD', 'in', 500, 'manual_in', 'test-topup')`);
    const [p1, p2] = await Promise.all([h(post(pay('b7-par-1', 3, 'USD', 300), 't-kas')), h(post(pay('b7-par-2', 3, 'USD', 300), 't-kas'))]);
    assert.deepEqual([p1.statusCode, p2.statusCode].sort(), [200, 400]);
    assert.equal(await debtOf(pg, 'f729'), 80); assert.equal(await boxBal(pg, 'f729', 3), 380); assert.equal(await fkBal(pg, 'USD'), 420);
  });
}

// ── Brauzer: F4 — qoldiq serverdan; B7 — server tranzaksiyasi ────────────
const fulfill = (route, status, obj) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });

async function testClientF4ServerBalance() {
  const reqs = []; let mode = 'ok';
  const { browser, page, consoleErrors } = await loadApp({ mockRoutes: [{ url: '**/.netlify/functions/cashbox-ops', handler: (route) => {
    reqs.push(JSON.parse(route.request().postData() || '{}'));
    if (mode === 'net') return route.abort('failed');
    if (mode === 'deny') return fulfill(route, 400, { error: "CASHBOX: kassada mablag' yetarli emas" });
    return fulfill(route, 200, { ok: true, authority: true, balances: { 1: 777 } });
  } }, { url: '**/.netlify/functions/cashbox-transact', handler: (route) => fulfill(route, 200, { ok: true }) }] });
  await page.exposeFunction('__setMode', (m) => { mode = m; });
  try {
    const r = await page.evaluate(async () => {
      document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div><input id="ko-a" value="10"><input id="ko-d" value="x"><select id="ko-who"><option value=""></option></select>');
      save = () => {}; pgKassalar = () => {}; closeModal = () => {};
      Object.assign(S, { branch: 'f729', cashTxns: [], customers: [], suppliers: [], dealers: [], cashboxes: [{ id: 1, name: 'K', cur: 'USD', bal: 100 }] });
      _cloudEnabled = true;
      await doKassaOp(1, 'in');
      const afterOk = S.cashboxes[0].bal, txns = S.cashTxns.length;
      await window.__setMode('deny'); await doKassaOp(1, 'in');
      const afterDeny = S.cashboxes[0].bal;
      await window.__setMode('net'); await doKassaOp(1, 'out');
      await doKassaOp(1, 'out');
      return { afterOk, txns, afterDeny, final: S.cashboxes[0].bal, toasts: window.__toasts.map(t => t.kind) };
    });
    assert.equal(r.afterOk, 777, "qoldiq — SERVER qaytargan qiymat (100+10 ni brauzer o'zi hisoblamadi)");
    assert.equal(r.txns, 1);
    assert.equal(r.afterDeny, 777, 'server rad etsa — qoldiq o\'zgarmaydi');
    assert.equal(r.final, 777, "tarmoq xatosida — o'zgarmaydi");
    assert.ok(reqs.length >= 4, 'har bir amal serverga yuborildi');
    for (const q of reqs) {
      assert.ok(!JSON.stringify(q).includes('"bal"'), "so'rovda qoldiq (bal) yo'q — faqat amal");
      assert.deepEqual(Object.keys(q.ops[0]).sort(), ['amount', 'box', 'dir', 'note']);
    }
    assert.equal(reqs[2].key, reqs[3].key, "tarmoq xatosidan keyingi qayta urinish — XUDDI SHU kalit (server ikki marta yozmaydi)");
    assert.notEqual(reqs[0].key, reqs[1].key);
    assert.deepEqual(consoleErrors, []);
  } finally { await browser.close(); }
}

async function testClientB7AtomicServer() {
  const reqs = []; let mode = 'ok';
  const { browser, page, consoleErrors } = await loadApp({ mockRoutes: [{ url: '**/.netlify/functions/firma-kassa', handler: (route) => {
    reqs.push(JSON.parse(route.request().postData() || '{}'));
    if (mode === 'deny') return fulfill(route, 400, { error: "CASHBOX: kassada mablag' yetarli emas" });
    return fulfill(route, 200, { ok: true, authority: true, transfer: { branchBalance: 200, debtAfter: 400, debtBefore: 500, firmaBalance: 100 } });
  } }] });
  await page.exposeFunction('__setMode', (m) => { mode = m; });
  try {
    const r = await page.evaluate(async () => {
      document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div><select id="p729-box"><option value="3" selected>$</option></select><input id="p729-amt" value="100">');
      save = () => {}; pgKassalar = () => {}; closeModal = () => {};
      const baza = { cashboxes: [{ id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 1000 }], cashTxns: [] };
      Object.assign(S, { branch: 'f729', branchDebt: { f729: 500 }, cashTxns: [], cashboxes: [{ id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 300 }], _store: { baza } });
      _cloudEnabled = true;
      await confirmPay729Baza();
      const ok = { bal: S.cashboxes[0].bal, debt: S.branchDebt.f729, baza: S._store.baza.cashboxes[0].bal, bazaTx: S._store.baza.cashTxns.length };
      await window.__setMode('deny');
      document.getElementById('p729-amt').value = '50';
      await confirmPay729Baza();
      return { ok, deny: { bal: S.cashboxes[0].bal, debt: S.branchDebt.f729 } };
    });
    assert.equal(reqs[0].action, 'branch_pay', "to'lov server tranzaksiyasi orqali (Firma kassa + qarz)");
    assert.deepEqual([reqs[0].boxId, reqs[0].currency, reqs[0].amount, reqs[0].filial], [3, 'USD', 100, 'f729']);
    assert.ok(reqs[0].idemKey, 'idempotency kaliti bor');
    assert.deepEqual(r.ok, { bal: 200, debt: 400, baza: 1000, bazaTx: 0 }, "qoldiq va qarz — serverdan; brauzer Baza kassasini o'zi o'zgartirmaydi");
    assert.deepEqual(r.deny, { bal: 200, debt: 400 }, 'server rad etsa — hech narsa o\'zgarmaydi');
    assert.deepEqual(consoleErrors, []);
  } finally { await browser.close(); }
}

module.exports = {
  name: 'P13 — v11: F4 kassa qoldig\'i server haqiqiy manba, B7 filial → Firma kassa atomik',
  cases: [
    { name: 'F4-1: normal kassa amali — server bajaradi, qoldiq bazadan', run: testF4NormalOperation },
    { name: "F4-2: brauzer boshqa qoldiq yuborsa — DENY (bazadagi qoldiq qoladi, jurnalga yoziladi)", run: testF4BrowserBalanceIgnored },
    { name: 'F4-3: juda katta qoldiq / qiymat yaratish / soxta kurs — DENY', run: testF4HugeBalanceDenied },
    { name: "F4-4: manfiy, son emas, ortiqcha chiqim, huquqsiz, boshqa filial, to'g'ridan-to'g'ri SQL — DENY", run: testF4NegativeManipulated },
    { name: "F4-5: ikki parallel amal — faqat to'g'ri natija, qoldiq manfiy emas", run: testF4Parallel },
    { name: "F4-6: bir xil amal ikki/uch marta — dublikat yo'q", run: testF4Idempotent },
    { name: "F4-7: yakuniy qoldiq = bazadagi qoldiq = jurnal yig'indisi (savdo ham)", run: testF4FinalEqualsDb },
    { name: "B7-1: USD va UZS (serverdagi kurs), qarz kamayadi, ikki jurnalda audit izi", run: testB7UsdUzsRateAudit },
    { name: "B7-2: takroriy yuborish, mablag' yetmasligi, ortiqcha to'lov, valyuta, rollback, parallel", run: testB7DuplicateInsufficientOverpayRollback },
    { name: "F4 brauzer: qoldiq serverdan; rad/tarmoq xatosida o'zgarmaydi; qayta urinish — o'sha kalit", run: testClientF4ServerBalance },
    { name: "B7 brauzer: 'Bazaga to'lov' — bitta server tranzaksiyasi, natija serverdan", run: testClientB7AtomicServer },
  ],
};
