// Netlify Function — «Dastlabki sinov ma'lumotlarini tozalash» (v25.6.9). FAQAT administrator.
// POST { action: 'status' }                         → { start, until, open }
//      { action: 'set_start', startDate:'YYYY-MM-DD' } → boshlanish sanasi (muddat — shundan 6 oy)
//      { action: 'dry' }                            → nimalar o'chishini hisoblaydi (hech narsa o'chmaydi)
//      { action: 'run', password, confirm:'TOZALASH' } → parolni qayta tekshiradi va 49-migratsiyadagi fw_trial_reset(false) ni ishga tushiradi
// Muddat tugagan bo'lsa (boshlanishdan 6 oy) yoki sana kiritilmagan bo'lsa — dry/run rad etiladi.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, requireEnv, serverError, SUPABASE_URL } = require('./_lib/supabaseAdmin');

const ROW = 'trial_reset';
const addMonths = (iso, m) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); };
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

async function checkPassword(email, password) {
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key }, signal: ctrl.signal, body: JSON.stringify({ email, password }) });
    const d = await r.json().catch(() => ({}));
    return !!(r.ok && d && d.access_token);
  } catch (_) { return false; } finally { clearTimeout(t); }
}

// v25.6.9: app_data JSON nusxasini ham tozalash (aks holda boshqa filial nusxasidagi eski savdo/xarajat qayta chiqadi).
// Versiya +1 — eski nusxa ushlab turgan qurilmalar saqlay olmaydi (409) va qayta yuklaydi.
function cleanBranch(b) {
  if (!b || typeof b !== 'object') return b;
  const batches = (Array.isArray(b.batches) ? b.batches : []).filter((x) => x && x.status !== 'deleted')
    .map((x) => ({ ...x, sold: 0, status: (Number(x.qty) || 0) > 0 ? 'active' : 'empty' }));
  return { ...b, batches, sales: [], expenses: [], dailyClosings: [], revisions: [], cashTxns: [],
    customers: (b.customers || []).map((c) => ({ ...c, debt: 0 })), suppliers: (b.suppliers || []).map((c) => ({ ...c, debt: 0 })),
    cashboxes: (b.cashboxes || []).map((c) => ({ ...c, bal: 0 })) };
}
async function cleanJson(admin) {
  const now = new Date().toISOString();
  let r = await admin.from('app_data').select('data,version').eq('id', 'main').maybeSingle();
  const hasVer = !r.error; if (r.error) r = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
  if (r.error) throw r.error;
  const d = (r.data && r.data.data) || {};
  const bs = {}; Object.entries(d.branchStore || {}).forEach(([k, v]) => { bs[k] = cleanBranch(v); });
  const main = { ...d, branchStore: bs, partnerPeriods: [], dealerTxns: [], dealerStock: [], filialOrders: [], auditLogs: [], branchDebt: {},
    partners: (d.partners || []).map((p) => ({ ...p, invested: 0 })), dealers: (d.dealers || []).map((x) => ({ ...x, debt: 0 })) };
  const up = hasVer ? { data: main, version: (Number(r.data && r.data.version) || 0) + 1, updated_at: now } : { data: main, updated_at: now };
  const w = await admin.from('app_data').update(up).eq('id', 'main'); if (w.error) throw w.error;
  let rows = await admin.from('app_data_branches').select('branch_key,data,version');
  const bVer = !rows.error; if (rows.error) rows = await admin.from('app_data_branches').select('branch_key,data');
  for (const row of (rows.data || [])) {
    const u = bVer ? { data: cleanBranch(row.data), version: (Number(row.version) || 0) + 1, updated_at: now } : { data: cleanBranch(row.data), updated_at: now };
    const e = await admin.from('app_data_branches').update(u).eq('branch_key', row.branch_key); if (e.error) throw e.error;
  }
  return { branches: (rows.data || []).length };
}

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']); if (methodErr) return methodErr;
  const body = parseBody(event); if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);
  const action = body.action;
  if (!['status', 'set_start', 'dry', 'run'].includes(action)) return json({ error: "Noma'lum amal" }, 400);
  let admin;
  try { admin = getAdminClient(); } catch (e) { return serverError(e, 'trial-reset', 'Server sozlanmagan'); }
  const auth = await requireStaffAuth(event, admin, { requireAdmin: true, fn: 'trial-reset' });
  if (!auth.ok) return auth.response;
  try {
    const { data: row } = await admin.from('app_data').select('data').eq('id', ROW).maybeSingle();
    const cfg = (row && row.data) || {};
    const start = isDate(cfg.start) ? cfg.start : null, until = start ? addMonths(start, 6) : null;
    const today = new Date().toISOString().slice(0, 10), open = !!(start && today <= until);
    if (action === 'status') return json({ ok: true, start, until, open, lastRun: cfg.lastRun || null }, 200);
    if (action === 'set_start') {
      if (!isDate(body.startDate) || body.startDate > today) return json({ error: "Sana noto'g'ri (kelajak sanasi bo'lmaydi)" }, 400);
      if (start && start !== body.startDate && cfg.lastRun) return json({ error: "Tozalashdan keyin sanani o'zgartirib bo'lmaydi" }, 409);
      const { error } = await admin.from('app_data').upsert({ id: ROW, data: { ...cfg, start: body.startDate }, updated_at: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true, start: body.startDate, until: addMonths(body.startDate, 6), open: today <= addMonths(body.startDate, 6) }, 200);
    }
    if (!start) return json({ error: "Avval boshlanish sanasini kiriting" }, 409);
    if (!open) return json({ error: `Sinov muddati tugagan (${until}) — tozalash yopilgan` }, 403);
    if (action === 'dry') {
      const { data, error } = await admin.rpc('fw_trial_reset', { p_dry: true }); if (error) throw error;
      return json({ ok: true, counts: data }, 200);
    }
    // run
    if (body.confirm !== 'TOZALASH') return json({ error: "Tasdiq so'zi «TOZALASH» yozilmadi" }, 400);
    if (typeof body.password !== 'string' || !body.password || body.password.length > 200) return json({ error: 'Parolni kiriting' }, 400);
    const { data: u } = await admin.auth.admin.getUserById(auth.staff.auth_user_id);
    const email = u && u.user && u.user.email;
    if (!email || !(await checkPassword(email, body.password))) return json({ error: "Parol noto'g'ri" }, 403);
    const { data, error } = await admin.rpc('fw_trial_reset', { p_dry: false }); if (error) throw error;
    const jr = await cleanJson(admin);
    data.app_data_branches = jr.branches;
    await admin.from('app_data').upsert({ id: ROW, data: { ...cfg, lastRun: { at: new Date().toISOString(), by: auth.staff.name || auth.staff.login || null, counts: data } }, updated_at: new Date().toISOString() });
    return json({ ok: true, counts: data }, 200);
  } catch (e) { return serverError(e, 'trial-reset', 'Tozalashda xatolik'); }
};
exports.handler = require('./_lib/monitor').wrap('trial-reset', exports.handler);
exports._cleanBranch = cleanBranch;
