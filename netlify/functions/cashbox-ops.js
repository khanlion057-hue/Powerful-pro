// Netlify Function — FILIAL KASSASI PUL HARAKATLARI (v11, F4; 24-migratsiya).
//
// Brauzer endi kassa qoldig'ini o'zi hisoblab yubormaydi — faqat RUXSAT ETILGAN
// AMALNI so'raydi ("kassaga 100 000 so'm kirim", "1-kassadan 3-kassaga ko'chirish").
// Server:
//   • xodimni va amal turiga mos ruxsatni tekshiradi (RBAC, deny-by-default);
//   • filialni o'zi aniqlaydi (xodim — faqat o'z filiali; admin — tanlangan filial);
//   • kassa mavjudligi va valyutasini SERVERDAGI filial ma'lumotidan oladi;
//   • ko'chirish/almashtirishda qiymat yaratilmasligini tekshiradi (kurs chegarasi);
//   • bazadagi cashbox_apply_ops() orqali BITTA tranzaksiyada bajaradi: qator
//     qulflanadi, chiqim qoldiqdan oshmaydi, `key` bilan takroriy so'rov ikki marta
//     yozilmaydi; javobda bazadagi HAQIQIY qoldiqlar qaytadi.
//
// POST { filial?, key, kind, ops:[{ box, dir:'in'|'out', amount, note? }], rate?, refType?, refId?, record? }
// record (v23) — to'lov amallari uchun (cust_debt_pay, supp_pay, dealer_pay, home_withdrawal): kassa
// harakati va to'lov yozuvi (+ diller qarzi) bitta tranzaksiyada; qarzdan ortiq to'lov serverda rad etiladi.
// 24-migratsiya hali qo'llanmagan bo'lsa: { ok:true, authority:false } — brauzer avvalgidek ishlaydi.
const { notifyCustomerPayment, notifyDealerPayment } = require('./_lib/tgEvents');
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError, logSecurityEvent } = require('./_lib/supabaseAdmin');
const { cashAuthorityOn, isMissingFunction, loadBranchBoxes } = require('./_lib/cashAuthority');
const { ledgerAuthorityOn } = require('./_lib/ledgerAuthority');

const SALE_LIKE = ['savdo.create', 'savdo.edit', 'savdo.delete', 'qaytarish.create'];
const EXPENSE_LIKE = ['xarajatlar.create', 'kassalar.transact', ...SALE_LIKE];

// Amal turi → ruxsat etilgan yo'nalishlar va RBAC ruxsatlari (biri yetarli)
const KINDS = {
  manual_in:       { dirs: ['in'],        perms: ['kassalar.transact'] },
  manual_out:      { dirs: ['out'],       perms: ['kassalar.transact'] },
  move:            { transfer: true,      perms: ['kassalar.transact'] },
  exchange:        { transfer: true,      perms: ['kassalar.transact'] },
  home_withdrawal: { dirs: ['out'],       perms: ['kassalar.transact'] },
  sale:            { dirs: ['in'],        perms: SALE_LIKE },                 // sotuvchi portali savdosi
  sale_fix:        { dirs: ['in', 'out'], perms: SALE_LIKE },                 // savdoni tahrirlash/o'chirish/qaytarish
  expense:         { dirs: ['in', 'out'], perms: EXPENSE_LIKE },              // xarajat (va hamkor kirimi)
  expense_fix:     { dirs: ['in', 'out'], perms: EXPENSE_LIKE },              // xarajatni tahrirlash/bekor qilish
  salary:          { dirs: ['out'],       perms: ['sotuvchilar.manage', ...EXPENSE_LIKE] },
  cust_debt_pay:   { dirs: ['in'],        perms: ['mijozlar.debt_payment'] },
  supp_pay:        { dirs: ['out'],       perms: ['taminotchilar.edit', 'kirim.create'] },
  kirim_pay:       { dirs: ['out'],       perms: ['kirim.create'] },
  dealer_pay:      { dirs: ['in'],        perms: ['dillerlar.manage'] },
  reset_zero:      { dirs: ['out', 'in'], admin: true },                      // "Tizimni 0 qilish" — faqat admin
};

