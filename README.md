# 无限梦境 · Infinite Dream Preview

本仓库是「无限梦境」的提前测试版本，用于为[正式版](https://github.com/Designer-Awei/infinite-dream)探索新功能、尝试玩法改动并进行测试验证。新功能会先在预览版中试验，根据测试结果调整完善后，再考虑同步到正式版。预览版内容可能随测试发生变化。

像素风地牢肉鸽（元气骑士式闯关 + 荒野乱斗式地图与操作）。六位角色：大肥鱼、吉普缇、格洛克、克劳德、奶糖包、吉拉姆。
浏览器打开即玩，无需注册；手机横屏支持虚拟摇杆；2~4 人联机合作或竞技场 PVP。

- 操作：电脑 WASD 移动 · J 攻击（范围内自动吸附锁敌）· K 技能 · L 大招 · 空格闪避；手机左侧摇杆 + 右侧技能键（轻点自动瞄准，拖动手动瞄准）。
- 闯关：三张主线地图（数据草原 / 显存冰原 / 算力熔炉）与无尽回廊。一局 7 个房间：战斗 → 战斗 → 补给站 → 精英战 → 战斗 → 补给站 → 地图首领。清场开箱三选一技能卡，借用其他角色的弹幕与技能触发元素反应。
- 梦境矿场：用铲子下潜挖矿，带回晶石、矿石、星砂；矿场装备升级、梦境工坊（最终减伤、SSR 兑换卡、角色梦核）、每日委托。
- 局外养成：晶石扭蛋（永久天赋，SSR 天赋装配到角色）、角色梦核、怪物图鉴，以及各地图稀有怪物掉落的梦境藏品。

## 结算界面

- 横屏结算保留人物的既定尺寸，不因收获条数变化而缩小；右侧操作按钮固定在面板内。
- 左侧摘要最少一项、最多两项：没有额外收获时显示“本局晶石”；有多项时优先展示首通/解锁/纪录、新藏品、裂隙收获等。
- 超过两项时，第一项缩短，右侧放置同高同风格的“其余 N 项”按钮（无箭头），第二项保持整行；点击可在上拉浮窗中查看完整明细。

## 开发与记录

修复和新功能先在预览版验证，通过后沿用现有 CI/CD 发布。正式版仅在用户明确确认后同步。用户可见行为变化同步维护 README；每次推送前按 AGENTS.md 在 WORK_LOG.md 记录改动、实际提交和真实验证结果。

## 安装

- 网页版：<https://designer-awei.github.io/infinite-dream-preview/>
- Android：[Releases](https://github.com/Designer-Awei/infinite-dream-preview/releases/latest) 中的 `infinite-dream.apk`；安装后启动时自动下载网页更新，只有图标或原生功能变化时才需要重新安装。
- iOS：不再构建和发布安装包，请使用网页版（可添加到主屏幕）。

## 运行 / 部署

```sh
npm install                                # 安装依赖（含打包工具 esbuild）
cd web && python3 -m http.server 8000      # 开发：直接用 ES 模块运行，打开 http://localhost:8000
./tools/build.sh                           # 打包到 dist/ 和 docs/（静态站点，约 6MB）
```

GitHub Pages：仓库 Settings → Pages → Deploy from branch → `main` / `docs`。
联机走 PeerJS（WebRTC 点对点，免费公共信令）；也可以 `?peer=你的域名:端口` 指定自建 PeerServer。`?local` 用 BroadcastChannel 在同一浏览器双开调试。

## 目录

- `web/js`：游戏代码（`game.js` 模拟、`skills.js` 角色技能、`enemies.js` 敌人与首领、`render.js` 渲染、`net.js` 联机、`mine.js` 梦境矿场、`codex.js` 怪物图鉴与藏品、`ui.js` 界面、`data.js` 全部数值）
- `web/pixelfx`：[patch-gg/pixelfx](https://github.com/patch-gg/pixelfx)（MIT）特效库
- `art/`：角色、大厅动画与新怪物的源帧（PixelLab 生成）
- `tools/`：角色抠图像素化、角色 / 大厅 / 怪物动画打包、字体裁剪、打包脚本
- `test/`：Playwright 自动试玩（整局机器人、联机双开、手机触屏、矿场、界面核对、性能）
- `DESIGN.md`：元气骑士玩法拆解、框架选择、数值设计

素材：角色形象来自项目素材包 `ai-girls`，部分角色与怪物动画由 PixelLab 生成；字体 Cubic 11（OFL）。

## Preview 仓库

复刻自 [Designer-Awei/infinite-dream](https://github.com/Designer-Awei/infinite-dream)，保留源码、素材、许可和原提交历史。
更新源与原生端分享地址指向本 preview 仓库。

Android 预览包使用每次构建自动生成的调试签名，无需配置签名变量；不同预览版构建之间可能需卸载后重装，卸载会清除该预览版本机存档；预览版与正式版可同时安装。原仓库的 Releases 安装包与仓库设置不随源码复制。

Android 预览版名称为「无限梦境预览版」，应用 ID 为 `com.designerawei.infinitedream.preview`，可与原版同时安装，存档独立。APK 版本末位是本仓库的构建次数，不与原仓库构建次数对应。
