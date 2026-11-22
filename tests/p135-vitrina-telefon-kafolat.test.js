// P135 — v25.6.10 (egasi): onlayn do'kon — 2 ta telefon, kafolat (3/6/12 oy), bir xil rasm va kategoriya kartalari, Tez aloqa, Do'kon (filiallar).
//  • ikkinchi raqam: do'konda, Tez aloqada (har biriga alohida qo'ng'iroq), filial kartasida, buyurtma formasida (ixtiyoriy), serverdagi buyurtmada
//  • bo'sh ikkinchi raqam — hech qayerda ko'rinmaydi
//  • kafolat: kartochka, mahsulot sahifasi (to'liq texnik kafolat matni), savat, buyurtma; kafolatsiz mahsulotda belgi yo'q
//  • kategoriya kartalari bir xil o'lchamda (4:3), rasmsizida bir xil belgi; mahsulot rasmi — kvadrat, rasmsizida bir xil o'rinbosar
const assert = require('node:assert/strict');
const fs = require('fs');
const { fixture, startShop } = require('./helpers/shop-stub');
const SP = require('../netlify/functions/_lib/shopPublic');
const EXE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const PNG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#ccc"/></svg>';

function fx2(phone2 = '998712000000') {
  const fx = fixture();
  fx.main.products.find((p) => p.id === 1).warrantyM = 12;
  fx.main.products.find((p) => p.id === 100).warrantyM = 6;
  fx.main.products.find((p) => p.id === 2).warrantyM = 7;   // ruxsat etilmagan qiymat — e'tiborsiz
  Object.assign(fx.branch.shop.settings, { phone2, catImg: { Frezalar: 'https://img.test/cat.png' } });
  fx.main.settings.branchCfg = { baza: { type: 'ombor' }, f1: { type: 'filial' } };
  fx.main.settings.branchNames = { f1: 'Sergeli filiali' };
  fx.main.branchStore.f1 = { shop: { settings: { address: 'Sergeli 7-mavze', phone: '93 111 22 33', phone2: '' } } };
  return fx;
}

async function call(S, method, body, qs) {
  const r = await S.fn({ httpMethod: method, body: body ? JSON.stringify(body) : '', headers: {}, queryStringParameters: qs || {} }, {});
  return { status: r.statusCode, j: r.body ? JSON.parse(r.body) : null };
}

async function server() {
  const S = await startShop(fx2());
  try {
    const c = (await call(S, 'GET', null, { s: 'powerful' })).j;
    assert.equal(c.shop.phone, '+998 90 123 45 67'); assert.equal(c.shop.phone2, '+998 71 200 00 00', 'format +998 XX XXX XX XX');
    assert.equal(c.products.find((p) => p.id === 1).warranty, 12);
    assert.equal(c.products.find((p) => p.id === 100).warranty, 6);
    assert.equal(c.products.find((p) => p.id === 2).warranty, null, '7 oy — ruxsat etilmagan');
    assert.equal(c.cats.Frezalar, 'https://img.test/cat.png');
    assert.deepEqual(c.points.map((p) => [p.name, p.phone, p.phone2, p.main]), [['Powerful Group', '+998 90 123 45 67', '+998 71 200 00 00', true], ['Sergeli filiali', '+998 93 111 22 33', '', false]]);
    // buyurtma: ikkinchi raqam va kafolat
    const base = { a: 'order', s: 'powerful', name: 'Aziz', phone: '90 123 45 67', delivery: 'pickup', items: [{ pid: 1, qty: 1 }, { pid: 2, qty: 1 }] };
    const ok = await call(S, 'POST', { ...base, phone2: '+998 97 555 44 33' });
    assert.equal(ok.status, 200);
    const o = S.admin.db.rows.baza.data.shop.orders[0];
    assert.equal(o.cust.phone2, '+998975554433');
    assert.deepEqual(o.items.map((i) => i.warrantyM || null), [12, null], 'kafolat buyurtmada saqlanadi');
    const bad = await call(S, 'POST', { ...base, phone2: '97 55' });
    assert.equal(bad.status, 400); assert.match(bad.j.error, /Qoʻshimcha raqam/);
    const none = await call(S, 'POST', { ...base, phone2: '' });
    assert.equal(none.status, 200); assert.equal(S.admin.db.rows.baza.data.shop.orders[0].cust.phone2, undefined, 'bo\'sh — yozilmaydi');
    assert.equal(SP.fmtPhone('998901234567'), '+998 90 123 45 67');
  } finally { S.close(); }
}

