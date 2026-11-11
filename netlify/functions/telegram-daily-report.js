// Netlify Function — KUNLIK HISOBOT TELEGRAM GURUHIGA (v23.9) — JADVAL BO'YICHA (netlify.toml: har soatda).
// Sozlamalar → Telegram bot: «Kunlik hisobot» yoqilgan bo'lsa, Toshkent vaqti bilan belgilangan soatdan keyin
// KUNIGA BIR MARTA yuboradi (idempotency_keys — ikkinchi nusxa yuborilmaydi; Telegram xatosida kalit bo'shatiladi
// va keyingi soatda qayta urinadi). Ma'lumot qaytarmaydi. Administratorning «ko'rish / hozir yuborish» — `telegram-report`.
// Bot tokeni faqat serverda (app_data.settings.tgBotToken).
const { getAdminClient, json, serverError } = require('./_lib/supabaseAdmin');
const { isScheduledEvent, claimHourlyAttempt, alreadyDone } = require('./_lib/scheduledGuard');
const { _isMissingRelation } = require('./_lib/cashAuthority');
const { claimIdempotent, completeIdempotent, releaseIdempotent } = require('./_lib/idempotency');
const { buildDailyReport, tashkentNow } = require('./_lib/dailyReport');
const { TOKEN_RE, CHAT_RE, hourOf, loadAll, dealerPayToday, tgSend } = require('./_lib/dailyReportRun');
const { evtOn, chatsFor, dueList, remindText, monthDealerText } = require('./_lib/tgEvents');

// v25.1: nasiya eslatmasi (har kuni, Toshkent soati tgRemindHour — standart 9) va oy yakuni dillerlar hisoboti (oyning 1-kuni,
// o'tgan oy uchun). Har biri kalit bilan BIR MARTA; Telegram xatosida kalit bo'shatiladi — keyingi soatda qayta urinadi.
const remindHourOf = (st) => { const h = parseInt(st.tgRemindHour, 10); return h >= 6 && h <= 22 ? h : 9; };
async function onceSend(admin, scope, key, st, kind, build) {
  const claim = await claimIdempotent(admin, key, scope);
  if (!claim.claimed) return 'skip';
  try {
    const text = await build();
    if (text) for (const c of chatsFor(st, kind)) { const r = await tgSend(st.tgBotToken, c, text); if (!r.ok) throw Object.assign(new Error('Telegram: ' + (r.description || 'xato')), { tg: true }); }
    await completeIdempotent(admin, claim, { sent: !!text, at: new Date().toISOString() });
    return text ? 'sent' : 'empty';
  } catch (e) { await releaseIdempotent(admin, claim); console.error('[' + scope + ']', e.message); return 'error'; }
}
async function runEvents(admin, st, now) {
  const out = {};
  if (!TOKEN_RE.test(String(st.tgBotToken || '')) || now.hour < remindHourOf(st)) return out;
  if (evtOn(st, 'remind') && chatsFor(st, 'remind').length) {
    out.remind = await onceSend(admin, 'tg-remind', now.date, st, 'remind', async () => {
      const { data } = await loadAll(admin); const list = dueList(data, now.date);
      return list.length ? remindText(st, list, now.date) : null; });
  }
  if (now.date.slice(8, 10) === '01' && evtOn(st, 'month') && evtOn(st, 'dealer') && chatsFor(st, 'month').length) {
    const d = new Date(Date.parse(now.date) - 864e5); const ym = d.toISOString().slice(0, 7);
    out.month = await onceSend(admin, 'tg-month-dealer', ym, st, 'month', () => monthDealerText(admin, st, ym));
  }
  return out;
}

exports.handler = async (event) => {
  // HARDENING: faqat jadval chaqiruvi (aks holda 404 — bazaga va Telegram'ga murojaat yo'q)
  if (!isScheduledEvent(event)) return json({ error: 'Not found' }, 404);
  let admin;
  try { admin = getAdminClient(); } catch (e) { return serverError(e, 'telegram-daily-report', 'Server sozlanmagan'); }
  const now = tashkentNow();
  try {
    // ── Jadval: vaqti kelgan bo'lsa — kuniga bir marta ──
    const { data: row } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
    const st = (row && row.data && row.data.settings) || {};
    try { await runEvents(admin, st, now); } catch (e) { if (!_isMissingRelation(e)) console.error('[telegram-events]', e && e.message); }
    if (!st.tgDaily) return json({ ok: true, skipped: 'off' }, 200);
    if (now.hour < hourOf(st)) return json({ ok: true, skipped: 'early' }, 200);
    if (!TOKEN_RE.test(String(st.tgBotToken || '')) || !CHAT_RE.test(String(st.tgChatId || ''))) return json({ ok: true, skipped: 'no-bot' }, 200);
    if (await alreadyDone(admin, 'tg-daily-report', `${now.date}:${String(st.tgChatId)}`)) return json({ ok: true, skipped: 'sent' }, 200);
    if (!(await claimHourlyAttempt(admin, 'tg-daily-report', now, st.tgChatId))) return json({ ok: true, skipped: 'retry-later' }, 200);
    const claim = await claimIdempotent(admin, `${now.date}:${String(st.tgChatId)}`, 'tg-daily-report');
    if (!claim.claimed) return json({ ok: true, skipped: claim.isDuplicate ? 'sent' : claim.inProgress ? 'busy' : 'claim' }, 200);
    try {
      const { data, extra } = await loadAll(admin);
      extra.dealerPay = await dealerPayToday(admin, now.date);
      const msgs = buildDailyReport(data, now.date, extra);
      for (const m of msgs) {
        const r = await tgSend(st.tgBotToken, st.tgChatId, m);
        if (!r.ok) throw Object.assign(new Error('Telegram: ' + (r.description || 'xato')), { tg: true });
      }
      await completeIdempotent(admin, claim, { sent: msgs.length, at: new Date().toISOString() });
      return json({ ok: true, sent: msgs.length }, 200);
    } catch (e) {
      await releaseIdempotent(admin, claim);   // keyingi soatda qayta urinadi
      if (e.tg) { console.error('[telegram-daily-report]', e.message); return json({ ok: false }, 200); }
      throw e;
    }
  } catch (e) {
    if (_isMissingRelation(e)) return json({ ok: false, skipped: 'schema' }, 200);
    return serverError(e, 'telegram-daily-report', 'Hisobot tayyorlanmadi');
  }
};
