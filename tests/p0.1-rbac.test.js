// P0.1 — REGRESSION TEST: `netlify/functions/app-data-save.js` endi RBAC
// bilan himoyalangan. Bu — BACKEND (Node) testi, brauzer kerak emas — real
// `app-data-save.js` + `_lib/supabaseAdmin.js` kodini o'zgarishsiz ishga
// tushiradi, faqat Supabase admin klientini (DB chegarasini) soxta qiladi
// (tests/helpers/fake-admin.js).
const assert = require('node:assert/strict');
const { makeFakeAdmin, loadHandlerWithFakeAdmin } = require('./helpers/fake-admin');

function callHandler(handler, { token = 'tok', payload }) {
  const event = {
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ data: payload }),
  };
  return handler(event);
}

async function testKassirCannotWriteProducts() {
  const fakeAdmin = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u1' },
    staffRow: { id: 1, name: 'Kassir Aziz', role: 'kassir', active: true, filial: 'baza', auth_user_id: 'u1' },
    roleLinks: [{ role_id: 'r1' }],
    rolePermissions: [{ permission_id: 'p1', permissions: { key: 'kassalar.transact' } }], // faqat kassa huquqi bor
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fakeAdmin);
  try {
    const res = await callHandler(handler, { payload: { products: [{ id: 1, name: 'Test' }] } });
    // 2026-09-28: ruxsatsiz kalit butun saqlashni rad etmaydi — faqat o'sha kalit YOZILMAYDI
    assert.equal(res.statusCode, 200);
    assert.ok(JSON.parse(res.body).ignoredKeys.includes('products'), "ignoredKeys'da 'products' bo'lishi kerak");
    const written = fakeAdmin._inspect.upserts.find(u => u.table === 'app_data').payload.data;
    assert.equal(written.products, undefined, "Ruxsatsiz 'products' bazaga YOZILMASLIGI kerak");
    assert.equal(fakeAdmin._inspect.auditInserts.length, 1, "Rad etish staff_audit_log'ga yozilishi kerak");
    assert.ok(fakeAdmin._inspect.auditInserts[0].details.deniedKeys.includes('products'));
  } finally { restore(); }
}

async function testAdminCanWriteAnything() {
  const fakeAdmin = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u2' },
    staffRow: { id: 2, name: 'Admin', role: 'admin', active: true, filial: 'baza', auth_user_id: 'u2' },
    appData: {},
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fakeAdmin);
  try {
    const res = await callHandler(handler, { payload: { products: [{ id: 1 }], settings: { company: 'Powerful' }, partners: [] } });
    assert.equal(res.statusCode, 200, 'Admin har qanday modulni saqlay olishi kerak');
  } finally { restore(); }
}

async function testStaffWithMatchingPermissionCanWrite() {
  const fakeAdmin = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u3' },
    staffRow: { id: 3, name: 'Menejer', role: 'menejer', active: true, filial: 'baza', auth_user_id: 'u3' },
    roleLinks: [{ role_id: 'r2' }],
    rolePermissions: [{ permission_id: 'p2', permissions: { key: 'mahsulotlar.edit' } }],
    appData: {},
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fakeAdmin);
  try {
    const res = await callHandler(handler, { payload: { products: [{ id: 1, name: 'Test' }] } });
    assert.equal(res.statusCode, 200, "mahsulotlar.edit huquqi bor xodim 'products' saqlay olishi kerak");
  } finally { restore(); }
}

