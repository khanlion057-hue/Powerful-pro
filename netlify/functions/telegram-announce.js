// Netlify Function — ONLAYN-DO'KON: YANGI MAHSULOT E'LONI Telegram kanal/guruhlariga (v24).
//
// Ma'lumot SERVERDAN olinadi (brauzer yuborgan nom/narx e'tiborsiz): mahsulot nomi, rasmi, narxi (FIFO tannarx × ustama,
// vitrina chegirmasi bilan; do'kon valyutasida) va mahsulot havolasi (Sozlamalar → «Mahsulot havolasi shabloni»,
// bo'lmasa — vitrina manzili). Bot tokeni faqat serverda (app_data.settings.tgBotToken) — javobga qo'shilmaydi.
//
// Takroriy e'lon yo'q: har (mahsulot, chat) juftligi idempotency_keys orqali band qilinadi; muvaffaqiyatli yuborilgani
// qayta yuborilmaydi. Xato bo'lsa — bandlik bo'shatiladi (xavfsiz qayta urinish), xato loglanadi va (31-migratsiyadan
// keyin) administratorga bildirishnoma + audit.
//
// POST { action:'announce', pid, filial? }  — sozlangan barcha chatlarga (yuborilganlari o'tkazib yuboriladi)
// POST { action:'check' }                   — bot va har bir kanal/guruh ruxsatini tekshiradi (getMe, getChat, getChatMember)
// Ruxsat: administrator yoki «mahsulotlar.create» / «mahsulotlar.edit» / «sozlamalar.edit».
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError } = require('./_lib/supabaseAdmin');
const { claimIdempotent, completeIdempotent, releaseIdempotent } = require('./_lib/idempotency');
const { TOKEN_RE, CHAT_RE, loadAll } = require('./_lib/dailyReportRun');
const { v31On, notify, audit } = require('./_lib/auditAuthority');

const PERMS = ['mahsulotlar.create', 'mahsulotlar.edit', 'sozlamalar.edit'];
const MAX_CHATS = 10;
const ENDPOINT = 'telegram-announce';

