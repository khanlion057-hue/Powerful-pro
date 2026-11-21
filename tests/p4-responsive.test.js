// P4 — Qurilmaga moslashuvchan ko'rinish (2026-09-30) uchun REGRESSIYA testlari.
// Muammo (foydalanuvchi): "kompyuterda kirsangiz kompyuter versiyasi, telefonda
// telefon versiyasi o'tishi kerak edi — chalkashliklar bor".
// Topilgan sabablar va shu testlar qo'riqlaydigan tuzatishlar:
//  1) Admin: `.sidebar.collapsed ~ .main-content{margin-left:68px}` telefon
//     qoidasidan kuchli edi → telefon/planshetda kontent 68px o'ngga surilardi.
//  2) Admin: telefonda hamburger + pastki menyu "Ko'proq" — ikki xil navigatsiya.
//  3) Admin: telefonda yuqori panel 🛒/📊 tugmalari pastki menyuni takrorlab,
//     sarlavhani kesardi.
//  4) Sotuvchi/Diller portallari kompyuterda ham 480px'lik telefon ustuni edi.
//
// HAQIQIY index.html / sotuvchi.html / diller.html + haqiqiy CSS/JS yuklanadi.
// Tashqi tarmoq (CDN, Supabase) to'liq bloklanadi; Supabase klienti soxta,
// Netlify Function javoblari mock — hech qanday haqiqiy bazaga murojaat yo'q.
const assert = require('node:assert/strict');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const MIME = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };

