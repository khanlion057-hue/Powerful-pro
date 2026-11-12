// P88 — v25.2: YUKLAMA VA NAZORATGA TAYYORLIK (bepul tarif, 20 xodim).
//  • monitor.wrap: o'chiq bo'lsa — o'zgarishsiz; yoqiq — IP bo'yicha cheklov (429 + Retry-After), cron cheklanmaydi;
//    500 / kutilmagan xato → jurnal + Telegram (takrorlanmaydi), kutilmagan xato → toza 500 JSON; baza ishlamasa — fail-open
//  • client-error: shovqin e'tiborsiz, haqiqiy xato — hisobot; 65 funksiyaning hammasi o'ralgan
//  • Telegram navbati: vaqtinchalik xato — navbatga; flush: yuborildi / qayta / 400 → failed
//  • build: xeshli JS/CSS (dist/h), HTML va service worker shu nomlarda, kesh nomi build bo'yicha; netlify.toml /h/* — immutable
//  • 48-migratsiya (PGlite): cheklov soni, ogohlantirish oynasi, tozalash, brauzer rollariga ruxsat yo'q
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FN = path.join(ROOT, 'netlify', 'functions');

function fakeAdmin({ broken = false } = {}) {
  const st = { rate: new Map(), alerts: new Map(), events: [], outbox: [], rpcCalls: 0 };
  const ok = (data) => Promise.resolve(broken ? { data: null, error: { message: 'db down' } } : { data, error: null });
  function q(table) {
    const o = { t: table, ins: null, upd: null };
    const self = new Proxy(o, { get(x, p) {
      if (p === 'then') {
        let r = { data: [], error: null };
        if (x.ins && x.t === 'tg_outbox') { st.outbox.push(Object.assign({ id: st.outbox.length + 1, status: 'pending', tries: 0 }, x.ins)); r = { data: null, error: null }; }
        else if (x.t === 'tg_outbox') r = { data: st.outbox.filter((m) => m.status === 'pending').map((m) => ({ ...m })), error: null };
        return (a, b) => Promise.resolve(r).then(a, b);
      }
      if (p === 'insert') return (v) => { x.ins = v; return self; };
      if (p === 'update') return (v) => { x.upd = v; return self; };
      if (p === 'eq') return (k, v) => { if (x.upd && k === 'id') Object.assign(st.outbox.find((m) => m.id === v) || {}, x.upd); return self; };
      if (p === 'maybeSingle') return () => ok(x.t === 'app_data' ? { data: { settings: { tgBotToken: '123456:ABCdefGHIjklMNOpqrSTUvwxYZ0123456789', tgChatId: '-100111' } } } : null);
      return () => self;
    } });
    return self;
  }
  return { st, admin: { from: q, rpc(name, a) {
    st.rpcCalls++;
    if (name === 'ops_rate_hit') { const r = st.rate.get(a.p_key) || { cnt: 0 }; r.cnt++; st.rate.set(a.p_key, r); return ok(r.cnt); }
    if (name === 'ops_alert') {
      st.events.push(a.p_kind + ':' + a.p_key); const l = st.alerts.get(a.p_key);
      if (!l) { st.alerts.set(a.p_key, { sup: 0 }); return ok([{ send: true, suppressed: 0 }]); }
      l.sup++; return ok([{ send: false, suppressed: l.sup }]);
    }
    return ok(null);
  } } };
}

// Telegram (global fetch) — ushlab qolinadi
function withFetch(fn, responder) {
  const orig = global.fetch, sent = [];
  global.fetch = async (url, o) => { const body = JSON.parse((o && o.body) || '{}'); sent.push(body); const r = responder ? responder(body, sent.length) : { ok: true }; return { ok: true, status: 200, json: async () => r }; };
  return Promise.resolve().then(() => fn(sent)).finally(() => { global.fetch = orig; });
}
function withOps(fake, fn) {
  const ops = require(path.join(FN, '_lib', 'opsGuard'));
  const prevEnv = process.env.FW_OPS_ON, prevGet = ops.getAdminClient;
  process.env.FW_OPS_ON = '1'; ops.getAdminClient = () => fake.admin;
  return Promise.resolve().then(fn).finally(() => {
    if (prevEnv === undefined) delete process.env.FW_OPS_ON; else process.env.FW_OPS_ON = prevEnv;
    ops.getAdminClient = prevGet;
  });
}
const ev = (ip, extra = {}) => Object.assign({ httpMethod: 'POST', body: '{}', headers: { 'x-nf-client-connection-ip': ip } }, extra);

