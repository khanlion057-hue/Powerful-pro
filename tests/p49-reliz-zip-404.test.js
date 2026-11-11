// P49 — v24.5 (v23.10.2 P36 dan): "/" 404 ildiz sababi va FINAL ZIP tuzilishi.
//  Ildiz sabab (v23.10.1/2): ZIP'dagi fayllar bitta papka ichida; Netlify'ga drag-and-drop qilinganda nashr ildizida
//  index.html (va netlify.toml) bo'lmaydi → "/" 404, sarlavhalar va funksiyalar ham yo'q (deploy_source=drop, 0 funksiya).
//  v24.5 qarori: ZIP — BITTA root papka (`powerful-pro-v24.5/`), drag-and-drop TAQIQLANGAN; deploy faqat shu papka ICHIDAN
//  scripts/deploy-netlify.sh (CLI) bilan — u RELEASE + RELEASE-MANIFEST.sha256 bo'yicha fayllarni tekshiradi; tashqi
//  papkadan ishga tushirilsa aniq xabar bilan rad etadi. ZIP yonida <zip>.sha256.
//  Test: joriy HEAD'ning toza klonida haqiqiy skriptlar; drop'ni emulyatsiya — ochilgan papka statik sayt sifatida.
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync, spawnSync } = require('child_process');
const { ROOT } = require('./helpers/load-app');

const N_FUNCS = 63;   // v24.6: + branch-transfer; v24.9: + pw-reset, staff-login; v25: − b2b, b2b-inbound
const RDIR = 'powerful-pro-v24.5';
function cloneHead() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-rel-'));
  execFileSync('git', ['clone', '-q', '--no-hardlinks', ROOT, path.join(d, 'repo')], { stdio: 'pipe' });
  return d;
}
const ls = (zip) => execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean);

// Netlify drop'ni emulyatsiya: papka = nashr ildizi (build yo'q), "/" → index.html bo'lsa 200, aks holda 404
async function serveRoot(dir, url) {
  const srv = http.createServer((q, s) => {
    let f = path.join(dir, decodeURIComponent(new URL(q.url, 'http://x').pathname));
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { s.writeHead(404); return s.end('Page not found'); }
    s.writeHead(200); s.end(fs.readFileSync(f));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  // global fetch'ni boshqa testlar almashtirishi mumkin — to'g'ridan-to'g'ri http (v23.10.2 P36 tuzatishi saqlandi)
  try { return await new Promise((res, rej) => http.get(`http://127.0.0.1:${srv.address().port}${url}`, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => res({ code: r.statusCode, body: b })); }).on('error', rej)); }
  finally { srv.close(); }
}
const deployRun = (cwd, args, env = {}, script = path.join('scripts', 'deploy-netlify.sh')) =>
  spawnSync('bash', [script, ...args], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } });

