// P12 — v10 to'liq audit: MIJOZ (brauzer) tomonidagi tuzatishlar — regressiya testlari.
// HAQIQIY js/shared.js + js/main.js (+ firma-kassa.js, sotuvchi.js) haqiqiy Chromium'da;
// server javoblari Playwright route orqali beriladi (server mantig'i P10/P11'da alohida).
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const { chromium } = require('playwright');
const { loadApp, ROOT } = require('./helpers/load-app');
const { supabaseStub, openPage } = require('./p4-responsive.test.js')._helpers;

const json = (route, status, obj) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });

async function withApp(opts, fn) {
  const { browser, page, consoleErrors } = await loadApp(opts);
  try {
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div><div id="bs-ov" hidden></div>');
      save = () => {}; pgSavdo = () => {}; showReceipt = () => {}; pgKirim = () => {}; pgKassalar = () => {};
      CUR.usdUzs = 12800; CUR.usdCny = 7; CUR.BANK_FEE = 0.006;
    });
    await fn(page);
    assert.deepEqual(consoleErrors, [], 'sahifada JS xatosi yo\'q');
  } finally { await browser.close(); }
}

async function testDoubleClickChangeAndDiscount() {
  let calls = 0; const bodies = [];
  await withApp({ mockRoutes: [{ url: '**/.netlify/functions/sale-checkout-atomic', handler: async (route) => {
    calls++; const b = JSON.parse(route.request().postData()); bodies.push(b);
    await new Promise(r => setTimeout(r, 150));
    const total = 80 * (1 - (b.discPct || 0) / 100);
    json(route, 200, { ok: true, totalUsd: total, costUsd: 50, profitUsd: total - 50, changeUsd: Math.max(0, b.paidUsd - total), debtUsd: Math.max(0, total - b.paidUsd) });
  } }] }, async (page) => {
    const r = await page.evaluate(async () => {
      _cloudEnabled = true;
      const reset = () => Object.assign(S, { branch: 'baza', payType: 'usd', customers: [], sales: [], suppliers: [], cashTxns: [],
        cart: [{ pid: 101, sku: 'A', name: 'Drel', qty: 1, sellUsd: 80, costUsd: 50, lineUsd: 80 }],
        cashboxes: [{ id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 0 }],
        batches: [{ id: 1, pid: 101, qty: 5, sold: 0, costUsd: 50, status: 'active', date: '2026-09-01' }] });
      document.body.insertAdjacentHTML('beforeend', '<input id="s-paid" value="100"><input id="s-disc" value="0"><button id="s-finish-btn"></button>');
      reset();
      // v24.5: savdo oynasi (pos.js) kassaga faqat chek summasini yuboradi; ortiqcha — alohida (mijoz haqi), qaytim yo'q
      const ctx = { items: S.cart, subtotalUsd: 80, discPct: 0, discUsd: 0, totalUsd: 80, paidUsd: 80, debtUsd: 0, costUsd: 50, profitUsd: 30, payType: 'usd',
        boxId: 3, boxPayments: [{ box_id: 3, amount_native: 80 }], mixedRows: null, custId: null, cur: 'USD' };
      await Promise.all([_savdoCommit(ctx), _savdoCommit(ctx), _savdoCommit(ctx)]);   // 3 marta tez bosish
      const one = { sales: S.sales.length, bal: S.cashboxes[0].bal };
      // "Skidka sifatida": 70$ to'landi, 10$ skidka
      reset(); document.getElementById('s-paid').value = '70';
      await _savdoCommit({ items: S.cart, subtotalUsd: 80, discPct: 12.5, discUsd: 10, totalUsd: 70, paidUsd: 70, debtUsd: 0, costUsd: 50, profitUsd: 20, payType: 'usd',
        boxId: 3, boxPayments: [{ box_id: 3, amount_native: 70 }], mixedRows: null, custId: null, cur: 'USD' });
      return { one, two: { debt: S.sales[0]?.debtUsd, bal: S.cashboxes[0].bal } };
    });
    assert.equal(calls, 2, 'uch marta bosish — bitta server so\'rovi (+ keyingi alohida savdo) (B2)');
    assert.equal(r.one.sales, 1, 'bitta savdo yozildi');
    assert.equal(r.one.bal, 80, "kassaga — chek summasi (80$) (B4)");
    assert.equal(bodies[0].boxPayments[0].amount_native, 80, 'serverga ham 80$ ketdi');
    assert.ok(Math.abs(bodies[1].discPct - 12.5) < 1e-9, "skidka sifatida — serverga samarali 12.5% ketdi (B5)");
    assert.equal(r.two.debt, 0, "mijozga qarz yozilmadi");
    assert.equal(r.two.bal, 70);
  });
}

