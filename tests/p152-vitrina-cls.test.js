// P152 — v25.9 (PageSpeed 4-band): VITRINA — MA'LUMOT KELGANDA SAHIFA SILJIMAYDI (CLS). Haqiqiy build, 390 px, katalog 1,5 s kechikadi.
//  • Birinchi ochilish: banner va afzalliklar yopiq, kategoriya qatori va kartalar skeleti HTML'da — CLS < 0,01.
//  • Kategoriya skeleti haqiqiy karta balandligida (±1 px); do'kon yopiq/xato — skelet yo'qoladi.
//  • Bannerli do'kon: oldingi tashrif eslab qolinadi — ikkinchi ochilishda banner joyi oldindan, CLS < 0,01.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const PRODUCTS = Array.from({ length: 24 }, (_, i) => ({ id: 1000 + i, name: 'Mahsulot ' + i, sku: 'S-' + i, brand: 'ALTECO', cat: ['Arralar', 'Disklar', 'Frezalar'][i % 3], price: 100000 + i * 1000, old: null, stock: 5, img: [], specs: [], desc: '', warranty: null, bulk: null }));
const shop = (banners) => ({ shop: { slug: 'sinov', name: 'Sinov', about: '', phone: '+998 90 000 00 00', phone2: '', address: '', wa: '', tg: '', cur: 'UZS', delivery: true, fee: 0, freeMin: 0, lat: null, lng: null }, banners, products: PRODUCTS, cats: {}, points: [], at: Date.now() });

function serve(state) {
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      let p = q.url.split('?')[0]; if (p === '/') p = '/index.html'; if (!path.extname(p)) p += '.html';
      if (p.startsWith('/.netlify/functions/shop-public')) {
        return setTimeout(() => { if (state.fail) { r.writeHead(503, { 'content-type': 'application/json' }); return r.end('{"error":"yopiq"}'); } r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify(shop(state.banners))); }, 1500);
      }
      if (p.startsWith('/.netlify/')) { r.writeHead(401); return r.end('{}'); }
      const f = path.join(DIST, p);
      if (!f.startsWith(DIST) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
    }).listen(0, '127.0.0.1', () => res(s));
  });
}
async function open(ctx, url) {
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true }); });
  await page.goto(url);
  const early = await page.evaluate(() => ({ tile: document.querySelector('.vt-cat') ? document.querySelector('.vt-cat').getBoundingClientRect().height : 0, sk: document.querySelectorAll('#vt-grid .vt-sk').length, hero: document.getElementById('vt-hero').hidden }));
  await page.waitForSelector('.vt-pc, .vt-empty', { timeout: 15000 }); await page.waitForTimeout(800);
  const late = await page.evaluate(() => ({ cls: window.__cls, tile: document.querySelector('.vt-cat') ? document.querySelector('.vt-cat').getBoundingClientRect().height : 0, catsw: !document.getElementById('vt-catsw').hidden, hero: !document.getElementById('vt-hero').hidden }));
  await page.close();
  return { early, late };
}

async function run() {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.js')], { cwd: ROOT, stdio: 'ignore' });
  const st = { banners: [], fail: false }; const srv = await serve(st); const url = `http://127.0.0.1:${srv.address().port}/dokon`;
  const b = await chromium.launch();
  try {
    let ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true });
    const a = await open(ctx, url);
    assert.equal(a.early.sk, 8, 'kartalar skeleti HTML\'da (JS kutilmaydi)');
    assert.equal(a.early.hero, true, 'banner joyi birinchi ochilishda yopiq');
    assert.ok(Math.abs(a.early.tile - a.late.tile) <= 1, `kategoriya skeleti = haqiqiy karta balandligi: ${a.early.tile} / ${a.late.tile}`);
    assert.equal(a.late.catsw, true);
    assert.ok(a.late.cls < 0.01, 'birinchi ochilish CLS < 0,01: ' + a.late.cls.toFixed(4));
    await ctx.close();
    // bannerli do'kon: birinchi ochilish — banner keyin chiqadi; ikkinchisida joy oldindan
    st.banners = [{ url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', title: 'Aksiya' }];
    ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true });
    await open(ctx, url);
    const c = await open(ctx, url);
    assert.equal(c.early.hero, false, 'ikkinchi ochilish: banner joyi oldindan (eslab qolingan)');
    assert.equal(c.late.hero, true);
    assert.ok(c.late.cls < 0.01, 'bannerli do\'kon, ikkinchi ochilish CLS < 0,01: ' + c.late.cls.toFixed(4));
    await ctx.close();
    // do'kon yopiq / xato — skelet yo'qoladi
    st.fail = true;
    ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const d = await open(ctx, url);
    assert.equal(d.late.catsw, false, 'xato holatida kategoriya skeleti yo\'q');
    await ctx.close();
  } finally { await b.close(); srv.close(); }
}
// v25.9 (PageSpeed 9-band): rasmlar — birinchi qatordagi 2 ta karta darhol, qolganlari va «Yaqinda ko'rilganlar» lazy; 1-banner ustuvor
async function images() {
  const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const st = { banners: [{ url: PX + '#1', title: 'A' }, { url: PX + '#2', title: 'B' }], fail: false };
  PRODUCTS.forEach((p, i) => { p.img = [PX + '#p' + i]; });   // haqiqiy rasm (404 bo'lsa vitrina uni almashtiradi)
  const srv = await serve(st); const url = `http://127.0.0.1:${srv.address().port}/dokon`;
  const b = await chromium.launch();
  try {
    const page = await b.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(url); await page.waitForSelector('.vt-pc', { timeout: 15000 });
    const r = await page.evaluate(() => ({
      grid: [...document.querySelectorAll('#vt-grid .vt-pc img')].slice(0, 5).map((i) => i.getAttribute('loading')),
      banner: [...document.querySelectorAll('#vt-hero img')].map((i) => [i.getAttribute('fetchpriority'), i.getAttribute('loading')]) }));
    assert.deepEqual(r.grid, ['eager', 'eager', 'lazy', 'lazy', 'lazy'], 'birinchi 2 tasi darhol, qolganlari lazy');
    assert.deepEqual(r.banner, [['high', null], [null, 'lazy']], '1-banner ustuvor, keyingilari lazy');
  } finally { await b.close(); srv.close(); PRODUCTS.forEach((p) => { p.img = []; }); }
}
module.exports = { name: 'P152 — Vitrina: maʼlumot kelganda siljish yoʻq (CLS) va rasmlar tartibi', cases: [
  { name: 'birinchi ochilish CLS < 0,01; skelet = karta balandligi; bannerli do\'kon eslab qolinadi; xato — skelet yo\'q', run },
  { name: 'rasmlar: birinchi qatordagi 2 ta karta darhol, qolganlari lazy; 1-banner ustuvor', run: images }] };
