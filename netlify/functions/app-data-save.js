// Netlify Function — "app_data" ga yozishni AUTENTIFIKATSIYA + RUXSAT (RBAC)
// bilan himoyalangan holda amalga oshiradi.
//
// P0.1 — 0-BOSQICH AUDITIDA topilgan HIGH xavfni bartaraf etadi: avval bu
// yerda faqat "faol xodimmi" tekshirilardi (permission tekshiruvsiz), ya'ni
// har qanday rol (masalan kassir) butun app_data blobini (barcha modullar,
// barcha filiallar) qayta yozib qo'yishi mumkin edi.
//
// Endi: kelgan "data" obyekti ichidagi HAR BIR yuqori darajali kalit (va
// branchStore ichidagi har bir filial-bo'lim kaliti) MODULE_PERMISSION_MAP
// orqali kerakli RBAC permission'ga bog'lanadi. Admin (staff.role==='admin')
// — har doim, requireStaffAuth() ning o'zidagi mavjud qoidaga ko'ra, to'liq
// huquqli. Boshqa xodim — faqat o'zi yozayotgan kalitlarga mos permission'ga
// ega bo'lsagina saqlash o'tadi; aks holda 403 va staff_audit_log'ga yoziladi.
//
// FILIAL-CHEGARASI (branchStore) — bu qadamda O'ZGARTIRILMAYDI: pastdagi
// mavjud, to'g'ri ishlayotgan mantiq (admin bo'lmagan xodim faqat o'z
// filialiga yozadi) xuddi shu ko'rinishda saqlanadi, faqat unga permission
// tekshiruvi QO'SHILADI.
//
// Ma'lumot STRUKTURASI o'zgartirilmaydi — ruxsat berilgan kalitlar xuddi
// shu ko'rinishda, o'zgarishsiz app_data.data ustuniga yoziladi.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError, logSecurityEvent } = require('./_lib/supabaseAdmin');
const { filterTopLevelChanges, filterBranchChanges, isMassDelete, partnerInvestedChanges, serverPartnerInvested, partnerExpenseContrib, hasPerm, stripSecretSettings, stripAdminSecrets } = require('./_lib/appDataGuard');
const { cashAuthorityOn, loadBalances, enforceCashboxes } = require('./_lib/cashAuthority');
const { ledgerAuthorityOn, loadLedger, overlayBranchLedger, ledgerSnapshot } = require('./_lib/ledgerAuthority');
const { canSeeCost, canSeePartners, restoreProducts, restoreBranch, restorePartnersTop, redactSnapshot, redactTopValues, redactBranchValues } = require('./_lib/pricing');
const { versionOn, parseConflict, asVersion } = require('./_lib/appDataVersion');

// 2026-09-28 (OWASP A01 tuzatishi): ruxsat xaritalari va tekshiruv mantig'i
// _lib/appDataGuard.js'ga ko'chirildi (app-data-branch-save.js bilan UMUMIY).
// Muhim o'zgarish: endi faqat HAQIQATAN O'ZGARGAN kalitlar tekshiriladi va
// ruxsatsiz o'zgarish butun saqlashni rad etmaydi — faqat o'sha kalit
// e'tiborga olinmaydi (serverdagi qiymat qoladi) + staff_audit_log. Avvalgi
// (P0.1) variant har save()da o'zgarmagan "products"/"settings"ni ham
// tekshirgani uchun sotuvchining savdosini ham 403 bilan rad etardi.

