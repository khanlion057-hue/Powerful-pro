// P16 — v23 HARDENING: brauzer (HAQIQIY js/shared.js + js/main.js + firma-kassa.js / sotuvchi.js,
// haqiqiy Chromium). Qoida: SERVER MUVAFFAQIYATI → mahalliy o'zgarish; SERVER XATOSI → hech narsa.
//
// Bu testlar v11 kodida FAIL bo'ladi: payDebt/paySupplierDebt/doKunlikHisob/svConfirmPay eski
// endpoint'ni "fail-open" chaqirardi (tarmoq xatosida to'lov baribir o'tardi), "uyga berish"
// qoldiqdan ortiq summani jimgina qisqartirardi, diller to'lovi bulut xatosini faqat "⚠️" bilan
// o'tkazib yuborardi, hamkorlar faqat Bazada edi, Telegram tokeni sozlamalar oynasida ko'rinardi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { loadApp, ROOT } = require('./helpers/load-app');
const { supabaseStub } = require('./p4-responsive.test.js')._helpers;

const json = (route, status, obj) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });

async function withApp(opts, fn) {
  const { browser, page, consoleErrors } = await loadApp(opts);
  try {
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div><div id="bs-ov" hidden></div>');
      save = () => {}; pgSavdo = () => {}; showReceipt = () => {}; pgKirim = () => {}; pgKassalar = () => {};
      pgMijozlar = () => {}; pgTaminotchilar = () => {}; pgDillerlar = () => {}; pgHamkorlar = () => {}; pgSozlamalar = () => {};
      CUR.usdUzs = 12800; CUR.usdCny = 7; CUR.BANK_FEE = 0.006;
    });
    await fn(page);
    assert.deepEqual(consoleErrors, [], 'sahifada JS xatosi yo\'q');
  } finally { await browser.close(); }
}

// ── 1. Mijoz qarz to'lovi — fail-close (barcha rejimlar) ──────────────
async function testPayDebtFailClose() {
  let mode = 'net'; const calls = [];
  await withApp({ mockRoutes: [
    { url: '**/.netlify/functions/cashbox-ops', handler: (route) => {
      const b = JSON.parse(route.request().postData()); calls.push(['ops', b]);
      if (mode === 'net') return route.abort('failed');
      if (mode === 'reject') return json(route, 400, { error: 'CASHBOX: rad' });
      if (mode === 'auth') return json(route, 200, { ok: true, authority: true, balances: { 1: 1150000 } });
      return json(route, 200, { ok: true, authority: false });
    } },
    { url: '**/.netlify/functions/customer-debt-payment-add', handler: (route) => {
      calls.push(['legacy', JSON.parse(route.request().postData())]);
      return mode === 'legacy-fail' ? json(route, 500, { error: 'Yozishda xatolik' }) : json(route, 200, { ok: true });
    } },
  ] }, async (page) => {
    const run = (amt) => page.evaluate(async (a) => {
      _cloudEnabled = true;
      document.getElementById('modal-ov').innerHTML = `<select id="pd-b"><option value="1" selected>Naqd</option></select><input id="pd-a" value="${a}">`;
      await payDebt(77);
      return { debt: S.customers[0].debt, bal: S.cashboxes[0].bal, err: (window.__toasts.at(-1) || {}).kind };
    }, amt);
    await page.evaluate(() => Object.assign(S, { branch: 'f729', cashTxns: [], customers: [{ id: 77, name: 'Ali', debt: 500000 }],
      cashboxes: [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 1000000 }] }));
    for (const m of ['net', 'reject', 'legacy-fail']) {
      mode = m;
      const r = await run(100000);
      assert.deepEqual([r.debt, r.bal, r.err], [500000, 1000000, 'error'], `${m}: qarz ham, kassa ham o'zgarmadi`);
    }
    assert.ok(calls.some(c => c[0] === 'legacy'), "eski rejimda server yozuvi MAHALLIY o'zgarishdan oldin chaqirildi");
    calls.length = 0; mode = 'legacy-ok';
    let r = await run(100000);
    assert.deepEqual([r.debt, r.bal], [400000, 1100000], 'eski rejim: server yozuvi muvaffaqiyatli → mahalliy hisob');
    assert.deepEqual(calls.map(c => c[0]), ['ops', 'legacy']);
    calls.length = 0; mode = 'auth';
    r = await run(50000);
    assert.deepEqual([r.debt, r.bal], [350000, 1150000], 'qoldiq serverdan');
    assert.deepEqual(calls.map(c => c[0]), ['ops'], '24-migratsiyadan keyin eski endpoint chaqirilmaydi');
    assert.deepEqual(calls[0][1].record, { customerId: 77 }, "to'lov yozuvi kassa amali bilan BIRGA yuboriladi");
    calls.length = 0;
    r = await run(999999);
    assert.equal(r.debt, 350000); assert.equal(calls.length, 0, 'qarzdan ortiq — serverga ham yuborilmaydi');
  });
}

