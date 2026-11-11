// ════════════════════════════════════════════
// SOTUVCHI PORTAL — telefon uchun yengil savdo/qarz interfeysi
// Umumiy do'kon ma'lumotlari (mahsulot/mijoz/kassa) bilan ishlaydi —
// dillerdan farqli, bu yerda RLS izolyatsiyasi yo'q, faqat kirish nazorati.
// ════════════════════════════════════════════

// Loyiha sozlamalari js/config.js'dan olinadi (noldan o'rnatishda `npm run setup` yozadi);
// fayl bo'lmasa — hozirgi production qiymatlari ishlatiladi.
const FW_CFG = (typeof window !== 'undefined' && window.FW_CONFIG) || {};
const SUPABASE_URL      = FW_CFG.SUPABASE_URL || 'https://dzzxrxudsejhdrbpiifc.supabase.co';
const SUPABASE_ANON_KEY = FW_CFG.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6enhyeHVkc2VqaGRyYnBpaWZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMzYxNjUsImV4cCI6MjEwMTgxMjE2NX0.twdMwAU_asDmzIZ1Y6halfSaB6YaFxmEBfRSWPKDdfI';
const STAFF_EMAIL_DOMAIN = 'staff.biznespro.local';

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
  const res = await fetch(url, { ...options, headers: hdrs });
  if (res.status === 403 && typeof fwPwForceOn403 === 'function') fwPwForceOn403(res);   // v24.9: admin parolni tiklagan — yangi parol
  return res;
}

let ME = null;          // {id, name, role, ...} — staff jadvalidan
let S = null;           // umumiy do'kon ma'lumotlari bloki (app_data)
let CART = [];           // joriy savdo savati
let SALE_CUST_ID = null;
// v24.5: to'lov turi, chegirma, rejim (Chakana/Optom), valyuta — js/pos.js (POS)
let ACTIVE_TAB = 'home';   // v24.7: admin panel kabi — Bosh sahifadan ochiladi (savdo — pastdagi QR tugmasi, bir bosish)
let SV_ORDERS_LOADED = false;

const CUR = {
  usdUzs: 12800,
  toUsd(uzs) { return uzs / this.usdUzs; },
  toUzs(usd) { return usd * this.usdUzs; },
  fmtUsd(n) { const v=(+(n||0)).toFixed(2); const [i,d]=v.split('.'); return '$'+i.replace(/\B(?=(\d{3})+(?!\d))/g,' ')+'.'+d; },
  fmtUzs(n) { return (+(n||0)).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,' ') + " so'm"; }
};

// uid, td, parseAmt, liveFormatSpaces, deductFIFO, logCashTxn — endi js/shared.js'da (barcha ilovalarda umumiy)
const fmtD = d => new Date(d).toLocaleDateString('uz-UZ');

function modal(html) {
  const ov = document.getElementById('modal-ov');
  if (!ov) return;
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  if (typeof fwModalDecorate === 'function') fwModalDecorate(ov);
  ov.classList.add('open');
  fwBackPush('modal', () => { const o = document.getElementById('modal-ov'); if (o) o.classList.remove('open'); });   // v24: «Orqaga»
}
function closeModal() {
  const ov = document.getElementById('modal-ov');
  if (ov) ov.classList.remove('open');
  fwBackDone('modal');
}

function toast(msg, type='success') {
  const el = document.createElement('div');
  el.textContent = msg;
  el.textContent = String(msg ?? '').replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '');
  el.style.cssText = `background:${type==='error'?'#e23d3d':type==='warning'?'#d97706':'#0ea876'};color:#fff;padding:12px 18px;border-radius:10px;
    margin-top:8px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.18);animation:svIn .2s ease`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(()=>el.remove(), 3200);
}
const styleTag = document.createElement('style');
styleTag.textContent = `#toasts{position:fixed;bottom:16px;right:16px;left:16px;display:flex;flex-direction:column;align-items:flex-end;z-index:9999}
@media (max-width:1024px){#toasts{bottom:calc(96px + env(safe-area-inset-bottom));align-items:stretch}}
@keyframes svIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`;
document.head.appendChild(styleTag);

function svTogglePw(btn) { fwPwPeek('sv-login-pw', btn); }   // v24.9: 3 soniyadan keyin o'zi yashirinadi

// ── LOGIN ──
async function svDoLogin() {
  const loginVal = document.getElementById('sv-login-id').value.trim();
  const pw = document.getElementById('sv-login-pw').value;
  const errEl = document.getElementById('sv-login-err');
  const btn = document.getElementById('sv-login-btn');
  errEl.textContent = '';
  if (!loginVal || !pw) { errEl.textContent = "Login va parolni kiriting"; return; }

  btn.disabled = true; btn.textContent = 'Kirilmoqda...';
  const { error } = await fwStaffLogin(db, loginVal, pw, 'staff');   // v24.9: server orqali — noto'g'ri urinishlar sanaladi
  btn.disabled = false; btn.textContent = 'Kirish →';

  if (error) {
    errEl.textContent = error.status ? error.message : "Login yoki parol noto'g'ri";
    const box = document.querySelector('.dl-login-box');
    box.classList.add('shake'); setTimeout(()=>box.classList.remove('shake'), 450);
    return;
  }
  await svLoadMe();
}

// v25: oflayn — oxirgi muvaffaqiyatli kirgan xodim va do'kon ma'lumoti qurilmada (internet yo'q paytda ilova ochiladi)
function _svMeCache() { try { return JSON.parse(localStorage.getItem('sv_me_v1') || 'null'); } catch (_) { return null; } }
function _svOffline() { return typeof navigator !== 'undefined' && navigator.onLine === false; }
async function svLoadMe() {
  const { data: { session } } = await db.auth.getSession();
  const meCache = _svMeCache();
  if (!session && !(_svOffline() && meCache && meCache.staff)) { svShowLogin(); return; }

  // staff jadvaliga endi brauzerdan to'g'ridan-to'g'ri kirish yo'q — server token'ni tasdiqlab, staff qatorini qaytaradi
  let staff = null;
  // v24.6 (tez kirish): asosiy kirish oynasi tasdiqlagan xodim (shu tab, 2 daqiqa, aynan shu foydalanuvchi) — whoami takrorlanmaydi
  try {
    const c = JSON.parse(sessionStorage.getItem('fw_fast_staff') || 'null');
    sessionStorage.removeItem('fw_fast_staff');
    if (c && c.staff && c.uid === session.user?.id && Date.now() - (c.t || 0) < 120000) staff = c.staff;
  } catch (_) {}
  let offlineMe = false;
  if (!staff) try {
    if (_svOffline()) throw new TypeError('Failed to fetch (oflayn)');
    const res = await authFetch('/.netlify/functions/staff-whoami', { method:'POST' });
    const data = await res.json();
    if (res.ok) staff = data.staff;
    if (res.ok && staff && data.mustChangePw) await fwPwForce(staff.name);   // v24.9 (38): admin parolni tiklagan
  } catch(e) {
    console.warn('staff-whoami xatosi:', e);
    // v25: internet yo'q — shu qurilmada oxirgi kirgan xodim (hisobdan chiqarilmaydi)
    if (fwIsNetErr(e) && meCache && meCache.staff && (!session || meCache.uid === session.user?.id)) { staff = meCache.staff; offlineMe = true; }
  }

  if (!staff) {
    document.getElementById('sv-login-err').textContent = "Hisobingiz topilmadi. Administratorga murojaat qiling.";
    await db.auth.signOut();
    svShowLogin();
    return;
  }
  ME = staff;
  // v24: o'z ruxsatlari (Direct Sale va h.k.) — server baribir har amalda qayta tekshiradi
  ME.perms = new Set();
  // v24.6 (tez kirish): ruxsatlar va do'kon ma'lumoti PARALLEL (avval ketma-ket)
  const _saveMe = () => { try { localStorage.setItem('sv_me_v1', JSON.stringify({ uid: session ? session.user?.id : (meCache && meCache.uid), staff, perms: [...ME.perms], roleNames: ME.roleNames || [] })); } catch (_) {} };
  const permP = (offlineMe || _svOffline())
    ? Promise.resolve().then(() => { if (meCache && meCache.staff && meCache.staff.id === staff.id) { ME.perms = new Set(meCache.perms || []); ME.roleNames = meCache.roleNames || []; } })
    : authFetch('/.netlify/functions/rbac-user-permissions', { method:'POST', body: JSON.stringify({ staffId: staff.id }) })
    .then(async pr => { const pd = await pr.json().catch(()=>({})); if (pr.ok) { ME.perms = new Set(pd.permKeys || []); ME.roleNames = (pd.roles || []).map(r => r && r.name).filter(Boolean); _saveMe(); } })
    .catch(e => { console.warn('Ruxsatlar yuklanmadi:', e && e.message); if (meCache && meCache.staff && meCache.staff.id === staff.id) { ME.perms = new Set(meCache.perms || []); ME.roleNames = meCache.roleNames || []; } });
  await Promise.all([permP, svLoadShopData()]);
  svShowApp();
}

const SV_BRANCH_KEYS = ['batches','batchCounter','sales','customers','suppliers','expenses','dailyClosings','revisions','cashTxns','cashboxes','salaryPeople','branchSettings'];
let SV_BRANCH = 'baza'; // joriy xodimning filiali (ME.filial)
let SV_BASE = null;    // v10 (B1): oxirgi yuklash/saqlashdagi "yugurib turuvchi" raqamlar (delta-birlashtirish uchun)

async function svLoadShopData() {
  // 1.4.5-QADAM: avval yangi, autentifikatsiya + filial-chegarasi bilan
  // himoyalangan Function orqali urinamiz. Muvaffaqiyatsiz bo'lsa — eski,
  // to'g'ridan-to'g'ri yo'lga qaytamiz (orqaga moslik).
  let raw = {}, loaded = false;
  const _dataKey = 'sv_data_v1_' + (ME && ME.id != null ? ME.id : 'x');
  if (_svOffline()) {
    try { const c = JSON.parse(localStorage.getItem(_dataKey) || 'null'); if (c && c.raw) { raw = c.raw; FWL.on = !!c.ledger; loaded = true; } } catch (_) {}
  }
  if (!loaded) try {
    const res = await authFetch('/.netlify/functions/app-data-load', { method:'POST' });
    if (res.ok) {
      const result = await res.json();
      raw = result.data || {};
      FWL.on = !!result.ledgerAuthority;   // v23.2 (F4b): qarz va ombor qoldig'i — server haqiqiy manba
      try { localStorage.setItem(_dataKey, JSON.stringify({ raw, ledger: FWL.on, t: Date.now() })); } catch (_) {}   // v25: oflayn uchun
    } else {
      console.warn(`app-data-load Function xato qaytardi (${res.status}) — eski yo'lga o'tildi`);
      const { data: row } = await db.from('app_data').select('data').eq('id','main').maybeSingle();
      raw = row?.data || {};
    }
  } catch(e) {
    console.warn('app-data-load Function chaqirishda xato — eski yo\'lga o\'tildi:', e);
    // v25: internet yo'q — qurilmadagi oxirgi nusxa
    let c = null; try { c = JSON.parse(localStorage.getItem(_dataKey) || 'null'); } catch (_) {}
    if (fwIsNetErr(e) && c && c.raw) { raw = c.raw; FWL.on = !!c.ledger; }
    else {
      const { data: row } = await db.from('app_data').select('data').eq('id','main').maybeSingle();
      raw = row?.data || {};
    }
  }
  // v10 (J13): avval faqat 'f729' tanilardi — qo'shilgan filial (masalan f702) sotuvchisi
  // "Baza"ga tushib, saqlaganda savdolari server tomonidan e'tiborsiz qoldirilardi
  SV_BRANCH = (ME && typeof ME.filial === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(ME.filial)) ? ME.filial : 'baza';

  // Umumiy (filialga bog'liq bo'lmagan) maydonlar
  S = {
    products: raw.products || [], partners: raw.partners || [], partnerPeriods: raw.partnerPeriods || [],
    settings: raw.settings || {}, auditLogs: raw.auditLogs || [],
    branchDebt: raw.branchDebt || { f729ToBaza: 0 },
    _rawFull: raw
  };

  // Filialga tegishli ma'lumotlar
  let bd;
  if (raw.branchStore) {
    bd = raw.branchStore[SV_BRANCH] || {};
  } else {
    // Eski format (filiallar hali yo'q edi) — hammasi Bazaga tegishli deb olinadi
    bd = (SV_BRANCH==='baza') ? raw : {};
  }
  S.batches = bd.batches || []; S.batchCounter = bd.batchCounter || 0; S.sales = fwqMergePending(bd.sales || [], SV_BRANCH);
  S.customers = bd.customers || []; S.suppliers = bd.suppliers || []; S.expenses = bd.expenses || [];
  S.cashboxes = bd.cashboxes || []; S.cashTxns = bd.cashTxns || []; S.revisions = bd.revisions || [];
  S.dailyClosings = bd.dailyClosings || []; S.salaryPeople = bd.salaryPeople || (SV_BRANCH==='baza' ? (raw.salaryPeople||[]) : []);

  // Kurs — bulutdagi (admin belgilagan) qiymatni ishlatamiz, standart emas
  if (S.settings.usdUzs) CUR.usdUzs = S.settings.usdUzs;
  if (S.settings.usdCny) CUR.usdCny = S.settings.usdCny;
  SV_BASE = fwBranchNums(svBranchSnap());
}

