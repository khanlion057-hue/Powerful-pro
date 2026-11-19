// P107 — v25.6.9: investor hisoboti — yillik davr «2025-2026», kelishilgan foiz
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;
async function run() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const r = await page.evaluate(() => {
      const [a, b, l] = prtRange('year', '', '2026'); S.partners = [{ id: 77, name: 'Test inv', invested: 100, keepPct: 40, isFounder: false, filial: S.branch }];
      const p = brPartners().find(x => !x.isFounder) || brPartners()[0];
      PRT.mode = 'year'; PRT.y = '2026'; PRT.pid = p.id;
      const h = partnerReportHtml(p.id);
      return { a, b, l, isF: !!p.isFounder, html: h.html, file: h.file, title: h.title };
    });
    assert.deepEqual([r.a, r.b, r.l], ['2025-01-01', '2026-12-31', '2025-2026']);
    assert.match(r.title, /2025-2026/); assert.match(r.file, /2025-2026/);
    if (!r.isF) assert.match(r.html, /Kelishilgan foiz/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
module.exports = { name: 'P107 — Investor hisoboti', cases: [{ name: 'yillik davr 2025-2026; kelishilgan foiz', run }] };
