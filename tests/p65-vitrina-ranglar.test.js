// P65 — v25.6: vitrinada RANGLAR (variantlar). Spec: docs/SPEC-RANGLAR.md
// Har rang — o'z SKU/narx/qoldig'iga ega mahsulot yozuvi; `vgroup` bo'yicha bitta kartaga birlashadi.
const assert = require('node:assert/strict');
const { openPage } = require('./p63-vitrina.test.js');

const SEED = () => {
  S.products.length = 0; S.batches.length = 0;   // faqat shu sinov mahsulotlari
  const mk = (id, sku, color, hex, cost, qty, sold, extra) => {
    S.products.push(Object.assign({ id, sku, name: 'Mini 3 kolonka', brand: 'Yandex', cat: 'Kolonkalar', desc: 'Aqlli kolonka, Bluetooth 5.3', unit: 'dona', minStock: 2, markupPct: 30, optMarkupPct: 15,
      vgroup: 'mini3', color: { name: color, hex }, images: [1, 2].map(n => `https://img.test/${sku}-${n}.png`), image: `https://img.test/${sku}-1.png`, attrs: { 'Korpus rangi': color } }, extra || {}));
    S.batches.push({ id: 'cb' + id, pid: id, qty, sold, costUsd: cost, date: '2026-10-01', status: 'active' });
  };
  mk(400, 'M3-PINK', 'Pushti', '#f2a7c3', 20, 10, 0, { images: [1, 2, 3, 4, 5].map(n => `https://img.test/M3-PINK-${n}.png`), video: 'https://img.test/pink.mp4' });
  mk(401, 'M3-BLACK', 'Qora', '#111111', 30, 5, 0);
  mk(402, 'M3-BLUE', 'Koʻk', '#3b82f6', 20, 5, 5);   // tugagan
  S.products.push({ id: 410, sku: 'OLD-1', name: 'Eski mahsulot', cat: 'Asbob', unit: 'dona', minStock: 2, markupPct: 30, optMarkupPct: 15 });
  S.batches.push({ id: 'cb410', pid: 410, qty: 8, sold: 0, costUsd: 5, date: '2026-10-02', status: 'active' });
  shopData().settings.enabled = true;
  go('dokon'); dkOpenStorefront();
};
async function open(w, h, mobile) {
  const o = await openPage('index.html', { width: w, height: h, mobile, admin: true });
  await o.page.evaluate(SEED);
  return o;
}
const CARD = '#sf-grid .sf-card[data-vg="mini3"]';

