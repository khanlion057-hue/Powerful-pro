// Netlify Function — "app_data_branches" jadvaliga BITTA filial qatorini yozadi
// va o'qib tekshiradi (4b-bosqich parallel-yozish/tekshirish mexanizmi uchun).
//
// Himoya: tasdiqlangan xodim kerak. Filial-chegarasi: admin bo'lmasa — FAQAT
// o'z filialiga yoza oladi (boshqa filial nomini yuborsa ham, o'ziniki bilan
// almashtiriladi — bu boshqa filialga tasodifiy/xato yozishning oldini oladi).
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError, logSecurityEvent } = require('./_lib/supabaseAdmin');
const { filterBranchChanges, sameValue } = require('./_lib/appDataGuard');
const { cashAuthorityOn, loadBalances, enforceCashboxes } = require('./_lib/cashAuthority');
const { ledgerAuthorityOn, loadLedger, overlayBranchLedger, ledgerSnapshot } = require('./_lib/ledgerAuthority');
const { canSeeCost, restoreBranch, redactSnapshot, redactBranchValues } = require('./_lib/pricing');
const { versionOn, parseConflict, asVersion } = require('./_lib/appDataVersion');

// 2026-09-28 (OWASP A01 tuzatishi): avval bu yerda FAQAT "xodimmi" tekshirilardi —
// har qanday xodim (kassir ham) o'z filialining BUTUN ma'lumotini (savdo, mijoz,
// kassa, partiya) qayta yoza yoki o'chira olardi. Endi app-data-save.js bilan
// BIR XIL qoida (_lib/appDataGuard.js): faqat o'zgargan kalitlar, faqat ruxsat
// bo'lsa; ommaviy o'chirish — faqat admin.

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body || !body.branchKey || !body.data || typeof body.data !== 'object') return json({ error: "Noto'g'ri so'rov formati" }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'app-data-branch-save', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { loadPermissions: true });
  if (!auth.ok) return auth.response;

  // Filial chegarasi: admin bo'lmasa, faqat o'z filialiga yozadi
  const branchKey = auth.isAdmin ? body.branchKey : auth.filial;

  try {
    // v24.8 (37): optimistik qulf — brauzer eskirgan versiya bilan yozsa (yoki orada boshqa yozuv bo'lsa) — 409
    const verOn = await versionOn(admin);
    const { data: existingRow, error: readErr } = await admin.from('app_data_branches').select(verOn ? 'data,version' : 'data').eq('branch_key', branchKey).maybeSingle();
    if (readErr) throw readErr;
    const existing = existingRow?.data || {};
    const rowVersion = verOn ? (existingRow ? Number(existingRow.version || 0) : 0) : null;
    if (verOn && asVersion(body.baseVersion) != null && body.baseVersion !== rowVersion) {
      return json({ error: "Ma'lumot boshqa qurilmada o'zgargan — yangilanib qayta saqlanadi", code: 'VERSION_CONFLICT', branchKey, version: rowVersion }, 409);
    }

    // v11 (F4): kassa qoldig'i — bazadagi haqiqiy qiymat (brauzer yuborgan `bal` e'tiborga olinmaydi)
    let incoming = body.data;
    // v24.8 (K2): tannarxni ko'rmaydigan xodim — u olmagan maydonlar (partiya/savdo tannarxi) bazadagidek qoladi
    if (!canSeeCost(auth)) incoming = restoreBranch(existing, incoming);
    let balances = null;
    if (await cashAuthorityOn(admin)) {
      balances = await loadBalances(admin, branchKey);
      if (Array.isArray(incoming.cashboxes)) {
        const cash = enforceCashboxes(incoming.cashboxes, existing.cashboxes, balances);
        if (cash.tampered.length) await logSecurityEvent(admin, auth.staff, 'cash_balance_override_ignored', { branchKey, boxes: cash.tampered });
        incoming = { ...incoming, cashboxes: cash.boxes };
      }
    }

    // v23.2 (F4b): qarz, partiya qoldig'i va savdo summalari — bazadagi haqiqiy qiymat (brauzer yuborgani emas)
    let ledger = null;
    if (await ledgerAuthorityOn(admin)) {
      ledger = await loadLedger(admin, branchKey);
      const ov = overlayBranchLedger(incoming, ledger, existing);
      if (ov.tampered.length) await logSecurityEvent(admin, auth.staff, 'ledger_value_override_ignored', { branchKey, items: ov.tampered.slice(0, 50) });
      incoming = ov.branch;
    }

    const res = filterBranchChanges({ existing, incoming, permKeys: auth.permKeys, isAdmin: auth.isAdmin });
    let toStore = { ...existing, ...res.allowed };
    if (ledger) toStore = overlayBranchLedger(toStore, ledger).branch;
    // Ruxsat bo'lmasa ham (kassalar kaliti rad etilsa) JSON'dagi qoldiq bazaga tenglashtiriladi
    if (balances && Array.isArray(toStore.cashboxes)) toStore.cashboxes = enforceCashboxes(toStore.cashboxes, existing.cashboxes, balances).boxes;

    if (res.ignored.length) await logSecurityEvent(admin, auth.staff, 'app_data_branch_save_denied', { branchKey, deniedKeys: res.ignored });
    if (res.massDelete.length) await logSecurityEvent(admin, auth.staff, 'mass_delete_blocked', { branchKey, keys: res.massDelete, fn: 'app-data-branch-save' });

    let version = null;
    if (verOn) {
      const { data: v, error: casErr } = await admin.rpc('app_data_save_cas', { p_main: null, p_main_base: null, p_keep_branch_debt: true,
        p_branches: [{ key: branchKey, data: toStore, base: rowVersion }] });
      if (casErr) {
        const c = parseConflict(casErr);
        if (c) return json({ error: "Ma'lumot boshqa qurilmada o'zgargan — yangilanib qayta saqlanadi", code: 'VERSION_CONFLICT', branchKey, version: c.current }, 409);
        throw casErr;
      }
      version = v && v.branches ? Number(v.branches[branchKey]) : null;
    } else {
      const { error: upErr } = await admin.from('app_data_branches').upsert({
        branch_key: branchKey, data: toStore, updated_at: new Date().toISOString()
      }, { onConflict: 'branch_key' });
      if (upErr) throw upErr;
    }

    const { data: check, error: checkErr } = await admin.from('app_data_branches').select('data').eq('branch_key', branchKey).maybeSingle();
    if (checkErr) throw checkErr;

    // matched — "yozmoqchi bo'lgan narsamiz haqiqatan yozildimi" (ruxsatsiz
    // kalitlar ataylab tashlab yuborilgan bo'lsa, bu migratsiya nomosligi emas)
    const matched = sameValue(check?.data, toStore);
    return json({ ok: true, matched, branchKey, ignoredKeys: res.ignored, blockedMassDelete: res.massDelete, serverValues: redactBranchValues(res.serverValues, auth),
      cashAuthority: balances ? { on: true, cashboxes: toStore.cashboxes || [] } : { on: false },
      ledgerAuthority: ledger ? { on: true, ...redactSnapshot(ledgerSnapshot(ledger), auth) } : { on: false }, version }, 200);
  } catch (e) {
    return serverError(e, 'app-data-branch-save', "Saqlashda xatolik");
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('app-data-branch-save', exports.handler);
