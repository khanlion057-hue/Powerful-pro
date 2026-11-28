// P91 — v25.3: TELEGRAM HISOBOT WIDGETI (API'siz qismlar): davr ko'rsatkichlari so'mda, so'rov formati (≤64 bayt),
// admin tekshiruvi (faqat env, shaxsiy chat), token faqat env'dan, widget HTML (≤32 KB, siqilgan ≤4 KB, tashqi resurs yo'q)
// va haqiqiy brauzerda ishlashi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const RP = require('../netlify/functions/_lib/reportPeriod');
const RW = require('../netlify/functions/_lib/reportWidget');

// Sinov ma'lumoti: 2026-11-18 (chorshanba). Kurs 12 500.
const TODAY = '2026-11-18';
function fixture() {
  const sale = (o) => Object.assign({ cur: 'UZS', rateUsdUzs: 12500, status: 'done', items: [] }, o);
  return {
    settings: { usdUzs: 12500 },
    branchStore: {
      baza: {
        cashboxes: [{ id: 1, type: 'cash', cur: 'UZS' }, { id: 2, type: 'card', cur: 'UZS' }, { id: 3, type: 'cash', cur: 'USD' }],
        sales: [
          // bugun: naqd so'm, yaxlitlangan jami 17 900
          sale({ date: TODAY, payType: 'cash_uzs', totalUsd: 1.438, paidUsd: 1.432, debtUsd: 0, tolangan_jami: 17900, items: [{ pid: 1, name: 'Arra 300', qty: 2, sellUsd: 0.719 }] }),
          // bugun: karta 125 000
          sale({ date: TODAY, payType: 'card', totalUsd: 10, paidUsd: 10, debtUsd: 0, roundedTotalUzs: 125000, items: [{ pid: 2, name: 'Tig 120', qty: 1, sellUsd: 10 }] }),
          // bugun: aralash — 50 000 naqd + 75 000 karta
          sale({ date: TODAY, payType: 'mixed', totalUsd: 10, paidUsd: 10, debtUsd: 0, roundedTotalUzs: 125000, mixedRows: [{ boxId: 1, amount: 50000 }, { boxId: 2, amount: 75000 }], items: [{ pid: 2, name: 'Tig 120', qty: 1, sellUsd: 10 }] }),
          // bugun: dollar savdo, 4$ qarzga (6$ naqd dollar)
          sale({ date: TODAY, cur: 'USD', payType: 'usd', totalUsd: 10, paidUsd: 6, debtUsd: 4, items: [{ pid: 3, name: 'Freza', qty: 5, sellUsd: 2 }] }),
          // bugun: bekor qilingan va filiallararo — hisobga olinmaydi
          sale({ date: TODAY, payType: 'cash_uzs', totalUsd: 80, paidUsd: 80, debtUsd: 0, roundedTotalUzs: 1000000, status: 'cancelled', items: [{ pid: 9, name: 'X', qty: 99, sellUsd: 1 }] }),
          sale({ date: TODAY, payType: 'debt', totalUsd: 80, paidUsd: 0, debtUsd: 80, isFilialTransfer: true, items: [{ pid: 9, name: 'X', qty: 99, sellUsd: 1 }] }),
          // dushanba (shu hafta) va oy boshi (shu oy, hafta emas)
          sale({ date: '2026-11-16', payType: 'cash_uzs', totalUsd: 8, paidUsd: 8, debtUsd: 0, roundedTotalUzs: 100000, items: [{ pid: 1, name: 'Arra 300', qty: 10, sellUsd: 0.8 }] }),
          sale({ date: '2026-11-01', payType: 'debt', totalUsd: 4, paidUsd: 0, debtUsd: 4, roundedTotalUzs: 50000, items: [{ pid: 4, name: 'Disk', qty: 1, sellUsd: 4 }] }),
          // o'tgan oy — hech qayerda yo'q
          sale({ date: '2026-10-31', payType: 'cash_uzs', totalUsd: 8, paidUsd: 8, debtUsd: 0, roundedTotalUzs: 100000, items: [{ pid: 1, name: 'Arra 300', qty: 50, sellUsd: 0.16 }] }),
        ],
        customers: [{ id: 1, debt: 50000 }, { id: 2, debt: 0 }, { id: 3, debt: 200000 }],
      },
      f729: {
        cashboxes: [{ id: 1, type: 'cash', cur: 'UZS' }],
        sales: [sale({ date: TODAY, payType: 'cash_uzs', totalUsd: 2, paidUsd: 2, debtUsd: 0, roundedTotalUzs: 25000, items: [{ pid: 1, name: 'Arra 300', qty: 1, sellUsd: 2 }] })],
        customers: [{ id: 7, debt: 30000 }],
      },
    },
  };
}

