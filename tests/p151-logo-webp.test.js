// P151 — v25.9 (PageSpeed 3-band): LOGOTIP WebP (PNG — zaxira). Haqiqiy build, 390 px, DPR 3.
//  • Kirish oynasi: WebP yuklanadi, PNG umuman so'ralmaydi; src — PNG (CSS qoidalari [src$="brand-logo.png"] ishlayveradi).
//  • WebP ochilmasa — PNG zaxira (logo yo'qolmaydi, «noimg» emas).
//  • Boshqa (yuklangan) logotip — srcset olib tashlanadi (WebP uni bosib ketmaydi).
//  • Vitrina: telefon (46 px) uchun mos o'lcham (184w), o'lcham avvalgidek 46×~30.
//  • Fayllar mavjud; WebP PNG'dan ancha kichik; SW oflayn uchun keshlaydi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
function serve() {
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      let p = q.url.split('?')[0]; if (p === '/') p = '/index.html'; if (!path.extname(p)) p += '.html';
      if (p.startsWith('/.netlify/')) { r.writeHead(401); return r.end('{}'); }
      const f = path.join(DIST, p);
      if (!f.startsWith(DIST) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
    }).listen(0, '127.0.0.1', () => res(s));
  });
}

async function run() {
  for (const f of ['brand-logo.webp', 'logo-92.webp', 'logo-184.webp', 'logo-276.webp', 'brand-logo.png', 'logo.png']) assert.ok(fs.existsSync(path.join(ROOT, 'assets', f)), f);
  assert.ok(fs.statSync(path.join(ROOT, 'assets', 'brand-logo.webp')).size * 3 < fs.statSync(path.join(ROOT, 'assets', 'brand-logo.png')).size, 'WebP PNG\'dan kamida 3 marta kichik');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  for (const f of ['brand-logo.webp', 'logo-184.webp', 'brand-logo.png', 'logo.png']) assert.ok(sw.includes(`'./assets/${f}'`), 'SW oflayn: ' + f);
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.js')], { cwd: ROOT, stdio: 'ignore' });
  const srv = await serve(); const url = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch();
  try {
    // 1) kirish — faqat WebP
    let ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    let page = await ctx.newPage(); const got = []; page.on('request', (r) => { if (/logo/.test(r.url())) got.push(r.url().split('/').pop()); });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url); await page.waitForSelector('#ul-login'); await page.waitForTimeout(600);
    const a = await page.evaluate(() => { const i = document.querySelector('.fw-login-card img'); return { cur: i.currentSrc.split('/').pop(), src: i.getAttribute('src'), w: i.naturalWidth }; });
    assert.deepEqual(a, { cur: 'brand-logo.webp', src: 'assets/brand-logo.png', w: 720 });
    assert.ok(!got.includes('brand-logo.png'), 'PNG yuklanmadi: ' + got.join(','));
    // 2) boshqa logotip — srcset olib tashlanadi
    const c = await page.evaluate(() => {
      localStorage.setItem('fw_brand', JSON.stringify({ name: 'Boshqa firma', logo: 'https://example.com/logo.png' }));
      fwApplyBrand(); const i = document.querySelector('.fw-login-card img');
      return { src: i.getAttribute('src'), srcset: i.getAttribute('srcset'), lockup: /srcset=/.test(fwBrandLockup('lg')) };
    });
    assert.deepEqual(c, { src: 'https://example.com/logo.png', srcset: null, lockup: false }, 'yuklangan logotipni WebP bosib ketmaydi');
    assert.deepEqual(errors, []);
    await ctx.close();
    // 3) WebP ochilmasa — PNG zaxira
    ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await ctx.route('**/*.webp', (r) => r.fulfill({ status: 404 }));
    page = await ctx.newPage(); await page.goto(url); await page.waitForSelector('#ul-login'); await page.waitForTimeout(800);
    const d = await page.evaluate(() => { const i = document.querySelector('.fw-login-card img'); return { cur: i.currentSrc.split('/').pop(), w: i.naturalWidth, noimg: i.parentNode.classList.contains('noimg') }; });
    assert.deepEqual(d, { cur: 'brand-logo.png', w: 1044, noimg: false }, 'WebP yo\'q — PNG');
    await ctx.close();
    // 4) vitrina — mos o'lcham
    ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    page = await ctx.newPage(); await page.goto(url + 'dokon'); await page.waitForTimeout(800);
    const v = await page.evaluate(() => { const i = document.querySelector('.vt-logo img'), r = i.getBoundingClientRect(); return { cur: i.currentSrc.split('/').pop(), w: Math.round(r.width), h: Math.round(r.height) }; });
    assert.deepEqual(v, { cur: 'logo-184.webp', w: 46, h: 30 }, 'vitrina: 46 px × DPR 3 → 184w; o\'lcham avvalgidek');
    await ctx.close();
  } finally { await b.close(); srv.close(); }
}
module.exports = { name: 'P151 — Logotip WebP (PNG zaxira)', cases: [{ name: 'kirish: faqat WebP; WebP yo\'q — PNG; boshqa logotip — srcset yo\'q; vitrina 184w; SW oflayn', run }] };
