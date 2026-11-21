// ════════════════════════════════════════════════════════════
// DILLER PUL YUBORDI — BILDIRISHNOMALAR (v23.8, 30-migratsiya, server: dealer-pay)
// Diller portaldan pul yuboradi (naqd so'm / karta / naqd $, shu kungi kurs) — qarzi DARHOL kamayadi.
// Bu yerda kassir / Bosh kassa xodimi:
//   «Qabul qildim» — pul tanlangan filial kassasiga tushadi (kassa yopishda Bosh kassaga o'tadi);
//   «Rad etish»    — pul kelmagan: diller qarzi qaytadi (sabab majburiy).
// Bildirishnoma: Bosh sahifa (Dillerlar bloki), Bosh kassa, Kassalar va Dillerlar sahifalarida banner;
// yangi to'lov kelganda — xabar (har 60 soniyada tekshiriladi, faqat bulut rejimida).
// ════════════════════════════════════════════════════════════
const DPN = { list: [], loaded: false, loading: false, err: '', pending30: false, seen: null, timer: null, busy: {} };
const DPN_TYPES = { cash_uzs: ['Naqd soʻm', 'payments'], card: ['Karta', 'card'], cash_usd: ['Naqd $', 'money'] };

function dpnCanView() { return typeof hasPerm !== 'function' || ['dillerlar.view', 'dillerlar.manage', 'kassalar.view', 'kassalar.transact', 'firma_kassa.view', 'firma_kassa.transact'].some(k => hasPerm(k)); }
function dpnCanDecide() { return typeof hasPerm !== 'function' || hasPerm('kassalar.transact') || hasPerm('firma_kassa.transact'); }
function dpnPending() { return DPN.list.filter(n => n.status === 'pending'); }
function dpnAmt(n) { return n.currency === 'USD' ? CUR.fmtUsd(n.amount) : CUR.fmtUzs(n.amount); }

async function dpnLoad(quiet) {
  if (!_cloudEnabled || DPN.loading || !dpnCanView()) return;
  DPN.loading = true;
  try {
    const res = await authFetch('/.netlify/functions/dealer-pay', { method: 'POST', body: JSON.stringify({ action: 'list', status: 'all', filial: S.branch }) });
    const d = await res.json().catch(() => ({}));
    if (res.status === 409 && d.migration30Pending) { DPN.pending30 = true; DPN.list = []; DPN.err = ''; return; }
    if (!res.ok) throw new Error(d.error || 'Yuklanmadi');
    DPN.list = Array.isArray(d.notices) ? d.notices : []; DPN.loaded = true; DPN.err = ''; DPN.pending30 = false;
    // Yangi kelgan to'lovlar — xabar (birinchi yuklashda emas)
    const ids = new Set(dpnPending().map(n => n.id));
    if (DPN.seen && !quiet) {
      const fresh = dpnPending().filter(n => !DPN.seen.has(n.id));
      if (fresh.length) toast(`💸 ${fresh.length === 1 ? (fresh[0].dealerName || 'Diller') + ' pul yubordi: ' + dpnAmt(fresh[0]) : fresh.length + ' ta diller toʻlovi keldi'} — kassir tasdigʻi kerak`);
    }
    DPN.seen = ids;
  } catch (e) { DPN.err = e.message; }
  finally { DPN.loading = false; dpnRefreshViews(); }
}
function dpnStart() {
  if (DPN.timer || !_cloudEnabled) return;
  dpnLoad(true);
  DPN.timer = setInterval(() => { if (!document.hidden) dpnLoad(false); }, 60000);
}
function dpnRefreshViews() {
  if (typeof S === 'undefined') return;
  if (S.page === 'dashboard' && typeof pgDashboard === 'function') pgDashboard();
  document.querySelectorAll('[data-dpn-banner]').forEach(el => { el.outerHTML = dpnBannerHtml(); });
  if (document.getElementById('bs-ov')?.classList.contains('open') && document.querySelector('#bs-ov [data-dpn-sheet]')) dpnSheet();
}

// Sahifalar uchun banner (Bosh kassa, Kassalar, Dillerlar)
function dpnBannerHtml() {
  const p = dpnPending();
  if (!p.length) return '<span data-dpn-banner hidden></span>';
  const usd = p.reduce((a, n) => a + (+n.amountUsd || 0), 0);
  return `<button class="dpn-banner" data-dpn-banner onclick="dpnSheet()">${ICONF.warning}<span><b>Dillerlar pul yubordi — ${p.length} ta, ${CUR.fmtUsd(usd)}</b><small>Diller qarzi kamaytirilgan; pul kelgan boʻlsa «Qabul qildim», kelmagan boʻlsa «Rad etish»</small></span>${ICONF.chevron}</button>`;
}

