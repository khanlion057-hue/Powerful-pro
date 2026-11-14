// ════════════════════════════════════════════════════════════
// TELEFON QOBIG'I (v24.2) — admin paneli (index.html). Egasi talabi (2026-10-14):
//  • Bosh sahifa — yagona «uy». Yuqorida: «Mening doʻkonlarim» (filial tanlash, logo va nom), 🔔, profil.
//    Pastda menyu: Kirim · Mahsulotlar · Savdo · Stat · Audit (Biznes holati).
//  • Telefonda har qanday boʻlim TOʻLIQ EKRANDA ochiladi: yuqorida nomi va ✕ (har doim bosh sahifaga),
//    pastki menyu koʻrinmaydi — faqat shu boʻlimga oid narsalar.
//  • Profil: Amallar jurnali, Ayirboshlash, Kun yakuni (kassa yopish), Sozlamalar, Chiqish.
//    Kun/tun almashtirgich yuqori paneldan olib tashlandi — mavzu faqat Sozlamalar → Dizayn mavzusi.
//  • «Barcha cheklar» — davr, qidiruv, cheklar va sotilgan mahsulotlar.
//  • Kompyuterda (≥1025px) — yon menyu maketi saqlanadi.
// Moliyaviy hisob-kitob o'zgarmaydi — faqat navigatsiya va ko'rinish (ma'lumot mavjud funksiyalardan olinadi).
// ════════════════════════════════════════════════════════════
const SHELL = { chk: { per: 'today', day: '', tab: 'cheks', q: '' }, jr: { per: 'today', day: '', q: '', items: [], err: '', pending31: false, loading: false } };

// Bosh sahifadagi «Tezkor amallar» — faqat BOSHQA JOYDA YOʻQ boʻlimlar (egasi talabi: takrorlanmasin, son emas — sifat).
// Qolganlari bitta joydan ochiladi:
//   Savdo, Kirim, Mahsulotlar, Statistika — pastki menyu;  Sozlamalar, Rollar, Jurnal — profil;
//   Barcha cheklar — «Barcha sotilgan mahsulotlar»;  Dillerlar — bosh sahifadagi Dillerlar bloki;
//   v24.6 (egasi talabi): Hamkorlar (investorlar, taqsimot) va Xarajatlar — v23 dagidek Tezkor amallarda HAM bor.
//   v25 (egasi talabi 2026-11-10): «Dillerlar» va «Filiallar» — alohida bo'limlar, Tezkor amallarda ham alohida.
const SHELL_MENU = [
  ['qaytarish', 'ret', 'pink', 'Qaytarishlar'], ['kassalar', 'wallet', 'sky', 'Kassalar'], ['mijozlar', 'person', 'blue', 'Mijozlar'],
  ['taminotchilar', 'truck', 'emerald', 'Taʼminotchi'], ['dillerlar', 'truck', 'orange', 'Dillerlar'], ['filiallar', 'branch', 'teal', 'Filiallar'],
  ['ombor', 'ombor', 'purple', 'Ombor'], ['firmakassa', 'building', 'gold', 'Bosh kassa'],
  ['dokon', 'store', 'emerald', 'Doʻkon'], ['sotuvchilar', 'people', 'indigo', 'Xodimlar'],
  ['!fr_req', 'inbox', 'sky', 'Bazadan buyurtma'],
  ['hamkorlar', 'money', 'amber', 'Hamkorlar'], ['xarajatlar', 'expense', 'red', 'Xarajatlar'],
];
// v25: filialda — «Bazadan buyurtma» (Bazaga tovar so'rovi) har doim ko'rinsin
const SHELL_ACT = { '!fr_req': { page: 'ombor', run: "openTransfers().then(()=>{ if (typeof frRequestForm==='function') frRequestForm(); })", only: () => typeof S !== 'undefined' && S.branch && S.branch !== 'baza' } };
function shellMenuItems() {
  return SHELL_MENU.filter(([pg]) => {
    const act = SHELL_ACT[pg];
    if (act) return !!document.getElementById('pg-' + act.page) && (!act.only || act.only());
    if (!document.getElementById('pg-' + pg)) return false;
    const perm = typeof PAGE_VIEW_PERMISSION !== 'undefined' ? PAGE_VIEW_PERMISSION[pg] : null;
    if (perm && typeof hasPerm === 'function' && !hasPerm(perm)) return false;
    const nav = document.querySelector(`.sidebar .nav-item[data-page="${pg}"]`);
    return !(nav && (nav.hidden || nav.style.display === 'none'));
  });
}
function shellMenuHtml() {
  return shellMenuItems().map(([pg, ic, c, l]) => `<button class="ox-act" style="--c:var(--${c})" onclick="${SHELL_ACT[pg] ? SHELL_ACT[pg].run : `go('${pg}')`}"><span class="ox-act-ic">${ICONF[ic] || (typeof ICONS !== 'undefined' && ICONS[pg]) || ''}</span><span class="ox-act-l">${esc(l)}</span></button>`).join('');
}

