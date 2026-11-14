// P7 — Oylik mahsulotlar reytingi va mahsulot rasmlari galereyasi (2026-10-01).
// Foydalanuvchi talabi: "7 kunlik o'rniga Mahsulotlar reytingi — kunlik emas, 1 oylik:
// 1-sanadan kelgan kunigacha"; Dillerlar va Sotuvchilar panelida ham; mahsulot rasmlari
// (4 tagacha, qirqish, ~40 KB) qo'shilsin.
// Qo'riqlanadi:
//  • Statistikada bir kun tanlansa ham reyting va dinamika OY BOSHIDAN hisoblanadi;
//  • reyting kartasi: eng yaxshi / kam sotilgan / sotuvsiz, mahsulot rasmlari bilan,
//    xavfli rasm manzillari (javascript: va h.k.) chiqarilmaydi;
//  • galereya: 4 tadan ko'p emas, asosiy rasm = p.image (eski joylar buzilmaydi),
//    "Bekor" — hech narsa o'zgarmaydi, siqish ~40 KB;
//  • Storage tozalash funksiyasi galereya rasmlarini "duplikat" deb o'chirmaydi.
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');
const { makeFakeAdmin, loadHandlerWithFakeAdmin } = require('./helpers/fake-admin');

const DAY = 864e5;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const T = iso(Date.now());
const MONTH_START = T.slice(0, 7) + '-01';
const PREV_MONTH_DAY = iso(Date.parse(MONTH_START) - 3 * DAY);

async function withApp(fn) {
  const { browser, page, consoleErrors } = await loadApp({});
  try {
    await page.evaluate(([T, MS, PM]) => {
      CUR.usdUzs = 10000;
      Object.assign(S, {
        products: [
          { id: 1, sku: 'A-1', name: 'Drel', image: 'https://cdn.example.com/drel.jpg', images: ['https://cdn.example.com/drel.jpg', 'https://cdn.example.com/drel2.jpg'] },
          { id: 2, sku: 'A-2', name: 'Arra', image: 'javascript:alert(1)' },
          { id: 3, sku: 'A-3', name: 'Bolgarka', image: null },
        ],
        batches: [
          { id: 11, pid: 1, qty: 20, sold: 0, costUsd: 10, date: PM, status: 'active' },
          { id: 12, pid: 2, qty: 20, sold: 0, costUsd: 5, date: PM, status: 'active' },
          { id: 13, pid: 3, qty: 5, sold: 0, costUsd: 7, date: PM, status: 'active' },
        ],
        sales: [
          { id: 1, date: T, totalUsd: 100, profitUsd: 30, items: [{ pid: 1, name: 'Drel', sku: 'A-1', qty: 2, lineUsd: 100, costUsd: 10 }] },
          { id: 2, date: MS, totalUsd: 30, profitUsd: 10, items: [{ pid: 2, name: 'Arra', sku: 'A-2', qty: 3, lineUsd: 30, costUsd: 5 }] },
          { id: 3, date: PM, totalUsd: 999, profitUsd: 400, items: [{ pid: 3, name: 'Bolgarka', sku: 'A-3', qty: 9, lineUsd: 999, costUsd: 7 }] },   // o'tgan oy — kirmaydi
        ],
        expenses: [], cashTxns: [], cashboxes: [], customers: [], suppliers: [], revisions: [],
      });
    }, [T, MONTH_START, PREV_MONTH_DAY]);
    return await fn(page, consoleErrors);
  } finally { await browser.close(); }
}

async function testStatistikaRankIsMonthToDate() {
  await withApp(async (page, errs) => {
    const r = await page.evaluate(() => {
      const el = document.createElement('div'); el.id = 'pg-hisobot'; document.body.appendChild(el);
      S.sx = null; pgHisobot();   // standart: «Bugun»
      const card = document.getElementById('sx-rank');
      const names = [...card.querySelectorAll('.fws-n b')].map(b => b.textContent);
      const sub = card.querySelector('.fws-sub').textContent;
      const imgs = [...card.querySelectorAll('.fws-th img')].map(i => i.getAttribute('src'));
      const dyn = document.getElementById('sx-dyn').textContent;
      sxSetRank('low'); const low = [...card.querySelectorAll('.fws-n b')].map(b => b.textContent);
      sxSetRank('none'); const none = card.textContent;
      return { per: S.sx.per, names, sub, imgs, dyn, low, none, html: card.innerHTML, xss: !!window.__xss };
    });
    assert.equal(r.per, 'today', 'Davr — bugun');
    assert.deepEqual(r.names, ['Drel', 'Arra'], 'Bugun tanlansa ham reyting oy boshidan (1-sanadan bugungacha)');
    assert.ok(r.sub.includes('Oy boshidan') && r.sub.includes(MONTH_START.split('-').reverse().join('.')), 'Sana oralig\'i: oyning 1-sanasidan');
    assert.ok(r.dyn.includes('Oy boshidan'), "Dinamika: 7 kun o'rniga oy boshidan");
    assert.ok(!r.dyn.includes('7 kun'), "«So'nggi 7 kun» yozuvi yo'q");
    assert.deepEqual(r.imgs, ['https://cdn.example.com/drel.jpg'], 'Mahsulot rasmi ko\'rinadi; xavfli manzil chiqarilmaydi');
    assert.ok(!r.html.includes('javascript:'), 'javascript: manzili HTMLga tushmaydi');
    assert.deepEqual(r.low, ['Drel', 'Arra'], 'Kam sotilgan — dona bo\'yicha o\'sish tartibida (2 < 3)');
    assert.ok(r.none.includes('Bolgarka') && !r.none.includes('Drel'), "Sotuvsiz: omborda bor, oy boshidan sotilmagan");
    assert.deepEqual(errs, []);
  });
}

