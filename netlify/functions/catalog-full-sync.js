// Netlify Function — diller-katalogini (catalog_products) BARCHA filiallar
// uchun, server tomonda, to'g'ridan-to'g'ri bazadagi AUTORITATIV holatdan
// hisoblab yozadi.
//
// BU — 1-USTUVORLIK / 1.4-QADAM YECHIMI: js/main.js'dagi eski dlSyncCatalog()
// mijozning (brauzerning) S._store holatiga tayanardi — bu esa filial-cheklovi
// yoqilgach (endi non-admin faqat o'z filialini ko'radi), BOSHQA filiallar
// uchun noto'g'ri (bo'sh) qator yozib qo'yish xavfini tug'dirardi.
//
// Bu Function esa har doim to'g'ridan-to'g'ri BAZADAN (service_role bilan,
// client holatiga bog'liq bo'lmagan holda) o'qiydi — shuning uchun uni KIM
// chaqirmasin (admin yoki ruxsatli filial xodimi — SYNC_PERMS), natija har doim TO'LIQ va TO'G'RI,
// boshqa filiallar ma'lumoti hech qachon bo'shab/buzilib qolmaydi.
const { getAdminClient, json, methodGuard, requireStaffAuth, serverError, logSecurityEvent } = require('./_lib/supabaseAdmin');

// v24.5: katalogni qayta hisoblashga ruxsat — admin yoki shu ruxsatlardan biri (mahsulot/kirim/qoldiq o'zgartiruvchi amallar)
const SYNC_PERMS = ['mahsulotlar.edit', 'mahsulotlar.create', 'mahsulotlar.delete', 'kirim.create',
  'savdo.create', 'savdo.edit', 'savdo.delete', 'qaytarish.create', 'dillerlar.manage'];
const { ledgerAuthorityOn, loadLedger, overlayBranchLedger } = require('./_lib/ledgerAuthority');

function safeNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function stockFromBatches(batchesArr, pid) {
  return (batchesArr || []).filter(b => b.pid === pid && b.status !== 'empty' && b.status !== 'transit')
    .reduce((s, b) => s + (b.qty - b.sold), 0);
}
function costFromBatches(batchesArr, pid) {
  const b = (batchesArr || []).filter(x => x.pid === pid && x.qty > x.sold && x.status !== 'empty' && x.status !== 'transit')
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  return b ? (b.costUsd || 0) : 0;
}
// Diller katalogi uchun mahsulot rasmi: faqat https havola (Storage'dagi ochiq URL).
// data:/blob: rasmlar katalogga YOZILMAYDI — ular katta va diller brauzerida ishlamaydi.
function catalogImage(p) {
  const list = Array.isArray(p && p.images) ? p.images : [];
  const u = String(list[0] || (p && p.image) || '');
  return /^https:\/\//i.test(u) && u.length <= 1000 ? u : null;
}
function optPrice(p, cost) {
  const pct = (p && p.optMarkupPct != null) ? p.optMarkupPct : 15; // js/main.js'dagi optPrice() bilan AYNAN bir xil formula
  return cost * (1 + pct / 100);
}