async function testKirimFeeAndCashboxOps() {
  await withApp({}, async (page) => {
    const r = await page.evaluate(() => {
      _cloudEnabled = false;
      Object.assign(S, { branch: 'baza', importCur: 'CNY', kirimStatus: 'active', kirimSuppId: null, batchCounter: 0, suppliers: [], batches: [], cashTxns: [],
        cashboxes: [{ id: 1, name: "Naqd So'm", cur: 'UZS', type: 'cash', bal: 200000 }, { id: 2, name: 'Karta', cur: 'UZS', type: 'card', bal: 50000 }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 1000 }] });
      // Kirim: tovar 100$, overhead 2$ (ichida bank 0.6$ ham bor)
      document.body.insertAdjacentHTML('beforeend', `<div id="k-calc-data" data-rows='[{"pid":101,"qty":10,"costUsd":10.2,"prodUsd":100,"overUsd":2}]' data-bank="0.6" data-grand="102" data-goods="100"></div>
        <select id="k-source-box"><option value="3" selected>Dollar</option></select><input id="k-given" value=""><input id="k-suppq" value="">`);
      kirimSave();
      const kirimBal = S.cashboxes[2].bal;
      // Kassa ko'chirish: 128 000 so'm → Dollar kassaga = 10$ (B6)
      document.body.insertAdjacentHTML('beforeend', '<input id="ko-a" value="128000"><input id="ko-d" value=""><input id="ko-who" value=""><select id="ko-t"><option value="3" selected>$</option></select>');
      return doKassaOp(1, 'move').then(() => {
        const mv = { cash: S.cashboxes[0].bal, usd: S.cashboxes[2].bal };
        document.getElementById('ko-a').value = '999999';
        return doKassaOp(1, 'out').then(() => {
          const over = S.cashboxes[0].bal;
          // Ayirboshlash: 1-kassada yetarli, 2-kassada yetmaydi → HECH NARSA o'zgarmasligi kerak (B15)
          document.body.insertAdjacentHTML('beforeend', '<input id="ex-rate" value="12800"><input id="ex-uzs-1" value="12800"><input id="ex-uzs-2" value="999999">');
          doExchange();
          const ex = S.cashboxes.map(k => k.bal);
          document.getElementById('ex-rate').value = '0'; document.getElementById('ex-uzs-2').value = '';
          doExchange();
          return { kirimBal, mv, over, ex, ex0: S.cashboxes.map(k => k.bal), toasts: window.__toasts.map(t => t.msg) };
        });
      });
    });
    assert.equal(Math.round(r.kirimBal * 100) / 100, 898, "Kirim: 1000 − 100 (tovar) − 2 (overhead, bank ichida) = 898 — bank haqi ikki marta yechilmadi (B3)");
    assert.deepEqual(r.mv, { cash: 72000, usd: 908 }, "so'm → dollar ko'chirishda kurs bo'yicha 10$ (B6)");
    assert.equal(r.over, 72000, "qoldiqdan ortiq chiqim bloklandi");
    assert.deepEqual(r.ex, [72000, 50000, 908], "ayirboshlash yarim bajarilmadi (B15)");
    assert.deepEqual(r.ex0, [72000, 50000, 908], "0 kurs rad etildi");
  });
}

