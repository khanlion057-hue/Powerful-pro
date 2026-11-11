// P65 — v24.8 (37-migratsiya): MAXFIYLIK (K2), CHEGIRMA CHEGARASI, DIRECT SALE, YOZISHDA POYGA (Y2).
// HAQIQIY server funksiyalari (app-data-load, app-data-save, app-data-branch-save, sale-checkout-atomic) +
// HAQIQIY PostgreSQL (PGlite, to'liq schema.sql — 37 bilan). Egasi qarorlari (2026-10-17):
//   • tannarx — faqat admin va «tannarx.view»; hamkorlar — admin va hamkorlar.*; qolganlarga narx serverdan tayyor;
//   • chegirma ≤ settings.maxDiscountPct (standart 10%), asos — savdo rejimiga qarab (chakana / optom); admin — cheklanmaydi;
//   • Direct Sale: mahsulotga ta'minotchi va narx oldindan belgilanmagan bo'lsa — admin bo'lmasa rad;
//   • eski versiya bilan yozuv — 409; ikki parallel saqlashdan biri aniq 409 oladi, qayta urinishda ikkala o'zgarish saqlanadi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');
const P = require('../netlify/functions/_lib/pricing');

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG = (n) => fs.readFileSync(path.join(ROOT, n), 'utf8');
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger',
  'sales', 'batches', 'customer_balances', 'supplier_balances', 'customer_debt_payments', 'supplier_payments', 'home_withdrawals',
  'idempotency_keys', 'ledger_ops', 'customer_debt_ledger', 'supplier_debt_ledger', 'stock_ledger', 'fw_notifications', 'fw_audit_events',
  'customer_credit_balances', 'customer_credit_ledger', 'sale_credit_uses', 'supplier_advance_balances', 'supplier_advance_ledger'];
const SID = 1759300000000456;
const BOXES = [{ id: 1, name: "Naqd So'm", cur: 'UZS', type: 'cash', bal: 0 }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 0 }];
const PRODUCTS = [
  { id: 101, sku: 'A-101', name: 'Drel', unit: 'dona' },                                              // tannarx 5 → chakana 6, optom 5.75
  { id: 103, sku: 'A-103', name: 'Arra', unit: 'dona', markupPct: 200, optMarkupPct: 100 },           // tannarx 5 → chakana 15, optom 10
  { id: 104, sku: 'A-104', name: 'Belgilanmagan', unit: 'dona', directSale: true },                   // Direct Sale — ta'minotchi/narx yo'q
  { id: 105, sku: 'A-105', name: 'Buyurtma', unit: 'dona', directSale: true, dsSuppId: SID, dsCostUsd: 4, markupPct: 50 },  // chakana 6
];
const BRANCH = {
  cashboxes: BOXES, cashTxns: [], expenses: [],
  customers: [{ id: 501, name: 'Ali', debt: 0 }],
  suppliers: [{ id: SID, name: 'Xitoy MChJ', debt: 0, paid: 0 }],
  batches: [
    { id: 9001, pid: 101, bno: '01', qty: 10, sold: 0, costUsd: 5, date: '2026-09-01', status: 'active', items: [{ name: 'Drel', costUsd: 5 }], rates: { usdUzs: 12000 } },
    { id: 9003, pid: 103, bno: '01', qty: 10, sold: 0, costUsd: 5, date: '2026-09-01', status: 'active' },
  ],
  sales: [{ id: 's0', inv: 'INV-0', date: '2026-09-02', items: [{ pid: 101, qty: 1, sellUsd: 6, costUsd: 5 }], totalUsd: 6, costUsd: 5, profitUsd: 1 }],
};
const PERMS = {
  r_sel: ['savdo.create', 'savdo.direct_sale', 'mijozlar.edit', 'xarajatlar.create'],
  r_tan: ['savdo.create', 'tannarx.view', 'hamkorlar.view'],
};
const USERS = { 't-sel': { id: 'u-sel' }, 't-tan': { id: 'u-tan' }, 't-adm': { id: 'u-adm' } };

