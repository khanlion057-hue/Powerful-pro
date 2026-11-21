// v24 (31-migratsiya): audit tarixi, bildirishnomalar va tahrirlash muddatlari — umumiy yordamchilar.
//  • v31On(admin)  — 31-migratsiya qo'llanganmi (fw_notifications jadvali bor). 60 soniya keshlanadi.
//    Qo'llanmagan bo'lsa server funksiyalari eski (27-migratsiya) yo'lda ishlashda davom etadi — hech narsa buzilmaydi.
//  • roleClass(auth) — tahrirlash muddati uchun rol: 'admin' (30 kun) yoki 'seller' (7 kun).
//    Admin: staff.role='admin' yoki «rollar.manage» ruxsati (Korxona egasi / Administrator RBAC rollari).
//  • notify / audit — ikkinchi darajali yozuvlar: xato bo'lsa asosiy amal to'xtamaydi, lekin xato LOGLANADI
//    (maxfiy ma'lumotsiz) va natijada qaytariladi — «jimgina yutilmaydi».
const { _isMissingRelation } = require('./cashAuthority');

const TTL_MS = 60 * 1000;
let _state = { on: null, at: 0 };

async function v31On(admin) {
  if (_state.on !== null && Date.now() - _state.at < TTL_MS) return _state.on;
  const { error } = await admin.from('fw_notifications').select('id').limit(1);
  if (error && !_isMissingRelation(error)) throw error;
  _state = { on: !error, at: Date.now() };
  return _state.on;
}
function _resetV31Cache() { _state = { on: null, at: 0 }; }

function roleClass(auth) {
  if (!auth) return 'seller';
  if (auth.isAdmin) return 'admin';
  return auth.permKeys && auth.permKeys.has('rollar.manage') ? 'admin' : 'seller';
}

const clip = (v, n) => (v == null ? null : String(v).slice(0, n));

async function notify(admin, row) {
  try {
    const rec = {
      filial: clip(row.filial, 40), audience: row.audience, audience_id: row.audienceId ?? null, kind: row.kind,
      title: clip(row.title, 200) || 'Bildirishnoma', body: clip(row.body, 1000), ref_type: clip(row.refType, 40), ref_id: clip(row.refId, 80),
      actor_name: clip(row.actorName, 200), actor_role: clip(row.actorRole, 20), dedupe_key: clip(row.dedupeKey, 200),
    };
    const { error } = await admin.from('fw_notifications').insert(rec);
    if (error) {
      if (String(error.code) === '23505') return { ok: true, duplicate: true };   // takror — allaqachon yozilgan
      console.error('[notify] bildirishnoma yozilmadi:', error.code || '', error.message || '');
      return { ok: false, error: 'notify_failed' };
    }
    return { ok: true };
  } catch (e) {
    console.error('[notify] bildirishnoma xatosi:', e && e.message);
    return { ok: false, error: 'notify_failed' };
  }
}

async function audit(admin, row) {
  try {
    const { error } = await admin.from('fw_audit_events').insert({
      filial: clip(row.filial, 40), entity: clip(row.entity, 40), entity_id: clip(row.entityId, 80), action: row.action,
      actor_id: row.actorId ?? null, actor_name: clip(row.actorName, 200), actor_role: row.actorRole || 'system',
      before: row.before ?? null, after: row.after ?? null, note: clip(row.note, 1000), op_key: clip(row.opKey, 160),
    });
    if (error) {
      if (String(error.code) === '23505') return { ok: true, duplicate: true };
      console.error('[audit] audit yozilmadi:', error.code || '', error.message || '');
      return { ok: false, error: 'audit_failed' };
    }
    return { ok: true };
  } catch (e) {
    console.error('[audit] audit xatosi:', e && e.message);
    return { ok: false, error: 'audit_failed' };
  }
}

module.exports = { v31On, roleClass, notify, audit, _resetV31Cache };

// v24.5 (34-migratsiya): mijoz haqi (ortiqcha to'lov) — customer_credit_balances jadvali bor-yo'qligi. 60 soniya keshlanadi.
let _s34 = { on: null, at: 0 };
async function v34On(admin) {
  if (_s34.on !== null && Date.now() - _s34.at < TTL_MS) return _s34.on;
  const { error } = await admin.from('customer_credit_balances').select('customer_local_id').limit(1);
  if (error && !_isMissingRelation(error)) throw error;
  _s34 = { on: !error, at: Date.now() };
  return _s34.on;
}
function _resetV34Cache() { _s34 = { on: null, at: 0 }; }
module.exports.v34On = v34On;
module.exports._resetV34Cache = _resetV34Cache;
