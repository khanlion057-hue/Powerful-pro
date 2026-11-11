// v25.1 — TELEGRAM HODISA XABARLARI (egasi talabi): har nasiya savdo, mijoz qarz to'lovi, diller oldi-berdisi va
// to'lovlari guruhga darhol; nasiya qaytarish kuni — eslatma; oy yakunida dillerlar hisoboti.
//
// Qoidalar:
//   • Faqat SERVER ma'lumoti (savdo/to'lov bazaga yozilgandan KEYIN) — brauzer yuborgan summa ishlatilmaydi, qoldiq
//     qarz bazadan olinadi.
//   • Xabar yuborilmasa ham amal BEKOR QILINMAYDI (best-effort, qisqa vaqt chegarasi, xato faqat logga).
//   • Bot tokeni faqat serverda (app_data.settings.tgBotToken); javobga qo'shilmaydi.
// Sozlamalar (app_data.settings):
//   tgChatId            — asosiy guruh (nasiya, to'lov, eslatma)
//   tgDealerChats       — dillerlar guruhi/kanali (bo'sh bo'lsa — asosiy guruh); ro'yxat yoki vergul bilan
//   tgEvt               — { credit, pay, remind, dealer, month } (berilmagan → yoqiq)
//   tgRemindHour        — eslatma soati (Toshkent, 6–22; standart 9)
'use strict';
const { TOKEN_RE, CHAT_RE, tgSend } = require('./dailyReportRun');

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const sp = (n, d = 0) => { const v = Math.round(num(n) * 10 ** d) / 10 ** d; const [i, f] = Math.abs(v).toFixed(d).split('.'); return (v < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f && +f ? '.' + f : ''); };
const usd = (n) => '$' + sp(n, Math.abs(num(n)) >= 1000 ? 0 : 2);
const uzs = (n) => sp(n) + " so'm";
const fmtDate = (d) => String(d || '').slice(0, 10).split('-').reverse().join('.');
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const W = 30;
function row(l, v) {
  l = String(l); v = String(v);
  if (l.length + 1 + v.length <= W) return esc(l + ' '.repeat(W - l.length - v.length) + v);
  return esc(l) + '\n' + esc(' '.repeat(Math.max(0, W - v.length)) + v);
}
const pre = (rows) => '<pre>' + rows.join('\n') + '</pre>';
const LINE = '─'.repeat(W);

function evtOn(st, kind) { const e = st && st.tgEvt; return !(e && typeof e === 'object' && e[kind] === false); }
function chatList(v) {
  const raw = Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/);
  return [...new Set(raw.map((x) => String(x || '').trim()).filter((x) => CHAT_RE.test(x)))].slice(0, 5);
}
function chatsFor(st, kind) {
  const main = CHAT_RE.test(String(st.tgChatId || '')) ? [String(st.tgChatId)] : [];
  if (kind === 'dealer' || kind === 'month') { const d = chatList(st.tgDealerChats); return d.length ? d : main; }
  return main;
}

async function loadSettings(admin) {
  const { data: row, error } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
  if (error) throw error;
  return { main: (row && row.data) || {}, st: (row && row.data && row.data.settings) || {} };
}
async function loadBranch(admin, main, filial) {
  try {
    const { data } = await admin.from('app_data_branches').select('data').eq('branch_key', filial).maybeSingle();
    if (data && data.data) return data.data;
  } catch (_) { /* jadval yo'q — eski sxema */ }
  return (main.branchStore && main.branchStore[filial]) || {};
}
const branchName = (st, k) => (st.branchNames && st.branchNames[k]) || (k === 'baza' ? 'Baza' : k);

// Yuborish — hech qachon xato tashlamaydi; 6 soniyadan ortiq kutmaydi
async function send(st, kind, text) {
  try {
    if (!TOKEN_RE.test(String(st.tgBotToken || '')) || !evtOn(st, kind)) return { ok: false, skipped: true };
    const chats = chatsFor(st, kind); if (!chats.length) return { ok: false, skipped: true };
    const res = await Promise.race([
      Promise.all(chats.map((c) => tgSend(st.tgBotToken, c, text))),
      new Promise((r) => setTimeout(() => r([{ ok: false, description: 'timeout' }]), 6000)),
    ]);
    const bad = res.filter((r) => !r.ok); if (bad.length) console.warn('[tgEvents]', kind, bad.map((b) => b.description).join('; '));
    return { ok: !bad.length };
  } catch (e) { console.warn('[tgEvents]', kind, e && e.message); return { ok: false }; }
}

