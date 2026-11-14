// ════════════════════════════════════════════════════════════
// FILIAL KASSALARI — SERVER HAQIQIY MANBA (v11, F4; 24-migratsiya).
//
// Kassa qoldig'i endi brauzer yuborgan son EMAS — bazadagi cashbox_balances
// (o'zgarmas cashbox_ledger jurnali orqali yuritiladi). Bu modul:
//  • cashAuthorityOn()   — 24-migratsiya qo'llanganmi (cashbox_ledger bormi);
//  • loadBalances()      — filial kassalarining bazadagi qoldiqlari;
//  • enforceCashboxes()  — app_data JSON'idagi kassalar ro'yxatiga bazadagi
//    qoldiqni MAJBURAN yozadi (brauzer yuborgan `bal` e'tiborga olinmaydi),
//    qoldig'i bor kassani ro'yxatdan o'chirib "yashirish"ga yo'l qo'ymaydi.
//
// 24-migratsiya hali qo'llanmagan bo'lsa — avvalgi xatti-harakat (JSON), shunda
// kod migratsiyadan oldin chiqarilsa ham hech narsa buzilmaydi.
// ════════════════════════════════════════════════════════════

const OFF_RECHECK_MS = 60 * 1000;
let _state = { on: null, at: 0 };

function _isMissingRelation(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '');
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || /does not exist|could not find the table|schema cache/i.test(msg);
}

async function cashAuthorityOn(admin) {
  if (_state.on === true) return true;
  if (_state.on === false && Date.now() - _state.at < OFF_RECHECK_MS) return false;
  const { error } = await admin.from('cashbox_ledger').select('id').limit(1);
  if (error && !_isMissingRelation(error)) throw error;
  _state = { on: !error, at: Date.now() };
  return _state.on;
}
function _resetCashAuthorityCache() { _state = { on: null, at: 0 }; _bigCols.clear(); }

// v23: ustun bigint'mi (25-migratsiya integer → bigint kengaytirgan)? Integer ustunda katta son
// bilan filtr PostgreSQL'da 22003 (out of range) beradi — shu bilan sxemani o'qimasdan bilamiz.
const _bigCols = new Map();
async function bigIdColumn(admin, table, col) {
  const k = table + '.' + col;
  if (_bigCols.get(k) === true) return true;
  const { error } = await admin.from(table).select(col).eq(col, 3000000000).limit(1);
  if (error && String(error.code || '') !== '22003' && !/out of range/i.test(String(error.message || ''))) throw error;
  _bigCols.set(k, !error);
  return !error;
}

// { "1": { bal: 100, cur: 'UZS' }, ... }
async function loadBalances(admin, filial) {
  const { data, error } = await admin.from('cashbox_balances').select('box_local_id,balance,currency').eq('filial', filial);
  if (error) throw error;
  const out = {};
  (data || []).forEach(r => { out[String(r.box_local_id)] = { bal: Math.round(Number(r.balance || 0) * 100) / 100, cur: r.currency || null }; });
  return out;
}

const _isBoxList = (v) => Array.isArray(v) && v.every(b => b && typeof b === 'object');

// incoming — brauzer yuborgan ro'yxat; existing — serverdagi JSON ro'yxat.
// Natija: { boxes, tampered } — tampered: brauzer na bazadagi, na avvalgi JSON'dagi
// qiymatga mos kelmaydigan qoldiq yuborgan kassalar (xavfsizlik jurnali uchun;
// eskirgan nusxa — oddiy holat, u tampered hisoblanmaydi).
function enforceCashboxes(incoming, existing, balances) {
  const inc = _isBoxList(incoming) ? incoming : [];
  const ex = _isBoxList(existing) ? existing : [];
  const exMap = new Map(ex.map(b => [String(b.id), b]));
  const tampered = [];
  const seen = new Set();
  const boxes = [];
  for (const b of inc) {
    const key = String(b.id);
    if (seen.has(key)) continue;                        // takroriy ID — bitta kassa
    seen.add(key);
    const db = balances[key];
    const bal = db ? db.bal : 0;                        // bazada yo'q kassa — 0 dan boshlanadi
    const cur = db && db.cur ? db.cur : b.cur;          // qoldiq bor kassaning valyutasi o'zgarmaydi
    const sent = Number(b.bal || 0);
    const prev = exMap.has(key) ? Number(exMap.get(key).bal || 0) : 0;
    if ((sent !== bal && sent !== prev) || cur !== b.cur) tampered.push(key);
    boxes.push({ ...b, bal, cur });
  }
  // Qoldig'i bor kassani ro'yxatdan olib tashlash — pulni "yashirish" — rad etiladi
  for (const b of ex) {
    const key = String(b.id);
    if (seen.has(key)) continue;
    const db = balances[key];
    if (db && db.bal !== 0) { boxes.push({ ...b, bal: db.bal, cur: db.cur || b.cur }); seen.add(key); tampered.push(key); }
  }
  return { boxes, tampered };
}

// Filial obyektining (app_data_branches.data yoki branchStore[filial]) kassalariga
// bazadagi qoldiqni yozadi. Kassa ro'yxati yo'q bo'lsa — o'zgarishsiz.
function overlayBranch(branchObj, balances) {
  if (!branchObj || typeof branchObj !== 'object' || !_isBoxList(branchObj.cashboxes)) return branchObj;
  return { ...branchObj, cashboxes: enforceCashboxes(branchObj.cashboxes, branchObj.cashboxes, balances).boxes };
}

// Filial kassalari ro'yxati (nomi, valyutasi) — SERVERDAGI ma'lumotdan (brauzerga ishonilmaydi)
// va serverdagi USD/UZS kursi. Manba: app_data_branches, yo'q bo'lsa app_data.branchStore.
async function loadBranchBoxes(admin, filial) {
  const { data: br, error } = await admin.from('app_data_branches').select('data').eq('branch_key', filial).maybeSingle();
  if (error) throw error;
  const { data: main, error: e2 } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
  if (e2) throw e2;
  const branch = (br && br.data && typeof br.data === 'object') ? br.data : (main?.data?.branchStore?.[filial] || {});
  let boxes = br?.data?.cashboxes;
  if (!Array.isArray(boxes)) boxes = main?.data?.branchStore?.[filial]?.cashboxes;
  const rate = Number(main?.data?.settings?.usdUzs) || null;
  return { boxes: Array.isArray(boxes) ? boxes.filter(b => b && typeof b === 'object') : [], rate, branch };
}

// RPC funksiyasi bazada yo'qmi (migratsiya hali qo'llanmagan)
function isMissingFunction(err) {
  if (!err) return false;
  const code = String(err.code || ''); const msg = String(err.message || '');
  return code === '42883' || code === 'PGRST202' || /function .* does not exist|could not find the function/i.test(msg);
}

// v23: eski (legacy) kassa/to'lov API'lari — 24-migratsiyadan keyin moliyaviy yozuvni rad etadi
// (410 Gone). Migratsiyagacha — avvalgidek ishlaydi (orqaga moslik).
async function legacyCashBlocked(admin, fn) {
  if (!(await cashAuthorityOn(admin))) return null;
  return {
    statusCode: 410, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: `Eskirgan API (${fn}): pul harakati endi faqat kassa jurnali orqali (cashbox-ops). Sahifani yangilang.`, deprecated: true }),
  };
}

module.exports = { bigIdColumn, legacyCashBlocked, cashAuthorityOn, isMissingFunction, loadBalances, loadBranchBoxes, enforceCashboxes, overlayBranch, _resetCashAuthorityCache, _isMissingRelation };
