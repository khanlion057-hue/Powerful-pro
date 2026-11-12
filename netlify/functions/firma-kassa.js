// Netlify Function — FIRMA KASSA (v10, 23-migratsiya).
// Korxona darajasidagi markaziy kassa — filial kassalaridan (app_data JSON ichidagi
// cashboxes) ALOHIDA, server tomonidagi haqiqiy ledger. Barcha pul harakatlari
// bazadagi atomik funksiyalar orqali: qoldiq qulflanadi, manfiyga tushmaydi,
// idem_key bilan takroriy so'rov ikkinchi marta yozilmaydi.
//
// Amallar (POST { action, ... }):
//   state          — qoldiqlar, qolgan avanslar, oxirgi harakatlar     [firma_kassa.view]
//   kirim_check    — Kirim to'lovi uchun mablag' yetarlimi              [firma_kassa.view]
//   move           — deposit / withdraw (adjust_in/out — faqat admin)   [firma_kassa.transact]
//   branch_in      — filial kassasidan Bosh kassaga                    [firma_kassa.transact]
//   branch_out     — Bosh kassadan filial kassasiga                    [firma_kassa.transact]
//   advance_give   — avans berish (xodim/ta'minotchi/filial/diller)     [firma_kassa.transact]
//   advance_repay  — avans qaytarilishi (qolgan avansdan oshmaydi)      [firma_kassa.transact]
//   kirim_pay      — Kirim (import) uchun ta'minotchiga to'lov          [firma_kassa.transact + kirim.create]
//   partner_withdrawal — hamkor (ta'sischi) pul olishi (maosh EMAS)     [faqat admin]
//   branch_pay     — filialning BAZAGA QARZI to'lovi: filial kassasi → Bosh kassa
//                    + qarz kamayadi                                    [firma_kassa.transact yoki kassalar.transact]
//   branch_loan_give  — v23: filial Bazadan (Bosh kassadan) QARZ oladi  [firma_kassa.transact]
//   branch_loan_repay — v23: filial qarzni qaytaradi                    [firma_kassa.transact yoki kassalar.transact]
//   branch_summary — v23: filiallarning Bazaga qarzlari (tovar + pul)   [firma_kassa.view; filial xodimi — faqat o'ziniki]
//   reverse        — v23: yozuvni TESKARI yozuv bilan bekor qilish     [faqat admin]
//   reconcile      — v23: Kirimga bog'lanmagan Bosh kassa to'lovlari  [firma_kassa.view]
//   move op=opening — v23: boshlang'ich qoldiq                          [faqat admin]
//   daily_close    — v23.4: kunlik yopish («uyga berish»): filial kassasi → Bosh kassa (pul firmada qoladi);
//                    v23.7: sotuvchi (savdo.create) ham — faqat o'z filiali, Shaxsiy/diller kassasisiz
//                                                                      [kassalar.transact yoki firma_kassa.transact]
//   expense        — v23.4 (28): Bosh kassadan xarajat (hamkor kirimi — Bosh kassaga kirim)
//                                                                      [firma_kassa.transact + xarajatlar.create]
//   expense_reverse — v23.4 (28): Bosh kassadagi xarajat yozuvini bekor qilish (Xarajatlar bo'limidan o'chirilganda)
//                                                                      [firma_kassa.transact + xarajatlar.create]
//   supplier_pay   — v23.4 (28): ta'minotchi qarzini Bosh kassadan to'lash — kassa + qarz bitta tranzaksiyada
//                                                                      [firma_kassa.transact + taminotchilar.edit yoki kirim.create]
//
// v11 (24-migratsiya, B7/F4): branch_in / branch_out / branch_pay — IKKALA tomon
// (filial kassasi va Bosh kassa) va filial qarzi BITTA bazaviy tranzaksiyada
// (branch_firma_transfer): biri bajarilmasa — hech biri bajarilmaydi. Avval faqat
// Bosh kassa tomoni serverda edi, filial kassasini brauzer o'zi o'zgartirardi.
//
// Hisob valyutasi faqat USD yoki UZS (CNY rad etiladi — bazada ham CHECK).
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError, logSecurityEvent } = require('./_lib/supabaseAdmin');
const { cashAuthorityOn, isMissingFunction, loadBranchBoxes } = require('./_lib/cashAuthority');

