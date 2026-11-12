// Netlify Function — TA'MINOTCHIGA ZAKLAD (oldindan to'lov), v24.4 (33-migratsiya).
// Egasi qoidasi (2026-10-14): Xitoy ta'minotchisiga zaklad YUANDA beriladi, pul har doim $ KASSADAN chiqadi;
// ta'minotchiga faqat yuan summasi ($ ga o'girilgan) zaklad bo'lib yoziladi, bank/agent xizmati (masalan 0,6%) —
// alohida XARAJAT. Masalan: 10 000 ¥ + 0,6%, kurs 6,65 → kassadan 1 512,78 $; zaklad 1 503,76 $, xarajat 9,02 $.
// Zaklad ta'minotchi qarzidan ALOHIDA saqlanadi; tovar kelgach «Zakladdan yopish» — qarz zakladdan kamayadi.
//
// POST { action, ... }
//   list   { filial? }                                                       — zaklad qoldiqlari va oxirgi yozuvlar
//   pay    { filial?, suppId, source:'box'|'firma', boxId?, cny, feePct, rate, idemKey, note? }
//          box   — filialning $ kassasi [taminotchilar.edit | kirim.create]
//          firma — Bosh kassa $       [firma_kassa.transact + (taminotchilar.edit | kirim.create)]
//   apply  { filial?, suppId, amountUsd, idemKey }                            — qarzni zakladdan yopish [taminotchilar.edit]
// v25 (45): pay { currency:'CNY'|'USD'|'UZS', amount } — yuan ($ kassadan), $ ($ kassadan) yoki so'm (so'm kassadan);
//   eski { cny, rate } ham qabul qilinadi (= CNY). apply { amountUzs } — so'mdagi ta'minotchi uchun (qarz so'mma-so'm).
// Hammasi serverda bitta tranzaksiyada; takror so'rov (o'sha idemKey) ikki marta yozilmaydi.
// 33-migratsiyasiz — 409 { migration33Pending:true }.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError, logSecurityEvent } = require('./_lib/supabaseAdmin');
const { isMissingFunction, loadBranchBoxes, _isMissingRelation } = require('./_lib/cashAuthority');

const IDEM_RE = /^[A-Za-z0-9_.:-]{8,100}$/;
const PAY_PERMS = ['taminotchilar.edit', 'kirim.create'];
const RATE_BAND = 0.25;   // kurs sozlamadagi yuan kursidan ±25% dan oshmasin (bank kursi kunlik farq qiladi)
const str = (v, max) => (v == null ? null : String(v).slice(0, max));
const pending = () => json({ error: "Zaklad uchun 33-migratsiya qo'llanishi kerak — administratorga murojaat qiling", migration33Pending: true }, 409);

function validate(b) {
  if (!b || typeof b !== 'object') return "Noto'g'ri so'rov formati";
  if (!['list', 'pay', 'apply'].includes(b.action)) return "Noma'lum amal";
  if (b.filial != null && !/^[A-Za-z0-9_-]{1,40}$/.test(String(b.filial))) return "Filial noto'g'ri";
  if (b.action === 'list') return null;
  if (!Number.isSafeInteger(b.suppId) || b.suppId <= 0) return "Ta'minotchi noto'g'ri";
  if (typeof b.idemKey !== 'string' || !IDEM_RE.test(b.idemKey)) return "Amal kaliti noto'g'ri";
  if (b.action === 'pay') {
    if (!['box', 'firma'].includes(b.source)) return "Pul manbai noto'g'ri";
    if (b.source === 'box' && !(Number.isSafeInteger(b.boxId) && b.boxId >= 0)) return 'Kassa tanlanmagan';
    const cur = b.currency == null ? 'CNY' : b.currency;
    if (!['CNY', 'USD', 'UZS'].includes(cur)) return "Valyuta noto'g'ri";
    const amt = cur === 'CNY' && b.amount == null ? b.cny : b.amount;
    if (typeof amt !== 'number' || !Number.isFinite(amt) || amt <= 0 || amt > (cur === 'UZS' ? 1e11 : 1e9)) return cur === 'CNY' ? "Yuan summasi musbat son bo'lishi kerak" : "Summa musbat son bo'lishi kerak";
    if (typeof b.feePct !== 'number' || !Number.isFinite(b.feePct) || b.feePct < 0 || b.feePct > 5) return "Xizmat foizi 0–5% oralig'ida bo'lishi kerak";
    if (cur === 'CNY' && (typeof b.rate !== 'number' || !Number.isFinite(b.rate) || b.rate < 1 || b.rate > 50)) return "Yuan kursi noto'g'ri (1 $ = ? ¥)";
    if (b.note != null && String(b.note).length > 500) return 'Izoh juda uzun';
  }
  if (b.action === 'apply') {
    const v = b.amountUzs != null ? b.amountUzs : b.amountUsd;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > (b.amountUzs != null ? 1e11 : 1e9)) return "Summa musbat son bo'lishi kerak";
  }
  return null;
}

