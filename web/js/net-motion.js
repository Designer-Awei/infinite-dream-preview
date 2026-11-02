// Timestamped snapshot interpolation. Inspired by Gaffer On Games' snapshot interpolation.
// Keep presentation behind the newest frame; extrapolate at most 60 ms through a short gap.
export class MotionBuffer {
  constructor(delay = 0.08) { this.delay = delay; this.frames = []; this.offsets = []; this.cursor = null; }
  push(t, points, now = performance.now() / 1000) {
    if (!Number.isFinite(t) || (this.frames.length && t <= this.frames.at(-1).t)) return;
    this.frames.push({ t, points });
    if (this.frames.length > 32) this.frames.shift();
    this.offsets.push({ at: now, value: t - now });
    this.offsets = this.offsets.filter(x => now - x.at < 5);
  }
  sample(now = performance.now() / 1000) {
    if (!this.frames.length) return new Map();
    const offset = Math.max(...this.offsets.map(x => x.value));
    const target = Math.min(now + offset - this.delay, this.frames.at(-1).t + 0.06);
    // A changing delay estimate must never move presentation time backwards.
    const elapsed = Math.max(0, now - (this.lastSample ?? now));
    this.lastSample = now;
    if (this.cursor == null) this.cursor = target;
    else {
      const next = this.cursor + elapsed;
      const correction = Math.max(-elapsed * 0.1, Math.min(elapsed * 0.1, (target - next) * 0.1));
      this.cursor = Math.min(this.frames.at(-1).t + 0.06, Math.max(this.cursor, next + correction));
    }
    const frames = this.frames;
    let i = frames.findIndex(f => f.t >= this.cursor);
    if (i === 0 || frames.length === 1) return frames[0].points;
    if (i < 0) i = frames.length - 1;
    const a = frames[i - 1], b = frames[i];
    const dt = b.t - a.t;
    const k = Math.max(0, Math.min(1 + 0.06 / dt, (this.cursor - a.t) / dt));
    const out = new Map();
    for (const [id, p] of b.points) {
      const prev = a.points.get(id);
      // Respawns, teleports and discontinuities should not sweep across the map.
      if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 120) { out.set(id, p); continue; }
      const turn = Math.atan2(Math.sin((p.face || 0) - (prev.face || 0)), Math.cos((p.face || 0) - (prev.face || 0)));
      out.set(id, { x: prev.x + (p.x - prev.x) * k, y: prev.y + (p.y - prev.y) * k, face: (prev.face || 0) + turn * Math.min(k, 1) });
    }
    return out;
  }
}