function svBranchSnap() {
  return {
    batches:S.batches, batchCounter:S.batchCounter, sales:S.sales, customers:S.customers,
    suppliers:S.suppliers, expenses:S.expenses, cashboxes:S.cashboxes, cashTxns:S.cashTxns,
    revisions:S.revisions, dailyClosings:S.dailyClosings, salaryPeople:S.salaryPeople
  };
}
// v24.5: sozlamalar — faqat shaxsiy va o'z filiali (chek matni, telefon, manzil; o'zgartirish — «sozlamalar.edit»)
function svOpenSettings() {
  // v24.7: o'ziga moslangan — rol nomi (RBAC), bugungi va oylik natijasi
  const td0 = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const mine = ((S && S.sales) || []).filter(x => x && x.status !== 'voided' && String(x.staffId) === String(ME.id));
  const tS = mine.filter(x => String(x.date || '').slice(0, 10) === td0), mS = mine.filter(x => String(x.date || '').slice(0, 7) === td0.slice(0, 7));
  const sum = a => a.reduce((t, x) => t + (+x.totalUsd || 0), 0);
  ptSettingsOpen({ who: ME.name, role: (ME.roleNames && ME.roleNames.length ? ME.roleNames.join(', ') : SV_ROLE_LABELS[ME.role] || ME.role), filial: svBranchLabel().replace(/^ · /, ''),
    stats: [['Bugun', tS.length + ' ta chek', CUR.fmtUsd(sum(tS))], ['Shu oy', mS.length + ' ta chek', CUR.fmtUsd(sum(mS))]],
    branch: { get: () => S.branchSettings || {}, canEdit: !!(ME.perms && ME.perms.has('sozlamalar.edit')),
      save: async (v) => { const old = S.branchSettings; S.branchSettings = { ...(old || {}), ...v, updatedAt: new Date().toISOString() };
        try { await svSaveShopData(); } catch (e) { S.branchSettings = old; throw e; } } },
    password: async (pw) => { const { error } = await db.auth.updateUser({ password: pw }); if (error) throw new Error(error.message || 'Parol oʻzgarmadi'); },
    pwTg: true, onLogout: svLogout });
}
function svBranchLabel() {
  const nm = (S.settings && S.settings.branchNames && S.settings.branchNames[SV_BRANCH]) || (SV_BRANCH === 'f729' ? '729-filial' : SV_BRANCH === 'baza' ? 'Baza' : SV_BRANCH);
  return ' · ' + String(nm).replace(/[<>"'`&]/g, '');
}

// v24.8 (37): serverdagi asosiy qator versiyasi — saqlashda yuboriladi (eskirgan bo'lsa server 409 beradi)
let SV_VER = null;
// v10 (B1): saqlashdan oldin serverdagi eng so'nggi holat bilan birlashtiramiz
async function svFetchLatest() {
  try {
    const res = await authFetch('/.netlify/functions/app-data-load', { method:'POST' });
    if (!res.ok) return null;
    const r = await res.json();
    if (r && r.ledgerAuthority !== undefined) FWL.on = !!r.ledgerAuthority;
    SV_VER = r && Number.isSafeInteger(r.version) ? r.version : null;
    return (r && r.data && typeof r.data === 'object') ? r.data : null;
  } catch (_) { return null; }
}

async function svSaveShopData(_attempt = 0) {
  const cashSeq0 = fwCashSeq;
  const ledgerSeq0 = fwLedgerSeq;
  const latest = await svFetchLatest();
  if (latest) {
    const remBranch = (latest.branchStore && latest.branchStore[SV_BRANCH]) || {};
    const merged = fwMergeBranchSnap(remBranch, svBranchSnap(), SV_BASE, latest.deletedIds);
    S.batches = merged.batches; S.batchCounter = merged.batchCounter; S.sales = merged.sales;
    S.customers = merged.customers; S.suppliers = merged.suppliers; S.expenses = merged.expenses;
    S.cashboxes = merged.cashboxes; S.cashTxns = merged.cashTxns; S.revisions = merged.revisions;
    S.dailyClosings = merged.dailyClosings; S.salaryPeople = merged.salaryPeople;
    // Umumiy maydonlarni sotuvchi o'zgartirmaydi — serverdagi eng so'nggisi olinadi
    if (Array.isArray(latest.products)) S.products = latest.products;
    if (latest.settings) S.settings = latest.settings;
    if (latest.branchDebt) S.branchDebt = latest.branchDebt;
    const logMap = new Map();
    [...(latest.auditLogs || []), ...(S.auditLogs || [])].forEach(l => { if (l && l.id !== undefined) logMap.set(l.id, l); });
    S.auditLogs = Array.from(logMap.values()).sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, 200);
    S._rawFull = { ...latest, branchStore: { ...(latest.branchStore || {}) } };
  }
  const full = S._rawFull || {};
  if (!full.branchStore) {
    // Eski formatdan yangi (filial) formatga o'tkazamiz — boshqa hech narsa yo'qolmaydi
    const oldBaza = {};
    SV_BRANCH_KEYS.forEach(k=>{ if (full[k]!==undefined) oldBaza[k]=full[k]; });
    full.branchStore = { baza: oldBaza, f729: {} };
  }
  full.branchStore[SV_BRANCH] = {
    batches:S.batches, batchCounter:S.batchCounter, sales:S.sales, customers:S.customers,
    suppliers:S.suppliers, expenses:S.expenses, cashboxes:S.cashboxes, cashTxns:S.cashTxns,
    revisions:S.revisions, dailyClosings:S.dailyClosings, salaryPeople:S.salaryPeople
  };
  full.products = S.products;
  full.settings = S.settings; full.auditLogs = S.auditLogs; full.branchDebt = S.branchDebt;
  delete full.salaryPeople; // endi filial ichida (branchStore), tashqarida saqlanmaydi
  full.activeBranch = full.activeBranch || SV_BRANCH;

  // 1.4.5-QADAM: avval yangi Function orqali (server BIRLASHTIRIB yozadi —
  // boshqa filiallar YO'QOLMAYDI, garchi bu yerda faqat o'z filialimiz bo'lsa ham).
  // 2026-09-28: zaxira (to'g'ridan-to'g'ri) yo'l xatosi endi JIM yutilmaydi —
  // avval u RLS tomonidan rad etilsa ham foydalanuvchi hech narsa bilmay qolardi.
  const fallbackSave = async () => {
    const { error } = await db.from('app_data').upsert({ id:'main', data:full, updated_at:new Date().toISOString() });
    if (error) { console.error('Zaxira saqlash xatosi:', error); toast("⚠️ Saqlanmadi! Internetni tekshirib, qayta urinib ko'ring", 'error'); }
  };
  try {
    // Hamkorlar (partners/partnerPeriods) sotuvchi ilovasiga tegishli emas — ularni
    // yubormaymiz, aks holda bu qurilmadagi ESKI nusxa admin qilgan oylik
    // taqsimotni ustidan yozib yuborishi mumkin edi (2026-09-28).
    const { partners: _p, partnerPeriods: _pp, ...sendData } = full;
    const res = await authFetch('/.netlify/functions/app-data-save', {
      method:'POST', body: JSON.stringify({ data: sendData, ...(SV_VER != null ? { baseVersion: SV_VER } : {}) })
    });
    // v24.8 (37): orada boshqa qurilma yozgan — yangi holatni olib, o'zgarishlarimizni ustiga qo'yib qayta yuboramiz
    if (res.status === 409 && _attempt < 3) {
      const cj = await res.clone().json().catch(() => ({}));
      if (cj && cj.code === 'VERSION_CONFLICT') return svSaveShopData(_attempt + 1);
    }
    if (!res.ok) {
      // v24: server javob bergan bo'lsa — uning haqiqiy sababi ko'rsatiladi (eski yo'l 21-migratsiyadan beri yopiq)
      if (res.status !== 404) {
        const errData = await res.json().catch(()=>({}));
        console.warn(`app-data-save rad etdi (${res.status})`);
        toast('⚠️ Saqlanmadi: ' + fwSaveErrorText(res.status, errData.error), 'error');
      } else {
        console.warn("app-data-save funksiyasi topilmadi (404) — eski yo'lga o'tildi");
        await fallbackSave();
      }
    } else {
      const r = await res.json().catch(()=>({}));
      if (r.versions && Number.isSafeInteger(r.versions.main)) SV_VER = r.versions.main;
      // Server ruxsatsiz o'zgarishni yozmaydi va haqiqiy qiymatni qaytaradi —
      // mahalliy nusxani shu bilan tuzatamiz (2026-09-28).
      const top = r.serverValues || {}, bv = (r.ownBranch === SV_BRANCH ? r.serverBranchValues : null) || {};
      Object.keys(top).forEach(k => { if (k !== 'branchStore' && k !== 'activeBranch') { S[k] = top[k]; full[k] = top[k]; } });
      Object.keys(bv).forEach(k => { S[k] = bv[k]; if (full.branchStore && full.branchStore[SV_BRANCH]) full.branchStore[SV_BRANCH][k] = bv[k]; });
      // v11 (F4): kassa qoldig'i — bazadagi haqiqiy qiymat
      const ca = r.cashAuthority && r.cashAuthority.on && r.cashAuthority.branches && r.cashAuthority.branches[SV_BRANCH];
      if (ca) { fwApplyServerCashboxes(ca, cashSeq0); if (full.branchStore && full.branchStore[SV_BRANCH]) full.branchStore[SV_BRANCH].cashboxes = S.cashboxes; }
      // v23.2 (F4b): qarz va partiya qoldiqlari — bazadagi haqiqiy qiymat
      const la = r.ledgerAuthority && r.ledgerAuthority.on ? r.ledgerAuthority : null;
      if (la) {
        FWL.on = true;
        if (la.branches && la.branches[SV_BRANCH]) fwApplyLedgerSnapshot(la.branches[SV_BRANCH], SV_BRANCH, ledgerSeq0);
        if (la.branchDebt) { S.branchDebt = { ...la.branchDebt }; full.branchDebt = S.branchDebt; }
      }
      const blocked = [...(r.ignoredKeys||[]), ...(r.blockedMassDelete||[])];
      if (blocked.length) {
        const msg = "⚠️ Ba'zi o'zgarishlar saqlanmadi (ruxsat yo'q): " + blocked.join(', ');
        if (!window.__svShownWarn) window.__svShownWarn = new Set();
        if (!window.__svShownWarn.has(msg)) { window.__svShownWarn.add(msg); toast(msg, 'error'); }
      }
    }
  } catch(e) {
    console.warn('app-data-save Function chaqirishda xato — eski yo\'lga o\'tildi:', e);
    await fallbackSave();
  }
  S._rawFull = full;
  SV_BASE = fwBranchNums(svBranchSnap()); // yangi boshlang'ich nuqta
}

function svShowLogin() {
  document.documentElement.classList.remove('fw-booting');
  document.getElementById('sv-login').style.display = 'flex';
  document.getElementById('sv-app').style.display = 'none';
}

const SV_ROLE_LABELS = { sotuvchi:'Sotuvchi', admin:'Admin' };
function svRoleText() { return (ME && ME.roleNames && ME.roleNames.length ? ME.roleNames.join(', ') : SV_ROLE_LABELS[ME && ME.role] || (ME && ME.role) || 'Sotuvchi') + svBranchLabel(); }

// v24.7: BOSH SAHIFA — admin bosh sahifasi uslubida: salomlashish, davr bo'yicha o'z natijasi, «Tezkor amallar», oxirgi cheklar
const SV_HOME = { per: 'today' };
function svHomePer(p) { SV_HOME.per = p; if (ACTIVE_TAB === 'home') svRenderContent(); }
function svHomeHtml() {
  const t = td(), per = SV_HOME.per;
  const from = per === 'week' ? new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10) : per === 'month' ? t.slice(0, 7) + '-01' : t;
  const mine = ((S && S.sales) || []).filter(x => x && x.status !== 'voided' && String(x.staffId) === String(ME.id));
  const ps = mine.filter(x => { const d = String(x.date || '').slice(0, 10); return d >= from && d <= t; });
  const sum = k => ps.reduce((a, x) => a + (+x[k] || 0), 0);
  const prof = !!(ME.perms && ME.perms.has('hisobot.view'));
  const perL = { today: 'Bugun', week: '7 kun', month: 'Bu oy' };
  const pend = ((S && S.dealerOrders) || []).filter(o => o.status === 'pending').length;
  const last = mine.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || (Number(b.id) || 0) - (Number(a.id) || 0)).slice(0, 5);
  const custOf = (s) => { const c = s.custId != null && (S.customers || []).find(x => String(x.id) === String(s.custId)); return (c && c.name) || s.custName || 'Chakana xaridor'; };
  const dueRem = fwDueRemindersNow();   // v24.9: nasiya eslatmalari
  if (dueRem.length) setTimeout(() => { if (ACTIVE_TAB === 'home' && !document.querySelector('.fw-due-ov, .dls-sheet')) fwDueDailyPopup(dueRem, { payFn: 'svOpenPay', allFn: "svSwitchTab('debt')", scope: 's-' + SV_BRANCH }); }, 600);
  return `${ptWelcome(ME.name, svRoleText().replace(/^\s*·\s*/, ''))}
  ${fwDueBoard(dueRem, { payFn: 'svOpenPay', allFn: "svSwitchTab('debt')", limit: 4 })}
  <section class="ox-hero" aria-label="Mening savdom">
    <div class="ox-hero-top"><span>Mening savdom · ${perL[per]}</span><span class="ox-seg">${Object.entries(perL).map(([k, l]) => `<button class="${per === k ? 'on' : ''}" onclick="svHomePer('${k}')">${l}</button>`).join('')}</span></div>
    <div class="ox-hero-big">${CUR.fmtUsd(sum('totalUsd'))}</div>
    <div class="ox-hero-g">
      <span><small>Cheklar</small><b class="sk">${ps.length}</b></span>
      <span><small>Toʻlandi</small><b class="gr">${CUR.fmtUsd(sum('paidUsd'))}</b></span>
      <span><small>Qarzga</small><b class="am">${CUR.fmtUsd(sum('debtUsd'))}</b></span>
      ${prof ? `<span><small>Foyda</small><b class="gr">${CUR.fmtUsd(sum('profitUsd'))}</b></span>` : ''}
      <span><small>Chegirma</small><b class="am">${CUR.fmtUsd(sum('discUsd'))}</b></span>
    </div>
  </section>
  ${ptBanner('sale', 'Yangi savdo', 'Mahsulotni qidiring yoki shtrix-kodni skanerlang', "svSwitchTab('sale')")}
  ${ptActs([['sale', 'emerald', 'Savdo', "svSwitchTab('sale')"], ['debt', 'amber', 'Qarzlar', "svSwitchTab('debt')"], ['kassa', 'sky', 'Kassa', "svSwitchTab('kassa')"],
    ['history', 'indigo', 'Hisobot', "svSwitchTab('history')"], ['expense', 'red', 'Xarajat', "svSwitchTab('expense')"], ['salary', 'purple', 'Oylik', "svSwitchTab('salary')"],
    ['orders', 'blue', 'Buyurtmalar', "svSwitchTab('orders')", pend], ['settings', 'text-muted', 'Sozlamalar', 'svOpenSettings()']])}
  <h2 class="ox-sec">Oxirgi cheklarim</h2>
  ${last.length ? `<div class="pt-last">${last.map(s => `<div class="pt-last-r"><span class="pt-last-ic">${ptIc('sale')}</span><span class="pt-last-t"><b>${esc(s.inv || ('#' + s.id))}</b><small>${esc(custOf(s))} · ${esc(fmtD ? fmtD(s.date) : String(s.date || '').slice(0, 10))}</small></span><b class="pt-last-v">${CUR.fmtUsd(+s.totalUsd || 0)}</b></div>`).join('')}</div>`
    : `<div class="pt-empty">Hali chek yoʻq — birinchi savdoni «Yangi savdo» tugmasi bilan boshlang.</div>`}`;
}
function svAllowedTabs() {
  return ['home','sale','debt','kassa','orders','history','expense'];   // sotuvchi/admin — hammasi (oylik — «Xarajat» ichida)
}

