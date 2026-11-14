// P17 — XARAJAT KATEGORIYALARI (2026-10-02): tayyor (kodda qotirilgan) ro'yxat YO'Q.
// Yagona manba — serverdagi public.expense_categories (26-migratsiya) va
// netlify/functions/expense-categories.js. HAQIQIY PostgreSQL (PGlite) + HAQIQIY server funksiyasi;
// brauzer testlarida ham so'rovlar shu funksiyaga (shu bazaga) yo'naltiriladi — soxta javob emas.
//
// Talablar ro'yxati (raqamlar — topshiriqdagi 1–20 band):
//  1 default yo'q · 2 yaratish · 3 bo'sh nom · 4 faqat bo'shliq · 5 takror · 6 trim · 7 select'da
//  8 tahrir · 9 tahrir tarixni buzmaydi · 10 ishlatilgani o'chirilsa tarix qoladi · 11 nofaol select'da yo'q
//  12 sotuvchi portali shu manbadan · 13 ruxsatsiz CRUD yo'q · 14 boshqa filial · 15 XSS · 16 ikki marta bosish
//  17 tarmoq/server xatosi — "saqlandi" yo'q · 18 xarajat ID bilan bog'lanadi · 19 pulga ta'siri yo'q · 20 qayta yuklashdan keyin qoladi
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
const MIG24 = path.join(ROOT, 'supabase-migration-24-v11-cash-authority.sql');
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger', 'expense_categories'];
const PERMS = {
  'r-acc': ['xarajatlar.create', 'xarajatlar.view', 'kassalar.transact'],   // hisobchi (filial)
  'r-sel': ['savdo.create'],                                                 // sotuvchi
  'r-wh': ['ombor.view'],                                                    // omborchi — xarajatga aloqasi yo'q
};
const USERS = { 't-admin': { id: 'u-admin' }, 't-acc': { id: 'u-acc' }, 't-sel': { id: 'u-sel' }, 't-wh': { id: 'u-wh' } };
const BOXES = [{ id: 1, name: "Naqd So'm", icon: '💵', cur: 'UZS', type: 'cash', bal: 1000000 }, { id: 3, name: 'Dollar', icon: '💲', cur: 'USD', type: 'usd', bal: 300 }];
const json = (route, status, obj) => route.fulfill({ status, contentType: 'application/json', body: typeof obj === 'string' ? obj : JSON.stringify(obj) });

