// P113 — v25.6.9: kirim shabloni valyuta bo'yicha (dollar / yuan / so'm); fayl valyutasi tanlangan valyutaga mos bo'lishi shart
const assert = require('node:assert/strict');
const { _helpers } = require('./p46-excel-shablon.test.js');
async function run() {
  await _helpers.withXlApp(async (page) => {
    const r = await page.evaluate(async () => {
      const out = {};
      for (const cur of ['USD', 'CNY', 'UZS']) {
        const wb = await fwBuildXlTemplate(cur), ws = wb.getWorksheet('Shablon');
        out[cur] = { head: ws.getRow(1).getCell(7).value, back: xlHeaderCur(ws.getRow(1).getCell(7).value), chakana: ws.getRow(1).getCell(8).value, guide: wb.getWorksheet("Yo'riqnoma").getRow(7).values.join(' ') };
      }
      // fayl yuan shabloni — tanlangan valyuta so'm → xato, hech narsa yozilmaydi
      const wb = await fwBuildXlTemplate('CNY'), ws = wb.getWorksheet('Shablon'); ws.addRow(['', 'YU-1', 'Yuan tovar', 'Asbob', '', 10, 108, 0, 0, '', '', '']);
      const buf = await wb.xlsx.writeBuffer(); const before = S.products.length;
      await __xlImport(buf, 'UZS');
      out.mismatch = { products: S.products.length - before, modal: /shabloni, siz esa/.test(document.getElementById('modal-ov').innerText) };
      await __xlImport(buf, 'CNY');   // mos valyuta — yoziladi, tannarx yuandan dollarga o'giriladi
      out.ok = { products: S.products.length - before, cost: (S.batches.slice(-1)[0] || {}).costUsd, cny: CUR.usdCny };
      return out;
    });
    assert.match(r.USD.head, /\$/); assert.match(r.CNY.head, /¥ yuan/); assert.match(r.UZS.head, /so'm/);
    assert.deepEqual([r.USD.back, r.CNY.back, r.UZS.back], ['USD', 'CNY', 'UZS']);
    assert.match(r.CNY.chakana, /\$/, 'chakana narx har doim $'); assert.match(r.UZS.guide, /FAQAT so'm/);
    assert.equal(r.mismatch.products, 0, 'valyuta mos emas — hech narsa yozilmadi'); assert.equal(r.mismatch.modal, true);
    assert.equal(r.ok.products, 1); assert.ok(Math.abs(r.ok.cost - 108 / r.ok.cny) < 0.5, `tannarx yuandan o'giriladi: ${r.ok.cost}`);
  });
}
module.exports = { name: 'P113 — Kirim shabloni valyuta', cases: [{ name: 'dollar/yuan/soʻm shablon sarlavhasi; valyuta mos kelmasa import rad; yuan→$ oʻgirish', run }] };