function svShowApp() {
  document.documentElement.classList.remove('fw-booting');
  document.getElementById('sv-login').style.display = 'none';
  document.getElementById('sv-app').style.display = 'flex';
  document.getElementById('sv-name').textContent = ME.name;
  ptGreet('sv', ME.name);
  document.getElementById('sv-role').textContent = (SV_ROLE_LABELS[ME.role] || ME.role) + svBranchLabel();
  const allowed = svAllowedTabs();
  SV_TABS.forEach(t=>{
    const btn = document.getElementById('tab-'+t);
    if (btn) btn.style.display = allowed.includes(t) ? '' : 'none';
  });
  if (!allowed.includes(ACTIVE_TAB)) ACTIVE_TAB = allowed[0];
  if (typeof ptShellInit === 'function') ptShellInit({ label: 'Sotuvchi', go: 'svSwitchTab', settings: 'svOpenSettings', logout: 'svLogout', who: ME.name, role: svRoleText(),
    items: [['home', 'Bosh sahifa'], ['sale', 'Savdo'], ['debt', 'Qarzlar'], ['kassa', 'Kassa'], ['history', 'Hisobot'], ['expense', 'Xarajat'], ['orders', 'Buyurtmalar']] });
  if (typeof ptSideActive === 'function') ptSideActive(ACTIVE_TAB);
  svRenderContent();
  svLoadOrdersIfNeeded(true);   // v23.9: yuqoridagi qo'ng'iroq — yangi diller buyurtmalari soni
}

// v23.9: «Menyu» yo'q — hamma bo'lim ekranda: pastki panel (telefon) / tablar (kompyuter);
// Buyurtmalar — yuqoridagi qo'ng'iroq (yangi buyurtmalar soni bilan); Oylik — «Xarajat» ichida.
const SV_TABS = ['home','sale','debt','kassa','history','expense'];
const SV_EXP = { mode: 'exp' };
function svSwitchTab(tab) {
  if (tab === 'salary') { SV_EXP.mode = 'salary'; tab = 'expense'; }   // eski havola — Xarajat ichidagi «Oylik»
  if (!svAllowedTabs().includes(tab)) return;
  ACTIVE_TAB = tab;
  SV_TABS.forEach(t=>{
    document.getElementById('tab-'+t)?.classList.toggle('active', tab===t);
  });
  document.getElementById('sv-bell')?.classList.toggle('on', tab==='orders');
  if (typeof ptSideActive === 'function') ptSideActive(tab);
  svRenderContent();
  window.scrollTo?.(0, 0);
}
// Pastki menyu o'rtasidagi QR tugmasi: «Savdo» bo'limi + skaner (USB skaner rejimida — faqat bo'lim)
function svNavScan() {
  if (!svAllowedTabs().includes('sale')) return;
  if (ACTIVE_TAB !== 'sale') svSwitchTab('sale');
}
function svUpdateBell() {
  const n = (S.dealerOrders||[]).filter(o=>o.status==='pending').length + (SV_NTF.unread || 0), b = document.getElementById('sv-bell-n');
  if (b) { b.textContent = n > 99 ? '99+' : String(n); b.hidden = !n; }
  const bell = document.getElementById('sv-bell'); if (bell) bell.setAttribute('aria-label', `Dillerlar buyurtmalari${n ? ` — ${n} ta yangi` : ''}`);
}

function svRenderContent() {
  const el = document.getElementById('sv-content');
  if (ACTIVE_TAB === 'home') { el.innerHTML = svHomeHtml(); return; }
  if (ACTIVE_TAB === 'sale') { el.innerHTML = svSaleHtml(); svRenderProductList(); }
  else if (ACTIVE_TAB === 'debt') el.innerHTML = svDebtHtml();
  else if (ACTIVE_TAB === 'kassa') { el.innerHTML = svKassaHtml(); if (typeof fwNumScan === 'function') fwNumScan(el); }
  else if (ACTIVE_TAB === 'orders') { el.innerHTML = svOrdersHtml(); svLoadOrdersIfNeeded(); }
  else if (ACTIVE_TAB === 'expense') {
    el.innerHTML = svExpenseHtml();
    // Kategoriyalar serverdan (yagona manba); kelguncha "Yuklanmoqda…" holati
    if (SV_EXP.mode !== 'salary' && (FWC.filial !== SV_BRANCH || (!FWC.loaded && !FWC.loading))) fwExpCatLoad(SV_BRANCH, !!FWC.error).then(() => svCatRefresh());
  }
  else el.innerHTML = svHistoryHtml();
}

// ════════════════════════════════════════════
// XARAJAT — sotuvchi faqat DO'KON xarajatlarini kirita oladi
// ════════════════════════════════════════════
// Tayyor kategoriya ro'yxati yo'q — admin paneli bilan BIR manba: serverdagi expense_categories (fwExpCat*, shared.js)

function svMySalaryHtml() {
  const sp = (S.salaryPeople||[]).find(p=>p.name.toLowerCase()===ME.name.toLowerCase());
  if (!sp) return `<div class="dl-card" style="text-align:center;padding:30px;color:var(--text-muted)">
    <div style="font-size:28px;margin-bottom:8px">💰</div>
    Sizning ismingizga moslashtirilgan oylik hali belgilanmagan.<br>Bazadan "Oylik xodimlar" boʻlimida qoʻshilishini kuting.
  </div>`;
  const givenUsd = S.expenses.filter(e=>e.turi==='tasischi' && e.salaryPersonId===sp.id && e.date.slice(0,7)===td().slice(0,7)).reduce((s,e)=>s+(e.amtUsd||0),0);
  const givenNative = sp.cur==='USD' ? givenUsd : CUR.toUzs(givenUsd);
  const debtNative = sp.cur==='USD' ? (sp.debtUsd||0) : CUR.toUzs(sp.debtUsd||0);
  const fmt = sp.cur==='USD' ? CUR.fmtUsd : CUR.fmtUzs;
  return `<div class="dl-card" style="margin-bottom:12px">
    <div style="font-weight:700;font-size:14px;margin-bottom:10px">Mening oyligim</div>
    <div class="dl-stat"><span style="color:var(--text-muted)">Belgilangan oylik</span><span style="font-weight:700">${fmt(sp.amount)}</span></div>
    <div class="dl-stat"><span style="color:var(--text-muted)">Bu oy olingan</span><span style="font-weight:700;color:var(--emerald)">${fmt(givenNative)}</span></div>
    ${(sp.debtUsd||0)>0.01?`<div class="dl-stat"><span style="color:var(--text-muted)">Qarzim (ortiqcha olingan)</span><span style="font-weight:700;color:var(--red)">${fmt(debtNative)}</span></div>`:''}
  </div>
  <div class="dl-card">
    <div style="font-weight:700;font-size:13px;margin-bottom:10px">Oylik oldim</div>
    <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Olgan summangiz (${sp.cur==='USD'?'$':"so'm"})</label>
    <input class="dl-input" id="svs-amt" type="text" inputmode="decimal" value="${sp.amount}" oninput="liveFormatSpaces(this)">
    <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px">Qaysi kassadan</label>
    ${svBoxChips('svs-box')}
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">Belgilangandan koʻp yozsangiz — ortiqcha qism qarzga yoziladi.</div>
    <button class="dl-btn" style="width:100%;justify-content:center" onclick="svTakeSalary(${sp.id})">✅ Oylik oldim — yozib qoʻyish</button>
  </div>`;
}

async function svTakeSalary(spId) {
  const sp = (S.salaryPeople||[]).find(x=>x.id===spId); if (!sp) return;
  const given = parseAmt(document.getElementById('svs-amt')?.value);
  const bid = parseInt(document.getElementById('svs-box')?.value||0);
  if (given<=0) { toast('Summa kiriting!','error'); return; }

  const givenUsd = sp.cur==='USD' ? given : CUR.toUsd(given);
  const baseUsd = sp.cur==='USD' ? sp.amount : CUR.toUsd(sp.amount);
  const diffUsd = givenUsd - baseUsd;
  const sysType = fwSalarySysType(sp.name), cat = FW_SYS_EXPENSE[sysType];   // tizim yozuvi (tanlanadigan kategoriya emas)

  // v11 (F4): kassadan chiqim — avval serverda (rad etilsa hech narsa yozilmaydi)
  const box = S.cashboxes.find(k=>k.id===bid);
  if (!box) { toast('⛔ Kassa tanlang','error'); return; }   // kassasiz pul yozuvi bo'lmaydi
  {
    const amt = box.cur==='USD'?givenUsd:CUR.toUzs(givenUsd);
    try { await fwCashOps('salary', [{boxId:box.id, dir:'out', amount:amt, desc:`${cat}: ${sp.name} (oʻzi yozdi)`}], { remote:true, filial:SV_BRANCH, refType:'salary', refId:sp.id }); }
    catch(e) { toast('⛔ ' + e.message, 'error'); return; }
  }
  sp.debtUsd = (sp.debtUsd||0) + diffUsd;

  S.expenses.push({ id:uid(), date:td(), cat, sysType, amtUsd:givenUsd, amount:given, cur:sp.cur, desc:`${cat}: ${sp.name} (oʻzi yozdi)`, person:sp.name, staffId:ME.id, boxId:bid, turi:'tasischi', salaryPersonId:sp.id, rate: sp.cur==='UZS' ? CUR.usdUzs : null });


  auditLog(`${cat} olindi (oʻzi yozdi): ${sp.name} — ${CUR.fmtUsd(givenUsd)}`);
  svSaveShopData();
  svRenderContent();
  toast(diffUsd>0.01 ? `✅ Yozildi! ${CUR.fmtUsd(diffUsd)} qarzga yozildi.` : '✅ Oylik olingani yozildi!');
}

// v23.9: kassa tanlovi — kartochkalar (telefonda bir bosishda); qiymat yashirin maydonda (mavjud kod .value bilan o'qiydi).
// Sotuvchiga faqat savdo kassalari: Shaxsiy va diller kassasi yo'q.
function svCashBoxes() { return (S.cashboxes||[]).filter(k=>k.type!=='dealer' && k.type!=='qobiljon'); }
function svBoxChips(id) {
  const boxes = svCashBoxes(), sel = boxes[0];
  if (!boxes.length) return `<input type="hidden" id="${id}" value=""><div class="sv-nobox">Filialda kassa yoʻq — administratorga murojaat qiling</div>`;   // v24.6: bo'sh maydon emas
  return `<input type="hidden" id="${id}" value="${sel ? sel.id : ''}"><div class="sv-chips" role="radiogroup">${boxes.map((k,i)=>`<button type="button" role="radio" aria-checked="${i===0}" class="${i===0?'on':''}" data-v="${k.id}" onclick="svChipPick(this,'${id}')"><b>${esc(k.icon||'')} ${esc(k.name)}</b><small>${k.cur==='USD'?CUR.fmtUsd(k.bal||0):CUR.fmtUzs(k.bal||0)}</small></button>`).join('')}</div>`;
}
function svChipPick(btn, id) {
  const inp = document.getElementById(id); if (inp) inp.value = btn.dataset.v;
  btn.parentNode.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-checked', String(b === btn)); });
}
function svExpSetMode(m) { SV_EXP.mode = m; svRenderContent(); }
function svExpenseHtml() {
  const m = td().slice(0,7);
  const mine = S.expenses.filter(e=>(e.turi||'dokon')==='dokon' && e.staffId===ME.id);
  const monthUsd = mine.filter(e=>String(e.date||'').startsWith(m)).reduce((a,e)=>a+(+e.amtUsd||0),0);
  const sp = (S.salaryPeople||[]).find(p=>String(p.name||'').toLowerCase()===String(ME.name||'').toLowerCase());
  const givenUsd = sp ? S.expenses.filter(e=>e.turi==='tasischi' && e.salaryPersonId===sp.id && String(e.date||'').startsWith(m)).reduce((a,e)=>a+(+e.amtUsd||0),0) : 0;
  const baseUsd = sp ? (sp.cur==='USD' ? +sp.amount||0 : CUR.toUsd(+sp.amount||0)) : 0;
  const pct = baseUsd > 0 ? Math.min(100, Math.round(givenUsd / baseUsd * 100)) : 0;
  const hero = `<div class="sv-xhero">
      <button class="${SV_EXP.mode!=='salary'?'on':''}" onclick="svExpSetMode('exp')"><small>Bu oy xarajatlarim</small><b>${CUR.fmtUsd(monthUsd)}</b><i>${mine.filter(e=>String(e.date||'').startsWith(m)).length} ta yozuv</i></button>
      <button class="${SV_EXP.mode==='salary'?'on':''}" onclick="svExpSetMode('salary')"><small>Oyligim (bu oy)</small><b>${sp ? CUR.fmtUsd(givenUsd) : '—'}</b>
        <i>${sp ? `<span class="sv-bar"><span style="width:${pct}%"></span></span>${pct}% · ${CUR.fmtUsd(baseUsd)} dan` : 'belgilanmagan'}</i></button>
    </div>
    <div class="sv-seg" role="tablist"><button role="tab" aria-selected="${SV_EXP.mode!=='salary'}" class="${SV_EXP.mode!=='salary'?'on':''}" onclick="svExpSetMode('exp')">Xarajat</button><button role="tab" aria-selected="${SV_EXP.mode==='salary'}" class="${SV_EXP.mode==='salary'?'on':''}" onclick="svExpSetMode('salary')">Oylik</button></div>`;
  if (SV_EXP.mode === 'salary') return hero + svMySalaryHtml();
  const myExpenses = mine.slice().reverse().slice(0,15);
  return hero + `
    <div class="dl-card" style="margin-bottom:12px">
      <div style="font-weight:700;font-size:13px;margin-bottom:10px">Do'kon xarajati kiritish</div>
      <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Kategoriya</label>
      <select class="dl-input" id="sve-cat">${fwExpCatOptionsHtml('dokon')}</select>
      <div style="display:flex;gap:6px;margin:-4px 0 10px;flex-wrap:wrap">
        <button type="button" class="btn btn-ghost" id="sve-cat-add" onclick="svCatAdd()" style="font-size:12px;padding:6px 10px">+ Kategoriya qo'shish</button>
        <button type="button" class="btn btn-ghost" id="sve-cat-retry" onclick="fwExpCatLoad(SV_BRANCH,true).then(() => svCatRefresh())" style="font-size:12px;padding:6px 10px;display:${FWC.error?'':'none'}">Qayta yuklash</button>
      </div>
      <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Summa</label>
      <div class="sv-amt"><input class="dl-input" id="sve-amt" type="text" inputmode="decimal" placeholder="masalan: 550 000" oninput="liveFormatSpaces(this)">
        <input type="hidden" id="sve-cur" value="UZS"><span class="sv-cur" role="radiogroup"><button type="button" class="on" data-v="UZS" onclick="svChipPick(this,'sve-cur')">so'm</button><button type="button" data-v="USD" onclick="svChipPick(this,'sve-cur')">$</button></span></div>
      <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Izoh</label>
      <input class="dl-input" id="sve-dsc" placeholder="Xarajat haqida...">
      <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px">Kassa</label>
      ${svBoxChips('sve-box')}
      <button class="dl-btn" style="width:100%;justify-content:center;margin-top:4px" onclick="svAddExpense()">Xarajat kiritish</button>
    </div>

    <div class="dl-card">
      <div style="font-weight:700;font-size:13px;margin-bottom:8px">Mening kiritgan xarajatlarim</div>
      ${myExpenses.length ? myExpenses.map(e=>`<div class="dl-prow">
        <div><div class="dl-pname" style="word-break:break-word" data-svexcat="${esc(String(e.id))}">${esc(fwExpCatLabel(e))}</div><div class="dl-pmeta">${fmtD(e.date)} ${esc(e.desc?'· '+e.desc:'')}</div></div>
        <span style="font-weight:700;color:var(--red)">−${CUR.fmtUsd(e.amtUsd)}</span>
      </div>`).join('') : `<div style="text-align:center;padding:20px;color:var(--text-muted)">Hali xarajat kiritmagansiz</div>`}
    </div>`;
}