function stripImage(r) { const { image, ...rest } = r; return rest; }
function isMissingImageColumn(err) {
  const m = String((err && (err.message || err.details)) || '');
  return (err && (err.code === 'PGRST204' || err.code === '42703')) && /image/i.test(m);
}
exports._catalogImage = catalogImage;
exports._isMissingImageColumn = isMissingImageColumn;
exports._SYNC_PERMS = SYNC_PERMS;

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'catalog-full-sync', 'Server sozlanmagan — administratorga murojaat qiling'); }

  // v24.5: avval HAR QANDAY tasdiqlangan xodim (masalan faqat «dashboard.view»li xodim yoki hisobchi) butun
  // katalogni (barcha filial × barcha mahsulot) qayta yozdira olardi — og'ir amal, cheksiz chaqirish mumkin edi.
  // Endi — admin yoki OMBOR QOLDIG'INI O'ZGARTIRA OLADIGAN xodim. Ro'yxat ataylab kengroq: katalog save()ning
  // «yon ta'siri» (js/main.js → dlSyncCatalog), kassir savdosi ham qoldiqni kamaytiradi — u chiqarib tashlansa,
  // diller katalogida qoldiq eskirib qolardi (aynan v23.10 tuzatgan muammo). Mijoz tomoni ham shu ro'yxatni tekshiradi.
  const auth = await requireStaffAuth(event, admin, { loadPermissions: true, fn: 'catalog-full-sync' });
  if (!auth.ok) return auth.response;
  if (!auth.isAdmin && !SYNC_PERMS.some(k => auth.permKeys.has(k))) {
    await logSecurityEvent(admin, auth.staff, 'permission_denied', { need: SYNC_PERMS.join('|'), fn: 'catalog-full-sync' });
    return json({ error: "Katalogni sinxronlash uchun ruxsatingiz yo'q" }, 403);
  }

  try {
    // 1) Mahsulotlar ro'yxati (global) — asosiy app_data'dan
    const { data: mainRow, error: mainErr } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
    if (mainErr) throw mainErr;
    const mainData = mainRow?.data || {};
    const products = mainData.products || [];

    // 2) Har filialning eng so'nggi ombor holati — avval eski branchStore,
    //    keyin (mavjud bo'lsa) yangiroq app_data_branches bilan ustunlik beriladi
    const branchStore = { ...(mainData.branchStore || {}) };
    const { data: freshRows, error: freshErr } = await admin.from('app_data_branches').select('branch_key,data');
    if (freshErr) throw freshErr;
    (freshRows || []).forEach(r => { if (r.data) branchStore[r.branch_key] = r.data; });

    // v23.2 (F4b): partiya qoldig'i — bazadagi haqiqiy qiymat (ombor jurnali)
    if (await ledgerAuthorityOn(admin)) {
      for (const bk of Object.keys(branchStore)) {
        const L = await loadLedger(admin, bk);
        branchStore[bk] = overlayBranchLedger({ batches: branchStore[bk]?.batches || [] }, L).branch;
      }
    }

    // 3) Har bir filial x har bir mahsulot uchun qator hisoblanadi
    const rows = [];
    Object.keys(branchStore).forEach(bk => {
      const batchesArr = branchStore[bk]?.batches || [];
      products.forEach(p => {
        const cost = safeNum(costFromBatches(batchesArr, p.id));
        rows.push({
          id: p.id, filial: bk, sku: String(p.sku || ''), name: String(p.name || ''),
          qty: safeNum(stockFromBatches(batchesArr, p.id)), point_pct: safeNum(p.pointPct),
          optim_price: safeNum(optPrice(p, cost)), image: catalogImage(p), updated_at: new Date().toISOString()
        });
      });
    });

    const CHUNK = 150;
    // v24.5 (v23.10.2 dan): ilovadan o'chirilgan mahsulot katalogda «qoldiqli» qolib ketardi (faqat upsert edi) va diller
    // uni buyurtma qila olardi. Endi bunday qatorning qoldig'i 0 qilinadi (qator o'chirilmaydi — eski buyurtmalar havolasi).
    const live = new Set(products.map(p => String(p.id)));
    let staleZeroed = 0;
    const staleBy = new Map();   // filial → [id] — katalogdagi BARCHA filiallar (ilovada endi yo'q filial ham)
    for (let from = 0; ; from += 1000) {
      const { data: cur, error: ce } = await admin.from('catalog_products').select('id,filial,qty').order('id').order('filial').range(from, from + 999);
      if (ce) throw ce;
      (cur || []).forEach(r => {
        if (!live.has(String(r.id)) && Number(r.qty) > 0) { const k = r.filial || 'baza'; if (!staleBy.has(k)) staleBy.set(k, []); staleBy.get(k).push(r.id); }
      });
      if (!cur || cur.length < 1000) break;
    }
    for (const [bk, stale] of staleBy) {
      for (let i = 0; i < stale.length; i += CHUNK) {
        const part = stale.slice(i, i + CHUNK);
        const { error: ue } = await admin.from('catalog_products').update({ qty: 0, updated_at: new Date().toISOString() }).eq('filial', bk).in('id', part);
        if (ue) throw ue;
        staleZeroed += part.length;
      }
    }

    if (!rows.length) return json({ ok: true, count: 0, eskirganNol: staleZeroed, xabar: "Yozish uchun mahsulot topilmadi" }, 200);

    let withImage = true;
    for (let i = 0; i < rows.length; i += CHUNK) {
      let slice = rows.slice(i, i + CHUNK);
      if (!withImage) slice = slice.map(stripImage);
      let { error } = await admin.from('catalog_products').upsert(slice, { onConflict: 'id,filial' });
      // 22-migratsiya (image ustuni) hali qo'llanmagan bazada ham katalog yangilanaversin — rasmsiz
      if (error && withImage && isMissingImageColumn(error)) {
        withImage = false;
        ({ error } = await admin.from('catalog_products').upsert(slice.map(stripImage), { onConflict: 'id,filial' }));
      }
      if (error) throw error;
    }

    return json({ ok: true, count: rows.length, filiallar: Object.keys(branchStore).length, rasm: withImage, eskirganNol: staleZeroed }, 200);
  } catch (e) {
    return serverError(e, 'catalog-full-sync', "Sinxronlashda xatolik");
  }
};
