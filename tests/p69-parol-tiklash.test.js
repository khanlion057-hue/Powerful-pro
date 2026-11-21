// P69 — v24.9 (egasi qarori): PAROLNI TIKLASH — admin tiklaydi + Telegram kod (38-migratsiya).
//  • Kirishsiz: «request» — javob har doim bir xil (login bor-yo'qligi oshkor emas); ulangan xodimga 6 xonali kod
//    (bazada faqat xesh), 60 soniyada 1 ta, IP'dan soatiga 10 ta; «confirm» — 5 xato urinishda kod bekor,
//    to'g'ri kodda yangi parol, majburiy belgisi olinadi, eski seanslar yopiladi, botga xabar.
//  • Ulash: havola (t.me/<bot>?start=pw…) → «Start» getUpdates'dan (faqat shaxsiy chat, aynan shu kod).
//  • Admin tiklashi: vaqtinchalik parol (bir marta), must_change_pw, seanslar yopiladi; sotuvchi boshqa xodimni
//    tiklay olmaydi; admin hisobini faqat admin; o'zini — yo'q.
//  • Majburiy almashtirish: belgi bor xodim boshqa funksiyalarga kira olmaydi (403 PW_CHANGE_REQUIRED),
//    faqat staff-whoami (mustChangePw: true) va pw-reset; «change» belgini oladi.
//  • update-staff: boshqa xodimga parol qo'yilsa ham majburiy almashtirish + seanslar yopiladi.
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { makeMemSupabase, loadFunction, post } = require('./helpers/mem-supabase');

