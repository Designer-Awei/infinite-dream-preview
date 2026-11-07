# 宠物原图与动作样片

用户于2026-11-07指定三张进化底图。旧候选已清理；当前目录保留这三套造型的输入、动作、图集与预览。

- `sources/`：未改动的三张原始透明PNG；`sources.json`记录来源SHA-256、裁切坐标、比例和发射点初值。
- `dragon-1..3`、`fox-1..3`、`phoenix-1..3`：原始裁片、标准参考、96px基础帧、待机/施法序列与192px帧序列。`*-job.json`记录去除凭据与图片编码的请求和任务ID；`*-result.json`记录帧数、用量、尺寸和SHA-256。
- `pets.png` / `pets.json`：96×96统一帧格图集、基础帧、待机与施法片段、基准点；不包含烘焙的远程/场地技能。
- `preview.html`：可直接打开的离线交互样片；`preview-effects.js`实时绘制龙息、雷电、暴风雪；`preview-data.js`为离线清单镜像。
- `evolution-overview.png`：九个基础形态；`idle-preview.gif`：终阶待机近看；`idle-review.png` / `cast-review.png`：逐帧审查；`skill-preview.mp4`：真实浏览器录制。
- `asset-check.json` / `preview-check.json` / `QUALITY_NOTES.md`：资源检查、浏览器检查和人工返修记录。
- 字体为Cubic 11预览字符子集，许可见`OFL.txt`。

本轮不接入游戏兑换、跟随、伤害、养成或存档，不同步正式版。后续接入时应按实际目标与判定参数调整发射点、距离、持续时长和范围。

## 重建

在仓库根目录使用已有Python（Pillow、NumPy、requests、fontTools、brotli），临时目录指向工作目录`.cache`：

1. `python tools/pixellab/animate_approved_pets.py prepare`从保留的原图恢复裁切与参考。
2. 指定环境变量`PIXELLAB_KEY_FILE`后，运行`python tools/pixellab/animate_approved_pets.py animate --clip idle`或`--clip cast`。复用已完成资源与任务，可用`--only dragon-1`定位返修。
3. `python tools/pixellab/animate_approved_pets.py pack`。
4. `python tools/pixellab/build_pet_preview.py`，字体源位于工作目录`.cache/Cubic_11.ttf`。
5. `python tools/pixellab/validate_pet_assets.py`。
6. 在仓库根目录启动仅本机HTTP服务到8776，指定已有`FFMPEG`可执行文件路径，再运行`node tools/pixellab/capture_pet_preview.mjs`。浏览器临时配置只写工作目录`.cache`。

预览本身不依赖开发环境包，不访问网络、账号或游戏存档。

派生裁片去除透明度不超过8/255的背景残点，原图保持逐字节一致。部分早期动作在不改变造型的情况下统一了缩放与落脚位置，详情记录于对应`*-result.json`的`normalization`字段；循环起止帧采用批准底图，切换过程仍需通过跳帧检查。失败任务与中间评审图已移出当前目录。
