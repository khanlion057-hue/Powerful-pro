// P64 — v24.7: qarzga chegirma (ta'minotchi/mijoz), B2B: omborsiz sotish bog'lanishi, hisob-kitob oynasi, ruxsatlar.
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
    if(u.includes('stock-debt-ops')){ let b={}; try{ b=JSON.parse(route.request().postData()||'{}'); }catch(e){} return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,debt:(b.payload||{}).debt})}); }
    if(u.includes('/.netlify/functions/'))return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    if(u.startsWith('http://127.0.0.1:'+port+'/'))return route.continue();
    if(u.includes('cdn.jsdelivr.net'))return route.fulfill({status:200,contentType:'application/javascript',body:''});
    return route.abort('failed');});
  const page=await ctx.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:'+port+'/'+file); await page.waitForTimeout(1800); return {browser,page,errors};
}
async function testDiscounts() {
  const { browser, page, errors } = await openPage('index.html', { width: 1280, height: 800, admin: true });
  try {
    const r = await page.evaluate(async () => {
      S.suppliers.push({ id: 901, name: 'Kafel Plus', debt: 100, paid: 0 }); S.customers.push({ id: 902, name: 'Ali aka', debt: 500000 });
      openDebtDiscount('supp', 901); document.getElementById('dd-a').value = '10'; document.getElementById('dd-n').value = 'hajm uchun';
      await saveDebtDiscount('supp', 901);
      const s = S.suppliers.find(x => x.id === 901), led = taminotchiLedger(901).map(e => e.desc);
      openDebtDiscount('cust', 902); [...document.querySelectorAll('.dd-chips button')].find(b => b.textContent === '20%').click();
      const prev = document.getElementById('dd-r').textContent; await saveDebtDiscount('cust', 902);
      const c = S.customers.find(x => x.id === 902);
      openDebtDiscount('supp', 901); document.getElementById('dd-a').value = '500'; await saveDebtDiscount('supp', 901);
      return { sDebt: s.debt, sDisc: s.discounts.length, led, cDebt: c.debt, prev, cLed: mijozLedger(902).map(e => e.desc), after: S.suppliers.find(x => x.id === 901).debt };
    });
    assert.equal(r.sDebt, 90, "ta'minotchi qarzi 100 − 10 = 90 (serverga «adjust»)"); assert.equal(r.sDisc, 1);
    assert.ok(r.led.some(d => /Chegirma.*hajm uchun/.test(d)), "ta'minotchi tarixida chegirma");
    assert.match(r.prev, /400 000/); assert.equal(r.cDebt, 400000, 'mijoz qarzi 20% kamaydi');
    assert.ok(r.cLed.some(d => /Chegirma/.test(d)), 'mijoz tarixida chegirma');
    assert.equal(r.after, 90, "qarzdan katta chegirma rad etiladi");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
async function testPerm() {
  const { browser, page, errors } = await openPage('index.html', { width: 1280, height: 800, admin: true, staff: true, perms: ['dashboard.view', 'taminotchilar.view', 'kassalar.transact'] });
  try {
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => { S.suppliers.push({ id: 901, name: 'T', debt: 50 }); openDebtDiscount('supp', 901); return { modal: !!document.getElementById('dd-a'), debt: S.suppliers.find(x => x.id === 901).debt }; });
    assert.deepEqual(r, { modal: false, debt: 50 }, "taminotchilar.edit'siz chegirma oynasi ochilmaydi");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
// v24.7: omborsiz sotuv xabari — hamkor tomonida «tasdiqlang», bizda narx farqi / rad etish «qarzni tenglang»
module.exports = { name: 'P64 — qarzga chegirma (v24.7; v25: B2B olib tashlandi)', cases: [
  { name: "ta'minotchidan / qarzdorga chegirma: serverga, tarixda, qarzdan oshmaydi", run: testDiscounts },
  { name: "ruxsat: taminotchilar.edit'siz chegirma yo'q", run: testPerm },
] };
