// P48 — v24.5 (v23.10.2 P34 dan): Netlify deploy FAQAT Git/CLI orqali va himoyalangan (scripts/deploy-netlify.sh);
// zaxira / migratsiya / rollback skriptlarining himoyalari (scripts/backup-before-deploy.sh, migrate-v24.5.sh,
// rollback-from-backup.sh) — BAZAGA ULANMASDAN (himoyalar ulanishdan oldin ishlaydi; haqiqiy PostgreSQL mashqi —
// /var/tmp/audit-v24.5/logs/30-deploy-rehearsal.log, DEPLOY.md).
//  • deploy: vaqtinchalik Git repoda `--dry-run` (Netlify'ga hech narsa yuborilmaydi): toza bo'lmagan daraxt — rad;
//    NODE_VERSION 22, 404.html, 63 funksiya; --prod: FW_DEPLOY_CONFIRM, zaxira fayli, sha256, 24 soatdan yangi — majburiy;
//    dry-run'siz preview ham FW_DEPLOY_CONFIRM talab qiladi.
//  • Hujjat va CI: drag-and-drop ko'rsatmasi yo'q; CI production deploy faqat qo'lda (workflow_dispatch + tasdiq).
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const { ROOT } = require('./helpers/load-app');

const N_FUNCS = 65;   // v25.2: + client-error; v24.6: + branch-transfer; v24.9: + pw-reset, staff-login; v25: − b2b, b2b-inbound; v25.1: + tg-customer
const TOML = '[build]\n  command = "node scripts/build.js"\n  publish = "dist"\n[build.environment]\n  NODE_VERSION = "22"\n';
const git = (d, ...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: d, stdio: 'pipe' });

