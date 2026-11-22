// P134 — v25.6.10 (egasi: «aynan undan kelgan mahsulotlar — nima sotildi, nima qoldi»): ta'minotchi bo'yicha mahsulotlar hisoboti.
// So'mda bergan ta'minotchi — narx va summalar so'mda (aniq); boshqa ta'minotchi tovari aralashmaydi; filtrlar; JAMI; telefon va kompyuter.
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;

const SEED = () => {
  S.products = [{ id: 1, sku: 'DD-20', name: 'Drel olmos', unit: 'dona' }, { id: 2, sku: 'AR-5', name: 'Arra', unit: 'dona' }, { id: 3, sku: 'X-1', name: 'Xitoy tovari', unit: 'dona' }];
  S.suppliers = [{ id: 9, name: 'ALTECO', isConsignment: true, debtCur: 'UZS', debt: 410.4, debtUzs: 5191600 }, { id: 7, name: 'Xitoy Co', debt: 300 }];
  S.batches = [
    { id: 'a1', pid: 1, qty: 5, sold: 2, suppId: 9, consignment: true, accCur: 'UZS', costUzs: 2595800, goodsUzs: 2595800, costUsd: 205.2, date: '2026-11-22', status: 'active' },
    { id: 'a2', pid: 2, qty: 3, sold: 0, suppId: 9, consignment: true, accCur: 'UZS', costUzs: 1250000, goodsUzs: 1250000, costUsd: 98.8, date: '2026-11-22', status: 'active' },
    { id: 'x1', pid: 3, qty: 10, sold: 4, suppId: 7, costUsd: 12, goodsUsd: 12, date: '2026-11-01', status: 'active' },
  ];
};

async function run(width, height, mobile, shot) {
  const { browser, page, errors } = await openPage('index.html', { width, height, mobile, admin: true, scale: null });
  try {
    await page.evaluate(SEED);
    await page.evaluate(() => { go('taminotchilar'); openSuppProducts(9); });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const t = document.getElementById('spr-body');
      return { text: t.textContent, rows: t.querySelectorAll('table.dt tbody tr').length };
    });
    assert.equal(r.rows, 2, 'faqat ALTECO tovarlari (Xitoy aralashmadi)');
    assert.match(r.text, /Drel olmos/); assert.doesNotMatch(r.text, /Xitoy tovari/);
    assert.match(r.text, /5\s191\s600/, 'sotilgan 2 x 2 595 800 so\'m — qarz');
    assert.match(r.text, /11\s537\s400/, 'qolgan: 3 x 2 595 800 + 3 x 1 250 000');
    // filtr: sotilgani
    await page.evaluate(() => { SPR.f = 'sold'; sprRender(); });
    assert.equal(await page.$$eval('#spr-body table.dt tbody tr', t => t.length), 1);
    await page.evaluate(() => { SPR.f = 'all'; sprRender(); });
    if (shot) await page.screenshot({ path: shot });
    // dollardagi ta'minotchi — $ da
    await page.evaluate(() => { closeSheet(); openSuppProducts(7); });
    await page.waitForTimeout(200);
    assert.match(await page.$eval('#spr-body', e => e.textContent), /\$48\.00/, 'Xitoy: 4 x $12');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

module.exports = { name: "P134 — Ta'minotchi bo'yicha mahsulotlar hisoboti", cases: [
  { name: "kompyuter: faqat shu ta'minotchi, so'mda aniq, sotilgan/qolgan summa, filtr", run: () => run(1366, 900, false, process.env.P134_SHOT_D) },
  { name: 'telefon: xuddi shu hisobot', run: () => run(390, 844, true, process.env.P134_SHOT_M) },
] };
