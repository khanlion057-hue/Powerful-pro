// P97 — v25.6: kunlik hisobotda «Dillerlar» bo'limi kengaytirildi: qarz + BUGUNGI to'lovlar + OMBOR qoldig'i (dona va $).
// Manba: dealers / dealer_payments (har to'lov — shu yerda; rad etilsa manfiy yozuv) / dealer_stock. Telegram <pre> — faqat ASCII.
const assert = require('node:assert/strict');
const { buildDailyReport } = require('../netlify/functions/_lib/dailyReport');
const run = require('../netlify/functions/_lib/dailyReportRun');
const ev = require('../netlify/functions/_lib/tgEvents');

const DATE = '2026-10-07';
const nonAscii = (html) => [...html.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].map((m) => m[1]).join('\n').split('').filter((c) => c.charCodeAt(0) > 127);
const preRows = (t) => [...t.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].flatMap((m) => m[1].split('\n')).map((l) => l.replace(/&lt;|&gt;|&amp;/g, 'x'));

function fakeAdmin(tables) {
  const calls = [];
  return { calls, from(t) {
    const f = []; const q = {
      select: () => q, order: () => q,
      gte: (c, v) => { f.push(['gte', c, v]); return q; }, lt: (c, v) => { f.push(['lt', c, v]); return q; }, gt: (c, v) => { f.push(['gt', c, v]); return q; },
      then: (ok, bad) => { calls.push([t, f.slice()]); let rows = tables[t]; if (rows === undefined) return Promise.resolve({ data: null, error: { code: '42P01', message: 'relation does not exist' } }).then(ok, bad);
        f.forEach(([op, c, v]) => { rows = rows.filter((r) => (op === 'gte' ? r[c] >= v : op === 'lt' ? r[c] < v : r[c] > v)); });
        return Promise.resolve({ data: rows, error: null }).then(ok, bad); } };
    return q; } };
}

async function testOverview() {
  const admin = fakeAdmin({
    dealers: [{ id: 1, name: 'Ali Diller', region: 'Samarqand', debt_usd: 1200, active: true }, { id: 2, name: "Vali <b>", debt_usd: 0, active: true }, { id: 3, name: 'Passiv', debt_usd: 5, active: false }],
    dealer_payments: [
      { dealer_id: 1, amount_usd: 300, created_at: '2026-10-07T04:00:00Z' },     // Toshkent 09:00 — bugun
      { dealer_id: 1, amount_usd: -100, created_at: '2026-10-07T10:00:00Z' },    // rad etilgan — teskari yozuv
      { dealer_id: 1, amount_usd: 50, created_at: '2026-10-06T18:59:59Z' },      // Toshkent 23:59:59 kecha — kirmaydi
      { dealer_id: 1, amount_usd: 70, created_at: '2026-10-06T19:00:00Z' },      // Toshkent 00:00 bugun — kiradi
      { dealer_id: 2, amount_usd: 10, created_at: '2026-10-08T19:00:00Z' }],     // ertaga — kirmaydi
    dealer_stock: [{ dealer_id: 1, qty: 10, avg_cost_usd: 20 }, { dealer_id: 1, qty: 5, avg_cost_usd: 8 }, { dealer_id: 2, qty: 0, avg_cost_usd: 9 }] });
  const r = await run.dealerOverview(admin, DATE);
  assert.deepEqual(r.map((x) => x.name), ['Ali Diller', 'Vali <b>'], 'faqat faol dillerlar');
  const a = r[0];
  assert.deepEqual({ debt: a.debt, paidToday: a.paidToday, stockQty: a.stockQty, stockUsd: a.stockUsd }, { debt: 1200, paidToday: 270, stockQty: 15, stockUsd: 240 }, "bugungi sof to'lov: 300 - 100 + 70 (Toshkent kuni); ombor: 10x20 + 5x8");
  assert.deepEqual({ paidToday: r[1].paidToday, stockQty: r[1].stockQty }, { paidToday: 0, stockQty: 0 });
  assert.equal(await run.dealerOverview(fakeAdmin({}), DATE), null, "jadval yo'q — bo'lim tushiriladi, xato emas");
}

