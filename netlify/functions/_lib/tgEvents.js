// v25.1 — TELEGRAM HODISA XABARLARI (egasi talabi): har nasiya savdo, mijoz qarz to'lovi, diller oldi-berdisi va
// to'lovlari guruhga darhol; nasiya qaytarish kuni — eslatma; oy yakunida dillerlar hisoboti.
//
// Qoidalar:
//   • Faqat SERVER ma'lumoti (savdo/to'lov bazaga yozilgandan KEYIN) — brauzer yuborgan summa ishlatilmaydi, qoldiq
//     qarz bazadan olinadi.
//   • Xabar yuborilmasa ham amal BEKOR QILINMAYDI (best-effort, qisqa vaqt chegarasi, xato faqat logga).
//   • Bot tokeni faqat serverda (app_data.settings.tgBotToken); javobga qo'shilmaydi.
// Sozlamalar (app_data.settings):
//   tgChatId            — egasining asosiy guruhi (hamma hodisa — umumiy nazorat; tgEvt.copyMain=false bo'lsa yo'q)
//   tgBranchChats       — { filialKaliti: chat } — HAR FILIALNING O'Z GURUHI: faqat shu filialning nasiya/to'lov/eslatma/hisoboti
//   tgDealerChatMap     — { dillerId: chat } — HAR DILLERNING O'Z GURUHI: faqat shu dillerning oldi-berdisi va oy yakuni
//   tgDealerChats       — barcha dillerlar bo'yicha umumiy guruh/kanal (bo'sh bo'lsa — asosiy guruh)
//   tgEvt               — { credit, pay, remind, dealer, month, copyMain } (berilmagan → yoqiq)
// MAXFIYLIK: filial guruhiga boshqa filial, diller guruhiga boshqa diller ma'lumoti HECH QACHON yuborilmaydi.
//   tgRemindHour        — eslatma soati (Toshkent, 6–22; standart 9)
'use strict';
const { TOKEN_RE, CHAT_RE, tgSend } = require('./dailyReportRun');
const tc = require('./tgCustomers');
const ops = require('./opsGuard');
const brandOf = (st) => String(st.company || process.env.FW_BRAND_NAME || 'POWERFUL GROUP').slice(0, 60);

// v25.6.10: barcha yordamchilar — yagona tgFmt'dan (kenglik 34, kirill → lotin, jadval)
const F = require('./tgFmt');
const { num, esc, sp, m2, usd, uzs, cut, W, row, asc, pre, LINE, table } = F;
const fmtDate = (d) => String(d || '').slice(0, 10).split('-').reverse().join('.');
const qty = F.q;
// Mahsulotlar jadvali: Mahsulot | Soni | Summa ($) — nomga eng ko'p joy (narx = summa / soni)
const goodsCols = [{ h: 'Mahsulot' }, { h: 'Soni', w: 5, r: true }, { h: 'Summa', w: 10, r: true }];

