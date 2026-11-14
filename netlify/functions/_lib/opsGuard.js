// v25.2 — YUKLAMA VA NAZORAT (48-migratsiya): so'rovlar cheklovi, xatolar jurnali, Telegram ogohlantirishi, Telegram navbati.
//
// Asosiy qoida: bu modul HECH QACHON asosiy ishni buzmaydi — har bir murojaat qisqa vaqt chegarasi bilan,
// xato bo'lsa jim o'tkazib yuboriladi (fail-open). 48-migratsiya qo'llanmagan bo'lsa ham hammasi avvalgidek ishlaydi.
//
// Faqat Netlify'da (AWS_LAMBDA_FUNCTION_NAME bor) yoki FW_OPS_ON=1 bo'lganda yoqiladi — lokal testlar bazaga bormaydi.
// FW_OPS_ON=0 — butunlay o'chirish (favqulodda holat uchun, Netlify muhit o'zgaruvchisi).
'use strict';
const { getAdminClient } = require('./supabaseAdmin');
const { TOKEN_RE, CHAT_RE, tgSend } = require('./dailyReportRun');

function opsOn() {
  if (process.env.FW_OPS_ON === '0') return false;
  return process.env.FW_OPS_ON === '1' || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
}

// Va'dani ms ichida kutadi; ulgurmasa — fallback (asosiy javob kechikmasin)
function within(promise, ms, fallback) {
  let t;
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise((r) => { t = setTimeout(() => r(fallback), ms); }),
  ]).finally(() => clearTimeout(t));
}

function clientIp(event) {
  const h = (event && event.headers) || {};
  const v = h['x-nf-client-connection-ip'] || h['client-ip'] || String(h['x-forwarded-for'] || '').split(',')[0];
  const ip = String(v || '').trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : '';
}

// { ok, first } — ok: ruxsat; first: chegaradan endi oshdi (jurnalga bir marta). Baza javob bermasa — ruxsat (fail-open).
async function rateHit(admin, key, limit, windowSec) {
  const r = await within(admin.rpc('ops_rate_hit', { p_key: key, p_limit: limit, p_window_s: windowSec }), 700, null);
  if (!r || r.error || typeof r.data !== 'number') return { ok: true, first: false };
  return { ok: r.data <= limit, first: r.data === limit + 1 };
}

let _settingsCache = null;
async function opsSettings(admin) {
  if (_settingsCache && Date.now() - _settingsCache.at < 60000) return _settingsCache.st;
  const r = await within(admin.from('app_data').select('data').eq('id', 'main').maybeSingle(), 1500, null);
  const st = (r && r.data && r.data.data && r.data.data.settings) || {};
  _settingsCache = { at: Date.now(), st };
  return st;
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Hodisani jurnalga yozadi; oynada birinchi bo'lsa — egasiga Telegram (tgOpsChatId, bo'lmasa tgChatId).
// kind: error | slow | client | rate | tg.  Hech qachon xato tashlamaydi.
async function report(admin, { kind, fn, key, title, detail, windowSec = 600 }) {
  try {
    const r = await within(admin.rpc('ops_alert', { p_key: key, p_kind: kind, p_fn: fn || '', p_msg: String(detail || title || '').slice(0, 500), p_window_s: windowSec }), 1200, null);
    if (!r || r.error) return false;
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    if (!row || !row.send) return false;
    const st = await opsSettings(admin);
    const chat = CHAT_RE.test(String(st.tgOpsChatId || '')) ? String(st.tgOpsChatId) : String(st.tgChatId || '');
    if (!TOKEN_RE.test(String(st.tgBotToken || '')) || !CHAT_RE.test(chat)) return false;
    const icon = kind === 'slow' ? '🐢' : kind === 'client' ? '📱' : kind === 'tg' ? '📨' : kind === 'rate' ? '🚧' : '🔴';
    const extra = row.suppressed > 0 ? `\n<i>Oxirgi ogohlantirishdan beri yana ${row.suppressed} marta takrorlandi</i>` : '';
    const text = `${icon} <b>${esc(title)}</b>\n<code>${esc(fn || '')}</code>\n${esc(String(detail || '').slice(0, 600))}${extra}`;
    const s = await within(tgSend(st.tgBotToken, chat, text), 3000, { ok: false });
    return !!(s && s.ok);
  } catch (_) { return false; }
}

