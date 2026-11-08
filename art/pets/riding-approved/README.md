# 用户确认的完整骑乘底图

fox/source-six.png 为2026-11-07用户确认的六角色灵狐骑乘原图，逐字节保存。sources.json记录输入哈希和两行三列角色映射；每格原始裁片独立保留。仅终极形态使用这些合成图。

每位角色的 native.png / unzoom.json 仅保留旧处理的诊断输出，旧接口把原 alpha 铺成白底，不再用于准备输入。native-transparent.png 直接从用户原RGBA最近邻采样到128，reference-256.png 保留该alpha并按统一比例放置。PixelLab V3制作 idle/move/cast 三条纯身体动作，不烘焙雷电或场地特效。原始256px帧保留，统一固定变换转160px运行帧，不逐帧拉伸身体。

用户指出循环某帧白色碎边后，确认旧去白仅移除了背景和游离碎片，仍有白底混色像素连接在轮廓上。18段的首尾帧直接由原RGBA重建，不再按白色抠图；该次修复保持126个中间动作帧不变。随后用户指出大肥鱼头顶空隙闪白，追加仅该角色发圈内的透明度修正：相对9ed07c9，109个中间帧仍逐字节相同，17帧只移除已复查发丝间隙内的浅色填充，发饰、身体和其他角色不变。源图及提供方原始条带始终不改。validate_mounts.py 增加中性白色轮廓检查，test/pet-mount-alpha.py 使用9ed07c9作为可复现的旧问题对照，另检查三段已知填白位置与发饰保护。新增输入不再请求unzoom。

返修记录在每段 *-job.json 的 normalization：移除游离小碎片、格洛克施法头顶白色表情，以及克劳德施法误加的白色标记。克劳德的处理仅限定已查看的两帧、头顶指定区域与白色像素，不重画头发/人物。规范化后右侧鬃毛之外的少量游离残点单独复查移除，记录运行帧坐标规则和像素数。完整帧表与 asset-check.json 保留复查依据。

mounted-preview.png 是六角色待机、行走、施法的真彩APNG，按整数2倍展示，不使用GIF调色板降色；实际局内效果见 approved-v1/gameplay-preview.mp4。

复现顺序：animate_mounts.py prepare/animate → normalize_mounts.py → animate_mounts.py pack → validate_mounts.py → 人工逐帧查看 → animate_mounts.py publish。每段已有任务ID可恢复，不盲目重复提交。密钥只从 PIXELLAB_KEY_FILE 读取，所有临时文件和缓存均在项目内。

2026-11-08新增火龙与冰凰的用户定稿：dragon/source-six.png 和 phoenix/source-six.png 逐字节保留本次新输入。使用 animate_riding_v2.py：先在整张原图识别六个完整连通主体，再按主体轮廓提取，而不是沿512px分格线硬切。源图火龙尾焰和少数头部越过分格线，已完整保留；每位source.png/source-clean.png是独立完整主体，cell-raw.png仅为原始矩形诊断裁片，不作为生成输入。12个主体的实色像素逐个校验，不混入邻图。

两只各六角色待机/移动/施法共36段324个播放帧格。PixelLab V3负责火龙细致待机/张口身体施法和部分冰凰移动，PixMiniMax负责其余身体动作；全部256px原生生成和运行，不以128/160图放大。待机呼吸/发丝/尾部参与；步行保持四足，翼保持低位。冰凰部分动作只取已复查下拍相位并反向回摆，排除上摆挡脸；奶糖包火龙步态保留四个面部无遮挡的落足相位重复构成两拍，非九个独特姿态。索引和Alpha清理写入所选job文件；只清alpha≤8和不连主体的≤32像素碎片，不按白色扣除。用户原件、所选提供方原始条带不改；本轮弃用试片仅在项目context归档。

原生图集为3072×3584，帧格256×256、锚点(128,232)、世界比例0.45；只在第三阶段骑乘时替换整对人宠，不改跟随和幼年/成长素材。人物不再靠运行时裁半身或重拼遮挡。嘴部逐帧坐标与实际绘制共用相位，龙息/冰锥仍由代码实现。mounted-preview.png为六角色真彩APNG，包含待机、移动、施法，mounted-still.png为首帧。

复现：animate_riding_v2.py prepare → animate（已有任务按记录恢复，不盲目重发）→ 按job中的frame_curation索引curate → pack → validate → 逐帧查看review → preview → publish。validate校验输入/原始条带哈希、原帧选择与Alpha变换、首尾原图相等、无帧格裁切或游离碎片、运动、Atlas逐像素一致与4096边长。不得复用旧normalize_mounts.py的去白/灵狐特定发丝规则处理新图。

灵狐分割复查：六张旧矩形source.png中有邻图碎片，实际native-transparent/reference-256已先提取主体，未进入PixelLab输入。162个运行帧与已审核图集/发布资源逐像素一致，原输入、生成条带和游戏资源保持不变。另提供fox/clean-crops作为不含邻图的完整轮廓裁片；audit_mount_segmentation.py复查原裁片→实际输入→帧→运行图集，并留report.json，不因原裁片诊断残留盲目重做已验收动画。
