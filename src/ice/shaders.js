// 氷の舞台のシェーダー。
// 背景（地色＋特大の文字）は画面にぴったり貼った1枚の板で、氷はその同じ絵を
// 屈折させた位置から読み直す。物理ベースの透過マテリアルより軽く、スマホでも回る。

const COMMON = /* glsl */ `
  uniform sampler2D uText;   // 文字のマスク（白=文字）
  uniform sampler2D uTextB;  // 切り替え先の文字
  uniform float uTextMix;    // 0=uText 1=uTextB
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
`;

export const backdropVert = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }
`;

export const backdropFrag = /* glsl */ `
  ${COMMON}
  void main() {
    gl_FragColor = vec4(backdrop(gl_FragCoord.xy / uRes), 1.0);
    #include <colorspace_fragment>
  }
`;

export const iceVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vNo;
  varying vec3 vView;
  varying vec3 vObj;
  void main() {
    vObj = position;
    vNo = normal;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = mv.xyz;
    vN = normalMatrix * normal;
    gl_Position = projectionMatrix * mv;
  }
`;

// 裏面の法線と奥行きを先に描いておく（厚みのある屈折に使う）
export const backVert = /* glsl */ `
  varying vec3 vN;
  varying float vDepth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalMatrix * normal;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
export const backFrag = /* glsl */ `
  varying vec3 vN;
  varying float vDepth;
  void main() {
    gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, clamp((vDepth - 6.0) / 8.0, 0.0, 1.0));
  }