const CURRENCIES = ['USD', 'UZS'];
const CP_TYPES = ['branch', 'supplier', 'staff', 'dealer', 'other'];
const READ_ACTIONS = ['state', 'kirim_check', 'branch_summary', 'reconcile'];
const WRITE_ACTIONS = ['move', 'branch_in', 'branch_out', 'branch_pay', 'branch_loan_give', 'branch_loan_repay', 'advance_give', 'advance_repay', 'kirim_pay', 'partner_withdrawal', 'reverse',
  'daily_close', 'expense', 'expense_reverse', 'supplier_pay'];
// Filial xodimi ham bajara oladigan amallar (pul filialdan FIRMAGA ketadi yoki faqat o'z filiali ko'rinadi)
const BRANCH_STAFF_ACTIONS = ['branch_pay', 'branch_loan_repay', 'branch_summary', 'daily_close'];
const BRANCH_ACTIONS = ['branch_in', 'branch_out', 'branch_pay', 'branch_loan_give', 'branch_loan_repay', 'daily_close'];

const str = (v, max) => (v == null ? null : String(v).slice(0, max));
const isAmount = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1e12;

function validate(b) {
  if (!READ_ACTIONS.includes(b.action) && !WRITE_ACTIONS.includes(b.action)) return "Noma'lum amal";
  if (b.action === 'state' || b.action === 'branch_summary' || b.action === 'reconcile') return null;
  if (b.action === 'reverse' || b.action === 'expense_reverse') {
    if (!Number.isSafeInteger(b.entryId) || b.entryId <= 0) return "Yozuv noto'g'ri";
    if (typeof b.idemKey !== 'string' || !b.idemKey || b.idemKey.length > 100) return 'idemKey majburiy';
    if (b.note != null && String(b.note).length > 500) return 'Izoh juda uzun';
    return null;
  }
  if (!CURRENCIES.includes(b.currency)) return "Valyuta faqat USD yoki UZS bo'lishi mumkin (CNY hisob valyutasi emas)";
  if (!isAmount(b.amount)) return "Summa musbat son bo'lishi kerak";
  if (b.action === 'kirim_check') return null;
  if (typeof b.idemKey !== 'string' || !b.idemKey || b.idemKey.length > 100) return 'idemKey majburiy';
  if (b.note != null && String(b.note).length > 500) return 'Izoh juda uzun';
  if (b.action === 'move' && !['deposit', 'withdraw', 'adjust_in', 'adjust_out', 'opening'].includes(b.op)) return "Amal turi noto'g'ri";
  if (b.action === 'advance_give' || b.action === 'advance_repay') {
    if (!CP_TYPES.includes(b.cpType) || !b.cpId || String(b.cpId).length > 64) return "Avans oluvchi noto'g'ri";
  }
  if (b.action === 'partner_withdrawal' && (!b.cpId || String(b.cpId).length > 64)) return "Hamkor ko'rsatilmagan";
  if (BRANCH_ACTIONS.includes(b.action) && b.boxId != null && (!Number.isSafeInteger(b.boxId) || b.boxId < 0)) return "Kassa noto'g'ri";
  if ((b.action === 'branch_pay' || b.action === 'branch_loan_give' || b.action === 'branch_loan_repay' || b.action === 'daily_close') && b.boxId == null) return 'Kassa tanlanmagan';
  if (b.action === 'expense') {
    if (b.dir != null && !['out', 'in'].includes(b.dir)) return "Yo'nalish noto'g'ri";
    if (!b.refId || String(b.refId).length > 64) return 'Xarajat ID majburiy';
  }
  if (b.action === 'supplier_pay' && !(Number.isSafeInteger(b.suppId) && b.suppId > 0)) return "Ta'minotchi noto'g'ri";
  return null;
}

function rowOut(r) {
  if (!r) return null;
  return {
    id: r.id, createdAt: r.created_at, currency: r.currency, direction: r.direction, amount: Number(r.amount),
    balanceAfter: Number(r.balance_after), op: r.op_type, cpType: r.counterparty_type, cpId: r.counterparty_id,
    cpName: r.counterparty_name, filial: r.filial, refType: r.ref_type, refId: r.ref_id, note: r.note, staffName: r.staff_name,
    sourceType: r.source_type || null, sourceRef: r.source_ref || null, reversalOf: r.reversal_of || null, reversedBy: r.reversed_by || null
  };
}

