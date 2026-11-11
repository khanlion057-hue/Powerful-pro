// P24 — v23.6 brauzer: B2B oynalari (hamkordan kelgan matn — TASHQI tizim ma'lumoti) va mahsulot kartochkasi.
// Haqiqiy js/shared.js + js/main.js + js/b2b.js, haqiqiy Chromium; server javoblari — test ichida.
// Tekshiriladi: hamkor nomi / katalog / jo'natma qatorlaridagi HTML ishlamaydi; qabul — jo'natilgandan ko'p rad,
// yangi mahsulot hamkor kodi bilan yaratiladi va serverga aynan tanlangan son yuboriladi; katalogdan «katalogimga» —
// «ta'minotchidan sotiladi»; mahsulot kartochkasi va forma: shtrix-kod takrori rad, narx foizdan hisoblanadi.
const assert = require('node:assert/strict');
const path = require('path');
const { loadApp, ROOT } = require('./helpers/load-app');

const EVIL = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
const DATA = {
  ok: true, selfUrl: 'https://a.example.com',
  links: [{ id: 1, uid: 'u1', filial: 'baza', peerUrl: 'https://peer.example.com', peerName: 'Hamkor ' + EVIL, status: 'active', localApproved: true, peerApproved: true,
    permCatalog: true, permOrder: true, weSupply: true, theySupply: true, supplierLocalId: 701, customerLocalId: 501 }],
  orders: [{ linkId: 1, uid: 'ord-x-000001', dir: 'in', status: 'sent', items: [{ pid: 101, name: EVIL, sku: 'S1', qty: 2, priceUsd: 10 }], totalUsd: 20, delivered: true, createdAt: '2026-10-06T10:00:00Z' }],
  shipments: [{ linkId: 1, uid: 'shp-x-000001', dir: 'in', status: 'awaiting', items: [{ peerPid: 55, sku: 'PEER-55', name: 'Tovar ' + EVIL, qty: 5, priceUsd: 7 }], totalUsd: 35, delivered: false }],
};

async function withApp(fn) {
  const calls = [];
  const { browser, page, consoleErrors } = await loadApp({ mockRoutes: [{ url: '**/.netlify/functions/b2b', handler: (route) => {
    const b = JSON.parse(route.request().postData() || '{}'); calls.push(b);
    const reply = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (b.action === 'list') return reply(DATA);
    if (b.action === 'catalog') return reply({ ok: true, peerName: EVIL, items: [{ pid: 77, sku: 'P-77', name: 'Katalog ' + EVIL, unit: 'dona', cat: EVIL, brand: '', qty: 0, onOrder: true, priceUsd: 12, image: 'javascript:alert(1)' }] });
    if (b.action === 'receive') return reply({ ok: true, kind: 'b2b_receive', receivedTotalUsd: 21, delivered: true });
    return reply({ ok: true });
  } }] });
  try {
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov" class="modal-overlay"></div>');
      save = () => {}; auditLog = () => {}; pgTaminotchilar = () => {}; pgMahsulotlar = () => {};
      authHeaders = async () => ({ Authorization: 'Bearer t' });
      S.products = [{ id: 101, sku: 'PG-1', name: 'Drel', unit: 'dona', markupPct: 25, optMarkupPct: 15, barcode: '2001234567890' }, { id: 102, sku: 'PG-2', name: 'Arra', unit: 'dona' }];
      S.batches = [{ id: 'b1', pid: 101, qty: 10, sold: 0, costUsd: 40, date: '2026-09-01', status: 'active' }];
      S.suppliers = [{ id: 701, name: 'T' }]; S.customers = [{ id: 501, name: 'M', debt: 0 }]; S.sales = []; S.auditLogs = [];
    });
    await fn(page, calls);
    assert.equal(await page.evaluate(() => window.__xss), undefined, 'hamkordan kelgan HTML ishlamadi');
    assert.deepEqual(consoleErrors, [], "sahifada JS xatosi yo'q");
  } finally { await browser.close(); }
}

async function testProductCardAndForm() {
  await withApp(async (page) => {
    await page.evaluate(() => { S.page = 'mahsulotlar'; S.products[0].desc = '<b>tavsif</b> ' + '<img src=x onerror="window.__xss=1">'; openProductCard(101); });
    const t = await page.textContent('#modal-ov .pc-tiles');
    assert.match(t, /\$50/, 'sotuv narxi = 40 × 1.25'); assert.match(t, /\$40/); assert.match(t, /\$10/, 'marja');
    assert.equal(await page.$$eval('#modal-ov .pc-desc b', (x) => x.length), 0, 'tavsifdagi HTML ishlamaydi');
    for (const tab of ['hist', 'audit', 'ret', 'chart']) await page.evaluate((k) => { PC.tab = k; pcDyn(); }, tab);
    // Narx: ustama foizi saqlanadi (narx tannarxdan hisoblanadi)
    await page.evaluate(() => pmPriceSheet(101));
    await page.fill('#pp-rv', '60'); await page.dispatchEvent('#pp-rv', 'input');
    assert.equal(await page.inputValue('#pp-rp'), '50.00', '60$ / 40$ → 50%');
    await page.evaluate(() => pmPriceSave(101));
    assert.equal(await page.evaluate(() => S.products[0].markupPct), 50);
    // Forma: boshqa mahsulotning shtrix-kodi — rad
    await page.evaluate(() => editProduct(102));
    await page.fill('#ep-bc', '2001234567890');
    await page.evaluate(() => pmfSave());
    assert.equal(await page.evaluate(() => S.products[1].barcode || ''), '', 'takror shtrix-kod saqlanmadi');
    assert.match(await page.evaluate(() => window.__toasts.map(x => x.msg).join('|')), /Drel/);
    await page.fill('#ep-bc', '');
    await page.evaluate(() => { pmfBcAdd('ABC-123'); });
    await page.evaluate(() => pmfSave());
    assert.deepEqual(await page.evaluate(() => S.products[1].barcodes), ['ABC-123']);
    assert.equal(await page.evaluate(() => qrResolveToProduct('abc-123')?.id), 102, 'skaner qo\'shimcha shtrix-kod bo\'yicha topadi');
  });
}

module.exports = {
  name: 'P24 — v23.6 brauzer: mahsulot kartochkasi (v25: B2B oynalari olib tashlandi)',
  cases: [
    { name: 'Mahsulot kartochkasi: narx/tannarx/marja, bo\'limlar; narx foizdan; shtrix-kod takrori rad, skaner qo\'shimcha kod bilan topadi', run: testProductCardAndForm },
  ],
};
