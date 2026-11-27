// AI-reklama: shablonlarni haqiqiy Chromium'da chizish (evidence va testlar uchun). Statik server — loyiha ildizi.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.txt': 'text/plain' };
function server() {
  return new Promise((res) => {
    const srv = http.createServer((q, s) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      if (u === '/air.html') { s.writeHead(200, { 'Content-Type': 'text/html' }); return s.end('<!doctype html><meta charset="utf-8"><body style="margin:0"><script src="js/brand.js"></script><script src="js/ai-reklama-shablonlar.js"></script><script src="js/ai-reklama.js"></script></body>'); }
      const f = path.join(ROOT, u); if (!f.startsWith(ROOT)) { s.writeHead(403); return s.end(); }
      fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' }); s.end(d); });
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}
const PRODUCTS = [
  { key: 'uzun-nom', name: 'Burchakli silliqlash mashinasi AGH 3000-230 S HEAVY DUTY — oʻtkir gʻildirak, taʼmirlanadigan korpus', title: 'Ustalar uchun kuchli tanlov',
    priceLine: '891 000 soʻm', oldLine: '', pct: 0, reason: 'new', img: 'tests/fixtures/ai-reklama/drel-fon.jpg' },
  { key: 'chegirma', name: 'Tortsovochnaya pila MS 1900-255 L', title: 'Chegirma boshlandi!',
    priceLine: '1 854 000 soʻm', oldLine: '2 180 000 soʻm', pct: 15, reason: 'discount', img: 'tests/fixtures/ai-reklama/tortsovka.webp' },
  { key: 'tik-rasm', name: 'Цепная электропила ECS 1900-40 (Ўзбекистон)', title: 'Хит продаж', lang: 'ru',
    priceLine: '542 000 soʻm', oldLine: '', pct: 0, reason: 'top', img: 'tests/fixtures/ai-reklama/pila-tik.jpg' },
];
// «Yangi (oq)» uchun: uzun nom / tik rasm / rangli fondagi rasm (hammasi yangi kelgan)
const NEW_PRODUCTS = [
  { key: 'uzun-nom', name: 'Tortsovochnaya pila MS 1900-255 L — lazer koʻrsatkich, 255 mm disk, sirpanuvchi qoʻl, oʻtkir gʻildirak bilan', title: 'Yangi keldi: aniq kesish',
    priceLine: '1 854 000 soʻm', oldLine: '', pct: 0, reason: 'new', img: 'tests/fixtures/ai-reklama/tortsovka.webp' },
  { key: 'tik-rasm', name: 'Zanjirli elektroarra ECS 1900-40', title: 'Bogʻ uchun yangi yordamchi',
    priceLine: '542 000 soʻm', oldLine: '', pct: 0, reason: 'new', img: 'tests/fixtures/ai-reklama/pila-tik.jpg' },
  { key: 'rangli-fon', name: 'Drel AGH 600 Vt (rasm rangli fonda)', title: 'Ustalar uchun kuchli tanlov',
    priceLine: '891 000 soʻm', oldLine: '', pct: 0, reason: 'new', img: 'tests/fixtures/ai-reklama/drel-fon.jpg' },
];
async function openAir() {
  const srv = await server(), port = srv.address().port;
  const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/air.html`);
  return { srv, browser, page, errors, close: async () => { await browser.close(); srv.close(); } };
}
// Bitta shablon × mahsulotlar → PNG (base64); fmt: 'post' | 'story'
async function renderAll(page, fmt, products = PRODUCTS) {
  return page.evaluate(async ({ fmt, products }) => {
    const fontOk = await airLoadFonts();
    const logo = await airGetImage('assets/brand-logo.png').catch(() => null), logoDark = await airGetImage('assets/brand-logo-dark.png').catch(() => null);
    const out = [];
    for (const tpl of AIR_TEMPLATES) {
      for (const p of products) {
        const img = await airGetImage(p.img);
        const W = 1080, H = fmt === 'story' ? 1920 : 1080, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        airDraw(cv.getContext('2d'), W, H, tpl, { ...p, lang: p.lang || 'uz', shopName: 'Powerful Group', imgs: [img], logo, logoDark }, null);
        out.push({ tpl: tpl.id, key: p.key, png: cv.toDataURL('image/png').split(',')[1] });
      }
    }
    return { fontOk, out };
  }, { fmt, products });
}
module.exports = { openAir, renderAll, PRODUCTS, NEW_PRODUCTS, ROOT };
