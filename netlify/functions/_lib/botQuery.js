// v25.6.9 - Telegram bot SO'ROV buyruqlari (/foyda, /xarajat, /qarz, /kassa, /ombor).
// Sof funksiyalar: (data, ...) → ASCII-xavfsiz <pre> matn. Tarmoq/DB yo'q - testlanadi.
// Ruxsat (kim qaysi buyruqni olishi) - chaqiruvchi funksiyada (telegram-query.js): PERM jadvali shu yerda.
'use strict';
const { tashkentNow, _esc: esc } = require('./dailyReport');

// v25.6.10: yagona tgFmt — kenglik 34, jadval (har ma'lumot o'z ustunida), birlik sarlavhada, kirill → lotin
const F = require('./tgFmt');
const { num, sp, m2, asc, pre, cut, table } = F;
const line = (l, v) => F.row(l, v);
const dmy = (d) => String(d).split('-').reverse().join('.');
const per = (r) => r.start === r.end ? dmy(r.start) : `${dmy(r.start)} - ${dmy(r.end)}`;

// buyruq → kerakli ruxsat kaliti (RBAC); admin hammasini oladi
const PERM = { foyda: 'hisobot.view', xarajat: 'xarajatlar.view', qarz: 'mijozlar.view', kassa: 'kassalar.view', ombor: 'ombor.view' };

function monthRange(date) { const [y, m] = date.split('-').map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return [`${y}-${String(m).padStart(2, '0')}-01`, `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`]; }
function parsePeriod(arg, today) {
  const a = String(arg || '').trim().toLowerCase();
  const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  if (/^(bugun|kun)$/.test(a)) return { start: today, end: today, label: 'Bugun' };
  if (/^kecha$/.test(a)) { const y = addDays(today, -1); return { start: y, end: y, label: 'Kecha' }; }
  if (/^hafta$/.test(a)) return { start: addDays(today, -6), end: today, label: 'Oxirgi 7 kun' };
  if (/^otgan(\s*oy)?$/.test(a)) { const [s0] = monthRange(today); const p = addDays(s0, -1); const [s, e] = monthRange(p); return { start: s, end: e, label: "O'tgan oy" }; }
  const [s, e] = monthRange(today); return { start: s, end: e, label: 'Bu oy' };
}
const inR = (d, r) => { d = String(d || '').slice(0, 10); return d >= r.start && d <= r.end; };
const keysOf = (data) => Object.keys((data && data.branchStore) || {}).filter((k) => /^[A-Za-z0-9_-]{1,40}$/.test(k));
const nameOf = (data, k) => (data.settings && data.settings.branchNames && data.settings.branchNames[k]) || (k === 'baza' ? 'Baza' : k);
// filial cheklovi: null - hammasi (admin), aks holda faqat shu filial
const visible = (data, filial) => keysOf(data).filter((k) => !filial || k === filial);

function periodStats(b, r, rate) {
  const sales = (b.sales || []).filter((s) => s && inR(s.date, r) && require('./reportPeriod').isCounted(s));   // rad etilgan va o'tkazma — yo'q
  // v25.6.10: ilovadagi Statistika bilan bir xil — faqat do'kon xarajati (ta'sischi/hamkor olgani foyda taqsimoti, xarajat emas);
  // eski yozuvlarda faqat so'm summa bo'lsa — kurs bilan $ ga
  const exp = (b.expenses || []).filter((e) => e && inR(e.date, r) && (e.turi || 'dokon') === 'dokon');
  const eUsd = (e) => num(e.amtUsd) || (rate > 0 ? num(e.amount) / rate : 0);
  const cats = {}; exp.forEach((e) => { const k = e.cat || 'Boshqa'; cats[k] = (cats[k] || 0) + eUsd(e); });
  const sum = (a, f) => a.reduce((t, x) => t + num(x[f]), 0);
  return { count: sales.length, revenue: sum(sales, 'totalUsd'), profit: sum(sales, 'profitUsd'), expense: exp.reduce((t, e) => t + eUsd(e), 0), expCount: exp.length, cats };
}

