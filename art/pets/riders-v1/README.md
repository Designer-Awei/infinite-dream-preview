# 完整骑乘人物

六位角色原始侧面图从 web/assets/girls.png 提取并校验，PixelLab 生成保留髋部、弯曲双腿、鞋与服饰的完整坐姿，再制作轻微呼吸/平衡/头发随动循环。每位9帧，共54帧；运行帧96px，座位锚点(48,64)。不再用站立图裁掉下半身。

实际绘制分为远侧腿→坐骑→身体与近侧腿三层。每位角色的远腿轮廓由明确的多边形分出；前后两张图集在原位置可逐像素还原完整生成帧，坐骑绘在中间自然遮住远侧脚，不把人物整张压到最前面。远侧层按透视向后偏移(-4,-3)，同一组人物可组合三种坐骑，反向镜像时保持层序。

- 各角色目录：原始source.png、pose-192.png、标准base.png、idle.png和192px提供方原始帧、去除密钥及编码的任务记录。
- riders.png为完整图集；riders-front.png / riders-back.png为实际运行层；riders.json记录坐标、锚点、远腿轮廓、哈希和原图校验。
- rider-review.png是完整人物逐帧检查，rider-check.json验证原角色提取、图集像素、循环、尺寸稳定性、远近层不重叠且可无损重组。
- 克劳德和吉拉姆动作生成过头顶游离标记，仅清理与身体分离的上方碎片，记录清理区域，提供方原始帧保留。完整头部、发饰与坐姿不改。

复现：设置项目内缓存与 PIXELLAB_KEY_FILE，运行 tools/pixellab/create_riders.py pose、idle、clean、pack；然后 validate_riders.py。任务恢复复用已保存ID，返修必须先归档失败片段，不重复提交已完成动作。游戏整体验收见上级approved-v1/QUALITY_NOTES.md及根WORK_LOG。