// v25 (44): so'mdagi ta'minotchi — to'lovdan keyingi aniq qarz so'mda (44 bo'lmasa — hech narsa qo'shilmaydi)
async function suppCurOf(admin, filial, supp) {
  try {
    const { data, error } = await admin.from('supplier_balances').select('currency,debt_uzs').eq('filial', filial).eq('supplier_local_id', supp).maybeSingle();
    if (error || !data) return {};
    return data.currency === 'UZS' ? { supplierDebtCur: 'UZS', supplierDebtUzs: Number(data.debt_uzs) || 0 } : { supplierDebtCur: 'USD' };
  } catch (_) { return {}; }
}

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body || typeof body !== 'object') return json({ error: "Noto'g'ri so'rov formati" }, 400);
  const vErr = validate(body);
  if (vErr) return json({ error: vErr }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'firma-kassa', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const isWrite = WRITE_ACTIONS.includes(body.action);
  // Filial qarzini to'lash/qaytarish — filial kassiri ham bajara oladi (pul filialdan firmaga KETADI);
  // filial hisoboti — xodim faqat o'z filialini ko'radi
  const branchStaffAction = BRANCH_STAFF_ACTIONS.includes(body.action);
  const auth = branchStaffAction
    ? await requireStaffAuth(event, admin, { loadPermissions: true, fn: 'firma-kassa' })
    : await requireStaffAuth(event, admin, { permission: isWrite ? 'firma_kassa.transact' : 'firma_kassa.view', fn: 'firma-kassa' });
  if (!auth.ok) return auth.response;
  if (branchStaffAction && !auth.isAdmin) {
    // v23.7: kunlik yopishni sotuvchi ham bajaradi (savdo.create) — pul faqat o'z filiali kassasidan Bosh kassaga o'tadi (tizimda qoladi)
    const need = body.action === 'branch_summary' ? ['firma_kassa.view', 'kassalar.transact', 'kassalar.view']
      : body.action === 'daily_close' ? ['firma_kassa.transact', 'kassalar.transact', 'savdo.create'] : ['firma_kassa.transact', 'kassalar.transact'];
    if (!need.some(k => auth.permKeys.has(k))) {
      await logSecurityEvent(admin, auth.staff, 'permission_denied', { need, fn: 'firma-kassa', action: body.action });
      return json({ error: "Bu amal uchun ruxsatingiz yo'q" }, 403);
    }
  }
  if (body.action === 'reverse' && !auth.isAdmin) return json({ error: 'Bekor qilish faqat administrator uchun' }, 403);
  // v23.4: Bosh kassadan xarajat / ta'minotchi to'lovi — Bosh kassa huquqi + o'sha bo'limning yozish huquqi
  const SECOND = { expense: ['xarajatlar.create'], expense_reverse: ['xarajatlar.create'], supplier_pay: ['taminotchilar.edit', 'kirim.create'] };
  if (SECOND[body.action] && !auth.isAdmin && !SECOND[body.action].some(k => auth.permKeys.has(k))) {
    await logSecurityEvent(admin, auth.staff, 'permission_denied', { need: SECOND[body.action], fn: 'firma-kassa', action: body.action });
    return json({ error: "Bu amal uchun ruxsatingiz yo'q" }, 403);
  }
  if (body.action === 'move' && body.op === 'opening' && !auth.isAdmin) return json({ error: 'Bu amal faqat administrator uchun' }, 403);

  const { action } = body;
  if (action === 'kirim_pay' && !auth.isAdmin && !auth.permKeys.has('kirim.create')) {
    return json({ error: "Kirim qilish huquqingiz yo'q" }, 403);
  }
  if ((action === 'partner_withdrawal' || (action === 'move' && body.op.startsWith('adjust'))) && !auth.isAdmin) {
    return json({ error: 'Bu amal faqat administrator uchun' }, 403);
  }

  const staff = { p_staff_id: auth.isAdmin ? null : (auth.staff?.id ?? null), p_staff_name: auth.staff?.name || (auth.isAdmin ? 'Admin' : null) };

  try {
    if (action === 'state') {
      const limit = Math.min(Math.max(parseInt(body.limit, 10) || 50, 1), 200);
      const offset = Math.min(Math.max(parseInt(body.offset, 10) || 0, 0), 100000);
      const [{ data: st, error: e1 }, { data: rows, error: e2 }] = await Promise.all([
        admin.rpc('firma_kassa_get_balance'),
        admin.from('firma_kassa_ledger').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + limit - 1),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return json({ balances: (st && st.balances) || {}, advances: (st && st.advances) || [], ledger: (rows || []).map(rowOut) }, 200);
    }

    if (action === 'branch_summary') {
      // Filial xodimi — faqat o'z filiali; Bosh kassa huquqi bor xodim/admin — hammasi (yoki tanlangani)
      const all = auth.isAdmin || auth.permKeys.has('firma_kassa.view');
      const want = all ? (str(body.filial, 40) || null) : auth.filial;
      const { data, error } = await admin.rpc('firma_kassa_branch_summary', { p_filial: want });
      if (error && isMissingFunction(error)) return json({ branches: [], migrationPending: true }, 200);
      if (error) throw error;
      return json({ branches: Array.isArray(data) ? data : [] }, 200);
    }

    if (action === 'reconcile') {
      // Kirim uchun Bosh kassadan to'langan, lekin hech bir partiyaga (fkRef) bog'lanmagan yozuvlar —
      // "yetim" to'lovlar (masalan to'lovdan keyin brauzer yopilib, Kirim saqlanmay qolgan)
      const { data: pays, error: e1 } = await admin.from('firma_kassa_ledger').select('id,created_at,currency,amount,ref_id,counterparty_name,note,staff_name,reversed_by,op_type').eq('op_type', 'kirim_payment');
      if (e1) throw e1;
      const { data: rows, error: e2 } = await admin.from('app_data_branches').select('branch_key,data');
      if (e2) throw e2;
      // Filial ma'lumoti ikki joyda bo'lishi mumkin: app_data_branches (ustun) va app_data.branchStore (eski)
      const { data: main, error: e3 } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
      if (e3) throw e3;
      const refs = new Set();
      const addBatches = (list) => (Array.isArray(list) ? list : []).forEach(b => { if (b && b.fkRef) refs.add(String(b.fkRef)); });
      (rows || []).forEach(r => addBatches(r.data && r.data.batches));
      const store = (main && main.data && main.data.branchStore) || {};
      Object.keys(store).forEach(k => addBatches(store[k] && store[k].batches));
      const live = (pays || []).filter(p => !p.reversed_by);
      const orphans = live.filter(p => /^K-/.test(String(p.ref_id || '')) && !refs.has(String(p.ref_id)));
      const legacy = live.filter(p => !/^K-/.test(String(p.ref_id || '')));
      const pick = (p) => ({ id: p.id, createdAt: p.created_at, currency: p.currency, amount: Number(p.amount), ref: p.ref_id, supplier: p.counterparty_name, staffName: p.staff_name });
      return json({ orphans: orphans.map(pick), legacyUnverifiable: legacy.length, checked: live.length }, 200);
    }

    if (action === 'reverse') {
      const { data, error } = await admin.rpc('firma_kassa_reverse', { p_entry_id: body.entryId, p_idem_key: `rv:${body.idemKey}`, p_note: str(body.note, 500), ...staff });
      if (error && isMissingFunction(error)) return json({ error: "Bu amal uchun 25-migratsiya qo'llanishi kerak" }, 409);
      if (error) return serverError(error, 'firma-kassa', 'Bekor qilinmadi', 400);
      return json({ ok: true, entry: rowOut(Array.isArray(data) ? data[0] : data) }, 200);
    }

    if (action === 'kirim_check') {
      const { data, error } = await admin.rpc('kirim_firma_kassa_check', { p_currency: body.currency, p_amount: body.amount });
      if (error) throw error;
      return json(data || { ok: false }, 200);
    }

    // v11: filial kassasi ↔ Bosh kassa — ikkala tomon bitta tranzaksiyada (24-migratsiya)
    if (BRANCH_ACTIONS.includes(action) && body.boxId != null) {
      if (!(await cashAuthorityOn(admin))) {
        if (action === 'branch_pay' || action.startsWith('branch_loan') || action === 'daily_close') return json({ error: "Bu amal uchun 24-migratsiya qo'llanishi kerak — administratorga murojaat qiling" }, 409);
      } else {
        const filial = (action === 'branch_pay' || action.startsWith('branch_loan') || action === 'daily_close') ? resolveFilial(auth, body.filial)
          : (auth.isAdmin ? (str(body.filial, 40) || auth.filial) : auth.filial);
        if ((action === 'branch_pay' || action.startsWith('branch_loan')) && filial === 'baza') return json({ error: 'Bu amal faqat filial uchun' }, 400);
        const { boxes } = await loadBranchBoxes(admin, filial);
        const box = boxes.find(b => Number(b.id) === body.boxId);
        if (!box) return json({ error: 'Kassa topilmadi' }, 400);
        // Sotuvchi (kassa huquqisiz) — faqat oddiy savdo kassalari: Shaxsiy (qobiljon) va diller kassasi emas
        if (action === 'daily_close' && !auth.isAdmin && !['firma_kassa.transact', 'kassalar.transact'].some(k => auth.permKeys.has(k))
            && (box.type === 'qobiljon' || box.type === 'dealer')) return json({ error: 'Bu kassani yopish huquqingiz yoʻq' }, 403);
        if (box.cur !== body.currency) return json({ error: `Kassa valyutasi ${box.cur}, so'rovda ${body.currency}` }, 400);
        if (action.startsWith('branch_loan')) {
          const { data, error } = await admin.rpc('branch_firma_loan', {
            p_filial: filial, p_box: body.boxId, p_currency: body.currency, p_direction: action === 'branch_loan_give' ? 'give' : 'repay',
            p_amount: body.amount, p_key: `${action}:${body.idemKey}`, p_box_name: str(box.name, 200), p_note: str(body.note, 500), ...staff,
          });
          if (error && isMissingFunction(error)) return json({ error: "Bu amal uchun 25-migratsiya qo'llanishi kerak — administratorga murojaat qiling" }, 409);
          if (error) return serverError(error, 'firma-kassa', 'Amal bajarilmadi', 400);
          return json({ ok: true, authority: true, duplicate: !!(data && data.replay), loan: data,
            entry: { op: action === 'branch_loan_give' ? 'advance_give' : 'advance_repay', currency: body.currency, amount: data && Number(data.amount) } }, 200);
        }
        // v25 (43): filialning so'mdagi qarzi — alohida to'lov (so'm kassadan so'mma-so'm, $ kassadan bugungi kursda)
        if (action === 'branch_pay' && body.debtCur === 'UZS') {
          const { data, error } = await admin.rpc('branch_debt_pay_uzs', {
            p_filial: filial, p_box: body.boxId, p_currency: body.currency, p_amount: body.amount, p_key: `${action}:${body.idemKey}`,
            p_box_name: str(box.name, 200), p_note: str(body.note, 500), ...staff,
          });
          if (error && isMissingFunction(error)) return json({ error: "So'mdagi filial qarzi uchun 43-migratsiya qo'llanishi kerak", code: 'MIGRATION43_PENDING' }, 409);
          if (error) return serverError(error, 'firma-kassa', 'Amal bajarilmadi', 400);
          return json({ ok: true, authority: true, duplicate: !!(data && data.replay), transfer: data,
            entry: { op: 'branch_in', currency: body.currency, amount: data && Number(data.amount) } }, 200);
        }
        const { data, error } = await admin.rpc('branch_firma_transfer', {
          p_filial: filial, p_box: body.boxId, p_currency: body.currency,
          p_direction: action === 'branch_out' ? 'from_firma' : 'to_firma', p_amount: body.amount,
          p_key: `${action}:${body.idemKey}`, p_reduce_debt: action === 'branch_pay',
          p_box_name: str(box.name, 200), p_note: action === 'daily_close' ? str('Kunlik yopish' + (body.note ? ' — ' + body.note : ''), 500) : str(body.note, 500), ...staff,
        });
        if (error) return serverError(error, 'firma-kassa', 'Amal bajarilmadi', 400);
        return json({ ok: true, authority: true, duplicate: !!(data && data.replay), transfer: data,
          entry: { op: action === 'branch_out' ? 'branch_out' : 'branch_in', currency: body.currency, amount: data && Number(data.amount) } }, 200);
      }
    }

    if (action === 'expense_reverse') {
      const { data, error } = await admin.rpc('firma_kassa_reverse_expense', { p_entry_id: body.entryId, p_idem_key: str(body.idemKey, 100), p_note: str(body.note, 500), ...staff });
      if (error && isMissingFunction(error)) return json({ error: "Bu amal uchun 28-migratsiya qo'llanishi kerak — administratorga murojaat qiling" }, 409);
      if (error) return serverError(error, 'firma-kassa', 'Bekor qilinmadi', 400);
      return json({ ok: true, entry: rowOut(Array.isArray(data) ? data[0] : data) }, 200);
    }
    if (action === 'supplier_pay') {
      const filial = resolveFilial(auth, body.filial);
      const { data, error } = await admin.rpc('firma_supplier_pay', {
        p_filial: filial, p_supp: body.suppId, p_currency: body.currency, p_amount: body.amount, p_op_key: str(body.idemKey, 100),
        p_supp_name: str(body.cpName, 200), p_note: str(body.note, 500), ...staff });
      if (error && isMissingFunction(error)) return json({ error: "Bu amal uchun 28-migratsiya qo'llanishi kerak — administratorga murojaat qiling" }, 409);
      if (error) return serverError(error, 'firma-kassa', "To'lov bajarilmadi", 400);
      return json({ ok: true, payment: { ...data, ...(await suppCurOf(admin, filial, body.suppId)) } }, 200);
    }

    let rpc = '_fk_cash_move', args;
    const base = { p_currency: body.currency, p_amount: body.amount, p_note: str(body.note, 500), p_idem_key: `fk:${body.idemKey}`, ...staff };
    if (action === 'move') {
      const out = body.op === 'withdraw' || body.op === 'adjust_out';   // deposit / adjust_in / opening — kirim
      args = { ...base, p_direction: out ? 'out' : 'in', p_op_type: body.op };
    } else if (action === 'branch_in' || action === 'branch_out') {
      // Admin istalgan filial bilan, boshqa xodim — faqat o'z filiali bilan
      const filial = auth.isAdmin ? (str(body.filial, 40) || auth.filial) : auth.filial;
      args = { ...base, p_direction: action === 'branch_in' ? 'in' : 'out', p_op_type: action,
        p_counterparty_type: 'branch', p_counterparty_id: filial, p_counterparty_name: str(body.cpName, 200) || filial, p_filial: filial,
        p_ref_type: 'cashbox', p_ref_id: str(body.boxId, 40) };
    } else if (action === 'advance_give' || action === 'advance_repay') {
      rpc = action === 'advance_give' ? 'firma_kassa_give_advance' : 'firma_kassa_repay_advance';
      args = { ...base, p_counterparty_type: body.cpType, p_counterparty_id: str(body.cpId, 64), p_counterparty_name: str(body.cpName, 200) };
    } else if (action === 'kirim_pay') {
      args = { ...base, p_direction: 'out', p_op_type: 'kirim_payment', p_counterparty_type: 'supplier',
        p_counterparty_id: str(body.cpId, 64), p_counterparty_name: str(body.cpName, 200), p_filial: auth.filial,
        p_ref_type: 'kirim', p_ref_id: str(body.refId, 64) };
    } else if (action === 'expense') {
      const inDir = body.dir === 'in';   // hamkor kirimi (pul qo'shish) — Bosh kassaga kirim
      args = { ...base, p_idem_key: `fkx:${body.idemKey}`, p_direction: inDir ? 'in' : 'out', p_op_type: inDir ? 'deposit' : 'expense',
        p_counterparty_type: body.partnerId ? 'partner' : 'other', p_counterparty_id: str(body.partnerId, 64), p_counterparty_name: str(body.cpName, 200),
        p_filial: resolveFilial(auth, body.filial), p_ref_type: 'expense', p_ref_id: str(body.refId, 64) };
    } else if (action === 'partner_withdrawal') {
      args = { ...base, p_direction: 'out', p_op_type: 'partner_withdrawal', p_counterparty_type: 'partner',
        p_counterparty_id: str(body.cpId, 64), p_counterparty_name: str(body.cpName, 200) };
    }

    const { data, error } = await admin.rpc(rpc, args);
    if (error && action === 'expense' && /firma_kassa_ledger_(op|source)_chk/.test(String(error.message || ''))) {
      return json({ error: "Bu amal uchun 28-migratsiya qo'llanishi kerak — administratorga murojaat qiling" }, 409);
    }
    if (error) return serverError(error, 'firma-kassa', 'Amal bajarilmadi', 400);
    const row = rowOut(Array.isArray(data) ? data[0] : data);
    return json({ ok: true, entry: row }, 200);
  } catch (e) {
    return serverError(e, 'firma-kassa', 'Bosh kassa bilan ishlashda xatolik');
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('firma-kassa', exports.handler);
