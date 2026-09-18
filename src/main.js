import Lenis from 'lenis';

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

// 2行の大見出し（冒頭と夜で共通の組み方）
function twoLines(a, b) {
  return (ctx, w, h) => {
    if (isNarrow()) {
      // スマホ：1行目は上に、2行目は氷の真うしろに置いて、両端の字が氷からはみ出すようにする
      const size = Math.min(w * 0.235, h * 0.16);
      ctx.font = font(size);
      ctx.fillText(a, w * 0.05, h * 0.27);
      ctx.fillText(b, (w - ctx.measureText(b).width) / 2 + size * 0.12, h * 0.5 + size * 0.36);
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
      const size = Math.min((w * 0.9) / n, h * place.mh);
      ctx.font = font(size);
      ctx.fillText(word, (w - ctx.measureText(word).width) / 2, h * place.my + size * 0.36);
      return;
    }
    const size = Math.min((w * place.span) / n, h * place.dh);
    ctx.font = font(size);
    const tw = ctx.measureText(word).width;
    const x = place.right ? w * place.right - tw : w * place.cx - tw / 2;
    ctx.fillText(word, x, h * 0.5 + size * 0.36);
  };
}

const PRODUCTS = [
  { shape: 'kanme', name: '貫目氷' },
  { shape: 'cubes', name: '角氷' },
  { shape: 'ball', name: '丸氷' },
  { shape: 'crushed', name: 'かち割り' },
];
const productText = (i) => oneWord(PRODUCTS[i].name, { span: 0.6, dh: 0.4, right: 0.965, mh: 0.17, my: 0.31 });

const STAGES = {
  hero: {
    palette: 'day', shape: 'block', cloud: 0,
    text: twoLines('急ぐと、', '濁る。'),
    layout: () => (isNarrow() ? { x: 0, y: -0.02, scale: fit(0.36) } : { x: 0.24, y: 0.0, scale: 0.62 }),
  },
  clarity: {
    palette: 'day', shape: 'block', cloud: 1, refr: 0.1,
    text: oneWord('澄む', { span: 0.54, dh: 0.6, cx: 0.66, mh: 0.3, my: 0.47 }),
    layout: () => (isNarrow() ? { x: 0, y: 0.06, scale: fit(0.36) } : { x: 0.3, y: 0, scale: 0.6 }),
  },
  products: {
    palette: 'day', shape: null, cloud: 0,
    text: null,
    layout: () => (isNarrow() ? { x: 0, y: 0.3, scale: fit(0.29) } : { x: 0.36, y: 0, scale: 0.5 }),
  },
  night: {
    palette: 'night', shape: 'ball', cloud: 0, refr: 0.5,
    text: twoLines('薄め', 'ない。'),
    layout: () => (isNarrow() ? { x: 0, y: -0.17, scale: fit(0.27) } : { x: 0.14, y: -0.14, scale: 0.56 }),
  },
};

const NOTES = [
  [12, '家庭の冷凍庫の氷。外側から一気に凍り、空気と不純物が中心に閉じ込められて白く濁ります。'],
  [30, '製氷機の氷。見た目は透けてきますが、芯にはまだ細かい気泡が残っています。溶けるのも早い。'],
  [47.5, 'あと少し。水を動かし続けているので、白い芯は中心へ追いやられ、細くなっていきます。'],
  [99, '三澄の純氷。うしろの文字が、そのまま読めます。'],
];

