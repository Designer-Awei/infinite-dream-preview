# 本轮终极骑乘动画

- 火龙：用户提供的 ai-girls-fire-dragon-ride-3x2-v15.png；冰凰：本轮白蓝新底图。source-six.png 保留原文件字节；sources.json 记录来源和哈希。
- 原图为RGBA，背景alpha为0。按整张图六个主体的完整连通轮廓提取后映射角色，不按512格线裁断尾巴，不以白色/颜色去底。上排大肥鱼、格洛克、克劳德，下排吉普缇、奶糖包、吉拉姆。每个-source-clean.png是独立完整主体。
- reference-512.png保存大参考；动画接口实测512请求返回422（见 animation-capability-check.json），实际生成256×256。没有把插值放大称为原生512。
- 每种坐骑6角色、idle/move/cast三种动作。每条12个生成动作样本，加原图起点形成13格；运行时循环12格，保持原周期而提高采样率。原始帧次序不变，不采用反向回摆拼接。
- 每条-selected.json指向选中任务、原始帧与提示词，*-job.json记录供应商ID与使用量，原始raw条完整保留。仅将alpha<=8和<=128像素的离散小杂块清零，保留毛发、羽毛、衣物RGB。
- mounted.png/json为运行图集，asset-check.json与motion-audit.json记录检查。mounted-preview.png为真彩APNG，依次展示待机、移动、施法；另有各动作独立预览与逐帧图。
- 未选中试片与重复派生图已移至项目context/mount-wing-trials-20261108，最终素材目录不混入邻图原始格片。旧已确认灵狐、旧历史版本与用户原图保留。
- 复现：tools/pixellab/animate_riding_v3.py prepare；animate_riding_v4.py animate/select/pack/publish。命令仅操作工作区；认证通过环境变量指定的文件读取，不保存密钥。

- 吉普缇冰凰三条动作曾存在髋部悬空：使用PixelLab edit-animation-v2分组连续帧编辑，将臀部与坐骑背部接触、近侧腿垂下、远侧腿遮挡。*-seat-job.json记录父动画与9组编辑任务；翼拍时序保持原相位。先完成基础select，再运行fix_mounted_seat.py --all / --assemble，最后pack/publish。seat-preview.png展示修正后的完整循环。
