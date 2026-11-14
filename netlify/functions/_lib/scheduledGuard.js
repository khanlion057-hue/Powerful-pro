// HARDENING (taklif, production'ga qo'llanmagan): jadval (netlify.toml schedule) funksiyalari uchun himoya.
//  1) Faqat Netlify jadval chaqiruvi shakli: POST + JSON tanada `next_run` (satr). Boshqa har qanday so'rov — 404,
//     bazaga ham, Telegram'ga ham murojaat yo'q. Bu shakl soxtalashtirilishi mumkin — shuning uchun asosiy himoya 2-band.
//  2) Soatiga ko'pi bilan BITTA urinish (idempotency_keys: `<sana>:<soat>:<chat>`): Telegram xato bergan holatda ham
//     tashqi chaqiruvlar to'liq zaxira yasashni va Telegram so'rovini ko'paytira olmaydi (jadval baribir soatda bir ishlaydi).
const { claimIdempotent, scopedKey } = require('./idempotency');
function isScheduledEvent(event) {
  if (!event || event.httpMethod !== 'POST') return false;
  try { const b = JSON.parse(event.body || ''); return !!b && typeof b === 'object' && typeof b.next_run === 'string' && b.next_run.length <= 64; }
  catch (_) { return false; }
}
// true — bu soatda urinish mumkin; false — shu soatda allaqachon urinilgan (yoki tekshiruv ishlamadi — fail-closed)
async function claimHourlyAttempt(admin, scope, now, chat) {
  const c = await claimIdempotent(admin, `${now.date}:${now.hour}:${String(chat)}`, scope + '-attempt');
  return !!c.claimed;
}
// Bugun allaqachon muvaffaqiyatli bajarilganmi (asosiy kalit yakunlangan — response bor). Faqat o'qiydi.
async function alreadyDone(admin, scope, key) {
  const { data } = await admin.from('idempotency_keys').select('response').eq('idem_key', scopedKey(scope, key)).maybeSingle();
  return !!(data && data.response != null);
}
module.exports = { isScheduledEvent, claimHourlyAttempt, alreadyDone };
