// P10 — v10 to'liq audit: SERVER funksiyalari tuzatishlari (regressiya testlari).
// Server kodi (netlify/functions/*.js, _lib/*) O'ZGARISHSIZ ishga tushiriladi, faqat
// ma'lumotlar bazasi chegarasi — in-memory (tests/helpers/mem-supabase.js). Ya'ni bu
// "unit (mock DB)" testlar: avtorizatsiya, validatsiya, idempotency mantig'ini
// tekshiradi. SQL funksiyalarining o'zi — P11'da haqiqiy PostgreSQL'da (PGlite).
const assert = require('node:assert/strict');
const { makeMemSupabase, loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const PERMS = {
  'r-bm': ['sotuvchilar.manage', 'rollar.manage', 'dillerlar.manage', 'dillerlar.orders', 'savdo.create', 'mahsulotlar.edit', 'kassalar.transact', 'ombor.edit'],
  'r-cash': ['savdo.create'],
};
function world(extra = {}) {
  const t = {
    staff: [
      { id: 1, auth_user_id: 'u-admin', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' },
      { id: 2, auth_user_id: 'u-mgr', role: 'sotuvchi', active: true, filial: 'baza', name: 'Menejer', login: 'mgr' },
      { id: 3, auth_user_id: 'u-cash', role: 'sotuvchi', active: true, filial: 'baza', name: 'Kassir', login: 'kassir' },
      { id: 4, auth_user_id: 'u-own2', role: 'sotuvchi', active: true, filial: 'baza', name: 'Ikkinchi egasi', login: 'owner2' },
    ],
    roles: [
      { id: 'r-owner', key: 'owner', is_system: true }, { id: 'r-admin', key: 'administrator', is_system: true },
      { id: 'r-bm', key: 'branch_manager', is_system: false }, { id: 'r-cash', key: 'cashier', is_system: false },
    ],
    staff_roles: [
      { staff_id: 1, role_id: 'r-owner', roles: { key: 'owner' } }, { staff_id: 2, role_id: 'r-bm', roles: { key: 'branch_manager' } },
      { staff_id: 3, role_id: 'r-cash', roles: { key: 'cashier' } }, { staff_id: 4, role_id: 'r-owner', roles: { key: 'owner' } },
    ],
    role_permissions: Object.entries(PERMS).flatMap(([rid, keys]) => keys.map(k => ({ role_id: rid, permission_id: k, permissions: { key: k } }))),
    staff_audit_log: [], idempotency_keys: [], ...extra,
  };
  return t;
}
const USERS = { 't-admin': { id: 'u-admin' }, 't-mgr': { id: 'u-mgr' }, 't-cash': { id: 'u-cash' } };
const body = (r) => JSON.parse(r.body);

async function testStaffTakeoverBlocked() {
  try {
    let c = makeMemSupabase({ tables: world(), users: USERS });
    let h = loadFunction('update-staff', c);
    let r = await h(post({ staffId: 1, name: 'Admin', login: 'admin', password: 'hacked123' }, 't-mgr'));
    assert.equal(r.statusCode, 403, 'menejer admin parolini almashtira olmaydi (F1)');
    assert.ok(!c.calls.updates.some(u => u.table === 'auth.users'), "auth foydalanuvchisiga tegilmadi");
    r = await h(post({ staffId: 4, name: 'X', login: 'owner2', password: 'hacked123' }, 't-mgr'));
    assert.equal(r.statusCode, 403, "RBAC 'owner' roli bor xodim ham himoyalangan");
    r = await h(post({ staffId: 3, name: 'Kassir 2', login: 'kassir', password: 'yangiParol1' }, 't-mgr'));
    assert.equal(r.statusCode, 200, 'oddiy xodimni menejer tahrirlay oladi (mavjud funksiya saqlangan)');
    r = await h(post({ staffId: 2, name: 'Menejer', login: 'mgr', password: 'ozimniki1' }, 't-mgr'));
    assert.equal(r.statusCode, 200, "o'z parolini o'zgartira oladi");
    c = makeMemSupabase({ tables: world(), users: USERS });
    h = loadFunction('staff-delete', c);
    r = await h(post({ id: 1 }, 't-mgr'));
    assert.equal(r.statusCode, 403, "menejer adminni o'chira olmaydi");
    assert.equal(c.db.staff.length, 4);
    r = await h(post({ id: 1 }, 't-admin'));
    assert.equal(r.statusCode, 400, "admin o'zini o'chira olmaydi");
    r = await h(post({ id: 3 }, 't-mgr'));
    assert.equal(r.statusCode, 200);
  } finally { unloadFunctions(); }
}

async function testRbacEscalationBlocked() {
  try {
    const c = makeMemSupabase({ tables: world(), users: USERS });
    let h = loadFunction('rbac-staff-roles-set', c);
    let r = await h(post({ staffId: 2, roleIds: ['r-owner'] }, 't-mgr'));
    assert.equal(r.statusCode, 403, "o'ziga rol bera olmaydi (F9)");
    r = await h(post({ staffId: 3, roleIds: ['r-owner'] }, 't-mgr'));
    assert.equal(r.statusCode, 403, "boshqaga 'owner' rolini bera olmaydi");
    r = await h(post({ staffId: 1, roleIds: [] }, 't-mgr'));
    assert.equal(r.statusCode, 403, "admin rollarini o'chira olmaydi");
    r = await h(post({ staffId: 3, roleIds: ['r-bm'] }, 't-mgr'));
    assert.equal(r.statusCode, 200, 'oddiy rolni bera oladi');
    h = loadFunction('rbac-permission-toggle', c);
    r = await h(post({ roleId: 'r-owner', permissionId: 'x', enabled: false }, 't-mgr'));
    assert.equal(r.statusCode, 403, "tizim rolining ruxsatlarini o'zgartira olmaydi");
    r = await h(post({ roleId: 'r-owner', permissionId: 'x', enabled: false }, 't-admin'));
    assert.equal(r.statusCode, 200, 'admin — oladi');
    // v24.5 audit (P1): o'z-o'zini kuchaytirish — o'z roliga ruxsat qo'sha olmaydi; o'zida yo'q ruxsatni bera olmaydi
    c.db.permissions = ['savdo.create', 'savdo.delete', 'rollar.manage', 'firma_kassa.transact'].map(k => ({ id: k, key: k }));
    const before = c.db.role_permissions.length;
    r = await h(post({ roleId: 'r-bm', permissionId: 'firma_kassa.transact', enabled: true }, 't-mgr'));
    assert.equal(r.statusCode, 403, "o'zi a'zo bo'lgan rolga ruxsat qo'sha olmaydi");
    r = await h(post({ roleId: 'r-cash', permissionId: 'firma_kassa.transact', enabled: true }, 't-mgr'));
    assert.equal(r.statusCode, 403, "o'zida yo'q ruxsatni boshqa rolga bera olmaydi");
    assert.equal(c.db.role_permissions.length, before, 'hech narsa yozilmadi');
    assert.ok(c.db.staff_audit_log.some(x => x.action === 'rbac_self_escalation_blocked') && c.db.staff_audit_log.some(x => x.action === 'rbac_grant_above_own_blocked'), 'xavfsizlik jurnalida');
    r = await h(post({ roleId: 'r-cash', permissionId: 'savdo.create', enabled: true }, 't-mgr'));
    assert.equal(r.statusCode, 200, "o'zidagi ruxsatni boshqa (o'ziniki bo'lmagan) rolga bera oladi");
    r = await h(post({ roleId: 'r-bm', permissionId: 'firma_kassa.transact', enabled: true }, 't-admin'));
    assert.equal(r.statusCode, 200, 'admin — har qanday');
    h = loadFunction('rbac-role-upsert', c);
    r = await h(post({ id: 'r-admin', name: 'Hack' }, 't-mgr'));
    assert.equal(r.statusCode, 403, 'tizim rolini qayta nomlay olmaydi');
  } finally { unloadFunctions(); }
}

async function testCheckoutValidationAndIdempotency() {
  try {
    let rpcCalls = 0;
    const c = makeMemSupabase({
      tables: world(), users: USERS, unique: { idempotency_keys: ['idem_key'] },
      rpc: { sale_checkout_atomic_v2: async () => { rpcCalls++; await new Promise(r => setTimeout(r, 30)); return { ok: true, totalUsd: 10, costUsd: 5, profitUsd: 5, debtUsd: 0, changeUsd: 0 }; } },
    });
    const h = loadFunction('sale-checkout-atomic', c);
    const ok = { items: [{ pid: 101, qty: 1, sellUsd: 10, costUsd: 5 }], discPct: 0, paidUsd: 10, custId: null, boxPayments: [{ box_id: 1, amount_native: 128000 }], inv: 'INV-1', idemKey: 'k-1' };
    const bad = [
      [{ boxPayments: [{ box_id: 1, amount_native: -5000000 }] }, 'manfiy kassa to\'lovi'],
      [{ discPct: 150 }, 'skidka > 100%'],
      [{ paidUsd: -1000 }, "manfiy to'langan summa"],
      [{ items: [{ pid: 101, qty: 1, sellUsd: 10, costUsd: Infinity }] }, 'cheksiz tannarx'],
      [{ idemKey: undefined }, 'idemKey yo\'q'],
      [{ custId: -5 }, "noto'g'ri mijoz"],
    ];
    for (const [patch, why] of bad) {
      const r = await h(post({ ...ok, ...patch, idemKey: 'idemKey' in patch ? patch.idemKey : 'b-' + why }, 't-cash'));
      assert.equal(r.statusCode, 400, `${why} rad etilishi kerak (F2)`);
    }
    assert.equal(rpcCalls, 0, "noto'g'ri so'rov bazaga yetib bormadi");
    // Ikki marta bosish: bir xil kalit bilan PARALLEL ikki so'rov — savdo BITTA
    const [a, b] = await Promise.all([h(post(ok, 't-cash')), h(post(ok, 't-cash'))]);
    assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409], 'ikkinchi parallel so\'rov bajarilmaydi (F5)');
    assert.equal(rpcCalls, 1, 'RPC bir marta chaqirildi');
    // B9: admin joriy filialda (f729) savdo qilsa — f729 omboridan; kassir filialni o'zgartira olmaydi
    await h(post({ ...ok, idemKey: 'k-adm', filial: 'f729' }, 't-admin'));
    assert.equal(c.calls.rpc.at(-1).args.p_filial, 'f729', 'admin — tanlangan filial (B9)');
    await h(post({ ...ok, idemKey: 'k-cash2', filial: 'f729' }, 't-cash'));
    assert.equal(c.calls.rpc.at(-1).args.p_filial, 'baza', "kassir boshqa filialga yoza olmaydi");
    rpcCalls -= 2;
    const again = await h(post(ok, 't-cash'));
    assert.equal(again.statusCode, 200); assert.equal(body(again).duplicate, true, 'qayta yuborish — keshlangan natija');
    assert.equal(rpcCalls, 1);
    // RPC xatosi — kalit bo'shatiladi, qayta urinish mumkin
    const c2 = makeMemSupabase({ tables: world(), users: USERS, unique: { idempotency_keys: ['idem_key'] },
      rpc: { sale_checkout_atomic_v2: async () => { const e = new Error("Omborda yetarli qoldiq yo'q"); e.code = 'P0001'; throw e; } } });
    const h2 = loadFunction('sale-checkout-atomic', c2);
    const r1 = await h2(post({ ...ok, idemKey: 'k-x' }, 't-cash'));
    assert.equal(r1.statusCode, 400); assert.match(body(r1).error, /yetarli qoldiq/);
    assert.equal(c2.db.idempotency_keys.length, 0, "muvaffaqiyatsiz urinish kalitni band qilib qoldirmaydi");
  } finally { unloadFunctions(); }
}

