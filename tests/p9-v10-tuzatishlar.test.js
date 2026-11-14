// P9 — v10: egasi tasdiqlagan 3 ta baza tuzatishi (2026-10-01, 22-migratsiya).
// Qo'riqlanadi:
//  • partner_upsert_atomic: bo'sh asosiy blokda ham birinchi hamkor JSON'ga yoziladi va
//    app_data.updated_at yangilanadi (avval jsonb_set'ning 4-argumentiga "updated_at = now()"
//    taqqoslash natijasi ketib, kalit yaratilmasdi — REGRESSIYA testi);
//  • product-images saqlagichi: anon va xodim bo'lmagan foydalanuvchi (diller) rasm yuklay /
//    o'zgartira / o'chira olmaydi; faol xodim — oladi; o'chirilgan (active=false) xodim — yo'q;
//    ko'rish hammaga ochiq qoladi;
//  • catalog_products.image: faqat https havola (data:/javascript: rad etiladi);
//    catalog-full-sync faqat https rasmni yozadi; diller portali rasmni xavfsiz chizadi;
//  • 22-migratsiya fayli yangi sxema ustida takror ishlatilsa ham hech narsa o'zgarmaydi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const { freshDb, one } = require('./p8-noldan-ornatish.test.js')._helpers;
const MIGRATION = path.join(ROOT, 'supabase-migration-22-v10-fixes.sql');

async function testPartnerUpsertOnEmptyAppData() {
  const db = await freshDb();
  try {
    await db.exec(`update app_data set data='{}'::jsonb, updated_at='2000-01-01' where id='main'`);
    const r = await one(db, `select * from partner_upsert_atomic(1, 'Ali', true, 0, null, null, 1000, 'BUSINESS_OWNER', 60)`);
    assert.equal(r.is_new, true);
    let app = await one(db, `select data, updated_at > '2001-01-01' fresh from app_data where id='main'`);
    assert.deepEqual(app.data.partners.map(p => [p.id, p.name, +p.invested]), [[1, 'Ali', 1000]], "Bo'sh blokda ham birinchi hamkor yozildi");
    assert.equal(app.fresh, true, 'app_data.updated_at yangilandi');
    await db.query(`select * from partner_upsert_atomic(1, 'Ali Valiyev', true, 0, null, null, null, 'BUSINESS_OWNER', 70)`);
    app = await one(db, `select data from app_data where id='main'`);
    assert.deepEqual(app.data.partners.map(p => [p.name, +p.investmentPct]), [['Ali Valiyev', 70]], 'Tahrirlash JSONni yangiladi');
    // Hamkor jadvalda bor, JSON'da "partners" kaliti yo'q — blok NULL bo'lib qolmasligi kerak
    await db.exec(`update app_data set data='{"products":[1]}'::jsonb where id='main'`);
    await db.query(`select * from partner_upsert_atomic(1, 'Ali', true, 0, null, null, null, 'BUSINESS_OWNER', 70)`);
    app = await one(db, `select data from app_data where id='main'`);
    assert.deepEqual(app.data, { products: [1], partners: [] }, "Boshqa ma'lumotlar saqlanib qoldi");
    const led = await one(db, `select count(*)::int n, sum(credit)::numeric s from partner_ledger`);
    assert.deepEqual([led.n, +led.s], [1, 1000], "Moliyaviy yozuv o'zgarmadi: faqat boshlang'ich kapital");
  } finally { await db.close(); }
}

async function testStorageWriteOnlyActiveStaff() {
  const db = await freshDb();
  const U = { staff: '11111111-1111-1111-1111-111111111111', off: '22222222-2222-2222-2222-222222222222', dealer: '33333333-3333-3333-3333-333333333333' };
  try {
    await db.exec(`grant usage on schema storage to anon, authenticated;
      grant select, insert, update, delete on storage.objects to anon, authenticated;
      insert into auth.users values ('${U.staff}'), ('${U.off}'), ('${U.dealer}');
      insert into staff (auth_user_id, login, name, role, active) values ('${U.staff}','a','A','admin',true), ('${U.off}','b','B','admin',false);
      insert into storage.objects (bucket_id, name) values ('product-images', 'old.jpg');`);
    const as = async (role, uid, sql) => {
      await db.exec(`select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${role};`);
      try { return await db.query(sql); } finally { await db.exec('reset role'); }
    };
    const ins = (role, uid, n) => as(role, uid, `insert into storage.objects (bucket_id, name) values ('product-images', '${n}')`);
    await assert.rejects(ins('anon', null, 'a.jpg'), /row-level security/, 'anon yuklay olmaydi');
    await assert.rejects(ins('authenticated', U.dealer, 'd.jpg'), /row-level security/, 'diller (xodim emas) yuklay olmaydi');
    await assert.rejects(ins('authenticated', U.off, 'o.jpg'), /row-level security/, "o'chirilgan xodim yuklay olmaydi");
    await ins('authenticated', U.staff, 'p1-g1.jpg');
    const cnt = async () => (await one(db, `select count(*)::int n from storage.objects`)).n;
    assert.equal(await cnt(), 2, 'faol xodim yukladi');
    await as('anon', null, `delete from storage.objects`);
    await as('authenticated', U.dealer, `delete from storage.objects`);
    await as('authenticated', U.dealer, `update storage.objects set name='hack.jpg'`);
    assert.equal(await cnt(), 2, "anon/diller o'chira olmaydi");
    assert.equal((await one(db, `select count(*)::int n from storage.objects where name='hack.jpg'`)).n, 0, "diller o'zgartira olmaydi");
    assert.equal((await as('anon', null, `select name from storage.objects`)).rows.length, 2, "ko'rish ochiq");
    await as('authenticated', U.staff, `delete from storage.objects where name='old.jpg'`);   // eski (anon yuklagan) rasm ham
    assert.equal(await cnt(), 1, "xodim eski rasmni o'chira oladi");
    const g = await one(db, `select has_function_privilege('anon','private.is_active_staff()','execute') a, has_function_privilege('authenticated','private.is_active_staff()','execute') au`);
    assert.deepEqual(g, { a: false, au: true });
  } finally { await db.close(); }
}

