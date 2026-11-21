// P25 — v23.7: KASSA YOPISH (sotuvchi ham yopadi) va BOSH SAHIFA «Biznes holati» (foyda / ziyon).
//  • Server (haqiqiy PostgreSQL — PGlite, haqiqiy firma-kassa funksiyasi): sotuvchi (savdo.create) o'z filiali
//    savdo kassasini Bosh kassaga topshiradi; Shaxsiy (qobiljon) va diller kassasi — rad; boshqa filial — o'ziniki ishlatiladi;
//    takror — ikki marta yechilmaydi; huquqsiz — rad.
//  • Admin oynasi (haqiqiy js/main.js, Chromium): Shaxsiy/diller kassasi ro'yxatda yo'q, foyda faqat egasi/hisobot huquqiga,
//    qoldiqdan ortiq — rad, serverga faqat kiritilgan kassalar.
//  • Biznes holati: ombor (faqat omborda bor, to'langan — yo'ldagi, bo'sh, konsignatsiya kirmaydi), yo'ldagi, qarzlar,
//    investor/ta'sischi, natija = sof qiymat − kiritilgan pul; filialda — o'z ma'lumoti (Bosh kassa yo'q, Bazaga qarz — qarzim).
//  • Sotuvchi portali (haqiqiy sotuvchi.html): «Kassa» bo'limi — foydasiz; yopish fail-close, qayta bosishda o'sha kalit.
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

const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger',
  'sales', 'batches', 'customer_balances', 'supplier_balances', 'customer_debt_payments', 'supplier_payments', 'home_withdrawals',
  'dealer_payments', 'dealers', 'cashbox_transactions', 'ledger_ops', 'customer_debt_ledger', 'supplier_debt_ledger', 'stock_ledger'];
const PERMS = { 'r-sel': ['savdo.create', 'savdo.view'], 'r-kas': ['kassalar.transact'], 'r-no': ['mijozlar.view'] };
const USERS = { 't-admin': { id: 'u-admin' }, 't-sel': { id: 'u-sel' }, 't-kas': { id: 'u-kas' }, 't-no': { id: 'u-no' } };
const BOXES = [
  { id: 1, name: "Naqd So'm", cur: 'UZS', type: 'cash', bal: 1200000 },
  { id: 3, name: 'Dollar ($)', cur: 'USD', type: 'usd', bal: 300 },
  { id: 4, name: 'Diller kassasi', cur: 'USD', type: 'dealer', bal: 50 },
  { id: 5, name: 'Shaxsiy kassa', cur: 'USD', type: 'qobiljon', bal: 70 },
];
const json = (route, status, obj) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });

