// P11 — v10: 23-migratsiya HAQIQIY PostgreSQL'da (PGlite — to'liq PostgreSQL 17
// dvigateli, brauzer/Node uchun WASM): Firma Kassa, diller savdosi, ruxsatlar,
// va "production + migratsiya = schema.sql" tengligi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE, one } = require('./p8-noldan-ornatish.test.js')._helpers;
const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG23 = fs.readFileSync(path.join(ROOT, 'supabase-migration-23-v10-firma-kassa.sql'), 'utf8');
const MIG24 = fs.readFileSync(path.join(ROOT, 'supabase-migration-24-v11-cash-authority.sql'), 'utf8');
const MIG25 = fs.readFileSync(path.join(ROOT, 'supabase-migration-25-v23-hardening.sql'), 'utf8');
const MIG26 = fs.readFileSync(path.join(ROOT, 'supabase-migration-26-expense-categories.sql'), 'utf8');
const MIG27 = fs.readFileSync(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'), 'utf8');
const MIG28 = fs.readFileSync(path.join(ROOT, 'supabase-migration-28-firma-kassa-asosiy.sql'), 'utf8');
const MIG29 = fs.readFileSync(path.join(ROOT, 'supabase-migration-29-hisobdan-chiqarish-b2b.sql'), 'utf8');
const MIG30 = fs.readFileSync(path.join(ROOT, 'supabase-migration-30-diller-tolov-xabarnomasi.sql'), 'utf8');
const MIG31 = fs.readFileSync(path.join(ROOT, 'supabase-migration-31-tahrir-muddati-audit-bildirishnoma.sql'), 'utf8');
const MIG32 = fs.readFileSync(path.join(ROOT, 'supabase-migration-32-reviziya-tasdiq-direct-sale.sql'), 'utf8');
const MIG33 = fs.readFileSync(path.join(ROOT, 'supabase-migration-33-taminotchi-zaklad.sql'), 'utf8');
const MIG34 = fs.readFileSync(path.join(ROOT, 'supabase-migration-34-mijoz-haqi.sql'), 'utf8');
const MIG35 = fs.readFileSync(path.join(ROOT, 'supabase-migration-35-diller-ombor-atomik.sql'), 'utf8');
const MIG36 = fs.readFileSync(path.join(ROOT, 'supabase-migration-36-filial-otkazma.sql'), 'utf8');
const MIG37 = fs.readFileSync(path.join(ROOT, 'supabase-migration-37-maxfiylik-chegirma-versiya.sql'), 'utf8');
const MIG38 = fs.readFileSync(path.join(ROOT, 'supabase-migration-38-parol-tiklash.sql'), 'utf8');
const MIG39 = fs.readFileSync(path.join(ROOT, 'supabase-migration-39-toshkent-vaqti.sql'), 'utf8');
const MIG40 = fs.readFileSync(path.join(ROOT, 'supabase-migration-40-filial-qarzga-jonatma.sql'), 'utf8');
const MIG41 = fs.readFileSync(path.join(ROOT, 'supabase-migration-41-som-tannarx.sql'), 'utf8');
const MIG42 = fs.readFileSync(path.join(ROOT, 'supabase-migration-42-diller-qarzga-jonatma.sql'), 'utf8');
const MIG43 = fs.readFileSync(path.join(ROOT, 'supabase-migration-43-filial-qarz-valyuta.sql'), 'utf8');
const MIG44 = fs.readFileSync(path.join(ROOT, 'supabase-migration-44-taminotchi-valyuta.sql'), 'utf8');
const MIG45 = fs.readFileSync(path.join(ROOT, 'supabase-migration-45-zaklad-valyuta.sql'), 'utf8');
const MIG46 = fs.readFileSync(path.join(ROOT, 'supabase-migration-46-mustaqil-narx.sql'), 'utf8');
const MIG47 = fs.readFileSync(path.join(ROOT, 'supabase-migration-47-yaxlitlash.sql'), 'utf8');
const MIG48 = fs.readFileSync(path.join(ROOT, 'supabase-migration-48-ops.sql'), 'utf8');
const MARK = '-- 7. v10 (23-migratsiya)';

async function db(sql) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const d = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await d.exec(PRELUDE);
  await d.exec(sql);
  return d;
}
const COUNTS = `select
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r')::int tables,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public')::int funcs,
  (select count(*) from pg_policies)::int policies,
  (select count(*) from pg_constraint k join pg_namespace n on n.oid=k.connamespace where n.nspname='public' and k.contype in ('p','u','c','f','x'))::int cons,
  (select count(*) from pg_indexes where schemaname='public')::int idx,
  (select count(*)::int from role_permissions) rp,
  (select md5(string_agg(p.proname||':'||md5(p.prosrc)||':'||array_to_string(coalesce(p.proacl,'{}'),','), ',' order by p.proname, pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') fnsig`;