let _srv, _port;
function server() {
  if (_srv) return Promise.resolve(_port);
  return new Promise((resolve) => {
    _srv = http.createServer((req, res) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(f, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    _srv.unref();
    _srv.listen(0, '127.0.0.1', () => { _port = _srv.address().port; resolve(_port); });
  });
}

const today = new Date().toISOString().slice(0, 10);
const LONG = ['Bosch GSB 13 RE zarbali drel 600W', 'Makita HR2470 perforator 780W SDS-plus', 'DeWalt DCD791 akkumulyatorli shurupovyort 18V'];
const products = LONG.map((name, i) => ({ id: 100 + i, sku: 'PG-' + (1001 + i), name, cat: 'Asbob', unit: 'dona', minStock: 5, maxStock: 100, markupPct: 25, optMarkupPct: 15 }));
const batches = products.map((p, i) => ({ id: 'b' + i, pid: p.id, qty: 40, sold: 0, costUsd: 20 + i, date: today, status: 'active' }));
const BP_DATA = { products, settings: {}, branchStore: { baza: { batches, customers: [], sales: [], suppliers: [], expenses: [] } } };
const DEALER = { id: 1, auth_user_id: 'u1', name: 'Diller Test', filial: 'baza', debt: 0, points: 10 };
const DEALER_TABLES = { dealers: DEALER, dealer_stock: products.map((p, i) => ({ id: i + 1, dealer_id: 1, name: p.name, sku: p.sku, qty: 5, price: 30 })), dealer_sales: [], catalog_products: [], dealer_orders: [] };

// Soxta Supabase klienti — sahifa skriptlaridan OLDIN o'rnatiladi. CDN'dagi haqiqiy
// SDK bloklanadi (bo'sh javob + SRI mos kelmaydi → bajarilmaydi), shuning uchun shu stub qoladi.
function supabaseStub({ loggedIn, tables }) {
  return `
    (function(){
      const TABLES = ${JSON.stringify(tables || {})};
      const session = ${loggedIn ? "{ access_token:'t', user:{ id:'u1' } }" : 'null'};
      function q(table){
        const st = { single:false };
        const res = () => { const d = TABLES[table]; if (st.single) return { data: Array.isArray(d) ? (d[0]||null) : (d||null), error:null };
          return { data: Array.isArray(d) ? d : (d ? [d] : []), error:null }; };
        const c = new Proxy({}, { get(_, prop){
          if (prop === 'then') return (ok, bad) => Promise.resolve(res()).then(ok, bad);
          if (prop === 'maybeSingle' || prop === 'single') return () => { st.single = true; return Promise.resolve(res()); };
          return () => c; } });
        return c;
      }
      const client = {
        auth: {
          getSession: async () => ({ data: { session }, error: null }),
          getUser: async () => ({ data: { user: session ? session.user : null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
          signInWithPassword: async () => ({ data: null, error: { message: 'stub' } }),
          signOut: async () => ({ error: null }),
        },
        from: q, storage: { from: () => q('') }, rpc: async () => ({ data: null, error: null }),
        channel: () => ({ on: () => ({ subscribe: () => {} }) }),
      };
      Object.defineProperty(window, 'supabase', { value: { createClient: () => client }, writable: false, configurable: true });
    })();`;
}

async function openPage(file, { width, height, mobile, admin, loggedIn, tables, scale = '100' }) {
  const port = await server();
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (require('fs').existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), // CI'da — Playwright'ning o'z Chromium'i
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: !!mobile, hasTouch: !!mobile, serviceWorkers: 'block' });   // v25: SW — P71 da alohida
  // v23.5: ilovaning standart matn o'lchami 90% (html zoom). Joylashuv o'lchamlari (px) shu testlarda
  // 100% da tekshiriladi; 90% standart holati — alohida test (pastda, scale: null).
  if (scale) await ctx.addInitScript((v) => { try { localStorage.setItem('fw_text_scale', v); } catch (e) {} }, scale);
  if (admin) {
    await ctx.addInitScript(({ data, today }) => {
      sessionStorage.setItem('bp_auth_ok', '1'); sessionStorage.setItem('bp_branch_ok', 'baza');
      localStorage.setItem('bp_data', JSON.stringify(data));
      localStorage.setItem('bp_cur', JSON.stringify({ usdUzs: 12650, usdCny: 7.1, lastRateDate: today }));
      localStorage.removeItem('bp_sidebar_collapsed'); // standart holat = YIG'ILGAN (xato aynan shu holatda chiqardi)
    }, { data: BP_DATA, today });
  }
  await ctx.addInitScript({ content: supabaseStub({ loggedIn, tables }) });
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.includes('/.netlify/functions/app-data-load')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: BP_DATA }) });
    if (u.includes('/.netlify/functions/staff-whoami')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ staff: { id: 7, name: 'Sotuvchi Test', filial: 'baza', active: true, role: 'sotuvchi' } }) });
    if (u.includes('/.netlify/functions/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (u.startsWith(`http://127.0.0.1:${port}/`)) return route.continue();
    if (u.includes('cdn.jsdelivr.net')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    return route.abort('failed');
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/${file}`);
  await page.waitForTimeout(1800);
  return { browser, page, errors };
}

// Admin sahifasining responsive holatini o'lchaydi
function measureAdmin(page) {
  return page.evaluate(() => {
    const vis = (el) => { if (!el) return false; const s = getComputedStyle(el), r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth; };
    const main = document.querySelector('.main-content');
    const title = document.querySelector('.topbar-title span');
    const topbar = document.querySelector('.topbar');
    return {
      mainLeft: Math.round(main.getBoundingClientRect().left),
      sidebarCollapsed: document.querySelector('.sidebar').classList.contains('collapsed'),
      sidebarVisible: vis(document.querySelector('.sidebar')),
      hamburger: vis(document.querySelector('.hamburger')),
      bottomNav: vis(document.getElementById('mobileBottomNav')),
      pageHScroll: document.documentElement.scrollWidth > innerWidth + 1,
      titleCut: title ? title.scrollWidth > title.clientWidth + 1 : null,
      topbarRight: Math.round(topbar.getBoundingClientRect().right),
      topbarActionsOverflow: (() => { const a = document.querySelector('.topbar-actions'); return a.scrollWidth > a.clientWidth + 1; })(),
      innerW: innerWidth,
    };
  });
}

async function testAdminPhone() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const m = await measureAdmin(page);
    assert.equal(m.sidebarCollapsed, true, "Sinov yig'ilgan menyu holatida bo'lishi kerak (xato aynan shunda chiqardi)");
    assert.equal(m.mainLeft, 0, `Telefonda kontent chapdan 0px'da boshlanishi kerak (kompyuterning 68px menyu cheti qolmasin), hozir: ${m.mainLeft}px`);
    assert.equal(m.bottomNav, true, "Telefonda pastki menyu ko'rinishi kerak");
    assert.equal(m.hamburger, false, "Telefonda hamburger yashirin bo'lishi kerak — navigatsiya faqat pastki menyuda");
    assert.equal(m.sidebarVisible, false, "Telefonda yon menyu yopiq holatda ko'rinmasligi kerak");
    assert.equal(m.pageHScroll, false, 'Telefonda sahifa gorizontal surilmasligi kerak');
    assert.equal(m.titleCut, false, 'Telefonda sahifa sarlavhasi ("Bosh sahifa") kesilmasligi kerak');
    assert.equal(m.topbarActionsOverflow, false, "Telefonda yuqori panel tugmalari sig'ishi kerak (yashirin skroll yo'q)");
    assert.deepEqual(errors, [], 'Konsolda JS xatolari bo\'lmasligi kerak');
  } finally { await browser.close(); }
}

async function testAdminTablet() {
  const { browser, page } = await openPage('index.html', { width: 768, height: 1024, mobile: true, admin: true });
  try {
    const m = await measureAdmin(page);
    assert.equal(m.mainLeft, 0, `Planshetda (768px) kontent chapdan 0px'da boshlanishi kerak, hozir: ${m.mainLeft}px`);
    assert.equal(m.bottomNav, true);
    assert.equal(m.hamburger, false);
    assert.equal(m.pageHScroll, false);
  } finally { await browser.close(); }
}

async function testAdminDesktop() {
  const { browser, page } = await openPage('index.html', { width: 1440, height: 900, admin: true });
  try {
    const m = await measureAdmin(page);
    assert.equal(m.sidebarVisible, true, "Kompyuterda yon menyu ko'rinishi kerak");
    assert.equal(m.bottomNav, false, "Kompyuterda telefon pastki menyusi ko'rinmasligi kerak");
    assert.equal(m.mainLeft, 68, "Kompyuterda yig'ilgan menyu uchun kontent 68px o'ngda bo'lishi kerak");
    assert.equal(m.pageHScroll, false);
  } finally { await browser.close(); }
}

// v24.2 (egasi talabi 2026-10-14): telefonda «Ko'proq» (yon menyu) o'rniga — barcha bo'limlar bosh sahifadagi
// «Tezkor amallar»da; pastki menyuning 5-tugmasi — «Audit» (Biznes holati); har bo'lim to'liq ekranda, ✕ → bosh sahifa.
async function testAdminPhoneShell() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const vis = (sel) => page.evaluate((q) => { const e = document.querySelector(q); if (!e) return false; const r = e.getBoundingClientRect(), st = getComputedStyle(e); return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0; }, sel);
    const home = await page.evaluate(() => ({ page: S.page, labels: [...document.querySelectorAll('#mobileBottomNav .m-bn-l')].map(e => e.textContent),
      acts: [...document.querySelectorAll('#pg-dashboard .ox-acts-all .ox-act-l')].map(e => e.textContent), theme: document.querySelector('.topbar [onclick="toggleTheme()"]') }));
    assert.equal(home.page, 'dashboard');
    assert.deepEqual(home.labels, ['Kirim', 'Mahsulotlar', 'Savdo', 'Stat', 'Audit'], "pastki menyu: Ko'proq o'rnida Audit");
    // Tezkor amallar — faqat boshqa joyda yo'q bo'limlar (takror yo'q): pastki menyu, profil, Dillerlar bloki, ko'rsatkichlar bilan kesishmaydi
    // v24.6 (egasi talabi): Hamkorlar (investorlar) va Xarajatlar — v23 dagidek Tezkor amallarda ham
    for (const l of ['Qaytarishlar', 'Kassalar', 'Mijozlar', 'Taʼminotchi', 'Dillerlar', 'Filiallar', 'Ombor', 'Xodimlar', 'Hamkorlar', 'Xarajatlar']) assert.ok(home.acts.includes(l), `Tezkor amallarda «${l}»`);   // v24.7: kengaytirilgan
    assert.ok(!home.acts.includes('Taʼminot ⇄'), 'v25: B2B (Taʼminot ⇄) olib tashlandi');
    for (const l of ['Savdo', 'Mahsulotlar', 'Kirim', 'Statistika', 'Sozlamalar', 'Rollar']) assert.ok(!home.acts.includes(l), `«${l}» takrorlanmaydi (boshqa joyda bor)`);
    assert.equal(new Set(home.acts).size, home.acts.length, 'bir xil tugma ikki marta yoʻq');
    assert.ok(home.acts.length <= 12, 'koʻpi bilan 12 ta (3 qator)');
    assert.equal(home.theme, null, "yuqori panelda kun/tun tugmasi yo'q");
    assert.equal(await vis('#fw-shop-sw'), true, "«Mening do'konlarim» ko'rinadi");
    assert.equal(await vis('#fw-ava'), true, 'profil tugmasi'); assert.equal(await vis('#topbar-bell'), true, '🔔');
    assert.equal(await vis('.topbar-actions [data-icf="swap"]'), false, "ayirboshlash — profil ichida"); assert.equal(await vis('.fw-x'), false);
    // Savdo — to'liq ekran: pastki menyu va 🔔 yo'q, faqat nomi va ✕
    // v24.5 (egasi talabi): o'rtadagi QR tugma — Savdo oynasini ochadi (kamera avtomatik ochilmaydi)
    await page.click('#mobileBottomNav [data-page="savdo"]'); await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => S.page), 'savdo', 'QR tugmasi — Savdo oynasi');
    assert.equal(await vis('#fw-scan-ov'), false, 'kamera oynani yopmaydi');
    assert.equal(await vis('#pos-mount'), true, 'Savdo oynasi ko\'rinadi');
    assert.equal(await vis('#mobileBottomNav'), false, "savdoda pastki menyu yo'q"); assert.equal(await vis('.fw-x'), true, '✕ bor');
    assert.equal(await vis('#topbar-bell'), false); assert.equal(await vis('#fw-shop-sw'), false);
    await page.click('.fw-x'); await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => S.page), 'dashboard', '✕ — bosh sahifaga'); assert.equal(await vis('#mobileBottomNav'), true);
    // Audit — Biznes holati; profil — Jurnal, Kun yakuni, Sozlamalar
    await page.click('#mobileBottomNav .m-bn-item:last-child'); await page.waitForTimeout(300);
    assert.match(await page.evaluate(() => document.getElementById('bs-ov').textContent), /Audit · Biznes holati/);
    await page.evaluate(() => { closeSheet(); shellProfile(); }); await page.waitForTimeout(200);
    const prof = await page.evaluate(() => document.getElementById('bs-ov').textContent);
    for (const l of ['Jurnal', 'Ayirboshlash', 'Kun yakuni', 'Sozlamalar', 'Rollar va ruxsatlar', 'Chiqish']) assert.ok(prof.includes(l), `profilda «${l}»`);
    // olib tashlangan tugmalar boshqa joydan ochiladi: Xarajatlar — ko'rsatkich, Hamkorlar — Audit
    assert.equal(await page.evaluate(() => !!document.querySelector('#pg-dashboard .ox-kpi[onclick="dashSheet(\'exp\')"]')), true, 'Xarajatlar — koʻrsatkichdan');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "gorizontal siljish yo'q");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function testSotuvchiPortalPhoneAndDesktop() {
  // Telefon: bir ustun, tablar teng 3 ustunda
  let o = await openPage('sotuvchi.html', { width: 390, height: 844, mobile: true, loggedIn: true });
  try {
    const m = await o.page.evaluate(() => { const w = document.querySelector('#sv-app'); const t = document.querySelector('.tabs');
      return { shown: getComputedStyle(w).display !== 'none', wrapW: Math.round(w.getBoundingClientRect().width),
        tabCols: getComputedStyle(t).gridTemplateColumns.split(' ').length, hs: document.documentElement.scrollWidth > innerWidth + 1 }; });
    assert.equal(m.shown, true, "Sotuvchi ilovasi ochilishi kerak (login'dan keyin)");
    assert.equal(m.wrapW, 390, 'Telefonda portal butun ekran kengligida');
    assert.equal(m.tabCols, 3, "Telefonda 6 ta tab teng 3 ustunda (5+1 'yetim' qatorsiz)");
    assert.equal(m.hs, false);
    assert.deepEqual(o.errors, []);
  } finally { await o.browser.close(); }

  // Kompyuter: keng joylashuv, savdo ekranida savat o'ng ustunda
  o = await openPage('sotuvchi.html', { width: 1440, height: 900, loggedIn: true });
  try {
    await o.page.evaluate(() => { svSwitchTab('sale'); posAdd(100); });   // v24.5: umumiy savdo oynasi (js/pos.js); v24.7: Bosh sahifadan Savdoga
    await o.page.waitForTimeout(300);
    const m = await o.page.evaluate(() => { const w = document.querySelector('#sv-app');
      const main = document.querySelector('#sv-pos .pos-list').getBoundingClientRect(), side = document.querySelector('#sv-pos .pos-side').getBoundingClientRect();
      return { wrapW: Math.round(w.getBoundingClientRect().width), sideRightOfMain: side.left >= main.right, sameTop: Math.abs(side.top - main.top) < 2,
        cartLen: CART.length, hs: document.documentElement.scrollWidth > innerWidth + 1 }; });
    assert.ok(m.wrapW >= 1100, `Kompyuterda portal keng bo'lishi kerak (≥1100px), hozir: ${m.wrapW}px — avval 480px telefon ustuni edi`);
    assert.equal(m.cartLen, 1, "Mahsulot savatga qo'shilishi kerak (savdo mantig'i o'zgarmagan)");
    assert.equal(m.sideRightOfMain && m.sameTop, true, "Kompyuterda savat+to'lov o'ng ustunda, qidiruv bilan bir balandlikda bo'lishi kerak");
    assert.equal(m.hs, false);
  } finally { await o.browser.close(); }
}

