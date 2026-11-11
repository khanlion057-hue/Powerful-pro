// P27 — v23.9: KUNLIK TELEGRAM HISOBOTI + sotuvchi portali (telefon) + brend nomi o'lchami.
//  • Hisobot matni (sof funksiya): faqat BUGUNGI savdo/xarajat, to'lov turlari, sof foyda, kassalar (Shaxsiy kassa yo'q),
//    kassa yopilgani, mijoz/ta'minotchi qarzi, filiallar alohida + jami; nomlardagi HTML ekranlanadi; uzun — bo'linadi.
//  • Server (haqiqiy PostgreSQL — PGlite, haqiqiy `telegram-daily-report`): o'chiq / vaqti kelmagan — yubormaydi;
//    vaqti kelganda KUNIGA BIR MARTA (ikkinchi chaqiruv yubormaydi); Telegram xatosida — keyingi urinishda qayta;
//    «ko'rish» va «hozir yuborish» — faqat administrator; javobda bot tokeni yo'q.
//  • Sotuvchi portali (haqiqiy sotuvchi.html, telefon): «Menyu» yo'q; pastki panel — Qarzlar, Kassa, Savdo, Hisobot, Xarajat;
//    buyurtmalar — yuqoridagi qo'ng'iroq (yangi soni bilan); Oylik — Xarajat ichida; QR tugmasi; tez sotiladiganlar bir bosishda
//    savatga; kassa tanlovida Shaxsiy/diller kassasi yo'q; kunlik kurs ko'rinadi.
//  • Admin: brend nomi uzunligiga mos o'lcham (qisqa — katta, uzun — kichik/ikki qator, kesilmaydi).
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');
const { loadApp, ROOT } = require('./helpers/load-app');
const { supabaseStub } = require('./p4-responsive.test.js')._helpers;
const { buildDailyReport, tashkentNow } = require('../netlify/functions/_lib/dailyReport');

const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const json = (route, status, obj) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });
const TOKEN = '123456789:FAKE_test_token_not_real_xxxx';   // soxta (test) qiymat

function sampleData(date) {
  const yday = new Date(Date.parse(date) - 864e5).toISOString().slice(0, 10);
  return {
    settings: { usdUzs: 12500, rateDate: date, company: 'Powerful', branchNames: { f729: 'Chilonzor' } },
    branchStore: {
      baza: {
        sales: [
          { date, totalUsd: 100, paidUsd: 100, debtUsd: 0, profitUsd: 30, payType: 'cash_uzs', staffName: 'Ali <b>', items: [{ name: 'Drel <i>', qty: 2 }] },
          { date, totalUsd: 50, paidUsd: 20, debtUsd: 30, profitUsd: 10, payType: 'card', staffName: 'Vali', items: [{ name: 'Disk', qty: 5 }] },
          { date: yday, totalUsd: 999, paidUsd: 999, profitUsd: 500, payType: 'usd' },
          { date, totalUsd: 777, paidUsd: 777, profitUsd: 77, payType: 'usd', status: 'cancelled' } ],
        expenses: [{ date, amtUsd: 15 }, { date, amtUsd: 1000, turi: 'hamkor', kind: 'kirim' }, { date: yday, amtUsd: 300 }],
        cashTxns: [{ date, type: 'in', custId: 7, cur: 'UZS', amount: 250000, desc: "Qarz to'lovi" }, { date, type: 'in', custId: 7, cur: 'UZS', amount: 999000, desc: 'Savdo INV-1' }],
        dailyClosings: [{ date, toFirma: true, entries: [{ cur: 'UZS', amount: 1250000 }, { cur: 'USD', amount: 40 }] }],
        cashboxes: [{ name: "Naqd so'm", cur: 'UZS', type: 'cash', bal: 1500000 }, { name: 'Shaxsiy kassa', cur: 'USD', type: 'qobiljon', bal: 5000 }],
        customers: [{ debt: 1250000 }, { debt: -5 }], suppliers: [{ debt: 40 }, { debt: -3 }] },
      f729: { sales: [], expenses: [], cashboxes: [{ name: 'Dollar', cur: 'USD', type: 'usd', bal: 10 }] },
    },
  };
}