// ── 2. Ta'minotchi to'lovi va kunlik "uyga berish" — fail-close, qisqartirish yo'q ──
async function testSupplierAndHomeWithdrawal() {
  let mode = 'net'; const calls = [];
  await withApp({ mockRoutes: [
    { url: '**/.netlify/functions/cashbox-ops', handler: (route) => { const b = JSON.parse(route.request().postData()); calls.push(b);
      if (mode === 'net') return route.abort('failed');
      return json(route, 200, { ok: true, authority: true, balances: Object.fromEntries(b.ops.map(o => [o.box, 1])) }); } },
    { url: '**/.netlify/functions/supplier-payment-add', handler: (route) => json(route, 200, { ok: true }) },
    { url: '**/.netlify/functions/home-withdrawal-add', handler: (route) => json(route, 200, { ok: true }) },
    // v23.4: kunlik yopish — pul tizimdan chiqmaydi, Firma kassasiga o'tadi (firma-kassa: daily_close)
    { url: '**/.netlify/functions/firma-kassa', handler: (route) => { const b = JSON.parse(route.request().postData()); calls.push(b);
      if (mode === 'net') return route.abort('failed');
      return json(route, 200, { ok: true, authority: true, transfer: { branchBalance: 1, amount: b.amount } }); } },
  ] }, async (page) => {
    const r = await page.evaluate(async () => {
      _cloudEnabled = true; CURRENT_USER = null;
      Object.assign(S, { branch: 'baza', cashTxns: [], dailyClosings: [], sales: [], expenses: [], suppliers: [{ id: 5, name: 'X', debt: 100, paid: 0 }],
        cashboxes: [{ id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 50 }, { id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 1000 }] });
      document.getElementById('modal-ov').innerHTML = `<select id="psd-b"><option value="3" selected>D</option></select><input id="psd-a" value="20">
        <input id="kh-amt-3" value="80"><input id="kh-amt-1" value="10"><input id="kh-note" value="">`;
      await paySupplierDebt(5);
      const afterNet = { debt: S.suppliers[0].debt, bal: S.cashboxes[0].bal };
      await doKunlikHisob();   // 80 > 50 — avval jimgina 50 ga qisqartirilardi
      const afterOver = { closings: S.dailyClosings.length, bal: S.cashboxes[0].bal };
      document.getElementById('kh-amt-3').value = '30';
      await doKunlikHisob();   // tarmoq yo'q
      const afterNet2 = { closings: S.dailyClosings.length, bal: S.cashboxes[0].bal };
      return { afterNet, afterOver, afterNet2 };
    });
    assert.deepEqual(r.afterNet, { debt: 100, bal: 50 }, "ta'minotchi: tarmoq xatosi — hech narsa o'zgarmadi");
    assert.deepEqual(r.afterOver, { closings: 0, bal: 50 }, 'qoldiqdan ortiq — rad (jimgina qisqartirilmaydi)');
    assert.deepEqual(r.afterNet2, { closings: 0, bal: 50 }, 'kunlik yopish: tarmoq xatosi — yozilmadi');
    const dc = () => calls.filter(b => b.action === 'daily_close');
    assert.equal(dc().length, 1, 'ortiqcha summa serverga yuborilmadi (faqat tarmoq urinishidagi birinchi kassa)');
    assert.equal(calls.filter(b => b.kind === 'home_withdrawal').length, 0, "pul endi tizimdan chiqarilmaydi (eski «uyga berish» yo'li ishlatilmaydi)");
    const firstKey = dc()[0].idemKey;
    mode = 'ok';
    const ok = await page.evaluate(async () => { await doKunlikHisob(); return { closings: S.dailyClosings.length, bal: S.cashboxes[0].bal, toFirma: S.dailyClosings[0]?.toFirma }; });
    assert.deepEqual(ok, { closings: 1, bal: 1, toFirma: true }, 'server tasdiqladi — yopildi, qoldiq serverdan, Firma kassasiga');
    const sent = dc().slice(1);
    assert.deepEqual(sent.map(b => [b.boxId, b.currency, b.amount]), [[3, 'USD', 30], [1, 'UZS', 10]], 'har bir kassa — Firma kassasiga, oʻz valyutasida');
    assert.equal(sent[0].idemKey, firstKey, 'tarmoq xatosidan keyin qayta bosish — o\'sha kalit (takror yozilmaydi)');
    assert.ok(sent.every(b => 'note' in b), 'izoh server amali bilan birga');
  });
}