async function testReturnRefundsOnce() {
  await withApp({}, async (page) => {
    const r = await page.evaluate(async () => {
      _cloudEnabled = false;
      const debtUzs = 50 * CUR.usdUzs;
      Object.assign(S, { branch: 'baza', batchCounter: 0, batches: [], expenses: [], cashTxns: [],
        cashboxes: [{ id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 500 }],
        customers: [{ id: 9, name: 'Ali', debt: debtUzs }],
        sales: [{ id: 77, inv: 'INV-1', custId: 9, custName: 'Ali', boxId: 3, subtotalUsd: 100, disc: 10, discUsd: 10, totalUsd: 90, paidUsd: 40, debtUsd: 50,
          items: [{ pid: 101, qty: 2, sellUsd: 50, costUsd: 30, lineUsd: 100 }] }] });
      document.body.insertAdjacentHTML('beforeend', '<select id="sr-pid"><option value="101" data-qty="2" data-sell="50" data-cost="30" selected>A</option></select><input id="sr-qty" value="1">');
      await doSaleReturn(77);
      const s = S.sales[0];
      return { bal: S.cashboxes[0].bal, custDebtUsd: S.customers[0].debt / CUR.usdUzs, total: s.totalUsd, paid: s.paidUsd, debt: s.debtUsd, loss: S.expenses[0]?.amtUsd };
    });
    assert.equal(r.bal, 500, "qaytarilgan 45$ (skidkali narx) to'liq QARZdan ayirildi — kassadan pul chiqmadi (B8)");
    assert.equal(Math.round(r.custDebtUsd * 100) / 100, 5, "mijoz qarzi 50 → 5");
    assert.deepEqual([r.total, r.paid, r.debt], [45, 40, 5]);
    assert.equal(r.loss, 15, 'qaytarish zarari skidkali narxdan: 45 − 30');
  });
}

async function testBootWithExtraBranchAndXss() {
  await withApp({ mockRoutes: [{ url: '**/.netlify/functions/app-data-load', handler: (route) => json(route, 200, { data: {
    settings: { extraBranches: [{ key: 'f702', name: 'Chilonzor' }, { key: 'f703', name: 'Yunusobod' }], usdUzs: 12800 },
    branchStore: { f702: { cashboxes: [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 5 }], sales: [] } } } }) }] }, async (page) => {
    const r = await page.evaluate(async () => {
      _cloudEnabled = true; _db = window.supabase.createClient();
      localStorage.setItem('bp_active_branch', 'f702');
      // Qurilma keshida faqat eski ro'yxat (f703); server esa xodimning O'Z filiali (f702) ma'lumotini beradi
      rebuildBranches([{ key: 'f703', name: 'Yunusobod' }]);
      let err = null;
      try { await initData(); } catch (e) { err = String(e); }
      const out = { err, branch: S.branch, bal: (S.cashboxes || [])[0]?.bal };
      // XSS: xarajat egasi nomida HTML
      Object.assign(S, { expenses: [{ id: 1, date: td(), cat: 'Boshqa', amtUsd: 1, person: '<img src=x id=xss1 onerror="window.__x=1">', turi: 'dokon', boxId: null }], xarajatTab: 'dokon' });
      document.body.insertAdjacentHTML('beforeend', '<div id="pg-xarajatlar"></div><div id="cust-dd"></div>');
      try { pgXarajatlar(); } catch (e) { out.renderErr = String(e); }
      out.xss = !!document.getElementById('xss1');
      out.text = document.getElementById('pg-xarajatlar').textContent.includes('<img');
      return out;
    });
    assert.equal(r.err, null, "boshqa filial kalitlari yo'q bo'lsa ham ilova ochiladi (J1)");
    assert.equal(r.branch, 'f702', "qo'shilgan filial xodimi o'z filialida qoladi (J2)");
    assert.equal(r.bal, 5);
    assert.equal(r.renderErr, undefined);
    assert.equal(r.xss, false, "xarajat egasi nomidagi HTML bajarilmaydi (J5)");
    assert.equal(r.text, true, 'matn sifatida ko\'rsatiladi');
  });
}