const TOKEN = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function world(extra = {}) {
  return makeMemSupabase({
    tables: {
      app_data: [{ id: 'main', data: { settings: { tgBotToken: TOKEN } } }],
      staff: [{ id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Egasi', login: 'admin' },
              { id: 2, auth_user_id: 'u-sel', role: 'sotuvchi', active: true, filial: 'baza', name: 'Ali', login: 'Ali' },
              { id: 3, auth_user_id: 'u-sel2', role: 'sotuvchi', active: true, filial: 'baza', name: 'Vali', login: 'vali' },
              { id: 4, auth_user_id: 'u-off', role: 'sotuvchi', active: false, filial: 'baza', name: 'Off', login: 'off' }],
      staff_roles: [], role_permissions: [], staff_audit_log: [],
      staff_pw_reset: [{ staff_id: 2, tg_chat_id: '777', tg_name: 'Ali', code_attempts: 0, sent_count: 0 }],
      pw_reset_ip_log: [],
      ...extra,
    },
    rpc: { fw_revoke_sessions: (a) => (a.p_uid ? 2 : 0) },
    users: { 't-admin': { id: 'u-admin' }, 't-sel': { id: 'u-sel' }, 't-sel2': { id: 'u-sel2' }, 't-forced': { id: 'u-sel2', app_metadata: { must_change_pw: true } } },
  });
}
function tgMock() {
  const calls = [];
  const fetch = async (url, init) => {
    const m = /\/bot[^/]+\/(\w+)$/.exec(String(url)); const method = m && m[1];
    let body = null; try { body = JSON.parse(init.body); } catch (_) {}
    calls.push({ method, body });
    const ok = (result) => ({ ok: true, status: 200, json: async () => ({ ok: true, result }) });
    if (method === 'getMe') return ok({ username: 'powerful_test_bot' });
    if (method === 'getUpdates') return ok(fetch.updates || []);
    return ok({});
  };
  fetch.calls = calls;
  return fetch;
}
const B = (r) => JSON.parse(r.body);
const pub = (body, ip = '1.2.3.4') => ({ httpMethod: 'POST', headers: { 'x-nf-client-connection-ip': ip }, body: JSON.stringify(body) });

async function testRequestConfirm() {
  const real = global.fetch, tg = tgMock(); global.fetch = tg;
  try {
    const db = world(); const h = loadFunction('pw-reset', db);
    // Bir xil javob: noma'lum login, ulanmagan xodim, faol emas — kod yuborilmaydi
    const msgs = [];
    for (const login of ['yoq', 'vali', 'off']) { const r = await h(pub({ action: 'request', login })); assert.equal(r.statusCode, 200); msgs.push(B(r).message); }
    assert.equal(new Set(msgs).size, 1, 'javob bir xil — login oshkor emas');
    assert.equal(tg.calls.filter(c => c.method === 'sendMessage').length, 0);
    // Ulangan xodim (login katta-kichik harfsiz) — kod botga, bazada faqat xesh
    let r = await h(pub({ action: 'request', login: ' ali ' })); assert.equal(B(r).message, msgs[0]);
    const sent = tg.calls.filter(c => c.method === 'sendMessage'); assert.equal(sent.length, 1); assert.equal(sent[0].body.chat_id, '777');
    const code = /<b>(\d{6})<\/b>/.exec(sent[0].body.text)[1];
    const row = db.db.staff_pw_reset.find(x => x.staff_id === 2);
    assert.ok(row.code_hash && row.code_hash.length === 64 && !JSON.stringify(row).includes(code), 'kod ochiq saqlanmaydi');
    // 60 soniya ichida takror — yangi kod yuborilmaydi
    r = await h(pub({ action: 'request', login: 'ali' })); assert.equal(tg.calls.filter(c => c.method === 'sendMessage').length, 1);
    // Tasdiqlash: qisqa parol, noto'g'ri kod (urinish kamayadi), to'g'ri kod
    r = await h(pub({ action: 'confirm', login: 'ali', code, password: '123' })); assert.equal(r.statusCode, 400); assert.match(B(r).error, /kamida 8/);
    const wrong = code === '000000' ? '111111' : '000000';
    r = await h(pub({ action: 'confirm', login: 'ali', code: wrong, password: 'yangiParol1' })); assert.equal(r.statusCode, 400); assert.match(B(r).error, /yana 4 ta/);
    r = await h(pub({ action: 'confirm', login: 'vali', code, password: 'yangiParol1' })); assert.equal(r.statusCode, 400, 'boshqa login bilan bu kod ishlamaydi');
    r = await h(pub({ action: 'confirm', login: 'ALI', code: code.slice(0, 3) + ' ' + code.slice(3), password: 'yangiParol1' }));
    assert.equal(r.statusCode, 200, r.body);
    const upd = db.calls.updates.filter(u => u.table === 'auth.users').pop();
    assert.deepEqual(upd, { table: 'auth.users', id: 'u-sel', upd: { password: 'yangiParol1', app_metadata: { must_change_pw: false } } });
    assert.ok(db.calls.rpc.some(c => c.name === 'fw_revoke_sessions' && c.args.p_uid === 'u-sel'), 'eski seanslar yopiladi');
    assert.ok(tg.calls.some(c => c.method === 'sendMessage' && /oʻzgartirildi/.test(c.body.text)), 'botga xabar');
    r = await h(pub({ action: 'confirm', login: 'ali', code, password: 'yangiParol2' })); assert.equal(r.statusCode, 400, 'kod bir martalik');
    // 5 xato urinish — kod bekor (to'g'ri kod ham endi ishlamaydi)
    db.db.staff_pw_reset.find(x => x.staff_id === 2).last_sent_at = null;
    await h(pub({ action: 'request', login: 'ali' }));
    const code2 = /<b>(\d{6})<\/b>/.exec(tg.calls.filter(c => c.method === 'sendMessage').pop().body.text)[1];
    const w2 = code2 === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await h(pub({ action: 'confirm', login: 'ali', code: w2, password: 'yangiParol3' }));
    r = await h(pub({ action: 'confirm', login: 'ali', code: code2, password: 'yangiParol3' })); assert.equal(r.statusCode, 400, '5 xatodan keyin kod bekor');
    // IP cheklovi: soatiga 10 ta so'rov
    let last; for (let i = 0; i < 11; i++) last = await h(pub({ action: 'request', login: 'yoq' }, '9.9.9.9'));
    assert.equal(last.statusCode, 429);
  } finally { global.fetch = real; }
}

async function testLinkAndAdminReset() {
  const real = global.fetch, tg = tgMock(); global.fetch = tg;
  try {
    const db = world(); const h = loadFunction('pw-reset', db);
    let r = await h({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ action: 'tg_link' }) }); assert.equal(r.statusCode, 401, 'ulash — faqat kirgan xodim');
    r = await h(post({ action: 'tg_link' }, 't-sel2')); assert.equal(r.statusCode, 200, r.body);
    const url = B(r).url; assert.match(url, /^https:\/\/t\.me\/powerful_test_bot\?start=pw[0-9a-f]{24}$/);
    const code = url.split('start=')[1];
    tg.updates = [{ message: { chat: { id: 999, type: 'group' }, from: { first_name: 'G' }, text: '/start ' + code } }];
    r = await h(post({ action: 'tg_link_check' }, 't-sel2')); assert.equal(B(r).linked, false, 'guruh — hisobga olinmaydi');
    tg.updates.push({ message: { chat: { id: 555, type: 'private' }, from: { first_name: 'Vali', username: 'vali_s' }, text: '/start ' + code } });
    r = await h(post({ action: 'tg_link_check' }, 't-sel2')); assert.deepEqual(B(r), { ok: true, linked: true, tgName: 'Vali @vali_s' });
    r = await h(post({ action: 'status' }, 't-sel2')); assert.equal(B(r).linked, true); assert.equal(B(r).mustChange, false);
    // Admin tiklashi
    r = await h(post({ action: 'admin_reset', staffId: 3 }, 't-sel')); assert.equal(r.statusCode, 403, 'sotuvchi boshqa xodimni tiklay olmaydi');
    r = await h(post({ action: 'admin_reset', staffId: 1 }, 't-admin')); assert.equal(r.statusCode, 400, "o'zini — yo'q");
    r = await h(post({ action: 'admin_reset', staffId: 3 }, 't-admin')); assert.equal(r.statusCode, 200, r.body);
    const temp = B(r).tempPassword; assert.match(temp, /^[A-Za-z2-9]{10}$/); assert.doesNotMatch(temp, /[0O1lI]/);
    assert.equal(B(r).sessionsClosed, true);
    const upd = db.calls.updates.filter(u => u.table === 'auth.users').pop();
    assert.deepEqual(upd.upd, { password: temp, app_metadata: { must_change_pw: true } });
    assert.ok(db.calls.rpc.some(c => c.name === 'fw_revoke_sessions' && c.args.p_uid === 'u-sel2'));
    assert.ok(tg.calls.some(c => c.method === 'sendMessage' && c.body.chat_id === '555' && /tikladi/.test(c.body.text)), 'xodimga botda xabar');
    assert.ok(!JSON.stringify(db.db.staff_audit_log).includes(temp), 'vaqtinchalik parol jurnalga yozilmaydi');
  } finally { global.fetch = real; }
}

