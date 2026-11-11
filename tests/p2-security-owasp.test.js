// P2 — OWASP Top 10 auditi (2026-09-26) topilmalarining tuzatishlari uchun
// REGRESSIYA testlari. Real Function kodi ishga tushiriladi, faqat DB
// chegarasi soxta (tests/helpers/fake-admin.js).
const assert = require('node:assert/strict');
const { makeFakeAdmin, loadHandlerWithFakeAdmin } = require('./helpers/fake-admin');
const { loadApp } = require('./helpers/load-app');

const SALES_MANAGER_PERMS = ['savdo.create', 'savdo.edit', 'savdo.view', 'mijozlar.edit', 'mijozlar.view', 'mijozlar.debt_payment', 'qaytarish.create']
  .map((key, i) => ({ permission_id: 'p' + i, permissions: { key } }));

function staff(role = 'sotuvchi', id = 10) {
  return { id, name: 'Xodim ' + id, role, active: true, filial: 'baza', auth_user_id: 'u' + id };
}
function ev(body, token = 'tok') {
  return { httpMethod: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) };
}
const many = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: i + 1, ...extra }));

// ── A01: app-data-branch-save — endi RBAC bor ─────────────────────
async function testBranchSaveSellerSaleIsSaved() {
  const existing = { sales: many(3), products: [], cashboxes: [{ id: 1, bal: 100 }], expenses: [] };
  const fake = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u10' }, staffRow: staff(), roleLinks: [{ role_id: 'r' }],
    rolePermissions: SALES_MANAGER_PERMS, branchRows: { baza: existing },
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fake, 'app-data-branch-save');
  try {
    // Oddiy savdo: yangi sale + kassa balansi o'zgaradi, qolgani o'zgarmagan holda qayta yuboriladi
    const incoming = { ...existing, sales: many(4), cashboxes: [{ id: 1, bal: 150 }] };
    const res = await handler(ev({ branchKey: 'baza', data: incoming }));
    const b = JSON.parse(res.body);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(b.ignoredKeys, [], "Sotuvchining oddiy savdosi (sales + kassa) to'liq saqlanishi kerak");
    assert.equal(b.matched, true);
    const stored = fake._inspect.upserts.find(u => u.table === 'app_data_branches').payload.data;
    assert.equal(stored.sales.length, 4);
    assert.equal(stored.cashboxes[0].bal, 150);
  } finally { restore(); }
}

async function testBranchSaveSellerCannotChangeRevisions() {
  const existing = { sales: [], revisions: [{ id: 1, qty: 10 }] };
  const fake = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u10' }, staffRow: staff(), roleLinks: [{ role_id: 'r' }],
    rolePermissions: SALES_MANAGER_PERMS, branchRows: { baza: existing },
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fake, 'app-data-branch-save');
  try {
    const res = await handler(ev({ branchKey: 'baza', data: { ...existing, revisions: [{ id: 1, qty: 99999 }] } }));
    const b = JSON.parse(res.body);
    assert.ok(b.ignoredKeys.includes('revisions'), "ombor.edit huquqisiz revizya (revisions) o'zgarishi yozilmasligi kerak");
    assert.equal(b.serverValues.revisions[0].qty, 10, "Klientga serverdagi haqiqiy qiymat qaytarilishi kerak");
    const stored = fake._inspect.upserts.find(u => u.table === 'app_data_branches').payload.data;
    assert.equal(stored.revisions[0].qty, 10, "Serverdagi asl qiymat saqlanib qolishi kerak");
    assert.ok(fake._inspect.auditInserts.some(a => a.action === 'app_data_branch_save_denied'), 'Rad etish audit jurnaliga yozilishi kerak');
  } finally { restore(); }
}

async function testBranchSaveNoRbacRoleWritesNothing() {
  const existing = { sales: many(2) };
  const fake = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u11' }, staffRow: staff('kassir', 11), roleLinks: [], rolePermissions: [],
    branchRows: { baza: existing },
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fake, 'app-data-branch-save');
  try {
    const res = await handler(ev({ branchKey: 'baza', data: { sales: [] } }));
    const stored = fake._inspect.upserts.find(u => u.table === 'app_data_branches').payload.data;
    assert.equal(stored.sales.length, 2, "Hech qanday RBAC roli yo'q xodim filial savdolarini o'zgartira olmasligi kerak");
    assert.equal(res.statusCode, 200);
  } finally { restore(); }
}

