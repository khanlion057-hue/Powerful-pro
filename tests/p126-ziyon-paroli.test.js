// P126 (ziyon paroli) — v25.7 (egasi, 2026-11-23; 57-migratsiya):
//  • Admin va sotuvchi tannarxdan past narx kiritsa — narx tannarxga qaytadi; pastroq — faqat ziyon paroli bilan.
//  • Diller (va filial) optom narxdan 10% gacha arzon sota oladi; undan past — faqat ziyon paroli bilan.
//  • Parol ochiq saqlanmaydi: bazada faqat SHA-256 xesh; serverga faqat savdo bilan (xotiradan) yuboriladi, localStorage'ga yozilmaydi.
// HAQIQIY PostgreSQL (PGlite) + HAQIQIY server funksiyalari (sale-checkout-atomic, loss-pin) + haqiqiy brauzer (Chromium).
// Testdagi parol — faqat sinov uchun (egasi bergan standart parol bu faylda yo'q: faqat xeshi solishtiriladi).
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');
const { openPage } = require('./p4-responsive.test.js')._helpers;

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG27 = fs.readFileSync(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'), 'utf8');
const MIG31 = fs.readFileSync(path.join(ROOT, 'supabase-migration-31-tahrir-muddati-audit-bildirishnoma.sql'), 'utf8');
const MIG57 = fs.readFileSync(path.join(ROOT, 'supabase-migration-57-ziyon-paroli.sql'), 'utf8');
const PIN = 'tp-4821', PIN_BAD = 'tp-0000';
const H = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger',
  'sales', 'batches', 'customer_balances', 'supplier_balances', 'customer_debt_payments', 'supplier_payments', 'home_withdrawals',
  'idempotency_keys', 'ledger_ops', 'customer_debt_ledger', 'supplier_debt_ledger', 'stock_ledger',
  'fw_audit_events', 'fw_notifications', 'dealers', 'dealer_stock', 'dealer_stock_moves', 'dealer_sales'];
const BOXES = [{ id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 0 }];
const USERS = { 't-admin': { id: 'u-admin' }, 't-s1': { id: 'u-s1' } };
const body = (r) => JSON.parse(r.body);
const num = async (pg, sql, p) => +(((await pg.query(sql, p)).rows[0] || {}).v ?? NaN);

async function pglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  return pg;
}