async function testPeriods() {
  assert.equal(RP.fmtSom(18450000), '18 450 000'); assert.equal(RP.fmtSom(0), '0'); assert.equal(RP.fmtSom(999.6), '1 000'); assert.equal(RP.fmtSom(-5000), '−5 000');
  assert.deepEqual(RP.periodRange('d', TODAY), { kind: 'd', from: TODAY, to: TODAY, label: 'Bugun' });
  assert.deepEqual(RP.periodRange('w', TODAY), { kind: 'w', from: '2026-11-16', to: TODAY, label: 'Hafta' }, 'hafta — dushanbadan');
  assert.equal(RP.periodRange('w', '2026-11-16').from, '2026-11-16', 'dushanba — o\'zi');
  assert.equal(RP.periodRange('w', '2026-11-22').from, '2026-11-16', 'yakshanba — o\'tgan dushanbadan');
  assert.deepEqual(RP.periodRange('m', TODAY), { kind: 'm', from: '2026-11-01', to: TODAY, label: 'Oy' });
  assert.throws(() => RP.periodRange('y', TODAY)); assert.throws(() => RP.periodRange('d', 'xato'));
  assert.equal(RP.tashkentToday(new Date('2026-11-18T20:00:00Z')), '2026-11-19', 'Toshkent UTC+5');

  const data = fixture();
  const d = RP.periodStats(data, 'd', TODAY);
  // Savdo: 17 900 + 125 000 + 125 000 + 125 000 (10$) + 25 000 (f729) = 417 900
  assert.equal(d.sales, 417900); assert.equal(d.checks, 5);
  assert.equal(d.card, 125000 + 75000, 'karta + aralashning karta qismi');
  assert.equal(d.debt, 50000, '4$ qarz × 12 500');
  assert.equal(d.cash, 17900 + 50000 + 75000 + 25000, 'naqd so\'m + aralashning naqdi + naqd dollar (6$) + filial');
  assert.equal(d.cash + d.card + d.debt, d.sales, 'naqd + karta + qarz = savdo');
  assert.deepEqual(d.top.map((x) => [x.name, x.qty]), [['Freza', 5], ['Arra 300', 3], ['Tig 120', 2]], 'top 3 — miqdor bo\'yicha');
  assert.deepEqual(d.debtors, { count: 3, sum: 280000 }, 'qarzdorlar — barcha filiallar, davrga bog\'liq emas');
  const w = RP.periodStats(data, 'w', TODAY);
  assert.equal(w.sales, 417900 + 100000); assert.equal(w.checks, 6); assert.equal(w.top[0].name, 'Arra 300'); assert.equal(w.top[0].qty, 13);
  const m = RP.periodStats(data, 'm', TODAY);
  assert.equal(m.sales, 417900 + 100000 + 50000); assert.equal(m.debt, 50000 + 50000); assert.equal(m.checks, 7);
  assert.equal(RP.periodStats({ settings: {}, branchStore: {} }, 'd', TODAY).sales, 0, 'bo\'sh ma\'lumot');
}