// v23: to'lov amallari — kassa harakati va to'lov yozuvi BITTA bazaviy tranzaksiyada
// (cash_payment_atomic, 25-migratsiya). Bu amallar uchun `record` majburiy.
const RECORD_KINDS = {
  cust_debt_pay:   { type: 'customer_debt_payment', single: true },
  supp_pay:        { type: 'supplier_payment', single: true },
  dealer_pay:      { type: 'dealer_payment', single: true },
  home_withdrawal: { type: 'home_withdrawal', single: false },
};

const MAX_OPS = 20;
const MAX_AMOUNT = 1e12;
const RATE_BAND = 0.25;            // ko'chirish/almashtirish kursi serverdagi kursdan ±25% dan oshmasin
const str = (v, max) => (v == null ? null : String(v).slice(0, max));
const round2 = (n) => Math.round(n * 100) / 100;

function validate(b) {
  if (!b || typeof b !== 'object') return "Noto'g'ri so'rov formati";
  if (!KINDS[b.kind]) return "Noma'lum kassa amali";
  if (typeof b.key !== 'string' || !/^[A-Za-z0-9:_.-]{6,90}$/.test(b.key)) return 'Amal kaliti (key) noto\'g\'ri';
  if (!Array.isArray(b.ops) || b.ops.length < 1 || b.ops.length > MAX_OPS) return `Bir so'rovda 1–${MAX_OPS} ta harakat bo'lishi mumkin`;
  const k = KINDS[b.kind];
  for (const op of b.ops) {
    if (!op || typeof op !== 'object') return "Harakat noto'g'ri";
    if (!Number.isSafeInteger(op.box) || op.box < 0) return "Kassa noto'g'ri";
    if (op.dir !== 'in' && op.dir !== 'out') return "Yo'nalish faqat 'in' yoki 'out'";
    if (typeof op.amount !== 'number' || !Number.isFinite(op.amount) || op.amount <= 0 || op.amount > MAX_AMOUNT) return "Summa musbat son bo'lishi kerak";
    if (round2(op.amount) <= 0) return 'Summa juda kichik';
    if (op.note != null && String(op.note).length > 500) return 'Izoh juda uzun';
    if (!k.transfer && !k.dirs.includes(op.dir)) return `Bu amal turida "${op.dir}" harakati bo'lmaydi`;
  }
  if (k.transfer) {
    if (!b.ops.some(o => o.dir === 'out') || !b.ops.some(o => o.dir === 'in')) return "Ko'chirishda chiqim va kirim bo'lishi shart";
  }
  if (b.rate != null && (typeof b.rate !== 'number' || !Number.isFinite(b.rate) || b.rate <= 0)) return "Kurs noto'g'ri";
  const rk = RECORD_KINDS[b.kind];
  if (rk) {
    const r = b.record;
    if (!r || typeof r !== 'object') return "To'lov ma'lumoti (record) majburiy";
    if (rk.single && b.ops.length !== 1) return "To'lov bitta kassa orqali bo'ladi";
    if (b.kind === 'cust_debt_pay' && !(Number.isSafeInteger(r.customerId) && r.customerId > 0)) return 'Mijoz noto\'g\'ri';
    if (b.kind === 'supp_pay' && !(Number.isSafeInteger(r.supplierId) && r.supplierId > 0)) return "Ta'minotchi noto'g'ri";
    if (b.kind === 'dealer_pay' && !(Number.isSafeInteger(r.dealerId) && r.dealerId > 0)) return "Diller noto'g'ri";
    if (r.note != null && String(r.note).length > 500) return 'Izoh juda uzun';
  }
  return null;
}

