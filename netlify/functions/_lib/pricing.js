// v24.8 (37-migratsiya): NARX VA TANNARX MAXFIYLIGI — server tomonida yagona qoida.
//
// • Sotuv narxi bazada saqlanmaydi: tannarx × (1 + ustama%). Tannarx — mahsulotda Direct Sale narxi
//   (directSale && dsCostUsd > 0) bo'lsa o'sha, aks holda filialdagi ENG ESKI faol partiya tannarxi (FIFO).
//   Chakana = round(tannarx × (1 + markupPct/100)) (standart 25%), optom = round(…optMarkupPct…, 2) (standart 15%).
//   Bu — ilovadagi (js/main.js, js/sotuvchi.js) hisob bilan bir xil; SQL'dagi sale_checkout_v37 ham shunday.
// • Tannarxni faqat administrator va «tannarx.view» ruxsati bor xodim ko'radi (egasi qarori, 2026-10-17).
//   Qolganlarga mahsulot narxi TAYYOR holda beriladi (retailUsd / optUsd), tannarx maydonlari olib tashlanadi.
// • Chegirma chegarasi: admin bo'lmagan xodim narxni asosdan ko'pi bilan settings.maxDiscountPct (standart 10)
//   foizga tushiradi; asos — savdo rejimiga qarab (chakana / optom).
const DEFAULT_MARKUP = 25;
const DEFAULT_OPT_MARKUP = 15;
const DEFAULT_MAX_DISCOUNT = 10;

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

function canSeeCost(auth) {
  return !!(auth && (auth.isAdmin || (auth.permKeys && auth.permKeys.has('tannarx.view'))));
}
function canSeePartners(auth) {
  if (!auth) return false;
  if (auth.isAdmin) return true;
  const k = auth.permKeys;
  return !!(k && (k.has('hamkorlar.view') || k.has('hamkorlar.edit') || k.has('hamkorlar.calc')));
}

// v25 (egasi qarori 2026-11-10): MUSTAQIL filial o'z narxini belgilaydi — settings.branchCfg[filial] =
//   { type:'mustaqil', own:{ r: chakana ustama %, o: optom ustama %, max: maks. chegirma % } }. Belgilanmagan qiymat — umumiy.
function branchOwn(settings, filial) {
  const c = settings && settings.branchCfg && filial ? settings.branchCfg[filial] : null;
  if (!c || c.type !== 'mustaqil' || !c.own || typeof c.own !== 'object') return null;
  const v = (x, lo, hi) => { const n = num(x); return n == null || n < lo || n > hi ? null : n; };
  const own = { r: v(c.own.r, 0, 1000), o: v(c.own.o, 0, 1000), max: v(c.own.max, 0, 100) };
  return own.r == null && own.o == null && own.max == null ? null : own;
}
function maxDiscountPct(settings, own) {
  if (own && own.max != null) return own.max;
  const v = num(settings && settings.maxDiscountPct);
  if (v == null) return DEFAULT_MAX_DISCOUNT;
  return Math.min(100, Math.max(0, v));
}

// Partiyalar ro'yxatidan (ilova JSON shakli yoki bazadagi qatorlar) — har mahsulot uchun eng eski faol partiya tannarxi
function fifoCostMap(batches) {
  const best = new Map();
  for (const b of Array.isArray(batches) ? batches : []) {
    if (!b) continue;
    const st = b.status;
    if (st === 'transit' || st === 'empty' || st === 'deleted' || b.deleted_at) continue;
    const qty = num(b.qty) || 0, sold = num(b.sold) || 0;
    if (qty - sold <= 1e-9) continue;
    const pid = String(b.pid);
    const d = String(b.date || b.batch_date || '');
    const id = num(b.id);
    const cur = best.get(pid);
    if (!cur || d < cur.d || (d === cur.d && id != null && cur.id != null && id < cur.id)) best.set(pid, { d, id, cost: num(b.costUsd != null ? b.costUsd : b.cost_usd) || 0 });
  }
  const out = new Map();
  for (const [k, v] of best) out.set(k, v.cost);
  return out;
}

