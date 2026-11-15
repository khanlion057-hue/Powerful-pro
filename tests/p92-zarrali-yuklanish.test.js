// P92 — v25.3: ZARRALI YUKLANISH EKRANI (js/fw-particle-loader.js) — haqiqiy Chromium'da:
//  • zarralar logotip piksellaridan (alpha > 110), soni ekranga qarab; logotip o'lchami: landshaft — kenglik 42% / balandlik 50%
//    dan kichigi, portret — kenglik 80%; DPR ≤ 2.2
//  • progress faqat oshadi; 100% → «Tayyor!», 2,8 s ushlab so'nadi → onDone bir marta; destroy — canvas va listenerlar tozalanadi
//  • avtomatik rejim (progress yo'q) — 7 s da 100%; tab yashirin — kadr chizilmaydi
//  • prefers-reduced-motion — zarrasiz; Web Component <fw-particle-loader progress> + 'done' hodisasi
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..');

function serve() {
  const page = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><script src="/js/fw-particle-loader.js"></script></body></html>';
  const srv = http.createServer((q, r) => {
    if (q.url.startsWith('/t.html')) { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(page); return; }
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'application/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); r.end(d); });
  });
  return new Promise((res) => srv.listen(0, '127.0.0.1', () => res(srv)));
}
async function open(browser, port, opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 }, opts));
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/t.html`);
  return { ctx, page, errors };
}
const launch = () => require('playwright').chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox'] });

async function testLifecycle() {
  const srv = await serve(), port = srv.address().port, browser = await launch();
  try {
    // Telefon (portret), DPR 3 → 2.2 ga cheklanadi
    const { ctx, page, errors } = await open(browser, port);
    await page.evaluate(() => {
      window.__adds = 0; window.__rems = 0;
      const wa = window.addEventListener, wr = window.removeEventListener, da = document.addEventListener, dr = document.removeEventListener;
      window.addEventListener = function (...a) { window.__adds++; return wa.apply(this, a); }; window.removeEventListener = function (...a) { window.__rems++; return wr.apply(this, a); };
      document.addEventListener = function (...a) { window.__adds++; return da.apply(this, a); }; document.removeEventListener = function (...a) { window.__rems++; return dr.apply(this, a); };
      window.__done = 0; window.L = FWParticleLoader.mount(document.body, { src: 'assets/logo.png', progress: 0, onDone: () => window.__done++ });
    });
    await page.waitForTimeout(500);
    const g = await page.evaluate(() => ({ n: L.parts.length, w: L.logo.w, W: L.W, cw: L.cv.width, dpr: L.dpr, bad: L.parts.some((p) => p.d < 0 || p.d > 0.8) }));
    assert.equal(g.dpr, 2.2, 'DPR ≤ 2.2'); assert.equal(g.cw, Math.round(390 * 2.2));
    assert.ok(Math.abs(g.w - 390 * 0.8) < 1, `portret — kenglik 80% (${g.w})`);
    assert.ok(g.n >= 800 && g.n <= 2200, `telefonda zarralar ${g.n} (≤ 2200)`); assert.equal(g.bad, false, 'kechikish 0..0.8');
    // Progress faqat oshadi (orqaga berilsa ham)
    await page.evaluate(() => L.setProgress(60)); await page.waitForTimeout(1500);
    const q1 = await page.evaluate(() => L.q);
    await page.evaluate(() => L.setProgress(20)); await page.waitForTimeout(500);
    assert.ok((await page.evaluate(() => L.q)) >= q1, 'progress orqaga qaytmaydi'); assert.ok(q1 > 0.5 && q1 <= 0.6);
    // 100% → Tayyor, 2,8 s ushlab, so'nadi, onDone — bir marta; canvas olib tashlanadi, listenerlar tozalanadi
    await page.evaluate(() => L.setProgress(100)); await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => !!L.doneAt), true);
    assert.equal(await page.evaluate(() => window.__done), 0, 'darhol emas — 2,8 s ushlab turadi');
    await page.waitForTimeout(3600);   // 2,8 s ushlab turish + 0,5 s so'nish
    assert.equal(await page.evaluate(() => window.__done), 1, 'onDone — bir marta');
    const after = await page.evaluate(() => ({ canv: document.querySelectorAll('canvas.fw-particle-loader').length, raf: L.raf, destroyed: L.destroyed }));
    assert.deepEqual(after, { canv: 0, raf: 0, destroyed: true }, 'tozalandi');
    assert.equal(await page.evaluate(() => window.__rems), 3, 'resize, orientationchange, visibilitychange — olib tashlandi');
    assert.deepEqual(errors, []);
    await ctx.close();

    // Kompyuter (landshaft): kenglik 42% yoki balandlik 50% — kichigi; zarralar ko'proq
    const pc = await open(browser, port, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await pc.page.evaluate(() => { window.L = FWParticleLoader.mount(document.body, { src: 'assets/logo.png', progress: 0 }); });
    await pc.page.waitForTimeout(500);
    const d = await pc.page.evaluate(() => ({ w: L.logo.w, h: L.logo.h, n: L.parts.length }));
    assert.ok(Math.abs(d.w - Math.min(1440 * 0.42, 900 * 0.5 * (1044 / 674))) < 1, `landshaft o'lcham ${d.w}`);
    assert.ok(d.n > g.n && d.n <= 5000, `kompyuterda zarralar ko'proq (${d.n})`);
    // Resize — qayta joylashadi
    await pc.page.setViewportSize({ width: 900, height: 1200 }); await pc.page.waitForTimeout(400);
    assert.ok(Math.abs((await pc.page.evaluate(() => L.logo.w)) - 900 * 0.8) < 1, 'aylantirilgach — portret qoidasi');
    // Tab yashirin — kadr chizilmaydi
    await pc.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    const f0 = await pc.page.evaluate(() => L.last); await pc.page.waitForTimeout(400);
    assert.equal(await pc.page.evaluate(() => L.raf), 0); assert.equal(await pc.page.evaluate(() => L.last), f0, 'yashirin — to\'xtadi');
    await pc.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await pc.page.waitForTimeout(300);
    assert.notEqual(await pc.page.evaluate(() => L.last), f0, 'qaytganda — davom etadi');
    assert.deepEqual(pc.errors, []);
    await pc.ctx.close();
  } finally { await browser.close(); srv.close(); }
}

