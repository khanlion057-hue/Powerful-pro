// P103 — v25.6.8: telefonning «Orqaga» tugmasi. Egasi: «Orqaga — 1 qadam ortga bo'lishi kerak, ✕ kabi; hozir ilovadan butunlay chiqib ketyapti».
//  1) Ilova qayta ochilganda (Android fonda yopgan sahifani manzildan, masalan #ombor, tiklaydi) bo'lim to'g'ridan-to'g'ri ochiladi — «ortga yo'l» yo'q edi,
//     «Orqaga» ilovadan chiqarib yuborardi. Endi tiklangan bo'limdan «Orqaga» — Bosh sahifaga (1 qadam).
//  2) Bosh sahifada «Orqaga» darhol chiqarmaydi: «Chiqish uchun yana bir marta bosing» (2,5 s ichida ikkinchi bosish — chiqadi).
const assert = require('node:assert/strict');
const { openPage } = require('./p63-vitrina.test.js');

const toastText = (page) => page.evaluate(() => (document.getElementById('toasts') || document.body).innerText || '');
const inApp = (page) => /index\.html/.test(page.url());
const boot = () => openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });

async function testRestoredPageBack() {
  const { browser, page, errors } = await boot();
  try {
    // yangi yuklash: «oldingi bo'lim» yo'q, ortga yo'l yo'q (Android sahifani #ombor manzilidan tiklaganda shunday)
    await page.evaluate(() => { SHELL.nav.cur = null; SHELL.nav.stack.length = 0; FW_BACK.splice(0, FW_BACK.length); history.replaceState(null, '', '#ombor'); go('ombor'); });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => S.page), 'ombor', 'tiklangan boʻlim ochildi');
    assert.ok(await page.evaluate(() => FW_BACK.some((e) => /^nav:/.test(e.key))), 'ortga yoʻl (Bosh sahifaga) bor');
    await page.goBack(); await page.waitForTimeout(500);
    assert.ok(inApp(page), '«Orqaga» ilovadan chiqarib yubormaydi');
    assert.equal(await page.evaluate(() => S.page), 'dashboard', '«Orqaga» — Bosh sahifaga (1 qadam)');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function testRootDoubleBack() {
  const { browser, page, errors } = await boot();
  try {
    assert.equal(await page.evaluate(() => S.page), 'dashboard');
    await page.goBack(); await page.waitForTimeout(500);
    assert.ok(inApp(page), 'Bosh sahifada 1-«Orqaga» — chiqmaydi');
    assert.match(await toastText(page), /Chiqish uchun yana bir marta/i, 'tushuntirish xabari');
    await page.waitForTimeout(2900);                                                  // oyna tugadi — yana himoya
    await page.goBack(); await page.waitForTimeout(500);
    assert.ok(inApp(page), 'oyna tugagach 1-«Orqaga» yana chiqarmaydi');
    assert.deepEqual(errors, []);
    await page.goBack(); await page.waitForTimeout(700);                              // 2,5 s ichida ikkinchi — chiqish
    assert.ok(!inApp(page), '2,5 s ichida ikkinchi «Orqaga» — ilovadan chiqadi: ' + page.url());
  } finally { await browser.close(); }
}

async function testOverlayThenRoot() {
  const { browser, page, errors } = await boot();
  try {
    await page.evaluate(() => { [...document.querySelectorAll('#pg-dashboard [onclick]')].find((e) => /Qoldiq/.test(e.innerText)).click(); });
    await page.waitForTimeout(500);
    assert.ok(await page.evaluate(() => FW_BACK.some((e) => e.key === 'sheet')), 'pastki oyna ochildi');
    await page.goBack(); await page.waitForTimeout(500);
    assert.ok(inApp(page)); assert.equal(await page.evaluate(() => S.page), 'dashboard', 'ochilgan oyna yopildi (✕ kabi)');
    assert.equal(await page.evaluate(() => !!document.querySelector('.bs-ov.open,#bs-ov.open')), false);
    assert.doesNotMatch(await toastText(page), /Chiqish uchun/i, 'oyna yopilganda «chiqish» xabari chiqmaydi');
    await page.goBack(); await page.waitForTimeout(500);
    assert.ok(inApp(page));
    assert.match(await toastText(page), /Chiqish uchun yana bir marta/i, 'keyingi «Orqaga» — endi chiqish tasdigʻi');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function testXOnRestoredPage() {
  const { browser, page, errors } = await boot();
  try {
    await page.evaluate(() => { SHELL.nav.cur = null; SHELL.nav.stack.length = 0; FW_BACK.splice(0, FW_BACK.length); history.replaceState(null, '', '#xarajatlar'); go('xarajatlar'); });
    await page.waitForTimeout(300);
    await page.evaluate(() => shellBack());                                           // ✕
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => S.page), 'dashboard', '✕ — Bosh sahifaga (tiklangan boʻlimda ham)');
    assert.doesNotMatch(await toastText(page), /Chiqish uchun/i, '✕ «chiqish» xabarini chiqarmaydi');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function testStorefrontGallery() {
  const { browser, page, errors } = await boot();
  try {
    await page.evaluate(() => { shopData().settings.enabled = true; go('dokon'); });
    await page.waitForTimeout(300);
    await page.evaluate(() => dkOpenStorefront());
    assert.equal(await page.evaluate(() => !document.getElementById('sf-ov').hidden), true, 'vitrina ochildi');
    await page.goBack(); await page.waitForTimeout(500);
    assert.ok(inApp(page)); assert.equal(await page.evaluate(() => document.getElementById('sf-ov').hidden), true, '«Orqaga» vitrinani yopdi (✕ kabi)');
    assert.equal(await page.evaluate(() => S.page), 'dokon', 'boʻlimning oʻzidan chiqmadi — faqat vitrina yopildi');
    await page.evaluate(() => fwGallery(['https://img.test/a.png', 'https://img.test/b.png'], 'Test'));
    assert.equal(await page.evaluate(() => !!document.getElementById('fw-gal')), true);
    await page.goBack(); await page.waitForTimeout(500);
    assert.ok(inApp(page)); assert.equal(await page.evaluate(() => !!document.getElementById('fw-gal')), false, '«Orqaga» rasm koʻrgichni yopdi');
    // ✕ bilan yopilgach ortiqcha qadam qolmaydi: keyingi «Orqaga» bitta qadam ortga
    await page.evaluate(() => { dkOpenStorefront(); sfClose(); });
    await page.waitForTimeout(300);
    await page.goBack(); await page.waitForTimeout(500);
    assert.ok(inApp(page)); assert.equal(await page.evaluate(() => S.page), 'dashboard', '✕ dan keyin «Orqaga» — bitta qadam (Bosh sahifaga)');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

module.exports = { name: "P103 — telefonning «Orqaga» tugmasi (v25.6.8)", cases: [
  { name: "tiklangan bo'limda (#ombor) «Orqaga» — Bosh sahifaga, ilovadan chiqmaydi", run: testRestoredPageBack },
  { name: "Bosh sahifada: 1-«Orqaga» — xabar, 2,5 s ichida ikkinchisi — chiqish; oyna tugagach yana himoya", run: testRootDoubleBack },
  { name: "ochiq oyna/bo'lim avval yopiladi (✕ kabi), keyin chiqish tasdig'i", run: testOverlayThenRoot },
  { name: "vitrina va rasm ko'rgich: «Orqaga» ✕ kabi yopadi; ✕ dan keyin ortiqcha qadam yo'q", run: testStorefrontGallery },
  { name: "✕ tiklangan bo'limda ham Bosh sahifaga olib boradi", run: testXOnRestoredPage },
] };
