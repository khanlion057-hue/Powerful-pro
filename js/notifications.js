// ════════════════════════════════════════════════════════════
// 🔔 BILDIRISHNOMALAR VA SAVDO TARIXI (v24, 31-migratsiya, server: notifications)
//  • Bildirishnomalar — oxirgi 7 kun; eskilari «Arxiv»da (o'chirilmaydi).
//  • «Savdo tarixi» — savdo yaratildi / tahrirlandi (oldingi → yangi qiymat) / o'chirildi (iz qoladi),
//    zararli savdo tasdig'i, diller chegirmasi va reviziyasi: kim, roli, qachon.
//  • Moliyaviy yozuvlar bu yerda o'zgartirilmaydi — faqat ko'rinish va «o'qildi» belgisi.
// ════════════════════════════════════════════════════════════
Object.assign(ICONF, {
  bell: _svgf("M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"),
});

const NTF = { items: [], archive: [], history: [], unread: 0, tab: 'active', err: '', pending31: false, loading: false, timer: null, seen: null };
const NTF_KIND = {
  sale_edit: ['Savdo tahrirlandi', 'edit', 'amber'], sale_void: ['Savdo oʻchirildi', 'trash', 'red'], loss_sale: ['Zarar bilan savdo', 'warning', 'red'],
  dealer_discount: ['Diller chegirmasi', 'tag', 'purple'], dealer_revision: ['Diller reviziyasi', 'listNum', 'sky'],
  dealer_pay: ['Diller toʻlovi', 'money', 'emerald'], announce_error: ['Eʼlon xatosi', 'send', 'red'], system: ['Tizim', 'info', 'sky'],
  dealer_revision_result: ['Reviziya qarori', 'listNum', 'sky'],
};
const NTF_ACT = { create: 'Yaratildi', edit: 'Tahrirlandi', void: 'Oʻchirildi', loss_sale: 'Zarar tasdiqlandi', price_discount: 'Chegirma', revision: 'Reviziya', announce: 'Eʼlon', revision_apply: 'Reviziya tasdiqlandi', revision_reject: 'Reviziya rad etildi' };
const NTF_ROLE = { admin: 'Administrator', seller: 'Sotuvchi', dealer: 'Diller', system: 'Tizim' };

