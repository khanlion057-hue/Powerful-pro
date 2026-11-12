// Netlify Function — Storage'dagi "product-images" bucket'ida bir xil mahsulotga (pid)
// tegishli bir nechta fayl bo'lsa, ENG YANGISINI ("faol rasm") qoldirib, qolgan
// eski/duplikat fayllarni aniqlaydi.
//
// Himoyalangan: FAQAT administrator (role='admin') chaqira oladi.
//
// XAVFSIZLIK QOIDALARI:
//  - "dryRun" standart bo'yicha TRUE — hech narsa o'chirilmaydi, faqat hisobot beriladi.
//  - Haqiqiy o'chirish uchun body'da AYNAN {dryRun:false} kelishi SHART.
//  - O'chiriladigan ro'yxat HAR SAFAR shu so'rov ichida, Storage'ning JORIY haqiqiy
//    holatidan qayta hisoblanadi (frontend'dan "shu fayllarni o'chir" deb ro'yxat
//    yuborilmaydi va ishonilmaydi) — bu eskirgan/noto'g'ri ro'yxat bilan xato fayl
//    o'chirilishining oldini oladi.
//  - Guruhlash HAR BIR faylning TO'LIQ NOMIGA qarab, aniq (substring emas) amalga
//    oshiriladi — pid=100 va pid=1000 hech qachon aralashmaydi.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');

function fmtBytes(b) {
  if (b >= 1024*1024) return (b/1024/1024).toFixed(2) + ' MB';
  if (b >= 1024) return (b/1024).toFixed(1) + ' KB';
  return b + ' B';
}

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event) || {};
  const dryRun = body.dryRun !== false; // aniq false bo'lmasa — doim sinov rejimi (xavfsiz standart)

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'cleanup-duplicate-images', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { requireAdmin: true });
  if (!auth.ok) return auth.response;

  try {
    // 1) Bucket'dagi BARCHA fayllarni olamiz (sahifalab, 1000 tadan)
    let allFiles = [];
    let offset = 0;
    while (true) {
      const { data, error } = await admin.storage.from('product-images').list('', { limit: 1000, offset, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw error;
      if (!data || !data.length) break;
      allFiles.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }

    // 2) Mahsulot nomlarini bilish uchun (faqat o'qiymiz, hech narsa o'zgartirmaymiz)
    let productNames = {};
    // Mahsulotlar HOZIR ishlatayotgan fayllar (asosiy rasm + galereya, 2026-10-01) — bular
    // hech qachon "duplikat" deb o'chirilmaydi. Mahsulotlar ro'yxatini o'qib bo'lmasa —
    // xavfsizlik uchun hech narsa o'chirilmaydi (pastda referencedOk tekshiriladi).
    const referenced = new Set();
    let referencedOk = false;
    const fileNameOf = (u) => { const m = /\/product-images\/([^?#]+)/.exec(String(u || '')); return m ? decodeURIComponent(m[1]) : null; };
    try {
      const { data: appDataRow } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
      (appDataRow?.data?.products || []).forEach(p => {
        if (!p || p.id === undefined) return;
        productNames[String(p.id)] = p.name;
        [p.image, ...(Array.isArray(p.images) ? p.images : [])].forEach(u => { const n = fileNameOf(u); if (n) referenced.add(n); });
      });
      referencedOk = !!appDataRow;
    } catch (e) { /* nom topilmasa ham davom etamiz — faqat hisobotda "—" ko'rinadi */ }

    // 3) Mahsulot kaliti (pid) bo'yicha ANIQ guruhlaymiz — "p<pid>-<vaqt>.<ext>" (eski)
    //    yoki "p<pid>.<ext>" (yangi) — ikkalasi ham bir xil <pid>ga tegishli deb topiladi
    const groups = {};
    allFiles.forEach(f => {
      const m = /^p([0-9a-zA-Z]+)[-.]/.exec(f.name);
      if (!m) return; // bizning naqshimizga mos kelmagan fayl — tegilmaydi, e'tiborsiz qoldiriladi
      const key = m[1];
      (groups[key] = groups[key] || []).push(f);
    });

    const toDelete = [];
    const report = [];
    let totalBytes = 0, savedBytes = 0;
    Object.entries(groups).forEach(([pid, files]) => {
      const fileBytes = (f) => (f.metadata && f.metadata.size) ? Number(f.metadata.size) : 0;
      const groupTotal = files.reduce((s,f)=>s+fileBytes(f), 0);
      totalBytes += groupTotal;
      if (files.length <= 1) {
        report.push({ pid, nomi: productNames[pid] || '—', jamiFayl: 1, faolRasm: files[0]?.name || null, faolHajm: fmtBytes(fileBytes(files[0])), duplikat: [], tejaladiganHajm: '0 B' });
        return;
      }
      // Mahsulot ishlatayotgan barcha fayllar (galereya) qoladi; hech biri ishlatilmasa —
      // eng yangisi ("faol rasm") qoladi, qolgani — duplikat/eski
      const sorted = files.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
      const used = sorted.filter(f => referenced.has(f.name));
      const keepList = used.length ? used : [sorted[0]];
      const keep = keepList[0];
      const rest = referencedOk ? sorted.filter(f => !keepList.includes(f)) : [];
      const groupSaved = rest.reduce((s,f)=>s+fileBytes(f), 0);
      savedBytes += groupSaved;
      rest.forEach(f => toDelete.push(f.name));
      report.push({
        pid, nomi: productNames[pid] || '—', jamiFayl: files.length,
        faolRasm: keepList.map(f => f.name).join(', '), faolHajm: fmtBytes(keepList.reduce((s,f)=>s+fileBytes(f),0)),
        duplikat: rest.map(f => ({ nomi: f.name, hajm: fmtBytes(fileBytes(f)), yaratilgan: f.created_at })),
        tejaladiganHajm: fmtBytes(groupSaved)
      });
    });
    // Eng ko'p tejaladigan mahsulotlar birinchi ko'rinsin
    report.sort((a,b) => b.duplikat.length - a.duplikat.length);

    // 4) Haqiqiy o'chirish — FAQAT dryRun:false bo'lsa, va faqat shu YERDA qayta
    //    hisoblangan (frontend ta'sir qila olmaydigan) ro'yxat bo'yicha
    let deletedCount = 0;
    if (!dryRun && toDelete.length) {
      const { data, error } = await admin.storage.from('product-images').remove(toDelete);
      if (error) throw error;
      deletedCount = data?.length || toDelete.length;
    }

    return json({
      dryRun,
      jamiFayl: allFiles.length,
      mahsulotlarSoni: Object.keys(groups).length,
      duplikatliMahsulotlar: report.filter(r=>r.duplikat.length>0).length,
      ochiriladiganFayl: toDelete.length,
      jamiHajm: fmtBytes(totalBytes),
      tejaladiganHajm: fmtBytes(savedBytes),
      report,
      bajarildi: !dryRun,
      xabar: dryRun
        ? `Sinov rejimi: ${toDelete.length} ta fayl (${fmtBytes(savedBytes)}) o'chirilishi REJALASHTIRILDI — HALI HECH NARSA O'CHIRILMADI.`
        : `${deletedCount} ta fayl muvaffaqiyatli o'chirildi, ${fmtBytes(savedBytes)} joy bo'shadi.`
    }, 200);
  } catch (e) {
    return serverError(e, 'cleanup-duplicate-images', "Noma'lum xatolik");
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('cleanup-duplicate-images', exports.handler);
