// P84 — v25.1 Telegram hodisa xabarlari (egasi talabi): nasiya savdo guruhga (ism, telefon, mahsulotlar, qaytarish sanasi),
// qaytarish kuni eslatmasi, mijoz/diller to'lovlari, diller oldi-berdisi, oy yakuni dillerlar hisoboti.
// Telegram'ga HECH NARSA chiqmaydi — global.fetch soxta (faqat qayd qilinadi).
const assert = require('node:assert/strict');
const ev = require('../netlify/functions/_lib/tgEvents');

const TOKEN = '123456789:FAKE_test_token_not_real_xxxx';
const BASE_ST = { tgBotToken: TOKEN, tgChatId: '-1001112223334', usdUzs: 12000, branchNames: { baza: 'Asosiy ombor' } };

// Soxta Supabase: app_data (settings), app_data_branches (mijozlar), customer_balances, dealers
function fakeAdmin({ st = BASE_ST, branch = {}, custDebt = null, dealer = null } = {}) {
  const tables = {
    app_data: { data: { settings: st, branchStore: { baza: branch } } },
    app_data_branches: { data: branch },
    customer_balances: custDebt == null ? null : { debt: custDebt },
    dealers: dealer,
  };
  return { from(t) { const q = { select: () => q, eq: () => q, gte: () => q, lt: () => q, order: () => q, maybeSingle: async () => ({ data: tables[t] ?? null, error: null }) }; return q; } };
}
function captureFetch() {
  const sent = [];
  const prev = global.fetch;
  global.fetch = async (url, opt) => { sent.push({ url: String(url), body: JSON.parse(opt.body) }); return { json: async () => ({ ok: true }) }; };
  return { sent, restore: () => { global.fetch = prev; } };
}

const ITEMS = [{ pid: 1, name: 'Arra tigʻi 300×30×96T', qty: 2, sellUsd: 45 }, { pid: 2, name: 'Freza D12 <spiral>', qty: 1, sellUsd: 30 }];

