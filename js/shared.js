// ════════════════════════════════════════════════════════════
// POWERFUL — UMUMIY YORDAMCHI FUNKSIYALAR (shared.js)
// ════════════════════════════════════════════════════════════
// Bu fayl index.html, diller.html va sotuvchi.html — barchasida
// asosiy skriptdan (main.js / diller.js / sotuvchi.js) OLDIN
// ulanadi. Bu yerdagi funksiyalar barcha 3 ilovada BIR XIL
// ishlaydi, shuning uchun bitta joyda saqlanadi (DRY printsipi).
//
// DIQQAT: bu yerga faqat 3 faylda ham SO'ZMA-SO'Z BIR XIL bo'lgan
// funksiyalar qo'shiladi. Agar biror ilovada boshqacha ishlashi
// KERAK bo'lsa (masalan auditLog — sotuvchida xodim ismi bilan),
// bunday funksiya bu yerga qo'shilmaydi, o'z faylida qoladi.
// ════════════════════════════════════════════════════════════

// ── Kunduzgi/Tungi rejim — barcha ilovalarda (admin, diller, sotuvchi) bir xil ishlaydi ──
const THEME_SUN = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>';
const THEME_MOON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>';
// Mavzular: system · light · dark (Blue) · oled · mono · mono-light — qurilmada saqlanadi
const FW_THEMES = ['system','light','dark','oled','mono','mono-light'];
function _fwGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
function _fwSet(k,v){ try { localStorage.setItem(k,v); } catch(e){} }
// v24.2: standart — «Tizimdagi» (telefon sozlamasi); boshqa mavzu faqat Sozlamalar → Dizayn mavzusi orqali
// v24.6 (egasi talabi): kun/tun tizim foniga avtomatik ergashadi. Eski versiyalardagi kun/tun tugmasi
// «Yorugʻ»/«Blue» ni qotirib qo'ygan qurilmalar bir marta «Tizimdagi» ga qaytariladi
// (Qorongʻi/Monoxrom — ongli tanlov, saqlanadi).
(function _fwThemeMigrate(){ if (_fwGet('koma_theme_v')==='2') return; const m=_fwGet('koma_theme'); if (m==='light'||m==='dark') _fwSet('koma_theme','system'); _fwSet('koma_theme_v','2'); })();
function getThemeMode(){ const m=_fwGet('koma_theme'); return FW_THEMES.includes(m) ? m : 'system'; }
function _fwApplyTheme(mode){
  const html=document.documentElement;
  const sysDark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = mode==='dark'||mode==='oled'||mode==='mono'||(mode==='system'&&sysDark);
  if (dark) html.setAttribute('data-theme','dark'); else html.removeAttribute('data-theme');
  if (mode==='oled'||mode==='mono'||mode==='mono-light') html.setAttribute('data-variant',mode); else html.removeAttribute('data-variant');
  const tc=document.querySelector('meta[name="theme-color"]');
  if (tc) tc.setAttribute('content', dark ? (mode==='dark'||mode==='system'?'#0b1221':'#000000') : '#f8fafc');
  document.querySelectorAll('[data-theme-icon]').forEach(el => el.innerHTML = dark ? THEME_SUN : THEME_MOON);
}
function setThemeMode(mode){ if(!FW_THEMES.includes(mode)) return; _fwSet('koma_theme',mode); _fwApplyTheme(mode); }
// Matn o'lchami — butun ilova masshtabi (90–130%)
// v23.5: standart o'lcham — 90% (ixcham, ko'proq ma'lumot sig'adi). Foydalanuvchi tanlovi saqlanadi.
const FW_TEXT_SCALES = [80,90,100,110,120,130];
function getTextScale(){ const v=parseInt(_fwGet('fw_text_scale')||'90',10); return FW_TEXT_SCALES.includes(v)?v:90; }
function setTextScale(v){ v=FW_TEXT_SCALES.includes(+v)?+v:90; _fwSet('fw_text_scale',String(v)); document.documentElement.style.zoom = v===100 ? '' : (v/100); }
(function initTheme() {
  _fwApplyTheme(getThemeMode());
  if (getTextScale()!==100) document.documentElement.style.zoom = getTextScale()/100;
  // Tizim foni o'zgarsa — darhol; eski Safari (addListener) ham; ilovaga qaytganda ham qayta tekshiriladi
  const _sys = () => { if (getThemeMode()==='system') _fwApplyTheme('system'); };
  if (window.matchMedia) { const mq = matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', _sys); else if (mq.addListener) mq.addListener(_sys); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) _sys(); });
  window.addEventListener('focus', _sys); window.addEventListener('pageshow', _sys);
  document.addEventListener('DOMContentLoaded', () => _fwApplyTheme(getThemeMode()));
})();

// Yuqoridagi tugma: yorug' ↔ tungi (Blue)
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const want = isDark ? 'light' : 'dark', sysDark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  // tizim foniga mos kelsa — yana avtomatik rejimga qaytadi (qotib qolmaydi)
  setThemeMode((want==='dark') === !!sysDark ? 'system' : want);
}

// v24.6 (bo'limlar auditi): brauzerning «uz-UZ» formati qurilmaga qarab har xil («2026 M10 16, Fri», «16/10/2026»…).
// Barcha «uz» sanalari — bitta o'zbekcha format: 16.10.2026 · 14:05 · «juma, 16-oktabr 2026».
(function fwUzDates() {
  if (typeof Date === 'undefined' || Date.prototype._fwUz) return;
  const MON = ['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'];
  const WD = ['yakshanba','dushanba','seshanba','chorshanba','payshanba','juma','shanba'];
  const p2 = n => String(n).padStart(2, '0');
  const isUz = l => typeof l === 'string' ? /^uz\b/i.test(l) : Array.isArray(l) && l.length && /^uz\b/i.test(String(l[0]));
  function fmt(d, o, kind) {
    if (isNaN(d)) return 'Invalid Date';
    o = o || {};
    const hasD = ['day','month','year','weekday'].some(k => o[k]), hasT = ['hour','minute','second'].some(k => o[k]);
    const wantD = hasD || (!hasT && kind !== 'time'), wantT = hasT || (!hasD && kind !== 'date');
    const parts = [];
    if (wantD) {
      if (o.month === 'long' || o.month === 'short') {
        let t = (o.day !== undefined || !hasD ? d.getDate() + '-' : '') + (o.month === 'short' ? MON[d.getMonth()].slice(0, 3) : MON[d.getMonth()]);
        if (o.year !== undefined || !hasD) t += ' ' + d.getFullYear();
        if (o.weekday) t = (o.weekday === 'short' ? WD[d.getDay()].slice(0, 3) : WD[d.getDay()]) + ', ' + t;
        parts.push(t);
      } else {
        const seg = [];
        if (o.day !== undefined || !hasD) seg.push(p2(d.getDate()));
        if (o.month !== undefined || !hasD) seg.push(p2(d.getMonth() + 1));
        if (o.year !== undefined || !hasD) seg.push(o.year === '2-digit' ? p2(d.getFullYear() % 100) : String(d.getFullYear()));
        let t = seg.join('.');
        if (o.weekday) t = (o.weekday === 'short' ? WD[d.getDay()].slice(0, 3) : WD[d.getDay()]) + (t ? ', ' + t : '');
        if (t) parts.push(t);
      }
    }
    if (wantT) {
      let t = p2(d.getHours()) + ':' + p2(d.getMinutes());
      if (o.second !== undefined || (!hasT && kind === 'time')) t += ':' + p2(d.getSeconds());
      parts.push(t);
    }
    return parts.join(' ');
  }
  const D = Date.prototype, oD = D.toLocaleDateString, oS = D.toLocaleString, oT = D.toLocaleTimeString;
  D.toLocaleDateString = function (l, o) { return isUz(l) ? fmt(this, o, 'date') : oD.call(this, l, o); };
  D.toLocaleString = function (l, o) { return isUz(l) ? fmt(this, o, 'both') : oS.call(this, l, o); };
  D.toLocaleTimeString = function (l, o) { return isUz(l) ? fmt(this, o, 'time') : oT.call(this, l, o); };
  D._fwUz = true;
})();

