// Netlify Function — bir nechta dillerning buyurtmalarini qaytaradi (admin/sotuvchi paneli uchun).
// Himoyalangan: "dillerlar.view" ruxsati (yoki admin). So'ralgan dealerId'lar orasidan
// faqat chaqiruvchining O'Z filialiga tegishlilari qoldiriladi (boshqalari jimgina chetlanadi).
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { dealerIds } = body;
  if (!Array.isArray(dealerIds) || !dealerIds.length) return json({ orders: [] }, 200);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'dealer-orders-list', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'dillerlar.view' });
  if (!auth.ok) return auth.response;

  try {
    let allowedIds = dealerIds;
    if (!auth.isAdmin) {
      const { data: ownDealers } = await admin.from('dealers').select('id').eq('filial', auth.filial).in('id', dealerIds);
      allowedIds = (ownDealers || []).map(d => d.id);
    }
    if (!allowedIds.length) return json({ orders: [] }, 200);

    const { data, error } = await admin.from('dealer_orders').select('*').in('dealer_id', allowedIds).order('created_at', { ascending: false });
    if (error) throw error;
    return json({ orders: data || [] }, 200);
  } catch (e) {
    return json({ error: "Ma'lumot yuklashda xatolik" }, 500);
  }
};