// To'lov yozuvini SERVERDAGI ma'lumot asosida tuzadi va qarzdan ortiq to'lovni rad etadi.
// v23.2 (F4b, 27-migratsiya): qarz chegarasini BAZA tekshiradi — mijoz/ta'minotchi qarzi qatori
// qulflanadi (cash_payment_atomic), shuning uchun bu yerda JSON'dagi qarz ishlatilmaydi (ledgerOn).
function buildRecord(body, ops, branch, rate, ledgerOn) {
  const r = body.record;
  const op = ops[0];
  const usdOf = (o) => (o.currency === 'USD' ? o.amount : (rate ? o.amount / rate : null));
  const uzsOf = (o) => (o.currency === 'UZS' ? o.amount : (rate ? o.amount * rate : null));
  if (body.kind === 'cust_debt_pay') {
    const c = (Array.isArray(branch.customers) ? branch.customers : []).find(x => x && Number(x.id) === r.customerId);
    if (!c) return { error: 'Mijoz topilmadi' };
    const uzs = uzsOf(op);
    if (uzs == null) return { error: 'USD/UZS kursi sozlanmagan' };
    if (!ledgerOn && uzs > (Number(c.debt) || 0) + 1) return { error: `To'lov (${Math.round(uzs)} so'm) mijoz qarzidan (${Math.round(Number(c.debt) || 0)} so'm) oshib ketdi` };
    return { record: { customer_local_id: r.customerId, customer_name: str(c.name, 200), amount_uzs: round2(uzs), box_local_id: op.box } };
  }
  if (body.kind === 'supp_pay') {
    const sp = (Array.isArray(branch.suppliers) ? branch.suppliers : []).find(x => x && Number(x.id) === r.supplierId);
    if (!sp) return { error: "Ta'minotchi topilmadi" };
    const usd = usdOf(op);
    if (usd == null) return { error: 'USD/UZS kursi sozlanmagan' };
    if (!ledgerOn && usd > (Number(sp.debt) || 0) + 0.01) return { error: `To'lov (${round2(usd)} $) ta'minotchi qarzidan (${round2(Number(sp.debt) || 0)} $) oshib ketdi` };
    // v25 (44): 4 xona — so'mdagi ta'minotchida qarz so'mga qaytarilganda aniq qoladi (2 xonada ~50 so'm xato bo'lardi)
    return { record: { supplier_local_id: r.supplierId, supplier_name: str(sp.name, 200), amount_usd: Math.round(usd * 1e4) / 1e4, box_local_id: op.box } };
  }
  if (body.kind === 'dealer_pay') {
    const usd = usdOf(op);
    if (usd == null) return { error: 'USD/UZS kursi sozlanmagan' };
    return { record: { dealer_id: r.dealerId, amount_usd: round2(usd), note: str(r.note, 300) } };   // qarz — bazada qulflab tekshiriladi
  }
  return { record: { entries: ops.map(o => ({ boxId: o.box, boxName: o.box_name, cur: o.currency, amount: o.amount })), note: str(r.note, 500) } };
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
  const vErr = validate(body);
  if (vErr) return json({ error: vErr }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'cashbox-ops', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { loadPermissions: true, fn: 'cashbox-ops' });
  if (!auth.ok) return auth.response;

  const kind = KINDS[body.kind];
  const allowed = auth.isAdmin || (!kind.admin && kind.perms.some(p => auth.permKeys.has(p)));
  if (!allowed) {
    await logSecurityEvent(admin, auth.staff, 'permission_denied', { need: kind.admin ? 'admin' : kind.perms, fn: 'cashbox-ops', kind: body.kind });
    return json({ error: kind.admin ? 'Bu amal faqat administrator uchun' : "Bu kassa amali uchun ruxsatingiz yo'q" }, 403);
  }

  const filial = resolveFilial(auth, body.filial);

  try {
    if (!(await cashAuthorityOn(admin))) return json({ ok: true, authority: false }, 200);

    // v23.2 (F4b): 27-migratsiyadan keyin savdo va savdoni tuzatish (qaytarish/tahrir/o'chirish) kassasi
    // FAQAT savdo hujjati bilan birga (sale-checkout-atomic / sale-ops) — ombor va qarz bilan bitta tranzaksiyada.
    // Eski (yangilanmagan) brauzer bu yo'l bilan pulni ombor/qarzsiz o'zgartira olmasin.
    if ((body.kind === 'sale' || body.kind === 'sale_fix') && await ledgerAuthorityOn(admin)) {
      await logSecurityEvent(admin, auth.staff, 'legacy_sale_cash_blocked', { fn: 'cashbox-ops', kind: body.kind, filial });
      return json({ error: "Ilova yangilangan — sahifani yangilang (F5). Savdo endi ombor va qarz bilan birga serverda bajariladi.", deprecated: true }, 409);
    }
    const { boxes, rate: serverRate, branch } = await loadBranchBoxes(admin, filial);
    const byId = new Map(boxes.map(b => [Number(b.id), b]));
    const ops = [];
    for (const op of body.ops) {
      const box = byId.get(op.box);
      if (!box) return json({ error: `Kassa topilmadi (${op.box})` }, 400);
      const currency = box.cur === 'USD' ? 'USD' : box.cur === 'UZS' ? 'UZS' : null;
      if (!currency) return json({ error: `Kassa valyutasi noto'g'ri (${op.box})` }, 400);
      ops.push({ box: op.box, currency, dir: op.dir, amount: round2(op.amount), box_name: str(box.name, 200),
        note: str(op.note, 500), ref_type: str(body.refType, 40), ref_id: str(body.refId, 100) });
    }

    if (kind.transfer) {
      // Qiymat yaratilmasin: chiqim = kirim (bir valyutaga keltirilganda), kurs serverdagidan ±25%
      let rate = serverRate;
      if (body.rate != null) {
        if (!serverRate || Math.abs(body.rate - serverRate) > serverRate * RATE_BAND) {
          return json({ error: `Kurs (${body.rate}) serverdagi kursdan (${serverRate || '—'}) juda farq qiladi` }, 400);
        }
        rate = body.rate;
      }
      const needsRate = new Set(ops.map(o => o.currency)).size > 1;
      if (needsRate && !rate) return json({ error: 'USD/UZS kursi sozlanmagan' }, 400);
      const toUsd = (o) => (o.currency === 'USD' ? o.amount : o.amount / rate);
      const outUsd = ops.filter(o => o.dir === 'out').reduce((s, o) => s + toUsd(o), 0);
      const inUsd = ops.filter(o => o.dir === 'in').reduce((s, o) => s + toUsd(o), 0);
      const tol = Math.max(0.01, outUsd * 0.005);
      if (Math.abs(outUsd - inUsd) > tol) {
        await logSecurityEvent(admin, auth.staff, 'cash_transfer_imbalance', { filial, outUsd: round2(outUsd), inUsd: round2(inUsd) });
        return json({ error: `Ko'chirishda chiqim (${round2(outUsd)} $) va kirim (${round2(inUsd)} $) teng emas` }, 400);
      }
    }

    const staffName = auth.staff?.name || (auth.isAdmin ? 'Admin' : null);
    const staffId = auth.isAdmin ? null : (auth.staff?.id ?? null);
    const groupKey = `ops:${body.key}`;
    let data, error;
    const rk = RECORD_KINDS[body.kind];
    if (rk) {
      const ledgerOn = await ledgerAuthorityOn(admin);
      const built = buildRecord(body, ops, branch || {}, serverRate, ledgerOn);
      if (built.error) return json({ error: built.error }, 400);
      // v23.2: 27-migratsiyadan keyin — qarz qatorini qulflaydigan _v2 (24/25 qayta ishga tushirilsa ham o'zgarmaydi)
      ({ data, error } = await admin.rpc(ledgerOn ? 'cash_payment_atomic_v2' : 'cash_payment_atomic', {
        p_filial: filial, p_group_key: groupKey, p_kind: body.kind, p_ops: ops, p_record_type: rk.type, p_record: built.record,
        p_staff_id: staffId, p_staff_name: staffName,
      }));
      if (error && isMissingFunction(error) && body.kind === 'dealer_pay') {
        // Diller qarzi SQL jadvalida (dealers.debt_usd) — kassa harakati qarzsiz yozilsa ikkisi
        // ajralib ketadi. Fail-close: 25-migratsiyasiz diller to'lovi qabul qilinmaydi.
        return json({ error: "Diller to'lovi uchun 25-migratsiya qo'llanishi kerak (administratorga murojaat qiling)", migrationPending: true }, 409);
      }
      if (error && isMissingFunction(error)) {
        // 25-migratsiya hali qo'llanmagan: kassa amali (atomik) — yozuvsiz; buni ochiq aytamiz
        console.warn('[cashbox-ops] cash_payment_atomic yo\'q — 25-migratsiyani qo\'llang; to\'lov yozuvi jadvalga yozilmadi');
        ({ data, error } = await admin.rpc('cashbox_apply_ops', { p_filial: filial, p_group_key: groupKey, p_kind: body.kind, p_ops: ops, p_staff_id: staffId, p_staff_name: staffName }));
        if (!error && data) data = { ...data, recordSkipped: true };
      }
    } else {
      ({ data, error } = await admin.rpc('cashbox_apply_ops', {
        p_filial: filial, p_group_key: groupKey, p_kind: body.kind, p_ops: ops, p_staff_id: staffId, p_staff_name: staffName,
      }));
    }
    if (error) return serverError(error, 'cashbox-ops', 'Kassa amali bajarilmadi', 400);
    const balances = {};
    Object.entries((data && data.balances) || {}).forEach(([k, v]) => { balances[k] = Number(v); });
    const out = { ok: true, authority: true, filial, replay: !!(data && data.replay), balances, entries: (data && data.entries) || [] };
    if (data && data.dealerDebtUsd != null) { out.dealerDebtUsd = Number(data.dealerDebtUsd); out.dealerTotalPaidUsd = Number(data.dealerTotalPaidUsd); }
    if (data && data.recordSkipped) out.recordSkipped = true;
    // v23.2 (F4b): to'lovdan keyingi HAQIQIY qarz (bazadan)
    if (data && data.customerDebt != null) out.customerDebt = Number(data.customerDebt);
    if (data && data.supplierDebt != null) {
      out.supplierDebt = Number(data.supplierDebt); out.supplierPaid = Number(data.supplierPaid);
      const sid = body.record && Number(body.record.supplierId);
      if (Number.isSafeInteger(sid) && sid > 0) Object.assign(out, await suppCurOf(admin, filial, sid));
    }
    // v25.1: mijoz/diller to'lovi — Telegram guruhiga (yozuv bazada; takroriy so'rovda yuborilmaydi; xato amalni bekor qilmaydi)
    if (!out.replay && !out.recordSkipped && (body.kind === 'cust_debt_pay' || body.kind === 'dealer_pay')) {
      const op0 = ops[0] || {};
      if (body.kind === 'cust_debt_pay') await notifyCustomerPayment(admin, { filial, customerId: body.record.customerId, amount: op0.amount, currency: op0.currency, debtAfterUzs: out.customerDebt, staffName });
      else await notifyDealerPayment(admin, { filial, dealerId: body.record.dealerId, amountUsd: op0.currency === 'USD' ? op0.amount : (serverRate ? op0.amount / serverRate : 0), debtAfterUsd: out.dealerDebtUsd, via: op0.box_name || null, staffName });
    }
    return json(out, 200);
  } catch (e) {
    return serverError(e, 'cashbox-ops', 'Kassa amalida xatolik');
  }
};
