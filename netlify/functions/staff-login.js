// Netlify Function — v24.9 (38-migratsiya): KIRISH — noto'g'ri parol urinishlarini sanash va vaqtinchalik blok.
// Egasi qarori: 5 ta noto'g'ri parol → 15 daqiqa blok; blokdan keyin yana 3 ta noto'g'ri → 30 daqiqa (har safar).
// To'g'ri kirish, Telegram kod bilan tiklash (pw-reset confirm) yoki admin (admin_reset / admin_unlock) — tozalaydi.
//
// POST { login, password, kind: 'auto' | 'staff' | 'dealer' }
//   → 200 { ok, kind, session: { access_token, refresh_token, expires_in, expires_at, token_type } }
//   → 401 { error, left }           — noto'g'ri; blokgacha qolgan urinishlar
//   → 423 { error, code:'LOCKED', until, minutes } — bloklangan (parol tekshirilmaydi ham)
//   → 429 / 502                      — Supabase cheklovi / texnik xato (urinish sanalmaydi)
// Parol Supabase Auth'ga (password grant) serverdan yuboriladi; javobdagi seans brauzerda setSession bilan o'rnatiladi.
// 38 qo'llanmagan bo'lsa — sanoqsiz, avvalgidek kiradi (kirish hech qachon buzilmaydi).
const { getAdminClient, json, methodGuard, parseBody, requireEnv, SUPABASE_URL } = require('./_lib/supabaseAdmin');

const DOMAINS = { staff: 'staff.biznespro.local', dealer: 'dillers.biznespro.local' };
const RULES = [{ limit: 5, minutes: 15 }, { limit: 3, minutes: 30 }];   // 1-bosqich, keyin har safar 2-bosqich
const STAGE_RESET_MS = 24 * 3600e3;   // 24 soat xatosiz — boshidan (5 ta urinish)
const norm = (l) => String(l || '').toLowerCase().replace(/\s+/g, '').slice(0, 80);
const keyOf = (l) => 'l:' + norm(l);
const leftMin = (until) => Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / 60000));
const lockedMsg = (until) => `Koʻp marta notoʻgʻri parol — hisob ${leftMin(until)} daqiqaga bloklandi. Parolni unutgan boʻlsangiz — «Parolni unutdingizmi?»`;

async function grant(email, password) {
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key }, signal: ctrl.signal,
      body: JSON.stringify({ email, password }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d && d.access_token) return { ok: true, session: { access_token: d.access_token, refresh_token: d.refresh_token, expires_in: d.expires_in, expires_at: d.expires_at, token_type: d.token_type } };
    if (r.status === 429) return { rate: true };
    if (r.status >= 500) return { tech: true };
    return { bad: true };   // 400 invalid_grant / invalid_credentials / email_not_confirmed
  } catch (e) { return { tech: true }; }
  finally { clearTimeout(t); }
}

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const body = parseBody(event);
  const login = norm(body && body.login), password = body && typeof body.password === 'string' ? body.password : '';
  if (!login || !password || password.length > 200) return json({ error: 'Login va parolni kiriting' }, 400);
  const kind = ['staff', 'dealer'].includes(body.kind) ? body.kind : 'auto';
  let admin;
  try { admin = getAdminClient(); } catch (e) { return json({ error: 'Server sozlanmagan' }, 500); }

  const key = keyOf(login), now = Date.now();
  let guard = null, guardOn = true;
  try {
    const { data, error } = await admin.from('login_guard').select('*').eq('login_key', key).maybeSingle();
    if (error) guardOn = false; else guard = data;
  } catch (_) { guardOn = false; }
  if (guard && guard.locked_until && Date.parse(guard.locked_until) > now) {
    return json({ error: lockedMsg(guard.locked_until), code: 'LOCKED', until: guard.locked_until, minutes: leftMin(guard.locked_until) }, 423);
  }

  const kinds = kind === 'auto' ? ['staff', 'dealer'] : [kind];
  let tech = false;
  for (const k of kinds) {
    const r = await grant(`${login}@${DOMAINS[k]}`, password);
    if (r.ok) {
      if (guardOn && guard) await admin.from('login_guard').delete().eq('login_key', key);
      return json({ ok: true, kind: k, session: r.session }, 200);
    }
    if (r.rate) return json({ error: "⏳ Juda koʻp urinish — 1 daqiqadan keyin qayta urining" }, 429);
    if (r.tech) tech = true;
  }
  if (tech) return json({ error: "🌐 Server bilan bogʻlanib boʻlmadi — birozdan keyin qayta urining" }, 502);
  if (!guardOn) return json({ error: "Login yoki parol notoʻgʻri" }, 401);

  // Noto'g'ri parol — sanash
  const fresh = !guard || !guard.last_fail_at || now - Date.parse(guard.last_fail_at) > STAGE_RESET_MS;
  let stage = fresh ? 0 : Math.min(+guard.stage || 0, 1);
  let fails = (fresh ? 0 : (+guard.fails || 0)) + 1;
  const rule = RULES[stage];
  let lockedUntil = null;
  if (fails >= rule.limit) { lockedUntil = new Date(now + rule.minutes * 60000).toISOString(); stage = 1; fails = 0; }
  const row = { login_key: key, fails, stage, locked_until: lockedUntil, last_fail_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() };
  try { await admin.from('login_guard').upsert(row, { onConflict: 'login_key' }); } catch (_) { /* sanoq — ikkinchi darajali */ }
  if (lockedUntil) {
    try { await admin.from('staff_audit_log').insert({ staff_id: null, staff_name: login, filial: null, action: 'login_locked', details: { minutes: rule.minutes } }); } catch (_) {}
    return json({ error: lockedMsg(lockedUntil), code: 'LOCKED', until: lockedUntil, minutes: rule.minutes }, 423);
  }
  const left = rule.limit - fails;
  return json({ error: `Login yoki parol notoʻgʻri${left <= 2 ? ` — yana ${left} ta urinishdan keyin ${rule.minutes} daqiqaga bloklanadi` : ''}`, left }, 401);
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('staff-login', exports.handler);
