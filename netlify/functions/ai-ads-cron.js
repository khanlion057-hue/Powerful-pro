// Netlify Function — v25.8: AI-REKLAMA AVTOPILOTI — JADVAL BO'YICHA (netlify.toml: har soatda :20). 58-migratsiya.
//   • Filial sozlamasidagi soatlarda (Toshkent) — bitta post: «tasdiqlash bilan» (sukut) — qoralama + egasi guruhiga xabar;
//     «to'liq avtomat» — darhol kanalga (mahsulotning o'z rasmi bilan; serverda render yo'q).
//   • 24 soatda tasdiqlanmagan qoralama — 'expired'; avtopilot posti xato bersa — keyingi soatda 1 marta qayta, keyin egasiga xabar.
//   • Vaqtinchalik videolar (ai-ads-tmp) — 1 soatdan eskisi o'chiriladi.
// Faqat jadval chaqiruvi (boshqa so'rov — 404). Natija — faqat qisqa hisob (maxfiy ma'lumot yo'q). Netlify 10 s: 9 s byudjet.
'use strict';
const { getAdminClient, json, serverError } = require('./_lib/supabaseAdmin');
const { isScheduledEvent } = require('./_lib/scheduledGuard');
const { tashkentNow } = require('./_lib/dailyReport');
const AU = require('./_lib/aiAutopilot');

const ENDPOINT = 'ai-ads-cron';
const BUDGET_MS = 9000;
const missing58 = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /ai_ad_|ai_usage/.test(String(e.message || '')) && /does not exist|could not find|schema cache/i.test(String(e.message || '')));

exports.handler = async (event) => {
  if (!isScheduledEvent(event)) return json({ error: 'Not found' }, 404);
  const t0 = Date.now(), left = () => BUDGET_MS - (Date.now() - t0);
  let admin;
  try { admin = getAdminClient(); } catch (e) { return serverError(e, ENDPOINT, 'Server sozlanmagan'); }
  const nowMs = exports._now ? exports._now() : Date.now();
  try {
    const out = await AU.runAutopilot(admin, { now: tashkentNow(new Date(nowMs)), nowMs, left, env: process.env, fetchImpl: exports._fetch });
    let tmp = 0;
    if (left() > 1500) { try { tmp = await AU.cleanupTmp(admin, nowMs); } catch (e) { console.warn('[' + ENDPOINT + '] tmp', e && e.message); } }
    return json({ ok: true, expired: out.expired, retried: out.retried ? { ok: out.retried.ok } : null,
      created: out.created.map((x) => ({ mode: x.mode, ok: x.ok, notified: x.notified })), skipped: out.skipped.map((x) => x.why), tmpRemoved: tmp }, 200);
  } catch (e) {
    if (missing58(e)) return json({ ok: true, skipped: 'migration58' }, 200);   // 58 qo'llanmagan — jim
    return serverError(e, ENDPOINT, 'AI-reklama avtopiloti: server xatosi');
  }
};

// v25.2: kuzatuv — xato va sekinlik haqida egasiga xabar (_lib/monitor.js; jadval chaqiruvi cheklanmaydi)
exports.handler = require('./_lib/monitor').wrap(ENDPOINT, exports.handler);
