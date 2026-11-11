// P41 — v24.5 (v23.10.2 P37 dan): Netlify funksiyalari ishlaydigan Node versiyasi @supabase/supabase-js talabiga mos.
//  Production'dagi xato: NODE_VERSION=20 → funksiyalar nodejs20.x da; supabase-js 2.117 (engines node>=22) Node 20 da
//  createClient() ichida "native WebSocket not found" bilan yiqiladi → 57 funksiyaning hammasi 500, login
//  "Serverga ulanishda muammo". Lokal testlar Node 22 da bo'lgani uchun ushlanmagan edi — shu test qoplaydi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const major = (v) => parseInt(String(v).match(/\d+/)[0], 10);

function testVersions() {
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  const nodeV = major(toml.match(/NODE_VERSION = "([^"]+)"/)[1]);
  const lambda = (toml.match(/AWS_LAMBDA_JS_RUNTIME = "nodejs(\d+)\.x"/) || [])[1];
  const need = major(require('@supabase/supabase-js/package.json').engines.node);
  assert.ok(nodeV >= need, `netlify.toml NODE_VERSION ${nodeV} >= supabase-js talabi ${need}`);
  assert.ok(lambda && major(lambda) >= need, `AWS_LAMBDA_JS_RUNTIME nodejs${lambda}.x >= ${need}`);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(major(pkg.engines.node) >= need, `package.json engines.node >= ${need}`);
  const ci = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  for (const m of ci.matchAll(/node-version: (\d+)/g)) assert.ok(major(m[1]) >= need, `CI node-version ${m[1]}`);
  // shu jarayon ham talabga mos (testlar production runtime bilan bir xil major'da)
  assert.ok(major(process.versions.node) >= need, `test Node ${process.versions.node}`);
}

function testAdminClientCreates() {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  const had = process.env.SUPABASE_SERVICE_ROLE_KEY; process.env.SUPABASE_SERVICE_ROLE_KEY = had || 'x.y.z';
  try {
    const p = require.resolve('../netlify/functions/_lib/supabaseAdmin'); delete require.cache[p];
    const c = require(p).getAdminClient();
    assert.ok(c && typeof c.from === 'function', 'createClient yiqilmadi');
  } finally { if (had === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; }
}

// Node 20 (native WebSocket yo'q) holati: global WebSocket olib tashlanadi — getAdminClient() baribir yiqilmasligi kerak
function testNoNativeWebSocket() {
  const saved = globalThis.WebSocket;
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  const had = process.env.SUPABASE_SERVICE_ROLE_KEY; process.env.SUPABASE_SERVICE_ROLE_KEY = had || 'x.y.z';
  try {
    delete globalThis.WebSocket;
    const p = require.resolve('../netlify/functions/_lib/supabaseAdmin'); delete require.cache[p];
    const c = require(p).getAdminClient();
    assert.ok(c && typeof c.from === 'function' && typeof c.auth.getUser === 'function', 'WebSocket yo\'q muhitda ham client yaratildi');
  } finally {
    if (saved !== undefined) globalThis.WebSocket = saved;
    if (had === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
}

module.exports = {
  name: 'P41 — v24.5 (v23.10.2 P37 dan): funksiyalar runtime Node versiyasi supabase-js talabiga mos (production 500 sababi)',
  cases: [
    { name: "netlify.toml NODE_VERSION / AWS_LAMBDA_JS_RUNTIME, package.json engines, CI — supabase-js engines (>=22) ga mos", run: testVersions },
    { name: 'getAdminClient() createClient — yiqilmaydi', run: testAdminClientCreates },
    { name: "Native WebSocket yo'q (Node 20 holati): getAdminClient() yiqilmaydi — realtime'siz transport", run: testNoNativeWebSocket },
  ],
};
