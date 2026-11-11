// P14 — v11: LOKAL TO'LIQ STEK E2E (F4 + B7).
// Haqiqiy Chromium'da HAQIQIY index.html / sotuvchi.html + js/*.js; brauzer so'rovlari
// HAQIQIY netlify/functions/*.js handler'lariga boradi; pul jadvallari va RPC'lar — HAQIQIY
// PostgreSQL (PGlite). Soxta qism faqat: Supabase Auth (token → xodim) va CDN kutubxonalari.
// Bu production E2E EMAS (production'da deploy/migratsiya qilinmagan) — lekin brauzer ↔ server
// ↔ baza zanjiri butunligicha, tarmoq (HTTP) orqali sinaladi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions } = require('./helpers/mem-supabase');

const ROOT = path.join(__dirname, '..');
const PRELUDE = `
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema extensions; create schema auth; create schema storage;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text);
alter table storage.objects enable row level security;`;
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger',
  'sales', 'batches', 'customer_balances', 'supplier_balances', 'expense_categories', 'ledger_ops', 'customer_debt_ledger', 'supplier_debt_ledger', 'stock_ledger'];
const BOXES = [
  { id: 1, name: "Naqd So'm", icon: '💵', cur: 'UZS', type: 'cash', bal: 1200000 },
  { id: 2, name: 'Karta', icon: '💳', cur: 'UZS', type: 'card', bal: 0 },
  { id: 3, name: 'Dollar ($)', icon: '💲', cur: 'USD', type: 'usd', bal: 300 },
  { id: 4, name: 'Diller kassasi', icon: '🚚', cur: 'USD', type: 'dealer', bal: 0 },
  { id: 5, name: 'Powerful kassa', icon: '🔒', cur: 'USD', type: 'qobiljon', bal: 0 },
];
const PRODUCT = { id: 101, sku: 'PG-1001', name: 'Bosch drel', cat: 'Drel', brand: 'Bosch', sellUsd: 50, unit: 'dona' };

