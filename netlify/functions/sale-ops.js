// Netlify Function — SAVDO HUJJATI AMALLARI: qaytarish, o'chirish, tahrirlash (v23.2, F4b; 27-migratsiya).
//
// Brauzer endi qaytarish/tahrir summasini, mijoz qarzini va ombor qoldig'ini O'ZI HISOBLAMAYDI —
// faqat "qaysi savdo, qaysi mahsulot, nechta" deb SO'RAYDI. Server:
//   • xodim va ruxsatni tekshiradi (savdo bilan bog'liq ruxsatlar — avvalgi kassa "sale_fix" bilan bir xil);
//   • filialni o'zi aniqlaydi (xodim — faqat o'z filiali);
//   • summalarni BAZADAGI savdo yozuvidan hisoblaydi va ombor + mijoz/ta'minotchi qarzi + kassani
//     BITTA tranzaksiyada o'zgartiradi (sale_return_atomic / sale_void_atomic / sale_edit_atomic);
//   • `key` bilan takroriy so'rov ikkinchi marta yozilmaydi (replay);
//   • javobda bazadagi HAQIQIY qarz, partiya qoldiqlari, kassa qoldiqlari va savdo holati qaytadi.
//
// POST { action:'return', key, saleLocalId, pid, qty, batchLocalId, meta? }
//      { action:'void',   key, saleLocalId, batchIds:[...], meta? }
//      { action:'edit',   key, saleLocalId, mode:'replace'|'delta'|'price', payload:{...} }
// 27-migratsiya qo'llanmagan bo'lsa — 409 { migrationPending:true } (brauzer avvalgi yo'lda ishlaydi).
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError, logSecurityEvent } = require('./_lib/supabaseAdmin');
const { ledgerAuthorityOn } = require('./_lib/ledgerAuthority');
const { v31On, v34On, roleClass } = require('./_lib/auditAuthority');
const { redactLedgerResponse } = require('./_lib/pricing');

const SALE_LIKE = ['savdo.create', 'savdo.edit', 'savdo.delete', 'qaytarish.create'];
const ID_RE = /^[0-9A-Za-z_.:-]{1,64}$/;
const isNum = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

function cleanMeta(m) {
  const o = m && typeof m === 'object' ? m : {};
  const out = {};
  if (o.bno != null) out.bno = String(o.bno).slice(0, 20);
  if (typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date)) out.date = o.date;
  if (isNum(o.rateUsdUzs, 0, 1e9)) out.rateUsdUzs = o.rateUsdUzs;
  if (isNum(o.rateUsdCny, 0, 1e9)) out.rateUsdCny = o.rateUsdCny;
  return out;
}

