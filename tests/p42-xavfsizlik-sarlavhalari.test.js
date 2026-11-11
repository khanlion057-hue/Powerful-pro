// P42 — v24.5 (v23.10.2 P33 dan) — v23.10.1: Netlify xavfsizlik sarlavhalari (CSP va b.) ilovani BUZMAYDI — haqiqiy Chromium.
//  • Sahifalar netlify.toml'dagi AYNAN sarlavhalar bilan beriladi (fayl o'qiladi, qo'lda nusxa emas).
//  • CDN kutubxonalari — HTML'dagi aynan versiyalar (npm paketidan, jsdelivr bilan bir xil fayl) va SRI (integrity)
//    o'zgartirilmagan holda: SRI mos kelmasa skript yuklanmaydi — test buni ham ushlaydi.
//  • index.html / sotuvchi.html / diller.html: CSP buzilishi (securitypolicyviolation) — 0; ExcelJS shablon (yozish/o'qish),
//    QR kod, QR skaner kutubxonasi, Leaflet xaritasi (SRI bilan dinamik yuklanadi) — CSP ostida ishlaydi.
//  • CSP o'zi: eval yo'q, object-src 'none', frame-ancestors 'self', connect-src faqat Supabase/Telegram/jsdelivr.
// CDN paketlari: FW_CDN_DIR (tayyor papka) yoki birinchi ishga tushishda `npm pack` (registry) → os.tmpdir() keshi.
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { ROOT } = require('./helpers/load-app');

