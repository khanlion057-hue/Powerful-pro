// P18 — FINAL GATE: XAVFSIZLIK — ROLLAR MATRITSASI (haqiqiy server funksiyalari + PostgreSQL/PGlite).
// Rollar va ruxsatlar — supabase/schema.sql'dagi HAQIQIY seed'lardan (role_permissions) olinadi, qo'lda yozilmaydi.
// Har bir rol uchun: kategoriya, xarajat, to'lov, kassa, Firma kassa amallari — kutilgan natija (ruxsat jadvalidan)
// bilan haqiqiy javob solishtiriladi. Qo'shimcha: tizimga kirmagan, xodim emas, nofaol xodim, boshqa filial,
// Telegram tokeni va service_role kalitining brauzerga chiqmasligi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const ROOT = path.join(__dirname, '..');
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger',
  'expense_categories', 'customer_debt_payments', 'supplier_payments', 'home_withdrawals', 'dealer_payments', 'dealers', 'ledger_ops', 'customer_debt_ledger', 'supplier_debt_ledger', 'stock_ledger'];
const BOXES = [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 50000000 }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 5000 }];
const SECRET = '123456:TOKEN_SHOULD_NEVER_LEAVE_SERVER_X';
// Sinovdagi rollar: xodim (staff.role) + RBAC roli (schema.sql seed'i)
const ACTORS = [
  { tok: 't-employee', name: 'Xodim', role: 'sotuvchi', rbac: 'employee' },
  { tok: 't-seller', name: 'Sotuvchi (kassir)', role: 'sotuvchi', rbac: 'cashier' },
  { tok: 't-salesman', name: 'Savdo menejeri', role: 'sotuvchi', rbac: 'sales_manager' },
  { tok: 't-warehouse', name: 'Ombor mudiri', role: 'sotuvchi', rbac: 'warehouse_manager' },
  { tok: 't-accountant', name: 'Hisobchi', role: 'sotuvchi', rbac: 'accountant' },
  { tok: 't-bmanager', name: 'Filial menejeri', role: 'sotuvchi', rbac: 'branch_manager' },
  { tok: 't-administrator', name: 'Administrator (RBAC)', role: 'sotuvchi', rbac: 'administrator' },
  { tok: 't-owner-rbac', name: "Egasi roli (RBAC 'owner')", role: 'sotuvchi', rbac: 'owner' },
  { tok: 't-admin', name: "Admin / Egasi (staff.role='admin')", role: 'admin', rbac: null },
];
const SALE_LIKE = ['savdo.create', 'savdo.edit', 'savdo.delete', 'qaytarish.create'];
// KUTILGAN SIYOSAT (hujjatlashtirilgan qoida — server kodidan emas):
const POLICY = {
  'kategoriya: ro\'yxat':           (p) => ['xarajatlar.view', 'xarajatlar.create', 'kassalar.transact', ...SALE_LIKE].some(k => p.has(k)),
  'kategoriya: yaratish (do\'kon)':  (p) => ['xarajatlar.create', 'kassalar.transact', ...SALE_LIKE].some(k => p.has(k)),
  'kategoriya: yaratish (ta\'sischi)': (p) => p.has('xarajatlar.create'),
  'kategoriya: nomini o\'zgartirish': (p) => p.has('xarajatlar.create'),
  'xarajat (kassadan)':             (p) => ['xarajatlar.create', 'kassalar.transact', ...SALE_LIKE].some(k => p.has(k)),
  'mijoz qarz to\'lovi':            (p) => p.has('mijozlar.debt_payment'),
  'kassa: qo\'lda chiqim':           (p) => p.has('kassalar.transact'),
  'kassa: tizimni 0 qilish':        () => false,                       // faqat admin
  'Firma kassa: ko\'rish':           (p) => p.has('firma_kassa.view'),
  'Firma kassa: kirim':             (p) => p.has('firma_kassa.transact'),
  'Firma kassa: bekor qilish':      () => false,                       // faqat admin
};

