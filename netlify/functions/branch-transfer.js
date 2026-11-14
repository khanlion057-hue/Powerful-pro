// Netlify Function — FILIALLAR O'TKAZMASI (v24.6, 36-migratsiya).
//
//   list        — shu filial ishtirok etgan o'tkazmalar (ochiqlari + oxirgi 100 ta; admin all:true — hammasi)
//   income      — Baza foydasi filial sotganda (davr bo'yicha, har filial) — faqat admin
//   tr_request  — qabul qiluvchi jo'natuvchidan tovar so'raydi
//   tr_ship     — jo'natuvchi jo'natadi (so'rov bo'yicha qisman ham, yoki to'g'ridan-to'g'ri); qabul qiluvchida «yo'lda»
//   tr_receive  — qabul qiluvchi sanab qabul qiladi: omborga aynan kiritilgan son tushadi (kam bo'lsa — izoh majburiy)
//   tr_resolve  — jo'natuvchi kam kelgan qismni hal qiladi: «omborga qaytdi» yoki «yo'qotish»
//   tr_close    — so'rovning jo'natilmagan qismini yopish
// Ombor o'zgarishlari branch_transfer_op() ichida BITTA tranzaksiyada, `key` bilan idempotent.
// 36-migratsiyasiz — 409 { trPending:true } (sahifa eski yo'lni ko'rsatadi).
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError, logSecurityEvent } = require('./_lib/supabaseAdmin');

const KINDS = ['list', 'income', 'tr_request', 'tr_ship', 'tr_receive', 'tr_resolve', 'tr_close'];
const WRITE_PERMS = ['kirim.create', 'ombor.edit'];
const FIL_RE = /^[a-z0-9_]{1,40}$/;
const isNum = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isId = (v) => (Number.isSafeInteger(v) && v > 0) || (typeof v === 'string' && /^[0-9]{1,18}$/.test(v));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function items(list, { price = false } = {}) {
  if (!Array.isArray(list) || list.length < 1 || list.length > 300) return null;
  const out = [];
  for (const i of list) {
    if (!i || !Number.isSafeInteger(i.pid) || i.pid <= 0 || !isNum(i.qty, 0, 1e7)) return null;
    const o = { pid: i.pid, qty: i.qty };
    if (i.sku != null) o.sku = String(i.sku).slice(0, 80);
    if (i.name != null) o.name = String(i.name).slice(0, 300);
    if (price && i.priceUsd != null) { if (!isNum(i.priceUsd, 0, 1e7)) return null; o.priceUsd = i.priceUsd; }
    out.push(o);
  }
  return out;
}

function validate(b) {
  if (b && b.payload && b.payload.mode != null && !['consign', 'debt'].includes(b.payload.mode)) return "Jo'natma turi noto'g'ri";
  if (!b || typeof b !== 'object') return "Noto'g'ri so'rov formati";
  if (!KINDS.includes(b.kind)) return "Noma'lum amal";
  const p = b.payload && typeof b.payload === 'object' ? b.payload : {};
  if (b.kind === 'list') return null;
  if (b.kind === 'income') return DATE_RE.test(String(p.from || '')) && DATE_RE.test(String(p.to || '')) ? null : "Davr noto'g'ri";
  if (typeof b.key !== 'string' || !/^[A-Za-z0-9:_.-]{6,100}$/.test(b.key)) return "Amal kaliti (key) noto'g'ri";
  switch (b.kind) {
    case 'tr_request':
      if (!FIL_RE.test(String(p.from || ''))) return "Qayerdan so'ralishi noto'g'ri";
      if (!items(p.items) || p.items.some(i => !(i.qty > 0))) return "Mahsulotlar ro'yxati noto'g'ri";
      return null;
    case 'tr_ship':
      if (p.transferId == null && !FIL_RE.test(String(p.to || ''))) return 'Qabul qiluvchi filial noto\'g\'ri';
      if (p.transferId != null && !isId(p.transferId)) return "O'tkazma noto'g'ri";
      if (!items(p.items, { price: true }) || p.items.some(i => !(i.qty > 0))) return "Mahsulotlar ro'yxati noto'g'ri";
      return null;
    case 'tr_receive':
      if (!isId(p.shipmentId)) return "Jo'natma noto'g'ri";
      if (!Array.isArray(p.items) || p.items.length > 300 || p.items.some(i => !i || !Number.isSafeInteger(i.pid) || !isNum(i.qty, 0, 1e7))) return "Qabul ro'yxati noto'g'ri";
      return null;
    case 'tr_resolve':
      if (!isId(p.shipmentId)) return "Jo'natma noto'g'ri";
      return ['returned', 'loss'].includes(p.resolution) ? null : "Yechim noto'g'ri";
    case 'tr_close':
      return isId(p.transferId) ? null : "O'tkazma noto'g'ri";
  }
  return "Noma'lum amal";
}

