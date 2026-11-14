// ════════════════════════════════════════════════════════════
// FIRMA KASSA (v10) — korxona darajasidagi markaziy kassa.
// Filial kassalaridan (S.cashboxes — har bir filialning o'z kassalari) ALOHIDA:
// qoldiq va har bir harakat SERVERDA (firma_kassa_balance / firma_kassa_ledger)
// saqlanadi, brauzer faqat ko'rsatadi va so'rov yuboradi. Har bir harakat:
//   1) server (atomik, qoldiq manfiyga tushmaydi, idem kalit bilan takrorlanmaydi)
//   2) FAQAT server tasdiqlagach — filial kassasiga tegishli qism (filialdan
//      qabul / filialga berish, hamkor ulushi) mahalliy ma'lumotga yoziladi.
// Hisob valyutasi: faqat USD yoki UZS. Yuklanadi: main.js dan KEYIN.
// ════════════════════════════════════════════════════════════
const FK = { loading: false, error: '', balances: null, advances: [], ledger: [], offset: 0, more: false, busy: false, pending: null,
  summary: null, summaryPending: false, recon: null, reconErr: '' };
const FK_PAGE = 50;
const FK_OP_LABELS = {
  deposit: "Kirim (qo'shish)", withdraw: 'Chiqim', branch_in: 'Filialdan qabul', branch_out: 'Filialga berildi',
  advance_give: 'Avans berildi', advance_repay: 'Avans qaytdi', kirim_payment: "Import (Kirim) to'lovi",
  partner_withdrawal: "Hamkor ulushidan to'lov", adjust_in: "Tuzatish (+)", adjust_out: 'Tuzatish (−)',
  opening: "Boshlang'ich qoldiq", reversal_in: 'Bekor qilish (+)', reversal_out: 'Bekor qilish (−)',
  expense: 'Xarajat', supplier_payment: "Ta'minotchiga to'lov"
};
// v23 (25-migratsiya): har bir yozuvning MANBA turi — hisobotda pul qayerdan kelib, qayerga ketgani
const FK_SRC_LABELS = {
  opening_balance: "Boshlang'ich qoldiq", manual_adjustment: 'Qo\'lda tuzatish', deposit: "Qo'lda kirim", withdraw: "Qo'lda chiqim",
  branch_debt_payment: "Filialning tovar qarzi to'lovi", branch_transfer_in: 'Filialdan o\'tkazma', branch_transfer_out: 'Filialga o\'tkazma',
  branch_loan: 'Filialga qarz (pul)', advance_given: 'Avans', advance_repayment: 'Avans qaytishi',
  kirim_payment: "Kirim to'lovi", kirim_shortfall: "Kirim kamomadi", partner_withdrawal: 'Hamkor ulushi', reversal: 'Bekor qilish',
  expense: 'Xarajat (Xarajatlar boʻlimi)', supplier_payment: "Ta'minotchi qarzi to'lovi", partner_deposit: "Hamkor puli qo'shildi"
};
// Bekor qilib bo'lmaydigan yozuvlar (server ham rad etadi): filial kassasi bilan bog'langanlar va bekor qilishning o'zi
function fkCanReverseRow(r) {
  if (!r || r.reversedBy || r.reversalOf) return false;
  if (/^reversal_/.test(r.op) || r.op === 'branch_in' || r.op === 'branch_out' || r.cpType === 'branch') return false;
  if (r.op === 'supplier_payment' || r.refType === 'expense') return false;   // v23.4: qarz jurnali / Xarajatlar bo'limi orqali
  return true;
}
const FK_CP_LABELS = { staff: 'Xodim', supplier: "Ta'minotchi", dealer: 'Diller', branch: 'Filial', partner: 'Hamkor', other: 'Boshqa' };

function fkCanView() { return hasPerm('firma_kassa.view'); }
function fkCanTransact() { return hasPerm('firma_kassa.transact'); }
function fkIsOwner() { return !CURRENT_USER || CURRENT_USER.kind === 'owner'; }
function fkFmt(cur, v) { return cur === 'USD' ? CUR.fmtUsd(v || 0) : CUR.fmtUzs(v || 0); }
function fkKey() { return 'fkc-' + uid(); }

async function fkCall(payload) {
  const res = await authFetch('/.netlify/functions/firma-kassa', { method: 'POST', body: JSON.stringify(payload) });
  let data = {};
  try { data = await res.json(); } catch (_) { data = {}; }
  if (!res.ok) throw new Error(data.error ? fwCashErr(data.error) : `Server xatosi (${res.status})`);
  return data;
}

