// v25.2 — HAR FUNKSIYA UCHUN KUZATUVCHI (48-migratsiya). Har bir funksiya faylining oxirida:
//   exports.handler = require('./_lib/monitor').wrap('<nomi>', exports.handler);
//
// Nima qiladi (faqat Netlify'da; lokal testlarda — o'zgarishsiz o'tkazadi, qarang opsGuard.opsOn):
//  1) So'rovlar cheklovi — IP bo'yicha (bitta ofis = bitta IP bo'lishi mumkin, shuning uchun chegaralar keng).
//     Oshsa — 429 + Retry-After. Jadval (cron) chaqiruvlari cheklanmaydi.
//  2) Xato kuzatuvi — funksiya 500+ qaytarsa yoki kutilmagan xato tashlasa: jurnalga + egasiga Telegram
//     (bir xil xato — 10 daqiqada ko'pi bilan bitta xabar). Kutilmagan xato endi 502 emas, toza 500 JSON.
//  3) Sekin javob — 8 soniyadan uzoq (Netlify bepul tarifda 10 soniyada uzadi) — jurnalga + soatiga bitta xabar.
// Kuzatuvchi asosiy ishni hech qachon buzmaydi: o'z murojaatlari qisqa vaqt chegarasi bilan, xato bo'lsa jim.
'use strict';
const ops = require('./opsGuard');
const { json, serverError } = require('./supabaseAdmin');
const { isScheduledEvent } = require('./scheduledGuard');

// Oyna — 5 daqiqa (300 s). 20 xodim bitta ofis IP'sidan ishlasa ham bemalol yetadi (≈4 so'rov/soniya).
const LIMITS = {
  default: { scope: 'all', n: 1200, s: 300 },
  health: { scope: 'health', n: 30, s: 60 },             // ochiq; har chaqiruv bazaga boradi
  'staff-login': { scope: 'login', n: 40, s: 300 },     // login bo'yicha blok bor; bu — IP bo'yicha (ko'p loginni sinash)
  'staff-whoami': { scope: 'whoami', n: 150, s: 300 },
  'pw-reset': { scope: 'pwreset', n: 30, s: 300 },      // ichida soatlik IP chegarasi ham bor
  'client-error': { scope: 'cerr', n: 20, s: 300 },
};
const SLOW_MS = 8000;

function errText(res) {
  try { const b = JSON.parse(res.body || '{}'); return String(b.error || b.message || '').slice(0, 300); } catch (_) { return ''; }
}

function wrap(name, handler) {
  if (typeof handler !== 'function') throw new Error('monitor.wrap: handler yo\'q — ' + name);
  const lim = LIMITS[name] || LIMITS.default;
  const wrapped = async function (event, context) {
    if (!ops.opsOn()) return handler(event, context);
    let admin = null;
    const A = () => { if (!admin) admin = ops.getAdminClient(); return admin; };
    const scheduled = isScheduledEvent(event);

    // 1) So'rovlar cheklovi
    if (!scheduled && event && event.httpMethod !== 'OPTIONS') {
      const ip = ops.clientIp(event);
      if (ip) {
        try {
          const r = await ops.rateHit(A(), `${lim.scope}:${ip}`, lim.n, lim.s);
          if (!r.ok) {
            if (r.first) await ops.report(A(), { kind: 'rate', fn: name, key: `rate:${lim.scope}`, windowSec: 3600,
              title: "Juda ko'p so'rov — vaqtincha cheklandi", detail: `IP ${ip}: ${lim.s / 60} daqiqada ${lim.n} tadan ortiq (${lim.scope})` });
            const res = json({ error: "⏳ Juda ko'p so'rov — biroz kutib, qayta urining", code: 'RATE_LIMIT' }, 429);
            res.headers['Retry-After'] = String(lim.s);
            return res;
          }
        } catch (_) { /* fail-open */ }
      }
    }

    // 2–3) Asosiy ish + xato/sekinlik kuzatuvi
    const t0 = Date.now();
    let res, thrown = null;
    try { res = await handler(event, context); } catch (e) { thrown = e; }
    const ms = Date.now() - t0;
    try {
      if (thrown) {
        await ops.report(A(), { kind: 'error', fn: name, key: `err:${name}:throw`, title: 'Server xatosi (kutilmagan)',
          detail: String((thrown && (thrown.message || thrown)) || 'xato').slice(0, 400) });
      } else if (res && Number(res.statusCode) >= 500) {
        await ops.report(A(), { kind: 'error', fn: name, key: `err:${name}:${res.statusCode}`, title: `Server xatosi ${res.statusCode}`,
          detail: errText(res) || 'xabarsiz' });
      }
      if (ms > SLOW_MS) {
        await ops.report(A(), { kind: 'slow', fn: name, key: `slow:${name}`, windowSec: 3600, title: 'Sekin javob',
          detail: `${(ms / 1000).toFixed(1)} soniya (Netlify 10 soniyada uzadi)` });
      }
    } catch (_) { /* kuzatuv xatosi javobga ta'sir qilmaydi */ }
    if (thrown) return serverError(thrown, name);
    return res;
  };
  wrapped._fwMonitored = name;
  return wrapped;
}

module.exports = { wrap, LIMITS, SLOW_MS };
