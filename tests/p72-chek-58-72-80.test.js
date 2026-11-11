// P72 — v25: CHEK 58 / 72 / 80 mm. Haqiqiy Chromium'da chek HTML'i chiziladi va o'lchanadi:
//  • qatorlar yig'indisi − chegirma = JAMI (har doim teng); yaxlitlash «Yaxlitlash» deb yoziladi;
//  • uzun nom va katta summa — gorizontal toshish yo'q (58 mm da ham); miqdor guruhlab «× 1 250»;
//  • qarz: To'landi + Qarz = JAMI, to'lov sanasi; qaytim: Naqd − Qaytim = JAMI; $ chek — $ da;
//  • chop etishda qog'oz balandligi chek uzunligiga teng (@page), PDF bitta sahifa;
//  • eski cheklar (time, changeN, roundedTotalUzs yo'q) ham ochiladi.
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;

module.exports = {
  name: 'P72 — chek 58/72/80 mm: hisob mos, toshish yo\'q, qarz/qaytim/$, qog\'oz balandligi',
  cases: [
    { name: 'hisob: qatorlar − chegirma = JAMI; qarz, qaytim, $ va eski chek', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 1280, height: 900, admin: true });
      try {
        const r = await page.evaluate(() => {
          const base = { inv: 'INV-0042', date: '2026-11-08', time: '14:20', custName: 'Ali', rateUsdUzs: 12500, cur: 'UZS', payType: 'cash_uzs' };
          // 0,25 kg × 1 313 000 = 328 250 + 1 × 50 000 → 378 250; yaxlitlash → 378 200
          const a = fwReceiptCalc({ ...base, items: [{ name: 'Aralashma', qty: 0.25, sellUsd: 105.04 }, { name: 'Shpaklyovka', qty: 1, sellUsd: 4 }], totalUsd: 378200 / 12500, roundedTotalUzs: 378200, discountReason: 'rounding' }, 12500, true);
          const debt = fwReceiptCalc({ ...base, items: [{ name: 'X', qty: 1, sellUsd: 105.04 }], totalUsd: 105.04, roundedTotalUzs: 1313000, debtUsd: 25.04, paidUsd: 80 }, 12500, true);
          const chg = fwReceiptCalc({ ...base, items: [{ name: 'X', qty: 1, sellUsd: 105.04 }], totalUsd: 105.04, roundedTotalUzs: 1313000, changeN: 7000, paidN: 1320000 }, 12500, true);
          const usd = fwReceiptCalc({ ...base, cur: 'USD', items: [{ name: 'X', qty: 3, sellUsd: 10.33 }], totalUsd: 30.99, debtUsd: 0 }, 12500, false);
          const old = fwReceiptHtml({ inv: 'INV-0001', date: '2026-01-05', custName: 'Anonim', items: [{ name: 'Eski', qty: 2, sellUsd: 10 }], totalUsd: 20, discUsd: 0, debtUsd: 0, rateUsdUzs: 12000, cur: 'UZS' }, { widthMm: 72 });
          const html = fwReceiptHtml({ ...base, items: [{ name: 'Aralashma', qty: 0.25, sellUsd: 105.04 }, { name: 'Shpaklyovka', qty: 1250, sellUsd: 4 }], totalUsd: 5328250 / 12500, roundedTotalUzs: 5328200, discountReason: 'rounding', changeN: 1800, paidN: 5330000 }, { widthMm: 72 });
          return { a, debt, chg, usd, old: /Eski/.test(old) && /240 000 soʻm/.test(old), html };
        });
        assert.deepEqual([r.a.sum, r.a.disc, r.a.total], [378250, 50, 378200]);
        assert.deepEqual([r.debt.total, r.debt.paid, r.debt.debt], [1313000, 1000000, 313000], 'To\'landi + Qarz = JAMI');
        assert.deepEqual([r.chg.given, r.chg.change, r.chg.total], [1320000, 7000, 1313000], 'Naqd − Qaytim = JAMI');
        assert.deepEqual([r.usd.sum, r.usd.total, r.usd.disc], [30.99, 30.99, 0], '$ chek');
        assert.ok(r.old, 'eski chek ochiladi (so\'mda)');
        assert.match(r.html, /Yaxlitlash:/); assert.match(r.html, /× 1 250/); assert.match(r.html, /× 0,25/);
        assert.match(r.html, /Qaytim:<\/span><span>1 800 soʻm/); assert.match(r.html, /Naqd:<\/span><span>5 330 000 soʻm/);
        assert.match(r.html, /14:20/);
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
    { name: '58/72/80 mm: uzun nom va katta summa — toshish yo\'q; chop etishda qog\'oz = chek uzunligi', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 1280, height: 900, admin: true });
      try {
        for (const mm of [58, 72, 80]) {
          const r = await page.evaluate(async (mm) => {
            const sale = { inv: 'INV-0099', date: '2026-11-08', custName: 'Juda uzun ismli mijoz Abdurahmonov Abdulla', rateUsdUzs: 12500, cur: 'UZS', payType: 'cash_uzs',
              items: [{ name: 'Bosch GBH 2-28 F professional perforator SDS-plus, 880 Vt, keys bilan toʻplam', sku: 'BOSCH-GBH-2-28-F-0611267600', qty: 1250, sellUsd: 999.99 },
                      { name: 'Kafel', qty: 3.5, sellUsd: 12 }],
              totalUsd: 1250 * 999.99 + 42, roundedTotalUzs: Math.round((1250 * 999.99 + 42) * 12500 / 100) * 100, debtUsd: 100000, dueDate: '2026-11-18' };
            const ifr = document.createElement('iframe'); ifr.style.cssText = `position:fixed;left:0;top:0;width:${Math.round(mm * 96 / 25.4)}px;height:900px;border:0`;
            document.body.appendChild(ifr);
            await new Promise(res => { ifr.onload = res; ifr.srcdoc = fwReceiptHtml(sale, { widthMm: mm, brand: 'POWERFUL' }); });
            const d = ifr.contentDocument;
            const over = [...d.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > d.body.getBoundingClientRect().right + 1).map(e => e.className + ':' + e.textContent.slice(0, 30));
            fwReceiptFitPage(d, mm);
            const page = d.getElementById('fw-page-fit').textContent, hPx = d.body.offsetHeight;
            ifr.remove();
            return { over, page, hPx, hScroll: d.documentElement.scrollWidth > d.documentElement.clientWidth };
          }, mm);
          assert.deepEqual(r.over, [], `${mm} mm: chekdan tashqariga chiqqan element yo'q`);
          const m = /@page\{size:(\d+)mm (\d+)mm;margin:0\}/.exec(r.page);
          assert.ok(m, r.page); assert.equal(+m[1], mm);
          const want = Math.ceil(r.hPx * 25.4 / 96) + 3;
          assert.ok(Math.abs(+m[2] - want) <= 1 && +m[2] < 297, `${mm} mm: qog'oz balandligi chek uzunligiga teng (${m[2]} mm)`);
        }
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
  ],
};
