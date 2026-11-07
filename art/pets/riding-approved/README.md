# 用户确认的完整骑乘底图

fox/source-six.png 为2026-11-07用户确认的六角色灵狐骑乘原图，逐字节保存。sources.json记录输入哈希和两行三列角色映射；每格原始裁片独立保留。仅终极形态使用这些合成图。

每位角色的 native.png / unzoom.json 仅保留旧处理的诊断输出，旧接口把原 alpha 铺成白底，不再用于准备输入。native-transparent.png 直接从用户原RGBA最近邻采样到128，reference-256.png 保留该alpha并按统一比例放置。PixelLab V3制作 idle/move/cast 三条纯身体动作，不烘焙雷电或场地特效。原始256px帧保留，统一固定变换转160px运行帧，不逐帧拉伸身体。

用户指出循环某帧白色碎边后，确认旧去白仅移除了背景和游离碎片，仍有白底混色像素连接在轮廓上。18段的首尾帧直接由原RGBA重建，不再按白色抠图；该次修复保持126个中间动作帧不变。随后用户指出大肥鱼头顶空隙闪白，追加仅该角色发圈内的透明度修正：相对9ed07c9，109个中间帧仍逐字节相同，17帧只移除已复查发丝间隙内的浅色填充，发饰、身体和其他角色不变。源图及提供方原始条带始终不改。validate_mounts.py 增加中性白色轮廓检查，test/pet-mount-alpha.py 使用9ed07c9作为可复现的旧问题对照，另检查三段已知填白位置与发饰保护。新增输入不再请求unzoom。

返修记录在每段 *-job.json 的 normalization：移除游离小碎片、格洛克施法头顶白色表情，以及克劳德施法误加的白色标记。克劳德的处理仅限定已查看的两帧、头顶指定区域与白色像素，不重画头发/人物。规范化后右侧鬃毛之外的少量游离残点单独复查移除，记录运行帧坐标规则和像素数。完整帧表与 asset-check.json 保留复查依据。

mounted-preview.png 是六角色待机、行走、施法的真彩APNG，按整数2倍展示，不使用GIF调色板降色；实际局内效果见 approved-v1/gameplay-preview.mp4。

复现顺序：animate_mounts.py prepare/animate → normalize_mounts.py → animate_mounts.py pack → validate_mounts.py → 人工逐帧查看 → animate_mounts.py publish。每段已有任务ID可恢复，不盲目重复提交。密钥只从 PIXELLAB_KEY_FILE 读取，所有临时文件和缓存均在项目内。

火龙、冰凰的新骑乘参考由用户后续提供，不在本目录伪造替代稿。当前游戏仍可用原已修正的远腿/坐骑/近腿分层坐姿试用这两只。