async function world() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  await pg.exec(SCHEMA);
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12000 },
    branchStore: { f729: { cashboxes: BOXES, expenses: [] }, baza: { cashboxes: BOXES, expenses: [] } } })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('f729', $1::jsonb), ('baza', $1::jsonb)`, [JSON.stringify({ cashboxes: BOXES, expenses: [] })]);
  await pg.exec(fs.readFileSync(MIG24, 'utf8'));
  await pg.exec(`insert into staff (id, login, name, role, filial) overriding system value values
    (1,'admin','Admin','admin','baza'), (7,'acc','Hisobchi 729','sotuvchi','f729'), (8,'sel','Sotuvchi 729','sotuvchi','f729'), (9,'wh','Omborchi','sotuvchi','f729')`);
  const memTables = {
    staff: [
      { id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
      { id: 7, auth_user_id: 'u-acc', role: 'sotuvchi', active: true, filial: 'f729', name: 'Hisobchi 729', login: 'acc' },
      { id: 8, auth_user_id: 'u-sel', role: 'sotuvchi', active: true, filial: 'f729', name: 'Sotuvchi 729', login: 'sel' },
      { id: 9, auth_user_id: 'u-wh', role: 'sotuvchi', active: true, filial: 'f729', name: 'Omborchi', login: 'wh' },
    ],
    staff_roles: [{ staff_id: 7, role_id: 'r-acc' }, { staff_id: 8, role_id: 'r-sel' }, { staff_id: 9, role_id: 'r-wh' }],
    role_permissions: Object.entries(PERMS).flatMap(([rid, keys]) => keys.map(k => ({ role_id: rid, permission_id: k, permissions: { key: k } }))),
    staff_audit_log: [], idempotency_keys: [],
  };
  const client = makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: USERS });
  return { pg, client };
}
async function withWorld(fn) { const w = await world(); try { await fn(w); } finally { unloadFunctions(); await w.pg.close(); } }
const body = (r) => JSON.parse(r.body);
const rows = async (pg, sql, p) => (await pg.query(sql, p)).rows;
// Pul holati "suratga olinadi" — kategoriya amallari undan keyin ham AYNAN shunday bo'lishi kerak (19)
const moneySnap = async (pg) => JSON.stringify({
  cb: await rows(pg, `select filial, box_local_id, balance::text from cashbox_balances order by 1,2`),
  cl: await rows(pg, `select count(*)::int n from cashbox_ledger`),
  fk: await rows(pg, `select currency, balance::text from firma_kassa_balance order by 1`),
  fl: await rows(pg, `select count(*)::int n from firma_kassa_ledger`),
  br: await rows(pg, `select branch_key, data from app_data_branches order by 1`),
});

// ── Server: yaratish, normallashtirish, takror, ikki marta bosish ─────────────────────────
async function testServerCreateValidate() {
  await withWorld(async ({ pg, client }) => {
    const h = loadFunction('expense-categories', client);
    const call = (b, t = 't-acc') => h(post(b, t));
    const money0 = await moneySnap(pg);
    // 1: hech qanday tayyor kategoriya yo'q (bazada ham, ro'yxatda ham)
    assert.equal((await rows(pg, `select count(*)::int n from expense_categories`))[0].n, 0, 'bazada tayyor kategoriya yo\'q');
    let r = await call({ action: 'list' });
    assert.equal(r.statusCode, 200, r.body); assert.deepEqual(body(r).categories, [], "ro'yxat bo'sh");
    // 2, 6: yaratish + bo'shliqlar normallashtiriladi
    r = await call({ action: 'create', turi: 'dokon', name: '  Elektr \t  energiyasi  ', idemKey: 'c-elektr-1' });
    assert.equal(r.statusCode, 200, r.body);
    const el = body(r).category;
    assert.equal(el.name, 'Elektr energiyasi', 'trim + bitta probel');
    assert.equal(el.isActive, true);
    const dbRow = (await rows(pg, `select filial, turi, name, name_key, created_by, created_by_name from expense_categories`))[0];
    assert.deepEqual(dbRow, { filial: 'f729', turi: 'dokon', name: 'Elektr energiyasi', name_key: 'elektr energiyasi', created_by: 7, created_by_name: 'Hisobchi 729' }, 'filial va muallif serverdan');
    // 3, 4: bo'sh va faqat bo'shliq — rad; uzun va boshqaruv belgisi — rad
    for (const bad of ['', '   ', '\t \n', 'x'.repeat(61), 'Elek\u0007tr', null, 42]) {
      r = await call({ action: 'create', turi: 'dokon', name: bad, idemKey: 'c-bad-' + String(bad).length + '-x' });
      assert.equal(r.statusCode, 400, `rad etilishi kerak: ${JSON.stringify(bad)}`);
    }
    // 5: takror — katta-kichik harf, ortiqcha bo'shliq va apostrof turi farqsiz
    for (const dup of ['elektr energiyasi', 'ELEKTR   ENERGIYASI', ' Elektr energiyasi ']) {
      r = await call({ action: 'create', turi: 'dokon', name: dup, idemKey: 'c-dup-' + dup.length + 'abc' });
      assert.equal(r.statusCode, 409, `takror: "${dup}"`); assert.match(body(r).error, /allaqachon bor/);
    }
    r = await call({ action: 'create', turi: 'dokon', name: "Yo'lkira", idemKey: 'c-yol-1' });
    assert.equal(r.statusCode, 200);
    r = await call({ action: 'create', turi: 'dokon', name: 'Yo‘lkira', idemKey: 'c-yol-2' });
    assert.equal(r.statusCode, 409, "Yo‘lkira = Yo'lkira (apostrof turi farqsiz)");
    // Boshqa xarajat turida (ta'sischi) shu nom — alohida ro'yxat
    r = await call({ action: 'create', turi: 'tasischi', name: 'Elektr energiyasi', idemKey: 'c-tas-1' });
    assert.equal(r.statusCode, 200, r.body);
    // 16: ikki marta bosish — bir xil kalit parallel: bitta yozuv
    const [a, b] = await Promise.all([1, 2].map(() => call({ action: 'create', turi: 'dokon', name: 'Ijara', idemKey: 'c-ijara-dbl' })));
    assert.equal(a.statusCode, 200); assert.equal(b.statusCode, 200);
    assert.equal(body(a).category.id, body(b).category.id, 'ikkala javob — o\'sha kategoriya');
    // turli kalit, bir xil nom, parallel — biri 200, biri 409; bazada bitta
    const [c, d] = await Promise.all(['k-par-1', 'k-par-2'].map(k => call({ action: 'create', turi: 'dokon', name: 'Soliq', idemKey: k })));
    assert.deepEqual([c.statusCode, d.statusCode].sort(), [200, 409]);
    const n = await rows(pg, `select name, count(*)::int n from expense_categories where filial='f729' and turi='dokon' group by name order by name`);
    assert.deepEqual(n, [{ name: 'Elektr energiyasi', n: 1 }, { name: 'Ijara', n: 1 }, { name: 'Soliq', n: 1 }, { name: "Yo'lkira", n: 1 }]);
    // 15 (server tomoni): HTML nomi oddiy matn sifatida saqlanadi (render paytida escape — brauzer testida)
    r = await call({ action: 'create', turi: 'dokon', name: '<script>alert(1)</script>', idemKey: 'c-xss-1' });
    assert.equal(r.statusCode, 200); assert.equal(body(r).category.name, '<script>alert(1)</script>');
    // 19: pulga hech qanday ta'sir yo'q
    assert.equal(await moneySnap(pg), money0, "kassa, Firma kassa, jurnal va filial ma'lumoti o'zgarmadi");
  });
}

// ── Server: tahrir, o'chirish (ishlatilgan — nofaol), ruxsatlar, filial izolyatsiyasi ─────
async function testServerEditRemoveAuthFilial() {
  await withWorld(async ({ pg, client }) => {
    const h = loadFunction('expense-categories', client);
    const call = (b, t = 't-acc') => h(post(b, t));
    const mk = async (name, t = 't-acc', extra = {}) => body(await call({ action: 'create', turi: 'dokon', name, idemKey: 'mk-' + name.replace(/\W/g, '') + '-' + t, ...extra }, t)).category;
    const elektr = await mk('Elektr'), suv = await mk('Suv'), gaz = await mk('Gaz');
    // Xarajatlar (filial ma'lumotida): Elektr — ID bilan, Gaz — ishlatilmagan
    const exps = [{ id: 501, date: '2026-10-01', cat: 'Elektr', catId: elektr.id, amtUsd: 12.5, amount: 150000, cur: 'UZS', turi: 'dokon', boxId: 1 }];
    await pg.query(`update app_data_branches set data = jsonb_set(data, '{expenses}', $1::jsonb) where branch_key='f729'`, [JSON.stringify(exps)]);
    const money0 = await moneySnap(pg);
    // 8, 9: tahrir — ID o'zgarmaydi, xarajat yozuvi tegilmaydi
    let r = await call({ action: 'rename', id: elektr.id, name: '  Elektr   energiyasi ' });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual([body(r).category.id, body(r).category.name], [elektr.id, 'Elektr energiyasi']);
    const after = (await rows(pg, `select data->'expenses' v from app_data_branches where branch_key='f729'`))[0].v;
    assert.deepEqual(after, exps, 'tarixiy xarajat (summa, catId, nom) o\'zgarmadi');
    r = await call({ action: 'rename', id: suv.id, name: 'ELEKTR ENERGIYASI' });
    assert.equal(r.statusCode, 409, "tahrirda ham takror yo'q");
    r = await call({ action: 'rename', id: suv.id, name: '   ' });
    assert.equal(r.statusCode, 400);
    // 10: ishlatilgan — o'chirilmaydi, NOFAOL; ishlatilmagan — o'chiriladi
    r = await call({ action: 'remove', id: elektr.id });
    assert.equal(r.statusCode, 200); assert.equal(body(r).mode, 'deactivated');
    const er = (await rows(pg, `select is_active, deactivated_at is not null d, deactivated_by_name from expense_categories where id=$1`, [elektr.id]))[0];
    assert.deepEqual(er, { is_active: false, d: true, deactivated_by_name: 'Hisobchi 729' }, 'qator qoladi, nofaol');
    r = await call({ action: 'remove', id: gaz.id });
    assert.equal(body(r).mode, 'deleted');
    assert.equal((await rows(pg, `select count(*)::int n from expense_categories where id=$1`, [gaz.id]))[0].n, 0);
    // Eski (ID'siz) xarajat nomi bo'yicha ham "ishlatilgan" hisoblanadi
    const legacy = await mk('Svet');
    await pg.query(`update app_data_branches set data = jsonb_set(data, '{expenses}', $1::jsonb) where branch_key='f729'`, [JSON.stringify([...exps, { id: 502, cat: 'svet', amtUsd: 3, turi: 'dokon' }])]);
    assert.equal(body(await call({ action: 'remove', id: legacy.id })).mode, 'deactivated', 'eski yozuv nomi bo\'yicha — nofaol');
    // Ro'yxat: nofaol ham qaytadi (tarixiy nom uchun), isActive=false
    const list = body(await call({ action: 'list' })).categories;
    assert.deepEqual(list.map(c => [c.name, c.isActive]), [['Elektr energiyasi', false], ['Suv', true], ['Svet', false]]);
    // Nofaol bilan bir xil nomli yangisi — mumkin (faol orasida takror yo'q)
    r = await call({ action: 'create', turi: 'dokon', name: 'Elektr energiyasi', idemKey: 'again-elektr' });
    assert.equal(r.statusCode, 200);
    r = await call({ action: 'rename', id: elektr.id, name: 'X' });
    assert.equal(r.statusCode, 400, "nofaol kategoriya tahrirlanmaydi");
    // 13: ruxsatlar
    r = await h(post({ action: 'list' }, null));
    assert.equal(r.statusCode, 401, 'tizimga kirmagan — 401');
    for (const act of [{ action: 'list' }, { action: 'create', turi: 'dokon', name: 'A', idemKey: 'wh-create-1' }, { action: 'rename', id: suv.id, name: 'B' }, { action: 'remove', id: suv.id }]) {
      r = await call(act, 't-wh');
      assert.equal(r.statusCode, 403, `omborchi: ${act.action} — 403`);
    }
    r = await call({ action: 'create', turi: 'dokon', name: 'Sotuvchi kategoriyasi', idemKey: 'sel-create-1' }, 't-sel');
    assert.equal(r.statusCode, 200, "sotuvchi do'kon kategoriyasi yarata oladi (xarajat kirita oladi)");
    for (const act of [{ action: 'create', turi: 'tasischi', name: 'T', idemKey: 'sel-tas-1' }, { action: 'rename', id: suv.id, name: 'B' }, { action: 'remove', id: suv.id }]) {
      r = await call(act, 't-sel');
      assert.equal(r.statusCode, 403, `sotuvchi: ${act.action}/${act.turi || ''} — 403`);
    }
    r = await call({ action: 'create', turi: 'boshqa', name: 'A', idemKey: 'bad-turi-1' });
    assert.equal(r.statusCode, 400, "noma'lum xarajat turi");
    // 14: filial izolyatsiyasi — admin Bazada yaratadi; f729 xodimi ko'rmaydi va o'zgartira olmaydi
    const bazaCat = body(await call({ action: 'create', turi: 'dokon', name: 'Baza ijarasi', idemKey: 'adm-baza-1', filial: 'baza' }, 't-admin')).category;
    const accList = body(await call({ action: 'list', filial: 'baza' })).categories;
    assert.ok(!accList.some(c => c.id === bazaCat.id), "f729 xodimi filial='baza' so'rasa ham — faqat o'z filiali");
    assert.equal((await call({ action: 'rename', id: bazaCat.id, name: 'Buzish', filial: 'baza' })).statusCode, 404, "boshqa filial kategoriyasi — topilmadi");
    assert.equal((await call({ action: 'remove', id: bazaCat.id })).statusCode, 404);
    r = await call({ action: 'create', turi: 'dokon', name: 'Begona', idemKey: 'acc-baza-1', filial: 'baza' });
    assert.equal((await rows(pg, `select filial from expense_categories where id=$1`, [body(r).category.id]))[0].filial, 'f729', 'xodim yaratgani — doim o\'z filialida');
    assert.ok(body(await call({ action: 'list', filial: 'baza' }, 't-admin')).categories.some(c => c.id === bazaCat.id), 'admin tanlangan filialni ko\'radi');
    const denied = client.mem.db.staff_audit_log.filter(x => x.action === 'permission_denied');
    assert.ok(denied.length >= 4, 'rad etilgan urinishlar jurnalga yozildi');
    // 19: pulga ta'siri yo'q (tahrir va o'chirishdan keyin ham)
    assert.equal(await moneySnap(pg).then(s => JSON.parse(s).cb.concat(JSON.parse(s).fk)).then(JSON.stringify), JSON.stringify(JSON.parse(money0).cb.concat(JSON.parse(money0).fk)));
    // 26-migratsiyasiz — aniq 409 (jim xato yo'q)
    await pg.exec(`drop table public.expense_categories`);
    r = await call({ action: 'list' });
    assert.equal(r.statusCode, 409); assert.equal(body(r).migrationPending, true);
  });
}

// Brauzer so'rovlarini HAQIQIY server funksiyasiga (shu PGlite bazasiga) yo'naltiradi
function bridge(client, token, hooks = {}) {
  const h = loadFunction('expense-categories', client);
  return { url: '**/.netlify/functions/expense-categories', handler: async (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    if (hooks.before) { const x = await hooks.before(b, route); if (x === 'handled') return; }
    const r = await h(post(b, token));
    route.fulfill({ status: r.statusCode, contentType: 'application/json', body: r.body });
  } };
}

// ── Brauzer (admin paneli) ────────────────────────────────────────────────────────────
async function testAdminUi() {
  await withWorld(async ({ pg, client }) => {
    let mode = 'ok'; const seen = [];
    const ops = [];
    const { browser, page, consoleErrors } = await loadApp({ mockRoutes: [
      bridge(client, 't-admin', { before: async (b, route) => {
        seen.push(b.action);
        if (b.action === 'create' && mode === 'net') { await route.abort('failed'); return 'handled'; }
        if (b.action === 'create' && mode === '500') { json(route, 500, { error: 'Kategoriya amali bajarilmadi' }); return 'handled'; }
        if (b.action === 'create' && mode === 'slow') await new Promise(r => setTimeout(r, 300));
      } }),
      { url: '**/.netlify/functions/cashbox-ops', handler: (route) => { const b = JSON.parse(route.request().postData()); ops.push(b);
        json(route, 200, { ok: true, authority: true, balances: { 1: 1000000 - b.ops[0].amount } }); } },
    ] });
    try {
      await page.evaluate(() => {
        document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div><div id="pg-xarajatlar" class="page-section active"></div>');
        save = () => {}; _cloudEnabled = true; CURRENT_USER = null; CUR.usdUzs = 12800; window.confirm = () => true;
        Object.assign(S, { branch: 'f729', page: 'xarajatlar', xarajatTab: 'dokon', expenses: [], cashTxns: [], partners: [],
          cashboxes: [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 1000000 }] });
        pgXarajatlar();
      });
      // 1: yuklanmoqda → bo'sh (tayyor ro'yxat yo'q)
      await page.waitForFunction(() => !FWC.loading && FWC.loaded);
      let st = await page.evaluate(() => ({ opts: [...document.getElementById('ex-cat').options].map(o => o.textContent), html: document.getElementById('pg-xarajatlar').innerHTML }));
      assert.equal(st.opts.length, 1); assert.match(st.opts[0], /Kategoriya yo'q/);
      assert.doesNotMatch(st.html, /Svet|Yo'lkira|Abet|Soliq|Sklad|Labo|Boshqa/, 'tayyor kategoriyalar yo\'q');
      // Kategoriyasiz xarajat — rad
      await page.evaluate(async () => { document.getElementById('ex-amt').value = '10 000'; await addExpense(); });
      assert.equal(ops.length, 0);
      // 2, 6, 7: "+ Kategoriya qo'shish" → oyna → nom → Enter
      await page.evaluate(() => { document.getElementById('ex-amt').value = '25 000'; document.getElementById('ex-dsc').value = 'oktyabr'; });
      await page.click('#ex-cat-add');
      await page.fill('#fw-cat-name', '   Kamunal   to\'lovlar ');
      await page.press('#fw-cat-name', 'Enter');
      await page.waitForFunction(() => !document.getElementById('fw-catmodal'));
      st = await page.evaluate(() => { const s = document.getElementById('ex-cat'); return { sel: s.options[s.selectedIndex].textContent, amt: document.getElementById('ex-amt').value, dsc: document.getElementById('ex-dsc').value, toast: (window.__toasts.at(-1) || {}).msg }; });
      assert.deepEqual([st.sel, st.amt, st.dsc], ["Kamunal to'lovlar", '25 000', 'oktyabr'], 'yangi kategoriya tanlandi; forma ma\'lumoti yo\'qolmadi');
      assert.match(st.toast, /qo'shildi/);
      // 3: bo'sh nom — oynada xato, so'rov yo'q
      const before = seen.length;
      await page.click('#ex-cat-add'); await page.fill('#fw-cat-name', '    '); await page.click('#fw-cat-save');
      st = await page.evaluate(() => ({ open: !!document.getElementById('fw-catmodal'), msg: document.getElementById('fw-cat-msg').textContent }));
      assert.equal(st.open, true); assert.match(st.msg, /nomini yozing/); assert.equal(seen.length, before, 'serverga yuborilmadi');
      // 17: tarmoq xatosi va server xatosi — oyna ochiq, xato ko'rinadi, "saqlandi" YO'Q
      for (const m of ['net', '500']) {
        mode = m;
        const toasts0 = await page.evaluate(() => window.__toasts.length);
        await page.fill('#fw-cat-name', 'Internet'); await page.click('#fw-cat-save');
        await page.waitForFunction(() => /⛔/.test(document.getElementById('fw-cat-msg').textContent));
        st = await page.evaluate((t0) => ({ open: !!document.getElementById('fw-catmodal'), btn: document.getElementById('fw-cat-save').disabled,
          newToasts: window.__toasts.slice(t0).map(t => t.msg), inList: FWC.list.some(c => c.name === 'Internet'),
          inSelect: [...document.getElementById('ex-cat').options].some(o => o.textContent === 'Internet') }), toasts0);
        assert.deepEqual([st.open, st.btn, st.inList, st.inSelect], [true, false, false, false], `${m}: oyna ochiq, ro'yxatga qo'shilmadi`);
        assert.equal(st.newToasts.length, 0, `${m}: "qo'shildi" xabari chiqmadi`);
      }
      assert.equal((await rows(pg, `select count(*)::int n from expense_categories where name='Internet'`))[0].n, 0);
      // Qayta urinish (tarmoq tiklandi) — o'sha kalit; 16: ikki marta bosish — bitta so'rov
      mode = 'slow';
      const creates0 = seen.filter(a => a === 'create').length;
      await page.evaluate(() => { const b = document.getElementById('fw-cat-save'); b.click(); b.click(); b.click(); });
      await page.waitForFunction(() => !document.getElementById('fw-catmodal'));
      assert.equal(seen.filter(a => a === 'create').length - creates0, 1, 'uch marta bosish — bitta so\'rov');
      assert.equal((await rows(pg, `select count(*)::int n from expense_categories where name='Internet'`))[0].n, 1);
      mode = 'ok';
      // 5: takror — oynada xato
      await page.click('#ex-cat-add'); await page.fill('#fw-cat-name', "KAMUNAL TO'LOVLAR"); await page.click('#fw-cat-save');
      await page.waitForFunction(() => /allaqachon bor/.test(document.getElementById('fw-cat-msg').textContent));
      await page.click('#fw-cat-cancel');
      // 15: XSS — nom oddiy matn sifatida ko'rinadi
      await page.click('#ex-cat-add'); await page.fill('#fw-cat-name', '<img src=x onerror="window.__xss=1">'); await page.click('#fw-cat-save');
      await page.waitForFunction(() => !document.getElementById('fw-catmodal'));
      // 18: xarajat kategoriyaga ID bilan bog'lanadi
      const kid = await page.evaluate(async () => {
        const c = FWC.list.find(x => x.name === "Kamunal to'lovlar");
        const s = document.getElementById('ex-cat'); s.value = String(c.id);
        document.getElementById('ex-amt').value = '25 000';
        await addExpense();
        return c.id;
      });
      st = await page.evaluate(() => ({ e: S.expenses.map(e => ({ cat: e.cat, catId: e.catId, amtUsd: e.amtUsd, amount: e.amount })), bal: S.cashboxes[0].bal }));
      assert.equal(st.e.length, 1); assert.deepEqual([st.e[0].cat, st.e[0].catId], ["Kamunal to'lovlar", kid]);
      assert.equal(ops.length, 1);
      const moneyBefore = st;
      // 8, 9: tahrir (Kategoriyalar oynasi) — eski xarajat yangi nom bilan ko'rinadi, summa/kassa o'zgarmaydi
      await page.evaluate(() => { pgXarajatlar(); exCatManage(); });
      await page.click(`#fw-catmodal button[data-act="ren"][data-id="${kid}"]`);
      await page.fill('#fw-cat-name', 'Kommunal xizmatlar'); await page.click('#fw-cat-save');
      await page.waitForFunction(() => document.getElementById('fw-catmodal') && /Kommunal xizmatlar/.test(document.getElementById('fw-catmodal').textContent));
      st = await page.evaluate(() => ({ label: document.querySelector('#pg-xarajatlar [data-excat]').textContent, e: S.expenses.map(e => ({ cat: e.cat, catId: e.catId, amtUsd: e.amtUsd, amount: e.amount })), bal: S.cashboxes[0].bal }));
      assert.equal(st.label, 'Kommunal xizmatlar', "ro'yxatda yangi nom (ID orqali)");
      assert.deepEqual(st.e, moneyBefore.e, "xarajat yozuvi (summa, catId, asl nom) o'zgarmadi");
      assert.equal(st.bal, moneyBefore.bal, 'kassa o\'zgarmadi');
      assert.equal(ops.length, 1, "kategoriya amali kassa so'rovi yubormadi");
      // 10, 11: ishlatilgan kategoriyani o'chirish — tasdiq → nofaol; select'da yo'q; xarajat nomi saqlanadi
      await page.evaluate(async () => { await new Promise(r => setTimeout(r, 50)); save = () => {}; });
      // Server "ishlatilgan"ni filial ma'lumotidan aniqlaydi — brauzerdagi xarajatni bazaga yozamiz
      await pg.query(`update app_data_branches set data = jsonb_set(data, '{expenses}', $1::jsonb) where branch_key='f729'`, [JSON.stringify(await page.evaluate(() => S.expenses))]);
      await page.click(`#fw-catmodal button[data-act="del"][data-id="${kid}"]`);
      await page.waitForFunction(() => /nofaol/.test(document.getElementById('fw-catmodal').textContent));
      await page.click('#fw-catm-close');
      st = await page.evaluate((id) => ({ inSelect: [...document.getElementById('ex-cat').options].some(o => o.value === String(id)),
        label: fwExpCatLabel(S.expenses[0]), toast: (window.__toasts.at(-1) || {}).msg }), kid);
      assert.equal(st.inSelect, false, "nofaol kategoriya yangi xarajat ro'yxatida yo'q");
      assert.equal(st.label, 'Kommunal xizmatlar', 'tarixiy xarajat o\'z kategoriyasi bilan qoladi');
      assert.match(st.toast, /nofaol/);
      assert.equal((await rows(pg, `select is_active from expense_categories where id=$1`, [kid]))[0].is_active, false);
      // 15: XSS bajarilmadi (select, ro'yxat, boshqaruv oynasi)
      await page.evaluate(() => { pgXarajatlar(); exCatManage(); });
      assert.equal(await page.evaluate(() => !!window.__xss || !!document.querySelector('#fw-catmodal img, #ex-cat img')), false, 'XSS bajarilmadi');
      await page.click('#fw-catm-close');
      // 20: qayta yuklashdan keyin (serverdan qaytadan o'qish) — saqlangan
      const names = await page.evaluate(async () => { FWC.loaded = false; FWC.list = []; await fwExpCatLoad('f729', true); return fwExpCatActive('dokon').map(c => c.name); });
      assert.deepEqual(names.sort(), ['<img src=x onerror="window.__xss=1">', 'Internet'].sort());
      // Server xatosida ro'yxat yuklanmasa — "Qayta yuklash" va xato holati
      await page.route('**/.netlify/functions/expense-categories', (route) => json(route, 500, { error: 'xato' }));
      await page.evaluate(async () => { await fwExpCatLoad('f729', true); exCatRefresh(); });
      st = await page.evaluate(() => ({ opt: document.getElementById('ex-cat').options[0].textContent, retry: document.getElementById('ex-cat-retry').style.display }));
      assert.match(st.opt, /yuklanmadi/); assert.equal(st.retry, '');
      assert.deepEqual(consoleErrors, []);
    } finally { await browser.close(); }
  });
}

