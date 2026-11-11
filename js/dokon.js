// ════════════════════════════════════════════════════════════
// ONLAYN-DO'KON (v23.3) — vitrina, buyurtmalar, bannerlar, chegirmalar, Telegram bot.
//
// Ma'lumot: filial ichidagi `shop` kaliti (har filialning o'z do'koni):
//   shop.settings  — vitrina sozlamalari (nom, manzil, aloqa, yetkazib berish, joylashuv)
//   shop.banners   — ≤5 rasm (Storage'da, app_data'ga faqat havola)
//   shop.discounts — ≤20 mahsulot, faqat VITRINA narxi (kassa narxiga ta'sir qilmaydi)
//   shop.orders    — buyurtmalar (o'chirilmaydi — faqat holat o'zgaradi)
//   shop.reviews   — xaridor sharhlari
// Ombor va pul bu modulda O'ZGARMAYDI: buyurtma "Sotuvga o'tkazish" orqali oddiy savdo
// oqimiga (server-authoritative checkout, FIFO, kassa) beriladi va savdo bilan bog'lanadi.
// Server himoyasi: netlify/functions/_lib/appDataGuard.js → filterShop / normalizeIncomingShop.
// ════════════════════════════════════════════════════════════

Object.assign(ICONF, {
  link:_svgf("M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"),
  launch:_svgf("M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"),
  copy:_svgf("M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"),
  share:_svgf("M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"),
  tag:_svgf("M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"),
  globe:_svgf("M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"),
  chat:_svgf("M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"),
  car:_svgf("M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"),
  key:_svgf("M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"),
  listNum:_svgf("M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"),
  place:_svgf("M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"),
  gps:_svgf("M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"),
  block:_svgf("M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9A7.902 7.902 0 0 1 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1A7.902 7.902 0 0 1 20 12c0 4.42-3.58 8-8 8z"),
  refresh:_svgf("M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"),
  bag:_svgf("M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 16H6V8h2v2c0 .55.45 1 1 1s1-.45 1-1V8h4v2c0 .55.45 1 1 1s1-.45 1-1V8h2v12z"),
  phone:_svgf("M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"),
  starO:_svgf("M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"),
  lock:_svgf("M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"),
  paste:_svgf("M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"),
  minus:_svgf("M19 13H5v-2h14v2z"),
  up:_svgf("M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"),
});

// ── Holatlar ─────────────────────────────────────────────
const SHOP_ST = {
  new:       { l:'Yangi',          c:'sky',     next:'preparing', act:'Qabul qilish' },
  preparing: { l:'Tayyorlanmoqda', c:'amber',   next:'ready',     act:'Tayyor / yoʻlga chiqdi' },
  ready:     { l:'Yoʻlda / tayyor', c:'purple', next:'done',      act:'Sotuvga oʻtkazish' },
  done:      { l:'Yakunlangan',    c:'emerald' },
  cancelled: { l:'Bekor qilingan', c:'red' },
};
const SHOP_SRC = { site:'Vitrina', telegram:'Telegram', phone:'Telefon', whatsapp:'WhatsApp', manual:'Doʻkonda' };
const SHOP_MAX = { banners:5, discounts:20 };
const SHOP_ACTIVE = ['new', 'preparing', 'ready'];

