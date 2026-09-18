// スマホ幅の点検。全ページを上から下までたどり、次を調べる。
//   ・横にはみ出している要素
//   ・3Dの場面の中で、文章どうしが重なっていないか（章ごと、進み具合ごと）
//   ・メニューを開いたとき、全画面を覆っているか（紙面の上、夜の紙面の上でも）
// 使い方: npm run build && npm run preview のあと node scripts/audit-mobile.mjs <URL> <出力フォルダ> [幅] [高さ]
import { chromium } from 'playwright';
import sharp from 'sharp';
const [base, out, W = 390, H = 664] = process.argv.slice(2);
const PAGES = ['', 'junpyo/', 'seihin/', 'bar/', 'haitatsu/', 'kaisha/', 'oshirase/', 'toiawase/', 'privacy/'];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const problems = [];
const tiles = [];
for (const p of PAGES) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${p || 'top'}: 例外 ${e.message}`));
  await page.goto(`${base}/${p}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const name = p || 'top/';

  // 横はみ出し
  const wide = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed' && !el.matches('.skip') && !el.closest('[role="region"]') && !el.closest('.teaser__photo, .night__photo--b'); }).slice(0, 5).map((el) => `${el.tagName}.${el.className}`));
  if (wide.length) problems.push(`${name} 横はみ出し: ${wide.join(', ')}`);

  // 3Dの場面の中の重なり
  const stages = await page.evaluate(() => [...document.querySelectorAll('[data-stage]')].map((el) => ({ name: el.dataset.stage, top: el.offsetTop, h: el.offsetHeight })));
  for (const s of stages) {
    for (const f of [0.05, 0.5, 0.95]) {
      await page.evaluate((y) => window.scrollTo(0, y), s.top + Math.max(0, s.h - +H) * f);
      await page.waitForTimeout(1600);
      const hits = await page.evaluate((stageName) => {
        const sec = document.querySelector(`[data-stage="${stageName}"]`);
        const pin = sec.querySelector('.stage__pin');
        const boxes = [...pin.children].filter((el) => !el.matches('.stage__grab')).map((el) => {
          // 見えている文字のかたまりだけを対象にする
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05 || cs.clipPath !== 'none') return null;
          const inner = el.matches('.products__panels') ? el.querySelector('.is-on') : el;
          const r = inner.getBoundingClientRect();
          return r.width > 2 && r.height > 2 ? { n: el.className.split(' ')[0], l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
        }).filter(Boolean);
        const out = [];
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
          if (ox > 4 && oy > 4) out.push(`${a.n} × ${b.n}（${Math.round(oy)}px）`);
        }
        for (const b of boxes) if (b.b > innerHeight + 2 || b.t < 0) out.push(`${b.n} が画面の外（上${Math.round(b.t)} 下${Math.round(b.b)} / ${innerHeight}）`);
        return out;
      }, s.name);
      if (hits.length) problems.push(`${name} 場面「${s.name}」${Math.round(f * 100)}%: ${hits.join(' / ')}`);
      if (f === 0.5) tiles.push({ label: `${name}${s.name}`, png: await page.screenshot() });
    }
  }

  // メニュー：昼の紙面の上と、フッター（夜）の上で開く
  for (const where of ['sheet', 'foot']) {
    const y = await page.evaluate((w) => { const el = w === 'foot' ? document.querySelector('.foot') : document.querySelector('main > :not(.stage)'); return el ? Math.min(el.getBoundingClientRect().top + scrollY + 120, document.documentElement.scrollHeight - innerHeight) : null; }, where);
    if (y === null) continue;
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(500);
    await page.evaluate((yy) => window.scrollTo(0, yy - 80), y);   // 少し戻して、ヘッダーを出す
    await page.waitForTimeout(900);
    await page.click('#menu');
    await page.waitForTimeout(1100);
    const nav = await page.evaluate(() => { const r = document.getElementById('nav').getBoundingClientRect(); return { w: r.width, h: r.height, t: r.top, vw: innerWidth, vh: innerHeight }; });
    if (nav.w < nav.vw - 1 || nav.h < nav.vh - 1 || nav.t > 1) problems.push(`${name} メニューが全画面でない（${where}の上）: ${JSON.stringify(nav)}`);
    if (p === 'junpyo/') tiles.push({ label: `menu-${where}`, png: await page.screenshot() });
    await page.click('#menu');
    await page.waitForTimeout(700);
  }
  await page.close();
}
await browser.close();
const cols = 8;
const comp = await Promise.all(tiles.map(async (t, i) => ({ input: await sharp(t.png).resize(+W, +H).toBuffer(), left: (i % cols) * (+W + 8), top: Math.floor(i / cols) * (+H + 8) })));
await sharp({ create: { width: (+W + 8) * cols, height: (+H + 8) * Math.ceil(tiles.length / cols), channels: 3, background: '#f0f' } }).composite(comp).jpeg({ quality: 84 }).toFile(`${out}/audit-${W}x${H}.jpg`);
console.log(tiles.map((t) => t.label).join(' | '));
console.log(problems.length ? problems.join('\n') : '問題なし');
