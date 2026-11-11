// Netlify Function — DILLER PUL YUBORADI (v23.8, 30-migratsiya). Egasi tasdiqlagan qoida:
//   • diller portaldan naqd so'm / karta / naqd $ yuboradi; so'm — SHU KUNGI KURS (serverdagi settings.usdUzs) bo'yicha
//     dollarga o'giriladi, kurs xabarnomada qotiriladi; diller qarzi DARHOL kamayadi;
//   • kassir (yoki Bosh kassa xodimi) bildirishnomani ko'radi: «Qabul qildim» — pul filial kassasiga tushadi
//     (kassa yopishda Bosh kassaga o'tadi); «Rad etish» — pul kelmagan, diller qarzi qaytadi.
//
// Amallar (POST { action, ... }):
//   DILLER (o'z tokeni — dealers.auth_user_id):
//     send      { payType:'cash_uzs'|'card'|'cash_usd', amount, note?, idemKey }
//     mine      {}                                          — o'z xabarnomalari (oxirgi 50)
//   XODIM:
//     list      { filial?, status? }                         [dillerlar.view | kassalar.view | kassalar.transact | firma_kassa.view]
//     accept    { id, boxId, filial? }                       [kassalar.transact | firma_kassa.transact]
//     reject    { id, reason, filial? }                      [kassalar.transact | firma_kassa.transact]
// 30-migratsiyasiz — 409 { migration30Pending:true }.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError, logSecurityEvent } = require('./_lib/supabaseAdmin');
const { _isMissingRelation, isMissingFunction, loadBranchBoxes } = require('./_lib/cashAuthority');
const { dealerAuth } = require('./_lib/dealerAuth');
const { v31On, notify } = require('./_lib/auditAuthority');

const PAY_TYPES = ['cash_uzs', 'card', 'cash_usd'];
const IDEM_RE = /^[A-Za-z0-9_-]{8,80}$/;
const READ_PERMS = ['dillerlar.view', 'dillerlar.manage', 'kassalar.view', 'kassalar.transact', 'firma_kassa.view', 'firma_kassa.transact'];
const WRITE_PERMS = ['kassalar.transact', 'firma_kassa.transact'];
const STAFF_ACTIONS = ['list', 'accept', 'reject'];
const isNum = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const pending = () => json({ error: "Diller to'lovi uchun 30-migratsiya qo'llanishi kerak — administratorga murojaat qiling", migration30Pending: true }, 409);

function validate(b) {
  if (!b || !['send', 'mine', ...STAFF_ACTIONS].includes(b.action)) return "Noma'lum amal";
  if (b.action === 'send') {
    if (!PAY_TYPES.includes(b.payType)) return "To'lov turi noto'g'ri";
    if (!isNum(b.amount, 0.01, 1e11)) return "Summa noto'g'ri";
    if (typeof b.idemKey !== 'string' || !IDEM_RE.test(b.idemKey)) return "Amal kaliti noto'g'ri";
    if (b.note != null && (typeof b.note !== 'string' || b.note.length > 300)) return 'Izoh juda uzun';
  }
  if (b.action === 'accept' || b.action === 'reject') {
    if (!Number.isSafeInteger(b.id) || b.id <= 0) return "Xabarnoma noto'g'ri";
    if (b.action === 'accept' && (!Number.isSafeInteger(b.boxId) || b.boxId <= 0)) return 'Kassa tanlanmagan';
    if (b.action === 'reject' && (typeof b.reason !== 'string' || b.reason.trim().length < 3 || b.reason.length > 300)) return 'Rad etish sababini yozing';
  }
  if (b.action === 'list' && b.status != null && !['pending', 'accepted', 'rejected', 'all'].includes(b.status)) return "Holat noto'g'ri";
  return null;
}

