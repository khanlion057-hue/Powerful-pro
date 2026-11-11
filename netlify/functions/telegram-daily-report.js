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
const { evtOn, chatsFor, dueList, dueByBranch, remindText, monthDealerReports, mapChat } = require('./_lib/tgEvents');

// v25.1: nasiya eslatmasi (har kuni, Toshkent soati tgRemindHour — standart 9), oy yakuni dillerlar hisoboti (oyning 1-kuni,
// o'tgan oy uchun) va filial guruhlariga kunlik hisobot (faqat o'z filiali). Har qabul qiluvchiga alohida kalit bilan
// BIR MARTA; Telegram xatosida kalit bo'shatiladi — keyingi soatda qayta urinadi.
// MAXFIYLIK: filial guruhi — faqat o'z filiali; diller guruhi — faqat o'zi; to'liq ro'yxat — faqat egasining guruhiga.
const remindHourOf = (st) => { const h = parseInt(st.tgRemindHour, 10); return h >= 6 && h <= 22 ? h : 9; };
async function onceSend(admin, scope, key, token, chat, texts) {
  const claim = await claimIdempotent(admin, key + ':' + chat, scope);
  if (!claim.claimed) return 'skip';
  try {
    for (const t of texts) { const r = await tgSend(token, chat, t); if (!r.ok) throw new Error('Telegram: ' + (r.description || 'xato')); }
    await completeIdempotent(admin, claim, { sent: texts.length, at: new Date().toISOString() });
    return 'sent';
  } catch (e) { await releaseIdempotent(admin, claim); console.error('[' + scope + ']', e.message); return 'error'; }
}
async function runEvents(admin, st, now) {
  if (!TOKEN_RE.test(String(st.tgBotToken || ''))) return;
  const tok = st.tgBotToken;
  let all = null; const data = async () => (all = all || (await loadAll(admin)).data);
  const ownBranch = (k) => mapChat(st.tgBranchChats, k);
  if (now.hour >= remindHourOf(st) && evtOn(st, 'remind')) {
    const list = dueList(await data(), now.date);
    if (list.length) {
      const sentTo = new Set();
      for (const c of chatsFor(st, 'remind', { own: false })) { sentTo.add(c); await onceSend(admin, 'tg-remind', now.date, tok, c, [remindText(st, list, now.date)]); }
      for (const [k, part] of Object.entries(dueByBranch(list))) {
        const c = ownBranch(k); if (!c || sentTo.has(c)) continue;
        await onceSend(admin, 'tg-remind', now.date, tok, c, [remindText(st, part, now.date)]);
      }
    }
  }
  if (now.hour >= remindHourOf(st) && now.date.slice(8, 10) === '01' && evtOn(st, 'month') && evtOn(st, 'dealer')) {
    const ym = new Date(Date.parse(now.date) - 864e5).toISOString().slice(0, 7);
    const rep = await monthDealerReports(admin, st, ym);
    const sentTo = new Set();
    if (rep.overview) for (const c of chatsFor(st, 'month', { own: false })) { sentTo.add(c); await onceSend(admin, 'tg-month-dealer', ym, tok, c, [rep.overview]); }
    for (const x of rep.perDealer) {
      const c = mapChat(st.tgDealerChatMap, x.dealerId); if (!c || sentTo.has(c)) continue;
      await onceSend(admin, 'tg-month-dealer', ym + ':' + x.dealerId, tok, c, [x.text]);
    }
  }
  // Filial guruhlariga kunlik hisobot — faqat o'z filiali bo'limi (Bosh kassa va dillerlar — faqat egasining hisobotida)
  if (st.tgDaily && now.hour >= hourOf(st) && st.tgBranchChats && typeof st.tgBranchChats === 'object') {
    const d = await data();
    for (const k of Object.keys(d.branchStore || {})) {
      const c = ownBranch(k); if (!c || c === String(st.tgChatId)) continue;
      const msgs = buildDailyReport({ ...d, branchStore: { [k]: d.branchStore[k] } }, now.date, {});
      await onceSend(admin, 'tg-daily-branch', now.date + ':' + k, tok, c, msgs);
    }
  }
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
