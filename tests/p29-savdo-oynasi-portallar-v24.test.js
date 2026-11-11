// P29 — v24: SAVDO OYNASI va PORTALLAR (haqiqiy sotuvchi.html / diller.html / js/main.js, Chromium, telefon o'lchami).
//  • Sotuvchi: tannarx ko'rinmaydi; shtrix-kod bilan topiladi; kam to'lov — «Qarzga yozish» / «Chegirma qilib berdim»
//    (aniq tasdiqlash matni; «Bekor» — hech narsa yuborilmaydi); qarz — mijozsiz rad; zarar — tasdiq (tannarxsiz matn);
//    v24.5: umumiy savdo oynasi (js/pos.js) — «Orqaga» va X bitta qadam (oyna yopiladi, savat saqlanadi);
//    Direct Sale — ruxsat bilan, ta'minotchi mahsulotdan; Chakana (so'm) / Optom ($) — savat saqlanadi.
//  • Admin: «Saqlanmadi» — serverning haqiqiy sababi ko'rsatiladi, yopiq eski yo'lga (upsert) o'tilmaydi, yolg'on «Saqlandi» yo'q;
//    tahrirlash muddati; rejim almashganda savat saqlanadi; kam to'lov chegirmasi — aniq matn bilan tasdiq; 🔔 oynasi.
//  • Diller: optomdan ko'pi bilan 10% chegirma (brauzer ham to'xtatadi), reviziya — sanoq yuboriladi, 🔔 belgisi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { loadApp, ROOT } = require('./helpers/load-app');
const { supabaseStub } = require('./p4-responsive.test.js')._helpers;

const json = (route, status, obj) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });
const exe = () => process.env.PLAYWRIGHT_CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
function staticServer() {
  const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); s.end(d); }); });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// ── 1. Sotuvchi portali ──