async function initStage() {
  if (!root.classList.contains('has-ice')) return;
  const lowPower = (navigator.deviceMemory && navigator.deviceMemory <= 4) || navigator.hardwareConcurrency <= 4 || matchMedia('(pointer: coarse)').matches;

  // 背景の文字に使う字（日本語フォントは字ごとに分割配信される）と、3Dの部品を同時に読み込む。
  // 3Dの部品は大きいので、本文の表示は待たせない
  const glyphs = '急ぐと、濁る。澄む貫目氷角丸かち割り薄めない';
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
  const tabs = [...document.querySelectorAll('[data-product]')];
  const panels = [...document.querySelectorAll('[data-panel]')];
  let active = null;
  let productIndex = -1;
  let noteIndex = -1;

  function setProduct(i, instant) {
    if (i === productIndex) return;
    productIndex = i;
    stage.setShape(PRODUCTS[i].shape, { instant: instant || reduced });
    stage.setText(productText(i), { fade: !(instant || reduced) });
    tabs.forEach((t, k) => t.setAttribute('aria-selected', String(k === i)));
    panels.forEach((p, k) => p.classList.toggle('is-on', k === i));
  }

  function activate(s, p) {
    active = s;
    const c = s.cfg;
    stage.setPalette(c.palette, 0);
    stage.setLayout(c.layout());
    stage.setCloud(c.cloud);
    stage.setRefraction((c.refr ?? 0.24) * (isNarrow() ? 0.7 : 1));
    if (s.name === 'products') {
      productIndex = -1;
      setProduct(Math.min(3, Math.floor(p * 4)), true);
    } else {
      stage.setShape(c.shape, { instant: true });
      stage.setText(c.text);
    }
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

    const base = best.cfg.layout();
    if (best.name === 'hero') {
      stage.setLayout({ ...base, y: base.y + p * 0.12 });
      stage.scrollTurn = p * 1.1 + (isNarrow() ? 0.34 : 0);   // スマホは正面寄りに向けて、うしろの字を読みやすく
    } else if (best.name === 'clarity') {
      const t = clamp((p - 0.06) / 0.8);
      const hours = 3 + 45 * t;
      stage.setCloud(Math.pow(1 - t, 1.25));
      stage.scrollTurn = 0.1 + t * 0.42;   // 最後はほぼ正面を向き、うしろの字が読める
      hoursEl.textContent = String(Math.round(hours));
      barEl.style.transform = `scaleX(${hours / 48})`;
      const ni = NOTES.findIndex(([limit]) => hours < limit);
      if (ni !== noteIndex) { noteIndex = ni; noteEl.textContent = NOTES[ni][1]; }
    } else if (best.name === 'products') {
      setProduct(Math.min(3, Math.floor(p * 4)));
      stage.scrollTurn = 0;
    } else if (best.name === 'night') {
      stage.scrollTurn = p * 0.8;
    }

    if (reduced) stage.renderOnce(); else stage.start();
  }

  tabs.forEach((t, i) => t.addEventListener('click', () => {
    const el = sections.find((s) => s.name === 'products').el;
    const top = el.getBoundingClientRect().top + scrollY;
    scrollToY(top + ((i + 0.5) / 4) * (el.offsetHeight - innerHeight));
  }));

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
  addEventListener('scroll', () => {
    const y = scrollY;
    if (Math.abs(y - last) < 6) return;
    head.classList.toggle('is-away', y > last && y > 200 && !document.getElementById('nav').classList.contains('is-open'));
    last = y;
  }, { passive: true });
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

/* ---------- フォーム（見本：送信はしない） ---------- */
function initForm() {
  const form = document.getElementById('form');
  const done = document.getElementById('formDone');
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
  const pctEl = document.getElementById('meltPct');
  const homeEl = document.getElementById('meltHome');
  const t0 = performance.now();
  const MELT_MIN = 95; // 室温のグラスで丸氷（直径6.5cm）が溶けきるまでのおよその分数
  const HOME = [
    [60, '家庭の氷なら、そろそろ角が取れはじめる頃です。'],
    [240, '家庭の氷なら、グラスの底に水がたまってくる頃です。'],
    [600, '家庭の氷なら、もうひと回り小さくなっています。'],
    [1500, '家庭の氷なら、半分ほどになっています。'],
    [Infinity, '家庭の氷なら、もう残っていません。'],
  ];
  const tick = () => {
    const s = Math.floor((performance.now() - t0) / 1000);
    const m = Math.floor(s / 60);
    timeEl.textContent = m ? `${m}分${s % 60}秒` : `${s}秒`;
    pctEl.textContent = `${Math.min(100, (s / (MELT_MIN * 60)) * 100).toFixed(1)}%`;
    homeEl.textContent = HOME.find(([limit]) => s < limit)[1];
  };
  tick();
  setInterval(tick, 1000);
}

initReveal();
initHead();
initMenu();
initForm();
initMelt();
initStage().catch(() => root.classList.remove('has-ice'));