// ── 1. Hisobot matni ──
async function testReportText() {
  const date = '2026-10-07';
  const msgs = buildDailyReport(sampleData(date), date, { firma: { USD: 1000, UZS: 2500000 }, dealerPay: { count: 2, usd: 300, pending: 1 } });
  assert.equal(msgs.length, 1); const t = msgs[0];
  assert.match(t, /Powerful — kunlik hisobot/); assert.match(t, /07\.10\.2026 · kurs 1\$ = 12 500 so'm/);
  // v25: ustun uslubi — «nomi ..... qiymat», qiymatlar bitta chiziqda (30 belgi), <pre> ichida
  const R = (l, v) => new RegExp('\n?' + l.replace(/[$()]/g, '\\$&') + ' +' + v.replace(/[$()]/g, '\\$&') + '(\n|</pre>)');
  assert.match(t, R('Bosh kassa $', '$1 000')); assert.match(t, R("Bosh kassa so'm", "2 500 000 so'm"));
  assert.match(t, R('Savdo (2 chek)', '$150'), "faqat bugungi, bekor qilingan kirmaydi");
  assert.match(t, R('  naqd', '$100')); assert.match(t, R('  karta', '$20')); assert.match(t, R('  qarzga', '$30'));
  assert.match(t, R('Foyda', '$40')); assert.match(t, R('Xarajat (1)', '$15')); assert.match(t, R('Sof foyda', '$25'), 'hamkor kirimi xarajat emas');
  assert.match(t, R('Undirilgan qarz', '$20'), "250 000 so'm / 12 500; savdo tushumi qarz to'lovi emas");
  assert.match(t, R('Bosh kassaga', '$140'));
  assert.match(t, R("  Naqd so'm", "1 500 000 so'm")); assert.doesNotMatch(t, /Shaxsiy kassa/, "Shaxsiy kassa hisobotga chiqmaydi");
  assert.match(t, R('Mijozlar qarzi', '$100')); assert.match(t, R('Taʼminotchilarga', '$40'));
  assert.match(t, R('  Ali &lt;b&gt;', '$100')); assert.match(t, R('  Drel &lt;i&gt;', '×2')); assert.doesNotMatch(t, /<i>|Ali <b>/, 'nomlardagi HTML ekranlangan');
  assert.match(t, /Chilonzor<\/b>\n— bugun harakat yoʻq/);
  assert.match(t, R('Jami savdo (2 chek)', '$150')); assert.match(t, R('Dillerlardan (2)', '$300')); assert.match(t, R('  tasdiq kutmoqda', '1 ta'));
  // ustunlar tekis: <pre> ichidagi har qator 30 belgidan oshmaydi va qiymatli qatorlar aynan 30
  const rows = [...t.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].flatMap(m => m[1].split('\n')).map(l => l.replace(/&lt;|&gt;|&amp;/g, 'x'));
  assert.ok(rows.length > 10 && rows.every(l => l.length <= 30), 'qatorlar telefonga sig\'adi');
  assert.ok(rows.filter(l => /\S\s{2,}\S+$/.test(l)).every(l => l.length === 30), 'qiymatlar bitta chiziqda');
  assert.match(buildDailyReport({ settings: {}, branchStore: { baza: { sales: [{ date, totalUsd: 20.4, paidUsd: 20.4, profitUsd: 1, payType: 'usd' }] } } }, date)[0], /\$20\.40/, "sentli summa — ikki xona");
  // Uzun — bir nechta xabarga (har biri ≤ 4000)
  const big = sampleData(date); for (let i = 0; i < 40; i++) big.branchStore['f' + i] = { sales: [{ date, totalUsd: 1, paidUsd: 1, profitUsd: 1, payType: 'usd', items: Array.from({ length: 5 }, (_, j) => ({ name: 'Mahsulot nomi juda uzun ' + j + '-' + i, qty: 1 })) }] };
  const parts = buildDailyReport(big, date, {});
  assert.ok(parts.length > 1 && parts.every(m => m.length <= 4000), 'Telegram chegarasidan oshmaydi');
  // Toshkent vaqti (UTC+5)
  assert.deepEqual(tashkentNow(new Date('2026-10-07T16:30:00Z')), { date: '2026-10-07', hour: 21 });
}

// ── 2. Server: jadval va administrator amallari ──
async function world(settings) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE); await pg.exec(SCHEMA);
  const date = tashkentNow().date;
  const d = sampleData(date); d.settings = { ...d.settings, ...settings };
  await pg.query(`update app_data set data = $1::jsonb where id='main'`, [JSON.stringify(d)]);
  const memTables = { staff: [{ id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'a' }, { id: 2, auth_user_id: 'u-s', role: 'sotuvchi', active: true, filial: 'baza', name: 'S', login: 's' }],
    staff_roles: [], role_permissions: [], staff_audit_log: [] };
  return { pg, client: makePgSupabase(pg, { pgTables: ['app_data', 'app_data_branches', 'cashbox_balances', 'firma_kassa_balance', 'dealer_pay_notices', 'idempotency_keys', 'ledger_ops'], memTables, users: { 't-admin': { id: 'u-admin' }, 't-s': { id: 'u-s' } } }) };
}
const sched = () => ({ httpMethod: 'POST', headers: {}, body: '{"next_run":"x"}' });
async function testServer() {
  const RealDate = global.Date, realFetch = global.fetch, sent = []; let tgOk = true;
  global.fetch = async (url, opts) => { sent.push({ url: String(url), body: JSON.parse(opts.body) }); return { json: async () => (tgOk ? { ok: true } : { ok: false, description: 'chat not found' }) }; };
  // Toshkent vaqti — 21:30 (soat 21 dan keyin)
  let fixed = new RealDate('2026-10-07T16:30:00Z').getTime();
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
  let w;
  try {
    w = await world({ tgDaily: false, tgBotToken: TOKEN, tgChatId: '-1001234567890', tgDailyHour: 21 });
    let h = loadFunction('telegram-daily-report', w.client);
    const ha = loadFunction('telegram-report', w.client);   // administrator: ko'rish / hozir yuborish
    let r = await h(sched()); assert.deepEqual(JSON.parse(r.body), { ok: true, skipped: 'off' }); assert.equal(sent.length, 0);
    await w.pg.query(`update app_data set data = jsonb_set(data, '{settings,tgDaily}', 'true')`);
    await w.pg.query(`update app_data set data = jsonb_set(data, '{settings,tgDailyHour}', '22')`);
    r = await h(sched()); assert.equal(JSON.parse(r.body).skipped, 'early', "soat 22 hali kelmagan"); assert.equal(sent.length, 0);
    await w.pg.query(`update app_data set data = jsonb_set(data, '{settings,tgDailyHour}', '21')`);
    // Telegram xatosi — yuborilmadi, kalit bo'shatildi
    tgOk = false; r = await h(sched()); assert.equal(JSON.parse(r.body).ok, false); assert.equal(sent.length, 1);
    // HARDENING: shu soatda qayta urinish yo'q (tashqi chaqiruvlar zaxira/Telegram so'rovini ko'paytira olmaydi)
    tgOk = true; r = await h(sched()); assert.equal(JSON.parse(r.body).skipped, 'retry-later', 'shu soatda ikkinchi urinish yo\'q'); assert.equal(sent.length, 1);
    fixed += 3600e3;   // keyingi soat (22:30) — jadval qayta uradi
    r = await h(sched()); assert.equal(JSON.parse(r.body).sent, 1, 'keyingi soatda yuborildi'); assert.equal(sent.length, 2);
    assert.match(sent[1].url, /api\.telegram\.org\/bot123456789/); assert.equal(sent[1].body.chat_id, '-1001234567890'); assert.equal(sent[1].body.parse_mode, 'HTML');
    assert.match(sent[1].body.text, /kunlik hisobot/); assert.match(sent[1].body.text, /Savdo \(2 chek\) +\$150\n/);   // v25: ustun uslubi
    r = await h(sched()); assert.equal(JSON.parse(r.body).skipped, 'sent', 'bugun ikkinchi marta yuborilmaydi'); assert.equal(sent.length, 2);
    r = await h(post({ action: 'preview' }, 't-admin')); assert.equal(r.statusCode, 404, "HARDENING: jadvaldan tashqari so'rov — 404 (hech narsa bajarilmaydi)"); assert.ok(!('messages' in JSON.parse(r.body)));
    // Administrator: ko'rish (Telegramga ketmaydi), hozir yuborish; sotuvchi — rad; tokenning o'zi javobda yo'q
    r = await ha(post({ action: 'preview' }, 't-admin'));
    const pv = JSON.parse(r.body); assert.equal(pv.ok, true); assert.match(pv.messages[0], /kunlik hisobot/); assert.equal(sent.length, 2);
    assert.ok(!r.body.includes('FAKE_test_token'), 'javobda bot tokeni yo\'q');
    assert.equal((await ha(post({ action: 'preview' }, 't-s'))).statusCode, 403);
    r = await ha(post({ action: 'send_now' }, 't-admin')); assert.equal(JSON.parse(r.body).sent, 1); assert.equal(sent.length, 3);
    assert.equal((await ha(post({ action: 'hack' }, 't-admin'))).statusCode, 400);
    // Token yo'q — «hozir yuborish» aniq xato
    await w.pg.query(`update app_data set data = jsonb_set(data, '{settings,tgBotToken}', '""')`);
    r = await ha(post({ action: 'send_now' }, 't-admin')); assert.equal(r.statusCode, 400);
    r = await h(sched()); assert.equal(JSON.parse(r.body).skipped, 'no-bot', "token o'chirilgan — jadval hech narsa yubormaydi"); assert.equal(sent.length, 3);
  } finally { global.Date = RealDate; global.fetch = realFetch; unloadFunctions(); if (w) await w.pg.close(); }
}

