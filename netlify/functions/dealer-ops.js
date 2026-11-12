// Netlify Function — DILLER OMBORI VA DILLER SAVDOSI (v24.5, 35-migratsiya; v23.10.2 dagi 31 dan ko'chirildi).
//
// Brauzer diller qoldig'i, qarzi yoki total_shipped'ning YAKUNIY qiymatini yubormaydi — faqat amalni so'raydi:
//   ship    { dealerId, items:[{pid, qty, sku, name}], orderId? } — firma omboridan (FIFO) dillerga; orderId bo'lsa
//           buyurtma shu tranzaksiyada 'approved' bo'ladi (ikki marta tasdiqlab bo'lmaydi)
//   return  { dealerId, items:[{pid, qty, condition, reason, localId, bno}] } — dillerdan qaytarish
//   sale    { dealerId, items:[{pid, qty, priceUsd, sku, name}], pct }      — admin diller savdosini yozadi
// Hammasi bitta tranzaksiyada, `key` bilan idempotent. Javobda diller ombori, qarzi va firma partiyalari (bazadan).
// 35-migratsiyasiz — 409 { migrationPending:true } (brauzer avvalgi yo'lni ishlatadi).
const { notifyDealerOp } = require('./_lib/tgEvents');
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError, logSecurityEvent } = require('./_lib/supabaseAdmin');
const { dealerAtomicOn } = require('./_lib/dealerAtomic');

const isNum = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const ID_RE = /^[0-9A-Za-z_.:-]{1,64}$/;
const CONDITIONS = ['Yangi', 'Yaxshi', "Ta'mirtalab", 'Yaroqsiz'];   // js/main.js bilan bir xil

function permsFor(b) {
  if (b.kind === 'ship') return b.orderId != null ? ['dillerlar.manage', 'dillerlar.orders'] : ['dillerlar.manage'];
  if (b.kind === 'return' || b.kind === 'sale') return ['dillerlar.manage'];
  return null;
}

function validate(b) {
  if (!b || typeof b !== 'object') return "Noto'g'ri so'rov formati";
  if (!permsFor(b)) return "Noma'lum amal";
  if (typeof b.key !== 'string' || !/^[A-Za-z0-9:_.-]{6,100}$/.test(b.key)) return "Amal kaliti (key) noto'g'ri";
  if (!Number.isSafeInteger(b.dealerId) || b.dealerId <= 0) return "Diller noto'g'ri";
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 500) return "Mahsulotlar ro'yxati noto'g'ri";
  for (const i of b.items) {
    if (!i || !Number.isSafeInteger(i.pid) || i.pid <= 0 || !isNum(i.qty, 1e-9, 1e6)) return "Mahsulot qatori noto'g'ri";
    if (b.kind === 'sale' && !isNum(i.priceUsd, 1e-9, 1e9)) return "Narx noto'g'ri";
    if (b.kind === 'return') {
      if (!CONDITIONS.includes(i.condition)) return "Holat noto'g'ri";
      if ((i.condition === 'Yangi' || i.condition === 'Yaxshi') && !ID_RE.test(String(i.localId || ''))) return "Qaytgan partiya ID noto'g'ri";
      if (i.reason != null && String(i.reason).length > 300) return 'Sabab juda uzun';
    }
  }
  if (b.kind === 'ship' && b.orderId != null && (!Number.isSafeInteger(b.orderId) || b.orderId <= 0)) return "Buyurtma noto'g'ri";
  // v25 (42): jo'natma turi — «sotish uchun» yoki «qarzga» (qarzga — har mahsulot narxi bilan)
  if (b.kind === 'ship' && b.mode != null && !['consign', 'debt'].includes(b.mode)) return "Jo'natma turi noto'g'ri";
  if (b.kind === 'ship' && b.mode === 'debt' && b.items.some(i => !isNum(i.priceUsd, 1e-9, 1e9))) return "«Qarzga» jo'natmada har mahsulot narxi kerak";
  if (b.kind === 'sale' && !isNum(b.pct, 0, 100)) return "Xizmat haqi foizi 0–100 bo'lishi kerak";
  return null;
}

