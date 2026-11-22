// v25.3 — OMMAVIY VITRINA (xaridorlar uchun onlayn do'kon): katalog, buyurtma, holat — SOF funksiyalar (testlanadi).
// Server funksiyasi: netlify/functions/shop-public.js. Ma'lumot: filialning `shop` kaliti (js/dokon.js bilan bir xil shakl).
//
// XAVFSIZLIK QOIDALARI:
//   • Narx va qoldiq — FAQAT serverda hisoblanadi (brauzer yuborgan narx e'tiborsiz). Tannarx, partiya, foyda — chiqmaydi.
//   • Faqat yoqilgan do'kon (shop.settings.enabled), arxivlanmagan, narxi va qoldig'i bor mahsulot ko'rinadi.
//   • Buyurtma: telefon (+998), ism, 1–30 mahsulot, miqdor ≤ qoldiq; kuryer — manzil shart. Pul/ombor o'zgarmaydi —
//     xodim «Sotuvga o'tkazish» bilan oddiy savdo qiladi (js/dokon.js).
//   • Holat — faqat buyurtma bilan birga berilgan maxfiy kalit (tk) bilan.
'use strict';
const crypto = require('crypto');
const { fifoCostMap, unitCost, basePrice, branchOwn } = require('./pricing');
const FWRound = require('../../../js/fw-round.js');

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round(num(n) * 100) / 100;
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const STATUS = { new: 'Qabul qilindi', preparing: 'Tayyorlanmoqda', ready: "Yo'lda / tayyor", done: 'Yetkazildi', cancelled: 'Bekor qilindi' };
const LIMITS = { items: 30, qty: 999, statusIds: 20 };

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[ʻʼ'‘’]/g, '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'dokon';
}
const isHttps = (u) => typeof u === 'string' && /^https:\/\/[^\s"'<>]{4,600}$/i.test(u);

// Faol do'konlar ro'yxati: [{ key, slug, shop }] — branchStore (app_data + app_data_branches birlashtirilgan)
function enabledShops(data) {
  const bs = (data && data.branchStore) || {};
  const out = [];
  for (const key of Object.keys(bs)) {
    const shop = bs[key] && bs[key].shop;
    if (!shop || !shop.settings || !shop.settings.enabled) continue;
    out.push({ key, slug: shop.settings.slug ? slugify(shop.settings.slug) : slugify(shop.settings.name || (data.settings && data.settings.company) || key), shop });
  }
  return out;
}
// slug bo'yicha (bo'lmasa — yagona yoqilgan do'kon). Topilmasa — null
function findShop(data, slug) {
  const list = enabledShops(data);
  if (slug) return list.find((s) => s.slug === slugify(slug)) || (list.length === 1 ? list[0] : null);   // bitta do'kon bo'lsa — eski havola ham ochiladi
  return list.length ? list[0] : null;
}

function stockMap(batches) {
  const m = new Map();
  for (const b of Array.isArray(batches) ? batches : []) {
    if (!b || (b.status && b.status !== 'active')) continue;
    const left = num(b.qty) - num(b.sold);
    if (left > 0) m.set(String(b.pid), (m.get(String(b.pid)) || 0) + left);
  }
  return m;
}

// Mahsulot vitrina narxi (USD; so'mli do'konda 1 000 so'mga yaxlit bo'ladigan qilib) va eski narx (chegirma bo'lsa)
// v25.6.10 (egasi): KO'P OLGANDA NARX — mahsulotda bulkMin (necha donadan) va bulkPriceUsd; faqat dona narxidan arzon bo'lsa amal qiladi.
// qty berilsa va qty >= bulkMin bo'lsa — dona narxi o'rniga shu narx (chegirmadan ham arzon bo'lsa).
function bulkOf(p) { const m = Math.round(num(p && p.bulkMin)), u = num(p && p.bulkPriceUsd); return m >= 2 && m <= 9999 && u > 0 ? { min: m, usd: u } : null; }
function shopPriceUsd(p, ctx, qty) {
  const regular = basePrice(p, unitCost(p, ctx.costMap), 'retail', ctx.own);
  const d = (ctx.discounts || []).find((x) => x && String(x.pid) === String(p.id) && num(x.priceUsd) > 0);
  const usd = d ? num(d.priceUsd) : regular;
  const toShop = (u) => (ctx.cur === 'USD' || !(u > 0) || !(ctx.rate > 0) ? r2(u) : FWRound.roundPrice(u * ctx.rate, 1000) / ctx.rate);
  const one = toShop(usd), bk = bulkOf(p), bUsd = bk ? toShop(bk.usd) : 0;
  const bulk = bk && bUsd > 0 && bUsd < one ? { min: bk.min, usd: bUsd } : null;
  const unit = bulk && num(qty) >= bulk.min ? bulk.usd : one;
  return { usd: unit, oneUsd: one, bulk, oldUsd: d && regular > usd ? toShop(regular) : null };
}
const shopMoney = (usd, ctx) => (ctx.cur === 'USD' ? r2(usd) : Math.round(num(usd) * ctx.rate));

function publicImages(p) {
  const a = (Array.isArray(p.images) && p.images.length ? p.images : [p.image]).filter(isHttps);
  return a.slice(0, 6);
}

// Katalog konteksti (narx va qoldiq uchun) — branch: filialning ma'lumoti (ledger qo'llangan)
function catalogCtx(data, key, branch) {
  const st = (data && data.settings) || {};
  const shop = (branch && branch.shop) || {};
  const ss = shop.settings || {};
  return {
    key, cur: ss.currency === 'USD' ? 'USD' : 'UZS', rate: num(st.usdUzs),
    costMap: fifoCostMap(branch && branch.batches), stock: stockMap(branch && branch.batches),
    own: branchOwn(st, key), discounts: Array.isArray(shop.discounts) ? shop.discounts : [], feeUzs: num(ss.feeUzs),
  };
}

function publicProduct(p, ctx) {
  if (!p || p.archived || p.directSale) return null;
  const q = ctx.stock.get(String(p.id)) || 0;
  if (!(q > 0)) return null;
  const pr = shopPriceUsd(p, ctx);
  if (!(pr.usd > 0)) return null;
  const specs = [p.param1, p.param2, p.size, p.unit && p.unit !== 'dona' ? 'Birlik: ' + p.unit : ''].map((x) => clip(x, 80)).filter(Boolean);
  return {
    id: p.id, name: clip(p.name, 140), sku: clip(p.sku, 40), brand: clip(p.brand, 40), cat: clip(p.cat, 60),
    price: shopMoney(pr.usd, ctx), old: pr.oldUsd ? shopMoney(pr.oldUsd, ctx) : null,
    stock: Math.min(99, Math.floor(q)), img: publicImages(p), specs, desc: clip(p.desc || p.note, 400),
    warranty: warrantyOf(p),   // v25.6.10: 3 / 6 / 12 oy (to'liq texnik kafolat) yoki null
    bulk: pr.bulk ? { min: pr.bulk.min, price: shopMoney(pr.bulk.usd, ctx) } : null,   // v25.6.10: ko'p olganda dona narxi
  };
}

// v25.6.10: kategoriya rasmlari (faqat https) — katalog kartochkalari bir xil (rasm yoki bir xil ikonka)
function publicCatImgs(ss) {
  const m = ss && ss.catImg && typeof ss.catImg === 'object' ? ss.catImg : {}, out = {};
  Object.keys(m).slice(0, 100).forEach((k) => { if (isHttps(m[k])) out[clip(k, 80)] = m[k]; });
  return out;
}
// v25.6.10: olib ketish joylari (do'kon + «Filial» turidagi filiallar) — nomi, manzili, 2 ta telefon
function pickupPoints(data, found) {
  const st = (data && data.settings) || {}, names = st.branchNames || {}, cfg = st.branchCfg || {}, bs = (data && data.branchStore) || {};
  const pt = (key, ss, main) => ({ key, main: !!main, name: clip((ss && ss.name) || names[key] || (key === 'baza' ? 'Asosiy ombor' : key), 60),
    address: clip(ss && ss.address, 160), phone: fmtPhone(ss && ss.phone), phone2: fmtPhone(ss && ss.phone2),
    lat: ss && Number.isFinite(+ss.lat) && ss.lat !== null && ss.lat !== '' ? +ss.lat : null, lng: ss && Number.isFinite(+ss.lng) && ss.lng !== null && ss.lng !== '' ? +ss.lng : null });
  const out = [pt(found.key, found.shop.settings || {}, true)];
  if (found.key === 'baza') Object.keys(cfg).filter((k) => k !== 'baza' && cfg[k] && cfg[k].type === 'filial').slice(0, 20)
    .forEach((k) => { const ss = ((bs[k] || {}).shop || {}).settings || {}; out.push(pt(k, { ...ss, name: ss.name || names[k] }, false)); });
  return out;
}
// Ommaviy katalog javobi (keshlanadi): do'kon ma'lumoti + mahsulotlar
function buildCatalog(data, found, branch) {
  const ctx = catalogCtx(data, found.key, branch);
  const ss = found.shop.settings || {};
  const products = (Array.isArray(data.products) ? data.products : []).map((p) => publicProduct(p, ctx)).filter(Boolean);
  const banners = (Array.isArray(found.shop.banners) ? found.shop.banners : []).filter((b) => b && b.active !== false && isHttps(b.url)).slice(0, 5).map((b) => ({ url: b.url, title: clip(b.title, 80) }));
  const fee = num(ss.feeUzs), freeMin = num(ss.freeMinUzs);
  return {
    shop: {
      slug: found.slug, name: clip(ss.name || (data.settings && data.settings.company) || 'Onlayn doʻkon', 60), about: clip(ss.about, 300),
      phone: fmtPhone(ss.phone || (data.settings && data.settings.shopPhone)) || clip(ss.phone || (data.settings && data.settings.shopPhone), 24),
      phone2: fmtPhone(ss.phone2),   // v25.6.10: ikkinchi raqam (bo'sh bo'lsa — ko'rinmaydi)
      address: clip(ss.address || (data.settings && data.settings.shopAddress), 160),
      wa: ss.waOn !== false ? clip(ss.wa, 24) : '', tg: ss.tgOn !== false ? clip(ss.tg, 40).replace(/^@/, '') : '',
      cur: ctx.cur, delivery: !!ss.delivery, fee: ctx.cur === 'USD' && ctx.rate > 0 ? r2(fee / ctx.rate) : fee,
      freeMin: ctx.cur === 'USD' && ctx.rate > 0 ? r2(freeMin / ctx.rate) : freeMin,
      lat: Number.isFinite(+ss.lat) && ss.lat !== null && ss.lat !== '' ? +ss.lat : null, lng: Number.isFinite(+ss.lng) && ss.lng !== null && ss.lng !== '' ? +ss.lng : null,
    },
    banners, products, cats: publicCatImgs(ss), points: pickupPoints(data, found), at: new Date().toISOString(),
  };
}

// v25.6.10: ko'rsatish uchun yagona ko'rinish — «+998 XX XXX XX XX» (noto'g'ri bo'lsa — '')
function fmtPhone(s) {
  const n = normPhone(s); if (!n) return '';
  return `+998 ${n.slice(4, 6)} ${n.slice(6, 9)} ${n.slice(9, 11)} ${n.slice(11, 13)}`;
}
const WARRANTY = [3, 6, 12];
function warrantyOf(p) { const m = Math.round(num(p && p.warrantyM)); return WARRANTY.includes(m) ? m : null; }
// +998 90 123 45 67 / 901234567 → '+998901234567' yoki null
function normPhone(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.length === 9) d = '998' + d;
  return /^998\d{9}$/.test(d) ? '+' + d : null;
}

