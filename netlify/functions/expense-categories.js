// Netlify Function — XARAJAT KATEGORIYALARI (2026-10-02). Yagona haqiqiy manba:
// public.expense_categories (26-migratsiya). Tayyor (kodda qotirilgan) kategoriya YO'Q —
// foydalanuvchi o'zi yaratadi. Admin paneli va sotuvchi portali shu funksiyadan foydalanadi.
//
// POST { action, ... }
//   list    { filial? }                       — filialning barcha kategoriyalari (nofaollari ham — tarixiy nom uchun)
//   create  { turi, name, idemKey, filial? }  — yangi kategoriya
//   rename  { id, name, filial? }             — faqat nom o'zgaradi, ID o'zgarmaydi
//   remove  { id, filial? }                   — xarajatda ishlatilgan bo'lsa NOFAOL qilinadi, aks holda o'chiriladi
//
// Xavfsizlik: avtorizatsiya (JWT) + RBAC (mavjud ruxsatlar) + filial chegarasi (xodim — faqat
// o'z filiali, admin — tanlangan filial) + server tomonda nomni normallashtirish va tekshirish.
// Kategoriya hech qanday pul jadvaliga tegmaydi (kassa, Firma kassa, qarz, savdo).
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError, logSecurityEvent } = require('./_lib/supabaseAdmin');
const { _isMissingRelation } = require('./_lib/cashAuthority');

const TURI = ['dokon', 'tasischi', 'hamkor'];
const MAX_NAME = 60;
const SALE_LIKE = ['savdo.create', 'savdo.edit', 'savdo.delete', 'qaytarish.create'];
// Ko'rish — xarajat kirita oladigan yoki ko'ra oladigan har kim (sotuvchi portali ham)
const VIEW_PERMS = ['xarajatlar.view', 'xarajatlar.create', 'kassalar.transact', ...SALE_LIKE];
// Yaratish: do'kon xarajati — xarajat kirita oladigan har kim (cashbox-ops 'expense' bilan bir xil);
// ta'sischi/hamkor xarajati — faqat admin panelidagi xarajat huquqi
const CREATE_PERMS = { dokon: ['xarajatlar.create', 'kassalar.transact', ...SALE_LIKE], tasischi: ['xarajatlar.create'], hamkor: ['xarajatlar.create'] };
// Nomini o'zgartirish va o'chirish — faqat xarajatlarni boshqaruvchi (sotuvchi emas)
const MANAGE_PERMS = ['xarajatlar.create'];

