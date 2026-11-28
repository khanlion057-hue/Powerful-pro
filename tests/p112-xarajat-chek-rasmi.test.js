// P112 — v25.6.9: xarajatga chek rasmi (yuklash, ro'yxatda 📎, to'liq ko'rish)
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
async function run() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<input type="file" id="ex-photo" accept="image/*">'); window.__up = []; uploadImageToStorage = async (d, pid) => { __up.push(pid); return 'https://x.test/p' + pid + '.png'; }; });
    await page.setInputFiles('#ex-photo', { name: 'chek.png', mimeType: 'image/png', buffer: PNG });
    assert.equal(await page.evaluate(() => exReceiptUpload(555)), 'https://x.test/px555.png');
    assert.deepEqual(await page.evaluate(() => __up), ['x555']);
    // rasm tanlanmagan — null
    await page.evaluate(() => { document.getElementById('ex-photo').value = ''; });
    assert.equal(await page.evaluate(() => exReceiptUpload(556)), null);
    // yuklash xatosi (base64 qaytsa) — saqlanmaydi
    await page.setInputFiles('#ex-photo', { name: 'chek.png', mimeType: 'image/png', buffer: PNG });
    await page.evaluate(() => { uploadImageToStorage = async (d) => d; });
    assert.equal(await page.evaluate(() => exReceiptUpload(557)), null);
    // ko'rish
    await page.evaluate(() => { S.expenses.push({ id: 900, date: td(), cat: 'Ijara', amtUsd: 5, receipt: 'https://x.test/a.png' }); exReceiptOpen(900); });
    await page.waitForSelector('#fw-gal');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
module.exports = { name: 'P112 — Xarajat chek rasmi', cases: [{ name: 'chek rasmi yuklanadi (faqat https), xato — rasmsiz, 📎 to\'liq ko\'rish', run }] };