function svCatRefresh(selectId) {
  const sel = document.getElementById('sve-cat'); if (!sel) return;
  sel.innerHTML = fwExpCatOptionsHtml('dokon', selectId != null ? selectId : sel.value);
  const rb = document.getElementById('sve-cat-retry'); if (rb) rb.style.display = FWC.error ? '' : 'none';
  // Kategoriyalar serverdan kelgach — "Mening xarajatlarim" nomlari ham (ID bo'yicha) yangilanadi
  document.querySelectorAll('[data-svexcat]').forEach(el => {
    const e = (S.expenses||[]).find(x => String(x.id) === el.dataset.svexcat);
    if (e) el.textContent = fwExpCatLabel(e);
  });
}
function svCatAdd() {
  fwCatModalOpen({ mode:'create', turi:'dokon', onDone: (cat) => { svCatRefresh(cat.id); auditLog(`Xarajat kategoriyasi qo'shildi (${ME?.name || ''}): ${cat.name}`); } });
}

async function svAddExpense() {
  const raw = parseAmt(document.getElementById('sve-amt')?.value);
  if (raw<=0) { toast('Summa kiriting!','error'); return; }
  const cur = document.getElementById('sve-cur')?.value || 'UZS';
  // Kategoriya — serverdagi FAOL do'kon kategoriyasi (ID bilan bog'lanadi)
  const catObj = fwExpCatById(parseInt(document.getElementById('sve-cat')?.value || 0));
  if (!catObj || !catObj.isActive || (catObj.turi || 'dokon') !== 'dokon') {
    toast("Kategoriya tanlang yoki \"+ Kategoriya qo'shish\" orqali yangisini yarating", 'error'); return;
  }
  const cat = catObj.name, catId = Number(catObj.id);
  const desc = document.getElementById('sve-dsc')?.value?.trim() || '';
  const bid = parseInt(document.getElementById('sve-box')?.value||0);
  const usd = cur==='USD' ? raw : CUR.toUsd(raw);

  // v11 (F4): kassadan chiqim — avval serverda (rad etilsa xarajat yozilmaydi)
  const box = S.cashboxes.find(k=>k.id===bid);
  if (!box) { toast('⛔ Kassa tanlang','error'); return; }   // kassasiz pul yozuvi bo'lmaydi
  {
    const amt = box.cur==='USD'?usd:CUR.toUzs(usd);
    try { await fwCashOps('expense', [{boxId:box.id, dir:'out', amount:amt, desc:`Xarajat (do'kon): ${cat} — ${ME.name}`}], { remote:true, filial:SV_BRANCH, refType:'expense' }); }
    catch(e) { toast('⛔ ' + e.message, 'error'); return; }
  }

  S.expenses.push({ id:uid(), date:td(), cat, catId, amtUsd:usd, amount:raw, cur, desc, person:ME.name, staffId:ME.id, turi:'dokon', boxId:bid, rate: cur==='UZS' ? CUR.usdUzs : null });

  auditLog(`Xarajat (do'kon, ${ME.name}): ${cat} — ${CUR.fmtUsd(usd)}`);
  svSaveShopData();
  svRenderContent();
  toast('✅ Xarajat kiritildi!');
}
function getStock(pid) {
  return S.batches.filter(b=>b.pid===pid && b.status!=='empty' && b.status!=='transit').reduce((s,b)=>s+(b.qty-b.sold),0);
}
function getCostFIFO(pid) {
  const b = S.batches.filter(x=>x.pid===pid && x.qty>x.sold && x.status!=='empty' && x.status!=='transit')
    .sort((a,b)=>new Date(a.date)-new Date(b.date))[0];
  return b ? (b.costUsd||0) : 0;
}
function sellPrice(p, cost) {
  const own = typeof fwBranchOwn === 'function' ? fwBranchOwn(SV_BRANCH) : null;   // v25: mustaqil filial — o'z ustamasi
  const pct = own && own.r != null ? own.r : (p && p.markupPct!=null) ? p.markupPct : 25;
  return cost * (1 + pct/100);
}
// deductFIFO, logCashTxn — endi js/shared.js'da (barcha ilovalarda umumiy)
function auditLog(action) {
  S.auditLogs.unshift({ id:uid(), action:`[${ME.name}] ${action}`, ts:new Date().toISOString() });
  if (S.auditLogs.length > 200) S.auditLogs.pop();
}
function savdoBoxes() { return S.cashboxes.filter(k=>k.type!=='dealer'); }
function resolveBoxByType(type) { return savdoBoxes().find(k=>k.type===type) || savdoBoxes()[0]; }

// ════════════════════════════════════════════
// v24.5 — SAVDO (sotuvchi) — admin panel bilan BIR XIL oyna (js/pos.js); bu yerda faqat adapter va serverga yozish.
// Tannarx sotuvchiga ko'rsatilmaydi; foyda — faqat «hisobot.view» ruxsati bo'lsa.
// ════════════════════════════════════════════
function svDirectOk(p) { return fwDirectReady(p) && !!(ME && ME.perms && ME.perms.has('savdo.direct_sale')); }
const POS_SELLER = {
  key: 'seller',
  el: () => document.getElementById('sv-pos'),
  rate: () => CUR.usdUzs,
  cart: () => CART,
  setCart: (a) => { CART = a; },
  custId: () => SALE_CUST_ID,
  setCustId: (id) => { SALE_CUST_ID = id || null; },
  products: () => S.products || [],
  stock: (pid) => getStock(pid),
  // v24.8 (K2): sotuvchiga tannarx berilmaydi — narx serverdan tayyor keladi (retailUsd / optUsd); zarar tekshiruvi — serverda
  unitCost: (p) => (p && p.priceFromServer) ? 0 : (p && p.directSale) ? (+p.dsCostUsd || 0) : getCostFIFO(p.id),
  basePrice: (p, mode) => {
    const sp = fwServerPrice(p, mode); if (sp != null) return sp;
    const cost = p && p.directSale ? (+p.dsCostUsd || 0) : getCostFIFO(p.id);
    if (mode === 'wholesale') { const pct = (p && p.optMarkupPct != null) ? +p.optMarkupPct : 15; return Math.round(cost * (1 + pct / 100) * 100) / 100; }
    return Math.round(sellPrice(p, cost));
  },
  canSell: (p) => p.directSale ? svDirectOk(p) : getStock(p.id) > 0,
  dsLine: (p) => ({ directSupply: true, suppId: p.dsSuppId }),
  customers: () => S.customers || [],
  addCustomer: async (d) => {
    const c = { id: uid(), name: d.name, phone: d.phone, addr: d.addr || '', note: d.note || '', disc: 0, debt: 0, total: 0 };
    S.customers.push(c);
    try { await svSaveShopData(); } catch (e) { S.customers = S.customers.filter(x => x.id !== c.id); throw e; }
    return c;
  },
  boxes: () => svCashBoxes(),
  showProfit: () => !!(ME && ME.perms && ME.perms.has('hisobot.view')) && !fwCostHidden(S.products),   // tannarxsiz foyda noto'g'ri bo'lardi
  priceEditable: () => false,   // v25 (egasi qarori): sotuvchi narx/chegirmani o'zgartirmaydi — faqat summa
  full: () => false,            // v25: izoh, chekka chegirma, narx/% tahriri yo'q; mijoz — faqat qarzda
  costView: () => !!(ME && ME.perms && ME.perms.has('tannarx.view')) && !fwCostHidden(S.products),   // «Tannarx» tugmasi (5 s)
  rounding: () => !(S.settings && S.settings.roundingEnabled === false),
  commit: (ctx) => svCommitSale(ctx),
  afterCommit: (sale) => {
    const t = document.getElementById('sv-today'); if (t) t.outerHTML = svTodayHtml();
    if (sale && typeof sale === 'object') modal(`<div style="padding:18px 18px 16px">
      <div style="font-weight:800;font-size:16px;margin-bottom:8px">✅ Savdo yakunlandi — ${esc(sale.inv)}</div>
      <div class="pos-jami"><span>Jami</span><b>${sale.cur !== 'USD' && sale.roundedTotalUzs ? fwNum(sale.roundedTotalUzs) + ' soʻm' : CUR.fmtUsd(sale.totalUsd)}</b></div>
      ${sale.changeN ? `<div class="pos-total" style="margin-top:8px"><div><span>Olindi</span><b>${sale.cur !== 'USD' ? fwNum(sale.paidN) + ' soʻm' : CUR.fmtUsd(sale.paidN)}</b></div><div><span>Qaytim</span><b>${sale.cur !== 'USD' ? fwNum(sale.changeN) + ' soʻm' : CUR.fmtUsd(sale.changeN)}</b></div></div>` : ''}
      ${sale.pending ? `<div class="pos-msg warn" style="margin-top:8px"><div>Oflayn savdo — internet qaytganda serverga avtomatik yuboriladi.</div></div>` : ''}
      <div style="display:flex;gap:8px;margin-top:12px"><button class="pos-btn ghost" style="flex:1" onclick="closeModal();svPrintSale('${escJsAttr(String(sale.id))}')">🧾 Chek · PDF</button>
      <button class="pos-btn pri" style="flex:1" onclick="closeModal()">Yangi savdo</button></div></div>`);
  },
};

function svTodayHtml() {
  const _mine = S.sales.filter(x => x.date === td() && x.staffId === ME.id);
  const _all = S.sales.filter(x => x.date === td());
  const _rate = +(S.settings && S.settings.usdUzs) || CUR.usdUzs, _rateOk = S.settings && S.settings.rateDate === td();
  return `<div id="sv-today"><div class="sv-today">
      <div><small>Cheklarim</small><b>${_mine.length}</b></div>
      <div><small>Savdom</small><b>${CUR.fmtUsd(_mine.reduce((s, x) => s + (+x.totalUsd || 0), 0))}</b></div>
      <div><small>Doʻkonda</small><b>${_all.length}</b></div>
    </div>
    <div class="sv-rate ${_rateOk ? '' : 'warn'}">${_rateOk ? 'Bugungi kurs' : 'Kurs bugun hali tasdiqlanmagan'}: <b>1 $ = ${fwNum(_rate)} soʻm</b></div></div>`;
}
function svSaleHtml() { return `${svTodayHtml()}<div id="sv-pos"></div>`; }
function svRenderProductList() { if (POS.a !== POS_SELLER) posInit(POS_SELLER); posRender(); }
function svFinishSale() { return posFinish(); }

