// P150 — v25.9 (PageSpeed 1-band): KIRISH OYNASI SKELETI (index.html, 390 px, haqiqiy build).
//  • Kirmagan foydalanuvchi: JS yuklanguncha ham darhol kirish kartasi ko'rinadi (bo'sh ilova qobig'i emas); maydonlar o'chiq.
//  • Skelet va haqiqiy forma — aynan bir joyda (karta, logotip, maydonlar, tugma — siljish yo'q); forma chiqqach skelet yo'q.
//  • Kirgan foydalanuvchi (sessiya belgisi / eslab qolish / tez kirish) — skelet ko'rinmaydi (main.js init sharti bilan bir xil).
//  • Masshtab (sukut 90%) va mavzu skeletda ham qo'llanadi; JS xatosi yo'q.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };

function serve(slowJs) {
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      let p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
      if (p.startsWith('/.netlify/')) { r.writeHead(401); return r.end('{}'); }
      const f = path.join(DIST, p);
      if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      const send = () => { let b; try { b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); };
      if (slowJs && /\/h\/js\.config\./.test(p)) setTimeout(send, 2000); else send();
    }).listen(0, '127.0.0.1', () => res(s));
  });
}
const geo = () => {
  const card = document.querySelector('.fw-login-card'), img = card.querySelector('img');
  const ins = card.querySelectorAll('input'), btn = card.querySelector('#ul-go') || card.querySelector('button[disabled]');
  return [card, img, ins[0], ins[1], btn].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.left), Math.round(r.width), Math.round(r.height)]; });
};

async function testLoggedOut() {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.js')], { cwd: ROOT, stdio: 'ignore' });
  const srv = await serve(true); const url = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch();
  try {
    const page = await b.newPage({ viewport: { width: 390, height: 844 } });
    // CI'dagi holat: Inter shrifti forma chiqishidan oldin keladi, skelet esa zaxira shrift bilan chiziladi —
    // balandliklar shriftga bog'liq bo'lmasligi kerak (aks holda shrift almashganda karta siljiydi)
    const INTER = fs.readFileSync(path.join(ROOT, 'assets', 'ai-reklama', 'fonts', 'inter-latin.woff2'));
    await page.route('https://fonts.googleapis.com/**', (r) => setTimeout(() => r.fulfill({ status: 200, contentType: 'text/css',
      body: "@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url(https://fonts.gstatic.com/inter.woff2) format('woff2')}" }), 300));
    await page.route('https://fonts.gstatic.com/**', (r) => setTimeout(() => r.fulfill({ status: 200, contentType: 'font/woff2', body: INTER, headers: { 'access-control-allow-origin': '*' } }), 1200));
    // CI (Ubuntu) holati: skelet paytida zaxira shrift (Liberation Sans), forma paytida Inter — balandliklar shriftga bog'liq bo'lmasin.
    await page.route(url, async (r) => { const res = await r.fetch(); const html = (await res.text()).replace('</head>', '<style id="p150-font">html,body,input,button,div,span,b{font-family:"Liberation Sans",sans-serif !important}</style></head>'); r.fulfill({ response: res, body: html }); });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    page.goto(url).catch(() => {});
    await page.waitForSelector('#fw-boot-login .fw-login-card img', { state: 'visible', timeout: 15000 });
    const early = await page.evaluate((g) => ({
      appJs: typeof showUnifiedLogin, shown: getComputedStyle(document.getElementById('fw-boot-login')).display,
      dis: [...document.querySelectorAll('#fw-boot-login input')].every((i) => i.disabled), btn: document.querySelector('#fw-boot-login button[disabled]').textContent.trim(),
      zoom: document.documentElement.style.zoom, fwz: document.documentElement.style.getPropertyValue('--fw-z'), geo: (0, eval)('(' + g + ')')() }), geo.toString());
    assert.equal(early.appJs, 'undefined', 'skelet JS yuklanmasdan oldin ko\'rinadi');
    assert.equal(early.shown, 'flex'); assert.equal(early.dis, true, 'maydonlar o\'chiq'); assert.equal(early.btn, 'Yuklanmoqda…');
    assert.equal(early.zoom, '0.9', 'sukut masshtabi 90% — forma bilan bir xil'); assert.equal(early.fwz, '0.9');
    await page.evaluate(() => document.getElementById('p150-font').remove());
    await page.waitForSelector('#ul-login');
    await page.evaluate(() => document.fonts.ready);   // forma — Inter bilan (skelet — zaxira shrift bilan edi)
    const fontOk = await page.evaluate(() => document.fonts.check('14px Inter'));
    assert.equal(fontOk, true, 'sinov: forma vaqtida Inter yuklangan (shrift almashishi tekshiriladi)');
    const real = await page.evaluate((g) => ({ geo: (0, eval)('(' + g + ')')(), skel: !!document.getElementById('fw-boot-login') }), geo.toString());
    assert.equal(real.skel, false, 'forma chiqqach skelet yo\'q');
    assert.deepEqual(real.geo, early.geo, 'karta, logotip, maydonlar va tugma — aynan bir joyda (siljish yo\'q)');
    const btnH = await page.evaluate(() => document.getElementById('ul-go').getBoundingClientRect().height);
    assert.ok(btnH > 0);
    assert.deepEqual(errors, [], 'JS xatosi yo\'q');
  } finally { await b.close(); srv.close(); }
}

async function testLoggedIn() {
  const srv = await serve(false); const url = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch();
  try {
    for (const [name, init] of [['sessiya belgisi', () => sessionStorage.setItem('bp_auth_ok', '1')],
      ['eslab qolish', () => localStorage.setItem('fw_remember_v1', '{"x":1}')], ['tez kirish', () => localStorage.setItem('fw_quick_v1', '{"x":1}')]]) {
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.route('**/h/js.config.*', async (r) => { await new Promise((x) => setTimeout(x, 1500)); r.continue(); });
      const page = await ctx.newPage(); await page.addInitScript(init);
      page.goto(url).catch(() => {});
      await page.waitForSelector('#fw-boot-login', { state: 'attached', timeout: 15000 });
      await page.waitForTimeout(300);
      const d = await page.evaluate(() => getComputedStyle(document.getElementById('fw-boot-login')).display);
      assert.equal(d, 'none', name + ': kirgan foydalanuvchida «Kirish» skeleti ko\'rinmaydi');
      await ctx.close();
    }
    // shart main.js init bilan bir xil (kalitlar o'zgarsa — test ogohlantiradi)
    const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8'), shared = fs.readFileSync(path.join(ROOT, 'js', 'shared.js'), 'utf8');
    assert.match(main, /sessionStorage\.getItem\('bp_auth_ok'\) !== '1'/);
    assert.match(shared, /const FW_REMEMBER = 'fw_remember_v1'/); assert.match(shared, /const FWQK = 'fw_quick_v1'/);
  } finally { await b.close(); srv.close(); }
}

module.exports = {
  name: 'P150 — Kirish oynasi skeleti (PageSpeed 1-band)',
  cases: [
    { name: 'kirmagan: JS\'dan oldin karta, maydonlar o\'chiq, 90% masshtab; forma aynan o\'sha joyda, skelet yo\'qoladi', run: testLoggedOut },
    { name: 'kirgan (sessiya / eslab qolish / tez kirish): skelet ko\'rinmaydi; shart main.js bilan bir xil', run: testLoggedIn },
  ],
};
