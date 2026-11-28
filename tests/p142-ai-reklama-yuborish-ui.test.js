// P142 — v25.8 AI-reklama, 4-bosqich: «Telegram'ga» (brauzer). Haqiqiy js/main.js + js/ai-reklama*.js; server — soxta (Playwright route).
//  • Tasdiqlash oynasi (kanal, format, narx) → yuborish; foto — JPEG (base64), narx satri — serverdan kelgani (brauzer hisoblamaydi).
//  • Xato → «Qayta yuborish» O'SHA kalit bilan (takroriy post yo'q); kontent o'zgarsa — yangi kalit.
//  • Narx o'zgargan (409) — yangi narx qo'yiladi, rasm qayta chiziladi, keyingi yuborish yangi narx bilan.
//  • Video: bir martalik havolaga yuklash (PUT) → publish(videoPath); video yaratilmagan bo'lsa — tugma o'chiq.
//  • Tarix: holat, xato, «Kanalda ochish»; xato foto — «Qayta yuborish» tarixdagi kalit bilan.
//  • Ruxsat: reklama.publish yo'q — tugma yo'q; kanal yo'q — tugma o'chiq va sababi ko'rinadi.
const assert = require('node:assert/strict');
const path = require('path');
const EVID = path.join(__dirname, 'evidence');
const { _withAir: withAir, _MOCK: MOCK } = require('./p140-ai-reklama-canvas-video-ui.test.js');

const pick = async (page, n = 1) => { await page.evaluate(() => airRender()); await page.waitForSelector('.air-cand'); await page.click(`.air-cand:nth-child(${n})`); await page.waitForSelector('#air-cv'); await page.waitForSelector('#air-title'); };
const sendViaSheet = async (page) => { await page.click('button.tg'); await page.waitForSelector('.air-ask'); await page.click('#bs-ov button:has-text("Yuborish")'); };

