// P32 — v24.4: YOPIQ OY QOIDASI (egasi qarori 2026-10-14) — haqiqiy js/main.js + js/shell.js, Chromium.
//  • Foydasi taqsimlangan OXIRGI oyga yozuv: ogohlantirish → tasdiq → yozuv → oy foydasi FARQ qadar o'zgaradi,
//    hamkor hisoblariga faqat farq yoziladi, taqsimot qayta yopiladi (qayta hisoblash tarixi saqlanadi).
//  • Undan ESKI yopiq oyga — taqiq (yozuv kiritilmaydi). Rad etilsa — hech narsa o'zgarmaydi.
//  • Moliyaviy amallar (savdo, tahrir, o'chirish, qaytarish, xarajat, hisobdan chiqarish) tekshiruvga ulangan.
//  • Yopilgandan keyingi o'zgarish (masalan, sotuvchi portalidan) — Hamkorlar bo'limida eslatma va qayta hisoblash.
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;

async function testClosedMonth() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const r = await page.evaluate(async () => {
      // v24.5: tekshiruv asinxron (egasining paroli bilan; bulutsiz/emailsiz — oddiy tasdiq)
      save = () => {}; let answer = true; const asked = []; window.confirm = (m) => { asked.push(m); return answer; };
      const toasts = []; const ot = toast; toast = (m, t) => { toasts.push(m); };
      S.branch = 'baza'; S.partnerPeriods = []; S.expenses = [];
      S.partners = [{ id: 1, name: 'Ali', invested: 1000, isFounder: true }, { id: 2, name: 'Vali', invested: 1000, isFounder: false }];
      S.sales = [{ id: 1, date: '2026-08-10', totalUsd: 300, profitUsd: 100, items: [] }, { id: 2, date: '2026-09-10', totalUsd: 300, profitUsd: 200, items: [] }];
      const close = (ym) => { const { start, end } = monthRange(ym); const tp = calcProfitForRange(start, end);
        const res = computePartnerDistribution(partnersForMonth(ym), tp, 0); res.rows.forEach(x => { const p = brPartner(x.pid); if (p) p.invested = x.jamiSumma; });
        const per = { id: uid(), filial: 'baza', month: ym, start, end, totalProfit: tp, totalInvested: res.totalInvested, rows: res.rows, tasischiExpense: 0, keptTotal: res.keptTotal, calcBase: tp, createdAt: '' };
        S.partnerPeriods = sortPartnerPeriods([per, ...S.partnerPeriods]); return per; };
      close('2026-08'); await new Promise(r => setTimeout(r, 5)); const sep = close('2026-09');
      const inv0 = S.partners.map(p => p.invested), sum0 = inv0[0] + inv0[1];
      // 1) oxirgi yopiq oy (sentyabr): xarajat 50$ — ogohlantirish, qayta hisoblash
      let g = await fwClosedMonthCheck(['2026-09-20'], 'xarajat');
      const warn = asked.at(-1);
      S.expenses.push({ id: 9, date: '2026-09-20', amtUsd: 50, turi: 'dokon' });
      fwReclosePeriod(g, 'xarajat');
      const per = brPeriods()[0], inv1 = S.partners.map(p => p.invested), prof1 = per.totalProfit, rc1 = per.recalcs.length, d1 = per.recalcs[0].delta;
      // 2) eski yopiq oy (avgust) — taqiq
      const old = await fwClosedMonthCheck(['2026-08-15'], 'xarajat');
      // 3) rad etilsa — hech narsa
      answer = false; const no = await fwClosedMonthCheck(['2026-09-21'], 'xarajat'); answer = true;
      // 4) ochiq oy (oktyabr) — so'ralmaydi
      const n0 = asked.length; const open = await fwClosedMonthCheck(['2026-10-02'], 'xarajat'); const askedOpen = asked.length !== n0;
      // 5) yopilgandan keyingi o'zgarish (tekshiruvsiz yo'l) — eslatma va tuzatish
      S.sales.push({ id: 3, date: '2026-09-25', totalUsd: 40, profitUsd: 30, items: [] });
      const drift = fwPeriodDrift(); go('hamkorlar'); const banner = !!document.querySelector('.fw-drift');
      fwPeriodDriftFix(); const drift2 = fwPeriodDrift();
      toast = ot;
      return { warn, ok: g.ok, prof: prof1, recalcs: rc1, delta: d1, sum0, sum1: inv1[0] + inv1[1],
        old: old.ok, oldMsg: toasts.find(t => /Avgust/.test(t)) || '', no: no.ok, open: open.ok, askedOpen, drift: drift && drift.delta, banner, drift2,
        prof2: brPeriods()[0].totalProfit, aug: brPeriods()[1].totalProfit,
        wrapped: ['_savdoCommit', 'saveSaleEdit', 'deleteSale', 'doSaleReturn', 'addExpense', 'deleteExpenseRow', 'woCommit', 'woCancel'].filter(n => !(window[n] && window[n]._fwMonth)) };
    });
    assert.match(r.warn, /Sentabr 2026 foydasi hamkorlarga taqsimlangan/); assert.match(r.warn, /taqsimoti bekor qilinadi.*taqsimot qayta yopiladi/s);
    assert.equal(r.ok, true); assert.equal(r.prof, 150, 'oy foydasi 200 − 50'); assert.equal(r.recalcs, 1); assert.equal(r.delta, -50);
    assert.ok(Math.abs((r.sum1 - r.sum0) - (-50)) < 0.02, `hamkorlar hisobiga faqat farq (−50): ${r.sum1 - r.sum0}`);
    assert.equal(r.old, false, 'eski yopiq oy — taqiq'); assert.match(r.oldMsg, /keyingi oylar taqsimotini bekor qiling/);
    assert.equal(r.no, false, 'rad etildi'); assert.equal(r.open, true); assert.equal(r.askedOpen, false, "ochiq oyda so'ralmaydi");
    assert.equal(r.drift, 30, 'yopilgandan keyingi o\'zgarish'); assert.equal(r.banner, true, 'Hamkorlarda eslatma'); assert.equal(r.drift2, null, 'tuzatildi');
    assert.equal(r.prof2, 180, '150 + 30'); assert.equal(r.aug, 100, "avgust o'zgarmadi");
    assert.deepEqual(r.wrapped, [], 'barcha moliyaviy amallar tekshiruvga ulangan');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

module.exports = {
  name: "P32 — v24.4: yopiq oy — oxirgi oy qayta hisoblanadi, eski oy taqiq, yopilgandan keyingi o'zgarish eslatmasi",
  cases: [
    { name: "Oxirgi yopiq oy: ogohlantirish, farq qadar qayta yopiladi; eski oy — taqiq; rad — o'zgarishsiz; eslatma va tuzatish; amallar ulangan", run: testClosedMonth },
  ],
};
