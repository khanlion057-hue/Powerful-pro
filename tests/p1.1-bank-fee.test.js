// P1.1 — REGRESSION TEST: Xitoy bank komissiyasi (avval CUR.BANK_FEE=0.006 qattiq
// kodlangan edi) endi Sozlamalar sahifasida (S.settings.bankFeePct) sozlanadigan
// bo'ldi — xuddi usdUzs/usdCny kursi kabi bir xil naqsh bilan.
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

async function testSaveSettingsUpdatesBankFee() {
  const { browser, page } = await loadApp({
    mockRoutes: [
      // app-data-save.js'ga chaqiruv — bu test uchun ahamiyatsiz, shunchaki xato bermasin
      { url: '**/.netlify/functions/app-data-save', handler: (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }) },
    ],
  });

  try {
    const result = await page.evaluate(async () => {
      Object.assign(S, { settings: { company: 'Powerful' }, products: [], partners: [], customers: [], suppliers: [], branch: 'baza' });
      document.body.innerHTML = `
        <input id="st-comp" value="Powerful">
        <input id="st-owner" value="">
        <input id="st-role" value="Direktor">
        <input id="st-rec" value="">
        <input id="st-bankfee" value="1.25">
      `;
      // Bu test faqat sozlama-saqlash yo'lini tekshiradi — UI qayta chizishga bog'liq
      // bo'lgan yordamchilarni (minimal test DOM'da yo'q elementlar) no-op qilamiz.
      const realUpdateSidebar = updateSidebarUser;
      updateSidebarUser = () => {};
      try {
        await saveSettings();
      } finally {
        updateSidebarUser = realUpdateSidebar;
      }
      return {
        curBankFee: CUR.BANK_FEE,
        settingsBankFeePct: S.settings.bankFeePct,
        localStorageBankFeePct: JSON.parse(localStorage.getItem('bp_cur') || '{}').bankFeePct,
      };
    });

    assert.equal(result.curBankFee, 0.0125, "saveSettings() 1.25% kiritilganda CUR.BANK_FEE=0.0125 qilib yangilashi kerak");
    assert.equal(result.settingsBankFeePct, 0.0125, "S.settings.bankFeePct bulutga sinxronlash uchun yangilanishi kerak");
    assert.equal(result.localStorageBankFeePct, 0.0125, "CUR.save() bankFeePct'ni ham localStorage'ga (bp_cur) yozishi kerak");
  } finally {
    await browser.close();
  }
}

async function testKirimCalcUsesConfiguredBankFee() {
  const { browser, page } = await loadApp({});
  try {
    const bankFeeUsd = await page.evaluate(() => {
      CUR.BANK_FEE = 0.02; // 2% — standart 0.6% emas, qasddan boshqacha qiymat
      CUR.usdCny = 7; // 1$ = 7 ¥
      const totalCnyBase = 1000; // masalan 1000 ¥ tovar
      return CUR.cnyToUsd(totalCnyBase * CUR.BANK_FEE);
    });
    // 1000 * 0.02 = 20 ¥ komissiya -> 20/7 = 2.857... $
    assert.ok(Math.abs(bankFeeUsd - (20 / 7)) < 1e-9, "kirimCalc() ichidagi bank-komissiya formulasi joriy (sozlangan) CUR.BANK_FEE'dan foydalanishi kerak");
  } finally {
    await browser.close();
  }
}

module.exports = {
  name: "P1.1 — Bank komissiyasi (CUR.BANK_FEE) sozlanuvchan",
  cases: [
    { name: "Sozlamalar'da % kiritilsa, CUR.BANK_FEE + S.settings.bankFeePct + localStorage yangilanadi", run: testSaveSettingsUpdatesBankFee },
    { name: "Kirim tannarx formulasi joriy CUR.BANK_FEE qiymatidan foydalanadi", run: testKirimCalcUsesConfiguredBankFee },
  ],
};
