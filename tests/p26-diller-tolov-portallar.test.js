// P26 — v23.8: DILLER PUL YUBORADI (30-migratsiya) + bosh sahifa (Dillerlar bloki, Kategoriyalar/Xodimlar) + portallar.
//  • Server (haqiqiy PostgreSQL — PGlite, haqiqiy `dealer-pay`): diller naqd so'm / karta / naqd $ yuboradi — kurs SERVERDAN
//    (diller yuborgan kurs e'tiborsiz), qarz DARHOL kamayadi; takror — ikki marta yozilmaydi; qarzdan ortiq — rad;
//    kassir «Qabul qildim» — pul tanlangan kassaga (valyuta mos, Shaxsiy kassa emas), «Rad etish» — qarz qaytadi;
//    qabul qilingandan keyin rad etib bo'lmaydi; huquqsiz xodim, boshqa diller, boshqa filial — rad; 30-migratsiyasiz — 409.
//  • Admin (haqiqiy js/main.js + js/dealer-pay.js, Chromium): bildirishnoma oynasi — qabul (kassa qoldig'i serverdan),
//    rad (sabab majburiy, qarz qaytadi), diller nomidagi HTML ishlamaydi; bosh sahifa — Dillerlar bloki, grafiklar, 7 kunlik grafik yo'q.
//  • Diller portali (haqiqiy diller.html): «To'lov» — so'm kurs bo'yicha, qarzdan ortiq rad, qayta bosishda o'sha kalit;
//    yuqori panel — ikonkalar (matnli «Chiqish» tugmasi yo'q), menyuda barcha bo'limlar.
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
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'dealers', 'dealer_payments', 'dealer_pay_notices'];
const PERMS = { 'r-kas': ['kassalar.transact', 'kassalar.view'], 'r-sel': ['savdo.create'], 'r-dv': ['dillerlar.view'] };
const USERS = { 't-admin': { id: '00000000-0000-4000-8000-000000000001' }, 't-kas': { id: '00000000-0000-4000-8000-000000000007' }, 't-sel': { id: '00000000-0000-4000-8000-000000000008' }, 't-dv': { id: '00000000-0000-4000-8000-000000000009' }, 't-d1': { id: '00000000-0000-4000-8000-0000000000d1' }, 't-d2': { id: '00000000-0000-4000-8000-0000000000d2' }, 't-x': { id: '00000000-0000-4000-8000-0000000000ff' } };
const BOXES = [
  { id: 1, name: "Naqd so'm", cur: 'UZS', type: 'cash', bal: 0 }, { id: 2, name: 'Karta', cur: 'UZS', type: 'card', bal: 0 },
  { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 0 }, { id: 4, name: 'Diller kassasi', cur: 'USD', type: 'dealer', bal: 0 },
  { id: 5, name: 'Shaxsiy kassa', cur: 'USD', type: 'qobiljon', bal: 0 },
];
const json = (route, status, obj) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });
const body = (r) => JSON.parse(r.body);

