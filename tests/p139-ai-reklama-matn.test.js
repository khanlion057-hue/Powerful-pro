// P139 — v25.8 AI-reklama, 2-bosqich: MATN (AI ixtiyoriy). Haqiqiy PostgreSQL (PGlite, 58) + haqiqiy `ai-ads`; AI — soxta fetch (tarmoqqa chiqilmaydi).
//  • Shablon rejimi: 4 tur × 2 til × 10+; o'zbekcha — faqat lotin; matnda raqam/narx yo'q.
//  • AI'ga FAQAT nom, kategoriya, qisqa tavsif, post turi: narx, tannarx, mijoz, ta'minotchi, telefon, filial nomi — HECH QACHON
//    (handler orqali yuborilgan haqiqiy so'rov tanasi tekshiriladi).
//  • AI javobi: qat'iy JSON; raqam/narxli satr o'chiriladi; yaroqsiz JSON / uzun sarlavha / kirill (uz) — shablon.
//  • Oylik limit: atomik; tugasa — shablon + «AI limiti tugadi»; AI xatosi / vaqt tugashi / yaroqsiz javob — hisobdan chiqmaydi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');
const AT = require('../netlify/functions/_lib/aiText');
const TPL = require('../netlify/functions/_lib/adTemplates');

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const ENV = { AI_PROVIDER: 'gemini', AI_API_KEY: 'test-key-1234567890', AI_MODEL: 'gemini-flash-test', AI_MONTHLY_LIMIT: '3' };
const SECRET = { price: '987 654 soʻm', cost: 'COSTMARK', supp: 'TaminotchiXYZ', phone: '+998 90 777 66 55', cust: 'MijozAbdulla', filial: 'SergeliFilialiNomi' };
const okFetch = (payload, sink) => async (url, o) => { if (sink) sink.push({ url, o }); return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: typeof payload === 'string' ? payload : JSON.stringify(payload) }] } }] }) }; };
const GOOD = { title: 'Yangi arra keldi', body: 'Kuchli va ishonchli.\nUstalar uchun ayni muddao.', tags: ['yangi', 'arra', 'usta'] };

async function pglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE); await pg.exec(SCHEMA);
  return pg;
}
const rpcClient = (pg) => ({ rpc: async (fn, a) => { try { const keys = Object.keys(a); const r = await pg.query(`select public.${fn}(${keys.map((_, i) => '$' + (i + 1)).join(',')}) v`, keys.map((k) => a[k])); return { data: r.rows[0].v, error: null }; } catch (e) { return { data: null, error: e }; } } });
const count = async (pg, m) => +(((await pg.query(`select count from ai_usage where month=$1`, [m])).rows[0] || {}).count || 0);

// ── 1. Shablonlar ──
async function testTemplates() {
  for (const L of ['uz', 'ru']) for (const K of TPL.KINDS) {
    const list = TPL.TEMPLATES[L][K];
    assert.ok(list.length >= 10, `${L}/${K}: 10+ shablon (${list.length})`);
    for (const t of list) {
      const all = [t.title, t.body, ...t.tags].join(' ');
      assert.ok(!/\d/.test(all), `${L}/${K}: raqam yo'q — ${t.title}`);
      if (L === 'uz') assert.ok(!/[Ѐ-ӿ]/.test(all), `uz — faqat lotin: ${t.title}`);
      assert.ok(t.title.length <= 40 && t.tags.length >= 3 && t.tags.length <= 5);
      assert.ok(t.body.split('\n').length >= 2 && t.body.split('\n').length <= 3);
    }
  }
  const a = TPL.pickTemplate({ lang: 'uz', kind: 'discount', name: 'Arra tigʻi Ø250 — oʻtkir', cat: 'Disklar', pid: 5, now: 1 });
  const b = TPL.pickTemplate({ lang: 'uz', kind: 'discount', name: 'Arra tigʻi Ø250 — oʻtkir', cat: 'Disklar', pid: 5, now: 1 });
  assert.deepEqual(a, b, 'bir xil kun va mahsulot — barqaror tanlov');
  assert.equal(TPL.pickTemplate({ lang: 'ru', kind: 'top', name: 'X', pid: 1, variant: 12 }).variant, 12 % TPL.TEMPLATES.ru.top.length);
  // shablon rejimi (kalit yo'q) — to'liq ishlaydi, AI chaqirilmaydi
  let called = 0;
  const r = await AT.generateText({ admin: { rpc: async () => { called++; return {}; } }, product: { name: 'Elektroarra', cat: 'Arralar' }, kind: 'new', lang: 'uz', env: {}, fetchImpl: async () => { called++; } });
  assert.equal(r.source, 'template'); assert.equal(called, 0); assert.equal(r.ai.on, false);
  assert.match(r.body, /Elektroarra/);
}

