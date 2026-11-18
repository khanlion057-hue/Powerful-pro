// P105 — v25.6.9 Mahsulotlar: takroriy «Hammasi/Kam/Mavjud emas» qatori yoʻq; kategoriyalarni boshqarish (nom, olib tashlash)
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;
async function run() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    await page.evaluate(() => { save = () => {}; S.products.forEach((p, i) => { p.cat = i % 2 ? 'Disk' : 'Arra'; }); go('mahsulotlar'); pgMahsulotlar(); });
    await page.waitForSelector('#pg-mahsulotlar .pmh-3');
    assert.equal(await page.locator('#pg-mahsulotlar .pm-chips').count(), 0, 'pastdagi takroriy qator olib tashlandi');
    assert.equal(await page.locator('#pg-mahsulotlar .pmh-b').count(), 3, 'tepadagi 3 ta tugma qoldi');
    await page.click('#pg-mahsulotlar .pm-cat-edit'); await page.waitForSelector('#bs-ov .dl-prow');
    const names = await page.$$eval('#bs-ov .dl-pname', (a) => a.map((e) => e.textContent.trim()));
    assert.deepEqual(names.sort(), ['Arra', 'Disk']);
    await page.evaluate(() => { window.prompt = () => 'Pichoq'; pmCatRename('Disk'); });
    assert.ok(await page.evaluate(() => S.products.every((p) => p.cat !== 'Disk') && S.products.some((p) => p.cat === 'Pichoq')));
    await page.evaluate(() => { window.confirm = () => true; pmCatRemove('Pichoq'); });
    assert.ok(await page.evaluate(() => S.products.every((p) => p.cat !== 'Pichoq')));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
module.exports = { name: 'P105 — Mahsulotlar kategoriyasi', cases: [{ name: 'takroriy qator yoʻq; kategoriyani qayta nomlash/olib tashlash', run }] };