async function testPhotoRetryAndPrice() {
  let n = 0;
  await withAir(async (page, calls) => {
    await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<div id="bs-ov" hidden></div>'); });
    await pick(page);
    await page.waitForFunction(() => !document.querySelector('button.tg').disabled);
    assert.match(await page.textContent('.air-tgl'), /Kanal: -1002193336308/);
    await sendViaSheet(page);
    await page.waitForSelector('.air-prog.bad');
    assert.match(await page.textContent('.air-prog.bad'), /Telegram javob bermadi.*Qayta yuborish/);
    await page.click('.air-prog.bad button');
    await page.waitForSelector('.air-done a');
    assert.match(await page.textContent('.air-done'), /Kanalga yuborildi/);
    assert.equal(await page.getAttribute('.air-done a', 'href'), 'https://t.me/c/2193336308/77');
    const pubs = calls.filter((c) => c.action === 'publish');
    assert.equal(pubs.length, 2);
    assert.equal(pubs[0].idemKey, pubs[1].idemKey, 'qayta yuborish — oʻsha kalit (takroriy post yoʻq)');
    assert.equal(pubs[0].format, 'photo'); assert.match(pubs[0].photo, /^\/9j\//, 'JPEG'); assert.ok(pubs[0].photo.length < 420000, '≤300 KB');
    assert.equal(pubs[0].priceLine, '1 854 000 soʻm'); assert.equal(pubs[0].oldLine, '2 180 000 soʻm'); assert.equal(pubs[0].template, 'chegirma');
    assert.deepEqual(pubs[0].text, { title: 'Chegirma boshlandi!', body: 'Ustalar uchun.\nShoshiling.', tags: ['chegirma', 'arra', 'usta'] });
    // narx o'zgardi: yangi narx qo'yiladi, keyingi yuborish yangi narx va YANGI kalit bilan
    await page.fill('#air-title', 'Yangi sarlavha'); await page.dispatchEvent('#air-title', 'input');
    await sendViaSheet(page);
    await page.waitForSelector('.air-prog.bad');
    assert.match(await page.textContent('.air-prog.bad'), /Narx oʻzgardi: endi 1 790 000 soʻm/);
    assert.match(await page.textContent('.air-cand.on .air-cand-p'), /1 854 000/, 'roʻyxat qayta chizilmaydi (faqat muharrir yangilanadi)');
    await page.click('.air-prog.bad button');
    await page.waitForSelector('.air-done a');
    const p4 = calls.filter((c) => c.action === 'publish');
    assert.equal(p4.length, 4);
    assert.equal(p4[3].priceLine, '1 790 000 soʻm', 'yangi narx bilan'); assert.equal(p4[3].oldLine, '');
    assert.notEqual(p4[2].idemKey, pubs[0].idemKey, 'kontent oʻzgardi — yangi kalit');
  }, { handle: (b) => {
    if (b.action !== 'publish') return null;
    n++;
    if (n === 1) return [502, { ok: false, code: 'SEND_FAILED', error: 'Telegram javob bermadi — kanalni tekshiring' }];
    if (n === 3) return [409, { ok: false, code: 'PRICE_CHANGED', error: 'Narx oʻzgargan', price: { line: '1 790 000 soʻm', oldLine: '', pct: 0 } }];
    return [200, { ok: true, url: 'https://t.me/c/2193336308/77', id: 'x' }];
  } });
}

async function testVideoUpload() {
  const puts = [];
  await withAir(async (page, calls) => {
    await page.addScriptTag({ content: MOCK() });
    await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<div id="bs-ov" hidden></div>'); });
    await pick(page);
    await page.click('.air-seg button:has-text("Video 9:16")');
    assert.equal(await page.$eval('button.tg', (b) => b.disabled), true, 'video yaratilmagan — tugma oʻchiq');
    assert.match(await page.getAttribute('button.tg', 'title'), /Videoni yaratish/);
    await page.click('text=8 s'); await page.click('text=Videoni yaratish');
    await page.waitForSelector('.air-done', { timeout: 15000 });
    await sendViaSheet(page);
    await page.waitForSelector('.air-done a', { timeout: 15000 });
    const up = calls.find((c) => c.action === 'upload_url'), pub = calls.find((c) => c.action === 'publish');
    assert.ok(up && pub); assert.equal(up.idemKey, pub.idemKey);
    assert.deepEqual([pub.format, pub.videoPath, pub.dur, pub.photo], ['video', `baza/${pub.idemKey}.mp4`, 8, undefined]);
    assert.equal(puts.length, 1); assert.equal(puts[0].method, 'PUT'); assert.ok(puts[0].size > 0); assert.match(puts[0].ct, /multipart\/form-data/);
  }, { handle: (b) => b.action === 'upload_url' ? [200, { ok: true, path: `baza/${b.idemKey}.mp4`, signedUrl: `https://x.supabase.co/storage/v1/object/upload/sign/ai-ads-tmp/baza/${b.idemKey}.mp4?token=t` }]
      : b.action === 'publish' ? [200, { ok: true, url: 'https://t.me/c/2193336308/90' }] : null,
    routes: [{ url: '**/storage/v1/object/upload/sign/**', handler: async (route) => { const q = route.request(); puts.push({ method: q.method(), size: (q.postDataBuffer() || []).length, ct: q.headers()['content-type'] || '' });
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"Key":"ok"}' }); } }] });
}

async function testHistoryAndPerms() {
  const HIST = [
    { id: 'h1', pid: 11, format: 'photo', template: 'kattanarx', status: 'failed', error: 'Bot kanalda administrator emas', tries: 1, by: 'Admin', at: '2026-11-26T10:00:00Z', name: 'Tortsovochnaya pila', title: 'Eski sarlavha', body: 'Eski matn', tags: ['arra'], reason: 'discount', idemKey: 'old-key-123' },
    { id: 'h2', pid: 12, format: 'video', template: 'yangioq', status: 'sent', tries: 1, by: 'Admin', at: '2026-11-26T09:00:00Z', sentAt: '2026-11-26T09:00:05Z', url: 'https://t.me/c/2193336308/5', name: 'Zanjirli elektroarra', title: 'Yangi', reason: 'new' },
  ];
  await withAir(async (page, calls) => {
    await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<div id="bs-ov" hidden></div>'); AIR.sub = 'hist'; airRender(); });
    await page.waitForSelector('.air-hi');
    const cards = await page.$$eval('.air-hi', (a) => a.map((x) => x.innerText));
    assert.match(cards[0], /Xato[\s\S]*Tortsovochnaya pila[\s\S]*administrator emas[\s\S]*Qayta yuborish/);
    assert.match(cards[1], /Yuborildi[\s\S]*Video[\s\S]*Kanalda ochish/);
    assert.equal(await page.getAttribute('.air-hi:nth-child(2) a', 'href'), 'https://t.me/c/2193336308/5');
    await page.click('.air-hi:nth-child(1) button:has-text("Qayta yuborish")');
    await page.waitForSelector('#air-title');
    await page.waitForFunction(() => document.querySelector('#air-cv'));
    assert.equal(await page.inputValue('#air-title'), 'Eski sarlavha');
    assert.equal(await page.$eval('.air-tpl.on span', (x) => x.textContent), 'Katta narx', 'shablon tiklandi');
    await page.waitForFunction(() => !document.querySelector('button.tg').disabled);
    await sendViaSheet(page);
    await page.waitForSelector('.air-done a');
    const pub = calls.find((c) => c.action === 'publish');
    assert.equal(pub.idemKey, 'old-key-123', 'oʻsha post qayta yuboriladi (yangi qator emas)');
    assert.equal(pub.priceLine, '1 854 000 soʻm', 'narx — serverdan (product)');
  }, { handle: (b) => b.action === 'history' ? [200, { ok: true, items: HIST }]
      : b.action === 'product' ? [200, { ok: true, item: { pid: 11, name: 'Tortsovochnaya pila MS 1900-255 L', img: ['tests/fixtures/ai-reklama/tortsovka.webp'], line: '1 854 000 soʻm', oldLine: '2 180 000 soʻm', pct: 15, stock: 3, cur: 'UZS' } }]
      : b.action === 'publish' ? [200, { ok: true, url: 'https://t.me/c/2193336308/78' }] : null });
  // kanal yo'q — tugma o'chiq, sababi; reklama.publish yo'q — tugma umuman yo'q
  await withAir(async (page) => {
    await pick(page);
    await page.waitForSelector('.air-mp4.bad');
    assert.match(await page.textContent('.air-pv'), /Reklama kanali koʻrsatilmagan/);
    assert.equal(await page.$eval('button.tg', (b) => b.disabled), true);
  }, { telegram: { bot: true, channel: null, ownerGroup: false } });
  await withAir(async (page) => {
    await page.evaluate(() => { CURRENT_USER = { kind: 'staff', perms: new Set(['reklama.view', 'reklama.create']) }; window.fwServerAdmin = () => false; });
    await pick(page);
    assert.equal(await page.$('button.tg'), null, 'reklama.publish yoʻq — tugma yoʻq');
    assert.equal(await page.$('.air-tgl'), null);
  });
}

// ── 5-bosqich: Navbat va avtopilot sozlamasi ──
async function testQueueAndAutopilot() {
  const DRAFT = { id: '11111111-2222-4333-8444-555555555555', pid: 11, at: '2026-11-27T05:20:00Z', expiresAt: new Date(Date.now() + 5 * 3600000).toISOString(),
    price: { line: '1 854 000 soʻm', oldLine: '' }, name: 'Tortsovochnaya pila MS 1900-255 L', title: 'Yangi keldi', body: 'Aniq kesish.\nTez oling.', tags: ['arra'], reason: 'new',
    img: 'tests/fixtures/ai-reklama/tortsovka.webp', aiText: false, idemKey: 'ap-2026-11-27-10' };
  let drafts = [DRAFT, { ...DRAFT, id: '11111111-2222-4333-8444-666666666666', idemKey: 'ap-2026-11-27-18', name: 'Elektroarra' }];
  const saved = [];
  await withAir(async (page, calls) => {
    await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<div id="bs-ov" hidden></div>'); AIR.sub = 'queue'; airRender(); });
    await page.waitForSelector('.air-dr');
    assert.match(await page.textContent('#air-body'), /Avtopilot: tasdiqlash bilan · 10:00, 18:00 · kuniga 3/);
    await page.waitForFunction(() => [...document.querySelectorAll('.air-dr img')].every((i) => i.complete));
    await page.screenshot({ path: path.join(EVID, 'p142-navbat-360.png'), fullPage: true });
    const card = await page.$eval('.air-dr', (e) => e.innerText);
    assert.match(card, /Tasdiqlash kutilmoqda[\s\S]*(4|5) soat qoldi[\s\S]*Tortsovochnaya pila[\s\S]*1 854 000 soʻm[\s\S]*Yangi keldi/);
    // tasdiqlash — oyna, so'ng draft_action approve
    await page.click('.air-dr:nth-child(1) button:has-text("Tasdiqlash va yuborish")');
    await page.waitForSelector('.air-ask');
    assert.match(await page.textContent('.air-ask'), /Mahsulotning oʻz rasmi/);
    await page.click('#bs-ov button:has-text("Yuborish")');
    await page.waitForFunction(() => document.querySelectorAll('.air-dr').length === 1);
    assert.deepEqual(calls.filter((c) => c.action === 'draft_action').map((c) => [c.id, c.op]), [[DRAFT.id, 'approve']]);
    // o'tkazish
    await page.click('.air-dr button:has-text("Oʻtkazish")');
    await page.waitForSelector('.air-empty');
    assert.match(await page.textContent('.air-empty'), /Tasdiqlash kutayotgan post yoʻq/);
    // «Shablon bilan»: muharrir ochiladi — matn, «Yangi (oq)» shabloni, qoralama kaliti
    drafts = [DRAFT];
    await page.evaluate(() => { AIR.queue = null; airRenderQueue(); });
    await page.waitForSelector('.air-dr');
    await page.click('.air-dr button:has-text("Shablon bilan")');
    await page.waitForSelector('#air-title'); await page.waitForSelector('#air-cv');
    assert.equal(await page.inputValue('#air-title'), 'Yangi keldi');
    assert.equal(await page.$eval('.air-tpl.on span', (x) => x.textContent), 'Yangi (oq)');
    await page.waitForFunction(() => !document.querySelector('button.tg').disabled);
    await sendViaSheet(page);
    await page.waitForSelector('.air-done a');
    assert.equal(calls.find((c) => c.action === 'publish').idemKey, DRAFT.idemKey, 'qoralama kaliti — oʻsha post');
    // Sozlamalar: avtopilot
    await page.evaluate(() => { AIR.sub = 'set'; airRender(); });
    await page.waitForSelector('#air-ap-on');
    assert.equal(await page.isChecked('#air-ap-on'), false);
    await page.check('#air-ap-on');
    await page.waitForSelector('.air-ap .air-seg');
    await page.click('.air-ap button:has-text("Toʻliq avtomat")');
    assert.match(await page.textContent('.air-ap'), /tasdiqingizsiz kanalga chiqadi/);
    for (const h of ['08:00', '12:00', '14:00', '16:00', '20:00']) await page.click(`.air-ap .air-chip:has-text("${h}")`);
    assert.equal(await page.$$eval('.air-ap .air-chip.on', (a) => a.length), 6, 'eng koʻpi 6 ta soat');
    await page.$eval('.air-ap', (e) => e.scrollIntoView());
    await page.screenshot({ path: path.join(EVID, 'p142-avtopilot-sozlama-360.png') });
    await page.click('.air-ap .air-seg:last-of-type button:has-text("2")');
    await page.click('button:has-text("Saqlash")');
    await page.waitForFunction(() => window.__toasts && window.__toasts.some((t) => /Saqlandi/.test(t.msg)));
    assert.deepEqual(saved[0].autopilot, { enabled: true, mode: 'auto', hours: [8, 10, 12, 14, 16, 18], perDay: 2 });
  }, { handle: (b) => {
    if (b.action === 'drafts') return [200, { ok: true, autopilot: { enabled: true, mode: 'approve', hours: [10, 18], perDay: 3 }, items: drafts }];
    if (b.action === 'draft_action') { drafts = drafts.filter((d) => d.id !== b.id); return [200, { ok: true, status: b.op === 'approve' ? 'sent' : 'skipped' }]; }
    if (b.action === 'product') return [200, { ok: true, item: { pid: 11, name: DRAFT.name, img: ['tests/fixtures/ai-reklama/tortsovka.webp'], line: '1 854 000 soʻm', oldLine: '', pct: 0, stock: 3, cur: 'UZS' } }];
    if (b.action === 'publish') return [200, { ok: true, url: 'https://t.me/c/2193336308/9' }];
    if (b.action === 'settings_get') return [200, { ok: true, settings: { channel: '-1002193336308', lang: 'uz', criteria: { discount: true, new: true, stuck: true, top: true, newDays: 14, stuckDays: 30, topDays: 30, topN: 10, repeatDays: 7 },
      autopilot: { enabled: false, mode: 'approve', hours: [10, 18], perDay: 3 } } }];
    if (b.action === 'settings_save') { saved.push(b.settings); return [200, { ok: true, settings: b.settings }]; }
    return null;
  } });
}

module.exports = {
  name: 'P142 — AI-reklama 4-bosqich: «Telegram\'ga» (tasdiqlash, qayta yuborish, narx o\'zgarishi, video yuklash, tarix, ruxsat)',
  cases: [
    { name: 'foto: tasdiqlash → yuborish; xato → «Qayta yuborish» o\'sha kalit; narx o\'zgardi — yangi narx va yangi kalit', run: testPhotoRetryAndPrice },
    { name: 'video: yaratilmagan — tugma o\'chiq; yuklash (PUT) → publish(videoPath) bir xil kalit bilan', run: testVideoUpload },
    { name: 'Navbat: qoralama (vaqt, narx, matn), tasdiqlash oynasi, o\'tkazish, «Shablon bilan» — o\'sha kalit; avtopilot sozlamasi (avtomat ogohlantirishi, ≤6 soat)', run: testQueueAndAutopilot },
    { name: 'tarix: holat/xato/havola; «Qayta yuborish» — matn, shablon tiklanadi, tarixdagi kalit; kanal yo\'q / ruxsat yo\'q', run: testHistoryAndPerms },
  ],
};
