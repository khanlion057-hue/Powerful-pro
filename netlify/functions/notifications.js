// Netlify Function — BILDIRISHNOMALAR, SAVDO TARIXI (audit) va DILLER OMBOR REVIZIYASI (v24, 31-migratsiya).
// Egasi tasdiqlagan qoida: bildirishnomalar alohida jadvalda; 7 kundan eskilari «Arxiv»da ko'rinadi (o'chirilmaydi);
// moliyaviy yozuvlar va audit izlari hech qachon avtomatik o'chirilmaydi.
//
// Amallar (POST { action, ... }):
//   XODIM (Supabase sessiyasi — staff):
//     list     { scope:'active'|'archive', limit? }   — o'z auditoriyasi: admin-sinf → 'admin', boshqalar → 'seller' (o'z filiali)
//     read     { ids:[...] }                           — «o'qildi» (faqat o'ziga ko'rinadiganlar)
//     history  { entity?, entityId?, days?, limit? }   — savdo hodisalari (yaratish/tahrir/o'chirish/zarar, diller chegirma, reviziya)
//                                                         admin-sinf: filial bo'yicha (admin — barcha filial); sotuvchi — faqat o'zi bajarganlar
//   DILLER (o'z tokeni — dealers.auth_user_id):
//     dealer_list     { scope }        — diller bildirishnomalari
//     dealer_read     { ids }
//     rev_summary     {}               — har mahsulot: qabul qilingan, sotilgan, qaytarilgan, tizimdagi qoldiq (serverdan)
//     rev_submit      { lines:[{pid, counted}], reason, idemKey }
//                                       — jismoniy sanoq tizim qoldig'i bilan solishtiriladi; natija, kim, qachon, sabab
//                                         o'zgarmas auditga yoziladi va administratorga bildirishnoma boradi.
//                                         32-migratsiyadan keyin — «kutilmoqda» bo'lib saqlanadi; administrator (yoki
//                                         «dillerlar.manage») TASDIQLASA kamomad → sotuv, ortiqcha → qaytish (rev_decide).
//                                         32-migratsiyasiz — avvalgidek faqat qayd (qoldiq o'zgarmaydi).
//     rev_mine        {}               — o'z reviziyalari va holati (v24.2)
//   XODIM (v24.2, 32-migratsiya; admin yoki «dillerlar.manage»):
//     rev_list   { status? }            — reviziyalar (standart: kutilmoqda); admin — barcha filial, boshqalar — o'z filiali
//     rev_decide { id, approve, note }  — tasdiqlash (kamomad → sotuv, ortiqcha → qaytish; qarz optom narxda) yoki rad etish;
//                                         bitta tranzaksiya, takror bosish ikki marta yozmaydi; qoldiq o'zgargan bo'lsa — rad.
// 31-migratsiyasiz — 409 { migration31Pending:true }; 32-migratsiyasiz rev_list/rev_decide — 409 { migration32Pending:true }.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');
const { _isMissingRelation } = require('./_lib/cashAuthority');
const { dealerAuth } = require('./_lib/dealerAuth');
const { roleClass, notify, audit } = require('./_lib/auditAuthority');

const DAY = 24 * 3600 * 1000;
const ARCHIVE_DAYS = 7;
const IDEM_RE = /^[A-Za-z0-9_-]{8,80}$/;
const STAFF_ACTIONS = ['list', 'read', 'history', 'rev_list', 'rev_decide'];
const DEALER_ACTIONS = ['dealer_list', 'dealer_read', 'rev_summary', 'rev_submit', 'rev_mine'];
const pending32 = () => json({ error: "Reviziyani tasdiqlash uchun 32-migratsiya qo'llanishi kerak — administratorga murojaat qiling", migration32Pending: true }, 409);
const pending = () => json({ error: "Bildirishnomalar uchun 31-migratsiya qo'llanishi kerak — administratorga murojaat qiling", migration31Pending: true }, 409);