// ── 3. Sotuvchi portali (telefon) ──
async function testSellerPhone() {
  const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); s.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--no-sandbox'] });
  const t = new Date().toISOString().slice(0, 10);
  const server = { settings: { usdUzs: 12500, rateDate: '2020-01-01' }, products: [{ id: 1, sku: 'A1', name: 'Drel <b>x</b>', markupPct: 25 }, { id: 2, sku: 'B2', name: 'Disk', markupPct: 25 }, { id: 3, sku: 'C3', name: 'Tugagan', markupPct: 25 }],
    branchStore: { baza: { customers: [], dailyClosings: [], expenses: [],
      batches: [{ id: 'b1', pid: 1, qty: 10, sold: 0, costUsd: 40, date: '2026-09-01', status: 'active' }, { id: 'b2', pid: 2, qty: 5, sold: 0, costUsd: 4, date: '2026-09-01', status: 'active' }],
      sales: [{ id: 1, date: t, staffId: 9, totalUsd: 50, items: [{ pid: 2, qty: 9 }] }],
      cashboxes: [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 1000 }, { id: 4, name: 'Diller', cur: 'USD', type: 'dealer', bal: 5 }, { id: 5, name: 'Shaxsiy kassa', cur: 'USD', type: 'qobiljon', bal: 77 }] } } };
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript({ content: supabaseStub({ loggedIn: true }) });
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.includes('/functions/app-data-load')) return json(route, 200, { data: JSON.parse(JSON.stringify(server)) });
      if (u.includes('/functions/staff-whoami')) return json(route, 200, { staff: { id: 9, name: 'Sotuvchi', filial: 'baza', active: true, role: 'sotuvchi' } });
      if (u.includes('/functions/dealer-data-load')) return json(route, 200, { dealers: [{ id: 1, name: 'D' }] });
      if (u.includes('/functions/dealer-orders-list')) return json(route, 200, { orders: [{ id: 1, dealer_id: 1, status: 'pending', items: [] }, { id: 2, dealer_id: 1, status: 'pending', items: [] }, { id: 3, dealer_id: 1, status: 'approved', items: [] }] });
      if (u.includes('/functions/')) return json(route, 200, {});
      if (u.startsWith(`http://127.0.0.1:${port}/`)) return route.continue();
      if (u.includes('cdn.jsdelivr.net')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      return route.abort('failed');
    });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/sotuvchi.html`); await page.waitForTimeout(1600);
    await page.evaluate(() => svSwitchTab('sale'));   // v24.7: portal Bosh sahifadan ochiladi
    // v24.5: sotuvchi savdo oynasi — admin bilan bir xil (js/pos.js): qidiruv + kamera tugmasi, ro'yxat, savat paneli
    const v = await page.evaluate(() => ({
      nav: [...document.querySelectorAll('#pt-bnav .m-bn-item')].map(b => b.dataset.tab), menu: !!document.getElementById('pt-sheet'),
      bell: document.getElementById('sv-bell-n').textContent, bellHidden: document.getElementById('sv-bell-n').hidden,
      scan: !!document.querySelector('#sv-content .pos-scan svg') && !/📷/.test(document.getElementById('sv-content').textContent),
      rows: [...document.querySelectorAll('#pos-list .pos-row')].map(r => ({ n: r.querySelector('.pos-row-n').firstChild.textContent.trim(), off: r.classList.contains('off') })),
      rate: document.querySelector('.sv-rate').textContent, rateWarn: document.querySelector('.sv-rate').classList.contains('warn'),
      boldInjected: document.querySelectorAll('.pos-row-n b').length }));
    assert.deepEqual(v.nav, ['debt', 'kassa', 'sale', 'history', 'expense'], "pastki panel — menyusiz, Xarajat bilan");
    assert.equal(v.menu, false);
    assert.equal(v.bellHidden, false); assert.equal(v.bell, '2', "yuqorida yangi buyurtmalar soni");
    assert.equal(v.scan, true, 'kamera rasmi o\'rnida skaner tugmasi (bevosita kamera)');
    assert.deepEqual(v.rows, [{ n: 'Disk', off: false }, { n: 'Drel <b>x</b>', off: false }, { n: 'Tugagan', off: true }], "qoldig'i borlar avval; tugagan — sotib bo'lmaydi; nom matn sifatida");
    assert.equal(v.boldInjected, 0); assert.match(v.rate, /1 \$ = 12 500/); assert.equal(v.rateWarn, true, 'kurs bugun tasdiqlanmagan — ogohlantirish');
    await page.click('#pos-list .pos-row-main >> nth=0'); await page.click('#pos-list .pos-step button >> nth=1');
    const c = await page.evaluate(() => ({ cart: CART.map(i => [i.pid, i.qty]), bar: document.querySelector('.pos-bar')?.textContent }));
    assert.deepEqual(c.cart, [[2, 2]], 'qo\'shish va + — savatda 2 dona'); assert.match(c.bar, /2 dona.*soʻm/s, "savat summasi so'mda");
    await page.evaluate(() => posSetMode('wholesale'));
    const w = await page.evaluate(() => ({ cart: CART.map(i => [i.pid, i.qty]), mode: POS.mode }));
    assert.deepEqual(w.cart, [[2, 2]], 'rejim almashganda savat va miqdor saqlanadi'); assert.equal(w.mode, 'wholesale');
    await page.evaluate(() => posSetCur('USD'));
    assert.match(await page.textContent('.pos-bar'), /\$/, 'USD tanlansa — dollarda');
    await page.evaluate(() => { posSetMode('retail'); posSetCur('UZS'); });
    await page.click('#sv-bell'); await page.waitForTimeout(200);
    assert.match(await page.textContent('#sv-content'), /Yangi buyurtmalar \(2\)/);
    await page.click('#pt-bnav [data-tab="expense"]'); await page.waitForTimeout(200);
    let ex = await page.evaluate(() => ({ boxes: [...document.querySelectorAll('.sv-chips button')].map(b => +b.dataset.v), hero: document.querySelector('.sv-xhero').textContent, seg: [...document.querySelectorAll('.sv-seg button')].map(b => b.textContent) }));
    assert.deepEqual(ex.boxes, [1], "kassa tanlovida Shaxsiy va diller kassasi yo'q"); assert.deepEqual(ex.seg, ['Xarajat', 'Oylik']);
    await page.click('.sv-seg button >> nth=1');
    assert.match(await page.textContent('#sv-content'), /oylik hali belgilanmagan/, 'Oylik — Xarajat ichida');
    await page.evaluate(() => svSwitchTab('salary'));
    assert.equal(await page.evaluate(() => ACTIVE_TAB), 'expense', "eski «salary» havolasi Xarajat ichidagi Oylikka olib boradi");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, "gorizontal siljish yo'q");
    assert.deepEqual(errs, []);
  } finally { await browser.close(); srv.close(); }
}

// ── 4. Admin: brend nomi o'lchami ──
async function testBrandFit() {
  const { browser, page, consoleErrors } = await loadApp({});
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addStyleTag({ path: path.join(ROOT, 'css', 'style.css') }); await page.addStyleTag({ path: path.join(ROOT, 'css', 'design-system.css') });
    const r = await page.evaluate(async () => {
      document.body.insertAdjacentHTML('afterbegin', '<div style="display:flex;width:390px;padding:10px 15px;box-sizing:border-box"><div class="topbar-title" id="tb-test" style="flex:1;min-width:0;overflow:hidden;white-space:nowrap"></div><div style="width:190px;flex:none"></div></div>');
      const out = {};
      for (const nm of ['AB', 'Powerful', 'Sharq Savdo Group International Trading']) {
        S.settings.company = nm;
        document.getElementById('tb-test').innerHTML = `<span class="ox-brand">${fwBrandMark()}<span class="ox-bn">${esc(nm)}</span></span>`;
        fwFitBrandNames();
        const e = document.querySelector('.ox-bn');
        out[nm] = { sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight, fs: parseFloat(getComputedStyle(e).fontSize), clipped: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1, two: e.classList.contains('fw-2l') };
      }
      return out;
    });
    assert.ok(r.AB.fs > r.Powerful.fs || r.AB.fs === 30, 'qisqa nom — katta'); assert.ok(r.Powerful.fs > r['Sharq Savdo Group International Trading'].fs, 'uzun nom — kichikroq');
    assert.equal(r['Sharq Savdo Group International Trading'].two, true, 'juda uzun — ikki qator: ' + JSON.stringify(r));
    for (const k of Object.keys(r)) assert.equal(r[k].clipped, false, `${k}: kesilmagan`);
    // Kunlik kurs: tasdiqlanganda bugungi sana sozlamaga yoziladi (boshqa qurilma/portal biladi)
    const rt = await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div>'); save = () => {}; renderPage = () => {};
      CUR.lastRateDate = '2020-01-01'; S.settings.rateDate = '2020-01-01'; openRateModal(false);
      document.getElementById('rm-usduzs').value = '12750'; saveRateModal();
      return { rd: S.settings.rateDate, lr: CUR.lastRateDate, rate: S.settings.usdUzs, today: td() }; });
    assert.deepEqual([rt.rd, rt.lr, rt.rate], [rt.today, rt.today, 12750], 'kurs bugun tasdiqlandi — sozlamada ham');
    assert.deepEqual(consoleErrors, []);
  } finally { await browser.close(); }
}

module.exports = {
  name: "P27 — v23.9: kunlik Telegram hisoboti, sotuvchi portali (telefon), brend nomi o'lchami",
  cases: [
    { name: "Hisobot matni: bugungi ko'rsatkichlar, sof foyda, kassalar (Shaxsiy yo'q), qarzlar, filiallar, HTML ekranlangan, bo'linadi", run: testReportText },
    { name: "Server (haqiqiy PostgreSQL): o'chiq/erta — yo'q; vaqti kelganda kuniga bir marta; xatoda qayta; ko'rish/yuborish faqat admin, token javobda yo'q", run: testServer },
    { name: "Sotuvchi (telefon): menyusiz panel, buyurtmalar qo'ng'irog'i, QR, tez sotiladiganlar, Oylik — Xarajat ichida, kassalar, kurs", run: testSellerPhone },
    { name: "Admin: brend nomi uzunligiga mos — qisqa katta, uzun kichik/ikki qator, kesilmaydi", run: testBrandFit },
  ],
};