function unitCost(p, costMap) {
  if (p && p.directSale && (num(p.dsCostUsd) || 0) > 0) return num(p.dsCostUsd);
  return (costMap && costMap.get(String(p && p.id))) || 0;
}
function basePrice(p, cost, mode, own) {
  const c = num(cost) || 0;
  if (mode === 'wholesale') {
    const pct = own && own.o != null ? own.o : p && p.optMarkupPct != null && num(p.optMarkupPct) != null ? num(p.optMarkupPct) : DEFAULT_OPT_MARKUP;
    return Math.round(c * (1 + pct / 100) * 100) / 100;
  }
  const pct = own && own.r != null ? own.r : p && p.markupPct != null && num(p.markupPct) != null ? num(p.markupPct) : DEFAULT_MARKUP;
  return Math.round(c * (1 + pct / 100));
}

// Chegirma chegarasi (sale_checkout_v37 qo'llanmagan bazada — JS'da o'sha qoida). null — joiz; aks holda {pid, floor, max}
function discountViolation({ products, settings, items, discPct, mode, costMap, filial }) {
  const own = branchOwn(settings, filial);
  const max = maxDiscountPct(settings, own);
  const d = Math.min(100, Math.max(0, num(discPct) || 0));
  const byId = new Map((Array.isArray(products) ? products : []).filter(p => p && p.id != null).map(p => [String(p.id), p]));
  for (const it of Array.isArray(items) ? items : []) {
    if (!it) continue;
    const p = byId.get(String(it.pid));
    const cost = unitCost(p || { id: it.pid }, costMap);
    if (!(cost > 0)) continue;
    const base = basePrice(p, cost, mode === 'wholesale' ? 'wholesale' : 'retail', own);
    const floor = base * (1 - max / 100);
    const eff = (num(it.sellUsd) || 0) * (1 - d / 100);
    if (eff < floor - 0.01) return { pid: it.pid, floor: Math.round(floor * 100) / 100, max };
  }
  return null;
}

// Bazadagi partiyalardan (ledger authority) — filial bo'yicha FIFO tannarx
async function dbFifoCostMap(admin, filial, pids) {
  const ids = [...new Set((pids || []).map(Number).filter(n => Number.isSafeInteger(n) && n > 0))];
  if (!ids.length) return new Map();
  const { data, error } = await admin.from('batches').select('id,pid,qty,sold,cost_usd,status,batch_date,deleted_at').eq('filial', filial).in('pid', ids);
  if (error) throw error;
  return fifoCostMap(data || []);
}

// ── app-data-load: tannarxni ko'rmaydigan xodim uchun javobni tozalash ──
const PRODUCT_COST_FIELDS = ['cost', 'costUsd', 'dsCostUsd', 'lastCostUsd', 'avgCostUsd'];
const BATCH_COST_FIELDS = ['costUsd', 'cost_usd', 'baseCostUsd', 'bankFeeUsd', 'customsUsd', 'rates', 'items'];
const SALE_COST_FIELDS = ['costUsd', 'profitUsd', 'netUsd'];
const ITEM_COST_FIELDS = ['costUsd', 'cost', 'profitUsd', 'allocs', 'side'];
const PARTNER_PUBLIC_FIELDS = ['id', 'name', 'filial'];

const omit = (o, keys) => { if (!o || typeof o !== 'object') return o; const r = { ...o }; for (const k of keys) delete r[k]; return r; };

function redactBranch(b) {
  if (!b || typeof b !== 'object') return b;
  const out = { ...b };
  if (Array.isArray(b.batches)) out.batches = b.batches.map(x => omit(x, BATCH_COST_FIELDS));
  if (Array.isArray(b.writeoffs)) out.writeoffs = b.writeoffs.map(w => w && typeof w === 'object'
    ? { ...omit(w, ['totalCostUsd']), ...(Array.isArray(w.items) ? { items: w.items.map(i => omit(i, ['cost', 'costUsd'])) } : {}) } : w);
  if (Array.isArray(b.sales)) out.sales = b.sales.map(s => s && typeof s === 'object'
    ? { ...omit(s, SALE_COST_FIELDS), ...(Array.isArray(s.items) ? { items: s.items.map(i => omit(i, ITEM_COST_FIELDS)) } : {}) } : s);
  return out;
}

