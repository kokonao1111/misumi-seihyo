// 「1本の氷柱ができるまで」の場面で使う模型。
// 鉄のアイス缶（手前の壁を外した断面）、中身（水から氷へ変わる）、まだ凍っていない白い芯、
// 空気を送る管、のぼっていく泡でできている。進み具合は setState() で外から渡す。
import {
  BoxGeometry, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, Quaternion, ShaderMaterial, SphereGeometry, Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { iceVert, iceFrag } from './shaders.js';

// 切り分けの場面の氷柱（横2×奥2×縦9を重ねた寸法）と同じ大きさ。次の場面へ継ぎ目なく渡すため
export const COLUMN = { w: 1.254, h: 2.36, d: 0.582 };

const plainVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vObj;
  void main() {
    vObj = position;
    #ifdef USE_INSTANCING
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      vN = normalMatrix * mat3(instanceMatrix) * normal;
    #else
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalMatrix * normal;
    #endif
    vView = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

// 亜鉛びきの鉄。縦の刷毛目と、にぶい映り込み
const steelFrag = /* glsl */ `
  uniform vec3 uSteel;
  uniform float uAlpha;
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vObj;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(-vView);
    if (dot(N, V) < 0.0) N = -N;   // 内側の面も同じように照らす
    vec3 L = normalize(vec3(-0.5, 0.75, 0.45));
    float diff = 0.45 + 0.55 * max(dot(N, L), 0.0);
    float streak = 0.92 + 0.08 * h(vec2(floor(vObj.x * 90.0) + floor(vObj.z * 90.0), 3.0));
    float spangle = 0.94 + 0.06 * h(floor(vObj.xy * 14.0) + floor(vObj.zz * 14.0));   // 亜鉛めっきの結晶模様
    float spec = pow(max(dot(N, normalize(L + V)), 0.0), 24.0) * 0.35;
    vec3 col = uSteel * diff * streak * spangle + spec;
    gl_FragColor = vec4(col, uAlpha);
    #include <colorspace_fragment>
  }
`;

// まだ凍っていない芯の水。空気と不純物が集まって白くにごる
const milkFrag = /* glsl */ `
  uniform float uMilk;     // 白いにごり
  uniform float uAmount;   // 水そのものの見え方（凍りはじめると、氷との違いが見えてくる）
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vObj;
  float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  void main() {
    float ndv = abs(dot(normalize(vN), normalize(-vView)));
    float swirl = 0.6 + 0.4 * n3(vObj * vec3(5.0, 2.2, 5.0) + vec3(0.0, -uTime * 0.35, uTime * 0.12));
    float body = 0.35 + 0.65 * pow(ndv, 1.2);
    float edge = pow(1.0 - ndv, 2.5);                 // 氷と水の境目が、うっすら白い線になる
    float a = uAmount * (0.78 * body + 0.6 * edge) + uMilk * body * swirl * 0.75;
    vec3 water = vec3(0.47, 0.66, 0.76);
    vec3 col = mix(water, vec3(0.95, 0.97, 0.98), clamp(uMilk * swirl * 1.1 + edge * 0.7, 0.0, 1.0));
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.94));
    #include <colorspace_fragment>
  }
`;

// 泡。縁だけが白く光る小さな球
const bubbleFrag = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    float ndv = abs(dot(normalize(vN), normalize(-vView)));
    float rim = pow(1.0 - ndv, 1.6);
    float glint = pow(max(dot(normalize(vN), normalize(vec3(-0.5, 0.75, 0.45))), 0.0), 18.0);
    gl_FragColor = vec4(vec3(1.0), clamp(rim * 0.85 + glint + 0.06, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function buildMakeRig(stage) {
  const { w, h, d } = COLUMN;
  const group = new Group();
  const extras = [];   // 氷ではないもの。裏面の下描きのときは隠す

  // ---- 中身：水から氷へ。氷の材質を自前の値で持つ（色や明かりは舞台と共有） ----
  const own = {
    uRefr: { value: 0.12 }, uBump: { value: 0.16 }, uBumpFreq: { value: 2.0 }, uFlow: { value: 1 },
    uSaw: { value: 0 }, uFrost: { value: 0 }, uCrack: { value: 0 }, uDrops: { value: 0 },
    uCloud: { value: 0 }, uHalf: { value: new Vector3(w / 2, h / 2, d / 2) }, uLens: { value: 0 }, uSeed: { value: 8.3 },
  };
  const bodyMaterial = new ShaderMaterial({ uniforms: { ...stage.iceUniforms, ...own }, vertexShader: iceVert, fragmentShader: iceFrag });
  const body = new Mesh(new RoundedBoxGeometry(w, h, d, 4, 0.03), bodyMaterial);
  group.add(body);

  // ---- 缶：奥・左右・底の4枚と、上の縁 ----
  const steel = new ShaderMaterial({
    uniforms: { uSteel: { value: new Vector3(0.52, 0.58, 0.62) }, uAlpha: { value: 1 } },
    vertexShader: plainVert, fragmentShader: steelFrag, side: DoubleSide, transparent: true,
  });
  const can = new Group();
  const t = 0.035, gap = 0.035, tall = 0.2;
  const cw = w + gap * 2, cd = d + gap * 2, ch = h + tall;
  const wall = (gw, gh, gd, x, y, z) => { const m = new Mesh(new BoxGeometry(gw, gh, gd), steel); m.position.set(x, y, z); can.add(m); extras.push(m); };
  const cy = tall / 2;
  wall(cw + t * 2, ch, t, 0, cy, -cd / 2 - t / 2);            // 奥
  wall(t, ch, cd, -cw / 2 - t / 2, cy, 0);                     // 左
  wall(t, ch, cd, cw / 2 + t / 2, cy, 0);                      // 右
  wall(cw + t * 2, t, cd + t, 0, -h / 2 - t / 2 - 0.005, -t / 2);   // 底
  const rimY = cy + ch / 2;
  wall(cw + t * 4, t * 1.4, t * 1.6, 0, rimY, -cd / 2 - t / 2);   // 縁（奥）
  wall(t * 1.6, t * 1.4, cd + t * 2, -cw / 2 - t / 2, rimY, 0);   // 縁（左）
  wall(t * 1.6, t * 1.4, cd + t * 2, cw / 2 + t / 2, rimY, 0);    // 縁（右）
  group.add(can);

  // ---- 芯の水 ----
  const milk = new ShaderMaterial({
    uniforms: { uMilk: { value: 0 }, uAmount: { value: 0 }, uTime: stage.shared.uTime },
    vertexShader: plainVert, fragmentShader: milkFrag, transparent: true, depthTest: false, depthWrite: false,
  });
  const core = new Mesh(new RoundedBoxGeometry(w, h, d, 3, 0.08), milk);
  core.renderOrder = 4;
  group.add(core); extras.push(core);

  // ---- 空気の管 ----
  const tubeMat = new ShaderMaterial({
    uniforms: { uSteel: { value: new Vector3(0.16, 0.2, 0.23) }, uAlpha: { value: 1 } },
    vertexShader: plainVert, fragmentShader: steelFrag, transparent: true, depthTest: false, depthWrite: false,
  });
  const tubeLen = h + 0.9;
  const tube = new Mesh(new CylinderGeometry(0.02, 0.02, tubeLen, 10), tubeMat);
  tube.renderOrder = 6;
  group.add(tube); extras.push(tube);

  // ---- 注いでいる水の筋 ----
  const pour = new Mesh(new CylinderGeometry(0.035, 0.028, 1, 12), new ShaderMaterial({
    uniforms: { uMilk: { value: 0.35 }, uAmount: { value: 0.9 }, uTime: stage.shared.uTime },
    vertexShader: plainVert, fragmentShader: milkFrag, transparent: true, depthTest: false, depthWrite: false,
  }));
  pour.renderOrder = 6;
  group.add(pour); extras.push(pour);

  // ---- 泡 ----
  const COUNT = 34;
  const bubbles = new InstancedMesh(new SphereGeometry(1, 10, 8), new ShaderMaterial({
    vertexShader: plainVert, fragmentShader: bubbleFrag, transparent: true, depthTest: false, depthWrite: false,
  }), COUNT);
  bubbles.renderOrder = 5;
  bubbles.frustumCulled = false;
  group.add(bubbles); extras.push(bubbles);
  const seeds = Array.from({ length: COUNT }, (_, i) => ({ p: (i * 0.618) % 1, s: 0.55 + ((i * 7) % 10) / 14, a: i * 2.4, r: 0.016 + ((i * 3) % 7) * 0.005 }));
  const mat = new Matrix4(), pos = new Vector3(), quat = new Quaternion(), scl = new Vector3();

  const state = { fill: 0, tube: 0, air: 0, freeze: 0, core: 1, milk: 0, drop: 0, finish: 0 };
  let clock = 0;

  function update(dt) {
    clock += dt;
    const s = state;
    // 水位：底から満ちる
    const fill = Math.max(0.001, s.fill);
    body.scale.set(1, fill, 1);
    body.position.y = -h / 2 + (h * fill) / 2;
    own.uHalf.value.set(w / 2, (h * fill) / 2, d / 2);

    // 水から氷へ
    own.uRefr.value = lerp(0.1, 0.2, s.freeze);
    own.uBump.value = lerp(0.18, 0.05, s.freeze);
    own.uFlow.value = (1 - s.freeze) * (0.35 + 0.65 * s.air);
    own.uFrost.value = s.finish;
    own.uSaw.value = 0;
    own.uDrops.value = s.finish * 0.8;
    own.uCrack.value = s.finish * 0.6;

    // 芯：氷が外から育つぶん、まだ凍っていない水が細っていく
    const c = clamp01(s.core);
    const amount = clamp01(s.freeze * 6) * clamp01(c * 12);
    core.visible = c > 0.02 && amount > 0.01;
    milk.uniforms.uAmount.value = amount;
    core.scale.set(Math.max(0.02, c), Math.max(0.02, 0.35 + 0.65 * c) * fill, Math.max(0.02, c));
    core.position.y = body.position.y;
    milk.uniforms.uMilk.value = s.milk;

    // 注いでいるあいだだけ、上から水面まで水の筋が落ちる
    const pouring = s.fill > 0.002 && s.fill < 0.985;
    pour.visible = pouring;
    if (pouring) {
      const surface = -h / 2 + h * fill;
      const from = h / 2 + 0.75;
      pour.scale.set(1, from - surface, 1);
      pour.position.set(-w * 0.12, (from + surface) / 2, 0);
    }

    // 管：上から下りてきて、終わると引き上げる
    tube.visible = s.tube > 0.01;
    tube.position.set(w * 0.08, lerp(h / 2 + tubeLen / 2 + 0.3, -h / 2 + tubeLen / 2 + 0.06, s.tube), 0);

    // 泡：管の先から、芯の中をのぼる
    const on = s.air * (s.tube > 0.9 ? 1 : 0);
    const top = -h / 2 + h * fill;
    const spanX = (w / 2) * Math.max(0.12, c) * 0.8, spanZ = (d / 2) * Math.max(0.12, c) * 0.8;
    for (let i = 0; i < COUNT; i++) {
      const b = seeds[i];
      const k = (b.p + clock * 0.22 * b.s) % 1;
      const y = lerp(-h / 2 + 0.08, top - 0.02, k);
      const spread = Math.min(1, k * 3);
      pos.set(w * 0.08 + Math.sin(b.a + clock * 1.7 * b.s) * spanX * spread, y, Math.cos(b.a * 1.3 + clock * 1.3) * spanZ * spread);
      const live = on * (i / COUNT < 0.25 + 0.75 * c ? 1 : 0) * Math.min(1, (1 - k) * 12);
      scl.setScalar(Math.max(1e-5, b.r * (0.7 + 0.6 * k) * live));
      mat.compose(pos, quat, scl);
      bubbles.setMatrixAt(i, mat);
    }
    bubbles.instanceMatrix.needsUpdate = true;
    bubbles.visible = on > 0.01;

    // 脱缶：缶が下へ抜けていく
    can.position.y = -s.drop * (h + 1.4);
    steel.uniforms.uAlpha.value = 1 - clamp01((s.drop - 0.55) / 0.45);
    can.visible = s.drop < 0.999;
  }

  return { group, extras, state, update, setState: (next) => Object.assign(state, next) };
}