// v24.6 (bo'limlar auditi): sarlavhalar boshidagi emoji (📋 🏬 🤝 📜 …) — ilovaning chiziqli ikonkalari bilan aralashmasin.
// Faqat SARLAVHA elementlaridagi BIRINCHI matn boshidan olib tashlanadi (matnning o'zi o'zgarmaydi); data-emoji — tegilmaydi.
const FW_HEAD_SEL = '.card-title, .modal-title, .fws-head > b, .ox-sec, .st-eyebrow, .pm-head > b, .bs-ht > b, .sec-title, .kh-title';
const FW_EMOJI_HEAD = /^[\s‍️]*(?:[\p{Extended_Pictographic}☀-➿←-⇿⬀-⯿][‍️⃣]*\s*)+/u;
function fwStripHeadEmoji(root) {
  (root && root.querySelectorAll ? root : document).querySelectorAll(FW_HEAD_SEL).forEach(el => {
    if (el.dataset.emoji !== undefined || el.dataset.fwClean === '1') return;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
    const n = w.nextNode();
    if (n && FW_EMOJI_HEAD.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(FW_EMOJI_HEAD, '');
    el.dataset.fwClean = '1';
  });
}
(function fwHeadEmojiObserver() {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
  let pend = false;
  const run = () => { pend = false; try { fwStripHeadEmoji(document); } catch (_) {} };
  const start = () => { run(); new MutationObserver(() => { if (!pend) { pend = true; requestAnimationFrame(run); } }).observe(document.body, { childList: true, subtree: true }); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

// ── Noyob ID generatori (millisekund + ichki hisoblagich, bir vaqtda
//    bir nechta chaqiruv bo'lsa ham to'qnashmasligi uchun) ──
let _uidCounter = 0;
const uid = () => Date.now()*1000 + (_uidCounter = (_uidCounter+1)%1000);

// ── Bugungi sana, YYYY-MM-DD ko'rinishida ──
const td = () => new Date().toISOString().slice(0,10);

// ── Foydalanuvchi "160 000" kabi bo'sh joy bilan yozsa ham to'g'ri o'qiydi ──
function parseAmt(str) {
  if (str==null) return 0;
  const cleaned = String(str).replace(/[\s\u00A0]/g,'').replace(',','.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ── Yozayotganda "1600000" ni "1 600 000" ko'rinishida avtomatik formatlaydi ──
function liveFormatSpaces(el) {
  const pos = el.selectionStart;
  const before = el.value;
  let raw = el.value.replace(/[^\d.,]/g, '');
  let [intPart, decPart] = raw.split(/[.,]/);
  intPart = (intPart||'').replace(/\D/g,'').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const after = decPart!==undefined ? intPart + '.' + decPart : intPart;
  el.value = after;
  const diff = after.length - before.length;
  const newPos = Math.max(0, (pos||after.length) + diff);
  try { el.setSelectionRange(newPos, newPos); } catch(e) {}
}

// ── FIFO (birinchi kirgan — birinchi chiqadi) omborni kamaytirish.
//    Sotuvda ishlatiladi: eng eski partiyadan boshlab kerakli miqdorni
//    "kesib" oladi. Agar partiya konsignatsiya bo'lsa, sotilgan qism
//    uchun ta'minotchiga tannarx bo'yicha qarz avtomatik yoziladi. ──
function deductFIFO(pid, qty) {
  let rem = qty;
  S.batches.filter(b=>b.pid===pid && b.qty>b.sold && b.status!=='empty' && b.status!=='transit')
    .sort((a,b)=>new Date(a.date)-new Date(b.date))
    .forEach(b => {
      if (rem<=0) return;
      const take = Math.min(b.qty-b.sold, rem);
      b.sold += take; rem -= take;
      if (b.qty-b.sold===0) b.status='empty';
      // 📋 Konsignatsiya — sotilgan qismi uchun ta'minotchiga tannarx bo'yicha qarz avtomatik yoziladi
      if (b.consignment && b.suppId && take>0) {
        const supp = (S.suppliers||[]).find(s=>s.id===b.suppId);
        if (supp) supp.debt = (supp.debt||0) + take*(b.costUsd||0);
      }
      // 🏢🏪 Filiallararo konsignatsiya — Baza'dan istalgan filialga o'tkazilgan tovar sotilganda,
      // shu filialning Bazaga qarzi avtomatik ortadi (pul faqat sotilgandan keyin qarzga aylanadi)
      if (b.fromBranch === 'baza' && take>0 && S.branch !== 'baza') {
        if (!S.branchDebt) S.branchDebt = {};
        S.branchDebt[S.branch] = (S.branchDebt[S.branch]||0) + take*(b.costUsd||0);
      }
    });
}

// ── Matnni qidiruv uchun tozalash: kichik harf, tire/nuqta kabi belgilarni
//    bo'shliqqa aylantiradi (masalan "ABC-123" so'zi "abc 123" bilan ham topilsin) ──
function _searchNorm(str) {
  return (str||'').toString().toLowerCase()
    .replace(/[-_.,/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Umumiy "barcha so'zlar/raqamlar qayerda bo'lsa ham topilsin" qidiruv mexanizmi.
//    Foydalanuvchi bir nechta so'z kiritsa (masalan brend + raqam, yoki ismning
//    istalgan qismi), har bir so'z alohida — matnning istalgan joyida (boshida,
//    o'rtasida, oxirida) — va istalgan maydonda topilsa ham moslik hisoblanadi. ──
function multiFieldSearch(list, q, fieldsFn) {
  const query = _searchNorm(q);
  if (!query) return [];
  const tokens = query.split(' ').filter(Boolean);
  return list.filter(item => {
    const haystack = _searchNorm(fieldsFn(item).filter(Boolean).join(' '));
    return tokens.every(tok => haystack.includes(tok));
  });
}

// ── Mahsulot qidiruv — kod, nom, brend, kategoriya bo'yicha (barcha ilovalarda bir xil).
//    Bir nechta so'z/raqam kiritilsa (masalan "nike 42" yoki "qora futbolka xl"),
//    har biri alohida — nomning istalgan joyida yoki boshqa maydonda — qidiriladi. ──
function productSearchMatch(products, q) {
  return multiFieldSearch(products, q, p => [p.sku, p.name, p.brand, p.cat, p.param1, p.param2, p.barcode, ...(Array.isArray(p.barcodes) ? p.barcodes : [])]);
}
// v23.9: brend nomi joyiga moslashadi — qisqa nom kattaroq, uzun nom kichikroq (telefonda to'liq ko'rinsin).
// Boshlang'ich o'lcham nom uzunligidan, keyin haqiqiy kenglikka sig'guncha kichraytiriladi (eng kami — min px).
function fwFitText(el, max, min) {
  if (!el || !el.isConnected) return;
  const len = String(el.textContent || '').trim().length;
  let size = len <= 7 ? max : len <= 11 ? Math.round(max * 0.86) : len <= 16 ? Math.round(max * 0.72) : Math.round(max * 0.6);
  size = Math.max(min, size); el.classList.remove('fw-2l'); el.style.fontSize = size + 'px';
  for (let i = 0; i < 24 && size > min && el.scrollWidth > el.clientWidth + 1; i++) { size -= 1; el.style.fontSize = size + 'px'; }
  // Juda uzun nom — ikki qatorga (kichik shriftda bitta qatorda kesilib qolmasin)
  if (el.scrollWidth > el.clientWidth + 1) {
    el.classList.add('fw-2l'); size = Math.max(min, Math.round(max * 0.62)); el.style.fontSize = size + 'px';
    for (let i = 0; i < 16 && size > min - 2 && el.scrollHeight > el.clientHeight + 1; i++) { size -= 1; el.style.fontSize = size + 'px'; }
  }
}
function fwFitBrandNames() {
  const mob = typeof window !== 'undefined' && window.innerWidth <= 1024;
  document.querySelectorAll('.ox-brand .ox-bn').forEach(el => fwFitText(el, mob ? 30 : 24, mob ? 15 : 16));
}
if (typeof window !== 'undefined') { let _fwFitT; window.addEventListener('resize', () => { clearTimeout(_fwFitT); _fwFitT = setTimeout(fwFitBrandNames, 120); }); }
// v23.8: portallar (sotuvchi, diller) yuqori paneli — avatar (bosh harflar) va kun vaqtiga mos salomlashish
function ptGreet(pre, name) {
  const h = new Date().getHours(), g = h < 5 ? 'Xayrli tun' : h < 11 ? 'Xayrli tong' : h < 17 ? 'Xayrli kun' : h < 22 ? 'Xayrli kech' : 'Xayrli tun';
  const ini = String(name || '').trim().split(/\s+/).filter(w => /^\p{L}/u.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '—';
  const av = document.getElementById(pre + '-av'), gr = document.getElementById(pre + '-greet');
  if (av) av.textContent = ini; if (gr) gr.textContent = g + ',';
}
// v23.7: kassa yopish yozuvlari — eng yangisi birinchi (sinxron birlashtirish yangi yozuvni ro'yxat oxiriga qo'yishi mumkin)
function fwClosingsSorted(list) {
  const k = c => String((c && (c.ts || (c.date ? c.date + 'T00:00:00' : ''))) || '');
  return (Array.isArray(list) ? list.slice() : []).sort((a, b) => k(b).localeCompare(k(a)));
}
function logCashTxn({boxId, type, amount, desc, custId, suppId, partnerId}) {
  if (!S.cashTxns) S.cashTxns = [];
  const box = (S.cashboxes||[]).find(k=>k.id===boxId);
  S.cashTxns.unshift({id:uid(), date:td(), ts:new Date().toISOString(), boxId, boxName:box?.name||'', boxIcon:box?.icon||'💳', cur:box?.cur||'UZS', type, amount, desc, custId, suppId, partnerId});
  if (S.cashTxns.length > 500) S.cashTxns.pop();
}

// ════════════════════════════════════════════════════════════
// FILIAL KASSASI PUL HARAKATLARI (v11, audit F4) — SERVER HAQIQIY MANBA.
// Avval har bir amal (savdo, xarajat, qarz to'lovi, ko'chirish...) kassa qoldig'ini
// BRAUZERDA o'zgartirib (box.bal += ...), tayyor sonni serverga yuborardi — istalgan
// qoldiqni yozib qo'yish mumkin edi. Endi brauzer faqat AMALNI so'raydi
// (/.netlify/functions/cashbox-ops), server uni bazada (cashbox_ledger) atomik
// bajaradi va HAQIQIY qoldiqni qaytaradi; brauzer shu qiymatni ko'rsatadi.
//   fwCashOps(kind, ops, {remote, filial, rate, refType, refId, record, legacy})
//     ops: [{ boxId, dir:'in'|'out', amount, desc, custId?, suppId?, partnerId? }]
//     record (v23): to'lov amallari (cust_debt_pay/supp_pay/dealer_pay/home_withdrawal) uchun
//       {customerId|supplierId|dealerId, note} — server kassa + to'lov yozuvini BITTA tranzaksiyada yozadi;
//     legacy (v23): async () => {...} — faqat server "authority:false" desa, mahalliy o'zgarishdan OLDIN.
//   • server rad etsa — Error (chaqiruvchi amalni TO'XTATADI, hech narsa o'zgarmaydi);
//   • tarmoq uzilsa — keyingi urinishda XUDDI SHU kalit (server ikki marta yozmaydi);
//   • bir xil amal tugamasdan qayta bosilsa — rad etiladi;
//   • server "authority:false" desa (24-migratsiya hali qo'llanmagan) yoki oflayn/demo
//     rejim — avvalgidek mahalliy hisob (chiqim qoldiqdan oshmaydi).
// ════════════════════════════════════════════════════════════
const _fwCashInflight = new Set();
let _fwCashRetry = null;
let fwCashSeq = 0;               // har bir muvaffaqiyatli kassa amalidan keyin oshadi
const _r2 = (n) => Math.round((+n || 0) * 100) / 100;

function fwCashErr(msg) {
  return String(msg || "Kassa amali bajarilmadi").replace(/^(CASHBOX|LEDGER):\s*/, '');
}

// Server qaytargan qoldiqlarni ({"1": 100, ...}) S.cashboxes'ga va delta-birlashtirish
// boshlang'ich nuqtalariga yozadi (aks holda keyingi saqlash farqni ikki marta qo'shardi)
function fwApplyCashBalances(balances) {
  if (!balances || typeof balances !== 'object') return;
  Object.keys(balances).forEach(id => {
    const n = +balances[id];
    if (!Number.isFinite(n)) return;
    const box = (S.cashboxes || []).find(k => String(k.id) === String(id));
    if (box) box.bal = n;
    try { if (typeof SV_BASE !== 'undefined' && SV_BASE && SV_BASE.cashboxes) SV_BASE.cashboxes[id] = n; } catch (_) {}
    try { const b = S._syncBaseline && S._syncBaseline.branch && S._syncBaseline.branch[S.branch]; if (b && b.cashboxes) b.cashboxes[id] = n; } catch (_) {}
  });
}

// Saqlash javobidagi (app-data-save / app-data-branch-save) serverdagi kassa ro'yxati.
// Saqlash davomida yangi kassa amali bajarilgan bo'lsa (seq o'zgargan) — eskirgan javob qo'llanmaydi.
function fwApplyServerCashboxes(list, seqAtStart) {
  if (!Array.isArray(list) || (seqAtStart !== undefined && seqAtStart !== fwCashSeq)) return;
  const bal = {};
  list.forEach(b => { if (b && b.id !== undefined) bal[b.id] = +b.bal || 0; });
  list.forEach(b => {   // server qaytargan (masalan qoldig'i bor, o'chirib bo'lmaydigan) kassa
    if (b && b.id !== undefined && !(S.cashboxes || []).some(k => String(k.id) === String(b.id))) (S.cashboxes = S.cashboxes || []).push({ ...b });
  });
  fwApplyCashBalances(bal);
}

async function fwCashOps(kind, ops, opts = {}) {
  if (!Array.isArray(ops) || !ops.length) return { authority: false };
  const list = ops.map(o => ({ ...o, amount: _r2(o.amount) }));
  for (const o of list) {
    if (!(S.cashboxes || []).some(k => k.id === o.boxId)) throw new Error('Kassa topilmadi');
    if (o.dir !== 'in' && o.dir !== 'out') throw new Error("Kassa amali noto'g'ri");
    if (!(o.amount > 0) || !isFinite(o.amount)) throw new Error("Summa musbat bo'lishi kerak");
  }
  const filial = opts.filial || S.branch || null;
  const sig = JSON.stringify([kind, filial, list.map(o => [o.boxId, o.dir, o.amount]), opts.refId || null]);
  if (_fwCashInflight.has(sig)) throw new Error('Bu amal hozir bajarilmoqda — kuting');
  const key = (_fwCashRetry && _fwCashRetry.sig === sig) ? _fwCashRetry.key
    : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  let res = null;
  if (opts.remote) {
    _fwCashInflight.add(sig);
    try {
      let r;
      try {
        r = await authFetch('/.netlify/functions/cashbox-ops', {
          method: 'POST',
          body: JSON.stringify({ filial, key, kind, rate: opts.rate, refType: opts.refType, refId: opts.refId != null ? String(opts.refId) : undefined,
            record: opts.record || undefined,
            ops: list.map(o => ({ box: o.boxId, dir: o.dir, amount: o.amount, note: String(o.desc || '').slice(0, 500) })) })
        });
      } catch (e) {
        _fwCashRetry = { sig, key };
        throw new Error("Server bilan aloqa yo'q — qayta urinib ko'ring (amal ikki marta yozilmaydi)");
      }
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        _fwCashRetry = (r.status >= 500 || r.status === 409) ? { sig, key } : null;
        throw new Error(fwCashErr(data.error));
      }
      _fwCashRetry = null;
      res = data;
    } finally { _fwCashInflight.delete(sig); }
  }

  if (res && res.authority) {
    fwApplyCashBalances(res.balances);
  } else {
    // Mahalliy hisob (24-migratsiyagacha yoki oflayn/demo): avval kirimlar, keyin chiqimlar;
    // hech bir kassa manfiyga tushmasin — bo'lmasa HECH narsa o'zgarmaydi
    const next = new Map();
    list.forEach(o => { const b = S.cashboxes.find(k => k.id === o.boxId); if (!next.has(b.id)) next.set(b.id, +b.bal || 0); });
    list.filter(o => o.dir === 'in').forEach(o => next.set(o.boxId, next.get(o.boxId) + o.amount));
    for (const o of list.filter(o => o.dir === 'out')) {
      const v = next.get(o.boxId);
      if (v + 0.005 < o.amount) {
        const b = S.cashboxes.find(k => k.id === o.boxId);
        throw new Error(`"${b.name}"da mablag' yetarli emas`);
      }
      next.set(o.boxId, v - o.amount);
    }
    // v23 fail-close: server bor, lekin 24-migratsiya yo'q (authority:false) — eski server
    // yozuvi (masalan qarz to'lovi jadvali) MAHALLIY o'zgarishdan OLDIN bajariladi; u rad
    // etsa yoki tarmoq uzilsa — Error, hech narsa o'zgarmaydi (avval xato "fail-open" edi).
    if (res && typeof opts.legacy === 'function') await opts.legacy();
    next.forEach((v, id) => { S.cashboxes.find(k => k.id === id).bal = _r2(v); });
  }
  fwCashSeq++;
  list.forEach(o => logCashTxn({ boxId: o.boxId, type: o.dir, amount: o.amount, desc: o.desc, custId: o.custId, suppId: o.suppId, partnerId: o.partnerId }));
  const out = { authority: !!(res && res.authority), replay: !!(res && res.replay) };
  if (res && res.dealerDebtUsd != null) { out.dealerDebtUsd = +res.dealerDebtUsd; out.dealerTotalPaidUsd = +res.dealerTotalPaidUsd; }
  if (res && res.recordSkipped) out.recordSkipped = true;
  // v23.2 (F4b): to'lovdan keyingi HAQIQIY qarz (bazadan) — brauzer qarzni o'zi kamaytirmaydi
  if (res && res.customerDebt != null) out.customerDebt = +res.customerDebt;
  if (res && res.supplierDebt != null) { out.supplierDebt = +res.supplierDebt; out.supplierPaid = +res.supplierPaid; }
  return out;
}

// v23: eski (24-migratsiyagacha) server yozuv endpointini fail-close chaqiradi.
// Muvaffaqiyatsiz javob yoki tarmoq xatosi — Error (chaqiruvchi amalni to'xtatadi).
async function fwLegacyPost(fn, body) {
  let r;
  try { r = await authFetch('/.netlify/functions/' + fn, { method: 'POST', body: JSON.stringify(body) }); }
  catch (e) { throw new Error("Server bilan aloqa yo'q — amal bajarilmadi"); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Server amalni rad etdi");
  return data;
}

// ════════════════════════════════════════════════════════════
// F4b (v23.2, 27-migratsiya) — MIJOZ QARZI, TA'MINOTCHI QARZI VA OMBOR QOLDIG'I: SERVER HAQIQIY MANBA.
// Brauzer qarzni, partiyaning sold/qty qiymatini va qaytarish/tahrir summasini O'ZI HISOBLAMAYDI:
// amalni so'raydi (savdo, to'lov, qaytarish, kirim, reviziya...), server bazada BITTA tranzaksiyada
// bajaradi va HAQIQIY qiymatlarni qaytaradi — brauzer faqat ularni ko'rsatadi.
//   • FWL.on — server "27-migratsiya qo'llangan" dedi (app-data-load → ledgerAuthority);
//   • oflayn/demo yoki 27-migratsiyagacha — avvalgi mahalliy hisob (o'zgarishsiz);
//   • tarmoq uzilsa — qayta urinishda XUDDI SHU kalit (server ikki marta yozmaydi).
// ════════════════════════════════════════════════════════════
const FWL = { on: false };
let fwLedgerSeq = 0;                 // har bir server amalidan keyin oshadi (eskirgan saqlash javobi qo'llanmasin)
const _fwLedgerInflight = new Set();
let _fwLedgerRetry = null;

// Server amali ishlatiladimi: bulut yoqilgan va 27-migratsiya qo'llangan
function fwLedgerRemote() {
  let cloud = true;
  try { if (typeof _cloudEnabled !== 'undefined') cloud = !!_cloudEnabled; } catch (_) {}
  return !!FWL.on && cloud;
}
function fwLedgerErr(msg) {
  return String(msg || "Amal bajarilmadi").replace(/^(LEDGER|CASHBOX):\s*/, '');
}
function _fwCurBranch() { return (typeof SV_BRANCH !== 'undefined' && SV_BRANCH) ? SV_BRANCH : S.branch; }
// Filial ro'yxatlari: joriy filial — S.*, boshqasi — S._store[filial] (admin, masalan ko'chirishda)
function _fwBranchLists(filial) {
  if (!filial || filial === _fwCurBranch()) return S;
  return (S._store && S._store[filial]) || null;
}
function _fwBaseline(filial) {
  if (typeof SV_BASE !== 'undefined' && SV_BASE && (!filial || filial === _fwCurBranch())) return SV_BASE;
  const b = S._syncBaseline && S._syncBaseline.branch;
  return b ? b[filial || _fwCurBranch()] : null;
}

// Server qaytargan haqiqiy qiymatlarni qo'llaydi:
// { filial, customers:{id:debt}, suppliers:{id:{debt,paid}}, batches:[{filial,localId,qty,sold,status,costUsd}], branchDebt }
function fwApplyLedger(auth) {
  if (!auth || typeof auth !== 'object') return;
  const filial = auth.filial || _fwCurBranch();
  const L = _fwBranchLists(filial);
  const base = _fwBaseline(filial);
  if (L) {
    Object.entries(auth.customers || {}).forEach(([id, v]) => {
      const c = (L.customers || []).find(x => String(x.id) === String(id));
      if (c) c.debt = +v || 0;
      if (base && base.customers) base.customers[id] = +v || 0;
    });
    Object.entries(auth.suppliers || {}).forEach(([id, v]) => {
      const s = (L.suppliers || []).find(x => String(x.id) === String(id));
      if (s) { s.debt = +v.debt || 0; s.paid = +v.paid || 0; if (v.debtCur) { s.debtCur = v.debtCur === 'UZS' ? 'UZS' : 'USD'; s.debtUzs = +v.debtUzs || 0; } }
      if (base && base.suppliers) base.suppliers[id] = +v.debt || 0;
    });
  }
  (Array.isArray(auth.batches) ? auth.batches : []).forEach(b => {
    const T = _fwBranchLists(b.filial || filial);
    if (!T || !Array.isArray(T.batches)) return;
    const i = T.batches.findIndex(x => String(x.id) === String(b.localId));
    if (i < 0) {
      // v24.6 (36): server yaratgan filial o'tkazmasi partiyasi («tr…») — ro'yxatga qo'shiladi
      if (b.pid && b.status !== 'deleted' && /^trb?\d+-\d+$/.test(String(b.localId))) {
        T.batches.push({ id: String(b.localId), pid: +b.pid, bno: b.bno || null, origin: b.origin || null, cur: 'USD', qty: +b.qty || 0, sold: +b.sold || 0,
          costUsd: +b.costUsd || 0, bankFeeUsd: 0, date: b.date || null, status: b.status, fromBranch: b.fromBranch || null, consignment: false, items: [] });
      }
      return;
    }
    if (b.status === 'deleted') { T.batches.splice(i, 1); return; }
    Object.assign(T.batches[i], { qty: +b.qty || 0, sold: +b.sold || 0, status: b.status, costUsd: +b.costUsd || 0 });
    const bb = _fwBaseline(b.filial || filial);
    if (bb && bb.batches) bb.batches[T.batches[i].id] = +b.sold || 0;
  });
  if (auth.branchDebt && typeof auth.branchDebt === 'object') {
    S.branchDebt = { ...auth.branchDebt };
    try { if (S._syncBaseline) S._syncBaseline.branchDebt = { ...auth.branchDebt }; } catch (_) {}
  }
  if (S._store && filial === S.branch && typeof _snapshotBranch === 'function') { try { S._store[S.branch] = _snapshotBranch(); } catch (_) {} }
  fwLedgerSeq++;
}

// Saqlash javobidagi to'liq holat (app-data-save: branches[bk], app-data-branch-save: o'zi).
// Saqlash davomida yangi server amali bajarilgan bo'lsa (seq o'zgargan) — eskirgan javob qo'llanmaydi.
function fwApplyLedgerSnapshot(snap, filial, seqAtStart) {
  if (!snap || (seqAtStart !== undefined && seqAtStart !== fwLedgerSeq)) return;
  fwApplyLedger({ filial, customers: snap.customers || {}, suppliers: snap.suppliers || {},
    batches: (snap.batches || []).map(b => ({ ...b, filial })) });
}

// Bitta pul/qarz/ombor amali: endpoint (sale-ops / stock-debt-ops), body (key'siz).
// Natija — server javobi (authority va kassa qoldiqlari allaqachon qo'llangan). Xato — Error.
async function fwLedgerCall(fn, body, sigParts) {
  const sig = JSON.stringify([fn, sigParts !== undefined ? sigParts : body]);
  if (_fwLedgerInflight.has(sig)) throw new Error('Bu amal hozir bajarilmoqda — kuting');
  const key = (_fwLedgerRetry && _fwLedgerRetry.sig === sig) ? _fwLedgerRetry.key
    : 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  _fwLedgerInflight.add(sig);
  try {
    let r;
    try {
      r = await authFetch('/.netlify/functions/' + fn, { method: 'POST', body: JSON.stringify({ ...body, key, filial: body.filial || _fwCurBranch() }) });
    } catch (e) {
      _fwLedgerRetry = { sig, key };
      throw new Error("Server bilan aloqa yo'q — qayta urinib ko'ring (amal ikki marta yozilmaydi)");
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      _fwLedgerRetry = r.status >= 500 ? { sig, key } : null;
      if (data && data.migrationPending) FWL.on = false;
      throw new Error(fwLedgerErr(data.error));
    }
    _fwLedgerRetry = null;
    if (data.balances && typeof data.balances === 'object' && Object.keys(data.balances).length) {
      fwApplyCashBalances(data.balances); fwCashSeq++;
    }
    if (data.authority) fwApplyLedger(data.authority);
    return data;
  } finally { _fwLedgerInflight.delete(sig); }
}

// ════════════════════════════════════════════════════════════
// v24.5 (35-migratsiya; v23.10.2 dan): DILLER OMBORI VA DILLER SAVDOSI — `dealer-ops` (serverda BITTA tranzaksiya).
// Brauzer diller qoldig'i, qarzi yoki total_shipped'ning yakuniy qiymatini yubormaydi — faqat amalni so'raydi.
// Natija null — 35-migratsiya hali yo'q yoki bulut o'chiq (demo): chaqiruvchi avvalgi yo'lni ishlatadi.
// Tarmoq uzilsa — qayta urinishda XUDDI SHU kalit (server ikki marta yozmaydi).
// FDL.on — oxirgi javob bo'yicha holat (faqat ma'lumot uchun). v23.10 dan farqi: 409 dan keyin ham har amalda
// avval dealer-ops so'raladi — 35 sahifa ochiq turganda qo'llansa, keyingi amal darhol yangi yo'ldan ketadi
// (aks holda eski yo'l yopilgan endpoint'larga urilib, tovar firma omboridan chiqib diller omboriga yozilmay qolardi).
// ════════════════════════════════════════════════════════════
const FDL = { on: null };
async function fwDealerCall(body, sigParts) {
  let cloud = true;
  try { if (typeof _cloudEnabled !== 'undefined') cloud = !!_cloudEnabled; } catch (_) {}
  if (!cloud) return null;
  const sig = JSON.stringify(['dealer-ops', sigParts !== undefined ? sigParts : body]);
  if (_fwLedgerInflight.has(sig)) throw new Error('Bu amal hozir bajarilmoqda — kuting');
  const key = (_fwLedgerRetry && _fwLedgerRetry.sig === sig) ? _fwLedgerRetry.key
    : 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  _fwLedgerInflight.add(sig);
  try {
    let r;
    try {
      r = await authFetch('/.netlify/functions/dealer-ops', { method: 'POST', body: JSON.stringify({ ...body, key, filial: body.filial || _fwCurBranch() }) });
    } catch (e) {
      _fwLedgerRetry = { sig, key };
      throw new Error("Server bilan aloqa yo'q — qayta urinib ko'ring (amal ikki marta yozilmaydi)");
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 409 && data && data.migrationPending) { FDL.on = false; _fwLedgerRetry = null; return null; }
      _fwLedgerRetry = r.status >= 500 ? { sig, key } : null;
      throw new Error(fwLedgerErr(data.error));
    }
    FDL.on = true;
    _fwLedgerRetry = null;
    if (data.authority) fwApplyLedger(data.authority);
    return data;
  } finally { _fwLedgerInflight.delete(sig); }
}
// Admin holati (S.dealers / S.dealerStock): diller qoldig'i va jami ko'rsatkichlari — server javobidan
function fwApplyDealerResult(d, res) {
  if (!d || !res) return;
  const sd = res.dealer || {};
  if (sd.debt != null) d.debt = +sd.debt;
  if (sd.totalShipped != null) d.totalShipped = +sd.totalShipped;
  if (sd.totalSold != null) d.totalSold = +sd.totalSold;
  if (sd.totalPaid != null) d.totalPaid = +sd.totalPaid;
  if (sd.points != null) d.points = +sd.points;
  if (!Array.isArray(S.dealerStock)) S.dealerStock = [];
  (res.items || []).forEach(it => {
    if (it.dealerQty == null) return;
    let rec = S.dealerStock.find(r => r.dealerId === d.id && +r.pid === +it.pid);
    if (!rec) { rec = { id: uid(), dealerId: d.id, pid: +it.pid, qty: 0, avgCostUsd: 0 }; S.dealerStock.push(rec); }
    rec.qty = +it.dealerQty;
    if (it.dealerAvgCostUsd != null) rec.avgCostUsd = +it.dealerAvgCostUsd;
  });
}

// Qayta urinishda (tarmoq uzilsa) yangi partiya/savdo ID'lari o'zgarmasin — shunda so'rov tanasi va
// amal kaliti ham o'sha bo'lib qoladi va server ikkinchi marta yozmaydi (replay).
const _fwIdCache = new Map();
function fwStableIds(tag, sigObj, n) {
  const sig = JSON.stringify(sigObj);
  const c = _fwIdCache.get(tag);
  if (c && c.sig === sig && c.ids.length === n) return c.ids;
  const ids = Array.from({ length: n }, () => uid());
  _fwIdCache.set(tag, { sig, ids });
  return ids;
}
function fwStableIdsDone(tag) { _fwIdCache.delete(tag); }

// Server savdo yozuvini (sale-ops / checkout javobidagi `sale`) brauzerdagi savdoga qo'llaydi
function fwApplySaleFromServer(s, srv) {
  if (!s || !srv) return;
  if (Array.isArray(srv.items) && Array.isArray(s.items)) {
    if (srv.items.length === s.items.length) {
      s.items.forEach((it, i) => { const r = srv.items[i]; if (r && +r.pid === +it.pid) Object.assign(it, { qty: +r.qty, sellUsd: +r.sellUsd, lineUsd: +r.lineUsd }); });
    } else {
      // "replace" tahririda qatorlar soni o'zgaradi — server ro'yxati asosida (pid bo'yicha meta saqlanadi)
      const meta = new Map(s.items.map(it => [+it.pid, it]));
      s.items = srv.items.map(r => ({ ...(meta.get(+r.pid) || { pid: +r.pid }), qty: +r.qty, sellUsd: +r.sellUsd, costUsd: +r.costUsd, lineUsd: +r.lineUsd }));
    }
  }
  ['subtotalUsd', 'totalUsd', 'paidUsd', 'debtUsd', 'profitUsd'].forEach(k => { if (srv[k] != null) s[k] = +srv[k]; });
  if (srv.disc != null) s.disc = +srv.disc;
  if (srv.discUsd != null) s.discUsd = +srv.discUsd;
  if (srv.edited) { s.edited = true; s.editedAt = s.editedAt || new Date().toISOString(); }
}

// ════════════════════════════════════════════════════════════
// XARAJAT KATEGORIYALARI (2026-10-02) — tayyor (kodda qotirilgan) ro'yxat YO'Q.
// Yagona haqiqiy manba: serverdagi public.expense_categories (26-migratsiya), faqat
// /.netlify/functions/expense-categories orqali. Admin paneli va sotuvchi portali
// shu modulni ishlatadi. Har bir filialning o'z ro'yxati; tur: dokon / tasischi / hamkor.
// Xarajat yozuvi kategoriyaga ID bilan bog'lanadi (e.catId) + o'sha paytdagi nom (e.cat).
// Nom o'zgarsa — ID o'zgarmaydi; ishlatilgan kategoriya o'chirilsa — nofaol bo'ladi.
// Server javob bermasa — hech narsa "saqlandi" deb ko'rsatilmaydi.
// ════════════════════════════════════════════════════════════
const FW_EXCAT_MAX = 60;
const FWC = { filial: null, list: [], loaded: false, loading: false, error: '', pending: null, inflight: new Set(), idem: {} };
function fwExpCatNorm(v) { return String(v == null ? '' : v).normalize('NFC').replace(/\s+/g, ' ').trim(); }
// Taqqoslash: katta-kichik harf va apostrof turi (' ʻ ʼ ‘ ’ ` ´) farqsiz — serverdagi qoida bilan bir xil
function fwExpCatKey(v) { return fwExpCatNorm(v).replace(/[ʻʼ‘’`´]/g, "'").toLowerCase(); }
function fwExpCatRemote() { return (typeof _cloudEnabled === 'undefined') ? true : !!_cloudEnabled; }
function fwExpCatFilial() { return (typeof SV_BRANCH !== 'undefined' && typeof svExpenseHtml === 'function') ? SV_BRANCH : (S.branch || 'baza'); }
function _fwExpCatLocalKey(f) { return 'fw_expcats_' + f; }

async function fwExpCatCall(payload) {
  let r;
  try { r = await authFetch('/.netlify/functions/expense-categories', { method: 'POST', body: JSON.stringify(payload) }); }
  catch (e) { throw new Error("Server bilan aloqa yo'q — saqlanmadi, qayta urinib ko'ring"); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const err = new Error(data.error || `Server xatosi (${r.status})`); err.status = r.status; err.data = data; throw err; }
  return data;
}

// Ro'yxatni yuklaydi (filial almashsa yoki force — qaytadan)
async function fwExpCatLoad(filial, force) {
  filial = filial || fwExpCatFilial();
  if (!force && FWC.loaded && FWC.filial === filial) return FWC.list;
  if (FWC.pending && FWC.filial === filial) return FWC.pending;
  FWC.filial = filial; FWC.loading = true; FWC.error = ''; FWC.loaded = false;
  FWC.pending = (async () => {
    try {
      if (!fwExpCatRemote()) {
        // Bulutsiz (lokal/demo) rejim: shu brauzerning o'zida
        let arr = []; try { arr = JSON.parse(localStorage.getItem(_fwExpCatLocalKey(filial)) || '[]'); } catch (_) {}
        FWC.list = Array.isArray(arr) ? arr : [];
      } else {
        const d = await fwExpCatCall({ action: 'list', filial });
        FWC.list = Array.isArray(d.categories) ? d.categories : [];
      }
      FWC.loaded = true;
    } catch (e) { FWC.error = e.message || "Kategoriyalar yuklanmadi"; FWC.list = []; }
    finally { FWC.loading = false; FWC.pending = null; }
    return FWC.list;
  })();
  return FWC.pending;
}
function _fwExpCatSaveLocal() { try { localStorage.setItem(_fwExpCatLocalKey(FWC.filial), JSON.stringify(FWC.list)); } catch (_) {} }
function fwExpCatById(id) { return FWC.list.find(c => Number(c.id) === Number(id)) || null; }
function fwExpCatActive(turi) {
  return FWC.list.filter(c => c && c.isActive && (c.turi || 'dokon') === (turi || 'dokon'))
    .slice().sort((a, b) => a.name.localeCompare(b.name, 'uz'));
}
// TIZIM yozuvlari (foydalanuvchi tanlaydigan kategoriya EMAS): ilovaning o'zi avtomatik yaratadigan
// xarajat turlari. Mantiq `sysType` bo'yicha ishlaydi; matn — faqat ko'rsatish uchun, shu yagona joyda.
// Eski yozuvlarda sysType yo'q — ular mos keladigan nom bo'yicha taniladi (orqaga moslik).
const FW_SYS_EXPENSE = {
  return_loss:        'Qaytarish zarari',      // savdo qaytarilganda zarar (joriy oy)
  partner_withdrawal: "Ulush to'lovi",         // Bosh kassadan hamkor ulushi
  salary:             'Oylik (maosh)',         // Oylik xodimga to'lov
  rent:               'Ijara',                 // "ijara" nomli oylik/ijara xodimiga to'lov
};
function fwIsSysExpense(e, type) { return !!e && (e.sysType === type || (!e.sysType && e.catId == null && e.cat === FW_SYS_EXPENSE[type])); }
function fwSalarySysType(personName) { return /ijara/i.test(String(personName || '')) ? 'rent' : 'salary'; }
// Xarajatda ko'rsatiladigan nom: kategoriya ID bo'yicha (nomi o'zgargan bo'lsa — yangisi), aks holda yozuvdagi nom
function fwExpCatLabel(e) {
  if (!e) return '—';
  const c = e.catId != null ? fwExpCatById(e.catId) : null;
  return (c && c.name) || e.cat || e.category || '—';
}
// <select> uchun: holat (yuklanmoqda / xato / bo'sh) + faqat FAOL kategoriyalar
function fwExpCatOptionsHtml(turi, selectedId) {
  if (FWC.loading || (!FWC.loaded && !FWC.error)) return `<option value="">Yuklanmoqda…</option>`;
  if (FWC.error) return `<option value="">⚠️ Kategoriyalar yuklanmadi</option>`;
  const list = fwExpCatActive(turi);
  if (!list.length) return `<option value="">Kategoriya yo'q — avval qo'shing</option>`;
  const sel = list.some(c => Number(c.id) === Number(selectedId)) ? Number(selectedId) : null;
  return `<option value="" ${sel == null ? 'selected' : ''}>Kategoriya tanlang</option>`
    + list.map(c => `<option value="${Number(c.id)}" ${Number(c.id) === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}

// Yaratish / nomini o'zgartirish / o'chirish — server MUVAFFAQIYATLI bo'lgandagina ro'yxat yangilanadi
async function fwExpCatCreate(turi, rawName) {
  const name = fwExpCatNorm(rawName);
  if (!name) throw new Error('Kategoriya nomini yozing');
  if (name.length > FW_EXCAT_MAX) throw new Error(`Nom ${FW_EXCAT_MAX} belgidan oshmasin`);
  const key = fwExpCatKey(name);
  const dup = fwExpCatActive(turi).find(c => fwExpCatKey(c.name) === key);
  if (dup) throw new Error(`"${dup.name}" kategoriyasi allaqachon bor`);
  const sig = (turi || 'dokon') + '|' + key;
  if (FWC.inflight.has(sig)) throw new Error('Saqlanmoqda — kuting');
  FWC.inflight.add(sig);
  try {
    let cat;
    if (!fwExpCatRemote()) {
      cat = { id: -Date.now(), turi: turi || 'dokon', name, isActive: true, createdAt: new Date().toISOString() };
      FWC.list.push(cat); _fwExpCatSaveLocal();
      return cat;
    }
    // Qayta urinishda (tarmoq uzilgan) — xuddi shu kalit: server ikkinchi kategoriya yaratmaydi
    FWC.idem[sig] = FWC.idem[sig] || ('ec' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
    const d = await fwExpCatCall({ action: 'create', turi: turi || 'dokon', name, idemKey: FWC.idem[sig], filial: FWC.filial || fwExpCatFilial() });
    delete FWC.idem[sig];
    cat = d.category;
    if (cat && !fwExpCatById(cat.id)) FWC.list.push(cat);
    return cat;
  } finally { FWC.inflight.delete(sig); }
}
async function fwExpCatRename(id, rawName) {
  const c = fwExpCatById(id); if (!c) throw new Error('Kategoriya topilmadi');
  const name = fwExpCatNorm(rawName);
  if (!name) throw new Error('Kategoriya nomini yozing');
  if (name.length > FW_EXCAT_MAX) throw new Error(`Nom ${FW_EXCAT_MAX} belgidan oshmasin`);
  const key = fwExpCatKey(name);
  const dup = fwExpCatActive(c.turi).find(x => Number(x.id) !== Number(id) && fwExpCatKey(x.name) === key);
  if (dup) throw new Error(`"${dup.name}" kategoriyasi allaqachon bor`);
  if (!fwExpCatRemote()) { c.name = name; _fwExpCatSaveLocal(); return c; }
  const d = await fwExpCatCall({ action: 'rename', id: Number(id), name, filial: FWC.filial || fwExpCatFilial() });
  Object.assign(c, d.category || { name });
  return c;
}
async function fwExpCatRemove(id) {
  const c = fwExpCatById(id); if (!c) throw new Error('Kategoriya topilmadi');
  if (!fwExpCatRemote()) {
    const used = (S.expenses || []).some(e => Number(e.catId) === Number(id));
    if (used) { c.isActive = false; _fwExpCatSaveLocal(); return 'deactivated'; }
    FWC.list = FWC.list.filter(x => x !== c); _fwExpCatSaveLocal(); return 'deleted';
  }
  const d = await fwExpCatCall({ action: 'remove', id: Number(id), filial: FWC.filial || fwExpCatFilial() });
  if (d.mode === 'deleted') FWC.list = FWC.list.filter(x => Number(x.id) !== Number(id));
  else Object.assign(c, d.category || { isActive: false });
  return d.mode;
}

// ── Oyna: kategoriya nomi (yaratish yoki nomini o'zgartirish). Asosiy oynadan alohida qatlam —
//    ochiq turgan formadagi (summa, izoh) ma'lumotlar yo'qolmaydi.
function fwCatModalClose() { const o = document.getElementById('fw-catmodal'); if (o) o.remove(); }
function _fwCatModalShell(inner) {
  fwCatModalClose();
  const o = document.createElement('div');
  o.id = 'fw-catmodal';
  o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
  o.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
  o.innerHTML = `<div class="fw-catbox" style="background:var(--bg-card,#fff);color:var(--text-primary,#111);border:1px solid var(--border,#ddd);border-radius:14px;width:100%;max-width:440px;max-height:calc(100vh - 32px);overflow:auto;padding:18px;box-shadow:0 12px 40px rgba(0,0,0,.35);box-sizing:border-box">${inner}</div>`;
  o.addEventListener('mousedown', (ev) => { if (ev.target === o) fwCatModalClose(); });
  o.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fwCatModalClose(); });
  document.body.appendChild(o);
  return o;
}
const _fwBtn = (primary) => `padding:9px 16px;border-radius:9px;font-weight:700;font-size:13px;cursor:pointer;border:1px solid ${primary ? 'transparent' : 'var(--border,#ccc)'};background:${primary ? 'var(--blue,#C2410C)' : 'transparent'};color:${primary ? '#fff' : 'inherit'}`;
// mode: 'create' (turi) yoki 'rename' (id). onDone(cat) — muvaffaqiyatdan keyin
function fwCatModalOpen({ mode = 'create', turi = 'dokon', id = null, onDone } = {}) {
  const c = mode === 'rename' ? fwExpCatById(id) : null;
  const o = _fwCatModalShell(`
    <div style="font-weight:800;font-size:16px;margin-bottom:12px">${mode === 'rename' ? '✏️ Kategoriya nomini o\'zgartirish' : '+ Yangi kategoriya'}</div>
    <label for="fw-cat-name" style="font-size:12px;font-weight:700;color:var(--text-muted,#666);display:block;margin-bottom:6px">Kategoriya nomi</label>
    <input id="fw-cat-name" type="text" maxlength="${FW_EXCAT_MAX}" autocomplete="off" value="${c ? esc(c.name) : ''}" placeholder="Masalan: Elektr energiyasi"
      style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:9px;border:1px solid var(--border,#ccc);background:var(--bg-secondary,#f6f6f6);color:inherit;font-size:14px">
    <div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:11.5px;min-height:16px">
      <span id="fw-cat-msg" role="status" style="color:var(--red,#e23d3d);word-break:break-word"></span>
      <span id="fw-cat-count" style="color:var(--text-muted,#888);white-space:nowrap">0/${FW_EXCAT_MAX}</span>
    </div>
    ${mode === 'rename' ? `<div style="font-size:11.5px;color:var(--text-muted,#888);margin-top:8px">Eski xarajatlar shu kategoriyaga bog'langan holda qoladi — summalar o'zgarmaydi.</div>` : ''}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap">
      <button type="button" id="fw-cat-cancel" style="${_fwBtn(false)}">Bekor qilish</button>
      <button type="button" id="fw-cat-save" style="${_fwBtn(true)}">💾 Saqlash</button>
    </div>`);
  const inp = o.querySelector('#fw-cat-name'), msg = o.querySelector('#fw-cat-msg'), cnt = o.querySelector('#fw-cat-count'), btn = o.querySelector('#fw-cat-save');
  const upd = () => { cnt.textContent = `${inp.value.length}/${FW_EXCAT_MAX}`; msg.textContent = ''; };
  inp.addEventListener('input', upd); upd();
  o.querySelector('#fw-cat-cancel').onclick = fwCatModalClose;
  let busy = false;
  const submit = async () => {
    if (busy) return;                     // ikki marta bosish — bitta so'rov
    busy = true; btn.disabled = true; inp.disabled = true; btn.textContent = 'Saqlanmoqda…'; msg.style.color = 'var(--text-muted,#888)'; msg.textContent = '';
    try {
      const cat = mode === 'rename' ? await fwExpCatRename(id, inp.value) : await fwExpCatCreate(turi, inp.value);
      fwCatModalClose();
      if (typeof toast === 'function') toast(mode === 'rename' ? `✅ Kategoriya nomi o'zgartirildi: "${cat.name}"` : `✅ "${cat.name}" kategoriyasi qo'shildi`);
      if (typeof onDone === 'function') onDone(cat);
    } catch (e) {
      busy = false; btn.disabled = false; inp.disabled = false; btn.textContent = '💾 Saqlash';
      msg.style.color = 'var(--red,#e23d3d)'; msg.textContent = '⛔ ' + (e.message || 'Saqlanmadi'); inp.focus();
    }
  };
  btn.onclick = submit;
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } });
  setTimeout(() => inp.focus(), 30);
  return o;
}
// Kategoriyalar ro'yxati: nomini o'zgartirish va o'chirish (tasdiq bilan)
function fwCatManageOpen({ turi = 'dokon', onChange } = {}) {
  const render = () => {
    const rows = FWC.list.filter(c => (c.turi || 'dokon') === turi).slice().sort((a, b) => (b.isActive - a.isActive) || a.name.localeCompare(b.name, 'uz'));
    const o = _fwCatModalShell(`
      <div style="font-weight:800;font-size:16px;margin-bottom:10px">⚙️ Kategoriyalar</div>
      <div id="fw-catm-msg" role="status" style="font-size:12px;min-height:16px;margin-bottom:6px"></div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${rows.length ? rows.map(c => `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border-light,#eee);border-radius:9px;${c.isActive ? '' : 'opacity:.55'}">
          <span style="flex:1;min-width:0;word-break:break-word;font-weight:600">${esc(c.name)}${c.isActive ? '' : ' <small style="font-weight:400">(nofaol)</small>'}</span>
          ${c.isActive ? `<button type="button" data-act="ren" data-id="${Number(c.id)}" title="Nomini o'zgartirish" style="${_fwBtn(false)};padding:6px 10px">✏️</button>
          <button type="button" data-act="del" data-id="${Number(c.id)}" title="O'chirish" style="${_fwBtn(false)};padding:6px 10px;color:var(--red,#e23d3d)">🗑</button>` : ''}
        </div>`).join('') : `<div style="color:var(--text-muted,#888);font-size:13px;text-align:center;padding:14px">Hali kategoriya yo'q</div>`}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:14px"><button type="button" id="fw-catm-close" style="${_fwBtn(false)}">Yopish</button></div>`);
    o.querySelector('#fw-catm-close').onclick = fwCatModalClose;
    const msg = o.querySelector('#fw-catm-msg');
    o.querySelectorAll('button[data-act]').forEach(b => {
      b.onclick = async () => {
        const id = Number(b.dataset.id), c = fwExpCatById(id); if (!c) return;
        if (b.dataset.act === 'ren') {
          fwCatModalOpen({ mode: 'rename', id, onDone: () => { if (onChange) onChange(); render(); } });
          return;
        }
        if (!confirm(`"${c.name}" kategoriyasini o'chirasizmi?\n\nAgar u xarajatlarda ishlatilgan bo'lsa — o'chirilmaydi, NOFAOL qilinadi: eski xarajatlar o'z kategoriyasi bilan qoladi, yangi xarajatda esa chiqmaydi.`)) return;
        o.querySelectorAll('button').forEach(x => { x.disabled = true; });
        msg.style.color = 'var(--text-muted,#888)'; msg.textContent = 'Bajarilmoqda…';
        try {
          const mode = await fwExpCatRemove(id);
          if (onChange) onChange();
          render();
          if (typeof toast === 'function') toast(mode === 'deleted' ? `✅ "${c.name}" o'chirildi` : `✅ "${c.name}" nofaol qilindi (xarajatlarda ishlatilgan — tarix saqlandi)`);
        } catch (e) {
          o.querySelectorAll('button').forEach(x => { x.disabled = false; });
          msg.style.color = 'var(--red,#e23d3d)'; msg.textContent = '⛔ ' + (e.message || 'Bajarilmadi');
        }
      };
    });
  };
  render();
}

// ── XSS himoyasi (OWASP A05, 2026-09-28) ─────────────────────────────
// Foydalanuvchi kiritgan har qanday matn (mijoz/mahsulot/diller ismi,
// telefon, izoh...) HTML'ga (innerHTML, modal, chek) qo'yilishidan oldin
// shu funksiyadan o'tkaziladi — aks holda ism o'rniga yozilgan
// <img onerror=...> boshqa xodim (masalan admin) brauzerida ishga tushadi.
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// onclick="fn('...')" kabi atribut ichidagi JS-satr uchun: avval JS
// escape (\ ' " qator-oxiri), keyin HTML escape.
function escJsAttr(v) {
  if (v === null || v === undefined) return '';
  return esc(String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\r?\n/g, '\\n').replace(/</g, '\\x3c'));
}

// ════════════════════════════════════════════════════════════
// STATISTIKA YORDAMCHILARI (2026-10-01) — admin (Sotuvchilar, Dillerlar,
// Filiallar), sotuvchi va diller portallarida BIR XIL ishlaydi.
// Faqat O'QIYDI va HTML qaytaradi — hech qanday ma'lumotni o'zgartirmaydi.
// Sanalar tizimdagi td() (UTC "YYYY-MM-DD") bilan bir xil hisoblanadi.
// ════════════════════════════════════════════════════════════
// Ko'rinadigan davrlar. Standart — «Shu oy» (oyning 1-sanasidan bugungacha).
const FW_PERIODS = { today:'Bugun', month:'Shu oy', prevmonth:"O'tgan oy", year:'Shu yil' };
function fwShiftDay(k, n) { const d = new Date(String(k).slice(0,10) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0,10); }
function fwDaysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }
// Davr: [a..b] va taqqoslash uchun oldingi davr [pa..pb]:
//  today     — bugun; oldingi: kecha
//  month     — oyning 1-sanasidan bugungacha; oldingi: o'tgan oyning xuddi shu kunlari (1..N)
//  prevmonth — o'tgan oy to'liq; oldingi: undan oldingi oy
//  year      — 1-yanvardan bugungacha; oldingi: o'tgan yilning xuddi shu davri
//  7d / 30d  — oxirgi 7 / 30 kun (ichki foydalanish uchun saqlangan)
function fwMonthEnd(ym) { const [y, m] = ym.split('-').map(Number); return ym + '-' + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2,'0'); }
function fwPrevYm(ym) { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2,'0')}`; }
function fwPeriod(per) {
  const t = td();
  let a, b = t, pa, pb;
  if (per === 'today') { a = t; pa = pb = fwShiftDay(t, -1); }
  else if (per === 'prevmonth') { const ym = fwPrevYm(t.slice(0,7)); a = ym + '-01'; b = fwMonthEnd(ym); const pym = fwPrevYm(ym); pa = pym + '-01'; pb = fwMonthEnd(pym); }
  else if (per === 'year') { a = t.slice(0,4) + '-01-01'; pa = (+t.slice(0,4) - 1) + '-01-01'; pb = (+t.slice(0,4) - 1) + t.slice(4); if (pb.endsWith('-02-29')) pb = pb.slice(0,8) + '28'; }
  else if (per === '7d' || per === '30d') { a = fwShiftDay(t, per === '7d' ? -6 : -29); const n = per === '7d' ? 7 : 30; pa = fwShiftDay(a, -n); pb = fwShiftDay(a, -1); }
  else { per = 'month'; a = t.slice(0,7) + '-01'; const pym = fwPrevYm(t.slice(0,7)); pa = pym + '-01'; const pend = fwMonthEnd(pym); pb = pym + t.slice(7); if (pb > pend) pb = pend; }
  return { per, a, b, pa, pb, len: fwDaysBetween(a, b) + 1 };
}
function fwDmy(k) { const [y, m, d] = String(k || '').slice(0,10).split('-'); return d ? `${d}.${m}.${y}` : ''; }
function fwRangeLabel(P) { return P.a === P.b ? fwDmy(P.a) : `${fwDmy(P.a)} – ${fwDmy(P.b)}`; }
// Rasm manzili xavfsizmi (faqat http(s), blob yoki data:image) — boshqa sxemalar ko'rsatilmaydi
function fwImgSafe(u) { u = String(u || ''); return /^(https?:\/\/|blob:|data:image\/(png|jpe?g|gif|webp);)/i.test(u) ? u : ''; }
const fwIn = (d, a, b) => { const k = String(d || '').slice(0,10); return !!k && k >= a && k <= b; };
function fwShortDate(k) { const [y, m, d] = String(k || '').slice(0,10).split('-'); return d ? `${d}.${m}.${y.slice(2)}` : ''; }
function fwUsd(v) { const n = Math.round((+v || 0) * 100) / 100; return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits:2 }).replace(/,/g, ' '); }
function fwNum(v) { return Math.round(+v || 0).toLocaleString('en-US').replace(/,/g, ' '); }
function fwPct(part, total) { return total > 0 ? Math.round(part / total * 1000) / 10 : 0; }
// O'sish/pasayish belgisi: oldingi davrga nisbatan
function fwTrendHtml(cur, prev) {
  cur = +cur || 0; prev = +prev || 0;
  if (!prev && !cur) return '<span class="fws-trend">—</span>';
  if (!prev) return '<span class="fws-trend up" title="Oldingi davrda yo\'q edi">yangi</span>';
  const p = Math.round((cur - prev) / Math.abs(prev) * 100);
  if (p === 0) return '<span class="fws-trend">0%</span>';
  return `<span class="fws-trend ${p > 0 ? 'up' : 'down'}" title="Oldingi davrga nisbatan">${p > 0 ? '▲' : '▼'} ${Math.abs(p)}%</span>`;
}
// Grafik nuqtalari: yil — oylar bo'yicha, qolganlari — kunlar bo'yicha
function fwSeries(rows, dateOf, valOf, P, tsOf) {
  if (P.a === P.b) {
    const out = Array.from({ length:24 }, (_, h) => ({ k: P.a + ' ' + String(h).padStart(2,'0') + ':00', v:0, label: h % 3 === 0 ? String(h).padStart(2,'0') : '' }));
    rows.forEach(r => { if (String(dateOf(r) || '').slice(0,10) !== P.a) return; const ts = tsOf ? tsOf(r) : null; const d = ts ? new Date(ts) : null;
      if (d && !isNaN(d)) out[d.getHours()].v += (+valOf(r) || 0); });
    return out;
  }
  if (P.per === 'year') {
    const out = Array.from({ length: +P.b.slice(5,7) }, (_, i) => ({ k: P.b.slice(0,4) + '-' + String(i + 1).padStart(2,'0'), v: 0 }));
    const idx = {}; out.forEach((p, i) => idx[p.k] = i);
    rows.forEach(r => { const d = String(dateOf(r) || ''); const i = idx[d.slice(0,7)]; if (i !== undefined && fwIn(d, P.a, P.b)) out[i].v += (+valOf(r) || 0); });
    return out.map(p => ({ ...p, label: String(+p.k.slice(5,7)) }));
  }
  const out = []; const idx = {};
  for (let d = P.a, g = 0; d <= P.b && g < 400; d = fwShiftDay(d, 1), g++) { idx[d] = out.length; out.push({ k: d, v: 0, label: String(+d.slice(8,10)) }); }
  rows.forEach(r => { const d = String(dateOf(r) || '').slice(0,10); const i = idx[d]; if (i !== undefined) out[i].v += (+valOf(r) || 0); });
  return out;
}
// Guruhlash: key → {key, ...yig'indilar}
function fwGroup(rows, keyOf, add) {
  const m = new Map();
  rows.forEach(r => { const k = keyOf(r); if (k === undefined || k === null) return; let o = m.get(k); if (!o) { o = { key: k }; m.set(k, o); } add(o, r); });
  return [...m.values()];
}
const fwAdd = (o, f, v) => { o[f] = (o[f] || 0) + (+v || 0); };

// ── HTML qismlari (fws-* uslublari design-system.css'da) ──
function fwTabsHtml(cur, fn) {
  return `<div class="fws-tabs" role="tablist">${Object.entries(FW_PERIODS).map(([k, l]) =>
    `<button type="button" role="tab" aria-selected="${k === cur}" class="${k === cur ? 'on' : ''}" onclick="${fn}('${k}')">${l}</button>`).join('')}</div>`;
}
function fwKpisHtml(items) {
  return `<div class="fws-kpis">${items.map(x => `<div class="fws-kpi" style="--c:var(--${x.c || 'gold'})">
    <span class="fws-kpi-l">${x.l}</span><b class="fws-kpi-v">${x.v}</b>
    <span class="fws-kpi-s">${x.trend || ''}${x.sub ? `<em>${x.sub}</em>` : ''}</span></div>`).join('')}</div>`;
}
function fwBarsHtml(points, o) {
  o = o || {};
  if (!points.some(p => p.v)) return fwEmptyHtml(o.empty || "Bu davrda ma'lumot yo'q");
  const fmt = o.fmt || fwUsd, max = Math.max(1, ...points.map(p => Math.abs(p.v)));
  const step = points.length > 16 ? Math.ceil(points.length / 8) : 1;
  return `<div class="fws-chart${points.length > 16 ? ' many' : ''}" style="--c:var(--${o.c || 'gold'})" role="img" aria-label="${esc(o.aria || 'Grafik')}">${points.map((p, i) =>
    `<div class="fws-col" title="${esc((o.titleOf ? o.titleOf(p) : p.k) + ': ' + fmt(p.v))}"><div class="fws-bar${p.v ? '' : ' zero'}" style="height:${p.v ? Math.max(3, Math.round(Math.abs(p.v) / max * 100)) : 0}%"></div><span>${((i % step === 0 && points.length - 1 - i >= Math.ceil(step / 2)) || i === points.length - 1) ? esc(p.label) : ''}</span></div>`).join('')}</div>`;
}
// Reyting: [{name, v, sub, extra, on}] — chiziq uzunligi qiymatga mutanosib
function fwRankHtml(list, o) {
  o = o || {};
  if (!list.length) return fwEmptyHtml(o.empty || "Ma'lumot yo'q");
  const fmt = o.fmt || fwUsd, max = Math.max(1e-9, ...list.map(x => Math.abs(x.v)));
  return `<div class="fws-rank${o.plain ? ' plain' : ''}${o.thumbs ? ' thumbs' : ''}">${list.map((x, i) => `<${x.on ? 'button type="button"' : 'div'} class="fws-row${x.on ? ' fws-click' : ''}${x.sel ? ' sel' : ''}"${x.on ? ` onclick="${x.on}"` : ''}>
    ${o.plain ? '' : `<span class="fws-i">${i + 1}</span>`}${o.thumbs ? `<span class="fws-th">${fwImgSafe(x.img) ? `<img src="${esc(fwImgSafe(x.img))}" alt="" loading="lazy">` : '<i aria-hidden="true">📦</i>'}</span>` : ''}
    <span class="fws-n"><b>${esc(x.name)}</b>${x.sub ? `<small>${x.sub}</small>` : ''}</span>
    <span class="fws-v"><b>${fmt(x.v)}</b>${x.extra || ''}</span>
    <i class="fws-line" style="--w:${x.v ? Math.max(2, Math.round(Math.abs(x.v) / max * 100)) : 0}%;--c:var(--${x.c || o.c || 'gold'})"></i>
  </${x.on ? 'button' : 'div'}>`).join('')}</div>`;
}
function fwCardHtml(title, body, right, cls) {
  return `<section class="fws-card${cls ? ' ' + cls : ''}"><div class="fws-head"><b>${title}</b><i></i>${right || ''}</div>${body}</section>`;
}
function fwEmptyHtml(t) { return `<div class="fws-empty">${esc(t)}</div>`; }
// Mahsulotlar reytingi uchun: sotuv qatorlaridan (pid, nom, dona, summa) — eng yaxshi / sust
function fwProductRank(lines) {
  const g = fwGroup(lines, l => l.pid ?? l.name, (o, l) => { o.name = o.name || l.name || ('#' + l.pid); o.sku = o.sku || l.sku || ''; fwAdd(o, 'qty', l.qty); fwAdd(o, 'v', l.v); fwAdd(o, 'profit', l.profit); });
  return g.sort((x, y) => y.v - x.v);
}

const FW_PAY = { cash_uzs:["Naqd so'm",'emerald'], card:['Karta','purple'], usd:['Dollar','sky'], mixed:['Aralash','gold'], debt:['Qarzga','amber'] };
// Savdo qatorlari → mahsulot reytingi uchun (tushum, dona, foyda)
function fwSaleLines(sales) {
  const out = [];
  sales.forEach(s => (s.items||[]).forEach(i => {
    const v = +i.lineUsd || (+i.qty||0) * (+i.sellUsd||0);
    out.push({ pid:i.pid, name:i.name, sku:i.sku, qty:+i.qty||0, v, profit: v - (+i.qty||0) * (+i.costUsd||0) });
  }));
  return out;
}
function fwPayStackHtml(sales) {
  const by = {}; Object.keys(FW_PAY).forEach(k => by[k] = 0);
  sales.forEach(s => { const k = FW_PAY[s.payType] ? s.payType : 'cash_uzs'; by[k] += +s.totalUsd || 0; });
  const tot = Object.values(by).reduce((a, b) => a + b, 0);
  if (!tot) return fwEmptyHtml("Bu davrda sotuv yo'q");
  const rows = Object.entries(by).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
  return `<div class="fws-stack">${rows.map(([k, v]) => `<i style="flex:${v};background:var(--${FW_PAY[k][1]})" title="${FW_PAY[k][0]}"></i>`).join('')}</div>
    <div class="fws-legend">${rows.map(([k, v]) => `<div><span style="background:var(--${FW_PAY[k][1]})"></span><span>${FW_PAY[k][0]}</span><em>${fwPct(v, tot)}%</em><b>${fwUsd(v)}</b></div>`).join('')}</div>`;
}
// Yozuv ID'si uid() formatida (ms*1000+n) bo'lsa — yaratilgan soat (eski ID'lar hisobga olinmaydi)
function fwTsFromUid(id) { const n = Number(id); return (Number.isFinite(n) && n > 1e14) ? Math.floor(n / 1000) : null; }
function fwHourOf(id) { const ts = fwTsFromUid(id); return ts === null ? null : new Date(ts).getHours(); }
// Grafik ustuni sarlavhasi: kun (dd.mm.yyyy), soat (dd.mm.yyyy HH:00) yoki oy (mm.yyyy)
function fwPointTitle(p) { const [d, h] = String(p.k).split(' '); return d.split('-').reverse().join('.') + (h ? ' ' + h : ''); }
function fwHoursHtml(sales) {
  const pts = Array.from({ length:24 }, (_, h) => ({ k: String(h).padStart(2,'0') + ':00', label: h % 3 === 0 ? String(h).padStart(2,'0') : '', v:0 }));
  sales.forEach(s => { const h = fwHourOf(s.id); if (h !== null) pts[h].v += +s.totalUsd || 0; });
  const best = pts.reduce((m, p) => p.v > m.v ? p : m, pts[0]);
  return fwBarsHtml(pts, { c:'purple', aria:'Soatlar bo\'yicha savdo', empty:"Soatlar bo'yicha ma'lumot yo'q" })
    + (best.v ? `<div class="fws-note">Eng faol vaqt: <b>${best.k}</b> — ${fwUsd(best.v)}</div>` : '');
}

// ── Mahsulotlar reytingi kartasi (Statistika, Sotuvchilar, Dillerlar, portallar uchun bitta) ──
// o: { mode: 'top'|'low'|'none', fn: segment funksiyasi nomi, range: sana matni,
//      sold: [{pid,name,sku,qty,v,profit}], unsold: [{name,sku,qty,val}], imgOf(pid),
//      showProfit, unsoldLabel, unsoldNote, empty }
function fwRankCardHtml(o) {
  const seg = (k, l) => `<button type="button" class="${o.mode === k ? 'on' : ''}" onclick="${o.fn}('${k}')">${l}</button>`;
  const imgOf = o.imgOf || (() => '');
  let body;
  if (o.mode === 'none') {
    const list = (o.unsold || []).slice().sort((x, y) => (y.val || y.qty) - (x.val || x.qty)).slice(0, 10)
      .map(u => ({ name:u.name, img: imgOf(u.pid), v: u.val != null ? u.val : u.qty, c:'red', sub: `${esc(u.sku || '')}${u.sku ? ' · ' : ''}${fwNum(u.qty)} dona ${o.unsoldWhere || 'omborda'}` }));
    body = fwRankHtml(list, { thumbs:true, fmt: o.unsoldMoney ? fwUsd : (v => fwNum(v) + ' dona'), empty: o.unsoldEmpty || "Qoldig'i bor hamma mahsulot bu davrda sotilgan" })
      + (o.unsoldNote ? `<div class="fws-note">${o.unsoldNote}</div>` : '');
  } else {
    const r = fwProductRank(o.sold || []);
    if (o.mode === 'low') r.sort((x, y) => x.qty - y.qty || x.v - y.v);
    const list = r.slice(0, 10).map(x => ({ name:x.name, img: imgOf(x.key), v:x.v, c: o.mode === 'low' ? 'amber' : 'emerald',
      sub: `${esc(x.sku || '')}${x.sku ? ' · ' : ''}${fwNum(x.qty)} dona${o.showProfit ? ' · foyda ' + fwUsd(x.profit) : ''}` }));
    body = fwRankHtml(list, { thumbs:true, empty: o.empty || "Bu davrda sotuv yo'q" });
  }
  const n = fwProductRank(o.sold || []).length;
  return fwCardHtml('Mahsulotlar reytingi', `<div class="fws-sub">${esc(o.range || '')}${n ? ` · ${n} xil mahsulot sotilgan` : ''}</div>
    <div class="fws-seg">${seg('top','Eng yaxshi')}${seg('low','Kam sotilgan')}${seg('none', o.unsoldLabel || 'Sotuvsiz')}</div>` + body, '', o.cls || '');
}

// ════════════════════════════════════════════════════════════
// FILIAL MA'LUMOTINI XAVFSIZ BIRLASHTIRISH (v10, audit B1) — sotuvchi portali
// avval kirishda yuklangan ESKI nusxani butunligicha saqlardi: shu orada admin
// yoki boshqa sotuvchi qilgan savdo/kirim/kassa o'zgarishlari o'chib ketardi.
// Endi saqlashdan oldin serverdagi ENG SO'NGGI holat olinadi va:
//  • ro'yxatlar ID bo'yicha birlashtiriladi (yangi yozuvlar yo'qolmaydi,
//    serverda o'chirilgan (deletedIds) yozuvlar qaytib tirilmaydi);
//  • "yugurib turuvchi" raqamlar (kassa balansi, partiya "sold", mijoz/ta'minotchi
//    qarzi) DELTA orqali: server qiymati + shu qurilmadagi o'zgarish.
// Admin panelidagi _safeCloudSave bilan bir xil qoida.
// ════════════════════════════════════════════════════════════
const FW_MERGE_LISTS = ['sales','customers','suppliers','expenses','dailyClosings','revisions','cashTxns','salaryPeople','batches','cashboxes'];
const FW_MERGE_NUMS = { cashboxes:'bal', batches:'sold', customers:'debt', suppliers:'debt' };
function fwBranchNums(snap) {
  const o = {};
  Object.keys(FW_MERGE_NUMS).forEach(k => {
    const f = FW_MERGE_NUMS[k];
    o[k] = {};
    ((snap && Array.isArray(snap[k])) ? snap[k] : []).forEach(x => { if (x && x.id !== undefined) o[k][x.id] = +x[f] || 0; });
  });
  return o;
}
function fwMergeBranchSnap(remote, local, baseNums, deletedIds) {
  remote = remote || {}; local = local || {};
  const nowNums = fwBranchNums(local);
  const base = baseNums || nowNums;
  const isDel = (k, x) => ((deletedIds && deletedIds[k]) || []).some(d => d && d.id === x.id);
  const out = { ...remote };
  FW_MERGE_LISTS.forEach(k => {
    const map = new Map();
    (Array.isArray(remote[k]) ? remote[k] : []).forEach(x => { if (x && x.id !== undefined && !isDel(k, x)) map.set(x.id, x); });
    (Array.isArray(local[k]) ? local[k] : []).forEach(x => { if (x && x.id !== undefined && !isDel(k, x)) map.set(x.id, x); });
    out[k] = Array.from(map.values());
  });
  Object.keys(FW_MERGE_NUMS).forEach(k => {
    const f = FW_MERGE_NUMS[k];
    const rem = {};
    (Array.isArray(remote[k]) ? remote[k] : []).forEach(x => { if (x && x.id !== undefined) rem[x.id] = +x[f] || 0; });
    out[k] = out[k].map(x => {
      const now = nowNums[k][x.id];
      const b = (base[k] || {})[x.id];
      let v;
      if (rem[x.id] === undefined) v = (now !== undefined ? now : (+x[f] || 0));            // faqat shu qurilmada (yangi) yozuv
      else if (now === undefined) v = rem[x.id];                                          // faqat serverda — o'zgarmagan
      else v = rem[x.id] + (now - (b !== undefined ? b : now));                           // server + mening o'zgarishim
      const y = { ...x, [f]: Math.round(v * 1e6) / 1e6 };
      if (k === 'batches') y.status = ((+y.qty || 0) - y.sold <= 0) ? 'empty' : (y.status === 'empty' ? 'active' : y.status);
      return y;
    });
  });
  out.batchCounter = Math.max(+remote.batchCounter || 0, +local.batchCounter || 0);
  return out;
}

// ════════════════════════════════════════════
// v23.5 — Kichik oynalar (modal) bezagi: sarlavhadagi emoji → rangli ikonka,
// har bo'lim (sahifa) o'z rangida. Faqat DOM orqali (innerHTML'ga foydalanuvchi matni qo'shilmaydi).
// ════════════════════════════════════════════
const FW_MODAL_EMOJI_IC = {
  '✏':'edit','💰':'wallet','🔐':'lock','📦':'inventory','🏪':'store','👤':'person','🕒':'history','🧾':'receipt',
  '↩':'ret','💾':'check','📅':'calendar','📜':'history','✅':'check','🏢':'building','🔑':'key','➕':'add','+':'add',
  '📷':'camera','🔲':'qr','📋':'clipboard','🏭':'building','🧑‍💼':'person','🏆':'star','🚚':'truck','💱':'swap',
  '🃏':'card','🖼':'image','🔧':'settings','📤':'send','⚠':'warning','💸':'money','👥':'people','💳':'card',
  '🛒':'cart','📊':'chart','📈':'chart','🗑':'trash','💵':'money','🏛':'building','🤝':'people','🔄':'swap','📥':'inbox'
};
const FW_MODAL_DANGER = { '⚠':1, '🗑':1 };
function fwModalDecorate(ov) {
  try {
    const md = ov && ov.querySelector('.modal'); if (!md) return;
    ov.dataset.pg = (typeof S !== 'undefined' && S && S.page) || '';
    const t = md.querySelector('.modal-header .modal-title');
    if (!t || t.querySelector('.mh-ic')) return;
    const first = t.firstChild;
    if (!first || first.nodeType !== 3) return;
    const m = first.nodeValue.match(/^\s*((?:\p{Extended_Pictographic}|[+➕])(?:️|‍\p{Extended_Pictographic})*)\s*/u);
    if (!m) return;
    const em = m[1].replace(/️/g,'');
    const key = FW_MODAL_EMOJI_IC[em] || FW_MODAL_EMOJI_IC[[...em][0]];
    first.nodeValue = first.nodeValue.slice(m[0].length);
    const ic = document.createElement('span');
    ic.className = 'mh-ic' + (FW_MODAL_DANGER[[...em][0]] ? ' danger' : '');
    ic.setAttribute('aria-hidden','true');
    if (key && typeof ICONF !== 'undefined' && ICONF[key]) ic.innerHTML = ICONF[key];   // ICONF — ilova ichidagi doimiy SVG
    else ic.textContent = em;
    const txt = document.createElement('span'); txt.className = 'mh-t';
    while (t.firstChild) txt.appendChild(t.firstChild);
    t.appendChild(ic); t.appendChild(txt);
  } catch (e) { /* bezak — xato bo'lsa oyna oddiy ko'rinishda qoladi */ }
}

// ════════════════════════════════════════════
// v23.6 — BREND (white-label). Manba tartibi: ilova sozlamasi (S.settings.company / brandLogo)
// → shu qurilmadagi oxirgi ma'lum brend (kirish oynasi ma'lumot yuklanmasdan ko'rinadi)
// → js/brand.js (shu nusxaning standart brendi). Kodda firma nomi qattiq yozilmaydi.
// ════════════════════════════════════════════
const FW_BRAND_DEF = Object.assign({ name: 'ERP', slogan: '', logo: 'assets/brand-logo.png' }, (typeof window !== 'undefined' && window.FW_BRAND) || {});
function fwBrandLogoOk(u) {
  u = String(u || '');
  if (/^https:\/\/[^\s"'<>]{4,600}$/i.test(u)) return u;
  // Bulutsiz rejimda tanlangan logotip (faqat shu qurilmada; server bunday qiymatni saqlamaydi)
  if (u.length <= 250000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u)) return u;
  return '';
}
function fwBrand() {
  let c = null; try { c = JSON.parse(_fwGet('fw_brand') || 'null'); } catch (e) { c = null; }
  const st = (typeof S !== 'undefined' && S && S.settings) || {};
  const name = String(st.company || (c && c.name) || FW_BRAND_DEF.name || 'ERP').replace(/\s+/g, ' ').trim().slice(0, 60) || 'ERP';
  const logo = fwBrandLogoOk(st.brandLogo) || fwBrandLogoOk(c && c.logo) || FW_BRAND_DEF.logo;
  const slogan = String(st.brandSlogan != null ? st.brandSlogan : (c && c.slogan != null ? c.slogan : FW_BRAND_DEF.slogan) || '').slice(0, 80);
  return { name, logo, slogan, custom: !!fwBrandLogoOk(st.brandLogo || (c && c.logo)) };
}
// Logotip <img> (kirish oynasi, chek va h.k.) — atributlar ekranlangan
const FW_DEF_LOGOS = ['assets/brand-logo.png', 'assets/brand-logo.jpg'];
function fwBrandMarkSrc() { return fwBrand().logo; }   // v24.7.3: kichik belgi ham — logotipning o'zi (kesilgan nusxa emas)
// v24.7.3 (egasi talabi): LOGO — rasmning O'ZI (yozuv rasm ichida), kvadrat, ramkasiz; yoniga matn QO'SHILMAYDI.
// Boshqa firma o'z logotipini qo'ysa — aynan o'sha rasm chiqadi (fwApplyBrand data-brand-logo orqali almashtiradi).
// Rasm ochilmasa — faqat shunda nom matni ko'rinadi.
function fwBrandLockup(cls) {
  const b = fwBrand(); const lt = /\bon-light\b/.test(cls || '');
  return `<span class="fw-lock ${cls || ''}" role="img" aria-label="${esc(b.name)}"><img src="${esc(fwLogoShownSrc(b.logo, lt))}" alt="${esc(b.name)}" data-brand-logo${fwLogoCleanAttr(b.logo)} onerror="this.parentNode.classList.add('noimg')"><b class="fw-lock-fb" data-brand-name>${esc(b.name)}</b></span>`;
}
function fwBrandImg(style) { const b = fwBrand(); return `<img src="${esc(b.logo)}" alt="${esc(b.name)}" data-brand-logo style="${style || 'width:150px;display:block;margin:0 auto'}">`; }
// Dumaloq belgi: logotip, bo'lmasa nomning bosh harfi
function fwBrandMark(cls) { const b = fwBrand(), u = fwBrandMarkSrc(); return `<span class="fw-mark ${cls || ''}"><img src="${esc(fwLogoShownSrc(u, false))}" alt="" data-brand-mark${fwLogoCleanAttr(u)} onerror="this.remove()"><b>${esc((b.name[0] || 'E').toUpperCase())}</b></span>`; }

// v24.8.1 (egasi talabi): LOGOTIP HECH QAYERDA RAMKASIZ. Yuklangan logotip JPG bo'lsa (shaffoflik yo'q) uning oq foni
// kulrang/qorong'i fonda to'rtburchak «ramka» bo'lib ko'rinardi. Shu sabab fon brauzerda olib tashlanadi:
// chetga tutash, burchak rangiga yaqin piksellar shaffof qilinadi, rasm mazmun chegarasida kesiladi; qorong'i mavzu uchun
// qora (rangsiz) yozuv oqqa aylantirilgan nusxa ham tayyorlanadi. Natija shu qurilmada saqlanadi (keyingi ochilishda darhol).
// Asl fayl o'zgarmaydi (chek, favicon — asl rasm). Standart logotip allaqachon shaffof — unga tegilmaydi.
const _fwLogoMem = {};
function _fwLogoIsDef(u) { return !u || FW_DEF_LOGOS.includes(u) || /assets\/brand-logo(-dark)?\.png$/.test(u); }
function _fwLogoCached(u) {
  if (_fwLogoIsDef(u)) return null;
  if (_fwLogoMem[u]) return _fwLogoMem[u];
  try { const c = JSON.parse(_fwGet('fw_brand_clean') || 'null'); if (c && c.src === u && c.light && c.dark) return (_fwLogoMem[u] = c); } catch (e) {}
  return null;
}
function _fwIsDarkUi() { return typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'; }
function fwLogoShownSrc(u, onLight) { const c = _fwLogoCached(u); return c ? ((!onLight && _fwIsDarkUi()) ? c.dark : c.light) : u; }
function fwLogoCleanAttr(u) { return _fwLogoCached(u) ? ' data-fw-clean' : ''; }
// Piksellar ustida: fon (chetdan tutash, burchak rangiga yaqin) → shaffof; yumshoq chet; kesish. Natija — RGBA massiv.
function fwLogoKnockout(px, w, h) {
  const at = (x, y) => (y * w + x) * 4;
  const cs = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  const transp = cs.filter(i => px[i + 3] < 24).length >= 3;
  let bg = null;
  if (!transp) {
    // Fon rangi — burchaklarning eng ko'p mos kelgani (bitta burchakda logotip qismi bo'lishi mumkin)
    let best = null, bestN = -1;
    for (const i of cs) { const n = cs.filter(j => Math.max(Math.abs(px[i] - px[j]), Math.abs(px[i + 1] - px[j + 1]), Math.abs(px[i + 2] - px[j + 2])) <= 24).length; if (n > bestN) { bestN = n; best = i; } }
    bg = [px[best], px[best + 1], px[best + 2]];
  }
  const T1 = 34, T2 = 80, N = w * h;
  const dist = (i) => bg ? Math.max(Math.abs(px[i] - bg[0]), Math.abs(px[i + 1] - bg[1]), Math.abs(px[i + 2] - bg[2])) : 999;
  if (bg) {
    // 0 — ko'rilmagan, 1 — fon (shaffof), 3 — fon rangidagi, lekin logotip ichidagi katta joy (saqlanadi)
    const lab = new Uint8Array(N), isBg = (k) => dist(k * 4) <= T1 || px[k * 4 + 3] < 24;
    const fill = (seeds, mark) => { const st = seeds.slice(), out = []; for (const k of st) lab[k] = mark;
      while (st.length) { const k = st.pop(), x = k % w; out.push(k);
        for (const n of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k - w, k + w]) if (n >= 0 && n < N && !lab[n] && isBg(n)) { lab[n] = mark; st.push(n); } }
      return out; };
    const edge = []; for (let x = 0; x < w; x++) { edge.push(x, (h - 1) * w + x); } for (let y = 0; y < h; y++) { edge.push(y * w, y * w + w - 1); }
    fill([...new Set(edge)].filter(k => isBg(k)), 1);
    // Harflar ichidagi kichik «teshiklar» (O, A, R, D) ham fon; katta ichki oq joy — logotip qismi, qoladi
    for (let k = 0; k < N; k++) if (!lab[k] && isBg(k)) { const c = fill([k], 3); if (c.length <= N * 0.015) for (const j of c) lab[j] = 1; }
    for (let k = 0; k < N; k++) if (lab[k] === 1) px[k * 4 + 3] = 0;
    // Yumshoq chet: fonga tegib turgan piksellar — qisman shaffof va fon rangidan «tozalangan» (oq hoshiya qolmaydi)
    for (let k = 0; k < N; k++) {
      if (lab[k] === 1) continue; const x = k % w;
      if (!((x > 0 && lab[k - 1] === 1) || (x < w - 1 && lab[k + 1] === 1) || (k >= w && lab[k - w] === 1) || (k + w < N && lab[k + w] === 1))) continue;
      const i = k * 4, d = dist(i); if (d >= T2) continue;
      const a = Math.max(1, Math.round(255 * (d - T1) / (T2 - T1))) / 255;
      for (let c = 0; c < 3; c++) px[i + c] = Math.max(0, Math.min(255, Math.round((px[i + c] - bg[c] * (1 - a)) / a)));
      px[i + 3] = Math.min(px[i + 3], Math.round(a * 255));
    }
  }
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[at(x, y) + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;   // hammasi fon — rasm logotip emas, asl holicha qoladi
  return { x0, y0, x1, y1 };
}
// Qorong'i mavzu nusxasi: qora/to'q kulrang (rangsiz) piksellar → oq; rangli qismlar o'zgarmaydi
function fwLogoDarkify(px) {
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 8) continue;
    const mx = Math.max(px[i], px[i + 1], px[i + 2]), mn = Math.min(px[i], px[i + 1], px[i + 2]);
    if (mx < 110 && mx - mn < 36) { const v = 255 - Math.round(mx * 0.35); px[i] = px[i + 1] = px[i + 2] = v; }
  }
}
// Rasm (img yoki data URL) → { light, dark } PNG data URL'lar (yoki null)
function fwLogoCleanImage(img, maxDim) {
  try {
    const sc = Math.min(1, (maxDim || 360) / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const w = Math.max(1, Math.round((img.naturalWidth || img.width) * sc)), h = Math.max(1, Math.round((img.naturalHeight || img.height) * sc));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(img, 0, 0, w, h);
    const id = cx.getImageData(0, 0, w, h);
    const bb = fwLogoKnockout(id.data, w, h); if (!bb) return null;
    const pad = Math.round(Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) * 0.02);
    const X0 = Math.max(0, bb.x0 - pad), Y0 = Math.max(0, bb.y0 - pad), X1 = Math.min(w - 1, bb.x1 + pad), Y1 = Math.min(h - 1, bb.y1 + pad);
    const out = (data) => { cx.putImageData(data, 0, 0); const c2 = document.createElement('canvas'); c2.width = X1 - X0 + 1; c2.height = Y1 - Y0 + 1; c2.getContext('2d').drawImage(cv, X0, Y0, c2.width, c2.height, 0, 0, c2.width, c2.height); return c2.toDataURL('image/png'); };
    const light = out(id);
    const dk = new ImageData(new Uint8ClampedArray(id.data), w, h); fwLogoDarkify(dk.data);
    return { light, dark: out(dk) };
  } catch (e) { return null; }   // masalan CORS — asl rasm qoladi (CSS zaxira: yorug' fonda oq fon ko'rinmaydi)
}
function fwLogoClean(u) {
  if (_fwLogoIsDef(u) || typeof document === 'undefined' || typeof Image === 'undefined') return Promise.resolve(null);
  const c = _fwLogoCached(u); if (c) return Promise.resolve(c);
  if (fwLogoClean._p && fwLogoClean._p.u === u) return fwLogoClean._p.pr;
  const pr = new Promise((resolve) => {
    const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async';
    im.onload = () => {
      const r = fwLogoCleanImage(im, 360); if (!r) return resolve(null);
      const v = { src: u, light: r.light, dark: r.dark }; _fwLogoMem[u] = v;
      try { if (r.light.length + r.dark.length < 900000) _fwSet('fw_brand_clean', JSON.stringify(v)); } catch (e) {}
      resolve(v);
    };
    im.onerror = () => resolve(null);
    im.src = /^data:/.test(u) ? u : u + (u.includes('?') ? '&' : '?') + 'fwc=1';   // alohida so'rov — CORS bilan (keshdagi CORS'siz nusxa xalaqit bermaydi)
  });
  fwLogoClean._p = { u, pr };
  return pr;
}
// Sahifadagi barcha logotip rasmlariga tozalangan nusxani qo'yadi (mavzu almashganda ham)
function fwLogoApplyClean() {
  const b = fwBrand(); const c = _fwLogoCached(b.logo); if (!c) return;
  const dark = _fwIsDarkUi();
  document.querySelectorAll('img[data-brand-logo], img[data-brand-mark]').forEach(i => {
    const lt = !!i.closest('.on-light, .fw-login-card, .dl-login-box, .fw-splash');
    const want = (dark && !lt) ? c.dark : c.light;
    if (i.getAttribute('src') !== want) i.setAttribute('src', want);
    i.setAttribute('data-fw-clean', '');
  });
}
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  try { new MutationObserver(() => fwLogoApplyClean()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) {}
}
function fwApplyBrand() {
  const b = fwBrand();
  try {
    _fwSet('fw_brand', JSON.stringify({ name: b.name, logo: fwBrandLogoOk(b.logo), slogan: b.slogan }));
    const t = document.querySelector('title[data-brand-title]'); if (t) document.title = t.dataset.brandTitle.replace('{b}', b.name);
    document.querySelectorAll('img[data-brand-logo]').forEach(i => { i.removeAttribute('data-fw-clean'); if (i.getAttribute('src') !== b.logo) i.setAttribute('src', b.logo); i.alt = b.name; });
    const mk = fwBrandMarkSrc(); document.querySelectorAll('img[data-brand-mark]').forEach(i => { i.removeAttribute('data-fw-clean'); if (i.getAttribute('src') !== mk) i.setAttribute('src', mk); });
    fwLogoApplyClean(); fwLogoClean(b.logo).then(c => { if (c) fwLogoApplyClean(); });
    document.querySelectorAll('[data-brand-name]').forEach(e => { e.textContent = b.name; });
    document.querySelectorAll('[data-brand-slogan]').forEach(e => { e.textContent = b.slogan; e.hidden = !b.slogan; });
    let ic = document.querySelector('link[rel="icon"]'); if (!ic) { ic = document.createElement('link'); ic.rel = 'icon'; document.head.appendChild(ic); }
    ic.href = b.logo;
    const ap = document.querySelector('link[rel="apple-touch-icon"]'); if (ap) ap.href = b.logo;
    const mt = document.querySelector('meta[name="apple-mobile-web-app-title"]'); if (mt) mt.content = b.name;
  } catch (e) { /* brend — bezak; xato ilovani to'xtatmaydi */ }
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fwApplyBrand); else fwApplyBrand();
}

// ════════════════════════════════════════════
// v23.6 — Raqam maydonlari «1 000» ko'rinishida (kiritayotganda ham).
// type="number" maydonlar avtomatik matn maydoniga aylanadi (raqamli klaviatura saqlanadi); ekranda
// "23 300 000", lekin .value o'qilganda — bo'shliqsiz "23300000" (mavjud kod parseFloat bilan to'g'ri o'qiydi).
// Istisno: data-raw atributi bo'lgan maydon.
// ════════════════════════════════════════════
const _fwNativeVal = (typeof HTMLInputElement !== 'undefined') ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') : null;
function fwFmtNumStr(v) {
  const src = String(v == null ? '' : v);
  let s = src.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^-?\d*\.?\d*$/.test(s)) return src;
  const neg = s.startsWith('-'); if (neg) s = s.slice(1);
  const parts = s.split('.');
  const i = (parts[0] || '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '-' : '') + i + (parts.length > 1 ? '.' + parts[1] : '');
}
function fwNumInput(el) {
  if (!_fwNativeVal || !el || el._fwNum || el.hasAttribute('data-raw')) return;
  el._fwNum = true;
  const raw = _fwNativeVal.get.call(el);
  const step = el.getAttribute('step');
  el.type = 'text';
  if (!el.getAttribute('inputmode')) el.setAttribute('inputmode', (step && step !== '1' && step !== 'any') || !step ? 'decimal' : 'numeric');
  el.setAttribute('autocomplete', 'off'); el.classList.add('fw-num');
  Object.defineProperty(el, 'value', {
    configurable: true,
    get() { return _fwNativeVal.get.call(el).replace(/[\s ]/g, '').replace(',', '.'); },
    set(v) { _fwNativeVal.set.call(el, fwFmtNumStr(v)); },
  });
  _fwNativeVal.set.call(el, fwFmtNumStr(raw));
  el.addEventListener('input', () => {
    const cur = _fwNativeVal.get.call(el);
    const pos = el.selectionStart == null ? cur.length : el.selectionStart;
    const keep = cur.slice(0, pos).replace(/[^\d.,\-]/g, '').length;   // kursorgacha bo'lgan belgilar soni
    const cleaned = cur.replace(/[^\d.,\-]/g, '').replace(/(?!^)-/g, '').replace(/,/g, '.').replace(/(\..*)\./g, '$1');
    const out = fwFmtNumStr(cleaned);
    if (out === cur) return;
    _fwNativeVal.set.call(el, out);
    let n = 0, p = 0; while (p < out.length && n < keep) { if (/[\d.\-]/.test(out[p])) n++; p++; }
    try { el.setSelectionRange(p, p); } catch (e) {}
  }, true);
}
function fwNumScan(root) {
  if (!root || !root.querySelectorAll) return;
  if (root.matches && root.matches('input[type="number"]')) fwNumInput(root);
  root.querySelectorAll('input[type="number"]').forEach(fwNumInput);
}
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const _fwNumStart = () => {
    fwNumScan(document.body);
    new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(n => { if (n.nodeType === 1) fwNumScan(n); }); })
      .observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) _fwNumStart(); else document.addEventListener('DOMContentLoaded', _fwNumStart);
}

// v24: saqlash rad etilganda foydalanuvchiga ko'rsatiladigan aniq sabab (maxfiy ma'lumotsiz)
function fwSaveErrorText(status, serverMsg) {
  const m = typeof serverMsg === 'string' ? serverMsg.slice(0, 200) : '';
  if (status === 401) return m || 'Sessiya tugagan — qayta kiring';
  if (status === 403) return m || "Bu ma'lumotni saqlashga ruxsatingiz yo'q";
  if (status === 413) return "Ma'lumot hajmi juda katta (rasm yoki logotipni kichikroq qiling)";
  if (status === 429) return "Juda ko'p so'rov — birozdan so'ng qayta urinib ko'ring";
  if (status >= 500) return m || 'Server xatosi — birozdan so\'ng qayta urinib ko\'ring';
  return m || `Server rad etdi (${status})`;
}

// ── v24: KAM TO'LOV — yagona qoida (admin va sotuvchi oynalari) ──
// Qolgan summa so'mda (ko'rsatish uchun yaxlit so'm); hisob-kitob USD'dagi aniq qiymat bilan qoladi.
function fwShortfallUzs(shortUsd) { return Math.max(0, Math.round(CUR.toUzs(+shortUsd || 0))); }
// Spec: «Siz xaridorga 10 000 so'm chegirma berdingiz. Tasdiqlaysizmi?»
function fwDiscountConfirmText(shortUsd) { return `Siz xaridorga ${fwNum(fwShortfallUzs(shortUsd))} so'm chegirma berdingiz. Tasdiqlaysizmi?`; }
// Mijozsiz savdo nomi (bazada eski yozuvlar «Anonim» bo'lib qoladi — faqat ko'rinish)
const FW_CASH_SALE = 'Naqd savdo';
function fwCustLabel(name) { const n = String(name || '').trim(); return (!n || n === 'Anonim') ? FW_CASH_SALE : n; }

// ── v24: QR / shtrix-kod → mahsulot (admin, sotuvchi — bitta qoida): SKU yoki mahsulotdagi shtrix-kodlar ──
function fwBarcodes(p) { return [p && p.barcode, ...((p && Array.isArray(p.barcodes)) ? p.barcodes : [])].map(x => String(x || '').trim()).filter(Boolean); }
function fwResolveCode(products, text) {
  const t = String(text || '').trim(); if (!t) return null;
  const lt = t.toLowerCase(), list = (products || []).filter(p => p && !p.archived);
  return list.find(p => p.sku && String(p.sku).toLowerCase() === lt)
      || list.find(p => fwBarcodes(p).some(c => c.toLowerCase() === lt)) || null;
}
// Direct Sale: mahsulotda admin belgilagan ta'minotchi va ta'minotchi narxi bo'lsa — sotuvchi ham sota oladi
// (sotuvchi narxni ko'rmaydi; server bu qiymatlarni mahsulot ma'lumotidan qayta oladi)
// v24.8 (K2): tannarxni ko'rmaydigan xodimga server narxni TAYYOR beradi (retailUsd / optUsd, priceFromServer).
// Bunday mahsulotda brauzer tannarxdan narx hisoblamaydi. null — server narx bermagan (admin / «tannarx.view»).
function fwServerPrice(p, mode) {
  if (!p || !p.priceFromServer) return null;
  const v = mode === 'wholesale' ? +p.optUsd : +p.retailUsd;
  return Number.isFinite(v) ? v : 0;
}
function fwCostHidden(products) { return (products || []).some(p => p && p.priceFromServer); }
function fwDirectReady(p) { return !!(p && p.directSale && p.dsSuppId != null && (+p.dsCostUsd > 0 || (p.priceFromServer && p.dsReady === true))); }   // v24.8: tannarx yashirilgan xodimga — server belgisi

// ── v24: TAHRIRLASH MUDDATI (ko'rinish uchun; HAQIQIY tekshiruv — serverda, server vaqti bo'yicha, 31-migratsiya) ──
// Admin 30 kun, sotuvchi 7 kun, diller 4 kun — savdo sanasi (Toshkent kuni boshi)dan.
const FW_EDIT_DAYS = { admin: 30, seller: 7, dealer: 4 };
function fwEditWindow(dateStr, cls) {
  const days = FW_EDIT_DAYS[cls] || 0;
  const t0 = Date.parse(String(dateStr || '').slice(0, 10) + 'T00:00:00+05:00');
  if (!Number.isFinite(t0)) return { ok: true, days, leftDays: days };
  const left = t0 + days * 864e5 - Date.now();
  return { ok: left >= 0, days, leftDays: Math.max(0, Math.ceil(left / 864e5)) };
}
function fwEditWindowMsg(w) { return `⛔ Tahrirlash muddati tugagan (${w.days} kun). Oʻzgartirish kerak boʻlsa — administrator tuzatish yozuvi bilan.`; }

// ── v24: TELEFONNING «ORQAGA» TUGMASI — ochiq oyna (modal, pastki oyna, skaner, katalog) yopiladi,
// ilovadan chiqib ketilmaydi. Oyna ochilganda tarixga bitta «qo'riqchi» yozuv qo'shiladi; «Orqaga» bosilsa —
// eng ustidagi oyna yopiladi (yana oyna qolsa, qo'riqchi qayta qo'yiladi). X bilan yopilganda tarixga tegilmaydi
// (asinxron history.back() poygasi bo'lmasligi uchun) — keyingi «Orqaga» shunchaki qo'riqchini olib tashlaydi.
const FW_BACK = [];
let _fwGuard = false;
// v24.5: qo'riqchini olib tashlash (history.back) hali tugamagan bo'lsa — yangi qo'riqchi o'sha «popstate»dan keyin qo'yiladi
// (aks holda kechikkan «back» yangi yozuvni ham o'tib ketib, keyingi «Orqaga» ilovadan chiqarib yuborardi)
let _fwNeedGuard = false;
function _fwGuardPush() { if (_fwGuard) return; if (_fwIgnorePop > 0) { _fwNeedGuard = true; return; } try { history.pushState({ fwBack: 1 }, ''); _fwGuard = true; } catch (_) { /* tarixsiz muhit */ } }
function fwBackPush(key, closeFn) {
  const i = FW_BACK.findIndex(e => e.key === key);
  if (i >= 0) FW_BACK.splice(i, 1);                               // shu oyna qayta ochildi — eng ustiga
  FW_BACK.push({ key, closeFn });
  _fwGuardPush();
}
// v24.4: oyna ✕ bilan yopilsa, tarixdagi qo'riqchi yozuv ham olib tashlanadi (aks holda keyingi «Orqaga»
// hech narsa qilmas edi). Shu bosishda bo'lim almashsa (closeSheet(); go(…)) — qo'riqchi yangi bo'lim bilan
// almashtiriladi (fwGuardConsume), ortiqcha qadam qolmaydi.
let _fwPendingBack = null, _fwIgnorePop = 0;
function fwBackDone(key) {
  const i = FW_BACK.map(e => e.key).lastIndexOf(key); if (i >= 0) FW_BACK.splice(i, 1);
  if (i >= 0 && !FW_BACK.length && _fwGuard) {
    clearTimeout(_fwPendingBack);
    _fwPendingBack = setTimeout(() => {
      _fwPendingBack = null;
      if (!FW_BACK.length && _fwGuard && history.state && history.state.fwBack) { _fwIgnorePop++; _fwGuard = false; try { history.back(); } catch (_) { _fwIgnorePop--; } }
    }, 0);
  }
}
function fwGuardConsume() {
  if (_fwPendingBack) { clearTimeout(_fwPendingBack); _fwPendingBack = null; }
  if (_fwGuard && !FW_BACK.length && history.state && history.state.fwBack) { _fwGuard = false; return true; }
  return false;
}
// Qo'riqchi yozuv olib tashlangach manzil joriy bo'limga qaytariladi (eski yozuvdagi bo'lim ochilmaydi)
function _fwSyncHash() { try { const pg = (typeof S !== 'undefined' && S && S.page) || ''; if (pg && location.hash.slice(1) !== pg && typeof go === 'function') history.replaceState(history.state, '', '#' + pg); } catch (_) {} }
if (typeof window !== 'undefined') window.addEventListener('popstate', () => {
  if (_fwIgnorePop) { _fwIgnorePop--; _fwSyncHash(); if (!_fwIgnorePop && _fwNeedGuard) { _fwNeedGuard = false; if (FW_BACK.length) _fwGuardPush(); } return; }
  _fwGuard = false;
  const e = FW_BACK.pop();
  if (e) { try { e.closeFn(); } catch (_) {} }
  if (FW_BACK.length) _fwGuardPush();
  _fwSyncHash();
});

// v24.4: hujjat raqami — 0001 dan; «ro'yxat uzunligi + 1» emas, shu prefiksdagi ENG KATTA raqam + 1
// (savdo o'chirilgach keyingi raqam mavjud chek raqami bilan takrorlanmasin). Masalan: INV-0001 … INV-0100.
function fwNextDocNo(prefix, list, field) {
  let max = 0; const f = field || 'inv', pre = String(prefix);
  (list || []).forEach(x => { const v = String((x && x[f]) || ''); if (v.startsWith(pre)) { const m = /(\d+)$/.exec(v.slice(pre.length)); if (m) max = Math.max(max, parseInt(m[1], 10) || 0); } });
  return pre + String(max + 1).padStart(4, '0');
}

// ════════════════════════════════════════════════════════════
// v24.5 — KAMERA BILAN SHTRIX-KOD / QR SKANERLASH (barcha ilovalarda bitta)
// Sozlamalar: «Skaner» — 'camera' (telefon kamerasi, standart) | 'usb' (USB/Bluetooth skaner: klaviatura kabi yozib
// Enter bosadi — qidiruv maydoni o'zi qabul qiladi, kamera tugmasi yashiriladi). Qurilmaga bog'liq — localStorage.
// Avval brauzerning o'z BarcodeDetector'i (Android Chrome — tez, EAN/Code128/QR), bo'lmasa html5-qrcode kutubxonasi.
// ════════════════════════════════════════════════════════════
function fwScanMode() { return _fwGet('fw_scan_mode') === 'usb' ? 'usb' : 'camera'; }
function setScanMode(m) { _fwSet('fw_scan_mode', m === 'usb' ? 'usb' : 'camera'); }
function posScanMode() { return fwScanMode(); }
const _FWS = { stream: null, timer: null, h5: null, done: false, torch: false };
function _fwScanStop() {
  _FWS.done = true;
  clearTimeout(_FWS.timer); _FWS.timer = null;
  if (_FWS.stream) { try { _FWS.stream.getTracks().forEach(t => t.stop()); } catch (_) {} _FWS.stream = null; }
  if (_FWS.h5) { const h = _FWS.h5; _FWS.h5 = null; try { h.stop().then(() => { try { h.clear(); } catch (_) {} }).catch(() => {}); } catch (_) {} }
  const ov = document.getElementById('fw-scan-ov'); if (ov) ov.remove();
}
function fwScanClose() { _fwScanStop(); if (typeof fwBackDone === 'function') fwBackDone('fwscan'); }
function _fwScanErr(e) {
  const n = e && e.name;
  if (typeof window !== 'undefined' && window.isSecureContext === false) return 'Kamera faqat xavfsiz (https) manzilda ishlaydi.';
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Kameraga ruxsat berilmagan. Brauzer manzil satridagi qulf belgisi → «Kamera» → «Ruxsat berish».';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Kamera topilmadi.';
  if (n === 'NotReadableError') return 'Kamera boshqa ilova tomonidan band — uni yopib, qayta urinib koʻring.';
  return 'Kamerani ochib boʻlmadi' + (e && e.message ? ': ' + e.message : '') + '.';
}
async function fwScan(onCode, opts) {
  _fwScanStop(); _FWS.done = false;
  const ov = document.createElement('div');
  ov.id = 'fw-scan-ov'; ov.className = 'fw-scan-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Skanerlash');
  ov.innerHTML = `<div class="fw-scan-hd"><b>${esc((opts && opts.title) || 'Shtrix-kod yoki QR')}</b><button type="button" class="fw-scan-x" onclick="fwScanClose()" aria-label="Yopish">✕</button></div>
    <div class="fw-scan-v" id="fw-scan-v"><video id="fw-scan-video" playsinline muted autoplay></video><div id="fw-scan-h5"></div><i class="fw-scan-frame" aria-hidden="true"></i></div>
    <div class="fw-scan-st" id="fw-scan-st">Kamera ochilmoqda…</div>
    <div class="fw-scan-ft"><button type="button" id="fw-scan-torch" hidden onclick="_fwScanTorch()">Chiroq</button>
      <button type="button" onclick="_fwScanManual()">Kodni qoʻlda kiritish</button></div>`;
  document.body.appendChild(ov);
  if (typeof fwBackPush === 'function') fwBackPush('fwscan', () => _fwScanStop());
  _FWS.cb = (code) => {
    if (_FWS.done) return; const t = String(code || '').trim(); if (!t) return;
    try { navigator.vibrate && navigator.vibrate(60); } catch (_) {}
    fwScanClose(); try { onCode(t); } catch (e) { console.error(e); }
  };
  const st = (m) => { const el = document.getElementById('fw-scan-st'); if (el) el.textContent = m; };
  const video = document.getElementById('fw-scan-video');
  // 1) Brauzerning o'z detektori
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      const want = ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf', 'qr_code', 'data_matrix'];
      let fmts = want;
      try { const sup = await window.BarcodeDetector.getSupportedFormats(); fmts = want.filter(f => sup.includes(f)); } catch (_) {}
      const det = new window.BarcodeDetector({ formats: fmts.length ? fmts : undefined });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (_FWS.done) { stream.getTracks().forEach(t => t.stop()); return; }
      _FWS.stream = stream; video.srcObject = stream; await video.play().catch(() => {});
      try { const tr = stream.getVideoTracks()[0]; const cap = tr.getCapabilities ? tr.getCapabilities() : {}; if (cap.torch) document.getElementById('fw-scan-torch').hidden = false; } catch (_) {}
      st('Kodni ramka ichiga tuting');
      const tick = async () => {
        if (_FWS.done) return;
        try { if (video.readyState >= 2) { const r = await det.detect(video); if (r && r.length) { _FWS.cb(r[0].rawValue); return; } } } catch (_) {}
        _FWS.timer = setTimeout(tick, 120);
      };
      tick();
      return;
    } catch (e) { if (_FWS.done) return; if (e && (e.name === 'NotAllowedError' || e.name === 'NotFoundError' || e.name === 'NotReadableError' || e.name === 'SecurityError')) { st(_fwScanErr(e)); return; } }
  }
  // 2) Kutubxona (iPhone Safari va eski brauzerlar)
  video.hidden = true;
  if (typeof Html5Qrcode === 'undefined') { st('Skaner kutubxonasi yuklanmadi — internetni tekshiring yoki kodni qoʻlda kiriting.'); return; }
  try {
    const h = new Html5Qrcode('fw-scan-h5', { verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
    _FWS.h5 = h;
    await h.start({ facingMode: 'environment' }, { fps: 12, qrbox: (w, hh) => ({ width: Math.round(Math.min(w * 0.86, 380)), height: Math.round(Math.min(hh * 0.5, 220)) }), aspectRatio: 1.333 },
      (txt) => _FWS.cb(txt), () => {});
    st('Kodni ramka ichiga tuting');
  } catch (e) { st(_fwScanErr(e)); }
}
function _fwScanTorch() {
  try { const tr = _FWS.stream && _FWS.stream.getVideoTracks()[0]; if (!tr) return; _FWS.torch = !_FWS.torch; tr.applyConstraints({ advanced: [{ torch: _FWS.torch }] }); } catch (_) {}
}
function _fwScanManual() {
  const v = prompt('Shtrix-kod yoki mahsulot kodini kiriting:');
  if (v && v.trim()) _FWS.cb(v.trim());
}

// ════════════════════════════════════════════════════════════
// v24.5 — PORTAL SOZLAMALARI (sotuvchi va diller ilovalari). Egasi qarori (2026-10-14): xodim va diller faqat
// O'ZIGA tegishli sozlamalarni ko'radi — shaxsiy (mavzu, matn o'lchami, skaner, parol) va o'z filiali
// (chek matni, telefon, manzil; o'zgartirish — faqat «sozlamalar.edit» ruxsati bilan, server ham tekshiradi).
// Do'kon, narx, kassa, rollar va boshqa filiallar sozlamalari bu yerda yo'q.
// ════════════════════════════════════════════════════════════
const FW_THEME_LABELS = { system: 'Avtomatik (kun/tun)', light: 'Kunduzgi', dark: 'Tungi', oled: 'Qora (OLED)', mono: 'Monoxrom tungi', 'mono-light': 'Monoxrom kunduzgi' };
let PTS = null;
function ptSettingsOpen(o) {
  PTS = o || PTS || {};
  let ov = document.getElementById('pts-ov');
  if (!ov) { ov = document.createElement('div'); ov.id = 'pts-ov'; ov.className = 'pos-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Sozlamalar'); document.body.appendChild(ov);
    if (typeof fwBackPush === 'function') fwBackPush('ptset', _ptSettingsCloseUi); }
  document.body.classList.add('pos-lock');
  const th = getThemeMode(), ts = getTextScale(), sm = fwScanMode(), br = PTS.branch, bs = br ? (br.get() || {}) : null;
  const opt = (cur, v, l, fn) => `<button class="${cur === v ? 'on' : ''}" onclick="${fn}('${v}')">${esc(l)}</button>`;
  ov.innerHTML = `<div class="pos-scr">
    <header class="pos-hd"><button class="pos-ib" onclick="ptSettingsClose()" aria-label="Yopish">✕</button><div class="pos-hd-t"><b>Sozlamalar</b><small>${esc(PTS.who || '')}</small></div></header>
    <div class="pos-scr-b">
      <div class="pos-sec">PROFIL</div>
      <div class="pts-me"><span class="pts-me-av">${esc(String(PTS.who || '?').trim().slice(0, 1).toUpperCase())}</span><span class="pts-me-t"><b>${esc(PTS.who || '')}</b><small>${esc([PTS.role, PTS.filial].filter(Boolean).join(' · '))}</small></span></div>
      ${Array.isArray(PTS.stats) && PTS.stats.length ? `<div class="pts-stats">${PTS.stats.map(s => `<div><small>${esc(s[0])}</small><b>${esc(s[2])}</b><em>${esc(s[1])}</em></div>`).join('')}</div>` : ''}
      <div class="pos-sec">DIZAYN</div>
      <label class="pos-lbl">Mavzu</label>
      <div class="pts-grid">${FW_THEMES.map(v => opt(th, v, FW_THEME_LABELS[v] || v, 'ptSetTheme')).join('')}</div>
      <label class="pos-lbl">Matn oʻlchami</label>
      <span class="pos-seg wide">${FW_TEXT_SCALES.map(v => `<button class="${ts === v ? 'on' : ''}" onclick="ptSetScale(${v})">${v}%</button>`).join('')}</span>
      <div class="pos-sec">SKANER</div>
      <span class="pos-seg wide">${opt(sm, 'camera', 'Telefon kamerasi', 'ptSetScan')}${opt(sm, 'usb', 'USB / Bluetooth skaner', 'ptSetScan')}</span>
      <div class="pos-hint">${sm === 'camera' ? 'Qidiruv yonidagi tugma kamerani ochadi va shtrix-kodni oʻzi oʻqiydi.' : 'Skaner kodni yozib Enter bosadi — qidiruv maydoni oʻzi qabul qiladi.'}</div>
      ${br ? `<div class="pos-sec">FILIAL — ${esc(PTS.filial || '')}</div>
        <label class="pos-lbl" for="pts-rc">Chek pastidagi matn</label><textarea class="pos-in" id="pts-rc" rows="2" maxlength="200" ${br.canEdit ? '' : 'disabled'} placeholder="Xaridingiz uchun rahmat!">${esc(bs.receipt || '')}</textarea>
        <label class="pos-lbl" for="pts-ph">Filial telefoni</label><input class="pos-in" id="pts-ph" maxlength="40" inputmode="tel" ${br.canEdit ? '' : 'disabled'} value="${esc(bs.phone || '')}">
        <label class="pos-lbl" for="pts-ad">Manzil</label><input class="pos-in" id="pts-ad" maxlength="200" ${br.canEdit ? '' : 'disabled'} value="${esc(bs.address || '')}">
        ${br.canEdit ? `<button class="pos-btn pri" onclick="ptSaveBranch(this)">Filial sozlamalarini saqlash</button>` : `<div class="pos-hint">Oʻzgartirish uchun administratorga murojaat qiling (ruxsat: sozlamalar).</div>`}` : ''}
      ${PTS.password ? `<div class="pos-sec">PAROL</div>
        <label class="pos-lbl" for="pts-pw1">Yangi parol (kamida 8 belgi)</label><input class="pos-in" id="pts-pw1" type="password" autocomplete="new-password" maxlength="72">
        <label class="pos-lbl" for="pts-pw2">Yangi parolni takrorlang</label><input class="pos-in" id="pts-pw2" type="password" autocomplete="new-password" maxlength="72">
        <button class="pos-btn ghost" onclick="ptChangePw(this)">Parolni oʻzgartirish</button>` : ''}
      ${PTS.pwTg ? fwPwTgCardHtml() : ''}
      ${PTS.onLogout ? `<button class="pos-btn ghost red-t" style="margin-top:12px" onclick="ptSettingsClose();(${PTS.onLogout.name})()">Chiqish</button>` : ''}
    </div>
  </div>`;
  if (PTS.pwTg) fwPwTgLoad();   // v24.9: parolni tiklash uchun Telegram holati
}
function _ptSettingsCloseUi() { document.getElementById('pts-ov')?.remove(); if (!document.getElementById('pos-ov')) document.body.classList.remove('pos-lock'); }
function ptSettingsClose() { _ptSettingsCloseUi(); if (typeof fwBackDone === 'function') fwBackDone('ptset'); }
function ptSetTheme(v) { setThemeMode(v); ptSettingsOpen(); }
function ptSetScale(v) { setTextScale(v); ptSettingsOpen(); }
function ptSetScan(v) { setScanMode(v); ptSettingsOpen(); if (typeof posRender === 'function' && typeof POS !== 'undefined' && POS.a && POS.a.el && POS.a.el()) posRender(); }
async function ptSaveBranch(btn) {
  const br = PTS && PTS.branch; if (!br || !br.canEdit) return;
  const v = { receipt: (document.getElementById('pts-rc')?.value || '').trim().slice(0, 200), phone: (document.getElementById('pts-ph')?.value || '').trim().slice(0, 40), address: (document.getElementById('pts-ad')?.value || '').trim().slice(0, 200) };
  if (btn) btn.disabled = true;
  try { await br.save(v); toast('✅ Filial sozlamalari saqlandi'); }
  catch (e) { toast('⛔ ' + (e && e.message || 'Saqlanmadi'), 'error'); }
  finally { if (btn) btn.disabled = false; }
}
async function ptChangePw(btn) {
  const a = document.getElementById('pts-pw1')?.value || '', b = document.getElementById('pts-pw2')?.value || '';
  if (a.length < 8) { toast('Parol kamida 8 belgidan iborat boʻlsin', 'error'); return; }
  if (a !== b) { toast('Parollar mos emas', 'error'); return; }
  if (btn) btn.disabled = true;
  try { await PTS.password(a); toast('✅ Parol oʻzgartirildi'); document.getElementById('pts-pw1').value = ''; document.getElementById('pts-pw2').value = ''; }
  catch (e) { toast('⛔ ' + (e && e.message || 'Parol oʻzgarmadi'), 'error'); }
  finally { if (btn) btn.disabled = false; }
}

// ════════════════════════════════════════════════════════════
// v24.5 — HUJJATLAR: CHOP ETISH → PDF + YUBORISH (barcha ilovalarda bitta)
// Chek, hisobot, tarix, akt va h.k. ilova ichidagi oynada ochiladi: «PDF», «Yuborish» (telefonning ulashish
// oynasi — Telegram, WhatsApp va h.k.), «Chop etish»; administratorda — «Botga» ham.
// PDF — js/vendor/html2pdf.bundle.min.js (MIT, o'zimizda; CDN'siz, faqat kerak bo'lganda yuklanadi). Matn rasm
// sifatida joylanadi — oʻzbek harflari (ʻ ʼ) va kirill har qanday qurilmada to'g'ri chiqadi.
// ════════════════════════════════════════════════════════════
// (v24.5 audit: kutubxona endi fwDocBlob'dagi yashirin iframe ichida yuklanadi — asosiy oynaga yuklanmaydi)
const FWD = { html: '', title: '', file: '', kind: 'a4', widthMm: 80, bot: null, blob: null };
function fwDocName(t) { return String(t || 'hujjat').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'hujjat'; }
// Eski «window.open + document.write» chop etish kodlari uchun mos o'rinbosar: yozilgan HTML ilova ichidagi oynada ochiladi
function fwDocWin(kind) {
  let buf = '';
  return {
    document: { write(h) { buf += h; }, writeln(h) { buf += h + '\n'; }, close() {
      const t = /<title>([\s\S]*?)<\/title>/i.exec(buf); fwDoc({ html: buf, title: t ? t[1].replace(/<[^>]*>/g, '').trim() : '', kind: kind || 'a4' }); } },
    focus() {}, print() {}, close() {},
  };
}
function fwDoc(o) {
  Object.assign(FWD, { html: String(o.html || ''), title: o.title || 'Hujjat', file: fwDocName(o.file || o.title) + '.pdf', kind: o.kind === 'receipt' ? 'receipt' : 'a4',
    widthMm: +o.widthMm || 80, bot: typeof o.bot === 'function' ? o.bot : (typeof fwDocBotDefault === 'function' ? fwDocBotDefault() : null), botLabel: o.botLabel || null, blob: null });
  let ov = document.getElementById('fw-doc-ov');
  if (!ov) { ov = document.createElement('div'); ov.id = 'fw-doc-ov'; ov.className = 'pos-ov fw-doc-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); document.body.appendChild(ov);
    if (typeof fwBackPush === 'function') fwBackPush('fwdoc', _fwDocCloseUi); }
  document.body.classList.add('pos-lock');
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;
  ov.innerHTML = `<div class="pos-scr fw-doc-scr">
    <header class="pos-hd"><button class="pos-ib" onclick="fwDocClose()" aria-label="Yopish">✕</button><div class="pos-hd-t"><b>${esc(FWD.title)}</b><small>${FWD.kind === 'receipt' ? 'Chek' : 'Hujjat'} · PDF</small></div></header>
    <div class="fw-doc-tools">
      <button class="pos-btn pri" onclick="fwDocPdf(this)">PDF yuklab olish</button>
      ${canShare ? `<button class="pos-btn ghost" onclick="fwDocShare(this)">Yuborish</button>` : ''}
      <button class="pos-btn ghost" onclick="fwDocPrint()">Chop etish</button>
      ${FWD.bot ? `<button class="pos-btn ghost" onclick="fwDocBot(this)">${esc(FWD.botLabel || 'Botga')}</button>` : ''}
    </div>
    <div class="fw-doc-wrap"><iframe id="fw-doc-frame" class="fw-doc-frame${FWD.kind === 'receipt' ? ' rc' : ''}" title="${esc(FWD.title)}" sandbox="allow-same-origin allow-modals"></iframe></div>
  </div>`;
  const fr = document.getElementById('fw-doc-frame');
  fr.srcdoc = _fwDocNoScripts(FWD.html);
  fr.onload = () => { try { const d = fr.contentDocument; fr.style.height = Math.max(300, d.documentElement.scrollHeight + 24) + 'px'; } catch (_) {} };
}
// Hujjat ichidagi skriptlar ishlamaydi (eski «window.print()» va h.k.) — sandbox ham bloklaydi, bu yerda ham olib tashlanadi
function _fwDocNoScripts(h) { return String(h).replace(/<script[\s\S]*?<\/script>/gi, ''); }
function _fwDocCloseUi() { document.getElementById('fw-doc-ov')?.remove(); if (!document.getElementById('pos-ov') && !document.getElementById('pts-ov')) document.body.classList.remove('pos-lock'); }
function fwDocClose() { _fwDocCloseUi(); if (typeof fwBackDone === 'function') fwBackDone('fwdoc'); }
function fwDocPrint() {
  const fr = document.getElementById('fw-doc-frame');
  if (FWD.kind === 'receipt') fwReceiptFitPage(fr && fr.contentDocument, FWD.widthMm);
  try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('Chop etib boʻlmadi: ' + (e && e.message || ''), 'error'); }
}
// v24.5 audit: PDF hujjatning O'Z uslublari bilan yaratiladi. Avval html2pdf iframe ichidagi <body>'ni asosiy sahifaga
// nusxalab chizardi — iframe <head>'idagi CSS yo'qolardi: chek uslubsiz (serif, flex yo'q), uzun nom/SKU kesilib,
// 58 mm chek 2 sahifaga bo'linardi. Endi: alohida yashirin iframe (shu sayt), HTML avval xavfsiz tozalanadi
// (script/iframe/object, on* atributlar, javascript: havolalar olib tashlanadi), PDF kutubxonasi o'sha iframe ichida ishlaydi.
function _fwDocSafeHtml(h) {
  const doc = new DOMParser().parseFromString(String(h || ''), 'text/html');
  doc.querySelectorAll('script,iframe,object,embed,base,link[rel="import"],meta[http-equiv]').forEach(n => n.remove());
  doc.querySelectorAll('*').forEach(n => { for (const a of [...n.attributes]) {
    if (/^on/i.test(a.name) || (/^(href|src|xlink:href|action|formaction)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name);
  } });
  return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
}
async function fwDocBlob() {
  if (FWD.blob) return FWD.blob;
  const pxW = FWD.kind === 'receipt' ? Math.round(FWD.widthMm * 96 / 25.4) : 794;
  const ifr = document.createElement('iframe');
  ifr.setAttribute('aria-hidden', 'true'); ifr.tabIndex = -1;
  ifr.style.cssText = `position:fixed;left:-20000px;top:0;width:${pxW}px;height:200px;border:0;opacity:0;pointer-events:none`;
  try {
    await new Promise((res, rej) => { ifr.onload = res; ifr.onerror = () => rej(new Error('Hujjat tayyor emas')); ifr.srcdoc = _fwDocSafeHtml(FWD.html); document.body.appendChild(ifr); });
    const w = ifr.contentWindow, d = ifr.contentDocument;
    if (!d || !d.body) throw new Error('Hujjat tayyor emas');
    await new Promise((res, rej) => { const s = d.createElement('script'); s.src = '/js/vendor/html2pdf.bundle.min.js';
      s.onload = () => (w.html2pdf ? res() : rej(new Error('PDF kutubxonasi yuklanmadi'))); s.onerror = () => rej(new Error('PDF kutubxonasi yuklanmadi — internetni tekshiring')); d.head.appendChild(s); });
    if (d.fonts && d.fonts.ready) await d.fonts.ready;
    const el = d.body, lib = w.html2pdf;
    const inRealm = (o) => w.JSON.parse(JSON.stringify(o));   // kutubxona iframe'da — massivlar o'sha oynaniki bo'lsin (instanceof Array)
    const opt = { margin: FWD.kind === 'receipt' ? [0, 0, 0, 0] : [10, 10, 12, 10], filename: FWD.file, image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: pxW }, pagebreak: { mode: ['css', 'legacy'] },
      jsPDF: FWD.kind === 'receipt' ? { unit: 'mm', format: [FWD.widthMm, 60], orientation: 'portrait' } : { unit: 'mm', format: 'a4', orientation: 'portrait' } };
    // Chek — bitta uzun sahifa: balandlik html2pdf'ning o'z rasmidan o'lchanadi (taxmin emas)
    if (FWD.kind === 'receipt') {
      const c = await lib().set(inRealm({ ...opt, jsPDF: { unit: 'mm', format: [FWD.widthMm, 200], orientation: 'portrait' } })).from(el).toCanvas().get('canvas');
      // v25: balandlik — chekning o'zidan (body), ortiqcha bo'sh joy va 2-sahifa yo'q
      const hMm = Math.max(c && c.width ? c.height / c.width * FWD.widthMm : 0, el.offsetHeight * 25.4 / 96);
      opt.jsPDF = { unit: 'mm', format: [FWD.widthMm, Math.max(40, Math.ceil(hMm) + 1)], orientation: 'portrait' };
    }
    const b = await lib().set(inRealm(opt)).from(el).outputPdf('blob');
    // iframe olib tashlangach uning obyektlari ishlamaydi — PDF asosiy oynaga ko'chiriladi
    FWD.blob = new Blob([await b.arrayBuffer()], { type: 'application/pdf' });
    return FWD.blob;
  } finally { ifr.remove(); }
}
// v24.6: hujjat oynasini ochmasdan PDF (masalan investor hisobotini to'g'ridan-to'g'ri Telegramga yuborish)
async function fwHtmlToPdfBlob(html, kind, file) {
  const keep = { html: FWD.html, kind: FWD.kind, file: FWD.file, blob: FWD.blob, widthMm: FWD.widthMm };
  Object.assign(FWD, { html: String(html || ''), kind: kind === 'receipt' ? 'receipt' : 'a4', file: (file || 'hujjat') + '.pdf', blob: null });
  try { return await fwDocBlob(); } finally { Object.assign(FWD, keep); }
}
async function _fwDocBusy(btn, fn) {
  if (btn) { btn.disabled = true; btn.dataset.t = btn.textContent; btn.textContent = 'Tayyorlanmoqda…'; }
  try { await fn(); } catch (e) { toast('⛔ ' + (e && e.message || 'Xato'), 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = btn.dataset.t || btn.textContent; } }
}
function fwDocPdf(btn) {
  return _fwDocBusy(btn, async () => {
    const b = await fwDocBlob(); const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = FWD.file; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000); toast('✅ PDF yuklab olindi');
  });
}
function fwDocShare(btn) {
  return _fwDocBusy(btn, async () => {
    const b = await fwDocBlob(); const f = new File([b], FWD.file, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: FWD.title }); } catch (e) { if (e && e.name !== 'AbortError') throw e; } }
    else { const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = FWD.file; a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); toast('Bu qurilmada ulashish yoʻq — PDF yuklab olindi, uni Telegram orqali yuboring'); }
  });
}
function fwDocBot(btn) {
  return _fwDocBusy(btn, async () => {
    const b = await fwDocBlob();
    if (b.size > 4 * 1024 * 1024) throw new Error('Fayl juda katta (4 MB dan ortiq) — PDF yuklab olib yuboring');
    await FWD.bot(b, FWD.file, FWD.title); toast('✅ Telegram botga yuborildi');
  });
}
function fwBlobToB64(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('Fayl oʻqilmadi')); r.readAsDataURL(b); }); }

