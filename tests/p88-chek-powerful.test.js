// P88 — v25.2: POWERFUL GROUP cheki: narx/summa 0 tuzatildi, JAMI qatorlardan, PDF (rangli) va termo (80/58) ko'rinishlari,
// sozlamalar (nom, telefon, faoliyat, bannerlar, shior, Telegram havolasi) HTML'ga darhol aks etadi, termoda banner/rasm yo'q.
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;
const body = (h) => h.replace(/<style[\s\S]*?<\/style>/, '');
module.exports = {
  name: 'P88 — POWERFUL GROUP cheki: hisob, PDF/termo, sozlamalar',
  cases: [
    { name: 'Hisob: faqat lineUsd bor mahsulot (sinov cheki) 0 chiqmaydi; JAMI = qatorlar; 4 qator', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 1280, height: 900, admin: true });
      try {
        const r = await page.evaluate(() => {
          const old = fwReceiptCalc({ items: [{ sku: 'PG-0001', name: 'Sinov mahsulot', qty: 1, lineUsd: 12.5 }], totalUsd: 12.5, cur: 'USD' }, 0, false);
          const noTot = fwReceiptCalc({ items: [{ name: 'A', qty: 3, sellUsd: '4,5' }, { name: 'B', qty: 2, price: 10 }] }, 0, false);
          const none = fwReceiptCalc({ items: [{ name: 'X', qty: 2 }], totalUsd: 30 }, 0, false);
          const t1 = fwReceiptCalc(fwRcSample(1), 12500, false), t2 = fwReceiptCalc(fwRcSample(4), 12500, false);
          return { old, noTot, none, t1, t2 };
        });
        assert.deepEqual([r.old.lines[0].unit, r.old.lines[0].line, r.old.total], [12.5, 12.5, 12.5], 'lineUsd dan narx');
        assert.deepEqual([r.noTot.sum, r.noTot.total], [33.5, 33.5], 'jami yo\'q — qatorlar yig\'indisi');
        assert.deepEqual([r.none.lines[0].unit, r.none.lines[0].line], [15, 30], 'narx umuman yo\'q — jami miqdorga taqsimlanadi');
        assert.deepEqual([r.t1.lines[0].line, r.t1.total, r.t1.paid], [25, 25, 25], 'TEST 1');
        assert.deepEqual([r.t2.sum, r.t2.disc, r.t2.total, r.t2.given, r.t2.change], [177.05, 2.05, 175, 180, 5], 'TEST 2: 4 qator');
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
    { name: 'Rangli va termo (80/58) ko\'rinishlar; sozlamalar HTML\'da darhol; termoda banner yo\'q', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 1280, height: 900, admin: true });
      try {
        const r = await page.evaluate(async () => {
          const o = (rc, mm = 80) => fwReceiptHtml(fwRcSample(1), { brand: 'POWERFUL GROUP', widthMm: mm, rate: 12500, rc, mode: 'color' });
          const base = o({}), ch = o({ name: 'ABC SAVDO', slogan: '', phone: '+998901112233', activity: 'Yangi yoʻnalish', topOn: false, bottomOn: false, motto1: 'YANGI 1', motto2: 'YANGI 2', tg: 't.me/yangi' });
          const noTg = o({ tgOn: false }), noBn = o({ bannersOn: false }), noMotto = o({ mottoOn: false });
          const th = fwReceiptHtml(fwRcSample(4), { widthMm: 58, rate: 12500, mode: 'thermal' });
          const ifr = document.createElement('iframe'); ifr.style.cssText = 'position:fixed;left:0;top:0;width:219px;height:900px;border:0'; document.body.appendChild(ifr);
          await new Promise(res => { ifr.onload = res; ifr.srcdoc = th; });
          const d = ifr.contentDocument, vis = (sel) => [...d.querySelectorAll(sel)].some(e => getComputedStyle(e).display !== 'none');
          return { base, ch, noTg, noBn, noMotto, thBn: vis('.bn'), thLgc: vis('.lgc'), thLgt: vis('.lgt'), thBg: getComputedStyle(d.querySelector('.jm')).backgroundColor, thTxt: d.body.innerText };
        });
        const b = body(r.base);
        assert.match(b, /POWERFUL/); assert.match(b, /Lola jahon bozori 47B/); assert.match(b, /\+998883490888/); assert.match(b, /Arra • Asboblar • Tig‘lar/);
        assert.match(b, /BUGUNGI QADAM —<br>ERTANGI MUVAFFAQIYAT/); assert.match(b, /t\.me\/forwardtowardsdreams/); assert.match(b, /banner-top\.jpg/); assert.match(b, /banner-bottom\.jpg/);
        assert.match(b, /JAMI:<\/span><span>25\.00 \$/); assert.match(b, /2x/); assert.match(b, /12\.50 \$/); assert.match(b, /25\.00 \$/);
        const c = body(r.ch);
        assert.match(c, /ABC SAVDO/); assert.match(c, /\+998901112233/); assert.match(c, /Yangi yoʻnalish/); assert.doesNotMatch(c, /banner-/); assert.match(c, /YANGI 1<br>YANGI 2/); assert.match(c, /t\.me\/yangi/);
        assert.doesNotMatch(body(r.noTg), /t\.me\//, 'Telegram havolasi oʻchiriladi'); assert.doesNotMatch(body(r.noBn), /banner-/); assert.doesNotMatch(body(r.noMotto), /BUGUNGI QADAM/);
        assert.equal(r.thBn, false, 'termoda banner yoʻq'); assert.equal(r.thLgc, false, 'termoda rangli logo yoʻq'); assert.equal(r.thLgt, true, 'termoda oq-qora logo');
        assert.match(r.thBg, /255, 255, 255/, 'termoda JAMI qora blok emas'); assert.match(r.thTxt, /JAMI/);
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
    { name: 'Sozlamalar oynasi: har o\'zgarish ko\'rinishda darhol; saqlanadi; Telegram havola o\'zgaradi/o\'chadi', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 420, height: 900, admin: true });
      try {
        const get = () => page.evaluate(() => { const f = document.getElementById('rc-prev'); return f ? f.srcdoc : ''; });
        await page.evaluate(() => { _fwIsOwner = () => true; hasPerm = () => true; stReceiptDesign(); });
        await page.waitForTimeout(300);
        assert.match(await get(), /POWERFUL/);
        await page.fill('#rc-name', 'TEST DOKON'); await page.waitForTimeout(150); assert.match(await get(), /TEST<\/b>[\s\S]*DOKON/);
        await page.fill('#rc-phone', '+998 90 000 11 22'); await page.waitForTimeout(150); assert.match(await get(), /\+998 90 000 11 22/);
        await page.fill('#rc-activity', 'Mening faoliyatim'); await page.waitForTimeout(150); assert.match(await get(), /Mening faoliyatim/);
        await page.fill('#rc-tg', 't.me/boshqa'); await page.waitForTimeout(150); assert.match(await get(), /t\.me\/boshqa/);
        await page.fill('#rc-motto1', 'YANGI SHIOR'); await page.waitForTimeout(150); assert.match(await get(), /YANGI SHIOR/);
        await page.evaluate(() => { document.getElementById('rc-tgOn').click(); }); await page.waitForTimeout(150); assert.doesNotMatch((await get()).replace(/<style[\s\S]*?<\/style>/, ''), /t\.me\//);
        await page.evaluate(() => { document.getElementById('rc-bannersOn').click(); }); await page.waitForTimeout(150); assert.doesNotMatch(await get(), /banner-top\.jpg/);
        await page.evaluate(() => stRcMode(58)); await page.waitForTimeout(200); assert.match(await get(), /class="th"/);
        await page.evaluate(() => stRcSave());
        const saved = await page.evaluate(() => S.settings.rc);
        assert.equal(saved.name, 'TEST DOKON'); assert.equal(saved.tgOn, false); assert.equal(saved.bannersOn, false);
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
    { name: 'Chop etish: qog\'oz balandligi termo ko\'rinishda, PDF rangli', async run() {
      const { browser, page } = await openPage('index.html', { width: 1280, height: 900, admin: true });
      try {
        const r = await page.evaluate(async () => {
          const html = fwReceiptHtml(fwRcSample(4), { widthMm: 80, pdfMm: 80, rate: 12500 });
          const ifr = document.createElement('iframe'); ifr.style.cssText = 'position:fixed;left:0;top:0;width:302px;height:300px;border:0'; document.body.appendChild(ifr);
          await new Promise(res => { ifr.onload = res; ifr.srcdoc = html; });
          const d = ifr.contentDocument, colorH = d.body.offsetHeight; fwReceiptFitPage(d, 80);
          return { colorH, page: d.getElementById('fw-page-fit').textContent, hasBanner: getComputedStyle(d.querySelector('.bn')).display };
        });
        assert.equal(r.hasBanner, 'block', 'ekran/PDF — rangli (banner bor)');
        const mm = +/size:80mm (\d+)mm/.exec(r.page)[1]; assert.ok(mm * 96 / 25.4 < r.colorH, 'chop etish balandligi rangli ko\'rinishdan qisqa (bannersiz)');
      } finally { await browser.close(); }
    } },
  ],
};