// ── Navigatsiya holati: bosh sahifa — «uy»; boshqa boʻlim — toʻliq ekran (telefonda) ──
// ── «Qayerdan kirgan bo'lsa — o'sha yerga qaytadi» (egasi talabi): ✕ va telefonning «Orqaga» tugmasi
// bo'limni yopib, oldingi joyga qaytaradi; bo'lim kichik oynadan (ko'rsatkich, Audit, profil, do'konlar,
// bildirishnomalar) ochilgan bo'lsa — o'sha oyna qayta ochiladi. Bosh sahifaga to'g'ridan-to'g'ri o'tilsa — yo'l tozalanadi.
const SHELL_SHEETS = ['dashSheet', 'dashBizSheet', 'shellProfile', 'shellShops', 'ntfSheet', 'revSheet'];
SHELL.nav = { stack: [], cur: null, sheet: null, closed: null, closedAt: 0, seq: 0, fromPop: false };
(function shellWrapSheets() {
  if (typeof window === 'undefined') return;
  SHELL_SHEETS.forEach(n => {
    const f = window[n]; if (typeof f !== 'function' || f._fwNav) return;
    const w = function (...args) { SHELL.nav.sheet = { fn: n, args }; return f.apply(this, args); }; w._fwNav = true; window[n] = w;
  });
  const cs = window.closeSheet;
  if (typeof cs === 'function' && !cs._fwNav) {
    const w = function (...args) { const N = SHELL.nav; if (N.sheet) { N.closed = N.sheet; N.closedAt = Date.now(); } N.sheet = null; return cs.apply(this, args); };
    w._fwNav = true; window.closeSheet = w;
  }
})();
// v24.5 (egasi talabi): «Orqaga» va ✕ — faqat BITTA qadam, kirilgan joyga. Brauzer tarixi o'smaydi
// (bo'lim almashganda manzil almashtiriladi, yangi yozuv qo'shilmaydi) — kecha kirilgan o'nlab bo'limlar
// orqali qaytib chiqish yo'q. Har bir ichkariga kirish — FW_BACK ro'yxatida bitta qadam (oynalar bilan bir
// navbatda): «Orqaga» avval ochiq oynani, keyin bo'limni yopadi. Bosh sahifada yo'l bo'sh — «Orqaga» ilovadan chiqadi.
const SHELL_NAV_MAX = 12;
function _shellNavDrop(e) { if (!e || !e.key || typeof FW_BACK === 'undefined') return; const i = FW_BACK.findIndex(x => x.key === e.key); if (i >= 0) FW_BACK.splice(i, 1); }
function shellNavTrack(page) {
  const N = SHELL.nav, prev = N.cur;
  if (prev === 'kirim' && page !== 'kirim' && typeof FW_BACK !== 'undefined') { const i = FW_BACK.findIndex(e => e.key === 'kirimform'); if (i >= 0) FW_BACK.splice(i, 1); }
  if (prev && prev !== page) {
    const top = N.stack[N.stack.length - 1];
    if (top && top.page === page) {                         // orqaga (✕ yoki telefon «Orqaga»)
      N.stack.pop();
      if (!N.fromPop && typeof fwBackDone === 'function') fwBackDone(top.key);
      if (top.sheet && typeof window[top.sheet.fn] === 'function') { const sh = top.sheet; setTimeout(() => { if (S.page === page) window[sh.fn](...sh.args); }, 80); }
    } else if (page === 'dashboard') {
      const old = N.stack.splice(0);
      if (typeof fwBackDone === 'function') for (let i = old.length - 1; i >= 0; i--) fwBackDone(old[i].key);
    } else {
      const sh = N.sheet || (N.closed && Date.now() - N.closedAt < 120 ? N.closed : null);
      const e = { page: prev, sheet: sh, key: 'nav:' + (++N.seq) };
      N.stack.push(e);
      if (N.stack.length > SHELL_NAV_MAX) _shellNavDrop(N.stack.shift());
      if (typeof fwBackPush === 'function') fwBackPush(e.key, () => { N.fromPop = true; try { go(e.page); } finally { N.fromPop = false; } });
    }
  }
  N.closed = null; N.cur = page;
}
function shellAfterNav() {}
// ✕ — telefonning «Orqaga»si bilan AYNAN bir xil: bitta qadam, kirilgan joyga
function shellBack() {
  // Bo'lim ichida ochiq qism (masalan, kirim formasi) bo'lsa — ✕ avval o'shani yopadi (bitta qadam, «Orqaga» kabi)
  const fb = typeof FW_BACK !== 'undefined' ? FW_BACK[FW_BACK.length - 1] : null;
  if (fb && !String(fb.key).startsWith('nav:')) { const k = fb.key; try { fb.closeFn(); } catch (_) {} if (typeof fwBackDone === 'function') fwBackDone(k); return; }
  const N = SHELL.nav, top = N.stack[N.stack.length - 1];
  go(top ? top.page : 'dashboard');
}
function shellSync(page) {
  shellNavTrack(page);
  const focus = page !== 'dashboard';
  document.body.classList.toggle('fw-focus', focus);
  const sw = document.getElementById('fw-shop-sw');
  if (sw) {
    const nm = sw.querySelector('[data-shop-name]'); if (nm) nm.textContent = shellShopName();
    const mk = sw.querySelector('[data-shop-mark]'); if (mk) mk.innerHTML = typeof fwBrandMark === 'function' ? fwBrandMark() : '';
    if (nm && typeof fwFitText === 'function') requestAnimationFrame(() => fwFitText(nm, 19, 13));
  }
  const av = document.getElementById('fw-ava');
  if (av) { const u = shellUser(); av.querySelector('b').textContent = u.ini; av.title = u.name; }
}
function shellShopName() {
  if (typeof S === 'undefined' || !S) return '';
  return S.branch === 'baza' ? (typeof fwBrand === 'function' ? fwBrand().name : 'Baza') : branchName(S.branch);
}
function shellUser() {
  let name, role;
  if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.kind === 'staff') {
    name = CURRENT_USER.name || 'Xodim'; role = (CURRENT_USER.roles || []).map(r => r.name).join(', ') || 'Xodim';
  } else {
    const st = (typeof S !== 'undefined' && S && S.settings) || {};
    name = st.ownerName || st.company || 'Administrator'; role = st.ownerRole || 'Egasi';
  }
  const ini = String(name).trim().split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'A';
  return { name, role, ini };
}