// Savdoni serverga yozish (27-migratsiyadan keyin — ombor, qarz, kassa bitta tranzaksiyada; brauzer qoldiqni hisoblamaydi)
async function svCommitSale(ctx) {
  const custId = ctx.custId || null;
  const cust = S.customers.find(c => c.id === custId);
  const inv = fwNextDocNo('INV-', S.sales);
  const items = ctx.items.map(i => ({ pid: i.pid, sku: i.sku, name: i.name, qty: i.qty, sellUsd: i.sellUsd, costUsd: i.costUsd, directSupply: !!i.directSupply, suppId: i.suppId }));
  const boxPayments = (ctx.boxPayments || []).map(b => ({ box_id: b.box_id, amount_native: b.amount_native }));
  const overpay = ctx.overpay ? { box_id: ctx.overpay.box_id, amount_native: ctx.overpay.amount_native } : null;
  const creditUseUzs = Math.max(0, Math.round(+ctx.creditUseUzs || 0));
  if (fwLedgerRemote()) {
    const sig = JSON.stringify({ items, d: ctx.discPct, p: ctx.paidUsd, custId, boxPayments, overpay, creditUseUzs });
    if (!S._svCk || S._svCk.sig !== sig) S._svCk = { sig, key: 'ck-' + uid(), saleId: uid() };
    const _body = (ack) => ({
      items, discPct: ctx.discPct, paidUsd: ctx.paidUsd, custId, boxPayments, inv, idemKey: S._svCk.key, filial: SV_BRANCH,
      saleLocalId: S._svCk.saleId, payType: ctx.payType, boxId: ctx.boxId || null, custName: cust?.name || 'Anonim', saleDate: td(),
      lossAck: !!ack, overpay, creditUseUzs, discountReason: ctx.discountReason || null, priceMode: ctx.mode === 'wholesale' ? 'wholesale' : 'retail', dueDate: ctx.dueDate || null, dueDays: ctx.dueDays || null });
    const _send = (ack) => authFetch('/.netlify/functions/sale-checkout-atomic', { method: 'POST', body: JSON.stringify(_body(ack)) });
    let result;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new TypeError('Failed to fetch (oflayn)');
      let res = await _send(!!ctx.lossAck);
      result = await res.json().catch(() => ({}));
      // Server (bazadagi haqiqiy FIFO tannarx) zarar aniqlasa — sotuvchidan tasdiq so'raladi (ikki marta yozilmaydi)
      if (!res.ok && result.code === 'LOSS_ACK_REQUIRED') {
        const lossTxt = (+result.lossUsd > 0) ? `${CUR.fmtUzs(Math.round(CUR.toUzs(+result.lossUsd)))} ziyon qilyapsiz` : 'zarar bilan sotyapsiz';
        if (!confirm(`⚠️ Server: siz bu savdoda ${lossTxt} (narx minimal narxdan past). Administrator xabardor qilinadi.\n\nRozimisiz?`)) return false;
        res = await _send(true); result = await res.json().catch(() => ({}));
      }
      if (!res.ok) {
        toast('⛔ ' + (result.code === 'MIGRATION34_PENDING' ? "Ortiqcha toʻlov va mijoz haqi hali yoqilmagan — aniq summani kiriting" : fwLedgerErr(result.error || 'Savdo amalga oshmadi')), 'error');
        return false;
      }
    } catch (e) {
      // v25: internet yo'q — savdo qurilmada saqlanadi, internet qaytishi bilan avtomatik yuboriladi (ikki marta yozilmaydi)
      if (typeof fwIsNetErr === 'function' && fwIsNetErr(e)) return svQueueOffline(ctx, { inv, cust, custId, boxPayments, overpay, body: _body(!!ctx.lossAck) });
      toast("⛔ Server bilan aloqa yo'q — savat saqlanib qoldi, qayta urinib ko'ring (savdo ikki marta yozilmaydi)", 'error'); return false;
    }
    if (result.balances && Object.keys(result.balances).length) { fwApplyCashBalances(result.balances); fwCashSeq++; }
    if (result.authority) fwApplyLedger(result.authority);
    if (cust && result.custDebtUzs != null) cust.debt = +result.custDebtUzs;
    if (cust && result.custCreditUzs != null) cust.credit = +result.custCreditUzs;
    boxPayments.forEach(p => logCashTxn({ boxId: p.box_id, type: 'in', amount: p.amount_native, desc: `Savdo ${inv} (${ME.name})` }));
    if (overpay) logCashTxn({ boxId: overpay.box_id, type: 'in', amount: overpay.amount_native, desc: `Savdo ${inv} — ortiqcha (${ME.name})` });
    const srvId = result.localId != null ? (/^\d{1,16}$/.test(String(result.localId)) ? Number(result.localId) : String(result.localId)) : S._svCk.saleId;
    const sale = {
      id: srvId, date: td(), time: new Date().toTimeString().slice(0, 5), inv, custId, custName: cust?.name || 'Anonim', items: ctx.items.map(i => ({ ...i })),
      subtotalUsd: ctx.subtotalUsd, disc: ctx.discPct, discUsd: ctx.subtotalUsd - (+result.totalUsd), totalUsd: +result.totalUsd,
      paidUsd: Math.min(ctx.paidUsd, +result.totalUsd), debtUsd: +result.debtUsd, payType: ctx.payType, boxId: ctx.boxId || null,
      mixedRows: ctx.mixedRows, profitUsd: +result.profitUsd, status: 'done', staffId: ME.id, staffName: ME.name,
      cur: ctx.cur, mode: ctx.mode, note: ctx.note || undefined, discountReason: ctx.discountReason || undefined, roundedTotalUzs: ctx.roundedTotalUzs, changeN: ctx.changeN || undefined, paidN: ctx.paidN, rateUsdUzs: CUR.usdUzs,
      ...fwSaleDueFields(ctx, +result.debtUsd),   // v24.9: nasiya muddati
    };
    S.sales.push(sale);
    if (cust) cust.total = (cust.total || 0) + CUR.toUzs(sale.totalUsd);
    S._svCk = null;
    auditLog(`Savdo: ${inv} — ${CUR.fmtUsd(sale.totalUsd)}`);
    try { await svSaveShopData(); } catch (e) { toast('Saqlashda xato: ' + e.message, 'warning'); }
    toast(`✅ Savdo yakunlandi! ${inv}`);
    return sale;
  }

  // Eski rejim (27-migratsiyadan oldin): kassa — avval serverda (kassa jurnali); rad etilsa savdo yozilmaydi
  if (overpay || creditUseUzs) { toast("Ortiqcha toʻlov va mijoz haqi hali yoqilmagan — aniq summani kiriting", 'error'); return false; }
  const cashOps = boxPayments.map(p => ({ boxId: p.box_id, dir: 'in', amount: p.amount_native, desc: `Savdo ${inv} (${ME.name})` }));
  if (cashOps.length) {
    try { await fwCashOps('sale', cashOps, { remote: true, filial: SV_BRANCH, refType: 'sale', refId: inv }); }
    catch (e) { toast('⛔ ' + e.message, 'error'); return false; }
  }
  const sale = {
    id: uid(), date: td(), time: new Date().toTimeString().slice(0, 5), inv, custId, custName: cust?.name || 'Anonim', items: ctx.items.map(i => ({ ...i })),
    subtotalUsd: ctx.subtotalUsd, disc: ctx.discPct, discUsd: ctx.discUsd, totalUsd: ctx.totalUsd,
    paidUsd: ctx.paidUsd, debtUsd: ctx.debtUsd, payType: ctx.payType, boxId: ctx.boxId || null, mixedRows: ctx.mixedRows,
    profitUsd: ctx.profitUsd, status: 'done', staffId: ME.id, staffName: ME.name, cur: ctx.cur, mode: ctx.mode, note: ctx.note || undefined, roundedTotalUzs: ctx.roundedTotalUzs, changeN: ctx.changeN || undefined, paidN: ctx.paidN,
    ...fwSaleDueFields(ctx, ctx.debtUsd),   // v24.9: nasiya muddati
  };
  S.sales.push(sale);
  ctx.items.forEach(it => deductFIFO(it.pid, it.qty));
  if (cust) { if (ctx.debtUsd > 0) cust.debt = (cust.debt || 0) + CUR.toUzs(ctx.debtUsd); cust.total = (cust.total || 0) + CUR.toUzs(ctx.totalUsd); }
  auditLog(`Savdo: ${inv} — ${CUR.fmtUsd(ctx.totalUsd)}`);
  try { await svSaveShopData(); } catch (e) { toast('Xatolik: ' + e.message, 'error'); return false; }
  toast(`✅ Savdo yakunlandi! ${inv}`);
  return sale;
}

// v25: oflayn savdo — chek va ro'yxatda darhol ko'rinadi; ombor/kassa/qarz serverda internet qaytganda yoziladi
function svQueueOffline(ctx, o) {
  const sale = {
    id: S._svCk.saleId, date: td(), time: new Date().toTimeString().slice(0, 5), inv: o.inv, custId: o.custId, custName: o.cust?.name || 'Anonim', items: ctx.items.map(i => ({ ...i })),
    subtotalUsd: ctx.subtotalUsd, disc: ctx.discPct, discUsd: ctx.discUsd, totalUsd: ctx.totalUsd,
    paidUsd: Math.min(ctx.paidUsd, ctx.totalUsd), debtUsd: ctx.debtUsd, payType: ctx.payType, boxId: ctx.boxId || null,
    mixedRows: ctx.mixedRows, profitUsd: ctx.profitUsd, status: 'done', pending: true, staffId: ME.id, staffName: ME.name,
    cur: ctx.cur, mode: ctx.mode, note: ctx.note || undefined, discountReason: ctx.discountReason || undefined, roundedTotalUzs: ctx.roundedTotalUzs, changeN: ctx.changeN || undefined, paidN: ctx.paidN, rateUsdUzs: CUR.usdUzs,
    ...fwSaleDueFields(ctx, ctx.debtUsd),
  };
  S.sales.push(sale);
  // Ko'rinish uchun mahalliy qoldiq (server javobi kelganda haqiqiy qiymat bilan almashtiriladi)
  ctx.items.forEach(it => { if (!it.directSupply) try { deductFIFO(it.pid, it.qty); } catch (_) {} });
  if (o.cust && ctx.debtUsd > 0) o.cust.debt = (o.cust.debt || 0) + CUR.toUzs(ctx.debtUsd);
  fwqAdd({ id: S._svCk.key, kind: 'sale', url: '/.netlify/functions/sale-checkout-atomic', body: o.body, branch: SV_BRANCH, sale: JSON.parse(JSON.stringify(sale)) });
  S._svCk = null;
  try { localStorage.setItem('sv_offline_' + SV_BRANCH, JSON.stringify({ sales: S.sales.filter(x => x.pending) })); } catch (_) {}
  toast(`✅ Savdo yakunlandi (oflayn)! ${o.inv} — internet qaytganda serverga yuboriladi`);
  return sale;
}
if (typeof FWQ !== 'undefined') FWQ.handlers.sale = {
  ok(e, result) {
    if (e.branch !== SV_BRANCH) return;
    let sale = S.sales.find(x => String(x.id) === String(e.sale.id));
    if (!sale) { sale = Object.assign({}, e.sale); S.sales.push(sale); }
    delete sale.pending;
    if (result.totalUsd != null) { sale.totalUsd = +result.totalUsd; sale.paidUsd = Math.min(+sale.paidUsd || 0, sale.totalUsd); }
    if (result.debtUsd != null) sale.debtUsd = +result.debtUsd;
    if (result.profitUsd != null) sale.profitUsd = +result.profitUsd;
    if (result.balances && Object.keys(result.balances).length) { fwApplyCashBalances(result.balances); fwCashSeq++; }
    if (result.authority) fwApplyLedger(result.authority);
    const c = S.customers.find(x => x.id === sale.custId);
    if (c) { if (result.custDebtUzs != null) c.debt = +result.custDebtUzs; if (result.custCreditUzs != null) c.credit = +result.custCreditUzs; }
    auditLog(`Oflayn savdo serverga yozildi: ${sale.inv}`);
    svSaveShopData().catch(() => {});
  },
  fail(e, out) {
    const sale = S.sales.find(x => String(x.id) === String(e.sale.id));
    if (sale) { delete sale.pending; sale.status = 'voided'; sale.rejected = true; sale.rejectReason = out && out.error || ''; }
    auditLog(`⛔ Oflayn savdo qabul qilinmadi: ${e.sale.inv} — ${(out && out.error) || ''}`);
    svSaveShopData().catch(() => {});
  },
};

// ════════════════════════════════════════════
// QARZLAR — mijoz qarzlarini ko'rish va so'ndirish
// ════════════════════════════════════════════
function svDebtHtml() {
  const debtors = S.customers.filter(c=>(c.debt||0)>0).sort((a,b)=>(b.debt||0)-(a.debt||0));
  const totalDebt = debtors.reduce((s,c)=>s+(+c.debt||0),0);
  return `<section class="ox-hero fw-hero" style="--hc:var(--red)">
      <div class="ox-hero-top"><span>Mijozlardan olinadigan qarz</span><span class="ox-date">${debtors.length} ta qarzdor</span></div>
      <div class="ox-hero-big" style="color:${totalDebt>0?'var(--red)':'inherit'}">${CUR.fmtUzs(totalDebt)}</div>
      <div class="ox-hero-cols" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div><b>${CUR.fmtUsd(CUR.toUsd(totalDebt))}</b><span>Dollarda</span></div>
        <div><b>${debtors[0] ? esc(debtors[0].name) : '—'}</b><span>Eng katta qarzdor</span></div></div>
    </section>
    ${fwDueBoard(fwDueRemindersNow(), { payFn: 'svOpenPay', limit: 50 })}
    <div class="dl-card">
    ${debtors.length ? debtors.map(c=>`
      <div class="dl-prow">
        <div style="flex:1;min-width:0"><div class="dl-pname">${esc(c.name)}</div><div class="dl-pmeta">${esc(c.phone||'')}</div><div style="margin-top:4px">${fwDueChip(fwCustDueSum(c, S.sales, fwLocalDay()))}</div></div>
        <div style="flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <span style="font-weight:800;color:var(--red);white-space:nowrap">${CUR.fmtUzs(c.debt)}</span>
          <span style="display:flex;gap:6px"><button class="btn btn-ghost btn-sm" onclick="fwDueSend(${c.id})">Xabar</button>
          <button class="btn btn-success btn-sm" onclick="svOpenPay(${c.id})">To'lov</button></span>
        </div>
      </div>`).join('') : `<div style="text-align:center;padding:24px;color:var(--text-muted)">
        <div style="font-size:32px;margin-bottom:6px">✅</div>Qarzdor mijoz yo'q</div>`}
  </div>`;
}

function svOpenPay(cid) {
  const c = S.customers.find(x=>x.id===cid); if (!c) return;
  const boxes = S.cashboxes.filter(k=>k.type!=='dealer');
  const b0 = boxes[0];
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,.6);z-index:999;display:flex;align-items:flex-end;justify-content:center';
  overlay.innerHTML = `
    <div class="dls-sheet" role="dialog" aria-modal="true">
      <div class="dls-grip"></div>
      <div class="dls-sh"><div class="dl-pthumb" style="font-weight:800;font-size:14px">${esc((c.name||'?').trim().charAt(0).toUpperCase())}</div>
        <div class="dls-t"><b>${esc(c.name)}</b><small>Joriy qarz: <strong style="color:var(--red)">${CUR.fmtUzs(c.debt)}</strong></small></div></div>
      <label class="dls-l">Qaysi kassaga tushdi?</label>
      <select class="dl-input" id="sv-pay-box" data-cur="${b0?.cur||'UZS'}" onchange="svPayCur(${cid})">
        ${boxes.map(k=>`<option value="${k.id}" data-cur="${k.cur}">${esc(k.icon||'')} ${esc(k.name)}</option>`).join('')}
      </select>
      <label class="dls-l">Summa (<span id="sv-pay-u">${b0?.cur==='USD'?'$':"so'm"}</span>)</label>
      <input class="dl-input" id="sv-pay-amt" type="number" step="0.01" min="0" inputmode="decimal" value="${b0?.cur==='USD'?CUR.toUsd(c.debt||0).toFixed(2):Math.round(c.debt||0)}" oninput="svPayLeft(${cid})">
      <div class="me-chips" style="margin:-4px 0 10px">${[[1,'Hammasi'],[.5,'50%'],[.25,'25%']].map(([f,l])=>`<button type="button" onclick="svPayFill(${cid},${f})">${l}</button>`).join('')}</div>
      <div class="dls-sum"><span>To'lovdan keyin qarz</span><b id="sv-pay-left">—</b></div>
      <div class="dls-foot">
        <button class="btn btn-ghost" style="flex:1;justify-content:center" onclick="this.closest('div[style*=fixed]').remove()">Bekor</button>
        <button class="dl-btn" style="flex:1.4" onclick="svConfirmPay(${cid}, this)">✅ Qabul qilish</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if (e.target===overlay) overlay.remove(); });
  svPayLeft(cid);
}
// Kassa valyutasi o'zgarsa summa ham o'sha valyutaga o'giriladi (so'mdagi son $ bo'lib ketmasin)
function svPayCur(cid) {
  const sel = document.getElementById('sv-pay-box'), a = document.getElementById('sv-pay-amt'); if (!sel||!a) return;
  const from = sel.dataset.cur, to = sel.selectedOptions[0]?.dataset.cur || 'UZS'; sel.dataset.cur = to;
  const u = document.getElementById('sv-pay-u'); if (u) u.textContent = to==='USD'?'$':"so'm";
  const v = parseFloat(a.value)||0;
  if (from!==to && v>0) a.value = to==='USD' ? Math.round(CUR.toUsd(v)*100)/100 : Math.round(CUR.toUzs(v));
  svPayLeft(cid);
}
function svPayFill(cid, f) {
  const c = S.customers.find(x=>x.id===cid), a = document.getElementById('sv-pay-amt'); if (!c||!a) return;
  const cur = document.getElementById('sv-pay-box')?.dataset.cur;
  a.value = cur==='USD' ? Math.round(CUR.toUsd(c.debt||0)*f*100)/100 : Math.round((c.debt||0)*f);
  svPayLeft(cid);
}
function svPayLeft(cid) {
  const c = S.customers.find(x=>x.id===cid), el = document.getElementById('sv-pay-left'); if (!c||!el) return;
  const cur = document.getElementById('sv-pay-box')?.dataset.cur, v = parseFloat(document.getElementById('sv-pay-amt')?.value)||0;
  const left = (c.debt||0) - (cur==='USD' ? CUR.toUzs(v) : v);
  el.style.color = left < -1 ? 'var(--red)' : left > 0.5 ? 'var(--amber)' : 'var(--emerald)';
  el.textContent = left < -1 ? '⛔ Qarzdan oshib ketdi' : left > 0.5 ? CUR.fmtUzs(left) : 'Yopiladi ✓';
}

