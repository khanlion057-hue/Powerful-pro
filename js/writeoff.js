// ════════════════════════════════════════════════════════════
// HISOBDAN CHIQARISH (v23.6, 29-migratsiya) — Qaytarishlar bo'limida.
// Buzilgan, muddati o'tgan, singan, yo'qolgan tovar ombordan chiqariladi. Bulut rejimida ombor, hujjat va
// (konsignatsiya) qarz — SERVERDA bitta tranzaksiyada (stock-writeoff), zarar tannarx bo'yicha serverda
// hisoblanadi. Zarar sof foydadan ayiriladi (fwWriteoffLoss — hisobot, hamkorlar foydasi, kunlik hisob).
// Kassaga tegmaydi. Bekor qilish — aynan o'sha partiyalarga qaytaradi.
// ════════════════════════════════════════════════════════════
const WO_REASONS = {
  damaged: ['Buzilgan', 'warning', 'amber'],
  expired: ["Muddati o'tgan", 'hourglass', 'red'],
  broken:  ['Singan', 'deleteSweep', 'pink'],
  lost:    ["Yo'qolgan", 'search', 'purple'],
  other:   ['Boshqa', 'info', 'sky'],
};
function woList() { if (!Array.isArray(S.writeoffs)) S.writeoffs = []; return S.writeoffs; }
function woActive(w) { return w && w.status !== 'cancelled'; }
// Davr bo'yicha zarar ($) — sof foyda hisoblarida ishlatiladi
function fwWriteoffLoss(a, b) {
  return woList().filter(w => woActive(w) && (!a || String(w.date) >= a) && (!b || String(w.date) <= b))
    .reduce((s, w) => s + (+w.totalCostUsd || 0), 0);
}
function woCan() { return !CURRENT_USER || CURRENT_USER.kind === 'owner' || hasPerm('ombor.writeoff') || hasPerm('ombor.edit'); }

