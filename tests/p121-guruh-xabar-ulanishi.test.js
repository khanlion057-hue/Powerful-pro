// P121 — v25.6.10: guruh xabarlari HAQIQIY server funksiyasidan chaqiriladimi (handler → tgEvents):
//  1) kirim (stock-debt-ops batches_create) → notifyStockIn;
//  2) Bazadan filial buyurtmasini tasdiqlash (stock_out transfer) → notifyTransfer, qabul qiluvchi filial bilan;
//  3) so'rov asosida jo'natish (branch-transfer tr_ship, faqat transferId) → qabul qiluvchi filial serverdagi o'tkazmadan olinadi;
//  4) takroriy kalit (replay) — xabar yo'q.
const assert = require('node:assert/strict');
const SA = require('../netlify/functions/_lib/supabaseAdmin.js');
const LA = require('../netlify/functions/_lib/ledgerAuthority.js');
const TE = require('../netlify/functions/_lib/tgEvents.js');
const calls = [];
TE.notifyStockIn = async (a, args) => { calls.push(['in', args]); };
TE.notifyTransfer = async (a, args) => { calls.push(['tr', args]); };
let rpcData = {};
const admin = { rpc: async (fn) => ({ data: rpcData[fn] || { ok: true }, error: null }), from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null }), insert: async () => ({}) }) };
SA.getAdminClient = () => admin;
let AUTH = { ok: true, isAdmin: true, filial: 'baza', staff: { id: 1, name: 'Ega' }, permKeys: new Set() };
SA.requireStaffAuth = async () => AUTH;
LA.ledgerAuthorityOn = async () => true;
const SDO = require('../netlify/functions/stock-debt-ops.js').handler;
const BT = require('../netlify/functions/branch-transfer.js').handler;
const post = (h, b) => h({ httpMethod: 'POST', headers: { authorization: 'Bearer x' }, body: JSON.stringify(b) });

async function run() {
  let r = await post(SDO, { key: 'key-001', kind: 'batches_create', filial: 'f729', payload: { reason: 'kirim', batches: [{ localId: '11', pid: 1, qty: 5, costUsd: 2 }] } });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'in'); assert.equal(calls[0][1].filial, 'f729'); assert.equal(calls[0][1].batches[0].qty, 5);

  calls.length = 0;
  r = await post(SDO, { key: 'key-002', kind: 'stock_out', payload: { reason: 'transfer', target: 'f729', items: [{ pid: 1, qty: 2 }],
    targetBatches: [{ localId: '21', pid: 1, qty: 2, costUsd: 3 }] } });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(calls.length, 1, 'filial buyurtmasini tasdiqlashda guruhga xabar');
  assert.deepEqual([calls[0][0], calls[0][1].kind, calls[0][1].filial, calls[0][1].payload.to], ['tr', 'tr_ship', 'baza', 'f729']);

  calls.length = 0; rpcData.stock_debt_op = { replay: true };
  await post(SDO, { key: 'key-001', kind: 'batches_create', filial: 'f729', payload: { reason: 'kirim', batches: [{ localId: '11', pid: 1, qty: 5, costUsd: 2 }] } });
  assert.equal(calls.length, 0, 'takroriy kalit — xabar yo\'q');

  calls.length = 0; rpcData = { branch_transfer_op_v40: { transfer: { id: 7, no: 'T-7', from: 'baza', to: 'f729' } }, branch_transfer_op: { transfer: { id: 7, no: 'T-7', from: 'baza', to: 'f729' } } };
  r = await post(BT, { key: 'key-003', kind: 'tr_ship', payload: { transferId: 7, items: [{ pid: 1, qty: 2 }] } });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(calls.length, 1); assert.equal(calls[0][1].payload.to, 'f729', 'so\'rov asosidagi jo\'natma: qabul qiluvchi serverdagi o\'tkazmadan');
}
module.exports = { name: 'P121 — Guruh xabarlari server funksiyasidan', cases: [{ name: 'kirim, filial buyurtmasi, soʻrov boʻyicha joʻnatma, takror — xabar', run }] };
// v25.6.10: kirim sanasi serverda — kelajak yo'q, eski sana faqat administrator
async function kirimDate() {
  let sentPayload = null; admin.rpc = async (fn, a) => { if (fn === 'stock_debt_op') sentPayload = a.p_payload; return { data: {}, error: null }; };
  const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  const send = (d) => post(SDO, { key: 'key-d' + d.replace(/-/g, ''), kind: 'batches_create', payload: { reason: 'kirim', batches: [{ localId: '31', pid: 1, qty: 1, costUsd: 1, meta: { date: d } }] } });
  await send('2026-10-01'); assert.equal(sentPayload.batches[0].meta.date, '2026-10-01', 'admin — eski sana');
  await send('2099-01-01'); assert.equal(sentPayload.batches[0].meta.date, today, 'kelajak — bugun');
  AUTH = { ok: true, isAdmin: false, filial: 'f729', staff: { id: 2, name: 'Kassir' }, permKeys: new Set(['kirim.create']) };
  await send('2026-10-02'); assert.equal(sentPayload.batches[0].meta.date, today, 'xodim — eski sana qabul qilinmaydi');
  await send(today); assert.equal(sentPayload.batches[0].meta.date, today, 'xodim — bugungi sana');
}
module.exports.cases.push({ name: 'kirim sanasi serverda: kelajak yoʻq, eski sana faqat admin', run: kirimDate });
// v25.6.10: yo'ldagi partiya — kirimda xabar yo'q; «Yetib keldi» bosilganda xabar
async function transit() {
  AUTH = { ok: true, isAdmin: true, filial: 'baza', staff: { id: 1, name: 'Ega' }, permKeys: new Set() };
  admin.rpc = async () => ({ data: {}, error: null });
  admin.from = () => ({ select() { return this; }, eq() { return this; }, in() { return Promise.resolve({ data: [{ pid: 1, qty: 7 }] }); }, maybeSingle: async () => ({ data: null }), insert: async () => ({}) });
  calls.length = 0;
  await post(SDO, { key: 'key-tr1', kind: 'batches_create', payload: { reason: 'kirim', batches: [{ localId: '41', pid: 1, qty: 7, costUsd: 1, status: 'transit' }] } });
  assert.equal(calls.length, 0, 'yo\'ldagi tovar — hali xabar yo\'q');
  await post(SDO, { key: 'key-tr2', kind: 'batch_arrive', payload: { localIds: ['41'] } });
  assert.equal(calls.length, 1, 'yetib keldi — xabar'); assert.equal(calls[0][1].batches[0].qty, 7);
}
module.exports.cases.push({ name: 'yoʻldagi tovar: xabar yetib kelganda', run: transit });