async function testProductionSliceAndMigrationEquality() {
  const i = SCHEMA.indexOf(MARK);
  assert.ok(i > 0, "schema.sql'da 7-bo'lim (23-migratsiya) bor");
  const prodPart = SCHEMA.slice(0, SCHEMA.lastIndexOf('\n', SCHEMA.lastIndexOf('-- ───', i)));
  const a = await db(prodPart);
  const b = await db(SCHEMA);
  try {
    const pa = await one(a, COUNTS);
    // Production (2026-10-01, 22-migratsiya qo'llangandan keyin, Supabase MCP orqali o'qilgan)
    assert.deepEqual({ tables: pa.tables, funcs: pa.funcs, policies: pa.policies, cons: pa.cons, idx: pa.idx, rp: pa.rp },
      { tables: 33, funcs: 15, policies: 19, cons: 91, idx: 76, rp: 132 }, 'schema.sql (7-bo\'limsiz) = hozirgi production');
    await a.exec(MIG23);
    await a.exec(MIG24);
    await a.exec(MIG25);
    await a.exec(MIG26);
    await a.exec(MIG27);
    await a.exec(MIG28);
    await a.exec(MIG29);
    await a.exec(MIG30);
    await a.exec(MIG31);
    await a.exec(MIG32);
    await a.exec(MIG33);
    await a.exec(MIG34);
    await a.exec(MIG35);
    await a.exec(MIG36);
    await a.exec(MIG37);
    await a.exec(MIG38);
    await a.exec(MIG39);
    await a.exec(MIG40);
    await a.exec(MIG41);
    await a.exec(MIG42);
    await a.exec(MIG43);
    await a.exec(MIG44);
    await a.exec(MIG45);
    await a.exec(MIG46);
    await a.exec(MIG47);
    await a.exec(MIG48);
    const after = await one(a, COUNTS), full = await one(b, COUNTS);
    assert.deepEqual(after, full, "production + 23 + 24 + 25 + 26 + 27 + 28 + 29 + 30 + 31 + 32 + 33 + 34 + 35 + 36 + 37 + 38 + 39 + 40 + 41 + 42 + 43 + 44 + 45 + 46 + 47 + 48-migratsiya = to'liq schema.sql (funksiya matnlari va ruxsatlari ham)");
    await a.exec(MIG23);
    await a.exec(MIG24);
    await a.exec(MIG25);
    await a.exec(MIG26);
    await a.exec(MIG27);
    await a.exec(MIG28);
    await a.exec(MIG29);
    await a.exec(MIG30);
    await a.exec(MIG31);
    await a.exec(MIG32);
    await a.exec(MIG33);
    await a.exec(MIG34);
    await a.exec(MIG35);
    await a.exec(MIG36);
    await a.exec(MIG37);
    await a.exec(MIG38);
    await a.exec(MIG39);
    await a.exec(MIG40);
    await a.exec(MIG41);
    await a.exec(MIG42);
    await a.exec(MIG43);
    await a.exec(MIG44);
    await a.exec(MIG45);
    await a.exec(MIG46);
    await a.exec(MIG47);
    await a.exec(MIG48);
    assert.deepEqual(await one(a, COUNTS), full, 'migratsiyalar takroriy ishga tushirilsa ham o\'zgarmaydi');
    // revoke/grant — ruxsat bayonotlari (masalan "revoke ... truncate ...") ma'lumot o'chirmaydi;
    // ular alohida tekshiriladi: 25-migratsiya anon'ga hech narsa BERMAYDI.
    const noPriv = (m) => m.replace(/^\s*(revoke|grant)\b[^;]*;/gim, '');
    assert.doesNotMatch(MIG25, /\bgrant\b[^;]*\bto\b[^;]*\banon\b/i, "25-migratsiya anon'ga ruxsat bermaydi");
    assert.doesNotMatch(MIG26, /\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i, "26-migratsiya brauzer rollariga ruxsat bermaydi");
    assert.doesNotMatch(MIG27, /\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i, "27-migratsiya brauzer rollariga ruxsat bermaydi");
    assert.doesNotMatch(MIG28, /\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i, "28-migratsiya brauzer rollariga ruxsat bermaydi");
    assert.doesNotMatch(MIG29, /\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i, "29-migratsiya brauzer rollariga ruxsat bermaydi (B2B kalitlari — faqat server)");
    assert.doesNotMatch(MIG30, /\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i, "30-migratsiya brauzer rollariga ruxsat bermaydi (diller to'lovlari — faqat server)");
    assert.doesNotMatch(MIG31, /\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i, "31-migratsiya brauzer rollariga ruxsat bermaydi (audit va bildirishnomalar — faqat server)");
    assert.doesNotMatch(MIG32, /\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i, "32-migratsiya brauzer rollariga ruxsat bermaydi (reviziya qarori — faqat server)");
    assert.doesNotMatch(MIG33, /\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i, "33-migratsiya brauzer rollariga ruxsat bermaydi (zaklad — faqat server)");
    assert.doesNotMatch(MIG34, /\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i, "34-migratsiya brauzer rollariga ruxsat bermaydi (mijoz haqi — faqat server)");
    assert.doesNotMatch(MIG37, /\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i, "37-migratsiya brauzer rollariga ruxsat bermaydi (versiya, chegirma — faqat server)");
    assert.doesNotMatch(MIG35, /\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i, "35-migratsiya brauzer rollariga ruxsat bermaydi (diller ombori — faqat server)");
    assert.doesNotMatch(MIG38, /\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i, "38-migratsiya brauzer rollariga ruxsat bermaydi (parol tiklash — faqat server)");
    // 38: o'chirish faqat auth seanslarida (fw_revoke_sessions ichida, parol tiklanganda) — jadval/ustun o'chirilmaydi
    assert.doesNotMatch(noPriv(MIG38).replace(/execute 'delete from auth\.(sessions|refresh_tokens) where user_id = \$1(::text)?'/g, ''), /\bdrop\s+(table|column|function|schema|trigger)\b|\bdelete\s+from\b|\btruncate\b/i, "38: ma'lumot o'chirmaydi");
    // 31: «before truncate on fw_audit_events» — truncate'ni TAQIQLOVCHI trigger (ma'lumot o'chirmaydi), shu so'z tekshiruvdan chiqariladi
    const noTruncGuard = (m) => m.replace(/\bbefore\s+truncate\s+on\s+public\.(fw_audit_events|fw_dealer_revisions|supplier_advance_ledger|customer_credit_ledger)\b/gi, '');   // 32: reviziyalar ham himoyalangan
    for (const m of [MIG23, MIG24, MIG25, MIG26, MIG27, MIG28, MIG29, MIG30, MIG31, MIG32, MIG33, MIG34, MIG35, MIG36].map(noPriv).map(noTruncGuard)) assert.doesNotMatch(m, /\bdrop\s+(table|column|function|schema)\b|\bdelete\s+from\b|\btruncate\b/i, "migratsiya ma'lumot/funksiya o'chirmaydi");
    // 37 — egasi so'ragan yagona istisno: record_dealer_sale ning eski 5 va 6 argumentli nusxalari; boshqa hech narsa o'chirilmaydi
    const m37 = noTruncGuard(noPriv(MIG37)).replace(/drop function if exists public\.record_dealer_sale\(bigint, numeric, numeric, text, text(, numeric)?\);/g, '').replace(/drop trigger if exists [a-z_]+ on public\.[a-z_]+;/g, '');
    assert.doesNotMatch(m37, /\bdrop\s+(table|column|function|schema|trigger)\b|\bdelete\s+from\b|\btruncate\b/i, "37: faqat ikki eski overload o'chiriladi");
  } finally { await a.close(); await b.close(); }
}

