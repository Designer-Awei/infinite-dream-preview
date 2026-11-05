// Online play. The host runs the simulation; clients send input and render snapshots.
// Transports: PeerJS WebRTC (static hosting, no account), BroadcastChannel (?local, two tabs), claude room (artifact).
import { ENEMIES, CHARS, ELEM, GACHA, LOADOUT_SLOTS } from "./data.js";
import { load, makeKit } from "./save.js";
import * as UI from "./ui.js";
import { sfx } from "./audio.js";
import { tileAt } from "./map.js";
import { fireAttack } from "./skills.js";
import { angTo } from "./util.js";

const PREFIX = "aigirls-dungeon-v1-";
const ALPH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ICE = [
  { urls: "stun:stun.miwifi.com:3478" },
  { urls: "stun:stun.qq.com:3478" },
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

// ---------------------------------------------------------------- transports
class LocalT {
  constructor(code, isHost) {
    this.id = isHost ? "host" : "c" + Math.random().toString(36).slice(2, 8);
    this.bc = new BroadcastChannel(PREFIX + code);
    const lag = +(new URLSearchParams(location.search).get("lag") || 0); // test hook: simulated one-way latency (ms)
    this.bc.onmessage = (e) => {
      if (lag) return void setTimeout(() => this.bc.onmessage2(e), lag * (0.8 + Math.random() * 0.4));
      this.bc.onmessage2(e);
    };
    this.bc.onmessage2 = (e) => {
      const m = e.data;
      if (m.to && m.to !== this.id) return;
      if (m.from === this.id) return;
      this.onmsg && this.onmsg(m.from, m.data);
    };
  }
  async open() {
    if (this.id !== "host") this.onopen && this.onopen();
  }
  send(to, data) {
    this.bc.postMessage({ from: this.id, to, data });
  }
  close() {
    this.bc.close();
  }
}
let peerLib = null;
const PEER_CDNS = [
  "vendor/peerjs.min.js", // bundled copy (APK / Pages build)
  "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js",
  "https://fastly.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js",
  "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js",
];
function loadPeer() {
  if (window.Peer) return Promise.resolve();
  if (peerLib) return peerLib;
  peerLib = new Promise((res, rej) => {
    let i = 0;
    const next = () => {
      if (i >= PEER_CDNS.length) {
        peerLib = null;
        return rej(new Error("无法加载联机组件"));
      }
      const s = document.createElement("script");
      s.src = PEER_CDNS[i++];
      s.onload = res;
      s.onerror = next;
      document.head.appendChild(s);
    };
    next();
  });
  return peerLib;
}
// optional self-hosted PeerServer: ?peer=host[:port][/path]
function peerServerOpts() {
  const q = new URLSearchParams(location.search).get("peer");
  if (!q) return {};
  const m = q.match(/^([^:/]+)(?::(\d+))?(\/.*)?$/);
  if (!m) return {};
  return { host: m[1], port: m[2] ? +m[2] : 443, path: m[3] || "/", secure: true };
}
class PeerT {
  constructor(code, isHost) {
    this.code = code;
    this.isHost = isHost;
    this.conns = new Map();
  }
  async open() {
    await loadPeer();
    return new Promise((res, rej) => {
      const opts = { config: { iceServers: ICE }, debug: 0, ...peerServerOpts() };
      this.peer = this.isHost ? new window.Peer(PREFIX + this.code, opts) : new window.Peer(opts);
      const to = setTimeout(() => rej(new Error("连接信令服务器超时")), 12000);
      this.peer.on("error", (e) => {
        clearTimeout(to);
        if (e.type === "peer-unavailable") this.onerror && this.onerror("房间不存在或房主已离开");
        else if (e.type === "unavailable-id") rej(new Error("房间码冲突，请重试"));
        else this.onerror && this.onerror(e.message || String(e));
        rej(e);
      });
      this.peer.on("open", () => {
        clearTimeout(to);
        if (this.isHost) {
          this.peer.on("connection", (c) => this.wire(c));
          res();
        } else {
          const c = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: "json" });
          this.wire(c, () => {
            res();
            this.onopen && this.onopen();
          });
        }
      });
    });
  }
  wire(c, onOpen) {
    c.on("open", () => {
      this.conns.set(c.peer, c);
      onOpen && onOpen();
    });
    c.on("data", (d) => this.onmsg && this.onmsg(this.isHost ? c.peer : "host", d));
    c.on("close", () => {
      this.conns.delete(c.peer);
      this.onleave && this.onleave(this.isHost ? c.peer : "host");
    });
  }
  send(to, data) {
    if (to) {
      const c = this.isHost ? this.conns.get(to) : [...this.conns.values()][0];
      if (c && c.open) c.send(data);
    } else for (const c of this.conns.values()) if (c.open) c.send(data);
  }
  close() {
    try {
      this.peer && this.peer.destroy();
    } catch {}
  }
}
class RoomT {
  constructor(code, isHost) {
    this.code = code;
    this.id = isHost ? "host" : "c" + Math.random().toString(36).slice(2, 8);
  }
  async open() {
    const room = await window.claude.use("room");
    if (!room) throw new Error("当前页面不支持联机");
    this.r = room.join(PREFIX + this.code);
    this.r.on("m", (m) => {
      if (!m || (m.to && m.to !== this.id) || m.from === this.id) return;
      this.onmsg && this.onmsg(m.from, m.data);
    });
    if (this.id !== "host") this.onopen && this.onopen();
  }
  send(to, data) {
    try {
      this.r.emit("m", { from: this.id, to, data });
    } catch {}
  }
  close() {
    try {
      this.r.leave();
    } catch {}
  }
}
function makeTransport(code, isHost) {
  if (/[?&]local/.test(location.search)) return new LocalT(code, isHost);
  if (window.claude && window.claude.use && !/github\.io|localhost|127\.0\.0\.1/.test(location.hostname)) return new RoomT(code, isHost);
  return new PeerT(code, isHost);
}