function evtOn(st, kind) { const e = st && st.tgEvt; return !(e && typeof e === 'object' && e[kind] === false); }
function chatList(v) {
  const raw = Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/);
  return [...new Set(raw.map((x) => String(x || '').trim()).filter((x) => CHAT_RE.test(x)))].slice(0, 5);
}
// Kimga: o'z guruhi (filial yoki diller) + egasining umumiy guruhi. ctx: { filial } yoki { dealerId }; own:false — faqat umumiy.
const mapChat = (m, k) => { const v = m && typeof m === 'object' ? String(m[k] || '').trim() : ''; return CHAT_RE.test(v) ? v : null; };
function chatsFor(st, kind, ctx = {}) {
  const copyMain = !(st.tgEvt && st.tgEvt.copyMain === false);
  const main = CHAT_RE.test(String(st.tgChatId || '')) ? [String(st.tgChatId)] : [];
  const dealerKind = kind === 'dealer' || kind === 'month';
  const overview = dealerKind ? (chatList(st.tgDealerChats).length ? chatList(st.tgDealerChats) : main) : main;
  const own = ctx.own === false ? null : dealerKind ? (ctx.dealerId != null ? mapChat(st.tgDealerChatMap, ctx.dealerId) : null)
    : (ctx.filial ? mapChat(st.tgBranchChats, ctx.filial) : null);
  const list = ctx.onlyOwn ? (own ? [own] : []) : [...(own ? [own] : []), ...((copyMain || !own) ? overview : [])];
  return [...new Set(list)];
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

// Yuborish — hech qachon xato tashlamaydi; 6 soniyadan ortiq kutmaydi.
// v25.2: har chat alohida; vaqtinchalik xato (tarmoq, 429, 5xx) bo'lsa — xabar yo'qolmaydi, tg_outbox navbatiga tushadi
// (soatlik ish qayta yuboradi). ctx.admin — navbat uchun (48-migratsiya; yo'q bo'lsa — avvalgidek faqat log).
async function send(st, kind, text, ctx = {}) {
  try {
    if (!TOKEN_RE.test(String(st.tgBotToken || '')) || !evtOn(st, kind)) return { ok: false, skipped: true };
    const chats = chatsFor(st, kind, ctx); if (!chats.length) return { ok: false, skipped: true };
    const res = await Promise.all(chats.map((c) => ops.within(tgSend(st.tgBotToken, c, text), 6000, { ok: false, description: 'timeout' })
      .then((r) => Object.assign({ chat: c }, r || { ok: false, description: 'xato' }))));
    const bad = res.filter((r) => !r.ok);
    if (bad.length) {
      console.warn('[tgEvents]', kind, bad.map((b) => b.description).join('; '));
      if (ctx.admin && ops.opsOn()) {
        for (const b of bad) if (ops.RETRYABLE(b.description)) await ops.enqueue(ctx.admin, b.chat, text, kind, b.description);
      }
    }
    return { ok: !bad.length };
  } catch (e) { console.warn('[tgEvents]', kind, e && e.message); return { ok: false }; }
}

// ── 1) Nasiya savdo ──
function creditSaleText({ st, filial, cust, items, discPct, paidUsd, creditUseUzs, rate, dueDate, dueDays, inv, staffName, custDebtUzs, serverDebtUsd, serverTotalUsd }) {
  const dp = Math.min(100, Math.max(0, num(discPct))), k = 1 - dp / 100;
  const list = (items || []).slice(0, 40);
  const rows = list.map((i) => [i.name || i.sku || ('#' + i.pid), qty(i.qty), m2(num(i.qty) * num(i.sellUsd))]);
  if ((items || []).length > 40) rows.push(`... yana ${items.length - 40} ta`);
  const gross = (items || []).reduce((a, i) => a + num(i.qty) * num(i.sellUsd), 0);
  let total = gross * k;
  let paid = num(paidUsd) + (rate > 0 ? num(creditUseUzs) / rate : 0);
  let debt = Math.max(0, total - paid);
  if (serverDebtUsd != null) { if (serverTotalUsd != null) total = num(serverTotalUsd); debt = Math.max(0, num(serverDebtUsd)); paid = Math.max(0, total - debt); }   // v25.6.10: bazadagi qiymat
  const foot = [[`JAMI (${list.length})`, '', m2(gross)], ...(dp > 0 || total < gross - 0.005 ? [[`Chegirma ${sp(dp, 2)}%`, '', '-' + m2(gross - total)]] : []),
    ['Toʻlandi', '', m2(paid)], ['QARZGA', '', m2(debt)]];
  const info = [...(rate > 0 ? [row("Qarzga (so'm)", sp(Math.round(debt * rate)))] : []), ...(dueDate ? [row('Qaytarish sanasi', fmtDate(dueDate))] : []),
    ...(dueDays ? [row('Muddat (kun)', String(dueDays))] : []), ...(custDebtUzs != null ? [LINE, row("Jami qarzi (so'm)", sp(custDebtUzs))] : [])];
  const out = [
    `🧾 <b>Nasiya savdo</b>${inv ? ' · ' + esc(inv) : ''} · <i>narx $ da</i>`,
    `👤 <b>${esc(cust && cust.name || 'Mijoz')}</b> · ${esc(cust && cust.phone || 'telefon yoʻq')}`,
    `🏢 ${esc(branchName(st, filial))}${staffName ? ' · ' + esc(staffName) : ''}`,
    table(goodsCols, rows, foot),
    ...(info.length ? [pre(info)] : []),
  ];
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
    await send(st, 'credit', text, { filial: args.filial, admin });
    // Mijozning o'ziga (botga ulangan bo'lsa) — faqat o'z xaridi
    if (evtOn(st, 'customer')) await tc.sendToCustomer(admin, st.tgBotToken, args.filial, args.custId,
      tc.custCreditText({ brand: brandOf(st), custName: cust.name, items: args.items, discPct: args.discPct, debtUsd: debt, rate: num(st.usdUzs), dueDate: args.dueDate }));
  } catch (e) { console.warn('[tgEvents] credit', e && e.message); }
}

