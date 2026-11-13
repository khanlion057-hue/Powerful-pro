// P35 — v24.5: YANGI SAVDO OYNASI (admin + sotuvchi bitta modul js/pos.js), egasi qoidalari, navigatsiya, diller, hujjatlar.
// Haqiqiy js/main.js (Chromium, telefon o'lchami). Server — sale-checkout-atomic SOXTA (bu yerda faqat brauzer qoidalari;
// serverdagi ortiqcha to'lov / haq / to'lov tekshiruvi — P34 haqiqiy PostgreSQL bilan).
//  • To'lov summasi kiritilmaguncha yopilmaydi; teng — «Naqd savdo»; kam/ko'p — mijoz majburiy; ortiqcha → overpay.
//  • So'mda narx eng yaqin 1 000 ga (107 200 → 107 000; 107 500 → 108 000); kassaga tushgan so'm = chekdagi so'm.
//  • Chakana/Optom va UZS/USD — alohida; kechiktirilgan cheklar; yangi mijoz (ism + telefon majburiy).
//  • «Orqaga» — bitta qadam; brauzer tarixi o'smaydi (10 ta bo'lim — tarix uzunligi o'zgarmaydi).
//  • «Yangi qo'shish» — to'liq oyna, saqlangach chaqirgan joyda tanlanadi; Excel — faqat bosh qoldiq (shablon + fayl).
//  • Hujjat oynasi (PDF/yuborish/chop etish), «Xavfli hudud» yo'q, skaner sozlamasi.
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;

const seed = () => {
  S.products = [
    { id: 1, sku: 'PG-1002', name: 'Makita perforator', cat: 'Perforator', markupPct: 25, unit: 'dona' },
    { id: 2, sku: 'DK-1', name: 'Disk', cat: 'Disk', markupPct: 25, unit: 'dona' },
  ];
  S.batches = [{ id: 11, pid: 1, qty: 10, sold: 0, costUsd: 84, status: 'active', date: td() }, { id: 12, pid: 2, qty: 50, sold: 0, costUsd: 0.6, status: 'active', date: td() }];
  S.customers = [{ id: 501, name: 'Ali', phone: '+998901112233', debt: 0 }];
  S.cashboxes = [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 0 }, { id: 2, name: 'Karta', cur: 'UZS', type: 'card', bal: 0 }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 0 }];
  S.sales = []; S.cart = []; S.savdoCustId = null;
  CUR.usdUzs = 12500;
};