function friendly(error) {
  const m = String((error && error.message) || '');
  const hit = /(ZAKLAD|LEDGER|CASHBOX|FIRMA_KASSA): ?(.*)$/s.exec(m);
  return hit ? hit[2].trim() : null;
}

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const body = parseBody(event);
  const vErr = validate(body);
  if (vErr) return json({ error: vErr }, 400);

  let admin;
  try { admin = getAdminClient(); } catch (e) { return serverError(e, 'supplier-advance', 'Server sozlanmagan — administratorga murojaat qiling'); }
  const auth = await requireStaffAuth(event, admin, { loadPermissions: true, fn: 'supplier-advance' });
  if (!auth.ok) return auth.response;
  const has = (k) => auth.isAdmin || (auth.permKeys && auth.permKeys.has(k));
  const filial = resolveFilial(auth, body.filial);

  try {
    if (body.action === 'list') {
      if (!(has('taminotchilar.view') || PAY_PERMS.some(has))) return json({ error: "Ta'minotchilarni ko'rish huquqi yo'q" }, 403);
      // v25 (45): so'mdagi zaklad (balance_uzs) — ustun bo'lmasa (45 qo'llanmagan) avvalgidek
      let bq = await admin.from('supplier_advance_balances').select('supplier_local_id,balance_usd,balance_uzs').eq('filial', filial);
      if (bq.error) bq = await admin.from('supplier_advance_balances').select('supplier_local_id,balance_usd').eq('filial', filial);
      const [b, l] = await Promise.all([
        Promise.resolve(bq),
        admin.from('supplier_advance_ledger').select('*').eq('filial', filial).order('id', { ascending: false }).limit(100),
      ]);
      for (const r of [b, l]) if (r.error) { if (_isMissingRelation(r.error)) return json({ ok: true, balances: {}, items: [], migration33Pending: true }, 200); throw r.error; }
      const balances = {}, balancesUzs = {};
      (b.data || []).forEach(r => { balances[String(r.supplier_local_id)] = Math.round(Number(r.balance_usd) * 100) / 100; if (Number(r.balance_uzs) > 0) balancesUzs[String(r.supplier_local_id)] = Math.round(Number(r.balance_uzs)); });
      const items = (l.data || []).map(r => ({ id: Number(r.id), createdAt: r.created_at, suppId: Number(r.supplier_local_id), suppName: r.supplier_name, kind: r.kind,
        cny: r.cny_amount == null ? null : Number(r.cny_amount), feePct: r.fee_pct == null ? null : Number(r.fee_pct), rate: r.rate == null ? null : Number(r.rate),
        usd: Number(r.usd_amount), feeUsd: Number(r.fee_usd), source: r.source, boxId: r.box_local_id, balanceAfter: Number(r.balance_after), staff: r.staff_name, note: r.note,
        currency: r.currency || (r.cny_amount != null ? 'CNY' : 'USD'), amount: r.amount_native == null ? null : Number(r.amount_native), uzs: r.uzs_amount == null ? null : Number(r.uzs_amount) }));
      return json({ ok: true, filial, balances, balancesUzs, items }, 200);
    }

    // Ta'minotchi — shu filialning SERVERDAGI ma'lumotidan (nom ham serverdan)
    const { boxes, branch } = await loadBranchBoxes(admin, filial);
    const sp = (Array.isArray(branch && branch.suppliers) ? branch.suppliers : []).find(x => x && Number(x.id) === body.suppId);
    if (!sp) return json({ error: "Ta'minotchi topilmadi" }, 400);
    const staff = { p_staff_id: auth.isAdmin ? null : (auth.staff?.id ?? null), p_staff_name: auth.staff?.name || (auth.isAdmin ? 'Admin' : null) };

    if (body.action === 'pay') {
      const need = body.source === 'firma' ? ['firma_kassa.transact'] : [];
      if (!PAY_PERMS.some(has) || !need.every(has)) {
        await logSecurityEvent(admin, auth.staff, 'permission_denied', { need: [...PAY_PERMS, ...need], fn: 'supplier-advance', action: 'pay' });
        return json({ error: "Zaklad berish huquqingiz yo'q" }, 403);
      }
      let box = null;
      if (body.source === 'box') {
        box = boxes.find(x => Number(x.id) === body.boxId);
        if (!box) return json({ error: 'Kassa topilmadi' }, 400);
        const want = body.currency === 'UZS' ? 'UZS' : 'USD';   // yuan va $ — $ kassadan, so'm — so'm kassadan
        if (box.cur !== want) return json({ error: want === 'UZS' ? "So'mdagi zaklad so'm kassadan beriladi" : "Bu zaklad $ kassadan beriladi" }, 400);
        if (box.type === 'dealer') return json({ error: "Diller kassasidan zaklad berilmaydi" }, 400);
      }
      // Kurs nazorati: sozlamadagi yuan kursi bo'lsa — ±25%
      const { data: main } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
      const cur = body.currency == null ? 'CNY' : body.currency, amount = cur === 'CNY' && body.amount == null ? body.cny : body.amount;
      const setRate = Number(main?.data?.settings?.usdCny) || null;
      if (cur === 'CNY' && setRate && Math.abs(body.rate - setRate) > setRate * RATE_BAND) return json({ error: `Kurs (${body.rate}) sozlamadagi yuan kursidan (${setRate}) juda farq qiladi` }, 400);
      const base = { p_filial: filial, p_op_key: 'sadv:' + body.idemKey, p_supp: body.suppId, p_supp_name: str(sp.name, 200), p_source: body.source,
        p_box: box ? body.boxId : null, p_box_name: box ? str(box.name, 200) : null, p_fee_pct: body.feePct, p_note: str(body.note, 500), ...staff };
      let { data, error } = await admin.rpc('supplier_advance_pay_v45', { ...base, p_currency: cur, p_amount: amount, p_rate: cur === 'CNY' ? body.rate : null });
      if (error && isMissingFunction(error)) {
        if (cur !== 'CNY') return json({ error: "$ yoki so'mdagi zaklad uchun 45-migratsiya qo'llanishi kerak", code: 'MIGRATION45_PENDING' }, 409);
        ({ data, error } = await admin.rpc('supplier_advance_pay', { ...base, p_cny: amount, p_rate: body.rate }));
      }
      if (error && isMissingFunction(error)) return pending();
      if (error) { const f = friendly(error); if (f) return json({ error: f }, 400); return serverError(error, 'supplier-advance', 'Zaklad berilmadi', 400); }
      return json({ ok: true, filial, payment: data }, 200);
    }

    // apply
    if (!has('taminotchilar.edit')) {
      await logSecurityEvent(admin, auth.staff, 'permission_denied', { need: ['taminotchilar.edit'], fn: 'supplier-advance', action: 'apply' });
      return json({ error: "Ta'minotchi hisobini o'zgartirish huquqingiz yo'q" }, 403);
    }
    // Summa birligi ta'minotchi valyutasiga mos bo'lsin (so'm $ deb yoki aksincha o'qilmasin)
    const cq = await admin.from('supplier_balances').select('currency').eq('filial', filial).eq('supplier_local_id', body.suppId).maybeSingle();
    const suppUzs = !cq.error && cq.data && cq.data.currency === 'UZS';
    if (suppUzs && body.amountUzs == null) return json({ error: "Bu ta'minotchi qarzi so'mda — sahifani yangilang va summani so'mda kiriting" }, 400);
    if (!suppUzs && body.amountUzs != null) return json({ error: "Bu ta'minotchi qarzi $ da — summani $ da kiriting" }, 400);
    const applyBase = { p_filial: filial, p_op_key: 'sadp:' + body.idemKey, p_supp: body.suppId, p_supp_name: str(sp.name, 200), ...staff };
    // v25 (45): so'mdagi ta'minotchi — summa so'mda (amountUzs); $ dagi — $ da (avvalgidek)
    let { data, error } = await admin.rpc('supplier_advance_apply_v45', { ...applyBase, p_amount: body.amountUzs != null ? body.amountUzs : body.amountUsd });
    if (error && isMissingFunction(error)) {
      if (body.amountUzs != null) return json({ error: "So'mdagi zaklad uchun 45-migratsiya qo'llanishi kerak", code: 'MIGRATION45_PENDING' }, 409);
      ({ data, error } = await admin.rpc('supplier_advance_apply', { ...applyBase, p_amount_usd: body.amountUsd }));
    }
    if (error && isMissingFunction(error)) return pending();
    if (error) { const f = friendly(error); if (f) return json({ error: f }, 400); return serverError(error, 'supplier-advance', 'Bajarilmadi', 400); }
    return json({ ok: true, filial, apply: data }, 200);
  } catch (e) {
    return serverError(e, 'supplier-advance', 'Server xatosi');
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('supplier-advance', exports.handler);
