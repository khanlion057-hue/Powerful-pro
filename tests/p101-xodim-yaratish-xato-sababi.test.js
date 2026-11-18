// P101 — v25.6.7: xodim / diller hisobi yaratilmasa, xatoning HAQIQIY sababi ko'rinadi (avval faqat «Xodim yaratishda xatolik» — sabab yashirin edi).
// Prod'da `auth.users` dagi begona trigger («column full_name of relation staff does not exist») 9 marta 500 bergan, lekin ekranda sabab yo'q edi.
const assert = require('node:assert/strict');
const { makeMemSupabase, loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const TABLES = () => ({ staff: [{ id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'a' }], dealers: [], staff_roles: [], role_permissions: [], staff_audit_log: [] });

function setup(fn, createUser) {
  const client = makeMemSupabase({ tables: TABLES(), users: { 't-admin': { id: 'u-admin' } } });
  if (createUser) client.auth.admin.createUser = createUser;
  return { client, h: loadFunction(fn, client) };
}
const authErr = (msg) => async () => ({ data: null, error: Object.assign(new Error(msg), { status: 500 }) });

async function testStaffError() {
  try {
    const { client, h } = setup('create-staff', authErr('Database error creating new user'));
    const r = await h(post({ login: 'ali', password: '123456', name: 'Ali', role: 'sotuvchi', filial: 'baza' }));
    const b = JSON.parse(r.body);
    assert.equal(r.statusCode, 500);
    assert.match(b.error, /Xodim yaratishda xatolik/); assert.match(b.error, /Database error creating new user/, 'haqiqiy sabab ko\'rinadi');
    assert.match(b.error, /trigger/i, "ma'lum holat uchun aniq yo'l-yo'riq");
    assert.equal(client.db.staff.length, 1, 'xato bo\'lsa xodim yozilmaydi');
    // aniq noma'lum xato ham sababi bilan, lekin uzun/maxfiy matn kesiladi
    const x = setup('create-staff', authErr('X'.repeat(500)));
    const r2 = await x.h(post({ login: 'ali2', password: '123456', name: 'Ali', role: 'sotuvchi', filial: 'baza' }));
    assert.ok(JSON.parse(r2.body).error.length < 300, 'xabar kesiladi');
  } finally { unloadFunctions(); }
}

async function testDealerError() {
  try {
    const { h } = setup('create-dealer', authErr('Database error creating new user'));
    const r = await h(post({ login: 'dil1', password: '123456', name: 'Diller 1', region: 'Samarqand', filial: 'baza' }));
    assert.equal(r.statusCode, 500);
    assert.match(JSON.parse(r.body).error, /Diller yaratishda xatolik/); assert.match(JSON.parse(r.body).error, /Database error creating new user/);
  } finally { unloadFunctions(); }
}

async function testStaffOk() {
  try {
    const { client, h } = setup('create-staff');
    const r = await h(post({ login: 'vali', password: '123456', name: 'Vali', role: 'sotuvchi', filial: 'baza' }));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(JSON.parse(r.body).staff.login, 'vali'); assert.equal(client.db.staff.length, 2);
    const dup = await h(post({ login: 'VALI', password: '123456', name: 'Vali 2', role: 'sotuvchi', filial: 'baza' }));
    assert.equal(dup.statusCode, 409, 'takroriy login — 409 (avvalgidek)');
  } finally { unloadFunctions(); }
}

module.exports = { name: "P101 — xodim/diller yaratish: xatoning haqiqiy sababi (v25.6.7)", cases: [
  { name: "xodim: Auth xatosi — sabab va yo'l-yo'riq ko'rinadi, hech narsa yozilmaydi, uzun xabar kesiladi", run: testStaffError },
  { name: "diller: Auth xatosi — sabab ko'rinadi", run: testDealerError },
  { name: "muvaffaqiyat va takroriy login — avvalgidek", run: testStaffOk },
] };
