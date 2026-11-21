// P95 — v25.6: Excel orqali kirim qilingan KATTA partiyani (800–2000 qator) o'chirish/tahrirlash.
// Sabab (prod jurnali): «Butun partiyani o'chirish» 1612 ta partiyani BITTA so'rovda yuborar, server esa eng ko'pi 500 qabul qiladi →
// 400 «Partiyalar ro'yxati noto'g'ri» — hech narsa o'chmasdi. Endi 400 talik qismlarga bo'linadi.
// Qo'shimcha: bitta qatorni o'chirgach ro'yxat yopilib ketmaydi; serverda bor, lekin JSON'da yo'q (saqlash 401 bilan yiqilgan) partiyalar
// yuklashda ro'yxatga qaytadi (shunda ularni ko'rish va o'chirish mumkin).
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');
const LA = require('../netlify/functions/_lib/ledgerAuthority');

async function withApp(fn) {
  const { browser, page, consoleErrors } = await loadApp({});
  try {
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div><div id="pg-kirim" class="page"></div><div id="pg-ombor" class="page"></div>');
      _cloudEnabled = false; save = async () => true; fwCleanupOrphans = () => {};
      window.__conf = []; confirm = (m) => { __conf.push(m); return true; };
      window.__calls = []; window.__failAt = 0;
      // soxta server: haqiqiy chegarani takrorlaydi (≤500) va haqiqiy xabarni qaytaradi
      fwLedgerRemote = () => true;
      fwLedgerCall = async (fn, body) => {
        const ids = body.payload.localIds || (body.payload.edits || []).map(e => e.localId);
        __calls.push({ kind: body.kind, n: ids.length });
        if (ids.length > 500) throw new Error("Partiyalar ro'yxati noto'g'ri");
        if (__failAt && __calls.length === __failAt) throw new Error('Server bilan aloqa yoʻq');
        if (body.kind === 'batch_delete') { const s = new Set(ids); S.batches = S.batches.filter(b => !s.has(String(b.id))); }   // fwApplyLedger shunday qiladi
        return {};
      };
      const t = new Date().toISOString().slice(0, 10);
      S.products = Array.from({ length: 1250 }, (_, i) => ({ id: i + 1, sku: 'S' + (i + 1), name: 'Mahsulot ' + (i + 1), cat: 'K', unit: 'dona', minStock: 1, markupPct: 25 }));
      Object.assign(S, { branch: 'baza', page: 'kirim', sales: [], filialOrders: [], dealerStock: [], dealerTxns: [],
        batches: S.products.map(p => ({ id: uid(), pid: p.id, bno: '02', origin: 'Bosh qoldiq (Excel)', cur: 'USD', qty: 10, sold: 0, costUsd: 2, date: t, status: 'active', suppId: null, items: [] })) });
      pgKirim();
    });
    await fn(page);
    assert.deepEqual(consoleErrors, [], "sahifada JS xatosi yo'q");
  } finally { await browser.close(); }
}

async function testGroupDelete() {
  await withApp(async (page) => {
    const r = await page.evaluate(async () => { await deleteBatchGroup('02'); return { left: S.batches.length, calls: __calls, tomb: ((S.deletedIds || {}).batches || []).length }; });
    assert.equal(r.left, 0, "1250 ta qator — hammasi o'chdi");
    assert.deepEqual(r.calls.map(c => c.n), [400, 400, 400, 50], 'server chegarasi (500) dan oshmaydi — 400 talik qismlar');
    assert.ok(r.calls.every(c => c.kind === 'batch_delete'));
    assert.equal(r.tomb, 1250, "har biri o'chirilganlar ro'yxatida");
  });
}

async function testPartialFail() {
  await withApp(async (page) => {
    const r = await page.evaluate(async () => {
      __failAt = 2; const toasts = []; const t0 = toast; toast = (m, k) => { toasts.push(String(m)); };
      await deleteBatchGroup('02'); toast = t0;
      return { left: S.batches.length, calls: __calls.length, toasts, tomb: ((S.deletedIds || {}).batches || []).length };
    });
    assert.equal(r.calls, 2, '2-qism yiqilgach to\'xtaydi');
    assert.equal(r.left, 850, "1-qism (400) o'chgan, qolgani joyida");
    assert.equal(r.tomb, 400);
    assert.match(r.toasts.join('|'), /400 \/ 1250/); assert.match(r.toasts.join('|'), /aloqa yo/);
    // qayta urinish — faqat qolgan 850 ta
    const r2 = await page.evaluate(async () => { __calls.length = 0; __failAt = 0; await deleteBatchGroup('02'); return { left: S.batches.length, calls: __calls.map(c => c.n) }; });
    assert.equal(r2.left, 0); assert.deepEqual(r2.calls, [400, 400, 50]);
  });
}

