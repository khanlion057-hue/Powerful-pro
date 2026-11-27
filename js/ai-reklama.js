// v25.8 — AI-REKLAMA (brauzer): post (1:1) va Story/Reels (9:16) — canvas, video (MP4), kuy; UI — «Onlayn-doʻkon» → «AI-reklama».
// Server: /.netlify/functions/ai-ads (narx, qoldiq, matn — SERVERDA; brauzer narx hisoblamaydi va tahrirlamaydi).
// Brauzer tashqi saytga chiqmaydi (CSP o'zgarmaydi): rasm CORS bilan yuklanmasa — server proksi (ai-ads:img).
// Video va post rasmlari doimiy saqlanmaydi.
/* global S, esc, toast, authFetch, hasPerm, CURRENT_USER, openSheet, closeSheet, ICONF, shopCfg, FW_BRAND, AIR_TEMPLATES, AIR_LABELS */

// ════════════════════════════════════════════════════════════
// 1. MEXANIZM — shrift, rasm, matn, chizish
// ════════════════════════════════════════════════════════════
const AIR_FONT = 'FwAdInter';
const AIR_FF = (w, px) => `${w} ${Math.round(px)}px "${AIR_FONT}", Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
// Inter (OFL) — loyihaning o'zida (assets/ai-reklama/fonts): oflaynda va APK'da ham bir xil; faqat shu modul ochilganda yuklanadi
const AIR_FONT_FILES = [
  ['inter-latin.woff2', 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'],
  ['inter-latin-ext.woff2', 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF'],
  ['inter-cyrillic.woff2', 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116'],
  ['inter-cyrillic-ext.woff2', 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F'],
];
let _airFontP = null;
// Canvas'ga chizishdan OLDIN shrift to'liq yuklanadi (aks holda birinchi post zaxira shrift bilan chiqadi). true — yuklandi
function airLoadFonts() {
  if (_airFontP) return _airFontP;
  _airFontP = (async () => {
    if (typeof FontFace !== 'function' || !document.fonts) return false;
    for (const [f, range] of AIR_FONT_FILES) {
      try { const face = new FontFace(AIR_FONT, `url(assets/ai-reklama/fonts/${f}) format('woff2')`, { weight: '100 900', unicodeRange: range, display: 'block' }); document.fonts.add(face); } catch (_) { /* eski brauzer */ }
    }
    const sample = 'Aa Oʻoʻ Gʻgʻ ʼ Жж Ққ Ғғ Ҳҳ $0';
    await Promise.all(['400', '600', '700', '800'].map((w) => document.fonts.load(AIR_FF(w, 48).split(',')[0], sample).catch(() => null)));
    return document.fonts.check(`800 48px "${AIR_FONT}"`, 'Oʻgʻʼ Жж');
  })().catch(() => false);
  return _airFontP;
}

// Rasm: avval CORS bilan to'g'ridan (Supabase Storage — CORS bor); bo'lmasa server proksi; u ham bo'lmasa — aniq xato (jim emas)
const _airImgCache = new Map();
function _airImgLoad(src, cors) {
  return new Promise((res, rej) => { const im = new Image(); if (cors) im.crossOrigin = 'anonymous'; im.decoding = 'async';
    im.onload = () => res(im); im.onerror = () => rej(new Error('img')); im.src = src; });
}
function airGetImage(url, pid, idx) {
  const key = String(url || '');
  if (_airImgCache.has(key)) return _airImgCache.get(key);
  const p = (async () => {
    const local = /^[\w][\w./-]*$/.test(key) && !key.includes('..');   // o'z saytidagi nisbiy yo'l (logo, sinov rasmi)
    if (!local && !/^(https:|data:image\/|blob:)/.test(key)) throw new Error('rasm havolasi noto\'g\'ri');
    try { return await _airImgLoad(key, /^https:/.test(key)); } catch (_) { /* CORS yo'q — proksi */ }
    if (pid == null) throw new Error('rasm yuklanmadi');
    const r = await airApi('img', { pid, idx: idx || 0 });
    if (!r.ok || !r.data || !/^data:image\//.test(String(r.data.dataUrl || ''))) throw new Error((r.data && r.data.error) || 'rasm yuklanmadi');
    return _airImgLoad(r.data.dataUrl, false);
  })();
  _airImgCache.set(key, p);
  p.catch(() => _airImgCache.delete(key));
  return p;
}

// Matnni kenglikka sig'dirish: avval katta o'lchamlardan, maxLines qatorga; sig'masa — eng kichik o'lchamda «…»
function airFitLines(ctx, text, maxW, maxLines, sizes, weight) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const wrap = (size) => {
    ctx.font = AIR_FF(weight, size);
    const lines = []; let cur = '';
    for (const w0 of words) {
      let w = w0;
      // bitta so'z qatordan uzun — harf bo'yicha bo'linadi
      while (ctx.measureText(w).width > maxW) {
        let k = w.length; while (k > 1 && ctx.measureText(w.slice(0, k)).width > maxW) k--;
        if (cur) { lines.push(cur); cur = ''; }
        lines.push(w.slice(0, k)); w = w.slice(k);
      }
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width <= maxW) cur = t; else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines;
  };
  for (const s of sizes) { const l = wrap(s); if (l.length <= maxLines) return { lines: l, size: s, ellipsis: false }; }
  const size = sizes[sizes.length - 1], all = wrap(size); ctx.font = AIR_FF(weight, size);
  const lines = all.slice(0, maxLines);
  let last = lines[maxLines - 1] + '…';
  while (last.length > 1 && ctx.measureText(last).width > maxW) last = last.slice(0, -2).trimEnd() + '…';
  lines[maxLines - 1] = last;
  return { lines, size, ellipsis: true };
}

// ── chizish yordamchilari ──
function _rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function _grad(ctx, x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach((c, i) => g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c)); return g; }
const _clamp = (v) => Math.max(0, Math.min(1, v));
const _easeOut = (x) => 1 - Math.pow(1 - x, 3);
const _easeBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
// animatsiya qiymati: t=null — statik (to'liq ko'rinish)
const _A = (t, s, l, ease) => (t == null ? 1 : (ease || _easeOut)(_clamp((t - s) / l)));

function _bg(ctx, tpl, W, H, t) {
  const st = tpl.bg.stops;
  if (tpl.bg.type === 'solid') ctx.fillStyle = st[0];
  else if (tpl.bg.type === 'radial') { const g = ctx.createRadialGradient(W * 0.5, H * 0.3, 40, W * 0.5, H * 0.45, Math.max(W, H) * 0.85); g.addColorStop(0, st[0]); g.addColorStop(1, st[1]); ctx.fillStyle = g; }
  else ctx.fillStyle = _grad(ctx, 0, 0, W, H, st);
  ctx.fillRect(0, 0, W, H);
  // yumshoq rangli dog'lar (fon tekis ko'rinmasin); videoda sekin siljiydi
  const k = t == null ? 0 : t * 0.25;
  [[0.15 + 0.05 * Math.sin(k), 0.12, tpl.glow[0]], [0.9 - 0.05 * Math.cos(k), 0.72, tpl.glow[1]]].forEach(([fx, fy, c]) => {
    const g = ctx.createRadialGradient(W * fx, H * fy, 10, W * fx, H * fy, W * 0.55);
    g.addColorStop(0, c + (tpl.dark ? '55' : '66')); g.addColorStop(1, c + '00'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  });
}
// Mahsulot kartochkasi: oq, yumaloq, yumshoq soya; rasm ichida (contain) + Ken Burns
function _card(ctx, box, img, tpl, t, dur, opt = {}) {
  const a = _A(t, opt.delay || 0, 0.6), sc = 0.94 + 0.06 * a;
  ctx.save(); ctx.globalAlpha = a;
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
  ctx.save(); ctx.shadowColor = tpl.dark ? 'rgba(0,0,0,.45)' : 'rgba(15,23,42,.18)'; ctx.shadowBlur = 70; ctx.shadowOffsetY = 28;
  _rr(ctx, box.x, box.y, box.w, box.h, box.r || 56); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.restore();
  _rr(ctx, box.x, box.y, box.w, box.h, box.r || 56); ctx.save(); ctx.clip();
  const pad = box.w * (opt.pad != null ? opt.pad : 0.07);
  if (img && img.naturalWidth) {
    const zoom = (opt.zoom || 1) * (t == null ? 1 : 1 + 0.07 * _clamp(t / (dur || 10)));
    const iw = img.naturalWidth, ih = img.naturalHeight, bw = box.w - pad * 2, bh = box.h - pad * 2;
    const s = Math.min(bw / iw, bh / ih) * zoom, dw = iw * s, dh = ih * s;
    const panX = t == null ? 0 : Math.sin((t / (dur || 10)) * Math.PI) * box.w * 0.015;
    ctx.drawImage(img, box.x + (box.w - dw) / 2 + panX, box.y + (box.h - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = '#f1f5f9'; ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = box.w * 0.012; const m = box.w * 0.32;
    _rr(ctx, box.x + m, box.y + box.h / 2 - m * 0.45, box.w - 2 * m, m * 0.9, 24); ctx.stroke();
  }
  ctx.restore(); ctx.restore();
}
// Narx: raqam katta, valyuta kichik; kenglikka sig'masa kichrayadi
function _price(ctx, x, y, line, size, color, maxW, align) {
  const m = /^(.*?)(\s*soʻm|\s*сум)$/.exec(line || ''), dollar = /^\$/.test(line || '');
  const main = m ? m[1] : dollar ? line.slice(1) : String(line || ''), cur = m ? m[2].trim() : dollar ? '$' : '';
  let s = size;
  const widths = () => { ctx.font = AIR_FF(800, s); const a = ctx.measureText(main).width; ctx.font = AIR_FF(700, s * 0.46); const b = cur ? ctx.measureText(cur).width + s * 0.14 : 0; return [a, b]; };
  let [wa, wb] = widths();
  while (wa + wb > maxW && s > 30) { s -= 4; [wa, wb] = widths(); }
  const total = wa + wb, x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
  if (dollar) { ctx.font = AIR_FF(700, s * 0.46); ctx.fillText('$', x0, y - s * 0.38); ctx.font = AIR_FF(800, s); ctx.fillText(main, x0 + wb, y); }
  else { ctx.font = AIR_FF(800, s); ctx.fillText(main, x0, y); if (cur) { ctx.font = AIR_FF(700, s * 0.46); ctx.fillText(cur, x0 + wa + s * 0.14, y); } }
  return { w: total, size: s, x0 };
}
function _old(ctx, x, y, line, size, color, align) {
  ctx.font = AIR_FF(600, size); ctx.fillStyle = color; ctx.textAlign = align || 'left';
  const w = ctx.measureText(line).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.fillText(line, x, y); ctx.textAlign = 'left';
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(3, size * 0.08); ctx.beginPath(); ctx.moveTo(x0 - 4, y - size * 0.32); ctx.lineTo(x0 + w + 4, y - size * 0.32); ctx.stroke();
}
function _badge(ctx, kind, d, tpl, cx, cy, t, beat, L) {
  const a = _A(t, beat * 2, 0.45, _easeBack);
  if (a <= 0) return;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(a, a);
  if (kind === 'discount' && d.pct > 0) {
    const r = 92; ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = _grad(ctx, -r, -r, r, r, tpl.badgeBg); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.fillStyle = tpl.badgeInk; ctx.textAlign = 'center'; ctx.font = AIR_FF(800, 62); ctx.fillText('−' + d.pct + '%', 0, 22); ctx.textAlign = 'left';
  } else {
    const txt = kind === 'discount' ? (L.special) : (L[kind] || L.special);
    ctx.font = AIR_FF(800, 34); const w = ctx.measureText(txt).width + 64, h = 70;
    ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    _rr(ctx, 0, -h / 2, w, h, h / 2); ctx.fillStyle = _grad(ctx, 0, 0, w, 0, tpl.badgeBg); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.fillStyle = tpl.badgeInk; ctx.fillText(txt, 32, 12);
  }
  ctx.restore();
}
function _cta(ctx, cx, y, tpl, L, t, dur) {
  const a = t == null ? 1 : _A(t, Math.max(0.5, dur - 4), 0.5);
  if (a <= 0) return;
  const pulse = t == null ? 1 : 1 + 0.04 * Math.sin(t * 6);
  ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, y); ctx.scale(pulse, pulse);
  ctx.font = AIR_FF(800, 46); const txt = L.order + '  →', w = ctx.measureText(txt).width + 120, h = 104;
  _rr(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = tpl.priceOnPill ? '#ffffff' : _grad(ctx, -w / 2, 0, w / 2, 0, tpl.accent); ctx.fill();
  ctx.fillStyle = tpl.priceOnPill ? '#9a3412' : (tpl.id === 'minimal' || tpl.id === 'top' || tpl.id === 'brend' ? (tpl.id === 'minimal' ? '#ffffff' : '#1f1300') : '#ffffff');
  ctx.textAlign = 'center'; ctx.fillText(txt, 0, 16); ctx.textAlign = 'left'; ctx.restore();
}
function _header(ctx, d, tpl, Wn, center) {
  ctx.fillStyle = tpl.sub; ctx.font = AIR_FF(700, 30); ctx.textAlign = center ? 'center' : 'left';
  const name = String(d.shopName || '').toUpperCase().slice(0, 32);
  if (!center) ctx.fillText(name, 64, 92);
  ctx.textAlign = 'left';
  // Rangli fonda (logoPlate) logo oq tagliqda — har qanday fonda o'qiladi
  const logo = tpl.logoPlate ? d.logo : tpl.dark ? (d.logoDark || d.logo) : d.logo;
  if (logo && logo.naturalWidth && !center) {
    const h = 70, w = Math.min(260, logo.naturalWidth * h / logo.naturalHeight), x = Wn - 64 - w;
    if (tpl.logoPlate) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.15)'; ctx.shadowBlur = 16; _rr(ctx, x - 18, 30, w + 36, h + 20, 24); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.restore(); }
    ctx.drawImage(logo, x, 40, w, h);
  }
}

// Asosiy chizish. d: { name, title, priceLine, oldLine, pct, reason, shopName, lang, imgs:[Image], logo, logoDark }
// t — soniya (video), null — statik; dur — video uzunligi; bpm — kuy tempi (animatsiya urg'ulari shunga mos)
function airDraw(ctx, W, H, tpl, d, t = null, dur = 10, bpm = 110) {
  const sc = W / 1080, Wn = 1080, Hn = H / sc, tall = Hn > 1300, beat = 60 / bpm;
  const L = (window.AIR_LABELS || {})[d.lang === 'ru' ? 'ru' : 'uz'];
  // v25.8: nishon — mahsulot sababiga qarab (chegirma/yangi/top/maxsus); shablonning o'z nishoni — sabab noma'lum bo'lsa
  const byReason = { discount: 'discount', new: 'new', top: 'top', stuck: 'special' }[d.reason];
  let kind = byReason || (tpl.badge === 'auto' ? 'special' : tpl.badge);
  if (kind === 'discount' && !(d.pct > 0)) kind = 'special';
  const circle = kind === 'discount';
  // Doira — kartochka burchagidan ichkarida (logo bilan to'qnashmaydi); yorliq — chap yuqorida, kartochka ichida
  const badgeAt = (card) => circle ? _badge(ctx, kind, d, tpl, card.x + card.w - 74, card.y + 84, t, beat, L)
    : _badge(ctx, kind, d, tpl, card.x + 32, card.y + 64, t, beat, L);
  ctx.save(); ctx.setTransform(sc, 0, 0, sc, 0, 0); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  _bg(ctx, tpl, Wn, Hn, t);
  const img0 = d.imgs && d.imgs[0], img1 = (d.imgs && d.imgs[1]) || img0;
  const titleA = _A(t, 0.5, 0.6), nameA = _A(t, 0.8, 0.6), oldA = _A(t, 1.4, 0.5), priceA = _A(t, beat * 4, 0.5, _easeBack);
  const txt = (s, x, y, size, w, color, a, align, maxW) => {
    if (a <= 0 || !s) return; ctx.save(); ctx.globalAlpha = _clamp(a); ctx.translate(0, (1 - _clamp(a)) * 30);
    ctx.font = AIR_FF(w, size); ctx.fillStyle = color; ctx.textAlign = align || 'left';
    let v = s; if (maxW) { while (v.length > 1 && ctx.measureText(v).width > maxW) v = v.slice(0, -2).trimEnd() + '…'; }
    ctx.fillText(v, x, y); ctx.restore();
  };
  const nameBlock = (x, y, maxW, sizes, color, align, lh) => {
    const f = airFitLines(ctx, d.name, maxW, 2, sizes, 700);
    if (nameA > 0) { ctx.save(); ctx.globalAlpha = nameA; ctx.font = AIR_FF(700, f.size); ctx.fillStyle = color; ctx.textAlign = align || 'left';
      f.lines.forEach((l, i) => ctx.fillText(l, x, y + i * f.size * (lh || 1.22))); ctx.restore(); }
    return f;
  };
  const priceBlock = (x, y, size, maxW, align, colorOld) => {
    if (tpl.priceOnPill) return pillPrice(x, y, size, maxW, align);
    if (d.oldLine && oldA > 0) { ctx.save(); ctx.globalAlpha = oldA; _old(ctx, x, y - size * 0.98, d.oldLine, size * 0.42, colorOld || tpl.sub, align); ctx.restore(); }
    if (priceA > 0) {
      ctx.save(); const s = priceA; ctx.translate(x, y - size * 0.35); ctx.scale(s, s); ctx.translate(-x, -(y - size * 0.35));
      _price(ctx, x, y, d.priceLine, size, tpl.priceInk, maxW, align);
      ctx.restore();
    }
  };
  // Narx oq "tabletka" ichida (Maxsus taklif). Eski narx — tabletka o'ngida (sig'sa), aks holda tepasida, to'qnashmaydi
  const pillPrice = (x, y, size, maxW, align) => {
    // Tabletka kengligi — _price bilan bir xil o'lchov (raqam katta + valyuta kichik)
    ctx.save(); ctx.globalAlpha = 0; const pw = _price(ctx, 0, -9999, d.priceLine, size, '#000', maxW, 'left').w; ctx.restore();
    const w = pw + 96, h = size * 1.42, x0 = align === 'center' ? x - w / 2 : x - 44, top = y - size * 1.04;
    let oldX = null, oldY = top - size * 0.24;
    if (d.oldLine) { ctx.font = AIR_FF(600, size * 0.4); const ow = ctx.measureText(d.oldLine).width; if (align !== 'center' && x0 + w + 28 + ow < Wn - 60) { oldX = x0 + w + 28; oldY = top + h / 2 + size * 0.14; } }
    if (d.oldLine && oldA > 0) { ctx.save(); ctx.globalAlpha = oldA; _old(ctx, oldX != null ? oldX : (align === 'center' ? x : x0 + 8), oldY, d.oldLine, size * 0.4, tpl.sub, oldX != null ? 'left' : align); ctx.restore(); }
    if (priceA > 0) {
      ctx.save(); const s = priceA, cy = top + h / 2; ctx.translate(x0 + w / 2, cy); ctx.scale(s, s); ctx.translate(-(x0 + w / 2), -cy);
      ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
      _rr(ctx, x0, top, w, h, h / 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.shadowColor = 'transparent';
      _price(ctx, align === 'center' ? x : x0 + 44, y, d.priceLine, size, tpl.priceInk, maxW, align === 'center' ? 'center' : 'left');
      ctx.restore();
    }
  };

  if (tpl.layout === 'hero') {
    _header(ctx, d, tpl, Wn);
    const card = tall ? { x: 90, y: 190, w: 900, h: 920, r: 64 } : { x: 120, y: 140, w: 840, h: 560, r: 56 };
    _card(ctx, card, img0, tpl, t, dur);
    badgeAt(card);
    if (tall) {
      txt(d.title, 90, 1235, 66, 800, tpl.ink, titleA, 'left', 900);
      nameBlock(90, 1310, 900, [44, 40, 36], tpl.sub, 'left');
      priceBlock(90, 1590, 132, 900, 'left');
      _cta(ctx, 540, 1760, tpl, L, t, dur);
    } else {
      txt(d.title, 120, 782, 54, 800, tpl.ink, titleA, 'left', 840);
      nameBlock(120, 838, 840, [36, 32, 30], tpl.sub, 'left', 1.2);
      priceBlock(120, 1010, 96, 600, 'left');
    }
  } else if (tpl.layout === 'price') {
    const bandY = tall ? 1130 : 650;
    _header(ctx, d, tpl, Wn);
    const card = tall ? { x: 110, y: 180, w: 860, h: 860, r: 64 } : { x: 210, y: 120, w: 660, h: 470, r: 52 };
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 50; _rr(ctx, 0, bandY, Wn, Hn - bandY + 80, 70); ctx.fillStyle = tpl.band || '#fff'; ctx.fill(); ctx.restore();
    _card(ctx, card, img0, tpl, t, dur);
    badgeAt(card);
    if (tall) {
      nameBlock(540, bandY + 110, 900, [46, 42, 38], '#334155', 'center');
      priceBlock(540, bandY + 430, 190, 960, 'center', '#94a3b8');
      _cta(ctx, 540, bandY + 620, tpl, L, t, dur);
    } else {
      nameBlock(540, bandY + 80, 900, [36, 32, 30], '#334155', 'center', 1.18);
      priceBlock(540, bandY + 340, 150, 980, 'center', '#94a3b8');
    }
  } else if (tpl.layout === 'collage') {
    _header(ctx, d, tpl, Wn);
    const c1 = tall ? { x: 70, y: 200, w: 600, h: 600, r: 56 } : { x: 64, y: 150, w: 470, h: 470, r: 48 };
    const c2 = tall ? { x: 410, y: 600, w: 600, h: 600, r: 56 } : { x: 546, y: 210, w: 470, h: 470, r: 48 };
    _card(ctx, c1, img0, tpl, t, dur);
    _card(ctx, c2, img1, tpl, t, dur, { delay: 0.25, zoom: img1 === img0 ? 1.7 : 1, pad: img1 === img0 ? 0 : 0.07 });
    if (circle) _badge(ctx, kind, d, tpl, tall ? 900 : 960, tall ? 1180 : 690, t, beat, L); else badgeAt(c1);
    if (tall) {
      txt(d.title, 80, 1330, 64, 800, tpl.ink, titleA, 'left', 920);
      nameBlock(80, 1402, 920, [42, 38, 34], tpl.sub, 'left');
      priceBlock(80, 1660, 128, 920, 'left');
      _cta(ctx, 540, 1800, tpl, L, t, dur);
    } else {
      txt(d.title, 64, 770, 52, 800, tpl.ink, titleA, 'left', 760);
      nameBlock(64, 824, 760, [34, 30], tpl.sub, 'left', 1.2);
      priceBlock(64, 1010, 92, 700, 'left');
    }
  } else if (tpl.layout === 'minimal') {
    const card = tall ? { x: 70, y: 110, w: 940, h: 1080, r: 48 } : { x: 90, y: 80, w: 900, h: 620, r: 44 };
    _card(ctx, card, img0, tpl, t, dur);
    badgeAt(card);
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(tall ? 70 : 90, tall ? 1250 : 740, tall ? 940 : 900, 3);
    if (tall) {
      nameBlock(70, 1340, 940, [48, 44, 40], tpl.ink, 'left');
      priceBlock(70, 1610, 128, 940, 'left');
      txt(String(d.shopName || '').toUpperCase(), 70, 1840, 30, 700, tpl.sub, 1, 'left', 640);
    } else {
      nameBlock(90, 806, 900, [40, 36, 32], tpl.ink, 'left', 1.18);
      priceBlock(90, 1012, 92, 640, 'left');
      txt(String(d.shopName || '').toUpperCase(), 990, 1010, 26, 700, tpl.sub, 1, 'right', 300);
    }
  } else {   // frame (brend)
    ctx.save(); ctx.strokeStyle = tpl.frame; ctx.lineWidth = 6; _rr(ctx, 34, 34, Wn - 68, Hn - 68, 44); ctx.stroke(); ctx.restore();
    const logo = d.logoDark || d.logo;
    if (logo && logo.naturalWidth) { const h = tall ? 130 : 96, w = Math.min(480, logo.naturalWidth * h / logo.naturalHeight); ctx.drawImage(logo, (Wn - w) / 2, tall ? 100 : 66, w, h); }
    else txt(String(d.shopName || '').toUpperCase(), 540, tall ? 180 : 130, 44, 800, tpl.accent[0], 1, 'center', 900);
    const card = tall ? { x: 110, y: 300, w: 860, h: 860, r: 56 } : { x: 170, y: 200, w: 740, h: 520, r: 48 };
    _card(ctx, card, img0, tpl, t, dur);
    badgeAt(card);
    if (tall) {
      txt(d.title, 540, 1300, 62, 800, tpl.ink, titleA, 'center', 900);
      nameBlock(540, 1372, 900, [42, 38, 34], tpl.sub, 'center');
      priceBlock(540, 1640, 128, 900, 'center');
      _cta(ctx, 540, 1780, tpl, L, t, dur);
    } else {
      nameBlock(540, 806, 860, [38, 34, 30], tpl.sub, 'center', 1.18);
      priceBlock(540, 1000, 96, 860, 'center');
    }
  }
  ctx.restore();
}

// JPEG ≤ maxKB (Telegram foto-post uchun ≤300 KB)
async function airExportJpeg(canvas, maxKB = 300) {
  const toBlob = (q) => new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', q));
  for (const q of [0.92, 0.86, 0.8, 0.72, 0.64, 0.56, 0.48]) { const b = await toBlob(q); if (b && b.size <= maxKB * 1024) return b; }
  return toBlob(0.4);
}

// ════════════════════════════════════════════════════════════
// 2. KUY — brauzerda yaratiladi (WebAudio): fayl yo'q, mualliflik huquqi muammosi yo'q
//    + assets/ai-reklama/musiqa/manifest.json (build yaratadi: trek + LICENSE.txt bo'lsa)
// ════════════════════════════════════════════════════════════
const AIR_MOODS = [
  { id: 'energik', name: 'Energik', bpm: 120 },
  { id: 'yumshoq', name: 'Yumshoq', bpm: 84 },
  { id: 'premium', name: 'Premium', bpm: 96 },
  { id: 'none', name: 'Musiqasiz', bpm: 110 },
];
const AIR_VOLUME = 0.4;   // 0.3–0.5 oralig'ida
const _hz = (n) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI → Hz
// kuyni dest ga yozadi (dur soniya). Qaytaradi: stop()
function airMusicStart(actx, dest, moodId, dur) {
  const mood = AIR_MOODS.find((m) => m.id === moodId) || AIR_MOODS[0];
  if (mood.id === 'none') return () => {};
  const t0 = actx.currentTime + 0.05, b = 60 / mood.bpm, end = t0 + dur;
  const master = actx.createGain(); master.gain.setValueAtTime(0.0001, t0); master.gain.exponentialRampToValueAtTime(AIR_VOLUME, t0 + 0.4);
  master.gain.setValueAtTime(AIR_VOLUME, Math.max(t0 + 0.5, end - 0.9)); master.gain.exponentialRampToValueAtTime(0.0001, end); master.connect(dest);
  const nodes = [];
  const noise = actx.createBuffer(1, actx.sampleRate * 0.5, actx.sampleRate); const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const tone = (type, f, at, len, vol, filt) => {
    if (at >= end) return; const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.setValueAtTime(f, at);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + Math.min(0.02, len / 4)); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    let last = o; if (filt) { const fl = actx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filt; o.connect(fl); last = fl; }
    last.connect(g); g.connect(master); o.start(at); o.stop(Math.min(end, at + len + 0.05)); nodes.push(o);
  };
  const pad = (f, at, len, vol) => { if (at >= end) return; const o = actx.createOscillator(), g = actx.createGain(), fl = actx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = 7;
    fl.type = 'lowpass'; fl.frequency.value = 900; g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vol, at + len * 0.35); g.gain.linearRampToValueAtTime(0.0001, at + len);
    o.connect(fl); fl.connect(g); g.connect(master); o.start(at); o.stop(Math.min(end, at + len + 0.05)); nodes.push(o); };
  const kick = (at, vol) => { if (at >= end) return; const o = actx.createOscillator(), g = actx.createGain(); o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2); o.connect(g); g.connect(master); o.start(at); o.stop(at + 0.22); nodes.push(o); };
  const hat = (at, vol, hp) => { if (at >= end) return; const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain(); s.buffer = noise; f.type = 'highpass'; f.frequency.value = hp || 7000;
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06); s.connect(f); f.connect(g); g.connect(master); s.start(at); s.stop(at + 0.08); nodes.push(s); };
  // akkordlar: vi–IV–I–V (A minor rangida), har biri 1 takt (4 zarba)
  const prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const beats = Math.ceil(dur / b);
  for (let i = 0; i < beats; i++) {
    const at = t0 + i * b, ch = prog[Math.floor(i / 4) % 4];
    if (mood.id === 'energik') {
      kick(at, 0.9); hat(at + b / 2, 0.25); hat(at + b / 4 * 3, 0.12);
      tone('sawtooth', _hz(ch[0] - 24), at, b * 0.45, 0.35, 420); tone('sawtooth', _hz(ch[0] - 24), at + b / 2, b * 0.4, 0.28, 420);
      [0, 1, 2, 1].forEach((k, j) => tone('square', _hz(ch[k] + 12), at + j * b / 4, b / 5, 0.07, 2200));
    } else if (mood.id === 'yumshoq') {
      if (i % 4 === 0) ch.forEach((n) => pad(_hz(n), at, b * 4.2, 0.08));
      tone('sine', _hz(ch[i % 3] + 12), at, b * 0.9, 0.16); if (i % 2) hat(at, 0.05, 9000);
    } else {   // premium
      if (i % 4 === 0) ch.forEach((n) => pad(_hz(n - 12), at, b * 4.2, 0.07));
      if (i % 2 === 0) kick(at, 0.6); else hat(at, 0.18, 2500);
      tone('triangle', _hz(ch[i % 3] + 12), at, b * 0.35, 0.2); tone('triangle', _hz(ch[(i + 1) % 3] + 12), at + b / 2, b * 0.3, 0.14);
    }
  }
  return () => { nodes.forEach((n) => { try { n.stop(); } catch (_) {} }); try { master.disconnect(); } catch (_) {} };
}
// Litsenziyasi bor treklar (build: assets/ai-reklama/musiqa/manifest.json). Yo'q bo'lsa — bo'sh ro'yxat
let _airTracksP = null;
function airLoadTracks() {
  if (!_airTracksP) _airTracksP = fetch('assets/ai-reklama/musiqa/manifest.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : { tracks: [] }))
    .then((j) => (Array.isArray(j && j.tracks) ? j.tracks : []).filter((x) => x && /^[\w.-]+\.(mp3|m4a|ogg|wav)$/i.test(x.file)).slice(0, 20)).catch(() => []);
  return _airTracksP;
}
async function airTrackStart(actx, dest, file, dur) {
  const buf = await (await fetch('assets/ai-reklama/musiqa/' + file)).arrayBuffer();
  const audio = await actx.decodeAudioData(buf);
  const src = actx.createBufferSource(), g = actx.createGain(), t0 = actx.currentTime + 0.05;
  src.buffer = audio; src.loop = true; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(AIR_VOLUME, t0 + 0.4);
  g.gain.setValueAtTime(AIR_VOLUME, Math.max(t0 + 0.5, t0 + dur - 0.9)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(g); g.connect(dest); src.start(t0); src.stop(t0 + dur + 0.05);
  return () => { try { src.stop(); } catch (_) {} };
}

// ════════════════════════════════════════════════════════════
// 3. VIDEO — canvas + MediaRecorder, faqat MP4 (WebM Telegram'ga video sifatida yuborilmaydi)
//    720×1280, 30 fps, ~4 Mbit/s (15 s ≈ 8 MB) — arzon telefonda ham qotmaydi
// ════════════════════════════════════════════════════════════
const AIR_VIDEO = { w: 720, h: 1280, fps: 30, vbps: 4000000, abps: 128000, maxBytes: 20 * 1024 * 1024 };
const AIR_MP4_TYPES = [
  // Tartib: H.264 + AAC (hamma joyda o'ynaydi) → H.264 + Opus (AAC kodlovchisi yo'q brauzerlar; ovoz yo'qolmasin) → faqat video
  ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', true], ['video/mp4;codecs="avc1.4D401F,mp4a.40.2"', true], ['video/mp4;codecs=avc1,mp4a', true],
  ['video/mp4;codecs="avc1.42E01E,opus"', true], ['video/mp4;codecs=avc1,opus', true],
  ['video/mp4;codecs="avc1.42E01E"', false], ['video/mp4;codecs=avc1', false], ['video/mp4', false],
];
// Brauzer qaysi MP4 turini yoza oladi — TAXMIN QILINMAYDI, isTypeSupported bilan tekshiriladi (natija UI'da ko'rinadi)
function airMp4Info() {
  const MR = window.MediaRecorder;
  if (typeof MR !== 'function' || typeof MR.isTypeSupported !== 'function') return { ok: false, reason: 'MediaRecorder yoʻq', checks: [] };
  if (typeof HTMLCanvasElement === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return { ok: false, reason: 'canvas video oqimi yoʻq', checks: [] };
  const checks = AIR_MP4_TYPES.map(([type, audio]) => { let ok = false; try { ok = !!MR.isTypeSupported(type); } catch (_) {} return { type, audio, ok }; });
  const pick = checks.find((c) => c.ok);
  return pick ? { ok: true, type: pick.type, audio: pick.audio, checks } : { ok: false, reason: 'MP4 yozish qoʻllanmaydi', checks };
}
// Yozish. opts: { draw(ctx, W, H, t), dur, mood, track, onProgress(0..1), signal:{aborted, onabort} }. Qaytaradi Blob (video/mp4)
// Xatolar: NO_MP4 | CANCELLED | HIDDEN (boshqa ilovaga o'tildi) | EMPTY | TOO_BIG — buzuq fayl qaytmaydi
async function airRecordVideo(opts) {
  const info = airMp4Info();
  if (!info.ok) throw Object.assign(new Error(info.reason), { code: 'NO_MP4' });
  const cv = document.createElement('canvas'); cv.width = AIR_VIDEO.w; cv.height = AIR_VIDEO.h;
  const ctx = cv.getContext('2d');
  opts.draw(ctx, cv.width, cv.height, 0);
  const vstream = cv.captureStream(AIR_VIDEO.fps);
  let actx = null, dest = null, stopMusic = null, lock = null, raf = 0, rec = null, onVis = null;
  const tracks = [...vstream.getVideoTracks()];
  const wantAudio = info.audio && (opts.track || (opts.mood && opts.mood !== 'none'));
  if (wantAudio) {
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)(); dest = actx.createMediaStreamDestination();
      stopMusic = opts.track ? await airTrackStart(actx, dest, opts.track, opts.dur) : airMusicStart(actx, dest, opts.mood, opts.dur);
      tracks.push(...dest.stream.getAudioTracks());
    } catch (_) { stopMusic = null; }
  }
  try { if (navigator.wakeLock && navigator.wakeLock.request) lock = await navigator.wakeLock.request('screen'); } catch (_) { lock = null; }   // ekran o'chmasin
  const cleanup = () => {
    cancelAnimationFrame(raf); if (onVis) document.removeEventListener('visibilitychange', onVis);
    try { stopMusic && stopMusic(); } catch (_) {} try { actx && actx.close(); } catch (_) {}
    tracks.forEach((tr) => { try { tr.stop(); } catch (_) {} });
    try { lock && lock.release && lock.release(); } catch (_) {}
  };
  return new Promise((resolve, reject) => {
    const chunks = []; let fail = null, done = false;
    const finish = (err) => { if (done) return; done = true; cleanup(); if (err) reject(err); };
    try { rec = new window.MediaRecorder(new MediaStream(tracks), { mimeType: info.type, videoBitsPerSecond: AIR_VIDEO.vbps, audioBitsPerSecond: AIR_VIDEO.abps }); }
    catch (e) { finish(Object.assign(new Error('MP4 yozuvchi ochilmadi'), { code: 'NO_MP4' })); return; }
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onerror = () => { fail = fail || Object.assign(new Error('Yozishda xato'), { code: 'ERROR' }); try { rec.stop(); } catch (_) {} };
    rec.onstop = () => {
      if (fail) return finish(fail);
      const blob = new Blob(chunks, { type: 'video/mp4' });
      if (!blob.size) return finish(Object.assign(new Error('Video boʻsh chiqdi'), { code: 'EMPTY' }));
      if (blob.size > AIR_VIDEO.maxBytes) return finish(Object.assign(new Error('Video 20 MB dan katta'), { code: 'TOO_BIG' }));
      finish(null); resolve(blob);
    };
    const abort = (code, msg) => { if (done || fail) return; fail = Object.assign(new Error(msg), { code }); chunks.length = 0; try { rec.state !== 'inactive' ? rec.stop() : finish(fail); } catch (_) { finish(fail); } };
    // boshqa ilovaga o'tildi — yozish to'xtaydi, buzuq fayl yuborilmaydi
    onVis = () => { if (document.visibilityState === 'hidden') abort('HIDDEN', 'Yozish toʻxtatildi — ilovadan chiqildi. Qayta urinib koʻring'); };
    document.addEventListener('visibilitychange', onVis);
    if (opts.signal) opts.signal.onabort = () => abort('CANCELLED', 'Bekor qilindi');
    rec.start(250);
    const start = performance.now();
    const frame = () => {
      if (done || fail) return;
      const t = (performance.now() - start) / 1000;
      opts.draw(ctx, cv.width, cv.height, Math.min(t, opts.dur));
      if (opts.onProgress) opts.onProgress(Math.min(1, t / opts.dur));
      if (t >= opts.dur) { try { rec.stop(); } catch (_) { finish(Object.assign(new Error('Yozish toʻxtamadi'), { code: 'ERROR' })); } return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  });
}

// ════════════════════════════════════════════════════════════
// 4. SERVER
// ════════════════════════════════════════════════════════════
async function airApi(action, extra) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, status: 0, offline: true, data: { error: 'Internet yoʻq' } };
  try {
    const r = await authFetch('/.netlify/functions/ai-ads', { method: 'POST', body: JSON.stringify({ action, filial: (typeof S !== 'undefined' && S.branch) || undefined, ...(extra || {}) }) });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch (e) { return { ok: false, status: 0, offline: true, data: { error: 'Server bilan aloqa yoʻq' } }; }
}

// ════════════════════════════════════════════════════════════
// 5. UI — «Onlayn-doʻkon» → «AI-reklama» (5 qadam). Narx/qoldiq — serverdan, tahrirlanmaydi.
// ════════════════════════════════════════════════════════════
const AIR = { sub: 'new', filter: 'all', st: null, cands: null, candErr: null, sel: null, text: null, alts: [], altI: 0, textBusy: false,
  tpl: 'chegirma', fmt: 'post', dur: 10, mood: 'energik', track: '', tracks: [], imgs: [], logo: null, logoDark: null, busy: null, prog: 0,
  ctrl: null, err: null, out: null, settings: null, setErr: null, raf: 0, t0: 0 };
const AIR_REASON = { discount: 'Chegirma', new: 'Yangi', top: 'Top', stuck: 'Maxsus taklif' };
const _airE = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
const _airIc = (k) => (typeof ICONF !== 'undefined' && ICONF[k]) || '';
const _airToast = (m) => (typeof toast === 'function' ? toast(m) : null);
const _airCan = (k) => (typeof hasPerm !== 'function' || hasPerm(k) || (typeof fwServerAdmin === 'function' && fwServerAdmin()));

// AI holati: «AI ulangan · bu oy 12/300» | «Shablon rejimi» | xato bo'lsa — aniq (aldamaydi)
function _airPill(st) {
  if (!st) return '<span class="air-pill">Tekshirilmoqda…</span>';
  if (!st.ai) return `<span class="air-pill">${st.code === 'MIGRATION58_PENDING' ? 'Hali yoqilmagan' : 'Holat nomaʼlum'}</span>`;
  return st.ai.on ? `<span class="air-pill on">${_airIc('sparkle')}AI ulangan · bu oy ${st.ai.used}/${st.ai.limit}</span>` : '<span class="air-pill">Shablon rejimi</span>';
}
function airRender() {
  const box = document.getElementById('dk-body'); if (!box) return;
  cancelAnimationFrame(AIR.raf);
  const st = AIR.st;
  const pill = _airPill(st);
  const tab = (k, l) => `<button role="tab" class="${AIR.sub === k ? 'on' : ''}" onclick="AIR.sub='${k}';airRender()">${l}</button>`;
  box.innerHTML = `
  <section class="air-hero">
    <div class="air-hero-t"><b>${_airIc('sparkle')}AI-reklama</b><span>Mahsulotdan chiroyli post va Reels — 1 daqiqada</span></div>
    <div class="air-hero-r">${pill}<button class="air-how" onclick="airHowSheet()">${_airIc('info')}<span>Bu qanday ishlaydi</span></button></div>
  </section>
  <div class="air-sub" role="tablist">${tab('new', 'Yangi post')}${tab('queue', 'Navbat')}${tab('hist', 'Tarix')}${_airCan('reklama.settings') ? tab('set', 'Sozlamalar') : ''}</div>
  <div id="air-body"></div>`;
  if (!AIR.st) airLoadStatus();
  if (AIR.sub === 'new') airRenderNew();
  else if (AIR.sub === 'set') airRenderSettings();
  else document.getElementById('air-body').innerHTML = `<div class="air-empty">${_airIc('hourglass')}<b>${AIR.sub === 'queue' ? 'Navbat' : 'Tarix'}</b><span>Telegram'ga yuborish qoʻshilgach (keyingi bosqich) shu yerda koʻrinadi.</span></div>`;
}
async function airLoadStatus() {
  const r = await airApi('status');
  AIR.st = r.ok ? r.data : { ai: null, err: r.data && r.data.error, code: r.data && r.data.code };
  const p = document.querySelector('.air-hero-r .air-pill');
  if (p) p.outerHTML = _airPill(AIR.st);
}
function airHowSheet() {
  openSheet({ ic: 'sparkle', c: 'pink', title: 'Bu qanday ishlaydi', body: `<ol class="air-how-l">
    <li><b>Mahsulot tanlang.</b> Tizim oʻzi taklif qiladi: chegirmadagi, yangi kelgan, koʻp sotilgan va uzoq turib qolganlar.</li>
    <li><b>Matn.</b> AI ulangan boʻlsa — AI yozadi; boʻlmasa tayyor shablon. «Boshqa variant» bilan almashtiring yoki oʻzingiz tahrirlang.</li>
    <li><b>Shablon</b> — 8 ta dizayndan birini tanlang. Narx va eski narx tizimdan olinadi, oʻzgartirib boʻlmaydi.</li>
    <li><b>Format va musiqa.</b> Post (1:1 rasm) yoki Reels (9:16 video, 8–15 soniya, kuy bilan).</li>
    <li><b>Saqlash yoki ulashish.</b> Video yozilayotganda ilovadan chiqmang — chiqsangiz, yozish toʻxtaydi va qayta urinasiz.</li></ol>
    <p class="air-note">AI'ga faqat mahsulot nomi, kategoriyasi va qisqa tavsifi yuboriladi. Narx, mijoz, taʼminotchi va telefon — hech qachon.</p>` });
}

