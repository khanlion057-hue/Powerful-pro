// ════════════════════════════════════════════════════════════
// TA'MINOTCHIGA ZAKLAD (oldindan to'lov) — v24.4, 33-migratsiya, server: supplier-advance
// Egasi qoidasi (2026-10-14): Xitoy ta'minotchisiga zaklad YUANDA, pul $ KASSADAN (filial $ kassasi yoki Bosh kassa $).
// Ta'minotchiga faqat yuan summasi ($ ga o'girilgan) zaklad bo'lib yoziladi; xizmat (masalan 0,6%) — alohida XARAJAT.
// Zaklad ta'minotchi qarzidan ALOHIDA; tovar kelgach «Zakladdan yopish» — qarz zakladdan kamayadi.
// v25 (45): zaklad yuanda ($ kassadan), dollarda ($ kassadan) yoki so'mda (so'm kassadan). So'mdagi ta'minotchida
// zaklad qoldig'i va «Zakladdan yopish» so'mda (qarz so'mma-so'm kamayadi).
// Barcha hisob serverda, bitta tranzaksiyada; brauzer faqat ko'rsatadi.
// ════════════════════════════════════════════════════════════
const SADV = { bal: {}, balUzs: {}, items: [], loaded: false, pending33: false, busy: false, key: null, cur: 'CNY' };
FW_SYS_EXPENSE.transfer_fee = "Pul oʻtkazish xizmati";

async function sadvCall(payload) {
  let res, d;
  try { res = await authFetch('/.netlify/functions/supplier-advance', { method: 'POST', body: JSON.stringify({ filial: S.branch, ...payload }) }); d = await res.json().catch(() => ({})); }
  catch (e) { const err = new Error("Server bilan aloqa yoʻq — qayta urinib koʻring (takror yozilmaydi)"); err.retry = true; throw err; }
  if (res.status === 409 && d.migration33Pending) { SADV.pending33 = true; const err = new Error(d.error || '33-migratsiya kerak'); err.pending = true; throw err; }
  if (!res.ok || d.ok === false) { const err = new Error(d.error || 'Bajarilmadi'); err.retry = res.status >= 500; throw err; }
  return d;
}
async function sadvLoad(force) {
  if (!_cloudEnabled || (SADV.loaded && !force)) return;
  try { const d = await sadvCall({ action: 'list' }); SADV.bal = d.balances || {}; SADV.balUzs = d.balancesUzs || {}; SADV.items = d.items || []; SADV.pending33 = !!d.migration33Pending; SADV.loaded = true; }
  catch (e) { SADV.loaded = true; }
}
function sadvBal(sid) { return Math.round((+SADV.bal[String(sid)] || 0) * 100) / 100; }
function sadvBalUzs(sid) { return Math.round(+SADV.balUzs[String(sid)] || 0); }
function sadvSuppUzs(s) { return typeof suppIsUzs === 'function' && suppIsUzs(s); }
// Zaklad qoldig'i matni — ta'minotchi valyutasida
function sadvBalTxt(s) { return sadvSuppUzs(s) ? CUR.fmtUzs(sadvBalUzs(s.id)) : CUR.fmtUsd(sadvBal(s.id)); }
function sadvHasBal(s) { return sadvSuppUzs(s) ? sadvBalUzs(s.id) > 0 : sadvBal(s.id) > 0.004; }
const SADV_CUR = { CNY: ['¥', 'Yuan'], USD: ['$', 'Dollar'], UZS: ['soʻm', 'Soʻm'] };
const sadvFmt = (cur, v) => cur === 'UZS' ? CUR.fmtUzs(v) : cur === 'USD' ? CUR.fmtUsd(v) : `${(+v).toLocaleString('ru-RU')} ¥`;
function sadvRate() { return +(S.settings && S.settings.usdCny) || +CUR.usdCny || 7.1; }
const sadvR2 = (n) => Math.round(n * 100) / 100;
function sadvCalc(cny, fee, rate) {
  const c = Math.round((+cny || 0) * 100) / 100, r = +rate || 0, f = +fee || 0;
  if (!(c > 0) || !(r > 0)) return null;
  const usd = sadvR2(c / r), feeUsd = sadvR2(c * f / 100 / r);
  return { cny: c, usd, feeUsd, total: sadvR2(usd + feeUsd) };
}