// ── 2) Mijoz qarz to'lovi (kassa orqali) ──
async function notifyCustomerPayment(admin, { filial, customerId, amount, currency, debtAfterUzs, staffName, boxName }) {
  try {
    const { st, main } = await loadSettings(admin);
    if (!evtOn(st, 'pay')) return;
    const b = await loadBranch(admin, main, filial);
    const c = (b.customers || []).find((x) => x && Number(x.id) === Number(customerId)) || {};
    const full = debtAfterUzs != null && num(debtAfterUzs) <= 0.5;
    // v25.6.10: ustunlar — so'mda; dollar to'lov bo'lsa $ ustuni va kurs ham
    const rate = num(st.usdUzs), isUsd = currency === 'USD';
    const paidUzs = isUsd ? (rate > 0 ? Math.round(num(amount) * rate) : null) : num(amount);
    const after = debtAfterUzs != null ? Math.max(0, num(debtAfterUzs)) : null;
    const rows = [...(after != null && paidUzs != null ? [['Oldingi qarz', sp(after + paidUzs), '']] : []),
      ['Toʻlandi', paidUzs != null ? sp(paidUzs) : '-', isUsd ? m2(amount) : '']];
    const foot = [['Qolgan qarz', after != null ? sp(after) : '-', ''], ...(isUsd && rate > 0 ? [['Kurs 1$', sp(rate), '']] : [])];
    const text = [
      (full ? '✅ <b>Qarz toʻliq yopildi</b>' : '💵 <b>Qarz toʻlovi</b>'),
      `👤 <b>${esc(c.name || 'Mijoz')}</b>${c.phone ? ' · ' + esc(c.phone) : ''}`,
      `🏢 ${esc(branchName(st, filial))}${staffName ? ' · ' + esc(staffName) : ''}${boxName ? ' · ' + esc(boxName) : ''}`,
      isUsd ? table([{ h: '' }, { h: "So'm", w: 12, r: true }, { h: '$', w: 10, r: true }], rows, foot)
        : table([{ h: '' }, { h: "So'm", w: 14, r: true }], rows.map((r) => r.slice(0, 2)), foot.map((r) => r.slice(0, 2))),
    ].join('\n');
    await send(st, 'pay', text, { filial, admin });
    if (evtOn(st, 'customer')) await tc.sendToCustomer(admin, st.tgBotToken, filial, customerId,
      tc.custPayText({ brand: brandOf(st), amountText: currency === 'USD' ? usd(amount) : uzs(amount), amount, currency, debtAfterUzs }));
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
    // v25.6.10: jadval — Mahsulot | Soni | Narx | Summa; JAMI va diller qarzi shu jadvalda
    const list = (items || []).slice(0, 40);
    const priced = list.some((i) => num(i.priceUsd) > 0);
    const sum = list.reduce((t, i) => t + num(i.qty) * num(i.priceUsd), 0), n = list.reduce((t, i) => t + num(i.qty), 0);
    const body = priced
      ? table(goodsCols, list.map((i) => [i.name || i.sku || ('#' + i.pid), qty(i.qty), num(i.priceUsd) > 0 ? m2(num(i.qty) * num(i.priceUsd)) : '']),
        [[`JAMI (${list.length})`, qty(n), m2(sum)], ...(kind === 'sale' && pct != null ? [[`Xizmat ${sp(pct, 2)}%`, '', m2(sum * num(pct) / 100)]] : []), ['Diller qarzi', '', m2(d.debt_usd)]])
      : table([{ h: 'Mahsulot' }, { h: 'Soni', w: 8, r: true }], list.map((i) => [i.name || i.sku || ('#' + i.pid), qty(i.qty)]),
        [[`JAMI (${list.length})`, qty(n)], ...(kind === 'sale' && pct != null ? [[`Xizmat haqi, %`, sp(pct, 2)]] : [])]);
    const text = [title + (priced ? ' · <i>$ da</i>' : ''), `👤 <b>${esc(d.name)}</b>${d.phone ? ' · ' + esc(d.phone) : ''}${d.region ? ' · ' + esc(d.region) : ''}`,
      `🏢 ${esc(branchName(st, filial))}${staffName ? ' · ' + esc(staffName) : ''}`, body,
      ...(priced ? [] : [pre([row('Diller qarzi ($)', m2(d.debt_usd))])])].join('\n');
    await send(st, 'dealer', text, { dealerId, admin });
  } catch (e) { console.warn('[tgEvents] dealer', e && e.message); }
}
async function notifyDealerPayment(admin, { dealerId, amountUsd, debtAfterUsd, via, filial, staffName, state }) {
  try {
    const { st } = await loadSettings(admin);
    if (!evtOn(st, 'dealer')) return;
    const d = await dealerRow(admin, dealerId);
    const after = debtAfterUsd != null ? num(debtAfterUsd) : num(d.debt_usd);
    const full = after <= 0.005;
    // v25.6.10: state — 'pending' (diller yubordi, kassir tasdig'i kutilmoqda), 'rejected' (rad etildi — qarz qaytdi)
    const head = state === 'pending' ? '⏳ <b>Diller pul yubordi — tasdiq kutilmoqda</b>' : state === 'rejected' ? '❌ <b>Diller toʻlovi rad etildi</b>' : full ? '✅ <b>Diller qarzi toʻliq yopildi</b>' : '💵 <b>Diller toʻlovi qabul qilindi</b>';
    // v25.6.10: ustun — $; oldingi qarz ham ko'rinadi
    const R = state === 'rejected' ? [row('Rad etildi', m2(amountUsd)), row("Qarz (o'zgarmadi)", m2(Math.max(0, after)))]
      : state === 'pending' ? [row('Hozirgi qarz', m2(Math.max(0, after) + num(amountUsd))), row('Yubordi', m2(amountUsd)), LINE, row('Tasdiqlansa qarz', m2(Math.max(0, after)))]
      : [row('Oldingi qarz', m2(Math.max(0, after) + num(amountUsd))), row('Toʻlandi', m2(amountUsd)), LINE, row('Qolgan qarz', m2(Math.max(0, after)))];
    const text = [head + ' · <i>$ da</i>',
      `👤 <b>${esc(d.name)}</b>${d.phone ? ' · ' + esc(d.phone) : ''}`,
      `🏢 ${esc(branchName(st, filial))}${staffName ? ' · ' + esc(staffName) : ''}${via ? ' · ' + esc(via) : ''}`,
      pre(R)].join('\n');
    await send(st, 'dealer', text, { dealerId, admin });
  } catch (e) { console.warn('[tgEvents] dealer-pay', e && e.message); }
}