// ── 1) Nasiya savdo ──
function creditSaleText({ st, filial, cust, items, discPct, paidUsd, creditUseUzs, rate, dueDate, dueDays, inv, staffName, custDebtUzs }) {
  const k = 1 - Math.min(100, Math.max(0, num(discPct))) / 100;
  const lines = (items || []).slice(0, 40).map((i) => {
    const q = num(i.qty), pr = num(i.sellUsd) * k;
    return [esc(cut(i.name || i.sku || ('#' + i.pid), W)), row(`  ${sp(q, 3)} × ${usd(pr)}`, usd(q * pr))].join('\n');
  });
  if ((items || []).length > 40) lines.push(esc(`… yana ${items.length - 40} ta`));
  const total = (items || []).reduce((a, i) => a + num(i.qty) * num(i.sellUsd) * k, 0);
  const paid = num(paidUsd) + (rate > 0 ? num(creditUseUzs) / rate : 0);
  const debt = Math.max(0, total - paid);
  const both = (v) => rate > 0 ? `${usd(v)} · ${uzs(Math.round(v * rate))}` : usd(v);
  const R = [...lines, LINE, row('Jami', usd(total)), row('Toʻlandi', usd(paid)), row('Qarzga', usd(debt))];
  const out = [
    `🧾 <b>Nasiya savdo</b>${inv ? ' · ' + esc(inv) : ''}`,
    `👤 <b>${esc(cust && cust.name || 'Mijoz')}</b>`,
    `📞 ${esc(cust && cust.phone || 'telefon yoʻq')}`,
    `🏢 ${esc(branchName(st, filial))}${staffName ? ' · ' + esc(staffName) : ''}`,
    pre(R),
    `💰 Qarzga: <b>${esc(both(debt))}</b>`,
  ];
  if (dueDate) out.push(`📅 Qaytarish sanasi: <b>${fmtDate(dueDate)}</b>${dueDays ? ` (${dueDays} kun)` : ''}`);
  if (custDebtUzs != null) out.push(`📒 Mijozning umumiy qarzi: <b>${esc(uzs(custDebtUzs))}</b>`);
  return { text: out.join('\n'), debt };
}

async function notifyCreditSale(admin, args) {
  try {
    const { st, main } = await loadSettings(admin);
    if (!evtOn(st, 'credit')) return;
    const b = await loadBranch(admin, main, args.filial);
    const cust = (b.customers || []).find((c) => c && Number(c.id) === Number(args.custId)) || { name: args.custName };
    let custDebtUzs = null;
    try {
      const { data } = await admin.from('customer_balances').select('debt').eq('filial', args.filial).eq('customer_local_id', args.custId).maybeSingle();
      if (data && data.debt != null) custDebtUzs = num(data.debt);
    } catch (_) {}
    const { text, debt } = creditSaleText({ ...args, st, cust, rate: num(st.usdUzs), custDebtUzs });
    if (!(debt >= 0.005)) return;   // qarz yo'q — nasiya emas
    await send(st, 'credit', text);
  } catch (e) { console.warn('[tgEvents] credit', e && e.message); }
}

// ── 2) Mijoz qarz to'lovi (kassa orqali) ──
async function notifyCustomerPayment(admin, { filial, customerId, amount, currency, debtAfterUzs, staffName }) {
  try {
    const { st, main } = await loadSettings(admin);
    if (!evtOn(st, 'pay')) return;
    const b = await loadBranch(admin, main, filial);
    const c = (b.customers || []).find((x) => x && Number(x.id) === Number(customerId)) || {};
    const full = debtAfterUzs != null && num(debtAfterUzs) <= 0.5;
    const text = [
      full ? '✅ <b>Qarz toʻliq yopildi</b>' : '💵 <b>Qarz toʻlovi</b>',
      `👤 <b>${esc(c.name || 'Mijoz')}</b>${c.phone ? ' · ' + esc(c.phone) : ''}`,
      `🏢 ${esc(branchName(st, filial))}${staffName ? ' · ' + esc(staffName) : ''}`,
      pre([row('Toʻlandi', currency === 'USD' ? usd(amount) : uzs(amount)), row('Qolgan qarz', debtAfterUzs != null ? uzs(Math.max(0, debtAfterUzs)) : '—')]),
    ].join('\n');
    await send(st, 'pay', text);
  } catch (e) { console.warn('[tgEvents] pay', e && e.message); }
}