// data — app_data shakli (branchStore filtrlangan). filial — xodimning o'z filiali (narx shu filial partiyalaridan).
function redactForStaff(data, auth) {
  if (!data || typeof data !== 'object') return data;
  let out = data;
  if (!canSeeCost(auth)) {
    const bs = data.branchStore && typeof data.branchStore === 'object' ? data.branchStore : {};
    const own = bs[auth && auth.filial] || {};
    const costMap = fifoCostMap(own.batches);
    const bo = branchOwn(data.settings, auth && auth.filial);   // v25: mustaqil filial — o'z narxi
    const products = Array.isArray(data.products) ? data.products.map(p => {
      if (!p || typeof p !== 'object') return p;
      const c = unitCost(p, costMap);
      const dsReady = !!(p.directSale && p.dsSuppId != null && (num(p.dsCostUsd) || 0) > 0);   // Direct Sale tayyor (narxning o'zi — yo'q)
      return { ...omit(p, PRODUCT_COST_FIELDS), retailUsd: basePrice(p, c, 'retail', bo), optUsd: basePrice(p, c, 'wholesale', bo), priceFromServer: true, dsReady };
    }) : data.products;
    const branchStore = {};
    for (const [k, b] of Object.entries(bs)) branchStore[k] = redactBranch(b);
    out = { ...out, products, branchStore, costHidden: true };
  }
  if (!canSeePartners(auth)) {
    // Hamkor turidagi xarajat yozadigan xodimga — faqat nom (tanlash uchun); pul maydonlari va davrlar — yo'q
    const canPickPartner = !!(auth && auth.permKeys && auth.permKeys.has('xarajatlar.create'));
    const partners = canPickPartner && Array.isArray(out.partners)
      ? out.partners.filter(p => p && p.id != null).map(p => Object.fromEntries(PARTNER_PUBLIC_FIELDS.filter(k => k in p).map(k => [k, p[k]])))
      : [];
    const { partnerPeriods, ...rest } = out;
    out = { ...rest, partners, partnersHidden: true };
  }
  return out;
}

// ── Saqlash: tannarxni ko'rmaydigan xodim yuborgan (maydonlari olib tashlangan) yozuvlarga
// bazadagi yashirin maydonlarni qaytarib qo'yish — aks holda u saqlaganda tannarx o'chib ketardi.
function restoreHidden(existingList, incomingList, fields, nested) {
  if (!Array.isArray(incomingList)) return incomingList;
  const ex = new Map((Array.isArray(existingList) ? existingList : []).filter(x => x && x.id != null).map(x => [String(x.id), x]));
  return incomingList.map(x => {
    if (!x || typeof x !== 'object' || x.id == null) return x;
    const prev = ex.get(String(x.id));
    if (!prev) return omit(x, fields);   // yangi yozuv — tannarxni bu xodim belgilay olmaydi
    const y = { ...x };
    for (const f of fields) { if (f in prev) y[f] = prev[f]; else delete y[f]; }
    if (nested && Array.isArray(x[nested.key])) y[nested.key] = restoreLines(prev[nested.key], x[nested.key], nested.fields);
    return y;
  });
}
// Savdo qatorlari (ID'siz) — o'rni va mahsulot (pid) bo'yicha: mos kelsa bazadagi tannarx qaytadi, aks holda — yo'q
function restoreLines(prevLines, lines, fields) {
  if (!Array.isArray(lines)) return lines;
  const pv = Array.isArray(prevLines) ? prevLines : [];
  return lines.map((l, i) => {
    if (!l || typeof l !== 'object') return l;
    const p = pv[i];
    const y = omit(l, fields);
    if (p && typeof p === 'object' && String(p.pid) === String(l.pid)) for (const f of fields) if (f in p) y[f] = p[f];
    return y;
  });
}
function restoreProducts(existingProducts, incomingProducts) {
  const list = restoreHidden(existingProducts, incomingProducts, PRODUCT_COST_FIELDS);
  return Array.isArray(list) ? list.map(p => (p && typeof p === 'object' ? omit(p, ['retailUsd', 'optUsd', 'priceFromServer', 'dsReady']) : p)) : list;
}
function restoreBranch(existingBranch, incomingBranch) {
  if (!incomingBranch || typeof incomingBranch !== 'object') return incomingBranch;
  const ex = existingBranch || {};
  const out = { ...incomingBranch };
  if ('batches' in out) out.batches = restoreHidden(ex.batches, out.batches, BATCH_COST_FIELDS.filter(f => f !== 'cost_usd'));
  if ('sales' in out) out.sales = restoreHidden(ex.sales, out.sales, SALE_COST_FIELDS, { key: 'items', fields: ITEM_COST_FIELDS });
  return out;
}
// Hamkorlar yashirilgan xodim — partners/partnerPeriods ni umuman o'zgartirmaydi (server qiymati qoladi;
// hamkor turidagi xarajatdan kelgan «invested» o'zgarishini app-data-save o'zi hisoblaydi)
function restorePartnersTop(existingTop, incomingTop) {
  const out = { ...incomingTop };
  delete out.partners; delete out.partnerPeriods; delete out.partnersHidden; delete out.costHidden;
  return out;
}

