// P68 — v24.9 (egasi qarori): NASIYA MUDDATI va ESLATMA.
//  • Nasiyada muddat (kun) majburiy, standart 10 kun; sana avtomatik (22.10.2026 + 10 kun = 01.11.2026); savdoga yoziladi.
//  • Ochiq nasiyalar FIFO bo'yicha (to'lov eng eskisini yopadi); muddatsiz eski qarz — mijoz kartasida muddat qo'yiladi.
//  • Eslatma: ertaga (1 kun oldin), bugun, muddati o'tgan — bosh sahifa va Mijozlar bo'limida katta panel, kuniga bir marta oyna.
//  • Xabar: SMS / Telegram / WhatsApp — tayyor matn (mijoz ismi, summa, muddat, do'kon telefoni).
//  • «Qarzsizlar» o'rniga «Muddati o'tgan» filtri.
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;

const seed = () => {
  S.products = [{ id: 1, sku: 'PG-1002', name: 'Makita perforator', cat: 'Perforator', markupPct: 25, unit: 'dona' }];
  S.batches = [{ id: 11, pid: 1, qty: 10, sold: 0, costUsd: 84, status: 'active', date: td() }];
  S.customers = [{ id: 501, name: 'Ali', phone: '+998 90 111 22 33', debt: 0 }];
  S.cashboxes = [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 0 }];
  S.sales = []; S.cart = []; S.savdoCustId = null;
  S.settings = Object.assign(S.settings || {}, { shopPhone: '+998 71 200 00 00' });
  CUR.usdUzs = 12500;
};

