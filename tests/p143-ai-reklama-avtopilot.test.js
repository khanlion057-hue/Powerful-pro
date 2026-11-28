// P143 — v25.8 AI-reklama, 5-bosqich: AVTOPILOT (ai-ads-cron) va NAVBAT (drafts, draft_action). Haqiqiy PostgreSQL (PGlite, 58) +
// haqiqiy funksiyalar; Telegram va Storage — soxta.
//  • Faqat jadval chaqiruvi (boshqa so'rov — 404). Filial soatlarida (Toshkent) — bitta post; shu soatda takror chaqiruv — yangi post yo'q.
//  • «Tasdiqlash bilan»: qoralama (24 soat) + egasi guruhiga xabar; kanalga hech narsa ketmaydi. Tasdiqlash — mahsulot rasmi URL bilan,
//    narx QAYTA; ikkinchi tasdiqlash — 409. O'tkazish — skipped. 24 soatdan keyin — expired.
//  • «To'liq avtomat»: darhol kanalga; xato — keyingi soatda 1 marta qayta, keyin failed + egasiga xabar, boshqa urinish yo'q.
//  • Kuniga eng ko'pi N; bir mahsulot repeatDays ichida qayta tanlanmaydi; bot/kanalsiz avtopilot yoqilmaydi.
//  • Qoralama muharrirda (shablon bilan) yuborilsa — o'sha qator 'sent', format 'photo'.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const TOKEN = '7654321:AAFakeTokenForTests_abcdefghijklmn';
const CHAN = '-1002193336308', OWNER = '-1009998887776';
const IMG = (n) => [`https://x.supabase.co/storage/v1/object/public/product-images/p${n}.webp`];
const AT = (h, day = 27) => Date.parse(`2026-11-${day}T${String(h - 5).padStart(2, '0')}:20:00Z`);   // Toshkent soati h:20
const CRON = { httpMethod: 'POST', body: JSON.stringify({ next_run: '2026-11-27T05:20:00Z' }), headers: {} };

