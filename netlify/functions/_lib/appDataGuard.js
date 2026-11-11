// ════════════════════════════════════════════════════════════
// app_data / app_data_branches uchun UMUMIY yozish-himoyasi (RBAC).
// app-data-save.js va app-data-branch-save.js IKKALASI ham shu yerdan
// foydalanadi — bitta qoida, ikki joyda takrorlanmaydi.
//
// QOIDA (OWASP A01 tuzatishi, 2026-09-28):
//  1) Faqat HAQIQATAN O'ZGARGAN kalitlar tekshiriladi (serverdagi mavjud
//     qiymat bilan solishtiriladi). Klient har save()da butun obyektni
//     yuboradi — o'zgarmagan kalitlarni tekshirish oddiy sotuvchining
//     savdosini ham "mahsulotlar.edit yo'q" deb rad etib qo'yardi.
//  2) Ruxsati yo'q o'zgarish — BUTUN saqlash rad etilmaydi, faqat o'sha
//     kalit E'TIBORGA OLINMAYDI (serverdagi qiymat saqlanib qoladi,
//     klientga qaytariladi) va staff_audit_log'ga yoziladi.
//  3) Ommaviy o'chirish himoyasi: admin bo'lmagan xodim muhim ro'yxatni
//     (savdolar, mijozlar, partiyalar, kassalar, mahsulotlar...) bir
//     yozishda yarmidan ko'proqqa qisqartira olmaydi — "Butun tizimni 0
//     qilish" kabi amallar faqat admin uchun (klientdagi PIN emas, SERVER
//     tekshiradi).
//
// Ruxsat ro'yxatlari HAQIQIY ish oqimlaridan kelib chiqib tuzilgan: bitta
// amal (masalan savdo) bir nechta kalitni o'zgartiradi (partiya "sold",
// kassa balansi, mijoz qarzi, ta'minotchi qarzi) — agar ulardan biri
// tashlab yuborilsa, hisob buziladi. Shuning uchun har bir kalit uni
// qonuniy o'zgartiradigan BARCHA amallarning huquqini qabul qiladi.
// ════════════════════════════════════════════════════════════

const SALE_LIKE = ['savdo.create', 'savdo.edit', 'savdo.delete', 'qaytarish.create'];

// Yuqori darajali app_data kaliti → permission(lar) (biri yetarli).
// Ro'yxatda yo'q kalit — admin bo'lmaganga deny-by-default.
// `null` — maxsus ruxsat kerak emas. `settings` va `deletedIds` — pastda
// alohida, ichki kalit darajasida tekshiriladi.
const TOP_LEVEL_PERMISSION_MAP = {
  products:        ['mahsulotlar.edit', 'mahsulotlar.create', 'mahsulotlar.delete', 'kirim.create'],
  partners:        ['hamkorlar.edit', 'xarajatlar.create'], // hamkor turidagi xarajat partners.invested'ni o'zgartiradi
  partnerPeriods:  ['hamkorlar.edit', 'hamkorlar.calc'],
  settings:        'sozlamalar.edit',
  dealers:         'dillerlar.manage',
  dealerStock:     'dillerlar.manage',
  dealerTxns:      'dillerlar.manage',
  dealerRevisions: 'dillerlar.manage',
  branchDebt:      ['ombor.edit', 'kirim.create'],
  filialOrders:    ['ombor.edit', 'kirim.create'],
  auditLogs:       null,
  deletedIds:      null, // ichki kalitlar (kind) bo'yicha alohida tekshiriladi
  activeBranch:    null,
  branchSettings:  'sozlamalar.edit',   // v24.5: Baza filialining chek matni/telefon/manzili
};

