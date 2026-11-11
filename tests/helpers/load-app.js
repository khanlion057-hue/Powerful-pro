// Test harness — REAL production kodni (js/shared.js + js/main.js) haqiqiy
// headless brauzerda ishga tushiradi (Playwright), Supabase login/serverga
// bog'lanmasdan. Shunda testlar "nusxa"/mock kod ustida emas, aynan production
// fayllar ustida ishlaydi.
//
// TEXNIKA (muhim): script'lar sahifaning o'z DOMContentLoaded'i ALLAQACHON
// otilgandan KEYIN inject qilinadi (waitUntil:'load' + addScriptTag alohida
// chaqiriladi) — shunda main.js ichidagi
// `document.addEventListener('DOMContentLoaded', async () => {...})` login/
// boot ketma-ketligi HECH QACHON ishga tushmaydi (haqiqiy Supabase login
// kerak bo'lmaydi). `S`/`CURRENT_USER` kabi top-level `const`/`let`
// o'zgaruvchilar `window.*` emas — shuning uchun ularni page.evaluate() ichida
// `Object.assign(S, {...})` / oddiy qayta tayinlash orqali to'g'ridan-to'g'ri
// o'zgartiramiz (page.evaluate() xuddi shu global scope'da ishlaydi).
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');

// main.js sahifa yuklanishidayoq localStorage'ga murojaat qiladi (masalan
// valyuta kursini o'qish uchun). `page.setContent()`/`about:blank` — "opaque
// origin" beradi, u yerda localStorage O'QILMAYDI ("Access is denied"),
// bu esa top-level skriptni to'liq to'xtatib qo'yadi (S ham aniqlanmay qoladi).
// Shuning uchun repo papkasini haqiqiy http://localhost orqali xizmat
// qilamiz — xuddi Netlify'dagi haqiqiy origin kabi.
let _server, _serverPort;
function ensureStaticServer() {
  if (_server) return Promise.resolve(_serverPort);
  return new Promise((resolve) => {
    _server = http.createServer((req, res) => {
      const fs = require('fs');
      const filePath = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        const ext = path.extname(filePath);
        const type = ext === '.js' ? 'application/javascript' : ext === '.html' ? 'text/html' : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        res.end(data);
      });
    });
    _server.listen(0, '127.0.0.1', () => { _serverPort = _server.address().port; resolve(_serverPort); });
  });
}

async function loadApp({ seedState = {}, mockRoutes = [] } = {}) {
  const port = await ensureStaticServer();
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (require('fs').existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), // CI'da — Playwright'ning o'z Chromium'i
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  // Sahifa ichidan chiqadigan, ataylab mock qilinmagan HAR QANDAY tarmoq
  // so'rovini darhol abort qilamiz (Playwright'da OXIRGI ro'yxatga olingan
  // route ustuvor bo'ladi, shuning uchun bu "hammasini rad et" qoidasi
  // BIRINCHI ro'yxatga olinadi — pastda ro'yxatga olinadigan aniq
  // mockRoutes'lar ustunlik qiladi). Bu — testlar hech qachon haqiqiy
  // internetga chiqmasligini (va shu sababli osilib qolmasligini) kafolatlaydi.
  // Faqat o'zimizning lokal statik serverimiz (127.0.0.1:port) va aniq
  // mock qilingan .netlify/functions yo'llari istisno.
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(`http://127.0.0.1:${port}/`)) return route.continue();
    route.abort('failed');
  });

  // Konsol xatolarini yig'ib olamiz — test natijasida foydali bo'ladi
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto(`http://127.0.0.1:${port}/tests/fixtures/blank.html`, { waitUntil: 'load' });

  for (const route of mockRoutes) {
    await page.route(route.url, route.handler);
  }

  // index.html haqiqiy Supabase JS SDK'ni CDN'dan yuklaydi (main.js buni
  // `window.supabase.createClient` deb kutadi). Testlarda tashqi tarmoqqa
  // (CDN) chiqmaslik uchun — minimal, "har qanday chaqiruvni qabul qiladigan"
  // soxta (stub) klient beramiz. Bizning testlarimiz Supabase jadvallariga
  // to'g'ridan-to'g'ri MUROJAAT QILMAYDI (faqat Netlify Function'larga —
  // ular yuqorida page.route() orqali mock qilinadi), shuning uchun bu stub
  // yetarli: har qanday .from()/.auth chaqiruvi xavfsiz, bo'sh natija bilan
  // "davom etadi", hech qachon haqiqiy tarmoqqa chiqmaydi va xato tashlamaydi.
  await page.addScriptTag({
    content: `
      window.supabase = {
        createClient: function() {
          function chain() {
            const p = new Proxy(function(){}, {
              get(target, prop) {
                if (prop === 'then') return undefined; // thenable emas — await qilinganda o'zi qaytadi
                return () => chain();
              },
              apply() { return chain(); }
            });
            return p;
          }
          return {
            auth: {
              getSession: async () => ({ data: { session: null }, error: null }),
              getUser: async () => ({ data: { user: null }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
              signInWithPassword: async () => ({ data: null, error: { message: 'test-stub: login qilinmagan' } }),
              signOut: async () => ({ error: null }),
            },
            from: () => chain(),
            storage: { from: () => chain() },
            channel: () => ({ on: () => ({ subscribe: () => {} }) }),
          };
        }
      };
    `,
  });

  await page.addScriptTag({ path: path.join(ROOT, 'js', 'shared.js') });
  await page.addScriptTag({ path: path.join(ROOT, 'js', 'pos.js') });   // v24.5: savdo oynasi (admin + sotuvchi)
  await page.addScriptTag({ path: path.join(ROOT, 'js', 'main.js') });

  await page.evaluate((seed) => {
    Object.assign(S, seed.S || {});
    if (seed.CURRENT_USER) CURRENT_USER = seed.CURRENT_USER;
    // Toast/modal kabi UI chaqiruvlari haqiqiy DOM elementlarini kutadi —
    // testlarda ular mavjud emas, shuning uchun xavfsiz no-op qilib qo'yamiz,
    // lekin CHAQIRILGANLIGINI ham kuzatamiz (assert uchun kerak bo'lishi mumkin).
    window.__toasts = [];
    window.toast = (msg, kind) => { window.__toasts.push({ msg, kind }); };
  }, { seedState });

  return { browser, page, consoleErrors };
}

module.exports = { loadApp, ROOT };