function validate(b) {
  if (!b || typeof b !== 'object') return "Noto'g'ri so'rov formati";
  if (!['return', 'void', 'edit'].includes(b.action)) return "Noma'lum amal";
  if (typeof b.key !== 'string' || !/^[A-Za-z0-9:_.-]{6,100}$/.test(b.key)) return "Amal kaliti (key) noto'g'ri";
  if (typeof b.saleLocalId !== 'string' && typeof b.saleLocalId !== 'number') return 'Savdo tanlanmagan';
  if (!ID_RE.test(String(b.saleLocalId))) return "Savdo ID noto'g'ri";
  if (b.action === 'return') {
    if (!Number.isSafeInteger(b.pid) || b.pid <= 0) return "Mahsulot noto'g'ri";
    if (!isNum(b.qty, 1e-9, 1e6)) return "Miqdor noto'g'ri";
    if (b.batchLocalId != null && !ID_RE.test(String(b.batchLocalId))) return "Partiya ID noto'g'ri";
  }
  if (b.action === 'void') {
    if (!Array.isArray(b.batchIds) || b.batchIds.length > 500 || b.batchIds.some(x => !ID_RE.test(String(x)))) return "Partiya ID'lari noto'g'ri";
  }
  if (b.action === 'edit') {
    if (!['replace', 'delta', 'price'].includes(b.mode)) return "Tahrir rejimi noto'g'ri";
    const p = b.payload;
    if (!p || typeof p !== 'object') return "Tahrir ma'lumoti yo'q";
    const arr = b.mode === 'price' ? p.prices : p.items;
    if (!Array.isArray(arr) || arr.length > 500) return "Tahrir ro'yxati noto'g'ri";
    if (b.mode === 'price' && arr.some(x => !isNum(x, 0, 1e9))) return "Narx noto'g'ri";
    if (b.mode !== 'price') {
      for (const it of arr) {
        if (!it || typeof it !== 'object' || !Number.isSafeInteger(it.idx) || it.idx < 0) return "Tahrirdagi qator noto'g'ri";
        if (it.qty != null && !isNum(it.qty, 0, 1e6)) return "Miqdor noto'g'ri";
        if (it.sellUsd != null && !isNum(it.sellUsd, 0, 1e9)) return "Narx noto'g'ri";
      }
      if (p.discPct != null && !isNum(p.discPct, 0, 100)) return "Chegirma noto'g'ri";
      if (p.restockIds != null && (!Array.isArray(p.restockIds) || p.restockIds.length > 500 || p.restockIds.some(x => x != null && !ID_RE.test(String(x))))) return "Partiya ID'lari noto'g'ri";
    }
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
  catch (e) { return serverError(e, 'sale-ops', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { loadPermissions: true, fn: 'sale-ops' });
  if (!auth.ok) return auth.response;
  if (!auth.isAdmin && !SALE_LIKE.some(p => auth.permKeys.has(p))) {
    await logSecurityEvent(admin, auth.staff, 'permission_denied', { need: SALE_LIKE, fn: 'sale-ops', action: body.action });
    return json({ error: "Bu amal uchun ruxsatingiz yo'q" }, 403);
  }
  const filial = resolveFilial(auth, body.filial);
  const staffId = auth.isAdmin ? null : (auth.staff?.id ?? null);
  const staffName = auth.staff?.name || (auth.isAdmin ? 'Admin' : null);

  try {
    if (!(await ledgerAuthorityOn(admin))) {
      return json({ error: "Bu amal uchun 27-migratsiya qo'llanishi kerak", migrationPending: true }, 409);
    }
    const saleLocalId = String(body.saleLocalId);
    // v24 (31-migratsiya): tahrir/o'chirish — server vaqti bo'yicha muddat (admin 30, sotuvchi 7 kun), sotuvchi faqat
    // o'z savdosini («savdo.edit» bo'lsa — boshqalarnikini ham); oldingi/yangi qiymat auditga, adminga bildirishnoma
    const guarded = body.action !== 'return' && await v31On(admin);
    const role = roleClass(auth);
    const canOthers = role === 'admin' || auth.permKeys.has('savdo.edit');
    let rpc;
    if (body.action === 'return') {
      rpc = admin.rpc('sale_return_atomic', {
        p_filial: filial, p_op_key: body.key, p_sale_local_id: saleLocalId, p_pid: body.pid, p_qty: body.qty,
        p_batch_local_id: body.batchLocalId != null ? String(body.batchLocalId) : null, p_meta: cleanMeta(body.meta),
        p_staff_id: staffId, p_staff_name: staffName });
    } else if (body.action === 'void') {
      const args = {
        p_filial: filial, p_op_key: body.key, p_sale_local_id: saleLocalId, p_batch_ids: body.batchIds.map(String),
        p_meta: cleanMeta(body.meta), p_staff_id: staffId, p_staff_name: staffName };
      // v24.5 (34): haqdan to'langan savdo o'chirilsa — haq mijozga qaytadi (bitta tranzaksiyada)
      const v34 = guarded && await v34On(admin);
      rpc = guarded ? admin.rpc(v34 ? 'sale_void_v34' : 'sale_void_guarded', { ...args, p_role: role, p_can_others: canOthers }) : admin.rpc('sale_void_atomic', args);
    } else {
      // v24.5 (34): haqdan to'langan savdoni tahrirlash taqiqlanadi (qaytarish va o'chirish ishlaydi)
      if (guarded && await v34On(admin)) {
        const { data: cu, error: cuErr } = await admin.from('sale_credit_uses').select('sale_local_id').eq('filial', filial).eq('sale_local_id', saleLocalId).maybeSingle();
        if (cuErr) return serverError(cuErr, 'sale-ops', 'Server xatosi');
        if (cu) return json({ error: "Bu savdo mijoz haqidan toʻlangan — tahrirlab boʻlmaydi. Qaytarish yoki oʻchirishdan foydalaning" }, 409);
      }
      const p = body.payload;
      const payload = body.mode === 'price' ? { prices: p.prices }
        : { items: p.items.map(i => ({ idx: i.idx, qty: i.qty ?? null, sellUsd: i.sellUsd ?? null })),
            discPct: p.discPct ?? 0, restockIds: (p.restockIds || []).map(x => (x == null ? null : String(x))), meta: cleanMeta(p.meta) };
      const args = {
        p_filial: filial, p_op_key: body.key, p_sale_local_id: saleLocalId, p_mode: body.mode, p_payload: payload,
        p_staff_id: staffId, p_staff_name: staffName };
      rpc = guarded ? admin.rpc('sale_edit_guarded', { ...args, p_role: role, p_can_others: canOthers }) : admin.rpc('sale_edit_atomic', args);
    }
    const { data, error } = await rpc;
    if (error) return serverError(error, 'sale-ops', 'Amal bajarilmadi', 400);
    return json(redactLedgerResponse({ ...data, filial, ledger: true }, auth), 200);   // v24.8 (K2): tannarx — faqat ruxsat egasiga
  } catch (e) {
    return serverError(e, 'sale-ops', 'Server xatosi');
  }
};
