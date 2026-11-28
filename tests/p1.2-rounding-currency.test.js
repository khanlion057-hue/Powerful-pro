// P1.2 — YAXLITLASH (rounding) va P1.3 — Currency snapshot uchun REGRESSIYA
// testlari. Biznes qoidalari AZIMSHER tomonidan tasdiqlangan
// (powerful-pro-architecture-plan.md, 4.1 va 8-band):
//   - Yaxlitlash: v24.5 dan (egasi qarori 2026-10-14) — eng yaqin mingga, yarmi yuqoriga:
//     qoldiq 0-499 -> pastga, 500-999 -> yuqoriga (10 500 -> 11 000), HAR BIR QATOR alohida (jami emas).
//   - Skidka: LINE-LEVEL (har qatorga bir xil % qo'llanadi, keyin alohida
//     yaxlitlanadi).
//   - Zarar bilan sotuv: BLOKLANMAYDI, faqat ogohlantirish + audit log.
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

async function testRoundUzsBoundaryCases() {
  const { browser, page } = await loadApp({});
  try {
    const results = await page.evaluate(() => {
      const cases = [10000, 10500, 10501, 10999, 141960, 106470, 0, 500, 501, 999, 1000];
      return cases.map(v => [v, CUR.roundUzs(v)]);
    });
    const expected = {
      10000: 10000, 10500: 11000, 10501: 11000, 10999: 11000,
      141960: 142000, 106470: 106000, 0: 0, 500: 1000, 501: 1000, 999: 1000, 1000: 1000,
    };
    for (const [input, actual] of results) {
      assert.equal(actual, expected[input], `roundUzs(${input}) = ${actual}, kutilgan ${expected[input]}`);
    }
  } finally {
    await browser.close();
  }
}

async function testLineLevelRoundingMatchesArchitectureExample() {
  const { browser, page } = await loadApp({});
  try {
    const result = await page.evaluate(() => {
      CUR.usdUzs = 11830;
      const cart = [
        { pid: 1, sku: 'A', lineUsd: 12 }, // 12 * 11830 = 141 960 -> 142 000
        { pid: 2, sku: 'B', lineUsd: 9 },  // 9  * 11830 = 106 470 -> 106 000
      ];
      return CUR.roundedSaleUzsTotal(cart, 0);
    });
    assert.equal(result.lines[0].roundedUzs, 142000, "1-qator (arxitektura hujjatidagi misol) 142 000ga yaxlitlanishi kerak");
    assert.equal(result.lines[1].roundedUzs, 106000, "2-qator 106 000ga yaxlitlanishi kerak");
    assert.equal(result.roundedTotalUzs, 248000, "Jami — YAXLITLANGAN qatorlar yig'indisi (248 000), jamini alohida yaxlitlash EMAS");
  } finally {
    await browser.close();
  }
}

async function testDiscountAppliedLineLevel() {
  const { browser, page } = await loadApp({});
  try {
    const result = await page.evaluate(() => {
      CUR.usdUzs = 10000;
      const cart = [
        { pid: 1, sku: 'A', lineUsd: 100 }, // 10% skidkadan keyin: 90 -> 900 000
        { pid: 2, sku: 'B', lineUsd: 50 },  // 10% skidkadan keyin: 45 -> 450 000
      ];
      return CUR.roundedSaleUzsTotal(cart, 10); // 10% skidka
    });
    assert.equal(result.lines[0].roundedUzs, 900000, "1-qatorga 10% skidka LINE-LEVEL qo'llanishi kerak (100->90->900000)");
    assert.equal(result.lines[1].roundedUzs, 450000, "2-qatorga 10% skidka LINE-LEVEL qo'llanishi kerak (50->45->450000)");
    assert.equal(result.roundedTotalUzs, 1350000);
  } finally {
    await browser.close();
  }
}

async function testRoundingCanBeDisabledViaSettings() {
  const { browser, page } = await loadApp({});
  try {
    const result = await page.evaluate(() => {
      CUR.usdUzs = 11830;
      Object.assign(S, { settings: { roundingEnabled: false } });
      posInit(POS_ADMIN);
      const off = posRound(141960);
      S.settings.roundingEnabled = true;
      return { off, on: posRound(141960) };
    });
    // v24.5: savdo oynasi (pos.js) — o'chirilsa so'mgacha (aniq), yoqilsa — mingga
    assert.equal(result.off, 141960, "roundingEnabled=false bo'lsa, aniq (yaxlitlanmagan) summa qaytishi kerak");
    assert.equal(result.on, 142000);
  } finally {
    await browser.close();
  }
}

