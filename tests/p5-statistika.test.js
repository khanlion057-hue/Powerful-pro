// P5 — Statistika (Hisobotlar) sahifasi (2026-10-01, OmborX uslubida).
// Foydalanuvchi talabi: 7 ta eksport/chop tugmasini (Savdo/Qoldiq/Kirim/Kam qolgan/
// Diller Excel, Qoldiq chop, Kartichka tovar) olib tashlash va sahifani statistik
// panelga aylantirish. Bu testlar quyidagilarni qo'riqlaydi:
//  • sxData() hisob-kitobi mavjud biznes qoidalariga mos (daromad/foyda savdo
//    yozuvidan; xarajat faqat do'kon; qaytarish = tannarx partiyasi + "Qaytarish zarari";
//    naqd kassa = faqat naqd kassalar, o'tkazma xarajat emas);
//  • davr filtrlari (bugun/kecha/oy/ixtiyoriy) to'g'ri;
//  • sahifada eksport tugmalari yo'q, render xatosiz, UI holati bulutga saqlanmaydi;
//  • `--border` CSS o'zgaruvchisi bo'sh emas (design-system.css'dagi sikl regressiyasi).
// HAQIQIY js/shared.js + js/main.js yuklanadi (tests/helpers/load-app.js).
const assert = require('node:assert/strict');
const path = require('path');
const { loadApp, ROOT } = require('./helpers/load-app');

const DAY = 864e5;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const NOW = Date.now();
const T = iso(NOW), Y = iso(NOW - DAY), OLD = iso(NOW - 40 * DAY);
const MONTH_START = T.slice(0, 7) + '-01';
const uidAt = (isoTs, n) => Date.parse(isoTs) * 1000 + n;   // uid() formati: ms*1000 + hisoblagich

function scenario() {
  const ts1 = T + 'T06:00:00Z';
  return {
    usdUzs: 10000,
    ts1,
    S: {
      products: [
        { id: 1, sku: 'A-1', name: 'Drel', cat: 'Drel', minStock: 5 },
        { id: 2, sku: 'A-2', name: 'Arra', cat: 'Arra', minStock: 5 },
        { id: 3, sku: 'A-3', name: 'Bolgarka', cat: 'Bolgarka', minStock: 5 },
      ],
      batches: [
        { id: 11, bno: 'K-1', pid: 1, qty: 10, sold: 2, costUsd: 10, date: OLD, status: 'active' },
        { id: 12, bno: 'K-2', pid: 2, qty: 4, sold: 0, costUsd: 5, date: T, status: 'active' },
        { id: 13, bno: 'K-0', pid: 3, qty: 3, sold: 3, costUsd: 7, date: OLD, status: 'active' },
        // Qaytarish partiyasi (tizim yozuvi): tannarxda omborga qaytgan, Kirim'ga kirmaydi
        { id: uidAt(T + 'T07:00:00Z', 9), bno: 'Q-1', pid: 1, qty: 1, sold: 0, costUsd: 10, date: T, status: 'active', origin: 'Qaytarish — INV-2 (Anonim)' },
      ],
      sales: [
        { id: uidAt(ts1, 1), date: T, inv: 'INV-1', totalUsd: 100, profitUsd: 30, discUsd: 5, debtUsd: 0, paidUsd: 100, payType: 'cash_uzs', staffName: 'Malika',
          items: [{ pid: 1, name: 'Drel', qty: 2, lineUsd: 100 }] },
        // Eski formatdagi ID (vaqt kodlanmagan) — soatlik grafikka tushmaydi, alohida sanaladi
        { id: 777, date: T, inv: 'INV-2', totalUsd: 50, profitUsd: 10, discUsd: 0, debtUsd: 50, paidUsd: 0, payType: 'debt',
          items: [{ pid: 2, name: 'Arra', qty: 1, lineUsd: 50 }] },
        { id: uidAt(Y + 'T08:00:00Z', 2), date: Y, inv: 'INV-3', totalUsd: 70, profitUsd: 20, discUsd: 0, debtUsd: 0, paidUsd: 70, payType: 'card',
          items: [{ pid: 1, name: 'Drel', qty: 1, lineUsd: 70 }] },
        { id: uidAt(OLD + 'T08:00:00Z', 3), date: OLD, inv: 'INV-0', totalUsd: 999, profitUsd: 400, discUsd: 0, debtUsd: 0, paidUsd: 999, payType: 'usd',
          items: [{ pid: 3, name: 'Bolgarka', qty: 1, lineUsd: 999 }] },
      ],
      expenses: [
        { id: 1, date: T, turi: 'dokon', cat: 'Transport', amtUsd: 15 },
        { id: 2, date: T, turi: 'shaxsiy', cat: 'Uy', amtUsd: 100 },        // do'kon emas — hisobga kirmaydi
        { id: 3, date: T, cat: 'Qaytarish zarari', amtUsd: 4 },             // turi yo'q = do'kon
      ],
      customers: [{ id: 201, name: 'Mega Stroy', debt: 500000 }, { id: 202, name: 'Toza', debt: 0 }],
      suppliers: [{ id: 301, name: 'GZ Tools', debt: 120 }],
      cashboxes: [{ id: 1, type: 'cash', name: 'Naqd' }, { id: 2, type: 'card', name: 'Karta' }, { id: 3, type: 'usd', name: 'Dollar' }],
      cashTxns: [
        { id: 1, date: T, boxId: 1, cur: 'UZS', type: 'in', amount: 1000000, desc: 'Savdo INV-1' },
        { id: 2, date: T, boxId: 2, cur: 'UZS', type: 'in', amount: 500000, desc: 'Savdo INV-9' },            // karta — naqd emas
        { id: 3, date: T, boxId: 1, cur: 'UZS', type: 'in', amount: 200000, desc: "Qarz to'lovi — Mega Stroy", custId: 201 },
        { id: 4, date: T, boxId: 1, cur: 'UZS', type: 'out', amount: 140000, desc: 'Qaytarish: INV-2 — 1 dona' },
        { id: 5, date: T, boxId: 3, cur: 'USD', type: 'out', amount: 30, desc: "Ta'minotchiga to'lov — GZ Tools", suppId: 301 },
        { id: 6, date: T, boxId: 1, cur: 'UZS', type: 'out', amount: 50000, desc: "Xarajat (Do'kon): Transport" },
        { id: 7, date: T, boxId: 1, cur: 'UZS', type: 'out', amount: 300000, desc: 'Naqd → Dollar' },          // o'tkazma — xarajat emas
        { id: 8, date: T, boxId: 3, cur: 'USD', type: 'in', amount: 30, desc: 'Dollar ← Naqd' },
        { id: 9, date: Y, boxId: 1, cur: 'UZS', type: 'in', amount: 100000, desc: 'Savdo INV-3' },             // kecha — bugunga kirmaydi
      ],
      revisions: [{ id: 1, date: Y }],
    },
  };
}

