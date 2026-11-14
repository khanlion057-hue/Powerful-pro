// P67 — v24.8.1 (egasi talabi): logotip HECH QAYERDA ramkasiz.
//  • Yuklangan JPG logotipning oq foni (kulrang/qorong'i fonda to'rtburchak «ramka») brauzerda olib tashlanadi:
//    chetga tutash fon shaffof, ichki oq joylar saqlanadi, rasm mazmun chegarasida kesiladi.
//  • Qorong'i mavzuda — qora yozuv oqqa aylangan nusxa; kirish/yuklanish (on-light) — doim yorug' nusxa.
//  • Natija shu qurilmada saqlanadi — keyingi chizishda darhol tozalangan rasm (miltillamaydi).
//  • Standart logotip (shaffof PNG) — tegilmaydi. Yuklashda ham shaffof PNG saqlanadi.
//  • CSS: logotip atrofidagi chegara/soya/fon/burchak (do'kon tugmasi, do'konlar ro'yxati, yon menyu chizig'i) yo'q.
const assert = require('node:assert/strict');
const path = require('path');
const { loadApp, ROOT } = require('./helpers/load-app');

const LOGO_URL = 'https://logo.test/brand/logo-x.jpg';

// Sahifa ichida: oq fon + ko'k «F» blok + qora yozuv + ichida oq teshik — JPG
const MAKE_JPG = `(() => {
  const c = document.createElement('canvas'); c.width = 300; c.height = 240; const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 300, 240);
  x.fillStyle = '#1d6fd1'; x.fillRect(60, 30, 180, 120);
  x.fillStyle = '#ffffff'; x.fillRect(120, 70, 60, 40);          // ichki oq teshik — fon EMAS, saqlanishi kerak
  x.fillStyle = '#111111'; x.fillRect(50, 170, 200, 30);          // qora «yozuv»
  return c.toDataURL('image/jpeg', 0.9);
})()`;

async function open() {
  let jpg = null;
  const app = await loadApp({ mockRoutes: [{ url: 'https://logo.test/**', handler: (route) => route.fulfill({ status: 200, contentType: 'image/jpeg', headers: { 'Access-Control-Allow-Origin': '*' }, body: jpg }) }] });
  const durl = await app.page.evaluate(MAKE_JPG);
  jpg = Buffer.from(durl.split(',')[1], 'base64');
  await app.page.addStyleTag({ path: path.join(ROOT, 'css', 'design-system.css') });
  return app;
}
// data URL rasmning (x,y) pikseli alfa qiymati va o'lchami
const PIX = `async (src, pts) => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0); return { w: im.width, h: im.height, px: pts.map(([a, b]) => Array.from(x.getImageData(Math.round(a * im.width), Math.round(b * im.height), 1, 1).data)) }; }`;