// ── 3. Diller to'lovi — qarz SERVERDAN; eski endpoint'lar chaqirilmaydi ──
async function testDealerPayServerDebt() {
  const hits = [];
  await withApp({ mockRoutes: [
    { url: '**/.netlify/functions/cashbox-ops', handler: (route) => { hits.push('ops'); json(route, 200, { ok: true, authority: true, balances: { 4: 30 }, dealerDebtUsd: 12.5, dealerTotalPaidUsd: 30 }); } },
    { url: '**/.netlify/functions/dealer-payment-add', handler: (route) => { hits.push('legacy'); json(route, 410, { error: 'eskirgan' }); } },
    { url: '**/.netlify/functions/dealer-update', handler: (route) => { hits.push('update'); json(route, 200, { ok: true }); } },
    { url: '**/.netlify/functions/dealer-audit-add', handler: (route) => json(route, 200, { ok: true }) },
  ] }, async (page) => {
    const r = await page.evaluate(async () => {
      _cloudEnabled = true;
      Object.assign(S, { branch: 'baza', cashTxns: [], dealerTxns: [], dealers: [{ id: 9, name: 'D', debt: 40, totalPaid: 0 }],
        cashboxes: [{ id: 4, name: 'Diller', cur: 'USD', type: 'dealer', bal: 0 }] });
      document.getElementById('modal-ov').innerHTML = `<select id="dp-b"><option value="4" selected>D</option></select><input id="dp-a" value="30">`;
      await doDealerPay(9);
      return { debt: S.dealers[0].debt, paid: S.dealers[0].totalPaid, bal: S.cashboxes[0].bal };
    });
    assert.deepEqual(r, { debt: 12.5, paid: 30, bal: 30 }, 'diller qarzi va kassa — server javobidan');
    assert.ok(!hits.includes('legacy') && !hits.includes('update'), "eski diller to'lov/yangilash yo'llari ishlatilmadi");
  });
}

// ── 4. Hamkorlar — har bir filialning o'zi; Baza ma'lumotiga tegilmaydi ──
async function testPartnersPerBranch() {
  await withApp({}, async (page) => {
    const r = await page.evaluate(async () => {
      _cloudEnabled = false; CURRENT_USER = null;
      const ym = new Date().toISOString().slice(0, 7);
      Object.assign(S, { branch: 'f729', sales: [], expenses: [],
        partners: [{ id: 1, name: 'Baza ta\'sischi', invested: 1000, isFounder: true }, { id: 2, name: 'F729 investor', invested: 500, isFounder: true, filial: 'f729' }],
        partnerPeriods: [{ id: 5, month: '2020-01', start: '2020-01-01', end: '2020-01-31', rows: [{ pid: 1, foydaPlus: 10 }], totalProfit: 10 }] });
      const visible = brPartners().map(p => p.id);
      openAddPartner();
      document.getElementById('np-n').value = 'Yangi'; document.getElementById('np-inv').value = '100';
      savePartner();
      const added = S.partners.at(-1);
      openMonthlyCalc();
      document.getElementById('mc-month').value = ym; mcRecalc(true);
      document.getElementById('mc-profit').value = '60'; mcRecalc(false);
      doMonthlyCalc();
      const per = S.partnerPeriods.find(p => p.filial === 'f729');
      const baza = S.partners.find(p => p.id === 1).invested;
      const branchPeriods = brPeriods().map(p => p.id);
      window.confirm = () => true; undoLastPeriod();
      const afterUndo = { baza: S.partners.find(p => p.id === 1).invested, bazaPeriod: S.partnerPeriods.some(p => p.id === 5), f729: S.partnerPeriods.some(p => p.filial === 'f729') };
      return { visible, addedId: added.id, addedFilial: added.filial, perRows: per ? per.rows.map(x => x.pid) : null, baza, branchPeriods: branchPeriods.length, afterUndo };
    });
    assert.deepEqual(r.visible, [2], 'f729 da faqat o\'z hamkorlari');
    assert.equal(r.addedFilial, 'f729', 'yangi hamkor joriy filialga yoziladi');
    assert.deepEqual([...r.perRows].sort(), [2, r.addedId].sort(), 'taqsimot faqat f729 hamkorlari bo\'yicha');
    assert.ok(!r.perRows.includes(1), 'Baza hamkori f729 foydasidan ulush olmaydi');
    assert.equal(r.baza, 1000, 'Baza hamkori hisobi o\'zgarmadi');
    assert.equal(r.branchPeriods, 1, 'f729 ning oylik ro\'yxatida Baza oyi yo\'q');
    assert.deepEqual(r.afterUndo, { baza: 1000, bazaPeriod: true, f729: false }, 'bekor qilish faqat shu filialning oxirgi oyini o\'chiradi');
  });
}