async function stack({ webRoot = ROOT } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8'));
  const branch = { cashboxes: BOXES, sales: [], customers: [], suppliers: [], expenses: [], cashTxns: [], revisions: [], dailyClosings: [], salaryPeople: [],
    batches: [{ id: 9001, pid: 101, bno: '01', qty: 20, sold: 0, costUsd: 30, date: '2026-09-01', status: 'active', items: [] }], batchCounter: 1 };
  const today = new Date().toISOString().slice(0, 10);
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({
    products: [PRODUCT], settings: { usdUzs: 12000, usdCny: 7, company: 'Powerful' }, branchDebt: { f729: 500 }, partners: [], partnerPeriods: [],
    branchStore: { f729: branch, baza: { ...branch, cashboxes: BOXES.map(b => ({ ...b, bal: 0 })), batches: [] } }, auditLogs: [], deletedIds: {} })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('f729', $1::jsonb), ('baza', $2::jsonb)`,
    [JSON.stringify(branch), JSON.stringify({ ...branch, cashboxes: BOXES.map(b => ({ ...b, bal: 0 })), batches: [] })]);
  await pg.exec(`select set_config('fw.stock_move','1',false); insert into batches (local_id, filial, pid, qty, sold, cost_usd, batch_date, status) values ('9001','f729',101,20,0,30,'2026-09-01','active'); select set_config('fw.stock_move','',false)`);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase-migration-24-v11-cash-authority.sql'), 'utf8')); // JSON qoldiqlari → baza (opening)
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'), 'utf8'));   // v23.2: JSON qarz/ombor/savdo → baza (opening, takroriy — xavfsiz)
  // Xodimlar bazada ham (expense_categories.created_by → staff.id tashqi kaliti)
  await pg.exec(`insert into staff (id, login, name, role, filial) overriding system value values (1,'admin','Admin','admin','f729'), (7,'kas','Kassir 729','sotuvchi','f729')`);
  const memTables = {
    staff: [
      { id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'f729', name: 'Admin', login: 'admin' },
      { id: 7, auth_user_id: 'u-kas', role: 'sotuvchi', active: true, filial: 'f729', name: 'Kassir 729', login: 'kas' },
    ],
    staff_roles: [{ staff_id: 7, role_id: 'r-kas', roles: { key: 'cashier' } }],
    role_permissions: ['kassalar.transact', 'xarajatlar.create', 'savdo.create', 'mijozlar.debt_payment'].map(k => ({ role_id: 'r-kas', permission_id: k, permissions: { key: k } })),
    roles: [{ id: 'r-kas', key: 'cashier', is_system: false }],
    staff_audit_log: [], idempotency_keys: [],
  };
  const client = makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: { 't-admin': { id: 'u-admin' }, 't-kas': { id: 'u-kas' } } });
  const handlers = {};
  const fnLog = [];
  const server = http.createServer(async (req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const m = url.match(/^\/\.netlify\/functions\/([a-z0-9-]+)$/);
    if (m) {
      let raw = ''; for await (const ch of req) raw += ch;
      try {
        handlers[m[1]] = handlers[m[1]] || loadFunction(m[1], client);
        const out = await handlers[m[1]]({ httpMethod: req.method, headers: { authorization: req.headers.authorization || '' }, body: raw });
        fnLog.push([m[1], out.statusCode]);
        res.writeHead(out.statusCode, out.headers || { 'Content-Type': 'application/json' }); res.end(out.body);
      } catch (e) { fnLog.push([m[1], 'ERR ' + e.message]); res.writeHead(500); res.end(JSON.stringify({ error: String(e.message) })); }
      return;
    }
    if (url === '/__e2e_stub.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      return res.end(`(function(){
        var tok = localStorage.getItem('__e2e_token');
        var session = tok ? { access_token: tok, user: { id: 'e2e' } } : null;
        function q(){ var c = new Proxy({}, { get: function(_, p){ if (p === 'then') return function(ok, bad){ return Promise.resolve({ data: null, error: { message: 'e2e: to\\'g\\'ridan-to\\'g\\'ri baza yo\\'q' } }).then(ok, bad); };
          if (p === 'maybeSingle' || p === 'single') return function(){ return Promise.resolve({ data: null, error: { message: 'e2e' } }); }; return function(){ return c; }; } }); return c; }
        var store = { upload: function(){ return Promise.resolve({ error: { message: 'e2e' } }); }, getPublicUrl: function(){ return { data: {} }; }, list: function(){ return Promise.resolve({ data: [] }); }, remove: function(){ return Promise.resolve({}); } };
        window.supabase = { createClient: function(){ return { auth: { getSession: function(){ return Promise.resolve({ data: { session: session } }); },
          getUser: function(){ return Promise.resolve({ data: { user: session && session.user } }); }, onAuthStateChange: function(){ return { data: { subscription: { unsubscribe: function(){} } } }; },
          signOut: function(){ return Promise.resolve({}); }, signInWithPassword: function(){ return Promise.resolve({ error: { message: 'e2e' } }); } },
          from: q, rpc: function(){ return Promise.resolve({ data: null, error: { message: 'e2e' } }); }, storage: { from: function(){ return store; } },
          channel: function(){ return { on: function(){ return { subscribe: function(){} }; } }; } }; } };
        if (navigator.serviceWorker) navigator.serviceWorker.register = function(){ return Promise.resolve({}); };
      })();`);
    }
    const file = path.join(webRoot, url === '/' ? 'index.html' : url);
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      const ext = path.extname(file);
      if (ext === '.html') data = Buffer.from(String(data).replace('<script src="js/config.js"></script>', '<script src="/__e2e_stub.js"></script>\n<script src="js/config.js"></script>'));
      res.writeHead(200, { 'Content-Type': { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' }[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox'] });
  async function open(file, { token, branch = 'f729', staffId = null, width = 1440, height = 900 }) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    await ctx.route('**/*', r => (r.request().url().startsWith(`http://127.0.0.1:${port}/`) ? r.continue() : r.abort()));
    await ctx.addInitScript(({ token, branch, staffId }) => {
      localStorage.setItem('__e2e_token', token);
      localStorage.setItem('bp_cur', JSON.stringify({ usdUzs: 12000, usdCny: 7, lastRateDate: new Date().toISOString().slice(0, 10) }));
      localStorage.setItem('bp_active_branch', branch);
      sessionStorage.setItem('bp_auth_ok', '1'); sessionStorage.setItem('bp_branch_ok', branch);
      if (staffId) sessionStorage.setItem('bp_staff_id', String(staffId)); else sessionStorage.removeItem('bp_staff_id');
    }, { token, branch, staffId });
    const page = await ctx.newPage();
    page.__errs = [];
    page.on('pageerror', e => page.__errs.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/${file}`);
    return { ctx, page };
  }
  const close = async () => { await browser.close(); server.close(); unloadFunctions(); await pg.close(); };
  return { pg, client, open, close, fnLog };
}

const num = async (pg, sql, params) => +(((await pg.query(sql, params)).rows[0] || {}).v ?? NaN);
const boxBal = (pg, b) => num(pg, `select balance v from cashbox_balances where filial='f729' and box_local_id=$1`, [b]);
const pageBals = (page) => page.evaluate(() => S.cashboxes.map(k => +k.bal));
const waitIdle = (page, ms = 700) => page.waitForTimeout(ms);

async function testAdminFlowsEndToEnd() {
  const st = await stack();
  try {
    const { pg } = st;
    const { ctx, page } = await st.open('index.html', { token: 't-admin' });
    await page.waitForFunction(() => typeof S !== 'undefined' && S.page === 'dashboard' && S.cashboxes && S.cashboxes.length === 5, null, { timeout: 15000 });
    await page.evaluate(() => { closeModal(); go('kassalar'); });
    assert.deepEqual(await pageBals(page), [1200000, 0, 300, 0, 0], 'kassa sahifasi — bazadagi qoldiq');

    // 1) Brauzer konsolidan qoldiqni o'zgartirib saqlash — server rad etadi, sahifa bazaga qaytadi
    await page.evaluate(async () => { S.cashboxes[0].bal = 999999999; S.cashboxes[2].bal = -50; await save(); });
    await waitIdle(page, 1500);
    assert.equal(await boxBal(pg, 1), 1200000, 'bazadagi qoldiq o\'zgarmadi');
    const stored = (await pg.query(`select data->'cashboxes' c from app_data_branches where branch_key='f729'`)).rows[0].c;
    assert.deepEqual(stored.map(b => +b.bal), [1200000, 0, 300, 0, 0], "JSON'ga ham soxta qoldiq yozilmadi");
    assert.deepEqual(await pageBals(page), [1200000, 0, 300, 0, 0], "sahifa server qiymatiga qaytdi");

    // 2) Kassa → Kirim (haqiqiy modal va tugma)
    await page.evaluate(() => kassaOp(1, 'in'));
    await page.fill('#ko-a', '150000'); await page.fill('#ko-d', 'E2E kirim');
    await page.click('.modal-footer .btn-primary');
    await waitIdle(page);
    assert.equal(await boxBal(pg, 1), 1350000); assert.equal((await pageBals(page))[0], 1350000);

    // 3) Ko'chirish so'm → dollar (kurs 12 000): 120 000 so'm → 10 $
    await page.evaluate(() => kassaOp(1, 'move'));
    await page.fill('#ko-a', '120000'); await page.selectOption('#ko-t', '3');
    await page.click('.modal-footer .btn-primary');
    await waitIdle(page);
    assert.deepEqual([await boxBal(pg, 1), await boxBal(pg, 3)], [1230000, 310]);

    // 4) Ortiqcha chiqim — rad, hech narsa o'zgarmaydi
    await page.evaluate(() => kassaOp(3, 'out'));
    await page.fill('#ko-a', '5000');
    await page.click('.modal-footer .btn-primary');
    await waitIdle(page);
    assert.equal(await boxBal(pg, 3), 310);

    // 5) Savdo (POS) — server savdo bilan birga kassaga yozadi
    await page.evaluate(async () => {
      go('savdo');
      S.cart = [{ key: 'k1', pid: 101, sku: 'PG-1001', name: 'Bosch drel', qty: 1, sellUsd: 50, costUsd: 30, lineUsd: 50 }];
      POS.cur = 'USD'; posOpen('pay'); posPaySet(50);   // v24.5: savdo oynasi — olingan summa majburiy
      await posFinish();
    });
    await waitIdle(page, 1500);
    assert.equal(await boxBal(pg, 3), 360, 'savdo: dollar kassaga 50 $ (serverda)');
    assert.equal(await num(pg, `select count(*)::int v from cashbox_ledger where op_kind='sale'`), 1);

    // 6) B7: Bazaga to'lov — so'm kassadan, ikki marta tez bosish → bitta to'lov
    await page.evaluate(() => { closeModal(); go('kassalar'); openPay729Baza(); });
    await page.selectOption('#p729-box', '1');
    await page.fill('#p729-amt', '600000');
    await page.evaluate(() => { const b = document.getElementById('p729-btn'); b.click(); b.click(); });
    await waitIdle(page, 1500);
    assert.equal(await num(pg, `select (data->'branchDebt'->>'f729')::numeric v from app_data where id='main'`), 450, '600 000 so\'m / 12 000 = 50 $ → qarz 500 → 450');
    assert.equal(await boxBal(pg, 1), 630000);
    assert.equal(await num(pg, `select balance v from firma_kassa_balance where currency='UZS'`), 600000, "Firma kassaga tushdi");
    assert.equal(await num(pg, `select count(*)::int v from firma_kassa_ledger`), 1, 'ikki marta bosish — bitta to\'lov');
    assert.equal(await page.evaluate(() => S.branchDebt.f729), 450, 'sahifada qolgan qarz — serverdan');

    // 7) Keyingi saqlash qarzni "qaytarib" qo'ymaydi (delta ikki marta qo'llanmaydi)
    await page.evaluate(async () => { await save(); });
    await waitIdle(page, 1500);
    assert.equal(await num(pg, `select (data->'branchDebt'->>'f729')::numeric v from app_data where id='main'`), 450);

    // 8) Sahifani qayta yuklash — qoldiqlar bazadan
    await page.reload();
    // Qayta yuklashda ilova manzildagi (#hash) bo'limni ochadi (js/main.js — _startPage), Bosh sahifani emas —
    // shuning uchun «yuklandi» sharti S.page === 'dashboard' emas (oraliq holatni kutish poyga edi)
    await page.waitForFunction(() => typeof S !== 'undefined' && S.page && S.cashboxes && S.cashboxes.length === 5 && !document.getElementById('bp-loading')?.offsetParent, null, { timeout: 15000 });
    assert.deepEqual(await pageBals(page), [630000, 0, 360, 0, 0]);
    // Yakuniy: har bir kassa qoldig'i = jurnal yig'indisi
    const ok = (await pg.query(`select bool_and(b.balance = (select coalesce(sum(case when direction='in' then amount else -amount end),0) from cashbox_ledger l where l.filial=b.filial and l.box_local_id=b.box_local_id)) v from cashbox_balances b`)).rows[0].v;
    assert.equal(ok, true);
    assert.deepEqual(page.__errs, [], 'sahifada JS xatosi yo\'q');
    await ctx.close();
  } finally { await st.close(); }
}

async function testSellerPortalEndToEnd() {
  const st = await stack();
  try {
    const { pg } = st;
    const { ctx, page } = await st.open('sotuvchi.html', { token: 't-kas', width: 390, height: 844 });
    await page.waitForFunction(() => typeof S !== 'undefined' && S && S.cashboxes && S.cashboxes.length === 5 && typeof ME !== 'undefined' && ME, null, { timeout: 15000 });
    // Xarajat (sotuvchi portali) — kassadan chiqim serverda
    await page.evaluate(() => svSwitchTab('expense'));
    // 2026-10-02: tayyor kategoriya yo'q — avval foydalanuvchi o'zi yaratadi:
    // "+ Kategoriya qo'shish" → nom → Saqlash → HAQIQIY expense-categories funksiyasi → PostgreSQL
    await page.waitForFunction(() => FWC.loaded && !/Yuklanmoqda/.test(document.getElementById('sve-cat').textContent));
    await page.click('#sve-cat-add');
    await page.fill('#fw-cat-name', '  Kamunal  ');
    await page.click('#fw-cat-save');
    await page.waitForFunction(() => !document.getElementById('fw-catmodal'));
    const catRow = (await pg.query(`select id, filial, turi, name, created_by_name from expense_categories`)).rows;
    assert.deepEqual(catRow.map(r => [r.filial, r.turi, r.name, r.created_by_name]), [['f729', 'dokon', 'Kamunal', 'Kassir 729']], 'kategoriya bazada (xodim filiali, muallif)');
    assert.equal(await page.evaluate(() => { const s = document.getElementById('sve-cat'); return s.options[s.selectedIndex].textContent; }), 'Kamunal');
    // v23.9: valyuta va kassa — kartochkalar (yashirin maydonga yoziladi); tanlov qiymati ham tekshiriladi
    await page.click('.sv-cur button[data-v="UZS"]'); await page.fill('#sve-amt', '50000'); await page.click('.sv-chips button[data-v="1"]');
    assert.deepEqual(await page.evaluate(() => [document.getElementById('sve-cur').value, document.getElementById('sve-box').value]), ['UZS', '1']);
    await page.evaluate(() => svAddExpense());
    await waitIdle(page, 1500);
    assert.equal(await boxBal(pg, 1), 1150000);
    assert.equal((await page.evaluate(() => S.cashboxes.find(k => k.id === 1).bal)), 1150000);
    // Konsoldan qoldiqni o'zgartirib saqlash — rad
    await page.evaluate(async () => { S.cashboxes[0].bal = 5e9; await svSaveShopData(); });
    await waitIdle(page, 1200);
    assert.equal(await boxBal(pg, 1), 1150000);
    assert.equal((await page.evaluate(() => S.cashboxes.find(k => k.id === 1).bal)), 1150000, 'sahifa server qiymatiga qaytdi');
    assert.equal(await num(pg, `select count(*)::int v from cashbox_ledger where staff_name='Kassir 729' and op_kind='expense'`), 1, "jurnalda kim bajargani");
    // Xarajat kategoriyaga ID bilan bog'langan; sahifa qayta yuklangandan keyin kategoriya joyida
    const catId = (await pg.query(`select id from expense_categories where name='Kamunal'`)).rows[0].id;
    assert.deepEqual(await page.evaluate(() => S.expenses.filter(e => (e.turi || 'dokon') === 'dokon').map(e => [e.cat, e.catId])), [['Kamunal', Number(catId)]]);
    await page.reload();
    await page.waitForFunction(() => typeof S !== 'undefined' && S && S.cashboxes && S.cashboxes.length === 5 && typeof ME !== 'undefined' && ME, null, { timeout: 15000 });
    await page.evaluate(() => svSwitchTab('expense'));
    await page.waitForFunction(() => FWC.loaded && !/Yuklanmoqda/.test(document.getElementById('sve-cat').textContent));
    assert.deepEqual(await page.evaluate(() => [...document.getElementById('sve-cat').options].map(o => o.textContent)), ['Kategoriya tanlang', 'Kamunal'], "qayta yuklangandan keyin ham serverdan");
    assert.deepEqual(page.__errs, []);
    await ctx.close();
  } finally { await st.close(); }
}

// v23.1: ADMIN — xarajat kategoriyalari HAQIQIY HTTP orqali (brauzer → server funksiyasi → PostgreSQL):
// yaratish, takror, xarajat ID bilan, tahrir (summa/kassa o'zgarmaydi), o'chirish (nofaol), qayta yuklash;
// 26-migratsiya bo'lmasa — xarajat yozilmaydi, pulga tegilmaydi.
async function testAdminExpenseCategoriesEndToEnd() {
  const st = await stack();
  try {
    const { pg } = st;
    const { ctx, page } = await st.open('index.html', { token: 't-admin' });
    await page.waitForFunction(() => typeof S !== 'undefined' && S.page === 'dashboard' && S.cashboxes && S.cashboxes.length === 5, null, { timeout: 15000 });
    await page.evaluate(() => { closeModal(); go('xarajatlar'); window.confirm = () => true; });
    await page.waitForFunction(() => FWC.loaded && !/Yuklanmoqda/.test(document.getElementById('ex-cat').textContent));
    assert.doesNotMatch(await page.textContent('#ex-cat'), /Svet|Yo'lkira|Abet|Soliq|Boshqa/, "tayyor kategoriya yo'q");
    // Yaratish → tanlangan
    await page.click('#ex-cat-add'); await page.fill('#fw-cat-name', ' Elektr  energiyasi '); await page.press('#fw-cat-name', 'Enter');
    await page.waitForFunction(() => !document.getElementById('fw-catmodal'));
    const cat = (await pg.query(`select id, name, filial, created_by_name from expense_categories`)).rows;
    assert.deepEqual(cat.map(c => [c.name, c.filial, c.created_by_name]), [['Elektr energiyasi', 'f729', 'Admin']]);
    // Takror — oynada xato, bazada 1 ta
    await page.click('#ex-cat-add'); await page.fill('#fw-cat-name', 'ELEKTR ENERGIYASI'); await page.click('#fw-cat-save');
    await page.waitForFunction(() => /allaqachon bor/.test(document.getElementById('fw-cat-msg').textContent));
    await page.click('#fw-cat-cancel');
    assert.equal(await num(pg, `select count(*)::int v from expense_categories`), 1);
    // Xarajat — kassadan (serverda), kategoriya ID bilan
    await page.evaluate(() => { const s = document.getElementById('ex-cat'); s.value = String(fwExpCatActive('dokon')[0].id); });
    await page.fill('#ex-amt', '50000'); await page.selectOption('#ex-cur', 'UZS'); await page.selectOption('#ex-box', '1');
    await page.click('#ex-submit-btn');
    await waitIdle(page, 1500);
    assert.equal(await boxBal(pg, 1), 1150000, 'kassadan 50 000 serverda yechildi');
    const exp = await page.evaluate(() => S.expenses.map(e => [e.cat, e.catId, e.amount]));
    assert.deepEqual(exp, [['Elektr energiyasi', Number(cat[0].id), 50000]]);
    const stored = (await pg.query(`select data->'expenses' e from app_data_branches where branch_key='f729'`)).rows[0].e;
    assert.equal(stored.length, 1); assert.equal(stored[0].catId, Number(cat[0].id), 'xarajat bazaga catId bilan saqlandi');
    const ledger0 = await num(pg, `select count(*)::int v from cashbox_ledger`);
    // Tahrir (Kategoriyalar oynasi) — nom o'zgaradi, summa/kassa/jurnal o'zgarmaydi
    await page.evaluate(() => exCatManage());
    await page.click(`#fw-catmodal button[data-act="ren"]`);
    await page.fill('#fw-cat-name', 'Elektr (oylik)'); await page.click('#fw-cat-save');
    await page.waitForFunction(() => /Elektr \(oylik\)/.test(document.getElementById('fw-catmodal')?.textContent || ''));
    assert.equal((await pg.query(`select id, name from expense_categories`)).rows[0].name, 'Elektr (oylik)');
    assert.equal(await page.textContent('#pg-xarajatlar [data-excat]'), 'Elektr (oylik)', 'eski xarajat yangi nom bilan (ID orqali)');
    // O'chirish — ishlatilgan → nofaol; select'da yo'q; tarix saqlanadi
    await page.click(`#fw-catmodal button[data-act="del"]`);
    await page.waitForFunction(() => /nofaol/.test(document.getElementById('fw-catmodal').textContent));
    await page.click('#fw-catm-close');
    assert.equal((await pg.query(`select is_active from expense_categories`)).rows[0].is_active, false);
    assert.equal(await boxBal(pg, 1), 1150000); assert.equal(await num(pg, `select count(*)::int v from cashbox_ledger`), ledger0, "kategoriya amallari kassa jurnaliga yozmadi");
    // Qayta yuklash — serverdan; nofaol kategoriya select'da yo'q, tarixiy xarajat nomi joyida
    await page.reload();
    await page.waitForFunction(() => typeof S !== 'undefined' && S.page && S.cashboxes && S.cashboxes.length === 5, null, { timeout: 15000 });
    await page.evaluate(() => { closeModal(); go('xarajatlar'); });
    await page.waitForFunction(() => FWC.loaded && !/Yuklanmoqda/.test(document.getElementById('ex-cat').textContent));
    assert.match(await page.textContent('#ex-cat'), /Kategoriya yo'q/);
    assert.equal(await page.textContent('#pg-xarajatlar [data-excat]'), 'Elektr (oylik)');
    // 26-migratsiya YO'Q holati — xarajat yozilmaydi, pulga tegilmaydi
    await pg.exec(`drop table public.expense_categories`);
    await page.reload();
    await page.waitForFunction(() => typeof S !== 'undefined' && S.page && S.cashboxes && S.cashboxes.length === 5, null, { timeout: 15000 });
    await page.evaluate(() => { closeModal(); go('xarajatlar'); });
    await page.waitForFunction(() => !FWC.loading && (FWC.loaded || FWC.error));
    assert.match(await page.textContent('#ex-cat'), /yuklanmadi/);
    const balBefore = await boxBal(pg, 1), lBefore = await num(pg, `select count(*)::int v from cashbox_ledger`);
    await page.fill('#ex-amt', '10000'); await page.click('#ex-submit-btn'); await waitIdle(page, 800);
    assert.equal(await boxBal(pg, 1), balBefore, "26-migratsiyasiz: kassa o'zgarmadi");
    assert.equal(await num(pg, `select count(*)::int v from cashbox_ledger`), lBefore, "jurnal ham o'zgarmadi");
    assert.equal(await page.evaluate(() => S.expenses.length), 1, 'yangi xarajat yozilmadi');
    assert.ok(st.fnLog.some(([f, c]) => f === 'expense-categories' && c === 409), "server aniq 409 (migratsiya kerak) qaytardi");
    assert.deepEqual(page.__errs, []);
    await ctx.close();
  } finally { await st.close(); }
}

// v23.2 (F4b): ADMIN va SOTUVCHI — mijoz qarzi va ombor qoldig'i HAQIQIY HTTP orqali serverda; sahifada
// ko'rinadigan qiymat = bazadagi qiymat; brauzer konsolidan "qarz 2 000 000 / qoldiq 999" saqlansa — rad.
async function testF4bLedgerUiEndToEnd() {
  const st = await stack();
  try {
    const { pg } = st;
    const cust = (id) => num(pg, `select debt v from customer_balances where filial='f729' and customer_local_id=$1`, [id]);
    const left = () => num(pg, `select coalesce(sum(qty-sold),0) v from batches where filial='f729' and pid=101 and status='active'`);
    const { ctx, page } = await st.open('index.html', { token: 't-admin' });
    await page.waitForFunction(() => typeof S !== 'undefined' && S.page === 'dashboard' && S.cashboxes && S.cashboxes.length === 5, null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => FWL.on), true, "server: 27-migratsiya qo'llangan (ledgerAuthority)");
    // 1) Yangi mijoz, boshlang'ich qarz 600 000 — serverda (qarz jurnali)
    await page.evaluate(() => { closeModal(); go('mijozlar'); openAddCust(); });
    await page.fill('#nc-n', 'Ali E2E'); await page.fill('#nc-debt', '600000');
    await page.click('.modal-footer .btn-primary');
    await waitIdle(page, 1200);
    const cid = await page.evaluate(() => S.customers.find(c => c.name === 'Ali E2E').id);
    assert.equal(await cust(cid), 600000);
    assert.equal(await num(pg, `select count(*)::int v from customer_debt_ledger where customer_local_id=$1 and op_kind='opening'`, [cid]), 1);
    // 2) Konsoldan soxta qarz va qoldiq — saqlash bazaga ta'sir qilmaydi, sahifa server qiymatiga qaytadi
    await page.evaluate(async (cid) => { S.customers.find(c => c.id === cid).debt = 2000000; S.batches[0].qty = 999; S.batches[0].sold = 0; await save(); }, cid);
    await waitIdle(page, 1500);
    assert.equal(await cust(cid), 600000); assert.equal(await left(), 20);
    assert.equal(await page.evaluate((cid) => S.customers.find(c => c.id === cid).debt, cid), 600000, 'sahifa — bazadagi qarz');
    assert.deepEqual(await page.evaluate(() => [S.batches[0].qty, S.batches[0].sold]), [20, 0], 'sahifa — bazadagi qoldiq');
    // 3) Nasiya savdo 2 dona × 50 $ — ombor va qarz SERVERDA
    await page.evaluate(async (cid) => { go('savdo'); S.cart = [{ key: 'k2', pid: 101, sku: 'PG-1001', name: 'Bosch drel', qty: 2, sellUsd: 50, costUsd: 30, lineUsd: 100 }]; S.savdoCustId = cid;
      POS.cur = 'USD'; posOpen('pay'); posPaySet(0); await posFinish(); }, cid);   // «Qarzga (0)» — mijoz bilan
    await waitIdle(page, 1800);
    assert.equal(await left(), 18); assert.equal(await cust(cid), 600000 + 100 * 12000);
    assert.equal(await page.evaluate((cid) => S.customers.find(c => c.id === cid).debt, cid), 1800000);
    assert.equal(await page.evaluate(() => S.batches.find(b => b.id === 9001).sold), 2);
    // 4) Qarz to'lovi 400 000 — qarz serverda (qulf bilan) kamayadi
    await page.evaluate((cid) => { closeModal(); go('mijozlar'); openPayDebt(cid); }, cid);
    await page.click('#modal-ov .me-opt[data-v="1"]'); assert.equal(await page.inputValue('#pd-b'), '1', 'kassa kartochkasi tanlandi'); await page.fill('#pd-a', '400000');
    await page.click('.modal-footer .btn-success');
    await waitIdle(page, 1200);
    assert.equal(await cust(cid), 1400000); assert.equal(await page.evaluate((cid) => S.customers.find(c => c.id === cid).debt, cid), 1400000);
    // 5) Qaytarish 1 dona — serverdagi savdodan: qarzdan 50 $, ombor +1
    const sid = await page.evaluate(() => S.sales[S.sales.length - 1].id);
    await page.evaluate((sid) => { closeModal(); openSaleReturn(sid); }, sid);
    await page.fill('#sr-qty', '1');
    await page.evaluate((sid) => doSaleReturn(sid), sid);
    await waitIdle(page, 1500);
    assert.equal(await cust(cid), 800000); assert.equal(await left(), 19);
    assert.equal(await page.evaluate((cid) => S.customers.find(c => c.id === cid).debt, cid), 800000);
    assert.equal(await num(pg, `select (items->0->>'qty')::numeric v from sales where local_id=$1`, [String(sid)]), 1, 'serverdagi savdoda 1 dona qoldi');
    // 6) Qayta yuklash — bazadan
    await page.reload();
    // Qayta yuklashda ilova manzildagi (#hash) bo'limni ochadi (js/main.js — _startPage), Bosh sahifani emas —
    // shuning uchun «yuklandi» sharti S.page === 'dashboard' emas (oraliq holatni kutish poyga edi)
    await page.waitForFunction(() => typeof S !== 'undefined' && S.page && S.cashboxes && S.cashboxes.length === 5 && !document.getElementById('bp-loading')?.offsetParent, null, { timeout: 15000 });
    assert.equal(await page.evaluate((cid) => S.customers.find(c => c.id === cid).debt, cid), 800000);
    assert.equal(await page.evaluate(() => getStock(101)), 19);
    assert.deepEqual(page.__errs, [], "sahifada JS xatosi yo'q");
    await ctx.close();
    // 7) Sotuvchi portali: savdo endi serverda (ombor qoldig'i bazada kamayadi); ortiqcha sotuv — rad
    const sv = await st.open('sotuvchi.html', { token: 't-kas', width: 390, height: 844 });
    await sv.page.waitForFunction(() => typeof S !== 'undefined' && S && S.cashboxes && S.cashboxes.length === 5 && typeof ME !== 'undefined' && ME, null, { timeout: 15000 });
    // v24.5: sotuvchi ham admin bilan bitta savdo oynasida (pos.js) — olingan summa majburiy
    await sv.page.evaluate(async () => { svSwitchTab('sale'); CART = [{ key: 's1', pid: 101, sku: 'PG-1001', name: 'Bosch drel', qty: 3, sellUsd: 50, costUsd: 30, lineUsd: 150 }]; SALE_CUST_ID = null;
      POS.cur = 'USD'; posOpen('pay'); posPaySet(150); await posFinish(); });
    await waitIdle(sv.page, 1800);
    assert.equal(await left(), 16, 'sotuvchi savdosi — bazadagi ombor kamaydi');
    assert.equal(await sv.page.evaluate(() => getStock(101)), 16);
    await sv.page.evaluate(async () => { CART = [{ key: 's2', pid: 101, sku: 'PG-1001', name: 'Bosch drel', qty: 50, sellUsd: 50, costUsd: 30, lineUsd: 2500 }];
      POS.cur = 'USD'; posOpen('pay'); posPaySet(2500); await posFinish(); });
    await waitIdle(sv.page, 1500);
    assert.equal(await left(), 16, "ortiqcha sotuv (50 > 16) — rad, ombor o'zgarmadi");
    assert.deepEqual(sv.page.__errs, []);
    await sv.ctx.close();
  } finally { await st.close(); }
}

module.exports = {
  _stack: stack,   // dalil skriptlari uchun (masalan eski brauzer kodi bilan negativ nazorat)
  name: "P14 — v11: lokal to'liq stek E2E (brauzer → server funksiyalari → PostgreSQL)",
  cases: [
    { name: "Admin: soxta qoldiq saqlanmaydi; kirim/ko'chirish/ortiqcha chiqim/savdo/Bazaga to'lov (2× bosish) — bazada to'g'ri", run: testAdminFlowsEndToEnd },
    { name: "Sotuvchi portali: xarajat serverda; konsoldan qoldiqni o'zgartirish rad etiladi", run: testSellerPortalEndToEnd },
    { name: "Admin: xarajat kategoriyalari HAQIQIY HTTP orqali — yaratish/takror/xarajat/tahrir/o'chirish/qayta yuklash; 26-migratsiyasiz pulga tegilmaydi", run: testAdminExpenseCategoriesEndToEnd },
    { name: "v23.2 F4b: admin va sotuvchi — qarz va ombor HAQIQIY HTTP orqali serverda; sahifa = baza; soxta qiymat rad", run: testF4bLedgerUiEndToEnd },
  ],
};
