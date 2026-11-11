// Netlify Function — P3-4: Asosiy Savdo/Checkout uchun SHADOW-tekshiruv.
// Frontend _savdoCommit() natijasini (saleEngine.js orqali) serverda MUSTAQIL
// qayta hisoblab, solishtiradi. HECH NARSANI BLOKLAMAYDI — savdo har doim
// frontend hisob-kitobi bilan yakunlanaveradi (o'zgarishsiz). Bu — faqat
// kelajakdagi "server ishonchli manba" bosqichi (bloklovchi rejim) uchun
// tayyorgarlik va joriy frontend hisob-kitobining to'g'riligini kuzatish.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');
const { computeFullSale } = require('./_lib/saleEngine');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body || !Array.isArray(body.items)) return json({ error: "items majburiy (array)" }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'sale-checkout-shadow-check', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin);
  if (!auth.ok) return auth.response;

  try {
    // Server MUSTAQIL hisoblaydi — client yuborgan natijaviy qiymatlarga
    // (totalUsd, profitUsd va h.k.) ishonmaydi, faqat XOM kirish (items, disc, paidUsd) asosida
    const serverCalc = computeFullSale({ items: body.items, discPct: body.discPct, paidUsd: body.paidUsd });

    const clientCalc = body.clientResult || {};
    const diffs = [];
    ['subtotalUsd', 'totalUsd', 'costUsd', 'profitUsd', 'debtUsd', 'changeUsd'].forEach(k => {
      const sv = Number(serverCalc[k] ?? 0), cv = Number(clientCalc[k] ?? 0);
      if (Math.abs(sv - cv) > 0.01) diffs.push({ field: k, server: sv, client: cv, diff: +(sv - cv).toFixed(4) });
    });

    return json({ ok: true, matched: diffs.length === 0, diffs, serverCalc }, 200);
  } catch (e) {
    return serverError(e, 'sale-checkout-shadow-check', "Solishtirishda xatolik");
  }
};
