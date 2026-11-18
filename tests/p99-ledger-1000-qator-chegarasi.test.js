// P99 — v25.6.5: PostgREST bir so'rovda ko'pi bilan 1000 qator qaytaradi. Ledger yuklovchisi (partiyalar, savdolar, balanslar) sahifalamasdan
// o'qigani uchun: o'chirilgan qatorlar bilan jadval 1000 dan oshgach, yangi partiyalarning bir qismi «bazada yo'q» deb topilib,
// qoldig'i 0 / «Tugagan» qilib yozilar edi (prod'da 806 mahsulotdan 10 tasi «Mavjud emas», qoldiq 15 899 o'rniga 16 009).
const assert = require('node:assert/strict');
const LA = require('../netlify/functions/_lib/ledgerAuthority');
const { dbFifoCostMap } = require('../netlify/functions/_lib/pricing');

const CAP = 1000;
// soxta PostgREST: so'rovda range bo'lmasa ham, bo'lsa ham bir javobda eng ko'pi CAP qator; order bo'yicha tartiblanadi
function fakeAdmin(tables) {
  const calls = [];
  return { calls, from(t) {
    const st = { eq: [], inn: null, ord: null, rng: null };
    const q = {
      select: () => q, eq(c, v) { st.eq.push([c, v]); return q; }, in(c, v) { st.inn = [c, v]; return q; }, neq: () => q, gte: () => q, lt: () => q,
      order(c, o) { st.ord = [c, !(o && o.ascending === false)]; return q; }, range(a, b) { st.rng = [a, b]; return q; }, limit: () => q,
      then(ok, bad) {
        calls.push([t, st.rng ? st.rng.slice() : null]);
        if (!(t in tables)) return Promise.resolve({ data: null, error: { code: '42P01', message: 'relation does not exist' } }).then(ok, bad);
        let rows = tables[t].filter((r) => st.eq.every(([c, v]) => r[c] === v) && (!st.inn || st.inn[1].includes(r[st.inn[0]])));
        if (st.ord) { const [c, asc] = st.ord; rows = rows.slice().sort((x, y) => (x[c] > y[c] ? 1 : x[c] < y[c] ? -1 : 0) * (asc ? 1 : -1)); }
        const [a, b] = st.rng || [0, CAP - 1];
        return Promise.resolve({ data: rows.slice(a, Math.min(b + 1, a + CAP)), error: null }).then(ok, bad);
      } };
    return q; } };
}

const batchRow = (i, status) => ({ id: i, filial: 'baza', local_id: String(1794900000000000 + i), pid: 1000 + (i % 900), bno: '03', origin: 'Bosh qoldiq (Excel)', qty: 5, sold: 0, cost_usd: 2, status, batch_date: '2026-11-17' });

async function testLoadAll() {
  // 3224 o'chirilgan (eski) + 806 faol — jami 4030 > 1000; faollari OXIRGI id'larda
  const rows = [];
  for (let i = 1; i <= 3224; i++) rows.push(batchRow(i, 'deleted'));
  for (let i = 3225; i <= 4030; i++) rows.push(batchRow(i, 'active'));
  const sales = Array.from({ length: 1500 }, (_, i) => ({ id: i + 1, filial: 'baza', local_id: 's' + i, items: [], total_usd: 1, paid_usd: 1, debt_usd: 0, profit_usd: 0, status: 'ok' }));
  const admin = fakeAdmin({ customer_balances: [], supplier_balances: [], batches: rows, sales });
  const led = await LA.loadLedger(admin, 'baza');
  assert.equal(led.batches.size, 4030, "hamma partiya o'qildi (1000 emas)");
  assert.equal([...led.batches.values()].filter((b) => b.status === 'active').length, 806, "806 faol partiya ko'rinadi");
  assert.equal(led.sales.size, 1500, "1500 savdo ham to'liq");
  assert.ok(admin.calls.filter((c) => c[0] === 'batches').length >= 5, 'sahifalab o\'qiladi');
}

async function testNoFalseEmpty() {
  const rows = [];
  for (let i = 1; i <= 3224; i++) rows.push(batchRow(i, 'deleted'));
  for (let i = 3225; i <= 4030; i++) rows.push(batchRow(i, 'active'));
  const led = await LA.loadLedger(fakeAdmin({ customer_balances: [], supplier_balances: [], batches: rows, sales: [] }), 'baza');
  // mijoz JSON'i: 806 faol partiya (ID — raqam), hammasi serverda bor
  const client = rows.slice(3224).map((r) => ({ id: Number(r.local_id), pid: r.pid, bno: '03', qty: 5, sold: 0, costUsd: 2, status: 'active' }));
  const out = LA.overlayBranchLedger({ batches: client }, led).branch.batches;
  assert.equal(out.length, 806);
  assert.equal(out.filter((b) => b.status === 'empty' || b.qty === 0).length, 0, "hech bir partiya yolg'on «Tugagan» bo'lmaydi");
  assert.equal(out.reduce((s, b) => s + b.qty, 0), 806 * 5);
}

async function testPricing() {
  const rows = [];
  for (let i = 1; i <= 2500; i++) rows.push({ ...batchRow(i, i <= 1700 ? 'deleted' : 'active'), deleted_at: i <= 1700 ? '2026-11-17' : null });
  const pids = [...new Set(rows.map((r) => r.pid))];
  const m = await dbFifoCostMap(fakeAdmin({ batches: rows }), 'baza', pids);
  assert.ok(m.size >= 800, "tannarx xaritasi barcha mahsulotlar uchun (1000 qatorda to'xtamaydi): " + m.size);
}

module.exports = { name: "P99 — ledger: PostgREST 1000 qator chegarasi (v25.6.5)", cases: [
  { name: "4030 partiya va 1500 savdo — hammasi o'qiladi (sahifalab)", run: testLoadAll },
  { name: "yangi partiyalar yolg'on «Tugagan» (qoldiq 0) bo'lmaydi", run: testNoFalseEmpty },
  { name: "tannarx (FIFO) xaritasi ham 1000 dan oshgan jadvalda to'liq", run: testPricing },
] };