async function testFirmaKassaUiAndKirim() {
  let mode = 'ok'; const bodies = [];
  await withApp({ mockRoutes: [{ url: '**/.netlify/functions/firma-kassa', handler: (route) => {
    const b = JSON.parse(route.request().postData()); bodies.push(b);
    if (b.action === 'state') return json(route, 200, { balances: { USD: 500, UZS: 0 }, advances: [{ currency: 'USD', counterparty_type: 'staff', counterparty_id: '5', counterparty_name: '<b>Ali</b>', outstanding: 40 }], ledger: [] });
    if (mode === 'fail') return json(route, 400, { error: "FIRMA_KASSA: mablag' yetarli emas" });
    return json(route, 200, { ok: true, entry: { op: b.action === 'move' ? b.op : b.action } });
  } }] }, async (page) => {
    await page.addScriptTag({ path: path.join(ROOT, 'js', 'firma-kassa.js') });
    const r = await page.evaluate(async () => {
      _cloudEnabled = true;
      Object.assign(S, { branch: 'baza', cashTxns: [], suppliers: [], batches: [], batchCounter: 0, importCur: 'USD', kirimStatus: 'active', kirimSuppId: null,
        cashboxes: [{ id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 100 }] });
      document.body.insertAdjacentHTML('beforeend', '<div id="pg-firmakassa"></div>');
      pgFirmaKassa();
      await new Promise(r => setTimeout(r, 300));
      const html = document.getElementById('pg-firmakassa').innerHTML;
      const out = { shows500: html.includes('500'), advXss: !!document.querySelector('#pg-firmakassa b b, #pg-firmakassa td > b'), repayBtn: !!document.querySelector('[onclick="fkRepay(0)"]') };
      // Filialdan qabul — server rad etsa kassa o'zgarmaydi
      window.__fkMode = 'fail';
      fkOpen('branch_in'); document.getElementById('fk-amt').value = '30';
      return out;
    });
    mode = 'fail';
    const r2 = await page.evaluate(async () => { await fkSubmit(); return S.cashboxes[0].bal; });
    assert.equal(r2, 100, 'server rad etdi — filial kassasi o\'zgarmadi');
    mode = 'ok';
    const r3 = await page.evaluate(async () => { await fkSubmit(); return { bal: S.cashboxes[0].bal, txn: S.cashTxns[0]?.desc || '' }; });
    assert.equal(r3.bal, 70, 'server tasdiqladi — 30$ filial kassasidan Firma kassaga');
    assert.match(r3.txn, /Bosh kassaga/);
    const sameKeys = bodies.filter(b => b.action === 'branch_in').map(b => b.idemKey);
    assert.equal(new Set(sameKeys).size, 1, 'qayta urinishda bir xil idem kalit (takror yozilmaydi)');
    // Kirim — Firma kassasidan: rad etilsa Kirim saqlanmaydi
    mode = 'fail';
    const k1 = await page.evaluate(async () => {
      document.body.insertAdjacentHTML('beforeend', `<div id="k-calc-data" data-rows='[{"pid":101,"qty":10,"costUsd":10.2,"prodUsd":100,"overUsd":2}]' data-bank="0" data-grand="102" data-goods="100"></div>
        <select id="k-source-box"><option value="firma" selected>Firma</option></select><input id="k-given" value=""><input id="k-suppq" value="">`);
      await kirimSave();
      return { batches: S.batches.length, bal: S.cashboxes[0].bal };
    });
    assert.deepEqual(k1, { batches: 0, bal: 70 }, "Firma kassasida mablag' yetmasa — Kirim umuman yozilmaydi (fail-closed)");
    mode = 'ok';
    const k2 = await page.evaluate(async () => { await kirimSave(); return { batches: S.batches.length, bal: S.cashboxes[0].bal }; });
    assert.deepEqual(k2, { batches: 1, bal: 70 }, "to'lov Firma kassasidan — filial kassasiga tegilmadi");
    const pay = bodies.filter(b => b.action === 'kirim_pay');
    assert.equal(pay.at(-1).amount, 102, "tovar 100 + overhead 2 = 102$ Firma kassasidan");
    assert.equal(pay.at(-1).currency, 'USD');
    assert.equal(r.shows500, true); assert.equal(r.repayBtn, true);
    assert.equal(r.advXss, false, "avans egasi nomidagi HTML bajarilmaydi");
  });
}

