// Testlar uchun minimal IN-MEMORY Supabase (PostgREST) o'rnini bosuvchi — server
// funksiyalarining (netlify/functions/*.js) HAQIQIY kodini o'zgarishsiz ishga
// tushirib, faqat ma'lumotlar bazasi chegarasini almashtiradi. Bu — "unit test
// (mock DB)": SQL funksiyalarining o'zi alohida, haqiqiy PostgreSQL'da (PGlite)
// testlanadi (p8/p9/p10 PGlite qismlari).
//
// Qo'llab-quvvatlanadi: from(t).select().eq/neq/in/is/ilike/gte/order/range/limit
// .maybeSingle()/.single(), insert/update/upsert/delete (+ .select()), unique
// cheklovlar (23505), rpc(name,args) — testda berilgan funksiyalar orqali.
const path = require('path');
const Module = require('module');

// Faqat migratsiyadan keyin paydo bo'ladigan jadvallar: testda berilmagan bo'lsa —
// "jadval yo'q" (42P01), ya'ni migratsiya hali qo'llanmagan holat (v11: cashbox_ledger; v23.2: ledger_ops).
const MIGRATION_TABLES = ['cashbox_ledger', 'ledger_ops', 'fw_notifications', 'fw_audit_events', 'fw_dealer_revisions', 'supplier_advance_balances', 'supplier_advance_ledger'];   // v24: 31-, v24.2: 32-, v24.4: 33-migratsiya jadvallari

