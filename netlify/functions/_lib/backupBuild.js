// v24.5 — ZAXIRA NUSXA (server tomonda): barcha ma'lumot bitta JSON faylga.
//   • app_data (asosiy) va har bir filial (app_data_branches) — maxfiy kalitlarsiz (bot tokenlari, PIN'lar);
//   • jurnal jadvallari (kassa, qarz, ombor, savdo, mijoz haqi va h.k.) — falokatdan tiklash/audit uchun nusxa.
// Faqat O'QIYDI. Bot tokeni va PIN'lar faylga HECH QACHON yozilmaydi.
'use strict';
const zlib = require('zlib');
const crypto = require('crypto');
const { _isMissingRelation } = require('./cashAuthority');

// appDataGuard bilan bitta ro'yxat (yangi maxfiy sozlama qo'shilsa — ikkalasida bir xil bo'ladi)
const { SECRET_SETTINGS_KEYS: SECRET_KEYS } = require('./appDataGuard');
const LEDGER_TABLES = ['cashbox_balances', 'customer_balances', 'supplier_balances', 'batches', 'sales', 'firma_kassa_balance',
  'supplier_advance_balances', 'customer_credit_balances', 'dealers', 'dealer_stock', 'stock_writeoffs', 'expense_categories'];
const PAGE = 1000, MAX_ROWS = 200000;

function stripSecrets(v) {
  if (!v || typeof v !== 'object') return v;
  const out = { ...v };
  if (out.settings && typeof out.settings === 'object') { out.settings = { ...out.settings }; SECRET_KEYS.forEach(k => { delete out.settings[k]; }); }
  return out;
}
async function fetchAll(admin, table) {
  const rows = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let q = admin.from(table).select('*');
    if (typeof q.range === 'function') q = q.range(from, from + PAGE - 1);
    const { data, error } = await q;
    if (error) { if (_isMissingRelation(error)) return null; throw error; }
    rows.push(...(data || []));
    if (!data || data.length < PAGE || typeof admin.from(table).select('*').range !== 'function') break;
  }
  return rows;
}
// dealers jadvalidan maxfiy ustunlar (parol xeshlari va h.k.) chiqariladi
function cleanRow(table, r) {
  if (!r || typeof r !== 'object') return r;
  if (table === 'dealers') { const o = { ...r }; delete o.password_hash; delete o.pin_hash; delete o.auth_user_id; return o; }
  return r;
}
async function buildBackup(admin) {
  const { data: mainRow, error } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
  if (error) throw error;
  const main = stripSecrets((mainRow && mainRow.data) || {});
  const branches = {};
  const br = await admin.from('app_data_branches').select('branch_key,data');
  if (br.error && !_isMissingRelation(br.error)) throw br.error;
  (br.data || []).forEach(r => { if (r && r.branch_key) branches[r.branch_key] = stripSecrets(r.data || {}); });
  const ledger = {};
  for (const t of LEDGER_TABLES) { const rows = await fetchAll(admin, t); if (rows) ledger[t] = rows.map(r => cleanRow(t, r)); }
  const counts = {
    products: Array.isArray(main.products) ? main.products.length : 0,
    branches: Object.keys(branches).length,
    sales: Object.values(branches).reduce((a, b) => a + (Array.isArray(b && b.sales) ? b.sales.length : 0), Array.isArray(main.sales) ? main.sales.length : 0),
    customers: Object.values(branches).reduce((a, b) => a + (Array.isArray(b && b.customers) ? b.customers.length : 0), Array.isArray(main.customers) ? main.customers.length : 0),
  };
  // v24.5 audit: yaxlitlik — sha256 (main+branches+ledger JSON'i). Tiklashda brauzer qayta hisoblaydi: fayl buzilgan yoki
  // qo'lda o'zgartirilgan bo'lsa — rad. Migratsiya darajasi — tiklash mos bazaga qilinayotganini ko'rish uchun.
  const integrity = { alg: 'sha256', of: 'main+branches+ledger', value: payloadSha256({ main, branches, ledger }) };
  const schema = { migrationLevel: await migrationLevel(admin) };
  return { format: 'powerful-pro-backup', version: '24.5', app: 'Powerful PRO', createdAt: new Date().toISOString(), counts, schema, integrity, main, branches, ledger };
}
// Brauzerdagi tekshiruv bilan AYNAN bir xil: sha256(JSON.stringify({ main, branches, ledger })) — hex
function payloadSha256(payload) { return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'); }
// Faqat o'qiydi: taxminiy migratsiya darajasi — asosiy jadval bor-yo'qligi bo'yicha (24, 27, 33, 34; aniq daraja —
// scripts/lib/migratsiya-darajasi.sql). Aniqlab bo'lmasa — null (zaxira baribir yaratiladi).
async function migrationLevel(admin) {
  const probes = [[34, 'customer_credit_balances'], [33, 'supplier_advance_balances'], [27, 'stock_ledger'], [24, 'cashbox_balances']];
  for (const [n, obj] of probes) {
    try {
      const { error } = await admin.from(obj).select('*', { head: true, count: 'exact' }).limit(1);
      if (!error) return n;
      if (!_isMissingRelation(error)) return null;
    } catch (_) { return null; }
  }
  return 23;
}
function backupFile(obj, gzip) {
  const json = Buffer.from(JSON.stringify(obj));
  return gzip ? zlib.gzipSync(json, { level: 9 }) : json;
}
async function tgSendDocument(token, chatId, filename, buf, caption, mime) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    if (caption) fd.append('caption', String(caption).slice(0, 1000));
    fd.append('document', new Blob([buf], { type: mime || 'application/octet-stream' }), filename);
    const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendDocument`, { method: 'POST', body: fd, signal: ctrl.signal });
    const j = await r.json().catch(() => ({}));
    return { ok: !!(j && j.ok), description: j && !j.ok ? String(j.description || 'xato').slice(0, 200) : undefined };
  } finally { clearTimeout(t); }
}

module.exports = { buildBackup, backupFile, tgSendDocument, stripSecrets, payloadSha256, SECRET_KEYS, LEDGER_TABLES };
