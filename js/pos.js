// ════════════════════════════════════════════════════════════════════════════
// v24.5 — SAVDO OYNASI (POS) — admin panel va sotuvchi ilovasi uchun BITTA modul.
//
// Ekranlar: Mahsulotlar → Savat → (Chekka chegirma) → To'lash; Kechiktirilgan cheklar; Mijoz.
// Ma'lumot manbai va savdoni yozish — ADAPTER orqali (posInit(adapter)): admin (main.js) va
// sotuvchi (sotuvchi.js) o'z adapterini beradi; UI, hisob-kitob va to'lov qoidalari — shu yerda.
//
// Egasi qarorlari (2026-10-14):
//  • To'lov summasi kiritilmaguncha savdo yopilmaydi.
//  • Olingan summa chek summasiga teng — «Naqd savdo» (mijoz ixtiyoriy); kam yoki ko'p — mijoz MAJBURIY:
//    kami — mijoz qarziga; ko'pi — avval mijoz qarzidan ayiriladi, qolgani mijoz HAQIGA (34-migratsiya).
//  • So'mda narxlar 1 000 ga yaxlit (eng yaqin mingga: 107 200 → 107 000, 107 500 → 108 000). Hisob aniq:
//    qator narxi = yaxlit so'm / kurs ($), shuning uchun kassaga tushgan so'm = chekdagi so'm, foyda —
//    haqiqatda olingan summadan.
//  • «Chakana / Optom» va «UZS / USD» — alohida, kichik almashtirgichlar.
// ════════════════════════════════════════════════════════════════════════════

const POS = {
  a: null,                    // adapter
  mode: 'retail',             // 'retail' | 'wholesale'
  cur: 'UZS',                 // 'UZS' | 'USD'
  cat: '', q: '',
  note: '',
  disc: { type: 'sum', val: 0 },       // chekka chegirma: 'sum' (sotuv valyutasida) | 'pct'
  pay: { type: 'cash', amount: '', mix: [] },
  dueDays: '',   // v24.9: nasiya muddati (kun) — bo'sh bo'lsa standart (FW_DUE_DEFAULT_DAYS)
  useCredit: false,
  chg: '',                    // v25: qaytim (ortiqcha to'lovda kassir yozadi)
  costOn: false, costT: null, // v25: sotuvchida «Tannarx» — 5 soniya
  stack: [],                  // ochiq oynalar: 'cart' | 'pay' | 'disc' | 'held' | 'cust' | 'prompt'
  kp: { type: 'sum', s: '' }, // chegirma klaviaturasi holati
  prompt: null,
  busy: false,
};