// ── 2. Kirish tozalash va AI javobini tozalash ──
async function testCleaning() {
  const inp = AT.safeInput({ name: 'Disk Ø250 80T', cat: 'Disklar', desc: `Narxi ${SECRET.price}, tel ${SECRET.phone}, t.me/shop @powerful_shop, info@x.uz, $12.5 1800W`, price: 5, costUsd: 3 }, 'stuck', 'ru');
  assert.deepEqual(Object.keys(inp).sort(), ['cat', 'desc', 'kind', 'lang', 'name'], 'faqat 5 ta maydon');
  assert.equal(inp.name, 'Disk Ø250 80T');
  for (const bad of ['987', '654', '777', 'so\'m', 'soʻm', 't.me', '@powerful', 'info@', '$']) assert.ok(!inp.desc.includes(bad), `tavsifda «${bad}» yo'q: ${inp.desc}`);
  assert.match(inp.desc, /1800W/, 'texnik xususiyat qoladi');
  // chiqish
  const c = AT.cleanOutput({ title: 'Zoʻr taklif', body: 'Ajoyib disk.\nNarxi 100 000 soʻm\nTel: +998901234567\nTez oling', tags: ['#yangi', 'disk', 'top10', 'arzon$'] }, 'uz');
  assert.deepEqual(c, { title: 'Zoʻr taklif', body: 'Ajoyib disk.\nTez oling', tags: ['yangi', 'disk', 'top', 'arzon'] });
  assert.equal(AT.cleanOutput({ title: 'Yangi', body: '50% chegirma', tags: ['a', 'b'] }, 'uz'), null, 'hamma qator raqamli — yaroqsiz');
  assert.equal(AT.cleanOutput({ title: 'x'.repeat(41), body: 'a\nb', tags: [] }, 'uz'), null, 'sarlavha 40 dan uzun');
  assert.equal(AT.cleanOutput({ title: 'Новинка', body: 'Отличный\nтовар', tags: [] }, 'uz'), null, "o'zbekcha — kirill bo'lmaydi");
  assert.ok(AT.cleanOutput({ title: 'Новинка', body: 'Отличный\nтовар', tags: ['новинка'] }, 'ru'));
  assert.equal(AT.cleanOutput({ title: 'Narx: 100$', body: 'a\nb', tags: [] }, 'uz'), null);
  assert.equal(AT.parseJson('```json\n{"title":"A","body":"b","tags":[]}\n```').title, 'A');
  assert.equal(AT.parseJson('bu json emas'), null);
}

