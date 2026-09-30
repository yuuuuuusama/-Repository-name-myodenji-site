#!/usr/bin/env node
// =========================================================================
// 法輪から直せる所に目印(data-edit)を付け、台帳(site-manifest.json)を書き出す
//
//   node scripts/mark-editable.mjs            目印を付けて台帳を書き出す
//   node scripts/mark-editable.mjs --check    書き換えずに、目印の無い所が残っていないかだけ見る
//
// 直せる文:見出し・段落・箇条書きなどのうち、文と改行(<br>)だけでできている所。
//   リンク・太字などの入った所や、料金表の組みは崩さないよう、目印を付けない。
//   目印はページの中で一度付けたら変えない(番号は増やすだけ)。法輪に保存した直しは、この番号で結び付く。
// 直せる写真:ページ・CSS が使っている、このサイトの中の画像ファイル(道筋で差し替える。HTML は書き換えない)。
// フォーム:送り先・項目(名前・見出し・種類・必須)を台帳に載せる(法輪は台帳に無い項目を受けない)。
//
// 見た目は変えない。付けるのは data-edit という属性だけ(画面には何も出ない)。
// =========================================================================
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHECK = process.argv.includes('--check');
const files = execSync('git ls-files "*.html"', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);

const TAGS = 'h1|h2|h3|h4|h5|h6|p|li|dt|dd|figcaption|th|td|blockquote|span|div|small|label';
const ELEM = new RegExp(`<(${TAGS})(\\s[^>]*)?>([^<]*(?:<br\\s*\\/?>[^<]*)*)</\\1>`, 'gi');

/** 画面に出る文(改行は \n、実体参照は戻す) */
function plain(inner) {
  return inner.replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/^\n+|\n+$/g, '');
}

const manifest = { version: 1, generated_at: new Date().toISOString(), pages: [], texts: [], images: [], forms: [] };
const imageUses = new Map();
let added = 0, missing = 0;

for (const file of files) {
  const full = path.join(ROOT, file);
  let html = fs.readFileSync(full, 'utf8');
  const page = file.replace(/\.html$/, '');
  const title = plain(/<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? page);
  manifest.pages.push({ file, title });

  // 使っている番号の続きから振る
  let next = 1 + Math.max(0, ...[...html.matchAll(new RegExp(`data-edit="${page}:(\\d+)"`, 'g'))].map(m => Number(m[1])));
  html = html.replace(ELEM, (whole, tag, attrs = '', inner) => {
    const text = plain(inner);
    if (!text || text.length < 2) return whole;            // 空・一文字の飾りは除く
    if (/^[\s\d.,:/()〜~\-–—・]+$/.test(text)) return whole; // 数字や記号だけ
    if (/\bdata-edit="/.test(attrs)) return whole;          // もう付いている
    if (/<(script|style)/i.test(inner)) return whole;
    if (CHECK) { missing++; return whole; }
    added++;
    return `<${tag}${attrs} data-edit="${page}:${next++}">${inner}</${tag}>`;
  });

  for (const m of html.matchAll(ELEM)) {
    const key = /\bdata-edit="([^"]+)"/.exec(m[2] ?? '')?.[1];
    if (key) manifest.texts.push({ key, file, tag: m[1].toLowerCase(), text: plain(m[3]) });
  }

  // 画像(<img src>・style の url()・CSS の url())
  const addImg = (raw) => {
    if (!raw || /^(https?:|data:|\/\/|#)/i.test(raw)) return;
    const p = decodeURI(raw.replace(/^\.?\//, '').split(/[?#]/)[0]);
    if (!/\.(jpe?g|png|webp|gif|svg)$/i.test(p)) return;
    if (!fs.existsSync(path.join(ROOT, p))) return;
    if (!imageUses.has(p)) imageUses.set(p, new Set());
    imageUses.get(p).add(file);
  };
  for (const m of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) addImg(m[1]);
  for (const m of html.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) addImg(m[1]);

  // フォーム
  for (const f of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    if (!/\baction="[^"]*\/__form\//.test(f[1])) continue;   // Cloudflare で受けるフォームだけ
    const body = f[2];
    const name = file === 'index.html' ? 'contact' : page.replace(/-form$/, '');
    const subject = /name="_subject"\s+value="([^"]*)"/.exec(body)?.[1] ?? '';
    const next = /name="_next"\s+value="([^"]*)"/.exec(body)?.[1] ?? '';
    const fields = [];
    for (const inp of body.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
      const attrs = inp[2];
      const n = /\bname="([^"]+)"/.exec(attrs)?.[1];
      if (!n || n.startsWith('_') || n === 'cf-turnstile-response') continue;
      const type = inp[1].toLowerCase() === 'input' ? (/\btype="([^"]+)"/.exec(attrs)?.[1] ?? 'text').toLowerCase() : inp[1].toLowerCase();
      if (type === 'hidden' || type === 'submit' || type === 'button') continue;
      const before = body.slice(0, inp.index);
      const label = plain(([...before.matchAll(/<label\b[^>]*>([^<]*)/gi)].pop()?.[1] ?? n)) || n;
      const f0 = fields.find(x => x.name === n);
      const value = /\bvalue="([^"]*)"/.exec(attrs)?.[1];
      if (f0) { if (value && (type === 'radio' || type === 'checkbox')) f0.options.push(value); continue; }
      fields.push({ name: n, label, type, required: /\brequired\b/.test(attrs), options: value && (type === 'radio' || type === 'checkbox') ? [value] : [] });
    }
    manifest.forms.push({ name, file, subject, next, fields });
  }

  if (!CHECK) fs.writeFileSync(full, html);
}

// CSS ファイルの url() も写真として数える
for (const css of execSync('git ls-files "*.css"', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean)) {
  const s = fs.readFileSync(path.join(ROOT, css), 'utf8');
  for (const m of s.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
    const p = decodeURI(m[1].replace(/^\.?\//, '').split(/[?#]/)[0]);
    if (/\.(jpe?g|png|webp|gif)$/i.test(p) && fs.existsSync(path.join(ROOT, p))) {
      if (!imageUses.has(p)) imageUses.set(p, new Set());
      imageUses.get(p).add(css);
    }
  }
}
manifest.images = [...imageUses.entries()].map(([p, used]) => ({ path: p, used_in: [...used].sort() })).sort((a, b) => a.path.localeCompare(b.path));

if (CHECK) {
  console.log(missing ? `目印の無い所が ${missing} か所あります(node scripts/mark-editable.mjs で付ける)` : '目印はそろっています');
  process.exit(missing ? 1 : 0);
}
fs.writeFileSync(path.join(ROOT, 'site-manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`目印を ${added} か所に付けました。台帳:文 ${manifest.texts.length}・写真 ${manifest.images.length}・フォーム ${manifest.forms.length}・ページ ${manifest.pages.length}`);
