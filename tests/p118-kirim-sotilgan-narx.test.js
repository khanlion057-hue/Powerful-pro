// P118 — v25.6.9 (egasi qarori): sotilgan kirim o'chirilmaydi — avval savdolar ko'rsatiladi (qayerda, kim); arzon tovar narxi sentgacha
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;
const pricing = require('../netlify/functions/_lib/pricing.js');
async function prices() {
  assert.equal(pricing.retailRound(0.375), 0.38, '$0.30 × 1.25 → $0.38 ($0 emas)');
  assert.equal(pricing.retailRound(1.4375), 1.44, '$1.15 × 1.25 → $1.44 (tannarxdan arzon $1 emas)');
  assert.equal(pricing.retailRound(18.88), 19, '$5 dan qimmat — butun dollar (avvalgidek)');
}
async function block() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const r = await page.evaluate(async () => {
      save = () => {}; let called = 0; window.fwLedgerCall = async () => { called++; return {}; };
      S.products.push({ id: 9001, name: 'Arra 350', sku: 'A350', unit: 'dona' });
      S.batches.push({ id: 'b9001', pid: 9001, bno: '77', qty: 10, sold: 3, costUsd: 5, status: 'active', date: td() });
      S.sales.push({ id: 's1', inv: 'INV-901', date: td(), staffName: 'Ali kassir', custName: 'Vali', items: [{ pid: 9001, qty: 3 }], status: 'done' });
      await deleteBatch('b9001');
      const sheet = document.getElementById('bs-ov').innerText;
      return { called, still: S.batches.some((b) => b.id === 'b9001'), sheet, rowBtn: !!document.querySelector('#bs-ov button[onclick*="dashShowSale"]') };
    });
    assert.equal(r.called, 0, 'serverga o\'chirish so\'rovi yuborilmadi'); assert.equal(r.still, true, 'kirim joyida');
    assert.match(r.sheet, /oʻchirib boʻlmaydi/); assert.match(r.sheet, /3 dona sotilgan/); assert.match(r.sheet, /INV-901/); assert.match(r.sheet, /Ali kassir/);
    assert.equal(r.rowBtn, true, 'savdoni bosib ochish mumkin');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
async function closedMonth() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const r = await page.evaluate(async () => {
      save = () => {}; let called = 0; window.fwLedgerCall = async () => { called++; return { restocked: [] }; };
      window.confirm = () => true;
      S.sales.push({ id: 's77', inv: 'INV-077', date: td(), items: [{ pid: 1, qty: 1 }], totalUsd: 10, status: 'done' });
      S.partnerPeriods = [{ id: 'per1', filial: S.branch, start: td().slice(0, 8) + '01', end: td(), rows: [], totalProfit: 100 }];
      await deleteSale('s77');
      const sheet = document.getElementById('bs-ov').innerText;
      return { called, sheet, still: S.sales.some((x) => x.id === 's77') };
    });
    assert.equal(r.called, 0, 'yopilgan oyda savdo serverga yuborilmadi'); assert.equal(r.still, true);
    assert.match(r.sheet, /Oy yopilgan/); assert.match(r.sheet, /taqsimotini bekor qiling/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
module.exports = { name: 'P118 — Sotilgan kirim, arzon narx', cases: [{ name: 'arzon tovar narxi sentgacha', run: prices }, { name: 'sotilgan kirim oʻchirilmaydi, savdolar (kim, qayerda) koʻrsatiladi', run: block }, { name: 'yopilgan oy: avval taqsimot bekor qilinadi, keyin savdo', run: closedMonth }] };
