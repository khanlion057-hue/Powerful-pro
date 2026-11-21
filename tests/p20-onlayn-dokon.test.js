// P20 — ONLAYN-DO'KON (v23.3): server himoyasi (filterShop), bot tokeni maxfiyligi,
// shop-bot funksiyasi va brauzerdagi buyurtma → savdo oqimi (haqiqiy js/main.js + js/dokon.js).
const path = require('path');
const assert = require('node:assert/strict');
const { makeMemSupabase, loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');
const { loadApp, ROOT } = require('./helpers/load-app');
const { filterBranchChanges, filterTopLevelChanges, stripAdminSecrets, stripSecretSettings } = require('../netlify/functions/_lib/appDataGuard');

const SELLER = new Set(['savdo.create', 'savdo.view']);
const MANAGER = new Set(['sozlamalar.edit']);
const NOBODY = new Set();
const order = (id, st, upd, extra = {}) => ({ id, no: +String(id).replace(/\D/g, '') || 1, status: st, createdAt: '2026-10-06T08:00:00.000Z', updatedAt: upd, items: [], ...extra });

// ── 1. Huquqlar: sotuvchi buyurtma bilan ishlaydi, sozlamani o'zgartira olmaydi ──
async function testShopPermissionSplit() {
  const existing = { shop: { settings: { enabled: true, name: 'A' }, banners: [], discounts: [], orders: [order('so1', 'new', '2026-10-06T08:00:00.000Z')], reviews: [], seq: 1 } };
  const incoming = { shop: { ...existing.shop, settings: { enabled: false, name: 'HACK' },
    orders: [order('so1', 'preparing', '2026-10-06T09:00:00.000Z'), order('so2', 'new', '2026-10-06T09:05:00.000Z')], seq: 2 } };
  let r = filterBranchChanges({ existing, incoming, permKeys: SELLER, isAdmin: false });
  const st = r.allowed.shop;
  assert.ok(st, 'sotuvchining buyurtma oʻzgarishi qabul qilinadi');
  assert.equal(st.settings.name, 'A', "sotuvchi do'kon sozlamasini o'zgartira olmaydi");
  assert.equal(st.settings.enabled, true);
  assert.ok(r.ignored.includes('shop'), "rad etilgan qism ignoredKeys'da (audit uchun)");
  assert.equal(st.orders.find(o => o.id === 'so1').status, 'preparing');
  assert.ok(st.orders.some(o => o.id === 'so2'));
  assert.equal(st.seq, 2);
  // menejer (faqat sozlamalar.edit) — sozlama o'zgaradi, buyurtma holati o'zgarmaydi
  r = filterBranchChanges({ existing, incoming, permKeys: MANAGER, isAdmin: false });
  assert.equal(r.allowed.shop.settings.name, 'HACK');
  assert.equal(r.allowed.shop.orders.find(o => o.id === 'so1').status, 'new', "sozlama huquqi buyurtmani o'zgartirmaydi");
  // huquqsiz xodim — hech narsa yozilmaydi
  r = filterBranchChanges({ existing, incoming, permKeys: NOBODY, isAdmin: false });
  assert.equal(r.allowed.shop, undefined);
  assert.ok(r.ignored.includes('shop'));
}

// ── 2. Buyurtma o'chirilmaydi: eskirgan nusxa yangi buyurtmani yo'qotmaydi (admin ham) ──
async function testOrdersNeverDropped() {
  const existing = { shop: { orders: [order('so1', 'done', '2026-10-06T10:00:00.000Z'), order('so2', 'new', '2026-10-06T10:01:00.000Z')], reviews: [{ id: 'rv1', createdAt: '2026-10-06T10:00:00.000Z' }], seq: 2 } };
  // eskirgan brauzer: so2 yo'q, so1 eski holatda (updatedAt eskiroq)
  const stale = { shop: { orders: [order('so1', 'new', '2026-10-06T08:00:00.000Z')], reviews: [], seq: 1 } };
  for (const [perms, isAdmin] of [[SELLER, false], [NOBODY, true]]) {
    const r = filterBranchChanges({ existing, incoming: stale, permKeys: perms, isAdmin });
    const out = r.allowed.shop || existing.shop;
    assert.equal(out.orders.length, 2, `buyurtma yo'qolmaydi (${isAdmin ? 'admin' : 'sotuvchi'})`);
    assert.equal(out.orders.find(o => o.id === 'so1').status, 'done', 'yangiroq holat ustun');
    assert.equal(out.reviews.length, 1, "sharh o'chirilmaydi");
    assert.equal(out.seq, 2, 'raqam hisoblagichi kamaymaydi');
  }
}

// ── 3. Sozlama bloklari sanitizatsiyasi: banner faqat https, ≤5; chegirma ≤20, narx > 0 ──
async function testShopConfigSanitized() {
  const banners = [{ id: 1, url: 'javascript:alert(1)' }, { id: 2, url: 'data:image/png;base64,AAA' }, ...Array.from({ length: 7 }, (_, i) => ({ id: 10 + i, url: `https://x.supabase.co/storage/v1/object/public/product-images/shop/b${i}.jpg` }))];
  const discounts = [{ id: 'bad', pid: 1, priceUsd: -5 }, ...Array.from({ length: 25 }, (_, i) => ({ id: 'd' + i, pid: i + 2, priceUsd: 10 }))];
  const r = filterBranchChanges({ existing: {}, incoming: { shop: { settings: { enabled: true }, banners, discounts } }, permKeys: MANAGER, isAdmin: false });
  const sh = r.allowed.shop;
  assert.equal(sh.banners.length, 5);
  assert.ok(sh.banners.every(b => b.url.startsWith('https://')), 'faqat https havola');
  assert.equal(sh.discounts.length, 20);
  assert.ok(sh.discounts.every(d => d.priceUsd > 0));
  // admin uchun ham (normalizatsiya filtrlashdan oldin)
  const a = filterBranchChanges({ existing: {}, incoming: { shop: { banners } }, permKeys: NOBODY, isAdmin: true });
  assert.ok(a.allowed.shop.banners.every(b => b.url.startsWith('https://')));
}

// ── 4. Do'kon boti tokeni: brauzerga qaytmaydi, tokensiz saqlash uni o'chirmaydi ──
async function testShopBotTokenSecret() {
  const settings = { company: 'F', shopBotToken: '123456:SHOP_SECRET_TOKEN_VALUE_ABCDEF', usdUzs: 12650 };
  for (const out of [stripAdminSecrets(settings), stripSecretSettings(settings)]) {
    assert.ok(!JSON.stringify(out).includes('SHOP_SECRET'), 'token yuborilmaydi');
    assert.equal(out.shopBotTokenSet, true);
  }
  const adminSt = stripAdminSecrets(settings);
  const r = filterTopLevelChanges({ existing: { settings }, incoming: { settings: { ...adminSt, receipt: 'x' } }, permKeys: NOBODY, isAdmin: true });
  assert.equal(r.allowed.settings.shopBotToken, settings.shopBotToken, "tokensiz saqlash tokenni o'chirmaydi");
  assert.equal(r.allowed.settings.shopBotTokenSet, undefined, 'belgi bazaga yozilmaydi');
  const c = makeMemSupabase({ tables: { app_data: [{ id: 'main', data: { settings, branchStore: { baza: {} } } }], app_data_branches: [], ...STAFF_WORLD() }, users: USERS });
  try {
    const h = loadFunction('app-data-load', c);
    for (const t of ['t-admin', 't-cash']) {
      const res = await h(post({}, t));
      assert.ok(!res.body.includes('SHOP_SECRET'), `app-data-load (${t}) javobida token yo'q`);
    }
  } finally { unloadFunctions(); }
}

function STAFF_WORLD() {
  return {
    staff: [{ id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin' },
            { id: 3, auth_user_id: 'u-cash', role: 'sotuvchi', active: true, filial: 'baza', name: 'Kassir' },
            { id: 5, auth_user_id: 'u-set', role: 'sotuvchi', active: true, filial: 'baza', name: 'Menejer' }],
    roles: [{ id: 'r-cash', key: 'cashier' }, { id: 'r-set', key: 'settings' }],
    staff_roles: [{ staff_id: 3, role_id: 'r-cash', roles: { key: 'cashier' } }, { staff_id: 5, role_id: 'r-set', roles: { key: 'settings' } }],
    role_permissions: [{ role_id: 'r-cash', permission_id: 'savdo.create', permissions: { key: 'savdo.create' } },
                       { role_id: 'r-set', permission_id: 'sozlamalar.edit', permissions: { key: 'sozlamalar.edit' } }],
    staff_audit_log: [],
  };
}
const USERS = { 't-admin': { id: 'u-admin' }, 't-cash': { id: 'u-cash' }, 't-set': { id: 'u-set' } };

// ── 5. shop-bot: ruxsat, format, token javobga qo'shilmaydi, setup serverdagi tokenni ishlatadi ──
async function testShopBotFunction() {
  const TOKEN = '123456:SHOP_SECRET_TOKEN_VALUE_ABCDEF';
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), body: opts && opts.body });
    const method = String(url).split('/').pop();
    const result = method === 'getMe' ? { ok: true, result: { username: 'dokon_bot', first_name: 'Dokon' } } : { ok: true, result: true };
    return { json: async () => result };
  };
  const c = makeMemSupabase({ tables: { app_data: [{ id: 'main', data: { settings: { company: 'F', shopBotToken: TOKEN } } }], ...STAFF_WORLD() }, users: USERS });
  try {
    const h = loadFunction('shop-bot', c);
    let r = await h(post({ action: 'check', token: TOKEN }, 't-cash'));
    assert.equal(r.statusCode, 403, 'sozlamalar.edit huquqisiz — rad');
    assert.equal(calls.length, 0, "rad etilganda Telegram'ga murojaat yo'q");
    r = await h(post({ action: 'check', token: 'notatoken' }, 't-set'));
    assert.equal(r.statusCode, 400);
    assert.equal(calls.length, 0);
    r = await h(post({ action: 'check', token: TOKEN }, 't-set'));
    assert.equal(r.statusCode, 200);
    assert.equal(JSON.parse(r.body).bot.username, 'dokon_bot');
    assert.ok(!r.body.includes('SHOP_SECRET'), 'javobda token yoʻq');
    calls.length = 0;
    r = await h(post({ action: 'setup', shopName: 'Powerfull' }, 't-admin'));
    const b = JSON.parse(r.body);
    assert.equal(b.ok, true);
    assert.ok(!r.body.includes('SHOP_SECRET'));
    assert.deepEqual(calls.map(x => x.url.split('/').pop()), ['getMe', 'setMyCommands', 'setMyDescription', 'setMyShortDescription']);
    assert.ok(calls.every(x => x.url.includes(encodeURIComponent(TOKEN))), 'serverdagi saqlangan token ishlatiladi');
    r = await h(post({ action: 'drop_db' }, 't-admin'));
    assert.equal(r.statusCode, 400, "noma'lum amal rad etiladi");
  } finally { global.fetch = realFetch; unloadFunctions(); }
}