async function testGroupEdit() {
  await withApp(async (page) => {
    const r = await page.evaluate(async () => {
      openBatchGroupEdit('02');
      document.querySelectorAll('[data-bid]').forEach(inp => { if (inp.tagName === 'INPUT' && inp.dataset.bid && /qty|^$/i.test(inp.className + '') || true) { /* hammasi */ } });
      const ins = [...document.querySelectorAll('input[data-bid]')];
      const qtyIn = ins.filter(i => String(i.value) === '10');
      qtyIn.forEach(i => { i.value = '11'; });
      const fn = typeof saveBatchGroupEdit === 'function' ? saveBatchGroupEdit : (typeof confirmBatchGroupEdit === 'function' ? confirmBatchGroupEdit : null);
      if (!fn) return { err: 'saqlash funksiyasi topilmadi', fns: Object.keys(window).filter(k => /BatchGroup/i.test(k)) };
      await fn('02');
      return { calls: __calls.map(c => c.n), inputs: ins.length };
    });
    assert.ok(!r.err, JSON.stringify(r));
    assert.ok(r.calls.length >= 3 && r.calls.every(n => n <= 400) && r.calls.reduce((a, b) => a + b, 0) === 1250, 'tahrir ham 400 talik qismlarda: ' + JSON.stringify(r.calls));
  });
}

async function testRowDeleteKeepsOpen() {
  await withApp(async (page) => {
    await page.evaluate(() => { kirimToggleDetail('02'); });
    const r = await page.evaluate(async () => {
      await deleteBatch(S.batches[3].id);
      const d = document.querySelector('.kh-detail');
      return { n: S.batches.length, rows: document.querySelectorAll('.kh-detail .kh-row').length, open: !!d && !d.hidden, aria: document.querySelector('.kh-more')?.getAttribute('aria-expanded') };
    });
    assert.equal(r.n, 1249); assert.equal(r.rows, 1249);
    assert.equal(r.open, true, "bitta qator o'chgach ro'yxat yopilib ketmaydi (keyingisini o'chirish uchun)"); assert.equal(r.aria, 'true');
  });
}

async function testUid() {
  await withApp(async (page) => {
    const r = await page.evaluate(() => { const a = Array.from({ length: 5000 }, () => uid()); return { n: a.length, uniq: new Set(a).size, sorted: a.every((v, i) => !i || v > a[i - 1]), safe: Number.isSafeInteger(a[a.length - 1]) }; });
    assert.equal(r.uniq, r.n, "bir millisekundda 5000 ta ID — takrorlanmaydi"); assert.ok(r.sorted && r.safe);
  });
}

function overlayTest() {
  const ledger = (rows) => ({ customers: new Map(), suppliers: new Map(), sales: new Map(), writeoffs: [], credits: new Map(),
    batches: new Map(rows.map(([k, o]) => [k, { qty: 10, sold: 0, status: 'active', costUsd: 2, pid: 5, bno: '02', origin: 'Bosh qoldiq (Excel)', fromBranch: null, date: '2026-11-17', ...o }])) });
  const L = ledger([['1794913869343002', {}], ['1794913869343003', { status: 'deleted' }], ['1794913869343004', { pid: 0 }], ['tr7-1', { origin: 'Bazadan', fromBranch: 'baza' }], ['1794913869343005', { sold: 3 }]]);
  const out = LA.overlayBranchLedger({ batches: [{ id: 1794913869343005, pid: 5, bno: '01', qty: 10, sold: 3, costUsd: 2, status: 'active' }] }, L).branch.batches;
  const ids = out.map(b => b.id);
  assert.ok(ids.includes(1794913869343002), "JSON'da yo'q, serverda faol import partiyasi — qaytadi (raqamli id)");
  assert.ok(!ids.some(i => String(i) === '1794913869343003'), "o'chirilgan — qaytmaydi");
  assert.ok(!ids.some(i => String(i) === '1794913869343004'), "mahsulotsiz (pid yo'q) — qaytmaydi");
  assert.ok(ids.includes('tr7-1'), "filial o'tkazmasi partiyasi — avvalgidek");
  assert.equal(ids.filter(i => String(i) === '1794913869343005').length, 1, "JSON'da bor partiya takrorlanmaydi");
  const adopted = out.find(b => b.id === 1794913869343002);
  assert.deepEqual({ pid: adopted.pid, bno: adopted.bno, qty: adopted.qty, sold: adopted.sold, status: adopted.status, cur: adopted.cur, origin: adopted.origin, date: adopted.date },
    { pid: 5, bno: '02', qty: 10, sold: 0, status: 'active', cur: 'USD', origin: 'Bosh qoldiq (Excel)', date: '2026-11-17' });
}

module.exports = { name: 'P95 — katta (Excel) partiyani o\'chirish va saqlanmay qolgan partiyalarni tiklash (v25.6)', cases: [
  { name: "butun partiya (1250 qator) o'chirish — server chegarasi (500) dan oshmaydi: 400 talik qismlar", run: testGroupDelete },
  { name: "o'chirish qisman yiqilsa — o'chganlari ro'yxatdan chiqadi, xabar aniq, qayta urinish faqat qolganini yuboradi", run: testPartialFail },
  { name: "butun partiyani tahrirlash ham 400 talik qismlarda", run: testGroupEdit },
  { name: "bitta qatorni o'chirgach batafsil ro'yxat yopilib ketmaydi", run: testRowDeleteKeepsOpen },
  { name: "uid(): Excel hajmida (1000+ ta bir millisekundda) takrorlanmaydi", run: testUid },
  { name: "serverda bor, JSON'da yo'q (saqlash yiqilgan) import partiyalari yuklashda qaytadi; o'chirilgan/mahsulotsiz — yo'q", run: overlayTest },
] };
