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
SA.requireStaffAuth = async () => ({ ok: true, isAdmin: true, filial: 'baza', staff: { id: 1, name: 'Ega' }, permKeys: new Set() });
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
