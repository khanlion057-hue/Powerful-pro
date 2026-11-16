// P94 — v25.4 (egasi talabi):
//  A) SAVDO OYNASI — «Rasm» almashtirgichi: Chakana/Optom, UZS/USD bilan BITTA CHIZIQDA (tor ekranda ham);
//     yoqilsa — «Mahsulotlar» oynasidagi kabi rasmli kartalar (rasmi yo'q mahsulotga belgi), o'chirilsa — faqat nomlar;
//     tanlov qurilmada saqlanadi; kartadan savatga qo'shish ishlaydi.
//  B) DILLER «PUL YUBORISH» xatolari: yuklash xatosida cheksiz so'rov yo'q (+ «Qayta urinish»); kurs yo'q — so'm turlari
//     o'chiq, dollar tanlanadi; qarz yo'q — tushunarli holat; xatoda summa va izoh SAQLANADI; «To'liq qarz» tugmasi.
const assert = require('node:assert/strict');
const { openPage, DEALER_TABLES, BP_DATA } = require('./p4-responsive.test.js')._helpers;

const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function testPosImages() {
  for (const width of [390, 340]) {
    const { browser, page, errors } = await openPage('index.html', { width, height: 844, mobile: true, admin: true });
    try {
      await page.evaluate((img) => { try { localStorage.removeItem('fw_pos_img'); } catch (_) {} S.products[0].image = img; go('savdo'); }, IMG);
      await page.waitForSelector('.pos-segs');
      // Bitta chiziq: yuqori qatordagi barcha boshqaruvlar bir xil balandlikda (o'ralmagan)
      const row = await page.evaluate(() => { const t = document.querySelector('.pos-top'); const tops = [...t.querySelectorAll('.pos-seg, .pos-img-btn, .pos-ib')].map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2)); return { tops, w: t.scrollWidth, cw: document.documentElement.clientWidth }; });
      assert.ok(Math.max(...row.tops) - Math.min(...row.tops) <= 3, `${width}px: yuqori qator bitta chiziqda (${row.tops.join(',')})`);
      assert.ok(await page.$('.pos-img-btn'), '«Rasm» tugmasi bor');
      assert.equal(await page.$eval('.pos-img-btn', (b) => b.getAttribute('aria-pressed')), 'false', 'standart — o\'chiq (faqat nomlar)');
      assert.ok((await page.$$('#pos-list .pos-row')).length > 0); assert.equal((await page.$$('#pos-list .pos-card')).length, 0);
      // Yoqish → rasmli kartalar
      await page.click('.pos-img-btn'); await page.waitForSelector('#pos-list .pos-card');
      assert.equal(await page.$eval('.pos-img-btn', (b) => b.getAttribute('aria-pressed')), 'true');
      const cards = await page.evaluate(() => ({ n: document.querySelectorAll('#pos-list .pos-card').length, rows: document.querySelectorAll('#pos-list .pos-row').length,
        imgs: document.querySelectorAll('#pos-list .pos-card img').length, ph: document.querySelectorAll('#pos-list .pos-card .pos-card-ph').length,
        cols: new Set([...document.querySelectorAll('#pos-list .pos-card')].map((c) => Math.round(c.getBoundingClientRect().left))).size,
        hs: document.documentElement.scrollWidth > innerWidth + 1 }));
      assert.equal(cards.rows, 0); assert.ok(cards.n >= 2); assert.equal(cards.imgs, 1, 'rasmi bor mahsulot — rasm'); assert.equal(cards.ph, cards.n - 1, 'rasmi yo\'q — belgi');
      assert.ok(cards.cols >= 2, 'telefonda kamida 2 ustun'); assert.equal(cards.hs, false, 'gorizontal surilish yo\'q');
      // Kartadan savatga
      await page.click('#pos-list .pos-card .pos-card-main');
      assert.equal(await page.evaluate(() => S.cart.length), 1, 'kartani bosish — savatga');
      assert.ok(await page.$('#pos-list .pos-card .pos-step'), 'savatdagi kartada miqdor boshqaruvi');
      // Saqlanadi
      assert.equal(await page.evaluate(() => localStorage.getItem('fw_pos_img')), '1');
      await page.evaluate(() => { go('dashboard'); go('savdo'); }); await page.waitForSelector('#pos-list .pos-card');
      await page.click('.pos-img-btn'); await page.waitForSelector('#pos-list .pos-row');
      assert.equal(await page.evaluate(() => localStorage.getItem('fw_pos_img')), '0');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
}

const dealerTables = (debt) => ({ ...DEALER_TABLES, dealers: { ...DEALER_TABLES.dealers, debt_usd: debt, debt } });
async function openDealerPay(debt, handler) {
  const o = await openPage('diller.html', { width: 390, height: 844, mobile: true, loggedIn: true, tables: dealerTables(debt) });
  o.calls = [];
  await o.page.route('**/.netlify/functions/dealer-pay', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}'); o.calls.push(body);
    const r = await handler(body, o.calls.length);
    return r === 'abort' ? route.abort('failed') : route.fulfill({ status: r.status || 200, contentType: 'application/json', body: JSON.stringify(r.body) });
  });
  await o.page.evaluate((d) => { ME.debt_usd = d; DLPAY.loaded = false; DLPAY.list = []; DLPAY.rate = null; DLPAY.err = ''; dlSwitchTab('pay'); }, debt);
  await o.page.waitForTimeout(700);
  return o;
}

