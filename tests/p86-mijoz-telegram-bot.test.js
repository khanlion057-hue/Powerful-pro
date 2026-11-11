// P86 — v25.1: mijozni Telegram botga ulash (shaxsiy havola → «Start») va mijozning O'ZIGA eslatmalar.
// Telegram'ga HECH NARSA chiqmaydi — global.fetch soxta.
const assert = require('node:assert/strict');
const tc = require('../netlify/functions/_lib/tgCustomers');
const ev = require('../netlify/functions/_lib/tgEvents');

const TOKEN = '123456789:FAKE_test_token_not_real_xxxx';

// Soxta Supabase: app_data qatorlari (main, tg_customer_links), app_data_branches, customer_balances
function fakeDb(main, branches = {}) {
  const rows = { main: { data: main } };
  const db = {
    rows,
    from(t) {
      const f = {}; const q = {
        select: () => q, gte: () => q, lt: () => q, order: () => q, limit: () => q,
        eq: (k, v) => { f[k] = v; return q; },
        maybeSingle: async () => {
          if (t === 'app_data') return { data: rows[f.id] ? { data: rows[f.id].data } : null, error: null };
          if (t === 'app_data_branches') return { data: branches[f.branch_key] ? { data: branches[f.branch_key] } : null, error: null };
          return { data: null, error: null };
        },
        upsert: async (row) => { rows[row.id] = { data: JSON.parse(JSON.stringify(row.data)) }; return { error: null }; },
      };
      return q;
    },
  };
  return db;
}
function fakeTelegram(updates) {
  const sent = []; const prev = global.fetch;
  global.fetch = async (url, opt) => {
    const body = JSON.parse(opt.body || '{}'); const m = /\/(\w+)$/.exec(String(url))[1];
    if (m === 'getUpdates') { assert.equal(body.offset, undefined, 'getUpdates — offsetsiz (boshqa funksiyalar yangilanishlarini oʻchirmaydi)'); return { json: async () => ({ ok: true, result: updates }) }; }
    if (m === 'getMe') return { json: async () => ({ ok: true, result: { username: 'powerful_test_bot' } }) };
    sent.push({ m, body }); return { json: async () => ({ ok: true }) };
  };
  return { sent, restore: () => { global.fetch = prev; } };
}

async function testCodesAndSweep() {
  const db = fakeDb({ settings: { tgBotToken: TOKEN } });
  const a = await tc.codeFor(db, 'baza', 7), a2 = await tc.codeFor(db, 'baza', 7), b = await tc.codeFor(db, 'f729', 7);
  assert.match(a.code, /^cus[A-Za-z0-9]{12}$/); assert.equal(a.code, a2.code, 'bitta mijozga bitta kod'); assert.notEqual(a.code, b.code, 'boshqa filialdagi xuddi shu ID — boshqa kod');
  const upd = [
    { message: { chat: { id: 5551, type: 'private' }, from: { first_name: 'Ali', username: 'ali_u' }, text: '/start ' + a.code } },
    { message: { chat: { id: -100777, type: 'group' }, from: { first_name: 'X' }, text: '/start ' + b.code } },            // guruhdan — yo'q
    { message: { chat: { id: 5552, type: 'private' }, from: { first_name: 'Y' }, text: '/start cusAAAAAAAAAAAA' } },        // noma'lum kod
    { message: { chat: { id: 5553, type: 'private' }, from: { first_name: 'Z' }, text: 'salom' } },
  ];
  const t = fakeTelegram(upd);
  try {
    const n = await tc.sweep(db, TOKEN, 'POWERFUL GROUP', async () => 'Ali Valiyev');
    assert.equal(n, 1, 'faqat toʻgʻri kod + shaxsiy chat');
    const { links } = await tc.loadLinks(db);
    assert.deepEqual(Object.keys(links), ['baza:7']); assert.equal(links['baza:7'].chatId, 5551); assert.equal(links['baza:7'].username, '@ali_u');
    assert.equal(t.sent.length, 1); assert.equal(t.sent[0].body.chat_id, 5551); assert.match(t.sent[0].body.text, /Ali Valiyev, siz mijozlar roʻyxatiga ulandingiz/);
    assert.equal(await tc.sweep(db, TOKEN, 'POWERFUL GROUP'), 0, 'qayta — yangi bogʻlanish yoʻq, ikkinchi tasdiq yuborilmaydi');
    assert.equal(t.sent.length, 1);
  } finally { t.restore(); }
  await tc.unlink(db, 'baza', 7);
  assert.deepEqual((await tc.loadLinks(db)).links, {}, 'uzildi');
  assert.ok(!Object.values((await tc.loadLinks(db)).codes).some(c => c.filial === 'baza' && c.custId === 7), 'eski kod ham bekor');
}