async function testExcelImportFeeAndXssSpots() {
  await withApp({}, async (page) => {
    const r = await page.evaluate(async () => {
      _cloudEnabled = false;
      CUR.usdCny = 7; CUR.BANK_FEE = 0.006;
      Object.assign(S, { branch: 'baza', batchCounter: 0, batches: [], products: [], sales: [], settings: {},
        suppliers: [{ id: 5, name: "Ta'minotchi", debt: 0 }] });
      // ExcelJS o'rniga minimal o'qituvchi (fayl formati emas, KIRIM HISOBI tekshiriladi)
      const sheet = [[null, 'SKU', 'Nomi'], [null, 'A-1', 'Drel', 'Asbob', 'Bosch', 10, 70, 0, 0]];
      window.ExcelJS = { Workbook: function () { this.xlsx = { load: async () => {} }; this.worksheets = [{
        getRow: (i) => ({ values: sheet[i - 1] || [] }), getImages: () => [],
        eachRow: (cb) => sheet.forEach((v, i) => cb({ values: v }, i + 1)) }]; this.getImage = () => null; } };
      uploadImageToStorage = async () => null;
      document.body.insertAdjacentHTML('beforeend', `<input type="file" id="ei-file"><select id="ei-cur"><option value="CNY" selected>CNY</option></select>
        <select id="ei-supp"><option value="5" selected>T</option></select><input id="ei-freight" value="70"><input id="ei-customs" value="0">
        <select id="ei-customs-method"><option value="per_unit" selected>d</option></select><button id="ei-submit-btn"></button>`);
      const dt = new DataTransfer(); dt.items.add(new File(['x'], 'kirim.xlsx')); document.getElementById('ei-file').files = dt.files;
      await importBatchXlsx();
      const out = { cost: S.batches[0]?.costUsd, debt: S.suppliers[0].debt };
      // XSS: mijoz qidiruvi (J9) va mahsulot kartasi harakatlari (J4)
      document.body.insertAdjacentHTML('beforeend', '<div id="s-cust-dd"></div><div id="pc2-dd"></div><div id="pc2-result"></div><input id="pc2-q"><button id="pc2-print-btn"></button>');
      // v24.5: mijoz qidiruvi — savdo oynasi (pos.js); mijoz nomi va qidiruv matnidagi HTML bajarilmaydi
      S.customers = [{ id: 9, name: '"><img id=xss2 src=x>', phone: '' }]; posInit(POS_ADMIN); POS.cq = '"><img id=xss2';
      document.getElementById('s-cust-dd').innerHTML = posCustListHtml();
      out.xss2 = !!document.getElementById('xss2');
      out.qText = document.getElementById('s-cust-dd').textContent.includes('<img id=xss2');
      const pid = S.products[0].id;
      S.sales = [{ id: 1, date: td(), inv: 'INV-1', custName: '<img id=xss3 src=x>', items: [{ pid, qty: 1, sellUsd: 20, costUsd: 11, lineUsd: 20 }] }];
      S.dealerTxns = []; S.dealers = []; S.dealerStock = [];
      try { pc2Show(pid); } catch (e) { out.pcErr = String(e); }
      out.xss3 = !!document.getElementById('xss3');
      return out;
    });
    assert.equal(r.cost, 11.066, "Excel: (10$ tovar + 1$ yo'lkira) × 0.6% (sozlamadagi) = 11.066 (B13)");
    assert.equal(Math.round(r.debt * 100) / 100, 100, "ta'minotchi qarziga faqat tovar qiymati (100$) — qo'lda Kirim bilan bir xil");
    assert.equal(r.xss2, false, 'mijoz qidiruvidagi HTML bajarilmaydi (J9)'); assert.equal(r.qText, true);
    assert.equal(r.pcErr, undefined); assert.equal(r.xss3, false, "mahsulot kartasida mijoz nomidagi HTML bajarilmaydi (J4)");
  });
}

