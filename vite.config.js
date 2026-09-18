import { defineConfig } from 'vite';

// 相対パスで書き出すので、dist/ はどの階層に置いても動く
export default defineConfig({
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 0 },
});
