// Netlify Function — diller buyurtmasini tasdiqlaydi (approved) yoki rad etadi (rejected).
// Himoyalangan: "dillerlar.orders" ruxsati (yoki admin), faqat O'Z filialidagi
// dillerning buyurtmasiga.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');
const { legacyDealerBlocked } = require('./_lib/dealerAtomic');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { orderId, status, items } = body;
  if (!orderId || !['approved', 'rejected'].includes(status)) {
    return json({ error: 'orderId va to\'g\'ri status (approved/rejected) majburiy' }, 400);
  }

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'dealer-order-status', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'dillerlar.orders' });
  if (!auth.ok) return auth.response;
  if (status === 'approved') {
    // v24.5 (35-migratsiya): tasdiqlash — faqat dealer-ops (ship + orderId): ombor va diller ombori bilan bitta tranzaksiyada
    try { const blocked = await legacyDealerBlocked(admin, 'dealer-order-status (approved)'); if (blocked) return blocked; }
    catch (e) { return serverError(e, 'dealer-order-status', 'Server xatosi'); }
  }

  try {
    // Buyurtma qaysi dillerga tegishli ekanini va o'sha dillerning filialini tekshiramiz
    const { data: order, error: ordErr } = await admin.from('dealer_orders').select('dealer_id,status,items').eq('id', orderId).maybeSingle();
    if (ordErr) throw ordErr;
    if (!order) return json({ error: 'Buyurtma topilmadi' }, 404);

    if (!auth.isAdmin) {
      const { data: dealer } = await admin.from('dealers').select('filial').eq('id', order.dealer_id).maybeSingle();
      if (!dealer || dealer.filial !== auth.filial) {
        return json({ error: "Boshqa filial buyurtmasiga ruxsatingiz yo'q" }, 403);
      }
    }

    // v10 (F11): faqat "pending" holatdagi buyurtma tasdiqlanadi/rad etiladi (qayta
    // ishlash, tasdiqlangandan keyin rad etish — yo'q); tasdiqlangan qatorlar faqat
    // buyurtmadagi mahsulotlardan, musbat miqdor bilan
    if (order.status !== 'pending') return json({ error: `Buyurtma allaqachon ko'rib chiqilgan (${order.status})` }, 409);
    const updates = { status, resolved_at: new Date().toISOString() };
    if (status === 'approved' && items != null) {
      const origPids = new Set((Array.isArray(order.items) ? order.items : []).map(i => Number(i && i.pid)));
      if (!Array.isArray(items) || !items.length || items.length > 500) return json({ error: "items noto'g'ri" }, 400);
      for (const i of items) {
        const q = Number(i && i.qty);
        if (!i || !origPids.has(Number(i.pid)) || !(q > 0) || !Number.isFinite(q) || q > 1e6) return json({ error: `Noto'g'ri qator: pid=${i && i.pid}` }, 400);
      }
      updates.items = items.map(i => ({ pid: Number(i.pid), sku: String(i.sku || '').slice(0, 80), name: String(i.name || '').slice(0, 200), qty: Number(i.qty) }));
    }

    const { data, error } = await admin.from('dealer_orders').update(updates).eq('id', orderId).eq('status', 'pending').select().maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "Buyurtma allaqachon ko'rib chiqilgan" }, 409);
    return json({ order: data }, 200);
  } catch (e) {
    return serverError(e, 'dealer-order-status', "Saqlashda xatolik");
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('dealer-order-status', exports.handler);