async function testPosRules() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const r = await page.evaluate(async (seedSrc) => {
      eval(seedSrc)(); try { localStorage.removeItem('fw_pos_prefs_admin'); } catch (_) {}
      go('savdo'); POS.mode = 'retail'; POS.cur = 'UZS';
      const out = {};
      // Yaxlitlash: 84 × 1.25 = 105 $ → 1 312 500 so'm → 1 313 000; disk 0.6×1.25=0.75 → round(0.75)=1 $ → 12 500 → 13 000
      posAdd(1); posAdd(2);
      out.units = POS.a.cart().map(i => posLineUnitN(i));
      out.r1 = [fwRound1000(107200), fwRound1000(107500), fwRound1000(10500), fwRound1000(10499)];
      const t = posTotals(); out.totN = t.totN;
      // Summa kiritilmagan — yopilmaydi
      posOpen('pay'); out.empty = { dis: document.getElementById('pos-finish').disabled, txt: document.getElementById('pos-finish').textContent };
      // Teng — Naqd savdo
      posPaySet(t.needN); out.exact = { dis: document.getElementById('pos-finish').disabled, msg: document.getElementById('pos-pay-st').textContent };
      // Kam — mijoz majburiy
      posPaySet(1000000); out.short = { dis: document.getElementById('pos-finish').disabled, need: document.getElementById('pos-pay-cust').classList.contains('need') };
      // Ko'p — mijoz majburiy; mijoz bilan — overpay konteksti
      posPaySet(1400000); out.over1 = document.getElementById('pos-finish').disabled;
      S.savdoCustId = 501; posPayGate(); out.over2 = document.getElementById('pos-finish').disabled;
      const ctx = posBuildCtx(); out.ctx = { box: ctx.boxPayments, ov: ctx.overpay, paidUsd: Math.round(ctx.paidUsd * 100) / 100, totalUsd: Math.round(ctx.totalUsd * 100) / 100, pay: ctx.payType, rounded: ctx.roundedTotalUzs };
      // Qarzga (0) — mijoz bilan → debt
      posPaySet(0); const c0 = posBuildCtx(); out.debt = { pay: c0.payType, box: c0.boxPayments.length, debt: Math.round(c0.debtUsd * 100) / 100 };
      // Chekka chegirma (summa) — jami kamayadi
      POS.disc = { type: 'sum', val: 13000 }; out.disc = posTotals().totN;
      POS.disc = { type: 'sum', val: 0 };
      // Server soxta — yozish
      const sent = [];
      authFetch = async (url, o) => { const b = JSON.parse(o.body); sent.push(b); const total = b.items.reduce((s, i) => s + i.qty * i.sellUsd, 0) * (1 - (b.discPct || 0) / 100);
        return { ok: true, json: async () => ({ ok: true, ledger: true, localId: b.saleLocalId, inv: b.inv, totalUsd: total, debtUsd: Math.max(0, total - b.paidUsd), costUsd: 84.6, profitUsd: total - 84.6, balances: {}, custDebtUzs: 0, custCreditUzs: 87000 }) }; };
      _cloudEnabled = true; fwApplyLedger = () => {}; save = () => {};
      posPaySet(1400000); await posFinish();
      out.sent = sent.map(b => ({ ov: b.overpay, box: b.boxPayments, cust: b.custId }));
      out.sale = (() => { const s = S.sales[S.sales.length - 1]; return s && { inv: s.inv, cur: s.cur, rounded: s.roundedTotalUzs, ov: s.overpayUzs }; })();
      out.credit = S.customers[0].credit; out.cartAfter = S.cart.length;
      return out;
    }, `(${seed.toString()})`);
    assert.deepEqual(r.r1, [107000, 108000, 11000, 10000], 'eng yaqin mingga (500 — yuqoriga)');
    assert.deepEqual(r.units, [1313000, 13000], 'narxlar 1 000 ga yaxlit');
    assert.equal(r.totN, 1326000);
    assert.equal(r.empty.dis, true, 'summa kiritilmaguncha — yopilmaydi'); assert.match(r.empty.txt, /summani kiriting/i);
    assert.equal(r.exact.dis, false); assert.match(r.exact.msg, /Naqd savdo/);
    assert.equal(r.short.dis, true, 'kam — mijozsiz yopilmaydi'); assert.equal(r.short.need, true);
    assert.equal(r.over1, true, "ko'p — mijozsiz yopilmaydi"); assert.equal(r.over2, false, 'mijoz bilan — yopiladi');
    assert.deepEqual(r.ctx.box, [{ box_id: 1, amount_native: 1326000, cur: 'UZS' }], 'kassaga — chek summasi');
    assert.deepEqual(r.ctx.ov, { box_id: 1, amount_native: 74000, cur: 'UZS' }, 'ortiqcha — alohida (mijoz qarzi/haqi)');
    assert.equal(r.ctx.paidUsd, r.ctx.totalUsd); assert.equal(r.ctx.pay, 'cash_uzs'); assert.equal(r.ctx.rounded, 1326000);
    assert.deepEqual(r.debt, { pay: 'debt', box: 0, debt: 106.08 });
    assert.equal(r.disc, 1313000);
    assert.equal(r.sent.length, 1); assert.deepEqual(r.sent[0].ov, { box_id: 1, amount_native: 74000 }); assert.equal(r.sent[0].cust, 501);
    assert.deepEqual(r.sale, { inv: 'INV-0001', cur: 'UZS', rounded: 1326000, ov: 74000 });
    assert.equal(r.credit, 87000, 'mijoz haqi — serverdan'); assert.equal(r.cartAfter, 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function testHeldModesCustomer() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const r = await page.evaluate(async (seedSrc) => {
      eval(seedSrc)(); try { localStorage.removeItem('fw_pos_held_admin'); } catch (_) {}
      go('savdo'); POS.mode = 'retail'; POS.cur = 'UZS';
      const out = {};
      posAdd(2); posAdd(2);
      out.uzs = posTotals().totN;
      posSetCurT('USD'); out.usd = posTotals().totN;           // 2 × 1 $
      posSetMode('wholesale'); out.opt = posTotals().totN;      // optom 0.6×1.15=0.69
      posSetMode('retail'); posSetCurT('UZS');
      posHold(); out.afterHold = { cart: S.cart.length, held: posHeld().length };
      posOpen('held'); out.heldTxt = document.getElementById('pos-ov').textContent.replace(/\s+/g, ' ');
      posUnhold(posHeld()[0].id); out.back = { cart: S.cart.length, held: posHeld().length, top: POS.stack[POS.stack.length - 1] };
      // Yangi mijoz: ism + telefon majburiy
      posOpen('cust');
      document.getElementById('pos-nc-n').value = 'Vali'; document.getElementById('pos-nc-p').value = '+998 90';
      await posCustCreate(); out.badPhone = S.customers.length;
      document.getElementById('pos-nc-p').value = '+998 90 765 43 21'; await posCustCreate();
      out.newCust = { n: S.customers.length, sel: S.savdoCustId === S.customers[1].id, phone: S.customers[1].phone };
      posCloseAll();
      return out;
    }, `(${seed.toString()})`);
    assert.equal(r.uzs, 26000); assert.equal(r.usd, 2); assert.equal(r.opt, 1.38);
    assert.deepEqual(r.afterHold, { cart: 0, held: 1 }); assert.match(r.heldTxt, /Kassaga qaytarish/);
    assert.deepEqual(r.back, { cart: 1, held: 0, top: 'cart' });
    assert.equal(r.badPhone, 1, "telefon to'liq bo'lmasa — saqlanmaydi");
    assert.deepEqual(r.newCust, { n: 2, sel: true, phone: '+998907654321' });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function testNavHistoryAndForms() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const len0 = await page.evaluate(() => history.length);
    for (const pg of ['savdo', 'mahsulotlar', 'kirim', 'mijozlar', 'kassalar', 'ombor', 'hisobot', 'xarajatlar', 'taminotchilar', 'dokon']) {
      await page.evaluate((p) => { go('dashboard'); go(p); }, pg);
    }
    await page.evaluate(() => go('dashboard')); await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ len: history.length, stack: SHELL.nav.stack.length, back: FW_BACK.length, xs: document.querySelectorAll('.fw-x').length }));
    assert.ok(r.len <= len0 + 1, `brauzer tarixi o'smadi (${len0} → ${r.len})`);
    assert.equal(r.stack, 0); assert.equal(r.back, 0);
    // ichma-ich: 2 qadam — «Orqaga» birma-bir
    await page.evaluate(() => { go('kassalar'); go('firmakassa'); }); await page.waitForTimeout(200);
    await page.goBack(); await page.waitForTimeout(400); assert.equal(await page.evaluate(() => S.page), 'kassalar');
    await page.goBack(); await page.waitForTimeout(400); assert.equal(await page.evaluate(() => S.page), 'dashboard');
    // «Yangi qo'shish» — to'liq oyna, saqlangach chaqirgan joyda tanlanadi
    const f = await page.evaluate(async () => {
      go('kirim'); S.kirimFormOpen = true; pgKirim(); suppSelectNew('Yiwu Tools');
      const t = document.querySelector('#modal-ov .modal-title').textContent, v = document.getElementById('ns-n').value;
      await saveSupp(); const sel = S.suppliers.find(s => s.id === S.kirimSuppId);
      // Excel — faqat bosh qoldiq: shablon + fayl
      openExcelImportModal(); const ex = document.querySelector('#modal-ov').textContent;
      const fields = ['ei-cur', 'ei-supp', 'ei-freight', 'ei-customs', 'ei-customs-method'].filter(id => document.getElementById(id)).length; closeModal();
      return { t, v, sel: sel && sel.name, ex, fields };
    });
    assert.match(f.t, /Yangi ta'minotchi/); assert.equal(f.v, 'Yiwu Tools'); assert.equal(f.sel, 'Yiwu Tools', 'saqlangach kirimda tanlandi');
    assert.match(f.ex, /bosh qoldiq/i); assert.match(f.ex, /Shablonni yuklab olish/); assert.equal(f.fields, 1, "faqat ta'minotchi tanlovi (v24.6), valyuta/xarajat maydonlari yo'q");
    // Sozlamalar: «Xavfli hudud» yo'q, skaner va zaxira bor
    const st = await page.evaluate(() => { go('sozlamalar'); return document.getElementById('pg-sozlamalar').textContent; });
    assert.doesNotMatch(st, /Xavfli hudud|Test rejimi|Xavfsizlik PIN/); assert.doesNotMatch(st, /\d+ mahsulot · \d+ savdo/);
    assert.match(st, /Skaner/); assert.match(st, /Zaxirani Telegram botga yuborish/); assert.match(st, /Zaxiradan tiklash/);
    // Hujjat oynasi: chek — ilova ichida, PDF / chop etish tugmalari, skriptlar ishlamaydi
    const d = await page.evaluate(async () => {
      S.sales = [{ id: 7, inv: 'INV-0007', date: td(), cur: 'UZS', custName: 'Anonim', items: [{ name: 'Disk', sku: 'DK', qty: 2, sellUsd: 1.04 }], totalUsd: 2.08, roundedTotalUzs: 26000, rateUsdUzs: 12500, paidUsd: 2.08, debtUsd: 0, discUsd: 0 }];
      printReceipt(7); await new Promise(r => setTimeout(r, 300));
      const ov = document.getElementById('fw-doc-ov'); const fr = document.getElementById('fw-doc-frame');
      const body = fr.contentDocument.body.textContent.replace(/\s+/g, ' ');
      const w = fwDocWin(); w.document.write('<html><head><title>Hisobot X</title></head><body>ok<script>window.__ran=1<\/script></body></html>'); w.document.close();
      await new Promise(r => setTimeout(r, 200));
      return { tools: ov ? [...document.querySelectorAll('.fw-doc-tools button')].map(b => b.textContent) : [], body, title: document.querySelector('#fw-doc-ov .pos-hd-t b').textContent, ran: !!window.__ran };
    });
    assert.ok(d.tools.includes('PDF yuklab olish') && d.tools.includes('Chop etish'));
    assert.match(d.body, /26 000 soʻm/); assert.match(d.body, /Disk\s*DK(?:\s*DK)?\s*2\s*x\s*13 000\s*26 000/);   // v25.2 (chek dizayni): ustunlar Mahsulot | Soni | Narxi | Summa; SKU — ustunda yoki ixcham rejimda nom ostida (bittasi CSS bilan yashirin)
    assert.equal(d.title, 'Hisobot X'); assert.equal(d.ran, false, "hujjat ichidagi skript ishlamaydi");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

// «Ikki qavat X bo'lmasin» — har qanday holatda ekranda faqat bitta X ko'rinadi
async function testSingleX() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'css', 'design-system.css'), 'utf8');
    await page.addStyleTag({ content: css });
    const vis = () => page.evaluate(() => [...document.querySelectorAll('.fw-x,.kr-add-x,.bs-x,.modal-close,.pos-ib[aria-label="Yopish"]')].filter(b => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b); return r.width > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }).length);
    const steps = [["go('ombor')", 1], ['openAddProduct()', 1], ['closeModal()', 1], ["go('sozlamalar');stBackupSheet()", 1], ['closeSheet();openAddCust();stScanSheet()', 1], ["closeSheet();closeModal();go('kirim');kirimScrollToForm()", 1],
      ["go('savdo');S.products=[{id:9,name:'T',sku:'T'}];S.batches=[{id:'b',pid:9,qty:5,sold:0,costUsd:1,status:'active',date:'2026-01-01'}];posAdd(9);posOpen('cart')", 1], ["posOpen('disc')", 1]];
    for (const [js, n] of steps) { await page.evaluate(js); await page.waitForTimeout(350); assert.equal(await vis(), n, `bitta X: ${js}`); }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

