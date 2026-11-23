// P138 — v25.8 AI-reklama, 1-bosqich (58-migratsiya): reklama uchun TOVAR TANLASH (server).
// HAQIQIY PostgreSQL (PGlite, to'liq schema.sql + 58) + HAQIQIY `ai-ads` funksiyasi; partiyalar va savdolar — bazadagi jurnal (prod kabi).
//  • Mezonlar: chegirma (shop.discounts), yangi (birinchi kirim 14 kun ichida; qayta kirim — yangi emas; kirim sanasi bo'lmasa — ID dagi vaqt;
//    ikkalasi ham yo'q — yangi emas), turib qolgan (qoldiq bor, 30 kun sotilmagan, omborga 30 kundan oldin kelgan), top (30 kun, top N).
//  • Chiqmaydi: rasmsiz, qoldiqsiz, arxiv, Direct Sale, «Reklama qilmaslik». 7 kunda reklama qilingani — pastga.
//  • Narx — serverda (vitrina bilan bir xil), chegirmada eski narx; tannarx javobda yo'q.
//  • Ruxsat: deny-by-default (403), sozlama — reklama.settings; do'kon o'chiq — 409 SHOP_OFF; 58 yo'q — 409 MIGRATION58_PENDING.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');
const AA = require('../netlify/functions/_lib/aiAds');

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG58 = fs.readFileSync(path.join(ROOT, 'supabase-migration-58-ai-reklama.sql'), 'utf8');
const PG_TABLES = ['app_data', 'app_data_branches', 'batches', 'sales', 'ledger_ops', 'customer_balances', 'supplier_balances', 'cashbox_balances',
  'ai_ad_posts', 'ai_ad_settings', 'ai_usage', 'idempotency_keys'];
const DAY = 86400000;
const tz = (minus) => new Date(Date.now() + 5 * 3600000 - minus * DAY).toISOString().slice(0, 10);
const IMG = ['https://x.supabase.co/storage/v1/object/public/product-images/p.webp'];
const uidAt = (minus) => (Date.now() - minus * DAY) * 1000;
const P11 = uidAt(3);   // ID ichidagi vaqt — 3 kun oldin

const PRODUCTS = [
  { id: 1, sku: 'D-1', name: 'Disk chegirmada', cat: 'Disklar', markupPct: 25, images: IMG },
  { id: 2, sku: 'Y-2', name: 'Yangi drel', cat: 'Drellar', markupPct: 25, images: IMG, desc: 'Kuchli drel' },
  { id: 3, sku: 'E-3', name: 'Eski arra', cat: 'Arralar', markupPct: 25, images: IMG },
  { id: 4, sku: 'T-4', name: 'Top mahsulot', cat: 'Disklar', markupPct: 25, images: IMG },
  { id: 5, sku: 'R-5', name: 'Rasmsiz yangi', cat: 'Disklar', markupPct: 25 },
  { id: 6, sku: 'Q-6', name: 'Qoldiqsiz yangi', cat: 'Disklar', markupPct: 25, images: IMG },
  { id: 7, sku: 'A-7', name: 'Arxiv yangi', cat: 'Disklar', markupPct: 25, images: IMG, archived: true },
  { id: 8, sku: 'N-8', name: 'Reklama qilinmasin', cat: 'Disklar', markupPct: 25, images: IMG, noAds: true },
  { id: 9, sku: 'S-9', name: 'Direct yangi', cat: 'Disklar', markupPct: 25, images: IMG, directSale: true, dsCostUsd: 5 },
  { id: 10, sku: 'K-10', name: 'Yaqinda reklama qilingan', cat: 'Disklar', markupPct: 25, images: IMG },
  { id: P11, sku: 'I-11', name: 'ID vaqti bilan yangi', cat: 'Disklar', markupPct: 25, images: IMG },
  { id: 12, sku: 'Z-12', name: 'Sanasiz', cat: 'Disklar', markupPct: 25, images: IMG },
  { id: 13, sku: 'B-13', name: '10 kun oldin kelgan', cat: 'Disklar', markupPct: 25, images: IMG },
];
// [lokal ID, pid, qty, sold, sana (JSON), cost]
const BATCHES = [
  [9001, 1, 10, 2, tz(60), 10], [9002, 2, 5, 0, tz(5), 40], [9003, 3, 4, 0, tz(100), 30], [9031, 3, 2, 0, tz(3), 30],
  [9004, 4, 100, 50, tz(60), 6], [9005, 5, 3, 0, tz(2), 9], [9006, 6, 2, 2, tz(2), 9], [9007, 7, 3, 0, tz(2), 9],
  [9008, 8, 3, 0, tz(2), 9], [9010, 10, 3, 0, tz(4), 9], [9011, P11, 3, 0, '', 9], [9012, 12, 3, 0, '', 9], [9013, 13, 3, 0, tz(10), 9],
];

