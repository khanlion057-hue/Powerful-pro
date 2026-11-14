// P0.2 — REGRESSION TEST: savdo/qaytarish checkout tarmoq/server xatosida
// endi FAIL-CLOSE bo'lishi kerak (avval fail-open edi — 0-bosqich auditida
// HIGH xavf sifatida topilgan, keyin js/main.js'da tuzatilgan).
//
// Bu test aynan HAQIQIY js/main.js ustida ishlaydi (nusxa emas) —
// tests/helpers/load-app.js orqali.
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

async function testSaleFailClose() {
  const { browser, page } = await loadApp({
    mockRoutes: [
      {
        // sale-checkout-atomic tarmoq xatosini simulyatsiya qilamiz
        url: '**/.netlify/functions/sale-checkout-atomic',
        handler: (route) => route.abort('failed'),
      },
    ],
  });

  try {
    const result = await page.evaluate(async () => {
      Object.assign(S, {
        cart: [{ pid: 1, sku: 'SKU1', name: 'Test mahsulot', qty: 2, sellUsd: 10, costUsd: 6, directSupply: false }],
        sales: [], customers: [], cashboxes: [{ id: 1, cur: 'USD', bal: 0 }],
        suppliers: [], batches: [{ id: 'b1', pid: 1, qty: 100, sold: 0, costUsd: 6, status: 'active', date: '2026-01-01' }],
        payType: 'cash_uzs', branch: 'baza',
      });
      _cloudEnabled = true;
      const cartBefore = S.cart.length;
      await _savdoCommit({ subtotalUsd: 20, disc: 0, discUsd: 0, totalUsd: 20, paidUsd: 20, debtUsd: 0, boxId: 1, mixedRows: null, custId: null });
      return {
        salesCount: S.sales.length,
        cartStillHasItems: S.cart.length === cartBefore,
        toasts: window.__toasts,
      };
    });

    assert.equal(result.salesCount, 0, 'FAIL-CLOSE: server ishlamasa, S.sales ga HECH QANDAY yozuv qo\'shilmasligi kerak');
    assert.equal(result.cartStillHasItems, true, 'FAIL-CLOSE: savat tozalanmasligi kerak — xodim qayta urinishi uchun saqlanishi shart');
    assert.ok(result.toasts.some(t => t.kind === 'error'), 'Xodimga aniq xato xabari (toast) ko\'rsatilishi kerak');
  } finally {
    await browser.close();
  }
}

async function testReturnFailClose() {
  const { browser, page } = await loadApp({
    mockRoutes: [
      {
        url: '**/.netlify/functions/sale-return-shadow-check',
        handler: (route) => route.abort('failed'),
      },
    ],
  });

  try {
    const result = await page.evaluate(async () => {
      const sale = {
        id: 'sale1', inv: 'INV-0001', custName: 'Anonim',
        items: [{ pid: 1, sku: 'SKU1', name: 'Test', qty: 5, sellUsd: 10, costUsd: 6, lineUsd: 50 }],
        subtotalUsd: 50, totalUsd: 50, paidUsd: 50, suppId: null,
      };
      Object.assign(S, {
        sales: [sale], batches: [], suppliers: [], expenses: [], batchCounter: 0, branch: 'baza',
      });
      _cloudEnabled = true;
      const qtyBefore = sale.items[0].qty;
      const batchesBefore = S.batches.length;
      // doSaleReturn DOM elementlaridan (#sr-pid/#sr-qty) o'qiydi — test uchun
      // vaqtincha soxta elementlar yaratamiz
      document.body.innerHTML = `
        <select id="sr-pid"><option value="1" data-qty="5" data-sell="10" data-cost="6" selected>x</option></select>
        <input id="sr-qty" value="2">
      `;
      await doSaleReturn('sale1');
      return {
        qtyUnchanged: sale.items[0].qty === qtyBefore,
        batchesUnchanged: S.batches.length === batchesBefore,
        toasts: window.__toasts,
      };
    });

    assert.equal(result.qtyUnchanged, true, 'FAIL-CLOSE: server ishlamasa, savdo qatoridagi miqdor o\'ZGARMASLIGI kerak');
    assert.equal(result.batchesUnchanged, true, 'FAIL-CLOSE: server ishlamasa, omborga YANGI batch qo\'SHILMASLIGI kerak');
    assert.ok(result.toasts.some(t => t.kind === 'error'), 'Xodimga aniq xato xabari (toast) ko\'rsatilishi kerak');
  } finally {
    await browser.close();
  }
}

module.exports = {
  name: 'P0.2 — Savdo/Qaytarish fail-close',
  cases: [
    { name: 'sale-checkout-atomic tarmoq xatosida savdo bekor qilinadi (fail-close)', run: testSaleFailClose },
    { name: 'sale-return-shadow-check tarmoq xatosida qaytarish bekor qilinadi (fail-close)', run: testReturnFailClose },
  ],
};