async function testCreditText() {
  const { text, debt } = ev.creditSaleText({ st: BASE_ST, filial: 'baza', cust: { name: 'Ali Valiyev', phone: '+998901234567' }, items: ITEMS,
    discPct: 0, paidUsd: 20, creditUseUzs: 0, rate: 12000, dueDate: '2026-11-21', dueDays: 10, inv: 'INV-12', staffName: 'Admin', custDebtUzs: 1440000 });
  assert.equal(Math.round(debt * 100) / 100, 100, 'qarz = 120 − 20');
  assert.match(text, /Nasiya savdo<\/b> · INV-12/);
  assert.match(text, /Ali Valiyev/); assert.match(text, /\+998901234567/); assert.match(text, /Asosiy ombor · Admin/);
  assert.match(text, /Arra tigʻi 300×30×96T\n  2 × \$45 +\$90\n/, 'mahsulot, miqdor × narx = summa');
  assert.match(text, /Freza D12 &lt;spiral&gt;/, 'HTML ekranlangan');
  assert.match(text, /Qarzga: <b>\$100 · 1 200 000 so'm<\/b>/);
  assert.match(text, /Qaytarish sanasi: <b>21\.11\.2026<\/b> \(10 kun\)/);
  assert.match(text, /umumiy qarzi: <b>1 440 000 so'm<\/b>/);
  const rows = [...text.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].flatMap(m => m[1].split('\n')).map(l => l.replace(/&lt;|&gt;|&amp;/g, 'x'));
  assert.ok(rows.every(l => l.length <= 30), 'telefonga sigʻadi');
}

async function testCreditNotify() {
  const branch = { customers: [{ id: 7, name: 'Ali', phone: '+998901234567', debt: 1200000 }] };
  // yoqiq — bitta xabar asosiy guruhga
  let f = captureFetch();
  try {
    await ev.notifyCreditSale(fakeAdmin({ branch, custDebt: 1200000 }), { filial: 'baza', custId: 7, items: ITEMS, paidUsd: 0, dueDate: '2026-11-21', dueDays: 10 });
    assert.equal(f.sent.length, 1); assert.match(f.sent[0].url, /sendMessage$/); assert.equal(f.sent[0].body.chat_id, '-1001112223334');
    assert.equal(f.sent[0].body.parse_mode, 'HTML'); assert.match(f.sent[0].body.text, /Ali/);
  } finally { f.restore(); }
  // to'liq to'langan — nasiya emas, yuborilmaydi
  f = captureFetch();
  try { await ev.notifyCreditSale(fakeAdmin({ branch }), { filial: 'baza', custId: 7, items: ITEMS, paidUsd: 120 }); assert.equal(f.sent.length, 0); } finally { f.restore(); }
  // sozlamada o'chirilgan — yuborilmaydi
  f = captureFetch();
  try { await ev.notifyCreditSale(fakeAdmin({ st: { ...BASE_ST, tgEvt: { credit: false } }, branch }), { filial: 'baza', custId: 7, items: ITEMS, paidUsd: 0 }); assert.equal(f.sent.length, 0); } finally { f.restore(); }
  // token yo'q — yuborilmaydi, xato ham tashlamaydi
  f = captureFetch();
  try { await ev.notifyCreditSale(fakeAdmin({ st: { ...BASE_ST, tgBotToken: '' }, branch }), { filial: 'baza', custId: 7, items: ITEMS, paidUsd: 0 }); assert.equal(f.sent.length, 0); } finally { f.restore(); }
  // Telegram yiqilsa ham xato tashlamaydi (savdo bekor qilinmasligi uchun)
  const prev = global.fetch; global.fetch = async () => { throw new Error('tarmoq yoʻq'); };
  try { await ev.notifyCreditSale(fakeAdmin({ branch }), { filial: 'baza', custId: 7, items: ITEMS, paidUsd: 0 }); } finally { global.fetch = prev; }
}

async function testPaymentsAndDealers() {
  const branch = { customers: [{ id: 7, name: 'Ali', phone: '+998901234567' }] };
  let f = captureFetch();
  try {
    await ev.notifyCustomerPayment(fakeAdmin({ branch }), { filial: 'baza', customerId: 7, amount: 500000, currency: 'UZS', debtAfterUzs: 700000 });
    await ev.notifyCustomerPayment(fakeAdmin({ branch }), { filial: 'baza', customerId: 7, amount: 700000, currency: 'UZS', debtAfterUzs: 0 });
    assert.match(f.sent[0].body.text, /Qarz toʻlovi[\s\S]*500 000 so'm[\s\S]*700 000 so'm/);
    assert.match(f.sent[1].body.text, /Qarz toʻliq yopildi/, "to'liq to'langanda alohida belgi");
  } finally { f.restore(); }
  // diller — alohida guruh (tgDealerChats), bo'lmasa asosiy
  const dealer = { id: 3, name: 'Diller Samarqand', phone: '+998935551122', region: 'Samarqand', debt_usd: 450 };
  f = captureFetch();
  try {
    const admin = fakeAdmin({ st: { ...BASE_ST, tgDealerChats: ['@powerful_dillerlar'] }, dealer });
    await ev.notifyDealerOp(admin, { kind: 'ship', mode: 'debt', dealerId: 3, items: [{ pid: 1, name: 'Arra tigʻi', qty: 10, priceUsd: 45 }], filial: 'baza' });
    await ev.notifyDealerOp(admin, { kind: 'ship', mode: 'consign', dealerId: 3, items: [{ pid: 1, name: 'Arra tigʻi', qty: 5 }], filial: 'baza' });
    await ev.notifyDealerPayment(admin, { dealerId: 3, amountUsd: 450, debtAfterUsd: 0, filial: 'baza' });
    assert.equal(f.sent.length, 3); assert.ok(f.sent.every(s => s.body.chat_id === '@powerful_dillerlar'));
    assert.match(f.sent[0].body.text, /qarzga berildi[\s\S]*10 × \$45 +\$450\n[\s\S]*Jami +\$450<\/pre>[\s\S]*Diller qarzi: <b>\$450<\/b>/);
    assert.match(f.sent[1].body.text, /sotish uchun[\s\S]*Arra tigʻi +×5/);
    assert.match(f.sent[2].body.text, /Diller qarzi toʻliq yopildi/);
  } finally { f.restore(); }
  f = captureFetch();
  try { await ev.notifyDealerOp(fakeAdmin({ dealer }), { kind: 'return', dealerId: 3, items: [{ pid: 1, name: 'X', qty: 1 }], filial: 'baza' }); assert.equal(f.sent[0].body.chat_id, '-1001112223334', 'diller guruhi yoʻq — asosiy guruh'); } finally { f.restore(); }
}

async function testReminder() {
  const date = '2026-11-21';
  const data = { branchStore: { baza: {
    customers: [{ id: 1, name: 'Ali', phone: '+998901', debt: 1200000 }, { id: 2, name: 'Vali', debt: 500000 }, { id: 3, name: 'Gani', debt: 0 }, { id: 4, name: 'Soli', debt: 300000 }],
    sales: [
      { custId: 1, debtUsd: 100, dueDate: '2026-11-21' },            // bugun
      { custId: 2, debtUsd: 40, dueDate: '2026-11-15' },             // 6 kun kechikkan
      { custId: 3, debtUsd: 10, dueDate: '2026-11-10' },             // qarzi yopilgan — chiqmaydi
      { custId: 4, debtUsd: 30, dueDate: '2026-12-01' },             // hali muddati bor — chiqmaydi
      { custId: 2, debtUsd: 5, dueDate: '2026-11-20', status: 'cancelled' } ] } } };
  const list = ev.dueList(data, date);
  assert.deepEqual(list.map(x => x.name), ['Vali', 'Ali']);
  const t = ev.remindText({ branchNames: {} }, list, date);
  assert.match(t, /Bugun toʻlash kerak \(1\)[\s\S]*Ali[\s\S]*1 200 000 so'm/);
  assert.match(t, /Muddati oʻtgan \(1\)[\s\S]*Vali[\s\S]*6 kun kechikdi \(15\.11\.2026\)/);
  assert.match(t, /Jami: <b>1 700 000 so'm<\/b>/);
}


// ── Maxfiylik: har filial va har dillerning O'Z guruhi ──
async function testOwnGroups() {
  const st = { ...BASE_ST, tgBranchChats: { baza: '-1009990001', f729: '-1009990002' }, tgDealerChatMap: { 3: '-1008880003', 4: '-1008880004' } };
  // chatsFor: filial — o'zi + egasi; boshqa filial guruhi YO'Q
  assert.deepEqual(ev.chatsFor(st, 'credit', { filial: 'f729' }), ['-1009990002', '-1001112223334']);
  assert.ok(!ev.chatsFor(st, 'credit', { filial: 'f729' }).includes('-1009990001'), 'boshqa filial guruhiga yuborilmaydi');
  // diller — o'zi + egasi; boshqa diller guruhi YO'Q
  assert.deepEqual(ev.chatsFor(st, 'dealer', { dealerId: 4 }), ['-1008880004', '-1001112223334']);
  // egasiga nusxa o'chirilgan — faqat o'z guruhi
  const st2 = { ...st, tgEvt: { copyMain: false } };
  assert.deepEqual(ev.chatsFor(st2, 'dealer', { dealerId: 3 }), ['-1008880003']);
  // o'z guruhi yo'q — egasiga (nusxa o'chiq bo'lsa ham xabar yo'qolmaydi)
  assert.deepEqual(ev.chatsFor(st2, 'credit', { filial: 'f99' }), ['-1001112223334']);
  // haqiqiy yuborish: diller 3 jo'natmasi — diller 4 guruhiga bormaydi
  const dealer = { id: 3, name: 'Diller A', debt_usd: 10 };
  const f = captureFetch();
  try {
    await ev.notifyDealerOp(fakeAdmin({ st, dealer }), { kind: 'ship', dealerId: 3, items: [{ pid: 1, name: 'X', qty: 1 }], filial: 'baza' });
    assert.deepEqual(f.sent.map(x => x.body.chat_id).sort(), ['-1001112223334', '-1008880003']);
  } finally { f.restore(); }
  // eslatma filiallarga bo'linadi
  const parts = ev.dueByBranch([{ filial: 'baza', name: 'A' }, { filial: 'f729', name: 'B' }, { filial: 'baza', name: 'C' }]);
  assert.deepEqual(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.map(x => x.name)])), { baza: ['A', 'C'], f729: ['B'] });
}

async function testMonthPerDealer() {
  const rows = { dealers: [{ id: 3, name: 'Diller A', debt_usd: 100, active: true }, { id: 4, name: 'Diller B', debt_usd: 50, active: true }],
    dealer_stock_moves: [{ dealer_id: 3, type: 'send', qty: 10, cost_usd: 20 }, { dealer_id: 4, type: 'send', qty: 1, cost_usd: 5 }, { dealer_id: 3, type: 'return', qty: 2, cost_usd: 20 }],
    dealer_payments: [{ dealer_id: 3, amount_usd: 60 }], dealer_pay_notices: [{ dealer_id: 4, amount_usd: 7, status: 'accepted' }, { dealer_id: 4, amount_usd: 99, status: 'rejected' }] };
  const admin = { from(t) { const q = { select: () => q, gte: () => q, lt: () => q, order: () => q, then: (ok) => Promise.resolve({ data: rows[t] || [], error: null }).then(ok) }; return q; } };
  const rep = await ev.monthDealerReports(admin, {}, '2026-10');
  assert.match(rep.overview, /Dillerlar — oktabr 2026 yakuni[\s\S]*Diller A[\s\S]*Diller B[\s\S]*Jami olgan +\$205/);
  const a = rep.perDealer.find(x => x.dealerId === 3).text, b = rep.perDealer.find(x => x.dealerId === 4).text;
  assert.match(a, /Diller A — oktabr 2026[\s\S]*Olgan \(tannarx\) +\$200[\s\S]*Qaytargan +\$40[\s\S]*Toʻlagan +\$60[\s\S]*qarz +\$100/);
  assert.doesNotMatch(a, /Diller B/, 'diller A hisobotida boshqa diller yoʻq');
  assert.match(b, /Toʻlagan +\$7(\n|<)/, 'rad etilgan toʻlov hisoblanmaydi'); assert.doesNotMatch(b, /Diller A/);
}

module.exports = {
  name: 'P84 — Telegram hodisa xabarlari: nasiya, eslatma, toʻlovlar, diller oldi-berdisi',
  cases: [
    { name: 'Nasiya xabari: ism, telefon, mahsulotlar, qarz ($ va soʻm), qaytarish sanasi, umumiy qarz; ustunlar tekis', run: testCreditText },
    { name: 'Nasiya yuborish: faqat qarz boʻlsa; oʻchiq/tokensiz — yoʻq; Telegram xatosi savdoni toʻxtatmaydi', run: testCreditNotify },
    { name: 'Mijoz va diller toʻlovlari (toʻliq yopilsa belgi), diller joʻnatmasi (qarzga/sotish uchun) — dillerlar guruhiga', run: testPaymentsAndDealers },
    { name: 'Eslatma: bugun va muddati oʻtganlar; qarzi yopilgan, muddati kelmagan, bekor qilingan — chiqmaydi', run: testReminder },
    { name: 'Maxfiylik: filial/diller xabari faqat oʻz guruhiga (+ egasiga nusxa); boshqasiga — yoʻq; eslatma filiallarga boʻlinadi', run: testOwnGroups },
    { name: 'Oy yakuni: egasiga umumiy jadval, har dillerga faqat oʻzi (olgan, qaytargan, toʻlagan, qarz)', run: testMonthPerDealer },
  ],
};
