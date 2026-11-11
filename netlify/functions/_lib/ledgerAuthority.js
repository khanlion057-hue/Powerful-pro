// ════════════════════════════════════════════════════════════
// F4b — MIJOZ QARZI, TA'MINOTCHI QARZI, OMBOR QOLDIG'I: SERVER HAQIQIY MANBA (27-migratsiya).
//
// F4 (kassa) bilan bir xil yondashuv: haqiqiy qiymatlar SQL'da (customer_balances, supplier_balances,
// batches, sales) — faqat jurnal orqali o'zgaradi. app_data JSON'idagi `debt`, `paid`, `qty`, `sold`,
// `status`, `costUsd` va savdo summalari — faqat KO'RINISH nusxasi: saqlashda ham, yuklashda ham
// bazadagi qiymat bilan MAJBURAN almashtiriladi (brauzer yuborgan son e'tiborga olinmaydi).
//
// 27-migratsiya hali qo'llanmagan bo'lsa — avvalgi xatti-harakat (kod migratsiyadan oldin chiqsa ham
// hech narsa buzilmaydi).
// ════════════════════════════════════════════════════════════
const { _isMissingRelation } = require('./cashAuthority');

const OFF_RECHECK_MS = 60 * 1000;
let _state = { on: null, at: 0 };

async function ledgerAuthorityOn(admin) {
  if (_state.on === true) return true;
  if (_state.on === false && Date.now() - _state.at < OFF_RECHECK_MS) return false;
  const q = admin.from('ledger_ops').select('id');
  const { error } = await (typeof q.limit === 'function' ? q.limit(1) : q);
  if (error && !_isMissingRelation(error)) throw error;
  _state = { on: !error, at: Date.now() };
  return _state.on;
}
function _resetLedgerAuthorityCache() { _state = { on: null, at: 0 }; }

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(num(v) * 100) / 100;
const r4 = (v) => Math.round(num(v) * 10000) / 10000;

// Bitta filialning haqiqiy qiymatlari
async function loadLedger(admin, filial) {
  const [c, s, b, sl] = await Promise.all([
    admin.from('customer_balances').select('customer_local_id,debt').eq('filial', filial),
    admin.from('supplier_balances').select('supplier_local_id,debt,total_paid').eq('filial', filial),
    admin.from('batches').select('*').eq('filial', filial),   // v24.6: barcha ustunlar — o'tkazma partiyalarini ro'yxatga qo'shish uchun
    admin.from('sales').select('local_id,items,subtotal_usd,disc_pct,disc_usd,total_usd,paid_usd,debt_usd,profit_usd,status,edited_at').eq('filial', filial),
  ]);
  for (const r of [c, s, b, sl]) if (r.error) throw r.error;
  // v23.6 (29): hisobdan chiqarish hujjatlari — bazadan (29 bo'lmasa — yo'q, JSON'dagi qoladi)
  let writeoffs = null;
  const wq = admin.from('stock_writeoffs').select('*').eq('filial', filial);
  const wr = await (typeof wq.order === 'function' ? wq.order('id', { ascending: false }) : wq);
  if (!wr.error) writeoffs = (wr.data || []).slice(0, 1000).map(writeoffRowToClient);
  else if (!_isMissingRelation(wr.error)) throw wr.error;
  // v24.5 (34): mijoz haqi (ortiqcha to'lov) — jadval bo'lmasa (34 qo'llanmagan) — bo'sh
  let credits = new Map();
  const cq = admin.from('customer_credit_balances').select('customer_local_id,credit_uzs').eq('filial', filial);
  const cr = await cq;
  if (!cr.error) credits = new Map((cr.data || []).map(r => [String(r.customer_local_id), r2(r.credit_uzs)]));
  else if (!_isMissingRelation(cr.error)) throw cr.error;
  const customers = new Map((c.data || []).map(r => [String(r.customer_local_id), r2(r.debt)]));
  const suppliers = new Map((s.data || []).map(r => [String(r.supplier_local_id), { debt: r4(r.debt), paid: r4(r.total_paid) }]));
  // v25 (44): so'mdagi ta'minotchi — aniq qarz so'mda (ustun bo'lmasa — 44 qo'llanmagan, hammasi $ da)
  const su = await admin.from('supplier_balances').select('supplier_local_id,currency,debt_uzs').eq('filial', filial).eq('currency', 'UZS');
  if (!su.error) (su.data || []).forEach(r => { const v = suppliers.get(String(r.supplier_local_id)); if (v) Object.assign(v, { debtCur: 'UZS', debtUzs: r2(r.debt_uzs) }); });
  const batches = new Map((b.data || []).map(r => [String(r.local_id), { qty: num(r.qty), sold: num(r.sold), status: r.status, costUsd: num(r.cost_usd),
    pid: num(r.pid), bno: r.bno || null, origin: r.origin || null, fromBranch: r.from_branch || null, date: r.batch_date ? String(r.batch_date).slice(0, 10) : null }]));
  const sales = new Map((sl.data || []).filter(r => r.local_id).map(r => [String(r.local_id), r]));
  return { customers, suppliers, batches, sales, writeoffs, credits };
}

