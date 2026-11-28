// P80 — v25 (egasi qarori): Baza onlayn-do'konida FILIAL TANLASH. «Filial» turidagi filiallar Baza vitrinasida tanlanadi:
//  qoldiq — tanlangan filialdan; buyurtma — o'sha filialning Onlayn-do'kon ro'yxatiga (raqami o'z ketma-ketligida).
//  «Mustaqil» filial — ro'yxatda yo'q (o'z do'koni). Filialda yoki filial yo'q bo'lsa — tanlov ko'rinmaydi.
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;

module.exports = {
  name: 'P80 — Baza vitrinasida filial tanlash: qoldiq va buyurtma tanlangan filialdan',
  cases: [
    { name: 'tanlov: Baza + filial turidagilar (mustaqil yo\'q); qoldiq filialdan; buyurtma filial ro\'yxatiga', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        const r = await page.evaluate(async () => {
          save = async () => true;
          BRANCHES.f702 = { name: '702-filial', icon: '🏬' };
          S.products = [{ id: 1, sku: 'A', name: 'Drel', markupPct: 25 }, { id: 2, sku: 'B', name: 'Kafel', markupPct: 25 }];
          S.batches = [{ id: 1, pid: 1, qty: 5, sold: 0, costUsd: 40, status: 'active', date: td() }];
          S._store = S._store || {};
          S._store.f729 = { batches: [{ id: 9, pid: 2, qty: 7, sold: 2, costUsd: 8, status: 'active' }], shop: { orders: [{ id: 'old', no: 4, status: 'done', items: [] }] } };
          S._store.f702 = { batches: [] };
          S.settings.branchCfg = { f702: { type: 'mustaqil' } };
          const sh = shopData(); sh.settings = Object.assign(sh.settings || {}, { enabled: true, name: 'Powerful' });
          dkOpenStorefront();
          const chips = [...document.querySelectorAll('.sf-br button')].map(b => b.textContent);
          const bazaCards = document.querySelectorAll('.sf-main .sf-card, .sf-main [data-pid]').length;
          sfSetBranch('f729');
          const stock = [sfStock(1), sfStock(2)];
          sfAdd(2, 9);                                     // 5 tadan ko'p qo'shib bo'lmaydi
          const inCart = SF.cart[2];
          Object.assign(SF, { name: 'Ali', phone: '+998 90 111 22 33', del: 'pickup' });
          sfOrder();
          const fo = S._store.f729.shop.orders[0], bazaOrders = shopData().orders.length;
          sfClose(); BRANCHES.f702 && delete BRANCHES.f702;
          const was = S.branch; S.branch = 'f729'; const inBranch = sfBranches().length; S.branch = was;
          return { chips, stock, inCart, fo: fo && [fo.no, fo.viaBaza, fo.items.map(i => [i.pid, i.qty])], bazaOrders, inBranch };
        });
        assert.deepEqual(r.chips, ['Baza', '729-filial'], 'mustaqil 702 — ro\'yxatda yo\'q');
        assert.deepEqual(r.stock, [0, 5], 'qoldiq — tanlangan filialdan');
        assert.equal(r.inCart, 5, 'filial qoldig\'idan ko\'p emas');
        assert.deepEqual(r.fo, [5, true, [[2, 5]]], 'buyurtma filial ro\'yxatiga, o\'z raqamida');
        assert.equal(r.bazaOrders, 0, 'Bazaga tushmadi');
        assert.equal(r.inBranch, 0, 'filialning o\'zida tanlov yo\'q');
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
  ],
};
