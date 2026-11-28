// v25.8 — AI-REKLAMA, 5-bosqich: AVTOPILOT (ai-ads-cron) va qoralamani tasdiqlash (ai-ads: drafts, draft_action). 58-migratsiya.
//
// Qoidalar (docs/AI-REKLAMA.md §5, §8):
//   • Serverda canvas yo'q — avtopilot posti mahsulotning O'Z rasmi bilan (sendPhoto, https URL), format 'autophoto'.
//   • Sukut — «tasdiqlash bilan»: qoralama (status 'draft') + egasi guruhiga (tgChatId) xabar; 24 soatda tasdiqlanmasa — 'expired'.
//     «To'liq avtomat» — darhol kanalga.
//   • Filial sozlamasi: soatlar (Toshkent), kuniga ko'pi bilan N ta; bir tovar repeatDays (sukut 7) kunda bir marta.
//   • Bitta soat — bitta post (idem_key = ap-<sana>-<soat>): cron takror chaqirilsa ham ikkinchi post bo'lmaydi.
//   • Xato: avtopilot posti keyingi cron soatida 1 marta qayta uriniladi, keyin 'failed' + egasiga xabar. tg_outbox ishlatilmaydi.
//   • Narx va qoldiq — yuborish paytida QAYTA (tasdiqlash kechroq bo'lsa ham, izohdagi narx — o'sha paytdagi).
'use strict';
const AA = require('./aiAds');
const AT = require('./aiText');
const AP = require('./aiPublish');
const SP = require('./shopPublic');
const { TOKEN_RE, CHAT_RE } = require('./dailyReportRun');

const DAY = 86400000;
const AI_MS = 4000, TG_MS = 4000;   // cron'da tashqi so'rov 4 s (10 s ichida AI + Telegram)
const DRAFT_TTL = DAY;
const RETRY_WINDOW = DAY;

const slotKey = (now) => `ap-${now.date}-${String(now.hour).padStart(2, '0')}`;
const dayStartIso = (now) => new Date(Date.parse(now.date + 'T00:00:00Z') - 5 * 3600000).toISOString();   // Toshkent yarim tuni (UTC)

