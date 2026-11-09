# 开发与发布规则

- 所有项目产物保存在 E:/Rouge-Game 内，子进程 TEMP/TMP/TMPDIR 与缓存指向项目 .cache。
- 修复与新功能先在预览仓验证，只改用户指定范围；正式仓同步、推送或发布必须有用户当前明确确认。
- 保留两个仓库各自身份、更新源、原生版本、签名和现有 CI/CD，不整仓覆盖。
- 玩法和设计说明放在 docs/references/，约束和维护规则放在 docs/rules/。根目录仅留必要入口、配置和 worklog.jsonl。
- 每个独立变更写入根目录 worklog.jsonl，必须标明 worker。新记录使用短问题描述、短修复方案和真实验证摘要；详细过程引用文件或实际 commit。
- 日志新增使用tools/worklog.py --append，更新使用--get取得revision后--update；默认先--dry-run。Agent不直接整文件重写JSONL。写入函数只提交数据，不自动git提交或推送。
- 先提交实际改动，再将已经生成的 commit ID 和验证写入 JSONL，提交日志后一起推送。纯日志提交不另记自身，避免自引用；不改写已引用提交。
- 工作日志不再使用 WORK_LOG.md。旧文档在 docs/references/history/ 只读归档，不继续追加，不删除原始历史。
- 写入后运行 python tools/worklog.py --validate；按需补充专项验证。推送后即可结束，不必等待 CI/CD，也不能把已推送或构建通过写成发布成功。
- 历史条目反映当时记录，不自动表示当前仍采用。明确撤回或替代时使用 status 与 superseded_by，保留旧条目。