function foyda(data, arg, o = {}) {
  const today = (o.today || tashkentNow().date), r = parsePeriod(arg, today), rate = num(data.settings && data.settings.usdUzs);
  const T = { count: 0, revenue: 0, profit: 0, expense: 0 }, rows = [];
  for (const k of visible(data, o.filial)) {
    const s = periodStats(data.branchStore[k] || {}, r, rate);
    T.count += s.count; T.revenue += s.revenue; T.profit += s.profit; T.expense += s.expense;
    rows.push([nameOf(data, k), sp(s.revenue), sp(s.profit), sp(s.profit - s.expense)]);
  }
  const head = `📈 <b>${esc(asc(r.label))}</b> - ${per(r)} - <i>$ da</i>`;
  // Filial | Savdo | Foyda | Sof — har filial bitta qator (bitta filial bo'lsa jadval shart emas); umumiy natija — pastda
  const tbl = rows.length > 1 ? table([{ h: 'Filial' }, { h: 'Savdo', w: 8, r: true }, { h: 'Foyda', w: 7, r: true }, { h: 'Sof', w: 7, r: true }], rows,
    [['JAMI', sp(T.revenue), sp(T.profit), sp(T.profit - T.expense)]]) : '';
  const tot = pre([...(rows.length === 1 ? [rows[0][0] && asc(rows[0][0]), F.LINE] : []), line('Cheklar', sp(T.count)), line('Savdo', m2(T.revenue)), line('Foyda', m2(T.profit)), line('Xarajat', m2(T.expense)), F.LINE, line('SOF FOYDA', m2(T.profit - T.expense))]);
  return [head, tbl, tot].filter(Boolean).join('\n');
}

function xarajat(data, arg, o = {}) {
  const today = o.today || tashkentNow().date, r = parsePeriod(arg, today), cats = {}, cnt = {}; let total = 0, n = 0;
  const rate = num(data.settings && data.settings.usdUzs);
  for (const k of visible(data, o.filial)) {
    const b = data.branchStore[k] || {}, s = periodStats(b, r, rate);
    Object.entries(s.cats).forEach(([c, v]) => { cats[c] = (cats[c] || 0) + v; }); total += s.expense; n += s.expCount;
    (b.expenses || []).filter((e) => e && inR(e.date, r) && (e.turi || 'dokon') === 'dokon').forEach((e) => { const c = e.cat || 'Boshqa'; cnt[c] = (cnt[c] || 0) + 1; });
  }
  const top = Object.entries(cats).sort((a, z) => z[1] - a[1]).slice(0, 12);
  const head = `💸 <b>Xarajat - ${esc(asc(r.label))}</b> - ${per(r)} - <i>$ da</i>`;
  if (!top.length) return head + '\n' + pre(["Xarajat yo'q"]);
  return head + '\n' + table([{ h: 'Turi' }, { h: 'Soni', w: 5, r: true }, { h: 'Summa', w: 11, r: true }], top.map(([c, v]) => [c, String(cnt[c] || 0), m2(v)]),
    [[`JAMI (${top.length} tur)`, String(n), m2(total)]]);
}

function qarz(data, o = {}) {
  const parts = [];
  for (const k of visible(data, o.filial)) {
    const b = data.branchStore[k] || {}, nm = esc(asc(nameOf(data, k)));
    // mijoz qarzi so'mda saqlanadi — so'mda ko'rsatiladi (ilova va eslatma bilan bir xil)
    const cust = (b.customers || []).filter((c) => c && num(c.debt) > 0.5).sort((a, z) => num(z.debt) - num(a.debt));
    parts.push(`<b>${nm}</b> - mijozlar bizga - <i>so'mda</i>\n` + (cust.length
      ? table([{ h: 'Mijoz' }, { h: 'Qarz', w: 13, r: true }], cust.slice(0, 10).map((c) => [c.name, sp(c.debt)]), [[`JAMI (${cust.length})`, sp(cust.reduce((t, c) => t + num(c.debt), 0))]])
      : pre(["Qarzdor yo'q"])));
    if (o.supp !== false) {   // ta'minotchi qarzi — faqat ruxsat bo'lsa
      const supp = (b.suppliers || []).filter((c) => c && num(c.debt) > 0.005).sort((a, z) => num(z.debt) - num(a.debt));
      parts.push(`<b>${nm}</b> - biz ta'minotchiga - <i>$ da</i>\n` + (supp.length
        ? table([{ h: "Ta'minotchi" }, { h: 'Qarz', w: 13, r: true }], supp.slice(0, 10).map((c) => [c.name, m2(c.debt)]), [[`JAMI (${supp.length})`, m2(supp.reduce((t, c) => t + num(c.debt), 0))]])
        : pre(["Qarz yo'q"])));
    }
  }
  const dl = (data.dealers || []).filter((d) => d && num(d.debt) > 0.005).sort((a, z) => num(z.debt) - num(a.debt));
  if (!o.filial && dl.length) parts.push('<b>Dillerlar</b> - bizga - <i>$ da</i>\n' + table([{ h: 'Diller' }, { h: 'Qarz', w: 13, r: true }],
    dl.slice(0, 10).map((d) => [d.name, m2(d.debt)]), [[`JAMI (${dl.length})`, m2(dl.reduce((t, d) => t + num(d.debt), 0))]]));
  return '🧾 <b>Qarzlar</b>\n' + parts.join('\n');
}