// ── 5. Telegram sozlamalari: token ko'rsatilmaydi, sinov serverdan ──
async function testTelegramUi() {
  let testBody = null; let directTelegram = false;
  await withApp({ mockRoutes: [
    { url: '**/.netlify/functions/telegram-test', handler: (route) => { testBody = JSON.parse(route.request().postData()); json(route, 200, { ok: true }); } },
    { url: 'https://api.telegram.org/**', handler: (route) => { directTelegram = true; route.abort('failed'); } },
  ] }, async (page) => {
    const r = await page.evaluate(async () => {
      _cloudEnabled = true;
      Object.assign(S, { settings: { company: 'F', tgBotTokenSet: true, tgChatId: '-100123' } });
      stEditTelegram();
      const html = document.getElementById('modal-ov').innerHTML;
      const tokenVal = document.getElementById('st-tg-token').value;
      await stTestTelegram();
      const status = document.getElementById('st-tg-status').textContent;
      stSaveTelegram();   // token kiritilmadi — eski token saqlanib qoladi
      return { tokenVal, saysSet: /Bot ulangan|✅/.test(html), status, tokenAfterSave: S.settings.tgBotToken, chat: S.settings.tgChatId };
    });
    assert.equal(r.tokenVal, '', "token maydoni bo'sh (qiymat brauzerda yo'q)");
    assert.equal(r.saysSet, true, 'token o\'rnatilgani ko\'rsatiladi');
    assert.equal(directTelegram, false, 'brauzer Telegram API\'ga to\'g\'ridan-to\'g\'ri murojaat qilmaydi');
    assert.deepEqual(testBody, { chatId: '-100123' }, 'sinov serverdagi token bilan (token yuborilmadi)');
    assert.match(r.status, /Ishlayapti/);
    assert.equal(r.tokenAfterSave, undefined, "bo'sh maydon tokenni o'chirmaydi (server eski qiymatni saqlaydi)");
    // v24.5 (v23.10.2 dan): bulutsiz rejimda ham brauzer Telegram'ga to'g'ridan-to'g'ri chiqmaydi (token URL/tarmoqda ko'rinmasin)
    const off = await page.evaluate(async () => {
      _cloudEnabled = false;
      Object.assign(S, { settings: { company: 'F', tgChatId: '-100123' } });
      stEditTelegram();
      document.getElementById('st-tg-token').value = '123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      await stTestTelegram();
      return document.getElementById('st-tg-status').textContent;
    });
    assert.equal(directTelegram, false, "bulutsiz rejimda ham api.telegram.org chaqirilmaydi");
    assert.match(off, /faqat onlayn/);
  });
  // brauzer kodida (manba va dist) Telegram API manzili yo'q
  const fs = require('fs'), path = require('path');
  const ROOTDIR = path.join(__dirname, '..');
  for (const f of [...fs.readdirSync(path.join(ROOTDIR, 'js')).filter(x => x.endsWith('.js')).map(x => 'js/' + x), ...fs.readdirSync(ROOTDIR).filter(x => x.endsWith('.html'))]) {
    const fp = path.join(ROOTDIR, f); if (!fs.existsSync(fp)) continue;
    assert.ok(!/https:\/\/api\.telegram\.org/.test(fs.readFileSync(fp, 'utf8')), f + ": api.telegram.org yo'q");
  }
  assert.ok(!/api\.telegram\.org/.test(fs.readFileSync(path.join(ROOTDIR, 'netlify.toml'), 'utf8')), "CSP connect-src'da Telegram yo'q");
}

