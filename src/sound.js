// 氷の音。音源ファイルは使わず、ブラウザの中で合成する（Web Audio）。
//   カラン … 氷がグラスに当たる音。倍音のそろわない高い正弦波を数本、すばやく減衰させる
//   ピキッ … 氷にひびが入る音。ごく短い雑音と、下がっていく高い音
//   泡     … 水の中をのぼる小さな泡。上がっていく短い音を、まばらに
//   注ぐ   … 水を注ぐ音。ゆらぐ帯域の雑音
//   抜ける … 氷をくぐり抜けるときの、低い風のような音
// 既定は消音。ヘッダーの「音を出す」を押したときにだけ音の装置を作る（ブラウザは、操作なしに音を出させない）。

const KEY = 'misumi-sound';
let ctx = null;
let master = null;
let noiseBuf = null;
let on = false;
let bubbleTimer = 0;

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(comp).connect(ctx.destination);
  // 雑音のもと（2秒ぶん）
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

const rand = (a, b) => a + Math.random() * (b - a);

function tone(freq, t0, dur, gain, { type = 'sine', to = null } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(t0, dur, gain, { type = 'bandpass', freq = 4000, q = 1, to = null, attack = 0.003 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0, rand(0, 1.5));
  src.stop(t0 + dur + 0.05);
}

// 1回ぶんの「カ」。氷とガラスの澄んだ響き
function hit(t0, strength, pitch) {
  const partials = [[2140, 0.5], [3370, 0.34], [5230, 0.22], [7910, 0.12], [11200, 0.06]];
  for (const [f, a] of partials) tone(f * pitch * rand(0.995, 1.005), t0, rand(0.18, 0.5) * (2140 / f + 0.5), a * 0.16 * strength);
  noise(t0, 0.02, 0.12 * strength, { freq: 6500, q: 0.7 });
}

export const sound = {
  get on() { return on; },
  // 点検用：音量を測るための差し込み口
  tap() { return ctx ? { ctx, master } : null; },

  enable() {
    if (!ensure()) return false;
    ctx.resume?.();
    on = true;
    try { localStorage.setItem(KEY, '1'); } catch { /* 保存できなくても鳴らせる */ }
    this.clink(0.8);
    return true;
  },
  disable() {
    on = false;
    this.bubbling(false);
    try { localStorage.removeItem(KEY); } catch { /* そのまま */ }
  },
  // 前に「音を出す」を選んでいた人。ブラウザの決まりで、次の操作があるまでは鳴らない
  wanted() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } },

  clink(strength = 1) {
    if (!on) return;
    const t = ctx.currentTime + 0.01;
    const p = rand(0.94, 1.06);
    hit(t, strength, p);
    hit(t + rand(0.07, 0.11), strength * 0.6, p * rand(1.04, 1.12));
    if (strength > 0.7) hit(t + rand(0.19, 0.26), strength * 0.3, p * rand(0.9, 0.97));
  },

  crack(strength = 1) {
    if (!on) return;
    const t = ctx.currentTime + 0.01;
    noise(t, 0.035, 0.5 * strength, { freq: rand(3800, 5200), q: 2.5 });
    tone(rand(3800, 4600), t, 0.07, 0.12 * strength, { type: 'triangle', to: rand(1300, 1800) });
    if (Math.random() < 0.7) noise(t + rand(0.04, 0.09), 0.02, 0.25 * strength, { freq: rand(5000, 7000), q: 3 });
  },

  pour(dur = 1.4) {
    if (!on) return;
    const t = ctx.currentTime + 0.01;
    noise(t, dur, 0.4, { freq: 900, q: 0.9, to: 1700, attack: 0.15 });
    noise(t + 0.05, dur * 0.9, 0.18, { freq: 3200, q: 1.2, to: 2200, attack: 0.2 });
    for (let i = 0; i < 7; i++) tone(rand(500, 1100), t + rand(0.1, dur - 0.2), 0.06, 0.035, { to: rand(1200, 1900) });
  },

  whoosh() {
    if (!on) return;
    const t = ctx.currentTime + 0.01;
    noise(t, 1.5, 0.6, { type: 'lowpass', freq: 180, q: 0.8, to: 1400, attack: 0.5 });
    noise(t + 0.55, 1.1, 0.24, { freq: 2600, q: 0.6, to: 700, attack: 0.3 });
  },

  thud() {
    if (!on) return;
    const t = ctx.currentTime + 0.01;
    tone(110, t, 0.35, 0.32, { to: 48 });
    noise(t, 0.08, 0.2, { type: 'lowpass', freq: 400, q: 0.7 });
  },

  bubbling(active) {
    clearTimeout(bubbleTimer);
    bubbleTimer = 0;
    if (!active || !on) return;
    const next = () => {
      if (!on || document.hidden) { bubbleTimer = setTimeout(next, 400); return; }
      const t = ctx.currentTime + 0.01;
      const f = rand(420, 980);
      tone(f, t, rand(0.04, 0.08), rand(0.02, 0.05), { to: f * rand(1.5, 2.1) });
      bubbleTimer = setTimeout(next, rand(90, 320));
    };
    next();
  },
};
