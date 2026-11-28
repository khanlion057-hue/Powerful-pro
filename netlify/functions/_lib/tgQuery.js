// v25.9 — YAGONA BOT: xodim so'rov buyruqlari (/foyda /xarajat /qarz /kassa /ombor /mahsulot /yordam) endi ASOSIY botda
// (avval alohida «So'rov boti» edi — telegram-query). Ulanishlar o'sha joyda qoladi: app_data 'tg_query_bot' {links, codes, fails}
// — Telegram'da xodimning chat raqami barcha botlarda bir xil, shuning uchun eski ulanishlar yo'qolmaydi.
//   start(…)   — «/start <8 xonali kod>» (ilovadagi «Telegramda ulash»): taxmin qilishdan himoya (15 daqiqada 5 urinish)
//   command(…) — ulangan xodim chati: buyruqqa javob; ulanmagan chat — null (dispatcher xaridorga «Bu buyruq mavjud emas» deydi)
// Ulanganda shu chat uchun xodim menyusi (BotCommandScopeChat) o'rnatiladi; uzilganda — o'chiriladi.
'use strict';
const { cashAuthorityOn, loadBalances, overlayBranch } = require('./cashAuthority');
const { ledgerAuthorityOn, loadLedger, overlayBranchLedger } = require('./ledgerAuthority');
const Q = require('./botQuery');
const BT = require('./botTexts');
const IN = require('./tgInbox');

const ROW = 'tg_query_bot', CODE_TTL = 15 * 60e3;

async function loadRow(admin) { const { data } = await admin.from('app_data').select('data').eq('id', ROW).maybeSingle(); return (data && data.data) || {}; }
const saveRow = (admin, d) => admin.from('app_data').upsert({ id: ROW, data: d, updated_at: new Date().toISOString() }, { onConflict: 'id' });

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

// Xodim menyusi — faqat shu chatda (xaridorlar ko'rmaydi). Til — xodimning Telegram tili.
const staffMenu = (token, chatId, lang) => IN.tgApi(token, 'setMyCommands', { commands: BT.cmds(BT.T[lang === 'ru' ? 'ru' : 'uz'].cmdsStaff), scope: { type: 'chat', chat_id: Number(chatId) } });
const dropMenu = (token, chatId) => IN.tgApi(token, 'deleteMyCommands', { scope: { type: 'chat', chat_id: Number(chatId) } });

async function start(admin, ctx, msg, arg, send) {
  const cfg = await loadRow(admin);
  const chatId = String(msg.chat.id);
  // taxmin qilib topishdan himoya — chat bo'yicha 15 daqiqada 5 ta noto'g'ri urinish
  cfg.fails = cfg.fails || {}; const f = cfg.fails[chatId] || { n: 0, t: Date.now() };
  if (Date.now() - f.t > 15 * 60e3) { f.n = 0; f.t = Date.now(); }
  if (f.n >= 5) return send("Juda ko'p noto'g'ri urinish — 15 daqiqadan keyin qayta urinib ko'ring.");
  const code = arg.replace(/\D/g, '').slice(0, 8), c = code && cfg.codes && cfg.codes[code];
  if (!c || c.exp < Date.now()) { f.n++; cfg.fails[chatId] = f; await saveRow(admin, cfg); return send(BT.T[BT.langOf(msg.from)].linkBad); }
  delete cfg.fails[chatId];
  cfg.links = cfg.links || {}; cfg.links[chatId] = { staffId: c.staffId, at: Date.now() }; delete cfg.codes[code];
  await saveRow(admin, cfg);
  await staffMenu(ctx.token, chatId, BT.langOf(msg.from));
  return send('✅ Ulandi! Endi pastdagi «Menyu» tugmasidan yoki yozib soʻrang:\n/foyda — foyda\n/kassa — kassalar\n/qarz — qarzlar\n/xarajat — xarajatlar\n/ombor — kam qolgan mahsulot');
}

// null — chat xodimga ulanmagan (dispatcher o'zi javob beradi)
async function command(admin, ctx, msg, cmd, arg, send) {
  const cfg = await loadRow(admin);
  const chatId = String(msg.chat.id);
  const link = cfg.links && cfg.links[chatId];
  if (!link) return null;
  const { data: staff } = await admin.from('staff').select('id,name,role,filial,active').eq('id', link.staffId).maybeSingle();
  if (!staff || staff.active === false) return BT.STAFF_CMDS.includes(cmd) ? send('Hisobingiz faol emas.') : null;
  if (cmd === 'start') return send(BT.T[BT.langOf(msg.from)].staffHi);
  if (cmd === 'yordam' || cmd === 'help') return send(Q.HELP);
  const need = cmd === 'mahsulot' ? Q.PERM.ombor : Q.PERM[cmd];
  if (!need) return send(BT.T[BT.langOf(msg.from)].noCmd + '. /yordam');
  const P = await permsOf(admin, staff);
  if (!P.admin && !P.keys.has(need)) return send("Bu buyruq uchun ruxsatingiz yo'q.");
  // foyda — ilovadagi kabi tannarx ko'rish huquqi ham kerak
  if (cmd === 'foyda' && !P.admin && !P.keys.has('tannarx.view')) return send("Foydani ko'rish uchun «tannarx» ruxsati kerak.");
  const filial = P.admin ? null : staff.filial;
  const data = await module.exports._load(admin, filial);
  const o = { filial, supp: P.admin || P.keys.has('taminotchilar.view') };
  const out = cmd === 'foyda' ? Q.foyda(data, arg, o) : cmd === 'xarajat' ? Q.xarajat(data, arg, o) : cmd === 'qarz' ? Q.qarz(data, o)
    : cmd === 'kassa' ? Q.kassa(data, o) : cmd === 'ombor' ? Q.ombor(data, o) : Q.mahsulot(data, arg, o);
  return send(out.slice(0, 4000));
}

module.exports = { ROW, CODE_TTL, loadRow, saveRow, permsOf, start, command, staffMenu, dropMenu, _load: loadFor };
