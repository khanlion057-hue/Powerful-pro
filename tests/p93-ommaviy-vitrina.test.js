// P93 — v25.3: OMMAVIY VITRINA (dokon.html + shop-public). Egasi namunasi asosida, haqiqiy ma'lumot bilan:
//  • katalog — faqat yoqilgan do'kon; arxiv / tugagan / narxsiz — yo'q; tannarx, partiya, ustama — javobda YO'Q
//  • narx serverda: chakana (tannarx + ustama, butun $) → so'mda 1 000 ga yaxlit; chegirma — eski narx bilan
//  • buyurtma: brauzer narxi e'tiborsiz; telefon, miqdor ≤ qoldiq, kuryer — manzil; bot tuzog'i — jim; bepul yetkazish chegarasi;
//    versiya ziddiyatida qayta urinadi; raqam (seq) oshadi; holat — faqat maxfiy kalit bilan
//  • brauzerda: qidiruv, arra tanlash yordamchisi, savat → buyurtma (jami savat bilan bir xil) → «Buyurtmalarim»
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { fixture, fakeAdmin, startShop } = require('./helpers/shop-stub');
const SP = require('../netlify/functions/_lib/shopPublic');

async function call(S, method, body, qs) {
  const r = await S.fn({ httpMethod: method, body: body ? JSON.stringify(body) : '', headers: {}, queryStringParameters: qs || {} }, {});
  return { status: r.statusCode, headers: r.headers || {}, j: r.body ? JSON.parse(r.body) : null };
}

async function testCatalog() {
  const S = await startShop();
  try {
    const r = await call(S, 'GET', null, { s: 'powerful' });
    assert.equal(r.status, 200); assert.match(r.headers['Cache-Control'], /max-age=30/);
    const c = r.j, raw = JSON.stringify(c);
    assert.equal(c.shop.name, 'Powerful Group'); assert.equal(c.shop.cur, 'UZS'); assert.equal(c.shop.fee, 30000); assert.equal(c.shop.freeMin, 3000000);
    assert.equal(c.products.length, 16, '12 tig\' + 4 asbob; arxiv va tugagan — yo\'q');
    assert.ok(!c.products.some((p) => p.id === 200 || p.id === 201));
    for (const bad of ['costUsd', 'cost', 'markupPct', 'batches', 'sold', 'profit', 'tk', 'orders']) assert.ok(!raw.includes('"' + bad + '"'), `javobda ${bad} yo'q`);
    // Narx: Ø110 30T — tannarx 10 + 11 + 3 = 24$, ustama 25% → 30$ → 30 × 12 650 = 379 500 → 380 000 so'm
    const p1 = c.products.find((p) => p.id === 1);
    assert.equal(p1.price, 380000); assert.equal(p1.old, null); assert.equal(p1.stock, 14);
    assert.ok(c.products.every((p) => p.price % 1000 === 0), 'so\'mda 1 000 ga yaxlit');
    // Chegirma (pid 7: 40$ ← odatiy 64$): eski narx ko'rinadi
    const p7 = c.products.find((p) => p.id === 7);
    assert.equal(p7.price, 506000); assert.ok(p7.old > p7.price);
    // Yopiq do'kon / noto'g'ri slug
    assert.equal((await call(S, 'GET', null, { s: 'yo"q' })).status, 404);
    S.admin.db.rows.baza.data.shop.settings.enabled = false;
    assert.equal((await call(S, 'GET', null, { s: 'powerful' })).status, 404, 'o\'chirilgan do\'kon — ochilmaydi');
  } finally { S.close(); }
}