// Filial ichidagi kalit → uni QONUNIY o'zgartiradigan amallarning permission'lari.
const BRANCH_KEY_PERMISSION_MAP = {
  sales:         [...SALE_LIKE, 'mijozlar.debt_payment'],
  customers:     ['mijozlar.edit', 'mijozlar.debt_payment', ...SALE_LIKE],
  batches:       ['ombor.edit', 'kirim.create', ...SALE_LIKE],
  cashboxes:     ['kassalar.transact', 'mijozlar.debt_payment', 'xarajatlar.create', 'kirim.create', 'taminotchilar.edit', ...SALE_LIKE],
  cashTxns:      ['kassalar.transact', 'mijozlar.debt_payment', 'xarajatlar.create', 'kirim.create', 'taminotchilar.edit', ...SALE_LIKE],
  suppliers:     ['taminotchilar.edit', 'kirim.create', ...SALE_LIKE], // konsignatsiya/to'g'ridan-yetkazish savdosi ta'minotchi qarzini o'zgartiradi
  expenses:      ['xarajatlar.create', 'kassalar.transact', ...SALE_LIKE], // sotuvchi ilovasida "Xarajat" va "Oylik" bo'limlari bor
  salaryPeople:  ['sotuvchilar.manage', 'xarajatlar.create', ...SALE_LIKE], // sotuvchi o'z oyligini yozadi (debtUsd o'zgaradi)
  revisions:     ['ombor.edit'],
  writeoffs:     ['ombor.writeoff', 'ombor.edit'], // v23.6: 29 bo'lsa — bazadan ustidan yoziladi (overlay)
  dailyClosings: ['kassalar.transact', ...SALE_LIKE],
  batchCounter:  ['ombor.edit', 'kirim.create'],
  branchSettings: ['sozlamalar.edit'],   // v24.5: filial chek matni, telefon, manzil (sotuvchi ilovasidan ham — faqat ruxsat bilan)
};

// settings ichida sozlamalar.edit'siz ham o'zgartirilishi mumkin bo'lgan
// kalitlar: kunlik valyuta kursi oynasi HAR BIR xodimga chiqadi.
const SETTINGS_OPEN_KEYS = ['usdUzs', 'usdCny', 'rateDate'];
// v24.5: faqat administrator o'zgartiradigan sozlamalar (sozlamalar.edit ruxsati bo'lsa ham) — zaxira nusxa manzili va jadvali
const ADMIN_ONLY_SETTINGS_KEYS = ['tgBackupChat', 'tgBackupDaily', 'tgBackupHour'];   // v23.9: rateDate — kurs bugun tasdiqlangani (kunlik so'rov)

const MASS_DELETE_GUARDED_TOP = ['products', 'partners'];
const MASS_DELETE_GUARDED_BRANCH = ['sales', 'customers', 'batches', 'cashboxes', 'cashTxns', 'suppliers', 'expenses'];
const MASS_DELETE_MIN_EXISTING = 10;  // kichik ro'yxatlarda oddiy o'chirishga xalaqit bermaydi
const MASS_DELETE_MAX_SHRINK = 0.5;   // bir yozishda yarmidan ko'pi yo'qolsa — bloklanadi

function hasPerm(permKeys, need) {
  if (need == null) return true;
  const list = Array.isArray(need) ? need : [need];
  return list.some(k => permKeys.has(k));
}

function sameValue(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return false; }
}

function isMassDelete(oldVal, newVal) {
  const oldLen = Array.isArray(oldVal) ? oldVal.length : 0;
  if (oldLen < MASS_DELETE_MIN_EXISTING) return false;
  const newLen = Array.isArray(newVal) ? newVal.length : 0;
  return newLen < oldLen * MASS_DELETE_MAX_SHRINK;
}

function permForCollection(kind) {
  if (kind in BRANCH_KEY_PERMISSION_MAP) return BRANCH_KEY_PERMISSION_MAP[kind];
  if (kind in TOP_LEVEL_PERMISSION_MAP && TOP_LEVEL_PERMISSION_MAP[kind] !== null) return TOP_LEVEL_PERMISSION_MAP[kind];
  return undefined; // noma'lum
}

// v10 (F7): maxfiy sozlamalar (Telegram bot tokeni, admin/filial PIN'lari) admin
// bo'lmagan xodimga YUBORILMAYDI (app-data-load). Shuning uchun ularning saqlashida
// bu kalitlar yo'q bo'ladi — bu "o'chirish" emas: serverdagi qiymat saqlab qolinadi.
const SECRET_SETTINGS_KEYS = ['tgBotToken', 'shopBotToken', 'appPin', 'branchPin'];
function stripSecretSettings(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  const out = { ...settings };
  SECRET_SETTINGS_KEYS.forEach(k => { delete out[k]; });
  if (settings.tgBotToken) out.tgBotTokenSet = true;
  if (settings.shopBotToken) out.shopBotTokenSet = true;
  return out;
}
// v23: admin'ga ham Telegram tokeni yuborilmaydi (PIN'lar admin'da qoladi — ular brauzerda tekshiriladi)
function stripAdminSecrets(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  const out = { ...settings };
  delete out.tgBotToken; delete out.shopBotToken;
  if (settings.tgBotToken) out.tgBotTokenSet = true;
  if (settings.shopBotToken) out.shopBotTokenSet = true;
  return out;
}
function restoreSecretSettings(ex, nv) {
  const out = { ...nv };
  SECRET_SETTINGS_KEYS.forEach(k => { if (nv[k] === undefined && ex[k] !== undefined) out[k] = ex[k]; });
  return out;
}