// Nom: Unicode NFC, har qanday bo'shliq → bitta probel, chetlari kesiladi
function normName(v) {
  if (typeof v !== 'string') return '';
  return v.normalize('NFC').replace(/\s+/g, ' ').trim();
}
// Taqqoslash kaliti (SQL'dagi public._expense_cat_key bilan bir xil qoida):
// apostrof turlari bitta, katta-kichik harf farqsiz
function nameKey(v) {
  return normName(v).replace(/[ʻʼ‘’`´]/g, "'").toLowerCase();
}
function validName(name) {
  if (!name) return 'Kategoriya nomini yozing';
  if (name.length > MAX_NAME) return `Nom ${MAX_NAME} belgidan oshmasin`;
  if (/[\u0000-\u001F\u007F]/.test(name)) return "Nomda ruxsat etilmagan belgi bor";
  return null;
}
const rowOut = (r) => ({ id: Number(r.id), turi: r.turi, name: r.name, isActive: !!r.is_active, createdAt: r.created_at, updatedAt: r.updated_at,
  createdByName: r.created_by_name || null, deactivatedAt: r.deactivated_at || null });
const has = (auth, keys) => auth.isAdmin || keys.some(k => auth.permKeys.has(k));
const isUnique = (e) => e && (String(e.code) === '23505' || /duplicate key/i.test(String(e.message || '')));

// Filial xarajatlari (ishlatilganini aniqlash uchun): avval app_data_branches, bo'lmasa app_data.branchStore
async function branchExpenses(admin, filial) {
  const { data: row, error } = await admin.from('app_data_branches').select('data').eq('branch_key', filial).maybeSingle();
  if (error && !_isMissingRelation(error)) throw error;
  if (row && row.data && Array.isArray(row.data.expenses)) return row.data.expenses;
  const { data: main, error: e2 } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
  if (e2) throw e2;
  const bs = main && main.data && main.data.branchStore && main.data.branchStore[filial];
  return (bs && Array.isArray(bs.expenses)) ? bs.expenses : [];
}

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const body = parseBody(event);
  if (!body || typeof body !== 'object') return json({ error: "Noto'g'ri so'rov formati" }, 400);
  const action = body.action;
  if (!['list', 'create', 'rename', 'remove'].includes(action)) return json({ error: "Noma'lum amal" }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'expense-categories', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { loadPermissions: true, fn: 'expense-categories' });
  if (!auth.ok) return auth.response;
  const filial = resolveFilial(auth, body.filial);
  const staffName = auth.staff?.name || (auth.isAdmin ? 'Admin' : null);
  const staffId = auth.isAdmin ? null : (auth.staff?.id ?? null);

  const deny = async (need) => {
    await logSecurityEvent(admin, auth.staff, 'permission_denied', { need, fn: 'expense-categories', action, filial });
    return json({ error: "Bu amal uchun ruxsatingiz yo'q" }, 403);
  };
  const T = () => admin.from('expense_categories');
  const pending = () => json({ error: "Kategoriyalar uchun 26-migratsiya qo'llanishi kerak — administratorga murojaat qiling", migrationPending: true }, 409);

  try {
    if (action === 'list') {
      if (!has(auth, VIEW_PERMS)) return deny(VIEW_PERMS);
      const { data, error } = await T().select('*').eq('filial', filial).order('id', { ascending: true });
      if (error) { if (_isMissingRelation(error)) return pending(); throw error; }
      return json({ filial, categories: (data || []).map(rowOut) }, 200);
    }

    if (action === 'create') {
      const turi = body.turi;
      if (!TURI.includes(turi)) return json({ error: "Xarajat turi noto'g'ri" }, 400);
      if (!has(auth, CREATE_PERMS[turi])) return deny(CREATE_PERMS[turi]);
      if (typeof body.idemKey !== 'string' || !/^[A-Za-z0-9:_.-]{6,90}$/.test(body.idemKey)) return json({ error: "So'rov kaliti (idemKey) noto'g'ri" }, 400);
      const name = normName(body.name);
      const vErr = validName(name);
      if (vErr) return json({ error: vErr }, 400);
      const idem = `ec:${filial}:${body.idemKey}`;
      const replay = async () => {
        const { data: r, error } = await T().select('*').eq('idem_key', idem).maybeSingle();
        if (error) throw error;
        return r;
      };
      // Ikki marta bosish / tarmoq uzilib qayta yuborish — o'sha kategoriya qaytadi
      let prev;
      try { prev = await replay(); } catch (e) { if (_isMissingRelation(e)) return pending(); throw e; }
      if (prev) return json({ ok: true, duplicate: true, category: rowOut(prev) }, 200);
      const key = nameKey(name);
      const { data: same, error: e1 } = await T().select('*').eq('filial', filial).eq('turi', turi).eq('is_active', true);
      if (e1) { if (_isMissingRelation(e1)) return pending(); throw e1; }
      const clash = (same || []).find(r => nameKey(r.name) === key);
      if (clash) return json({ error: `"${clash.name}" kategoriyasi allaqachon bor`, existing: rowOut(clash) }, 409);
      const { data: ins, error: e2 } = await T().insert({ filial, turi, name, is_active: true, created_by: staffId, created_by_name: staffName, idem_key: idem }).select('*').single();
      if (e2) {
        if (isUnique(e2)) {
          const r = await replay();
          if (r) return json({ ok: true, duplicate: true, category: rowOut(r) }, 200);
          return json({ error: `"${name}" kategoriyasi allaqachon bor` }, 409);
        }
        throw e2;
      }
      return json({ ok: true, category: rowOut(Array.isArray(ins) ? ins[0] : ins) }, 200);
    }

    // rename / remove — faqat shu filialdagi kategoriya
    if (!has(auth, MANAGE_PERMS)) return deny(MANAGE_PERMS);
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id <= 0) return json({ error: "Kategoriya noto'g'ri" }, 400);
    const { data: cur, error: e0 } = await T().select('*').eq('id', id).eq('filial', filial).maybeSingle();
    if (e0) { if (_isMissingRelation(e0)) return pending(); throw e0; }
    if (!cur) return json({ error: 'Kategoriya topilmadi' }, 404);   // boshqa filialniki ham — "topilmadi"

    if (action === 'rename') {
      if (!cur.is_active) return json({ error: "Nofaol kategoriyani o'zgartirib bo'lmaydi" }, 400);
      const name = normName(body.name);
      const vErr = validName(name);
      if (vErr) return json({ error: vErr }, 400);
      if (name === cur.name) return json({ ok: true, category: rowOut(cur), unchanged: true }, 200);
      const key = nameKey(name);
      const { data: same, error: e1 } = await T().select('*').eq('filial', filial).eq('turi', cur.turi).eq('is_active', true);
      if (e1) throw e1;
      const clash = (same || []).find(r => Number(r.id) !== id && nameKey(r.name) === key);
      if (clash) return json({ error: `"${clash.name}" kategoriyasi allaqachon bor` }, 409);
      const { data: up, error: e2 } = await T().update({ name, updated_by_name: staffName }).eq('id', id).eq('filial', filial).select('*');
      if (e2) { if (isUnique(e2)) return json({ error: `"${name}" kategoriyasi allaqachon bor` }, 409); throw e2; }
      const row = Array.isArray(up) ? up[0] : up;
      return json({ ok: true, category: rowOut(row || { ...cur, name }) }, 200);
    }

    // remove: xarajatda ishlatilganmi (ID bo'yicha yoki eski yozuvlarda nomi bo'yicha)?
    const exps = await branchExpenses(admin, filial);
    const key = nameKey(cur.name);
    const used = exps.some(e => e && (Number(e.catId) === id
      || (e.catId == null && (e.turi || 'dokon') === cur.turi && nameKey(String(e.cat || '')) === key)));
    if (used) {
      if (!cur.is_active) return json({ ok: true, mode: 'deactivated', category: rowOut(cur) }, 200);
      const { data: up, error } = await T().update({ is_active: false, deactivated_at: new Date().toISOString(), deactivated_by_name: staffName }).eq('id', id).eq('filial', filial).select('*');
      if (error) throw error;
      const row = Array.isArray(up) ? up[0] : up;
      return json({ ok: true, mode: 'deactivated', category: rowOut(row || { ...cur, is_active: false }) }, 200);
    }
    const { error } = await T().delete().eq('id', id).eq('filial', filial);
    if (error) throw error;
    return json({ ok: true, mode: 'deleted', id }, 200);
  } catch (e) {
    return serverError(e, 'expense-categories', 'Kategoriya amali bajarilmadi');
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('expense-categories', exports.handler);
