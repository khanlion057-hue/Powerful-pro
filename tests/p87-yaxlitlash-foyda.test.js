// P87 — v25.1 (egasi qoidasi): SO'M YAXLITLASH va FOYDA.
//  1) narx — eng yaqin 1 000 (yarmi tepaga): 12 400 → 12 000; 12 500 → 13 000
//  2) savat jami — har doim PASTGA, 100: 17 975 → 17 900; 17 999 → 17 900; 17 900 → 17 900
//  3) jami — chegirma/foizdan KEYIN; 4) farq — «Yaxlitlash chegirmasi» alohida qator; 5) butun so'm; 6) qadamlar — sozlamada
//  7) savdoda: asl_jami, yaxlitlash_chegirmasi, tolangan_jami; 8–10) tushum = to'langan, tannarx o'zgarmaydi, foyda = to'langan − tannarx
//  12) davr hisobotida «Yaxlitlash chegirmalari jami»
const assert = require('node:assert/strict');
const R = require('../js/fw-round.js');
const { loadApp } = require('./helpers/load-app');

async function testRules() {
  // 1) narx
  assert.equal(R.roundPrice(12400, 1000), 12000); assert.equal(R.roundPrice(12500, 1000), 13000);
  assert.equal(R.roundPrice(12499, 1000), 12000); assert.equal(R.roundPrice(999, 1000), 1000); assert.equal(R.roundPrice(0, 1000), 0);
  // 2) jami — har doim pastga
  assert.equal(R.roundTotalDown(17975, 100), 17900); assert.equal(R.roundTotalDown(17999, 100), 17900); assert.equal(R.roundTotalDown(17900, 100), 17900);
  assert.equal(R.roundTotalDown(99, 100), 0); assert.equal(R.roundTotalDown(-5, 100), 0);
  // 3–4) chegirmadan KEYIN: 18 000 − 25 chegirma = 17 975 → 17 900, farq 75
  assert.deepEqual(R.cartTotals(18000, 25, 100), { asl_jami: 17975, yaxlitlash_chegirmasi: 75, tolangan_jami: 17900 });
  // foiz chegirma: 20 000 − 10% (2 000) = 18 000 → yaxlitlash 0
  assert.deepEqual(R.cartTotals(20000, 2000, 100), { asl_jami: 18000, yaxlitlash_chegirmasi: 0, tolangan_jami: 18000 });
  // 5) butun son — kasr kirsa ham natija butun
  const f = R.cartTotals(17975.6, 0.4, 100);
  assert.ok([f.asl_jami, f.yaxlitlash_chegirmasi, f.tolangan_jami].every(Number.isInteger)); assert.equal(f.tolangan_jami, 17900);
  // 6) qadamlar — sozlamadan; noto'g'ri qiymat — standart; o'chiq — 1
  assert.deepEqual(R.steps({}), { enabled: true, price: 1000, total: 100 });
  assert.deepEqual(R.steps({ roundPriceStep: 500, roundTotalStep: 50 }), { enabled: true, price: 500, total: 50 });
  assert.deepEqual(R.steps({ roundPriceStep: 333, roundTotalStep: 'x' }), { enabled: true, price: 1000, total: 100 });
  assert.deepEqual(R.steps({ roundingEnabled: false }), { enabled: false, price: 1, total: 1 });
  assert.equal(R.roundPrice(12250, 500), 12500); assert.equal(R.roundTotalDown(17975, 50), 17950);
}

async function testProfit() {
  // Misol: tannarx 15 000, asl jami 17 975, to'langan 17 900 → foyda 2 900, yaxlitlash chegirmasi 75
  const t = R.cartTotals(17975, 0, 100);
  assert.equal(t.tolangan_jami, 17900); assert.equal(t.yaxlitlash_chegirmasi, 75);
  assert.equal(R.profit(t.tolangan_jami, 15000), 2900, 'foyda = toʻlangan − tannarx');
  assert.equal(R.profit(t.asl_jami, 15000) - R.profit(t.tolangan_jami, 15000), 75, 'foyda yaxlitlash farqicha kam');
  // tannarx o'zgarmaydi — foyda funksiyasi tannarxga hech narsa qo'shmaydi/ayirmaydi
  assert.equal(R.profit(17900, 15000) + 15000, 17900);
  // 12) davr jami; bekor qilingan va dollar savdosi hisobga olinmaydi; eski savdo — maydonlardan
  const sales = [{ asl_jami: 17975, yaxlitlash_chegirmasi: 75, tolangan_jami: 17900 }, { asl_jami: 50050, yaxlitlash_chegirmasi: 50, tolangan_jami: 50000 },
    { asl_jami: 1099, yaxlitlash_chegirmasi: 99, tolangan_jami: 1000, status: 'voided' }, { cur: 'USD', totalUsd: 10 }, { roundedTotalUzs: 30000, discountReason: 'manual' }];
  assert.equal(R.periodRoundingTotal(sales), 125);
}

