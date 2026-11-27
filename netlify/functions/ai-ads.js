// Netlify Function — v25.8: AI-REKLAMA (onlayn-do'kon mahsulotidan Telegram post / Reels). 58-migratsiya.
// Bitta funksiya — amallar (action). Har filial alohida (filial: admin — tanlangan, xodim — o'z filiali).
//
//   POST { action:'status', filial? }                    — AI holati (ulangan/shablon, bu oy X/limit), kanal, bot  · reklama.view
//   POST { action:'candidates', filial? }                — reklama uchun mahsulotlar (narx — SERVERDA)             · reklama.view
//   POST { action:'settings_get', filial? }              — filial sozlamalari                                       · reklama.view
//   POST { action:'settings_save', filial?, settings }   — saqlash (tekshiriladi)                                   · reklama.settings
//   POST { action:'text', filial?, pid, kind?, variant?, template? } — sarlavha, matn, heshteglar (AI yoki shablon) · reklama.create
//   POST { action:'img', filial?, pid, idx? }           — mahsulot rasmi (CORS'siz saytdan) → dataUrl; faqat shu mahsulotning https rasmi · reklama.create
//   POST { action:'product', filial?, pid }             — bitta mahsulot (qayta chizish uchun): nom, rasm, narx satri   · reklama.view
//   POST { action:'upload_url', filial?, idemKey }      — video uchun bir martalik yuklash havolasi (ai-ads-tmp, 20 MB, mp4) · reklama.publish
//   POST { action:'publish', filial?, pid, format, template, text, reason, priceLine, oldLine, photo|videoPath, idemKey }
//                                                       — kanalga yuborish (narx va qoldiq QAYTA tekshiriladi)           · reklama.publish
//   POST { action:'history', filial? }                  — oxirgi 50 ta post (holat, xato, havola)                         · reklama.view
//   POST { action:'tg_check', filial? }                 — bot kanalga yoza oladimi (getChatMember)                       · reklama.settings
//   POST { action:'drafts', filial? }                   — avtopilot qoralamalari (Navbat)                                 · reklama.view
//   POST { action:'draft_action', filial?, id, op:'approve'|'skip' } — tasdiqlash (kanalga, mahsulot rasmi bilan) / o'tkazish · reklama.publish
//   Avtopilot — ai-ads-cron (jadval, :20).
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
const PERM = { status: 'reklama.view', candidates: 'reklama.view', settings_get: 'reklama.view', settings_save: 'reklama.settings', text: 'reklama.create', img: 'reklama.create',
  product: 'reklama.view', upload_url: 'reklama.publish', publish: 'reklama.publish', history: 'reklama.view', tg_check: 'reklama.settings',
  drafts: 'reklama.view', draft_action: 'reklama.publish' };