async function world() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  await pg.exec(SCHEMA);
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12000 }, branchStore: { f729: { cashboxes: BOXES } } })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('f729', $1::jsonb)`, [JSON.stringify({ cashboxes: BOXES, suppliers: [], customers: [], batches: [], sales: [] })]);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase-migration-24-v11-cash-authority.sql'), 'utf8'));
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'), 'utf8'));
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase-migration-28-firma-kassa-asosiy.sql'), 'utf8'));
  const memTables = {
    staff: [
      { id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
      { id: 7, auth_user_id: 'u-sel', role: 'sotuvchi', active: true, filial: 'f729', name: 'Sotuvchi 729', login: 'sel' },
      { id: 8, auth_user_id: 'u-kas', role: 'sotuvchi', active: true, filial: 'f729', name: 'Kassir 729', login: 'kas' },
      { id: 10, auth_user_id: 'u-no', role: 'sotuvchi', active: true, filial: 'f729', name: 'Kuzatuvchi', login: 'no' },
    ],
    staff_roles: [{ staff_id: 7, role_id: 'r-sel' }, { staff_id: 8, role_id: 'r-kas' }, { staff_id: 10, role_id: 'r-no' }],
    role_permissions: Object.entries(PERMS).flatMap(([rid, keys]) => keys.map(k => ({ role_id: rid, permission_id: k, permissions: { key: k } }))),
    staff_audit_log: [], idempotency_keys: [],
  };
  return { pg, client: makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: USERS }) };
}
const num = async (pg, sql, params) => +(((await pg.query(sql, params)).rows[0] || {}).v ?? NaN);
const boxBal = (pg, b) => num(pg, `select balance v from cashbox_balances where filial='f729' and box_local_id=$1`, [b]);
const fkBal = (pg, c) => num(pg, `select coalesce((select balance from firma_kassa_balance where currency=$1),0) v`, [c]);

// ── 1. Server: sotuvchi kassani yopadi ──
async function testSellerDailyCloseServer() {
  const { pg, client } = await world();
  try {
    const h = loadFunction('firma-kassa', client);
    let r = await h(post({ action: 'daily_close', currency: 'USD', amount: 120, boxId: 3, note: 'smena', idemKey: 'sv1-3' }, 't-sel'));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(await boxBal(pg, 3), 180, 'filial kassasi kamaydi'); assert.equal(await fkBal(pg, 'USD'), 120, "Bosh kassaga o'tdi");
    const row = (await pg.query(`select filial, note, staff_name from firma_kassa_ledger where op_type='branch_in' order by id desc limit 1`)).rows[0];
    assert.equal(row.filial, 'f729'); assert.match(row.note, /Kunlik yopish — smena/); assert.equal(row.staff_name, 'Sotuvchi 729', 'kim topshirgani yoziladi');
    r = await h(post({ action: 'daily_close', currency: 'USD', amount: 120, boxId: 3, idemKey: 'sv1-3' }, 't-sel'));
    assert.equal(r.statusCode, 200); assert.equal(await boxBal(pg, 3), 180, 'takror — ikki marta yechilmadi'); assert.equal(await fkBal(pg, 'USD'), 120);
    // Shaxsiy va diller kassasi — sotuvchiga rad, hech narsa o'zgarmaydi
    r = await h(post({ action: 'daily_close', currency: 'USD', amount: 10, boxId: 5, idemKey: 'sv2-5' }, 't-sel'));
    assert.equal(r.statusCode, 403, 'Shaxsiy kassa — sotuvchi yopolmaydi');
    r = await h(post({ action: 'daily_close', currency: 'USD', amount: 10, boxId: 4, idemKey: 'sv2-4' }, 't-sel'));
    assert.equal(r.statusCode, 403, 'diller kassasi — sotuvchi yopolmaydi');
    assert.equal(await fkBal(pg, 'USD'), 120);
    // boshqa filialni ko'rsatsa ham — o'z filiali
    r = await h(post({ action: 'daily_close', currency: 'UZS', amount: 200000, boxId: 1, filial: 'baza', idemKey: 'sv3-1' }, 't-sel'));
    assert.equal(r.statusCode, 200, r.body); assert.equal(await boxBal(pg, 1), 1000000); assert.equal(await fkBal(pg, 'UZS'), 200000);
    // qoldiqdan ortiq — rad
    r = await h(post({ action: 'daily_close', currency: 'USD', amount: 500, boxId: 3, idemKey: 'sv4-3' }, 't-sel'));
    assert.equal(r.statusCode, 400); assert.equal(await boxBal(pg, 3), 180);
    // huquqsiz — rad; sotuvchi boshqa Bosh kassa amalini qila olmaydi
    r = await h(post({ action: 'daily_close', currency: 'USD', amount: 5, boxId: 3, idemKey: 'sv5-3' }, 't-no'));
    assert.equal(r.statusCode, 403);
    r = await h(post({ action: 'branch_pay', currency: 'USD', amount: 5, boxId: 3, idemKey: 'sv6-3' }, 't-sel'));
    assert.equal(r.statusCode, 403, "savdo huquqi faqat kunlik yopishga ruxsat beradi (filial qarzini to'lash — yo'q)");
    r = await h(post({ action: 'state' }, 't-sel'));
    assert.equal(r.statusCode, 403, "sotuvchi Bosh kassa qoldig'ini ko'rmaydi");
    // kassa huquqli xodim — avvalgidek (o'zgarmagan)
    r = await h(post({ action: 'daily_close', currency: 'USD', amount: 5, boxId: 3, idemKey: 'sv7-3' }, 't-kas'));
    assert.equal(r.statusCode, 200); assert.equal(await boxBal(pg, 3), 175);
  } finally { unloadFunctions(); await pg.close(); }
}

async function withApp(opts, fn) {
  const { browser, page, consoleErrors } = await loadApp(opts);
  try {
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div><div id="bs-ov" hidden></div><div id="pg-dashboard"></div>');
      save = () => {}; pgKassalar = () => {}; auditLog = () => {};
      CUR.usdUzs = 12500;
    });
    await fn(page);
    assert.deepEqual(consoleErrors, [], "sahifada JS xatosi yo'q");
  } finally { await browser.close(); }
}

// ── 2. Admin oynasi: ro'yxat, foyda ko'rinishi, yuborish ──
async function testKassaCloseModal() {
  const calls = [];
  await withApp({ mockRoutes: [{ url: '**/.netlify/functions/firma-kassa', handler: (route) => {
    const b = JSON.parse(route.request().postData()); calls.push(b);
    return json(route, 200, { ok: true, authority: true, transfer: { branchBalance: 7, amount: b.amount } });
  } }] }, async (page) => {
    const seed = () => {
      const t = td();
      Object.assign(S, { branch: 'f729', dailyClosings: [], expenses: [{ id: 'e', date: t, amtUsd: 5, turi: 'dokon' }],
        sales: [{ id: 1, date: t, totalUsd: 100, paidUsd: 80, debtUsd: 20, profitUsd: 30, payType: 'cash_uzs' }],
        cashTxns: [{ id: 9, date: t, boxId: 3, type: 'in', amount: 40, cur: 'USD', desc: 'Savdo' }],
        cashboxes: [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 500000 }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 50 },
          { id: 4, name: 'Diller', cur: 'USD', type: 'dealer', bal: 10 }, { id: 5, name: 'Shaxsiy kassa', cur: 'USD', type: 'qobiljon', bal: 90 }] });
    };
    // Sotuvchi: faqat savdo huquqi
    const r = await page.evaluate(async (seedSrc) => {
      _cloudEnabled = true; (0, eval)(seedSrc)();
      CURRENT_USER = { kind: 'staff', staffId: 7, name: 'Sotuvchi', roles: [], perms: new Set(['savdo.create']) };
      openKunlikHisob();
      const html = document.getElementById('modal-ov').innerHTML, text = document.getElementById('modal-ov').textContent;
      const ids = [...document.querySelectorAll('#modal-ov input[id^="kh-amt-"]')].map(i => i.id);
      document.getElementById('kh-amt-3').value = '60';
      await doKunlikHisob();   // 60 > 50 — rad
      const over = { n: S.dailyClosings.length };
      document.getElementById('kh-amt-3').value = '20';
      khAll('1');
      await doKunlikHisob();
      return { ids, hasProfit: /Sof natija|foyda/i.test(text), bosh: /Bosh kassaga topshiriladi/.test(text), today: /\+\$40\.00/.test(text) || /\+\$40/.test(html),
        over, closings: S.dailyClosings.length, by: S.dailyClosings[0]?.performedBy, toFirma: S.dailyClosings[0]?.toFirma, bal3: S.cashboxes[1].bal };
    }, `(${seed})`);
    assert.deepEqual(r.ids, ['kh-amt-1', 'kh-amt-3'], "Shaxsiy va diller kassasi ro'yxatda yo'q");
    assert.equal(r.hasProfit, false, "sotuvchiga foyda ko'rsatilmaydi");
    assert.equal(r.bosh, true, 'pul Bosh kassaga (asosiy kassaga) topshirilishi yozilgan');
    assert.equal(r.today, true, 'kassaning bugungi kirimi ko\'rinadi');
    assert.deepEqual(r.over, { n: 0 }, 'qoldiqdan ortiq — rad');
    assert.equal(r.closings, 1); assert.equal(r.by, 'Sotuvchi'); assert.equal(r.toFirma, true); assert.equal(r.bal3, 7, 'qoldiq server javobidan');
    const dc = calls.filter(b => b.action === 'daily_close');
    assert.deepEqual(dc.map(b => [b.boxId, b.currency, b.amount, b.filial]), [[1, 'UZS', 500000, 'f729'], [3, 'USD', 20, 'f729']]);
    // Huquqsiz xodim — oyna ochilmaydi
    const denied = await page.evaluate(() => { CURRENT_USER = { kind: 'staff', staffId: 8, name: 'X', roles: [], perms: new Set(['mijozlar.view']) };
      document.getElementById('modal-ov').innerHTML = ''; openKunlikHisob(); return { html: document.getElementById('modal-ov').innerHTML, t: window.__toasts.at(-1).msg }; });
    assert.equal(denied.html, ''); assert.match(denied.t, /ruxsat/);
    // Egasi — foyda va sof natija ko'rinadi
    const own = await page.evaluate((seedSrc) => { (0, eval)(seedSrc)(); CURRENT_USER = null; openKunlikHisob(); return document.getElementById('modal-ov').textContent; }, `(${seed})`);
    assert.match(own, /Sof natija/); assert.match(own, /\+\$25/, 'foyda 30 − xarajat 5');
  });
}

// ── 3. Biznes holati: Baza va filial ──
async function testBizStatus() {
  await withApp({}, async (page) => {
    const r = await page.evaluate(() => {
      _cloudEnabled = false; CURRENT_USER = null;
      const m = td();
      Object.assign(S, { branch: 'baza', page: 'dashboard',
        batches: [
          { id: 1, pid: 1, qty: 10, sold: 4, costUsd: 10, status: 'active' },                     // 60 — omborda
          { id: 2, pid: 1, qty: 5, sold: 0, costUsd: 20, status: 'transit' },                     // 100 — yo'lda
          { id: 3, pid: 1, qty: 3, sold: 3, costUsd: 50, status: 'empty' },                       // 0
          { id: 4, pid: 2, qty: 8, sold: 0, costUsd: 5, status: 'active', consignment: true },    // konsignatsiya — puli to'lanmagan
          { id: 5, pid: 2, qty: 2, sold: 0, costUsd: 7, status: 'active', deleted: true } ],
        cashboxes: [{ id: 1, name: 'N', cur: 'UZS', type: 'cash', bal: 1250000 }, { id: 3, name: 'D', cur: 'USD', type: 'usd', bal: 40 }, { id: 4, name: 'Dl', cur: 'USD', type: 'dealer', bal: 999 }],
        customers: [{ id: 1, debt: 625000 }], suppliers: [{ id: 1, debt: 30 }, { id: 2, debt: -5 }],
        dealers: [{ id: 1, debt: 15, filial: 'baza' }, { id: 2, debt: 400, filial: 'f729' }], dealerStock: [{ dealerId: 1, qty: 2, avgCostUsd: 10 }, { dealerId: 2, qty: 9, avgCostUsd: 10 }],
        branchDebt: { f729: 70 },
        partners: [{ id: 1, isFounder: true, invested: 200 }, { id: 2, isFounder: false, invested: 50 }, { id: 3, isFounder: true, invested: 999, filial: 'f729' }],
        sales: [{ id: 1, date: m, totalUsd: 50, profitUsd: 12 }], expenses: [{ id: 1, date: m, amtUsd: 2 }],
        dailyClosings: [{ toFirma: true, entries: [{ cur: 'USD', amount: 500 }] }] });
      DS.fk = { USD: 10, UZS: 0 };
      const B = fwBizStatus();
      pgDashboard();
      // v24.2 (egasi talabi): «Biznes holati» bosh sahifadan pastki menyudagi «Audit» tugmasiga ko'chdi
      const card = document.querySelector('#mobileBottomNav [onclick="dashBizSheet()"]'), onDash = !!document.querySelector('#pg-dashboard .ox-biz');
      dashBizSheet();
      const sheet = document.getElementById('bs-ov').textContent;
      // Filial: o'z hamkorlari, Bazaga qarz — qarzim, Bosh kassa yo'q, o'z dillerlari
      S.branch = 'f729';
      S.dailyClosings = [{ toFirma: true, entries: [{ cur: 'USD', amount: 30 }, { cur: 'UZS', amount: 125000 }] }, { toFirma: false, entries: [{ cur: 'USD', amount: 99 }] }];
      const F = fwBizStatus();
      return { B, onDash, cardText: card && card.textContent, sheet, F };
    });
    const B = r.B;
    assert.equal(B.ombor, 60, "ombor: faqat omborda bor, to'langan tovar (yo'ldagi/bo'sh/konsignatsiya/o'chirilgan kirmaydi)");
    assert.equal(B.yolda, 100); assert.equal(B.konsig, 40);
    assert.equal(B.kassalar, 140, 'kassalar: 1 250 000 soʻm = $100 + $40, diller kassasi kirmaydi');
    assert.equal(B.boshKassa, 10); assert.equal(B.mijozQarzi, 50); assert.equal(B.dillerQarzi, 15, 'faqat shu filial dillerlari');
    assert.equal(B.dillerTovar, 20); assert.equal(B.filialQarzi, 70);
    assert.equal(B.taminotchiQarzi, 30, "manfiy (oldindan to'langan) qarz qarzimni kamaytirmaydi");
    assert.equal(B.tasischilar, 200); assert.equal(B.investorlar, 50);
    assert.equal(B.aktiv, 60 + 100 + 20 + 140 + 10 + 50 + 15 + 70);
    assert.equal(B.sof, B.aktiv - 30); assert.equal(B.natija, B.sof - 250);
    assert.equal(B.oySof, 10, 'bu oy: foyda 12 − xarajat 2');
    assert.equal(r.onDash, false, "bosh sahifada «Biznes holati» kartasi yo'q"); // pastki menyudagi «Audit» tugmasi — P4 (to'liq index.html) testida tekshiriladi
    assert.match(r.sheet, /Audit · Biznes holati/); assert.match(r.sheet, /Foyda \(kiritilgan puldan ortiq\)/, 'foyda — yashil sarlavha'); assert.match(r.sheet, /Ombordagi mahsulot/); assert.match(r.sheet, /Investorlar|Investor/); assert.match(r.sheet, /Taʼsischilar|Ta'sischilar|Taʼsischi/);
    const F = r.F;
    assert.equal(F.boshKassa, 0); assert.equal(F.isBaza, false); assert.equal(F.bazagaQarz, 70, 'filial: Bazaga qarz — qarzim');
    assert.equal(F.filialQarzi, 0); assert.equal(F.tasischilar, 999, 'filial — faqat o\'z hamkorlari'); assert.equal(F.investorlar, 0);
    assert.equal(F.dillerQarzi, 400); assert.equal(F.dillerTovar, 90);
    assert.equal(F.qarzim, 30 + 70);
    assert.equal(B.topshirgan, 0, 'Bazada topshirilgan pul Bosh kassa qoldig\'ida (ikki marta sanalmaydi)');
    assert.equal(F.topshirgan, 40, "filial: Bosh kassaga topshirgani — o'z aktivi (eski «tizimdan chiqarilgan» yozuv kirmaydi)");
    assert.equal(F.aktiv, F.ombor + F.yolda + F.dillerTovar + F.kassalar + 40 + F.mijozQarzi + F.dillerQarzi);
  });
}

// ── 4. Sotuvchi portali: «Kassa» bo'limi ──
async function testSellerPortalKassa() {
  const calls = []; let saved = null; let mode = 'net';
  const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); s.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--no-sandbox'] });
  const t = new Date().toISOString().slice(0, 10);   // ilovadagi td() bilan bir xil
  const server = { settings: { usdUzs: 12500 }, products: [],
    branchStore: { f702: { customers: [{ id: 77, name: 'Ali <b>x</b>', debt: 250000 }], batches: [], dailyClosings: [],
      sales: [{ id: 1, date: t, staffId: 9, totalUsd: 40, paidUsd: 40, debtUsd: 0, profitUsd: 15, payType: 'usd', items: [{ qty: 2 }] },
        { id: 2, date: t, staffId: 9, custId: 77, totalUsd: 20, paidUsd: 0, debtUsd: 20, profitUsd: 5, payType: 'debt', items: [{ qty: 1 }] },
        { id: 3, date: t, staffId: 5, totalUsd: 500, paidUsd: 500, debtUsd: 0, profitUsd: 100, payType: 'usd', items: [{ qty: 9 }] }],
      cashboxes: [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 1000 }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 540 },
        { id: 4, name: 'Diller', cur: 'USD', type: 'dealer', bal: 5 }, { id: 5, name: 'Shaxsiy kassa', cur: 'USD', type: 'qobiljon', bal: 77 }] } } };
  try {
    const ctx = await browser.newContext();
    await ctx.addInitScript({ content: supabaseStub({ loggedIn: true }) });
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.includes('/functions/app-data-load')) return json(route, 200, { data: JSON.parse(JSON.stringify(server)) });
      if (u.includes('/functions/staff-whoami')) return json(route, 200, { staff: { id: 9, name: 'Sotuvchi', filial: 'f702', active: true, role: 'sotuvchi' } });
      if (u.includes('/functions/firma-kassa')) { const b = JSON.parse(route.request().postData()); calls.push(b);
        if (mode === 'net') return route.abort('failed');
        // «server»: kassa qoldig'i bazada kamayadi (keyingi app-data-load shu qiymatni qaytaradi — haqiqiy serverdagidek)
        const bx = server.branchStore.f702.cashboxes.find(k => k.id === b.boxId); bx.bal = Math.round((bx.bal - b.amount) * 100) / 100;
        return json(route, 200, { ok: true, authority: true, transfer: { branchBalance: bx.bal, amount: b.amount } }); }
      if (u.includes('/functions/app-data-save')) { saved = JSON.parse(route.request().postData()).data; return json(route, 200, { ok: true }); }
      if (u.includes('/functions/')) return json(route, 200, {});
      if (u.startsWith(`http://127.0.0.1:${port}/`)) return route.continue();
      if (u.includes('cdn.jsdelivr.net')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      return route.abort('failed');
    });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/sotuvchi.html`); await page.waitForTimeout(1500);
    await page.evaluate(() => svSwitchTab('kassa'));
    const v = await page.evaluate(() => ({ text: document.getElementById('sv-content').textContent,
      ids: [...document.querySelectorAll('#sv-content input[id^="svkh-"]')].map(i => i.id).filter(x => x !== 'svkh-note'),
      bold: document.querySelectorAll('#sv-content b b').length }));
    assert.deepEqual(v.ids, ['svkh-1', 'svkh-3'], "Shaxsiy va diller kassasi yo'q");
    assert.doesNotMatch(v.text, /foyda/i, "sotuvchiga foyda ko'rsatilmaydi");
    assert.match(v.text, /Sotdim\$60\.00/, "faqat o'z savdolari (boshqa sotuvchi $500 kirmaydi)");
    assert.match(v.text, /Qarzga berdim\$20\.00/); assert.match(v.text, /Mening qarzdorlarim/); assert.match(v.text, /Ali <b>x<\/b>/, 'mijoz nomi matn sifatida');
    assert.match(v.text, /oʻrnim/); assert.equal(v.bold, 0);
    // Tarmoq xatosi — hech narsa o'zgarmaydi; qayta bosish — o'sha kalit
    await page.fill('#svkh-3', '40'); await page.evaluate(() => svKassaClose());
    let st = await page.evaluate(() => ({ bal: S.cashboxes.find(k => k.id === 3).bal, n: S.dailyClosings.length }));
    assert.deepEqual(st, { bal: 540, n: 0 }, 'server javob bermadi — kassa yopilmadi');
    await page.fill('#svkh-3', '600'); await page.evaluate(() => svKassaClose());
    assert.equal(calls.length, 1, 'qoldiqdan ortiq — serverga yuborilmadi');
    mode = 'ok';
    await page.fill('#svkh-3', '40'); await page.evaluate(() => svKassaClose()); await page.waitForTimeout(300);
    st = await page.evaluate(() => ({ bal: S.cashboxes.find(k => k.id === 3).bal, dc: S.dailyClosings[0] }));
    assert.equal(st.bal, 500, 'qoldiq server javobidan');
    assert.equal(calls.length, 2); assert.equal(calls[1].idemKey, calls[0].idemKey, 'qayta bosish — o\'sha kalit (takror yozilmaydi)');
    assert.deepEqual([calls[1].action, calls[1].boxId, calls[1].currency, calls[1].amount, calls[1].filial], ['daily_close', 3, 'USD', 40, 'f702']);
    assert.equal(st.dc.performedBy, 'Sotuvchi'); assert.equal(st.dc.toFirma, true); assert.equal(st.dc.totalProfit, undefined, 'yozuvda ham foyda yo\'q');
    assert.ok(saved && saved.branchStore.f702.dailyClosings.some(c => c.viaPortal === 'sotuvchi'), 'yozuv saqlandi');
    assert.match(await page.textContent('#sv-content'), /Kassa yopish tarixi.*\$40\.00/s);
    assert.deepEqual(errs, []);
  } finally { await browser.close(); srv.close(); }
}

module.exports = {
  name: 'P25 — v23.7: kassa yopish (sotuvchi ham), Bosh sahifa «Biznes holati» (foyda/ziyon), sotuvchi «Kassa» bo\'limi',
  cases: [
    { name: "Server (haqiqiy PostgreSQL): sotuvchi o'z filiali savdo kassasini Bosh kassaga topshiradi; Shaxsiy/diller kassasi, boshqa amallar — rad", run: testSellerDailyCloseServer },
    { name: "Admin oynasi: Shaxsiy/diller kassasi yo'q, foyda faqat egasiga, qoldiqdan ortiq rad, faqat kiritilgan kassalar yuboriladi", run: testKassaCloseModal },
    { name: "Biznes holati: ombor (faqat to'langan, omborda bor), yo'ldagi, qarzlar, investor/ta'sischi, natija; filialda — o'ziniki", run: testBizStatus },
    { name: "Sotuvchi portali «Kassa»: o'z kuni, qarzdorlari, foydasiz; yopish fail-close, qayta bosishda o'sha kalit", run: testSellerPortalKassa },
  ],
};