async function testAutoReducedComponent() {
  const srv = await serve(), port = srv.address().port, browser = await launch();
  try {
    // Avtomatik: progress yo'q — 7 s da 100%
    const a = await open(browser, port, { deviceScaleFactor: 1 });
    await a.page.evaluate(() => { window.L = FWParticleLoader.mount(document.body, { src: 'assets/logo.png', onDone: () => { window.__d = 1; } }); });
    await a.page.waitForTimeout(3600);
    const q = await a.page.evaluate(() => L.q);
    assert.ok(q > 0.4 && q < 0.6, `3,5 s da ~50% (${q.toFixed(2)})`);
    await a.page.waitForTimeout(3800);
    assert.equal(await a.page.evaluate(() => !!L.doneAt), true, '7 s da 100%');
    await a.ctx.close();

    // prefers-reduced-motion — zarrasiz, logotip va chiziq bilan
    const r = await open(browser, port, { reducedMotion: 'reduce', deviceScaleFactor: 1 });
    await r.page.evaluate(() => { window.L = FWParticleLoader.mount(document.body, { src: 'assets/logo.png', progress: 50 }); });
    await r.page.waitForTimeout(1500);
    assert.deepEqual(await r.page.evaluate(() => ({ red: L.reduced, parts: L.parts })), { red: true, parts: null }, 'zarra yo\'q');
    await r.ctx.close();

    // Web Component: progress atributi, 'done' hodisasi, olib tashlansa — tozalanadi
    const w = await open(browser, port, { deviceScaleFactor: 1 });
    await w.page.evaluate(() => {
      window.__ev = 0; const el = document.createElement('fw-particle-loader');
      el.setAttribute('src', 'assets/logo.png'); el.setAttribute('progress', '10'); el.addEventListener('done', () => window.__ev++);
      document.body.appendChild(el); window.EL = el;
    });
    await w.page.waitForTimeout(400);
    assert.equal(await w.page.evaluate(() => document.querySelectorAll('fw-particle-loader canvas').length), 1);
    await w.page.evaluate(() => EL.setAttribute('progress', '100'));
    await w.page.waitForTimeout(5200);   // ~1 s yetib borish + 2,8 s ushlab turish + 0,5 s so'nish
    assert.equal(await w.page.evaluate(() => window.__ev), 1, "'done' hodisasi");
    await w.page.evaluate(() => { const el = document.createElement('fw-particle-loader'); el.setAttribute('progress', '30'); document.body.appendChild(el); window.E2 = el; });
    await w.page.waitForTimeout(300);
    await w.page.evaluate(() => E2.remove());
    assert.equal(await w.page.evaluate(() => document.querySelectorAll('canvas.fw-particle-loader').length), 0, 'olib tashlangach — tozalandi');
    assert.deepEqual(w.errors, []);
    await w.ctx.close();
  } finally { await browser.close(); srv.close(); }
}

async function testStatic() {
  const s = fs.readFileSync(path.join(ROOT, 'js', 'fw-particle-loader.js'), 'utf8');
  assert.ok(!/import\s|require\(|https?:\/\//.test(s.replace(/^\s*\/\/.*$/gm, '')), 'tashqi kutubxona va manzil yo\'q');
  const hexes = [...new Set((s.match(/#[0-9a-fA-F]{6}\b/g) || []).map((h) => h.toLowerCase()))];
  const allowed = ['#f1b24a', '#c9780f', '#ffffff', '#08080a', '#2b2418', '#14120e', '#fff1c8', '#d7b878'];
  assert.deepEqual(hexes.filter((h) => !allowed.includes(h)), [], 'faqat logotip ranglari (oltin, oq, qora fon)');
  assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'logo.png')), 'assets/logo.png');
}

module.exports = {
  name: 'P92 — Zarrali yuklanish ekrani (logotip oltin-oq zarralardan)',
  cases: [
    { name: "Hayot sikli: zarralar logotipdan, o'lcham qoidalari, DPR ≤ 2.2, progress faqat oshadi, 100% → 2,8 s → onDone bir marta, tozalash, resize, yashirin tab", run: testLifecycle },
    { name: "Avtomatik rejim (7 s), prefers-reduced-motion — zarrasiz, Web Component (progress atributi, 'done', olib tashlash)", run: testAutoReducedComponent },
    { name: "Statik: tashqi kutubxona yo'q, faqat logotip ranglari, assets/logo.png bor", run: testStatic },
  ],
};