async function testSeller() {
  const srv = await staticServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: exe(), args: ['--no-sandbox'] });
  const SID = 77;
  const server = { settings: { usdUzs: 12500, rateDate: new Date().toISOString().slice(0, 10) },
    products: [
      { id: 1, sku: 'A1', name: 'Drel', markupPct: 25, optMarkupPct: 10, barcode: '4780000000017' },
      { id: 2, sku: 'B2', name: 'Disk', markupPct: 25, images: ['https://cdn.example.uz/disk.jpg'] },
      { id: 4, sku: 'DS4', name: 'Generator', directSale: true, dsSuppId: SID, dsCostUsd: 100, markupPct: 20 } ],
    branchStore: { baza: { customers: [{ id: 501, name: 'Ali', debt: 0 }], dailyClosings: [], expenses: [], suppliers: [{ id: SID, name: 'Taʼminotchi' }],
      batches: [{ id: 'b1', pid: 1, qty: 10, sold: 0, costUsd: 40, date: '2026-09-01', status: 'active' }, { id: 'b2', pid: 2, qty: 5, sold: 0, costUsd: 4, date: '2026-09-01', status: 'active' }],
      sales: [], cashboxes: [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 0 }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 0 }] } } };
  const checkouts = []; let perms = ['savdo.create'];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript({ content: supabaseStub({ loggedIn: true }) });
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.includes('/functions/app-data-load')) return json(route, 200, { data: JSON.parse(JSON.stringify(server)), ledgerAuthority: true });
      if (u.includes('/functions/staff-whoami')) return json(route, 200, { staff: { id: 9, name: 'Sotuvchi', filial: 'baza', active: true, role: 'sotuvchi' } });
      if (u.includes('/functions/rbac-user-permissions')) return json(route, 200, { name: 'Sotuvchi', roles: [], permKeys: perms });
      if (u.includes('/functions/sale-checkout-atomic')) {
        const b = JSON.parse(route.request().postData() || '{}'); checkouts.push(b);
        const total = b.items.reduce((s, i) => s + i.qty * i.sellUsd, 0) * (1 - (b.discPct || 0) / 100);
        return json(route, 200, { ok: true, ledger: true, localId: b.saleLocalId, inv: b.inv, totalUsd: total, debtUsd: Math.max(0, total - b.paidUsd), profitUsd: 0, balances: {} });
      }
      if (u.includes('/functions/')) return json(route, 200, {});
      if (u.startsWith(`http://127.0.0.1:${port}/`)) return route.continue();
      if (u.includes('cdn.jsdelivr.net') || u.includes('cdn.example.uz')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      return route.abort('failed');
    });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    const dialogs = []; let dialogAnswer = false;
    page.on('dialog', d => { dialogs.push(d.message()); dialogAnswer ? d.accept() : d.dismiss(); });
    await page.goto(`http://127.0.0.1:${port}/sotuvchi.html`); await page.waitForTimeout(1500);
    await page.waitForFunction(() => typeof POS !== 'undefined' && typeof svSwitchTab === 'function' && typeof ME !== 'undefined' && ME, null, { timeout: 15000 });   // v25: yuklama ostida barqaror
    await page.evaluate(() => svSwitchTab('sale'));   // v24.7: portal Bosh sahifadan ochiladi

    // v24.5: sotuvchi savdo oynasi — admin bilan bir xil (js/pos.js)
    // tannarx ko'rinmaydi (qidiruv ro'yxati) — narx so'mda (chakana): 40 × 1.25 = 50$ = 625 000 so'm
    await page.fill('#pos-q', 'Drel'); await page.waitForTimeout(150);
    let txt = await page.textContent('#pos-list');
    assert.doesNotMatch(txt, /Tannarx/i, "sotuvchiga tannarx ko'rsatilmaydi"); assert.match(txt, /625 000 soʻm/);
    // shtrix-kod (Enter) — mahsulot savatga
    await page.fill('#pos-q', '4780000000017'); await page.press('#pos-q', 'Enter'); await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(() => CART.map(i => [i.pid, i.qty])), [[1, 1]], 'shtrix-kod bilan topildi');
    await page.click('.pos-bar'); await page.waitForTimeout(100);
    assert.doesNotMatch(await page.textContent('#pos-ov'), /Tannarx|Foyda/i, "savatda ham tannarx/foyda yo'q");
    await page.click('#pos-ov .pos-foot .pos-btn.ok'); await page.waitForTimeout(100);

    // to'lov summasi kiritilmaguncha yopilmaydi
    let gate = await page.evaluate(() => ({ st: document.getElementById('pos-pay-st').textContent, dis: document.getElementById('pos-finish').disabled, b: document.getElementById('pos-finish').textContent }));
    assert.equal(gate.dis, true); assert.match(gate.b, /Olingan summani kiriting/);
    // kam to'lov: 625 000 o'rniga 615 000 → mijozsiz yopilmaydi
    await page.fill('#pos-paid', '615000'); await page.dispatchEvent('#pos-paid', 'input'); await page.waitForTimeout(100);
    gate = await page.evaluate(() => ({ st: document.getElementById('pos-pay-st').textContent, dis: document.getElementById('pos-finish').disabled, need: document.getElementById('pos-pay-cust').classList.contains('need') }));
    assert.match(gate.st, /Kam: 10 000 soʻm/); assert.match(gate.st, /mijoz tanlash majburiy/);
    // v25 (egasi qarori): sotuvchi chegirma bermaydi — «Farqni chegirma qilish» yo'q; kam to'lov faqat qarzga
    assert.doesNotMatch(gate.st, /Farqni chegirma qilish/);
    assert.equal(gate.dis, true); assert.equal(gate.need, true, 'mijoz tanlash maydoni belgilanadi');
    // v25: sotuvchida izoh, chekka chegirma, narx/% tugmalari yo'q
    assert.equal(await page.evaluate(() => posFull()), false);
    // to'liq summa — «Naqd savdo»
    await page.fill('#pos-paid', '625000'); await page.dispatchEvent('#pos-paid', 'input'); await page.waitForTimeout(100);
    gate = await page.evaluate(() => ({ st: document.getElementById('pos-pay-st').textContent, dis: document.getElementById('pos-finish').disabled, custHidden: document.getElementById('pos-pay-cust').hidden }));
    assert.match(gate.st, /Naqd savdo/, 'aniq summa — «Naqd savdo»'); assert.equal(gate.dis, false);
    assert.equal(gate.custHidden, true, 'sotuvchi: to\'liq to\'lovda mijoz kartasi yo\'q');
    assert.equal(checkouts.length, 0, 'yakunlanmaguncha savdo yuborilmadi');
    await page.click('#pos-finish'); await page.waitForTimeout(300);
    assert.equal(checkouts.length, 1, 'bitta savdo');
    const ck = checkouts[0];
    assert.ok(Math.abs(ck.paidUsd - 50) < 1e-6, 'to\'langan: 625 000 / 12 500'); assert.ok(Math.abs(ck.discPct) < 1e-9, 'chegirma yo\'q');
    assert.equal(ck.boxPayments[0].amount_native, 625000, "kassaga aynan olingan so'm"); assert.equal(ck.custId, null); assert.equal(ck.lossAck, false);
    // v24.5 audit: qattiq 300 ms o'rniga holat kutiladi (to'liq to'plam yuklamasida oyna kechroq yopilardi — test beqaror edi)
    const closed = await page.waitForFunction(() => !document.getElementById('pos-ov') && CART.length === 0, null, { timeout: 5000 }).then(() => true, () => false);
    assert.equal(closed, true, 'savdodan keyin oyna yopildi, savat boʻsh');
    await page.evaluate(() => closeModal());

    // v25 (egasi qarori): sotuvchi narxni o'zgartirmaydi — savatda narx tugmasi yo'q (faqat matn)
    await page.evaluate(() => { posAdd(1); posOpen('cart'); });
    assert.equal(await page.evaluate(() => document.querySelectorAll('#pos-ov [aria-label="Narxni oʻzgartirish"], #pos-ov [aria-label="Qator chegirmasi"]').length), 0);
    assert.doesNotMatch(await page.textContent('#pos-ov'), /Izoh qoʻshish|Chekka chegirma|Mijoz qoʻshish/);
    await page.evaluate(() => { posCloseAll(); CART = []; });

    // «Orqaga» (telefon tugmasi) — faqat oyna yopiladi, savat saqlanadi, sahifadan chiqilmaydi
    await page.evaluate(() => { posAdd(2); posOpen('cart'); posOpen('disc'); });
    await page.goBack(); await page.waitForTimeout(200);
    let nav = await page.evaluate(() => ({ stack: POS.stack.slice(), cart: CART.map(i => i.pid), url: location.pathname, xs: document.querySelectorAll('#pos-ov .pos-hd .pos-ib[aria-label="Yopish"]').length }));
    assert.deepEqual(nav.stack, ['cart'], '«Orqaga» — bitta qadam (chegirma yopildi, savat qoldi)'); assert.deepEqual(nav.cart, [2]); assert.equal(nav.url, '/sotuvchi.html');
    assert.equal(nav.xs, 1, 'bitta X');
    await page.click('#pos-ov .pos-hd .pos-ib[aria-label="Yopish"]'); await page.waitForTimeout(150);
    nav = await page.evaluate(() => ({ ov: !!document.getElementById('pos-ov'), cart: CART.length, url: location.pathname }));
    assert.deepEqual(nav, { ov: false, cart: 1, url: '/sotuvchi.html' }, 'X — savat oynasi yopildi, savat saqlandi');

    // Chakana → Optom: savat saqlanadi, narx optom (40 × 1.10 = 44$)
    await page.evaluate(() => { CART = []; posAdd(1); posSetMode('wholesale'); });
    assert.deepEqual(await page.evaluate(() => CART.map(i => [i.pid, i.qty, i.sellUsd])), [[1, 1, 44]]);
    await page.evaluate(() => posSetMode('retail'));
    assert.deepEqual(await page.evaluate(() => CART.map(i => [i.pid, i.sellUsd])), [[1, 50]]);

    // Direct Sale: ruxsatsiz — rad; ruxsat bilan — ta'minotchi va narx mahsulotdan, omborsiz
    await page.evaluate(() => { CART = []; posAdd(4); });
    assert.equal(await page.evaluate(() => CART.length), 0);
    await page.evaluate(() => { ME.perms = new Set(['savdo.create', 'savdo.direct_sale']); posAdd(4); });
    const ds = await page.evaluate(() => CART.map(i => ({ pid: i.pid, ds: !!i.directSupply, supp: i.suppId, sell: i.sellUsd })));
    assert.deepEqual(ds, [{ pid: 4, ds: true, supp: SID, sell: 120 }]);
    assert.deepEqual(errs, [], 'sahifada JS xatosi yo\'q');
  } finally { await browser.close(); srv.close(); }
}

