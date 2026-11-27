// v25.8 — AI-REKLAMA: MATN (AI ixtiyoriy). Bitta adapter; provayder — shu fayldagi PROVIDERS jadvalida.
// Env: AI_PROVIDER (sukut 'gemini'), AI_API_KEY, AI_MODEL (masalan eng arzon Flash modeli — nomi env'da), AI_MONTHLY_LIMIT (sukut 300).
// Kalit yoki model yo'q — AI'siz (shablon) rejim: to'liq ishlaydi.
//
// MAXFIYLIK (egasi qarori): bepul tarifda provayder ma'lumotni o'qishi mumkin — shuning uchun AI'ga FAQAT mahsulot nomi,
// kategoriya, qisqa tavsif va post turi boradi (safeInput). Narx, mijoz, ta'minotchi, tannarx, telefon, manzil, filial nomi —
// HECH QACHON. Tavsif va nomdan ham telefon/narx/havola/email/@nom tozalanadi.
// AI javobi: qat'iy JSON {title ≤40, body 2–3 qator, tags 3–5}; raqam yoki narxga o'xshash satr o'chiriladi; yaroqsiz — shablon.
// Oylik limit — butun tizim uchun bitta, bazada atomik (ai_usage_take); AI xato bersa — hisobdan chiqmaydi (ai_usage_release).
'use strict';
const { buildPrompt } = require('./aiPrompts');
const { pickTemplate, KINDS } = require('./adTemplates');

const TIMEOUT_MS = 7000;   // Netlify 10 s da uzadi — tashqi so'rov 7 s dan oshmaydi

