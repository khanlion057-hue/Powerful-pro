// Netlify Function — OMBOR VA QARZ AMALLARI (savdodan tashqari) (v23.2, F4b; 27-migratsiya).
//
// Brauzer qarz yoki qoldiqning YAKUNIY qiymatini yubormaydi — faqat amalni so'raydi:
//   cust_set / supp_set — qo'lda qarz (yangi mijoz/ta'minotchining boshlang'ich qarzi yoki tahrir)
//   batches_create      — kirim, Excel import, boshlang'ich qoldiq, dillerdan qaytgan tovar
//   batch_edit          — partiya miqdori/tannarxi (ta'minotchi qarzi farqi SERVERDA hisoblanadi)
//   batch_delete        — partiyani o'chirish (tarix saqlanadi, FIFO'dan chiqadi)
//   batch_arrive        — yo'ldagi partiya keldi (+ bojxona ulushi)
//   revision            — reviziya: tizimdagi qoldiq SERVERDA hisoblanadi, farq qo'llanadi
//   stock_out           — Bazadan filialga ko'chirish yoki dillerga jo'natish (FIFO serverda)
// Hammasi stock_debt_op() orqali BITTA tranzaksiyada, `key` bilan idempotent. Javobda bazadagi haqiqiy
// qarzlar va partiya qoldiqlari qaytadi. 27-migratsiyasiz — 409 { migrationPending:true }.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError, logSecurityEvent } = require('./_lib/supabaseAdmin');
const { ledgerAuthorityOn } = require('./_lib/ledgerAuthority');
const { legacyDealerBlocked } = require('./_lib/dealerAtomic');

const ID_RE = /^[0-9A-Za-z_.:-]{1,64}$/;
const isNum = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

// Amal → ruxsat (biri yetarli). admin:true — faqat administrator.
function permsFor(kind, p) {
  switch (kind) {
    case 'cust_set': return { perms: ['mijozlar.edit'] };
    case 'supp_set': return { perms: ['taminotchilar.edit'] };
    case 'supp_cur': return { perms: ['taminotchilar.edit'] };   // v25 (44): ta'minotchi qarz valyutasi ($ / so'm)
    case 'batches_create':
      if (p.reason === 'dealer_return') return { perms: ['dillerlar.manage'] };
      if (p.reason === 'opening') return { perms: ['kirim.create', 'ombor.edit'] };
      return { perms: ['kirim.create'] };
    case 'batch_edit': case 'batch_delete': case 'batch_arrive': return { perms: ['kirim.create', 'ombor.edit'] };
    case 'revision': return { perms: ['ombor.edit'] };
    // v25 (41): so'mda hisob — belgilash (kirim) yoki bugungi kurs bo'yicha $ tannarxni yangilash (kurs — serverdagi sozlamadan)
    case 'acc_uzs': return (p && Array.isArray(p.mark) && p.mark.length) ? { perms: ['kirim.create', 'ombor.edit'] } : { perms: ['kirim.create', 'ombor.edit', 'savdo.create', 'kassalar.transact'] };
    case 'stock_out': return p.reason === 'transfer' ? { admin: true } : { perms: ['dillerlar.manage', 'dillerlar.orders'] };
    default: return null;
  }
}

function cleanMeta(m) {
  const o = m && typeof m === 'object' ? m : {};
  const out = {};
  for (const k of ['bno', 'origin', 'performedBy']) if (o[k] != null) out[k] = String(o[k]).slice(0, k === 'bno' ? 20 : 300);
  if (typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date)) out.date = o.date;
  if (o.cur != null && ['USD', 'UZS', 'CNY', 'KRW'].includes(o.cur)) out.cur = o.cur;
  for (const k of ['bankFeeUsd', 'rateUsdUzs', 'rateUsdCny']) if (isNum(o[k], 0, 1e9)) out[k] = o[k];
  return out;
}