const missing36 = (err) => {
  const m = String(err && (err.message || err.details || err.hint) || '');
  return (err && (err.code === 'PGRST202' || err.code === '42883' || err.code === '42P01')) || /branch_transfer|branch_income|could not find the function/i.test(m) && /does not exist|could not find/i.test(m);
};

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const body = parseBody(event);
  const vErr = validate(body);
  if (vErr) return json({ error: vErr }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'branch-transfer', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { loadPermissions: true, fn: 'branch-transfer' });
  if (!auth.ok) return auth.response;
  const isWrite = body.kind.startsWith('tr_');
  const allowed = auth.isAdmin || (body.kind === 'income' ? false : !isWrite || WRITE_PERMS.some(p => auth.permKeys.has(p)));
  if (!allowed) {
    await logSecurityEvent(admin, auth.staff, 'permission_denied', { need: body.kind === 'income' ? 'admin' : WRITE_PERMS, fn: 'branch-transfer', kind: body.kind });
    return json({ error: body.kind === 'income' ? 'Bu maʼlumot faqat administrator uchun' : "Bu amal uchun ruxsatingiz yo'q" }, 403);
  }
  const filial = resolveFilial(auth, body.filial);
  const p = body.payload || {};
  try {
    let r;
    if (body.kind === 'list') {
      r = await admin.rpc('branch_transfer_list', { p_filial: filial, p_all: !!(auth.isAdmin && p.all) });
    } else if (body.kind === 'income') {
      r = await admin.rpc('branch_income', { p_from: p.from, p_to: p.to });
    } else {
      const payload = { ...p };
      if (body.kind === 'tr_request') payload.items = items(p.items);
      if (body.kind === 'tr_ship') {
        payload.items = items(p.items, { price: true });
        if (p.transferId != null) payload.transferId = String(p.transferId);
      }
      if (payload.note != null) payload.note = String(payload.note).slice(0, 500);
      // v25 (40-migratsiya): jo'natma turi — «sotish uchun» (konsignatsiya) yoki «qarzga» (qabul qilinganda qarz)
      if (body.kind === 'tr_ship') payload.mode = p.mode === 'debt' ? 'debt' : 'consign'; else delete payload.mode;
      const args = {
        p_filial: filial, p_op_key: body.key, p_kind: body.kind, p_payload: payload,
        p_staff_id: auth.isAdmin ? null : (auth.staff?.id ?? null), p_staff_name: auth.staff?.name || (auth.isAdmin ? 'Admin' : null),
        p_is_admin: !!auth.isAdmin,
      };
      r = await admin.rpc('branch_transfer_op_v40', args);
      const noV40 = r.error && (r.error.code === 'PGRST202' || r.error.code === '42883' || /branch_transfer_op_v40/.test(String(r.error.message || '')));
      if (noV40) {
        if (payload.mode === 'debt') return json({ error: "«Qarzga» joʻnatma uchun 40-migratsiya qoʻllanishi kerak", code: 'MIGRATION40_PENDING' }, 409);
        delete payload.mode;
        r = await admin.rpc('branch_transfer_op', args);   // 40 hali yo'q — avvalgidek (konsignatsiya)
      }
    }
    if (r.error) {
      if (missing36(r.error)) return json({ error: "Filiallar o'tkazmasi uchun 36-migratsiya qo'llanishi kerak", trPending: true }, 409);   // migrationPending EMAS — u umumiy ombor jurnalini o'chirib qo'yardi
      return serverError(r.error, 'branch-transfer', 'Amal bajarilmadi', 400);
    }
    if (body.kind === 'list') return json({ transfers: r.data || [], filial }, 200);
    if (body.kind === 'income') return json({ income: r.data || {} }, 200);
    return json({ ...r.data, filial, ledger: true }, 200);
  } catch (e) {
    return serverError(e, 'branch-transfer', 'Server xatosi');
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('branch-transfer', exports.handler);
