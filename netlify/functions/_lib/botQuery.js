// v25.6.9 - Telegram bot SO'ROV buyruqlari (/foyda, /xarajat, /qarz, /kassa, /ombor).
// Sof funksiyalar: (data, ...) → ASCII-xavfsiz <pre> matn. Tarmoq/DB yo'q - testlanadi.
// Ruxsat (kim qaysi buyruqni olishi) - chaqiruvchi funksiyada (telegram-query.js): PERM jadvali shu yerda.
'use strict';
const { tashkentNow, _esc: esc } = require('./dailyReport');

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const sp = (n, d = 0) => { const v = Math.round(num(n) * 10 ** d) / 10 ** d; const [i, f] = Math.abs(v).toFixed(d).split('.'); return (v < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f && +f ? '.' + f : ''); };   // kunlik hisobot bilan bir xil: $650, $12.50
const usd = (n) => '$' + sp(n, Math.abs(num(n)) >= 1000 ? 0 : 2);
const asc = (t) => String(t).replace(/[ʻʼ‘’ʹ]/g, "'").replace(/[^\x20-\x7E\n]/g, '?');
const pre = (rows) => '<pre>' + rows.map((r) => esc(asc(r))).join('\n') + '</pre>';
const line = (l, v, w = 30) => { l = asc(l); v = String(v); const gap = Math.max(1, w - l.length - v.length); return l + ' '.repeat(gap) + v; };
const cut = (s, n) => { s = asc(s || ''); return s.length > n ? s.slice(0, n - 1) + '.' : s; };

// buyruq → kerakli ruxsat kaliti (RBAC); admin hammasini oladi
const PERM = { foyda: 'hisobot.view', xarajat: 'xarajatlar.view', qarz: 'mijozlar.view', kassa: 'kassalar.view', ombor: 'ombor.view' };

function monthRange(date) { const [y, m] = date.split('-').map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return [`${y}-${String(m).padStart(2, '0')}-01`, `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`]; }
function parsePeriod(arg, today) {
  const a = String(arg || '').trim().toLowerCase();
  const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  if (/^(bugun|kun)$/.test(a)) return { start: today, end: today, label: 'Bugun' };
  if (/^kecha$/.test(a)) { const y = addDays(today, -1); return { start: y, end: y, label: 'Kecha' }; }
  if (/^hafta$/.test(a)) return { start: addDays(today, -6), end: today, label: 'Oxirgi 7 kun' };
  if (/^otgan(\s*oy)?$/.test(a)) { const [s0] = monthRange(today); const p = addDays(s0, -1); const [s, e] = monthRange(p); return { start: s, end: e, label: 'Otgan oy' }; }
  const [s, e] = monthRange(today); return { start: s, end: e, label: 'Bu oy' };
}
const inR = (d, r) => { d = String(d || '').slice(0, 10); return d >= r.start && d <= r.end; };
const keysOf = (data) => Object.keys((data && data.branchStore) || {}).filter((k) => /^[A-Za-z0-9_-]{1,40}$/.test(k));
const nameOf = (data, k) => (data.settings && data.settings.branchNames && data.settings.branchNames[k]) || (k === 'baza' ? 'Baza' : k);
// filial cheklovi: null - hammasi (admin), aks holda faqat shu filial
const visible = (data, filial) => keysOf(data).filter((k) => !filial || k === filial);

function periodStats(b, r, rate) {
  const sales = (b.sales || []).filter((s) => s && inR(s.date, r) && require('./reportPeriod').isCounted(s));   // rad etilgan va o'tkazma — yo'q
  const exp = (b.expenses || []).filter((e) => e && inR(e.date, r) && !(e.turi === 'hamkor' && e.kind === 'kirim'));
  const cats = {}; exp.forEach((e) => { const k = e.cat || 'Boshqa'; cats[k] = (cats[k] || 0) + num(e.amtUsd); });
  const sum = (a, f) => a.reduce((t, x) => t + num(x[f]), 0);
  return { count: sales.length, revenue: sum(sales, 'totalUsd'), profit: sum(sales, 'profitUsd'), expense: sum(exp, 'amtUsd'), expCount: exp.length, cats };
}

function foyda(data, arg, o = {}) {
  const today = (o.today || tashkentNow().date), r = parsePeriod(arg, today), rate = num(data.settings && data.settings.usdUzs);
  const T = { count: 0, revenue: 0, profit: 0, expense: 0 }, parts = [];
  for (const k of visible(data, o.filial)) {
    const s = periodStats(data.branchStore[k] || {}, r, rate);
    T.count += s.count; T.revenue += s.revenue; T.profit += s.profit; T.expense += s.expense;
    parts.push(`<b>${esc(asc(nameOf(data, k)))}</b>\n` + pre([line(`Savdo (${s.count} chek)`, usd(s.revenue)), line('Foyda', usd(s.profit)), line('Xarajat', usd(s.expense)), line('Sof foyda', usd(s.profit - s.expense))]));
  }
  const head = `📈 <b>${esc(asc(r.label))}</b> (${r.start} - ${r.end})`;
  const total = parts.length > 1 ? '\n' + pre([line('JAMI savdo', usd(T.revenue)), line('JAMI foyda', usd(T.profit)), line('JAMI xarajat', usd(T.expense)), line('SOF FOYDA', usd(T.profit - T.expense))]) : '';
  return [head, ...parts].join('\n') + total;
}