async function testPanelsDefaultToMonth() {
  await withApp(async (page) => {
    const r = await page.evaluate(() => {
      const el = document.createElement('div'); el.id = 'pg-sotuvchilar'; document.body.appendChild(el);
      pgSotuvchilar();
      const box = document.getElementById('sp-stats');
      return { sp: SP_UI.per, dl: DL_UI.per, onTab: box.querySelector('.fws-tabs .on').textContent,
        rankTitle: [...box.querySelectorAll('.fws-card .fws-head b')].map(b => b.textContent), thumbs: box.querySelectorAll('.fws-rank.thumbs .fws-th').length };
    });
    assert.equal(r.sp, 'month'); assert.equal(r.dl, 'month', 'Dillerlar paneli ham standart — Shu oy');
    assert.equal(r.onTab, 'Shu oy');
    assert.ok(r.rankTitle.includes('Mahsulotlar reytingi'), 'Sotuvchilar panelida «Mahsulotlar reytingi»');
    assert.ok(r.thumbs >= 2, 'Reytingda mahsulot rasmlari ustuni');
  });
}

async function testGalleryState() {
  await withApp(async (page) => {
    const r = await page.evaluate(async () => {
      _cloudEnabled = false;   // oflayn rejim: rasmlar havola o'rniga ichki ko'rinishda saqlanadi
      const p = S.products[0];
      const before = JSON.stringify(p);
      // 1) Bekor qilish — hech narsa o'zgarmaydi
      pgInit(p); pgRemove(0); pgMain(0); PG = null;
      const cancelSame = JSON.stringify(p) === before;
      // 2) Katta rasm siqiladi (~40 KB)
      const cv = document.createElement('canvas'); cv.width = 2400; cv.height = 1800; const x = cv.getContext('2d');
      for (let i = 0; i < 3000; i++) { x.fillStyle = `hsl(${(i * 37) % 360},70%,50%)`; x.fillRect((i * 97) % 2400, (i * 53) % 1800, 60, 60); }
      const big = cv.toDataURL('image/png');
      const small = await compressImageDataUrl(big);
      const kb = Math.round((small.length - 23) * 0.75 / 1024);
      // 3) Qo'shish, asosiy qilish, o'chirish, 4 ta chegarasi
      pgInit(p);
      PG.items.push({ src: small, isNew: true }, { src: small, isNew: true }, { src: small, isNew: true });   // 2 + 3 = 5
      const fakeInput = { files: [new File([new Uint8Array(10)], 'a.png', { type: 'image/png' })], value: 'x' };
      PG.items = PG.items.slice(0, 4);   // forma 4 tadan ortig'ini qabul qilmaydi (pgAddFiles ham shunday cheklaydi)
      await pgAddFiles(fakeInput);       // joy yo'q — qo'shilmaydi
      const countAfterAdd = PG.items.length;
      pgMain(2);                          // yangi rasm asosiy bo'ladi
      pgRemove(1);                        // eski asosiy (drel.jpg) olib tashlanadi
      const removed = PG.removed.slice();
      const failed = await pgCommit(p);
      return { cancelSame, kb, countAfterAdd, removed, failed, images: p.images.length, mainIsFirst: p.image === p.images[0], mainIsNew: p.image.startsWith('data:image/jpeg'),
        legacy: productImages({ image: 'https://x/y.jpg' }), none: productImages({}), pgAfter: PG };
    });
    assert.equal(r.cancelSame, true, "«Bekor» — mahsulot o'zgarmaydi");
    assert.ok(r.kb <= 45, `Rasm ~40 KB gacha siqiladi, hozir ${r.kb} KB`);
    assert.equal(r.countAfterAdd, 4, '4 tadan ortiq rasm qo\'shilmaydi');
    assert.deepEqual(r.removed, ['https://cdn.example.com/drel.jpg'], "Olib tashlangan saqlangan rasm o'chirish ro'yxatida");
    assert.equal(r.failed, 0);
    assert.equal(r.images, 3, 'Saqlangan galereya: 3 ta rasm');
    assert.equal(r.mainIsFirst, true, 'p.image = galereyaning birinchisi (eski joylar uchun)');
    assert.equal(r.mainIsNew, true, 'Tanlangan rasm asosiy bo\'ldi');
    assert.deepEqual(r.legacy, ['https://x/y.jpg'], 'Eski mahsulot (faqat p.image) ham galereyada ko\'rinadi');
    assert.deepEqual(r.none, []);
    assert.equal(r.pgAfter, null);
  });
}

