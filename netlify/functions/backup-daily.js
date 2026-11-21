// Netlify Function — v24.5: KUNLIK ZAXIRA NUSXA TELEGRAMGA (jadval: netlify.toml, har soatda tekshiradi).
// Sozlamalar → Maʼlumotlar: «Har kuni avtomatik zaxira» yoqilgan bo'lsa, Toshkent vaqti bilan belgilangan soatdan
// keyin KUNIGA BIR MARTA egasining SHAXSIY chatiga (tgBackupChat) .json.gz fayl yuboradi. Takror yuborilmaydi
// (idempotency_keys); Telegram xatosida keyingi soatda qayta urinadi. Ma'lumot qaytarmaydi.
const { getAdminClient, json, serverError } = require('./_lib/supabaseAdmin');
const { isScheduledEvent, claimHourlyAttempt, alreadyDone } = require('./_lib/scheduledGuard');
const { _isMissingRelation } = require('./_lib/cashAuthority');
const { claimIdempotent, completeIdempotent, releaseIdempotent } = require('./_lib/idempotency');
const { tashkentNow } = require('./_lib/dailyReport');
const { TOKEN_RE, CHAT_RE } = require('./_lib/dailyReportRun');
const { buildBackup, backupFile, tgSendDocument } = require('./_lib/backupBuild');

const hourOf = (st) => { const h = parseInt(st.tgBackupHour, 10); return h >= 0 && h <= 23 ? h : 23; };

exports.handler = async (event) => {
  // HARDENING: faqat jadval chaqiruvi (aks holda 404 — bazaga va Telegram'ga murojaat yo'q)
  if (!isScheduledEvent(event)) return json({ error: 'Not found' }, 404);
  let admin;
  try { admin = getAdminClient(); } catch (e) { return serverError(e, 'backup-daily', 'Server sozlanmagan'); }
  const now = tashkentNow();
  try {
    const { data: row } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
    const st = (row && row.data && row.data.settings) || {};
    if (!st.tgBackupDaily) return json({ ok: true, skipped: 'off' }, 200);
    if (now.hour < hourOf(st)) return json({ ok: true, skipped: 'early' }, 200);
    if (!TOKEN_RE.test(String(st.tgBotToken || '')) || !CHAT_RE.test(String(st.tgBackupChat || ''))) return json({ ok: true, skipped: 'no-bot' }, 200);
    if (await alreadyDone(admin, 'backup-daily', `${now.date}:${String(st.tgBackupChat)}`)) return json({ ok: true, skipped: 'sent' }, 200);
    if (!(await claimHourlyAttempt(admin, 'backup-daily', now, st.tgBackupChat))) return json({ ok: true, skipped: 'retry-later' }, 200);
    const claim = await claimIdempotent(admin, `${now.date}:${String(st.tgBackupChat)}`, 'backup-daily');
    if (!claim.claimed) return json({ ok: true, skipped: claim.isDuplicate ? 'sent' : 'busy' }, 200);
    try {
      const bk = await buildBackup(admin);
      const gz = backupFile(bk, true);
      const r = await tgSendDocument(st.tgBotToken, st.tgBackupChat, `zaxira_${now.date}.json.gz`, gz,
        `🗄 Kunlik zaxira · ${now.date}\n${bk.counts.products} mahsulot · ${bk.counts.sales} savdo · ${bk.counts.customers} mijoz`, 'application/gzip');
      if (!r.ok) throw Object.assign(new Error('Telegram: ' + (r.description || 'xato')), { tg: true });
      await completeIdempotent(admin, claim, { sizeKb: Math.round(gz.length / 1024), at: new Date().toISOString() });
      return json({ ok: true }, 200);
    } catch (e) {
      await releaseIdempotent(admin, claim);
      if (e.tg) { console.error('[backup-daily]', e.message); return json({ ok: false }, 200); }
      throw e;
    }
  } catch (e) {
    if (_isMissingRelation(e)) return json({ ok: false, skipped: 'schema' }, 200);
    return serverError(e, 'backup-daily', 'Zaxira tayyorlanmadi');
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('backup-daily', exports.handler);
