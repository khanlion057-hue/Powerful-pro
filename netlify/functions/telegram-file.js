// Netlify Function — v24.5: TELEGRAM BOTGA FAYL va ZAXIRA NUSXA. Faqat administrator.
//   POST { action:'doc', filename, b64, caption }   — PDF hujjat (chek, hisobot) → Telegram guruhi (tgChatId)
//   POST { action:'backup_send' }                   — butun ma'lumot zaxirasi (.json.gz) → SHAXSIY chat (tgBackupChat)
//   POST { action:'backup_download' }               — o'sha zaxira faylni brauzerga (gzip, base64)
//   v24.6 (egasi talabi) — INVESTOR (hamkor) HISOBOTI Telegramga:
//   POST { action:'tg_link' }                        — bot nomi (havola uchun: t.me/<bot>?start=<kod>)
//   POST { action:'tg_link_check', code }            — investor havolani ochib «Start» bosganmi (getUpdates) → {chatId, name}
//   POST { action:'partner_doc', partnerId, filename, b64, caption } — PDF → shu hamkorning ULANGAN chatiga
//        (chat ID bazadagi hamkor yozuvidan olinadi — brauzer ixtiyoriy chatga yubora olmaydi).
// Telegram bot foydalanuvchiga @username yoki telefon raqami bo'yicha yoza olmaydi — investor botga bir marta «Start» bosadi.
// Bot tokeni va PIN'lar javobga ham, zaxira fayliga ham hech qachon qo'shilmaydi. Zaxira — faqat egasining shaxsiy
// chatiga (guruhga emas): fayl butun biznes ma'lumotini o'z ichiga oladi.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');
const { TOKEN_RE, CHAT_RE, tgSend } = require('./_lib/dailyReportRun');
const CODE_RE = /^inv[A-Za-z0-9]{8,24}$/;
async function tgApi(token, method, params) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify(params || {}) });
    return await r.json().catch(() => ({ ok: false, description: 'javob oʻqilmadi' }));
  } finally { clearTimeout(t); }
}
const { buildBackup, backupFile, tgSendDocument } = require('./_lib/backupBuild');

