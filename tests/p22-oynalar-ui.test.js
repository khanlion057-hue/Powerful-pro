// P22 — v23.5 KICHIK OYNALAR 2.0: haqiqiy js/shared.js + js/main.js, haqiqiy Chromium.
// Tekshiriladi: kassa kartochkalari eski kod o'qiydigan qiymatni beradi; valyuta almashsa summa
// o'sha valyutaga o'giriladi (so'mdagi son $ bo'lib ketmaydi); «Hammasi/50%» va qolgan qarz; to'lov
// tanlangan kassaga to'g'ri summada yoziladi; foydalanuvchi matni oynada HTML bo'lib ishlamaydi;
// sarlavha bezagi va bo'lim rangi; parol maydoni.
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

const BOXES = [
  { id: 1, name: "Naqd so'm", icon: '💵', cur: 'UZS', type: 'cash', bal: 5000000 },
  { id: 3, name: 'Dollar', icon: '💲', cur: 'USD', type: 'usd', bal: 200 },
  { id: 4, name: 'Diller kassasi', icon: '🚚', cur: 'USD', type: 'dealer', bal: 0 },
];

async function withApp(fn) {
  const { browser, page, consoleErrors } = await loadApp();
  try {
    await page.evaluate((boxes) => {
      document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov" class="modal-overlay"></div>');
      save = () => {}; pgMijozlar = () => {}; pgTaminotchilar = () => {}; pgDillerlar = () => {}; pgHamkorlar = () => {}; auditLog = () => {};
      CUR.usdUzs = 12800;
      S.cashboxes = JSON.parse(JSON.stringify(boxes));
      S.page = 'mijozlar';
      S.customers = [{ id: 11, name: 'Ali', phone: '+998901112233', debt: 1280000 }];
      S.suppliers = [{ id: 21, name: 'Supp', country: '<img src=x onerror="window.__xss=1">', contact: '', debt: 300 }];
      S.sales = []; S.batches = []; S.cashTxns = [];
    }, BOXES);
    await fn(page);
    assert.deepEqual(consoleErrors, [], "sahifada JS xatosi yo'q");
  } finally { await browser.close(); }
}

async function testPayDebtBoxCardsAndCurrency() {
  await withApp(async (page) => {
    await page.evaluate(() => openPayDebt(11));
    // Diller kassasi mijoz to'lovida ko'rsatilmaydi; birinchi kassa tanlangan
    assert.deepEqual(await page.$$eval('#modal-ov .me-opt', (b) => b.map((x) => x.dataset.v)), ['1', '3']);
    assert.equal(await page.inputValue('#pd-b'), '1');
    assert.equal(await page.inputValue('#pd-a'), '1 280 000', "to'liq qarz so'mda, ekranda «1 280 000» ko'rinishida (v23.6)");
    assert.equal(await page.evaluate(() => document.getElementById('pd-a').value), '1280000', "kod o'qiganda — bo'shliqsiz son");
    assert.match(await page.textContent('#pd-r'), /Yopiladi/);
    // $ kassasi tanlansa — summa dollarga o'giriladi (1 280 000 / 12 800 = 100)
    await page.click('#modal-ov .me-opt[data-v="3"]');
    assert.equal(await page.inputValue('#pd-b'), '3');
    assert.equal(await page.inputValue('#pd-a'), '100');
    assert.equal(await page.textContent('#pd-u'), '$');
    // 50% chip — 50 $; qolgan qarz 640 000 so'm
    await page.click('#modal-ov .me-chips button:nth-child(2)');
    assert.equal(await page.inputValue('#pd-a'), '50');
    assert.match(await page.textContent('#pd-r'), /640/);
    // Qarzdan ortiq — ogohlantirish
    await page.fill('#pd-a', '150');
    assert.equal(await page.evaluate(() => document.getElementById('pd-r').classList.contains('bad')), true);
    assert.match(await page.textContent('#pd-r'), /oshib ketdi/);
    // Haqiqiy tugma: 50 $ — DOLLAR kassasiga, qarz 50×12 800 ga kamayadi
    await page.fill('#pd-a', '50');
    await page.click('#modal-ov .modal-footer .btn-success');
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => ({ usd: S.cashboxes.find((k) => k.id === 3).bal, uzs: S.cashboxes.find((k) => k.id === 1).bal, debt: S.customers[0].debt }));
    assert.deepEqual(r, { usd: 250, uzs: 5000000, debt: 640000 });
  });
}

async function testOverpayRejectedThroughNewUi() {
  await withApp(async (page) => {
    await page.evaluate(() => openPayDebt(11));
    await page.fill('#pd-a', '1300000');
    await page.click('#modal-ov .modal-footer .btn-success');
    await page.waitForTimeout(100);
    const r = await page.evaluate(() => ({ bal: S.cashboxes[0].bal, debt: S.customers[0].debt, t: window.__toasts.map((x) => x.msg).join('|') }));
    assert.equal(r.bal, 5000000, "kassa o'zgarmadi"); assert.equal(r.debt, 1280000, "qarz o'zgarmadi");
    assert.match(r.t, /oshib ketdi/);
  });
}

