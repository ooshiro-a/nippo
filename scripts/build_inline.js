/**
 * build_inline.js
 * index.html + css/style.css + js/{utils,api_gas,app}.js を
 * 1 ファイルにインライン化して gas/index.html を生成する。
 *
 * Usage: node scripts/build_inline.js
 *
 * 注意: html.replace(regex, fn) の形式を使用すること。
 * 文字列を第2引数にすると $& 等の特殊パターンがJSコンテンツ内に
 * あった場合に意図しない展開が起きる（SheetJSは $& を3箇所含む）。
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

let html = read('index.html');

// ── CSS インライン化 ──────────────────────────────────────────
const css = read('css/style.css');
html = html.replace(
  /\s*<link rel="stylesheet" href="css\/style\.css">/,
  () => `\n  <style>\n${css}\n  </style>`
);

// ── manifest 削除（PWA 廃止）──────────────────────────────────
html = html.replace(/\s*<link rel="manifest" href="manifest\.json">\n?/, '\n');

// ── apple-touch-icon 削除（不要）─────────────────────────────
html = html.replace(/\s*<link rel="apple-touch-icon"[^>]*>\n?/, '\n');

// ── xlsx.min.js インライン化（SheetJS）────────────────────────
// GAS テンプレートエンジンが「<?」をスクリプトレットとして誤認識するため
// 「<?」→「?」にエスケープ（JS実行時は同じ文字列に戻る）
const xlsx = read('js/xlsx.min.js').replace(/<\?/g, '<\\u003F');
html = html.replace(
  /\s*<script src="js\/xlsx\.min\.js"><\/script>/,
  () => `\n  <script>\n${xlsx}\n  </script>`
);

// ── utils.js インライン化 ─────────────────────────────────────
const utils = read('js/utils.js');
html = html.replace(
  /\s*<script src="js\/utils\.js"><\/script>/,
  () => `\n  <script>\n${utils}\n  </script>`
);

// ── api.js → api_gas.js に差し替えてインライン化 ──────────────
const apiGas = read('js/api_gas.js');
html = html.replace(
  /\s*<script src="js\/api\.js"><\/script>/,
  () => `\n  <script>\n${apiGas}\n  </script>`
);

// ── parserConfig.js インライン化 ──────────────────────────────
const parserConfig = read('js/parserConfig.js');
html = html.replace(
  /\s*<script src="js\/parserConfig\.js"><\/script>/,
  () => `\n  <script>\n${parserConfig}\n  </script>`
);

// ── parseDayReport.js インライン化 ────────────────────────────
const parseDayReport = read('js/parseDayReport.js');
html = html.replace(
  /\s*<script src="js\/parseDayReport\.js"><\/script>/,
  () => `\n  <script>\n${parseDayReport}\n  </script>`
);

// ── app.js インライン化 ───────────────────────────────────────
const app = read('js/app.js');
html = html.replace(
  /\s*<script src="js\/app\.js"><\/script>/,
  () => `\n  <script>\n${app}\n  </script>`
);

// ── Service Worker 登録ブロック削除 ───────────────────────────
html = html.replace(
  /\s*<script>\s*if \('serviceWorker' in navigator\)[\s\S]*?<\/script>/,
  ''
);

// ── DOCTYPE 削除（GAS HtmlService が createHtmlOutputFromFile で拒否するため）
html = html.replace(/^<!DOCTYPE html>\n/i, '');

// ── 出力 ─────────────────────────────────────────────────────
const outPath = path.join(ROOT, 'gas', 'index.html');
fs.writeFileSync(outPath, html, 'utf8');

const lines = html.split('\n').length;
const kb    = Math.round(Buffer.byteLength(html, 'utf8') / 1024);
console.log(`生成完了: gas/index.html (${lines} 行 / ${kb} KB)`);