// Server amali javobi (savdo, qaytarish): tannarxni ko'rmaydigan xodimga — tannarx/foyda va partiya tannarxi yo'q
function redactLedgerResponse(out, auth) {
  if (!out || typeof out !== 'object' || canSeeCost(auth)) return out;
  const r = omit(out, ['costUsd', 'profitUsd', 'netUsd']);
  if (Array.isArray(r.items)) r.items = r.items.map(i => omit(i, ITEM_COST_FIELDS));
  if (r.authority && typeof r.authority === 'object') {
    r.authority = { ...r.authority };
    if (Array.isArray(r.authority.batches)) r.authority.batches = r.authority.batches.map(b => omit(b, ['costUsd', 'baseCostUsd']));
    if (r.authority.sale && typeof r.authority.sale === 'object') {
      r.authority.sale = omit(r.authority.sale, SALE_COST_FIELDS);
      if (Array.isArray(r.authority.sale.items)) r.authority.sale.items = r.authority.sale.items.map(i => omit(i, ITEM_COST_FIELDS));
    }
  }
  return r;
}

// Saqlash javobidagi server qiymatlari va bazadagi qoldiqlar (ledger snapshot) — o'sha qoida
function redactSnapshot(snap, auth) {
  if (!snap || typeof snap !== 'object' || canSeeCost(auth)) return snap;
  return { ...snap, ...(Array.isArray(snap.batches) ? { batches: snap.batches.map(b => omit(b, ['costUsd', 'baseCostUsd'])) } : {}) };
}
function redactTopValues(vals, auth, ownBranch) {
  if (!vals || typeof vals !== 'object') return vals;
  const d = redactForStaff({ ...vals, branchStore: { [auth && auth.filial]: ownBranch || {} } }, auth);
  for (const k of ['branchStore', 'costHidden', 'partnersHidden']) delete d[k];
  if (!('products' in vals)) delete d.products;
  if (!('partners' in vals)) delete d.partners;
  return d;
}
function redactBranchValues(vals, auth) {
  return !vals || typeof vals !== 'object' || canSeeCost(auth) ? vals : redactBranch(vals);
}

module.exports = { branchOwn,
  redactLedgerResponse, redactBranch, redactSnapshot, redactTopValues, redactBranchValues,
  DEFAULT_MAX_DISCOUNT, canSeeCost, canSeePartners, maxDiscountPct, fifoCostMap, unitCost, basePrice, discountViolation, dbFifoCostMap,
  redactForStaff, restoreProducts, restoreBranch, restorePartnersTop, PRODUCT_COST_FIELDS, BATCH_COST_FIELDS,
};
