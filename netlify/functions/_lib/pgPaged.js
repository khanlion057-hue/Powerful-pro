// v25.6.5 — PostgREST (Supabase) bir so'rovda eng ko'pi 1000 qator qaytaradi (max_rows). Sahifalamasdan o'qilgan katta jadval
// jimgina KESILADI: ledger yuklovchisi yangi partiyalarni «bazada yo'q» deb, qoldig'ini 0 / «Tugagan» qilib yozar edi.
// selectAll(makeQuery, orderCol) — har sahifa uchun YANGI so'rov quriladi, tartib (barqaror) orderCol bo'yicha, 1000 talik qismlar.
// Natija { data, error } — oddiy so'rov kabi. range() yo'q (eski soxta mijoz) bo'lsa — bitta so'rov.
'use strict';
const PAGE = 1000, MAX_PAGES = 500;   // 500 000 qatordan keyin to'xtaydi (cheksiz sikl himoyasi)
async function selectAll(makeQuery, orderCol) {
  const out = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    let q = makeQuery();
    if (typeof q.range !== 'function') { const r = await q; return r; }
    if (orderCol && typeof q.order === 'function') q = q.order(orderCol, { ascending: true });
    const r = await q.range(p * PAGE, p * PAGE + PAGE - 1);
    if (r.error) return { data: null, error: r.error };
    const rows = Array.isArray(r.data) ? r.data : [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return { data: out, error: null };
}
module.exports = { selectAll, PAGE };