const WO = { per: 'month', reason: 'all' };
function woRange() {
  const t = td();
  if (WO.per === 'today') return [t, t];
  if (WO.per === '10') return [daysAgo(9), t];
  if (WO.per === 'month') return [t.slice(0, 8) + '01', t];
  return ['', ''];
}
function woSheet() {
  const [a, b] = woRange();
  const inPer = woList().filter(w => (!a || String(w.date) >= a) && (!b || String(w.date) <= b));
  const docs = inPer.filter(w => WO.reason === 'all' || w.reason === WO.reason);
  const act = inPer.filter(woActive);
  const loss = act.reduce((s, w) => s + (+w.totalCostUsd || 0), 0);
  const units = act.reduce((s, w) => s + (+w.units || 0), 0);
  const canc = inPer.length - act.length;
  const seg = [['today', 'Bugun'], ['10', '10 kun'], ['month', 'Oy'], ['all', 'Hammasi']];
  const chip = (k, l) => `<button type="button" class="wo-chip${WO.reason === k ? ' on' : ''}" onclick="WO.reason='${k}';woSheet()">${l}</button>`;
  const badge = WO.per === 'today' ? a.split('-').reverse().join('.') : WO.per === 'all' ? 'Barchasi' : `${(a || '').slice(5).split('-').reverse().join('.')}–${b.slice(5).split('-').reverse().join('.')}`;
  const body = `
    <section class="ox-hero fw-hero wo-hero" style="--hc:var(--red);margin:0">
      <div class="ox-hero-top"><span>Davr boʻyicha zarar</span><span class="ox-date">${esc(badge)}</span></div>
      <div class="ox-hero-big" style="color:var(--red)">${CUR.fmtUsd(loss)}</div>
      <div class="ox-hero-cols" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <div><b>${act.length}</b><span>Hujjatlar</span></div><div><b>${fwFmtNumStr(Math.round(units * 100) / 100)}</b><span>Birlik</span></div><div><b>${canc}</b><span>Bekor qilingan</span></div>
      </div>
    </section>
    ${woCan() ? `<button class="wo-cta" onclick="woNew()">${ICONF.add}<span>Mahsulotni hisobdan chiqarish</span></button>` : ''}
    <div class="bs-seg ds-seg">${seg.map(([v, l]) => `<button type="button" class="${WO.per === v ? 'on' : ''}" onclick="WO.per='${v}';woSheet()">${l}</button>`).join('')}</div>
    <div class="wo-chips">${chip('all', 'Barcha sabablar')}${Object.entries(WO_REASONS).map(([k, [l]]) => chip(k, l)).join('')}</div>
    <div class="wo-hh"><div><b>Hisobdan chiqarishlar tarixi</b><small>Tarkibini koʻrish uchun hujjatni bosing</small></div><span class="wo-cnt">${docs.length}</span></div>
    ${docs.length ? `<div class="wo-list">${docs.map(woRow).join('')}</div>` : `<p class="wo-empty">Davr uchun hisobdan chiqarishlar boʻlmagan</p>`}`;
  const box = document.querySelector('#bs-ov .bs-body');
  if (box && box.querySelector('.wo-hero')) { box.innerHTML = body; return; }
  openSheet({ ic: 'deleteSweep', c: 'red', title: 'Hisobdan chiqarish', sub: 'Buzilgan, muddati oʻtgan, singan yoki yoʻqolgan tovar', body });
}
function woRow(w) {
  const [l, ic, c] = WO_REASONS[w.reason] || WO_REASONS.other;
  const names = (w.items || []).map(i => i.name || i.sku).filter(Boolean);
  return `<button type="button" class="wo-row${woActive(w) ? '' : ' off'}" onclick="woDoc('${escJsAttr(w.id)}')">
    <span class="wo-ic" style="--c:var(--${c})">${ICONF[ic] || ''}</span>
    <span class="wo-t"><b>${esc(w.docNo || w.id)} · ${l}</b><small>${esc(fmtD(w.date))} · ${esc(names.slice(0, 2).join(', '))}${names.length > 2 ? '…' : ''}</small></span>
    <span class="wo-v"><b>${woActive(w) ? '−' : ''}${CUR.fmtUsd(+w.totalCostUsd || 0)}</b><small>${woActive(w) ? `${fwFmtNumStr(+w.units || 0)} birlik` : 'Bekor qilingan'}</small></span></button>`;
}
function woDoc(id) {
  const w = woList().find(x => String(x.id) === String(id)); if (!w) return;
  const [l, ic, c] = WO_REASONS[w.reason] || WO_REASONS.other;
  openSheet({ ic, c, title: `${esc(w.docNo || w.id)} — ${l}`, sub: `${fmtD(w.date)}${w.staffName ? ' · ' + esc(w.staffName) : ''}`,
    body: `<div class="bs-card">${(w.items || []).map(i => `<div class="wo-li"><span><b>${esc(i.name || '—')}</b><small>${esc(i.sku || '')}</small></span>
        <span class="wo-li-v"><b>${fwFmtNumStr(+i.qty || 0)} dona</b><small>${CUR.fmtUsd(+i.cost || 0)}</small></span></div>`).join('')}
      <div class="wo-li tot"><span><b>Jami zarar</b></span><b style="color:var(--red)">${CUR.fmtUsd(+w.totalCostUsd || 0)}</b></div></div>
      ${w.note ? `<p class="bs-info">${ICONF.info}<span>${esc(w.note)}</span></p>` : ''}
      ${woActive(w) ? '' : `<p class="bs-info">${ICONF.warning}<span>Bekor qilingan${w.cancelStaff ? ': ' + esc(w.cancelStaff) : ''}${w.cancelNote ? ' — ' + esc(w.cancelNote) : ''}. Tovar omborga qaytarilgan.</span></p>`}`,
    foot: `<button class="bs-btn ghost" onclick="woSheet()">Orqaga</button>${woActive(w) && woCan() ? `<button class="bs-btn danger" onclick="woCancel('${escJsAttr(w.id)}')">Bekor qilish</button>` : ''}` });
}

