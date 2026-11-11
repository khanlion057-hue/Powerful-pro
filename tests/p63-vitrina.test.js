// P63 — v24.7: zamonaviy vitrina (marketplace uslubi): bo'limlar, saralash, sevimlilar, mahsulot sahifasi, savat → sinov buyurtmasi; XSS.
const assert = require('node:assert/strict');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const MIME = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.svg': 'image/svg+xml' };

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
const ROLES=[{id:'r1',key:'owner',name:'Korxona egasi'},{id:'r2',key:'administrator',name:'Administrator'},{id:'r3',key:'cashier',name:'Kassir'},{id:'r4',key:'employee',name:'Sotuvchi'},{id:'r5',key:'warehouse_manager',name:'Omborchi'},{id:'r6',key:'accountant',name:'Buxgalter'},{id:'r7',key:'dealer',name:'Diller'}];
async function openPage(file,{width,height,mobile,admin,staff,loggedIn,tables,perms}){
  const port=await server();
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width,height},isMobile:!!mobile,hasTouch:!!mobile});
  await ctx.addInitScript((v)=>{try{localStorage.setItem('fw_text_scale',v)}catch(e){}},'100');
  if(admin) await ctx.addInitScript(({data,today,staff})=>{sessionStorage.setItem('bp_auth_ok','1');sessionStorage.setItem('bp_branch_ok','baza');if(staff)sessionStorage.setItem('bp_staff_id','7');localStorage.setItem('bp_data',JSON.stringify(data));localStorage.setItem('bp_cur',JSON.stringify({usdUzs:12650,usdCny:7.1,lastRateDate:today}));},{data:BP_DATA,today,staff});
  await ctx.addInitScript({content:supabaseStub({loggedIn,tables})});
  await ctx.route('**/*',(route)=>{const u=route.request().url();
    if(u.includes('app-data-load'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:BP_DATA})});
    if(u.includes('rbac-user-permissions'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({name:'Dilnoza Karimova',roles:[{key:'cashier',name:'Kassir'}],permKeys:perms||[]})});
    if(u.includes('rbac-catalog'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({roles:ROLES,permissions:[],rolePermissions:[]})});
    if(u.includes('staff-whoami'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({staff:{id:7,name:'Sotuvchi Test',filial:'baza',active:true,role:'sotuvchi'}})});
    if(u.includes('/.netlify/functions/'))return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    if(u.startsWith('http://127.0.0.1:'+port+'/'))return route.continue();
    if(u.includes('cdn.jsdelivr.net'))return route.fulfill({status:200,contentType:'application/javascript',body:''});
    return route.abort('failed');});
  const page=await ctx.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:'+port+'/'+file); await page.waitForTimeout(1800); return {browser,page,errors};
}
const SEED = () => {
  const t = new Date().toISOString().slice(0, 10);
  [['Kafel kesgich', 'Kesgichlar', 4], ['Shpatel <img src=x onerror=alert(1)>', 'Shpatellar', 9], ['Krestik', 'Krestiklar', 1]].forEach(([n, c, cost], i) => {
    const id = 300 + i; S.products.push({ id, sku: 'V-' + i, name: n, cat: c, unit: 'dona', minStock: 3, markupPct: 30, optMarkupPct: 15 });
    S.batches.push({ id: 'vb' + i, pid: id, qty: 20, sold: 0, costUsd: cost, date: '2026-10-0' + (i + 1), status: 'active' }); });
  for (let k = 0; k < 6; k++) S.sales.push({ id: 'vs' + k, date: t, status: 'ok', totalUsd: 10, items: [{ pid: 302, qty: 3, sellUsd: 2, lineUsd: 6 }] });
  const sh = shopData(); sh.settings.enabled = true; sh.discounts.push({ pid: 300, priceUsd: 4.5 });
};
async function testStorefront() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    await page.evaluate(SEED);
    const r = await page.evaluate(() => {
      go('dokon'); dkOpenStorefront();
      const secs = [...document.querySelectorAll('.sf-sec-h h3')].map(h => h.textContent.trim());
      const xss = !!document.querySelector('.sf-main img[src="x"]');
      SF.sort = 'cheap'; sfRender(); const cheapFirst = document.querySelector('#sf-grid .sf-name').textContent;
      sfFavToggle(301); const favN = SF.fav.length; sfGo('fav'); const favCards = document.querySelectorAll('#sf-grid .sf-card').length;
      sfGo('product', { pid: 300 }); const pd = document.querySelector('.sf-pd-info').innerText;
      sfAdd(300, 2); sfGo('cart'); SF.name = 'Ali'; SF.phone = '+998901234567'; sfOrder();
      const o = shopData().orders[0];
      return { secs, xss, cheapFirst, favN, favCards, pd, view: SF.view, order: o && { test: o.test, qty: o.items[0].qty, src: o.source }, tabs: document.querySelectorAll('.sf-tabs button').length };
    });
    assert.ok(r.secs.includes('Chegirmalar') && r.secs.includes('Ommabop') && r.secs.includes('Yangi kelganlar'), r.secs.join(','));
    assert.equal(r.xss, false, "mahsulot nomidagi HTML bajarilmaydi");
    assert.equal(r.cheapFirst, 'Krestik', 'Arzonroq — eng arzoni birinchi');
    assert.equal(r.favN, 1); assert.equal(r.favCards, 1, 'Sevimlilar — faqat belgilanganlar');
    assert.match(r.pd, /Kafel kesgich/); assert.match(r.pd, /Tejaysiz/, 'chegirmada tejash summasi');
    assert.deepEqual(r.order, { test: true, qty: 2, src: 'site' }, 'oldindan koʻrishdagi buyurtma — «Sinov»');
    assert.equal(r.view, 'done'); assert.equal(r.tabs, 5, 'telefonda pastki menyu: 5 boʻlim');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