async function world({ no30 = false, rate = 12500 } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  await pg.exec(SCHEMA);
  if (no30) await pg.exec(`drop function public.dealer_pay_notice_create(bigint, text, numeric, numeric, text, text); drop table public.dealer_pay_notices;`);
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: rate ? { usdUzs: rate } : {}, branchStore: { baza: { cashboxes: BOXES } } })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('baza', $1::jsonb)`, [JSON.stringify({ cashboxes: BOXES })]);
  await pg.exec(`insert into auth.users values ('00000000-0000-4000-8000-0000000000d1'), ('00000000-0000-4000-8000-0000000000d2'), ('00000000-0000-4000-8000-0000000000ff')`);
  await pg.query(`insert into dealers (auth_user_id, login, name, debt_usd, total_paid_usd, filial) values
    ('00000000-0000-4000-8000-0000000000d1', 'd1', 'Diller Bir', 1000, 0, 'baza'), ('00000000-0000-4000-8000-0000000000d2', 'd2', 'Diller Ikki', 50, 0, 'f729'), ('00000000-0000-4000-8000-0000000000ff', 'dx', 'Nofaol', 10, 0, 'baza')`);
  await pg.query(`update dealers set active = false where login = 'dx'`);
  const memTables = {
    staff: [
      { id: 1, auth_user_id: '00000000-0000-4000-8000-000000000001', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
      { id: 7, auth_user_id: '00000000-0000-4000-8000-000000000007', role: 'sotuvchi', active: true, filial: 'baza', name: 'Kassir', login: 'kas' },
      { id: 8, auth_user_id: '00000000-0000-4000-8000-000000000008', role: 'sotuvchi', active: true, filial: 'baza', name: 'Sotuvchi', login: 'sel' },
      { id: 9, auth_user_id: '00000000-0000-4000-8000-000000000009', role: 'sotuvchi', active: true, filial: 'baza', name: 'Kuzatuvchi', login: 'dv' },
    ],
    staff_roles: [{ staff_id: 7, role_id: 'r-kas' }, { staff_id: 8, role_id: 'r-sel' }, { staff_id: 9, role_id: 'r-dv' }],
    role_permissions: Object.entries(PERMS).flatMap(([rid, keys]) => keys.map(k => ({ role_id: rid, permission_id: k, permissions: { key: k } }))),
    staff_audit_log: [], idempotency_keys: [],
  };
  return { pg, client: makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: USERS }) };
}
const num = async (pg, sql, params) => +(((await pg.query(sql, params)).rows[0] || {}).v ?? NaN);
const debt = (pg, login) => num(pg, `select debt_usd v from dealers where login=$1`, [login]);
const box = (pg, b) => num(pg, `select coalesce((select balance from cashbox_balances where filial='baza' and box_local_id=$1),0) v`, [b]);

// ── 1. Server: yuborish → qabul / rad ──
async function testServerFlow() {
  const { pg, client } = await world();
  try {
    const h = loadFunction('dealer-pay', client);
    // so'm — kurs serverdan (diller yuborgan "rate" e'tiborsiz)
    let r = await h(post({ action: 'send', payType: 'cash_uzs', amount: 1250000, rate: 1, idemKey: 'k-uzs-0001' }, 't-d1'));
    assert.equal(r.statusCode, 200, r.body);
    let n1 = body(r).notice;
    assert.equal(n1.amountUsd, 100, "1 250 000 so'm / 12 500 = $100"); assert.equal(n1.rate, 12500); assert.equal(n1.status, 'pending');
    assert.equal(await debt(pg, 'd1'), 900, 'qarz DARHOL kamaydi');
    assert.equal(await num(pg, `select count(*)::int v from dealer_payments where amount_usd = 100`), 1, "to'lov tarixi yozildi");
    assert.equal(await box(pg, 1), 0, 'kassa hali o\'zgarmagan (kassir qabul qilmagan)');
    // takror — ikki marta yechilmaydi; o'sha kalit boshqa summa — rad
    r = await h(post({ action: 'send', payType: 'cash_uzs', amount: 1250000, idemKey: 'k-uzs-0001' }, 't-d1'));
    assert.equal(r.statusCode, 200); assert.equal(body(r).replay, true); assert.equal(await debt(pg, 'd1'), 900);
    r = await h(post({ action: 'send', payType: 'cash_uzs', amount: 999, idemKey: 'k-uzs-0001' }, 't-d1'));
    assert.equal(r.statusCode, 400); assert.equal(await debt(pg, 'd1'), 900);
    // qarzdan ortiq — rad; naqd $ va karta
    r = await h(post({ action: 'send', payType: 'cash_usd', amount: 901, idemKey: 'k-usd-over1' }, 't-d1'));
    assert.equal(r.statusCode, 400); assert.match(body(r).error, /qarzingizdan/); assert.equal(await debt(pg, 'd1'), 900);
    r = await h(post({ action: 'send', payType: 'cash_usd', amount: 300, idemKey: 'k-usd-00001' }, 't-d1'));
    const n2 = body(r).notice; assert.equal(n2.currency, 'USD'); assert.equal(await debt(pg, 'd1'), 600);
    r = await h(post({ action: 'send', payType: 'card', amount: 625000, idemKey: 'k-card-0001' }, 't-d1'));
    const n3 = body(r).notice; assert.equal(n3.amountUsd, 50); assert.equal(await debt(pg, 'd1'), 550);
    // diller emas / nofaol diller / tokensiz — rad
    assert.equal((await h(post({ action: 'send', payType: 'cash_usd', amount: 1, idemKey: 'k-staff-001' }, 't-kas'))).statusCode, 403, 'xodim diller nomidan yubora olmaydi');
    assert.equal((await h(post({ action: 'send', payType: 'cash_usd', amount: 1, idemKey: 'k-nofaol-01' }, 't-x'))).statusCode, 403);
    assert.equal((await h(post({ action: 'mine' }, 't-d1'))).statusCode, 200);
    const mine = body(await h(post({ action: 'mine' }, 't-d1')));
    assert.equal(mine.notices.length, 3); assert.equal(mine.rate, 12500, 'diller bugungi kursni ko\'radi');
    assert.equal(body(await h(post({ action: 'mine' }, 't-d2'))).notices.length, 0, 'boshqa dillerning to\'lovlari ko\'rinmaydi');

    // Xodim: ro'yxat — kuzatuvchi ko'radi, lekin qabul qila olmaydi; sotuvchi — ko'ra ham olmaydi
    const list = body(await h(post({ action: 'list', status: 'pending' }, 't-dv')));
    assert.equal(list.notices.length, 3); assert.equal(list.notices[0].dealerName, 'Diller Bir');
    assert.equal((await h(post({ action: 'list' }, 't-sel'))).statusCode, 403);
    assert.equal((await h(post({ action: 'accept', id: n1.id, boxId: 1 }, 't-dv'))).statusCode, 403);
    // Qabul: valyuta mos bo'lishi shart; Shaxsiy kassa — yo'q
    assert.equal((await h(post({ action: 'accept', id: n1.id, boxId: 3 }, 't-kas'))).statusCode, 400, "so'm to'lov dollar kassaga emas");
    assert.equal((await h(post({ action: 'accept', id: n2.id, boxId: 5 }, 't-kas'))).statusCode, 400, 'Shaxsiy kassaga emas');
    r = await h(post({ action: 'accept', id: n1.id, boxId: 1 }, 't-kas'));
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).notice.status, 'accepted'); assert.equal(+body(r).balances['1'], 1250000);
    assert.equal(await box(pg, 1), 1250000, "pul so'm kassaga tushdi");
    const led = (await pg.query(`select op_kind, ref_type, note, staff_name from cashbox_ledger where group_key = $1`, ['dpn:' + n1.id])).rows[0];
    assert.equal(led.op_kind, 'dealer_pay'); assert.match(led.note, /Diller Bir/); assert.equal(led.staff_name, 'Kassir');
    r = await h(post({ action: 'accept', id: n1.id, boxId: 1 }, 't-kas'));
    assert.equal(r.statusCode, 200); assert.equal(body(r).replay, true); assert.equal(await box(pg, 1), 1250000, 'takror — ikki marta kirmaydi');
    r = await h(post({ action: 'reject', id: n1.id, reason: 'xato' }, 't-kas'));
    assert.equal(r.statusCode, 400, 'qabul qilingandan keyin rad etib bo\'lmaydi'); assert.equal(await debt(pg, 'd1'), 550);
    r = await h(post({ action: 'accept', id: n2.id, boxId: 4 }, 't-kas'));
    assert.equal(r.statusCode, 200); assert.equal(await box(pg, 4), 300, '$ — Diller kassasiga');
    // Rad: sabab majburiy; qarz qaytadi, tarix o'chmaydi (teskari yozuv)
    assert.equal((await h(post({ action: 'reject', id: n3.id, reason: '' }, 't-kas'))).statusCode, 400);
    r = await h(post({ action: 'reject', id: n3.id, reason: 'Pul kelmadi' }, 't-kas'));
    assert.equal(r.statusCode, 200, r.body); assert.equal(body(r).dealerDebtUsd, 600); assert.equal(await debt(pg, 'd1'), 600, 'qarz qaytdi');
    assert.equal(await num(pg, `select sum(amount_usd) v from dealer_payments where dealer_id = (select id from dealers where login='d1')`), 400, "to'lovlar yig'indisi = qabul qilingan 100 + 300");
    r = await h(post({ action: 'reject', id: n3.id, reason: 'Pul kelmadi' }, 't-kas'));
    assert.equal(body(r).replay, true); assert.equal(await debt(pg, 'd1'), 600, 'takror rad — qarz ikki marta qaytmaydi');
    assert.equal((await h(post({ action: 'accept', id: n3.id, boxId: 2 }, 't-kas'))).statusCode, 400, 'rad etilganni qabul qilib bo\'lmaydi');
    // Boshqa filial xabarnomasi — kassir o'z filialidan tashqarini ko'rmaydi/qila olmaydi
    r = await h(post({ action: 'send', payType: 'cash_usd', amount: 20, idemKey: 'k-f729-0001' }, 't-d2'));
    const nf = body(r).notice; assert.equal(nf.filial, 'f729');
    assert.equal((await h(post({ action: 'accept', id: nf.id, boxId: 4, filial: 'f729' }, 't-kas'))).statusCode, 404);
    assert.ok(!body(await h(post({ action: 'list', filial: 'f729' }, 't-kas'))).notices.some(n => n.id === nf.id), 'kassir faqat o\'z filiali');
    assert.ok(body(await h(post({ action: 'list', filial: 'f729' }, 't-admin'))).notices.some(n => n.id === nf.id), 'administrator filialni tanlaydi');
    // Jadval — brauzerga yopiq
    const acl = (await pg.query(`select has_table_privilege('authenticated', 'public.dealer_pay_notices', 'select') a, has_function_privilege('authenticated', 'public.dealer_pay_notice_create(bigint, text, numeric, numeric, text, text)', 'execute') f`)).rows[0];
    assert.deepEqual(acl, { a: false, f: false }, 'faqat server (service_role)');
  } finally { unloadFunctions(); await pg.close(); }
}

async function testServerGuards() {
  let w = await world({ rate: 0 });
  try {
    const h = loadFunction('dealer-pay', w.client);
    let r = await h(post({ action: 'send', payType: 'cash_uzs', amount: 1000, idemKey: 'k-norate-01' }, 't-d1'));
    assert.equal(r.statusCode, 409, 'kurs belgilanmagan — yuborilmaydi'); assert.equal(await debt(w.pg, 'd1'), 1000);
  } finally { unloadFunctions(); await w.pg.close(); }
  w = await world({ no30: true });
  try {
    const h = loadFunction('dealer-pay', w.client);
    const r = await h(post({ action: 'send', payType: 'cash_usd', amount: 10, idemKey: 'k-no30-0001' }, 't-d1'));
    assert.equal(r.statusCode, 409); assert.equal(body(r).migration30Pending, true); assert.equal(await debt(w.pg, 'd1'), 1000);
    assert.equal(body(await h(post({ action: 'list' }, 't-kas'))).migration30Pending, true);
  } finally { unloadFunctions(); await w.pg.close(); }
}

// ── 2. Admin: bildirishnoma oynasi va bosh sahifa ──
const EVIL = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
async function testAdminNotices() {
  const calls = [];
  const notices = () => [
    { id: 11, dealerId: 1, dealerName: 'Bir ' + EVIL, filial: 'baza', payType: 'cash_uzs', currency: 'UZS', amount: 1250000, rate: 12500, amountUsd: 100, note: EVIL, status: 'pending', createdAt: new Date().toISOString() },
    { id: 12, dealerId: 2, dealerName: 'Ikki', filial: 'baza', payType: 'cash_usd', currency: 'USD', amount: 40, rate: 12500, amountUsd: 40, status: 'pending', createdAt: new Date().toISOString() }];
  const { browser, page, consoleErrors } = await loadApp({ mockRoutes: [{ url: '**/.netlify/functions/dealer-pay', handler: (route) => {
    const b = JSON.parse(route.request().postData() || '{}'); calls.push(b);
    if (b.action === 'list') return json(route, 200, { ok: true, notices: notices() });
    if (b.action === 'accept') return json(route, 200, { ok: true, notice: { ...notices()[1], status: 'accepted', boxId: b.boxId, boxName: 'Diller kassasi' }, balances: { [b.boxId]: 140 } });
    if (b.action === 'reject') return json(route, 200, { ok: true, notice: { ...notices()[0], status: 'rejected', rejectReason: b.reason }, dealerDebtUsd: 900, dealerTotalPaidUsd: 0 });
    return json(route, 400, { error: 'x' });
  } }] });
  try {
    await page.addScriptTag({ path: path.join(ROOT, 'js', 'dealer-pay.js') });
    const r = await page.evaluate(async () => {
      document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div><div id="pg-dashboard"></div>');
      save = () => {}; auditLog = () => {}; _cloudEnabled = true; CURRENT_USER = null; CUR.usdUzs = 12500;
      authHeaders = async () => ({ Authorization: 'Bearer t' });
      const t = td();
      Object.assign(S, { branch: 'baza', page: 'dashboard', cashTxns: [],
        cashboxes: [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 0 }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 0 },
          { id: 4, name: 'Diller kassasi', cur: 'USD', type: 'dealer', bal: 100 }, { id: 5, name: 'Shaxsiy kassa', cur: 'USD', type: 'qobiljon', bal: 0 }],
        dealers: [{ id: 1, name: 'Bir ' + '<b>x</b>', debt: 800, filial: 'baza', region: 'R' }, { id: 2, name: 'Ikki', debt: 60, filial: 'baza' }, { id: 3, name: 'Boshqa filial', debt: 999, filial: 'f729' }],
        dealerStock: [], dealerTxns: [{ dealerId: 1, type: 'sale', date: t, totalUsd: 70 }],
        products: [{ id: 1, name: 'Drel', cat: 'Asbob' }, { id: 2, name: 'Disk', cat: '' }],
        sales: [{ id: 1, date: t, totalUsd: 90, subtotalUsd: 100, staffName: 'Ali', items: [{ pid: 1, qty: 1, lineUsd: 60 }, { pid: 2, qty: 2, lineUsd: 40 }] },
                { id: 2, date: t, totalUsd: 30, items: [{ pid: 1, qty: 1, lineUsd: 30 }] }] });
      await dpnLoad(true);
      pgDashboard();
      const dash = document.getElementById('pg-dashboard');
      const dashText = dash.textContent;
      const cats = [...dash.querySelectorAll('.ox-chart')].map(c => c.textContent.replace(/\s+/g, ' '));
      dpnSheet();
      const opts = [...document.querySelectorAll('#dpn-box-12 option')].map(o => +o.value);
      const optsUzs = [...document.querySelectorAll('#dpn-box-11 option')].map(o => +o.value);
      await dpnAccept(12);
      const afterAcc = { bal: S.cashboxes[2].bal, st: DPN.list.find(n => n.id === 12).status, txn: S.cashTxns.length };
      await dpnReject(11);   // sababsiz — yuborilmaydi
      return { dashText, cats, has7: /7 kunlik/.test(dashText) || !!dash.querySelector('.ox-bars'), opts, optsUzs, afterAcc };
    });
    r.noReason = calls.filter(c => c.action === 'reject').length;
    Object.assign(r, await page.evaluate(async () => {
      dpnRejectAsk(11); document.getElementById('dpn-rs-11').value = 'Pul kelmadi';
      await dpnReject(11);
      return { debt: S.dealers[0].debt, st11: DPN.list.find(n => n.id === 11).status, xss: window.__xss };
    }));
    assert.equal(r.has7, false, "7 kunlik grafik olib tashlangan");
    assert.match(r.dashText, /Dillerlar/); assert.match(r.dashText, /2 ta · /, 'faqat shu filial dillerlari'); assert.match(r.dashText, /toʻlov kutilmoqda/);
    assert.match(r.cats[0], /Kategoriyalar/); assert.match(r.cats[0], /Asbob\$84/, "chegirma hisobga olingan: 60×0.9 + 30"); assert.match(r.cats[0], /Kategoriyasiz\$36/);
    assert.match(r.cats[1], /Xodimlar/); assert.match(r.cats[1], /Ali\$90/); assert.match(r.cats[1], /Egasi \/ admin\$30/);
    assert.deepEqual(r.opts, [4, 3], "$ to'lov: avval Diller kassasi, keyin dollar kassa; Shaxsiy kassa yo'q");
    assert.deepEqual(r.optsUzs, [1], "so'm to'lov — faqat so'm kassalar");
    assert.deepEqual(r.afterAcc, { bal: 140, st: 'accepted', txn: 1 }, 'qabul — qoldiq serverdan, kassa tarixi yozildi');
    assert.equal(r.noReason, 0, 'sababsiz rad — serverga yuborilmadi');
    assert.equal(r.st11, 'rejected'); assert.equal(r.debt, 900, 'rad — diller qarzi serverdan qaytdi');
    const acc = calls.find(c => c.action === 'accept'); assert.deepEqual([acc.id, acc.boxId, acc.filial], [12, 4, 'baza']);
    assert.equal(r.xss, undefined, 'diller nomi va izohidagi HTML ishlamadi');
    assert.deepEqual(consoleErrors, []);
  } finally { await browser.close(); }
}

// ── 3. Diller portali: «To'lov», yuqori panel, menyu ──
async function testDealerPortal() {
  const calls = []; let mode = 'net';
  const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); s.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript({ content: supabaseStub({ loggedIn: true }) });
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.includes('/functions/dealer-pay')) { const b = JSON.parse(route.request().postData() || '{}'); calls.push(b);
        if (b.action === 'mine') return json(route, 200, { ok: true, rate: 12500, notices: [{ id: 5, payType: 'card', currency: 'UZS', amount: 125000, rate: 12500, amountUsd: 10, status: 'rejected', rejectReason: 'Pul <b>kelmadi</b>', createdAt: new Date().toISOString() }] });
        if (mode === 'net') return route.abort('failed');
        return json(route, 200, { ok: true, rate: 12500, notice: { id: 6, payType: b.payType, currency: 'UZS', amount: b.amount, rate: 12500, amountUsd: 100, status: 'pending', createdAt: new Date().toISOString() }, dealerDebtUsd: 900, dealerTotalPaidUsd: 100 }); }
      if (u.includes('/functions/')) return json(route, 200, {});
      if (u.startsWith(`http://127.0.0.1:${port}/`)) return route.continue();
      if (u.includes('cdn.jsdelivr.net')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      return route.abort('failed');
    });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/diller.html`); await page.waitForTimeout(800);
    // Supabase stub diller qatorini bermaydi — ilovani test ichida ochamiz (haqiqiy funksiyalar)
    await page.evaluate(() => { ME = { id: 1, name: 'Jasur Bek', region: 'Samarqand', filial: 'baza', debt_usd: 1000, total_paid_usd: 0, points: 0 }; STOCK = []; SALES = []; CATALOG = []; MY_ORDERS = []; dlShowApp(); });
    const top = await page.evaluate(() => ({ av: document.getElementById('dl-av').textContent, btnText: [...document.querySelectorAll('.dl-topbar button')].map(b => b.textContent.trim()),
      labels: [...document.querySelectorAll('.dl-topbar button')].map(b => b.getAttribute('aria-label')), tiles: [...document.querySelectorAll('#pt-bnav .m-bn-item')].map(b => b.dataset.tab),
      menu: !!document.getElementById('pt-sheet') || [...document.querySelectorAll('#pt-bnav .m-bn-item')].some(b => /Menyu/.test(b.textContent)) }));
    assert.equal(top.av, 'JB');
    assert.ok(top.btnText.every(t => !/Chiqish/.test(t)), "yuqorida matnli «Chiqish» yo'q — ikonka");
    assert.ok(top.labels.includes('Profil va sozlamalar') && top.labels.includes('Bosh sahifa'), "ikonkalarda nom (ekran o'quvchi uchun); v24.7: avatar — profil/sozlamalar, brend — Bosh sahifa");
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.pt-side-it')].some(b => /Chiqish/.test(b.textContent))), "Chiqish — yon menyuda (kompyuter) va Sozlamalarda");
    // v24.5 (egasi so'ragan): Sotuv markazda; Buyurtma + Buyurtmalarim bitta bo'limda (segment)
    assert.deepEqual(top.tiles, ['stock', 'order', 'sale', 'pay', 'history'], 'pastki panelda barcha bo\'limlar');
    assert.equal(top.menu, false, "«Menyu» olib tashlangan");
    await page.evaluate(() => dlSwitchTab('pay')); await page.waitForTimeout(300);
    let t = await page.textContent('#dl-content');
    assert.match(t, /1 \$ = 12 500/); assert.match(t, /Pul <b>kelmadi<\/b>/, 'rad sababi matn sifatida');
    await page.fill('#dlp-amt', '20000000'); await page.dispatchEvent('#dlp-amt', 'input');
    assert.match(await page.textContent('#dlp-conv'), /oshib ketdi/);
    await page.evaluate(() => dlPaySend());
    assert.equal(calls.filter(c => c.action === 'send').length, 0, 'qarzdan ortiq — yuborilmadi');
    await page.fill('#dlp-amt', '1250000'); await page.dispatchEvent('#dlp-amt', 'input');
    assert.match(await page.textContent('#dlp-conv'), /\$100\.00.*\$900\.00/s);
    await page.evaluate(() => dlPaySend()); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => ME.debt_usd), 1000, 'tarmoq xatosi — qarz o\'zgarmadi');
    mode = 'ok';
    await page.fill('#dlp-amt', '1250000');
    await page.evaluate(() => dlPaySend()); await page.waitForTimeout(300);
    const sends = calls.filter(c => c.action === 'send');
    assert.equal(sends.length, 2); assert.equal(sends[1].idemKey, sends[0].idemKey, 'qayta bosish — o\'sha kalit');
    assert.deepEqual([sends[1].payType, sends[1].amount], ['cash_uzs', 1250000]); assert.ok(!('rate' in sends[1]), 'kurs brauzerdan yuborilmaydi');
    assert.equal(await page.evaluate(() => ME.debt_usd), 900, 'qarz serverdan');
    assert.match(await page.textContent('#dl-content'), /Kassir tasdigʻi kutilmoqda/);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.equal(ov, 0, 'telefonda gorizontal siljish yo\'q');
    assert.deepEqual(errs, []);
  } finally { await browser.close(); srv.close(); }
}

module.exports = {
  name: "P26 — v23.8: diller pul yuboradi (30-migratsiya), bosh sahifa Dillerlar/grafiklar, portallar",
  cases: [
    { name: "Server (haqiqiy PostgreSQL): kurs serverdan, qarz darhol kamayadi, takror yo'q; qabul — kassaga, rad — qarz qaytadi; huquq va filial chegarasi", run: testServerFlow },
    { name: "Server: kurs belgilanmagan — 409; 30-migratsiyasiz — 409, hech narsa yozilmaydi", run: testServerGuards },
    { name: "Admin: bildirishnoma — kassa tanlovi (valyuta, Shaxsiy kassa yo'q), qabul/rad; bosh sahifa — Dillerlar, Kategoriyalar, Xodimlar, 7 kunlik yo'q", run: testAdminNotices },
    { name: "Diller portali: «To'lov» kurs bo'yicha, ortiq rad, tarmoq xatosida o'zgarmaydi, o'sha kalit; ikonkali panel, barcha bo'limlar pastki panelda (menyusiz)", run: testDealerPortal },
  ],
};
