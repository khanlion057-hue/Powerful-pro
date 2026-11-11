// P3 — HAMKORLAR foyda taqsimoti: formula, bekor qilish va ko'p-qurilma
// sinxronlash regressiya testlari (2026-09-28). Production'dagi haqiqiy
// holatlardan olingan (avgust taqsimoti, "bekor qilish" qaytib kelishi).
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} ≠ ${b}`);

async function testAugustProductionExample() {
  const { browser, page } = await loadApp({});
  try {
    const r = await page.evaluate(() => computePartnerDistribution([
      { id: 1, name: 'AZIMSHER', invested: 0, isFounder: true },
      { id: 2, name: 'ABDULAZIZ', invested: 0, isFounder: true },
      { id: 3, name: 'Kozimjon', invested: 2000, keepPct: 0 },
      { id: 4, name: 'SARDOR', invested: 25000, keepPct: 70 },
    ], 5000, 0));
    assert.equal(r.ok, true);
    const by = Object.fromEntries(r.rows.map(x => [x.name, x]));
    near(by.SARDOR.foydaSumma, 4629.63, 'Sardor ulushi');
    near(by.SARDOR.foydaPlus, 1388.89, 'Sardor oladi (30%)');
    near(by.Kozimjon.foydaPlus, 370.37, "Kozimjon to'liq oladi");
    near(by.AZIMSHER.foydaPlus, 1620.37, 'AZIMSHER (teng)');
    near(by.ABDULAZIZ.foydaPlus, 1620.37, 'ABDULAZIZ (teng)');
    near(r.rows.reduce((s, x) => s + x.foydaPlus, 0), 5000, "Jami taqsimlangan = jami foyda (hech narsa yo'qolmaydi)");
  } finally { await browser.close(); }
}

async function testFounderPercentSplit() {
  const { browser, page } = await loadApp({});
  try {
    const r = await page.evaluate(() => computePartnerDistribution([
      { id: 1, name: 'A', invested: 0, isFounder: true, founderPct: 60 },
      { id: 2, name: 'B', invested: 0, isFounder: true, founderPct: 40 },
      { id: 3, name: 'S', invested: 1000, keepPct: 50 },
    ], 1000, 100));
    const by = Object.fromEntries(r.rows.map(x => [x.name, x]));
    near(by.S.foydaPlus, 500, 'Hamkor 50% oladi');
    near(by.A.foydaPlus, 500 * 0.6 - 100 * 0.6, "A: ushlab qolinganning 60% − xarajatning 60%");
    near(by.B.foydaPlus, 500 * 0.4 - 100 * 0.4, "B: 40%");
    const bad = await page.evaluate(() => computePartnerDistribution([
      { id: 1, name: 'A', invested: 0, isFounder: true, founderPct: 60 },
      { id: 2, name: 'B', invested: 0, isFounder: true, founderPct: 30 },
      { id: 3, name: 'S', invested: 1000, keepPct: 50 },
    ], 1000, 0));
    assert.equal(bad.ok, false, "Ta'sischilar % yig'indisi 100 bo'lmasa hisoblash bloklanishi kerak");
  } finally { await browser.close(); }
}

async function testUndoIsDeltaAndTombstoned() {
  const { browser, page } = await loadApp({});
  try {
    const r = await page.evaluate(() => {
      Object.assign(S, {
        branch: 'baza', deletedIds: {}, auditLogs: [],
        partners: [{ id: 1, name: 'A', invested: 1000, isFounder: true }, { id: 3, name: 'S', invested: 1000, keepPct: 0 }],
        partnerPeriods: [{ id: 5, start: '2026-08-01', end: '2026-08-31', totalProfit: 200, rows: [{ pid: 1, invested: 900, foydaPlus: 100 }, { pid: 3, invested: 900, foydaPlus: 100 }] }],
      });
      // taqsimotdan keyin hamkor S xarajat qildi (-50) — undo buni o'chirib yubormasligi kerak
      S.partners[1].invested -= 50;
      const realSave = save, realPg = pgHamkorlar, realConfirm = window.confirm;
      save = () => {}; pgHamkorlar = () => {}; window.confirm = () => true;
      try { undoLastPeriod(); } finally { save = realSave; pgHamkorlar = realPg; window.confirm = realConfirm; }
      return { inv: S.partners.map(p => p.invested), periods: S.partnerPeriods.length, tomb: isDeleted('partnerPeriods', 5) };
    });
    assert.deepEqual(r.inv, [900, 850], "Bekor qilish faqat taqsimot qo'shganini ayirishi kerak (keyingi xarajat saqlanadi)");
    assert.equal(r.periods, 0);
    assert.equal(r.tomb, true, "Bekor qilingan taqsimot tombstone bilan belgilanishi kerak");
  } finally { await browser.close(); }
}

async function testMergeDoesNotResurrectOrRevert() {
  // Bu qurilma taqsimotni bekor qildi; bulutda (boshqa, eski qurilma yozgan) taqsimot hali bor
  // va hamkor hisobi boshqa qurilmada o'zgargan. Natija: taqsimot qaytmaydi, hisob delta bilan to'g'ri.
  const { browser, page } = await loadApp({
    mockRoutes: [
      { url: '**/.netlify/functions/**', handler: (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"matched":true}' }) },
      { url: '**/.netlify/functions/app-data-load', handler: (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {
        partners: [{ id: 1, name: 'A', invested: 2000, isFounder: true, updatedAt: 5 }, { id: 3, name: 'S', invested: 3000, keepPct: 0, updatedAt: 5 }],
        partnerPeriods: [{ id: 5, start: '2026-08-01', end: '2026-08-31', rows: [] }],
        deletedIds: {}, branchStore: { baza: {} }, auditLogs: [],
      } }) }) },
      { url: '**/.netlify/functions/app-data-save', handler: (route) => { globalThis.__saved = route.request().postDataJSON(); route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"ignoredKeys":[],"blockedMassDelete":[]}' }); } },
    ],
  });
  try {
    const r = await page.evaluate(async () => {
      _cloudEnabled = true; _db = window.supabase.createClient();
      Object.assign(S, {
        branch: 'baza', auditLogs: [], deletedIds: { partnerPeriods: [{ id: 5, ts: Date.now() }] },
        partners: [{ id: 1, name: 'A', invested: 1000, isFounder: true }, { id: 3, name: 'S', invested: 1000, keepPct: 100 }],
        partnerPeriods: [],
      });
      S._store = { baza: _snapshotBranch() };
      // boshlang'ich nuqta: A=1000, S=1000; shu qurilmada S hisobiga +10 qo'shildi
      S._syncBaseline = _numericBaselineSnapshot();
      S.partners[1].invested += 10;
      await _safeCloudSave({ products: [], partners: S.partners, partnerPeriods: S.partnerPeriods, settings: {}, auditLogs: [], activeBranch: 'baza', branchStore: S._store, deletedIds: S.deletedIds });
      return { partners: S.partners.map(p => ({ id: p.id, invested: p.invested, keepPct: p.keepPct })), periods: S.partnerPeriods.length };
    });
    assert.equal(r.periods, 0, "Bekor qilingan taqsimot bulutdan qaytib chiqmasligi kerak");
    assert.equal(r.partners.find(p => p.id === 1).invested, 2000, "Eski qurilma bulutdagi hisobni o'z eski qiymati bilan qayta yozmasligi kerak");
    assert.equal(r.partners.find(p => p.id === 3).invested, 3010, "Hisob = bulut + shu qurilmadagi o'zgarish (delta)");
    assert.equal(r.partners.find(p => p.id === 3).keepPct, 0, "Yangiroq tahrir (updatedAt) ustun bo'lishi kerak");
  } finally { await browser.close(); }
}

async function testFounderToggleDoesNotLeave100() {
  const { browser, page } = await loadApp({});
  try {
    const v = await page.evaluate(() => {
      document.body.innerHTML = `<input type="checkbox" id="ep-founder" checked>` + partnerPctFieldsHtml('ep', { isFounder: true, keepPct: 100 });
      document.getElementById('ep-founder').checked = false;
      partnerFounderToggle('ep');
      return readPartnerPctFields('ep', false);
    });
    assert.equal(v.keepPct, 0, "Ta'sischi belgisi olib tashlanganda hamkor foydasining 100% ushlab qolinmasligi kerak (Kozimjon holati)");
  } finally { await browser.close(); }
}

async function testMonthClosedAndEditDelta() {
  const { browser, page } = await loadApp({});
  try {
    const r = await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div><div id="pg-hamkorlar"></div>');
      Object.assign(S, { branch: 'baza', auditLogs: [], deletedIds: {}, sales: [], expenses: [],
        partners: [{ id: 1, name: 'A', invested: 0, isFounder: true, founderPct: 50 }, { id: 2, name: 'B', invested: 0, isFounder: true, founderPct: 50 }, { id: 3, name: 'K', invested: 1000, keepPct: 0 }],
        partnerPeriods: [] });
      const realSave = save; save = () => {};
      const toasts = []; window.toast = (m) => toasts.push(m);
      try {
        openMonthlyCalc(); document.getElementById('mc-month').value = '2026-08'; mcRecalc(true);
        document.getElementById('mc-profit').value = '530'; doMonthlyCalc();
        const afterFirst = S.partners.map(p => +p.invested.toFixed(2));
        // shu oyni ikkinchi marta hisoblash — bloklanishi kerak
        openMonthlyCalc(); document.getElementById('mc-month').value = '2026-08'; mcRecalc(true);
        const btnDisabled = document.getElementById('mc-save').disabled;
        document.getElementById('mc-profit').value = '100'; doMonthlyCalc();
        const count = S.partnerPeriods.length;
        // tahrir: 530 → 600
        openMonthlyCalc(String(S.partnerPeriods[0].id)); document.getElementById('mc-profit').value = '600'; mcRecalc(false); doMonthlyCalc();
        return { afterFirst, btnDisabled, count, afterEdit: S.partners.map(p => +p.invested.toFixed(2)), month: S.partnerPeriods[0].month, start: S.partnerPeriods[0].start, end: S.partnerPeriods[0].end, html: partnerMonthsHtml(), toasts };
      } finally { save = realSave; }
    });
    assert.deepEqual(r.afterFirst, [0, 0, 1530], "K (yagona hisobli, 0% ushlanadi) hamma foydani oladi");
    assert.equal(r.btnDisabled, true, "Yopilgan oy uchun saqlash tugmasi o'chiq bo'lishi kerak");
    assert.equal(r.count, 1, "Bir oy ikki marta taqsimlanmasligi kerak");
    assert.deepEqual(r.afterEdit, [0, 0, 1600], "Tahrirda faqat farq (+70) qo'shilishi kerak");
    assert.equal(r.month, '2026-08'); assert.equal(r.start, '2026-08-01'); assert.equal(r.end, '2026-08-31');
    assert.ok(r.html.includes('01.08.2026') || r.html.includes('2026-08-01'), "Ro'yxatda oy sanasi ko'rinishi kerak");
    assert.ok(r.html.includes('🖊') && r.html.includes('🗑') && r.html.includes('🖨'));
  } finally { await browser.close(); }
}

async function testShareBaseHalfOfMonthWithdrawals() {
  const { browser, page } = await loadApp({});
  try {
    const r = await page.evaluate(() => {
      Object.assign(S, { branch: 'baza', partnerPeriods: [], sales: [],
        // Kozimjon: oy boshida 2000$, 11.08 da 200$, 22.08 da 300$ oldi (hisobidan allaqachon ayirilgan), 05.09 da yana 100$
        partners: [{ id: 3, name: 'Kozimjon', invested: 1400, keepPct: 0 }, { id: 4, name: 'L', invested: 2000, keepPct: 0 }],
        expenses: [
          { id: 1, turi: 'hamkor', partnerId: 3, date: '2026-08-11', amtUsd: 200 },
          { id: 2, turi: 'hamkor', partnerId: 3, date: '2026-08-22', amtUsd: 300 },
          { id: 3, turi: 'hamkor', partnerId: 3, date: '2026-09-05', amtUsd: 100 },
          { id: 4, turi: 'dokon', date: '2026-08-15', amtUsd: 50 },
        ] });
      const list = partnersForMonth('2026-08');
      const res = computePartnerDistribution(list, 3750, 0);
      return { k: list.find(p => p.id === 3), rows: res.rows.map(x => ({ n: x.name, base: x.base, pct: x.pct, plus: x.foydaPlus, jami: x.jamiSumma })) };
    });
    assert.equal(r.k.monthStart, 2000, "Oy boshidagi hisob to'g'ri tiklanishi kerak (keyingi oydagi chiqim ham qaytariladi)");
    assert.equal(r.k.withdrawn, 500);
    assert.equal(r.k.shareBase, 1750, "Foyda uchun hisob = 2000 − 500/2 = 1750");
    const k = r.rows.find(x => x.n === 'Kozimjon');
    near(k.pct, 1750 / 3750 * 100, 'Ulush 1750/3750');
    near(k.plus, 1750, 'Kozimjon oladi');
    near(k.jami, 1400 + 1750, "Yangi hisob = HAQIQIY joriy hisob + oladi");
  } finally { await browser.close(); }
}

// ════════════════════════════════════════════════════════════
// HAMKOR KIRIMI (pul qo'shish) — kechiktirilgan foyda-eligibility
// qoidasi (AZIMSHER, 2026-09-28): 1-5 sanada qo'shilsa keyingi oydan,
// 6-sanadan keyin qo'shilsa undan keyingi oydan (bir oy o'tkazib)
// foyda taqsimotiga qo'shiladi.
// ════════════════════════════════════════════════════════════
async function testDepositEffectiveMonthCutoff() {
  const { browser, page } = await loadApp({});
  try {
    const r = await page.evaluate(() => ({
      day3: depositEffectiveMonth('2026-08-03'),
      day5: depositEffectiveMonth('2026-08-05'),
      day6: depositEffectiveMonth('2026-08-06'),
      day20: depositEffectiveMonth('2026-08-20'),
      yearWrap: depositEffectiveMonth('2026-12-20'),
    }));
    assert.equal(r.day3, '2026-09', "1-5 sanada qo'shilgan kirim — KEYINGI oydan (Sentabr)");
    assert.equal(r.day5, '2026-09', "5-sana ham 'ichida' hisoblanadi");
    assert.equal(r.day6, '2026-10', "6-sanadan boshlab — bir oy o'tkazib (Oktabr)");
    assert.equal(r.day20, '2026-10', "AZIMSHER misoli: 20.08.2026 → 01.10.2026");
    assert.equal(r.yearWrap, '2027-02', "Yil chegarasidan o'tishi to'g'ri hisoblanishi kerak");
  } finally { await browser.close(); }
}

async function testDepositDelayedProfitShare() {
  const { browser, page } = await loadApp({});
  try {
    const r = await page.evaluate(() => {
      Object.assign(S, { branch: 'baza', partnerPeriods: [], sales: [],
        // AZIMSHER misoli: Kozimjonda 1000$ bor edi, 20.08.2026 da 1500$ kirim qo'shdi → hisobi 2500$
        partners: [{ id: 1, name: 'Kozimjon', invested: 2500, keepPct: 0 }],
        expenses: [
          { id: 1, turi: 'hamkor', kind: 'kirim', partnerId: 1, date: '2026-08-20', amtUsd: 1500 },
        ] });
      const sep = partnersForMonth('2026-09').find(p => p.id === 1);
      const oct = partnersForMonth('2026-10').find(p => p.id === 1);
      return { sepBase: sep.shareBase, sepPending: sep.pendingDeposits, sepMonthStart: sep.monthStart,
               octBase: oct.shareBase, octPending: oct.pendingDeposits };
    });
    near(r.sepMonthStart, 2500, "Sentabr oy boshidagi HAQIQIY hisob 2500$ (kirim avgustda kirgan)");
    near(r.sepBase, 1000, "Sentabr uchun 1500$ kirim HALI band — foyda hisobiga qo'shilmaydi");
    near(r.sepPending, 1500, "Sentabrda 1500$ band deb ko'rsatilishi kerak");
    near(r.octBase, 2500, "Oktabrdan boshlab 1500$ ham foyda hisobiga qo'shiladi");
    near(r.octPending, 0, "Oktabrda endi band emas");
  } finally { await browser.close(); }
}

async function testDepositEarlyMonthCountsNextMonth() {
  const { browser, page } = await loadApp({});
  try {
    const r = await page.evaluate(() => {
      Object.assign(S, { branch: 'baza', partnerPeriods: [], sales: [],
        // 03.08.2026 da (1-5 sanada) 500$ kirim qo'shdi → hisobi 1500$
        partners: [{ id: 1, name: 'A', invested: 1500, keepPct: 0 }],
        expenses: [
          { id: 1, turi: 'hamkor', kind: 'kirim', partnerId: 1, date: '2026-08-03', amtUsd: 500 },
        ] });
      const sep = partnersForMonth('2026-09').find(p => p.id === 1);
      return { sepBase: sep.shareBase, sepPending: sep.pendingDeposits };
    });
    near(r.sepBase, 1500, "1-5 sanada qo'shilgan kirim KEYINGI oydayoq (Sentabr) foyda hisobiga qo'shiladi");
    near(r.sepPending, 0);
  } finally { await browser.close(); }
}

async function testKirimReversalRestoresBalances() {
  const { browser, page } = await loadApp({});
  try {
    // v11 (F4): kassa qismi endi alohida server amali (fwCashOps) — shuning uchun haqiqiy
    // foydalanuvchi oqimi (o'chirish tugmasi: deleteExpenseRow) orqali tekshiriladi
    const r = await page.evaluate(async () => {
      document.body.insertAdjacentHTML('beforeend', '<div id="pg-xarajatlar"></div>');
      Object.assign(S, { branch: 'baza', xarajatTab: 'hamkor', auditLogs: [], deletedIds: {}, cashTxns: [],
        partners: [{ id: 1, name: 'A', invested: 1300 }],
        cashboxes: [{ id: 1, name: 'Kassa', cur: 'USD', bal: 800 }],
        expenses: [{ id: 99, turi: 'hamkor', kind: 'kirim', partnerId: 1, boxId: 1, amtUsd: 300, cat: 'Test' }],
      });
      _cloudEnabled = false;
      const realSave = save, realConfirm = window.confirm; save = () => {}; window.confirm = () => true;
      try { await deleteExpenseRow(99); } finally { save = realSave; window.confirm = realConfirm; }
      return { inv: S.partners[0].invested, bal: S.cashboxes[0].bal };
    });
    assert.deepEqual(r, { inv: 1000, bal: 500 }, "Kirim bekor qilinganda (o'chirish/tahrirlash) hamkor hisobi VA kassa asl holatiga qaytishi kerak");
  } finally { await browser.close(); }
}

async function testHamkorKirimFormAddsPositive() {
  const { browser, page } = await loadApp({});
  try {
    const r = await page.evaluate(async () => {
      document.body.insertAdjacentHTML('beforeend', '<div id="pg-xarajatlar"></div>');
      Object.assign(S, { branch: 'baza', xarajatTab: 'hamkor', auditLogs: [], deletedIds: {},
        partners: [{ id: 1, name: 'Kozimjon', invested: 1000 }],
        cashboxes: [{ id: 1, name: 'Kassa', icon: '💵', cur: 'USD', bal: 500 }],
        cashTxns: [], expenses: [] });
      const realSave = save; save = () => {};
      try {
        // 2026-10-02: tayyor kategoriya yo'q — foydalanuvchi yaratgan kategoriya (bulutsiz rejimda shu brauzerda)
        await fwExpCatLoad('baza', true);
        const kat = await fwExpCatCreate('hamkor', "Kapital qo'shish");
        pgXarajatlar(); // formani standart (chiqim) holatda render qiladi
        document.getElementById('ex-hamkor-kind').value = 'kirim';
        hamkorKindChange(); // hint/tugmani "kirim"ga almashtiradi
        document.getElementById('ex-cat').value = String(kat.id);
        document.getElementById('ex-amt').value = '300';
        document.getElementById('ex-cur').value = 'USD';
        document.getElementById('ex-partner').value = '1';
        document.getElementById('ex-dsc').value = 'Test kirim';
        document.getElementById('ex-box').value = '1';
        await addExpense();   // v11: kassa amali asinxron (fwCashOps)
      } finally { save = realSave; }
      const e = S.expenses[S.expenses.length - 1];
      return { invested: S.partners[0].invested, bal: S.cashboxes[0].bal, kind: e.kind, turi: e.turi, amt: e.amtUsd, cat: e.cat, linked: e.catId === FWC.list[0].id };
    });
    assert.equal(r.turi, 'hamkor'); assert.equal(r.kind, 'kirim');
    assert.equal(r.cat, "Kapital qo'shish"); assert.equal(r.linked, true, 'xarajat kategoriyaga ID bilan bog\'landi');
    near(r.amt, 300, "Kiritilgan summa to'g'ri saqlanishi kerak");
    near(r.invested, 1300, "Kirim qo'shilganda hamkor hisobi OSHISHI kerak (1000+300), kamaymasligi");
    near(r.bal, 800, "Kirim qo'shilganda kassa balansi OSHISHI kerak (500+300)");
  } finally { await browser.close(); }
}

async function testPartnerLedgerLabelsKirimAsPositive() {
  const { browser, page } = await loadApp({});
  try {
    const r = await page.evaluate(() => {
      Object.assign(S, { partnerPeriods: [],
        partners: [{ id: 1, name: 'A', invested: 1300 }],
        expenses: [
          { id: 1, turi: 'hamkor', kind: 'kirim', partnerId: 1, date: '2026-08-20', amtUsd: 300, cat: "Kapital qo'shish" },
          { id: 2, turi: 'hamkor', partnerId: 1, date: '2026-08-21', amtUsd: 50, cat: 'Bonus' }, // eski, kind'siz yozuv — chiqim
        ] });
      const ev = partnerLedger(1);
      return ev.map(e => ({ delta: e.delta, desc: e.desc }));
    });
    assert.equal(r[0].delta, 300, "Kirim yozuvi MUSBAT delta bilan ko'rsatilishi kerak");
    assert.ok(r[0].desc.includes('Kirim'), "Kirim yozuvi tarixda 'Kirim' deb belgilanishi kerak");
    assert.equal(r[1].delta, -50, "kind'siz (eski) hamkor yozuvi hamon chiqim sifatida ishlashi kerak");
  } finally { await browser.close(); }
}

module.exports = {
  name: 'P3 — Hamkorlar foyda taqsimoti',
  cases: [
    { name: "Avgust (production) misoli: Sardor 30%, Kozimjon to'liq, ta'sischilar teng", run: testAugustProductionExample },
    { name: "Ta'sischilar alohida % (60/40) + yig'indi 100% bo'lmasa blok", run: testFounderPercentSplit },
    { name: "Bekor qilish: faqat taqsimot summasini ayiradi + tombstone", run: testUndoIsDeltaAndTombstoned },
    { name: "Sinxron: bekor qilingan taqsimot qaytmaydi, hisob eski qurilma tomonidan qayta yozilmaydi", run: testMergeDoesNotResurrectOrRevert },
    { name: "Ta'sischi belgisini olib tashlash 100% ni qoldirmaydi", run: testFounderToggleDoesNotLeave100 },
    { name: "Oylik: hisoblangan oy yopiladi, tahrir faqat farqni qo'shadi", run: testMonthClosedAndEditDelta },
    { name: "Foyda uchun hisob = oy boshi − oyda olganining yarmi (2000−500/2=1750)", run: testShareBaseHalfOfMonthWithdrawals },
    { name: "Kirim kechiktirish: sanaga qarab keyingi/keyingi-keyingi oydan boshlanadi", run: testDepositEffectiveMonthCutoff },
    { name: "AZIMSHER misoli: 20.08 kirim → Sentabrda band, Oktabrdan foyda oladi", run: testDepositDelayedProfitShare },
    { name: "1-5 sanada qo'shilgan kirim keyingi oydayoq foyda oladi", run: testDepositEarlyMonthCountsNextMonth },
    { name: "Kirim bekor qilinganda hamkor hisobi va kassa asl holatga qaytadi", run: testKirimReversalRestoresBalances },
    { name: "Xarajatlar formasi: 'Kirim' tanlansa hisob va kassa OSHADI (kamaymaydi)", run: testHamkorKirimFormAddsPositive },
    { name: "Hamkor tarixi: kirim yozuvi musbat (+) va 'Kirim' deb ko'rsatiladi", run: testPartnerLedgerLabelsKirimAsPositive },
  ],
};