async function world({ with58 = true } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  const cut = SCHEMA.indexOf('-- 58-MIGRATSIYA');
  assert.ok(cut > 0, "schema.sql: 58-migratsiya bo'limi bor");
  await pg.exec(with58 ? SCHEMA : SCHEMA.slice(0, SCHEMA.lastIndexOf('\n', SCHEMA.lastIndexOf('-- ════', cut))));
  if (with58) await pg.exec(MIG58);   // takror — xavfsiz
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12500, tgAnnounceChats: ['@powerful_kanal'], tgBotToken: '123456:' + 'x'.repeat(30) }, products: PRODUCTS })]);
  const shop = { settings: { enabled: true, name: 'Powerful', slug: 'powerful', currency: 'UZS' }, discounts: [{ pid: 1, priceUsd: 8 }], orders: [], reviews: [] };
  await pg.query(`insert into app_data_branches (branch_key, data) values ('baza', $1::jsonb), ('f2', $2::jsonb)`, [
    JSON.stringify({ shop, batches: BATCHES.map(([id, pid, qty, sold, date, cost]) => ({ id, pid, qty, sold, date, costUsd: cost, status: 'active' })), sales: [] }),
    JSON.stringify({ shop: { settings: { enabled: false } }, batches: [] })]);
  await pg.query(`select set_config('fw.stock_move', '1', false)`);   // sinov ma'lumoti: ombor jurnali triggeri o'tkazadi
  for (const [id, pid, qty, sold, date, cost] of BATCHES) {
    await pg.query(`insert into batches (local_id, filial, pid, qty, sold, cost_usd, batch_date, status) values ($1, 'baza', $2, $3, $4, $5, $6, $7)`,
      [String(id), pid, qty, sold, cost, date || null, qty > sold ? 'active' : 'empty']);
  }
  await pg.query(`insert into ledger_ops (filial, op_key, kind) values ('baza', 'seed', 'sale') on conflict do nothing`).catch(() => {});
  const sale = (pid, qty, minus) => pg.query(`insert into sales (filial, inv, subtotal_usd, total_usd, cost_usd, profit_usd, paid_usd, items, created_at, sale_date, status)
    values ('baza', $1, 1, 1, 1, 0, 1, $2::jsonb, now() - ($3 || ' days')::interval, ($4)::date, 'done')`, ['I' + pid + '-' + minus, JSON.stringify([{ pid, qty }]), String(minus), tz(minus)]);
  await sale(4, 50, 10); await sale(1, 2, 5); await sale(3, 1, 45);   // 3 — 45 kun oldin (oynadan tashqari → turib qolgan)
  await pg.query(`select set_config('fw.stock_move', '', false)`);
  if (with58) await pg.query(`insert into ai_ad_posts (branch_id, product_id, status, source, created_at) values ('baza', 10, 'sent', 'manual', now() - interval '2 days')`);
  const role = (rid, keys) => keys.map(k => ({ role_id: rid, permission_id: k, permissions: { key: k } }));
  const memTables = {
    staff: [{ id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
      { id: 7, auth_user_id: 'u-s0', role: 'sotuvchi', active: true, filial: 'baza', name: 'Huquqsiz', login: 's0' },
      { id: 8, auth_user_id: 'u-s1', role: 'sotuvchi', active: true, filial: 'baza', name: 'Koruvchi', login: 's1' },
      { id: 9, auth_user_id: 'u-s2', role: 'sotuvchi', active: true, filial: 'baza', name: 'Sozlovchi', login: 's2' },
      { id: 10, auth_user_id: 'u-f2', role: 'sotuvchi', active: true, filial: 'f2', name: 'Filial 2', login: 'f2' }],
    staff_roles: [{ staff_id: 7, role_id: 'r0' }, { staff_id: 8, role_id: 'r1' }, { staff_id: 9, role_id: 'r2' }, { staff_id: 10, role_id: 'r1' }],
    role_permissions: [...role('r0', ['savdo.create', 'sozlamalar.edit']), ...role('r1', ['reklama.view']), ...role('r2', ['reklama.view', 'reklama.settings'])],
    staff_audit_log: [], security_events: [],
  };
  require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
  const users = { 't-admin': { id: 'u-admin' }, 't-s0': { id: 'u-s0' }, 't-s1': { id: 'u-s1' }, 't-s2': { id: 'u-s2' }, 't-f2': { id: 'u-f2' } };
  return { pg, client: makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users }) };
}
const B = (r) => JSON.parse(r.body);