// settings — ichki kalit darajasida: ruxsatli qismi qabul qilinadi.
function filterSettings(exVal, newVal, permKeys) {
  const ex = exVal && typeof exVal === 'object' ? exVal : {};
  if (newVal && typeof newVal === 'object') newVal = restoreSecretSettings(ex, newVal);
  if (hasPerm(permKeys, 'sozlamalar.edit')) return { value: newVal, ignored: false };
  if (!newVal || typeof newVal !== 'object') return { value: exVal, ignored: true };
  const out = { ...ex };
  let ignored = false;
  for (const k of new Set([...Object.keys(ex), ...Object.keys(newVal)])) {
    if (sameValue(ex[k], newVal[k])) continue;
    if (SETTINGS_OPEN_KEYS.includes(k)) {
      // HARDENING (taklif): kunlik kurs hammaga ochiq (v23.9 qoidasi), lekin `sozlamalar.edit`'siz xodim uchun
      // faqat aql doirasida: avvalgi qiymatdan ±RATE_MAX_STEP; avval qiymat bo'lmasa — mutlaq oraliq. Aks holda rad
      // (server qiymati qoladi). Kurs server hisob-kitoblariga (_fw_rate) ta'sir qiladi — soxta kurs qarz/kassani buzadi.
      if (RATE_BOUNDS[k] && !rateAcceptable(k, ex[k], newVal[k])) { ignored = true; continue; }
      out[k] = newVal[k];
    } else ignored = true;
  }
  return { value: out, ignored };
}
const RATE_MAX_STEP = 0.15;
const RATE_BOUNDS = { usdUzs: [1000, 100000], usdCny: [1, 50] };
function rateAcceptable(k, oldV, newV) {
  const n = Number(newV), o = Number(oldV);
  if (!Number.isFinite(n) || n <= 0) return false;
  if (Number.isFinite(o) && o > 0) return Math.abs(n / o - 1) <= RATE_MAX_STEP;
  return n >= RATE_BOUNDS[k][0] && n <= RATE_BOUNDS[k][1];
}

// v10 (F15): audit jurnali — admin bo'lmagan xodim faqat YANGI yozuv QO'SHA oladi;
// mavjud yozuvlarni o'chirish/o'zgartirish e'tiborga olinmaydi (avval istalgan xodim
// `auditLogs: []` yuborib butun tarixni o'chira olardi).
const AUDIT_LOG_CAP = 200;
function filterAuditLogs(exVal, newVal) {
  const ex = Array.isArray(exVal) ? exVal.filter(e => e && typeof e === 'object') : [];
  const nv = Array.isArray(newVal) ? newVal : [];
  const seen = new Set(ex.map(e => e.id));
  const added = nv.filter(e => e && typeof e === 'object' && e.id != null && !seen.has(e.id))
    .slice(0, 50)
    .map(e => ({ id: e.id, action: String(e.action || '').slice(0, 500), ts: String(e.ts || new Date().toISOString()).slice(0, 40) }));
  const value = [...added, ...ex].sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, AUDIT_LOG_CAP);
  return { value, ignored: false };
}

// deletedIds — {kind: [{id,ts}]}. Tombstone qo'shish = o'sha ro'yxatdan
// o'chirish (keyingi admin saqlashi uni HAQIQATAN o'chiradi), shuning uchun
// har bir "kind" uchun o'sha ro'yxatga yozish huquqi talab qilinadi.
function filterDeletedIds(exVal, newVal, permKeys) {
  if (!newVal || typeof newVal !== 'object') return { value: exVal, ignored: !sameValue(exVal, newVal) };
  const ex = exVal && typeof exVal === 'object' ? exVal : {};
  const out = { ...ex };
  let ignored = false;
  for (const kind of new Set([...Object.keys(ex), ...Object.keys(newVal)])) {
    if (sameValue(ex[kind], newVal[kind])) continue;
    const need = permForCollection(kind);
    if (need !== undefined && hasPerm(permKeys, need)) out[kind] = newVal[kind]; else ignored = true;
  }
  return { value: out, ignored };
}

