// P30 — v24.2: telefon qobig'i (admin) — «Barcha cheklar», «Amallar jurnali», «Mening do'konlarim», mavzu standarti.
//  • Barcha cheklar: davr (Bugun/Kecha/Oy/sana), qidiruv, o'chirilgan savdo kirmaydi; summa, foyda, chegirma, qarz; mahsulotlar yig'indisi.
//  • Jurnal: server audit yozuvlari — yaratilgan/o'zgartirilgan/o'chirilgan soni, edi → bo'ldi qatorlari; «… ochildi» yozuvlari yo'q.
//  • Do'konlar: Baza «Asosiy», joriy — «Siz shu yerdasiz», boshqa filial — o'tish (parol bilan).
//  • Mavzu: saqlangan tanlov bo'lmasa — «Tizimdagi»; kunduzgi rejimda --border bo'sh emas.
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;

async function testChecksAndJournal() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const r = await page.evaluate(() => {
      const t = td(), y = daysAgo(1);
      S.sales = [
        { id: 1, inv: 'INV-1', date: t, custName: 'Ali', totalUsd: 100, profitUsd: 20, discUsd: 5, debtUsd: 30, items: [{ pid: 7, name: 'Drel', sku: 'D-7', qty: 2, sellUsd: 50 }] },
        { id: 2, inv: 'INV-2', date: t, custName: 'Anonim', totalUsd: 40, profitUsd: 8, discUsd: 0, debtUsd: 0, items: [{ pid: 7, name: 'Drel', sku: 'D-7', qty: 1, sellUsd: 40 }] },
        { id: 3, inv: 'INV-3', date: t, custName: 'Vali', totalUsd: 999, profitUsd: 1, status: 'voided', items: [] },
        { id: 4, inv: 'INV-4', date: y, custName: 'Kecha', totalUsd: 70, profitUsd: 7, items: [{ pid: 9, name: 'Arra', sku: 'A-9', qty: 1, sellUsd: 70 }] },
      ];
      go('cheklar'); SHELL.chk = { per: 'today', day: '', tab: 'cheks', q: '' }; pgCheklar();
      const el = document.getElementById('pg-cheklar');
      const today = { n: el.querySelectorAll('.sh-chk-r').length, sum: el.querySelector('.sh-sum-top b').textContent, g: [...el.querySelectorAll('.sh-sum-g b')].map(b => b.textContent), r: el.querySelector('.sh-sum-r b').textContent };
      SHELL.chk.q = 'ali'; pgCheklar(); const q = el.querySelectorAll('.sh-chk-r').length;
      SHELL.chk.q = ''; SHELL.chk.per = 'yday'; pgCheklar(); const yd = el.querySelector('.sh-sum-top b').textContent;
      SHELL.chk.per = 'day'; SHELL.chk.day = y; pgCheklar(); const day = el.querySelectorAll('.sh-chk-r').length;
      SHELL.chk.per = 'today'; SHELL.chk.tab = 'prods'; pgCheklar(); const prods = [...el.querySelectorAll('.sh-chk-r')].map(x => x.textContent.replace(/\s+/g, ' ').trim());
      // Jurnal: server yozuvlari (soxta) + mahalliy «ochildi» yozuvi chiqmaydi
      const now = new Date().toISOString();
      SHELL.jr.items = [
        { id: 1, createdAt: now, entity: 'sale', action: 'create', actor: 'Malika', actorRole: 'seller', after: { inv: 'INV-1', totalUsd: 100 } },
        { id: 2, createdAt: now, entity: 'sale', action: 'edit', actor: 'Admin', actorRole: 'admin', before: { inv: 'INV-2', totalUsd: 50, items: [{ pid: 7, qty: 2, sellUsd: 25 }] }, after: { inv: 'INV-2', totalUsd: 40, items: [{ pid: 7, qty: 1, sellUsd: 40 }] } },
        { id: 3, createdAt: now, entity: 'sale', action: 'void', actor: 'Admin', actorRole: 'admin', before: { inv: 'INV-3', status: 'done' }, after: { inv: 'INV-3', status: 'voided' } },
      ];
      SHELL.jr.loaded = true; S.auditLogs = [{ id: 9, action: 'Kirim ochildi', ts: now }];
      go('jurnal'); pgJurnal(false);
      const j = document.getElementById('pg-jurnal');
      const cnt = [...j.querySelectorAll('.jr-cnt b')].map(b => +b.textContent);
      const txt = j.textContent;
      return { today, q, yd, day, prods, cnt, txt, cards: j.querySelectorAll('.jr-it').length };
    });
    assert.equal(r.today.n, 2, "o'chirilgan savdo kirmaydi"); assert.equal(r.today.sum, '$140.00');
    assert.deepEqual(r.today.g, ['$28.00', '$5.00', '$0.00', '$30.00'], 'foyda, chegirma, qaytarish, qarz');
    assert.equal(r.today.r, '2 / 3 dona');
    assert.equal(r.q, 1, 'qidiruv (mijoz)'); assert.equal(r.yd, '$70.00', 'kecha'); assert.equal(r.day, 1, 'sana tanlash');
    assert.equal(r.prods.length, 1); assert.match(r.prods[0], /Drel.*\$140\.00.*3 dona/, "2×50 + 1×40");
    assert.deepEqual(r.cnt, [1, 1, 1], 'yaratilgan / oʻzgartirilgan / oʻchirilgan');
    assert.equal(r.cards, 3, "«ochildi» yozuvi jurnalga chiqmaydi");
    assert.match(r.txt, /Jami\$50\.00 → \$40\.00/); assert.match(r.txt, /dona\)2 → 1/); assert.match(r.txt, /Holatfaol → oʻchirilgan/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function testShopsAndTheme() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const r = await page.evaluate(() => {
      go('dashboard'); shellShops();
      const ov = document.getElementById('bs-ov');
      const cards = [...ov.querySelectorAll('.sh-shop')].map(c => ({ on: c.classList.contains('on'), t: c.textContent.replace(/\s+/g, ' ') }));
      const sw = document.querySelector('#fw-shop-sw [data-shop-name]').textContent;
      return { cards, sw, theme: getThemeMode(), stored: localStorage.getItem('koma_theme'), border: getComputedStyle(document.documentElement).getPropertyValue('--border').trim(),
        dataTheme: document.documentElement.getAttribute('data-theme') };
    });
    assert.ok(r.cards.length >= 1); assert.equal(r.cards[0].on, true); assert.match(r.cards[0].t, /Asosiy/); assert.match(r.cards[0].t, /Siz shu yerdasiz/);
    assert.ok(r.sw.length > 0, "do'kon nomi");
    if (r.stored == null) assert.equal(r.theme, 'system', 'standart — Tizimdagi');
    assert.ok(r.border.length > 0, "--border bo'sh emas (kunduzgi rejimda ham)");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

// ✕ va telefon «Orqaga» — qayerdan kirilgan bo'lsa o'sha yerga (kichik oyna — qayta ochiladi), ichma-ich bo'limlar ham
async function testBackToOrigin() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const st = () => page.evaluate(() => ({ page: S.page, sheet: document.getElementById('bs-ov')?.classList.contains('open') ? document.querySelector('#bs-ov .bs-ht b')?.textContent : null }));
    await page.evaluate(() => dashSheet('exp')); await page.waitForTimeout(200);
    await page.click('#bs-ov .ds-acts .bs-btn.danger'); await page.waitForTimeout(400);
    assert.deepEqual(await st(), { page: 'xarajatlar', sheet: null });
    await page.click('.fw-x'); await page.waitForTimeout(500);
    assert.deepEqual(await st(), { page: 'dashboard', sheet: 'Xarajatlar' }, '✕ — «Xarajatlar» oynasiga qaytdi');
    await page.evaluate(() => closeSheet()); await page.waitForTimeout(200);
    await page.evaluate(() => shellProfile()); await page.waitForTimeout(200);
    await page.click('#bs-ov .sh-row:has-text("Sozlamalar")'); await page.waitForTimeout(400);
    await page.goBack(); await page.waitForTimeout(600);
    assert.deepEqual(await st(), { page: 'dashboard', sheet: 'Profil' }, 'telefon «Orqaga» — profilga');
    await page.evaluate(() => closeSheet()); await page.waitForTimeout(200);
    await page.click('#pg-dashboard .ox-act:has-text("Kassalar")'); await page.waitForTimeout(400);
    await page.evaluate(() => go('firmakassa')); await page.waitForTimeout(400);
    await page.click('.fw-x'); await page.waitForTimeout(400);
    assert.deepEqual(await st(), { page: 'kassalar', sheet: null }, 'ichma-ich: avval Kassalarga');
    await page.click('.fw-x'); await page.waitForTimeout(400);
    assert.deepEqual(await st(), { page: 'dashboard', sheet: null }, "keyin bosh sahifaga (eski oyna qayta ochilmaydi)");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

// Telefon «Orqaga» — ✕ bilan bir xil: har bosishda 1 qadam; ✕ bilan yopilgan oynadan keyin «bo'sh» bosish yo'q
async function testHardwareBack() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    const st = () => page.evaluate(() => ({ page: S.page, sheet: document.getElementById('bs-ov')?.classList.contains('open') ? document.querySelector('#bs-ov .bs-ht b')?.textContent : null }));
    // oyna ✕ bilan yopiladi → bo'limga kiriladi → bitta «Orqaga» — bosh sahifa
    await page.evaluate(() => dashBizSheet()); await page.waitForTimeout(200);
    await page.click('#bs-ov .bs-x');   // ✕ bilan yopiladi
    await page.waitForTimeout(300);
    await page.click('#pg-dashboard .ox-act:has-text("Kassalar")'); await page.waitForTimeout(400);
    await page.goBack(); await page.waitForTimeout(500);
    assert.deepEqual(await st(), { page: 'dashboard', sheet: null }, 'bitta «Orqaga» — bosh sahifa');
    // ichma-ich: Kassalar → Bosh kassa; «Orqaga» → Kassalar; «Orqaga» → bosh sahifa
    await page.click('#pg-dashboard .ox-act:has-text("Kassalar")'); await page.waitForTimeout(300);
    await page.evaluate(() => go('firmakassa')); await page.waitForTimeout(300);
    await page.goBack(); await page.waitForTimeout(500); assert.equal((await st()).page, 'kassalar');
    await page.goBack(); await page.waitForTimeout(500); assert.equal((await st()).page, 'dashboard');
    // ✕ dan keyin «Orqaga» — bo'limga qayta kirmaydi (tarixda oldinga yozuv qo'shilmaydi)
    await page.click('#pg-dashboard .ox-act:has-text("Mijozlar")'); await page.waitForTimeout(300);
    await page.click('.fw-x'); await page.waitForTimeout(500); assert.equal((await st()).page, 'dashboard');
    await page.goForward(); await page.waitForTimeout(400);
    // oldinga — brauzer tarixi (qayta kirish faqat «oldinga» bilan, «orqaga» bilan emas)
    await page.goBack(); await page.waitForTimeout(400); assert.equal((await st()).page, 'dashboard');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

module.exports = {
  name: "P30 — v24.2: telefon qobig'i — Barcha cheklar, Amallar jurnali, Mening do'konlarim, mavzu standarti",
  cases: [
    { name: "Barcha cheklar (davr, qidiruv, o'chirilgan yo'q, xulosa, mahsulotlar) va Jurnal (soni, edi → bo'ldi)", run: testChecksAndJournal },
    { name: "Mening do'konlarim (Asosiy, Siz shu yerdasiz), standart mavzu — Tizimdagi, --border bo'sh emas", run: testShopsAndTheme },
    { name: "✕ va «Orqaga» — kirilgan joyga: ko'rsatkich oynasi, profil qayta ochiladi; ichma-ich bo'limlar ketma-ket", run: testBackToOrigin },
    { name: "Telefon «Orqaga» = ✕: har bosishda 1 qadam, ✕ dan keyin bo'sh bosish yo'q, ichma-ich ketma-ket", run: testHardwareBack },
  ],
};
