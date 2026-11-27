// P141 — v25.8 AI-reklama, 4-bosqich: TELEGRAM KANALGA YUBORISH. Haqiqiy PostgreSQL (PGlite, 58) + haqiqiy `ai-ads`;
// Telegram va Storage — soxta (tarmoqqa chiqilmaydi).
//  • Ruxsat: reklama.publish; yuborishdan OLDIN getChatMember (bot ID — tokendan); kanal: filial sozlamasi.
//  • Narx va qoldiq QAYTA serverda: narx o'zgargan — 409 PRICE_CHANGED (Telegram'ga hech narsa ketmaydi); qoldiq 0 — 409.
//  • Izohdagi narx — faqat serverdan; foydalanuvchi matnidagi narx qatori olib tashlanadi; HTML ekranlanadi.
//  • Takror yo'q: bir xil kalit — bitta post (ikkinchi so'rov «duplicate», Telegram'ga qayta ketmaydi).
//  • Xato: status=failed, sabab saqlanadi (token yashirilgan); o'sha kalit bilan «Qayta yuborish» — tries=2, sent.
//  • Video: bir martalik yuklash havolasi; sendVideo — imzolangan URL; fayl yuborilgandan keyin (xato bo'lsa ham) o'chiriladi.
//  • Tarix: holat, xato, kanal havolasi (t.me/c/...).
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');
const AP = require('../netlify/functions/_lib/aiPublish');

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const TOKEN = '7654321:AAFakeTokenForTests_abcdefghijklmn';
const CHAN = '-1002193336308';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]).toString('base64');

async function setup() {
  const savedUrl = process.env.URL; process.env.URL = 'https://powerful.example.uz';
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE); await pg.exec(SCHEMA);
  const IMG = ['https://x.supabase.co/storage/v1/object/public/product-images/p.webp'];
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12500, tgBotToken: TOKEN }, products: [
    { id: 1, sku: 'A-1', name: 'Arra MS 1900', cat: 'Arralar', markupPct: 25, images: IMG },
    { id: 2, sku: 'B-2', name: 'Tugagan', cat: 'Arralar', markupPct: 25, images: IMG }] })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('baza', $1::jsonb)`, [JSON.stringify({ shop: { settings: { enabled: true, currency: 'UZS', slug: 'powerful' }, discounts: [] },
    batches: [{ id: 1, pid: 1, qty: 5, sold: 0, costUsd: 100, date: '2026-11-20', status: 'active' }, { id: 2, pid: 2, qty: 3, sold: 0, costUsd: 10, date: '2026-11-20', status: 'active' }], sales: [] })]);
  await pg.query(`insert into ai_ad_settings (branch_id, data) values ('baza', $1::jsonb)`, [JSON.stringify({ channel: CHAN })]);
  const role = (rid, keys) => keys.map((k) => ({ role_id: rid, permission_id: k, permissions: { key: k } }));
  const client = makePgSupabase(pg, { pgTables: ['app_data', 'app_data_branches', 'ai_ad_posts', 'ai_ad_settings', 'ai_usage'],
    memTables: { staff: [{ id: 8, auth_user_id: 'u-c', role: 'sotuvchi', active: true, filial: 'baza', name: 'Tayyorlovchi', login: 'c' },
      { id: 9, auth_user_id: 'u-p', role: 'sotuvchi', active: true, filial: 'baza', name: 'Nashrchi', login: 'p' }],
      staff_roles: [{ staff_id: 8, role_id: 'rc' }, { staff_id: 9, role_id: 'rp' }],
      role_permissions: [...role('rc', ['reklama.view', 'reklama.create']), ...role('rp', ['reklama.view', 'reklama.create', 'reklama.publish', 'reklama.settings'])], staff_audit_log: [], security_events: [] },
    users: { 't-c': { id: 'u-c' }, 't-p': { id: 'u-p' } } });
  // soxta Storage
  const store = { files: new Set(), removed: [], signed: [] };
  client.storage = { from: (b) => ({
    list: async () => ({ data: [], error: null }),
    remove: async (paths) => { store.removed.push(...paths); paths.forEach((x) => store.files.delete(x)); return { data: [], error: null }; },
    createSignedUploadUrl: async (p) => { store.files.add(p); return { data: { signedUrl: `https://x.supabase.co/storage/v1/object/upload/sign/${b}/${p}?token=up`, path: p }, error: null }; },
    createSignedUrl: async (p, ttl) => { store.signed.push({ p, ttl }); return store.files.has(p) ? { data: { signedUrl: `https://x.supabase.co/storage/v1/object/sign/${b}/${p}?token=dl` }, error: null } : { data: null, error: { message: 'not found' } }; },
  }) };
  require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
  const h = loadFunction('ai-ads', client);
  // soxta Telegram
  const tg = { calls: [], member: 'administrator', sendOk: true, msg: 100 };
  const mod = require('../netlify/functions/ai-ads.js');
  mod._fetch = async (url, o) => {
    const method = String(url).split('/').pop(); let payload;
    if (o.body instanceof FormData) { payload = {}; for (const [k, v] of o.body.entries()) payload[k] = typeof v === 'string' ? v : { blob: true, size: v.size, type: v.type }; }
    else payload = JSON.parse(o.body || '{}');
    tg.calls.push({ method, url, payload });
    const J = (x) => ({ ok: true, status: 200, json: async () => x });
    if (method === 'getChatMember') return J({ ok: true, result: { status: tg.member, can_post_messages: true } });
    if (!tg.sendOk) return J({ ok: false, description: `Bad Request: wrong file (bot${TOKEN})` });
    return J({ ok: true, result: { message_id: ++tg.msg } });
  };
  return { pg, h, tg, store, mod, close: async () => { if (savedUrl == null) delete process.env.URL; else process.env.URL = savedUrl; delete mod._fetch; unloadFunctions(); await pg.close(); } };
}
const pub = (o) => ({ action: 'publish', pid: 1, format: 'photo', template: 'chegirma', reason: 'discount', priceLine: '1 563 000 soʻm', oldLine: '', photo: JPEG,
  text: { title: 'Chegirma <b>boshlandi</b>', body: 'Kuchli arra 1800W\nNarxi 999 000 soʻm\nTez oling', tags: ['#arra', 'usta'] }, idemKey: 'k-0000001', ...o });

