// P8 — Loyihani NOLDAN ko'tarish (yangi Supabase + Netlify) uchun kerakli hamma narsa (2026-10-01).
// Qo'riqlanadi:
//  • supabase/schema.sql bo'sh PostgreSQL'ga (Supabase muhitining minimal nusxasi) xatosiz
//    qo'llanadi, ikkinchi marta ham (idempotent); jadval/view/funksiya/siyosat soni production
//    bilan bir xil; rollar-ruxsatlar production bilan aynan bir xil (md5);
//  • asosiy biznes funksiyalari yangi bazada ishlaydi: atomik savdo (FIFO, aralash to'lov,
//    qarz, qoldiq yetmasa — hammasi bekor), hamkorlar oylik taqsimoti va bekor qilish;
//  • ruxsatlar: anon savdo/xodim jadvallariga va savdo funksiyasiga kira olmaydi;
//  • js/config.js: brauzerga FAQAT anon kalit (service_role / secret RAD etiladi);
//  • birinchi administratorni yaratish skripti; health funksiyasi kalit chiqarmaydi;
//  • build (dist/) — faqat sayt fayllari; statik tekshiruv o'tadi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');

const PRELUDE = `
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema extensions; create schema auth; create schema storage;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text);
alter table storage.objects enable row level security;`;

async function freshDb() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await db.exec(PRELUDE);
  await db.exec(fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8'));
  return db;
}
const one = async (db, q) => (await db.query(q)).rows[0];