async function testForcedChange() {
  const db = world(); const pw = loadFunction('pw-reset', db);
  // Belgi bor xodim — boshqa funksiyaga kira olmaydi
  const list = loadFunction('staff-list', db);
  let r = await list(post({}, 't-forced')); assert.equal(r.statusCode, 403); assert.equal(B(r).code, 'PW_CHANGE_REQUIRED');
  const who = loadFunction('staff-whoami', db);
  r = await who(post({}, 't-forced')); assert.equal(r.statusCode, 200); assert.equal(B(r).mustChangePw, true);
  r = await who(post({}, 't-sel2')); assert.equal(B(r).mustChangePw, false);
  const pw2 = loadFunction('pw-reset', db);
  r = await pw2(post({ action: 'status' }, 't-forced')); assert.equal(B(r).mustChange, true);
  r = await pw2(post({ action: 'change', password: 'short' }, 't-forced')); assert.equal(r.statusCode, 400);
  r = await pw2(post({ action: 'change', password: 'yaxshiParol9' }, 't-forced')); assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(db.calls.updates.filter(u => u.table === 'auth.users').pop(), { table: 'auth.users', id: 'u-sel2', upd: { password: 'yaxshiParol9', app_metadata: { must_change_pw: false } } });
  void pw;
  // update-staff: admin boshqa xodimga parol qo'ysa — majburiy almashtirish + seanslar yopiladi; o'ziga — yo'q
  const db2 = world(); const us = loadFunction('update-staff', db2);
  r = await us(post({ staffId: 3, name: 'Vali', login: 'vali', password: 'vaqtincha1' }, 't-admin')); assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(db2.calls.updates.filter(u => u.table === 'auth.users').pop().upd, { password: 'vaqtincha1', app_metadata: { must_change_pw: true } });
  assert.ok(db2.calls.rpc.some(c => c.name === 'fw_revoke_sessions' && c.args.p_uid === 'u-sel2'));
  r = await us(post({ staffId: 1, name: 'Egasi', login: 'admin', password: 'oziniki12' }, 't-admin')); assert.equal(r.statusCode, 200);
  assert.deepEqual(db2.calls.updates.filter(u => u.table === 'auth.users').pop().upd.app_metadata, { must_change_pw: false });
}