async function svConfirmPay(cid, btnEl) {
  const c = S.customers.find(x=>x.id===cid); if (!c) return;
  const boxId = parseInt(document.getElementById('sv-pay-box')?.value||0);
  const amt = parseFloat(document.getElementById('sv-pay-amt')?.value||0);
  if (!(amt>0) || !isFinite(amt)) { toast('Summa kiriting!','error'); return; }
  const box = S.cashboxes.find(k=>k.id===boxId); if (!box) { toast('⛔ Kassa tanlang','error'); return; }
  const amtUzs = box.cur==='USD' ? CUR.toUzs(amt) : amt;
  if (amtUzs > (c.debt||0) + 1) { toast(`⛔ To'lov mijoz qarzidan (${CUR.fmtUzs(c.debt||0)}) oshib ketdi`,'error'); return; }   // server ham (bazadagi qarz bo'yicha) tekshiradi

  btnEl.disabled = true; btnEl.textContent = 'Yuborilmoqda...';
  // v23 fail-close: kassa kirimi + to'lov yozuvi serverda BITTA tranzaksiyada (qarz server
  // ma'lumotidan tekshiriladi). Server rad etsa yoki javob bermasa — hech narsa o'zgarmaydi
  // (avval tarmoq xatosi "fail-open" bilan yutilib, to'lov tekshiruvsiz davom etardi).
  let _pr = null;
  try {
    _pr = await fwCashOps('cust_debt_pay', [{boxId:box.id, dir:'in', amount:amt, desc:`Qarz to'lovi — ${c.name} (${ME.name})`, custId:cid}], {
      remote:true, filial:SV_BRANCH, refType:'customer', refId:cid, record:{ customerId:cid },
      legacy: () => fwLegacyPost('customer-debt-payment-add', { customerLocalId:cid, customerName:c.name, amountUzs:amtUzs, boxId, debtBeforePaymentUzs:c.debt||0, idemKey:uid() }),
    });
  } catch(e) { toast('⛔ ' + e.message, 'error'); btnEl.disabled=false; btnEl.textContent="✅ Qabul qilish"; return; }
  // v23.2 (F4b): qarz serverda (qulf bilan) kamaydi — haqiqiy qiymat javobdan
  if (_pr && _pr.customerDebt != null) fwApplyLedger({ filial:SV_BRANCH, customers:{ [cid]: _pr.customerDebt } });
  else c.debt = Math.max(0, (c.debt||0) - amtUzs);
  auditLog(`Qarz to'lovi: ${c.name} — ${CUR.fmtUzs(amtUzs)}`);

  try {
    await svSaveShopData();
    document.querySelectorAll('div[style*="fixed"][style*="inset"]').forEach(o=>o.remove());   // v24: brauzer style atributini «position: fixed» qiladi — eski selektor topmasdi, oyna ochiq qolardi
    toast('✅ To\'lov qabul qilindi!');
    svRenderContent();
  } catch(e) { toast('Xatolik: '+e.message, 'error'); btnEl.disabled=false; btnEl.textContent="✅ Qabul qilish"; }
}

// ════════════════════════════════════════════
// KASSA (v23.7) — sotuvchining kuni va KASSA YOPISH.
// Savdo kassalaridagi pul ASOSIY kassaga — Bosh kassaga topshiriladi (server: firma-kassa
// daily_close, filial kassasi va Bosh kassa bitta tranzaksiyada; takroriy bosish ikki marta yozmaydi).
// Shaxsiy va diller kassalari bu yerda yo'q. Foyda ko'rsatilmaydi — faqat pul harakati.
// ════════════════════════════════════════════
const SV_KH = { pend: null, busy: false };
function svKhBoxes() { return (S.cashboxes||[]).filter(k => k.type!=='dealer' && k.type!=='qobiljon'); }
function svKhFmt(cur, n) { return cur==='USD' ? CUR.fmtUsd(n) : CUR.fmtUzs(n); }
function svMyDay(day) {
  const isSeller = ME.role === 'sotuvchi';
  const mine = S.sales.filter(s => s.date===day && s.status!=='cancelled' && (!isSeller || s.staffId===ME.id));
  const sum = (a, f) => a.reduce((t, x) => t + (+x[f] || 0), 0);
  const by = t => sum(mine.filter(s => s.payType===t), 'paidUsd');
  const tag = '(' + ME.name + ')';
  const debtIn = (S.cashTxns||[]).filter(t => t.date===day && t.type==='in' && t.custId != null && String(t.desc||'').includes(tag))
    .reduce((a, t) => a + (t.cur==='USD' ? (+t.amount||0) : CUR.toUsd(+t.amount||0)), 0);
  return { n: mine.length, rev: sum(mine, 'totalUsd'), cash: by('cash_uzs'), card: by('card'), usd: by('usd'), mixed: by('mixed'), debt: sum(mine, 'debtUsd'), debtIn,
    units: mine.reduce((t, s) => t + (s.items||[]).reduce((q, i) => q + (+i.qty||0), 0), 0) };
}
// Bu oy filialdagi o'rnim (tushum bo'yicha) — boshqalarning summasi ko'rsatilmaydi, faqat o'rin
function svMyRank() {
  const P = fwPeriod('month'), tot = {};
  S.sales.filter(s => s.staffId != null && s.status!=='cancelled' && fwIn(s.date, P.a, P.b)).forEach(s => { tot[s.staffId] = (tot[s.staffId]||0) + (+s.totalUsd||0); });
  const ids = Object.keys(tot).sort((a, b) => tot[b] - tot[a]);
  const i = ids.indexOf(String(ME.id));
  return { place: i >= 0 ? i + 1 : null, of: ids.length, mine: tot[ME.id] || 0 };
}
// Mening qarzdorlarim — men qarzga sotgan va hali qarzi bor mijozlar
function svMyDebtors() {
  const ids = new Set(S.sales.filter(s => s.staffId===ME.id && (+s.debtUsd||0) > 0 && s.custId != null).map(s => String(s.custId)));
  return (S.customers||[]).filter(c => ids.has(String(c.id)) && (+c.debt||0) > 0).sort((a, b) => (b.debt||0) - (a.debt||0));
}
function svKassaHtml() {
  const today = td(), d = svMyDay(today), r = svMyRank(), boxes = svKhBoxes(), debtors = svMyDebtors();
  const closings = fwClosingsSorted(S.dailyClosings).slice(0, 8);
  const row = (l, v, c='') => `<div class="dl-stat"><span style="color:var(--text-muted)">${l}</span><span style="font-weight:700${c?';color:'+c:''}">${v}</span></div>`;
  return `
    <div class="dl-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="font-size:14px">Mening kunim</b><span class="dl-pmeta">${fmtD(today)}</span></div>
      <div class="kh-kpis" style="margin-bottom:6px">
        <div class="kh-k gold"><small>Sotdim</small><b>${CUR.fmtUsd(d.rev)}</b><i>${d.n} ta chek · ${fwNum(d.units)} dona</i></div>
        <div class="kh-k emerald"><small>Qarz undirdim</small><b>${CUR.fmtUsd(d.debtIn)}</b></div>
        <div class="kh-k ${d.debt>0?'red':''}"><small>Qarzga berdim</small><b>${CUR.fmtUsd(d.debt)}</b></div>
      </div>
      ${row('Naqd (soʻm)', CUR.fmtUzs(CUR.toUzs(d.cash)))}${row('Karta', CUR.fmtUzs(CUR.toUzs(d.card)))}
      ${d.usd>0?row('Naqd ($)', CUR.fmtUsd(d.usd)):''}${d.mixed>0?row('Aralash', CUR.fmtUsd(d.mixed)):''}
      ${r.place ? row('Bu oy filialda oʻrnim', `${r.place} / ${r.of}`, r.place===1?'var(--emerald)':'') : ''}
    </div>

    <div class="dl-card">
      <div class="kh-to" style="margin-bottom:10px"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 10h3v7H4zM10.5 10h3v7h-3zM2 19h20v3H2zM17 10h3v7h-3zM12 1 2 6v2h20V6z"/></svg><div><b>Kassani yopish → Bosh kassa</b><small>Pul asosiy kassaga topshiriladi va tizimda qoladi</small></div></div>
      ${boxes.length ? boxes.map(k => { const t = (S.cashTxns||[]).filter(x => x.date===today && String(x.boxId)===String(k.id));
        const inn = t.filter(x=>x.type==='in').reduce((a,x)=>a+(+x.amount||0),0), out = t.filter(x=>x.type==='out').reduce((a,x)=>a+(+x.amount||0),0);
        return `<div class="kh-box">
          <div class="kh-box-h"><b>${esc(k.icon||'')} ${esc(k.name)}</b><span>${svKhFmt(k.cur, k.bal||0)}</span></div>
          <div class="kh-box-m"><span class="in">+${svKhFmt(k.cur, inn)}</span><span class="out">−${svKhFmt(k.cur, out)}</span><span>bugun</span></div>
          <div class="kh-box-r"><div class="me-amt"><input class="form-control" id="svkh-${k.id}" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0" oninput="svKhLeft('${k.id}')"><i>${k.cur==='USD'?'$':"so'm"}</i></div>
            <button type="button" class="btn btn-ghost btn-sm" onclick="svKhAll('${k.id}')" ${(k.bal||0)>0?'':'disabled'}>Hammasi</button></div>
          <div class="kh-left" id="svkh-left-${k.id}"></div>
        </div>`; }).join('') : '<div class="kh-empty">Filialda savdo kassasi yoʻq</div>'}
      <input class="dl-input" id="svkh-note" maxlength="300" placeholder="Izoh (ixtiyoriy): smena topshirildi…" style="margin:4px 0 10px">
      <button class="dl-btn" id="svkh-btn" onclick="svKassaClose()" ${boxes.length?'':'disabled'}>Kassani yopish</button>
      <div class="dl-pmeta" style="margin-top:8px">Boʻsh qoldirilgan kassadan pul olinmaydi — ertaga savdo davom etadi.</div>
    </div>

    ${debtors.length ? `<div class="dl-card"><b style="font-size:14px">Mening qarzdorlarim</b>
      ${debtors.slice(0, 8).map(c => `<div class="dl-prow"><div><div class="dl-pname">${esc(c.name)}</div>${c.phone?`<div class="dl-pmeta">${esc(c.phone)}</div>`:''}</div>
        <div style="display:flex;gap:6px;align-items:center"><span class="dl-qty" style="color:var(--red)">${CUR.fmtUzs(c.debt||0)}</span><button class="btn btn-ghost btn-sm" onclick="svOpenPay(${JSON.stringify(c.id).replace(/"/g,'&quot;')})">Undirish</button></div></div>`).join('')}
    </div>` : ''}

    <div class="dl-card"><b style="font-size:14px">Kassa yopish tarixi</b>
      ${closings.length ? closings.map(c => `<div class="kh-h">
        <div class="kh-h-t"><b>${fmtD(c.date)}${c.ts?` · ${esc(new Date(c.ts).toTimeString().slice(0,5))}`:''}</b><span>${(c.entries||[]).map(e=>svKhFmt(e.cur, e.amount)).join(' + ')}</span></div>
        <div class="kh-h-s">${esc(c.performedBy||'—')} · ${c.toFirma?'→ Bosh kassa':'→ eski tartib'}${c.note?` · ${esc(c.note)}`:''}</div></div>`).join('') : '<div class="kh-empty">Hali kassa yopilmagan</div>'}
    </div>`;
}
function svKhLeft(id) {
  const k = svKhBoxes().find(b => String(b.id)===String(id)), el = document.getElementById('svkh-left-'+id); if (!k || !el) return;
  const v = parseFloat(document.getElementById('svkh-'+id)?.value) || 0;
  el.textContent = v > 0 ? `Kassada qoladi: ${svKhFmt(k.cur, Math.max(0, (k.bal||0) - v))}` : '';
  el.classList.toggle('bad', v > (k.bal||0) + 0.005);
}
function svKhAll(id) {
  const k = svKhBoxes().find(b => String(b.id)===String(id)), el = document.getElementById('svkh-'+id); if (!k || !el) return;
  el.value = k.cur==='USD' ? Math.round((k.bal||0)*100)/100 : Math.round(k.bal||0); el.dispatchEvent(new Event('input')); svKhLeft(id);
}
async function svKassaClose() {
  if (SV_KH.busy) return;
  const note = (document.getElementById('svkh-note')?.value||'').trim().slice(0, 300);
  const entries = []; let over = null;
  svKhBoxes().forEach(k => {
    const amt = parseFloat(document.getElementById('svkh-'+k.id)?.value||0);
    if (!(amt>0) || !isFinite(amt)) return;
    if (amt > (k.bal||0) + 0.005) over = over || k;
    entries.push({ boxId:k.id, boxName:k.name, boxIcon:k.icon, cur:k.cur, amount:Math.round(amt*100)/100, currentBal:k.bal });
  });
  if (over) { toast(`⛔ "${over.name}"da yetarli mablagʻ yoʻq`, 'error'); return; }
  if (!entries.length) { toast('Kamida bitta kassadan summa kiriting', 'error'); return; }
  const sig = JSON.stringify([SV_BRANCH, entries.map(e=>[e.boxId, e.amount])]);
  if (!SV_KH.pend || SV_KH.pend.sig !== sig) SV_KH.pend = { sig, id: 'dc' + uid(), done: {} };
  const pend = SV_KH.pend, btn = document.getElementById('svkh-btn');
  SV_KH.busy = true; if (btn) { btn.disabled = true; btn.textContent = 'Yuborilmoqda…'; }
  const desc = note ? `🏛 Kassa yopish → Bosh kassa (${ME.name}) — ${note}` : `🏛 Kassa yopish → Bosh kassa (${ME.name})`;
  try {
    for (const e of entries) {
      if (pend.done[e.boxId]) continue;
      let res, d;
      try {
        res = await authFetch('/.netlify/functions/firma-kassa', { method:'POST', body: JSON.stringify({ action:'daily_close', currency:e.cur, amount:e.amount, boxId:e.boxId, filial:SV_BRANCH, note: note || null, idemKey:`${pend.id}-${e.boxId}` }) });
        d = await res.json().catch(() => ({}));
      } catch (_) { toast("⛔ Server bilan aloqa yoʻq — qayta bosing (takror yozilmaydi)", 'error'); return; }
      if (!res.ok || d.ok === false) {
        const n = Object.keys(pend.done).length;
        toast(`⛔ ${e.boxName}: ${fwCashErr(String(d.error || 'Kassa yopilmadi').replace(/^FIRMA_KASSA:\s*/, ''))}${n ? ` (${n} ta kassa allaqachon topshirildi — qayta bosing)` : ''}`, 'error');
        if (res.status < 500 && !n) SV_KH.pend = null;
        if (n) await svSaveShopData().catch(()=>{});
        return;
      }
      pend.done[e.boxId] = true;
      if (d.transfer && d.transfer.branchBalance != null) { fwApplyCashBalances({ [e.boxId]: +d.transfer.branchBalance }); fwCashSeq++; }
      if (!d.duplicate) logCashTxn({ boxId:e.boxId, type:'out', amount:e.amount, desc });
    }
    SV_KH.pend = null;
    const day = svMyDay(td());
    S.dailyClosings = S.dailyClosings || [];
    S.dailyClosings.unshift({ id:uid(), date:td(), ts:new Date().toISOString(), entries, salesCount:day.n, totalRevenue:day.rev, totalDebt:day.debt, debtIn:day.debtIn,
      note: note || null, toFirma:true, performedBy: ME.name, performedByStaffId: ME.id, performedByKind:'staff', viaPortal:'sotuvchi' });
    auditLog(`Kassa yopildi — Bosh kassaga: ${entries.map(e=>svKhFmt(e.cur, e.amount)).join(', ')}${note?` — ${note}`:''}`);
    await svSaveShopData();
    toast('✅ Kassa yopildi — pul Bosh kassaga topshirildi');
    svRenderContent();
  } finally {
    SV_KH.busy = false; const b2 = document.getElementById('svkh-btn'); if (b2) { b2.disabled = false; b2.textContent = 'Kassani yopish'; }
  }
}

