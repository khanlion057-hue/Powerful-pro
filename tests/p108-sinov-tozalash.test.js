// P108 — v25.6.9: dastlabki sinovni tozalash (faqat admin, parol, 6 oy), mahalliy nusxa
const assert = require('node:assert/strict');
const fs = require('fs');
const { openPage } = require('./p4-responsive.test.js')._helpers;
async function server() {
  const src = fs.readFileSync(require.resolve('../netlify/functions/trial-reset.js'), 'utf8');
  assert.match(src, /requireAdmin: true/); assert.match(src, /checkPassword/); assert.match(src, /'TOZALASH'/); assert.match(src, /addMonths\(start, 6\)/);
  const sql = fs.readFileSync(require.resolve('../supabase-migration-49-sinov-tozalash.sql'), 'utf8');
  assert.match(sql, /grant execute on function public\.fw_trial_reset\(boolean\) to service_role/);
  assert.doesNotMatch(sql, /delete from public\.(products|staff|dealers|batches)\b/);
  // JSON nusxa ham tozalanadi (boshqa filial nusxasidagi eski savdo qaytmasin)
  const { _cleanBranch } = require('../netlify/functions/trial-reset.js');
  const c = _cleanBranch({ batches: [{ qty: 10, sold: 4, status: 'active' }, { qty: 3, status: 'deleted' }, { qty: 2, sold: 0, status: 'transit' }], sales: [1], expenses: [1], cashTxns: [1], customers: [{ debt: 9 }], cashboxes: [{ bal: 5 }] });
  assert.deepEqual(c.batches.map((b) => [b.qty, b.sold, b.status]), [[10, 0, 'active'], [2, 0, 'active']]);
  assert.deepEqual([c.sales.length, c.expenses.length, c.cashTxns.length, c.customers[0].debt, c.cashboxes[0].bal], [0, 0, 0, 0, 0]);
  assert.match(src, /cleanJson\(admin\)/); assert.match(src, /version: \(Number/);
}
async function client() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const r = await page.evaluate(() => {
      save = () => {};
      S.batches = [{ id: 1, qty: 10, sold: 4, status: 'active' }, { id: 2, qty: 5, sold: 5, status: 'empty' }];
      S.sales = [{ id: 's1' }]; S.expenses = [{ id: 'e1' }]; S.customers = [{ id: 1, name: 'A', debt: 50 }];
      trialLocalReset();
      return { b: S.batches.map((b) => [b.qty, b.sold, b.status]), sales: S.sales.length, exp: S.expenses.length, cust: S.customers.map((c) => [c.name, c.debt]) };
    });
    assert.deepEqual(r.b, [[10, 0, 'active'], [5, 0, 'active']]); assert.equal(r.sales, 0); assert.equal(r.exp, 0); assert.deepEqual(r.cust, [['A', 0]]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
module.exports = { name: 'P108 — Sinovni tozalash', cases: [{ name: 'server/SQL: admin, parol, 6 oy; roʻyxatlar oʻchmaydi', run: server }, { name: 'mahalliy nusxa: kirim saqlanadi, harakatlar 0', run: client }] };