const shopNowIso = () => new Date().toISOString();
const shopCanCfg = () => hasPerm('sozlamalar.edit');
const shopCanOrders = () => hasPerm('savdo.create');
// v25: boshqa filialning do'kon ma'lumoti (Baza vitrinasida filial tanlanganda buyurtma o'sha filialga tushadi)
function shopDataOf(br) {
  if (!br || br === S.branch) return shopData();
  if (!S._store) S._store = {};
  if (!S._store[br] || typeof S._store[br] !== 'object') S._store[br] = {};
  const st = S._store[br];
  if (!st.shop || typeof st.shop !== 'object') st.shop = {};
  const sh = st.shop;
  if (!sh.settings || typeof sh.settings !== 'object') sh.settings = {};
  ['banners', 'discounts', 'orders', 'reviews'].forEach(k => { if (!Array.isArray(sh[k])) sh[k] = []; });
  if (!sh.seq) sh.seq = sh.orders.reduce((m, o) => Math.max(m, +o.no || 0), 0);
  return sh;
}
// Baza vitrinasida tanlanadigan joylar: Baza + «Filial» turidagi filiallar («Mustaqil» — o'z do'koni)
function sfBranches() {
  if (S.branch !== 'baza' || typeof flKeys !== 'function') return [];
  const ks = flKeys().filter(k => flCfg(k).type === 'filial');
  return ks.length ? ['baza', ...ks] : [];
}
function sfStock(pid) {
  const br = SF && SF.br;
  if (!br || br === S.branch) return getStock(pid);
  const bs = ((S._store && S._store[br]) || {}).batches || [];
  return bs.filter(b => b && b.pid === +pid && b.status === 'active').reduce((a, b) => a + Math.max(0, (+b.qty || 0) - (+b.sold || 0)), 0);
}
function sfSetBranch(k) { SF.br = k; Object.keys(SF.cart).forEach(pid => { const st = sfStock(pid); if (SF.cart[pid] > st) { if (st > 0) SF.cart[pid] = st; else delete SF.cart[pid]; } }); sfRender(); }
function shopData() {
  if (!S.shop || typeof S.shop !== 'object') S.shop = {};
  const sh = S.shop;
  if (!sh.settings || typeof sh.settings !== 'object') sh.settings = {};
  ['banners', 'discounts', 'orders', 'reviews'].forEach(k => { if (!Array.isArray(sh[k])) sh[k] = []; });
  if (!sh.seq) sh.seq = sh.orders.reduce((m, o) => Math.max(m, +o.no || 0), 0);
  return sh;
}
function shopCfg() {
  const st = shopData().settings;
  return {
    enabled: !!st.enabled,
    name: st.name || fwBrand().name,
    slug: st.slug || shopSlugify(st.name || fwBrand().name),
    about: st.about || '', phone: st.phone || (S.settings && S.settings.shopPhone) || '',
    address: st.address || (S.settings && S.settings.shopAddress) || '',
    waOn: st.waOn !== false, wa: st.wa || '', tgOn: st.tgOn !== false, tg: st.tg || '',
    currency: st.currency === 'USD' ? 'USD' : 'UZS',
    delivery: !!st.delivery, feeUzs: +st.feeUzs || 0, freeKm: +st.freeKm || 0, freeMinUzs: +st.freeMinUzs || 0,
    lat: Number.isFinite(+st.lat) && st.lat !== null && st.lat !== '' ? +st.lat : null,
    lng: Number.isFinite(+st.lng) && st.lng !== null && st.lng !== '' ? +st.lng : null,
    bot: st.bot || null,
  };
}
function shopSlugify(s) {
  const map = { "ʻ":'', "ʼ":'', "'":'', '‘':'', '’':'', 'ў':'o', 'ғ':'g', 'қ':'q', 'ҳ':'h' };
  return String(s || '').toLowerCase().replace(/[ʻʼ'‘’ўғқҳ]/g, ch => map[ch] ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'dokon';
}
function shopMoney(usd, cur) {
  cur = cur || shopCfg().currency;
  if (cur === 'USD') return CUR.fmtUsd(usd);
  return fwRound1000(CUR.toUzs(+usd || 0)).toLocaleString('en-US').replace(/,/g, ' ') + ' UZS';   // v24.5: 1 000 ga yaxlit
}
// Ixcham ko'rinish (KPI plitkalari uchun): 5,97 mln UZS · $12.4K
function shopMoneyShort(usd, cur) {
  cur = cur || shopCfg().currency;
  const trim = (n, d) => n.toFixed(d).replace(/\.?0+$/, '').replace('.', ',');
  if (cur === 'USD') { const v = +usd || 0; return Math.abs(v) >= 1e5 ? '$' + trim(v / 1e3, 1) + 'K' : CUR.fmtUsd(v); }
  const v = CUR.toUzs(+usd || 0);
  if (Math.abs(v) >= 1e9) return trim(v / 1e9, 2) + ' mlrd';
  if (Math.abs(v) >= 1e6) return trim(v / 1e6, 2) + ' mln';
  return shopMoney(usd, cur);
}
function shopRegularPrice(p) { return Math.round(sellPrice(p, getCostFIFO(p.id)) * 100) / 100; }
function shopDiscountOf(pid) { return shopData().discounts.find(d => String(d.pid) === String(pid)) || null; }
// v24.5 (egasi qarori): so'mda narx 1 000 ga yaxlit (eng yaqin ming) — vitrina, buyurtma va savdo bir xil summani ko'radi
function shopPrice(p) {
  const d = shopDiscountOf(p.id);
  const usd = d && +d.priceUsd > 0 ? +d.priceUsd : shopRegularPrice(p);
  return shopCfg().currency === 'USD' || !(usd > 0) ? usd : fwRound1000(CUR.toUzs(usd)) / CUR.usdUzs;
}
function shopOrderTotals(items, delivery) {
  const sub = Math.round(items.reduce((s, it) => s + (+it.qty || 0) * (+it.priceUsd || 0), 0) * 100) / 100;
  const c = shopCfg();
  let deliveryUsd = 0;
  if (delivery === 'courier' && c.delivery && c.feeUzs > 0) {
    const free = c.freeMinUzs > 0 && CUR.toUzs(sub) >= c.freeMinUzs;
    if (!free) deliveryUsd = Math.round(CUR.toUsd(c.feeUzs) * 100) / 100;
  }
  return { subtotalUsd: sub, deliveryUsd, totalUsd: Math.round((sub + deliveryUsd) * 100) / 100 };
}
function shopFmtTime(iso) {
  const d = new Date(iso); if (!Number.isFinite(d.getTime())) return '';
  const today = td(), day = d.toISOString().slice(0, 10);
  const hm = d.toLocaleTimeString('uz-UZ', { hour:'2-digit', minute:'2-digit' });
  return day === today ? `Bugun, ${hm}` : `${day.split('-').reverse().join('.')} ${hm}`;
}
const shopPhoneDigits = (s) => String(s || '').replace(/\D/g, '');

// Ikki qurilma nusxasini birlashtirish (admin _safeCloudSave'dan chaqiriladi).
// Buyurtma/sharh: ID bo'yicha, yangiroq (updatedAt) ustun; sozlama bloklari: lokal (shu
// qurilmada tahrirlangan) yoki serverdagi — qaysi biri yangiroq tahrirlangan bo'lsa.
function fwShopMerge(remote, local) {
  if (!local || typeof local !== 'object') return remote;
  if (!remote || typeof remote !== 'object') return local;
  const ts = (x) => { const t = Date.parse((x && (x.updatedAt || x.createdAt)) || 0); return Number.isFinite(t) ? t : 0; };
  const union = (a, b) => {
    const m = new Map();
    (Array.isArray(a) ? a : []).forEach(x => { if (x && x.id != null) m.set(String(x.id), x); });
    (Array.isArray(b) ? b : []).forEach(x => { if (!x || x.id == null) return; const o = m.get(String(x.id)); if (!o || ts(x) >= ts(o)) m.set(String(x.id), x); });
    return Array.from(m.values()).sort((x, y) => ts(y) - ts(x));
  };
  const cfgNewer = (local.cfgAt || 0) >= (remote.cfgAt || 0);
  const base = cfgNewer ? local : remote;
  return { ...remote, ...local,
    settings: base.settings, banners: base.banners, discounts: base.discounts, cfgAt: Math.max(local.cfgAt || 0, remote.cfgAt || 0),
    orders: union(remote.orders, local.orders), reviews: union(remote.reviews, local.reviews),
    seq: Math.max(+remote.seq || 0, +local.seq || 0) };
}
function shopTouchCfg() { shopData().cfgAt = Date.now(); }

// ════════════════════════════════════════════════════════════
// SAHIFA
// ════════════════════════════════════════════════════════════
function pgDokon() {
  const el = document.getElementById('pg-dokon'); if (!el) return;
  const sh = shopData(), c = shopCfg();
  const cnt = (st) => sh.orders.filter(o => o.status === st).length;
  const activeSum = sh.orders.filter(o => SHOP_ACTIVE.includes(o.status)).reduce((s, o) => s + (+o.totalUsd || 0), 0);
  if (!S.dkTab) S.dkTab = 'orders';
  if (S.dkSt === undefined) S.dkSt = 'new';
  const tile = (ic, cls, lbl, on) => `<button class="dk-tool" style="--c:var(--${cls})" onclick="${on}"><span class="dk-tool-ic">${ICONF[ic]}</span><span>${lbl}</span></button>`;
  const host = location.host || 'example.uz';
  // v25: «Filial» turidagi filial — Baza onlayn-do'konidan foydalanadi (filial sozlamalari: Filial va dillerlar → Filiallar)
  const flMode = S.branch !== 'baza' && typeof flCfg === 'function' ? flCfg(S.branch).type : null;
  el.innerHTML = `
  ${flMode === 'filial' ? `<div class="dk-mode">${ICONF.store || ICONF.globe}<div><b>Bu filial Baza onlayn-doʻkonidan foydalanadi</b><small>Xaridor Baza vitrinasida shu filialni tanlaydi — buyurtmalar shu roʻyxatga tushadi. Oʻz alohida doʻkoni kerak boʻlsa — filial sozlamalarida «Mustaqil»ni tanlang.</small></div></div>` : ''}
  <div class="dk-top">
    <div class="dk-title"><span>${esc(branchName(S.branch))} · vitrina</span><b>${sh.orders.filter(o => SHOP_ACTIVE.includes(o.status)).length} ta faol buyurtma</b></div>
    <button class="dk-pill ${c.enabled ? 'on' : ''}" onclick="dkToggleEnabled()" ${shopCanCfg() ? '' : 'disabled'} title="Vitrinani yoqish / oʻchirish">${c.enabled ? ICONF.globe : ICONF.block}<span>${c.enabled ? 'Ochiq' : 'Yopiq'}</span></button>
    <button class="dk-ibtn" onclick="pgDokon();toast('Yangilandi')" aria-label="Yangilash">${ICONF.refresh}</button>
  </div>

  <section class="dk-hero">
    <div class="dk-hero-id">
      <span class="dk-logo">${ICONF.store}</span>
      <div><b>${esc(c.name)}</b><button class="dk-link" onclick="dkCopyLink()">${ICONF.link}<span>${esc(host)}/${esc(c.slug)}</span></button></div>
    </div>
    <div class="dk-hero-acts">
      <button onclick="dkOpenStorefront()">${ICONF.launch}<span>Ochish</span></button>
      <button onclick="dkCopyLink()">${ICONF.copy}<span>Nusxalash</span></button>
      <button onclick="dkShare()">${ICONF.share}<span>Ulashish</span></button>
    </div>
    <div class="dk-hero-stats">
      <button onclick="dkSetSt('new')" style="--c:var(--sky)"><b>${cnt('new')}</b><span>Yangilar</span></button>
      <button onclick="dkSetSt('preparing')" style="--c:var(--amber)"><b>${cnt('preparing')}</b><span>Tayyorlanmoqda</span></button>
      <button onclick="dkSetSt('ready')" style="--c:var(--purple)"><b>${cnt('ready')}</b><span>Yoʻlda / tayyor</span></button>
    </div>
    <div class="dk-hero-sum"><span>Jarayondagi summa</span><b>${esc(shopMoney(activeSum))}</b></div>
    ${c.enabled ? '' : `<p class="dk-hero-warn">${ICONF.info}<span>Vitrina yopiq — xaridorlar buyurtma bera olmaydi. Tepadagi «Yopiq» tugmasi bilan oching.</span></p>`}
  </section>

  <section class="dk-card">
    <div class="dk-eyebrow">Doʻkonni boshqarish</div>
    <div class="dk-tools">
      ${tile('settings', 'purple', 'Sozlamalar', 'dkSettingsSheet()')}
      ${tile('chart', 'amber', 'Statistika', 'dkStatsSheet()')}
      ${tile('image', 'emerald', 'Bannerlar', 'dkBannersSheet()')}
      ${tile('listNum', 'indigo', 'Kategoriyalar', 'dkCatImgSheet()')}
      ${tile('tag', 'pink', 'Chegirma', 'dkDiscountSheet()')}
      ${tile('send', 'sky', 'Telegram', 'dkTelegramSheet()')}
    </div>
  </section>

  <div class="dk-seg" role="tablist">
    <button role="tab" class="${S.dkTab === 'orders' ? 'on' : ''}" onclick="S.dkTab='orders';pgDokon()">${ICONF.receipt}<span>Cheklar</span></button>
    <button role="tab" class="${S.dkTab === 'reviews' ? 'on' : ''}" onclick="S.dkTab='reviews';pgDokon()">${ICONF.starO}<span>Sharhlar${sh.reviews.length ? ` · ${sh.reviews.length}` : ''}</span></button>
  </div>
  <div id="dk-body"></div>`;
  if (S.dkTab === 'reviews') dkRenderReviews(); else dkRenderOrdersShell();
}

function dkRenderOrdersShell() {
  const box = document.getElementById('dk-body'); if (!box) return;
  const sh = shopData();
  const chip = (k, l) => { const n = k ? sh.orders.filter(o => o.status === k).length : sh.orders.length;
    return `<button class="pm-chip${S.dkSt === k ? ' on' : ''}" style="--c:var(--${k ? SHOP_ST[k].c : 'gold'})" onclick="dkSetSt('${k}')">${l}<em>${n}</em></button>`; };
  box.innerHTML = `
    <div class="kr-search pm-search">${ICONF.search}
      <input type="search" id="dk-q" placeholder="Buyurtma raqami, ism yoki telefon" autocomplete="off" value="${esc(S.dkQ || '')}" oninput="S.dkQ=this.value;dkRenderOrders()">
      ${shopCanOrders() ? `<button type="button" class="pm-sortb" onclick="dkNewOrderSheet()" aria-label="Yangi buyurtma" title="Telefon / doʻkondagi buyurtmani qoʻshish">${ICONF.add}</button>` : ''}
    </div>
    <div class="pm-chips dk-chips">${chip('', 'Hammasi')}${chip('new', 'Yangilar')}${chip('preparing', 'Tayyorlanmoqda')}${chip('ready', 'Yoʻlda / tayyor')}${chip('done', 'Yakunlangan')}${chip('cancelled', 'Bekor')}</div>
    <div id="dk-orders"></div>`;
  dkRenderOrders();
}
function dkSetSt(k) { S.dkSt = k; S.dkTab = 'orders'; pgDokon(); }

function dkRenderOrders() {
  const box = document.getElementById('dk-orders'); if (!box) return;
  const q = String(S.dkQ || '').trim().toLowerCase(), qd = shopPhoneDigits(q);
  const list = shopData().orders.filter(o => (!S.dkSt || o.status === S.dkSt) && (!q
    || String(o.no).includes(q.replace('#', '')) || String(o.cust?.name || '').toLowerCase().includes(q)
    || (qd.length >= 3 && shopPhoneDigits(o.cust?.phone).includes(qd))))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (!list.length) {
    box.innerHTML = `<div class="dk-empty"><span>${ICONF.bag}</span><b>Buyurtmalar yoʻq</b><p>${q ? 'Qidiruv boʻyicha topilmadi.' : (S.dkSt ? 'Bu statusda boʻsh.' : 'Vitrinadan yoki telefon orqali kelgan buyurtmalar shu yerda chiqadi.')}</p>
      ${shopCanOrders() && !q ? `<button class="dk-ghost" onclick="dkNewOrderSheet()">${ICONF.add}<span>Buyurtma qoʻshish</span></button>` : ''}</div>`;
    return;
  }
  box.innerHTML = `<div class="dk-orders">${list.slice(0, 200).map(o => {
    const st = SHOP_ST[o.status] || SHOP_ST.new;
    const items = (o.items || []);
    const names = items.slice(0, 2).map(i => `${esc(i.name)} × ${+i.qty}`).join(', ') + (items.length > 2 ? ` +${items.length - 2}` : '');
    return `<button class="dk-order" style="--c:var(--${st.c})" onclick="dkOrderSheet('${escJsAttr(o.id)}')">
      <div class="dk-order-h"><b>#${+o.no}</b><span class="dk-st">${st.l}</span>${o.test ? '<span class="dk-src">Sinov</span>' : ''}<span class="dk-src">${esc(SHOP_SRC[o.source] || o.source || '')}</span><time>${esc(shopFmtTime(o.createdAt))}</time></div>
      <div class="dk-order-c">${esc(o.cust?.name || 'Xaridor')}${o.cust?.phone ? ` · ${esc(o.cust.phone)}` : ''}</div>
      <div class="dk-order-i">${names || '—'}</div>
      <div class="dk-order-f"><span>${o.delivery === 'courier' ? ICONF.car + 'Yetkazib berish' : ICONF.store + 'Olib ketish'}</span><b>${esc(shopMoney(o.totalUsd))}</b></div>
    </button>`; }).join('')}</div>`;
}

// ── Buyurtma tafsiloti ──
function dkOrderSheet(id) {
  const o = shopData().orders.find(x => String(x.id) === String(id)); if (!o) return;
  const st = SHOP_ST[o.status] || SHOP_ST.new;
  const can = shopCanOrders();
  const lack = (o.items || []).filter(it => SHOP_ACTIVE.includes(o.status) && getStock(it.pid) < it.qty);
  const wa = shopPhoneDigits(o.cust?.phone);
  const hist = (o.history || []).map(h => `<li><b>${esc((SHOP_ST[h.st] || {}).l || h.st)}</b><span>${esc(shopFmtTime(h.at))}${h.by ? ' · ' + esc(h.by) : ''}${h.note ? ' — ' + esc(h.note) : ''}</span></li>`).join('');
  const sale = o.saleId ? S.sales.find(s => String(s.id) === String(o.saleId)) : null;
  const nextBtn = can && st.next
    ? (st.next === 'done' ? `<button class="bs-btn" onclick="dkToSale('${escJsAttr(o.id)}')">${ICONF.cart} Sotuvga oʻtkazish</button>`
                          : `<button class="bs-btn" onclick="dkSetStatus('${escJsAttr(o.id)}','${st.next}')">${ICONF.check} ${st.act}</button>`) : '';
  openSheet({ ic:'receipt', c:st.c, title:`Buyurtma #${+o.no}`, sub:`${st.l} · ${esc(SHOP_SRC[o.source] || '')} · ${esc(shopFmtTime(o.createdAt))}`,
    body:`
      <div class="bs-card">
        <div class="dk-kv"><span>Xaridor</span><b>${esc(o.cust?.name || '—')}</b></div>
        ${o.cust?.phone ? `<div class="dk-kv"><span>Telefon</span><b>${esc(o.cust.phone)}</b></div>` : ''}
        <div class="dk-kv"><span>Olish usuli</span><b>${o.delivery === 'courier' ? 'Yetkazib berish' : 'Doʻkondan olib ketish'}</b></div>
        ${o.cust?.address ? `<div class="dk-kv"><span>Manzil</span><b>${esc(o.cust.address)}</b></div>` : ''}
        ${o.note ? `<div class="dk-kv"><span>Izoh</span><b>${esc(o.note)}</b></div>` : ''}
        ${o.cust?.phone ? `<div class="dk-contact">
          <a class="dk-ghost" href="tel:+${esc(wa)}">${ICONF.phone}<span>Qoʻngʻiroq</span></a>
          <a class="dk-ghost" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">${ICONF.chat}<span>WhatsApp</span></a></div>` : ''}
      </div>
      <div class="bs-card">
        ${(o.items || []).map(it => `<div class="dk-line"><span>${esc(it.name)}<small>${esc(it.sku || '')} · ${+it.qty} × ${esc(shopMoney(it.priceUsd))}</small></span><b>${esc(shopMoney(it.qty * it.priceUsd))}</b></div>`).join('')}
        <div class="dk-kv"><span>Mahsulotlar</span><b>${esc(shopMoney(o.subtotalUsd))}</b></div>
        <div class="dk-kv"><span>Yetkazib berish</span><b>${o.deliveryUsd ? esc(shopMoney(o.deliveryUsd)) : 'Bepul'}</b></div>
        <div class="dk-kv dk-total"><span>Jami</span><b>${esc(shopMoney(o.totalUsd))}</b></div>
      </div>
      ${lack.length ? `<p class="bs-info dk-warn">${ICONF.warning}<span>Omborda yetarli emas: ${lack.map(it => `${esc(it.name)} (bor: ${getStock(it.pid)}, kerak: ${+it.qty})`).join('; ')}. Sotuvga oʻtkazishda kassa haqiqiy qoldiqni tekshiradi.</span></p>` : ''}
      ${sale ? `<p class="bs-info">${ICONF.check}<span>Savdo bilan bogʻlangan: <b>${esc(sale.inv || '')}</b> — ${esc(CUR.fmtUsd(sale.totalUsd))}</span></p>` : ''}
      ${hist ? `<div class="bs-card"><div class="bs-t">Tarix</div><ol class="dk-hist">${hist}</ol></div>` : ''}`,
    foot: (nextBtn || (can && SHOP_ACTIVE.includes(o.status))) ? `<div class="dk-foot">${nextBtn}${can && SHOP_ACTIVE.includes(o.status) ? `<button class="dk-ghost danger" onclick="dkCancelOrder('${escJsAttr(o.id)}')">${ICONF.close}<span>Bekor qilish</span></button>` : ''}</div>` : '' });
}
function dkPushHist(o, st, note) {
  o.history = Array.isArray(o.history) ? o.history : [];
  o.history.push({ st, at: shopNowIso(), by: (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.name) || '', ...(note ? { note } : {}) });
  o.updatedAt = shopNowIso();
}
function dkSetStatus(id, st) {
  if (!shopCanOrders()) { toast("Ruxsatingiz yoʻq", 'error'); return; }
  const o = shopData().orders.find(x => String(x.id) === String(id)); if (!o || !SHOP_ST[st]) return;
  o.status = st; dkPushHist(o, st);
  auditLog(`Onlayn buyurtma #${o.no}: ${SHOP_ST[st].l}`);
  save(); closeSheet(); pgDokon();
  toast(`#${o.no} — ${SHOP_ST[st].l}`);
}
function dkCancelOrder(id) {
  const o = shopData().orders.find(x => String(x.id) === String(id)); if (!o) return;
  openSheet({ ic:'close', c:'red', title:`#${+o.no} — bekor qilish`, sub:'Sabab xaridor tarixida saqlanadi',
    body:`<div class="bs-card"><label class="bs-lbl" for="dk-cr">Sabab</label>
      <input class="bs-in" id="dk-cr" maxlength="160" placeholder="Masalan: xaridor javob bermadi"></div>`,
    foot:`<button class="bs-btn danger" onclick="dkCancelDo('${escJsAttr(o.id)}')">Bekor qilish</button>` });
}
function dkCancelDo(id) {
  if (!shopCanOrders()) { toast("Ruxsatingiz yoʻq", 'error'); return; }
  const o = shopData().orders.find(x => String(x.id) === String(id)); if (!o) return;
  const r = (document.getElementById('dk-cr')?.value || '').trim();
  if (!r) { toast('Sababni yozing', 'error'); return; }
  o.status = 'cancelled'; o.cancelReason = r.slice(0, 160); dkPushHist(o, 'cancelled', o.cancelReason);
  auditLog(`Onlayn buyurtma #${o.no}: bekor qilindi — ${o.cancelReason}`);
  save(); closeSheet(); pgDokon();
}

// Buyurtma → oddiy savdo (ombor, kassa, qarz — mavjud server checkout orqali).
function dkToSale(id) {
  if (!hasPerm('savdo.create')) { toast("Savdo qilishga ruxsatingiz yoʻq", 'error'); return; }
  const o = shopData().orders.find(x => String(x.id) === String(id)); if (!o) return;
  if (S.cart.length && !confirm("Savatda boshqa mahsulotlar bor. Ular oʻrniga shu buyurtma yuklansinmi?")) return;
  const cart = [], miss = [];
  (o.items || []).forEach(it => {
    const p = S.products.find(x => String(x.id) === String(it.pid));
    if (!p) { miss.push(it.name); return; }
    const st = getStock(p.id);
    const qty = Math.min(+it.qty || 0, st);
    if (qty < (+it.qty || 0)) miss.push(`${it.name} (${st} bor)`);
    if (qty > 0) cart.push({ key: uid(), pid: p.id, sku: p.sku, name: p.name, qty, costUsd: getCostFIFO(p.id), sellUsd: +it.priceUsd, lineUsd: qty * +it.priceUsd, manual: true });   // buyurtma narxi saqlanadi
  });
  if (!cart.length) { toast("Omborda bu buyurtma uchun mahsulot yoʻq", 'error'); return; }
  closeSheet();
  S.shopPending = { orderId: o.id, no: o.no };
  go('savdo');
  S.cart = cart;
  const ph = shopPhoneDigits(o.cust?.phone);
  const c = ph.length >= 7 ? S.customers.find(x => shopPhoneDigits(x.phone).endsWith(ph.slice(-9))) : null;
  if (typeof refreshCart === 'function') refreshCart();
  if (c && typeof custSelect === 'function') custSelect(c.id);
  toast(`#${o.no} savatga yuklandi${miss.length ? ' — yetishmaydi: ' + miss.join(', ') : ''}`, miss.length ? 'warning' : 'success');
}
// main.js → _savdoCommitInner: savdo yozilgandan keyin (save()dan oldin) chaqiriladi
function shopOnSaleCommitted(sale) {
  const p = S.shopPending; if (!p || !sale) return;
  S.shopPending = null;
  const o = shopData().orders.find(x => String(x.id) === String(p.orderId)); if (!o) return;
  o.status = 'done'; o.saleId = sale.id; o.saleInv = sale.inv; dkPushHist(o, 'done', sale.inv);
  auditLog(`Onlayn buyurtma #${o.no} → savdo ${sale.inv}`);
}

// ── Qo'lda buyurtma (telefon / WhatsApp / do'konda) ──
let DK_DRAFT = null;
function dkNewOrderSheet() {
  if (!shopCanOrders()) { toast("Ruxsatingiz yoʻq", 'error'); return; }
  DK_DRAFT = DK_DRAFT || { items: [], source: 'phone', delivery: 'pickup' };
  dkDraftRender();
}
function dkDraftRender() {
  const d = DK_DRAFT, c = shopCfg(), t = shopOrderTotals(d.items, d.delivery);
  openSheet({ ic:'bag', c:'sky', title:'Yangi buyurtma', sub:'Telefon, WhatsApp yoki doʻkondagi buyurtma',
    body:`
      <div class="bs-card">
        <label class="bs-lbl">Qayerdan</label>
        ${segCtl([["'phone'", 'Telefon'], ["'whatsapp'", 'WhatsApp'], ["'telegram'", 'Telegram'], ["'manual'", 'Doʻkonda']], `'${d.source}'`, 'dkDraftSrc')}
        <label class="bs-lbl" for="dk-dn">Xaridor ismi</label><input class="bs-in" id="dk-dn" maxlength="80" value="${esc(d.name || '')}" oninput="DK_DRAFT.name=this.value">
        <label class="bs-lbl" for="dk-dp">Telefon</label><input class="bs-in" id="dk-dp" type="tel" inputmode="tel" maxlength="24" placeholder="+998 90 123 45 67" value="${esc(d.phone || '')}" oninput="DK_DRAFT.phone=this.value">
        <label class="bs-lbl">Olish usuli</label>
        ${segCtl([["'pickup'", 'Olib ketadi'], ["'courier'", 'Yetkazib berish']], `'${d.delivery}'`, 'dkDraftDel')}
        ${d.delivery === 'courier' ? `<label class="bs-lbl" for="dk-da">Manzil</label><input class="bs-in" id="dk-da" maxlength="160" value="${esc(d.address || '')}" oninput="DK_DRAFT.address=this.value">
          ${c.delivery ? '' : `<p class="bs-note">Sozlamalarda yetkazib berish oʻchirilgan — narx 0 deb olinadi.</p>`}` : ''}
        <label class="bs-lbl" for="dk-dnote">Izoh</label><input class="bs-in" id="dk-dnote" maxlength="200" value="${esc(d.note || '')}" oninput="DK_DRAFT.note=this.value">
      </div>
      <div class="bs-card">
        <div class="bs-t">Mahsulotlar</div>
        ${d.items.length ? d.items.map((it, i) => `<div class="dk-line"><span>${esc(it.name)}<small>${esc(shopMoney(it.priceUsd))} · omborda ${getStock(it.pid)}</small></span>
          <span class="dk-qty"><button onclick="dkDraftQty(${i},-1)" aria-label="Kamaytirish">${ICONF.minus}</button><b>${+it.qty}</b><button onclick="dkDraftQty(${i},1)" aria-label="Koʻpaytirish">${ICONF.add}</button></span></div>`).join('')
          : `<p class="bs-note">Hali mahsulot tanlanmagan.</p>`}
        <button class="dk-ghost dashed" onclick="dkPickProduct('draft')">${ICONF.add}<span>Mahsulot qoʻshish</span></button>
      </div>
      <div class="bs-card"><div class="dk-kv"><span>Mahsulotlar</span><b>${esc(shopMoney(t.subtotalUsd))}</b></div>
        <div class="dk-kv"><span>Yetkazib berish</span><b>${t.deliveryUsd ? esc(shopMoney(t.deliveryUsd)) : 'Bepul'}</b></div>
        <div class="dk-kv dk-total"><span>Jami</span><b>${esc(shopMoney(t.totalUsd))}</b></div></div>`,
    foot:`<button class="bs-btn" onclick="dkDraftSave()">${ICONF.check} Buyurtmani saqlash</button>` });
}
function dkDraftSrc(v) { DK_DRAFT.source = v; }
function dkDraftDel(v) { DK_DRAFT.delivery = v; dkDraftRender(); }
function dkDraftQty(i, d) { const it = DK_DRAFT.items[i]; if (!it) return; it.qty = Math.max(0, (+it.qty || 0) + d); if (!it.qty) DK_DRAFT.items.splice(i, 1); dkDraftRender(); }
function dkDraftSave() {
  const d = DK_DRAFT; if (!d) return;
  const name = String(d.name || '').trim(), phone = String(d.phone || '').trim();
  if (!d.items.length) { toast('Kamida bitta mahsulot tanlang', 'error'); return; }
  if (!name && !phone) { toast('Xaridor ismi yoki telefonini yozing', 'error'); return; }
  if (d.delivery === 'courier' && !String(d.address || '').trim()) { toast('Yetkazib berish manzilini yozing', 'error'); return; }
  const o = shopCreateOrder({ source: d.source, delivery: d.delivery, cust: { name, phone, address: String(d.address || '').trim() }, items: d.items, note: d.note });
  DK_DRAFT = null; closeSheet(); S.dkSt = 'new'; pgDokon();
  toast(`✅ Buyurtma #${o.no} qoʻshildi`);
}
// Yagona buyurtma yaratish nuqtasi (qo'lda va vitrina oldindan ko'rishdan)
function shopCreateOrder({ source, delivery, cust, items, note, test, branch }) {
  const sh = shopDataOf(branch);
  const clean = items.filter(it => (+it.qty || 0) > 0).map(it => ({ pid: it.pid, sku: it.sku || '', name: String(it.name || '').slice(0, 120), qty: Math.round(+it.qty), priceUsd: Math.round((+it.priceUsd || 0) * 100) / 100 }));
  const t = shopOrderTotals(clean, delivery);
  sh.seq = (+sh.seq || 0) + 1;
  const now = shopNowIso();
  const o = { id: 'so' + uid(), no: sh.seq, createdAt: now, updatedAt: now, source: SHOP_SRC[source] ? source : 'manual', delivery: delivery === 'courier' ? 'courier' : 'pickup',
    cust: { name: String(cust.name || '').slice(0, 80), phone: String(cust.phone || '').slice(0, 24), address: String(cust.address || '').slice(0, 160) },
    items: clean, ...t, note: String(note || '').slice(0, 200), status: 'new', history: [], ...(test ? { test: true } : {}),
    ...(branch && branch !== S.branch ? { viaBaza: true } : {}) };
  dkPushHist(o, 'new');
  sh.orders.unshift(o);
  auditLog(`Onlayn buyurtma #${o.no} (${SHOP_SRC[o.source]})${branch && branch !== S.branch ? ` → ${branchName(branch)}` : ''} — ${CUR.fmtUsd(o.totalUsd)}`);
  save();
  return o;
}

// ── Mahsulot tanlash (buyurtma va chegirma uchun umumiy) ──
let DK_PICK_MODE = 'draft';
function dkPickProduct(mode) {
  DK_PICK_MODE = mode;
  openSheet({ ic:'inventory', c:'sky', title:'Mahsulot tanlash', sub: mode === 'disc' ? `Chegirma uchun (${shopData().discounts.length}/${SHOP_MAX.discounts})` : 'Buyurtmaga qoʻshish',
    body:`<div class="kr-search pm-search">${ICONF.search}<input type="search" id="dk-pq" placeholder="Kod yoki nom" autocomplete="off" oninput="dkPickList()"></div><div id="dk-pl" class="dk-plist"></div>`,
    foot:`<button class="bs-btn ghost" onclick="${mode === 'disc' ? 'dkDiscountSheet()' : 'dkDraftRender()'}">Orqaga</button>` });
  dkPickList();
  setTimeout(() => document.getElementById('dk-pq')?.focus(), 200);
}
function dkPickList() {
  const box = document.getElementById('dk-pl'); if (!box) return;
  const q = String(document.getElementById('dk-pq')?.value || '').trim().toLowerCase();
  const used = new Set(DK_PICK_MODE === 'disc' ? shopData().discounts.map(d => String(d.pid)) : []);
  const list = S.products.filter(p => !p.archived && !p.directSale && (!q || String(p.sku).toLowerCase().includes(q) || String(p.name).toLowerCase().includes(q)))
    .map(p => ({ p, st: getStock(p.id) })).filter(x => x.st > 0 || DK_PICK_MODE === 'disc')
    .sort((a, b) => b.st - a.st).slice(0, 60);
  box.innerHTML = list.length ? list.map(({ p, st }) => `<button class="dk-pick" ${used.has(String(p.id)) ? 'disabled' : ''} onclick="dkPicked(${JSON.stringify(p.id).replace(/"/g, '&quot;')})">
      ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : `<i>${ICONF.inventory}</i>`}
      <span><b>${esc(p.name)}</b><small>${esc(p.sku)} · omborda ${st}</small></span><em>${esc(shopMoney(shopPrice(p)))}</em></button>`).join('')
    : `<p class="bs-note">Mos mahsulot topilmadi${DK_PICK_MODE === 'draft' ? ' (faqat omborda bor mahsulotlar)' : ''}.</p>`;
}
function dkPicked(pid) {
  const p = S.products.find(x => String(x.id) === String(pid)); if (!p) return;
  if (DK_PICK_MODE === 'disc') { dkDiscAdd(p); return; }
  const ex = DK_DRAFT.items.find(i => String(i.pid) === String(pid));
  if (ex) ex.qty++; else DK_DRAFT.items.push({ pid: p.id, sku: p.sku, name: p.name, qty: 1, priceUsd: shopPrice(p) });
  dkDraftRender();
}

// ════════════════════════════════════════════════════════════
// SOZLAMALAR
// ════════════════════════════════════════════════════════════
function dkToggleEnabled() {
  if (!shopCanCfg()) { toast("Ruxsatingiz yoʻq", 'error'); return; }
  const st = shopData().settings;
  if (!st.enabled && !st.name) st.name = shopCfg().name;
  if (!st.enabled && !st.slug) st.slug = shopCfg().slug;
  st.enabled = !st.enabled; shopTouchCfg();
  auditLog(`Onlayn-doʻkon ${st.enabled ? 'yoqildi' : 'oʻchirildi'}`);
  save(); pgDokon();
  toast(st.enabled ? 'Vitrina ochildi' : 'Vitrina yopildi');
}
function dkSettingsSheet() {
  if (!shopCanCfg()) { toast("Doʻkon sozlamalarini oʻzgartirishga ruxsatingiz yoʻq", 'error'); return; }
  const c = shopCfg(), host = location.host || 'example.uz';
  const sw = (id, on, oc) => `<label class="st-sw"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} ${oc ? `onchange="${oc}"` : ''}><i></i></label>`;
  S._dkCur = c.currency;
  openSheet({ ic:'settings', c:'purple', title:'Doʻkon sozlamalari', sub:'Vitrina, aloqa, yetkazib berish va joylashuv',
    body:`
      <div class="bs-card bs-rowc dk-on"><span class="dk-rowic" style="--c:var(--emerald)">${ICONF.globe}</span>
        <span><b class="bs-t">Onlayn-doʻkon yoqilgan</b><small class="bs-note">Vitrina ochiq: xaridorlar mahsulotlarni koʻradi va buyurtma beradi.</small></span>${sw('dks-en', c.enabled)}</div>

      <div class="bs-card"><div class="dk-sec"><span class="dk-rowic" style="--c:var(--sky)">${ICONF.store}</span><b>Doʻkon</b></div>
        <label class="bs-lbl" for="dks-name">Doʻkon nomi</label><input class="bs-in" id="dks-name" maxlength="60" value="${esc(c.name)}" oninput="dkSlugAuto()">
        <label class="bs-lbl" for="dks-slug">Vitrina manzili</label>
        <div class="dk-slug"><span>${esc(host)}/</span><input class="bs-in" id="dks-slug" maxlength="40" value="${esc(c.slug)}" oninput="this.dataset.touched=1;this.value=shopSlugify(this.value)||''"></div>
        <label class="bs-lbl" for="dks-about">Xaridorlar uchun tavsif</label><textarea class="bs-in dk-ta" id="dks-about" maxlength="400" placeholder="Doʻkon haqida ikki ogʻiz soʻz">${esc(c.about)}</textarea>
        <p class="bs-note">Xaridorlar buni vitrinaning «Doʻkon haqida» boʻlimida manzil, telefon va sharhlar bilan birga koʻradi.</p>
        <label class="bs-lbl" for="dks-phone">Doʻkon telefoni</label><input class="bs-in" id="dks-phone" type="tel" maxlength="24" value="${esc(c.phone)}" placeholder="+998 90 123 45 67">
      </div>

      <div class="bs-card"><div class="dk-sec"><span class="dk-rowic" style="--c:var(--emerald)">${ICONF.chat}</span><b>Xaridorlar bilan aloqa</b></div>
        <p class="bs-info">${ICONF.info}<span>«Doʻkon haqida» boʻlimida xaridor «WhatsApp’da yozish» va «Telegram’da yozish» tugmalarini koʻradi. Maydon boʻsh boʻlsa — doʻkon telefoni ishlatiladi.</span></p>
        <div class="bs-rowc dk-row"><span class="dk-rowic" style="--c:var(--emerald)">${ICONF.chat}</span><span><b>WhatsApp</b><small class="bs-note">Vitrinada tugmani koʻrsatish</small></span>${sw('dks-waon', c.waOn)}</div>
        <label class="bs-lbl" for="dks-wa">WhatsApp raqami</label><input class="bs-in" id="dks-wa" type="tel" maxlength="24" value="${esc(c.wa)}" placeholder="+998 90 123 45 67">
        <div class="bs-rowc dk-row"><span class="dk-rowic" style="--c:var(--sky)">${ICONF.send}</span><span><b>Telegram</b><small class="bs-note">Vitrinada tugmani koʻrsatish</small></span>${sw('dks-tgon', c.tgOn)}</div>
        <label class="bs-lbl" for="dks-tg">Telegram: @username yoki raqam</label><input class="bs-in" id="dks-tg" maxlength="40" value="${esc(c.tg)}" placeholder="@myshop">
      </div>

      <div class="bs-card"><div class="dk-sec"><span class="dk-rowic" style="--c:var(--teal, var(--emerald))">${ICONF.swap}</span><b>Vitrina valyutasi</b></div>
        <p class="bs-note">Xaridorlar vitrinadagi barcha narxlarni shu valyutada koʻradi (soʻm — joriy kurs ${esc(String(CUR.usdUzs))} boʻyicha).</p>
        ${segCtl([["'UZS'", 'UZS — soʻm'], ["'USD'", 'USD — dollar']], `'${c.currency}'`, 'dkCurSet')}
      </div>

      <div class="bs-card"><div class="bs-rowc dk-row"><span class="dk-rowic" style="--c:var(--blue, var(--sky))">${ICONF.car}</span><span><b>Doʻkon buyurtmalarni yetkazib beradi</b></span>${sw('dks-del', c.delivery)}</div>
        <label class="bs-lbl" for="dks-fee">Yetkazib berish narxi (0 — bepul) · UZS</label><input class="bs-in" id="dks-fee" inputmode="numeric" value="${c.feeUzs || 0}" oninput="liveFormatSpaces&&liveFormatSpaces(this)">
        <label class="bs-lbl" for="dks-km">Bepul yetkazib berish radiusi: <b id="dks-kmv">${c.freeKm}</b> km (0 — oʻchirilgan)</label>
        <input type="range" class="dk-range" id="dks-km" min="0" max="30" step="1" value="${c.freeKm}" oninput="document.getElementById('dks-kmv').textContent=this.value">
        <p class="bs-info">${ICONF.info}<span>Radius doʻkon joylashuvi koʻrsatilgan boʻlsa ishlaydi.</span></p>
        <label class="bs-lbl" for="dks-min">Bepul yetkazib berish uchun min. mahsulot summasi (0 — minimumsiz) · UZS</label><input class="bs-in" id="dks-min" inputmode="numeric" value="${c.freeMinUzs || 0}" oninput="liveFormatSpaces&&liveFormatSpaces(this)">
      </div>

      <div class="bs-card"><div class="dk-sec"><span class="dk-rowic" style="--c:var(--red)">${ICONF.place}</span><b>Doʻkon joylashuvi</b></div>
        <label class="bs-lbl" for="dks-addr">Manzil (matn)</label><input class="bs-in" id="dks-addr" maxlength="160" value="${esc(c.address)}" placeholder="Shahar, koʻcha, uy">
        <p class="bs-note">Nuqta qoʻyish uchun xaritani bosing. Moviy doira — bepul yetkazib berish radiusi.</p>
        <div id="dks-map" class="dk-map" data-lat="${c.lat ?? ''}" data-lng="${c.lng ?? ''}"></div>
        <div class="dk-coords"><input class="bs-in" id="dks-lat" inputmode="decimal" placeholder="Kenglik" value="${c.lat ?? ''}"><input class="bs-in" id="dks-lng" inputmode="decimal" placeholder="Uzunlik" value="${c.lng ?? ''}"></div>
        <button class="dk-ghost" onclick="dkLocate()">${ICONF.gps}<span>Joylashuvni aniqlash</span></button>
      </div>`,
    foot:`<button class="bs-btn" onclick="dkSettingsSave()">${ICONF.check} Saqlash</button>` });
  dkMapInit();
}
function dkCurSet(v) { S._dkCur = v; }
function dkSlugAuto() {
  const s = document.getElementById('dks-slug'); if (!s || s.dataset.touched) return;
  s.value = shopSlugify(document.getElementById('dks-name')?.value);
}
function dkSettingsSave() {
  if (!shopCanCfg()) { toast("Ruxsatingiz yoʻq", 'error'); return; }
  const v = id => document.getElementById(id);
  const name = String(v('dks-name')?.value || '').trim();
  const slug = shopSlugify(v('dks-slug')?.value || name);
  if (!name) { toast('Doʻkon nomini yozing', 'error'); return; }
  const lat = parseFloat(v('dks-lat')?.value), lng = parseFloat(v('dks-lng')?.value);
  const hasLL = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const num = id => Math.max(0, Math.round(parseAmt(v(id)?.value) || 0));
  const st = shopData().settings;
  Object.assign(st, {
    enabled: !!v('dks-en')?.checked, name: name.slice(0, 60), slug, about: String(v('dks-about')?.value || '').trim().slice(0, 400),
    phone: String(v('dks-phone')?.value || '').trim().slice(0, 24),
    waOn: !!v('dks-waon')?.checked, wa: String(v('dks-wa')?.value || '').trim().slice(0, 24),
    tgOn: !!v('dks-tgon')?.checked, tg: String(v('dks-tg')?.value || '').trim().slice(0, 40),
    currency: S._dkCur === 'USD' ? 'USD' : 'UZS',
    delivery: !!v('dks-del')?.checked, feeUzs: num('dks-fee'), freeKm: Math.min(30, Math.max(0, +v('dks-km')?.value || 0)), freeMinUzs: num('dks-min'),
    address: String(v('dks-addr')?.value || '').trim().slice(0, 160),
    lat: hasLL ? Math.round(lat * 1e6) / 1e6 : null, lng: hasLL ? Math.round(lng * 1e6) / 1e6 : null,
    updatedAt: shopNowIso(),
  });
  shopTouchCfg();
  auditLog("Onlayn-doʻkon sozlamalari saqlandi");
  save(); closeSheet(); pgDokon();
  toast('✅ Saqlandi');
}
function dkLocate() {
  if (!navigator.geolocation) { toast('Qurilma joylashuvni aniqlay olmaydi', 'error'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    const la = document.getElementById('dks-lat'), ln = document.getElementById('dks-lng');
    if (la) la.value = pos.coords.latitude.toFixed(6); if (ln) ln.value = pos.coords.longitude.toFixed(6);
    dkMapSet(pos.coords.latitude, pos.coords.longitude, true);
    toast('Joylashuv aniqlandi');
  }, () => toast("Joylashuvga ruxsat berilmadi", 'error'), { enableHighAccuracy: true, timeout: 10000 });
}
// Xarita: Leaflet faqat kerak bo'lganda yuklanadi (SRI bilan). Yuklanmasa — koordinata maydonlari ishlaydi.
const DK_LEAFLET = { js: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js', css: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
  jsSri: 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH', cssSri: 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H' };
let _dkLeafletP = null, _dkMap = null, _dkMarker = null, _dkCircle = null;
function dkLoadLeaflet() {
  if (window.L && window.L.map) return Promise.resolve(window.L);
  if (_dkLeafletP) return _dkLeafletP;
  _dkLeafletP = new Promise((ok, bad) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = DK_LEAFLET.css; l.integrity = DK_LEAFLET.cssSri; l.crossOrigin = 'anonymous'; document.head.appendChild(l);
    const s = document.createElement('script'); s.src = DK_LEAFLET.js; s.integrity = DK_LEAFLET.jsSri; s.crossOrigin = 'anonymous';
    s.onload = () => window.L ? ok(window.L) : bad(new Error('L yoʻq')); s.onerror = () => { _dkLeafletP = null; bad(new Error('yuklanmadi')); };
    document.head.appendChild(s);
  });
  return _dkLeafletP;
}
function dkMapInit() {
  const el = document.getElementById('dks-map'); if (!el) return;
  el.innerHTML = `<span class="dk-map-ph">${ICONF.place}<span>Xarita yuklanmoqda…</span></span>`;
  dkLoadLeaflet().then(L => {
    if (!document.body.contains(el)) return;
    el.innerHTML = '';
    const lat = parseFloat(el.dataset.lat), lng = parseFloat(el.dataset.lng), has = Number.isFinite(lat) && Number.isFinite(lng);
    _dkMap = L.map(el, { zoomControl: true, attributionControl: true }).setView(has ? [lat, lng] : [41.3111, 69.2797], has ? 15 : 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(_dkMap);
    _dkMarker = null; _dkCircle = null;
    if (has) dkMapSet(lat, lng, false);
    _dkMap.on('click', e => {
      const la = document.getElementById('dks-lat'), ln = document.getElementById('dks-lng');
      if (la) la.value = e.latlng.lat.toFixed(6); if (ln) ln.value = e.latlng.lng.toFixed(6);
      dkMapSet(e.latlng.lat, e.latlng.lng, false);
    });
    document.getElementById('dks-km')?.addEventListener('input', () => { if (_dkMarker) dkMapSet(_dkMarker.getLatLng().lat, _dkMarker.getLatLng().lng, false); });
    setTimeout(() => _dkMap && _dkMap.invalidateSize(), 250);
  }).catch(() => { el.innerHTML = `<span class="dk-map-ph">${ICONF.place}<span>Xarita ochilmadi (internet yoki tarmoq cheklovi). Koordinatani quyida kiriting yoki «Joylashuvni aniqlash»ni bosing.</span></span>`; });
}
function dkMapSet(lat, lng, center) {
  if (!_dkMap || !window.L) return;
  const L = window.L, km = +document.getElementById('dks-km')?.value || 0;
  if (_dkMarker) _dkMarker.setLatLng([lat, lng]); else _dkMarker = L.circleMarker([lat, lng], { radius: 8, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1 }).addTo(_dkMap);
  if (_dkCircle) { _dkMap.removeLayer(_dkCircle); _dkCircle = null; }
  if (km > 0) _dkCircle = L.circle([lat, lng], { radius: km * 1000, color: '#3b82f6', weight: 1, fillOpacity: .12 }).addTo(_dkMap);
  if (center) _dkMap.setView([lat, lng], 15);
}

// ── Havola: nusxalash / ulashish / ochish ──
function shopPublicUrl() {
  const base = (S.settings && S.settings.shopPublicBase) || '';
  return base ? `${String(base).replace(/\/+$/, '')}/${shopCfg().slug}` : '';
}
function dkCopyLink() {
  const url = shopPublicUrl();
  if (!url) { dkPublicInfo(); return; }
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Havola nusxalandi'), () => toast(url));
}
function dkShare() {
  const c = shopCfg(), url = shopPublicUrl();
  const text = `${c.name} — onlayn-doʻkon${c.phone ? '\nTel: ' + c.phone : ''}${c.address ? '\n' + c.address : ''}`;
  if (!url) { dkPublicInfo(); return; }
  if (navigator.share) navigator.share({ title: c.name, text, url }).catch(() => {});
  else dkCopyLink();
}
function dkPublicInfo() {
  openSheet({ ic:'link', c:'sky', title:'Vitrina havolasi', sub:'Ommaviy vitrina hali ishga tushirilmagan',
    body:`<p class="bs-info">${ICONF.info}<span>Doʻkon, buyurtmalar, bannerlar va chegirmalar shu ilovada toʻliq ishlaydi. Xaridorlar oʻzlari ochadigan <b>ommaviy vitrina</b> sahifasi (va Telegram bot orqali buyurtma qabul qilish) — keyingi bosqich: u server tomonida alohida himoyalangan buyurtma qabul qilishni talab qiladi.</span></p>
      <p class="bs-info">${ICONF.launch}<span>Hozir «Ochish» tugmasi vitrinani xaridor koʻzi bilan koʻrsatadi — u yerdan sinov buyurtmasi ham berish mumkin (u «Sinov» belgisi bilan chiqadi).</span></p>`,
    foot:`<button class="bs-btn" onclick="closeSheet();dkOpenStorefront()">${ICONF.launch} Vitrinani ochish</button>` });
}

// ════════════════════════════════════════════════════════════
// BANNERLAR (≤5, 2:1, ~70 KB)
// ════════════════════════════════════════════════════════════
function dkBannersSheet() {
  const b = shopData().banners, can = shopCanCfg();
  openSheet({ ic:'image', c:'emerald', title:'Bannerlar', sub:'Vitrina tepasidagi rasmlar',
    body:`
      <div class="bs-card dk-meter" style="--c:var(--emerald)">
        <div class="dk-meter-h"><span class="dk-rowic" style="--c:var(--emerald)">${ICONF.image}</span><b>Onlayn doʻkon tepasidagi rasmlar — maksimum ${SHOP_MAX.banners} ta</b><em>${b.length}/${SHOP_MAX.banners}</em></div>
        <div class="dk-segbar">${Array.from({ length: SHOP_MAX.banners }, (_, i) => `<i class="${i < b.length ? 'on' : ''}"></i>`).join('')}</div>
        <p class="bs-note">Istalgan rasmni yuklang — tizim uni 2:1 koʻrinishga keltirib, ~70 KB gacha oʻzi siqadi.</p>
      </div>
      ${b.map((x, i) => `<div class="dk-banner ${x.active === false ? 'off' : ''}">
        <img src="${esc(x.url)}" alt="Banner ${i + 1}" loading="lazy">
        ${can ? `<div class="dk-banner-acts">
          ${i > 0 ? `<button onclick="dkBannerMove(${i})" aria-label="Yuqoriga">${ICONF.up}</button>` : ''}
          <button onclick="dkBannerToggle(${i})" aria-label="${x.active === false ? 'Koʻrsatish' : 'Yashirish'}">${x.active === false ? ICONF.block : ICONF.check}</button>
          <button onclick="dkBannerDel(${i})" aria-label="Oʻchirish">${ICONF.trash}</button></div>` : ''}
      </div>`).join('')}
      ${can && b.length < SHOP_MAX.banners ? `<label class="dk-drop">
        <input type="file" accept="image/jpeg,image/png,image/webp" onchange="dkBannerFile(this)" hidden>
        <span class="dk-drop-ic">${ICONF.add}</span><b>Banner qoʻshish</b><small>2:1 · JPG / PNG</small></label>` : ''}` });
}
function dkCropTo2x1(dataUrl) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const W = img.width, H = img.height, want = 2;
      let sw = W, sh = Math.round(W / want);
      if (sh > H) { sh = H; sw = Math.round(H * want); }
      const sx = Math.round((W - sw) / 2), sy = Math.round((H - sh) / 2);
      const cv = document.createElement('canvas'); cv.width = Math.min(1400, sw); cv.height = Math.round(cv.width / want);
      const cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
      res(cv.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => res(null); img.src = dataUrl;
  });
}
async function dkBannerFile(inp) {
  const f = inp.files && inp.files[0]; inp.value = '';
  if (!f) return;
  if (!/^image\//.test(f.type)) { toast('Faqat rasm yuklang', 'error'); return; }
  if (f.size > 15 * 1024 * 1024) { toast('Rasm juda katta (15 MB dan oshmasin)', 'error'); return; }
  const raw = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(null); fr.readAsDataURL(f); });
  const cropped = raw && await dkCropTo2x1(raw);
  const small = cropped && await compressImageDataUrl(cropped, 70, 1400);
  if (!small) { toast("Rasmni oʻqib boʻlmadi", 'error'); return; }
  toast('Yuklanmoqda…');
  const url = await dkUploadBanner(small);
  if (!url) { toast("Banner saqlanmadi — internetni tekshiring", 'error'); return; }
  const sh = shopData();
  if (sh.banners.length >= SHOP_MAX.banners) { toast(`Maksimum ${SHOP_MAX.banners} ta`, 'error'); return; }
  sh.banners.push({ id: 'bn' + uid(), url, active: true, updatedAt: shopNowIso() });
  shopTouchCfg(); auditLog("Onlayn-doʻkon: banner qoʻshildi"); save(); dkBannersSheet();
  toast('✅ Banner qoʻshildi');
}
// ════════════════════════════════════════════════════════════
// KATEGORIYA RASMLARI (v24.7) — vitrinadagi kategoriya doiralari va katalog kartalari uchun.
// shop.settings.catImg = { "Kategoriya nomi": "https://…" } — server faqat https havolani saqlaydi (appDataGuard).
// ════════════════════════════════════════════════════════════
let DK_CATS = [];
function shopCatImg(cat) { const m = shopData().settings.catImg, u = m && typeof m === 'object' ? m[cat] : ''; return /^https:\/\//.test(String(u || '')) ? u : ''; }
function dkCatImgSheet() {
  if (!shopCanCfg()) { toast("Bu amal uchun sozlamalar huquqi kerak", 'error'); return; }
  const by = {}; S.products.filter(p => !p.archived && p.cat).forEach(p => { by[p.cat] = (by[p.cat] || 0) + 1; });
  DK_CATS = Object.keys(by).sort();
  const n = DK_CATS.filter(k => shopCatImg(k)).length;
  openSheet({ ic: 'listNum', c: 'indigo', title: 'Kategoriya rasmlari', sub: `Vitrinadagi kategoriyalar uchun · ${n} / ${DK_CATS.length} ta rasmli`,
    body: DK_CATS.length ? `<p class="bs-info">${ICONF.info}<span>Kvadrat rasm tavsiya etiladi (masalan 600×600). Rasm markazdan kvadratga kesiladi va siqiladi. Rasm qoʻyilmagan kategoriyada ikonka koʻrinadi.</span></p>
      <div class="dk-cats">${DK_CATS.map((k, i) => { const u = shopCatImg(k); return `<div class="dk-cat">
        <span class="dk-cat-img">${u ? `<img src="${esc(u)}" alt="">` : (typeof sfCatIc === 'function' ? sfCatIc(k) : ICONF.image)}</span>
        <span class="dk-cat-t"><b>${esc(k)}</b><small>${by[k]} ta mahsulot · ${u ? 'rasm bor' : 'rasm yoʻq'}</small></span>
        <label class="dk-cat-btn">${ICONF.upload || ICONF.image}<span>${u ? 'Almashtirish' : 'Rasm qoʻyish'}</span><input type="file" accept="image/*" hidden onchange="dkCatImgFile(this,${i})"></label>
        ${u ? `<button class="dk-cat-del" onclick="dkCatImgDel(${i})" aria-label="Rasmni oʻchirish">${ICONF.trash}</button>` : ''}</div>`; }).join('')}</div>`
      : `<p class="bs-info">${ICONF.info}<span>Hali kategoriyali mahsulot yoʻq — mahsulotlarga kategoriya bering.</span></p>` });
}
function dkCropSquare(dataUrl, size) {
  return new Promise(res => { const img = new Image();
    img.onload = () => { const m = Math.min(img.width, img.height), cv = document.createElement('canvas'); cv.width = cv.height = Math.min(size, m);
      const cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', 0.9)); };
    img.onerror = () => res(null); img.src = dataUrl; });
}
async function dkCatImgFile(inp, i) {
  const f = inp.files && inp.files[0], cat = DK_CATS[i]; inp.value = '';
  if (!f || !cat || !shopCanCfg()) return;
  if (!/^image\//.test(f.type)) { toast('Faqat rasm yuklang', 'error'); return; }
  if (f.size > 15 * 1024 * 1024) { toast('Rasm juda katta (15 MB dan oshmasin)', 'error'); return; }
  const raw = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(null); fr.readAsDataURL(f); });
  const sq = raw && await dkCropSquare(raw, 700);
  const small = sq && await compressImageDataUrl(sq, 60, 700);
  if (!small) { toast("Rasmni oʻqib boʻlmadi", 'error'); return; }
  toast('Yuklanmoqda…');
  const url = await dkUploadBanner(small);
  if (!url) { toast("Rasm saqlanmadi — internetni tekshiring", 'error'); return; }
  const st = shopData().settings, old = shopCatImg(cat);
  st.catImg = { ...(st.catImg && typeof st.catImg === 'object' ? st.catImg : {}), [cat]: url };
  shopTouchCfg(); auditLog(`Onlayn-doʻkon: «${cat}» kategoriyasi rasmi`); save();
  if (old && /\/product-images\/shop\//.test(old) && typeof deleteStorageImageByUrl === 'function') deleteStorageImageByUrl(old);
  dkCatImgSheet(); toast('Kategoriya rasmi saqlandi');
}
function dkCatImgDel(i) {
  const cat = DK_CATS[i], st = shopData().settings, old = shopCatImg(cat); if (!cat || !old || !shopCanCfg()) return;
  if (!confirm(`«${cat}» rasmi oʻchirilsinmi?`)) return;
  const m = { ...(st.catImg || {}) }; delete m[cat]; st.catImg = m;
  shopTouchCfg(); auditLog(`Onlayn-doʻkon: «${cat}» rasmi oʻchirildi`); save();
  if (/\/product-images\/shop\//.test(old) && typeof deleteStorageImageByUrl === 'function') deleteStorageImageByUrl(old);
  dkCatImgSheet();
}
// Storage (product-images bucket, "shop/" papkasi) — app_data'ga faqat havola yoziladi.
async function dkUploadBanner(dataUrl) {
  if (!_cloudEnabled || !_db) return null;   // oflayn: server faqat https havolani qabul qiladi
  try {
    const m = /^data:image\/jpeg;base64,(.+)$/.exec(dataUrl); if (!m) return null;
    const bin = atob(m[1]); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const path = `shop/${String(S.branch).replace(/[^a-z0-9]/gi, '')}-b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
    const { error } = await _db.storage.from('product-images').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
    if (error) { console.warn('Banner yuklanmadi:', error); return null; }
    const { data: pub } = _db.storage.from('product-images').getPublicUrl(path);
    return pub?.publicUrl || null;
  } catch (e) { console.warn('Banner yuklanmadi:', e); return null; }
}
function dkBannerMove(i) { const b = shopData().banners; if (i < 1 || !b[i]) return; [b[i - 1], b[i]] = [b[i], b[i - 1]]; b.forEach(x => x.updatedAt = shopNowIso()); shopTouchCfg(); save(); dkBannersSheet(); }
function dkBannerToggle(i) { const x = shopData().banners[i]; if (!x) return; x.active = x.active === false; x.updatedAt = shopNowIso(); shopTouchCfg(); save(); dkBannersSheet(); }
function dkBannerDel(i) {
  const b = shopData().banners, x = b[i]; if (!x) return;
  if (!confirm("Banner oʻchirilsinmi?")) return;
  b.splice(i, 1); shopTouchCfg(); auditLog("Onlayn-doʻkon: banner oʻchirildi"); save();
  if (/\/product-images\/shop\//.test(x.url) && typeof deleteStorageImageByUrl === 'function') deleteStorageImageByUrl(x.url);
  dkBannersSheet();
}

// ════════════════════════════════════════════════════════════
// CHEGIRMA (≤20 mahsulot) — faqat VITRINA narxi
// ════════════════════════════════════════════════════════════
let DK_DISC = null;   // tahrir nusxasi — «Saqlash»gacha haqiqiy ro'yxat o'zgarmaydi
function dkDiscountSheet() {
  if (!DK_DISC) DK_DISC = shopData().discounts.map(d => ({ ...d }));
  const can = shopCanCfg(), n = DK_DISC.length;
  const cur = shopCfg().currency;
  openSheet({ ic:'tag', c:'pink', title:'Chegirmali mahsulotlar', sub:'Vitrinada eski narx chizib koʻrsatiladi',
    body:`
      <div class="bs-card dk-meter" style="--c:var(--pink)">
        <div class="dk-meter-h"><span class="dk-rowic" style="--c:var(--pink)">${ICONF.tag}</span><span><small class="bs-note">Tanlandi:</small><b class="dk-big">${n} / ${SHOP_MAX.discounts}</b></span></div>
        <div class="dk-bar"><i style="width:${Math.round(n / SHOP_MAX.discounts * 100)}%"></i></div>
        <p class="bs-note">Chegirmali narx vitrinada va onlayn buyurtmalarda ishlaydi, eski narx chizib qoʻyiladi. Kassadagi (doʻkon ichidagi) sotuv narxi oʻzgarmaydi. Chegirmani olib tashlasangiz, avvalgi narx qaytadi.</p>
      </div>
      ${n ? DK_DISC.map((d, i) => { const p = S.products.find(x => String(x.id) === String(d.pid)); if (!p) return '';
        const reg = shopRegularPrice(p), pct = reg > 0 ? Math.round((1 - d.priceUsd / reg) * 100) : 0;
        const shown = cur === 'USD' ? d.priceUsd : fwRound1000(CUR.toUzs(d.priceUsd)).toLocaleString('en-US').replace(/,/g, ' ');
        return `<div class="dk-disc">
          ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : `<i>${ICONF.inventory}</i>`}
          <span class="dk-disc-t"><b>${esc(p.name)}</b><small><s>${esc(shopMoney(reg))}</s>${pct > 0 ? ` <em>−${pct}%</em>` : (pct < 0 ? ' <em class="bad">narx oshgan</em>' : '')}</small></span>
          <input class="bs-in" inputmode="decimal" aria-label="Yangi narx (${cur})" value="${shown}" ${can ? '' : 'disabled'} oninput="liveFormatSpaces(this)" onchange="dkDiscPrice(${i},this.value)">
          ${can ? `<button class="dk-x" onclick="dkDiscDel(${i})" aria-label="Olib tashlash">${ICONF.close}</button>` : ''}
        </div>`; }).join('')
      : `<div class="dk-empty sm"><span>${ICONF.tag}</span><b>Mahsulotlar tanlanmagan</b></div>`}
      ${can && n < SHOP_MAX.discounts ? `<button class="dk-ghost dashed" onclick="dkPickProduct('disc')">${ICONF.add}<span>Mahsulot qoʻshish</span></button>` : ''}`,
    foot: can ? `<div class="dk-foot"><button class="bs-btn" onclick="dkDiscSave()">${ICONF.check} Saqlash</button><button class="dk-ghost" onclick="DK_DISC=null;closeSheet()">Bekor</button></div>` : '' });
}
function dkDiscAdd(p) {
  if (!DK_DISC) DK_DISC = shopData().discounts.map(d => ({ ...d }));
  if (DK_DISC.length >= SHOP_MAX.discounts) { toast(`Maksimum ${SHOP_MAX.discounts} ta`, 'error'); return; }
  if (DK_DISC.some(d => String(d.pid) === String(p.id))) { dkDiscountSheet(); return; }
  const reg = shopRegularPrice(p);
  DK_DISC.push({ id: 'dc' + p.id, pid: p.id, priceUsd: Math.round(reg * 0.9 * 100) / 100, updatedAt: shopNowIso() });
  dkDiscountSheet();
}
function dkDiscPrice(i, val) {
  const d = DK_DISC && DK_DISC[i]; if (!d) return;
  const n = parseAmt(val); if (!(n > 0)) { toast("Narx 0 dan katta boʻlsin", 'error'); dkDiscountSheet(); return; }
  d.priceUsd = Math.round((shopCfg().currency === 'USD' ? n : CUR.toUsd(n)) * 100) / 100; d.updatedAt = shopNowIso();
  dkDiscountSheet();
}
function dkDiscDel(i) { if (DK_DISC) DK_DISC.splice(i, 1); dkDiscountSheet(); }
function dkDiscSave() {
  if (!shopCanCfg()) { toast("Ruxsatingiz yoʻq", 'error'); return; }
  const bad = (DK_DISC || []).find(d => { const p = S.products.find(x => String(x.id) === String(d.pid)); return p && d.priceUsd >= shopRegularPrice(p); });
  if (bad && !confirm("Ba'zi mahsulotlarda chegirmali narx odatiy narxdan past emas. Baribir saqlansinmi?")) return;
  shopData().discounts = (DK_DISC || []).slice(0, SHOP_MAX.discounts);
  DK_DISC = null; shopTouchCfg(); auditLog(`Onlayn-doʻkon chegirmalari: ${shopData().discounts.length} ta`);
  save(); closeSheet(); pgDokon(); toast('✅ Saqlandi');
}

// ════════════════════════════════════════════════════════════
// TELEGRAM BOT — token faqat serverda (netlify/functions/shop-bot.js)
// ════════════════════════════════════════════════════════════
function dkTelegramSheet() {
  const c = shopCfg(), bot = c.bot, set = !!(S.settings && (S.settings.shopBotTokenSet || S.settings.shopBotToken));
  const on = !!(bot && bot.username && set);
  openSheet({ ic:'send', c:'sky', title:'Doʻkonning Telegram-boti', sub:'Xaridorlar bot orqali doʻkoningizni ochadi',
    body:`
      <div class="bs-card dk-bot ${on ? 'on' : ''}">
        <div class="dk-bot-h"><span class="dk-bot-ic">${ICONF.send}<i></i></span>
          <span><b>${on ? '@' + esc(bot.username) : 'Bot ulanmagan'}</b><small>${on ? `Ulangan · ${esc(shopFmtTime(bot.at))}` : 'Doʻkon faqat brauzerda ishlaydi'}</small></span></div>
        <p class="bs-note">Xaridor hech narsa toʻldirmaydi: «Start»ni bosadi, raqamini ulashadi — va buyurtma bera oladi.</p>
      </div>
      <div class="bs-card"><div class="dk-sec"><span class="dk-rowic" style="--c:var(--sky)">${ICONF.listNum}</span><b>Botni qanday yaratish — 3 qadam</b></div>
        <ol class="dk-steps"><li>Telegramda @BotFather ni oching va unga /newbot buyrugʻini yuboring</li>
          <li>Bot nomini (masalan, doʻkoningiz nomini) va <i>bot</i> bilan tugaydigan manzilni yozing</li>
          <li>BotFather uzun satr — token yuboradi. Uni toʻliq nusxalab, quyiga joylashtiring.</li></ol>
        <a class="dk-ghost" href="https://t.me/BotFather" target="_blank" rel="noopener">${ICONF.launch}<span>@BotFather ni ochish</span></a>
      </div>
      <div class="bs-card"><div class="dk-sec"><span class="dk-rowic" style="--c:var(--amber)">${ICONF.key}</span><b>Bot tokeni</b></div>
        <div class="dk-token"><input class="bs-in" id="dk-tok" autocomplete="off" spellcheck="false" placeholder="${set ? 'Token saqlangan — almashtirish uchun yangisini kiriting' : '1234567890:AA…'}">
          <button class="dk-ibtn" onclick="dkPasteToken()" aria-label="Joylashtirish">${ICONF.paste}</button></div>
        <p class="bs-info">${ICONF.lock}<span>Token — botingizning kaliti. U faqat serverda saqlanadi: brauzerga, qurilma xotirasiga va xodimlarga qaytarilmaydi.</span></p>
        <button class="bs-btn" id="dk-tok-btn" onclick="dkBotConnect()" ${shopCanCfg() ? '' : 'disabled'}>${ICONF.link} Botni ulash</button>
        ${on ? `<button class="dk-ghost danger" onclick="dkBotDisconnect()">${ICONF.close}<span>Botni uzish</span></button>` : ''}
      </div>
      <div class="bs-card"><div class="dk-sec"><span class="dk-rowic" style="--c:var(--purple)">${ICONF.sparkle}</span><b>Nimalar oʻzi sozlanadi</b></div>
        <ul class="dk-checks"><li>${ICONF.check}<span>/start, /shop, /help buyruqlari menyusi</span></li>
          <li>${ICONF.check}<span>Bot tavsifi va qisqa tavsifi (doʻkon nomi bilan)</span></li>
          <li class="later">${ICONF.hourglass}<span>«Doʻkon» menyu tugmasi va xaridordan raqam soʻrash — ommaviy vitrina ishga tushganda yoqiladi</span></li></ul>
        <p class="bs-info">${ICONF.image}<span>@BotFather’da qoʻlda faqat bot rasmi qoladi: Telegram uni tashqaridan oʻzgartirishga ruxsat bermaydi.</span></p>
      </div>` });
}
async function dkPasteToken() {
  try { const t = await navigator.clipboard.readText(); const i = document.getElementById('dk-tok'); if (i) i.value = String(t || '').trim(); }
  catch (e) { toast('Nusxani qoʻlda joylashtiring (uzoq bosib → Joylashtirish)', 'warning'); }
}
async function dkBotCall(body) {
  const r = await authFetch('/.netlify/functions/shop-bot', { method: 'POST', body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok && !d.error) d.error = `Server xatosi (${r.status})`;
  return d;
}
async function dkBotConnect() {
  if (!shopCanCfg()) { toast("Ruxsatingiz yoʻq", 'error'); return; }
  const inp = document.getElementById('dk-tok'), btn = document.getElementById('dk-tok-btn');
  const token = String(inp?.value || '').trim();
  const stored = !!(S.settings && S.settings.shopBotTokenSet);
  if (!token && !stored) { toast('Tokenni joylashtiring', 'error'); return; }
  if (token && !/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) { toast("Token formati notoʻgʻri — BotFather yuborgan satrni toʻliq nusxalang", 'error'); return; }
  if (btn) btn.disabled = true;
  try {
    let bot = null;
    if (token) {
      const chk = await dkBotCall({ action: 'check', token });
      if (!chk.ok) { toast(chk.error || 'Token qabul qilinmadi', 'error'); return; }
      bot = chk.bot;
      // Token BIR MARTA serverga yuboriladi (settings.shopBotToken) — server uni saqlab, keyin brauzerdan olib tashlanadi
      S.settings.shopBotToken = token;
      await save();
      delete S.settings.shopBotToken; S.settings.shopBotTokenSet = true;
      if (inp) inp.value = '';
    }
    const st = await dkBotCall({ action: 'setup', shopName: shopCfg().name });
    if (!st.ok && !st.bot) { toast(st.error || 'Bot sozlanmadi', 'error'); return; }
    bot = st.bot || bot;
    shopData().settings.bot = { username: bot.username, name: bot.name, at: shopNowIso() };
    shopTouchCfg(); auditLog(`Onlayn-doʻkon boti ulandi: @${bot.username}`); save();
    toast(st.ok ? `✅ @${bot.username} ulandi` : `@${bot.username} ulandi, lekin ba'zi sozlamalar oʻrnatilmadi`, st.ok ? 'success' : 'warning');
    dkTelegramSheet();
  } catch (e) { toast("Serverga ulanib boʻlmadi", 'error'); }
  finally { if (btn) btn.disabled = false; }
}
function dkBotDisconnect() {
  if (!shopCanCfg() || !confirm("Bot doʻkondan uzilsinmi? (Token serverdan oʻchiriladi)")) return;
  S.settings.shopBotToken = ''; delete S.settings.shopBotTokenSet;
  delete shopData().settings.bot; shopTouchCfg();
  auditLog('Onlayn-doʻkon boti uzildi');
  save().then(() => { delete S.settings.shopBotToken; });
  dkTelegramSheet();
}

// ════════════════════════════════════════════════════════════
// STATISTIKA
// ════════════════════════════════════════════════════════════
function dkStatsSheet(days) {
  days = days || S._dkDays || 30; S._dkDays = days;
  const from = days === 'all' ? '' : new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
  const all = shopData().orders.filter(o => !o.test && (!from || String(o.createdAt).slice(0, 10) >= from));
  const done = all.filter(o => o.status === 'done'), canc = all.filter(o => o.status === 'cancelled');
  const rev = done.reduce((s, o) => s + (+o.totalUsd || 0), 0);
  const avg = done.length ? rev / done.length : 0;
  const bySrc = {}; all.forEach(o => { bySrc[o.source] = (bySrc[o.source] || 0) + 1; });
  const top = {}; done.forEach(o => (o.items || []).forEach(it => { const k = String(it.pid); top[k] = top[k] || { name: it.name, qty: 0, sum: 0 }; top[k].qty += +it.qty || 0; top[k].sum += (+it.qty || 0) * (+it.priceUsd || 0); }));
  const topL = Object.values(top).sort((a, b) => b.sum - a.sum).slice(0, 5);
  const last7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() - (6 - i) * 864e5).toISOString().slice(0, 10);
    return { d, n: shopData().orders.filter(o => !o.test && String(o.createdAt).slice(0, 10) === d).length }; });
  const mx = Math.max(1, ...last7.map(x => x.n));
  const rv = shopData().reviews.filter(r => !r.hidden), rating = rv.length ? rv.reduce((s, r) => s + (+r.rating || 0), 0) / rv.length : 0;
  openSheet({ ic:'chart', c:'amber', title:'Doʻkon statistikasi', sub:'Sinov buyurtmalari hisobga olinmaydi',
    body:`
      ${segCtl([[7, '7 kun'], [30, '30 kun'], ["'all'", 'Hammasi']], days === 'all' ? "'all'" : days, 'dkStatsSheet')}
      <div class="dk-kpis">
        <div><b>${all.length}</b><span>Buyurtma</span></div>
        <div><b style="color:var(--emerald)">${done.length}</b><span>Yakunlangan</span></div>
        <div><b>${esc(shopMoneyShort(rev))}</b><span>Tushum</span></div>
        <div><b>${esc(shopMoneyShort(avg))}</b><span>Oʻrtacha chek</span></div>
        <div><b style="color:var(--red)">${all.length ? Math.round(canc.length / all.length * 100) : 0}%</b><span>Bekor qilingan</span></div>
        <div><b style="color:var(--amber)">${rv.length ? rating.toFixed(1) + ' ★' : '—'}</b><span>Reyting (${rv.length})</span></div>
      </div>
      <div class="bs-card"><div class="bs-t">Oxirgi 7 kun — buyurtmalar</div>
        <div class="ox-bars dk-bars">${last7.map(x => `<div class="ox-bar-col" title="${x.d}: ${x.n}"><div class="ox-bar" style="height:${Math.max(4, Math.round(x.n / mx * 100))}%"></div><span>${x.d.slice(8)}</span></div>`).join('')}</div></div>
      <div class="bs-card"><div class="bs-t">Qayerdan keldi</div>
        ${Object.keys(bySrc).length ? Object.entries(bySrc).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="dk-kv"><span>${esc(SHOP_SRC[k] || k)}</span><b>${n}</b></div>`).join('') : '<p class="bs-note">Hali buyurtma yoʻq.</p>'}</div>
      <div class="bs-card"><div class="bs-t">Eng koʻp sotilgan (yakunlangan buyurtmalar)</div>
        ${topL.length ? topL.map((t, i) => `<div class="dk-line"><span>${i + 1}. ${esc(t.name)}<small>${t.qty} dona</small></span><b>${esc(shopMoney(t.sum))}</b></div>`).join('') : '<p class="bs-note">Hali yakunlangan buyurtma yoʻq.</p>'}</div>` });
}

// ════════════════════════════════════════════════════════════
// SHARHLAR
// ════════════════════════════════════════════════════════════
function dkRenderReviews() {
  const box = document.getElementById('dk-body'); if (!box) return;
  const rv = shopData().reviews.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const vis = rv.filter(r => !r.hidden), avg = vis.length ? vis.reduce((s, r) => s + (+r.rating || 0), 0) / vis.length : 0;
  const stars = n => Array.from({ length: 5 }, (_, i) => `<i class="${i < Math.round(n) ? 'on' : ''}">★</i>`).join('');
  if (!rv.length) { box.innerHTML = `<div class="dk-empty"><span>${ICONF.starO}</span><b>Sharhlar yoʻq</b><p>Buyurtmasi yakunlangan xaridorlar vitrinada baho va sharh qoldiradi.</p></div>`; return; }
  const dist = [5, 4, 3, 2, 1].map(s => ({ s, n: vis.filter(r => Math.round(r.rating) === s).length }));
  box.innerHTML = `
    <section class="dk-card dk-rate"><div class="dk-rate-big"><b>${avg.toFixed(1)}</b><span class="dk-stars">${stars(avg)}</span><small>${vis.length} ta sharh</small></div>
      <div class="dk-rate-dist">${dist.map(d => `<div><span>${d.s}</span><i><em style="width:${vis.length ? Math.round(d.n / vis.length * 100) : 0}%"></em></i><b>${d.n}</b></div>`).join('')}</div></section>
    <div class="dk-reviews">${rv.map(r => `<article class="dk-review ${r.hidden ? 'off' : ''}">
      <header><b>${esc(r.name || 'Xaridor')}</b><span class="dk-stars">${stars(r.rating)}</span><time>${esc(shopFmtTime(r.createdAt))}</time></header>
      ${r.text ? `<p>${esc(r.text)}</p>` : ''}
      ${r.reply ? `<blockquote><b>Doʻkon javobi:</b> ${esc(r.reply)}</blockquote>` : ''}
      ${shopCanOrders() || shopCanCfg() ? `<footer><button class="dk-ghost sm" onclick="dkReviewReply('${escJsAttr(r.id)}')">${ICONF.chat}<span>${r.reply ? 'Javobni tahrirlash' : 'Javob berish'}</span></button>
        <button class="dk-ghost sm" onclick="dkReviewHide('${escJsAttr(r.id)}')">${r.hidden ? ICONF.check : ICONF.block}<span>${r.hidden ? 'Koʻrsatish' : 'Yashirish'}</span></button></footer>` : ''}
    </article>`).join('')}</div>`;
}
function dkReviewReply(id) {
  const r = shopData().reviews.find(x => String(x.id) === String(id)); if (!r) return;
  openSheet({ ic:'chat', c:'sky', title:'Sharhga javob', sub: esc(r.name || 'Xaridor'),
    body:`<div class="bs-card"><p class="bs-note">${esc(r.text || '')}</p><label class="bs-lbl" for="dk-rr">Javobingiz</label><textarea class="bs-in dk-ta" id="dk-rr" maxlength="400">${esc(r.reply || '')}</textarea></div>`,
    foot:`<button class="bs-btn" onclick="dkReviewReplySave('${escJsAttr(r.id)}')">${ICONF.check} Saqlash</button>` });
}
function dkReviewReplySave(id) {
  const r = shopData().reviews.find(x => String(x.id) === String(id)); if (!r) return;
  r.reply = String(document.getElementById('dk-rr')?.value || '').trim().slice(0, 400); r.updatedAt = shopNowIso();
  save(); closeSheet(); pgDokon();
}
function dkReviewHide(id) {
  const r = shopData().reviews.find(x => String(x.id) === String(id)); if (!r) return;
  r.hidden = !r.hidden; r.updatedAt = shopNowIso(); save(); pgDokon();
}

// ════════════════════════════════════════════════════════════
// VITRINA — xaridor ko'zi bilan (oldindan ko'rish va sinov buyurtmasi)
// ════════════════════════════════════════════════════════════
let SF = null;   // { cart:{pid:qty}, cat, q, view:'shop'|'cart'|'about'|'done', del, order }
function dkOpenStorefront() {
  SF = { cart: {}, cat: '', q: '', view: 'shop', del: 'pickup', bi: 0, sort: 'pop', pid: null, fav: sfFavLoad() };
  let ov = document.getElementById('sf-ov');
  if (!ov) { ov = document.createElement('div'); ov.id = 'sf-ov'; ov.className = 'sf-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); document.body.appendChild(ov); }
  ov.hidden = false; document.body.classList.add('sf-lock');
  sfRender();
}
function sfClose() { const ov = document.getElementById('sf-ov'); if (ov) { ov.hidden = true; ov.innerHTML = ''; } document.body.classList.remove('sf-lock'); SF = null; clearInterval(_sfTimer); if (S.page === 'dokon') pgDokon(); }
let _sfTimer = null;
function sfProducts() {
  return S.products.filter(p => !p.archived && !p.directSale && sfStock(p.id) > 0);
}
function sfCartList() {
  return Object.entries(SF.cart).map(([pid, qty]) => { const p = S.products.find(x => String(x.id) === pid); return p ? { p, qty } : null; }).filter(Boolean);
}
// v24.7: ZAMONAVIY VITRINA (marketplace uslubida) — sevimlilar (shu qurilmada), ommabop/yangi bo'limlar, saralash, mahsulot sahifasi
function sfFavLoad() { try { return JSON.parse(localStorage.getItem('fw_sf_fav') || '[]').map(String); } catch (e) { return []; } }
function sfFavToggle(pid) {
  const k = String(pid), i = SF.fav.indexOf(k); if (i >= 0) SF.fav.splice(i, 1); else SF.fav.push(k);
  try { localStorage.setItem('fw_sf_fav', JSON.stringify(SF.fav.slice(-200))); } catch (e) {}
  sfKeepScroll(sfRender);
}
function sfKeepScroll(fn) { const y = document.querySelector('.sf-main')?.scrollTop || 0; fn(); const m = document.querySelector('.sf-main'); if (m) m.scrollTop = y; }
function sfGo(view, extra) { Object.assign(SF, { view }, extra || {}); sfRender(); const m = document.querySelector('.sf-main'); if (m) m.scrollTop = 0; }
function sfPopularity() {   // so'nggi 90 kunda sotilgan dona — «Ommabop»
  if (sfPopularity._at === S.sales.length && sfPopularity._m) return sfPopularity._m;
  const from = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10), m = {};
  fwSaleLines((S.sales || []).filter(x => x && x.status !== 'voided' && String(x.date || '') >= from)).forEach(l => { m[l.pid] = (m[l.pid] || 0) + l.qty; });
  sfPopularity._at = S.sales.length; sfPopularity._m = m; return m;
}
function sfNewest() {   // eng so'nggi kirim sanasi — «Yangi kelganlar»
  const m = {}; (S.batches || []).forEach(b => { const d = String(b.date || ''); if (d > (m[b.pid] || '')) m[b.pid] = d; }); return m;
}
function sfFiltered() {
  const q = SF.q.trim().toLowerCase(), pop = sfPopularity(), nw = sfNewest();
  let list = sfProducts().filter(p => (!SF.cat || p.cat === SF.cat) && (!q || [p.name, p.sku, p.brand, p.cat].some(v => String(v || '').toLowerCase().includes(q))));
  if (SF.view === 'fav') list = list.filter(p => SF.fav.includes(String(p.id)));
  const by = { pop: (a, b) => (pop[b.id] || 0) - (pop[a.id] || 0), cheap: (a, b) => shopPrice(a) - shopPrice(b), dear: (a, b) => shopPrice(b) - shopPrice(a),
    new: (a, b) => String(nw[b.id] || '').localeCompare(String(nw[a.id] || '')), az: (a, b) => String(a.name).localeCompare(String(b.name)) };
  return list.slice().sort(by[SF.sort] || by.pop);
}
const SF_SORT = [['pop', 'Ommabop'], ['new', 'Yangi'], ['cheap', 'Arzonroq'], ['dear', 'Qimmatroq'], ['az', 'A–Z']];
const SF_TONES = ['#2563eb', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4f46e5'];
// Kategoriya ikonkasi — nomidagi kalit so'z bo'yicha (chiziqli, zamonaviy); mos kelmasa — umumiy «quti»
const _ci = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const SF_CAT_IC = [
  // POWERFUL GROUP sohasi: arra tig'lari, frezalar, pichoqlar, o'lchov asboblari (umumiy qoidalardan oldin tekshiriladi)
  [/arra|tig.?|saw|blade|pila/i, _ci('<path d="M20.0 12.0 L21.7 14.4 L19.4 15.1 L20.0 17.9 L17.7 17.7 L17.2 20.6 L15.1 19.4 L13.5 21.9 L12.0 20.0 L9.6 21.7 L8.9 19.4 L6.1 20.0 L6.3 17.7 L3.4 17.2 L4.6 15.1 L2.1 13.5 L4.0 12.0 L2.3 9.6 L4.6 8.9 L4.0 6.1 L6.3 6.3 L6.8 3.4 L8.9 4.6 L10.5 2.1 L12.0 4.0 L14.4 2.3 L15.1 4.6 L17.9 4.0 L17.7 6.3 L20.6 6.8 L19.4 8.9 L21.9 10.5Z"/><circle cx="12" cy="12" r="2.5"/>')],
  [/freza|frez|router|endmill|fasonli/i, _ci('<rect x="9" y="2" width="6" height="8" rx="1"/><path d="M9 10h6M9.5 10c3 2 5 3 5 6M14.5 10c-3 2-5 3-5 6M9.5 16c3 1.5 5 2.5 5 5M14.5 16c-3 1.5-5 2.5-5 5"/>')],
  [/pichoq|нож|nozh|knife|rubanok|strogal/i, _ci('<path d="M3 15h18l-3 4H6z"/><path d="M5 15V9h14v6"/><path d="M8 12h2M14 12h2"/>')],
  [/shtangen|kalibr|mikrometr|caliper/i, _ci('<rect x="2" y="5" width="20" height="4" rx="1"/><path d="M4 9v8l2 3 2-3V9M14 4h5v6h-5zM15.5 10v7l1.5 3 1.5-3v-7"/>')],
  [/kesgich|kesish|cutter|rez/i, _ci('<rect x="2" y="13" width="20" height="5" rx="1.5"/><path d="M4 13V9h16v4"/><rect x="9" y="5" width="6" height="4" rx="1"/><path d="M12 5V2l5-1"/><circle cx="12" cy="11" r="1"/>')],
  [/disk|diska|krug|disc/i, _ci('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>')],
  [/shpatel|kelma|terka|mastersok|trowel/i, _ci('<path d="M3 15h14v-5H3z"/><path d="M3 15l1.5 2 1.5-2 1.5 2 1.5-2 1.5 2 1.5-2 1.5 2 1.5-2 1.5 2"/><path d="M9 10V7h5v3"/><path d="M11.5 7V3"/><rect x="9.5" y="1" width="4" height="3" rx="1"/>')],
  [/krestik|klips|pona|tekislash|svp|spacer/i, _ci('<path d="M8 3v8M4 7h8" stroke-width="2.6"/><path d="M17 12v9M12.5 16.5h9" stroke-width="2.6"/>')],
  [/o.?lchov|daraja|uroven|lazer|ruletka|level/i, _ci('<rect x="2" y="9" width="20" height="6" rx="1.5"/><rect x="9.5" y="10.5" width="5" height="3" rx="1.5"/><path d="M5 10.5v3M19 10.5v3"/>')],
  [/elektr|bolgarka|drel|perforator|mikser|shurup|drill/i, _ci('<path d="M3 8h11v6H3z"/><path d="M14 10h4l3-1v4l-3-1h-4"/><path d="M6 14v4a2 2 0 0 0 2 2h1v-6"/><path d="M5 8V6h5v2"/>')],
  [/kley|zatirka|aralashma|grunt|silikon|chelak|glue/i, _ci('<path d="M5 7h14l-1.5 13h-11z"/><path d="M4 7h16"/><path d="M7 7c0-5 10-5 10 0"/><path d="M7 12h10"/>')],
  [/kafel|plitka|keramogranit|mozaika|tile/i, _ci('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>')],
  [/bolg.a|kiyanka|molotok|hammer/i, _ci('<rect x="3" y="3" width="11" height="6" rx="2"/><path d="M8.5 9v12"/><path d="M14 6h4"/>')],
  [/qisqich|kusachka|ombir|pliers/i, _ci('<path d="M8 2c-2 4-1 7 2 9M16 2c2 4 1 7-2 9"/><circle cx="12" cy="12" r="1.5"/><path d="M11 13.5 6 22M13 13.5l5 8.5"/>')],
  [/burg.u|koronka|sverlo|bit/i, _ci('<path d="M2 12h8"/><rect x="10" y="8" width="9" height="8" rx="1"/><path d="M19 9l3 1-3 1M19 13l3 1-3 1"/>')],
  [/asbob|instrument|tool/i, _ci('<path d="M14.7 6.3a4 4 0 0 0 5 5l-9.4 9.4a2.1 2.1 0 0 1-3-3z"/><path d="M14.7 6.3 17 4l3 3-2.3 2.3"/>')],
];
const SF_CAT_DEF = _ci('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>');
function sfCatIc(name) { for (const [re, ic] of SF_CAT_IC) if (re.test(String(name || ''))) return ic; return SF_CAT_DEF; }
function sfNoImg(p, big) { const ci = p.cat && shopCatImg(p.cat); if (ci) return `<img src="${esc(ci)}" alt="" loading="lazy" class="sf-catfb">`; const t = sfTone(p.cat || 'Boshqa'); return `<i class="sf-noimg${big ? ' big' : ''}" style="--t:${t}">${sfCatIc(p.cat)}</i>`; }
function sfTone(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return SF_TONES[h % SF_TONES.length]; }
function sfRender() {
  const ov = document.getElementById('sf-ov'); if (!ov || !SF) return;
  const c = shopCfg(), sh = shopData();
  const nCart = Object.values(SF.cart).reduce((s, n) => s + n, 0), cartSum = sfCartList().reduce((s, x) => s + x.qty * shopPrice(x.p), 0);
  const back = !['shop', 'cats', 'fav'].includes(SF.view);
  const head = `<header class="sf-head">
      <button class="sf-ib ${back ? 'back' : ''}" onclick="${back ? "sfGo('shop')" : 'sfClose()'}" aria-label="${back ? 'Orqaga' : 'Yopish'}">${back ? ICONF.chevron : ICONF.close}</button>
      <button class="sf-brand" onclick="sfGo('shop',{cat:'',q:''})"><span class="sf-brand-mk">${typeof fwBrandMark === 'function' ? fwBrandMark() : ICONF.store}</span><b>${esc(c.name)}</b></button>
      <label class="sf-search sf-search-top">${ICONF.search}<input type="search" placeholder="Mahsulot, brend yoki kod" value="${esc(SF.q)}" oninput="SF.q=this.value;if(SF.view!=='shop'&&SF.view!=='fav'){SF.view='shop';sfRender();const i=document.querySelector('.sf-search-top input');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}}else sfRenderGrid()"></label>
      <button class="sf-ib sf-hide-m" onclick="sfGo('fav')" aria-label="Sevimlilar">${ICONF.starO}${SF.fav.length ? `<em>${SF.fav.length}</em>` : ''}</button>
      <button class="sf-ib" onclick="sfGo('about')" aria-label="Doʻkon haqida">${ICONF.info}</button>
      <button class="sf-ib sf-cartb" onclick="sfGo('cart')" aria-label="Savat">${ICONF.cart}${nCart ? `<em>${nCart}</em>` : ''}</button>
    </header>
    <div class="sf-preview">${ICONF.launch}<span>Oldindan koʻrish — xaridor shunday koʻradi. Bu yerdagi buyurtma «Sinov» belgisi bilan tushadi.</span></div>
    ${sfBranches().length ? `<div class="sf-br" role="group" aria-label="Qaysi filialdan olasiz?"><span>${ICONF.place}Qayerdan olasiz:</span>${sfBranches().map(k => `<button class="${(SF.br || 'baza') === k ? 'on' : ''}" onclick="sfSetBranch('${escJsAttr(k)}')">${esc(branchName(k))}</button>`).join('')}</div>` : ''}`;
  let body = '';
  if (!c.enabled) body += `<div class="sf-closed">${ICONF.block}<b>Doʻkon hozircha yopiq</b><span>Sozlamalarda «Onlayn-doʻkon yoqilgan»ni yoqing.</span></div>`;
  if (SF.view === 'shop' || SF.view === 'fav') body += sfShopHtml(c, sh);
  else if (SF.view === 'cats') body += sfCatsHtml();
  else if (SF.view === 'product') body += sfProductHtml();
  else if (SF.view === 'cart') body += sfCartHtml();
  else if (SF.view === 'about') body += sfAboutHtml();
  else if (SF.view === 'done') body += `<div class="sf-done"><span>${ICONF.check}</span><b>Buyurtma qabul qilindi!</b><p>Buyurtma raqami: <b>#${+SF.order.no}</b>. Doʻkon tez orada siz bilan bogʻlanadi.</p>
      <button class="sf-btn" onclick="sfReviewForm()">${ICONF.starO} Baho qoldirish</button><button class="sf-btn ghost" onclick="sfGo('shop')">Xaridni davom ettirish</button></div>`;
  else if (SF.view === 'review') body += SF.reviewHtml || '';
  const tab = (v, ic, l, n) => `<button class="${SF.view === v ? 'on' : ''}" onclick="sfGo('${v}')"><span>${ICONF[ic]}${n ? `<em>${n}</em>` : ''}</span><small>${l}</small></button>`;
  ov.innerHTML = `<div class="sf-app">${head}<main class="sf-main">${body}<footer class="sf-foot"><b>${esc(c.name)}</b>${c.phone ? `<span>${esc(c.phone)}</span>` : ''}${c.address ? `<span>${esc(c.address)}</span>` : ''}</footer></main>
    ${['shop', 'fav', 'product', 'cats'].includes(SF.view) && nCart ? `<button class="sf-float" onclick="sfGo('cart')">${ICONF.cart}<span>Savat · ${nCart} ta</span><b>${esc(shopMoney(cartSum))}</b></button>` : ''}
    <nav class="sf-tabs" aria-label="Vitrina menyusi">${tab('shop', 'store', 'Bosh sahifa')}${tab('cats', 'listNum', 'Katalog')}${tab('cart', 'cart', 'Savat', nCart)}${tab('fav', 'starO', 'Sevimlilar', SF.fav.length)}${tab('about', 'info', 'Doʻkon')}</nav></div>`;
  clearInterval(_sfTimer);
  const nb = sh.banners.filter(b => b.active !== false).length;
  if (SF.view === 'shop' && !SF.q && !SF.cat && nb > 1) _sfTimer = setInterval(() => { if (!SF) return; SF.bi++; const t = document.querySelector('.sf-ban-track');
    if (t) t.style.transform = `translateX(-${(SF.bi % nb) * 100}%)`; document.querySelectorAll('.sf-dots i').forEach((d, i) => d.classList.toggle('on', i === SF.bi % nb)); }, 4500);
}
function sfShopHtml(c, sh) {
  const prods = sfProducts(), cats = [...new Set(prods.map(p => p.cat).filter(Boolean))].sort();
  const fav = SF.view === 'fav', home = !fav && !SF.q && !SF.cat;
  const ban = sh.banners.filter(b => b.active !== false), pop = sfPopularity(), nw = sfNewest();
  const disc = prods.filter(p => shopDiscountOf(p.id));
  const popular = prods.filter(p => pop[p.id] > 0).sort((a, b) => pop[b.id] - pop[a.id]).slice(0, 12);
  const newest = prods.filter(p => nw[p.id]).sort((a, b) => String(nw[b.id]).localeCompare(String(nw[a.id]))).slice(0, 12);
  const row = (ic, t, list, cls) => list.length ? `<section class="sf-sec ${cls || ''}"><div class="sf-sec-h"><h3>${ICONF[ic] || ''}${esc(t)}</h3><span>${list.length} ta</span></div><div class="sf-row">${list.map(sfCard).join('')}</div></section>` : '';
  const list = sfFiltered();
  return `
    ${home ? (ban.length ? `<div class="sf-ban"><div class="sf-ban-track" style="transform:translateX(-${(SF.bi % ban.length) * 100}%)">${ban.map(b => `<img src="${esc(b.url)}" alt="">`).join('')}</div>
        ${ban.length > 1 ? `<div class="sf-dots">${ban.map((_, i) => `<i class="${i === SF.bi % ban.length ? 'on' : ''}"></i>`).join('')}</div>` : ''}</div>`
      : `<div class="sf-hello"><div><small>Onlayn-doʻkon</small><b>${esc(c.name)}</b><span>${esc(c.about || 'Sifatli mahsulotlar — buyurtma bering, biz tez yetkazamiz yoki tayyorlab qoʻyamiz.')}</span>
          <div class="sf-perks"><i>${ICONF.check}Rasmiy kafolat</i><i>${c.delivery ? ICONF.car + 'Yetkazib berish' : ICONF.store + 'Doʻkondan olib ketish'}</i><i>${ICONF.phone}Tez aloqa</i></div></div></div>`) : ''}
    ${cats.length > 1 ? `<div class="sf-cats">${['', ...cats].map(k => `<button class="${SF.cat === k ? 'on' : ''}" onclick="SF.cat=${JSON.stringify(k).replace(/"/g, '&quot;')};sfRender()">${k ? (shopCatImg(k) ? `<i class="img" style="--t:${sfTone(k)}"><img src="${esc(shopCatImg(k))}" alt="" loading="lazy"></i>` : `<i style="--t:${sfTone(k)}">${sfCatIc(k)}</i>`) : `<i style="--t:#0f172a">${_ci('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>')}</i>`}<span>${k ? esc(k) : 'Hammasi'}</span></button>`).join('')}</div>` : ''}
    ${home ? row('tag', 'Chegirmalar', disc, 'hot') + row('chart', 'Ommabop', popular) + row('add', 'Yangi kelganlar', newest) : ''}
    <section class="sf-sec">
      <div class="sf-sec-h"><h3>${fav ? ICONF.starO + 'Sevimlilar' : SF.cat ? esc(SF.cat) : SF.q ? 'Qidiruv natijasi' : 'Barcha mahsulotlar'}</h3><span id="sf-cnt">${list.length} ta</span></div>
      <div class="sf-sort">${SF_SORT.map(([k, l]) => `<button class="${SF.sort === k ? 'on' : ''}" onclick="SF.sort='${k}';sfKeepScroll(sfRender)">${l}</button>`).join('')}</div>
      <div class="sf-grid" id="sf-grid">${list.map(sfCard).join('') || `<p class="sf-none">${fav ? 'Sevimlilar hali boʻsh — mahsulotdagi yulduzchani bosing' : 'Mahsulot topilmadi'}</p>`}</div>
    </section>`;
}
function sfCatsHtml() {
  const prods = sfProducts(), by = {};
  prods.forEach(p => { const k = p.cat || 'Boshqa'; (by[k] = by[k] || []).push(p); });
  const keys = Object.keys(by).sort();
  return `<h2 class="sf-h2">Katalog</h2><div class="sf-catgrid">${keys.map(k => { const ci = shopCatImg(k), img = ci || (by[k].find(p => p.image) || {}).image;
    return `<button onclick="sfGo('shop',{cat:${JSON.stringify(k === 'Boshqa' ? '' : k).replace(/"/g, '&quot;')},q:''})" style="--t:${sfTone(k)}"><span class="sf-catimg">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<i class="sf-catic">${sfCatIc(k)}</i>`}</span><b>${esc(k)}</b><small>${by[k].length} ta mahsulot</small></button>`; }).join('') || '<p class="sf-none">Mahsulot yoʻq</p>'}</div>`;
}
function sfProductHtml() {
  const p = S.products.find(x => String(x.id) === String(SF.pid)); if (!p) return '<p class="sf-none">Mahsulot topilmadi</p>';
  const d = shopDiscountOf(p.id), price = shopPrice(p), reg = shopRegularPrice(p), q = SF.cart[p.id] || 0, st = sfStock(p.id), isFav = SF.fav.includes(String(p.id));
  const pidJs = JSON.stringify(p.id).replace(/"/g, '&quot;');
  const sim = sfProducts().filter(x => x.id !== p.id && x.cat && x.cat === p.cat).slice(0, 10);
  return `<div class="sf-pd">
    <div class="sf-pd-img">${p.image ? `<img src="${esc(p.image)}" alt="">` : sfNoImg(p, true)}${d && reg > price ? `<em>−${Math.round((1 - price / reg) * 100)}%</em>` : ''}
      <button class="sf-fav ${isFav ? 'on' : ''}" onclick="sfFavToggle(${pidJs})" aria-label="Sevimlilarga">${ICONF.starO}</button></div>
    <div class="sf-pd-info">
      ${p.brand || p.cat ? `<small class="sf-pd-cat">${esc([p.brand, p.cat].filter(Boolean).join(' · '))}</small>` : ''}
      <h2>${esc(p.name)}</h2>
      <div class="sf-pd-price"><b>${esc(shopMoney(price))}</b>${d && reg > price ? `<s>${esc(shopMoney(reg))}</s><em>Tejaysiz ${esc(shopMoney(reg - price))}</em>` : ''}</div>
      <div class="sf-pd-meta"><span class="${st <= (p.minStock || 0) ? 'low' : ''}">${ICONF.inventory}${st <= (p.minStock || 0) ? `Oz qoldi: ${st} ${esc(p.unit || 'dona')}` : `Mavjud: ${st} ${esc(p.unit || 'dona')}`}</span>${p.sku ? `<span>${ICONF.tag}Kod: ${esc(p.sku)}</span>` : ''}</div>
      ${p.desc ? `<p class="sf-pd-desc">${esc(p.desc)}</p>` : ''}
      <div class="sf-pd-buy">${q ? `<div class="sf-qty big"><button onclick="sfAdd(${pidJs},-1)" aria-label="Kamaytirish">${ICONF.minus}</button><b>${q}</b><button onclick="sfAdd(${pidJs},1)" aria-label="Koʻpaytirish">${ICONF.add}</button></div><button class="sf-btn" onclick="sfGo('cart')">${ICONF.cart} Savatga oʻtish</button>`
        : `<button class="sf-btn" onclick="sfAdd(${pidJs},1)">${ICONF.cart} Savatga qoʻshish</button>`}</div>
    </div></div>
    ${sim.length ? `<section class="sf-sec"><div class="sf-sec-h"><h3>Oʻxshash mahsulotlar</h3><span>${sim.length} ta</span></div><div class="sf-row">${sim.map(sfCard).join('')}</div></section>` : ''}`;
}
function sfCard(p) {
  const d = shopDiscountOf(p.id), price = shopPrice(p), reg = shopRegularPrice(p), q = SF.cart[p.id] || 0, st = sfStock(p.id), isFav = SF.fav.includes(String(p.id));
  const pidJs = JSON.stringify(p.id).replace(/"/g, '&quot;'), hot = (sfPopularity()[p.id] || 0) >= 5;
  return `<div class="sf-card">
    <div class="sf-img" onclick="sfGo('product',{pid:${pidJs}})">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : sfNoImg(p)}${d && reg > price ? `<em>−${Math.round((1 - price / reg) * 100)}%</em>` : hot ? '<em class="hit">Hit</em>' : ''}</div>
    <button class="sf-fav ${isFav ? 'on' : ''}" onclick="sfFavToggle(${pidJs})" aria-label="Sevimlilarga">${ICONF.starO}</button>
    <div class="sf-price">${esc(shopMoney(price))}${d && reg > price ? `<s>${esc(shopMoney(reg))}</s>` : ''}</div>
    <b class="sf-name" onclick="sfGo('product',{pid:${pidJs}})">${esc(p.name)}</b>
    <small class="sf-stock ${st <= (p.minStock || 0) ? 'low' : ''}">${st <= (p.minStock || 0) ? `Oz qoldi: ${st}` : 'Mavjud'}</small>
    ${q ? `<div class="sf-qty"><button onclick="sfAdd(${pidJs},-1)" aria-label="Kamaytirish">${ICONF.minus}</button><b>${q}</b><button onclick="sfAdd(${pidJs},1)" aria-label="Koʻpaytirish">${ICONF.add}</button></div>`
        : `<button class="sf-add" onclick="sfAdd(${pidJs},1)">${ICONF.cart}<span>Savatga</span></button>`}
  </div>`;
}
function sfRenderGrid() {
  const g = document.getElementById('sf-grid'); if (!g) return;
  const list = sfFiltered();
  g.innerHTML = list.map(sfCard).join('') || '<p class="sf-none">Mahsulot topilmadi</p>';
  const n = document.getElementById('sf-cnt'); if (n) n.textContent = list.length + ' ta';
  document.querySelectorAll('.sf-main > .sf-sec:not(:last-of-type), .sf-main > .sf-ban, .sf-main > .sf-hello').forEach(e => { e.style.display = SF.q ? 'none' : ''; });
}
function sfAdd(pid, d) {
  const st = sfStock(pid), cur = SF.cart[pid] || 0, nv = Math.max(0, Math.min(st, cur + d));
  if (cur + d > st) toast(`Omborda faqat ${st} ta`, 'warning');
  if (nv) SF.cart[pid] = nv; else delete SF.cart[pid];
  const y = document.querySelector('.sf-main')?.scrollTop || 0;
  sfRender();
  const m = document.querySelector('.sf-main'); if (m) m.scrollTop = y;
}
function sfCartHtml() {
  const c = shopCfg(), list = sfCartList();
  if (!list.length) return `<div class="sf-done"><span>${ICONF.cart}</span><b>Savat boʻsh</b><button class="sf-btn" onclick="SF.view='shop';sfRender()">Mahsulot tanlash</button></div>`;
  const items = list.map(x => ({ pid: x.p.id, qty: x.qty, priceUsd: shopPrice(x.p) }));
  const t = shopOrderTotals(items, SF.del);
  return `<h2 class="sf-h2">Savat</h2>
    <div class="sf-list">${list.map(({ p, qty }) => { const pidJs = JSON.stringify(p.id).replace(/"/g, '&quot;'); return `<div class="sf-li">
      <div class="sf-img sm">${p.image ? `<img src="${esc(p.image)}" alt="">` : sfNoImg(p)}</div>
      <span><b>${esc(p.name)}</b><small>${esc(shopMoney(shopPrice(p)))}</small></span>
      <div class="sf-qty"><button onclick="sfAdd(${pidJs},-1)" aria-label="Kamaytirish">${ICONF.minus}</button><b>${qty}</b><button onclick="sfAdd(${pidJs},1)" aria-label="Koʻpaytirish">${ICONF.add}</button></div></div>`; }).join('')}</div>
    <h3 class="sf-h">Qanday olasiz?</h3>
    <div class="sf-seg"><button class="${SF.del === 'pickup' ? 'on' : ''}" onclick="SF.del='pickup';sfRender()">${ICONF.store}<span>Doʻkondan olib ketaman</span></button>
      ${c.delivery ? `<button class="${SF.del === 'courier' ? 'on' : ''}" onclick="SF.del='courier';sfRender()">${ICONF.car}<span>Yetkazib bering</span></button>` : ''}</div>
    <div class="sf-form">
      <input id="sf-n" placeholder="Ismingiz" maxlength="80" value="${esc(SF.name || '')}" oninput="SF.name=this.value">
      <input id="sf-p" type="tel" inputmode="tel" placeholder="Telefon: +998 90 123 45 67" maxlength="24" value="${esc(SF.phone || '')}" oninput="SF.phone=this.value">
      ${SF.del === 'courier' ? `<input id="sf-a" placeholder="Yetkazib berish manzili" maxlength="160" value="${esc(SF.addr || '')}" oninput="SF.addr=this.value">` : ''}
      <input id="sf-c" placeholder="Izoh (ixtiyoriy)" maxlength="200" value="${esc(SF.note || '')}" oninput="SF.note=this.value">
    </div>
    <div class="sf-sum"><div><span>Mahsulotlar</span><b>${esc(shopMoney(t.subtotalUsd))}</b></div>
      ${SF.del === 'courier' ? `<div><span>Yetkazib berish</span><b>${t.deliveryUsd ? esc(shopMoney(t.deliveryUsd)) : 'Bepul'}</b></div>
        ${c.freeMinUzs > 0 && t.deliveryUsd ? `<small>${esc((c.freeMinUzs).toLocaleString('en-US').replace(/,/g, ' '))} UZS dan oshsa — bepul</small>` : ''}` : ''}
      <div class="tot"><span>Jami</span><b>${esc(shopMoney(t.totalUsd))}</b></div></div>
    <button class="sf-btn" onclick="sfOrder()" ${c.enabled ? '' : 'disabled'}>${ICONF.check} Buyurtma berish</button>`;
}
function sfOrder() {
  if (!shopCfg().enabled) { toast('Doʻkon yopiq', 'error'); return; }
  const name = String(SF.name || '').trim(), phone = String(SF.phone || '').trim();
  if (!name) { toast('Ismingizni yozing', 'error'); return; }
  if (shopPhoneDigits(phone).length < 9) { toast("Telefon raqamini toʻliq yozing", 'error'); return; }
  if (SF.del === 'courier' && !String(SF.addr || '').trim()) { toast('Manzilni yozing', 'error'); return; }
  const items = sfCartList().map(({ p, qty }) => ({ pid: p.id, sku: p.sku, name: p.name, qty, priceUsd: shopPrice(p) }));
  if (!items.length) return;
  SF.order = shopCreateOrder({ source: 'site', delivery: SF.del, cust: { name, phone, address: String(SF.addr || '').trim() }, items, note: SF.note, test: true, branch: SF.br || S.branch });
  SF.cart = {}; SF.view = 'done'; sfRender();
}
function sfReviewForm() {
  SF.rating = SF.rating || 5;
  SF.reviewHtml = `<div class="sf-done"><b>Xizmatni baholang</b>
    <div class="sf-rate">${[1, 2, 3, 4, 5].map(n => `<button class="${n <= SF.rating ? 'on' : ''}" onclick="SF.rating=${n};sfReviewForm()" aria-label="${n} yulduz">★</button>`).join('')}</div>
    <textarea id="sf-rt" maxlength="400" placeholder="Fikringiz (ixtiyoriy)">${esc(SF.rtext || '')}</textarea>
    <button class="sf-btn" onclick="sfReviewSave()">Yuborish</button></div>`;
  SF.view = 'review'; sfRender();
}
function sfReviewSave() {
  SF.rtext = String(document.getElementById('sf-rt')?.value || '').trim();
  const o = SF.order, now = shopNowIso();
  shopData().reviews.unshift({ id: 'rv' + uid(), orderId: o ? o.id : null, name: (o && o.cust.name) || 'Xaridor', rating: Math.min(5, Math.max(1, SF.rating || 5)), text: SF.rtext.slice(0, 400), createdAt: now, updatedAt: now, test: true });
  save(); toast('Rahmat! Sharh saqlandi');
  SF.view = 'shop'; SF.rtext = ''; sfRender();
}
function sfAboutHtml() {
  const c = shopCfg(), rv = shopData().reviews.filter(r => !r.hidden);
  const wa = shopPhoneDigits(c.wa || c.phone), tg = String(c.tg || '').replace(/^@/, '');
  const avg = rv.length ? rv.reduce((s, r) => s + (+r.rating || 0), 0) / rv.length : 0;
  return `<div class="sf-about"><span class="sf-logo">${ICONF.store}</span><h2>${esc(c.name)}</h2>
    ${rv.length ? `<div class="sf-avg">★ ${avg.toFixed(1)} · ${rv.length} ta sharh</div>` : ''}
    ${c.about ? `<p>${esc(c.about)}</p>` : ''}
    <div class="sf-info">
      ${c.address ? `<div>${ICONF.place}<span>${esc(c.address)}</span></div>` : ''}
      ${c.phone ? `<a href="tel:+${esc(shopPhoneDigits(c.phone))}">${ICONF.phone}<span>${esc(c.phone)}</span></a>` : ''}
      ${c.delivery ? `<div>${ICONF.car}<span>Yetkazib berish: ${c.feeUzs ? esc(c.feeUzs.toLocaleString('en-US').replace(/,/g, ' ')) + ' UZS' : 'bepul'}${c.freeMinUzs ? ` · ${esc(c.freeMinUzs.toLocaleString('en-US').replace(/,/g, ' '))} UZS dan bepul` : ''}</span></div>` : `<div>${ICONF.store}<span>Faqat doʻkondan olib ketish</span></div>`}
      ${c.lat != null ? `<a href="https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=16/${c.lat}/${c.lng}" target="_blank" rel="noopener">${ICONF.gps}<span>Xaritada koʻrish</span></a>` : ''}
    </div>
    <div class="sf-contact">
      ${c.waOn && wa ? `<a class="sf-btn wa" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">${ICONF.chat}<span>WhatsApp’da yozish</span></a>` : ''}
      ${c.tgOn && (tg || c.bot?.username) ? `<a class="sf-btn tg" href="https://t.me/${esc(tg || c.bot.username)}" target="_blank" rel="noopener">${ICONF.send}<span>Telegram’da yozish</span></a>` : ''}
    </div>
    ${rv.length ? `<h3 class="sf-h">Sharhlar</h3>${rv.slice(0, 20).map(r => `<div class="sf-rev"><b>${esc(r.name)}</b><span>${'★'.repeat(Math.round(r.rating))}${'☆'.repeat(5 - Math.round(r.rating))}</span>${r.text ? `<p>${esc(r.text)}</p>` : ''}${r.reply ? `<small>Doʻkon: ${esc(r.reply)}</small>` : ''}</div>`).join('')}` : ''}
  </div>`;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && SF && !document.getElementById('bs-ov')?.classList.contains('open')) sfClose(); });
