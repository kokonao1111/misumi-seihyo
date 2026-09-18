// 文字だけの部分の背景。3Dの場面と同じ「氷の向こうの壁」の続きとして描く。
//   ・氷や水を抜けた光が壁で揺れる、光の網
//   ・ゆっくり流れる、大きな窓明かりの帯
//   ・ポインタのまわりだけ、光の網が少し強くなる（氷を光にかざした感じ）
//   ・3Dの場面の壁と同じ、画面の周辺の陰り（場面と紙面の境目で、壁の色がつながる）
//
// 紙面の地色はCSSのまま残し、このキャンバスは画面のいちばん上に薄く重ねる。
//   昼の紙面：光の網の「すき間」に、ごく薄い青い陰を落とす（暗い文字には影響しない）
//   夜の紙面：光の網そのものを、ごく薄く足す
// 3Dの場面の上には描かない（その部分は透明）。地色を持たないので、スクロールに描画が1コマ遅れても破綻しない。
// three.js を使わない小さな WebGL で、半分の解像度で描く。ぼんやりした光なので、これで足りる。

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uScroll;        // ページのスクロール量（画面の高さを1とする）。壁は少し遅れて動く
uniform vec2 uPointer;        // 0〜1
uniform vec3 uBands[6];       // 描く帯。x=上端 y=下端（画面の上を0、下を1）、z=種類（0=昼 1=夜 2=明るい面）。使わない帯は z<0

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
// 尾根だけが明るい模様。2枚をずらして掛け合わせると、水底の光の網になる
float ridge(vec2 p) { return 1.0 - abs(2.0 * vnoise(p) - 1.0); }
float caustic(vec2 p, float t) {
  vec2 warp = vec2(vnoise(p * 0.55 + vec2(t * 0.11, 3.0)), vnoise(p * 0.55 + vec2(7.0, -t * 0.09))) - 0.5;
  float a = ridge(p + warp * 1.6 + vec2(t * 0.05, 0.0));
  float b = ridge(p * 1.63 - warp * 1.2 + vec2(4.0, t * 0.07));
  return pow(a, 5.0) * pow(b, 2.5);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float top = 1.0 - uv.y;
  float mode = -1.0;
  for (int i = 0; i < 6; i++) {
    vec3 b = uBands[i];
    if (b.z >= 0.0 && top >= b.x && top < b.y) mode = b.z;
  }
  if (mode < 0.0) { gl_FragColor = vec4(0.0); return; }

  float aspect = uRes.x / uRes.y;
  vec2 wall = vec2(uv.x * aspect, top + uScroll * 0.35);   // 壁は、紙面より遅れて動く

  // 光の網：大きな網と細かい網を重ねる
  float c = caustic(wall * 2.3, uTime) + 0.55 * caustic(wall * 4.9 + 11.0, uTime * 1.3);
  // 大きな窓明かりの帯が、斜めにゆっくり流れる
  float band = smoothstep(0.3, 0.95, vnoise(vec2((wall.x * 0.55 + wall.y * 0.9) * 0.9 - uTime * 0.012, 2.0)));
  // ポインタのまわり
  float near = exp(-pow(distance(vec2(uv.x * aspect, top), vec2(uPointer.x * aspect, uPointer.y)) * 2.6, 2.0));
  float light = clamp(c * (0.6 + 0.8 * band + 1.0 * near) * 1.5, 0.0, 1.0);
  // 3Dの場面の壁と同じ、周辺の陰り
  float v = smoothstep(0.25, 1.05, distance(uv, vec2(0.5, 0.48)));

  if (mode > 0.5 && mode < 1.5) {
    // 夜：冷たい光の網を薄く足す。ポインタのそばだけ琥珀がさす
    vec3 glow = vec3(0.42, 0.72, 0.84) * light * (0.1 + 0.08 * band) + vec3(0.95, 0.56, 0.18) * c * near * 0.16;
    float dim = v * 0.3;
    // 出力は「あらかじめ透明度を掛けた色」。色が透明度を超えると不正な値になり、透明度がちょうど0の所では
    // 光ごと捨てられて、丸い跡が出る。光の分の透明度を持たせたうえで、周辺の陰りを重ねる
    float lightA = clamp(max(glow.r, max(glow.g, glow.b)), 0.0, 1.0);
    gl_FragColor = vec4(glow * (1.0 - dim), lightA + dim * (1.0 - lightA));
  } else {
    // 昼：光の網のすき間と、窓明かりの帯の外に、薄い青い陰を落とす
    float shade = 0.105 * (1.0 - light) * (0.45 + 0.55 * (1.0 - band)) + 0.03 * (1.0 - band) + v * 0.075;
    gl_FragColor = vec4(vec3(0.1, 0.24, 0.33) * shade, shade);
  }
}
`;

export function initAmbient({ reduced = false } = {}) {
  const canvas = document.getElementById('amb');
  if (!canvas) return null;
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
  if (!gl) return null;

  const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch { return null; }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = Object.fromEntries(['uRes', 'uTime', 'uScroll', 'uPointer', 'uBands'].map((n) => [n, gl.getUniformLocation(prog, n)]));

  // 描く対象：3Dの場面ではない、紙面・次のページへのリンク・フッター
  const targets = [...document.querySelectorAll('main > :not(.stage), .foot')].map((el) => ({
    el,
    mode: el.matches('.night, .onward--night, .foot') ? 1 : el.matches('.cta, .shop') ? 2 : 0,
  }));

  const pointer = { x: 0.5, y: 0.4, tx: 0.5, ty: 0.4 };
  addEventListener('pointermove', (e) => { pointer.tx = e.clientX / innerWidth; pointer.ty = e.clientY / innerHeight; }, { passive: true });

  const SCALE = 0.5;
  function resize() {
    const w = Math.max(2, Math.round(canvas.clientWidth * SCALE)), h = Math.max(2, Math.round(canvas.clientHeight * SCALE));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  }

  const bands = new Float32Array(18);
  let time = 0, last = 0, lastKey = '';
  function draw(now) {
    const H = canvas.clientHeight || innerHeight;
    // 画面に入っている紙面を、上から順に帯にする。同じ種類でとなり合う帯はつなげる
    const list = [];
    for (const t of targets) {
      const r = t.el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= H || r.height === 0) continue;
      const a = Math.max(0, r.top) / H, b = Math.min(H, r.bottom) / H;
      const prev = list[list.length - 1];
      if (prev && prev[2] === t.mode && Math.abs(prev[1] - a) < 0.002) prev[1] = b; else list.push([a, b, t.mode]);
    }
    for (let i = 0; i < 6; i++) {
      const b = list[i];
      bands[i * 3] = b ? b[0] : 0; bands[i * 3 + 1] = b ? b[1] : 0; bands[i * 3 + 2] = b ? b[2] : -1;
    }
    // 動きを止める設定の端末では、見えている帯やスクロール位置が変わったときだけ描き直す
    const key = reduced ? `${list.join('|')}|${Math.round(scrollY / 8)}` : '';
    if (reduced && key === lastKey) return;
    lastKey = key;
    if (!list.length) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); return; }

    resize();
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;
    if (!reduced) time += dt;
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, time);
    gl.uniform1f(U.uScroll, scrollY / H);
    gl.uniform2f(U.uPointer, pointer.x, pointer.y);
    gl.uniform3fv(U.uBands, bands);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function loop(now) {
    if (!document.hidden) draw(now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  return { canvas };
}