async function testDealerPaymentWorks() {
  try {
    const c = makeMemSupabase({ tables: world({ dealers: [{ id: 7, filial: 'baza', debt_usd: 100 }], dealer_payments: [] }), users: USERS, unique: { idempotency_keys: ['idem_key'] } });
    const h = loadFunction('dealer-payment-add', c);
    let r = await h(post({ dealerId: 7, amountUsd: 40, note: 'naqd', idemKey: 'dp-1' }, 't-mgr'));
    assert.equal(r.statusCode, 200, "diller to'lovi yoziladi (avval 'debt' ustuni tufayli doim 404 edi — F6)");
    r = await h(post({ dealerId: 7, amountUsd: 40, note: 'naqd', idemKey: 'dp-1' }, 't-mgr'));
    assert.equal(body(r).duplicate, true, 'takror — yozilmaydi');
    r = await h(post({ dealerId: 7, amountUsd: 40, note: 'ikkinchi', idemKey: 'dp-2' }, 't-mgr'));
    assert.equal(r.statusCode, 200, "bir xil summadagi HAQIQIY ikkinchi to'lov endi yo'qolmaydi");
    assert.equal(c.db.dealer_payments.length, 2);
    r = await h(post({ dealerId: 7, amountUsd: 500, idemKey: 'dp-3' }, 't-mgr'));
    assert.equal(r.statusCode, 400, 'qarzdan ortiq to\'lov rad etiladi');
  } finally { unloadFunctions(); }
}

