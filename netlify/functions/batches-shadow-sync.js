// Netlify Function — P3-3: yangi "batches" SQL jadvaliga PARALLEL yozadi
// (shadow-mode). Bu — asosiy yozish yo'lini ALMASHTIRMAYDI, faqat qo'shimcha
// tekshiruv/tayyorgarlik uchun. Xato bo'lsa ham asosiy (app_data) saqlash
// hech qachon to'xtamaydi (frontendda try/catch bilan izolyatsiyalangan
// chaqiriladi — xuddi _parallelBranchSave naqshi kabi).
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');
const { hasPerm, BRANCH_KEY_PERMISSION_MAP } = require('./_lib/appDataGuard');
const { ledgerAuthorityOn } = require('./_lib/ledgerAuthority');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body || !body.localId || !body.pid) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'batches-shadow-sync', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { loadPermissions: true });
  if (!auth.ok) return auth.response;
  // 2026-09-28 (OWASP A01): avval har qanday xodim partiya tannarxi/qoldig'ini
  // yoza olardi. Endi — partiyani qonuniy o'zgartiradigan amal huquqi kerak
  // (app-data guard bilan bir xil ro'yxat). Bu fon-rejimdagi shadow chaqiruv,
  // shuning uchun rad etish jurnalga yozilmaydi (har save()da ko'p chaqiriladi).
  if (!auth.isAdmin && !hasPerm(auth.permKeys, BRANCH_KEY_PERMISSION_MAP.batches)) {
    return json({ error: "Bu amal uchun ruxsatingiz yo'q" }, 403);
  }

  // Filial-chegarasi: admin bo'lmasa faqat o'z filialiga yozadi (app-data-branch-save.js bilan bir xil naqsh)
  // v10 (F3): bu jadvaldan atomik savdo FIFO qoldig'i va tannarxini oladi — qiymatlar
  // tekshiriladi (cheksiz qoldiq, manfiy/0 tannarx, sold>qty kabi buzuq qatorlar rad etiladi)
  const num = (v, max) => { const x = Number(v ?? 0); return Number.isFinite(x) && x >= 0 && x <= max ? x : NaN; };
  const qty = num(body.qty, 1e7), sold = num(body.sold, 1e7), cost = num(body.costUsd, 1e7), fee = num(body.bankFeeUsd, 1e7);
  if ([qty, sold, cost, fee].some(Number.isNaN)) return json({ error: "Partiya qiymatlari noto'g'ri" }, 400);
  if (sold > qty + 1e-6) return json({ error: "Sotilgan miqdor partiyadan ko'p bo'lishi mumkin emas" }, 400);
  if (body.status != null && !['active', 'empty', 'transit'].includes(body.status)) return json({ error: "Holat noto'g'ri" }, 400);
  if (body.cur != null && !['USD', 'UZS', 'CNY'].includes(body.cur)) return json({ error: "Valyuta noto'g'ri" }, 400);
  if (String(body.localId).length > 64 || String(body.origin || '').length > 300) return json({ error: "Maydon juda uzun" }, 400);

  const filial = auth.isAdmin ? (body.filial || auth.filial) : auth.filial;

  // v23.2 (F4b, 27-migratsiya): partiya qoldig'i (qty/sold/tannarx) — faqat ombor jurnali orqali
  // (stock-debt-ops, savdo). Brauzer nusxasi bazadagi qoldiqni endi QAYTA YOZA OLMAYDI (avval eski
  // nusxa sold=2 ni 0 ga qaytarib, ortiqcha sotuvga yo'l ochardi). Eski brauzerlar uchun — jim e'tiborsiz.
  try {
    if (await ledgerAuthorityOn(admin)) return json({ ok: true, ignored: true, ledgerAuthority: true }, 200);
  } catch (e) { return serverError(e, 'batches-shadow-sync', "Yozishda xatolik"); }

  try {
    const { error } = await admin.from('batches').upsert({
      local_id: String(body.localId), filial,
      pid: body.pid, bno: body.bno || null, origin: body.origin || null,
      cur: body.cur || 'USD', qty, sold,
      cost_usd: cost, bank_fee_usd: fee,
      supp_id: body.suppId || null, consignment: !!body.consignment,
      rate_usd_uzs: body.rateUsdUzs || null, rate_usd_cny: body.rateUsdCny || null,
      batch_date: body.date || null, status: body.status || 'active',
      performed_by: body.performedBy || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'filial,local_id' });
    if (error) throw error;
    return json({ ok: true }, 200);
  } catch (e) {
    return serverError(e, 'batches-shadow-sync', "Yozishda xatolik");
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('batches-shadow-sync', exports.handler);