async function testCriteria() {
  const { pg, client } = await world();
  try {
    const h = loadFunction('ai-ads', client);
    const r = await h(post({ action: 'candidates' }, 't-s1'));
    assert.equal(r.statusCode, 200, r.body);
    const items = B(r).items, by = Object.fromEntries(items.map(x => [String(x.pid), x]));
    const ids = items.map(x => String(x.pid));
    // chiqmaydiganlar
    for (const pid of [5, 6, 7, 8, 9, 12]) assert.ok(!by[pid], `pid ${pid} chiqmasligi kerak`);
    // mezonlar
    assert.deepEqual(by[1].reasons.sort(), ['discount', 'top'], 'chegirma + top (30 kunda sotilgan)');
    assert.deepEqual(by[2].reasons, ['new'], 'birinchi kirim 5 kun oldin');
    assert.deepEqual(by[3].reasons, ['stuck'], 'eski arra: 100 kun oldin kelgan, qayta kirim 3 kun oldin — YANGI EMAS; 30 kun sotilmagan');
    assert.deepEqual(by[4].reasons, ['top']);
    assert.deepEqual(by[String(P11)].reasons, ['new'], 'kirim sanasi yo\'q — ID dagi vaqt');
    assert.deepEqual(by[13].reasons, ['new'], '10 kun oldin kelgan: yangi, lekin turib qolgan emas');
    // narx — serverda (vitrina qoidasi): chegirma 8$ × 12 500 = 100 000; eski (chakana) 10 × 1.25 = 12.5$ → butun $ ga 13$ → 162 500 → 163 000
    assert.equal(by[1].price, 100000); assert.equal(by[1].old, 163000); assert.equal(by[1].cur, 'UZS');
    assert.equal(by[1].line, '100 000 soʻm'); assert.equal(by[1].oldLine, '163 000 soʻm');
    assert.equal(by[2].old, null);
    // tannarx/partiya chiqmaydi
    const raw = r.body;
    for (const bad of ['costUsd', 'cost_usd', 'markupPct', 'batches', 'profit']) assert.ok(!raw.includes('"' + bad + '"'), `javobda ${bad} yo'q`);
    // 7 kunda reklama qilingan — eng oxirida
    assert.equal(ids[ids.length - 1], '10'); assert.ok(by[10].recentAt);
    assert.equal(items.filter(x => x.recentAt).length, 1);
    // sozlama: «yangi» mezoni o'chirilsa — faqat yangi bo'lganlar yo'qoladi
    let s = await h(post({ action: 'settings_save', settings: { criteria: { new: false } } }, 't-s2'));
    assert.equal(s.statusCode, 200, s.body);
    const r2 = B(await h(post({ action: 'candidates' }, 't-s1'))).items.map(x => String(x.pid));
    assert.ok(!r2.includes('2') && !r2.includes('13') && r2.includes('1') && r2.includes('3'));
    // top N = 1 — faqat eng ko'p sotilgan
    await h(post({ action: 'settings_save', settings: { criteria: { new: false, topN: 1, discount: false } } }, 't-s2'));
    const r3 = B(await h(post({ action: 'candidates' }, 't-s1'))).items;
    assert.deepEqual(r3.filter(x => x.reasons.includes('top')).map(x => x.pid), [4]);
  } finally { unloadFunctions(); await pg.close(); }
}

