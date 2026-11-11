// P78 — v25 (egasi qarori): KIRIM VA HISOB VALYUTASI — har filialga alohida, 4 rejim. Savdo oynasi baribir so'mda; yuan kursi faqat kirimda.
//  • yuan: ¥/$/so'm → $  • usd: $/so'm → $  • uzs: $/so'm → so'm (tannarx so'mda qotadi)  • mixed: so'm → so'm, $ → $
//  • Standart: Baza — yuan, filial — dollar. Yuan tugmasi va kursi faqat «Yuanli» rejimda.
//  • Rejim bir marta tanlanadi: 10 kun ichida faqat egasining paroli bilan o'zgaradi, keyin qulflanadi.
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;

module.exports = {
  name: 'P78 — kirim va hisob valyutasi: 4 rejim, filialga alohida, yuan faqat yuanli rejimda',
  cases: [
    { name: 'rejim → hisob valyutasi; so\'mda — tannarx so\'mda qotadi; yuan tugmasi faqat yuanli; sozlamalar qatori', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        const r = await page.evaluate(async () => {
          save = async () => true; CUR.usdUzs = 12500;
          const def = [fwAccMode('baza'), fwAccMode('f729')];
          const map = ['yuan', 'usd', 'uzs', 'mixed'].map(m => [m, fwAccCurFor('USD', m), fwAccCurFor('UZS', m)]);
          go('kirim'); const yuanBtn1 = !!document.getElementById('k-cny-btn');
          fwAccSheet(); const opts = document.querySelectorAll('.acc-o').length;
          window.confirm = () => true;
          await fwAccSet(S.branch, 'uzs'); await new Promise(r => setTimeout(r, 150));
          const at1 = S.settings.branchCfg[S.branch].accAt, lock1 = fwAccLock().state;
          go('kirim'); const yuanBtn2 = !!document.getElementById('k-cny-btn'), yuanRate2 = !!document.getElementById('k-usdcny');
          const b = fwAccBatch('USD', 100);
          go('sozlamalar'); const row = document.getElementById('pg-sozlamalar').textContent.includes('Kirim va hisob valyutasi');
          // 10 kun ichida — faqat parol bilan (parol rad etilsa o'zgarmaydi); vaqt birinchi tanlovdan
          let asked = 0; fwOwnerConfirm = async () => { asked++; return asked > 1; };
          await fwAccSet(S.branch, 'mixed'); const m2 = fwAccMode();
          await fwAccSet(S.branch, 'mixed'); const m3 = fwAccMode(), at3 = S.settings.branchCfg[S.branch].accAt;
          // 10 kundan keyin — qulflangan: tugmalar o'chiq, o'zgarmaydi
          S.settings.branchCfg[S.branch].accAt = Date.now() - 11 * 864e5;
          fwAccSheet(); const dis = document.querySelectorAll('.acc-o[disabled]').length, note = document.querySelector('.bs-note').textContent;
          await fwAccSet(S.branch, 'yuan'); closeSheet();
          const lock = { at1: at1 > 0, lock1, asked, m2, m3, same: at3 === at1, dis, locked: /qulflangan/.test(note), m4: fwAccMode() };
          return { def, map, yuanBtn1, opts, mode: m2 === 'uzs' ? 'uzs' : m2, yuanBtn2, yuanRate2, b, row, cur: S.importCur, lock };
        });
        assert.deepEqual(r.def, ['yuan', 'usd'], 'standart: Baza — yuan, filial — dollar');
        assert.deepEqual(r.map, [['yuan', 'USD', 'USD'], ['usd', 'USD', 'USD'], ['uzs', 'UZS', 'UZS'], ['mixed', 'USD', 'UZS']]);
        assert.equal(r.yuanBtn1, true); assert.equal(r.opts, 4);
        assert.equal(r.mode, 'uzs'); assert.equal(r.yuanBtn2, false, 'so\'mda — yuan tugmasi yo\'q'); assert.equal(r.yuanRate2, false, 'yuan kursi ham');
        assert.deepEqual(r.b, { accCur: 'UZS', costUzs: 1250000 }, '$100 × 12 500 — so\'mda qotdi');
        assert.equal(r.row, true); assert.notEqual(r.cur, 'CNY');
        assert.deepEqual(r.lock, { at1: true, lock1: 'pass', asked: 2, m2: 'uzs', m3: 'mixed', same: true, dis: 3, locked: true, m4: 'mixed' },
          'bir marta tanlanadi; 10 kun ichida — parol bilan (vaqt birinchi tanlovdan); keyin qulflangan');
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
  ],
};
