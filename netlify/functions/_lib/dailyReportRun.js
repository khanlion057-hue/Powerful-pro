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


module.exports = { TOKEN_RE, CHAT_RE, hourOf, loadAll, dealerPayToday, tgSend };