async function testOrder() {
  const S = await startShop();
  try {
    const base = { a: 'order', s: 'powerful', name: 'Aziz', phone: '90 123 45 67', delivery: 'pickup', items: [{ pid: 1, qty: 2, priceUsd: 0.01 }] };
    const ok = await call(S, 'POST', base);
    assert.equal(ok.status, 200); assert.equal(ok.j.no, 42); assert.equal(ok.j.total, 760000, 'brauzer narxi e\'tiborsiz — server narxi');
    assert.match(ok.j.tk, /^[\w-]{12}$/);
    const sh = S.admin.db.rows.baza.data.shop, o = sh.orders[0];
    assert.equal(sh.seq, 42); assert.equal(o.source, 'site'); assert.equal(o.status, 'new'); assert.equal(o.cust.phone, '+998901234567');
    assert.equal(o.items[0].priceUsd * 12650, 380000); assert.equal(o.deliveryUsd, 0);
    // Xatolar
    const bad = async (patch, re) => { const r = await call(S, 'POST', { ...base, ...patch }); assert.equal(r.status, 400, JSON.stringify(patch)); assert.match(r.j.error, re); };
    await bad({ phone: '12345' }, /Telefon/);
    await bad({ name: 'A' }, /Ism/);
    await bad({ items: [] }, /Savat/);
    await bad({ items: [{ pid: 6, qty: 3 }] }, /2 ta qoldi/);
    await bad({ items: [{ pid: 200, qty: 1 }] }, /sotuvda yo/);
    await bad({ items: [{ pid: 1, qty: 1.5 }] }, /Miqdor/);
    await bad({ items: [{ pid: 1, qty: 1 }, { pid: 1, qty: 1 }] }, /takror/);
    await bad({ delivery: 'courier', address: '' }, /manzil/i);
    // Bot tuzog'i — jim, yozilmaydi
    const hp = await call(S, 'POST', { ...base, hp: 'spam' });
    assert.equal(hp.status, 200); assert.equal(hp.j.no, 0); assert.equal(S.admin.db.rows.baza.data.shop.orders.length, 1);
    // Kuryer: 3 000 000 dan kam — 30 000; ko'p — bepul
    const c1 = await call(S, 'POST', { ...base, delivery: 'courier', address: 'Chilonzor 5', items: [{ pid: 1, qty: 1 }] });
    assert.equal(c1.j.total, 380000 + 30000);
    const c2 = await call(S, 'POST', { ...base, delivery: 'courier', address: 'Chilonzor 5', items: [{ pid: 9, qty: 7 }] });
    assert.ok(c2.j.total >= 3000000 && c2.j.total % 1000 === 0, 'bepul yetkazish');
    // Versiya ziddiyati — qayta o'qib yozadi
    S.admin.db.conflictOnce = true;
    const c3 = await call(S, 'POST', base);
    assert.equal(c3.status, 200); assert.equal(c3.j.no, 45);
    // Holat: faqat kalit bilan
    const st = await call(S, 'POST', { a: 'status', s: 'powerful', list: [{ id: ok.j.id, tk: ok.j.tk }, { id: c1.j.id, tk: 'x'.repeat(12) }] });
    assert.equal(st.j.orders.length, 1); assert.equal(st.j.orders[0].label, 'Qabul qilindi'); assert.equal(st.j.orders[0].total, 760000);
    assert.equal((await call(S, 'POST', { a: 'nimadir' })).status, 400);
    // v25.6.10: aloqa uzilib qayta yuborilsa (o'sha kalit) — ikkinchi buyurtma yaratilmaydi
    const n0 = S.admin.db.rows.baza.data.shop.orders.length;
    const k1 = await call(S, 'POST', { ...base, k: 'okey-test-0001' }), k2 = await call(S, 'POST', { ...base, k: 'okey-test-0001' });
    assert.equal(k2.j.no, k1.j.no); assert.equal(k2.j.id, k1.j.id); assert.equal(k2.j.total, k1.j.total);
    assert.equal(S.admin.db.rows.baza.data.shop.orders.length, n0 + 1, 'faqat bitta buyurtma');
  } finally { S.close(); }
}