async function testBranchSaveNonAdminCannotWriteOtherBranch() {
  const fake = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u10' }, staffRow: staff(), roleLinks: [{ role_id: 'r' }],
    rolePermissions: SALES_MANAGER_PERMS, branchRows: { baza: {}, f729: { sales: many(3) } },
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fake, 'app-data-branch-save');
  try {
    const res = await handler(ev({ branchKey: 'f729', data: { sales: [] } }));
    assert.equal(JSON.parse(res.body).branchKey, 'baza', "Admin bo'lmagan xodim boshqa filialga yoza olmasligi kerak");
    assert.ok(!fake._inspect.upserts.some(u => u.payload.branch_key === 'f729'));
  } finally { restore(); }
}

// ── A01/A07: klient PIN'i emas, SERVER ommaviy o'chirishni to'xtatadi ──
async function testMassDeleteBlockedForNonAdmin() {
  const existing = { sales: many(20), customers: many(10) };
  const fake = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u10' }, staffRow: staff(), roleLinks: [{ role_id: 'r' }],
    rolePermissions: SALES_MANAGER_PERMS, branchRows: { baza: existing },
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fake, 'app-data-branch-save');
  try {
    // "clearEverything()" ni konsoldan PIN'siz chaqirish natijasi — bo'sh massivlar
    const res = await handler(ev({ branchKey: 'baza', data: { sales: [], customers: [] } }));
    const b = JSON.parse(res.body);
    assert.deepEqual(b.blockedMassDelete.sort(), ['customers', 'sales']);
    const stored = fake._inspect.upserts.find(u => u.table === 'app_data_branches').payload.data;
    assert.equal(stored.sales.length, 20, "Savdolar o'chmasligi kerak");
    assert.equal(stored.customers.length, 10, "Mijozlar o'chmasligi kerak");
    assert.ok(fake._inspect.auditInserts.some(a => a.action === 'mass_delete_blocked'));
  } finally { restore(); }
}

async function testMassDeleteAllowedForAdmin() {
  const fake = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u1' }, staffRow: staff('admin', 1), branchRows: { baza: { sales: many(20) } },
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fake, 'app-data-branch-save');
  try {
    await handler(ev({ branchKey: 'baza', data: { sales: [] } }));
    const stored = fake._inspect.upserts.find(u => u.table === 'app_data_branches').payload.data;
    assert.equal(stored.sales.length, 0, "Admin (server tasdiqlagan) tizimni tozalay olishi kerak");
  } finally { restore(); }
}

async function testMainSaveSellerFullPayloadNotRejected() {
  // P0.1 regressiyasi: main.js save() HAR DOIM products/settings'ni ham yuboradi.
  // O'zgarmagan bo'lsa — sotuvchining savdosi rad etilmasligi kerak.
  const appData = { products: many(5), settings: { company: 'F' }, branchStore: { baza: { sales: many(2) } } };
  const fake = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u10' }, staffRow: staff(), roleLinks: [{ role_id: 'r' }],
    rolePermissions: SALES_MANAGER_PERMS, appData,
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fake, 'app-data-save');
  try {
    const payload = { ...appData, auditLogs: [{ a: 1 }], branchStore: { baza: { sales: many(3) } } };
    const res = await handler(ev({ data: payload }));
    const b = JSON.parse(res.body);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(b.ignoredKeys, [], "O'zgarmagan products/settings tufayli savdo rad etilmasligi kerak");
    const written = fake._inspect.upserts.find(u => u.table === 'app_data').payload.data;
    assert.equal(written.branchStore.baza.sales.length, 3);
  } finally { restore(); }
}