async function testSecretsHiddenFromStaff() {
  const { filterTopLevelChanges: filterTopLevelChangesV23 } = require('../netlify/functions/_lib/appDataGuard');
  try {
    const appData = { settings: { company: 'F', usdUzs: 12800, tgBotToken: '123:SECRET', appPin: '9876', branchPin: { f729: '1111' } }, branchStore: { baza: { sales: [] }, f729: { sales: [{ id: 1 }] } } };
    const c = makeMemSupabase({ tables: world({ app_data: [{ id: 'main', data: appData }], app_data_branches: [] }), users: USERS });
    const h = loadFunction('app-data-load', c);
    let r = await h(post({}, 't-cash'));
    const staffData = body(r).data;
    assert.ok(!JSON.stringify(staffData).includes('SECRET') && !JSON.stringify(staffData).includes('9876'), "kassirga bot tokeni va PIN yuborilmaydi (F7)");
    assert.equal(staffData.settings.usdUzs, 12800, 'oddiy sozlamalar yuboriladi');
    assert.deepEqual(Object.keys(staffData.branchStore), ['baza'], 'faqat o\'z filiali');
    r = await h(post({}, 't-admin'));
    // v23: Telegram bot tokeni admin brauzeriga ham yuborilmaydi — faqat "o'rnatilgan" belgisi
    const adminSt = body(r).data.settings;
    assert.ok(!JSON.stringify(body(r)).includes('123:SECRET'), "admin javobida ham bot tokeni yo'q (v23)");
    assert.equal(adminSt.tgBotTokenSet, true, "admin token o'rnatilganini biladi");
    assert.equal(adminSt.appPin, '9876', 'admin PIN sozlamasini ko\'radi (o\'zgarmagan)');
    // Admin tokensiz sozlamani saqlasa — serverdagi token O'CHMAYDI; belgi bazaga yozilmaydi
    const adm = filterTopLevelChangesV23({ existing: { settings: appData.settings }, incoming: { settings: { ...adminSt, receipt: 'x' } }, permKeys: new Set(), isAdmin: true });
    assert.equal(adm.allowed.settings.tgBotToken, '123:SECRET', 'admin saqlashi tokenni o\'chirmaydi');
    assert.equal(adm.allowed.settings.tgBotTokenSet, undefined, 'belgi saqlanmaydi');
    const clr = filterTopLevelChangesV23({ existing: { settings: appData.settings }, incoming: { settings: { ...adminSt, tgBotToken: '' } }, permKeys: new Set(), isAdmin: true });
    assert.equal(clr.allowed.settings.tgBotToken, '', "admin ataylab bo'sh yuborsa — token o'chadi (Uzish)");
    // Saqlashda maxfiy kalitlar yo'qligi ularni O'CHIRMAYDI
    const { filterTopLevelChanges, filterAuditLogs } = require('../netlify/functions/_lib/appDataGuard');
    for (const perms of [new Set(['savdo.create']), new Set(['sozlamalar.edit'])]) {
      const res = filterTopLevelChanges({ existing: { settings: appData.settings }, incoming: { settings: { ...staffData.settings, receipt: 'yangi' } }, permKeys: perms, isAdmin: false });
      const finalSettings = res.allowed.settings || appData.settings;
      assert.equal(finalSettings.tgBotToken, '123:SECRET', 'token saqlanib qoldi'); assert.equal(finalSettings.appPin, '9876');
    }
    // Audit jurnali: admin bo'lmagan xodim faqat QO'SHA oladi (F15)
    const ex = [{ id: 1, action: 'a', ts: '2026-10-01T10:00:00Z' }, { id: 2, action: 'b', ts: '2026-10-01T09:00:00Z' }];
    const res = filterTopLevelChanges({ existing: { auditLogs: ex }, incoming: { auditLogs: [] }, permKeys: new Set(), isAdmin: false });
    assert.equal(res.allowed.auditLogs, undefined, "bo'sh ro'yxat yuborib tarixni o'chirib bo'lmaydi");
    const add = filterAuditLogs(ex, [{ id: 3, action: 'c', ts: '2026-10-01T11:00:00Z' }]);
    assert.deepEqual(add.value.map(x => x.id), [3, 1, 2], 'yangi yozuv qo\'shildi, eskilar qoldi');
  } finally { unloadFunctions(); }
}