async function withApp(fn) {
  const sc = scenario();
  const { browser, page, consoleErrors } = await loadApp({});
  try {
    await page.evaluate((sc) => {
      CUR.usdUzs = sc.usdUzs;
      Object.assign(S, sc.S);
      // Davr tanlash yordamchisi (sahifadagi tugmalar ham aynan S.sx'ni o'zgartiradi)
      window.__sx = (per, extra) => { S.sx = Object.assign({ per, ym: td().slice(0, 7), day: td(), dyn: 'sale', chk: 30 }, extra || {}); const d = sxData(); delete d.sales; return d; };
    }, sc);
    return await fn(page, sc, consoleErrors);
  } finally {
    await browser.close();
  }
}

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≠ ${b}`);

async function testTodayTotalsAndBusinessRules() {
  await withApp(async (page) => {
    const d = await page.evaluate(() => window.__sx('today'));
    near(d.rev, 150, 'Tushum');
    near(d.profit, 40, 'Foyda');
    near(d.units, 3, 'Sotilgan dona');
    near(d.disc, 5, 'Chegirma');
    near(d.debt, 50, 'Yangi qarz');
    near(d.exp, 19, "Xarajat (faqat do'kon: 15 + 4)");
    near(d.ret, 14, "Qaytarish = tannarx partiyasi 10 + «Qaytarish zarari» 4 (= sotuv narxi)");
    assert.equal(d.retCnt, 1, 'Qaytarishlar soni');
    near(d.pay.cash_uzs, 100, "To'lov turi: naqd so'm");
    near(d.pay.debt, 50, "To'lov turi: qarzga");
    assert.equal(d.a, T); assert.equal(d.b, T);
  });
}

async function testCashFlowOnlyCashBoxes() {
  await withApp(async (page) => {
    const d = await page.evaluate(() => window.__sx('today'));
    near(d.C.sale, 100, 'Naqd savdo (karta kirmaydi)');
    near(d.C.debtIn, 20, "Naqd qarz to'lovlari");
    near(d.C.otherIn, 0, 'Boshqa tushumlar');
    near(d.C.ret, 14, 'Xaridorlarga qaytarish');
    near(d.C.supp, 30, "Ta'minotchiga to'lov");
    near(d.C.exp, 5, "Xarajat (o'tkazma bu yerga tushmaydi)");
    near(d.C.xfer, 0, "Naqd kassalar orasidagi o'tkazma sof 0");
    near(d.cIn - d.cOut, 120 - 49, 'Kassa sof oqimi');
  });
}

async function testSaleEditDeleteAndCashToCardTransfer() {
  await withApp(async (page) => {
    const d = await page.evaluate((T) => {
      S.cashTxns.push(
        { id: 20, date: T, boxId: 1, cur: 'UZS', type: 'out', amount: 1000000, desc: "Savdo o'chirildi — INV-1" },   // savdo bekor — savdodan ayriladi
        { id: 21, date: T, boxId: 1, cur: 'UZS', type: 'out', amount: 100000, desc: 'Naqd → Karta' },                // naqd → karta: kamayish, xarajat emas
        { id: 22, date: T, boxId: 2, cur: 'UZS', type: 'in', amount: 100000, desc: 'Karta ← Naqd' });               // karta — hisobga kirmaydi
      return window.__sx('today');
    }, T);
    near(d.C.sale, 0, "O'chirilgan savdo naqd savdodan ayriladi (xarajat emas)");
    near(d.C.exp, 5, "Xarajat o'zgarmaydi");
    near(d.C.xfer, -10, "Naqd → karta o'tkazmasi");
    near(d.cIn - d.cOut, 20 - 49 - 10, 'Kassa sof oqimi');
  });
}

async function testPeriodFilters() {
  await withApp(async (page) => {
    const r = await page.evaluate(([Y, OLD]) => ({
      today: window.__sx('today').rev,
      yesterday: window.__sx('yesterday'),
      day: window.__sx('day', { day: Y }).rev,
      month: window.__sx('month'),
      oldMonth: window.__sx('month', { ym: OLD.slice(0, 7) }),
    }), [Y, OLD]);
    near(r.today, 150, 'Bugun');
    near(r.yesterday.rev, 70, 'Kecha');
    assert.equal(r.yesterday.a, Y, "Kecha — td() sanasidan bir kun oldin (UTC sanalar bilan mos)");
    near(r.day, 70, 'Kalendardan tanlangan kun');
    near(r.month.rev, (Y >= MONTH_START ? 70 : 0) + 150, 'Joriy oy (oy boshidan bugungacha)');
    assert.equal(r.month.a, MONTH_START); assert.equal(r.month.b, T);
    near(r.oldMonth.rev, 999, "O'tgan oy");
  });
}

async function testKirimExcludesSystemBatches() {
  await withApp(async (page) => {
    const d = await page.evaluate((T) => {
      S.batches.push({ id: 90, bno: 'T-1', pid: 1, qty: 2, sold: 0, costUsd: 10, date: T, status: 'active', origin: 'Tahrirlash — INV-1' });
      const x = window.__sx('today'); return { cnt: new Set(x.kir.map(b => b.bno)).size, sum: x.kir.reduce((s, b) => s + b.qty * b.costUsd, 0), suppPaid: x.suppPaid, suppDebt: x.suppDebt };
    }, T);
    assert.equal(d.cnt, 1, 'Kirim: faqat K-2 (qaytarish va tahrir partiyalari tizim yozuvi)');
    near(d.sum, 20, 'Kirim summasi');
    near(d.suppPaid, 30, "Ta'minotchilarga to'landi");
    near(d.suppDebt, 120, "Ta'minotchilarga qarz (USD)");
  });
}

async function testSxDataIsReadOnly() {
  await withApp(async (page) => {
    const same = await page.evaluate(() => {
      const snap = () => { const o = Object.assign({}, S); delete o.sx; return JSON.stringify(o); };
      const before = snap();
      window.__sx('today'); window.__sx('month');
      return before === snap();
    });
    assert.equal(same, true, "sxData ma'lumotlarni o'zgartirmasligi kerak (faqat S.sx — UI holati)");
  });
}

async function testRenderNoExportButtons() {
  await withApp(async (page, sc, consoleErrors) => {
    await page.addStyleTag({ path: path.join(ROOT, 'css', 'style.css') });
    await page.addStyleTag({ path: path.join(ROOT, 'css', 'design-system.css') });
    const r = await page.evaluate(() => {
      const el = document.createElement('div'); el.id = 'pg-hisobot'; document.body.appendChild(el);
      S.sx = null; pgHisobot();
      const html1 = el.innerHTML, text1 = el.textContent;
      const tileVal = (label) => { const t = [...el.querySelectorAll('.sx-tile')].find(x => x.textContent.includes(label)); return t ? t.querySelector('b').textContent : null; };
      const tiles = { low: tileVal('Omborda kam qoldi'), out: tileVal('Mavjud emas'), units: tileVal('Omborda jami') };
      sxSet('yesterday'); const textY = el.textContent;
      S.sx.dyn = 'ret'; sxDynRender(); sxSet('month'); sxSet('today');
      return { html1, text1, textY, tiles, hasRank: typeof sxRankSheet === 'function', excelFn: typeof sxExcelSheet,
        border: getComputedStyle(document.documentElement).getPropertyValue('--border').trim() };
    });
    for (const bad of ['Excel', 'Qoldiq chop', 'Kartochka', 'Kartichka', 'Hisobotlar va chop etish', 'printStock(', 'openProductCard2']) {
      assert.ok(!r.html1.includes(bad), `Statistika sahifasida "${bad}" qolmasligi kerak`);
    }
    assert.equal(r.excelFn, 'undefined', "Excel tanlash oynasi (sxExcelSheet) olib tashlangan");
    for (const must of ['Tushum', 'Kassadagi naqd pul', 'Dinamika', 'Hozirgi ombor', 'Kirim · Audit', 'Mahsulotlar reytingi', 'Qarzlar grafigi', 'Xodimlar', 'Cheklar']) {
      assert.ok(r.text1.replace(/ʻ|ʼ/g, "'").includes(must), `"${must}" bo'limi bo'lishi kerak`);
    }
    assert.ok(r.text1.includes('$150'), "Bugungi tushum ko'rinadi");
    assert.ok(r.text1.includes('Mega Stroy'), "Qarzdor mijoz ko'rinadi");
    assert.ok(r.textY.includes('$70'), 'Kecha tanlanganda kechagi tushum');
    assert.equal(r.tiles.low, '1', 'Kam qolgan (Arra: 4 ≤ 5)');
    assert.equal(r.tiles.out, '1', "Mavjud emas (Bolgarka)");
    assert.equal(r.tiles.units, '13', 'Omborda jami dona (qaytarish partiyasi bilan)');
    assert.ok(r.hasRank, 'Mahsulotlar reytingi oynasi mavjud');
    assert.ok(r.border.length > 0, "--border CSS o'zgaruvchisi bo'sh bo'lmasligi kerak (sikl regressiyasi)");
    assert.deepEqual(consoleErrors, [], 'Render xatosiz');
  });
}

async function testUiStateNotSavedToCloud() {
  await withApp(async (page) => {
    const r = await page.evaluate(async () => {
      window.__sx('month');
      let sent = null;
      window._safeCloudSave = async (p) => { sent = p; };
      try { await save(); } catch (e) {}
      const local = JSON.parse(localStorage.getItem('bp_data') || '{}');
      return { localHasSx: 'sx' in local, branchHasSx: !!(local.branchStore && Object.values(local.branchStore).some(b => b && 'sx' in b)) };
    });
    assert.equal(r.localHasSx, false, "S.sx (davr tanlovi) saqlanadigan ma'lumotga tushmasligi kerak");
    assert.equal(r.branchHasSx, false, "S.sx filial ma'lumotiga tushmasligi kerak");
  });
}

async function testMoneyFormat() {
  await withApp(async (page) => {
    const r = await page.evaluate(() => ({ neg: _sxUsd(-154.5), pos: _sxUsd(38738), z: _sxUsd(0) }));
    assert.equal(r.neg, '−$154.5');
    assert.equal(r.pos, '$38 738');
    assert.equal(r.z, '$0');
  });
}

module.exports = {
  name: "P5 — Statistika sahifasi (sxData + render, eksport tugmalarisiz)",
  cases: [
    { name: "Bugungi ko'rsatkichlar: tushum/foyda, do'kon xarajati, qaytarish = tannarx + zarar", run: testTodayTotalsAndBusinessRules },
    { name: "Naqd kassa oqimi: faqat naqd kassalar, karta kirmaydi, o'tkazma xarajat emas", run: testCashFlowOnlyCashBoxes },
    { name: "O'chirilgan savdo savdodan ayriladi; naqd → karta o'tkazmasi xarajat emas", run: testSaleEditDeleteAndCashToCardTransfer },
    { name: "Davr filtrlari: bugun / kecha (UTC sanalar) / kun / joriy va o'tgan oy", run: testPeriodFilters },
    { name: "Kirim tizim partiyalarisiz; ta'minotchi to'lov/qarz", run: testKirimExcludesSystemBatches },
    { name: "sxData faqat o'qiydi — ma'lumotlar o'zgarmaydi", run: testSxDataIsReadOnly },
    { name: "Render: eksport tugmalari yo'q, bo'limlar va plitkalar to'g'ri, xatosiz, --border bo'sh emas", run: testRenderNoExportButtons },
    { name: "Davr tanlovi (S.sx) bulut/localStorage'ga saqlanmaydi", run: testUiStateNotSavedToCloud },
    { name: "Pul formati: manfiy −$, minglik bo'shliq", run: testMoneyFormat },
  ],
};
