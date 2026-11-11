// Netlify Function — KUNLIK HISOBOT: administrator «ko'rish» va «hozir guruhga yuborish» (v23.9).
//   POST { action:'preview' }  — matn (Telegramga yuborilmaydi)
//   POST { action:'send_now' } — hozir yuborish (sinov; jadvaldagi kunlik belgini band qilmaydi)
// Faqat administrator. Bot tokeni javobga hech qachon qo'shilmaydi.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');
const { buildDailyReport, tashkentNow } = require('./_lib/dailyReport');
const { TOKEN_RE, CHAT_RE, loadAll, dealerPayToday, tgSend } = require('./_lib/dailyReportRun');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const body = parseBody(event) || {};
  if (!['send_now', 'preview'].includes(body.action)) return json({ error: "Noma'lum amal" }, 400);
  let admin;
  try { admin = getAdminClient(); } catch (e) { return serverError(e, 'telegram-report', 'Server sozlanmagan'); }
  const auth = await requireStaffAuth(event, admin, { requireAdmin: true, fn: 'telegram-report' });
  if (!auth.ok) return auth.response;
  try {
    const now = tashkentNow();
    const { data, extra } = await loadAll(admin);
    extra.dealerPay = await dealerPayToday(admin, now.date);
    const msgs = buildDailyReport(data, now.date, extra);
    if (body.action === 'preview') return json({ ok: true, date: now.date, messages: msgs }, 200);
    const st = data.settings || {};
    if (!TOKEN_RE.test(String(st.tgBotToken || '')) || !CHAT_RE.test(String(st.tgChatId || ''))) return json({ ok: false, error: 'Avval Telegram bot tokeni va guruh (Chat ID) ni saqlang' }, 400);
    for (const m of msgs) { const r = await tgSend(st.tgBotToken, st.tgChatId, m); if (!r.ok) return json({ ok: false, error: 'Telegram javobi: ' + (r.description || 'xato') }, 200); }
    return json({ ok: true, sent: msgs.length }, 200);
  } catch (e) {
    return serverError(e, 'telegram-report', 'Hisobot tayyorlanmadi');
  }
};