async function world() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8'));
  const branch = { cashboxes: BOXES, customers: [{ id: 5001, name: 'Ali', debt: 900000000 }], expenses: [], sales: [] };
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12000, tgBotToken: SECRET, tgChatId: '-1001', appPin: '9876' },
    branchStore: { f729: branch, baza: branch } })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('f729', $1::jsonb), ('baza', $1::jsonb)`, [JSON.stringify(branch)]);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase-migration-24-v11-cash-authority.sql'), 'utf8'));
  await pg.exec(fs.readFileSync(path.join(ROOT, 'supabase-migration-27-f4b-ledger-authority.sql'), 'utf8'));   // v23.2: JSON qarz/ombor/savdo → baza (opening, takroriy — xavfsiz)
  await pg.query(`select public._fk_cash_move('USD','in',1000,'deposit', p_idem_key => 'seed')`);
  // HAQIQIY seed ruxsatlari
  const seed = (await pg.query(`select r.key rk, p.key pk from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id`)).rows;
  const perms = {}; seed.forEach(x => (perms[x.rk] = perms[x.rk] || new Set()).add(x.pk));
  const staff = [], links = [], users = { 't-nostaff': { id: 'u-nostaff' }, 't-inactive': { id: 'u-inactive' } };
  ACTORS.forEach((a, i) => {
    const id = 100 + i;
    staff.push({ id, auth_user_id: 'u-' + a.tok, role: a.role, active: true, filial: a.role === 'admin' ? 'baza' : 'f729', name: a.name, login: a.tok });
    if (a.rbac) links.push({ staff_id: id, role_id: 'r-' + a.rbac });
    users[a.tok] = { id: 'u-' + a.tok };
  });
  staff.push({ id: 199, auth_user_id: 'u-inactive', role: 'sotuvchi', active: false, filial: 'f729', name: 'Nofaol', login: 'inactive' });
  links.push({ staff_id: 199, role_id: 'r-owner' });
  for (const s of staff) await pg.query(`insert into staff (id, login, name, role, filial, active) overriding system value values ($1,$2,$3,$4,$5,$6)`, [s.id, s.login, s.name, s.role, s.filial, s.active]);
  const role_permissions = Object.entries(perms).flatMap(([rk, set]) => [...set].map(k => ({ role_id: 'r-' + rk, permission_id: k, permissions: { key: k } })));
  const client = makePgSupabase(pg, { pgTables: PG_TABLES, memTables: { staff, staff_roles: links, role_permissions, staff_audit_log: [], idempotency_keys: [] }, users });
  return { pg, client, perms };
}

async function testRoleMatrix() {
  const { pg, client, perms } = await world();
  const rows = [];
  try {
    const ec = loadFunction('expense-categories', client), co = loadFunction('cashbox-ops', client), fk = loadFunction('firma-kassa', client);
    const ad = await ec(post({ action: 'create', turi: 'dokon', name: 'Admin kategoriyasi', idemKey: 'adm-cat-1', filial: 'f729' }, 't-admin'));
    const admCatId = JSON.parse(ad.body).category.id;
    const fkEntry = JSON.parse((await fk(post({ action: 'move', op: 'deposit', currency: 'USD', amount: 1, idemKey: 'adm-dep-1' }, 't-admin'))).body).entry.id;
    let k = 0;
    const key = () => 'mx-' + (++k) + '-' + Date.now().toString(36);
    const OPS = {
      'kategoriya: ro\'yxat': (t) => ec(post({ action: 'list' }, t)),
      'kategoriya: yaratish (do\'kon)': (t) => ec(post({ action: 'create', turi: 'dokon', name: 'K ' + t + ' ' + k, idemKey: key() }, t)),
      'kategoriya: yaratish (ta\'sischi)': (t) => ec(post({ action: 'create', turi: 'tasischi', name: 'T ' + t + ' ' + k, idemKey: key() }, t)),
      'kategoriya: nomini o\'zgartirish': (t) => ec(post({ action: 'rename', id: admCatId, name: 'Admin kategoriyasi ' + t, filial: 'f729' }, t)),
      'xarajat (kassadan)': (t) => co(post({ filial: 'f729', key: key(), kind: 'expense', ops: [{ box: 1, dir: 'out', amount: 1000 }] }, t)),
      'mijoz qarz to\'lovi': (t) => co(post({ filial: 'f729', key: key(), kind: 'cust_debt_pay', ops: [{ box: 1, dir: 'in', amount: 1000 }], record: { customerId: 5001 } }, t)),
      'kassa: qo\'lda chiqim': (t) => co(post({ filial: 'f729', key: key(), kind: 'manual_out', ops: [{ box: 1, dir: 'out', amount: 1000 }] }, t)),
      'kassa: tizimni 0 qilish': (t) => co(post({ filial: 'f729', key: key(), kind: 'reset_zero', ops: [{ box: 1, dir: 'out', amount: 1 }] }, t)),
      'Firma kassa: ko\'rish': (t) => fk(post({ action: 'state' }, t)),
      'Firma kassa: kirim': (t) => fk(post({ action: 'move', op: 'deposit', currency: 'USD', amount: 1, idemKey: key() }, t)),
      'Firma kassa: bekor qilish': (t) => fk(post({ action: 'reverse', entryId: fkEntry, idemKey: key(), note: 'x' }, t)),
    };
    // Tizimga kirmagan / xodim emas / nofaol — hammasi rad
    for (const [tok, code] of [['', 401], ['t-unknown', 401], ['t-nostaff', 403], ['t-inactive', 403]]) {
      for (const [op, fn] of Object.entries(OPS)) {
        const r = await fn(tok);
        assert.equal(r.statusCode, code, `${tok || '(token yo\'q)'} — ${op}: ${r.statusCode}`);
      }
      rows.push([tok || '(tizimga kirmagan)', `hammasi ${code}`]);
    }
    for (const a of ACTORS) {
      const p = a.rbac ? (perms[a.rbac] || new Set()) : null;
      const line = [];
      for (const [op, fn] of Object.entries(OPS)) {
        const expectOk = a.role === 'admin' ? true : POLICY[op](p);
        const r = await fn(a.tok);
        const ok = r.statusCode === 200;
        assert.equal(ok, expectOk, `${a.name} — ${op}: kutilgan ${expectOk ? '200' : '403'}, olindi ${r.statusCode} ${r.body.slice(0, 120)}`);
        if (!ok) assert.equal(r.statusCode, 403, `${a.name} — ${op}: rad etilsa 403`);
        line.push(ok ? '✔' : '✖');
      }
      rows.push([a.name, line.join(' ')]);
    }
    // Boshqa filial: f729 xodimi filial='baza' yuborsa ham — o'z filiali (Baza kassasi o'zgarmaydi)
    const bazaBefore = (await pg.query(`select balance::text b from cashbox_balances where filial='baza' and box_local_id=1`)).rows[0].b;
    const r = await co(post({ filial: 'baza', key: key(), kind: 'expense', ops: [{ box: 1, dir: 'out', amount: 777 }] }, 't-bmanager'));
    assert.equal(JSON.parse(r.body).filial, 'f729', 'filial serverda majburan o\'z filiali');
    assert.equal((await pg.query(`select balance::text b from cashbox_balances where filial='baza' and box_local_id=1`)).rows[0].b, bazaBefore, 'Baza kassasi o\'zgarmadi');
    const lr = JSON.parse((await ec(post({ action: 'list', filial: 'baza' }, 't-accountant'))).body);
    assert.equal(lr.filial, 'f729', "kategoriyalar ham — o'z filiali");
    // Telegram tokeni va PIN — hech kimga (admin'ga ham) ketmaydi; service_role kaliti — hech qachon
    const load = loadFunction('app-data-load', client);
    for (const a of ACTORS) {
      const body = (await load(post({}, a.tok))).body;
      assert.ok(!body.includes(SECRET), `${a.name}: Telegram tokeni javobda yo'q`);
      if (a.role !== 'admin') assert.ok(!body.includes('9876'), `${a.name}: PIN yo'q`);
    }
    const denied = client.mem.db.staff_audit_log.filter(x => x.action === 'permission_denied').length;
    assert.ok(denied > 20, 'rad etilgan urinishlar jurnalga yozildi');
    console.log('      Rollar matritsasi (✔ ruxsat, ✖ 403):\n      ' + Object.keys(OPS).map((o, i) => `${i + 1}=${o}`).join(' · ') + '\n' + rows.map(([a, b]) => `      ${a}: ${b}`).join('\n'));
  } finally { unloadFunctions(); await pg.close(); }
}

