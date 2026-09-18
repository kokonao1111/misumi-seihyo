// 実写素材を、サイトの色調（青みを抑えた氷白／藍墨）に寄せて WebP に書き出す。
// 使い方: node scripts/optimize-images.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const SRC = fileURLToPath(new URL('../assets-src/stock/', import.meta.url));
const OUT = fileURLToPath(new URL('../public/images/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const JOBS = [
  // 角氷の接写。元は紫がかった青なので、彩度を落として氷白に寄せる
  { src: 'us-NzeJNg2SXc8.jpg', name: 'kakugori', w: 1600, h: 1600, position: 'centre', grade: { saturation: 0.35, hue: -18 }, tint: null },
  // 夜：縦位置のロックグラス
  { src: 'us-Fo8UGw1XaPo.jpg', name: 'rock', w: 1400, h: 2100, position: 'centre', grade: { saturation: 0.9, brightness: 0.92 } },
  // 夜：角氷に注ぐ
  { src: 'us-dmkmrNptMpw.jpg', name: 'sosogu', w: 1600, h: 1067, position: 'centre', grade: { saturation: 0.9, brightness: 0.9 } },
];

for (const j of JOBS) {
  for (const [suffix, scale] of [['', 1], ['-800', 800 / j.w]]) {
    const w = Math.round(j.w * scale), h = Math.round(j.h * scale);
    await sharp(SRC + j.src).resize(w, h, { fit: 'cover', position: j.position }).modulate(j.grade).webp({ quality: 78 }).toFile(`${OUT}${j.name}${suffix}.webp`);
  }
  console.log('ok', j.name);
}
// SNS用の画像
await sharp(SRC + 'us-NzeJNg2SXc8.jpg').resize(1200, 630, { fit: 'cover' }).modulate({ saturation: 0.35, hue: -18 }).jpeg({ quality: 80 }).toFile(OUT + 'og.jpg');
