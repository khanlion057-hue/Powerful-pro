// Netlify Function — TELEGRAM SO'ROV BOTI (v25.6.9): xodim botdan /foyda, /xarajat, /qarz, /kassa, /ombor, /mahsulot so'raydi.
// Alohida bot (BotFather'dan yangi token) — asosiy hisobot boti va investor ulash (getUpdates) bilan to'qnashmaydi.
// Token FAQAT serverda: app_data qatori 'tg_query_bot' (brauzerga hech qachon qaytarilmaydi).
//   Ilovadan (Authorization bilan):
//     { action:'status' }               — administrator: sozlanganmi, bot nomi, ulangan xodimlar soni
//     { action:'setup', token }         — administrator: tokenni tekshiradi, webhook'ni maxfiy kalit bilan o'rnatadi
//     { action:'link_code' }            — har qanday faol xodim: 15 daqiqalik kod (botga «/start KOD»)
//     { action:'unlink' }               — o'z ulanishini o'chirish
//   Telegram (webhook, x-telegram-bot-api-secret-token): xabar → buyruq → javob. Ruxsatsiz — javob yo'q yoki rad.
const crypto = require('crypto');
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');
const { TOKEN_RE } = require('./_lib/dailyReportRun');
const { cashAuthorityOn, loadBalances, overlayBranch } = require('./_lib/cashAuthority');
const { ledgerAuthorityOn, loadLedger, overlayBranchLedger } = require('./_lib/ledgerAuthority');
const Q = require('./_lib/botQuery');

const ROW = 'tg_query_bot', CODE_TTL = 15 * 60e3;
const sameSecret = (a, b) => { a = Buffer.from(String(a || '')); b = Buffer.from(String(b || '')); return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b); };

async function tgApi(token, method, payload) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify(payload || {}) });
    return await r.json().catch(() => ({ ok: false }));
  } catch (_) { return { ok: false, description: 'tarmoq' }; } finally { clearTimeout(t); }
}
async function loadRow(admin) { const { data } = await admin.from('app_data').select('data').eq('id', ROW).maybeSingle(); return (data && data.data) || {}; }
const saveRow = (admin, d) => admin.from('app_data').upsert({ id: ROW, data: d, updated_at: new Date().toISOString() });

// Xodimning ruxsatlari (supabaseAdmin.requireStaffAuth bilan bir xil manba: staff_roles → role_permissions)
async function permsOf(admin, staff) {
  if (staff.role === 'admin') return { admin: true, keys: new Set() };
  const { data: links } = await admin.from('staff_roles').select('role_id').eq('staff_id', staff.id);
  const ids = (links || []).map((r) => r.role_id); if (!ids.length) return { admin: false, keys: new Set() };
  const { data: rp } = await admin.from('role_permissions').select('permission_id, permissions(key)').in('role_id', ids);
  return { admin: false, keys: new Set((rp || []).map((x) => x.permissions && x.permissions.key).filter(Boolean)) };
}