async function testSchemaAppliesFromZero() {
  const db = await freshDb();
  try {
    await db.exec(fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8'));   // 2-marta — idempotent
    const c = await one(db, `select
      (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r')::int tables,
      (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v')::int views,
      (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public')::int funcs,
      (select count(*) from pg_policies)::int policies,
      (select count(*) from pg_constraint k join pg_namespace n on n.oid=k.connamespace where n.nspname='public' and k.contype in ('p','u','c','f','x'))::int cons,
      (select count(*) from pg_indexes where schemaname='public')::int idx,
      (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity)::int rls,
      (select count(*) from pg_event_trigger where evtname='ensure_rls')::int evt,
      (select count(*) from storage.buckets where id='product-images' and public)::int bucket`);
    // To'liq sxema = production (2026-10-01, 22-migratsiyadan keyin: 33 jadval, 15 funksiya, 19 siyosat,
    // 91 cheklov, 76 indeks) + 23-migratsiya (Firma Kassa: +2 jadval, +6 funksiya, +11 cheklov, +5 indeks)
    // + 24-migratsiya (kassa jurnali: +1 jadval, +5 funksiya, +8 cheklov, +5 indeks)
    // + 25-migratsiya (v23: +7 funksiya — _fk_source_type, _fk_ledger_defaults, _ledger_immutable,
    //   firma_kassa_reverse, branch_firma_loan, firma_kassa_branch_summary, cash_payment_atomic;
    //   +1 cheklov — firma_kassa_ledger_source_chk; +2 indeks — idx_fk_ledger_source, dealer_payments_idem_key_uq).
    // + 26-migratsiya (xarajat kategoriyalari: +1 jadval expense_categories, +2 funksiya — _expense_cat_key,
    //   _expense_categories_touch; +7 cheklov — pk, fk(staff), filial/turi/nom/nofaol/uzunlik; +4 indeks — pk, faol-noyob, idem, filial).
    // + 27-migratsiya (F4b: +4 jadval — customer_debt_ledger, supplier_debt_ledger, stock_ledger, ledger_ops;
    //   +22 funksiya; +23 cheklov; +14 indeks).
    // + 28-migratsiya (Firma kassasi — asosiy kassa: +2 funksiya — firma_supplier_pay, firma_kassa_reverse_expense;
    //   cheklovlar soni o'zgarmaydi — op/source/ledger_ops turlari kengaytirildi).
    // Production qismining o'zi alohida P11 testida production sonlari bilan solishtiriladi.
    // v23.6: 29-migratsiya — +6 jadval (hisobdan chiqarish, B2B), +6 funksiya, RLS barchasida
    // v23.8: 30-migratsiya — +1 jadval (dealer_pay_notices, RLS), +3 funksiya (dealer_pay_notice_create/accept/reject),
    //   +6 cheklov (pk, fk(dealers), tur/valyuta/summa/holat), +4 indeks (pk, idem noyob, filial+holat, diller)
    // v24: 31-migratsiya — +2 jadval (fw_audit_events, fw_notifications; ikkalasida RLS), +9 funksiya (_fw_audit_immutable,
    //   _fw_notif_guard, fw_edit_window_days, fw_sale_created_at, _fw_assert_sale_edit, _fw_sale_snapshot, sale_edit_guarded,
    //   sale_void_guarded, sale_checkout_guarded; record_dealer_sale — almashtirildi), +8 cheklov, +7 indeks.
    // v24.2: 32-migratsiya — +1 jadval (fw_dealer_revisions, RLS), +2 funksiya (_fw_rev_guard, dealer_revision_decide;
    //   sale_checkout_guarded — almashtirildi), +7 cheklov (pk, fk(dealers), holat, qatorlar, uzunlik, qaror izchilligi,
    //   dealer_sales.source), +4 indeks (pk, op_key noyob, filial+holat, diller); audit/bildirishnoma turlari kengaytirildi.
    // v24.4: 33-migratsiya — +2 jadval (supplier_advance_balances, supplier_advance_ledger; RLS), +3 funksiya (_fw_adv_guard,
    //   supplier_advance_pay, supplier_advance_apply), +8 cheklov (2 pk, nomanfiy, tur, summa, manba, uzunlik, op noyob), +4 indeks.
    // v24.5: 34-migratsiya — +3 jadval (customer_credit_balances, customer_credit_ledger, sale_credit_uses; RLS), +4 funksiya
    //   (_fw_credit_guard, _cust_credit_move, sale_checkout_v34, sale_void_v34), +9 cheklov, +5 indeks.
    // v24.5 (P1 auditi): 27-migratsiyadagi m27_stale_batches_archive — +1 jadval (RLS), +2 cheklov (pk, check), +1 indeks (pk).
    // v24.5: 35-migratsiya (v23.10.2 dagi 31 dan) — +7 funksiya (_dealer_json, _ledger_op_batch_ids, _dealer_lock,
    //   dealer_ship_atomic, dealer_return_atomic, dealer_sale_record_atomic, dealer_atomic_available); jadval/cheklov soni
    //   o'zgarmaydi (ledger_ops_kind_chk — almashtirildi, diller amallari qo'shildi).
    assert.deepEqual(c, { tables:68, views:3, funcs:117, policies:19, cons:238, idx:164, rls:68, evt:1, bucket:1 });   // v25.2: +48 (ops: 4 jadval, 4 funksiya, 6 cheklov, 6 indeks); v25.1: +47 (sales: 3 ustun, 1 tekshiruv cheklovi); v24.6: +36 (2 jadval, 4 funksiya); v24.8: +37 (+5 funksiya, −2 eski record_dealer_sale); v24.9: +38 (3 jadval, 1 funksiya); v25: +40 (1 funksiya, 1 cheklov), +41 (1 funksiya), +42 (5 funksiya), +43 (2 jadval, 1 funksiya), +44 (1 funksiya), +45 (3 funksiya)
    const s = await one(db, `select count(*)::int n, md5(string_agg(r.key||':'||p.key, ',' order by r.key collate "C", p.key collate "C")) h,
      (select md5(string_agg(key||'|'||module||'|'||label, ',' order by key collate "C")) from permissions) ph,
      (select md5(string_agg(key||'|'||name||'|'||coalesce(description,'')||'|'||is_system, ',' order by key collate "C")) from roles) rh
      from role_permissions rp join roles r on r.id=rp.role_id join permissions p on p.id=rp.permission_id`);
    // production (132 bog'lanish) + 23-migratsiya: firma_kassa.view/transact (owner, administrator) + view (accountant) = 137
    // + 29-migratsiya: ombor.writeoff, b2b.view/order/ship (owner, administrator) + ombor.writeoff (warehouse_manager) = 146
    // + 31-migratsiya: savdo.direct_sale — savdo qila oladigan rollarga (oddiy xodim va dillerdan tashqari) = 151
    // + 32-migratsiya: savdo.direct_sale — oddiy «Xodim» (employee) roliga ham (egasi qarori 2026-10-13) = 152
    // + 37-migratsiya: yangi ruxsat «tannarx.view» (permissions jadvalida; hech bir rolga berilmaydi — n o'zgarmaydi, ph o'zgaradi)
    assert.deepEqual(s, { n:152, h:'5a214ced5f15d7ccfe7c524bbed68a95', ph:'fa49e5be6506a7f4da2361559fa6839f', rh:'8eaf9d0346e9b4fdced7bf8508286766' }, 'Rollar/ruxsatlar: production + Firma Kassa + hisobdan chiqarish/B2B + Direct Sale ruxsatlari');
    const ds = await one(db, `select string_agg(r.key, ',' order by r.key collate "C") k from role_permissions rp join roles r on r.id=rp.role_id join permissions p on p.id=rp.permission_id where p.key='savdo.direct_sale'`);
    assert.equal(ds.k, 'administrator,branch_manager,cashier,employee,owner,sales_manager', "Direct Sale: oddiy xodimga ham (32), dillerga — yo'q");
    const app = await one(db, `select data from app_data where id='main'`);
    assert.deepEqual(app.data, { partners: [], partnerPeriods: [] }, "Asosiy ma'lumot bloki tayyor");
  } finally { await db.close(); }
}

async function testBusinessFunctionsOnFreshDb() {
  const db = await freshDb();
  try {
    await db.exec(`select set_config('fw.stock_move','1',false); insert into batches (local_id, filial, pid, qty, sold, cost_usd, batch_date, status) values ('b1','baza',101,5,0,10,'2026-09-01','active'),('b2','baza',101,5,0,12,'2026-09-10','active'); select set_config('fw.stock_move','',false)`);
    // v11 (24-migratsiya): kassa valyutasini server (sale-checkout-atomic.js) filial ma'lumotidan qo'shadi;
    // so'mli to'lov savdo summasidan oshmasligi serverdagi kurs bo'yicha tekshiriladi
    await db.exec(`update app_data set data = data || '{"settings":{"usdUzs":12600}}'::jsonb where id='main'`);
    const { res } = await one(db, `select sale_checkout_atomic_v2('baza', '[{"pid":101,"qty":7,"sell_usd":20,"cost_usd":0}]'::jsonb, 0, 100, 5, '[{"box_id":1,"amount_native":630000,"currency":"UZS"},{"box_id":3,"amount_native":50,"currency":"USD"}]'::jsonb, 'INV-1') res`);
    assert.equal(+res.totalUsd, 140); assert.equal(+res.costUsd, 74, 'FIFO tannarx: 5×10 + 2×12'); assert.equal(+res.debtUsd, 40);
    const b = (await db.query(`select sold, status from batches order by local_id`)).rows;
    assert.deepEqual(b.map(x => [+x.sold, x.status]), [[5, 'empty'], [2, 'active']]);
    const kb = (await db.query(`select balance from cashbox_balances order by box_local_id`)).rows.map(x => +x.balance);
    assert.deepEqual(kb, [630000, 50], "Aralash to'lov — ikkala kassa");
    assert.deepEqual(res.balances, { 1: 630000, 3: 50 }, 'v11: javobda bazadagi haqiqiy qoldiqlar');
    assert.equal((await one(db, `select count(*)::int n from cashbox_ledger where op_kind='sale' and ref_id='INV-1'`)).n, 2, "v11: har bir kassa tushumi jurnalda");
    assert.equal(+(await one(db, `select debt from customer_balances where customer_local_id=5`)).debt, 40 * 12600, "v23.2 (27-migratsiya): mijoz qarzi so'mda — serverdagi kurs bo'yicha");
    await assert.rejects(db.query(`select sale_checkout_atomic_v2('baza','[{"pid":101,"qty":99,"sell_usd":1,"cost_usd":0}]'::jsonb,0,0,null,null,'INV-2')`), /yetarli qoldiq/);
    assert.equal((await one(db, `select count(*)::int n from sales`)).n, 1, 'Xato savdo hech narsa yozmadi (atomik)');

    await db.query(`select * from partner_upsert_atomic(1, 'Ali', true, 0, null, null, 1000, 'BUSINESS_OWNER', 60)`);
    await db.query(`select * from partner_upsert_atomic(2, 'Vali', false, 0, null, null, 500, 'INVESTOR', 40)`);
    await db.query(`select * from partner_monthly_calc_atomic('P1', '2026-09-01', '2026-09-30', 1000, 0)`);
    const bal = async () => (await db.query(`select name, balance from partner_balances order by name`)).rows.map(x => `${x.name}=${+x.balance}`).join(',');
    assert.equal(await bal(), 'Ali=1600,Vali=900', 'Hamkorlar oylik taqsimoti (60/40)');
    await db.query(`select * from partner_undo_period_atomic('P1', true)`);
    assert.equal(await bal(), 'Ali=1000,Vali=500', 'Taqsimotni bekor qilish');

    await db.exec(`create table public.tmp_rls_check (id int)`);
    assert.equal((await one(db, `select relrowsecurity r from pg_class where relname='tmp_rls_check'`)).r, true, 'Yangi jadvalda RLS avtomatik');
    const g = await one(db, `select has_table_privilege('anon','public.sales','select') s, has_table_privilege('anon','public.staff','select') st,
      has_table_privilege('anon','public.app_data','select') ad,
      has_function_privilege('anon','public.sale_checkout_atomic_v2(text,jsonb,numeric,numeric,bigint,jsonb,text)','execute') f,
      has_function_privilege('service_role','public.sale_checkout_atomic_v2(text,jsonb,numeric,numeric,bigint,jsonb,text)','execute') sf,
      has_table_privilege('service_role','public.sales','insert') si`);
    assert.deepEqual(g, { s:false, st:false, ad:false, f:false, sf:true, si:true }, 'anon — yopiq; service_role — ochiq');
  } finally { await db.close(); }
}

const JWT = (role) => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role, iss: 'supabase' })).toString('base64url') + '.sig';

