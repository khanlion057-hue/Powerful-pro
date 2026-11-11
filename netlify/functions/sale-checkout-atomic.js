// Netlify Function — P3-12 TO'LIQ: Asosiy Savdo/Checkout — TO'LIQ ATOMIK.
// `sale_checkout_atomic()` Postgres RPC funksiyasini chaqiradi — ombor (FIFO),
// savdo, mijoz qarzi, kassa balansi, ta'minotchi qarzi BITTA tranzaksiyada.
// RBAC + filial-server-tomonidan aniqlash + idempotency — barchasi bor.
const { notifyCreditSale } = require('./_lib/tgEvents');
const FWRound = require('../../js/fw-round.js');
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError } = require('./_lib/supabaseAdmin');
const { claimIdempotent, completeIdempotent, releaseIdempotent, claimResponse } = require('./_lib/idempotency');
const { cashAuthorityOn, loadBranchBoxes } = require('./_lib/cashAuthority');
const { ledgerAuthorityOn } = require('./_lib/ledgerAuthority');
const { v31On, v34On, roleClass } = require('./_lib/auditAuthority');
const { discountViolation, dbFifoCostMap, redactLedgerResponse } = require('./_lib/pricing');
const { versionOn } = require('./_lib/appDataVersion');

const isNum = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isId = (v) => Number.isSafeInteger(v) && v > 0;

// v10 (audit F2): RPC'ga boradigan BARCHA pul parametrlari tekshiriladi — avval faqat
// qty/sellUsd/costUsd tekshirilardi; manfiy kassa to'lovi, 150% skidka yoki manfiy
// "to'langan" summa orqali kassa/qarzni buzish mumkin edi.
function validateCheckout(b) {
  if (b.items.length > 500) return "Savatda juda ko'p qator";
  for (const i of b.items) {
    if (!i || !isId(i.pid) || !isNum(i.qty, 1e-9, 1e6) || !isNum(i.sellUsd, 0, 1e9) || !isNum(i.costUsd, 0, 1e9)) return `Noto'g'ri item: pid=${i && i.pid}`;
    if (i.directSupply && i.suppId != null && !isId(i.suppId)) return `Noto'g'ri ta'minotchi: pid=${i.pid}`;
  }
  if (b.discPct != null && !isNum(b.discPct, 0, 100)) return "Skidka 0–100% oralig'ida bo'lishi kerak";
  if (!isNum(b.paidUsd, 0, 1e9)) return "To'langan summa noto'g'ri";
  if (b.custId != null && !isId(b.custId)) return "Mijoz noto'g'ri";
  if (b.boxPayments != null) {
    if (!Array.isArray(b.boxPayments) || b.boxPayments.length > 10) return "Kassa to'lovlari noto'g'ri";
    for (const p of b.boxPayments) if (!p || !isId(p.box_id) || !isNum(p.amount_native, 0, 1e12)) return "Kassa to'lovi noto'g'ri (manfiy yoki noto'g'ri kassa)";
  }
  if (b.inv != null && (typeof b.inv !== 'string' || b.inv.length > 40)) return "Chek raqami noto'g'ri";
  if (typeof b.idemKey !== 'string' || !b.idemKey || b.idemKey.length > 100) return 'idemKey majburiy';
  if (b.saleLocalId != null && !/^[0-9A-Za-z_.:-]{1,64}$/.test(String(b.saleLocalId))) return "Savdo ID noto'g'ri";
  if (b.payType != null && (typeof b.payType !== 'string' || b.payType.length > 20)) return "To'lov turi noto'g'ri";
  if (b.custName != null && String(b.custName).length > 200) return 'Mijoz nomi juda uzun';
  if (b.priceMode != null && b.priceMode !== 'retail' && b.priceMode !== 'wholesale') return "Narx turi noto'g'ri (retail | wholesale)";
  // v24.5 (34): ortiqcha to'lov (mijoz haqiga) va haqdan foydalanish — faqat mijoz bilan
  if (b.overpay != null) {
    if (typeof b.overpay !== 'object' || Array.isArray(b.overpay) || !isId(b.overpay.box_id) || !isNum(b.overpay.amount_native, 0.01, 1e12)) return "Ortiqcha to'lov noto'g'ri";
    if (b.custId == null) return "Ortiqcha to'lov uchun mijoz tanlanishi shart";
  }
  if (b.creditUseUzs != null && b.creditUseUzs !== 0) {
    if (!isNum(b.creditUseUzs, 0, 1e12)) return "Haq summasi noto'g'ri";
    if (b.custId == null) return "Haqdan foydalanish uchun mijoz tanlanishi shart";
  }
  return null;
}

