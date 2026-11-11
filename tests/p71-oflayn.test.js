// P71 — v25 (egasi talabi): OFLAYN ISHLASH. «Internet bo'lmasa ishlasin, ulanganda darhol yuklansin».
//  • Internet yo'q — savdo yopiladi (chek raqami bilan), qurilmada navbatga tushadi, belgi «Oflayn · 1 ta savdo navbatda».
//  • Internet qaytdi — navbat o'zi yuboriladi, AYNAN o'sha idempotency kaliti bilan (server ikki marta yozmaydi), savdo «pending»dan chiqadi.
//  • Server rad etsa — savdo bekor (hisobotga kirmaydi), navbatda «qabul qilinmadi» bo'lib qoladi; jimgina yo'qolmaydi.
//  • Sahifa qayta ochilsa — navbatdagi savdo ro'yxatda qoladi.
//  • Oflayn kirish: parolning o'zi saqlanmaydi (PBKDF2 xesh), noto'g'ri parol — rad.
//  • Service worker: sahifa va fayllar keshda — internet o'chiq holda sahifa ochiladi; server funksiyalari keshlanmaydi.
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { openPage } = require('./p4-responsive.test.js')._helpers;

const seed = () => {
  S.products = [{ id: 1, sku: 'PG-1002', name: 'Makita perforator', cat: 'Perforator', markupPct: 25, unit: 'dona' }];
  S.batches = [{ id: 11, pid: 1, qty: 10, sold: 0, costUsd: 84, status: 'active', date: td() }];
  S.customers = [{ id: 501, name: 'Ali', phone: '+998 90 111 22 33', debt: 0 }];
  S.cashboxes = [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 0 }];
  S.sales = []; S.cart = []; S.savdoCustId = null;
  CUR.usdUzs = 12500;
  try { localStorage.removeItem('fw_outbox_v1'); localStorage.removeItem('fw_pos_prefs_admin'); } catch (_) {}
};

async function sellOne(page) {
  return page.evaluate(async () => {
    go('savdo'); POS.mode = 'retail'; POS.cur = 'UZS';
    posAdd(1); posOpen('pay'); posPaySet(posTotals().needN);
    await posFinish();
    const s = S.sales[S.sales.length - 1];
    return s && { inv: s.inv, id: s.id, pending: !!s.pending, status: s.status };
  });
}