// ---------------------------------------------------------------- Net
export class Net {
  constructor(app) {
    this.app = app;
    this.members = []; // host: [{peer, id, name, cid}]
    this.snapT = 0;
    this.inT = 0;
    this.edges = { sk: false, ul: false, da: false };
    this.started = false;
  }
  // ---------------- host
  async host(pvp, opt = {}) {
    this.isHost = true;
    this.pvp = pvp;
    this.opt = pvp ? { pvpMode: "brawl", map: "grass", ...opt } : { map: "grass", endless: false, ...opt };
    const m = load();
    this.code = Array.from({ length: 4 }, () => ALPH[(Math.random() * ALPH.length) | 0]).join("");
    this.members = [{ peer: null, id: 1, name: m.name, cid: m.sel, host: true, kit: makeKit(m.sel) }];
    this.status = "正在创建房间…";
    this.showRoom();
    this.t = makeTransport(this.code, true);
    this.t.onmsg = (from, d) => this.onHostMsg(from, d);
    this.t.onleave = (from) => this.dropMember(from);
    this.t.onerror = (e) => UI.toast("联机错误：" + e);
    try {
      await this.t.open();
      this.status = "房间已创建，把房间码告诉朋友吧！";
    } catch (e) {
      this.status = "创建失败：" + (e.message || e) + "（可刷新重试）";
    }
    this.showRoom();
  }
  showRoom() {
    if (this.started) return;
    const me = this.isHost ? this.members[0] : this.members.find((x) => x.id === this.myId) || { cid: load().sel };
    UI.showRoom({ code: this.code, pvp: this.pvp, opt: this.opt || {}, players: this.members, isHost: this.isHost, myCid: me.cid, myId: me.id, status: this.status });
  }
  lobbyMsg() {
    return { t: "lobby", pvp: this.pvp, opt: this.opt, code: this.code, players: this.members.map(({ id, name, cid, host }) => ({ id, name, cid, host })) };
  }
  onHostMsg(from, d) {
    if (!d || !d.t) return;
    if (d.t === "hello") {
      if (this.started || this.members.length >= 4) return this.t.send(from, { t: "full", started: this.started });
      let id = 2;
      while (this.members.some((x) => x.id === id)) id++;
      this.members.push({ peer: from, id, name: String(d.name || "玩家").slice(0, 8), cid: CHARS[d.cid] ? d.cid : "deepseek", kit: cleanKit(d.kit) });
      this.t.send(from, { t: "welcome", id });
      this.t.send(null, this.lobbyMsg());
      sfx("pickup");
      this.showRoom();
      return;
    }
    const mem = this.members.find((x) => x.peer === from);
    if (!mem) return;
    if (d.t === "cid" && !this.started && CHARS[d.cid]) {
      mem.cid = d.cid;
      if (d.kit) mem.kit = cleanKit(d.kit);
      this.t.send(null, this.lobbyMsg());
      this.showRoom();
    }
    const g = this.app.game;
    if (!g) return;
    const p = g.player(mem.id);
    if (!p) return;
    if (d.t === "in") {
      const i = p.input;
      i.mx = +d.mx || 0;
      i.my = +d.my || 0;
      i.atk = !!d.atk;
      i.aim = d.aim == null ? null : +d.aim;
      if (d.sk) (i.skill = true), (i.castAim = { ...i.castAim, skill: d.cs });
      if (d.ul) (i.ult = true), (i.castAim = { ...i.castAim, ult: d.cu });
      if (d.da) i.dash = true;
      // client-authoritative movement (validated loosely)
      if (!p.downed && typeof d.x === "number" && Math.hypot(d.x - p.x, d.y - p.y) < 160) {
        p.x = d.x;
        p.y = d.y;
      }
    } else if (d.t === "pick") g.pickCard(mem.id, d.card);
  }
  dropMember(peer) {
    const i = this.members.findIndex((x) => x.peer === peer);
    if (i < 0) return;
    const mem = this.members[i];
    this.members.splice(i, 1);
    UI.toast(`${mem.name} 离开了`);
    if (!this.started) {
      this.t.send(null, this.lobbyMsg());
      this.showRoom();
    } else {
      const g = this.app.game;
      if (g) {
        const k = g.players.findIndex((p) => p.id === mem.id);
        if (k >= 0) g.players.splice(k, 1);
        delete g.cardOffers[mem.id];
        if (g.phase === "cards" && !Object.keys(g.cardOffers).length) g.openPortal();
      }
    }
  }
  /** host: change the room's mode options (map / rule) */
  setOpt(o) {
    if (!this.isHost || this.started) return;
    this.opt = { ...this.opt, ...o };
    this.t && this.t.send(null, this.lobbyMsg());
    this.showRoom();
  }
  setChar(cid) {
    if (this.isHost) {
      this.members[0].cid = cid;
      this.members[0].kit = makeKit(cid);
      this.t && this.t.send(null, this.lobbyMsg());
      this.showRoom();
    } else {
      this.t && this.t.send("host", { t: "cid", cid, kit: makeKit(cid) });
      const me = this.members.find((x) => x.id === this.myId);
      if (me) me.cid = cid;
      this.showRoom();
    }
  }
  start() {
    if (!this.isHost) return;
    if (this.pvp && this.members.length < 2) return UI.toast("竞技场需要至少 2 名玩家");
    this.started = true;
    const seed = (Math.random() * 1e9) | 0;
    const players = this.members.map(({ id, name, cid, kit }) => ({ id, name, cid, kit }));
    this.t.send(null, { t: "start", seed, pvp: this.pvp, opt: this.opt, players });
    this.app.beginLoading({ mode: "host", pvp: this.pvp, seed, players, myId: 1, opt: this.opt });
  }
  hostTick(dt) {
    const g = this.app.game;
    if (!g) return;
    this.snapT -= dt;
    if (this.snapT > 0) return;
    this.snapT = 1 / 20;
    this.t.send(null, snapshot(g));
    g.events.length = 0;
  }

