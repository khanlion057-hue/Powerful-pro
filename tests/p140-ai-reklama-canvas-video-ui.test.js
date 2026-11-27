// P140 — v25.8 AI-reklama, 3-bosqich: CANVAS, VIDEO, UI (haqiqiy Chromium + haqiqiy js/main.js, js/ai-reklama*.js, css/design-system.css).
//  • Canvas: shrift chizishdan OLDIN yuklanadi; oʻ/gʻ/ʼ va kirill (Ўў Ққ) zaxira shriftsiz; 2 qatorga sigʻmagan nom — «…»;
//    chegirma shablonida −N% doira koʻrinadi (piksel tekshiruvi) + skrinshot tests/evidence/p140-*.png.
//  • Video: MediaRecorder soxta (mock) — boshlash (MP4, Wake Lock olinadi va qoʻyib yuboriladi), bekor qilish, ilovadan chiqish
//    (visibilitychange → HIDDEN, fayl QAYTMAYDI), MP4 yoʻq (NO_MP4), 20 MB dan katta (TOO_BIG).
//  • UI 360 px: 5 qadam, oldindan koʻrish toʻliq koʻrinadi, tugmalar ≥44 px, gorizontal surilish yoʻq; «Boshqa variant» darhol
//    (serverga qayta soʻrovsiz); shablon almashtirish oldindan koʻrishni yangilaydi; AI holati «AI ulangan · bu oy 12/300».
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp, ROOT } = require('./helpers/load-app');

const EVID = path.join(ROOT, 'tests', 'evidence');
const FIX = 'tests/fixtures/ai-reklama/';
const CANDS = [
  { pid: 11, name: 'Tortsovochnaya pila MS 1900-255 L', img: [FIX + 'tortsovka.webp'], reasons: ['discount'], line: '1 854 000 soʻm', oldLine: '2 180 000 soʻm', pct: 15, price: 1854000, cur: 'UZS' },
  { pid: 12, name: 'Burchakli silliqlash mashinasi AGH 3000-230 S HEAVY DUTY — oʻtkir gʻildirak, taʼmirlanadigan korpus', img: [FIX + 'drel-fon.jpg'], reasons: ['new'], line: '891 000 soʻm', oldLine: '', pct: 0, price: 891000, cur: 'UZS' },
  { pid: 13, name: 'Цепная электропила ECS 1900-40 (Ўзбекистон)', img: [FIX + 'pila-tik.jpg', FIX + 'elektropila.webp'], reasons: ['top'], line: '542 000 soʻm', oldLine: '', pct: 0, price: 542000, cur: 'UZS' },
];
const ALTS = Array.from({ length: 11 }, (_, i) => ({ title: `Variant sarlavha ${'ABCDEFGHIJK'[i]}`, body: `Matn ${'ABCDEFGHIJK'[i]}\nIkkinchi qator`, tags: ['arra', 'usta', 'chegirma'], variant: i }));