function priceOf(pub, ctx) {
  return { line: AA.priceLine(pub.price, ctx.cur), oldLine: pub.old ? AA.priceLine(pub.old, ctx.cur) : '', pct: pub.old > pub.price ? Math.round((1 - pub.price / pub.old) * 100) : 0, cur: ctx.cur };
}
// Mahsulot hozir ham reklama qilinadimi + narx (serverda). { pub, price } yoki { error, code }
function eligible(L, filial, pid) {
  const p = (L.data.products || []).find((x) => x && Number(x.id) === Number(pid));
  const ctx = SP.catalogCtx(L.data, filial, L.view);
  const pub = p && !p.noAds ? SP.publicProduct(p, ctx) : null;
  if (!pub) return { code: 'NOT_ELIGIBLE', error: "Mahsulot reklama uchun mos emas (vitrinada yo'q yoki «Reklama qilmaslik»)" };
  if (!(pub.stock > 0)) return { code: 'OUT_OF_STOCK', error: 'Mahsulot omborda qolmagan' };
  const img = (pub.img || []).find((u) => /^https:\/\//.test(String(u)));
  if (!img) return { code: 'NO_IMAGE', error: 'Mahsulot rasmi yoʻq' };
  return { pub, price: priceOf(pub, ctx), img };
}
const brandOf = (L) => (L.shop && L.shop.settings && L.shop.settings.name) || AP.DEFAULT_BRAND;

// Egasi guruhiga qisqa xabar (hisobot boti). Xato bo'lsa — jim (qoralama baribir Navbatda)
async function notifyOwner(st, html, timeoutMs, fetchImpl) {
  const token = String(st.tgBotToken || '').trim(), chat = String(st.tgChatId || '').trim();
  if (!TOKEN_RE.test(token) || !CHAT_RE.test(chat)) return { ok: false, skipped: true };
  const r = await AP.tgCall(token, 'sendMessage', { chat_id: chat, text: html, parse_mode: 'HTML', disable_web_page_preview: true }, timeoutMs || TG_MS, fetchImpl);
  return { ok: !!r.ok };
}
const panelUrl = (env = process.env) => { const b = String(env.URL || '').trim().replace(/\/+$/, ''); return /^https:\/\//.test(b) ? b + '/#dokon' : null; };

// Avtopilot/qoralama postini kanalga yuborish (mahsulot rasmi URL bilan). row — ai_ad_posts qatori ('sending' holatida).
// Natija: { ok, url?, error?, code? }; qator holati yangilanadi.
async function sendAutophoto({ admin, L, filial, settings, row, left, fetchImpl }) {
  const st = L.settings || {};
  const fail = async (error, code) => {
    await admin.from('ai_ad_posts').update({ status: 'failed', error: String(error).slice(0, 500) }).eq('id', row.id);
    return { ok: false, error, code: code || 'SEND_FAILED' };
  };
  const e = eligible(L, filial, row.product_id);
  if (e.error) return fail(e.error, e.code);
  const token = String(st.tgBotToken || '').trim(), chat = AA.channelOf(settings, st);
  if (!TOKEN_RE.test(token)) return fail('Hisobot boti ulanmagan', 'NO_BOT');
  if (!chat) return fail('Reklama kanali koʻrsatilmagan', 'NO_CHANNEL');
  const m = row.meta || {};
  const text = AP.cleanUserText({ title: m.title, body: m.body, tags: m.tags });
  const caption = AP.buildCaption(text, e.price, settings.lang, brandOf(L));
  const chk = await AP.checkChannel(token, chat, Math.max(800, Math.min(2500, left() - TG_MS - 300)), fetchImpl);
  if (!chk.ok) return fail(chk.error, 'CHANNEL');
  const link = AP.productLink(L.shop, row.product_id);
  const markup = link ? { inline_keyboard: [[{ text: settings.lang === 'ru' ? '🛒 Заказать' : '🛒 Buyurtma berish', url: link }]] } : undefined;
  const r = await AP.tgCall(token, 'sendPhoto', { chat_id: chat, photo: e.img, caption, parse_mode: 'HTML', ...(markup ? { reply_markup: markup } : {}) },
    Math.max(800, Math.min(TG_MS + 2000, left() - 200)), fetchImpl);
  if (!r.ok) return fail(r.timeout ? 'Telegram javob bermadi — kanalni tekshiring' : AP.tgErr(r, token));
  const patch = { status: 'sent', sent_at: new Date().toISOString(), tg_message_id: (r.result && r.result.message_id) || null, error: null, caption, price_snapshot: e.price, tg_chat: chat };
  await admin.from('ai_ad_posts').update(patch).eq('id', row.id);
  return { ok: true, url: AP.messageUrl(chat, patch.tg_message_id) };
}

// Qatorni 'sending' ga o'tkazish (faqat kutilgan holatdan; parallel ikkinchi urinish — false)
async function lockRow(admin, row, from, extra) {
  const { data, error } = await admin.from('ai_ad_posts').update({ status: 'sending', tries: (row.tries || 0) + 1, error: null, ...(extra || {}) })
    .eq('id', row.id).eq('status', from).select('*');
  if (error) throw error;
  return data && data[0] ? data[0] : null;
}

// ── Cron: bitta chaqiruv ──
// opts: { now:{date,hour}, nowMs, left(), env, fetchImpl, log }
async function runAutopilot(admin, opts) {
  const now = opts.now, nowMs = opts.nowMs || Date.now(), left = opts.left, out = { expired: 0, retried: null, created: [], skipped: [] };
  // 1) 24 soatda tasdiqlanmagan qoralamalar — muddati o'tdi
  {
    const { data, error } = await admin.from('ai_ad_posts').update({ status: 'expired' }).eq('status', 'draft').lt('expires_at', new Date(nowMs).toISOString()).select('id');
    if (error) throw error;
    out.expired = (data || []).length;
  }
  const { data: rows, error: e1 } = await admin.from('ai_ad_settings').select('branch_id,data');
  if (e1) throw e1;
  const branches = (rows || []).map((r) => ({ filial: r.branch_id, settings: AA.normalizeSettings(r.data) }));
  const cache = new Map();
  const load = async (f) => { if (!cache.has(f)) cache.set(f, await AA.loadBranch(admin, f)); return cache.get(f); };

  // 2) Avtopilot postlari: oldingi soatda xato — 1 marta qayta (keyin failed + egasiga xabar)
  {
    const { data: failed, error } = await admin.from('ai_ad_posts').select('*').eq('source', 'autopilot').eq('format', 'autophoto').eq('status', 'failed')
      .gte('created_at', new Date(nowMs - RETRY_WINDOW).toISOString()).order('created_at', { ascending: true }).limit(20);
    if (error) throw error;
    const cand = (failed || []).find((r) => (r.tries || 0) < 2 && (r.meta && r.meta.slot) !== slotKey(now));
    if (cand && left() > 6500) {
      const b = branches.find((x) => x.filial === cand.branch_id);
      const row = b ? await lockRow(admin, cand, 'failed') : null;
      if (row) {
        const L = await load(b.filial);
        const r = await sendAutophoto({ admin, L, filial: b.filial, settings: b.settings, row, left, fetchImpl: opts.fetchImpl });
        out.retried = { id: row.id, ok: r.ok };
        if (!r.ok) await notifyOwner(L.settings || {}, `⚠️ <b>Avtopilot posti yuborilmadi</b> (2-urinish)\n${AP.escHtml((row.meta && row.meta.name) || '')}\nSabab: ${AP.escHtml(r.error)}${panelUrl(opts.env) ? `\n${panelUrl(opts.env)}` : ''}`,
          Math.min(TG_MS, Math.max(800, left() - 300)), opts.fetchImpl);
      }
    }
  }

  // 3) Yangi post: shu soat filial jadvalida bo'lsa; soatda bitta; kuniga perDay
  for (const b of branches) {
    const A = b.settings.autopilot;
    if (!A.enabled || !A.hours.includes(now.hour)) continue;
    if (left() < 6000) { out.skipped.push({ filial: b.filial, why: 'time' }); break; }
    const key = slotKey(now);
    const { data: ex } = await admin.from('ai_ad_posts').select('id').eq('branch_id', b.filial).eq('idem_key', key).maybeSingle();
    if (ex) { out.skipped.push({ filial: b.filial, why: 'slot-done' }); continue; }
    const { data: today, error: e2 } = await admin.from('ai_ad_posts').select('id').eq('branch_id', b.filial).eq('source', 'autopilot').gte('created_at', dayStartIso(now)).limit(50);
    if (e2) throw e2;
    if ((today || []).length >= A.perDay) { out.skipped.push({ filial: b.filial, why: 'per-day' }); continue; }
    const L = await load(b.filial), st = L.settings || {};
    if (!L.shopOn) { out.skipped.push({ filial: b.filial, why: 'shop-off' }); continue; }
    if (!TOKEN_RE.test(String(st.tgBotToken || '')) || !AA.channelOf(b.settings, st)) { out.skipped.push({ filial: b.filial, why: 'no-channel' }); continue; }
    const cands = (await AA.candidates(admin, b.filial, b.settings, nowMs, L)).items.filter((c) => !c.recentAt && eligible(L, b.filial, c.pid).pub);
    const c = cands[0];
    if (!c) { out.skipped.push({ filial: b.filial, why: 'no-candidate' }); continue; }
    const kind = c.reasons[0];
    const gen = await AT.generateText({ admin, product: { name: c.name, cat: c.cat, desc: c.desc }, pid: c.pid, kind, lang: b.settings.lang, env: opts.env, fetchImpl: opts.fetchImpl,
      timeoutMs: Math.min(AI_MS, Math.max(500, left() - 5000)), now: nowMs });
    const e = eligible(L, b.filial, c.pid);
    const meta = { at: new Date(nowMs).toISOString(), slot: key, name: String(c.name).slice(0, 140), title: gen.title, body: gen.body, tags: gen.tags, reason: kind, lang: b.settings.lang, img: e.img, source: gen.source };
    const auto = A.mode === 'auto';
    const { data: ins, error: e3 } = await admin.from('ai_ad_posts').insert({ branch_id: b.filial, product_id: c.pid, format: 'autophoto', template: null,
      caption: AP.buildCaption(AP.cleanUserText(gen), e.price, b.settings.lang, brandOf(L)), price_snapshot: e.price, status: auto ? 'sending' : 'draft', source: 'autopilot',
      tg_chat: AA.channelOf(b.settings, st), tries: auto ? 1 : 0, created_by: 'Avtopilot', idem_key: key, meta, expires_at: auto ? null : new Date(nowMs + DRAFT_TTL).toISOString() }).select('*');
    if (e3) { if (e3.code === '23505') { out.skipped.push({ filial: b.filial, why: 'slot-done' }); continue; } throw e3; }
    const row = ins[0];
    if (auto) {
      const r = await sendAutophoto({ admin, L, filial: b.filial, settings: b.settings, row, left, fetchImpl: opts.fetchImpl });
      out.created.push({ filial: b.filial, id: row.id, pid: c.pid, mode: 'auto', ok: r.ok });   // xato — keyingi soatda 1 marta qayta
    } else {
      const price = e.price.line + (e.price.oldLine ? ` (oldin ${e.price.oldLine})` : '');
      const n = await notifyOwner(st, `🆕 <b>Yangi reklama tayyor — tasdiqlang</b>\n${AP.escHtml(c.name)}\n💰 ${AP.escHtml(price)}\n«${AP.escHtml(gen.title)}»\n\nOnlayn-doʻkon → AI-reklama → Navbat` +
        (panelUrl(opts.env) ? `\n${panelUrl(opts.env)}` : '') + '\n24 soatda tasdiqlanmasa — bekor boʻladi.', Math.min(TG_MS, Math.max(800, left() - 300)), opts.fetchImpl);
      out.created.push({ filial: b.filial, id: row.id, pid: c.pid, mode: 'approve', notified: n.ok });
    }
  }
  return out;
}

// Vaqtinchalik videolar (ai-ads-tmp): 1 soatdan eskisi o'chiriladi (yuborilmay qolganlari)
async function cleanupTmp(admin, nowMs) {
  const bucket = admin.storage.from('ai-ads-tmp');
  const { data: dirs } = await bucket.list('', { limit: 100 });
  let removed = 0;
  for (const d of dirs || []) {
    if (!d || !d.name || d.id) continue;   // faqat papkalar (filiallar)
    const { data: files } = await bucket.list(d.name, { limit: 100 });
    const old = (files || []).filter((f) => f && f.name && Date.parse(f.created_at || 0) < nowMs - 3600000).map((f) => `${d.name}/${f.name}`);
    if (old.length) { await bucket.remove(old); removed += old.length; }
  }
  return removed;
}

module.exports = { runAutopilot, sendAutophoto, lockRow, eligible, notifyOwner, cleanupTmp, slotKey, dayStartIso, DRAFT_TTL };