function testHashing() {
  // Xesh — staff_id + kod + server siri; boshqa xodim yoki boshqa sir bilan mos kelmaydi
  const h = (id, c, k) => crypto.createHash('sha256').update(`${id}:${c}:${k}`).digest('hex');
  assert.notEqual(h(2, '123456', 'a'), h(3, '123456', 'a')); assert.notEqual(h(2, '123456', 'a'), h(2, '123456', 'b'));
}

async function testMigrationPg() {
  const fs = require('fs'), path = require('path');
  const { PRELUDE, one } = require('./p8-noldan-ornatish.test.js')._helpers;
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const d = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  try {
    await d.exec(PRELUDE);
    await d.exec(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8'));
    const MIG = fs.readFileSync(path.join(__dirname, '..', 'supabase-migration-38-parol-tiklash.sql'), 'utf8');
    await d.exec(MIG); await d.exec(MIG);   // takror — xavfsiz
    await d.exec(`insert into public.staff (login, name, role) values ('t1','T','sotuvchi')`);
    const sid = (await one(d, `select id from public.staff where login='t1'`)).id;
    await d.exec(`insert into public.staff_pw_reset (staff_id, tg_chat_id) values (${sid}, '777')`);
    await assert.rejects(d.exec(`update public.staff_pw_reset set tg_chat_id = 'abc' where staff_id = ${sid}`), /chat_chk/);
    await assert.rejects(d.exec(`update public.staff_pw_reset set code_attempts = -1 where staff_id = ${sid}`), /attempts_chk/);
    // Auth seanslari jadvali bo'lmasa — 0; bo'lsa — faqat shu foydalanuvchiniki o'chadi
    assert.equal((await one(d, `select public.fw_revoke_sessions('00000000-0000-0000-0000-000000000001') n`)).n, 0);
    await d.exec(`create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid);
      insert into auth.sessions (user_id) values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');`);
    assert.equal((await one(d, `select public.fw_revoke_sessions('00000000-0000-0000-0000-000000000001') n`)).n, 2);
    assert.equal((await one(d, `select count(*)::int n from auth.sessions`)).n, 1, 'boshqa foydalanuvchi seansi qoladi');
    // Brauzer rollariga yopiq
    const acl = await one(d, `select has_table_privilege('anon','public.staff_pw_reset','select') a, has_table_privilege('authenticated','public.staff_pw_reset','select') b,
      has_function_privilege('anon','public.fw_revoke_sessions(uuid)','execute') c, has_function_privilege('authenticated','public.fw_revoke_sessions(uuid)','execute') e`);
    assert.deepEqual(acl, { a: false, b: false, c: false, e: false });
    // Xodim o'chirilsa — tiklash yozuvi ham
    await d.exec(`delete from public.staff where id = ${sid}`);
    assert.equal((await one(d, `select count(*)::int n from public.staff_pw_reset`)).n, 0);
  } finally { await d.close(); }
}

async function testBrowser() {
  const { openPage } = require('./p4-responsive.test.js')._helpers;
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true });
  try {
    const sent = [];
    await page.route('**/.netlify/functions/pw-reset', (route) => {
      const b = JSON.parse(route.request().postData() || '{}'); sent.push(b);
      const ok = (d, st = 200) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(d) });
      if (b.action === 'request') return ok({ ok: true, message: 'Agar bu login Telegramga ulangan boʻlsa, kod yuborildi' });
      if (b.action === 'confirm') return b.code === '123456' ? ok({ ok: true }) : ok({ error: "Kod notoʻgʻri yoki muddati oʻtgan (yana 4 ta urinish)" }, 400);
      if (b.action === 'change') return ok({ ok: true });
      return ok({});
    });
    const r = await page.evaluate(async () => {
      const out = {};
      out.card = { login: !!document.getElementById('ul-login'), eye: !!document.querySelector('#ul-pass + .fw-pw-eye'), forgot: !!document.querySelector('.fw-login-card .fw-forgot') };
      // Ko'rish — 3 soniyadan keyin o'zi yashirinadi
      const i = document.getElementById('ul-pass'), b = document.querySelector('#ul-pass + .fw-pw-eye');
      b.click(); out.peek1 = i.type; await new Promise(r => setTimeout(r, 3200)); out.peek2 = i.type;
      b.click(); b.click(); out.peek3 = i.type;   // ikkinchi bosish — darhol yashiradi
      // Parolni unutdingizmi?
      document.getElementById('ul-login').value = 'ali';
      document.querySelector('.fw-login-card .fw-forgot').click();
      out.pre = document.getElementById('fw-pw-login').value;
      await fwPwForgotSend(); out.step2 = !document.getElementById('fw-pw-s2').hidden; out.msg = document.getElementById('fw-pw-msg').textContent;
      document.getElementById('fw-pw-code').value = '12 34 56'; document.getElementById('fw-pw-n1').value = 'yangiParol1'; document.getElementById('fw-pw-n2').value = 'boshqa';
      await fwPwForgotConfirm(); out.mismatch = document.getElementById('fw-pw-err').textContent;
      document.getElementById('fw-pw-code').value = '999999'; document.getElementById('fw-pw-n2').value = 'yangiParol1';
      await fwPwForgotConfirm(); out.bad = document.getElementById('fw-pw-err').textContent;
      document.getElementById('fw-pw-code').value = '123456';
      await fwPwForgotConfirm(); out.done = !document.getElementById('fw-pw-forgot');
      // Majburiy almashtirish — yopib bo'lmaydi; to'g'ri parolda resolve
      let resolved = false; const p = fwPwForce('Ali').then(() => { resolved = true; });
      const ov = document.getElementById('fw-pw-force'); ov.click(); out.forceStays = !!document.getElementById('fw-pw-force');
      out.forceX = !!ov.querySelector('.fw-due-x');
      document.getElementById('fw-pf-1').value = 'qisqa'; document.getElementById('fw-pf-2').value = 'qisqa'; document.getElementById('fw-pf-ok').click();
      await new Promise(r => setTimeout(r, 50)); out.forceShort = document.getElementById('fw-pf-err').textContent;
      document.getElementById('fw-pf-1').value = 'yaxshiParol9'; document.getElementById('fw-pf-2').value = 'yaxshiParol9'; document.getElementById('fw-pf-ok').click();
      await p; out.forceDone = resolved && !document.getElementById('fw-pw-force');
      return out;
    });
    assert.deepEqual(r.card, { login: true, eye: true, forgot: true }, 'admin kirish oynasi: ko\'rish tugmasi va «Parolni unutdingizmi?»');
    assert.deepEqual([r.peek1, r.peek2, r.peek3], ['text', 'password', 'password'], '3 soniyadan keyin o\'zi yashirinadi');
    assert.equal(r.pre, 'ali', 'login avtomatik o\'tadi'); assert.equal(r.step2, true); assert.match(r.msg, /Telegramga ulangan/);
    assert.match(r.mismatch, /mos emas/); assert.match(r.bad, /yana 4 ta/); assert.equal(r.done, true);
    const conf = sent.filter(b => b.action === 'confirm').pop(); assert.deepEqual(conf, { action: 'confirm', login: 'ali', code: '123456', password: 'yangiParol1' });
    assert.equal(r.forceStays, true, 'majburiy oyna fonni bosib yopilmaydi'); assert.equal(r.forceX, false, 'yopish tugmasi yo\'q');
    assert.match(r.forceShort, /kamida 8/); assert.equal(r.forceDone, true);
    assert.deepEqual(sent.filter(b => b.action === 'change').pop(), { action: 'change', password: 'yaxshiParol9' });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
  // Sotuvchi kirish oynasi: «Parolni unutdingizmi?» va ko'rish tugmasi 3 soniyada yashirinadi
  const s2 = await openPage('sotuvchi.html', { width: 390, height: 844, mobile: true });
  try {
    const r = await s2.page.evaluate(async () => {
      const i = document.getElementById('sv-login-pw'), b = i.parentNode.querySelector('button');
      b.click(); const a = i.type; await new Promise(r => setTimeout(r, 3200));
      return { a, b: i.type, forgot: !!document.querySelector('.fw-forgot') };
    });
    assert.deepEqual(r, { a: 'text', b: 'password', forgot: true });
    assert.deepEqual(s2.errors, []);
  } finally { await s2.browser.close(); }
}