async function setup(autopilot) {
  const savedUrl = process.env.URL; process.env.URL = 'https://powerful.example.uz';
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE); await pg.exec(SCHEMA);
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12500, tgBotToken: TOKEN, tgChatId: OWNER }, products: [
    { id: 1, sku: 'A-1', name: 'Zanjirli elektroarra ECS 1900', cat: 'Arralar', markupPct: 25, images: IMG(1) },
    { id: 2, sku: 'B-2', name: 'Tortsovka MS 1900', cat: 'Arralar', markupPct: 25, images: IMG(2) }] })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('baza', $1::jsonb)`, [JSON.stringify({ shop: { settings: { enabled: true, currency: 'UZS', slug: 'powerful', name: 'Powerful Group' }, discounts: [] },
    batches: [{ id: 1, pid: 1, qty: 5, sold: 0, costUsd: 100, date: '2026-11-25', status: 'active' }, { id: 2, pid: 2, qty: 3, sold: 0, costUsd: 80, date: '2026-11-24', status: 'active' }], sales: [] })]);
  await pg.query(`insert into ai_ad_settings (branch_id, data) values ('baza', $1::jsonb)`, [JSON.stringify({ channel: CHAN, autopilot })]);
  const role = (rid, keys) => keys.map((k) => ({ role_id: rid, permission_id: k, permissions: { key: k } }));
  const client = makePgSupabase(pg, { pgTables: ['app_data', 'app_data_branches', 'ai_ad_posts', 'ai_ad_settings', 'ai_usage'],
    memTables: { staff: [{ id: 8, auth_user_id: 'u-v', role: 'sotuvchi', active: true, filial: 'baza', name: 'Koruvchi', login: 'v' },
      { id: 9, auth_user_id: 'u-p', role: 'sotuvchi', active: true, filial: 'baza', name: 'Nashrchi', login: 'p' }],
      staff_roles: [{ staff_id: 8, role_id: 'rv' }, { staff_id: 9, role_id: 'rp' }],
      role_permissions: [...role('rv', ['reklama.view']), ...role('rp', ['reklama.view', 'reklama.create', 'reklama.publish', 'reklama.settings'])], staff_audit_log: [], security_events: [] },
    users: { 't-v': { id: 'u-v' }, 't-p': { id: 'u-p' } } });
  client.storage = { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ data: [], error: null }) }) };
  require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
  const cron = loadFunction('ai-ads-cron', client), ads = loadFunction('ai-ads', client);
  const tg = { calls: [], sendOk: true, msg: 200 };
  const fake = async (url, o) => {
    const method = String(url).split('/').pop(); let payload = {};
    if (o.body instanceof FormData) { for (const [k, v] of o.body.entries()) payload[k] = typeof v === 'string' ? v : { blob: true }; } else payload = JSON.parse(o.body || '{}');
    tg.calls.push({ method, payload });
    const J = (x) => ({ ok: true, status: 200, json: async () => x });
    if (method === 'getChatMember') return J({ ok: true, result: { status: 'administrator', can_post_messages: true } });
    if (method === 'sendPhoto' && !tg.sendOk) return J({ ok: false, description: 'Bad Request: wrong file identifier' });
    return J({ ok: true, result: { message_id: ++tg.msg } });
  };
  const mc = require('../netlify/functions/ai-ads-cron.js'), ma = require('../netlify/functions/ai-ads.js');
  mc._fetch = fake; ma._fetch = fake;
  let nowMs = AT(10); mc._now = () => nowMs;
  const run = async (h, day) => { nowMs = AT(h, day); const r = await cron(CRON); assert.equal(r.statusCode, 200, r.body); return JSON.parse(r.body); };
  const rows = async () => (await pg.query(`select id, product_id, status, source, format, tries, error, idem_key, expires_at, meta, tg_message_id, caption from ai_ad_posts order by created_at`)).rows;
  return { pg, cron, ads, tg, run, rows, setNow: (ms) => { nowMs = ms; },
    close: async () => { if (savedUrl == null) delete process.env.URL; else process.env.URL = savedUrl; delete mc._fetch; delete mc._now; delete ma._fetch; unloadFunctions(); await pg.close(); } };
}

async function testApproveFlow() {
  const T = await setup({ enabled: true, mode: 'approve', hours: [10, 18], perDay: 3 });
  try {
    assert.equal((await T.cron({ httpMethod: 'POST', body: '{}', headers: {} })).statusCode, 404, 'jadval emas — 404');
    assert.equal((await T.cron({ httpMethod: 'GET', headers: {} })).statusCode, 404);
    // 09:20 — jadvalda yo'q
    await T.run(9);
    assert.equal((await T.rows()).length, 0); assert.equal(T.tg.calls.length, 0);
    // 10:20 — qoralama + egasiga xabar; kanalga hech narsa
    const o = await T.run(10);
    assert.deepEqual(o.created, [{ mode: 'approve', notified: true }]);
    let r = await T.rows();
    assert.equal(r.length, 1);
    assert.deepEqual([r[0].status, r[0].source, r[0].format, r[0].idem_key, r[0].tries], ['draft', 'autopilot', 'autophoto', 'ap-2026-11-27-10', 0]);
    assert.equal(Date.parse(r[0].expires_at) - AT(10), 86400000, '24 soat');
    assert.equal(r[0].meta.img, IMG(Number(r[0].product_id))[0], 'mahsulotning oʻz rasmi');
    assert.deepEqual(T.tg.calls.map((c) => c.method), ['sendMessage']);
    const note = T.tg.calls[0].payload;
    assert.equal(note.chat_id, OWNER); assert.match(note.text, /Yangi reklama tayyor — tasdiqlang/); assert.match(note.text, /https:\/\/powerful\.example\.uz\/#dokon/);
    assert.ok(!JSON.stringify(T.tg.calls).includes(CHAN), 'kanalga hech narsa ketmadi');
    // shu soatda qayta chaqiruv — yangi post yo'q
    assert.deepEqual((await T.run(10)).skipped, ['slot-done']); assert.equal((await T.rows()).length, 1);
    // Navbat
    const d = JSON.parse((await T.ads(post({ action: 'drafts' }, 't-v'))).body);
    assert.equal(d.items.length, 1); assert.equal(d.autopilot.mode, 'approve');
    const it = d.items[0];
    assert.match(it.price.line, /soʻm$/); assert.ok(it.title && it.body); assert.equal(it.img, r[0].meta.img);
    assert.equal((await T.ads(post({ action: 'draft_action', id: it.id, op: 'approve' }, 't-v'))).statusCode, 403, 'reklama.publish kerak');
    // tasdiqlash — kanalga, mahsulot rasmi bilan
    T.tg.calls.length = 0;
    const ap = await T.ads(post({ action: 'draft_action', id: it.id, op: 'approve' }, 't-p'));
    assert.equal(ap.statusCode, 200, ap.body); assert.match(JSON.parse(ap.body).url, /^https:\/\/t\.me\/c\/2193336308\/\d+$/);
    assert.deepEqual(T.tg.calls.map((c) => c.method), ['getChatMember', 'sendPhoto']);
    const sp = T.tg.calls[1].payload;
    assert.equal(sp.chat_id, CHAN); assert.equal(sp.photo, it.img); assert.ok(sp.caption.includes(`<b>${it.price.line}</b>`)); assert.ok(sp.caption.includes('🏬 <b>Powerful</b>'));
    assert.match(sp.reply_markup.inline_keyboard[0][0].url, /\/dokon\?s=powerful#p=\d$/);
    r = await T.rows(); assert.deepEqual([r[0].status, r[0].meta.approvedBy], ['sent', 'Nashrchi']);
    const again = await T.ads(post({ action: 'draft_action', id: it.id, op: 'approve' }, 't-p'));
    assert.equal(again.statusCode, 409); assert.equal(JSON.parse(again.body).code, 'NOT_DRAFT');
    // 18:20 — ikkinchi qoralama boshqa mahsulot (birinchisi yaqinda reklama qilingan); o'tkazish
    await T.run(18);
    r = await T.rows(); assert.equal(r.length, 2); assert.notEqual(r[1].product_id, r[0].product_id, 'bir mahsulot 7 kunda bir marta');
    const sk = await T.ads(post({ action: 'draft_action', id: r[1].id, op: 'skip' }, 't-p'));
    assert.equal(JSON.parse(sk.body).status, 'skipped');
    // ertasi 10:20 — yangi qoralama; 24 soatdan keyin — expired
    await T.run(10, 28);
    r = await T.rows(); const d3 = r[2]; assert.equal(d3.status, 'draft');
    await T.run(11, 29);
    assert.equal((await T.rows())[2].status, 'expired', '24 soatda tasdiqlanmadi');
    assert.equal((await T.ads(post({ action: 'draft_action', id: d3.id, op: 'approve' }, 't-p'))).statusCode, 409);
    assert.equal((await T.ads(post({ action: 'draft_action', id: 'not-a-uuid', op: 'approve' }, 't-p'))).statusCode, 400);
  } finally { await T.close(); }
}

async function testAutoRetry() {
  const T = await setup({ enabled: true, mode: 'auto', hours: [10, 11, 12, 13], perDay: 2 });
  try {
    T.tg.sendOk = false;
    let o = await T.run(10);
    assert.deepEqual(o.created, [{ mode: 'auto', ok: false }]);
    let r = await T.rows();
    assert.deepEqual([r[0].status, r[0].tries], ['failed', 1]); assert.match(r[0].error, /wrong file/);
    assert.ok(!T.tg.calls.some((c) => c.method === 'sendMessage'), '1-xatoda egasiga xabar yoʻq');
    // 11:20 — 1 marta qayta (yana xato) → failed + egasiga xabar; kuniga 2 — ikkinchi yangi post ham
    T.tg.calls.length = 0;
    o = await T.run(11);
    assert.deepEqual(o.retried, { ok: false });
    assert.deepEqual(o.created, [{ mode: 'auto', ok: false }], 'shu soatning yangi posti (u ham xato)');
    r = await T.rows(); assert.deepEqual([r[0].status, r[0].tries], ['failed', 2]); assert.deepEqual([r[1].status, r[1].tries], ['failed', 1]);
    const warn = T.tg.calls.find((c) => c.method === 'sendMessage');
    assert.ok(warn && warn.payload.chat_id === OWNER && /yuborilmadi/.test(warn.payload.text), 'egasiga xabar');
    assert.ok(!JSON.stringify(T.tg.calls).includes(TOKEN));
    // 12:20 — qayta urinish yo'q (2 marta bo'ldi); kuniga 2 — to'ldi
    T.tg.sendOk = true; T.tg.calls.length = 0;
    o = await T.run(12);
    assert.deepEqual(o.retried, { ok: true }, '11:00 posti — 1 marta qayta (muvaffaqiyatli)');
    r = await T.rows();
    assert.deepEqual([r[0].status, r[0].tries], ['failed', 2], '10:00 posti — uchinchi urinish yoʻq');
    assert.deepEqual([r[1].status, r[1].tries], ['sent', 2]);
    assert.ok(o.skipped.includes('per-day'), 'kuniga eng koʻpi 2');
    T.tg.calls.length = 0;
    o = await T.run(13);
    assert.equal(o.retried, null); assert.ok(!T.tg.calls.some((c) => c.method === 'sendPhoto'), 'failed (2 urinish) qayta yuborilmaydi');
    // muvaffaqiyatli avtomat post (ertasi)
    await T.run(10, 28);
    r = await T.rows(); const last = r[r.length - 1];
    assert.deepEqual([last.status, last.format, last.source], ['sent', 'autophoto', 'autopilot']); assert.ok(Number(last.tg_message_id) > 0);
  } finally { await T.close(); }
}

async function testSettingsAndEditor() {
  const T = await setup({ enabled: false, mode: 'approve', hours: [10], perDay: 3 });
  try {
    // avtopilot o'chiq — hech narsa
    assert.deepEqual((await T.run(10)).created, []);
    // bot/kanalsiz yoqilmaydi
    await T.pg.query(`update app_data set data = jsonb_set(data, '{settings,tgAnnounceChats}', '[]') where id='main'`);
    let r = await T.ads(post({ action: 'settings_save', settings: { channel: '', autopilot: { enabled: true, mode: 'approve', hours: [10], perDay: 3 } } }, 't-p'));
    assert.equal(r.statusCode, 400); assert.equal(JSON.parse(r.body).code, 'NO_CHANNEL');
    r = await T.ads(post({ action: 'settings_save', settings: { channel: CHAN, autopilot: { enabled: true, mode: 'approve', hours: [10, 25, 10], perDay: 9 } } }, 't-p'));
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(JSON.parse(r.body).settings.autopilot, { enabled: true, mode: 'approve', hours: [10], perDay: 5 }, 'notoʻgʻri soat/son — tuzatildi');
    // qoralama → muharrirda shablon bilan (o'sha kalit) → o'sha qator sent, format photo
    await T.run(10);
    const dr = (await T.rows())[0];
    const pr = JSON.parse((await T.ads(post({ action: 'product', pid: Number(dr.product_id) }, 't-p'))).body).item;
    const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 1)]).toString('base64');
    const pub = await T.ads(post({ action: 'publish', pid: Number(dr.product_id), format: 'photo', template: 'yangioq', reason: 'new', priceLine: pr.line, oldLine: pr.oldLine,
      photo: JPEG, text: { title: dr.meta.title, body: dr.meta.body, tags: dr.meta.tags }, idemKey: dr.idem_key }, 't-p'));
    assert.equal(pub.statusCode, 200, pub.body);
    const rows = await T.rows();
    assert.equal(rows.length, 1, 'yangi qator ochilmadi');
    assert.deepEqual([rows[0].status, rows[0].format, rows[0].source], ['sent', 'photo', 'autopilot']);
    // boshqa mahsulot bilan o'sha kalit — rad
    const bad = await T.ads(post({ action: 'publish', pid: Number(dr.product_id) === 1 ? 2 : 1, format: 'photo', template: 'yangioq', reason: 'new', priceLine: pr.line, oldLine: '',
      photo: JPEG, text: { title: 'x', body: 'y', tags: [] }, idemKey: dr.idem_key }, 't-p'));
    assert.ok([400, 409].includes(bad.statusCode), bad.body);
  } finally { await T.close(); }
}

module.exports = {
  name: 'P143 — AI-reklama 5-bosqich: avtopilot (ai-ads-cron), Navbat (tasdiqlash/o\'tkazish/muddat), qayta urinish, sozlama',
  cases: [
    { name: 'tasdiqlash bilan: faqat jadval; soatda bitta; qoralama + egasiga xabar; tasdiqlash (mahsulot rasmi, narx qayta); o\'tkazish; 24 soatda expired', run: testApproveFlow },
    { name: 'to\'liq avtomat: xato — keyingi soatda 1 marta qayta, keyin failed + egasiga xabar; kuniga N; muvaffaqiyatli post', run: testAutoRetry },
    { name: 'sozlama: bot/kanalsiz yoqilmaydi, soat/son tuzatiladi; qoralama muharrirda shablon bilan — o\'sha qator', run: testSettingsAndEditor },
  ],
};