// ════════════════════════════════════════════
// TARIX — so'nggi savdolar
// ════════════════════════════════════════════
function svHistoryHtml() {
  const isSeller = ME.role === 'sotuvchi';
  const mySales = isSeller ? S.sales.filter(s=>s.staffId===ME.id) : S.sales;
  const myExpAll = isSeller ? S.expenses.filter(e=>e.staffId===ME.id) : S.expenses;
  const today = td();
  const todaySales = mySales.filter(s=>s.date===today);
  const todayExp = myExpAll.filter(e=>e.date===today);

  const cashUsd = todaySales.filter(s=>s.payType==='cash_uzs').reduce((s,x)=>s+x.paidUsd,0);
  const cardUsd = todaySales.filter(s=>s.payType==='card').reduce((s,x)=>s+x.paidUsd,0);
  const usdCashUsd = todaySales.filter(s=>s.payType==='usd').reduce((s,x)=>s+x.paidUsd,0);
  const debtToday = todaySales.reduce((s,x)=>s+(x.debtUsd||0),0);
  const totalToday = todaySales.reduce((s,x)=>s+x.totalUsd,0);
  const expTodayUsd = todayExp.reduce((s,x)=>s+(x.amtUsd||0),0);
  const expectedCashUzs = CUR.toUzs(cashUsd) - todayExp.filter(e=>e.cur==='UZS').reduce((s,e)=>s+e.amount,0);

  const saleCurLabel = (s) => {
    if (s.payType==='debt') return `<span style="color:var(--red)">Qarz</span>`;
    if (s.payType==='mixed') return `Aralash`;
    if (s.payType==='usd') return CUR.fmtUsd(s.totalUsd);
    return CUR.fmtUzs(CUR.toUzs(s.totalUsd)); // cash_uzs yoki card — so'mda ko'rsatamiz
  };

  const recent = mySales.slice().reverse().filter(s=>{
    const days = (new Date(today) - new Date(s.date)) / 86400000;
    return days <= 10;
  });

  return `
    <div id="sv-stats" class="fws-wrap">${svStatsHtml()}</div>
    <div class="dl-card" style="margin-bottom:12px">
      <div style="font-weight:700;font-size:14px;margin-bottom:10px">📅 Bugungi yakun</div>
      <div class="dl-stat"><span style="color:var(--text-muted)">Jami savdo</span><span style="font-weight:800;color:var(--gold)">${CUR.fmtUsd(totalToday)}</span></div>
      <div class="dl-stat"><span style="color:var(--text-muted)">Naqd (soʻm)</span><span style="font-weight:700">${CUR.fmtUzs(CUR.toUzs(cashUsd))}</span></div>
      <div class="dl-stat"><span style="color:var(--text-muted)">Karta</span><span style="font-weight:700">${CUR.fmtUzs(CUR.toUzs(cardUsd))}</span></div>
      ${usdCashUsd>0?`<div class="dl-stat"><span style="color:var(--text-muted)">Naqd ($)</span><span style="font-weight:700">${CUR.fmtUsd(usdCashUsd)}</span></div>`:''}
      ${debtToday>0?`<div class="dl-stat"><span style="color:var(--text-muted)">Qarzga sotilgan</span><span style="font-weight:700;color:var(--red)">${CUR.fmtUsd(debtToday)}</span></div>`:''}
      <div class="dl-stat"><span style="color:var(--text-muted)">Bugungi xarajat</span><span style="font-weight:700;color:var(--red)">${CUR.fmtUsd(expTodayUsd)}</span></div>
      <div class="dl-stat" style="border-top:2px solid var(--border);margin-top:4px;padding-top:10px">
        <span style="font-weight:700">🧮 Qoʻlda qolishi kerak (naqd soʻm)</span>
        <span style="font-weight:800;color:var(--emerald)">${CUR.fmtUzs(expectedCashUzs)}</span>
      </div>
    </div>
    <div class="dl-card">
      <div style="font-weight:700;font-size:13px;margin-bottom:8px">🕒 Savdolarim (oxirgi 10 kun)</div>
      ${recent.length ? recent.map(s=>`
        <div style="border-bottom:1px solid var(--border-light);padding:10px 0">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><div class="dl-pname">${esc(s.inv)} — ${esc(fwCustLabel(s.custName))}</div><div class="dl-pmeta">${fmtD(s.date)} · ${(s.items||[]).length} xil mahsulot</div></div>
            <div class="dl-qty">${saleCurLabel(s)}</div>
          </div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="btn btn-ghost btn-sm" onclick="svToggleSaleView('${s.id}')">👁️ Koʻrish</button>
            <button class="btn btn-ghost btn-sm" onclick="svPrintSale('${s.id}')">🖨️ Chop etish</button>
            <button class="btn btn-ghost btn-sm" onclick="svEditSale('${s.id}')">✏️ Tahrirlash</button>
          </div>
          <div id="sale-view-${s.id}" style="display:none;margin-top:8px;background:var(--bg-secondary);border-radius:8px;padding:8px">
            ${(s.items||[]).map(i=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">
              <span>${esc(i.name)} × ${i.qty}</span><span>${CUR.fmtUsd(i.lineUsd||i.qty*i.sellUsd)}</span>
            </div>`).join('')}
          </div>
        </div>`).join('') : `<div style="text-align:center;padding:24px;color:var(--text-muted)">Hali savdo yoʻq</div>`}
    </div>`;
}

// ── 📈 MENING STATISTIKAM (2026-10-01) — davr bo'yicha savdolarim, eng yaxshi va
// sotilmayotgan mahsulotlar, to'lov turlari, faol soatlar. Faqat O'QIYDI.
// Sotuvchi (role='sotuvchi') faqat o'z savdolarini ko'radi; tannarx/foyda ko'rsatilmaydi.
const SV_ST = { per:'month', prod:'top' };
function svStatsHtml() {
  const isSeller = ME.role === 'sotuvchi';
  const mine = isSeller ? S.sales.filter(s => s.staffId === ME.id) : S.sales;
  const P = fwPeriod(SV_ST.per);
  const cur = mine.filter(s => fwIn(s.date, P.a, P.b)), prev = mine.filter(s => fwIn(s.date, P.pa, P.pb));
  const sum = (a, f) => a.reduce((t, x) => t + (+x[f] || 0), 0);
  const qtyOf = a => a.reduce((t, s) => t + (s.items||[]).reduce((q, i) => q + (+i.qty||0), 0), 0);
  const rev = sum(cur, 'totalUsd'), units = qtyOf(cur);
  const imgOf = pid => { const p = (S.products||[]).find(x => String(x.id) === String(pid)); return p ? ((p.images && p.images[0]) || p.image || '') : ''; };
  // Sotuvsiz: do'konda qoldig'i bor, lekin bu davrda (hech kim tomonidan) sotilmagan — xaridorga taklif qilish uchun
  const soldAll = new Set(fwSaleLines(S.sales.filter(s => fwIn(s.date, P.a, P.b))).map(l => String(l.pid)));
  const unsold = (S.products||[]).filter(p => !p.archived && !p.directSale && !soldAll.has(String(p.id)) && getStock(p.id) > 0).map(p => ({ pid:p.id, name:p.name, sku:p.sku, qty:getStock(p.id) }));
  return `
    <div class="fws-head" style="margin:0"><b>📈 ${isSeller ? 'Mening statistikam' : "Do'kon statistikasi"}</b><i></i><span class="fws-pill" style="--c:var(--sky)">${fwRangeLabel(P)}</span></div>
    ${fwTabsHtml(SV_ST.per, 'svStSetPer')}
    ${fwKpisHtml([
      { l:'Tushum', v:fwUsd(rev), c:'emerald', trend:fwTrendHtml(rev, sum(prev, 'totalUsd')) },
      { l:'Cheklar', v:fwNum(cur.length), c:'purple', trend:fwTrendHtml(cur.length, prev.length) },
      { l:"O'rtacha chek", v:fwUsd(cur.length ? rev / cur.length : 0), c:'sky', trend:fwTrendHtml(cur.length ? rev / cur.length : 0, prev.length ? sum(prev, 'totalUsd') / prev.length : 0) },
      { l:'Sotilgan', v:fwNum(units) + ' dona', c:'amber', trend:fwTrendHtml(units, qtyOf(prev)) },
    ])}
    <div class="fws-grid">
      ${fwRankCardHtml({ mode: SV_ST.prod, fn:'svStSetProd', range: fwRangeLabel(P), sold: fwSaleLines(cur), imgOf, showProfit: !isSeller, unsold,
        unsoldNote: "Bu mahsulotlarni xaridorlarga ko'proq taklif qiling." })}
      ${fwCardHtml('Dinamika', fwBarsHtml(fwSeries(cur, s => s.date, s => s.totalUsd, P, s => fwTsFromUid(s.id)), { c:'emerald', titleOf: fwPointTitle }), `<span class="fws-pill" style="--c:var(--emerald)">${fwUsd(rev)}</span>`)}
      ${fwCardHtml("To'lov turlari", fwPayStackHtml(cur))}
      ${fwCardHtml('Faol soatlar', fwHoursHtml(cur))}
    </div>`;
}
function svStRerender() { const el = document.getElementById('sv-stats'); if (el) el.innerHTML = svStatsHtml(); }
function svStSetPer(p) { SV_ST.per = p; svStRerender(); }
function svStSetProd(m) { SV_ST.prod = m; svStRerender(); }

function svToggleSaleView(saleId) {
  const el = document.getElementById('sale-view-'+saleId);
  if (el) el.style.display = el.style.display==='none' ? '' : 'none';
}

function svPrintSale(saleId) {
  const s = S.sales.find(x=>String(x.id)===String(saleId)); if (!s) return;
  const st = S.settings || {}, bs = S.branchSettings || {};
  const _w = bs.receiptWidth !== undefined ? +bs.receiptWidth : +st.receiptWidth;   // v25.1: filial chek o'lchami ustun
  const mm = [58,72,80].includes(_w) ? _w : 72;
  // v24.5: chek — PDF, yuborish (Telegram va h.k.), chop etish
  fwDoc({ title: 'Chek ' + (s.inv || ''), kind: 'receipt', widthMm: mm,
    html: fwReceiptHtml(s, { brand: fwBrand().name, phone: bs.phone || st.shopPhone, address: bs.address || st.shopAddress, footer: bs.receipt || st.receipt, widthMm: mm, rate: CUR.usdUzs }) });
}

function svEditSale(saleId) {
  const s = S.sales.find(x=>x.id===saleId); if (!s) return;
  const _w = fwEditWindow(s.date, ME && ME.role === 'admin' ? 'admin' : 'seller');   // haqiqiy tekshiruv — serverda
  if (!_w.ok) { toast(fwEditWindowMsg(_w), 'error'); return; }
  // v24.4: oy foydasi hamkorlarga taqsimlangan bo'lsa — sotuvchi o'zgartirmaydi (taqsimotni administrator qayta hisoblaydi)
  const _ym = String(s.date || '').slice(0, 7);
  if ((S.partnerPeriods || []).some(p => (p.filial || 'baza') === SV_BRANCH && (p.month || String(p.start || '').slice(0, 7)) === _ym)) {
    toast('⛔ Bu oy foydasi hamkorlarga taqsimlangan (oy yopilgan) — oʻzgartirish uchun administratorga murojaat qiling', 'error'); return;
  }
  modal(`
    <div class="modal-header"><div class="modal-title">✏️ ${esc(s.inv)} — narxni tahrirlash</div><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">Faqat narxni tuzatish mumkin (miqdor/mahsulot oʻzgarmaydi — ombor xavfsizligi uchun).</div>
      ${(s.items||[]).map((i,idx)=>`
        <div class="form-group">
          <label class="form-label">${esc(i.name)} (${i.qty} dona)</label>
          <input class="form-control" id="es-price-${idx}" type="number" step="0.01" value="${i.sellUsd}">
        </div>`).join('')}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Bekor</button>
      <button class="btn btn-primary" onclick="svSaveSaleEdit('${saleId}')">💾 Saqlash</button>
    </div>`);
}

async function svSaveSaleEdit(saleId) {
  const s = S.sales.find(x=>x.id===saleId); if (!s) return;
  const oldTotal = s.totalUsd;
  // v11 (F4): yangi narxlar AVVAL hisoblanadi (savdo yozuvi hali o'zgarmaydi), kassa farqi serverda
  const prices = (s.items||[]).map((i,idx)=>parseFloat(document.getElementById(`es-price-${idx}`)?.value||i.sellUsd));
  if (prices.some(p=>!(p>=0) || !isFinite(p))) { toast("Narx noto'g'ri!",'error'); return; }
  const newSubtotal = (s.items||[]).reduce((sum,i,idx)=>sum + i.qty*prices[idx], 0);
  const discUsd = newSubtotal * (s.disc||0)/100;
  const newTotal = newSubtotal - discUsd;
  const deltaUsd = newTotal - oldTotal;

  // v23.2 (F4b): narx tahriri — farq (kassa yoki mijoz qarzi) SERVERDA, bazadagi savdo yozuvidan hisoblanadi
  if (fwLedgerRemote()) {
    let r;
    try { r = await fwLedgerCall('sale-ops', { action:'edit', saleLocalId:String(s.id), mode:'price', payload:{ prices } }); }
    catch(e) { toast('⛔ ' + e.message, 'error'); return; }
    if (r.sale) fwApplySaleFromServer(s, r.sale);
    s.discUsd = r.sale && r.sale.discUsd != null ? +r.sale.discUsd : discUsd;
    auditLog(`Savdo tahrirlandi (${ME.name}): ${esc(s.inv)} — yangi summa ${CUR.fmtUsd(s.totalUsd)}`);
    svSaveShopData();
    closeModal(); svRenderContent();
    toast('✅ Saqlandi!');
    return;
  }

  if (s.payType!=='debt') {
    const box = S.cashboxes.find(k=>k.id===s.boxId);
    const amt = box ? (box.cur==='USD'?deltaUsd:CUR.toUzs(deltaUsd)) : 0;
    if (box && Math.abs(amt) >= 0.005) {
      try { await fwCashOps('sale_fix', [{boxId:box.id, dir: amt>=0?'in':'out', amount:Math.abs(amt), desc:`Savdo tahrirlandi: ${esc(s.inv)}`}], { remote:true, filial:SV_BRANCH, refType:'sale', refId:s.inv }); }
      catch(e) { toast('⛔ ' + e.message, 'error'); return; }
    }
  }

  (s.items||[]).forEach((i,idx)=>{ i.sellUsd = prices[idx]; i.lineUsd = i.qty*prices[idx]; });
  s.subtotalUsd = newSubtotal; s.discUsd = discUsd; s.totalUsd = newTotal;

  // Farqni to'lov/qarz taqsimotiga qo'shamiz (naqd/karta qismi o'zgarmaydi, farq qarzga/kassaga qo'shiladi)
  if (s.payType==='debt') {
    s.debtUsd = Math.max(0, s.debtUsd + deltaUsd);
    if (s.custId) { const c=S.customers.find(x=>x.id===s.custId); if (c) c.debt = Math.max(0,(c.debt||0) + CUR.toUzs(deltaUsd)); }
  } else {
    s.paidUsd = Math.max(0, s.paidUsd + deltaUsd);
  }
  auditLog(`Savdo tahrirlandi (${ME.name}): ${esc(s.inv)} — yangi summa ${CUR.fmtUsd(newTotal)}`);
  svSaveShopData();
  closeModal(); svRenderContent();
  toast('✅ Saqlandi!');
}

async function svLogout() {
  if (typeof fwLogoutFlow === 'function') { const nm = ME && ME.name; ME = null; CART = []; return fwLogoutFlow(db, nm); }
  await db.auth.signOut();
  ME = null; S = null; CART = []; SALE_CUST_ID = null;
  svShowLogin();
}

// ════════════════════════════════════════════
// BUYURTMALAR — dillerlardan kelgan so'rovlarni ko'rish/tasdiqlash/rad etish
// ════════════════════════════════════════════
async function svLoadOrdersIfNeeded(quiet) {
  if (SV_ORDERS_LOADED) return;
  SV_ORDERS_LOADED = true;
  await svRefreshOrders(quiet);
}

async function svRefreshOrders(quiet) {
  try {
    const res = await authFetch('/.netlify/functions/dealer-data-load', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ filial: SV_BRANCH })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    S.dealers = data.dealers || [];
    const ids = S.dealers.map(d=>d.id);
    if (ids.length) {
      const ordRes = await authFetch('/.netlify/functions/dealer-orders-list', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ dealerIds: ids })
      });
      const ordData = await ordRes.json();
      if (!ordRes.ok) throw new Error(ordData.error);
      S.dealerOrders = ordData.orders || [];
    } else {
      S.dealerOrders = [];
    }
  } catch(e) { if (quiet) SV_ORDERS_LOADED = false; else toast('Buyurtmalar yuklanmadi: '+e.message, 'error'); }
  await svLoadNotif();
  svUpdateBell();
  if (ACTIVE_TAB === 'orders') document.getElementById('sv-content').innerHTML = svOrdersHtml();
}

// v24 (31-migratsiya): sotuvchiga bildirishnomalar (masalan, administrator savdosini tuzatdi) — 7 kun; eskisi arxivda
const SV_NTF = { items: [], unread: 0, err: '', off: false };
async function svLoadNotif() {
  try {
    const res = await authFetch('/.netlify/functions/notifications', { method:'POST', body: JSON.stringify({ action:'list', scope:'active' }) });
    const d = await res.json().catch(()=>({}));
    if (res.status === 409 && d.migration31Pending) { SV_NTF.off = true; SV_NTF.items = []; SV_NTF.unread = 0; return; }
    if (!res.ok) throw new Error(d.error || 'Yuklanmadi');
    SV_NTF.items = d.items || []; SV_NTF.unread = +d.unread || 0; SV_NTF.err = ''; SV_NTF.off = false;
  } catch(e) { SV_NTF.err = e.message; }
}
async function svNotifRead() {
  const ids = SV_NTF.items.filter(n=>!n.read).map(n=>n.id); if (!ids.length) return;
  try {
    const res = await authFetch('/.netlify/functions/notifications', { method:'POST', body: JSON.stringify({ action:'read', ids }) });
    if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error || 'Saqlanmadi');
    SV_NTF.items.forEach(n=>{ n.read = true; }); SV_NTF.unread = 0; svUpdateBell();
    if (ACTIVE_TAB === 'orders') document.getElementById('sv-content').innerHTML = svOrdersHtml();
  } catch(e) { toast('⛔ ' + e.message, 'error'); }
}
function svNotifHtml() {
  if (SV_NTF.off || (!SV_NTF.items.length && !SV_NTF.err)) return '';
  return `<div class="dl-card" style="margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-weight:700;font-size:13px">🔔 Bildirishnomalar${SV_NTF.unread ? ` (${SV_NTF.unread})` : ''}</div>
      ${SV_NTF.unread ? `<button class="btn btn-ghost btn-sm" onclick="svNotifRead()">Oʻqildi</button>` : ''}</div>
    ${SV_NTF.err ? `<div style="color:var(--red);font-size:12px">${esc(SV_NTF.err)}</div>` : ''}
    ${SV_NTF.items.slice(0, 20).map(n => `<div class="ntf-it ${n.read ? '' : 'new'}"><div class="ntf-b"><b>${esc(n.title)}</b>${n.body ? `<p>${esc(n.body)}</p>` : ''}<small>${esc(new Date(n.createdAt).toLocaleString('uz-UZ', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }))}</small></div></div>`).join('')}
  </div>`;
}

function svOrdersHtml() {
  const pending = (S.dealerOrders||[]).filter(o=>o.status==='pending');
  const resolved = (S.dealerOrders||[]).filter(o=>o.status!=='pending').slice(0,10);
  const dealerName = id => (S.dealers||[]).find(d=>d.id===id)?.name || '—';
  const renderItems = (o) => (o.items||[]).map((i,idx)=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:12px;gap:8px">
      <span style="flex:1">${esc(i.name)}</span>
      <input type="number" data-order-item="${o.id}:${idx}" value="${i.qty}" min="0"
        style="width:60px;padding:5px;border:1px solid var(--border);border-radius:6px;text-align:center;font-size:12px">
    </div>`).join('');
  return `${svNotifHtml()}
    <div class="dl-card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-weight:700;font-size:13px">📥 Yangi buyurtmalar (${pending.length})</div>
        <button class="btn btn-ghost btn-sm" onclick="svRefreshOrders()">🔄</button>
      </div>
      ${pending.length ? pending.map(o=>`
        <div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;margin-bottom:10px">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">🏪 <strong>${esc(dealerName(o.dealer_id))}</strong> · ${fmtD(o.created_at)}</div>
          ${renderItems(o)}
          <div style="display:flex;gap:6px;margin-top:10px">
            <button class="btn btn-primary btn-sm" style="flex:1;justify-content:center" onclick="svApproveOrder('${o.id}')">✅ Tasdiqlash</button>
            <button class="btn btn-danger btn-sm" style="flex:1;justify-content:center" onclick="svRejectOrder('${o.id}')">❌ Rad etish</button>
          </div>
        </div>`).join('') : `<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px">Yangi buyurtma yoʻq</div>`}
    </div>
    <div class="dl-card">
      <div style="font-weight:700;font-size:13px;margin-bottom:8px">🕒 Oxirgi hal qilinganlar</div>
      ${resolved.length ? resolved.map(o=>`
        <div class="dl-prow">
          <div><div class="dl-pname">${esc(dealerName(o.dealer_id))}</div><div class="dl-pmeta">${fmtD(o.created_at)} · ${(o.items||[]).length} xil mahsulot</div></div>
          <span class="badge badge-${o.status==='approved'?'success':'danger'}">${o.status==='approved'?'✅ Berildi':'❌ Rad etildi'}</span>
        </div>`).join('') : `<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px">Yoʻq</div>`}
    </div>`;
}

// ── DILLER AUDIT JURNALI — kim/qachon/qaysi filialdan/eski-yangi qiymat ──
function svAuditDealer(dealerId, action, oldValue, newValue) {
  if (!dealerId) return Promise.resolve();
  return authFetch('/.netlify/functions/dealer-audit-log-add', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ dealerId, action, actorKind:'staff', actorName: ME?.name||'Xodim', actorStaffId: ME?.id||null, filial: SV_BRANCH, oldValue: oldValue??null, newValue: newValue??null })
  }).catch(()=>{});
}

async function svApproveOrder(orderId) {
  const order = (S.dealerOrders||[]).find(o=>o.id===orderId);
  if (!order) return;
  const original = order.items||[];
  const items = [];
  original.forEach((orig, idx) => {
    const input = document.querySelector(`input[data-order-item="${orderId}:${idx}"]`);
    const qty = input ? parseFloat(input.value||0) : orig.qty;
    if (qty > 0) items.push({ ...orig, qty });
  });
  if (!items.length) { toast("Kamida bitta mahsulot miqdori 0 dan katta bo'lishi kerak!",'error'); return; }
  for (const i of items) {
    const st = getStock(i.pid);
    if (i.qty > st) { toast(`${i.name}: omborda ${st} bor, ${i.qty} yetkazib bo'lmaydi!`,'error'); return; }
  }
  if (!confirm("Buyurtmani tasdiqlaysizmi? Tovar diller omboriga o'tkaziladi.")) return;

  let totalCost = 0;
  // v24.5 (35-migratsiya): firma ombori (FIFO) + diller ombori + buyurtma tasdig'i — serverda BITTA tranzaksiyada;
  // rad etilsa hech narsa o'zgarmaydi, buyurtmani ikki marta tasdiqlab bo'lmaydi
  let dres;
  try { dres = await fwDealerCall({ kind:'ship', dealerId:order.dealer_id, orderId, items: items.map(i=>({ pid:i.pid, qty:i.qty, sku:i.sku, name:i.name })) }); }
  catch(e) { toast('⛔ ' + e.message, 'error'); return; }
  if (dres) {
    const dealer = (S.dealers||[]).find(d=>d.id===order.dealer_id);
    if (dealer && dres.dealer) dealer.total_shipped_usd = +dres.dealer.totalShipped || 0;
    auditLog(`Buyurtma tasdiqlandi (${ME.name}): ${dealer?.name} — ${items.reduce((s,i)=>s+i.qty,0)} dona`);
    await svSaveShopData();
    toast(`✅ Tasdiqlandi — ${dealer?.name}ning omboriga oʻtkazildi!`);
    svAuditDealer(order.dealer_id, 'order_approve', null, { orderId, items, totalCost: +dres.totalCostUsd || 0 });
    await svRefreshOrders();
    return;
  }
  // 35-migratsiyagacha (eski yo'l) — v23.2 (F4b): filial omboridan chiqarish (FIFO) — SERVERDA, bitta tranzaksiyada; tannarx javobdan
  let srvCost = null;
  if (fwLedgerRemote()) {
    try {
      const r = await fwLedgerCall('stock-debt-ops', { kind:'stock_out', payload:{ reason:'dealer', dealerId:String(order.dealer_id), items: items.map(i=>({ pid:i.pid, qty:i.qty })) } });
      srvCost = new Map((r.items||[]).map(x=>[+x.pid, +x.firstCost]));
    } catch(e) { toast('⛔ ' + e.message, 'error'); return; }
  }
  try {
    for (const i of items) {
      const costNow = srvCost ? (srvCost.get(+i.pid)||0) : getCostFIFO(i.pid);
      if (!srvCost) deductFIFO(i.pid, i.qty); // o'z filial ombiridan ayiriladi
      totalCost += i.qty*costNow;
      const existingRes = await authFetch('/.netlify/functions/dealer-stock-get', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ dealerId: order.dealer_id, pid: i.pid })
      });
      const existingData = await existingRes.json();
      if (!existingRes.ok) throw new Error(existingData.error);
      const existing = existingData.row;
      const newQty = (existing?.qty||0) + i.qty;
      const newAvg = newQty>0 ? (((existing?.qty||0)*(existing?.avg_cost_usd||0)) + (i.qty*costNow))/newQty : costNow;
      const upsertRes = await authFetch('/.netlify/functions/dealer-stock-upsert', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ dealerId: order.dealer_id, pid:i.pid, sku:i.sku, name:i.name, qty:newQty, avgCostUsd:newAvg })
      });
      const upsertData = await upsertRes.json();
      if (!upsertRes.ok) throw new Error(upsertData.error);
      const moveRes = await authFetch('/.netlify/functions/dealer-stock-move-add', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ dealerId: order.dealer_id, type:'send', pid:i.pid, sku:i.sku, name:i.name, qty:i.qty, costUsd:costNow })
      });
      const moveData = await moveRes.json();
      if (!moveRes.ok) throw new Error(moveData.error);
    }
    const dealer = (S.dealers||[]).find(d=>d.id===order.dealer_id);
    const newShipped = (dealer?.total_shipped_usd||0) + totalCost;
    const updRes = await authFetch('/.netlify/functions/dealer-update', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: order.dealer_id, fields: { totalShipped: newShipped } })
    });
    const updData = await updRes.json();
    if (!updRes.ok) throw new Error(updData.error);

    const statusRes = await authFetch('/.netlify/functions/dealer-order-status', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ orderId, status:'approved', items })
    });
    const statusData = await statusRes.json();
    if (!statusRes.ok) throw new Error(statusData.error);

    auditLog(`Buyurtma tasdiqlandi (${ME.name}): ${dealer?.name} — ${items.reduce((s,i)=>s+i.qty,0)} dona`);
    await svSaveShopData(); // ombor o'zgarishini saqlaymiz
    toast(`✅ Tasdiqlandi — ${dealer?.name}ning omboriga oʻtkazildi!`);
    svAuditDealer(order.dealer_id, 'order_approve', null, { orderId, items, totalCost });
    await svRefreshOrders();
  } catch(e) {
    toast('Xatolik: '+e.message, 'error');
  }
}

async function svRejectOrder(orderId) {
  if (!confirm("Bu buyurtmani rad etasizmi?")) return;
  const order = (S.dealerOrders||[]).find(o=>o.id===orderId);
  try {
    const res = await authFetch('/.netlify/functions/dealer-order-status', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ orderId, status:'rejected' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast('❌ Buyurtma rad etildi');
    if (order) svAuditDealer(order.dealer_id, 'order_reject', null, { orderId });
    await svRefreshOrders();
  } catch(e) { toast('Xatolik: '+e.message, 'error'); }
}

(async function svBoot() {
  const { data: { session } } = await db.auth.getSession();
  if (session) { await svLoadMe(); }
  else { svShowLogin(); }
})();