async function testUiOverlaysDoNotBlockClicks() {
  const o = await openPage('index.html', { width: 360, height: 800, mobile: true, admin: true });
  try {
    const r = await o.page.evaluate(async () => {
      const wait = (ms) => new Promise(res => setTimeout(res, ms));
      go('sozlamalar'); stThemeSheet(); await wait(300); closeSheet(); await wait(400);
      const row = document.querySelector('#pg-sozlamalar .st-row'); const rc = row.getBoundingClientRect();
      const top = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
      const out = { blocked: !!(top && top.closest('#bs-ov')), ovDisplay: getComputedStyle(document.getElementById('bs-ov')).display };
      out.toastPe = getComputedStyle(document.getElementById('toasts')).pointerEvents;
      openAddProduct(); await wait(200);
      const g = document.querySelector('.pg-grid');
      out.cols = g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : null;
      closeModal();
      return out;
    });
    assert.equal(r.blocked, false, "yopilgan pastki oyna sahifani TO'SMAYDI (U1)"); assert.equal(r.ovDisplay, 'none');
    assert.equal(r.toastPe, 'none', "bildirishnomalar konteyneri ostidagi tugmalarni to'smaydi (U2)");
    assert.equal(r.cols, 2, "360px'da galereya 2 ustun — ★ va × bir-birini yopmaydi (U3)");
    assert.deepEqual(o.errors, []);
  } finally { await o.browser.close(); }
}

function testBranchMergeUnit() {
  const ctx = {}; vm.createContext(ctx);
  const src = fs.readFileSync(path.join(ROOT, 'js', 'shared.js'), 'utf8');
  vm.runInContext(src.slice(src.indexOf('const FW_MERGE_LISTS')) + '\nthis.fwMergeBranchSnap=fwMergeBranchSnap;this.fwBranchNums=fwBranchNums;', ctx);
  // Sotuvchi kirgan payt: kassa 100, partiya sold 2, mijoz qarzi 0
  const base0 = { cashboxes: [{ id: 1, bal: 100 }], batches: [{ id: 'b', qty: 10, sold: 2 }], customers: [{ id: 'c', debt: 0 }], sales: [{ id: 's1' }] };
  const baseNums = ctx.fwBranchNums(base0);
  // Shu orada admin: yangi savdo s2, kassa +50, sold +3
  const remote = { cashboxes: [{ id: 1, bal: 150 }], batches: [{ id: 'b', qty: 10, sold: 5 }], customers: [{ id: 'c', debt: 0 }], sales: [{ id: 's1' }, { id: 's2' }], batchCounter: 4 };
  // Sotuvchi: o'z savdosi s3, kassa +20, sold +1, mijozga 30 qarz, yangi mijoz d
  const local = { cashboxes: [{ id: 1, bal: 120 }], batches: [{ id: 'b', qty: 10, sold: 3 }], customers: [{ id: 'c', debt: 30 }, { id: 'd', debt: 7 }], sales: [{ id: 's1' }, { id: 's3' }], batchCounter: 2 };
  const m = JSON.parse(JSON.stringify(ctx.fwMergeBranchSnap(remote, local, baseNums, { sales: [{ id: 's1' }] })));  // vm muhitidan oddiy obyektga
  assert.deepEqual(m.sales.map(x => x.id).sort(), ['s2', 's3'], "admin savdosi yo'qolmadi, o'chirilgan (s1) tirilmadi (B1)");
  assert.equal(m.cashboxes[0].bal, 170, 'kassa: 150 (server) + 20 (sotuvchi)');
  assert.equal(m.batches[0].sold, 6, 'sold: 5 + 1');
  assert.deepEqual(m.customers.map(c => [c.id, c.debt]), [['c', 30], ['d', 7]]);
  assert.equal(m.batchCounter, 4);
}

