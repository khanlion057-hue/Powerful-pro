// Netlify Function — v25.8: AI-REKLAMA (onlayn-do'kon mahsulotidan Telegram post / Reels). 58-migratsiya.
// Bitta funksiya — amallar (action). Har filial alohida (filial: admin — tanlangan, xodim — o'z filiali).
//
//   POST { action:'status', filial? }                    — AI holati (ulangan/shablon, bu oy X/limit), kanal, bot  · reklama.view
//   POST { action:'candidates', filial? }                — reklama uchun mahsulotlar (narx — SERVERDA)             · reklama.view
//   POST { action:'settings_get', filial? }              — filial sozlamalari                                       · reklama.view
//   POST { action:'settings_save', filial?, settings }   — saqlash (tekshiriladi)                                   · reklama.settings
//   (keyingi bosqichlar: text, img, upload_url, publish, drafts, draft_action, history)
//
// Qoidalar: deny-by-default (ruxsatsiz — 403); do'kon yoqilmagan filialda — 409 SHOP_OFF; 58 yo'q — 409 MIGRATION58_PENDING.
// Bot tokeni va AI kaliti javobga hech qachon qo'shilmaydi. Tana 1 MB dan katta bo'lsa — 413.
'use strict';
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError } = require('./_lib/supabaseAdmin');
const { TOKEN_RE } = require('./_lib/dailyReportRun');
const AA = require('./_lib/aiAds');

const ENDPOINT = 'ai-ads';
const MAX_BODY = 1024 * 1024;
const PERM = { status: 'reklama.view', candidates: 'reklama.view', settings_get: 'reklama.view', settings_save: 'reklama.settings' };
const missing58 = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /ai_ad_|ai_usage/.test(String(e.message || '')) && /does not exist|could not find|schema cache/i.test(String(e.message || '')));

function aiInfo() {
  const key = String(process.env.AI_API_KEY || '').trim();
  const lim = Number(process.env.AI_MONTHLY_LIMIT);
  return { on: key.length >= 10, provider: String(process.env.AI_PROVIDER || 'gemini').toLowerCase().slice(0, 20),
    model: String(process.env.AI_MODEL || '').slice(0, 60), limit: Number.isInteger(lim) && lim >= 0 ? lim : 300 };
}
const monthOf = (now = Date.now()) => new Date(now + 5 * 3600000).toISOString().slice(0, 7);   // Toshkent oyi

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  if (event && typeof event.body === 'string' && event.body.length > MAX_BODY) return json({ error: "So'rov juda katta (1 MB dan oshmasin)" }, 413);
  const body = parseBody(event);
  if (!body || typeof body !== 'object' || !Object.prototype.hasOwnProperty.call(PERM, body.action)) return json({ error: "Noto'g'ri so'rov" }, 400);

  let admin;
  try { admin = getAdminClient(); } catch (e) { return serverError(e, ENDPOINT, 'Server sozlanmagan — administratorga murojaat qiling'); }
  const auth = await requireStaffAuth(event, admin, { loadPermissions: true, fn: ENDPOINT });
  if (!auth.ok) return auth.response;
  if (!auth.isAdmin && !auth.permKeys.has(PERM[body.action])) return json({ error: "Bu amal uchun ruxsatingiz yoʻq", code: 'FORBIDDEN' }, 403);
  const filial = resolveFilial(auth, body.filial);

  try {
    let settings;
    try { settings = await AA.loadSettings(admin, filial); }
    catch (e) { if (missing58(e)) return json({ error: "Bazaga 58-migratsiya qo'llanmagan — AI-reklama hali yoqilmagan", code: 'MIGRATION58_PENDING' }, 409); throw e; }

    if (body.action === 'settings_get') return json({ ok: true, filial, settings }, 200);

    if (body.action === 'settings_save') {
      const bad = AA.validateSettingsInput(body.settings);
      if (bad) return json({ error: bad }, 400);
      const next = AA.normalizeSettings(body.settings);
      const { error } = await admin.from('ai_ad_settings').upsert({ branch_id: filial, data: next, updated_at: new Date().toISOString(),
        updated_by: String((auth.staff && auth.staff.name) || 'Admin').slice(0, 80) }, { onConflict: 'branch_id' });
      if (error) throw error;
      return json({ ok: true, filial, settings: next }, 200);
    }

    if (body.action === 'status') {
      const L = await AA.loadBranch(admin, filial);
      const ai = aiInfo(), month = monthOf();
      const { data: u } = await admin.from('ai_usage').select('count').eq('month', month).maybeSingle();
      const used = Number((u && u.count) || 0);
      const st = L.settings || {};
      return json({ ok: true, filial, shopOn: L.shopOn,
        ai: { on: ai.on, provider: ai.on ? ai.provider : null, used, limit: ai.limit, left: Math.max(0, ai.limit - used), month, exhausted: ai.on && used >= ai.limit },
        telegram: { bot: TOKEN_RE.test(String(st.tgBotToken || '')), channel: AA.channelOf(settings, st) || null, ownerGroup: !!st.tgChatId },
        lang: settings.lang }, 200);
    }

    // candidates
    const r = await AA.candidates(admin, filial, settings);
    if (!r.shopOn) return json({ error: "Bu filialda onlayn-do'kon yoqilmagan", code: 'SHOP_OFF' }, 409);
    return json({ ok: true, filial, cur: r.cur, items: r.items.slice(0, 60), total: r.items.length }, 200);
  } catch (e) {
    if (missing58(e)) return json({ error: "Bazaga 58-migratsiya qo'llanmagan — AI-reklama hali yoqilmagan", code: 'MIGRATION58_PENDING' }, 409);
    return serverError(e, ENDPOINT, 'AI-reklama: server xatosi');
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap(ENDPOINT, exports.handler);