async function testCatalogImageColumn() {
  const db = await freshDb();
  try {
    await db.exec(`insert into catalog_products (id, filial, name, image) values (1, 'baza', 'A', 'https://x.supabase.co/storage/v1/object/public/product-images/p1.jpg'), (2, 'baza', 'B', null)`);
    for (const bad of ['data:image/png;base64,AAAA', 'javascript:alert(1)', 'http://x/y.jpg', 'https://x/' + 'a'.repeat(1000)])
      await assert.rejects(db.query(`insert into catalog_products (id, filial, image) values (9, 'baza', $1)`, [bad]), /catalog_products_image_https/, bad.slice(0, 20));
  } finally { await db.close(); }
  const { _catalogImage: ci } = require('../netlify/functions/catalog-full-sync.js');
  assert.equal(ci({ images: ['https://a/1.jpg', 'https://a/2.jpg'], image: 'https://a/old.jpg' }), 'https://a/1.jpg', 'galereyaning 1-rasmi');
  assert.equal(ci({ image: 'https://a/old.jpg' }), 'https://a/old.jpg');
  assert.equal(ci({ image: 'data:image/jpeg;base64,AAAA' }), null, "data: rasm katalogga yozilmaydi");
  assert.equal(ci({}), null); assert.equal(ci(null), null);
}

