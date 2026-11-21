// P98 — v25.6.4: Excel kirimini QAYTA YUKLASHDAN himoya. Avval bir xil fayl ikkinchi marta yuklansa jimgina ikkinchi partiya ochilar,
// qoldiq ikki baravar bo'lardi (prod'da 806 mahsulot 3 martagacha takrorlangan). Endi:
//  • shu mahsulotlarda xuddi shu miqdorli Excel kirimi allaqachon omborda bo'lsa — aniq ogohlantirish, «Bekor» — hech narsa yozilmaydi;
//  • faylning o'zida kod takrorlangan bo'lsa — ogohlantirish;
//  • yangi mahsulotlar / boshqa miqdor / yarim qolgan importni davom ettirish — so'ralmaydi (halal bermaydi).
const assert = require('node:assert/strict');
const { _helpers } = require('./p46-excel-shablon.test.js');
const { withXlApp } = _helpers;

// bitta .xlsx: rows = [[sku, name, qty, cost], ...]
const MK = `window.__mk = async (rows) => { const wb = await fwBuildXlTemplate(); const ws = wb.getWorksheet('Shablon'); rows.forEach(r => ws.addRow(['', r[0], r[1], 'Asbob', '', r[2], r[3], '', ''])); return wb.xlsx.writeBuffer(); };
  window.__asks = []; window.__ans = true; confirm = (m) => { __asks.push(String(m)); return !!__ans; };`;
const batchesOf = (page) => page.evaluate(() => S.batches.filter(b => b.status === 'active').length);

async function testSameFileTwice() {
  await withXlApp(async (page) => {
    await page.evaluate(MK);
    const rows = [['D-1', 'Disk 1', 10, 2], ['D-2', 'Disk 2', 5, 3], ['D-3', 'Disk 3', 7, 4], ['D-4', 'Disk 4', 1, 9]];
    const r = await page.evaluate(async (rows) => {
      await __xlImport(await __mk(rows));                      // 1-yuklash — so'ralmaydi
      const first = { b: S.batches.length, asks: __asks.length };
      __ans = false; await __xlImport(await __mk(rows));       // 2-yuklash, «Bekor»
      const second = { b: S.batches.length, asks: __asks.slice(), btn: document.getElementById('ei-submit-btn').disabled, nProd: S.products.length };
      __ans = true; await __xlImport(await __mk(rows));        // 3-yuklash, «Baribir yuklash»
      return { first, second, third: S.batches.length, counter: S.batchCounter };
    }, rows);
    assert.deepEqual(r.first, { b: 4, asks: 0 }, "birinchi yuklash — savolsiz");
    assert.equal(r.second.b, 4, "«Bekor» — hech narsa yozilmadi"); assert.equal(r.second.asks.length, 1);
    assert.match(r.second.asks[0], /avval yuklangan/i); assert.match(r.second.asks[0], /4 \/ 4/); assert.match(r.second.asks[0], /ikki baravar/i);
    assert.equal(r.second.btn, false, "tugma qayta ochildi");
    assert.equal(r.third, 8, "«Baribir yuklash» — ruxsat bilan yuklanadi");
  });
}

async function testNoFalseAlarm() {
  await withXlApp(async (page) => {
    await page.evaluate(MK);
    const r = await page.evaluate(async () => {
      await __xlImport(await __mk([['A-1', 'A1', 10, 2], ['A-2', 'A2', 5, 3], ['A-3', 'A3', 7, 4]]));
      __asks.length = 0;
      await __xlImport(await __mk([['A-1', 'A1', 11, 2], ['A-2', 'A2', 6, 3], ['A-3', 'A3', 8, 4]]));   // boshqa miqdor — yangi kirim
      const diffQty = { asks: __asks.length, b: S.batches.length };
      await __xlImport(await __mk([['N-1', 'Yangi 1', 3, 1], ['N-2', 'Yangi 2', 3, 1]]));              // yangi mahsulotlar
      const fresh = { asks: __asks.length, b: S.batches.length };
      // qisman moslik: 1 tasi bir xil, 3 tasi yangi (< 50%) — so'ralmaydi
      await __xlImport(await __mk([['N-1', 'Yangi 1', 3, 1], ['Z-1', 'Z1', 1, 1], ['Z-2', 'Z2', 1, 1], ['Z-3', 'Z3', 1, 1]]));
      return { diffQty, fresh, partial: { asks: __asks.length, b: S.batches.length } };
    });
    assert.deepEqual(r.diffQty, { asks: 0, b: 6 }, "boshqa miqdor — to'g'ri kirim, so'ralmaydi");
    assert.deepEqual(r.fresh, { asks: 0, b: 8 }); assert.deepEqual(r.partial, { asks: 0, b: 12 }, "yarmidan kami mos — so'ralmaydi");
  });
}

async function testDuplicateSkuInFile() {
  await withXlApp(async (page) => {
    await page.evaluate(MK);
    const r = await page.evaluate(async () => {
      __ans = false;
      await __xlImport(await __mk([['K-1', 'K1', 10, 2], ['K-2', 'K2', 5, 3], ['K-1', 'K1', 10, 2]]));   // K-1 ikki marta
      const cancelled = { b: S.batches.length, p: S.products.length, asks: __asks.slice() };
      __ans = true; __asks.length = 0;
      await __xlImport(await __mk([['K-1', 'K1', 10, 2], ['K-2', 'K2', 5, 3], ['K-1', 'K1', 10, 2]]));
      return { cancelled, ok: S.batches.length, asks: __asks.length };
    });
    assert.equal(r.cancelled.b, 0, "bekor — hech narsa yozilmadi"); assert.equal(r.cancelled.p, 2, "yangi mahsulotlar ham yaratilmadi (faqat boshlang'ich 2 ta)");
    assert.match(r.cancelled.asks[0], /1 ta kod takrorlangan/); assert.match(r.cancelled.asks[0], /K-1/);
    assert.equal(r.ok, 3, "ruxsat bilan — har qator alohida kirim"); assert.equal(r.asks, 1);
  });
}

function pureTest() {
  // xlDupCheck sof funksiya (sahifasiz tekshiriladigan qismi): chegara — mos qatorlarning kamida yarmi
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'main.js'), 'utf8');
  assert.match(src, /function xlDupCheck\(rows\)/); assert.match(src, /xlDupCheck\(rows\)[\s\S]{0,400}confirm\(/, 'import oqimida ishlatiladi');
}

module.exports = { name: "P98 — Excel kirimini qayta yuklashdan himoya (v25.6.4)", cases: [
  { name: "bir xil fayl ikkinchi marta: ogohlantirish; «Bekor» — hech narsa yozilmaydi; «Baribir» — yuklanadi", run: testSameFileTwice },
  { name: "yolg'on signal yo'q: boshqa miqdor, yangi mahsulot, yarmidan kami moslik — so'ralmaydi", run: testNoFalseAlarm },
  { name: "faylning o'zida kod takrorlangan: ogohlantirish; bekor qilinsa yangi mahsulotlar ham yaratilmaydi", run: testDuplicateSkuInFile },
  { name: "himoya import oqimiga ulangan", run: pureTest },
] };