async function testProductFormHasGallery() {
  await withApp(async (page, errs) => {
    const r = await page.evaluate(() => {
      const ov = document.createElement('div'); ov.id = 'modal-ov'; document.body.appendChild(ov);
      editProduct(1);
      const sec = document.getElementById('pg-sec');
      const res = { count: sec.querySelector('.pg-count').textContent, thumbs: sec.querySelectorAll('.pg-th').length, add: !!sec.querySelector('.pg-add input[type=file][accept="image/*"]'), main: sec.querySelector('.pg-th.main .pg-badge')?.textContent };
      openAddProduct();
      res.newCount = document.querySelector('#pg-sec .pg-count').textContent;
      return res;
    });
    assert.equal(r.count, '2 / 4'); assert.equal(r.thumbs, 2); assert.equal(r.add, true); assert.equal(r.main, 'Asosiy');
    assert.equal(r.newCount, '0 / 4', 'Yangi mahsulot formasida ham rasm bo\'limi');
    assert.deepEqual(errs, []);
  });
}

async function testStorageCleanupKeepsGallery() {
  const removedCalls = [];
  const files = [
    { name: 'p5.jpg', created_at: '2026-09-01T00:00:00Z', metadata: { size: 100 } },              // eski asosiy — endi ishlatilmaydi
    { name: 'p5-gabc1.jpg', created_at: '2026-10-01T00:00:00Z', metadata: { size: 40 } },        // galereya 1
    { name: 'p5-gabc2.jpg', created_at: '2026-10-01T00:01:00Z', metadata: { size: 40 } },        // galereya 2
    { name: 'p7.png', created_at: '2026-09-01T00:00:00Z', metadata: { size: 10 } },
    { name: 'p7-old.png', created_at: '2026-08-01T00:00:00Z', metadata: { size: 10 } },          // eski usuldagi duplikat
  ];
  const base = 'https://x.supabase.co/storage/v1/object/public/product-images/';
  const fake = makeFakeAdmin({
    authUser: { token: 'tok', id: 'u2' },
    staffRow: { id: 2, name: 'Admin', role: 'admin', active: true, filial: 'baza', auth_user_id: 'u2' },
    appData: { products: [
      { id: 5, name: 'Drel', image: base + 'p5-gabc1.jpg', images: [base + 'p5-gabc1.jpg', base + 'p5-gabc2.jpg?v=1'] },
      { id: 7, name: 'Arra', image: base + 'p7.png?v=9' } ] },
  });
  fake.storage = { from: () => ({
    list: async (_, o) => ({ data: (o && o.offset) ? [] : files, error: null }),
    remove: async (names) => { removedCalls.push(...names); return { data: names, error: null }; },
  }) };
  const { handler, restore } = loadHandlerWithFakeAdmin(fake, 'cleanup-duplicate-images');
  try {
    const res = await handler({ httpMethod: 'POST', headers: { authorization: 'Bearer tok' }, body: JSON.stringify({ dryRun: false }) });
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(removedCalls.sort(), ['p5.jpg', 'p7-old.png'], "Faqat ishlatilmayotgan fayllar o'chiriladi; galereya rasmlari qoladi");
  } finally { restore(); }
}

module.exports = {
  name: "P7 — Oylik mahsulotlar reytingi va mahsulot rasmlari (galereya)",
  cases: [
    { name: "Statistika: bugun tanlansa ham reyting va dinamika oy boshidan; rasmlar; xavfsiz manzil", run: testStatistikaRankIsMonthToDate },
    { name: "Sotuvchilar/Dillerlar paneli standart — «Shu oy», «Mahsulotlar reytingi» rasmlar bilan", run: testPanelsDefaultToMonth },
    { name: "Galereya: bekor qilish, ~40 KB siqish, 4 ta chegara, asosiy rasm = p.image", run: testGalleryState },
    { name: "Mahsulot formalarida rasm bo'limi (tahrirlash va yangi)", run: testProductFormHasGallery },
    { name: "Storage tozalash galereya rasmlarini o'chirmaydi (backend)", run: testStorageCleanupKeepsGallery },
  ],
};
