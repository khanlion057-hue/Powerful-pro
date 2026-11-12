// Netlify Function — "app_data" (+ "app_data_branches" ustunlik bilan) ma'lumotini
// server tomonda, AUTENTIFIKATSIYA va FILIAL-CHEGARASI bilan qaytaradi.
//
// BU — 1-USTUVORLIK / 1.1-QADAM: hozircha faqat Function yaratildi, frontend
// (js/main.js) HALI bunga ulanmagan — `_cloudLoad()` hamon eski, to'g'ridan-to'g'ri
// anon/authenticated Supabase so'rovi orqali ishlaydi. Bu qadam MUSTAQIL, hech
// narsani buzmaydi, faqat kelajakdagi 1.2-qadam uchun tayyorgarlik.
//
// Xulq-atvor _cloudLoad()ga MOS bo'lishi uchun ataylab loyihalangan: natija
// { data: <app_data.data bilan bir xil shakldagi obyekt> } yoki { data: null }.
//
// Himoya: har qanday tasdiqlangan xodim (staff) chaqira oladi (maxsus ruxsat
// talab qilinmaydi — bu shunchaki "o'z ishlash joyi" ma'lumotini o'qish, xuddi
// hozirgi xatti-harakat kabi), LEKIN:
//   - role='admin' (yoki RBAC orqali to'liq huquqli) BO'LMASA — javobdagi
//     "branchStore" FAQAT chaqiruvchining o'z filialiga cheklanadi.
//   - Diller (staff jadvalida yo'q) — bu Function orqali umuman kirolmaydi
//     (requireStaffAuth uni rad etadi) — bu ham to'g'ri, chunki diller o'z
//     ma'lumotini allaqachon o'zining alohida (dealers/dealer_*) jadvallaridan,
//     to'g'ridan-to'g'ri xavfsiz RLS orqali oladi, app_data'ga aloqasi yo'q.
const { getAdminClient, json, methodGuard, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');
const { stripSecretSettings, stripAdminSecrets } = require('./_lib/appDataGuard');
const { cashAuthorityOn, loadBalances, overlayBranch } = require('./_lib/cashAuthority');
const { ledgerAuthorityOn, loadLedger, overlayBranchLedger } = require('./_lib/ledgerAuthority');
const { redactForStaff } = require('./_lib/pricing');
const { versionOn } = require('./_lib/appDataVersion');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'app-data-load', 'Server sozlanmagan — administratorga murojaat qiling'); }

  // v24.8: ruxsatlar kerak — tannarx («tannarx.view») va hamkorlar (hamkorlar.*) faqat ruxsat egasiga
  const auth = await requireStaffAuth(event, admin, { loadPermissions: true });
  if (!auth.ok) return auth.response;

  try {
    // 1) Eski, asosiy manba — bitta qatorli app_data
    // v24.8 (37): versiya — keyingi saqlashda optimistik qulf uchun brauzerga qaytariladi
    const verOn = await versionOn(admin);
    const { data: row, error } = await admin.from('app_data').select(verOn ? 'data,version' : 'data').eq('id', 'main').maybeSingle();
    if (error) throw error;
    let data = row?.data || null;
    if (!data) return json({ data: null, version: verOn ? 0 : null }, 200);

    // 2) app_data_branches — har filial uchun "afzalroq" (yangiroq) nusxa bo'lsa,
    //    _cloudLoad()dan keyin initData() ichida qilinadigan tanlov bilan BIR XIL
    //    mantiq: mavjud bo'lsa ustunlik beriladi, bo'lmasa eski branchStore qoladi.
    const { data: freshRows } = await admin.from('app_data_branches').select(verOn ? 'branch_key,data,version' : 'branch_key,data');
    const freshMap = {};
    const branchVersions = {};
    (freshRows || []).forEach(r => { if (r.data) freshMap[r.branch_key] = r.data; if (verOn && r.version != null) branchVersions[r.branch_key] = Number(r.version); });

    if (data.branchStore) {
      const merged = { ...data.branchStore };
      Object.keys(freshMap).forEach(k => { merged[k] = freshMap[k]; });
      data = { ...data, branchStore: merged };
    }

    // 3) FILIAL CHEGARASI — endi YOQILDI (1.4-qadam). `dlSyncCatalog()` endi
    //    (yuqoridagi izohda tushuntirilganidek) client holatiga (S._store)
    //    tayanmaydi — u endi `catalog-full-sync.js` orqali, to'g'ridan-to'g'ri
    //    bazadan hisoblanadi. Shuning uchun bu yerda filial-cheklovni yoqish
    //    ENDI XAVFSIZ: boshqa filiallar ma'lumoti hech qachon bo'shab qolmaydi.
    if (!auth.isAdmin && data.branchStore) {
      const own = auth.filial;
      data = { ...data, branchStore: { [own]: data.branchStore[own] || {} } };
    }
    // v11 (F4): kassa qoldiqlari — bazadagi haqiqiy qiymat (JSON'dagi son emas)
    let cashAuthority = false;
    if (data.branchStore && await cashAuthorityOn(admin)) {
      cashAuthority = true;
      const bs = { ...data.branchStore };
      for (const bk of Object.keys(bs)) bs[bk] = overlayBranch(bs[bk], await loadBalances(admin, bk));
      data = { ...data, branchStore: bs };
    }
    // v23.2 (F4b): mijoz/ta'minotchi qarzi, partiya qoldig'i va savdo summalari — bazadagi haqiqiy qiymat
    let ledgerAuthority = false;
    if (data.branchStore && await ledgerAuthorityOn(admin)) {
      ledgerAuthority = true;
      const bs = { ...data.branchStore };
      for (const bk of Object.keys(bs)) bs[bk] = overlayBranchLedger(bs[bk], await loadLedger(admin, bk)).branch;
      data = { ...data, branchStore: bs };
    }
    // v25 (43): filiallarning so'mdagi qarzi (jadvaldan; brauzer saqlashi uni yozmaydi). 43 bo'lmasa — yo'q.
    try {
      let q = admin.from('branch_debt_cur').select('filial,debt_uzs');
      if (!auth.isAdmin) q = q.eq('filial', auth.filial);
      const { data: du, error: duErr } = await q;
      if (!duErr) data = { ...data, branchDebtUzs: Object.fromEntries((du || []).map(r => [r.filial, Number(r.debt_uzs) || 0])) };
    } catch (_) { /* 43-migratsiya hali yo'q */ }
    // v10 (F7): maxfiy sozlamalar (Telegram bot tokeni, PIN'lar) faqat admin'ga
    if (!auth.isAdmin && data.settings) data = { ...data, settings: stripSecretSettings(data.settings) };
    // v23: Telegram bot tokeni admin'ga ham yuborilmaydi (faqat "o'rnatilgan" belgisi)
    if (auth.isAdmin && data.settings) data = { ...data, settings: stripAdminSecrets(data.settings) };

    // v24.8 (K2): tannarx (partiya, mahsulot, savdo foydasi) va hamkorlar — faqat ruxsat egasiga;
    // qolganlarga sotuv narxi TAYYOR holda (retailUsd / optUsd) — brauzer tannarxdan hisoblamaydi
    data = redactForStaff(data, auth);
    const ownVersions = auth.isAdmin ? branchVersions : (auth.filial in branchVersions ? { [auth.filial]: branchVersions[auth.filial] } : {});
    return json({ data, cashAuthority, ledgerAuthority, version: verOn ? Number(row.version || 0) : null, branchVersions: verOn ? ownVersions : null }, 200);
  } catch (e) {
    return json({ error: "Ma'lumot yuklashda xatolik" }, 500);
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('app-data-load', exports.handler);
