// v23.9 — KUNLIK TELEGRAM HISOBOTI: ma'lumotdan matn (sof funksiya — testlanadi).
// Manba: server yig'gan app_data (app_data_branches ustun + kassa/qarz jurnallari ustiga qo'yilgan) —
// app-data-load bilan bir xil haqiqiy qiymatlar. Hisobot faqat O'QIYDI.
// Sana — ilovadagi savdo sanasi bilan bir xil (UTC sana); yuborish soati Toshkent vaqti bo'yicha
// 06:00–23:00 oralig'ida, bu oraliqda Toshkent va UTC sanasi bir xil.
'use strict';
const FWRound = require('../../../js/fw-round.js');

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
// Butun son — kasrsiz ($150), sentli — ikki xona ($20.40)
const sp = (n, d = 0) => { const v = Math.round(num(n) * 10 ** d) / 10 ** d; const [i, f] = Math.abs(v).toFixed(d).split('.'); return (v < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f && +f ? '.' + f : ''); };
const usd = (n) => '$' + sp(n, Math.abs(num(n)) >= 1000 ? 0 : 2);
const uzs = (n) => sp(n) + " so'm";
const money = (cur, n) => (cur === 'USD' ? usd(n) : uzs(n));
const fmtDate = (d) => String(d || '').slice(0, 10).split('-').reverse().join('.');

// Toshkent (UTC+5, yozgi vaqt yo'q) — joriy sana va soat
function tashkentNow(now = new Date()) {
  const t = new Date(now.getTime() + 5 * 3600e3);
  return { date: t.toISOString().slice(0, 10), hour: t.getUTCHours() };
}

function branchNameOf(data, key) {
  const nm = data && data.settings && data.settings.branchNames && data.settings.branchNames[key];
  return nm || (key === 'baza' ? 'Baza' : key === 'f729' ? '729-filial' : key);
}

// Bitta filial bo'yicha bugungi ko'rsatkichlar
function branchDay(b, date, rate) {
  const toUsd = (cur, amt) => (cur === 'USD' ? num(amt) : (rate > 0 ? num(amt) / rate : 0));
  const sales = (b.sales || []).filter((s) => s && s.date === date && s.status !== 'cancelled' && s.status !== 'void');
  const sum = (a, f) => a.reduce((t, x) => t + num(x[f]), 0);
  const pay = { cash_uzs: 0, card: 0, usd: 0, mixed: 0 };
  sales.forEach((s) => { if (s.payType in pay) pay[s.payType] += num(s.paidUsd); });
  const exp = (b.expenses || []).filter((e) => e && e.date === date && !(e.turi === 'hamkor' && e.kind === 'kirim'));
  const debtIn = (b.cashTxns || []).filter((t) => t && t.date === date && t.type === 'in' && t.custId != null && !/^Savdo /.test(t.desc || ''))
    .reduce((a, t) => a + toUsd(t.cur, t.amount), 0);
  const closings = (b.dailyClosings || []).filter((c) => c && c.date === date && c.toFirma);
  const handed = closings.reduce((a, c) => a + (c.entries || []).reduce((x, e) => x + toUsd(e.cur, e.amount), 0), 0);
  const staff = {};
  sales.forEach((s) => { const k = s.staffName || (s.staffId != null ? 'Xodim #' + s.staffId : 'Egasi / admin'); staff[k] = (staff[k] || 0) + num(s.totalUsd); });
  const prod = {};
  sales.forEach((s) => (s.items || []).forEach((i) => { const k = i.name || i.sku || ('#' + i.pid); prod[k] = (prod[k] || 0) + num(i.qty); }));
  const boxes = (b.cashboxes || []).filter((k) => k && k.type !== 'qobiljon');
  return {
    roundUzs: FWRound.periodRoundingTotal(sales),   // v25.1: yaxlitlash chegirmalari jami (so'm)
    count: sales.length, revenue: sum(sales, 'totalUsd'), profit: sum(sales, 'profitUsd'), newDebt: sum(sales, 'debtUsd'), pay,
    expense: sum(exp, 'amtUsd'), expenseCount: exp.length, debtIn, handed, closings: closings.length,
    custDebtUsd: (b.customers || []).reduce((a, c) => a + (rate > 0 ? Math.max(0, num(c && c.debt)) / rate : 0), 0),
    suppDebtUsd: (b.suppliers || []).reduce((a, x) => a + Math.max(0, num(x && x.debt)), 0),
    boxes: boxes.map((k) => ({ name: String(k.name || ''), cur: k.cur === 'USD' ? 'USD' : 'UZS', bal: num(k.bal) })),
    topStaff: Object.entries(staff).sort((a, z) => z[1] - a[1]).slice(0, 3),
    topProducts: Object.entries(prod).sort((a, z) => z[1] - a[1]).slice(0, 5),
  };
}