async function testMainSaveMassDeleteProductsBlocked() {
  const appData = { products: many(30) };
  const fake = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u12' }, staffRow: staff('menejer', 12), roleLinks: [{ role_id: 'r' }],
    rolePermissions: [{ permission_id: 'p', permissions: { key: 'mahsulotlar.edit' } }], appData,
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fake, 'app-data-save');
  try {
    const res = await handler(ev({ data: { products: [] } }));
    assert.ok(JSON.parse(res.body).blockedMassDelete.includes('products'));
    const written = fake._inspect.upserts.find(u => u.table === 'app_data').payload.data;
    assert.equal(written.products.length, 30, "mahsulotlar.edit bo'lsa ham, barcha mahsulotni bir yo'la o'chirish faqat admin uchun");
  } finally { restore(); }
}

// ── A09: permission rad etilishi jurnalga yoziladi ──
async function testPermissionDeniedIsLogged() {
  const fake = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u10' }, staffRow: staff(), roleLinks: [{ role_id: 'r' }],
    rolePermissions: [{ permission_id: 'p', permissions: { key: 'taminotchilar.view' } }],
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fake, 'supplier-payment-add');
  try {
    const res = await handler(ev({ supplierLocalId: 's1', amountUsd: 10 }));
    assert.equal(res.statusCode, 403, "Faqat .view huquqi bilan ta'minotchiga to'lov yozib bo'lmasligi kerak (A01)");
    assert.ok(fake._inspect.auditInserts.some(a => a.action === 'permission_denied' && a.details.need === 'taminotchilar.edit'),
      "Rad etish staff_audit_log'ga yozilishi kerak (A09)");
  } finally { restore(); }
}

// ── A10: xom DB xatosi klientga chiqmaydi, biznes-xato esa chiqadi ──
async function testServerErrorHidesInternals() {
  delete require.cache[require.resolve('../netlify/functions/_lib/supabaseAdmin')];
  const { serverError } = require('../netlify/functions/_lib/supabaseAdmin');
  const origErr = console.error; console.error = () => {};
  try {
    const leak = serverError({ code: '23505', message: 'duplicate key value violates unique constraint "staff_login_key"' }, 't', 'Xatolik');
    assert.equal(JSON.parse(leak.body).error, 'Xatolik', 'Ichki constraint nomi klientga chiqmasligi kerak');
    const biz = serverError({ code: 'P0001', message: "Omborda yetarli qoldiq yo'q: pid=5" }, 't', 'Xatolik', 400);
    assert.equal(JSON.parse(biz.body).error, "Omborda yetarli qoldiq yo'q: pid=5", 'Biznes-xabar foydalanuvchiga ko\'rinishi kerak');
    assert.equal(biz.statusCode, 400);
  } finally { console.error = origErr; }
}

// ── A05: esc() va mijoz ismidagi XSS ──
async function testCustomerNameXssEscaped() {
  const { browser, page } = await loadApp({});
  try {
    const r = await page.evaluate(() => {
      window.__xss = 0;
      const html = mjRows([{ id: 1, name: '<img src=x onerror="window.__xss=1">', phone: '<b>1</b>', debt: 0, total: 0 }]);
      const div = document.createElement('div'); div.innerHTML = html; document.body.appendChild(div);
      // v23.3: mijozlar ro'yxati — kartochkalar (.fw-pc); ism .fw-pc-m > b ichida, telefon <small> ichida
      return { hasImg: !!div.querySelector('img'), hasB: !!div.querySelector('.fw-pc-m small b, .fw-pc-m > b b'), text: div.querySelector('.fw-pc-m > b').textContent, esc: esc(`<a href="x">'&`) };
    });
    await page.waitForTimeout(100);
    assert.equal(r.hasImg, false, "Mijoz ismidagi <img> teg sifatida emas, matn sifatida chiqishi kerak");
    assert.equal(r.hasB, false);
    assert.equal(r.text, '<img src=x onerror="window.__xss=1">');
    assert.equal(r.esc, '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
    assert.equal(await page.evaluate(() => window.__xss), 0, 'XSS ishga tushmasligi kerak');
  } finally { await browser.close(); }
}


// ── Reviewer topgan holatlar (2026-09-28) ──
const WAREHOUSE_PERMS = ['kirim.create', 'kirim.view', 'mahsulotlar.create', 'mahsulotlar.edit', 'mahsulotlar.view', 'ombor.edit', 'ombor.view']
  .map((key, i) => ({ permission_id: 'w' + i, permissions: { key } }));

async function testKirimByWarehouseKeepsCashSide() {
  const existing = { batches: [], suppliers: [{ id: 1, debt: 0 }], cashboxes: [{ id: 1, bal: 1000 }], cashTxns: [] };
  const fake = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u20' }, staffRow: staff('menejer', 20), roleLinks: [{ role_id: 'r' }],
    rolePermissions: WAREHOUSE_PERMS, branchRows: { baza: existing },
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fake, 'app-data-branch-save');
  try {
    const incoming = { batches: [{ id: 1, qty: 5 }], suppliers: [{ id: 1, debt: 50 }], cashboxes: [{ id: 1, bal: 900 }], cashTxns: [{ id: 1, amount: 100 }], batchCounter: 1 };
    const b = JSON.parse((await handler(ev({ branchKey: 'baza', data: incoming }))).body);
    assert.deepEqual(b.ignoredKeys, [], "Kirim (partiya + ta'minotchi + kassa) to'liq saqlanishi kerak");
  } finally { restore(); }
}