// ── Provayderlar (yangisini qo'shish — shu jadvalga bitta yozuv) ──
const PROVIDERS = {
  gemini: {
    url: (model) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    headers: (key) => ({ 'Content-Type': 'application/json', 'x-goog-api-key': key }),   // kalit URL'da emas (loglarga tushmasin)
    body: (p) => ({ systemInstruction: { parts: [{ text: p.system }] }, contents: [{ role: 'user', parts: [{ text: p.user }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.8, maxOutputTokens: 400 } }),
    text: (j) => ((j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map((x) => x && x.text || '').join(''),
  },
};

function aiConfig(env = process.env) {
  const key = String(env.AI_API_KEY || '').trim(), model = String(env.AI_MODEL || '').trim();
  const provider = String(env.AI_PROVIDER || 'gemini').trim().toLowerCase();
  const lim = Number(env.AI_MONTHLY_LIMIT);
  const limit = Number.isInteger(lim) && lim >= 0 ? lim : 300;
  const on = key.length >= 10 && /^[A-Za-z0-9._:-]{1,80}$/.test(model) && !!PROVIDERS[provider];
  const why = on ? null : !PROVIDERS[provider] ? 'provayder noma\'lum' : key.length < 10 ? 'kalit kiritilmagan' : 'model kiritilmagan';
  return { on, provider, model, key, limit, why };
}

// ── Kirish: faqat ruxsat etilgan maydonlar, tozalangan ──
const PHONE_RE = /\+?\d(?:[ ().-]?\d){8,14}/g;   // telefon: 9+ raqam, orasida ko'pi bilan bitta ajratuvchi (90 777 66 55, +998901234567)
const NUM = "\\d{1,3}(?:[ .,'’]?\\d{3})*(?:[.,]\\d+)?";   // 987 654 / 1,250.50 / 12.5
const PRICE_RE = new RegExp(NUM + "\\s?(?:so['ʻ‘’`]?m|сум|sum|uzs|usd|y\\.?e\\.?|у\\.?е\\.?|€|₽|\\$|%)", 'gi');
const MONEY_SIGN_RE = new RegExp("[$€₽]\\s?" + NUM, 'g');   // $12.5 — keyingi alohida raqam (1800W) tegmaydi
const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+|\bt\.me\/\S+/gi;
const EMAIL_RE = /\S+@\S+\.\S+/g;
const HANDLE_RE = /(^|\s)@[A-Za-z0-9_]{3,}/g;
function scrub(s, n) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ')
    .replace(URL_RE, ' ').replace(EMAIL_RE, ' ').replace(HANDLE_RE, ' ').replace(PRICE_RE, ' ').replace(MONEY_SIGN_RE, ' ').replace(PHONE_RE, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, n);
}
// AI'ga boradigan YAGONA obyekt: { name, cat, desc, kind, lang } — boshqa maydon qo'shilmaydi
function safeInput(p, kind, lang) {
  return { name: scrub(p && p.name, 140), cat: scrub(p && p.cat, 60), desc: scrub(p && p.desc, 300),
    kind: KINDS.includes(kind) ? kind : 'new', lang: lang === 'ru' ? 'ru' : 'uz' };
}

// ── Chiqish: qat'iy JSON va tozalash ──
const BAD_LINE_RE = /\d|so['ʻ‘’`]?m\b|сум|\buzs\b|\busd\b|[$€₽%]|\+998|bepul|бесплатн|telefon|телефон|manzil|адрес/i;
const CYR_RE = /[Ѐ-ӿ]/;
function parseJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { const j = JSON.parse(t); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; } catch (_) { return null; }
}
// null — yaroqsiz (shablonga tushiladi)
function cleanOutput(j, lang) {
  if (!j || typeof j.title !== 'string' || typeof j.body !== 'string' || !Array.isArray(j.tags)) return null;
  const norm = (s) => String(s).replace(/[\u0000-\u0009\u000b-\u001f<>*_`#]/g, '').replace(/[ \t]+/g, ' ').trim();
  const title = norm(j.title).replace(/\n/g, ' ');
  if (!title || title.length > 40 || BAD_LINE_RE.test(title)) return null;
  const lines = norm(j.body).split(/\n+/).map((l) => l.trim()).filter(Boolean).filter((l) => !BAD_LINE_RE.test(l)).map((l) => l.slice(0, 160)).slice(0, 3);
  if (!lines.length) return null;
  const tags = [...new Set(j.tags.map((t) => String(t || '').toLowerCase().replace(/^#+/, '').replace(/[^\p{L}_]/gu, '')).filter((t) => t.length >= 2 && t.length <= 30 && !BAD_LINE_RE.test(t)))].slice(0, 5);
  const all = [title, ...lines, ...tags].join(' ');
  if (lang !== 'ru' && CYR_RE.test(all)) return null;   // o'zbekcha — faqat lotin
  return { title, body: lines.join('\n'), tags };
}

async function callProvider(cfg, prompt, fetchImpl, timeoutMs) {
  const P = PROVIDERS[cfg.provider];
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await (fetchImpl || fetch)(P.url(cfg.model), { method: 'POST', headers: P.headers(cfg.key), body: JSON.stringify(P.body(prompt)), signal: ctrl.signal });
    if (!r.ok) return { ok: false, error: 'AI javobi ' + r.status };
    const j = await r.json().catch(() => null);
    return { ok: true, text: P.text(j) };
  } catch (e) {
    return { ok: false, error: e && e.name === 'AbortError' ? 'AI javob bermadi (vaqt tugadi)' : 'AI tarmoq xatosi' };
  } finally { clearTimeout(t); }
}

const monthOf = (now) => new Date(now + 5 * 3600000).toISOString().slice(0, 7);   // Toshkent oyi

// Matn yaratish. Natija: { title, body, tags, source: 'ai'|'template', note, variant, ai: { on, used, limit, exhausted } }
// opts: { admin, product:{name,cat,desc}, pid, kind, lang, variant, template (majburan shablon), env, fetchImpl, now, timeoutMs }
async function generateText(opts) {
  const now = opts.now || Date.now(), cfg = aiConfig(opts.env || process.env);
  const input = safeInput(opts.product, opts.kind, opts.lang);
  const tpl = () => pickTemplate({ lang: input.lang, kind: input.kind, name: input.name, cat: input.cat, pid: opts.pid, variant: opts.variant, now });
  const ai = { on: cfg.on, used: null, limit: cfg.limit, exhausted: false };
  const asTemplate = (note) => ({ ...tpl(), source: 'template', note, ai });
  if (opts.template) return asTemplate(null);
  if (!cfg.on) return asTemplate(null);
  const month = monthOf(now);
  const take = await opts.admin.rpc('ai_usage_take', { p_month: month, p_limit: cfg.limit });
  if (take.error) return asTemplate('AI hisoblagichi ishlamadi — shablon matn');
  ai.used = Number(take.data && take.data.count) || 0;
  if (!(take.data && take.data.ok)) { ai.exhausted = true; return asTemplate('AI limiti tugadi — shablon matn'); }
  const res = await callProvider(cfg, buildPrompt(input), opts.fetchImpl, opts.timeoutMs || TIMEOUT_MS);
  const out = res.ok ? cleanOutput(parseJson(res.text), input.lang) : null;
  if (!out) {
    const rel = await opts.admin.rpc('ai_usage_release', { p_month: month });   // xato — hisobdan chiqmaydi
    if (!rel.error) ai.used = Number(rel.data && rel.data.count) || 0;
    return asTemplate(res.ok ? 'AI javobi yaroqsiz — shablon matn' : (res.error || 'AI xatosi') + ' — shablon matn');
  }
  return { ...out, source: 'ai', note: null, variant: null, ai };
}

// Faqat shablon matn (AI chaqirilmaydi, limit sarflanmaydi) — «Boshqa variant» ro'yxati uchun
function templateText(opts) {
  const input = safeInput(opts.product, opts.kind, opts.lang);
  return pickTemplate({ lang: input.lang, kind: input.kind, name: input.name, cat: input.cat, pid: opts.pid, variant: opts.variant, now: opts.now || Date.now() });
}

module.exports = { templateText, PROVIDERS, TIMEOUT_MS, aiConfig, safeInput, scrub, parseJson, cleanOutput, generateText, monthOf };