async function testMonitor() {
  const { wrap, LIMITS } = require(path.join(FN, '_lib', 'monitor'));
  // O'chiq — o'zgarishsiz (bazaga murojaat yo'q)
  const prev = process.env.FW_OPS_ON; process.env.FW_OPS_ON = '0';
  try {
    let n = 0; const h = wrap('x-test', async () => { n++; return { statusCode: 200, body: 'ok' }; });
    assert.equal((await h(ev('1.1.1.1'))).body, 'ok'); assert.equal(n, 1);
    const thr = wrap('x-test', async () => { throw new Error('boom'); });
    await assert.rejects(() => thr(ev('1.1.1.1')), /boom/, "o'chiq holatda xato avvalgidek uzatiladi");
  } finally { if (prev === undefined) delete process.env.FW_OPS_ON; else process.env.FW_OPS_ON = prev; }

  // Yoqiq: health — 1 daqiqada 30 ta, keyin 429 + Retry-After; boshqa IP — mustaqil; cron — cheklanmaydi
  const fake = fakeAdmin();
  await withOps(fake, () => withFetch(async (sent) => {
    const h = wrap('health', async () => ({ statusCode: 200, headers: {}, body: '{"ok":true}' }));
    const codes = []; for (let i = 0; i < LIMITS.health.n + 3; i++) codes.push((await h(ev('9.9.9.9', { httpMethod: 'GET' }))).statusCode);
    assert.equal(codes.filter((c) => c === 200).length, LIMITS.health.n); assert.equal(codes.filter((c) => c === 429).length, 3);
    const lim = await h(ev('9.9.9.9', { httpMethod: 'GET' }));
    assert.equal(lim.statusCode, 429); assert.equal(lim.headers['Retry-After'], String(LIMITS.health.s)); assert.match(JSON.parse(lim.body).error, /Juda ko'p/);
    assert.equal((await h(ev('8.8.8.8', { httpMethod: 'GET' }))).statusCode, 200, 'boshqa IP — mustaqil');
    assert.equal(fake.st.events.filter((e) => e.startsWith('rate:')).length, 1, 'cheklovning birinchi oshishi — bir marta jurnalga');
    assert.equal(sent.length, 1, 'cheklov haqida bitta Telegram');
    const cron = wrap('health', async () => ({ statusCode: 200, body: 'cron' }));
    assert.equal((await cron(ev('9.9.9.9', { body: JSON.stringify({ next_run: '2026-01-01T00:00:00Z' }) }))).body, 'cron', 'jadval chaqiruvi cheklanmaydi');
  }));

  // 500 → jurnal + Telegram bir marta; takror — Telegram yo'q; kutilmagan xato → toza 500 JSON
  const f2 = fakeAdmin();
  await withOps(f2, () => withFetch(async (sent) => {
    const bad = wrap('sale-ops', async () => ({ statusCode: 500, headers: {}, body: JSON.stringify({ error: 'Kassa yopilmadi' }) }));
    assert.equal((await bad(ev('2.2.2.2'))).statusCode, 500); assert.equal((await bad(ev('2.2.2.2'))).statusCode, 500);
    assert.deepEqual(f2.st.events.filter((e) => e.startsWith('error:')), ['error:err:sale-ops:500', 'error:err:sale-ops:500'], 'har xato jurnalda');
    assert.equal(sent.length, 1, 'Telegram — 10 daqiqada bitta');
    assert.match(sent[0].text, /Server xatosi 500/); assert.match(sent[0].text, /Kassa yopilmadi/); assert.equal(sent[0].chat_id, '-100111');
    const thr = wrap('sale-ops', async () => { throw new Error('kutilmagan'); });
    const r = await thr(ev('2.2.2.2'));
    assert.equal(r.statusCode, 500); assert.ok(!/kutilmagan/.test(r.body), 'ichki xato matni klientga chiqmaydi');
    assert.equal(sent.length, 2); assert.match(sent[1].text, /kutilmagan/);
  }));

  // Baza ishlamasa — fail-open: javob o'zgarmaydi
  const f3 = fakeAdmin({ broken: true });
  await withOps(f3, () => withFetch(async (sent) => {
    const h = wrap('sale-ops', async () => ({ statusCode: 500, headers: {}, body: '{}' }));
    for (let i = 0; i < 5; i++) assert.equal((await h(ev('3.3.3.3'))).statusCode, 500);
    assert.equal(sent.length, 0);
    const okh = wrap('health', async () => ({ statusCode: 200, body: 'ok' }));
    for (let i = 0; i < 40; i++) assert.equal((await okh(ev('3.3.3.3'))).statusCode, 200, 'cheklov bazasi ishlamasa — ruxsat');
  }));

  // Barcha funksiyalar o'ralgan
  const files = fs.readdirSync(FN).filter((f) => f.endsWith('.js'));
  assert.equal(files.length, 65);
  for (const f of files) assert.equal(require(path.join(FN, f)).handler._fwMonitored, f.slice(0, -3), `${f} kuzatuvchi bilan o'ralgan`);
}

async function testClientError() {
  const h = require(path.join(FN, 'client-error')).handler;
  const fake = fakeAdmin();
  await withOps(fake, () => withFetch(async (sent) => {
    for (const msg of ['ResizeObserver loop limit exceeded', 'Script error.', 'Failed to fetch'])
      assert.equal((await h(ev('4.4.4.4', { body: JSON.stringify({ msg }) }))).statusCode, 204);
    assert.equal(fake.st.events.filter((e) => e.startsWith('client:')).length, 0, 'shovqin hisobot qilinmaydi');
    const body = JSON.stringify({ msg: "TypeError: Cannot read properties of undefined (reading 'qty')", src: 'https://x.netlify.app/h/js.pos.abc.js', line: 12, col: 5, page: 'sotuvchi.html#savdo', ver: '25.2' });
    assert.equal((await h(ev('4.4.4.4', { body }))).statusCode, 204);
    assert.equal((await h(ev('4.4.4.4', { body }))).statusCode, 204);
    assert.equal(fake.st.events.filter((e) => e.startsWith('client:')).length, 2);
    assert.equal(sent.length, 1, 'bir xil brauzer xatosi — bitta xabar');
    assert.match(sent[0].text, /reading 'qty'/); assert.match(sent[0].text, /\/h\/js\.pos\.abc\.js:12:5/); assert.ok(!/x\.netlify\.app/.test(sent[0].text), 'domen qisqartiriladi');
  }));
  const fe = fs.readFileSync(path.join(ROOT, 'js', 'fw-err.js'), 'utf8');
  assert.match(fe, /sent >= 5/); assert.match(fe, /localhost/);
  for (const p of ['index.html', 'sotuvchi.html', 'diller.html']) assert.match(fs.readFileSync(path.join(ROOT, p), 'utf8'), /<script src="js\/fw-err\.js"><\/script>/);
}

async function testOutbox() {
  const ops = require(path.join(FN, '_lib', 'opsGuard'));
  const fake = fakeAdmin();
  const TOKEN = '123456:ABCdefGHIjklMNOpqrSTUvwxYZ0123456789';
  assert.ok(ops.RETRYABLE('timeout') && ops.RETRYABLE('Too Many Requests: retry after 5') && !ops.RETRYABLE('Bad Request: chat not found'));
  assert.equal(await ops.enqueue(fake.admin, '-1001', 'a', 'credit', 'timeout'), true);
  assert.equal(await ops.enqueue(fake.admin, '-1002', 'b', 'pay', 'timeout'), true);
  assert.equal(await ops.enqueue(fake.admin, '-1003', 'c', 'pay', 'timeout'), true);
  // 1-xabar — yuboriladi; 2-chi — 429 (qayta); 3-chi — chat yo'q (failed)
  const res = await withFetch(() => ops.flushOutbox(fake.admin, TOKEN), (b) => b.chat_id === '-1001' ? { ok: true }
    : b.chat_id === '-1002' ? { ok: false, description: 'Too Many Requests: retry after 3' } : { ok: false, description: 'Bad Request: chat not found' });
  assert.deepEqual(res, { sent: 1, failed: 1, retry: 1 });
  assert.deepEqual(fake.st.outbox.map((m) => [m.chat, m.status, m.tries]), [['-1001', 'sent', 1], ['-1002', 'pending', 1], ['-1003', 'failed', 1]]);
  assert.ok(Date.parse(fake.st.outbox[1].next_at) > Date.now() + 9 * 60000, 'keyingi urinish ~10 daqiqadan keyin');
  // tgEvents: vaqtinchalik xatoda xabar navbatga tushadi (ops yoqiq bo'lsa)
  const src = fs.readFileSync(path.join(FN, '_lib', 'tgEvents.js'), 'utf8');
  assert.match(src, /ops\.RETRYABLE\(b\.description\)\) await ops\.enqueue\(ctx\.admin/);
  assert.equal((src.match(/, admin \}\);/g) || []).length, 4, "4 ta hodisa admin'ni uzatadi");
  const daily = fs.readFileSync(path.join(FN, 'telegram-daily-report.js'), 'utf8');
  assert.match(daily, /ops\.flushOutbox\(admin, st\.tgBotToken\)/); assert.match(daily, /ops_cleanup/); assert.match(daily, /ops\.usageText\(admin\)/);
}

