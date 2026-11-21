// P114 — v25.6.9: Excel kirim turi (bosh qoldiq / xarid / konsignatsiya) va miqdor 0 — mahsulot + sotuv narxi
const assert = require('node:assert/strict');
const { _helpers } = require('./p46-excel-shablon.test.js');
async function run() {
  await _helpers.withXlApp(async (page) => {
    const r = await page.evaluate(async () => {
      const out = {}; window.confirm = () => true;
      S.suppliers = [{ id: 5, name: 'Oddiy', debt: 0 }, { id: 6, name: 'Konsig', debt: 0, isConsignment: true }];
      const build = async (rows) => { const wb = await fwBuildXlTemplate('USD'); rows.forEach((r) => wb.getWorksheet('Shablon').addRow(r)); return wb.xlsx.writeBuffer(); };
      // 1) tur tanlovi: konsignatsiya — faqat konsignatsiya taʼminotchilari ko'rinadi
      openExcelImportModal(); const kind = document.getElementById('ei-kind'); kind.value = 'consign'; kind.dispatchEvent(new Event('change'));
      out.consVisible = [...document.getElementById('ei-supp').options].filter((o) => o.value && !o.hidden).map((o) => o.value);
      kind.value = 'supplier'; kind.dispatchEvent(new Event('change'));
      out.suppVisible = [...document.getElementById('ei-supp').options].filter((o) => o.value && !o.hidden).map((o) => o.value);
      // 2) miqdor 0 + tannarx + chakana/optom: mahsulot yaratiladi, ustama belgilanadi, ombor/batch o'zgarmaydi
      const buf = await build([['', 'NOL-1', 'Nol mahsulot', 'Asbob', '', 0, 10, 15, 12, '', '', ''], ['', 'NOL-2', 'Tannarxsiz', 'Asbob', '', 0, 0, 15, 0, '', '', '']]);
      const b0 = S.batches.length; await __xlImport(buf, 'USD');
      out.errModal = document.getElementById('modal-ov').innerText.slice(0, 200); out.p1 = S.products.find((p) => p.sku === 'NOL-1'); out.p2 = S.products.find((p) => p.sku === 'NOL-2'); out.b = S.batches.length - b0;
      closeModal && closeModal();
      const buf2 = await build([['', 'NOL-1', 'Nol mahsulot', 'Asbob', '', 0, 10, 15, 12, '', '', '']]);
      await __xlImport(buf2, 'USD'); out.okModal = document.getElementById('modal-ov').innerText.slice(0, 200); out.p1b = S.products.find((p) => p.sku === 'NOL-1'); out.b2 = S.batches.length - b0;
      return out;
    });
    assert.deepEqual(r.consVisible, ['6']); assert.deepEqual(r.suppVisible, ['5']);
    assert.match(r.errModal, /tannarx yo'q/, 'narx bor, tannarx yo\'q — aniq xato'); assert.equal(r.p2, undefined, 'xatoda hech narsa yozilmadi'); assert.equal(r.b, 0);
    assert.ok(r.p1b, 'miqdor 0 — mahsulot yaratildi'); assert.equal(r.p1b.markupPct, 50); assert.equal(r.p1b.optMarkupPct, 20); assert.equal(r.b2, 0, 'omborga tovar tushmadi');
    assert.match(r.okModal, /omborga tovar tushmadi/i);
  });
}
module.exports = { name: 'P114 — Kirim turi va miqdor 0', cases: [{ name: 'kirim turi (konsignatsiya filtri); miqdor 0 — mahsulot + sotuv narxi (ustama), omborga tovar tushmaydi; tannarxsiz narx — xato', run }] };
