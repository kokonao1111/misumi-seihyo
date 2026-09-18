// 全ページを縦に長い1枚で撮る（レイアウト確認用。3Dは代替表示にして撮る）
// 使い方: node scripts/shot-pages.mjs <サーバーのURL> <出力フォルダ> [幅]
import { chromium } from 'playwright';
import sharp from 'sharp';
const [base, out, w = 1440] = process.argv.slice(2);
const PAGES = ['', 'junpyo/', 'seihin/', 'bar/', 'haitatsu/', 'kaisha/', 'oshirase/', 'toiawase/', 'privacy/'];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +w, height: 900 }, reducedMotion: 'reduce' });
for (const p of PAGES) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errs.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${base}/${p}?noice`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-in')));
  await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach((el) => { el.loading = 'eager'; }));
  await page.waitForTimeout(800);
  const png = await page.screenshot({ fullPage: true });
  const name = (p || 'top/').replace('/', '');
  const meta = await sharp(png).metadata();
  await sharp(png).resize({ width: +w < 600 ? meta.width : Math.round(meta.width / 2) }).jpeg({ quality: 80 }).toFile(`${out}/pg-${w}-${name}.jpg`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log(name, meta.height, 'overflow', overflow, errs.length ? errs : '');
  await page.close();
}
await browser.close();
