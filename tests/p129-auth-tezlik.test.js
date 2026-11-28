// P129 — v25.6.10 (tezlik): requireStaffAuth — token tekshiruvi va xodim + rollar + ruxsatlar BIR VAQTDA, bitta so'rovda.
// Xavfsizlik: xodim faqat auth.getUser tasdiqlagan ID bo'yicha; tokendagi ID boshqa bo'lsa — oldindan olingani tashlanadi.
const assert = require('node:assert/strict');
const path = require('path');
const { requireStaffAuth } = require(path.join(__dirname, '..', 'netlify', 'functions', '_lib', 'supabaseAdmin'));

const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222';
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tok = (sub) => `${b64u({ alg: 'HS256' })}.${b64u({ sub })}.sig`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeAdmin({ authId, embed = true, delay = 80 }) {
  const log = [];
  const STAFF = {
    [U1]: { id: 7, auth_user_id: U1, name: 'Kassir', role: 'sotuvchi', filial: 'f729', active: true },
    [U2]: { id: 9, auth_user_id: U2, name: 'Boshqa', role: 'admin', filial: 'baza', active: true },
  };
  const ROLES = { 7: [{ role_id: 3, roles: { role_permissions: [{ permissions: { key: 'savdo.create' } }, { permissions: { key: 'mijozlar.view' } }] } }], 9: [] };
  const q = (table) => {
    const st = { table, sel: '*', f: {} };
    const api = {
      select(s) { st.sel = s; return api; },
      eq(k, v) { st.f[k] = v; return api; },
      in(k, v) { st.f[k] = v; return api; },
      async maybeSingle() { log.push({ t: Date.now(), table, sel: st.sel, f: { ...st.f } }); await sleep(delay);
        const row = STAFF[st.f.auth_user_id]; if (!row) return { data: null };
        return { data: embed && /staff_roles/.test(st.sel) ? { ...row, staff_roles: ROLES[row.id] } : { ...row } }; },
      then(res, rej) { log.push({ t: Date.now(), table, sel: st.sel, f: { ...st.f } });
        let data = [];
        if (table === 'staff_roles') data = (ROLES[st.f.staff_id] || []).map((r) => ({ role_id: r.role_id }));
        if (table === 'role_permissions') data = Object.values(ROLES).flat().filter((r) => (st.f.role_id || []).includes(r.role_id)).flatMap((r) => r.roles.role_permissions);
        return sleep(delay).then(() => ({ data })).then(res, rej); },
    };
    return api;
  };
  return { log, from: q, auth: { async getUser(t) { log.push({ t: Date.now(), table: 'auth' }); await sleep(delay); return authId ? { data: { user: { id: authId, app_metadata: {} } } } : { error: { message: 'bad' }, data: {} }; } } };
}
const ev = (t) => ({ headers: { authorization: 'Bearer ' + t } });

async function parallelAndEmbedded() {
  const a = fakeAdmin({ authId: U1 });
  const t0 = Date.now();
  const r = await requireStaffAuth(ev(tok(U1)), a, { loadPermissions: true });
  const ms = Date.now() - t0;
  assert.equal(r.ok, true);
  assert.deepEqual([...r.permKeys].sort(), ['mijozlar.view', 'savdo.create']);
  assert.equal(r.staff.staff_roles, undefined, 'ichki tuzilma javobga chiqmaydi');
  assert.equal(r.filial, 'f729');
  assert.ok(ms < 150, `token va xodim bir vaqtda (${ms} ms, avval ~4 x 80)`);
  assert.equal(a.log.filter((l) => l.table === 'staff_roles' || l.table === 'role_permissions').length, 0, 'alohida rol so\'rovlari yo\'q');
  // aniq ruxsat talab qilinsa
  const d = await requireStaffAuth(ev(tok(U1)), fakeAdmin({ authId: U1 }), { permission: 'kassalar.transact' });
  assert.equal(d.ok, false); assert.equal(d.response.statusCode, 403);
  const ok = await requireStaffAuth(ev(tok(U1)), fakeAdmin({ authId: U1 }), { permission: 'savdo.create' });
  assert.equal(ok.ok, true);
}

async function security() {
  // tokendagi ID (U2 — admin) auth tasdiqlagan ID (U1) bilan mos emas — oldindan olingan admin TASHLANADI
  const a = fakeAdmin({ authId: U1 });
  const r = await requireStaffAuth(ev(tok(U2)), a, { loadPermissions: true });
  assert.equal(r.ok, true); assert.equal(r.staff.id, 7, 'tasdiqlangan foydalanuvchi'); assert.equal(r.isAdmin, false);
  // token yaroqsiz — 401, xodim ma'lumoti ishlatilmaydi
  const b = await requireStaffAuth(ev(tok(U1)), fakeAdmin({ authId: null }), { loadPermissions: true });
  assert.equal(b.ok, false); assert.equal(b.response.statusCode, 401);
  // token JWT emas — oddiy ketma-ket yo'l
  const c = await requireStaffAuth(ev('not-a-jwt'), fakeAdmin({ authId: U1 }), { loadPermissions: true });
  assert.equal(c.ok, true); assert.equal(c.staff.id, 7);
  // ichma-ich so'rov qo'llab-quvvatlanmasa (eski baza) — rollar alohida so'rov bilan, natija bir xil
  const e = await requireStaffAuth(ev(tok(U1)), fakeAdmin({ authId: U1, embed: false }), { loadPermissions: true });
  assert.deepEqual([...e.permKeys].sort(), ['mijozlar.view', 'savdo.create']);
}

module.exports = { name: 'P129 — Avtorizatsiya tezligi (parallel, bitta so\'rov)', cases: [
  { name: 'token va xodim+ruxsatlar bir vaqtda, bitta soʻrov; ruxsat tekshiruvi oʻzgarmagan', run: parallelAndEmbedded },
  { name: 'xavfsizlik: tokendagi soxta ID — rad; yaroqsiz token — 401; eski baza — zaxira yoʻl', run: security },
] };