async function testBrowser() {
  const S = await startShop();
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${S.port}/dokon.html?s=powerful`);
    await page.waitForSelector('.vt-pc');
    assert.equal(await page.$$eval('.vt-pc', (a) => a.length), 16);
    // Qidiruv: «Ø250 80T» → bitta
    await page.fill('#vt-q', 'ø250 80t'); await page.waitForTimeout(400);
    assert.equal(await page.$$eval('#vt-grid .vt-pc', (a) => a.length), 1);
    await page.fill('#vt-q', ''); await page.waitForTimeout(300);
    // Arra tanlash yordamchisi: bosh sahifada yo'q, faqat «Arra tigʻlari» bo'limida; Alyuminiy → 2 ta
    assert.equal(await page.isVisible('#vt-finder'), false, 'bosh sahifada yordamchi yo\'q');
    assert.equal(await page.isVisible('#vt-perks'), false, 'ortiqcha afzalliklar bloki yo\'q');
    await page.click('.vt-cat[data-catc="Arra tigʻlari"]'); await page.waitForTimeout(200);
    assert.equal(await page.isVisible('#vt-finder'), true);
    await page.click('#vt-fmat button[data-v="Alyuminiy"]'); await page.waitForTimeout(200);
    assert.equal(await page.$$eval('#vt-grid .vt-pc', (a) => a.length), 2);
    await page.evaluate(() => window.vtHome());
    // Savat → buyurtma: oynadagi jami = serverdagi jami
    await page.click('.vt-add'); await page.click('.vt-add');
    assert.equal(await page.$eval('#vt-cartc', (e) => e.textContent), '2');
    await page.click('#vt-cartb');
    const cartTotal = await page.$eval('.vt-tot.f span:last-child', (e) => e.textContent);
    await page.fill('#vt-form [name=name]', 'Aziz'); await page.fill('#vt-form [name=phone]', '901234567');
    assert.equal(await page.$eval('#vt-form [name=phone]', (e) => e.value), '+998 90 123 45 67', 'telefon niqobi');
    // v25.6.10: savatda + bosilganda yozilganlar o'chmaydi
    await page.fill('#vt-form [name=note]', 'Qoʻngʻiroq qiling'); await page.click('[data-cinc]'); await page.click('[data-cdec]');
    assert.equal(await page.$eval('#vt-form [name=name]', (e) => e.value), 'Aziz', 'ism saqlandi');
    assert.equal(await page.$eval('#vt-form [name=phone]', (e) => e.value), '+998 90 123 45 67', 'telefon saqlandi');
    assert.equal(await page.$eval('#vt-form [name=note]', (e) => e.value), 'Qoʻngʻiroq qiling', 'izoh saqlandi');
    await page.click('#vt-send'); await page.waitForSelector('.vt-ok');
    assert.match(await page.$eval('.vt-ok', (e) => e.textContent), new RegExp('Jami: ' + cartTotal.replace(/\s/g, '\\s')));
    assert.equal(await page.$eval('#vt-cartc', (e) => e.textContent), '0', 'savat tozalandi');
    await page.click('[data-orders]'); await page.waitForSelector('.vt-badge');
    assert.match(await page.$eval('#vt-ol', (e) => e.textContent), /#42.*Qabul qilindi/);
    // Sevimlilar va mahsulot oynasi (havola bilan)
    await page.click('[data-close]'); await page.click('.vt-fav');
    assert.equal(await page.$eval('#vt-favc', (e) => e.textContent), '1');
    await page.goto(`http://127.0.0.1:${S.port}/dokon.html?s=powerful&from=share#p=3`);   // ulashilgan havola — yangi ochilish await page.waitForSelector('.vt-sheet h2');
    assert.match(await page.$eval('.vt-sheet h2', (e) => e.textContent), /Ø180/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); S.close(); }
}

