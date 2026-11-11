// P76 — v25 (egasi qarori): Dillerlar → «Filiallar» yorlig'i. Filial — dillerdek: tovar berish, qaytarish, qarz, xizmat foizi.
//  • Xizmat haqi faqat sotilgan tovar uchun: qator summasi × foiz (mahsulotda alohida foiz bo'lsa — o'shasi), chek chegirmasi taqsimlanadi.
//  • Omborida — optom narxda; yo'ldagi (transit) alohida; bekor qilingan savdo hisobga kirmaydi.
//  • Foizni o'zgartirish — sozlamaga yoziladi; mahsulot kartasida alohida foiz.
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;

module.exports = {
  name: 'P76 — Filiallar yorlig\'i: xizmat foizi (faqat sotilgan), optom ombor, hisob-kitob',
  cases: [
    { name: 'hisob: 10% filial + 5% alohida mahsulot, chek chegirmasi, bekor savdo yo\'q; karta va hisob-kitob oynasi', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        const r = await page.evaluate(() => {
          const d = td();
          S.products = [{ id: 1, name: 'Drel', optMarkupPct: 15 }, { id: 2, name: 'Kafel', optMarkupPct: 15, branchPct: 5 }];
          S.settings.branchPct = { f729: 10 }; S.branchDebt = { f729: 1840 };
          S._store = S._store || {};
          S._store.f729 = { batches: [{ id: 9, pid: 1, qty: 20, sold: 6, costUsd: 40, status: 'active' }, { id: 11, pid: 1, qty: 5, sold: 0, costUsd: 40, status: 'transit' }],
            sales: [{ id: 1, inv: 'A', date: d, totalUsd: 270, items: [{ pid: 1, qty: 6, sellUsd: 50 }] },          // 300 − 10% chek chegirmasi = 270
                    { id: 2, inv: 'B', date: d, totalUsd: 360, items: [{ pid: 2, qty: 30, sellUsd: 12 }] },
                    { id: 3, inv: 'C', date: d, totalUsd: 999, status: 'voided', items: [{ pid: 1, qty: 1, sellUsd: 999 }] }] };
          const c = flCalc('f729', d.slice(0, 8) + '01', d), st = flStock('f729');
          go('filiallar');
          const card = document.querySelector('.fl-card').textContent;
          flStatement('f729'); const sheet = document.body.textContent.includes('INV') || document.body.textContent.includes('A');
          return { c: [Math.round(c.rev * 100) / 100, Math.round(c.fee * 100) / 100, Math.round(c.owe * 100) / 100, c.count], st: [st.qty, Math.round(st.val * 100) / 100, st.transit], card, sheet };
        });
        assert.deepEqual(r.c, [630, 45, 585, 2], '270×10% + 360×5% = 27 + 18; bekor qilingan kirmaydi');
        assert.deepEqual(r.st, [14, 644, 5], '14 dona × 40 × 1.15 optom; yo\'ldagi 5 alohida');
        assert.match(r.card, /729-filial/); assert.match(r.card, /10%/); assert.match(r.card, /\$1 840/); assert.match(r.card, /Mahsulot berish/);
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
    { name: 'filial sozlamalari: Filial / Mustaqil + foiz saqlanadi; filialda «Bazadan buyurtma» tezkor amali, Bazada yo\'q', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        const r = await page.evaluate(async () => {
          save = async () => true;
          const def = flCfg('f729').type;
          go('filiallar'); flSettings('f729');
          document.querySelectorAll('#fl-type button')[1].click(); document.getElementById('fl-pct').value = '12'; flSettingsSave('f729');
          await new Promise(r => setTimeout(r, 200));
          const saved = [flCfg('f729').type, flPct('f729'), S.settings.branchCfg.f729.type];
          const baza = shellMenuItems().some(([pg]) => pg === '!fr_req');
          const was = S.branch; S.branch = 'f729'; const fil = shellMenuItems().some(([pg]) => pg === '!fr_req'); S.branch = was;
          return { def, saved, baza, fil };
        });
        assert.equal(r.def, 'filial', 'standart — filial (Baza onlayn-do\'koni)');
        assert.deepEqual(r.saved, ['mustaqil', 12, 'mustaqil']);
        assert.equal(r.baza, false); assert.equal(r.fil, true, 'filialda «Bazadan buyurtma»');
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
  ],
};