function validate(b) {
  if (!b || ![...STAFF_ACTIONS, ...DEALER_ACTIONS].includes(b.action)) return "Noma'lum amal";
  if ((b.action === 'list' || b.action === 'dealer_list') && b.scope != null && !['active', 'archive'].includes(b.scope)) return "Ko'rinish noto'g'ri";
  if (b.limit != null && !(Number.isSafeInteger(b.limit) && b.limit > 0 && b.limit <= 200)) return "Limit noto'g'ri";
  if ((b.action === 'read' || b.action === 'dealer_read') && (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 200 || b.ids.some(x => !Number.isSafeInteger(x) || x <= 0))) return "ID'lar noto'g'ri";
  if (b.action === 'history') {
    if (b.entity != null && !['sale', 'dealer_sale', 'dealer_stock'].includes(b.entity)) return "Tur noto'g'ri";
    if (b.entityId != null && !/^[0-9A-Za-z_.:-]{1,80}$/.test(String(b.entityId))) return "ID noto'g'ri";
    if (b.days != null && !(Number.isSafeInteger(b.days) && b.days > 0 && b.days <= 3650)) return "Davr noto'g'ri";
  }
  if (b.action === 'rev_list' && b.status != null && !['pending', 'approved', 'rejected', 'all'].includes(b.status)) return "Holat noto'g'ri";
  if (b.action === 'rev_decide') {
    if (!Number.isSafeInteger(b.id) || b.id <= 0) return "Reviziya ID noto'g'ri";
    if (typeof b.approve !== 'boolean') return "Qaror noto'g'ri";
    if (b.note != null && (typeof b.note !== 'string' || b.note.length > 500)) return 'Izoh juda uzun';
    if (b.approve === false && !(typeof b.note === 'string' && b.note.trim())) return 'Rad etish sababini yozing';
  }
  if (b.action === 'rev_submit') {
    if (!Array.isArray(b.lines) || !b.lines.length || b.lines.length > 500) return "Reviziya qatorlari noto'g'ri";
    for (const l of b.lines) if (!l || !Number.isSafeInteger(l.pid) || l.pid <= 0 || typeof l.counted !== 'number' || !Number.isFinite(l.counted) || l.counted < 0 || l.counted > 1e6) return "Sanoq noto'g'ri";
    if (new Set(b.lines.map(l => l.pid)).size !== b.lines.length) return 'Mahsulot takrorlangan';
    if (typeof b.reason !== 'string' || b.reason.length > 500) return 'Izoh juda uzun';
    if (typeof b.idemKey !== 'string' || !IDEM_RE.test(b.idemKey)) return "Amal kaliti noto'g'ri";
  }
  return null;
}

const notifOut = (n) => ({
  id: Number(n.id), createdAt: n.created_at, filial: n.filial, kind: n.kind, title: n.title, body: n.body || '',
  refType: n.ref_type || null, refId: n.ref_id || null, actor: n.actor_name || null, actorRole: n.actor_role || null, read: !!n.read_at,
});
const auditOut = (a) => ({
  id: Number(a.id), createdAt: a.created_at, filial: a.filial, entity: a.entity, entityId: a.entity_id, action: a.action,
  actor: a.actor_name || null, actorRole: a.actor_role, before: a.before || null, after: a.after || null, note: a.note || '',
});

function scopeFilter(rows, scope) {
  const edge = Date.now() - ARCHIVE_DAYS * DAY;
  return rows.filter(r => (scope === 'archive') === (new Date(r.created_at).getTime() < edge));
}