async function world() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  await pg.exec(SCHEMA);
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({
    settings: { usdUzs: 12000 }, products: PRODUCTS,
    partners: [{ id: 1, name: 'Hamkor A', invested: 5000, filial: 'f729' }], partnerPeriods: [{ id: 'pp1', profitUsd: 100 }],
    branchStore: { f729: { cashboxes: BOXES } } })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('f729', $1::jsonb)`, [JSON.stringify(BRANCH)]);
  // JSON'dagi partiyalar bazaga (production'dagi kabi); 27 qayta ishlagani uchun undan keyingilar ham qayta (takror xavfsiz)
  for (const m of ['supabase-migration-27-f4b-ledger-authority.sql', 'supabase-migration-31-tahrir-muddati-audit-bildirishnoma.sql',
    'supabase-migration-32-reviziya-tasdiq-direct-sale.sql', 'supabase-migration-33-taminotchi-zaklad.sql', 'supabase-migration-34-mijoz-haqi.sql',
    'supabase-migration-35-diller-ombor-atomik.sql', 'supabase-migration-36-filial-otkazma.sql', 'supabase-migration-37-maxfiylik-chegirma-versiya.sql']) await pg.exec(MIG(m));
  const memTables = {
    staff: [{ id: 7, auth_user_id: 'u-sel', role: 'sotuvchi', active: true, filial: 'f729', name: 'Sotuvchi', login: 'sel' },
            { id: 8, auth_user_id: 'u-tan', role: 'sotuvchi', active: true, filial: 'f729', name: 'Menejer', login: 'tan' },
            { id: 1, auth_user_id: 'u-adm', role: 'admin', active: true, filial: 'f729', name: 'Egasi', login: 'adm' }],
    staff_roles: [{ staff_id: 7, role_id: 'r_sel' }, { staff_id: 8, role_id: 'r_tan' }],
    role_permissions: Object.entries(PERMS).flatMap(([r, ks]) => ks.map(k => ({ role_id: r, permission_id: k, permissions: { key: k } }))),
    staff_audit_log: [],
  };
  require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
  require('../netlify/functions/_lib/cashAuthority')._resetCashAuthorityCache();
  require('../netlify/functions/_lib/appDataVersion')._resetVersionCache();
  const aa = require('../netlify/functions/_lib/auditAuthority'); aa._resetV31Cache && aa._resetV31Cache(); aa._resetV34Cache && aa._resetV34Cache();
  const client = makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: USERS });
  const fn = (n) => { const h = loadFunction(n, client); return async (b, tok) => { const r = await h(post(b, tok)); return { status: r.statusCode, body: JSON.parse(r.body || '{}') }; }; };
  return { pg, load: fn('app-data-load'), save: fn('app-data-save'), bsave: fn('app-data-branch-save'), sale: fn('sale-checkout-atomic') };
}
async function withWorld(f) { const w = await world(); try { await f(w); } finally { unloadFunctions(); await w.pg.close(); } }
const one = async (pg, sql, p) => (await pg.query(sql, p)).rows[0];
let _n = 0;
const ck = (items, { disc = 0, mode, tok = 't-sel' } = {}) => {
  const tot = Math.round(items.reduce((s, i) => s + i.qty * i.sellUsd, 0) * (1 - disc / 100) * 100) / 100;
  const k = 'ck-p65-' + (++_n);
  return [{ filial: 'f729', items: items.map(i => ({ sku: 'x', name: 'x', costUsd: 0, ...i })), discPct: disc, paidUsd: tot, boxPayments: [{ box_id: 3, amount_native: tot }],
    inv: 'I-' + k, idemKey: k, saleLocalId: 's' + k, payType: 'usd', custName: 'X', ...(mode ? { priceMode: mode } : {}) }, tok];
};

// ── 1. K2: tannarx va hamkorlar — faqat ruxsat egasiga ─────────────────────────
async function testLoadRedaction() {
  await withWorld(async (w) => {
    const sel = await w.load({}, 't-sel');
    assert.equal(sel.status, 200);
    const txt = JSON.stringify(sel.body.data);
    assert.doesNotMatch(txt, /costUsd|dsCostUsd|cost_usd|"invested"|partnerPeriods|profitUsd/, 'sotuvchi javobida tannarx/foyda/hamkor puli yo\'q');
    const pr = Object.fromEntries(sel.body.data.products.map(p => [p.id, p]));
    assert.deepEqual([pr[101].retailUsd, pr[101].optUsd, pr[103].retailUsd, pr[103].optUsd, pr[105].retailUsd], [6, 5.75, 15, 10, 6], 'narx serverdan tayyor');
    assert.equal(pr[105].dsReady, true); assert.equal(pr[104].dsReady, false, 'belgilanmagan Direct Sale — tayyor emas');
    const b = sel.body.data.branchStore.f729;
    assert.equal(b.batches.find(x => x.id === 9001).qty, 10, 'qoldiq bor (sotish uchun)');
    assert.equal(b.batches.find(x => x.id === 9001).items, undefined, 'partiya qatorlari (tannarx bilan) yo\'q');
    assert.deepEqual(sel.body.data.partners.map(p => Object.keys(p).sort()), [['filial', 'id', 'name']], 'xarajat uchun faqat hamkor nomi');
    assert.equal(sel.body.data.costHidden, true);
    // tannarx.view + hamkorlar.view — ko'radi
    const tan = await w.load({}, 't-tan');
    const t = tan.body.data;
    assert.equal(t.products.find(p => p.id === 105).dsCostUsd, 4);
    assert.equal(t.branchStore.f729.batches.find(x => x.id === 9001).costUsd, 5);
    assert.equal(t.partners[0].invested, 5000); assert.equal(t.products[0].retailUsd, undefined, 'ruxsat egasiga narx o\'zi hisoblanadi');
    // admin — hammasi
    const adm = await w.load({}, 't-adm');
    assert.equal(adm.body.data.partnerPeriods.length, 1); assert.equal(adm.body.data.branchStore.f729.sales[0].costUsd, 5);
    assert.ok(Number.isSafeInteger(sel.body.version) && sel.body.branchVersions.f729 != null, 'versiya qaytariladi');
  });
}

async function testSaveKeepsHidden() {
  await withWorld(async (w) => {
    const sel = await w.load({}, 't-sel');
    const d = sel.body.data;
    d.branchStore.f729.customers[0].name = 'Ali aka';                  // sotuvchining haqiqiy o'zgarishi
    d.products = d.products.map(p => ({ ...p, dsCostUsd: 0.01 }));        // ataylab buzishga urinish — e'tiborsiz
    const r = await w.save({ data: d, baseVersion: sel.body.version }, 't-sel');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.doesNotMatch(JSON.stringify(r.body), /dsCostUsd|"costUsd"|invested/, 'saqlash javobida ham tannarx yo\'q');
    const main = (await one(w.pg, `select data from app_data where id='main'`)).data;
    assert.equal(main.products.find(p => p.id === 105).dsCostUsd, 4, 'Direct Sale narxi saqlandi');
    assert.equal(main.products.find(p => p.id === 101).retailUsd, undefined, 'server narxi bazaga yozilmadi');
    assert.equal(main.partners[0].invested, 5000); assert.equal(main.partnerPeriods.length, 1, 'hamkorlar o\'zgarmadi');
    const br = (await one(w.pg, `select data from app_data_branches where branch_key='f729'`)).data;
    assert.equal(br.customers[0].name, 'Ali aka');
    const b9001 = br.batches.find(x => x.id === 9001);
    assert.equal(b9001.costUsd, 5); assert.equal(b9001.items.length, 1); assert.equal(b9001.rates.usdUzs, 12000, 'partiya tannarxi va qatorlari saqlandi');
    assert.equal(br.sales[0].items[0].costUsd, 5); assert.equal(br.sales[0].profitUsd, 1, 'savdo tannarxi saqlandi');
    // filial yo'li ham (app-data-branch-save)
    const sel2 = await w.load({}, 't-sel');
    const bd = sel2.body.data.branchStore.f729; bd.customers[0].name = 'Ali';
    const r2 = await w.bsave({ branchKey: 'f729', data: bd, baseVersion: sel2.body.branchVersions.f729 }, 't-sel');
    assert.equal(r2.status, 200, JSON.stringify(r2.body));
    const br2 = (await one(w.pg, `select data from app_data_branches where branch_key='f729'`)).data;
    assert.equal(br2.customers[0].name, 'Ali'); assert.equal(br2.batches.find(x => x.id === 9001).items.length, 1); assert.equal(br2.sales[0].costUsd, 5);
  });
}

// ── 2. Chegirma chegarasi (10%, rejimga qarab) ─────────────────────────────────
async function testDiscountLimit() {
  await withWorld(async (w) => {
    const sales0 = +(await one(w.pg, `select count(*) c from sales where filial='f729'`)).c;
    let r = await w.sale(...ck([{ pid: 103, qty: 1, sellUsd: 7.5 }]));
    assert.equal(r.status, 400); assert.equal(r.body.code, 'DISCOUNT_LIMIT', JSON.stringify(r.body));
    assert.equal(r.body.maxPct, 10); assert.equal(r.body.minPriceUsd, 13.5);
    r = await w.sale(...ck([{ pid: 103, qty: 1, sellUsd: 15 }], { disc: 50 }));
    assert.equal(r.body.code, 'DISCOUNT_LIMIT', 'chek chegirmasi (50%) ham hisobga olinadi');
    r = await w.sale(...ck([{ pid: 103, qty: 1, sellUsd: 14.25 }]));
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.costUsd, undefined, 'sotuvchiga tannarx/foyda qaytmaydi');
    assert.equal(r.body.profitUsd, undefined);
    // Optom rejim: asos — optom narx (10) → 9.5 joiz; chakana rejimda o'sha narx — rad
    r = await w.sale(...ck([{ pid: 103, qty: 1, sellUsd: 9.5 }], { mode: 'wholesale' }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    r = await w.sale(...ck([{ pid: 103, qty: 1, sellUsd: 9.5 }], { mode: 'retail' }));
    assert.equal(r.body.code, 'DISCOUNT_LIMIT');
    // Admin — 50% o'tadi; tannarx.view egasiga foyda qaytadi
    r = await w.sale(...ck([{ pid: 103, qty: 1, sellUsd: 7.5 }], { tok: 't-adm' }));
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(typeof r.body.profitUsd, 'number');
    // Sozlama (sozlamalar.edit) 60% — sotuvchi ham 50% bera oladi
    await w.pg.query(`update app_data set data = jsonb_set(data, '{settings,maxDiscountPct}', '60') where id='main'`);
    r = await w.sale(...ck([{ pid: 103, qty: 1, sellUsd: 7.5 }]));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(+(await one(w.pg, `select count(*) c from sales where filial='f729'`)).c - sales0, 4, 'faqat 4 ta o\'tgan savdo yozildi, rad etilganlari yo\'q');
  });
}

// ── 3. Direct Sale: belgilanmagan — rad; belgilangan — ta'minotchi va narx mahsulotdan ──
async function testDirectSalePreset() {
  await withWorld(async (w) => {
    let r = await w.sale(...ck([{ pid: 104, qty: 1, sellUsd: 10, costUsd: 0, directSupply: true, suppId: SID }]));
    assert.equal(r.status, 400); assert.equal(r.body.code, 'DIRECT_SALE_NOT_PRESET', JSON.stringify(r.body));
    r = await w.sale(...ck([{ pid: 105, qty: 2, sellUsd: 6, costUsd: 0, directSupply: true, suppId: 999 }]));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(+(await one(w.pg, `select debt from supplier_balances where filial='f729' and supplier_local_id=$1`, [SID])).debt, 8, 'qarz — mahsulotdagi ta\'minotchiga, 2 × 4 $');
    // Bazaning o'zi ham (to'g'ridan-to'g'ri RPC) — belgilanmagan Direct Sale'ni admin bo'lmaganga o'tkazmaydi
    await assert.rejects(w.pg.query(`select public.sale_checkout_v37('f729', 'ck:p65-raw', $1::jsonb, '[]'::jsonb, 7, 'S', 'seller', false, null, 0, 'retail')`,
      [JSON.stringify({ localId: 'raw1', inv: 'R1', items: [{ pid: 104, qty: 1, sellUsd: 10, costUsd: 1, directSupply: true, suppId: SID }], discPct: 0, paidUsd: 0 })]),
      /Direct Sale: mahsulotga ta'minotchi va narx belgilanmagan/);
    await assert.rejects(w.pg.query(`select public.sale_checkout_v37('f729', 'ck:p65-raw2', $1::jsonb, '[]'::jsonb, 7, 'S', 'seller', false, null, 0, 'retail')`,
      [JSON.stringify({ localId: 'raw2', inv: 'R2', items: [{ pid: 105, qty: 1, sellUsd: 6, costUsd: 0.5, directSupply: true, suppId: SID }], discPct: 0, paidUsd: 0 })]),
      /narx mahsulotdagidan farq qiladi/);
  });
}

// ── 4. Optimistik qulf ─────────────────────────────────────────────────────────
async function testVersionLock() {
  await withWorld(async (w) => {
    const v0 = +(await one(w.pg, `select version from app_data_branches where branch_key='f729'`)).version;
    await w.pg.query(`update app_data_branches set updated_at = now() where branch_key='f729'`);
    assert.equal(+(await one(w.pg, `select version from app_data_branches where branch_key='f729'`)).version, v0 + 1, 'har yozuvda +1 (trigger)');
    // Asosiy qator: faqat filial qarzi (branchDebt — filial sotuvi) o'zgarsa versiya oshmaydi (keraksiz 409 bo'lmasin), boshqa o'zgarish — +1
    const m0 = +(await one(w.pg, `select version from app_data where id='main'`)).version;
    await w.pg.query(`select public._branch_debt_add('f729', 5)`);
    assert.equal(+(await one(w.pg, `select version from app_data where id='main'`)).version, m0, 'branchDebt — versiya o\'zgarmadi');
    await w.pg.query(`update app_data set data = jsonb_set(data, '{settings,usdUzs}', '12100') where id='main'`);
    assert.equal(+(await one(w.pg, `select version from app_data where id='main'`)).version, m0 + 1);
    // Eskirgan versiya — 409
    let r = await w.save({ data: { settings: { usdUzs: 12000 } }, baseVersion: 0 }, 't-adm');
    const mv = +(await one(w.pg, `select version from app_data where id='main'`)).version;
    if (mv !== 0) { assert.equal(r.status, 409); assert.equal(r.body.code, 'VERSION_CONFLICT'); assert.equal(r.body.version, mv); }
    // Ikki qurilma bir xil holatni yuklab, PARALLEL saqlaydi — biri aniq 409, ikkinchisi 200
    const a = await w.load({}, 't-adm'), b = await w.load({}, 't-adm');
    const da = a.body.data.branchStore.f729, db = b.body.data.branchStore.f729;
    da.expenses = [...(da.expenses || []), { id: 'eA', date: '2026-10-17', cat: 'Ijara', amtUsd: 10 }];
    db.expenses = [...(db.expenses || []), { id: 'eB', date: '2026-10-17', cat: 'Svet', amtUsd: 5 }];
    const res = await Promise.all([
      w.bsave({ branchKey: 'f729', data: da, baseVersion: a.body.branchVersions.f729 }, 't-adm'),
      w.bsave({ branchKey: 'f729', data: db, baseVersion: b.body.branchVersions.f729 }, 't-adm'),
    ]);
    assert.deepEqual(res.map(x => x.status).sort(), [200, 409], JSON.stringify(res.map(x => x.body)));
    const lost = res.find(x => x.status === 409);
    assert.equal(lost.body.code, 'VERSION_CONFLICT');
    // 409 olgan qurilma: yangi holatni oladi, o'z o'zgarishini ustiga qo'yadi (ID bo'yicha) va qayta saqlaydi
    const mine = res[0].status === 409 ? da : db;
    const fresh = await w.load({}, 't-adm');
    const merged = fresh.body.data.branchStore.f729;
    const ids = new Set(merged.expenses.map(e => e.id));
    merged.expenses = [...merged.expenses, ...mine.expenses.filter(e => !ids.has(e.id))];
    const again = await w.bsave({ branchKey: 'f729', data: merged, baseVersion: fresh.body.branchVersions.f729 }, 't-adm');
    assert.equal(again.status, 200, JSON.stringify(again.body));
    const br = (await one(w.pg, `select data from app_data_branches where branch_key='f729'`)).data;
    assert.deepEqual(br.expenses.map(e => e.id).sort(), ['eA', 'eB'], 'ikkala o\'zgarish ham saqlandi');
    // Asosiy qator ham: eski versiya bilan — 409, yangisi bilan — 200
    const m1 = await w.load({}, 't-adm');
    const s1 = await w.save({ data: { settings: { ...m1.body.data.settings, maxDiscountPct: 15 } }, baseVersion: m1.body.version }, 't-adm');
    assert.equal(s1.status, 200, JSON.stringify(s1.body)); assert.equal(s1.body.versions.main, m1.body.version + 1);
    const s2 = await w.save({ data: { settings: { ...m1.body.data.settings, maxDiscountPct: 20 } }, baseVersion: m1.body.version }, 't-adm');
    assert.equal(s2.status, 409);
    assert.equal((await one(w.pg, `select data->'settings'->>'maxDiscountPct' v from app_data where id='main'`)).v, '15', 'eski nusxa ustidan yozmadi');
    // Bazaning o'zi: eski versiya bilan app_data_save_cas — FW_VERSION_CONFLICT
    await assert.rejects(w.pg.query(`select public.app_data_save_cas(null, null, $1::jsonb, true)`, [JSON.stringify([{ key: 'f729', data: {}, base: 0 }])]), /FW_VERSION_CONFLICT\|f729\|/);
  });
}

// ── 5. Narx qoidasi (JS) = ilova qoidasi; JS zaxira tekshiruvi (37'siz baza) ─────
function testPricingLib() {
  const cm = P.fifoCostMap([{ id: 2, pid: 1, qty: 5, sold: 0, costUsd: 9, date: '2026-09-02' }, { id: 1, pid: 1, qty: 5, sold: 5, costUsd: 1, date: '2026-09-01' },
    { id: 3, pid: 1, qty: 5, sold: 0, costUsd: 7, date: '2026-09-01' }, { id: 4, pid: 1, qty: 9, sold: 0, costUsd: 1, date: '2026-08-01', status: 'transit' }]);
  assert.equal(cm.get('1'), 7, 'eng eski FAOL va qoldig\'i bor partiya (tranzit/tugagan emas)');
  assert.equal(P.basePrice({}, 7, 'retail'), 9); assert.equal(P.basePrice({ optMarkupPct: 10 }, 7, 'wholesale'), 7.7);
  const args = { products: [{ id: 1 }], settings: {}, costMap: cm };
  assert.equal(P.discountViolation({ ...args, items: [{ pid: 1, sellUsd: 8.1 }], mode: 'retail' }), null, '10% ichida');
  assert.deepEqual(P.discountViolation({ ...args, items: [{ pid: 1, sellUsd: 8 }], mode: 'retail' }), { pid: 1, floor: 8.1, max: 10 });
  assert.equal(P.maxDiscountPct({ maxDiscountPct: 250 }), 100); assert.equal(P.maxDiscountPct({}), 10);
  // Klient: server narxi ustun (sotuvchi va admin POS), Direct Sale tayyorligi — server belgisi
  const SH = fs.readFileSync(path.join(ROOT, 'js', 'shared.js'), 'utf8');
  const vm = require('vm'); const c = {}; vm.createContext(c);
  const pick = (n) => { const i = SH.indexOf('function ' + n + '('); let d = 0; for (let k = SH.indexOf('{', i); ; k++) { if (SH[k] === '{') d++; else if (SH[k] === '}' && !--d) return SH.slice(i, k + 1); } };
  vm.runInContext(pick('fwServerPrice') + pick('fwDirectReady') + pick('fwCostHidden'), c);
  assert.equal(c.fwServerPrice({ priceFromServer: true, retailUsd: 6, optUsd: 5.75 }, 'wholesale'), 5.75);
  assert.equal(c.fwServerPrice({ markupPct: 25 }, 'retail'), null);
  assert.equal(c.fwDirectReady({ directSale: true, dsSuppId: 1, priceFromServer: true, dsReady: true }), true);
  assert.equal(c.fwDirectReady({ directSale: true, dsSuppId: 1, priceFromServer: true, dsReady: false }), false);
  for (const f of ['sotuvchi.js', 'main.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    assert.match(src, /basePrice: \(p, mode\) => \{\s*const sp = fwServerPrice\(p, mode\); if \(sp != null\) return sp;/, f + ': server narxi ustun');
    assert.match(src, /priceMode: ctx\.mode === 'wholesale' \? 'wholesale' : 'retail'/, f + ': savdo rejimi serverga yuboriladi');
  }
}

module.exports = {
  name: 'P65 — v24.8: tannarx maxfiyligi, chegirma chegarasi, Direct Sale, optimistik qulf (37-migratsiya)',
  cases: [
    { name: "K2: sotuvchi javobida tannarx va hamkor puli yo'q, narx tayyor; tannarx.view / admin — ko'radi", run: testLoadRedaction },
    { name: "K2: sotuvchi saqlaganda yashirin maydonlar (tannarx, partiya qatorlari, hamkorlar) o'chmaydi", run: testSaveKeepsHidden },
    { name: "chegirma: sotuvchi 50% — rad, 5% — o'tadi, optom rejimda optom narxdan; admin 50% — o'tadi; sozlama 60%", run: testDiscountLimit },
    { name: "Direct Sale: belgilanmagan mahsulot (costUsd=0) — 400; belgilangan — ta'minotchi/narx mahsulotdan; RPC ham tekshiradi", run: testDirectSalePreset },
    { name: "versiya: trigger +1; eski versiya — 409; ikki parallel saqlash — biri 409, qayta urinishda ikkalasi saqlanadi", run: testVersionLock },
    { name: 'narx qoidasi (JS) va klient: server narxi ustun, savdo rejimi yuboriladi', run: testPricingLib },
  ],
};