async function withAir(fn, { width = 360, height = 780, aiOn = true } = {}) {
  const calls = [];
  const { browser, page, consoleErrors } = await loadApp({ mockRoutes: [{ url: '**/.netlify/functions/ai-ads', handler: async (route) => {
    const b = JSON.parse(route.request().postData() || '{}'); calls.push(b);
    const J = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(o) });
    if (b.action === 'status') return J({ ok: true, shopOn: true, lang: 'uz', ai: aiOn ? { on: true, used: 12, limit: 300, left: 288, exhausted: false } : { on: false, used: 0, limit: 300 } });
    if (b.action === 'candidates') return J({ ok: true, items: CANDS, total: CANDS.length, cur: 'UZS' });
    if (b.action === 'text') return J({ ok: true, text: { title: 'Chegirma boshlandi!', body: 'Ustalar uchun.\nShoshiling.', tags: ['chegirma', 'arra', 'usta'], source: aiOn ? 'ai' : 'template', variant: aiOn ? null : 0 }, alts: ALTS, ai: { on: aiOn, used: 13, limit: 300 } });
    if (b.action === 'settings_get') return J({ ok: true, settings: { channel: '', lang: 'uz', criteria: { discount: true, new: true, stuck: true, top: true, newDays: 14, stuckDays: 30, topDays: 30, topN: 10, repeatDays: 7 }, autopilot: {} } });
    return J({ error: 'x' }, 400);
  } }] });
  try {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { const b = document.createElement('base'); b.href = '/'; document.head.prepend(b); });
    await page.addStyleTag({ path: path.join(ROOT, 'css', 'design-system.css') });
    await page.addScriptTag({ path: path.join(ROOT, 'js', 'ai-reklama-shablonlar.js') });
    await page.addScriptTag({ path: path.join(ROOT, 'js', 'ai-reklama.js') });
    await page.evaluate(() => { document.body.style.margin = '0'; document.body.insertAdjacentHTML('beforeend', '<main style="padding:0 16px;box-sizing:border-box"><div id="dk-body"></div></main>');
      window.authFetch = (u, o) => fetch(u, o); shopCfg = () => ({ name: 'Powerful Group', enabled: true }); });
    await fn(page, calls);
    assert.deepEqual(consoleErrors, [], 'sahifada JS xatosi yoʻq');
  } finally { await browser.close(); }
}

// ── 1. Canvas: shrift, harflar, 2 qator «…», chegirma doirasi ──
async function testCanvas() {
  await withAir(async (page) => {
    const r = await page.evaluate(async () => {
      const fontOk = await airLoadFonts();
      const cyr = document.fonts.check(`800 48px "${AIR_FONT}"`, 'Ўў Ққ Ғғ Ҳҳ'), lat = document.fonts.check(`800 48px "${AIR_FONT}"`, 'Oʻoʻ Gʻgʻ ʼ');
      const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1080; const ctx = cv.getContext('2d');
      // Zaxira shrift bilan solishtirish: Inter yuklangan bo'lsa kengliklar farq qiladi
      ctx.font = AIR_FF(700, 40); const wInter = ctx.measureText('Oʻzbekiston gʻildirak taʼmir Ўзбекистон').width;
      ctx.font = '700 40px monospace'; const wMono = ctx.measureText('Oʻzbekiston gʻildirak taʼmir Ўзбекистон').width;
      const long = 'Burchakli silliqlash mashinasi AGH 3000-230 S HEAVY DUTY — oʻtkir gʻildirak, taʼmirlanadigan korpus, qoʻshimcha choʻtka toʻplami bilan';
      const f2 = airFitLines(ctx, long, 600, 2, [40, 36, 32], 700);
      const fShort = airFitLines(ctx, 'Arra tigʻi', 600, 2, [40, 36, 32], 700);
      const okW = f2.lines.every((l) => { ctx.font = AIR_FF(700, f2.size); return ctx.measureText(l).width <= 600 + 0.5; });
      // chegirma shabloni: rasm + −15% doira
      const img = await airGetImage('tests/fixtures/ai-reklama/tortsovka.webp');
      const tpl = AIR_TEMPLATES.find((t) => t.id === 'chegirma');
      airDraw(ctx, 1080, 1080, tpl, { name: long, title: 'Chegirma boshlandi!', priceLine: '1 854 000 soʻm', oldLine: '2 180 000 soʻm', pct: 15, reason: 'discount', shopName: 'Powerful Group', lang: 'uz', imgs: [img] }, null);
      const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
      // doira markazi: card.x+card.w-74, card.y+84 = (886, 224); markazdan biroz chap-tepada — pushti gradient
      const badge = px(846, 196), cardWhite = px(300, 600);
      return { fontOk, cyr, lat, wInter, wMono, f2, fShort, okW, badge, cardWhite, png: cv.toDataURL('image/png').split(',')[1] };
    });
    assert.equal(r.fontOk, true, 'Inter yuklandi (document.fonts.load)'); assert.ok(r.cyr && r.lat, 'oʻ/gʻ/ʼ va kirill — shrift ichida');
    assert.notEqual(Math.round(r.wInter), Math.round(r.wMono), 'chizishda zaxira shrift emas');
    assert.equal(r.f2.lines.length, 2); assert.equal(r.f2.ellipsis, true); assert.match(r.f2.lines[1], /…$/); assert.equal(r.f2.size, 32, 'avval kichraytirildi');
    assert.ok(r.okW, 'har qator kenglikka sigʻadi');
    assert.deepEqual([r.fShort.lines.length, r.fShort.ellipsis, r.fShort.size], [1, false, 40]);
    assert.ok(r.badge[0] > 180 && r.badge[2] > 60 && r.badge[1] < 140, 'chegirma doirasi (pushti) koʻrinadi: ' + r.badge);
    assert.deepEqual(r.cardWhite.slice(0, 3).map((v) => v > 240), [true, true, true], 'mahsulot oq kartochkada');
    fs.mkdirSync(EVID, { recursive: true }); fs.writeFileSync(path.join(EVID, 'p140-chegirma-uzun-nom.png'), Buffer.from(r.png, 'base64'));
  });
}

