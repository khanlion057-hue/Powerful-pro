// v25.9 — YAGONA BOT: kelgan xabarlar qutisi (59-migratsiya, tg_inbox) va webhook holati (app_data 'tg_main_bot').
//
// Asosiy (hisobot) boti webhook orqali ishlaydi: Telegram har bir xabarni "telegram-bot" funksiyasiga yuboradi.
// Webhook yoqilgach Telegram getUpdates'ni rad etadi (409) — shuning uchun ulash tekshiruvlari (mijoz, xodim paroli,
// investor, guruhlarni topish) `updates()` orqali o'qiydi:
//   • webhook shu botga o'rnatilgan bo'lsa — tg_inbox jadvalidan (getUpdates bilan bir xil ko'rinishda);
//   • webhook hali yo'q bo'lsa — eskicha getUpdates (o'tish davri; hech narsa buzilmaydi);
//   • getUpdates 409 / «webhook» xatosini bersa — baribir jadvaldan.
// Saqlanadigan narsa — minimal: shaxsiy chatda faqat «/start <kod>» matni (boshqa matn — umuman yo'q), guruh/kanaldan
// faqat chat nomi/turi va bot holati. Token hech qachon saqlanmaydi va qaytarilmaydi (faqat bot ID — token boshidagi raqam).
'use strict';

const ROW = 'tg_main_bot';
const KEEP_MS = 48 * 3600e3;
const START_RE = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{1,64})$/;
const CHAT_TYPES = ['private', 'group', 'supergroup', 'channel'];

const botIdOf = (token) => { const m = /^(\d{5,}):/.exec(String(token || '')); return m ? m[1] : null; };
const cut = (s, n) => (s == null || s === '' ? null : String(s).slice(0, n));
const missing59 = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || (/tg_inbox/.test(String(e.message || '')) && /does not exist|could not find|schema cache/i.test(String(e.message || ''))));

async function tgApi(token, method, payload, fetchImpl) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await (fetchImpl || fetch)(`https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify(payload || {}) });
    return await r.json().catch(() => ({ ok: false, description: 'javob o\'qilmadi' }));
  } catch (_) { return { ok: false, description: 'tarmoq' }; } finally { clearTimeout(t); }
}

async function loadHook(admin) {
  try { const { data } = await admin.from('app_data').select('data').eq('id', ROW).maybeSingle(); return (data && data.data) || {}; }
  catch (_) { return {}; }
}
const saveHook = (admin, d) => admin.from('app_data').upsert({ id: ROW, data: d, updated_at: new Date().toISOString() }, { onConflict: 'id' });

// Telegram update → jadval qatori (yoki null — bu turdagi yangilanish saqlanmaydi)
function rowOf(botId, upd) {
  if (!upd || !Number.isSafeInteger(upd.update_id)) return null;
  const kind = upd.message ? 'message' : upd.my_chat_member ? 'my_chat_member' : upd.channel_post ? 'channel_post' : null;
  if (!kind) return null;
  const src = upd[kind], chat = src && src.chat;
  if (!chat || !Number.isSafeInteger(Number(chat.id)) || !CHAT_TYPES.includes(chat.type)) return null;
  const from = src.from || {};
  let text = null;
  if (kind === 'message' && chat.type === 'private') { const m = START_RE.exec(String(src.text || '').trim()); if (m) text = '/start ' + m[1]; }
  return {
    bot_id: Number(botId), update_id: upd.update_id, kind, chat_id: Number(chat.id), chat_type: chat.type,
    chat_title: cut(chat.title, 128), chat_username: cut(chat.username, 64),
    from_id: Number.isSafeInteger(Number(from.id)) && from.id ? Number(from.id) : null,
    from_name: cut([from.first_name, from.last_name].filter(Boolean).join(' '), 128), from_username: cut(from.username, 64),
    text, member_status: kind === 'my_chat_member' && src.new_chat_member ? cut(src.new_chat_member.status, 20) : null,
  };
}

// Yozib qo'yadi. { dup:true } — Telegram shu yangilanishni qayta yubordi (ikkinchi marta ishlanmaydi).
// Jadval yo'q (59 qo'llanmagan) — { stored:false } (xabar baribir ishlanadi, faqat takror himoyasisiz).
async function record(admin, botId, upd) {
  const row = rowOf(botId, upd); if (!row) return { stored: false, dup: false };
  const { error } = await admin.from('tg_inbox').insert(row);
  if (!error) return { stored: true, dup: false };
  if (error.code === '23505' || /duplicate key/i.test(String(error.message || ''))) return { stored: false, dup: true };
  if (!missing59(error)) console.warn('[tgInbox] record', error.code || '', String(error.message || '').slice(0, 120));
  return { stored: false, dup: false };
}

// Jadval qatori → getUpdates natijasidagi ko'rinish (chaqiruvchilar o'zgarmasin)
function asUpdate(r) {
  const chat = { id: Number(r.chat_id), type: r.chat_type };
  if (r.chat_title) chat.title = r.chat_title; if (r.chat_username) chat.username = r.chat_username;
  const from = r.from_id ? { id: Number(r.from_id), first_name: r.from_name || '', username: r.from_username || undefined } : undefined;
  if (r.kind === 'my_chat_member') return { update_id: Number(r.update_id), my_chat_member: { chat, from, new_chat_member: { status: r.member_status || 'member' } } };
  if (r.kind === 'channel_post') return { update_id: Number(r.update_id), channel_post: { chat } };
  return { update_id: Number(r.update_id), message: { chat, from, text: r.text || '' } };
}

async function fromInbox(admin, botId, limit) {
  const since = new Date(Date.now() - KEEP_MS).toISOString();
  const { data, error } = await admin.from('tg_inbox').select('*').eq('bot_id', Number(botId)).gte('at', since).order('at', { ascending: false }).limit(limit);
  if (error) return { ok: false, description: missing59(error) ? '59-migratsiya qo\'llanmagan' : 'Xabarlar qutisi o\'qilmadi', via: 'inbox' };
  // eskidan yangiga (getUpdates tartibi) — chaqiruvchilar oxirgisini oladi
  return { ok: true, via: 'inbox', result: (data || []).slice().reverse().map(asUpdate) };
}

const webhookErr = (r) => !!r && (r.error_code === 409 || /webhook/i.test(String(r.description || '')));

// getUpdates o'rniga: { ok, result:[update…], via:'inbox'|'poll', description? }
async function updates(admin, token, allowed, opts = {}) {
  const botId = botIdOf(token); if (!botId) return { ok: false, description: 'token', via: 'none' };
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 200);
  const hook = await loadHook(admin);
  if (hook.hook && String(hook.bot_id) === botId) return fromInbox(admin, botId, limit);
  const up = await tgApi(token, 'getUpdates', { limit: Math.min(limit, 100), allowed_updates: allowed || ['message'] }, opts.fetchImpl);
  if (up && up.ok && Array.isArray(up.result)) return { ok: true, via: 'poll', result: up.result };
  if (webhookErr(up)) return fromInbox(admin, botId, limit);
  return { ok: false, via: 'poll', description: String((up && up.description) || 'Telegram javob bermadi').slice(0, 200) };
}

module.exports = { ROW, KEEP_MS, START_RE, botIdOf, tgApi, loadHook, saveHook, rowOf, record, asUpdate, fromInbox, updates, missing59 };