  // ---------------- client
  async join(code) {
    this.isHost = false;
    this.code = code;
    this.status = "正在连接房间 " + code + " …";
    UI.showMsg("连接中", this.status, "取消", () => this.app.leaveNet());
    this.t = makeTransport(code, false);
    this.t.onmsg = (from, d) => this.onClientMsg(d);
    this.t.onleave = () => {
      if (this.closed) return;
      UI.showMsg("连接断开", "与房主的连接已断开。", "返回大厅", () => this.app.toLobby());
    };
    this.t.onerror = (e) => UI.showMsg("无法加入", e, "返回", () => this.app.leaveNet());
    const m = load();
    this.t.onopen = () => this.t.send("host", { t: "hello", name: m.name, cid: m.sel, kit: makeKit(m.sel) });
    try {
      await this.t.open();
      this.joinTimer = setTimeout(() => {
        if (!this.myId) UI.showMsg("无法加入", "房间没有响应：检查房间码，或让房主重新创建房间。", "返回", () => this.app.leaveNet());
      }, 8000);
    } catch (e) {
      UI.showMsg("无法加入", e.message || String(e), "返回", () => this.app.leaveNet());
    }
  }
  send(d) {
    this.t && this.t.send(this.isHost ? null : "host", d);
  }
  onClientMsg(d) {
    if (!d || !d.t) return;
    switch (d.t) {
      case "welcome":
        this.myId = d.id;
        clearTimeout(this.joinTimer);
        break;
      case "full":
        UI.showMsg("无法加入", d.started ? "这局已经开始了" : "房间已满（最多4人）", "返回", () => this.app.leaveNet());
        break;
      case "lobby":
        this.members = d.players;
        this.pvp = d.pvp;
        this.opt = d.opt || {};
        this.status = "已加入房间";
        if (!this.started) this.showRoom();
        break;
      case "start":
        this.started = true;
        this.app.beginLoading({ mode: "client", pvp: d.pvp, seed: d.seed, players: d.players, myId: this.myId, opt: d.opt || {} });
        break;
      case "s":
        applySnapshot(this.app, d);
        break;
    }
  }
  clientTick(dt) {
    const g = this.app.game, me = this.app.me;
    if (!g || !me) return;
    const i = me.input;
    if (i.skill) {
      this.edges.sk = true;
      this.edges.cs = i.castAim.skill;
      i.skill = false;
      // Grok's skill is a dash: predict it locally so the client moves exactly once
      if (me.cid === "grok" && (me.skillCdFrac ?? 0) <= 0 && !(me.skillLocal > 0)) {
        let dx = i.mx, dy = i.my;
        if (Math.hypot(dx, dy) < 0.1) (dx = Math.cos(me.face)), (dy = Math.sin(me.face));
        const l = Math.hypot(dx, dy) || 1;
        me.dashDx = dx / l;
        me.dashDy = dy / l;
        me.dashT = 0.2;
        me.skillLocal = 1;
      }
    }
    me.skillLocal = (me.skillLocal || 0) - dt;
    if (i.ult) (this.edges.ul = true), (this.edges.cu = i.castAim.ult), (i.ult = false);
    if (i.dash) {
      this.edges.da = true;
      // predict the dash locally
      if (me.dashCdLocal == null || me.dashCdLocal <= 0) {
        let dx = i.mx, dy = i.my;
        if (Math.hypot(dx, dy) < 0.1) (dx = Math.cos(me.face)), (dy = Math.sin(me.face));
        const l = Math.hypot(dx, dy) || 1;
        me.dashDx = dx / l;
        me.dashDy = dy / l;
        me.dashT = 0.17;
        me.dashCdLocal = 1.6;
        me.lastDash = g.time;
        sfx("dash");
      }
      i.dash = false;
    }
    me.dashCdLocal = (me.dashCdLocal || 0) - dt;
    this.inT -= dt;
    if (this.inT <= 0) {
      this.inT = 1 / 30;
      this.send({ t: "in", mx: round2(i.mx), my: round2(i.my), atk: i.atk, aim: i.aim == null ? null : round2(i.aim), sk: this.edges.sk, ul: this.edges.ul, da: this.edges.da, cs: this.edges.cs ?? null, cu: this.edges.cu ?? null, x: Math.round(me.x), y: Math.round(me.y) });
      this.edges = { sk: false, ul: false, da: false };
    }
    clientUpdate(g, me, dt);
  }
  close() {
    this.closed = true;
    clearTimeout(this.joinTimer);
    try {
      this.t && this.t.close();
    } catch {}
  }
}
const round2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- snapshots
const r1 = (v) => Math.round(v);
function snapshot(g) {
  const P = g.players.map((p) => {
    const fl = (p.moving ? 1 : 0) | (p.downed ? 2 : 0) | (p.dashT > 0 ? 4 : 0) | (p.hurtT > 0 ? 8 : 0) | (p.castT > 0 ? 16 : 0) | (p.input.atk ? 32 : 0);
    const bf = {};
    for (const k in p.buff) if (p.buff[k] > 0) bf[k] = Math.round(p.buff[k] * 10) / 10;
    return [p.id, r1(p.x), r1(p.y), round2(p.face), p.hp, p.maxHp, p.shield, p.maxShield, fl, Math.round(p.ult * 100), p.coins, p.cubes, Math.round(p.recoil), Math.round((Math.max(0, p.skillCd) / (CHARS[p.cid].skill.cd * p.st.cd)) * 100), Math.round((Math.max(0, p.dashCd) / 1.6) * 100), bf, p.target ? p.target.id : 0, p.cards, p.infuseElem || null, round2(p.reviveT), round2(p.respawnT || 0), p.barrier > 0 ? 1 : 0, p.st, p.fusions];
  });
  const E = g.enemies.map((e) => [e.id, e.type, r1(e.x), r1(e.y), Math.ceil(e.hp), Math.ceil(e.maxHp), (e.elite ? 1 : 0) | (e.flash > 0 ? 4 : 0) | (e.freezeT > 0 ? 8 : 0) | (e.slowT > 0 ? 16 : 0) | (e.burnT > 0 ? 32 : 0), e.st, r1(e.z || 0), e.face, Object.keys(e.marks).filter((k) => e.marks[k] > g.time).join(","), e.lx != null ? r1(e.lx) : null, e.ly != null ? r1(e.ly) : null, round2(Math.max(0, e.spawnT)), round2(e.cd), e.bubble > g.time ? 1 : 0]);
  const B = g.bullets.map((b) => [b.id, b.side === "e" ? 1 : 0, b.kind, r1(b.x), r1(b.y), r1(b.vx), r1(b.vy), b.r, b.elem || 0, b.big ? 1 : 0, b.wave ? 1 : 0, b.arcTo ? [r1(b.arcTo.x0), r1(b.arcTo.y0), r1(b.arcTo.x), r1(b.arcTo.y), b.arcTo.dur, round2(b.t)] : 0, r1(b.h || 0), b.owner || 0, b.atk ? 1 : 0]);
  const Z = g.zones.map((z) => [z.id, z.kind, r1(z.x), r1(z.y), z.r, round2(z.life), round2(z.t)]);
  const Q = g.pickups.map((q) => [q.id, q.kind, q.item || 0, r1(q.x), r1(q.y), r1(q.z || 0), round2(q.t), round2(q.life)]);
  return {
    t: "s", tm: round2(g.time), ph: g.phase, ri: g.roomIdx, P, E, B, Z, Q, ev: g.events.slice(),
    ch: g.chest ? [r1(g.chest.x), r1(g.chest.y), g.chest.opened ? 1 : 0] : 0,
    po: g.portal ? [r1(g.portal.x), r1(g.portal.y)] : 0,
    sh: g.shop ? g.shop.map((s) => s.price) : 0,
    bn: g.banner ? [g.banner.text, g.banner.sub, round2(g.banner.t)] : 0,
    sc: g.pvpScore, su: g.spikeUp || 0, cf: Object.keys(g.cardOffers).map(Number), rs: g.runStats,
  };
}
function applySnapshot(app, s) {
  const g = app.game, me = app.me;
  if (!g) return;
  // room change first
  for (const ev of s.ev) if (ev.t === "room") {
    g.seed = ev.seed;
    g.roomIdx = ev.idx;
    g.loadRoom(ev.idx, g.pvp ? { kind: "combat", waves: [], items: 0 } : g.roomDef(ev.idx));
    g.onUi("room");
  }
  if (!s.ev.some((e) => e.t === "room") && s.ri >= 0 && (g.roomIdx !== s.ri || !g.map)) {
    // joined late / missed the room event: build the room from the shared seed
    g.roomIdx = s.ri;
    g.loadRoom(s.ri, g.pvp ? { kind: "combat", waves: [], items: 0 } : g.roomDef(s.ri));
    g.onUi("room");
  }
  if (!g.map) return;
  g.phase = s.ph;
  g.serverTime = s.tm;
  // players
  for (const a of s.P) {
    const p = g.player(a[0]);
    if (!p) continue;
    const [, x, y, face, hp, maxHp, sh, maxSh, fl, ult, coins, cubes, rec, skf, dkf, bf, tid, cards, inf, rv, rsp, bar, st, fus] = a;
    p.hp = hp; p.maxHp = maxHp; p.shield = sh; p.maxShield = maxSh; p.ult = ult / 100; p.coins = coins; p.cubes = cubes;
    if (st) p.st = st;
    if (fus) p.fusions = fus;
    p.skillCdFrac = skf / 100; p.dashCdFrac = dkf / 100; p.buff = bf; p.cards = cards; p.infuseElem = inf; p.reviveT = rv; p.respawnT = rsp; p.barrier = bar;
    const wasDowned = p.downed;
    p.downed = !!(fl & 2);
    if ((fl & 8) && !(p.hurtT > 0)) p.hurtT = 0.3;
    p.targetId = tid;
    if (p === me) {
      // own position is client-authoritative; only accept the host's on respawn/teleport, never mid-dash
      const far = Math.hypot(p.x - x, p.y - y) > 200 && !(p.dashT > 0) && !(p.lastDash > g.time - 0.6);
      if (p.downed || wasDowned !== p.downed || far) (p.x = x), (p.y = y);
      // facing and recoil of the local girl are predicted locally (taking the host's would make her flicker)
    } else {
      p.tx = x; p.ty = y; p.face = face; p.moving = !!(fl & 1); p.recoil = rec;
      if (fl & 4) p.dashT = 0.1;
      p.castT = fl & 16 ? 0.2 : 0;
      p.input.atk = !!(fl & 32);
      if (p.tx != null && Math.hypot(p.x - x, p.y - y) > 120) (p.x = x), (p.y = y);
    }
  }
  // enemies
  const old = new Map(g.enemies.map((e) => [e.id, e]));
  g.enemies = s.E.map((a) => {
    let e = old.get(a[0]);
    const def = ENEMIES[a[1]];
    if (!e && g.seen) g.seen[a[1]] = 1; // 怪物图鉴: clients record what they met too
    if (!e) e = { id: a[0], kind: "enemy", type: a[1], def, x: a[2], y: a[3], anim: Math.random() * 3, marks: {}, r: def.r * (a[6] & 1 ? 1.2 : 1) * (def.scale || 1), boss: !!def.boss, z: 0, flash: 0 };
    e.tx = a[2]; e.ty = a[3]; e.hp = a[4]; e.maxHp = a[5]; e.elite = !!(a[6] & 1); e.flash = a[6] & 4 ? 0.1 : e.flash;
    e.freezeT = a[6] & 8 ? 1 : 0; e.slowT = a[6] & 16 ? 1 : 0; e.burnT = a[6] & 32 ? 1 : 0; e.st = a[7]; e.z = a[8]; e.face = a[9];
    e.marks = {};
    if (a[10]) for (const k of a[10].split(",")) e.marks[k] = g.time + 1;
    e.lx = a[11]; e.ly = a[12]; e.spawnT = a[13]; e.cd = a[14]; e.bubble = a[15] ? g.time + 1 : 0;
    return e;
  });
  for (const p of g.players) p.target = p.targetId ? g.enemies.find((e) => e.id === p.targetId) || g.players.find((q) => q.id === p.targetId) || null : null;
  // bullets: keep the client-simulated ones (no snapping back by the latency), drop the host's copies of
  // our own attack shots (we draw predicted ones from where we really are), add new ones
  const oldB = new Map(g.bullets.filter((b) => !b.pred).map((b) => [b.id, b]));
  const nb = g.bullets.filter((b) => b.pred);
  for (const a of s.B) {
    if (!a[1] && a[13] === me.id && a[14]) continue;
    let b = oldB.get(a[0]);
    if (b) {
      if (!b.arcTo && Math.hypot(b.x - a[3], b.y - a[4]) > 36) (b.x = a[3]), (b.y = a[4]);
      b.vx = a[5];
      b.vy = a[6];
      nb.push(b);
      continue;
    }
    b = { id: a[0], side: a[1] ? "e" : "p", kind: a[2], x: a[3], y: a[4], vx: a[5], vy: a[6], r: a[7], elem: a[8] || null, big: !!a[9], wave: !!a[10], h: a[12] || 0, t: 0.05, life: 2, hits: new Set(), owner: a[13] };
    if (a[11]) (b.arcTo = { x0: a[11][0], y0: a[11][1], x: a[11][2], y: a[11][3], dur: a[11][4] }), (b.t = a[11][5]);
    nb.push(b);
  }
  g.bullets = nb;
  g.zones = s.Z.map((a) => ({ id: a[0], kind: a[1], x: a[2], y: a[3], r: a[4], life: a[5], t: a[6] }));
  g.pickups = s.Q.map((a) => ({ id: a[0], kind: a[1], item: a[2] || undefined, x: a[3], y: a[4], z: a[5], t: a[6], life: a[7], vx: 0, vy: 0, vz: 0 }));
  g.chest = s.ch ? { x: s.ch[0], y: s.ch[1], opened: !!s.ch[2] } : null;
  g.portal = s.po ? { x: s.po[0], y: s.po[1], t: 1 } : null;
  if (s.sh && g.shop) s.sh.forEach((pr, i) => g.shop[i] && (g.shop[i].price = pr));
  g.banner = s.bn ? { text: s.bn[0], sub: s.bn[1], t: s.bn[2] } : null;
  g.pvpScore = s.sc || {};
  g.spikeUp = s.su;
  g.runStats = s.rs || g.runStats;
  // events
  for (const ev of s.ev) {
    switch (ev.t) {
      case "fx": {
        const o = { ...ev.o };
        if (o.followId) o.follow = g.player(o.followId) || g.enemies.find((e) => e.id === o.followId);
        g.fx.spawn(ev.id, ev.x, ev.y, o);
        break;
      }
      case "snd": if (!ev.n.startsWith("shoot_")) sfx(ev.n); break; // our own shots are predicted locally
      case "txt": g.floaters.push({ x: ev.x, y: ev.y, s: ev.s, color: ev.c, size: ev.z, life: 0.8, max: 0.8, vy: -38 }); break;
      case "ln": g.lines.push({ x0: ev.a[0], y0: ev.a[1], x1: ev.a[2], y1: ev.a[3], color: ev.c, w: ev.w, life: ev.l, max: ev.l, kind: ev.k }); break;
      case "tile": if (g.map.crates[ev.i]) (g.map.crates[ev.i].dead = true), (g.map.t[ev.i] = 0); break;
      case "cards": if (ev.pid === me.id) { g.cardOffers[ev.pid] = ev.ids; g.onUi("cards", ev.pid); } break;
      case "over": g.phase = "over"; setTimeout(() => g.onUi("over"), 1200); break;
      case "win": g.onUi("win"); break;
      case "pvpwin": g.pvpWinner = ev.id; g.onUi("pvpwin"); break;
    }
  }
  if (s.ev.some((e) => e.t === "room")) return;
}
/** the client fires its own (visual) shots immediately from where it really is: same timing rules as the host */
function predictAttack(g, me, dt) {
  const c = CHARS[me.cid], inp = me.input;
  me.atkCdP = (me.atkCdP || 0) - dt;
  me.castT = (me.castT || 0) - dt;
  const tgt = inp.aim == null ? g.findTarget(me) : null;
  me.target = tgt;
  const aim = inp.aim != null ? inp.aim : tgt ? angTo(me.x, me.y - 18, tgt.x, tgt.y - (tgt.r || 12)) : null;
  if (aim != null && (inp.atk || me.castT > 0)) me.face = aim;
  else if (me.moving) me.face = Math.atan2(inp.my, inp.mx);
  if (!inp.atk) {
    me.idleP = (me.idleP || 0) + dt;
    if (me.idleP > 0.5) me.rampP = 0;
    return;
  }
  me.idleP = 0;
  if (me.cid === "grok") me.rampP = Math.min(2, (me.rampP || 0) + dt);
  if (me.atkCdP > 0) return;
  const n0 = g.bullets.length;
  fireAttack(g, me, aim ?? me.face, inp.aim == null ? tgt : null);
  for (let i = n0; i < g.bullets.length; i++) g.bullets[i].pred = true;
  me.recoil = 2;
  me.castT = 0.25;
  let rate = c.atk.rate * (me.st?.rate || 1);
  if (me.buff?.rage > 0) rate *= 1.6;
  if (me.cid === "grok") rate *= 1 + c.atk.ramp * ((me.rampP || 0) / 2);
  if (me.cid === "grok" && me.buff?.ultOn > 0) rate *= 1.6;
  me.atkCdP = 1 / rate;
}
/** client-side frame: local movement prediction, interpolation of everything else */
function clientUpdate(g, me, dt) {
  g.time += dt;
  if (g.banner) g.banner.t -= dt;
  g.shake = Math.max(0, g.shake - dt * 30);
  for (const f of g.floaters) (f.life -= dt), (f.y += f.vy * dt), (f.vy *= 0.92);
  g.floaters = g.floaters.filter((f) => f.life > 0);
  for (const l of g.lines) l.life -= dt;
  g.lines = g.lines.filter((l) => l.life > 0);
  if (!g.map) return;
  // local player: predicted movement
  if (!me.downed) {
    const save = me.input.dash;
    me.input.dash = false;
    g.updatePlayer(me, dt);
    me.input.dash = save;
    predictAttack(g, me, dt);
  }
  if (me.hurtT > 0) me.hurtT -= dt;
  const k = Math.min(1, dt * 14);
  for (const p of g.players) {
    if (p === me) continue;
    p.animT += dt;
    if (p.tx != null) (p.x += (p.tx - p.x) * k), (p.y += (p.ty - p.y) * k);
    if (p.hurtT > 0) p.hurtT -= dt;
    p.recoil = Math.max(0, p.recoil - dt * 30);
  }
  for (const e of g.enemies) {
    e.anim += dt;
    e.flash -= dt;
    if (e.tx != null) (e.x += (e.tx - e.x) * k), (e.y += (e.ty - e.y) * k);
  }
  g.updateBullets(dt);
  for (const z of g.zones) (z.t += dt), (z.life -= dt);
  for (const q of g.pickups) q.t += dt;
}

/** a kit received from another player: only known talents, sane levels */
function cleanKit(k) {
  const out = { tal: {}, eq: {}, cards: [] };
  if (!k || typeof k !== "object") return out;
  for (const it of GACHA.pool) {
    const lv = Math.max(0, Math.min(it.max, Math.floor(+((it.eq ? k.eq : k.tal) || {})[it.id] || 0)));
    if (lv) (it.eq ? out.eq : out.tal)[it.id] = lv;
  }
  out.core = k.core ? 1 : 0;
  if (Object.keys(out.eq).length > LOADOUT_SLOTS) out.eq = {};
  out.cards = Array.isArray(k.cards) ? k.cards.filter((c) => typeof c === "string").slice(0, 40) : [];
  return out;
}
