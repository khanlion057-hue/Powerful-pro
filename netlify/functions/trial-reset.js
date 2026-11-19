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
    await admin.from('app_data').upsert({ id: ROW, data: { ...cfg, lastRun: { at: new Date().toISOString(), by: auth.staff.name || auth.staff.login || null, counts: data } }, updated_at: new Date().toISOString() });
    return json({ ok: true, counts: data }, 200);
  } catch (e) { return serverError(e, 'trial-reset', 'Tozalashda xatolik'); }
};
exports.handler = require('./_lib/monitor').wrap('trial-reset', exports.handler);