async function testBuildHash() {
  const { build } = require(path.join(ROOT, 'scripts', 'build.js'));
  const r = build(); assert.ok(r.ok, (r.problems || []).join('; '));
  const D = path.join(ROOT, 'dist');
  const h = fs.readdirSync(path.join(D, 'h'));
  assert.ok(h.some((f) => /^js\.main\.[0-9a-f]{10}\.js$/.test(f)) && h.some((f) => /^css\.design-system\.[0-9a-f]{10}\.css$/.test(f)));
  for (const p of ['index.html', 'sotuvchi.html', 'diller.html']) {
    const s = fs.readFileSync(path.join(D, p), 'utf8');
    assert.ok(!/(?:src|href)="(?:js|css)\/[^"]+\.(?:js|css)"/.test(s), `${p}: barcha JS/CSS xeshli nomda`);
    for (const m of s.matchAll(/(?:src|href)="(h\/[^"]+)"/g)) assert.ok(fs.existsSync(path.join(D, m[1])), m[1]);
  }
  const main = h.find((f) => f.startsWith('js.main.'));
  assert.match(fs.readFileSync(path.join(D, 'h', main), 'utf8'), /'h\/js\.sotuvchi\.[0-9a-f]{10}\.js'/, 'oldindan yuklash ham xeshli nomda');
  const sw = fs.readFileSync(path.join(D, 'sw.js'), 'utf8');
  assert.match(sw, /const CACHE = 'powerful-v[\d-]+-[0-9a-f]{8}';/); assert.ok(!/'\.\/js\/main\.js'/.test(sw));
  for (const m of sw.matchAll(/'\.\/(h\/[^']+)'/g)) assert.ok(fs.existsSync(path.join(D, m[1])), 'sw: ' + m[1]);
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  assert.match(toml, /for = "\/h\/\*"\s*\[headers\.values\]\s*Cache-Control = "public, max-age=31536000, immutable"/);
  assert.match(toml, /for = "\/js\/\*"\s*\[headers\.values\]\s*Cache-Control = "no-cache"/, 'asl js/ — avvalgidek no-cache');
}