// ── Yangi post ──
function airRenderNew() {
  const el = document.getElementById('air-body'); if (!el) return;
  if (AIR.cands == null && !AIR.candErr) { el.innerHTML = `<div class="air-skel">${'<i></i>'.repeat(4)}</div>`; airLoadCands(); return; }
  if (AIR.candErr) { el.innerHTML = airErrBox(AIR.candErr, 'airRetryCands()'); return; }
  const list = AIR.cands.filter((c) => AIR.filter === 'all' || c.reasons.includes(AIR.filter));
  const n = (k) => AIR.cands.filter((c) => k === 'all' || c.reasons.includes(k)).length;
  const chip = (k, l) => `<button class="air-chip${AIR.filter === k ? ' on' : ''}" onclick="AIR.filter='${k}';airRenderNew()">${l}<em>${n(k)}</em></button>`;
  const card = (c) => { const r = c.reasons[0];
    return `<button class="air-cand${AIR.sel && AIR.sel.pid === c.pid ? ' on' : ''}" onclick="airPick(${c.pid})">
      <span class="air-cand-im"><img src="${_airE(c.img[0])}" alt="" loading="lazy" referrerpolicy="no-referrer"><em class="air-r air-r-${r}">${AIR_REASON[r]}</em></span>
      <b>${_airE(c.name)}</b><span class="air-cand-p">${_airE(c.line)}${c.oldLine ? `<s>${_airE(c.oldLine)}</s>` : ''}</span></button>`; };
  el.innerHTML = `
  <div class="air-step"><span class="air-n">1</span><div><b>Mahsulot</b><small>Tizim tanlab bergan nomzodlar</small></div></div>
  <div class="air-chips">${chip('all', 'Hammasi')}${chip('discount', 'Chegirma')}${chip('new', 'Yangi')}${chip('top', 'Top')}${chip('stuck', 'Maxsus taklif')}</div>
  ${list.length ? `<div class="air-cands">${list.map(card).join('')}</div>` : `<div class="air-empty">${_airIc('inbox')}<b>Mos mahsulot yoʻq</b><span>Vitrinada rasmi, narxi va qoldigʻi bor mahsulotlar shu yerda chiqadi.</span></div>`}
  <div id="air-editor"></div>`;
  if (AIR.sel) airRenderEditor();
}
function airErrBox(err, retry) {
  const msg = err.offline ? 'Internet yoʻq — ulanib, qayta urinib koʻring' : err.code === 'MIGRATION58_PENDING' ? 'AI-reklama hali yoqilmagan (bazaga 58-migratsiya qoʻllanmagan)'
    : err.code === 'SHOP_OFF' ? 'Bu filialda onlayn-doʻkon yoqilmagan' : err.status === 403 ? 'Bu boʻlim uchun ruxsatingiz yoʻq' : (err.error || 'Xatolik');
  return `<div class="air-empty air-err">${_airIc('warning')}<b>${_airE(msg)}</b>${err.code === 'SHOP_OFF' || err.status === 403 ? '' : `<button class="air-btn" onclick="${retry}">${_airIc('refresh')}Qayta urinish</button>`}</div>`;
}
function airRetryCands() { AIR.cands = null; AIR.candErr = null; airRenderNew(); }
async function airLoadCands() {
  const r = await airApi('candidates');
  if (r.ok && Array.isArray(r.data.items)) { AIR.cands = r.data.items; AIR.candErr = null; }
  else AIR.candErr = { ...(r.data || {}), status: r.status, offline: !!r.offline };
  airRenderNew();
}
async function airPick(pid) {
  const c = (AIR.cands || []).find((x) => x.pid === pid); if (!c) return;
  AIR.sel = c; AIR.text = null; AIR.alts = []; AIR.altI = 0; AIR.out = null; AIR.err = null; AIR.imgs = [];
  if (!AIR._tplTouched) AIR.tpl = { discount: 'chegirma', new: 'yangi', top: 'top', stuck: 'maxsus' }[c.reasons[0]] || 'chegirma';
  airRenderNew();
  const ed = document.getElementById('air-editor'); if (ed) ed.scrollIntoView({ behavior: 'smooth', block: 'start' });
  airLoadAssets(c); airLoadText(false);
}
async function airLoadAssets(c) {
  await airLoadFonts();
  if (!AIR.logo) { AIR.logo = await airGetImage('assets/brand-logo.png').catch(() => null); AIR.logoDark = await airGetImage('assets/brand-logo-dark.png').catch(() => null); }
  if (!AIR.tracks.length) AIR.tracks = await airLoadTracks();
  const imgs = [];
  for (let i = 0; i < Math.min(2, c.img.length); i++) { try { imgs.push(await airGetImage(c.img[i], c.pid, i)); } catch (e) { if (!i) AIR.err = 'Rasm yuklanmadi: ' + e.message; } }
  if (AIR.sel !== c) return;
  AIR.imgs = imgs; airRenderEditor();
}
async function airLoadText(useAi) {
  const c = AIR.sel; if (!c) return;
  AIR.textBusy = true; airRenderEditor();
  const r = await airApi('text', { pid: c.pid, kind: c.reasons[0], template: useAi === false && !!AIR.text });
  if (AIR.sel !== c) return;
  AIR.textBusy = false;
  if (r.ok && r.data.text) {
    AIR.text = { title: r.data.text.title, body: r.data.text.body, tags: r.data.text.tags || [], source: r.data.text.source, note: r.data.text.note };
    AIR.alts = Array.isArray(r.data.alts) ? r.data.alts : []; AIR.altI = Math.max(0, AIR.alts.findIndex((a) => a.variant === r.data.text.variant));
    if (r.data.ai && AIR.st && AIR.st.ai && r.data.ai.used != null) AIR.st.ai.used = r.data.ai.used;
    if (r.data.text.note) _airToast(r.data.text.note);
  } else {
    AIR.text = AIR.text || { title: '', body: '', tags: [], source: 'manual' };
    _airToast((r.data && r.data.error) || 'Matn olinmadi — oʻzingiz yozing');
  }
  airRenderEditor();
}
// «Boshqa variant» — serverdan kelgan shablon variantlari orasida, darhol (so'rovsiz)
function airNextVariant() {
  if (!AIR.alts.length) return airLoadText(false);
  AIR.altI = (AIR.altI + 1) % AIR.alts.length; const a = AIR.alts[AIR.altI];
  AIR.text = { title: a.title, body: a.body, tags: a.tags.slice(), source: 'template' }; airRenderEditor();
}
function airDrawData() {
  const c = AIR.sel, t = AIR.text || {};
  return { name: c.name, title: t.title || '', priceLine: c.line, oldLine: c.oldLine || '', pct: c.pct || 0, reason: c.reasons[0],
    shopName: (typeof shopCfg === 'function' && shopCfg().name) || 'Doʻkon', lang: (AIR.st && AIR.st.lang) || 'uz', imgs: AIR.imgs, logo: AIR.logo, logoDark: AIR.logoDark };
}
const _airTpl = () => (window.AIR_TEMPLATES || []).find((x) => x.id === AIR.tpl) || window.AIR_TEMPLATES[0];
const _airBpm = () => (AIR_MOODS.find((m) => m.id === AIR.mood) || AIR_MOODS[0]).bpm;

