// P0.3 — REGRESSION TEST: kassalararo "⇄ Ko'chirish" (move) amalida server-
// tomon balans tekshiruvi endi ISHGA TUSHISHI kerak (avval 'transfer' vs
// 'move' nomuvofiqligi tufayli hech qachon chaqirilmasdi).
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

async function testMoveCallsServer() {
  let serverWasCalled = false, opsCalls = 0;
  const { browser, page } = await loadApp({
    mockRoutes: [
      {
        // v23: 24-migratsiyagacha (eski rejim) — cashbox-ops "authority:false" qaytaradi;
        // shunda eski cashbox-transact tekshiruvi kassa o'zgarishidan OLDIN, fail-close chaqiriladi
        url: '**/.netlify/functions/cashbox-ops',
        handler: (route) => { opsCalls++; route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, authority: false }) }); },
      },
      {
        url: '**/.netlify/functions/cashbox-transact',
        handler: (route) => {
          serverWasCalled = true;
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
        },
      },
    ],
  });

  try {
    await page.evaluate(async () => {
      Object.assign(S, {
        cashboxes: [
          { id: 1, name: 'Kassa A', cur: 'USD', bal: 100 },
          { id: 2, name: 'Kassa B', cur: 'USD', bal: 0 },
        ],
        customers: [], suppliers: [], dealers: [], branch: 'baza',
      });
      _cloudEnabled = true;
      document.body.innerHTML = `
        <input id="ko-a" value="10">
        <input id="ko-d" value="test">
        <select id="ko-who"><option value=""></option></select>
        <select id="ko-t"><option value="2" selected>Kassa B</option></select>
      `;
      // Bu test faqat "move" amalida server chaqirilishini tekshiradi — to'liq
      // UI-qayta-chizishni (modal/sahifa) emas, shuning uchun shu ikkalasini
      // no-op qilib qo'yamiz (minimal test DOM'da ular kerakli elementlarga ega emas).
      const realClose = closeModal, realRender = pgKassalar;
      closeModal = () => {}; pgKassalar = () => {};
      try {
        await doKassaOp(1, 'move');
      } finally {
        closeModal = realClose; pgKassalar = realRender;
      }
    });

    assert.equal(opsCalls, 1, "kassa amali avval cashbox-ops'ga yuboriladi");
    assert.equal(serverWasCalled, true, "'⇄ Ko'chirish' (move) amalida server-tomon balans tekshiruvi ISHGA TUSHISHI kerak (P0.3 tuzatishdan oldin bu hech qachon chaqirilmasdi)");
  } finally {
    await browser.close();
  }
}

async function testMoveBlockedOnServerReject() {
  let opsCalls = 0;
  const { browser, page } = await loadApp({
    mockRoutes: [
      {
        // v23: 24-migratsiyagacha (eski rejim) — cashbox-ops "authority:false" qaytaradi;
        // shunda eski cashbox-transact tekshiruvi kassa o'zgarishidan OLDIN, fail-close chaqiriladi
        url: '**/.netlify/functions/cashbox-ops',
        handler: (route) => { opsCalls++; route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, authority: false }) }); },
      },
      {
        url: '**/.netlify/functions/cashbox-transact',
        handler: (route) => route.fulfill({
          status: 400, contentType: 'application/json',
          body: JSON.stringify({ error: "Chiqim summasi kassa qoldig'idan oshib ketdi" }),
        }),
      },
    ],
  });

  try {
    const result = await page.evaluate(async () => {
      Object.assign(S, {
        cashboxes: [
          { id: 1, name: 'Kassa A', cur: 'USD', bal: 5 },
          { id: 2, name: 'Kassa B', cur: 'USD', bal: 0 },
        ],
        customers: [], suppliers: [], dealers: [], branch: 'baza',
      });
      _cloudEnabled = true;
      document.body.innerHTML = `
        <input id="ko-a" value="4">
        <input id="ko-d" value="test">
        <select id="ko-who"><option value=""></option></select>
        <select id="ko-t"><option value="2" selected>Kassa B</option></select>
      `;
      await doKassaOp(1, 'move');
      return { balA: S.cashboxes[0].bal, balB: S.cashboxes[1].bal, toasts: window.__toasts };
    });

    assert.equal(opsCalls, 1, "so'rov serverga yetib bordi (mahalliy tekshiruvda to'xtamadi)");
    assert.equal(result.balA, 5, 'Server rad etsa, manba kassa balansi O\'ZGARMASLIGI kerak');
    assert.equal(result.balB, 0, 'Server rad etsa, maqsad kassa balansi O\'ZGARMASLIGI kerak');
    assert.ok(result.toasts.some(t => t.kind === 'error'), 'Server rad etganda xato xabari ko\'rsatilishi kerak');
  } finally {
    await browser.close();
  }
}

// v23: 24-migratsiyadan keyin (authority:true) — eski cashbox-transact UMUMAN chaqirilmaydi
// (u 410 qaytaradi); qoldiq server javobidan olinadi.
async function testMoveAuthorityNoLegacy() {
  let legacyCalled = false, opsBody = null;
  const { browser, page } = await loadApp({
    mockRoutes: [
      { url: '**/.netlify/functions/cashbox-transact', handler: (route) => { legacyCalled = true; route.fulfill({ status: 410, contentType: 'application/json', body: '{"error":"eskirgan"}' }); } },
      { url: '**/.netlify/functions/cashbox-ops', handler: (route) => { opsBody = JSON.parse(route.request().postData() || '{}');
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, authority: true, balances: { 1: 90, 2: 10 } }) }); } },
    ],
  });
  try {
    const result = await page.evaluate(async () => {
      Object.assign(S, { cashboxes: [ { id: 1, name: 'Kassa A', cur: 'USD', bal: 100 }, { id: 2, name: 'Kassa B', cur: 'USD', bal: 0 } ], customers: [], suppliers: [], dealers: [], branch: 'baza' });
      _cloudEnabled = true;
      document.body.innerHTML = `<input id="ko-a" value="10"><input id="ko-d" value="t"><select id="ko-who"><option value=""></option></select><select id="ko-t"><option value="2" selected>Kassa B</option></select>`;
      const rc = closeModal, rr = pgKassalar; closeModal = () => {}; pgKassalar = () => {};
      try { await doKassaOp(1, 'move'); } finally { closeModal = rc; pgKassalar = rr; }
      return { a: S.cashboxes[0].bal, b: S.cashboxes[1].bal };
    });
    assert.equal(legacyCalled, false, 'authority rejimida eski endpoint chaqirilmaydi');
    assert.equal(opsBody && opsBody.kind, 'move');
    assert.deepEqual(result, { a: 90, b: 10 }, 'qoldiq server javobidan');
  } finally {
    await browser.close();
  }
}

module.exports = {
  name: 'P0.3 — Kassa "move" server-validatsiyasi',
  cases: [
    { name: "'move' amali cashbox-transact serverini chaqiradi", run: testMoveCallsServer },
    { name: 'server rad etsa, move amali balansni o\'zgartirmaydi', run: testMoveBlockedOnServerReject },
    { name: "v23: 24-migratsiyadan keyin eski cashbox-transact chaqirilmaydi, qoldiq serverdan", run: testMoveAuthorityNoLegacy },
  ],
};
