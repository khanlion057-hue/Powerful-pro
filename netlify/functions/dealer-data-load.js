// Netlify Function — filial bo'yicha barcha dillerlar + ularning ombor/savdo/to'lov/
// harakat tarixini bitta so'rovda qaytaradi (admin panel dashboard uchun).
// Himoyalangan: "dillerlar.view" ruxsati (yoki admin), filial o'ziniki bilan chegaralanadi.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'dealer-data-load', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'dillerlar.view', filialField: 'filial', body });
  if (!auth.ok) return auth.response;

  const { filial } = body;
  if (!filial) return json({ error: 'filial majburiy' }, 400);

  try {
    const { data: dealers, error: dErr } = await admin.from('dealers').select('*').eq('filial', filial).order('id');
    if (dErr) throw dErr;
    const dealerIds = (dealers || []).map(d => d.id);
    const empty = { data: [] };

    const [{ data: stock }, { data: sales }, { data: pays }, { data: moves }] = await Promise.all([
      dealerIds.length ? admin.from('dealer_stock').select('*').in('dealer_id', dealerIds) : empty,
      dealerIds.length ? admin.from('dealer_sales').select('*').in('dealer_id', dealerIds) : empty,
      dealerIds.length ? admin.from('dealer_payments').select('*').in('dealer_id', dealerIds) : empty,
      dealerIds.length ? admin.from('dealer_stock_moves').select('*').in('dealer_id', dealerIds) : empty,
    ]);

    return json({
      dealers: dealers || [], stock: stock || [], sales: sales || [], payments: pays || [], moves: moves || []
    }, 200);
  } catch (e) {
    return json({ error: "Ma'lumot yuklashda xatolik" }, 500);
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('dealer-data-load', exports.handler);
