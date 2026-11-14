// v24.5 (35-migratsiya; v23.10.2 dagi 31 dan): diller ombori va diller savdosi — serverda, bitta tranzaksiyada.
// 35 qo'llangan bazada eski «mutlaq qiymat» yozish yo'llari (dealer-stock-upsert, dealer-stock-move-add,
// dealer-sale-add, dealer-update'ning balans maydonlari, dealer-order-status 'approved', stock-debt-ops'dagi
// diller jo'natmasi/qaytishi) yopiladi — brauzer diller qoldig'i yoki qarzining yakuniy qiymatini yubora olmaydi.
// 35 qo'llanmagan bo'lsa — hammasi avvalgidek ishlaydi (orqaga moslik: sayt migratsiyadan oldin ham ishlaydi).
'use strict';
const { json } = require('./supabaseAdmin');
const { isMissingFunction } = require('./cashAuthority');

// 35-migratsiya bormi: dealer_atomic_available() funksiyasi (faqat service_role). Funksiya yo'q — false.
async function dealerAtomicOn(admin) {
  const { data, error } = await admin.rpc('dealer_atomic_available');
  if (error) { if (isMissingFunction(error)) return false; throw error; }
  return data === true;
}

// Eski yo'l yopilgan bo'lsa — 409 javob; aks holda null
async function legacyDealerBlocked(admin, fn) {
  if (!(await dealerAtomicOn(admin))) return null;
  return json({ error: `«${fn}» eskirgan — diller ombori va qarzi endi serverda bitta amal bilan yoziladi. Sahifani yangilang (F5).`, legacyDealer: true }, 409);
}

module.exports = { dealerAtomicOn, legacyDealerBlocked };
