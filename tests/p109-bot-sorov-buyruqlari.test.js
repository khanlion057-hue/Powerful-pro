// P109 — v25.6.9: Telegram bot so'rov buyruqlari (sof funksiyalar)
const assert = require('node:assert/strict');
const Q = require('../netlify/functions/_lib/botQuery.js');
const data = { settings: { usdUzs: 12500, branchNames: { f729: '729-filial' } }, products: [{ id: 1, name: 'Disk 350', sku: 'D1', minStock: 5 }, { id: 2, name: 'Arra', sku: 'A1', minStock: 1 }],
  dealers: [{ name: 'Ali', debt: 120 }],
  branchStore: {
    baza: { sales: [{ date: '2026-11-05', totalUsd: 100, profitUsd: 30 }, { date: '2026-10-30', totalUsd: 999, profitUsd: 999 }, { date: '2026-11-06', totalUsd: 50, profitUsd: 10, status: 'void' }],
      expenses: [{ date: '2026-11-07', cat: 'Ijara', amtUsd: 20 }, { date: '2026-11-08', cat: 'Yoʻl', amtUsd: 5 }],
      customers: [{ name: 'Vali', debt: 125000 }], suppliers: [{ name: 'Chin', debt: 40 }], cashboxes: [{ name: 'Naqd', cur: 'UZS', bal: 1000000, type: 'cash' }, { name: 'Shaxsiy', cur: 'USD', bal: 9, type: 'qobiljon' }],
      batches: [{ pid: 1, qty: 10, sold: 7 }, { pid: 2, qty: 3, sold: 0 }] },
    f729: { sales: [{ date: '2026-11-09', totalUsd: 40, profitUsd: 8 }], expenses: [], customers: [], suppliers: [], cashboxes: [], batches: [] } } };
const O = { today: '2026-11-18' };
async function run() {
  const f = Q.foyda(data, 'oy', O);
  assert.match(f, /Bu oy/); assert.match(f, /JAMI foyda\s+\$38/); assert.match(f, /SOF FOYDA\s+\$13/);   // 30+8 − 25
  assert.doesNotMatch(f, /999/);   // o'tgan oy va bekor qilingan savdo kirmaydi
  const onlyF = Q.foyda(data, 'oy', { ...O, filial: 'f729' });
  assert.doesNotMatch(onlyF, /Baza/); assert.match(onlyF, /\$8/);
  assert.match(Q.xarajat(data, 'oy', O), /Ijara\s+\$20/); assert.match(Q.xarajat(data, 'oy', O), /Jami \(2 ta\)\s+\$25/);
  assert.match(Q.qarz(data, O), /Mijozlar bizga\s+\$10/); assert.match(Q.qarz(data, O), /Dillerlar/);
  assert.doesNotMatch(Q.qarz(data, { ...O, filial: 'f729' }), /Dillerlar/);
  assert.doesNotMatch(Q.kassa(data, O), /Shaxsiy/); assert.match(Q.kassa(data, O), /1 000 000 som/);
  const ob = Q.ombor(data, { ...O, filial: 'baza' }); assert.match(ob, /Disk 350\s+3\.00/); assert.doesNotMatch(ob, /Arra/);
  assert.match(Q.mahsulot(data, 'disk', { ...O, filial: 'baza' }), /3\.00 dona/); assert.match(Q.mahsulot(data, 'x'), /yozing/);
  for (const t of [f, Q.xarajat(data, 'oy', O), Q.qarz(data, O), Q.kassa(data, O), Q.ombor(data, O)]) assert.ok(!/[^\x00-\x7F]/.test(t.replace(/[📈💸🧾💰📦]/gu, '')), 'faqat ASCII (emoji bundan mustasno)');
  assert.deepEqual(Q.parsePeriod('otgan', '2026-11-18'), { start: '2026-10-01', end: '2026-10-31', label: 'Otgan oy' });
  assert.equal(Q.PERM.foyda, 'hisobot.view');
}
module.exports = { name: 'P109 — Bot soʻrov buyruqlari', cases: [{ name: 'foyda/xarajat/qarz/kassa/ombor/mahsulot: davr, filial cheklovi, ASCII', run }] };