function validate(b) {
  if (!b || typeof b !== 'object') return "Noto'g'ri so'rov formati";
  if (typeof b.key !== 'string' || !/^[A-Za-z0-9:_.-]{6,100}$/.test(b.key)) return "Amal kaliti (key) noto'g'ri";
  const p = b.payload;
  if (!p || typeof p !== 'object') return "Amal ma'lumoti yo'q";
  if (!permsFor(b.kind, p)) return "Noma'lum amal";
  const list = (a, max) => Array.isArray(a) && a.length >= 1 && a.length <= max;
  switch (b.kind) {
    case 'cust_set': case 'supp_set': {
      const id = b.kind === 'cust_set' ? p.customerId : p.supplierId;
      if (!Number.isSafeInteger(id) || id <= 0) return b.kind === 'cust_set' ? "Mijoz noto'g'ri" : "Ta'minotchi noto'g'ri";
      if (!isNum(p.debt, 0, 1e12)) return "Qarz manfiy bo'lmasligi kerak";
      if (p.name != null && String(p.name).length > 200) return 'Nom juda uzun';
      return null;
    }
    case 'batches_create':
      if (!['kirim', 'import', 'opening', 'dealer_return'].includes(p.reason)) return "Kirim turi noto'g'ri";
      if (!list(p.batches, 500)) return "Partiyalar ro'yxati noto'g'ri";
      for (const x of p.batches) {
        if (!x || !ID_RE.test(String(x.localId)) || !Number.isSafeInteger(x.pid) || x.pid <= 0) return "Partiya noto'g'ri";
        if (!isNum(x.qty, 1e-9, 1e7) || !isNum(x.costUsd, 0, 1e7)) return "Partiya miqdori yoki tannarxi noto'g'ri";
      }
      if (p.supplier != null) {
        const s = p.supplier;
        if (typeof s !== 'object' || !(s.id == null || (Number.isSafeInteger(s.id) && s.id > 0))) return "Ta'minotchi noto'g'ri";
        if (s.goodsUsd != null && !isNum(s.goodsUsd, 0, 1e12)) return "Tovar qiymati noto'g'ri";
        if (s.givenUsd != null && !isNum(s.givenUsd, 0, 1e12)) return "To'langan summa noto'g'ri";
      }
      for (const k of ['kirimRef', 'fkRef']) if (p[k] != null && !/^[A-Za-z0-9:_.-]{1,64}$/.test(String(p[k]))) return "Kirim havolasi noto'g'ri";
      return null;
    case 'batch_edit':
      if (!list(p.edits, 500)) return "Tahrir ro'yxati noto'g'ri";
      for (const e of p.edits) if (!e || !ID_RE.test(String(e.localId)) || !isNum(e.qty, 0, 1e7) || !isNum(e.costUsd, 0, 1e7)) return "Partiya tahriri noto'g'ri";
      return null;
    case 'batch_delete': case 'batch_arrive':
      if (!list(p.localIds, 500) || p.localIds.some(x => !ID_RE.test(String(x)))) return "Partiyalar ro'yxati noto'g'ri";
      if (b.kind === 'batch_arrive' && p.costAdds != null && (typeof p.costAdds !== 'object' || Object.values(p.costAdds).some(v => !isNum(v, 0, 1e6)))) return "Bojxona ulushi noto'g'ri";
      return null;
    case 'revision':
      if (!list(p.facts, 5000)) return "Reviziya ro'yxati noto'g'ri";
      for (const f of p.facts) if (!f || !Number.isSafeInteger(f.pid) || f.pid <= 0 || !isNum(f.fact, 0, 1e7)) return "Reviziya qatori noto'g'ri";
      if (p.surplusIds != null && (typeof p.surplusIds !== 'object' || Object.values(p.surplusIds).some(x => !ID_RE.test(String(x))))) return "Partiya ID'lari noto'g'ri";
      return null;
    case 'stock_out':
      if (!['transfer', 'dealer'].includes(p.reason)) return "Amal turi noto'g'ri";
      if (!list(p.items, 500)) return "Mahsulotlar ro'yxati noto'g'ri";
      for (const i of p.items) if (!i || !Number.isSafeInteger(i.pid) || i.pid <= 0 || !isNum(i.qty, 1e-9, 1e7)) return "Mahsulot qatori noto'g'ri";
      if (p.reason === 'transfer') {
        if (typeof p.target !== 'string' || !/^[a-z0-9_]{1,40}$/.test(p.target)) return "Filial noto'g'ri";
        if (!list(p.targetBatches, 500)) return "Filial partiyalari yo'q";
        for (const x of p.targetBatches) if (!x || !ID_RE.test(String(x.localId)) || !Number.isSafeInteger(x.pid) || !isNum(x.qty, 1e-9, 1e7) || !isNum(x.costUsd, 0, 1e7)) return "Filial partiyasi noto'g'ri";
      }
      return null;
    case 'supp_cur':
      if (!Number.isSafeInteger(p.supplierId) || p.supplierId <= 0) return "Ta'minotchi noto'g'ri";
      if (!['USD', 'UZS'].includes(p.currency)) return "Valyuta noto'g'ri";
      return null;
    case 'acc_uzs':
      if (p.mark != null && (!Array.isArray(p.mark) || p.mark.length > 500 || p.mark.some(x => !ID_RE.test(String(x))))) return "Partiyalar ro'yxati noto'g'ri";
      if (!(Array.isArray(p.mark) && p.mark.length) && !p.reprice) return "Amal ma'lumoti yo'q";
      return null;
    default: return "Noma'lum amal";
  }
}

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const body = parseBody(event);
  const vErr = validate(body);
  if (vErr) return json({ error: vErr }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'stock-debt-ops', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { loadPermissions: true, fn: 'stock-debt-ops' });
  if (!auth.ok) return auth.response;
  const rule = permsFor(body.kind, body.payload);
  const allowed = auth.isAdmin || (!rule.admin && rule.perms.some(p => auth.permKeys.has(p)));
  if (!allowed) {
    await logSecurityEvent(admin, auth.staff, 'permission_denied', { need: rule.admin ? 'admin' : rule.perms, fn: 'stock-debt-ops', kind: body.kind });
    return json({ error: rule.admin ? 'Bu amal faqat administrator uchun' : "Bu amal uchun ruxsatingiz yo'q" }, 403);
  }
  // v24.5 (35-migratsiya): dillerga jo'natish va dillerdan qaytish — faqat dealer-ops orqali (firma ombori va diller
  // ombori bitta tranzaksiyada). 35 bo'lsa bu yerdagi alohida yo'l yopiladi: yangilanmagan (eski) sahifa tovarni
  // firma omboridan chiqarib/kiritib, diller omboriga yoza olmay qolmasin.
  if ((body.kind === 'stock_out' && body.payload.reason === 'dealer') || (body.kind === 'batches_create' && body.payload.reason === 'dealer_return')) {
    try { const blocked = await legacyDealerBlocked(admin, 'stock-debt-ops (diller)'); if (blocked) return blocked; }
    catch (e) { return serverError(e, 'stock-debt-ops', 'Server xatosi'); }
  }
  const filial = resolveFilial(auth, body.filial);
  const p = body.payload;
  let payload;
  switch (body.kind) {
    case 'cust_set': payload = { customerId: p.customerId, debt: p.debt, reason: p.reason === 'opening' ? 'opening' : 'adjust', name: p.name != null ? String(p.name).slice(0, 200) : null }; break;
    case 'supp_set': payload = { supplierId: p.supplierId, debt: p.debt, reason: p.reason === 'opening' ? 'opening' : 'adjust', name: p.name != null ? String(p.name).slice(0, 200) : null }; break;
    case 'batches_create':
      payload = { reason: p.reason, kirimRef: p.kirimRef != null ? String(p.kirimRef) : null, fkRef: p.fkRef != null ? String(p.fkRef) : null,
        batches: p.batches.map(x => ({ localId: String(x.localId), pid: x.pid, qty: x.qty, costUsd: x.costUsd, status: x.status === 'transit' ? 'transit' : 'active', meta: cleanMeta(x.meta) })),
        supplier: p.supplier ? { id: p.supplier.id ?? null, consignment: !!p.supplier.consignment, goodsUsd: p.supplier.goodsUsd ?? 0, givenUsd: p.supplier.givenUsd ?? 0 } : null };
      break;
    case 'batch_edit': payload = { edits: p.edits.map(e => ({ localId: String(e.localId), qty: e.qty, costUsd: e.costUsd })) }; break;
    case 'batch_delete': payload = { localIds: p.localIds.map(String) }; break;
    case 'batch_arrive': payload = { localIds: p.localIds.map(String), costAdds: p.costAdds || {} }; break;
    case 'revision': payload = { facts: p.facts.map(f => ({ pid: f.pid, fact: f.fact })), apply: !!p.apply, surplusIds: p.surplusIds || {}, meta: cleanMeta(p.meta) }; break;
    case 'stock_out':
      payload = { reason: p.reason, items: p.items.map(i => ({ pid: i.pid, qty: i.qty })), dealerId: p.dealerId != null ? String(p.dealerId).slice(0, 40) : null };
      if (p.reason === 'transfer') {
        payload.target = p.target;
        payload.targetBatches = p.targetBatches.map(x => ({ localId: String(x.localId), pid: x.pid, qty: x.qty, costUsd: x.costUsd, bno: x.bno != null ? String(x.bno).slice(0, 20) : null,
          date: typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : null }));
        const ts = p.transferSale;
        if (ts && typeof ts === 'object' && ID_RE.test(String(ts.localId)) && typeof ts.inv === 'string' && ts.inv.length <= 40 && Array.isArray(ts.items) && ts.items.length <= 500) {
          payload.transferSale = { localId: String(ts.localId), inv: ts.inv, custName: String(ts.custName || '').slice(0, 200),
            items: ts.items.filter(i => i && Number.isSafeInteger(i.pid) && isNum(i.qty, 0, 1e7) && isNum(i.sellUsd, 0, 1e9))
              .map(i => ({ pid: i.pid, sku: String(i.sku || '').slice(0, 80), name: String(i.name || '').slice(0, 300), qty: i.qty, sellUsd: i.sellUsd })) };
        }
      }
      break;
  }

  try {
    if (body.kind === 'supp_cur') {
      const r = await admin.rpc('supp_set_currency', { p_filial: filial, p_supp: p.supplierId, p_currency: p.currency,
        p_staff_id: auth.isAdmin ? null : (auth.staff?.id ?? null), p_staff_name: auth.staff?.name || (auth.isAdmin ? 'Admin' : null) });
      if (r.error) {
        if (r.error.code === 'PGRST202' || r.error.code === '42883' || /supp_set_currency/.test(String(r.error.message || ''))) return json({ error: "So'mdagi ta'minotchi qarzi uchun 44-migratsiya qo'llanishi kerak", code: 'MIGRATION44_PENDING' }, 409);
        return serverError(r.error, 'stock-debt-ops', 'Amal bajarilmadi', 400);
      }
      return json({ ...r.data, filial, ledger: true }, 200);
    }
    if (body.kind === 'acc_uzs') {
      const mark = Array.isArray(p.mark) ? p.mark.slice(0, 500).map(String).filter(x => ID_RE.test(x)) : [];
      const r = await admin.rpc('batch_acc_uzs', { p_filial: filial, p_mark: mark, p_reprice: !!p.reprice });
      if (r.error) {
        if (r.error.code === 'PGRST202' || r.error.code === '42883' || /batch_acc_uzs/.test(String(r.error.message || ''))) return json({ error: "So'mda hisob uchun 41-migratsiya qo'llanishi kerak", code: 'MIGRATION41_PENDING' }, 409);
        return serverError(r.error, 'stock-debt-ops', 'Amal bajarilmadi', 400);
      }
      return json({ ...r.data, filial, ledger: true }, 200);
    }
    if (!(await ledgerAuthorityOn(admin))) {
      return json({ error: "Bu amal uchun 27-migratsiya qo'llanishi kerak", migrationPending: true }, 409);
    }
    const { data, error } = await admin.rpc('stock_debt_op', {
      p_filial: filial, p_op_key: body.key, p_kind: body.kind, p_payload: payload,
      p_staff_id: auth.isAdmin ? null : (auth.staff?.id ?? null), p_staff_name: auth.staff?.name || (auth.isAdmin ? 'Admin' : null),
    });
    if (error) return serverError(error, 'stock-debt-ops', 'Amal bajarilmadi', 400);
    return json({ ...data, filial, ledger: true }, 200);
  } catch (e) {
    return serverError(e, 'stock-debt-ops', 'Server xatosi');
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('stock-debt-ops', exports.handler);
