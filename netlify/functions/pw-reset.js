// Netlify Function — v24.9 (38-migratsiya): PAROLNI TIKLASH va MAJBURIY ALMASHTIRISH.
// Egasi qarori: «Admin tiklaydi + Telegram kod».
//
// Kirishsiz (parolni unutgan xodim):
//   POST { action:'request', login }                   — login Telegramga ulangan bo'lsa, botga 6 xonali kod (10 daqiqa).
//        Javob har doim bir xil (login bor-yo'qligi oshkor qilinmaydi). Cheklov: bitta xodimga 60 soniyada 1 ta,
//        soatiga 5 ta; bitta IP'dan soatiga 10 ta so'rov.
//   POST { action:'confirm', login, code, password }   — kod to'g'ri bo'lsa yangi parol; 5 marta xato — kod bekor.
//        Muvaffaqiyatda: eski seanslar yopiladi, majburiy almashtirish belgisi olinadi, botga xabar.
// Kirgan xodim:
//   POST { action:'status' }                           — Telegram ulanganmi, majburiy almashtirish kerakmi
//   POST { action:'tg_link' }                          — ulash havolasi (t.me/<bot>?start=<kod>, 15 daqiqa)
//   POST { action:'tg_link_check' }                    — xodim «Start» bosganmi (getUpdates) → ulanadi
//   POST { action:'tg_unlink' }
//   POST { action:'change', password }                 — o'z parolini almashtirish (majburiy almashtirishda ham)
// Admin yoki «sotuvchilar.manage» (o'z filiali, admin hisobini faqat admin):
//   POST { action:'admin_reset', staffId }             — vaqtinchalik parol (javobda BIR MARTA), xodim kirganda
//        yangisini qo'yishga majbur (app_metadata.must_change_pw), eski seanslar yopiladi.
//   POST { action:'admin_unlock', staffId }           — noto'g'ri parol bloki olib tashlanadi (staff-login)
//   POST { action:'admin_locks' }                      — hozir bloklangan loginlar (o'z filiali xodimlari; admin — hammasi)
// Kod bazada faqat xesh (sha256 + server siri); Telegram token javobga hech qachon qo'shilmaydi.
const crypto = require('crypto');
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, assertOwnFilial, assertCanManageStaff, escapeLike, logSecurityEvent, serverError } = require('./_lib/supabaseAdmin');
const { TOKEN_RE, tgSend } = require('./_lib/dailyReportRun');

const PUBLIC = ['request', 'confirm'];
const AUTHED = ['status', 'tg_link', 'tg_link_check', 'tg_unlink', 'change', 'admin_reset', 'admin_unlock', 'admin_locks'];
const CODE_TTL_MS = 10 * 60 * 1000, LINK_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5, USER_GAP_MS = 60 * 1000, USER_PER_HOUR = 5, IP_PER_HOUR = 10;
const PW_MIN = 8, PW_MAX = 72;
const GENERIC = "Agar bu login Telegramga ulangan bo'lsa, botga 6 xonali kod yuborildi (10 daqiqa amal qiladi). Ulanmagan bo'lsa — administratorga murojaat qiling.";
const BAD_CODE = "Kod noto'g'ri yoki muddati o'tgan";