async function testDillerPortalDesktop() {
  const o = await openPage('diller.html', { width: 1440, height: 900, loggedIn: true, tables: DEALER_TABLES });
  try {
    const m = await o.page.evaluate(() => { const w = document.querySelector('.dl-wrap:not([style*="none"])') || document.querySelector('.dl-wrap');
      const stats = [...document.querySelectorAll('#dl-summary > .dl-stat')].map(s => Math.round(s.getBoundingClientRect().top));
      return { wrapW: Math.round(w.getBoundingClientRect().width), statRows: new Set(stats).size, statCount: stats.length }; });
    assert.ok(m.wrapW >= 1100, `Diller portali kompyuterda keng bo'lishi kerak, hozir: ${m.wrapW}px`);
    assert.ok(m.statCount >= 4, 'Diller ko\'rsatkichlari chiqishi kerak');
    assert.equal(m.statRows, 1, "Kompyuterda diller ko'rsatkichlari bir qatorda bo'lishi kerak");
    assert.deepEqual(o.errors, []);
  } finally { await o.browser.close(); }
}

// ── P6 (2026-10-01): "telefon va planshetda bir xil, kompyuterda o'zgacha" ──
// Planshet (portret 820px va landshaft 1024px) telefon bilan bir xil mobil maketda;
// ≥1025px — kompyuter maketi.
async function testAdminTabletLandscapeIsMobileLayout() {
  for (const [w, h] of [[1024, 768], [820, 1180]]) {
    const { browser, page, errors } = await openPage('index.html', { width: w, height: h, mobile: true, admin: true });
    try {
      const m = await measureAdmin(page);
      const pc = await page.evaluate(() => { const r = document.querySelector('.page-content').getBoundingClientRect(); return { w: Math.round(r.width), l: Math.round(r.left) }; });
      assert.equal(m.bottomNav, true, `Planshetda (${w}px) pastki menyu bo'lishi kerak — telefon bilan bir xil`);
      assert.equal(m.sidebarVisible, false, `Planshetda (${w}px) yon menyu yopiq bo'lishi kerak`);
      assert.equal(m.hamburger, false);
      assert.equal(m.mainLeft, 0, `Planshetda (${w}px) kontent chetdan boshlanadi`);
      assert.equal(m.pageHScroll, false);
      // v24.6 (egasi talabi): planshetda kontent tor ustunga siqilmaydi — butun ekranni egallaydi
      assert.ok(pc.w >= w - 48, `Planshetda kontent ekran kengligini egallaydi, hozir ${pc.w}px / ${w}px`);
      assert.ok(pc.l <= 24, `Planshetda kontent chetdan boshlanadi, hozir chapdan ${pc.l}px`);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
}
async function testAdminDesktopFrom1025() {
  const { browser, page } = await openPage('index.html', { width: 1280, height: 800, admin: true });
  try {
    const m = await measureAdmin(page);
    assert.equal(m.sidebarVisible, true, "1280px — kompyuter: yon menyu ko'rinadi");
    assert.equal(m.bottomNav, false, "1280px — kompyuter: pastki menyu yo'q");
    assert.equal(m.pageHScroll, false);
  } finally { await browser.close(); }
}
async function testPortalsTabletSameAsPhone() {   // v24.7: kompyuterda yuqori tablar o'rniga yon menyu
  for (const [file, tables] of [['sotuvchi.html', null], ['diller.html', DEALER_TABLES]]) {
    let o = await openPage(file, { width: 1024, height: 768, mobile: true, loggedIn: true, tables });
    try {
      const r = await o.page.evaluate(() => ({ bn: getComputedStyle(document.querySelector('.pt-bottomnav')).display, tabs: getComputedStyle(document.querySelector('.dl-wrap .tabs')).display,
        wrapW: Math.round(document.querySelector('.dl-wrap').getBoundingClientRect().width), hs: document.documentElement.scrollWidth > innerWidth + 1 }));
      assert.notEqual(r.bn, 'none', `${file}: planshetda (1024px) pastki menyu`);
      assert.equal(r.tabs, 'none', `${file}: planshetda yuqori tablar yashirin (telefon kabi)`);
      assert.ok(r.wrapW >= 1024 - 48, `${file}: planshetda portal butun ekranni egallaydi, hozir ${r.wrapW}`);   // v24.6
      assert.equal(r.hs, false);
      assert.deepEqual(o.errors, []);
    } finally { await o.browser.close(); }
    o = await openPage(file, { width: 1280, height: 800, loggedIn: true, tables });
    try {
      const r = await o.page.evaluate(() => ({ bn: getComputedStyle(document.querySelector('.pt-bottomnav')).display, side: getComputedStyle(document.querySelector('.pt-side')).display,
        items: [...document.querySelectorAll('.pt-side-it[data-tab]')].length, hs: document.documentElement.scrollWidth > innerWidth + 1 }));
      assert.equal(r.bn, 'none', `${file}: kompyuterda (1280px) pastki menyu yo'q`);
      assert.notEqual(r.side, 'none', `${file}: kompyuterda admin panel kabi yon menyu (v24.7)`);
      assert.ok(r.items >= 6, `${file}: yon menyuda barcha bo'limlar`); assert.equal(r.hs, false);
    } finally { await o.browser.close(); }
  }
}

// v23.5: standart matn o'lchami — 90% (foydalanuvchi o'zi tanlamagan bo'lsa). Telefonda gorizontal
// siljish yo'q, kichik oyna (modal) ekranga to'liq sig'adi, sarlavha va tugmalar ko'rinadi.
async function testDefaultTextScale90() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true, scale: null });
  try {
    const r = await page.evaluate(() => ({ zoom: document.documentElement.style.zoom, sc: getTextScale(), opts: FW_TEXT_SCALES.join(','),
      hs: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }));
    assert.equal(r.sc, 90, 'standart o\'lcham 90%');
    assert.equal(r.zoom, '0.9', 'html zoom 0.9 qo\'llangan');
    assert.equal(r.opts, '80,90,100,110,120,130');
    assert.equal(r.hs, false, '90% da gorizontal siljish yo\'q');
    await page.evaluate(() => { go('mijozlar'); S.customers.push({ id: 777001, name: 'Test Mijoz', phone: '', debt: 500000 }); openPayDebt(777001); });
    await page.waitForTimeout(350);
    const m = await page.evaluate(() => { const box = document.querySelector('#modal-ov .modal').getBoundingClientRect();
      const h = document.querySelector('#modal-ov .modal-header').getBoundingClientRect(), f = document.querySelector('#modal-ov .modal-footer').getBoundingClientRect();
      return { l: box.left, r: box.right, b: box.bottom, t: box.top, hT: h.top, fB: f.bottom, W: innerWidth, H: innerHeight,
        ic: !!document.querySelector('#modal-ov .modal-title .mh-ic'), pg: document.getElementById('modal-ov').dataset.pg }; });
    assert.ok(m.l >= -1 && m.r <= m.W + 1, `modal kenglikka sig'adi (${m.l}–${m.r} / ${m.W})`);
    assert.ok(m.t >= 0 && m.b <= m.H + 1, `modal balandlikka sig'adi (${m.t}–${m.b} / ${m.H})`);
    assert.ok(m.hT >= m.t - 1 && m.fB <= m.H + 1, 'sarlavha va tugmalar ekranda');
    assert.equal(m.ic, true, 'sarlavhada rangli ikonka');
    assert.equal(m.pg, 'mijozlar', 'oyna bo\'lim rangini oladi');
    // Foydalanuvchi tanlovi saqlanadi va qayta tiklanadi
    await page.evaluate(() => setTextScale(100));
    assert.equal(await page.evaluate(() => document.documentElement.style.zoom), '');
    await page.evaluate(() => setTextScale(77));   // ruxsat etilmagan qiymat → 90%
    assert.equal(await page.evaluate(() => getTextScale()), 90);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
  for (const [file, tables] of [['sotuvchi.html', null], ['diller.html', DEALER_TABLES]]) {
    const o = await openPage(file, { width: 390, height: 844, mobile: true, loggedIn: true, tables, scale: null });
    try {
      const r = await o.page.evaluate(() => ({ zoom: document.documentElement.style.zoom, hs: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }));
      assert.equal(r.zoom, '0.9', `${file}: standart 90%`);
      assert.equal(r.hs, false, `${file}: gorizontal siljish yo'q`);
      assert.deepEqual(o.errors, []);
    } finally { await o.browser.close(); }
  }
}

