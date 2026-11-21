// P74 — v25 (egasi talabi): TEZ KIRISH. Birinchi marta login + parol, keyin shu qurilmada PIN (4 xonali) yoki barmoq izi.
//  • PIN telefonda faqat xesh (PBKDF2), o'zi saqlanmaydi; noto'g'ri PIN — qolgan urinishlar; 5-xatoda tez kirish o'chadi.
//  • Boshqa foydalanuvchining sessiyasi bo'lsa — tez kirish o'chadi (boshqa odamning PINi bilan kirib bo'lmaydi).
//  • Barmoq izi — ilovadagi window.FwBio orqali; tasdiqlanmasa — PIN.
//  • Ochilishda: PIN to'g'ri — o'z bo'limiga (admin — panel, sotuvchi — sotuvchi sahifasi); «Login va parol bilan» — oddiy kirish.
//  • Chiqish — tez kirish ham o'chadi.
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;

const press = (page, digits) => page.evaluate(async (d) => { for (const k of d) { document.querySelector(`#fw-pin-ov button[data-k="${k}"]`).click(); await new Promise(r => setTimeout(r, 30)); } }, digits);
const padText = (page) => page.evaluate(() => document.getElementById('fw-pin-ov')?.textContent || '');

module.exports = {
  name: 'P74 — tez kirish: PIN (xesh), 5 xato — o\'chadi, barmoq izi, boshqa foydalanuvchi, chiqish',
  cases: [
    { name: 'PIN o\'rnatish (ikki marta), xesh saqlanadi; ochilishda to\'g\'ri PIN — kiradi, noto\'g\'ri — urinishlar, 5-da o\'chadi', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        await page.evaluate(() => { try { localStorage.removeItem('fw_quick_v1'); } catch (_) {} window.__setup = fwQuickSetupOffer({ dest: 'seller', uid: 'u-7', staff: { id: 7, name: 'Kassir' }, name: 'Kassir' }); });
        await page.waitForSelector('#fw-pin-ov');
        assert.match(await padText(page), /Tez kirish uchun PIN/);
        await press(page, '1357');
        assert.match(await padText(page), /yana bir marta/);
        await press(page, '2468');
        assert.match(await padText(page), /mos kelmadi/, 'ikkinchisi boshqa — qayta');
        await press(page, '1357'); await press(page, '1357');
        await page.evaluate(() => window.__setup);
        const rec = await page.evaluate(() => localStorage.getItem('fw_quick_v1'));
        assert.ok(rec && !rec.includes('1357'), 'PIN o\'zi saqlanmaydi'); assert.equal(JSON.parse(rec).uid, 'u-7');
        // Ochilish: noto'g'ri PIN → qolgan urinishlar; keyin to'g'ri → info
        await page.evaluate(() => { window.__un = fwQuickUnlock('u-7'); });
        await page.waitForSelector('#fw-pin-ov');
        assert.match(await padText(page), /Kassir/);
        await press(page, '0000');
        assert.match(await padText(page), /yana 4 ta urinish/);
        await press(page, '1357');
        const info = await page.evaluate(() => window.__un);
        assert.equal(info && info.dest, 'seller'); assert.equal(info.staff.id, 7);
        // 5 marta noto'g'ri — tez kirish o'chadi, login so'raladi
        await page.evaluate(() => { window.__un = fwQuickUnlock('u-7'); });
        await page.waitForSelector('#fw-pin-ov');
        for (let i = 0; i < 5; i++) await press(page, '9999');
        const r5 = await page.evaluate(async () => ({ info: await window.__un, rec: localStorage.getItem('fw_quick_v1') }));
        assert.equal(r5.info, null); assert.equal(r5.rec, null, '5-xatoda tez kirish o\'chdi');
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
    { name: 'barmoq izi (FwBio): tasdiq — kiradi, rad — PIN; boshqa foydalanuvchi sessiyasi — o\'chadi; «Login va parol bilan»; chiqish', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        const r = await page.evaluate(async () => {
          let answer = true;
          window.FwBio = { available: () => true, authenticate: (cb) => setTimeout(() => window[cb](answer), 20) };
          await fwQuickSet('2580', { dest: 'admin', branch: 'baza', uid: 'u-1', name: 'Egasi' }, true);
          const ok = await fwQuickUnlock('u-1');                          // avtomatik barmoq izi
          answer = false;
          const p = fwQuickUnlock('u-1');
          await new Promise(r => setTimeout(r, 100));
          const padAfterFail = !!document.getElementById('fw-pin-ov');
          for (const k of '2580') { document.querySelector(`#fw-pin-ov button[data-k="${k}"]`).click(); await new Promise(r => setTimeout(r, 30)); }
          const viaPin = await p;
          const p2 = fwQuickUnlock('u-1'); await new Promise(r => setTimeout(r, 100));
          document.querySelector('#fw-pin-ov .fw-pin-alt').click();
          const alt = await p2;
          const other = await fwQuickUnlock('u-OTHER');
          const cleared = localStorage.getItem('fw_quick_v1');
          await fwQuickSet('1111', { dest: 'admin', uid: 'u-1' }, false);
          ['bp_auth_ok'].forEach(k => sessionStorage.setItem(k, '1'));
          return { ok: ok && ok.dest, padAfterFail, viaPin: viaPin && viaPin.branch, alt, other, cleared };
        });
        assert.equal(r.ok, 'admin', 'barmoq izi — kirdi');
        assert.equal(r.padAfterFail, true, 'barmoq izi rad — PIN klaviaturasi'); assert.equal(r.viaPin, 'baza');
        assert.equal(r.alt, null, '«Login va parol bilan» — oddiy kirish');
        assert.equal(r.other, null); assert.equal(r.cleared, null, 'boshqa foydalanuvchi sessiyasi — tez kirish o\'chdi');
        // Chiqish — tez kirish o'chadi
        await page.evaluate(() => { fwLogoutFlow(null, ''); });
        assert.equal(await page.evaluate(() => localStorage.getItem('fw_quick_v1')), null, 'chiqishda o\'chdi');
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
  ],
};
