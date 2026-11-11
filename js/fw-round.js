// POWERFUL GROUP — SO'M YAXLITLASH: yagona manba (v25.1, egasi qoidasi). Brauzer (savdo oynasi, chek, hisobotlar),
// server (savdoni yozish) va testlar shu faylni ishlatadi.
//
// QOIDALAR:
//  1) Tovar narxi — eng yaqin `priceStep` so'mga (standart 1 000); yarmi va undan yuqori — tepaga.
//     12 400 → 12 000; 12 500 → 13 000.
//  2) Savat jami — har doim PASTGA, `totalStep` so'mga (standart 100). 17 975 → 17 900; 17 999 → 17 900; 17 900 → 17 900.
//  3) Jami — chegirma va foizlar qo'llangandan KEYIN yaxlitlanadi.
//  4) Farq — «Yaxlitlash chegirmasi» (alohida qator va alohida maydon).
//  5) Hammasi butun so'm (integer) — kasr yo'q.
//  6) Qadamlar — sozlamalarda: settings.roundPriceStep, settings.roundTotalStep (kodga qattiq yozilmagan).
// SAQLANADI (har savdoda): asl_jami, yaxlitlash_chegirmasi, tolangan_jami  (tolangan_jami = asl_jami − yaxlitlash_chegirmasi).
// FOYDA: tushum = tolangan_jami; tannarx O'ZGARMAYDI; foyda = tolangan_jami − tannarx.
(function (root) {
  'use strict';
  var DEF_PRICE_STEP = 1000, DEF_TOTAL_STEP = 100;
  var STEPS_OK = [1, 10, 50, 100, 200, 500, 1000, 5000, 10000];

  // Butun so'm: kasr bo'lsa eng yaqin butunga (0.5 — tepaga), NaN → 0
  function toInt(n) { var v = Number(n); if (!isFinite(v)) return 0; return v >= 0 ? Math.floor(v + 0.5) : -Math.floor(-v + 0.5); }
  function stepOf(v, def) { var s = toInt(v); return STEPS_OK.indexOf(s) >= 0 ? s : def; }

  // Sozlamalardan qadamlar (bo'lmasa — standart). enabled=false → yaxlitlash o'chiq (qadam 1).
  function steps(settings) {
    var st = settings || {};
    var on = st.roundingEnabled !== false;
    return { enabled: on, price: on ? stepOf(st.roundPriceStep, DEF_PRICE_STEP) : 1, total: on ? stepOf(st.roundTotalStep, DEF_TOTAL_STEP) : 1 };
  }

  // 1) Narx — eng yaqin qadamga (yarmi tepaga). Faqat butun son.
  function roundPrice(uzs, step) {
    var v = toInt(uzs), s = stepOf(step, DEF_PRICE_STEP);
    if (s <= 1) return v;
    var q = Math.floor(v / s), r = v - q * s;
    return (r * 2 >= s ? q + 1 : q) * s;
  }

  // 2) Jami — PASTGA qadamga.
  function roundTotalDown(uzs, step) {
    var v = toInt(uzs), s = stepOf(step, DEF_TOTAL_STEP);
    if (s <= 1 || v <= 0) return Math.max(0, v);
    return Math.floor(v / s) * s;
  }

  // 3–4) Savat: subtotal (butun so'm), chegirma (butun so'm, foiz allaqachon so'mga aylantirilgan) → uchta maydon
  function cartTotals(subtotalUzs, discountUzs, totalStep) {
    var sub = Math.max(0, toInt(subtotalUzs));
    var disc = Math.min(sub, Math.max(0, toInt(discountUzs)));
    var asl = sub - disc;                                   // chegirmadan keyingi asl jami
    var tol = roundTotalDown(asl, totalStep);               // to'lanadigan (yaxlitlangan) jami
    return { asl_jami: asl, yaxlitlash_chegirmasi: asl - tol, tolangan_jami: tol };
  }

  // Foyda (so'mda): tolangan_jami − tannarx. Tannarxga yaxlitlash qo'shilmaydi ham, ayirilmaydi ham.
  function profit(tolanganJamiUzs, costUzs) { return toInt(tolanganJamiUzs) - toInt(costUzs); }

  // Saqlangan savdodan uchta maydon (yangi savdoda — o'zi; eskisida — mavjud maydonlardan tiklanadi)
  function saleFields(sale) {
    var s = sale || {};
    if (s.tolangan_jami != null && s.asl_jami != null) {
      return { asl_jami: toInt(s.asl_jami), yaxlitlash_chegirmasi: toInt(s.yaxlitlash_chegirmasi), tolangan_jami: toInt(s.tolangan_jami) };
    }
    if (s.cur === 'USD' || !(Number(s.roundedTotalUzs) > 0)) return null;   // dollar savdosi yoki juda eski yozuv
    var tol = toInt(s.roundedTotalUzs), r = 0;
    if (Number(s.roundN) > 0) r = toInt(s.roundN);
    else if (s.discountReason === 'rounding') {
      // Eski savdo (maydonlarsiz): butun chegirma — yaxlitlash; farq qatorlardan (savdo vaqtidagi kurs bilan) tiklanadi
      var rate = Number(s.rateUsdUzs), sum = 0;
      if (rate > 0) (s.items || []).forEach(function (i) { sum += toInt((Number(i.qty) || 0) * toInt((Number(i.sellUsd) || 0) * rate)); });
      if (sum > tol && sum - tol < 1000) r = sum - tol;
    }
    return { asl_jami: tol + r, yaxlitlash_chegirmasi: r, tolangan_jami: tol };
  }

  // Davr bo'yicha «Yaxlitlash chegirmalari jami» (bekor qilinganlar hisobga olinmaydi)
  function periodRoundingTotal(sales) {
    var t = 0;
    (sales || []).forEach(function (s) {
      if (!s || s.status === 'voided' || s.status === 'cancelled' || s.status === 'void') return;
      var f = saleFields(s); if (f) t += f.yaxlitlash_chegirmasi;
    });
    return t;
  }

  var API = { DEF_PRICE_STEP: DEF_PRICE_STEP, DEF_TOTAL_STEP: DEF_TOTAL_STEP, STEPS_OK: STEPS_OK, toInt: toInt, steps: steps,
    roundPrice: roundPrice, roundTotalDown: roundTotalDown, cartTotals: cartTotals, profit: profit, saleFields: saleFields,
    periodRoundingTotal: periodRoundingTotal };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.FWRound = API;
})(typeof window !== 'undefined' ? window : this);