// Chek (savdo) — admin va sotuvchi uchun bitta ko'rinish. v24.5 audit: mahsulot nomi va miqdori BITTA qatorda; nom
// hech qachon kesilmaydi (uzun bo'lsa o'raladi), summa keyingi qatorda — 58/72/80 mm da gorizontal toshish yo'q.
// So'mdagi savdo — so'mda (yaxlit), $ dagi — $ da.
// v25: chek hisobi bitta joyda — qator = miqdor × (yaxlitlangan) narx; chegirma = qatorlar yig'indisi − JAMI
// (shunda chekdagi raqamlar har doim bir-biriga teng chiqadi); to'landi = JAMI − mijoz haqidan − qarz.
function fwReceiptCalc(sale, rate, uzs) {
  const r2 = (n) => Math.round((+n || 0) * 100) / 100;
  const N = (usd) => uzs ? Math.round((+usd || 0) * rate) : r2(usd);
  const lines = (sale.items || []).map(i => {
    const qty = +i.qty || 0, unit = N(i.sellUsd);
    return { name: String(i.name || ''), sku: i.sku || '', qty, unit, line: uzs ? Math.round(qty * unit) : r2(qty * unit) };
  });
  const sum = uzs ? lines.reduce((a, l) => a + l.line, 0) : r2(lines.reduce((a, l) => a + l.line, 0));
  const total = uzs ? (+sale.roundedTotalUzs > 0 ? Math.round(+sale.roundedTotalUzs) : N(sale.totalUsd)) : r2(sale.totalUsd);
  const disc = Math.max(0, uzs ? sum - total : r2(sum - total));
  const credit = +sale.creditUseUzs > 0 ? (uzs ? Math.round(+sale.creditUseUzs) : r2(+sale.creditUseUzs / (rate || 1))) : 0;
  const debt = (+sale.debtUsd || 0) > 0.004 ? Math.min(total, N(sale.debtUsd)) : 0;
  const paid = Math.max(0, uzs ? total - credit - debt : r2(total - credit - debt));
  const change = +sale.changeN > 0 ? (uzs ? Math.round(+sale.changeN) : r2(sale.changeN)) : 0;
  const given = change > 0 ? (uzs ? Math.round(+sale.paidN || paid + change) : r2(+sale.paidN || paid + change)) : 0;
  return { lines, sum, total, disc, credit, debt, paid, change, given, units: lines.reduce((a, l) => a + l.qty, 0) };
}
function fwReceiptHtml(sale, o) {
  o = o || {};
  const mm = [58, 72, 80].includes(+o.widthMm) ? +o.widthMm : 72;
  const pw = mm === 58 ? 48 : mm === 72 ? 64 : 72;
  // v24.5 audit: kurs noma'lum bo'lsa qattiq 12800 ishlatilmaydi (noto'g'ri so'm summa chiqardi) — summa $ da ko'rsatiladi
  const rate = +sale.rateUsdUzs || +o.rate || 0;
  const uzs = sale.cur ? sale.cur !== 'USD' && rate > 0 : false;
  const c = fwReceiptCalc(sale, rate, uzs);
  const f = (n) => uzs ? fwNum(n) : fwUsd(n).replace('$', '');
  const cu = uzs ? 'soʻm' : '$';
  const qn = (q) => Number.isInteger(q) ? fwNum(q) : String(Math.round(q * 1000) / 1000).replace('.', ',');
  const payName = { cash_uzs: 'Naqd', cash: 'Naqd', card: 'Karta', usd: 'Dollar', mixed: 'Aralash', debt: 'Qarzga' }[sale.payType] || 'Toʻlandi';
  const discLbl = sale.discountReason === 'rounding' ? 'Yaxlitlash' : 'Chegirma';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Chek ${esc(sale.inv || '')}</title><style>
    @page{ size:${mm}mm 297mm; margin:0 }
    html,body{background:#fff;color:#000} body{font-family:'Courier New',monospace;font-size:${mm === 58 ? 11 : 12.5}px;margin:0 auto;padding:4mm 0;width:${pw}mm}
    h3{text-align:center;margin:0 0 2px;font-size:1.25em;overflow-wrap:anywhere}.ctr{text-align:center;overflow-wrap:anywhere}
    .div{border-top:1px dashed #777;margin:6px 0}.row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:0 6px;margin:2px 0}
    .row>span{min-width:0;overflow-wrap:anywhere}.row>span:last-child{margin-left:auto;text-align:right;white-space:nowrap}
    .it{display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin:3px 0 0}
    .it .nm{flex:1 1 auto;min-width:0;overflow-wrap:anywhere;word-break:break-word}.it .q{flex:none;white-space:nowrap;font-weight:bold}
    .sub{font-size:.88em;color:#333}.tot{font-weight:bold;font-size:1.2em}.foot{text-align:center;margin-top:10px;font-size:.9em;color:#333}
  </style></head><body>
    <h3>${esc(o.brand || 'Doʻkon')}</h3>
    ${o.phone ? `<div class="ctr">${esc(o.phone)}</div>` : ''}${o.address ? `<div class="ctr">${esc(o.address)}</div>` : ''}
    <div class="ctr">${esc(fwDmy(sale.date))}${sale.time ? ' ' + esc(sale.time) : ''} | ${esc(sale.inv || '')}</div>
    <div class="ctr">Mijoz: ${esc(fwCustLabel(sale.custName))}</div>
    ${sale.staffName ? `<div class="ctr sub">Sotuvchi: ${esc(sale.staffName)}</div>` : ''}
    <div class="div"></div>
    ${c.lines.map(l => `<div class="it"><span class="nm">${esc(l.name)}</span><span class="q">× ${esc(qn(l.qty))}</span></div>
      <div class="row sub"><span>${f(l.unit)}${l.sku ? ' · ' + esc(l.sku) : ''}</span><span>${f(l.line)}</span></div>`).join('')}
    <div class="div"></div>
    <div class="row sub"><span>${c.lines.length} xil</span><span>${esc(qn(c.units))} dona</span></div>
    ${c.disc > 0 ? `<div class="row"><span>Jami:</span><span>${f(c.sum)} ${cu}</span></div><div class="row"><span>${discLbl}:</span><span>−${f(c.disc)} ${cu}</span></div>` : ''}
    <div class="row tot"><span>JAMI:</span><span>${f(c.total)} ${cu}</span></div>
    ${c.credit > 0 ? `<div class="row"><span>Mijoz haqidan:</span><span>${f(c.credit)} ${cu}</span></div>` : ''}
    ${c.debt > 0 ? `<div class="row"><span>Toʻlandi:</span><span>${f(c.paid)} ${cu}</span></div><div class="row"><span>Qarz:</span><span>${f(c.debt)} ${cu}</span></div>${sale.dueDate ? `<div class="row sub"><span>Toʻlov sanasi:</span><span>${esc(fwDmy(sale.dueDate))}</span></div>` : ''}`
      : c.change > 0 ? `<div class="row"><span>${payName}:</span><span>${f(c.given)} ${cu}</span></div><div class="row"><span>Qaytim:</span><span>${f(c.change)} ${cu}</span></div>`
      : c.paid > 0 ? `<div class="row sub"><span>${payName}:</span><span>${f(c.paid)} ${cu}</span></div>` : ''}
    ${sale.pending ? '<div class="ctr sub">(oflayn — serverga yuborilmoqda)</div>' : ''}
    <div class="div"></div>
    <div class="foot">${esc(o.footer || 'Xaridingiz uchun rahmat!')}</div>
  </body></html>`;
}
// v25: chek chop etilganda qog'oz balandligi chek uzunligiga teng (avval «auto» — brauzer rad etib, A4/Letter'ga chiqarardi)
function fwReceiptFitPage(doc, widthMm) {
  try {
    const b = doc.body; if (!b) return;
    const hMm = Math.max(40, Math.ceil(b.offsetHeight * 25.4 / 96) + 3);
    let st = doc.getElementById('fw-page-fit');
    if (!st) { st = doc.createElement('style'); st.id = 'fw-page-fit'; doc.head.appendChild(st); }
    st.textContent = `@page{size:${widthMm}mm ${hMm}mm;margin:0}`;
  } catch (_) {}
}

// v24.7: CHIQISH — xayrlashuv ekrani (kafel naqshli brend foni, navbatma-navbat yonadigan plitkalar), sessiya to'liq yopilgach bitta kirish oynasiga qaytadi.
// signOut kutiladi (oldin reload undan oldin bo'lib, sessiya ba'zan qolib ketardi); 2.5 soniyadan oshsa — baribir davom etadi.
async function fwLogoutFlow(client, name) {
  try { ['bp_auth_ok','bp_pin_ok','bp_branch_ok','bp_staff_id','fw_fast_staff'].forEach(k => sessionStorage.removeItem(k)); } catch (e) {}
  try { localStorage.removeItem('fw_off_auth_v1'); localStorage.removeItem('fw_quick_v1'); } catch (e) {}   // v25: chiqqanda oflayn va tez kirish ham o'chadi
  const h = new Date().getHours(), bye = h < 5 || h >= 18 ? 'Xayrli kech' : 'Yaxshi dam oling';
  const el = document.createElement('div');
  el.className = 'fw-bye fw-brand-bg';
  el.innerHTML = '<svg class="fw-bye-ic" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" aria-hidden="true">'
    + '<rect x="6" y="6" width="24" height="24" rx="3"/><rect x="34" y="6" width="24" height="24" rx="3"/><rect x="6" y="34" width="24" height="24" rx="3"/><rect x="34" y="34" width="24" height="24" rx="3"/></svg>'
    + '<b>' + bye + (name ? ', ' + String(name).replace(/[<>&"]/g, '') : '') + '</b><small>Sessiya yopilmoqda…</small>';
  document.body.appendChild(el);
  try { if (client && client.auth && client.auth.signOut) await Promise.race([client.auth.signOut(), new Promise(r => setTimeout(r, 2500))]); } catch (e) {}
  setTimeout(() => location.replace('index.html'), 450);
}

// ═══ v24.7: PORTAL QOBIG'I — admin panel joylashuvi va uslubida (sotuvchi, diller) ═══
// Kompyuterda: chapda yon menyu (logotip, bo'limlar, sozlamalar/chiqish, pastda foydalanuvchi) — admin .sidebar kabi.
// Tepada: «Mening do'konlarim» uslubidagi brend tugmasi (bosilsa — Bosh sahifa), sana/soat, qo'ng'iroq, avatar (profil/sozlamalar).
// Bosh sahifa: salomlashish, davr bo'yicha natija (ox-hero), «Tezkor amallar» (ox-acts) — admin bosh sahifasi bilan bir xil bloklar.
const PT_IC = {
  home: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>',
  orders: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>',
  salary: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>',
  revision: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>',
};
const PT_WD = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
const PT_MO = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
function ptIc(k) { return PT_IC[k] || (document.querySelector('#tab-' + k + ' svg') || {}).outerHTML || ''; }
function ptIni(name) { return String(name || '').trim().split(/\s+/).filter(w => /^\p{L}/u.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '—'; }
// o: { label, items:[[tab, nom]], go:'svSwitchTab', settings:'svOpenSettings', logout:'svLogout', who, role }
function ptShellInit(o) {
  PT_SHELL = o;
  const wrap = document.querySelector('.dl-wrap'); if (!wrap) return;
  let side = document.getElementById('pt-side');
  if (!side) { side = document.createElement('aside'); side.id = 'pt-side'; side.className = 'pt-side'; wrap.prepend(side); wrap.classList.add('pt-has-side'); }
  side.innerHTML = `<div class="pt-side-logo">${fwBrandLockup()}</div>
    <nav class="pt-side-nav" aria-label="Bo'limlar"><div class="pt-side-sec">${esc(o.label)}</div>
      ${o.items.map(([k, l]) => `<button class="pt-side-it" data-tab="${k}" onclick="${o.go}('${k}')"><i>${ptIc(k)}</i><span>${esc(l)}</span></button>`).join('')}
      <div class="pt-side-sec">Hisob</div>
      <button class="pt-side-it" onclick="${o.settings}()"><i>${PT_IC.settings}</i><span>Sozlamalar</span></button>
      <button class="pt-side-it danger" onclick="${o.logout}()"><i>${PT_IC.logout}</i><span>Chiqish</span></button></nav>
    <button class="pt-side-me" onclick="${o.settings}()" aria-label="Profil va sozlamalar"><b>${esc(ptIni(o.who))}</b><span><b>${esc(o.who || '')}</b><small>${esc(o.role || '')}</small></span></button>`;
  document.querySelectorAll('[data-pt-mark]').forEach(e => { e.innerHTML = fwBrandMark(); });
  if (typeof fwApplyBrand === 'function') fwApplyBrand();
  ptClock();
}
let PT_SHELL = null;
function ptSideActive(tab) { document.querySelectorAll('.pt-side-it[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab)); }
function ptClock() {
  const el = document.getElementById('pt-date'); if (!el) return;
  const tick = () => { const d = new Date(); el.innerHTML = `<span>${PT_WD[d.getDay()]}, ${d.getDate()}-${PT_MO[d.getMonth()]}</span><b>${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</b>`; };
  tick(); clearInterval(ptClock._t); ptClock._t = setInterval(tick, 20000);
}
function ptGreetWord() { const h = new Date().getHours(); return h < 5 ? 'Xayrli tun' : h < 11 ? 'Xayrli tong' : h < 17 ? 'Xayrli kun' : h < 22 ? 'Xayrli kech' : 'Xayrli tun'; }
// Bosh sahifa bloklari (admin bilan bir xil klasslar)
function ptWelcome(name, sub) {
  return `<section class="ox-welcome pt-welcome" aria-label="Xush kelibsiz"><div class="ox-welcome-t"><small>${ptGreetWord()}</small><b>${esc(name || '')}</b><span>${esc(sub || '')}</span></div></section>`;
}
function ptActs(items) {   // [[ikonka (tab yoki PT_IC kaliti), rang, nom, onclick, nishon?]]
  return `<h2 class="ox-sec">Tezkor amallar</h2><div class="ox-acts pt-acts">${items.map(([ic, c, l, on, n]) =>
    `<button class="ox-act" style="--c:var(--${c})" onclick="${on}"><span class="ox-act-ic">${ptIc(ic)}</span><span class="ox-act-l">${esc(l)}</span>${n ? `<em class="pt-act-n">${n > 99 ? '99+' : n}</em>` : ''}</button>`).join('')}</div>`;
}
function ptBanner(ic, title, sub, on) {
  return `<button class="ox-banner" onclick="${on}"><span class="ox-banner-ic">${ptIc(ic)}</span><span class="ox-banner-t"><b>${esc(title)}</b><span>${esc(sub)}</span></span><span class="ox-banner-go"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg></span></button>`;
}

// ════════════════════════════════════════════
// v24.9 — NASIYA MUDDATI (egasi qarori): nasiyada muddat (kun) majburiy, standart 10 kun.
// Muddat savdo yozuvida saqlanadi (sale.dueDays / sale.dueDate) — ikki qurilmada bir vaqtda sotilsa ham yo'qolmaydi.
// Mijozning qaysi nasiyasi hali ochiq — FIFO: to'lovlar eng eski nasiyani yopadi, qolgan qarz eng yangi nasiyalarda.
// Muddatsiz eski qarzga mijoz kartasida alohida muddat qo'yish mumkin (c.debtDue).
// Eslatma: ertaga (1 kun oldin), bugun va muddati o'tgan nasiyalar. Xabar: SMS / Telegram / WhatsApp (tayyor matn).
// ════════════════════════════════════════════
const FW_DUE_DEFAULT_DAYS = 10;
function fwLocalDay(d) { d = d || new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function fwDueDaysOk(v) { const n = Number(String(v == null ? '' : v).trim()); return Number.isInteger(n) && n >= 1 && n <= 365 ? n : null; }
function fwDueAdd(day, n) { const [y, m, d] = String(day).slice(0, 10).split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); }
function fwDueDiff(a, b) { const p = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((p(a) - p(b)) / 86400000); }
function fwDueFmt(day) { if (!day) return ''; const [y, m, d] = String(day).slice(0, 10).split('-'); return `${d}.${m}.${y}`; }
// Muddat holati: overdue (o'tgan) / today (bugun) / soon (ertaga) / ok / none (muddatsiz)
function fwDueState(due, today) {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(String(due))) return { st: 'none', days: null };
  const left = fwDueDiff(due, today || fwLocalDay());
  return { st: left < 0 ? 'overdue' : left === 0 ? 'today' : left === 1 ? 'soon' : 'ok', days: left };
}
// Mijozning ochiq nasiyalari: [{ inv, date, due, openUzs, st, days, legacy }]
function fwCustDues(c, sales, today, toUzs) {
  today = today || fwLocalDay();
  toUzs = toUzs || ((usd, s) => Math.round((+usd || 0) * (+(s && s.rateUsdUzs) || (typeof CUR !== 'undefined' ? CUR.usdUzs : 0) || 0)));
  let rem = Math.max(0, Math.round(+(c && c.debt) || 0));
  const out = [];
  if (!c || rem <= 0) return out;
  const list = (sales || []).filter(s => s && s.custId != null && String(s.custId) === String(c.id) && s.status !== 'voided' && (+s.debtUsd || 0) > 0.004)
    .slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (String(b.id) > String(a.id) ? 1 : -1));
  for (const s of list) {
    if (rem <= 0) break;
    const amt = Math.min(rem, Math.max(0, toUzs(s.debtUsd, s)));
    if (amt <= 0) continue;
    rem -= amt;
    const ov = c.dueOv && typeof c.dueOv === 'object' ? c.dueOv[String(s.id)] : null;   // muddat uzaytirilgan (mijoz kartasida)
    const due = (ov && /^\d{4}-\d{2}-\d{2}$/.test(ov)) ? ov : (s.dueDate || null);
    out.push({ inv: s.inv || '', saleId: s.id, date: String(s.date || '').slice(0, 10), due, days0: s.dueDays || null, openUzs: amt, ...fwDueState(due, today) });
  }
  if (rem > 0) out.push({ inv: '', saleId: null, date: null, due: c.debtDue || null, openUzs: rem, legacy: true, ...fwDueState(c.debtDue, today) });
  return out;
}
const FW_DUE_RANK = { overdue: 0, today: 1, soon: 2, ok: 3, none: 4 };
// Mijoz bo'yicha xulosa: eng yomon holat, eng yaqin muddat, muddati o'tgan summa
function fwCustDueSum(c, sales, today, toUzs) {
  const dues = fwCustDues(c, sales, today, toUzs);
  if (!dues.length) return null;
  const withDue = dues.filter(d => d.due).sort((a, b) => a.due.localeCompare(b.due));
  const worst = dues.slice().sort((a, b) => FW_DUE_RANK[a.st] - FW_DUE_RANK[b.st] || (a.days ?? 1e9) - (b.days ?? 1e9))[0];
  const overUzs = dues.filter(d => d.st === 'overdue' || d.st === 'today').reduce((s, d) => s + d.openUzs, 0);
  return { dues, st: worst.st, days: worst.days, due: worst.due || (withDue[0] && withDue[0].due) || null, overUzs, noTermUzs: dues.filter(d => d.st === 'none').reduce((s, d) => s + d.openUzs, 0) };
}
// Eslatmalar ro'yxati (bugun ko'rsatiladiganlar): muddati o'tgan / bugun / ertaga — eng shoshilinchi birinchi
function fwDueReminders(customers, sales, today, toUzs) {
  const out = [];
  (customers || []).forEach(c => {
    if (!((+c.debt || 0) > 0)) return;
    const sm = fwCustDueSum(c, sales, today, toUzs);
    if (!sm) return;
    const hot = sm.dues.filter(d => d.st === 'overdue' || d.st === 'today' || d.st === 'soon');
    if (!hot.length) return;
    const top = hot.slice().sort((a, b) => FW_DUE_RANK[a.st] - FW_DUE_RANK[b.st] || a.days - b.days)[0];
    out.push({ c, st: top.st, days: top.days, due: top.due, amountUzs: hot.reduce((s, d) => s + d.openUzs, 0), debtUzs: Math.round(+c.debt || 0), dues: hot });
  });
  return out.sort((a, b) => FW_DUE_RANK[a.st] - FW_DUE_RANK[b.st] || a.days - b.days || b.amountUzs - a.amountUzs);
}
function fwDueLabel(st, days) {
  if (st === 'overdue') return `Muddati ${-days} kun oʻtgan`;
  if (st === 'today') return 'Muddati bugun';
  if (st === 'soon') return 'Muddati ertaga';
  if (st === 'ok') return `${days} kun qoldi`;
  return 'Muddatsiz';
}
// Telefon → xalqaro raqam (faqat raqamlar): 901234567 → 998901234567
function fwPhoneIntl(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 9) d = '998' + d;
  if (d.length === 10 && d[0] === '8') d = '998' + d.slice(1);
  return d.length >= 11 && d.length <= 15 ? d : '';
}
// Mijozga eslatma matni (do'kon nomi, summa, muddat, telefon)
function fwDueMessage(r, opt) {
  opt = opt || {};
  const brand = opt.brand || (typeof fwBrand === 'function' ? fwBrand().name : '');
  const money = opt.money || ((n) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} soʻm`);
  const due = r.due ? fwDueFmt(r.due) : '';
  const when = r.st === 'overdue' ? `toʻlov muddati ${due} edi (${-r.days} kun oʻtdi)` : r.st === 'today' ? `toʻlov muddati bugun (${due})` : r.st === 'soon' ? `toʻlov muddati ertaga (${due})` : (due ? `toʻlov muddati ${due}` : '');
  return `Assalomu alaykum, ${r.c.name || 'hurmatli mijoz'}!\n${brand ? brand + ' doʻkonidan eslatma: ' : 'Eslatma: '}nasiya boʻyicha qarzingiz ${money(r.debtUzs || r.amountUzs)}${when ? ', ' + when : ''}.\nIltimos, toʻlovni oʻz vaqtida amalga oshiring.${opt.phone ? '\nTel: ' + opt.phone : ''}\nRahmat!`;
}
function fwDueLinks(r, text) {
  const ph = fwPhoneIntl(r.c && r.c.phone), t = encodeURIComponent(text);
  return {
    phone: ph,
    sms: ph ? `sms:+${ph}?&body=${t}` : `sms:?&body=${t}`,
    wa: ph ? `https://wa.me/${ph}?text=${t}` : `https://wa.me/?text=${t}`,
    tg: ph ? `https://t.me/+${ph}` : `https://t.me/share/url?url=%20&text=${t}`,
  };
}
// Savdo yozuviga muddat maydonlari — faqat nasiya bo'lsa (server debtUsd'i bo'yicha; muddat kiritilmagan bo'lsa standart)
function fwSaleDueFields(ctx, debtUsd) {
  if (!((+debtUsd || 0) > 0.004)) return {};
  const n = fwDueDaysOk(ctx && ctx.dueDays) || FW_DUE_DEFAULT_DAYS;
  return { dueDays: n, dueDate: (ctx && /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.dueDate || ''))) ? ctx.dueDate : fwDueAdd(fwLocalDay(), n) };
}

// ── Nasiya eslatmalari — katta panel (bosh sahifa, Mijozlar, sotuvchi qarzlar bo'limi) ──
const FW_DUE_IC = {
  bell: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 22c1.1 0 2-.9 2-2h-4a2 2 0 0 0 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>',
  msg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg>',
  money: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
};
function fwDueMoney(n) { return `${Math.round(+n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} soʻm`; }
// opt: { payFn: 'openPayDebt' | null, allFn: onclick (hammasi), limit, title }
function fwDueBoard(rem, opt) {
  opt = opt || {};
  if (!rem || !rem.length) return '';
  const n = (st) => rem.filter(r => r.st === st).length;
  const no = n('overdue'), nt = n('today'), ns = n('soon');
  const tone = no || nt ? 'red' : 'amber';
  const sum = rem.reduce((s, r) => s + r.amountUzs, 0);
  const lim = opt.limit || 6;
  const row = (r) => {
    const id = JSON.stringify(r.c.id).replace(/"/g, '&quot;');
    return `<div class="fw-due-row st-${r.st}">
      <div class="fw-due-m"><b>${esc(r.c.name || '')}</b><small>${esc(r.c.phone || 'Telefon yoʻq')}${r.due ? ' · Muddat: ' + fwDueFmt(r.due) : ''}</small></div>
      <div class="fw-due-v"><em class="fw-due-badge st-${r.st}">${fwDueLabel(r.st, r.days)}</em><b>${fwDueMoney(r.amountUzs)}</b></div>
      <div class="fw-due-a"><button type="button" class="fw-due-btn msg" onclick="fwDueSend(${id})">${FW_DUE_IC.msg}<span>Xabar</span></button>${opt.payFn ? `<button type="button" class="fw-due-btn pay" onclick="${opt.payFn}(${id})">${FW_DUE_IC.money}<span>Toʻlash</span></button>` : ''}</div>
    </div>`;
  };
  return `<section class="fw-due-board tone-${tone}" aria-label="Nasiya eslatmalari">
    <div class="fw-due-hd"><span class="fw-due-ic">${FW_DUE_IC.bell}<i></i></span>
      <div class="fw-due-ht"><b>${esc(opt.title || 'Nasiya eslatmalari')}</b><span>${[no ? `<em class="st-overdue">${no} ta muddati oʻtgan</em>` : '', nt ? `<em class="st-today">${nt} ta bugun</em>` : '', ns ? `<em class="st-soon">${ns} ta ertaga</em>` : ''].filter(Boolean).join('')}</span></div>
      <div class="fw-due-sum"><small>Undiriladigan</small><b>${fwDueMoney(sum)}</b></div></div>
    <div class="fw-due-list">${rem.slice(0, lim).map(row).join('')}</div>
    ${rem.length > lim && opt.allFn ? `<button type="button" class="fw-due-all" onclick="${opt.allFn}">Hammasini koʻrish (${rem.length})</button>` : ''}
  </section>`;
}
// Mijoz qatoridagi kichik belgi (Mijozlar ro'yxati)
function fwDueChip(sm) {
  if (!sm) return '';
  if (sm.st === 'none') return `<em class="fw-due-badge st-none">Muddatsiz</em>`;
  return `<em class="fw-due-badge st-${sm.st}">${fwDueLabel(sm.st, sm.days)}${sm.due ? ' · ' + fwDueFmt(sm.due) : ''}</em>`;
}
// Xabar yuborish oynasi: matn (tahrirlanadi) + SMS / Telegram / WhatsApp
let _fwDueCtx = null;
function fwDueSend(cid) {
  const rem = (typeof fwDueRemindersNow === 'function') ? fwDueRemindersNow() : [];
  const c = (S.customers || []).find(x => String(x.id) === String(cid));
  if (!c) return;
  const r = rem.find(x => String(x.c.id) === String(cid)) || (() => { const sm = fwCustDueSum(c, S.sales || [], fwLocalDay()); return { c, st: sm ? sm.st : 'none', days: sm ? sm.days : null, due: sm ? sm.due : null, amountUzs: Math.round(+c.debt || 0), debtUzs: Math.round(+c.debt || 0) }; })();
  const text = fwDueMessage(r, { phone: (S.settings && S.settings.shopPhone) || '', money: fwDueMoney });
  _fwDueCtx = { r };
  const ph = fwPhoneIntl(c.phone);
  const ov = document.createElement('div'); ov.className = 'fw-due-ov'; ov.id = 'fw-due-ov';
  ov.innerHTML = `<div class="fw-due-sh" role="dialog" aria-modal="true" aria-label="Mijozga eslatma yuborish">
    <div class="fw-due-sh-hd"><b>Eslatma yuborish</b><button type="button" class="fw-due-x" onclick="fwDueClose()" aria-label="Yopish">${FW_DUE_IC.x}</button></div>
    <div class="fw-due-sh-who"><b>${esc(c.name || '')}</b><small>${ph ? '+' + ph : 'Telefon raqami yoʻq — mijoz kartasiga qoʻshing'}</small><em class="fw-due-badge st-${r.st}">${fwDueLabel(r.st, r.days)}</em></div>
    <label class="fw-due-lbl" for="fw-due-txt">Xabar matni</label>
    <textarea id="fw-due-txt" class="fw-due-txt" rows="7" maxlength="900">${esc(text)}</textarea>
    <div class="fw-due-chs">
      <button type="button" class="fw-due-ch sms" onclick="fwDueGo('sms')"><b>SMS</b><small>Telefon orqali</small></button>
      <button type="button" class="fw-due-ch tg" onclick="fwDueGo('tg')"><b>Telegram</b><small>${ph ? 'Matn nusxalanadi' : 'Kontakt tanlang'}</small></button>
      <button type="button" class="fw-due-ch wa" onclick="fwDueGo('wa')"><b>WhatsApp</b><small>Tayyor matn bilan</small></button>
    </div></div>`;
  ov.addEventListener('click', (e) => { if (e.target === ov) fwDueClose(); });
  document.getElementById('fw-due-ov')?.remove();
  document.body.appendChild(ov);
}
function fwDueClose() { document.getElementById('fw-due-ov')?.remove(); }
async function fwDueGo(ch) {
  if (!_fwDueCtx) return;
  const text = (document.getElementById('fw-due-txt')?.value || '').trim();
  if (!text) return;
  const L = fwDueLinks(_fwDueCtx.r, text);
  if (ch === 'tg' && L.phone) { try { await navigator.clipboard.writeText(text); if (typeof toast === 'function') toast('Matn nusxalandi — Telegram chatiga joylang'); } catch (e) {} }
  const url = ch === 'sms' ? L.sms : ch === 'wa' ? L.wa : L.tg;
  if (typeof auditLog === 'function') auditLog(`Nasiya eslatmasi (${ch === 'sms' ? 'SMS' : ch === 'wa' ? 'WhatsApp' : 'Telegram'}): ${_fwDueCtx.r.c.name || ''}`);
  if (ch === 'sms') location.href = url; else window.open(url, '_blank', 'noopener');
}
// Kuniga bir marta (shu qurilmada) — katta eslatma oynasi
function fwDueDailyPopup(rem, opt) {
  if (!rem || !rem.length || !rem.some(r => r.st === 'overdue' || r.st === 'today' || r.st === 'soon')) return false;
  const key = 'fw_due_pop_' + ((opt && opt.scope) || 'a');
  try { if (localStorage.getItem(key) === fwLocalDay()) return false; localStorage.setItem(key, fwLocalDay()); } catch (e) { return false; }
  const ov = document.createElement('div'); ov.className = 'fw-due-ov'; ov.id = 'fw-due-pop';
  ov.innerHTML = `<div class="fw-due-sh wide" role="dialog" aria-modal="true" aria-label="Nasiya eslatmalari">
    <div class="fw-due-sh-hd"><b>Bugungi eslatma</b><button type="button" class="fw-due-x" onclick="document.getElementById('fw-due-pop')?.remove()" aria-label="Yopish">${FW_DUE_IC.x}</button></div>
    ${fwDueBoard(rem, Object.assign({ limit: 8 }, opt || {}))}</div>`;
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('.fw-due-btn, .fw-due-all')) ov.remove(); });
  document.body.appendChild(ov);
  return true;
}
function fwDueRemindersNow() { return (typeof S !== 'undefined' && S) ? fwDueReminders(S.customers || [], S.sales || [], fwLocalDay()) : []; }