async function testAccess() {
  const { pg, client } = await world();
  try {
    const h = loadFunction('ai-ads', client);
    let r = await h(post({ action: 'candidates' }, 't-s0'));
    assert.equal(r.statusCode, 403, 'reklama.view yo\'q — 403 (sozlamalar.edit ham yetmaydi)');
    r = await h(post({ action: 'settings_save', settings: {} }, 't-s1'));
    assert.equal(r.statusCode, 403, 'faqat ko\'rish huquqi — saqlay olmaydi');
    r = await h(post({ action: 'nimadir' }, 't-admin'));
    assert.equal(r.statusCode, 400);
    r = await h(post({ action: 'settings_save', settings: { channel: 'kanal bo\'shliq bilan' } }, 't-s2'));
    assert.equal(r.statusCode, 400); assert.match(B(r).error, /Kanal/);
    r = await h(post({ action: 'settings_save', settings: { channel: '@reklama_kanal', lang: 'ru', autopilot: { perDay: 9, hours: [10, 18, 25] } } }, 't-s2'));
    const st = B(r).settings;
    assert.equal(st.channel, '@reklama_kanal'); assert.equal(st.lang, 'ru'); assert.equal(st.autopilot.perDay, 5, '1–5 oralig\'ida'); assert.deepEqual(st.autopilot.hours, [10, 18]);
    // status: kanal — sozlamadagi; bo'sh bo'lsa tgAnnounceChats ning birinchisi; token javobda yo'q
    r = await h(post({ action: 'status' }, 't-s1'));
    assert.equal(r.statusCode, 200);
    assert.equal(B(r).telegram.channel, '@reklama_kanal'); assert.ok(!r.body.includes('xxxxxxxx'), 'token chiqmaydi');
    assert.equal(B(r).ai.on, false); assert.equal(B(r).ai.limit, 300);
    await h(post({ action: 'settings_save', settings: { channel: '' } }, 't-admin'));
    assert.equal(B(await h(post({ action: 'status' }, 't-admin'))).telegram.channel, '@powerful_kanal');
    // filial: xodim — faqat o'z filiali; do'kon o'chiq filial — 409
    r = await h(post({ action: 'candidates', filial: 'f2' }, 't-s1'));
    assert.equal(r.statusCode, 200, 'xodim boshqa filialni so\'rasa — o\'z filiali (baza)');
    r = await h(post({ action: 'candidates' }, 't-f2'));
    assert.equal(r.statusCode, 409); assert.equal(B(r).code, 'SHOP_OFF');
    r = await h(post({ action: 'candidates', filial: 'f2' }, 't-admin'));
    assert.equal(r.statusCode, 409);
    // filial sozlamalari alohida
    await h(post({ action: 'settings_save', filial: 'f2', settings: { lang: 'ru' } }, 't-admin'));
    assert.equal(B(await h(post({ action: 'settings_get' }, 't-s1'))).settings.lang, 'uz');
    // brauzer rollari jadvallarga bevosita kira olmaydi
    await pg.exec(`grant usage on schema public to authenticated; set role authenticated;`);
    for (const t of ['ai_ad_posts', 'ai_ad_settings', 'ai_usage']) await assert.rejects(pg.query(`select * from ${t}`), /permission denied/);
    await assert.rejects(pg.query(`select public.ai_usage_take('2026-11', 300)`), /permission denied/);
    await pg.exec('reset role');
  } finally { unloadFunctions(); await pg.close(); }
}

async function testNo58() {
  const { pg, client } = await world({ with58: false });
  try {
    const h = loadFunction('ai-ads', client);
    const r = await h(post({ action: 'candidates' }, 't-admin'));
    assert.equal(r.statusCode, 409, r.body); assert.equal(B(r).code, 'MIGRATION58_PENDING');
  } finally { unloadFunctions(); await pg.close(); }
}

