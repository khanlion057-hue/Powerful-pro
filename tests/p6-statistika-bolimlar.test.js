// P6 — Sotuvchilar, Dillerlar, Filiallar statistikasi va portallardagi "Mening statistikam"
// (2026-10-01). Foydalanuvchi talabi: har bir bo'limga o'ziga kerakli statistika —
// qaysi mahsulot yaxshi/sust ketyapti, reyting, grafiklar, tugmalar.
// Bu testlar qo'riqlaydi:
//  • umumiy yordamchilar (shared.js: fwPeriod, fwSeries, fwTrendHtml, fwRankHtml) to'g'ri hisoblaydi;
//  • Sotuvchilar/Dillerlar statistikasi to'g'ri yig'iladi, filtr (xodim/diller) ishlaydi;
//  • foydalanuvchi kiritgan nomlar (xodim, diller, mahsulot) HTML sifatida bajarilmaydi (XSS);
//  • statistika faqat O'QIYDI — ma'lumotlar o'zgarmaydi;
//  • Filiallar taqqoslash faqat egasi Baza'dan kirganda ko'rinadi (xavfsizlik chegarasi);
//  • sotuvchi portalida sotuvchi faqat o'z savdolarini ko'radi, tannarx/foyda ko'rsatilmaydi.
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');
const { openPage } = require('./p4-responsive.test.js')._helpers;

const DAY = 864e5;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const NOW = Date.now();
const T = iso(NOW), D3 = iso(NOW - 3 * DAY), D20 = iso(NOW - 20 * DAY), D40 = iso(NOW - 40 * DAY);
const XSS = '<img src=x onerror="window.__xss=1">';

function seed() {
  return {
    products: [
      { id: 1, sku: 'A-1', name: 'Drel', cat: 'Drel', minStock: 2 },
      { id: 2, sku: 'A-2', name: XSS, cat: 'Arra', minStock: 2 },
      { id: 3, sku: 'A-3', name: 'Bolgarka', cat: 'Bolgarka', minStock: 2 },
    ],
    batches: [
      { id: 11, pid: 1, qty: 10, sold: 0, costUsd: 10, date: D40, status: 'active' },
      { id: 12, pid: 2, qty: 10, sold: 0, costUsd: 5, date: D40, status: 'active' },
      { id: 13, pid: 3, qty: 6, sold: 0, costUsd: 7, date: D40, status: 'active' },   // sotilmagan, qoldig'i bor
    ],
    staffList: [{ id: 8, name: 'Dilshod', login: 'd' }, { id: 9, name: XSS, login: 'm' }],
    sales: [
      { id: 1, date: T, staffId: 8, totalUsd: 100, profitUsd: 30, payType: 'cash_uzs', items: [{ pid: 1, name: 'Drel', qty: 2, lineUsd: 100, costUsd: 10 }] },
      { id: 2, date: D3, staffId: 9, totalUsd: 60, profitUsd: 20, payType: 'card', items: [{ pid: 2, name: XSS, qty: 3, lineUsd: 60, costUsd: 5 }] },
      { id: 3, date: D3, totalUsd: 40, profitUsd: 10, payType: 'debt', items: [{ pid: 1, name: 'Drel', qty: 1, lineUsd: 40, costUsd: 10 }] },   // egasi
      { id: 4, date: D40, staffId: 8, totalUsd: 50, profitUsd: 15, payType: 'cash_uzs', items: [{ pid: 1, name: 'Drel', qty: 1, lineUsd: 50, costUsd: 10 }] },  // oldingi davr (30 kun)
    ],
    dealers: [{ id: 1, name: 'Jasur', region: 'Samarqand', debt: 120 }, { id: 2, name: XSS, region: 'Buxoro', debt: 0 }, { id: 3, name: 'Aziz', region: 'Samarqand', debt: 0 }],
    dealerSalesRaw: [
      { dealer_id: 1, pid: 1, name: 'Drel', sku: 'A-1', qty: 2, total_usd: 80, sale_date: T },
      { dealer_id: 1, pid: 2, name: XSS, sku: 'A-2', qty: 1, total_usd: 20, sale_date: D20 },
      { dealer_id: 2, pid: 1, name: 'Drel', sku: 'A-1', qty: 1, total_usd: 40, sale_date: D3 },
      { dealer_id: 2, pid: 1, name: 'Drel', sku: 'A-1', qty: 5, total_usd: 200, sale_date: D40 },   // oldingi davr
    ],
    dealerStock: [{ dealerId: 1, pid: 3, qty: 4, avgCostUsd: 7 }, { dealerId: 3, pid: 3, qty: 2, avgCostUsd: 7 }, { dealerId: 1, pid: 1, qty: 1, avgCostUsd: 10 }],
    dealerTxns: [
      { dealerId: 1, type: 'payment', date: D3, totalUsd: 70 },
      { dealerId: 2, type: 'payment', date: D40, totalUsd: 35 },
      { dealerId: 1, type: 'send', date: D20, totalUsd: 90 },
    ],
  };
}

