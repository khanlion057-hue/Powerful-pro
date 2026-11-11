// P59 — v24.6 (egasi talabi): kirim o'chirilganda — omborda qolmagan va hech qayerda ishlatilmagan mahsulot NOMI ham
// o'chiriladi (tasdiq bilan; «Bekor» — arxivga). Savdo oynasida «sharpa» (qoldiq 0, hech qayerda izi yo'q) mahsulot chiqmaydi.
//  • Boshqa filialda partiyasi, savdo tarixi, hisobdan chiqarish, filial so'rovi bor mahsulot — TEGILMAYDI.
//  • Barcha filiallar ma'lumoti yuklanmagan bo'lsa (xodim) — hech narsa o'chirilmaydi/arxivlanmaydi.
//  • Sotilgan, lekin partiyasi o'chirilgan mahsulot — Mahsulotlar ro'yxatida («Mavjud emas») ko'rinadi.
//  • Avvaldan qolgan «sharpa» nomlar — Mahsulotlar sahifasida tozalash tugmasi.
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

async function withApp(fn) {
  const { browser, page, consoleErrors } = await loadApp({});
  try {
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div><div id="pg-mahsulotlar"></div><div id="pg-kirim"></div>');
      save = () => {}; pgKirim = () => {}; pgOmbor = () => {}; deleteProductImage = () => {}; _cloudEnabled = false;
      window.__conf = []; confirm = (m) => { __conf.push(m); return window.__ans !== false; };
      const P = (id, name) => ({ id, sku: 'S' + id, name, cat: 'K', unit: 'dona', minStock: 1, markupPct: 25 });
      Object.assign(S, { branch: 'baza', page: 'kirim',
        products: [P(1, 'Faqat shu kirimda'), P(2, 'Boshqa filialda bor'), P(3, 'Sotilgan'), P(4, 'Sharpa (eski)'), P(5, 'Filial soʻrovida'), P(6, 'Boshqa partiyada')],
        batches: [{ id: 11, pid: 1, bno: '07', qty: 5, sold: 0, costUsd: 1, status: 'active' }, { id: 12, pid: 2, bno: '07', qty: 5, sold: 0, costUsd: 1, status: 'active' },
                  { id: 13, pid: 3, bno: '07', qty: 5, sold: 0, costUsd: 1, status: 'active' }, { id: 15, pid: 5, bno: '07', qty: 1, sold: 0, costUsd: 1, status: 'active' },
                  { id: 16, pid: 6, bno: '07', qty: 1, sold: 0, costUsd: 1, status: 'active' }, { id: 17, pid: 6, bno: '08', qty: 2, sold: 0, costUsd: 1, status: 'active' }],
        sales: [{ id: 91, items: [{ pid: 3, qty: 1 }] }], filialOrders: [{ id: 1, items: [{ pid: 5, qty: 1 }] }], dealerStock: [], dealerTxns: [],
        _store: { f729: { batches: [{ id: 21, pid: 2, qty: 3, sold: 0, costUsd: 1, status: 'active' }], sales: [] } } });
    });
    await fn(page);
    assert.deepEqual(consoleErrors, [], "sahifada JS xatosi yo'q");
  } finally { await browser.close(); }
}
const ids = (page) => page.evaluate(() => S.products.map(p => p.id + (p.archived ? 'a' : '')).join(','));

module.exports = {
  name: 'P59 — kirim o\'chirilganda mahsulot nomlari tekshiriladi',
  cases: [
    { name: "kirim #07 o'chirildi — faqat izsiz nomlar (1, eski sharpa 4) o'chiriladi; boshqa filial/savdo/so'rov/partiya — qoladi", async run() {
      await withApp(async (page) => {
        await page.evaluate(() => { if (typeof BRANCHES !== 'undefined') BRANCHES.f729 = BRANCHES.f729 || { name: '729' }; });
        await page.evaluate(async () => { await deleteBatchGroup('07'); });
        const r = await page.evaluate(() => ({ conf: __conf.length, last: __conf[__conf.length - 1], del: (S.deletedIds && S.deletedIds.products || []).map(d => d.id) }));
        assert.equal(await ids(page), '2,3,4,5,6', "shu kirimdagi izsiz «1» o'chirildi (4 — bu kirimga tegishli emas, tegilmaydi)");
        assert.match(r.last, /1 ta mahsulot/); assert.deepEqual(r.del, [1]);
        // Sotilgan (3) — Mahsulotlar ro'yxatida ko'rinadi; sharpa (4) — yo'q; savdo oynasida ham sharpa yo'q
        const v = await page.evaluate(() => ({ list: branchVisibleProducts(S.products).map(p => p.id), pos: POS_ADMIN.visible(S.products).map(p => p.id) }));
        assert.ok(v.list.includes(3) && !v.list.includes(4)); assert.ok(!v.pos.includes(4), "savdoda sharpa yo'q");
      });
    } },
    { name: "«Bekor» — o'chirilmaydi, arxivga o'tadi", async run() {
      await withApp(async (page) => {
        await page.evaluate(async () => { window.__ans = undefined; const c = confirm; let n = 0; confirm = (m) => (++n === 1); await deleteBatch('11'); });
        assert.equal(await ids(page), '1a,2,3,4,5,6');
      });
    } },
    { name: "xodim (boshqa filial ma'lumoti yo'q) — hech narsa o'chirilmaydi/arxivlanmaydi", async run() {
      await withApp(async (page) => {
        await page.evaluate(async () => { if (typeof BRANCHES !== 'undefined') BRANCHES.f729 = BRANCHES.f729 || { name: '729' }; S._store = {}; await deleteBatchGroup('07'); });
        assert.equal(await ids(page), '1,2,3,4,5,6');
      });
    } },
    { name: 'avvaldan qolgan sharpa nomlar — Mahsulotlar sahifasida tozalash tugmasi', async run() {
      await withApp(async (page) => {
        const r = await page.evaluate(() => { S.batches = S.batches.filter(b => b.pid !== 1); pgMahsulotlar(); const b = document.querySelector('.pm-ghost');
          const t = b && b.textContent; b && b.click(); return { t, prods: S.products.map(p => p.id).join(',') }; });
        assert.match(r.t || '', /2 ta mahsulot hech qayerda/);
        assert.equal(r.prods, '2,3,5,6');
      });
    } },
  ],
};