// Brauzerga boradigan fayllarda maxfiy kalit yo'q (service_role, secret, Telegram tokeni)
async function testNoSecretsInBrowserFiles() {
  const files = ['index.html', 'sotuvchi.html', 'diller.html', ...fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)];
  for (const f of files) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const jwt of s.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) || []) {
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
      assert.equal(payload.role, 'anon', `${f}: brauzerda faqat anon kalit bo'lishi mumkin`);
    }
    assert.doesNotMatch(s, /sb_secret_[A-Za-z0-9]{10,}|SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"][^'"]+|-----BEGIN [A-Z ]*PRIVATE KEY|\d{8,10}:AA[A-Za-z0-9_-]{30,}/, `${f}: maxfiy kalit yo'q`);
  }
}

module.exports = {
  name: 'P18 — FINAL GATE: xavfsizlik — rollar matritsasi (haqiqiy seed ruxsatlari, haqiqiy server funksiyalari)',
  cases: [
    { name: "9 rol + tizimga kirmagan/xodim emas/nofaol × 11 amal (kategoriya, xarajat, to'lov, kassa, Firma kassa); boshqa filial; Telegram/PIN", run: testRoleMatrix },
    { name: "Brauzer fayllarida faqat anon kalit; service_role/secret/private key/Telegram tokeni yo'q", run: testNoSecretsInBrowserFiles },
  ],
};