// Tez yuklash (Netlify sinxron funksiya chegarasi ~10 s): faqat kerakli filial, filiallar PARALLEL
async function loadFor(admin, filial) {
  const bq = filial ? admin.from('app_data_branches').select('branch_key,data').eq('branch_key', filial) : admin.from('app_data_branches').select('branch_key,data');
  const [{ data: row }, { data: fresh }, cashOn, ledOn] = await Promise.all([admin.from('app_data').select('data').eq('id', 'main').maybeSingle(), bq, cashAuthorityOn(admin), ledgerAuthorityOn(admin)]);
  const data = (row && row.data) || {}, src = { ...(data.branchStore || {}) };
  (fresh || []).forEach((r) => { if (r.data) src[r.branch_key] = r.data; });
  const bs = {}; Object.keys(src).forEach((k) => { if (!filial || k === filial) bs[k] = src[k]; });
  await Promise.all(Object.keys(bs).map(async (k) => {
    let b = bs[k];
    if (cashOn) b = overlayBranch(b, await loadBalances(admin, k));
    if (ledOn) b = overlayBranchLedger(b, await loadLedger(admin, k)).branch;
    bs[k] = b;
  }));
  return { ...data, branchStore: bs };
}
async function answer(admin, cfg, msg) {
  const chatId = String(msg.chat.id), text = String(msg.text || '').trim().slice(0, 200);
  const send = (t) => tgApi(cfg.token, 'sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML', disable_web_page_preview: true });
  const m = /^\/([a-z]+)(?:@\w+)?\s*(.*)$/i.exec(text); if (!m) return;
  const cmd = m[1].toLowerCase(), arg = m[2].trim();
  if (cmd === 'start') {
    // v25.6.9: taxmin qilib topishdan himoya — chat bo'yicha 15 daqiqada 5 ta noto'g'ri urinish
    cfg.fails = cfg.fails || {}; const f = cfg.fails[chatId] || { n: 0, t: Date.now() };
    if (Date.now() - f.t > 15 * 60e3) { f.n = 0; f.t = Date.now(); }
    if (f.n >= 5) return send("Juda ko'p noto'g'ri urinish — 15 daqiqadan keyin qayta urinib ko'ring.");
    const code = arg.replace(/\D/g, '').slice(0, 8), c = code && cfg.codes && cfg.codes[code];
    if (!c || c.exp < Date.now()) { f.n++; cfg.fails[chatId] = f; await saveRow(admin, cfg); return send("Kod noto'g'ri yoki muddati tugagan. Ilovada Sozlamalar → Telegram bot orqali yangi kod oling."); }
    delete cfg.fails[chatId];
    cfg.links = cfg.links || {}; cfg.links[chatId] = { staffId: c.staffId, at: Date.now() }; delete cfg.codes[code];
    await saveRow(admin, cfg); return send('✅ Ulandi. Buyruqlar uchun /yordam');
  }
  const link = cfg.links && cfg.links[chatId];
  if (!link) return send("Avval ulang: ilovada Sozlamalar → Telegram bot → kod oling, so'ng shu yerga /start KOD yozing.");
  const { data: staff } = await admin.from('staff').select('id,name,role,filial,active').eq('id', link.staffId).maybeSingle();
  if (!staff || staff.active === false) return send('Hisobingiz faol emas.');
  if (cmd === 'yordam' || cmd === 'help') return send(Q.HELP);
  const need = cmd === 'mahsulot' ? Q.PERM.ombor : Q.PERM[cmd];
  if (!need) return send("Noma'lum buyruq. /yordam");
  const P = await permsOf(admin, staff);
  if (!P.admin && !P.keys.has(need)) return send("Bu buyruq uchun ruxsatingiz yo'q.");
  // foyda — ilovadagi kabi tannarx ko'rish huquqi ham kerak
  if (cmd === 'foyda' && !P.admin && !P.keys.has('tannarx.view')) return send("Foydani ko'rish uchun «tannarx» ruxsati kerak.");
  const filial = P.admin ? null : staff.filial;
  const data = await exports._load(admin, filial);
  const o = { filial, supp: P.admin || P.keys.has('taminotchilar.view') };
  const out = cmd === 'foyda' ? Q.foyda(data, arg, o) : cmd === 'xarajat' ? Q.xarajat(data, arg, o) : cmd === 'qarz' ? Q.qarz(data, o)
    : cmd === 'kassa' ? Q.kassa(data, o) : cmd === 'ombor' ? Q.ombor(data, o) : Q.mahsulot(data, arg, o);
  return send(out.slice(0, 4000));
}

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']); if (methodErr) return methodErr;
  let admin; try { admin = getAdminClient(); } catch (e) { return serverError(e, 'telegram-query', 'Server sozlanmagan'); }
  const hdr = (event.headers || {})['x-telegram-bot-api-secret-token'];
  // ── Telegram webhook ──
  if (hdr) {
    const cfg = await loadRow(admin);
    if (!cfg.token || !sameSecret(hdr, cfg.secret)) return json({ error: 'Not found' }, 404);
    try {
      const upd = parseBody(event) || {}, msg = upd.message;
      // Takroriy yetkazish (Telegram javob kutmay qolsa qayta yuboradi) — bitta xabarga bitta javob
      // alohida qator — asosiy sozlamani (ulash kodlari) ustidan yozib yubormasin
      if (Number.isSafeInteger(upd.update_id)) {
        const { data: lr } = await admin.from('app_data').select('data').eq('id', ROW + '_upd').maybeSingle();
        const last = lr && lr.data && lr.data.bot === cfg.token.split(':')[0] ? Number(lr.data.last) || 0 : 0;
        if (last && upd.update_id <= last) return json({ ok: true, dup: true }, 200);
        await admin.from('app_data').upsert({ id: ROW + '_upd', data: { bot: cfg.token.split(':')[0], last: upd.update_id }, updated_at: new Date().toISOString() });
      }
      if (msg && msg.text && msg.chat && msg.chat.type === 'private') await answer(admin, cfg, msg);
    } catch (e) { console.error('[telegram-query]', e && e.message); }
    return json({ ok: true }, 200);   // Telegram qayta yubormasligi uchun doim 200
  }
  // ── Ilovadan ──
  const body = parseBody(event);
  if (!body || !['status', 'setup', 'link_code', 'unlink'].includes(body.action)) return json({ error: "Noma'lum amal" }, 400);
  const auth = await requireStaffAuth(event, admin, { requireAdmin: body.action === 'setup' || body.action === 'status', fn: 'telegram-query' });
  if (!auth.ok) return auth.response;
  try {
    const cfg = await loadRow(admin);
    if (body.action === 'status') {
      let bot = null; if (cfg.token) { const me = await tgApi(cfg.token, 'getMe'); bot = me.ok && me.result ? me.result.username : null; }
      return json({ ok: true, set: !!cfg.token, bot, links: Object.keys(cfg.links || {}).length }, 200);
    }
    if (body.action === 'setup') {
      const token = String(body.token || '').trim();
      if (!TOKEN_RE.test(token)) return json({ error: "Token formati noto'g'ri" }, 400);
      const me = await tgApi(token, 'getMe'); if (!me.ok) return json({ error: 'Token ishlamadi: ' + String(me.description || '').slice(0, 120) }, 400);
      const base = process.env.URL || process.env.DEPLOY_PRIME_URL; if (!base) return json({ error: 'Sayt manzili aniqlanmadi (URL)' }, 500);
      const secret = crypto.randomBytes(24).toString('hex');
      const wh = await tgApi(token, 'setWebhook', { url: base.replace(/\/$/, '') + '/.netlify/functions/telegram-query', secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true });
      if (!wh.ok) return json({ error: 'Webhook o\'rnatilmadi: ' + String(wh.description || '').slice(0, 120) }, 400);
      await tgApi(token, 'setMyCommands', { commands: [['foyda', 'Foyda: bugun/hafta/oy'], ['xarajat', 'Xarajatlar'], ['qarz', 'Qarzlar'], ['kassa', 'Kassalar'], ['ombor', 'Kam qolgan mahsulot'], ['mahsulot', 'Mahsulot qoldig\'i'], ['yordam', 'Buyruqlar']].map(([command, description]) => ({ command, description })) });
      await saveRow(admin, { ...cfg, token, secret, links: cfg.links || {}, codes: {} });
      return json({ ok: true, bot: me.result.username }, 200);
    }
    if (!cfg.token) return json({ error: "Bot hali sozlanmagan — administratorga ayting" }, 409);
    if (body.action === 'link_code') {
      const codes = {}; Object.entries(cfg.codes || {}).forEach(([k, v]) => { if (v.exp > Date.now()) codes[k] = v; });
      const code = String(crypto.randomInt(10000000, 100000000));   // 8 xonali codes[code] = { staffId: auth.staff.id, exp: Date.now() + CODE_TTL };
      await saveRow(admin, { ...cfg, codes });
      const me = await tgApi(cfg.token, 'getMe');
      return json({ ok: true, code, bot: me.ok && me.result ? me.result.username : null, minutes: 15 }, 200);
    }
    // unlink — faqat o'z ulanishlari
    const links = {}; Object.entries(cfg.links || {}).forEach(([k, v]) => { if (v.staffId !== auth.staff.id) links[k] = v; });
    await saveRow(admin, { ...cfg, links });
    return json({ ok: true }, 200);
  } catch (e) { return serverError(e, 'telegram-query', 'Server xatosi'); }
};
exports.handler = require('./_lib/monitor').wrap('telegram-query', exports.handler);
exports._load = loadFor;