// v25 (egasi talabi): USTUN USLUBI — har ko'rsatkich alohida qatorda, chapda nomi, o'ngda summasi; raqamlar bitta
// chiziqda tekislanadi (Telegram <pre> — monoshrift). Telefon ekraniga sig'adi: qator kengligi COL_W belgi.
const COL_W = 30;
// Bitta qator: «Nomi ........ qiymat» (qiymat o'ngga tekislangan). Juda uzun bo'lsa — qiymat keyingi qatorda o'ngda.
function row(label, value) {
  const l = String(label), v = String(value);
  if (l.length + 1 + v.length <= COL_W) return esc(l + ' '.repeat(COL_W - l.length - v.length) + v);
  return esc(l) + '\n' + esc(' '.repeat(Math.max(0, COL_W - v.length)) + v);
}
const pre = (rows) => '<pre>' + rows.join('\n') + '</pre>';
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// Hisobot matni (Telegram HTML). Natija — xabarlar ro'yxati (har biri ≤ 3900 belgi).
// v25.1 (egasi talabi «tartibli emas»): bo'limlar sarlavhali va chiziq bilan ajratilgan — «Bosh kassa», har filialda
// «BUGUN» (savdo/foyda), «KASSALAR», «QARZLAR» (kim kimga qarzdorligi aniq); nom bo'lmasa — «ERP» o'rniga brend nomi.
const WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
const BRAND_DEFAULT = String(process.env.FW_BRAND_NAME || 'POWERFUL GROUP');
const LINE = '─'.repeat(COL_W);
function buildDailyReport(data, date, extra = {}) {
  const st = (data && data.settings) || {};
  const rate = num(st.usdUzs);
  const company = String(extra.brand || st.company || BRAND_DEFAULT).slice(0, 60);
  const keys = Object.keys((data && data.branchStore) || {}).filter((k) => /^[A-Za-z0-9_-]{1,40}$/.test(k));
  const order = ['baza', ...keys.filter((k) => k !== 'baza').sort()].filter((k) => keys.includes(k));
  const wd = WEEKDAYS[new Date(String(date).slice(0, 10) + 'T12:00:00Z').getUTCDay()] || '';
  const head = [`📊 <b>${esc(company)} — kunlik hisobot</b>`, `📅 ${fmtDate(date)}${wd ? ', ' + wd : ''}`];
  if (rate > 0) head.push(`💱 Kurs: 1$ = ${sp(rate)} so'm${st.rateDate === date ? '' : ' (bugun tasdiqlanmagan)'}`);
  const total = { count: 0, revenue: 0, profit: 0, expense: 0 };
  const parts = [];
  for (const k of order) {
    const d = branchDay(data.branchStore[k] || {}, date, rate);
    total.count += d.count; total.revenue += d.revenue; total.profit += d.profit; total.expense += d.expense;
    const R = [esc('BUGUN')];
    if (!d.count && !d.expense && !d.debtIn && !d.handed) R.push(esc('Savdo va xarajat yoʻq'));
    else {
      R.push(row(`Savdo (${d.count} chek)`, usd(d.revenue)));
      if (d.pay.cash_uzs > 0) R.push(row('  naqd', usd(d.pay.cash_uzs)));
      if (d.pay.card > 0) R.push(row('  karta', usd(d.pay.card)));
      if (d.pay.usd > 0) R.push(row('  dollar', usd(d.pay.usd)));
      if (d.pay.mixed > 0) R.push(row('  aralash', usd(d.pay.mixed)));
      if (d.newDebt > 0) R.push(row('  qarzga', usd(d.newDebt)));
      R.push(row('Foyda', usd(d.profit)));
      R.push(row(`Xarajat${d.expenseCount ? ` (${d.expenseCount})` : ''}`, usd(d.expense)));
      R.push(row('Sof foyda', usd(d.profit - d.expense)));
      if (d.roundUzs > 0) R.push(row('Yaxlitlash chegirmalari', uzs(d.roundUzs)));
      if (d.debtIn > 0) R.push(row('Undirilgan qarz', usd(d.debtIn)));
      R.push(d.handed > 0 ? row('Bosh kassaga', usd(d.handed)) : row('Kassa', 'yopilmagan'));
    }
    const sec = (title) => { R.push(LINE); R.push(esc(title)); };
    if (d.boxes.length) { sec('KASSALAR'); d.boxes.forEach((x) => R.push(row(cut(x.name, 18), money(x.cur, x.bal)))); }
    sec('QARZLAR'); R.push(row('Mijozlar bizga', usd(d.custDebtUsd))); R.push(row('Biz taʼminotchilarga', usd(d.suppDebtUsd)));
    if (d.topStaff.length) { sec('ENG KOʻP SOTGAN'); d.topStaff.forEach(([n, v]) => R.push(row(cut(n, 18), usd(v)))); }
    if (d.topProducts.length) { sec('TOP MAHSULOT'); d.topProducts.forEach(([n, q]) => R.push(row(cut(n, 20), '×' + sp(q, 2)))); }
    parts.push(`🏢 <b>${esc(branchNameOf(data, k))}</b>\n` + pre(R));
  }
  const top = [];
  if (extra.firma) {
    top.push(`🏦 <b>Bosh kassa</b>\n` + pre([row('Dollar', usd(extra.firma.USD)), row("Soʻm", uzs(extra.firma.UZS))]));
  }
  const sum = [];
  if (order.length > 1) { sum.push(row(`Jami savdo (${total.count} chek)`, usd(total.revenue))); sum.push(row('Jami sof foyda', usd(total.profit - total.expense))); }
  if (extra.dealerPay && (extra.dealerPay.count || extra.dealerPay.pending)) {
    sum.push(row(`Dillerlardan (${extra.dealerPay.count})`, usd(extra.dealerPay.usd)));
    if (extra.dealerPay.pending) sum.push(row('  tasdiq kutmoqda', extra.dealerPay.pending + ' ta'));
  }
  if (sum.length) top.push(`📈 <b>Umumiy</b>\n` + pre(sum));
  // Xabarlarga bo'lish (Telegram chegarasi 4096) — <pre> bloki bo'linmaydi
  const msgs = []; let cur = [head.join('\n'), ...top].join('\n\n');
  for (const p of parts) {
    if ((cur + '\n\n' + p).length > 3900) { msgs.push(cur); cur = p; } else cur += '\n\n' + p;
  }
  msgs.push(cur);
  return msgs.map((m) => (m.length > 4000 ? m.slice(0, 3990).replace(/<pre>(?![\s\S]*<\/pre>)[\s\S]*$/, '') + '…' : m));
}

module.exports = { buildDailyReport, branchDay, tashkentNow, _esc: esc };