const PKGS = { '@supabase/supabase-js': '2.117.2', qrcode: '1.4.4', 'html5-qrcode': '2.3.8', exceljs: '4.4.0', leaflet: '1.9.4' };
function cdnDir() {
  const dir = process.env.FW_CDN_DIR || path.join(os.tmpdir(), 'fw-cdn-cache');
  for (const [n, v] of Object.entries(PKGS)) {
    const d = path.join(dir, `${n.replace(/^@/, '').replace('/', '-')}@${v}`);
    if (fs.existsSync(path.join(d, 'package', 'package.json'))) continue;
    fs.mkdirSync(d, { recursive: true });
    const tgz = execFileSync('npm', ['pack', `${n}@${v}`, '--silent'], { cwd: d, encoding: 'utf8' }).trim().split('\n').pop();
    execFileSync('tar', ['xzf', tgz, '-C', d]);
  }
  return dir;
}
// netlify.toml → "/*" sarlavhalari (TOML'ning shu qismi uchun oddiy o'quvchi)
function netlifyHeaders() {
  const t = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  const blk = t.slice(t.indexOf('[headers.values]'));
  const end = blk.search(/\n\[(?!headers\.values)/);
  const out = {};
  for (const m of (end > 0 ? blk.slice(0, end) : blk).matchAll(/^\s*([A-Za-z-]+)\s*=\s*"([^"]*)"/gm)) out[m[1]] = m[2];
  return out;
}

async function testCspPages() {
  const H = netlifyHeaders();
  const csp = H['Content-Security-Policy'];
  assert.ok(csp, "netlify.toml'da CSP bor");
  for (const need of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'self'", "base-uri 'self'"]) assert.ok(csp.includes(need), need);
  assert.ok(!/unsafe-eval/.test(csp), "eval ruxsat etilmagan");
  for (const k of ['X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Strict-Transport-Security', 'Permissions-Policy']) assert.ok(H[k], k);
  const CDN = cdnDir();
  const srv = http.createServer((q, s) => {
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { s.writeHead(404); return s.end(); }
      const type = f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.json') ? 'application/json' : f.endsWith('.png') ? 'image/png' : 'text/html';
      s.writeHead(200, { 'Content-Type': type, ...H }); s.end(d);
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--no-sandbox'] });
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const report = {};
  try {
    for (const pg of ['index.html', 'sotuvchi.html', 'diller.html']) {
      const ctx = await browser.newContext({ serviceWorkers: 'block' });   // v25: SW (oflayn kesh) P71 da alohida tekshiriladi
      const page = await ctx.newPage();
      const errs = [], cspConsole = [];
      page.on('pageerror', e => errs.push(String(e)));
      page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) cspConsole.push(m.text().slice(0, 200)); });
      await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
      await page.route('**/*', async (route) => {
        const u = new URL(route.request().url());
        if (u.hostname === '127.0.0.1') return route.continue();
        if (u.hostname === 'cdn.jsdelivr.net') {
          const m = u.pathname.match(/^\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\/(.+)$/);
          const f = m && path.join(CDN, `${m[1].replace(/^@/, '').replace('/', '-')}@${m[2]}`, 'package', m[3]);
          if (f && fs.existsSync(f)) return route.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'Content-Type': f.endsWith('.css') ? 'text/css' : 'application/javascript', 'Access-Control-Allow-Origin': '*' } });
          return route.fulfill({ status: 404 });
        }
        if (u.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/css' } });
        if (/tile\.openstreetmap\.org$/.test(u.hostname)) return route.fulfill({ status: 200, body: PNG, headers: { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' } });
        if (/supabase\.co$/.test(u.hostname)) return route.fulfill({ status: 401, body: '{"message":"test"}', headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        return route.abort();
      });
      await page.goto(`http://127.0.0.1:${port}/${pg}`, { waitUntil: 'load' });
      await page.waitForTimeout(800);
      const r = await page.evaluate(async (isIndex) => {
        const out = { libs: { supabase: !!window.supabase, QRCode: typeof QRCode !== 'undefined', Html5Qrcode: typeof Html5Qrcode !== 'undefined', ExcelJS: typeof ExcelJS !== 'undefined' } };
        // Supabase'ga haqiqiy so'rov (supabase-js orqali, connect-src tekshiruvi) — javob 401 (soxta), muhimi: CSP rad etmasin
        const cl = window.supabase.createClient(window.FW_CONFIG.SUPABASE_URL, window.FW_CONFIG.SUPABASE_ANON_KEY);
        out.sbReq = await cl.from('catalog_products').select('id').limit(1).then(r => (r.error ? 'javob:' + (r.status || 'xato') : 'ok'), e => 'tashlandi:' + String(e).slice(0, 80));
        if (isIndex) {
          const wb = new ExcelJS.Workbook(); wb.addWorksheet('Mahsulotlar').addRow(['Nomi', 'Soni']); const buf = await wb.xlsx.writeBuffer(); // v24.5: shablon funksiyasi yo'q — ExcelJS CSP ostida yozish/o'qish
          const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(buf); out.excel = wb2.worksheets.map(w => w.name).join(',');
          out.qr = await new Promise(res => QRCode.toDataURL('FW-123', (e, u) => res(!e && /^data:image\/png/.test(u))));
          document.body.insertAdjacentHTML('beforeend', '<div id="qr-test"></div><div id="map-test" style="width:200px;height:150px"></div>');
          try { new Html5Qrcode('qr-test'); out.scanner = true; } catch (e) { out.scanner = String(e); }
          try { const L = await dkLoadLeaflet(); L.map('map-test').setView([41.31, 69.28], 11); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(L.map ? L.map(document.createElement('div')) : null); out.leaflet = true; }
          catch (e) { out.leaflet = String(e); }
          await new Promise(r => setTimeout(r, 400));
        }
        out.csp = window.__csp;
        return out;
      }, pg === 'index.html');
      report[pg] = { ...r, errs, cspConsole };
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
  for (const [pg, r] of Object.entries(report)) {
    assert.deepEqual(r.csp, [], `${pg}: CSP buzilishi yo'q — ${JSON.stringify(r.csp)}`);
    assert.deepEqual(r.cspConsole, [], `${pg}: konsolda CSP rad etishi yo'q`);
    assert.equal(r.libs.supabase, true, `${pg}: supabase-js SRI bilan yuklandi`);
    assert.equal(r.libs.QRCode, true, `${pg}: qrcode SRI bilan yuklandi`);
    assert.equal(r.sbReq, 'javob:401', `${pg}: Supabase'ga so'rov CSP'dan o'tdi (connect-src) — ${r.sbReq}`);
  }
  const ix = report['index.html'];
  assert.equal(ix.libs.ExcelJS, true); assert.equal(ix.libs.Html5Qrcode, true);
  assert.equal(ix.excel, 'Mahsulotlar', 'ExcelJS CSP ostida yozadi/o\'qiydi');
  assert.equal(ix.qr, true, 'QR kod'); assert.equal(ix.scanner, true, 'QR skaner kutubxonasi'); assert.equal(ix.leaflet, true, 'Leaflet (SRI bilan dinamik)');
  assert.equal(report['sotuvchi.html'].libs.Html5Qrcode, true);
}

// SRI: HTML va dokon.js (Leaflet) dagi har bir CDN resursi — integrity + crossorigin bor, xesh npm paketidagi aynan faylga teng
function testSri() {
  const crypto = require('crypto');
  const CDN = cdnDir();
  const items = [];
  for (const f of fs.readdirSync(ROOT).filter(x => x.endsWith('.html'))) {
    for (const tag of fs.readFileSync(path.join(ROOT, f), 'utf8').match(/<(script|link)\b[^>]*cdn\.jsdelivr\.net[^>]*>/g) || []) {
      const url = (tag.match(/(?:src|href)="([^"]+)"/) || [])[1];
      const sri = (tag.match(/integrity="([^"]+)"/) || [])[1];
      assert.ok(sri, `${f}: ${url} — integrity yo'q`);
      assert.match(tag, /crossorigin="anonymous"/, `${f}: ${url} — crossorigin yo'q`);
      items.push([url, sri]);
    }
  }
  const dk = fs.readFileSync(path.join(ROOT, 'js', 'dokon.js'), 'utf8');
  const L = dk.match(/DK_LEAFLET = \{[^}]+\}/)[0];
  const get = (k) => (L.match(new RegExp(k + ":\\s*'([^']+)'")) || [])[1];
  items.push([get('js'), get('jsSri')], [get('css'), get('cssSri')]);
  const seen = new Set();
  for (const [url, sri] of items) {
    if (seen.has(url)) continue; seen.add(url);
    const m = url.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\/(.+)$/);
    assert.ok(m, url);
    const file = path.join(CDN, `${m[1].replace(/^@/, '').replace('/', '-')}@${m[2]}`, 'package', m[3]);
    const [alg, want] = sri.split('-');
    assert.equal(alg, 'sha384', url);
    assert.equal(crypto.createHash('sha384').update(fs.readFileSync(file)).digest('base64'), want, `${url}: SRI xeshi mos`);
  }
  assert.ok(seen.size >= 6, `CDN resurslari: ${seen.size}`);
}

module.exports = {
  name: "P42 — v24.5 (v23.10.2 P33 dan) — v23.10.1: Netlify xavfsizlik sarlavhalari (CSP) — haqiqiy Chromium, aynan CDN versiyalari va SRI",
  cases: [{ name: "SRI: har CDN resursida integrity + crossorigin; sha384 npm paketidagi aynan fayl bilan teng (supabase-js, qrcode, html5-qrcode, exceljs, leaflet js/css)", run: testSri },
    { name: "3 sahifa: CSP buzilishi 0; supabase/qrcode/html5-qrcode/exceljs SRI bilan; Excel, QR, skaner, Leaflet CSP ostida ishlaydi", run: testCspPages }],
};