async function tg(token, method, payload) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify(payload || {}),
    });
    return await r.json().catch(() => ({ ok: false, description: 'Telegram javobi o‘qilmadi' }));
  } catch (e) {
    return { ok: false, description: e && e.name === 'AbortError' ? 'Telegram javob bermadi (vaqt tugadi)' : 'Tarmoq xatosi' };
  } finally { clearTimeout(t); }
}
const tgErr = (r) => String((r && r.description) || 'Telegram xatosi').slice(0, 200);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function chatsOf(st) {
  const raw = Array.isArray(st.tgAnnounceChats) ? st.tgAnnounceChats : String(st.tgAnnounceChats || '').split(/[\s,;]+/);
  return [...new Set(raw.map((x) => String(x || '').trim()).filter((x) => CHAT_RE.test(x)))].slice(0, MAX_CHATS);
}
const safeUrl = (u) => (typeof u === 'string' && /^https:\/\/[^\s<>"']{3,300}$/.test(u) ? u : null);

// Narx — brauzerdagi shopPrice() bilan bir xil qoida: FIFO (eng eski faol partiya) tannarx × (1 + ustama%), vitrina chegirmasi
function priceOf(p, branch, shop, rate) {
  const b = (branch.batches || []).filter((x) => x.pid === p.id && (+x.qty || 0) > (+x.sold || 0) && x.status !== 'empty' && x.status !== 'transit')
    .sort((a, c) => new Date(a.date) - new Date(c.date))[0];
  const cost = p.directSale && +p.dsCostUsd > 0 ? +p.dsCostUsd : (b ? +b.costUsd || 0 : 0);
  const pct = p.markupPct != null ? +p.markupPct : 25;
  let usd = Math.round(cost * (1 + pct / 100) * 100) / 100;
  const d = ((shop && shop.discounts) || []).find((x) => String(x.pid) === String(p.id));
  if (d && +d.priceUsd > 0) usd = Math.round(+d.priceUsd * 100) / 100;   // vitrina chegirma narxi (dokon.js shopPrice bilan bir xil)
  const cur = shop && shop.settings && shop.settings.currency === 'USD' ? 'USD' : 'UZS';
  if (!(usd > 0)) return null;
  if (cur === 'USD') return `$${usd.toFixed(2)}`;
  return `${(Math.floor((Math.round(usd * rate) + 500) / 1000) * 1000).toLocaleString('en-US').replace(/,/g, ' ')} so‘m`;   // v24.5: 1 000 ga yaxlit
}

function linkOf(st, shop, p) {
  const tpl = typeof st.tgAnnounceLink === 'string' ? st.tgAnnounceLink.trim() : '';
  if (tpl) return safeUrl(tpl.replace(/\{id\}/g, encodeURIComponent(p.id)).replace(/\{sku\}/g, encodeURIComponent(p.sku || '')));
  const base = safeUrl(process.env.URL || '');
  const slug = shop && shop.settings && shop.settings.slug ? String(shop.settings.slug).replace(/[^a-z0-9-]/g, '') : '';
  return base && slug ? `${base}/${slug}` : null;
}

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const body = parseBody(event);
  if (!body || !['announce', 'check'].includes(body.action)) return json({ error: "Noto'g'ri so'rov" }, 400);
  if (body.action === 'announce' && !(Number.isSafeInteger(body.pid) && body.pid > 0)) return json({ error: "Mahsulot noto'g'ri" }, 400);

  let admin;
  try { admin = getAdminClient(); } catch (e) { return serverError(e, ENDPOINT, 'Server sozlanmagan — administratorga murojaat qiling'); }
  const auth = await requireStaffAuth(event, admin, { loadPermissions: true, fn: ENDPOINT });
  if (!auth.ok) return auth.response;
  if (!auth.isAdmin && !PERMS.some((k) => auth.permKeys.has(k))) return json({ error: "Bu amal uchun ruxsatingiz yo'q" }, 403);

  try {
    const { data } = await loadAll(admin);
    const st = data.settings || {};
    const token = typeof st.tgBotToken === 'string' ? st.tgBotToken.trim() : '';
    if (!TOKEN_RE.test(token)) return json({ ok: false, error: 'Telegram bot ulanmagan — Sozlamalar → Telegram', code: 'no_bot' }, 200);
    const chats = chatsOf(st);
    if (!chats.length) return json({ ok: false, error: "E'lon uchun kanal yoki guruh qo'shilmagan", code: 'no_chats' }, 200);

    if (body.action === 'check') {
      const me = await tg(token, 'getMe');
      if (!me.ok) return json({ ok: false, error: tgErr(me), code: 'bot_invalid' }, 200);
      const out = [];
      for (const c of chats) {
        const ch = await tg(token, 'getChat', { chat_id: c });
        if (!ch.ok) { out.push({ chat: c, ok: false, error: tgErr(ch) }); continue; }
        const mem = await tg(token, 'getChatMember', { chat_id: c, user_id: me.result.id });
        const m = mem.ok ? mem.result : null;
        const isChannel = ch.result.type === 'channel';
        const can = !!m && (isChannel ? (m.status === 'administrator' && m.can_post_messages !== false) : ['administrator', 'member', 'creator'].includes(m.status) && m.can_send_messages !== false);
        out.push({ chat: c, ok: can, title: String(ch.result.title || ch.result.username || c).slice(0, 80), type: ch.result.type,
          error: can ? undefined : (isChannel ? "Bot kanalda administrator emas yoki xabar yubora olmaydi" : "Bot guruhda a'zo emas yoki yozish taqiqlangan") });
      }
      return json({ ok: out.every((x) => x.ok), bot: String(me.result.username || '').slice(0, 64), chats: out }, 200);
    }

    // announce
    const filial = resolveFilial(auth, body.filial);
    const p = (data.products || []).find((x) => Number(x.id) === body.pid && !x.archived);
    if (!p) return json({ error: 'Mahsulot topilmadi' }, 404);
    const branch = (data.branchStore || {})[filial] || {};
    const shop = branch.shop || {};
    const rate = +st.usdUzs > 100 ? +st.usdUzs : 12500;
    const price = priceOf(p, branch, shop, rate);
    const link = linkOf(st, shop, p);
    const img = safeUrl(Array.isArray(p.images) && p.images[0] ? p.images[0] : p.image);
    const caption = [`🆕 <b>${esc(p.name)}</b>`, p.brand ? esc(p.brand) : '', price ? `💰 Narxi: <b>${esc(price)}</b>` : '', p.sku ? `Kod: ${esc(p.sku)}` : '',
      link ? `🛒 <a href="${esc(link)}">Buyurtma berish</a>` : ''].filter(Boolean).join('\n').slice(0, 1000);
    const social = [['Instagram', st.socialInstagram], ['YouTube', st.socialYoutube], ['Facebook', st.socialFacebook]]
      .map(([t, u]) => (safeUrl(u) ? { text: t, url: safeUrl(u) } : null)).filter(Boolean);
    const kb = [...(link ? [[{ text: '🛒 Buyurtma berish', url: link }]] : []), ...(social.length ? [social] : [])];
    const replyMarkup = kb.length ? { inline_keyboard: kb } : undefined;
    const results = [];
    const v31 = await v31On(admin).catch(() => false);
    for (const chat of chats) {
      const claim = await claimIdempotent(admin, `ann:${p.id}:${chat}`, ENDPOINT);
      if (claim.isDuplicate) { results.push({ chat, ok: true, skipped: 'already_sent' }); continue; }
      if (claim.inProgress) { results.push({ chat, ok: false, skipped: 'in_progress' }); continue; }
      if (claim.failed) { results.push({ chat, ok: false, error: 'Takror tekshiruvi ishlamadi' }); continue; }
      let r = img ? await tg(token, 'sendPhoto', { chat_id: chat, photo: img, caption, parse_mode: 'HTML', reply_markup: replyMarkup })
                  : await tg(token, 'sendMessage', { chat_id: chat, text: caption, parse_mode: 'HTML', reply_markup: replyMarkup, disable_web_page_preview: false });
      if (!r.ok && img) r = await tg(token, 'sendMessage', { chat_id: chat, text: caption, parse_mode: 'HTML', reply_markup: replyMarkup });   // rasm yuklanmasa — matn
      if (r.ok) {
        await completeIdempotent(admin, claim, { ok: true, messageId: r.result && r.result.message_id, at: new Date().toISOString() });
        results.push({ chat, ok: true });
      } else {
        await releaseIdempotent(admin, claim);
        const err = tgErr(r);
        console.error(`[${ENDPOINT}] yuborilmadi pid=${p.id} chat=${chat}:`, err);
        results.push({ chat, ok: false, error: err });
      }
    }
    const failed = results.filter((x) => !x.ok && !x.skipped);
    if (v31) {
      await audit(admin, { filial, entity: 'product', entityId: String(p.id), action: 'announce', actorId: auth.isAdmin ? null : auth.staff.id,
        actorName: auth.staff && auth.staff.name, actorRole: auth.isAdmin ? 'admin' : 'seller', after: { results },
        note: `Telegram e'loni: ${p.name} — ${results.filter((x) => x.ok && !x.skipped).length} ta yuborildi, ${failed.length} ta xato` });
      if (failed.length) {
        await notify(admin, { filial, audience: 'admin', kind: 'announce_error', title: `E'lon yuborilmadi: ${p.name}`,
          body: failed.map((f) => `${f.chat}: ${f.error}`).join('; ').slice(0, 900) + " — Onlayn-do'kon → E'lon qayta yuborish",
          refType: 'product', refId: String(p.id), actorName: auth.staff && auth.staff.name });
      }
    }
    return json({ ok: failed.length === 0, sent: results.filter((x) => x.ok && !x.skipped).length, results }, 200);
  } catch (e) {
    return serverError(e, ENDPOINT, "E'lon yuborilmadi");
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('telegram-announce', exports.handler);