// ── 3) Diller oldi-berdisi va to'lovlari ──
async function dealerRow(admin, id) {
  const { data } = await admin.from('dealers').select('id,name,phone,region,debt_usd').eq('id', id).maybeSingle();
  return data || { id, name: 'Diller #' + id };
}
async function notifyDealerOp(admin, { kind, mode, dealerId, items, filial, staffName, pct }) {
  try {
    const { st } = await loadSettings(admin);
    if (!evtOn(st, 'dealer')) return;
    const d = await dealerRow(admin, dealerId);
    const title = kind === 'ship' ? (mode === 'debt' ? '📦 <b>Dillerga qarzga berildi</b>' : '📦 <b>Dillerga joʻnatildi</b> (sotish uchun)')
      : kind === 'return' ? '↩️ <b>Dillerdan qaytdi</b>' : '🛒 <b>Diller savdosi</b>';
    let sum = 0;
    const R = (items || []).slice(0, 40).map((i) => {
      const q = num(i.qty), pr = num(i.priceUsd);
      if (pr > 0) { sum += q * pr; return [esc(cut(i.name || i.sku || ('#' + i.pid), W)), row(`  ${sp(q, 3)} × ${usd(pr)}`, usd(q * pr))].join('\n'); }
      return row(cut(i.name || i.sku || ('#' + i.pid), 22), '×' + sp(q, 3));
    });
    if (sum > 0) { R.push(LINE); R.push(row('Jami', usd(sum))); }
    if (kind === 'sale' && pct != null) R.push(row('Xizmat haqi', sp(pct, 2) + '%'));
    const text = [title, `👤 <b>${esc(d.name)}</b>${d.phone ? ' · ' + esc(d.phone) : ''}${d.region ? ' · ' + esc(d.region) : ''}`,
      `🏢 ${esc(branchName(st, filial))}${staffName ? ' · ' + esc(staffName) : ''}`, pre(R),
      `📒 Diller qarzi: <b>${esc(usd(d.debt_usd))}</b>`].join('\n');
    await send(st, 'dealer', text);
  } catch (e) { console.warn('[tgEvents] dealer', e && e.message); }
}
async function notifyDealerPayment(admin, { dealerId, amountUsd, debtAfterUsd, via, filial, staffName }) {
  try {
    const { st } = await loadSettings(admin);
    if (!evtOn(st, 'dealer')) return;
    const d = await dealerRow(admin, dealerId);
    const after = debtAfterUsd != null ? num(debtAfterUsd) : num(d.debt_usd);
    const full = after <= 0.005;
    const text = [full ? '✅ <b>Diller qarzi toʻliq yopildi</b>' : '💵 <b>Diller toʻlovi</b>',
      `👤 <b>${esc(d.name)}</b>${d.phone ? ' · ' + esc(d.phone) : ''}`,
      `🏢 ${esc(branchName(st, filial))}${staffName ? ' · ' + esc(staffName) : ''}${via ? ' · ' + esc(via) : ''}`,
      pre([row('Toʻlandi', usd(amountUsd)), row('Qolgan qarz', usd(Math.max(0, after)))])].join('\n');
    await send(st, 'dealer', text);
  } catch (e) { console.warn('[tgEvents] dealer-pay', e && e.message); }
}

