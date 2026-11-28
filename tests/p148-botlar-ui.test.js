// P148 — v25.9 (yagona bot, 6-bosqich): Sozlamalar → «Botlar va avtomatik vazifalar» (haqiqiy index.html, telefon 390 px).
//  • Bitta «Asosiy bot» kartasi: hisobot, AI-reklama/avtopilot, xodim so'rovlari, do'kon xaridorlari — hammasi shu botda.
//  • «Botni sozlash» bosilsa — 4 qator aniq natija: bot ishlayaptimi, webhook, menyu (uz/ru), tavsif.
//  • Bot o'chirilgan / token yaroqsiz — «Bot topilmadi — BotFather’da tekshiring».
//  • Xodim (administrator emas) — sozlash tugmasi yo'q; token sahifada yo'q; tugma ≥ 44 px; gorizontal aylantirish yo'q.
//  • Onlayn-do'kon → Telegram: alohida token maydoni yo'q, asosiy bot nomi.
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;
const SHOT = process.env.P148_SHOT || '';

async function run() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    await page.evaluate(() => {
      S.settings.tgBotTokenSet = true; S.settings.tgChatId = '-1001';
      window.__calls = []; window.__mode = 'before';
      tgqCall = async (b) => ({ ok: true, set: true, merged: true, bot: 'powerful_bot', links: 2 });
      tgBotCall = async (b) => {
        __calls.push(b.action);
        await new Promise((r) => setTimeout(r, 30));
        if (__mode === 'gone') return { ok: false, bot: { ok: false, error: 'Bot topilmadi — BotFather’da tekshiring' }, webhook: { ok: false }, menu: { ok: false }, description: { ok: false } };
        if (b.action === 'status' && __mode === 'before') return { ok: false, bot: { ok: true, username: 'powerful_bot', name: 'Powerful' }, webhook: { ok: false, error: 'Hali oʻrnatilmagan — «Botni sozlash»ni bosing' }, menu: { ok: false, uz: true, ru: false }, description: { ok: false } };
        return { ok: true, bot: { ok: true, username: 'Powerful_hisobot', name: 'Powerful', nameOk: true, expected: 'Powerful_hisobot' }, webhook: { ok: true, pending: 0 }, menu: { ok: true, uz: true, ru: true }, description: { ok: true }, staffMenus: 2 };
      };
      stBotsSheet();
    });
    await page.waitForFunction(() => document.querySelectorAll('.bt-chk-r').length === 4);
    const before = await page.evaluate(() => ({ rows: [...document.querySelectorAll('.bt-chk-r')].map((r) => (r.classList.contains('ok') ? '✓ ' : '✕ ') + r.querySelector('b').textContent),
      box: document.querySelector('.bs-box').innerText }));
    assert.deepEqual(before.rows, ['✓ Bot ishlayapti', '✕ Webhook oʻrnatilmagan', '✕ Menyu oʻrnatilmagan', '✕ Tavsif oʻrnatilmagan']);
    assert.match(before.box, /Yetishmaydi: ruscha/);
    for (const w of ['Asosiy bot · @powerful_bot', 'Kunlik hisobot', 'AI-reklama va avtopilot', 'Xodim soʻrovlari', 'Doʻkon boti vazifasi — xaridorlar', 'ulangan xodim: 2']) assert.ok(before.box.includes(w), w);
    assert.ok(!/So'rov boti ·|alohida bot$/m.test(before.box), 'alohida so\'rov boti kartasi yo\'q');
    if (SHOT) await page.screenshot({ path: SHOT + '-1-oldin.png' });
    // «Botni sozlash»
    const h = await page.evaluate(() => document.getElementById('bt-setup-btn').getBoundingClientRect().height);
    assert.ok(h >= 43.5, 'tugma ≥ 44 px: ' + h);
    await page.click('#bt-setup-btn');
    await page.waitForFunction(() => document.querySelectorAll('.bt-chk-r.ok').length === 4);
    const after = await page.evaluate(() => ({ rows: [...document.querySelectorAll('.bt-chk-r')].map((r) => r.querySelector('b').textContent + ' — ' + r.querySelector('small').textContent), calls: __calls.slice() }));
    assert.deepEqual(after.calls, ['status', 'setup']);
    assert.deepEqual(after.rows, ['Bot ishlayapti — @Powerful_hisobot · Powerful', 'Webhook oʻrnatilgan — Xabarlar darhol qabul qilinadi',
      'Menyu oʻrnatilgan — Oʻzbekcha va ruscha · xaridorga faqat /start va yordam', 'Tavsif oʻrnatilgan — Oʻzbekcha va ruscha']);
    if (SHOT) await page.screenshot({ path: SHOT + '-2-sozlandi.png' });
    // boshqa bot ulangan — nom bo'yicha ogohlantirish (sariq qator)
    await page.evaluate(() => { __mode = 'other'; const f = tgBotCall; tgBotCall = async (b) => { const r = await f(b); if (__mode === 'other') r.bot = { ok: true, username: 'powerful_onlaynbot', name: 'Onlayn', nameOk: false, expected: 'Powerful_hisobot',
      warning: 'Ulangan bot @powerful_onlaynbot — kutilgan @Powerful_hisobot. Sozlamalar → Asosiy bot: @Powerful_hisobot tokenini saqlang.' }; return r; }; });
    await page.click('#bt-setup-btn');
    await page.waitForSelector('.bt-chk-r.warn');
    const warn = await page.evaluate(() => document.querySelector('.bt-chk-r.warn').innerText.replace(/\s+/g, ' ').trim());
    assert.equal(warn, '! Bot nomi mos emas Ulangan bot @powerful_onlaynbot — kutilgan @Powerful_hisobot. Sozlamalar → Asosiy bot: @Powerful_hisobot tokenini saqlang.');
    if (SHOT) await page.screenshot({ path: SHOT + '-2b-nom.png' });
    // bot o'chirilgan / token yaroqsiz
    await page.evaluate(() => { __mode = 'gone'; });
    await page.click('#bt-setup-btn');
    await page.waitForFunction(() => /Bot topilmadi/.test(document.querySelector('.bt-chk')?.textContent || ''));
    const gone = await page.evaluate(() => [...document.querySelectorAll('.bt-chk-r')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
    assert.deepEqual(gone, ['✕ Bot ishlamayapti Bot topilmadi — BotFather’da tekshiring']);
    const head = await page.evaluate(() => document.querySelector('.bt-bot-h').innerText.replace(/\s+/g, ' '));
    assert.ok(!/@powerful_bot|Ulangan/.test(head) && /Ulanmagan/.test(head), 'bot topilmasa — eski nom va «Ulangan» yo\'q: ' + head);
    if (SHOT) await page.screenshot({ path: SHOT + '-3-topilmadi.png' });
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(ov <= 1, 'gorizontal aylantirish yo\'q: ' + ov);
    assert.ok(!/[0-9]{5,}:[A-Za-z0-9_-]{20,}/.test(await page.evaluate(() => document.body.innerText)), 'sahifada token yo\'q');
    // xodim (administrator emas) — sozlash tugmasi va holat yo'q
    await page.evaluate(() => { closeSheet(); window.__adm = fwServerAdmin; fwServerAdmin = () => false; __calls.length = 0; stBotsSheet(); });
    const staff = await page.evaluate(() => ({ btn: !!document.getElementById('bt-setup-btn'), calls: __calls.slice(), card: !!document.querySelector('.bt-map') }));
    assert.deepEqual(staff, { btn: false, calls: [], card: true });
    // Onlayn-do'kon → Telegram: token maydoni yo'q, asosiy bot
    await page.evaluate(() => { closeSheet(); fwServerAdmin = __adm; dkBotCall = async () => ({ ok: true, merged: true, legacy: false, bot: { username: 'powerful_bot', name: 'Powerful' } }); dkTelegramSheet(); });
    await page.waitForFunction(() => /@powerful_bot/.test(document.getElementById('dk-bot-card')?.textContent || ''));
    const dk = await page.evaluate(() => ({ tok: !!document.getElementById('dk-tok'), txt: document.querySelector('.bs-box').innerText }));
    assert.equal(dk.tok, false, 'alohida do\'kon boti tokeni so\'ralmaydi');
    assert.match(dk.txt, /Bu buyruq mavjud emas/); assert.match(dk.txt, /Botni sozlash va tekshirish/);
    if (SHOT) await page.screenshot({ path: SHOT + '-4-dokon.png' });
    assert.deepEqual(errors, [], 'sahifada JS xatosi yoʻq');
  } finally { await browser.close(); }
}
module.exports = { name: 'P148 — Botlar sahifasi: yagona bot, «Botni sozlash» natijasi', cases: [{ name: 'bitta bot kartasi, sozlash natijasi (4 qator), «Bot topilmadi», xodimga yopiq, do\'konda token yo\'q, 390 px', run }] };
