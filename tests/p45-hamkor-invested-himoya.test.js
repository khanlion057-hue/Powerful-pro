// P45 — v24.5 (v23.10.2 P30 dan): hamkor `invested` — SERVER hisobi (xarajatlardan), himoya va audit.
//  • Faqat `xarajatlar.create` (hamkor turidagi xarajat) — mavjud hamkorning FAQAT invested/updatedAt maydoni;
//    yangi hamkor, o'chirish, ulush foizi, ism — rad (serverdagi qiymat qoladi); invested — chekli son.
//  • `hamkorlar.edit` — to'liq tahrir (o'z filiali); boshqa filial hamkori — o'zgarmaydi.
//  • Har bir invested o'zgarishi (kim, eski → yangi) staff_audit_log'da.
//  • Haqiqiy `app-data-save` + haqiqiy PostgreSQL (PGlite).
const assert = require('node:assert/strict');
const { makeWorld } = require('./helpers/f4b-world');
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');
const { filterTopLevelChanges, partnerInvestedChanges } = require('../netlify/functions/_lib/appDataGuard');

const P = () => [
  { id: 1, name: 'Ali', filial: 'baza', pct: 30, invested: 1000, isFounder: false },
  { id: 2, name: 'Vali', filial: 'baza', pct: 20, invested: 500, isFounder: true },
  { id: 3, name: 'Filial hamkor', filial: 'f729', pct: 10, invested: 300 },
];

function testGuardUnit() {
  const ex = { partners: P() };
  const run = (incoming, perms, filial = 'baza') => filterTopLevelChanges({ existing: ex, incoming: { partners: incoming }, permKeys: new Set(perms), isAdmin: false, filial });
  // xarajatlar.create: invested o'zgarishi — o'tadi, boshqa maydonlar — yo'q
  let inc = P(); inc[0].invested = 1200; inc[0].updatedAt = 5; inc[0].pct = 99; inc[0].name = 'X'; inc[1].isFounder = false;
  let r = run(inc, ['xarajatlar.create']);
  assert.deepEqual(r.allowed.partners.map(p => [p.id, p.invested, p.pct, p.name, p.isFounder]), [[1, 1200, 30, 'Ali', false], [2, 500, 20, 'Vali', true], [3, 300, 10, 'Filial hamkor', undefined]]);
  assert.ok(r.ignored.includes('partners'), 'ruxsatsiz maydon — qayd');
  // yangi hamkor va o'chirish — rad
  inc = P().filter(p => p.id !== 2); inc.push({ id: 9, name: 'Yangi', filial: 'baza', invested: 1e6 });
  r = run(inc, ['xarajatlar.create']);
  const v = r.allowed.partners || ex.partners;
  assert.deepEqual(v.map(p => p.id).sort(), [1, 2, 3], "yangi qo'shilmadi, o'chirilmadi");
  // son emas / juda katta invested — rad
  inc = P(); inc[0].invested = 'NaN'; inc[1].invested = 1e15;
  r = run(inc, ['xarajatlar.create']);
  assert.deepEqual((r.allowed.partners || ex.partners).map(p => p.invested), [1000, 500, 300]);
  // boshqa filial hamkori — hech kim (admin bo'lmagan) o'zgartira olmaydi
  inc = P(); inc[2].invested = 0;
  r = run(inc, ['hamkorlar.edit']);
  assert.equal((r.allowed.partners || ex.partners).find(p => p.id === 3).invested, 300);
  // hamkorlar.edit — o'z filiali to'liq
  inc = P(); inc[0].pct = 35; inc.push({ id: 10, name: 'Yangi', filial: 'baza', invested: 50 });
  r = run(inc, ['hamkorlar.edit']);
  assert.deepEqual(r.allowed.partners.map(p => [p.id, p.pct]).filter(x => x[0] !== 2 && x[0] !== 3), [[1, 35], [10, undefined]]);
  // huquqsiz — hech narsa
  inc = P(); inc[0].invested = 1;
  r = run(inc, ['savdo.create']);
  assert.equal(r.allowed.partners, undefined); assert.ok(r.ignored.includes('partners'));
  // audit diff
  assert.deepEqual(partnerInvestedChanges(P(), [{ ...P()[0], invested: 900 }, P()[1], { id: 11, name: 'N', invested: 7 }]),
    [{ id: 1, name: 'Ali', old: 1000, new: 900 }, { id: 11, name: 'N', old: null, new: 7 }]);
}

