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
    ctx.fillText(word, x, h * (place.cy ?? 0.5) + size * 0.36);
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
  // トップの章：左に文章、右に氷と大きな字
  intro: {
    palette: 'day', shape: 'block', cloud: 0,
    text: oneWord('水と時間', { span: 0.56, dh: 0.4, right: 0.965, cy: 0.46, mh: 0.17, my: 0.27 }),
    layout: () => (isNarrow() ? { x: 0, y: 0.24, scale: fit(0.3) } : { x: 0.34, y: 0.02, scale: 0.56 }),
  },
  cut: {
    palette: 'day', shape: 'column', cloud: 0, refr: 0.2,
    text: oneWord('36貫', { span: 0.52, dh: 0.46, right: 0.965, cy: 0.48, mh: 0.2, my: 0.27 }),
    layout: () => (isNarrow() ? { x: 0, y: 0.24, scale: fit(0.26) } : { x: 0.36, y: 0, scale: 0.54 }),
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
  haitatsu: {
    palette: 'day', shape: 'cubes', cloud: 0,
    text: oneWord('毎朝。', { span: 0.8, dh: 0.5, cx: 0.5, mh: 0.2, my: 0.4 }),
    layout: () => (isNarrow() ? { x: 0, y: 0.02, scale: fit(0.3) } : { x: 0.3, y: -0.02, scale: 0.5 }),
  },
  kaisha: {
    palette: 'day', shape: 'kanme', cloud: 0,
    text: oneWord('92年。', { span: 0.8, dh: 0.5, cx: 0.5, mh: 0.2, my: 0.4 }),
    layout: () => (isNarrow() ? { x: 0, y: 0.0, scale: fit(0.36) } : { x: 0.28, y: 0, scale: 0.6 }),
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
  if (!document.querySelector('[data-stage]')) { root.classList.remove('has-ice'); return; }
  if (!root.classList.contains('has-ice')) return;
  const lowPower = (navigator.deviceMemory && navigator.deviceMemory <= 4) || navigator.hardwareConcurrency <= 4 || matchMedia('(pointer: coarse)').matches;

  // 背景の文字に使う字（日本語フォントは字ごとに分割配信される）と、3Dの部品を同時に読み込む。
  // 3Dの部品は大きいので、本文の表示は待たせない
  const glyphs = '急ぐと、濁る。澄む貫目氷角丸かち割り薄めない毎朝92年水時間36';
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

  // となり合う場面へ移るときは、氷を消さずに変身させる（形は回りながら入れ替わり、字は溶けるように替わり、
  // 位置と色はなめらかに寄る）。離れた場面へ飛んだときや最初の表示では、即座に切り替える
  let shownOnce = false;
  function activate(s, p) {
    const prev = active;
    active = s;
    const c = s.cfg;
    const neighbours = prev && (prev.el.nextElementSibling === s.el || prev.el.previousElementSibling === s.el);
    const animate = !!neighbours && !reduced;
    stage.setPalette(c.palette, animate ? 1.1 : 0);
    stage.setLayout(c.layout(), { instant: !animate });
    stage.setCloud(c.cloud, { instant: !animate });
    stage.setRefraction((c.refr ?? 0.24) * (isNarrow() ? 0.7 : 1));
    if (s.name !== 'cut') stage.setExplode(0.12);
    if (s.name === 'products') {
      productIndex = -1;
      setProduct(Math.min(3, Math.floor(p * 4)), !animate);
    } else {
      // 最初の1回だけは、氷が回りながら現れる
      stage.setShape(c.shape, { instant: !animate && (shownOnce || reduced) });
      stage.setText(c.text, { fade: animate });
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

    const base = best.cfg.layout();
    if (best.name === 'hero') {
      stage.setLayout({ ...base, y: base.y + p * 0.12 });
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
    } else if (best.name === 'cut') {
      // スクロールに合わせて、1本の氷柱に切れ目が入り、36個に分かれていく
      const t = clamp((p - 0.12) / 0.62);
      const e = t * t * (3 - 2 * t);
      stage.setExplode(e);
      stage.scrollTurn = p * 1.3;
      if (cutEl) cutEl.textContent = String(Math.max(1, Math.round(1 + 35 * clamp((p - 0.12) / 0.5))));
    } else {
      stage.setLayout({ ...base, y: base.y + p * 0.08 });
      stage.scrollTurn = p * 0.9 + (best.name === 'kaisha' && isNarrow() ? 0.34 : 0);
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
  const pctEl = document.getElementById('meltPct');
  const homeEl = document.getElementById('meltHome');
  if (!timeEl) return;
  let t0 = Date.now();
  try {
    const saved = Number(sessionStorage.getItem('misumi-opened'));
    if (saved > 0) t0 = saved; else sessionStorage.setItem('misumi-opened', String(t0));
  } catch { /* 保存できない環境では、このページを開いた時刻から数える */ }
  const MELT_MIN = 95; // 室温のグラスで丸氷（直径6.5cm）が溶けきるまでのおよその分数
  const HOME = [
    [60, '家庭の氷なら、そろそろ角が取れはじめる頃です。'],
    [240, '家庭の氷なら、グラスの底に水がたまってくる頃です。'],
    [600, '家庭の氷なら、もうひと回り小さくなっています。'],
    [1500, '家庭の氷なら、半分ほどになっています。'],
    [Infinity, '家庭の氷なら、もう残っていません。'],
  ];
  const tick = () => {
    const s = Math.floor((Date.now() - t0) / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    timeEl.textContent = h ? `${h}時間${m % 60}分` : m ? `${m}分${s % 60}秒` : `${s}秒`;
    pctEl.textContent = `${Math.min(100, (s / (MELT_MIN * 60)) * 100).toFixed(1)}%`;
    homeEl.textContent = HOME.find(([limit]) => s < limit)[1];
  };
  tick();
  setInterval(tick, 1000);
}

initReveal();
initTables();
initHead();
initMenu();
initForm();
initMelt();
initStage().catch(() => root.classList.remove('has-ice'));
