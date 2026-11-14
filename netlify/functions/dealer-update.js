// Netlify Function — diller qatorini yangilaydi (ism/telefon/hudud/qarz/statistika/ball va h.k.)
// Himoyalangan: "dillerlar.manage" ruxsati (yoki admin), faqat O'Z filialidagi dillerga.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, assertOwnFilial, serverError } = require('./_lib/supabaseAdmin');
const { legacyDealerBlocked } = require('./_lib/dealerAtomic');

const FIELD_MAP = {
  name: 'name', phone: 'phone', region: 'region', av: 'av',
  debt: 'debt_usd', totalShipped: 'total_shipped_usd', totalSold: 'total_sold_usd',
  totalPaid: 'total_paid_usd', commissionPct: 'commission_pct',
  telegramChatId: 'telegram_chat_id', points: 'points',
  creditLimitUsd: 'credit_limit_usd', paymentDueDays: 'payment_due_days'
};

const NUMERIC_FIELDS = ['debt', 'totalShipped', 'totalSold', 'totalPaid', 'commissionPct', 'points', 'creditLimitUsd', 'paymentDueDays'];
const BALANCE_COLS = ['debt_usd', 'total_shipped_usd', 'total_sold_usd', 'total_paid_usd', 'points'];

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { id, fields } = body;
  if (!id || !fields) return json({ error: 'id va fields majburiy' }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'dealer-update', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'dillerlar.manage' });
  if (!auth.ok) return auth.response;

  const filialCheck = await assertOwnFilial(admin, 'dealers', id, auth);
  if (!filialCheck.ok) return filialCheck.response;

  if (typeof fields !== 'object' || Array.isArray(fields)) return json({ error: "fields noto'g'ri" }, 400);
  const map = {};
  for (const k of Object.keys(fields)) {
    if (!FIELD_MAP[k]) continue;
    const v = fields[k];
    // v10 (F8): raqamli maydonlar — chekli, manfiy emas; matnlar — uzunligi cheklangan
    if (NUMERIC_FIELDS.includes(k)) {
      if (v != null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1e9)) return json({ error: `${k} noto'g'ri qiymat` }, 400);
      if (k === 'commissionPct' && v != null && v > 100) return json({ error: "commissionPct 0–100 bo'lishi kerak" }, 400);
    } else if (v != null && (typeof v !== 'string' || v.length > 200)) {
      return json({ error: `${k} noto'g'ri qiymat` }, 400);
    }
    map[FIELD_MAP[k]] = v;
  }
  if (!Object.keys(map).length) return json({ error: "Yangilanadigan maydon yo'q" }, 400);
  // v24.5 (35-migratsiya): qarz, jo'natilgan/sotilgan/to'langan jami va ballar — faqat server amallari (dealer-ops, dealer-pay,
  // cash_payment_atomic) orqali; brauzer yakuniy qiymatni yubora olmaydi
  if (Object.keys(map).some(c => BALANCE_COLS.includes(c))) {
    try { const blocked = await legacyDealerBlocked(admin, 'dealer-update (balans)'); if (blocked) return blocked; }
    catch (e) { return serverError(e, 'dealer-update', 'Server xatosi'); }
  }

  try {
    // v10 (F8): balans maydonlari (qarz, to'lovlar, ballar) ledger'siz to'g'ridan-to'g'ri
    // o'zgartiriladi — kamida HAR BIR o'zgarish eski/yangi qiymati bilan audit jurnaliga yoziladi
    const balanceCols = Object.keys(map).filter(c => BALANCE_COLS.includes(c));
    let before = null;
    if (balanceCols.length) {
      const { data: b } = await admin.from('dealers').select(['filial', ...balanceCols].join(',')).eq('id', id).maybeSingle();
      before = b || null;
    }
    const { data, error } = await admin.from('dealers').update(map).eq('id', id).select().maybeSingle();
    if (error) throw error;
    if (before && data) {
      const changed = balanceCols.filter(c => Number(before[c] || 0) !== Number(data[c] || 0));
      if (changed.length) {
        try {
          await admin.from('dealer_audit_log').insert({
            dealer_id: id, action: 'balance_update', actor_kind: auth.isAdmin ? 'owner' : 'staff',
            actor_name: auth.staff?.name || null, actor_staff_id: auth.staff?.id || null, filial: data.filial || before.filial || 'baza',
            old_value: Object.fromEntries(changed.map(c => [c, before[c]])), new_value: Object.fromEntries(changed.map(c => [c, data[c]]))
          });
        } catch (_) { /* jurnal ikkinchi darajali */ }
      }
    }
    return json({ dealer: data }, 200);
  } catch (e) {
    return serverError(e, 'dealer-update', "Yangilashda xatolik");
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('dealer-update', exports.handler);