// Ta'minotchi kartochkasidagi zaklad belgisi va tugmalar (Ta'minotchilar ro'yxati)
function sadvRowTag(s) { return sadvHasBal(s) ? ` <em class="fw-tag" style="--c:var(--sky)">Zaklad ${sadvBalTxt(s)}</em>` : ''; }
function sadvRowBtns(s) {
  const d = typeof suppHasDebt === 'function' ? suppHasDebt(s) : (+s.debt || 0) > 0.004, can = !CURRENT_USER || CURRENT_USER.kind === 'owner' || hasPerm('taminotchilar.edit') || hasPerm('kirim.create');
  if (!can) return '';
  return `<button class="fw-btn" onclick="openSuppAdvance(${s.id})">${ICONF.money}<span>Zaklad</span></button>`
    + (sadvHasBal(s) && d && (!CURRENT_USER || CURRENT_USER.kind === 'owner' || hasPerm('taminotchilar.edit')) ? `<button class="fw-btn ok" onclick="openSuppAdvanceApply(${s.id})">${ICONF.check}<span>Zakladdan yopish</span></button>` : '');
}

function openSuppAdvance(sid, cur) {
  const s = S.suppliers.find(x => x.id === sid); if (!s) return;
  SADV.cur = cur && SADV_CUR[cur] ? cur : (SADV.cur || 'CNY');
  const boxCur = SADV.cur === 'UZS' ? 'UZS' : 'USD';
  const boxes = (S.cashboxes || []).filter(k => k.cur === boxCur && k.type !== 'dealer');
  const opts = boxes.map(k => ({ v: String(k.id), cur: boxCur, ic: k.icon || '💵', name: k.name, sub: 'Qoldiq: ' + (boxCur === 'USD' ? CUR.fmtUsd(k.bal || 0) : CUR.fmtUzs(k.bal || 0)) }));
  if (fwFirmaAvailable()) opts.push({ v: 'firma', cur: boxCur, ic: '🏛', name: `Bosh kassa (${boxCur === 'USD' ? '$' : 'soʻm'})`, sub: 'Asosiy kassa' });
  SADV.key = null;
  const sym = SADV_CUR[SADV.cur][0];
  modal(`
    <div class="modal-header"><div class="modal-title">Taʼminotchiga zaklad</div><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      ${meCard({ name: s.name, sub: esc(s.country || '') + (sadvSuppUzs(s) ? ' · hisob soʻmda' : ''), kpi: sadvBalTxt(s), kpiLabel: 'joriy zaklad', tone: 'pos' })}
      <div class="bs-seg" style="margin-bottom:10px">${Object.entries(SADV_CUR).map(([k, [sy, l]]) => `<button type="button" class="${SADV.cur === k ? 'on' : ''}" onclick="openSuppAdvance(${sid},'${k}')">${l} (${sy})</button>`).join('')}</div>
      ${opts.length ? `${meSec(`Qaysi ${boxCur === 'USD' ? '$' : 'soʻm'} kassadan`)}
      ${meBoxPick('sadv-b', opts, 'sadvPreview()')}` : `<p class="bs-note">${boxCur === 'USD' ? '$' : 'Soʻm'} kassa yoʻq — avval kassani qoʻshing.</p>`}
      ${meSec('Zaklad')}
      ${SADV.cur === 'CNY' ? `<div class="me-2">
        ${meField('Summa (¥)', `<input class="form-control" id="sadv-cny" type="number" inputmode="decimal" min="0" step="0.01" placeholder="10 000" oninput="sadvPreview()">`)}
        ${meField('Kurs (1 $ = ? ¥)', `<input class="form-control" id="sadv-rate" type="number" inputmode="decimal" step="0.0001" value="${sadvRate()}" oninput="sadvPreview()">`)}
      </div>` : meField(`Summa (${sym})`, `<input class="form-control" id="sadv-cny" type="number" inputmode="decimal" min="0" step="${SADV.cur === 'UZS' ? 1 : 0.01}" oninput="sadvPreview()">`)}
      ${meField('Xizmat (%) — xarajat', `<input class="form-control" id="sadv-fee" type="number" inputmode="decimal" step="0.01" min="0" max="5" value="${SADV.cur === 'CNY' ? 0.6 : 0}" oninput="sadvPreview()">`)}
      ${meField('Izoh', `<input class="form-control" id="sadv-note" maxlength="300" placeholder="Masalan: 2-partiya uchun">`, '', ' style="margin-bottom:0"')}
      <div class="sadv-res" id="sadv-res"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Bekor</button>
      <button class="btn btn-success" id="sadv-go" onclick="sadvPay(${sid})"${opts.length ? '' : ' disabled'}>✅ Zaklad berish</button>
    </div>`);
  sadvPreview();
}
// $ yoki so'mdagi zaklad: summa, xizmat va jami (o'sha valyutada)
function sadvCalcNative(cur, amt, fee) {
  const dp = cur === 'UZS' ? 0 : 2, k = Math.pow(10, dp), a = Math.round((+amt || 0) * k) / k, f = +fee || 0;
  if (!(a > 0)) return null;
  const feeA = Math.round(a * f / 100 * k) / k;
  return { cur, amount: a, fee: feeA, total: Math.round((a + feeA) * k) / k };
}
function sadvPreview() {
  const el = document.getElementById('sadv-res'); if (!el) return;
  if (SADV.cur !== 'CNY') {
    const n = sadvCalcNative(SADV.cur, document.getElementById('sadv-cny')?.value, document.getElementById('sadv-fee')?.value);
    el.innerHTML = n ? `<div><span>Taʼminotchiga zaklad</span><b>${sadvFmt(n.cur, n.amount)}</b></div>
      <div><span>Xizmat — xarajat</span><b class="rd">${sadvFmt(n.cur, n.fee)}</b><small>«${esc(FW_SYS_EXPENSE.transfer_fee)}»</small></div>
      <div class="tot"><span>Kassadan jami chiqadi</span><b>${sadvFmt(n.cur, n.total)}</b></div>` : '<p class="me-hint">Summani kiriting</p>';
    return;
  }
  const c = sadvCalc(document.getElementById('sadv-cny')?.value, document.getElementById('sadv-fee')?.value, document.getElementById('sadv-rate')?.value);
  el.innerHTML = c ? `<div><span>Taʼminotchiga zaklad</span><b>${CUR.fmtUsd(c.usd)}</b><small>${c.cny.toLocaleString('ru-RU')} ¥</small></div>
    <div><span>Xizmat — xarajat</span><b class="rd">${CUR.fmtUsd(c.feeUsd)}</b><small>«${esc(FW_SYS_EXPENSE.transfer_fee)}»</small></div>
    <div class="tot"><span>Kassadan jami chiqadi</span><b>${CUR.fmtUsd(c.total)}</b></div>` : '<p class="me-hint">Yuan summasi va kursni kiriting</p>';
}
async function sadvPay(sid) {
  if (SADV.busy) return;
  const s = S.suppliers.find(x => x.id === sid); if (!s) return;
  const cur = SADV.cur || 'CNY', boxCur = cur === 'UZS' ? 'UZS' : 'USD';
  const amtIn = +document.getElementById('sadv-cny')?.value, feePct = +document.getElementById('sadv-fee')?.value, rate = +document.getElementById('sadv-rate')?.value;
  const src = document.getElementById('sadv-b')?.value || '';
  const note = (document.getElementById('sadv-note')?.value || '').trim();
  const c = cur === 'CNY' ? sadvCalc(amtIn, feePct, rate) : null, n = cur === 'CNY' ? null : sadvCalcNative(cur, amtIn, feePct);
  if (cur === 'CNY' ? !c : !n) { toast(cur === 'CNY' ? 'Yuan summasi va kursni kiriting' : 'Summani kiriting', 'error'); return; }
  if (!(feePct >= 0 && feePct <= 5)) { toast("Xizmat foizi 0–5% oraligʻida boʻlishi kerak", 'error'); return; }
  const firma = src === 'firma', boxId = firma ? null : parseInt(src);
  const box = firma ? null : S.cashboxes.find(k => k.id === boxId);
  if (!firma && (!box || box.cur !== boxCur)) { toast(`${boxCur === 'USD' ? '$' : 'Soʻm'} kassani tanlang`, 'error'); return; }
  const total = cur === 'CNY' ? c.total : n.total, fmtBox = (v) => boxCur === 'USD' ? CUR.fmtUsd(v) : CUR.fmtUzs(v);
  if (!firma && total > (box.bal || 0) + (boxCur === 'USD' ? 0.005 : 0.5)) { toast(`⛔ «${box.name}»da mablagʻ yetarli emas (${fmtBox(box.bal || 0)})`, 'error'); return; }
  const what = cur === 'CNY' ? `${c.cny.toLocaleString('ru-RU')} ¥ = ${CUR.fmtUsd(c.usd)}\nXizmat (xarajat): ${CUR.fmtUsd(c.feeUsd)}` : `${sadvFmt(cur, n.amount)}\nXizmat (xarajat): ${sadvFmt(cur, n.fee)}`;
  if (!confirm(`${s.name}ga zaklad: ${what}\n${firma ? 'Bosh kassadan' : '«' + box.name + '» kassasidan'} jami: ${fmtBox(total)}\n\nTasdiqlaysizmi?`)) return;
  const sig = JSON.stringify([S.branch, sid, src, cur, amtIn, feePct, rate]);
  if (!SADV.key || SADV.key.sig !== sig) SADV.key = { sig, k: 'za' + uid() };
  SADV.busy = true; const btn = document.getElementById('sadv-go'); if (btn) btn.disabled = true;
  let d;
  const payload = cur === 'CNY' ? { cny: c.cny, rate } : { currency: cur, amount: n.amount };
  try { d = await sadvCall({ action: 'pay', suppId: sid, source: firma ? 'firma' : 'box', boxId, feePct, idemKey: SADV.key.k, note: note || null, ...payload }); }
  catch (e) { if (!e.retry) SADV.key = null; toast('⛔ ' + e.message, 'error'); return; }
  finally { SADV.busy = false; if (btn) btn.disabled = false; }
  SADV.key = null;
  const p = d.payment || {};
  if (p.balances && Object.keys(p.balances).length) { fwApplyCashBalances(p.balances); fwCashSeq++; }
  if (firma && typeof FK !== 'undefined') FK.loaded = false;
  SADV.bal[String(sid)] = +p.advanceUsd || sadvBal(sid);
  if (p.advanceUzs != null) SADV.balUzs[String(sid)] = +p.advanceUzs || 0;
  // Xizmat haqi — xarajat (kassa serverda allaqachon kamaygan; bu yozuv qayta kassa harakati qilmaydi)
  if (!p.replay && +p.feeUsd > 0) {
    const native = cur !== 'CNY';
    S.expenses.push({ id: uid(), date: td(), cat: FW_SYS_EXPENSE.transfer_fee, sysType: 'transfer_fee', amtUsd: +p.feeUsd,
      amount: native ? +p.fee : +p.feeUsd, cur: native ? cur : 'USD',
      desc: native ? `Zaklad: ${s.name} — ${sadvFmt(cur, +p.amount)} (${p.feePct}%)` : `Zaklad: ${s.name} — ${(+p.cny).toLocaleString('ru-RU')} ¥ (${p.feePct}%, kurs ${p.rate})`,
      person: s.name, boxId: firma ? null : boxId, turi: 'dokon', cashDone: true, locked: true, ...(firma ? { source: 'firma_kassa' } : {}) });
  }
  const given = cur === 'CNY' ? `${(+p.cny).toLocaleString('ru-RU')} ¥ = ${CUR.fmtUsd(+p.usd)}` : sadvFmt(cur, +p.amount);
  auditLog(`Zaklad: ${s.name} — ${given}, xizmat ${cur === 'CNY' ? CUR.fmtUsd(+p.feeUsd) : sadvFmt(cur, +p.fee)} (${firma ? 'Bosh kassa' : box.name})`);
  save(); closeModal(); if (S.page === 'taminotchilar') pgTaminotchilar();
  toast(p.replay ? "✅ Bu zaklad avval berilgan edi (takror yozilmadi)" : `✅ Zaklad berildi: ${given}`);
}

