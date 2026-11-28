// P131 — v25.6.10 (egasi: ALTECO/DeWalt shabloni «Fayl noto'g'ri formatda: Cannot read properties of undefined (reading 'anchors')»):
// Python (openpyxl) yaratgan .xlsx — bog'lanishlar «/xl/...» absolyut yo'l, rasm joylashuvi «xdr:» prefikssiz.
// Excel ochadi, ExcelJS esa yiqiladi. Ilova faylni standart ko'rinishga keltirib qayta o'qiydi: qatorlar ham, rasmlar ham.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./helpers/load-app');
const xlJs = () => require('./helpers/cdn-cache').excelJsPath();   // kesh yo'q bo'lsa — yuklab oladi (testlar tartibiga bog'liq emas)
const FIX = fs.readFileSync(path.join(__dirname, 'fixtures', 'openpyxl-rasmli-kirim.xlsx')).toString('base64');

async function run() {
  const { browser, page, consoleErrors } = await loadApp({});
  try {
    await page.addScriptTag({ path: xlJs() });
    const r = await page.evaluate(async (b64) => {
      document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div>');
      save = () => {}; pgKirim = () => {}; _cloudEnabled = true; FWL.on = true; localStorage.removeItem('fw_xl_import_prog');
      Object.assign(S, { branch: 'baza', batchCounter: 3, batches: [], products: [], suppliers: [{ id: 5, name: 'ALTECO', debt: 0, isConsignment: true, debtCur: 'UZS', debtUzs: 0 }] });
      const calls = [];
      fwLedgerCall = async (fn, b) => { calls.push(b.payload); return {}; };
      uploadImageToStorage = async (d, pid) => 'https://x.test/p' + pid + '.jpeg';
      const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      // 1) ExcelJS o'zi — yiqiladi (muammo haqiqiy)
      let raw = null; try { await new ExcelJS.Workbook().xlsx.load(buf.slice(0)); } catch (e) { raw = e.message; }
      // 2) ilovaning yuklovchisi — o'qiydi, rasmlar bilan
      const wb = new ExcelJS.Workbook(); await xlLoad(wb, buf.slice(0)); const ws = wb.worksheets[0];
      // 3) to'liq import oynasi orqali: konsignatsiya, ta'minotchi, so'm
      openExcelImportModal();
      document.getElementById('ei-kind').value = 'consign'; eiKindChange();
      document.getElementById('ei-supp').value = '5';
      const cur = document.getElementById('ei-cur'); if (cur) { cur.value = 'UZS'; cur.dispatchEvent(new Event('change')); }
      const dt = new DataTransfer(); dt.items.add(new File([buf], 'ALTECO.xlsx')); document.getElementById('ei-file').files = dt.files;
      await importBatchXlsx(); await new Promise(r => setTimeout(r, 300));
      return { raw, rows: ws.rowCount, imgs: ws.getImages().length, text: document.querySelector('#modal-ov')?.textContent || '',
        prods: S.products.map(p => [p.sku, p.name, !!p.image]), batches: S.batches.map(b => [b.qty]), calls: calls.length,
        toast: [...document.querySelectorAll('.toast, .fw-toast')].map(t => t.textContent).join(' | ') };
    }, FIX);
    assert.match(String(r.raw), /anchors/, 'ExcelJS o\'zi bu faylda yiqiladi');
    assert.equal(r.rows, 4); assert.equal(r.imgs, 2, 'ikkala rasm o\'qildi');
    assert.doesNotMatch(r.toast, /noto.g.ri formatda/, 'format xatosi yo\'q: ' + r.toast);
    assert.deepEqual(r.prods.map(p => p[0]).sort(), ['OP-1', 'OP-2', 'OP-3'], 'uchala mahsulot qo\'shildi');
    assert.equal(r.prods.filter(p => p[2]).length, 2, 'rasmli ikkita mahsulotga rasm bog\'landi');
    assert.ok(r.calls >= 1, 'kirim serverga yuborildi');
    assert.deepEqual(consoleErrors, []);
  } finally { await browser.close(); }
}