async function staffList(admin, auth, body) {
  const cls = roleClass(auth);
  let q = admin.from('fw_notifications').select('*').eq('audience', cls === 'admin' ? 'admin' : 'seller');
  if (!auth.isAdmin) q = q.eq('filial', auth.filial);
  const edgeIso = new Date(Date.now() - ARCHIVE_DAYS * DAY).toISOString();
  q = (body.scope === 'archive') ? q.lt('created_at', edgeIso) : q.gte('created_at', edgeIso);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(body.limit || 100);
  if (error) return { error };
  const mine = (data || []).filter(n => n.audience_id == null || Number(n.audience_id) === Number(auth.staff.id));
  return { rows: scopeFilter(mine, body.scope || 'active') };
}

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const body = parseBody(event);
  const vErr = validate(body);
  if (vErr) return json({ error: vErr }, 400);

  let admin;
  try { admin = getAdminClient(); } catch (e) { return serverError(e, 'notifications', 'Server sozlanmagan — administratorga murojaat qiling'); }

  try {
    // ── Diller tomoni ──
    if (DEALER_ACTIONS.includes(body.action)) {
      const a = await dealerAuth(event, admin);
      if (!a.ok) return a.response;
      const d = a.dealer;
      if (body.action === 'dealer_list') {
        const edgeIso = new Date(Date.now() - ARCHIVE_DAYS * DAY).toISOString();
        let q = admin.from('fw_notifications').select('*').eq('audience', 'dealer').eq('audience_id', d.id);
        q = body.scope === 'archive' ? q.lt('created_at', edgeIso) : q.gte('created_at', edgeIso);
        const { data, error } = await q.order('created_at', { ascending: false }).limit(body.limit || 100);
        if (error) { if (_isMissingRelation(error)) return pending(); throw error; }
        const rows = data || [];
        return json({ ok: true, scope: body.scope || 'active', items: rows.map(notifOut), unread: rows.filter(n => !n.read_at).length }, 200);
      }
      if (body.action === 'dealer_read') {
        const { error } = await admin.from('fw_notifications').update({ read_at: new Date().toISOString() })
          .eq('audience', 'dealer').eq('audience_id', d.id).in('id', body.ids).is('read_at', null);
        if (error) { if (_isMissingRelation(error)) return pending(); throw error; }
        return json({ ok: true }, 200);
      }
      // Reviziya: hisob faqat serverdagi yozuvlardan (diller yuborgan "tizim qoldig'i" qabul qilinmaydi)
      const [st, mv, sl] = await Promise.all([
        admin.from('dealer_stock').select('pid,sku,name,qty').eq('dealer_id', d.id),
        admin.from('dealer_stock_moves').select('pid,type,qty,condition').eq('dealer_id', d.id),
        admin.from('dealer_sales').select('pid,qty').eq('dealer_id', d.id),
      ]);
      for (const r of [st, mv, sl]) if (r.error) throw r.error;
      const map = new Map();
      const row = (pid, sku, name) => { const k = Number(pid); if (!map.has(k)) map.set(k, { pid: k, sku: sku || '', name: name || '', received: 0, sold: 0, returned: 0, system: 0 }); const r = map.get(k); if (sku && !r.sku) r.sku = sku; if (name && !r.name) r.name = name; return r; };
      (st.data || []).forEach(r => { row(r.pid, r.sku, r.name).system = Number(r.qty) || 0; });
      (mv.data || []).forEach(m => { const r = row(m.pid); if (m.type === 'send') r.received += Number(m.qty) || 0; else if (m.type === 'return') r.returned += Number(m.qty) || 0; });
      (sl.data || []).forEach(s => { row(s.pid).sold += Number(s.qty) || 0; });
      const items = [...map.values()].sort((x, y) => String(x.name).localeCompare(String(y.name)));
      if (body.action === 'rev_summary') return json({ ok: true, items }, 200);
      if (body.action === 'rev_mine') {
        const { data, error } = await admin.from('fw_dealer_revisions').select('id,created_at,status,shortage_qty,surplus_qty,decided_at,decision_note,result')
          .eq('dealer_id', d.id).order('created_at', { ascending: false }).limit(20);
        if (error) { if (_isMissingRelation(error)) return json({ ok: true, items: [], migration32Pending: true }, 200); throw error; }
        return json({ ok: true, items: (data || []).map(revOut) }, 200);
      }

      // rev_submit
      const opKey = 'drev:' + d.id + ':' + body.idemKey;
      const lines = body.lines.map(l => {
        const r = map.get(Number(l.pid));
        const system = r ? r.system : 0;
        const diff = Math.round((l.counted - system) * 1000) / 1000;
        return { pid: l.pid, sku: r ? r.sku : '', name: r ? r.name : '', system, counted: l.counted, diff };
      });
      const shortage = lines.filter(l => l.diff < 0).reduce((s, l) => s - l.diff, 0);
      const surplus = lines.filter(l => l.diff > 0).reduce((s, l) => s + l.diff, 0);
      const after = { lines, shortageQty: shortage, surplusQty: surplus, reason: body.reason.trim().slice(0, 500), dealerId: d.id, dealerName: d.name };
      const aRes = await audit(admin, { filial: d.filial, entity: 'dealer_stock', entityId: String(d.id), action: 'revision', actorId: d.id, actorName: d.name,
        actorRole: 'dealer', after, note: `Diller reviziyasi: ${lines.length} xil, kamomad ${shortage}, ortiqcha ${surplus}`, opKey });
      if (!aRes.ok) {
        const probe = await admin.from('fw_audit_events').select('id').limit(1);
        if (probe.error && _isMissingRelation(probe.error)) return pending();
        return json({ error: 'Reviziya saqlanmadi — qayta urinib koʻring' }, 500);
      }
      // v24.2 (32-migratsiya): farq bo'lsa — «kutilmoqda» reviziya (administrator tasdig'i bilan sotuv/qaytish)
      let revId = null, approvable = false;
      if (shortage > 0 || surplus > 0) {
        const ins = await admin.from('fw_dealer_revisions').insert({ filial: d.filial || 'baza', dealer_id: d.id, dealer_name: String(d.name || '').slice(0, 200),
          lines, reason: after.reason || null, shortage_qty: shortage, surplus_qty: surplus, op_key: opKey }).select('id').single();
        if (!ins.error) { revId = Number(ins.data.id); approvable = true; }
        else if (ins.error.code === '23505') {
          const ex = await admin.from('fw_dealer_revisions').select('id').eq('op_key', opKey).maybeSingle();
          if (!ex.error && ex.data) { revId = Number(ex.data.id); approvable = true; }
        } else if (!_isMissingRelation(ins.error)) throw ins.error;
      }
      if (aRes.duplicate) return json({ ok: true, replay: true, result: after, revisionId: revId, approvable }, 200);
      const nRes = await notify(admin, { filial: d.filial, audience: 'admin', kind: 'dealer_revision', title: `Diller reviziyasi: ${d.name}`,
        body: `${lines.length} xil mahsulot sanaldi. Kamomad: ${shortage} dona, ortiqcha: ${surplus} dona. Sabab: ${after.reason || '—'}. `
          + (approvable ? 'Tasdiqlansa: kamomad — sotuv, ortiqcha — qaytish (Dillerlar → Reviziyalar).' : 'Qoldiq avtomatik oʻzgartirilmadi.'),
        refType: approvable ? 'dealer_revision' : 'dealer', refId: String(approvable ? revId : d.id), actorName: d.name, actorRole: 'dealer', dedupeKey: opKey });
      return json({ ok: true, replay: false, result: after, revisionId: revId, approvable, notified: nRes.ok }, 200);
    }

    // ── Xodim tomoni ──
    const auth = await requireStaffAuth(event, admin, { loadPermissions: true, fn: 'notifications' });
    if (!auth.ok) return auth.response;
    if (body.action === 'list') {
      const r = await staffList(admin, auth, body);
      if (r.error) { if (_isMissingRelation(r.error)) return pending(); throw r.error; }
      return json({ ok: true, scope: body.scope || 'active', items: r.rows.map(notifOut), unread: r.rows.filter(n => !n.read_at).length }, 200);
    }
    if (body.action === 'read') {
      const r = await staffList(admin, auth, { scope: 'active', limit: 200 });
      if (r.error) { if (_isMissingRelation(r.error)) return pending(); throw r.error; }
      const r2 = await staffList(admin, auth, { scope: 'archive', limit: 200 });
      const allowed = new Set([...(r.rows || []), ...((r2 && r2.rows) || [])].map(n => Number(n.id)));
      const ids = body.ids.filter(id => allowed.has(id));
      if (ids.length) {
        const { error } = await admin.from('fw_notifications').update({ read_at: new Date().toISOString() }).in('id', ids).is('read_at', null);
        if (error) throw error;
      }
      return json({ ok: true, marked: ids.length }, 200);
    }
    if (body.action === 'rev_list' || body.action === 'rev_decide') {
      const canRev = roleClass(auth) === 'admin' || (auth.permKeys && auth.permKeys.has('dillerlar.manage'));
      if (!canRev) return json({ error: "Reviziyani koʻrish/tasdiqlash huquqi yoʻq (dillerlar.manage)" }, 403);
      if (body.action === 'rev_list') {
        let q = admin.from('fw_dealer_revisions').select('*');
        if (!auth.isAdmin) q = q.eq('filial', auth.filial);
        const st = body.status || 'pending';
        if (st !== 'all') q = q.eq('status', st);
        const { data, error } = await q.order('created_at', { ascending: false }).limit(body.limit || 100);
        if (error) { if (_isMissingRelation(error)) return pending32(); throw error; }
        return json({ ok: true, items: (data || []).map(r => ({ ...revOut(r), dealerId: Number(r.dealer_id), dealerName: r.dealer_name, filial: r.filial, lines: r.lines, reason: r.reason || '', decidedBy: r.decided_by_name || null })) }, 200);
      }
      const revArgs = {
        p_id: body.id, p_approve: body.approve, p_actor_id: auth.isAdmin ? null : (auth.staff?.id ?? null),
        p_actor_name: auth.staff?.name || 'Admin', p_actor_role: roleClass(auth), p_note: body.note || null,
        p_filial: auth.isAdmin ? null : auth.filial,
      };
      // v25 (42): qarzga olingan tovar kamomadi qarzni qayta yozmaydi — bo'lsa _v42, bo'lmasa avvalgidek
      let { data, error } = await admin.rpc('dealer_revision_decide_v42', revArgs);
      if (error && (error.code === 'PGRST202' || error.code === '42883' || /dealer_revision_decide_v42/.test(String(error.message || '')))) {
        ({ data, error } = await admin.rpc('dealer_revision_decide', revArgs));
      }
      if (error) {
        const m = String(error.message || '');
        if (/dealer_revision_decide/.test(m) && /does not exist|could not find|not find the function/i.test(m)) return pending32();
        if (_isMissingRelation(error)) return pending32();
        if (/REV_STALE|REVIZIYA:/.test(m)) return json({ error: m.replace(/^.*?(REV_STALE: |REVIZIYA: )/, ''), code: /REV_STALE/.test(m) ? 'REV_STALE' : 'REV_DENIED' }, 409);
        throw error;
      }
      return json({ ok: true, ...data }, 200);
    }
    // history
    const cls = roleClass(auth);
    let q = admin.from('fw_audit_events').select('*');
    if (!auth.isAdmin) q = q.eq('filial', auth.filial);
    if (cls !== 'admin') q = q.eq('actor_id', auth.staff.id);
    if (body.entity) q = q.eq('entity', body.entity);
    if (body.entityId != null) q = q.eq('entity_id', String(body.entityId));
    if (body.days) q = q.gte('created_at', new Date(Date.now() - body.days * DAY).toISOString());
    const { data, error } = await q.order('created_at', { ascending: false }).limit(body.limit || 100);
    if (error) { if (_isMissingRelation(error)) return pending(); throw error; }
    let rows = data || [];
    // Sotuvchi tannarxni ko'rmaydi — audit yozuvlaridan tannarx/zarar maydonlari olib tashlanadi
    if (cls !== 'admin') rows = rows.map(a => ({ ...a, before: stripCost(a.before), after: stripCost(a.after) }));
    return json({ ok: true, items: rows.map(auditOut) }, 200);
  } catch (e) {
    return serverError(e, 'notifications', 'Server xatosi');
  }
};

function revOut(r) {
  return { id: Number(r.id), createdAt: r.created_at, status: r.status, shortageQty: Number(r.shortage_qty) || 0, surplusQty: Number(r.surplus_qty) || 0,
    decidedAt: r.decided_at || null, note: r.decision_note || '', result: r.result || null };
}

function stripCost(v) {
  if (!v || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(stripCost);
  const o = {};
  for (const [k, x] of Object.entries(v)) { if (/^(cost|costUsd|cost_usd|profitUsd|profit_usd|lossUsd)$/.test(k)) continue; o[k] = stripCost(x); }
  return o;
}