function openSuppAdvanceApply(sid) {
  const s = S.suppliers.find(x => x.id === sid); if (!s) return;
  const uz = sadvSuppUzs(s), a = uz ? sadvBalUzs(sid) : sadvBal(sid), d = uz ? Math.round(+s.debtUzs || 0) : Math.round((+s.debt || 0) * 100) / 100, def = Math.min(a, d);
  if (!(def > 0)) { toast("Qarz yoki zaklad yoʻq", 'error'); return; }
  const f = (v) => uz ? CUR.fmtUzs(v) : CUR.fmtUsd(v);
  SADV.key = null;
  modal(`
    <div class="modal-header"><div class="modal-title">Qarzni zakladdan yopish</div><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      ${meCard({ name: s.name, sub: `Zaklad ${f(a)} · qarz ${f(d)}`, kpi: f(def), kpiLabel: 'yopish mumkin', tone: 'pos' })}
      ${meField(`Summa (${uz ? 'soʻm' : '$'})`, `<input class="form-control" id="sadp-a" type="number" inputmode="decimal" step="${uz ? 1 : 0.01}" min="0" max="${def}" value="${uz ? def : def.toFixed(2)}">`, 'Qarzdan ham, zakladdan ham koʻp boʻlmaydi. Kassaga tegilmaydi — pul avval zaklad sifatida berilgan.')}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Bekor</button>
      <button class="btn btn-success" id="sadp-go" onclick="sadvApply(${sid})">✅ Yopish</button>
    </div>`);
}
async function sadvApply(sid) {
  if (SADV.busy) return;
  const s = S.suppliers.find(x => x.id === sid); if (!s) return;
  const uz = sadvSuppUzs(s), f = (v) => uz ? CUR.fmtUzs(v) : CUR.fmtUsd(v);
  const amt = uz ? Math.round(+document.getElementById('sadp-a')?.value || 0) : Math.round((+document.getElementById('sadp-a')?.value || 0) * 100) / 100;
  if (!(amt > 0)) { toast('Summa kiriting', 'error'); return; }
  if (uz ? (amt > sadvBalUzs(sid) + 0.5 || amt > (+s.debtUzs || 0) + 0.5) : (amt > sadvBal(sid) + 0.005 || amt > (+s.debt || 0) + 0.005)) { toast('⛔ Summa qarzdan yoki zakladdan koʻp', 'error'); return; }
  const sig = JSON.stringify([S.branch, sid, amt]);
  if (!SADV.key || SADV.key.sig !== sig) SADV.key = { sig, k: 'zp' + uid() };
  SADV.busy = true; const btn = document.getElementById('sadp-go'); if (btn) btn.disabled = true;
  let d;
  try { d = await sadvCall({ action: 'apply', suppId: sid, ...(uz ? { amountUzs: amt } : { amountUsd: amt }), idemKey: SADV.key.k }); }
  catch (e) { if (!e.retry) SADV.key = null; toast('⛔ ' + e.message, 'error'); return; }
  finally { SADV.busy = false; if (btn) btn.disabled = false; }
  SADV.key = null;
  const p = d.apply || {};
  if (p.supplierDebt != null) fwApplyLedger({ filial: S.branch, suppliers: { [sid]: { debt: +p.supplierDebt, paid: +p.supplierPaid, debtCur: p.supplierDebtCur, debtUzs: p.supplierDebtUzs } } });
  SADV.bal[String(sid)] = +p.advanceUsd || 0;
  if (p.advanceUzs != null) SADV.balUzs[String(sid)] = +p.advanceUzs || 0;
  const done = uz ? +p.appliedUzs || amt : +p.appliedUsd || amt, s2 = S.suppliers.find(x => x.id === sid) || s;
  auditLog(`Qarz zakladdan yopildi: ${s.name} — ${f(done)}`);
  save(); closeModal(); if (S.page === 'taminotchilar') pgTaminotchilar();
  toast(p.replay ? '✅ Avval bajarilgan edi (takror yozilmadi)' : `✅ ${f(done)} zakladdan yopildi. Qolgan qarz: ${typeof suppDebtTxt === 'function' ? suppDebtTxt(s2) : CUR.fmtUsd(+p.supplierDebt || 0)}`);
}
