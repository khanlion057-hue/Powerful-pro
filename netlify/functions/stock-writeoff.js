// Netlify Function — HISOBDAN CHIQARISH (v23.6, 29-migratsiya).
//
// Buzilgan, muddati o'tgan, singan yoki yo'qolgan tovar ombordan chiqariladi. Ombor (FIFO), hujjat va
// (konsignatsiya bo'lsa) ta'minotchi qarzi BITTA tranzaksiyada (stock_writeoff_atomic); zarar = tannarx × soni —
// SERVERDA hisoblanadi (brauzer yuborgan narx ishlatilmaydi). Bekor qilish — aynan o'sha partiyalarga qaytariladi.
//
// Amallar (POST { action, ... }):
//   create { key, doc:{localId, docNo, reason, note, date, items:[{pid, sku, name, qty}]} }  [ombor.writeoff yoki ombor.edit]
//   cancel { key, localId, note }                                                            [ombor.writeoff yoki ombor.edit]
//   list   { from?, to? }                                                                    [+ ombor.view, qaytarish.create]
// 29-migratsiyasiz — 409 { migrationPending:true }.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError, logSecurityEvent } = require('./_lib/supabaseAdmin');
const { _isMissingRelation } = require('./_lib/cashAuthority');
const { writeoffRowToClient } = require('./_lib/ledgerAuthority');

const KEY_RE = /^[A-Za-z0-9:_.-]{3,120}$/;
const ID_RE = /^[0-9A-Za-z_.:-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REASONS = ['damaged', 'expired', 'broken', 'lost', 'other'];
const isNum = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const WRITE_PERMS = ['ombor.writeoff', 'ombor.edit'];
const READ_PERMS = [...WRITE_PERMS, 'ombor.view', 'qaytarish.create'];

function validate(b) {
  if (!['create', 'cancel', 'list'].includes(b.action)) return "Noma'lum amal";
  if (b.action === 'list') {
    if (b.from != null && !DATE_RE.test(String(b.from))) return "Sana noto'g'ri";
    if (b.to != null && !DATE_RE.test(String(b.to))) return "Sana noto'g'ri";
    return null;
  }
  if (typeof b.key !== 'string' || !KEY_RE.test(b.key)) return 'key majburiy';
  if (b.action === 'cancel') {
    if (typeof b.localId !== 'string' || !ID_RE.test(b.localId)) return "Hujjat noto'g'ri";
    if (b.note != null && String(b.note).length > 500) return 'Izoh juda uzun';
    return null;
  }
  const d = b.doc;
  if (!d || typeof d !== 'object') return "Hujjat yo'q";
  if (typeof d.localId !== 'string' || !ID_RE.test(d.localId)) return "Hujjat ID noto'g'ri";
  if (!REASONS.includes(d.reason)) return "Sabab noto'g'ri";
  if (d.note != null && String(d.note).length > 500) return 'Izoh juda uzun';
  if (d.date != null && !DATE_RE.test(String(d.date))) return "Sana noto'g'ri";
  if (!Array.isArray(d.items) || !d.items.length || d.items.length > 200) return "Mahsulotlar ro'yxati noto'g'ri";
  const seen = new Set();
  for (const i of d.items) {
    if (!i || !Number.isSafeInteger(i.pid) || i.pid <= 0 || !isNum(i.qty, 1e-9, 1e7)) return "Mahsulot qatori noto'g'ri";
    if (seen.has(i.pid)) return 'Bir mahsulot ikki marta kiritilgan';
    seen.add(i.pid);
  }
  return null;
}

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const body = parseBody(event);
  const vErr = validate(body);
  if (vErr) return json({ error: vErr }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'stock-writeoff', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { loadPermissions: true, fn: 'stock-writeoff' });
  if (!auth.ok) return auth.response;
  const need = body.action === 'list' ? READ_PERMS : WRITE_PERMS;
  if (!auth.isAdmin && !need.some(p => auth.permKeys.has(p))) {
    await logSecurityEvent(admin, auth.staff, 'permission_denied', { need, fn: 'stock-writeoff', action: body.action });
    return json({ error: "Bu amal uchun ruxsatingiz yo'q" }, 403);
  }
  const filial = resolveFilial(auth, body.filial);
  const staffId = auth.isAdmin ? null : (auth.staff?.id ?? null);
  const staffName = auth.staff?.name || (auth.isAdmin ? 'Admin' : null);

  try {
    // 29-migratsiya bormi
    const probe = admin.from('stock_writeoffs').select('id');
    const { error: pErr } = await (typeof probe.limit === 'function' ? probe.limit(1) : probe);
    if (pErr) {
      if (_isMissingRelation(pErr)) return json({ error: "Bu amal uchun 29-migratsiya qo'llanishi kerak", migration29Pending: true }, 409);
      throw pErr;
    }

    if (body.action === 'list') {
      let q = admin.from('stock_writeoffs').select('*').eq('filial', filial);
      if (body.from && typeof q.gte === 'function') q = q.gte('wo_date', body.from);
      if (body.to && typeof q.lte === 'function') q = q.lte('wo_date', body.to);
      if (typeof q.order === 'function') q = q.order('id', { ascending: false });
      if (typeof q.limit === 'function') q = q.limit(500);
      const { data, error } = await q;
      if (error) throw error;
      return json({ ok: true, filial, docs: (data || []).map(writeoffRowToClient) }, 200);
    }

    if (body.action === 'create') {
      const d = body.doc;
      const doc = { localId: d.localId, docNo: String(d.docNo || d.localId).slice(0, 40), reason: d.reason, note: d.note ? String(d.note).slice(0, 500) : null,
        date: d.date || null, items: d.items.map(i => ({ pid: i.pid, qty: i.qty, sku: String(i.sku || '').slice(0, 80), name: String(i.name || '').slice(0, 300) })) };
      const { data, error } = await admin.rpc('stock_writeoff_atomic', { p_filial: filial, p_op_key: body.key, p_doc: doc, p_staff_id: staffId, p_staff_name: staffName });
      if (error) return serverError(error, 'stock-writeoff', 'Hisobdan chiqarilmadi', 400);
      return json({ ...data, filial, ledger: true }, 200);
    }

    const { data, error } = await admin.rpc('stock_writeoff_cancel', { p_filial: filial, p_op_key: body.key, p_local_id: body.localId,
      p_note: body.note ? String(body.note).slice(0, 500) : null, p_staff_id: staffId, p_staff_name: staffName });
    if (error) return serverError(error, 'stock-writeoff', 'Bekor qilinmadi', 400);
    return json({ ...data, filial, ledger: true }, 200);
  } catch (e) {
    return serverError(e, 'stock-writeoff', 'Server xatosi');
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('stock-writeoff', exports.handler);