async function testFirmaKassaLedger() {
  const d = await db(SCHEMA);
  const mv = (cur, dir, amt, op, key, extra = '') => d.query(`select (r).* from (select public._fk_cash_move('${cur}','${dir}',${amt},'${op}'${extra}, p_idem_key => ${key ? `'${key}'` : 'null'}) r) t`);
  const bal = async (c) => +(await one(d, `select balance from firma_kassa_balance where currency='${c}'`)).balance;
  try {
    await mv('USD', 'in', 1000, 'deposit', 'd1');
    await mv('USD', 'in', 1000, 'deposit', 'd1');                    // takror — e'tiborsiz
    assert.equal(await bal('USD'), 1000, 'bir xil idem kalit — pul bir marta kirdi');
    await assert.rejects(mv('CNY', 'in', 10, 'deposit', 'c1'), /USD yoki UZS/, 'CNY hisob valyutasi emas');
    await assert.rejects(d.query(`insert into firma_kassa_ledger (currency,direction,amount,balance_after,op_type) values ('CNY','in',1,1,'deposit')`), /currency_chk/, 'jadval darajasida ham CNY yo\'q');
    await assert.rejects(mv('USD', 'out', 1000.01, 'withdraw', 'w0'), /yetarli emas/, 'qoldiqdan ortiq chiqim yo\'q');
    await assert.rejects(mv('USD', 'out', -5, 'withdraw', 'w-'), /musbat/);
    await assert.rejects(mv('USD', 'in', 5, 'withdraw', 'w+'), /op_chk/, "yo'nalish va amal turi mos bo'lishi shart");
    await assert.rejects(d.query(`update firma_kassa_balance set balance = -1 where currency='USD'`), /nonneg_chk/, 'manfiy qoldiq — CHECK');
    const w = await mv('USD', 'out', 250.555, 'withdraw', 'w1');
    assert.equal(+w.rows[0].amount, 250.56, 'summa 2 xonagacha yaxlitlanadi'); assert.equal(+w.rows[0].balance_after, 749.44);
    // Avans
    await d.query(`select public.firma_kassa_give_advance('USD', 200, 'staff', '17', 'Ali', p_idem_key => 'a1')`);
    await assert.rejects(d.query(`select public.firma_kassa_repay_advance('USD', 201, 'staff', '17', 'Ali', p_idem_key => 'r0')`), /qolgan avansdan/);
    await d.query(`select public.firma_kassa_repay_advance('USD', 150, 'staff', '17', 'Ali', p_idem_key => 'r1')`);
    await d.query(`select public.firma_kassa_repay_advance('USD', 150, 'staff', '17', 'Ali', p_idem_key => 'r1')`);   // takror
    const st = (await one(d, `select public.firma_kassa_get_balance() s`)).s;
    assert.deepEqual(st.advances.map(a => [a.counterparty_id, +a.outstanding]), [['17', 50]], 'qolgan avans 50');
    assert.equal(+st.balances.USD, 749.44 - 200 + 150);
    const chk = (await one(d, `select public.kirim_firma_kassa_check('USD', 1000) c`)).c;
    assert.equal(chk.ok, false); assert.ok(+chk.shortfall > 0);
    // Ledger va qoldiq izchilligi: qoldiq = Σ kirim − Σ chiqim, har bir yozuvning balance_after ketma-ket
    const led = (await d.query(`select direction, amount::numeric a, balance_after::numeric b from firma_kassa_ledger where currency='USD' order by id`)).rows;
    let run = 0; for (const r of led) { run = Math.round((run + (r.direction === 'in' ? +r.a : -r.a)) * 100) / 100; assert.equal(+r.b, run, 'balance_after ketma-ket to\'g\'ri'); }
    assert.equal(run, await bal('USD'));
    // Ruxsatlar: brauzer (anon/authenticated) hech narsani o'qiy/chaqira olmaydi
    const g = await one(d, `select has_table_privilege('anon','public.firma_kassa_ledger','select') a1, has_table_privilege('authenticated','public.firma_kassa_balance','update') a2,
      has_function_privilege('authenticated','public._fk_cash_move(text,text,numeric,text,text,text,text,text,text,text,text,bigint,text,text)','execute') a3,
      has_function_privilege('anon','public.firma_kassa_get_balance()','execute') a4,
      has_function_privilege('service_role','public._fk_cash_move(text,text,numeric,text,text,text,text,text,text,text,text,bigint,text,text)','execute') s1,
      (select relrowsecurity from pg_class where oid='public.firma_kassa_ledger'::regclass) rls`);
    assert.deepEqual(g, { a1: false, a2: false, a3: false, a4: false, s1: true, rls: true });
  } finally { await d.close(); }
}