// v25.5 — rasm uslubi: kartochkada rasm to'liq, nuqtalar (bosilsa rasm almashadi, oyna ochilmaydi); oynada rasm ustida kichik rasmlar tasmasi, nom + izoh
async function testImages() {
  const fx = fixture();
  fx.main.products[0].images = ['https://img.test/a.png', 'https://img.test/b.png', 'https://img.test/c.png'];
  fx.main.products[1].image = 'https://img.test/d.png';
  const S = await startShop(fx);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://img.test/**', (r) => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#ccc"/></svg>' }));
    await page.goto(`http://127.0.0.1:${S.port}/dokon.html?s=powerful`);
    await page.waitForSelector('.vt-pc');
    const multi = page.locator('.vt-pic.multi');
    assert.equal(await multi.count(), 1, 'nuqtalar — faqat bir nechta rasmli mahsulotda');
    assert.equal(await multi.locator('.vt-dots i').count(), 3);
    assert.equal(await page.locator('.vt-pic.has').count(), 2);
    assert.ok(await page.locator('.vt-pic:not(.has) svg').count() > 0, 'rasmsiz — bir xil o\'rinbosar');
    assert.equal(await page.locator('.vt-pic:not(.has) svg.vt-noimg').count(), await page.locator('.vt-pic:not(.has)').count(), 'rasmsiz — hammasida bir xil o\'rinbosar');
    const fill = await multi.evaluate((el) => { const a = el.getBoundingClientRect(), b = el.querySelector('img').getBoundingClientRect(); return Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1 && getComputedStyle(el.querySelector('img')).objectFit; });
    // v25.6.10 (egasi): rasm — bir xil kvadrat, oq fonda, markazda, chetlarida bo'shliq (kesilmaydi)
    assert.equal(fill, 'contain', "rasm kvadrat ichida to'liq ko'rinadi (kesilmaydi)");
    assert.equal(await multi.evaluate((el) => { const r = el.getBoundingClientRect(); return Math.round(r.width) === Math.round(r.height); }), true, 'kvadrat');
    await multi.locator('.vt-dots i').nth(2).click();
    assert.match(await multi.locator('img').getAttribute('src'), /c\.png$/);
    assert.equal(await multi.locator('.vt-dots i.on').count(), 1);
    assert.equal(await page.locator('.vt-sheet h2').count(), 0, 'nuqta bosilganda oyna ochilmaydi');
    await multi.click();
    await page.waitForSelector('.vt-sheet h2');
    assert.equal(await page.locator('.vt-hero .vt-thumbs button').count(), 3);
    const over = await page.evaluate(() => { const h = document.querySelector('.vt-big').getBoundingClientRect(), t = document.querySelector('.vt-hero .vt-thumbs').getBoundingClientRect(); return t.top > h.top && t.bottom <= h.bottom; });
    assert.ok(over, 'kichik rasmlar — katta rasm ustida, pastida');
    await page.locator('.vt-hero .vt-thumbs button').nth(1).click();
    assert.match(await page.locator('#vt-bigimg img').getAttribute('src'), /b\.png$/);
    assert.equal(await page.locator('.vt-hero .vt-thumbs button.on').count(), 1);
    assert.match(await page.locator('.vt-sub').textContent(), /PWR/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); S.close(); }
}

async function testStatic() {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'dokon.html'), 'utf8');
  assert.match(html, /<script src="js\/vitrina\.js"><\/script>/); assert.ok(!/config\.js|supabase/i.test(html), 'vitrina bazaga to\'g\'ridan ulanmaydi');
  assert.match(fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8'), /from = "\/dokon"\s*to = "\/dokon\.html"/);
  assert.match(fs.readFileSync(path.join(root, 'js', 'dokon.js'), 'utf8'), /\/dokon\?s=\$\{encodeURIComponent\(shopCfg\(\)\.slug\)\}/);
  assert.equal(SP.normPhone('+998 (90) 123-45-67'), '+998901234567'); assert.equal(SP.normPhone('123'), null);
  assert.equal(SP.slugify('Powerful Group'), 'powerful-group');
}

module.exports = {
  name: 'P93 — Ommaviy vitrina (onlayn doʻkon)',
  cases: [
    { name: "Katalog: faqat yoqilgan do'kon, tannarx yo'q, narx serverda (1 000 ga yaxlit), chegirma, arxiv/tugagan — yo'q", run: testCatalog },
    { name: "Buyurtma: server narxi, tekshiruvlar, bot tuzog'i, yetkazish narxi va bepul chegara, versiya ziddiyati, holat — kalit bilan", run: testOrder },
    { name: "Brauzer: qidiruv, arra tanlash yordamchisi, savat → buyurtma (jami bir xil), telefon niqobi, Buyurtmalarim, sevimlilar, havola", run: testBrowser },
    { name: "Rasmlar: kartochkada to'liq rasm va nuqtalar, oynada rasm ustida kichik rasmlar tasmasi, nom + izoh", run: testImages },
    { name: "Statik: sahifa bazaga to'g'ridan ulanmaydi, /dokon yo'naltirish, admin havolasi", run: testStatic },
  ],
};