async function testDealerOrderAndBatchAndCatalogValidation() {
  try {
    const orders = [{ id: 1, dealer_id: 7, status: 'pending', items: [{ pid: 101, qty: 2 }] }, { id: 2, dealer_id: 7, status: 'approved', items: [{ pid: 101, qty: 2 }] }];
    // v24.5: 35-migratsiyasiz baza — PostgREST yo'q funksiyaga PGRST202 qaytaradi (eski yo'llar ochiq qoladi; 35 bilan — P44)
    const no35 = { dealer_atomic_available: async () => { const e = new Error('Could not find the function public.dealer_atomic_available without parameters in the schema cache'); e.code = 'PGRST202'; throw e; } };
    const c = makeMemSupabase({ tables: world({ dealer_orders: orders, dealers: [{ id: 7, filial: 'baza', debt_usd: 0 }], batches: [], catalog_products: [], dealer_audit_log: [] }), users: USERS, rpc: no35 });
    let h = loadFunction('dealer-order-status', c);
    let r = await h(post({ orderId: 2, status: 'rejected' }, 't-mgr'));
    assert.equal(r.statusCode, 409, 'tasdiqlangan buyurtmani rad etib bo\'lmaydi (F11)');
    r = await h(post({ orderId: 1, status: 'approved', items: [{ pid: 999, qty: 5 }] }, 't-mgr'));
    assert.equal(r.statusCode, 400, 'buyurtmada yo\'q mahsulot qo\'shib bo\'lmaydi');
    r = await h(post({ orderId: 1, status: 'approved', items: [{ pid: 101, qty: 3 }] }, 't-mgr'));
    assert.equal(r.statusCode, 200);
    h = loadFunction('batches-shadow-sync', c);
    r = await h(post({ localId: 'b1', pid: 101, qty: 5, sold: 9, costUsd: 1 }, 't-cash'));
    assert.equal(r.statusCode, 400, 'sold > qty rad etiladi (F3)');
    r = await h(post({ localId: 'b1', pid: 101, qty: 'abc', sold: 0, costUsd: 1 }, 't-cash'));
    assert.equal(r.statusCode, 400, 'raqam bo\'lmagan qty rad etiladi');
    r = await h(post({ localId: 'b1', pid: 101, qty: 5, sold: 1, costUsd: 2, status: 'active' }, 't-cash'));
    assert.equal(r.statusCode, 200);
    h = loadFunction('catalog-sync', c);
    r = await h(post({ rows: [{ id: 101, filial: 'f729', name: 'A', qty: 3, point_pct: 2, optim_price: 9, hack: 1 }] }, 't-mgr'));
    assert.equal(r.statusCode, 200);
    assert.equal(c.db.catalog_products[0].filial, 'baza', 'filial xodimi boshqa filial katalogiga yoza olmaydi (F12)');
    assert.equal(c.db.catalog_products[0].hack, undefined, 'faqat ruxsat etilgan ustunlar');
    r = await h(post({ rows: [{ id: 101, point_pct: 500 }] }, 't-mgr'));
    assert.equal(r.statusCode, 400);
    h = loadFunction('dealer-update', c);
    r = await h(post({ id: 7, fields: { debt: -50 } }, 't-mgr'));
    assert.equal(r.statusCode, 400, 'manfiy qarz rad etiladi (F8)');
    r = await h(post({ id: 7, fields: { debt: 0, name: 'D' } }, 't-mgr'));
    assert.equal(r.statusCode, 200);
    r = await h(post({ id: 7, fields: { debt: 25 } }, 't-mgr'));
    assert.ok(c.db.dealer_audit_log.some(l => l.action === 'balance_update' && l.new_value.debt_usd === 25), 'qarz o\'zgarishi audit jurnaliga yozildi');
  } finally { unloadFunctions(); }
}

