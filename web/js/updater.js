// APK hot update ("incremental update" from GitHub):
// The Android app (Capacitor) ships the game files in the APK. On launch it fetches update.json from
// GitHub Pages, compares per-file hashes with the running copy, downloads ONLY the changed files,
// copies the unchanged ones locally, verifies every hash, and switches the WebView to the new folder.
// The new folder is made permanent only after it boots successfully (so a broken update can't brick the app).
import { el } from "./util.js";

const OVERRIDE = (() => {
  try {
    return localStorage.getItem("updRemote"); // test hook
  } catch {
    return null;
  }
})();
const REMOTES = [
  ...(OVERRIDE ? [OVERRIDE] : []),
  "https://designer-awei.github.io/infinite-dream-preview/",
  "https://cdn.jsdelivr.net/gh/Designer-Awei/infinite-dream-preview@main/docs/",
];
const native = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
export let localVersion = "";
/** the installed app shell: { version: "1.<nativeRev>.<build>", rev } (rev 0 = an old APK without the App plugin) */
export const nativeInfo = { version: "", rev: 0 };
const APK_URL = "https://github.com/Designer-Awei/infinite-dream-preview/releases/latest/download/infinite-dream.apk";
const IOS_URL = "https://github.com/Designer-Awei/infinite-dream-preview/releases/tag/ios-latest";

async function sha12(buf) {
  const d = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}