module.exports = {
  name: 'P67 — logotip ramkasiz (fon olib tashlanadi, CSS ramkalar yo\'q)',
  cases: [
    { name: 'yuklangan JPG: fon shaffof, ichki oq saqlanadi, kesiladi; qorong\'i nusxa; kesh; on-light — yorug\'', async run() {
      const { browser, page, consoleErrors } = await open();
      try {
        await page.evaluate((u) => { S.settings = Object.assign(S.settings || {}, { brandLogo: u }); try { localStorage.removeItem('fw_brand_clean'); } catch (e) {}
          document.body.innerHTML = `<div id="a">${fwBrandLockup()}</div><div id="b" class="fw-login-card">${fwBrandLockup('lg on-light')}</div><div id="c">${fwBrandMark()}</div>`;
          fwApplyBrand(); }, LOGO_URL);
        await page.waitForFunction(() => document.querySelectorAll('img[data-fw-clean]').length === 3, null, { timeout: 8000 });
        const st = await page.evaluate(() => ({ a: document.querySelector('#a img').getAttribute('src'), b: document.querySelector('#b img').getAttribute('src'), c: document.querySelector('#c img').getAttribute('src'),
          cache: JSON.parse(localStorage.getItem('fw_brand_clean') || 'null') }));
        assert.match(st.a, /^data:image\/png;base64,/, 'tozalangan PNG');
        assert.equal(st.a, st.c, 'kichik belgi ham tozalangan');
        assert.ok(st.cache && st.cache.src === 'https://logo.test/brand/logo-x.jpg' && st.cache.light === st.a && st.cache.dark && st.cache.dark !== st.a, 'kesh: yorug\' + qorong\'i');
        // Kesilgan: 300x240 dan mazmun (200x170 atrofi) — burchak shaffof, ichki oq teshik shaffof EMAS
        const r = await page.evaluate(`(${PIX})(${JSON.stringify(st.a)}, [[0.01,0.01],[0.99,0.99],[0.5,0.35],[0.5,0.88],[0.97,0.1]])`);
        assert.ok(r.w < 230 && r.h < 200 && r.w > 190, `kesilgan o'lcham ${r.w}x${r.h}`);
        assert.equal(r.px[0][3], 0, 'chap-yuqori burchak shaffof');
        assert.equal(r.px[1][3], 0, 'o\'ng-pastki burchak shaffof');
        assert.ok(r.px[2][3] > 240 && r.px[2][0] > 230, 'ichki oq teshik saqlangan (oq, shaffof emas)');
        assert.ok(r.px[3][3] > 240 && r.px[3][0] < 60, 'qora yozuv');
        assert.equal(r.px[4][3], 0, 'ko\'k blok yonidagi oq fon shaffof');
        // Qorong'i mavzu: qora yozuv → oq; on-light (kirish oynasi) — yorug' nusxa qoladi
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        await page.waitForFunction((d) => document.querySelector('#a img').getAttribute('src') === d, st.cache.dark, { timeout: 3000 });
        const dk = await page.evaluate(() => ({ a: document.querySelector('#a img').getAttribute('src'), b: document.querySelector('#b img').getAttribute('src') }));
        assert.equal(dk.b, st.cache.light, 'kirish kartasi — doim yorug\' nusxa');
        const rd = await page.evaluate(`(${PIX})(${JSON.stringify(dk.a)}, [[0.5,0.88],[0.5,0.2]])`);
        assert.ok(rd.px[0][0] > 200, 'qorong\'i nusxada yozuv oq');
        assert.ok(rd.px[1][2] > 150 && rd.px[1][0] < 80, 'rangli qism o\'zgarmagan (ko\'k)');
        // Keyingi chizish — darhol (sinxron) tozalangan rasm
        const again = await page.evaluate(() => { document.documentElement.removeAttribute('data-theme'); const d = document.createElement('div'); d.innerHTML = fwBrandLockup(); const i = d.querySelector('img'); return { src: i.getAttribute('src'), cl: i.hasAttribute('data-fw-clean') }; });
        assert.equal(again.src, st.cache.light); assert.equal(again.cl, true);
        assert.deepEqual(consoleErrors, []);
      } finally { await browser.close(); }
    } },
    { name: 'standart logotip — tegilmaydi (asl PNG, kesh yo\'q)', async run() {
      const { browser, page } = await open();
      try {
        const r = await page.evaluate(async () => { S.settings = Object.assign(S.settings || {}, { brandLogo: '' }); try { localStorage.removeItem('fw_brand_clean'); localStorage.removeItem('fw_brand'); } catch (e) {}
          document.body.innerHTML = fwBrandLockup() + fwBrandMark(); fwApplyBrand(); const c = await fwLogoClean(fwBrand().logo);
          return { srcs: [...document.querySelectorAll('img')].map(i => i.getAttribute('src')), cl: document.querySelectorAll('[data-fw-clean]').length, c, k: localStorage.getItem('fw_brand_clean') }; });
        assert.deepEqual(r.srcs, ['assets/brand-logo.png', 'assets/brand-logo.png']);
        assert.equal(r.cl, 0); assert.equal(r.c, null); assert.equal(r.k, null);
      } finally { await browser.close(); }
    } },
    { name: 'yuklash: rasm shaffof PNG\'ga aylanadi (oq fon yo\'q); rasm ochilmasa — asl rasm, xato yo\'q', async run() {
      const { browser, page, consoleErrors } = await open();
      try {
        const out = await page.evaluate(async (mk) => { const d = eval(mk); const c = await stBrandLogoClean(d); return c && c.light; }, MAKE_JPG);
        assert.match(out, /^data:image\/png;base64,/);
        const r = await page.evaluate(`(${PIX})(${JSON.stringify(out)}, [[0,0],[0.5,0.35]])`);
        assert.equal(r.px[0][3], 0, 'burchak shaffof'); assert.ok(r.px[1][3] > 240, 'ichki oq saqlangan');
        // Rasm ochilmasa (tarmoq/CORS) — tozalash null, sahifadagi rasm o'zgarmaydi, xato yo'q
        await page.route('https://nocors.test/**', (route) => route.fulfill({ status: 404, body: '' }));
        const n = await page.evaluate(async () => { S.settings.brandLogo = 'https://nocors.test/l.jpg'; document.body.innerHTML = fwBrandLockup(); fwApplyBrand();
          const c = await fwLogoClean('https://nocors.test/l.jpg'); const i = document.querySelector('img'); return { c, src: i.getAttribute('src'), cl: i.hasAttribute('data-fw-clean') }; });
        assert.deepEqual(n, { c: null, src: 'https://nocors.test/l.jpg', cl: false });
        assert.deepEqual(consoleErrors, []);
      } finally { await browser.close(); }
    } },
    { name: 'CSS: logotip atrofida chegara/soya/fon/burchak yo\'q (barcha joylar)', async run() {
      const { browser, page } = await open();
      try {
        const r = await page.evaluate(() => {
          document.body.innerHTML = `<button class="fw-shop-sw" style="display:flex"><span class="fw-shop-mk">${fwBrandMark()}</span><span class="fw-shop-t"><b>Baza</b></span></button>
            <span class="sh-shop-mk" id="sh">${fwBrandMark()}</span><aside class="pt-side" style="display:flex"><div class="pt-side-logo" id="ps">${fwBrandLockup()}</div></aside>
            <div class="sidebar-logo" id="sl">${fwBrandLockup('sidebar-brand-img')}</div><button class="st-av st-av-logo" id="av">${fwBrandMark('st')}</button>
            <button class="sf-brand"><span class="sf-brand-mk" id="sf">${fwBrandMark()}</span></button>`;
          const cs = (e) => getComputedStyle(e);
          const imgs = [...document.querySelectorAll('img')].map(i => { const s = cs(i); return [s.borderTopWidth, s.borderRadius, s.boxShadow, s.backgroundColor]; });
          const sw = cs(document.querySelector('.fw-shop-sw')), sh = cs(document.getElementById('sh')), av = cs(document.getElementById('av')), avm = cs(document.querySelector('#av .fw-mark'));
          return { imgs, sw: [sw.borderTopColor, sw.backgroundColor], sh: [sh.backgroundColor, sh.borderRadius], ps: cs(document.getElementById('ps')).borderBottomStyle,
            sl: cs(document.getElementById('sl')).borderBottomStyle, av: [av.borderTopStyle, av.boxShadow, avm.boxShadow, avm.borderRadius], sf: [cs(document.getElementById('sf')).borderRadius, cs(document.getElementById('sf')).backgroundColor] };
        });
        for (const [bw, br, bs, bg] of r.imgs) { assert.equal(bw, '0px'); assert.equal(br, '0px'); assert.equal(bs, 'none'); assert.equal(bg, 'rgba(0, 0, 0, 0)'); }
        assert.deepEqual(r.sw, ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'], 'do\'kon tugmasi — ramkasiz');
        assert.deepEqual(r.sh, ['rgba(0, 0, 0, 0)', '0px'], 'do\'konlar ro\'yxatidagi logo — qutisiz');
        assert.equal(r.ps, 'none', 'portal yon menyu logosi ostida chiziq yo\'q');
        assert.equal(r.sl, 'none', 'admin yon menyu logosi ostida chiziq yo\'q');
        assert.deepEqual(r.av, ['none', 'none', 'none', '0px'], 'sozlamalar profil logosi — halqasiz');
        assert.deepEqual(r.sf, ['0px', 'rgba(0, 0, 0, 0)'], 'onlayn do\'kon logosi — doirasiz');
      } finally { await browser.close(); }
    } },
  ],
};