// ── «Mening doʻkonlarim» — filiallar roʻyxati (logo, nom, bugungi va oylik savdo) ──
function shellBranchSales(key) {
  const sales = key === S.branch ? S.sales : (S._store && S._store[key] && Array.isArray(S._store[key].sales) ? S._store[key].sales : null);
  if (!sales) return null;
  const t = td(), m = t.slice(0, 7), ok = s => s && s.status !== 'voided';
  const d = sales.filter(s => ok(s) && s.date === t), mo = sales.filter(s => ok(s) && String(s.date || '').startsWith(m));
  const sum = a => a.reduce((x, s) => x + (+s.totalUsd || 0), 0);
  return { day: sum(d), dayN: d.length, mon: sum(mo), monN: mo.length };
}
function shellShops() {
  const owner = !CURRENT_USER || CURRENT_USER.kind === 'owner';
  const keys = owner ? Object.keys(BRANCHES).filter(k => (isBranchActive(k) || k === S.branch) && !(S.branch !== 'baza' && k === 'baza')) : [S.branch];
  const card = (k) => {
    const cur = k === S.branch, st = shellBranchSales(k), nm = k === 'baza' ? shellShopName() : branchName(k);
    const cell = (l, v, n) => `<span><small>${l}</small><b>${v == null ? '—' : CUR.fmtUsd(v)}</b><i>Cheklar: ${n == null ? '—' : n}</i></span>`;
    return `<${cur || !owner ? 'div' : 'button'} class="sh-shop ${cur ? 'on' : ''}"${!cur && owner ? ` onclick="closeSheet();promptBranchSwitch('${k}')"` : ''}>
      <span class="sh-shop-h"><span class="sh-shop-mk">${k === 'baza' && typeof fwBrandMark === 'function' ? fwBrandMark() : `<b>${esc((BRANCHES[k] && BRANCHES[k].icon) || nm[0] || 'F')}</b>`}</span>
        <span class="sh-shop-t"><b>${esc(nm)}</b>${k === 'baza' ? '<em>Asosiy</em>' : '<em class="fl">Filial</em>'}</span>
        ${cur ? `<span class="sh-shop-here">${ICONF.check || '✓'} Siz shu yerdasiz</span>` : (owner ? `<span class="sh-shop-go">Oʻtish ${ICONF.chevron || ''}</span>` : '')}</span>
      <span class="sh-shop-g">${cell('Bugun', st && st.day, st && st.dayN)}${cell('Oy boshidan', st && st.mon, st && st.monN)}</span></${cur || !owner ? 'div' : 'button'}>`;
  };
  openSheet({ ic: 'store', c: 'blue', title: 'Mening doʻkonlarim', sub: owner ? 'Baza va filiallar — bitta akkauntda' : 'Sizning filialingiz',
    body: `<p class="bs-info">${ICONF.info || ''}<span>Har bir doʻkonning oʻz ombori, cheklari, kassasi va xodimlari bor. ${owner ? 'Boshqa doʻkonga oʻtish uchun uning paroli soʻraladi.' : 'Hisobingiz shu filialga bogʻlangan.'}</span></p>
      ${keys.map(card).join('')}
      ${owner ? `<div class="sh-shop-act"><button class="dk-ghost" onclick="closeSheet();openBranchSwitch()">${ICONF.edit || ''}<span>Filiallarni boshqarish</span></button>
        ${S.branch === 'baza' && typeof promptAddBranch === 'function' ? `<button class="dk-ghost" onclick="closeSheet();promptAddBranch()">${ICONF.add || ''}<span>Doʻkon qoʻshish</span></button>` : ''}</div>` : ''}` });
}

