# 无限梦境 · Infinite Dream Preview

本仓库是「无限梦境」的提前测试版本，用于为[正式版](https://github.com/Designer-Awei/infinite-dream)探索新功能、尝试玩法改动并进行测试验证。新功能会先在预览版中试验，根据测试结果调整完善后，再考虑同步到正式版。预览版内容可能随测试发生变化。

像素风地牢肉鸽（元气骑士式闯关 + 荒野乱斗式地图与操作）。六位 AI 娘：DeepSeek 鲸鱼娘、GPT 小龙娘、Grok 娘、Claude 娘、豆包、GLM 娘。
浏览器打开即玩，无需注册；手机横屏支持虚拟摇杆；2~4 人联机合作或竞技场 PVP。

- 操作：电脑 WASD 移动 · J 攻击（范围内自动吸附锁敌）· K 技能 · L 大招 · 空格闪避；手机左侧摇杆 + 右侧技能键（轻点自动瞄准，拖动手动瞄准）。
- 一局 7 个房间：战斗 → 战斗 → 补给站 → 精英战 → 战斗 → 补给站 → 首领【幻觉之眼】。清场开箱三选一技能卡，借用其他 AI 娘的弹幕与技能触发元素反应。
- 局外：晶石扭蛋（永久天赋、稀有卡牌），成就解锁新角色。

## 运行 / 部署

```sh
npm install                                # 安装依赖（含打包工具 esbuild）
cd web && python3 -m http.server 8000      # 开发：直接用 ES 模块运行，打开 http://localhost:8000
./tools/build.sh                           # 打包到 dist/ 和 docs/（静态站点，约 1.4MB）
```

GitHub Pages：仓库 Settings → Pages → Deploy from branch → `main` / `docs`。
联机走 PeerJS（WebRTC 点对点，免费公共信令）；也可以 `?peer=你的域名:端口` 指定自建 PeerServer。`?local` 用 BroadcastChannel 在同一浏览器双开调试。

## 目录

- `web/js`：游戏代码（`game.js` 模拟、`skills.js` 角色技能、`enemies.js` 敌人与首领、`render.js` 渲染、`net.js` 联机、`ui.js` 界面、`data.js` 全部数值）
- `web/pixelfx`：[patch-gg/pixelfx](https://github.com/patch-gg/pixelfx)（MIT）特效库
- `tools/`：角色抠图像素化、怪物序列帧渲染、打包脚本
- `test/`：Playwright 自动试玩（整局机器人、联机双开、手机触屏、性能）
- `DESIGN.md`：元气骑士玩法拆解、框架选择、数值设计

素材：角色形象来自项目素材包 `ai-girls`；字体 Cubic 11（OFL）。

## Preview 仓库

复刻自 [Designer-Awei/infinite-dream](https://github.com/Designer-Awei/infinite-dream)，保留源码、素材、许可和原提交历史。
更新源与原生端分享地址指向本 preview 仓库。

Android 预览包使用每次构建自动生成的调试签名，无需配置签名变量；不同预览版构建之间可能需卸载后重装，卸载会清除该预览版本机存档；预览版与正式版可同时安装。iOS 流程生成未签名 IPA。原仓库的 Releases 安装包与仓库设置不随源码复制。

Android 预览版名称为「无限梦境预览版」，应用 ID 为 `com.designerawei.infinitedream.preview`，可与原版同时安装，存档独立。APK 版本末位是本仓库的构建次数，不与原仓库构建次数对应。