// ── Sotuvchi portali: shu manba (12), reload'dan keyin ham (20) ─────────────────────────
async function testSellerPortalSameSource() {
  await withWorld(async ({ pg, client }) => {
    const adm = loadFunction('expense-categories', client);
    await adm(post({ action: 'create', turi: 'dokon', name: 'Kamunal', idemKey: 'adm-kam-1', filial: 'f729' }, 't-admin'));
    await adm(post({ action: 'create', turi: 'tasischi', name: 'Faqat admin turi', idemKey: 'adm-tas-1', filial: 'f729' }, 't-admin'));
    await adm(post({ action: 'create', turi: 'dokon', name: 'Baza uchun', idemKey: 'adm-baza-2', filial: 'baza' }, 't-admin'));
    const ecH = loadFunction('expense-categories', client);
    const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'application/javascript' : 'text/html' }); s.end(d); }); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
    const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--no-sandbox'] });
    const server = { settings: { usdUzs: 12800 }, products: [], branchStore: { f729: { sales: [], expenses: [], cashboxes: BOXES, batches: [] } } };
    try {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.addInitScript({ content: supabaseStub({ loggedIn: true }) });
      await ctx.route('**/*', async (route) => {
        const u = route.request().url();
        if (u.includes('/functions/expense-categories')) { const r = await ecH(post(JSON.parse(route.request().postData()), 't-sel')); return json(route, r.statusCode, r.body); }
        if (u.includes('/functions/app-data-load')) return json(route, 200, { data: JSON.parse(JSON.stringify(server)) });
        if (u.includes('/functions/staff-whoami')) return json(route, 200, { staff: { id: 8, name: 'Sotuvchi 729', filial: 'f729', active: true, role: 'sotuvchi' } });
        if (u.includes('/functions/cashbox-ops')) return json(route, 200, { ok: true, authority: true, balances: { 1: 990000 } });
        if (u.includes('/functions/')) return json(route, 200, { ok: true });
        if (u.startsWith(`http://127.0.0.1:${port}/`)) return route.continue();
        if (u.includes('cdn.jsdelivr.net')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
        return route.abort('failed');
      });
      const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
      const open = async () => {
        await page.goto(`http://127.0.0.1:${port}/sotuvchi.html`); await page.waitForTimeout(1200);
        await page.evaluate(() => svSwitchTab('expense'));
        await page.waitForFunction(() => FWC.loaded && document.getElementById('sve-cat') && !/Yuklanmoqda/.test(document.getElementById('sve-cat').textContent));
        return page.evaluate(() => [...document.getElementById('sve-cat').options].map(o => o.textContent));
      };
      let opts = await open();
      assert.deepEqual(opts, ['Kategoriya tanlang', 'Kamunal'], "sotuvchi: o'z filialining do'kon kategoriyalari (boshqa tur va boshqa filial yo'q)");
      assert.doesNotMatch(await page.content(), /Svet|Abet|Sklad|Labo/, "tayyor ro'yxat yo'q");
      await page.click('#sve-cat-add'); await page.fill('#fw-cat-name', 'Omborga'); await page.click('#fw-cat-save');
      await page.waitForFunction(() => !document.getElementById('fw-catmodal'));
      const sel = await page.evaluate(() => { const s = document.getElementById('sve-cat'); return s.options[s.selectedIndex].textContent; });
      assert.equal(sel, 'Omborga');
      await page.evaluate(async () => { document.getElementById('sve-amt').value = '10 000'; await svAddExpense(); });
      const e = await page.evaluate(() => S.expenses.map(x => [x.cat, typeof x.catId]));
      assert.deepEqual(e, [['Omborga', 'number']]);
      // Admin ham aynan shu kategoriyani ko'radi (bitta manba)
      const adminList = JSON.parse((await adm(post({ action: 'list', filial: 'f729' }, 't-admin'))).body).categories.map(c => c.name);
      assert.ok(adminList.includes('Omborga'));
      // 20: sahifa qayta yuklanadi — kategoriya serverda saqlangan
      opts = await open();
      assert.deepEqual(opts, ['Kategoriya tanlang', 'Kamunal', 'Omborga']);
      assert.equal((await rows(pg, `select created_by_name from expense_categories where name='Omborga'`))[0].created_by_name, 'Sotuvchi 729');
      assert.deepEqual(errs, []);
    } finally { await browser.close(); srv.close(); }
  });
}

module.exports = {
  name: "P17 — Xarajat kategoriyalari: tayyor ro'yxat yo'q, serverdagi yagona manba (expense_categories), CRUD, xavfsizlik",
  cases: [
    { name: "Server: default yo'q; yaratish, trim, bo'sh/bo'shliq/uzun rad, takror (harf/apostrof farqsiz), ikki marta bosish, pulga ta'sir yo'q", run: testServerCreateValidate },
    { name: "Server: tahrir (ID o'zgarmaydi), ishlatilgan — nofaol, ishlatilmagan — o'chadi, ruxsatlar, filial izolyatsiyasi, 26-migratsiyasiz 409", run: testServerEditRemoveAuthFilial },
    { name: "Admin paneli: oyna, yuklanish/xato/muvaffaqiyat holatlari, tarmoq xatosida 'saqlandi' yo'q, 3× bosish — 1 so'rov, tahrir/o'chirish tarixni buzmaydi, XSS", run: testAdminUi },
    { name: "Sotuvchi portali: o'sha manba, yangi kategoriya va xarajat, sahifa qayta yuklangandan keyin saqlangan", run: testSellerPortalSameSource },
  ],
};