async function testDealerPay() {
  // 1) Yuklash xatosi — cheksiz so'rov yo'q, «Qayta urinish» bor
  let o = await openDealerPay(100, async (b, n) => (n <= 1 ? { status: 500, body: { error: 'Server xatosi' } } : { body: { ok: true, notices: [], rate: 12500 } }));
  try {
    await o.page.waitForTimeout(1200);
    assert.equal(o.calls.length, 1, `xatoda so'rov takrorlanmaydi (${o.calls.length} ta ketdi)`);
    assert.match(await o.page.$eval('#dl-content, .dl-content, body', (e) => e.innerText), /Server xatosi/);
    await o.page.click('#dlp-retry'); await o.page.waitForTimeout(500);
    assert.equal(o.calls.length, 2); assert.match(await o.page.$eval('.dlp-rate', (e) => e.textContent), /12 500/);
    // 2) «To'liq qarz»: so'mda — qarzdan oshmaydigan summa; dollarda — aynan qarz
    await o.page.click('#dlp-full');
    const full = await o.page.evaluate(() => ({ v: +document.getElementById('dlp-amt').value, usd: dlPayUsd(+document.getElementById('dlp-amt').value), conv: document.getElementById('dlp-conv').textContent }));
    assert.equal(full.v, 1250000); assert.equal(full.usd, 100); assert.doesNotMatch(full.conv, /oshib/);
    // 3) Yuborishda xato — summa va izoh SAQLANADI
    await o.page.fill('#dlp-amt', '500000'); await o.page.fill('#dlp-note', 'Akam orqali');
    o.calls.length = 0;
    await o.page.unroute('**/.netlify/functions/dealer-pay');
    await o.page.route('**/.netlify/functions/dealer-pay', (route) => { o.calls.push(JSON.parse(route.request().postData())); return route.abort('failed'); });
    await o.page.click('#dlp-btn'); await o.page.waitForTimeout(600);
    assert.deepEqual(await o.page.evaluate(() => [document.getElementById('dlp-amt').value, document.getElementById('dlp-note').value, document.getElementById('dlp-btn').disabled]), ['500000', 'Akam orqali', false], 'xatodan keyin yozilganlar joyida, tugma faol');
    const key1 = o.calls[0].idemKey;
    // turni almashtirganda ham izoh saqlanadi
    await o.page.click('.dlp-pay-types button:nth-child(2)');
    assert.equal(await o.page.$eval('#dlp-note', (e) => e.value), 'Akam orqali', 'tur almashganda izoh saqlanadi');
    await o.page.click('.dlp-pay-types button:nth-child(1)');
    // qayta bosish — o'sha kalit; muvaffaqiyat — maydonlar tozalanadi, qarz yangilanadi
    await o.page.unroute('**/.netlify/functions/dealer-pay');
    await o.page.route('**/.netlify/functions/dealer-pay', (route) => { const b = JSON.parse(route.request().postData()); o.calls.push(b);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rate: 12500, dealerDebtUsd: 60, dealerTotalPaidUsd: 40, notice: { id: 9, payType: 'cash_uzs', currency: 'UZS', amount: 500000, amountUsd: 40, rate: 12500, status: 'pending', createdAt: new Date().toISOString() } }) }); });
    await o.page.click('#dlp-btn'); await o.page.waitForTimeout(600);
    assert.equal(o.calls[1].idemKey, key1, 'qayta bosishda o\'sha kalit (ikki marta yozilmaydi)');
    assert.deepEqual(await o.page.evaluate(() => [document.getElementById('dlp-amt').value, document.getElementById('dlp-note').value, ME.debt_usd, DLPAY.list.length]), ['', '', 60, 1]);
    assert.deepEqual(o.errors, []);
  } finally { await o.browser.close(); }

  // 4) Kurs yo'q — so'm turlari o'chiq, dollar tanlangan
  o = await openDealerPay(50, async () => ({ body: { ok: true, notices: [{ id: 1, payType: 'card', currency: 'UZS', amount: 100000, amountUsd: 8, rate: 12500, status: 'nomalum', createdAt: new Date().toISOString() }], rate: null } }));
  try {
    const t = await o.page.evaluate(() => [...document.querySelectorAll('.dlp-pay-types button')].map((b) => [b.disabled, b.getAttribute('aria-checked')]));
    assert.deepEqual(t, [[true, 'false'], [true, 'false'], [false, 'true']], 'kurs yo\'q: naqd so\'m va karta o\'chiq, naqd $ tanlangan');
    assert.ok(await o.page.$('.dl-prow'), 'noma\'lum holatli yozuv ham ro\'yxatni buzmaydi');
    assert.deepEqual(o.errors, []);
  } finally { await o.browser.close(); }

  // 5) Qarz yo'q — forma o'rniga tushunarli holat
  o = await openDealerPay(0, async () => ({ body: { ok: true, notices: [], rate: 12500 } }));
  try {
    assert.equal(await o.page.$('#dlp-btn'), null, 'qarz yo\'q — yuborish tugmasi yo\'q');
    assert.match(await o.page.$eval('.dlp-nodebt', (e) => e.textContent), /Qarzingiz yoʻq/);
    assert.deepEqual(o.errors, []);
  } finally { await o.browser.close(); }
}

module.exports = {
  name: 'P94 — Savdo oynasi «Rasm» rejimi; diller «Pul yuborish» tuzatishlari',
  cases: [
    { name: "Savdo: «Rasm» tugmasi bitta chiziqda (390 va 340 px), rasmli kartalar / faqat nomlar, kartadan savatga, tanlov saqlanadi", run: testPosImages },
    { name: "Diller pul yuborish: xatoda so'rov takrorlanmaydi + qayta urinish; to'liq qarz; xatoda maydonlar saqlanadi, o'sha kalit; kurs yo'q; qarz yo'q", run: testDealerPay },
  ],
};