async function fkLoad(append) {
  if (!_cloudEnabled) { FK.error = "Bulut ulanmagan — Bosh kassa faqat server bilan ishlaydi"; fkRender(); return; }
  FK.loading = true; FK.error = '';
  if (!append) FK.offset = 0;
  fkRender();
  try {
    const d = await fkCall({ action: 'state', limit: FK_PAGE, offset: FK.offset });
    FK.balances = d.balances || {};
    FK.advances = d.advances || [];
    FK.ledger = append ? FK.ledger.concat(d.ledger || []) : (d.ledger || []);
    FK.more = (d.ledger || []).length === FK_PAGE;
  } catch (e) {
    FK.error = e.message || 'Yuklab bo\'lmadi';
  }
  if (!append && !FK.error) {
    // Filiallar qarzi va Kirim solishtiruvi — alohida; xato bo'lsa sahifa ishlayveradi, lekin xato YASHIRILMAYDI
    const [sm, rc] = await Promise.all([
      fkCall({ action: 'branch_summary' }).catch(e => ({ _err: e.message })),
      fkCall({ action: 'reconcile' }).catch(e => ({ _err: e.message })),
    ]);
    FK.summary = sm._err ? null : (sm.branches || []);
    FK.summaryPending = !!sm.migrationPending;
    FK.recon = rc._err ? null : rc;
    FK.reconErr = rc._err || sm._err || '';
  }
  FK.loading = false;
  fkRender();
}
function fkMore() { FK.offset += FK_PAGE; fkLoad(true); }

function pgFirmaKassa() {
  if (!fkCanView()) { const el = document.getElementById('pg-firmakassa'); if (el) el.innerHTML = '<div class="card" style="padding:20px">Bu bo\'limga ruxsatingiz yo\'q</div>'; return; }
  fkRender();
  fkLoad(false);
}