// ── Ikonkalar (inline, chiziqli) ──
const _pi = (d, w) => `<svg viewBox="0 0 24 24" width="${w || 18}" height="${w || 18}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const PI = {
  x: _pi('<path d="M6 6l12 12M18 6L6 18"/>'),
  search: _pi('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 17),
  scan: _pi('<path d="M4 7V5h3M17 5h3v2M20 17v2h-3M7 19H4v-2M8 9v6M11 9v6M14 9v6M17 9v6"/>', 20),
  clock: _pi('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 19),
  pause: _pi('<path d="M9 6v12M15 6v12"/>'),
  trash: _pi('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  user: _pi('<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  note: _pi('<path d="M5 19h4l10-10-4-4L5 15z"/>'),
  pct: _pi('<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>'),
  star: _pi('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>', 18),
  warn: _pi('<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/>', 20),
  back: _pi('<path d="M15 6l-6 6 6 6"/>'),
  chev: _pi('<path d="M9 6l6 6-6 6"/>', 16),
};

// ── Yaxlitlash va pul ──
// v25.1: yaxlitlash — yagona manba js/fw-round.js (qadamlar sozlamalarda: roundPriceStep, roundTotalStep)
function posSteps() {
  const st = (typeof S !== 'undefined' && S && S.settings) || {};
  const on = !POS.a || !POS.a.rounding || POS.a.rounding();
  return FWRound.steps(Object.assign({}, st, { roundingEnabled: on }));
}
// Narx — sozlamadagi qadamga (standart 1 000), yarmi tepaga. Nomi eski (boshqa joylar chaqiradi), qadam — sozlamadan.
function fwRound1000(n) { return FWRound.roundPrice(n, posSteps().price); }
const _r2p = (n) => Math.round((+n || 0) * 100) / 100;
// Sozlamalar → «Savdoda so'm yaxlitlash» o'chirilgan bo'lsa — butun so'mgacha
function posRound(v) { return FWRound.roundPrice(v, posSteps().price); }
// v25: to'liq oyna (admin) yoki sotuvchi rejimi — sotuvchi faqat summani ko'radi: izoh, chegirma, narx va foizni
// o'zgartirish yo'q; mijoz — faqat kam/ko'p to'lovda (qarz yoki mijoz haqi uchun)
function posFull() { return !POS.a || !POS.a.full || !!POS.a.full(); }
function posCostVisible() { return !!(POS.a && POS.a.costView && POS.a.costView()); }
// «Tannarx» tugmasi: bosilganda 5 soniya tannarx ko'rinadi, keyin o'zi yopiladi
function posCostFlash() {
  if (!posCostVisible()) return;
  clearTimeout(POS.costT); POS.costOn = true; posCostPaint();
  POS.costT = setTimeout(() => { POS.costOn = false; posCostPaint(); }, 5000);
}
function posCostPaint() { const b = document.getElementById('pos-cost-btn'); if (b) b.classList.toggle('on', POS.costOn); posRenderList(); }
function posRate() { return (POS.a && POS.a.rate && +POS.a.rate()) || CUR.usdUzs || 12800; }
function posFmtN(n, cur) { cur = cur || POS.cur; return cur === 'USD' ? CUR.fmtUsd(n) : fwNum(n) + ' soʻm'; }
function posParse(v) { return parseAmt(String(v == null ? '' : v)); }
function posUsdToN(usd, cur) { cur = cur || POS.cur; return cur === 'USD' ? _r2p(usd) : Math.round(usd * posRate()); }
function posNToUsd(n, cur) { cur = cur || POS.cur; return cur === 'USD' ? +n : (+n) / posRate(); }

// Mahsulotning sotuv narxi (USD aniq) — so'mda yaxlit ming bo'ladigan qilib
function posUnitUsd(p) {
  const base = POS.a.basePrice(p, POS.mode);          // $ (yaxlitlanmagan)
  if (!(base > 0)) return 0;
  if (POS.cur === 'UZS') return posRound(base * posRate()) / posRate();
  return _r2p(base);
}
function posLineUnitN(it) { return POS.cur === 'UZS' ? Math.round((+it.sellUsd || 0) * posRate()) : _r2p(it.sellUsd); }

// ── Savat hisobi (bitta manba: savat paneli, to'lov va yozish shu yerdan oladi) ──
function posTotals() {
  const cart = POS.a.cart();
  let subN = 0, subUsd = 0, cost = 0, units = 0;
  cart.forEach(it => {
    const q = +it.qty || 0; units += q;
    subN += q * posLineUnitN(it);
    subUsd += q * (+it.sellUsd || 0);
    cost += q * (+it.costUsd || 0);
  });
  if (POS.cur === 'USD') subN = _r2p(subN); else subN = FWRound.toInt(subN);
  let discN = 0;
  if (POS.disc.type === 'pct') {
    const pct = Math.max(0, Math.min(100, +POS.disc.val || 0));
    discN = POS.cur === 'UZS' ? FWRound.toInt(subN * pct / 100) : _r2p(subN * pct / 100);
  } else discN = POS.cur === 'UZS' ? FWRound.toInt(Math.max(0, +POS.disc.val || 0)) : Math.max(0, +POS.disc.val || 0);
  discN = Math.min(discN, subN);
  // v25.1 (egasi qoidasi): jami — chegirma/foizdan KEYIN, har doim PASTGA, sozlamadagi qadamga (standart 100).
  // Farq — «Yaxlitlash chegirmasi» (roundN). Tannarxga tegilmaydi: foyda = to'langan jami − tannarx (yaxlitlash farqicha kam).
  // Istisno: «kam to'lov → chegirma» (short_payment) — mijoz aniq summani to'laydi, ustidan yana yaxlitlanmaydi.
  let roundN = 0, aslN = POS.cur === 'UZS' ? subN - discN : null;
  if (POS.cur === 'UZS' && POS.disc.reason !== 'short_payment') {
    const rt = FWRound.cartTotals(subN, discN, posSteps().total);
    roundN = rt.yaxlitlash_chegirmasi; aslN = rt.asl_jami;
  }
  discN += roundN;
  const totN = POS.cur === 'UZS' ? subN - discN : _r2p(subN - discN);
  const discPct = subN > 0 ? discN / subN * 100 : 0;
  const totUsd = subUsd * (1 - discPct / 100);
  const cust = posCust();
  const creditUzs = cust ? Math.max(0, +cust.credit || 0) : 0;
  const creditAvailN = POS.cur === 'UZS' ? creditUzs : _r2p(creditUzs / posRate());
  const creditN = POS.useCredit ? Math.min(creditAvailN, totN) : 0;
  const needN = POS.cur === 'UZS' ? Math.round(totN - creditN) : _r2p(totN - creditN);
  return { subN, discN, roundN, aslN, totN, discPct, subUsd, totUsd, discUsd: subUsd - totUsd, cost, profitUsd: totUsd - cost,
           units, lines: cart.length, creditAvailN, creditN, creditUzs, needN };
}

function posCust() { const id = POS.a.custId(); return id ? (POS.a.customers().find(c => c.id === id) || null) : null; }

// To'lov holati: kiritilgan summa (sotuv valyutasida), farq, holat
function posBoxes() { return POS.a.boxes(); }
function posBoxFor(type) {
  const bx = posBoxes();
  const want = type === 'card' ? 'card' : (POS.cur === 'USD' ? 'usd' : 'cash');
  return bx.find(b => b.type === want) || bx.find(b => (b.cur === 'USD') === (POS.cur === 'USD') && b.type !== 'card') || null;
}
function posBoxToN(box, amt) {
  const bUsd = box && box.cur === 'USD';
  if (POS.cur === 'USD') return bUsd ? +amt : (+amt) / posRate();
  return bUsd ? (+amt) * posRate() : +amt;
}
function posPayState(t) {
  t = t || posTotals();
  const P = POS.pay;
  let entered = false, paidN = 0, cross = false;
  if (P.type === 'mixed') {
    const rows = P.mix.filter(r => String(r.amount).trim() !== '');
    entered = rows.length > 0;
    rows.forEach(r => { const b = posBoxes().find(k => k.id === r.boxId); if (b && ((b.cur === 'USD') !== (POS.cur === 'USD'))) cross = true; paidN += posBoxToN(b, posParse(r.amount)); });
  } else {
    entered = String(P.amount).trim() !== '';
    paidN = posParse(P.amount);
  }
  paidN = POS.cur === 'USD' ? _r2p(paidN) : Math.round(paidN);
  const tol = POS.cur === 'USD' ? (cross ? 0.05 : 0.005) : (cross ? 500 : 0.5);
  const diff = paidN - t.needN;
  const st = !entered ? 'empty' : (Math.abs(diff) <= tol ? 'exact' : (diff < 0 ? 'short' : 'over'));
  return { entered, paidN, diff: st === 'exact' ? 0 : diff, st, cross };
}

// ════════════════════════════════════════════════════════════
// ISHGA TUSHIRISH
// ════════════════════════════════════════════════════════════
function posInit(adapter) {
  POS.a = adapter;
  const s = _posLoadPrefs();
  if (s.mode) POS.mode = s.mode;
  if (s.cur) POS.cur = s.cur;
}
function _posKey(k) { return 'fw_pos_' + k + '_' + ((POS.a && POS.a.key) || 'x'); }
function _posLoadPrefs() { try { return JSON.parse(localStorage.getItem(_posKey('prefs')) || '{}') || {}; } catch (_) { return {}; } }
function _posSavePrefs() { try { localStorage.setItem(_posKey('prefs'), JSON.stringify({ mode: POS.mode, cur: POS.cur })); } catch (_) {} }
function posFavs() { try { const a = JSON.parse(localStorage.getItem('fw_pos_fav') || '[]'); return new Set(Array.isArray(a) ? a.map(Number) : []); } catch (_) { return new Set(); } }
function posToggleFav(pid) {
  const f = posFavs(); f.has(pid) ? f.delete(pid) : f.add(pid);
  try { localStorage.setItem('fw_pos_fav', JSON.stringify([...f])); } catch (_) {}
  posRenderList();
}

// ── Rejim / valyuta ──
function posSetMode(m) {
  POS.mode = m === 'wholesale' ? 'wholesale' : 'retail';
  if (POS.mode === 'wholesale' && POS.cur === 'UZS' && !_posLoadPrefs().curTouched) POS.cur = 'USD';
  if (POS.mode === 'retail' && POS.cur === 'USD' && !_posLoadPrefs().curTouched) POS.cur = 'UZS';
  posReprice(); _posSavePrefs(); posRender();
}
function posSetCur(c) {
  POS.cur = c === 'USD' ? 'USD' : 'UZS';
  POS.disc = { type: POS.disc.type, val: POS.disc.type === 'pct' ? POS.disc.val : 0 };   // summa chegirma valyutaga bog'liq — tozalanadi
  POS.pay.amount = ''; POS.pay.mix = []; if (POS.cur === 'USD' && POS.pay.type === 'card') POS.pay.type = 'cash';
  posReprice(); _posSavePrefs(); posRender();
}
// Savatdagi narxlar joriy rejim/valyutaga qayta hisoblanadi (qo'lda o'zgartirilgan va Direct Sale narxlari saqlanadi)
function posReprice() {
  POS.a.cart().forEach(it => {
    if (it.manual || it.directSupply) return;
    const p = POS.a.products().find(x => x.id === it.pid); if (!p) return;
    it.sellUsd = posUnitUsd(p); if (it.pct) it.sellUsd = _posApplyPct(it.sellUsd, it.pct);
    it.lineUsd = it.qty * it.sellUsd;
  });
}
function _posApplyPct(unitUsd, pct) {
  const v = unitUsd * (1 - Math.max(0, Math.min(100, +pct || 0)) / 100);
  return POS.cur === 'UZS' ? posRound(v * posRate()) / posRate() : _r2p(v);
}

// ════════════════════════════════════════════════════════════
// 1. MAHSULOTLAR EKRANI
// ════════════════════════════════════════════════════════════
function posRender() {
  const el = POS.a.el(); if (!el) return;
  const held = posHeld().length;
  const cats = [...new Set(POS.a.products().filter(p => !p.archived).map(p => p.cat).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  const camOk = posScanMode() === 'camera';
  el.innerHTML = `<div class="pos" id="pos-root">
    <div class="pos-top">
      <div class="pos-segs">
        <span class="pos-seg" role="group" aria-label="Narx turi"><button class="${POS.mode === 'retail' ? 'on' : ''}" onclick="posSetMode('retail')">Chakana</button><button class="${POS.mode === 'wholesale' ? 'on' : ''}" onclick="posSetMode('wholesale')">Optom</button></span>
        <span class="pos-seg" role="group" aria-label="Valyuta"><button class="${POS.cur === 'UZS' ? 'on' : ''}" onclick="posSetCurT('UZS')">UZS</button><button class="${POS.cur === 'USD' ? 'on' : ''}" onclick="posSetCurT('USD')">USD</button></span>
        ${posCostVisible() ? `<button class="pos-cost-btn${POS.costOn ? ' on' : ''}" id="pos-cost-btn" onclick="posCostFlash()" aria-label="Tannarxni 5 soniya koʻrsatish">Tannarx</button>` : ''}
      </div>
      ${POS.a.topExtra ? POS.a.topExtra() : ''}
      <button class="pos-ib" onclick="posOpen('held')" aria-label="Kechiktirilgan cheklar" title="Kechiktirilgan cheklar">${PI.clock}${held ? `<em>${held}</em>` : ''}</button>
    </div>
    <div class="pos-search">
      ${PI.search}
      <input id="pos-q" placeholder="Nomi, kodi yoki shtrix-kod" value="${esc(POS.q)}" oninput="POS.q=this.value;posRenderList()" onkeydown="posQKey(event)" autocomplete="off" enterkeyhint="search" aria-label="Mahsulot qidirish">
      ${camOk ? `<button class="pos-scan" onclick="posScan()" aria-label="Kamera bilan skanerlash" title="Kamera bilan skanerlash">${PI.scan}</button>` : ''}
    </div>
    <div class="pos-chips" role="tablist">
      ${[['', 'Hammasi'], ['★', '★ Sevimlilar'], ...cats.map(c => [c, c])].map(([k, l]) => `<button class="${POS.cat === k ? 'on' : ''}" onclick="POS.cat='${escJsAttr(k)}';posRender()">${esc(l)}</button>`).join('')}
    </div>
    <div class="pos-body">
      <div class="pos-list" id="pos-list"></div>
      <aside class="pos-side" id="pos-side" aria-label="Savat"></aside>
    </div>
    <div class="pos-bar-wrap" id="pos-bar-wrap"></div>
  </div>`;
  posRenderList(); posRenderSide();
  if (POS.a.afterRender) POS.a.afterRender();
}
function posSetCurT(c) { const s = _posLoadPrefs(); s.curTouched = true; try { localStorage.setItem(_posKey('prefs'), JSON.stringify(Object.assign(s, { mode: POS.mode, cur: c }))); } catch (_) {} posSetCur(c); }

function posFilteredProducts() {
  const fav = posFavs();
  let list = POS.a.products().filter(p => !p.archived);
  if (POS.a.visible) list = POS.a.visible(list);
  if (POS.cat === '★') list = list.filter(p => fav.has(p.id));
  else if (POS.cat) list = list.filter(p => p.cat === POS.cat);
  const q = (POS.q || '').trim();
  if (q) list = productSearchMatch(list, q);
  else list = list.slice().sort((a, b) => (POS.a.stock(b.id) > 0) - (POS.a.stock(a.id) > 0) || String(a.name).localeCompare(String(b.name)));
  return list;
}
function posRenderList() {
  const box = document.getElementById('pos-list'); if (!box) return;
  const all = posFilteredProducts(), list = all.slice(0, 120), fav = posFavs();
  const cart = POS.a.cart();
  box.innerHTML = list.length ? list.map(p => {
    const st = POS.a.stock(p.id), ds = !!p.directSale, can = POS.a.canSell(p);
    const unit = esc(p.unit || 'dona');
    const inCart = cart.filter(c => c.pid === p.id).reduce((a, c) => a + (+c.qty || 0), 0);
    const it = cart.find(c => c.pid === p.id && !c.directSupply);
    const price = posUnitUsd(p);
    const stTxt = ds ? 'Taʼminotchidan' : (st > 0 ? `Qoldiq: ${fmtQtyS(st)} ${unit}` : 'Qoldiq: 0 — tugagan');
    return `<div class="pos-row${inCart ? ' in' : ''}${!can ? ' off' : ''}">
      <button class="pos-row-main" onclick="posAdd(${p.id})" ${can ? '' : 'disabled'}>
        <span class="pos-row-n">${esc(p.name)}${p.sku ? ` <small>${esc(p.sku)}</small>` : ''}</span>
        <span class="pos-row-s${st <= 0 && !ds ? ' red' : ''}">${stTxt}</span>
        <span class="pos-row-p">${price > 0 ? posFmtN(posUsdToN(price)) : '—'}</span>
        ${POS.costOn && posCostVisible() ? `<span class="pos-row-c">Tannarx: ${(() => { const c = +POS.a.unitCost(p) || 0; return c > 0 ? posFmtN(posUsdToN(c)) : '—'; })()}</span>` : ''}
      </button>
      <button class="pos-fav${fav.has(p.id) ? ' on' : ''}" onclick="posToggleFav(${p.id})" aria-label="${fav.has(p.id) ? 'Sevimlilardan olib tashlash' : 'Sevimlilarga qoʻshish'}">${PI.star}</button>
      ${it ? `<span class="pos-step"><button onclick="posQty('${escJsAttr(it.key)}',-1)" aria-label="Kamaytirish">−</button><b>${fmtQtyS(it.qty)}</b><button onclick="posQty('${escJsAttr(it.key)}',1)" aria-label="Koʻpaytirish">+</button></span>`
           : `<button class="pos-add" onclick="posAdd(${p.id})" ${can ? '' : 'disabled'} aria-label="Savatga qoʻshish">+</button>`}
    </div>`;
  }).join('') + (all.length > list.length ? `<div class="pos-more">Yana ${all.length - list.length} ta — qidiruvdan foydalaning</div>` : '')
    : `<div class="pos-empty">${POS.cat === '★' ? 'Sevimli mahsulotlar yoʻq — yulduzchani bosib qoʻshing' : 'Mahsulot topilmadi'}</div>`;
  posRenderBar();
}
function fmtQtyS(n) { const v = +n || 0; return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100); }

function posRenderBar() {
  const w = document.getElementById('pos-bar-wrap'); if (!w) return;
  const t = posTotals();
  w.innerHTML = t.lines ? `<button class="pos-bar" onclick="posOpen('cart')"><em>${fmtQtyS(t.units)} dona</em><b>${posFmtN(t.totN)}</b><span>Savat ${PI.chev}</span></button>` : '';
}
function posRenderSide() { const s = document.getElementById('pos-side'); if (s) s.innerHTML = posCartInner(true); }
function posRefresh() {
  posRenderList(); posRenderSide();
  const top = POS.stack[POS.stack.length - 1];
  if (top === 'cart' || top === 'pay') posPaint();
}

// Skaner (USB/Bluetooth — klaviatura kabi yozib Enter bosadi)
function posQKey(e) {
  if (e.key !== 'Enter') return;
  const q = (e.target.value || '').trim(); if (!q) return;
  const exact = fwResolveCode(POS.a.products(), q);
  const r = exact ? [exact] : productSearchMatch(POS.a.products(), q);
  if (r.length === 1) { e.preventDefault(); posAdd(r[0].id); e.target.value = ''; POS.q = ''; posRenderList(); }
}
function posScan() {
  fwScan(text => {
    const p = fwResolveCode(POS.a.products(), text);
    if (!p) { toast(`Mos mahsulot topilmadi («${String(text).slice(0, 40)}»)`, 'error'); return; }
    posAdd(p.id);
  });
}

// ── Savatga qo'shish / miqdor ──
function posAdd(pid) {
  const p = POS.a.products().find(x => x.id === pid); if (!p) return;
  if (!POS.a.canSell(p)) { toast('Bu mahsulotni sotib boʻlmaydi — qoldiq yoʻq', 'error'); return; }
  if (POS.a.special && POS.a.special(p)) return;           // admin: Direct Sale oynasi (ta'minotchidan)
  const ds = !!p.directSale, st = POS.a.stock(pid);
  const cart = POS.a.cart();
  const ex = cart.find(c => c.pid === pid && !!c.directSupply === ds);
  if (ex) {
    if (!ds && ex.qty + 1 > st) { toast(`Omborda faqat ${fmtQtyS(st)} ${p.unit || 'dona'} bor`, 'warning'); return; }
    ex.qty += 1; ex.lineUsd = ex.qty * ex.sellUsd;
  } else {
    const sell = posUnitUsd(p);
    const item = { key: String(uid()), pid, sku: p.sku || '', name: p.name, qty: 1, costUsd: POS.a.unitCost(p), sellUsd: sell, lineUsd: sell };
    if (ds) Object.assign(item, POS.a.dsLine ? POS.a.dsLine(p) : { directSupply: true, suppId: p.dsSuppId });
    cart.push(item);
  }
  posRefresh();
}
function posQty(key, d) {
  const cart = POS.a.cart(), it = cart.find(c => String(c.key) === String(key)); if (!it) return;
  const st = it.directSupply ? Infinity : POS.a.stock(it.pid);
  const nq = (+it.qty || 0) + d;
  if (nq <= 0) { posRemove(key); return; }
  if (nq > st) { toast(`Omborda faqat ${fmtQtyS(st)} ta bor`, 'warning'); return; }
  it.qty = nq; it.lineUsd = it.qty * it.sellUsd; posRefresh();
}
function posSetQty(key, v) {
  const cart = POS.a.cart(), it = cart.find(c => String(c.key) === String(key)); if (!it) return;
  const p = POS.a.products().find(x => x.id === it.pid);
  let q = posParse(v); if ((p && (p.unit || 'dona') === 'dona')) q = Math.round(q);
  const st = it.directSupply ? Infinity : POS.a.stock(it.pid);
  if (!(q > 0)) { toast('Miqdor 0 dan katta boʻlishi kerak', 'error'); return false; }
  if (q > st) { toast(`Omborda faqat ${fmtQtyS(st)} ta bor`, 'warning'); q = st; }
  it.qty = q; it.lineUsd = it.qty * it.sellUsd; posRefresh(); return true;
}
function posRemove(key) {
  const cart = POS.a.cart(), i = cart.findIndex(c => String(c.key) === String(key));
  if (i >= 0) cart.splice(i, 1);
  if (!cart.length) { POS.disc = { type: POS.disc.type, val: 0 }; POS.pay.amount = ''; }
  posRefresh();
}
function posClear() {
  if (!POS.a.cart().length) return;
  if (!confirm('Savat tozalansinmi?')) return;
  POS.a.setCart([]); posResetSale(); posCloseAll(); posRender();
}
function posResetSale() {
  POS.note = ''; POS.disc = { type: 'sum', val: 0 }; POS.pay = { type: 'cash', amount: '', mix: [] }; POS.useCredit = false; POS.dueDays = ''; POS.chg = '';
  POS.a.setCustId(null);
}

// ════════════════════════════════════════════════════════════
// OYNALAR (to'liq ekran; «Orqaga» va X — bitta qadam)
// ════════════════════════════════════════════════════════════
function posOpen(view) {
  if (view === 'cart' && !POS.a.cart().length) { toast('Savat boʻsh', 'warning'); return; }
  if (view === 'pay' && !POS.a.cart().length) return;
  if (view === 'disc') POS.kp = { type: POS.disc.type, s: POS.disc.val ? String(POS.disc.val) : '' };
  if (view === 'pay' && POS.pay.type === 'mixed' && !POS.pay.mix.length) posMixInit();
  POS.stack.push(view);
  if (typeof fwBackPush === 'function') fwBackPush('pos:' + POS.stack.length, () => _posPop());
  posPaint();
  setTimeout(() => { const f = document.querySelector('#pos-ov [data-autofocus]'); if (f) try { f.focus(); } catch (_) {} }, 60);
}
function _posPop() { POS.stack.pop(); posPaint(); }
function posBack() { const n = POS.stack.length; if (!n) return; _posPop(); if (typeof fwBackDone === 'function') fwBackDone('pos:' + n); }
function posCloseAll() { while (POS.stack.length) posBack(); }
function posPaint() {
  let ov = document.getElementById('pos-ov');
  const top = POS.stack[POS.stack.length - 1];
  if (!top) { if (ov) { ov.remove(); } document.body.classList.remove('pos-lock'); posRenderList(); posRenderSide(); return; }
  if (!ov) { ov = document.createElement('div'); ov.id = 'pos-ov'; ov.className = 'pos-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); document.body.appendChild(ov); }
  document.body.classList.add('pos-lock');
  const isSheet = (v) => v === 'disc' || v === 'prompt';
  const viewHtml = (v) => v === 'cart' ? posCartView() : v === 'pay' ? posPayView() : v === 'disc' ? posDiscView()
    : v === 'held' ? posHeldView() : v === 'cust' ? posCustView() : v === 'prompt' ? posPromptView() : '';
  // Pastki oyna (chegirma, so'rov) — ostidagi to'liq ekran (masalan, Savat) ko'rinib turadi
  let base = null;
  if (isSheet(top)) for (let i = POS.stack.length - 2; i >= 0; i--) if (!isSheet(POS.stack[i])) { base = POS.stack[i]; break; }
  ov.className = 'pos-ov' + (isSheet(top) && !base ? ' sheet' : '');
  ov.innerHTML = isSheet(top) ? `${base ? viewHtml(base) : ''}<div class="pos-sh-wrap" onclick="if(event.target===this)posBack()">${viewHtml(top)}</div>` : viewHtml(top);
  if (top === 'pay' || base === 'pay') posPayGate();
}
function _posHead(title, sub, right) {
  return `<header class="pos-hd"><button class="pos-ib" onclick="posBack()" aria-label="Yopish">${PI.x}</button><div class="pos-hd-t"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>${right || ''}</header>`;
}

// ════════════════════════════════════════════════════════════
// 2. SAVAT
// ════════════════════════════════════════════════════════════
function posCartView() {
  return `<div class="pos-scr">
    ${_posHead('Savat', '', `<button class="pos-ib" onclick="posHold()" aria-label="Kechiktirish (pauza)" title="Kechiktirish">${PI.pause}</button><button class="pos-ib red" onclick="posClear()" aria-label="Savatni tozalash" title="Tozalash">${PI.trash}</button>`)}
    <div class="pos-scr-b">${posCartInner(false)}</div>
  </div>`;
}
function posCartInner(side) {
  const cart = POS.a.cart();
  if (!cart.length) return side ? `<div class="pos-side-empty">${PI.search}<span>Savat boʻsh — mahsulotni bosing yoki skanerlang</span></div>` : '';
  const t = posTotals(), cust = posCust();
  const u = POS.cur === 'USD' ? ', $' : ', soʻm', nv = (n) => POS.cur === 'USD' ? fwUsd(n).replace('$', '') : fwNum(n);
  const kpi = `<div class="pos-kpis"><div><span>Summa${u}</span><b>${nv(t.totN)}</b></div>${POS.a.showProfit() ? `<div><span>Foyda${u}</span><b class="${t.profitUsd < 0 ? 'red' : 'green'}">${nv(posUsdToN(t.profitUsd))}</b></div>` : ''}<div><span>Pozitsiya</span><b>${t.lines} · ${fmtQtyS(t.units)} dona</b></div></div>`;
  const lines = cart.map(it => {
    const low = +it.costUsd > 0 && +it.sellUsd * (1 - t.discPct / 100) < +it.costUsd - 1e-9;
    const k = escJsAttr(it.key);
    return `<div class="pos-line${low ? ' low' : ''}">
      <div class="pos-line-t"><b>${esc(it.name)}</b><b>${posFmtN(it.qty * posLineUnitN(it))}</b></div>
      ${it.directSupply ? `<div class="pos-line-m">Taʼminotchidan${it.suppName ? ' · ' + esc(it.suppName) : ''}</div>` : ''}
      ${low ? `<div class="pos-line-m red">${PI.warn} Narx minimal narxdan past — ziyon</div>` : ''}
      <div class="pos-line-c">
        <span class="pos-step"><button onclick="posQty('${k}',-1)" aria-label="Kamaytirish">−</button><button class="pos-qv" onclick="posAskQty('${k}')" aria-label="Miqdorni kiritish">${fmtQtyS(it.qty)}</button><button onclick="posQty('${k}',1)" aria-label="Koʻpaytirish">+</button></span>
        ${posFull() ? `<button class="pos-tag" onclick="posAskPrice('${k}')" aria-label="Narxni oʻzgartirish">${posFmtN(posLineUnitN(it))}</button>
        <button class="pos-tag acc" onclick="posAskPct('${k}')" aria-label="Qator chegirmasi">${it.pct ? '−' + it.pct + '%' : '%'}</button>` : `<span class="pos-tag ro">${posFmtN(posLineUnitN(it))}</span>`}
        <span class="pos-grow"></span>
        <button class="pos-tag red" onclick="posRemove('${k}')" aria-label="Oʻchirish">${PI.x}</button>
      </div>
    </div>`;
  }).join('');
  const custCard = `<button class="pos-card${cust ? ' set' : ''}" onclick="posOpen('cust')"><span class="pos-card-ic">${PI.user}</span><span class="pos-card-t"><b>${cust ? esc(cust.name) : 'Mijoz qoʻshish'}</b><small>${cust ? esc(posCustSub(cust)) : 'Ixtiyoriy · kam yoki koʻp toʻlovda majburiy'}</small></span>${PI.chev}</button>`;
  const noteCard = `<button class="pos-card" onclick="posAskNote()"><span class="pos-card-ic">${PI.note}</span><span class="pos-card-t"><b>${POS.note ? 'Izoh' : 'Izoh qoʻshish'}</b><small>${POS.note ? esc(POS.note.slice(0, 60)) : 'Chekda chop etilmaydi'}</small></span>${PI.chev}</button>`;
  const discCard = `<button class="pos-card solid" onclick="posOpen('disc')"><span class="pos-card-ic amb">${PI.pct}</span><span class="pos-card-t"><b>Chekka chegirma</b><small>${t.discN - t.roundN > 0 ? '−' + posFmtN(t.discN - t.roundN) + (POS.disc.type === 'pct' ? ` (${+POS.disc.val}%)` : '') : 'Summa yoki foiz'}</small></span>${PI.chev}</button>`;
  return `${kpi}<div class="pos-lines">${lines}</div>${posFull() ? custCard + noteCard + discCard : ''}
    <div class="pos-total">${t.discN > 0 ? `<div><span>Chegirmasiz</span><s>${posFmtN(t.subN)}</s></div>` : ''}${t.discN - t.roundN > 0 ? `<div><span>Chegirma</span><span>−${posFmtN(t.discN - t.roundN)}</span></div>` : ''}${t.roundN > 0 ? `<div><span>Yaxlitlash chegirmasi</span><span>−${posFmtN(t.roundN)}</span></div>` : ''}<div class="big"><span>Jami</span><b>${posFmtN(t.totN)}</b></div></div>
    <div class="pos-foot">${side ? `<button class="pos-btn ghost" onclick="posHold()">${PI.pause} Pauza</button>` : ''}<button class="pos-btn ok" onclick="posOpen('pay')">Toʻlash · ${posFmtN(t.totN)}</button></div>`;
}
function posCustSub(c) {
  const p = [c.phone || ''];
  if (+c.debt > 0) p.push('Qarz: ' + fwNum(c.debt) + ' soʻm');
  if (+c.credit > 0) p.push('Haqi: ' + fwNum(c.credit) + ' soʻm');
  return p.filter(Boolean).join(' · ') || 'Tanlangan';
}

// ── Kichik so'rov oynasi (miqdor / narx / foiz / izoh) ──
function posAsk(o) { POS.prompt = o; posOpen('prompt'); }
function posPromptView() {
  const o = POS.prompt || {};
  return `<div class="pos-sh">
    <div class="pos-grip"></div>
    <div class="pos-sh-hd"><b>${esc(o.title || '')}</b><button class="pos-ib" onclick="posBack()" aria-label="Yopish">${PI.x}</button></div>
    ${o.text ? `<textarea class="pos-in" id="pos-pr-v" rows="3" maxlength="300" data-autofocus placeholder="${esc(o.ph || '')}">${esc(o.value || '')}</textarea>`
             : `<label class="pos-in-wrap"><input class="pos-in big" id="pos-pr-v" inputmode="decimal" value="${esc(o.value == null ? '' : o.value)}" data-autofocus onkeydown="if(event.key==='Enter')posPromptOk()" oninput="liveFormatSpaces(this)"><span>${esc(o.suffix || '')}</span></label>`}
    ${o.hint ? `<div class="pos-hint">${o.hint}</div>` : ''}
    <div class="pos-foot"><button class="pos-btn ghost" onclick="posBack()">Bekor</button><button class="pos-btn pri" onclick="posPromptOk()">Saqlash</button></div>
  </div>`;
}
function posPromptOk() {
  const o = POS.prompt; const v = document.getElementById('pos-pr-v')?.value;
  if (!o) return;
  const r = o.ok(v);
  if (r === false) return;
  POS.prompt = null; posBack(); posRefresh();
}
function posAskQty(key) {
  const it = POS.a.cart().find(c => String(c.key) === String(key)); if (!it) return;
  posAsk({ title: 'Miqdor — ' + it.name, value: fmtQtyS(it.qty), suffix: 'dona', ok: v => posSetQty(key, v) });
}
function posAskPrice(key) {
  const it = POS.a.cart().find(c => String(c.key) === String(key)); if (!it) return;
  if (POS.a.priceEditable && !POS.a.priceEditable()) { toast('Narxni oʻzgartirish huquqingiz yoʻq', 'error'); return; }
  posAsk({ title: 'Narx — ' + it.name, value: posLineUnitN(it), suffix: POS.cur === 'USD' ? '$' : 'soʻm',
    hint: 'Bitta dona narxi. Minimal narxdan past boʻlsa, savdoda ziyon tasdiqlanadi.',
    ok: v => { const n = posParse(v); if (!(n >= 0)) return false; it.sellUsd = posNToUsd(n); it.manual = true; it.pct = 0; it.lineUsd = it.qty * it.sellUsd; return true; } });
}
function posAskPct(key) {
  const it = POS.a.cart().find(c => String(c.key) === String(key)); if (!it) return;
  if (POS.a.priceEditable && !POS.a.priceEditable()) { toast('Chegirma berish huquqingiz yoʻq', 'error'); return; }
  posAsk({ title: 'Qator chegirmasi — ' + it.name, value: it.pct || '', suffix: '%', hint: POS.cur === 'UZS' ? 'Yangi narx 1 000 soʻmga yaxlitlanadi.' : '',
    ok: v => {
      const pct = posParse(v); if (pct < 0 || pct > 100) { toast('0–100 oraligʻida kiriting', 'error'); return false; }
      const p = POS.a.products().find(x => x.id === it.pid);
      const base = it.directSupply || it.manual ? (it.baseUsd || it.sellUsd) : (p ? posUnitUsd(p) : it.sellUsd);
      if (!it.baseUsd) it.baseUsd = it.directSupply || it.manual ? it.sellUsd : base;
      it.pct = pct; it.sellUsd = pct ? _posApplyPct(it.baseUsd, pct) : it.baseUsd; it.lineUsd = it.qty * it.sellUsd; return true;
    } });
}
function posAskNote() {
  posAsk({ title: 'Izoh (chekda chiqmaydi)', text: true, value: POS.note, ph: 'Masalan: ertaga olib ketadi', ok: v => { POS.note = String(v || '').trim().slice(0, 300); return true; } });
}

// ════════════════════════════════════════════════════════════
// 3. CHEKKA CHEGIRMA (raqamli klaviatura)
// ════════════════════════════════════════════════════════════
function posDiscView() {
  const t = posTotals(), k = POS.kp;
  const v = posParse(k.s);
  let dN = k.type === 'pct' ? (POS.cur === 'UZS' ? FWRound.toInt(t.subN * Math.min(100, v) / 100) : _r2p(t.subN * Math.min(100, v) / 100)) : Math.min(v, t.subN);
  const newTot = POS.cur === 'UZS' ? Math.round(t.subN - dN) : _r2p(t.subN - dN);
  const newProfit = posNToUsd(newTot) - t.cost;
  const quick = POS.cur === 'UZS' ? [1000, 5000, 10000] : [1, 5, 10];
  const roundTo = POS.cur === 'UZS' ? (t.subN % 10000 ? t.subN % 10000 : 0) : _r2p(t.subN % 1);
  return `<div class="pos-sh">
    <div class="pos-grip"></div>
    <div class="pos-sh-hd"><b>Chekka chegirma</b><button class="pos-ib" onclick="posBack()" aria-label="Yopish">${PI.x}</button></div>
    <span class="pos-seg wide" role="group"><button class="${k.type === 'sum' ? 'on' : ''}" onclick="POS.kp.type='sum';POS.kp.s='';posPaint()">Summa (${POS.cur === 'USD' ? '$' : 'soʻm'})</button><button class="${k.type === 'pct' ? 'on' : ''}" onclick="POS.kp.type='pct';POS.kp.s='';posPaint()">Foiz (%)</button></span>
    <div class="pos-kp-disp"><b>${k.type === 'pct' ? (k.s || '0') + ' %' : (k.s ? (POS.cur === 'USD' ? '$' + k.s : fwNum(v) + ' soʻm') : '0')}</b>
      <small>Jami ${posFmtN(t.subN)} → <b>${posFmtN(newTot)}</b>${POS.a.showProfit() ? ` · foyda ${posFmtN(posUsdToN(newProfit))}` : ''}</small></div>
    ${k.type === 'sum' ? `<div class="pos-quick">${quick.map(q => `<button onclick="POS.kp.s='${q}';posPaint()">${POS.cur === 'USD' ? '$' + q : fwNum(q)}</button>`).join('')}${roundTo > 0 ? `<button onclick="POS.kp.s='${roundTo}';posPaint()">Yaxlitlash</button>` : ''}</div>` : ''}
    <div class="pos-kp">${['1', '2', '3', '4', '5', '6', '7', '8', '9', k.type === 'pct' || POS.cur === 'USD' ? '.' : '000', '0', '⌫'].map(b => `<button onclick="posKp('${b}')" ${b === '⌫' ? 'aria-label="Oʻchirish"' : ''}>${b}</button>`).join('')}</div>
    <div class="pos-foot"><button class="pos-btn ghost red-t" onclick="posDiscApply(true)">Olib tashlash</button><button class="pos-btn pri" onclick="posDiscApply(false)">Qoʻllash</button></div>
  </div>`;
}
function posKp(b) {
  let s = POS.kp.s || '';
  if (b === '⌫') s = s.slice(0, -1);
  else if (b === '.') { if (!s.includes('.')) s = (s || '0') + '.'; }
  else s = (s === '0' ? '' : s) + b;
  if (s.length > 12) return;
  POS.kp.s = s; posPaint();
}
function posDiscApply(remove) {
  if (remove) POS.disc = { type: POS.kp.type, val: 0 };
  else {
    const v = posParse(POS.kp.s);
    if (POS.kp.type === 'pct' && v > 100) { toast('Foiz 100 dan oshmasin', 'error'); return; }
    if (POS.a.discAllowed && !POS.a.discAllowed(POS.kp.type, v)) return;
    POS.disc = { type: POS.kp.type, val: v };
  }
  POS.pay.amount = '';
  posBack(); posRefresh();
}

// ════════════════════════════════════════════════════════════
// 4. TO'LASH
// ════════════════════════════════════════════════════════════
function posMixInit() {
  const bx = posBoxes();
  const pick = (ty) => bx.find(b => b.type === ty);
  POS.pay.mix = [pick('cash'), pick('card'), pick('usd')].filter(Boolean).map(b => ({ id: String(uid()), boxId: b.id, amount: '' }));
  if (!POS.pay.mix.length && bx[0]) POS.pay.mix = [{ id: String(uid()), boxId: bx[0].id, amount: '' }];
}
function posPayView() {
  const t = posTotals(), cust = posCust(), P = POS.pay;
  const methods = [['cash', 'Naqd'], ...(POS.cur === 'UZS' && posBoxes().some(b => b.type === 'card') ? [['card', 'Karta']] : []), ['mixed', 'Aralash']];
  const box = P.type !== 'mixed' ? posBoxFor(P.type) : null;
  const q = POS.cur === 'UZS' ? _posQuickUzs(t.needN) : [];
  return `<div class="pos-scr">
    ${_posHead('Toʻlash', '')}
    <div class="pos-scr-b">
      <div class="pos-jami"><span>Jami</span><b>${posFmtN(t.totN)}</b></div>
      ${t.creditAvailN > 0 ? `<label class="pos-credit"><input type="checkbox" ${POS.useCredit ? 'checked' : ''} onchange="POS.useCredit=this.checked;POS.pay.amount='';posPaint()"><span>Mijoz haqidan ishlatish — <b>${posFmtN(Math.min(t.creditAvailN, t.totN))}</b> <small>(haqi: ${posFmtN(t.creditAvailN)})</small></span></label>` : ''}
      ${t.creditN > 0 ? `<div class="pos-need"><span>Toʻlanishi kerak</span><b>${posFmtN(t.needN)}</b></div>` : ''}
      <span class="pos-seg wide" role="group" aria-label="Toʻlov usuli">${methods.map(([k, l]) => `<button class="${P.type === k ? 'on' : ''}" onclick="posPayType('${k}')">${l}</button>`).join('')}</span>
      ${P.type === 'mixed' ? `<div class="pos-mix" id="pos-mix">${posMixRows()}</div><button class="pos-link" onclick="POS.pay.mix.push({id:String(uid()),boxId:(posBoxes()[0]||{}).id,amount:''});posPaint()">+ Qator qoʻshish</button>`
        : `<label class="pos-lbl">Olingan summa (${POS.cur === 'USD' ? '$' : 'soʻm'}) *${box ? ` <small>· ${esc(box.name || '')}</small>` : ''}</label>
           <input class="pos-in big" id="pos-paid" inputmode="decimal" placeholder="Summani kiriting" value="${esc(P.amount)}" data-autofocus oninput="liveFormatSpaces(this);POS.pay.amount=this.value;posPayGate()" onkeydown="if(event.key==='Enter')posFinish()">
           <div class="pos-quick"><button class="ok" onclick="posPaySet(${t.needN})">Toʻliq · ${POS.cur === 'USD' ? '$' + t.needN : fwNum(t.needN)}</button>${q.map(v => `<button onclick="posPaySet(${v})">${fwNum(v)}</button>`).join('')}<button onclick="posPaySet(0)">Qarzga (0)</button></div>`}
      <div id="pos-pay-st"></div>
      <button class="pos-card${cust ? ' set' : ''}" id="pos-pay-cust" onclick="posOpen('cust')"><span class="pos-card-ic">${PI.user}</span><span class="pos-card-t"><b>${cust ? esc(cust.name) : 'Mijoz tanlash'}</b><small>${cust ? esc(posCustSub(cust)) : 'Qidirish yoki yangi qoʻshish'}</small></span>${PI.chev}</button>
    </div>
    <div class="pos-foot fixed"><button class="pos-btn ok" id="pos-finish" onclick="posFinish()">Savdoni yakunlash</button></div>
  </div>`;
}
// Tez summalar: mijoz odatda beradigan yaxlit summalar (to'liqdan katta, 3 tagacha)
function _posQuickUzs(need) {
  if (!(need > 0)) return [];
  const out = [];
  [5000, 10000, 50000, 100000].forEach(step => { const v = Math.ceil(need / step) * step; if (v > need && !out.includes(v)) out.push(v); });
  return out.slice(0, 3);
}
function posPaySet(v) { POS.pay.amount = String(v); const el = document.getElementById('pos-paid'); if (el) { el.value = POS.cur === 'USD' ? String(v) : fwNum(v); } posPayGate(); }
function posPayType(k) { POS.pay.type = k; if (k === 'mixed' && !POS.pay.mix.length) posMixInit(); posPaint(); }
function posMixRows() {
  const bx = posBoxes();
  return POS.pay.mix.map(r => {
    const b = bx.find(k => k.id === r.boxId);
    return `<div class="pos-mix-r">
      <select class="pos-in" onchange="posMixSet('${r.id}','boxId',this.value)" aria-label="Kassa">${bx.map(k => `<option value="${k.id}" ${k.id === r.boxId ? 'selected' : ''}>${esc(k.name || '')} (${k.cur === 'USD' ? '$' : 'soʻm'})</option>`).join('')}</select>
      <input class="pos-in" inputmode="decimal" placeholder="${b && b.cur === 'USD' ? '$' : 'soʻm'}" value="${esc(r.amount)}" oninput="liveFormatSpaces(this);posMixSet('${r.id}','amount',this.value)" aria-label="Summa">
      <button class="pos-ib red" onclick="POS.pay.mix=POS.pay.mix.filter(x=>x.id!=='${r.id}');posPaint()" aria-label="Qatorni oʻchirish">${PI.x}</button>
    </div>`;
  }).join('');
}
function posMixSet(id, f, v) {
  const r = POS.pay.mix.find(x => x.id === id); if (!r) return;
  if (f === 'boxId') { r.boxId = isNaN(+v) ? v : +v; posPaint(); return; }
  r.amount = v; posPayGate();
}
// To'lov holati va «Yakunlash» tugmasi
function posPayGate() {
  const st = document.getElementById('pos-pay-st'), btn = document.getElementById('pos-finish'), cc = document.getElementById('pos-pay-cust');
  if (!btn) return;
  const t = posTotals(), s = posPayState(t), cust = posCust();
  let ok = false, html = '', need = false;
  const amt = (n) => posFmtN(Math.abs(n));
  if (s.st === 'empty') { html = ''; btn.textContent = 'Olingan summani kiriting'; }
  else if (s.st === 'exact') {
    ok = true; html = `<div class="pos-msg ok">${cust ? `Toʻliq toʻlandi — ${esc(cust.name)}` : 'Toʻliq toʻlandi — <b>Naqd savdo</b>'}</div>`;
    btn.textContent = 'Savdoni yakunlash';
  } else if (s.st === 'short') {
    need = true; ok = !!cust;
    html = `<div class="pos-msg warn">${PI.warn}<div><b>Kam: ${amt(s.diff)}.</b> ${cust ? `Qolgani <b>${esc(cust.name)}</b> qarziga yoziladi.` : 'Qolgan summa mijoz qarziga yoziladi — mijoz tanlash majburiy.'}
      ${POS.a.priceEditable && !POS.a.priceEditable() ? '' : `<button class="pos-link" onclick="posShortToDisc()">Farqni chegirma qilish</button>`}</div></div>`;
    html += posDueBlock();
    if (cust && !fwDueDaysOk(posDueVal())) ok = false;
    btn.textContent = cust ? (ok ? 'Qarzga yozib yakunlash' : 'Nasiya muddatini kiriting') : 'Mijoz tanlanmaguncha yopilmaydi';
  } else if (POS.pay.type !== 'mixed') {
    // v25: ortiqcha to'lov — shu ekranning o'zida kichik «Qaytim» qatori; kassir qaytimni yozmaguncha savdo yopilmaydi
    // (mijoz tanlangan bo'lsa — qaytim yozilmasa ortiqcha avvalgidek mijoz qarzidan ayiriladi / haqiga yoziladi)
    const chgOk = posChgOk(t, s);
    ok = chgOk || !!cust;
    html = `<div class="pos-chg${chgOk ? ' ok' : ''}"><span>Qaytim</span><b>${amt(s.diff)}</b>
      <input class="pos-in" id="pos-chg" inputmode="decimal" placeholder="Qaytimni yozing" value="${esc(POS.chg)}" aria-label="Berilgan qaytim" oninput="liveFormatSpaces(this);POS.chg=this.value;posChgGate()"></div>
      ${cust ? `<small class="pos-chg-n">Qaytim yozilmasa — ${amt(s.diff)} ${esc(cust.name)} hisobiga (qarzidan ayiriladi yoki haqiga) yoziladi.</small>` : ''}`;
    btn.textContent = chgOk ? 'Qaytim berildi · Yakunlash' : (cust ? 'Mijoz hisobiga yozib yakunlash' : 'Qaytimni yozing');
  } else {
    need = true; ok = !!cust;
    const debtN = cust ? (POS.cur === 'UZS' ? Math.max(0, +cust.debt || 0) : _r2p(Math.max(0, +cust.debt || 0) / posRate())) : 0;
    const toDebt = Math.min(debtN, s.diff), toCredit = s.diff - toDebt;
    html = `<div class="pos-msg info">${PI.warn}<div><b>Ortiqcha: ${amt(s.diff)}.</b> ${cust
      ? (toDebt > 0 ? `${posFmtN(toDebt)} — qarzidan ayiriladi${toCredit > 0.004 ? `, ${posFmtN(toCredit)} — mijoz haqiga` : ''}.` : `Mijoz haqiga yoziladi (keyingi xariddan ayiriladi).`)
      : 'Ortiqcha summa mijoz haqiga yoziladi — mijoz tanlash majburiy.'}${s.cross ? '' : ''}</div></div>`;
    btn.textContent = cust ? 'Yakunlash' : 'Mijoz tanlanmaguncha yopilmaydi';
  }
  const keepFocus = document.activeElement && document.activeElement.id === 'pos-chg';
  if (st && !keepFocus) st.innerHTML = html;
  if (cc) cc.classList.toggle('need', need && !cust);
  if (cc && !posFull()) cc.hidden = !(cust || s.st === 'short');   // sotuvchi: mijoz — faqat qarzda
  btn.disabled = !ok; btn.classList.toggle('is-disabled', !ok);
}
// v25: qaytim to'g'ri yozilganmi (ortiqcha summaga teng)
function posChgOk(t, s) {
  t = t || posTotals(); s = s || posPayState(t);
  if (s.st !== 'over' || POS.pay.type === 'mixed' || String(POS.chg).trim() === '') return false;
  const tol = POS.cur === 'USD' ? 0.005 : 0.5;
  return Math.abs(posParse(POS.chg) - s.diff) <= tol;
}
function posChgGate() {
  const t = posTotals(), s = posPayState(t), ok = posChgOk(t, s), cust = posCust();
  const btn = document.getElementById('pos-finish'), row = document.querySelector('.pos-chg');
  if (row) row.classList.toggle('ok', ok);
  if (btn) { const en = ok || !!cust; btn.disabled = !en; btn.classList.toggle('is-disabled', !en); btn.textContent = ok ? 'Qaytim berildi · Yakunlash' : (cust ? 'Mijoz hisobiga yozib yakunlash' : 'Qaytimni yozing'); }
}
// v24.9: nasiya muddati — majburiy, standart 10 kun; sana avtomatik hisoblanadi
function posDueVal() { return POS.dueDays === '' || POS.dueDays == null ? String(FW_DUE_DEFAULT_DAYS) : String(POS.dueDays); }
function posDueText() { const n = fwDueDaysOk(posDueVal()); return n ? `Toʻlov sanasi: <b>${fwDueFmt(fwDueAdd(fwLocalDay(), n))}</b>` : '<b class="red-t">1 dan 365 gacha kun kiriting</b>'; }
function posDueBlock() {
  const v = posDueVal();
  return `<div class="pos-due" id="pos-due"><div class="pos-due-h">${PI.warn}<b>Nasiya muddati *</b></div>
    <div class="pos-due-r"><input class="pos-in" id="pos-due-in" inputmode="numeric" maxlength="3" value="${esc(v)}" aria-label="Nasiya muddati, kun" oninput="posDueSet(this.value)"><span>kun</span>
      <span class="pos-due-q">${[7, 10, 15, 30].map(n => `<button type="button" class="${String(n) === v ? 'on' : ''}" onclick="posDueSet('${n}',true)">${n}</button>`).join('')}</span></div>
    <small id="pos-due-d">${posDueText()}</small></div>`;
}
function posDueSet(v, repaint) {
  POS.dueDays = String(v).replace(/\D/g, '').slice(0, 3);
  if (repaint) { posPayGate(); return; }
  const d = document.getElementById('pos-due-d'); if (d) d.innerHTML = posDueText();
  document.querySelectorAll('#pos-due .pos-due-q button').forEach(b => b.classList.toggle('on', b.textContent === POS.dueDays));
  const btn = document.getElementById('pos-finish'), ok = !!posCust() && !!fwDueDaysOk(posDueVal());
  if (btn) { btn.disabled = !ok; btn.classList.toggle('is-disabled', !ok); btn.textContent = !posCust() ? 'Mijoz tanlanmaguncha yopilmaydi' : ok ? 'Qarzga yozib yakunlash' : 'Nasiya muddatini kiriting'; }
}
// Kam to'lovni chegirmaga aylantirish (aniq tasdiq bilan) — natijada summa teng bo'ladi
function posShortToDisc() {
  const t = posTotals(), s = posPayState(t);
  if (s.st !== 'short') return;
  const d = -s.diff;
  if (!confirm(`Siz xaridorga ${posFmtN(d)} chegirma bermoqchisiz. Tasdiqlaysizmi?`)) return;
  POS.disc = { type: 'sum', val: (POS.cur === 'UZS' ? Math.round(t.discN - (t.roundN || 0) + d) : _r2p(t.discN + d)), reason: 'short_payment' };
  posPaint();
}

// ════════════════════════════════════════════════════════════
// YAKUNLASH — adapterga aniq kontekst beriladi (DOM o'qilmaydi)
// ════════════════════════════════════════════════════════════
function posBuildCtx() {
  const t = posTotals(), s = posPayState(t), cust = posCust(), P = POS.pay;
  if (!POS.a.cart().length) return { err: 'Savat boʻsh' };
  if (s.st === 'empty') return { err: 'Olingan summani kiriting' };
  const chgOk = posChgOk(t, s);   // v25: qaytim berildi — kassaga aynan jami tushadi, mijoz shart emas
  if (s.st === 'over' && !cust && !chgOk) return { err: POS.pay.type === 'mixed' ? 'Aralash toʻlovda ortiqcha summa uchun mijoz tanlang' : 'Qaytimni yozing' };
  if (s.st === 'short' && !cust) return { err: 'Kam toʻlovda mijoz tanlash majburiy (qarzga yoziladi)' };
  const rate = posRate();
  const toUsd = (n) => posNToUsd(n);
  let boxPayments = [], overpay = null, boxId = null, payType;
  const needN = t.needN;
  if (P.type === 'mixed') {
    payType = 'mixed';
    const rows = P.mix.map(r => ({ r, b: posBoxes().find(k => k.id === r.boxId), amt: posParse(r.amount) })).filter(x => x.b && x.amt > 0);
    let acc = 0;
    rows.forEach(x => { boxPayments.push({ box_id: x.b.id, amount_native: x.b.cur === 'USD' ? _r2p(x.amt) : Math.round(x.amt), cur: x.b.cur === 'USD' ? 'USD' : 'UZS' }); acc += posBoxToN(x.b, x.amt); });
    if (s.st === 'over') {
      let excessN = acc - needN;
      const last = boxPayments[boxPayments.length - 1], lb = rows[rows.length - 1].b;
      const lastN = posBoxToN(lb, last.amount_native);
      if (lastN + 1e-9 < excessN) return { err: 'Aralash toʻlovda ortiqcha summa oxirgi qatordagi kassaga sigʻmaydi — ortiqchani bitta kassaga kiriting' };
      const exNative = lb.cur === 'USD' ? _r2p(POS.cur === 'USD' ? excessN : excessN / rate) : Math.round(POS.cur === 'USD' ? excessN * rate : excessN);
      last.amount_native = lb.cur === 'USD' ? _r2p(last.amount_native - exNative) : Math.round(last.amount_native - exNative);
      overpay = { box_id: lb.id, amount_native: exNative, cur: lb.cur === 'USD' ? 'USD' : 'UZS' };
      boxPayments = boxPayments.filter(x => x.amount_native > 0);
    }
  } else {
    const box = posBoxFor(P.type);
    if (s.paidN > 0 && !box) return { err: 'Bu toʻlov turi uchun kassa topilmadi' };
    const cashN = Math.min(s.paidN, needN);
    if (cashN > 0) { boxPayments = [{ box_id: box.id, amount_native: posNativeForBox(box, cashN), cur: box.cur === 'USD' ? 'USD' : 'UZS' }]; boxId = box.id; }
    if (s.st === 'over' && !chgOk) overpay = { box_id: box.id, amount_native: posNativeForBox(box, s.paidN - needN), cur: box.cur === 'USD' ? 'USD' : 'UZS' };
    payType = P.type === 'card' ? 'card' : (POS.cur === 'USD' ? 'usd' : 'cash_uzs');
  }
  const cashPaidN = Math.min(s.paidN, needN);
  const creditUseUzs = t.creditN > 0 ? (POS.cur === 'UZS' ? Math.round(t.creditN) : Math.round(t.creditN * rate)) : 0;
  const paidUsd = Math.min(t.totUsd, toUsd(cashPaidN) + (t.creditN > 0 ? toUsd(t.creditN) : 0));
  if (s.paidN === 0 && t.creditN === 0) payType = 'debt';
  const debtUsd = Math.max(0, t.totUsd - paidUsd);
  let dueDays = null, dueDate = null;
  if (debtUsd >= 0.0005) {
    dueDays = fwDueDaysOk(posDueVal());
    if (!dueDays) return { err: 'Nasiya muddatini kiriting (1–365 kun)' };
    dueDate = fwDueAdd(fwLocalDay(), dueDays);
  }
  const items = POS.a.cart().map(i => ({ ...i }));
  return {
    items, cur: POS.cur, mode: POS.mode, rate,
    subtotalUsd: t.subUsd, discPct: t.discPct, discUsd: t.discUsd, totalUsd: t.totUsd, totalN: t.totN, subN: t.subN, discN: t.discN,
    costUsd: t.cost, profitUsd: t.profitUsd,
    paidUsd, debtUsd: debtUsd < 0.0005 ? 0 : debtUsd, paidN: s.paidN, status: chgOk ? 'exact' : s.st, changeN: chgOk ? s.diff : 0, dueDays, dueDate,
    payType, boxId, boxPayments, mixedRows: payType === 'mixed' ? boxPayments.map(b => ({ boxId: b.box_id, amount: b.amount_native })) : null,
    overpay, creditUseUzs,
    custId: cust ? cust.id : null, custName: cust ? cust.name : 'Anonim',
    note: POS.note || '', discountReason: t.discN > 0 ? (t.discN === t.roundN ? 'rounding' : (POS.disc.reason || 'manual')) : null, roundN: t.roundN,
    roundedTotalUzs: POS.cur === 'UZS' ? t.totN : Math.round(t.totUsd * rate),
    // v25.1: uchta alohida maydon (faqat so'm savdosi): asl jami (chegirmadan keyin), yaxlitlash chegirmasi, to'langan jami
    ...(POS.cur === 'UZS' ? { asl_jami: t.aslN, yaxlitlash_chegirmasi: t.roundN, tolangan_jami: t.totN } : {}),
  };
}
function posNativeForBox(box, n) {
  if (box.cur === 'USD') return _r2p(POS.cur === 'USD' ? n : n / posRate());
  return Math.round(POS.cur === 'USD' ? n * posRate() : n);
}
async function posFinish() {
  if (POS.busy) return;
  const ctx = posBuildCtx();
  if (ctx.err) { toast(ctx.err, 'error'); posPayGate(); return; }
  // Zarar bilan savdo — summa ko'rsatilib tasdiqlanadi (server ham tekshiradi)
  if (ctx.profitUsd < -0.005) {
    if (!confirm(`⚠️ Bu savdoda ${posFmtN(posUsdToN(-ctx.profitUsd))} ziyon — narx minimal narxdan past.${POS.a.key === 'seller' ? ' Administrator xabardor qilinadi.' : ''}\n\nRozimisiz?`)) return;
    ctx.lossAck = true;
  }
  POS.busy = true;
  const btn = document.getElementById('pos-finish');
  if (btn) { btn.disabled = true; btn.textContent = 'Yuborilmoqda...'; }
  let ok = false;
  try { ok = await POS.a.commit(ctx); }
  catch (e) { toast('⛔ ' + (e && e.message || 'Savdo amalga oshmadi'), 'error'); }
  finally { POS.busy = false; }
  if (!ok) { posPayGate(); return; }
  POS.a.setCart([]); posResetSale();
  POS.stack.length = 0;
  const ov = document.getElementById('pos-ov'); if (ov) ov.remove(); document.body.classList.remove('pos-lock');
  if (typeof fwBackDone === 'function') { for (let i = 8; i >= 1; i--) fwBackDone('pos:' + i); }
  posRender();
  if (POS.a.afterCommit) POS.a.afterCommit(ok);
}

// ════════════════════════════════════════════════════════════
// 5. KECHIKTIRILGAN CHEKLAR (shu qurilmada saqlanadi)
// ════════════════════════════════════════════════════════════
function posHeld() { try { const a = JSON.parse(localStorage.getItem(_posKey('held')) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
function _posSaveHeld(a) { try { localStorage.setItem(_posKey('held'), JSON.stringify(a.slice(0, 30))); } catch (_) { toast('Qurilma xotirasiga yozib boʻlmadi', 'error'); } }
function posHold() {
  const cart = POS.a.cart(); if (!cart.length) return;
  const a = posHeld();
  a.unshift({ id: String(uid()), ts: Date.now(), items: cart.map(i => ({ ...i })), custId: POS.a.custId(), note: POS.note, disc: { ...POS.disc }, mode: POS.mode, cur: POS.cur });
  _posSaveHeld(a);
  POS.a.setCart([]); posResetSale(); posCloseAll(); posRender();
  toast('Chek kechiktirildi — «Kechiktirilgan cheklar»dan qaytarasiz');
}
function posHeldView() {
  const a = posHeld();
  const ago = (ts) => { const m = Math.max(0, Math.round((Date.now() - ts) / 60000)); return m < 60 ? `${m} daqiqa` : `${Math.floor(m / 60)} soat ${m % 60} daqiqa`; };
  const hhmm = (ts) => { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  return `<div class="pos-scr">
    ${_posHead('Kechiktirilgan cheklar', a.length ? `${a.length} ta chek kutmoqda` : '')}
    <div class="pos-scr-b">${a.length ? a.map(h => {
      const c = h.custId ? POS.a.customers().find(x => x.id === h.custId) : null;
      const tot = h.items.reduce((s, i) => s + (+i.qty || 0) * (h.cur === 'USD' ? (+i.sellUsd || 0) : Math.round((+i.sellUsd || 0) * posRate())), 0);
      const late = Date.now() - h.ts > 60 * 60000;
      return `<div class="pos-held">
        <div class="pos-held-t"><b>${hhmm(h.ts)}</b><span class="pos-pill${late ? ' red' : ''}">${ago(h.ts)} kutmoqda</span></div>
        <div class="pos-held-m">Mijoz: ${c ? `<b>${esc(c.name)}</b>` : '<i>tanlanmagan</i>'}</div>
        <div class="pos-held-m">${esc(h.items.slice(0, 3).map(i => `${i.name} ×${fmtQtyS(i.qty)}`).join(', '))}${h.items.length > 3 ? ` va yana ${h.items.length - 3}` : ''}</div>
        <div class="pos-held-t"><span>${h.items.length} pozitsiya</span><b>${posFmtN(h.cur === 'USD' ? _r2p(tot) : tot, h.cur)}</b></div>
        <div class="pos-foot"><button class="pos-btn pri" onclick="posUnhold('${h.id}')">Kassaga qaytarish</button><button class="pos-ib red" onclick="posDropHeld('${h.id}')" aria-label="Chekni oʻchirish">${PI.trash}</button></div>
      </div>`;
    }).join('') : `<div class="pos-empty">Kechiktirilgan chek yoʻq. Savatda «Pauza»ni bossangiz, chek shu yerga tushadi.</div>`}</div>
  </div>`;
}
function posUnhold(id) {
  const a = posHeld(), h = a.find(x => x.id === id); if (!h) return;
  const cur = POS.a.cart();
  if (cur.length && !confirm('Savatda boshqa chek bor. U kechiktirilganlarga oʻtkazilib, bu chek qaytarilsinmi?')) return;
  let rest = a.filter(x => x.id !== id);
  if (cur.length) rest.unshift({ id: String(uid()), ts: Date.now(), items: cur.map(i => ({ ...i })), custId: POS.a.custId(), note: POS.note, disc: { ...POS.disc }, mode: POS.mode, cur: POS.cur });
  _posSaveHeld(rest);
  POS.mode = h.mode || POS.mode; POS.cur = h.cur || POS.cur; POS.note = h.note || ''; POS.disc = h.disc || { type: 'sum', val: 0 };
  POS.pay = { type: 'cash', amount: '', mix: [] }; POS.useCredit = false;
  // Qoldiq qayta tekshiriladi (kechikish vaqtida sotilib ketgan bo'lishi mumkin)
  const items = []; const short = [];
  h.items.forEach(i => { const st = i.directSupply ? Infinity : POS.a.stock(i.pid); if (st <= 0) short.push(i.name); else { if (i.qty > st) { short.push(i.name); i.qty = st; } i.lineUsd = i.qty * i.sellUsd; items.push(i); } });
  POS.a.setCart(items); POS.a.setCustId(h.custId || null);
  posCloseAll(); posRender();
  if (short.length) toast(`Qoldiq kamaygan: ${short.slice(0, 3).join(', ')} — miqdor tuzatildi`, 'warning');
  if (items.length) posOpen('cart');
}
function posDropHeld(id) {
  if (!confirm('Kechiktirilgan chek oʻchirilsinmi?')) return;
  _posSaveHeld(posHeld().filter(x => x.id !== id)); posPaint();
}

// ════════════════════════════════════════════════════════════
// 6. MIJOZ — qidirish yoki yangi qo'shish (ism va telefon majburiy)
// ════════════════════════════════════════════════════════════
POS.cq = '';
function posCustView() {
  const cur = posCust();
  return `<div class="pos-scr">
    ${_posHead('Mijoz', cur ? 'Tanlangan: ' + cur.name : '')}
    <div class="pos-scr-b">
      <div class="pos-search">${PI.search}<input id="pos-cq" placeholder="Ism yoki telefon boʻyicha qidirish" value="${esc(POS.cq)}" oninput="POS.cq=this.value;posCustList()" autocomplete="off" data-autofocus aria-label="Mijoz qidirish"></div>
      <div id="pos-cl" class="pos-cl">${posCustListHtml()}</div>
      ${cur ? `<button class="pos-link red-t" onclick="POS.a.setCustId(null);POS.useCredit=false;posBack();posRefresh()">Mijozni olib tashlash (Naqd savdo)</button>` : ''}
      <div class="pos-sec">YANGI MIJOZ</div>
      <label class="pos-lbl" for="pos-nc-n">Ism *</label><input class="pos-in" id="pos-nc-n" maxlength="120" placeholder="Masalan: Akmal aka" value="${esc(/\d{5,}/.test(POS.cq) ? '' : POS.cq)}">
      <label class="pos-lbl" for="pos-nc-p">Telefon *</label><input class="pos-in" id="pos-nc-p" inputmode="tel" maxlength="20" value="${esc(/\d{5,}/.test(POS.cq) ? POS.cq : '+998 ')}">
      <label class="pos-lbl" for="pos-nc-a">Manzil</label><input class="pos-in" id="pos-nc-a" maxlength="200" placeholder="Ixtiyoriy">
      <label class="pos-lbl" for="pos-nc-o">Izoh</label><textarea class="pos-in" id="pos-nc-o" rows="2" maxlength="300" placeholder="Ixtiyoriy"></textarea>
    </div>
    <div class="pos-foot fixed"><button class="pos-btn pri" id="pos-nc-btn" onclick="posCustCreate()">Saqlash va tanlash</button></div>
  </div>`;
}
function posCustListHtml() {
  const q = (POS.cq || '').trim();
  const all = POS.a.customers();
  const list = q ? multiFieldSearch(all, q, c => [c.name, c.phone]).slice(0, 20) : all.slice().sort((a, b) => (+b.id || 0) - (+a.id || 0)).slice(0, 8);
  if (!list.length) return q ? `<div class="pos-empty sm">Topilmadi — pastda yangi mijoz qoʻshing</div>` : '';
  return list.map(c => `<button class="pos-cr${POS.a.custId() === c.id ? ' on' : ''}" onclick="posCustPick(${JSON.stringify(c.id).replace(/"/g, '&quot;')})"><b>${esc(c.name)}</b><small>${esc(posCustSub(c))}</small></button>`).join('');
}
function posCustList() { const el = document.getElementById('pos-cl'); if (el) el.innerHTML = posCustListHtml(); }
function posCustPick(id) {
  POS.a.setCustId(id); POS.useCredit = false; POS.cq = '';
  const c = posCust();
  if (c && +c.disc > 0 && !(POS.disc.val > 0) && POS.a.priceEditable && POS.a.priceEditable()) POS.disc = { type: 'pct', val: +c.disc };
  posBack(); posRefresh();
}
function posPhoneNorm(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (/^998\d{9}$/.test(d)) return '+' + d;
  if (/^\d{9}$/.test(d)) return '+998' + d;
  return null;
}
async function posCustCreate() {
  const name = (document.getElementById('pos-nc-n')?.value || '').trim();
  const phone = posPhoneNorm(document.getElementById('pos-nc-p')?.value);
  const addr = (document.getElementById('pos-nc-a')?.value || '').trim();
  const note = (document.getElementById('pos-nc-o')?.value || '').trim();
  if (name.length < 2) { toast('Ismni kiriting', 'error'); document.getElementById('pos-nc-n')?.focus(); return; }
  if (!phone) { toast('Telefon raqamini toʻliq kiriting: +998 XX XXX XX XX', 'error'); document.getElementById('pos-nc-p')?.focus(); return; }
  const dup = POS.a.customers().find(c => posPhoneNorm(c.phone) === phone);
  if (dup) { if (confirm(`Bu telefon «${dup.name}» mijozida bor. Oʻsha mijoz tanlansinmi?`)) posCustPick(dup.id); return; }
  const b = document.getElementById('pos-nc-btn'); if (b) b.disabled = true;
  try {
    const c = await POS.a.addCustomer({ name: name.slice(0, 120), phone, addr: addr.slice(0, 200), note: note.slice(0, 300) });
    if (c) { toast(`«${c.name}» qoʻshildi va tanlandi`); posCustPick(c.id); }
  } catch (e) { toast('⛔ ' + (e && e.message || 'Saqlanmadi'), 'error'); }
  finally { if (b) b.disabled = false; }
}
