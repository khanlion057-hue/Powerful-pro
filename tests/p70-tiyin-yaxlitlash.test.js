// P70 — v25 (egasi qarori): TIYIN YAXLITLIGI. So'mdagi savdo jami pastga, 100 so'mgacha yaxlitlanadi
// (17 975 → 17 900); qoldiq chegirmaga yoziladi. v25.1 (egasi qoidasi): HAR DOIM pastga — tannarxga yaqin narxda ham
// (foyda yaxlitlash farqicha kam chiqadi, tannarx o'zgarmaydi); $ savdoda yoki sozlama o'chiq bo'lsa yaxlitlanmaydi.
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;

const seed = () => {
  S.products = [{ id: 1, sku: 'KG-1', name: 'Mix', cat: 'Qurilish', markupPct: 25, unit: 'kg' }];
  S.batches = [{ id: 11, pid: 1, qty: 100, sold: 0, costUsd: 84, status: 'active', date: td() }];
  S.customers = []; S.cashboxes = [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 0 }, { id: 2, name: 'Dollar', cur: 'USD', type: 'usd', bal: 0 }];
  S.sales = []; S.cart = []; S.savdoCustId = null;
  S.settings = Object.assign(S.settings || {}, { roundingEnabled: true });
  CUR.usdUzs = 12500;
};

module.exports = {
  name: 'P70 — tiyin yaxlitligi: jami pastga 100 soʻmgacha, zararda / $ da / sozlama oʻchiqda — yoʻq',
  cases: [
    { name: 'so\'m: 328 250 → 328 200 (50 so\'m chegirma), to\'liq to\'lov aniq; har doim pastga (tannarxga yaqin ham); $, sozlama — yaxlitlanmaydi', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        const r = await page.evaluate(async (seedSrc) => {
          eval(seedSrc)(); try { localStorage.removeItem('fw_pos_prefs_admin'); } catch (_) {}
          go('savdo'); POS.mode = 'retail'; POS.cur = 'UZS';
          posAdd(1); posSetQty(S.cart[0].key || S.cart[0].pid, '0.25');
          if (Math.abs((+S.cart[0].qty) - 0.25) > 1e-9) S.cart[0].qty = 0.25;
          const out = {};
          const t = posTotals(); out.a = { sub: t.subN, round: t.roundN, tot: t.totN, disc: t.discN };
          posOpen('pay'); posPaySet(posTotals().needN);
          const c = posBuildCtx(); out.ctx = { st: c.status, reason: c.discountReason, totN: c.totalN, usdOk: Math.abs(c.totalUsd * 12500 - c.totalN) < 1 };
          // v25.1: tannarxga juda yaqin narx — baribir pastga yaxlitlanadi (har doim)
          S.cart[0].sellUsd = 84.0003; { const tl = posTotals(); out.loss = { round: tl.roundN, tot: tl.totN, cost: Math.round(tl.cost * 12500) }; }
          // $ savdo — yaxlitlanmaydi
          S.cart[0].sellUsd = 105.13; POS.cur = 'USD'; out.usd = posTotals().roundN; POS.cur = 'UZS';
          // Sozlama o'chiq
          S.settings.roundingEnabled = false; out.off = posTotals().roundN; S.settings.roundingEnabled = true;
          return out;
        }, `(${seed.toString()})`);
        assert.equal(r.a.sub % 100, 50, 'boshlang\'ich summa 100 ga karrali emas: ' + r.a.sub);
        assert.equal(r.a.round, 50); assert.equal(r.a.tot, r.a.sub - 50); assert.equal(r.a.tot % 100, 0);
        assert.equal(r.a.disc, 50, 'qoldiq chegirmaga');
        assert.equal(r.ctx.st, 'exact'); assert.equal(r.ctx.reason, 'rounding'); assert.equal(r.ctx.totN, r.a.tot); assert.ok(r.ctx.usdOk, '$ jami so\'m jami bilan mos');
        assert.ok(r.loss.round > 0 && r.loss.tot % 100 === 0, 'tannarxga yaqin narxda ham har doim pastga yaxlitlanadi (v25.1)');
        assert.equal(r.usd, 0, '$ savdoda yaxlitlanmaydi');
        assert.equal(r.off, 0, 'sozlama o\'chiq');
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
  ],
};