async function testSaveIntegration() {
  const pg = await makeWorld({ baza: {} });
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ partners: P() })]);
  const memTables = {
    staff: [
      { id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
      { id: 5, auth_user_id: 'u-exp', role: 'sotuvchi', active: true, filial: 'baza', name: 'Xarajatchi', login: 'exp' },
      { id: 6, auth_user_id: 'u-ham', role: 'sotuvchi', active: true, filial: 'baza', name: 'Hamkorchi', login: 'ham' },
      { id: 7, auth_user_id: 'u-sel', role: 'sotuvchi', active: true, filial: 'baza', name: 'Sotuvchi', login: 'sel' },
    ],
    staff_roles: [{ staff_id: 5, role_id: 'r-exp' }, { staff_id: 6, role_id: 'r-ham' }, { staff_id: 7, role_id: 'r-sel' }],
    role_permissions: [
      { role_id: 'r-exp', permission_id: 'xarajatlar.create', permissions: { key: 'xarajatlar.create' } },
      { role_id: 'r-ham', permission_id: 'hamkorlar.edit', permissions: { key: 'hamkorlar.edit' } },
      { role_id: 'r-sel', permission_id: 'savdo.create', permissions: { key: 'savdo.create' } },
    ],
    staff_audit_log: [],
  };
  const client = makePgSupabase(pg, { pgTables: ['app_data', 'app_data_branches', 'cashbox_balances', 'customer_balances', 'supplier_balances', 'batches', 'sales', 'ledger_ops'], memTables,
    users: { 't-admin': { id: 'u-admin' }, 't-exp': { id: 'u-exp' }, 't-ham': { id: 'u-ham' }, 't-sel': { id: 'u-sel' } } });
  const inv = async () => Object.fromEntries((await pg.query(`select data->'partners' p from app_data where id='main'`)).rows[0].p.map(p => [p.id, p.invested]));
  const exps = async () => ((await pg.query(`select data->'expenses' e from app_data_branches where branch_key='baza'`)).rows[0]?.e) || [];
  const audits = (act) => client.mem.calls.inserts.filter(x => x.table === 'staff_audit_log').map(x => JSON.stringify(x)).filter(x => x.includes(act));
  const withInv = (m) => P().map(p => (p.id in m ? { ...p, invested: m[p.id] } : p));
  try {
    const save = loadFunction('app-data-save', client);
    const call = async (tok, partners, expenses) => {
      const data = {}; if (partners) data.partners = partners; if (expenses) data.branchStore = { baza: { expenses } };
      const r = await save(post({ data }, tok)); assert.equal(r.statusCode, 200, r.body); return JSON.parse(r.body);
    };
    // 1) xarajatlar.create — xarajatsiz invested'ni o'zicha oshiradi + soxta hamkor + foiz → hech biri o'tmaydi
    let b = await call('t-exp', [...withInv({ 1: 99999 }).map(p => p.id === 1 ? { ...p, pct: 90 } : p), { id: 20, name: 'Soxta', filial: 'baza', invested: 5000 }]);
    assert.deepEqual(await inv(), { 1: 1000, 2: 500, 3: 300 }, "xarajatsiz invested — rad (server qiymati qoldi), soxta hamkor yo'q");
    // v24.8 (K2, egasi qarori): hamkorlar.* ruxsatisiz xodimga hamkorlar puli (invested) javobda ham yuborilmaydi
    assert.doesNotMatch(JSON.stringify(b.serverValues || {}), /invested/, "klientga hamkor puli qaytmaydi");
    assert.equal(audits('partner_invested_override_ignored').length, 1, 'soxta qiymat — xavfsizlik jurnalida');
    // 2) hamkor kirimi xarajati $100 → invested +100 (server hisobi); klient yana soxta qiymat yuborsa ham
    const e1 = { id: 'e1', date: '2026-10-08', turi: 'hamkor', kind: 'kirim', partnerId: 1, amtUsd: 100, person: 'Ali' };
    await call('t-exp', withInv({ 1: 7777 }), [e1]);
    assert.equal((await inv())[1], 1100, 'invested = 1000 + 100 (xarajatdan), 7777 emas');
    assert.equal(audits('partner_invested_override_ignored').length, 2);
    assert.ok(audits('partner_invested_change').some(a => a.includes('"old":1000') && a.includes('"new":1100') && a.includes('Xarajatchi')), "haqiqiy o'zgarish — auditda (kim, eski → yangi)");
    // 3) to'g'ri klient (invested 1100) — farq yo'q, jurnalda override yo'q
    await call('t-exp', withInv({ 1: 1100 }), [e1]);
    assert.equal(audits('partner_invested_override_ignored').length, 2);
    // 4) hamkor chiqimi $40 (partnerId 2) → 500 − 40; partners yuborilmasa ham server hisoblaydi
    const e2 = { id: 'e2', date: '2026-10-08', turi: 'hamkor', kind: 'chiqim', partnerId: 2, amtUsd: 40 };
    await call('t-exp', null, [e1, e2]);
    assert.deepEqual(await inv(), { 1: 1100, 2: 460, 3: 300 });
    // 5) xarajatni tahrirlash ($100 → $150) va o'chirish (e2) — farqi
    await call('t-exp', null, [{ ...e1, amtUsd: 150 }]);
    assert.deepEqual(await inv(), { 1: 1150, 2: 500, 3: 300 }, "tahrir +50, o'chirish +40 qaytdi");
    // 6) boshqa filial hamkori (3, f729) uchun Baza xarajati — invested o'zgarmaydi
    await call('t-exp', null, [{ ...e1, amtUsd: 150 }, { id: 'e3', turi: 'hamkor', kind: 'kirim', partnerId: 3, amtUsd: 999 }]);
    assert.equal((await inv())[3], 300, "boshqa filial hamkori — o'zgarmadi");
    // 7) faqat savdo.create (xarajat yozadi, hamkorlarga huquqi yo'q) — invested baribir xarajatdan server hisoblaydi
    await call('t-sel', withInv({ 1: 1 }), (await exps()).concat([{ id: 'e4', turi: 'hamkor', kind: 'kirim', partnerId: 1, amtUsd: 10 }]));
    assert.equal((await inv())[1], 1160, 'savdo.create: xarajat qabul qilindi → invested +10; klientning 1 qiymati rad');
    // 8) manfiy / son emas summa — hisobga olinmaydi
    await call('t-exp', null, (await exps()).concat([{ id: 'e5', turi: 'hamkor', kind: 'kirim', partnerId: 1, amtUsd: -500 }, { id: 'e6', turi: 'hamkor', kind: 'kirim', partnerId: 1, amtUsd: 'abc' }]));
    assert.equal((await inv())[1], 1160);
    // 9) hamkorlar.edit — qo'lda tuzatish ruxsat, lekin alohida auditda
    const cur = (await pg.query(`select data->'partners' p from app_data where id='main'`)).rows[0].p;
    await call('t-ham', cur.map(p => p.id === 2 ? { ...p, invested: 0 } : p));
    assert.equal((await inv())[2], 0);
    assert.ok(audits('partner_invested_manual_adjust').some(a => a.includes('"client":0')), "qo'lda tuzatish — auditda");
  } finally { unloadFunctions(); await pg.close(); }
}