// POS dunyosi (P28 bilan bir xil: 0..30 + 27 + 31) + 57
async function posWorld() {
  const pg = await pglite();
  const cut = SCHEMA.indexOf('\n-- ────────────────────────────────────────────────────────────────────\n-- 15. 31-migratsiya');
  assert.ok(cut > 0);
  await pg.exec(SCHEMA.slice(0, cut));
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12000, maxDiscountPct: 100 },
    products: [{ id: 101, sku: 'A-101', name: 'Drel', markupPct: 50 }], branchStore: { f729: { cashboxes: BOXES } } })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('f729', $1::jsonb)`, [JSON.stringify({ cashboxes: BOXES, cashTxns: [], expenses: [],
    customers: [], suppliers: [], sales: [], batches: [{ id: 9001, pid: 101, bno: '01', qty: 20, sold: 0, costUsd: 10, date: '2026-09-01', status: 'active' }] })]);
  await pg.exec(MIG27); await pg.exec(MIG31);
  await pg.exec(MIG57); await pg.exec(MIG57);   // ikki marta — xavfsiz
  await pg.query(`update fw_settings set value = $1 where key = 'loss_pin_hash'`, [H(PIN)]);
  await pg.query(`select cashbox_apply_ops('f729','seed-cash','manual_in','[{"box":3,"currency":"USD","dir":"in","amount":1000}]'::jsonb)`);
  const memTables = {
    staff: [{ id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
      { id: 7, auth_user_id: 'u-s1', role: 'sotuvchi', active: true, filial: 'f729', name: 'Sotuvchi Bir', login: 's1' }],
    staff_roles: [{ staff_id: 7, role_id: 'sel' }],
    role_permissions: [{ role_id: 'sel', permission_id: 'savdo.create', permissions: { key: 'savdo.create' } }],
    staff_audit_log: [],
  };
  require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
  require('../netlify/functions/_lib/cashAuthority')._resetCashAuthorityCache();
  return { pg, client: makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: USERS }) };
}
const checkout = (h, key, items, token, extra = {}) => h(post({ filial: 'f729', items, paidUsd: items.reduce((s, i) => s + i.qty * i.sellUsd, 0),
  boxPayments: [{ box_id: 3, amount_native: items.reduce((s, i) => s + i.qty * i.sellUsd, 0) }], inv: 'I-' + key, idemKey: key,
  saleLocalId: 's' + key, payType: 'usd', custName: 'X', ...extra }, token));

// ── 1. Baza: standart xesh, to'g'ri/noto'g'ri parol, 5 xato — qulf; xesh brauzer va server bilan bir xil ──
async function testDbPin() {
  const { pg } = await posWorld();
  try {
    const pg2 = await pglite();   // toza baza: standart qiymat
    const cut = SCHEMA.indexOf('\n-- ────────────────────────────────────────────────────────────────────\n-- 15. 31-migratsiya');
    await pg2.exec(SCHEMA.slice(0, cut)); await pg2.exec(MIG27); await pg2.exec(MIG31); await pg2.exec(MIG57);
    const def = (await pg2.query(`select value from fw_settings where key='loss_pin_hash'`)).rows[0].value;
    const shared = fs.readFileSync(path.join(ROOT, 'js', 'shared.js'), 'utf8');
    assert.equal(def, /FW_LOSS_PIN_HASH_DEFAULT = '([0-9a-f]{64})'/.exec(shared)[1], 'bazadagi standart xesh = brauzerdagi standart xesh');
    // brauzer/anon/authenticated sozlama jadvalini o'qiy olmaydi
    await pg2.exec(`grant usage on schema public to authenticated; set role authenticated;`);
    await assert.rejects(pg2.query(`select value from fw_settings`), /permission denied/);
    await assert.rejects(pg2.query(`select public.fw_loss_pin_check('x', 'y')`), /permission denied/);
    await pg2.exec('reset role'); await pg2.close();

    const { checkLossPin } = require('../netlify/functions/_lib/lossPin');
    const rpc = { rpc: async (fn, a) => { try { return { data: (await pg.query(`select public.${fn}($1, $2) v`, [a.p_hash, a.p_actor])).rows[0].v, error: null }; } catch (e) { return { data: null, error: e }; } } };
    assert.deepEqual(await checkLossPin(rpc, PIN, 'staff:7'), { ok: true, status: 'ok' });
    assert.deepEqual(await checkLossPin(rpc, '', 'staff:7'), { ok: false, status: 'empty' });
    for (let i = 0; i < 4; i++) assert.equal((await checkLossPin(rpc, PIN_BAD, 'staff:7')).status, 'wrong');
    assert.equal((await checkLossPin(rpc, PIN, 'staff:7')).status, 'ok', '4 xatodan keyin to\'g\'ri — o\'tadi va hisob tozalanadi');
    for (let i = 0; i < 5; i++) await checkLossPin(rpc, PIN_BAD, 'staff:8');
    assert.equal((await checkLossPin(rpc, PIN, 'staff:8')).status, 'locked', '5 xato — 15 daqiqa qulf (to\'g\'ri parol ham)');
    assert.equal((await checkLossPin(rpc, PIN, 'staff:7')).status, 'ok', 'boshqa xodim qulflanmaydi');
    // bazada ochiq parol yo'q
    const dump = JSON.stringify((await pg.query(`select * from fw_settings`)).rows) + JSON.stringify((await pg.query(`select * from fw_loss_pin_fails`)).rows);
    assert.ok(!dump.includes(PIN) && !dump.includes(PIN_BAD), 'bazada faqat xesh');
  } finally { await pg.close(); }
}

// ── 2. POS serveri: zararli savdo faqat ziyon paroli bilan (sotuvchi ham, admin ham); parol hech qayerga yozilmaydi ──
async function testPosServer() {
  const { pg, client } = await posWorld();
  try {
    const ck = loadFunction('sale-checkout-atomic', client);
    const items = [{ pid: 101, qty: 2, sellUsd: 8, costUsd: 0 }];   // tannarx (FIFO) 10$ — zarar 4$
    let r = await checkout(ck, 'l1', items, 't-s1');
    assert.equal(r.statusCode, 409, r.body); assert.equal(body(r).code, 'LOSS_ACK_REQUIRED'); assert.equal(body(r).lossPin, true);
    r = await checkout(ck, 'l1', items, 't-s1', { lossAck: true });
    assert.equal(r.statusCode, 409, 'tasdiq bor, parol yo\'q — o\'tmaydi'); assert.equal(body(r).code, 'LOSS_ACK_REQUIRED');
    r = await checkout(ck, 'l1', items, 't-s1', { lossAck: true, lossPin: PIN_BAD });
    assert.equal(r.statusCode, 403, r.body); assert.equal(body(r).code, 'LOSS_PIN_WRONG');
    assert.equal(await num(pg, `select count(*)::int v from sales`), 0, 'noto\'g\'ri parol — hech narsa yozilmadi');
    r = await checkout(ck, 'l1', items, 't-s1', { lossAck: true, lossPin: PIN });
    assert.equal(r.statusCode, 200, r.body);
    const a = (await pg.query(`select * from fw_audit_events where action='loss_sale'`)).rows[0];
    assert.ok(a && a.after.lossPin === true && /ziyon paroli bilan/.test(a.note), 'auditda: ziyon paroli bilan');
    const n = (await pg.query(`select * from fw_notifications where kind='loss_sale'`)).rows[0];
    assert.ok(n && n.audience === 'admin' && /ziyon paroli bilan/.test(n.body), 'adminga bildirishnoma');
    // admin ham endi parolsiz zararga sota olmaydi
    const ai = [{ pid: 101, qty: 1, sellUsd: 5, costUsd: 10 }];
    r = await checkout(ck, 'l2', ai, 't-admin');
    assert.equal(r.statusCode, 409, r.body); assert.equal(body(r).code, 'LOSS_ACK_REQUIRED');
    r = await checkout(ck, 'l2', ai, 't-admin', { lossAck: true, lossPin: PIN });
    assert.equal(r.statusCode, 200, r.body);
    // zararsiz savdo — parolsiz, avvalgidek
    r = await checkout(ck, 'l3', [{ pid: 101, qty: 1, sellUsd: 15, costUsd: 10 }], 't-s1');
    assert.equal(r.statusCode, 200, r.body);
    // parol hech bir jadvalda yo'q (savdo, idempotentlik, audit, bildirishnoma, ombor)
    for (const t of ['sales', 'idempotency_keys', 'fw_audit_events', 'fw_notifications', 'ledger_ops', 'fw_loss_pin_fails']) {
      const s = JSON.stringify((await pg.query(`select * from ${t}`)).rows);
      assert.ok(!s.includes(PIN) && !s.includes(PIN_BAD), `${t}: ochiq parol yo'q`);
    }
    // Sozlamalar → «Ziyon paroli»: faqat admin, faqat xeshlar, eski xesh tekshiriladi
    const lp = loadFunction('loss-pin', client);
    r = await lp(post({ oldHash: H(PIN), newHash: H('tp-new-77') }, 't-s1'));
    assert.equal(r.statusCode, 403, 'sotuvchi o\'zgartira olmaydi');
    r = await lp(post({ oldHash: H(PIN_BAD), newHash: H('tp-new-77') }, 't-admin'));
    assert.equal(r.statusCode, 403); assert.equal(body(r).code, 'LOSS_PIN_WRONG');
    r = await lp(post({ oldHash: H(PIN), newHash: H('tp-new-77') }, 't-admin'));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal((await pg.query(`select value from fw_settings where key='loss_pin_hash'`)).rows[0].value, H('tp-new-77'));
    assert.equal(await num(pg, `select count(*)::int v from fw_audit_events where action='loss_pin_change'`), 1);
    r = await checkout(ck, 'l4', ai, 't-s1', { lossAck: true, lossPin: PIN });
    assert.equal(r.statusCode, 403, 'eski parol endi ishlamaydi');
    r = await checkout(ck, 'l4', ai, 't-s1', { lossAck: true, lossPin: 'tp-new-77' });
    assert.equal(r.statusCode, 200, r.body);
  } finally { unloadFunctions(); await pg.close(); }
}

