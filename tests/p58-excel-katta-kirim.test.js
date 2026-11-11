// P58 — v24.6 (egasi talabi): Excel orqali katta kirim (1000+ qator) — tez va xatosiz.
//  • Server bir so'rovda ≤500 partiya qabul qiladi: fayl 400 talik qismlarga bo'linadi (avval 500+ qator — butun fayl rad etilardi).
//  • Ta'minotchi qarzi — har qismning o'z tovar qiymati (jami = fayl summasi).
//  • Aloqa o'rtada uzilsa: saqlangan qismlar omborda, «qisman saqlandi» oynasi; xuddi shu faylni qayta yuklash — faqat qolgani
//    (o'sha partiya ID'lari, takror yo'q), sahifa yangilangandan keyin ham (holat qurilmada saqlanadi).
//  • Rasm yuklanmasa — xom base64 bazaga yozilmaydi (eski rasm qoladi), rasmlar parallel yuklanadi.
const assert = require('node:assert/strict');
const fs = require('fs'); const path = require('path');
const { loadApp } = require('./helpers/load-app');
const XLJS = [process.env.FW_CDN_DIR && path.join(process.env.FW_CDN_DIR, 'exceljs@4.4.0', 'package', 'dist', 'exceljs.min.js'),
  path.join(require('os').tmpdir(), 'fw-cdn-cache', 'exceljs@4.4.0', 'package', 'dist', 'exceljs.min.js'), // p42 testi yaratadigan standart kesh
  path.join(__dirname, '..', 'node_modules', 'exceljs', 'dist', 'exceljs.min.js')].filter(Boolean).find(p => fs.existsSync(p));

async function withApp(fn) {
  const { browser, page, consoleErrors } = await loadApp({});
  try {
    await page.addScriptTag({ path: XLJS });
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div>');
      save = () => {}; pgKirim = () => {}; _cloudEnabled = true; FWL.on = true; localStorage.removeItem('fw_xl_import_prog');
      Object.assign(S, { branch: 'baza', batchCounter: 3, batches: [], products: [], suppliers: [{ id: 5, name: 'T', debt: 0 }] });
      window.__srv = { calls: [], failAt: -1, ids: new Set() };
      fwLedgerCall = async (fn, b) => {
        const p = b.payload; __srv.calls.push({ n: p.batches.length, goods: p.supplier && p.supplier.goodsUsd });
        if (p.batches.length > 500) throw new Error("Partiyalar ro'yxati noto'g'ri");
        if (__srv.calls.length === __srv.failAt) throw new Error("Server bilan aloqa yo'q — qayta urinib ko'ring");
        for (const x of p.batches) { if (__srv.ids.has(x.localId)) throw new Error('partiya ID takrorlandi'); }
        p.batches.forEach(x => __srv.ids.add(x.localId)); return {};
      };
      window.__file = async (n, img) => {
        const wb = await fwBuildXlTemplate(); const ws = wb.getWorksheet('Shablon');
        for (let i = 0; i < n; i++) ws.addRow(['', 'K-' + i, 'Mahsulot ' + i, 'Kat', '', 2, 1.5, '', '']);
        return wb.xlsx.writeBuffer();
      };
      window.__imp = async (buf, supp) => {
        openExcelImportModal(); if (supp) document.getElementById('ei-supp').value = String(supp);
        const dt = new DataTransfer(); dt.items.add(new File([buf], 'k.xlsx')); document.getElementById('ei-file').files = dt.files;
        await importBatchXlsx(); const t = document.querySelector('#modal-ov')?.textContent || ''; return t;
      };
    });
    await fn(page);
    assert.deepEqual(consoleErrors, [], "sahifada JS xatosi yo'q");
  } finally { await browser.close(); }
}

