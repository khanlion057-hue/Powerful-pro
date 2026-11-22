// P136 — v25.6.10 (egasi): admin tomoni — mahsulot formasida kafolat (Yo'q / 3 / 6 / 12 oy), do'kon sozlamasida 2-raqam,
// oldindan ko'rishda kafolat belgisi, 2 ta raqam (qo'ng'iroq tugmalari), buyurtmada 2-raqam va har mahsulot kafolati; filial tugmalari o'qiladi.
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;

async function run(width, height, mobile, shot) {
  const { browser, page, errors } = await openPage('index.html', { width, height, mobile, admin: true, scale: shot ? 2 : null });
  try {
    const r = await page.evaluate(async () => {
      save = async () => true; fwSaveToast = async () => true;
      S.products = [{ id: 1, sku: 'A1', name: 'Drel 600W', markupPct: 25, cat: 'Asboblar' }, { id: 2, sku: 'B1', name: 'Arra tigʻi', markupPct: 25, cat: 'Tigʻlar' }];
      S.batches = [{ id: 1, pid: 1, qty: 5, sold: 0, costUsd: 40, status: 'active', date: td() }, { id: 2, pid: 2, qty: 9, sold: 0, costUsd: 8, status: 'active', date: td() }];
      // 1) mahsulot formasi: kafolat tanlovi
      editProduct(1);
      const opts = [...document.querySelectorAll('#pmf-war button')].map(b => b.textContent);
      const def = document.querySelector('#pmf-war button.on')?.textContent;
      document.querySelector('#pmf-war button[data-m="12"]').click();
      await pmfSave();
      const w1 = S.products[0].warrantyM;
      editProduct(1);
      const reopened = document.querySelector('#pmf-war button.on')?.textContent;
      document.querySelector('#pmf-war button[data-m="0"]').click(); await pmfSave();
      const w0 = S.products[0].warrantyM;
      S.products[0].warrantyM = 6;
      // 2) do'kon sozlamasi: 2-raqam
      const sh = shopData(); sh.settings = Object.assign(sh.settings || {}, { enabled: true, name: 'Powerful', phone: '901234567', phone2: '+998 71 200 00 00' });
      // 3) oldindan ko'rish
      dkOpenStorefront();
      const cardWar = [...document.querySelectorAll('#sf-grid .sf-card')].map(c => (c.querySelector('.sf-war') || {}).textContent || '');
      const foot = [...document.querySelectorAll('.sf-foot a')].map(a => [a.textContent, a.getAttribute('href')]);
      sfGo('product', { pid: 1 });
      const box = document.querySelector('.sf-warbox')?.textContent || '';
      sfGo('about');
      const calls = [...document.querySelectorAll('.sf-call')].map(a => a.querySelector('span').textContent);
      sfAdd(1, 1); sfAdd(2, 1); sfGo('cart');
      const cartWar = document.querySelectorAll('.sf-li .sf-war').length;
      Object.assign(SF, { name: 'Ali', phone: '+998 90 111 22 33', phone2: '97 55', del: 'pickup' });
      const t0 = []; const _t = toast; toast = (m) => t0.push(String(m));
      sfOrder(); const blocked = SF.view;
      SF.phone2 = '+998 97 555 44 33'; sfOrder(); toast = _t;
      const o = shopData().orders[0];
      return { opts, def, w1, reopened, w0, cardWar, foot, box, calls, cartWar, blocked, t0, o: o && { phone2: o.cust.phone2, war: o.items.map(i => [i.pid, i.warrantyM || 0]) } };
    });
    assert.deepEqual(r.opts, ['Yoʻq', '3 oy', '6 oy', '12 oy']);
    assert.equal(r.def, 'Yoʻq', 'yangi/eski mahsulot — kafolatsiz');
    assert.equal(r.w1, 12); assert.equal(r.reopened, '12 oy', 'qayta ochilganda tanlangan'); assert.equal(r.w0, 0);
    assert.deepEqual(r.cardWar, ['Kafolat: 6 oy', ''], 'kafolatsizda belgi yo\'q');
    assert.deepEqual(r.foot, [['+998 90 123 45 67', 'tel:+998901234567'], ['+998 71 200 00 00', 'tel:+998712000000']]);
    assert.match(r.box, /Rasmiy kafolat/); assert.match(r.box, /Kafolat: 6 oy/); assert.match(r.box, /ehtiyot qismlar/);
    assert.deepEqual(r.calls, ['Asosiy raqam+998 90 123 45 67', 'Qoʻshimcha raqam+998 71 200 00 00']);
    assert.equal(r.cartWar, 1);
    assert.equal(r.blocked, 'cart', 'chala 2-raqam — buyurtma yuborilmaydi'); assert.match(r.t0.join(' '), /Qoʻshimcha raqam/);
    assert.equal(r.o.phone2, '+998 97 555 44 33');
    assert.deepEqual(r.o.war, [[1, 6], [2, 0]], 'har mahsulot kafolati buyurtmada');
    // filial tugmalari: kontrast (oq fonda to'q matn)
    const c = await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<div class="sf-app" id="tst"><div class="sf-br"><button>X</button><button class="on">Y</button></div></div>');
      const g = (e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]; const b = document.querySelectorAll('#tst button'); const v = [g(b[0]), g(b[1])]; document.getElementById('tst').remove(); return v; });
    assert.deepEqual(c, [['rgb(15, 23, 42)', 'rgb(255, 255, 255)'], ['rgb(6, 95, 70)', 'rgb(236, 253, 245)']]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

module.exports = { name: "P136 — Admin: kafolat tanlash, 2-raqam, oldindan ko'rish", cases: [
  { name: 'telefon: forma, oldindan ko\'rish, buyurtma', run: () => run(390, 844, true) },
  { name: 'kompyuter: xuddi shu', run: () => run(1366, 900, false) },
] };