async function testSellerSaleWithSupplierDebtKept() {
  const existing = { sales: [], suppliers: [{ id: 1, debt: 0 }], batches: [{ id: 1, sold: 0 }] };
  const fake = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u10' }, staffRow: staff(), roleLinks: [{ role_id: 'r' }],
    rolePermissions: SALES_MANAGER_PERMS, branchRows: { baza: existing },
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fake, 'app-data-branch-save');
  try {
    const b = JSON.parse((await handler(ev({ branchKey: 'baza', data: { sales: [{ id: 1 }], suppliers: [{ id: 1, debt: 7 }], batches: [{ id: 1, sold: 1 }] } }))).body);
    assert.deepEqual(b.ignoredKeys, [], "Konsignatsiya savdosi ta'minotchi qarzini ham saqlashi kerak");
  } finally { restore(); }
}

async function testSettingsRateOpenButPinProtected() {
  const appData = { settings: { usdUzs: 12000, appPin: '5555', company: 'F' } };
  const fake = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u10' }, staffRow: staff(), roleLinks: [{ role_id: 'r' }],
    rolePermissions: SALES_MANAGER_PERMS, appData,
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fake, 'app-data-save');
  try {
    const b = JSON.parse((await handler(ev({ data: { settings: { usdUzs: 12100, appPin: '0000', company: 'F' } } }))).body);
    const written = fake._inspect.upserts.find(u => u.table === 'app_data').payload.data;
    assert.equal(written.settings.usdUzs, 12100, "Kunlik kursni har qanday xodim kirita olishi kerak");
    assert.equal(written.settings.appPin, '5555', "Admin PIN'ini sozlamalar.edit'siz o'zgartirib bo'lmasligi kerak");
    assert.ok(b.ignoredKeys.includes('settings'));
    // v24.5 (v23.10.2 dan): PIN javobda QAYTMAYDI (app-data-load bilan bir xil — sotuvchiga PIN yuborilmaydi); bazada o'zgarmay qoladi
    assert.equal(b.serverValues.settings.appPin, undefined, "PIN ruxsatsiz xodimga qaytmaydi");
  } finally { restore(); }
}

async function testDeletedIdsTombstoneNeedsPermission() {
  const appData = { deletedIds: {} };
  const fake = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u10' }, staffRow: staff(), roleLinks: [{ role_id: 'r' }],
    rolePermissions: SALES_MANAGER_PERMS, appData,
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fake, 'app-data-save');
  try {
    const b = JSON.parse((await handler(ev({ data: { deletedIds: { products: [{ id: 1, ts: 1 }], customers: [{ id: 2, ts: 1 }] } } }))).body);
    const written = fake._inspect.upserts.find(u => u.table === 'app_data').payload.data;
    assert.equal(written.deletedIds.products, undefined, "Mahsulot huquqisiz mahsulotga 'o'chirildi' belgisi qo'yib bo'lmasligi kerak");
    assert.equal(written.deletedIds.customers.length, 1, "Mijoz huquqi bor — mijoz tombstone'i o'tadi");
    assert.ok(b.ignoredKeys.includes('deletedIds'));
  } finally { restore(); }
}