const noticeToClient = (n, names = {}) => n && ({
  id: Number(n.id), dealerId: Number(n.dealer_id), dealerName: names[n.dealer_id] || null, filial: n.filial, payType: n.pay_type,
  currency: n.currency, amount: Number(n.amount), rate: Number(n.rate), amountUsd: Number(n.amount_usd), note: n.note || null,
  status: n.status, boxId: n.box_local_id != null ? Number(n.box_local_id) : null, boxName: n.box_name || null,
  decidedAt: n.decided_at || null, decidedBy: n.decided_by_name || null, rejectReason: n.reject_reason || null, createdAt: n.created_at,
});

// v24 (31-migratsiya): kassir qaror qilganda dillerga bildirishnoma (ikkinchi darajali — xato loglanadi, amal to'xtamaydi)
async function notifyDealer(admin, notice, accepted, staffName) {
  try {
    if (!notice || !(await v31On(admin))) return null;
    const amt = notice.currency === 'USD' ? `${Number(notice.amount).toFixed(2)} $` : `${Math.round(Number(notice.amount)).toLocaleString('en-US').replace(/,/g, ' ')} soʻm`;
    const r = await notify(admin, { filial: notice.filial, audience: 'dealer', audienceId: Number(notice.dealer_id), kind: 'dealer_pay',
      title: accepted ? `Toʻlovingiz qabul qilindi: ${amt}` : `Toʻlovingiz rad etildi: ${amt}`,
      body: accepted ? `Kassir pulni kassaga qabul qildi${notice.box_name ? ' (' + notice.box_name + ')' : ''}.` : `Sabab: ${notice.reject_reason || '—'}. Qarzingiz qayta tiklandi.`,
      refType: 'dealer_pay', refId: String(notice.id), actorName: staffName || null, actorRole: 'admin',
      dedupeKey: `dealer_pay:${notice.id}:${accepted ? 'a' : 'r'}` });
    return r.ok;
  } catch (e) { console.error('[dealer-pay] bildirishnoma:', e && e.message); return false; }
}

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const body = parseBody(event);
  const vErr = validate(body);
  if (vErr) return json({ error: vErr }, 400);

  let admin;
  try { admin = getAdminClient(); } catch (e) { return serverError(e, 'dealer-pay', 'Server sozlanmagan — administratorga murojaat qiling'); }

  try {
    // ── Diller tomoni ──
    if (body.action === 'send' || body.action === 'mine') {
      const a = await dealerAuth(event, admin);
      if (!a.ok) return a.response;
      if (body.action === 'mine') {
        const { data, error } = await admin.from('dealer_pay_notices').select('*').eq('dealer_id', a.dealer.id).order('created_at', { ascending: false }).limit(50);
        if (error) { if (_isMissingRelation(error)) return pending(); throw error; }
        const { data: mainRow } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
        const r = Number(mainRow?.data?.settings?.usdUzs);
        return json({ ok: true, notices: (data || []).map(n => noticeToClient(n)), rate: r >= 100 ? r : null }, 200);
      }
      // Kurs — faqat serverdagi (administrator belgilagan kunlik kurs); diller yuborgan kurs ishlatilmaydi
      const { data: main } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
      const rate = Number(main?.data?.settings?.usdUzs);
      if (!(rate >= 100)) return json({ error: 'Kunlik kurs belgilanmagan — administratorga murojaat qiling' }, 409);
      const { data, error } = await admin.rpc('dealer_pay_notice_create', {
        p_dealer_id: a.dealer.id, p_pay_type: body.payType, p_amount: Math.round(body.amount * 100) / 100, p_rate: rate,
        p_note: body.note ? String(body.note).trim().slice(0, 300) : null, p_idem: 'd' + a.dealer.id + '-' + body.idemKey,
      });
      if (error) { if (isMissingFunction(error)) return pending(); return serverError(error, 'dealer-pay', "To'lov yuborilmadi", 400); }
      return json({ ok: true, replay: !!data.replay, notice: noticeToClient(data.notice), rate, dealerDebtUsd: Number(data.dealerDebtUsd), dealerTotalPaidUsd: Number(data.dealerTotalPaidUsd) }, 200);
    }

    // ── Xodim tomoni ──
    const auth = await requireStaffAuth(event, admin, { loadPermissions: true, fn: 'dealer-pay' });
    if (!auth.ok) return auth.response;
    const need = body.action === 'list' ? READ_PERMS : WRITE_PERMS;
    if (!auth.isAdmin && !need.some(k => auth.permKeys.has(k))) {
      await logSecurityEvent(admin, auth.staff, 'permission_denied', { need, fn: 'dealer-pay', action: body.action });
      return json({ error: "Bu amal uchun ruxsatingiz yo'q" }, 403);
    }
    const filial = resolveFilial(auth, body.filial);
    const staff = { p_staff_id: auth.isAdmin ? null : (auth.staff?.id ?? null), p_staff_name: auth.staff?.name || (auth.isAdmin ? 'Admin' : null) };

    if (body.action === 'list') {
      let q = admin.from('dealer_pay_notices').select('*').eq('filial', filial).order('created_at', { ascending: false }).limit(100);
      if (body.status && body.status !== 'all') q = q.eq('status', body.status);
      const { data, error } = await q;
      if (error) { if (_isMissingRelation(error)) return pending(); throw error; }
      const ids = [...new Set((data || []).map(n => n.dealer_id))];
      const names = {};
      if (ids.length) { const { data: ds } = await admin.from('dealers').select('id,name').in('id', ids); (ds || []).forEach(d => { names[d.id] = d.name; }); }
      return json({ ok: true, notices: (data || []).map(n => noticeToClient(n, names)) }, 200);
    }

    if (body.action === 'accept') {
      // Kassa — shu filialning haqiqiy kassasi; valyutasi xabarnomaga mos; Shaxsiy kassa emas
      const { data: n, error: ne } = await admin.from('dealer_pay_notices').select('currency,filial').eq('id', body.id).maybeSingle();
      if (ne) { if (_isMissingRelation(ne)) return pending(); throw ne; }
      if (!n || n.filial !== filial) return json({ error: 'Xabarnoma topilmadi' }, 404);
      const { boxes } = await loadBranchBoxes(admin, filial);
      const box = boxes.find(b => Number(b.id) === body.boxId);
      if (!box || box.type === 'qobiljon') return json({ error: 'Kassa topilmadi' }, 400);
      if (box.cur !== n.currency) return json({ error: `Kassa valyutasi ${box.cur}, toʻlov ${n.currency} da` }, 400);
      const { data, error } = await admin.rpc('dealer_pay_notice_accept', { p_id: body.id, p_filial: filial, p_box: body.boxId, p_box_name: String(box.name || '').slice(0, 200), ...staff });
      if (error) { if (isMissingFunction(error)) return pending(); return serverError(error, 'dealer-pay', 'Qabul qilinmadi', 400); }
      if (!data.replay) await notifyDealer(admin, data.notice, true, staff.p_staff_name);
      return json({ ok: true, replay: !!data.replay, notice: noticeToClient(data.notice), balances: data.balances || {} }, 200);
    }

    // reject
    const { data, error } = await admin.rpc('dealer_pay_notice_reject', { p_id: body.id, p_filial: filial, p_reason: body.reason.trim(), ...staff });
    if (error) { if (isMissingFunction(error)) return pending(); return serverError(error, 'dealer-pay', 'Rad etilmadi', 400); }
    if (!data.replay) await notifyDealer(admin, data.notice, false, staff.p_staff_name);
    return json({ ok: true, replay: !!data.replay, notice: noticeToClient(data.notice), dealerDebtUsd: Number(data.dealerDebtUsd), dealerTotalPaidUsd: Number(data.dealerTotalPaidUsd) }, 200);
  } catch (e) {
    return serverError(e, 'dealer-pay', 'Server xatosi');
  }
};
