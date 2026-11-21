// P108 — v25.6.9: dastlabki sinovni tozalash (faqat admin, parol, 6 oy), mahalliy nusxa
const assert = require('node:assert/strict');
const fs = require('fs');
const { openPage } = require('./p4-responsive.test.js')._helpers;
async function server() {
  const src = fs.readFileSync(require.resolve('../netlify/functions/trial-reset.js'), 'utf8');
  assert.match(src, /requireAdmin: true/); assert.match(src, /checkPassword/); assert.match(src, /'TOZALASH'/); assert.match(src, /addMonths\(start, 6\)/);
  const sql = fs.readFileSync(require.resolve('../supabase-migration-49-sinov-tozalash.sql'), 'utf8');
  assert.match(sql, /grant execute on function public\.fw_trial_reset\(boolean\) to service_role/);
  // Supabase pg_safeupdate: WHERE shartsiz DELETE/UPDATE prod'da taqiqlangan (PGlite'da bu qoida yo'q — shuning uchun matndan tekshiramiz)
  for (const f of ['../supabase-migration-49-sinov-tozalash.sql', '../supabase-migration-52-tozalash-tuzatish.sql']) {
    const t = fs.readFileSync(require.resolve(f), 'utf8');
    assert.doesNotMatch(t, /delete from public\.%I'/, f + ': DELETE ... WHERE true bo\'lishi kerak');
    assert.doesNotMatch(t, /points = 0;/, f + ': UPDATE ... WHERE bo\'lishi kerak');
  }
  assert.doesNotMatch(sql, /delete from public\.(products|staff|dealers|batches)\b/);
  // JSON nusxa ham tozalanadi (boshqa filial nusxasidagi eski savdo qaytmasin)
  const { _cleanBranch } = require('../netlify/functions/trial-reset.js');
  const c = _cleanBranch({ batches: [{ qty: 10, sold: 4, status: 'active' }, { qty: 3, status: 'deleted' }, { qty: 2, sold: 0, status: 'transit' }], sales: [1], expenses: [1], cashTxns: [1], customers: [{ debt: 9 }], cashboxes: [{ bal: 5 }] });
  assert.deepEqual(c.batches.map((b) => [b.qty, b.sold, b.status]), [[10, 0, 'active'], [2, 0, 'active']]);
  assert.deepEqual([c.sales.length, c.expenses.length, c.cashTxns.length, c.customers[0].debt, c.cashboxes[0].bal], [0, 0, 0, 0, 0]);
  assert.match(src, /cleanJson\(admin\)/); assert.match(src, /version: \(Number/);
}
// Funksiyaning o'zini chaqirish (avval faqat matn tekshirilardi — `json` nomi soya bo'lib, har amal 500 berardi)
async function serverRun() {
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
  const SA = require('../netlify/functions/_lib/supabaseAdmin.js');
  const calls = [];
  const q = (t) => ({ select() { return this; }, eq() { return this; }, in() { return this; }, update(v) { calls.push(['update', t]); return { eq: async () => ({ error: null }) }; },
    upsert: async () => ({ error: null }), maybeSingle: async () => (t === 'staff' ? { data: { id: 1, role: 'admin', active: true, auth_user_id: 'u' } } : { data: { data: { start: '2026-11-01' }, version: 3 } }),
    then(r) { return r({ data: [], error: null }); } });
  SA.getAdminClient = () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u' } } }), admin: { getUserById: async () => ({ data: { user: { email: 'a@b.c' } } }) } }, from: q, rpc: async (n, a) => ({ data: { sales: 2, dry: a.p_dry }, error: null }) });
  global.fetch = async () => ({ ok: true, json: async () => ({ access_token: 't' }) });
  delete require.cache[require.resolve('../netlify/functions/trial-reset.js')];
  const H = require('../netlify/functions/trial-reset.js').handler;
  const call = (b) => H({ httpMethod: 'POST', headers: { authorization: 'Bearer x' }, body: JSON.stringify(b) });
  const st = await call({ action: 'status' }); assert.equal(st.statusCode, 200, st.body);
  const dry = await call({ action: 'dry' }); assert.equal(dry.statusCode, 200, dry.body); assert.equal(JSON.parse(dry.body).counts.dry, true);
  assert.equal((await call({ action: 'run', password: 'p', confirm: 'XATO' })).statusCode, 400);
  const run = await call({ action: 'run', password: 'p', confirm: 'TOZALASH' }); assert.equal(run.statusCode, 200, run.body);
  assert.ok(calls.some(([k, t]) => k === 'update' && t === 'app_data'), 'JSON nusxa ham tozalandi');
}
async function client() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const r = await page.evaluate(() => {
      save = () => {};
      S.batches = [{ id: 1, qty: 10, sold: 4, status: 'active' }, { id: 2, qty: 5, sold: 5, status: 'empty' }];
      S.sales = [{ id: 's1' }]; S.expenses = [{ id: 'e1' }]; S.customers = [{ id: 1, name: 'A', debt: 50 }];
      trialLocalReset();
      return { b: S.batches.map((b) => [b.qty, b.sold, b.status]), sales: S.sales.length, exp: S.expenses.length, cust: S.customers.map((c) => [c.name, c.debt]) };
    });
    assert.deepEqual(r.b, [[10, 0, 'active'], [5, 0, 'active']]); assert.equal(r.sales, 0); assert.equal(r.exp, 0); assert.deepEqual(r.cust, [['A', 0]]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
module.exports = { name: 'P108 — Sinovni tozalash', cases: [{ name: 'server/SQL: admin, parol, 6 oy; roʻyxatlar oʻchmaydi', run: server }, { name: 'funksiya ishlaydi: status, dry, run (tasdiqsiz — rad; JSON tozalanadi)', run: serverRun }, { name: 'mahalliy nusxa: kirim saqlanadi, harakatlar 0', run: client }] };
