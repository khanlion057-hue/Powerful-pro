// Netlify Function — v25.3: OMMAVIY VITRINA (xaridorlar uchun, KIRISHSIZ). dokon.html shu funksiyadan foydalanadi.
//   GET  ?s=<slug>                         → { shop, banners, products } (30 s brauzer, 60 s CDN kesh)
//   POST { a:'order', s, name, phone, address, delivery:'pickup'|'courier', note, items:[{pid,qty}], hp }
//        → { ok, no, id, tk, total, cur }   — buyurtma filialning shop.orders ga (versiya bilan, 3 urinish)
//   POST { a:'status', s, list:[{id,tk}] } → { ok, orders:[...] }  — faqat maxfiy kalit (tk) mos kelganlar
// Himoya: narx/qoldiq — serverda; tannarx chiqmaydi; IP bo'yicha cheklov (monitor.js) + buyurtmaga telefon va IP bo'yicha
// soatlik chegara (48-migratsiya; bo'lmasa — faqat monitor cheklovi); «hp» (bot tuzog'i) to'ldirilsa — jim rad.
'use strict';
const { getAdminClient, json, methodGuard, parseBody, serverError } = require('./_lib/supabaseAdmin');
const { versionOn, parseConflict } = require('./_lib/appDataVersion');
const { ledgerAuthorityOn, loadLedger, overlayBranchLedger } = require('./_lib/ledgerAuthority');
const { TOKEN_RE, tgSend } = require('./_lib/dailyReportRun');
const { chatsFor, evtOn } = require('./_lib/tgEvents');
const SP = require('./_lib/shopPublic');
const ops = require('./_lib/opsGuard');

