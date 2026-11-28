// v25.6.5 — PostgREST (Supabase) bir so'rovda eng ko'pi 1000 qator qaytaradi (max_rows). Sahifalamasdan o'qilgan katta jadval
// jimgina KESILADI: ledger yuklovchisi yangi partiyalarni «bazada yo'q» deb, qoldig'ini 0 / «Tugagan» qilib yozar edi.
// selectAll(makeQuery, orderCol) — har sahifa uchun YANGI so'rov quriladi, tartib (barqaror) orderCol bo'yicha, 1000 talik qismlar.
// Natija { data, error } — oddiy so'rov kabi. range() yo'q (eski soxta mijoz) bo'lsa — bitta so'rov.
'use strict';
const PAGE = 1000, MAX_PAGES = 500, BLOCK = 4;   // 500 000 qatorgacha (cheksiz sikl himoyasi); keyingi sahifalar 4 tadan PARALLEL
// v25.6.9 (tezlik): baza boshqa qit'ada — har ketma-ket so'rov ~0,2–0,3 s. Birinchi sahifa to'lsa, keyingilari 4 tadan bir vaqtda so'raladi
// (tartib orderCol bo'yicha barqaror, natija ketma-ket o'qigandek bir xil).
async function selectAll(makeQuery, orderCol) {
  const page = async (p) => {
    let q = makeQuery();
    if (typeof q.range !== 'function') return { single: await q };
    if (orderCol && typeof q.order === 'function') q = q.order(orderCol, { ascending: true });
    return q.range(p * PAGE, p * PAGE + PAGE - 1);
  };
  const first = await page(0);
  if (first.single) return first.single;
  if (first.error) return { data: null, error: first.error };
  const out = [...(first.data || [])];
  let full = out.length >= PAGE;
  for (let p = 1; full && p < MAX_PAGES; p += BLOCK) {
    const res = await Promise.all(Array.from({ length: BLOCK }, (_, k) => page(p + k)));
    for (const r of res) {
      if (r.error) return { data: null, error: r.error };
      const rows = Array.isArray(r.data) ? r.data : [];
      out.push(...rows);
      if (rows.length < PAGE) full = false;
    }
  }
  return { data: out, error: null };
}
module.exports = { selectAll, PAGE };
