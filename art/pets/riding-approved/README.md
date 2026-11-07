# 用户确认的完整骑乘底图

fox/source-six.png 为2026-11-07用户确认的六角色灵狐骑乘原图，逐字节保存。sources.json记录输入哈希和两行三列角色映射；每格原始裁片独立保留。仅终极形态使用这些合成图。

每位角色的 native.png 保留 PixelLab /unzoom 输出，reference-256.png 为透明输入。PixelLab V3制作 idle/move/cast 三条纯身体动作，不烘焙雷电或场地特效。原始256px帧保留，统一固定变换转160px运行帧，不逐帧拉伸身体。最早待机输入的白色底残留已从源首帧背景连通区移除；原始提供方输出不覆盖。

返修记录在每段 *-job.json 的 normalization：移除游离小碎片、格洛克施法头顶白色表情，以及克劳德施法误加的白色标记。克劳德的处理仅限定已查看的两帧、头顶指定区域与白色像素，不重画头发/人物。规范化后右侧鬃毛之外的少量游离残点单独复查移除，记录运行帧坐标规则和像素数。完整帧表与 asset-check.json 保留复查依据。

mounted-preview.png 是六角色待机、行走、施法的真彩APNG，按整数2倍展示，不使用GIF调色板降色；实际局内效果见 approved-v1/gameplay-preview.mp4。

复现顺序：animate_mounts.py prepare/animate → normalize_mounts.py → animate_mounts.py pack → validate_mounts.py → 人工逐帧查看 → animate_mounts.py publish。每段已有任务ID可恢复，不盲目重复提交。密钥只从 PIXELLAB_KEY_FILE 读取，所有临时文件和缓存均在项目内。

火龙、冰凰的新骑乘参考由用户后续提供，不在本目录伪造替代稿。当前游戏仍可用原已修正的远腿/坐骑/近腿分层坐姿试用这两只。
