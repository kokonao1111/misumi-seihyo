// 氷の舞台のシェーダー。
// 背景（地色＋特大の文字）は画面にぴったり貼った1枚の板で、氷はその同じ絵を
// 屈折させた位置から読み直す。物理ベースの透過マテリアルより軽く、スマホでも回る。
//
// 写実に寄せるための要素：
//   表面 … ゆるいうねり、切り口ののこぎり目、角の霜、伝い落ちる水滴
//   内部 … ひび（面で割れていて、光の向きが合うと白く光る）、急いで凍らせた氷の白い芯
//   光   … 窓のある部屋の映り込み、全反射、厚みによる青み、縁に回る光
//   まわり … うしろの壁に落ちる影と光だまり、下へ流れる冷気

const NOISE = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
                   mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                   mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
    return s;
  }
`;

const COMMON = /* glsl */ `
  uniform sampler2D uText;   // 文字のマスク（白=文字）
  uniform sampler2D uTextB;  // 切り替え先の文字
  uniform float uTextMix;    // 0=uText 1=uTextB
  uniform sampler2D uBack;   // 氷の裏面の法線（rgb）と奥行き（a）。a>0 なら氷がある
  uniform vec3 uBg;
  uniform vec3 uBgEdge;
  uniform vec3 uInk;
  uniform vec2 uRes;

  vec3 backdrop(vec2 uv) {
    vec2 c = clamp(uv, 0.0, 1.0);
    float m = mix(texture2D(uText, c).r, texture2D(uTextB, c).r, uTextMix);
    float v = smoothstep(0.25, 1.05, distance(c, vec2(0.5, 0.52)));
    return mix(mix(uBg, uBgEdge, v), uInk, m);
  }

  // 氷の輪郭をぼかして読む（影・光だまり・冷気に使う）
  float coverage(vec2 uv, float radius) {
    float aspect = uRes.x / uRes.y;
    float s = step(0.004, texture2D(uBack, uv).a) * 2.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7854;
      vec2 o = vec2(cos(a) / aspect, sin(a)) * radius * (mod(float(i), 2.0) < 0.5 ? 1.0 : 0.55);
      s += step(0.004, texture2D(uBack, uv + o).a);
    }
    return s / 10.0;
  }
`;

export const backdropVert = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }
`;

export const backdropFrag = /* glsl */ `
  ${COMMON}
  uniform float uShadow;    // 壁に落ちる影の濃さ
  uniform vec3 uCaustic;    // 氷を抜けた光が壁に集まる色
  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    vec3 col = backdrop(uv);
    // 光は左上から。影は右下へずれて、ぼける
    float sh = coverage(uv + vec2(-0.016, 0.034), 0.03);
    col *= 1.0 - uShadow * sh;
    // 影の芯に、氷がレンズになって集めた光だまり
    float ca = coverage(uv + vec2(-0.012, 0.03), 0.022) * coverage(uv + vec2(-0.03, 0.05), 0.03);
    col += uCaustic * ca * ca;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

// 下へ流れる冷気
export const fogFrag = /* glsl */ `
  ${COMMON}
  ${NOISE}
  uniform float uTime;
  uniform float uFog;
  uniform vec3 uFogColor;
  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    // この画素の少し上に氷があれば、冷気が降りてきている
    float m = coverage(uv + vec2(0.0, 0.07), 0.07) * 0.9 + coverage(uv + vec2(0.0, 0.16), 0.09) * 0.5;
    if (m < 0.01 || uFog < 0.01) discard;
    vec3 p = vec3(uv.x * aspect * 2.6, uv.y * 2.2 + uTime * 0.06, uTime * 0.035);
    float f = fbm(p) * 0.65 + fbm(p * 2.7 + 3.1) * 0.35;
    float wisps = smoothstep(0.38, 0.78, f);
    gl_FragColor = vec4(uFogColor, clamp(m, 0.0, 1.0) * wisps * uFog);
    #include <colorspace_fragment>
  }
`;

export const iceVert = /* glsl */ `
  varying vec3 vNo;
  varying vec3 vView;
  varying vec3 vObj;
  varying vec3 vCamObj;
  void main() {
    vObj = position;
    vNo = normal;
    // 同じ氷をたくさん並べるとき（アイス缶の列）は、1つずつの置き場所がここに入る。回転はさせない前提
    #ifdef USE_INSTANCING
      mat4 place = instanceMatrix;
    #else
      mat4 place = mat4(1.0);
    #endif
    vec4 mv = modelViewMatrix * place * vec4(position, 1.0);
    vView = mv.xyz;
    vCamObj = (inverse(modelMatrix * place) * vec4(cameraPosition, 1.0)).xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

// 裏面の法線と奥行きを先に描いておく（厚みのある屈折に使う）
export const backVert = /* glsl */ `
  varying vec3 vN;
  varying float vDepth;
  void main() {
    #ifdef USE_INSTANCING
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    #else
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
    #endif
    vN = normalMatrix * normal;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
export const backFrag = /* glsl */ `
  varying vec3 vN;
  varying float vDepth;
  void main() {
    gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, clamp((vDepth - 6.0) / 8.0, 0.01, 1.0));
  }