// v23.10.2: qisman xato (app_data yozildi, filial yozuvi yiqildi), qayta urinish, soxta investedExp, parallel saqlash
async function testPartialFailureSelfHeal() {
  const pg = await makeWorld({ baza: {} });
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ partners: P() })]);
  const memTables = {
    staff: [5, 6].map(i => ({ id: i, auth_user_id: 'u' + i, role: 'sotuvchi', active: true, filial: 'baza', name: 'X' + i, login: 'x' + i })),
    staff_roles: [{ staff_id: 5, role_id: 'r' }, { staff_id: 6, role_id: 'r' }],
    role_permissions: [{ role_id: 'r', permission_id: 'xarajatlar.create', permissions: { key: 'xarajatlar.create' } }],
    staff_audit_log: [],
  };
  const client = makePgSupabase(pg, { pgTables: ['app_data', 'app_data_branches', 'cashbox_balances', 'customer_balances', 'supplier_balances', 'batches', 'sales', 'ledger_ops'],
    memTables, users: { t5: { id: 'u5' }, t6: { id: 'u6' } } });
  let failBranch = false;
  const origFrom = client.from.bind(client);
  client.from = (t) => {
    const q = origFrom(t);
    if (t === 'app_data_branches' && failBranch) { q.upsert = () => { failBranch = false; return Promise.resolve({ data: null, error: { message: "sun'iy xato: filial yozuvi" } }); }; }
    return q;
  };
  const inv = async () => (await pg.query(`select data->'partners'->0 p from app_data where id='main'`)).rows[0].p;
  const exps = async () => ((await pg.query(`select data->'expenses' e from app_data_branches where branch_key='baza'`)).rows[0]?.e) || [];
  const e1 = { id: 'e1', date: '2026-10-08', turi: 'hamkor', kind: 'kirim', partnerId: 1, amtUsd: 100 };
  const e2 = { id: 'e2', date: '2026-10-08', turi: 'hamkor', kind: 'kirim', partnerId: 1, amtUsd: 40 };
  try {
    const save = loadFunction('app-data-save', client);
    const call = (tok, data) => save(post({ data }, tok));
    // 1) app_data yoziladi, filial yozuvi yiqiladi → 500; invested oshdi, xarajat saqlanmadi (yarim holat)
    failBranch = true;
    let r = await call('t5', { branchStore: { baza: { expenses: [e1] } } });
    assert.equal(r.statusCode, 500, r.body);
    assert.equal((await inv()).invested, 1100); assert.equal((await exps()).length, 0);
    // 2) klient qayta yuboradi (o'sha e1) — IKKI MARTA qo'shilmaydi
    r = await call('t5', { branchStore: { baza: { expenses: [e1] } } });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal((await inv()).invested, 1100, 'qayta urinish: 1100 (1200 emas)');
    assert.equal((await inv()).investedExp, 100);
    // 3) yarim holatdan keyin klient QAYTA YUBORMASA — keyingi har qanday filial saqlashi invested'ni saqlangan xarajatlarga qaytaradi
    failBranch = true;
    r = await call('t5', { branchStore: { baza: { expenses: [e1, e2] } } });   // +40 yarim yozildi
    assert.equal(r.statusCode, 500); assert.equal((await inv()).invested, 1140);
    r = await call('t6', { branchStore: { baza: { expenses: [e1] } } });       // boshqa xodim: e2 yo'q
    assert.equal(r.statusCode, 200);
    assert.equal((await inv()).invested, 1100, "o'z-o'zini tuzatdi: saqlangan xarajatlar (e1) = 100");
    // 4) soxta investedExp / invested yuborish — e'tiborsiz
    const cur = (await pg.query(`select data->'partners' p from app_data where id='main'`)).rows[0].p;
    r = await call('t5', { partners: cur.map(p => p.id === 1 ? { ...p, invested: 5000, investedExp: -3900 } : p), branchStore: { baza: { expenses: [e1] } } });
    assert.equal(r.statusCode, 200);
    assert.deepEqual([(await inv()).invested, (await inv()).investedExp], [1100, 100], 'soxta investedExp/invested rad');
    // 5) parallel ikki saqlash — natija: invested = 1000 + Σ(saqlangan xarajatlar), qaysi biri oxirgi bo'lmasin
    await Promise.all([call('t5', { branchStore: { baza: { expenses: [e1, e2] } } }), call('t6', { branchStore: { baza: { expenses: [e2] } } })]);
    const sum = (await exps()).reduce((a, x) => a + (x.kind === 'kirim' ? +x.amtUsd : -x.amtUsd), 0);
    assert.equal((await inv()).invested, 1000 + sum, `parallel: invested (${(await inv()).invested}) = 1000 + saqlangan xarajatlar (${sum})`);
  } finally { unloadFunctions(); await pg.close(); }
}

module.exports = {
  name: "P45 — v24.5 (v23.10.2 P30 dan): hamkor invested — server himoyasi (faqat ruxsat etilgan maydon) va audit",
  cases: [
    { name: "Himoya (unit): xarajatlar.create — faqat invested; yangi/o'chirish/foiz — rad; boshqa filial; audit diff", run: testGuardUnit },
    { name: "Qisman xato/rollback: filial yozuvi yiqilsa — qayta urinishda ikki marta qo'shilmaydi, keyingi saqlash o'zini tuzatadi; soxta investedExp rad; parallel saqlashda invested = saqlangan xarajatlar", run: testPartialFailureSelfHeal },
    { name: "app-data-save (haqiqiy PostgreSQL): invested — faqat xarajatlardan SERVER hisobi; soxta qiymat rad + audit; tahrir/o'chirish; boshqa filial; qo'lda tuzatish auditda", run: testSaveIntegration },
  ],
};
