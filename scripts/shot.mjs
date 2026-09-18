// 画面確認用のスクリーンショット。使い方: node scripts/shot.mjs <url> <出力png> [幅] [高さ] [スクロール位置...]
import { chromium } from 'playwright';
const [url, out, w = 1440, h = 900, ...ys] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +w < 600 ? 2 : 1 });
page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()); });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
if (!ys.length) await page.screenshot({ path: out });
for (const y of ys) {
  // 数字ならその位置へ、「#id」や「#id+300」ならその要素の上端（＋ずらし）へ
  await page.evaluate((yy) => {
    const m = String(yy).match(/^(#[^+]+)(?:\+(\d+))?$/);
    const top = m ? document.querySelector(m[1]).getBoundingClientRect().top + scrollY + (+m[2] || 0) : +yy;
    window.scrollTo(0, top);
  }, y);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: out.replace('.png', `-${String(y).replace(/[#+]/g, '')}.png`) });
}
await browser.close();