// ════════════════════════════════════════════
// v24.9 — PAROL: ko'rish (3 soniyada o'zi yashirinadi), «Parolni unutdingizmi?» (Telegram kod),
// majburiy almashtirish (admin tiklagandan keyin), Telegram'ni ulash. Server: netlify/functions/pw-reset.js (38-migratsiya).
// ════════════════════════════════════════════
const FW_PW_PEEK_MS = 3000;
function fwPwPeek(idOrEl, btn) {
  const i = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl; if (!i) return;
  clearTimeout(i._fwPeekT);
  const show = i.type === 'password';
  i.type = show ? 'text' : 'password';
  if (btn) btn.classList.toggle('on', show);
  if (show) i._fwPeekT = setTimeout(() => { i.type = 'password'; if (btn) btn.classList.remove('on'); }, FW_PW_PEEK_MS);
}
async function _fwPwApi(body, withAuth) {
  const opt = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const r = withAuth && typeof authFetch === 'function' ? await authFetch('/.netlify/functions/pw-reset', opt) : await fetch('/.netlify/functions/pw-reset', opt);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'Amal bajarilmadi'), { code: d.code, status: r.status });
  return d;
}
function _fwPwOv(id, html, closable) {
  document.getElementById(id)?.remove();
  const ov = document.createElement('div'); ov.className = 'fw-due-ov fw-pw-ov'; ov.id = id;
  ov.innerHTML = `<div class="fw-due-sh fw-pw-sh" role="dialog" aria-modal="true">${html}</div>`;
  if (closable) ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  return ov;
}
const _fwPwEye = (id) => `<button type="button" class="fw-pw-eye" aria-label="Parolni koʻrish (3 soniya)" onclick="fwPwPeek('${id}',this)"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg></button>`;
const _fwPwField = (id, ph, ac) => `<div class="fw-pw-f"><input class="fw-pw-in" id="${id}" type="password" placeholder="${ph}" autocomplete="${ac || 'new-password'}" maxlength="72">${_fwPwEye(id)}</div>`;
function _fwPwCheck(a, b) { if (a.length < 8) return 'Parol kamida 8 belgidan iborat boʻlsin'; if (a.length > 72) return 'Parol 72 belgidan oshmasin'; if (a !== b) return 'Parollar mos emas'; return null; }

