// P111 — v25.6.9: filial guruhiga tovar kirimi va o'tkazma xabarlari; oy yakuni hisoboti
const assert = require('node:assert/strict');
const T = require('../netlify/functions/_lib/tgEvents.js');
const sent = []; global.fetch = async (url, o) => { const b = JSON.parse(o.body); sent.push({ chat: String(b.chat_id), text: b.text }); return { json: async () => ({ ok: true }) }; };
const st = { tgBotToken: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abc', tgChatId: '-100', tgBranchChats: { baza: '-201', f729: '-202' }, branchNames: { baza: 'Baza', f729: '729-filial' } };
const admin = { from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { data: { settings: st, products: [{ id: 1, name: 'Disk 350' }, { id: 2, name: 'Arra' }] } } }) }) };
async function run() {
  await T.notifyStockIn(admin, { filial: 'f729', reason: 'kirim', batches: [{ pid: 1, qty: 10, costUsd: 5 }, { pid: 2, qty: 3, costUsd: 7 }], staffName: 'Ali' });
  assert.deepEqual(sent.map((x) => x.chat).sort(), ['-100', '-202'], 'filial guruhi + egasi');
  assert.match(sent[0].text, /Tovar kirimi/); assert.match(sent[0].text, /Disk 350/); assert.doesNotMatch(sent[0].text, /\$|cost|5\.00|7\.00/, 'narx/tannarx yo\'q');
  sent.length = 0; await T.notifyStockIn(admin, { filial: 'baza', reason: 'opening', batches: [{ pid: 1, qty: 1 }] }); assert.equal(sent.length, 0, 'boshlang\'ich qoldiq xabar qilinmaydi');
  await T.notifyTransfer(admin, { kind: 'tr_ship', filial: 'baza', payload: { to: 'f729', items: [{ pid: 1, qty: 4 }] }, staffName: 'Ega' });
  const byChat = {}; sent.forEach((x) => { byChat[x.chat] = (byChat[x.chat] || 0) + 1; });
  assert.deepEqual(byChat, { '-201': 1, '-100': 1, '-202': 1 }, 'ikkala filial guruhi + egasi (takrorsiz)');
  assert.match(sent.find((x) => x.chat === '-202').text, /jo'natildi/i);
}
module.exports = { name: 'P111 — Guruh: kirim va oʻtkazma', cases: [{ name: 'kirim/oʻtkazma xabarlari: guruhlar, maxfiylik (narx yoʻq), takrorsiz', run }] };