// ── 4) Eslatma: nasiya qaytarish kuni (bugun) va muddati o'tganlar — kuniga bir marta ──
// v25.6.10: ilovadagi fwCustDues bilan BIR XIL hisob — qarz eng yangi nasiyalardan boshlab taqsimlanadi (eski to'langanlar
// ochiq emas), muddat uzaytirish (c.dueOv), eski qarz muddati (c.debtDue), bekor qilingan/rad etilgan savdolar hisobga olinmaydi.
const DEAD = new Set(['cancelled', 'void', 'voided']);
function custOpenDues(c, sales, rate) {
  let rem = Math.max(0, Math.round(num(c && c.debt)));
  const out = []; if (!c || rem <= 0) return out;
  const list = (sales || []).filter((s) => s && s.custId != null && String(s.custId) === String(c.id) && !DEAD.has(s.status) && num(s.debtUsd) > 0.004)
    .slice().sort((a, z) => String(z.date || '').localeCompare(String(a.date || '')) || (String(z.id) > String(a.id) ? 1 : -1));
  for (const s of list) {
    if (rem <= 0) break;
    const r = num(s.rateUsdUzs) || rate;
    const amt = r > 0 ? Math.min(rem, Math.max(0, Math.round(num(s.debtUsd) * r))) : rem;
    if (amt <= 0) continue;
    rem -= amt;
    const ov = c.dueOv && typeof c.dueOv === 'object' ? c.dueOv[String(s.id)] : null;
    const due = ov && /^\d{4}-\d{2}-\d{2}$/.test(ov) ? ov : (s.dueDate ? String(s.dueDate).slice(0, 10) : null);
    out.push({ due, amt });
  }
  if (rem > 0) out.push({ due: c.debtDue ? String(c.debtDue).slice(0, 10) : null, amt: rem });
  return out;
}
function dueList(data, date) {
  const out = [], rate = num(data && data.settings && data.settings.usdUzs);
  for (const [k, b] of Object.entries((data && data.branchStore) || {})) {
    for (const c of b.customers || []) {
      if (!c || !(num(c.debt) > 0.5)) continue;
      const dues = custOpenDues(c, b.sales, rate).filter((x) => x.due && /^\d{4}-\d{2}-\d{2}$/.test(x.due) && x.due <= date);
      if (!dues.length) continue;
      const due = dues.map((x) => x.due).sort()[0];
      out.push({ filial: k, custId: Number(c.id), name: c.name, phone: c.phone, debt: num(c.debt), due });
    }
  }
  return out.sort((a, z) => a.due.localeCompare(z.due) || z.debt - a.debt);
}
function remindText(st, list, date) {
  const today = list.filter((x) => x.due === date), late = list.filter((x) => x.due < date);
  const days = (d) => Math.round((Date.parse(date) - Date.parse(d)) / 864e5);
  // v25.6.10: har ma'lumot O'Z USTUNIDA: Mijoz | Telefon | Qarz | Kun; JAMI — shu jadvalda, Qarz ustuni ostida
  const F = require('./tgFmt'), many = Object.keys(st.branchNames || {}).length > 1;
  const NW = 9, TW = 9, QW = 11, KW = 4;   // 9 + 1 + 9 + 11 + 4 = 34
  const pad = (t, w, right) => { t = F.asc(t); t = t.length > w ? t.slice(0, w - 1) + '.' : t; return right ? ' '.repeat(w - t.length) + t : t + ' '.repeat(w - t.length); };
  const tel = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : (d || '-'); };   // 901112233
  const line = (a, b, c, d) => pad(a, NW) + ' ' + pad(b, TW) + pad(c, QW, true) + pad(d, KW, true);
  const W = NW + 1 + TW + QW + KW;
  const table = (arr, lateMode) => {
    const fil = many ? [...new Set(arr.map((x) => x.filial))] : [];
    const row = (x) => line(x.name || 'Mijoz', tel(x.phone), F.sp(x.debt), lateMode ? String(days(x.due)) : '');
    // bir necha filial — har filial o'z sarlavhasi bilan (ustunlar buzilmaydi)
    const rows = fil.length > 1 ? fil.flatMap((f) => ['[' + F.cut(branchName(st, f), W - 2) + ']', ...arr.filter((x) => x.filial === f).slice(0, 30).map(row)])
      : arr.slice(0, 30).map(row);
    const sum = arr.reduce((t, x) => t + x.debt, 0);
    return F.pre([line('Mijoz', 'Telefon', 'Qarz', lateMode ? 'Kun' : ''), '-'.repeat(W), ...rows, '-'.repeat(W),
      line(`JAMI (${arr.length})`, '', F.sp(sum), ''), ...(fil.length === 1 ? ['[' + F.cut(branchName(st, fil[0]), W - 2) + ']'] : [])].map((r) => r.replace(/\s+$/, '')));
  };
  const out = [`⏰ <b>Nasiya eslatmasi</b> · ${fmtDate(date)} · <i>qarz so'mda</i>`];
  if (today.length) out.push(`📅 <b>Bugun toʻlash kerak (${today.length})</b>`, table(today, false));
  if (late.length) out.push(`⚠️ <b>Muddati oʻtgan (${late.length})</b>`, table(late, true));
  if (today.length && late.length) out.push(F.pre([line(`JAMI (${list.length})`, '', F.sp(list.reduce((a, x) => a + x.debt, 0)), '').replace(/\s+$/, '')]));
  return out.join('\n').slice(0, 3900);
}

