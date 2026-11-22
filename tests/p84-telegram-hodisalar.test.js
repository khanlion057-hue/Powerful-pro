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
  assert.match(text, /Mahsulot\s+Soni\s+Summa\n-{34}\nArra tig'i 300x30x\S*\s+2\s+90\.00\n/, 'v25.6.10: jadval — Mahsulot | Soni | Summa (ASCII)');
  assert.match(text, /Freza D12 &lt;spiral&gt;/, 'HTML ekranlangan');
  assert.match(text, /QARZGA\s+100\.00<\/pre>/); assert.match(text, /Qarzga \(so'm\)\s+1 200 000/);
  assert.match(text, /Qaytarish sanasi\s+21\.11\.2026\nMuddat \(kun\)\s+10/);
  assert.match(text, /Jami qarzi \(so'm\)\s+1 440 000/);
  const rows = [...text.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].flatMap(m => m[1].split('\n')).map(l => l.replace(/&lt;|&gt;|&amp;/g, 'x'));
  assert.ok(rows.every(l => l.length <= 34), 'telefonga sigʻadi');
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
    assert.match(f.sent[0].body.text, /Qarz toʻlovi[\s\S]*Oldingi qarz\s+1 200 000\nTo'landi\s+500 000\n-{34}\nQolgan qarz\s+700 000/);
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
    assert.match(f.sent[0].body.text, /qarzga berildi[\s\S]*Mahsulot\s+Soni\s+Summa[\s\S]*\s10\s+450\.00\n-{34}\nJAMI \(1\)\s+10\s+450\.00\nDiller qarzi\s+450\.00<\/pre>/);
    assert.match(f.sent[1].body.text, /sotish uchun[\s\S]*Mahsulot\s+Soni\n-{34}\nArra tig'i\s+5/);
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
  // v25.6.10: har ma'lumot o'z ustunida — Mijoz | Telefon | Qarz | Kun; JAMI shu jadvalda, Qarz ustuni ostida
  assert.match(t, /Bugun toʻlash kerak \(1\)[\s\S]*Mijoz\s+Telefon\s+Qarz\n-{34}\nAli\s+998901\s+1 200 000\n-{34}\nJAMI \(1\)\s+1 200 000/);
  assert.match(t, /Muddati oʻtgan \(1\)[\s\S]*Mijoz\s+Telefon\s+Qarz Kun\n-{34}\nVali\s+-\s+500 000\s+6\n/);
  const lines = t.match(/<pre>([\s\S]*?)<\/pre>/g).join('\n').replace(/<\/?pre>/g, '').split('\n');
  for (const line of lines) assert.ok(line.length <= 34, 'kenglik 34: ' + line);
  // Qarz ustuni hamma qatorda bir joyda tugaydi (30-belgi): mijoz qatori ham, JAMI ham
  for (const l of lines.filter((x) => /^(Ali|JAMI)/.test(x))) assert.equal(l.length, 30, 'Qarz ustuni tekis: ' + l);
  assert.equal(lines.find((x) => /^Vali/.test(x)).indexOf('500 000') + 7, 30, 'muddati o\'tganda ham Qarz o\'sha ustunda');
  // v25.6.10: ilova bilan bir xil — eski to'langan nasiya, uzaytirilgan muddat, rad etilgan savdo soxta eslatma bermaydi
  const d2 = { settings: { usdUzs: 12500 }, branchStore: { baza: {
    customers: [{ id: 9, name: 'Bek', debt: 500000, dueOv: { 93: '2026-12-20' } }, { id: 8, name: 'Eski', debt: 200000, debtDue: '2026-11-01' }],
    sales: [
      { id: 91, custId: 9, date: '2026-01-01', debtUsd: 40, dueDate: '2026-01-15' },              // eski — qarz FIFO bo'yicha yangisiga tegishli
      { id: 92, custId: 9, date: '2026-11-10', debtUsd: 30, dueDate: '2026-11-12', status: 'voided' }, // rad etilgan
      { id: 93, custId: 9, date: '2026-11-15', debtUsd: 40, dueDate: '2026-11-18' } ] } } };      // 500 000 = 40$ x 12500, uzaytirilgan
  assert.deepEqual(ev.dueList(d2, date).map((x) => [x.name, x.due]), [['Eski', '2026-11-01']], 'faqat eski qarz muddati o\'tgani chiqadi');
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
    dealer_payments: [{ dealer_id: 3, amount_usd: 60 }, { dealer_id: 4, amount_usd: 7 }, { dealer_id: 4, amount_usd: 99 }, { dealer_id: 4, amount_usd: -99 }], dealer_pay_notices: [{ dealer_id: 4, amount_usd: 7, status: 'accepted' }, { dealer_id: 4, amount_usd: 99, status: 'rejected' }] };
  const admin = { from(t) { const q = { select: () => q, gte: () => q, lt: () => q, order: () => q, then: (ok) => Promise.resolve({ data: rows[t] || [], error: null }).then(ok) }; return q; } };
  const rep = await ev.monthDealerReports(admin, {}, '2026-10');
  assert.match(rep.overview, /Dillerlar — oktabr 2026 yakuni[\s\S]*Diller\s+Oldi\s+To'ladi\s+Qarz[\s\S]*Diller A\s+160\s+60\s+100[\s\S]*Diller B[\s\S]*JAMI\s+165\s+67\s+150/);
  const a = rep.perDealer.find(x => x.dealerId === 3).text, b = rep.perDealer.find(x => x.dealerId === 4).text;
  assert.match(a, /Diller A[\s\S]*oktabr 2026[\s\S]*Olgan \(tannarx\) +200\.00[\s\S]*Qaytargan +40\.00[\s\S]*To'lagan +60\.00[\s\S]*Hozirgi qarz +100\.00/);
  assert.doesNotMatch(a, /Diller B/, 'diller A hisobotida boshqa diller yoʻq');
  assert.match(b, /To'lagan +7\.00(\n|<)/, 'rad etilgan toʻlov hisoblanmaydi'); assert.doesNotMatch(b, /Diller A/);
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
// v25.6.10: nasiya xabaridagi qarz — bazadagi qiymat (brauzer yuborgan summa emas)
module.exports.cases.push({ name: 'Nasiya xabari: qarz bazadagi qiymatdan', run: async () => {
  const t = ev.creditSaleText({ st: { branchNames: {} }, filial: 'baza', cust: { name: 'Ali' }, items: [{ name: 'X', qty: 1, sellUsd: 100 }], paidUsd: 0, rate: 12500, serverDebtUsd: 40, serverTotalUsd: 90 });
  assert.equal(t.debt, 40); assert.match(t.text, /QARZGA\s+40\.00/);
  const t2 = ev.creditSaleText({ st: { branchNames: {} }, filial: 'baza', cust: { name: 'Ali' }, items: [{ name: 'X', qty: 1, sellUsd: 100 }], paidUsd: 0, rate: 12500, serverDebtUsd: 0, serverTotalUsd: 100 });
  assert.equal(t2.debt, 0, 'bazada qarz yo\'q — nasiya xabari yuborilmaydi');
} });
