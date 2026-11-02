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

## 联机同步（预览协议 v2）

联机仍为房主主导的 PeerJS / WebRTC P2P，没有新增战斗中转服务器。预览协议使用独立房间前缀，所有参与者需要更新到当前预览版，不能与正式版或旧版预览协议互联。

- PeerJS 保留可靠有序通道，传输开局、房间基线、换关、选卡、地形变化、结算和技能/冲刺操作；动作编号去重。
- 在同一个 WebRTC 连接上增加独立 RTCDataChannel（无序、零重传），传输 20Hz 状态和 30Hz 移动/攻击输入。通道尚未打开或发送积压时直接跳过实时包，避免旧状态排队，不回退到可靠队列。
- 状态/输入带序号，关卡带 epoch，丢弃迟到、重复和跨关卡数据。关键事件不依赖下一张实时快照到达。
- 自己移动、冲刺和普攻继续本地预测；其他玩家、怪物及普通远端弹丸使用时间戳插值。客户端缓冲随抖动在 70–140ms 之间调整，最多外推 60ms；房主侧队友移动使用 50ms 缓冲。插值以少量显示延迟换取稳定，不会消除物理网络延迟。
- 网络发送节奏独立于打击停顿和慢动作；250ms 收不到新输入时停止远端持续移动输入和攻击。

实现借鉴 [Gaffer On Games 的快照插值方案](https://gafferongames.com/post/snapshot_interpolation/)，通道参数遵循 [RTCDataChannel 接口](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel)，未引入整套游戏网络框架。当前仍使用完整 JSON 状态快照，未实现二进制增量压缩；不同通道仍共享连接带宽，房主性能和网络线路仍会影响体验。

诊断：客户端控制台执行 `__app.net.diagnostics()` 可查看 RTT、到包抖动、插值缓冲、旧包丢弃、序号缺口、发送跳过及发送积压。序号缺口包含丢包和主动跳过，不等于精确链路丢包率。

测试：`npm install` 后运行 `npx playwright install chromium`、`npm run test:net`。测试自动启动本地网页服务器，用双客户端模拟单向 90ms 延迟、±75ms 抖动、15% 实时包丢失，检查关键事件、换关和旧包隔离。可用 `NET_URL` 指向已构建网页、`NET_PEER=host:port` 指定测试 TLS PeerServer 验证真实 WebRTC 双通道；`CHROME_CHANNEL=chrome` 可使用本机 Chrome。