// ── Yangi hujjat ──
let WO_NEW = null;
function woNew() {
  WO_NEW = { reason: 'damaged', note: '', lines: [], q: '' };
  woNewRender();
}
function woNewRender() {
  const N = WO_NEW; if (!N) return;
  const est = N.lines.reduce((s, l) => s + l.qty * woCostEst(l.pid, l.qty), 0);
  const body = `
    <div class="wo-chips">${Object.entries(WO_REASONS).map(([k, [l]]) => `<button type="button" class="wo-chip${N.reason === k ? ' on' : ''}" onclick="WO_NEW.reason='${k}';woNewRender()">${l}</button>`).join('')}</div>
    <div class="kr-search" style="margin:0">${ICONF.search}<input type="search" id="wo-q" placeholder="Mahsulot nomi, kodi yoki shtrix-kodi" autocomplete="off" value="${esc(N.q)}" oninput="WO_NEW.q=this.value;woFind()"></div>
    <div id="wo-res" class="wo-res"></div>
    <div class="wo-hh"><div><b>Chiqariladigan tovarlar</b><small>Soni ombordagi qoldiqdan oshmaydi</small></div><span class="wo-cnt">${N.lines.length}</span></div>
    <div class="wo-list">${N.lines.length ? N.lines.map((l, i) => {
      const st = getStock(l.pid);
      return `<div class="wo-line"><span class="wo-t"><b>${esc(l.name)}</b><small>${esc(l.sku || '')} · Omborda: ${fwFmtNumStr(st)} · ~${CUR.fmtUsd(woCostEst(l.pid, l.qty))}/dona</small></span>
        <span class="wo-step"><button type="button" onclick="woQty(${i},-1)">−</button><input type="number" min="0.001" step="any" value="${l.qty}" onchange="woQtySet(${i},this.value)"><button type="button" onclick="woQty(${i},1)">+</button></span>
        <button type="button" class="wo-x" onclick="WO_NEW.lines.splice(${i},1);woNewRender()" aria-label="Olib tashlash">${ICONF.close}</button></div>`;
    }).join('') : '<p class="wo-empty">Yuqoridan mahsulotni qidirib qoʻshing</p>'}</div>
    <label class="bs-lbl" for="wo-note">Izoh (ixtiyoriy)</label>
    <textarea class="bs-in" id="wo-note" rows="2" maxlength="500" placeholder="Masalan: tashishda singan, qadoq ochilgan" oninput="WO_NEW.note=this.value">${esc(N.note)}</textarea>
    <p class="bs-info">${ICONF.info}<span>Zarar tannarx (FIFO) boʻyicha hisoblanadi va <b>sof foydadan ayiriladi</b>. Kassaga tegmaydi. Kerak boʻlsa hujjatni bekor qilib, tovarni omborga qaytarish mumkin.</span></p>`;
  openSheet({ ic: 'add', c: 'red', title: 'Mahsulotni hisobdan chiqarish', sub: WO_REASONS[N.reason][0],
    body, foot: `<button class="bs-btn ghost" onclick="woSheet()">Bekor</button><button class="bs-btn danger" id="wo-go" onclick="woCommit()" ${N.lines.length ? '' : 'disabled'}>Chiqarish${est > 0 ? ' · −' + CUR.fmtUsd(est) : ''}</button>` });
  woFind();
}
function woCostEst(pid, qty) {   // ko'rsatish uchun taxmin (haqiqiy zarar — serverda, FIFO)
  let rem = qty, cost = 0;
  S.batches.filter(b => b.pid === pid && b.qty > b.sold && b.status !== 'empty' && b.status !== 'transit')
    .sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(b => { if (rem <= 0) return; const t = Math.min(b.qty - b.sold, rem); cost += t * (+b.costUsd || 0); rem -= t; });
  return qty > 0 ? cost / Math.max(qty - Math.max(rem, 0), 1e-9) : 0;
}
function woFind() {
  const el = document.getElementById('wo-res'); if (!el || !WO_NEW) return;
  const q = (WO_NEW.q || '').trim();
  if (!q) { el.innerHTML = ''; return; }
  const list = productSearchMatch(branchVisibleProducts(S.products).filter(p => !p.archived && getStock(p.id) > 0), q).slice(0, 8);
  el.innerHTML = list.length ? list.map(p => `<button type="button" class="wo-pick" onclick="woAdd(${p.id})"><span><b>${esc(p.name)}</b><small>${esc(p.sku || '')}</small></span><em>${fwFmtNumStr(getStock(p.id))} ${esc(p.unit || 'dona')}</em></button>`).join('')
    : '<p class="wo-empty">Omborda bor mahsulot topilmadi</p>';
}
function woAdd(pid) {
  const p = S.products.find(x => x.id === pid); if (!p || !WO_NEW) return;
  const ex = WO_NEW.lines.find(l => l.pid === pid);
  if (ex) ex.qty = Math.min(ex.qty + 1, getStock(pid)); else WO_NEW.lines.push({ pid, name: p.name, sku: p.sku || '', qty: 1 });
  WO_NEW.q = ''; woNewRender();
}
function woQty(i, d) { const l = WO_NEW && WO_NEW.lines[i]; if (!l) return; l.qty = Math.max(1, Math.min(getStock(l.pid), Math.round((l.qty + d) * 1000) / 1000)); woNewRender(); }
function woQtySet(i, v) { const l = WO_NEW && WO_NEW.lines[i]; if (!l) return; const n = parseFloat(v); l.qty = Math.max(0.001, Math.min(getStock(l.pid), isFinite(n) ? n : 1)); woNewRender(); }

