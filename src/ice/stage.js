import {
  BackSide, CanvasTexture, Color, Group, IcosahedronGeometry, LinearFilter, MathUtils, Mesh, NoColorSpace, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, SphereGeometry, Vector2, Vector3, WebGLRenderTarget, WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import gsap from 'gsap';
import { buildMakeRig } from './make.js';
import { backdropVert, backdropFrag, fogFrag, iceVert, iceFrag, backVert, backFrag } from './shaders.js';

const EASE = 'expo.out';

// 場面ごとの色。昼＝氷白の地、夜＝藍墨の地に琥珀の縁光
const PALETTE = {
  day: {
    bg: '#e9eff1', bgEdge: '#d3dfe4', ink: '#0c1a22', tint: '#a9d3e2',
    envHigh: '#ffffff', envLow: '#3b5563', light: '#ffffff', rim: '#ffffff',
    caustic: '#1c1f20', fogColor: '#ffffff', shadow: 0.2, fog: 0.5,
  },
  night: {
    bg: '#0c1a22', bgEdge: '#050b0f', ink: '#3a6076', tint: '#9cc9da',
    envHigh: '#1b3644', envLow: '#02060a', light: '#c98a45', rim: '#e08a2c',
    caustic: '#8a5420', fogColor: '#8fb4c4', shadow: 0.35, fog: 0.4,
  },
};

// 乱数（毎回同じ形になるよう種つき）
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// なめらかな乱れ（位置が同じなら同じ値になるので、頂点を動かしても継ぎ目が開かない）
function valueNoise(x, y, z) {
  const h = (i, j, k) => { const n = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return n - Math.floor(n); };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const f = (t) => t * t * (3 - 2 * t);
  const u = f(x - xi), v = f(y - yi), w = f(z - zi);
  const lerp = (a, b, t) => a + (b - a) * t;
  return lerp(
    lerp(lerp(h(xi, yi, zi), h(xi + 1, yi, zi), u), lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    lerp(lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
    w,
  ) - 0.5;
}

// 機械で作ったような完全な形をくずす。溶けて少しいびつになった面と、ふぞろいな角を作る
function roughen(geometry, amp, freq, seed, { flat = false } = {}) {
  let g = geometry;
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const len = Math.hypot(x, y, z) || 1;
    const d = (valueNoise(x * freq + seed, y * freq, z * freq) + 0.5 * valueNoise(x * freq * 2.3, y * freq * 2.3 + seed, z * freq * 2.3)) * amp;
    pos.setXYZ(i, x + (x / len) * d, y + (y / len) * d, z + (z / len) * d);
  }
  if (flat) g = g.toNonIndexed();   // かち割りは割れ口が平らな面になる
  g.computeVertexNormals();
  return g;
}

// かち割り用の塊：ばらまいた点を包む多面体。割れ口が大きな平面になり、角がふぞろいに立つ
function chunkGeometry(seed, radius) {
  const r = rng(seed);
  const pts = [];
  const sx = 0.8 + r() * 0.5, sy = 0.6 + r() * 0.35, sz = 0.7 + r() * 0.45;
  for (let i = 0; i < 11; i++) {
    const u = r() * 2 - 1, t = r() * Math.PI * 2, k = Math.sqrt(1 - u * u);
    const d = radius * (0.72 + r() * 0.38);
    pts.push(new Vector3(k * Math.cos(t) * d * sx, u * d * sy, k * Math.sin(t) * d * sz));
  }
  return new ConvexGeometry(pts);
}

export class IceStage {
  constructor(canvas, { lowPower = false } = {}) {
    this.canvas = canvas;
    this.lowPower = lowPower;
    this.renderer = new WebGLRenderer({ canvas, antialias: !lowPower, alpha: false, powerPreference: 'high-performance' });
    this.maxDpr = lowPower ? 1.25 : 2;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(26, 1, 0.1, 50);
    this.camera.position.set(0, 0, 10);

    this.textCanvasA = document.createElement('canvas');
    this.textCanvasB = document.createElement('canvas');
    this.texA = this.#maskTexture(this.textCanvasA);
    this.texB = this.#maskTexture(this.textCanvasB);

    const c = (hex) => new Color(hex);
    const p = PALETTE.day;
    this.backTarget = new WebGLRenderTarget(2, 2, { minFilter: LinearFilter, magFilter: LinearFilter });
    this.shared = {
      uText: { value: this.texA }, uTextB: { value: this.texB }, uTextMix: { value: 0 },
      uBack: { value: this.backTarget.texture },
      uBg: { value: c(p.bg) }, uBgEdge: { value: c(p.bgEdge) }, uInk: { value: c(p.ink) },
      uRes: { value: new Vector2(1, 1) },
      uShadow: { value: p.shadow }, uCaustic: { value: c(p.caustic) },
      uTime: { value: 0 }, uFog: { value: p.fog }, uFogColor: { value: c(p.fogColor) },
    };
    this.backMaterial = new ShaderMaterial({ vertexShader: backVert, fragmentShader: backFrag, side: BackSide });
    this.iceUniforms = {
      ...this.shared,
      uRefr: { value: 0.24 }, uBump: { value: 0.05 }, uBumpFreq: { value: 2.2 }, uFlow: { value: 0 },
      uSaw: { value: 0 }, uFrost: { value: 0 }, uCrack: { value: 0 }, uDrops: { value: 0 },
      uCloud: { value: 0 }, uHalf: { value: new Vector3(1, 1, 1) },
      uTint: { value: c(p.tint) }, uEnvHigh: { value: c(p.envHigh) }, uEnvLow: { value: c(p.envLow) },
      uLight: { value: c(p.light) }, uRim: { value: c(p.rim) }, uSeed: { value: 3.7 },
      uCenter: { value: new Vector2(0.5, 0.5) }, uLens: { value: 0 },
    };

    const quad = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({ uniforms: this.shared, vertexShader: backdropVert, fragmentShader: backdropFrag, depthTest: false, depthWrite: false }),
    );
    quad.frustumCulled = false;
    quad.renderOrder = -1;
    this.quad = quad;
    this.scene.add(quad);

    this.iceMaterial = new ShaderMaterial({ uniforms: this.iceUniforms, vertexShader: iceVert, fragmentShader: iceFrag });

    // 冷気：氷より手前に重ねる薄い霧。性能の低い端末では出さない
    this.fog = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({ uniforms: this.shared, vertexShader: backdropVert, fragmentShader: fogFrag, depthTest: false, depthWrite: false, transparent: true }),
    );
    this.fog.frustumCulled = false;
    this.fog.renderOrder = 10;
    this.fogEnabled = !lowPower;
    this.scene.add(this.fog);

    // 氷を載せる台。pivot=置き場所、spin=自転とポインタへの傾き
    this.pivot = new Group();
    this.spin = new Group();
    this.pivot.add(this.spin);
    this.scene.add(this.pivot);

    this.shapes = this.#buildShapes();
    this.current = null;
    this.pointer = new Vector2();
    this.pointerSmooth = new Vector2();
    this.drag = { active: false, x: 0, vel: 0, angle: 0 };
    this.autoSpin = 0;
    this.running = false;
    this.layout = { x: 0, y: 0, scale: 1 };
    this.lastTime = 0;
    this.#bindPointer();
  }

  #maskTexture(cv) {
    const t = new CanvasTexture(cv);
    t.colorSpace = NoColorSpace;
    t.minFilter = LinearFilter;
    t.generateMipmaps = false;
    return t;
  }

  #buildShapes() {
    const m = this.iceMaterial;
    const shapes = {};

    // 貫目氷（氷柱から切り出した直方体）
    const block = new Group();
    block.add(new Mesh(roughen(new RoundedBoxGeometry(1.5, 2.3, 1.05, 8, 0.1), 0.012, 1.1, 1.7), m));
    block.userData = { half: new Vector3(0.75, 1.15, 0.525), bump: 0.075, tilt: [0.16, -0.42, 0.04], saw: 1, frost: 1, crack: 1, drops: 1 };
    shapes.block = block;

    // 製品としての貫目氷（28 × 13 × 12cm を立てた比率）
    const kanme = new Group();
    kanme.add(new Mesh(roughen(new RoundedBoxGeometry(1.06, 2.3, 0.98, 8, 0.06), 0.01, 1.3, 4.2), m));
    kanme.userData = { half: new Vector3(0.53, 1.15, 0.49), bump: 0.06, tilt: [0.2, -0.6, 0.03], saw: 1, frost: 1, crack: 0.9, drops: 0.8 };
    shapes.kanme = kanme;

    // 氷柱1本の切り分け図：横2 × 奥2 × 縦9 = 36貫（静止画の書き出し用）
    const column = new Group();
    const PIECE = [0.56, 0.234, 0.26];
    const pg = roughen(new RoundedBoxGeometry(...PIECE, 3, 0.012), 0.003, 3, 5.5);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) {
      const piece = new Mesh(pg, m);
      piece.userData.cell = [x - 0.5, y - 4, z - 0.5];
      column.add(piece);
    }
    column.userData = { half: new Vector3(0.28, 0.117, 0.13), bump: 0.03, tilt: [0.22, -0.66, 0], saw: 0.6, frost: 0.8, crack: 0, drops: 0, size: 1.12 };
    this.columnPieces = { group: column, size: PIECE };
    this.setExplode(0.12);
    shapes.column = column;

    // 角氷：3つをずらして積む
    const cubes = new Group();
    const cg = roughen(new RoundedBoxGeometry(1, 1, 1, 6, 0.045), 0.008, 1.6, 8.8);
    [[-0.34, -0.62, 0.05, 0.2], [0.5, -0.6, -0.3, -0.5], [0.06, 0.4, -0.08, 0.75]].forEach(([x, y, z, ry]) => {
      const c = new Mesh(cg, m);
      c.position.set(x, y, z);
      c.rotation.y = ry;
      cubes.add(c);
    });
    cubes.userData = { half: new Vector3(0.5, 0.5, 0.5), bump: 0.04, tilt: [0.28, 0.3, 0], saw: 0.8, frost: 1, crack: 0.8, drops: 0.7 };
    shapes.cubes = cubes;

    // 丸氷
    const ball = new Group();
    ball.add(new Mesh(roughen(new SphereGeometry(1.08, this.lowPower ? 48 : 96, this.lowPower ? 32 : 64), 0.012, 1.6, 2.2), m));
    ball.userData = { half: new Vector3(1.08, 1.08, 1.08), bump: 0.035, tilt: [0.1, 0, 0], lens: 1.35, saw: 0, frost: 0, crack: 0.7, drops: 0.9 };
    shapes.ball = ball;

    // かち割り
    const crushed = new Group();
    const r = rng(77);
    const spots = [[-0.75, -0.55, 0], [0.1, -0.7, 0.35], [0.85, -0.5, -0.1], [-0.35, 0.15, -0.3], [0.5, 0.2, 0.2], [0.05, 0.85, 0], [-0.95, 0.35, 0.3], [1.0, 0.7, -0.35]];
    spots.forEach(([x, y, z], i) => {
      const c = new Mesh(chunkGeometry(100 + i * 13, 0.62 + r() * 0.2), m);
      c.position.set(x * 0.92, y * 0.92, z);
      c.rotation.set(r() * 6, r() * 6, r() * 6);
      crushed.add(c);
    });
    crushed.userData = { half: new Vector3(0.6, 0.45, 0.5), bump: 0.06, tilt: [0.2, 0.2, 0], saw: 0, frost: 0, crack: 1, drops: 0.4 };
    shapes.crushed = crushed;

    // 「1本の氷柱ができるまで」の模型（缶、水、芯、管、泡）
    this.makeRig = buildMakeRig(this);
    this.makeRig.group.userData = { half: new Vector3(0.63, 1.18, 0.29), bump: 0.05, tilt: [0.22, -0.66, 0], saw: 0, frost: 0, crack: 0, drops: 0 };
    shapes.make = this.makeRig.group;

    for (const g of Object.values(shapes)) { g.visible = false; g.scale.setScalar(0.001); this.spin.add(g); }
    return shapes;
  }

  #bindPointer() {
    window.addEventListener('pointermove', (e) => {
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
      if (this.drag.active) {
        const dx = e.clientX - this.drag.x;
        this.drag.x = e.clientX;
        this.drag.vel = dx * 0.008;
        this.drag.angle += this.drag.vel;
      }
    }, { passive: true });
    window.addEventListener('pointerup', () => { this.drag.active = false; });
    window.addEventListener('pointercancel', () => { this.drag.active = false; });
  }

  // 氷の上でのドラッグ開始を、DOM側のつかみ領域から受け取る
  grab(e) { this.drag.active = true; this.drag.x = e.clientX; this.drag.vel = 0; }

  setPalette(name, duration = 0.8) {
    const p = PALETTE[name];
    const u = this.iceUniforms;
    const pairs = [[u.uBg, p.bg], [u.uBgEdge, p.bgEdge], [u.uInk, p.ink], [u.uTint, p.tint], [u.uEnvHigh, p.envHigh], [u.uEnvLow, p.envLow], [u.uLight, p.light], [u.uRim, p.rim], [u.uCaustic, p.caustic], [u.uFogColor, p.fogColor]];
    u.uShadow.value = p.shadow;
    u.uFog.value = p.fog;
    for (const [uni, hex] of pairs) {
      const t = new Color(hex);
      if (duration === 0) uni.value.copy(t);
      else gsap.to(uni.value, { r: t.r, g: t.g, b: t.b, duration, ease: 'power2.out', overwrite: true });
    }
    this.paletteName = name;
  }

  // 形を切り替える。回りながら縮んで、次の形が回りながら現れる
  setShape(name, { instant = false } = {}) {
    if (this.current === name) return;
    const prev = this.current && this.shapes[this.current];
    const next = this.shapes[name];
    this.current = name;
    const ud = next.userData;
    this.iceUniforms.uHalf.value.copy(ud.half);
    this.iceUniforms.uBump.value = ud.bump;
    this.iceUniforms.uLens.value = ud.lens || 0;
    this.iceUniforms.uSaw.value = ud.saw || 0;
    this.iceUniforms.uFrost.value = ud.frost || 0;
    this.iceUniforms.uCrack.value = this.noCracks ? 0 : (ud.crack || 0);
    this.iceUniforms.uDrops.value = ud.drops || 0;
    this.baseTilt = ud.tilt;
    this.shapeSize = ud.size || 1;
    if (instant) {
      if (prev) { gsap.killTweensOf(prev.scale); prev.visible = false; prev.scale.setScalar(0.001); }
      gsap.killTweensOf(next.scale);
      next.visible = true; next.scale.setScalar(ud.size || 1); next.rotation.y = 0;
      return;
    }
    if (prev) {
      gsap.killTweensOf([prev.scale, prev.rotation]);
      gsap.to(prev.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.45, ease: 'power3.in', onComplete: () => { prev.visible = false; } });
      gsap.to(prev.rotation, { y: prev.rotation.y + 1.6, duration: 0.45, ease: 'power3.in' });
    }
    gsap.killTweensOf([next.scale, next.rotation]);
    next.visible = true;
    next.rotation.y = -1.8;
    const size = ud.size || 1;
    gsap.to(next.scale, { x: size, y: size, z: size, duration: 1.1, delay: prev ? 0.35 : 0, ease: EASE });
    gsap.to(next.rotation, { y: 0, duration: 1.4, delay: prev ? 0.35 : 0, ease: EASE });
  }

  // 濁りは目標の値へなめらかに寄せる（場面の変わり目で急に白くならないように）
  setCloud(v, { instant = false } = {}) { this.cloudTarget = v; if (instant) this.iceUniforms.uCloud.value = v; }

  // 氷柱の切れ目の開き具合。0=ぴったり重なった1本の氷柱、1=36個がばらばらに離れる
  setExplode(e) {
    if (!this.columnPieces || this.explode === e) return;
    this.explode = e;
    const { group, size } = this.columnPieces;
    const k = 1.004 + e * 0.42;
    for (const piece of group.children) {
      const [cx, cy, cz] = piece.userData.cell;
      // 上下の段ほど遠くへ。真ん中は動かさない
      piece.position.set(cx * size[0] * (1.004 + e * 0.38), cy * size[1] * k, cz * size[2] * (1.004 + e * 0.9));
      piece.rotation.set(0, e * 0.22 * ((cy % 2) ? 1 : -1) * (cx > 0 ? 1 : -1), 0);
    }
  }
  // 製氷の場面の進み具合（水位、管、泡、凍り具合、芯、脱缶など）
  setMake(state) { this.makeRig.setState(state); }

  setRefraction(v) { this.iceUniforms.uRefr.value = v; }

  // 氷の置き場所。x,y は画面の中心からの割合（-1〜1）、scale は画面の高さに対する大きさ
  // 毎フレーム、目標の位置へなめらかに寄せる。instant なら即座に移す
  setLayout({ x, y, scale }, { instant = false } = {}) {
    this.layoutTarget = { x, y, scale };
    if (instant) Object.assign(this.layout, this.layoutTarget);
  }

  // 背景の文字。draw(ctx, w, h) は CSS ピクセルの座標系で白い文字を描く
  setText(draw, { fade = false } = {}) {
    this.lastDraw = draw;
    const paint = (cv, tex) => {
      const w = this.cssW, h = this.cssH;
      const k = Math.min(this.dpr, 2560 / w);
      const cw = Math.round(w * k), ch = Math.round(h * k);
      // 大きさが変わったテクスチャは作り直す（確保済みの領域は伸び縮みしない）
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; tex.dispose(); }
      const ctx = cv.getContext('2d');
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      draw(ctx, w, h);
      tex.needsUpdate = true;
    };
    const u = this.shared;
    if (!fade) {
      gsap.killTweensOf(u.uTextMix);
      paint(this.textCanvasA, this.texA);
      u.uText.value = this.texA; u.uTextB.value = this.texB; u.uTextMix.value = 0;
      this.front = 'A';
      return;
    }
    // いま見えている側の反対に描いて、混ぜる量を動かす
    const toB = this.front !== 'B';
    paint(toB ? this.textCanvasB : this.textCanvasA, toB ? this.texB : this.texA);
    u.uText.value = this.texA; u.uTextB.value = this.texB;
    gsap.to(u.uTextMix, { value: toB ? 1 : 0, duration: 0.7, ease: 'power2.inOut', overwrite: true });
    this.front = toB ? 'B' : 'A';
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.cssW = w; this.cssH = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.renderer.getDrawingBufferSize(this.shared.uRes.value);
    const k = this.lowPower ? 0.5 : 0.75;
    this.backTarget.setSize(Math.round(this.shared.uRes.value.x * k), Math.round(this.shared.uRes.value.y * k));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.lastDraw) {
      const front = this.front;
      this.setText(this.lastDraw);
      if (front === 'B') { /* 描き直しは常にA側へ。混ぜる量は0に戻っている */ }
    }
  }

  start() { if (!this.running) { this.running = true; this.speedSince = 0; this.lastTime = performance.now(); this.renderer.setAnimationLoop(() => this.#frame()); } }
  stop() { this.running = false; this.renderer.setAnimationLoop(null); }

  renderOnce() { this.#frame(0); }

  // 描画が追いつかない端末では、段階的に軽くする（1: 冷気を止める　2: 解像度を下げる　3: ひびを止める）
  #watchSpeed(now) {
    if (!this.running || this.lockQuality || this.qualityStep >= 3) return;
    this.frames = (this.frames || 0) + 1;
    if (!this.speedSince) { this.speedSince = now; this.frames = 0; return; }
    const span = now - this.speedSince;
    if (span < 1500) return;
    const fps = (this.frames / span) * 1000;
    this.speedSince = now; this.frames = 0;
    if (fps > 40) return;
    this.qualityStep = (this.qualityStep || 0) + 1;
    if (this.qualityStep === 1) this.fogEnabled = false;
    if (this.qualityStep === 2) { this.maxDpr = Math.max(1, this.maxDpr * 0.7); this.resize(); }
    if (this.qualityStep === 3) this.noCracks = true;
    if (this.noCracks) this.iceUniforms.uCrack.value = 0;
  }

  #frame(forceDt) {
    const now = performance.now();
    const dt = forceDt ?? Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    const visH = 2 * this.camera.position.z * Math.tan(MathUtils.degToRad(this.camera.fov / 2));
    const visW = visH * this.camera.aspect;
    if (this.layoutTarget) {
      const k = forceDt === 0 ? 1 : 1 - Math.exp(-dt * 4.5);
      for (const key of ['x', 'y', 'scale']) this.layout[key] += (this.layoutTarget[key] - this.layout[key]) * k;
    }
    if (this.cloudTarget !== undefined) {
      const u = this.iceUniforms.uCloud;
      u.value += (this.cloudTarget - u.value) * (forceDt === 0 ? 1 : 1 - Math.exp(-dt * 5));
    }
    this.pivot.position.set(this.layout.x * visW / 2, this.layout.y * visH / 2, 0);
    this.pivot.scale.setScalar(this.layout.scale * visH / 2.6);

    this.iceUniforms.uCenter.value.set(0.5 + this.layout.x / 2, 0.5 + this.layout.y / 2);

    this.pointerSmooth.lerp(this.pointer, 1 - Math.exp(-dt * 3));
    if (!this.drag.active) { this.drag.angle += this.drag.vel; this.drag.vel *= Math.exp(-dt * 2.5); }
    if (!this.still) this.autoSpin += dt * 0.12;
    const t = this.baseTilt || [0, 0, 0];
    this.spin.rotation.set(
      t[0] - (this.still ? 0 : this.pointerSmooth.y * 0.18),
      t[1] + this.autoSpin + this.drag.angle + (this.scrollTurn || 0) + this.pointerSmooth.x * 0.3,
      t[2],
    );

    if (!this.still) this.shared.uTime.value += dt;   // 水滴と冷気を動かす
    if (this.current === 'make') this.makeRig.update(this.still ? 0 : dt);
    this.#watchSpeed(now);

    // 1回目：裏面の法線と奥行き　2回目：本番
    this.quad.visible = false;
    this.fog.visible = false;
    const hidden = this.makeRig.extras.filter((m) => m.visible);
    hidden.forEach((m) => { m.visible = false; });
    this.scene.overrideMaterial = this.backMaterial;
    this.renderer.setRenderTarget(this.backTarget);
    this.renderer.setClearColor(0x8080ff, 0);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.scene.overrideMaterial = null;
    hidden.forEach((m) => { m.visible = true; });
    this.quad.visible = true;
    this.fog.visible = this.fogEnabled;
    this.renderer.render(this.scene, this.camera);
  }
}