function b64(buf) {
  let s = "";
  const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
async function fetchJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

const dirOf = (v) => "hot/" + String(v).replace(/[^\w.-]/g, "_");
const LS_TRY = "updTry";
function lsGet(k) {
  try {
    return JSON.parse(localStorage.getItem(k) || "null");
  } catch {
    return null;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}
async function readJSONFile(FS, path) {
  try {
    const r = await FS.readFile({ path, directory: "DATA", encoding: "utf8" });
    return JSON.parse(typeof r.data === "string" ? r.data : await r.data.text());
  } catch {
    return null;
  }
}
/** a downloaded folder is usable only if its manifest is there and every file it lists was written */
async function folderOK(FS, dir, version) {
  const man = await readJSONFile(FS, dir + "/update.json");
  if (!man || man.version !== version) return null;
  try {
    for (const f of Object.keys(man.files)) {
      const st = await FS.stat({ path: dir + "/" + f, directory: "DATA" });
      if (st.size != null && +st.size !== man.files[f].s) return null;
    }
  } catch {
    return null;
  }
  return man;
}
async function switchTo(FS, WV, dir, version) {
  // remember the attempt: if this folder never boots (2 tries) we give up on it instead of looping
  const t = lsGet(LS_TRY);
  const n = t && t.v === version ? t.n + 1 : 1;
  lsSet(LS_TRY, { v: version, n });
  const { uri } = await FS.getUri({ path: dir, directory: "DATA" });
  await WV.setServerBasePath({ path: decodeURIComponent(uri.replace(/^file:\/\//, "")).replace(/\/+$/, "") });
}

/** called once at boot */
export async function initUpdater() {
  let man = null;
  try {
    man = await fetchJSON("update.json");
    localVersion = man.version || "";
  } catch {}
  if (!native()) return;
  const P = window.Capacitor.Plugins, FS = P.Filesystem, WV = P.WebView;
  try {
    if (P.App && P.App.getInfo) {
      const info = await P.App.getInfo();
      nativeInfo.version = info.version || "";
      nativeInfo.rev = +(String(info.version || "").split(".")[1] || 0) || 0;
    }
  } catch {}
  // the game files need a newer app shell (new icon / plugins / signing): offer the new installer
  if (man && (man.native || 0) > nativeInfo.rev) setTimeout(() => showNativeUpdate(man.native), 2500);
  if (!FS || !WV) return;
  let current = "";
  try {
    current = ((await WV.getServerBasePath()).path || "").replace(/\/+$/, "");
  } catch {}
  const runningHot = current.includes("/hot/");
  // we booted fine from a downloaded folder: make it permanent (also re-persist every boot, cheap and self-healing)
  if (runningHot) {
    try {
      await WV.persistServerBasePath();
    } catch {}
    lsSet("updApplied", localVersion);
  }
  const t = lsGet(LS_TRY);
  if (t && t.v === localVersion) lsSet(LS_TRY, null);
  // tidy up: keep the folder we're running from and the newest good one, drop the rest
  try {
    const keep = new Set([dirOf(localVersion).slice(4)]);
    const applied = lsGet("updApplied");
    if (applied && applied > localVersion) keep.add(dirOf(applied).slice(4));
    if (runningHot) keep.add(current.slice(current.lastIndexOf("/hot/") + 5).split("/")[0]);
    const list = await FS.readdir({ path: "hot", directory: "DATA" }).catch(() => ({ files: [] }));
    for (const f of list.files || []) {
      const name = typeof f === "string" ? f : f.name;
      if (!keep.has(name)) await FS.rmdir({ path: "hot/" + name, directory: "DATA", recursive: true }).catch(() => {});
    }
  } catch {}
  // booted the bundled copy although a newer, complete folder exists (persist didn't stick): just switch, no download
  if (!runningHot) {
    const applied = lsGet("updApplied");
    if (applied && applied > localVersion && (await folderOK(FS, dirOf(applied), applied))) {
      const tr = lsGet(LS_TRY);
      if (!tr || tr.v !== applied || tr.n < 2) return switchTo(FS, WV, dirOf(applied), applied).catch(() => {});
    }
  }
  setTimeout(() => checkUpdate(FS, WV), 1500);
}

let checking = false;
async function checkUpdate(FS, WV) {
  if (checking) return;
  checking = true;
  let local, remote, base;
  try {
    local = await fetchJSON("update.json");
  } catch {
    return;
  }
  for (const r of REMOTES) {
    try {
      remote = await fetchJSON(r + "update.json?t=" + Date.now());
      base = r;
      break;
    } catch {}
  }
  if (!remote || !remote.version || remote.version <= local.version) return;
  const dir = dirOf(remote.version);
  // already downloaded earlier (e.g. the switch didn't persist): reuse it silently
  if (await folderOK(FS, dir, remote.version)) {
    const tr = lsGet(LS_TRY);
    if (tr && tr.v === remote.version && tr.n >= 2) return; // that folder failed to boot twice; wait for a newer build
    lsSet("updApplied", remote.version);
    return switchTo(FS, WV, dir, remote.version).catch(() => {});
  }
  const names = Object.keys(remote.files);
  const changed = names.filter((f) => !local.files[f] || local.files[f].h !== remote.files[f].h);
  const bytes = changed.reduce((a, f) => a + remote.files[f].s, 0);
  const ui = progressUI(remote.version, changed.length, bytes);
  try {
    let done = 0, got = 0;
    for (const f of names) {
      const isNew = changed.includes(f);
      const want = remote.files[f].h;
      let buf = null;
      // changed files come from GitHub (fallback mirror if the first is stale/unreachable); others from the local copy
      const sources = isNew ? [base, ...REMOTES.filter((r) => r !== base)].map((r) => r + f + "?v=" + want) : [f];
      for (const src of sources) {
        try {
          const r = await fetch(src, { cache: "no-store" });
          if (!r.ok) continue;
          const b = await r.arrayBuffer();
          if ((await sha12(b)) === want) {
            buf = b;
            break;
          }
        } catch {}
      }
      if (!buf) throw new Error("下载失败：" + f);
      await FS.writeFile({ path: dir + "/" + f, data: b64(buf), directory: "DATA", recursive: true });
      done++;
      if (isNew) got += buf.byteLength;
      ui.set(done / names.length, isNew ? got : null);
    }
    // the manifest is written last: its presence marks the folder as complete
    await FS.writeFile({ path: dir + "/update.json", data: JSON.stringify(remote), encoding: "utf8", directory: "DATA", recursive: true });
    lsSet("updApplied", remote.version);
    lsSet(LS_TRY, null);
    ui.done();
    await new Promise((r) => setTimeout(r, 600));
    // switch the WebView to the new folder (reloads the page); it is persisted on the next successful boot
    await switchTo(FS, WV, dir, remote.version);
  } catch (e) {
    ui.fail(e.message || String(e));
    FS.rmdir({ path: dir, directory: "DATA", recursive: true }).catch(() => {});
  }
}

/** "a new installer is available" (things a hot update can't change: icon, app name, native plugins) */
function showNativeUpdate(need) {
  const k = "nativeAsk" + need;
  try {
    const t = +localStorage.getItem(k) || 0;
    if (Date.now() - t < 20 * 3600 * 1000) return; // asked in the last day
  } catch {}
  if (document.querySelector(".nat-modal")) return;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const firstSigned = nativeInfo.rev < 3 && !ios; // APKs before rev 3 were signed with a throw-away key
  const md = el("div", "modal nat-modal");
  md.innerHTML = `<div class="panel save-panel"><h2 class="outline">有新的安装包</h2>
    <div class="muted o1">${firstSigned
      ? `这次安装包更换了<b>固定签名</b>（新图标与以后的覆盖安装都靠它）。旧版需要卸载一次才能装上，<b style="color:#ffe36a">请按顺序操作，存档不会丢：</b><br>
         ① 点「导出存档」并复制保存 → ② 点「下载安装包」→ ③ 卸载旧版，安装新版 → ④ 打开后在「设置 → 导入存档」粘贴。<br>以后的新安装包都可以直接覆盖安装，数据自动保留。`
      : ios
        ? `新的 iOS 安装包包含图标/原生功能更新。用 AltStore / Sideloadly 以同一个 Apple ID 覆盖安装即可保留数据。`
        : `新的安装包包含图标/原生功能更新。下载后直接覆盖安装，<b style="color:#ffe36a">存档会自动保留</b>。`}</div>
    <div class="row acts"></div></div>`;
  const acts = md.querySelector(".acts");
  const later = () => {
    try {
      localStorage.setItem(k, Date.now());
    } catch {}
    md.remove();
  };
  if (firstSigned) acts.appendChild(btnEl("导出存档", "blue", async () => (await import("./lobby.js")).showSaveExport()));
  acts.appendChild(btnEl(ios ? "打开下载页" : "下载安装包", "", () => {
    // leaving the app's origin hands the URL to the system browser, which downloads the APK
    location.href = ios ? IOS_URL : APK_URL;
  }));
  acts.appendChild(btnEl("稍后", "gray small", later));
  document.getElementById("ui").appendChild(md);
}
function btnEl(label, cls, fn) {
  const b = el("button", "btn " + cls, label);
  b.onclick = fn;
  return b;
}

function progressUI(version, n, bytes) {
  const md = el("div", "modal upd-modal");
  md.innerHTML = `<div class="panel" style="min-width:320px;text-align:center"><h2 class="outline">发现新版本</h2>
    <div class="muted" style="color:#fff">增量更新 ${n} 个文件 · ${(bytes / 1024).toFixed(0)} KB<br><small>${version}</small></div>
    <div class="ld-bar" style="width:100%;margin:12px 0 6px"><i></i></div><div class="muted upd-t">准备中…</div></div>`;
  document.getElementById("ui").appendChild(md);
  const bar = md.querySelector(".ld-bar i"), t = md.querySelector(".upd-t");
  return {
    set(p, got) {
      bar.style.width = Math.round(p * 100) + "%";
      if (got != null) t.textContent = `已下载 ${(got / 1024).toFixed(0)} / ${(bytes / 1024).toFixed(0)} KB`;
    },
    done() {
      bar.style.width = "100%";
      t.textContent = "更新完成，正在重启…";
    },
    fail(msg) {
      t.textContent = "更新失败，下次启动再试（" + msg + "）";
      setTimeout(() => md.remove(), 2500);
    },
  };
}