// ── 2. Video: MediaRecorder soxta ──
const MOCK = ({ mp4 = true, bytes = 4096 } = {}) => `(() => {
  window.__rec = { started: 0, stopped: 0, lockReq: 0, lockRel: 0, types: [] };
  class MR { constructor(stream, o) { this.o = o; this.state = 'inactive'; window.__rec.mime = o.mimeType; window.__rec.vbps = o.videoBitsPerSecond; window.__rec.tracks = stream.getTracks().map(t => t.kind); }
    static isTypeSupported(t) { window.__rec.types.push(t); return ${mp4} && /^video\\/mp4/.test(t) && !/4D401F/.test(t); }
    start() { this.state = 'recording'; window.__rec.started++; this._i = setInterval(() => this.ondataavailable && this.ondataavailable({ data: new Blob([new Uint8Array(${bytes} / 4)]) }), 50); }
    stop() { if (this.state === 'inactive') return; this.state = 'inactive'; clearInterval(this._i); window.__rec.stopped++; this.ondataavailable({ data: new Blob([new Uint8Array(${bytes} / 4)]) }); setTimeout(() => this.onstop && this.onstop(), 0); } }
  window.MediaRecorder = MR;
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__rec.lockReq++; return { release: async () => { window.__rec.lockRel++; } }; } } });
  window.__vis = 'visible'; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis });
})();`;
async function testVideo() {
  await withAir(async (page) => {
    await page.addScriptTag({ content: MOCK() });
    const r = await page.evaluate(async () => {
      await airLoadFonts();
      const img = await airGetImage('tests/fixtures/ai-reklama/pila-tik.jpg');
      const tpl = AIR_TEMPLATES[0], d = { name: 'Elektropila', title: 'Xit', priceLine: '542 000 soʻm', pct: 0, reason: 'top', lang: 'uz', imgs: [img] };
      const draw = (ctx, W, H, t) => airDraw(ctx, W, H, tpl, d, t, 0.6, 120);
      const out = {};
      out.info = airMp4Info();
      let prog = 0;
      const blob = await airRecordVideo({ draw, dur: 0.6, mood: 'energik', onProgress: (p) => { prog = p; } });
      out.ok = { type: blob.type, size: blob.size, prog, ...JSON.parse(JSON.stringify(window.__rec)) };
      // bekor qilish
      const sig = { aborted: false, onabort: null };
      const p1 = airRecordVideo({ draw, dur: 5, mood: 'yumshoq', signal: sig });
      setTimeout(() => sig.onabort(), 200);
      out.cancel = await p1.then(() => 'blob', (e) => e.code);
      // ilovadan chiqish
      const p2 = airRecordVideo({ draw, dur: 5, mood: 'none' });
      setTimeout(() => { window.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); }, 200);
      out.hidden = await p2.then(() => 'blob', (e) => [e.code, e.message]);
      window.__vis = 'visible';
      out.lock = [window.__rec.lockReq, window.__rec.lockRel];
      return out;
    });
    assert.equal(r.info.ok, true); assert.match(r.info.type, /^video\/mp4/);
    assert.ok(r.info.checks.length >= 4 && r.info.checks.some((c) => !c.ok), 'har tur isTypeSupported bilan tekshirildi (taxmin emas)');
    assert.equal(r.ok.type, 'video/mp4'); assert.ok(r.ok.size > 0); assert.equal(r.ok.prog, 1);
    assert.equal(r.ok.mime, r.info.type); assert.equal(r.ok.vbps, 4000000, '~4 Mbit/s');
    assert.deepEqual(r.ok.tracks.sort(), ['audio', 'video'], 'kuy bilan');
    assert.equal(r.cancel, 'CANCELLED');
    assert.deepEqual(r.hidden, ['HIDDEN', 'Yozish toʻxtatildi — ilovadan chiqildi. Qayta urinib koʻring'], 'ilovadan chiqildi — fayl qaytmaydi');
    assert.deepEqual(r.lock, [3, 3], 'Wake Lock har safar olinadi va qoʻyib yuboriladi');
    // 720×1280, 30 kadr
    assert.deepEqual(await page.evaluate(() => [AIR_VIDEO.w, AIR_VIDEO.h, AIR_VIDEO.fps]), [720, 1280, 30]);
  });
  // MP4 yo'q va 20 MB dan katta
  await withAir(async (page) => {
    await page.addScriptTag({ content: MOCK({ mp4: false }) });
    const r = await page.evaluate(async () => { const i = airMp4Info(); const e = await airRecordVideo({ draw: () => {}, dur: 0.3 }).then(() => null, (x) => x.code); return { ok: i.ok, reason: i.reason, e }; });
    assert.deepEqual(r, { ok: false, reason: 'MP4 yozish qoʻllanmaydi', e: 'NO_MP4' });
  });
  await withAir(async (page) => {
    await page.addScriptTag({ content: MOCK({ bytes: 24 * 1024 * 1024 }) });
    const e = await page.evaluate(() => airRecordVideo({ draw: () => {}, dur: 0.2, mood: 'none' }).then(() => null, (x) => x.code));
    assert.equal(e, 'TOO_BIG');
  });
}

