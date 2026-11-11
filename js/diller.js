// ════════════════════════════════════════════
// DILLER PORTAL — alohida, yengil ilova
// Har diller faqat OʻZINING maʼlumotini koʻradi (Supabase RLS orqali)
// ════════════════════════════════════════════

// Loyiha sozlamalari js/config.js'dan olinadi (noldan o'rnatishda `npm run setup` yozadi);
// fayl bo'lmasa — hozirgi production qiymatlari ishlatiladi.
const FW_CFG = (typeof window !== 'undefined' && window.FW_CONFIG) || {};
const SUPABASE_URL      = FW_CFG.SUPABASE_URL || 'https://dzzxrxudsejhdrbpiifc.supabase.co';
const SUPABASE_ANON_KEY = FW_CFG.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6enhyeHVkc2VqaGRyYnBpaWZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMzYxNjUsImV4cCI6MjEwMTgxMjE2NX0.twdMwAU_asDmzIZ1Y6halfSaB6YaFxmEBfRSWPKDdfI';
const DEALER_EMAIL_DOMAIN = 'dillers.biznespro.local'; // ichki, dillerga ko'rinmaydi

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Himoyalangan Netlify Function'larga so'rov yuborish uchun umumiy yordamchi ──
async function authHeaders() {
  try {
    const { data: { session } } = await db.auth.getSession();
    if (session?.access_token) return { 'Authorization': 'Bearer ' + session.access_token };
  } catch(e) { /* sessiya yo'q — server 401 qaytaradi */ }
  return {};
}
async function authFetch(url, options = {}) {
  const hdrs = { 'Content-Type': 'application/json', ...(await authHeaders()), ...(options.headers||{}) };
  return fetch(url, { ...options, headers: hdrs });
}

let ME = null;         // {id, name, region, debt_usd, ...} — dealers jadvalidan
let STOCK = [];         // dealer_stock — faqat mening qatorlarim
let SALES = [];         // dealer_sales — faqat mening qatorlarim
let CATALOG = [];        // catalog_products — asosiy ombordagi mavjud mahsulotlar (xavfsiz ro'yxat)
let MY_ORDERS = [];      // dealer_orders — mening buyurtmalarim
let ORDER_CART = {};     // {pid: qty} — buyurtma savati
let ACTIVE_TAB = 'home';   // v24.7: admin panel kabi — Bosh sahifadan ochiladi (Sotuv — pastdagi QR tugmasi, bir bosish)
let POINT_SETTINGS = { usdValue: 2, roundStep: 1 }; // global sozlamalar (app_data.settings dan)

function fmtUsd(n) {
  const v = (+(n||0)).toFixed(2); const [i,d] = v.split('.');
  return '$' + i.replace(/\B(?=(\d{3})+(?!\d))/g,' ') + '.' + d;
}
function fmtD(s){ if(!s) return ''; const [y,m,d]=String(s).slice(0,10).split('-'); return `${d}.${m}.${y}`; }

function toast(msg, type='success') {
  const el = document.createElement('div');
  el.textContent = msg;
  el.textContent = String(msg ?? '').replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '');
  el.style.cssText = `background:${type==='error'?'#e23d3d':type==='warning'?'#d97706':'#0ea876'};color:#fff;padding:12px 18px;border-radius:10px;
    margin-top:8px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.18);animation:dlIn .2s ease`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(()=>el.remove(), 3200);
}
const styleTag = document.createElement('style');
styleTag.textContent = `#toasts{position:fixed;bottom:16px;right:16px;left:16px;display:flex;flex-direction:column;align-items:flex-end;z-index:9999}
@media (max-width:1024px){#toasts{bottom:calc(96px + env(safe-area-inset-bottom));align-items:stretch}}
@keyframes dlIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`;
document.head.appendChild(styleTag);

function dlTogglePw(btn) { fwPwPeek('dl-login-pw', btn); }   // v24.9: 3 soniyadan keyin o'zi yashirinadi

async function dlDoLogin() {
  const loginVal = document.getElementById('dl-login-id').value.trim();
  const pw = document.getElementById('dl-login-pw').value;
  const errEl = document.getElementById('dl-login-err');
  const btn = document.getElementById('dl-login-btn');
  errEl.textContent = '';
  if (!loginVal || !pw) { errEl.textContent = "Login va parolni kiriting"; return; }

  btn.disabled = true; btn.textContent = 'Kirilmoqda...';
  const { error } = await fwStaffLogin(db, loginVal, pw, 'dealer');   // v24.9: server orqali — noto'g'ri urinishlar sanaladi
  btn.disabled = false; btn.textContent = 'Kirish →';

  if (error) {
    errEl.textContent = error.status ? error.message : "Login yoki parol noto'g'ri";
    const box = document.querySelector('.dl-login-box');
    box.classList.add('shake'); setTimeout(()=>box.classList.remove('shake'), 450);
    return;
  }
  await dlLoadMe();
}

async function dlLoadMe() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) { dlShowLogin(); return; }

  const { data: dealer, error } = await db.from('dealers').select('*').eq('auth_user_id', user.id).maybeSingle();
  if (error || !dealer) {
    document.getElementById('dl-login-err').textContent = "Hisobingiz topilmadi. Administratorga murojaat qiling.";
    await db.auth.signOut();
    dlShowLogin();
    return;
  }
  ME = dealer;
  await dlRefreshData();
  dlShowApp();
}

async function dlRefreshData() {
  if (!ME) return;
  const [{ data: stock }, { data: sales }, { data: catalog }, { data: orders }] = await Promise.all([
    db.from('dealer_stock').select('*').eq('dealer_id', ME.id).gt('qty', 0).order('name'),
    // Statistika (30 kun / oy / yil) uchun yetarli tarix — faqat o'z qatorlarim (RLS)
    db.from('dealer_sales').select('*').eq('dealer_id', ME.id).order('created_at', { ascending:false }).limit(1000),
    db.from('catalog_products').select('*').eq('filial', ME.filial||'baza').gt('qty', 0).order('name'),
    db.from('dealer_orders').select('*').eq('dealer_id', ME.id).order('created_at', { ascending:false }).limit(50)
  ]);
  STOCK = stock || [];
  SALES = sales || [];
  CATALOG = catalog || [];
  MY_ORDERS = orders || [];
  const { data: freshMe } = await db.from('dealers').select('*').eq('id', ME.id).maybeSingle();
  if (freshMe) ME = freshMe;

  try {
    const res = await authFetch('/.netlify/functions/dealer-point-settings', { method:'POST' });
    if (res.ok) {
      const s = await res.json();
      POINT_SETTINGS.usdValue = s.pointUsdValue!=null ? s.pointUsdValue : 2;
      POINT_SETTINGS.roundStep = s.pointRoundStep!=null ? s.pointRoundStep : 1;
    }
  } catch(e) { /* sozlamalar yuklanmasa ham standart qiymatlar ishlatiladi */ }
}

function dlShowLogin() {
  document.documentElement.classList.remove('fw-booting');
  document.getElementById('dl-login').style.display = 'flex';
  document.getElementById('dl-app').style.display = 'none';
}

function dlShowApp() {
  document.documentElement.classList.remove('fw-booting');
  document.getElementById('dl-login').style.display = 'none';
  document.getElementById('dl-app').style.display = 'flex';
  document.getElementById('dl-name').textContent = ME.name;
  ptGreet('dl', ME.name);
  document.getElementById('dl-region').textContent = (ME.region || 'Diller') + ' · ' + dlFilialLabel();
  dlRenderSummary();
  if (typeof ptShellInit === 'function') ptShellInit({ label: 'Diller', go: 'dlSwitchTab', settings: 'dlOpenSettings', logout: 'dlLogout', who: ME.name,
    role: (ME.region || 'Diller') + ' · ' + dlFilialLabel(),
    items: [['home', 'Bosh sahifa'], ['sale', 'Sotuv'], ['stock', 'Omborim'], ['order', 'Buyurtma'], ['pay', 'Toʻlov'], ['history', 'Savdolarim'], ['revision', 'Reviziya']] });
  if (typeof ptSideActive === 'function') ptSideActive(ACTIVE_TAB);
  dlRenderContent();
  dlNotifLoad();   // v24: 🔔 bildirishnomalar (to'lov qabul/rad va h.k.)
}