// ── 2. Admin: saqlash xatosi, tahrirlash muddati, rejim, kam to'lov chegirmasi, 🔔 ──
async function testAdmin() {
  const reqs = [];
  const { browser, page } = await loadApp({ mockRoutes: [{ url: '**/.netlify/functions/**', handler: (route) => {
    const u = route.request().url(); const b = JSON.parse(route.request().postData() || '{}'); reqs.push({ u, b });
    if (u.includes('app-data-load')) return json(route, 200, { data: {} });
    if (u.includes('app-data-save')) return json(route, 403, { error: "Bu ma'lumotni saqlashga ruxsatingiz yo'q" });
    if (u.includes('/notifications')) {
      if (b.action === 'history') return json(route, 200, { ok: true, items: [{ id: 1, createdAt: new Date().toISOString(), entity: 'sale', entityId: 's1', action: 'edit', actor: 'Ali', actorRole: 'seller',
        before: { inv: 'INV-1', totalUsd: 40, items: [{ pid: 1, qty: 2, sellUsd: 20 }] }, after: { inv: 'INV-1', totalUsd: 44, items: [{ pid: 1, qty: 2, sellUsd: 22 }] } }] });
      if (b.action === 'list') return json(route, 200, { ok: true, items: b.scope === 'archive' ? [] : [{ id: 7, createdAt: new Date().toISOString(), kind: 'loss_sale', title: 'Zarar <b>bilan</b> savdo', body: 'x', read: false }], unread: b.scope === 'archive' ? 0 : 1 });
      return json(route, 200, { ok: true, marked: 1 });
    }
    return json(route, 200, {});
  } }] });
  try {
    await page.addScriptTag({ path: path.join(ROOT, 'js', 'notifications.js') });
    // «Saqlanmadi»: server 403 — sababi ko'rinadi, yopiq eski yo'l (anon upsert) chaqirilmaydi, yolg'on «Saqlandi» yo'q
    const r = await page.evaluate(async () => {
      let upserts = 0; _cloudEnabled = true;
      _db = { from: () => ({ upsert: async () => { upserts++; return { error: { message: 'permission denied' } }; }, select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) };
      authFetch = (u, o) => fetch(u, o);
      const ind = () => document.getElementById('save-indicator')?.textContent || '';
      window.__toasts = [];
      const ok = await fwSaveToast('✅ Saqlandi!');
      return { ok, upserts, ind: ind(), toasts: window.__toasts.map(t => t.msg) };
    });
    assert.equal(r.ok, false); assert.equal(r.upserts, 0, "yopiq eski yo'lga o'tilmadi");
    assert.match(r.ind, /Saqlanmadi: Bu ma'lumotni saqlashga ruxsatingiz yo'q/); assert.ok(!r.toasts.includes('✅ Saqlandi!'), 'yolg\'on muvaffaqiyat xabari yo\'q');

    // tahrirlash muddati (admin — 30 kun)
    const w = await page.evaluate(() => {
      if (!document.getElementById('modal-ov')) { const o = document.createElement('div'); o.id = 'modal-ov'; document.body.appendChild(o); }
      _cloudEnabled = false; window.__toasts = [];
      const d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
      S.sales = [{ id: 1, inv: 'OLD', date: d(40), items: [], totalUsd: 1 }, { id: 2, inv: 'NEW', date: d(10), items: [{ pid: 1, qty: 1, sellUsd: 5, costUsd: 4 }], totalUsd: 5 }];
      openSaleEdit(1); const blocked = !document.getElementById('modal-ov')?.classList.contains('open');
      const msg = window.__toasts.map(t => t.msg).join(' | ');
      openSaleEdit(2); const opened = document.getElementById('modal-ov')?.classList.contains('open'); closeModal();
      return { blocked, msg, opened };
    });
    assert.equal(w.blocked, true); assert.match(w.msg, /muddati tugagan \(30 kun\)/); assert.equal(w.opened, true);

    // rejim: savat saqlanadi, narx qayta hisoblanadi (v24.5 — umumiy savdo oynasi js/pos.js)
    const m = await page.evaluate(() => {
      S.products = [{ id: 1, sku: 'A1', name: 'Drel', markupPct: 25, optMarkupPct: 10, cat: 'X' }];
      S.batches = [{ id: 'b1', pid: 1, qty: 10, sold: 0, costUsd: 40, date: '2026-09-01', status: 'active' }];
      S.cashboxes = [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 0 }]; S.customers = [];
      S.cart = []; CUR.usdUzs = 12500;
      if (!document.getElementById('pg-savdo')) { const el = document.createElement('div'); el.id = 'pg-savdo'; document.body.appendChild(el); }
      pgSavdo(); posSetMode('retail'); posSetCur('UZS'); savdoAdd(1); const r1 = S.cart.map(i => [i.pid, i.qty, i.sellUsd]);
      posSetMode('wholesale'); const r2 = S.cart.map(i => [i.pid, i.qty, i.sellUsd]);
      posSetMode('retail');
      posOpen('cart'); const card = document.querySelector('#pos-ov .pos-card').textContent; posCloseAll();
      return { r1, r2, card };
    });
    assert.deepEqual(m.r1, [[1, 1, 50]]); assert.deepEqual(m.r2, [[1, 1, 44]], "Optom — 44$, savat saqlandi");
    assert.match(m.card, /Mijoz qoʻshish/); assert.match(m.card, /kam yoki koʻp toʻlovda majburiy/);

    // kam to'lov → «Farqni chegirma qilish»: aniq matn; Bekor — o'zgarmaydi
    const dialogs = []; let ans = false; page.on('dialog', d => { dialogs.push(d.message()); ans ? d.accept() : d.dismiss(); });
    const sc = async (a) => { ans = a; return page.evaluate(async () => { let got = null; const orig = _savdoCommit; _savdoCommit = (c) => { got = c; return false; };
      posOpen('pay'); posPaySet(615000); posShortToDisc(); const disc = POS.disc.val; await posFinish(); _savdoCommit = orig; posCloseAll(); POS.disc = { type: 'sum', val: 0 }; POS.pay.amount = '';
      return { got, disc }; }); };
    let got = await sc(false);
    assert.equal(dialogs.at(-1), 'Siz xaridorga 10 000 soʻm chegirma bermoqchisiz. Tasdiqlaysizmi?'); assert.equal(got.disc, 0); assert.equal(got.got, null, 'Bekor — savdo yo\'q (mijozsiz kam to\'lov yopilmaydi)');
    got = await sc(true);
    assert.equal(got.disc, 10000);
    assert.ok(got.got && Math.abs(got.got.totalUsd - 49.2) < 1e-9 && got.got.debtUsd === 0 && got.got.paidUsd === 49.2, 'chegirma: jami = to\'langan, qarz yo\'q');
    assert.equal(got.got.discountReason, 'short_payment'); assert.equal(got.got.roundedTotalUzs, 615000);
    // qarzga — mijozsiz bo'lmaydi
    got = await page.evaluate(() => { posOpen('pay'); posPaySet(615000); const r = { err: posBuildCtx().err, dis: document.getElementById('pos-finish').disabled }; posCloseAll(); return r; });
    assert.match(got.err, /mijoz tanlash majburiy/); assert.equal(got.dis, true);
    // v25: ortiqcha to'lov — shu ekranda «Qaytim» qatori; qaytim yozilmaguncha yopilmaydi, yozilsa — mijozsiz yopiladi
    got = await page.evaluate(() => { posOpen('pay'); posPaySet(630000); const r = { err: posBuildCtx().err, st: document.getElementById('pos-pay-st').textContent, dis: document.getElementById('pos-finish').disabled, row: !!document.getElementById('pos-chg') };
      POS.chg = '4 000'; r.bad = posBuildCtx().err; POS.chg = '5 000'; posChgGate(); const c = posBuildCtx(); r.ok = { err: c.err || null, st: c.status, chg: c.changeN, over: c.overpay, box: c.boxPayments.map(b => b.amount_native), dis: document.getElementById('pos-finish').disabled };
      POS.chg = ''; posCloseAll(); return r; });
    assert.equal(got.err, 'Qaytimni yozing'); assert.match(got.st, /Qaytim/); assert.match(got.st, /5 000 soʻm/); assert.equal(got.dis, true); assert.equal(got.row, true);
    assert.equal(got.bad, 'Qaytimni yozing', 'noto\'g\'ri qaytim — yopilmaydi');
    assert.deepEqual(got.ok, { err: null, st: 'exact', chg: 5000, over: null, box: [625000], dis: false }, 'qaytim berildi — kassaga aynan jami');

    // 🔔 bildirishnomalar: belgi, oyna, savdo tarixi (oldingi → yangi), HTML ekranlangan
    const n = await page.evaluate(async () => {
      _cloudEnabled = true; authFetch = (u, o) => fetch(u, o);
      const b = document.createElement('b'); b.setAttribute('data-ntf-n', ''); b.hidden = true; document.body.appendChild(b);
      await ntfLoad(true);
      await ntfSheet('active'); const act = document.querySelector('#bs-ov .bs-body').innerHTML;
      await ntfSheet('history'); const hist = document.querySelector('#bs-ov .bs-body').textContent;
      return { badge: b.textContent, hidden: b.hidden, injected: /<b>bilan<\/b>/.test(act), act, hist };
    });
    assert.equal(n.badge, '1'); assert.equal(n.hidden, false); assert.equal(n.injected, false, 'sarlavhadagi HTML ishlamaydi');
    assert.match(n.hist, /Savdo INV-1 — Tahrirlandi/); assert.match(n.hist, /Jami: \$40\.00 → \$44\.00/); assert.match(n.hist, /Ali \(Sotuvchi\)/);
  } finally { await browser.close(); }
}