// Natija: { allowed:{...}, ignored:[...], massDelete:[...], serverValues:{...} }
// `allowed` — yozishga ruxsat berilgan O'ZGARGAN kalitlar (qisman ruxsatda — birlashtirilgan qiymat).
// `serverValues` — rad etilgan kalitlar uchun serverdagi haqiqiy qiymat (klient o'zini tuzatishi uchun).
function filterChanges({ existing, incoming, permKeys, isAdmin, map, massGuarded, prefix = '', unknownAllowed = false, subFilters = {} }) {
  const allowed = {}, ignored = [], massDelete = [], serverValues = {};
  const ex = existing || {};
  for (const k of Object.keys(incoming || {})) {
    const val = incoming[k];
    if (sameValue(ex[k], val)) continue;
    if (isAdmin) { allowed[k] = val; continue; }
    if (massGuarded.includes(k) && isMassDelete(ex[k], val)) { massDelete.push(prefix + k); serverValues[k] = ex[k]; continue; }
    if (subFilters[k]) {
      const r = subFilters[k](ex[k], val, permKeys);
      if (!sameValue(r.value, ex[k])) allowed[k] = r.value;
      if (r.ignored) { ignored.push(prefix + k); serverValues[k] = r.value; }
      continue;
    }
    if (!(k in map)) {
      if (unknownAllowed) allowed[k] = val; else { ignored.push(prefix + k); serverValues[k] = ex[k]; }
      continue;
    }
    if (hasPerm(permKeys, map[k])) allowed[k] = val; else { ignored.push(prefix + k); serverValues[k] = ex[k]; }
  }
  return { allowed, ignored, massDelete, serverValues };
}

// Bitta filial obyekti uchun (app_data.branchStore[filial] yoki app_data_branches.data).
// Ro'yxatda yo'q filial-ichi kalit — cheklanmaydi (UI/texnik maydonlar).
function filterBranchChanges({ existing, incoming, permKeys, isAdmin, prefix = '' }) {
  if (incoming && Object.prototype.hasOwnProperty.call(incoming, 'shop')) {
    incoming = { ...incoming, shop: normalizeIncomingShop(existing && existing.shop, incoming.shop) };
  }
  return filterChanges({
    existing, incoming, permKeys, isAdmin,
    map: BRANCH_KEY_PERMISSION_MAP, massGuarded: MASS_DELETE_GUARDED_BRANCH,
    prefix, unknownAllowed: true,
    subFilters: { shop: filterShop },
  });
}