async function testPhoto() {
  const T = await setup();
  try {
    // narx satri serverdagidan farq qilsa — Telegram'ga hech narsa ketmaydi
    const pr = await T.h(post(pub({ priceLine: '1 000 soʻm' }), 't-p'));
    assert.equal(pr.statusCode, 409); const pj = JSON.parse(pr.body);
    assert.equal(pj.code, 'PRICE_CHANGED'); assert.equal(T.tg.calls.length, 0, 'Telegram chaqirilmadi');
    const line = pj.price.line;
    assert.match(line, /^[\d ]+ soʻm$/);
    assert.equal((await T.h(post(pub({ priceLine: line }), 't-c'))).statusCode, 403, 'reklama.publish kerak');
    // muvaffaqiyatli
    let r = await T.h(post(pub({ priceLine: line }), 't-p'));
    assert.equal(r.statusCode, 200, r.body);
    const out = JSON.parse(r.body);
    assert.equal(out.url, 'https://t.me/c/2193336308/101');
    assert.ok(!r.body.includes(TOKEN) && !r.body.includes('AAFake'), 'token javobda yoʻq');
    assert.deepEqual(T.tg.calls.map((c) => c.method), ['getChatMember', 'sendPhoto']);
    assert.equal(T.tg.calls[0].payload.user_id, 7654321, 'bot ID — tokendan (getMe yoʻq)'); assert.equal(T.tg.calls[0].payload.chat_id, CHAN);
    const sp = T.tg.calls[1].payload;
    assert.equal(sp.chat_id, CHAN); assert.equal(sp.parse_mode, 'HTML'); assert.equal(sp.photo.type, 'image/jpeg');
    assert.match(sp.caption, /^<b>Chegirma &lt;b&gt;boshlandi&lt;\/b&gt;<\/b>/, 'HTML ekranlangan');
    assert.ok(sp.caption.includes(`Narxi: <b>${line}</b>`), 'narx — serverdan'); assert.ok(!sp.caption.includes('999 000'), 'foydalanuvchi yozgan narx olib tashlandi');
    assert.match(sp.caption, /Kuchli arra 1800W\nTez oling/); assert.match(sp.caption, /#arra #usta$/);
    assert.equal(JSON.parse(sp.reply_markup).inline_keyboard[0][0].url, 'https://powerful.example.uz/dokon?s=powerful#p=1', 'tugma — vitrinadagi mahsulot');
    const row = (await T.pg.query(`select status, tg_message_id, tries, tg_chat, template, meta, price_snapshot from ai_ad_posts`)).rows;
    assert.equal(row.length, 1); assert.equal(row[0].status, 'sent'); assert.equal(Number(row[0].tg_message_id), 101); assert.equal(row[0].tries, 1);
    assert.equal(row[0].meta.name, 'Arra MS 1900'); assert.equal(row[0].price_snapshot.line, line);
    // takror — o'sha kalit: Telegram'ga qayta ketmaydi
    r = await T.h(post(pub({ priceLine: line }), 't-p'));
    assert.equal(JSON.parse(r.body).duplicate, true); assert.equal(T.tg.calls.length, 2);
    // tarix
    const hi = JSON.parse((await T.h(post({ action: 'history' }, 't-c'))).body).items;
    assert.equal(hi.length, 1); assert.deepEqual([hi[0].status, hi[0].url, hi[0].name, hi[0].format], ['sent', 'https://t.me/c/2193336308/101', 'Arra MS 1900', 'photo']);
    // qoldiq 0 — yuborilmaydi
    await T.pg.query(`select set_config('fw.stock_move','1',false)`);
    await T.pg.query(`update app_data_branches set data = jsonb_set(data, '{batches,1,sold}', '3') where branch_key='baza'`);
    require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
    const os = await T.h(post(pub({ pid: 2, priceLine: line, idemKey: 'k-0000002' }), 't-p'));
    assert.ok([409, 404].includes(os.statusCode), os.body); assert.ok(['OUT_OF_STOCK', 'NOT_ELIGIBLE'].includes(JSON.parse(os.body).code));
    assert.equal(T.tg.calls.length, 2, 'qoldiqsiz — Telegram chaqirilmadi');
    // noto'g'ri kirish
    for (const bad of [{ template: 'yangi' }, { idemKey: 'x' }, { photo: 'bm90LWpwZWc=' }, { format: 'gif' }, { text: { title: '', body: '' } }])
      assert.equal((await T.h(post(pub({ priceLine: line, idemKey: 'k-0000003', ...bad }), 't-p'))).statusCode, 400, JSON.stringify(bad));
  } finally { await T.close(); }
}

async function testFailRetry() {
  const T = await setup();
  try {
    const line = JSON.parse((await T.h(post(pub({ priceLine: '-' }), 't-p'))).body).price.line;
    // bot kanalda administrator emas — sendPhoto chaqirilmaydi, sabab saqlanadi
    T.tg.member = 'member';
    let r = await T.h(post(pub({ priceLine: line, idemKey: 'k-retry-01' }), 't-p'));
    assert.equal(r.statusCode, 502); assert.match(JSON.parse(r.body).error, /administrator emas/);
    assert.deepEqual(T.tg.calls.map((c) => c.method), ['getChatMember']);
    // Telegram xatosi — token yashiriladi
    T.tg.member = 'administrator'; T.tg.sendOk = false;
    r = await T.h(post(pub({ priceLine: line, idemKey: 'k-retry-01' }), 't-p'));
    assert.equal(r.statusCode, 502);
    let row = (await T.pg.query(`select status, error, tries from ai_ad_posts`)).rows[0];
    assert.equal(row.status, 'failed'); assert.equal(row.tries, 2); assert.ok(row.error.includes('wrong file') && !row.error.includes(TOKEN) && !r.body.includes(TOKEN), 'token xatoda yoʻq: ' + row.error);
    // «Qayta yuborish» — o'sha kalit, endi muvaffaqiyatli; yangi qator ochilmaydi
    T.tg.sendOk = true;
    r = await T.h(post(pub({ priceLine: line, idemKey: 'k-retry-01' }), 't-p'));
    assert.equal(r.statusCode, 200, r.body);
    const rows = (await T.pg.query(`select status, error, tries from ai_ad_posts`)).rows;
    assert.equal(rows.length, 1); assert.deepEqual([rows[0].status, rows[0].error, rows[0].tries], ['sent', null, 3]);
    // kanal yoki bot yo'q
    await T.pg.query(`update ai_ad_settings set data='{}'::jsonb`);
    assert.equal(JSON.parse((await T.h(post(pub({ priceLine: line, idemKey: 'k-retry-02' }), 't-p'))).body).code, 'NO_CHANNEL');
    // tg_check
    await T.pg.query(`update ai_ad_settings set data=$1::jsonb`, [JSON.stringify({ channel: CHAN })]);
    T.tg.member = 'left';
    const ck = JSON.parse((await T.h(post({ action: 'tg_check' }, 't-p'))).body);
    assert.deepEqual([ck.ok, ck.channel], [false, CHAN]); assert.match(ck.error, /administrator emas/);
    assert.equal((await T.h(post({ action: 'tg_check' }, 't-c'))).statusCode, 403);
  } finally { await T.close(); }
}

async function testVideo() {
  const T = await setup();
  try {
    const line = JSON.parse((await T.h(post(pub({ priceLine: '-' }), 't-p'))).body).price.line;
    assert.equal((await T.h(post({ action: 'upload_url', idemKey: 'v-0000001' }, 't-c'))).statusCode, 403);
    const up = JSON.parse((await T.h(post({ action: 'upload_url', idemKey: 'v-0000001' }, 't-p'))).body);
    assert.equal(up.path, 'baza/v-0000001.mp4'); assert.match(up.signedUrl, /\/upload\/sign\/ai-ads-tmp\/baza\/v-0000001\.mp4/);
    const vpub = (o) => pub({ format: 'video', photo: undefined, videoPath: 'baza/v-0000001.mp4', idemKey: 'v-0000001', priceLine: line, dur: 10, ...o });
    assert.equal((await T.h(post(vpub({ videoPath: 'boshqa/v-0000001.mp4' }), 't-p'))).statusCode, 400, 'faqat oʻz yoʻli');
    const r = await T.h(post(vpub(), 't-p'));
    assert.equal(r.statusCode, 200, r.body);
    const sv = T.tg.calls.find((c) => c.method === 'sendVideo').payload;
    assert.match(sv.video, /\/object\/sign\/ai-ads-tmp\/baza\/v-0000001\.mp4\?token=dl$/);
    assert.deepEqual([sv.width, sv.height, sv.duration, sv.supports_streaming], [720, 1280, 10, true]);
    assert.deepEqual(T.store.removed, ['baza/v-0000001.mp4'], 'video yuborilgandan keyin oʻchirildi');
    assert.ok(T.store.signed[0].ttl <= 300);
    // xato bo'lsa ham o'chiriladi
    await T.h(post({ action: 'upload_url', idemKey: 'v-0000002' }, 't-p'));
    T.tg.sendOk = false;
    const r2 = await T.h(post(vpub({ videoPath: 'baza/v-0000002.mp4', idemKey: 'v-0000002' }), 't-p'));
    assert.equal(r2.statusCode, 502); assert.ok(T.store.removed.includes('baza/v-0000002.mp4'));
    // fayl yo'q — aniq xato
    T.tg.sendOk = true;
    const r3 = await T.h(post(vpub({ videoPath: 'baza/v-0000003.mp4', idemKey: 'v-0000003' }), 't-p'));
    assert.equal(r3.statusCode, 502); assert.match(JSON.parse(r3.body).error, /Video topilmadi/);
  } finally { await T.close(); }
}

async function testLib() {
  // vaqt chegarasi: Telegram javob bermasa — aniq xato (abort)
  const r = await AP.tgCall(TOKEN, 'sendPhoto', {}, 600, (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' })))));
  assert.deepEqual([r.ok, r.timeout], [false, true]);
  // izoh 1024 dan oshmaydi, narx va heshteg qoladi
  const cap = AP.buildCaption(AP.cleanUserText({ title: 'Sarlavha', body: 'uzun matn '.repeat(200), tags: ['arra'] }), { line: '1 000 000 soʻm', oldLine: '' }, 'uz');
  assert.ok(cap.length <= 1024); assert.match(cap, /Narxi: <b>1 000 000 soʻm<\/b>/); assert.match(cap, /#arra$/);
  assert.equal(AP.messageUrl('@powerful_uz', 7), 'https://t.me/powerful_uz/7'); assert.equal(AP.messageUrl('12345', 7), null);
  assert.equal(AP.cleanUserText({ title: '$99 arzon', body: 'a' }).title, '', 'sarlavhada narx — olib tashlanadi');
}

module.exports = {
  name: 'P141 — AI-reklama 4-bosqich: Telegram kanalga yuborish (narx qayta tekshiruvi, takrorsiz, xato va qayta yuborish, video)',
  cases: [
    { name: 'foto: getChatMember → sendPhoto; narx — serverdan (o\'zgargan — 409, Telegram chaqirilmaydi); HTML ekranlangan; takror yo\'q; tarix; qoldiq 0', run: testPhoto },
    { name: 'xato: kanal ruxsati yo\'q / Telegram xatosi — failed + sabab (tokensiz); o\'sha kalit bilan qayta yuborish — sent; NO_CHANNEL; tg_check', run: testFailRetry },
    { name: 'video: bir martalik yuklash, sendVideo imzolangan URL bilan, fayl har doim o\'chiriladi, boshqa yo\'l rad etiladi', run: testVideo },
    { name: 'kutubxona: vaqt chegarasi, izoh ≤1024 (narx va heshteg qoladi), kanal havolasi', run: testLib },
  ],
};