// ── Profil: jurnal, ayirboshlash, kun yakuni, sozlamalar, chiqish ──
function shellProfile() {
  const u = shellUser();
  const row = (ic, c, t, sub, on) => `<button class="sh-row" onclick="closeSheet();${on}"><span class="sh-row-ic" style="--c:var(--${c})">${ICONF[ic] || ''}</span><span class="sh-row-t"><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</span>${ICONF.chevron || ''}</button>`;
  const can = (k) => typeof hasPerm !== 'function' || hasPerm(k);
  const canSet = can('sozlamalar.view');
  openSheet({ ic: 'person', c: 'sky', title: 'Profil', sub: 'Jurnal, kun yakuni va sozlamalar',
    body: `<div class="sh-me"><span class="sh-me-av">${esc(u.ini)}</span><span><b>${esc(u.name)}</b><small>${esc(u.role)} · ${esc(shellShopName())}</small></span></div>
      <div class="sh-list">
        ${can('savdo.view') ? row('history', 'blue', 'Jurnal', 'Kim nimani oʻzgartirgan · edi → boʻldi', "go('jurnal')") : ''}
        ${can('kassalar.transact') ? row('swap', 'emerald', 'Ayirboshlash', 'Valyuta almashtirish (kassalar orasida)', 'openExchange()') : ''}
        ${typeof khCanClose !== 'function' || khCanClose() ? row('kassaClose', 'amber', 'Kun yakuni — kassa yopish', 'Kunlik hisob va Bosh kassaga topshirish', 'openKunlikHisob()') : ''}
      </div>
      <div class="sh-list">
        ${canSet ? row('settings', 'text-muted', 'Sozlamalar', 'Profil, brend, dizayn mavzusi, Telegram, zaxira', "go('sozlamalar')")
                 : row('settings', 'text-muted', 'Sozlamalar', 'Mavzu, matn oʻlchami, skaner, filial', 'shellMySettings()')}
        ${typeof hasPerm !== 'function' || hasPerm('rollar.manage') ? row('clipboard', 'purple', 'Rollar va ruxsatlar', 'Xodimlar huquqlari', "go('rollar')") : ''}
        ${row('logout', 'red', 'Chiqish', '', 'appLogout()')}
      </div>` });
}

// v24.5: «Sozlamalar» ruxsati yo'q xodim — faqat o'ziga tegishli sozlamalar (shaxsiy + o'z filiali)
function shellMySettings() {
  const u = shellUser();
  ptSettingsOpen({ who: u.name, role: u.role, filial: shellShopName(),
    branch: { get: () => S.branchSettings || {}, canEdit: typeof hasPerm === 'function' && hasPerm('sozlamalar.edit'),
      save: async (v) => { S.branchSettings = { ...(S.branchSettings || {}), ...v, updatedAt: new Date().toISOString() }; save(); } },
    password: (typeof _db !== 'undefined' && _db && _db.auth && CURRENT_USER && CURRENT_USER.kind === 'staff')
      ? async (pw) => { const { error } = await _db.auth.updateUser({ password: pw }); if (error) throw new Error(error.message || 'Parol oʻzgarmadi'); } : null,
    onLogout: appLogout });
}

