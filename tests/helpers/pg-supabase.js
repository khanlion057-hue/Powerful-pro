// Testlar uchun: server funksiyalari (netlify/functions/*.js) HAQIQIY PostgreSQL
// bazasi (PGlite — WASM'da to'liq PostgreSQL) bilan ishlashi uchun minimal
// supabase-js (PostgREST) moslashtirgichi. Pul bilan bog'liq jadvallar va RPC'lar
// HAQIQIY SQL orqali bajariladi (qulflash, CHECK, trigger, tranzaksiya — hammasi
// haqiqiy); avtorizatsiya jadvallari (staff, rollar, ruxsatlar, audit, idempotency)
// esa in-memory (mem-supabase) — ular bu testlarning mavzusi emas.
//
// Qo'llab-quvvatlanadi: from(t).select(cols).eq/in/order/range/limit
// .maybeSingle()/.single()/then, insert, upsert(onConflict), update(...).eq, rpc(name, args).
const { makeMemSupabase } = require('./mem-supabase');

const qi = (id) => '"' + String(id).replace(/"/g, '""') + '"';

function pgQuery(pg, table) {
  const st = { op: 'select', cols: '*', where: [], params: [], payload: null, onConflict: null, order: null, limit: null, offset: null, single: null };
  const p = (v) => { st.params.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v); return '$' + st.params.length; };
  const run = async () => {
    try {
      const T = 'public.' + qi(table);
      let sql;
      if (st.op === 'select') {
        const cols = st.cols === '*' ? '*' : st.cols.split(',').map(c => qi(c.trim())).join(', ');
        sql = `select ${cols} from ${T}` + (st.where.length ? ' where ' + st.where.join(' and ') : '')
          + (st.order ? ` order by ${qi(st.order.col)} ${st.order.asc ? 'asc' : 'desc'}` : '')
          + (st.limit != null ? ` limit ${st.limit}` : '') + (st.offset != null ? ` offset ${st.offset}` : '');
      } else if (st.op === 'insert' || st.op === 'upsert') {
        const rows = Array.isArray(st.payload) ? st.payload : [st.payload];
        const keys = Object.keys(rows[0]);
        const values = rows.map(r => '(' + keys.map(k => p(r[k])).join(', ') + ')').join(', ');
        sql = `insert into ${T} (${keys.map(qi).join(', ')}) values ${values}`;
        if (st.op === 'upsert') {
          const conflict = (st.onConflict || 'id').split(',').map(c => qi(c.trim()));
          const upd = keys.filter(k => !conflict.includes(qi(k))).map(k => `${qi(k)} = excluded.${qi(k)}`);
          sql += ` on conflict (${conflict.join(', ')}) ` + (upd.length ? `do update set ${upd.join(', ')}` : 'do nothing');
        }
        sql += ' returning *';
      } else if (st.op === 'update') {
        const sets = Object.keys(st.payload).map(k => `${qi(k)} = ${p(st.payload[k])}`);
        sql = `update ${T} set ${sets.join(', ')}` + (st.where.length ? ' where ' + st.where.join(' and ') : '') + ' returning *';
      } else if (st.op === 'delete') {
        sql = `delete from ${T}` + (st.where.length ? ' where ' + st.where.join(' and ') : '');
      }
      const res = await pg.query(sql, st.params);
      const rows = res.rows || [];
      if (st.single === 'maybe') return { data: rows[0] || null, error: null };
      if (st.single === 'one') return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not single' } };
      return { data: rows, error: null };
    } catch (e) {
      return { data: null, error: { code: e.code || 'XX000', message: e.message } };
    }
  };
  const q = {
    select(cols) { if (st.op === 'select' && cols) st.cols = cols; return q; },
    eq(c, v) { st.where.push(`${qi(c)} = ${p(v)}`); return q; },
    in(c, vs) {
      const lit = '{' + vs.map(v => '"' + String(v).replace(/(["\\])/g, '\\$1') + '"').join(',') + '}';
      st.params.push(lit);
      st.where.push(`${qi(c)}::text = any($${st.params.length}::text[])`);
      return q;
    },
    gte(c, v) { st.where.push(`${qi(c)} >= ${p(v)}`); return q; },
    lt(c, v) { st.where.push(`${qi(c)} < ${p(v)}`); return q; },
    lte(c, v) { st.where.push(`${qi(c)} <= ${p(v)}`); return q; },
    is(c, v) { st.where.push(`${qi(c)} is ${v === null ? 'null' : v ? 'true' : 'false'}`); return q; },
    order(col, o) { st.order = st.order || { col, asc: !(o && o.ascending === false) }; return q; },
    range(a, b) { st.offset = a; st.limit = b - a + 1; return q; },
    limit(n) { st.limit = n; return q; },
    insert(v) { st.op = 'insert'; st.payload = v; return q; },
    upsert(v, o) { st.op = 'upsert'; st.payload = v; st.onConflict = o && o.onConflict; return q; },
    update(v) { st.op = 'update'; st.payload = v; return q; },
    delete() { st.op = 'delete'; return q; },
    maybeSingle() { st.single = 'maybe'; return run(); },
    single() { st.single = 'one'; return run(); },
    then(ok, bad) { return run().then(ok, bad); },
  };
  return q;
}

const ALWAYS_PG = ['customer_credit_balances', 'customer_credit_ledger', 'sale_credit_uses'];
// pgTables — HAQIQIY bazaga yo'naltiriladigan jadvallar; qolganlari — in-memory.
function makePgSupabase(pg, { pgTables, memTables = {}, users = {} }) {
  const mem = makeMemSupabase({ tables: memTables, users });
  const calls = { rpc: [] };
  return {
    pg, mem, calls,
    auth: mem.auth,
    // v24.5: 34-migratsiya jadvallari doim haqiqiy bazadan (yo'q bo'lsa — production kabi 42P01 xatosi; funksiya eski yo'lda ishlaydi)
    from: (t) => (pgTables.includes(t) || ALWAYS_PG.includes(t) ? pgQuery(pg, t) : mem.from(t)),
    rpc: async (name, args = {}) => {
      calls.rpc.push({ name, args });
      const keys = Object.keys(args);
      const params = keys.map(k => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
      const named = keys.map((k, i) => `${qi(k)} => $${i + 1}`).join(', ');
      try {
        const r = await pg.query(`select to_jsonb(public.${qi(name)}(${named})) as r`, params);
        return { data: r.rows[0] ? r.rows[0].r : null, error: null };
      } catch (e) {
        return { data: null, error: { code: e.code || 'XX000', message: e.message } };
      }
    },
  };
}

module.exports = { makePgSupabase };