// v25.1: so'm yaxlitlash — 3 ta maydon (asl_jami, yaxlitlash_chegirmasi, tolangan_jami) savdo qatoriga (47-migratsiya).
// Brauzer yuborgan qiymatlar TEKSHIRILADI: butun son, manfiy emas, asl = to'langan + farq, farq < jami qadami (sozlamadan).
// Noto'g'ri yoki 47 qo'llanmagan bo'lsa — savdo baribir saqlangan (bu faqat qo'shimcha maydon), xato logga.
function roundingFieldsOf(body, settings) {
  const a = body.asl_jami, y = body.yaxlitlash_chegirmasi, t = body.tolangan_jami;
  if (a == null || y == null || t == null) return null;
  if (![a, y, t].every((v) => Number.isSafeInteger(v) && v >= 0)) return null;
  if (a !== t + y) return null;
  if (y >= FWRound.steps(settings).total && y > 0) return null;
  return { asl_jami_uzs: a, yaxlitlash_chegirmasi_uzs: y, tolangan_jami_uzs: t };
}
async function saveRoundingFields(admin, filial, localId, body, settings) {
  const f = roundingFieldsOf(body, settings || {}); if (!f || !localId) return;
  try {
    const { error } = await admin.from('sales').update(f).eq('filial', filial).eq('local_id', String(localId));
    if (error && error.code !== '42703') console.warn('[sale-checkout-atomic] yaxlitlash maydonlari:', error.message);   // 42703 — 47 qo'llanmagan
  } catch (e) { console.warn('[sale-checkout-atomic] yaxlitlash maydonlari:', e && e.message); }
}