const SLUG_RE = /^[a-z0-9-]{1,40}$/;
const cached = (obj) => ({ statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30', 'Netlify-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' }, body: JSON.stringify(obj) });

// app_data + filial qatorlari (versiyalar bilan). raw — bazadagi asl filial ma'lumoti (yozish uchun), view — jurnal qo'llangan (o'qish uchun)
async function loadShopData(admin, slug) {
  const verOn = await versionOn(admin);
  const [{ data: row, error }, { data: rows, error: e2 }] = await Promise.all([
    admin.from('app_data').select('data').eq('id', 'main').maybeSingle(),
    admin.from('app_data_branches').select(verOn ? 'branch_key,data,version' : 'branch_key,data'),
  ]);
  if (error) throw error; if (e2) throw e2;
  const main = (row && row.data) || {};
  const bs = { ...(main.branchStore || {}) }, ver = {};
  (rows || []).forEach((r) => { if (r.data) bs[r.branch_key] = r.data; ver[r.branch_key] = r.version != null ? Number(r.version) : 0; });
  const data = { ...main, branchStore: bs };
  const found = SP.findShop(data, slug);
  if (!found) return { data, found: null };
  let view = bs[found.key] || {};
  if (await ledgerAuthorityOn(admin)) view = overlayBranchLedger(view, await loadLedger(admin, found.key)).branch;
  return { data, found, raw: bs[found.key] || {}, view, version: verOn ? (ver[found.key] || 0) : null, hasRow: found.key in ver, verOn };
}

async function notify(admin, st, found, order, total, cur) {
  try {
    if (!TOKEN_RE.test(String(st.tgBotToken || '')) || !evtOn(st, 'shop')) return;
    const chats = chatsFor(st, 'shop', { filial: found.key }); if (!chats.length) return;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const F = require('./_lib/tgFmt');   // v25.6.10: jadval — Mahsulot | Soni; JAMI shu jadvalda, birlik sarlavhada
    const its = order.items.slice(0, 15), n = order.items.reduce((t, i) => t + F.num(i.qty), 0);
    const tbl = F.table([{ h: 'Mahsulot' }, { h: 'Soni', w: 5, r: true }, { h: cur === 'USD' ? 'Jami $' : "Jami so'm", w: 12, r: true }],
      [...its.map((i) => [i.name + (i.warrantyM ? ` (${i.warrantyM} oy)` : ''), F.q(i.qty), '']), ...(order.items.length > 15 ? [`... yana ${order.items.length - 15} xil`] : [])],
      [[`JAMI (${order.items.length})`, F.q(n), cur === 'USD' ? F.m2(total) : F.sp(total)]]);
    const text = `🛒 <b>Yangi onlayn buyurtma #${order.no}</b>\n👤 ${esc(order.cust.name)} · ${esc(SP.fmtPhone(order.cust.phone) || order.cust.phone)}${order.cust.phone2 ? ' · ' + esc(SP.fmtPhone(order.cust.phone2)) : ''}\n${order.delivery === 'courier' ? '🚚 Yetkazib berish: ' + esc(order.cust.address) : '🏬 Olib ketadi'}\n${tbl}${order.note ? '\n📝 ' + esc(order.note) : ''}`;
    await Promise.all(chats.map((c) => ops.within(tgSend(st.tgBotToken, c, text), 4000, null)));
  } catch (_) { /* xabar — ikkinchi darajali */ }
}

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['GET', 'POST']);
  if (methodErr) return methodErr;
  let admin;
  try { admin = getAdminClient(); } catch (e) { return serverError(e, 'shop-public', 'Doʻkon vaqtincha ishlamayapti'); }

  try {
    if (event.httpMethod === 'GET') {
      const slug = String((event.queryStringParameters && event.queryStringParameters.s) || '').toLowerCase();
      if (slug && !SLUG_RE.test(slug)) return json({ error: 'Doʻkon topilmadi' }, 404);
      const L = await loadShopData(admin, slug || null);
      if (!L.found) return json({ error: 'Doʻkon topilmadi yoki hozircha yopiq' }, 404);
      return cached(SP.buildCatalog(L.data, L.found, L.view));
    }

    const body = parseBody(event) || {};
    const slug = String(body.s || '').toLowerCase();
    if (slug && !SLUG_RE.test(slug)) return json({ error: 'Doʻkon topilmadi' }, 404);

    if (body.a === 'status') {
      const L = await loadShopData(admin, slug || null);
      if (!L.found) return json({ error: 'Doʻkon topilmadi' }, 404);
      return json({ ok: true, orders: SP.orderStatuses(L.raw.shop, body.list, SP.catalogCtx(L.data, L.found.key, L.view)) }, 200);
    }

    if (body.a !== 'order') return json({ error: "Notoʻgʻri soʻrov" }, 400);
    if (body.hp) return json({ ok: true, no: 0 }, 200);   // bot tuzog'i — jim
    const phone = SP.normPhone(body.phone);
    if (phone && ops.opsOn()) {
      const ip = ops.clientIp(event);
      const [a, b] = await Promise.all([ops.rateHit(admin, 'ordph:' + phone, 5, 3600), ip ? ops.rateHit(admin, 'ordip:' + ip, 10, 3600) : { ok: true }]);
      if (!a.ok || !b.ok) return json({ error: 'Juda koʻp buyurtma — birozdan soʻng urinib koʻring yoki qoʻngʻiroq qiling' }, 429);
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const L = await loadShopData(admin, slug || null);
      if (!L.found) return json({ error: 'Doʻkon topilmadi yoki hozircha yopiq' }, 404);
      const shop = L.raw.shop && typeof L.raw.shop === 'object' ? L.raw.shop : {};
      // v25.6.10: takroriy yuborish (aloqa uzilib, mijoz «Qayta yuborish» bosdi) — o'sha buyurtma qaytadi, ikkinchisi yaratilmaydi
      const ck = typeof body.k === 'string' && /^[A-Za-z0-9-]{8,40}$/.test(body.k) ? body.k : null;
      const dup = ck && (Array.isArray(shop.orders) ? shop.orders : []).find((o) => o && o.ck === ck);
      if (dup) return json({ ok: true, no: dup.no, id: dup.id, tk: dup.tk, total: dup.ckTotal, cur: dup.ckCur, dup: true }, 200);
      const r = SP.buildOrder(L.data, L.found, L.view, body);
      if (!r.ok) return json({ error: r.error, pid: r.pid }, 400);
      if (ck) Object.assign(r.order, { ck, ckTotal: r.total, ckCur: r.cur });
      const nextShop = { ...shop, orders: [r.order, ...(Array.isArray(shop.orders) ? shop.orders : [])].slice(0, 3000), seq: r.seq };
      const nextBranch = { ...L.raw, shop: nextShop };
      let err;
      if (L.verOn) {
        ({ error: err } = await admin.rpc('app_data_save_cas', { p_main: null, p_main_base: null, p_keep_branch_debt: true,
          p_branches: [{ key: L.found.key, data: nextBranch, base: L.hasRow ? L.version : 0 }] }));
        if (err && parseConflict(err)) continue;   // orada xodim saqladi — qayta o'qib urinamiz
      } else {
        ({ error: err } = await admin.from('app_data_branches').upsert({ branch_key: L.found.key, data: nextBranch, updated_at: new Date().toISOString() }, { onConflict: 'branch_key' }));
      }
      if (err) throw err;
      await notify(admin, L.data.settings || {}, L.found, r.order, r.total, r.cur);
      return json({ ok: true, no: r.order.no, id: r.order.id, tk: r.tk, total: r.total, cur: r.cur }, 200);
    }
    return json({ error: 'Doʻkon band — bir necha soniyadan soʻng qayta yuboring' }, 409);
  } catch (e) {
    return serverError(e, 'shop-public', 'Doʻkon vaqtincha ishlamayapti');
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('shop-public', exports.handler);
