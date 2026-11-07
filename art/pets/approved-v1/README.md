# 宠物原图、动作与可玩实现素材

三张用户底图逐字节保存在 sources，九种形态统一用于预览版实际战斗。旧失败候选归档到项目 context，不混入运行图集。

- sources.json：原图 SHA-256、裁切、比例与口部初值；reference-192.png 为标准姿态，终极火龙/冰凰另保留 PixelLab 姿态修正任务。
- 各形态目录：base.png、idle/move/cast.png 及对应 256px 原始提供方帧；*-job.json 不含密钥或图片编码，*-result.json 有用量、尺寸、哈希和规范化记录。
- pets.png / pets.json：128px 帧格、九形态、27 段、243 帧。默认锚点 (64,96)，终极火龙为 (64,116)，为大幅翼拍留出头顶空间；世界尺寸不变，不通过缩小人物避免裁切。
- preview.html：离线身体/技能独立检查，可选三阶段、待机、移动、关闭代码效果、调龙息距离与暴风雪范围。preview-data.js 是动作清单镜像。
- idle/move/cast-review.png：完整逐帧图；idle-preview.gif：终极待机近看；skill-preview.mp4：独立动作检查视频；gameplay-preview.mp4：真实游戏模块的跟随、自动技能、骑乘与大招演示（受控测试场景）。
- asset-check.json、preview-check.json、gameplay-check.json 与 QUALITY_NOTES.md：真实检查结果及返修记录。
- web/assets/pets 为游戏用图集和九张裁紧的界面肖像，肖像裁切不影响局内体型。字体为 Cubic 11，许可见 OFL.txt。

身体动作由 PixelLab 制作，远程/场地效果由 web/js/pets.js 实时绘制与判定。预览版已接入兑换、进化、保存、跟随、合作、骑乘与免费试用；正式版未同步。

## 复现与返修

使用已有 Python（Pillow、NumPy、requests、SciPy、fontTools、brotli），所有 TEMP/TMP/TMPDIR/PYTHONPYCACHEPREFIX 指向项目 .cache。不要把 API 密钥放入脚本；PIXELLAB_KEY_FILE 指向本机密钥文件。

1. 正常重建沿用已保存的参考，不重复 prepare（它会重建原始姿态）。需要重置原图时才 prepare，之后复用修正姿态运行 revise_pet_pose.py apply。
2. animate_approved_pets.py animate --clip all 生成/复用待机、移动、施法；--only dragon-1 可限定返修。保留任务 ID，查询中断后恢复，勿盲目重复提交。
3. 逐帧检查多余光效。clean_pet_strays.py 仅处理指定冰凰移动/待机中位于完整身体上方的独立杂点，记录每个区域，不重画身体。粘连光环或身体问题须重做，不能靠此脚本掩盖。
4. normalize_pet_clips.py --only dragon-3 可从保留原始帧恢复终极火龙的完整翼幅；再 animate_approved_pets.py pack。
5. validate_pet_assets.py 通过后才运行 build_pet_preview.py 和 publish_pet_assets.py。幼年火龙翼膜从折叠到展开的面积变化有专门人工复核及躯干稳定性检查，例外记录在结果中。
6. 本机根目录 8776 服务下，设置已有 FFMPEG 路径，运行 capture_pet_preview.mjs；游戏 web 目录 8775 服务下运行 capture_pet_gameplay.mjs。
7. test/pet-gameplay.mjs、test/pet-network.mjs 检查实际玩法及双页面联机；test/pet-glyphs.py 保证新增字符不改旧字形。

离线预览不访问账号或游戏存档。失败研究、旧大图和临时浏览器资料不作为发布资源。