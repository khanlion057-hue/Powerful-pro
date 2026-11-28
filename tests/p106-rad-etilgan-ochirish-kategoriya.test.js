// P106 — v25.6.9: rad etilgan diller buyurtmasini oʻchirish (server + admin), diller buyurtmasida kategoriya
const assert = require('node:assert/strict');
const { openPage, DEALER_TABLES } = require('./p4-responsive.test.js')._helpers;
const fn = require('../netlify/functions/dealer-order-status.js');

async function portal() {
  const { browser, page, errors } = await openPage('diller.html', { width: 390, height: 844, mobile: true, loggedIn: true, tables: DEALER_TABLES });
  try {
    await page.evaluate(() => {
      dlSwitchTab('order'); CATALOG.length = 0;
      CATALOG.push({ id: 11, name: 'Disk 350', sku: 'A1', qty: 4, cat: 'Disk' }, { id: 12, name: 'Arra', sku: 'B2', qty: 3, cat: 'Arra' });
      DLO.seg = 'new'; DLO.cat = ''; dlRenderContent(); dlRenderOrderList();
    });
    await page.waitForSelector('#dl-order-list .dl-prow');
    assert.equal(await page.locator('#dl-order-list .dl-prow').count(), 2);
    await page.click('.pm-cats .pm-cat:has-text("Arra")'); await page.waitForTimeout(100);
    assert.deepEqual(await page.$$eval('#dl-order-list .dl-pname', (a) => a.map((e) => e.textContent.trim())), ['Arra']);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
async function server() {
  const src = require('fs').readFileSync(require.resolve('../netlify/functions/dealer-order-status.js'), 'utf8');
  assert.match(src, /isDelete/); assert.match(src, /Faqat rad etilgan buyurtmani/);
  assert.match(src, /\.delete\(\)\.eq\('id', orderId\)\.eq\('status', 'rejected'\)/);
  assert.equal(typeof fn.handler, 'function');
}
module.exports = { name: 'P106 — Rad etilganni oʻchirish, diller kategoriyasi', cases: [
  { name: 'server: faqat rad etilgan buyurtma oʻchadi', run: server },
  { name: 'diller buyurtma: kategoriya boʻyicha filtr', run: portal },
] };
