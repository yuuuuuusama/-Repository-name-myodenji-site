#!/usr/bin/env node
// Cloudflare に載せる中身(dist/)を作る。git に記録したファイルだけを写す(手元にだけある写真・下書きは載せない。
// GitHub Pages で公開していたものと同じ)。配る仕組みや手元の道具は写さない。
//   node scripts/build-dist.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const SKIP = [/^scripts\//, /^line-richmenu\//, /^dist\//, /^\.claude\//, /^worker\.js$/, /^wrangler\.toml$/, /^cloudflare-worker\.js$/,
  /^site-manifest\.json$/, /^CNAME$/, /\.md$/, /^\.gitignore$/, /^\.assetsignore$/];
const MAX = 25 * 1024 * 1024;   // Cloudflare の一ファイルの上限

fs.rmSync(DIST, { recursive: true, force: true });
let n = 0, bytes = 0;
const big = [];
for (const f of execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n')) {
  if (!f || SKIP.some(r => r.test(f))) continue;
  const src = path.join(ROOT, f);
  const size = fs.statSync(src).size;
  if (size > MAX) { big.push(`${f}(${Math.round(size / 1048576)}MB)`); continue; }
  fs.mkdirSync(path.dirname(path.join(DIST, f)), { recursive: true });
  fs.copyFileSync(src, path.join(DIST, f));
  n++; bytes += size;
}
console.log(`dist/ に ${n} ファイル(${Math.round(bytes / 1048576)}MB)を写しました`);
if (big.length) console.log(`大きすぎて載せないもの:${big.join('・')}`);
