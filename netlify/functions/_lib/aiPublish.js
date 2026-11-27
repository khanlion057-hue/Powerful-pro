// v25.8 — AI-REKLAMA, 4-bosqich: TELEGRAM KANALGA YUBORISH (faqat server). 58-migratsiya.
//
// Qoidalar:
//   • Bot tokeni — faqat serverda (app_data.settings.tgBotToken, «hisobot boti»); javobga, logga, xatoga chiqmaydi.
//   • Kanal: filial sozlamasi «Reklama kanali» → bo'lmasa tgAnnounceChats ning birinchisi.
//   • Yuborishdan OLDIN getChatMember: bot kanalda administrator va xabar yubora oladimi (bot ID — tokenning o'zidan, getMe'siz).
//   • Narx — FAQAT server hisoblagan satr (izohga brauzer matnidan narx o'tmaydi: narxga o'xshash qatorlar olib tashlanadi).
//   • Netlify 10 s: har bir tashqi so'rov qolgan vaqtga sig'adi (ko'pi bilan 7 s).
'use strict';
const { PRICE_RE_SRC, MONEY_SIGN_RE_SRC } = require('./aiText');

const TG = 'https://api.telegram.org/bot';
const CAPTION_MAX = 1024;

// Telegram so'rovi: JSON yoki FormData; xato matnida token bo'lmaydi
async function tgCall(token, method, payload, timeoutMs, fetchImpl) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), Math.max(500, timeoutMs || 7000));
  const isForm = typeof FormData !== 'undefined' && payload instanceof FormData;
  try {
    const r = await (fetchImpl || fetch)(`${TG}${encodeURIComponent(token)}/${method}`, {
      method: 'POST', signal: ctrl.signal,
      ...(isForm ? { body: payload } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) }),
    });
    const j = await r.json().catch(() => null);
    if (!j) return { ok: false, description: 'Telegram javobi oʻqilmadi', status: r.status };
    return j;
  } catch (e) {
    return { ok: false, timeout: e && e.name === 'AbortError', description: e && e.name === 'AbortError' ? 'Telegram javob bermadi (vaqt tugadi)' : 'Telegram bilan aloqa yoʻq' };
  } finally { clearTimeout(t); }
}
const tgErr = (r, token) => String((r && r.description) || 'Telegram xatosi').split(String(token || '\u0000')).join('***').slice(0, 300);
const botIdOf = (token) => { const m = /^(\d{5,}):/.exec(String(token || '')); return m ? Number(m[1]) : null; };

// Bot kanalga yoza oladimi (getChatMember). { ok, error, title? }
async function checkChannel(token, chat, timeoutMs, fetchImpl) {
  const id = botIdOf(token);
  if (!id) return { ok: false, error: 'Bot tokeni notoʻgʻri' };
  const r = await tgCall(token, 'getChatMember', { chat_id: chat, user_id: id }, timeoutMs, fetchImpl);
  if (!r.ok) return { ok: false, error: /chat not found/i.test(r.description || '') ? 'Kanal topilmadi — ID yoki @username ni tekshiring' : tgErr(r, token), timeout: !!r.timeout };
  const m = r.result || {};
  if (m.status === 'creator') return { ok: true };
  if (m.status === 'administrator' && m.can_post_messages !== false) return { ok: true };
  if (m.status === 'administrator') return { ok: false, error: 'Bot kanalda administrator, lekin «Xabar yuborish» huquqi yoʻq' };
  return { ok: false, error: 'Bot kanalda administrator emas — kanal sozlamalarida botni administrator qiling' };
}

const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const PRICE_LINE_RE = new RegExp(PRICE_RE_SRC, 'i'), MONEY_LINE_RE = new RegExp(MONEY_SIGN_RE_SRC);
// Foydalanuvchi matni: boshqaruv belgilarsiz, uzunlik cheklangan; narxga o'xshash qator — olib tashlanadi (narx faqat serverdan)
function cleanUserText(t) {
  const norm = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, n);
  const title = norm(t && t.title, 60).replace(/\n/g, ' ');
  const lines = norm(t && t.body, 700).split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const kept = lines.filter((l) => !PRICE_LINE_RE.test(l) && !MONEY_LINE_RE.test(l)).slice(0, 8);
  const tags = [...new Set((Array.isArray(t && t.tags) ? t.tags : []).map((g) => String(g || '').toLowerCase().replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '')).filter((g) => g.length >= 2 && g.length <= 30))].slice(0, 6);
  return { title: PRICE_LINE_RE.test(title) || MONEY_LINE_RE.test(title) ? '' : title, body: kept.join('\n'), tags, dropped: lines.length - kept.length };
}

// Izoh (HTML): sarlavha, matn, NARX (serverdan), heshteglar. ≤1024 belgi (Telegram chegarasi)
function buildCaption(text, price, lang) {
  const L = lang === 'ru' ? { price: 'Цена', old: 'было' } : { price: 'Narxi', old: 'oldin' };
  const parts = [];
  if (text.title) parts.push(`<b>${escHtml(text.title)}</b>`);
  if (text.body) parts.push(escHtml(text.body));
  if (price && price.line) parts.push(`💰 ${L.price}: <b>${escHtml(price.line)}</b>` + (price.oldLine ? ` (<s>${escHtml(price.oldLine)}</s>)` : ''));
  if (text.tags.length) parts.push(text.tags.map((g) => '#' + g).join(' '));
  let cap = parts.join('\n\n');
  if (cap.length > CAPTION_MAX) {   // matn qisqartiriladi — narx va heshteg doim qoladi
    const tail = parts.slice(text.body ? 2 : 1).join('\n\n'), head = text.title ? `<b>${escHtml(text.title)}</b>\n\n` : '';
    const room = CAPTION_MAX - tail.length - head.length - 4;
    cap = head + escHtml(text.body).slice(0, Math.max(0, room)).replace(/&[a-z]*$/, '') + '…\n\n' + tail;
  }
  return cap.slice(0, CAPTION_MAX);
}

// Vitrinadagi mahsulot havolasi (tugma uchun); yo'q bo'lsa — tugmasiz
function productLink(shop, pid, env = process.env) {
  const base = String(env.URL || '').trim();
  const slug = shop && shop.settings && shop.settings.slug ? String(shop.settings.slug).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) : '';
  if (!/^https:\/\/[^\s<>"']{3,200}$/.test(base) || !slug) return null;
  return `${base.replace(/\/+$/, '')}/dokon?s=${slug}#p=${encodeURIComponent(pid)}`;
}

// -100XXXXXXXXXX → https://t.me/c/XXXXXXXXXX/<msg>; @nom → https://t.me/nom/<msg>
function messageUrl(chat, msgId) {
  if (!msgId) return null;
  const c = String(chat || '');
  if (/^-100\d{5,}$/.test(c)) return `https://t.me/c/${c.slice(4)}/${msgId}`;
  if (/^@[A-Za-z0-9_]{4,64}$/.test(c)) return `https://t.me/${c.slice(1)}/${msgId}`;
  return null;
}

module.exports = { tgCall, tgErr, botIdOf, checkChannel, cleanUserText, buildCaption, productLink, messageUrl, escHtml, CAPTION_MAX };
