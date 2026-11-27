// v25.8 — AI-REKLAMA: umumiy server mantig'i (ai-ads va keyinroq ai-ads-cron uchun). 58-migratsiya.
//
// Qoidalar:
//   • Narx, eski narx, valyuta va qoldiq — FAQAT shu yerda (vitrina bilan bir xil: _lib/shopPublic.publicProduct).
//     Tannarx, partiya, foyda — javobga chiqmaydi.
//   • Nomzod faqat vitrinada ko'rinadigan mahsulot (arxiv, Direct Sale, qoldiqsiz, narxsiz — yo'q) + rasmli +
//     «Reklama qilmaslik» (p.noAds) belgisi yo'q.
//   • Har filial alohida (branch_id): sozlama, do'kon, chegirma, savdo, tarix.
'use strict';
const SP = require('./shopPublic');
const { ledgerAuthorityOn, loadLedger, overlayBranchLedger } = require('./ledgerAuthority');
const { CHAT_RE } = require('./dailyReportRun');

const DAY = 86400000;
const TZ_MS = 5 * 3600000;   // Toshkent (UTC+5, yozgi vaqt yo'q)
const REASONS = ['discount', 'new', 'stuck', 'top'];
const REASON_LABEL = { discount: 'Chegirma', new: 'Yangi', stuck: 'Turib qolgan', top: 'Koʻp sotiladigan' };
const REASON_W = { discount: 40, new: 30, top: 20, stuck: 10 };

// ── Sozlamalar (ai_ad_settings.data) ──
const DEFAULT_SETTINGS = Object.freeze({
  channel: '',                 // bo'sh — tgAnnounceChats ning birinchisi
  lang: 'uz',                  // 'uz' (lotin) | 'ru'
  criteria: { discount: true, new: true, stuck: true, top: true, newDays: 14, stuckDays: 30, topDays: 30, topN: 10, repeatDays: 7 },
  autopilot: { enabled: false, mode: 'approve', hours: [10, 18], perDay: 3 },
});
const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const c = r.criteria && typeof r.criteria === 'object' ? r.criteria : {};
  const a = r.autopilot && typeof r.autopilot === 'object' ? r.autopilot : {};
  const D = DEFAULT_SETTINGS;
  const ch = String(r.channel == null ? '' : r.channel).trim();
  const hours = [...new Set((Array.isArray(a.hours) ? a.hours : D.autopilot.hours).map((h) => Math.round(Number(h))).filter((h) => Number.isInteger(h) && h >= 0 && h <= 23))].sort((x, y) => x - y).slice(0, 6);
  return {
    channel: CHAT_RE.test(ch) ? ch : '',
    lang: r.lang === 'ru' ? 'ru' : 'uz',
    criteria: {
      discount: bool(c.discount, D.criteria.discount), new: bool(c.new, D.criteria.new), stuck: bool(c.stuck, D.criteria.stuck), top: bool(c.top, D.criteria.top),
      newDays: int(c.newDays, 1, 90, D.criteria.newDays), stuckDays: int(c.stuckDays, 7, 365, D.criteria.stuckDays),
      topDays: int(c.topDays, 7, 90, D.criteria.topDays), topN: int(c.topN, 1, 30, D.criteria.topN), repeatDays: int(c.repeatDays, 1, 60, D.criteria.repeatDays),
    },
    autopilot: {
      enabled: bool(a.enabled, D.autopilot.enabled), mode: a.mode === 'auto' ? 'auto' : 'approve',
      hours: hours.length ? hours : D.autopilot.hours.slice(), perDay: int(a.perDay, 1, 5, D.autopilot.perDay),
    },
  };
}
// Saqlash uchun: noto'g'ri kanal — xato (jim tashlab yuborilmasin)
function validateSettingsInput(raw) {
  const ch = String((raw && raw.channel) || '').trim();
  if (ch && !CHAT_RE.test(ch)) return "Kanal noto'g'ri: @username yoki -100… ID yozing";
  return null;
}
async function loadSettings(admin, filial) {
  const { data, error } = await admin.from('ai_ad_settings').select('data').eq('branch_id', filial).maybeSingle();
  if (error) throw error;
  return normalizeSettings(data && data.data);
}

// Reklama kanali: filial sozlamasidagi «Reklama kanali», bo'lmasa — tgAnnounceChats ning birinchisi
function channelOf(adSettings, st) {
  if (adSettings && adSettings.channel) return adSettings.channel;
  const raw = Array.isArray(st && st.tgAnnounceChats) ? st.tgAnnounceChats : String((st && st.tgAnnounceChats) || '').split(/[\s,;]+/);
  return raw.map((x) => String(x || '').trim()).find((x) => CHAT_RE.test(x)) || '';
}

