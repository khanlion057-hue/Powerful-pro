// P115 — v25.6.9: sotuvchi oylik/xarajat — summa tanlangan kassa valyutasida (so'm / $), 1 000 ko'rinishi, o'girilgan qiymat
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;
async function run() {
  const { browser, page, errors } = await openPage('sotuvchi.html', { width: 390, height: 844, mobile: true, loggedIn: true });
  try {
    const r = await page.evaluate(async () => {
      CUR.usdUzs = 12500;
      S.cashboxes = [{ id: 1, name: "Naqd So'm", cur: 'UZS', type: 'cash', bal: 0 }, { id: 2, name: 'Karta', cur: 'UZS', type: 'card', bal: 0 }, { id: 3, name: 'Dollar ($)', cur: 'USD', type: 'usd', bal: 0 }];
      S.salaryPeople = [{ id: 7, name: ME.name, amount: 800, cur: 'USD' }];
      SV_EXP.mode = 'salary'; ACTIVE_TAB = 'expense'; svRenderContent();
      const o = { lbl1: document.getElementById('svs-lbl').textContent, amt1: document.getElementById('svs-amt').value, conv1: document.getElementById('svs-conv').textContent };
      document.querySelector('#sv-content .sv-chips button[data-v="3"]').click();
      o.lbl2 = document.getElementById('svs-lbl').textContent; o.amt2 = document.getElementById('svs-amt').value;
      const inp = document.getElementById('svs-amt'); inp.value = '1500000'; document.querySelector('#sv-content .sv-chips button[data-v="1"]').click();
      inp.value = '1500000'; inp.dispatchEvent(new Event('input')); o.typed = inp.value; o.conv3 = document.getElementById('svs-conv').textContent;
      // oylik yozish: so'm kassadan 1 500 000 → $120
      window.fwCashOps = async () => ({}); window.svSaveShopData = () => {};
      await svTakeSalary(7); const e = S.expenses.slice(-1)[0]; o.exp = [e.cur, e.amount, Math.round(e.amtUsd)];
      return o;
    });
    assert.match(r.lbl1, /so'm/); assert.equal(r.amt1, '10 000 000', 'oylik $800 → so\'m kassada 10 000 000'); assert.match(r.conv1, /\$800/);
    assert.match(r.lbl2, /\$/); assert.equal(r.amt2, '800');
    assert.equal(r.typed, '1 500 000', 'minglik ajratgich bilan'); assert.match(r.conv3, /\$120/);
    assert.deepEqual(r.exp, ['UZS', 1500000, 120]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
module.exports = { name: 'P115 — Sotuvchi summa kassa valyutasida', cases: [{ name: 'oylik: kassa soʻm → soʻmda, $ → dollarda; 1 000 koʻrinish; oʻgirish; yozuv valyutasi', run }] };