// ── 3. Diller (record_dealer_sale_v42): −10% gacha — parolsiz; undan past — parolsiz rad, noto'g'ri — rad, to'g'ri — o'tadi ──
async function testDealer() {
  const pg = await pglite();
  try {
    await pg.exec(SCHEMA); await pg.exec(MIG57); await pg.exec(MIG57);
    await pg.query(`update fw_settings set value = $1 where key = 'loss_pin_hash'`, [H(PIN)]);
    const U = '00000000-0000-0000-0000-0000000000d1';
    await pg.exec(`insert into auth.users values ('${U}');
      insert into dealers (id, login, name, filial, auth_user_id) overriding system value values (1, 'd1', 'Diller', 'baza', '${U}');
      insert into catalog_products (id, filial, name, qty, optim_price, point_pct) values (101, 'baza', 'Drel', 5, 20, 0);
      insert into dealer_stock (dealer_id, pid, sku, name, qty, avg_cost_usd) values (1, 101, 'A', 'Drel', 10, 15);
      grant usage on schema public to authenticated;`);
    const asDealer = async (sql, p) => { await pg.exec(`select set_config('request.jwt.claim.sub', '${U}', false); set role authenticated;`);
      try { return (await pg.query(sql, p)).rows[0]; } finally { await pg.exec('reset role'); } };
    const sale = (price, pin) => asDealer(`select public.record_dealer_sale_v42(101, 1, $1, 'A', 'Drel', 0, null::numeric, $2) v`, [price, pin == null ? null : pin]);
    const sold = () => num(pg, `select count(*)::int v from dealer_sales`);
    // 10% ichida (18.50 ≥ 18.00) — parolsiz
    assert.deepEqual((await sale(18.5)).v, { ok: true, lossPin: false });
    // eski chaqiruv (p_loss_pin'siz) ham ishlaydi
    await asDealer(`select public.record_dealer_sale_v42(101, 1, 19, 'A', 'Drel', 0, null::numeric) v`);
    assert.equal(await sold(), 2);
    // 10% dan past — parolsiz rad
    await assert.rejects(sale(17.99), /LOSS_PIN_REQUIRED/);
    // noto'g'ri parol — yozilmaydi, javob aniq
    assert.deepEqual((await sale(17.99, PIN_BAD)).v, { ok: false, code: 'LOSS_PIN_WRONG', error: "Ziyon paroli noto'g'ri" });
    assert.equal(await sold(), 2, 'noto\'g\'ri parol — savdo yo\'q');
    assert.equal(await num(pg, `select count(*)::int v from fw_loss_pin_fails where actor='dealer:1'`), 1, 'urinish hisobga olindi');
    // to'g'ri parol — o'tadi; qarz optom narxda; audit va adminga bildirishnoma
    assert.deepEqual((await sale(15, PIN)).v, { ok: true, lossPin: true });
    assert.equal(await sold(), 3);
    assert.equal(await num(pg, `select debt_usd v from dealers where id=1`), 60, 'qarz optom (20$) narxda: 3 × 20');
    const a = (await pg.query(`select * from fw_audit_events where action='loss_pin_sale'`)).rows[0];
    assert.ok(a && a.actor_role === 'dealer' && +a.after.lossUsd === 5 && a.after.lossPin === true);
    assert.equal(await num(pg, `select count(*)::int v from fw_notifications where kind='dealer_loss_pin' and audience='admin'`), 1);
    // to'g'ridan record_dealer_sale (parolsiz yo'l) — 10% chegarasi saqlangan
    await assert.rejects(asDealer(`select public.record_dealer_sale(101, 1, 15, 'A', 'Drel', 0, null::numeric)`), /Narx juda past/);
    // keyingi tranzaksiyada «ruxsat» qolmaydi
    await assert.rejects(sale(15), /LOSS_PIN_REQUIRED/);
    // 5 xato — qulf (to'g'ri parol ham)
    for (let i = 0; i < 5; i++) await sale(15, PIN_BAD);
    assert.equal((await sale(15, PIN)).v.code, 'LOSS_PIN_LOCKED');
    assert.ok(!JSON.stringify((await pg.query(`select * from fw_audit_events`)).rows).includes(PIN), 'auditda parol yo\'q');
  } finally { await pg.close(); }
}

