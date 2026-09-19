import Lenis from 'lenis';
import { initAmbient } from './ambient.js';
import { sound } from './sound.js';

const root = document.documentElement;

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const isNarrow = () => innerWidth < 900 || innerWidth / innerHeight < 0.9;
// 縦長の画面では、氷の大きさを画面の幅に合わせる（スマホを基準に、タブレットでは大きく）
const fit = (scale) => scale * clamp(innerWidth / innerHeight / 0.46, 1, 1.55);

/* ---------- なめらかなスクロール ---------- */
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.11, anchors: { offset: -72 } });
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}
const scrollToY = (y) => (lenis ? lenis.scrollTo(y, { duration: 1.2 }) : window.scrollTo({ top: y }));

/* ---------- 氷の舞台 ---------- */
const MINCHO = '"Zen Old Mincho", "Hiragino Mincho ProN", serif';
const font = (size) => `900 ${size}px ${MINCHO}`;

// ---- 縦長の画面での置き方 ----
// 文章の大きさは端末で変わらないのに、画面の高さは端末やブラウザのバーで大きく変わる。
// 割合で置くと、背の低い画面で氷と文章が重なる。そこで、場面の中の文章の位置を実際に測り、
// 上の文章と下の文章のあいだの「空いている帯」に、大きな字と氷を収める。
let band = { top: 72, bottom: 600 };   // いまの場面の帯（画面の上からのピクセル）
const SHAPE_BOX = {   // 氷の形ごとの、高さの割合（舞台の scale=1 のとき画面の高さに対して）と、幅÷高さ
  field: [0.5, 2.3], block: [0.885, 0.66], kanme: [0.885, 0.47], column: [0.92, 0.72], make: [1.0, 0.58], cubes: [0.76, 1.0], ball: [0.83, 1.0], crushed: [0.85, 1.15],
};
// 字と氷の割り振り。字を上に、氷をその下に置き、氷の頭が字の足もとに少しだけ重なる。
// 氷は大きくしすぎない（画面の高さの46%まで、幅の62%まで）。余った高さは上下に分け、やや上に寄せる。
//   two=2行の見出し（1行目は上、2行目は氷の真うしろ）　one=1語
let plan = { size: 80, line1: 150, centre: 150, iceTop: 200, iceH: 240 };
function narrowPlan(kind, glyphs, w, H, ratio) {
  const bandH = Math.max(160, band.bottom - band.top);
  if (kind === 'two') {
    const size = Math.min(w * 0.235, bandH * 0.2);
    // 丸氷はレンズでうしろの字を逆さにするので、2行目の両端が氷の外に残るよう小さめにする
    const iceH = Math.max(80, Math.min(H * 0.46, (w * (ratio >= 1 ? 0.4 : 0.5)) / ratio, bandH - size * 1.15));
    const off = Math.max(0, (bandH - (size * 1.08 + iceH)) * 0.4);
    return { size, line1: band.top + off + size * 0.95, iceTop: band.top + off + size * 1.08, iceH };
  }
  if (kind === 'behind') {
    // 字を氷の真うしろに置く（「氷ごしに字が読める」ことを見せる場面）
    const iceH = Math.max(80, Math.min(H * 0.46, (w * 0.62) / ratio, bandH - 12));
    const off = Math.max(0, (bandH - iceH) * 0.45);
    const size = Math.min((w * 0.9) / glyphs, iceH * 0.6);
    return { size, centre: band.top + off + iceH / 2, iceTop: band.top + off, iceH };
  }
  const size = Math.min((w * 0.9) / glyphs, bandH * 0.24);
  const iceH = Math.max(80, Math.min(H * 0.46, (w * 0.62) / ratio, bandH - size * 0.9));
  const off = Math.max(0, (bandH - (size * 0.84 + iceH)) * 0.4);
  return { size, centre: band.top + off + size * 0.5, iceTop: band.top + off + size * 0.84, iceH };
}
function measureBand(sectionEl) {
  const pin = sectionEl.querySelector('.stage__pin');
  const pr = pin.getBoundingClientRect();
  let top = 64, bottom = pr.height;
  for (const el of pin.children) {
    if (el.matches('.stage__grab, .stage__still, .stage__stills, .hero__copy, .night__copy, .title__copy')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const t = r.top - pr.top, b = r.bottom - pr.top;
    if ((t + b) / 2 < pr.height / 2) top = Math.max(top, b + 6); else bottom = Math.min(bottom, t - 6);
  }
  return { top, bottom };
}
// 帯の中での氷の置き場所（舞台の座標に直す）。決めた割り振りは plan に残し、うしろの字を描くときに使う
function narrowLayout(cfg, shape, stage, x = 0) {
  const [hk, ratio] = SHAPE_BOX[shape] || SHAPE_BOX.block;
  const H = stage.cssH || innerHeight;
  plan = narrowPlan(cfg.plan || 'one', cfg.glyphs || 2, innerWidth, innerHeight, ratio);
  const centre = plan.iceTop + plan.iceH / 2;
  return { x, y: 1 - (2 * centre) / H, scale: plan.iceH / (hk * H) };
}

// 2行の大見出し（冒頭と夜で共通の組み方）
function twoLines(a, b) {
  return (ctx, w, h) => {
    if (isNarrow()) {
      // スマホ：1行目は上に、2行目は氷の真うしろに置いて、両端の字が氷からはみ出すようにする
      ctx.font = font(plan.size);
      ctx.fillText(a, w * 0.05, plan.line1);
      ctx.fillText(b, (w - ctx.measureText(b).width) / 2 + plan.size * 0.12, plan.iceTop + plan.iceH / 2 + plan.size * 0.36);
      return;
    }
    const size = Math.min(w * 0.19, h * 0.35);
    ctx.font = font(size);
    const top = (h - size * 2.1) / 2 - h * 0.02;
    ctx.fillText(a, w * 0.045, top + size * 0.88);
    ctx.fillText(b, w * 0.045 + size * 1.25, top + size * 2.0);
  };
}

function oneWord(word, place) {
  return (ctx, w, h) => {
    const n = [...word].length;
    if (isNarrow()) {
      ctx.font = font(plan.size);
      ctx.fillText(word, (w - ctx.measureText(word).width) / 2, plan.centre + plan.size * 0.36);
      return;
    }
    const size = Math.min((w * place.span) / n, h * place.dh);
    ctx.font = font(size);
    const tw = ctx.measureText(word).width;
    const x = place.right ? w * place.right - tw : w * place.cx - tw / 2;
    ctx.fillText(word, x, h * (place.cy ?? 0.5) + size * 0.36);
  };
}

const PRODUCTS = [
  { shape: 'kanme', name: '貫目氷' },
  { shape: 'cubes', name: '角氷' },
  { shape: 'ball', name: '丸氷' },
  { shape: 'crushed', name: 'かち割り' },
];
const productText = (i) => oneWord(PRODUCTS[i].name, { span: 0.6, dh: 0.4, right: 0.965, glyphs: 4 });

const STAGES = {
  hero: {
    palette: 'day', shape: 'block', cloud: 0, plan: 'two',
    text: twoLines('急ぐと、', '濁る。'),
    layout: () => (isNarrow() ? { x: 0, y: -0.02, scale: fit(0.36) } : { x: 0.24, y: 0.0, scale: 0.62 }),
  },
  // トップの章：左に文章、右に氷と大きな字
  intro: {
    palette: 'day', shape: 'block', cloud: 0, glyphs: 4,
    text: oneWord('水と時間', { span: 0.56, dh: 0.4, right: 0.965, cy: 0.46, mh: 0.17, my: 0.27 }),
    layout: () => (isNarrow() ? { x: 0, y: 0.24, scale: fit(0.3) } : { x: 0.34, y: 0.02, scale: 0.56 }),
  },
  make: {
    palette: 'day', shape: 'make', cloud: 0, glyphs: 2,
    text: null,
    layout: () => (isNarrow() ? { x: 0, y: 0.2, scale: fit(0.27) } : { x: 0.36, y: -0.02, scale: 0.54 }),
  },
  ayumi: {
    palette: 'day', shape: 'field', cloud: 0, glyphs: 5, refr: 0.18,
    text: null,
    layout: () => ({ x: 0.3, y: -0.16, scale: 0.72 }),
  },
  cut: {
    palette: 'day', shape: 'column', cloud: 0, refr: 0.2, glyphs: 3,
    text: oneWord('36貫', { span: 0.52, dh: 0.46, right: 0.965, cy: 0.48, mh: 0.2, my: 0.27 }),
    layout: () => (isNarrow() ? { x: 0, y: 0.24, scale: fit(0.26) } : { x: 0.36, y: 0, scale: 0.54 }),
  },
  clarity: {
    palette: 'day', shape: 'block', cloud: 1, refr: 0.1, glyphs: 2, plan: 'behind',
    text: oneWord('澄む', { span: 0.54, dh: 0.6, cx: 0.66, mh: 0.3, my: 0.47 }),
    layout: () => (isNarrow() ? { x: 0, y: 0.06, scale: fit(0.36) } : { x: 0.3, y: 0, scale: 0.6 }),
  },
  products: {
    palette: 'day', shape: null, cloud: 0, glyphs: 4,
    text: null,
    layout: () => (isNarrow() ? { x: 0, y: 0.3, scale: fit(0.29) } : { x: 0.36, y: 0, scale: 0.5 }),
  },
  haitatsu: {
    palette: 'day', shape: 'cubes', cloud: 0, glyphs: 3,
    text: oneWord('毎朝。', { span: 0.8, dh: 0.5, cx: 0.5, mh: 0.2, my: 0.4 }),
    layout: () => (isNarrow() ? { x: 0, y: 0.02, scale: fit(0.3) } : { x: 0.3, y: -0.02, scale: 0.5 }),
  },
  kaisha: {
    palette: 'day', shape: 'kanme', cloud: 0, glyphs: 4,
    text: oneWord('92年。', { span: 0.8, dh: 0.5, cx: 0.5, mh: 0.2, my: 0.4 }),
    layout: () => (isNarrow() ? { x: 0, y: 0.0, scale: fit(0.36) } : { x: 0.28, y: 0, scale: 0.6 }),
  },
  night: {
    palette: 'night', shape: 'ball', cloud: 0, refr: 0.5, plan: 'two', through: true,   // 前の場面から、氷をくぐり抜けて入る
    text: twoLines('薄め', 'ない。'),
    layout: () => (isNarrow() ? { x: 0, y: -0.17, scale: fit(0.27) } : { x: 0.14, y: -0.14, scale: 0.56 }),
  },
};

// 「1本の氷柱ができるまで」の段取り。at はスクロールの進み（0〜1）で、その段が始まる位置
const MAKE_STEPS = [
  { at: 0.0, word: '注水', when: '7日 5:30', note: 'ろ過した水を缶へ。水温16℃。槽の温度−10.2℃。缶は、−10℃の塩水の槽に沈めてあります。' },
  { at: 0.14, word: '送気', when: '7日 5:40', note: '缶の底へ管を下ろし、空気を送る。以後、止めない。動いている水は、空気や不純物を抱えたままでは凍れません。' },
  { at: 0.27, word: '凍る', when: '7日 〜 8日', note: '氷は缶の壁から内側へ、1時間に数ミリずつ育ちます。追い出された空気と不純物が、まだ凍っていない芯に集まって白くにごります。' },
  { at: 0.5, word: '芯水', when: '8日 14:00', note: '氷の厚み、壁から9cm。中心に残ったにごり水を抜き、新しい水に替える。ここを省くと、白い芯が残ります。' },
  { at: 0.72, word: '脱缶', when: '9日 5:30', note: '48時間。缶をぬるま湯にくぐらせ、氷柱を抜く。135kg。' },
  { at: 0.86, word: '検品', when: '9日 6:00', note: '光に透かして、芯とひびを見る。良。貯氷庫で1日寝かせて締めたあと、切り分けます。' },
];
const makeText = (i) => oneWord(MAKE_STEPS[i].word, { span: 0.4, dh: 0.4, right: 0.965, cy: 0.48, mh: 0.17, my: 0.25 });
const ramp = (p, a, b) => clamp((p - a) / (b - a));
const smooth = (t) => t * t * (3 - 2 * t);

// スクロールの進みから、模型の状態と経過時間を決める
function makeState(p) {
  const fill = smooth(ramp(p, 0.01, 0.12));
  const tubeIn = smooth(ramp(p, 0.14, 0.22));
  const tubeOut = smooth(ramp(p, 0.64, 0.7));
  const freeze = ramp(p, 0.27, 0.68);
  const swap = ramp(p, 0.5, 0.56);                    // 芯水の入れ替え：にごりがいったん消える
  const milkBefore = smooth(ramp(p, 0.3, 0.48)) * 0.85;
  const milkAfter = smooth(ramp(p, 0.56, 0.64)) * 0.45 * (1 - smooth(ramp(p, 0.64, 0.69)));
  return {
    state: {
      fill,
      tube: tubeIn * (1 - tubeOut),
      air: smooth(ramp(p, 0.2, 0.26)) * (1 - tubeOut),
      freeze: smooth(freeze),
      core: 1 - freeze * 0.97,
      milk: p < 0.5 ? milkBefore : lerpN(milkBefore, 0, smooth(swap)) + milkAfter,
      drop: smooth(ramp(p, 0.73, 0.85)),
      finish: smooth(ramp(p, 0.76, 0.88)),
    },
    hours: Math.round(48 * ramp(p, 0.14, 0.7)),
    turn: smooth(ramp(p, 0.86, 0.99)) * Math.PI,     // 検品：半回転。氷柱は前後対称なので、次の場面へそのままつながる
  };
}
const lerpN = (a, b, t) => a + (b - a) * t;

// 会社概要の「あゆみ」。氷柱の数が、その年のアイス缶の本数を表す（昭和9年は仕入れた氷1つ、焼失の年はゼロ）。
// at は、スクロールの進み（0〜1）でその年が始まる位置。見た目が変わる年に、長く時間を割く
const AYUMI = [
  { at: 0.0, era: '昭和9年', west: '1934年', ice: 1, count: '氷 リヤカー1台', text: '初代・三澄 清吉が、向島で氷の小売をはじめる。氷は仕入れて、1貫ずつ売った。' },
  { at: 0.13, era: '昭和20年', west: '1945年', ice: 0, count: '氷 なし', text: '空襲で店を焼失。翌年、同じ場所で再開する。' },
  { at: 0.27, era: '昭和27年', west: '1952年', ice: 40, count: 'アイス缶 40本', text: '製氷槽を据え、自社での製氷をはじめる。' },
  { at: 0.43, era: '昭和31年', west: '1956年', ice: 40, count: 'アイス缶 40本', text: '株式会社にする。' },
  { at: 0.5, era: '昭和39年', west: '1964年', ice: 40, count: '配達 1日600軒', text: '東京五輪の年、家庭への配達が最多になる。' },
  { at: 0.57, era: '昭和48年', west: '1973年', ice: 40, count: 'アイス缶 40本', text: '冷蔵庫が行きわたり、家庭向けの配達をやめる。飲食店向けに絞る。' },
  { at: 0.64, era: '平成11年', west: '1999年', ice: 40, count: 'アイス缶 40本', text: '丸氷の削り出しをはじめる。' },
  { at: 0.72, era: '平成30年', west: '2018年', ice: 120, count: 'アイス缶 120本', text: '四代目が継ぐ。貯氷庫を建て替え、アイス缶を3倍にする。' },
  { at: 0.9, era: '令和6年', west: '2024年', ice: 120, count: 'アイス缶 120本', text: '創業90年。' },
];
const ayumiText = (i) => oneWord(AYUMI[i].era, { span: 0.6, dh: 0.34, right: 0.965, cy: 0.3, glyphs: 5 });

const NOTES = [
  [12, '家庭の冷凍庫の氷。外側から一気に凍り、空気と不純物が中心に閉じ込められて白く濁ります。'],
  [30, '製氷機の氷。見た目は透けてきますが、芯にはまだ細かい気泡が残っています。溶けるのも早い。'],
  [47.5, 'あと少し。水を動かし続けているので、白い芯は中心へ追いやられ、細くなっていきます。'],
  [99, '三澄の純氷。うしろの文字が、そのまま読めます。'],
];

async function initStage() {
  if (!document.querySelector('[data-stage]')) { root.classList.remove('has-ice'); return; }
  if (!root.classList.contains('has-ice')) return;
  const lowPower = (navigator.deviceMemory && navigator.deviceMemory <= 4) || navigator.hardwareConcurrency <= 4 || matchMedia('(pointer: coarse)').matches;

  // 背景の文字に使う字（日本語フォントは字ごとに分割配信される）と、3Dの部品を同時に読み込む。
  // 3Dの部品は大きいので、本文の表示は待たせない
  const glyphs = '急ぐと、濁る。澄む貫目氷角丸かち割り薄めない毎朝92年水時間36注送気凍芯脱缶検品昭和平成令0123456789';
  const fontsLoaded = document.fonts.load(font(64), glyphs);
  const [{ IceStage }] = await Promise.all([
    import('./ice/stage.js'),
    Promise.race([fontsLoaded, new Promise((r) => setTimeout(r, 2500))]),
  ]);
  let stage;
  try { stage = new IceStage(document.getElementById('ice'), { lowPower }); } catch { root.classList.remove('has-ice'); return; }
  stage.still = reduced;
  stage.lockQuality = new URLSearchParams(location.search).has('hq');   // 画面確認用：自動の画質調整を止める
  stage.resize();

  const sections = [...document.querySelectorAll('[data-stage]')].map((el) => ({ el, name: el.dataset.stage, cfg: STAGES[el.dataset.stage] }));
  const hoursEl = document.getElementById('hours');
  const barEl = document.getElementById('hoursBar');
  const noteEl = document.getElementById('clarityNote');
  const cutEl = document.getElementById('cutCount');
  const makeEls = { hours: document.getElementById('makeHours'), when: document.getElementById('makeWhen'), note: document.getElementById('makeNote'), steps: [...document.querySelectorAll('[data-make-step]')] };
  let makeIndex = -1;
  let cutWas = 0;
  function setMakeStep(i, instant) {
    if (i === makeIndex) return;
    makeIndex = i;
    stage.setText(makeText(i), { fade: !(instant || reduced) });
    if (makeEls.when) makeEls.when.textContent = MAKE_STEPS[i].when;
    if (makeEls.note) makeEls.note.textContent = MAKE_STEPS[i].note;
    makeEls.steps.forEach((el, k) => { el.classList.toggle('is-now', k === i); el.classList.toggle('is-done', k < i); });
    // 段ごとの音：注ぐ、泡、ひび、芯水を注ぐ、缶から抜ける、検品のひと当て
    sound.bubbling(i >= 1 && i <= 3);
    if (!instant) [() => sound.pour(1.6), () => {}, () => sound.crack(0.5), () => sound.pour(1.0), () => { sound.thud(); sound.crack(0.9); }, () => sound.clink(0.6)][i]();
  }
  const ayumiEls = { count: document.getElementById('ayumiCount'), west: document.getElementById('ayumiWest'), text: document.getElementById('ayumiText'), steps: [...document.querySelectorAll('[data-ayumi-step]')] };
  let ayumiIndex = -1;
  let lastIce = -1;
  function setAyumi(i, instant) {
    if (i === ayumiIndex) return;
    ayumiIndex = i;
    const a = AYUMI[i];
    if (!instant && ayumiIndex >= 0 && a.ice > 0 && a.ice !== lastIce) sound.crack(0.7);
    lastIce = a.ice;
    stage.setFieldCount(a.ice, { instant: instant || reduced });
    stage.setText(ayumiText(i), { fade: !(instant || reduced) });
    if (ayumiEls.west) ayumiEls.west.textContent = a.west;
    if (ayumiEls.text) ayumiEls.text.textContent = a.text;
    if (ayumiEls.count) ayumiEls.count.textContent = a.count;
    ayumiEls.steps.forEach((el, k) => { el.classList.toggle('is-now', k === i); el.classList.toggle('is-done', k < i); });
  }
  const ayumiAt = (p) => AYUMI.reduce((acc, st, k) => (p >= st.at ? k : acc), 0);
  const makeStepAt = (p) => MAKE_STEPS.reduce((acc, st, k) => (p >= st.at ? k : acc), 0);
  const tabs = [...document.querySelectorAll('[data-product]')];
  const panels = [...document.querySelectorAll('[data-panel]')];
  let active = null;
  let productIndex = -1;
  let noteIndex = -1;

  // 場面の氷の置き場所。横長の画面は決め打ち、縦長の画面は文章を測って決める
  function layoutOf(s, shape) {
    if (!isNarrow()) return s.cfg.layout();
    return narrowLayout(s.cfg, shape || s.cfg.shape || 'block', stage, s.cfg.narrowX || 0);
  }

  function setProduct(i, instant) {
    if (i === productIndex) return;
    productIndex = i;
    if (isNarrow() && active) stage.setLayout(layoutOf(active, PRODUCTS[i].shape), { instant });
    stage.setShape(PRODUCTS[i].shape, { instant: instant || reduced });
    stage.setText(productText(i), { fade: !(instant || reduced) });
    if (!instant) sound.crack(0.8);
    tabs.forEach((t, k) => t.setAttribute('aria-selected', String(k === i)));
    panels.forEach((p, k) => p.classList.toggle('is-on', k === i));
  }

  // となり合う場面へ移るときは、氷を消さずに変身させる（形は回りながら入れ替わり、字は溶けるように替わり、
  // 位置と色はなめらかに寄る）。離れた場面へ飛んだときや最初の表示では、即座に切り替える
  let shownOnce = false;
  function activate(s, p) {
    const prev = active;
    active = s;
    const c = s.cfg;
    const neighbours = prev && (prev.el.nextElementSibling === s.el || prev.el.previousElementSibling === s.el);
    const animate = !!neighbours && !reduced;
    const passing = animate && (c.through || prev.cfg.through);
    if (s.name !== 'make') sound.bubbling(false);
    if (passing) sound.whoosh();
    if (s.name === 'night') setTimeout(() => sound.clink(1), passing ? 900 : 300);
    if (isNarrow()) { s.band = measureBand(s.el); band = s.band; }
    stage.setPalette(c.palette, passing ? 0.5 : animate ? 1.1 : 0);
    const firstShape = s.name === 'products' ? PRODUCTS[Math.min(3, Math.floor(p * 4))].shape : undefined;
    stage.setLayout(layoutOf(s, firstShape), { instant: !animate });
    stage.setCloud(c.cloud, { instant: !animate });
    stage.setRefraction((c.refr ?? 0.24) * (isNarrow() ? 0.7 : 1));
    if (s.name !== 'cut') stage.setExplode(0.12);
    if (s.name === 'products') {
      productIndex = -1;
      setProduct(Math.min(3, Math.floor(p * 4)), !animate || passing);
    } else if (s.name === 'ayumi') {
      ayumiIndex = -1;
      stage.setShape('field', { instant: true });
      setAyumi(ayumiAt(p), true);
    } else if (s.name === 'make') {
      makeIndex = -1;
      stage.setMake(makeState(p).state);
      // 切り分けの場面から戻ってきたときは、同じ大きさの氷柱どうしなので、その場で入れ替える
      stage.setShape('make', { instant: !animate || prev?.name === 'cut' });
      setMakeStep(makeStepAt(p), !animate);
    } else if (s.name === 'cut' && prev?.name === 'make') {
      stage.setShape('column', { instant: true });
      stage.setText(c.text, { fade: animate });
    } else {
      // 最初の1回だけは、氷が回りながら現れる
      stage.setShape(c.shape, { instant: passing || (!animate && (shownOnce || reduced)) });
      stage.setText(c.text, { fade: animate && !passing });
    }
    shownOnce = true;
    sections.forEach((x) => x.el.classList.toggle('is-active', x === s));
  }

  function update() {
    const vh = innerHeight;
    let best = null;
    let bestArea = 0;
    for (const s of sections) {
      const r = s.el.getBoundingClientRect();
      const area = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (area > bestArea) { bestArea = area; best = s; s.rect = r; }
    }
    if (!best) { active = null; stage.stop(); return; }
    const r = best.rect;
    const p = clamp(-r.top / Math.max(1, r.height - vh));
    if (best !== active) activate(best, p);

    const base = layoutOf(best, best.name === 'products' ? PRODUCTS[Math.max(0, productIndex)].shape : undefined);
    if (best.name === 'hero') {
      stage.setLayout({ ...base, y: base.y + p * (isNarrow() ? 0.03 : 0.12) });
      stage.scrollTurn = p * 1.1 + (isNarrow() ? 0.34 : 0);   // スマホは正面寄りに向けて、うしろの字を読みやすく
    } else if (best.name === 'clarity') {
      const t = clamp((p - 0.06) / 0.8);
      const hours = 3 + 45 * t;
      stage.setCloud(Math.pow(1 - t, 1.25));
      stage.scrollTurn = 0.1 + t * 0.42;   // 最後はほぼ正面を向き、うしろの字が読める
      if (hoursEl) hoursEl.textContent = String(Math.round(hours));
      if (barEl) barEl.style.transform = `scaleX(${hours / 48})`;
      const ni = NOTES.findIndex(([limit]) => hours < limit);
      if (ni !== noteIndex && noteEl) { noteIndex = ni; noteEl.textContent = NOTES[ni][1]; }
    } else if (best.name === 'products') {
      setProduct(Math.min(3, Math.floor(p * 4)));
      stage.scrollTurn = 0;
    } else if (best.name === 'ayumi') {
      setAyumi(ayumiAt(p));
      stage.scrollTurn = p * 0.9;   // 92年のあいだに、氷の列をゆっくり見まわす
    } else if (best.name === 'make') {
      const m = makeState(p);
      stage.setMake(m.state);
      stage.scrollTurn = m.turn;
      setMakeStep(makeStepAt(p));
      if (makeEls.hours) makeEls.hours.textContent = String(m.hours);
    } else if (best.name === 'cut') {
      // スクロールに合わせて、1本の氷柱に切れ目が入り、36個に分かれていく
      const t = clamp((p - 0.12) / 0.62);
      const e = t * t * (3 - 2 * t);
      if (e > 0.03 && cutWas <= 0.03) sound.crack(1);
      if (e > 0.5 && cutWas <= 0.5) sound.crack(0.6);
      cutWas = e;
      stage.setExplode(e);
      stage.scrollTurn = p * 1.3;
      if (cutEl) cutEl.textContent = String(Math.max(1, Math.round(1 + 35 * clamp((p - 0.12) / 0.5))));
    } else {
      stage.setLayout({ ...base, y: base.y + p * (isNarrow() ? 0.02 : 0.08) });
      stage.scrollTurn = p * 0.9 + (best.name === 'kaisha' && isNarrow() ? 0.34 : 0);
    }

    // 氷をくぐり抜ける：場面の境目で、スクロールに合わせて氷が画面いっぱいまで近づき、抜けた先が次の場面になる
    let pass = 0;
    const nextEl = best.el.nextElementSibling;
    if (best.cfg.through && best.el.previousElementSibling?.matches('[data-stage]')) pass = 1 - clamp(r.top / vh);
    else if (nextEl?.matches('[data-stage]') && STAGES[nextEl.dataset.stage]?.through) pass = 1 - clamp(nextEl.getBoundingClientRect().top / vh);
    const swell = pass > 0 && pass < 1 && !reduced ? Math.sin(Math.PI * pass) ** 2 : 0;
    stage.setZoom(1 + swell * (lowPower ? 3.2 : 6));

    if (reduced) stage.renderOnce(); else stage.start();
  }

  tabs.forEach((t, i) => t.addEventListener('click', () => {
    const el = sections.find((s) => s.name === 'products').el;
    const top = el.getBoundingClientRect().top + scrollY;
    scrollToY(top + ((i + 0.5) / 4) * (el.offsetHeight - innerHeight));
  }));

  makeEls.steps.forEach((el, i) => el.addEventListener('click', () => {
    const sec = sections.find((x) => x.name === 'make').el;
    const top = sec.getBoundingClientRect().top + scrollY;
    scrollToY(top + (MAKE_STEPS[i].at + 0.03) * (sec.offsetHeight - innerHeight));
  }));

  ayumiEls.steps.forEach((el, i) => el.addEventListener('click', () => {
    const sec = sections.find((x) => x.name === 'ayumi').el;
    const top = sec.getBoundingClientRect().top + scrollY;
    scrollToY(top + (AYUMI[i].at + 0.02) * (sec.offsetHeight - innerHeight));
  }));

  stage.onRelease = (speed) => { if (speed > 0.015) sound.clink(Math.min(1, 0.35 + speed * 6)); };

  document.querySelectorAll('[data-grab]').forEach((z) => z.addEventListener('pointerdown', (e) => stage.grab(e)));

  let ticking = false;
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; update(); }); } };
  addEventListener('scroll', onScroll, { passive: true });

  let lastW = innerWidth;
  let lastH = innerHeight;
  addEventListener('resize', () => {
    // スマホのアドレスバーの出入りでは描き直さない
    if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 140) return;
    lastW = innerWidth; lastH = innerHeight;
    stage.resize();
    const a = active; active = null;
    if (a) productIndex = -1;
    update();
  });

  update();
  stage.renderOnce();
  root.classList.add('ice-ready');
  startClearing();
  // 書体が間に合わなかったときは、届いてから背景の文字を描き直す
  fontsLoaded.then(() => { stage.resize(); const a = active; active = null; if (a) productIndex = -1; update(); });
  window.__stage = stage;
}