module.exports = {
  // Boshqa test fayllari (p6) shu sahifa ochuvchidan foydalanadi
  _helpers: { openPage, DEALER_TABLES, BP_DATA, supabaseStub },
  name: 'P4 — Qurilmaga moslashuvchan ko\'rinish (kompyuter / planshet / telefon)',
  cases: [
    { name: "Planshet (1024×768 va 820×1180) — telefon bilan bir xil mobil maket, kontent butun ekranda", run: testAdminTabletLandscapeIsMobileLayout },
    { name: 'Kompyuter maketi 1025px dan (1280px: yon menyu, pastki menyu yo\'q)', run: testAdminDesktopFrom1025 },
    { name: "Portallar: planshetda telefon maketi (pastki menyu), kompyuterda yon menyu (admin kabi)", run: testPortalsTabletSameAsPhone },
    { name: "Admin, telefon 390px: 68px menyu cheti yo'q, faqat pastki menyu, sarlavha kesilmagan", run: testAdminPhone },
    { name: 'Admin, planshet 768px: kontent chetdan boshlanadi, pastki menyu', run: testAdminTablet },
    { name: 'Admin, kompyuter 1440px: yon menyu bor, telefon menyusi yo\'q', run: testAdminDesktop },
    { name: "Admin, telefon: bosh sahifa — do'konlar, 🔔, profil; bo'lim to'liq ekranda ✕ bilan; Ko'proq o'rnida Audit", run: testAdminPhoneShell },
    { name: "Sotuvchi portali: telefonda bir ustun (tablar 3+3), kompyuterda keng kassa ko'rinishi", run: testSotuvchiPortalPhoneAndDesktop },
    { name: "Diller portali: kompyuterda keng, ko'rsatkichlar bir qatorda", run: testDillerPortalDesktop },
    { name: "v23.5: standart matn o'lchami 90% — telefonda siljish yo'q, oyna ekranga sig'adi, tanlov saqlanadi", run: testDefaultTextScale90 },
  ],
};
