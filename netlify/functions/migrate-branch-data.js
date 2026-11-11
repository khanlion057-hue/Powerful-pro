// Netlify Function — 4b-bosqich / 2-qadam: eski app_data.branchStore'dan
// yangi app_data_branches jadvaliga ma'lumotni FAQAT O'QIB ko'chiradi.
//
// MUHIM: eski "app_data" jadvaliga hech qanday YOZISH amali qilinmaydi — faqat SELECT.
// Idempotent: necha marta ishga tushirilsa ham xavfsiz (upsert, natija bir xil bo'ladi).
//
// Rejimlar (body.mode):
//   'verify'  — hech narsa yozmaydi, faqat eski va yangi (agar mavjud bo'lsa) taqqoslaydi
//   'migrate' — ko'chiradi (upsert), keyin darhol tekshiradi (verify bilan bir xil)
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function countKeys(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  return Object.keys(obj).length;
}
function byteSize(obj) {
  return Buffer.byteLength(JSON.stringify(obj || {}), 'utf8');
}

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  const mode = body?.mode === 'migrate' ? 'migrate' : 'verify';

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'migrate-branch-data', 'Server sozlanmagan — administratorga murojaat qiling'); }

  // Bu — tizim darajasidagi kuchli vosita, shuning uchun FAQAT admin chaqira oladi
  const auth = await requireStaffAuth(event, admin, { requireAdmin: true });
  if (!auth.ok) return auth.response;

  try {
    // 1) Eski jadvalni FAQAT O'QIYMIZ — hech qachon yozmaymiz
    const { data: oldRow, error: oldErr } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
    if (oldErr) throw oldErr;
    if (!oldRow || !oldRow.data) {
      return json({ error: "Eski app_data qatori topilmadi ('main')" }, 404);
    }
    const branchStore = oldRow.data.branchStore || {};
    const branchKeys = Object.keys(branchStore);

    if (!branchKeys.length) {
      return json({ error: "branchStore ichida hech qanday filial topilmadi — ko'chirishga hojat yo'q" }, 200);
    }

    const report = [];

    for (const key of branchKeys) {
      const sourceData = branchStore[key];

      if (mode === 'migrate') {
        const { error: upErr } = await admin.from('app_data_branches').upsert({
          branch_key: key, data: sourceData, updated_at: new Date().toISOString()
        }, { onConflict: 'branch_key' });
        if (upErr) throw upErr;
      }

      // Tekshirish: yangi jadvaldan qayta o'qib, eski manba bilan solishtiramiz
      const { data: newRow, error: newErr } = await admin.from('app_data_branches').select('data').eq('branch_key', key).maybeSingle();
      if (newErr) throw newErr;

      const targetData = newRow?.data ?? null;
      const matched = targetData !== null && deepEqual(sourceData, targetData);

      report.push({
        branchKey: key,
        existedInTarget: targetData !== null,
        matched,
        sourceKeyCount: countKeys(sourceData),
        targetKeyCount: countKeys(targetData),
        sourceBytes: byteSize(sourceData),
        targetBytes: byteSize(targetData),
        // Har bir ichki bo'lim (sales, batches, customers va h.k.) nechta yozuvdan iboratligi —
        // batafsil tekshirish uchun eng katta massivlarni alohida ko'rsatamiz
        sections: Object.keys(sourceData || {}).map(sec => ({
          name: sec,
          sourceCount: Array.isArray(sourceData[sec]) ? sourceData[sec].length : (typeof sourceData[sec]==='object' ? countKeys(sourceData[sec]) : 1),
          targetCount: targetData ? (Array.isArray(targetData[sec]) ? targetData[sec].length : (typeof targetData[sec]==='object' ? countKeys(targetData[sec]) : 1)) : 0
        }))
      });
    }

    const allMatched = report.every(r => r.matched);

    return json({
      mode, allMatched, branchCount: branchKeys.length, report,
      note: allMatched
        ? "Barcha filiallar muvaffaqiyatli tekshirildi — eski va yangi ma'lumot bir xil."
        : "DIQQAT: ba'zi filiallarda farq bor — pastdagi 'report' bo'limini ko'ring. Eski jadval hech qachon o'zgartirilmadi.",
      oldTableUntouched: true
    }, 200);
  } catch (e) {
    { const r = serverError(e, 'migrate-branch-data', "Noma'lum xatolik"); const b = JSON.parse(r.body); b.oldTableUntouched = true; r.body = JSON.stringify(b); return r; }
  }
};
