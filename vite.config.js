import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const PAGES = ['index', 'junpyo/index', 'seihin/index', 'bar/index', 'haitatsu/index', 'kaisha/index', 'oshirase/index', 'toiawase/index', 'privacy/index'];
const SITE = 'https://kokonao1111.github.io/misumi-seihyo/';

// 共通部品の差し込み。各ページの先頭に
//   <!--page {"title":"…","desc":"…","root":"../","current":"junpyo","path":"junpyo/"} -->
// と書き、<!--@head--> <!--@header--> <!--@footer--> の位置に src/partials/ の中身を入れる。
// 部品の中では {{title}} {{desc}} {{root}} {{url}} と、現在地の印 {{cur:名前}} が使える。
function partials() {
  return {
    name: 'misumi-partials',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const m = html.match(/<!--page\s+(\{[\s\S]*?\})\s*-->/);
        if (!m) return html;
        const page = JSON.parse(m[1]);
        const vars = { ...page, url: SITE + (page.path || '') };
        const fill = (s) => s
          .replace(/\{\{cur:([a-z]+)\}\}/g, (_, name) => (name === page.current ? ' aria-current="page"' : ''))
          .replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
        let out = html.replace(m[0], '');
        for (const name of ['head', 'header', 'footer']) {
          out = out.replace(`<!--@${name}-->`, () => readFileSync(here(`./src/partials/${name}.html`), 'utf8'));
        }
        return fill(out);
      },
    },
    // 部品を書き換えたら、開発中の画面を読み込み直す
    handleHotUpdate({ file, server }) {
      if (file.includes('/src/partials/')) server.ws.send({ type: 'full-reload' });
    },
  };
}

// 相対パスで書き出すので、dist/ はどの階層に置いても動く
export default defineConfig({
  base: './',
  plugins: [partials()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    rollupOptions: { input: Object.fromEntries(PAGES.map((p) => [p.replace('/index', '') , here(`./${p}.html`)])) },
  },
});
