// P54 — HARDENING (taklif): valyuta kursi (usdUzs/usdCny) — kunlik tasdiq hammaga ochiq (v23.9), lekin `sozlamalar.edit`'siz
// xodim faqat ±15% oralig'ida o'zgartira oladi; undan katta / noto'g'ri qiymat rad (bazada server qiymati qoladi, javobda ham
// shu qiymat); har o'zgarish va rad — xavfsizlik jurnalida. Kurs serverda _fw_rate() orqali qarz/kassa hisobiga ta'sir qiladi.
// HAQIQIY PostgreSQL (PGlite) + haqiqiy app-data-save.
const assert = require('node:assert/strict');
const { makeWorld } = require('./helpers/f4b-world');
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions } = require('./helpers/mem-supabase');
async function save(perms, settings) {
  const pg = await makeWorld({ baza: {} });
  await pg.query(`update app_data set data = jsonb_set(data, '{settings}', $1::jsonb) where id='main'`, [JSON.stringify({ usdUzs: 12600, usdCny: 7.2, company: 'A', appPin: 'PIN-1' })]);
  const audit = [];
  const client = makePgSupabase(pg, { pgTables: ['app_data', 'app_data_branches', 'cashbox_balances', 'idempotency_keys', 'ledger_ops'],
    memTables: { staff: [{ id: 5, auth_user_id: 'u-s', role: perms === 'admin' ? 'admin' : 'sotuvchi', active: true, filial: 'baza', name: 'S', login: 's' }],
      staff_roles: perms === 'admin' || !perms.length ? [] : [{ staff_id: 5, role_id: 'r' }],
      role_permissions: perms === 'admin' ? [] : perms.map(k => ({ role_id: 'r', permission_id: k, permissions: { key: k } })), staff_audit_log: audit }, users: { 't-s': { id: 'u-s' } } });
  const h = loadFunction('app-data-save', client);
  try {
    const r = await h({ httpMethod: 'POST', headers: { authorization: 'Bearer t-s' }, body: JSON.stringify({ data: { settings } }) }, {});
    const db = (await pg.query(`select data->'settings' s from app_data where id='main'`)).rows[0].s;
    const actions = client.mem.calls.inserts.filter(x => x.table === 'staff_audit_log').map(x => JSON.stringify(x)).map(s => (/"action":"([a-z_]+)"/.exec(s) || [])[1]).filter(Boolean);
    return { status: r.statusCode, body: JSON.parse(r.body), db, actions };
  } finally { unloadFunctions(); await pg.close(); }
}
async function testRoleless() {
  let r = await save([], { usdUzs: 99999 });
  assert.equal(r.db.usdUzs, 12600, "rolsiz xodim: 99999 rad, bazada 12600"); assert.equal(r.body.serverValues.settings.usdUzs, 12600, 'javobda bazadagi qiymat');
  assert.ok(r.actions.includes('rate_change_rejected'), 'rad — jurnalda');
  r = await save([], { usdUzs: 12700 });
  assert.equal(r.db.usdUzs, 12700, "kunlik kichik o'zgarish (+0.8%) — qabul (v23.9 qoidasi saqlanadi)"); assert.ok(r.actions.includes('rate_change'), "o'zgarish — jurnalda");
  for (const bad of [0, -5, 'abc', null, 1e12]) { r = await save([], { usdUzs: bad }); assert.equal(r.db.usdUzs, 12600, `noto'g'ri qiymat rad: ${bad}`); }
  r = await save(['savdo.create'], { usdCny: 9.9 }); assert.equal(r.db.usdCny, 7.2, 'CNY +37% — rad');
  r = await save(['savdo.create'], { usdCny: 7.5 }); assert.equal(r.db.usdCny, 7.5, 'CNY +4% — qabul');
}
async function testEditorsAndAdmin() {
  // v25.1 (egasi talabi): kurs — butun firma sozlamasi; filial menejeri («sozlamalar.edit») ham faqat ±15%, katta o'zgarish — egasi
  let r = await save(['sozlamalar.edit'], { usdUzs: 15000 }); assert.equal(r.db.usdUzs, 12600, "sozlamalar.edit (filial menejeri) — +19% rad");
  r = await save(['sozlamalar.edit'], { usdUzs: 12800 }); assert.equal(r.db.usdUzs, 12800, "sozlamalar.edit — ±15% ichida qabul"); assert.ok(r.actions.includes('rate_change'));
  r = await save(['rollar.manage', 'sozlamalar.edit'], { usdUzs: 15000 }); assert.equal(r.db.usdUzs, 15000, "egasi (rollar.manage) — istalgan o'zgarish"); assert.ok(r.actions.includes('rate_change'));
  r = await save('admin', { usdUzs: 20000 }); assert.equal(r.db.usdUzs, 20000, 'admin — istalgan'); assert.ok(r.actions.includes('rate_change'));
}
module.exports = {
  name: "P54 — HARDENING: kurs o'zgarishi — ruxsatsiz xodimga ±15%, noto'g'ri qiymat rad, har o'zgarish jurnalda (PGlite)",
  cases: [
    { name: "Rolsiz/kassir: 99999 va noto'g'ri qiymatlar rad (baza va javob — server qiymati), ±15% ichida — qabul; jurnal", run: testRoleless },
    { name: "Filial menejeri (sozlamalar.edit) — ±15%; egasi va admin — istalgan o'zgarish, jurnalda", run: testEditorsAndAdmin },
  ],
};