function kassa(data, o = {}) {
  // Kassa | So'm | $ — har valyuta o'z ustunida; filial — bo'lim sarlavhasi; JAMI shu jadvalda
  const rows = []; let tu = 0, td = 0; const ks = visible(data, o.filial);
  for (const k of ks) {
    const list = (data.branchStore[k] || {}).cashboxes || [];
    if (ks.length > 1) rows.push('[' + nameOf(data, k) + ']');
    list.filter((x) => x && x.type !== 'qobiljon').forEach((x) => { const usd = x.cur === 'USD'; if (usd) td += num(x.bal); else tu += num(x.bal); rows.push([x.name, usd ? '' : sp(x.bal), usd ? m2(x.bal) : '']); });
  }
  if (!rows.length) return '💰 <b>Kassalar</b>\n' + pre(["Kassa yo'q"]);
  return '💰 <b>Kassalar</b>\n' + table([{ h: 'Kassa' }, { h: "So'm", w: 12, r: true }, { h: '$', w: 10, r: true }], rows, [['JAMI', sp(tu), m2(td)]]);
}

function ombor(data, o = {}) {
  const rows = []; let n = 0; const ks = visible(data, o.filial);
  for (const k of ks) {
    const b = data.branchStore[k] || {}, rem = {};
    (b.batches || []).filter((x) => x && x.status !== 'deleted' && x.status !== 'transit').forEach((x) => { rem[x.pid] = (rem[x.pid] || 0) + num(x.qty) - num(x.sold); });
    const low = (data.products || []).filter((p) => p && !p.archived && !p.directSale && (rem[p.id] || 0) <= num(p.minStock)).sort((a, z) => (rem[a.id] || 0) - (rem[z.id] || 0));
    n += low.length;
    if (ks.length > 1) rows.push(`[${nameOf(data, k)}] ${low.length} xil`);
    low.slice(0, 15).forEach((p) => rows.push([p.name, F.q(rem[p.id] || 0), F.q(p.minStock)]));
  }
  if (!n) return '📦 <b>Ombor - kam qolgan</b>\n' + pre(['Hammasi yetarli']);
  return `📦 <b>Ombor - kam qolgan</b> (${n} xil)\n` + table([{ h: 'Mahsulot' }, { h: 'Qoldi', w: 7, r: true }, { h: 'Min', w: 6, r: true }], rows);
}

function mahsulot(data, query, o = {}) {
  const q = String(query || '').trim().toLowerCase(); if (q.length < 2) return 'Mahsulot nomi yoki kodini yozing: /mahsulot disk';
  const found = (data.products || []).filter((p) => p && !p.archived && (String(p.name || '').toLowerCase().includes(q) || String(p.sku || '').toLowerCase().includes(q))).slice(0, 8);
  if (!found.length) return 'Topilmadi';
  const ks = visible(data, o.filial);
  return `🔎 <b>Mahsulot: ${esc(query)}</b>\n` + table([{ h: 'Kod' }, { h: 'Nomi', w: 20 }, { h: 'Qoldiq', w: 7, r: true }],
    found.map((p) => { const q2 = ks.reduce((a, k) => a + ((data.branchStore[k] || {}).batches || []).filter((b) => b && b.pid === p.id && b.status !== 'deleted' && b.status !== 'transit').reduce((s, b) => s + num(b.qty) - num(b.sold), 0), 0);
      return [p.sku || '-', p.name, F.q(q2)]; }));
}

const HELP = '🤖 <b>Buyruqlar</b>\n' + table([{ h: 'Buyruq' }, { h: 'Nima beradi', w: 23 }],
  [['/foyda', 'Savdo, foyda, xarajat'], ['/xarajat', 'Xarajat turlari'], ['/qarz', 'Mijoz, diller qarzi'], ['/kassa', "Kassalar qoldig'i"], ['/ombor', 'Kam qolgan mahsulot'],
    ['/mahsulot', "Mahsulot qoldig'i"], ['/yordam', "Shu ro'yxat"]],
  [['Davr', 'bugun kecha hafta oy'], ['', "o'tgan"], ['Misol', '/foyda hafta'], ['', '/mahsulot disk']]);

module.exports = { PERM, HELP, foyda, xarajat, qarz, kassa, ombor, mahsulot, parsePeriod, monthRange, periodStats };