// 56: so'mdagi ta'minotchi — partiyalar ANIQ so'm narxi bilan belgilanadi; dollardagi ta'minotchi — ogohlantirish (Bekor — hech narsa yozilmaydi)
async function somSupplier() {
  const { browser, page, consoleErrors } = await loadApp({});
  try {
    await page.addScriptTag({ path: xlJs() });
    const r = await page.evaluate(async (b64) => {
      document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div>');
      save = () => {}; pgKirim = () => {}; _cloudEnabled = true; FWL.on = true; localStorage.removeItem('fw_xl_import_prog');
      uploadImageToStorage = async (d, pid) => 'https://x.test/p' + pid + '.jpeg';
      const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const run = async (supp, confirmAns) => {
        Object.assign(S, { branch: 'baza', batchCounter: 3, batches: [], products: [], suppliers: [supp] });
        const calls = []; fwLedgerCall = async (fn, b) => { calls.push(b); return {}; };
        let asked = 0; window.confirm = () => { asked++; return confirmAns; }; window.__t = []; const _t0 = toast; toast = (m) => { __t.push(String(m)); };
        localStorage.removeItem('fw_xl_import_prog');
        openExcelImportModal(); document.getElementById('ei-kind').value = 'consign'; eiKindChange();
        document.getElementById('ei-supp').value = String(supp.id);
        const cur = document.getElementById('ei-cur'); cur.value = 'UZS'; cur.dispatchEvent(new Event('change'));
        const dt = new DataTransfer(); dt.items.add(new File([buf.slice(0)], 'A.xlsx')); document.getElementById('ei-file').files = dt.files;
        await importBatchXlsx(); await new Promise(r => setTimeout(r, 200));
        const acc = calls.find(c => c.kind === 'acc_uzs');
        return { asked, dbg: (document.querySelector('#modal-ov')?.textContent || '').slice(-300) + ' TOAST ' + __t.join(' | ') + ' CREATED ' + calls.map(c=>c.kind).join(',') + ' SUPPSEL ' + document.getElementById('ei-supp')?.value + ' OPTS ' + [...(document.getElementById('ei-supp')?.options||[])].map(o=>o.value).join('/'), created: calls.filter(c => c.kind === 'batches_create').length, mark: acc ? acc.payload.mark : null,
          batches: S.batches.map(b => [b.accCur, b.costUzs, b.goodsUzs]) };
      };
      const som = await run({ id: 9, name: 'ALTECO', debt: 0, isConsignment: true, debtCur: 'UZS', debtUzs: 0 }, true);
      const usdNo = await run({ id: 10, name: 'DollarCo', debt: 0, isConsignment: true }, false);
      return { som, usdNo };
    }, FIX);
    assert.equal(r.som.asked, 0, 'so\'mdagi ta\'minotchi — ogohlantirish yo\'q');
    assert.equal(r.som.created, 1);
    const op1 = r.som.mark && r.som.mark.find(m => m.goodsUzs === 2595800);
    assert.ok(op1 && op1.costUzs === 2595800, 'OP-1: aniq 2 595 800 so\'m serverga: ' + JSON.stringify(r.som.mark));
    assert.equal(r.som.mark.length, 2, 'miqdori bor ikkala partiya so\'mda belgilandi (OP-3 miqdori 0)');
    assert.ok(r.som.batches.every(b => b[0] === 'UZS'), 'qurilmada ham so\'mda');
    assert.equal(r.usdNo.asked, 1, 'dollardagi ta\'minotchi — ogohlantirish: ' + r.usdNo.dbg);
    assert.equal(r.usdNo.created, 0, 'Bekor — hech narsa yozilmadi');
    assert.deepEqual(consoleErrors, []);
  } finally { await browser.close(); }
}

module.exports = { name: "P131 — Excel: openpyxl fayli (absolyut yo'l, prefikssiz rasm joylashuvi)", cases: [
  { name: "«reading 'anchors'» xatosi yo'q — qatorlar va rasmlar o'qiladi, kirim yoziladi", run },
  { name: "so'mdagi ta'minotchi — aniq so'm narx serverga; dollardagi — ogohlantirish, Bekor — hech narsa yozilmaydi", run: somSupplier },
] };