// Kassani tanlash: valyutasi mos; USD — Diller kassasi birinchi, so'm naqd — naqd kassa, karta — karta kassasi
function dpnBoxesFor(n) {
  const boxes = (S.cashboxes || []).filter(k => k.cur === n.currency && k.type !== 'qobiljon');
  const pref = n.payType === 'cash_usd' ? ['dealer', 'usd'] : n.payType === 'card' ? ['card', 'cash'] : ['cash', 'card'];
  return boxes.sort((a, b) => { const ia = pref.indexOf(a.type), ib = pref.indexOf(b.type); return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib); });
}

function dpnSheet(tab) {
  DPN.tab = tab || DPN.tab || 'pending';
  const list = DPN.tab === 'pending' ? dpnPending() : DPN.list.filter(n => n.status !== 'pending');
  const can = dpnCanDecide();
  const st = { pending: ['Kutilmoqda', 'amber'], accepted: ['Qabul qilindi', 'emerald'], rejected: ['Rad etildi', 'red'] };
  const card = (n) => {
    const [tl, ic] = DPN_TYPES[n.payType] || ['—', 'money'];
    const boxes = n.status === 'pending' ? dpnBoxesFor(n) : [];
    return `<div class="dpn-card ${n.status}">
      <div class="dpn-h"><span class="dpn-ic">${ICONF[ic] || ''}</span><span class="dpn-t"><b>${esc(n.dealerName || ('Diller #' + n.dealerId))}</b>
        <small>${tl} · ${new Date(n.createdAt).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small></span>
        <span class="dpn-v"><b>${dpnAmt(n)}</b>${n.currency === 'UZS' ? `<small>= ${CUR.fmtUsd(n.amountUsd)} · kurs ${fwNum(n.rate)}</small>` : ''}</span></div>
      ${n.note ? `<div class="dpn-note">${esc(n.note)}</div>` : ''}
      <div class="dpn-st"><span class="dpn-pill" style="--c:var(--${st[n.status][1]})">${st[n.status][0]}</span>
        ${n.status === 'accepted' ? `<span>${esc(n.boxName || '')}${n.decidedBy ? ' · ' + esc(n.decidedBy) : ''}</span>` : ''}
        ${n.status === 'rejected' ? `<span>${esc(n.rejectReason || '')}${n.decidedBy ? ' · ' + esc(n.decidedBy) : ''}</span>` : ''}</div>
      ${n.status === 'pending' && can ? `<div class="dpn-act">
        ${boxes.length ? `<select class="form-control" id="dpn-box-${n.id}" aria-label="Kassa">${boxes.map(k => `<option value="${k.id}">${esc(k.icon || '')} ${esc(k.name)} — ${k.cur === 'USD' ? CUR.fmtUsd(k.bal || 0) : CUR.fmtUzs(k.bal || 0)}</option>`).join('')}</select>`
          : `<div class="dpn-warn">${esc(n.currency)} valyutadagi kassa yoʻq</div>`}
        <div class="dpn-btns"><button class="btn btn-primary btn-sm" onclick="dpnAccept(${n.id})" ${boxes.length && !DPN.busy[n.id] ? '' : 'disabled'}>${ICONF.check || ''} Qabul qildim</button>
          <button class="btn btn-ghost btn-sm dpn-rej" onclick="dpnRejectAsk(${n.id})" ${DPN.busy[n.id] ? 'disabled' : ''}>Rad etish</button></div>
        <div class="dpn-rj" id="dpn-rj-${n.id}" hidden><input class="form-control" id="dpn-rs-${n.id}" maxlength="300" placeholder="Sabab: masalan, pul kelmadi">
          <button class="btn btn-danger btn-sm" onclick="dpnReject(${n.id})">Rad etish — qarz qaytadi</button></div>
      </div>` : ''}
    </div>`;
  };
  openSheet({ ic: 'truck', c: 'amber', title: 'Dillerlar yuborgan pul', sub: `${esc(typeof branchName === 'function' ? branchName(S.branch) : S.branch)} · qarz yuborilgan zahoti kamaygan`,
    body: `<div data-dpn-sheet></div>
      <div class="ox-seg dpn-seg"><button class="${DPN.tab === 'pending' ? 'on' : ''}" onclick="dpnSheet('pending')">Kutilmoqda (${dpnPending().length})</button><button class="${DPN.tab !== 'pending' ? 'on' : ''}" onclick="dpnSheet('done')">Tarix</button></div>
      ${DPN.pending30 ? `<p class="bs-note">Diller toʻlovlari uchun 30-migratsiya qoʻllanishi kerak.</p>` : DPN.err ? `<p class="bs-note" style="color:var(--red)">${esc(DPN.err)}</p>` : ''}
      ${list.length ? list.map(card).join('') : `<p class="ox-empty">${DPN.tab === 'pending' ? 'Kutilayotgan toʻlov yoʻq' : 'Hali tarix yoʻq'}</p>`}
      ${can ? '' : '<p class="bs-note">Qabul qilish yoki rad etish — kassa huquqi bor xodim uchun.</p>'}`,
    foot: `<div class="dk-foot"><button class="dk-ghost" onclick="dpnLoad(true)">${ICONF.swap || ''}<span>Yangilash</span></button></div>` });
}
function dpnRejectAsk(id) { const el = document.getElementById('dpn-rj-' + id); if (el) { el.hidden = !el.hidden; document.getElementById('dpn-rs-' + id)?.focus(); } }

