// P62 — v24.7: rolga mos menyular, xodim qo'shishda rol, botlar xaritasi, portal sozlamalari, chiqish oqimi.
// Kassir (cheklangan xodim) moliyaviy ko'rsatkichlarni (foyda, sof foyda, Audit) ko'rmasligi, tepa/pastki menyuda
// ruxsatsiz tugmalar yashirilishi va «dealer» roli boshqaruv paneliga olib kirmasligi tekshiriladi.
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
const CASHIER = ['dashboard.view', 'kassalar.view', 'kassalar.transact', 'mijozlar.debt_payment', 'savdo.view', 'savdo.create'];

async function testCashier() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true, staff: true, perms: CASHIER });
  try {
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const vis = (sel) => [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null).length;
      const dash = document.getElementById('pg-dashboard').innerText;
      return {
        welcome: !!document.querySelector('.ox-welcome'), sof: /Sof foyda/.test(dash), foyda: /\bFoyda\b/.test(dash),
        audit: vis('.m-bn-item[data-perm="hisobot.view"]'), bnKirim: vis('.m-bn-item[data-page="kirim"]'), bnSavdo: vis('.m-bn-item[data-page="savdo"]'),
        hisobotBtn: vis('.topbar [data-perm="hisobot.view"]'), setBtn: vis('.topbar [data-perm="sozlamalar.view"]'),
        kpis: [...document.querySelectorAll('.ox-kpi-l')].map(e => e.textContent),
      };
    });
    assert.equal(r.welcome, true, 'xodim bosh sahifasida salomlashish kartasi');
    assert.equal(r.sof, false, "kassirga «Sof foyda» ko'rinmasin");
    assert.equal(r.foyda, false, "kassirga «Foyda» ko'rinmasin");
    assert.equal(r.audit, 0, "pastki menyudagi «Audit» (biznes holati) — hisobot huquqisiz yashirin");
    assert.equal(r.bnKirim, 0, 'Kirim tugmasi yashirin'); assert.equal(r.bnSavdo, 1, 'Savdo tugmasi bor');
    assert.equal(r.hisobotBtn, 0); assert.equal(r.setBtn, 0);
    assert.deepEqual(r.kpis, ['Qarzlar', 'Tushumlar'], "faqat ruxsat berilgan ko'rsatkichlar");
    const blocked = await page.evaluate(() => { document.getElementById('toasts').innerHTML = ''; dashBizSheet(); return !document.querySelector('.bs-ov:not([hidden]) .bs-box'); });
    assert.equal(blocked, true, "dashBizSheet() to'g'ridan-to'g'ri chaqirilsa ham ochilmaydi");
    const prof = await page.evaluate(() => { shellProfile(); return document.querySelector('.bs-box').innerText; });
    assert.ok(/Jurnal/.test(prof) && /Ayirboshlash/.test(prof), 'kassirda jurnal (savdo.view) va ayirboshlash (kassalar.transact) bor');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function testOwner() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const r = await page.evaluate(() => ({ welcome: !!document.querySelector('.ox-welcome'), sof: /Sof foyda/.test(document.getElementById('pg-dashboard').innerText),
      audit: [...document.querySelectorAll('.m-bn-item[data-perm="hisobot.view"]')].filter(e => e.offsetParent !== null).length }));
    assert.deepEqual(r, { welcome: false, sof: true, audit: 1 }, "egasi hamma narsani ko'radi");
    const bots = await page.evaluate(() => { go('sozlamalar'); const set = document.getElementById('pg-sozlamalar').innerText; stBotsSheet(); return { set, b: document.querySelector('.bs-box').innerText }; });
    assert.match(bots.set, /Botlar va avtomatik vazifalar/);
    for (const w of ['Asosiy bot', 'Kunlik hisobot', 'Kunlik zaxira', 'Investor hisobotlari', 'Doʻkon boti']) assert.ok(bots.b.includes(w), w);
    assert.ok(!/[0-9]{8,}:[A-Za-z0-9_-]{30,}/.test(bots.b), 'token chiqmaydi');
    await page.evaluate(() => { closeSheet(); go('sotuvchilar'); return openAddStaff(); });
    await page.waitForTimeout(300);
    const opts = await page.evaluate(() => [...document.querySelectorAll('#ns-rbac ~ .me-opts .me-opt b')].map(e => e.textContent));
    assert.ok(opts.includes('Sotuvchi') && opts.includes('Kassir') && opts.includes('Administrator'), opts.join(','));
    assert.ok(!opts.includes('Diller') && !opts.includes('Korxona egasi'), "diller/egasi roli xodim formasida yo'q");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function testRestrictedSettings() {
  const { browser, page, errors } = await openPage('index.html', { width: 1280, height: 800, admin: true, staff: true, perms: [...CASHIER, 'sozlamalar.view'] });
  try {
    const t = await page.evaluate(() => { go('sozlamalar'); return document.getElementById('pg-sozlamalar').innerText; });
    assert.ok(!/Filiallar|Telegram bot|Zaxira nusxa olish|Zaxiradan tiklash/.test(t), "faqat egasi: filiallar, Telegram, zaxira");
    assert.match(t, /Valyuta kursi/, "ko'rish uchun qoladi");
    const ro = await page.evaluate(() => [...document.querySelectorAll('#pg-sozlamalar .st-row')].filter(e => /Valyuta kursi/.test(e.textContent)).map(e => e.tagName)[0]);
    assert.equal(ro, 'DIV', "sozlamalar.edit yo'q — qator bosilmaydi (faqat ko'rish)");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function testPortalsAndLogout() {
  let r = await openPage('sotuvchi.html', { width: 390, height: 844, mobile: true, loggedIn: true });
  try {
    const h = await r.page.evaluate(() => ({ tab: ACTIVE_TAB, acts: document.querySelectorAll('#sv-content .pt-acts .ox-act').length, hero: !!document.querySelector('#sv-content .ox-hero'),
      brand: document.querySelector('.pt-brand small').textContent }));
    assert.deepEqual(h, { tab: 'home', acts: 8, hero: true, brand: 'Sotuvchi oynasi' }, 'admin kabi: Bosh sahifa, natija, 8 ta tezkor amal');
    const t = await r.page.evaluate(() => { svOpenSettings(); return document.getElementById('pts-ov').innerText; });
    assert.match(t, /BUGUN/i); assert.match(t, /SHU OY/i);
    assert.deepEqual(r.errors, []);
  } finally { await r.browser.close(); }
  r = await openPage('diller.html', { width: 390, height: 844, mobile: true, loggedIn: true, tables: DEALER_TABLES });
  try {
    const h = await r.page.evaluate(() => ({ tab: ACTIVE_TAB, acts: document.querySelectorAll('#dl-content .pt-acts .ox-act').length, debt: /Qarzim/.test(document.getElementById('dl-content').innerText) }));
    assert.deepEqual(h, { tab: 'home', acts: 8, debt: true });
    const t = await r.page.evaluate(() => { dlOpenSettings(); return document.getElementById('pts-ov').innerText; });
    assert.match(t, /QARZIM/i); assert.match(t, /OMBORIM/i);
    const lbl = await r.page.evaluate(() => { ME.filial = 'f12'; return dlFilialLabel(); });
    assert.equal(lbl, '12-filial', "boshqa filial «Baza» deb ko'rsatilmaydi");
    await r.page.evaluate(() => { ptSettingsClose(); sessionStorage.setItem('fw_fast_staff', 'x'); fwLogoutFlow(null, 'Diller'); });
    await r.page.waitForTimeout(150);
    const bye = await r.page.evaluate(() => ({ el: !!document.querySelector('.fw-bye'), fast: sessionStorage.getItem('fw_fast_staff') }));
    assert.deepEqual(bye, { el: true, fast: null }, "chiqishda xayrlashuv ekrani, tez-kirish keshi o'chadi");
    await r.page.waitForURL(/index\.html$/, { timeout: 4000 });
  } finally { await r.browser.close(); }
}

function testRouting() {
  const src = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
  assert.match(src, /roleKeys\.every\(k=>k==='employee'\|\|k==='dealer'\)/, "faqat «dealer»/«employee» roli — boshqaruv paneliga emas");
}

module.exports = {
  name: 'P62 — rolga mos menyular va oynalar (v24.7)',
  cases: [
    { name: "kassir: foyda/sof foyda/Audit yo'q, ruxsatsiz tugmalar yashirin, faqat ruxsatli ko'rsatkichlar", run: testCashier },
    { name: "egasi: hammasi; botlar xaritasi (tokensiz); xodim qo'shishda rol tanlash (diller/egasisiz)", run: testOwner },
    { name: "sozlamalar.edit'siz xodim: faqat ko'rish, filial/Telegram/zaxira yashirin", run: testRestrictedSettings },
    { name: "portallar: admin kabi Bosh sahifa; sotuvchi/diller sozlamalarida o'z natijasi; filial nomi; chiqish oqimi → index.html", run: testPortalsAndLogout },
    { name: "login: «dealer» roli boshqaruv paneliga olib kirmaydi", run: testRouting },
  ],
};
