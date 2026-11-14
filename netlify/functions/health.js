// Netlify Function — tizim holatini tekshirish (deploydan keyin "hammasi ulanganmi?").
// Faqat ha/yo'q natijalar qaytariladi: hech qanday kalit, manzil yoki ma'lumot chiqmaydi.
//   GET /.netlify/functions/health  →  { ok, checks: { env, urlFromEnv, db, schema, seed } }
const { getAdminClient, json, methodGuard } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['GET']);
  if (methodErr) return methodErr;
  const checks = { env: false, urlFromEnv: !!process.env.SUPABASE_URL, db: false, schema: false, seed: false };
  let admin;
  try { admin = getAdminClient(); checks.env = true; }
  catch (e) { return json({ ok: false, checks, hint: "Netlify'da SUPABASE_SERVICE_ROLE_KEY o'rnatilmagan" }, 503); }
  try {
    const { count, error } = await admin.from('roles').select('id', { count: 'exact', head: true });
    if (!error) { checks.db = true; checks.schema = true; checks.seed = (count || 0) > 0; }
    else checks.db = !/fetch|network|ENOTFOUND|ECONN/i.test(error.message || '');
  } catch (e) { /* tarmoq xatosi — db=false */ }
  const ok = checks.env && checks.db && checks.schema && checks.seed;
  const hint = ok ? undefined
    : !checks.db ? "Bazaga ulanib bo'lmadi — SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY bir loyihaga tegishlimi?"
    : !checks.schema ? "Sxema o'rnatilmagan — supabase/schema.sql ni SQL Editor'da ishga tushiring"
    : "Rollar bo'sh — supabase/schema.sql oxiridagi boshlang'ich ma'lumot qo'shilmagan";
  // v25.3: funksiya qaysi mintaqada ishlayapti (masalan us-east-2) — baza (Supabase) mintaqasi bilan solishtirish uchun; maxfiy emas
  return json({ ok, checks, hint, region: process.env.AWS_REGION || null }, ok ? 200 : 503);
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('health', exports.handler);