// Zaxira nusxa: maxfiy kalitsiz; manzilini faqat administrator o'zgartiradi
async function testBackupSecurity() {
  const path = require('path'); const zlib = require('zlib');
  const L = (f) => require(path.join(__dirname, '..', 'netlify', 'functions', '_lib', f));
  const g = L('appDataGuard.js'), { buildBackup, backupFile } = L('backupBuild.js');
  const ex = { settings: { company: 'A', tgBackupChat: '111', tgBackupDaily: false } };
  const staff = g.filterTopLevelChanges({ existing: ex, incoming: { settings: { company: 'B', tgBackupChat: '999', tgBackupDaily: true, tgBackupHour: 3 } }, permKeys: new Set(['sozlamalar.edit']), isAdmin: false, filial: 'baza' });
  // v25.1 (egasi talabi): filial xodimi umumiy sozlamalarni («company» ham) o'zgartira olmaydi — faqat egasi
  assert.equal(staff.allowed.settings, undefined, "xodim (sozlamalar.edit bilan ham) umumiy sozlamani va zaxira manzilini o'zgartira olmaydi");
  const adm = g.filterTopLevelChanges({ existing: ex, incoming: { settings: { company: 'B', tgBackupChat: '999', tgBackupDaily: true } }, permKeys: new Set(), isAdmin: true, filial: 'baza' });
  assert.equal(adm.allowed.settings.tgBackupChat, '999', 'administrator — oʻzgartiradi');
  // buildBackup: tokenlar/PIN'lar va diller parol xeshlari faylga tushmaydi
  const tables = { app_data: [{ id: 'main', data: { settings: { company: 'A', tgBotToken: '123:SECRET', shopBotToken: 'x', appPin: '1111', branchPin: '2', tgBackupChat: '111' }, products: [{ id: 1 }] } }],
    app_data_branches: [{ branch_key: 'baza', data: { sales: [{ id: 1 }], customers: [{ id: 1 }, { id: 2 }] } }],
    dealers: [{ id: 1, name: 'D', password_hash: 'h', pin_hash: 'p', auth_user_id: 'u' }] };
  const q = (t) => { const rows = tables[t]; const o = { select: () => o, eq: () => o, range: async () => (rows ? { data: rows, error: null } : { data: null, error: { code: '42P01', message: `relation "${t}" does not exist` } }),
    maybeSingle: async () => ({ data: rows && rows[0], error: null }), then: (r, j) => Promise.resolve(rows ? { data: rows, error: null } : { data: null, error: { code: '42P01', message: 'x' } }).then(r, j) }; return o; };
  const bk = await buildBackup({ from: q });
  const txt = zlib.gunzipSync(backupFile(bk, true)).toString();
  assert.doesNotMatch(txt, /SECRET|tgBotToken|shopBotToken|appPin|branchPin|password_hash|pin_hash|auth_user_id/, "zaxirada maxfiy kalit yo'q");
  assert.deepEqual(bk.counts, { products: 1, branches: 1, sales: 1, customers: 2 });
  assert.equal(bk.ledger.dealers[0].name, 'D');
}

module.exports = {
  name: "P35 — v24.5: savdo oynasi (to'lov qoidalari, 1 000 ga yaxlit, ortiqcha → mijoz haqi), kechiktirilgan cheklar, navigatsiya, forma, hujjat",
  cases: [
    { name: "Summa majburiy; teng — Naqd savdo; kam/ko'p — mijoz majburiy; ortiqcha — alohida; 1 000 ga yaxlit; chegirma; yozish", run: testPosRules },
    { name: 'UZS/USD va Chakana/Optom alohida; kechiktirilgan chek → kassaga; yangi mijoz (ism + telefon majburiy)', run: testHeldModesCustomer },
    { name: "«Orqaga» — 1 qadam, tarix o'smaydi; yangi ta'minotchi to'liq oynada va kirimda tanlanadi; Excel — bosh qoldiq; xavfli hudud yo'q; hujjat oynasi", run: testNavHistoryAndForms },
    { name: "Ikki qavat X yo'q — oyna ustida oyna ochilsa ham ekranda bitta X", run: testSingleX },
    { name: "Zaxira nusxa: tokenlar, PIN'lar va parol xeshlarisiz; zaxira manzilini faqat administrator o'zgartiradi", run: testBackupSecurity },
  ],
};