// v24.7: BOSH SAHIFA — admin bosh sahifasi uslubida: salomlashish, qarz va ombor (ox-hero), «Tezkor amallar», oxirgi savdolar
const DL_HOME = { per: 'month' };
function dlHomePer(p) { DL_HOME.per = p; if (ACTIVE_TAB === 'home') dlRenderContent(); }
function dlHomeHtml() {
  const t = new Date().toISOString().slice(0, 10), per = DL_HOME.per;
  const from = per === 'week' ? new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10) : per === 'month' ? t.slice(0, 7) + '-01' : t;
  const ps = SALES.filter(r => { const d = String(r.sale_date || '').slice(0, 10); return d >= from && d <= t; });
  const rev = ps.reduce((a, r) => a + (+r.total_usd || 0), 0), units = ps.reduce((a, r) => a + (+r.qty || 0), 0);
  const debt = +ME.debt_usd || 0, stockV = STOCK.reduce((s, r) => s + (+r.qty || 0) * dlPriceOf(r.pid), 0), stockN = STOCK.reduce((s, r) => s + (+r.qty || 0), 0);
  const low = STOCK.filter(r => (+r.qty || 0) > 0 && (+r.qty || 0) <= 2).length;
  const perL = { today: 'Bugun', week: '7 kun', month: 'Bu oy' };
  const last = SALES.slice(0, 5);
  return `${ptWelcome(ME.name, (ME.region || 'Diller') + ' · ' + dlFilialLabel())}
  <section class="ox-hero" aria-label="Mening sotuvim">
    <div class="ox-hero-top"><span>Mening sotuvim · ${perL[per]}</span><span class="ox-seg">${Object.entries(perL).map(([k, l]) => `<button class="${per === k ? 'on' : ''}" onclick="dlHomePer('${k}')">${l}</button>`).join('')}</span></div>
    <div class="ox-hero-big">${fmtUsd(rev)}</div>
    <div class="ox-hero-g">
      <span><small>Sotilgan</small><b class="sk">${fwNumSafe(units)} dona</b></span>
      <span><small>Omborim</small><b class="gr">${fmtUsd(stockV)}</b></span>
      <span><small>Ball</small><b class="am">${fwNumSafe(ME.points || 0)}</b></span>
    </div>
    <div class="ox-hero-net"><span>${debt > 0 ? 'Qarzim — toʻlanishi kerak' : 'Qarzim'}</span><b style="color:${debt > 0 ? 'var(--red)' : 'var(--emerald)'}">${debt > 0 ? fmtUsd(debt) : 'Qarz yoʻq'}</b></div>
  </section>
  ${ptBanner('sale', 'Yangi sotuv', 'Omboringizdagi mahsulotni mijozga soting', "dlSwitchTab('sale')")}
  ${ptActs([['sale', 'emerald', 'Sotuv', "dlSwitchTab('sale')"], ['stock', 'purple', 'Omborim', "dlSwitchTab('stock')", low], ['order', 'blue', 'Buyurtma', "dlSwitchTab('order')"],
    ['pay', debt > 0 ? 'red' : 'sky', 'Toʻlov', "dlSwitchTab('pay')"], ['history', 'indigo', 'Savdolarim', "dlSwitchTab('history')"], ['revision', 'amber', 'Reviziya', "dlSwitchTab('revision')"],
    ['orders', 'sky', 'Xabarlar', 'dlNotifOpen()'], ['settings', 'text-muted', 'Sozlamalar', 'dlOpenSettings()']])}
  <h2 class="ox-sec">Oxirgi savdolarim</h2>
  ${last.length ? `<div class="pt-last">${last.map(s => `<div class="pt-last-r"><span class="pt-last-ic">${ptIc('history')}</span><span class="pt-last-t"><b>${esc(s.name || '')}</b><small>${fwNumSafe(s.qty)} dona · ${esc(fmtD(s.sale_date))}</small></span><b class="pt-last-v">${fmtUsd(+s.total_usd || 0)}</b></div>`).join('')}</div>`
    : `<div class="pt-empty">Hali savdo yoʻq — birinchi sotuvni «Yangi sotuv» tugmasi bilan boshlang.</div>`}
  <p class="pt-stock-note">${stockN ? `Omboringizda ${fwNumSafe(stockN)} dona mahsulot` : 'Omboringiz hozircha boʻsh — «Buyurtma» orqali tovar soʻrang'}</p>`;
}
function dlRenderSummary() {
  const el = document.getElementById('dl-summary');
  const debt = ME.debt_usd || 0;
  const warehouseValue = STOCK.reduce((s,r)=>{
    const optim = CATALOG.find(x=>x.id===r.pid)?.optim_price;
    return s + r.qty*(optim!=null && optim>0 ? optim : (r.avg_cost_usd||0));
  }, 0);
  el.classList.add('dl-hero');
  el.innerHTML = `
    <div class="dl-hero-top"><span>Qarzingiz</span><b style="color:${debt>0?'var(--red)':'var(--emerald)'}">${debt>0?fmtUsd(debt):"Qarz yoʻq"}</b></div>
    <div class="dl-stat"><span style="color:var(--text-muted)">Omboringiz qiymati</span>
      <strong>${fmtUsd(warehouseValue)}</strong></div>
    <div class="dl-stat"><span style="color:var(--text-muted)">Jami sotilgan</span>
      <strong>${fmtUsd(ME.total_sold_usd||0)}</strong></div>
    <div class="dl-stat"><span style="color:var(--text-muted)">Topshirilgan pul</span>
      <strong style="color:var(--emerald)">${fmtUsd(ME.total_paid_usd||0)}</strong></div>
    <div class="dl-stat"><span style="color:var(--text-muted)">Jamg'arilgan ball</span>
      <strong style="color:var(--gold)">${ME.points||0}</strong></div>
    ${debt>0 ? `<div class="dl-hero-act"><button class="dl-btn" onclick="dlSwitchTab('pay')">Pul yuborish — qarzni yopish</button></div>` : ''}
`;   // qarz — yuqorida (dl-hero-top)
}

function dlSwitchTab(tab) {
  if (tab === 'myorders') { DLO.seg = 'mine'; tab = 'order'; }   // v24.5: «Buyurtmalarim» — «Buyurtma» ichida
  ACTIVE_TAB = tab;
  ['sale','stock','order','pay','history'].forEach(t => document.getElementById('tab-'+t)?.classList.toggle('active', tab===t));
  if (typeof ptSideActive === 'function') ptSideActive(tab);
  dlRenderContent();
  window.scrollTo?.(0, 0);
}

// Pastki menyu o'rtasidagi QR tugmasi: «Sotuv» bo'limi + skaner — kod (SKU / shtrix-kod) omboringizdagi mahsulotga moslanadi
// Pastki menyu o'rtasidagi tugma — Sotuv oynasini ochadi (skaner — oyna ichidagi tugmada)
function dlNavScan() {
  if (ACTIVE_TAB !== 'sale') dlSwitchTab('sale');
}
function dlSaleScan() {
  fwScan(text => {
    const r = fwResolveCode(STOCK.map(x => ({ ...x, id: x.pid })), text);
    if (!r) { toast(`Omboringizda mos mahsulot topilmadi («${String(text).slice(0, 40)}»)`, 'error'); return; }
    dlSaleAdd(r.pid, 1);
  });
}

function dlRenderContent() {
  const el = document.getElementById('dl-content');
  // v24.5 (egasi talabi): «Qarzingiz» paneli — FAQAT «Toʻlov» bo'limida
  const sm = document.getElementById('dl-summary'); if (sm) sm.hidden = ACTIVE_TAB !== 'pay';
  if (ACTIVE_TAB === 'home') {
    el.innerHTML = dlHomeHtml();
  } else if (ACTIVE_TAB === 'sale') {
    el.innerHTML = dlSaleHtml();
  } else if (ACTIVE_TAB === 'stock') {
    el.innerHTML = dlStockHtml(); dlStockFilter();
  } else if (ACTIVE_TAB === 'order') {
    el.innerHTML = dlOrderTabHtml();
    if (DLO.seg === 'new') { dlRenderOrderList(); if (!DLO.loadedOnce) { DLO.loadedOnce = true; dlRefreshCatalog(); } }
  } else if (ACTIVE_TAB === 'pay') {
    el.innerHTML = dlPayHtml();
    if (!DLPAY.loaded && !DLPAY.loading) dlPayLoad();
  } else if (ACTIVE_TAB === 'myorders') {
    el.innerHTML = dlMyOrdersHtml();
  } else if (ACTIVE_TAB === 'notif') {
    el.innerHTML = dlNotifHtml();
  } else if (ACTIVE_TAB === 'revision') {
    el.innerHTML = dlRevHtml();
    if (!DLREV.loaded && !DLREV.loading) dlRevLoad();
  } else {
    el.innerHTML = dlHistoryHtml();
  }
}

