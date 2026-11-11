// P50 — v24.5 audit: CHEK (58 / 72 / 80 mm) va A4 hujjat — haqiqiy Chromium render + PDF (vektor) + PDF matnini ajratib olish.
//  • Mahsulot nomi va miqdori BITTA qatorda (nomning birinchi qatori bilan «× son» bir xil balandlikda).
//  • Nom hech qachon jimgina kesilmaydi: uzun nom, bo'sh joysiz uzun so'z, kirill/o'zbek harflari — to'liq, o'raladi.
//  • Gorizontal toshish yo'q (har kenglikda). Summa, SKU, JAMI — PDF matnida bor.
//  • Kurs noma'lum bo'lsa — qattiq 12 800 bilan noto'g'ri so'm chiqmaydi ($ da ko'rsatiladi).
//  • A4 (sanash varag'i): uzun nomlar to'liq, sahifa A4 o'lchamida.
// PDF matni `pdftotext -layout` bilan olinadi (o'rnatilmagan bo'lsa — test BLOCKED sifatida xato beradi, PASS bo'lmaydi).
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadApp } = require('./helpers/load-app');

const LONG = 'Perforator Bosch GBH 2-28 F Professional SDS-plus 880 Vt kuchaytirilgan qutisi bilan (toʻplam)';
const NOSPACE = 'SUPERUZUNNOMBOSHJOYSIZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SALE = {
  inv: 'S-2026-000123', date: '2026-10-14', custName: 'Aliyev Vali', staffName: 'Sotuvchi 1', cur: 'UZS', rateUsdUzs: 12500,
  items: [
    { name: LONG, qty: 2, sellUsd: 80, sku: 'BSH-GBH-228F-PRO' },
    { name: NOSPACE, qty: 1, sellUsd: 1.5, sku: 'X1' },
    { name: 'Shurup 4x40', qty: 1250, sellUsd: 0.02, sku: 'SH-440' },
    { name: 'Gʻisht — qizil (M-150)', qty: 3, sellUsd: 0.4 },
  ],
  totalUsd: 2 * 80 + 1.5 + 1250 * 0.02 + 3 * 0.4, discUsd: 0, paidUsd: 0, debtUsd: 0,
};
// pdftotext so'z bo'linishidagi «-» ni olib tashlaydi (SDS-plus → SDSplus) — solishtirishda chiziqcha hisobga olinmaydi
const norm = (s) => String(s).replace(/[\s\-‐]+/g, '');

function pdfText(file, layout = true) {
  try { return execFileSync('pdftotext', [...(layout ? ['-layout'] : []), '-enc', 'UTF-8', file, '-'], { encoding: 'utf8' }); }
  catch (e) { throw new Error('BLOCKED: pdftotext ishlamadi — ' + (e.code || e.message)); }
}

async function renderAndCheck(browser, html, widthMm, tmp) {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const rows = [...document.querySelectorAll('.it')].map(r => {
        const nm = r.querySelector('.nm'), q = r.querySelector('.q');
        const nr = nm.getClientRects()[0], qr = q.getBoundingClientRect();
        return { name: nm.textContent, q: q.textContent, nmTop: nr.top, qTop: qr.top, nmBottom: nr.bottom, qOver: qr.right - de.clientWidth, nmOverflow: nm.scrollWidth > nm.clientWidth + 1 };
      });
      return { sw: de.scrollWidth, cw: de.clientWidth, bodySw: document.body.scrollWidth, bodyCw: document.body.clientWidth, h: de.scrollHeight, rows };
    });
    assert.ok(m.sw <= m.cw && m.bodySw <= m.bodyCw + 1, `${widthMm}mm: gorizontal toshish yo'q (${m.bodySw} > ${m.bodyCw})`);
    for (const r of m.rows) {
      assert.ok(Math.abs(r.nmTop - r.qTop) < 3, `${widthMm}mm: «${r.name.slice(0, 20)}…» nomi va miqdori bitta qatorda (${r.nmTop} vs ${r.qTop})`);
      assert.equal(r.nmOverflow, false, `${widthMm}mm: nom kesilmagan`);
      assert.ok(r.qOver <= 0.5, `${widthMm}mm: miqdor qog'oz ichida`);
    }
    assert.deepEqual(m.rows.map(r => r.name), SALE.items.map(i => i.name), `${widthMm}mm: nomlar to'liq (DOM)`);
    const file = path.join(tmp, `chek-${widthMm}.pdf`);
    await page.pdf({ path: file, width: `${widthMm}mm`, height: `${Math.ceil(m.h * 25.4 / 96) + 10}mm`, printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    const txt = pdfText(file), raw = pdfText(file, false).replace(/×\s*\d[\d ,.]*/g, '');   // «× son» nom bilan bir qatorda — nom matnidan ajratiladi
    if (process.env.P50_DEBUG) console.log(raw, '\n-----\n', txt);
    for (const it of SALE.items) {
      assert.ok(norm(raw).includes(norm(it.name)), `${widthMm}mm PDF: «${it.name.slice(0, 25)}…» to'liq`);
      // nomning boshi va «× son» PDF matnida ham BITTA qatorda
      const line = txt.split('\n').find(l => norm(l).startsWith(norm(it.name).slice(0, 6)));
      assert.ok(line && line.includes('× ' + String(it.qty).replace(/\B(?=(\d{3})+(?!\d))/g, ' '))   /* v25: guruhlangan «× 1 250» */, `${widthMm}mm PDF: nom va miqdor bitta qatorda: ${JSON.stringify(line)}`);
    }
    assert.ok(/JAMI/.test(txt) && norm(raw).includes('BSH') && norm(raw).includes('GBH228FPRO'), `${widthMm}mm PDF: JAMI va SKU bor (58 mm da SKU o'ralishi mumkin)`);
    assert.ok(norm(raw).includes('2000000'), `${widthMm}mm PDF: qator summasi (2 × 80$ × 12 500)`);
    return { widthMm, heightPx: m.h, pdfBytes: fs.statSync(file).size };
  } finally { await page.close(); }
}