// Buyurtmani tekshirish va narxlarni SERVERDA hisoblash. { ok, order, tk } yoki { ok:false, error }
function buildOrder(data, found, branch, body, now = new Date()) {
  const b = body || {};
  const name = clip(b.name, 80), phone = normPhone(b.phone), address = clip(b.address, 160), note = clip(b.note, 200);
  const delivery = b.delivery === 'courier' ? 'courier' : 'pickup';
  if (name.length < 2) return { ok: false, error: 'Ismingizni yozing' };
  if (!phone) return { ok: false, error: 'Telefon raqam notoʻgʻri (+998 XX XXX XX XX)' };
  // v25.6.10: qo'shimcha raqam — ixtiyoriy; yozilgan bo'lsa to'g'ri bo'lishi shart
  const phone2raw = String(b.phone2 || '').replace(/\D/g, '');
  const phone2 = phone2raw.length > 3 ? normPhone(b.phone2) : null;
  if (phone2raw.length > 3 && !phone2) return { ok: false, error: 'Qoʻshimcha raqam notoʻgʻri (+998 XX XXX XX XX)' };
  const ss = found.shop.settings || {};
  if (delivery === 'courier' && !ss.delivery) return { ok: false, error: 'Bu doʻkonda yetkazib berish yoʻq — olib ketishni tanlang' };
  if (delivery === 'courier' && address.length < 5) return { ok: false, error: 'Yetkazib berish manzilini yozing' };
  const raw = Array.isArray(b.items) ? b.items : [];
  if (!raw.length) return { ok: false, error: 'Savat boʻsh' };
  if (raw.length > LIMITS.items) return { ok: false, error: `Bir buyurtmada ${LIMITS.items} tadan ortiq mahsulot boʻlmaydi` };
  const ctx = catalogCtx(data, found.key, branch);
  const byId = new Map((Array.isArray(data.products) ? data.products : []).map((p) => [String(p && p.id), p]));
  const seen = new Set(), items = [];
  for (const it of raw) {
    const pid = String(it && it.pid), qty = Number(it && it.qty);
    if (seen.has(pid)) return { ok: false, error: 'Mahsulot takrorlangan' };
    seen.add(pid);
    if (!Number.isInteger(qty) || qty < 1 || qty > LIMITS.qty) return { ok: false, error: 'Miqdor notoʻgʻri' };
    const p = byId.get(pid), pub = p && publicProduct(p, ctx);
    if (!pub) return { ok: false, error: 'Mahsulot sotuvda yoʻq (tugagan boʻlishi mumkin)', pid };
    if (qty > (ctx.stock.get(pid) || 0)) return { ok: false, error: `«${pub.name}» omborda ${pub.stock} ta qoldi`, pid };
    const pq = shopPriceUsd(p, ctx, qty);
    items.push({ pid: p.id, sku: clip(p.sku, 40), name: clip(p.name, 120), qty, priceUsd: pq.usd, ...(pq.bulk && qty >= pq.bulk.min ? { bulk: true } : {}), ...(warrantyOf(p) ? { warrantyM: warrantyOf(p) } : {}) });
  }
  const subtotalUsd = r2(items.reduce((a, i) => a + i.qty * i.priceUsd, 0));
  let deliveryUsd = 0;
  const fee = num(ss.feeUzs), freeMin = num(ss.freeMinUzs);
  if (delivery === 'courier' && ss.delivery && fee > 0 && ctx.rate > 0 && !(freeMin > 0 && subtotalUsd * ctx.rate >= freeMin)) deliveryUsd = r2(fee / ctx.rate);
  const iso = now.toISOString();
  const tk = crypto.randomBytes(9).toString('base64url');
  const seq = (+found.shop.seq || 0) + 1;
  const order = {
    id: 'so' + crypto.randomBytes(6).toString('hex'), no: seq, createdAt: iso, updatedAt: iso, source: 'site', delivery,
    cust: { name, phone, ...(phone2 && phone2 !== phone ? { phone2 } : {}), address: delivery === 'courier' ? address : '' }, items, subtotalUsd, deliveryUsd, totalUsd: r2(subtotalUsd + deliveryUsd),
    note, status: 'new', history: [{ st: 'new', at: iso, by: 'Vitrina' }], tk,
  };
  return { ok: true, order, tk, seq, total: orderTotal(order, ctx, fee), cur: ctx.cur };
}
// Xaridor ko'radigan jami — vitrina valyutasida, qatorlar narxidan (so'mda har narx 1 000 ga yaxlit) + yetkazish (so'mda aniq)
function orderTotal(o, ctx, feeUzs) {
  if (ctx.cur === 'USD') return r2(o.totalUsd);
  const items = (o.items || []).reduce((a, i) => a + num(i.qty) * Math.round(num(i.priceUsd) * ctx.rate), 0);
  const dlv = num(o.deliveryUsd) > 0 ? (num(feeUzs) > 0 ? Math.round(num(feeUzs)) : Math.round(num(o.deliveryUsd) * ctx.rate)) : 0;
  return items + dlv;
}

// Holat: [{ id, tk }] → faqat kaliti mos kelganlar
function orderStatuses(shop, list, ctx) {
  const orders = Array.isArray(shop && shop.orders) ? shop.orders : [];
  const out = [];
  for (const q of (Array.isArray(list) ? list : []).slice(0, LIMITS.statusIds)) {
    const o = orders.find((x) => x && String(x.id) === String(q && q.id));
    if (!o || !o.tk || typeof q.tk !== 'string' || o.tk.length !== q.tk.length || !crypto.timingSafeEqual(Buffer.from(o.tk), Buffer.from(q.tk))) continue;
    out.push({ id: o.id, no: o.no, status: o.status, label: STATUS[o.status] || o.status, at: o.updatedAt || o.createdAt,
      total: orderTotal(o, ctx, ctx.feeUzs), items: (o.items || []).reduce((a, i) => a + num(i.qty), 0), delivery: o.delivery });
  }
  return out;
}

module.exports = { orderTotal, STATUS, LIMITS, slugify, enabledShops, findShop, stockMap, shopPriceUsd, catalogCtx, publicProduct, buildCatalog, normPhone, fmtPhone, warrantyOf, buildOrder, orderStatuses };