const pepper = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.FW_PW_RESET_SECRET || '';
const hashCode = (staffId, code) => crypto.createHash('sha256').update(`${staffId}:${code}:${pepper()}`).digest('hex');
const sameHash = (a, b) => { const x = Buffer.from(String(a || ''), 'hex'), y = Buffer.from(String(b || ''), 'hex'); return x.length === 32 && y.length === 32 && crypto.timingSafeEqual(x, y); };
const cleanLogin = (l) => String(l || '').trim().slice(0, 80);
const pwErr = (p) => (typeof p !== 'string' || p.length < PW_MIN) ? `Parol kamida ${PW_MIN} belgidan iborat boʻlsin` : (p.length > PW_MAX ? `Parol ${PW_MAX} belgidan oshmasin` : null);
const clientIp = (event) => { const h = event.headers || {}; return String(h['x-nf-client-connection-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim().slice(0, 64); };
const nowIso = () => new Date().toISOString();
// Vaqtinchalik parol — chalkash belgilarsiz (0/O, 1/l/I yo'q), 10 belgi
const TEMP_ABC = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const tempPassword = () => Array.from({ length: 10 }, () => TEMP_ABC[crypto.randomInt(TEMP_ABC.length)]).join('');

async function tgApi(token, method, params) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify(params || {}) });
    return await r.json().catch(() => ({ ok: false }));
  } catch (e) { return { ok: false, description: 'Telegram bilan aloqa yoʻq' }; }
  finally { clearTimeout(t); }
}
async function botToken(admin) {
  const { data } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
  const t = data && data.data && data.data.settings && data.data.settings.tgBotToken;
  return TOKEN_RE.test(String(t || '')) ? String(t) : null;
}
async function getRow(admin, staffId) {
  const { data, error } = await admin.from('staff_pw_reset').select('*').eq('staff_id', staffId).maybeSingle();
  if (error) throw error;
  return data || null;
}
async function putRow(admin, staffId, patch) {
  const { error } = await admin.from('staff_pw_reset').upsert({ staff_id: staffId, ...patch, updated_at: nowIso() }, { onConflict: 'staff_id' });
  if (error) throw error;
}
async function findStaffByLogin(admin, login) {
  if (!login) return null;
  const { data } = await admin.from('staff').select('id, login, name, auth_user_id, active').ilike('login', escapeLike(login)).maybeSingle();
  return data && data.active !== false && data.auth_user_id ? data : null;
}
// staff-login bloki (login_guard) — tiklash/ochishda tozalanadi
const guardKey = (login) => 'l:' + String(login || '').toLowerCase().replace(/\s+/g, '').slice(0, 80);
async function clearGuard(admin, login) { try { await admin.from('login_guard').delete().eq('login_key', guardKey(login)); } catch (_) {} }
async function revoke(admin, uid) {
  try { const r = await admin.rpc('fw_revoke_sessions', { p_uid: uid }); return r && !r.error ? r.data : null; } catch (_) { return null; }
}
const migMissing = (e) => /staff_pw_reset|pw_reset_ip_log|fw_revoke_sessions/.test(String((e && (e.message || e.details)) || '')) && /does not exist|not find|42P01|PGRST/.test(String((e && (e.message || e.code)) || '') + String(e && e.code));

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const body = parseBody(event);
  if (!body || typeof body !== 'object' || ![...PUBLIC, ...AUTHED].includes(body.action)) return json({ error: "Noto'g'ri so'rov" }, 400);
  let admin;
  try { admin = getAdminClient(); } catch (e) { return serverError(e, 'pw-reset', 'Server sozlanmagan — administratorga murojaat qiling'); }

  try {
    // ── Kirishsiz: kod so'rash ────────────────────────────────────────────
    if (body.action === 'request') {
      const ip = clientIp(event), hourAgo = new Date(Date.now() - 3600e3).toISOString();
      const { data: recent } = await admin.from('pw_reset_ip_log').select('id').eq('ip', ip).gte('at', hourAgo);
      if ((recent || []).length >= IP_PER_HOUR) return json({ error: "Juda koʻp urinish — 1 soatdan keyin qayta urining" }, 429);
      await admin.from('pw_reset_ip_log').insert({ ip, at: nowIso() });
      const st = await findStaffByLogin(admin, cleanLogin(body.login));
      if (!st) return json({ ok: true, message: GENERIC }, 200);
      const row = await getRow(admin, st.id);
      if (!row || !row.tg_chat_id) return json({ ok: true, message: GENERIC }, 200);
      const now = Date.now();
      if (row.last_sent_at && now - Date.parse(row.last_sent_at) < USER_GAP_MS) return json({ ok: true, message: GENERIC, wait: true }, 200);
      const inWin = row.sent_window && now - Date.parse(row.sent_window) < 3600e3;
      if (inWin && (row.sent_count || 0) >= USER_PER_HOUR) return json({ ok: true, message: GENERIC, wait: true }, 200);
      const token = await botToken(admin);
      if (!token) return json({ ok: true, message: GENERIC }, 200);
      const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
      await putRow(admin, st.id, { code_hash: hashCode(st.id, code), code_exp: new Date(now + CODE_TTL_MS).toISOString(), code_attempts: 0,
        last_sent_at: new Date(now).toISOString(), sent_count: inWin ? (row.sent_count || 0) + 1 : 1, sent_window: inWin ? row.sent_window : new Date(now).toISOString() });
      await tgSend(token, row.tg_chat_id, `🔐 Parolni tiklash kodi: <b>${code}</b>\n10 daqiqa amal qiladi. Hech kimga aytmang.\nSiz soʻramagan boʻlsangiz — eʼtibor bermang va administratorga xabar bering.`).catch(() => {});
      await logSecurityEvent(admin, st, 'pw_reset_code_sent', { ip });
      return json({ ok: true, message: GENERIC }, 200);
    }

    // ── Kirishsiz: kodni tasdiqlash va yangi parol ────────────────────────
    if (body.action === 'confirm') {
      const pe = pwErr(body.password); if (pe) return json({ error: pe }, 400);
      const code = String(body.code || '').replace(/\s/g, '');
      if (!/^\d{6}$/.test(code)) return json({ error: BAD_CODE }, 400);
      const st = await findStaffByLogin(admin, cleanLogin(body.login));
      const row = st ? await getRow(admin, st.id) : null;
      if (!st || !row || !row.code_hash || !row.code_exp || Date.parse(row.code_exp) < Date.now()) return json({ error: BAD_CODE }, 400);
      if ((row.code_attempts || 0) >= MAX_ATTEMPTS) {
        await putRow(admin, st.id, { code_hash: null, code_exp: null });
        return json({ error: "Urinishlar tugadi — yangi kod soʻrang" }, 429);
      }
      if (!sameHash(row.code_hash, hashCode(st.id, code))) {
        const left = MAX_ATTEMPTS - (row.code_attempts || 0) - 1;
        await putRow(admin, st.id, left <= 0 ? { code_hash: null, code_exp: null, code_attempts: MAX_ATTEMPTS } : { code_attempts: (row.code_attempts || 0) + 1 });
        await logSecurityEvent(admin, st, 'pw_reset_bad_code', { ip: clientIp(event) });
        return json({ error: left > 0 ? `${BAD_CODE} (yana ${left} ta urinish)` : "Urinishlar tugadi — yangi kod soʻrang" }, 400);
      }
      const { error: ue } = await admin.auth.admin.updateUserById(st.auth_user_id, { password: body.password, app_metadata: { must_change_pw: false } });
      if (ue) throw ue;
      await putRow(admin, st.id, { code_hash: null, code_exp: null, code_attempts: 0 });
      await revoke(admin, st.auth_user_id);
      await clearGuard(admin, st.login);   // noto'g'ri parol bloki ham olinadi
      const token = await botToken(admin);
      if (token) await tgSend(token, row.tg_chat_id, '✅ Parolingiz oʻzgartirildi. Bu siz boʻlmasangiz — darhol administratorga xabar bering.').catch(() => {});
      await logSecurityEvent(admin, st, 'pw_reset_done', { via: 'telegram', ip: clientIp(event) });
      return json({ ok: true }, 200);
    }

    // ── Kirgan xodim ──────────────────────────────────────────────────────
    const auth = await requireStaffAuth(event, admin, { fn: 'pw-reset', allowPwChange: true, loadPermissions: body.action === 'admin_reset' });
    if (!auth.ok) return auth.response;
    const me = auth.staff;

    if (body.action === 'status') {
      const row = await getRow(admin, me.id);
      return json({ ok: true, linked: !!(row && row.tg_chat_id), tgName: row && row.tg_chat_id ? (row.tg_name || '') : '', linkedAt: row && row.tg_linked_at || null, mustChange: !!auth.mustChangePw }, 200);
    }
    if (body.action === 'tg_link') {
      const token = await botToken(admin);
      if (!token) return json({ error: 'Telegram bot sozlanmagan — administrator Sozlamalar → Telegram bot boʻlimida tokenni saqlasin' }, 400);
      const me2 = await tgApi(token, 'getMe');
      if (!me2.ok || !me2.result || !me2.result.username) return json({ error: 'Bot topilmadi — administratorga murojaat qiling' }, 400);
      const code = 'pw' + crypto.randomBytes(12).toString('hex');
      await putRow(admin, me.id, { link_code: code, link_code_exp: new Date(Date.now() + LINK_TTL_MS).toISOString() });
      return json({ ok: true, bot: me2.result.username, url: `https://t.me/${me2.result.username}?start=${code}` }, 200);
    }
    if (body.action === 'tg_link_check') {
      const row = await getRow(admin, me.id);
      if (!row || !row.link_code || !row.link_code_exp || Date.parse(row.link_code_exp) < Date.now()) return json({ error: 'Havola muddati oʻtgan — qaytadan «Ulash»ni bosing' }, 400);
      const token = await botToken(admin);
      if (!token) return json({ error: 'Telegram bot sozlanmagan' }, 400);
      const up = await tgApi(token, 'getUpdates', { limit: 100, allowed_updates: ['message'] });
      if (!up.ok) return json({ error: /webhook/i.test(String(up.description || '')) ? "Botda webhook yoqilgan — ulash ishlamaydi" : 'Telegram javob bermadi' }, 400);
      const msg = (up.result || []).map(u => u && u.message).filter(m => m && m.chat && m.chat.type === 'private' && String(m.text || '').trim() === '/start ' + row.link_code).pop();
      if (!msg) return json({ ok: true, linked: false }, 200);
      const name = ([msg.from && msg.from.first_name, msg.from && msg.from.last_name].filter(Boolean).join(' ') + (msg.from && msg.from.username ? ' @' + msg.from.username : '')).trim().slice(0, 120);
      await putRow(admin, me.id, { tg_chat_id: String(msg.chat.id), tg_name: name, tg_linked_at: nowIso(), link_code: null, link_code_exp: null });
      await tgSend(token, msg.chat.id, `✅ Ulandingiz: ${me.name || me.login}. Parolni unutsangiz — kirish oynasida «Parolni unutdingizmi?» → kod shu yerga keladi.`).catch(() => {});
      await logSecurityEvent(admin, me, 'pw_reset_tg_linked', null);
      return json({ ok: true, linked: true, tgName: name }, 200);
    }
    if (body.action === 'tg_unlink') {
      await putRow(admin, me.id, { tg_chat_id: null, tg_name: null, tg_linked_at: null, code_hash: null, code_exp: null });
      await logSecurityEvent(admin, me, 'pw_reset_tg_unlinked', null);
      return json({ ok: true }, 200);
    }
    if (body.action === 'change') {
      const pe = pwErr(body.password); if (pe) return json({ error: pe }, 400);
      const { error: ue } = await admin.auth.admin.updateUserById(auth.user.id, { password: body.password, app_metadata: { must_change_pw: false } });
      if (ue) throw ue;
      await logSecurityEvent(admin, me, 'pw_changed_self', { forced: !!auth.mustChangePw });
      return json({ ok: true }, 200);
    }
    // Admin amallari: admin_reset / admin_unlock / admin_locks
    if (!auth.isAdmin && !(auth.permKeys && auth.permKeys.has('sotuvchilar.manage'))) return json({ error: "Ruxsat yoʻq (sotuvchilar.manage)" }, 403);
    if (body.action === 'admin_locks') {
      let q = admin.from('staff').select('id, login, filial');
      if (!auth.isAdmin) q = q.eq('filial', auth.filial);
      const { data: list } = await q;
      const { data: g } = await admin.from('login_guard').select('login_key, locked_until').gte('locked_until', nowIso());
      const by = new Map((g || []).map(r => [r.login_key, r.locked_until]));
      return json({ ok: true, locks: (list || []).filter(x => by.has(guardKey(x.login))).map(x => ({ staffId: x.id, until: by.get(guardKey(x.login)) })) }, 200);
    }
    const targetId = Number(body.staffId);
    if (!Number.isSafeInteger(targetId) || targetId <= 0) return json({ error: 'Xodim tanlanmagan' }, 400);
    if (targetId === Number(me.id)) return json({ error: "Oʻz parolingizni «Parolni oʻzgartirish» orqali almashtiring" }, 400);
    const fc = await assertOwnFilial(admin, 'staff', targetId, auth); if (!fc.ok) return fc.response;
    const pc = await assertCanManageStaff(admin, targetId, auth); if (!pc.ok) return pc.response;
    const { data: target } = await admin.from('staff').select('id, login, name, auth_user_id, active').eq('id', targetId).maybeSingle();
    if (!target || !target.auth_user_id) return json({ error: 'Xodim topilmadi' }, 404);
    await clearGuard(admin, target.login);
    if (body.action === 'admin_unlock') {
      await logSecurityEvent(admin, me, 'login_unlocked', { target: target.id });
      return json({ ok: true }, 200);
    }
    const temp = tempPassword();
    const { error: ue } = await admin.auth.admin.updateUserById(target.auth_user_id, { password: temp, app_metadata: { must_change_pw: true } });
    if (ue) throw ue;
    const revoked = await revoke(admin, target.auth_user_id);
    const row = await getRow(admin, target.id).catch(() => null);
    const token = row && row.tg_chat_id ? await botToken(admin) : null;
    if (token) await tgSend(token, row.tg_chat_id, '🔐 Administrator parolingizni tikladi. Yangi vaqtinchalik parolni undan oling — kirganingizda oʻzingiz yangisini qoʻyasiz.').catch(() => {});
    await logSecurityEvent(admin, me, 'pw_admin_reset', { target: target.id, revoked });
    return json({ ok: true, tempPassword: temp, login: target.login, sessionsClosed: revoked != null && revoked >= 0 }, 200);
  } catch (e) {
    if (migMissing(e)) return json({ error: "Parol tiklash hali yoqilmagan (38-migratsiya qoʻllanmagan) — administratorga murojaat qiling", code: 'MIGRATION38_PENDING' }, 503);
    return serverError(e, 'pw-reset', 'Amal bajarilmadi');
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('pw-reset', exports.handler);