// ── 3. Limit (atomik), xato — hisobdan chiqmaydi, vaqt tugashi ──
async function testLimit() {
  const pg = await pglite();
  try {
    const admin = rpcClient(pg), now = Date.parse('2026-11-23T10:00:00Z'), M = '2026-11';
    const gen = (fetchImpl, extra = {}) => AT.generateText({ admin, product: { name: 'Elektroarra', cat: 'Arralar' }, kind: 'new', lang: 'uz', env: ENV, fetchImpl, now, ...extra });
    let r = await gen(okFetch(GOOD));
    assert.equal(r.source, 'ai'); assert.deepEqual([r.title, r.ai.used], ['Yangi arra keldi', 1]);
    // AI xatosi (500) — shablon, hisob o'zgarmaydi
    r = await gen(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    assert.equal(r.source, 'template'); assert.match(r.note, /AI javobi 500/); assert.equal(await count(pg, M), 1);
    // yaroqsiz JSON — shablon, hisob o'zgarmaydi
    r = await gen(okFetch('kechirasiz, json emas'));
    assert.equal(r.source, 'template'); assert.match(r.note, /yaroqsiz/); assert.equal(await count(pg, M), 1);
    // raqamli sarlavha — yaroqsiz → shablon
    r = await gen(okFetch({ ...GOOD, title: 'Atigi 99 000 soʻm' }));
    assert.equal(r.source, 'template'); assert.equal(await count(pg, M), 1);
    // vaqt tugashi (7 s o'rniga sinovda 80 ms) — shablon, hisob o'zgarmaydi
    const t0 = Date.now();
    r = await gen((url, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => { const e = new Error('abort'); e.name = 'AbortError'; rej(e); })), { timeoutMs: 80 });
    assert.equal(r.source, 'template'); assert.match(r.note, /vaqt tugadi/); assert.ok(Date.now() - t0 < 2000); assert.equal(await count(pg, M), 1);
    // limit 3: yana 2 ta — o'tadi, keyingisi — «AI limiti tugadi», AI chaqirilmaydi
    assert.equal((await gen(okFetch(GOOD))).source, 'ai'); assert.equal((await gen(okFetch(GOOD))).source, 'ai');
    let called = 0;
    r = await gen(async (...a) => { called++; return okFetch(GOOD)(...a); });
    assert.equal(r.source, 'template'); assert.equal(r.ai.exhausted, true); assert.match(r.note, /AI limiti tugadi/); assert.equal(called, 0);
    assert.equal(await count(pg, M), 3);
    // atomiklik: bir vaqtda 6 ta so'rov, limit 4 (yangi oy) — aynan 4 tasi AI
    const env4 = { ...ENV, AI_MONTHLY_LIMIT: '4' }, may = Date.parse('2026-12-02T10:00:00Z');
    const rs = await Promise.all(Array.from({ length: 6 }, () => AT.generateText({ admin, product: { name: 'Elektroarra', cat: 'Arralar' }, kind: 'top', lang: 'uz', env: env4, fetchImpl: okFetch(GOOD), now: may })));
    assert.equal(rs.filter((x) => x.source === 'ai').length, 4); assert.equal(await count(pg, '2026-12'), 4);
  } finally { await pg.close(); }
}