async function ntfCall(payload) {
  const res = await authFetch('/.netlify/functions/notifications', { method: 'POST', body: JSON.stringify(payload) });
  const d = await res.json().catch(() => ({}));
  if (res.status === 409 && d.migration31Pending) { NTF.pending31 = true; return null; }
  if (!res.ok) throw new Error(d.error || 'Yuklanmadi');
  NTF.pending31 = false;
  return d;
}
async function ntfLoad(quiet) {
  if (!_cloudEnabled || NTF.loading) return;
  NTF.loading = true;
  try {
    const d = await ntfCall({ action: 'list', scope: 'active' });
    if (d) {
      NTF.items = d.items || []; NTF.unread = +d.unread || 0; NTF.err = '';
      const ids = new Set(NTF.items.filter(n => !n.read).map(n => n.id));
      if (NTF.seen && !quiet) {
        const fresh = NTF.items.filter(n => !n.read && !NTF.seen.has(n.id));
        if (fresh.length) toast(`🔔 ${fresh.length === 1 ? fresh[0].title : fresh.length + ' ta yangi bildirishnoma'}`);
      }
      NTF.seen = ids;
    }
  } catch (e) { NTF.err = e.message; }
  finally { NTF.loading = false; ntfBadge(); }
}
function ntfStart() {
  if (NTF.timer || !_cloudEnabled) { ntfBadge(); return; }
  ntfLoad(true);
  NTF.timer = setInterval(() => { if (!document.hidden) ntfLoad(false); }, 60000);
}
function ntfBadge() {
  const n = NTF.unread;
  document.querySelectorAll('[data-ntf-n]').forEach(el => { el.textContent = n > 99 ? '99+' : String(n); el.hidden = !n; });
}
function ntfWhen(iso) {
  const d = new Date(iso); if (isNaN(d)) return '';
  return d.toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Oldingi → yangi qiymat (savdo tahriri): jami, to'langan, qarz, chegirma va qatorlar (miqdor, narx)
function ntfDiffHtml(b, a) {
  if (!b || !a) return '';
  const rows = [];
  const money = v => (v == null || v === '' ? '—' : CUR.fmtUsd(+v));
  [['totalUsd', 'Jami'], ['paidUsd', 'Toʻlangan'], ['debtUsd', 'Qarz'], ['discUsd', 'Chegirma']].forEach(([k, l]) => {
    if (b[k] != null && a[k] != null && Math.abs((+b[k] || 0) - (+a[k] || 0)) > 0.004) rows.push(`<li>${l}: <s>${money(b[k])}</s> → <b>${money(a[k])}</b></li>`);
  });
  const bi = new Map((b.items || []).map(i => [String(i.pid), i])), ai = new Map((a.items || []).map(i => [String(i.pid), i]));
  new Set([...bi.keys(), ...ai.keys()]).forEach(pid => {
    const x = bi.get(pid) || { qty: 0 }, y = ai.get(pid) || { qty: 0 };
    const p = (S.products || []).find(q => String(q.id) === pid);
    const nm = esc(p ? p.name : ('#' + pid));
    if ((+x.qty || 0) !== (+y.qty || 0)) rows.push(`<li>${nm}: <s>${+x.qty || 0}</s> → <b>${+y.qty || 0}</b> dona</li>`);
    if (x.sellUsd != null && y.sellUsd != null && Math.abs(+x.sellUsd - +y.sellUsd) > 0.004) rows.push(`<li>${nm} narxi: <s>${money(x.sellUsd)}</s> → <b>${money(y.sellUsd)}</b></li>`);
  });
  if (a.status === 'voided' && b.status !== 'voided') rows.push(`<li>Holat: <s>faol</s> → <b>oʻchirilgan (teskari yozuv)</b></li>`);
  return rows.length ? `<ul class="ntf-diff">${rows.join('')}</ul>` : '';
}

function ntfItemHtml(n) {
  const [lbl, ic, c] = NTF_KIND[n.kind] || NTF_KIND.system;
  // v24.2: tasdiq kutayotgan reviziya — bosilsa «Reviziyalar» oynasi ochiladi
  const go = n.kind === 'dealer_revision' && n.refType === 'dealer_revision' && revCan() ? ` role="button" tabindex="0" onclick="revSheet()" style="cursor:pointer"` : '';
  return `<div class="ntf-it ${n.read ? '' : 'new'}"${go}><span class="ntf-ic" style="--c:var(--${c})">${ICONF[ic] || ''}</span>
    <div class="ntf-b"><b>${esc(n.title)}</b>${n.body ? `<p>${esc(n.body)}</p>` : ''}
      <small>${esc(lbl)} · ${ntfWhen(n.createdAt)}${n.actor ? ' · ' + esc(n.actor) + (n.actorRole ? ' (' + esc(NTF_ROLE[n.actorRole] || n.actorRole) + ')' : '') : ''}</small></div></div>`;
}
function ntfHistHtml(a) {
  const after = a.after || {}, before = a.before || {};
  const inv = after.inv || before.inv || '';
  const ent = a.entity === 'sale' ? `Savdo ${esc(inv)}` : a.entity === 'dealer_sale' ? 'Diller savdosi' : a.entity === 'dealer_stock' ? `Diller ombori — ${esc(after.dealerName || '')}` : a.entity === 'product' ? 'Mahsulot' : esc(a.entity);
  let extra = '';
  if (a.action === 'edit' || a.action === 'void') extra = ntfDiffHtml(before, after);
  if (a.action === 'create' && after.totalUsd != null) extra = `<p class="ntf-m">${CUR.fmtUsd(+after.totalUsd)} · ${(after.items || []).length} xil${+after.debtUsd > 0.004 ? ' · qarz ' + CUR.fmtUsd(+after.debtUsd) : ''}${+after.discUsd > 0.004 ? ' · chegirma ' + CUR.fmtUsd(+after.discUsd) : ''}</p>`;
  if (a.action === 'loss_sale' && after.lossUsd != null) extra = `<p class="ntf-m" style="color:var(--red)">Savdo ${CUR.fmtUsd(+after.totalUsd)} · tannarx ${CUR.fmtUsd(+after.costUsd)} · zarar ${CUR.fmtUsd(+after.lossUsd)}</p>`;
  if (a.action === 'revision' && Array.isArray(after.lines)) extra = `<ul class="ntf-diff">${after.lines.filter(l => l.diff).slice(0, 12).map(l => `<li>${esc(l.name || '#' + l.pid)}: tizim ${l.system} · sanaldi ${l.counted} → <b style="color:var(--${l.diff < 0 ? 'red' : 'amber'})">${l.diff > 0 ? '+' : ''}${l.diff}</b></li>`).join('') || '<li>Farq yoʻq</li>'}</ul>${after.reason ? `<p class="ntf-m">Sabab: ${esc(after.reason)}</p>` : ''}`;
  if (a.action === 'revision_apply' && Array.isArray(after.effects)) extra = revEffectsHtml(after);
  if (a.action === 'price_discount' && after.optimUsd != null) extra = `<p class="ntf-m">${esc(after.name || '')}: ${after.qty} × ${CUR.fmtUsd(+after.sellUsd)} (optom ${CUR.fmtUsd(+after.optimUsd)}, −${after.discountPct}%)</p>`;
  return `<div class="ntf-it hist ${a.action}"><div class="ntf-b"><b>${ent} — ${esc(NTF_ACT[a.action] || a.action)}</b>${extra}
    <small>${ntfWhen(a.createdAt)} · ${esc(a.actor || '—')} (${esc(NTF_ROLE[a.actorRole] || a.actorRole)})${a.filial ? ' · ' + esc(typeof branchName === 'function' ? branchName(a.filial) : a.filial) : ''}</small></div></div>`;
}

async function ntfSheet(tab) {
  NTF.tab = tab || NTF.tab || 'active';
  const render = () => {
    const seg = [['active', `Yangi (${NTF.unread})`], ['archive', 'Arxiv (7 kundan eski)'], ['history', 'Savdo tarixi']]
      .map(([k, l]) => `<button class="${NTF.tab === k ? 'on' : ''}" onclick="ntfSheet('${k}')">${l}</button>`).join('');
    const list = NTF.tab === 'active' ? NTF.items : NTF.tab === 'archive' ? NTF.archive : NTF.history;
    const body = NTF.pending31 ? `<p class="bs-note">Bildirishnomalar va savdo tarixi uchun 31-migratsiya qoʻllanishi kerak (administrator).</p>`
      : NTF.err ? `<p class="bs-note" style="color:var(--red)">${esc(NTF.err)}</p>`
      : !list.length ? `<p class="ox-empty">${NTF.tab === 'history' ? 'Hali savdo hodisalari yoʻq' : NTF.tab === 'archive' ? 'Arxiv boʻsh' : 'Yangi bildirishnoma yoʻq'}</p>`
      : (NTF.tab === 'history' ? list.map(ntfHistHtml) : list.map(ntfItemHtml)).join('');
    openSheet({ ic: 'bell', c: 'amber', title: 'Bildirishnomalar', sub: 'Oxirgi 7 kun · arxiv va savdo tarixi oʻchirilmaydi',
      body: `<div data-ntf-sheet></div><div class="ox-seg ntf-seg">${seg}</div>${NTF.loading ? '<p class="bs-note">Yuklanmoqda…</p>' : ''}${body}`,
      foot: `<div class="dk-foot"><button class="dk-ghost" onclick="ntfSheet()">${ICONF.refresh || ICONF.swap || ''}<span>Yangilash</span></button>
        ${NTF.tab === 'active' && NTF.unread ? `<button class="dk-ghost" onclick="ntfMarkAll()">${ICONF.check || ''}<span>Hammasini oʻqildi</span></button>` : ''}</div>` });
  };
  render();
  if (!_cloudEnabled) return;
  try {
    NTF.loading = true;
    if (NTF.tab === 'active') { const d = await ntfCall({ action: 'list', scope: 'active' }); if (d) { NTF.items = d.items || []; NTF.unread = +d.unread || 0; } }
    else if (NTF.tab === 'archive') { const d = await ntfCall({ action: 'list', scope: 'archive' }); if (d) NTF.archive = d.items || []; }
    else { const d = await ntfCall({ action: 'history', days: 90, limit: 150 }); if (d) NTF.history = d.items || []; }
    NTF.err = '';
  } catch (e) { NTF.err = e.message; }
  finally { NTF.loading = false; ntfBadge(); }
  if (document.querySelector('#bs-ov [data-ntf-sheet]')) render();
}
async function ntfMarkAll() {
  const ids = NTF.items.filter(n => !n.read).map(n => n.id).slice(0, 200);
  if (!ids.length) return;
  try {
    await ntfCall({ action: 'read', ids });
    NTF.items.forEach(n => { n.read = true; }); NTF.unread = 0; ntfBadge(); ntfSheet('active');
  } catch (e) { toast('⛔ ' + e.message, 'error'); }
}


// ════════════════════════════════════════════════════════════
// v24.2 (32-migratsiya): DILLER REVIZIYALARI — ADMIN TASDIG'I
//  Diller sanaydi → «kutilmoqda». Tasdiqlansa (bitta server tranzaksiyasi): kamomad — SOTUV (qarz optom narxda oshadi),
//  ortiqcha — QAYTISH (avval sotilgan miqdorgacha; qarz kamayadi, qarzdan oshsa — dillerning haqi); hech qachon
//  sotilmagan ortig'i — faqat qoldiqqa. Rad etilsa — hech narsa o'zgarmaydi (sabab majburiy). Takror bosish — bir marta.
// ════════════════════════════════════════════════════════════
const REV = { items: [], err: '', pending32: false, loading: false, busy: false };
function revCan() { return typeof hasPerm === 'function' && (hasPerm('rollar.manage') || hasPerm('dillerlar.manage')); }
function revEffectsHtml(res) {
  const eff = (res && res.effects) || [];
  const li = eff.map(e => e.kind === 'sale'
    ? `<li>${esc(e.name || '#' + e.pid)}: kamomad ${e.qty} → <b>sotuv</b> ${CUR.fmtUsd(+e.amountUsd)} (${CUR.fmtUsd(+e.priceUsd)} dan)</li>`
    : `<li>${esc(e.name || '#' + e.pid)}: ortiqcha → ${e.qty ? `<b>qaytish</b> ${e.qty} dona, ${CUR.fmtUsd(Math.abs(+e.amountUsd))}` : ''}${e.unknownQty ? `${e.qty ? ' · ' : ''}${e.unknownQty} dona — faqat qoldiqqa (avval sotilmagan)` : ''}</li>`).join('');
  const d = +res.debtDeltaUsd || 0;
  return `<ul class="ntf-diff">${li || '<li>Farq yoʻq</li>'}</ul><p class="ntf-m">Diller qarzi: <b style="color:var(--${d > 0 ? 'amber' : 'emerald'})">${d >= 0 ? '+' : '−'}${CUR.fmtUsd(Math.abs(d))}</b></p>`;
}
function revCardHtml(r) {
  const lines = (r.lines || []).filter(l => +l.diff);
  const preview = lines.map(l => {
    const p = (S.products || []).find(q => String(q.id) === String(l.pid));
    // summa — server katalogdagi optom narx bo'yicha hisoblaydi (tasdiqdan keyin natijada ko'rinadi)
    return `<li>${esc(l.name || (p && p.name) || '#' + l.pid)}: tizimda ${l.system}, sanaldi ${l.counted} →
      <b style="color:var(--${l.diff < 0 ? 'red' : 'amber'})">${l.diff > 0 ? '+' : ''}${l.diff}</b> (${l.diff < 0 ? 'sotuv' : 'qaytish'})</li>`;
  }).join('');
  const dec = r.status !== 'pending'
    ? `<p class="ntf-m">${r.status === 'approved' ? '✅ Tasdiqlangan' : '⛔ Rad etilgan'}${r.decidedBy ? ' · ' + esc(r.decidedBy) : ''}${r.decidedAt ? ' · ' + ntfWhen(r.decidedAt) : ''}${r.note ? ' · ' + esc(r.note) : ''}</p>${r.status === 'approved' && r.result ? revEffectsHtml(r.result) : ''}`
    : `<div class="rev-act"><input class="form-control" id="rev-note-${r.id}" maxlength="500" placeholder="Izoh (rad etishda majburiy)">
        <div class="rev-btns"><button class="bs-btn rev-ok" onclick="revDecide(${r.id}, true, this)">${ICONF.check || ''}<span>Tasdiqlash</span></button>
        <button class="dk-ghost rev-no" onclick="revDecide(${r.id}, false, this)">Rad etish</button></div>
        <small class="rev-hint">Tasdiqlansa: kamomad — sotuv (qarz optom narxda), ortiqcha — qaytish. Qoldiq oʻzgargan boʻlsa server rad etadi.</small></div>`;
  return `<div class="ntf-it rev-card" data-rev="${r.id}"><div class="ntf-b"><b>${esc(r.dealerName || 'Diller')} — kamomad ${r.shortageQty}, ortiqcha ${r.surplusQty}</b>
    <small>${ntfWhen(r.createdAt)}${r.filial ? ' · ' + esc(typeof branchName === 'function' ? branchName(r.filial) : r.filial) : ''}${r.reason ? ' · Sabab: ' + esc(r.reason) : ''}</small>
    <ul class="ntf-diff">${preview || '<li>Farq yoʻq</li>'}</ul>${dec}</div></div>`;
}
async function revSheet(status) {
  REV.status = status || REV.status || 'pending';
  const render = () => {
    const seg = [['pending', 'Kutilmoqda'], ['all', 'Hammasi']].map(([k, l]) => `<button class="${REV.status === k ? 'on' : ''}" onclick="revSheet('${k}')">${l}</button>`).join('');
    const body = REV.pending32 ? `<p class="bs-note">Reviziyani tasdiqlash uchun 32-migratsiya qoʻllanishi kerak (administrator). Hozircha reviziyalar faqat qayd etiladi.</p>`
      : REV.err ? `<p class="bs-note" style="color:var(--red)">${esc(REV.err)}</p>`
      : !REV.items.length ? `<p class="ox-empty">${REV.status === 'pending' ? 'Tasdiq kutayotgan reviziya yoʻq' : 'Reviziyalar yoʻq'}</p>`
      : REV.items.map(revCardHtml).join('');
    openSheet({ ic: 'listNum', c: 'sky', title: 'Diller reviziyalari', sub: 'Kamomad — sotuv, ortiqcha — qaytish (tasdiqlangandan keyin)',
      body: `<div data-rev-sheet></div><div class="ox-seg ntf-seg">${seg}</div>${REV.loading ? '<p class="bs-note">Yuklanmoqda…</p>' : ''}${body}` });
  };
  render();
  if (!_cloudEnabled) return;
  REV.loading = true;
  try {
    const res = await authFetch('/.netlify/functions/notifications', { method: 'POST', body: JSON.stringify({ action: 'rev_list', status: REV.status }) });
    const d = await res.json().catch(() => ({}));
    if (res.status === 409 && d.migration32Pending) { REV.pending32 = true; REV.items = []; }
    else if (!res.ok) throw new Error(d.error || 'Yuklanmadi');
    else { REV.pending32 = false; REV.items = d.items || []; }
    REV.err = '';
  } catch (e) { REV.err = e.message; }
  finally { REV.loading = false; }
  if (document.querySelector('#bs-ov [data-rev-sheet]')) render();
}
async function revDecide(id, approve, btn) {
  if (REV.busy) return;
  const note = (document.getElementById('rev-note-' + id)?.value || '').trim();
  if (!approve && !note) { toast('Rad etish sababini yozing', 'error'); document.getElementById('rev-note-' + id)?.focus(); return; }
  const r = REV.items.find(x => x.id === id);
  if (approve && !confirm(`${r ? r.dealerName + ': ' : ''}kamomad sotuv, ortiqcha qaytish sifatida yoziladi va diller qarzi oʻzgaradi. Tasdiqlaysizmi?`)) return;
  REV.busy = true; if (btn) btn.disabled = true;
  try {
    const res = await authFetch('/.netlify/functions/notifications', { method: 'POST', body: JSON.stringify({ action: 'rev_decide', id, approve, note: note || null }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast('⛔ ' + (d.error || 'Saqlanmadi'), 'error'); return; }
    const delta = d.result && +d.result.debtDeltaUsd;
    toast(d.status === 'approved' ? `✅ Reviziya tasdiqlandi${delta ? ` · qarz ${delta > 0 ? '+' : '−'}${CUR.fmtUsd(Math.abs(delta))}` : ''}` : 'Reviziya rad etildi');
    if (typeof dlLoadDealerData === 'function') { try { await dlLoadDealerData(); if (S.page === 'dillerlar' && typeof pgDillerlar === 'function') pgDillerlar(); } catch (e) {} }
    revSheet();
  } catch (e) { toast("⛔ Server bilan aloqa yoʻq — qayta urinib koʻring (ikki marta yozilmaydi)", 'error'); }
  finally { REV.busy = false; if (btn) btn.disabled = false; }
}