async function testMigration48() {
  const { freshDb, one } = require('./p8-noldan-ornatish.test.js')._helpers;
  const db = await freshDb();
  try {
    const hits = []; for (let i = 0; i < 5; i++) hits.push((await one(db, "select public.ops_rate_hit('t:1', 3, 60) n")).n);
    assert.deepEqual(hits, [1, 2, 3, 4, 5]);
    assert.deepEqual(await one(db, "select * from public.ops_alert('k','error','fn','m',600)"), { send: true, suppressed: 0 });
    assert.deepEqual(await one(db, "select * from public.ops_alert('k','error','fn','m',600)"), { send: false, suppressed: 1 });
    assert.deepEqual(await one(db, "select * from public.ops_alert('k','error','fn','m',0)"), { send: true, suppressed: 1 });
    const u = (await one(db, 'select public.ops_usage() u')).u;
    assert.equal(u.errors_24h, 3); assert.ok(u.db_bytes > 0);
    await db.exec("insert into public.ops_events (at, kind, msg) values (now() - interval '40 days', 'error', 'eski')");
    await one(db, 'select public.ops_cleanup()');
    assert.equal((await one(db, "select count(*)::int n from public.ops_events where msg = 'eski'")).n, 0, '30 kundan eskisi tozalanadi');
    const pr = await one(db, `select has_function_privilege('anon','public.ops_usage()','execute') a,
      has_function_privilege('authenticated','public.ops_rate_hit(text,integer,integer)','execute') b,
      has_table_privilege('authenticated','public.tg_outbox','select') c, has_table_privilege('anon','public.ops_events','insert') d`);
    assert.deepEqual(pr, { a: false, b: false, c: false, d: false }, "brauzer rollariga ruxsat yo'q");
  } finally { await db.close(); }
}

module.exports = {
  name: 'P88 — Yuklama va nazoratga tayyorlik (bepul tarif)',
  cases: [
    { name: "Kuzatuvchi: o'chiq — o'zgarishsiz; IP cheklovi 429 + Retry-After, cron cheklanmaydi; 500/xato → bitta Telegram; fail-open; 65 funksiya o'ralgan", run: testMonitor },
    { name: "Brauzer xatolari: shovqin e'tiborsiz, haqiqiy xato — bitta xabar, domen qisqartiriladi; 3 sahifada ulangan", run: testClientError },
    { name: "Telegram navbati: yuborildi / 429 — qayta (10 daqiqadan keyin) / chat yo'q — failed; hodisalar va soatlik ish ulangan", run: testOutbox },
    { name: "Build: xeshli JS/CSS (dist/h), HTML va service worker shu nomlarda, kesh nomi build bo'yicha; /h/* — 1 yil immutable", run: testBuildHash },
    { name: "48-migratsiya: cheklov soni, ogohlantirish oynasi, holat, 30 kunlik tozalash; brauzer rollariga ruxsat yo'q", run: testMigration48 },
  ],
};
