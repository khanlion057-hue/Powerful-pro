// Netlify Function — P3-6: Qaytarish uchun SHADOW-tekshiruv. Server MUSTAQIL
// aniqlaydi: (a) shu savdoda haqiqatan shuncha miqdor sotilganmi (qayta
// hisoblab), (b) qaytarilayotgan miqdor sotilgan miqdordan oshmayaptimi,
// (c) manba (ombordan/ta'minotchidan) frontend aytgani bilan mosmi.
// HECH NARSANI BLOKLAMAYDI — qaytarish frontend orqali avvalgidek yakunlanadi.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  const { saleItem, returnQty, wasDirectSupply } = body || {};
  if (!saleItem || !(returnQty > 0)) return json({ error: "saleItem va returnQty majburiy" }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'sale-return-shadow-check', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin);
  if (!auth.ok) return auth.response;

  const diffs = [];
  // 1) Qaytarilayotgan miqdor — savdodagi qoldiq miqdordan (item.qty, allaqachon
  //    oldingi qaytarishlar hisobga olingan holda) oshmasligi kerak
  if (Number(returnQty) > Number(saleItem.qty)) {
    diffs.push({ field: 'returnQty', reason: 'exceeds_sold_qty', saleQty: saleItem.qty, returnQty });
  }
  // 2) Manba (ombordan/ta'minotchidan) — client aytgani bilan savdo yozuvidagi
  //    haqiqiy `directSupply` bayrog'i mos kelishi kerak (soxta bayroq yuborilmasin)
  if (!!saleItem.directSupply !== !!wasDirectSupply) {
    diffs.push({ field: 'source', reason: 'mismatch', saleItemFlag: !!saleItem.directSupply, clientClaim: !!wasDirectSupply });
  }
  // 3) costUsd/sellUsd — savdo yozuvidan olingan qiymat bilan mos kelishi (client
  //    o'zboshimchalik bilan boshqa narx yubormasligi uchun)
  if (body.costUsd != null && Math.abs(Number(body.costUsd) - Number(saleItem.costUsd)) > 0.01) {
    diffs.push({ field: 'costUsd', reason: 'mismatch', saleItemCost: saleItem.costUsd, clientCost: body.costUsd });
  }

  return json({ ok: true, matched: diffs.length === 0, diffs }, 200);
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('sale-return-shadow-check', exports.handler);
