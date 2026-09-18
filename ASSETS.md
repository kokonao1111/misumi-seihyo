# 素材の記録

このサイトで使っている素材の出どころとライセンスです。すべて無料で、商用利用できます。

## 実写（Unsplash）

Unsplash License の写真です。商用利用できて、クレジット表記の義務はありません（任意）。写真そのものを無加工で再販売することと、似たサービスを作るために写真を集めることだけが禁じられています。Unsplash+（有料）の写真は使っていません。

| ファイル | 使用箇所 | 撮影者 | 元のページ | 加工 |
|---|---|---|---|---|
| `public/images/kakugori.webp`（＋`-800`） | はじめに | Maria Kovalets（@marylooo） | https://unsplash.com/photos/NzeJNg2SXc8 | 正方形に切り抜き。紫がかった青を抑えるため彩度を35%に下げ、色相を調整 |
| `public/images/og.jpg` | SNSで共有されたときの画像 | 同上 | 同上 | 1200×630に切り抜き、同じ色調整 |
| `public/images/rock.webp`（＋`-800`） | 夜のセクション（縦） | Ambitious Studio* / Rick Barrett（@weareambitious） | https://unsplash.com/photos/Fo8UGw1XaPo | 2:3に切り抜き、明るさを少し落とした |
| `public/images/sosogu.webp`（＋`-800`） | 夜のセクション（横） | Adam Jaime（@arobj） | https://unsplash.com/photos/dmkmrNptMpw | 3:2に切り抜き、明るさを少し落とした |

- 取得：`node scripts/fetch-stock.mjs`（元画像を `assets-src/stock/` に保存）
- 変換：`node scripts/optimize-images.mjs`（切り抜き、色調整、WebP書き出し）

## 3D（自作）

外部のモデルは使っていません。氷の形はすべて Three.js のコードで生成しています（`src/ice/stage.js`）。見た目は自作の屈折シェーダーです（`src/ice/shaders.js`）。

| ファイル | 使用箇所 | 作り方 |
|---|---|---|
| `public/images/kiriwake.webp` | 澄む理由（氷柱の切り分け図） | 同じ3Dエンジンで、横2×奥2×縦9＝36個の貫目氷を並べて書き出し |
| `public/images/still-*.webp`（8枚） | 3Dが使えない端末での代替表示 | 同じ3Dエンジンの静止画 |

- 書き出し：`npm run dev` を起動した状態で `node scripts/render-stills.mjs http://localhost:5173`

## 書体

| 書体 | 用途 | 配信 | ライセンス |
|---|---|---|---|
| Zen Old Mincho（700 / 900） | 見出し、数字、3Dの背景文字 | Google Fonts | SIL Open Font License 1.1 |
| Zen Kaku Gothic New（400 / 500 / 700） | 本文 | Google Fonts | SIL Open Font License 1.1 |

## ライブラリ

| 名前 | 用途 | ライセンス |
|---|---|---|
| three | 3D描画 | MIT |
| gsap | 形と色の切り替えの動き | 標準ライセンス（無料、商用可） |
| lenis | なめらかなスクロール | MIT |
| vite / sharp / playwright | ビルド、画像変換、画面確認（開発時のみ） | MIT / Apache-2.0 / Apache-2.0 |

## 使わなかったもの

- Pollinations（無料の画像生成）。工場や作業の写真を12種類・約40枚生成しましたが、どれも似た通路の絵になり、透かしのロゴも入るようになっていたため、1枚も採用していません。生成物は削除しました。
- Pexels と Openverse の写真。候補を取得して見比べましたが、世界観に合うものがなく不採用です。
