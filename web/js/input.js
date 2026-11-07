// Keyboard (WASD + J/K/L + Space) and touch (floating joystick + aim-drag buttons, Brawl Stars style).
export const input = {
  mx: 0, my: 0, // move vector
  atk: false, // attack held
  aim: null, // manual aim angle (touch drag) or null = auto lock
  skillAim: null, ultAim: null, // aim preview while dragging those buttons
  pressed: { skill: false, ult: false, dash: false, pause: false, mount: false },
  castAim: { skill: null, ult: null },
  touch: false,
  enabled: true,
};
const keys = new Set();

export function consume(name) {
  const v = input.pressed[name];
  input.pressed[name] = false;
  return v;
}

function updKeys() {
  let x = 0, y = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
  if (!joy.active) {
    const l = Math.hypot(x, y) || 1;
    input.mx = x / l;
    input.my = y / l;
  }
  if (!btnState.atk) input.atk = keys.has("KeyJ");
}

export function initInput(root) {
  addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (!keys.has(e.code)) {
      const w = { KeyJ: ".s-atk", KeyK: ".s-skill", KeyL: ".s-ult", Space: ".s-dash", ShiftLeft: ".s-dash" }[e.code];
      if (w) {
        const n = document.querySelector(w);
        if (n) n.classList.add("down"), ripple(n);
      }
      if (e.code === "KeyK") (input.pressed.skill = true), (input.castAim.skill = null);
      if (e.code === "KeyL") (input.pressed.ult = true), (input.castAim.ult = null);
      if (e.code === "KeyR" && document.querySelector('.pet-ride-btn')) input.pressed.mount = true;
      if (e.code === "Space" || e.code === "ShiftLeft") input.pressed.dash = true;
      if (e.code === "Escape" || e.code === "KeyP") input.pressed.pause = true;
    }
    keys.add(e.code);
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    input.touch = false;
    document.body.classList.remove("touchmode");
    updKeys();
  });
  addEventListener("keyup", (e) => {
    keys.delete(e.code);
    const w = { KeyJ: ".s-atk", KeyK: ".s-skill", KeyL: ".s-ult", Space: ".s-dash", ShiftLeft: ".s-dash" }[e.code];
    if (w) document.querySelector(w)?.classList.remove("down");
    updKeys();
  });
  addEventListener("blur", () => {
    keys.clear();
    updKeys();
  });
  buildTouch(root);
  if (matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 1) markTouch();
  addEventListener("touchstart", markTouch, { passive: true });
}

// ---------------------------------------------------------------- touch
const joy = { active: false, id: null, ox: 0, oy: 0 };
const btnState = {};
let joyEl, knobEl;

function buildTouch(root) {
  const pad = document.createElement("div");
  pad.className = "touchpad";
  pad.innerHTML = `
    <div class="joyzone"></div>
    <div class="joy"><div class="joyknob"></div></div>
    <div class="tbtn b-atk" data-b="atk"><i class="bface"></i><img class="ico" alt=""><span class="lb">攻击</span></div>
    <div class="tbtn b-skill" data-b="skill"><i class="ring"></i><i class="bface"></i><img class="ico" alt=""><i class="cd"></i><b class="cdt"></b><span class="lb">技能</span></div>
    <div class="tbtn b-ult" data-b="ult"><i class="ring"></i><i class="bface"></i><img class="ico" alt=""><i class="cd"></i><b class="cdt"></b><span class="lb">大招</span></div>
    <div class="tbtn b-dash" data-b="dash"><i class="bface"></i><img class="ico" alt=""><i class="cd"></i><b class="cdt"></b><span class="lb">闪避</span></div>
    <div class="tbtn b-pause" data-b="pause"><span>Ⅱ</span></div>`;
  root.appendChild(pad);
  joyEl = pad.querySelector(".joy");
  knobEl = pad.querySelector(".joyknob");
  const zone = pad.querySelector(".joyzone");
  const setJoy = (x, y) => {
    const dx = x - joy.ox, dy = y - joy.oy, R = 46, l = Math.hypot(dx, dy);
    const k = l > R ? R / l : 1;
    knobEl.style.transform = `translate(${dx * k}px,${dy * k}px)`;
    const m = Math.min(1, l / R);
    input.mx = l > 6 ? (dx / l) * m : 0;
    input.my = l > 6 ? (dy / l) * m : 0;
    if (m > 0.35) (input.mx /= m), (input.my /= m); // full speed past a small deadzone
  };
  zone.addEventListener("touchstart", (e) => {
    e.preventDefault();
    markTouch();
    const t = e.changedTouches[0];
    joy.active = true;
    joy.id = t.identifier;
    joy.ox = t.clientX;
    joy.oy = t.clientY;
    joyEl.style.left = t.clientX + "px";
    joyEl.style.top = t.clientY + "px";
    joyEl.classList.add("on");
    setJoy(t.clientX, t.clientY);
  }, { passive: false });
  const moveJ = (e) => {
    for (const t of e.changedTouches) if (t.identifier === joy.id) setJoy(t.clientX, t.clientY);
  };
  const endJ = (e) => {
    for (const t of e.changedTouches) if (t.identifier === joy.id) {
      joy.active = false;
      joy.id = null;
      input.mx = input.my = 0;
      knobEl.style.transform = "";
      joyEl.classList.remove("on");
    }
  };
  zone.addEventListener("touchmove", moveJ, { passive: false });
  zone.addEventListener("touchend", endJ);
  zone.addEventListener("touchcancel", endJ);

  for (const b of pad.querySelectorAll(".tbtn")) {
    const name = b.dataset.b;
    let id = null, ox = 0, oy = 0, aimed = false, ang = null;
    b.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      markTouch();
      const t = e.changedTouches[0];
      id = t.identifier;
      ox = t.clientX;
      oy = t.clientY;
      aimed = false;
      ang = null;
      b.classList.add("down");
      ripple(b);
      if (name === "atk") (btnState.atk = true), (input.atk = true), (input.aim = null);
      if (name === "dash") input.pressed.dash = true;
      if (name === "pause") input.pressed.pause = true;
    }, { passive: false });
    b.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === id) {
        const dx = t.clientX - ox, dy = t.clientY - oy;
        if (Math.hypot(dx, dy) > 16) {
          aimed = true;
          ang = Math.atan2(dy, dx);
          if (name === "atk") input.aim = ang;
          if (name === "skill") input.skillAim = ang;
          if (name === "ult") input.ultAim = ang;
        }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === id) {
        id = null;
        b.classList.remove("down");
        if (name === "atk") (btnState.atk = false), (input.atk = false), (input.aim = null);
        if (name === "skill") (input.pressed.skill = true), (input.castAim.skill = aimed ? ang : null), (input.skillAim = null);
        if (name === "ult") (input.pressed.ult = true), (input.castAim.ult = aimed ? ang : null), (input.ultAim = null);
      }
    };
    b.addEventListener("touchend", end);
    b.addEventListener("touchcancel", end);
  }
}
/** a quick expanding ring on press */
export function ripple(b) {
  if (!b) return;
  const r = document.createElement("i");
  r.className = "ripple";
  b.appendChild(r);
  setTimeout(() => r.remove(), 450);
}
function markTouch() {
  input.touch = true;
  document.body.classList.add("touchmode");
}
export function setCooldown(name, frac, ready, label) {
  const b = document.querySelector(".b-" + name);
  if (!b) return;
  const cd = b.querySelector(".cd");
  if (cd) cd.style.setProperty("--p", Math.round(frac * 100) + "%");
  b.classList.toggle("ready", !!ready);
  if (label != null) b.querySelector("span").textContent = label;
}