// «Parolni unutdingizmi?» — 1) login → kod Telegramga; 2) kod + yangi parol
function fwPwForgot(login) {
  const ov = _fwPwOv('fw-pw-forgot', `
    <div class="fw-due-sh-hd"><b>Parolni tiklash</b><button type="button" class="fw-due-x" onclick="document.getElementById('fw-pw-forgot')?.remove()" aria-label="Yopish">${FW_DUE_IC.x}</button></div>
    <div id="fw-pw-s1">
      <p class="fw-pw-p">Loginingizni kiriting. Hisobingiz Telegramga ulangan boʻlsa, botga <b>6 xonali kod</b> keladi.</p>
      <input class="fw-pw-in" id="fw-pw-login" placeholder="Login" autocomplete="username" maxlength="80" value="${esc(login || '')}">
      <button type="button" class="fw-pw-btn" id="fw-pw-send" onclick="fwPwForgotSend()">Kod yuborish</button>
      <p class="fw-pw-note">Telegram ulanmagan boʻlsa — administratorga murojaat qiling: u vaqtinchalik parol beradi.</p>
    </div>
    <div id="fw-pw-s2" hidden>
      <p class="fw-pw-p" id="fw-pw-msg"></p>
      <input class="fw-pw-in code" id="fw-pw-code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="••••••">
      ${_fwPwField('fw-pw-n1', 'Yangi parol (kamida 8 belgi)')}
      ${_fwPwField('fw-pw-n2', 'Yangi parolni takrorlang')}
      <button type="button" class="fw-pw-btn" id="fw-pw-ok" onclick="fwPwForgotConfirm()">Parolni almashtirish</button>
      <button type="button" class="fw-pw-link" onclick="fwPwForgotSend(true)">Kodni qayta yuborish</button>
    </div>
    <div class="fw-pw-err" id="fw-pw-err" role="alert"></div>`, true);
  setTimeout(() => ov.querySelector(login ? '#fw-pw-send' : '#fw-pw-login')?.focus(), 50);
}
async function fwPwForgotSend(again) {
  const login = (document.getElementById('fw-pw-login')?.value || '').trim(), err = document.getElementById('fw-pw-err'), btn = document.getElementById('fw-pw-send');
  if (!login) { err.textContent = 'Loginni kiriting'; return; }
  err.textContent = ''; if (btn) btn.disabled = true;
  try {
    const d = await _fwPwApi({ action: 'request', login });
    document.getElementById('fw-pw-s1').hidden = true; document.getElementById('fw-pw-s2').hidden = false;
    document.getElementById('fw-pw-msg').textContent = (d.wait && again ? 'Kod yaqinda yuborilgan — 1 daqiqadan keyin qayta soʻrang. ' : '') + (d.message || '');
    document.getElementById('fw-pw-code')?.focus();
  } catch (e) { err.textContent = e.message; }
  finally { if (btn) btn.disabled = false; }
}
async function fwPwForgotConfirm() {
  const v = (id) => document.getElementById(id)?.value || '', err = document.getElementById('fw-pw-err'), btn = document.getElementById('fw-pw-ok');
  const code = v('fw-pw-code').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) { err.textContent = 'Telegramga kelgan 6 xonali kodni kiriting'; return; }
  const bad = _fwPwCheck(v('fw-pw-n1'), v('fw-pw-n2')); if (bad) { err.textContent = bad; return; }
  err.textContent = ''; btn.disabled = true;
  try {
    await _fwPwApi({ action: 'confirm', login: v('fw-pw-login').trim(), code, password: v('fw-pw-n1') });
    const login = v('fw-pw-login').trim();
    document.getElementById('fw-pw-forgot')?.remove();
    if (typeof toast === 'function') toast('✅ Parol almashtirildi — yangi parol bilan kiring');
    for (const id of ['ul-login', 'sv-login-id', 'dl-login-id']) { const i = document.getElementById(id); if (i && !i.value) i.value = login; }
    for (const id of ['ul-pass', 'sv-login-pw', 'dl-login-pw']) { const i = document.getElementById(id); if (i) { i.value = ''; i.focus(); } }
  } catch (e) { err.textContent = e.message; }
  finally { btn.disabled = false; }
}
// Majburiy almashtirish — yopib bo'lmaydi; yangi parol qo'yilgach resolve
function fwPwForce(name) {
  return new Promise((resolve) => {
    _fwPwOv('fw-pw-force', `
      <div class="fw-due-sh-hd"><b>Yangi parol qoʻying</b></div>
      <p class="fw-pw-p">${name ? `<b>${esc(name)}</b>, a` : 'A'}dministrator parolingizni tikladi. Davom etish uchun <b>oʻzingiz yangi parol</b> qoʻying — uni hech kimga aytmang.</p>
      ${_fwPwField('fw-pf-1', 'Yangi parol (kamida 8 belgi)')}
      ${_fwPwField('fw-pf-2', 'Yangi parolni takrorlang')}
      <button type="button" class="fw-pw-btn" id="fw-pf-ok">Saqlash va davom etish</button>
      <div class="fw-pw-err" id="fw-pf-err" role="alert"></div>`, false);
    const ok = document.getElementById('fw-pf-ok');
    ok.onclick = async () => {
      const a = document.getElementById('fw-pf-1').value, b = document.getElementById('fw-pf-2').value, err = document.getElementById('fw-pf-err');
      const bad = _fwPwCheck(a, b); if (bad) { err.textContent = bad; return; }
      ok.disabled = true; err.textContent = '';
      try { await _fwPwApi({ action: 'change', password: a }, true); document.getElementById('fw-pw-force')?.remove(); if (typeof toast === 'function') toast('✅ Yangi parol saqlandi'); resolve(true); }
      catch (e) { err.textContent = e.message; ok.disabled = false; }
    };
    setTimeout(() => document.getElementById('fw-pf-1')?.focus(), 50);
  });
}
// Telegram'ni ulash kartasi (sozlamalarda) — holat serverdan
function fwPwTgCardHtml() { return `<div class="fw-pwtg" id="fw-pwtg"><div class="fw-pwtg-h"><b>Parolni tiklash — Telegram</b><small>Parolni unutsangiz, kod shu Telegramga keladi</small></div><div id="fw-pwtg-b" class="fw-pwtg-b">Yuklanmoqda…</div></div>`; }
async function fwPwTgLoad() {
  const b = document.getElementById('fw-pwtg-b'); if (!b) return;
  try {
    const d = await _fwPwApi({ action: 'status' }, true);
    b.innerHTML = d.linked
      ? `<span class="fw-due-badge st-ok">Ulangan</span> <span class="fw-pwtg-n">${esc(d.tgName || '')}</span><button type="button" class="fw-pw-link" onclick="fwPwTgUnlink()">Uzish</button>`
      : `<span class="fw-due-badge st-none">Ulanmagan</span><button type="button" class="fw-pw-btn sm" onclick="fwPwTgLink()">Telegram'ni ulash</button>`;
  } catch (e) { b.innerHTML = `<span class="fw-pw-note">${esc(e.code === 'MIGRATION38_PENDING' ? 'Hali yoqilmagan (administrator)' : e.message)}</span>`; }
}
async function fwPwTgLink() {
  const b = document.getElementById('fw-pwtg-b');
  try {
    const d = await _fwPwApi({ action: 'tg_link' }, true);
    window.open(d.url, '_blank', 'noopener');
    if (b) b.innerHTML = `<span class="fw-pw-note">Telegram ochildi — botda <b>«Start»</b> (Boshlash) ni bosing, soʻng:</span><button type="button" class="fw-pw-btn sm" onclick="fwPwTgCheck()">Tekshirish</button><a class="fw-pw-link" href="${esc(d.url)}" target="_blank" rel="noopener">Havolani qayta ochish</a>`;
  } catch (e) { if (typeof toast === 'function') toast('⛔ ' + e.message, 'error'); }
}
async function fwPwTgCheck() {
  try {
    const d = await _fwPwApi({ action: 'tg_link_check' }, true);
    if (!d.linked) { if (typeof toast === 'function') toast('Hali «Start» bosilmagan — botda bosing va qayta tekshiring', 'warning'); return; }
    if (typeof toast === 'function') toast('✅ Telegram ulandi'); fwPwTgLoad();
  } catch (e) { if (typeof toast === 'function') toast('⛔ ' + e.message, 'error'); }
}
async function fwPwTgUnlink() {
  if (!confirm('Telegram uzilsinmi? Parolni unutsangiz, faqat administrator tiklay oladi.')) return;
  try { await _fwPwApi({ action: 'tg_unlink' }, true); fwPwTgLoad(); } catch (e) { if (typeof toast === 'function') toast('⛔ ' + e.message, 'error'); }
}
// Server «PW_CHANGE_REQUIRED» qaytarsa (eski ochiq oyna, admin parolni tiklagan) — yangi parol, keyin qayta yuklash
let _fwPwForcing = false;
function fwPwForceOn403(res) {
  if (_fwPwForcing || !res || typeof res.clone !== 'function') return;
  res.clone().json().then(d => {
    if (!d || d.code !== 'PW_CHANGE_REQUIRED' || _fwPwForcing) return;
    _fwPwForcing = true;
    fwPwForce().then(() => location.reload());
  }).catch(() => {});
}
// v24.9 (38): kirish server orqali — noto'g'ri parol sanaladi (5 → 15 daqiqa blok, keyin 3 → 30 daqiqa).
// Javob: { data:{session,user}, error, kind, locked }. Funksiya yo'q (404/eski sayt) — avvalgidek to'g'ridan-to'g'ri Supabase.
async function fwStaffLogin(db, login, password, kind) {
  let r = null;
  try {
    r = await fetch('/.netlify/functions/staff-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, password, kind: kind || 'auto' }) });
  } catch (e) { r = null; }
  const d = r ? await r.json().catch(() => null) : null;
  if (!r || r.status === 404 || (r.ok && !(d && d.session))) {   // funksiya yo'q yoki kutilmagan javob — avvalgi yo'l
    const domains = kind === 'dealer' ? [DEALER_EMAIL_DOMAIN_FW] : kind === 'staff' ? [STAFF_EMAIL_DOMAIN_FW] : [STAFF_EMAIL_DOMAIN_FW, DEALER_EMAIL_DOMAIN_FW];
    let last = null;
    for (const dm of domains) {
      const res = await db.auth.signInWithPassword({ email: String(login).toLowerCase().replace(/\s+/g, '') + '@' + dm, password });
      if (!res.error && res.data && res.data.user) return { data: res.data, kind: dm === STAFF_EMAIL_DOMAIN_FW ? 'staff' : 'dealer', error: null };
      last = res.error;
    }
    return { data: null, error: last || { message: "Login yoki parol notoʻgʻri" } };
  }
  if (!r.ok) return { data: null, error: { message: (d && d.error) || "Login yoki parol notoʻgʻri", status: r.status, code: d && d.code }, locked: r.status === 423 };
  const { data, error } = await db.auth.setSession({ access_token: d.session.access_token, refresh_token: d.session.refresh_token });
  if (error || !data || !data.user) return { data: null, error: error || { message: 'Seans oʻrnatilmadi', status: 500 } };
  return { data, kind: d.kind, error: null };
}
const STAFF_EMAIL_DOMAIN_FW = 'staff.biznespro.local', DEALER_EMAIL_DOMAIN_FW = 'dillers.biznespro.local';

// ════════════════════════════════════════════════════════════
// v25: OFLAYN NAVBAT — internet yo'q paytdagi savdolar qurilmada saqlanadi va internet qaytishi bilan
// avtomatik serverga yuboriladi. Har savdoning o'z idempotency kaliti bor: takror yuborilsa ham server
// bitta savdo yozadi (birinchi natijani qaytaradi). Server rad etsa (qoldiq yetmadi va h.k.) — savdo
// «qabul qilinmadi» bo'lib qoladi va admin ko'radi; hech narsa jimgina yo'qolmaydi.
// ════════════════════════════════════════════════════════════
const FWQ_KEY = 'fw_outbox_v1';
const FWQ = { busy: false, handlers: {}, timer: null };
function fwqList() { try { const a = JSON.parse(localStorage.getItem(FWQ_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
function fwqSave(a) { try { localStorage.setItem(FWQ_KEY, JSON.stringify(a)); } catch (_) { if (typeof toast === 'function') toast('Qurilma xotirasi toʻla — oflayn savdo saqlanmadi', 'error'); } fwqBadge(); }
function fwqPending() { return fwqList().filter(e => e.state === 'pending'); }
function fwqRejected() { return fwqList().filter(e => e.state === 'rejected'); }
// Tarmoq xatosimi (server javobi emas): internet yo'q, DNS, ulanish uzildi
function fwIsNetErr(e) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const m = String((e && (e.message || e)) || '');
  return !!e && (e.name === 'TypeError' || /Failed to fetch|NetworkError|Load failed|network|internet/i.test(m));
}
function fwqAdd(entry) {
  const a = fwqList();
  if (!a.some(x => x.id === entry.id)) a.push(Object.assign({}, entry, { state: 'pending', tries: 0, at: Date.now() }));
  fwqSave(a); fwqSchedule();
}
function _fwqUpdate(id, patch) {
  const a = fwqList(), i = a.findIndex(x => x.id === id); if (i < 0) return;
  if (patch === null) a.splice(i, 1); else a[i] = Object.assign({}, a[i], patch);
  fwqSave(a);
}
async function _fwqSend(e) {
  const res = await authFetch(e.url, { method: 'POST', body: JSON.stringify(e.body) });
  return { res, out: await res.json().catch(() => ({})) };
}
async function fwqFlush() {
  if (FWQ.busy || (typeof navigator !== 'undefined' && navigator.onLine === false) || typeof authFetch !== 'function') return;
  const list = fwqPending(); if (!list.length) return;
  FWQ.busy = true; let sent = 0, rejected = 0;
  try {
    for (const e of list) {
      let r;
      try {
        r = await _fwqSend(e);
        // Zarar tasdig'i: sotuvchi savdoni oflaynda tasdiqlagan — server so'rasa, o'sha kalit bilan tasdiq yuboriladi
        if (!r.res.ok && r.out.code === 'LOSS_ACK_REQUIRED' && !e.body.lossAck) {
          e.body.lossAck = true; _fwqUpdate(e.id, { body: e.body }); r = await _fwqSend(e);
        }
      } catch (err) { break; }                                                    // internet yana yo'q — keyinroq
      const st = r.res.status;
      if (st === 401 || st === 409 && r.out.code !== 'LOSS_ACK_REQUIRED' || st === 429 || st >= 500) { _fwqUpdate(e.id, { tries: (e.tries || 0) + 1, lastError: r.out.error || ('HTTP ' + st) }); break; }
      const h = FWQ.handlers[e.kind] || {};
      if (r.res.ok) { try { h.ok && h.ok(e, r.out); } catch (x) { console.error('oflayn navbat:', x); } _fwqUpdate(e.id, null); sent++; }
      else { try { h.fail && h.fail(e, r.out); } catch (x) { console.error('oflayn navbat:', x); } _fwqUpdate(e.id, { state: 'rejected', error: r.out.error || ('HTTP ' + st) }); rejected++; }
    }
  } finally { FWQ.busy = false; }
  if (typeof toast === 'function') {
    if (sent) toast(`✅ Internet bor — ${sent} ta oflayn savdo serverga yozildi`);
    if (rejected) toast(`⛔ ${rejected} ta oflayn savdo server tomonidan qabul qilinmadi — pastdagi «Oflayn» belgisini bosing`, 'error');
  }
  fwqBadge();
  if (fwqPending().length) fwqSchedule();
}
function fwqSchedule() { clearTimeout(FWQ.timer); FWQ.timer = setTimeout(fwqFlush, 15000); }

// Holat belgisi: «Oflayn» / «N ta savdo yuborilmoqda» / «N ta qabul qilinmadi» — bosilsa ro'yxat
function fwqBadge() {
  if (typeof document === 'undefined' || !document.body) return;
  let b = document.getElementById('fw-net');
  const off = navigator.onLine === false, p = fwqPending().length, r = fwqRejected().length;
  if (!off && !p && !r) { if (b) b.hidden = true; return; }
  if (!b) {
    b = document.createElement('button'); b.id = 'fw-net'; b.type = 'button'; b.className = 'fw-net';
    b.onclick = fwqSheet; document.body.appendChild(b);
  }
  b.hidden = false;
  b.classList.toggle('bad', r > 0); b.classList.toggle('off', off);
  b.textContent = r ? `⛔ ${r} ta savdo qabul qilinmadi` : off ? (p ? `Oflayn · ${p} ta savdo navbatda` : 'Oflayn rejim') : `⏳ ${p} ta savdo yuborilmoqda`;
}
function fwqSheet() {
  const a = fwqList();
  const m = (e) => { const s = e.sale || {}; const n = s.roundedTotalUzs ? fwNum(s.roundedTotalUzs) + ' soʻm' : (typeof CUR !== 'undefined' ? CUR.fmtUsd(+s.totalUsd || 0) : ''); return `${esc(s.inv || '')} · ${n}${s.custName && s.custName !== 'Anonim' ? ' · ' + esc(s.custName) : ''}`; };
  const html = `<div class="modal-header"><div class="modal-title">Oflayn savdolar</div><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <p class="fw-net-p">${navigator.onLine === false ? 'Internet yoʻq. Savdo qilishda davom etavering — internet qaytishi bilan savdolar avtomatik serverga yuboriladi.' : 'Internet bor. Navbatdagi savdolar serverga yuborilmoqda.'}</p>
      ${a.length ? a.map(e => `<div class="fw-net-r ${e.state}"><div><b>${m(e)}</b><small>${new Date(e.at).toLocaleString('uz-UZ')}${e.state === 'rejected' ? ' · ' + esc(e.error || '') : e.lastError ? ' · ' + esc(e.lastError) : ''}</small></div>
          <span>${e.state === 'rejected' ? `<button class="btn btn-sm" onclick="fwqRetry('${escJsAttr(e.id)}')">Qayta</button> <button class="btn btn-sm btn-danger" onclick="fwqDrop('${escJsAttr(e.id)}')">Oʻchirish</button>` : 'Navbatda'}</span></div>`).join('')
        : '<p class="fw-net-p">Navbat boʻsh — hamma savdolar serverda.</p>'}
      ${fwqPending().length && navigator.onLine !== false ? '<button class="btn btn-primary" style="width:100%;margin-top:12px" onclick="fwqFlush().then(()=>{closeModal();fwqSheet()})">Hozir yuborish</button>' : ''}
    </div>`;
  if (typeof modal === 'function') modal(html);
}
function fwqRetry(id) { _fwqUpdate(id, { state: 'pending', error: null }); if (typeof closeModal === 'function') closeModal(); fwqFlush(); }
function fwqDrop(id) {
  if (!confirm('Bu savdo serverga yozilmaydi va roʻyxatdan oʻchiriladi. Tasdiqlaysizmi?')) return;
  _fwqUpdate(id, null); if (typeof closeModal === 'function') closeModal(); fwqBadge();
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (!fwqPending().length && typeof toast === 'function') toast('Internet qaytdi');
    fwqBadge(); Promise.resolve(fwqFlush()).then(() => { if (typeof FWQ.onOnline === 'function') FWQ.onOnline(); }); });
  window.addEventListener('offline', () => { fwqBadge(); if (typeof toast === 'function') toast("Internet yoʻq — oflayn ishlayapsiz, savdolar qurilmada saqlanadi", 'warning'); });
  window.addEventListener('load', () => { fwqBadge(); setTimeout(fwqFlush, 4000); });
  // PWA — oflayn ochilish (admin, sotuvchi va diller sahifalari)
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
}

// v25: OFLAYN KIRISH — shu qurilmada oxirgi marta internet bilan muvaffaqiyatli kirgan xodim internet yo'qligida
// o'sha login va parol bilan kira oladi. Parolning o'zi saqlanmaydi: PBKDF2 (SHA-256, 150 000 marta, tasodifiy tuz) xeshi.
// Server bilan bog'liq amallar (savdo) oflayn navbatga tushadi; internet qaytganda sessiya tokeni yangilanadi va
// server har so'rovni odatdagidek tekshiradi — oflayn kirish serverdagi ruxsatlarni chetlab o'tmaydi.
const FW_OFF_AUTH = 'fw_off_auth_v1';
async function _fwPbkdf2(pass, saltB64) {
  const enc = new TextEncoder();
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150000 }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
async function fwOffAuthSave(login, pass, info) {
  try {
    if (!(window.crypto && crypto.subtle)) return;
    const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    const hash = await _fwPbkdf2(pass, salt);
    localStorage.setItem(FW_OFF_AUTH, JSON.stringify({ login: String(login).toLowerCase(), salt, hash, info, t: Date.now() }));
  } catch (_) {}
}
async function fwOffAuthCheck(login, pass) {
  try {
    const r = JSON.parse(localStorage.getItem(FW_OFF_AUTH) || 'null');
    if (!r || r.login !== String(login).toLowerCase() || !(window.crypto && crypto.subtle)) return null;
    if (Date.now() - (r.t || 0) > 30 * 86400000) return null;   // 30 kundan eski — internet bilan qayta kirish kerak
    return (await _fwPbkdf2(pass, r.salt)) === r.hash ? (r.info || {}) : null;
  } catch (_) { return null; }
}
function fwOffAuthClear() { try { localStorage.removeItem(FW_OFF_AUTH); } catch (_) {} }
// Ilova qayta ochilganda: navbatdagi (serverga hali yetmagan) savdolar ro'yxatda qolsin
function fwqMergePending(sales, branch) {
  if (!Array.isArray(sales)) return sales;
  const have = new Set(sales.map(x => String(x && x.id)));
  fwqPending().forEach(e => { if (e.kind === 'sale' && e.branch === branch && e.sale && !have.has(String(e.sale.id))) sales.push(Object.assign({}, e.sale, { pending: true })); });
  return sales;
}

// v25: TENG TAQSIMOT — tugma/karta to'plamlarida oxirgi qator yarim bo'sh qolmaydi (egasi talabi: «1 chiziq teng bo'linadi»).
// Ustunlar soni c, elementlar n, oxirgi qatorda r = n % c ta qolsa: setka c×r ustunga bo'linadi, oddiy element r ustun,
// oxirgi qatordagilar c ustun egallaydi — har bir qator to'liq va bir qatordagilar teng kenglikda. Mahsulot kartalari
// (katalog) bunga kirmaydi. Ekran o'lchami o'zgarganda (media so'rovlar) qayta hisoblanadi.
const FW_BAL_SEL = '.ox-acts,.fk-tiles,.ks-acts,.ks-grid,.ox-kpis,.kh-kpis,.dk-kpis,.fws-kpis,.sx-tiles,.sv-quick-g,.pt-grid,.pts-grid,.ox-biz-g,.ox-dl-g,.sh-shop-g,.sh-sum-g,.ox-hero-g,.fw-acts';
function fwBalanceGrid(g) {
  const kids = [...g.children].filter(k => !k.hidden && k.style.display !== 'none' && getComputedStyle(k).position !== 'absolute');
  if (g.dataset.fwBal) { g.style.gridTemplateColumns = ''; kids.forEach(k => { k.style.gridColumn = ''; }); delete g.dataset.fwBal; }
  const cs = getComputedStyle(g);
  if (cs.display !== 'grid') return;
  const tpl = cs.gridTemplateColumns.split(' ').filter(Boolean);
  const c = tpl.length, n = kids.length;
  if (c < 2 || n < 2 || n % c === 0 || n < c) return;
  // faqat teng ustunli setkalar (auto/aralash ustunlarga tegilmaydi)
  const w0 = parseFloat(tpl[0]); if (!tpl.every(w => Math.abs(parseFloat(w) - w0) < 1)) return;
  const r = n % c, last = n - r;
  g.style.gridTemplateColumns = `repeat(${c * r},minmax(0,1fr))`;
  kids.forEach((k, i) => { k.style.gridColumn = `span ${i >= last ? c : r}`; });
  g.dataset.fwBal = '1';
}
let _fwBalT = 0;
function fwBalanceGrids(root) {
  try { (root || document).querySelectorAll(FW_BAL_SEL).forEach(fwBalanceGrid); } catch (_) {}
}
function _fwBalSoon() { cancelAnimationFrame(_fwBalT); _fwBalT = requestAnimationFrame(() => fwBalanceGrids()); }
if (typeof window !== 'undefined' && typeof MutationObserver !== 'undefined') {
  window.addEventListener('load', () => {
    fwBalanceGrids();
    new MutationObserver(muts => { if (muts.some(m => m.addedNodes.length)) _fwBalSoon(); }).observe(document.body, { childList: true, subtree: true });
  });
  window.addEventListener('resize', _fwBalSoon);
}

// ════════════════════════════════════════════════════════════
// v25: TEZ KIRISH — PIN (4 xonali) yoki barmoq izi. Birinchi marta login + parol bilan kiriladi, keyin shu qurilmada
// PIN / barmoq izi bilan. PIN telefonda faqat PBKDF2 xesh. 5 marta noto'g'ri — tez kirish o'chadi, login + parol so'raladi.
// Server sessiyasi (token) o'zgarmaydi: server har so'rovni avvalgidek tekshiradi (bloklangan xodim PIN bilan ham ishlay olmaydi).
// Barmoq izi — faqat ilovada (APK): Android tomonda window.FwBio (available / authenticate(callbackName)) bo'lsa.
// Ilova 5 daqiqadan ko'p fonda tursa — qaytganda PIN so'raladi.
// ════════════════════════════════════════════════════════════
const FWQK = 'fw_quick_v1', FW_QUICK_MAX_FAILS = 5, FW_QUICK_IDLE_MS = 5 * 60 * 1000;
function fwQuickGet() { try { const r = JSON.parse(localStorage.getItem(FWQK) || 'null'); return r && r.hash && r.salt ? r : null; } catch (_) { return null; } }
function fwQuickClear() { try { localStorage.removeItem(FWQK); } catch (_) {} }
async function fwQuickSet(pin, info, bio) {
  const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  localStorage.setItem(FWQK, JSON.stringify({ salt, hash: await _fwPbkdf2(String(pin), salt), info: info || {}, uid: info && info.uid || null, bio: !!bio, fails: 0, t: Date.now() }));
}
// PIN to'g'ri bo'lsa — info; noto'g'ri — null; 5-xatoda tez kirish o'chiriladi ({ locked: true })
async function fwQuickCheck(pin) {
  const r = fwQuickGet(); if (!r) return { locked: true };
  if ((await _fwPbkdf2(String(pin), r.salt)) === r.hash) { r.fails = 0; r.t = Date.now(); localStorage.setItem(FWQK, JSON.stringify(r)); return r.info || {}; }
  r.fails = (r.fails || 0) + 1;
  if (r.fails >= FW_QUICK_MAX_FAILS) { fwQuickClear(); return { locked: true }; }
  localStorage.setItem(FWQK, JSON.stringify(r)); return null;
}
// Barmoq izi belgisi: on — yoqilgan (avtomatik so'raladi); asked — taklif qilingan (qayta so'ralmaydi)
function fwQuickBioMark(on, asked) {
  try { const r = fwQuickGet(); if (!r) return; if (on) r.bio = true; if (asked) r.bioAsked = true; localStorage.setItem(FWQK, JSON.stringify(r)); } catch (_) {}
}
// v25 (46): MUSTAQIL filialning o'z narxi — settings.branchCfg[k] = { type:'mustaqil', own:{ r, o, max } } (server ham shunday hisoblaydi)
function fwBranchOwn(k) {
  try {
    const c = S.settings && S.settings.branchCfg && S.settings.branchCfg[k];
    if (!c || c.type !== 'mustaqil' || !c.own) return null;
    const v = (x, hi) => (x === '' || x == null || !Number.isFinite(+x) || +x < 0 || +x > hi) ? null : +x;
    const o = { r: v(c.own.r, 1000), o: v(c.own.o, 1000), max: v(c.own.max, 100) };
    return o.r == null && o.o == null && o.max == null ? null : o;
  } catch (_) { return null; }
}
function fwBioAvail() { try { return !!(window.FwBio && typeof FwBio.available === 'function' && FwBio.available()); } catch (_) { return false; } }
function fwBioAuth() {
  return new Promise(res => {
    if (!fwBioAvail()) return res(false);
    const cb = '__fwBio' + Date.now(); let done = false;
    window[cb] = (ok) => { if (done) return; done = true; delete window[cb]; res(ok === true || ok === 'true' || ok === 1); };
    try { FwBio.authenticate(cb); } catch (_) { done = true; delete window[cb]; res(false); }
    setTimeout(() => { if (!done) { done = true; delete window[cb]; res(false); } }, 60000);
  });
}
// To'liq ekran raqam klaviaturasi. Natija: '1234' (PIN), 'bio' (barmoq izi tasdiqlandi), null (login bilan kirish / keyinroq)
function fwPinPad(o) {
  o = o || {};
  return new Promise(resolve => {
    document.getElementById('fw-pin-ov')?.remove();
    const ov = document.createElement('div'); ov.id = 'fw-pin-ov'; ov.className = 'fw-pin-ov fw-brand-bg'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    let pin = '';
    const finish = (v) => { ov.remove(); resolve(v); };
    const paint = (err) => {
      ov.innerHTML = `<div class="fw-pin-card">
        <b class="fw-pin-t">${esc(o.title || 'PIN kiriting')}</b>
        <small class="fw-pin-s">${esc(o.sub || '')}</small>
        <div class="fw-pin-dots" aria-label="${pin.length} ta raqam kiritildi">${[0, 1, 2, 3].map(i => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('')}</div>
        <div class="fw-pin-err" role="alert">${esc(err || '')}</div>
        <div class="fw-pin-keys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', o.bio ? 'bio' : '', '0', 'del'].map(k =>
          k === '' ? '<span></span>' : k === 'bio' ? `<button type="button" data-k="bio" aria-label="Barmoq izi bilan">☝</button>` : k === 'del' ? `<button type="button" data-k="del" aria-label="Oʻchirish">⌫</button>` : `<button type="button" data-k="${k}">${k}</button>`).join('')}</div>
        ${o.alt ? `<button type="button" class="fw-pin-alt" data-k="alt">${esc(o.alt)}</button>` : ''}
      </div>`;
    };
    ov.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-k]'); if (!b) return;
      const k = b.dataset.k;
      if (k === 'alt') return finish(null);
      if (k === 'bio') { if (await fwBioAuth()) return finish('bio'); return paint('Barmoq izi tasdiqlanmadi — PIN kiriting'); }
      if (k === 'del') { pin = pin.slice(0, -1); return paint(); }
      if (pin.length < 4) pin += k;
      paint();
      if (pin.length === 4) {
        const v = pin; pin = '';
        const err = o.check ? await o.check(v) : null;
        if (err) return paint(err);
        finish(v);
      }
    });
    ov.addEventListener('keydown', (e) => { if (/^\d$/.test(e.key)) ov.querySelector(`button[data-k="${e.key}"]`)?.click(); else if (e.key === 'Backspace') ov.querySelector('button[data-k="del"]')?.click(); });
    paint(); document.body.appendChild(ov); ov.tabIndex = -1; ov.focus();
    if (o.bio && o.autoBio) fwBioAuth().then(ok => { if (ok && document.body.contains(ov)) finish('bio'); });
  });
}
// To'liq login muvaffaqiyatli bo'lgach: PIN o'rnatishni taklif qilish (shu foydalanuvchi uchun allaqachon bo'lsa — so'ralmaydi)
async function fwQuickSetupOffer(info) {
  try {
    const cur = fwQuickGet(); if (cur && cur.uid && info && cur.uid === info.uid) return;
    if (!(window.crypto && crypto.subtle)) return;
    let first = null;
    const pin = await fwPinPad({ title: 'Tez kirish uchun PIN', sub: 'Keyingi safar login va parol oʻrniga shu 4 xonali PIN bilan kirasiz', alt: 'Keyinroq',
      check: async (v) => { if (first == null) { first = v; return 'Shu PINni yana bir marta kiriting'; } if (v !== first) { first = null; return 'PIN mos kelmadi — qaytadan kiriting'; } return null; } });
    if (!pin) return;
    let bio = false;
    if (fwBioAvail()) bio = (await fwPinPad({ title: 'Barmoq izi', sub: 'Barmoq izi bilan kirishni yoqish uchun ☝ tugmasini bosing', bio: true, alt: 'Yoʻq, faqat PIN', check: async () => 'Bu yerda ☝ tugmasini bosing' })) === 'bio';
    await fwQuickSet(pin, info, bio);
    if (typeof toast === 'function') toast(bio ? '✅ Tez kirish yoqildi — PIN yoki barmoq izi' : '✅ Tez kirish yoqildi — PIN');
  } catch (_) {}
}
// Ilova ochilganda: tez kirish. info — kirish ma'lumoti, null — login va parol bilan kirish kerak
async function fwQuickUnlock(sessionUid) {
  const r = fwQuickGet(); if (!r) return null;
  if (sessionUid && r.uid && sessionUid !== r.uid) { fwQuickClear(); return null; }
  let info = null;
  // v25: barmoq izi tugmasi — ilovada (APK) barmoq izi bo'lsa DOIM (PIN eski ilovada o'rnatilgan bo'lsa ham); avtomatik — yoqilgan bo'lsa
  const bioOn = fwBioAvail();
  const v = await fwPinPad({ title: 'Xush kelibsiz', sub: (r.info && (r.info.name || (r.info.staff && r.info.staff.name))) || 'PIN kiriting', bio: bioOn, autoBio: bioOn && !!r.bio, alt: 'Login va parol bilan kirish',
    check: async (p) => { const x = await fwQuickCheck(p); if (x && x.locked) { info = null; return null; } if (!x) { const left = FW_QUICK_MAX_FAILS - ((fwQuickGet() || {}).fails || 0); return `PIN notoʻgʻri — yana ${left} ta urinish`; } info = x; return null; } });
  if (v === 'bio') { fwQuickBioMark(true); return r.info || {}; }
  if (v && info) {
    // PIN bilan kirdi, barmoq izi mavjud, lekin hali yoqilmagan — bir marta taklif qilinadi
    const q = fwQuickGet();
    if (bioOn && q && !q.bio && !q.bioAsked) {
      fwQuickBioMark(false, true);
      const ok = (await fwPinPad({ title: 'Barmoq izi', sub: 'Keyingi safar barmoq izi bilan kirish uchun ☝ tugmasini bosing', bio: true, alt: 'Yoʻq, faqat PIN', check: async () => 'Bu yerda ☝ tugmasini bosing' })) === 'bio';
      if (ok) { fwQuickBioMark(true); if (typeof toast === 'function') toast('✅ Barmoq izi bilan kirish yoqildi'); }
    }
    return info;
  }
  if (v && !fwQuickGet()) { if (typeof toast === 'function') toast('PIN 5 marta notoʻgʻri — login va parol bilan kiring', 'error'); }
  return null;
}
// Fonda 5 daqiqadan ko'p turgan ilova — qaytganda PIN (sahifa qayta yuklanmaydi, ish joyida qoladi)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
    try {
      if (document.hidden) { sessionStorage.setItem('fw_hid_at', String(Date.now())); return; }
      const at = +sessionStorage.getItem('fw_hid_at') || 0; sessionStorage.removeItem('fw_hid_at');
      const r = fwQuickGet();
      if (!r || !at || Date.now() - at < FW_QUICK_IDLE_MS || document.getElementById('fw-pin-ov') || document.getElementById('ul-login')) return;
      const info = await fwQuickUnlock(null);
      if (!info) { ['bp_auth_ok', 'bp_branch_ok', 'bp_staff_id', 'fw_fast_staff'].forEach(k => sessionStorage.removeItem(k)); location.replace('index.html'); }
    } catch (_) {}
  });
}
