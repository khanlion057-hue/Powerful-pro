// P149 — v25.9: YANGI VERSIYA TELEFONGA YETIB BORADI (service worker). Egasi xabari: deploydan keyin telefonda eski versiya qolgan.
// Sabab: sekin internetda SW 1,5 s dan keyin keshdagi ESKI sahifani beradi (tez ochilish — P90 qoidasi, o'zgarmaydi), yangi SW esa
// hamma faylni qaytadan yuklab o'rnatilgunicha ilova yopilardi; ochiq sahifa yangi versiya haqida bilmasdi.
// HAQIQIY build (ikki versiya: A va B), haqiqiy Chromium + doimiy profil (telefondagi ilova kabi), sahifa javobi 2,5 s kechikadi:
//  • A o'rnatilgan telefonda B deploy qilinsa — ilova YOPILMASDAN B ga o'tadi (yangi ochilgan bo'lsa o'zi qayta yuklanadi);
//  • oyna ochiq bo'lsa — qayta yuklanmaydi, «Yangilash» tugmasi (≥44 px) chiqadi, bosilsa B;
//  • B o'rnatilayotganda o'zgarmagan xeshli fayllar (/h/…) qayta yuklanmaydi — faqat o'zgargani.
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SITE = ['index.html', 'sotuvchi.html', 'diller.html', 'dokon.html', '404.html', 'manifest.json', 'sw.js', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'assets', 'css', 'js', '.well-known', 'scripts'];
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

function buildVariant(tmp, name, mutate) {
  const dir = path.join(tmp, name);
  for (const f of SITE) if (fs.existsSync(path.join(ROOT, f))) fs.cpSync(path.join(ROOT, f), path.join(dir, f), { recursive: true });
  if (mutate) mutate(dir);
  execFileSync(process.execPath, [path.join(dir, 'scripts', 'build.js')], { cwd: dir, stdio: 'ignore' });
  return path.join(dir, 'dist');
}
function server(state) {
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(state.root, p);
      if (state.log) state.log.push(p);
      if (!f.startsWith(state.root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('nf'); }
      const h = { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': p.startsWith('/h/') ? 'public,max-age=31536000,immutable' : 'no-cache' };
      setTimeout(() => { let b; try { b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end('nf'); } r.writeHead(200, h); r.end(b); }, f.endsWith('.html') ? state.delay : 0);
    }).listen(0, '127.0.0.1', () => res(s));
  });
}
const ver = (page) => page.evaluate(() => (window.__FW_V2 === 1 ? 'B' : 'A')).catch(() => 'nav');

async function scenario({ busy }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p149-'));
  const A = buildVariant(tmp, 'a');
  const B = buildVariant(tmp, 'b', (d) => fs.appendFileSync(path.join(d, 'js', 'main.js'), '\nwindow.__FW_V2 = 1;\n'));
  const st = { root: A, delay: 0, log: null };
  const srv = await server(st); const url = `http://127.0.0.1:${srv.address().port}/`;
  const prof = path.join(tmp, 'profil');
  try {
    // 1) Telefon A versiyada: ochildi, SW o'rnatildi, yopildi
    let ctx = await chromium.launchPersistentContext(prof, { viewport: { width: 390, height: 844 } });
    let page = ctx.pages()[0] || await ctx.newPage();
    await page.goto(url); await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 20000 });
    await page.waitForTimeout(1500); await ctx.close();
    // 2) B deploy qilindi; internet sekin (sahifa 2,5 s)
    st.root = B; st.delay = 2500; st.log = [];
    ctx = await chromium.launchPersistentContext(prof, { viewport: { width: 390, height: 844 } });
    page = ctx.pages()[0] || await ctx.newPage();
    await page.goto(url);
    assert.equal(await ver(page), 'A', 'sekin internetda tez ochilish — avval keshdagi A (P90 qoidasi)');
    if (busy) await page.evaluate(() => { const d = document.createElement('div'); d.className = 'bs-box'; document.body.appendChild(d); });
    let got = null;
    for (let i = 0; i < 30 && !got; i++) {
      await page.waitForTimeout(1000);
      if (busy && await page.$('#fw-upd')) got = 'banner';
      else if (!busy && await ver(page) === 'B') got = 'B';
    }
    if (!busy) {
      assert.equal(got, 'B', 'ilova yopilmasdan B ga o\'tdi (yangi ochilgan — o\'zi qayta yuklandi)');
    } else {
      assert.equal(got, 'banner', 'oyna ochiq — qayta yuklanmadi, «Yangilash» chiqdi');
      assert.equal(await ver(page), 'A', 'ishlayotgan oyna yo\'qolmadi');
      const btn = await page.$('#fw-upd button');
      const h = (await btn.boundingBox()).height; assert.ok(h >= 44, 'tugma ≥ 44 px: ' + h);
      assert.equal((await page.innerText('#fw-upd')).replace(/\s+/g, ' ').trim(), 'Yangi versiya tayyor Yangilash');
      await Promise.all([page.waitForNavigation().catch(() => {}), btn.click()]);
      for (let i = 0; i < 10 && await ver(page) !== 'B'; i++) await page.waitForTimeout(1000);
      assert.equal(await ver(page), 'B', '«Yangilash» — B');
    }
    // o'zgarmagan xeshli fayllar qayta yuklanmadi (faqat main.js o'zgargan)
    const hashed = st.log.filter((p) => p.startsWith('/h/'));
    assert.ok(hashed.some((p) => /js\.main\./.test(p)), 'o\'zgargan main.js yuklandi');
    assert.ok(!hashed.some((p) => /css\.design-system\.|js\.shared\.|js\.dokon\./.test(p)), 'o\'zgarmaganlar qayta yuklanmadi: ' + hashed.join(','));
    await ctx.close();
  } finally { srv.close(); if (srv.closeAllConnections) srv.closeAllConnections(); await new Promise((r) => setTimeout(r, 3000)); fs.rmSync(tmp, { recursive: true, force: true }); }
}

async function testCode() {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), shared = fs.readFileSync(path.join(ROOT, 'js', 'shared.js'), 'utf8');
  assert.match(sw, /const NAV_TIMEOUT_MS = 1500;/, 'tez ochilish qoidasi o\'zgarmagan (P90)');
  assert.match(sw, /self\.skipWaiting\(\)/); assert.match(sw, /self\.clients\.claim\(\)/);
  assert.match(sw, /type: 'FW_NEW_VERSION'/);
  assert.match(shared, /register\('sw\.js', \{ updateViaCache: 'none' \}\)/);
  assert.match(shared, /addEventListener\('controllerchange'/);
  assert.match(shared, /visibilitychange[\s\S]{0,80}chk\(\)/, 'ilovaga qaytilganda yangilanish tekshiriladi');
}

module.exports = {
  name: 'P149 — Yangi versiya telefonga yetib boradi (service worker, sekin internet)',
  cases: [
    { name: 'kod: tez ochilish 1,5 s saqlangan; skipWaiting/claim; FW_NEW_VERSION; updateViaCache none; controllerchange; qaytishda tekshiruv', run: testCode },
    { name: 'sekin internet (2,5 s): A → B — ilova yopilmasdan B; o\'zgarmagan /h/ fayllar qayta yuklanmaydi', run: () => scenario({ busy: false }) },
    { name: 'oyna ochiq: qayta yuklanmaydi, «Yangilash» (≥44 px) → B', run: () => scenario({ busy: true }) },
  ],
};