/* ---------- 現れる動き ---------- */
function initReveal() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -12% 0px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}

/* ---------- ヘッダー：下へ進むあいだは隠し、戻ると出す ---------- */
function initHead() {
  const head = document.getElementById('head');
  let last = scrollY;
  const paint = () => {
    // ヘッダーの真下にあるものを見て、見た目を決める。氷の舞台の上では透かし（文字は地と反転）、
    // 紙面の上では地色を敷いて、うしろの見出しと重ならないようにする
    head.style.pointerEvents = 'none';
    const under = document.elementFromPoint(innerWidth / 2, head.offsetHeight + 2);
    head.style.pointerEvents = '';
    const onStage = !under || !!under.closest('.stage') || scrollY < 40;
    const dark = !!under?.closest('.night, .onward--night, .foot');
    head.classList.toggle('is-solid', !onStage);
    head.classList.toggle('is-dark', !onStage && dark);
  };
  addEventListener('scroll', () => {
    const y = scrollY;
    if (Math.abs(y - last) < 6) return;
    head.classList.toggle('is-away', y > last && y > 200 && !document.getElementById('nav').classList.contains('is-open'));
    last = y;
    paint();
  }, { passive: true });
  paint();
}

/* ---------- 音の入り切り ---------- */
function initSound() {
  const btn = document.getElementById('sound');
  if (!btn) return;
  const show = () => { btn.setAttribute('aria-pressed', String(sound.on)); btn.textContent = sound.on ? '音を消す' : '音を出す'; };
  btn.addEventListener('click', () => { if (sound.on) sound.disable(); else sound.enable(); show(); });
  // 前に音を出していた人は、最初の操作（クリックやキー）で鳴らせるようにしておく
  if (sound.wanted()) {
    // 「音を出す」ボタンそのものを押したときは、ボタンの処理に任せる（二重に切り替わらないように）
    const arm = (e) => {
      if (e.target.closest?.('#sound')) return;
      removeEventListener('pointerdown', arm);
      removeEventListener('keydown', arm);
      if (!sound.on) { sound.enable(); show(); }
    };
    addEventListener('pointerdown', arm);
    addEventListener('keydown', arm);
  }
  show();
}