async function browser(width, height, mobile, shotPrefix) {
  const S = await startShop(fx2());
  const { chromium } = require('playwright');
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  try {
    const page = await br.newPage({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: shotPrefix ? 2 : 1 });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://img.test/**', (r) => r.fulfill({ contentType: 'image/svg+xml', body: PNG }));
    await page.goto(`http://127.0.0.1:${S.port}/dokon.html?s=powerful`);
    await page.waitForSelector('.vt-pc');
    // kafolat — kartochkada
    const w = await page.$$eval('.vt-pc', (a) => a.map((c) => (c.querySelector('.vt-war') || {}).textContent || ''));
    assert.ok(w.includes('Kafolat: 12 oy') && w.includes('Kafolat: 6 oy'));
    assert.equal(w.filter(Boolean).length, 2, 'kafolatsiz mahsulotda belgi yo\'q');
    // kategoriya kartalari — bir xil o'lcham, 4:3, rasmsizida bir xil belgi
    const cats = await page.$$eval('.vt-cat', (a) => a.map((c) => { const r = c.getBoundingClientRect(), i = c.querySelector('i').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(i.width / i.height * 100), !!c.querySelector('img'), c.textContent]; }));
    assert.equal(cats.length, 4);
    assert.equal(new Set(cats.map((c) => c[0] + 'x' + c[1])).size, 1, 'hamma karta bir xil o\'lcham: ' + JSON.stringify(cats));
    assert.ok(cats.every((c) => Math.abs(c[2] - 133) <= 2), '4:3');
    assert.equal(cats.filter((c) => c[3]).length, 1, 'faqat Frezalar rasmli');
    // mahsulot rasmi — hammasi bir xil kvadrat
    const pics = await page.$$eval('.vt-grid .vt-pic', (a) => a.map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); }));
    assert.equal(new Set(pics).size, 1); assert.match(pics[0], /^(\d+)x\1$/);
    if (shotPrefix) await page.screenshot({ path: shotPrefix + '-bosh.png' });
    // kategoriya kartasini bosish — filtr
    await page.click('.vt-cat[data-catc="Frezalar"]');
    assert.equal(await page.$$eval('#vt-grid .vt-pc', (a) => a.length), 2);
    await page.click('.vt-cat[data-catc="Frezalar"]');
    // Tez aloqa — ikkala raqam, alohida qo'ng'iroq tugmasi
    if (mobile) { assert.ok(await page.isVisible('.vt-nav')); await page.click('.vt-nav [data-nav="contact"]'); }
    else { assert.ok(!(await page.isVisible('.vt-nav')), 'kompyuterda pastki menyu yo\'q'); await page.click('#vt-callb'); }
    const calls = await page.$$eval('.vt-sheet .vt-call', (a) => a.map((c) => [c.querySelector('b').textContent, c.querySelector('a').getAttribute('href')]));
    assert.deepEqual(calls, [['+998 90 123 45 67', 'tel:+998901234567'], ['+998 71 200 00 00', 'tel:+998712000000']]);
    if (shotPrefix) await page.waitForTimeout(400); if (shotPrefix) await page.screenshot({ path: shotPrefix + '-aloqa.png' });
    await page.click('[data-close]');
    // Do'kon — do'kon va filial kartalari, filialda ikkinchi raqam bo'sh — ko'rinmaydi
    if (mobile) {
      await page.click('.vt-nav [data-nav="store"]');
      const pts = await page.$$eval('.vt-pt', (a) => a.map((p) => [p.querySelector('b').textContent, p.querySelectorAll('.vt-call').length]));
      assert.deepEqual(pts, [['Powerful Group', 2], ['Sergeli filiali', 1]]);
      if (shotPrefix) await page.waitForTimeout(400); if (shotPrefix) await page.screenshot({ path: shotPrefix + '-dokon.png' });
      await page.click('[data-close]');
    }
    // footer — ikkala raqam
    assert.equal(await page.$$eval('#vt-ft a[href^="tel:"]', (a) => a.length), 2);
    // mahsulot sahifasi — kafolat bloki
    await page.evaluate(() => { location.hash = ''; });
    await page.click('.vt-pc:has(.vt-war) [data-open]');
    await page.waitForSelector('.vt-warbox');
    const wb = await page.$eval('.vt-warbox', (e) => e.textContent);
    assert.match(wb, /Rasmiy kafolat/); assert.match(wb, /Kafolat: (12|6) oy/); assert.match(wb, /taʼmirlanadi/); assert.match(wb, /ehtiyot qismlar/);
    if (shotPrefix) await page.waitForTimeout(400); if (shotPrefix) await page.screenshot({ path: shotPrefix + '-mahsulot.png' });
    await page.click('[data-addp]');
    // savat — kafolat qatorda, ikkinchi raqam ixtiyoriy
    await page.click('#vt-cartb');
    assert.equal(await page.$$eval('.vt-ci .vt-war', (a) => a.length), 1);
    await page.fill('#vt-form [name=name]', 'Aziz'); await page.fill('#vt-form [name=phone]', '901234567');
    await page.fill('#vt-form [name=phone2]', '9755');
    assert.equal(await page.$eval('#vt-form [name=phone2]', (e) => e.value), '+998 97 55');
    await page.click('#vt-send');
    assert.match(await page.$eval('#vt-err', (e) => e.textContent), /Qoʻshimcha raqam/);
    await page.fill('#vt-form [name=phone2]', '975554433');
    assert.equal(await page.$eval('#vt-form [name=phone2]', (e) => e.value), '+998 97 555 44 33');
    if (shotPrefix) await page.waitForTimeout(400); if (shotPrefix) await page.screenshot({ path: shotPrefix + '-savat.png', fullPage: false });
    await page.click('#vt-send'); await page.waitForSelector('.vt-ok');
    assert.match(await page.$eval('.vt-ok', (e) => e.textContent), /Kafolat: (12|6) oy/);
    const o = S.admin.db.rows.baza.data.shop.orders[0];
    assert.equal(o.cust.phone2, '+998975554433');
    assert.ok(o.items[0].warrantyM === 12 || o.items[0].warrantyM === 6);
    // gorizontal siljish yo'q
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
  } finally { await br.close(); S.close(); }
}