async function testLossSaleNotBlockedButAudited() {
  const { browser, page } = await loadApp({
    mockRoutes: [
      { url: '**/.netlify/functions/sale-checkout-atomic', handler: (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ costUsd: 15, profitUsd: -5, changeUsd: 0, debtUsd: 0, totalUsd: 10 }) }) },
    ],
  });
  try {
    const result = await page.evaluate(async () => {
      Object.assign(S, {
        settings: { roundingEnabled: true },
        cart: [{ pid: 1, sku: 'A', name: 'Test', qty: 1, sellUsd: 10, costUsd: 15, lineUsd: 10 }],
        sales: [], cashboxes: [{ id: 1, name: 'Kassa', cur: 'USD', bal: 0, type: 'cash' }],
        customers: [], suppliers: [], auditLogs: [], branch: 'baza',
      });
      _cloudEnabled = true;
      // _savdoCommit muvaffaqiyatli tugagach real UI qayta-chizish (pgSavdo)
      // va chek ko'rsatish (showReceipt) funksiyalarini chaqiradi — minimal
      // test DOM'da ular kerakli elementlarga ega emas (test-harness bo'shlig'i,
      // ilova xatosi emas — xuddi P0.3 testidagi closeModal/pgKassalar kabi).
      const realPgSavdo = pgSavdo, realShowReceipt = showReceipt;
      pgSavdo = () => {}; showReceipt = () => {};
      try {
        await _savdoCommit({ items: S.cart, subtotalUsd: 10, discPct: 0, discUsd: 0, totalUsd: 10, paidUsd: 10, debtUsd: 0, costUsd: 15, profitUsd: -5,
          payType: 'usd', boxId: 1, boxPayments: [{ box_id: 1, amount_native: 10 }], mixedRows: null, custId: null, cur: 'USD', roundedTotalUzs: 125000 });
      } finally {
        pgSavdo = realPgSavdo; showReceipt = realShowReceipt;
      }
      return {
        saleCount: S.sales.length,
        profitUsd: S.sales[0]?.profitUsd,
        auditHasLoss: (S.auditLogs || []).some(a => (a.action || '').includes('Zarar bilan sotuv')),
      };
    });
    assert.equal(result.saleCount, 1, "Zarar bilan sotuv BLOKLANMASLIGI kerak — yozuv yaratilishi kerak");
    assert.equal(result.profitUsd, -5, "Zarar summasi to'g'ri saqlanishi kerak");
    assert.ok(result.auditHasLoss, "Zarar bilan sotuv staff/audit logga (auditLog) yozilishi kerak");
  } finally {
    await browser.close();
  }
}

async function testCurrencySnapshotStoredOnSale() {
  const { browser, page } = await loadApp({
    mockRoutes: [
      { url: '**/.netlify/functions/sale-checkout-atomic', handler: (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ costUsd: 5, profitUsd: 5, changeUsd: 0, debtUsd: 0, totalUsd: 10 }) }) },
    ],
  });
  try {
    const result = await page.evaluate(async () => {
      CUR.usdUzs = 12345;
      CUR.usdCny = 6.5;
      CUR.lastRateDate = '2026-09-23';
      Object.assign(S, {
        settings: { roundingEnabled: true },
        cart: [{ pid: 1, sku: 'A', name: 'Test', qty: 1, sellUsd: 10, costUsd: 5, lineUsd: 10 }],
        sales: [], cashboxes: [{ id: 1, name: 'Kassa', cur: 'USD', bal: 0, type: 'cash' }],
        customers: [], suppliers: [], auditLogs: [], branch: 'baza',
      });
      _cloudEnabled = true;
      const realPgSavdo = pgSavdo, realShowReceipt = showReceipt;
      pgSavdo = () => {}; showReceipt = () => {};
      try {
        await _savdoCommit({ items: S.cart, subtotalUsd: 10, discPct: 0, discUsd: 0, totalUsd: 10, paidUsd: 10, debtUsd: 0, costUsd: 5, profitUsd: 5,
          payType: 'usd', boxId: 1, boxPayments: [{ box_id: 1, amount_native: 10 }], mixedRows: null, custId: null, cur: 'USD', roundedTotalUzs: 123450 });
      } finally {
        pgSavdo = realPgSavdo; showReceipt = realShowReceipt;
      }
      return S.sales[0];
    });
    assert.equal(result.rateUsdUzs, 12345, "Savdo yozuvi o'sha paytdagi usdUzs kursini saqlashi kerak");
    assert.equal(result.rateUsdCny, 6.5, "Savdo yozuvi o'sha paytdagi usdCny kursini saqlashi kerak");
    assert.equal(result.rateDate, '2026-09-23');
    assert.ok(result.roundedTotalUzs > 0, "roundedTotalUzs savdo yozuvida saqlanishi kerak");
  } finally {
    await browser.close();
  }
}

module.exports = {
  name: "P1.2+P1.3 — Yaxlitlash (rounding) va Currency snapshot",
  cases: [
    { name: "CUR.roundUzs() — chegara holatlari (eng yaqin ming: 0-499 pastga, 500-999 yuqoriga)", run: testRoundUzsBoundaryCases },
    { name: "Har bir savdo qatori alohida yaxlitlanadi (arxitektura hujjati misoli)", run: testLineLevelRoundingMatchesArchitectureExample },
    { name: "Skidka LINE-LEVEL qo'llanadi (har qatorga bir xil %)", run: testDiscountAppliedLineLevel },
    { name: "Sozlamalarda roundingEnabled=false bo'lsa, yaxlitlash o'chadi", run: testRoundingCanBeDisabledViaSettings },
    { name: "Zarar bilan sotuv bloklanmaydi, lekin audit-logga yoziladi", run: testLossSaleNotBlockedButAudited },
    { name: "Har bir savdoda kurs (exchange rate) snapshot qilinadi", run: testCurrencySnapshotStoredOnSale },
  ],
};
