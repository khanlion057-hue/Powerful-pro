// P137 — v25.6.10 (egasi: «do'konda dona narxi va ko'proq olgan narx»): KO'P OLGANDA NARX.
//  • mahsulotda: necha donadan (bulkMin) + dona narxi ($, bulkPriceUsd); faqat chakanadan arzon bo'lsa amal qiladi
//  • server: katalogda «N donadan: narx», buyurtmada miqdor >= N bo'lsa — har dona shu narxda (brauzer narxi e'tiborsiz)
//  • vitrina: kartochka, mahsulot sahifasi (1 dona / N donadan), savatda jami va «yana K ta olsangiz» maslahati
//  • admin: formada kiritiladi va tekshiriladi; oldindan ko'rish savatida ham xuddi shu narx
const assert = require('node:assert/strict');
const fs = require('fs');
const { fixture, startShop } = require('./helpers/shop-stub');
const { openPage } = require('./p4-responsive.test.js')._helpers;
const EXE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

function fx3() {
  const fx = fixture();
  Object.assign(fx.main.products.find((p) => p.id === 1), { bulkMin: 3, bulkPriceUsd: 25 });     // dona 380 000 → 3 tadan 316 000 (25 x 12 650 = 316 250 → 316 000)
  Object.assign(fx.main.products.find((p) => p.id === 2), { bulkMin: 2, bulkPriceUsd: 500 });    // chakanadan qimmat — e'tiborsiz
  return fx;
}
async function call(S, method, body, qs) {
  const r = await S.fn({ httpMethod: method, body: body ? JSON.stringify(body) : '', headers: {}, queryStringParameters: qs || {} }, {});
  return { status: r.statusCode, j: r.body ? JSON.parse(r.body) : null };
}

async function server() {
  const S = await startShop(fx3());
  try {
    const c = (await call(S, 'GET', null, { s: 'powerful' })).j;
    const p1 = c.products.find((p) => p.id === 1), p2 = c.products.find((p) => p.id === 2);
    assert.equal(p1.price, 380000); assert.deepEqual(p1.bulk, { min: 3, price: 316000 });
    assert.equal(p2.bulk, null, 'chakanadan qimmat — ko\'rsatilmaydi');
    const base = { a: 'order', s: 'powerful', name: 'Aziz', phone: '90 123 45 67', delivery: 'pickup' };
    const two = await call(S, 'POST', { ...base, items: [{ pid: 1, qty: 2, priceUsd: 1 }] });
    assert.equal(two.j.total, 760000, '2 ta — dona narxi');
    const three = await call(S, 'POST', { ...base, items: [{ pid: 1, qty: 3, priceUsd: 1 }] });
    assert.equal(three.j.total, 3 * 316000, '3 ta — ko\'p olganda narx');
    const o = S.admin.db.rows.baza.data.shop.orders[0];
    assert.equal(o.items[0].bulk, true); assert.equal(Math.round(o.items[0].priceUsd * 12650 / 1000) * 1000, 316000);
  } finally { S.close(); }
}

async function browser() {
  const S = await startShop(fx3());
  const { chromium } = require('playwright');
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  try {
    const page = await br.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${S.port}/dokon.html?s=powerful`); await page.waitForSelector('.vt-pc');
    const card = page.locator('.vt-pc', { has: page.locator('[data-open="1"]') }).first();
    assert.match(await card.textContent(), /3 donadan: 316\s000/);
    await card.locator('[data-open]').first().click(); await page.waitForSelector('.vt-tiers');
    assert.match(await page.$eval('.vt-tiers', (e) => e.textContent), /1 dona380\s000 soʻm3 donadan316\s000 soʻm−17%/);
    await page.click('[data-pq="1"]'); await page.click('[data-addp]');       // 2 ta
    await page.click('#vt-cartb');
    assert.match(await page.$eval('.vt-sheet', (e) => e.textContent), /Yana 1 ta olsangiz — donasi 316\s000/);
    assert.match(await page.$eval('.vt-tot.f', (e) => e.textContent), /760\s000/);
    await page.click('[data-cinc="1"]');                                    // 3 ta
    assert.match(await page.$eval('.vt-tot.f', (e) => e.textContent), /948\s000/, '3 x 316 000');
    assert.match(await page.$eval('.vt-sheet', (e) => e.textContent), /Koʻp olganda narx qoʻllandi/);
    await page.fill('#vt-form [name=name]', 'Aziz'); await page.fill('#vt-form [name=phone]', '901234567');
    await page.click('#vt-send'); await page.waitForSelector('.vt-ok');
    assert.match(await page.$eval('.vt-ok', (e) => e.textContent), /Jami: 948\s000/, 'server ham xuddi shu summa');
    assert.deepEqual(errors, []);
  } finally { await br.close(); S.close(); }
}

async function admin() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const r = await page.evaluate(async () => {
      save = async () => true; fwSaveToast = async () => true; const T = []; const _t = toast; toast = (m) => T.push(String(m));
      S.products = [{ id: 1, sku: 'A1', name: 'Drel 600W', markupPct: 25 }];
      S.batches = [{ id: 1, pid: 1, qty: 10, sold: 0, costUsd: 40, status: 'active', date: td() }];   // chakana 50$
      editProduct(1);
      const g = (id, v) => { document.getElementById(id).value = v; };
      g('pm-bulk-min', '5'); g('pm-bulk-price', ''); await pmfSave(); const e1 = T.slice(-1)[0];
      g('pm-bulk-min', '5'); g('pm-bulk-price', '60'); await pmfSave(); const e2 = T.slice(-1)[0];
      g('pm-bulk-min', '5'); g('pm-bulk-price', '45'); await pmfSave();
      const saved = [S.products[0].bulkMin, S.products[0].bulkPriceUsd];
      toast = _t;
      const sh = shopData(); sh.settings = Object.assign(sh.settings || {}, { enabled: true, name: 'Powerful', currency: 'USD' });
      dkOpenStorefront();
      const card = document.querySelector('#sf-grid .sf-card .sf-bulk')?.textContent || '';
      sfAdd(1, 4); sfGo('cart'); const c4 = document.querySelector('.sf-sum .tot b').textContent, hint = document.querySelector('.sf-li .sf-bulk')?.textContent || '';
      sfAdd(1, 1); const c5 = document.querySelector('.sf-sum .tot b').textContent;
      sfClose();
      return { e1, e2, saved, card, c4, hint, c5 };
    });
    assert.match(r.e1, /ikkalasini yozing/); assert.match(r.e2, /arzon boʻlishi kerak/);
    assert.deepEqual(r.saved, [5, 45]);
    assert.match(r.card, /5 donadan: \$45/);
    assert.match(r.c4, /\$200/); assert.match(r.hint, /Yana 1 ta/);
    assert.match(r.c5, /\$225/, '5 x $45');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

module.exports = { name: "P137 — Do'kon: ko'p olganda narx", cases: [
  { name: 'server: katalogda «N donadan», buyurtmada miqdorga qarab narx; qimmat bo\'lsa e\'tiborsiz', run: server },
  { name: 'vitrina: kartochka, 1 dona / N donadan, savat maslahati, jami = server jami', run: browser },
  { name: 'admin: forma tekshiruvi va saqlash, oldindan ko\'rish savati', run: admin },
] };