async function testDealerSaleServerSidePricing() {
  const d = await db(SCHEMA);
  const U = '44444444-4444-4444-4444-444444444444';
  try {
    await d.exec(`insert into auth.users values ('${U}');
      insert into dealers (id, auth_user_id, login, name, filial, debt_usd, points) overriding system value values (7, '${U}', 'd', 'Diller', 'baza', 0, 0);
      insert into dealer_stock (dealer_id, pid, sku, name, qty, avg_cost_usd) values (7, 101, 'S', 'Drel', 10, 8);
      insert into catalog_products (id, filial, name, qty, optim_price, point_pct) values (101, 'baza', 'Drel', 5, 12, 10);
      update app_data set data = jsonb_set(data, '{settings}', '{"pointUsdValue": 2, "pointRoundStep": 1}') where id='main';
      grant usage on schema public to authenticated;`);
    await d.exec(`select set_config('request.jwt.claim.sub', '${U}', false); set role authenticated;`);
    // Diller optim narxni 0, ballni 9999 qilib yuborsa ham — server o'zi hisoblaydi
    await d.query(`select public.record_dealer_sale(101, 2, 20, 'S', 'Drel', 9999, 0)`);
    await d.exec('reset role');
    const r = await one(d, `select debt_usd::numeric debt, points::numeric pts, total_sold_usd::numeric sold, (select qty from dealer_stock where dealer_id=7 and pid=101)::numeric stock from dealers where id=7`);
    assert.deepEqual({ debt: +r.debt, pts: +r.pts, sold: +r.sold, stock: +r.stock }, { debt: 24, pts: 2, sold: 40, stock: 8 },
      'qarz = 2 × optim(12) = 24; ball = (40 × 10% / 2) = 2; 9999 va 0 e\'tiborsiz (J3)');
    await d.exec(`set role authenticated;`);
    await assert.rejects(d.query(`select public.record_dealer_sale(101, 99, 20, 'S', 'Drel', 0, 0)`), /yetarli mahsulot/, 'qoldiqdan ortiq sotib bo\'lmaydi');
    await assert.rejects(d.query(`select public.record_dealer_sale(101, 1, -5, 'S', 'Drel', 0, 0)`), /Narx/, 'manfiy narx yo\'q');
    await d.exec('reset role');
    // 37-migratsiya: eski (narxsiz) 5 va 6 argumentli variantlar o'chirilgan; ilova chaqiradigan 7 argumentlisi ochiq
    const old = await one(d, `select to_regprocedure('public.record_dealer_sale(bigint,numeric,numeric,text,text)') is null v5,
      to_regprocedure('public.record_dealer_sale(bigint,numeric,numeric,text,text,numeric)') is null v6,
      has_function_privilege('authenticated','public.record_dealer_sale(bigint,numeric,numeric,text,text,numeric,numeric)','execute') v7`);
    assert.deepEqual(old, { v5: true, v6: true, v7: true }, "eski (narxsiz) variantlar yo'q, yangisi dillerga ochiq");
    const g = await one(d, `select has_function_privilege('anon','public.partner_ledger_add_atomic(bigint,text,numeric,text,text,text,text)','execute') a,
      has_function_privilege('authenticated','public.partner_upsert_atomic(bigint,text,boolean,numeric,text,text,numeric,text,numeric)','execute') b,
      has_function_privilege('service_role','public.partner_monthly_calc_atomic(text,date,date,numeric,numeric)','execute') c`);
    assert.deepEqual(g, { a: false, b: false, c: true }, 'hamkor funksiyalari — faqat server');
  } finally { await d.close(); }
}

module.exports = {
  name: 'P11 — v10: Firma Kassa va diller savdosi — haqiqiy PostgreSQL (PGlite)',
  cases: [
    { name: "production qismi = production; production + 23-migratsiya = schema.sql; takror xavfsiz", run: testProductionSliceAndMigrationEquality },
    { name: "Firma Kassa: faqat USD/UZS, manfiy yo'q, idempotent, avans, ledger izchilligi, brauzerga yopiq", run: testFirmaKassaLedger },
    { name: "Diller savdosi: qarz/ball serverda, eski variantlar yopiq, hamkor funksiyalari faqat server", run: testDealerSaleServerSidePricing },
  ],
};