const MAX_DOC = 4 * 1024 * 1024;
const MAX_DL = 5 * 1024 * 1024;
const safeName = (n, ext) => (String(n || 'hujjat').replace(/[^\p{L}\p{N} ._()-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'hujjat').replace(new RegExp('(\\.' + ext + ')?$', 'i'), '.' + ext);

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const body = parseBody(event) || {};
  if (!['doc', 'backup_send', 'backup_download', 'tg_link', 'tg_link_check', 'partner_doc'].includes(body.action)) return json({ error: "Noma'lum amal" }, 400);
  let admin;
  try { admin = getAdminClient(); } catch (e) { return serverError(e, 'telegram-file', 'Server sozlanmagan'); }
  const auth = await requireStaffAuth(event, admin, { requireAdmin: true, fn: 'telegram-file' });
  if (!auth.ok) return auth.response;
  try {
    const { data: row, error } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
    if (error) throw error;
    const st = (row && row.data && row.data.settings) || {};
    if (['tg_link', 'tg_link_check', 'partner_doc'].includes(body.action) && !TOKEN_RE.test(String(st.tgBotToken || ''))) {
      return json({ error: 'Avval Sozlamalar → Telegram bot: bot tokenini saqlang' }, 400);
    }
    if (body.action === 'tg_link') {
      const me = await tgApi(st.tgBotToken, 'getMe');
      if (!me.ok || !me.result || !me.result.username) return json({ error: 'Bot topilmadi: ' + (me.description || 'token xato') }, 400);
      return json({ ok: true, bot: me.result.username }, 200);
    }
    if (body.action === 'tg_link_check') {
      const code = String(body.code || '');
      if (!CODE_RE.test(code)) return json({ error: "Ulash kodi noto'g'ri" }, 400);
      const up = await tgApi(st.tgBotToken, 'getUpdates', { limit: 100, allowed_updates: ['message'] });
      if (!up.ok) return json({ error: /webhook/i.test(String(up.description || '')) ? "Botda webhook yoqilgan — ulash uchun avval uni o'chiring" : 'Telegram javobi: ' + (up.description || 'xato') }, 400);
      const msg = (up.result || []).map(u => u && u.message).filter(m => m && m.chat && m.chat.type === 'private' && String(m.text || '').trim() === '/start ' + code).pop();
      if (!msg) return json({ ok: true, found: false }, 200);
      const name = [msg.from && msg.from.first_name, msg.from && msg.from.last_name].filter(Boolean).join(' ').slice(0, 120);
      const user = msg.from && msg.from.username ? '@' + String(msg.from.username).slice(0, 64) : '';
      await tgSend(st.tgBotToken, msg.chat.id, '✅ Siz investor hisobotlariga ulandingiz. Oylik va yillik hisobotlar shu yerga keladi.').catch(() => {});
      return json({ ok: true, found: true, chatId: String(msg.chat.id), name, user }, 200);
    }
    if (body.action === 'partner_doc') {
      const p = (Array.isArray(row && row.data && row.data.partners) ? row.data.partners : []).find(x => x && String(x.id) === String(body.partnerId));
      if (!p) return json({ error: 'Hamkor topilmadi (avval saqlang)' }, 404);
      if (!/^\d{3,20}$/.test(String(p.tgChat || ''))) return json({ error: 'Hamkor Telegramga ulanmagan' }, 400);
      const b64 = String(body.b64 || '');
      if (!b64 || b64.length > Math.ceil(MAX_DOC * 4 / 3) + 8) return json({ error: 'Fayl boʻsh yoki juda katta (4 MB gacha)' }, 400);
      const buf = Buffer.from(b64, 'base64');
      if (buf.length > MAX_DOC || buf.slice(0, 5).toString('latin1') !== '%PDF-') return json({ error: 'Faqat PDF hujjat (4 MB gacha)' }, 400);
      const r = await tgSendDocument(st.tgBotToken, String(p.tgChat), safeName(body.filename, 'pdf'), buf, body.caption ? String(body.caption).slice(0, 300) : '', 'application/pdf');
      return r.ok ? json({ ok: true }, 200) : json({ ok: false, error: 'Telegram javobi: ' + (r.description || 'xato') }, 200);
    }
    if (body.action === 'doc') {
      const b64 = String(body.b64 || '');
      if (!b64 || b64.length > Math.ceil(MAX_DOC * 4 / 3) + 8) return json({ error: 'Fayl boʻsh yoki juda katta (4 MB gacha)' }, 400);
      const buf = Buffer.from(b64, 'base64');
      if (buf.length > MAX_DOC || buf.slice(0, 5).toString('latin1') !== '%PDF-') return json({ error: 'Faqat PDF hujjat (4 MB gacha)' }, 400);
      if (!TOKEN_RE.test(String(st.tgBotToken || '')) || !CHAT_RE.test(String(st.tgChatId || ''))) return json({ error: 'Avval Sozlamalar → Telegram bot: token va guruh (Chat ID) ni saqlang' }, 400);
      const r = await tgSendDocument(st.tgBotToken, st.tgChatId, safeName(body.filename, 'pdf'), buf, body.caption ? String(body.caption).slice(0, 300) : '', 'application/pdf');
      return r.ok ? json({ ok: true }, 200) : json({ ok: false, error: 'Telegram javobi: ' + (r.description || 'xato') }, 200);
    }
    const bk = await buildBackup(admin);
    const gz = backupFile(bk, true);
    const name = `zaxira_${bk.createdAt.slice(0, 10)}.json.gz`;
    if (body.action === 'backup_download') {
      if (gz.length > MAX_DL) return json({ error: "Zaxira juda katta — Telegram botga yuborish bilan oling" }, 413);
      return json({ ok: true, filename: name, gzipB64: gz.toString('base64'), counts: bk.counts, createdAt: bk.createdAt }, 200);
    }
    if (!TOKEN_RE.test(String(st.tgBotToken || '')) || !CHAT_RE.test(String(st.tgBackupChat || ''))) return json({ error: 'Avval Sozlamalar → Maʼlumotlar: zaxira uchun SHAXSIY chat ID ni kiriting' }, 400);
    const r = await tgSendDocument(st.tgBotToken, st.tgBackupChat, name, gz,
      `🗄 Zaxira nusxa · ${bk.createdAt.slice(0, 16).replace('T', ' ')} UTC\n${bk.counts.products} mahsulot · ${bk.counts.sales} savdo · ${bk.counts.customers} mijoz · ${bk.counts.branches} filial`, 'application/gzip');
    return r.ok ? json({ ok: true, sizeKb: Math.round(gz.length / 1024), counts: bk.counts }, 200) : json({ ok: false, error: 'Telegram javobi: ' + (r.description || 'xato') }, 200);
  } catch (e) {
    return serverError(e, 'telegram-file', 'Amal bajarilmadi');
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('telegram-file', exports.handler);