async function dpnCall(payload) {
  const res = await authFetch('/.netlify/functions/dealer-pay', { method: 'POST', body: JSON.stringify(payload) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.ok === false) throw new Error(String(d.error || 'Amal bajarilmadi').replace(/^(DEALER_PAY|CASHBOX):\s*/, ''));
  return d;
}
async function dpnAccept(id) {
  if (!dpnCanDecide()) { toast("⛔ Bu amal uchun ruxsatingiz yo'q", 'error'); return; }
  const n = DPN.list.find(x => x.id === id); if (!n || DPN.busy[id]) return;
  const boxId = parseInt(document.getElementById('dpn-box-' + id)?.value || '', 10);
  const box = (S.cashboxes || []).find(k => k.id === boxId);
  if (!box) { toast('⛔ Kassa tanlang', 'error'); return; }
  DPN.busy[id] = true;
  try {
    const d = await dpnCall({ action: 'accept', id, boxId, filial: S.branch });
    if (d.balances && Object.keys(d.balances).length) { fwApplyCashBalances(d.balances); fwCashSeq++; }
    if (!d.replay) logCashTxn({ boxId, type: 'in', amount: n.amount, desc: `Diller toʻlovi (portal) — ${n.dealerName || ''}` });
    Object.assign(n, d.notice || { status: 'accepted' });
    if (typeof auditLog === 'function') auditLog(`Diller toʻlovi qabul qilindi: ${n.dealerName || n.dealerId} — ${dpnAmt(n)} → ${box.name}`);
    if (typeof save === 'function') save();
    toast(`✅ ${dpnAmt(n)} — ${box.name} kassasiga qabul qilindi`);
  } catch (e) { toast('⛔ ' + e.message, 'error'); }
  finally { delete DPN.busy[id]; dpnRefreshViews(); if (S.page === 'kassalar' && typeof pgKassalar === 'function') pgKassalar(); }
}
async function dpnReject(id) {
  if (!dpnCanDecide()) { toast("⛔ Bu amal uchun ruxsatingiz yo'q", 'error'); return; }
  const n = DPN.list.find(x => x.id === id); if (!n || DPN.busy[id]) return;
  const reason = (document.getElementById('dpn-rs-' + id)?.value || '').trim();
  if (reason.length < 3) { toast('Rad etish sababini yozing', 'error'); return; }
  DPN.busy[id] = true;
  try {
    const d = await dpnCall({ action: 'reject', id, reason, filial: S.branch });
    Object.assign(n, d.notice || { status: 'rejected' });
    const dl = (S.dealers || []).find(x => x.id === n.dealerId);
    if (dl && d.dealerDebtUsd != null) { dl.debt = d.dealerDebtUsd; dl.totalPaid = d.dealerTotalPaidUsd; }
    if (typeof auditLog === 'function') auditLog(`Diller toʻlovi rad etildi: ${n.dealerName || n.dealerId} — ${dpnAmt(n)} (${reason})`);
    if (typeof save === 'function') save();
    toast(`↩ Rad etildi — ${n.dealerName || 'diller'} qarzi qaytdi`);
  } catch (e) { toast('⛔ ' + e.message, 'error'); }
  finally { delete DPN.busy[id]; dpnRefreshViews(); }
}