async function testQueryAdminToken() {
  assert.deepEqual(RW.parseQuery('p=w'), { period: 'w', view: 'sum' });
  assert.deepEqual(RW.parseQuery('p=m;v=top'), { period: 'm', view: 'top' });
  assert.deepEqual(RW.parseQuery('p=d;v=debt'), { period: 'd', view: 'debt' });
  for (const bad of ['', 'p=y', 'p=w;v=all', 'p=w;', 'P=w', 'p=w ', 'p=w;v=top;x=1', 'p=' + 'w'.repeat(70), null, 5, { p: 'w' }])
    assert.equal(RW.parseQuery(bad), null, 'rad: ' + JSON.stringify(bad));
  assert.equal(RW.makeQuery('w'), 'p=w'); assert.equal(RW.makeQuery('m', 'top'), 'p=m;v=top'); assert.throws(() => RW.makeQuery('x'));
  assert.ok(Buffer.byteLength(RW.makeQuery('m', 'debt')) <= 64);

  const env = { TG_ADMIN_IDS: '111222333, 444555666 ;abc' };
  assert.deepEqual(RW.adminIds(env), ['111222333', '444555666']);
  assert.equal(RW.isAdminPrivate({ userId: 111222333, chatId: 111222333, chatType: 'private' }, env), true);
  assert.equal(RW.isAdminPrivate({ userId: 999888777, chatId: 999888777, chatType: 'private' }, env), false, 'admin emas');
  assert.equal(RW.isAdminPrivate({ userId: 111222333, chatId: -100123, chatType: 'group' }, env), false, 'guruhda — yo\'q');
  assert.equal(RW.isAdminPrivate({ userId: 111222333, chatId: 444555666, chatType: 'private' }, env), false, 'boshqa chat');
  assert.equal(RW.isAdminPrivate({ userId: 111222333 }, {}), false, 'ro\'yxat bo\'sh — hech kim');

  assert.throws(() => RW.botToken({}), /TG_BOT_TOKEN/);
  assert.throws(() => RW.botToken({ TG_BOT_TOKEN: 'xato' }), /TG_BOT_TOKEN/);
  assert.equal(RW.botToken({ TG_BOT_TOKEN: '123456:ABCdefGHIjklMNOpqrSTUvwxYZ0123456789' }), '123456:ABCdefGHIjklMNOpqrSTUvwxYZ0123456789');
  // Kodda token yoki Supabase kaliti yo'q
  for (const f of ['_lib/reportPeriod.js', '_lib/reportWidget.js']) {
    const s = fs.readFileSync(path.join(ROOT, 'netlify', 'functions', f), 'utf8');
    assert.ok(!/\d{6,}:[A-Za-z0-9_-]{30,}/.test(s) && !/eyJ[A-Za-z0-9_-]{20,}/.test(s) && !/sb_secret_/.test(s), f + ': kalit yo\'q');
  }
}

function sampleState(view) {
  const st = RP.periodStats(fixture(), 'w', TODAY);
  st.top = st.top.map((x) => Object.assign({}, x, { name: x.name + ' — juda uzun mahsulot nomi, 300×96T karbid tishli' }));
  return RW.widgetState(st, view);
}