async function testSupplierPayFirmaOptionsAndXss() {
  await withApp(async (page) => {
    await page.evaluate(() => { S.page = 'taminotchilar'; fwFirmaAvailable = () => true; editSupplier(21); });
    assert.equal(await page.evaluate(() => window.__xss), undefined, 'mamlakat maydoni HTML bo\'lib ishlamadi');
    assert.equal(await page.$$eval('#modal-ov img', (x) => x.length), 0);
    assert.equal(await page.inputValue('#es-c'), '<img src=x onerror="window.__xss=1">', 'qiymat matn sifatida saqlanadi');
    assert.equal(await page.evaluate(() => document.getElementById('modal-ov').dataset.pg), 'taminotchilar');
    assert.equal(await page.$$eval('#modal-ov .modal-title .mh-ic svg', (x) => x.length), 1, 'sarlavhada ikonka');
    await page.evaluate(() => openPaySupplierDebt(21));
    assert.deepEqual(await page.$$eval('#modal-ov .me-opt', (b) => b.map((x) => x.dataset.v)), ['1', '3', 'firma-USD', 'firma-UZS']);
    // Firma (so'm) tanlansa — qarz ($) so'mga o'giriladi, qiymat eski kod kutgan «firma-UZS»
    await page.click('#modal-ov .me-opt[data-v="3"]');
    assert.equal(await page.inputValue('#psd-a'), '300');
    await page.click('#modal-ov .me-opt[data-v="firma-UZS"]');
    assert.equal(await page.inputValue('#psd-b'), 'firma-UZS');
    assert.equal(await page.inputValue('#psd-a'), '3 840 000', "so'mga o'girildi (ekranda guruhlangan)");
    assert.equal(await page.evaluate(() => document.getElementById('psd-a').value), String(300 * 12800));
  });
}

async function testNameXssInCards() {
  await withApp(async (page) => {
    await page.evaluate(() => { S.customers[0].name = '<svg onload="window.__xss2=1">'; S.customers[0].phone = '<b>x</b>'; editCustomer(11); openPayDebt(11); });
    assert.equal(await page.evaluate(() => window.__xss2), undefined);
    assert.equal(await page.$$eval('#modal-ov .me-card svg, #modal-ov .me-card b b', (x) => x.length), 0);
    assert.match(await page.textContent('#modal-ov .me-t b'), /<svg onload/);
  });
}

async function testPasswordFieldAndRolePicker() {
  await withApp(async (page) => {
    await page.evaluate(() => { S.page = 'sotuvchilar'; openAddStaff(); });
    assert.equal(await page.getAttribute('#ns-pass', 'type'), 'password', 'parol yashirin');
    await page.click('#modal-ov .me-pass .me-pbtn:nth-of-type(2)');
    const v = await page.inputValue('#ns-pass');
    assert.match(v, /^[A-Za-z2-9]{10}$/, 'yaratilgan parol 10 belgi');
    assert.equal(await page.inputValue('#ns-role'), 'sotuvchi');
    await page.click('#modal-ov .me-opt[data-v="admin"]');
    assert.equal(await page.inputValue('#ns-role'), 'admin');
  });
}

async function testPartnerFounderSwitch() {
  await withApp(async (page) => {
    await page.evaluate(() => { S.page = 'hamkorlar'; openAddPartner(); });
    assert.equal(await page.isVisible('#np-fp-wrap'), false);
    await page.check('#np-founder');
    assert.equal(await page.isVisible('#np-fp-wrap'), true, "ta'sischi kaliti ulush maydonini ochadi");
    assert.equal(await page.isVisible('#np-keep-wrap'), false);
  });
}

module.exports = {
  name: "P22 — v23.5 kichik oynalar 2.0 (kassa kartochkalari, valyuta, XSS, parol)",
  cases: [
    { name: "Mijoz to'lovi: kassa kartochkasi, valyuta o'girish, 50%, qolgan qarz, to'g'ri kassaga yoziladi", run: testPayDebtBoxCardsAndCurrency },
    { name: "Mijoz to'lovi: qarzdan ortiq summa yangi oynada ham rad etiladi", run: testOverpayRejectedThroughNewUi },
    { name: "Ta'minotchi: Firma kassasi variantlari, valyuta o'girish, mamlakat maydoni XSS'dan himoyalangan", run: testSupplierPayFirmaOptionsAndXss },
    { name: 'Shaxs kartasi: ism/telefon HTML bo\'lib ishlamaydi', run: testNameXssInCards },
    { name: 'Xodim: parol yashirin, kuchli parol yaratish, lavozim kartochkasi', run: testPasswordFieldAndRolePicker },
    { name: "Hamkor: ta'sischi kaliti ulush maydonlarini almashtiradi", run: testPartnerFounderSwitch },
  ],
};