// ════════════════════════════════════════════
// PUL YUBORISH (v23.8, server: dealer-pay) — naqd so'm / karta / naqd $, SHU KUNGI KURS bo'yicha.
// Yuborilgan zahoti qarz kamayadi; kassir pulni qabul qiladi yoki (pul kelmasa) rad etadi — qarz qaytadi.
// ════════════════════════════════════════════
const DLPAY = { type: 'cash_uzs', list: [], rate: null, loaded: false, loading: false, err: '', pend: null, busy: false };
const DLPAY_TYPES = [['cash_uzs', "Naqd so'm", 'M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-9-1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-6v11c0 1.1-.9 2-2 2H4v-2h17V7h2z'],
  ['card', 'Karta', 'M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z'],
  ['cash_usd', 'Naqd $', 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z']];
const dlUzs = (n) => fwNum(n) + " so'm";
async function dlPayLoad() {
  DLPAY.loading = true;
  try {
    const res = await authFetch('/.netlify/functions/dealer-pay', { method: 'POST', body: JSON.stringify({ action: 'mine' }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Yuklanmadi');
    DLPAY.list = d.notices || []; DLPAY.rate = d.rate || null; DLPAY.err = ''; DLPAY.loaded = true;
  } catch (e) { DLPAY.err = e.message; }
  finally { DLPAY.loading = false; if (ACTIVE_TAB === 'pay') dlRenderContent(); }
}
function dlPaySetType(t) { DLPAY.type = t; const a = document.getElementById('dlp-amt'); const v = a ? a.value : ''; dlRenderContent(); const b = document.getElementById('dlp-amt'); if (b) { b.value = v; dlPayCalc(); } }
function dlPayUsd(amount) { return DLPAY.type === 'cash_usd' ? amount : (DLPAY.rate ? Math.round(amount / DLPAY.rate * 100) / 100 : 0); }
function dlPayCalc() {
  const amt = parseFloat(document.getElementById('dlp-amt')?.value) || 0, usd = dlPayUsd(amt), debt = +ME.debt_usd || 0, el = document.getElementById('dlp-conv');
  if (!el) return;
  el.innerHTML = amt > 0 ? `<span>${DLPAY.type === 'cash_usd' ? 'Qarzdan ayiriladi' : '= dollarda'}: <b>${fmtUsd(usd)}</b></span><span class="${usd > debt + 0.01 ? 'bad' : ''}">${usd > debt + 0.01 ? 'Qarzingizdan oshib ketdi' : `Qarzingiz qoladi: <b>${fmtUsd(Math.max(0, debt - usd))}</b>`}</span>` : '';
}
function dlPayHtml() {
  const debt = +ME.debt_usd || 0, unit = DLPAY.type === 'cash_usd' ? '$' : "so'm";
  const st = { pending: ['Kassir tasdigʻi kutilmoqda', 'amber'], accepted: ['Qabul qilindi', 'emerald'], rejected: ['Rad etildi — qarz qaytdi', 'red'] };
  return `
    <div class="dl-card">
      <div style="font-weight:800;font-size:14px;margin-bottom:4px">Pul yuborish</div>
      <div class="dlp-rate" style="margin-bottom:10px">${DLPAY.rate ? `Bugungi kurs: 1 $ = ${fwNum(DLPAY.rate)} soʻm — yuborilgan zahoti shu kurs qotiriladi` : (DLPAY.loading ? 'Kurs yuklanmoqda…' : 'Kurs belgilanmagan — soʻmda yuborib boʻlmaydi')}</div>
      <div class="dlp-pay-types" role="radiogroup">${DLPAY_TYPES.map(([k, l, ic]) => `<button type="button" role="radio" aria-checked="${DLPAY.type === k}" class="${DLPAY.type === k ? 'on' : ''}" onclick="dlPaySetType('${k}')"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${ic}"/></svg>${l}</button>`).join('')}</div>
      <div class="me-amt"><input class="dl-input" id="dlp-amt" type="number" min="0" step="${DLPAY.type === 'cash_usd' ? '0.01' : '1000'}" inputmode="decimal" placeholder="Summa" oninput="dlPayCalc()" style="margin:0;font-size:17px;font-weight:700;padding-right:54px"><i>${unit}</i></div>
      <div class="dlp-conv" id="dlp-conv"></div>
      <input class="dl-input" id="dlp-note" maxlength="300" placeholder="Izoh (ixtiyoriy): masalan, kim orqali berildi" style="margin-top:8px">
      <button class="dl-btn" id="dlp-btn" onclick="dlPaySend()" ${debt > 0 && !DLPAY.busy ? '' : 'disabled'}>Pul yubordim</button>
      <div class="dl-pmeta" style="margin-top:8px">Yuborilgan zahoti qarzingiz kamayadi. Kassir pulni qabul qiladi; pul kelmagan boʻlsa rad etadi va qarz qaytadi.</div>
    </div>
    <div class="dl-card"><div style="font-weight:800;font-size:14px;margin-bottom:4px">Yuborganlarim</div>
      ${DLPAY.err ? `<div class="dl-pmeta" style="color:var(--red)">${esc(DLPAY.err)}</div>` : ''}
      ${DLPAY.list.length ? DLPAY.list.map(n => `<div class="dl-prow"><div><div class="dl-pname">${esc((DLPAY_TYPES.find(t => t[0] === n.payType) || [, ''])[1])} · ${n.currency === 'USD' ? fmtUsd(n.amount) : dlUzs(n.amount)}</div>
          <div class="dl-pmeta">${fmtD(n.createdAt)}${n.currency === 'UZS' ? ` · = ${fmtUsd(n.amountUsd)} (kurs ${fwNum(n.rate)})` : ''}${n.rejectReason ? ' · ' + esc(n.rejectReason) : ''}</div></div>
          <span class="dpn-pill" style="--c:var(--${st[n.status][1]})">${st[n.status][0]}</span></div>`).join('')
        : `<div class="dl-pmeta" style="padding:10px 0">${DLPAY.loading ? 'Yuklanmoqda…' : 'Hali pul yuborilmagan'}</div>`}
    </div>`;
}
async function dlPaySend() {
  if (DLPAY.busy) return;
  const amount = Math.round((parseFloat(document.getElementById('dlp-amt')?.value) || 0) * 100) / 100;
  const note = (document.getElementById('dlp-note')?.value || '').trim().slice(0, 300);
  if (!(amount > 0)) { toast('Summani kiriting', 'error'); return; }
  if (DLPAY.type !== 'cash_usd' && !DLPAY.rate) { toast("Kurs belgilanmagan — so'mda yuborib bo'lmaydi", 'error'); return; }
  const usd = dlPayUsd(amount);
  if (usd > (+ME.debt_usd || 0) + 0.01) { toast(`Summa qarzingizdan (${fmtUsd(ME.debt_usd || 0)}) oshib ketdi`, 'error'); return; }
  // Barqaror kalit: tarmoq uzilib qayta bosilsa — server ikki marta yozmaydi
  const sig = JSON.stringify([DLPAY.type, amount, note]);
  if (!DLPAY.pend || DLPAY.pend.sig !== sig) DLPAY.pend = { sig, key: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10) };
  DLPAY.busy = true; const btn = document.getElementById('dlp-btn'); if (btn) { btn.disabled = true; btn.textContent = 'Yuborilmoqda…'; }
  try {
    let res, d;
    try { res = await authFetch('/.netlify/functions/dealer-pay', { method: 'POST', body: JSON.stringify({ action: 'send', payType: DLPAY.type, amount, note: note || null, idemKey: DLPAY.pend.key }) }); d = await res.json().catch(() => ({})); }
    catch (_) { toast("Internet bilan aloqa yoʻq — qayta bosing (ikki marta yozilmaydi)", 'error'); return; }
    if (!res.ok || d.ok === false) { toast(String(d.error || 'Yuborilmadi').replace(/^DEALER_PAY:\s*/, ''), 'error'); if (res.status < 500) DLPAY.pend = null; return; }
    DLPAY.pend = null;
    ME.debt_usd = d.dealerDebtUsd; ME.total_paid_usd = d.dealerTotalPaidUsd; if (d.rate) DLPAY.rate = d.rate;
    if (d.notice && !DLPAY.list.some(n => n.id === d.notice.id)) DLPAY.list.unshift(d.notice);
    toast(`✅ Yuborildi — qarzingiz ${fmtUsd(d.dealerDebtUsd)}. Kassir tasdiqlaydi`);
    dlRenderSummary();
  } finally { DLPAY.busy = false; if (ACTIVE_TAB === 'pay') dlRenderContent(); }
}

// ════════════════════════════════════════════
// v24.5 — DILLER: SOTUV (savatcha), OMBORIM (Baza uslubida), BUYURTMA (yangi + buyurtmalarim — bitta bo'lim)
// Egasi talabi: savatcha va buyurtmalar tarqoq bo'lmasin; «Qarzingiz» — faqat «To'lov»da.
// Savdo yozish qoidalari o'zgarmagan: har qator — record_dealer_sale (server qoldiq va −10% chegarani tekshiradi).
// ════════════════════════════════════════════
const DLC = { cart: {}, q: '', busy: false };      // sotuv savati: {pid: {qty, price}}
const DLO = { seg: 'new', q: '' };                  // buyurtma: 'new' | 'mine'
const DLS = { q: '', f: 'all' };                    // omborim filtri: 'all' | 'low' | kategoriya
const dlPriceOf = (pid) => { const r = STOCK.find(x => x.pid === pid), c = CATALOG.find(x => x.id === pid); return (c && +c.optim_price > 0) ? +c.optim_price : (+(r && r.avg_cost_usd) || 0); };
const dlCatOf = (pid) => (CATALOG.find(x => x.id === pid) || {}).cat || '';
const dlLowQty = 2;

// ── SOTUV ──
function dlSaleCartList() { return Object.entries(DLC.cart).map(([pid, v]) => ({ pid: Number(pid), ...v, r: STOCK.find(x => x.pid === Number(pid)) })).filter(x => x.r && x.qty > 0); }
function dlSaleTotals() { const l = dlSaleCartList(); return { lines: l.length, units: l.reduce((a, x) => a + x.qty, 0), total: Math.round(l.reduce((a, x) => a + x.qty * x.price, 0) * 100) / 100, pts: l.reduce((a, x) => a + dlCalcPoints(x.qty * x.price, (CATALOG.find(c => c.id === x.pid) || {}).point_pct || 0), 0) }; }
function dlSaleAdd(pid, d) {
  const r = STOCK.find(x => x.pid === pid); if (!r) return;
  const cur = DLC.cart[pid] || { qty: 0, price: dlPriceOf(pid) };
  const q = Math.max(0, Math.min(+r.qty || 0, cur.qty + d));
  if (cur.qty + d > (+r.qty || 0)) toast(`Omboringizda ${+r.qty || 0} dona bor`, 'warning');
  if (q > 0) DLC.cart[pid] = { ...cur, qty: q }; else delete DLC.cart[pid];
  if (document.getElementById('dlc-ov')) dlSaleCartPaint(); else dlRenderContent();
}
function dlSaleHtml() {
  if (!STOCK.length) return `<div class="dl-card"><div class="dls-empty">Omboringizda sotiladigan mahsulot yoʻq — «Buyurtma» boʻlimidan soʻrang</div></div>`;
  const q = (DLC.q || '').trim().toLowerCase();
  const rows = STOCK.filter(r => !q || ((r.sku || '') + ' ' + (r.name || '')).toLowerCase().includes(q));
  const t = dlSaleTotals();
  return `<div class="dls-search">🔎<input id="dlc-q" placeholder="Mahsulot yoki kod" value="${esc(DLC.q)}" oninput="DLC.q=this.value;dlSaleListPaint()" autocomplete="off" aria-label="Qidiruv">${fwScanMode() !== 'usb' ? `<button class="pos-scan" onclick="dlSaleScan()" aria-label="Kamera bilan skanerlash" title="Kamera bilan skanerlash">${PI.scan}</button>` : ''}</div>
    <div class="dls-list" id="dlc-list">${dlSaleRowsHtml(rows)}</div>
    <div class="pos-bar-wrap dl-barw">${t.lines ? `<button class="pos-bar" onclick="dlSaleCartOpen()"><em>${t.units} dona</em><b>${fmtUsd(t.total)}</b><span>Savat ›</span></button>` : ''}</div>`;
}
function dlSaleRowsHtml(rows) {
  return rows.length ? rows.map(r => { const c = DLC.cart[r.pid]; return `<div class="dls-row${c ? ' in' : ''}">
      ${dlThumbHtml(r.pid)}
      <div class="dls-t"><b>${esc(r.name || 'Mahsulot')}</b><small>${r.sku ? esc(r.sku) + ' · ' : ''}${fmtUsd(dlPriceOf(r.pid))} · omborda ${+r.qty || 0} dona</small></div>
      ${c ? `<span class="pos-step"><button onclick="dlSaleAdd(${r.pid},-1)" aria-label="Kamaytirish">−</button><b>${c.qty}</b><button onclick="dlSaleAdd(${r.pid},1)" aria-label="Koʻpaytirish">+</button></span>`
          : `<button class="pos-add" onclick="dlSaleAdd(${r.pid},1)" aria-label="Savatga qoʻshish">+</button>`}
    </div>`; }).join('') : `<div class="dls-empty">Topilmadi</div>`;
}
function dlSaleListPaint() {
  const q = (DLC.q || '').trim().toLowerCase();
  const el = document.getElementById('dlc-list'); if (el) el.innerHTML = dlSaleRowsHtml(STOCK.filter(r => !q || ((r.sku || '') + ' ' + (r.name || '')).toLowerCase().includes(q)));
}
function dlSaleCartOpen() {
  if (!dlSaleTotals().lines) return;
  let ov = document.getElementById('dlc-ov');
  if (!ov) { ov = document.createElement('div'); ov.id = 'dlc-ov'; ov.className = 'pos-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); document.body.appendChild(ov); }
  document.body.classList.add('pos-lock');
  if (typeof fwBackPush === 'function') fwBackPush('dlcart', _dlSaleCartCloseUi);
  dlSaleCartPaint();
}
function _dlSaleCartCloseUi() { document.getElementById('dlc-ov')?.remove(); document.body.classList.remove('pos-lock'); if (ACTIVE_TAB === 'sale') dlRenderContent(); }
function dlSaleCartClose() { _dlSaleCartCloseUi(); if (typeof fwBackDone === 'function') fwBackDone('dlcart'); }
function dlSaleCartPaint() {
  const ov = document.getElementById('dlc-ov'); if (!ov) return;
  const l = dlSaleCartList(), t = dlSaleTotals();
  if (!l.length) { dlSaleCartClose(); return; }
  ov.innerHTML = `<div class="pos-scr">
    <header class="pos-hd"><button class="pos-ib" onclick="dlSaleCartClose()" aria-label="Yopish">✕</button><div class="pos-hd-t"><b>Sotuv savati</b><small>${t.lines} pozitsiya · ${t.units} dona</small></div>
      <button class="pos-ib red" onclick="if(confirm('Savat tozalansinmi?')){DLC.cart={};dlSaleCartClose();}" aria-label="Savatni tozalash">🗑</button></header>
    <div class="pos-scr-b">
      <div class="pos-lines">${l.map(x => { const op = dlPriceOf(x.pid), low = op > 0 && x.price < op - 0.005, bad = op > 0 && x.price < dlFloor(op) - 0.005;
        return `<div class="pos-line${bad ? ' low' : ''}">
          <div class="pos-line-t"><b>${esc(x.r.name || 'Mahsulot')}</b><b>${fmtUsd(x.qty * x.price)}</b></div>
          <div class="pos-line-c">
            <span class="pos-step"><button onclick="dlSaleAdd(${x.pid},-1)" aria-label="Kamaytirish">−</button><b>${x.qty}</b><button onclick="dlSaleAdd(${x.pid},1)" aria-label="Koʻpaytirish">+</button></span>
            <label class="pos-in-wrap dlc-pr"><span>$</span><input class="pos-in" type="number" inputmode="decimal" step="0.01" min="0" value="${x.price.toFixed(2)}" onchange="dlSalePrice(${x.pid},this.value)" aria-label="Dona narxi"></label>
            <button class="pos-tag red" onclick="delete DLC.cart[${x.pid}];dlSaleCartPaint()" aria-label="Oʻchirish">✕</button>
          </div>
          <div class="pos-line-m${bad ? ' red' : ''}">Optom: ${fmtUsd(op)}${bad ? ` · eng kami ${fmtUsd(dlFloor(op))} (−10%)` : low ? ' · optomdan arzon — ziyon qilishingiz mumkin' : ''}</div>
        </div>`; }).join('')}</div>
      <div class="pos-total">${t.pts > 0 ? `<div><span>Ball</span><b>+${t.pts}</b></div>` : ''}<div class="big"><span>Jami</span><b>${fmtUsd(t.total)}</b></div></div>
      <div class="dls-hint">Sotuv summasi qarzingizga optom narxda yoziladi; yuqori sotsangiz, farq sizda qoladi.</div>
    </div>
    <div class="pos-foot fixed"><button class="pos-btn ok" id="dlc-go" onclick="dlSaleSubmit()" ${DLC.busy ? 'disabled' : ''}>Sotuvni tasdiqlash · ${fmtUsd(t.total)}</button></div>
  </div>`;
}
function dlSalePrice(pid, v) { const c = DLC.cart[pid]; if (!c) return; const n = Math.max(0, Math.round((parseFloat(v) || 0) * 100) / 100); c.price = n; dlSaleCartPaint(); }
async function dlSaleSubmit() {
  if (DLC.busy) return;
  const l = dlSaleCartList(); if (!l.length) return;
  for (const x of l) {
    const op = dlPriceOf(x.pid);
    if (x.qty > (+x.r.qty || 0)) { toast(`«${x.r.name}» — omborda ${x.r.qty} dona`, 'error'); return; }
    if (op > 0 && x.price < dlFloor(op) - 0.005) { toast(`⛔ «${x.r.name}» narxi juda past: eng kami ${fmtUsd(dlFloor(op))}`, 'error'); return; }
  }
  const cheap = l.filter(x => { const op = dlPriceOf(x.pid); return op > 0 && x.price < op - 0.005; });
  if (cheap.length) {
    const diff = cheap.reduce((a, x) => a + (dlPriceOf(x.pid) - x.price) * x.qty, 0);
    if (!confirm(`Optom narxidan jami ${fmtUsd(diff)} arzon sotyapsiz. Ziyon qilishingiz mumkin. Sotuvga rozimisiz?`)) return;
  }
  DLC.busy = true; const b = document.getElementById('dlc-go'); if (b) { b.disabled = true; b.textContent = 'Yuborilmoqda…'; }
  let done = 0, pts = 0, err = null;
  for (const x of l) {
    const cat = CATALOG.find(c => c.id === x.pid);
    const p = dlCalcPoints(x.qty * x.price, (cat && cat.point_pct) || 0);
    // v25 (42): qarzga olingan tovar sotilganda qarz qayta yozilmaydi — _v42 bo'lsa shu, bo'lmasa avvalgidek
    const args = { p_pid: x.pid, p_qty: x.qty, p_sell_usd: x.price, p_sku: x.r.sku, p_name: x.r.name, p_points: p, p_optim_price: dlPriceOf(x.pid) };
    let { error } = await db.rpc('record_dealer_sale_v42', args);
    if (error && (error.code === 'PGRST202' || error.code === '42883' || /record_dealer_sale_v42/.test(String(error.message || '')))) ({ error } = await db.rpc('record_dealer_sale', args));
    if (error) { err = `«${x.r.name}»: ${error.message || 'xato'}`; break; }
    delete DLC.cart[x.pid]; done++; pts += p;
  }
  DLC.busy = false;
  await dlRefreshData(); dlRenderSummary();
  if (err) { toast(`${done ? done + ' ta qator yozildi. ' : ''}⛔ ${err} — qolganlari savatda`, 'error'); dlSaleCartPaint(); return; }
  dlSaleCartClose();
  toast(pts > 0 ? `✅ Sotuv qayd etildi (${done} ta mahsulot) · 🏆 +${pts} ball` : `✅ Sotuv qayd etildi (${done} ta mahsulot)`);
}
// Eski «Sotdim» (bitta mahsulot oynasi) o'rniga — savatchaga qo'shib Sotuv bo'limiga o'tadi
function dlOpenSale(pid) { if (!DLC.cart[pid]) dlSaleAdd(pid, 1); dlSwitchTab('sale'); }

// ── OMBORIM (Baza uslubida) ──
function dlStockHtml() {
  const rows = STOCK.map(r => ({ r, price: dlPriceOf(r.pid), cat: dlCatOf(r.pid) }));
  if (!rows.length) return `<div class="dl-card"><div class="dls-empty">📦 Omboringizda hozircha mahsulot yoʻq</div></div>`;
  const totQty = rows.reduce((a, x) => a + (+x.r.qty || 0), 0), totVal = rows.reduce((a, x) => a + (+x.r.qty || 0) * x.price, 0);
  const low = rows.filter(x => (+x.r.qty || 0) <= dlLowQty).length;
  const cats = [...new Set(rows.map(x => x.cat).filter(Boolean))].sort();
  const chip = (k, l, n) => `<button class="pm-chip${DLS.f === k ? ' on' : ''}" onclick="DLS.f='${escJsAttr(k)}';dlRenderContent()">${esc(l)}${n != null ? `<em>${n}</em>` : ''}</button>`;
  return `<section class="pm-hero dlx-hero" aria-label="Omborim">
      <div class="dlx-hero-top"><span>Omborim qiymati (optom narxda)</span><b>${fmtUsd(totVal)}</b></div>
      <div class="dls-head"><div><b>${rows.length}</b><small>mahsulot</small></div><div><b>${totQty}</b><small>dona</small></div><div><b class="${low ? 'amb' : ''}">${low}</b><small>kam qolgan</small></div></div>
    </section>
    <button class="dl-rev-btn" onclick="dlSwitchTab('revision')">📋 Ombor reviziyasi — sanab solishtirish</button>
    <div class="dls-search">🔎<input id="dl-stock-q" placeholder="Mahsulot yoki kod" value="${esc(DLS.q)}" oninput="DLS.q=this.value;dlStockFilter()" autocomplete="off" aria-label="Qidiruv"></div>
    <div class="pm-chips">${chip('all', 'Hammasi', rows.length)}${chip('low', 'Kam qoldi', low)}${cats.map(c => chip(c, c, rows.filter(x => x.cat === c).length)).join('')}</div>
    <div class="dls-list" id="dl-stock-list">${rows.map(({ r, price, cat }) => `
      <div class="dls-row" data-q="${esc(((r.sku || '') + ' ' + (r.name || '')).toLowerCase())}" data-cat="${esc(cat)}" data-low="${(+r.qty || 0) <= dlLowQty ? 1 : 0}">
        ${dlThumbHtml(r.pid)}
        <div class="dls-t"><b>${esc(r.name || 'Mahsulot')}</b><small>${r.sku ? esc(r.sku) + ' · ' : ''}${fmtUsd(price)}/dona · jami ${fmtUsd(price * (+r.qty || 0))}</small></div>
        <span class="dls-q${(+r.qty || 0) <= dlLowQty ? ' low' : ''}">${+r.qty || 0} dona</span>
        <button class="dls-sell" onclick="dlOpenSale(${r.pid})">Sotish</button>
      </div>`).join('')}</div>
    <div class="dls-empty" id="dl-stock-none" hidden>Topilmadi</div>`;
}
function dlStockFilter() {
  const q = (DLS.q || '').trim().toLowerCase(); let n = 0;
  document.querySelectorAll('#dl-stock-list .dls-row').forEach(el => {
    const on = (!q || el.dataset.q.includes(q)) && (DLS.f === 'all' || (DLS.f === 'low' ? el.dataset.low === '1' : el.dataset.cat === DLS.f));
    el.hidden = !on; if (on) n++;
  });
  const e = document.getElementById('dl-stock-none'); if (e) e.hidden = n > 0;
}

// ── BUYURTMA: yangi buyurtma va buyurtmalarim — bitta bo'lim ──
function dlOrderTabHtml() {
  const pend = MY_ORDERS.filter(o => o.status === 'pending').length;
  return `<span class="pos-seg wide dlx-seg" role="tablist">
      <button class="${DLO.seg === 'new' ? 'on' : ''}" onclick="DLO.seg='new';dlRenderContent()">Yangi buyurtma</button>
      <button class="${DLO.seg === 'mine' ? 'on' : ''}" onclick="DLO.seg='mine';dlRenderContent()">Buyurtmalarim${pend ? ` (${pend})` : ''}</button></span>
    ${DLO.seg === 'mine' ? dlMyOrdersHtml() : dlOrderHtml()}`;
}

function dlHistoryHtml() {
  return `<div id="dlp-stats" class="fws-wrap">${dlpStatsHtml()}</div>
    <div class="dl-card">
      ${SALES.length ? SALES.slice(0, 100).map(s=>`
        <div class="dl-prow">
          <div>
            <div class="dl-pname">${esc(s.name||'Mahsulot')} ×${s.qty}</div>
            <div class="dl-pmeta">${fmtD(s.sale_date)}</div>
          </div>
          <div class="dl-qty">${fmtUsd(s.total_usd)}</div>
        </div>`).join('') : `<div style="text-align:center;padding:24px;color:var(--text-muted)">
          <div style="font-size:32px;margin-bottom:6px">🕒</div>Hali savdo kiritilmagan</div>`}
    </div>`;
}

// ── 📈 MENING STATISTIKAM (2026-10-01) — davr bo'yicha sotuvlarim, eng yaxshi va
// omborimda turib qolgan mahsulotlar. Faqat O'QIYDI (SALES, STOCK, CATALOG).
const DLP = { per:'month', prod:'top' };
function dlpStatsHtml() {
  const P = fwPeriod(DLP.per);
  const cur = SALES.filter(r => fwIn(r.sale_date, P.a, P.b)), prev = SALES.filter(r => fwIn(r.sale_date, P.pa, P.pb));
  const sum = (a, f) => a.reduce((t, x) => t + (+x[f] || 0), 0);
  const rev = sum(cur, 'total_usd'), units = sum(cur, 'qty');
  const days = new Set(cur.map(r => String(r.sale_date).slice(0,10))).size;
  const priceOf = r => { const o = CATALOG.find(x => x.id === r.pid)?.optim_price; return (o != null && o > 0) ? o : (+r.avg_cost_usd || 0); };
  const sold = new Set(cur.map(r => String(r.pid)));
  const unsold = STOCK.filter(r => (+r.qty||0) > 0 && !sold.has(String(r.pid))).map(r => ({ pid:r.pid, name:r.name || 'Mahsulot', sku:r.sku, qty:+r.qty||0, val:(+r.qty||0) * priceOf(r) }));
  const debt = +ME.debt_usd || 0;
  return `
    <div class="fws-head" style="margin:0"><b>📈 Mening statistikam</b><i></i><span class="fws-pill" style="--c:var(--sky)">${fwRangeLabel(P)}</span></div>
    ${fwTabsHtml(DLP.per, 'dlpSetPer')}
    ${fwKpisHtml([
      { l:'Sotuvim', v:fwUsd(rev), c:'emerald', trend:fwTrendHtml(rev, sum(prev, 'total_usd')) },
      { l:'Sotilgan', v:fwNum(units) + ' dona', c:'sky', trend:fwTrendHtml(units, sum(prev, 'qty')) },
      { l:'Savdo kunlari', v:fwNum(days), c:'purple', sub:`kuniga o'rtacha ${fwUsd(days ? rev / days : 0)}` },
      { l:'Qarzim', v: debt > 0 ? fwUsd(debt) : "Yo'q", c: debt > 0 ? 'red' : 'emerald', sub:`ball: ${fwNum(ME.points||0)}` },
    ])}
    <div class="fws-grid">
      ${fwRankCardHtml({ mode: DLP.prod, fn:'dlpSetProd', range: fwRangeLabel(P), imgOf: dlImgOf, sold: cur.map(r => ({ pid:r.pid, name:r.name, sku:r.sku, qty:+r.qty||0, v:+r.total_usd||0, profit:0 })),
        unsold, unsoldLabel:'Turib qolgan', unsoldMoney:true, unsoldWhere:'omborimda', unsoldEmpty:"Omboringizdagi hamma mahsulot bu davrda sotilgan 👍",
        unsoldNote:"Bu mahsulotlar bu davrda sotilmagan — narx yoki joylashuvni ko'rib chiqing." })}
      ${fwCardHtml('Dinamika', fwBarsHtml(fwSeries(cur, r => r.sale_date, r => r.total_usd, P, r => r.created_at), { c:'emerald', titleOf: fwPointTitle }), `<span class="fws-pill" style="--c:var(--emerald)">${fwUsd(rev)}</span>`)}
    </div>`;
}
function dlpRerender() { const el = document.getElementById('dlp-stats'); if (el) el.innerHTML = dlpStatsHtml(); }
function dlpSetPer(p) { DLP.per = p; dlpRerender(); }
function dlpSetProd(m) { DLP.prod = m; dlpRerender(); }

// ── BUYURTMA BERISH — asosiy ombordan so'rash, admin tasdiqlashi kerak ──
function dlOrderHtml() {
  const cartCount = Object.values(ORDER_CART).filter(q=>q>0).length;
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:2px 2px 8px">
      <div style="font-size:11.5px;color:var(--text-muted)">
        Kerakli mahsulot va miqdorni tanlang — buyurtmangiz administratorga yuboriladi, u tasdiqlagach omboringizga tushadi.
      </div>
      <button onclick="dlRefreshCatalog()" style="background:none;border:none;color:var(--blue);font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;margin-left:8px">🔄 Yangilash</button>
    </div>
    <div class="dl-card" style="margin-bottom:12px">
      <input class="dl-input" id="dl-order-search" placeholder="🔍 Mahsulot qidirish (bo'sh qoldirsangiz — hammasi ko'rinadi)" oninput="dlRenderOrderList()" style="margin-bottom:0">
    </div>
    <div class="dl-card" id="dl-order-list" style="margin-bottom:12px;max-height:420px;overflow-y:auto"></div>
    ${cartCount ? `<div class="pos-bar-wrap dl-barw"><button class="pos-bar" onclick="dlSubmitOrder()"><em>${cartCount} xil</em><b>${Object.values(ORDER_CART).reduce((a, q) => a + q, 0)} dona</b><span>Buyurtmani yuborish ›</span></button></div>` : ''}
  `;
}

async function dlRefreshCatalog() {
  toast('Yangilanmoqda...');
  await dlRefreshData();
  dlRenderOrderList();
  toast(CATALOG.length ? `✅ ${CATALOG.length} ta mahsulot yuklandi` : '⚠️ Asosiy omborda hozircha mahsulot yo\'q');
}

// Katalogdagi mahsulot rasmi (catalog_products.image) — faqat xavfsiz havola, aks holda ''
function dlImgOf(pid) { const c = CATALOG.find(x => x.id === pid); return fwImgSafe(c && c.image); }
function dlThumbHtml(pid) {
  const u = dlImgOf(pid);
  return `<div class="dl-pthumb">${u ? `<img src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">` : '📦'}</div>`;
}

function dlRenderOrderList() {
  const q = (document.getElementById('dl-order-search')?.value || '').toLowerCase();
  const list = document.getElementById('dl-order-list');
  if (!list) return;
  const filtered = q ? multiFieldSearch(CATALOG, q, p=>[p.name, p.sku, p.brand, p.cat]) : CATALOG;
  list.innerHTML = filtered.length ? filtered.slice(0, 60).map(p => {
    const qty = ORDER_CART[p.id] || 0;
    return `<div class="dl-prow">
      <div style="display:flex;align-items:center;gap:10px;min-width:0">${dlThumbHtml(p.id)}<div style="min-width:0">
        <div class="dl-pname">${p.sku?`<code style="color:var(--gold)">${esc(p.sku)}</code> `:''}${esc(p.name)}</div>
        <div class="dl-pmeta">Omborda: ${p.qty} dona</div>
      </div></div>
      <div style="display:flex;align-items:center;gap:8px">
        ${qty ? `<span class="pos-step"><button onclick="dlCartAdjust(${p.id},-1,${p.qty})" aria-label="Kamaytirish">−</button><b>${qty}</b><button onclick="dlCartAdjust(${p.id},1,${p.qty})" aria-label="Koʻpaytirish">+</button></span>`
              : `<button class="pos-add" onclick="dlCartAdjust(${p.id},1,${p.qty})" aria-label="Buyurtmaga qoʻshish">+</button>`}
      </div>
    </div>`;
  }).join('') : (CATALOG.length===0
      ? `<div style="text-align:center;padding:24px;color:var(--text-muted)">
          <div style="font-size:32px;margin-bottom:6px">📭</div>
          Asosiy ombor katalogi hali yuklanmagan.<br>Yuqoridagi "🔄 Yangilash" tugmasini bosing.
        </div>`
      : `<div style="text-align:center;padding:20px;color:var(--text-muted)">Qidiruv bo'yicha mahsulot topilmadi</div>`);
}

function dlCartAdjust(pid, delta, maxQty) {
  const cur = ORDER_CART[pid] || 0;
  const next = Math.max(0, Math.min(maxQty, cur + delta));
  if (next > 0) ORDER_CART[pid] = next; else delete ORDER_CART[pid];
  const searchVal = document.getElementById('dl-order-search')?.value || '';
  document.getElementById('dl-content').innerHTML = dlOrderTabHtml();
  const input = document.getElementById('dl-order-search');
  if (input) input.value = searchVal;
  dlRenderOrderList();
}

async function dlSubmitOrder() {
  const items = Object.entries(ORDER_CART)
    .filter(([,q]) => q > 0)
    .map(([pid, qty]) => {
      const p = CATALOG.find(x => x.id === parseInt(pid));
      return { pid: parseInt(pid), sku: p?.sku||'', name: p?.name||'', qty };
    });
  if (!items.length) { toast('Kamida bitta mahsulot tanlang!', 'error'); return; }

  try {
    const { error } = await db.from('dealer_orders').insert({ dealer_id: ME.id, items, status:'pending' });
    if (error) throw error;
    ORDER_CART = {};
    toast('✅ Buyurtma yuborildi — administrator tasdiqlashini kuting!');
    await dlRefreshData();
    DLO.seg = 'mine'; dlSwitchTab('order');
  } catch(e) { toast(e.message || 'Xatolik yuz berdi', 'error'); }
}

function dlMyOrdersHtml() {
  return `<div class="dl-card">
    ${MY_ORDERS.length ? MY_ORDERS.map(o => {
      const badge = o.status==='pending' ? ['⏳ Kutilmoqda','var(--gold-dark)','rgba(194,65,12,.12)']
        : o.status==='approved' ? ['✅ Tasdiqlangan','var(--emerald)','rgba(14,168,118,.12)']
        : ['❌ Rad etilgan','var(--red)','rgba(226,61,61,.12)'];
      return `<div style="padding:12px 0;border-bottom:1px solid var(--border-light)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span class="dl-pmeta">${new Date(o.created_at).toLocaleString('uz-UZ')}</span>
          <span style="background:${badge[2]};color:${badge[1]};padding:2px 9px;border-radius:14px;font-size:10.5px;font-weight:700">${badge[0]}</span>
        </div>
        ${(o.items||[]).map(i=>`<div class="dl-pmeta" style="padding:1px 0">${esc(i.name)} ×${i.qty}</div>`).join('')}
      </div>`;
    }).join('') : `<div style="text-align:center;padding:24px;color:var(--text-muted)">
      <div style="font-size:32px;margin-bottom:6px">📋</div>Hali buyurtma yubormagansiz</div>`}
  </div>`;
}

function dlCalcPoints(lineTotalUsd, pointPct) {
  if (!pointPct || POINT_SETTINGS.usdValue<=0) return 0;
  const raw = (lineTotalUsd * pointPct / 100) / POINT_SETTINGS.usdValue;
  return Math.round(raw/POINT_SETTINGS.roundStep)*POINT_SETTINGS.roundStep;
}

// v24: diller chegirmasi chegarasi — joriy optom narxining 90% (yaxlitlash serverdagi bilan bir xil: sentgacha)
function dlFloor(optim) { return Math.round((+optim || 0) * 0.9 * 100) / 100; }

// ════════════════════════════════════════════
// 🔔 BILDIRISHNOMALAR (v24, server: notifications) — 7 kun; eskilari arxivda
// ════════════════════════════════════════════
const DLNTF = { items: [], archive: [], unread: 0, scope: 'active', err: '', off: false };
async function dlNtfCall(payload) {
  const res = await authFetch('/.netlify/functions/notifications', { method: 'POST', body: JSON.stringify(payload) });
  const d = await res.json().catch(() => ({}));
  if (res.status === 409 && d.migration31Pending) { DLNTF.off = true; return null; }
  if (!res.ok) throw new Error(d.error || 'Yuklanmadi');
  DLNTF.off = false; return d;
}
function dlBellBadge() { const b = document.getElementById('dl-bell-n'); if (b) { b.textContent = DLNTF.unread > 99 ? '99+' : String(DLNTF.unread); b.hidden = !DLNTF.unread; } }
async function dlNotifLoad() {
  try {
    const d = await dlNtfCall({ action: 'dealer_list', scope: 'active' });
    if (d) { DLNTF.items = d.items || []; DLNTF.unread = +d.unread || 0; DLNTF.err = ''; }
  } catch (e) { DLNTF.err = e.message; }
  dlBellBadge();
  if (ACTIVE_TAB === 'notif') dlRenderContent();
}
async function dlNotifOpen(scope) {
  DLNTF.scope = scope || 'active';
  ACTIVE_TAB = 'notif';
  ['stock','pay','order','myorders','history'].forEach(t => document.getElementById('tab-'+t)?.classList.remove('active'));
  dlRenderContent();
  try {
    if (DLNTF.scope === 'archive') { const d = await dlNtfCall({ action: 'dealer_list', scope: 'archive' }); if (d) DLNTF.archive = d.items || []; }
    else {
      await dlNotifLoad();
      const ids = DLNTF.items.filter(n => !n.read).map(n => n.id);
      if (ids.length) { await dlNtfCall({ action: 'dealer_read', ids }); DLNTF.unread = 0; dlBellBadge(); }
    }
  } catch (e) { DLNTF.err = e.message; }
  if (ACTIVE_TAB === 'notif') dlRenderContent();
}
function dlNotifHtml() {
  const list = DLNTF.scope === 'archive' ? DLNTF.archive : DLNTF.items;
  return `<div class="dl-card">
    <div class="dl-ntf-seg"><button class="${DLNTF.scope==='active'?'on':''}" onclick="dlNotifOpen('active')">Oxirgi 7 kun</button><button class="${DLNTF.scope==='archive'?'on':''}" onclick="dlNotifOpen('archive')">Arxiv</button></div>
    ${DLNTF.off ? '<div class="dls-empty">Bildirishnomalar hali yoqilmagan (administrator)</div>' : DLNTF.err ? `<div style="color:var(--red);font-size:12px">${esc(DLNTF.err)}</div>` : ''}
    ${list.length ? list.map(n => `<div class="ntf-it ${n.read ? '' : 'new'}"><div class="ntf-b"><b>${esc(n.title)}</b>${n.body ? `<p>${esc(n.body)}</p>` : ''}<small>${esc(new Date(n.createdAt).toLocaleString('uz-UZ', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }))}</small></div></div>`).join('')
      : DLNTF.off ? '' : '<div class="dls-empty">Bildirishnoma yoʻq</div>'}
  </div>`;
}

// ════════════════════════════════════════════
// 📋 OMBOR REVIZIYASI (v24, server: notifications → rev_summary / rev_submit)
// Har mahsulot: qabul qilingan, sotilgan, qaytarilgan va tizimdagi qoldiq (SERVER hisoblaydi) — jismoniy sanoq bilan
// solishtiriladi. Kamomad sotuvga, ortiqcha qaytarishga AVTOMATIK aylanmaydi: natija, kim, qachon, sabab — auditga va
// administratorga yuboriladi; qoldiqni administrator tekshirib tuzatadi.
// ════════════════════════════════════════════
const DLREV = { items: [], counts: {}, loaded: false, loading: false, err: '', busy: false, key: null, last: null };
async function dlRevLoad() {
  DLREV.loading = true; DLREV.err = '';
  try {
    const d = await dlNtfCall({ action: 'rev_summary' });
    if (d) { DLREV.items = d.items || []; DLREV.loaded = true; }
  } catch (e) { DLREV.err = e.message; }
  DLREV.loading = false;
  if (ACTIVE_TAB === 'revision') dlRenderContent();
}
function dlRevSet(pid, v) {
  const n = String(v).trim() === '' ? null : Number(String(v).replace(',', '.'));
  if (n == null || !(n >= 0)) delete DLREV.counts[pid]; else DLREV.counts[pid] = n;
  DLREV.key = null;   // sanoq o'zgardi — yangi amal kaliti
  const it = DLREV.items.find(x => x.pid === pid), el = document.getElementById('dlrev-d-' + pid);
  if (el && it) { const c = DLREV.counts[pid]; const d = c == null ? null : Math.round((c - it.system) * 1000) / 1000; el.textContent = d == null ? '—' : (d > 0 ? '+' : '') + d; el.className = 'dlrev-d' + (d == null || d === 0 ? '' : d < 0 ? ' minus' : ' plus'); }
}
function dlRevHtml() {
  if (DLNTF.off) return `<div class="dl-card"><div class="dls-empty">Reviziya uchun 31-migratsiya qoʻllanishi kerak (administrator)</div></div>`;
  if (DLREV.loading && !DLREV.loaded) return `<div class="dl-card"><div class="dls-empty">Yuklanmoqda…</div></div>`;
  return `<div class="dl-card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b>📋 Ombor reviziyasi</b><button class="btn btn-ghost btn-sm" onclick="dlSwitchTab('stock')">‹ Omborim</button></div>
    <p class="dls-hint">Har mahsulotni sanab, haqiqiy sonini yozing. Natija administratorga boradi: u tasdiqlasa kamomad — sotuv (qarzingizga optom narxda), ortiqcha — qaytish (qarzingizdan ayiriladi). Tasdiqgacha qoldiq va qarz oʻzgarmaydi.</p>
    ${DLREV.err ? `<div style="color:var(--red);font-size:12px">${esc(DLREV.err)}</div>` : ''}
    <div class="dlrev-t"><div class="dlrev-h"><span>Mahsulot</span><span>Kirim</span><span>Sotildi</span><span>Qaytdi</span><span>Tizim</span><span>Sanaldi</span><span>Farq</span></div>
    ${DLREV.items.map(it => { const c = DLREV.counts[it.pid]; const d = c == null ? null : Math.round((c - it.system) * 1000) / 1000;
      return `<div class="dlrev-r"><span class="dlrev-n"><b>${esc(it.name || '#' + it.pid)}</b>${it.sku ? `<small>${esc(it.sku)}</small>` : ''}</span>
        <span data-l="Kirim">${it.received}</span><span data-l="Sotildi">${it.sold}</span><span data-l="Qaytdi">${it.returned}</span><span data-l="Tizim"><b>${it.system}</b></span>
        <span data-l="Sanaldi"><input class="dl-input dlrev-in" type="number" min="0" step="1" inputmode="numeric" value="${c ?? ''}" placeholder="?" oninput="dlRevSet(${it.pid}, this.value)" aria-label="${esc(it.name || '')} — sanalgan soni"></span>
        <span data-l="Farq" id="dlrev-d-${it.pid}" class="dlrev-d${d == null || d === 0 ? '' : d < 0 ? ' minus' : ' plus'}">${d == null ? '—' : (d > 0 ? '+' : '') + d}</span></div>`; }).join('') || '<div class="dls-empty">Omboringizda mahsulot yoʻq</div>'}</div>
    <label class="dls-l" for="dlrev-reason">Izoh / sabab</label>
    <textarea class="dl-input" id="dlrev-reason" maxlength="500" rows="2" placeholder="Masalan: 2 dona shikastlangan, omborda alohida turibdi"></textarea>
    <button class="dl-btn" id="dlrev-send" onclick="dlRevSubmit()" ${DLREV.busy ? 'disabled' : ''}>Reviziyani yuborish</button>
    ${DLREV.last ? `<div class="dls-hint" style="margin-top:8px">✅ Yuborildi: kamomad ${DLREV.last.shortageQty} dona, ortiqcha ${DLREV.last.surplusQty} dona.</div>` : ''}
  </div>`;
}
async function dlRevSubmit() {
  if (DLREV.busy) return;
  const lines = Object.entries(DLREV.counts).map(([pid, counted]) => ({ pid: Number(pid), counted }));
  if (!lines.length) { toast('Kamida bitta mahsulot sonini kiriting', 'error'); return; }
  const reason = (document.getElementById('dlrev-reason')?.value || '').trim();
  if (!DLREV.key) DLREV.key = 'rv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  DLREV.busy = true; const b = document.getElementById('dlrev-send'); if (b) { b.disabled = true; b.textContent = 'Yuborilmoqda…'; }
  try {
    const d = await dlNtfCall({ action: 'rev_submit', lines, reason, idemKey: DLREV.key });
    if (!d) { toast('Reviziya uchun 31-migratsiya kerak', 'error'); return; }
    DLREV.last = d.result; DLREV.counts = {}; DLREV.key = null;
    toast(d.replay ? 'Bu reviziya avval yuborilgan' : d.approvable ? '✅ Reviziya administratorga yuborildi — tasdiqlangach qoldiq va qarz yangilanadi' : '✅ Reviziya administratorga yuborildi');
  } catch (e) { toast('⛔ ' + e.message, 'error'); }
  finally { DLREV.busy = false; if (ACTIVE_TAB === 'revision') dlRenderContent(); }
}

function dlFilialLabel() { const f = String(ME && ME.filial || 'baza'); return f === 'baza' ? 'Baza' : f === 'f729' ? '729-filial' : f.replace(/^f/, '') + '-filial'; }
function fwNumSafe(n) { return (+n || 0).toLocaleString('en-US').replace(/,/g, ' '); }
// v24.5: sozlamalar — faqat shaxsiy (mavzu, matn o'lchami, skaner, parol)
function dlOpenSettings() {
  const stockV = STOCK.reduce((s, r) => s + (+r.qty || 0) * dlPriceOf(r.pid), 0), stockN = STOCK.reduce((s, r) => s + (+r.qty || 0), 0);
  ptSettingsOpen({ who: ME.name, role: 'Diller' + (ME.region ? ' · ' + ME.region : ''), filial: dlFilialLabel(),
    stats: [['Qarzim', (+ME.debt_usd || 0) > 0 ? 'toʻlanishi kerak' : 'qarz yoʻq', fmtUsd(+ME.debt_usd || 0)], ['Omborim', fwNumSafe(stockN) + ' dona', fmtUsd(stockV)]],
    password: async (pw) => { const { error } = await db.auth.updateUser({ password: pw }); if (error) throw new Error(error.message || 'Parol oʻzgarmadi'); },
    onLogout: dlLogout });
}
async function dlLogout() {
  if (typeof fwLogoutFlow === 'function') { const nm = ME && ME.name; ME = null; return fwLogoutFlow(db, nm); }
  await db.auth.signOut();
  ME = null; STOCK = []; SALES = [];
  dlShowLogin();
}

// Ilova ochilganda — avvaldan kirgan bo'lsa, avtomatik davom etadi
(async function dlBoot() {
  const { data: { session } } = await db.auth.getSession();
  if (session) { await dlLoadMe(); }
  else { dlShowLogin(); }
})();