async function testCustomerMessages() {
  const st = { tgBotToken: TOKEN, tgChatId: '-1001112223334', usdUzs: 12000, company: 'POWERFUL GROUP' };
  const branch = { customers: [{ id: 7, name: 'Ali', phone: '+998901234567' }, { id: 8, name: 'Vali' }] };
  const db = fakeDb({ settings: st, branchStore: { baza: branch } }, { baza: branch });
  db.rows.tg_customer_links = { data: { codes: {}, links: { 'baza:7': { chatId: 5551 } } } };
  const t = fakeTelegram([]);
  try {
    await ev.notifyCreditSale(db, { filial: 'baza', custId: 7, items: [{ pid: 1, name: 'Arra tigʻi', qty: 2, sellUsd: 45 }], paidUsd: 0, dueDate: '2026-11-21', dueDays: 10 });
    const toCust = t.sent.filter(x => x.body.chat_id === 5551);
    assert.equal(toCust.length, 1, 'mijozning oʻziga bitta xabar'); assert.match(toCust[0].body.text, /nasiya xarid[\s\S]*Arra tigʻi — 2 dona[\s\S]*1 080 000 so'm[\s\S]*21\.11\.2026/);
    assert.equal(t.sent.filter(x => x.body.chat_id === '-1001112223334').length, 1, 'guruhga ham');
    t.sent.length = 0;
    await ev.notifyCreditSale(db, { filial: 'baza', custId: 8, items: [{ pid: 1, name: 'X', qty: 1, sellUsd: 10 }], paidUsd: 0 });
    assert.ok(!t.sent.some(x => x.body.chat_id === 5551), 'boshqa mijozning xaridi bu mijozga bormaydi');
    t.sent.length = 0;
    await ev.notifyCustomerPayment(db, { filial: 'baza', customerId: 7, amount: 1080000, currency: 'UZS', debtAfterUzs: 0 });
    assert.match(t.sent.find(x => x.body.chat_id === 5551).body.text, /toʻlovingiz qabul qilindi[\s\S]*Qarzingiz toʻliq yopildi/);
    t.sent.length = 0;
    db.rows.main.data.settings = { ...st, tgEvt: { customer: false } };
    await ev.notifyCreditSale(db, { filial: 'baza', custId: 7, items: [{ pid: 1, name: 'X', qty: 1, sellUsd: 10 }], paidUsd: 0 });
    assert.ok(!t.sent.some(x => x.body.chat_id === 5551), 'sozlamada oʻchirilgan — mijozga yoʻq');
  } finally { t.restore(); }
  assert.match(tc.custRemindText({ brand: 'PG', custName: 'Ali', debtUzs: 500000, due: '2026-11-15', today: '2026-11-21' }), /15\.11\.2026<\/b> edi \(6 kun oʻtdi\)[\s\S]*500 000 so'm/);
  assert.match(tc.custRemindText({ brand: 'PG', debtUzs: 500000, due: '2026-11-21', today: '2026-11-21' }), /Bugun \(<b>21\.11\.2026<\/b>\) qarzni qaytarish kuni/);
}

async function testFunctionGuards() {
  const fn = require('../netlify/functions/tg-customer.js');
  const r = await fn.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ action: 'hack' }) });
  assert.equal(r.statusCode, 400);
  const r2 = await fn.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ action: 'link', custId: 'x' }) });
  assert.equal(r2.statusCode, 400, 'mijoz ID tekshiriladi');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'netlify', 'functions', 'tg-customer.js'), 'utf8');
  assert.match(src, /const filial = resolveFilial\(auth, body\.filial\);/, 'xodim — faqat oʻz filiali mijozlari');
  assert.match(src, /action === 'unlink' \? \['mijozlar\.edit'\]/, 'uzish — mijozlar.edit');
  assert.doesNotMatch(src, /json\(\{[^}]*\b(tgBotToken|token)\s*[,:}]/, 'token javobga qoʻshilmaydi');
}

module.exports = {
  name: 'P86 — Mijozni Telegram botga ulash va mijozning oʻziga eslatmalar',
  cases: [
    { name: 'Kod: taxmin qilib boʻlmaydi, mijozga bitta; faqat toʻgʻri kod + shaxsiy chat bogʻlanadi; tasdiq bir marta; uzish', run: testCodesAndSweep },
    { name: 'Mijozga: nasiya (mahsulot, qarz soʻmda, sana), toʻlov/toʻliq yopildi, eslatma; boshqa mijoz maʼlumoti — yoʻq; oʻchirilsa — yoʻq', run: testCustomerMessages },
    { name: 'Funksiya: notoʻgʻri soʻrov rad, xodim — oʻz filiali, uzish — mijozlar.edit, token javobda yoʻq', run: testFunctionGuards },
  ],
};