// ── Ma'lumot: app_data + filial qatori; partiyalar va qoldiq — server jurnalidan (shop-public bilan bir xil) ──
async function loadBranch(admin, filial) {
  const [{ data: row, error }, { data: brow, error: e2 }] = await Promise.all([
    admin.from('app_data').select('data').eq('id', 'main').maybeSingle(),
    admin.from('app_data_branches').select('branch_key,data').eq('branch_key', filial).maybeSingle(),
  ]);
  if (error) throw error; if (e2) throw e2;
  const main = (row && row.data) || {};
  const bs = { ...(main.branchStore || {}) };
  if (brow && brow.data) bs[filial] = brow.data;
  const data = { ...main, branchStore: bs };
  const raw = bs[filial] || {};
  let view = raw, ledgerData = null;
  const ledger = await ledgerAuthorityOn(admin);
  if (ledger) { ledgerData = await loadLedger(admin, filial); view = overlayBranchLedger(raw, ledgerData).branch; }
  const shop = raw.shop || {};
  return { data, settings: main.settings || {}, raw, view, ledgerData, shop, ledger, shopOn: !!(shop.settings && shop.settings.enabled) };
}

// Toshkent sanasi (YYYY-MM-DD) — n kun oldin
function tzDate(nowMs, minusDays = 0) { return new Date(nowMs + TZ_MS - minusDays * DAY).toISOString().slice(0, 10); }

// Mahsulot birinchi marta omborga kelgan kun (qayta kirim hisobga olinmaydi): eng erta partiya sanasi
function firstKirimMap(batches) {
  const m = new Map();
  for (const b of Array.isArray(batches) ? batches : []) {
    if (!b || b.pid == null) continue;
    const d = String(b.date || b.batch_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const k = String(b.pid);
    if (!m.has(k) || d < m.get(k)) m.set(k, d);
  }
  return m;
}
// uid() — Date.now()*1000 (+ tartib). Shunday ID bo'lsa — qo'shilgan sana, aks holda null
function idDate(id) {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n < 1.5e15 || n > 4.1e15) return null;   // 2017 … 2099
  return new Date(Math.floor(n / 1000) + TZ_MS).toISOString().slice(0, 10);
}
// «Qo'shilgan kun»: birinchi kirim, bo'lmasa — ID dagi vaqt; ikkalasi ham bo'lmasa — null («yangi»ga kirmaydi)
function addedDate(p, firstKirim) { return firstKirim.get(String(p.id)) || idDate(p.id) || null; }

// Savdo qatorlari: [{pid, qty, date}] — date: Toshkent kuni (YYYY-MM-DD). ALOHIDA SO'ROV YO'Q:
//   • jurnal rejimi — loadLedger() savdolari (selectAll bilan sahifalab TO'LIQ o'qilgan; PostgREST 1000 qatorda kesmaydi, P99);
//     sana — sale_date (savdo kuni, Toshkent), bo'lmasa created_at Toshkent vaqtiga o'tkazilib;
//   • eski rejim — filial ma'lumotidagi savdolar (s.date).
// O'chirilgan savdo hisobga olinmaydi.
const tzDay = (ts) => { const t = ts instanceof Date ? ts.getTime() : Date.parse(ts); return Number.isFinite(t) ? new Date(t + TZ_MS).toISOString().slice(0, 10) : ''; };
// sale_date — sana ustuni (PostgREST: 'YYYY-MM-DD'; ba'zi drayverlar — Date obyekti, UTC yarim tun)
const dayOf = (v) => { if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString().slice(0, 10) : ''; const d = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''; };
function saleLines(L, sinceDate) {
  const out = [];
  const dead = (st) => st === 'void' || st === 'voided';
  const add = (items, date) => {
    if (!date || date < sinceDate) return;
    for (const it of Array.isArray(items) ? items : []) { if (!it || it.pid == null) continue; const q = Number(it.qty) || 0; if (q > 0) out.push({ pid: String(it.pid), qty: q, date }); }
  };
  if (L.ledger && L.ledgerData && (L.ledgerData.salesRows || L.ledgerData.sales)) {
    const rows = Array.isArray(L.ledgerData.salesRows) ? L.ledgerData.salesRows : [...L.ledgerData.sales.values()];
    for (const r of rows) if (r && !dead(r.status)) add(r.items, dayOf(r.sale_date) || tzDay(r.created_at));
  } else {
    for (const s of Array.isArray(L.view.sales) ? L.view.sales : []) if (s && !dead(s.status)) add(s.items, dayOf(s.date));
  }
  return out;
}
// Shu sanadan beri sotilgan miqdor: pid → dona
function soldSince(lines, sinceDate) {
  const m = new Map();
  for (const l of lines) if (l.date >= sinceDate) m.set(l.pid, (m.get(l.pid) || 0) + l.qty);
  return m;
}

// Oxirgi N kunda reklama qilingan (yuborilgan yoki navbatdagi) mahsulotlar: pid → oxirgi sana
async function recentAdsMap(admin, filial, sinceIso) {
  const { data, error } = await admin.from('ai_ad_posts').select('product_id,status,created_at').eq('branch_id', filial).gte('created_at', sinceIso).limit(2000);
  if (error) throw error;
  const m = new Map();
  for (const r of data || []) {
    if (!['sent', 'draft', 'sending'].includes(r.status)) continue;
    const k = String(r.product_id), t = String(r.created_at);
    if (!m.has(k) || t > m.get(k)) m.set(k, t);
  }
  return m;
}

