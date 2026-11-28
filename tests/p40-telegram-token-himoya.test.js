// P40 — v24.5 (v23.10.2 P35 dan): Telegram/do'kon bot tokeni va PIN'lar brauzerga HECH QACHON qaytmaydi (haqiqiy funksiyalar + PGlite).
//  • app-data-save: ruxsatsiz xodim settings'ni o'zgartirishga urinsa — javobdagi serverValues.settings'da token/PIN yo'q
//    (avval: rad etilgan qiymat sifatida serverdagi to'liq settings qaytardi — oddiy sotuvchi tokenni olishi mumkin edi);
//    admin javobida ham bot tokenlari yo'q; token bazada o'zgarmay qoladi.
//  • app-data-load: sotuvchi — token ham, PIN ham yo'q; admin — bot tokenlari yo'q (faqat `tgBotTokenSet` belgisi).
//  • Frontend manbasi va dist/: bot tokeni ko'rinishidagi satr yo'q.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeWorld } = require('./helpers/f4b-world');
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const TOK = '123456789:AAHsinovTokeni_faqatTest_abcdefghijkl';
const SHOP = '987654321:AAGsinovDokonTokeni_faqatTest_mnopqr';
const PIN = '9183';

async function testServer() {
  const pg = await makeWorld({ baza: {} });
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { company: 'F', tgBotToken: TOK, tgChatId: '-1', shopBotToken: SHOP, appPin: PIN } })]);
  const memTables = {
    staff: [{ id: 7, auth_user_id: 'u-sel', role: 'sotuvchi', active: true, filial: 'baza', name: 'S', login: 's' },
      { id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'A', login: 'a' }],
    staff_roles: [{ staff_id: 7, role_id: 'r' }],
    role_permissions: [{ role_id: 'r', permission_id: 'savdo.create', permissions: { key: 'savdo.create' } }],
    staff_audit_log: [],
  };
  const client = makePgSupabase(pg, { pgTables: ['app_data', 'app_data_branches', 'cashbox_balances', 'customer_balances', 'supplier_balances', 'batches', 'sales', 'ledger_ops'],
    memTables, users: { 't-sel': { id: 'u-sel' }, 't-admin': { id: 'u-admin' } } });
  const leaks = (body) => [TOK, SHOP, 'AAHsinov', 'AAGsinov'].filter(x => body.includes(x));
  try {
    const save = loadFunction('app-data-save', client);
    // sotuvchi: settings'ni o'zgartirishga urinadi (company, PIN, tokenni o'chirish) — rad, javobda maxfiy qiymat yo'q
    for (const settings of [{ company: 'X', tgChatId: '-1' }, { company: 'F', tgChatId: '-1', appPin: '0000' }, { company: 'F', tgChatId: '-1', tgBotToken: '' }]) {
      const r = await save(post({ data: { settings } }, 't-sel'));
      assert.equal(r.statusCode, 200, r.body);
      assert.deepEqual(leaks(r.body), [], 'sotuvchi javobida token yo\'q');
      assert.ok(!r.body.includes(PIN), 'sotuvchi javobida PIN yo\'q');
      const sv = JSON.parse(r.body).serverValues.settings;
      assert.ok(sv && sv.tgBotTokenSet === true && sv.shopBotTokenSet === true, 'faqat "o\'rnatilgan" belgisi');
    }
    const r2 = await save(post({ data: { settings: { company: 'Y', tgChatId: '-1' } } }, 't-admin'));
    assert.equal(r2.statusCode, 200); assert.deepEqual(leaks(r2.body), [], 'admin javobida ham token yo\'q');
    const st = (await pg.query(`select data->'settings' s from app_data where id='main'`)).rows[0].s;
    assert.equal(st.tgBotToken, TOK, 'token bazada o\'zgarmadi'); assert.equal(st.shopBotToken, SHOP); assert.equal(st.appPin, PIN);
    const load = loadFunction('app-data-load', client);
    const ls = await load(post({}, 't-sel')); assert.equal(ls.statusCode, 200);
    assert.deepEqual(leaks(ls.body), []); assert.ok(!ls.body.includes(PIN));
    const la = await load(post({}, 't-admin')); assert.deepEqual(leaks(la.body), [], 'admin yuklashida ham token yo\'q');
  } finally { unloadFunctions(); await pg.close(); }
}

function testFrontendStatic() {
  const ROOT = path.join(__dirname, '..');
  const BOT = /\b\d{8,10}:AA[A-Za-z0-9_-]{30,}\b/;
  const files = [...fs.readdirSync(path.join(ROOT, 'js')).map(f => path.join('js', f)), ...fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))];
  if (fs.existsSync(path.join(ROOT, 'dist'))) for (const f of fs.readdirSync(path.join(ROOT, 'dist'), { recursive: true })) files.push(path.join('dist', f));
  let n = 0;
  for (const f of files) {
    const p = path.join(ROOT, f); if (!fs.statSync(p).isFile() || !/\.(js|html)$/.test(f)) continue;
    n++; assert.ok(!BOT.test(fs.readFileSync(p, 'utf8')), `${f}: bot tokeni ko'rinishidagi satr`);
  }
  assert.ok(n >= 10, `tekshirilgan fayllar: ${n}`);
}

module.exports = {
  name: "P40 — v24.5 (v23.10.2 P35 dan): bot tokenlari va PIN'lar brauzerga qaytmaydi (app-data-save/load), frontend'da token yo'q",
  cases: [
    { name: "app-data-save: ruxsatsiz settings o'zgarishi javobida token/PIN yo'q (avvalgi oqish yopildi); admin javobida ham; app-data-load", run: testServer },
    { name: 'Frontend manbasi va dist/: bot tokeni ko\'rinishidagi satr yo\'q', run: testFrontendStatic },
  ],
};