function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-deploy-'));
  fs.mkdirSync(path.join(d, 'scripts')); fs.mkdirSync(path.join(d, 'netlify', 'functions'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'scripts', 'deploy-netlify.sh'), path.join(d, 'scripts', 'deploy-netlify.sh'));
  for (let i = 0; i < N_FUNCS; i++) fs.writeFileSync(path.join(d, 'netlify', 'functions', `f${i}.js`), 'exports.handler=async()=>({statusCode:200})\n');
  fs.writeFileSync(path.join(d, '.gitignore'), '.env\nbackups/\n');
  fs.writeFileSync(path.join(d, 'index.html'), '<!DOCTYPE html><title>t</title>');
  fs.writeFileSync(path.join(d, '404.html'), '<!DOCTYPE html><title>404</title><a href="/">x</a>');
  fs.writeFileSync(path.join(d, 'netlify.toml'), TOML);
  git(d, 'init', '-q'); git(d, 'add', '-A'); git(d, 'commit', '-q', '-m', 'x');
  return d;
}
// muhit ataylab toza: DATABASE_URL/NETLIFY_* tashqaridan kirmaydi
function run(d, args, env = {}, script = 'deploy-netlify.sh') {
  const r = spawnSync('bash', [path.join('scripts', script), ...args], { cwd: d, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function backup(d, { age = 0, corrupt = false } = {}) {
  fs.mkdirSync(path.join(d, 'backups'), { recursive: true });
  const name = 'powerful-pro-v24.5-20261014-000000.dump';
  const f = path.join(d, 'backups', name);
  fs.writeFileSync(f, 'PGDMP-test');
  execFileSync('bash', ['-c', `cd backups && sha256sum ${name} > ${name}.sha256`], { cwd: d });
  if (corrupt) fs.appendFileSync(f, 'x');
  if (age) { const t = new Date(Date.now() - age * 1000); fs.utimesSync(f, t, t); }
  return `backups/${name}`;
}

function testGuards() {
  const d = repo();
  try {
    let r = run(d, ['--dry-run']);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /netlify deploy --build --json --message powerful-pro-v24\.5 [0-9a-f]+$/m, 'preview: --prod yo\'q');
    assert.doesNotMatch(r.out, /--prod/);
    assert.match(r.out, new RegExp(`NODE_VERSION 22, publish=dist, funksiyalar: ${N_FUNCS}`));
    // dry-run'siz preview — tasdiqsiz rad (Netlify'ga hech narsa yuborilmaydi)
    r = run(d, []);
    assert.equal(r.code, 2); assert.match(r.out, /FW_DEPLOY_CONFIRM=HA-PREVIEW kerak/);
    // toza bo'lmagan daraxt
    fs.writeFileSync(path.join(d, 'yangi.txt'), '1');
    r = run(d, ['--dry-run']);
    assert.equal(r.code, 2); assert.match(r.out, /commit qilinmagan/);
    fs.rmSync(path.join(d, 'yangi.txt'));
    // --prod: tasdiqsiz
    r = run(d, ['--dry-run', '--prod']);
    assert.equal(r.code, 2); assert.match(r.out, /FW_DEPLOY_CONFIRM=HA-PRODUCTION kerak/);
    r = run(d, ['--dry-run', '--prod'], { FW_DEPLOY_CONFIRM: 'ha' });
    assert.equal(r.code, 2);
    // zaxirasiz
    r = run(d, ['--dry-run', '--prod'], { FW_DEPLOY_CONFIRM: 'HA-PRODUCTION' });
    assert.equal(r.code, 2); assert.match(r.out, /FW_BACKUP_FILE/);
    // buzilgan zaxira (sha256 mos emas)
    let f = backup(d, { corrupt: true });
    r = run(d, ['--dry-run', '--prod'], { FW_DEPLOY_CONFIRM: 'HA-PRODUCTION', FW_BACKUP_FILE: f });
    assert.equal(r.code, 2); assert.match(r.out, /sha256 bilan mos emas/);
    // eski zaxira (2 kun)
    f = backup(d, { age: 2 * 86400 });
    r = run(d, ['--dry-run', '--prod'], { FW_DEPLOY_CONFIRM: 'HA-PRODUCTION', FW_BACKUP_FILE: f });
    assert.equal(r.code, 2); assert.match(r.out, /24 soatdan eski/);
    // hammasi joyida
    f = backup(d);
    r = run(d, ['--dry-run', '--prod'], { FW_DEPLOY_CONFIRM: 'HA-PRODUCTION', FW_BACKUP_FILE: f });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /netlify deploy --build --json --message powerful-pro-v24\.5 [0-9a-f]+ --prod/);
    // funksiya yetishmasa — rad
    fs.rmSync(path.join(d, 'netlify', 'functions', 'f0.js'));
    git(d, 'commit', '-qam', 'y');
    r = run(d, ['--dry-run']);
    assert.equal(r.code, 2); assert.match(r.out, new RegExp(`${N_FUNCS - 1} ta \\(${N_FUNCS} kutilgan\\)`));
    fs.writeFileSync(path.join(d, 'netlify', 'functions', 'f0.js'), 'exports.handler=async()=>({statusCode:200})\n');
    git(d, 'add', '-A'); git(d, 'commit', '-qm', 'z');
    assert.equal(run(d, ['--dry-run']).code, 0);
    // NODE_VERSION 22 yo'q (Node 20 — login yiqiladi) — rad
    fs.writeFileSync(path.join(d, 'netlify.toml'), TOML.replace('"22"', '"20"')); git(d, 'commit', '-qam', 'n20');
    r = run(d, ['--dry-run']);
    assert.equal(r.code, 2); assert.match(r.out, /NODE_VERSION = "22" yo'q/);
    fs.writeFileSync(path.join(d, 'netlify.toml'), TOML); git(d, 'commit', '-qam', 'n22');
    // 404.html yo'q — rad
    fs.rmSync(path.join(d, '404.html')); git(d, 'commit', '-qam', 'no404');
    r = run(d, ['--dry-run']);
    assert.equal(r.code, 2); assert.match(r.out, /404\.html/);
    // noma'lum argument (masalan drag-and-drop o'rnini bosuvchi --dir) — rad
    assert.equal(run(d, ['--force']).code, 2);
    assert.equal(run(d, ['--dir=dist']).code, 2);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
}

// Zaxira/migratsiya/rollback skriptlari: bazaga ulanishdan OLDINGI himoyalar (DATABASE_URL beriladi, lekin
// ulanish manzili mavjud bo'lmagan lokal soket — tekshiruv ulanishgacha to'xtatishi kerak; tarmoqqa chiqilmaydi)
function testDbScriptGuards() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-dbg-'));
  try {
    fs.mkdirSync(path.join(d, 'scripts', 'lib'), { recursive: true }); fs.mkdirSync(path.join(d, 'tests', 'evidence'), { recursive: true });
    for (const s of ['backup-before-deploy.sh', 'migrate-v24.5.sh', 'rollback-from-backup.sh', 'lib/migratsiya-darajasi.sql']) fs.copyFileSync(path.join(ROOT, 'scripts', s), path.join(d, 'scripts', s));
    fs.copyFileSync(path.join(ROOT, 'tests', 'evidence', 'schema-fingerprint.sql'), path.join(d, 'tests', 'evidence', 'schema-fingerprint.sql'));
    const DB = 'postgresql://postgres@localhost/yoq?host=/nonexistent-fw-socket';
    // DATABASE_URL'siz — hech biri ishlamaydi (standart production manzili yo'q)
    for (const [s, a] of [['backup-before-deploy.sh', []], ['migrate-v24.5.sh', ['--check']], ['rollback-from-backup.sh', []]]) {
      const r = run(d, a, {}, s); assert.equal(r.code, 2, s); assert.match(r.out, /DATABASE_URL kerak/, s);
    }
    // migrate: rejimsiz — yordam; zanjirdagi majburiy fayl yo'q — rad; 35 ixtiyoriy — log'da aniq
    assert.equal(run(d, [], { DATABASE_URL: DB }, 'migrate-v24.5.sh').code, 2);
    let r = run(d, ['--check'], { DATABASE_URL: DB }, 'migrate-v24.5.sh');
    assert.equal(r.code, 2); assert.match(r.out, /supabase-migration-24-v11-cash-authority\.sql yo'q/);
    for (const f of fs.readdirSync(ROOT).filter(f => /^supabase-migration-(2[4-9]|3\d|4\d)-.*\.sql$/.test(f))) fs.copyFileSync(path.join(ROOT, f), path.join(d, f));
    fs.rmSync(path.join(d, 'supabase-migration-35-diller-ombor-atomik.sql'), { force: true });
    r = run(d, ['--apply'], { DATABASE_URL: DB, FW_MIGRATE_CONFIRM: 'HA-QOLLAYMAN-V24.5' }, 'migrate-v24.5.sh');
    assert.match(r.out, /\+ supabase-migration-34-mijoz-haqi\.sql/);
    assert.match(r.out, /- supabase-migration-35-diller-ombor-atomik\.sql — IXTIYORIY, fayl yo'q: zanjirga QO'SHILMADI/);
    assert.match(r.out, /zanjir: 22 ta fayl/);   // 24–34 + 36 + 37 + 38 + 39 + 40 + 41 + 42 + 43 + 44 + 45 + 46 (v25)
    assert.notEqual(r.code, 0, 'mavjud bo\'lmagan bazaga — muvaffaqiyat emas');
    // 35 fayli paydo bo'lsa — zanjir oxiriga qo'shiladi; BEGIN/COMMIT bo'lsa — rad (bitta tranzaksiya buziladi)
    fs.writeFileSync(path.join(d, 'supabase-migration-35-diller-ombor-atomik.sql'), 'select 1;\n');
    r = run(d, ['--check'], { DATABASE_URL: DB }, 'migrate-v24.5.sh');
    assert.match(r.out, /\+ supabase-migration-35-diller-ombor-atomik\.sql[\s\S]*zanjir: 23 ta fayl/);
    fs.writeFileSync(path.join(d, 'supabase-migration-35-diller-ombor-atomik.sql'), 'begin;\nselect 1;\ncommit;\n');
    r = run(d, ['--check'], { DATABASE_URL: DB }, 'migrate-v24.5.sh');
    assert.equal(r.code, 2); assert.match(r.out, /BEGIN\/COMMIT bor/);
    // rollback: maqsad nomi, tasdiq, zaxira fayllari — ulanishdan oldin
    r = run(d, [], { DATABASE_URL: DB }, 'rollback-from-backup.sh');
    assert.equal(r.code, 2); assert.match(r.out, /FW_RESTORE_TARGET_DB/);
    r = run(d, [], { DATABASE_URL: DB, FW_RESTORE_TARGET_DB: 'yoq' }, 'rollback-from-backup.sh');
    assert.equal(r.code, 2); assert.match(r.out, /FW_ROLLBACK_CONFIRM=HA-TIKLAYMAN kerak/);
    r = run(d, [], { DATABASE_URL: DB, FW_RESTORE_TARGET_DB: 'yoq', FW_ROLLBACK_CONFIRM: 'HA-TIKLAYMAN' }, 'rollback-from-backup.sh');
    assert.equal(r.code, 2); assert.match(r.out, /\.manifest/);
    const f = backup(d, { corrupt: true });
    for (const s of ['summary', 'manifest', 'fingerprint']) fs.writeFileSync(path.join(d, `${f}.${s}`), 'version=24.5\n');
    r = run(d, [], { DATABASE_URL: DB, FW_RESTORE_TARGET_DB: 'yoq', FW_ROLLBACK_CONFIRM: 'HA-TIKLAYMAN', FW_BACKUP_FILE: f }, 'rollback-from-backup.sh');
    assert.equal(r.code, 2); assert.match(r.out, /sha256 bilan mos emas/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
}

function testDocsAndCi() {
  const deploy = fs.readFileSync(path.join(ROOT, 'DEPLOY.md'), 'utf8');
  assert.doesNotMatch(deploy, /sudrab tashlang/i, "DEPLOY.md: drag-and-drop ko'rsatmasi yo'q");
  assert.match(deploy, /scripts\/deploy-netlify\.sh/);
  for (const k of ['PRECHECK', 'BACKUP', 'VALIDATE', 'MIGRATE', 'TEST', 'VERIFY', 'RELEASE', 'scripts/migrate-v24.5.sh', 'scripts/rollback-from-backup.sh']) assert.ok(deploy.includes(k), `DEPLOY.md: ${k}`);
  const ci = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(ci, /workflow_dispatch:/);
  const job = ci.slice(ci.indexOf('\n  deploy:'));
  assert.match(job, /if: github\.event_name == 'workflow_dispatch' && inputs\.confirm == 'HA-PRODUCTION'/, "CI: production deploy faqat qo'lda va tasdiq bilan");
  assert.doesNotMatch(job, /refs\/heads\/main'\s*$/m, "main'ga push avtomatik production deploy qilmaydi");
  // zaxira: .sha256 deploy skripti tekshiradigan formatda (fayl nomi, papkasiz), ruxsatlar BILAN, manifest v24.5
  const bk = fs.readFileSync(path.join(ROOT, 'scripts', 'backup-before-deploy.sh'), 'utf8');
  assert.match(bk, /cd "\$DIR" && sha256sum "\$\(basename "\$OUT"\)" > "\$\(basename "\$OUT"\)\.sha256"/);
  assert.doesNotMatch(bk.match(/^pg_dump .*$/m)[0], /--no-privileges|--no-owner/, "zaxira ruxsatlar bilan (rollback'da anon/authenticated huquqlari asl holicha)");
  assert.match(bk, /--format=custom/);
  assert.match(bk, /pg_dump \$\(\(SRV \/ 10000\)\)\+ kerak/, 'pg_dump versiyasi tekshiriladi');
  for (const k of ['version=24.5', 'migration_level=', 'dump_sha256=', 'created_utc=']) assert.ok(bk.includes(k), `manifest: ${k}`);
  // migratsiya: bitta tranzaksiya, tasdiq, zaxira sha256 + manifest, verify, barmoq izi; standart URL yo'q
  const mg = fs.readFileSync(path.join(ROOT, 'scripts', 'migrate-v24.5.sh'), 'utf8');
  for (const need of ['"${PSQL[@]}" -1 "${ARGS[@]}"', '-v ON_ERROR_STOP=1', 'CONFIRM_TOKEN="HA-QOLLAYMAN-V24.5"', 'sha256sum -c', 'supabase-migration-25-verify.sql', 'schema-fingerprint.sql', '"?supabase-migration-35-diller-ombor-atomik.sql"']) assert.ok(mg.includes(need), need);
  // rollback: tasdiq, bitta tranzaksiya, sxema ACL va event trigger qaytariladi, maqsad nomi aniq, production — alohida tasdiq
  const rb = fs.readFileSync(path.join(ROOT, 'scripts', 'rollback-from-backup.sh'), 'utf8');
  for (const need of ['FW_ROLLBACK_CONFIRM:-}" = "HA-TIKLAYMAN"', 'psql "$DATABASE_URL" -X -q -1 -v ON_ERROR_STOP=1', 'create schema public authorization pg_database_owner', 'echo "$SCHEMA_ACL"', 'echo "$EVT"', 'sha256sum -c', 'FW_RESTORE_TARGET_DB', 'FW_RESTORE_PROD_CONFIRM']) assert.ok(rb.includes(need), need);
  for (const s of ['backup-before-deploy.sh', 'migrate-v24.5.sh', 'rollback-from-backup.sh', 'deploy-netlify.sh']) {
    const t = fs.readFileSync(path.join(ROOT, 'scripts', s), 'utf8');
    assert.doesNotMatch(t, /DATABASE_URL:-[a-z]|postgres(?:ql)?:\/\/[^\s'"]*(supabase|pooler)/i, `${s}: standart (production) manzil yo'q`);
    assert.doesNotMatch(t, /echo[^\n]*\$DATABASE_URL/, `${s}: DATABASE_URL chiqarilmaydi`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.doesNotMatch(pkg.scripts.deploy, /--prod/, "`npm run deploy` — preview (production emas)");
  assert.match(pkg.scripts.deploy, /scripts\/deploy-netlify\.sh/);
}

module.exports = {
  name: 'P48 — v24.5 (v23.10.2 P34 dan): Netlify deploy faqat Git/CLI, himoyalangan skriptlar (deploy, zaxira, migratsiya, rollback)',
  cases: [
    { name: "deploy-netlify.sh --dry-run: toza daraxt, NODE_VERSION 22, 404.html, 64 funksiya, preview/--prod tasdig'i, zaxira + sha256 + yangiligi", run: testGuards },
    { name: "backup/migrate/rollback: DATABASE_URL majburiy, zanjir massivi (35 — ixtiyoriy, logda), BEGIN/COMMIT rad, maqsad nomi + tasdiq + sha256", run: testDbScriptGuards },
    { name: "DEPLOY.md: drag-and-drop yo'q, PRECHECK→…→RELEASE; CI production — faqat workflow_dispatch + HA-PRODUCTION; npm run deploy — preview", run: testDocsAndCi },
  ],
};