// ── 3. Diller portali: 10% chegara, reviziya, 🔔 ──
async function testDealer() {
  const srv = await staticServer(); const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: exe(), args: ['--no-sandbox'] });
  const calls = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript({ content: supabaseStub({ loggedIn: true }) });
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.includes('/functions/notifications')) { const b = JSON.parse(route.request().postData() || '{}'); calls.push(b);
        if (b.action === 'dealer_list') return json(route, 200, { ok: true, items: [{ id: 3, createdAt: new Date().toISOString(), title: 'Toʻlovingiz qabul qilindi', body: '', read: false }], unread: 1 });
        if (b.action === 'rev_summary') return json(route, 200, { ok: true, items: [{ pid: 101, sku: 'A-101', name: 'Drel', received: 12, sold: 2, returned: 2, system: 8 }] });
        if (b.action === 'rev_submit') return json(route, 200, { ok: true, replay: false, result: { lines: b.lines, shortageQty: 1, surplusQty: 0 } });
        return json(route, 200, { ok: true }); }
      if (u.includes('/functions/')) return json(route, 200, {});
      if (u.startsWith(`http://127.0.0.1:${port}/`)) return route.continue();
      if (u.includes('cdn.jsdelivr.net')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      return route.abort('failed');
    });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/diller.html`); await page.waitForTimeout(800);
    await page.evaluate(() => { ME = { id: 1, name: 'Jasur', region: 'Samarqand', filial: 'baza', debt_usd: 0, total_paid_usd: 0, points: 0 };
      STOCK = [{ pid: 101, sku: 'A-101', name: 'Drel', qty: 8, avg_cost_usd: 15 }]; SALES = []; CATALOG = [{ id: 101, optim_price: 20, point_pct: 0 }]; MY_ORDERS = []; dlShowApp(); });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.getElementById('dl-bell-n').textContent + '|' + document.getElementById('dl-bell-n').hidden), '1|false', '🔔 belgisi');
    // v24.5: diller sotuvi — savatcha (Omborim «Sotish» → Sotuv bo'limi). 10%: 17.99 — brauzer to'xtatadi (server ham rad etadi — P28)
    const f = await page.evaluate(async () => {
      dlOpenSale(101); const tab = ACTIVE_TAB; dlSaleCartOpen(); dlSalePrice(101, '17.99');
      const line = document.querySelector('#dlc-ov .pos-line-m').textContent;
      let rpc = 0; const orig = db.rpc; db.rpc = async () => { rpc++; return { error: null }; };
      window.__t = []; const ot = toast; toast = (m) => window.__t.push(m);
      await dlSaleSubmit();
      db.rpc = orig; toast = ot;
      return { tab, line, rpc, t: window.__t.join('|') };
    });
    assert.equal(f.tab, 'sale', 'Omborimdagi «Sotish» — Sotuv bo\'limiga'); assert.match(f.line, /eng kami \$18\.00 \(−10%\)/);
    assert.equal(f.rpc, 0, 'past narx — serverga yuborilmadi'); assert.match(f.t, /narxi juda past: eng kami \$18\.00/);
    // optomdan past, lekin 10% ichida — «ziyon qilishingiz mumkin, rozimisiz?»; rad etilsa serverga yuborilmaydi
    const dlg = []; let dAns = false; page.on('dialog', d => { dlg.push(d.message()); dAns ? d.accept() : d.dismiss(); });
    const w = await page.evaluate(async () => {
      dlSaleAdd(101, 1); dlSalePrice(101, '18.5'); let rpc = 0; const orig = db.rpc; db.rpc = async () => { rpc++; return { error: null }; };
      await dlSaleSubmit(); db.rpc = orig; return { rpc, qty: DLC.cart[101].qty }; });
    assert.equal(w.rpc, 0, 'rad etildi — savdo yo\'q'); assert.equal(w.qty, 2); assert.match(dlg.at(-1) || '', /Ziyon qilishingiz mumkin\. Sotuvga rozimisiz\?/); assert.match(dlg.at(-1), /\$3\.00/);
    // «Orqaga» — faqat savat oynasi yopiladi, savat saqlanadi
    await page.goBack(); await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => ({ ov: !!document.getElementById('dlc-ov'), qty: DLC.cart[101] && DLC.cart[101].qty, url: location.pathname })), { ov: false, qty: 2, url: '/diller.html' }, '«Orqaga» savat oynasini yopdi');
    // muvaffaqiyatli savdodan keyin oyna yopiladi va savat bo'shaydi (qayta yuborish xavfi yo'q)
    const okSale = await page.evaluate(async () => { dlSaleCartOpen(); dlSalePrice(101, '20'); const calls = []; const orig = db.rpc; db.rpc = async (n, a) => { calls.push([n, a.p_pid, a.p_qty, a.p_sell_usd]); return { error: null }; };
      await dlSaleSubmit(); db.rpc = orig; return { ov: !!document.getElementById('dlc-ov'), cart: Object.keys(DLC.cart).length, calls }; });
    assert.deepEqual(okSale, { ov: false, cart: 0, calls: [['record_dealer_sale_v42', 101, 2, 20]] }, 'savdo tasdiqlangach oyna yopildi (v25: 42 bo\'lsa _v42)');
    await page.evaluate(() => dlSwitchTab('revision'));
    await page.waitForTimeout(300);
    const rv = await page.evaluate(() => document.querySelector('.dlrev-r').textContent);
    assert.match(rv, /Drel/); assert.match(rv, /12/); assert.match(rv, /8/);
    await page.fill('.dlrev-in', '7'); await page.dispatchEvent('.dlrev-in', 'input');
    assert.equal(await page.textContent('#dlrev-d-101'), '-1');
    await page.fill('#dlrev-reason', 'Bittasi singan');
    const cover = await page.evaluate(() => { const b = document.getElementById('dlrev-send'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el === b || b.contains(el) ? '' : (el.className || el.tagName) + ' / ' + (el.parentElement && el.parentElement.className); });
    assert.equal(cover, '', 'yuborish tugmasini hech narsa yopmaydi');
    await page.click('#dlrev-send'); await page.waitForTimeout(300);
    const sub = calls.find(c => c.action === 'rev_submit');
    assert.deepEqual(sub.lines, [{ pid: 101, counted: 7 }]); assert.equal(sub.reason, 'Bittasi singan'); assert.match(sub.idemKey, /^rv[a-z0-9]{8,}$/);
    assert.match(await page.textContent('#dl-content'), /kamomad 1 dona/);
    // 🔔 oynasi — o'qildi
    await page.click('#dl-bell'); await page.waitForTimeout(300);
    assert.match(await page.textContent('#dl-content'), /Toʻlovingiz qabul qilindi/);
    assert.ok(calls.some(c => c.action === 'dealer_read' && c.ids[0] === 3), "o'qildi belgisi yuborildi");
    assert.deepEqual(errs, []);
  } finally { await browser.close(); srv.close(); }
}

module.exports = {
  name: 'P29 — v24: savdo oynasi (sotuvchi/admin), kam to\'lov va chegirma, zarar tasdig\'i, katalog va «Orqaga», rejimlar, diller −10% va reviziya, 🔔',
  cases: [
    { name: "Sotuvchi: tannarxsiz, shtrix-kod, kam to'lov (aniq matn, Bekor), zarar tasdig'i, «Orqaga» bitta qadam, Chakana/Optom, Direct Sale", run: testSeller },
    { name: "Admin: «Saqlanmadi» — haqiqiy sabab, yopiq yo'lsiz, yolg'on xabarsiz; tahrirlash muddati; rejim; chegirma tasdig'i; 🔔 va savdo tarixi", run: testAdmin },
    { name: "Diller: sotuv savatchasi, optomdan ko'pi bilan 10% (brauzer ham), reviziya yuborish, 🔔 o'qildi", run: testDealer },
  ],
};
