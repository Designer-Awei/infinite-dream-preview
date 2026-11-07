/* Body frames come from PixelLab. All ranged/area effects are drawn here. */
(() => {
  const canvas = document.querySelector('#scene'), ctx = canvas.getContext('2d');
  const data = window.PET_DATA, atlas = new Image();
  const families = ['dragon', 'fox', 'phoenix'];
  const names = ['赤焰火龙', '霆尾灵狐', '霜羽冰凰'];
  const skills = ['长距离龙息', '连锁雷击', '范围暴风雪'];
  const colors = ['#ff9860', '#ffe69c', '#8fe6ff'];
  const state = { stage: 3, effects: true, range: 210, radius: 72, manual: false, idleOnly: false };
  let started = performance.now();
  const noise = (i, salt = 0) => { const n = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return n - Math.floor(n); };
  function pixel(x, y, size, color, alpha = 1) {
    ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, size, size); ctx.globalAlpha = 1;
  }
  function text(s, x, y, size, color = '#eee8ff') { ctx.font = `${size}px Cubic,monospace`; ctx.fillStyle = color; ctx.fillText(s, x, y); }
  function phaseAt(time) {
    const t = ((time % 6.75) + 6.75) % 6.75;
    const idle = state.idleOnly || t < 2 || t >= 4.75;
    const active = !idle && t >= 2.4 && t < 4.35;
    const power = idle ? 0 : Math.max(0, Math.min(1, (t - 2.4) / .18, (4.35 - t) / .25));
    const held = [3, 4, 5, 4];
    const frame = idle ? Math.floor((state.idleOnly ? time : t < 2 ? t : t - 4.75) * 6) : t < 2.4 ? Math.floor((t - 2) * 7.5) : active ? held[Math.floor((t - 2.4) * 6) % held.length] : 6 + Math.floor((t - 4.35) * 7.5);
    return { t, active, power, frame, idle, label: idle ? '待机 · 呼吸 / 翼动 / 尾摆' : t < 2.4 ? '蓄能' : active ? '释放' : '收势' };
  }
  function fire(x, y, time, power) {
    if (!power) return;
    const reach = state.range * power;
    // Many small moving tongues produce a continuous widening pixel flame.
    for (const [scale, color] of [[1, '#a62838'], [.75, '#f44a28'], [.48, '#ff9d36'], [.22, '#fff0a0']]) {
      ctx.beginPath(); ctx.moveTo(x, y - 3);
      for (let i = 0; i <= 30; i++) { const d = i / 30, wobble = Math.sin(d * 20 - time * 24) * (3 + d * 5); ctx.lineTo(x + d * reach, y - (4 + d * 28) * scale + wobble * scale); }
      for (let i = 30; i >= 0; i--) { const d = i / 30, wobble = Math.sin(d * 22 - time * 25 + 2) * (3 + d * 5); ctx.lineTo(x + d * reach, y + (4 + d * 28) * scale + wobble * scale); }
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    }
    for (let i = 0; i < 40; i++) { const d = (noise(i) + time * (1.1 + noise(i, 2))) % 1; pixel(x + d * reach, y + (noise(i, 5) - .5) * d * 75, 2 + (i % 2) * 2, i % 2 ? '#ffd670' : '#fa6838', (1 - d) * power); }
  }
  function lightning(x, y, time, power) {
    if (!power) return;
    const tick = Math.floor(time * 12), points = [[x, y], [224, 176], [302, 198], [355, 153]];
    ctx.lineJoin = 'miter';
    for (let branch = 0; branch < points.length - 1; branch++) {
      const a = points[branch], b = points[branch + 1], path = [a];
      for (let i = 1; i < 9; i++) { const u = i / 9; path.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u + (noise(i + tick * 9, branch) - .5) * 26]); }
      path.push(b);
      for (const [width, color] of [[8, '#a26524'], [4, '#ffd34b'], [2, '#fff9c9']]) { ctx.beginPath(); path.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.lineWidth = width; ctx.strokeStyle = color; ctx.globalAlpha = power; ctx.stroke(); }
      ctx.globalAlpha = 1;
      for (let j = 0; j < 5; j++) { const angle = noise(j, tick) * Math.PI * 2, d = 8 + noise(j, 7) * 16; pixel(b[0] + Math.cos(angle) * d, b[1] + Math.sin(angle) * d, 3, '#ffed91', power); }
    }
  }
  function blizzard(time, power) {
    if (!power) return;
    const x = 285, y = 197, r = state.radius;
    ctx.fillStyle = '#397495'; ctx.globalAlpha = .3 * power; ctx.beginPath(); ctx.ellipse(x, y + 24, r + 6, r * .47, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    for (let i = 0; i < 90; i++) {
      const turn = time * (1 + noise(i, 1)) * 2 + noise(i, 2) * Math.PI * 2;
      const distance = Math.sqrt(noise(i, 3)) * r;
      const px = x + Math.cos(turn) * distance, py = y + Math.sin(turn) * distance * .44 - ((time * 60 + noise(i, 4) * 70) % 85) + 24;
      pixel(px, py, i % 5 ? 2 : 4, i % 3 ? '#b0f2ff' : '#ffffff', power * (.4 + noise(i, 5) * .6));
      if (i % 5 === 0) pixel(px + 2, py - 2, 2, '#6fcbef', power);
    }
    for (let i = 0; i < 5; i++) {
      const a = time * 2.5 + i * 1.25; ctx.beginPath(); ctx.ellipse(x, y + 3 - i * 11, r * (.5 + i * .09), r * .18, 0, a, a + 1.6); ctx.lineWidth = 2; ctx.strokeStyle = '#b1eeff'; ctx.globalAlpha = power * .5; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawAt(time) {
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, 1200, 370);
    const phase = phaseAt(time);
    families.forEach((family, index) => {
      ctx.save(); ctx.translate(index * 400, 0);
      ctx.beginPath(); ctx.rect(0, 0, 400, 370); ctx.clip();
      ctx.fillStyle = index % 2 ? '#201933' : '#1a152b'; ctx.fillRect(0, 0, 400, 370);
      text(names[index], 22, 36, 23, colors[index]); text(skills[index], 22, 65, 16, '#b4a9c9');
      // Ground remains intentionally quiet so silhouettes and local energy read clearly.
      ctx.fillStyle = '#342544'; ctx.beginPath(); ctx.ellipse(108, 257, 75, 17, 0, 0, Math.PI * 2); ctx.fill();
      const id = `${family}-${state.stage}`, actor = data.actors[id], clip = data.clips[id][phase.idle ? 'idle_e' : 'cast_e'];
      const frame = phase.idle ? phase.frame % (clip.length - 1) : Math.min(phase.frame, clip.length - 1), [sx, sy] = clip[frame];
      const scale = 2, left = 12, top = 82, mouthX = left + actor.mouth[0] * scale, mouthY = top + actor.mouth[1] * scale;
      if (state.effects && index === 2) blizzard(time, phase.power);
      ctx.drawImage(atlas, sx, sy, 96, 96, left, top, 192, 192);
      if (state.effects && index === 0) fire(mouthX, mouthY, time, phase.power);
      if (state.effects && index === 1) lightning(mouthX, mouthY, time, phase.power);
      text(`阶段 ${state.stage}  /  ${phase.label}`, 22, 312, 16, '#dacbe9');
      text(state.effects ? '身体动作 + 代码技能' : '仅身体动作与贴身蓄能', 22, 342, 14, '#9c91b3');
      ctx.restore();
    });
  }
  function setStage(stage) { state.stage = Number(stage); document.querySelectorAll('[data-stage]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.stage) === state.stage))); }
  document.querySelectorAll('[data-stage]').forEach(b => b.onclick = () => { setStage(b.dataset.stage); started = performance.now(); });
  document.querySelector('#effects').onclick = event => { state.effects = !state.effects; event.target.textContent = `代码技能：${state.effects ? '开' : '关'}`; event.target.setAttribute('aria-pressed', String(state.effects)); };
  document.querySelector('#replay').onclick = () => { started = performance.now(); };
  document.querySelector('#idle').onclick = event => { state.idleOnly = !state.idleOnly; event.target.textContent = state.idleOnly ? '返回完整施法' : '只看待机细节'; event.target.setAttribute('aria-pressed', String(state.idleOnly)); started = performance.now(); };
  for (const key of ['range', 'radius']) document.querySelector(`#${key}`).oninput = event => { state[key] = Number(event.target.value); };
  const ready = new Promise((resolve, reject) => { atlas.onload = async () => { await document.fonts.load('16px Cubic'); drawAt(0); resolve(true); }; atlas.onerror = reject; });
  atlas.src = 'pets.png';
  window.petPreview = { ready, state, drawAt, setStage, phaseAt };
  const loop = now => { if (atlas.complete && !state.manual) drawAt((now - started) / 1000); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
})();