// ════════════════════════════════════════════════════════════
// BARCHA CHEKLAR — davr (Bugun / Kecha / Oy / sana), qidiruv; cheklar yoki sotilgan mahsulotlar
// ════════════════════════════════════════════════════════════
function shellChkRange() {
  const c = SHELL.chk, t = td();
  if (c.per === 'yday') { const y = daysAgo(1); return [y, y, 'Kecha']; }
  if (c.per === 'month') return [t.slice(0, 7) + '-01', t, 'Bu oy'];
  if (c.per === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(c.day)) return [c.day, c.day, c.day.split('-').reverse().join('.')];
  return [t, t, 'Bugun'];
}
function pgCheklar() {
  const el = document.getElementById('pg-cheklar'); if (!el) return;
  const c = SHELL.chk, [a, b, lbl] = shellChkRange();
  const inR = d => { const x = String(d || '').slice(0, 10); return x >= a && x <= b; };
  const q = c.q.trim().toLowerCase();
  let list = (S.sales || []).filter(s => s && s.status !== 'voided' && inR(s.date));
  if (q) list = list.filter(s => [s.inv, fwCustLabel(s.custName), s.staffName, ...(s.items || []).flatMap(i => [i.name, i.sku])].some(v => String(v || '').toLowerCase().includes(q)));
  list = list.slice().sort((x, y) => String(y.date).localeCompare(String(x.date)) || (Number(y.id) || 0) - (Number(x.id) || 0));
  const lines = fwSaleLines(list), qty = lines.reduce((s, l) => s + l.qty, 0);
  const sum = list.reduce((s, x) => s + (+x.totalUsd || 0), 0), prof = list.reduce((s, x) => s + (+x.profitUsd || 0), 0);
  const disc = list.reduce((s, x) => s + (+x.discUsd || 0), 0), debt = list.reduce((s, x) => s + (+x.debtUsd || 0), 0);
  const ret = (S.batches || []).filter(x => (x.origin || '').startsWith('Qaytarish —') && inR(x.date)).reduce((s, x) => s + (x.qty || 0) * (x.costUsd || 0), 0);
  const prods = {}; lines.forEach(l => { const k = String(l.pid); (prods[k] = prods[k] || { name: l.name, sku: l.sku, qty: 0, v: 0 }); prods[k].qty += l.qty; prods[k].v += l.v; });
  const pl = Object.values(prods).sort((x, y) => y.v - x.v);
  const seg = [['today', 'Bugun'], ['yday', 'Kecha'], ['month', 'Oy']].map(([k, l]) => `<button class="${c.per === k ? 'on' : ''}" onclick="SHELL.chk.per='${k}';pgCheklar()">${l}</button>`).join('');
  const time = s => { const n = Number(s.id); return Number.isFinite(n) && n > 1e15 ? new Date(Math.floor(n / 1000)).toTimeString().slice(0, 5) : ''; };
  el.innerHTML = `
  <div class="sh-search">${ICONF.search || ''}<input id="chk-q" type="search" placeholder="Chek, mijoz yoki mahsulot boʻyicha qidirish" value="${esc(c.q)}" oninput="SHELL.chk.q=this.value;pgCheklar();const i=document.getElementById('chk-q');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}"></div>
  <div class="sh-tabs" role="tablist">
    <button role="tab" class="${c.tab === 'cheks' ? 'on' : ''}" onclick="SHELL.chk.tab='cheks';pgCheklar()">Sotilgan cheklar <b>${list.length}</b></button>
    <button role="tab" class="${c.tab === 'prods' ? 'on' : ''}" onclick="SHELL.chk.tab='prods';pgCheklar()">Sotilgan mahsulotlar <b>${pl.length}</b></button>
  </div>
  <div class="sh-per"><span class="ox-seg">${seg}</span>
    <label class="sh-cal ${c.per === 'day' ? 'on' : ''}" title="Sana tanlash">${ICONF.calendar || '📅'}<input type="date" value="${esc(c.per === 'day' ? c.day : '')}" max="${td()}" onchange="if(this.value){SHELL.chk.per='day';SHELL.chk.day=this.value;pgCheklar()}"></label></div>
  <section class="sh-sum" aria-label="Davr xulosasi">
    <div class="sh-sum-top"><span><small>Summa · ${esc(lbl)}</small><b>${CUR.fmtUsd(sum)}</b></span><span class="sh-sum-r"><b>${list.length} / ${fwNum(qty)} dona</b><small>Chek / mahsulotlar</small></span></div>
    <div class="sh-sum-g">${typeof hasPerm !== 'function' || hasPerm('hisobot.view') ? `<span><b class="gr">${CUR.fmtUsd(prof)}</b><small>Foyda</small></span>` : ''}<span><b class="am">${CUR.fmtUsd(disc)}</b><small>Chegirma</small></span>
      <span><b class="pk">${CUR.fmtUsd(ret)}</b><small>Qaytarishlar</small></span><span><b class="am">${CUR.fmtUsd(debt)}</b><small>Qarzlar</small></span></div>
  </section>
  ${c.tab === 'cheks'
    ? (list.length ? `<div class="sh-chk">${list.map(s => `<button class="sh-chk-r" onclick="dashShowSale('${escJsAttr(String(s.id))}')">
        <span class="sh-chk-ic">${ICONF.receipt || ''}</span>
        <span class="sh-chk-t"><b>${esc(s.inv || '—')}</b><small>${esc(fwCustLabel(s.custName))} · ${(s.items || []).length} xil${s.staffName ? ' · ' + esc(s.staffName) : ''}</small></span>
        <span class="sh-chk-v"><b>${CUR.fmtUsd(+s.totalUsd || 0)}</b><small>${String(s.date || '').split('-').reverse().join('.')}${time(s) ? ' · ' + time(s) : ''}${(+s.debtUsd || 0) > 0.004 ? ` · <em>qarz ${CUR.fmtUsd(+s.debtUsd)}</em>` : ''}</small></span></button>`).join('')}</div>`
      : `<p class="ox-empty">Davr uchun sotuvlar yoʻq</p>`)
    : (pl.length ? `<div class="sh-chk">${pl.map(p => `<div class="sh-chk-r"><span class="sh-chk-ic">${ICONF.inventory || ''}</span>
        <span class="sh-chk-t"><b>${esc(p.name || '—')}</b><small>${esc(p.sku || '')}</small></span>
        <span class="sh-chk-v"><b>${CUR.fmtUsd(p.v)}</b><small>${fwNum(p.qty)} dona</small></span></div>`).join('')}</div>`
      : `<p class="ox-empty">Davr uchun sotuvlar yoʻq</p>`)}`;
}

