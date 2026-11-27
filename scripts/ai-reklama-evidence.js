// v25.8 — AI-reklama: 8 shablon × 3 mahsulot (uzun nom / chegirma / tik rasm) → tests/evidence/ai-reklama-<shablon>.png
// Har varaq: yuqorida 3 ta post (1:1), pastda 3 ta story (9:16). Ishga tushirish: node scripts/ai-reklama-evidence.js
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../tests/helpers/air-render');
(async () => {
  const A = await H.openAir();
  const outDir = path.join(H.ROOT, 'tests', 'evidence');
  fs.mkdirSync(outDir, { recursive: true });
  try {
    const sheets = await A.page.evaluate(async (products) => {
      await airLoadFonts();
      const logo = await airGetImage('assets/brand-logo.png').catch(() => null), logoDark = await airGetImage('assets/brand-logo-dark.png').catch(() => null);
      const imgs = {}; for (const p of products) imgs[p.key] = await airGetImage(p.img);
      const res = [];
      for (const tpl of AIR_TEMPLATES) {
        const cw = 420, gap = 24, pad = 32, head = 86, ph = cw, sh = cw * 16 / 9, lab = 34;
        const W = pad * 2 + cw * 3 + gap * 2, Ht = head + lab + ph + gap + lab + sh + pad;
        const cv = document.createElement('canvas'); cv.width = W * 1.5; cv.height = Ht * 1.5;
        const c = cv.getContext('2d'); c.scale(1.5, 1.5); c.fillStyle = '#eef0f4'; c.fillRect(0, 0, W, Ht);
        c.fillStyle = '#111827'; c.font = `800 34px ${AIR_FONT}`; c.fillText('Shablon: ' + tpl.name, pad, 56);
        c.fillStyle = '#6b7280'; c.font = `600 18px ${AIR_FONT}`; c.fillText('1:1 post 1080×1080 · 9:16 story/video', pad + 420, 56);
        const one = (p, fmt) => { const w = 1080, h = fmt === 'story' ? 1920 : 1080, k = document.createElement('canvas'); k.width = w; k.height = h;
          airDraw(k.getContext('2d'), w, h, tpl, { ...p, lang: p.lang || 'uz', shopName: 'Powerful Group', imgs: [imgs[p.key]], logo, logoDark }, null); return k; };
        const labels = { 'uzun-nom': 'Uzun nom · Yangi', chegirma: 'Chegirma −15%', 'tik-rasm': 'Tik rasm · Top (rus)' };
        products.forEach((p, i) => {
          const x = pad + i * (cw + gap);
          c.fillStyle = '#374151'; c.font = `700 18px ${AIR_FONT}`; c.fillText(labels[p.key] || p.key, x, head + 22);
          c.save(); c.shadowColor = 'rgba(0,0,0,.15)'; c.shadowBlur = 16; c.drawImage(one(p, 'post'), x, head + lab, cw, ph); c.restore();
          c.fillText('Story', x, head + lab + ph + gap + 22);
          c.save(); c.shadowColor = 'rgba(0,0,0,.15)'; c.shadowBlur = 16; c.drawImage(one(p, 'story'), x, head + lab * 2 + ph + gap, cw, sh); c.restore();
        });
        res.push({ id: tpl.id, png: cv.toDataURL('image/png').split(',')[1] });
      }
      return res;
    }, H.PRODUCTS);
    for (const s of sheets) fs.writeFileSync(path.join(outDir, `ai-reklama-${s.id}.png`), Buffer.from(s.png, 'base64'));
    // Hajm: 256 rangli PNG (Python Pillow bo'lsa) — repo og'irlashmasin
    try { require('child_process').execFileSync('python3', ['-c', "import sys,glob\nfrom PIL import Image\nfor f in glob.glob(sys.argv[1]+'/ai-reklama-*.png'):\n Image.open(f).convert('RGB').quantize(colors=256,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.FLOYDSTEINBERG).save(f,optimize=True)", outDir]); } catch (_) { console.log('(PNG siqilmadi — Pillow yo\'q)'); }
    console.log('yozildi:', sheets.length, 'varaq; xatolar:', A.errors);
  } finally { await A.close(); }
})();