async function testUnknownKeyDeniedByDefault() {
  const fakeAdmin = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u4' },
    staffRow: { id: 4, name: 'Menejer', role: 'menejer', active: true, filial: 'baza', auth_user_id: 'u4' },
    roleLinks: [{ role_id: 'r2' }],
    rolePermissions: [{ permission_id: 'p2', permissions: { key: 'mahsulotlar.edit' } }],
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fakeAdmin);
  try {
    const res = await callHandler(handler, { payload: { someBrandNewUnmappedField: [1, 2, 3] } });
    assert.ok(JSON.parse(res.body).ignoredKeys.includes('someBrandNewUnmappedField'), "Ro'yxatda yo'q (nomalum) kalit — admin bo'lmagan xodim uchun HAR DOIM rad etilishi kerak (deny-by-default)");
    const written = fakeAdmin._inspect.upserts.find(u => u.table === 'app_data').payload.data;
    assert.equal(written.someBrandNewUnmappedField, undefined);
  } finally { restore(); }
}

async function testBranchScopedCustomersRequiresPermission() {
  const fakeAdmin = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u5' },
    staffRow: { id: 5, name: 'Sotuvchi', role: 'sotuvchi', active: true, filial: 'baza', auth_user_id: 'u5' },
    roleLinks: [{ role_id: 'r3' }],
    rolePermissions: [{ permission_id: 'p3', permissions: { key: 'xarajatlar.create' } }], // mijoz bilan bog'liq hech qanday huquq YO'Q
    appData: {},
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fakeAdmin);
  try {
    const res = await callHandler(handler, { payload: { branchStore: { baza: { customers: [{ id: 1, name: 'Mijoz' }] } } } });
    assert.ok(JSON.parse(res.body).ignoredKeys.includes('branchStore.customers'), "mijozlar huquqisiz branchStore.baza.customers yozilmasligi kerak");
    const written = fakeAdmin._inspect.upserts.find(u => u.table === 'app_data').payload.data;
    assert.equal(written.branchStore.baza.customers, undefined);
  } finally { restore(); }
}

async function testBranchScopedCustomersAllowedWithPermission() {
  const fakeAdmin = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u6' },
    staffRow: { id: 6, name: 'Sotuvchi', role: 'sotuvchi', active: true, filial: 'baza', auth_user_id: 'u6' },
    roleLinks: [{ role_id: 'r4' }],
    rolePermissions: [{ permission_id: 'p4', permissions: { key: 'mijozlar.edit' } }],
    appData: {},
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fakeAdmin);
  try {
    const res = await callHandler(handler, { payload: { branchStore: { baza: { customers: [{ id: 1, name: 'Mijoz' }] } } } });
    assert.equal(res.statusCode, 200, "mijozlar.edit huquqi bilan branchStore.baza.customers yozish o'tishi kerak");
  } finally { restore(); }
}

async function testInvalidTokenRejected() {
  const fakeAdmin = makeFakeAdmin({ authUser: { token: 'real-tok', id: 'u7' } });
  const { handler, restore } = loadHandlerWithFakeAdmin(fakeAdmin);
  try {
    const res = await callHandler(handler, { token: 'wrong-token', payload: { products: [] } });
    assert.equal(res.statusCode, 401, "Yaroqsiz token 401 bilan rad etilishi kerak");
  } finally { restore(); }
}

module.exports = {
  name: 'P0.1 — app-data-save.js RBAC (backend)',
  cases: [
    { name: "ruxsati yo'q xodim (kassir) 'products' yoza olmaydi (kalit tashlanadi) + audit log", run: testKassirCannotWriteProducts },
    { name: 'admin har qanday modulni saqlay oladi (200)', run: testAdminCanWriteAnything },
    { name: "mos permission'ga ega xodim saqlay oladi (200)", run: testStaffWithMatchingPermissionCanWrite },
    { name: "ro'yxatda yo'q kalit — admin bo'lmaganga har doim rad etiladi (deny-by-default)", run: testUnknownKeyDeniedByDefault },
    { name: 'branchStore ichidagi customers — mijoz huquqisiz yozilmaydi', run: testBranchScopedCustomersRequiresPermission },
    { name: 'branchStore ichidagi customers — mijozlar.edit bilan o\'tadi', run: testBranchScopedCustomersAllowedWithPermission },
    { name: "yaroqsiz token — 401", run: testInvalidTokenRejected },
  ],
};
