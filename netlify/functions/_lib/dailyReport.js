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
  // v25.6.9 (hisobchi): boshqa hisobotlar bilan bir xil — rad etilgan (voided) va filialga o'tkazma «savdolari» kirmaydi
  const sales = (b.sales || []).filter((s) => s && s.date === date && require('./reportPeriod').isCounted(s));
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
// v25.6.10: yagona tgFmt — kenglik 34, nom uzun bo'lsa qisqaradi (qiymat keyingi qatorga TUSHMAYDI), jadvallar, kirill → lotin
const F = require('./tgFmt');
const COL_W = F.W;
const row = (label, value) => F.row(label, value);
const asc = F.asc;
const pre = F.pre;
const cut = F.cut;

// Hisobot matni (Telegram HTML). Natija — xabarlar ro'yxati (har biri ≤ 3900 belgi).
// v25.1 (egasi talabi «tartibli emas»): bo'limlar sarlavhali va chiziq bilan ajratilgan — «Bosh kassa», har filialda
// «BUGUN» (savdo/foyda), «KASSALAR», «QARZLAR» (kim kimga qarzdorligi aniq); nom bo'lmasa — «ERP» o'rniga brend nomi.
const WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
const BRAND_DEFAULT = String(process.env.FW_BRAND_NAME || 'POWERFUL GROUP');
const LINE = '-'.repeat(COL_W);
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
    // v25.6.10: har bo'lim o'z jadvali; birlik sarlavhada (qatorda takrorlanmaydi)
    const T = [];
    const B = [];
    if (!d.count && !d.expense && !d.debtIn && !d.handed) B.push("Savdo va xarajat yo'q");
    else {
      B.push(row('Cheklar', String(d.count)), row('Savdo', F.m2(d.revenue)));
      if (d.pay.cash_uzs > 0) B.push(row(' naqd', F.m2(d.pay.cash_uzs)));
      if (d.pay.card > 0) B.push(row(' karta', F.m2(d.pay.card)));
      if (d.pay.usd > 0) B.push(row(' dollar', F.m2(d.pay.usd)));
      if (d.pay.mixed > 0) B.push(row(' aralash', F.m2(d.pay.mixed)));
      if (d.newDebt > 0) B.push(row(' qarzga', F.m2(d.newDebt)));
      B.push(row('Foyda', F.m2(d.profit)), row(`Xarajat${d.expenseCount ? ` (${d.expenseCount})` : ''}`, F.m2(d.expense)), F.LINE, row('SOF FOYDA', F.m2(d.profit - d.expense)));
      if (d.debtIn > 0) B.push(row('Undirilgan qarz', F.m2(d.debtIn)));
      B.push(d.handed > 0 ? row('Bosh kassaga', F.m2(d.handed)) : row('Kassa', 'yopilmagan'));
    }
    T.push('<i>Bugun · $ da</i>\n' + pre(B));
    if (d.roundUzs > 0) T.push(pre([row("Yaxlitlash chegirmasi (so'm)", F.sp(d.roundUzs))]));
    if (d.boxes.length) T.push(F.table([{ h: 'Kassa' }, { h: "So'm", w: 12, r: true }, { h: '$', w: 10, r: true }],
      d.boxes.map((x) => [x.name, x.cur === 'USD' ? '' : F.sp(x.bal), x.cur === 'USD' ? F.m2(x.bal) : ''])));
    T.push(F.table([{ h: 'Qarzlar' }, { h: '$', w: 12, r: true }], [['Mijozlar bizga', F.m2(d.custDebtUsd)], ["Biz ta'minotchilarga", F.m2(d.suppDebtUsd)]]));
    if (d.topStaff.length) T.push(F.table([{ h: 'Eng koʻp sotgan' }, { h: 'Savdo $', w: 11, r: true }], d.topStaff.map(([n, v]) => [n, F.m2(v)])));
    if (d.topProducts.length) T.push(F.table([{ h: 'Top mahsulot' }, { h: 'Soni', w: 8, r: true }], d.topProducts.map(([n, q]) => [n, F.q(q)])));
    parts.push(`🏢 <b>${esc(branchNameOf(data, k))}</b>\n` + T.join('\n'));
  }
  const top = [];
  if (extra.firma) {
    top.push(`🏦 <b>Bosh kassa</b>\n` + F.table([{ h: 'Valyuta' }, { h: 'Qoldiq', w: 16, r: true }], [["So'm", F.sp(extra.firma.UZS)], ['$', F.m2(extra.firma.USD)]]));
  }
  // v25.6 (egasi talabi): Dillerlar — qarz, BUGUNGI to'lovlar va OMBOR qoldig'i (dona va $). Manba: extra.dealers (jadvallardan);
  // bo'lmasa eski yo'l (data.dealers — faqat nom va qarz). Ko'p diller — alohida xabarlarga bo'linadi (har biri ≤ 4000).
  const dl = Array.isArray(extra.dealers) ? extra.dealers.filter((x) => x && x.name)
    : ((data && data.dealers) || []).filter((x) => x && x.name).map((x) => ({ name: x.name, debt: num(x.debt), paidToday: 0, stockQty: 0, stockUsd: 0 }));
  const dealerMsgs = [];
  if (extra.firma && dl.length) {
    // v25.6.10: jadval — Diller | Qarz | Bugun | Omborda ($); har diller bitta qator
    const T = { debt: dl.reduce((a, x) => a + Math.max(0, num(x.debt)), 0), paid: dl.reduce((a, x) => a + num(x.paidToday), 0), stock: dl.reduce((a, x) => a + num(x.stockUsd), 0) };
    const cols = [{ h: 'Diller' }, { h: 'Qarz', w: 7, r: true }, { h: 'Bugun', w: 6, r: true }, { h: 'Ombor', w: 7, r: true }];
    const rowsAll = dl.map((x) => [x.name, F.sp(x.debt), F.sp(x.paidToday), F.sp(x.stockUsd)]);
    const chunks = []; for (let i = 0; i < rowsAll.length; i += 60) chunks.push(rowsAll.slice(i, i + 60));
    chunks.forEach((ch, i) => dealerMsgs.push(`🚚 <b>Dillerlar${chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ''}</b> · ${fmtDate(date)} · <i>$ da</i>\n`
      + F.table(cols, ch, i === chunks.length - 1 ? [[`JAMI (${dl.length})`, F.sp(T.debt), F.sp(T.paid), F.sp(T.stock)]] : null)
      + (i === chunks.length - 1 ? '\n<i>Bugun — bugungi toʻlov; Ombor — diller qoʻlidagi tovar (tannarx)</i>' : '')));
  }
  const sum = [];
  if (order.length > 1) { sum.push(row('Cheklar', String(total.count)), row('Savdo', F.m2(total.revenue)), row('SOF FOYDA', F.m2(total.profit - total.expense))); }
  if (extra.dealerPay && (extra.dealerPay.count || extra.dealerPay.pending)) {
    sum.push(row(`Dillerlardan (${extra.dealerPay.count})`, F.m2(extra.dealerPay.usd)));
    if (extra.dealerPay.pending) sum.push(row('Tasdiq kutmoqda (ta)', String(extra.dealerPay.pending)));
  }
  if (sum.length) top.push(`📈 <b>Umumiy</b> · <i>$ da</i>\n` + pre(sum));
  // Xabarlarga bo'lish (Telegram chegarasi 4096) — <pre> bloki bo'linmaydi
  const msgs = []; let cur = [head.join('\n'), ...top].join('\n\n');
  for (const p of parts) {
    if ((cur + '\n\n' + p).length > 3900) { msgs.push(cur); cur = p; } else cur += '\n\n' + p;
  }
  msgs.push(cur);
  msgs.push(...dealerMsgs);
  return msgs.map((m) => (m.length > 4000 ? m.slice(0, 3990).replace(/<pre>(?![\s\S]*<\/pre>)[\s\S]*$/, '') + '…' : m));
}

module.exports = { buildDailyReport, branchDay, tashkentNow, _esc: esc };