// ── 4. Handler: AI'ga faqat ruxsat etilgan maydonlar; ruxsat; mos bo'lmagan mahsulot ──
async function testHandlerPrivacy() {
  const pg = await pglite();
  const saved = {}; for (const k of Object.keys(ENV)) { saved[k] = process.env[k]; process.env[k] = ENV[k]; }
  const origFetch = global.fetch; const sink = [];
  global.fetch = okFetch({ title: 'Kuchli arra', body: 'Ishonchli asbob.\nUstalar uchun.', tags: ['arra', 'usta', 'yangi'] }, sink);
  try {
    const IMG = ['https://x.supabase.co/storage/v1/object/public/product-images/p.webp'];
    const products = [
      { id: 1, sku: 'D-1', name: 'Elektroarra 1900W', cat: 'Arralar', markupPct: 25, images: IMG, desc: `Kuchli arra. Narxi ${SECRET.price}, tel ${SECRET.phone}`, supplier: SECRET.supp, dsCostUsd: 7, note: SECRET.cust },
      { id: 2, sku: 'N-2', name: 'Reklamasiz', cat: 'Arralar', markupPct: 25, images: IMG, noAds: true },
    ];
    await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12500, branchNames: { baza: SECRET.filial } }, products,
      suppliers: [{ id: 9, name: SECRET.supp }], customers: [{ id: 3, name: SECRET.cust, phone: SECRET.phone }] })]);
    await pg.query(`insert into app_data_branches (branch_key, data) values ('baza', $1::jsonb)`, [JSON.stringify({ shop: { settings: { enabled: true, name: SECRET.filial, currency: 'UZS' }, discounts: [] },
      batches: [{ id: 1, pid: 1, qty: 5, sold: 0, costUsd: 33.33, date: '2026-11-20', status: 'active' }, { id: 2, pid: 2, qty: 5, sold: 0, costUsd: 4, date: '2026-11-20', status: 'active' }], sales: [], customers: [{ id: 3, name: SECRET.cust }] })]);
    const role = (rid, keys) => keys.map((k) => ({ role_id: rid, permission_id: k, permissions: { key: k } }));
    const client = makePgSupabase(pg, { pgTables: ['app_data', 'app_data_branches', 'ai_ad_posts', 'ai_ad_settings', 'ai_usage'],
      memTables: { staff: [{ id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
        { id: 8, auth_user_id: 'u-v', role: 'sotuvchi', active: true, filial: 'baza', name: 'Koruvchi', login: 'v' },
        { id: 9, auth_user_id: 'u-c', role: 'sotuvchi', active: true, filial: 'baza', name: 'Tayyorlovchi', login: 'c' }],
        staff_roles: [{ staff_id: 8, role_id: 'rv' }, { staff_id: 9, role_id: 'rc' }],
        role_permissions: [...role('rv', ['reklama.view']), ...role('rc', ['reklama.view', 'reklama.create'])], staff_audit_log: [], security_events: [] },
      users: { 't-admin': { id: 'u-admin' }, 't-v': { id: 'u-v' }, 't-c': { id: 'u-c' } } });
    require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
    const h = loadFunction('ai-ads', client);
    let r = await h(post({ action: 'text', pid: 1, kind: 'new' }, 't-v'));
    assert.equal(r.statusCode, 403, 'reklama.create yo\'q — 403');
    r = await h(post({ action: 'text', pid: 2, kind: 'new' }, 't-c'));
    assert.equal(r.statusCode, 404); assert.equal(JSON.parse(r.body).code, 'NOT_ELIGIBLE');
    r = await h(post({ action: 'text', pid: 1, kind: 'discount' }, 't-c'));
    assert.equal(r.statusCode, 200, r.body);
    const out = JSON.parse(r.body);
    assert.equal(out.text.source, 'ai'); assert.equal(out.text.title, 'Kuchli arra'); assert.equal(out.ai.used, 1);
    assert.ok(!r.body.includes(ENV.AI_API_KEY), 'AI kaliti javobda yo\'q');
    // AI'ga ketgan haqiqiy so'rov
    assert.equal(sink.length, 1);
    const req = sink[0], sent = req.o.body;
    assert.ok(!String(req.url).includes(ENV.AI_API_KEY), 'kalit URL\'da emas (sarlavhada)');
    assert.equal(req.o.headers['x-goog-api-key'], ENV.AI_API_KEY);
    assert.match(sent, /Elektroarra 1900W/); assert.match(sent, /Arralar/); assert.match(sent, /Kuchli arra/); assert.match(sent, /chegirma/);
    for (const [k, v] of Object.entries(SECRET)) assert.ok(!sent.includes(v) && !sent.includes(v.replace(/\s/g, '')), `AI'ga ${k} ketmadi`);
    for (const bad of ['987', '654', '777', '12500', '33.33', 'markup', 'cost', 'price', 'narx:', 'Narxi 9']) assert.ok(!sent.includes(bad), `AI'ga «${bad}» ketmadi`);
    // majburan shablon («boshqa variant») — AI chaqirilmaydi
    r = await h(post({ action: 'text', pid: 1, kind: 'new', template: true, variant: 3 }, 't-c'));
    assert.equal(JSON.parse(r.body).text.source, 'template'); assert.equal(JSON.parse(r.body).text.variant, 3); assert.equal(sink.length, 1);
    // status: AI ulangan, bu oy 1/3
    const st = JSON.parse((await h(post({ action: 'status' }, 't-v'))).body).ai;
    assert.deepEqual([st.on, st.used, st.limit, st.left, st.exhausted], [true, 1, 3, 2, false]);
    // v25.8 (3-bosqich): «Boshqa variant» — alts (shablon matnlar, raqamsiz; AI limiti sarflanmaydi)
    const alts = JSON.parse(r.body).alts;
    assert.ok(Array.isArray(alts) && alts.length >= 10, 'alts: 10+ variant');
    assert.equal(new Set(alts.map((x) => x.variant)).size, alts.length, 'variantlar takrorlanmaydi');
    for (const x of alts) assert.ok(!/\d/.test((x.title + x.body + x.tags.join(' ')).split('Elektroarra 1900W').join('')), 'alts — raqamsiz (nomdan tashqari)');
    assert.equal(sink.length, 1, 'alts uchun AI chaqirilmadi');
  } finally {
    global.fetch = origFetch; for (const k of Object.keys(ENV)) { if (saved[k] == null) delete process.env[k]; else process.env[k] = saved[k]; }
    unloadFunctions(); await pg.close();
  }
}