const _isList = (v) => Array.isArray(v);

// Filial obyektiga haqiqiy qiymatlarni yozadi. prev — serverdagi avvalgi JSON (soxtalashtirishni
// ajratish uchun: eskirgan nusxa — oddiy holat, u "tampered" hisoblanmaydi).
// Natija: { branch, tampered:[...] }
function overlayBranchLedger(branchObj, ledger, prev) {
  if (!branchObj || typeof branchObj !== 'object' || !ledger) return { branch: branchObj, tampered: [] };
  const tampered = [];
  const out = { ...branchObj };
  const prevMap = (key, field) => new Map(_isList(prev && prev[key]) ? prev[key].filter(x => x && x.id != null).map(x => [String(x.id), x[field]]) : []);

  if (_isList(out.customers)) {
    const pv = prevMap('customers', 'debt');
    out.customers = out.customers.map(c => {
      if (!c || c.id == null) return c;
      const k = String(c.id);
      const debt = ledger.customers.has(k) ? ledger.customers.get(k) : 0;   // bazada yo'q — qarz 0
      const sent = r2(c.debt);
      if (sent !== debt && sent !== r2(pv.get(k))) tampered.push('customers.' + k);
      const credit = ledger.credits && ledger.credits.has(k) ? ledger.credits.get(k) : 0;   // haq — faqat bazadan (brauzer yuborgani e'tiborsiz)
      return { ...c, debt, credit };
    });
  }
  if (_isList(out.suppliers)) {
    const pv = prevMap('suppliers', 'debt');
    out.suppliers = out.suppliers.map(s => {
      if (!s || s.id == null) return s;
      const k = String(s.id);
      const db = ledger.suppliers.get(k) || { debt: 0, paid: num(s.paid) };
      const sent = r4(s.debt);
      if (sent !== db.debt && sent !== r4(pv.get(k))) tampered.push('suppliers.' + k);
      const cur = db.debtCur === 'UZS' ? { debtCur: 'UZS', debtUzs: db.debtUzs } : { debtCur: 'USD', debtUzs: 0 };   // v25 (44): faqat bazadan
      return { ...s, debt: db.debt, paid: ledger.suppliers.has(k) ? db.paid : num(s.paid), ...cur };
    });
  }
  if (_isList(out.batches)) {
    const pq = prevMap('batches', 'qty'), ps = prevMap('batches', 'sold');
    const list = [];
    for (const b of out.batches) {
      if (!b || b.id == null) { list.push(b); continue; }
      const k = String(b.id);
      const db = ledger.batches.get(k);
      if (!db) {
        // bazada yo'q partiya — qoldig'i 0 (kirim faqat server amali orqali)
        if (num(b.qty) - num(b.sold) !== 0 && !(pq.has(k) && num(pq.get(k)) === num(b.qty) && num(ps.get(k)) === num(b.sold))) tampered.push('batches.' + k);
        list.push({ ...b, qty: 0, sold: 0, status: 'empty' });
        continue;
      }
      if (db.status === 'deleted') continue;                              // serverda o'chirilgan — ro'yxatdan chiqadi
      if ((num(b.qty) !== db.qty || num(b.sold) !== db.sold) && !(num(pq.get(k)) === num(b.qty) && num(ps.get(k)) === num(b.sold))) tampered.push('batches.' + k);
      list.push({ ...b, qty: db.qty, sold: db.sold, status: db.status, costUsd: db.costUsd });
    }
    // v24.6 (36): filiallar o'tkazmasi partiyalari («tr…») — SERVER yaratadi (jo'natuvchi boshqa filial bo'lishi mumkin,
    // u bu filialning JSON'iga yoza olmaydi). JSON'da yo'q bo'lsa — bazadagi holati bilan ro'yxatga qo'shiladi.
    const have = new Set(list.filter(x => x && x.id != null).map(x => String(x.id)));
    for (const [k, db] of ledger.batches) {
      if (!/^trb?\d+-\d+$/.test(k) || have.has(k) || db.status === 'deleted' || !db.pid) continue;
      list.push({ id: k, pid: db.pid, bno: db.bno, origin: db.origin, cur: 'USD', qty: db.qty, sold: db.sold, costUsd: db.costUsd,
        bankFeeUsd: 0, date: db.date, status: db.status, fromBranch: db.fromBranch, consignment: false, items: [] });
    }
    out.batches = list;
  }
  if (_isList(out.sales)) {
    const list = [];
    for (const s of out.sales) {
      if (!s || s.id == null) { list.push(s); continue; }
      const db = ledger.sales.get(String(s.id));
      if (!db) { list.push(s); continue; }
      if (db.status === 'voided') continue;                              // serverda o'chirilgan savdo
      const items = _isList(s.items) ? s.items.map((it, i) => {
        const di = _isList(db.items) ? db.items[i] : null;
        if (!it || !di || num(di.pid) !== num(it.pid)) return it;
        const qty = num(di.qty), sellUsd = num(di.sell_usd);
        return { ...it, qty, sellUsd, lineUsd: qty * sellUsd };
      }) : s.items;
      list.push({ ...s, items, subtotalUsd: num(db.subtotal_usd), disc: num(db.disc_pct), discUsd: db.disc_usd == null ? s.discUsd : num(db.disc_usd),
        totalUsd: num(db.total_usd), paidUsd: num(db.paid_usd), debtUsd: num(db.debt_usd), profitUsd: num(db.profit_usd),
        // v24.8 (K2): tannarxni ko'rmaydigan xodim yozgan savdoda costUsd yo'q — bazadagi summa va foydadan
        ...(s.costUsd == null ? { costUsd: r4(num(db.total_usd) - num(db.profit_usd)) } : {}),
        ...(db.edited_at ? { edited: true } : {}) });
    }
    out.sales = list;
  }
  // Hisobdan chiqarish — faqat bazadagi hujjatlar (brauzer yozgan ro'yxat e'tiborga olinmaydi)
  if (Array.isArray(ledger.writeoffs)) out.writeoffs = ledger.writeoffs;
  return { branch: out, tampered };
}