`;

export const iceFrag = /* glsl */ `
  ${COMMON}
  uniform sampler2D uBack;
  uniform float uRefr;      // 屈折の強さ
  uniform float uBump;      // 表面のゆらぎ
  uniform float uBumpFreq;
  uniform float uCloud;     // 0=純氷 1=急いで凍らせた氷
  uniform vec3 uCamObj;     // オブジェクト空間でのカメラ位置（濁りの計算用）
  uniform vec3 uHalf;       // 氷の半分の寸法
  uniform vec3 uTint;       // 氷を通った光の色
  uniform vec3 uEnvHigh;
  uniform vec3 uEnvLow;
  uniform vec3 uLight;      // 窓明かりの色
  uniform vec3 uRim;        // 縁に回り込む光（夜は琥珀）
  uniform float uSeed;
  uniform vec2 uCenter;     // 氷の中心（画面上の位置）
  uniform float uLens;      // 0=なし。丸氷は球レンズなので、うしろの景色が上下左右逆さに小さく映る

  varying vec3 vN;
  varying vec3 vNo;
  varying vec3 vView;
  varying vec3 vObj;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
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

  vec3 envColor(vec3 r) {
    float sky = smoothstep(-0.05, 0.85, r.y);
    vec3 e = mix(uEnvLow, uEnvHigh, sky);
    // 天井の大きな窓と、左の細い縦の明かり
    float win = smoothstep(0.45, 0.7, r.y) * smoothstep(-0.1, 0.15, r.x) * (1.0 - smoothstep(0.55, 0.8, r.x));
    float strip = (1.0 - smoothstep(0.05, 0.11, abs(r.x + 0.6))) * smoothstep(-0.6, 0.0, r.y) * (1.0 - smoothstep(0.5, 0.8, r.y));
    return e + uLight * (win * 1.4 + strip * 0.9);
  }

  void main() {
    vec3 V = normalize(-vView);
    vec3 N = normalize(vN);

    // 表面のわずかなゆらぎ。濁った氷ほど荒れる
    vec3 q = vObj * uBumpFreq + uSeed;
    vec3 g = vec3(noise(q), noise(q + 19.7), noise(q + 41.3)) - 0.5;
    float bump = uBump + uCloud * 0.35;
    N = normalize(N + g * bump);

    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 3.0);

    // 屈折：まっすぐ進む場合との差だけ、背景を読む位置をずらす
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec3 col;
    vec3 R0 = refract(-V, N, 1.0 / 1.31);
    // 入った光が裏面のどこに当たるかを近似して、裏面の法線と奥行きを読む
    vec4 back = texture2D(uBack, uv + vec2(R0.x / aspect, R0.y) * 0.04);
    vec3 Nb = normalize(back.xyz * 2.0 - 1.0 + g * bump);
    float thick = clamp((back.a * 8.0 + 6.0) - (-vView.z), 0.0, 4.0);
    for (int i = 0; i < 3; i++) {
      float ior = 1.31 + float(i) * 0.007;   // 色ごとにわずかに変えて縁に色のにじみを出す
      vec3 R1 = refract(-V, N, 1.0 / ior);
      vec3 R2 = refract(R1, -Nb, ior);
      if (dot(R2, R2) < 0.001) R2 = reflect(R1, -Nb);   // 全反射
      vec2 off = (R1.xy + V.xy) * uRefr * (0.4 + 0.5 * thick) + (R2.xy - R1.xy) * uRefr * 0.6;
      off /= 1.0 + length(off) * 4.0;   // ずれすぎて読めなくなるのを抑える
      off.x /= aspect;
      vec2 base = uLens > 0.0 ? uCenter - (uv - uCenter) * uLens : uv;
      vec3 s = backdrop(base + (uLens > 0.0 ? -off : off));
      if (i == 0) col.r = s.r; else if (i == 1) col.g = s.g; else col.b = s.b;
    }

    // 氷を通った厚みの分だけ青みを帯びる
    col *= mix(vec3(1.0), uTint, clamp(0.12 + 0.3 * thick, 0.0, 1.0));
    // 裏面の稜線は、奥に沈んだ暗い線として見える
    float backEdge = 1.0 - abs(Nb.z);
    col = mix(col, uEnvLow, smoothstep(0.55, 1.0, backEdge) * 0.35);

    // 濁り：氷の中心に残る白い芯を、屈折した視線に沿って数歩たどって積む
    if (uCloud > 0.002) {
      vec3 rd = normalize(vObj - uCamObj);
      rd = refract(rd, normalize(vNo), 1.0 / 1.31);
      float stepLen = 0.16 * uHalf.y;
      float acc = 0.0;
      vec3 coreR = uHalf * mix(0.18, 1.25, uCloud);
      for (int i = 0; i < 10; i++) {
        vec3 p = vObj + rd * (float(i) + 0.5) * stepLen;
        vec3 inside = step(abs(p), uHalf);
        float core = 1.0 - smoothstep(0.35, 1.0, length(p / coreR));
        float d = core * (0.35 + 1.1 * fbm(p * 3.2 + uSeed)) * inside.x * inside.y * inside.z;
        acc += d * stepLen;
      }
      float a = 1.0 - exp(-acc * (2.5 + 16.0 * uCloud * uCloud));
      float shade = 0.82 + 0.18 * fbm(vObj * 5.0);
      col = mix(col, vec3(0.93, 0.96, 0.97) * shade, clamp(a, 0.0, 1.0));
    }

    // 映り込み
    vec3 Rf = reflect(-V, N);
    vec3 env = envColor(Rf);
    float k = 0.03 + 0.97 * fres;
    col = mix(col, env, k * 0.85);

    // 輪郭に沈む細い暗がり
    col *= 1.0 - 0.3 * smoothstep(0.7, 1.0, 1.0 - ndv);

    // 縁の光と霜
    col += uRim * pow(1.0 - ndv, 5.0) * 0.6;
    // 光源の反対側の縁に、氷を抜けてきた光が集まる
    col += uRim * pow(1.0 - ndv, 2.5) * max(0.0, 0.15 - N.y) * 0.55;
    float frost = smoothstep(0.55, 1.0, fres) * noise(vObj * 22.0) * 0.25;
    col = mix(col, vec3(1.0), frost);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