function makeMemSupabase({ tables = {}, unique = {}, rpc = {}, users = {} } = {}) {
  const db = {};
  const missing = new Set(MIGRATION_TABLES.filter(t => !(t in tables)));
  for (const [t, rows] of Object.entries(tables)) db[t] = rows.map(r => ({ ...r }));
  const calls = { rpc: [], inserts: [], updates: [], deletes: [] };
  let seq = 1000;

  // PostgREST ilike: % = har qanday satr, _ = bitta belgi, \x = literal x
  function matchLike(val, pattern) {
    let re = '', p = String(pattern);
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (c === '\\' && i + 1 < p.length) { re += p[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
      re += c === '%' ? '.*' : c === '_' ? '.' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp('^' + re + '$', 'i').test(String(val));
  }

  function query(table) {
    const st = { filters: [], op: 'select', payload: null, single: null, order: null, range: null, returning: false, onConflict: null };
    const rows = () => (db[table] = db[table] || []);
    const pass = (r) => st.filters.every(f => f(r));
    const exec = () => {
      if (missing.has(table)) return { data: null, error: { code: '42P01', message: `relation "public.${table}" does not exist` } };
      const all = rows();
      if (st.op === 'insert' || st.op === 'upsert') {
        const list = Array.isArray(st.payload) ? st.payload : [st.payload];
        const out = [];
        for (const p of list) {
          const keys = st.op === 'upsert' && st.onConflict ? st.onConflict.split(',') : null;
          const existing = keys ? all.find(r => keys.every(k => String(r[k]) === String(p[k]))) : null;
          if (existing) { Object.assign(existing, p); out.push(existing); continue; }
          for (const col of (unique[table] || [])) {
            if (p[col] != null && all.some(r => r[col] === p[col])) return { data: null, error: { code: '23505', message: `duplicate key ${col}` } };
          }
          const row = { id: p.id ?? ++seq, ...p };
          all.push(row); out.push(row); calls.inserts.push({ table, row });
        }
        return { data: st.single ? out[0] : out, error: null };
      }
      if (st.op === 'update') {
        const hit = all.filter(pass);
        hit.forEach(r => Object.assign(r, st.payload));
        calls.updates.push({ table, payload: st.payload, count: hit.length });
        return { data: st.single ? (hit[0] || null) : hit, error: null };
      }
      if (st.op === 'delete') {
        const keep = all.filter(r => !pass(r));
        calls.deletes.push({ table, count: all.length - keep.length });
        db[table] = keep;
        return { data: null, error: null };
      }
      let res = all.filter(pass).map(r => ({ ...r }));
      if (st.order) res.sort((a, b) => (a[st.order.col] > b[st.order.col] ? 1 : -1) * (st.order.asc ? 1 : -1));
      if (st.range) res = res.slice(st.range[0], st.range[1] + 1);
      if (st.single === 'maybe') return { data: res[0] || null, error: null };
      if (st.single === 'one') return res.length === 1 ? { data: res[0], error: null } : { data: null, error: { message: 'not single' } };
      return { data: res, error: null };
    };
    const q = {
      select() { if (st.op !== 'select') st.returning = true; return q; },
      eq(c, v) { st.filters.push(r => String(r[c]) === String(v)); return q; },
      neq(c, v) { st.filters.push(r => String(r[c]) !== String(v)); return q; },
      in(c, vs) { st.filters.push(r => vs.map(String).includes(String(r[c]))); return q; },
      is(c, v) { st.filters.push(r => (v === null ? r[c] == null : r[c] === v)); return q; },
      ilike(c, v) { st.filters.push(r => matchLike(r[c], v)); return q; },
      gte(c, v) { st.filters.push(r => r[c] >= v); return q; },
      order(col, o) { st.order = st.order || { col, asc: !(o && o.ascending === false) }; return q; },
      range(a, b) { st.range = [a, b]; return q; },
      limit(n) { st.range = [0, n - 1]; return q; },
      insert(p) { st.op = 'insert'; st.payload = p; return q; },
      upsert(p, o) { st.op = 'upsert'; st.payload = p; st.onConflict = o && o.onConflict; return q; },
      update(p) { st.op = 'update'; st.payload = p; return q; },
      delete() { st.op = 'delete'; return q; },
      maybeSingle() { st.single = 'maybe'; return Promise.resolve(exec()); },
      single() { st.single = st.op === 'select' ? 'one' : true; return Promise.resolve(exec()); },
      then(ok, bad) { return Promise.resolve(exec()).then(ok, bad); },
    };
    return q;
  }

  const client = {
    db, calls,
    from: (t) => query(t),
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (!rpc[name]) return { data: null, error: { message: `rpc ${name} yo'q` } };
      try { return { data: await rpc[name](args, db), error: null }; }
      catch (e) { return { data: null, error: { code: e.code || 'P0001', message: e.message } }; }
    },
    auth: {
      getUser: async (token) => (users[token] ? { data: { user: users[token] }, error: null } : { data: { user: null }, error: { message: 'bad token' } }),
      admin: {
        updateUserById: async (id, upd) => { calls.updates.push({ table: 'auth.users', id, upd }); return { error: null }; },
        deleteUser: async (id) => { calls.deletes.push({ table: 'auth.users', id }); return { error: null }; },
        createUser: async () => ({ data: { user: { id: 'u-new' } }, error: null }),
      },
    },
  };
  return client;
}

// Funksiyani shu soxta klient bilan yuklash (module-cache orqali)
function loadFunction(name, client) {
  const ROOT = path.join(__dirname, '..', '..');
  const sbPath = require.resolve('@supabase/supabase-js', { paths: [ROOT] });
  const libDir = path.join(ROOT, 'netlify', 'functions', '_lib');
  const fnPath = path.join(ROOT, 'netlify', 'functions', name + '.js');
  require.cache[sbPath] = new Module(sbPath);
  require.cache[sbPath].exports = { createClient: () => client };
  require.cache[sbPath].loaded = true;
  for (const k of Object.keys(require.cache)) if (k.startsWith(libDir) || k === fnPath) delete require.cache[k];
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';
  return require(fnPath).handler;
}
function unloadFunctions() {
  const ROOT = path.join(__dirname, '..', '..');
  const sbPath = require.resolve('@supabase/supabase-js', { paths: [ROOT] });
  delete require.cache[sbPath];
  for (const k of Object.keys(require.cache)) if (k.includes(path.join('netlify', 'functions'))) delete require.cache[k];
}

const post = (body, token = 't-admin') => ({ httpMethod: 'POST', headers: { authorization: 'Bearer ' + token }, body: JSON.stringify(body) });

module.exports = { makeMemSupabase, loadFunction, unloadFunctions, post };
