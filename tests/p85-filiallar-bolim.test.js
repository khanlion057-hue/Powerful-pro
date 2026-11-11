// P85 — v25 (egasi talabi 2026-11-10): FILIALLAR — Dillerlar kabi alohida, to'liq bo'lim.
//  • Menyuda va Tezkor amallarda Dillerlar va Filiallar — alohida; Dillerlar ichida «Filiallar» yorlig'i yo'q.
//  • Filiallar yorliqlari: Filiallar, Buyurtmalar, Nazorat, Ombor, Yuborish, Savdo, Qarzlar, Revizya, Statistika.
//  • Bosh sahifada Filiallar va Dillerlar statistikasi.
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;

module.exports = {
  name: 'P85 — Filiallar: alohida toʻliq boʻlim (yorliqlar), bosh sahifada statistika',
  cases: [
    { name: 'yorliqlar, ombor/savdo/qarz/revizya/statistika maʼlumoti; menyu va tezkor amallar alohida', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        const r = await page.evaluate(async () => {
          S._store = S._store || {}; const L = S._store.f729 = S._store.f729 || {};
          const p = S.products[0], t = td();
          L.batches = [{ id: 1, pid: p.id, qty: 10, sold: 3, costUsd: 5, status: 'active' }, { id: 2, pid: p.id, qty: 4, sold: 0, costUsd: 5, status: 'transit' }];
          L.sales = [{ id: 9, inv: 'F-001', date: t, totalUsd: 30, custName: 'Ali', items: [{ pid: p.id, qty: 3, sellUsd: 10 }] }];
          L.revisions = [{ id: 1, date: t, rows: [{ pid: p.id, diff: -1, diffUsd: -5 }], totalDiffUsd: -5, applied: true, performedBy: 'Omborchi' }];
          S.settings.branchPct = { f729: 10 }; S.branchDebt = { f729: 27 };
          go('filiallar');
          const tabs = [...document.querySelectorAll('#pg-filiallar .dl-tabs button span')].map(x => x.textContent);
          const txt = {};
          for (const k of ['ombor', 'sale', 'debt', 'revizya', 'stat']) { flSetTab(k); txt[k] = document.getElementById('fl-tab-body').innerText.replace(/\s+/g, ' '); }
          go('dillerlar'); const dTabs = [...document.querySelectorAll('#pg-dillerlar .dl-tabs button span')].map(x => x.textContent);
          go('dashboard'); const home = document.getElementById('pg-dashboard').innerText;
          const acts = shellMenuItems().map(x => x[3]);
          const nav = [...document.querySelectorAll('.sidebar .nav-item')].map(b => b.dataset.page);
          return { tabs, txt, dTabs, homeFl: /Filiallar/.test(home) && /Dillerlar/.test(home), acts, nav };
        });
        assert.deepEqual(r.tabs, ['Filiallar', 'Buyurtmalar', 'Nazorat', 'Ombor', 'Yuborish', 'Savdo', 'Qarzlar', 'Revizya', 'Statistika']);
        assert.ok(!r.dTabs.includes('Filiallar'), 'Dillerlar ichida Filiallar yorligʻi yoʻq');
        assert.match(r.txt.ombor, /Qoldiq 7 dona/); assert.match(r.txt.ombor, /Yoʻlda 4/);
        assert.match(r.txt.sale, /F-001/); assert.match(r.txt.sale, /Xizmat haqi \$3\.00/);
        assert.match(r.txt.debt, /\$27\.00/);
        assert.match(r.txt.revizya, /−\$5\.00/);
        assert.match(r.txt.stat, /Filiallar reytingi/i); assert.match(r.txt.stat, /Jami sotuv \$30\.00/);
        assert.equal(r.homeFl, true, 'bosh sahifada Filiallar va Dillerlar bloki');
        assert.ok(r.acts.includes('Dillerlar') && r.acts.includes('Filiallar'), 'tezkor amallarda alohida');
        assert.ok(r.nav.includes('filiallar') && r.nav.includes('dillerlar'), 'menyuda alohida');
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
  ],
};