async function testRootCause() {
  const d = cloneHead(); const repo = path.join(d, 'repo');
  try {
    // OLDIN (v23.10.1/2 usuli): prefiksli arxiv drop qilinsa — "/" 404 (ildiz sabab qayta ishlab chiqarildi)
    const oldZip = path.join(d, 'old.zip');
    execFileSync('git', ['archive', '--format=zip', `--prefix=${RDIR}/`, '-o', oldZip, 'HEAD'], { cwd: repo });
    const ox = path.join(d, 'old'); execFileSync('unzip', ['-q', oldZip, '-d', ox]);
    assert.equal((await serveRoot(ox, '/')).code, 404, 'papkali ZIP drop qilinsa "/" → 404');
    // KEYIN: make-release-zip.sh — bitta root papka, ichida index.html, netlify.toml, funksiyalar, RELEASE + manifest
    const newZip = path.join(d, 'new.zip');
    const out = execFileSync('bash', ['scripts/make-release-zip.sh', newZip], { cwd: repo, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME } });
    assert.match(out, new RegExp(`${N_FUNCS} funksiya, root papka: ${RDIR.replace(/\./g, '\\.')}/`));
    const files = ls(newZip);
    const top = [...new Set(files.map(f => f.split('/')[0]))];
    assert.deepEqual(top, [RDIR], 'ZIP — bitta root papka');
    const inner = files.map(f => f.slice(RDIR.length + 1)).filter(Boolean);
    for (const f of ['index.html', 'netlify.toml', 'sotuvchi.html', 'diller.html', '404.html', 'RELEASE', 'RELEASE-MANIFEST.sha256', 'scripts/deploy-netlify.sh', 'scripts/migrate-v24.5.sh', 'scripts/backup-before-deploy.sh', 'scripts/rollback-from-backup.sh', 'supabase-migration-34-mijoz-haqi.sql']) assert.ok(inner.includes(f), `ZIP: ${RDIR}/${f}`);
    assert.equal(inner.filter(f => /^netlify\/functions\/[^/]+\.js$/.test(f)).length, N_FUNCS, `${N_FUNCS} funksiya`);
    assert.ok(!inner.some(f => /(^|\/)(\.env|node_modules\/|backups\/|dist\/|\.git\/|logs\/)|\.log$/.test(f) && f !== '.env.example'), ".env/node_modules/backups/dist/.git/logs yo'q");
    // ZIP checksum'i yonida
    execFileSync('sha256sum', ['-c', '--quiet', '--strict', 'new.zip.sha256'], { cwd: d });
    const nx = path.join(d, 'new'); execFileSync('unzip', ['-q', newZip, '-d', nx]);
    const root = path.join(nx, RDIR);
    // tashqi papka drop qilinsa yana 404 — shuning uchun drop TAQIQ; root papkaning o'zi — "/" 200
    assert.equal((await serveRoot(nx, '/')).code, 404, 'tashqi papka → 404 (drop taqiqlangan)');
    const r = await serveRoot(root, '/');
    assert.equal(r.code, 200); assert.ok(r.body.includes('js/main.js'), '"/" → index.html');
    const rel = fs.readFileSync(path.join(root, 'RELEASE'), 'utf8');
    assert.match(rel, /^commit=[0-9a-f]{7,}$/m, 'RELEASE — commit to\'ldirilgan');
    execFileSync('sha256sum', ['-c', '--quiet', '--strict', 'RELEASE-MANIFEST.sha256'], { cwd: root });
    // git'siz reliz papkasidan deploy tekshiruvi (dry-run): o'tadi
    let x = deployRun(root, ['--dry-run']);
    assert.equal(x.status, 0, x.stdout + x.stderr); assert.match(x.stdout, /reliz commit [0-9a-f]+ — \d+ fayl mos/);
    assert.match(x.stdout, new RegExp(`funksiyalar: ${N_FUNCS}`));
    // node_modules/dist/.env — ruxsat; boshqa qo'shimcha fayl yoki o'zgartirilgan fayl — rad
    fs.mkdirSync(path.join(root, 'node_modules', 'x'), { recursive: true }); fs.writeFileSync(path.join(root, 'node_modules', 'x', 'a.js'), '1');
    fs.writeFileSync(path.join(root, '.env'), 'X=1');
    assert.equal(deployRun(root, ['--dry-run']).status, 0, 'node_modules va .env ruxsat');
    fs.writeFileSync(path.join(root, 'begona.js'), '1');
    x = deployRun(root, ['--dry-run']); assert.equal(x.status, 2); assert.match(x.stdout, /qo'shimcha fayl/);
    fs.rmSync(path.join(root, 'begona.js'));
    fs.appendFileSync(path.join(root, 'netlify', 'functions', 'health.js'), '\n// o\'zgartirildi');
    x = deployRun(root, ['--dry-run']); assert.equal(x.status, 2); assert.match(x.stdout, /manifest bilan mos emas/);
    // noto'g'ri papkadan (ZIP'ning tashqi papkasi = drop qilinadigan papka) ishga tushirish — aniq xabar bilan rad
    fs.mkdirSync(path.join(nx, 'scripts')); fs.copyFileSync(path.join(root, 'scripts', 'deploy-netlify.sh'), path.join(nx, 'scripts', 'deploy-netlify.sh'));
    x = deployRun(nx, ['--dry-run']);
    assert.equal(x.status, 2); assert.match(x.stdout, /ILDIZIDAN[\s\S]*Drag-and-drop deploy QILINMAYDI/);
    // commit qilinmagan o'zgarish bilan ZIP yaratilmaydi
    fs.writeFileSync(path.join(repo, 'yangi.txt'), '1');
    const y = spawnSync('bash', ['scripts/make-release-zip.sh', path.join(d, 'y.zip')], { cwd: repo, encoding: 'utf8' });
    assert.equal(y.status, 2); assert.match(y.stdout, /commit qilinmagan/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
}

// FW_ZIP_ROOT: boshqa root papka nomi; noto'g'ri nom — rad
function testRootFolderName() {
  const d = cloneHead(); const repo = path.join(d, 'repo');
  try {
    const z = path.join(d, 'r.zip');
    execFileSync('bash', ['scripts/make-release-zip.sh', z], { cwd: repo, stdio: 'pipe', env: { ...process.env, FW_ZIP_ROOT: 'fp-sinov' } });
    assert.deepEqual([...new Set(ls(z).map(f => f.split('/')[0]))], ['fp-sinov']);
    const x = path.join(d, 'x'); execFileSync('unzip', ['-q', z, '-d', x]);
    const root = path.join(x, 'fp-sinov');
    for (const f of ['index.html', 'netlify.toml', '404.html', 'RELEASE', 'RELEASE-MANIFEST.sha256']) assert.ok(fs.existsSync(path.join(root, f)), f);
    assert.equal(fs.readdirSync(path.join(root, 'netlify', 'functions')).filter(f => f.endsWith('.js')).length, N_FUNCS);
    const r = deployRun(root, ['--dry-run']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    for (const bad of ['../x', 'a b', '.']) {
      const b = spawnSync('bash', ['scripts/make-release-zip.sh', path.join(d, 'b.zip')], { cwd: repo, encoding: 'utf8', env: { ...process.env, FW_ZIP_ROOT: bad } });
      assert.equal(b.status, 2, bad);
    }
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
}

function testNetlifyConfig() {
  const t = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  assert.match(t, /publish = "dist"/); assert.match(t, /command = "node scripts\/build\.js"/);
  assert.match(t, /NODE_VERSION = "22"/, 'Node 22');
  assert.doesNotMatch(t, /from = "\/\*"/, "SPA catch-all yo'q (hash routing; yo'q funksiya index.html qaytarmasin)");
  assert.doesNotMatch(t, /^\s*SECRETS_SCAN_OMIT_KEYS/m, "Netlify secret skaneri service_role uchun o'chirilmagan");
  for (const [from, to] of [['/sotuvchi', '/sotuvchi.html'], ['/diller', '/diller.html']]) assert.ok(t.includes(`from = "${from}"\n  to = "${to}"\n  status = 200`), from);
  assert.equal(fs.readdirSync(path.join(ROOT, 'netlify', 'functions')).filter(f => f.endsWith('.js')).length, N_FUNCS);
  const { build } = require('../scripts/build');
  const r = build(); assert.equal(r.ok, true, JSON.stringify(r.problems));
  for (const f of ['index.html', '404.html', 'sotuvchi.html', 'diller.html']) assert.ok(fs.existsSync(path.join(ROOT, 'dist', f)), `dist/${f}`);
  assert.match(fs.readFileSync(path.join(ROOT, 'dist', '404.html'), 'utf8'), /href="\/"/);
  // ilova hash routing ishlatadi — server marshrutlari kerak emas (catch-all qo'yilmaganining asosi)
  assert.match(fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8'), /addEventListener\('hashchange'/);
  // RELEASE export-subst (git archive commit'ni yozadi)
  assert.match(fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8'), /^RELEASE export-subst$/m);
}

module.exports = {
  name: 'P49 — v24.5 (v23.10.2 P36 dan): "/" 404 ildiz sababi va FINAL ZIP (bitta root papka, checksum) / Netlify konfiguratsiyasi',
  cases: [
    { name: `Papkali ZIP drop: '/' → 404; make-release-zip: bitta ${RDIR}/ papka, ${N_FUNCS} funksiya, RELEASE+manifest+zip.sha256, maxfiy/keraksiz fayl yo'q, papka ichidan deploy dry-run, o'zgartirish/begona fayl — rad`, run: testRootCause },
    { name: "FW_ZIP_ROOT: boshqa root papka nomi — ichidan deploy dry-run o'tadi; noto'g'ri nom — rad", run: testRootFolderName },
    { name: "netlify.toml: publish=dist, NODE_VERSION 22, aniq /sotuvchi /diller, catch-all yo'q, secret skaner yoqilgan; dist ildizida index.html va 404.html", run: testNetlifyConfig },
  ],
};