module.exports = {
  name: 'P58 — Excel katta kirim (1000 qator)',
  cases: [
    { name: '1000 qator — 400/400/200 qism, hammasi omborda, qarz = jami, bitta partiya raqami', async run() {
      await withApp(async (page) => {
        const r = await page.evaluate(async () => {
          const t0 = performance.now(); await __imp(await __file(1000), 5); const ms = performance.now() - t0;
          return { calls: __srv.calls.map(c => c.n), goods: Math.round(__srv.calls.reduce((t, c) => t + c.goods, 0) * 100) / 100,
            batches: S.batches.length, uniq: new Set(S.batches.map(b => b.id)).size, bno: [...new Set(S.batches.map(b => b.bno))], counter: S.batchCounter,
            prods: S.products.length, prog: localStorage.getItem('fw_xl_import_prog'), ms };
        });
        assert.deepEqual(r.calls, [400, 400, 200]);
        assert.equal(r.goods, 3000, 'qarz: 1000 × 2 × 1.5');
        assert.deepEqual([r.batches, r.uniq, r.prods, r.counter], [1000, 1000, 1000, 4]);
        assert.deepEqual(r.bno, ['04']); assert.equal(r.prog, null);
        assert.ok(r.ms < 15000, `tez: ${r.ms} ms`);
      });
    } },
    { name: "aloqa 2-qismda uzilsa — 400 tasi saqlanadi; sahifa yangilangandan keyin qayta yuklash — faqat qolgan 600, takror yo'q", async run() {
      await withApp(async (page) => {
        const r1 = await page.evaluate(async () => {
          __srv.failAt = 2; const buf = await __file(1000); window.__buf = buf;
          const t = await __imp(buf, null);
          return { t, batches: S.batches.length, calls: __srv.calls.length, prog: JSON.parse(localStorage.getItem('fw_xl_import_prog')).done };
        });
        assert.match(r1.t, /QISMAN/); assert.match(r1.t, /400/); assert.equal(r1.batches, 400); assert.deepEqual(r1.prog, [0]);
        const r2 = await page.evaluate(async () => {
          // «sahifa yangilandi»: xotiradagi ID keshi yo'qoladi, mahsulotlar va partiyalar serverdan (o'sha holat) keladi
          fwStableIdsDone('import'); closeModal(); __srv.failAt = -1; __srv.calls = [];
          const t = await __imp(__buf, null);
          return { calls: __srv.calls.map(c => c.n), batches: S.batches.length, uniq: new Set(S.batches.map(b => b.id)).size,
            bno: [...new Set(S.batches.map(b => b.bno))], prods: S.products.length, prog: localStorage.getItem('fw_xl_import_prog'), t };
        });
        assert.deepEqual(r2.calls, [400, 200], 'faqat saqlanmagan qismlar');
        assert.deepEqual([r2.batches, r2.uniq, r2.prods], [1000, 1000, 1000]);
        assert.deepEqual(r2.bno, ['04'], 'o\'sha partiya raqami'); assert.equal(r2.prog, null);
      });
    } },
    { name: '1-qismning o\'zi saqlanmasa — hech narsa o\'zgarmaydi (avvalgidek)', async run() {
      await withApp(async (page) => {
        const r = await page.evaluate(async () => { __srv.failAt = 1; await __imp(await __file(10), 5); return { b: S.batches.length, p: S.products.length, d: S.suppliers[0].debt }; });
        assert.deepEqual(r, { b: 0, p: 0, d: 0 });
      });
    } },
    { name: "rasm yuklanmasa — base64 bazaga yozilmaydi (eski rasm qoladi); rasmlar parallel", async run() {
      await withApp(async (page) => {
        const r = await page.evaluate(async () => {
          let live = 0, peak = 0, k = 0;
          uploadImageToStorage = async (d, pid) => { live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 20)); live--; return (k++ % 2) ? 'https://x/p' + pid + '.png' : null; };
          const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
          const wb = await fwBuildXlTemplate(); const ws = wb.getWorksheet('Shablon');
          const id = wb.addImage({ base64: png, extension: 'png' });
          for (let i = 0; i < 12; i++) { ws.addRow(['', 'R-' + i, 'Rasmli ' + i, 'Kat', '', 1, 1, '', '']); ws.addImage(id, { tl: { col: 0, row: ws.rowCount - 1 }, ext: { width: 10, height: 10 } }); }
          await __imp(await wb.xlsx.writeBuffer(), null);
          const imgs = S.products.map(p => p.image);
          return { peak, b64: imgs.filter(x => /^data:/.test(x || '')).length, urls: imgs.filter(x => /^https:/.test(x || '')).length, nulls: imgs.filter(x => x == null).length };
        });
        assert.equal(r.b64, 0, "xom base64 yo'q"); assert.equal(r.urls, 6); assert.equal(r.nulls, 6);
        assert.ok(r.peak > 1 && r.peak <= 6, `parallel (≤6): ${r.peak}`);
      });
    } },
  ],
};