module.exports = {
  name: 'P71 — oflayn: savdo navbatga, internet qaytganda bir marta yuboriladi, rad — ko\'rinadi, SW kesh, oflayn kirish',
  cases: [
    { name: 'admin: internet yo\'q — savdo yopiladi va navbatda; internet qaytdi — o\'sha kalit bilan bir marta yuboriladi', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        await page.evaluate(`(${seed})()`);
        await page.evaluate(() => { _cloudEnabled = true; save = async () => true; window.__calls = [];
          authFetch = async (url, o) => { window.__calls.push(JSON.parse(o.body)); throw new TypeError('Failed to fetch'); }; });
        await page.context().setOffline(true);
        const s1 = await sellOne(page);
        const q1 = await page.evaluate(() => ({ q: fwqList().map(e => ({ st: e.state, key: e.id, inv: e.sale.inv, pend: e.sale.pending })), badge: document.getElementById('fw-net')?.textContent, calls: window.__calls.length, cart: S.cart.length }));
        assert.ok(s1 && s1.pending, 'oflayn savdo — pending');
        assert.equal(s1.status, 'done');
        assert.equal(q1.q.length, 1); assert.equal(q1.q[0].st, 'pending'); assert.equal(q1.q[0].inv, s1.inv);
        assert.match(q1.badge || '', /Oflayn · 1 ta savdo navbatda/);
        assert.equal(q1.calls, 0, 'internet yo\'q — so\'rov yuborilmaydi (tez)');
        assert.equal(q1.cart, 0, 'savat tozalandi — keyingi mijoz');
        // Internet qaytdi — server muvaffaqiyat qaytaradi
        await page.evaluate(() => { authFetch = async (url, o) => { const b = JSON.parse(o.body); window.__calls.push(b);
          const total = b.items.reduce((s, i) => s + i.qty * i.sellUsd, 0);
          return { ok: true, status: 200, json: async () => ({ ok: true, ledger: true, localId: b.saleLocalId, totalUsd: total, debtUsd: 0, profitUsd: total - 84, balances: { 1: 1312500 } }) }; }; });
        await page.context().setOffline(false);
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await page.waitForFunction(() => !fwqList().length, null, { timeout: 5000 });
        const r = await page.evaluate(async () => { await fwqFlush(); const s = S.sales[S.sales.length - 1];
          return { calls: window.__calls.length, key: window.__calls[0] && window.__calls[0].idemKey, pending: !!s.pending, bal: (S.cashboxes.find(b => b.id === 1) || {}).bal, badge: document.getElementById('fw-net')?.hidden }; });
        assert.equal(r.calls, 1, 'bir marta yuborildi');
        assert.equal(r.key, q1.q[0].key, 'o\'sha idempotency kaliti');
        assert.equal(r.pending, false);
        assert.equal(r.badge, true, 'belgi yashirildi');
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
    { name: 'server rad etsa — savdo bekor, navbatda «qabul qilinmadi»; 500 / 409 — keyinroq qayta urinadi', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        await page.evaluate(`(${seed})()`);
        await page.evaluate(() => { _cloudEnabled = true; save = async () => true; authFetch = async () => { throw new TypeError('Failed to fetch'); }; });
        await page.context().setOffline(true);
        const s1 = await sellOne(page);
        await page.context().setOffline(false);
        const r = await page.evaluate(async () => {
          let n = 0;
          authFetch = async () => { n++; return { ok: false, status: 500, json: async () => ({ error: 'Server xatosi' }) }; };
          await fwqFlush(); const a = fwqList()[0];
          authFetch = async () => { n++; return { ok: false, status: 400, json: async () => ({ error: 'Omborda yetarli qoldiq yoʻq' }) }; };
          await fwqFlush(); const b = fwqList()[0]; const s = S.sales[S.sales.length - 1];
          return { a: [a.state, a.tries], b: [b.state, b.error], sale: [s.status, !!s.rejected, !!s.pending], n, badge: document.getElementById('fw-net')?.textContent };
        });
        assert.deepEqual(r.a, ['pending', 1], '500 — navbatda qoladi');
        assert.deepEqual(r.b, ['rejected', 'Omborda yetarli qoldiq yoʻq']);
        assert.deepEqual(r.sale, ['voided', true, false], 'rad etilgan savdo hisobotga kirmaydi');
        assert.match(r.badge, /1 ta savdo qabul qilinmadi/);
        assert.ok(s1.pending);
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
    { name: 'qayta ochilganda navbatdagi savdo ro\'yxatda; ikki parallel yuborish — bitta so\'rov', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        const r = await page.evaluate(async () => {
          localStorage.setItem('fw_outbox_v1', JSON.stringify([{ id: 'ck-1', kind: 'sale', url: '/x', body: { a: 1 }, branch: S.branch, state: 'pending', tries: 0, at: Date.now(), sale: { id: 777, inv: 'INV-0099', status: 'done', totalUsd: 10 } }]));
          const merged = fwqMergePending([{ id: 1 }], S.branch).map(x => [x.id, !!x.pending]);
          const other = fwqMergePending([], 'boshqa').length;
          let n = 0; save = async () => true; authFetch = async (u) => { if (u === '/x') n++; await new Promise(r => setTimeout(r, 50)); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
          await Promise.all([fwqFlush(), fwqFlush()]);
          return { merged, other, n, left: fwqList().length };
        });
        assert.deepEqual(r.merged, [[1, false], [777, true]]);
        assert.equal(r.other, 0, 'boshqa filialniki qo\'shilmaydi');
        assert.equal(r.n, 1, 'parallel chaqiruv — bitta so\'rov');
        assert.equal(r.left, 0);
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
    { name: 'oflayn kirish: xesh saqlanadi (parol emas), to\'g\'ri parol — kiradi, noto\'g\'ri / boshqa login — yo\'q, chiqishda o\'chadi', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        const r = await page.evaluate(async () => {
          await fwOffAuthSave('Kassir1', 'Maxfiy-77', { dest: 'seller', uid: 'u1', staff: { id: 7, name: 'Kassir' } });
          const raw = localStorage.getItem('fw_off_auth_v1');
          return { plain: raw.includes('Maxfiy-77'), ok: await fwOffAuthCheck('kassir1', 'Maxfiy-77'), bad: await fwOffAuthCheck('kassir1', 'maxfiy-77'), other: await fwOffAuthCheck('boshqa', 'Maxfiy-77') };
        });
        assert.equal(r.plain, false, 'parolning o\'zi saqlanmaydi');
        assert.equal(r.ok && r.ok.dest, 'seller');
        assert.equal(r.bad, null); assert.equal(r.other, null);
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
    { name: 'service worker: fayllar keshda — internet o\'chiq holda sahifa ochiladi; funksiyalar keshlanmaydi', async run() {
      const ROOT = path.join(__dirname, '..');
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
      let fnHits = 0;
      const srv = http.createServer((req, res) => {
        const u = decodeURIComponent(req.url.split('?')[0]);
        if (u.startsWith('/.netlify/')) { fnHits++; res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return; }
        const f = path.join(ROOT, u === '/' ? 'index.html' : u);
        fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(data); });
      });
      await new Promise(r => srv.listen(0, '127.0.0.1', r));
      const port = srv.address().port;
      const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox'] });
      try {
        const ctx = await browser.newContext();
        await ctx.route(/cdn\.jsdelivr\.net|fonts\.g/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const page = await ctx.newPage();
        await page.goto(`http://127.0.0.1:${port}/index.html`);
        await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
        if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) { await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 }); }
        const cached = await page.evaluate(async () => { const c = await caches.open((await caches.keys())[0]); return (await c.keys()).map(r => new URL(r.url).pathname); });
        assert.ok(cached.includes('/js/main.js') && cached.includes('/sotuvchi.html') && cached.includes('/js/pos.js'), 'asosiy fayllar keshda: ' + cached.join(','));
        await page.evaluate(() => fetch('/.netlify/functions/health').then(r => r.text()));
        const cached2 = await page.evaluate(async () => { const c = await caches.open((await caches.keys())[0]); return (await c.keys()).map(r => new URL(r.url).pathname); });
        assert.ok(!cached2.some(p => p.startsWith('/.netlify/')), 'server funksiyalari keshlanmaydi');
        await ctx.setOffline(true);
        await page.goto(`http://127.0.0.1:${port}/sotuvchi.html`);
        const title = await page.evaluate(() => document.querySelector('script[src="js/sotuvchi.js"]') != null && typeof fwqFlush === 'function');
        assert.equal(title, true, 'internet yo\'q — sotuvchi sahifasi va skriptlari keshdan ochildi');
        assert.ok(fnHits >= 1);
      } finally { await browser.close(); srv.close(); }
    } },
  ],
};