async function testFirmaKassaFunctionAuth() {
  try {
    const c = makeMemSupabase({
      tables: world({ firma_kassa_ledger: [] }), users: USERS,
      rpc: {
        firma_kassa_get_balance: async () => ({ balances: { USD: 100, UZS: 0 }, advances: [] }),
        _fk_cash_move: async (a) => ({ id: 1, currency: a.p_currency, direction: a.p_direction, amount: a.p_amount, balance_after: 0, op_type: a.p_op_type, counterparty_name: a.p_counterparty_name, filial: a.p_filial }),
      },
    });
    const h = loadFunction('firma-kassa', c);
    let r = await h(post({ action: 'state' }, 't-cash'));
    assert.equal(r.statusCode, 403, 'kassirga Firma kassasi yopiq (ruxsat yo\'q)');
    r = await h(post({ action: 'state' }, 't-admin'));
    assert.equal(r.statusCode, 200); assert.equal(body(r).balances.USD, 100);
    r = await h(post({ action: 'move', op: 'deposit', currency: 'CNY', amount: 10, idemKey: 'a' }, 't-admin'));
    assert.equal(r.statusCode, 400, 'CNY hisob valyutasi emas'); assert.match(body(r).error, /USD yoki UZS/);
    r = await h(post({ action: 'move', op: 'deposit', currency: 'USD', amount: -10, idemKey: 'a' }, 't-admin'));
    assert.equal(r.statusCode, 400);
    r = await h(post({ action: 'move', op: 'deposit', currency: 'USD', amount: 10 }, 't-admin'));
    assert.equal(r.statusCode, 400, 'idemKey majburiy');
    r = await h(post({ action: 'branch_in', currency: 'USD', amount: 10, idemKey: 'b', filial: 'f729' }, 't-admin'));
    assert.equal(r.statusCode, 200);
    const mv = c.calls.rpc.find(x => x.name === '_fk_cash_move');
    assert.equal(mv.args.p_direction, 'in'); assert.equal(mv.args.p_op_type, 'branch_in'); assert.equal(mv.args.p_idem_key, 'fk:b');
  } finally { unloadFunctions(); }
}

