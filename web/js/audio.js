// Synthesized chiptune SFX and a tiny music sequencer (no audio files).
let ctx = null, master = null, sfxBus = null, musBus = null;
let musicOn = true, soundOn = true;
const last = {};

export function initAudio() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.7;
    sfxBus.connect(master);
    musBus = ctx.createGain();
    musBus.gain.value = 0.32;
    musBus.connect(master);
  } catch {
    ctx = null;
  }
}
export function setSound(on) {
  soundOn = on;
}
export function setMusic(on) {
  musicOn = on;
  if (musBus) musBus.gain.value = on ? 0.32 : 0;
}

function env(g, t, a, d, v) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(f, d, type = "square", v = 0.2, slide = 0, delay = 0, bus = sfxBus) {
  if (!ctx) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
  env(g, t, 0.005, d, v);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + d + 0.05);
}
let noiseBuf = null;
function noise(d, v = 0.2, hp = 800, lp = 8000, delay = 0, bus = sfxBus) {
  if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const a = noiseBuf.getChannelData(0);
    for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), g = ctx.createGain(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
  s.buffer = noiseBuf;
  f1.type = "highpass";
  f1.frequency.value = hp;
  f2.type = "lowpass";
  f2.frequency.value = lp;
  env(g, t, 0.003, d, v);
  s.connect(f1).connect(f2).connect(g).connect(bus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + d + 0.05);
}

const SFX = {
  shoot_water: () => (tone(720, 0.07, "sine", 0.12, 1.6), noise(0.04, 0.05, 2000)),
  shoot_dragon: () => (tone(300, 0.1, "sawtooth", 0.07, 0.6), noise(0.06, 0.06, 600, 3000)),
  shoot_thunder: () => tone(1400, 0.04, "square", 0.05, 0.5),
  shoot_sun: () => (tone(980, 0.06, "triangle", 0.12, 1.3)),
  shoot_bubble: () => tone(500, 0.08, "sine", 0.14, 2.2),
  shoot_ink: () => (noise(0.06, 0.08, 1500, 6000), tone(260, 0.06, "triangle", 0.08, 0.7)),
  hit: () => noise(0.05, 0.12, 1200, 6000),
  crit: () => (noise(0.08, 0.18, 800), tone(1600, 0.08, "square", 0.08, 0.5)),
  kill: () => (tone(520, 0.08, "square", 0.1, 0.5), noise(0.1, 0.1, 400, 3000)),
  hurt: () => (tone(220, 0.18, "sawtooth", 0.18, 0.4), noise(0.12, 0.15, 200, 2000)),
  shieldbreak: () => (tone(900, 0.2, "square", 0.12, 0.3), noise(0.2, 0.15, 2000)),
  coin: () => (tone(1320, 0.05, "square", 0.08), tone(1760, 0.08, "square", 0.08, 1, 0.05)),
  pickup: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.08, "square", 0.09, 1, i * 0.05)),
  heal: () => [659, 880, 1175].forEach((f, i) => tone(f, 0.12, "sine", 0.12, 1, i * 0.07)),
  skill: () => (tone(400, 0.25, "sawtooth", 0.1, 2.5), noise(0.2, 0.08, 1000)),
  ult: () => {
    [262, 330, 392, 523, 659].forEach((f, i) => tone(f, 0.2, "square", 0.1, 1, i * 0.05));
    noise(0.6, 0.14, 300, 5000, 0.1);
  },
  dash: () => noise(0.12, 0.12, 2500, 9000),
  explode: () => (noise(0.45, 0.35, 60, 2500), tone(120, 0.35, "sine", 0.3, 0.3)),
  reaction: () => (tone(880, 0.1, "square", 0.08, 1.5), tone(1320, 0.14, "triangle", 0.1, 1, 0.05)),
  card: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.1, "triangle", 0.12, 1, i * 0.06)),
  click: () => tone(1100, 0.04, "square", 0.07),
  portal: () => (tone(300, 0.6, "sine", 0.15, 3), noise(0.5, 0.06, 2000)),
  clear: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.16, "square", 0.1, 1, i * 0.08)),
  spawn: () => tone(180, 0.3, "sawtooth", 0.06, 2),
  gacha: () => [400, 500, 600, 700, 800, 900].forEach((f, i) => tone(f, 0.06, "square", 0.08, 1, i * 0.05)),
  ssr: () => {
    [523, 659, 784, 1046, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.18, "square", 0.12, 1, i * 0.09));
    noise(0.8, 0.08, 4000, 12000, 0.3);
  },
  boss: () => [110, 104, 98, 92].forEach((f, i) => tone(f, 0.4, "sawtooth", 0.18, 1, i * 0.28)),
  laser: () => tone(200, 0.5, "sawtooth", 0.1, 4),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, "triangle", 0.15, 1, i * 0.18)),
  win: () => [523, 659, 784, 1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.2, "square", 0.1, 1, i * 0.1)),
};
let sfxMute = false;
/** silence game sounds while a muted preview (item demo) simulates a fight */
export const setSfxMute = (v) => (sfxMute = v);
export function sfx(name, minGap = 0.03) {
  if (!ctx || !soundOn || sfxMute || !SFX[name]) return;
  const t = ctx.currentTime;
  if (last[name] && t - last[name] < minGap) return;
  last[name] = t;
  SFX[name]();
}

// ------------------------------------------------------------- music: 16-step loops
const SONGS = {
  lobby: { bpm: 104, bass: [48, 0, 55, 0, 52, 0, 55, 0, 45, 0, 52, 0, 50, 0, 53, 0], arp: [72, 76, 79, 76, 72, 76, 79, 83, 69, 72, 76, 72, 74, 77, 81, 77], hat: 0 },
  battle: { bpm: 140, bass: [45, 45, 57, 45, 43, 43, 55, 43, 41, 41, 53, 41, 43, 43, 55, 47], arp: [69, 72, 76, 72, 67, 71, 74, 71, 65, 69, 72, 69, 67, 71, 74, 79], hat: 1 },
  boss: { bpm: 158, bass: [40, 40, 52, 40, 41, 41, 53, 41, 43, 43, 55, 43, 39, 39, 51, 46], arp: [64, 67, 71, 76, 65, 69, 72, 77, 67, 71, 74, 79, 63, 66, 70, 75], hat: 1 },
};
let song = null, step = 0, nextT = 0, timer = null;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export function playMusic(name) {
  if (song === SONGS[name]) return;
  song = SONGS[name] || null;
  step = 0;
  if (!ctx) return;
  nextT = ctx.currentTime + 0.05;
  if (!timer) timer = setInterval(tick, 50);
}
function tick() {
  if (!ctx || !song) return;
  const spb = 60 / song.bpm / 4;
  while (nextT < ctx.currentTime + 0.15) {
    const d = nextT - ctx.currentTime, i = step % 16;
    if (musicOn) {
      const b = song.bass[i];
      if (b) tone(mtof(b - 12), spb * 1.6, "triangle", 0.22, 1, Math.max(0, d), musBus);
      const a = song.arp[i];
      if (a && (step >> 4) % 2 === 0 ? i % 2 === 0 : true) tone(mtof(a), spb * 0.9, "square", 0.045, 1, Math.max(0, d), musBus);
      if (song.hat && i % 2 === 1) noise(0.03, 0.03, 7000, 14000, Math.max(0, d), musBus);
      if (song.hat && i % 8 === 0) tone(110, 0.12, "sine", 0.25, 0.4, Math.max(0, d), musBus);
    }
    nextT += spb;
    step++;
  }
}
