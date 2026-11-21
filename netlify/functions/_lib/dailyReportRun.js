// v23.9 — kunlik Telegram hisobotini tayyorlash va yuborish (jadval funksiyasi va administrator funksiyasi uchun umumiy).
'use strict';
const { cashAuthorityOn, loadBalances, overlayBranch } = require('./cashAuthority');
const { ledgerAuthorityOn, loadLedger, overlayBranchLedger } = require('./ledgerAuthority');

const TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{20,}$/;
const CHAT_RE = /^-?\d{3,20}$|^@[A-Za-z0-9_]{4,64}$/;
const hourOf = (st) => { const h = parseInt(st.tgDailyHour, 10); return h >= 6 && h <= 23 ? h : 21; };

// app-data-load bilan bir xil haqiqiy ma'lumot (filial nusxalari + kassa va qarz jurnallari)
async function loadAll(admin) {
  const { data: row, error } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
  if (error) throw error;
  let data = (row && row.data) || {};
  const { data: fresh } = await admin.from('app_data_branches').select('branch_key,data');
  const bs = { ...(data.branchStore || {}) };
  (fresh || []).forEach((r) => { if (r.data) bs[r.branch_key] = r.data; });
  if (await cashAuthorityOn(admin)) for (const k of Object.keys(bs)) bs[k] = overlayBranch(bs[k], await loadBalances(admin, k));
  if (await ledgerAuthorityOn(admin)) for (const k of Object.keys(bs)) bs[k] = overlayBranchLedger(bs[k], await loadLedger(admin, k)).branch;
  data = { ...data, branchStore: bs };
  const extra = {};
  const fk = await admin.from('firma_kassa_balance').select('currency,balance');
  if (!fk.error && Array.isArray(fk.data)) { extra.firma = { USD: 0, UZS: 0 }; fk.data.forEach((r) => { extra.firma[r.currency] = Number(r.balance) || 0; }); }
  return { data, extra };
}
async function dealerPayToday(admin, date) {
  const r = await admin.from('dealer_pay_notices').select('amount_usd,status,created_at').gte('created_at', date + 'T00:00:00Z');
  if (r.error) return null;   // 30-migratsiya hali yo'q — qism tushirib qoldiriladi
  const rows = (r.data || []).filter((n) => String(n.created_at).slice(0, 10) === date && n.status !== 'rejected');
  return { count: rows.length, usd: rows.reduce((a, n) => a + (Number(n.amount_usd) || 0), 0), pending: rows.filter((n) => n.status === 'pending').length };
}
// v25.6: Dillerlar bo'limi uchun — faol dillerlar, BUGUNGI (Toshkent kuni) sof to'lov va ombor qoldig'i.
// To'lovning yagona manbai — dealer_payments (portal to'lovi ham, rad etilsa teskari manfiy yozuv ham shu yerda; xabarnomalar qayta qo'shilmaydi).
// Jadval yo'q / xato — null (hisobotda bo'lim tushiriladi, hisobot to'xtamaydi).
async function dealerOverview(admin, date) {
  const from = new Date(Date.parse(date + 'T00:00:00+05:00')), to = new Date(from.getTime() + 864e5);
  if (!Number.isFinite(from.getTime())) return null;
  const d = await admin.from('dealers').select('id,name,region,debt_usd,active').order('name');
  if (d.error || !Array.isArray(d.data)) return null;
  const pay = await admin.from('dealer_payments').select('dealer_id,amount_usd,created_at').gte('created_at', from.toISOString()).lt('created_at', to.toISOString());
  const stk = await admin.from('dealer_stock').select('dealer_id,qty,avg_cost_usd').gt('qty', 0);
  const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const paid = new Map(), qty = new Map(), val = new Map();
  (pay.error ? [] : pay.data || []).forEach((r) => paid.set(r.dealer_id, (paid.get(r.dealer_id) || 0) + n(r.amount_usd)));
  (stk.error ? [] : stk.data || []).forEach((r) => { qty.set(r.dealer_id, (qty.get(r.dealer_id) || 0) + n(r.qty)); val.set(r.dealer_id, (val.get(r.dealer_id) || 0) + n(r.qty) * n(r.avg_cost_usd)); });
  const r2 = (v) => Math.round(v * 100) / 100;
  return d.data.filter((x) => x && x.name && x.active !== false).map((x) => ({ id: x.id, name: String(x.name), region: x.region || '', debt: n(x.debt_usd),
    paidToday: r2(paid.get(x.id) || 0), stockQty: qty.get(x.id) || 0, stockUsd: r2(val.get(x.id) || 0) }));
}
async function tgSend(token, chatId, text) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: !!(j && j.ok), description: j && !j.ok ? String(j.description || 'xato').slice(0, 200) : undefined };
  } finally { clearTimeout(t); }
}


module.exports = { TOKEN_RE, CHAT_RE, hourOf, loadAll, dealerPayToday, dealerOverview, tgSend };
