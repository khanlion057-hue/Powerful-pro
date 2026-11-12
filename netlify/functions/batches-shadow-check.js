// Netlify Function — P3-3: shadow-tekshiruv. Berilgan filial uchun eski
// (app_data JSON) va yangi (batches SQL) manbalarni SOLISHTIRADI, farq
// bo'lsa aniq ro'yxat qaytaradi. HECH NARSANI BLOKLAMAYDI, hech narsani
// o'zgartirmaydi — faqat o'qish (read-only) va taqqoslash.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body || !Array.isArray(body.localBatches)) return json({ error: "localBatches majburiy (array)" }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'batches-shadow-check', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin);
  if (!auth.ok) return auth.response;

  const filial = auth.isAdmin ? (body.filial || auth.filial) : auth.filial;

  try {
    const { data: sqlRows, error } = await admin.from('batches').select('*').eq('filial', filial);
    if (error) throw error;

    const sqlMap = {};
    (sqlRows || []).forEach(r => { sqlMap[r.local_id] = r; });

    const diffs = [];
    body.localBatches.forEach(lb => {
      const sr = sqlMap[String(lb.id)];
      if (!sr) { diffs.push({ localId: lb.id, type: 'missing_in_sql' }); return; }
      // Faqat MOLIYAVIY jihatdan muhim maydonlarni solishtiramiz (qoldiq/tannarx)
      const qtyDiff = Number(sr.qty) !== Number(lb.qty);
      const soldDiff = Number(sr.sold) !== Number(lb.sold);
      const costDiff = Math.abs(Number(sr.cost_usd) - Number(lb.costUsd || 0)) > 0.001;
      if (qtyDiff || soldDiff || costDiff) {
        diffs.push({ localId: lb.id, type: 'value_mismatch', qtyDiff, soldDiff, costDiff, sql: { qty: sr.qty, sold: sr.sold, cost_usd: sr.cost_usd }, local: { qty: lb.qty, sold: lb.sold, costUsd: lb.costUsd } });
      }
    });
    // SQLda bor-u, lokal ro'yxatda yo'q (masalan lokal tombstone bilan o'chirilgan) yozuvlarni ham qayd etamiz
    const localIds = new Set(body.localBatches.map(b => String(b.id)));
    (sqlRows || []).forEach(r => { if (!localIds.has(r.local_id)) diffs.push({ localId: r.local_id, type: 'extra_in_sql' }); });

    return json({ ok: true, filial, matched: diffs.length === 0, diffCount: diffs.length, diffs }, 200);
  } catch (e) {
    return serverError(e, 'batches-shadow-check', "Solishtirishda xatolik");
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('batches-shadow-check', exports.handler);