/* ---------- メニュー ---------- */
function initMenu() {
  const btn = document.getElementById('menu');
  const nav = document.getElementById('nav');
  const label = btn.querySelector('.head__menu-text');
  const set = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    document.getElementById('head').classList.toggle('is-menu', open);
    label.textContent = open ? 'とじる' : 'メニュー';
    if (lenis) (open ? lenis.stop() : lenis.start());
    document.body.style.overflow = open ? 'hidden' : '';
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
}

/* ---------- 格子の表：スマホでは1行ずつ札のように積むので、各マスに列の名前を持たせる ---------- */
function initTables() {
  document.querySelectorAll('table.grid').forEach((table) => {
    const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    let group = '';
    let left = 0;
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const th = tr.querySelector('th');
      const offset = th ? 0 : 1;   // 品名が上の行から続いている行は、列が1つずれる
      if (th) { group = th.textContent.trim(); left = (th.rowSpan || 1) - 1; } else if (left > 0) { tr.dataset.group = group; left -= 1; }
      let col = th ? 1 : 0;
      tr.querySelectorAll('td').forEach((td) => {
        const label = heads[col + offset] || '';
        if (label && (td.colSpan || 1) === 1) td.dataset.label = label;   // 列をまたぐマスには名前を付けない
        col += td.colSpan || 1;
      });
    });
  });
}

