// P127 — v25.6.10: kompyuterda (≥1100px) ro'yxatlar jadval ko'rinishida: Mijozlar, Ta'minotchilar, Kassa harakati,
// Qaytarishlar, Ombor. Saralash, qidiruv, «⋯» menyu va asosiy tugma ishlaydi; telefonda — avvalgi kartochkalar.
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;

const SEED = () => {
  S.customers = [
    { id: 1, name: 'Bekzod', phone: '+998901', debt: 1250000 },
    { id: 2, name: 'Anvar', phone: '+998902', debt: 0 },
    { id: 3, name: 'Vali', phone: '', debt: 250000 },
  ];
  S.suppliers = [{ id: 7, name: 'Xitoy Co', country: 'Xitoy', debt: 300, paid: 50 }, { id: 8, name: 'Bosch', country: 'Germaniya', debt: 0, paid: 10 }];
  S.cashTxns = [{ id: 1, date: td(), type: 'in', amount: 500000, cur: 'UZS', desc: 'Savdo A-1', boxId: 1 }, { id: 2, date: td(), type: 'out', amount: 20, cur: 'USD', desc: 'Xarajat', boxId: 3 }];
  S.products = [{ id: 101, sku: 'P1', name: 'Drel', unit: 'dona', minStock: 1 }];
  S.batches = [{ id: 'b1', bno: 'K-1', pid: 101, qty: 10, sold: 4, costUsd: 40, date: td(), status: 'active', origin: 'Kirim', cur: 'USD' }];
  S.sales = [{ id: 's1', inv: 'INV-1', date: td(), custName: 'Bekzod', staffName: 'Ali', items: [{ pid: 101, qty: 1, name: 'Drel' }], totalUsd: 100 }];
};

async function desktop() {
  const { browser, page, errors } = await openPage('index.html', { width: 1366, height: 900, admin: true, scale: null });
  try {
    await page.evaluate(SEED);
    await page.evaluate(() => go('mijozlar'));
    assert.equal(await page.$$eval('#mj-table table.dt tbody tr', t => t.length), 3, 'mijozlar jadvalda');
    const first = () => page.$eval('#mj-table tbody tr .dt-name', e => e.textContent.trim());
    assert.equal(await first(), 'Bekzod', 'standart — eng katta qarz tepada');
    await page.click('#mj-table th:has-text("Mijoz")');
    assert.equal(await first(), 'Anvar', 'nomi bo\'yicha saralash');
    assert.match(await page.$eval('#mj-table tfoot', e => e.textContent), /1 500 000/, 'JAMI qarz pastda');
    await page.fill('#mj-q', 'vali'); await page.waitForTimeout(100);
    assert.equal(await page.$$eval('#mj-table tbody tr', t => t.length), 1, 'qidiruv');
    await page.click('#mj-table .dt-act:has-text("⋯")');
    const menu = await page.$$eval('.fr-act span', e => e.map(x => x.textContent));
    assert.ok(menu.includes('Tarix') && menu.includes('Hisob-varaqni chop etish'), 'qolgan amallar menyuda: ' + menu);
    await page.evaluate(() => closeSheet());

    await page.evaluate(() => go('taminotchilar'));
    assert.equal(await page.$$eval('#tm-table tbody tr', t => t.length), 2);
    assert.equal(await page.$$eval('#tm-table .dt-act:has-text("Toʻlash")', t => t.length), 1, 'To\'lash faqat qarzi borda');

    await page.evaluate(() => go('kassalar'));
    const ks = await page.$$eval('#ks-mv tbody tr', t => t.map(r => r.textContent));
    assert.equal(ks.length, 2); assert.match(ks.join('|'), /\+500 000/); assert.match(ks.join('|'), /−\$20/);

    await page.evaluate(() => { S.qrF = 'all'; go('qaytarish'); });
    assert.equal(await page.$$eval('#qr-table tbody tr', t => t.length), 1);
    assert.equal(await page.$$eval('#qr-table .dt-act:has-text("Qaytarish")', t => t.length), 1);

    await page.evaluate(() => go('ombor'));
    assert.match(await page.$eval('#om-list tbody tr', e => e.textContent), /6\s*\/ 10/, 'qoldiq 6 / 10');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function phone() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    await page.evaluate(SEED);
    await page.evaluate(() => go('mijozlar'));
    assert.equal(await page.$$eval('#mj-table table', t => t.length), 0, 'telefonda jadval yo\'q');
    assert.equal(await page.$$eval('#mj-table .fw-pc', t => t.length), 3, 'kartochkalar');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

module.exports = { name: 'P127 — Kompyuter jadvallari', cases: [
  { name: 'kompyuterda: mijozlar, taʼminotchilar, kassa, qaytarish, ombor — jadval, saralash, qidiruv, ⋯ menyu', run: desktop },
  { name: 'telefonda: kartochkalar oʻzgarmagan', run: phone },
] };