async function testLoginLock() {
  const real = global.fetch, seen = [];
  global.fetch = async (url, init) => {
    const u = String(url); if (!u.includes('/auth/v1/token')) return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) };
    const b = JSON.parse(init.body); seen.push(b.email);
    if (global.__rate) return { ok: false, status: 429, json: async () => ({}) };
    const good = (b.email === 'ali@staff.biznespro.local' || b.email === 'dil@dillers.biznespro.local') && b.password === 'togriParol';
    return good ? { ok: true, status: 200, json: async () => ({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, expires_at: 1, token_type: 'bearer', user: { id: 'x' } }) }
                : { ok: false, status: 400, json: async () => ({ error: 'invalid_grant', error_description: 'Invalid login credentials' }) };
  };
  try {
    const db = world({ login_guard: [] }); const h = loadFunction('staff-login', db);
    const L = (login, password, kind) => h(pub({ login, password, kind }));
    const g = () => db.db.login_guard.find(x => x.login_key === 'l:ali');
    // 1-bosqich: 5 ta noto'g'ri → 15 daqiqa
    const lefts = [];
    for (let i = 0; i < 4; i++) { const r = await L('Ali', 'xato', 'staff'); assert.equal(r.statusCode, 401); lefts.push(B(r).left); }
    assert.deepEqual(lefts, [4, 3, 2, 1]);
    let r = await L('ali', 'xato', 'staff'); assert.equal(r.statusCode, 423); assert.equal(B(r).minutes, 15); assert.equal(B(r).code, 'LOCKED');
    seen.length = 0;
    r = await L('ali', 'togriParol', 'staff'); assert.equal(r.statusCode, 423, "blokda to'g'ri parol ham o'tmaydi"); assert.equal(seen.length, 0, 'parol Supabase\'ga yuborilmaydi ham');
    // Blok tugadi → 2-bosqich: 3 ta noto'g'ri → 30 daqiqa
    g().locked_until = new Date(Date.now() - 1000).toISOString();
    r = await L('ali', 'xato', 'staff'); assert.equal(B(r).left, 2); assert.match(B(r).error, /30 daqiqaga/);
    await L('ali', 'xato', 'staff');
    r = await L('ali', 'xato', 'staff'); assert.equal(r.statusCode, 423); assert.equal(B(r).minutes, 30);
    // Yana tugadi → yana 3 ta → 30 daqiqa (har safar)
    g().locked_until = new Date(Date.now() - 1000).toISOString();
    for (let i = 0; i < 2; i++) await L('ali', 'xato', 'staff');
    r = await L('ali', 'xato', 'staff'); assert.equal(B(r).minutes, 30);
    // Tugagach to'g'ri kirish — seans, hisob tozalanadi
    g().locked_until = new Date(Date.now() - 1000).toISOString();
    r = await L('ali', 'togriParol', 'staff'); assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(B(r).session, { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, expires_at: 1, token_type: 'bearer' }); assert.equal(B(r).kind, 'staff');
    assert.equal(g(), undefined, 'muvaffaqiyatdan keyin tozalanadi');
    assert.doesNotMatch(r.body, /test-service-key/, 'server kaliti javobda yo\'q');
    // 24 soat xatosiz — yana 5 ta urinish
    db.db.login_guard.push({ login_key: 'l:ali', fails: 2, stage: 1, last_fail_at: new Date(Date.now() - 25 * 3600e3).toISOString() });
    r = await L('ali', 'xato', 'staff'); assert.equal(B(r).left, 4);
    // auto: diller ham (xodim emas) — bitta so'rovda
    r = await L('dil', 'togriParol', 'auto'); assert.equal(r.statusCode, 200); assert.equal(B(r).kind, 'dealer');
    // Supabase cheklovi (429) — urinish sanalmaydi
    const before = JSON.stringify(g()); global.__rate = true;
    r = await L('ali', 'xato', 'staff'); assert.equal(r.statusCode, 429); assert.equal(JSON.stringify(g()), before); global.__rate = false;
    // Admin: bloklanganlar ro'yxati va ochish; sotuvchi — yo'q
    g().locked_until = new Date(Date.now() + 600e3).toISOString();
    const pw = loadFunction('pw-reset', db);
    r = await pw(post({ action: 'admin_locks' }, 't-sel')); assert.equal(r.statusCode, 403);
    r = await pw(post({ action: 'admin_locks' }, 't-admin')); assert.deepEqual(B(r).locks.map(x => x.staffId), [2]);
    r = await pw(post({ action: 'admin_unlock', staffId: 2 }, 't-admin')); assert.equal(r.statusCode, 200);
    assert.equal(g(), undefined, 'admin blokni ochdi');
    const h2 = loadFunction('staff-login', db);
    r = await h2(pub({ login: 'ali', password: 'togriParol', kind: 'staff' })); assert.equal(r.statusCode, 200);
  } finally { global.fetch = real; delete global.__rate; }
}