// ── 3. UI 360 px ──
async function testUi360() {
  await withAir(async (page, calls) => {
    await page.addScriptTag({ content: MOCK() });
    await page.evaluate(() => airRender());
    await page.waitForSelector('.air-cand');
    await page.waitForFunction(() => /AI ulangan · bu oy 12\/300/.test(document.querySelector('.air-pill').textContent));
    // nomzod kartochkasi: rasm, nom, sabab nishoni, narx
    const card = await page.$eval('.air-cand', (el) => ({ img: !!el.querySelector('img'), reason: el.querySelector('.air-r').textContent, price: el.querySelector('.air-cand-p').textContent }));
    assert.deepEqual(card, { img: true, reason: 'Chegirma', price: '1 854 000 soʻm2 180 000 soʻm' });
    assert.deepEqual(await page.$$eval('.air-chip', (b) => b.map((x) => x.firstChild.textContent)), ['Hammasi', 'Chegirma', 'Yangi', 'Top', 'Maxsus taklif']);
    await page.click('.air-cand');
    await page.waitForSelector('#air-cv'); await page.waitForSelector('#air-title');
    const nText = calls.filter((c) => c.action === 'text').length;
    assert.equal(await page.inputValue('#air-title'), 'Chegirma boshlandi!');
    // «Boshqa variant» — darhol, so'rovsiz
    await page.click('text=Boshqa variant');
    const t2 = await page.inputValue('#air-title');
    assert.match(t2, /^Variant sarlavha/); assert.equal(calls.filter((c) => c.action === 'text').length, nText, 'serverga qayta soʻrov yoʻq');
    // shablon almashtirish — oldindan ko'rish yangilanadi
    const sig = () => page.$eval('#air-cv', (c) => c.toDataURL().length + ':' + c.toDataURL().slice(-200));
    const before = await sig();
    await page.click('.air-tpl[aria-label="Brend"]');
    assert.notEqual(await sig(), before, 'shablon almashganda koʻrinish yangilandi');
    assert.equal(await page.$eval('.air-tpl.on span', (s) => s.textContent), 'Brend');
    // 360 px: gorizontal surilish yo'q, tugmalar ≥44 px, oldindan ko'rish ekranga sig'adi
    const lay = await page.evaluate(() => {
      const small = [...document.querySelectorAll('#dk-body button')].filter((b) => b.offsetParent && !b.classList.contains('air-tpl') && !b.classList.contains('air-cand'))
        .map((b) => [b.textContent.trim().slice(0, 20), b.getBoundingClientRect().height]).filter(([, h]) => h < 43.5);   // ekrandagi haqiqiy px (html zoom 90% hisobga olingan)
      const cv = document.getElementById('air-cv').getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, small, cvW: cv.width, cvH: cv.height, cvL: cv.left, cvR: cv.right };
    });
    assert.ok(lay.sw <= 360, 'gorizontal surilish yoʻq: ' + lay.sw);
    assert.deepEqual(lay.small, [], 'barcha tugmalar ≥44 px');
    assert.ok(lay.cvL >= 0 && lay.cvR <= 360 && lay.cvW >= 300 && Math.abs(lay.cvW - lay.cvH) < 2, 'post koʻrinishi toʻliq: ' + JSON.stringify(lay));
    await page.screenshot({ path: path.join(EVID, 'p140-telefon-360-post.png'), fullPage: true });
    // video 9:16: oldindan ko'rish ekran balandligiga sig'adi, MP4 holati ko'rinadi
    await page.click('.air-seg button:has-text("Video 9:16")');
    await page.waitForSelector('.air-mp4');
    assert.match(await page.textContent('.air-mp4'), /MP4 yozish mumkin · video\/mp4/);
    const st = await page.$eval('.air-stage', (s) => { const r = s.getBoundingClientRect(); return { w: r.width, h: r.height }; });
    assert.ok(st.h <= 780 && Math.abs(st.w / st.h - 9 / 16) < 0.01, 'story koʻrinishi telefonga toʻliq sigʻadi: ' + JSON.stringify(st));
    await page.$eval('.air-pv', (e) => e.scrollIntoView());
    await page.screenshot({ path: path.join(EVID, 'p140-telefon-360-video.png') });
    // video yaratish (mock) → «Tayyor: MP4»
    await page.click('text=8 s');
    await page.click('text=Videoni yaratish');
    await page.waitForSelector('.air-done', { timeout: 15000 });
    assert.match(await page.textContent('.air-done'), /Tayyor: MP4/);
    // ilovadan chiqish → «Qayta urinish», fayl yo'q
    await page.click('text=Videoni yaratish');
    await page.waitForSelector('.air-prog');
    await page.evaluate(() => { window.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); window.__vis = 'visible'; });
    await page.waitForSelector('.air-prog.bad');
    assert.match(await page.textContent('.air-prog.bad'), /ilovadan chiqildi.*Qayta urinish/);
    assert.equal(await page.$('.air-done'), null, 'buzuq fayl taklif qilinmaydi');
    // Telegram tugmasi — keyingi bosqichgacha o'chiq
    assert.equal(await page.$eval('button:has-text("Telegram")', (b) => b.disabled), true);
  });
}