function xarajat(data, arg, o = {}) {
  const today = o.today || tashkentNow().date, r = parsePeriod(arg, today), cats = {}; let total = 0, n = 0;
  for (const k of visible(data, o.filial)) { const s = periodStats(data.branchStore[k] || {}, r); Object.entries(s.cats).forEach(([c, v]) => { cats[c] = (cats[c] || 0) + v; }); total += s.expense; n += s.expCount; }
  const top = Object.entries(cats).sort((a, z) => z[1] - a[1]).slice(0, 12);
  return `💸 <b>Xarajat - ${esc(asc(r.label))}</b> (${r.start} - ${r.end})\n` + pre(top.length ? [...top.map(([c, v]) => line(cut(c, 20), usd(v))), '-'.repeat(30), line(`Jami (${n} ta)`, usd(total))] : ['Xarajat yoq']);
}

function qarz(data, o = {}) {
  const rate = num(data.settings && data.settings.usdUzs), parts = [];
  for (const k of visible(data, o.filial)) {
    const b = data.branchStore[k] || {};
    const cust = (b.customers || []).filter((c) => c && num(c.debt) > 0).map((c) => [c.name, rate > 0 ? num(c.debt) / rate : 0]).sort((a, z) => z[1] - a[1]);
    const supp = (b.suppliers || []).filter((c) => c && num(c.debt) > 0).map((c) => [c.name, num(c.debt)]).sort((a, z) => z[1] - a[1]);
    parts.push(`<b>${esc(asc(nameOf(data, k)))}</b>\n` + pre([line('Mijozlar bizga', usd(cust.reduce((a, x) => a + x[1], 0))), ...cust.slice(0, 5).map(([n, v]) => line('  ' + cut(n, 22), usd(v))),
      line('Biz taminotchiga', usd(supp.reduce((a, x) => a + x[1], 0))), ...supp.slice(0, 5).map(([n, v]) => line('  ' + cut(n, 22), usd(v)))]));
  }
  const dl = (data.dealers || []).filter((d) => d && num(d.debt) > 0);
  if (!o.filial && dl.length) parts.push('<b>Dillerlar</b>\n' + pre([line('Jami qarz', usd(dl.reduce((a, d) => a + num(d.debt), 0))), ...dl.sort((a, z) => z.debt - a.debt).slice(0, 8).map((d) => line('  ' + cut(d.name, 22), usd(d.debt)))]));
  return '🧾 <b>Qarzlar</b>\n' + parts.join('\n');
}

function kassa(data, o = {}) {
  const parts = visible(data, o.filial).map((k) => { const b = data.branchStore[k] || {};
    const rows = (b.cashboxes || []).filter((x) => x && x.type !== 'qobiljon').map((x) => line(cut(x.name, 20), x.cur === 'USD' ? usd(x.bal) : sp(x.bal) + " som"));
    return `<b>${esc(asc(nameOf(data, k)))}</b>\n` + pre(rows.length ? rows : ['Kassa yoq']); });
  return '💰 <b>Kassalar</b>\n' + parts.join('\n');
}

function ombor(data, o = {}) {
  const parts = visible(data, o.filial).map((k) => { const b = data.branchStore[k] || {}, rem = {};
    (b.batches || []).filter((x) => x && x.status !== 'deleted' && x.status !== 'transit').forEach((x) => { rem[x.pid] = (rem[x.pid] || 0) + num(x.qty) - num(x.sold); });
    const low = (data.products || []).filter((p) => p && !p.archived && !p.directSale && (rem[p.id] || 0) <= num(p.minStock)).map((p) => [p.name, rem[p.id] || 0]).sort((a, z) => a[1] - z[1]);
    return `<b>${esc(asc(nameOf(data, k)))}</b> - kam qolgan: ${low.length}\n` + pre(low.length ? low.slice(0, 15).map(([n, q]) => line(cut(n, 24), sp(q, 2))) : ['Hammasi yetarli']); });
  return '📦 <b>Ombor</b>\n' + parts.join('\n');
}

function mahsulot(data, query, o = {}) {
  const q = String(query || '').trim().toLowerCase(); if (q.length < 2) return 'Mahsulot nomi yoki kodini yozing: /mahsulot disk';
  const found = (data.products || []).filter((p) => p && !p.archived && (String(p.name || '').toLowerCase().includes(q) || String(p.sku || '').toLowerCase().includes(q))).slice(0, 8);
  if (!found.length) return 'Topilmadi';
  const ks = visible(data, o.filial);
  return pre(found.map((p) => { const q2 = ks.reduce((a, k) => a + ((data.branchStore[k] || {}).batches || []).filter((b) => b && b.pid === p.id && b.status !== 'deleted' && b.status !== 'transit').reduce((s, b) => s + num(b.qty) - num(b.sold), 0), 0); return line(cut(`${p.sku || ''} ${p.name}`, 24), sp(q2, 2) + ' dona'); }));
}

const HELP = '🤖 <b>Buyruqlar</b>\n' + pre(['/foyda [bugun|kecha|hafta|oy|otgan]', '/xarajat [bugun|kecha|hafta|oy|otgan]', '/qarz', '/kassa', '/ombor', '/mahsulot nom_yoki_kod', '/yordam']);

module.exports = { PERM, HELP, foyda, xarajat, qarz, kassa, ombor, mahsulot, parsePeriod, monthRange, periodStats };