async function testCard() {
  const { browser, page, errors } = await open(390, 844, true);
  try {
    const a = await page.evaluate((CARD) => {
      const cards = document.querySelectorAll('#sf-grid .sf-card'), c = document.querySelector(CARD), sw = [...c.querySelectorAll('.sf-sw [role=radio]')];
      return { cards: cards.length, groupCards: document.querySelectorAll(CARD).length, sw: sw.map(b => ({ on: b.classList.contains('on'), ck: b.getAttribute('aria-checked'), dis: b.disabled, lab: b.getAttribute('aria-label'), bg: b.style.getPropertyValue('--sw') })),
        rg: !!c.querySelector('.sf-sw[role=radiogroup]'), img: c.querySelector('.sf-img img').getAttribute('src'), lazy: c.querySelector('.sf-img img').getAttribute('loading'), price: c.querySelector('.sf-price').textContent.trim(),
        attrs: c.querySelector('.sf-attrs').textContent, desc: c.querySelector('.sf-desc').textContent, go: !!c.querySelector('.sf-go[aria-label]'), h: c.getBoundingClientRect().height,
        pillW: sw[0].getBoundingClientRect().width, dotW: sw[1].getBoundingClientRect().width,
        legacySw: document.querySelector('#sf-grid .sf-card[data-pid="410"] .sf-sw') };
    }, CARD);
    assert.equal(a.cards, 2, 'guruh — bitta karta + eski mahsulot');
    assert.equal(a.groupCards, 1);
    assert.equal(a.sw.length, 3); assert.ok(a.rg, 'radiogroup');
    assert.deepEqual(a.sw.map(x => x.on), [true, false, false], 'birinchi mavjud rang tanlangan');
    assert.equal(a.sw[0].ck, 'true'); assert.match(a.sw[0].lab, /Rang: Pushti/);
    assert.equal(a.sw[0].bg, '#f2a7c3');
    assert.ok(a.pillW > a.dotW * 1.5, 'tanlangan rang — choʻziq pill');
    assert.equal(a.sw[2].dis, true, 'tugagan rang bosilmaydi'); assert.match(a.sw[2].lab, /Tugagan/);
    assert.match(a.img, /M3-PINK-1/); assert.equal(a.lazy, 'lazy');
    assert.match(a.attrs, /Korpus rangi: Pushti/); assert.match(a.desc, /Aqlli kolonka/); assert.ok(a.go, '«›» tugmasi');
    assert.equal(a.legacySw, null, 'variantsiz mahsulotda nuqtalar yoʻq');

    // rang almashishi: rasm, narx, maydon; balandlik o'zgarmaydi
    await page.click(`${CARD} .sf-sw [data-pid="401"]`);
    const b = await page.evaluate((CARD) => { const c = document.querySelector(CARD); return { img: c.querySelector('.sf-img img').getAttribute('src'), fade: c.querySelector('.sf-img').classList.contains('sf-fade'), price: c.querySelector('.sf-price').textContent.trim(),
      attrs: c.querySelector('.sf-attrs').textContent, on: c.querySelector('.sf-sw .on').dataset.pid, h: c.getBoundingClientRect().height, foc: document.activeElement && document.activeElement.dataset.pid }; }, CARD);
    assert.match(b.img, /M3-BLACK-1/); assert.ok(b.fade, 'yengil fade'); assert.notEqual(b.price, a.price, 'narx rangga qarab'); assert.match(b.attrs, /Qora/);
    assert.equal(b.on, '401'); assert.equal(b.h, a.h, 'karta sakramaydi'); assert.equal(b.foc, '401', 'fokus tanlangan nuqtada qoladi');
    // tugagan rang — tanlov o'zgarmaydi
    await page.evaluate(() => sfPick('mini3', 402));
    assert.equal(await page.$eval(`${CARD} .sf-sw .on`, e => e.dataset.pid), '401');
    // klaviatura: ← oldingi mavjud rang
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.$eval(`${CARD} .sf-sw .on`, e => e.dataset.pid), '400');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.$eval(`${CARD} .sf-sw .on`, e => e.dataset.pid), '401', '→ tugagan rangni oʻtkazib yubormaydi, keyingi mavjudiga oʻtadi');
    // surish
    await page.evaluate((CARD) => { const el = document.querySelector(CARD + ' .sf-img'), t = (x) => ({ touches: [{ clientX: x, clientY: 100 }], changedTouches: [{ clientX: x, clientY: 100 }] });
      sfSwipeStart(el, t(200)); sfSwipeEnd(el, t(120)); }, CARD);
    assert.equal(await page.$eval(`${CARD} .sf-sw .on`, e => e.dataset.pid), '400', 'surish — keyingi mavjud rang (aylanib)');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function testCartAndOrder() {
  const { browser, page, errors } = await open(390, 844, true);
  try {
    const r = await page.evaluate((CARD) => {
      sfPick('mini3', 401);
      document.querySelector(CARD + ' .sf-add').click();
      const cart = JSON.parse(JSON.stringify(SF.cart));
      sfGo('cart'); const li = document.querySelector('.sf-li').textContent;
      SF.name = 'Ali'; SF.phone = '+998901234567'; sfOrder();
      const it = SF.order.items[0];
      return { cart, li, it, price: shopPrice(S.products.find(p => p.id === 401)) };
    }, CARD);
    assert.deepEqual(r.cart, { 401: 1 }, 'savatga tanlangan rang (pid) tushadi');
    assert.match(r.li, /Qora/, 'savat qatorida rang nomi');
    assert.equal(r.it.pid, 401); assert.equal(r.it.sku, 'M3-BLACK'); assert.equal(r.it.color, 'Qora'); assert.equal(r.it.priceUsd, Math.round(r.price * 100) / 100);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function testProductPage() {
  const { browser, page, errors } = await open(390, 844, true);
  try {
    await page.click(`${CARD} .sf-go`);
    const a = await page.evaluate(() => { const th = [...document.querySelectorAll('.sf-gal-th button')];
      return { th: th.length, on: th.map(b => b.classList.contains('on')), vid: th[th.length - 1].classList.contains('vid'), main: document.querySelector('.sf-gal-main img').getAttribute('src'),
        sw: [...document.querySelectorAll('.sf-pd-sw [role=radio]')].map(b => ({ t: b.textContent.trim(), dis: b.disabled, on: b.classList.contains('on') })), info: document.querySelector('.sf-pd-info').textContent, pid: SF.pid }; });
    assert.equal(a.th, 4, 'koʻpi 4 ta kichik rasm'); assert.deepEqual(a.on, [true, false, false, false]); assert.ok(a.vid, 'oxirgisi — video');
    assert.match(a.main, /M3-PINK-1/); assert.equal(a.pid, 400);
    assert.equal(a.sw.length, 3); assert.match(a.sw[0].t, /Pushti/); assert.ok(a.sw[0].on); assert.ok(a.sw[2].dis); assert.match(a.sw[2].t, /Tugagan/);
    assert.match(a.info, /M3-PINK/); assert.match(a.info, /Mavjud: 10/);
    await page.click('.sf-gal-th button:nth-child(2)');
    assert.match(await page.$eval('.sf-gal-main img', e => e.getAttribute('src')), /M3-PINK-2/);
    assert.ok(await page.$eval('.sf-gal-th button:nth-child(2)', e => e.classList.contains('on') && e.getAttribute('aria-pressed') === 'true'));
    await page.click('.sf-gal-th button.vid');
    assert.match(await page.$eval('.sf-gal-main video', e => e.getAttribute('src')), /pink\.mp4/);
    // rang almashsa — o'z rasmlari, SKU, narx, qoldiq
    const p0 = await page.$eval('.sf-pd-price b', e => e.textContent);
    await page.click('.sf-pd-sw [data-pid="401"]');
    const b = await page.evaluate(() => ({ pid: SF.pid, main: document.querySelector('.sf-gal-main img').getAttribute('src'), th: document.querySelectorAll('.sf-gal-th button').length, info: document.querySelector('.sf-pd-info').textContent, price: document.querySelector('.sf-pd-price b').textContent }));
    assert.equal(b.pid, 401); assert.match(b.main, /M3-BLACK-1/); assert.equal(b.th, 2); assert.match(b.info, /M3-BLACK/); assert.match(b.info, /Mavjud: 5/); assert.notEqual(b.price, p0);
    await page.click('.sf-pd-buy .sf-btn');
    assert.deepEqual(await page.evaluate(() => SF.cart), { 401: 1 });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function testLegacyAndSeparate() {
  const { browser, page, errors } = await open(1280, 800, false);
  try {
    const r = await page.evaluate(() => {
      const old = S.products.find(p => p.id === 410), m = sfModel(old), g = sfModel(S.products.find(p => p.id === 401));
      document.querySelector('#sf-grid .sf-card[data-pid="410"] .sf-add').click();
      const cart = JSON.parse(JSON.stringify(SF.cart));
      sfGo('product', { pid: 410 }); const pd = { sw: document.querySelector('.sf-pd-sw'), th: document.querySelectorAll('.sf-gal-th button').length, h2: document.querySelector('.sf-pd-info h2').textContent };
      shopData().settings.colorsSeparate = true; sfGo('shop');
      const sep = { cards: [...document.querySelectorAll('#sf-grid .sf-card')].map(c => c.dataset.pid).sort(), sw: document.querySelectorAll('#sf-grid .sf-sw').length, attrs: document.querySelector('#sf-grid .sf-card[data-pid="401"] .sf-attrs').textContent };
      return { m, g, cart, pd, sep, cfg: shopCfg().colorsSeparate };
    });
    assert.equal(r.m.variants.length, 1, 'eski mahsulot — 1 ta default variant'); assert.equal(r.m.variants[0].rang, null); assert.equal(r.m.variants[0].pid, 410); assert.equal(r.m.variants[0].qoldiq, 8);
    assert.equal(r.m.nom, 'Eski mahsulot');
    assert.equal(r.g.id, 'mini3'); assert.deepEqual(r.g.variants.map(v => v.sku), ['M3-PINK', 'M3-BLACK', 'M3-BLUE']);
    assert.deepEqual(r.g.variants.map(v => v.qoldiq), [10, 5, 0]); assert.deepEqual(r.g.variants[1].rang, { nom: 'Qora', hex: '#111111' });
    assert.equal(r.g.variants[0].video, 'https://img.test/pink.mp4'); assert.equal(r.g.variants[0].rasmlar.length, 5); assert.ok(r.g.variants[1].narx > r.g.variants[0].narx);
    assert.deepEqual(r.cart, { 410: 1 }); assert.equal(r.pd.sw, null); assert.equal(r.pd.th, 0, 'rasmsiz — kichik rasmlar yoʻq'); assert.equal(r.pd.h2, 'Eski mahsulot');
    assert.equal(r.cfg, true);
    assert.deepEqual(r.sep.cards, ['400', '401', '410'], 'alohida karta: har mavjud rang oʻz kartasi'); assert.equal(r.sep.sw, 0, 'nuqtalarsiz'); assert.match(r.sep.attrs, /Qora/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function testImportAndSettings() {
  const { browser, page, errors } = await open(1280, 800, false);
  try {
    const r = await page.evaluate(() => {
      const errs = [], row = (c, h, g) => [undefined, '', 'SKU', 'Nom', 'Kat', 'Br', 1, 2, 3, 4, c, h, g];
      const ok = xlVariantCols(row('Pushti', 'f2a7c3', 'mini3'), 1, 2, 'A', errs), empty = xlVariantCols(row('', '', ''), 1, 3, 'B', errs), old = xlVariantCols([undefined, '', 'SKU', 'Nom'], 1, 4, 'C', errs);
      xlVariantCols(row('Qizil', 'qizil', 'g'), 1, 5, 'D', errs);
      const p = { id: 1, sku: 'A', color: { name: 'Eski', hex: '#000000' }, vgroup: 'eski' }; fwApplyVariant(p, ok);
      const q = { id: 2, sku: 'B', color: { name: 'Oq', hex: '#ffffff' }, vgroup: 'g1' }; fwApplyVariant(q, empty);
      sfClose(); dkSettingsSheet(); const sw = document.getElementById('dks-colsep'); const was = sw.checked; sw.checked = true; dkSettingsSave();
      return { head: XL_HEADERS, ok, empty, old, errs, p, q, was, saved: shopData().settings.colorsSeparate };
    });
    assert.deepEqual(r.head.slice(0, 9), ['Rasm', 'SKU (Kod)', 'Nomi', 'Kategoriya', 'Brend', 'Miqdor', 'Tannarx ($, 1 dona)', 'Chakana narxi ($)', 'Optom narxi ($)'], 'mavjud ustunlar oʻzgarmagan');
    assert.deepEqual(r.head.slice(9), ['Rang', 'Rang HEX', 'Variant guruhi']);
    assert.deepEqual(r.ok, { color: 'Pushti', hex: '#f2a7c3', vgroup: 'mini3' });
    assert.deepEqual(r.empty, { color: '', hex: '', vgroup: '' }); assert.deepEqual(r.old, { color: '', hex: '', vgroup: '' }, 'eski 9 ustunli fayl');
    assert.equal(r.errs.length, 1); assert.match(r.errs[0], /5-qator.*HEX/);
    assert.deepEqual(r.p.color, { name: 'Pushti', hex: '#f2a7c3' }); assert.equal(r.p.vgroup, 'mini3');
    assert.deepEqual(r.q.color, { name: 'Oq', hex: '#ffffff' }, 'boʻsh katak — oʻzgarmaydi'); assert.equal(r.q.vgroup, 'g1');
    assert.equal(r.was, false); assert.equal(r.saved, true, '«Ranglarni alohida kartada koʻrsat» saqlanadi');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

module.exports = { name: 'P65 — vitrinada ranglar (variantlar) (v25.6)', cases: [
  { name: "karta: 3 rang — bitta karta, pill/doira, rang almashsa rasm/narx/maydon almashadi, sakrash yoʻq; tugagan rang; klaviatura va surish", run: testCard },
  { name: "savat va buyurtma tanlangan rang (pid, SKU, narx, rang nomi) bilan", run: testCartAndOrder },
  { name: "mahsulot sahifasi: galereya (4 kichik rasm, video oxirida), rang → oʻz rasmlari/SKU/narx/qoldiq", run: testProductPage },
  { name: "orqaga moslik (variantsiz — 1 default variant) va «alohida karta» sozlamasi", run: testLegacyAndSeparate },
  { name: "import ustunlari (Rang, Rang HEX, Variant guruhi) — mavjud 9 ustun oʻzgarmagan; sozlama saqlanadi", run: testImportAndSettings },
] };