async function testReceipts() {
  const { browser, page } = await loadApp({});
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-chek-'));
  try {
    const out = [];
    for (const mm of [58, 72, 80]) {
      const html = await page.evaluate(([s, w]) => fwReceiptHtml(s, { brand: 'Powerful PRO', widthMm: w, rate: 12500 }), [SALE, mm]);
      assert.ok(!/\.slice\(/.test(html));
      out.push(await renderAndCheck(browser, html, mm, tmp));
    }
    // kurs noma'lum: qattiq 12 800 emas — $ da
    const noRate = await page.evaluate((s) => fwReceiptHtml({ ...s, rateUsdUzs: 0 }, { widthMm: 58 }), SALE);
    assert.ok(!/soʻm/.test(noRate.split('<div class="div"></div>')[1] || ''), "kurs yo'q — so'm summasi to'qilmaydi");
    assert.ok(/\$/.test(noRate), "kurs yo'q — $ da");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); await browser.close(); }
}

async function testA4() {
  const { browser, page } = await loadApp({});
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-a4-'));
  try {
    const html = await page.evaluate(([long, nospace]) => {
      let captured = null; fwDoc = (o) => { captured = o; };
      S.products = [{ id: 1, sku: 'BSH-GBH-228F-PRO', name: long, cat: 'Asboblar', unit: 'dona' }, { id: 2, sku: 'X1', name: nospace, cat: 'Asboblar' }];
      _revProducts = () => S.products; getStock = () => 7; closeSheet = () => {};
      revDoPrint(true);
      return captured && captured.kind === 'a4' ? captured.html : null;
    }, [LONG, NOSPACE]);
    assert.ok(html, 'A4 hujjat fwDoc orqali (kind=a4)');
    const p2 = await browser.newPage();
    await p2.setContent(html, { waitUntil: 'load' });
    const over = await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const file = path.join(tmp, 'a4.pdf');
    await p2.pdf({ path: file, format: 'A4', preferCSSPageSize: true });
    await p2.close();
    const txt = pdfText(file, false);
    if (process.env.P50_DEBUG) console.log(txt);
    assert.ok(norm(txt).includes(norm(LONG)), 'A4 PDF: uzun nom to\'liq');
    assert.ok(norm(txt).includes(norm(NOSPACE)) , 'A4 PDF: bo\'sh joysiz uzun nom to\'liq');
    const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
    const sz = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info);
    assert.ok(sz && Math.abs(+sz[1] - 595.28) < 2 && Math.abs(+sz[2] - 841.89) < 2, 'A4 o\'lcham: ' + (sz && sz[0]));
    assert.ok(over <= 0, 'A4: gorizontal toshish yo\'q');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); await browser.close(); }
}