// ── 6. Kirim → Firma kassa: partiya to'lovga deterministik bog'lanadi; Kassalar qarz kartasi ──
async function testKirimRefAndBranchLoanUi() {
  const bodies = []; let loanMode = 'fail';
  await withApp({ mockRoutes: [{ url: '**/.netlify/functions/firma-kassa', handler: (route) => {
    const b = JSON.parse(route.request().postData()); bodies.push(b);
    if (b.action === 'branch_summary') return json(route, 200, { branches: [{ filial: 'f729', goodsDebtUsd: 500, loanUsd: 50, loanUzs: 0 }] });
    if (b.action === 'branch_loan_repay') return loanMode === 'fail' ? json(route, 400, { error: 'FIRMA_KASSA: qarzdan oshib ketdi' })
      : json(route, 200, { ok: true, authority: true, loan: { branchBalance: 80, outstanding: 30, amount: 20 } });
    return json(route, 200, { ok: true, entry: { op: b.action } });
  } }] }, async (page) => {
    await page.addScriptTag({ path: path.join(ROOT, 'js', 'firma-kassa.js') });
    const k = await page.evaluate(async () => {
      _cloudEnabled = true; CURRENT_USER = null;
      Object.assign(S, { branch: 'baza', cashTxns: [], suppliers: [], batches: [], batchCounter: 0, importCur: 'USD', kirimStatus: 'active', kirimSuppId: null,
        cashboxes: [{ id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 100 }] });
      document.body.insertAdjacentHTML('beforeend', `<div id="k-calc-data" data-rows='[{"pid":101,"qty":10,"costUsd":10.2,"prodUsd":100,"overUsd":2}]' data-bank="0" data-grand="102" data-goods="100"></div>
        <select id="k-source-box"><option value="firma" selected>Firma</option></select><input id="k-given" value=""><input id="k-suppq" value="">`);
      await kirimSave();
      return { fkRef: S.batches[0] && S.batches[0].fkRef, kirimRef: S.batches[0] && S.batches[0].kirimRef };
    });
    const pay = bodies.find(b => b.action === 'kirim_pay');
    assert.match(pay.refId, /^K-\d+$/, "to'lov havolasi — noyob K-... (avval keyingi partiya raqami edi)");
    assert.equal(k.fkRef, pay.refId, 'partiya aynan shu to\'lovga bog\'landi (solishtirish mumkin)');
    assert.equal(k.kirimRef, pay.refId);
    // Kassalar → Baza bilan hisob-kitob: qarzni qaytarish — server rad etsa hech narsa o'zgarmaydi
    const r = await page.evaluate(async () => {
      Object.assign(S, { branch: 'f729', cashboxes: [{ id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 100 }], cashTxns: [] });
      document.body.insertAdjacentHTML('beforeend', fkBranchCardHtml());
      await fkLoadBranchCard();
      const card = document.getElementById('kas-baza-card').textContent;
      fkLoanOpen('repay'); document.getElementById('fkl-amt').value = '20';
      await fkLoanSubmit('repay');
      const afterFail = S.cashboxes[0].bal;
      return { card, afterFail };
    });
    assert.match(r.card, /Tovar qarzi/); assert.match(r.card, /50/);
    assert.equal(r.afterFail, 100, 'server rad etdi — filial kassasi o\'zgarmadi');
    loanMode = 'ok';
    const ok = await page.evaluate(async () => { await fkLoanSubmit('repay'); return S.cashboxes[0].bal; });
    assert.equal(ok, 80, 'qoldiq server javobidan');
    const keys = bodies.filter(b => b.action === 'branch_loan_repay').map(b => b.idemKey);
    assert.equal(new Set(keys).size, 1, 'qayta urinishda bir xil kalit');
  });
}