async function testPosAndReceipt() {
  const { browser, page } = await loadApp({});
  try {
    const r = await page.evaluate(() => {
      CUR.usdUzs = 12500; S.settings = { ...(S.settings || {}), roundingEnabled: true };
      S.products = [{ id: 1, sku: 'A', name: 'Arra tigʻi', cat: 'Arra', unit: 'dona', markupPct: 25 }];
      S.batches = [{ id: 'b1', pid: 1, qty: 10, sold: 0, costUsd: 1.2, date: '2026-01-01', status: 'active' }];   // tannarx 15 000 so'm
      S.customers = []; S.cashboxes = [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 0 }]; S.cart = []; S.sales = [];
      posInit(POS_ADMIN); POS.mode = 'retail'; POS.cur = 'UZS';
      const out = {};
      out.price = [fwRound1000(18750), fwRound1000(12400), fwRound1000(12500)];   // narx qadami sozlamadan (standart 1 000)
      S.cart = [{ pid: 1, sku: 'A', name: 'Arra tigʻi', qty: 1, sellUsd: 19000 / 12500, costUsd: 1.2, lineUsd: 19000 / 12500 }];   // 19 000 so'm, tannarx 15 000
      POS.disc = { type: 'sum', val: 1025 };                                      // 19 000 − 1 025 = 17 975 → 17 900
      const t = posTotals(); out.t = { sub: t.subN, asl: t.aslN, round: t.roundN, tot: t.totN, disc: t.discN };
      out.ints = [t.subN, t.aslN, t.roundN, t.totN].every(Number.isInteger);
      out.cartHtml = (typeof posCartHtml === 'function' ? posCartHtml() : document.body.innerHTML);
      POS.pay = { type: 'cash', amount: String(t.totN), mix: [] };
      const ctx = posBuildCtx(); out.ctx = { asl: ctx.asl_jami, y: ctx.yaxlitlash_chegirmasi, tol: ctx.tolangan_jami, rounded: ctx.roundedTotalUzs, err: ctx.err || null,
        profitUzs: Math.round(ctx.profitUsd * 12500), costUzs: Math.round(ctx.costUsd * 12500) };
      // qadamlar sozlamadan: jami 50 → 17 950
      S.settings.roundTotalStep = 50; out.step50 = posTotals().totN; delete S.settings.roundTotalStep;
      // o'chiq — yaxlitlanmaydi
      S.settings.roundingEnabled = false; out.off = posTotals().totN; S.settings.roundingEnabled = true;
      // chek: alohida qatorlar
      const sale = { inv: 'INV-1', date: '2026-11-11', cur: 'UZS', rateUsdUzs: 12500, items: [{ name: 'Arra tigʻi', qty: 1, sellUsd: 19000 / 12500 }],
        totalUsd: 17900 / 12500, roundedTotalUzs: 17900, asl_jami: 17975, yaxlitlash_chegirmasi: 75, tolangan_jami: 17900, paidUsd: 17900 / 12500, payType: 'cash_uzs' };
      out.receipt = fwReceiptHtml(sale, { brand: 'PG' });
      out.fields = fwSaleRoundFields(ctx);
      return out;
    });
    assert.deepEqual(r.price, [19000, 12000, 13000], 'narx — eng yaqin ming (yarmi tepaga)');
    assert.deepEqual(r.t, { sub: 19000, asl: 17975, round: 75, tot: 17900, disc: 1100 }, 'chegirmadan keyin 17 975 → 17 900; farq 75');
    assert.ok(r.ints, 'hammasi butun soʻm');
    assert.equal(r.ctx.err, null);
    assert.deepEqual([r.ctx.asl, r.ctx.y, r.ctx.tol, r.ctx.rounded], [17975, 75, 17900, 17900], 'savdo kontekstida 3 maydon');
    assert.equal(r.ctx.costUzs, 15000, 'tannarx oʻzgarmaydi');
    assert.equal(r.ctx.profitUzs, 2900, 'foyda = 17 900 − 15 000');
    assert.equal(r.step50, 17950, 'jami qadami sozlamadan (50)'); assert.equal(r.off, 17975, 'oʻchiq — yaxlitlanmaydi');
    assert.match(r.receipt, /Chegirma:<\/span><span>−1 025 soʻm/); assert.match(r.receipt, /Yaxlitlash chegirmasi:<\/span><span>−75 soʻm/);
    assert.match(r.receipt, /JAMI:<\/span><span>17 900 soʻm/);
    assert.deepEqual(r.fields, { asl_jami: 17975, yaxlitlash_chegirmasi: 75, tolangan_jami: 17900 });
  } finally { await browser.close(); }
}