`;

export const iceFrag = /* glsl */ `
  ${COMMON}
  ${NOISE}
  uniform mat3 normalMatrix;
  uniform mat4 modelViewMatrix;

  uniform float uTime;
  uniform float uRefr;      // 屈折の強さ
  uniform float uBump;      // 表面のうねり
  uniform float uBumpFreq;
  uniform float uFlow;      // 0=固まった氷　1=動いている水（表面のうねりが流れる）
  uniform float uSaw;       // 切り口ののこぎり目
  uniform float uFrost;     // 角の霜
  uniform float uCrack;     // 内部のひび
  uniform float uDrops;     // 表面を伝う水滴
  uniform float uCloud;     // 0=純氷 1=急いで凍らせた氷
  uniform vec3 uHalf;       // 氷の半分の寸法
  uniform vec3 uTint;       // 氷を通った光の色
  uniform vec3 uEnvHigh;
  uniform vec3 uEnvLow;
  uniform vec3 uLight;      // 窓明かりの色
  uniform vec3 uRim;        // 縁に回り込む光（夜は琥珀）
  uniform float uSeed;
  uniform vec2 uCenter;     // 氷の中心（画面上の位置）
  uniform float uLens;      // 0=なし。丸氷は球レンズなので、うしろの景色が上下左右逆さに小さく映る

  varying vec3 vNo;
  varying vec3 vView;
  varying vec3 vObj;
  varying vec3 vCamObj;

  const vec3 LIGHT_DIR = vec3(-0.5, 0.75, 0.45);   // 視点の座標系。左上の手前から

  // 窓のある作業場の映り込み：天井の大きな窓、左の細い縦窓、暗い床、目の高さの明るい帯
  vec3 envColor(vec3 r) {
    float sky = smoothstep(-0.05, 0.85, r.y);
    vec3 e = mix(uEnvLow, uEnvHigh, sky);
    float win = smoothstep(0.45, 0.62, r.y) * smoothstep(-0.15, 0.05, r.x) * (1.0 - smoothstep(0.55, 0.75, r.x));
    float bars = 0.75 + 0.25 * step(0.12, abs(fract(r.x * 3.2) - 0.5));   // 窓の桟
    float strip = (1.0 - smoothstep(0.04, 0.09, abs(r.x + 0.62))) * smoothstep(-0.5, -0.1, r.y) * (1.0 - smoothstep(0.45, 0.7, r.y));
    float band = (1.0 - smoothstep(0.0, 0.07, abs(r.y - 0.06))) * 0.25;
    return e + uLight * (win * bars * 1.6 + strip * 1.1 + band);
  }

  // 面ごとの平面座標と、その接線（のこぎり目と水滴はこの上に描く）
  void faceFrame(vec3 n, vec3 p, out vec2 fuv, out vec3 T, out vec3 B, out float flatness) {
    vec3 an = abs(n);
    if (an.x > an.y && an.x > an.z) { fuv = p.zy; T = vec3(0, 0, 1); B = vec3(0, 1, 0); }
    else if (an.y > an.z) { fuv = p.xz; T = vec3(1, 0, 0); B = vec3(0, 0, 1); }
    else { fuv = p.xy; T = vec3(1, 0, 0); B = vec3(0, 1, 0); }
    flatness = max(an.x, max(an.y, an.z));
  }

  // 水滴：ます目ごとに1粒。列ごとに違う速さで下へ伝う。返すのは盛り上がりの傾き
  vec2 drops(vec2 uv, float t, float vertical) {
    vec2 g = vec2(0.0);
    for (int l = 0; l < 2; l++) {
      float s = 3.2 + float(l) * 3.7;
      vec2 p = uv * s + float(l) * 13.7;
      float col = floor(p.x);
      p.y += vertical * t * (0.03 + 0.09 * hash2(vec2(col, 7.0 + float(l)))) * s;
      vec2 cell = floor(p);
      vec2 f = fract(p) - 0.5;
      float r1 = hash2(cell + 1.3), r2 = hash2(cell + 5.1), r3 = hash2(cell + 9.7);
      float on = step(0.72, r3);
      vec2 c = (vec2(r1, r2) - 0.5) * 0.45;
      float rad = 0.10 + 0.13 * r1;
      vec2 d = (f - c) * vec2(1.0, 0.8);
      float len = length(d);
      float h = 1.0 - smoothstep(rad * 0.25, rad, len);
      g += normalize(d + 1e-5) * h * (1.0 - h) * 4.0 * on;
    }
    return g;
  }

  void main() {
    vec3 V = normalize(-vView);
    vec3 nO = normalize(vNo);

    // ---- 表面：物体の座標系で法線を揺らしてから、視点の座標系へ ----
    vec2 fuv; vec3 T; vec3 B; float flatness;
    faceFrame(nO, vObj, fuv, T, B, flatness);
    float onFace = smoothstep(0.93, 0.995, flatness);

    vec3 q = vObj * uBumpFreq + uSeed + vec3(0.0, -uTime * 0.5, uTime * 0.2) * uFlow;
    vec3 g = vec3(noise(q), noise(q + 19.7), noise(q + 41.3)) - 0.5;
    float bump = uBump + uCloud * 0.35;
    vec3 n = nO + g * bump;

    // のこぎり目：間隔の不ぞろいな細い筋。平らな切り口にだけ出る
    float sawPhase = fuv.y * 95.0 + noise(vec3(fuv * 2.5, uSeed)) * 9.0;
    n += B * cos(sawPhase) * 0.035 * uSaw * onFace;

    // 水滴
    float vertical = 1.0 - step(0.9, abs(nO.y));
    vec2 dg = drops(fuv + uSeed, uTime, vertical) * uDrops * mix(0.35, 1.0, onFace);
    n += (T * dg.x + B * dg.y) * 0.55;

    // 角の霜：欠けて白くなった稜線
    float bevel = 1.0 - flatness;
    float frost = smoothstep(0.03, 0.22, bevel) * (0.35 + 0.65 * noise(vObj * 34.0)) * uFrost;
    n += (vec3(hash(vObj * 91.0), hash(vObj * 57.0), hash(vObj * 73.0)) - 0.5) * frost * 0.9;

    vec3 N = normalize(normalMatrix * normalize(n));
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 3.0);

    // ---- 屈折：まっすぐ進む場合との差だけ、背景を読む位置をずらす ----
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec3 col;
    vec3 R0 = refract(-V, N, 1.0 / 1.31);
    // 入った光が裏面のどこに当たるかを近似して、裏面の法線と奥行きを読む
    vec4 back = texture2D(uBack, uv + vec2(R0.x / aspect, R0.y) * 0.04);
    vec3 Nb = normalize(back.xyz * 2.0 - 1.0 + g * bump);
    float thick = clamp((back.a * 8.0 + 6.0) - (-vView.z), 0.0, 4.0);
    // 全反射かどうかは3色まとめて決める（色ごとに判定が割れると、原色のまだらが出る）
    float tirAll = dot(refract(R0, -Nb, 1.31), refract(R0, -Nb, 1.31)) < 0.001 ? 1.0 : 0.0;
    for (int i = 0; i < 3; i++) {
      float ior = 1.31 + float(i) * 0.004;   // 色ごとにわずかに変えて縁に色のにじみを出す
      vec3 R1 = refract(-V, N, 1.0 / ior);
      vec3 R2 = refract(R1, -Nb, ior);
      // 全反射：裏面で跳ね返った光は、壁の絵に部屋の明暗が混じる。氷の側面に出る明るい帯と暗い帯
      float tir = tirAll;
      if (tirAll > 0.5 || dot(R2, R2) < 0.001) R2 = reflect(R1, -Nb);
      vec2 off = (R1.xy + V.xy) * uRefr * (0.4 + 0.5 * thick) + (R2.xy - R1.xy) * uRefr * 0.6;
      off /= 1.0 + length(off) * 4.0;   // ずれすぎて読めなくなるのを抑える
      off.x /= aspect;
      vec2 base = uLens > 0.0 ? uCenter - (uv - uCenter) * uLens : uv;
      vec2 suv = base + (uLens > 0.0 ? -off : off);
      // 画面の外へ出た光は、壁ではなく部屋を見ている
      float oob = max(max(-suv.x, suv.x - 1.0), max(-suv.y, suv.y - 1.0));
      vec3 s = mix(backdrop(suv), envColor(R2), max(smoothstep(0.0, 0.06, oob), tir * 0.3));
      if (i == 0) col.r = s.r; else if (i == 1) col.g = s.g; else col.b = s.b;
    }

    // 氷を通った厚みの分だけ青みを帯びる
    col *= mix(vec3(1.0), uTint, clamp(0.12 + 0.3 * thick, 0.0, 1.0));
    // 裏面の稜線は、奥に沈んだ暗い線として見える
    float backEdge = 1.0 - abs(Nb.z);
    col = mix(col, uEnvLow, smoothstep(0.55, 1.0, backEdge) * 0.35);

    // ---- 内部 ----
    vec3 rdO = refract(normalize(vObj - vCamObj), nO, 1.0 / 1.31);

    // ひび：氷の中の割れ面。ふだんはごく薄い膜で、光の向きが合った瞬間だけ白く光る
    if (uCrack > 0.01) {
      vec3 Lo = normalize(transpose(mat3(modelViewMatrix)) * LIGHT_DIR);
      vec3 Ho = normalize(Lo - rdO);
      float glow = 0.0;
      for (int i = 0; i < 3; i++) {
        float fi = float(i) + uSeed;
        vec3 cn = normalize(vec3(hash(vec3(fi, 1.0, 2.0)), hash(vec3(fi, 3.0, 4.0)), hash(vec3(fi, 5.0, 6.0))) - 0.5);
        vec3 cc = (vec3(hash(vec3(fi, 7.0, 8.0)), hash(vec3(fi, 9.0, 1.5)), hash(vec3(fi, 2.5, 3.5))) - 0.5) * uHalf * 1.1;
        float denom = dot(cn, rdO);
        float tt = dot(cn, cc - vObj) / (abs(denom) < 1e-4 ? 1e-4 : denom);
        if (tt <= 0.0) continue;
        vec3 p = vObj + rdO * tt;
        vec3 inside = step(abs(p), uHalf * 0.97);
        float inBody = uLens > 0.0 ? step(length(p), uHalf.x * 0.97) : inside.x * inside.y * inside.z;
        float rr = length(p - cc) / (min(uHalf.x, min(uHalf.y, uHalf.z)) * (0.55 + 0.5 * hash(vec3(fi, 4.4, 8.8))));
        float ragged = rr + (fbm(p * 5.0 + fi) - 0.5) * 0.9;
        float mask = (1.0 - smoothstep(0.55, 1.0, ragged)) * inBody;
        // 割れ面のむら
        float ripple = 0.6 + 0.8 * fbm(p * 9.0 + fi);
        float glint = pow(abs(dot(cn, Ho)), 26.0);
        glow += mask * (0.035 + 0.95 * glint * ripple);
      }
      col += (uLight * 0.85 + 0.15) * glow * uCrack;
    }

    // 濁り：氷の中心に残る白い芯を、屈折した視線に沿って数歩たどって積む
    if (uCloud > 0.002) {
      float stepLen = 0.16 * uHalf.y;
      float acc = 0.0;
      vec3 coreR = uHalf * mix(0.18, 1.25, uCloud);
      for (int i = 0; i < 10; i++) {
        vec3 p = vObj + rdO * (float(i) + 0.5) * stepLen;
        vec3 inside = step(abs(p), uHalf);
        float core = 1.0 - smoothstep(0.35, 1.0, length(p / coreR));
        float d = core * (0.35 + 1.1 * fbm(p * 3.2 + uSeed)) * inside.x * inside.y * inside.z;
        acc += d * stepLen;
      }
      float a = 1.0 - exp(-acc * (2.5 + 16.0 * uCloud * uCloud));
      float shade = 0.82 + 0.18 * fbm(vObj * 5.0);
      col = mix(col, vec3(0.93, 0.96, 0.97) * shade, clamp(a, 0.0, 1.0));
    }

    // ---- 表面の光 ----
    vec3 Rf = reflect(-V, N);
    vec3 env = envColor(Rf);
    float k = 0.03 + 0.97 * fres;
    col = mix(col, env, k * 0.85);

    // 濡れた面の鋭いハイライト
    vec3 L = normalize(LIGHT_DIR);
    float spec = pow(max(dot(N, normalize(L + V)), 0.0), 180.0);
    col += uLight * spec * 1.4;

    // 霜は光を散らすので、白くつや消しになる
    col = mix(col, mix(uEnvHigh, vec3(1.0), 0.5) * (0.55 + 0.45 * max(dot(N, L), 0.0)), clamp(frost * 0.75, 0.0, 1.0));

    // 輪郭に沈む細い暗がり
    col *= 1.0 - 0.3 * smoothstep(0.7, 1.0, 1.0 - ndv);

    // 縁の光
    col += uRim * pow(1.0 - ndv, 5.0) * 0.6;
    // 光源の反対側の縁に、氷を抜けてきた光が集まる
    col += uRim * pow(1.0 - ndv, 2.5) * max(0.0, 0.15 - N.y) * 0.55;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
