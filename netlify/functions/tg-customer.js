// Netlify Function — MIJOZNI TELEGRAM BOTGA ULASH (v25.1). Xodim mijoz kartasidan:
//   POST { action:'link',   custId, filial? } — shaxsiy havola (t.me/<bot>?start=cus<kod>) va SMS matni     [mijozlar.view | mijozlar.edit]
//   POST { action:'check',  custId, filial? } — botda «Start» bosganlarni hozir tekshiradi → ulangan/yo'q       [mijozlar.view | mijozlar.edit]
//   POST { action:'status', filial? }         — filialdagi ulangan mijozlar (id → ism/username)                    [mijozlar.view | mijozlar.edit]
//   POST { action:'unlink', custId, filial? } — uzish (kod ham bekor)                                             [mijozlar.edit]
// Xodim faqat o'z filiali mijozlari bilan ishlaydi (resolveFilial). Bot tokeni javobga qo'shilmaydi.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError } = require('./_lib/supabaseAdmin');
const { TOKEN_RE } = require('./_lib/dailyReportRun');
const tc = require('./_lib/tgCustomers');

const VIEW = ['mijozlar.view', 'mijozlar.edit'];

async function loadCtx(admin, filial) {
  const { data: row } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
  const main = (row && row.data) || {}; const st = main.settings || {};
  let branch = null;
  try { const r = await admin.from('app_data_branches').select('data').eq('branch_key', filial).maybeSingle(); branch = r.data && r.data.data; } catch (_) {}
  branch = branch || (main.branchStore && main.branchStore[filial]) || {};
  return { st, branch };
}
const brandOf = (st) => String(st.company || process.env.FW_BRAND_NAME || 'POWERFUL GROUP').slice(0, 60);

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const body = parseBody(event);
  if (!body || !['link', 'check', 'status', 'unlink'].includes(body.action)) return json({ error: "Noto'g'ri so'rov" }, 400);
  if (body.action !== 'status' && !(Number.isSafeInteger(Number(body.custId)) && Number(body.custId) > 0)) return json({ error: 'Mijoz notoʻgʻri' }, 400);
  let admin;
  try { admin = getAdminClient(); } catch (e) { return serverError(e, 'tg-customer', 'Server sozlanmagan'); }
  const auth = await requireStaffAuth(event, admin, { loadPermissions: true, fn: 'tg-customer' });
  if (!auth.ok) return auth.response;
  const need = body.action === 'unlink' ? ['mijozlar.edit'] : VIEW;
  if (!auth.isAdmin && !need.some((p) => auth.permKeys.has(p))) return json({ error: "Bu amal uchun ruxsatingiz yo'q" }, 403);
  const filial = resolveFilial(auth, body.filial);
  try {
    const { st, branch } = await loadCtx(admin, filial);
    const custId = Number(body.custId);
    const cust = (branch.customers || []).find((c) => c && Number(c.id) === custId);
    if (body.action !== 'status' && !cust) return json({ error: 'Mijoz topilmadi' }, 404);
    const token = st.tgBotToken;
    if (body.action === 'status') {
      const { links } = await tc.loadLinks(admin);
      const out = {}; for (const [k, v] of Object.entries(links)) { const [f, id] = k.split(':'); if (f === filial) out[id] = { name: v.name || null, username: v.username || null, linkedAt: v.linkedAt }; }
      return json({ ok: true, links: out }, 200);
    }
    if (body.action === 'unlink') { await tc.unlink(admin, filial, custId); return json({ ok: true }, 200); }
    if (!TOKEN_RE.test(String(token || ''))) return json({ error: 'Telegram bot ulanmagan — Sozlamalar → Telegram bot' }, 409);
    if (body.action === 'link') {
      const me = await tc.tgApi(token, 'getMe', {});
      if (!me.ok || !me.result || !me.result.username) return json({ error: 'Bot javob bermadi — tokenni tekshiring' }, 502);
      const { code, linked } = await tc.codeFor(admin, filial, custId);
      const url = `https://t.me/${me.result.username}?start=${code}`;
      const text = `${brandOf(st)}: qarz va toʻlov eslatmalarini Telegramda olish uchun havolani oching va «Start» ni bosing: ${url}`;
      return json({ ok: true, url, text, phone: cust.phone || null, linked: linked ? { name: linked.name || null, username: linked.username || null } : null }, 200);
    }
    // check
    const nameOf = async (f, id) => (f === filial ? ((branch.customers || []).find((c) => c && Number(c.id) === Number(id)) || {}).name : null);
    await tc.sweep(admin, token, brandOf(st), nameOf);
    const { links } = await tc.loadLinks(admin);
    const l = links[tc.key(filial, custId)];
    return json({ ok: true, linked: l ? { name: l.name || null, username: l.username || null } : null }, 200);
  } catch (e) {
    return serverError(e, 'tg-customer', 'Bajarilmadi');
  }
};