// ── 6. Brauzer: buyurtma → holatlar → savatga → savdo bilan bog'lanish; XSS; birlashtirish ──
async function testShopClientFlow() {
  const { browser, page, consoleErrors } = await loadApp({});
  try {
    await page.addScriptTag({ path: path.join(ROOT, 'js', 'dokon.js') });
    const r = await page.evaluate(() => {
      save = () => Promise.resolve();
      document.body.insertAdjacentHTML('beforeend', '<div id="pg-dokon"></div><div id="pg-savdo"></div>');
      Object.assign(S, { branch: 'baza', page: 'dokon', settings: { company: 'Test' },
        products: [{ id: 501, sku: 'T-1', name: 'Drel', markupPct: 30, minStock: 1 }],
        batches: [{ id: 1, pid: 501, qty: 5, sold: 0, costUsd: 10, status: 'active', date: '2026-10-01' }],
        customers: [{ id: 77, name: 'Ali', phone: '+998 90 111 22 33', debt: 0 }], sales: [], cart: [], shop: null });
      const out = {};
      // chegirma faqat vitrina narxida
      CUR.usdUzs = 10000;   // v24.5: so'mda 1 000 ga yaxlit — kurs butun bo'lsa narx o'zgarmaydi
      shopData().discounts = [{ id: 'dc501', pid: 501, priceUsd: 11 }];
      CUR.usdUzs = 12345; out.rounded = Math.round(shopPrice(S.products[0]) * CUR.usdUzs); CUR.usdUzs = 10000;
      out.shopPrice = shopPrice(S.products[0]); out.regular = shopRegularPrice(S.products[0]);
      const o = shopCreateOrder({ source: 'phone', delivery: 'pickup', cust: { name: '<img src=x onerror="window.__x=1">', phone: '+998 90 111 22 33' }, items: [{ pid: 501, sku: 'T-1', name: 'Drel', qty: 2, priceUsd: shopPrice(S.products[0]) }] });
      out.no = o.no; out.total = o.totalUsd;
      pgDokon();
      out.xssImg = !!document.querySelector('#pg-dokon .dk-order img');
      out.cardText = document.querySelector('#pg-dokon .dk-order-c')?.textContent || '';
      dkSetStatus(o.id, 'preparing'); dkSetStatus(o.id, 'ready');
      out.st1 = shopData().orders[0].status;
      // savatga yuklash: buyurtma narxi saqlanadi, mijoz telefon bo'yicha topiladi
      go = (p) => { S.page = p; };
      refreshCart = () => {};
      custSelect = (id) => { S.savdoCustId = id; };
      dkToSale(o.id);
      out.cart = S.cart.map(i => ({ pid: i.pid, qty: i.qty, sellUsd: i.sellUsd }));
      out.cust = S.savdoCustId;
      shopOnSaleCommitted({ id: 9001, inv: 'INV-0001', totalUsd: 22 });
      const fin = shopData().orders[0];
      out.final = { status: fin.status, saleId: fin.saleId, hist: fin.history.map(h => h.st) };
      out.pendingCleared = S.shopPending === null;
      // ikki qurilma birlashtirish: buyurtmalar yo'qolmaydi, yangirog'i ustun
      const m = fwShopMerge({ orders: [{ id: 'a', status: 'done', updatedAt: '2026-10-06T10:00:00Z' }], seq: 5, cfgAt: 1, settings: { name: 'eski' } },
                            { orders: [{ id: 'a', status: 'new', updatedAt: '2026-10-06T09:00:00Z' }, { id: 'b', status: 'new', updatedAt: '2026-10-06T09:30:00Z' }], seq: 4, cfgAt: 2, settings: { name: 'yangi' } });
      out.merge = { n: m.orders.length, a: m.orders.find(x => x.id === 'a').status, seq: m.seq, name: m.settings.name };
      return out;
    });
    assert.equal(r.regular, 13);
    assert.equal(r.shopPrice, 11, 'vitrinada chegirmali narx');
    assert.equal(r.rounded, 136000, "so'mdagi vitrina narxi eng yaqin minggacha (135 795 → 136 000)");
    assert.equal(r.no, 1); assert.equal(r.total, 22);
    assert.equal(r.xssImg, false, 'xaridor ismi HTML sifatida chizilmaydi');
    assert.ok(r.cardText.includes('<img'), 'matn sifatida koʻrinadi');
    assert.equal(r.st1, 'ready');
    assert.deepEqual(r.cart, [{ pid: 501, qty: 2, sellUsd: 11 }], 'savatga buyurtma narxi bilan');
    assert.equal(r.cust, 77, 'mijoz telefon raqami boʻyicha topildi');
    assert.deepEqual(r.final, { status: 'done', saleId: 9001, hist: ['new', 'preparing', 'ready', 'done'] });
    assert.equal(r.pendingCleared, true);
    assert.deepEqual(r.merge, { n: 2, a: 'done', seq: 5, name: 'yangi' });
    assert.deepEqual(consoleErrors, []);
  } finally { await browser.close(); }
}

module.exports = {
  name: "P20 — Onlayn-do'kon: huquqlar, maxfiylik, buyurtma → savdo",
  cases: [
    { name: "Sotuvchi — buyurtmalar; sozlama — faqat sozlamalar.edit; huquqsiz — hech narsa", run: testShopPermissionSplit },
    { name: "Buyurtma/sharh o'chirilmaydi: eskirgan nusxa (admin ham) yangi buyurtmani yo'qotmaydi", run: testOrdersNeverDropped },
    { name: "Banner faqat https (≤5), chegirma ≤20 va narx > 0", run: testShopConfigSanitized },
    { name: "Do'kon boti tokeni brauzerga qaytmaydi, tokensiz saqlash uni o'chirmaydi", run: testShopBotTokenSecret },
    { name: "shop-bot: ruxsat, format, javobda token yo'q, setup serverdagi tokenni ishlatadi", run: testShopBotFunction },
    { name: "Brauzer: buyurtma → holatlar → savat (buyurtma narxi) → savdo bilan bog'lanish; XSS; birlashtirish", run: testShopClientFlow },
  ],
};