// ── 4. Brauzer (POS): narx tannarxga qaytadi; noto'g'ri / to'g'ri parol; qatorda va kechiktirilgan chekda ziyon; savdo bilan parol ──
async function testPosBrowser() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    await page.evaluate(async (h) => {
      S.products = [{ id: 1, sku: 'PG-1', name: 'Perforator', markupPct: 25, unit: 'dona' }];
      S.batches = [{ id: 11, pid: 1, qty: 10, sold: 0, costUsd: 84, status: 'active', date: td() }];
      S.customers = []; S.cashboxes = [{ id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 0 }]; S.sales = []; S.cart = [];
      S.settings.lossPinHash = h; CUR.usdUzs = 12500;
      try { localStorage.removeItem('fw_pos_prefs_admin'); } catch (_) {}
      go('savdo'); POS.mode = 'retail'; POS.cur = 'USD'; posAdd(1);
      const it = POS.a.cart()[0]; it.manual = true; posApplyLinePrice(it, 50);
      window.__p = { afterRevert: it.sellUsd };
    }, H(PIN));
    assert.equal(await page.evaluate(() => __p.afterRevert), 84, 'tannarxdan past narx — darhol tannarxga qaytdi');
    await page.waitForSelector('#fw-lp-v');
    assert.match(await page.textContent('.pos-sh'), /tannarxdan past/);
    await page.fill('#fw-lp-v', PIN_BAD); await page.click('#fw-lp-ok');
    await page.waitForFunction(() => /notoʻgʻri/.test(document.getElementById('fw-lp-err').textContent));
    assert.equal(await page.evaluate(() => POS.a.cart()[0].sellUsd), 84, 'noto\'g\'ri parol — narx tannarxda qoladi');
    await page.fill('#fw-lp-v', PIN); await page.click('#fw-lp-ok');
    await page.waitForFunction(() => !document.getElementById('fw-lp-v'));
    const r = await page.evaluate(() => { const it = POS.a.cart()[0]; const t = posTotals();
      return { sell: it.sellUsd, ok: it.lossOk, pin: POS.lossPin === document.title ? 'x' : !!POS.lossPin, econ: posLineEcon(it, t, true).replace(/<[^>]+>/g, '') }; });
    assert.equal(r.sell, 50); assert.equal(r.ok, true); assert.equal(r.pin, true);
    assert.match(r.econ, /Tannarx: \$84.*Ziyon: −\$34.*parol bilan/, 'qatorda tannarx va ziyon');
    // kechiktirilgan chek: tannarx va ziyon
    const held = await page.evaluate(() => { posHold(); const h = document.createElement('div'); h.innerHTML = posHeldView(); return h.textContent; });
    assert.match(held, /Tannarx: \$84/); assert.match(held, /Ziyon: −\$34/);
    // kassaga qaytarib, sotish: kechiktirilgan chekdan qaytgan savdoda parol QAYTA so'raladi (avvalgi ruxsat saqlanmaydi);
    // parol savdo bilan serverga boradi, localStorage'ga yozilmaydi
    await page.evaluate(() => {
      posUnhold(posHeld()[0].id);
      window.__out = []; _cloudEnabled = true; fwApplyLedger = () => {}; save = () => {};
      authFetch = async (url, o) => { const b = JSON.parse(o.body); __out.push(b); const total = b.items.reduce((s, i) => s + i.qty * i.sellUsd, 0);
        return { ok: true, json: async () => ({ ok: true, ledger: true, localId: b.saleLocalId, inv: b.inv, totalUsd: total, debtUsd: 0, costUsd: 84, profitUsd: total - 84, balances: {} }) }; };
      window.__held = POS.lossPin;
      posOpen('pay'); posPaySet(posTotals().needN); window.__fin = posFinish();
    });
    await page.waitForSelector('#fw-lp-v');
    assert.match(await page.textContent('.pos-sh'), /ziyon/);
    await page.fill('#fw-lp-v', PIN); await page.click('#fw-lp-ok');
    const sent = await page.evaluate(async (pin) => {
      await __fin; await new Promise(r => setTimeout(r, 200));
      let ls = ''; for (let i = 0; i < localStorage.length; i++) ls += localStorage.getItem(localStorage.key(i));
      return { n: __out.length, ack: __out[0] && __out[0].lossAck, pin: __out[0] && __out[0].lossPin === pin, inLs: ls.includes(pin), after: POS.lossPin, held: __held };
    }, PIN);
    assert.equal(sent.held, '', 'chekni qaytarganda xotiradagi parol tozalangan');
    delete sent.held;
    assert.deepEqual(sent, { n: 1, ack: true, pin: true, inLs: false, after: '' }, 'parol serverga savdo bilan, localStorage\'da yo\'q, savdodan keyin xotiradan o\'chdi');
    // Sozlamalar → Ziyon paroli: serverga faqat xeshlar
    const st = await page.evaluate(async ([pin, nh]) => {
      const out = []; authFetch = async (url, o) => { out.push([url, o.body]); return { ok: true, json: async () => ({ ok: true }) }; };
      stEditLossPin(); document.getElementById('st-lp-old').value = pin; document.getElementById('st-lp-new').value = 'tp-new-77'; document.getElementById('st-lp-new2').value = 'tp-new-77';
      await stSaveLossPin();
      return { url: out[0] && out[0][0], body: out[0] && out[0][1], hash: S.settings.lossPinHash === nh };
    }, [PIN, H('tp-new-77')]);
    assert.match(st.url, /loss-pin/); assert.ok(!st.body.includes(PIN) && !st.body.includes('tp-new-77'), 'serverga ochiq parol bormaydi');
    assert.deepEqual(JSON.parse(st.body), { oldHash: H(PIN), newHash: H('tp-new-77') }); assert.equal(st.hash, true);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