// v25.1: nasiya savdo — Telegram guruhiga (mijoz, telefon, mahsulotlar, qaytarish sanasi). Savdo yozilgandan keyin;
// xabar ketmasa ham savdo bekor qilinmaydi. Takroriy (replay) javobda yuborilmaydi.
function creditNotice(admin, body, auth, filial, data) {
  if (!body.custId || (data && data.replay)) return Promise.resolve();
  const due = typeof body.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? body.dueDate : null;
  const days = Number.isSafeInteger(body.dueDays) && body.dueDays > 0 && body.dueDays <= 365 ? body.dueDays : null;
  return notifyCreditSale(admin, { filial, custId: body.custId, custName: body.custName, items: body.items, discPct: body.discPct,
    paidUsd: body.paidUsd, creditUseUzs: body.creditUseUzs, dueDate: due, dueDays: days, inv: body.inv,
    staffName: auth.staff?.name || (auth.isAdmin ? 'Admin' : null) });
}

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body || !Array.isArray(body.items) || !body.items.length) {
    return json({ error: 'items majburiy (array)' }, 400);
  }
  const { items, discPct, paidUsd, custId, boxId, boxAmountNative, boxPayments, inv, idemKey } = body;

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'sale-checkout-atomic', 'Server sozlanmagan — administratorga murojaat qiling'); }

  // P3-13: RBAC — savdo yaratish huquqi
  const auth = await requireStaffAuth(event, admin, { permission: 'savdo.create' });
  if (!auth.ok) return auth.response;

  const vErr = validateCheckout(body);
  if (vErr) return json({ error: vErr }, 400);

  // P3-11 + v10 (F5): kalit AVVAL band qilinadi — ikki marta bosilsa ham savdo bitta bo'ladi
  const claim = await claimIdempotent(admin, idemKey, 'sale-checkout-atomic');
  const early = claimResponse(claim, json);
  if (early) return early;

  const filial = resolveFilial(auth, body.filial); // P3-14 + v10 (B9): xodim — o'z filiali; admin — joriy (tanlangan) filiali
  const role = roleClass(auth);
  let guarded = false, v34 = false;
  try { guarded = await v31On(admin); v34 = guarded && await v34On(admin); } catch (e) { await releaseIdempotent(admin, claim); return serverError(e, 'sale-checkout-atomic', 'Server xatosi'); }
  const wantsCredit = body.overpay != null || (+body.creditUseUzs || 0) > 0;
  if (wantsCredit && !v34) {
    await releaseIdempotent(admin, claim);
    return json({ error: "Ortiqcha to'lov va mijoz haqi uchun bazaga 34-migratsiya qo'llanishi kerak", code: 'MIGRATION34_PENDING', migration34Pending: true }, 409);
  }

  // v24 (31-migratsiya): Direct Sale — «savdo.direct_sale» ruxsati; mahsulotda admin belgilagan ta'minotchi va
  // ta'minotchi narxi — SERVERDAGI mahsulot ma'lumotidan olinadi (sotuvchi qarz summasini o'zgartira olmaydi).
  // v24.8 (S3): mahsulotga ta'minotchi va narx OLDINDAN belgilanmagan bo'lsa — admin bo'lmagan xodim uchun rad
  // (avval xodim o'zi yuborgan suppId/costUsd qabul qilinardi).
  let mainData = null;
  const loadMain = async () => {
    if (mainData) return mainData;
    const { data: row, error } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
    if (error) throw error;
    mainData = (row && row.data) || {};
    return mainData;
  };
  const priceMode = body.priceMode === 'wholesale' ? 'wholesale' : 'retail';
  if (!auth.isAdmin && items.some(i => i && i.directSupply)) {
    if (guarded && !auth.permKeys.has('savdo.direct_sale')) {
      await releaseIdempotent(admin, claim);
      return json({ error: "Direct Sale uchun ruxsatingiz yo'q — administratorga murojaat qiling" }, 403);
    }
    try { await loadMain(); } catch (e) { await releaseIdempotent(admin, claim); return serverError(e, 'sale-checkout-atomic', 'Server xatosi'); }
    const prods = new Map((mainData.products || []).map(p => [Number(p && p.id), p]));
    for (const i of items) {
      if (!i.directSupply) continue;
      const p = prods.get(Number(i.pid));
      const preset = p && p.directSale && p.dsSuppId != null && Number(p.dsCostUsd) > 0;
      if (preset) { i.suppId = Number(p.dsSuppId); i.costUsd = Number(p.dsCostUsd); }
      else if (role !== 'admin') {
        await releaseIdempotent(admin, claim);
        return json({ error: `Direct Sale: mahsulotga ta'minotchi va narx belgilanmagan — administrator mahsulot kartasida belgilashi kerak (pid=${i.pid})`, code: 'DIRECT_SALE_NOT_PRESET' }, 400);
      }
    }
  }

  // P3-12 TO'LIQ (mixed-payment qamrab olingan): agar `boxPayments` (massiv)
  // kelsa — shuni ishlatamiz (bitta yoki bir nechta kassa, farqsiz). Agar
  // faqat eski `boxId`+`boxAmountNative` kelsa — moslashtiramiz (orqaga moslik).
  const finalBoxPayments = Array.isArray(boxPayments) ? boxPayments
    : (boxId && boxAmountNative != null ? [{ box_id: boxId, amount_native: boxAmountNative }] : []);

  try {
    // v11 (F4): kassa valyutasi va nomi — serverdagi filial ma'lumotidan (24-migratsiyadan keyin
    // kassaga tushum kassa jurnaliga yoziladi va javobda bazadagi haqiqiy qoldiq qaytadi)
    let boxPaymentsOut = finalBoxPayments;
    if (finalBoxPayments.length && await cashAuthorityOn(admin)) {
      const { boxes } = await loadBranchBoxes(admin, filial);
      const byId = new Map(boxes.map(b => [Number(b.id), b]));
      for (const p of finalBoxPayments) {
        if (!byId.has(Number(p.box_id))) { await releaseIdempotent(admin, claim); return json({ error: `Kassa topilmadi (${p.box_id})` }, 400); }
      }
      boxPaymentsOut = finalBoxPayments.map(p => {
        const box = byId.get(Number(p.box_id));
        return { box_id: p.box_id, amount_native: p.amount_native, currency: box.cur === 'USD' ? 'USD' : 'UZS', box_name: String(box.name || '').slice(0, 200) };
      });
    }
    // v23.2 (F4b, 27-migratsiya): ombor (FIFO, konsignatsiya qarzi), mijoz qarzi (so'm), ta'minotchi
    // qarzi va kassa — SERVERDA, bitta tranzaksiyada; savdo hujjati bazada (qaytarish/tahrir shundan hisoblanadi).
    if (await ledgerAuthorityOn(admin)) {
      const opKey = 'ck:' + String(idemKey).replace(/[^A-Za-z0-9:_.-]/g, '').slice(0, 120);
      const extra = guarded ? { p_role: role, p_loss_ack: body.lossAck === true } : {};
      // v24.8 (S2, 37-migratsiya): chegirma chegarasi — bazadagi narxdan settings.maxDiscountPct (standart 10%) dan past
      // sotish admin bo'lmasa rad. 37 bo'lsa — sale_checkout_v37 (o'sha tranzaksiyada, bloklangan partiyalar bilan);
      // 37 yo'q bo'lsa — shu yerda, bazadagi partiyalar bo'yicha (o'sha qoida).
      const v37 = v34 && await versionOn(admin);
      if (v37) extra.p_price_mode = priceMode;
      else if (role !== 'admin') {
        const md = await loadMain();
        const costMap = await dbFifoCostMap(admin, filial, items.map(i => i.pid));
        const bad = discountViolation({ products: md.products, settings: md.settings, items, discPct, mode: priceMode, costMap, filial });
        if (bad) {
          await releaseIdempotent(admin, claim);
          return json({ error: `Chegirma ruxsat etilgan ${bad.max}% dan oshdi — eng past narx ${bad.floor} $ (pid=${bad.pid}). Kattaroq chegirma — faqat administrator`, code: 'DISCOUNT_LIMIT', maxPct: bad.max, pid: bad.pid, minPriceUsd: bad.floor }, 400);
        }
      }
      // v24.5 (34): to'lov kassaga tushumdan oshmasligi serverda tekshiriladi; ortiqcha → mijoz qarzi/haqi; haqdan foydalanish
      if (v34) { extra.p_overpay = body.overpay ? { box_id: body.overpay.box_id, amount_native: body.overpay.amount_native } : null; extra.p_credit_use_uzs = Math.round(+body.creditUseUzs || 0); }
      const { data, error } = await admin.rpc(v37 ? 'sale_checkout_v37' : v34 ? 'sale_checkout_v34' : guarded ? 'sale_checkout_guarded' : 'sale_checkout_atomic_v3', {
        ...extra,
        p_filial: filial, p_op_key: opKey,
        p_sale: {
          localId: body.saleLocalId != null ? String(body.saleLocalId) : opKey.slice(0, 64), inv: inv || ('S-' + opKey.slice(3, 33)), custId: custId || null,
          custName: body.custName != null ? String(body.custName).slice(0, 200) : null,
          items: items.map(i => ({ pid: i.pid, sku: i.sku, name: i.name, qty: i.qty, sellUsd: i.sellUsd, costUsd: i.costUsd,
            directSupply: !!i.directSupply, suppId: i.suppId || null })),
          discPct: discPct || 0, paidUsd, payType: body.payType || null, boxId: Number.isSafeInteger(boxId) ? boxId : null,
          saleDate: typeof body.saleDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.saleDate) ? body.saleDate : null,
        },
        p_box_payments: boxPaymentsOut,
        p_staff_id: auth.isAdmin ? null : (auth.staff?.id ?? null),
        p_staff_name: auth.staff?.name || (auth.isAdmin ? 'Admin' : null),
      });
      if (error) {
        await releaseIdempotent(admin, claim);
        // v24: zarar bilan savdo — sotuvchi tasdig'i kerak (hech narsa yozilmagan; o'sha kalit bilan qayta yuborish mumkin)
        if (/LOSS_ACK_REQUIRED/.test(String(error.message || ''))) {
          // v24.2 (32-migratsiya): zarar summasi ($) — sotuvchiga ko'rsatiladi (egasi qarori); 31 da summa yo'q — null
          const lm = /\|loss=([0-9]+(?:\.[0-9]+)?)/.exec(String(error.message || ''));
          return json({ error: "Savdo tannarxdan past (zarar) — tasdiqlang", code: 'LOSS_ACK_REQUIRED', lossUsd: lm ? Number(lm[1]) : null }, 409);
        }
        const dl = /DISCOUNT_LIMIT\|max=([0-9.]+)\|pid=([0-9]+)\|floor=([0-9.]+)/.exec(String(error.message || ''));
        if (dl) {
          return json({ error: `Chegirma ruxsat etilgan ${Number(dl[1])}% dan oshdi — eng past narx ${Number(dl[3])} $ (pid=${dl[2]}). Kattaroq chegirma — faqat administrator`,
            code: 'DISCOUNT_LIMIT', maxPct: Number(dl[1]), pid: Number(dl[2]), minPriceUsd: Number(dl[3]) }, 400);
        }
        return serverError(error, 'sale-checkout-atomic', 'Checkout amalga oshmadi', 400);
      }
      // v24.8 (K2): tannarx va foyda — faqat ruxsat egasiga (zarar summasi — 32-migratsiya qaroridek, alohida 409 javobda)
      const out = redactLedgerResponse({ ...data, ledger: true }, auth);
      await completeIdempotent(admin, claim, out);
      if (!(data && data.replay)) {
        let st = {}; try { st = ((await loadMain()) || {}).settings || {}; } catch (_) {}
        await saveRoundingFields(admin, filial, body.saleLocalId != null ? String(body.saleLocalId) : opKey.slice(0, 64), body, st);
      }
      await creditNotice(admin, body, auth, filial, data);
      return json(out, 200);
    }
    const { data, error } = await admin.rpc('sale_checkout_atomic_v2', {
      p_filial: filial,
      p_items: items.map(i => ({
        pid: i.pid, sku: i.sku, name: i.name, qty: i.qty, sell_usd: i.sellUsd,
        cost_usd: i.costUsd, direct_supply: !!i.directSupply, supp_id: i.suppId || null
      })),
      p_disc_pct: discPct || 0,
      p_paid_usd: paidUsd,
      p_cust_id: custId || null,
      p_box_payments: boxPaymentsOut,
      p_inv: inv
    });
    if (error) {
      // Postgres RAISE EXCEPTION (masalan "yetarli qoldiq yo'q") shu yerga tushadi —
      // BUTUN TRANZAKSIYA AVTOMATIK BEKOR QILINGAN, hech narsa yozilmagan.
      await releaseIdempotent(admin, claim);
      return serverError(error, 'sale-checkout-atomic', 'Checkout amalga oshmadi', 400);
    }
    await completeIdempotent(admin, claim, data);
    await creditNotice(admin, body, auth, filial, data);
    return json(data, 200);
  } catch (e) {
    await releaseIdempotent(admin, claim);
    return serverError(e, 'sale-checkout-atomic', 'Server xatosi');
  }
};