async function testUnits() {
  // ID dagi vaqt: uid() (ms × 1000) — sana; kichik ID — null
  assert.equal(AA.idDate(1), null); assert.equal(AA.idDate(1794911080108777), '2026-11-17');
  // birinchi kirim — eng erta sana (qayta kirim emas)
  const m = AA.firstKirimMap([{ pid: 3, date: '2026-11-20' }, { pid: 3, date: '2026-08-01' }, { pid: 4, date: '' }]);
  assert.equal(m.get('3'), '2026-08-01'); assert.equal(m.has('4'), false);
  // sozlamalar chegaralari
  const s = AA.normalizeSettings({ criteria: { newDays: 999, topN: 0 }, autopilot: { mode: 'auto', perDay: 0 }, lang: 'en' });
  assert.equal(s.criteria.newDays, 90); assert.equal(s.criteria.topN, 1); assert.equal(s.autopilot.mode, 'auto'); assert.equal(s.autopilot.perDay, 1); assert.equal(s.lang, 'uz');
  // AI oylik hisoblagich — atomik: limit 2 da uchinchisi rad; qaytarish (xato) — hisobdan chiqadi
  const { pg } = await world();
  try {
    const take = async () => (await pg.query(`select public.ai_usage_take('2026-11', 2) v`)).rows[0].v;
    assert.deepEqual([await take(), await take(), await take()].map(x => x.ok), [true, true, false]);
    await pg.query(`select public.ai_usage_release('2026-11')`);
    assert.equal((await take()).ok, true, 'xato bo\'lgan so\'rov qaytarildi — yana bitta mumkin');
    assert.equal((await pg.query(`select count from ai_usage where month='2026-11'`)).rows[0].count, 2);
    await pg.query(`select public.ops_cleanup()`);
    await pg.query(`update ai_ad_posts set created_at = now() - interval '91 days'`);
    await pg.query(`select public.ops_cleanup()`);
    assert.equal(+(await pg.query(`select count(*)::int c from ai_ad_posts`)).rows[0].c, 0, '90 kundan eski postlar tozalandi');
  } finally { await pg.close(); }
}

// Mahsulot kartasi: «Reklama qilmaslik» belgisi saqlanadi (vitrinaga ta'sir qilmaydi — faqat AI-reklama)
async function testNoAdsFlag() {
  const { openPage } = require('./p4-responsive.test.js')._helpers;
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const r = await page.evaluate(async () => {
      save = async () => true; fwSaveToast = async () => true;
      S.products = [{ id: 1, sku: 'A1', name: 'Drel', markupPct: 25 }];
      editProduct(1); const before = document.getElementById('ep-no-ads').checked;
      document.getElementById('ep-no-ads').checked = true; await pmfSave();
      const on = S.products[0].noAds;
      editProduct(1); const shown = document.getElementById('ep-no-ads').checked;
      document.getElementById('ep-no-ads').checked = false; await pmfSave();
      return { before, on, shown, off: S.products[0].noAds, labels: PERMISSIONS_CATALOG.filter(x => x.module === 'reklama').map(x => x.key) };
    });
    assert.deepEqual([r.before, r.on, r.shown, r.off], [false, true, true, false]);
    assert.deepEqual(r.labels, ['reklama.view', 'reklama.create', 'reklama.publish', 'reklama.settings'], 'Rollar oynasida yangi ruxsatlar');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

module.exports = {
  name: 'P138 — AI-reklama 1-bosqich: nomzodlar (server), sozlamalar, ruxsatlar, 58-migratsiya',
  cases: [
    { name: 'mezonlar: chegirma, yangi (birinchi kirim / ID vaqti), turib qolgan, top N; istisnolar; 7 kunlik takror pastga; narx serverda', run: testCriteria },
    { name: 'ruxsatlar (403), sozlama tekshiruvi, kanal zaxirasi, filial bo\'yicha, do\'kon o\'chiq — 409; brauzer rollari jadvalga kira olmaydi', run: testAccess },
    { name: '58 qo\'llanmagan — 409 MIGRATION58_PENDING', run: testNo58 },
    { name: 'mahsulot kartasi: «Reklama qilmaslik» belgisi saqlanadi va qayta ochilganda ko\'rinadi', run: testNoAdsFlag },
    { name: 'birliklar: ID sanasi, birinchi kirim, sozlama chegaralari, AI hisoblagichi atomik, 90 kunlik tozalash', run: testUnits },
  ],
};
