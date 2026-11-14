// ════════════════════════════════════════════════════════════
// P3-2 — UMUMIY SERVER-TOMON HISOBLASH YADROSI
// ════════════════════════════════════════════════════════════
// Maqsad: barcha keyingi savdo-bog'liq Function (P3-4 checkout, P3-5 Direct
// Sale, P3-6 qaytarish va h.k.) MANA SHU moduldan foydalanadi — formula
// FAQAT BITTA joyda yoziladi, ikki xil (frontend/server) hisob-kitob orasida
// tafovut bo'lmaydi.
//
// MUHIM: bu yerdagi har bir formula js/main.js'dagi ASL formuladan AYNAN
// ko'chirilgan (audit qilingan, 2026-08-12):
//   - subtotalUsd/totalUsd — savdoCalc() (js/main.js:2670-2672)
//   - costUsd/profitUsd    — _savdoCommit() (js/main.js)
//   - debtUsd/changeUsd    — savdoFinish() (js/main.js)
// Hech qanday qo'shimcha yaxlitlash (Math.round) kiritilmagan — frontend ham
// xom (raw) float bilan ishlaydi, faqat KO'RSATISHDA (CUR.fmtUsd) yaxlitlanadi.
// Bu — server va client natijalari bitta-birga (bit-aniqligida) mos kelishi
// uchun ATAYLAB shunday qilingan.
//
// Bu modul HOZIRCHA hech qanday Function tomonidan chaqirilmaydi — u faqat
// KEYINGI bosqichlar (P3-4+) uchun tayyorlangan, mustaqil, sinovdan o'tgan
// asos. Mavjud frontend/Function ishlash tartibiga HECH QANDAY ta'siri yo'q.

/**
 * Savat itemlaridan subtotal/chegirma/jami summani hisoblaydi.
 * @param {Array<{qty:number, sellUsd:number}>} items
 * @param {number} discPct — chegirma foizi (masalan 5 => 5%)
 */
function computeSaleTotals(items, discPct) {
  const subtotalUsd = (items || []).reduce((s, i) => s + (Number(i.qty) * Number(i.sellUsd)), 0);
  const disc = Number(discPct) || 0;
  const totalUsd = subtotalUsd * (1 - disc / 100);
  const discUsd = subtotalUsd - totalUsd;
  return { subtotalUsd, discUsd, totalUsd, disc };
}

/**
 * Savat itemlaridan umumiy tannarxni hisoblaydi (manba — ombordan yoki
 * ta'minotchidan — farqsiz, har ikkisi ham costUsd*qty bilan hisoblanadi).
 */
function computeCost(items) {
  return (items || []).reduce((s, i) => s + (Number(i.qty) * Number(i.costUsd)), 0);
}

/** Foyda = jami summa − tannarx (manfiy bo'lsa — zarar). */
function computeProfit(totalUsd, costUsd) {
  return Number(totalUsd) - Number(costUsd);
}

/**
 * To'lov asosida qarz (kam to'lov) va qaytim (ortiqcha to'lov) ni hisoblaydi.
 * Ikkalasi ham manfiy bo'lishi mumkin emas (Math.max(0,...)).
 */
function computePayment(totalUsd, paidUsd) {
  const t = Number(totalUsd), p = Number(paidUsd);
  return {
    debtUsd: Math.max(0, t - p),
    changeUsd: Math.max(0, p - t)
  };
}

/**
 * Berilgan savat/chegirma/to'lov ma'lumotidan TO'LIQ moliyaviy natijani
 * hisoblaydi — bitta chaqiruvda. Keyingi bosqichlarda (P3-4) checkout
 * Function shu funksiyaning natijasini client yuborgan qiymat bilan
 * solishtiradi (client natijasiga "ko'r-ko'rona" ishonmaydi).
 */
function computeFullSale({ items, discPct, paidUsd }) {
  const { subtotalUsd, discUsd, totalUsd } = computeSaleTotals(items, discPct);
  const costUsd = computeCost(items);
  const profitUsd = computeProfit(totalUsd, costUsd);
  const { debtUsd, changeUsd } = computePayment(totalUsd, paidUsd);
  return { subtotalUsd, discUsd, totalUsd, costUsd, profitUsd, debtUsd, changeUsd };
}

module.exports = { computeSaleTotals, computeCost, computeProfit, computePayment, computeFullSale };