const label = (i) => ({ sku: i.sku != null ? String(i.sku).slice(0, 80) : null, name: i.name != null ? String(i.name).slice(0, 300) : null });

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const body = parseBody(event);
  const vErr = validate(body);
  if (vErr) return json({ error: vErr }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'dealer-ops', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { loadPermissions: true, fn: 'dealer-ops' });
  if (!auth.ok) return auth.response;
  const need = permsFor(body);
  if (!auth.isAdmin && !need.some(p => auth.permKeys.has(p))) {
    await logSecurityEvent(admin, auth.staff, 'permission_denied', { need, fn: 'dealer-ops', kind: body.kind });
    return json({ error: "Bu amal uchun ruxsatingiz yo'q" }, 403);
  }
  const filial = resolveFilial(auth, body.filial);
  const staff = { p_staff_id: auth.isAdmin ? null : (auth.staff?.id ?? null), p_staff_name: auth.staff?.name || (auth.isAdmin ? 'Admin' : null) };
  const opKey = `d${body.kind}:${body.key}`;

  try {
    if (!(await dealerAtomicOn(admin))) {
      return json({ error: "Bu amal uchun 35-migratsiya qo'llanishi kerak", migrationPending: true }, 409);
    }
    let rpc, args;
    if (body.kind === 'ship') {
      rpc = 'dealer_ship_atomic';
      args = { p_filial: filial, p_op_key: opKey, p_dealer_id: body.dealerId, p_order_id: body.orderId ?? null,
        p_items: body.items.map(i => ({ pid: i.pid, qty: i.qty, ...label(i) })), ...staff };
    } else if (body.kind === 'return') {
      rpc = 'dealer_return_atomic';
      args = { p_filial: filial, p_op_key: opKey, p_dealer_id: body.dealerId,
        p_items: body.items.map(i => ({ pid: i.pid, qty: i.qty, condition: i.condition, reason: i.reason != null ? String(i.reason).slice(0, 300) : null,
          localId: i.localId != null ? String(i.localId) : null, bno: i.bno != null ? String(i.bno).slice(0, 20) : null, ...label(i) })), ...staff };
    } else {
      rpc = 'dealer_sale_record_atomic';
      args = { p_filial: filial, p_op_key: opKey, p_dealer_id: body.dealerId, p_pct: body.pct,
        p_items: body.items.map(i => ({ pid: i.pid, qty: i.qty, priceUsd: i.priceUsd, ...label(i) })), ...staff };
    }
    // v25 (42): *_v42 (qarzga olingan qism hisobi) — bo'lsa shu, bo'lmasa avvalgidek; «qarzga» faqat 42 bilan
    const v42 = { dealer_ship_atomic: 'dealer_ship_v42', dealer_sale_record_atomic: 'dealer_sale_v42', dealer_return_atomic: 'dealer_return_v42' }[rpc];
    const mode = body.kind === 'ship' && body.mode === 'debt' ? 'debt' : 'consign';
    const argsV42 = body.kind === 'ship' ? { ...args, p_mode: mode, p_items: body.items.map(i => ({ pid: i.pid, qty: i.qty, ...(mode === 'debt' ? { priceUsd: i.priceUsd } : {}), ...label(i) })) } : args;
    let { data, error } = await admin.rpc(v42, argsV42);
    if (error && (error.code === 'PGRST202' || error.code === '42883' || /_v42/.test(String(error.message || '')))) {
      if (mode === 'debt') return json({ error: "«Qarzga» joʻnatma uchun 42-migratsiya qoʻllanishi kerak", code: 'MIGRATION42_PENDING' }, 409);
      ({ data, error } = await admin.rpc(rpc, args));
    }
    if (error) return serverError(error, 'dealer-ops', 'Amal bajarilmadi', 400);
    // v25.1: diller oldi-berdisi — Telegram (dillerlar guruhi); takroriy kalitda (replay) yuborilmaydi
    if (!(data && data.replay)) await notifyDealerOp(admin, { kind: body.kind, mode, dealerId: body.dealerId, items: body.items, filial, staffName: staff.p_staff_name, pct: body.pct });
    return json({ ...data, filial, ledger: true }, 200);
  } catch (e) {
    return serverError(e, 'dealer-ops', 'Server xatosi');
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('dealer-ops', exports.handler);