function airRenderEditor() {
  const el = document.getElementById('air-editor'); if (!el || !AIR.sel) return;
  cancelAnimationFrame(AIR.raf);
  const t = AIR.text, mp4 = airMp4Info(), busy = AIR.busy, video = AIR.fmt === 'video';
  const tplBtn = (x) => `<button class="air-tpl${AIR.tpl === x.id ? ' on' : ''}" onclick="AIR.tpl='${x.id}';AIR._tplTouched=1;airRenderEditor()" aria-label="${_airE(x.name)}"><canvas width="216" height="216" data-tpl="${x.id}"></canvas><span>${_airE(x.name)}</span></button>`;
  const seg = (v, cur, on, l) => `<button class="${String(v) === String(cur) ? 'on' : ''}" onclick="${on}">${l}</button>`;
  const ready = AIR.imgs.length && t;
  el.innerHTML = `
  <div class="air-grid">
    <div class="air-col">
      <div class="air-step"><span class="air-n">2</span><div><b>Matn</b><small>${t ? (t.source === 'ai' ? 'AI yozdi' : t.source === 'template' ? 'Tayyor shablon' : 'Qoʻlda') : 'Tayyorlanmoqda…'}</small></div></div>
      ${!t ? `<div class="air-skel air-skel-t"><i></i><i></i></div>` : `
      <label class="air-f"><span>Sarlavha (rasmda)</span><input id="air-title" maxlength="40" value="${_airE(t.title)}" oninput="AIR.text.title=this.value;airPreviewSoon()"></label>
      <label class="air-f"><span>Post matni (Telegram)</span><textarea id="air-bodyt" rows="4" maxlength="600" oninput="AIR.text.body=this.value">${_airE(t.body)}</textarea></label>
      <div class="air-tags">${(t.tags || []).map((g) => `<em>#${_airE(g)}</em>`).join('')}</div>`}
      <div class="air-row">
        <button class="air-btn" onclick="airNextVariant()" ${AIR.textBusy ? 'disabled' : ''}>${_airIc('swap')}Boshqa variant</button>
        ${AIR.st && AIR.st.ai && AIR.st.ai.on ? `<button class="air-btn" onclick="airLoadText(true)" ${AIR.textBusy || AIR.st.ai.exhausted ? 'disabled' : ''}>${_airIc('sparkle')}${AIR.textBusy ? 'Yozilmoqda…' : 'AI yozsin'}</button>` : ''}
      </div>
      <div class="air-step"><span class="air-n">3</span><div><b>Shablon</b><small>8 ta dizayn</small></div></div>
      <div class="air-tpls">${(window.AIR_TEMPLATES || []).map(tplBtn).join('')}</div>
      <div class="air-step"><span class="air-n">4</span><div><b>Format va musiqa</b><small>${video ? 'Reels / Story — 720×1280, 30 kadr/s' : 'Post — 1080×1080 rasm'}</small></div></div>
      <div class="air-seg">${seg('post', AIR.fmt, "AIR.fmt='post';airRenderEditor()", 'Post 1:1')}${seg('video', AIR.fmt, "AIR.fmt='video';airRenderEditor()", 'Video 9:16')}</div>
      ${video ? `
      <div class="air-seg">${[8, 10, 12, 15].map((d) => seg(d, AIR.dur, `AIR.dur=${d};airRenderEditor()`, d + ' s')).join('')}</div>
      <div class="air-chips air-moods">${AIR_MOODS.map((m) => `<button class="air-chip${!AIR.track && AIR.mood === m.id ? ' on' : ''}" onclick="AIR.mood='${m.id}';AIR.track='';airRenderEditor()">${m.name}</button>`).join('')}
        ${AIR.tracks.map((x) => `<button class="air-chip${AIR.track === x.file ? ' on' : ''}" onclick="AIR.track='${_airE(x.file)}';airRenderEditor()">${_airE(x.title || x.file)}</button>`).join('')}</div>
      <p class="air-mp4 ${mp4.ok ? 'ok' : 'bad'}">${mp4.ok ? _airIc('check') : _airIc('warning')}<span>${mp4.ok ? 'MP4 yozish mumkin · ' + _airE(mp4.type) + (mp4.audio ? '' : ' (ovozsiz)') : 'Bu brauzer MP4 yoza olmaydi (' + _airE(mp4.reason) + ') — Post 1:1 ishlaydi; video uchun Android Chrome yoki ilovani yangilang'}</span></p>` : ''}
    </div>
    <div class="air-col air-pv">
      <div class="air-step"><span class="air-n">5</span><div><b>Tayyor</b><small>Oldindan koʻrish</small></div></div>
      <div class="air-stage ${video ? 'tall' : ''}">${ready ? `<canvas id="air-cv"></canvas>` : `<div class="air-skel air-skel-pv"><i></i></div>`}
        ${AIR.err ? `<p class="air-stage-err">${_airE(AIR.err)}</p>` : ''}</div>
      ${busy ? `<div class="air-prog"><i style="width:${Math.round(AIR.prog * 100)}%"></i><span>${busy === 'video' ? 'Video yozilmoqda… ' + Math.round(AIR.prog * 100) + '% — ilovadan chiqmang' : 'Tayyorlanmoqda…'}</span>
        <button class="air-btn" onclick="airCancel()">${_airIc('close')}Bekor qilish</button></div>`
      : AIR.out && AIR.out.err ? `<div class="air-prog bad"><span>${_airE(AIR.out.err)}</span><button class="air-btn" onclick="airMake()">${_airIc('refresh')}Qayta urinish</button></div>` : ''}
      <div class="air-acts">
        <button class="air-btn pri" onclick="airMake()" ${!ready || busy || (video && !mp4.ok) ? 'disabled' : ''}>${_airIc('download')}${video ? 'Videoni yaratish' : 'Rasmni saqlash'}</button>
        <button class="air-btn" onclick="airShare()" ${!(AIR.out && AIR.out.blob) || busy ? 'disabled' : ''}>${_airIc('share')}Ulashish</button>
        <button class="air-btn" disabled title="Keyingi bosqichda">${_airIc('send')}Telegram'ga</button>
      </div>
      ${AIR.out && AIR.out.blob ? `<p class="air-done">${_airIc('check')}<span>Tayyor: ${AIR.out.blob.type === 'video/mp4' ? 'MP4' : 'JPEG'}, ${Math.max(1, Math.round(AIR.out.blob.size / 1024))} KB</span></p>` : ''}
    </div>
  </div>`;
  airDrawThumbs(); airPreview();
}
function airDrawThumbs() {
  if (!AIR.imgs.length) return;
  const d = airDrawData();
  document.querySelectorAll('canvas[data-tpl]').forEach((cv) => {
    const tpl = (window.AIR_TEMPLATES || []).find((x) => x.id === cv.dataset.tpl); if (!tpl) return;
    airDraw(cv.getContext('2d'), cv.width, cv.height, tpl, d, null);   // airDraw o'zi masshtablaydi (W/1080)
  });
}
let _airPvT = 0;
function airPreviewSoon() { clearTimeout(_airPvT); _airPvT = setTimeout(() => { airPreview(); airDrawThumbs(); }, 120); }
// Oldindan ko'rish: post — statik; video — animatsiya aylanib turadi (dur soniya)
function airPreview() {
  const cv = document.getElementById('air-cv'); if (!cv || !AIR.imgs.length) return;
  cancelAnimationFrame(AIR.raf);
  const video = AIR.fmt === 'video', W = video ? 540 : 720, H = video ? 960 : 720;
  if (cv.width !== W) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d'), tpl = _airTpl(), d = airDrawData();
  if (!video) { airDraw(ctx, W, H, tpl, d, null); return; }
  AIR.t0 = performance.now();
  const loop = () => { if (!document.body.contains(cv)) return; const t = ((performance.now() - AIR.t0) / 1000) % AIR.dur;
    airDraw(ctx, W, H, tpl, d, t, AIR.dur, _airBpm()); AIR.raf = requestAnimationFrame(loop); };
  loop();
}
function airCancel() { if (AIR.ctrl) { AIR.ctrl.aborted = true; if (AIR.ctrl.onabort) AIR.ctrl.onabort(); } }
async function airMake() {
  if (AIR.busy || !AIR.sel || !AIR.imgs.length) return;
  const tpl = _airTpl(), d = airDrawData(), base = 'reklama-' + AIR.sel.pid + '-' + tpl.id;
  AIR.out = null; AIR.prog = 0;
  if (AIR.fmt === 'post') {
    AIR.busy = 'post'; airRenderEditor();
    try {
      const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1080; airDraw(cv.getContext('2d'), 1080, 1080, tpl, d, null);
      const blob = await airExportJpeg(cv, 300); AIR.out = { blob, name: base + '.jpg' }; airDownload(AIR.out);
    } catch (e) { AIR.out = { err: 'Rasm yaratilmadi: ' + e.message }; }
    AIR.busy = null; airRenderEditor(); return;
  }
  AIR.busy = 'video'; AIR.ctrl = { aborted: false, onabort: null }; airRenderEditor();
  const bar = () => { const b = document.querySelector('.air-prog i'), s = document.querySelector('.air-prog span');
    if (b) b.style.width = Math.round(AIR.prog * 100) + '%'; if (s) s.textContent = 'Video yozilmoqda… ' + Math.round(AIR.prog * 100) + '% — ilovadan chiqmang'; };
  try {
    const blob = await airRecordVideo({ dur: AIR.dur, mood: AIR.mood, track: AIR.track || null, signal: AIR.ctrl,
      draw: (ctx, W, H, t) => airDraw(ctx, W, H, tpl, d, t, AIR.dur, _airBpm()), onProgress: (p) => { AIR.prog = p; bar(); } });
    AIR.out = { blob, name: base + '.mp4' }; airDownload(AIR.out);
  } catch (e) {
    AIR.out = e.code === 'CANCELLED' ? null : { err: e.code === 'HIDDEN' ? 'Yozish toʻxtadi — ilovadan chiqildi. Video saqlanmadi, qayta urinib koʻring.' : (e.message || 'Video yozilmadi') };
  }
  AIR.busy = null; AIR.ctrl = null; airRenderEditor();
}
function airDownload(o) {
  try { const u = URL.createObjectURL(o.blob), a = document.createElement('a'); a.href = u; a.download = o.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 30000); _airToast('Saqlandi: ' + o.name); }
  catch (_) { _airToast('Saqlab boʻlmadi — «Ulashish» tugmasidan foydalaning'); }
}
async function airShare() {
  const o = AIR.out; if (!o || !o.blob) return;
  const file = new File([o.blob], o.name, { type: o.blob.type });
  const text = AIR.text ? [AIR.text.title, AIR.text.body, (AIR.text.tags || []).map((g) => '#' + g).join(' ')].filter(Boolean).join('\n\n') : '';
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text }); } catch (_) { /* foydalanuvchi yopdi */ } }
  else { airDownload(o); if (navigator.clipboard && text) navigator.clipboard.writeText(text).then(() => _airToast('Matn nusxalandi'), () => {}); }
}