async function testSellerAppSaveSyncsBranchTable() {
  // sotuvchi.html faqat app-data-save'ni chaqiradi — endi app_data_branches ham yangilanishi kerak
  const fake = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u10' }, staffRow: staff(), roleLinks: [{ role_id: 'r' }],
    rolePermissions: SALES_MANAGER_PERMS, appData: { branchStore: { baza: { sales: [] } } }, branchRows: { baza: { sales: [] } },
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fake, 'app-data-save');
  try {
    await handler(ev({ data: { branchStore: { baza: { sales: [{ id: 99 }] } } } }));
    assert.equal(fake._inspect.branchState.baza.sales[0].id, 99, "Sotuvchi savdosi app_data_branches'ga ham yozilishi kerak (aks holda qayta yuklanganda yo'qoladi)");
  } finally { restore(); }
}

async function testSmallBranchGroupDeleteNotBlocked() {
  const fake = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u20' }, staffRow: staff('menejer', 20), roleLinks: [{ role_id: 'r' }],
    rolePermissions: WAREHOUSE_PERMS, branchRows: { baza: { batches: many(6) } },
  });
  const { handler, restore } = loadHandlerWithFakeAdmin(fake, 'app-data-branch-save');
  try {
    const b = JSON.parse((await handler(ev({ branchKey: 'baza', data: { batches: many(2) } }))).body);
    assert.deepEqual(b.blockedMassDelete, [], "Kichik filialda partiya guruhini o'chirish bloklanmasligi kerak");
  } finally { restore(); }
}

module.exports = {
  name: 'P2 — OWASP auditi tuzatishlari (xavfsizlik)',
  cases: [
    { name: "A01: branch-save — sotuvchining oddiy savdosi saqlanadi", run: testBranchSaveSellerSaleIsSaved },
    { name: "A01: branch-save — huquqsiz modul (revizya) o'zgarishi yozilmaydi + audit + server qiymati qaytadi", run: testBranchSaveSellerCannotChangeRevisions },
    { name: "A01: branch-save — RBAC roli yo'q xodim hech narsani o'zgartira olmaydi", run: testBranchSaveNoRbacRoleWritesNothing },
    { name: "A01: branch-save — boshqa filialga yozib bo'lmaydi", run: testBranchSaveNonAdminCannotWriteOtherBranch },
    { name: "A01/A07: ommaviy o'chirish admin bo'lmaganga SERVERDA bloklanadi", run: testMassDeleteBlockedForNonAdmin },
    { name: "A01/A07: admin ommaviy tozalay oladi", run: testMassDeleteAllowedForAdmin },
    { name: "P0.1 regressiyasi: to'liq payload bilan sotuvchi savdosi rad etilmaydi", run: testMainSaveSellerFullPayloadNotRejected },
    { name: "A01: app-data-save — barcha mahsulotni o'chirish faqat admin", run: testMainSaveMassDeleteProductsBlocked },
    { name: "A01+A09: supplier-payment .edit talab qiladi, rad etish jurnalga yoziladi", run: testPermissionDeniedIsLogged },
    { name: "A10: xom DB xatosi yashiriladi, biznes-xato ko'rsatiladi", run: testServerErrorHidesInternals },
    { name: "A05: mijoz ismidagi XSS esc() orqali zararsizlantiriladi", run: testCustomerNameXssEscaped },
    { name: "Omborchi Kirim'i kassa/ta'minotchi qismi bilan to'liq saqlanadi", run: testKirimByWarehouseKeepsCashSide },
    { name: "Sotuvchi savdosida ta'minotchi qarzi yo'qolmaydi", run: testSellerSaleWithSupplierDebtKept },
    { name: "Sozlamalar: kurs — hammaga, admin PIN — faqat sozlamalar.edit", run: testSettingsRateOpenButPinProtected },
    { name: "deletedIds: tombstone faqat o'sha ro'yxatga huquq bo'lsa", run: testDeletedIdsTombstoneNeedsPermission },
    { name: "Sotuvchi ilovasi saqlashi app_data_branches'ni ham yangilaydi", run: testSellerAppSaveSyncsBranchTable },
    { name: "Kichik filialda partiya guruhini o'chirish bloklanmaydi", run: testSmallBranchGroupDeleteNotBlocked },
  ],
};
