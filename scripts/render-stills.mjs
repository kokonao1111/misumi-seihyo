// 3Dの氷を静止画に書き出す（3Dが使えない端末の代替表示と、切り分け図）。
// 使い方: 先に npm run dev を起動しておき、node scripts/render-stills.mjs [開発サーバーのURL]
import { chromium } from 'playwright';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
const BASE = process.argv[2] || 'http://localhost:5173';
const OUT = fileURLToPath(new URL('../public/images/', import.meta.url));
const JOBS = [
  { name: 'still-hero', q: 's=block&k=0.78&w=濁', w: 900, h: 1100 },
  { name: 'still-cloudy', q: 's=block&k=0.78&c=1&w=澄', w: 900, h: 1100 },
  { name: 'still-clear', q: 's=block&k=0.78&w=澄', w: 900, h: 1100 },
  { name: 'still-block', q: 's=kanme&k=0.78&w=貫', w: 900, h: 1100 },
  { name: 'still-cubes', q: 's=cubes&k=0.74&w=角', w: 900, h: 1100 },
  { name: 'still-ball', q: 's=ball&k=0.74&w=丸', w: 900, h: 1100 },
  { name: 'still-crushed', q: 's=crushed&k=0.7&w=割', w: 900, h: 1100 },
  { name: 'still-night', q: 's=ball&k=0.74&p=night&w=夜', w: 900, h: 1100 },
  { name: 'still-haitatsu', q: 's=cubes&k=0.74&w=朝', w: 900, h: 1100 },
  { name: 'still-kaisha', q: 's=kanme&k=0.78&w=年', w: 900, h: 1100 },
  { name: 'kiriwake', q: 's=column&k=0.82&w=36&v=1', w: 1200, h: 1500 },
];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const j of JOBS) {
  const page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/tools/still.html?${j.q}`, { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__ready === true');
  await page.waitForTimeout(300);
  const png = await page.screenshot();
  await sharp(png).webp({ quality: 82 }).toFile(`${OUT}${j.name}.webp`);
  await page.close();
  console.log('ok', j.name);
}
await browser.close();