module.exports = {
  name: 'P68 — nasiya muddati: majburiy kun, FIFO, eslatma paneli, SMS/Telegram/WhatsApp',
  cases: [
    { name: 'hisob-kitob: sana qo\'shish, holat, FIFO, muddatsiz qism, uzaytirish, eslatma tartibi, telefon, matn', async run() {
      const { browser, page } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        const r = await page.evaluate(() => {
          const T = '2026-10-22', rate = (usd) => Math.round(usd * 10000);
          const c = { id: 7, name: 'Vali', phone: '901234567', debt: 2500000 };
          const sales = [
            { id: 1, custId: 7, date: '2026-10-01', inv: 'S-1', debtUsd: 100, dueDate: '2026-10-11', dueDays: 10 },   // 1 000 000
            { id: 2, custId: 7, date: '2026-10-15', inv: 'S-2', debtUsd: 200, dueDate: '2026-10-25', dueDays: 10 },   // 2 000 000
            { id: 3, custId: 7, date: '2026-10-16', inv: 'S-3', debtUsd: 50, status: 'voided', dueDate: '2026-10-17' },
            { id: 4, custId: 8, date: '2026-10-16', inv: 'S-4', debtUsd: 50, dueDate: '2026-10-17' },
          ];
          const d1 = fwCustDues(c, sales, T, rate);
          const c2 = { id: 7, name: 'Vali', debt: 3500000, debtDue: '2026-10-23' };
          const d2 = fwCustDues(c2, sales, T, rate);
          const c3 = Object.assign({}, c, { dueOv: { '1': '2026-10-30' } });
          const d3 = fwCustDues(c3, sales, T, rate);
          const rem = fwDueReminders([c, { ...c2, id: 9 }, { id: 10, name: 'Qarzsiz', debt: 0 }], sales, T, rate);
          const msg = fwDueMessage({ c, st: 'overdue', days: -11, due: '2026-10-11', amountUzs: 500000, debtUzs: 2500000 }, { brand: 'POWERFUL', phone: '+998 71 200 00 00' });
          return {
            add: [fwDueAdd('2026-10-22', 10), fwDueAdd('2026-12-25', 10), fwDueAdd('2028-02-28', 1)],
            fmt: fwDueFmt('2026-11-01'),
            st: ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-30', null].map(d => fwDueState(d, T).st),
            ok: [fwDueDaysOk('10'), fwDueDaysOk('0'), fwDueDaysOk('366'), fwDueDaysOk('abc'), fwDueDaysOk(' 30 ')],
            d1: d1.map(x => [x.inv, x.openUzs, x.st, x.days]),
            d2: d2.map(x => [x.inv || 'legacy', x.openUzs, x.st]),
            d3: d3.map(x => [x.inv, x.due, x.st]),
            sum: (() => { const s = fwCustDueSum(c, sales, T, rate); return [s.st, s.days, s.overUzs]; })(),
            rem: rem.map(x => [x.c.id, x.st, x.amountUzs]),
            ph: [fwPhoneIntl('+998 90 123-45-67'), fwPhoneIntl('901234567'), fwPhoneIntl('12')],
            msg, links: fwDueLinks({ c }, 'Salom'),
            fields: [fwSaleDueFields({ dueDays: 15, dueDate: '2026-11-06' }, 10), fwSaleDueFields({}, 0), Object.keys(fwSaleDueFields({}, 5)).sort()],
          };
        });
        assert.deepEqual(r.add, ['2026-11-01', '2027-01-04', '2028-02-29'], '22.10.2026 + 10 kun = 01.11.2026');
        assert.equal(r.fmt, '01.11.2026');
        assert.deepEqual(r.st, ['overdue', 'today', 'soon', 'ok', 'none']);
        assert.deepEqual(r.ok, [10, null, null, null, 30]);
        // FIFO: 2.5 mln qarz — eng yangi S-2 (2 mln) to'liq ochiq, S-1 dan 0.5 mln; bekor qilingan va boshqa mijoz — hisobga olinmaydi
        assert.deepEqual(r.d1, [['S-2', 2000000, 'ok', 3], ['S-1', 500000, 'overdue', -11]]);
        assert.deepEqual(r.d2, [['S-2', 2000000, 'ok'], ['S-1', 1000000, 'overdue'], ['legacy', 500000, 'soon']], 'muddatsiz qism — mijoz kartasidagi muddat');
        assert.deepEqual(r.d3, [['S-2', '2026-10-25', 'ok'], ['S-1', '2026-10-30', 'ok']], 'uzaytirilgan muddat');
        assert.deepEqual(r.sum, ['overdue', -11, 500000]);
        // id 9 — savdolari yo'q: butun qarz muddatsiz qism (kartadagi muddat ertaga); qarzsiz mijoz — ro'yxatda yo'q
        assert.deepEqual(r.rem, [[7, 'overdue', 500000], [9, 'soon', 3500000]], 'eng shoshilinchi birinchi');
        assert.deepEqual(r.ph, ['998901234567', '998901234567', '']);
        assert.match(r.msg, /Vali/); assert.match(r.msg, /11\.10\.2026/); assert.match(r.msg, /2 500 000 soʻm/); assert.match(r.msg, /11 kun oʻtdi/); assert.match(r.msg, /POWERFUL/); assert.match(r.msg, /\+998 71 200 00 00/);
        assert.equal(r.links.wa, 'https://wa.me/998901234567?text=Salom');
        assert.equal(r.links.sms, 'sms:+998901234567?&body=Salom');
        assert.equal(r.links.tg, 'https://t.me/+998901234567');
        assert.deepEqual(r.fields[0], { dueDays: 15, dueDate: '2026-11-06' });
        assert.deepEqual(r.fields[1], {}, 'qarz yo\'q — muddat yozilmaydi');
        assert.deepEqual(r.fields[2], ['dueDate', 'dueDays']);
      } finally { await browser.close(); }
    } },
    { name: 'savdo oynasi: nasiyada muddat majburiy (standart 10 kun), noto\'g\'ri kun — yopilmaydi, savdoga yoziladi', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        const r = await page.evaluate(async (seedSrc) => {
          eval(seedSrc)(); try { localStorage.removeItem('fw_pos_prefs_admin'); } catch (_) {}
          go('savdo'); POS.mode = 'retail'; POS.cur = 'UZS';
          posAdd(1); posOpen('pay'); S.savdoCustId = 501;
          const out = {};
          posPaySet(0);
          const fin = () => ({ dis: document.getElementById('pos-finish').disabled, txt: document.getElementById('pos-finish').textContent });
          out.def = { box: !!document.getElementById('pos-due'), val: document.getElementById('pos-due-in').value, date: document.getElementById('pos-due-d').textContent, fin: fin(), on: document.querySelector('#pos-due .pos-due-q button.on')?.textContent };
          out.exp = 'Toʻlov sanasi: ' + fwDueFmt(fwDueAdd(fwLocalDay(), 10));
          const inp = document.getElementById('pos-due-in'); inp.value = '0'; inp.dispatchEvent(new Event('input'));
          out.bad = { fin: fin(), date: document.getElementById('pos-due-d').textContent, err: posBuildCtx().err };
          posDueSet('15', true);
          const c = posBuildCtx(); out.ctx = { days: c.dueDays, date: c.dueDate, exp: fwDueAdd(fwLocalDay(), 15), fin: fin() };
          // To'liq to'lovda — muddat bloki yo'q, savdoda muddat yo'q
          posPaySet(posTotals().needN); out.full = { box: !!document.getElementById('pos-due'), days: posBuildCtx().dueDays };
          // Nasiya bilan yakunlash — savdo yozuvida muddat
          posPaySet(0); posDueSet('15', true);
          authFetch = async (url, o) => { const b = JSON.parse(o.body); const total = b.items.reduce((s, i) => s + i.qty * i.sellUsd, 0);
            return { ok: true, json: async () => ({ ok: true, ledger: true, localId: b.saleLocalId, inv: b.inv, totalUsd: total, debtUsd: total - b.paidUsd, costUsd: 84, profitUsd: total - 84, balances: {}, custDebtUzs: Math.round(total * 12500) }) }; };
          _cloudEnabled = true; fwApplyLedger = () => {}; save = () => {};
          await posFinish();
          const s = S.sales[S.sales.length - 1]; out.sale = s && { days: s.dueDays, date: s.dueDate, debt: s.debtUsd > 0 };
          out.reset = POS.dueDays;
          return out;
        }, `(${seed.toString()})`);
        assert.equal(r.def.box, true, 'nasiyada muddat bloki'); assert.equal(r.def.val, '10', 'standart 10 kun'); assert.equal(r.def.on, '10');
        assert.equal(r.def.date, r.exp); assert.equal(r.def.fin.dis, false); assert.match(r.def.fin.txt, /Qarzga yozib/);
        assert.equal(r.bad.fin.dis, true, '0 kun — yopilmaydi'); assert.match(r.bad.fin.txt, /muddatini kiriting/); assert.match(r.bad.date, /1 dan 365/); assert.match(r.bad.err, /muddatini/);
        assert.deepEqual([r.ctx.days, r.ctx.date], [15, r.ctx.exp]); assert.equal(r.ctx.fin.dis, false);
        assert.deepEqual(r.full, { box: false, days: null }, 'to\'liq to\'lov — muddat yo\'q');
        assert.ok(r.sale && r.sale.debt, 'nasiya savdo'); assert.equal(r.sale.days, 15); assert.equal(r.sale.date, r.ctx.exp);
        assert.equal(r.reset, '', 'keyingi savdo — yana standart');
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
    { name: 'eslatma: bosh sahifa va Mijozlar — katta panel, kunlik oyna bir marta, «Muddati o\'tgan» filtri, xabar oynasi, muddat belgilash', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 1280, height: 900, admin: true });
      try {
        const r = await page.evaluate(async (seedSrc) => {
          eval(seedSrc)();
          const T = fwLocalDay(), R = 12500;
          S.customers = [
            { id: 1, name: 'Oʻtgan', phone: '901112233', debt: 1250000 },
            { id: 2, name: 'Bugun', phone: '902223344', debt: 625000 },
            { id: 3, name: 'Ertaga', phone: '', debt: 125000 },
            { id: 4, name: 'Uzoq', phone: '904445566', debt: 250000 },
            { id: 5, name: 'Eski qarz', phone: '905556677', debt: 300000 },
            { id: 6, name: 'Toza', phone: '906667788', debt: 0 },
          ];
          S.sales = [
            { id: 11, custId: 1, date: fwDueAdd(T, -15), inv: 'S-11', debtUsd: 100, rateUsdUzs: R, dueDays: 10, dueDate: fwDueAdd(T, -5), status: 'done', totalUsd: 100 },
            { id: 12, custId: 2, date: fwDueAdd(T, -10), inv: 'S-12', debtUsd: 50, rateUsdUzs: R, dueDays: 10, dueDate: T, status: 'done', totalUsd: 50 },
            { id: 13, custId: 3, date: fwDueAdd(T, -9), inv: 'S-13', debtUsd: 10, rateUsdUzs: R, dueDays: 10, dueDate: fwDueAdd(T, 1), status: 'done', totalUsd: 10 },
            { id: 14, custId: 4, date: T, inv: 'S-14', debtUsd: 20, rateUsdUzs: R, dueDays: 10, dueDate: fwDueAdd(T, 10), status: 'done', totalUsd: 20 },
          ];
          try { Object.keys(localStorage).filter(k => k.startsWith('fw_due_pop')).forEach(k => localStorage.removeItem(k)); } catch (_) {}
          save = () => {};
          const out = {};
          go('dashboard'); await new Promise(r => setTimeout(r, 900));
          const db = document.querySelector('#pg-dashboard .fw-due-board');
          out.dash = { board: !!db, rows: db ? db.querySelectorAll('.fw-due-row').length : 0, head: db ? db.querySelector('.fw-due-ht').textContent : '', pop: !!document.getElementById('fw-due-pop'),
            first: db ? db.querySelector('.fw-due-row b').textContent : '' };
          document.getElementById('fw-due-pop')?.remove();
          go('dashboard'); await new Promise(r => setTimeout(r, 900)); out.pop2 = !!document.getElementById('fw-due-pop');
          go('mijozlar');
          const pm = document.getElementById('pg-mijozlar');
          out.mj = { board: !!pm.querySelector('.fw-due-board'), chips: [...pm.querySelectorAll('.pm-chip')].map(b => b.textContent.trim()), qarzsiz: /Qarzsiz/.test(pm.textContent),
            chip1: pm.querySelector('.fw-pc .fw-due-badge')?.textContent, hot: pm.querySelectorAll('.fw-pc.fw-pc-due').length };
          S.mjF = 'due'; pgMijozlar(); out.dueList = [...document.querySelectorAll('#mj-table .fw-pc-m > b')].map(b => b.textContent);
          S.mjF = ''; pgMijozlar();
          // Xabar oynasi — matn va WhatsApp havola
          const opened = []; window.open = (u) => { opened.push(u); return null; };
          fwDueSend(1);
          const ov = document.getElementById('fw-due-ov');
          out.send = { ov: !!ov, txt: document.getElementById('fw-due-txt').value, chs: [...ov.querySelectorAll('.fw-due-ch b')].map(b => b.textContent) };
          fwDueGo('wa'); out.wa = opened[0]; fwDueClose();
          // Muddatsiz eski qarz — muddat belgilash (mijoz kartasida)
          openMijozTarixi(5); out.tarix = document.querySelector('#modal-ov .mj-dues')?.textContent || '';
          window.prompt = () => '5'; mjDueEdit(5, null);
          out.debtDue = S.customers.find(c => c.id === 5).debtDue; out.exp5 = fwDueAdd(T, 5);
          closeModal();
          return out;
        }, `(${seed.toString()})`);
        assert.equal(r.dash.board, true, 'bosh sahifada panel'); assert.equal(r.dash.rows, 3, 'o\'tgan, bugun, ertaga (10 kunlik — yo\'q)');
        assert.match(r.dash.head, /1 ta muddati oʻtgan/); assert.match(r.dash.head, /1 ta bugun/); assert.match(r.dash.head, /1 ta ertaga/);
        assert.equal(r.dash.first, 'Oʻtgan', 'eng shoshilinchi birinchi');
        assert.equal(r.dash.pop, true, 'kunlik oyna chiqadi'); assert.equal(r.pop2, false, 'bir kunda bir marta');
        assert.equal(r.mj.board, true); assert.equal(r.mj.qarzsiz, false, '«Qarzsiz» filtri olib tashlandi');
        assert.ok(r.mj.chips.some(t => /Muddati oʻtgan/.test(t)), r.mj.chips.join('|'));
        assert.equal(r.mj.hot, 2, 'muddati o\'tgan/bugungi qatorlar ajralib turadi');
        assert.deepEqual(r.dueList.sort(), ['Bugun', 'Oʻtgan']);
        assert.equal(r.send.ov, true); assert.deepEqual(r.send.chs, ['SMS', 'Telegram', 'WhatsApp']);
        assert.match(r.send.txt, /Oʻtgan/); assert.match(r.send.txt, /5 kun oʻtdi/); assert.match(r.send.txt, /\+998 71 200 00 00/);
        assert.match(r.wa, /^https:\/\/wa\.me\/998901112233\?text=/);
        assert.match(r.tarix, /Avvalgi qarz \(muddatsiz\)/); assert.match(r.tarix, /Muddat belgilash/);
        assert.equal(r.debtDue, r.exp5, 'eski qarzga muddat qo\'yildi');
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
    { name: 'sotuvchi oynasi: bosh sahifa va «Qarzlar» — eslatma paneli, kunlik oyna, muddat belgisi, Xabar; savdoda muddat majburiy', async run() {
      const { browser, page, errors } = await openPage('sotuvchi.html', { width: 390, height: 844, mobile: true, loggedIn: true });
      try {
        const r = await page.evaluate(async () => {
          const T = fwLocalDay(), R = 12500; CUR.usdUzs = R;
          S.customers = [{ id: 1, name: 'Oʻtgan', phone: '901112233', debt: 1250000 }, { id: 2, name: 'Uzoq', phone: '902223344', debt: 250000 }, { id: 3, name: 'Eski', phone: '', debt: 100000 }];
          S.sales = [{ id: 11, custId: 1, date: fwDueAdd(T, -15), inv: 'S-11', debtUsd: 100, rateUsdUzs: R, dueDays: 10, dueDate: fwDueAdd(T, -5), status: 'done', totalUsd: 100 },
            { id: 12, custId: 2, date: T, inv: 'S-12', debtUsd: 20, rateUsdUzs: R, dueDays: 10, dueDate: fwDueAdd(T, 10), status: 'done', totalUsd: 20 }];
          try { Object.keys(localStorage).filter(k => k.startsWith('fw_due_pop')).forEach(k => localStorage.removeItem(k)); } catch (_) {}
          const out = {};
          svSwitchTab('home'); await new Promise(r => setTimeout(r, 900));
          out.home = { board: document.querySelectorAll('#sv-content .fw-due-board .fw-due-row').length, pop: !!document.getElementById('fw-due-pop') };
          document.getElementById('fw-due-pop')?.remove();
          svSwitchTab('debt'); await new Promise(r => setTimeout(r, 200));
          const c = document.getElementById('sv-content');
          out.debt = { board: !!c.querySelector('.fw-due-board'), chips: [...c.querySelectorAll('.dl-prow .fw-due-badge')].map(e => e.textContent.split(' · ')[0]),
            xabar: [...c.querySelectorAll('.dl-prow button')].filter(b => b.textContent === 'Xabar').length };
          fwDueSend(1); out.msg = /Oʻtgan/.test(document.getElementById('fw-due-txt').value); fwDueClose();
          S.products = [{ id: 1, sku: 'PG-1', name: 'Makita perforator', cat: 'Perforator', markupPct: 25, unit: 'dona' }];
          S.batches = [{ id: 11, pid: 1, qty: 10, sold: 0, costUsd: 84, status: 'active', date: td() }];
          S.cashboxes = [{ id: 1, name: 'Naqd', cur: 'UZS', type: 'cash', bal: 0 }];
          svSwitchTab('sale'); await new Promise(r => setTimeout(r, 200));
          POS.mode = 'retail'; POS.cur = 'UZS'; posAdd(1); POS.a.setCustId(1); posOpen('pay'); posPaySet(0);
          out.pos = { due: !!document.getElementById('pos-due'), val: document.getElementById('pos-due-in').value, days: posBuildCtx().dueDays };
          return out;
        });
        assert.deepEqual(r.home, { board: 1, pop: true }, 'sotuvchi bosh sahifasida panel va kunlik oyna');
        assert.equal(r.debt.board, true);
        assert.deepEqual(r.debt.chips, ['Muddati 5 kun oʻtgan', '10 kun qoldi', 'Muddatsiz']);
        assert.equal(r.debt.xabar, 3); assert.equal(r.msg, true);
        assert.deepEqual(r.pos, { due: true, val: '10', days: 10 }, 'sotuvchi savdosida ham muddat majburiy');
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
  ],
};