async function testServerFields() {
  // Server: brauzer yuborgan maydonlar tekshiriladi (butun, asl = to'langan + farq, farq < qadam)
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'netlify', 'functions', 'sale-checkout-atomic.js'), 'utf8');
  const fn = new Function('FWRound', src.slice(src.indexOf('function roundingFieldsOf'), src.indexOf('async function saveRoundingFields')) + '; return roundingFieldsOf;')(R);
  assert.deepEqual(fn({ asl_jami: 17975, yaxlitlash_chegirmasi: 75, tolangan_jami: 17900 }, {}), { asl_jami_uzs: 17975, yaxlitlash_chegirmasi_uzs: 75, tolangan_jami_uzs: 17900 });
  assert.equal(fn({ asl_jami: 17975, yaxlitlash_chegirmasi: 70, tolangan_jami: 17900 }, {}), null, 'yigʻindi mos emas — rad');
  assert.equal(fn({ asl_jami: 18000, yaxlitlash_chegirmasi: 100, tolangan_jami: 17900 }, {}), null, 'farq ≥ qadam — rad');
  assert.equal(fn({ asl_jami: 17975.5, yaxlitlash_chegirmasi: 75.5, tolangan_jami: 17900 }, {}), null, 'kasr — rad');
  assert.equal(fn({ asl_jami: 1000, yaxlitlash_chegirmasi: 450, tolangan_jami: 550 }, { roundTotalStep: 500 }) !== null, true, 'qadam sozlamadan (500)');
  // Migratsiya: 3 ustun va tekshiruv cheklovi
  const mig = require('fs').readFileSync(require('path').join(__dirname, '..', 'supabase-migration-47-yaxlitlash.sql'), 'utf8');
  for (const c of ['asl_jami_uzs', 'yaxlitlash_chegirmasi_uzs', 'tolangan_jami_uzs']) assert.match(mig, new RegExp(`add column if not exists ${c} bigint`));
  assert.match(mig, /asl_jami_uzs = tolangan_jami_uzs \+ yaxlitlash_chegirmasi_uzs/);
}

module.exports = {
  name: 'P87 — Soʻm yaxlitlash va foyda (egasi qoidasi)',
  cases: [
    { name: 'Qoidalar: narx 12 400→12 000, 12 500→13 000; jami pastga 17 975/17 999/17 900→17 900; chegirmadan keyin; butun soʻm; qadamlar sozlamadan', run: testRules },
    { name: 'Foyda: tannarx 15 000, asl 17 975, toʻlangan 17 900 → foyda 2 900, yaxlitlash 75; davr jami (bekor/dollar — yoʻq)', run: testProfit },
    { name: 'Savdo oynasi va chek (haqiqiy brauzer): 3 maydon, alohida «Yaxlitlash chegirmasi» qatori, tannarx oʻzgarmaydi', run: testPosAndReceipt },
    { name: 'Server: maydonlar tekshiriladi; 47-migratsiya — 3 ustun va cheklov', run: testServerFields },
  ],
};