// ── 7. Sotuvchi portali: qarz to'lovi fail-close ──
async function testSellerDebtPayFailClose() {
  let saved = null; const seen = [];
  const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'application/javascript' : 'text/html' }); s.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--no-sandbox'] });
  const server = { settings: { usdUzs: 12800 }, products: [],
    branchStore: { f702: { sales: [], customers: [{ id: 77, name: 'Ali', debt: 300000 }], cashboxes: [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 1000 }], batches: [] } } };
  let legacyMode = 'fail';
  try {
    const ctx = await browser.newContext();
    await ctx.addInitScript({ content: supabaseStub({ loggedIn: true }) });
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.includes('/functions/app-data-load')) return json(route, 200, { data: JSON.parse(JSON.stringify(server)) });
      if (u.includes('/functions/staff-whoami')) return json(route, 200, { staff: { id: 9, name: 'Sotuvchi', filial: 'f702', active: true, role: 'sotuvchi' } });
      if (u.includes('/functions/cashbox-ops')) { seen.push('ops'); return json(route, 200, { ok: true, authority: false }); }
      if (u.includes('/functions/customer-debt-payment-add')) { seen.push('legacy'); return legacyMode === 'fail' ? route.abort('failed') : json(route, 200, { ok: true }); }
      if (u.includes('/functions/app-data-save')) { saved = JSON.parse(route.request().postData()).data; return json(route, 200, { ok: true }); }
      if (u.includes('/functions/')) return json(route, 200, {});
      if (u.startsWith(`http://127.0.0.1:${port}/`)) return route.continue();
      if (u.includes('cdn.jsdelivr.net')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      return route.abort('failed');
    });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/sotuvchi.html`); await page.waitForTimeout(1500);
    const run = () => page.evaluate(async () => {
      document.body.insertAdjacentHTML('beforeend', '<select id="sv-pay-box"><option value="1" selected>N</option></select><input id="sv-pay-amt" value="100000"><button id="svb"></button>');
      await svConfirmPay(77, document.getElementById('svb'));
      document.getElementById('sv-pay-box').remove(); document.getElementById('sv-pay-amt').remove(); document.getElementById('svb').remove();
      return { debt: S.customers[0].debt, bal: S.cashboxes[0].bal };
    });
    let r = await run();
    assert.deepEqual(r, { debt: 300000, bal: 1000 }, "sotuvchi: server yozuvi o'tmadi (tarmoq) — qarz va kassa o'zgarmadi");
    assert.deepEqual(seen, ['ops', 'legacy']);
    legacyMode = 'ok';
    r = await run();
    assert.deepEqual(r, { debt: 200000, bal: 101000 }, 'server tasdiqladi — to\'lov qabul qilindi');
    assert.deepEqual(errs, []);
  } finally { await browser.close(); srv.close(); }
}

module.exports = {
  name: 'P16 — v23: brauzer — fail-close to\'lovlar, diller qarzi serverdan, hamkorlar filial bo\'yicha, Telegram, Kirim havolasi, filial qarzi',
  cases: [
    { name: "Mijoz qarz to'lovi: tarmoq/rad/eski yozuv xatosi — hech narsa o'zgarmaydi; record bilan", run: testPayDebtFailClose },
    { name: "Ta'minotchi to'lovi va kunlik yopish: fail-close, qoldiqdan ortiq jimgina qisqartirilmaydi", run: testSupplierAndHomeWithdrawal },
    { name: "Diller to'lovi: qarz va kassa serverdan, eski yo'llar ishlatilmaydi", run: testDealerPayServerDebt },
    { name: 'Hamkorlar har bir filialda alohida; Baza hamkorlari va oylari daxlsiz', run: testPartnersPerBranch },
    { name: "Telegram: token ko'rsatilmaydi, sinov serverdan, bo'sh maydon tokenni o'chirmaydi", run: testTelegramUi },
    { name: "Kirim → Firma kassa: partiya K-havola bilan bog'lanadi; filial qarzini qaytarish fail-close", run: testKirimRefAndBranchLoanUi },
    { name: "Sotuvchi portali: qarz to'lovi fail-close", run: testSellerDebtPayFailClose },
  ],
};
