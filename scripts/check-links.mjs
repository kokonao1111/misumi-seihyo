// 書き出したサイト（dist/）の内部リンクと画像が、すべて実在するかを調べる。
// 公開先と同じ「/misumi-seihyo/」の下に置いた状態を再現するため、自前の簡易サーバーで配信する。
// 使い方: npm run build のあと node scripts/check-links.mjs
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const PREFIX = '/misumi-seihyo';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!path.startsWith(PREFIX)) { res.writeHead(404).end(); return; }
  path = path.slice(PREFIX.length) || '/';
  let file = join(DIST, path);
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { /* 下で404にする */ }
  try { const body = await readFile(file); res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(body); }
  catch { res.writeHead(404, { 'content-type': 'text/html' }).end(await readFile(join(DIST, '404.html'))); }
});
await new Promise((r) => server.listen(4190, r));
const ORIGIN = `http://localhost:4190${PREFIX}/`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const seen = new Set();
const queue = [ORIGIN];
const problems = [];
const anchors = new Set();   // ほかのページの途中へ飛ぶリンク。最後にまとめて確かめる
while (queue.length) {
  const url = queue.shift();
  const key = url.split('#')[0].split('?')[0];
  if (seen.has(key)) continue;
  seen.add(key);
  const page = await browser.newPage();
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith('http://localhost')) problems.push(`${r.status()} ${r.url()} （${key} から）`); });
  page.on('pageerror', (e) => problems.push(`スクリプトの例外 ${key}: ${e.message}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  // 遅延読み込みの画像も確かめる
  await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach((el) => { el.loading = 'eager'; }));
  await page.waitForTimeout(600);
  const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && getComputedStyle(i).display !== 'none').map((i) => i.src));
  broken.forEach((b) => problems.push(`画像が表示できない ${b} （${key}）`));
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href));
  for (const h of hrefs) {
    if (!h.startsWith(ORIGIN)) { if (h.startsWith('http://localhost')) problems.push(`サイトの外へ出るリンク ${h} （${key}）`); continue; }
    const [base, hash] = h.split('#');
    if (hash && base.split('?')[0] === key) { if (!(await page.evaluate((id) => !!document.getElementById(id), hash))) problems.push(`ページ内の行き先がない #${hash} （${key}）`); }
    else if (hash) anchors.add(h);
    queue.push(h);
  }
  await page.close();
}
for (const h of anchors) {
  const page = await browser.newPage();
  await page.goto(h, { waitUntil: 'domcontentloaded' });
  if (!(await page.evaluate((id) => !!document.getElementById(id), h.split('#')[1]))) problems.push(`行き先がない ${h}`);
  await page.close();
}
console.log('途中へ飛ぶリンク:', [...anchors].map((u) => u.replace(ORIGIN, '/')).join(' '));
console.log('調べたページ:', [...seen].map((u) => u.replace(ORIGIN, '/')).join(' '));
console.log(problems.length ? problems.join('\n') : '問題なし');
await browser.close();
server.close();