// ════════════════════════════════════════════════════════════
// ONLAYN-DO'KON (filial ichidagi `shop` kaliti):
//  • settings / banners / discounts — do'kon sozlamasi: faqat `sozlamalar.edit`;
//  • orders / reviews — buyurtmalar bilan ishlash: savdo huquqlari (SALE_LIKE);
//  • buyurtma va sharh HECH QACHON o'chirilmaydi (faqat holati o'zgaradi): serverdagi
//    ro'yxat bilan ID bo'yicha birlashtiriladi, yangiroq (updatedAt) nusxa ustun —
//    eskirgan brauzer nusxasi boshqa qurilmadagi buyurtmani yo'qotib yubormaydi;
//  • hajm chegaralari: banner ≤5 (faqat https havola), chegirma ≤20, buyurtma ≤3000.
// ════════════════════════════════════════════════════════════
const SHOP_CFG_KEYS = ['settings', 'banners', 'discounts'];
const SHOP_LIMITS = { banners: 5, discounts: 20, orders: 3000, reviews: 2000 };
function _shopTs(x) { const t = Date.parse((x && x.updatedAt) || (x && x.createdAt) || 0); return Number.isFinite(t) ? t : 0; }
function _shopUnion(exArr, nvArr, cap) {
  const map = new Map();
  (Array.isArray(exArr) ? exArr : []).forEach(x => { if (x && x.id != null) map.set(String(x.id), x); });
  (Array.isArray(nvArr) ? nvArr : []).forEach(x => {
    if (!x || typeof x !== 'object' || x.id == null) return;
    // v24.5 audit: ID — faqat xavfsiz belgilar (ilova 'so'/'rv' + uid() yaratadi). Boshqa ID (masalan qo'shtirnoq bilan —
    // admin brauzerida onclick ichida ishlatiladi) qabul qilinmaydi.
    if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(String(x.id))) return;
    const k = String(x.id), old = map.get(k);
    if (!old || _shopTs(x) >= _shopTs(old)) map.set(k, x);
  });
  return Array.from(map.values()).sort((a, b) => _shopTs(b) - _shopTs(a)).slice(0, cap);
}
function _shopCleanCfg(nv) {
  const out = {};
  if (nv.settings && typeof nv.settings === 'object' && !Array.isArray(nv.settings)) {
    out.settings = nv.settings;
    // v24.7: kategoriya rasmlari — faqat https havola (≤600 belgi), nomi ≤80 belgi, ko'pi bilan 100 ta
    if (nv.settings.catImg !== undefined) {
      const m = {}, src = nv.settings.catImg && typeof nv.settings.catImg === 'object' && !Array.isArray(nv.settings.catImg) ? nv.settings.catImg : {};
      Object.keys(src).slice(0, 100).forEach(k => { const u = src[k]; if (String(k).length <= 80 && typeof u === 'string' && /^https:\/\/[^\s"'<>]{4,600}$/i.test(u)) m[k] = u; });
      out.settings = { ...nv.settings, catImg: m };
    }
  }
  if (Array.isArray(nv.banners)) out.banners = nv.banners.filter(b => b && typeof b === 'object' && /^https:\/\//.test(String(b.url || ''))).slice(0, SHOP_LIMITS.banners);
  if (Array.isArray(nv.discounts)) out.discounts = nv.discounts.filter(d => d && typeof d === 'object' && Number.isFinite(+d.priceUsd) && +d.priceUsd > 0).slice(0, SHOP_LIMITS.discounts);
  return out;
}
function normalizeIncomingShop(ex, nv) {
  if (!nv || typeof nv !== 'object' || Array.isArray(nv)) return nv;
  const e = ex && typeof ex === 'object' ? ex : {};
  return { ...nv, ..._shopCleanCfg(nv),
    orders: _shopUnion(e.orders, nv.orders, SHOP_LIMITS.orders),
    reviews: _shopUnion(e.reviews, nv.reviews, SHOP_LIMITS.reviews),
    seq: Math.max(+e.seq || 0, +nv.seq || 0) };
}
function filterShop(exVal, newVal, permKeys) {
  const ex = exVal && typeof exVal === 'object' && !Array.isArray(exVal) ? exVal : {};
  if (!newVal || typeof newVal !== 'object' || Array.isArray(newVal)) return { value: exVal, ignored: !sameValue(exVal, newVal) };
  const out = { ...ex };
  let ignored = false;
  const canCfg = hasPerm(permKeys, 'sozlamalar.edit');
  const canOrders = hasPerm(permKeys, SALE_LIKE);
  for (const k of SHOP_CFG_KEYS) {
    if (sameValue(ex[k], newVal[k])) continue;
    if (canCfg && newVal[k] !== undefined) out[k] = newVal[k]; else if (newVal[k] !== undefined) ignored = true;
  }
  for (const k of ['orders', 'reviews', 'seq']) {
    if (sameValue(ex[k], newVal[k])) continue;
    if (canOrders || (k === 'reviews' && canCfg)) out[k] = newVal[k]; else ignored = true;
  }
  return { value: out, ignored };
}

// v23: Telegram bot tokeni hech kimga (admin'ga ham) brauzerda yuborilmaydi — faqat "o'rnatilgan"
// belgisi (tgBotTokenSet). Saqlashda: token kelmasa — serverdagi qiymat qoladi; belgi saqlanmaydi.
function normalizeIncomingSettings(ex, nv) {
  if (!nv || typeof nv !== 'object') return nv;
  const out = restoreSecretSettings(ex && typeof ex === 'object' ? ex : {}, nv);
  delete out.tgBotTokenSet; delete out.shopBotTokenSet;
  // v23.6: brend logotipi — faqat https havola (≤600 belgi); aks holda avvalgi qiymat qoladi
  if (Object.prototype.hasOwnProperty.call(out, 'brandLogo') && out.brandLogo !== '' &&
      !(typeof out.brandLogo === 'string' && /^https:\/\/[^\s"'<>]{4,600}$/i.test(out.brandLogo))) {
    if (ex && typeof ex === 'object' && ex.brandLogo !== undefined) out.brandLogo = ex.brandLogo; else delete out.brandLogo;
  }
  if (out.company != null) out.company = String(out.company).slice(0, 60);
  if (out.brandSlogan != null) out.brandSlogan = String(out.brandSlogan).slice(0, 80);
  // v24: ijtimoiy tarmoqlar va e'lon havolasi — faqat https (aks holda avvalgi qiymat qoladi); e'lon chatlari — ≤10, format tekshiriladi
  const prev = ex && typeof ex === 'object' ? ex : {};
  ['socialInstagram', 'socialYoutube', 'socialFacebook', 'tgAnnounceLink'].forEach((k) => {
    if (!Object.prototype.hasOwnProperty.call(out, k) || out[k] === '' || out[k] == null) return;
    if (!(typeof out[k] === 'string' && /^https:\/\/[^\s"'<>]{3,300}$/i.test(out[k]))) { if (prev[k] !== undefined) out[k] = prev[k]; else delete out[k]; }
  });
  if (Object.prototype.hasOwnProperty.call(out, 'tgAnnounceChats')) {
    const arr = Array.isArray(out.tgAnnounceChats) ? out.tgAnnounceChats : [];
    out.tgAnnounceChats = [...new Set(arr.map((x) => String(x || '').trim()).filter((x) => /^-?\d{3,20}$|^@[A-Za-z0-9_]{4,64}$/.test(x)))].slice(0, 10);
  }
  if (out.tgAnnounceOn != null) out.tgAnnounceOn = !!out.tgAnnounceOn;
  // v25.1: hodisa xabarlari — dillerlar guruhi/kanali (≤5, format tekshiriladi), turlar (faqat true/false), eslatma soati (6–22)
  if (Object.prototype.hasOwnProperty.call(out, 'tgDealerChats')) {
    const arr = Array.isArray(out.tgDealerChats) ? out.tgDealerChats : [];
    out.tgDealerChats = [...new Set(arr.map((x) => String(x || '').trim()).filter((x) => /^-?\d{3,20}$|^@[A-Za-z0-9_]{4,64}$/.test(x)))].slice(0, 5);
  }
  if (Object.prototype.hasOwnProperty.call(out, 'tgEvt')) {
    const e = out.tgEvt && typeof out.tgEvt === 'object' ? out.tgEvt : {};
    out.tgEvt = {}; ['credit', 'pay', 'remind', 'dealer', 'month', 'copyMain'].forEach((k) => { if (k in e) out.tgEvt[k] = !!e[k]; });
  }
  // v25.1: har filialning va har dillerning O'Z guruhi — { kalit: chat }; kalit/chat formati tekshiriladi, ≤200 ta
  const chatMap = (v, keyRe) => {
    const o = {}; if (!v || typeof v !== 'object' || Array.isArray(v)) return o;
    for (const [k, c] of Object.entries(v).slice(0, 200)) { const cv = String(c || '').trim(); if (keyRe.test(k) && /^-?\d{3,20}$|^@[A-Za-z0-9_]{4,64}$/.test(cv)) o[k] = cv; }
    return o;
  };
  if (Object.prototype.hasOwnProperty.call(out, 'tgBranchChats')) out.tgBranchChats = chatMap(out.tgBranchChats, /^[A-Za-z0-9_-]{1,40}$/);
  if (Object.prototype.hasOwnProperty.call(out, 'tgDealerChatMap')) out.tgDealerChatMap = chatMap(out.tgDealerChatMap, /^\d{1,15}$/);
  if (out.tgRemindHour != null) { const h = parseInt(out.tgRemindHour, 10); out.tgRemindHour = h >= 6 && h <= 22 ? h : 9; }
  return out;
}

// v23: Hamkorlar (investor/ta'sischi) — har bir filialning o'z hamkorlari (p.filial, standart 'baza').
// Admin bo'lmagan xodim faqat O'Z filialining hamkorlari/taqsimotlarini o'zgartira oladi.
function makeBranchScopedFilter(filial, need) {
  const fOf = (x) => (x && x.filial) || 'baza';
  return (exVal, newVal, permKeys) => {
    const ex = Array.isArray(exVal) ? exVal : [];
    if (!hasPerm(permKeys, need) || !Array.isArray(newVal)) return { value: exVal, ignored: !sameValue(exVal, newVal) };
    const exById = new Map(ex.filter(x => x && x.id !== undefined).map(x => [String(x.id), x]));
    let ignored = false;
    const seen = new Set();
    const out = [];
    for (const x of newVal) {
      if (!x || x.id === undefined) continue;
      const key = String(x.id); seen.add(key);
      const prev = exById.get(key);
      if (fOf(x) === filial && (!prev || fOf(prev) === filial)) { out.push(x); continue; }
      // boshqa filialga tegishli yozuv — o'zgarishsiz qoladi (yoki qo'shilmaydi)
      if (prev) { out.push(prev); if (!sameValue(prev, x)) ignored = true; } else ignored = true;
    }
    for (const [key, prev] of exById) {
      if (seen.has(key)) continue;
      if (fOf(prev) !== filial) { out.push(prev); ignored = true; }   // boshqa filialnikini o'chirish — rad
    }
    return { value: out, ignored };
  };
}

// v24.5 (v23.10 dan): hamkorlar — `hamkorlar.edit` bo'lmasa (faqat `xarajatlar.create`: hamkor turidagi xarajat), xodim faqat
// MAVJUD hamkorning `invested` (va `updatedAt`) maydonini o'zgartira oladi: yangi hamkor qo'shish, o'chirish, ulush
// foizi, ism, ta'sischi belgisi va boshqa maydonlar — rad (serverdagi qiymat qoladi). `invested` — chekli son.
const PARTNER_EXPENSE_FIELDS = ['invested', 'updatedAt'];
function makePartnerFilter(filial) {
  const scoped = makeBranchScopedFilter(filial, TOP_LEVEL_PERMISSION_MAP.partners);
  return (exVal, newVal, permKeys) => {
    const r = scoped(exVal, newVal, permKeys);
    if (hasPerm(permKeys, 'hamkorlar.edit') || !Array.isArray(r.value)) return r;
    const ex = Array.isArray(exVal) ? exVal : [];
    const exById = new Map(ex.filter(x => x && x.id !== undefined).map(x => [String(x.id), x]));
    let ignored = r.ignored;
    const seen = new Set();
    const out = [];
    for (const x of r.value) {
      if (!x || x.id === undefined) continue;
      const key = String(x.id); seen.add(key);
      const prev = exById.get(key);
      if (!prev) { ignored = true; continue; }                       // yangi hamkor — faqat hamkorlar.edit
      const merged = { ...prev };
      if (typeof x.invested === 'number' && Number.isFinite(x.invested) && Math.abs(x.invested) <= 1e10) merged.invested = x.invested;
      if (x.updatedAt != null) merged.updatedAt = x.updatedAt;
      if (!sameValue(merged, x)) ignored = true;
      out.push(merged);
    }
    for (const [key, prev] of exById) if (!seen.has(key)) { out.push(prev); ignored = true; }   // o'chirish — rad
    return { value: out, ignored };
  };
}
// v23.10.1: hamkor `invested` — SERVER hisobi. Hamkor turidagi xarajat (turi='hamkor', partnerId) invested'ni
// o'zgartiradi: kind='kirim' → +amtUsd, aks holda −amtUsd; xarajat o'chirilsa yoki tahrirlansa — farqi.
// partnerExpenseDelta(before, after) — qabul qilingan filial xarajatlari bo'yicha har hamkorga kutilgan o'zgarish.
const _r4 = (x) => Math.round((Number(x) || 0) * 10000) / 10000;
function partnerExpenseContrib(expenses) {
  const m = new Map();
  for (const e of (Array.isArray(expenses) ? expenses : [])) {
    if (!e || e.turi !== 'hamkor' || e.partnerId == null || e.partnerId === '') continue;
    const a = Number(e.amtUsd);
    if (!Number.isFinite(a) || a < 0 || a > 1e10) continue;
    const k = String(e.partnerId);
    m.set(k, (m.get(k) || 0) + (e.kind === 'kirim' ? a : -a));
  }
  return m;
}
function partnerExpenseDelta(beforeExpenses, afterExpenses) {
  const b = partnerExpenseContrib(beforeExpenses), a = partnerExpenseContrib(afterExpenses);
  const out = new Map();
  for (const k of new Set([...b.keys(), ...a.keys()])) {
    const d = _r4((a.get(k) || 0) - (b.get(k) || 0));
    if (d !== 0) out.set(k, d);
  }
  return out;
}
// `hamkorlar.edit` / admin bo'lmasa: invested = serverdagi qiymat + xarajatlardan hisoblangan o'zgarish (brauzer qiymati
// ishlatilmaydi). Natija: { partners, mismatches:[{id, client, server}] }
function serverPartnerInvested(existingPartners, candidatePartners, deltaMap) {
  const ex = new Map((Array.isArray(existingPartners) ? existingPartners : []).filter(x => x && x.id !== undefined).map(x => [String(x.id), x]));
  const base = Array.isArray(candidatePartners) ? candidatePartners : (Array.isArray(existingPartners) ? existingPartners : []);
  const mismatches = [];
  const partners = base.map((p) => {
    if (!p || p.id === undefined) return p;
    const prev = ex.get(String(p.id));
    if (!prev) return p;                                   // yangi hamkor — faqat hamkorlar.edit (filtr allaqachon tekshirgan)
    const server = _r4((Number(prev.invested) || 0) + (deltaMap.get(String(p.id)) || 0));
    const client = _r4(p.invested);
    if (client !== server) mismatches.push({ id: p.id, client, server });
    return client === server ? p : { ...p, invested: server };
  });
  return { partners, mismatches };
}

// Audit uchun: hamkor `invested` o'zgarishlari (eski → yangi)
function partnerInvestedChanges(exVal, newVal) {
  const ex = new Map((Array.isArray(exVal) ? exVal : []).filter(x => x && x.id !== undefined).map(x => [String(x.id), x]));
  const out = [];
  for (const x of (Array.isArray(newVal) ? newVal : [])) {
    if (!x || x.id === undefined) continue;
    const prev = ex.get(String(x.id));
    const o = prev ? Number(prev.invested) || 0 : null, n = Number(x.invested) || 0;
    if (o === null || Math.abs(o - n) > 1e-9) out.push({ id: x.id, name: String(x.name || '').slice(0, 100), old: o, new: n });
  }
  return out;
}

function filterTopLevelChanges({ existing, incoming, permKeys, isAdmin, filial }) {
  if (incoming && Object.prototype.hasOwnProperty.call(incoming, 'settings')) {
    incoming = { ...incoming, settings: normalizeIncomingSettings(existing && existing.settings, incoming.settings) };
    // v24.5: zaxira nusxa manzili (butun biznes ma'lumoti shu chatga ketadi) — FAQAT administrator o'zgartiradi
    if (!isAdmin && incoming.settings && typeof incoming.settings === 'object') {
      const ex = (existing && existing.settings && typeof existing.settings === 'object') ? existing.settings : {};
      const st = { ...incoming.settings };
      ADMIN_ONLY_SETTINGS_KEYS.forEach(k => { if (ex[k] === undefined) delete st[k]; else st[k] = ex[k]; });
      incoming = { ...incoming, settings: st };
    }
  }
  const own = filial || 'baza';
  return filterChanges({
    existing, incoming, permKeys, isAdmin,
    map: TOP_LEVEL_PERMISSION_MAP, massGuarded: MASS_DELETE_GUARDED_TOP,
    unknownAllowed: false,
    subFilters: { settings: filterSettings, deletedIds: filterDeletedIds, auditLogs: filterAuditLogs,
      partners: makePartnerFilter(own),
      partnerPeriods: makeBranchScopedFilter(own, TOP_LEVEL_PERMISSION_MAP.partnerPeriods) },
  });
}

module.exports = {
  TOP_LEVEL_PERMISSION_MAP, BRANCH_KEY_PERMISSION_MAP, SETTINGS_OPEN_KEYS, ADMIN_ONLY_SETTINGS_KEYS, RATE_MAX_STEP, rateAcceptable,
  hasPerm, sameValue, isMassDelete, filterTopLevelChanges, filterBranchChanges,
  SECRET_SETTINGS_KEYS, stripSecretSettings, filterShop, normalizeIncomingShop, stripAdminSecrets, filterAuditLogs, makeBranchScopedFilter, normalizeIncomingSettings,
  makePartnerFilter, partnerInvestedChanges, partnerExpenseDelta, partnerExpenseContrib, serverPartnerInvested,
};
