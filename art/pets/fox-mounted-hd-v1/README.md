# 灵狐六骑手原生256动作

直接采用 riding-approved/fox 六张已确认512px透明原图，重制待机、对角行走、纯身体施法18条。每格原生256，12生成相位加参考端点，共234格，4096×3840；世界比例0.4875保持原大小。GLM行走第1次任务失败，采用第2次；其余第1次。

selected.json、原生raw条带、任务ID、提示词、哈希和参考都保留。透明处理沿用alpha，不按白色删除毛发衣服。仅清理小型脱离碎片，以及逐帧确认的deepseek施法11、doubao施法10/11外放光圈；具体坐标写入任务记录，原始raw保持。普攻电弧由游戏代码生成并持续绑定嘴部。

工具：tools/pixellab/fox_mounts_hd.py cleanup / pack。检查：test/fox-hd-assets.py、pet-new-mounts.mjs、mounted-attack-paths.mjs、pet-network.mjs。
