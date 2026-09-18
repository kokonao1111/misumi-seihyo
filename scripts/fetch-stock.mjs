// 実写素材（Unsplash）を assets-src/stock/ に取得する。既にあるファイルは飛ばす。
// 使い方: node scripts/fetch-stock.mjs  →  続けて node scripts/optimize-images.mjs
// ライセンスと出典は ASSETS.md を参照。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../assets-src/stock/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

// Unsplash の写真ID（写真ページの「ダウンロード」と同じURLを使う）
const PHOTOS = ['NzeJNg2SXc8', 'Fo8UGw1XaPo', 'dmkmrNptMpw'];

for (const id of PHOTOS) {
  const file = `${OUT}us-${id}.jpg`;
  if (existsSync(file) && statSync(file).size > 20000) { console.log('あり', id); continue; }
  execFileSync('curl', ['-s', '-L', '-A', UA, '--max-time', '90', '-o', file, `https://unsplash.com/photos/${id}/download?force=true&w=1920`]);
  console.log(statSync(file).size > 20000 ? 'ok  ' : '失敗', id);
}