function testSection() {
  const dealers = [{ id: 1, name: 'Ali Diller', debt: 1200, paidToday: 270, stockQty: 15, stockUsd: 240 }, { id: 2, name: "O'tkir ʻaka <b>", debt: 0, paidToday: 0, stockQty: 0, stockUsd: 0 }];
  const msgs = buildDailyReport({ settings: { usdUzs: 12500, company: 'Powerful' }, branchStore: { baza: {} } }, DATE, { firma: { USD: 1, UZS: 2 }, dealers });
  const t = msgs.join('\n---\n');
  assert.match(t, /Dillerlar<\/b>/); assert.match(t, /Diller +Qarz +Bugun +Ombor\n-{34}\nAli Diller +1 200 +270 +240\n/);   // v25.6.10: har diller bitta qator
  assert.match(t, /JAMI \(2\) +1 \d{3} +270 +240<\/pre>/);
  assert.equal(nonAscii(t).length, 0, '<pre> ichida faqat ASCII: ' + JSON.stringify(nonAscii(t)));
  assert.ok(preRows(t).every((l) => l.length <= 34), 'qatorlar telefonga sig\'adi');
  assert.ok(msgs.every((m) => m.length <= 4000));
  // juda ko'p diller — alohida xabarlarga bo'linadi, hech biri 4000 dan oshmaydi, hech bir diller yo'qolmaydi
  const many = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, name: 'Diller ' + i, debt: 100 + i, paidToday: i, stockQty: i, stockUsd: i * 2 }));
  const big = buildDailyReport({ settings: {}, branchStore: { baza: {} } }, DATE, { firma: { USD: 1, UZS: 2 }, dealers: many });
  assert.ok(big.length > 1 && big.every((m) => m.length <= 4000), 'xabarlar chegarasi: ' + big.map((m) => m.length));
  for (let i = 0; i < 120; i++) assert.ok(new RegExp('Diller ' + i + ' +' + (100 + i) + ' +' + i + ' +' + (i * 2) + '(\\n|<)').test(big.join('\n')), 'diller #' + i + ' bor');
  // eski yo'l (extra.dealers yo'q, data.dealers bor) buzilmaydi
  const old = buildDailyReport({ settings: {}, branchStore: { baza: {} }, dealers: [{ name: 'Eski', debt: 7 }] }, DATE, { firma: { USD: 1, UZS: 2 } }).join('');
  assert.match(old, /Eski +7 +0 +0\n/);
}

async function testMonthNoDoubleCount() {
  // haqiqiy tizimda har portal to'lovi (va rad etish — manfiy yozuv) dealer_payments'ga yoziladi; xabarnomalar qayta qo'shilmaydi
  const rows = { dealers: [{ id: 3, name: 'A', debt_usd: 50, active: true }],
    dealer_stock_moves: [{ dealer_id: 3, type: 'send', qty: 1, cost_usd: 100 }],
    dealer_payments: [{ dealer_id: 3, amount_usd: 7 }, { dealer_id: 3, amount_usd: 99 }, { dealer_id: 3, amount_usd: -99 }],
    dealer_pay_notices: [{ dealer_id: 3, amount_usd: 7, status: 'accepted' }, { dealer_id: 3, amount_usd: 99, status: 'rejected' }] };
  const admin = { from(t) { const q = { select: () => q, gte: () => q, lt: () => q, order: () => q, then: (ok) => Promise.resolve({ data: rows[t] || [], error: null }).then(ok) }; return q; } };
  const rep = await ev.monthDealerReports(admin, {}, '2026-10');
  const a = rep.perDealer[0].text;
  assert.match(a, /To'lagan +7\.00(\n|<)/, "7 + 99 - 99 = 7 (ikki marta sanalmaydi)");
  assert.equal(nonAscii(a).length, 0, 'oy yakuni ham faqat ASCII: ' + JSON.stringify(nonAscii(a))); assert.equal(nonAscii(rep.overview).length, 0);
  assert.ok(preRows(rep.overview).every((l) => l.length <= 34));
}

module.exports = { name: "P97 — kunlik hisobot: Dillerlar (qarz, bugungi to'lov, ombor) va ASCII (v25.6)", cases: [
  { name: "dealerOverview: Toshkent kuni, rad etish manfiy yozuv, ombor yig'indisi, jadval yo'q — null", run: testOverview },
  { name: "bo'lim: har diller 3 qatorgacha, jami; ko'p dillerda xabarlarga bo'linadi; faqat ASCII; eski yo'l buzilmaydi", run: testSection },
  { name: "oy yakuni: portal to'lovi ikki marta sanalmaydi; faqat ASCII", run: testMonthNoDoubleCount },
] };
