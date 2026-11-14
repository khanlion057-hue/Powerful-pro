// P52 — v24.5 audit: onclick="fn('…')" ichidagi ID'lar orqali saqlangan XSS yopildi.
//  • esc() ' ni &#39; ga aylantiradi, lekin brauzer atributni JS'ga berishdan OLDIN uni yana ' ga qaytaradi — satrdan
//    chiqib, kod bajarilardi. Endi: escJsAttr() (avval JS-escape, keyin HTML-escape) — haqiqiy Chromium'da tekshiriladi.
//  • Server: do'kon buyurtma/sharh ID'si faqat xavfsiz belgilardan (aks holda qabul qilinmaydi).
//  • Statik: js/ ichida onclick/onchange/oninput="…'${esc(" qolmagan.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./helpers/load-app');
const ROOT = path.join(__dirname, '..');

function testStatic() {
  const bad = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(x => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    const m = src.match(/on(click|change|input)="[^"]*'\$\{esc\(/g);
    if (m) bad.push(`${f}: ${m.length}`);
  }
  assert.deepEqual(bad, [], "onclick ichida esc() o'rniga escJsAttr() bo'lishi kerak");
}

function testServerShopIds() {
  const g = require(path.join(ROOT, 'netlify', 'functions', '_lib', 'appDataGuard.js'));
  const evil = "so1');window.__x=1;//";
  const r = g.filterShop({ orders: [{ id: 'so1', updatedAt: '2026-10-01' }] },
    { orders: [{ id: 'so1', updatedAt: '2026-10-01' }, { id: 'so2', updatedAt: '2026-10-02' }, { id: evil, updatedAt: '2026-10-03' }] }, new Set(['savdo.create']));
  const merged = g.normalizeIncomingShop({ orders: [{ id: 'so1', updatedAt: '2026-10-01' }] }, r.value);
  const ids = (merged.orders || r.value.orders).map(o => o.id);
  assert.ok(ids.includes('so2'), "oddiy ID qabul qilinadi");
  assert.ok(!ids.includes(evil), "qo'shtirnoqli ID qabul qilinmaydi");
}

async function testBrowser() {
  const { browser, page } = await loadApp({});
  try {
    const r = await page.evaluate(() => {
      const evil = "x');window.__x=1;//";
      window.__got = null; window.__x = 0; window.probe = (v) => { window.__got = v; };
      document.body.insertAdjacentHTML('beforeend', `<button id="b-old" onclick="probe('${esc(evil)}')">a</button><button id="b-new" onclick="probe('${escJsAttr(evil)}')">b</button>`);
      document.getElementById('b-old').click(); const oldX = window.__x;
      window.__x = 0; window.__got = null;
      document.getElementById('b-new').click();
      return { oldX, newX: window.__x, got: window.__got, evil };
    });
    assert.equal(r.oldX, 1, "nazorat: eski esc() bilan kod bajariladi (sinov to'g'ri ishlayapti)");
    assert.equal(r.newX, 0, "escJsAttr() bilan kod bajarilmaydi");
    assert.equal(r.got, r.evil, "funksiyaga ID aynan o'zi yetib boradi");
  } finally { await browser.close(); }
}

module.exports = {
  name: "P52 — v24.5 audit: onclick ichidagi ID'lar orqali XSS (do'kon, hisobdan chiqarish, B2B, kassa cheklari)",
  cases: [
    { name: "Statik: js/ da onclick ichida esc() qolmagan (escJsAttr)", run: testStatic },
    { name: "Server: do'kon buyurtma ID'si faqat xavfsiz belgilar", run: testServerShopIds },
    { name: "Chromium: escJsAttr — kod bajarilmaydi, ID o'zgarmay yetadi (esc — bajarilardi)", run: testBrowser },
  ],
};
