// Netlify Function — v25.8: AI-REKLAMA (onlayn-do'kon mahsulotidan Telegram post / Reels). 58-migratsiya.
// Bitta funksiya — amallar (action). Har filial alohida (filial: admin — tanlangan, xodim — o'z filiali).
//
//   POST { action:'status', filial? }                    — AI holati (ulangan/shablon, bu oy X/limit), kanal, bot  · reklama.view
//   POST { action:'candidates', filial? }                — reklama uchun mahsulotlar (narx — SERVERDA)             · reklama.view
//   POST { action:'settings_get', filial? }              — filial sozlamalari                                       · reklama.view
//   POST { action:'settings_save', filial?, settings }   — saqlash (tekshiriladi)                                   · reklama.settings
//   POST { action:'text', filial?, pid, kind?, variant?, template? } — sarlavha, matn, heshteglar (AI yoki shablon) · reklama.create
//   POST { action:'img', filial?, pid, idx? }           — mahsulot rasmi (CORS'siz saytdan) → dataUrl; faqat shu mahsulotning https rasmi · reklama.create
//   (keyingi bosqichlar: upload_url, publish, drafts, draft_action, history)
//
// Qoidalar: deny-by-default (ruxsatsiz — 403); do'kon yoqilmagan filialda — 409 SHOP_OFF; 58 yo'q — 409 MIGRATION58_PENDING.
// Bot tokeni va AI kaliti javobga hech qachon qo'shilmaydi. Tana 1 MB dan katta bo'lsa — 413.
'use strict';
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError } = require('./_lib/supabaseAdmin');
const { TOKEN_RE } = require('./_lib/dailyReportRun');
const AA = require('./_lib/aiAds');
const AT = require('./_lib/aiText');
const SP = require('./_lib/shopPublic');

const ENDPOINT = 'ai-ads';
const MAX_BODY = 1024 * 1024;
const PERM = { status: 'reklama.view', candidates: 'reklama.view', settings_get: 'reklama.view', settings_save: 'reklama.settings', text: 'reklama.create', img: 'reklama.create' };
const IMG_MAX = 1536 * 1024, IMG_TIMEOUT = 7000;
// Rasm proksisi: SSRF himoyasi — faqat https, standart port, nom (IP emas), ichki/maxfiy nomlar yo'q; yo'naltirish taqiqlangan
function safeImgUrl(u) {
  let x; try { x = new URL(String(u || '')); } catch (_) { return null; }
  if (x.protocol !== 'https:' || x.username || x.password || (x.port && x.port !== '443')) return null;
  const h = x.hostname.toLowerCase();
  if (!h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[') || /(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(h)) return null;
  return x.toString();
}
async function proxyImage(url, fetchImpl = fetch) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), IMG_TIMEOUT);
  try {
    const r = await fetchImpl(url, { redirect: 'error', signal: ctrl.signal, headers: { Accept: 'image/*' } });
    if (!r.ok) return { error: 'Rasm sayti ' + r.status + ' qaytardi' };
    const mime = String((r.headers && r.headers.get && r.headers.get('content-type')) || '').split(';')[0].trim().toLowerCase();
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(mime)) return { error: 'Bu rasm emas' };
    const len = Number(r.headers.get('content-length') || 0);
    if (len > IMG_MAX) return { error: 'Rasm 1.5 MB dan katta' };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > IMG_MAX) return { error: 'Rasm 1.5 MB dan katta' };
    return { dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64') };
  } catch (e) {
    return { error: e && e.name === 'AbortError' ? 'Rasm sayti javob bermadi' : 'Rasm yuklanmadi' };
  } finally { clearTimeout(t); }
}
const missing58 = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /ai_ad_|ai_usage/.test(String(e.message || '')) && /does not exist|could not find|schema cache/i.test(String(e.message || '')));

// AI holati — kalit javobga chiqmaydi
function aiInfo() { const c = AT.aiConfig(); return { on: c.on, provider: c.provider, limit: c.limit, why: c.why }; }
const monthOf = (now = Date.now()) => AT.monthOf(now);   // Toshkent oyi

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
        ai: { on: ai.on, provider: ai.on ? ai.provider : null, why: ai.why, used, limit: ai.limit, left: Math.max(0, ai.limit - used), month, exhausted: ai.on && used >= ai.limit },
        telegram: { bot: TOKEN_RE.test(String(st.tgBotToken || '')), channel: AA.channelOf(settings, st) || null, ownerGroup: !!st.tgChatId },
        lang: settings.lang }, 200);
    }

    if (body.action === 'text' || body.action === 'img') {
      if (!(Number.isSafeInteger(body.pid) && body.pid > 0)) return json({ error: "Mahsulot noto'g'ri" }, 400);
      const L = await AA.loadBranch(admin, filial);
      if (!L.shopOn) return json({ error: "Bu filialda onlayn-do'kon yoqilmagan", code: 'SHOP_OFF' }, 409);
      const p = (L.data.products || []).find((x) => x && Number(x.id) === body.pid);
      // faqat vitrinada ko'rinadigan va «Reklama qilmaslik» belgisi yo'q mahsulot
      const pub = p && !p.noAds ? SP.publicProduct(p, SP.catalogCtx(L.data, filial, L.view)) : null;
      if (!pub) return json({ error: "Mahsulot reklama uchun mos emas (vitrinada yo'q yoki «Reklama qilmaslik» belgilangan)", code: 'NOT_ELIGIBLE' }, 404);
      if (body.action === 'img') {
        const idx = Number.isInteger(body.idx) && body.idx >= 0 && body.idx < 6 ? body.idx : 0;
        const url = safeImgUrl((pub.img || [])[idx]);
        if (!url) return json({ error: 'Rasm havolasi ruxsat etilmagan', code: 'BAD_IMG' }, 400);
        const out = await proxyImage(url, exports._fetch);
        if (out.error) return json({ error: out.error, code: 'IMG_FAIL' }, 502);
        return json({ ok: true, dataUrl: out.dataUrl }, 200);
      }
      const kind = ['discount', 'new', 'top', 'stuck'].includes(body.kind) ? body.kind : 'new';
      const variant = Number.isInteger(body.variant) && body.variant >= 0 && body.variant < 100 ? body.variant : undefined;
      const out = await AT.generateText({ admin, product: { name: pub.name, cat: pub.cat, desc: pub.desc }, pid: body.pid, kind, lang: settings.lang,
        variant, template: body.template === true });
      // «Boshqa variant» darhol (serverga qayta so'rovsiz): shu turdagi barcha shablon matnlar — raqam/narx yo'q
      const alts = [];
      for (let i = 0; i < 12; i++) { const a = AT.templateText({ product: { name: pub.name, cat: pub.cat }, pid: body.pid, kind, lang: settings.lang, variant: i });
        if (i > 0 && a.variant === alts[0].variant) break; alts.push({ title: a.title, body: a.body, tags: a.tags, variant: a.variant }); }
      return json({ ok: true, text: { title: out.title, body: out.body, tags: out.tags, source: out.source, note: out.note, variant: out.variant, count: out.count, lang: settings.lang, kind },
        alts, ai: out.ai }, 200);
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
exports._safeImgUrl = safeImgUrl;
exports.handler = require('./_lib/monitor').wrap(ENDPOINT, exports.handler);
