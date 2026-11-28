// P119 — v25.6.9: eski sana bilan savdo va kirim (faqat administrator; kelajak va yopilgan oy — yo'q)
const assert = require('node:assert/strict');
const fs = require('fs');
const { openPage } = require('./p4-responsive.test.js')._helpers;
async function admin() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const r = await page.evaluate(async () => {
      const toasts = []; window.toast = (m) => toasts.push(m);
      const y = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10), fut = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
      const o = { allowed: fwBackdateAllowed(), past: fwBackdateCheck(y), future: fwBackdateCheck(fut) };
      S.partnerPeriods = [{ id: 'p1', filial: S.branch, start: y, end: y, rows: [] }];
      o.closed = fwBackdateCheck(y); S.partnerPeriods = [];
      o.field = !!fwBackdateField('x', '');
      // savdo oynasi: sana maydoni
      go('savdo'); posAdd(S.products[0].id); posOpen('pay'); o.posDate = !!document.getElementById('pos-date');
      document.getElementById('pos-date').value = y; document.getElementById('pos-date').dispatchEvent(new Event('change')); o.saleDate = POS.saleDate;
      o.toasts = toasts; return { o, y };
    });
    assert.equal(r.o.allowed, true); assert.equal(r.o.past, true); assert.equal(r.o.future, false, 'kelajak — yo\'q'); assert.equal(r.o.closed, false, 'yopilgan oy — yo\'q');
    assert.equal(r.o.field, true); assert.equal(r.o.posDate, true, 'to\'lov oynasida sana'); assert.equal(r.o.saleDate, r.y);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
async function server() {
  const src = fs.readFileSync(require.resolve('../netlify/functions/sale-checkout-atomic.js'), 'utf8');
  assert.match(src, /d > today\) return null; return d === today \|\| auth\.isAdmin \? d : today/, 'serverda: kelajak — yo\'q, eski sana — faqat admin');
}
module.exports = { name: 'P119 — Eski sana bilan savdo va kirim', cases: [{ name: 'administrator: sana maydoni, kelajak va yopilgan oy rad', run: admin }, { name: 'server: eski sana faqat admin, kelajak yoʻq', run: server }] };