// Kod migratsiyadan OLDIN deploy qilinsa ham katalog sinxronlash buzilmasligi kerak
async function testCatalogSyncWorksBeforeMigration() {
  const Module = require('module');
  const libPath = require.resolve('../netlify/functions/_lib/supabaseAdmin.js');
  const fnPath = require.resolve('../netlify/functions/catalog-full-sync.js');
  const sbPath = require.resolve('@supabase/supabase-js');
  const saved = { sb: require.cache[sbPath], key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  const mkClient = (missingColumn) => {
    const upserts = [], updates = [];
    // v24.5 (v23.10.2 dan): katalogda ilovada yo'q (o'chirilgan) mahsulot — 99 (qoldiq 4) va 98 (qoldiq 0)
    const catalog = [{ id: 7, qty: 4 }, { id: 99, qty: 4 }, { id: 98, qty: 0 }];
    const client = { upserts, updates, auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
      from: (table) => {
        let upd = null;
        const c = { select: () => c, eq: () => c, range: () => c, order: () => c,
          update: (v) => { upd = { table, v }; return c; },
          in: (col, ids) => { if (upd) updates.push({ ...upd, ids }); return Promise.resolve({ error: null }); },
          maybeSingle: async () => table === 'staff' ? { data: { id: 1, role: 'admin', active: true }, error: null }
            : { data: { data: { products: [{ id: 7, name: 'Drel', images: ['https://cdn/p7.jpg'] }, { id: 8, name: 'Arra', image: 'data:image/jpeg;base64,AA' }],
                branchStore: { baza: { batches: [{ pid: 7, qty: 5, sold: 1, costUsd: 10, date: '2026-09-01', status: 'active' }] } } } }, error: null },
          then: (ok) => ok({ data: table === 'catalog_products' ? catalog : [], error: null }),
          upsert: async (rows) => { upserts.push(rows);
            if (missingColumn && rows.some(r => 'image' in r)) return { error: { code: 'PGRST204', message: "Could not find the 'image' column of 'catalog_products' in the schema cache" } };
            return { error: null }; } };
        return c; } };
    return client;
  };
  const load = (client) => {
    require.cache[sbPath] = new Module(sbPath); require.cache[sbPath].exports = { createClient: () => client }; require.cache[sbPath].loaded = true;
    delete require.cache[libPath]; delete require.cache[fnPath];
    return require(fnPath).handler;
  };
  try {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    const ev = { httpMethod: 'POST', headers: { authorization: 'Bearer t' } };
    let cl = mkClient(false); let res = await load(cl)(ev);
    assert.equal(res.statusCode, 200, res.body); assert.equal(JSON.parse(res.body).rasm, true);
    assert.deepEqual(cl.updates.map(u => [u.table, u.v.qty, u.ids]), [['catalog_products', 0, [99]]], "ilovada yo'q, qoldiqli mahsulot — katalogda 0 (v24.5, v23.10.2 dan)");
    assert.equal(JSON.parse(res.body).eskirganNol, 1);
    assert.deepEqual(cl.upserts[0].map(r => [r.id, r.image]), [[7, 'https://cdn/p7.jpg'], [8, null]], 'https rasm yozildi, data: — yo\'q');
    cl = mkClient(true); res = await load(cl)(ev);
    assert.equal(res.statusCode, 200, "Ustun yo'q bazada ham katalog yangilandi");
    assert.equal(JSON.parse(res.body).rasm, false);
    assert.ok(cl.upserts[1].every(r => !('image' in r)) && cl.upserts[1].length === 2, 'Qayta urinish — rasmsiz');
  } finally {
    if (saved.sb) require.cache[sbPath] = saved.sb; else delete require.cache[sbPath];
    delete require.cache[libPath]; delete require.cache[fnPath];
    if (saved.key) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key; else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
}

function testDealerPortalShowsImages() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'diller.js'), 'utf8');
  assert.match(src, /imgOf: dlImgOf/, 'Statistika reytingida rasm');
  assert.match(src, /dlThumbHtml\(p\.id\)/, "Buyurtma ro'yxatida rasm");
  const shared = fs.readFileSync(path.join(ROOT, 'js', 'shared.js'), 'utf8').match(/function fwImgSafe[^\n]+/)[0];
  const fns = ['dlImgOf', 'dlThumbHtml'].map(n => src.match(new RegExp(`function ${n}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0]).join('\n');
  const ctx = { CATALOG: [{ id: 1, image: 'https://a/1.jpg?x=1&y=2' }, { id: 2, image: 'javascript:alert(1)' }, { id: 3 }],
    esc: s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') };
  vm.runInNewContext(shared + '\n' + fns + '\nthis.r=[dlThumbHtml(1), dlThumbHtml(2), dlThumbHtml(3), dlImgOf(2)];', ctx);
  assert.match(ctx.r[0], /<img src="https:\/\/a\/1\.jpg\?x=1&amp;y=2"/);
  assert.ok(!ctx.r[1].includes('javascript') && ctx.r[1].includes('📦'), 'xavfli havola chizilmaydi');
  assert.ok(ctx.r[2].includes('📦')); assert.equal(ctx.r[3], '');
}

async function testMigrationIdempotentOnNewSchema() {
  const db = await freshDb();
  try {
    const snap = async () => one(db, `select (select count(*) from pg_policies)::int pol,
      (select count(*) from pg_constraint k join pg_namespace n on n.oid=k.connamespace where n.nspname='public' and k.contype in ('p','u','c','f','x'))::int cons,
      (select md5(prosrc) from pg_proc where proname='partner_upsert_atomic') fn,
      (select string_agg(policyname||':'||coalesce(qual,'')||':'||coalesce(with_check,''), ',' order by policyname) from pg_policies where schemaname='storage') sp`);
    const before = await snap();
    const mig = fs.readFileSync(MIGRATION, 'utf8');
    await db.exec(mig); await db.exec(mig);
    assert.deepEqual(await snap(), before, "Migratsiya = schema.sql holati; takror ishga tushirish xavfsiz");
    assert.doesNotMatch(mig, /\bdrop\s+(table|column|function|schema)\b|\bdelete\s+from\b|\btruncate\b/i, "Migratsiya ma'lumot o'chirmaydi");
  } finally { await db.close(); }
}

module.exports = {
  name: 'P9 — v10: hamkor funksiyasi, rasm saqlagichi himoyasi, diller katalogida rasm',
  cases: [
    { name: "partner_upsert_atomic: bo'sh blokda birinchi hamkor yoziladi, updated_at yangilanadi (regressiya)", run: testPartnerUpsertOnEmptyAppData },
    { name: "Rasm saqlagichi: faqat faol xodim yozadi/o'chiradi; anon, diller, o'chirilgan xodim — yo'q", run: testStorageWriteOnlyActiveStaff },
    { name: "catalog_products.image: faqat https; sinxronlash faqat https rasmni yozadi", run: testCatalogImageColumn },
    { name: "Katalog sinxronlash: https rasm yoziladi; image ustuni hali yo'q bazada ham ishlaydi (rasmsiz)", run: testCatalogSyncWorksBeforeMigration },
    { name: "Diller portali: buyurtma ro'yxati va reytingda rasm, xavfli havola chizilmaydi", run: testDealerPortalShowsImages },
    { name: "22-migratsiya = schema.sql holati, takror ishga tushirish xavfsiz, ma'lumot o'chirmaydi", run: testMigrationIdempotentOnNewSchema },
  ],
};
