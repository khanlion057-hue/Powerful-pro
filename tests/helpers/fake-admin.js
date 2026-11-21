// P0.1 backend testlari uchun — HAQIQIY sinf yozmasdan, HAQIQIY
// `netlify/functions/app-data-save.js` va `_lib/supabaseAdmin.js` kodini
// (o'zgarishsiz) ishga tushirib, faqat DATABASE chegarasini (Supabase admin
// client) soxta (in-memory) qiladi. Bu — real backend logikani (RBAC,
// permission-map, deny-by-default) HAQIQIY production tarmoqqa chiqmasdan
// sinash uchun standart texnika (dependency injection — module-cache orqali).
const path = require('path');
const Module = require('module');

const APP_DATA_SAVE_PATH = path.join(__dirname, '..', '..', 'netlify', 'functions', 'app-data-save.js');
const SUPABASE_ADMIN_LIB_PATH = path.join(__dirname, '..', '..', 'netlify', 'functions', '_lib', 'supabaseAdmin.js');

function makeFakeAdmin({ authUser = null, staffRow = null, roleLinks = [], rolePermissions = [], appData = {}, branchRows = {} } = {}) {
  const branchState = { ...branchRows }; // branch_key -> data (app_data_branches)
  let lastBranchKey = null;
  let lastInKeys = null;
  const auditInserts = [];
  const upserts = [];

  function chainFor(table) {
    // v11/v23.2: 24 va 27-migratsiya jadvallari bu soxta bazada YO'Q (migratsiyagacha bo'lgan holat)
    if (table === 'cashbox_ledger' || table === 'ledger_ops') {
      const miss = () => Promise.resolve({ data: null, error: { code: '42P01', message: `relation "public.${table}" does not exist` } });
      const c = { select() { return c; }, eq() { return c; }, in() { return c; }, limit() { return c; }, maybeSingle: miss, then(res, rej) { miss().then(res, rej); } };
      return c;
    }
    const resolveDirect = () => {
      if (table === 'staff_roles') return { data: roleLinks, error: null };
      if (table === 'role_permissions') return { data: rolePermissions, error: null };
      if (table === 'app_data_branches') {
        const keys = lastInKeys || Object.keys(branchState);
        return { data: keys.filter(k => branchState[k] !== undefined).map(k => ({ branch_key: k, data: branchState[k] })), error: null };
      }
      return { data: null, error: null };
    };
    const resolveMaybeSingle = () => {
      if (table === 'staff') return { data: staffRow, error: null };
      if (table === 'app_data') return { data: appData ? { data: appData } : null, error: null };
      if (table === 'app_data_branches') {
        const d = branchState[lastBranchKey];
        return { data: d !== undefined ? { data: d } : null, error: null };
      }
      return { data: null, error: null };
    };
    const chain = {
      select() { return chain; },
      eq(col, val) { if (table === 'app_data_branches' && col === 'branch_key') lastBranchKey = val; return chain; },
      in(col, vals) { if (table === 'app_data_branches') lastInKeys = vals; return chain; },
      limit() { return chain; },
      maybeSingle() { return Promise.resolve(resolveMaybeSingle()); },
      upsert(payload) {
        upserts.push({ table, payload });
        if (table === 'app_data_branches') { branchState[payload.branch_key] = payload.data; lastBranchKey = payload.branch_key; }
        return Promise.resolve({ error: null, data: payload });
      },
      insert(payload) {
        if (table === 'staff_audit_log') auditInserts.push(payload);
        return Promise.resolve({ error: null });
      },
      then(resolve, reject) { Promise.resolve(resolveDirect()).then(resolve, reject); },
    };
    return chain;
  }

  return {
    auth: {
      getUser: async (token) => {
        if (authUser && token === authUser.token) return { data: { user: { id: authUser.id } }, error: null };
        return { data: { user: null }, error: { message: 'invalid token' } };
      },
    },
    from: (table) => chainFor(table),
    _inspect: { auditInserts, upserts, branchState },
  };
}

// Berilgan fakeAdmin bilan HAQIQIY app-data-save.js handler'ini qaytaradi.
// `restore()` chaqirilgach, module-cache asl holatiga qaytadi (boshqa
// testlarga ta'sir qilmasligi uchun).
function loadHandlerWithFakeAdmin(fakeAdmin, fnName = 'app-data-save') {
  const APP_DATA_SAVE_PATH = path.join(__dirname, '..', '..', 'netlify', 'functions', fnName + '.js');
  const GUARD_PATH = path.join(__dirname, '..', '..', 'netlify', 'functions', '_lib', 'appDataGuard.js');
  delete require.cache[GUARD_PATH];
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

  const supabaseJsPath = require.resolve('@supabase/supabase-js');
  const savedSupabaseJs = require.cache[supabaseJsPath];
  const savedAdminLib = require.cache[require.resolve(SUPABASE_ADMIN_LIB_PATH)];
  const savedAppDataSave = require.cache[require.resolve(APP_DATA_SAVE_PATH)];

  require.cache[supabaseJsPath] = new Module(supabaseJsPath);
  require.cache[supabaseJsPath].exports = { createClient: () => fakeAdmin };
  require.cache[supabaseJsPath].loaded = true;

  delete require.cache[require.resolve(SUPABASE_ADMIN_LIB_PATH)];
  delete require.cache[require.resolve(APP_DATA_SAVE_PATH)];

  const { handler } = require(APP_DATA_SAVE_PATH);

  function restore() {
    if (savedSupabaseJs) require.cache[supabaseJsPath] = savedSupabaseJs; else delete require.cache[supabaseJsPath];
    if (savedAdminLib) require.cache[require.resolve(SUPABASE_ADMIN_LIB_PATH)] = savedAdminLib; else delete require.cache[require.resolve(SUPABASE_ADMIN_LIB_PATH)];
    if (savedAppDataSave) require.cache[require.resolve(APP_DATA_SAVE_PATH)] = savedAppDataSave; else delete require.cache[require.resolve(APP_DATA_SAVE_PATH)];
  }

  return { handler, restore };
}

module.exports = { makeFakeAdmin, loadHandlerWithFakeAdmin };