// ── Sozlamalar ──
async function airRenderSettings() {
  const el = document.getElementById('air-body'); if (!el) return;
  if (!AIR.settings) {
    el.innerHTML = `<div class="air-skel">${'<i></i>'.repeat(2)}</div>`;
    const r = await airApi('settings_get');
    if (!r.ok) { el.innerHTML = airErrBox({ ...(r.data || {}), status: r.status, offline: r.offline }, 'AIR.settings=null;airRenderSettings()'); return; }
    AIR.settings = r.data.settings;
  }
  const s = AIR.settings, c = s.criteria;
  const sw = (k, l) => `<label class="air-sw"><input type="checkbox" ${c[k] ? 'checked' : ''} onchange="AIR.settings.criteria.${k}=this.checked"><span>${l}</span></label>`;
  const num = (k, l, lo, hi) => `<label class="air-f air-f-n"><span>${l}</span><input type="number" inputmode="numeric" min="${lo}" max="${hi}" value="${c[k]}" onchange="AIR.settings.criteria.${k}=+this.value"></label>`;
  el.innerHTML = `
  <section class="air-card">
    <label class="air-f"><span>Reklama kanali (@username yoki -100… ID)</span><input id="air-ch" value="${_airE(s.channel)}" placeholder="Boʻsh — doʻkon eʼlonlar kanali" oninput="AIR.settings.channel=this.value.trim()"></label>
    <div class="air-seg">${['uz', 'ru'].map((l) => `<button class="${s.lang === l ? 'on' : ''}" onclick="AIR.settings.lang='${l}';airRenderSettings()">${l === 'uz' ? 'Oʻzbekcha (lotin)' : 'Ruscha'}</button>`).join('')}</div>
  </section>
  <section class="air-card"><b class="air-h">Nomzodlar</b>
    ${sw('discount', 'Chegirmadagilar')}${sw('new', 'Yangi kelganlar')}${num('newDays', 'Yangi — necha kun', 1, 90)}
    ${sw('top', 'Koʻp sotilganlar')}${num('topN', 'Top — nechta', 1, 30)}${sw('stuck', 'Turib qolganlar (maxsus taklif)')}${num('stuckDays', 'Turib qolgan — necha kun sotilmagan', 7, 365)}
    ${num('repeatDays', 'Qayta reklama — necha kundan keyin', 1, 60)}
  </section>
  <p class="air-note">Avtopilot (har kuni oʻzi post tayyorlash) — keyingi bosqichda.</p>
  <button class="air-btn pri" onclick="airSaveSettings()">${_airIc('check')}Saqlash</button>`;
}
async function airSaveSettings() {
  const r = await airApi('settings_save', { settings: AIR.settings });
  if (r.ok) { AIR.settings = r.data.settings; AIR.cands = null; AIR.st = null; _airToast('Saqlandi'); airRenderSettings(); }
  else _airToast((r.data && r.data.error) || 'Saqlanmadi');
}