async function woCommit() {
  const N = WO_NEW; if (!N || !N.lines.length) return;
  for (const l of N.lines) {
    if (!(l.qty > 0)) { toast('Soni musbat boʻlishi kerak', 'error'); return; }
    if (l.qty > getStock(l.pid) + 1e-9) { toast(`⛔ «${l.name}» — omborda ${getStock(l.pid)} dona bor`, 'error'); return; }
  }
  const items = N.lines.map(l => ({ pid: l.pid, qty: l.qty, sku: l.sku, name: l.name }));
  const [localId] = fwStableIds('writeoff', { items, reason: N.reason }, 1);
  const docNo = fwNextDocNo('HC-', woList(), 'docNo');
  const btn = document.getElementById('wo-go'); if (btn) btn.disabled = true;
  let doc;
  if (fwLedgerRemote()) {
    let r;
    try { r = await fwLedgerCall('stock-writeoff', { action: 'create', doc: { localId: 'wo' + localId, docNo, reason: N.reason, note: N.note || null, date: td(), items } }, { items, reason: N.reason }); }
    catch (e) { toast('⛔ ' + e.message, 'error'); if (btn) btn.disabled = false; return; }
    doc = { id: r.localId, docNo, reason: N.reason, note: N.note || '', date: td(), status: 'active', units: +r.units || 0, totalCostUsd: +r.totalCostUsd || 0,
      staffName: CURRENT_USER?.name || 'Admin', items: (r.items || []).map(i => ({ pid: +i.pid, sku: i.sku || '', name: i.name || '', qty: +i.qty || 0, cost: +i.cost || 0 })) };
  } else {
    // Oflayn / lokal rejim: FIFO shu yerda (bulutga ulanganda server haqiqiy manba bo'ladi)
    const out = [];
    for (const l of items) {
      let rem = l.qty, cost = 0; const allocs = [];
      S.batches.filter(b => b.pid === l.pid && b.qty > b.sold && b.status !== 'empty' && b.status !== 'transit')
        .sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(b => {
          if (rem <= 1e-9) return; const t = Math.min(b.qty - b.sold, rem);
          b.sold += t; rem -= t; cost += t * (+b.costUsd || 0); allocs.push({ batchId: b.id, take: t });
          if (b.qty - b.sold <= 1e-9) b.status = 'empty';
          if (b.consignment && b.suppId) { const sp = S.suppliers.find(s => s.id === b.suppId); if (sp) sp.debt = (sp.debt || 0) + t * (+b.costUsd || 0); }
        });
      out.push({ ...l, cost, allocs });
    }
    doc = { id: 'wo' + localId, docNo, reason: N.reason, note: N.note || '', date: td(), status: 'active', units: items.reduce((s, i) => s + i.qty, 0),
      totalCostUsd: Math.round(out.reduce((s, i) => s + i.cost, 0) * 10000) / 10000, staffName: CURRENT_USER?.name || 'Admin', items: out, local: true };
  }
  woList().unshift(doc);
  auditLog(`Hisobdan chiqarildi: ${docNo} (${WO_REASONS[N.reason][0]}) — ${CUR.fmtUsd(doc.totalCostUsd)}`);
  WO_NEW = null; save();
  toast(`✅ Hisobdan chiqarildi — zarar ${CUR.fmtUsd(doc.totalCostUsd)}`, 'warning');
  WO.per = 'today'; WO.reason = 'all'; woSheet();
  if (S.page === 'qaytarish') pgQaytarish();
}

async function woCancel(id) {
  const w = woList().find(x => String(x.id) === String(id)); if (!w || !woActive(w)) return;
  if (!confirm(`${w.docNo || w.id} bekor qilinsinmi? Tovar omborga qaytariladi, zarar foydadan olib tashlanadi.`)) return;
  if (fwLedgerRemote() && !w.local) {
    try { await fwLedgerCall('stock-writeoff', { action: 'cancel', localId: String(w.id), note: null }, { cancel: String(w.id) }); }
    catch (e) { toast('⛔ ' + e.message, 'error'); return; }
  } else {
    (w.items || []).forEach(i => (i.allocs || []).forEach(a => {
      const b = S.batches.find(x => String(x.id) === String(a.batchId)); if (!b) return;
      b.sold = Math.max(0, b.sold - a.take); if (b.qty - b.sold > 1e-9 && b.status === 'empty') b.status = 'active';
      if (b.consignment && b.suppId) { const sp = S.suppliers.find(s => s.id === b.suppId); if (sp) sp.debt = Math.max(0, (sp.debt || 0) - a.take * (+b.costUsd || 0)); }
    }));
  }
  w.status = 'cancelled'; w.cancelStaff = CURRENT_USER?.name || 'Admin'; w.cancelledAt = new Date().toISOString();
  auditLog(`Hisobdan chiqarish bekor qilindi: ${w.docNo || w.id}`);
  save(); toast('Bekor qilindi — tovar omborga qaytdi'); woDoc(id);
  if (S.page === 'qaytarish') pgQaytarish();
}