/* ---------- 配達：いま、どの便が走っているか（東京の時刻で） ---------- */
function initNowRun() {
  const line = document.getElementById('nowrunLine');
  const sub = document.getElementById('nowrunSub');
  if (!line) return;
  const rows = [...document.querySelectorAll('[data-bin]')].map((tr) => {
    const [from, to] = tr.dataset.bin.split(',').map(Number);   // 工場を出る時刻と戻る時刻（0時からの分）
    return { tr, from, to, name: tr.querySelector('th').textContent.trim(), area: tr.querySelector('td:last-child').textContent.trim() };
  });
  const fmt = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: 'numeric', minute: '2-digit', weekday: 'short', month: 'numeric', day: 'numeric', hour12: false });
  const span = (min) => (min >= 60 ? `${Math.floor(min / 60)}時間${min % 60 ? `${min % 60}分` : ''}` : `${min}分`);
  const tick = () => {
    const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
    const h = Number(parts.hour) % 24, m = Number(parts.minute);
    const now = h * 60 + m;
    const clock = `${h}:${String(m).padStart(2, '0')}`;
    const sunday = parts.weekday === '日';
    const newYear = parts.month === '1' && parts.day === '1';
    const running = sunday || newYear ? [] : rows.filter((r) => now >= r.from && now < r.to);
    rows.forEach((r) => r.tr.classList.toggle('is-running', running.includes(r)));
    if (sunday || newYear) line.textContent = `いま ${clock}。今日は${newYear ? '元日' : '日曜'}で、配達はお休みです。`;
    else if (running.length === 1) line.textContent = `いま ${clock}。${running[0].name}が、${running[0].area}をまわっています。`;
    else if (running.length > 1) line.textContent = `いま ${clock}。${running.map((r) => r.name).join('、')}が走っています。`;
    else if (now < rows[0].from) line.textContent = `いま ${clock}。${now >= 240 ? '1便の積み込み中です。' : '工場はまだ暗く、製氷槽だけが動いています。'}5:00に出ます。`;
    else line.textContent = `いま ${clock}。今日の配達は終わりました。`;
    // 注文の締め切りまで
    const saturday = parts.weekday === '土';
    if (sunday) sub.textContent = '月曜の分のご注文は、ファクスとLINEで受けています。月曜は朝5時、1便から出ます。';
    else if (now < 900) sub.textContent = `${saturday ? '月曜' : '明日'}の分のご注文は、15時まで。あと${span(900 - now)}です。`;
    else sub.textContent = `今日の受付は15時で終わりました。これからのご注文は、${saturday ? '火曜' : parts.weekday === '金' ? '月曜' : 'あさって'}のお届けになります。`;   // 日曜は配達がないので、金曜は月曜に、土曜は火曜になる
  };
  tick();
  setInterval(tick, 20000);
}