// ikkinchi raqam bo'sh — hech qayerda ko'rinmaydi
async function noSecond() {
  const S = await startShop(fx2(''));
  const { chromium } = require('playwright');
  const br = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  try {
    const page = await br.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.route('https://img.test/**', (r) => r.fulfill({ contentType: 'image/svg+xml', body: PNG }));
    await page.goto(`http://127.0.0.1:${S.port}/dokon.html?s=powerful`);
    await page.waitForSelector('.vt-pc');
    assert.equal(await page.$$eval('#vt-ft a[href^="tel:"]', (a) => a.length), 1);
    await page.click('.vt-nav [data-nav="contact"]');
    assert.equal(await page.$$eval('.vt-sheet .vt-call', (a) => a.length), 1);
    assert.doesNotMatch(await page.$eval('.vt-sheet', (e) => e.textContent), /Qoʻshimcha raqam/);
  } finally { await br.close(); S.close(); }
}

module.exports = { name: "P135 — Onlayn do'kon: 2 ta telefon, kafolat, bir xil rasm va kategoriyalar", cases: [
  { name: 'server: phone2 formati, kafolat 3/6/12, kategoriya rasmlari, filiallar, buyurtmada phone2 va kafolat', run: server },
  { name: 'telefon: kafolat belgisi, bir xil kartalar, Tez aloqa (2 raqam), Doʻkon, savat phone2, buyurtma', run: () => browser(390, 844, true, process.env.P135_SHOT_M) },
  { name: 'kompyuter: pastki menyu yoʻq, sarlavhada Tez aloqa, xuddi shu oqim', run: () => browser(1366, 900, false, process.env.P135_SHOT_D) },
  { name: "ikkinchi raqam bo'sh — ko'rinmaydi", run: noSecond },
] };
