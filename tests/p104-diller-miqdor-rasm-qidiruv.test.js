// P104 — v25.6.9 diller: miqdorni raqam bilan kiritish, rasmni bosib to'liq ko'rish, buyurtmada nom asosiy
const assert = require('node:assert/strict');
const { openPage, DEALER_TABLES } = require('./p4-responsive.test.js')._helpers;
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function run() {
  const { browser, page, errors } = await openPage('diller.html', { width: 390, height: 844, mobile: true, loggedIn: true, tables: DEALER_TABLES });
  try {
    await page.evaluate((img) => {
      dlSwitchTab('order'); CATALOG.length = 0; CATALOG.push({ id: 11, name: 'Disk 350 mm', sku: 'ZZ-1', qty: 40, image: img }); CATALOG.push({ id: 12, name: 'Arra', sku: 'DISK-9', qty: 7 });
      ORDER_CART = {}; DLO.seg = 'new'; dlRenderContent(); dlRenderOrderList();
    }, IMG);
    await page.waitForSelector('#dl-order-list .dl-prow');
    // nom asosiy, artikul ikkinchi qatorda
    assert.equal(await page.$eval('#dl-order-list .dl-pname', (e) => e.textContent.trim()), 'Disk 350 mm');
    assert.match(await page.$eval('#dl-order-list .dl-pmeta', (e) => e.textContent), /ZZ-1/);
    // qidiruv: nom bo'yicha topilganlar oldinda (DISK-9 artikuli keyin)
    await page.fill('#dl-order-search', 'disk'); await page.evaluate(() => dlRenderOrderList());
    assert.deepEqual(await page.$$eval('#dl-order-list .dl-pname', (a) => a.map((e) => e.textContent.trim())), ['Disk 350 mm', 'Arra']);
    // raqam kiritish + chegaralash
    await page.fill('#dl-order-search', ''); await page.evaluate(() => dlRenderOrderList());
    await page.click('#dl-order-list .pos-add');
    await page.fill('#dl-order-list .pos-qty-in', '25'); await page.$eval('#dl-order-list .pos-qty-in', (e) => e.dispatchEvent(new Event('change', { bubbles: true })));
    assert.equal(await page.evaluate(() => ORDER_CART[11]), 25);
    await page.fill('#dl-order-list .pos-qty-in', '999'); await page.$eval('#dl-order-list .pos-qty-in', (e) => e.dispatchEvent(new Event('change', { bubbles: true })));
    assert.equal(await page.evaluate(() => ORDER_CART[11]), 40, 'ombordagidan oshmaydi');
    // rasmni bosish — to'liq ko'rgich
    await page.click('#dl-order-list .dl-pthumb[role=button]'); await page.waitForSelector('#fw-gal');
    await page.keyboard.press('Escape'); await page.waitForSelector('#fw-gal', { state: 'detached' });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
async function many() {
  const { browser, page, errors } = await openPage('diller.html', { width: 390, height: 844, mobile: true, loggedIn: true, tables: DEALER_TABLES });
  try {
    await page.evaluate(() => { dlSwitchTab('order'); CATALOG.length = 0; for (let i = 1; i <= 75; i++) CATALOG.push({ id: 100 + i, name: 'Mahsulot ' + i, sku: 'M' + i, qty: 9 });
      ORDER_CART = {}; DLO.seg = 'new'; DLO.lim = 60; dlRenderContent(); dlRenderOrderList(); });
    assert.equal(await page.$$eval('#dl-order-list .dl-prow', (a) => a.length), 60);
    assert.match(await page.textContent('#dl-order-list'), /Yana 15 ta/);
    await page.evaluate(() => [...document.querySelectorAll('#dl-order-list button')].find((b) => /Yana 15/.test(b.textContent)).click());
    assert.equal(await page.$$eval('#dl-order-list .dl-prow', (a) => a.length), 75, '61-75 ham ko\'rinadi');
    // «+» bosilganda ro'yxat joyida qoladi
    await page.evaluate(() => { document.getElementById('dl-order-list').scrollTop = 900; });
    const before = await page.evaluate(() => document.getElementById('dl-order-list').scrollTop);
    await page.evaluate(() => dlCartAdjust(130, 1, 9));
    const after = await page.evaluate(() => document.getElementById('dl-order-list').scrollTop);
    assert.ok(before > 0 && Math.abs(after - before) < 5, `tepaga sakramadi: ${before} → ${after}`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
module.exports = { name: 'P104 — Diller: miqdor raqam bilan, rasm to\'liq, buyurtmada nom asosiy', cases: [{ name: 'buyurtma: nom asosiy, qidiruv nom bo\'yicha oldin, raqam kiritish, rasm ko\'rgichi', run }, { name: '60 tadan ko\'p mahsulot — «Yana N ta»; + bosilganda ro\'yxat joyida', run: many }] };
