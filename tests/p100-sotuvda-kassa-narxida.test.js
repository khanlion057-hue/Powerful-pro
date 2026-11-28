// P100 — v25.6.6: «Sotuvda» (ombor qoldig'ining sotuv qiymati) KASSADAGI HAQIQIY narx bilan hisoblanadi.
// Avval: qoldiq × tannarx × (1 + ustama%) — yaxlitlanmagan (kassada sotilganda chiqadigan pulga mos kelmasdi, adashtirardi: 328 239 $).
// Endi: kassadagi chakana narx (butun $ → so'mda qadamga yaxlit) × qoldiq; kassada narxi $0 bo'lib qoladigan mahsulot (arzon tannarx) — 0.
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

async function withApp(fn) {
  const { browser, page, consoleErrors } = await loadApp({});
  try {
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div id="pg-mahsulotlar"></div><div id="modal-ov"></div>');
      save = () => {}; CUR.usdUzs = 12000;
      const P = (id, name, mk) => ({ id, sku: 'S' + id, name, cat: 'K', unit: 'dona', minStock: 1, markupPct: mk, optMarkupPct: 15 });
      Object.assign(S, { branch: 'baza', page: 'mahsulotlar', sales: [], settings: { roundingEnabled: true },
        products: [P(1, 'Oddiy', 25), P(2, 'Arzon', 69.5652), P(3, 'Ming', 70)],
        batches: [{ id: 11, pid: 1, qty: 3, sold: 0, costUsd: 12, status: 'active' }, { id: 12, pid: 2, qty: 4, sold: 0, costUsd: 0.23, status: 'active' }, { id: 13, pid: 3, qty: 10, sold: 0, costUsd: 7.4, status: 'active' }] });
    });
    await fn(page);
    assert.deepEqual(consoleErrors, [], "sahifada JS xatosi yo'q");
  } finally { await browser.close(); }
}

async function testShelf() {
  await withApp(async (page) => {
    const r = await page.evaluate(() => {
      const u = (id) => fwShelfUsd(S.products.find((p) => p.id === id), getCostFIFO(id));
      const ds = _dsStock(); pgMahsulotlar();
      const tiles = [...document.querySelectorAll('.pmh-2 > div')].map((d) => d.innerText.replace(/\s+/g, ' ').trim());
      return { u1: u(1), u2: u(2), u3: u(3), sell: ds.sell, cost: Math.round(ds.cost * 100) / 100, tiles };
    });
    assert.equal(r.u1, 15, 'tannarx 12 × 1.25 = 15$ (kassada 180 000 soʻm)');
    assert.equal(Math.round(r.u2 * 10000) / 10000, 0.4167, "v25.6.9 (egasi qarori): tannarx 0.23 → chakana 0.39$ sentgacha → kassada 5 000 soʻm (0 emas)");
    assert.equal(r.u3, 13, '7.4 × 1.7 = 12.58$ → 13$ (156 000 soʻm)');
    assert.equal(Math.round(r.sell * 100) / 100, 176.67, "Sotuvda = Σ qoldiq × kassa narxi (45 + 4×0.4167 + 130)");
    assert.equal(r.cost, 110.92, 'tannarx oʻzgarmagan');
    assert.ok(r.tiles.some((t) => /Sotuvda/.test(t) && /\$176\.67/.test(t)), 'Mahsulotlar sahifasida $176.67: ' + JSON.stringify(r.tiles));
    assert.ok(r.tiles.some((t) => /Tannarxda/.test(t) && /\$110\.92/.test(t)));
  });
}

module.exports = { name: "P100 — «Sotuvda» kassa narxida (v25.6.6)", cases: [
  { name: "Sotuvda = Σ qoldiq × kassadagi haqiqiy chakana narx; arzon mahsulot kassada $0 — hisobga 0; tannarx oʻzgarmaydi", run: testShelf },
] };
