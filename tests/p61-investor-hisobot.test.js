// P61 — v24.6 (egasi talabi): INVESTOR (HAMKOR) HISOBOTI — oylik/yillik ko'chirma, PDF va investorning Telegramiga.
//  • Server (haqiqiy telegram-file; Telegram API — soxta fetch): bot nomi; «Start» bosilganini getUpdates'dan topish
//    (faqat aynan shu kod, faqat shaxsiy chat); PDF — FAQAT bazadagi hamkor yozuvidagi chatga (brauzer chat yubora olmaydi);
//    ulanmagan hamkor / PDF emas — rad; faqat administrator.
//  • Brauzer (haqiqiy js/main.js): ko'chirma hisobi (boshida/kirim/xarajat/foyda/oxirida).
const assert = require('node:assert/strict');
const { makeMemSupabase, loadFunction, post } = require('./helpers/mem-supabase');
const { loadApp } = require('./helpers/load-app');

const TOKEN = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function world() {
  return makeMemSupabase({
    tables: {
      app_data: [{ id: 'main', data: { settings: { tgBotToken: TOKEN, tgChatId: '-100200300' }, partners: [{ id: 7, name: 'Ali', invested: 100, tgChat: '555111' }, { id: 8, name: 'Vali', invested: 50 }] } }],
      staff: [{ id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
              { id: 2, auth_user_id: 'u-sel', role: 'sotuvchi', active: true, filial: 'baza', name: 'Sotuvchi', login: 'sel' }],
      staff_roles: [], role_permissions: [], staff_audit_log: [],
    },
    users: { 't-admin': { id: 'u-admin' }, 't-sel': { id: 'u-sel' } },
  });
}
async function testServer() {
  const calls = []; const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    const m = /\/bot[^/]+\/(\w+)$/.exec(String(url)); const method = m && m[1];
    let body = null; try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : init && init.body; } catch (_) {}
    calls.push({ method, body });
    const ok = (result) => ({ ok: true, status: 200, json: async () => ({ ok: true, result }) });
    if (method === 'getMe') return ok({ username: 'powerful_test_bot' });
    if (method === 'getUpdates') return ok([
      { message: { chat: { id: 999, type: 'group' }, from: { first_name: 'Guruh' }, text: '/start invAbcdefgh12' } },
      { message: { chat: { id: 444, type: 'private' }, from: { first_name: 'Boshqa' }, text: '/start invZZZZZZZZZZ' } },
      { message: { chat: { id: 777, type: 'private' }, from: { first_name: 'Ali', last_name: 'Valiyev', username: 'ali_inv' }, text: '/start invAbcdefgh12' } }]);
    return ok({});
  };
  try {
    const h = loadFunction('telegram-file', world());
    const B = (r) => JSON.parse(r.body);
    let r = await h(post({ action: 'tg_link' }, 't-sel')); assert.equal(r.statusCode, 403, 'faqat administrator');
    r = await h(post({ action: 'tg_link' })); assert.equal(B(r).bot, 'powerful_test_bot');
    r = await h(post({ action: 'tg_link_check', code: 'bad code' })); assert.equal(r.statusCode, 400);
    r = await h(post({ action: 'tg_link_check', code: 'invNOTSTARTED1' })); assert.equal(B(r).found, false);
    r = await h(post({ action: 'tg_link_check', code: 'invAbcdefgh12' }));
    assert.deepEqual(B(r), { ok: true, found: true, chatId: '777', name: 'Ali Valiyev', user: '@ali_inv' }, 'guruh va boshqa kod e\'tiborsiz');
    assert.ok(calls.some(c => c.method === 'sendMessage' && c.body.chat_id === 777), 'investorga «ulandingiz» xabari');
    const pdf = Buffer.from('%PDF-1.4 test').toString('base64');
    r = await h(post({ action: 'partner_doc', partnerId: 8, filename: 'x', b64: pdf })); assert.equal(r.statusCode, 400); assert.match(B(r).error, /ulanmagan/);
    r = await h(post({ action: 'partner_doc', partnerId: 7, filename: 'x', b64: Buffer.from('not pdf').toString('base64') })); assert.equal(r.statusCode, 400);
    calls.length = 0;
    r = await h(post({ action: 'partner_doc', partnerId: 7, filename: 'hisobot', b64: pdf, caption: 'Oylik', chatId: '-100999' }));
    assert.equal(B(r).ok, true, r.body);
    const send = calls.find(c => c.method === 'sendDocument'); assert.ok(send, 'hujjat yuborildi');
    const chat = send.body && typeof send.body.get === 'function' ? String(send.body.get('chat_id')) : JSON.stringify(send.body);
    assert.match(chat, /555111/, "faqat hamkor yozuvidagi chatga (brauzer yuborgan chatId e'tiborsiz)");
  } finally { global.fetch = realFetch; }
}
async function testClient() {
  const { browser, page, consoleErrors } = await loadApp({});
  try {
    const r = await page.evaluate(() => {
      Object.assign(S, { branch: 'baza', partnerPeriods: [{ id: 2, filial: 'baza', start: '2026-09-01', end: '2026-09-30', totalProfit: 1000, rows: [{ pid: 7, foydaPlus: 40, pct: 40 }] }],
        partners: [{ id: 7, name: 'Ali', invested: 190, filial: 'baza' }, { id: 8, name: 'Vali', invested: 10, filial: 'baza' }],
        expenses: [{ turi: 'hamkor', partnerId: 7, kind: 'kirim', date: '2026-09-10', amtUsd: 100 }, { turi: 'hamkor', partnerId: 7, date: '2026-09-20', amtUsd: 30 },
                   { turi: 'hamkor', partnerId: 7, kind: 'kirim', date: '2026-10-05', amtUsd: 20 }] });
      const m = partnerStatement(7, '2026-09-01', '2026-09-30'), y = partnerStatement(7, '2026-01-01', '2026-12-31');
      return { m: [m.opening, m.kirim, m.xarajat, m.foyda, m.closing, Math.round(m.share)], y: [y.opening, y.closing, y.pers.length] };
    });
    assert.deepEqual(r.m, [60, 100, 30, 40, 170, 95], "sentyabr: 60 + 100 − 30 + 40 = 170 (oktyabr kirimi kirmaydi)");
    assert.deepEqual(r.y, [60, 190, 1]);
    assert.deepEqual(consoleErrors, []);
  } finally { await browser.close(); }
}
module.exports = {
  name: 'P61 — investor hisoboti (Telegram)',
  cases: [
    { name: "server: bot havolasi, «Start» ni topish (faqat shu kod, shaxsiy chat), PDF faqat hamkorning ulangan chatiga; faqat admin", run: testServer },
    { name: "brauzer: oylik/yillik ko'chirma hisobi (Tezkor amallardagi Hamkorlar/Xarajatlar — P4 da)", run: testClient },
  ],
};