// ── 5) Oy yakuni: dillerlar hisoboti (o'tgan oy) ──
// Natija: { overview: barcha dillerlar jadvali (egasiga), perDealer: [{ dealerId, text }] — har dillerga FAQAT o'zi }
const MO = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
async function monthDealerReports(admin, st, ym) {
  const from = ym + '-01T00:00:00Z';
  const [y, m] = ym.split('-').map(Number); const to = new Date(Date.UTC(y, m, 1)).toISOString();
  const { data: dealers } = await admin.from('dealers').select('id,name,debt_usd,active').order('name');
  const moves = (await admin.from('dealer_stock_moves').select('dealer_id,type,qty,cost_usd').gte('created_at', from).lt('created_at', to)).data || [];
  const pays = (await admin.from('dealer_payments').select('dealer_id,amount_usd').gte('created_at', from).lt('created_at', to)).data || [];
  // Diller portalidan yuborilgan pul (30-migratsiya) ham dealer_payments'ga yoziladi (rad etilsa — teskari manfiy yozuv), shuning uchun
  // xabarnomalar alohida QO'SHILMAYDI (avval ikki marta sanalardi).
  const title = `${MO[m - 1]} ${y} yakuni`;
  const R = [], perDealer = [];
  let tShip = 0, tRet = 0, tPay = 0, tDebt = 0;
  for (const d of (dealers || []).filter((x) => x && x.active !== false)) {
    const mine = moves.filter((x) => x.dealer_id === d.id);
    const ship = mine.filter((x) => /send|ship/i.test(String(x.type))).reduce((a, x) => a + num(x.qty) * num(x.cost_usd), 0);
    const ret = mine.filter((x) => /return/i.test(String(x.type))).reduce((a, x) => a + num(x.qty) * num(x.cost_usd), 0);
    const paid = pays.filter((x) => x.dealer_id === d.id).reduce((a, x) => a + num(x.amount_usd), 0);
    tShip += ship; tRet += ret; tPay += paid; tDebt += num(d.debt_usd);
    // v25.6.10: ustunlar — har diller bitta qator; har dillerga o'zi — ikki ustun
    const rows = [row('Olgan (tannarx)', m2(ship)), row('Qaytargan', m2(ret)), row('Toʻlagan', m2(paid)), LINE, row('Hozirgi qarz', m2(d.debt_usd))];
    R.push([d.name, sp(ship - ret), sp(paid), sp(d.debt_usd)]);
    perDealer.push({ dealerId: d.id, text: `📆 <b>${esc(d.name)}</b>\n${title} · <i>$ da</i>\n` + pre(rows) });
  }
  if (!perDealer.length) return { overview: null, perDealer };
  const tbl = table([{ h: 'Diller' }, { h: 'Oldi', w: 7, r: true }, { h: "To'ladi", w: 8, r: true }, { h: 'Qarz', w: 8, r: true }],
    R, [['JAMI', sp(tShip - tRet), sp(tPay), sp(tDebt)]]);
  return { overview: (`📆 <b>Dillerlar — ${title}</b> · <i>$ da</i>\n` + tbl + `\n<i>Oldi — olgani, qaytargani ayirilgan (tannarxda); Qarz — hozirgi holat</i>`).slice(0, 3900), perDealer };
}