// Ilovadagi «PDF yuklab olish» (html2pdf, vendored): qog'oz kengligi chek o'lchamiga teng, bo'sh emas.
// Eslatma: html2pdf sahifani RASM sifatida joylaydi — bu PDF'dan matn ajratib bo'lmaydi (cheklov hisobotda).
async function testHtml2pdf() {
  const { browser, page } = await loadApp({});
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-h2p-'));
  try {

    // (PDF kutubxonasi yashirin iframe ichida /js/vendor/… dan yuklanadi — production bilan bir xil)
    for (const mm of [58, 80]) {
      const b64 = await page.evaluate(async ([s, w]) => {
        fwDoc({ title: 'Chek', kind: 'receipt', widthMm: w, html: fwReceiptHtml(s, { brand: 'Powerful PRO', widthMm: w, rate: 12500 }) });
        const fr = document.getElementById('fw-doc-frame');
        await new Promise(r => { if (fr.contentDocument && fr.contentDocument.readyState === 'complete' && fr.contentDocument.body && fr.contentDocument.body.children.length) r(); else fr.addEventListener('load', r, { once: true }); });
        const blob = await fwDocBlob();
        const buf = new Uint8Array(await blob.arrayBuffer()); let bin = ''; for (const x of buf) bin += String.fromCharCode(x);
        fwDocClose(); return btoa(bin);
      }, [SALE, mm]);
      const file = path.join(tmp, `h2p-${mm}.pdf`); fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      if (process.env.P50_KEEP) fs.copyFileSync(file, path.join(process.env.P50_KEEP, `h2p-${mm}.pdf`));
      const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
      const sz = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info);
      assert.ok(sz && Math.abs(+sz[1] - mm * 72 / 25.4) < 1.5, `${mm}mm: PDF kengligi ${sz && sz[1]}pt`);
      assert.ok(+sz[2] > +sz[1], `${mm}mm: chek uzunasiga (balandlik > kenglik)`);
      assert.ok(/Pages:\s+1\b/.test(info), `${mm}mm: bitta uzun sahifa (2 sahifaga bo'linmaydi) — ${(/Pages:\s+\d+/.exec(info) || [""])[0]}`);
      assert.ok(fs.statSync(file).size > 5000, `${mm}mm: PDF bo'sh emas`);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); await browser.close(); }
}

// Ilovadagi A4 «PDF yuklab olish» (html2pdf): 120 qatorli sanash varag'i — A4 sahifalar, bir necha sahifa, bo'sh emas
async function testA4Html2pdf() {
  const { browser, page } = await loadApp({});
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-a4h-'));
  try {
    const b64 = await page.evaluate(async (long) => {
      S.products = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, sku: 'SKU-' + i, name: (i % 7 ? 'Mahsulot ' + i : long), cat: 'K' + (i % 4), unit: 'dona' }));
      _revProducts = () => S.products; getStock = () => 5; closeSheet = () => {};
      revDoPrint(true);
      const fr = document.getElementById('fw-doc-frame'); await new Promise(r => setTimeout(r, 500));
      const blob = await fwDocBlob();
      const buf = new Uint8Array(await blob.arrayBuffer()); let bin = ''; for (const x of buf) bin += String.fromCharCode(x);
      fwDocClose(); return btoa(bin);
    }, LONG);
    const file = path.join(tmp, 'a4h.pdf'); fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    if (process.env.P50_KEEP) fs.copyFileSync(file, path.join(process.env.P50_KEEP, 'a4-html2pdf.pdf'));
    const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
    const sz = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info), pages = +(/Pages:\s+(\d+)/.exec(info) || [])[1];
    assert.ok(sz && Math.abs(+sz[1] - 595.28) < 2 && Math.abs(+sz[2] - 841.89) < 2, 'A4: ' + (sz && sz[0]));
    assert.ok(pages >= 3, '120 qator — bir necha sahifa: ' + pages);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); await browser.close(); }
}

module.exports = {
  name: 'P50 — v24.5 audit: chek 58/72/80 mm va A4 — Chromium render, vektor PDF, matn ajratish (nom+miqdor bitta qatorda, kesilmaydi)',
  cases: [
    { name: "Chek 58/72/80 mm: nom va miqdor bitta qatorda, nom to'liq (o'raladi), toshish yo'q, PDF matnida hammasi; kurs yo'q — $", run: testReceipts },
    { name: "Ilovadagi PDF (html2pdf): 58/80 mm kenglik, bitta uzun sahifa, bo'sh emas", run: testHtml2pdf },
    { name: "Ilovadagi A4 PDF (html2pdf): 120 qatorli varaq — A4, bir necha sahifa", run: testA4Html2pdf },
    { name: "A4 sanash varag'i: uzun nomlar to'liq, A4 o'lcham, toshish yo'q (PDF matni)", run: testA4 },
  ],
};