// ── 5. Brauzer (diller): −10% dan past — parol oynasi; bekor — yuborilmaydi; parol bilan — p_loss_pin; server «noto'g'ri» — qayta so'raladi ──
async function testDealerBrowser() {
  const { browser, page, errors } = await openPage('diller.html', { width: 390, height: 844, mobile: true, loggedIn: true });
  try {
    await page.evaluate(() => { ME = { id: 1, name: 'Jasur', region: 'S', filial: 'baza', debt_usd: 0, total_paid_usd: 0, points: 0 };
      STOCK = [{ pid: 101, sku: 'A-101', name: 'Drel', qty: 8, avg_cost_usd: 15 }]; SALES = []; CATALOG = [{ id: 101, optim_price: 20, point_pct: 0 }]; MY_ORDERS = [];
      if (typeof dlShowApp === 'function') dlShowApp();
      dlRefreshData = async () => {}; dlRenderSummary = () => {};
      dlSaleAdd(101, 2); dlSaleCartOpen(); dlSalePrice(101, '15'); });
    const line = await page.textContent('#dlc-ov .pos-line-m');
    assert.match(line, /Optom: \$20\.00 · Ziyon: −\$10\.00/); assert.match(line, /−10% dan past/);
    assert.equal(await page.evaluate(() => document.querySelector('#dlc-ov .pos-line-m').classList.contains('red')), true, 'qizil');
    // bekor — serverga yuborilmaydi
    await page.evaluate(() => { window.__calls = []; db.rpc = async (n, a) => { __calls.push([n, a]); return { data: { ok: true }, error: null }; }; window.__sub = dlSaleSubmit(); });
    await page.waitForSelector('#fw-lp-v'); await page.click('#fw-lp-no');
    await page.evaluate(() => __sub);
    assert.equal(await page.evaluate(() => __calls.length), 0, 'bekor — savdo yo\'q');
    // parol bilan; server birinchi marta «noto'g'ri» desa — qayta so'raladi
    await page.evaluate(() => { let k = 0; db.rpc = async (n, a) => { __calls.push([n, a]); return k++ === 0 ? { data: { ok: false, code: 'LOSS_PIN_WRONG', error: 'Ziyon paroli notoʻgʻri' }, error: null } : { data: { ok: true, lossPin: true }, error: null }; };
      window.__sub = dlSaleSubmit(); });
    await page.waitForSelector('#fw-lp-v'); await page.fill('#fw-lp-v', PIN_BAD); await page.click('#fw-lp-ok');
    await page.waitForFunction(() => __calls.length === 1);
    await page.waitForSelector('#fw-lp-v'); await page.fill('#fw-lp-v', PIN); await page.click('#fw-lp-ok');
    await page.evaluate(() => __sub);
    const c = await page.evaluate(() => __calls.map(([n, a]) => [n, a.p_sell_usd, a.p_loss_pin]));
    assert.deepEqual(c, [['record_dealer_sale_v42', 15, PIN_BAD], ['record_dealer_sale_v42', 15, PIN]]);
    assert.equal(await page.evaluate(() => Object.keys(DLC.cart).length + '|' + DLC.lossPin), '0|', 'savdo o\'tdi, parol xotiradan o\'chdi');
    let ls = await page.evaluate(() => { let s = ''; for (let i = 0; i < localStorage.length; i++) s += localStorage.getItem(localStorage.key(i)); return s; });
    assert.ok(!ls.includes(PIN), 'localStorage\'da parol yo\'q');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

module.exports = {
  name: 'P126 — Ziyon paroli (57-migratsiya): POS va diller, serverda xesh bilan',
  cases: [
    { name: 'baza: standart xesh = brauzerdagi; to\'g\'ri/noto\'g\'ri; 5 xato — qulf; brauzer rollari o\'qiy olmaydi', run: testDbPin },
    { name: 'POS serveri: zarar — faqat parol bilan (sotuvchi va admin); audit, bildirishnoma; parol hech qayerda; Sozlamalar — faqat admin', run: testPosServer },
    { name: 'diller: −10% gacha parolsiz; undan past — parolsiz rad, noto\'g\'ri rad, to\'g\'ri o\'tadi (audit, bildirishnoma, qulf)', run: testDealer },
    { name: 'brauzer POS: narx tannarxga qaytadi, noto\'g\'ri/to\'g\'ri parol, qatorda va kechiktirilgan chekda ziyon, parol faqat xotirada', run: testPosBrowser },
    { name: 'brauzer diller: qizil «Optom · Ziyon», bekor — yuborilmaydi, parol bilan o\'tadi, server «noto\'g\'ri» — qayta so\'raladi', run: testDealerBrowser },
  ],
};