// ════════════════════════════════════════════════════════════
// AMALLAR JURNALI — kim nimani yaratgan / oʻzgartirgan / oʻchirgan (edi → boʻldi).
// Manba: server audit jurnali (31-migratsiya, oʻzgarmas) + shu qurilmadagi tizim yozuvlari.
// ════════════════════════════════════════════════════════════
function shellJrRange() {
  const j = SHELL.jr, t = td();
  if (j.per === 'yday') { const y = daysAgo(1); return [y, y]; }
  if (j.per === 'week') return [daysAgo(6), t];
  if (j.per === 'month') return [daysAgo(29), t];
  if (j.per === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(j.day)) return [j.day, j.day];
  return [t, t];
}
const SHELL_JR_KIND = { create: ['add', 'emerald', 'Yaratilgan'], edit: ['edit', 'blue', 'Oʻzgartirilgan'], void: ['trash', 'red', 'Oʻchirilgan'] };
function shellJrKind(a) { return a === 'create' ? 'create' : a === 'void' || a === 'revision_reject' ? 'void' : 'edit'; }
function shellJrDiff(b, a) {
  const rows = []; if (!b || !a) return rows;
  const money = v => (v == null || v === '' ? '—' : CUR.fmtUsd(+v));
  [['totalUsd', 'Jami'], ['paidUsd', 'Toʻlangan'], ['debtUsd', 'Qarz'], ['discUsd', 'Chegirma'], ['custName', 'Mijoz']].forEach(([k, l]) => {
    if (b[k] == null || a[k] == null) return;
    const num = typeof b[k] === 'number' || typeof a[k] === 'number';
    if (num ? Math.abs((+b[k] || 0) - (+a[k] || 0)) > 0.004 : String(b[k]) !== String(a[k])) rows.push([l, num ? money(b[k]) : String(b[k]), num ? money(a[k]) : String(a[k])]);
  });
  const bi = new Map((b.items || []).map(i => [String(i.pid), i])), ai = new Map((a.items || []).map(i => [String(i.pid), i]));
  new Set([...bi.keys(), ...ai.keys()]).forEach(pid => {
    const x = bi.get(pid) || { qty: 0 }, y = ai.get(pid) || { qty: 0 }, nm = x.name || y.name || ((S.products || []).find(p => String(p.id) === pid) || {}).name || '#' + pid;
    if ((+x.qty || 0) !== (+y.qty || 0)) rows.push([nm + ' (dona)', String(+x.qty || 0), String(+y.qty || 0)]);
    if (x.sellUsd != null && y.sellUsd != null && Math.abs(+x.sellUsd - +y.sellUsd) > 0.004) rows.push([nm + ' (narx)', money(x.sellUsd), money(y.sellUsd)]);
  });
  if (a.status === 'voided' && b.status !== 'voided') rows.push(['Holat', 'faol', 'oʻchirilgan']);
  return rows;
}
async function shellJrLoad() {
  const j = SHELL.jr;
  if (typeof _cloudEnabled === 'undefined' || !_cloudEnabled || typeof ntfCall !== 'function') { j.items = []; return; }
  const [a] = shellJrRange(), days = Math.min(3650, Math.max(1, Math.ceil((Date.now() - new Date(a + 'T00:00:00').getTime()) / 864e5) + 1));
  j.loading = true;
  try { const d = await ntfCall({ action: 'history', days, limit: 200 }); j.pending31 = !d; j.items = d ? (d.items || []) : []; j.err = ''; }
  catch (e) { j.err = e.message; }
  finally { j.loading = false; }
}
function pgJurnal(reload) {
  const el = document.getElementById('pg-jurnal'); if (!el) return;
  const j = SHELL.jr, [a, b] = shellJrRange();
  const inR = iso => { const x = new Date(iso); if (isNaN(x)) return false; const d = x.toISOString().slice(0, 10); return d >= a && d <= b; };   // td() bilan bir xil kun chegarasi
  // Server yozuvlari + shu qurilmadagi tizim yozuvlari («… ochildi» kabi koʻrish yozuvlari chiqarilmaydi)
  const ev = (j.items || []).filter(x => inR(x.createdAt)).map(x => ({ src: 'srv', x, ts: x.createdAt, kind: shellJrKind(x.action), text: [x.note, x.actor, x.after && x.after.inv, x.before && x.before.inv].join(' ') }));
  const loc = (S.auditLogs || []).filter(x => x && x.ts && inR(x.ts) && !/ ochildi$/.test(String(x.action || ''))).map(x => {
    const t = String(x.action || ''); return { src: 'loc', x, ts: x.ts, kind: /oʻchir|o'chir|ochirildi/i.test(t) ? 'void' : /qoʻsh|qo'sh|yarat|kirim qilindi/i.test(t) ? 'create' : 'edit', text: t };
  });
  let all = ev.concat(loc).sort((p, q) => String(q.ts).localeCompare(String(p.ts)));
  const cnt = { create: 0, edit: 0, void: 0 }; all.forEach(e => { cnt[e.kind]++; });
  const q = j.q.trim().toLowerCase();
  if (q) all = all.filter(e => String(e.text || '').toLowerCase().includes(q) || JSON.stringify(e.x.after || {}).toLowerCase().includes(q));
  const seg = [['today', 'Bugun'], ['yday', 'Kecha'], ['week', 'Hafta'], ['month', 'Oy']].map(([k, l]) => `<button class="${j.per === k ? 'on' : ''}" onclick="SHELL.jr.per='${k}';pgJurnal(true)">${l}</button>`).join('');
  const hm = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toTimeString().slice(0, 5) + (a !== b ? ' · ' + d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' }) : ''); };
  const card = (e) => {
    const [ic, c, lbl] = SHELL_JR_KIND[e.kind];
    if (e.src === 'loc') return `<div class="jr-it" style="--c:var(--${c})"><span class="jr-ic">${ICONF[ic] || ''}</span><span class="jr-b"><b>${esc(e.text)}</b><small>Shu qurilma · ${hm(e.ts)}</small></span></div>`;
    const x = e.x, af = x.after || {}, bf = x.before || {}, inv = af.inv || bf.inv || '';
    const ent = x.entity === 'sale' ? `savdo${inv ? ' «' + esc(inv) + '»' : ''}` : x.entity === 'dealer_stock' ? 'diller ombori' : x.entity === 'dealer_sale' ? 'diller savdosi' : esc(x.entity);
    const title = `${(typeof NTF_ACT !== 'undefined' && NTF_ACT[x.action]) || lbl} ${ent}`;
    const diff = (x.action === 'edit' || x.action === 'void') ? shellJrDiff(bf, af) : [];
    const extra = x.action === 'create' && af.totalUsd != null ? [['Summa', '', CUR.fmtUsd(+af.totalUsd)]] : x.action === 'loss_sale' && af.lossUsd != null ? [['Zarar', '', CUR.fmtUsd(+af.lossUsd)]] : [];
    const rows = diff.concat(extra);
    return `<div class="jr-it" style="--c:var(--${c})"><span class="jr-ic">${ICONF[ic] || ''}</span><span class="jr-b">
      <span class="jr-h"><b>${title}</b><time>${hm(x.createdAt)}</time></span>
      <span class="jr-who">${ICONF.person || ''}${esc(x.actor || '—')}${x.actorRole && typeof NTF_ROLE !== 'undefined' ? ' · ' + esc(NTF_ROLE[x.actorRole] || x.actorRole) : ''}</span>
      ${rows.length ? `<span class="jr-diff">${rows.slice(0, 10).map(([l, o, n]) => `<span><i>${esc(l)}</i>${o ? `<s>${esc(o)}</s> → ` : ''}<em>${esc(n)}</em></span>`).join('')}</span>` : (x.note ? `<small>${esc(x.note)}</small>` : '')}
    </span></div>`;
  };
  el.innerHTML = `
  <p class="sh-lead">Kim nimani oʻzgartirgan · edi → boʻldi</p>
  <div class="sh-per"><span class="ox-seg">${seg}</span>
    <label class="sh-cal ${j.per === 'day' ? 'on' : ''}" title="Sana tanlash">${ICONF.calendar || '📅'}<input type="date" value="${esc(j.per === 'day' ? j.day : '')}" max="${td()}" onchange="if(this.value){SHELL.jr.per='day';SHELL.jr.day=this.value;pgJurnal(true)}"></label></div>
  <div class="jr-cnt"><span class="cr">${ICONF.add || ''}<b>${cnt.create}</b><small>Yaratilgan</small></span><span class="ed">${ICONF.edit || ''}<b>${cnt.edit}</b><small>Oʻzgartirilgan</small></span><span class="dl">${ICONF.trash || ''}<b>${cnt.void}</b><small>Oʻchirilgan</small></span></div>
  <div class="sh-search">${ICONF.search || ''}<input id="jr-q" type="search" placeholder="Mahsulot, chek, qiymat yoki xodim" value="${esc(j.q)}" oninput="SHELL.jr.q=this.value;pgJurnal();const i=document.getElementById('jr-q');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}"></div>
  ${j.pending31 ? `<p class="bs-note">Server jurnali uchun 31-migratsiya qoʻllanishi kerak — hozir faqat shu qurilmadagi yozuvlar.</p>` : ''}
  ${j.err ? `<p class="bs-note" style="color:var(--red)">${esc(j.err)}</p>` : ''}
  ${j.loading ? '<p class="bs-note">Yuklanmoqda…</p>' : ''}
  <div class="jr-list">${all.length ? all.slice(0, 300).map(card).join('') : '<p class="ox-empty">Bu davrda amallar yoʻq</p>'}</div>`;
  if (reload !== false && (reload || !j.loaded)) { j.loaded = true; shellJrLoad().then(() => { if (S.page === 'jurnal') pgJurnal(false); }); }
}

// ════════════════════════════════════════════════════════════
// v24.4 — YOPIQ OY QOIDASI: oy foydasiga ta'sir qiluvchi amallar (admin paneli) — fwClosedMonthCheck / fwReclosePeriod
// (main.js). Amal oldidan tekshiruv, muvaffaqiyatdan keyin oxirgi yopiq oy qayta hisoblanadi.
// ════════════════════════════════════════════════════════════
const SHELL_MONTH_OPS = [
  ['_savdoCommit', () => [td()], 'yangi savdo'],
  ['saveSaleEdit', () => { const x = (S.sales || []).find(v => v.id === S.saleEditId); return x ? [x.date] : null; }, 'savdo tahriri'],
  ['saveEditSale', (sid) => { const x = (S.sales || []).find(v => v.id === sid); return x ? [x.date] : null; }, 'savdo tahriri'],
  ['deleteSale', (sid) => { const x = (S.sales || []).find(v => v.id === sid); return x ? [x.date] : null; }, 'savdoni oʻchirish'],
  ['doSaleReturn', (sid) => { const x = (S.sales || []).find(v => v.id === sid); return x ? [x.date, td()] : null; }, 'qaytarish'],
  ['addExpense', () => { const t = S.xarajatTab || 'dokon'; return (t === 'dokon' || t === 'tasischi') ? [td()] : null; }, 'xarajat'],
  ['deleteExpenseRow', (id) => { const e = (S.expenses || []).find(v => v.id === id); return e && (e.turi || 'dokon') !== 'hamkor' ? [e.date] : null; }, 'xarajatni oʻchirish'],
  ['woCommit', () => [td()], 'hisobdan chiqarish'],
  ['sadvPay', () => [td()], 'zaklad xizmati (xarajat)'],
  ['woCancel', (id) => { const w = (typeof woList === 'function' ? woList() : []).find(v => String(v.id) === String(id)); return w ? [w.date] : null; }, 'hisobdan chiqarishni bekor qilish'],
];
(function shellWrapMonthOps() {
  if (typeof window === 'undefined' || typeof fwClosedMonthCheck !== 'function') return;
  SHELL_MONTH_OPS.forEach(([n, datesFn, what]) => {
    const f = window[n]; if (typeof f !== 'function' || f._fwMonth) return;
    const w = async function (...args) {
      let dates = null; try { dates = datesFn(...args); } catch (_) { dates = null; }
      if (!dates) return f.apply(this, args);
      const g = await fwClosedMonthCheck(dates, what); if (!g.ok) return;
      const r = await f.apply(this, args);
      if (g.period) fwReclosePeriod(g, what);
      return r;
    };
    w._fwMonth = true; window[n] = w;
  });
})();