module.exports = {
  name: 'P10 — v10 audit: server funksiyalari (avtorizatsiya, validatsiya, idempotency) — mock DB',
  cases: [
    { name: "F1: menejer admin/egasi parolini o'zgartira yoki o'chira olmaydi", run: testStaffTakeoverBlocked },
    { name: "F9: o'ziga rol berish, 'owner' berish, tizim rolini o'zgartirish — faqat admin", run: testRbacEscalationBlocked },
    { name: "F2+F5: savdo — pul parametrlari tekshiriladi; parallel takror savdo bitta", run: testCheckoutValidationAndIdempotency },
    { name: "F6: diller to'lovi yoziladi; takror yo'q; haqiqiy ikkinchi to'lov yo'qolmaydi", run: testDealerPaymentWorks },
    { name: "F7+F15: maxfiy sozlamalar xodimga ketmaydi va o'chmaydi; audit jurnali faqat qo'shiladi", run: testSecretsHiddenFromStaff },
    { name: "F3/F8/F11/F12: buyurtma holati, partiya, katalog, diller balans validatsiyasi", run: testDealerOrderAndBatchAndCatalogValidation },
    { name: "Firma Kassa funksiyasi: ruxsat, CNY rad, idemKey majburiy, filialdan qabul", run: testFirmaKassaFunctionAuth },
  ],
};