function testCatImgServer() {
  const { normalizeIncomingShop } = require(path.join(ROOT, 'netlify/functions/_lib/appDataGuard.js'));
  const out = normalizeIncomingShop({}, { settings: { name: 'X', catImg: { Kesgichlar: 'https://cdn.example/a.jpg', Yomon: 'javascript:alert(1)', Rasm: 'http://x/y.jpg', [ 'k'.repeat(90) ]: 'https://cdn.example/b.jpg', Q: 'https://x/"onerror=1' } }, orders: [], reviews: [] });
  assert.deepEqual(out.settings.catImg, { Kesgichlar: 'https://cdn.example/a.jpg' }, "faqat https, xavfsiz belgilar, nomi ≤80");
  assert.equal(out.settings.name, 'X', "boshqa sozlamalar o'zgarmaydi");
  const keep = normalizeIncomingShop({}, { settings: { name: 'Y' } });
  assert.equal(keep.settings.catImg, undefined, "catImg yuborilmasa — tegilmaydi");
}
async function testCatImgClient() {
  const { browser, page, errors } = await openPage('index.html', { width: 1280, height: 800, admin: true });
  try {
    await page.evaluate(SEED);
    const r = await page.evaluate(() => {
      shopData().settings.catImg = { Kesgichlar: 'https://cdn.example/k.jpg', Krestiklar: 'javascript:alert(1)' };
      go('dokon'); dkCatImgSheet(); const sheet = document.querySelector('.bs-box').innerText; closeSheet();
      dkOpenStorefront();
      const chip = [...document.querySelectorAll('.sf-cats button')].find(b => /Kesgichlar/.test(b.textContent));
      const bad = [...document.querySelectorAll('.sf-cats button')].find(b => /Krestiklar/.test(b.textContent));
      const fb = document.querySelector('.sf-card .sf-img img.sf-catfb');
      sfGo('cats'); const catImg = [...document.querySelectorAll('.sf-catgrid img')].map(i => i.getAttribute('src'));
      return { sheet, chipImg: chip && chip.querySelector('img') && chip.querySelector('img').getAttribute('src'), badImg: !!(bad && bad.querySelector('img')), fb: fb && fb.getAttribute('src'), catImg };
    });
    assert.match(r.sheet, /Kategoriya rasmlari/); assert.match(r.sheet, /Kesgichlar/); assert.match(r.sheet, /Almashtirish/);
    assert.equal(r.chipImg, 'https://cdn.example/k.jpg', 'kategoriya doirasida yuklangan rasm');
    assert.equal(r.badImg, false, "https bo'lmagan havola ko'rsatilmaydi (ikonka qoladi)");
    assert.equal(r.fb, 'https://cdn.example/k.jpg', "rasmi yo'q mahsulotda — kategoriya rasmi");
    assert.ok(r.catImg.includes('https://cdn.example/k.jpg'));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
module.exports = { name: 'P63 — zamonaviy vitrina (v24.7)', cases: [
  { name: "bo'limlar, saralash, sevimlilar, mahsulot sahifasi, savat → sinov buyurtmasi; XSS yo'q", run: testStorefront },
  { name: "kategoriya rasmlari: server faqat https saqlaydi; vitrina doira, katalog va rasmsiz mahsulotda ko'rsatadi", run: testCatImgServer },
  { name: "kategoriya rasmlari oynasi va vitrinada ko'rinishi", run: testCatImgClient },
] };