const AU = require('./_lib/aiAutopilot');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AP = require('./_lib/aiPublish');
const TEMPLATES = ['chegirma', 'yangioq', 'kattanarx', 'brend'];   // js/ai-reklama-shablonlar.js bilan bir xil
const BUCKET = 'ai-ads-tmp';
const IDEM_RE = /^[A-Za-z0-9-]{8,64}$/;
const PHOTO_MAX = 320 * 1024;   // JPEG ≤300 KB (+zaxira)
const BUDGET_MS = 9000;         // Netlify 10 s — javob shu vaqtgacha qaytadi
const SENDING_STALE_MS = 90000; // «yuborilmoqda» holatida qotib qolgan post — qayta urinish mumkin
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
  const t0 = Date.now(), left = () => BUDGET_MS - (Date.now() - t0);
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
      if (next.autopilot.enabled) {   // avtopilot — bot va kanalsiz yoqilmaydi
        const L0 = await AA.loadBranch(admin, filial), st0 = L0.settings || {};
        if (!TOKEN_RE.test(String(st0.tgBotToken || '').trim())) return json({ error: 'Avtopilot yoqilmadi: hisobot boti ulanmagan (Sozlamalar → Telegram)', code: 'NO_BOT' }, 400);
        if (!AA.channelOf(next, st0)) return json({ error: 'Avtopilot yoqilmadi: reklama kanali koʻrsatilmagan', code: 'NO_CHANNEL' }, 400);
      }
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

    if (body.action === 'drafts') {
      const { data, error } = await admin.from('ai_ad_posts').select('id,product_id,status,created_at,expires_at,price_snapshot,meta,idem_key,error,tries')
        .eq('branch_id', filial).eq('status', 'draft').order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      return json({ ok: true, autopilot: settings.autopilot, items: (data || []).map((r) => ({ id: r.id, pid: Number(r.product_id), at: r.created_at, expiresAt: r.expires_at,
        price: r.price_snapshot || null, name: r.meta && r.meta.name, title: r.meta && r.meta.title, body: r.meta && r.meta.body, tags: (r.meta && r.meta.tags) || [],
        reason: r.meta && r.meta.reason, img: r.meta && r.meta.img, aiText: !!(r.meta && r.meta.source === 'ai'), idemKey: r.idem_key })) }, 200);
    }

    if (body.action === 'draft_action') {
      if (!UUID_RE.test(String(body.id || '')) || !['approve', 'skip'].includes(body.op)) return json({ error: "Noto'g'ri so'rov" }, 400);
      const { data: row, error } = await admin.from('ai_ad_posts').select('*').eq('id', body.id).eq('branch_id', filial).maybeSingle();
      if (error) throw error;
      if (!row) return json({ error: 'Qoralama topilmadi', code: 'NOT_FOUND' }, 404);
      if (row.status !== 'draft') return json({ error: row.status === 'expired' ? 'Qoralama muddati oʻtgan' : 'Bu qoralama allaqachon koʻrib chiqilgan', code: 'NOT_DRAFT', status: row.status }, 409);
      if (body.op === 'skip') {
        const { data: up, error: e2 } = await admin.from('ai_ad_posts').update({ status: 'skipped', error: null }).eq('id', row.id).eq('status', 'draft').select('id');
        if (e2) throw e2;
        return up && up.length ? json({ ok: true, status: 'skipped' }, 200) : json({ error: 'Bu qoralama allaqachon koʻrib chiqilgan', code: 'NOT_DRAFT' }, 409);
      }
      const who = String((auth.staff && auth.staff.name) || 'Admin').slice(0, 80);
      const locked = await AU.lockRow(admin, row, 'draft', { meta: { ...(row.meta || {}), approvedBy: who, at: new Date().toISOString() } });
      if (!locked) return json({ error: 'Bu qoralama allaqachon koʻrib chiqilgan', code: 'NOT_DRAFT' }, 409);
      const L = await AA.loadBranch(admin, filial);
      if (!L.shopOn) { await admin.from('ai_ad_posts').update({ status: 'failed', error: "Onlayn-do'kon yoqilmagan" }).eq('id', row.id); return json({ error: "Bu filialda onlayn-do'kon yoqilmagan", code: 'SHOP_OFF' }, 409); }
      const r = await AU.sendAutophoto({ admin, L, filial, settings, row: locked, left, fetchImpl: exports._fetch });
      return r.ok ? json({ ok: true, status: 'sent', url: r.url }, 200) : json({ ok: false, code: r.code, error: r.error, id: row.id }, r.code === 'SEND_FAILED' || r.code === 'CHANNEL' ? 502 : 409);
    }

    if (body.action === 'history') {
      const { data, error } = await admin.from('ai_ad_posts').select('id,product_id,format,template,status,error,tries,source,created_by,created_at,sent_at,tg_chat,tg_message_id,meta,idem_key')
        .eq('branch_id', filial).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return json({ ok: true, items: (data || []).map((r) => ({ id: r.id, pid: Number(r.product_id), format: r.format, template: r.template, status: r.status, error: r.error, tries: r.tries,
        source: r.source, by: r.created_by, at: r.created_at, sentAt: r.sent_at, url: AP.messageUrl(r.tg_chat, r.tg_message_id),
        name: r.meta && r.meta.name, title: r.meta && r.meta.title, body: r.meta && r.meta.body, tags: (r.meta && r.meta.tags) || [], reason: r.meta && r.meta.reason,
        idemKey: r.status === 'failed' && (r.format === 'photo' || r.format === 'autophoto') ? r.idem_key : undefined })) }, 200);   // foto — o'sha kalit bilan qayta yuboriladi
    }

    if (body.action === 'tg_check') {
      const L = await AA.loadBranch(admin, filial), st = L.settings || {};
      const token = String(st.tgBotToken || '').trim(), chat = AA.channelOf(settings, st);
      if (!TOKEN_RE.test(token)) return json({ ok: false, code: 'NO_BOT', error: 'Hisobot boti ulanmagan — Sozlamalar → Telegram' }, 200);
      if (!chat) return json({ ok: false, code: 'NO_CHANNEL', error: 'Reklama kanali koʻrsatilmagan' }, 200);
      const c = await AP.checkChannel(token, chat, Math.min(7000, left()), exports._fetch);
      return json({ ok: c.ok, channel: chat, error: c.error || null }, 200);
    }

    if (body.action === 'upload_url') {
      if (!IDEM_RE.test(String(body.idemKey || ''))) return json({ error: "So'rov kaliti noto'g'ri" }, 400);
      const bucket = admin.storage.from(BUCKET), dir = String(filial).replace(/[^A-Za-z0-9_-]/g, '_'), path = `${dir}/${body.idemKey}.mp4`;
      // filialning 1 soatdan eski, yuborilmay qolgan videolari — o'chiriladi (doimiy saqlanmaydi)
      try { const { data: old } = await bucket.list(dir, { limit: 100 });
        const stale = (old || []).filter((f) => f && f.name && Date.parse(f.created_at || 0) < Date.now() - 3600000).map((f) => `${dir}/${f.name}`);
        if (stale.length) await bucket.remove(stale); } catch (_) { /* tozalash — majburiy emas */ }
      const { data, error } = await bucket.createSignedUploadUrl(path, { upsert: true });
      if (error || !data || !data.signedUrl) throw (error || new Error('signed upload url'));
      return json({ ok: true, path, signedUrl: data.signedUrl }, 200);
    }

    if (body.action === 'publish') return await publish(admin, auth, filial, settings, body, left);

    if (body.action === 'text' || body.action === 'img' || body.action === 'product') {
      if (!(Number.isSafeInteger(body.pid) && body.pid > 0)) return json({ error: "Mahsulot noto'g'ri" }, 400);
      const L = await AA.loadBranch(admin, filial);
      if (!L.shopOn) return json({ error: "Bu filialda onlayn-do'kon yoqilmagan", code: 'SHOP_OFF' }, 409);
      const p = (L.data.products || []).find((x) => x && Number(x.id) === body.pid);
      // faqat vitrinada ko'rinadigan va «Reklama qilmaslik» belgisi yo'q mahsulot
      const pub = p && !p.noAds ? SP.publicProduct(p, SP.catalogCtx(L.data, filial, L.view)) : null;
      if (!pub) return json({ error: "Mahsulot reklama uchun mos emas (vitrinada yo'q yoki «Reklama qilmaslik» belgilangan)", code: 'NOT_ELIGIBLE' }, 404);
      if (body.action === 'product') {
        const ctx = SP.catalogCtx(L.data, filial, L.view);
        return json({ ok: true, item: { pid: body.pid, name: pub.name, cat: pub.cat, img: (pub.img || []).slice(0, 4), stock: pub.stock, cur: ctx.cur,
          line: AA.priceLine(pub.price, ctx.cur), oldLine: pub.old ? AA.priceLine(pub.old, ctx.cur) : '', pct: pub.old > pub.price ? Math.round((1 - pub.price / pub.old) * 100) : 0 } }, 200);
      }
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
// ── Kanalga yuborish ──
async function publish(admin, auth, filial, settings, body, left) {
  const fail = (code, error, status = 409, extra) => json({ ok: false, code, error, ...(extra || {}) }, status);
  const fmt = body.format === 'video' ? 'video' : body.format === 'photo' ? 'photo' : null;
  if (!fmt) return fail('BAD', "Format noto'g'ri", 400);
  if (!(Number.isSafeInteger(body.pid) && body.pid > 0)) return fail('BAD', "Mahsulot noto'g'ri", 400);
  const idem = String(body.idemKey || '');
  if (!IDEM_RE.test(idem)) return fail('BAD', "So'rov kaliti noto'g'ri", 400);
  const template = TEMPLATES.includes(body.template) ? body.template : null;
  if (!template) return fail('BAD', "Shablon noto'g'ri", 400);
  const dir = String(filial).replace(/[^A-Za-z0-9_-]/g, '_'), videoPath = `${dir}/${idem}.mp4`;
  let photo = null;
  if (fmt === 'photo') {
    const b64 = String(body.photo || '').replace(/^data:image\/jpeg;base64,/, '');
    if (!b64 || b64.length > Math.ceil(PHOTO_MAX * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+=*$/.test(b64)) return fail('BAD', 'Rasm yoʻq yoki 300 KB dan katta', 400);
    photo = Buffer.from(b64, 'base64');
    if (!(photo[0] === 0xff && photo[1] === 0xd8 && photo[2] === 0xff)) return fail('BAD', 'Rasm JPEG emas', 400);
  } else if (body.videoPath !== videoPath) return fail('BAD', "Video yo'li noto'g'ri", 400);
  const text = AP.cleanUserText(body.text || {});
  if (!text.title && !text.body) return fail('BAD', 'Post matni boʻsh', 400);

  // Narx va qoldiq — QAYTA, serverda (rasm chizilgandan keyin o'zgargan bo'lishi mumkin)
  const L = await AA.loadBranch(admin, filial), st = L.settings || {};
  if (!L.shopOn) return fail('SHOP_OFF', "Bu filialda onlayn-do'kon yoqilmagan");
  const p = (L.data.products || []).find((x) => x && Number(x.id) === body.pid);
  const ctx = SP.catalogCtx(L.data, filial, L.view);
  const pub = p && !p.noAds ? SP.publicProduct(p, ctx) : null;
  if (!pub) return fail('NOT_ELIGIBLE', "Mahsulot reklama uchun mos emas (vitrinada yo'q yoki «Reklama qilmaslik» belgilangan)", 404);
  if (!(pub.stock > 0)) return fail('OUT_OF_STOCK', 'Mahsulot omborda qolmagan — post yuborilmadi');
  const price = { line: AA.priceLine(pub.price, ctx.cur), oldLine: pub.old ? AA.priceLine(pub.old, ctx.cur) : '', pct: pub.old > pub.price ? Math.round((1 - pub.price / pub.old) * 100) : 0, cur: ctx.cur };
  if (String(body.priceLine || '') !== price.line || String(body.oldLine || '') !== price.oldLine)
    return fail('PRICE_CHANGED', 'Narx oʻzgargan — rasm yangi narx bilan qayta chiziladi', 409, { price });
  const token = String(st.tgBotToken || '').trim(), chat = AA.channelOf(settings, st);
  if (!TOKEN_RE.test(token)) return fail('NO_BOT', 'Hisobot boti ulanmagan — Sozlamalar → Telegram');
  if (!chat) return fail('NO_CHANNEL', 'Reklama kanali koʻrsatilmagan — AI-reklama → Sozlamalar');
  const caption = AP.buildCaption(text, price, settings.lang, (L.shop && L.shop.settings && L.shop.settings.name) || AP.DEFAULT_BRAND);   // izohda: «Powerful»
  const meta = { at: new Date().toISOString(), name: String(pub.name || '').slice(0, 140), title: text.title, body: text.body.slice(0, 700), tags: text.tags, reason: ['discount', 'new', 'top', 'stuck'].includes(body.reason) ? body.reason : null, lang: settings.lang };

  // Takror yo'q: (filial, kalit) — bitta post. Yuborilgan — qayta yuborilmaydi; xato/qotgan — qayta urinish
  const who = String((auth.staff && auth.staff.name) || 'Admin').slice(0, 80);
  const done = (row, dup) => json({ ok: true, duplicate: !!dup, id: row.id, url: AP.messageUrl(row.tg_chat, row.tg_message_id) }, 200);
  let row = null;
  for (let attempt = 0; attempt < 2 && !row; attempt++) {
    const { data: ex, error: e1 } = await admin.from('ai_ad_posts').select('*').eq('branch_id', filial).eq('idem_key', idem).maybeSingle();
    if (e1) throw e1;
    if (ex) {
      if (Number(ex.product_id) !== body.pid) return fail('BAD', "So'rov kaliti boshqa mahsulotga tegishli", 400);
      if (ex.status === 'sent') return done(ex, true);
      if (ex.status === 'sending' && Date.now() - Date.parse((ex.meta && ex.meta.at) || ex.created_at) < SENDING_STALE_MS) return fail('IN_PROGRESS', 'Bu post hozir yuborilmoqda');
      const { data: up, error: e2 } = await admin.from('ai_ad_posts').update({ status: 'sending', tries: (ex.tries || 0) + 1, error: null, caption, price_snapshot: price, meta: { ...meta, ...(ex.source === 'autopilot' ? { slot: ex.meta && ex.meta.slot, fromDraft: true } : {}) }, template, tg_chat: chat, format: fmt })
        .eq('id', ex.id).eq('status', ex.status).select('*');
      if (e2) throw e2;
      if (!up || !up.length) return fail('IN_PROGRESS', 'Bu post hozir yuborilmoqda');
      row = up[0];
    } else {
      const { data: ins, error: e3 } = await admin.from('ai_ad_posts').insert({ branch_id: filial, product_id: body.pid, format: fmt, template, caption, price_snapshot: price, status: 'sending',
        source: 'manual', tg_chat: chat, tries: 1, created_by: who, idem_key: idem, meta }).select('*');
      if (e3 && e3.code !== '23505') throw e3;
      if (!e3) row = ins && ins[0];
    }
  }
  if (!row) return fail('IN_PROGRESS', 'Bu post hozir yuborilmoqda');
  const finish = async (ok, r) => {
    const patch = ok ? { status: 'sent', sent_at: new Date().toISOString(), tg_message_id: r.result && r.result.message_id || null, error: null }
      : { status: 'failed', error: String(r).slice(0, 500) };
    await admin.from('ai_ad_posts').update(patch).eq('id', row.id);
    return ok ? done({ ...row, ...patch }) : fail('SEND_FAILED', patch.error, 502, { id: row.id });
  };

  const chk = await AP.checkChannel(token, chat, Math.min(3500, left() - 4000), exports._fetch);
  if (!chk.ok) return finish(false, chk.error);
  const link = AP.productLink(L.shop, body.pid);
  const markup = link ? { inline_keyboard: [[{ text: settings.lang === 'ru' ? '🛒 Заказать' : '🛒 Buyurtma berish', url: link }]] } : null;
  let r;
  if (fmt === 'photo') {
    const fd = new FormData();
    fd.append('chat_id', chat); fd.append('caption', caption); fd.append('parse_mode', 'HTML');
    if (markup) fd.append('reply_markup', JSON.stringify(markup));
    fd.append('photo', new Blob([photo], { type: 'image/jpeg' }), `reklama-${body.pid}.jpg`);
    r = await AP.tgCall(token, 'sendPhoto', fd, Math.min(7000, left() - 300), exports._fetch);
  } else {
    const bucket = admin.storage.from(BUCKET);
    try {
      const { data: su, error: se } = await bucket.createSignedUrl(videoPath, 300);
      if (se || !su || !su.signedUrl) return finish(false, 'Video topilmadi — qayta yuklab koʻring');
      r = await AP.tgCall(token, 'sendVideo', { chat_id: chat, video: su.signedUrl, caption, parse_mode: 'HTML', supports_streaming: true, width: 720, height: 1280,
        ...(Number.isInteger(body.dur) && body.dur > 0 && body.dur <= 60 ? { duration: body.dur } : {}), ...(markup ? { reply_markup: markup } : {}) }, Math.min(7000, left() - 300), exports._fetch);
    } finally { try { await bucket.remove([videoPath]); } catch (_) { /* keyingi upload_url tozalaydi */ } }   // video doimiy saqlanmaydi
  }
  if (r && r.ok) return finish(true, r);
  return finish(false, r && r.timeout ? 'Telegram javob bermadi — kanalni tekshiring (post chiqqan boʻlishi mumkin), keyin qayta yuboring' : AP.tgErr(r, token));
}

exports._safeImgUrl = safeImgUrl;
exports.handler = require('./_lib/monitor').wrap(ENDPOINT, exports.handler);