async function testConfigOnlyAnonKey() {
  const { buildConfigJs, checkAnonKey, parseConfigJs } = require('../scripts/lib/config');
  assert.match(checkAnonKey(JWT('service_role')), /service_role/, 'service_role kaliti rad etiladi');
  assert.match(checkAnonKey('sb_secret_abc123'), /MAXFIY/, 'secret kalit rad etiladi');
  assert.match(checkAnonKey('not-a-key'), /formati/);
  assert.equal(checkAnonKey(JWT('anon')), null); assert.equal(checkAnonKey('sb_publishable_xyz'), null);
  assert.throws(() => buildConfigJs({ url: 'https://a.supabase.co', anonKey: JWT('service_role') }), /service_role/);
  assert.throws(() => buildConfigJs({ url: 'http://a.supabase.co', anonKey: JWT('anon') }), /SUPABASE_URL/);
  const txt = buildConfigJs({ url: 'https://newproj.supabase.co/', anonKey: JWT('anon') });
  assert.deepEqual(parseConfigJs(txt), { url: 'https://newproj.supabase.co', anonKey: JWT('anon') });
  // Brauzer kodi config.js'dagi qiymatni oladi; config bo'lmasa — production standart qiymati
  for (const f of ['main.js', 'sotuvchi.js', 'diller.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    const head = src.slice(src.indexOf('const FW_CFG'), src.indexOf('\n', src.indexOf('const SUPABASE_ANON_KEY')));
    const run = (win) => { const ctx = { window: win }; vm.runInNewContext(head + "\n;globalThis.__r=[SUPABASE_URL,SUPABASE_ANON_KEY];", ctx); return [...ctx.__r]; };
    assert.deepEqual(run({ FW_CONFIG: { SUPABASE_URL: 'https://newproj.supabase.co', SUPABASE_ANON_KEY: 'k1' } }), ['https://newproj.supabase.co', 'k1'], `${f}: config.js qiymati`);
    assert.equal(run({})[0], 'https://dzzxrxudsejhdrbpiifc.supabase.co', `${f}: config bo'lmasa — production qiymati`);
  }
  const cur = parseConfigJs(fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8'));
  assert.equal(checkAnonKey(cur.anonKey), null, "Repo'dagi js/config.js — faqat anon kalit");
}

function fakeAdmin({ staff = [], roles = [{ id: 'r-owner', key: 'owner' }], failStaffInsert = false, rolesCount = 9, rolesError = null } = {}) {
  const calls = { createUser: [], deleteUser: [], inserts: [] };
  const from = (table) => {
    const st = { table, filters: {} };
    const c = {
      select: () => c, ilike: (k, v) => { st.filters[k] = String(v).toLowerCase(); return c; }, eq: (k, v) => { st.filters[k] = v; return c; },
      maybeSingle: async () => {
        if (table === 'staff') return { data: staff.find(s => s.login.toLowerCase() === st.filters.login) || null, error: null };
        if (table === 'roles') return { data: roles.find(r => r.key === st.filters.key) || null, error: null };
        return { data: null, error: null };
      },
      insert: (row) => { calls.inserts.push({ table, row }); st.row = row; return c; },
      single: async () => failStaffInsert ? { data: null, error: { message: 'dup' } } : { data: { id: 77, ...st.row }, error: null },
      then: (ok) => ok(table === 'roles' && st.head ? { count: rolesCount, error: rolesError } : { error: null }),
    };
    const sel = c.select; c.select = (cols, opts) => { if (opts && opts.head) st.head = true; return sel(); };
    return c;
  };
  return { calls, from, auth: { admin: {
    createUser: async (u) => { calls.createUser.push({ email: u.email }); return { data: { user: { id: 'u-new' } }, error: null }; },
    deleteUser: async (id) => { calls.deleteUser.push(id); return {}; } } } };
}

async function testCreateFirstAdmin() {
  const { createAdmin } = require('../scripts/lib/create-admin');
  const a = fakeAdmin();
  const r = await createAdmin(a, { login: 'Azimsher', password: 'kuchliParol1', name: 'Azimsher' });
  assert.deepEqual(r, { staffId: 77, login: 'Azimsher', filial: 'baza', ownerRole: true });
  assert.deepEqual(a.calls.createUser, [{ email: 'azimsher@staff.biznespro.local' }], 'Kirish formati ilova bilan bir xil');
  const staffIns = a.calls.inserts.find(i => i.table === 'staff').row;
  assert.equal(staffIns.role, 'admin'); assert.equal(staffIns.auth_user_id, 'u-new');
  assert.ok(!JSON.stringify(a.calls).includes('kuchliParol1'), 'Parol hech qayerga yozilmaydi');
  assert.ok(a.calls.inserts.some(i => i.table === 'staff_roles' && i.row.role_id === 'r-owner'), 'Korxona egasi roli biriktirildi');
  await assert.rejects(createAdmin(fakeAdmin({ staff: [{ id: 1, login: 'admin' }] }), { login: 'ADMIN', password: 'kuchliParol1', name: 'X' }), /band/);
  await assert.rejects(createAdmin(fakeAdmin(), { login: 'ad', password: 'kuchliParol1', name: 'X' }), /Login/);
  await assert.rejects(createAdmin(fakeAdmin(), { login: 'admin', password: '123', name: 'X' }), /8 belgi/);
  const f = fakeAdmin({ failStaffInsert: true });
  await assert.rejects(createAdmin(f, { login: 'admin', password: 'kuchliParol1', name: 'X' }), /Xodim qatorini/);
  assert.deepEqual(f.calls.deleteUser, ['u-new'], "Xato bo'lsa auth foydalanuvchisi o'chiriladi (yarim holat qolmaydi)");
}

async function testHealthFunction() {
  const Module = require('module');
  const libPath = require.resolve('../netlify/functions/_lib/supabaseAdmin.js');
  const fnPath = require.resolve('../netlify/functions/health.js');
  const sbPath = require.resolve('@supabase/supabase-js');
  const saved = { sb: require.cache[sbPath], lib: require.cache[libPath], fn: require.cache[fnPath], key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  const load = (client) => {
    require.cache[sbPath] = new Module(sbPath); require.cache[sbPath].exports = { createClient: () => client }; require.cache[sbPath].loaded = true;
    delete require.cache[libPath]; delete require.cache[fnPath];
    return require(fnPath).handler;
  };
  try {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'super-secret-value';
    let res = await load(fakeAdmin())({ httpMethod: 'GET' });
    assert.equal(res.statusCode, 200); const body = JSON.parse(res.body);
    assert.equal(body.ok, true); assert.deepEqual(Object.keys(body.checks), ['env', 'urlFromEnv', 'db', 'schema', 'seed']);
    assert.ok(!res.body.includes('super-secret-value') && !res.body.includes('supabase.co'), 'Javobda kalit yoki manzil yo\'q');
    res = await load(fakeAdmin({ rolesCount: 0 }))({ httpMethod: 'GET' });
    assert.equal(res.statusCode, 503); assert.match(JSON.parse(res.body).hint, /boshlang'ich/);
    res = await load(fakeAdmin({ rolesError: { message: 'relation "roles" does not exist' } }))({ httpMethod: 'GET' });
    assert.match(JSON.parse(res.body).hint, /schema\.sql/);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    res = await load(fakeAdmin())({ httpMethod: 'GET' });
    assert.equal(res.statusCode, 503); assert.equal(JSON.parse(res.body).checks.env, false);
    assert.equal((await load(fakeAdmin())({ httpMethod: 'POST' })).statusCode, 405);
  } finally {
    if (saved.key) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key; else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (saved.sb) require.cache[sbPath] = saved.sb; else delete require.cache[sbPath];
    delete require.cache[libPath]; delete require.cache[fnPath];
  }
}

async function testBuildAndCheck() {
  const { build } = require('../scripts/build');
  const r = build();
  assert.equal(r.ok, true, (r.problems || []).join('; '));
  const list = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : list.push(path.relative(path.join(ROOT, 'dist'), p)); } })(path.join(ROOT, 'dist'));
  assert.ok(list.includes('index.html') && list.includes(path.join('js', 'config.js')) && list.includes(path.join('js', 'main.js')));
  assert.ok(!list.some(f => /\.(sql|md)$/.test(f) || f.startsWith('tests') || f.startsWith('scripts') || f.startsWith('supabase') || f.startsWith('netlify')), "dist'da faqat sayt fayllari");
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  assert.match(toml, /publish = "dist"/); assert.match(toml, /command = "node scripts\/build.js"/);
  const out = cp.execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'check.js')], { encoding: 'utf8' });
  assert.match(out, /muammo yo'q/);
  for (const f of ['.env.example', '.gitignore', path.join('.github', 'workflows', 'ci.yml')]) assert.ok(fs.existsSync(path.join(ROOT, f)), f + ' bor');
  assert.match(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /^\.env$/m, '.env GitHub\'ga tushmaydi');
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8'), /SERVICE_ROLE_KEY=\S/, ".env.example'da haqiqiy qiymat yo'q");
}

module.exports = {
  _helpers: { freshDb, one, PRELUDE },
  name: "P8 — Noldan o'rnatish: baza sxemasi, sozlamalar, birinchi admin, health, build",
  cases: [
    { name: "supabase/schema.sql bo'sh bazaga qo'llanadi (2 marta ham); sonlar va rollar production bilan bir xil", run: testSchemaAppliesFromZero },
    { name: "Yangi bazada savdo (FIFO, aralash to'lov, atomiklik), hamkorlar taqsimoti, ruxsatlar ishlaydi", run: testBusinessFunctionsOnFreshDb },
    { name: "js/config.js: faqat anon kalit; service_role/secret rad etiladi; kod config'dan o'qiydi", run: testConfigOnlyAnonKey },
    { name: "Birinchi administrator skripti: yaratish, takror login, qisqa parol, xatoda orqaga qaytarish", run: testCreateFirstAdmin },
    { name: "health funksiyasi: holatni ko'rsatadi, kalit/manzil chiqarmaydi", run: testHealthFunction },
    { name: "Build (dist/) faqat sayt; statik tekshiruv; .env.example, .gitignore, CI mavjud", run: testBuildAndCheck },
  ],
};