// ── Telegram navbati ──
// Telegram'ning vaqtinchalik xatolari (tarmoq, 429, 5xx) — qayta urinsa bo'ladi; 400/403 (chat yo'q, bot bloklangan) — yo'q
const RETRYABLE = (d) => !d || /timeout|network|abort|fetch|too many|retry|bad gateway|internal|unavailable|429|5\d\d/i.test(String(d));
async function enqueue(admin, chat, text, kind, lastError) {
  if (!admin) return false;
  const r = await within(admin.from('tg_outbox').insert({ chat: String(chat).slice(0, 40), text: String(text).slice(0, 4096), kind: kind || null, last_error: lastError ? String(lastError).slice(0, 200) : null }), 1500, null);
  return !!(r && !r.error);
}
// Navbatdagi xabarlarni yuborish (soatlik ishda). Har urinishdan keyin keyingisi uzoqroq: 10, 20, 40, 80 daqiqa; 5 tadan keyin — failed.
async function flushOutbox(admin, token, { max = 25 } = {}) {
  const out = { sent: 0, failed: 0, retry: 0 };
  if (!TOKEN_RE.test(String(token || ''))) return out;
  const { data: rows, error } = await admin.from('tg_outbox').select('id,chat,text,kind,tries')
    .eq('status', 'pending').lte('next_at', new Date().toISOString()).order('id', { ascending: true }).limit(max);
  if (error || !rows) return out;
  for (const m of rows) {
    const r = await within(tgSend(token, m.chat, m.text), 9000, { ok: false, description: 'timeout' });
    if (r && r.ok) { await admin.from('tg_outbox').update({ status: 'sent', tries: m.tries + 1 }).eq('id', m.id); out.sent++; continue; }
    const tries = m.tries + 1, desc = String((r && r.description) || 'xato').slice(0, 200);
    const dead = tries >= 5 || !RETRYABLE(desc);
    await admin.from('tg_outbox').update({ tries, last_error: desc, status: dead ? 'failed' : 'pending',
      next_at: new Date(Date.now() + 10 * 60000 * 2 ** (tries - 1)).toISOString() }).eq('id', m.id);
    if (dead) out.failed++; else out.retry++;
    await new Promise((res) => setTimeout(res, 40));   // Telegram: soniyasiga 30 tadan oshmasin
  }
  return out;
}

const MB = 1024 * 1024;
// Kunlik «Tizim holati» xabari (bepul tarif chegaralari: Supabase baza 500 MB, fayllar 1 GB)
async function usageText(admin) {
  const r = await within(admin.rpc('ops_usage'), 3000, null);
  if (!r || r.error || !r.data) return null;
  const u = r.data, pct = (v, lim) => (v == null ? '—' : `${Math.round(v / MB)} MB / ${Math.round(lim / MB)} MB (${Math.round((v / lim) * 100)}%)`);
  const warn = (u.db_bytes > 400 * MB || (u.storage_bytes || 0) > 800 * MB) ? '\n⚠️ <b>Chegaraga yaqin — tozalash yoki tarifni oshirish kerak</b>' : '';
  return ['🖥 <b>Tizim holati</b> (bepul tarif)',
    `Baza: ${pct(u.db_bytes, 500 * MB)}`,
    `Rasmlar: ${pct(u.storage_bytes, 1024 * MB)}`,
    `Xatolar (24 soat): ${u.errors_24h} · sekin javob: ${u.slow_24h} · cheklangan so'rov: ${u.rate_24h}`,
    `Telegram navbati: kutmoqda ${u.outbox_pending}, yuborilmadi ${u.outbox_failed_24h}`].join('\n') + warn;
}

module.exports = { opsOn, within, clientIp, rateHit, report, enqueue, flushOutbox, usageText, RETRYABLE, getAdminClient };