// Eslatmani filiallarga bo'lish: { filial: [...] } — filial guruhiga faqat o'z mijozlari
function dueByBranch(list) { const m = {}; for (const x of list) (m[x.filial] = m[x.filial] || []).push(x); return m; }


// ── 6) v25.6.9: FILIAL GURUHI — tovar KIRIMI va O'TKAZMALAR (so'rov / jo'natish / qabul) ──
// Faqat miqdor va nom (tannarx va narx YO'Q). Har filial guruhiga faqat o'zi qatnashgan amal.
async function productNames(main) { const m = {}; ((main && main.products) || []).forEach((p) => { if (p && p.id != null) m[p.id] = p.name || p.sku || ('#' + p.id); }); return m; }
function qtyLines(list, names) {
  const by = {}; (list || []).forEach((i) => { const k = Number(i.pid); by[k] = (by[k] || 0) + num(i.qty); });
  const rows = Object.entries(by).sort((a, z) => z[1] - a[1]), total = rows.reduce((a, [, q]) => a + q, 0);
  const lines = rows.slice(0, 12).map(([pid, q]) => [names[pid] || ('#' + pid), qty(q)]);
  if (rows.length > 12) lines.push('... yana ' + (rows.length - 12) + ' xil');
  // v25.6.10: jadval — Mahsulot | Soni; JAMI shu jadvalda
  const tbl = () => table([{ h: 'Mahsulot' }, { h: 'Soni', w: 9, r: true }], lines, [[`JAMI (${rows.length} xil)`, qty(total)]]);
  return { lines, kinds: rows.length, total, tbl };
}
async function notifyStockIn(admin, args) {
  try {
    const { st, main } = await loadSettings(admin);
    if (!evtOn(st, 'stock') || args.reason === 'opening') return;
    const names = await productNames(main), q = qtyLines((args.batches || []).map((b) => ({ pid: b.pid, qty: b.qty })), names);
    if (!q.kinds) return;
    const title = args.reason === 'import' ? 'Excel kirim' : args.reason === 'dealer_return' ? 'Dillerdan qaytgan tovar' : 'Tovar kirimi';
    const text = [`📥 <b>${title}</b> · ${esc(branchName(st, args.filial))}${args.staffName ? ' · ' + esc(args.staffName) : ''}`, q.tbl()].join('\n');
    await send(st, 'stock', text, { filial: args.filial, admin });
  } catch (e) { console.warn('[tgEvents] stock', e && e.message); }
}
async function notifyTransfer(admin, args) {
  try {
    const { st, main } = await loadSettings(admin);
    if (!evtOn(st, 'stock')) return;
    const p = args.payload || {}, names = await productNames(main), q = qtyLines(p.items, names);
    const me = args.filial, other = String((args.kind === 'tr_request' || args.kind === 'tr_receive' ? p.from : p.to) || '');   // v25.6.10: qabulda — yuboruvchi
    const FIL = /^[A-Za-z0-9_-]{1,40}$/, kinds = { tr_request: ['📨', "Tovar so'rovi"], tr_ship: ['🚚', "Tovar jo'natildi"], tr_receive: ['📦', 'Tovar qabul qilindi'] };
    const k = kinds[args.kind]; if (!k || (!q.kinds && args.kind !== 'tr_receive')) return;
    const mk = (who, dir) => [`${k[0]} <b>${k[1]}</b>`, `🏢 ${esc(branchName(st, me))}${other && FIL.test(other) ? ` ${dir} ${esc(branchName(st, other))}` : ''}${args.staffName ? ' · ' + esc(args.staffName) : ''}`,
      ...(q.kinds ? [q.tbl()] : [])].join('\n');
    await send(st, 'stock', mk(me, args.kind === 'tr_ship' ? '→' : '←'), { filial: me, admin });
    if (other && FIL.test(other) && other !== me) await send(st, 'stock', mk(other, args.kind === 'tr_ship' ? '→' : '←'), { filial: other, admin, onlyOwn: true });
  } catch (e) { console.warn('[tgEvents] transfer', e && e.message); }
}

module.exports = { brandOf, notifyCreditSale, notifyCustomerPayment, notifyDealerOp, notifyDealerPayment, dueList, remindText, monthDealerReports, dueByBranch, mapChat,
  creditSaleText, evtOn, chatsFor, send, loadSettings, notifyStockIn, notifyTransfer };
