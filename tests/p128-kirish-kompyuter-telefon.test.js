// P128 — v25.6.10 (egasi): «Telefonda — barmoq izi, kompyuterda — PIN kod».
// Haqiqiy brauzer, haqiqiy ishga tushish yo'li (index.html boot → fwQuickUnlock), haqiqiy WebAuthn (Chromium virtual autentifikatori):
//  • kompyuter, Windows Hello YO'Q — parol bilan kirgach PIN taklifi; qayta ochilganda PIN (klaviaturadan), ☝ tugmasi yo'q;
//  • kompyuter, Windows Hello BOR — baribir faqat PIN (barmoq izi/Hello so'ralmaydi);
//  • telefon (Android brauzer), barmoq izi BOR — avval barmoq izi taklifi; qayta ochilganda darhol barmoq izi, PINsiz kiradi.
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { supabaseStub, BP_DATA } = require('./p4-responsive.test.js')._helpers;
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

let _srv = null;
function server() {
  if (_srv) return _srv;
  _srv = new Promise((res) => {
    const s = http.createServer((req, r) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => { s.unref(); res(s.address().port); });
  });
  return _srv;
}

const DESK_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

async function open({ ua, mobile, authenticator }) {
  const port = await server();
  const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 800 }, isMobile: !!mobile, hasTouch: !!mobile, userAgent: ua, serviceWorkers: 'block' });
  await ctx.addInitScript({ content: supabaseStub({ loggedIn: true }) });
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.includes('/.netlify/functions/app-data-load')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: BP_DATA }) });
    if (u.includes('/.netlify/functions/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (u.startsWith(`http://localhost:${port}/`)) return route.continue();
    if (u.includes('cdn.jsdelivr.net')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    return route.abort('failed');
  });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  if (authenticator) {   // WebAuthn RP ID IP manzil bo'lolmaydi — shuning uchun «localhost»
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  }
  await page.goto(`http://localhost:${port}/index.html`);
  await page.waitForTimeout(1500);
  return { browser, page, errors, url: `http://localhost:${port}/index.html` };
}
const INFO = { dest: 'admin', branch: 'baza', uid: 'u1', name: 'Egasi' };
const typePin = async (page, pin) => { for (const d of pin) { await page.keyboard.press(d); await page.waitForTimeout(30); } };
const reopen = async (page) => {   // ilovani qayta ochish: 5 daqiqalik «yaqinda ishlagan» belgisi va sessiya kaliti o'chiriladi
  await page.evaluate(() => { localStorage.removeItem('fw_last_active'); sessionStorage.clear(); });
  await page.reload(); await page.waitForTimeout(1600);
};

async function desktopPin(authenticator) {
  const { browser, page, errors } = await open({ ua: DESK_UA, authenticator });
  try {
    assert.equal(await page.evaluate(() => fwBioMobile()), false);
    assert.equal(await page.evaluate(() => fwBioReady()), false, 'kompyuterda barmoq izi/Hello ishlatilmaydi');
    // parol bilan kirgandan keyingi taklif — to'g'ridan-to'g'ri PIN (barmoq izi oynasi yo'q)
    await page.evaluate((i) => { window.__off = fwQuickSetupOffer(i); }, INFO);
    await page.waitForSelector('#fw-pin-ov');
    assert.equal(await page.$('.fw-bio-card'), null, 'barmoq izi taklifi chiqmaydi');
    assert.match(await page.$eval('#fw-pin-ov', (e) => e.textContent), /Tez kirish uchun PIN/);
    assert.equal(await page.$('#fw-pin-ov button[data-k="bio"]'), null, '☝ tugmasi yo\'q');
    await typePin(page, '1357'); await typePin(page, '1357');
    await page.evaluate(() => window.__off); await page.waitForTimeout(150);
    assert.equal(await page.$('#fw-pin-ov'), null, 'PINdan keyin barmoq izi so\'ralmaydi');
    const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('fw_quick_v1')));
    assert.ok(rec.hash && !rec.bio && !rec.bioOnly, 'PIN xeshi saqlandi, barmoq izi yo\'q');
    // Sozlamalarda — faqat PIN
    const sec = await page.evaluate(() => fwQuickSectionHtml({}));
    assert.doesNotMatch(sec, /armoq/, 'kompyuter sozlamalarida barmoq izi qatori yo\'q');
    // qayta ochish — PIN oynasi, noto'g'ri PIN — xato, to'g'ri — kiradi
    await reopen(page);
    await page.waitForSelector('#fw-pin-ov');
    assert.equal(await page.$('#fw-pin-ov button[data-k="bio"]'), null);
    assert.equal(await page.$('.fw-bio-card'), null);
    await typePin(page, '0000'); await page.waitForTimeout(300);
    assert.match(await page.$eval('.fw-pin-err', (e) => e.textContent), /PIN notoʻgʻri/);
    await typePin(page, '1357'); await page.waitForTimeout(1500);
    assert.equal(await page.$('#fw-pin-ov'), null, 'PIN qabul qilindi');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('bp_auth_ok')), '1', 'ilovaga kirdi');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function phoneBio() {
  const { browser, page, errors } = await open({ ua: PHONE_UA, mobile: true, authenticator: true });
  try {
    assert.equal(await page.evaluate(() => fwBioReady()), true, 'telefon brauzerida barmoq izi bor');
    await page.evaluate((i) => { window.__off = fwQuickSetupOffer(i); }, INFO);
    await page.waitForSelector('.fw-bio-card');
    await page.click('.fw-bio-card button[data-k="bio"]');   // ☝ — tizim barmoq izi (virtual autentifikator)
    await page.evaluate(() => window.__off);
    const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('fw_quick_v1')));
    assert.ok(rec.bioOnly && rec.bio && !rec.hash, 'PINsiz barmoq izi yozuvi');
    assert.ok(await page.evaluate(() => !!localStorage.getItem('fw_bio_cred')), 'qurilma kaliti yaratildi');
    // qayta ochish — darhol barmoq izi (poyga yo'q: aniqlash kutib turiladi), PINsiz kiradi
    await reopen(page);
    await page.waitForTimeout(800);
    assert.equal(await page.$('#fw-pin-ov'), null, 'barmoq izi avtomatik tasdiqlandi');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('bp_auth_ok')), '1', 'ilovaga kirdi');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

module.exports = { name: 'P128 — Kirish: telefonda barmoq izi, kompyuterda PIN', cases: [
  { name: 'kompyuter (Windows Hello yoʻq): PIN taklifi, klaviaturadan PIN, notoʻgʻri — xato, toʻgʻri — kiradi', run: () => desktopPin(false) },
  { name: 'kompyuter (Windows Hello bor): baribir faqat PIN, barmoq izi soʻralmaydi', run: () => desktopPin(true) },
  { name: 'telefon brauzeri (barmoq izi bor): avval barmoq izi, qayta ochilganda darhol barmoq izi bilan kiradi', run: phoneBio },
] };