// ── 4) Eslatma: nasiya qaytarish kuni (bugun) va muddati o'tganlar — kuniga bir marta ──
function dueList(data, date) {
  const out = [];
  for (const [k, b] of Object.entries((data && data.branchStore) || {})) {
    const debtors = new Map((b.customers || []).filter((c) => c && num(c.debt) > 0.5).map((c) => [Number(c.id), c]));
    const firstDue = new Map();
    for (const s of b.sales || []) {
      if (!s || !s.dueDate || !(num(s.debtUsd) > 0) || s.status === 'cancelled' || s.status === 'void') continue;
      const c = debtors.get(Number(s.custId)); if (!c) continue;
      const due = String(s.dueDate).slice(0, 10); if (due > date) continue;
      const prev = firstDue.get(c.id); if (!prev || due < prev) firstDue.set(c.id, due);
    }
    for (const [id, due] of firstDue) { const c = debtors.get(id); out.push({ filial: k, name: c.name, phone: c.phone, debt: num(c.debt), due }); }
  }
  return out.sort((a, z) => a.due.localeCompare(z.due) || z.debt - a.debt);
}
function remindText(st, list, date) {
  const today = list.filter((x) => x.due === date), late = list.filter((x) => x.due < date);
  const days = (d) => Math.round((Date.parse(date) - Date.parse(d)) / 864e5);
  const item = (x, lateMode) => `• <b>${esc(x.name)}</b>${x.phone ? ' · ' + esc(x.phone) : ''}\n   ${esc(uzs(x.debt))}${lateMode ? ` · ${days(x.due)} kun kechikdi (${fmtDate(x.due)})` : ''}${Object.keys(st.branchNames || {}).length > 1 ? ' · ' + esc(branchName(st, x.filial)) : ''}`;
  const out = [`⏰ <b>Nasiya eslatmasi</b> · ${fmtDate(date)}`];
  if (today.length) { out.push('', `📅 <b>Bugun toʻlash kerak (${today.length})</b>`); today.slice(0, 40).forEach((x) => out.push(item(x, false))); }
  if (late.length) { out.push('', `⚠️ <b>Muddati oʻtgan (${late.length})</b>`); late.slice(0, 40).forEach((x) => out.push(item(x, true))); }
  const tot = list.reduce((a, x) => a + x.debt, 0);
  out.push('', `Jami: <b>${esc(uzs(tot))}</b>`);
  return out.join('\n').slice(0, 3900);
}

// ── 5) Oy yakuni: dillerlar hisoboti (o'tgan oy) ──
async function monthDealerText(admin, st, ym) {
  const from = ym + '-01T00:00:00Z';
  const [y, m] = ym.split('-').map(Number); const to = new Date(Date.UTC(y, m, 1)).toISOString();
  const { data: dealers } = await admin.from('dealers').select('id,name,debt_usd,active').order('name');
  const moves = (await admin.from('dealer_stock_moves').select('dealer_id,type,qty,cost_usd').gte('created_at', from).lt('created_at', to)).data || [];
  const pays = (await admin.from('dealer_payments').select('dealer_id,amount_usd').gte('created_at', from).lt('created_at', to)).data || [];
  // Diller portalidan yuborilgan pul (30-migratsiya) — rad etilmaganlari ham to'lov hisoblanadi (qarz darhol kamaygan)
  try {
    const n = await admin.from('dealer_pay_notices').select('dealer_id,amount_usd,status').gte('created_at', from).lt('created_at', to);
    (n.data || []).filter((x) => x.status !== 'rejected').forEach((x) => pays.push({ dealer_id: x.dealer_id, amount_usd: x.amount_usd }));
  } catch (_) { /* jadval yo'q */ }
  const R = [];
  let tShip = 0, tPay = 0, tDebt = 0;
  for (const d of (dealers || []).filter((x) => x && x.active !== false)) {
    const ship = moves.filter((x) => x.dealer_id === d.id && /ship|send|jo/i.test(String(x.type))).reduce((a, x) => a + num(x.qty) * num(x.cost_usd), 0);
    const paid = pays.filter((x) => x.dealer_id === d.id).reduce((a, x) => a + num(x.amount_usd), 0);
    tShip += ship; tPay += paid; tDebt += num(d.debt_usd);
    R.push(esc(cut(d.name, W)), row('  Olgan (tannarx)', usd(ship)), row('  Toʻlagan', usd(paid)), row('  Qarzi', usd(d.debt_usd)));
  }
  if (!R.length) return null;
  R.push(LINE, row('Jami olgan', usd(tShip)), row('Jami toʻlagan', usd(tPay)), row('Jami qarz', usd(tDebt)));
  const MO = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
  return (`📆 <b>Dillerlar — ${MO[m - 1]} ${y} yakuni</b>\n` + pre(R)).slice(0, 3900);
}

module.exports = { notifyCreditSale, notifyCustomerPayment, notifyDealerOp, notifyDealerPayment, dueList, remindText, monthDealerText,
  creditSaleText, evtOn, chatsFor, send, loadSettings };
