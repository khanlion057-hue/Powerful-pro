// Netlify Function — bitta dillerning (yoki butun filialning) audit tarixini qaytaradi.
// Himoyalangan: "dillerlar.view" ruxsati (yoki admin). dealerId berilsa — o'sha dillerning
// filiali tekshiriladi; filial berilsa — chaqiruvchining o'z filialiga majburlanadi.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { dealerId, limit } = body;
  if (!dealerId && !body.filial) return json({ error: 'dealerId yoki filial majburiy' }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'dealer-audit-log-list', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'dillerlar.view', filialField: 'filial', body });
  if (!auth.ok) return auth.response;

  try {
    let q = admin.from('dealer_audit_log').select('*').order('created_at', { ascending: false }).limit(Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000));
    if (dealerId) {
      if (!auth.isAdmin) {
        const { data: dealer } = await admin.from('dealers').select('filial').eq('id', dealerId).maybeSingle();
        if (!dealer || dealer.filial !== auth.filial) {
          return json({ error: "Boshqa filial ma'lumotiga ruxsatingiz yo'q" }, 403);
        }
      }
      q = q.eq('dealer_id', dealerId);
    } else {
      q = q.eq('filial', body.filial);
    }
    const { data, error } = await q;
    if (error) throw error;
    return json({ logs: data || [] }, 200);
  } catch (e) {
    return json({ error: "Ma'lumot yuklashda xatolik" }, 500);
  }
};