/* ---------- フォーム（見本：送信はしない） ---------- */
function initForm() {
  const form = document.getElementById('form');
  if (!form) return;
  const done = document.getElementById('formDone');
  // ほかのページのボタンから来たときは、ご用件を選んでおく（例：?yoken=saiyo）
  const yoken = new URLSearchParams(location.search).get('yoken');
  const preset = yoken && form.querySelector(`input[name="kind"][value="${CSS.escape(yoken)}"]`);
  if (preset) preset.checked = true;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let bad = null;
    form.querySelectorAll('[required]').forEach((el) => {
      const ng = !el.value.trim();
      el.classList.toggle('is-bad', ng);
      el.setAttribute('aria-invalid', String(ng));
      if (ng && !bad) bad = el;
    });
    if (bad) { bad.focus(); return; }
    done.hidden = false;
    form.querySelector('button[type="submit"]').disabled = true;
  });
}

/* ---------- フッターの溶け時計 ---------- */
function initMelt() {
  const timeEl = document.getElementById('meltTime');
  const iceEl = document.getElementById('meltIce');
  const homeEl = document.getElementById('meltHome');
  const againEl = document.getElementById('meltAgain');
  if (!timeEl || !iceEl) return;
  const KEY = 'misumi-opened';
  // ページを移っても続きから数える。保存できない環境では、このページを開いた時刻から数える
  let t0 = Date.now();
  try {
    const saved = Number(sessionStorage.getItem(KEY));
    if (saved > 0) t0 = saved; else sessionStorage.setItem(KEY, String(t0));
  } catch { /* そのまま */ }

  const MELT_MIN = 95; // 室温のグラスで丸氷（直径6.5cm）が溶けきるまでのおよその分数
  // 家庭の氷は、比較表のとおり約35分で溶けきる
  const HOME = [
    [60, '家庭の氷なら、そろそろ角が取れはじめる頃です。'],
    [300, '家庭の氷なら、グラスの底に水がたまってくる頃です。'],
    [900, '家庭の氷なら、もうひと回り小さくなっています。'],
    [1500, '家庭の氷なら、半分ほどになっています。'],
    [2100, '家庭の氷なら、もう小さなかけらです。'],
    [MELT_MIN * 60, '家庭の氷なら、もう残っていません。'],
    [Infinity, '家庭の氷なら、その間に2回は入れ替えています。'],
  ];

  // 文は、溶け具合に合わせて変える。「まだ◯%しか」と言えるのは、半分を過ぎるあたりまで
  const sentence = (pct) => {
    const n = `${pct.toFixed(1)}%`;
    if (pct < 60) return ['グラスに入れた三澄の丸氷は、まだ ', n, ' しか溶けていません。'];
    if (pct < 100) return ['グラスに入れた三澄の丸氷は、', n, ' まで溶けました。まだ、残っています。'];
    return ['グラスに入れた三澄の丸氷は、', `${MELT_MIN}分`, ' かけて溶けきりました。'];
  };
  let lastText = '';
  const tick = () => {
    const s = Math.max(0, Math.floor((Date.now() - t0) / 1000));
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    timeEl.textContent = h ? `${h}時間${m % 60}分` : m ? `${m}分${s % 60}秒` : `${s}秒`;
    const pct = Math.min(100, (s / (MELT_MIN * 60)) * 100);
    const parts = sentence(pct);
    if (parts.join('') !== lastText) {
      lastText = parts.join('');
      const b = document.createElement('b');
      b.textContent = parts[1];
      iceEl.replaceChildren(parts[0], b, parts[2]);
    }
    homeEl.textContent = HOME.find(([limit]) => s < limit)[1];
    if (againEl) againEl.hidden = pct < 100;
  };
  againEl?.addEventListener('click', () => {
    sound.clink(1);
    t0 = Date.now();
    try { sessionStorage.setItem(KEY, String(t0)); } catch { /* そのまま */ }
    tick();
  });
  tick();
  setInterval(tick, 1000);
}

// 曇りガラスが澄みはじめる合図。3Dのあるページは氷の準備ができたとき、ないページや間に合わないときは少し待ってから
function startClearing() {
  if (!root.classList.contains('is-frosted') || root.classList.contains('is-clearing')) return;
  root.classList.add('is-clearing');
  setTimeout(() => root.classList.remove('is-frosted', 'is-clearing'), 2600);
}
setTimeout(startClearing, document.querySelector('[data-stage]') && root.classList.contains('has-ice') ? 3200 : 350);

initAmbient({ reduced });
initReveal();
initTables();
initHead();
initSound();
window.__sound = sound;   // 点検用
initMenu();
initNowRun();
initForm();
initMelt();
initStage().catch(() => root.classList.remove('has-ice'));