async function withApp(fn) {
  const { browser, page, consoleErrors } = await loadApp({});
  try {
    await page.evaluate((sd) => { Object.assign(S, sd); CUR.usdUzs = 10000; }, seed());
    return await fn(page, consoleErrors);
  } finally { await browser.close(); }
}
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≠ ${b}`);

async function testSharedHelpers() {
  await withApp(async (page) => {
    const r = await page.evaluate(() => {
      const p7 = fwPeriod('7d'), p30 = fwPeriod('30d'), pm = fwPeriod('month'), py = fwPeriod('year'), bad = fwPeriod('xyz');
      const pt = fwPeriod('today'), ppm = fwPeriod('prevmonth');
      const rows = [{ d: td(), v: 5 }, { d: fwShiftDay(td(), -1), v: 2 }, { d: fwShiftDay(td(), -40), v: 99 }];
      const s7 = fwSeries(rows, x => x.d, x => x.v, p7), sy = fwSeries(rows, x => x.d, x => x.v, py);
      return { p7, p30, pm, py, pt, ppm, bad: bad.per, tabs: Object.keys(FW_PERIODS), s7len: s7.length, s7last: s7[6].v, s7prev: s7[5].v, s7sum: s7.reduce((a, b) => a + b.v, 0),
        sylen: sy.length, today: td(),
        tUp: fwTrendHtml(150, 100), tDown: fwTrendHtml(50, 100), tNew: fwTrendHtml(10, 0), tNone: fwTrendHtml(0, 0),
        usd: [fwUsd(1234.5), fwUsd(-3), fwUsd(0)], short: fwShortDate('2026-10-01'),
        rank: fwRankHtml([{ name: '<b>x</b>', v: 1 }]), empty: fwBarsHtml([{ k: 'a', v: 0, label: '1' }]) };
    });
    assert.equal(r.p7.a, iso(Date.parse(r.today) - 6 * DAY)); assert.equal(r.p7.len, 7);
    assert.equal(r.p7.pb, iso(Date.parse(r.p7.a) - DAY), 'Oldingi davr tanlangan davrdan bir kun oldin tugaydi');
    assert.equal(r.p7.pa, iso(Date.parse(r.p7.a) - 7 * DAY), 'Oldingi davr ham 7 kun');
    assert.equal(r.p30.len, 30);
    assert.equal(r.pm.a, r.today.slice(0, 7) + '-01');
    assert.equal(r.py.a, r.today.slice(0, 4) + '-01-01');
    assert.equal(r.bad, 'month', "Noma'lum davr — Shu oy (1-sanadan bugungacha)");
    assert.deepEqual(r.tabs, ['today', 'month', 'prevmonth', 'year'], "Tablar: Bugun / Shu oy / O'tgan oy / Shu yil (7 kunlik yo'q)");
    assert.equal(r.pm.b, r.today, 'Shu oy — bugungacha');
    assert.equal(r.pm.pa.slice(8), '01', "Shu oy taqqoslanadi: o'tgan oyning 1-sanasidan");
    assert.ok(r.pm.pb.slice(0, 7) < r.today.slice(0, 7) && Number(r.pm.pb.slice(8)) <= Number(r.today.slice(8)), "o'tgan oyning xuddi shu kunigacha");
    assert.equal(r.pt.a, r.today); assert.equal(r.pt.pa, iso(Date.parse(r.today) - DAY), 'Bugun kecha bilan taqqoslanadi');
    assert.equal(r.ppm.a.slice(8), '01'); assert.ok(r.ppm.b < r.today.slice(0, 7) + '-01', "O'tgan oy — to'liq o'tgan oy");
    assert.equal(r.s7len, 7); assert.equal(r.s7last, 5); assert.equal(r.s7prev, 2); assert.equal(r.s7sum, 7, 'Davrdan tashqari yozuv grafikka tushmaydi');
    assert.equal(r.sylen, Number(r.today.slice(5, 7)), 'Yil grafigi — oylar bo\'yicha');
    assert.ok(r.tUp.includes('▲ 50%') && r.tUp.includes('up'));
    assert.ok(r.tDown.includes('▼ 50%') && r.tDown.includes('down'));
    assert.ok(r.tNew.includes('yangi')); assert.ok(r.tNone.includes('—'));
    assert.deepEqual(r.usd, ['$1 234.5', '−$3', '$0']);
    assert.equal(r.short, '01.10.26');
    assert.ok(!r.rank.includes('<b>x</b>') && r.rank.includes('&lt;b&gt;'), 'Reytingdagi nom escape qilinadi');
    assert.ok(r.empty.includes('fws-empty'), "Bo'sh grafik — izoh");
  });
}

async function testSotuvchilarStats() {
  await withApp(async (page, errs) => {
    const r = await page.evaluate(() => {
      const before = JSON.stringify(S);
      const el = document.createElement('div'); el.id = 'pg-sotuvchilar'; document.body.appendChild(el);
      SP_UI.per = '30d'; SP_UI.staff = 'all'; SP_UI.prod = 'rev';
      pgSotuvchilar();
      const box = document.getElementById('sp-stats');
      const kpi = [...box.querySelectorAll('.fws-kpi')].map(k => k.querySelector('.fws-kpi-v').textContent);
      const rankNames = [...box.querySelector('.fws-rank').querySelectorAll('.fws-n b')].map(b => b.textContent);
      spSetProd('none'); const unsold = [...box.querySelectorAll('.fws-card')].find(c => c.textContent.includes('Mahsulotlar')).textContent;
      spSelect('8'); const kpi8 = [...box.querySelectorAll('.fws-kpi')].map(k => k.querySelector('.fws-kpi-v').textContent);
      const trend8 = box.querySelector('.fws-kpi .fws-trend')?.textContent;
      spSelect('8');   // qayta bosish — filtr bekor
      const after = JSON.stringify(S);
      return { kpi, rankNames, unsold, kpi8, trend8, staffAfter: SP_UI.staff, same: before === after, xss: !!window.__xss, html: box.innerHTML };
    });
    assert.deepEqual(r.kpi.slice(0, 3), ['$200', '$60', '3'], 'Tushum / foyda / cheklar (30 kun, barcha sotuvchilar)');
    assert.equal(r.kpi[3], '6 dona');
    assert.deepEqual(r.rankNames, ['Dilshod', XSS, 'Egasi'], 'Reyting tushum bo\'yicha; egasining savdolari ham bor');
    assert.ok(r.unsold.includes('Bolgarka') && !r.unsold.includes('Drel'), "«Sotilmayotgan» — qoldig'i bor, davrda sotilmagan mahsulot");
    assert.equal(r.kpi8[0], '$100', 'Xodim tanlanganda faqat uning savdolari');
    assert.equal(r.trend8, '▲ 100%', "O'tgan 30 kunga nisbatan o'sish ($50 → $100)");
    assert.equal(r.staffAfter, 'all', 'Tanlangan xodimni qayta bosish — filtr bekor');
    assert.equal(r.same, true, "Statistika ma'lumotlarni o'zgartirmaydi");
    assert.equal(r.xss, false, 'Xodim/mahsulot nomidagi HTML bajarilmaydi');
    assert.ok(!r.html.includes('<img src=x'), 'Nomlar escape qilingan');
    assert.deepEqual(errs, []);
  });
}

async function testDillerlarStats() {
  await withApp(async (page, errs) => {
    const r = await page.evaluate(() => {
      const before = JSON.stringify(S);
      const el = document.createElement('div'); el.id = 'dl-stats'; document.body.appendChild(el);
      DL_UI.per = '30d'; DL_UI.dealer = 'all'; DL_UI.prod = 'rev';
      el.innerHTML = dlStatsHtml();
      const kpi = [...el.querySelectorAll('.fws-kpi')].map(k => k.querySelector('.fws-kpi-v').textContent);
      const ranks = [...el.querySelectorAll('.fws-rank')].map(rk => [...rk.querySelectorAll('.fws-n b')].map(b => b.textContent));
      const regions = el.textContent.includes('Samarqand') && el.textContent.includes('Buxoro');
      dlStSetProd('none'); const slow = [...el.querySelectorAll('.fws-card')].find(c => c.textContent.includes('Mahsulotlar')).textContent;
      dlStSelect('1'); const kpi1 = [...el.querySelectorAll('.fws-kpi')].map(k => k.querySelector('.fws-kpi-v').textContent);
      const slow1 = [...el.querySelectorAll('.fws-card')].find(c => c.textContent.includes('Mahsulotlar')).textContent;
      return { kpi, ranks, regions, slow, kpi1, slow1, same: before === JSON.stringify(S), xss: !!window.__xss };
    });
    assert.deepEqual(r.kpi, ['$140', '4 dona', '$70', '2 / 3'], 'Sotuv / dona / to\'lov / faol dillerlar (30 kun)');
    assert.deepEqual(r.ranks[0], ['Jasur', XSS, 'Aziz'], 'Dillerlar reytingi; savdosiz diller ham ko\'rinadi');
    assert.ok(r.regions, 'Hududlar kesimi');
    assert.ok(r.slow.includes('Bolgarka') && r.slow.includes('6 dona dillerlar omborida'), 'Turib qolgan: dillerlar omborida (4 + 2 dona)');
    assert.ok(!r.slow.includes('Drel'), 'Sotilgan mahsulot sust ro\'yxatida emas');
    assert.deepEqual(r.kpi1.slice(0, 3), ['$100', '3 dona', '$70'], 'Diller tanlanganda faqat uning ko\'rsatkichlari');
    assert.ok(r.slow1.includes('4 dona dillerlar omborida'), 'Tanlangan diller omboridagi turib qolgan mahsulot');
    assert.equal(r.same, true, "Statistika ma'lumotlarni o'zgartirmaydi");
    assert.equal(r.xss, false, 'Diller nomidagi HTML bajarilmaydi');
    assert.deepEqual(errs, []);
  });
}

async function testFiliallarOnlyForOwnerAtBaza() {
  await withApp(async (page) => {
    const r = await page.evaluate((T) => {
      S.branch = 'baza';
      S._store = { baza: {}, f729: { sales: [{ id: 5, date: T, totalUsd: 30, profitUsd: 9, items: [{ pid: 3, name: 'Bolgarka', qty: 1, lineUsd: 30 }] }], batches: [{ pid: 3, qty: 4, sold: 1, costUsd: 7, status: 'active' }], expenses: [] } };
      S.branchDebt = { f729: 55 };
      S.sx = { per: 'today', ym: td().slice(0, 7), day: td(), dyn: 'sale', chk: 30 };
      const D = sxData();
      CURRENT_USER = { kind: 'owner', name: 'Egasi' };
      const owner = sxBranchesHtml(D);
      CURRENT_USER = { kind: 'staff', name: 'Kassir' };
      const staff = sxBranchesHtml(D);
      CURRENT_USER = { kind: 'owner', name: 'Egasi' }; S.branch = 'f729';
      const atFilial = sxBranchesHtml(D);
      return { owner, staff, atFilial };
    }, T);
    assert.ok(r.owner.includes('Filiallar') && r.owner.includes('729') && r.owner.includes('$30') && r.owner.includes('$55') && r.owner.includes('$21'),
      'Egasi Baza\'dan: filiallar taqqoslanadi (tushum, bazaga qarz, ombor tannarxi 3×7)');
    assert.equal(r.staff, '', "Xodim boshqa filial ma'lumotini ko'rmaydi");
    assert.equal(r.atFilial, '', "Filialdan kirganda boshqa filiallar ko'rinmaydi");
  });
}

async function testSotuvchiPortalOwnStatsOnly() {
  const { browser, page, errors } = await openPage('sotuvchi.html', { width: 390, height: 844, mobile: true, loggedIn: true });
  try {
    const r = await page.evaluate((T) => {
      S.sales = [
        { id: 1, date: T, staffId: ME.id, totalUsd: 80, profitUsd: 33, payType: 'cash_uzs', items: [{ pid: 100, name: 'Mening tovarim', qty: 2, lineUsd: 80, costUsd: 23.5 }] },
        { id: 2, date: T, staffId: 999, totalUsd: 500, profitUsd: 200, payType: 'card', items: [{ pid: 101, name: 'Boshqaning tovari', qty: 1, lineUsd: 500 }] },
      ];
      svSwitchTab('history');
      const box = document.getElementById('sv-stats');
      return { role: ME.role, text: box ? box.textContent : '', kpi: box ? [...box.querySelectorAll('.fws-kpi-v')].map(x => x.textContent) : [] };
    }, T);
    assert.equal(r.role, 'sotuvchi');
    assert.ok(r.text.includes('Mening statistikam'));
    assert.equal(r.kpi[0], '$80', 'Sotuvchi faqat o\'z savdolarini ko\'radi');
    assert.ok(r.text.includes('Mening tovarim') && !r.text.includes('Boshqaning tovari'), 'Boshqa xodimning savdosi ko\'rinmaydi');
    assert.ok(!/foyda|tannarx/i.test(r.text), "Sotuvchiga foyda/tannarx ko'rsatilmaydi");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

async function testDillerPortalStats() {
  const { DEALER_TABLES } = require('./p4-responsive.test.js')._helpers;
  const tables = Object.assign({}, DEALER_TABLES, { dealer_sales: [
    { dealer_id: 1, pid: 100, name: 'Sotilgan tovar', sku: 'S-1', qty: 3, total_usd: 90, sale_date: T },
    { dealer_id: 1, pid: 100, name: 'Sotilgan tovar', sku: 'S-1', qty: 1, total_usd: 30, sale_date: D40 } ] });
  const { browser, page, errors } = await openPage('diller.html', { width: 390, height: 844, mobile: true, loggedIn: true, tables });
  try {
    const r = await page.evaluate(() => {
      dlSwitchTab('history');
      const box = document.getElementById('dlp-stats');
      const kpi = [...box.querySelectorAll('.fws-kpi-v')].map(x => x.textContent);
      dlpSetProd('none'); const slow = box.textContent;
      return { kpi, slow, listRows: document.querySelectorAll('#dl-content .dl-card .dl-prow').length };
    });
    assert.deepEqual(r.kpi.slice(0, 2), ['$90', '3 dona'], 'Diller: 30 kunlik sotuvi');
    assert.ok(r.slow.includes('omborimda'), "Omborda turib qolgan (sotilmagan) mahsulotlar ro'yxati");
    assert.equal(r.listRows, 2, "Savdolar ro'yxati saqlangan");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

module.exports = {
  name: "P6 — Sotuvchilar, Dillerlar, Filiallar statistikasi va portallar",
  cases: [
    { name: 'Umumiy yordamchilar: davrlar, grafik nuqtalari, o\'sish belgisi, format, escape', run: testSharedHelpers },
    { name: 'Sotuvchilar: KPI, reyting, sotilmayotgan mahsulot, xodim filtri, XSS, faqat o\'qish', run: testSotuvchilarStats },
    { name: 'Dillerlar: KPI, reyting, sust mahsulotlar, hududlar, diller filtri, XSS, faqat o\'qish', run: testDillerlarStats },
    { name: "Filiallar taqqoslash faqat egasiga va Baza'dan ko'rinadi", run: testFiliallarOnlyForOwnerAtBaza },
    { name: "Sotuvchi portali: faqat o'z savdolari, foyda/tannarxsiz", run: testSotuvchiPortalOwnStatsOnly },
    { name: 'Diller portali: mening statistikam va turib qolgan mahsulotlar', run: testDillerPortalStats },
  ],
};