function fkRender() {
  const el = document.getElementById('pg-firmakassa');
  if (!el) return;
  const b = FK.balances || {};
  const tr = fkCanTransact();
  const tile = (ic, c, label, on, title) => `<button class="kr-q" style="--c:var(--${c})" onclick="${on}" ${FK.busy ? 'disabled' : ''} title="${esc(title || label)}">${(typeof ICONF !== 'undefined' && ICONF[ic]) || ''}<span>${label}</span></button>`;
  const btn = (label, on, cls, title) => `<button class="btn ${cls || 'btn-ghost'}" onclick="${on}" ${FK.busy ? 'disabled' : ''} title="${esc(title || '')}">${label}</button>`;
  const owner = fkIsOwner();
  const rows = FK.ledger.map(r => `<tr${r.reversedBy ? ' style="opacity:.6"' : ''}>
      <td style="white-space:nowrap">${fmtD(r.createdAt)}<div style="font-size:10px;color:var(--text-muted)">#${esc(String(r.id))}</div></td>
      <td>${esc(FK_OP_LABELS[r.op] || r.op)}${r.cpName ? `<div style="font-size:11px;color:var(--text-muted)">${esc((FK_CP_LABELS[r.cpType] || '') + ': ' + r.cpName)}</div>` : ''}
        ${r.sourceType ? `<div style="font-size:10.5px;color:var(--text-muted)">Manba: ${esc(FK_SRC_LABELS[r.sourceType] || r.sourceType)}${r.sourceRef ? ' · ' + esc(r.sourceRef) : ''}</div>` : ''}
        ${r.reversedBy ? `<div style="font-size:10.5px;color:var(--red);font-weight:700">↩ Bekor qilingan (#${esc(String(r.reversedBy))})</div>` : ''}
        ${r.reversalOf ? `<div style="font-size:10.5px;color:var(--amber);font-weight:700">↩ #${esc(String(r.reversalOf))} ni bekor qiladi</div>` : ''}</td>
      <td class="${r.direction === 'in' ? 'plus' : 'minus'}" style="white-space:nowrap;font-weight:700">${r.direction === 'in' ? '+' : '−'}${fkFmt(r.currency, r.amount)}</td>
      <td style="white-space:nowrap">${fkFmt(r.currency, r.balanceAfter)}</td>
      <td style="font-size:11px;color:var(--text-muted)">${esc(r.note || '')}${r.staffName ? `<div>👤 ${esc(r.staffName)}</div>` : ''}
        ${owner && fkCanReverseRow(r) ? `<div><button class="btn btn-ghost btn-sm" style="color:var(--red);padding:2px 6px;margin-top:4px" onclick="fkReverse(${+r.id})" ${FK.busy ? 'disabled' : ''}>↩ Bekor qilish</button></div>` : ''}</td>
    </tr>`).join('');
  const sumRows = (FK.summary || []).filter(x => x.filial !== 'baza').map(x => `<tr>
      <td style="font-weight:600">${esc(typeof branchName === 'function' ? branchName(x.filial) : x.filial)}</td>
      <td style="color:${(+x.goodsDebtUsd || 0) > 0 ? 'var(--red)' : 'inherit'};font-weight:700">${CUR.fmtUsd(+x.goodsDebtUsd || 0)}</td>
      <td style="color:${((+x.loanUsd || 0) > 0 || (+x.loanUzs || 0) > 0) ? 'var(--amber)' : 'inherit'};font-weight:700">${CUR.fmtUsd(+x.loanUsd || 0)}${(+x.loanUzs || 0) > 0 ? ' · ' + CUR.fmtUzs(+x.loanUzs) : ''}</td>
      <td>${CUR.fmtUsd(+x.cashUsd || 0)} · ${CUR.fmtUzs(+x.cashUzs || 0)}</td>
    </tr>`).join('');
  const orphans = (FK.recon && FK.recon.orphans) || [];
  const adv = (FK.advances || []).map((a, i) => `<tr>
      <td>${esc(FK_CP_LABELS[a.counterparty_type] || a.counterparty_type)}</td><td>${esc(a.counterparty_name || a.counterparty_id)}</td>
      <td style="font-weight:700;color:var(--amber)">${fkFmt(a.currency, a.outstanding)}</td>
      <td>${tr ? `<button class="btn btn-ghost btn-sm" onclick="fkRepay(${i})">↩ Qaytarish</button>` : ''}</td>
    </tr>`).join('');

  el.innerHTML = `
    ${typeof fwHero === 'function' ? fwHero({ tone:'gold', label:'Bosh kassa — markaziy kassa', badge:'Server jurnali',
      big: FK.balances ? CUR.fmtUsd(b.USD || 0) : '…',
      cols:[[FK.balances ? fwShortUzs(b.UZS || 0) : '…', 'Soʻm'], [(FK.advances || []).length, 'Ochiq avans', 'var(--amber)'], [(FK.summary || []).filter(x => x.filial !== 'baza' && (+x.goodsDebtUsd || 0) > 0).length, 'Qarzdor filial', 'var(--red)']],
      foot: `<p class="fk-note">Filial kassalaridan alohida hisoblanadi; har bir harakat serverda yoziladi va oʻchirilmaydi.</p>` }) : ''}
    ${typeof dpnBannerHtml === 'function' ? dpnBannerHtml() : ''}
    ${FK.error ? `<div class="card" style="padding:12px 14px;margin-bottom:12px;border-color:var(--red);color:var(--red)">⚠️ ${esc(FK.error)} <button class="btn btn-ghost btn-sm" onclick="fkLoad(false)">Qayta urinish</button></div>` : ''}
    ${tr ? `<div class="fk-tiles">
      ${tile('add', 'emerald', 'Kirim', "fkOpen('deposit')")}
      ${tile('minus', 'red', 'Chiqim', "fkOpen('withdraw')")}
      ${tile('download', 'sky', 'Filialdan qabul', "fkOpen('branch_in')", "Joriy filial kassasidan Bosh kassaga")}
      ${tile('upload', 'indigo', 'Filialga berish', "fkOpen('branch_out')", "Bosh kassadan joriy filial kassasiga")}
      ${S.branch !== 'baza' ? tile('building', 'purple', 'Filialga qarz', "fkOpen('branch_loan_give')", "Bosh kassadan joriy filialga QARZ (filial qaytaradi)") : ''}
      ${tile('people', 'amber', 'Avans berish', "fkOpen('advance_give')")}
      ${fkIsOwner() && S.branch === 'baza' ? tile('money', 'pink', 'Hamkorga toʻlov', "fkOpen('partner_withdrawal')", "Ta'sischi/hamkor ulushidan to'lov — maosh emas") : ''}
      ${fkIsOwner() ? tile('history', 'sand', 'Boshlangʻich qoldiq', "fkOpen('opening')", "Faqat egasi: tizimga o'tishdagi boshlang'ich qoldiq") : ''}
      ${tile('refresh', 'text-muted', 'Yangilash', 'fkLoad(false)')}
    </div>` : `<div style="margin:12px 0">${btn('🔄 Yangilash', 'fkLoad(false)')}</div>`}
    ${orphans.length ? `<div class="card" style="padding:12px 14px;margin-bottom:12px;border-color:var(--red)">
      <div style="font-weight:700;color:var(--red);margin-bottom:6px">⚠️ Kirimga bog'lanmagan to'lovlar: ${orphans.length} ta</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">Bosh kassadan Kirim uchun pul yechilgan, lekin hech bir partiya bu to'lovga bog'lanmagan (masalan to'lovdan keyin sahifa yopilgan). Tekshiring: Kirimni qayta kiriting yoki egasi to'lovni bekor qilsin.</div>
      ${orphans.map(o => `<div style="font-size:12px;padding:3px 0">#${esc(String(o.id))} · ${fmtD(o.createdAt)} · <b>${fkFmt(o.currency, o.amount)}</b> · ${esc(o.supplier || '—')} · ${esc(o.ref || '')}</div>`).join('')}
    </div>` : ''}
    ${FK.reconErr ? `<div style="font-size:11.5px;color:var(--amber);margin-bottom:10px">⚠️ Solishtirish/hisobot yuklanmadi: ${esc(FK.reconErr)}</div>` : ''}
    ${FK.recon && FK.recon.legacyUnverifiable ? `<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px">ℹ️ ${FK.recon.legacyUnverifiable} ta eski (v23 gacha) Kirim to'lovi partiyaga bog'lanmagan formatda — avtomatik solishtirib bo'lmaydi.</div>` : ''}
    <div class="card" style="margin-bottom:12px">
      <div class="card-header"><div class="card-title">🏬 Filiallarning Bazaga qarzlari</div></div>
      ${FK.summaryPending ? `<div style="padding:10px 14px;font-size:12px;color:var(--amber)">25-migratsiya hali qo'llanmagan — hisobot mavjud emas.</div>` : `
      <div class="table-wrap"><table><thead><tr><th>Filial</th><th>Tovar qarzi</th><th>Pul qarzi (Bazadan olingan)</th><th>Filial kassalari</th></tr></thead>
      <tbody>${sumRows || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">${FK.summary ? "Filial qarzi yo'q" : 'Yuklanmoqda…'}</td></tr>`}</tbody></table></div>`}
    </div>
    <div class="card" style="margin-bottom:12px">
      <div class="card-header"><div class="card-title">🤝 Qaytarilmagan avanslar</div></div>
      <div class="table-wrap"><table><thead><tr><th>Turi</th><th>Kimga</th><th>Qolgan</th><th></th></tr></thead>
      <tbody>${adv || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">${FK.loading && !FK.balances ? 'Yuklanmoqda…' : "Qaytarilmagan avans yo'q"}</td></tr>`}</tbody></table></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">📜 Harakatlar tarixi</div></div>
      <div class="table-wrap"><table><thead><tr><th>Sana</th><th>Amal</th><th>Summa</th><th>Qoldiq</th><th>Izoh</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">${FK.loading ? 'Yuklanmoqda…' : "Hozircha harakat yo'q"}</td></tr>`}</tbody></table></div>
      ${FK.more ? `<div style="text-align:center;padding:10px">${btn("Ko'proq ko'rsatish", 'fkMore()')}</div>` : ''}
    </div>`;
}

function fkRepay(i) {
  const a = (FK.advances || [])[i]; if (!a) return;
  fkOpen('advance_repay', { currency: a.currency, cpType: a.counterparty_type, cpId: a.counterparty_id, cpName: a.counterparty_name, max: +a.outstanding || 0 });
}

// ── Amal oynasi ──
function fkOpen(action, preset) {
  if (!fkCanTransact()) { toast("Ruxsatingiz yo'q", 'error'); return; }
  const p = preset || {};
  const title = { deposit: '➕ Bosh kassaga kirim', withdraw: '➖ Bosh kassadan chiqim', branch_in: '⇦ Filial kassasidan qabul',
    branch_out: '⇨ Filial kassasiga berish', advance_give: '🤝 Avans berish', advance_repay: '↩ Avans qaytarilishi', partner_withdrawal: "👤 Hamkor ulushidan to'lov",
    opening: "📌 Boshlang'ich qoldiq", branch_loan_give: '🏦 Filialga qarz berish' }[action];
  const curSel = (def) => `<div class="form-group"><label class="form-label">Valyuta</label>
      <select class="form-control" id="fk-cur" onchange="fkBoxOptions()" ${p.currency ? 'disabled' : ''}>
        <option value="USD" ${def === 'USD' ? 'selected' : ''}>$ Dollar</option><option value="UZS" ${def === 'UZS' ? 'selected' : ''}>So'm</option></select></div>`;
  let extra = '';
  if (action === 'branch_in' || action === 'branch_out' || action === 'branch_loan_give') {
    extra = `<div class="form-group"><label class="form-label">${esc(branchName(S.branch))} — kassa</label><select class="form-control" id="fk-box"></select></div>`
      + (action === 'branch_loan_give' ? `<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:8px">Filial zarar ko'rib xarajatga pul yetmasa — Baza qarz beradi. Bu <b>qarz</b> sifatida yoziladi (filial keyin "Kassalar → Bazaga qarzni qaytarish" orqali qaytaradi), oddiy o'tkazma emas.</div>` : '');
  } else if (action === 'opening') {
    extra = `<div style="font-size:11.5px;color:var(--amber);margin-bottom:8px">Faqat tizimga birinchi marta o'tishda: kassadagi haqiqiy boshlang'ich pulni kiriting. Har bir yozuv jurnalda qoladi.</div>`;
  } else if (action === 'advance_give') {
    extra = `<div class="form-group"><label class="form-label">Kimga</label>
      <select class="form-control" id="fk-cptype" onchange="fkCpOptions()">
        <option value="staff">Xodim</option><option value="supplier">Ta'minotchi</option><option value="dealer">Diller</option><option value="other">Boshqa</option>
      </select></div><div class="form-group" id="fk-cp-wrap"></div>`;
  } else if (action === 'advance_repay') {
    extra = `<div class="form-group"><label class="form-label">Kimdan</label><div class="form-control" style="background:var(--bg-secondary)">${esc((FK_CP_LABELS[p.cpType] || '') + ': ' + (p.cpName || p.cpId))} — qolgan: ${fkFmt(p.currency, p.max)}</div></div>`;
  } else if (action === 'partner_withdrawal') {
    extra = `<div class="form-group"><label class="form-label">Hamkor</label><select class="form-control" id="fk-partner">${(S.partners || []).filter(x => !x.archived && (x.filial || 'baza') === 'baza').map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>
      <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:8px">Hamkorning ulush hisobidan (SUMMA) kamaytiriladi va Hamkorlar hisobotida "Ulush to'lovi" bo'lib ko'rinadi. Maosh (xodim oyligi) sifatida yozilMAYDI.</div>`;
  }
  FK.pending = { action, preset: p };
  modal(`
    <div class="modal-header"><div class="modal-title">${title}</div><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      ${curSel(p.currency || 'USD')}
      ${extra}
      <div class="form-group"><label class="form-label">Summa</label><input type="number" inputmode="decimal" min="0" step="0.01" class="form-control" id="fk-amt" ${p.max ? `value="${+p.max}"` : ''}></div>
      <div class="form-group"><label class="form-label">Izoh</label><input class="form-control" id="fk-note" maxlength="300" placeholder="ixtiyoriy"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Bekor</button><button class="btn btn-primary" id="fk-submit" onclick="fkSubmit()">✅ Tasdiqlash</button></div>`);
  fkBoxOptions(); fkCpOptions();
}
function fkBoxOptions() {
  const sel = document.getElementById('fk-box'); if (!sel) return;
  const cur = document.getElementById('fk-cur')?.value || 'USD';
  const boxes = (S.cashboxes || []).filter(k => k.cur === cur && k.type !== 'dealer');
  sel.innerHTML = boxes.map(k => `<option value="${k.id}">${k.icon || ''} ${esc(k.name)} — ${fkFmt(k.cur, k.bal)}</option>`).join('') || '<option value="">Bu valyutada kassa yo\'q</option>';
}
function fkCpOptions() {
  const wrap = document.getElementById('fk-cp-wrap'); if (!wrap) return;
  const t = document.getElementById('fk-cptype')?.value || 'staff';
  const list = t === 'staff' ? (S.staffList || []).map(x => ({ id: x.id, name: x.name }))
    : t === 'supplier' ? (S.suppliers || []).map(x => ({ id: x.id, name: x.name }))
    : t === 'dealer' ? (S.dealers || []).map(x => ({ id: x.id, name: x.name })) : null;
  wrap.innerHTML = list
    ? `<label class="form-label">${FK_CP_LABELS[t]}</label><select class="form-control" id="fk-cp">${list.map(x => `<option value="${esc(String(x.id))}">${esc(x.name)}</option>`).join('') || '<option value="">Ro\'yxat bo\'sh</option>'}</select>`
    : `<label class="form-label">Ism / tashkilot</label><input class="form-control" id="fk-cp-name" maxlength="120">`;
}

async function fkSubmit() {
  const pend = FK.pending; if (!pend || FK.busy) return;
  const { action, preset } = pend;
  const cur = preset.currency || document.getElementById('fk-cur')?.value || 'USD';
  const amount = Math.round(parseFloat(document.getElementById('fk-amt')?.value || 0) * 100) / 100;
  const note = (document.getElementById('fk-note')?.value || '').trim();
  if (!(amount > 0) || !isFinite(amount)) { toast('Summa kiriting!', 'error'); return; }
  const payload = { action, currency: cur, amount, note };
  let box = null, partner = null;
  if (action === 'deposit' || action === 'withdraw' || action === 'opening') { payload.action = 'move'; payload.op = action; }
  if (action === 'branch_in' || action === 'branch_out' || action === 'branch_loan_give') {
    box = (S.cashboxes || []).find(k => k.id === parseInt(document.getElementById('fk-box')?.value));
    if (!box) { toast('Kassani tanlang!', 'error'); return; }
    if (action === 'branch_in' && amount > (box.bal || 0) + 0.005) { toast(`"${box.name}"da yetarli mablag' yo'q`, 'error'); return; }
    Object.assign(payload, { filial: S.branch, cpName: branchName(S.branch), boxId: box.id });
  }
  if (action === 'advance_give') {
    const t = document.getElementById('fk-cptype')?.value || 'staff';
    if (t === 'other') {
      const nm = (document.getElementById('fk-cp-name')?.value || '').trim();
      if (!nm) { toast('Kimga berilayotganini yozing!', 'error'); return; }
      Object.assign(payload, { cpType: 'other', cpId: 'o:' + nm.toLowerCase().replace(/\s+/g, ' ').slice(0, 60), cpName: nm });
    } else {
      const sel = document.getElementById('fk-cp');
      if (!sel || !sel.value) { toast('Kimga berilayotganini tanlang!', 'error'); return; }
      Object.assign(payload, { cpType: t, cpId: sel.value, cpName: sel.options[sel.selectedIndex]?.text || sel.value });
    }
  }
  if (action === 'advance_repay') {
    if (amount > (+preset.max || 0) + 0.005) { toast('Qolgan avansdan ko\'p qaytarib bo\'lmaydi', 'error'); return; }
    Object.assign(payload, { cpType: preset.cpType, cpId: preset.cpId, cpName: preset.cpName });
  }
  if (action === 'partner_withdrawal') {
    if (S.branch !== 'baza') { toast("Hamkorlar faqat Bazaga tegishli — Bazaga o'ting", 'error'); return; }
    partner = (S.partners || []).find(x => x.id === parseInt(document.getElementById('fk-partner')?.value) && (x.filial || 'baza') === 'baza');
    if (!partner) { toast('Hamkorni tanlang!', 'error'); return; }
    Object.assign(payload, { cpId: String(partner.id), cpName: partner.name });
  }

  // Bir xil ma'lumot bilan qayta yuborilsa — bir xil kalit (server takror yozmaydi);
  // foydalanuvchi qiymatni o'zgartirsa — yangi kalit
  const sig = JSON.stringify(payload);
  if (pend.sig !== sig) { pend.sig = sig; pend.idemKey = fkKey(); }
  payload.idemKey = pend.idemKey;
  FK.busy = true;
  const sbtn = document.getElementById('fk-submit'); if (sbtn) sbtn.disabled = true;
  try {
    const r = await fkCall(payload);
    // Server tasdiqladi — endi mahalliy (filial) tomoni
    if (box) {
      const amt = amount;
      const desc = action === 'branch_in' ? `Bosh kassaga topshirildi${note ? ' — ' + note : ''}` : `Bosh kassadan olindi${note ? ' — ' + note : ''}`;
      if (r.authority && (r.transfer || r.loan)) {
        // v11 (B7/F4) + v23 (qarz): ikkala tomon serverda BITTA tranzaksiyada — filial kassasi qoldig'i serverdan
        fwApplyCashBalances({ [box.id]: +(r.transfer || r.loan).branchBalance });
        fwCashSeq++;
        if (!r.duplicate) logCashTxn({ boxId: box.id, type: action === 'branch_in' ? 'out' : 'in', amount: amt, desc: action === 'branch_loan_give' ? `Bazadan qarz olindi${note ? ' — ' + note : ''}` : desc });
      } else if (action === 'branch_loan_give') {
        throw new Error("Server filial kassasini tasdiqlamadi — sahifani yangilang");   // server doim authority qaytaradi; aks holda mahalliy o'zgarish yo'q
      } else if (action === 'branch_in') { box.bal = (box.bal || 0) - amt; logCashTxn({ boxId: box.id, type: 'out', amount: amt, desc }); }
      else { box.bal = (box.bal || 0) + amt; logCashTxn({ boxId: box.id, type: 'in', amount: amt, desc }); }
    }
    if (partner) {
      const usd = cur === 'USD' ? amount : CUR.toUsd(amount);
      S.expenses.push({ id: uid(), date: td(), cat: FW_SYS_EXPENSE.partner_withdrawal, sysType: 'partner_withdrawal', amtUsd: usd, amount, cur, desc: note || 'Bosh kassadan', person: partner.name,
        boxId: null, source: 'firma_kassa', turi: 'hamkor', partnerId: partner.id, kind: 'chiqim', rate: cur === 'UZS' ? CUR.usdUzs : null });
      partner.invested = (partner.invested || 0) - usd; partner.updatedAt = Date.now();
    }
    auditLog(`Bosh kassa: ${FK_OP_LABELS[r.entry?.op] || action} — ${fkFmt(cur, amount)}${payload.cpName ? ' — ' + payload.cpName : ''}`);
    if (box || partner) save();
    FK.pending = null;
    closeModal();
    toast(r.duplicate ? '✅ Bu amal avval bajarilgan edi (takror yozilmadi)' : '✅ Bajarildi');
    fkLoad(false);
  } catch (e) {
    toast('⛔ ' + (e.message || 'Bajarilmadi'), 'error');
  } finally {
    FK.busy = false;
    const b2 = document.getElementById('fk-submit'); if (b2) b2.disabled = false;
  }
}

// ── v23: yozuvni bekor qilish (faqat egasi) — o'chirilmaydi, TESKARI yozuv qo'shiladi ──
async function fkReverse(id) {
  if (!fkIsOwner()) { toast('Faqat egasi bekor qila oladi', 'error'); return; }
  const r = (FK.ledger || []).find(x => +x.id === +id); if (!r || !fkCanReverseRow(r)) { toast("Bu yozuvni bekor qilib bo'lmaydi", 'error'); return; }
  const note = prompt(`#${id} — ${FK_OP_LABELS[r.op] || r.op}, ${fkFmt(r.currency, r.amount)}.\nBekor qilish sababi (majburiy):`);
  if (note === null) return;
  if (!note.trim()) { toast('Sabab yozilishi shart', 'error'); return; }
  if (FK.busy) return;
  FK.busy = true; fkRender();
  try {
    const out = await fkCall({ action: 'reverse', entryId: +id, idemKey: 'rv-' + id, note: note.trim().slice(0, 300) });
    auditLog(`Bosh kassa: #${id} bekor qilindi (${fkFmt(r.currency, r.amount)}) — ${note.trim()}`);
    toast('✅ Bekor qilindi — teskari yozuv #' + (out.entry && out.entry.id));
  } catch (e) { toast('⛔ ' + (e.message || 'Bekor qilinmadi'), 'error'); }
  finally { FK.busy = false; }
  fkLoad(false);
}

// ── v23: Filial ↔ Baza hisob-kitobi (Kassalar sahifasida, faqat filialda) ──
// Filial o'z balansini o'zi boshqaradi; Baza bilan faqat: tovar qarzi (Bazaga to'lov) va
// zarar bo'lganda Bazadan olingan PUL qarzi (berish — Bosh kassa huquqi; qaytarish — kassir ham).
const FKB = { data: null, err: '', busy: false, idem: null };
function fkBranchCardHtml() {
  if (S.branch === 'baza' || !_cloudEnabled) return '';
  return '<div id="kas-baza-card" class="card" style="margin-bottom:16px;padding:12px 14px"><div style="font-size:12px;color:var(--text-muted)">Baza bilan hisob-kitob yuklanmoqda…</div></div>';
}
async function fkLoadBranchCard() {
  if (S.branch === 'baza' || !_cloudEnabled) return;
  try {
    const d = await fkCall({ action: 'branch_summary', filial: S.branch });
    FKB.data = d.migrationPending ? { pending: true } : ((d.branches || []).find(x => x.filial === S.branch) || { filial: S.branch, goodsDebtUsd: 0, loanUsd: 0, loanUzs: 0 });
    FKB.err = '';
  } catch (e) { FKB.data = null; FKB.err = e.message || 'Yuklanmadi'; }
  fkRenderBranchCard();
}
function fkRenderBranchCard() {
  const el = document.getElementById('kas-baza-card'); if (!el) return;
  if (FKB.err) { el.innerHTML = `<div style="font-size:12px;color:var(--red)">⚠️ Baza bilan hisob-kitob yuklanmadi: ${esc(FKB.err)} <button class="btn btn-ghost btn-sm" onclick="fkLoadBranchCard()">Qayta</button></div>`; return; }
  const d = FKB.data; if (!d) return;
  if (d.pending) { el.innerHTML = `<div style="font-size:12px;color:var(--amber)">Bazadan qarz olish/qaytarish uchun 25-migratsiya qo'llanishi kerak.</div>`; return; }
  const loanUsd = +d.loanUsd || 0, loanUzs = +d.loanUzs || 0;
  const canRepay = hasPerm('kassalar.transact') || hasPerm('firma_kassa.transact');
  el.innerHTML = `
    <div style="font-weight:700;margin-bottom:8px">🏛 Baza bilan hisob-kitob — ${esc(branchName(S.branch))}</div>
    <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:13px;margin-bottom:10px">
      <span>Tovar qarzi: <b style="color:${(+d.goodsDebtUsd||0)>0?'var(--red)':'var(--emerald)'}">${CUR.fmtUsd(+d.goodsDebtUsd || 0)}</b></span>
      <span>Bazadan olingan pul qarzi: <b style="color:${(loanUsd>0||loanUzs>0)?'var(--amber)':'var(--emerald)'}">${CUR.fmtUsd(loanUsd)}${loanUzs>0?' · '+CUR.fmtUzs(loanUzs):''}</b></span>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${(loanUsd>0||loanUzs>0) && canRepay ? `<button class="btn btn-success btn-sm" onclick="fkLoanOpen('repay')">↩ Bazaga pul qarzini qaytarish</button>` : ''}
      ${fkCanTransact() ? `<button class="btn btn-ghost btn-sm" onclick="fkLoanOpen('give')">🏦 Bazadan qarz olish</button>` : ''}
    </div>`;
}
function fkLoanOpen(dir) {
  const d = FKB.data || {};
  const boxes = (S.cashboxes || []).filter(k => (k.cur === 'USD' || k.cur === 'UZS') && k.type !== 'dealer');
  if (!boxes.length) { toast('Kassa topilmadi', 'error'); return; }
  const outUsd = +d.loanUsd || 0, outUzs = +d.loanUzs || 0;
  const b0 = dir === 'repay' ? (boxes.find(k => k.cur === (outUsd > 0 ? 'USD' : 'UZS')) || boxes[0]) : (boxes.find(k => k.cur === 'USD') || boxes[0]);
  FKB.idem = null;
  modal(`
    <div class="modal-header"><div class="modal-title">${dir === 'repay' ? '↩ Bazaga pul qarzini qaytarish' : '🏦 Bazadan qarz olish'}</div><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">${dir === 'repay' ? `Qolgan qarz: <b>${CUR.fmtUsd(outUsd)}</b>${outUzs>0?' · <b>'+CUR.fmtUzs(outUzs)+'</b>':''} — qarz qaysi valyutada olingan bo'lsa, o'sha valyutada qaytariladi.` : "Pul Bosh kassadan filial kassasiga o'tadi va filialning Bazaga QARZI sifatida yoziladi."}</div>
      <div class="form-group"><label class="form-label">Filial kassasi</label>
        <select class="form-control" id="fkl-box">${boxes.map(k => `<option value="${k.id}" ${k.id === b0.id ? 'selected' : ''}>${k.icon || ''} ${esc(k.name)} (${fkFmt(k.cur, k.bal)})</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">Summa (kassa valyutasida)</label><input class="form-control" id="fkl-amt" type="number" step="0.01" min="0" inputmode="decimal"></div>
      <div class="form-group" style="margin-bottom:0"><label class="form-label">Izoh / sabab</label><input class="form-control" id="fkl-note" maxlength="300" placeholder="${dir === 'give' ? 'Masalan: ijara to\'lovi uchun' : 'ixtiyoriy'}"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Bekor</button><button class="btn btn-primary" id="fkl-btn" onclick="fkLoanSubmit('${dir === 'repay' ? 'repay' : 'give'}')">✅ Tasdiqlash</button></div>`);
}
async function fkLoanSubmit(dir) {
  if (FKB.busy) return;
  const box = (S.cashboxes || []).find(k => k.id === parseInt(document.getElementById('fkl-box')?.value));
  const amount = Math.round(parseFloat(document.getElementById('fkl-amt')?.value || 0) * 100) / 100;
  const note = (document.getElementById('fkl-note')?.value || '').trim();
  if (!box) { toast('Kassani tanlang', 'error'); return; }
  if (!(amount > 0) || !isFinite(amount)) { toast('Summa kiriting!', 'error'); return; }
  if (dir === 'give' && !note) { toast("Qarz sababini yozing", 'error'); return; }
  if (dir === 'repay') {
    const out = box.cur === 'USD' ? (+(FKB.data || {}).loanUsd || 0) : (+(FKB.data || {}).loanUzs || 0);
    if (amount > out + 0.005) { toast(`⛔ Bu valyutadagi qarz: ${fkFmt(box.cur, out)}`, 'error'); return; }
    if (amount > (box.bal || 0) + 0.005) { toast(`⛔ "${box.name}"da yetarli mablag' yo'q`, 'error'); return; }
  }
  const payload = { action: dir === 'repay' ? 'branch_loan_repay' : 'branch_loan_give', currency: box.cur, amount, boxId: box.id, filial: S.branch, note };
  const sig = JSON.stringify(payload);
  if (!FKB.idem || FKB.idem.sig !== sig) FKB.idem = { sig, key: 'fkl-' + uid() };
  payload.idemKey = FKB.idem.key;
  FKB.busy = true;
  const btn = document.getElementById('fkl-btn'); if (btn) btn.disabled = true;
  try {
    const r = await fkCall(payload);
    if (!(r.authority && r.loan)) throw new Error("Server kassa qoldig'ini qaytarmadi");
    // SERVER MUVAFFAQIYATLI → faqat endi mahalliy ko'rinish (qoldiq serverdan)
    fwApplyCashBalances({ [box.id]: +r.loan.branchBalance });
    fwCashSeq++;
    if (!r.duplicate) logCashTxn({ boxId: box.id, type: dir === 'repay' ? 'out' : 'in', amount, desc: (dir === 'repay' ? 'Bazaga pul qarzi qaytarildi' : 'Bazadan qarz olindi') + (note ? ' — ' + note : '') });
    auditLog(`${dir === 'repay' ? 'Bazaga qarz qaytarildi' : 'Bazadan qarz olindi'}: ${fkFmt(box.cur, amount)} (${branchName(S.branch)})`);
    FKB.idem = null;
    save(); closeModal();
    toast(r.duplicate ? '✅ Bu amal avval bajarilgan edi (takror yozilmadi)' : `✅ Bajarildi. Qolgan qarz: ${fkFmt(box.cur, +r.loan.outstanding || 0)}`);
    pgKassalar();
  } catch (e) {
    toast('⛔ ' + (e.message || 'Bajarilmadi'), 'error');   // hech narsa o'zgarmadi
  } finally {
    FKB.busy = false;
    const b2 = document.getElementById('fkl-btn'); if (b2) b2.disabled = false;
  }
}

// ── Kirim integratsiyasi: "Bosh kassa" to'lov manbai sifatida ──
// Kirim'da manba "firma" tanlansa — kirimSave() serverdan to'lovni (qoldiq yetarli
// bo'lsa) BIRINCHI bajaradi; rad etilsa Kirim umuman saqlanmaydi (fail-closed).
async function fkKirimPay({ amountUsd, supplierId, supplierName, refId, idemKey }) {
  return fkCall({ action: 'kirim_pay', currency: 'USD', amount: Math.round(amountUsd * 100) / 100, cpId: supplierId != null ? String(supplierId) : null, cpName: supplierName || null, refId, note: `Kirim #${refId}`, idemKey });
}
