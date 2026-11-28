// CDN kutubxonalari keshi (HTML'dagi aynan versiyalar, npm paketidan — jsdelivr bilan bir xil fayl).
// FW_CDN_DIR (tayyor papka) yoki os.tmpdir()/fw-cdn-cache; yo'q paket birinchi chaqiruvda `npm pack` bilan yuklanadi.
// Testlar ishga tushish tartibiga bog'liq bo'lmasin: har bir test o'ziga kerak paketni shu yerdan so'raydi.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PKGS = { '@supabase/supabase-js': '2.117.2', qrcode: '1.4.4', 'html5-qrcode': '2.3.8', exceljs: '4.4.0', leaflet: '1.9.4' };
const cacheRoot = () => process.env.FW_CDN_DIR || path.join(os.tmpdir(), 'fw-cdn-cache');
const pkgDir = (dir, n, v) => path.join(dir, `${n.replace(/^@/, '').replace('/', '-')}@${v}`);

function ensurePkg(n, v, dir = cacheRoot()) {
  const d = pkgDir(dir, n, v);
  if (fs.existsSync(path.join(d, 'package', 'package.json'))) return d;
  fs.mkdirSync(d, { recursive: true });
  const tgz = execFileSync('npm', ['pack', `${n}@${v}`, '--silent'], { cwd: d, encoding: 'utf8' }).trim().split('\n').pop();
  execFileSync('tar', ['xzf', tgz, '-C', d], { cwd: d });   // npm pack faylni d ichiga yozadi — nisbiy nom shu yerdan o'qiladi
  return d;
}
// Hamma paketlar (p42: SRI va CSP tekshiruvi)
function cdnDir() { const dir = cacheRoot(); for (const [n, v] of Object.entries(PKGS)) ensurePkg(n, v, dir); return dir; }
// exceljs.min.js (kesh yo'q bo'lsa — yuklab olinadi)
function excelJsPath() {
  const ready = [process.env.FW_CDN_DIR && path.join(process.env.FW_CDN_DIR, 'exceljs@4.4.0', 'package', 'dist', 'exceljs.min.js'),
    path.join(cacheRoot(), 'exceljs@4.4.0', 'package', 'dist', 'exceljs.min.js'),
    path.join(__dirname, '..', '..', 'node_modules', 'exceljs', 'dist', 'exceljs.min.js')].filter(Boolean).find((p) => fs.existsSync(p));
  if (ready) return ready;
  return path.join(ensurePkg('exceljs', PKGS.exceljs), 'package', 'dist', 'exceljs.min.js');
}
module.exports = { PKGS, cdnDir, ensurePkg, excelJsPath };