async function _branchDebt(admin) {
  const { data } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
  return (data && data.data && data.data.branchDebt) || {};
}

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body || !body.data || typeof body.data !== 'object') return json({ error: "Noto'g'ri so'rov formati" }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'app-data-save', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { loadPermissions: true });
  if (!auth.ok) return auth.response;

  try {
    // 1.4.5-QADAM: kelgan "branchStore" mavjud (bulutdagi) holat bilan
    // BIRLASHTIRILADI (to'liq almashtirilmaydi) — faqat bitta filial
    // yuboradigan chaqiruvchilar (sotuvchi.html) boshqa filiallarni yo'qotmaydi.
    // v24.8 (37): optimistik qulf — o'qilgan versiya bilan yoziladi; brauzer eskirgan versiyani yuborsa — 409
    const verOn = await versionOn(admin);
    const { data: existingRow, error: readErr } = await admin.from('app_data').select(verOn ? 'data,version' : 'data').eq('id', 'main').maybeSingle();
    if (readErr) throw readErr;
    const existingData = existingRow?.data || {};
    const mainVersion = verOn ? (existingRow ? Number(existingRow.version || 0) : 0) : null;
    if (verOn && asVersion(body.baseVersion) != null && body.baseVersion !== mainVersion) {
      return json({ error: "Ma'lumot boshqa qurilmada o'zgargan — yangilanib qayta saqlanadi", code: 'VERSION_CONFLICT', version: mainVersion }, 409);
    }
    const incoming = body.data;
    const seeCost = canSeeCost(auth), seePartners = canSeePartners(auth);

    const { branchStore: incomingBranchStore, ...incomingTop0 } = incoming;
    // v23.2 (F4b): filialning Bazaga tovar qarzi (branchDebt) — faqat server (sotuv, filial to'lovi) o'zgartiradi
    const ledgerOn = await ledgerAuthorityOn(admin);
    let incomingTop = { ...incomingTop0 };
    delete incomingTop.costHidden; delete incomingTop.partnersHidden;   // brauzer belgilari — bazaga yozilmaydi
    if (ledgerOn) delete incomingTop.branchDebt;
    // v24.8 (K2): tannarx / hamkorlarni ko'rmaydigan xodim — u olmagan maydonlar bazadagidek qoladi
    if (!seeCost && 'products' in incomingTop) incomingTop.products = restoreProducts(existingData.products, incomingTop.products);
    // Hamkorlar yashirilgan xodim yuborgan «invested» — e'tiborsiz; farq bo'lsa (soxta qiymat) pastda xavfsizlik jurnaliga
    const hiddenPartnersIn = !seePartners && Array.isArray(incomingTop.partners) ? incomingTop.partners : null;
    if (!seePartners) incomingTop = restorePartnersTop(existingData, incomingTop);
    const top = filterTopLevelChanges({ existing: existingData, incoming: incomingTop, permKeys: auth.permKeys, isAdmin: auth.isAdmin, filial: auth.filial });
    const ignored = [...top.ignored];
    const massDelete = [...top.massDelete];
    const serverBranchValues = {};

    const mergedData = { ...existingData, ...top.allowed };
    const branchRowsToSync = {};
    const cashAuthority = {};
    const ledgerAuthority = {};

    const branchVer = {};             // filial qatori → o'qilgan versiya (37)
    const partnerDelta = new Map();   // hamkor id → xarajatlardan kutilgan invested o'zgarishi (server hisobi)
    const partnerExp = new Map();     // hamkor id → investedExp (invested'ga kiritilgan xarajatlar yig'indisi, server)
    const _r4 = (x) => Math.round((Number(x) || 0) * 10000) / 10000;
    if (incomingBranchStore && typeof incomingBranchStore === 'object') {
      const existingBS = existingData.branchStore || {};
      // XAVFSIZLIK: admin bo'lmagan chaqiruvchi — FAQAT o'z filialiga yozadi,
      // boshqa filial nomi yuborilgan bo'lsa ham e'tiborga olinmaydi.
      const keys = (auth.isAdmin ? Object.keys(incomingBranchStore) : (incomingBranchStore[auth.filial] ? [auth.filial] : []))
        .filter(bk => incomingBranchStore[bk] && typeof incomingBranchStore[bk] === 'object');

      // Klientlar filial ma'lumotini app_data_branches'dan yuklaydi (app-data-load.js
      // unga ustunlik beradi) — shuning uchun solishtirish asosi ham SHU jadval.
      const branchBase = {};
      if (keys.length) {
        const { data: rows, error: brErr } = await admin.from('app_data_branches').select(verOn ? 'branch_key,data,version' : 'branch_key,data').in('branch_key', keys);
        if (brErr) throw brErr;
        (rows || []).forEach(r => { if (r.data) branchBase[r.branch_key] = r.data; if (verOn) branchVer[r.branch_key] = Number(r.version || 0); });
      }

      // v11 (F4): kassa qoldig'i — bazadagi haqiqiy qiymat (brauzer yuborgan `bal` e'tiborga olinmaydi)
      const authorityOn = keys.length ? await cashAuthorityOn(admin) : false;
      const mergedBS = { ...existingBS };
      for (const bk of keys) {
        const base = branchBase[bk] || existingBS[bk] || {};
        let inc = incomingBranchStore[bk];
        if (!seeCost) inc = restoreBranch(base, inc);
        let balances = null;
        if (authorityOn) {
          balances = await loadBalances(admin, bk);
          if (Array.isArray(inc.cashboxes)) {
            const cash = enforceCashboxes(inc.cashboxes, base.cashboxes, balances);
            if (cash.tampered.length) await logSecurityEvent(admin, auth.staff, 'cash_balance_override_ignored', { branchKey: bk, boxes: cash.tampered });
            inc = { ...inc, cashboxes: cash.boxes };
          }
        }
        let ledger = null;
        if (ledgerOn) {
          ledger = await loadLedger(admin, bk);
          const ov = overlayBranchLedger(inc, ledger, base);
          if (ov.tampered.length) await logSecurityEvent(admin, auth.staff, 'ledger_value_override_ignored', { branchKey: bk, items: ov.tampered.slice(0, 50) });
          inc = ov.branch;
        }
        const res = filterBranchChanges({ existing: base, incoming: inc, permKeys: auth.permKeys, isAdmin: auth.isAdmin, prefix: 'branchStore.' });
        ignored.push(...res.ignored);
        massDelete.push(...res.massDelete);
        if (bk === auth.filial || !auth.isAdmin) Object.assign(serverBranchValues, res.serverValues);
        mergedBS[bk] = { ...base, ...res.allowed };
        if (balances && Array.isArray(mergedBS[bk].cashboxes)) {
          mergedBS[bk].cashboxes = enforceCashboxes(mergedBS[bk].cashboxes, base.cashboxes, balances).boxes;
          cashAuthority[bk] = mergedBS[bk].cashboxes;
        }
        if (ledger) {
          mergedBS[bk] = overlayBranchLedger(mergedBS[bk], ledger).branch;
          ledgerAuthority[bk] = ledgerSnapshot(ledger);
        }
        branchRowsToSync[bk] = mergedBS[bk];
      }
      mergedData.branchStore = mergedBS;
      // v23.10.1: hamkor turidagi xarajat — qabul qilingan (filtrdan o'tgan) xarajatlar farqi bo'yicha invested SERVERDA
      // faqat SHU filialning hamkori (boshqa filial hamkorining invested'ini o'zgartirib bo'lmaydi)
      // v23.10.2: o'z-o'zini tuzatuvchi hisob — server har hamkorda `investedExp` (invested'ga kiritilgan xarajatlar
      // yig'indisi) saqlaydi: invested_yangi = invested − investedExp + Σ(SAQLANAYOTGAN filial xarajatlari). Shunda
      // app_data yozilib filial yozuvi yiqilsa yoki parallel saqlashda xarajat ro'yxati almashsa — keyingi saqlash
      // invested'ni saqlangan xarajatlarga qaytaradi (ikki marta qo'shilmaydi, yo'qolmaydi). investedExp'i yo'q (eski)
      // hamkor — bazadagi xarajatlar allaqachon invested'ga kiritilgan deb boshlanadi (avvalgi delta qoidasi bilan bir xil).
      for (const p of (Array.isArray(existingData.partners) ? existingData.partners : [])) {
        if (!p || p.id === undefined) continue;
        const bk = p.filial || 'baza';
        if (!keys.includes(bk)) continue;
        const k = String(p.id);
        const prevExp = Number.isFinite(Number(p.investedExp)) && p.investedExp !== null && p.investedExp !== ''
          ? Number(p.investedExp) : (partnerExpenseContrib((branchBase[bk] || existingBS[bk] || {}).expenses).get(k) || 0);
        const newExp = _r4(partnerExpenseContrib(mergedBS[bk] && mergedBS[bk].expenses).get(k) || 0);
        partnerExp.set(k, newExp);
        const d = _r4(newExp - prevExp);
        if (d !== 0) partnerDelta.set(k, d);
      }
    }
    // v23.10.1: `hamkorlar.edit` yoki admin bo'lmasa — brauzer yuborgan invested ishlatilmaydi: serverdagi qiymat +
    // xarajatlardan hisoblangan o'zgarish. Farq bo'lsa (soxta qiymat) — xavfsizlik jurnaliga.
    const partnerEditor = auth.isAdmin || hasPerm(auth.permKeys, 'hamkorlar.edit');
    if (!partnerEditor && (partnerDelta.size || 'partners' in top.allowed)) {
      const sp = serverPartnerInvested(existingData.partners, top.allowed.partners || existingData.partners, partnerDelta);
      mergedData.partners = sp.partners;
      top.serverValues.partners = sp.partners;
      if (sp.mismatches.length && !hiddenPartnersIn && seePartners) await logSecurityEvent(admin, auth.staff, 'partner_invested_override_ignored', { items: sp.mismatches.slice(0, 50) });
    } else if (partnerEditor && 'partners' in top.allowed) {
      // hamkorlar.edit / admin — qo'lda tuzatish ruxsat etiladi, lekin xarajatlardan kelib chiqmagan farq alohida auditga
      const chk = serverPartnerInvested(existingData.partners, top.allowed.partners, partnerDelta);
      if (chk.mismatches.length) await logSecurityEvent(admin, auth.staff, 'partner_invested_manual_adjust', { items: chk.mismatches.slice(0, 50), isAdmin: !!auth.isAdmin });
    }

    // investedExp — faqat server qiymati (brauzer yuborgani e'tiborsiz): hisoblangan yoki avvalgi
    if (Array.isArray(mergedData.partners) && (partnerExp.size || 'partners' in top.allowed)) {
      const exExp = new Map((Array.isArray(existingData.partners) ? existingData.partners : []).filter(x => x && x.id !== undefined).map(x => [String(x.id), x.investedExp]));
      mergedData.partners = mergedData.partners.map((p) => {
        if (!p || p.id === undefined) return p;
        const k = String(p.id);
        const v = partnerExp.has(k) ? partnerExp.get(k) : exExp.get(k);
        if (v === undefined) { if (!('investedExp' in p)) return p; const { investedExp, ...rest } = p; return rest; }
        return p.investedExp === v ? p : { ...p, investedExp: v };
      });
      if (top.serverValues.partners) top.serverValues.partners = mergedData.partners;
    }

    // v23.10: hamkor `invested` har bir o'zgarishi (kim, eski → yangi) audit jurnaliga
    if (hiddenPartnersIn) {
      const srv = new Map((Array.isArray(mergedData.partners) ? mergedData.partners : []).filter(p => p && p.id !== undefined).map(p => [String(p.id), p]));
      const bad = hiddenPartnersIn.filter(p => p && p.id !== undefined && 'invested' in p && (!srv.has(String(p.id)) || Number(p.invested) !== Number(srv.get(String(p.id)).invested)))
        .map(p => ({ id: p.id, client: p.invested, server: srv.has(String(p.id)) ? srv.get(String(p.id)).invested : null }));
      if (bad.length) await logSecurityEvent(admin, auth.staff, 'partner_invested_override_ignored', { items: bad.slice(0, 50) });
    }
    if (mergedData.partners !== existingData.partners) {
      const inv = partnerInvestedChanges(existingData.partners, mergedData.partners);
      if (inv.length) await logSecurityEvent(admin, auth.staff, 'partner_invested_change', { changes: inv.slice(0, 50), isAdmin: !!auth.isAdmin });
    }

    // HARDENING (taklif): kurs o'zgarishi — har biri auditga (kim, eski → yangi); rad etilgani — alohida
    {
      const exS = (existingData.settings && typeof existingData.settings === 'object') ? existingData.settings : {};
      const nwS = (mergedData.settings && typeof mergedData.settings === 'object') ? mergedData.settings : exS;
      const inS = (incomingTop && incomingTop.settings && typeof incomingTop.settings === 'object') ? incomingTop.settings : {};
      for (const k of ['usdUzs', 'usdCny']) {
        if (nwS[k] !== exS[k]) await logSecurityEvent(admin, auth.staff, 'rate_change', { key: k, from: exS[k] ?? null, to: nwS[k] ?? null, isAdmin: !!auth.isAdmin });
        else if (k in inS && inS[k] !== exS[k]) await logSecurityEvent(admin, auth.staff, 'rate_change_rejected', { key: k, current: exS[k] ?? null, attempted: inS[k] });
      }
    }
    if (ignored.length) await logSecurityEvent(admin, auth.staff, 'app_data_save_denied', { deniedKeys: ignored });
    if (massDelete.length) await logSecurityEvent(admin, auth.staff, 'mass_delete_blocked', { keys: massDelete, fn: 'app-data-save' });
    // v23: admin ommaviy o'chirishi (masalan "Tizimni 0 qilish") — ruxsat etiladi, lekin AUDIT jurnaliga yoziladi
    if (auth.isAdmin) {
      const adminMass = ['products', 'partners'].filter(k => k in incomingTop && isMassDelete(existingData[k], incomingTop[k]));
      Object.keys(branchRowsToSync).forEach(bk => ['sales', 'customers', 'batches', 'cashTxns', 'suppliers', 'expenses'].forEach(k => {
        const inc = incomingBranchStore && incomingBranchStore[bk];
        const base = (existingData.branchStore || {})[bk] || {};
        if (inc && k in inc && isMassDelete(base[k], inc[k])) adminMass.push(`branchStore.${bk}.${k}`);
      }));
      if (adminMass.length) await logSecurityEvent(admin, auth.staff, 'mass_delete_admin', { keys: adminMass, fn: 'app-data-save' });
    }

    let versions = null;
    if (verOn) {
      // v24.8 (37): asosiy qator va filial qatorlari — BITTA tranzaksiyada, o'qilgan versiya bilan.
      // Orada boshqa yozuv bo'lgan bo'lsa — 409 (brauzer yangilab, o'z o'zgarishini ustiga qo'yib qayta yuboradi)
      const { data: v, error } = await admin.rpc('app_data_save_cas', {
        p_main: mergedData, p_main_base: mainVersion, p_keep_branch_debt: !!ledgerOn,
        p_branches: Object.keys(branchRowsToSync).map(bk => ({ key: bk, data: branchRowsToSync[bk], base: branchVer[bk] != null ? branchVer[bk] : 0 })),
      });
      if (error) {
        const c = parseConflict(error);
        if (c) return json({ error: "Ma'lumot boshqa qurilmada o'zgargan — yangilanib qayta saqlanadi", code: 'VERSION_CONFLICT', row: c.row, version: c.current }, 409);
        throw error;
      }
      versions = v || null;
    } else if (ledgerOn) {
      // branchDebt — yozish paytidagi bazadagi qiymat saqlanadi (parallel sotuvdagi oshirish yo'qolmaydi)
      const { error } = await admin.rpc('app_data_save_main', { p_data: mergedData });
      if (error) throw error;
    } else {
      const { error } = await admin.from('app_data').upsert({
        id: 'main', data: mergedData, updated_at: new Date().toISOString()
      });
      if (error) throw error;
    }

    // Filial jadvali (app_data_branches) ham shu zahoti yangilanadi. Avval
    // sotuvchi.html faqat app_data'ga yozardi, lekin yuklash app_data_branches'dan
    // bo'lardi — natijada sotuvchining savdosi sahifa yangilanganda "yo'qolib"
    // qolardi. Endi ikkala jadval har doim bir xil.
    if (!verOn) for (const bk of Object.keys(branchRowsToSync)) {
      const { error: bErr } = await admin.from('app_data_branches').upsert({
        branch_key: bk, data: branchRowsToSync[bk], updated_at: new Date().toISOString()
      }, { onConflict: 'branch_key' });
      if (bErr) throw bErr;
    }

    // v24.5 (v23.10.2 dan): javobda maxfiy sozlamalar (bot tokenlari, PIN'lar) QAYTMAYDI — app-data-load bilan bir xil qoida.
    // Avval: ruxsatsiz xodim settings'ni o'zgartirishga urinsa, rad etilgan qiymat (serverdagi to'liq settings) javobda kelardi.
    if (top.serverValues && top.serverValues.settings && typeof top.serverValues.settings === 'object') {
      top.serverValues.settings = auth.isAdmin ? stripAdminSecrets(top.serverValues.settings) : stripSecretSettings(top.serverValues.settings);
    }

    return json({
      ok: true, ignoredKeys: ignored, blockedMassDelete: massDelete,
      // Rad etilgan kalitlar uchun serverdagi haqiqiy qiymat — klient o'z
      // nusxasini shu bilan tuzatadi (aks holda har saqlashda qayta ogohlantirardi).
      // v24.8 (K2): tannarx / hamkorlar — faqat ruxsat egasiga (app-data-load bilan bir xil qoida)
      serverValues: redactTopValues(top.serverValues, auth, (mergedData.branchStore || {})[auth.filial]),
      serverBranchValues: redactBranchValues(serverBranchValues, auth), ownBranch: auth.filial,
      // v11 (F4): har bir yozilgan filial uchun bazadagi haqiqiy kassa qoldiqlari
      cashAuthority: Object.keys(cashAuthority).length ? { on: true, branches: cashAuthority } : { on: false },
      // v23.2 (F4b): har bir yozilgan filial uchun bazadagi haqiqiy qarz va partiya qoldiqlari
      ledgerAuthority: ledgerOn ? { on: true, branches: Object.fromEntries(Object.entries(ledgerAuthority).map(([bk, sn]) => [bk, redactSnapshot(sn, auth)])), branchDebt: await _branchDebt(admin) } : { on: false },
      versions,   // v24.8 (37): {main, branches:{bk}} — brauzer keyingi saqlashda baseVersion sifatida yuboradi
    }, 200);
  } catch (e) {
    return serverError(e, 'app-data-save', "Saqlashda xatolik");
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('app-data-save', exports.handler);