// stock_writeoffs qatori → brauzer formati
function writeoffRowToClient(r) {
  return { id: r.local_id, docNo: r.doc_no, reason: r.reason, note: r.note || '', date: r.wo_date ? String(r.wo_date).slice(0, 10) : null,
    status: r.status, units: num(r.units), totalCostUsd: r4(r.total_cost_usd), staffName: r.staff_name || null,
    createdAt: r.created_at || null, cancelledAt: r.cancelled_at || null, cancelStaff: r.cancel_staff || null, cancelNote: r.cancel_note || null,
    items: (Array.isArray(r.items) ? r.items : []).map(i => ({ pid: num(i.pid), sku: i.sku || '', name: i.name || '', qty: num(i.qty), cost: r4(i.cost) })) };
}

// Brauzerga javob uchun ixcham ko'rinish: { customers:{id:debt}, suppliers:{id:{debt,paid}}, batches:[...] }
function ledgerSnapshot(ledger) {
  if (!ledger) return null;
  return {
    customers: Object.fromEntries(ledger.customers),
    suppliers: Object.fromEntries(ledger.suppliers),
    batches: [...ledger.batches].map(([localId, b]) => ({ localId, ...b })),
  };
}

// Biznes xatosi (P0001) matni — "LEDGER: " / "CASHBOX: " prefiksisiz
function cleanBizMessage(msg) { return String(msg || '').replace(/^(LEDGER|CASHBOX):\s*/, ''); }

module.exports = { ledgerAuthorityOn, loadLedger, overlayBranchLedger, ledgerSnapshot, cleanBizMessage, writeoffRowToClient, _resetLedgerAuthorityCache };