// ── 5. Rasm proksisi (ai-ads:img): faqat shu mahsulotning https rasmi; SSRF himoyasi; hajm/tur/yo'naltirish ──
async function testImgProxy() {
  const AD = require('../netlify/functions/ai-ads.js');
  const safe = AD._safeImgUrl;
  assert.ok(safe('https://x.supabase.co/storage/v1/object/public/a.webp'));
  for (const bad of ['http://x.uz/a.jpg', 'https://127.0.0.1/a.jpg', 'https://10.0.0.5/a.jpg', 'https://[::1]/a.jpg', 'https://localhost/a.jpg', 'https://intranet/a.jpg',
    'https://db.internal/a.jpg', 'https://u:p@x.uz/a.jpg', 'https://x.uz:8443/a.jpg', 'ftp://x.uz/a', 'javascript:alert(1)', '', null]) assert.equal(safe(bad), null, `rad etiladi: ${bad}`);
  const pg = await pglite();
  const origFetch = global.fetch; const calls = [];
  let mode = 'ok';
  global.fetch = async (url, o) => { calls.push({ url, o });
    const ct = mode === 'html' ? 'text/html' : 'image/webp', size = mode === 'big' ? 1600 * 1024 : 2048;
    return { ok: true, status: 200, headers: { get: (k) => (k.toLowerCase() === 'content-type' ? ct : k.toLowerCase() === 'content-length' ? (mode === 'nolen' ? null : String(size)) : null) },
      arrayBuffer: async () => new Uint8Array(mode === 'nolen' ? 1600 * 1024 : size).buffer }; };
  try {
    const IMG = ['https://x.supabase.co/storage/v1/object/public/product-images/p.webp'];
    await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12500 }, products: [
      { id: 1, sku: 'D-1', name: 'Elektroarra', cat: 'Arralar', markupPct: 25, images: IMG }, { id: 2, sku: 'N-2', name: 'Yopiq', cat: 'Arralar', markupPct: 25, images: IMG, noAds: true }] })]);
    await pg.query(`insert into app_data_branches (branch_key, data) values ('baza', $1::jsonb)`, [JSON.stringify({ shop: { settings: { enabled: true, currency: 'UZS' }, discounts: [] },
      batches: [{ id: 1, pid: 1, qty: 5, sold: 0, costUsd: 10, date: '2026-11-20', status: 'active' }, { id: 2, pid: 2, qty: 5, sold: 0, costUsd: 4, date: '2026-11-20', status: 'active' }], sales: [] })]);
    const role = (rid, keys) => keys.map((k) => ({ role_id: rid, permission_id: k, permissions: { key: k } }));
    const client = makePgSupabase(pg, { pgTables: ['app_data', 'app_data_branches', 'ai_ad_posts', 'ai_ad_settings', 'ai_usage'],
      memTables: { staff: [{ id: 8, auth_user_id: 'u-v', role: 'sotuvchi', active: true, filial: 'baza', name: 'V', login: 'v' }, { id: 9, auth_user_id: 'u-c', role: 'sotuvchi', active: true, filial: 'baza', name: 'C', login: 'c' }],
        staff_roles: [{ staff_id: 8, role_id: 'rv' }, { staff_id: 9, role_id: 'rc' }], role_permissions: [...role('rv', ['reklama.view']), ...role('rc', ['reklama.view', 'reklama.create'])], staff_audit_log: [], security_events: [] },
      users: { 't-v': { id: 'u-v' }, 't-c': { id: 'u-c' } } });
    require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
    const h = loadFunction('ai-ads', client);
    assert.equal((await h(post({ action: 'img', pid: 1 }, 't-v'))).statusCode, 403, 'reklama.create kerak');
    assert.equal((await h(post({ action: 'img', pid: 2 }, 't-c'))).statusCode, 404, '«Reklama qilmaslik» — 404');
    assert.equal((await h(post({ action: 'img', pid: 1, idx: 4 }, 't-c'))).statusCode, 400, 'mahsulotda yo\'q rasm — 400');
    assert.equal(calls.length, 0, 'rad etilganda tashqi so\'rov yo\'q');
    let r = await h(post({ action: 'img', pid: 1, url: 'https://evil.example/x.png' }, 't-c'));
    assert.equal(r.statusCode, 200, r.body); assert.match(JSON.parse(r.body).dataUrl, /^data:image\/webp;base64,/);
    assert.equal(calls[0].url, IMG[0], 'faqat mahsulotning o\'z rasmi (so\'rovdagi url e\'tiborsiz)');
    assert.equal(calls[0].o.redirect, 'error', 'yo\'naltirish taqiqlangan');
    assert.ok(calls[0].o.signal, 'vaqt chegarasi (AbortController)');
    for (const m of ['html', 'big', 'nolen']) { mode = m; r = await h(post({ action: 'img', pid: 1 }, 't-c')); assert.equal(r.statusCode, 502, `${m} — 502`); assert.equal(JSON.parse(r.body).code, 'IMG_FAIL'); }
  } finally { global.fetch = origFetch; unloadFunctions(); await pg.close(); }
}

module.exports = {
  name: 'P139 — AI-reklama 2-bosqich: matn (Gemini adapteri, shablonlar, limit, maxfiylik)',
  cases: [
    { name: 'shablonlar: 4 tur × 2 til × 10+, raqamsiz, o\'zbekcha lotin; AI\'siz rejim to\'liq ishlaydi', run: testTemplates },
    { name: 'tozalash: AI\'ga faqat 5 maydon (narx/telefon/havola yo\'q); javobdagi raqam/narx satrlari o\'chadi; yaroqsiz — null', run: testCleaning },
    { name: 'oylik limit atomik; tugasa — shablon; AI xatosi, yaroqsiz JSON, vaqt tugashi — hisobdan chiqmaydi', run: testLimit },
    { name: 'handler: AI\'ga narx, tannarx, mijoz, ta\'minotchi, telefon, filial nomi ketmaydi; kalit sarlavhada; ruxsat va mos bo\'lmagan mahsulot', run: testHandlerPrivacy },
    { name: 'rasm proksisi: faqat mahsulotning https rasmi, IP/localhost/port yo\'q, redirect:error, ≤1.5 MB, faqat image/*', run: testImgProxy },
  ],
};