async function testSellerOtherBranchSavesOwnData() {
  const ROOTDIR = ROOT; let saved = null;
  const srv = http.createServer((q, s) => { const f = path.join(ROOTDIR, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'application/javascript' : 'text/html' }); s.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--no-sandbox'] });
  let server = { settings: { usdUzs: 12800, branchNames: { f702: 'Chilonzor' } }, products: [{ id: 101, sku: 'A', name: 'Drel' }],
    branchStore: { f702: { sales: [{ id: 's1' }], cashboxes: [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 1000 }], batches: [], customers: [] } } };
  try {
    const ctx = await browser.newContext();
    await ctx.addInitScript({ content: supabaseStub({ loggedIn: true }) });
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.includes('/functions/app-data-load')) return json(route, 200, { data: JSON.parse(JSON.stringify(server)) });
      if (u.includes('/functions/staff-whoami')) return json(route, 200, { staff: { id: 9, name: 'Sotuvchi', filial: 'f702', active: true, role: 'sotuvchi' } });
      if (u.includes('/functions/app-data-save')) { saved = JSON.parse(route.request().postData()).data; return json(route, 200, { ok: true }); }
      if (u.includes('/functions/')) return json(route, 200, {});
      if (u.startsWith(`http://127.0.0.1:${port}/`)) return route.continue();
      if (u.includes('cdn.jsdelivr.net')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      return route.abort('failed');
    });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/sotuvchi.html`); await page.waitForTimeout(1500);
    const st = await page.evaluate(() => ({ branch: SV_BRANCH, role: document.getElementById('sv-role')?.textContent || '', bal: S.cashboxes[0]?.bal }));
    assert.equal(st.branch, 'f702', "qo'shilgan filial sotuvchisi O'Z filialida (avval 'baza'ga tushardi — J13)");
    assert.match(st.role, /Chilonzor/);
    assert.equal(st.bal, 1000);
    // Shu orada admin serverda yangi savdo qildi va kassaga +500
    server = JSON.parse(JSON.stringify(server));
    server.branchStore.f702.sales.push({ id: 's-admin' }); server.branchStore.f702.cashboxes[0].bal = 1500;
    await page.evaluate(async () => { S.sales.push({ id: 's-sotuvchi' }); S.cashboxes[0].bal += 200; await svSaveShopData(); });
    const b = saved.branchStore.f702;
    assert.deepEqual(b.sales.map(x => x.id).sort(), ['s-admin', 's-sotuvchi', 's1'], "admin savdosi o'chib ketmadi (B1)");
    assert.equal(b.cashboxes[0].bal, 1700, 'kassa: 1500 (server) + 200 (sotuvchi)');
    assert.equal(saved.branchStore.baza, undefined, "boshqa filialga hech narsa yozilmadi");
    assert.deepEqual(errs, []);
  } finally { await browser.close(); srv.close(); }
}

module.exports = {
  name: 'P12 — v10 audit: mijoz tomoni (haqiqiy brauzer) — savdo, kirim, kassa, qaytarish, XSS, filial, Firma Kassa',
  cases: [
    { name: "B2/B4/B5: 3 marta bosish — 1 savdo; qaytim kassaga yozilmaydi; 'skidka' — qarz emas", run: testDoubleClickChangeAndDiscount },
    { name: "B3/B6/B15: Kirim bank haqi 1 marta; ko'chirishda kurs; ortiqcha chiqim/yarim ayirboshlash yo'q", run: testKirimFeeAndCashboxOps },
    { name: "B8: qaytarish — skidkali narx, avval qarzdan, ikki barobar qaytarilmaydi", run: testReturnRefundsOnce },
    { name: "J1/J2/J5: qo'shilgan filial xodimi ilovasi ochiladi, o'z filialida; XSS bajarilmaydi", run: testBootWithExtraBranchAndXss },
    { name: "Firma Kassa UI: server tasdiqlagandagina filial kassasi o'zgaradi; Kirim to'lovi fail-closed", run: testFirmaKassaUiAndKirim },
    { name: "B13/J4/J9: Excel import bank haqi va qarz; mijoz qidiruvi va mahsulot kartasida XSS yo'q", run: testExcelImportFeeAndXssSpots },
    { name: "U1/U2/U3: yopilgan oyna va bildirishnoma bosishni to'smaydi; tor ekranda galereya", run: testUiOverlaysDoNotBlockClicks },
    { name: "B1 (unit): filial ma'lumotini delta bilan birlashtirish", run: testBranchMergeUnit },
    { name: "J13/B1: f702 sotuvchisi o'z filialida; saqlash admin o'zgarishlarini o'chirmaydi", run: testSellerOtherBranchSavesOwnData },
  ],
};