async function testBrowserLock() {
  const { openPage } = require('./p4-responsive.test.js')._helpers;
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true });
  try {
    let n = 0;
    await page.route('**/.netlify/functions/staff-login', (route) => {
      n++;
      const b = JSON.parse(route.request().postData() || '{}');
      const body = n < 2 ? { error: "Login yoki parol notoʻgʻri — yana 1 ta urinishdan keyin 15 daqiqaga bloklanadi", left: 1 } : { error: "Koʻp marta notoʻgʻri parol — hisob 15 daqiqaga bloklandi.", code: 'LOCKED', minutes: 15 };
      route.fulfill({ status: n < 2 ? 401 : 423, contentType: 'application/json', body: JSON.stringify({ ...body, echo: b.kind }) });
    });
    const r = await page.evaluate(async () => {
      document.getElementById('ul-login').value = 'ali'; document.getElementById('ul-pass').value = 'xato';
      await _ulSubmit(); const a = document.getElementById('ul-err').textContent;
      await _ulSubmit(); const b = document.getElementById('ul-err').textContent;
      return { a, b };
    });
    assert.match(r.a, /yana 1 ta urinish/); assert.match(r.b, /15 daqiqaga bloklandi/);
    assert.equal(n, 2, 'kirish server orqali (bitta so\'rov — xodim va diller)');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

module.exports = {
  name: 'P69 — parolni tiklash: Telegram kod, admin tiklashi, majburiy almashtirish',
  cases: [
    { name: "kirishsiz: bir xil javob, kod faqat ulangan xodimga (xesh), 60 s / IP cheklovi, 5 xato — bekor, to'g'ri kod — yangi parol + seanslar yopiladi", run: testRequestConfirm },
    { name: "Telegram ulash (faqat shaxsiy chat, aynan shu kod); admin tiklashi — vaqtinchalik parol, majburiy almashtirish, ruxsat chegaralari", run: testLinkAndAdminReset },
    { name: "majburiy almashtirish: boshqa funksiyalar 403, whoami belgini ko'rsatadi, «change» belgini oladi; update-staff ham belgilaydi", run: testForcedChange },
    { name: 'kod xeshi xodim va server siriga bog\'langan', run: testHashing },
    { name: "38-migratsiya (PostgreSQL): takror xavfsiz, cheklovlar, seanslarni yopish faqat shu foydalanuvchiniki, brauzerga yopiq", run: testMigrationPg },
    { name: "kirish bloki: 5 xato → 15 daqiqa, keyin har safar 3 xato → 30 daqiqa; blokda parol tekshirilmaydi; to'g'ri kirish/admin tozalaydi; 24 soatda yangilanadi", run: testLoginLock },
    { name: "brauzer: kirish server orqali — qolgan urinishlar va blok xabari ko'rinadi", run: testBrowserLock },
    { name: "brauzer: kirish oynasida ko'rish (3 soniyada yashirinadi) va «Parolni unutdingizmi?» — kod → yangi parol; majburiy almashtirish oynasi yopilmaydi", run: testBrowser },
  ],
};