// Narx satri — vitrina bilan bir xil ko'rinish
function priceLine(v, cur) {
  if (!(Number(v) > 0)) return '';
  if (cur === 'USD') return '$' + (Math.round(Number(v) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return String(Math.round(Number(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' soʻm';
}

// ── Nomzodlar ──
// opts: { filial, settings (normalizeSettings), now (ms), soldTop / soldStuck (Map pid → dona), recent (Map) } — sof funksiya
function pickCandidates(L, opts) {
  const S = opts.settings || normalizeSettings({});
  const C = S.criteria, now = opts.now || Date.now();
  const ctx = SP.catalogCtx(L.data, opts.filial, L.view);
  const first = firstKirimMap(L.view.batches);
  const soldTop = opts.soldTop || new Map(), soldStuck = opts.soldStuck || new Map(), recent = opts.recent || new Map();
  const newSince = tzDate(now, C.newDays), stuckSince = tzDate(now, C.stuckDays);
  const discounts = new Set((Array.isArray(L.shop.discounts) ? L.shop.discounts : []).filter((d) => d && Number(d.priceUsd) > 0).map((d) => String(d.pid)));
  const topRank = new Map();
  if (C.top) [...soldTop.entries()].filter(([, q]) => q > 0).sort((a, b) => b[1] - a[1]).slice(0, C.topN).forEach(([pid], i) => topRank.set(pid, i));
  const out = [];
  for (const p of Array.isArray(L.data.products) ? L.data.products : []) {
    if (!p || p.noAds) continue;
    const pub = SP.publicProduct(p, ctx);
    if (!pub || !(pub.stock > 0) || !(pub.price > 0) || !pub.img || !pub.img.length) continue;
    const k = String(p.id), reasons = [];
    if (C.discount && discounts.has(k) && pub.old) reasons.push('discount');
    const added = addedDate(p, first);
    if (C.new && added && added >= newSince) reasons.push('new');
    if (C.top && topRank.has(k)) reasons.push('top');
    // turib qolgan: qoldig'i bor, oxirgi N kunda sotilmagan va omborga N kundan oldin kelgan (yangi kelgan tovar «turib qolgan» emas)
    if (C.stuck && !(soldStuck.get(k) > 0) && added && added < stuckSince) reasons.push('stuck');
    if (!reasons.length) continue;
    const score = reasons.reduce((s, r) => s + REASON_W[r], 0) + (topRank.has(k) ? (C.topN - topRank.get(k)) : 0);
    out.push({
      pid: p.id, name: pub.name, sku: pub.sku, brand: pub.brand, cat: pub.cat, desc: pub.desc || '', img: pub.img.slice(0, 4),
      reasons, reasonLabels: reasons.map((r) => REASON_LABEL[r]), price: pub.price, old: pub.old || null, cur: ctx.cur,
      line: priceLine(pub.price, ctx.cur), oldLine: pub.old ? priceLine(pub.old, ctx.cur) : '', stock: pub.stock,
      pct: pub.old > pub.price ? Math.round((1 - pub.price / pub.old) * 100) : 0,   // chegirma foizi — serverda (brauzer hisoblamaydi)
      sold: soldTop.get(k) || 0, addedAt: added, recentAt: recent.get(k) || null, score,
    });
  }
  // 7 kunda reklama qilingani — pastga (o'z ichida ball bo'yicha)
  out.sort((a, b) => (a.recentAt ? 1 : 0) - (b.recentAt ? 1 : 0) || b.score - a.score || String(a.name).localeCompare(String(b.name)));
  return out;
}

async function candidates(admin, filial, settings, now = Date.now()) {
  const L = await loadBranch(admin, filial);
  if (!L.shopOn) return { shopOn: false, items: [] };
  const C = settings.criteria;
  const topSince = tzDate(now, C.topDays), stuckSince = tzDate(now, C.stuckDays);
  const lines = saleLines(L, topSince < stuckSince ? topSince : stuckSince);
  const recent = await recentAdsMap(admin, filial, new Date(now - C.repeatDays * DAY).toISOString());
  const items = pickCandidates(L, { filial, settings, now, recent, soldTop: soldSince(lines, topSince), soldStuck: soldSince(lines, stuckSince) });
  return { shopOn: true, items, cur: items[0] ? items[0].cur : null };
}

module.exports = { DEFAULT_SETTINGS, REASONS, REASON_LABEL, normalizeSettings, validateSettingsInput, loadSettings, channelOf, loadBranch,
  tzDate, firstKirimMap, idDate, addedDate, saleLines, soldSince, recentAdsMap, priceLine, pickCandidates, candidates };