// ── 4. AI'siz (shablon rejimi) ──
async function testTemplateMode() {
  await withAir(async (page) => {
    await page.evaluate(() => airRender());
    await page.waitForFunction(() => /Shablon rejimi/.test(document.querySelector('.air-pill').textContent));
    await page.waitForSelector('.air-cand'); await page.click('.air-cand');
    await page.waitForSelector('#air-title');
    assert.equal(await page.$('text=AI yozsin'), null, 'AI oʻchiq — «AI yozsin» yoʻq');
    assert.match(await page.textContent('.air-step:has(.air-n:text("2")) small'), /Tayyor shablon/);
  }, { aiOn: false });
}

// ── 5. «Yangi (oq)»: oq fon, ramka/karta yo'q, oq fonli rasm fonga singadi; yangi mahsulotga sukut ──
async function testYangiOq() {
  await withAir(async (page) => {
    const r = await page.evaluate(async () => {
      await airLoadFonts();
      const tpl = AIR_TEMPLATES.find((t) => t.id === 'yangioq');
      const img = await airGetImage('tests/fixtures/ai-reklama/tortsovka.webp');
      const out = {};
      for (const [W, H] of [[1080, 1080], [1080, 1920]]) {
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
        airDraw(ctx, W, H, tpl, { name: 'Tortsovochnaya pila', title: '', priceLine: '1 854 000 soʻm', oldLine: '', pct: 0, reason: 'new', lang: 'uz', shopName: 'Powerful Group', imgs: [img] }, null);
        const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3);
        // burchaklar va chetlar — toza oq (ramka, chegara, to'q fon yo'q)
        const edges = [[4, 4], [W - 5, H - 5], [4, H - 5], [W - 5, H / 2], [4, H / 2], [W / 2, H - 5]].map(([x, y]) => px(x, y));
        // rasm qutisining burchagi — oq rasm foni oq fonga singgan (karta yoki to'rtburchak ko'rinmaydi): to'q/kulrang emas
        const box = W === H ? [260, 160] : [160, 270];
        out[H] = { edges, boxCorner: px(box[0], box[1]) };
      }
      return { out, name: tpl.name, layout: tpl.layout };
    });
    assert.deepEqual([r.name, r.layout], ['Yangi (oq)', 'fresh']);
    for (const H of ['1080', '1920']) {
      for (const e of r.out[H].edges) assert.ok(e.every((v) => v >= 250), `${H}: chet oq (ramka yoʻq): ${e}`);
      assert.ok(r.out[H].boxCorner.every((v) => v >= 225), `${H}: rasm burchagi fonga singgan: ${r.out[H].boxCorner}`);
    }
    // yangi kelgan mahsulot tanlansa — sukut bo'yicha «Yangi (oq)»
    await page.evaluate(() => airRender());
    await page.waitForSelector('.air-cand');
    await page.click('.air-cand:nth-child(2)');
    await page.waitForSelector('.air-tpl.on');
    assert.equal(await page.$eval('.air-tpl.on span', (s) => s.textContent), 'Yangi (oq)');
    assert.deepEqual(await page.$$eval('.air-tpl span', (a) => a.map((x) => x.textContent)), ['Chegirma', 'Yangi (oq)', 'Katta narx', 'Brend']);
  });
}

module.exports = {
  name: 'P140 — AI-reklama 3-bosqich: canvas, video (MediaRecorder mock), UI 360 px',
  cases: [
    { name: 'canvas: Inter yuklanadi; oʻ/gʻ/ʼ, kirill; 2 qatorga sigʻmagan nom — «…»; chegirma doirasi', run: testCanvas },
    { name: 'video: MP4 (isTypeSupported), 4 Mbit/s, kuy, Wake Lock; bekor qilish; ilovadan chiqish — fayl yoʻq; NO_MP4; TOO_BIG', run: testVideo },
    { name: 'UI 360 px: nomzod kartochkasi, «Boshqa variant» darhol, shablon almashtirish, tugmalar ≥44 px, 9:16 sigʻadi, qayta urinish', run: testUi360 },
    { name: 'shablon rejimi: «Shablon rejimi» holati, «AI yozsin» yoʻq', run: testTemplateMode },
    { name: '«Yangi (oq)»: oq fon, ramka yoʻq, rasm foni singadi; yangi mahsulotga sukut; 4 ta shablon', run: testYangiOq },
  ],
};