async function testWidgetSize() {
  const html = RW.buildWidgetHtml(sampleState());
  const raw = Buffer.byteLength(html, 'utf8');
  const gz = zlib.gzipSync(html, { level: 9 }).length, br = zlib.brotliCompressSync(html).length, df = zlib.deflateRawSync(html, { level: 9 }).length;
  assert.ok(raw <= 32 * 1024, `HTML ${raw} bayt ≤ 32 KB`);
  assert.ok(gz <= 4096 && df <= 4096 && br <= 4096, `siqilgan: gzip ${gz}, deflate ${df}, brotli ${br} ≤ 4 KB`);
  // Tashqi resurs yo'q: src/href/url() da http(s) yoki // yo'q, <link>/<img>/@import yo'q
  assert.ok(!/(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i.test(html) && !/url\(/i.test(html) && !/@import|<link|<img|<iframe/i.test(html), 'tashqi resurs yo\'q');
  assert.match(html, /<svg[^>]*>/); assert.match(html, /powerful-pro hisobot/);
  for (const t of ['Bugun', 'Hafta', 'Oy', 'Top tovar', 'Qarzdorlar']) assert.ok(html.includes('>' + t + '<'), t);
  // Holat ichidagi «</script>» HTML'ni buzmaydi
  const evil = RW.buildWidgetHtml(Object.assign(sampleState(), { t: '</script><img src=x>' }));
  assert.equal((evil.match(/<\/script>/g) || []).length, 1, 'holat matni skriptni yopmaydi');
  console.log(`    widget: ${raw} bayt, gzip ${gz}, deflate ${df}, brotli ${br}`);
}

async function testWidgetBrowser() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 380, height: 640 } });
    const ext = []; await page.route('**/*', (r) => { ext.push(r.request().url()); r.abort(); });
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.setContent(RW.buildWidgetHtml(sampleState()));
    const cells = (sel) => page.$$eval(sel, (tr) => tr.map((r) => [...r.cells].map((c) => c.textContent).join(' ').trim()));
    const rows = await cells('#tb tr');
    assert.deepEqual(rows, ['Koʻrsatkich Soʻm', 'Savdo 517 900', 'Naqd 267 900', 'Karta 200 000', 'Qarz 50 000', 'Cheklar soni 6']);
    assert.equal(await page.$eval('#pg .on', (b) => b.textContent), 'Hafta', 'joriy davr belgilangan');
    assert.equal(await page.$eval('#t', (e) => e.textContent), '16.11.2026 – 18.11.2026');
    // Top tovar va Qarzdorlar — so'rovsiz (holatda bor), qayta bosish — jadvalga qaytadi
    await page.click('[data-v="top"]');
    const top = await page.$$eval('#tb tr', (tr) => tr.map((r) => r.textContent));
    assert.equal(top.length, 4); assert.match(top[1], /^1\. Arra 300/); assert.match(top[1], /13 · /);
    await page.click('[data-v="debt"]');
    assert.deepEqual(await cells('#tb tr'), ['Qarzdorlar', 'Soni 3', 'Jami qarz (soʻm) 280 000']);
    await page.click('[data-v="debt"]');
    assert.match(await page.$eval('#tb', (e) => e.textContent), /Cheklar soni/);
    // Davr tugmasi → botga so'rov (≤64 bayt), ulash nuqtasi orqali; yangi holat kelsa — qayta chiziladi
    await page.evaluate(() => { window.__q = []; window.fwWidgetSend = (q) => window.__q.push(q); });
    await page.click('[data-p="m"]'); await page.click('[data-v="top"]'); await page.click('[data-p="d"]');
    assert.deepEqual(await page.evaluate(() => window.__q), ['p=m', 'p=d;v=top']);
    assert.equal(await page.$eval('#m', (e) => e.textContent), 'Yangilanmoqda…');
    const dState = RW.widgetState(RP.periodStats(fixture(), 'd', TODAY));
    await page.evaluate((s) => window.fwWidgetSet(s), dState);
    assert.equal(await page.$eval('#pg .on', (b) => b.textContent), 'Bugun');
    assert.match(await page.$eval('#tb', (e) => e.textContent), /417 900/);
    assert.deepEqual(ext.filter((u) => !u.startsWith('about:') && !u.startsWith('data:')), [], 'tashqi so\'rov yo\'q');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

module.exports = {
  name: 'P91 — Telegram hisobot widgeti (API\'siz qismlar)',
  cases: [
    { name: "Davrlar (bugun / dushanbadan / oy boshidan), so'mga aylantirish, naqd+karta+qarz=savdo, aralash to'lov, bekor va jo'natma — yo'q; top 3; qarzdorlar", run: testPeriods },
    { name: "So'rov: faqat p=d|w|m (;v=sum|top|debt), ≤64 bayt; admin — faqat env ro'yxati va shaxsiy chat; token faqat env'dan; kodda kalit yo'q", run: testQueryAdminToken },
    { name: 'Widget HTML: ≤32 KB, siqilgan ≤4 KB, tashqi resurs yo\'q, SVG logotip, matn skriptni buzmaydi', run: testWidgetSize },
    { name: "Widget brauzerda: jadval so'mda, Top tovar / Qarzdorlar, davr tugmasi → so'rov, yangi holat chiziladi, tashqi so'rov yo'q", run: testWidgetBrowser },
  ],
};
